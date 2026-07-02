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
  ChapterStoryboard,
  ChapterStoryStructure,
  StoryStructureCharacterCard,
  StoryboardJson,
  StoryboardShot,
  StoryStructureJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import {
  getChapterScriptForbiddenOutputPrompt,
  normalizeCameraAngle,
  normalizeCameraMovement,
  normalizeFrameType,
  normalizePanelRhythm,
  normalizeShotType,
  normalizeVoiceLines,
  parseDurationHintToMs,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";
import { shouldOrganizeProvidedScript } from "./dialogue-intent.util.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
  PendingStoryStructure,
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
  private readonly pendingStoryStructures = new Map<string, PendingStoryStructure>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
    @Inject(ScriptDialogueService) private readonly scriptDialogue: ScriptDialogueService,
  ) {
    this.projectsService.onProjectDeleted((projectId) => this.deleteProjectRuntimeState(projectId));
    this.scriptDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
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
    deletedCount += this.deleteMapEntriesByProjectPrefix(this.pendingStoryStructures, projectId);
    return deletedCount;
  }

  private deleteMapEntriesByProjectPrefix<T>(map: Map<string, T>, projectId: string): number {
    let deletedCount = 0;
    const projectPrefix = `${projectId}:`;
    for (const key of map.keys()) {
      if (!key.startsWith(projectPrefix)) {
        continue;
      }

      map.delete(key);
      deletedCount += 1;
    }
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

    const storyStructureResult = await this.tryHandleStoryStructureTools(turn, input, signal);
    if (storyStructureResult) {
      return [storyStructureResult];
    }

    const storyboardResult = await this.tryHandleStoryboardTools(turn, input, signal);
    if (storyboardResult) {
      return [storyboardResult];
    }

    const scriptResults = await this.scriptDialogue.handleScriptTurn(turn, input, signal);
    if (scriptResults.length > 0) {
      return scriptResults;
    }

    return [];
  }

  private async tryHandleStoryStructureTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "story_structure") {
      return null;
    }

    const pendingKey = this.getPendingStoryStructureKey(turn.thread.projectId, turn.thread.chapterId);
    const pending = this.pendingStoryStructures.get(pendingKey);
    if (pending && (input.intent === "confirm_story_structure" || this.isConfirmingStoryStructure(input.content))) {
      this.pendingStoryStructures.delete(pendingKey);
      return this.createConfirmStoryStructureToolResult(turn, pending.storyStructure);
    }

    if (!this.shouldGenerateStoryStructure(input)) {
      return null;
    }

    const chapter = turn.snapshot.currentChapter;
    if (!chapter) {
      return this.createFailedToolResult(turn, "generate_story_structure", "当前项目还没有可生成剧情结构的章节。");
    }

    if (chapter.status === "draft") {
      return this.createFailedToolResult(
        turn,
        "generate_story_structure",
        "当前章节还没有完成剧本，请先在剧本步骤点击“完成本章”，再生成剧情结构。",
      );
    }

    if (chapter.status !== "script_done" && !this.isConfirmingStoryStructureRegeneration(input.content)) {
      return this.createStoryStructureWarningToolResult(
        turn,
        "本章已经有剧情结构或后续产物。重新生成会影响后面的分镜、候选图和排版；确认要重新生成，请回复“确认重新生成剧情结构”。",
      );
    }

    let structureJson: StoryStructureJson;
    try {
      structureJson = await this.generateStoryStructureWithAI(turn, input, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_story_structure",
        `剧情结构生成失败：${this.getErrorMessage(error)}。本次没有写入章节结构。`,
      );
    }

    const now = new Date().toISOString();
    const existingVersion = turn.snapshot.storyStructure?.version ?? 0;
    const storyStructure: ChapterStoryStructure = {
      id: `${chapter.id}_story_pending_${randomUUID().slice(0, 8)}`,
      projectId: turn.thread.projectId,
      chapterId: chapter.id,
      version: existingVersion + 1,
      status: "pending_confirmation",
      structurePath: null,
      sourceScriptVersionId: chapter.currentScriptVersionId,
      structureJson: this.normalizeStoryStructureJson(structureJson, chapter.id, chapter.title, {
        sourceScriptVersionId: chapter.currentScriptVersionId,
        createdAt: now,
        updatedAt: now,
      }),
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
    };

    this.pendingStoryStructures.set(pendingKey, {
      storyStructure,
      chapterId: chapter.id,
      createdAt: now,
    });

    return this.createGenerateStoryStructureToolResult(turn, storyStructure);
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

  private async createConfirmStoryStructureToolResult(
    turn: DialogueTurn,
    storyStructure: ChapterStoryStructure,
  ): Promise<DialogueToolResult> {
    const result = await this.projectsService.confirmChapterStoryStructure(turn.thread.projectId, storyStructure.chapterId, {
      structureJson: storyStructure.structureJson,
    });

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "confirm_story_structure",
      status: "succeeded",
      summary: `已确认「${result.chapter.title}」的剧情结构，并写入 ${result.storyStructure.structurePath}。现在可以进入分镜工作台。`,
      chapters: result.chapters,
      currentChapterId: result.chapter.id,
      currentChapter: result.chapter,
      storyStructure: result.storyStructure,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createGenerateStoryStructureToolResult(
    turn: DialogueTurn,
    storyStructure: ChapterStoryStructure,
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_story_structure",
      status: "needs_user_confirmation",
      summary: [
        `已生成「${storyStructure.structureJson.chapterTitle}」的剧情结构预览，右侧可查看。`,
        "这还是待确认预览，不会写入正式 structure.json，也不能生成分镜。",
        "确认后我会通过受控接口保存到当前章节，并把章节推进为 structured。",
      ].join("\n"),
      chapters: [],
      currentChapterId: storyStructure.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      storyStructure,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createStoryStructureWarningToolResult(turn: DialogueTurn, summary: string): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_story_structure",
      status: "needs_user_confirmation",
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      storyStructure: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private async tryHandleStoryboardTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "storyboard") {
      return null;
    }

    const pending = turn.thread.chapterId
      ? await this.projectsService.getPendingChapterStoryboard(turn.thread.projectId, turn.thread.chapterId)
      : null;
    if (pending && (input.intent === "confirm_storyboard" || this.isConfirmingStoryboard(input.content))) {
      return this.createConfirmStoryboardToolResult(turn, pending);
    }

    if (!this.shouldGenerateStoryboard(input)) {
      return null;
    }

    const chapter = turn.snapshot.currentChapter;
    if (!chapter) {
      return this.createFailedToolResult(turn, "generate_storyboard", "当前项目还没有可生成分镜的章节。");
    }

    if (!turn.snapshot.storyStructure || !chapter.currentStoryVersionId || chapter.status === "script_done" || chapter.status === "draft") {
      return this.createFailedToolResult(
        turn,
        "generate_storyboard",
        "当前章节还没有确认剧情结构，请先在剧情结构步骤确认 structure.json，再生成分镜。",
      );
    }

    if (chapter.status !== "structured" && !this.isConfirmingStoryboardRegeneration(input.content)) {
      return this.createStoryboardWarningToolResult(
        turn,
        "本章已经有分镜或后续产物。重新生成会影响候选图、排版和轻漫剧镜头字段；确认要重新生成，请回复“确认重新生成分镜”。",
      );
    }

    let storyboardJson: StoryboardJson;
    try {
      storyboardJson = await this.generateStoryboardWithAI(turn, input, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_storyboard",
        `分镜生成失败：${this.getErrorMessage(error)}。本次没有写入 storyboard.json。`,
      );
    }

    const saved = await this.projectsService.savePendingChapterStoryboard(turn.thread.projectId, chapter.id, {
      storyboardJson: this.normalizeStoryboardJson(storyboardJson, chapter.id, chapter.title, {
        sourceStoryVersionId: chapter.currentStoryVersionId,
      }),
    });

    return this.createGenerateStoryboardToolResult(turn, saved.storyboard);
  }

  private async createConfirmStoryboardToolResult(
    turn: DialogueTurn,
    storyboard: ChapterStoryboard,
  ): Promise<DialogueToolResult> {
    const result = await this.projectsService.confirmChapterStoryboard(turn.thread.projectId, storyboard.chapterId, {
      storyboardJson: storyboard.storyboardJson,
    });

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "confirm_storyboard",
      status: "succeeded",
      summary: `已确认「${result.chapter.title}」的分镜，并写入 ${result.storyboard.storyboardPath}。现在可以进入出图准备，检查角色参考图和镜头绑定。`,
      chapters: result.chapters,
      currentChapterId: result.chapter.id,
      currentChapter: result.chapter,
      storyboard: result.storyboard,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createGenerateStoryboardToolResult(
    turn: DialogueTurn,
    storyboard: ChapterStoryboard,
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_storyboard",
      status: "needs_user_confirmation",
      summary: [
        `已生成「${storyboard.storyboardJson.chapterTitle}」的分镜预览，共 ${storyboard.storyboardJson.shots.length} 镜，右侧可查看。`,
        "每个镜头包含漫画画格字段和基础漫剧镜头字段。",
        "这还是待确认预览，已保存为 storyboard.pending.json；确认后才会写入正式 storyboard.json，也才能生成候选图。",
      ].join("\n"),
      chapters: [],
      currentChapterId: storyboard.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      storyboard,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createStoryboardWarningToolResult(turn: DialogueTurn, summary: string): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_storyboard",
      status: "needs_user_confirmation",
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      storyboard: null,
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

  private shouldGenerateStoryStructure(input: SendDialogueMessageRequest): boolean {
    if (input.intent === "generate_story_structure") {
      return true;
    }

    const content = input.content.trim();
    return /(生成|整理|拆|做|创建|重新生成).{0,12}(剧情结构|剧本结构|结构化剧情|故事结构|story_parse)/.test(content)
      || /剧情结构/.test(content);
  }

  private shouldGenerateProjectCharacters(input: SendDialogueMessageRequest): boolean {
    if (input.intent === "generate_project_characters") {
      return true;
    }

    const content = input.content.trim();
    return /(生成|提取|整理|创建|做).{0,12}(项目角色库|角色库|项目角色|角色定稿|主要角色|常驻角色)/.test(content)
      || /角色库/.test(content);
  }

  private isConfirmingStoryStructure(content: string): boolean {
    const text = content.trim();
    if (/(不行|不可以|不满意|不要|先别|取消)/.test(text)) {
      return false;
    }

    return /^(确认|可以|继续|同意|就这个|没问题|通过)$/.test(text)
      || /(确认|通过|保存).{0,10}(剧情结构|剧本结构|结构)/.test(text)
      || /(按这个|就这个).{0,8}(保存|确认|继续)/.test(text);
  }

  private isConfirmingStoryStructureRegeneration(content: string): boolean {
    return /(确认|确定|同意).{0,10}(重新生成|重生成|覆盖).{0,10}(剧情结构|剧本结构|结构)/.test(content.trim())
      || /(重新生成|重生成).{0,8}(剧情结构|剧本结构|结构)/.test(content.trim());
  }

  private shouldGenerateStoryboard(input: SendDialogueMessageRequest): boolean {
    if (input.intent === "generate_storyboard") {
      return true;
    }

    const content = input.content.trim();
    return /(生成|整理|拆|做|创建|重新生成).{0,12}(分镜|镜头|storyboard|shot)/.test(content)
      || /分镜工作台/.test(content);
  }

  private isConfirmingStoryboard(content: string): boolean {
    const text = content.trim();
    if (/(不行|不可以|不满意|不要|先别|取消)/.test(text)) {
      return false;
    }

    return /^(确认|可以|继续|同意|就这个|没问题|通过)$/.test(text)
      || /(确认|通过|保存).{0,10}(分镜|镜头|storyboard)/.test(text)
      || /(按这个|就这个).{0,8}(保存|确认|继续)/.test(text);
  }

  private isConfirmingStoryboardRegeneration(content: string): boolean {
    return /(确认|确定|同意).{0,10}(重新生成|重生成|覆盖).{0,10}(分镜|镜头|storyboard)/.test(content.trim())
      || /(重新生成|重生成).{0,8}(分镜|镜头|storyboard)/.test(content.trim());
  }

  private async generateStoryStructureWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<StoryStructureJson> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildStoryStructurePrompt(turn, input),
      signal,
    });

    return this.parseStoryStructureJson(response.content, turn.snapshot);
  }

  private buildStoryStructurePrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
    const snapshot = turn.snapshot;
    const currentChapter = snapshot.currentChapter;
    const sourceText = (input.context?.sourceText ?? currentChapter?.sourceText ?? snapshot.story.sourceText).trim();

    return [
      "你正在为 AI漫游执行剧情结构阶段 skill：structure-story-parse。",
      "任务：只针对当前章节生成「剧情结构」JSON，供后续分镜工作台使用。",
      "",
      "硬性边界：",
      "- 只生成当前章节的剧情结构，不要生成整部作品结构。",
      "- 剧情结构不是章节剧本正文，也不是分镜稿。",
      "- 角色卡和场景卡默认都是本章结构卡，不要声称已创建项目级角色库或场景库。",
      "- 角色卡里的 projectCharacterId 字段由后端在确认结构时按角色名匹配项目角色库后回填，你不要输出它。",
      "- 角色卡必须显式输出 level 和 entityType 两个字段，从以下固定值中选一个（见角色分层双维度）：",
      "  - level(戏份重要性): lead=主角 / recurring=重要配角 / chapter=本章关键角色 / minor=小角色·功能角色 / extra=背景路人",
      "  - entityType(存在形态): human=人类 / creature=怪物·异常体·非人生物 / group=群体角色 / voice=纯声音角色(不露脸)",
      "  - 判断依据：主角(视角核心/第一主角)给 lead；长期出现的重要配角/反派/搭档给 recurring；本章重要但未必长期给 chapter；有台词有功能但戏份少给 minor；纯背景填充给 extra。",
      "- 剧情节拍按关键剧情事件切分，粒度要比分镜粗；不要输出镜头编号、景别、机位、构图、图片 Prompt 或 JSON 以外的 Markdown 正文。",
      "- visualFocus 只能写轻量画面重点，不能写镜头语言。",
      "- 必须先返回一个 JSON 代码块，后端会解析这个 JSON。",
      "",
      "JSON 结构必须是：",
      "```json",
      JSON.stringify({
        synopsis: "本章剧情摘要",
        direction: {
          logline: "一句话梗概",
          chapterGoal: "本章目标",
          coreConflict: "核心冲突",
          emotionalArc: "情绪走向",
          endingHook: "结尾钩子",
        },
        characters: [
          {
            name: "角色名",
            role: "本章职能",
            level: "lead",
            entityType: "human",
            motivation: "本章动机",
            relationship: "和本章其他角色的关系",
            visualTraits: "可供后续理解的视觉特征",
            notes: "备注",
          },
        ],
        scenes: [
          {
            name: "场景名",
            location: "地点",
            timeOfDay: "时间",
            atmosphere: "氛围",
            purpose: "剧情作用",
          },
        ],
        beats: [
          {
            order: 1,
            title: "节拍标题",
            summary: "关键事件",
            conflict: "这一拍的冲突或转折",
            characters: ["角色名"],
            sceneName: "场景名",
            visualFocus: "轻量画面重点",
            outcome: "结果/推动",
          },
        ],
        notes: "给后续分镜的结构提醒",
      }, null, 2),
      "```",
      "",
      `项目名称：${snapshot.project.name}`,
      `剧集名称：${snapshot.project.storyTitle}`,
      `当前章节：${currentChapter?.title ?? "当前章节"}`,
      `当前章节状态：${currentChapter?.status ?? "unknown"}`,
      `当前剧本版本：${currentChapter?.currentScriptVersionId ?? "未生成版本"}`,
      "项目级剧本大纲：",
      snapshot.scriptOutline?.sourceText?.trim() || "（暂无项目级剧本大纲）",
      "当前章节剧本：",
      sourceText || "（当前章节为空）",
      "用户本次要求：",
      input.content,
    ].join("\n");
  }

  private parseStoryStructureJson(content: string, snapshot: WorkbenchSnapshot): StoryStructureJson {
    const jsonText = this.extractJsonPayload(content);
    const value = JSON.parse(jsonText) as unknown;
    const chapter = snapshot.currentChapter;
    if (!chapter) {
      throw new Error("当前章节不存在，无法生成剧情结构");
    }

    return this.normalizeStoryStructureJson(value, chapter.id, chapter.title, {
      sourceScriptVersionId: chapter.currentScriptVersionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  private async generateStoryboardWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<StoryboardJson> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildStoryboardPrompt(turn, input),
      signal,
    });

    return this.parseStoryboardJson(response.content, turn.snapshot);
  }

  private buildStoryboardPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
    const snapshot = turn.snapshot;
    const currentChapter = snapshot.currentChapter;
    const structure = snapshot.storyStructure?.structureJson;
    const availableCharacterNames = Array.isArray(structure?.characters)
      ? structure.characters.map((card) => card?.name).filter((name): name is string => typeof name === "string" && name.trim() !== "")
      : [];
    const beatCount = Array.isArray(structure?.beats) ? structure.beats.length : 0;
    const targetShotRange = beatCount > 0
      ? `${beatCount}-${Math.min(Math.max(beatCount * 2, beatCount), 24)}`
      : "8-16";
    const chapterScriptExcerpt = this.compactPromptText(currentChapter?.sourceText?.trim() ?? "", 6000);

    return [
      "你正在为 AI漫游执行分镜工作台阶段 skill：storyboard-shot-generate。",
      "任务：只针对当前章节，把已确认剧情结构拆成可编辑 Shot[]。",
      "",
      "硬性边界：",
      "- 只生成当前章节分镜，不要生成整部作品分镜。",
      "- 输入事实源是已确认的 structure.json，不读取未确认聊天内容作为正式事实。",
      "- 每个 Shot 必须有共同核心字段，并同时包含 comic 漫画画格表达和 motion 基础漫剧镜头表达。",
      "- M1 可以默认一个 Shot 对应一个漫画画格和一个基础漫剧镜头，但不要在文案中声称未来永远一一对应。",
      "- 不要生成最终图片 Prompt；promptDraft 只能是给后续候选图阶段的草稿摘要。",
      "- 不要生成候选图、TTS、字幕、视频或排版。",
      `- characterIds 必须从已确认剧情结构的角色名里选(可用角色名：${availableCharacterNames.join("、") || "暂无"})，不要自创新名字、用别名或简称。`,
      `- 本章建议生成 ${targetShotRange} 个 Shot；每个剧情节拍默认拆 1-2 个 Shot，除非关键动作/情绪转折必须拆开。`,
      "- 只输出一个 JSON 代码块，不要在 JSON 后追加解释。",
      "- 必须先返回一个 JSON 代码块，后端会解析这个 JSON。",
      "",
      "枚举字段必须从下面固定值中选一个，不要自创值（见 ADR-0007）：",
      "- shotType(景别，共同核心): establishing / wide / full / medium / close_up / extreme_close_up",
      "- cameraAngle(机位角度，共同核心): eye_level / high_angle / low_angle / over_shoulder / top_down / dutch_angle",
      "- comic.panelRhythm(画格节奏): slow / normal / fast / impact / transition",
      "- motion.cameraMovement(运镜): static / push_in / pull_out / pan_left / pan_right / tilt_up / tilt_down / track_left / track_right / slow_zoom / handheld / none",
      "- motion.frameType(镜头类型): atmosphere / dialogue / action / reaction / detail / transition",
      "- shotType 和 cameraAngle 放在 Shot 顶层（comic 和 motion 共用一份），不要在 comic/motion 里重复填。",
      "- comic.composition 只写构图（人物位置、视觉重心），不要再塞景别和机位。",
      "- motion.durationMs 给数字（毫秒，如 3000），durationHint 给人看的文本（如「约 3s」）。",
      "- motion.voiceLines 是数组，支持一个镜头多人对话；没有台词就给空数组 []。不要再用旧的 voiceRole / line 字段。",
      "",
      "JSON 结构必须是：",
      "```json",
      JSON.stringify({
        shots: [
          {
            order: 1,
            beatId: "beat_01",
            sceneId: "scene_01",
            characterIds: ["角色名"],
            coreAction: "镜头核心动作",
            emotion: "情绪",
            shotType: "medium",
            cameraAngle: "eye_level",
            comic: {
              panelDescription: "漫画画格画面描述",
              composition: "构图（人物位置/视觉重心，不含景别机位）",
              dialogue: "对白气泡文字，没有就空字符串",
              caption: "旁白，没有就空字符串",
              panelRhythm: "slow",
            },
            motion: {
              visualDescription: "漫剧动态画面描述",
              compositionDesign: "动态构图设计",
              cameraMovement: "push_in",
              frameType: "atmosphere",
              durationMs: 3000,
              durationHint: "约 3s",
              voiceLines: [
                {
                  characterId: null,
                  name: "角色名",
                  line: "台词内容",
                  voiceStyle: "声音风格，如低声、克制",
                },
              ],
            },
            promptDraft: "给后续图片提示词生成的简短草稿，不是最终 Prompt",
          },
        ],
        notes: "分镜节奏说明",
      }, null, 2),
      "```",
      "",
      `项目名称：${snapshot.project.name}`,
      `剧集名称：${snapshot.project.storyTitle}`,
      `当前章节：${currentChapter?.title ?? "当前章节"}`,
      `当前章节状态：${currentChapter?.status ?? "unknown"}`,
      `当前剧情结构版本：${currentChapter?.currentStoryVersionId ?? "未确认"}`,
      "已确认剧情结构：",
      JSON.stringify(structure ?? {}, null, 2),
      "当前章节剧本摘录（仅作对白和动作参考；正式拆分以 structure.json 为准）：",
      chapterScriptExcerpt || "（当前章节为空）",
      "用户本次要求：",
      input.content,
    ].join("\n");
  }

  private parseStoryboardJson(content: string, snapshot: WorkbenchSnapshot): StoryboardJson {
    const jsonText = this.extractJsonPayload(content);
    const value = JSON.parse(jsonText) as unknown;
    const chapter = snapshot.currentChapter;
    if (!chapter) {
      throw new Error("当前章节不存在，无法生成分镜");
    }

    return this.normalizeStoryboardJson(value, chapter.id, chapter.title, {
      sourceStoryVersionId: chapter.currentStoryVersionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  private normalizeStoryboardJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryboardJson, "sourceStoryVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryboardJson {
    const record = this.asRecord(input);
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: this.getOptionalRecordString(record, "chapterTitle") ?? fallbackChapterTitle,
      sourceStoryVersionId: overrides.sourceStoryVersionId
        ?? this.getOptionalRecordString(record, "sourceStoryVersionId"),
      shots: this.normalizeStoryboardShots(record.shots),
      notes: this.getOptionalRecordString(record, "notes") ?? "",
      createdAt: overrides.createdAt ?? this.getOptionalRecordString(record, "createdAt") ?? now,
      updatedAt: overrides.updatedAt ?? this.getOptionalRecordString(record, "updatedAt") ?? now,
    };
  }

  private normalizeStoryboardShots(input: unknown): StoryboardJson["shots"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.asRecord(item))
      .filter((item) => Object.keys(item).length > 0)
      .map((item, index) => this.normalizeStoryboardShot(item, index))
      .sort((left, right) => left.order - right.order);
  }

  private normalizeStoryboardShot(item: Record<string, unknown>, index: number): StoryboardShot {
    const comic = this.asRecord(item.comic);
    const motion = this.asRecord(item.motion);
    const status = this.getOptionalRecordString(item, "status");

    return {
      id: this.getOptionalRecordString(item, "id") ?? `shot_${String(index + 1).padStart(3, "0")}`,
      order: this.getOptionalRecordNumber(item, "order") ?? this.getOptionalRecordNumber(item, "shotNumber") ?? index + 1,
      beatId: this.getOptionalRecordString(item, "beatId"),
      sceneId: this.getOptionalRecordString(item, "sceneId"),
      characterIds: this.getRecordStringArray(item, "characterIds").length > 0
        ? this.getRecordStringArray(item, "characterIds")
        : this.getRecordStringArray(item, "characters"),
      coreAction: this.getOptionalRecordString(item, "coreAction") ?? this.getOptionalRecordString(item, "action") ?? "",
      emotion: this.getOptionalRecordString(item, "emotion") ?? "",
      shotType: normalizeShotType(this.getOptionalRecordString(item, "shotType")),
      cameraAngle: normalizeCameraAngle(this.getOptionalRecordString(item, "cameraAngle")),
      comic: {
        panelDescription: this.getOptionalRecordString(comic, "panelDescription") ?? this.getOptionalRecordString(item, "action") ?? "",
        composition: this.getOptionalRecordString(comic, "composition") ?? this.getOptionalRecordString(item, "composition") ?? "",
        dialogue: this.getOptionalRecordString(comic, "dialogue") ?? this.getOptionalRecordString(item, "dialogue") ?? "",
        caption: this.getOptionalRecordString(comic, "caption") ?? this.getOptionalRecordString(item, "caption") ?? "",
        panelRhythm: normalizePanelRhythm(this.getOptionalRecordString(comic, "panelRhythm") ?? ""),
      },
      motion: {
        visualDescription: this.getOptionalRecordString(motion, "visualDescription") ?? this.getOptionalRecordString(item, "action") ?? "",
        compositionDesign: this.getOptionalRecordString(motion, "compositionDesign") ?? this.getOptionalRecordString(item, "camera") ?? "",
        cameraMovement: normalizeCameraMovement(this.getOptionalRecordString(motion, "cameraMovement") ?? ""),
        frameType: normalizeFrameType(this.getOptionalRecordString(motion, "frameType") ?? ""),
        durationMs: this.getOptionalRecordNumber(motion, "durationMs")
          ?? parseDurationHintToMs(this.getOptionalRecordString(motion, "durationHint")),
        durationHint: this.getOptionalRecordString(motion, "durationHint") ?? "",
        voiceLines: normalizeVoiceLines(motion),
      },
      promptDraft: this.getOptionalRecordString(item, "promptDraft") ?? "",
      lockedCandidateId: this.getOptionalRecordString(item, "lockedCandidateId"),
      status: status === "ready_for_image" || status === "image_generated" || status === "locked" || status === "needs_revision"
        ? status
        : "draft",
    };
  }

  private normalizeStoryStructureJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryStructureJson, "sourceScriptVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryStructureJson {
    const record = this.asRecord(input);
    const now = new Date().toISOString();
    const direction = this.asRecord(record.direction);
    const scenes = this.normalizeStoryStructureScenes(record.scenes);

    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: this.getOptionalRecordString(record, "chapterTitle") ?? fallbackChapterTitle,
      sourceScriptVersionId: overrides.sourceScriptVersionId
        ?? this.getOptionalRecordString(record, "sourceScriptVersionId"),
      synopsis: this.getOptionalRecordString(record, "synopsis") ?? "",
      direction: {
        logline: this.getOptionalRecordString(direction, "logline") ?? "",
        chapterGoal: this.getOptionalRecordString(direction, "chapterGoal") ?? "",
        coreConflict: this.getOptionalRecordString(direction, "coreConflict") ?? "",
        emotionalArc: this.getOptionalRecordString(direction, "emotionalArc") ?? "",
        endingHook: this.getOptionalRecordString(direction, "endingHook") ?? "",
      },
      characters: this.normalizeStoryStructureCharacters(record.characters),
      scenes,
      beats: this.normalizeStoryStructureBeats(record.beats, scenes),
      notes: this.getOptionalRecordString(record, "notes") ?? "",
      createdAt: overrides.createdAt ?? this.getOptionalRecordString(record, "createdAt") ?? now,
      updatedAt: overrides.updatedAt ?? this.getOptionalRecordString(record, "updatedAt") ?? now,
    };
  }

  private normalizeStoryStructureCharacters(input: unknown): StoryStructureJson["characters"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.asRecord(item))
      .filter((item) => Object.keys(item).length > 0)
      .map((item, index) => ({
        id: this.getOptionalRecordString(item, "id") ?? `character_${String(index + 1).padStart(2, "0")}`,
        projectCharacterId: this.getOptionalRecordString(item, "projectCharacterId"),
        name: this.getOptionalRecordString(item, "name") ?? `角色 ${index + 1}`,
        role: this.getOptionalRecordString(item, "role") ?? "",
        level: this.getOptionalRecordString(item, "level") as StoryStructureCharacterCard["level"],
        entityType: this.getOptionalRecordString(item, "entityType") as StoryStructureCharacterCard["entityType"],
        motivation: this.getOptionalRecordString(item, "motivation") ?? "",
        relationship: this.getOptionalRecordString(item, "relationship") ?? "",
        visualTraits: this.getOptionalRecordString(item, "visualTraits") ?? "",
        notes: this.getOptionalRecordString(item, "notes") ?? "",
      }));
  }

  private normalizeStoryStructureScenes(input: unknown): StoryStructureJson["scenes"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.asRecord(item))
      .filter((item) => Object.keys(item).length > 0)
      .map((item, index) => ({
        id: this.getOptionalRecordString(item, "id") ?? `scene_${String(index + 1).padStart(2, "0")}`,
        name: this.getOptionalRecordString(item, "name") ?? `场景 ${index + 1}`,
        location: this.getOptionalRecordString(item, "location") ?? "",
        timeOfDay: this.getOptionalRecordString(item, "timeOfDay") ?? "",
        atmosphere: this.getOptionalRecordString(item, "atmosphere") ?? "",
        purpose: this.getOptionalRecordString(item, "purpose") ?? "",
      }));
  }

  private normalizeStoryStructureBeats(input: unknown, scenes: StoryStructureJson["scenes"]): StoryStructureJson["beats"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.asRecord(item))
      .filter((item) => Object.keys(item).length > 0)
      .map((item, index) => {
        const sceneId = this.getOptionalRecordString(item, "sceneId")
          ?? this.resolveSceneIdByName(this.getOptionalRecordString(item, "sceneName"), scenes);
        return {
          id: this.getOptionalRecordString(item, "id") ?? `beat_${String(index + 1).padStart(2, "0")}`,
          order: this.getOptionalRecordNumber(item, "order") ?? index + 1,
          title: this.getOptionalRecordString(item, "title") ?? `节拍 ${index + 1}`,
          summary: this.getOptionalRecordString(item, "summary") ?? "",
          conflict: this.getOptionalRecordString(item, "conflict") ?? "",
          characters: this.getRecordStringArray(item, "characters"),
          sceneId,
          visualFocus: this.getOptionalRecordString(item, "visualFocus") ?? "",
          outcome: this.getOptionalRecordString(item, "outcome") ?? "",
        };
      });
  }

  private resolveSceneIdByName(sceneName: string | null, scenes: StoryStructureJson["scenes"]): string | null {
    if (!sceneName) {
      return null;
    }

    return scenes.find((scene) => scene.name === sceneName)?.id ?? null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private getOptionalRecordString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private getOptionalRecordNumber(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private getRecordStringArray(record: Record<string, unknown>, key: string): string[] {
    const value = record[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  }


  private getRequiredString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`灵感种子缺少字段 ${key}`);
    }

    return value.trim();
  }

  private extractJsonPayload(content: string): string {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const startObject = content.indexOf("{");
    const endObject = content.lastIndexOf("}");
    if (startObject >= 0 && endObject > startObject) {
      return content.slice(startObject, endObject + 1);
    }

    const startArray = content.indexOf("[");
    const endArray = content.lastIndexOf("]");
    if (startArray >= 0 && endArray > startArray) {
      return content.slice(startArray, endArray + 1);
    }

    throw new Error("AI 返回中没有可解析的 JSON 灵感种子");
  }

  private stripMarkdownFence(content: string): string {
    const fenced = content.trim().match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
    return fenced?.[1]?.trim() ?? content.trim();
  }

  private formatRevisionSource(revision: { threadId: string; messageId: string; toolCallId: string }): string {
    return `thread=${this.shortId(revision.threadId)} message=${this.shortId(revision.messageId)} tool=${this.shortId(revision.toolCallId)}`;
  }

  private shortId(id: string): string {
    return id.slice(0, 8);
  }

  private getPendingInspirationKey(projectId: string, stepKey: string): string {
    return `${projectId}:${stepKey}:inspiration`;
  }

  private getPendingScriptOutlineKey(projectId: string, stepKey: string): string {
    return `${projectId}:${stepKey}:script-outline`;
  }

  private getPendingStoryStructureKey(projectId: string, chapterId: string | null): string {
    return `${projectId}:story_structure:${chapterId ?? "project"}`;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private compactPromptText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const headLength = Math.floor(maxLength * 0.65);
    const tailLength = maxLength - headLength;
    return [
      text.slice(0, headLength).trimEnd(),
      `\n\n（中间内容已省略 ${text.length - maxLength} 字，以控制 AI 输入长度）\n\n`,
      text.slice(text.length - tailLength).trimStart(),
    ].join("");
  }

  private isConfirmingScriptImport(content: string): boolean {
    return /(确认|可以|继续|同意|覆盖).{0,8}(导入|写入|覆盖|继续)|确认导入|继续导入|确认覆盖/.test(content.trim());
  }

  private isCancellingScriptImport(content: string): boolean {
    return /(取消|不要|先不|不导入|别导入|算了).{0,8}(导入|写入|覆盖)?/.test(content.trim());
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
