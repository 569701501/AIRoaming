import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AIRuntimeModelSelection,
  DialogueAttachmentInput,
  DialogueMessageItem,
  DialogueStreamEvent,
  DialogueThread,
  DialogueToolResult,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { getChapterScriptForbiddenOutputPrompt } from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";
import { StoryStructureDialogueService } from "./story-structure-dialogue.service.js";
import { StoryboardDialogueService } from "./storyboard-dialogue.service.js";
import { shouldOrganizeProvidedScript } from "./dialogue-intent.util.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
} from "./dialogue-types.js";

const STEP_LABELS: Record<string, string> = {
  project_story: "剧本",
  project_characters: "项目角色库",
  story_structure: "剧情结构",
  storyboard: "分镜工作台",
  image_preflight: "出图准备",
  image_candidates: "候选图工作台",
  layout_export: "排版导出",
  asset_package: "素材包",
};

@Injectable()
export class DialogueService {
  private readonly threads = new Map<string, LocalDialogueThread>();
  private readonly activeStreamingAssistantMessageIds = new Set<string>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
    @Inject(ScriptDialogueService) private readonly scriptDialogue: ScriptDialogueService,
    @Inject(StoryStructureDialogueService) private readonly storyStructureDialogue: StoryStructureDialogueService,
    @Inject(StoryboardDialogueService) private readonly storyboardDialogue: StoryboardDialogueService,
  ) {
    this.projectsService.onProjectDeleted((projectId) => this.deleteProjectRuntimeState(projectId));
    this.scriptDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.storyStructureDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
    this.storyboardDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
  }

  async getProjectThread(projectId: string, stepKey: string, chapterId?: string | null): Promise<DialogueThread> {
    await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const normalizedStepKey = this.normalizeStepKey(stepKey);
    const thread = this.getOrCreateThread(projectId, normalizedStepKey, chapterId ?? null);
    this.settleInactiveRunningMessages(thread);
    return this.toThreadDto(thread);
  }

  async sendMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<SendDialogueMessageResponse> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    const toolResults = await this.tryHandleScriptTools(turn, input);

    if (toolResults.length > 0) {
      this.recordToolResults(turn.thread, toolResults);
      const lastResult = toolResults[toolResults.length - 1];
      this.completeAssistantMessage(turn, lastResult.summary, input.model ?? this.openCodeRuntimeService.getDefaultModel());
      return {
        thread: this.toThreadDto(turn.thread),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        toolResults,
      };
    }

    try {
      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
      const response = await this.openCodeRuntimeService.sendMessage({
        sessionId: openCodeSessionId,
        model: input.model,
        content: turn.prompt,
      });
      this.completeAssistantMessage(turn, response.content, response.model);
    } catch (error) {
      this.failAssistantMessage(turn, error);
    }

    return {
      thread: this.toThreadDto(turn.thread),
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
    };
  }

  async streamMessage(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
    emit: (event: DialogueStreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    this.activeStreamingAssistantMessageIds.add(turn.assistantMessage.id);
    try {
      await emit({
        type: "dialogue.message.created",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        createdAt: new Date().toISOString(),
      });

      const toolResults = await this.tryHandleScriptTools(turn, input, signal);
      if (toolResults.length > 0) {
        this.recordToolResults(turn.thread, toolResults);
        for (const toolResult of toolResults) {
          await emit({
            type: "dialogue.tool_result.created",
            threadId: turn.thread.id,
            messageId: turn.assistantMessage.id,
            thread: this.toThreadDto(turn.thread),
            assistantMessage: turn.assistantMessage,
            toolResult,
            createdAt: new Date().toISOString(),
          });
        }
        const lastResult = toolResults[toolResults.length - 1];
        this.completeAssistantMessage(turn, lastResult.summary, input.model ?? this.openCodeRuntimeService.getDefaultModel());
        await emit({
          type: "dialogue.message.completed",
          threadId: turn.thread.id,
          messageId: turn.assistantMessage.id,
          thread: this.toThreadDto(turn.thread),
          assistantMessage: turn.assistantMessage,
          content: turn.assistantMessage.content,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
      const response = await this.openCodeRuntimeService.streamMessage(
        {
          sessionId: openCodeSessionId,
          model: input.model,
          content: turn.prompt,
          signal,
        },
        {
          onDelta: async (delta, content) => {
            turn.assistantMessage.content = content;
            turn.thread.updatedAt = new Date().toISOString();
            await emit({
              type: "dialogue.message.delta",
              threadId: turn.thread.id,
              messageId: turn.assistantMessage.id,
              delta,
              content,
              createdAt: new Date().toISOString(),
            });
          },
        },
      );
      this.completeAssistantMessage(turn, response.content, response.model);
      await emit({
        type: "dialogue.message.completed",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        assistantMessage: turn.assistantMessage,
        content: turn.assistantMessage.content,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.failAssistantMessage(turn, error);
      await emit({
        type: "dialogue.error",
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        thread: this.toThreadDto(turn.thread),
        assistantMessage: turn.assistantMessage,
        error: turn.assistantMessage.error ?? {
          code: "OPENCODE_DIALOGUE_FAILED",
          message: "OpenCode dialogue failed",
        },
        createdAt: new Date().toISOString(),
      });
    } finally {
      this.activeStreamingAssistantMessageIds.delete(turn.assistantMessage.id);
    }
  }

  private async createDialogueTurn(
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueTurn> {
    const normalizedStepKey = this.normalizeStepKey(input.stepKey ?? stepKey);
    const chapterId = this.resolveDialogueChapterId(normalizedStepKey, input);
    const snapshot = await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const content = input.content.trim();
    if (!content) {
      throw new BadRequestException("DIALOGUE_MESSAGE_REQUIRED");
    }

    const thread = this.getOrCreateThread(projectId, normalizedStepKey, chapterId);
    this.settleInactiveRunningMessages(thread);
    const now = new Date().toISOString();
    const userMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      chapterId,
      role: "user",
      content,
      status: "completed",
      model: null,
      error: null,
      createdAt: now,
      completedAt: now,
    };
    const assistantMessage: DialogueMessageItem = {
      id: randomUUID(),
      projectId,
      threadId: thread.id,
      stepKey: normalizedStepKey,
      chapterId,
      role: "assistant",
      content: "",
      status: "running",
      model: input.model ?? this.openCodeRuntimeService.getDefaultModel(),
      error: null,
      createdAt: now,
      completedAt: null,
    };

    thread.messages.push(userMessage, assistantMessage);
    thread.updatedAt = now;

    return {
      snapshot,
      normalizedStepKey,
      thread,
      userMessage,
      assistantMessage,
      prompt: this.buildPrompt({
        snapshot,
        stepKey: normalizedStepKey,
        userContent: content,
        contextSourceText: input.context?.sourceText,
        attachmentText: this.formatAttachmentContext(input.attachments),
        recentMessages: thread.messages.slice(-12),
      }),
    };
  }

  private completeAssistantMessage(
    turn: DialogueTurn,
    content: string,
    model: AIRuntimeModelSelection,
  ): void {
    turn.assistantMessage.content = content;
    turn.assistantMessage.model = model;
    turn.assistantMessage.status = "completed";
    turn.assistantMessage.completedAt = new Date().toISOString();
    turn.thread.updatedAt = turn.assistantMessage.completedAt;
  }

  private failAssistantMessage(turn: DialogueTurn, error: unknown): void {
    turn.assistantMessage.status = "failed";
    turn.assistantMessage.content = turn.assistantMessage.content || "OpenCode 对话失败，请检查本地 OpenCode 服务和模型配置后重试。";
    turn.assistantMessage.error = {
      code: "OPENCODE_DIALOGUE_FAILED",
      message: error instanceof Error ? error.message : "OpenCode dialogue failed",
    };
    turn.assistantMessage.completedAt = new Date().toISOString();
    turn.thread.updatedAt = turn.assistantMessage.completedAt;
  }

  private async ensureOpenCodeSession(thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal): Promise<string> {
    if (thread.openCodeSessionId) {
      return thread.openCodeSessionId;
    }

    thread.openCodeSessionId = await this.openCodeRuntimeService.createSession(`${snapshot.project.name} · 对话框`, signal);
    thread.updatedAt = new Date().toISOString();
    return thread.openCodeSessionId;
  }

  private getOrCreateThread(projectId: string, stepKey: string, chapterId: string | null): LocalDialogueThread {
    const threadKey = this.getThreadKey(projectId, stepKey, chapterId);
    const existing = this.threads.get(threadKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const thread: LocalDialogueThread = {
      id: randomUUID(),
      projectId,
      stepKey,
      chapterId,
      openCodeSessionId: null,
      messages: [],
      toolResults: [],
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(threadKey, thread);
    return thread;
  }

  private settleInactiveRunningMessages(thread: LocalDialogueThread): void {
    const now = new Date().toISOString();
    let changed = false;

    for (const message of thread.messages) {
      if (
        message.role !== "assistant"
        || message.status !== "running"
        || this.activeStreamingAssistantMessageIds.has(message.id)
      ) {
        continue;
      }

      message.status = "failed";
      message.content = message.content || "上一轮对话连接已中断，请重新发送。";
      message.error = {
        code: "DIALOGUE_STREAM_INTERRUPTED",
        message: "Dialogue stream was interrupted before completion.",
      };
      message.completedAt = now;
      changed = true;
    }

    if (changed) {
      thread.updatedAt = now;
    }
  }

  private deleteProjectRuntimeState(projectId: string): number {
    let deletedCount = 0;
    const deletedThreadIds = new Set<string>();

    for (const [threadKey, thread] of this.threads.entries()) {
      if (thread.projectId !== projectId) {
        continue;
      }

      deletedThreadIds.add(thread.id);
      for (const message of thread.messages) {
        this.activeStreamingAssistantMessageIds.delete(message.id);
      }
      this.threads.delete(threadKey);
      deletedCount += 1;
    }

    for (const threadId of deletedThreadIds) {
      if (this.scriptDialogue.tryDeleteThreadState(threadId)) {
        deletedCount += 1;
      }
    }

    deletedCount += this.scriptDialogue.clearForProject(projectId);
    deletedCount += this.storyStructureDialogue.clearForProject(projectId);
    return deletedCount;
  }

  private toThreadDto(thread: LocalDialogueThread): DialogueThread {
    return {
      id: thread.id,
      projectId: thread.projectId,
      currentStepKey: thread.stepKey,
      chapterId: thread.chapterId,
      messages: thread.messages,
      toolResults: thread.toolResults,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  private recordToolResults(thread: LocalDialogueThread, toolResults: DialogueToolResult[]): void {
    const existingIds = new Set(thread.toolResults.map((result) => result.id));
    const nextResults = toolResults.filter((result) => !existingIds.has(result.id));
    if (nextResults.length === 0) {
      return;
    }

    thread.toolResults.push(...nextResults);
    thread.updatedAt = new Date().toISOString();
  }

  private normalizeStepKey(stepKey: string): string {
    if (stepKey === "story") {
      return "project_story";
    }

    return STEP_LABELS[stepKey] ? stepKey : "project_story";
  }

  private resolveDialogueChapterId(stepKey: string, input: SendDialogueMessageRequest): string | null {
    if (stepKey === "project_characters") {
      return null;
    }

    if (stepKey !== "project_story") {
      return input.chapterId ?? null;
    }

    return shouldOrganizeProvidedScript(input)
      || input.intent === "generate_inspiration_seeds"
      || input.intent === "generate_script_outline_from_seed"
      ? null
      : input.chapterId ?? null;
  }

  private async tryHandleScriptTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult[]> {
    const projectCharactersResult = await this.tryHandleProjectCharacterTools(turn, input);
    if (projectCharactersResult) {
      return [projectCharactersResult];
    }

    const storyStructureResult = await this.storyStructureDialogue.handleStoryStructureTurn(turn, input, signal);
    if (storyStructureResult) {
      return [storyStructureResult];
    }

    const storyboardResult = await this.storyboardDialogue.handleStoryboardTurn(turn, input, signal);
    if (storyboardResult) {
      return [storyboardResult];
    }

    const scriptResults = await this.scriptDialogue.handleScriptTurn(turn, input, signal);
    if (scriptResults.length > 0) {
      return scriptResults;
    }

    return [];
  }

  private async tryHandleProjectCharacterTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "project_characters") {
      return null;
    }

    if (!this.shouldGenerateProjectCharacters(input)) {
      return null;
    }

    const result = await this.projectsService.extractProjectCharacters(turn.thread.projectId, {
      source: "auto",
    });
    if (result.characters.length === 0) {
      return this.createFailedToolResult(
        turn,
        "generate_project_characters",
        "我没有从已确认剧本大纲或当前章节里识别出可入库角色。可以先在剧本阶段确认大纲，或把主要角色设定发给我再提取。",
      );
    }

    const requiredCount = result.characters.filter((character) =>
      character.level === "lead" || character.level === "recurring",
    ).length;
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_project_characters",
      status: "succeeded",
      summary: [
        `已提取 ${result.characters.length} 个项目角色，其中 ${requiredCount} 个需要确认角色定稿图。`,
        "右侧项目角色库会自动生成角色预览图；主角/常驻角色确认预览并完成定稿后，会在出图准备阶段作为候选图生成的参考图。",
      ].join("\n"),
      chapters: turn.snapshot.chapters,
      currentChapterId: turn.snapshot.currentChapter?.id ?? null,
      currentChapter: turn.snapshot.currentChapter ?? null,
      characters: result.characters,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createFailedToolResult(
    turn: DialogueTurn,
    tool: DialogueToolResult["tool"],
    summary: string,
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool,
      status: "failed",
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private shouldGenerateProjectCharacters(input: SendDialogueMessageRequest): boolean {
    if (input.intent === "generate_project_characters") {
      return true;
    }

    const content = input.content.trim();
    return /(生成|提取|整理|创建|做).{0,12}(项目角色库|角色库|项目角色|角色定稿|主要角色|常驻角色)/.test(content)
      || /角色库/.test(content);
  }

  private getTextAttachments(attachments: DialogueAttachmentInput[] | undefined): DialogueAttachmentInput[] {
    return (attachments ?? []).filter((attachment) => {
      const name = attachment.name.toLowerCase();
      return (name.endsWith(".txt") || name.endsWith(".md") || attachment.mimeType.startsWith("text/"))
        && attachment.content.trim().length > 0;
    });
  }

  private formatAttachmentContext(attachments: DialogueAttachmentInput[] | undefined): string {
    const textAttachments = this.getTextAttachments(attachments);
    if (textAttachments.length === 0) {
      return "";
    }

    return textAttachments
      .map((attachment) => `【${attachment.name}】\n${attachment.content.trim()}`)
      .join("\n\n");
  }

  private getThreadKey(projectId: string, stepKey: string, chapterId: string | null): string {
    return chapterId ? `${projectId}:${stepKey}:${chapterId}` : `${projectId}:${stepKey}`;
  }

  private buildPrompt(input: {
    snapshot: WorkbenchSnapshot;
    stepKey: string;
    userContent: string;
    contextSourceText?: string;
    attachmentText?: string;
    recentMessages: DialogueMessageItem[];
  }): string {
    const stepLabel = STEP_LABELS[input.stepKey] ?? "剧本";
    const currentChapter = input.snapshot.currentChapter;
    const chapterTitle = currentChapter?.title || input.snapshot.story.title || "当前章节";
    const sourceText = (input.contextSourceText ?? currentChapter?.sourceText ?? input.snapshot.story.sourceText).trim();
    const recentDialogue = input.recentMessages
      .filter((message) => message.content.trim())
      .map((message) => `${message.role === "user" ? "用户" : "AI"}（${STEP_LABELS[message.stepKey] ?? message.stepKey}）：${message.content}`)
      .join("\n");
    const scriptBoundary = input.stepKey === "project_story" ? this.buildScriptStageBoundaryContract() : "";
    const projectCharactersBoundary = input.stepKey === "project_characters" ? this.buildProjectCharactersBoundaryContract(input.snapshot) : "";
    const imagePreflightBoundary = input.stepKey === "image_preflight" ? this.buildImagePreflightBoundaryContract(input.snapshot) : "";

    return [
      "你是 AI漫游的漫画创作助手，当前运行在项目工作区的左侧对话框。",
      `当前项目：${input.snapshot.project.name}`,
      `当前步骤：${stepLabel}`,
      `当前章节：${chapterTitle}`,
      scriptBoundary,
      projectCharactersBoundary,
      imagePreflightBoundary,
      "工作原则：",
      "1. 回复使用中文，优先围绕当前步骤、漫画创作目标和用户正在编辑的产物。",
      "2. 没有明确写入权限或受控工具时，只能给建议、分析、问题清单或候选方案。",
      "3. 不要声称你直接操作了本地物理文件；如确实由系统工具写入，只能说“已通过系统工具更新”。",
      "当前章节剧本文档：",
      sourceText || "（用户还没有填写剧本内容）",
      "项目级剧本大纲：",
      input.snapshot.scriptOutline?.sourceText?.trim() || "（项目还没有保存剧本大纲）",
      "当前项目角色库：",
      input.snapshot.characters.length > 0
        ? input.snapshot.characters.map((character) => `${character.name} / ${character.level} / ${character.status} / ${character.primaryReferenceKind}`).join("\n")
        : "（项目角色库为空）",
      "本轮附件文本：",
      input.attachmentText || "（本轮没有文本附件）",
      "最近对话：",
      recentDialogue || "（暂无历史对话）",
      "用户本次消息：",
      input.userContent,
    ].filter(Boolean).join("\n\n");
  }

  private buildProjectCharactersBoundaryContract(snapshot: WorkbenchSnapshot): string {
    const requiredCharacters = snapshot.characters.filter((character) =>
      character.level === "lead" || character.level === "recurring",
    );
    return [
      "项目角色库阶段边界契约：",
      "",
      "目标：提取项目级主角、常驻角色和可选本章重要角色，生成可供后续漫画候选图复用的角色视觉基准。",
      "事实源：已确认剧本大纲、已完成章节剧本和右侧项目角色库。",
      "写入规则：普通聊天不能直接写文件；只有调用系统受控工具后，才可把角色草稿写入 `shared/characters.json`。",
      "图片规则：所有角色进入角色库后都应自动生成正面半身预览图；主角和常驻角色确认预览后必须生成并确认角色定稿图；本章重要角色可按需补定稿图；临时/背景角色只保留预览图。",
      "禁区：不要声称 OpenCode 自己调用图片模型或写入本地文件；图片生成必须由 AI漫游后端受控接口执行。",
      `当前必需定稿角色数：${requiredCharacters.length}`,
    ].join("\n");
  }

  private buildImagePreflightBoundaryContract(snapshot: WorkbenchSnapshot): string {
    return [
      "出图准备阶段边界契约：",
      "",
      "目标：检查当前章节正式分镜能否进入候选图生成。",
      "检查项：正式 storyboard.json、镜头角色绑定、项目角色库匹配、主角/常驻角色定稿图、本章重要角色参考图、正在运行的角色图任务。",
      "角色库定位：项目角色库是项目级资产入口，不是线性主流程步骤；缺图或未绑定角色只阻塞候选图，不阻塞剧情结构或分镜。",
      "写入规则：只有用户在出图准备页确认、且后端 image-preflight/confirm API 返回成功后，才能声称已写入 preflight.json；未确认时只能解释阻塞项和补齐建议。",
      `当前正式分镜镜头数：${snapshot.shots.length}`,
      `当前项目角色数：${snapshot.characters.length}`,
    ].join("\n");
  }

  private buildScriptStageBoundaryContract(): string {
    return [
      "剧本阶段统一边界契约：",
      "",
      "事实源：",
      "1. 当前章节正文以工作台注入的 `currentChapter.sourceText` 或本轮 `context.sourceText` 为准。",
      "2. 用户上传附件、粘贴文本、普通聊天内容都不是项目事实；只有写入项目级剧本大纲、写入章节草稿、保存、完成本章或被用户确认后，才可作为后续事实。",
      "3. `Chapter` 是剧本阶段的一等工作单元；写入目标只能是当前章节或系统明确指定的章节。",
      "4. 聊天回复不是正式产物；正式产物必须落到章节草稿、章节版本、项目事实或后续受控任务中。",
      "",
      "行为分级：",
      "A. 只能回答，不能写入：用户只是询问想法、评价、分析、解释、讨论方向；用户要求“看看怎么样”“有什么问题”“给我建议”；用户提供的是世界观、角色设定、灵感笔记、提纲或零散资料但没有明确要求写成章节；用户的问题属于剧情结构、分镜、图片、排版或素材包阶段且当前没有对应受控工具。",
      "B. 可以生成候选，但不能直接写章节：用户说没有灵感、想要几个方向、想看故事种子；用户选择灵感种子后，应先生成并保存项目级剧本大纲，等待用户确认；用户提供多个方向要求帮忙挑选；用户给出的内容可用但章节边界不清晰；写入会覆盖已有非空章节、替换整本剧本或造成后续产物失效。",
      "C. 可以通过受控工具写入章节：用户明确要求导入、整理成章节、写入章节；用户确认了项目级剧本大纲并要求生成第一章；用户在当前章节中明确要求改写、润色、扩写、压缩、调整节奏、补对白或加强冲突；后端提供了对应受控工具，并能校验 `projectId`、`chapterId`、当前步骤和写入范围。",
      "",
      "写入前确认规则：",
      "以下情况必须先说明影响范围并等待用户确认：覆盖已有非空章节；替换整本剧本或清空旧章节集合；根据不清晰章节边界拆章；把小说正文、提纲、设定资料转换成章节剧本；修改可能导致后续剧情结构、分镜、候选图或排版需要重新生成。确认语义必须明确，例如“确认导入”“确认覆盖”“按这个方案写入”。",
      "",
      "禁止事项：",
      "- 不直接操作本地物理路径、数据库、shell 或 workspace 文件。",
      "- 不绕过 AI漫游受控工具/API 写入章节。",
      "- 不把未确认聊天内容自动当作项目事实。",
      "- 不在用户选择灵感种子后直接写章节；必须先生成项目级剧本大纲，用户确认大纲后才生成单个目标章节。",
      "- 不在剧本阶段擅自生成分镜、图片、排版或素材包产物。",
      "- 不把主体列表、正式场景列表、剧情节拍、分镜剧本、镜头编号、图片 Prompt 或 JSON 作为最终章节剧本输出；这些属于后续剧情结构、分镜工作台或候选图阶段。",
      "- 不把普通建议包装成已经完成的写入。",
      "- 不在用户已有固定剧本时擅自换题材、换主角或推翻核心设定。",
      "- 不只因为文本里有 `1`、`2`、`# 1` 这类低可信编号就拆成章节。",
      "",
      getChapterScriptForbiddenOutputPrompt(),
      "",
      "回复口径：",
      "- 如果只是建议，明确说“我建议”，不要说“我已更新”。",
      "- 如果调用了受控工具，说“已通过系统工具更新章节草稿”，并说明影响章节和摘要。",
      "- 如果不能写入，说明原因，并给用户下一步选择。",
      "- 如果需要确认，列出将影响哪些章节、是否覆盖旧内容、继续需要用户回复什么。",
    ].join("\n");
  }
}
