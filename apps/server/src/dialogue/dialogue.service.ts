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
  ScriptImportAnalysis,
  ScriptInspirationSeed,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";

interface LocalDialogueThread {
  id: string;
  projectId: string;
  stepKey: string;
  chapterId: string | null;
  openCodeSessionId: string | null;
  messages: DialogueMessageItem[];
  toolResults: DialogueToolResult[];
  createdAt: string;
  updatedAt: string;
}

interface DialogueTurn {
  snapshot: WorkbenchSnapshot;
  normalizedStepKey: string;
  thread: LocalDialogueThread;
  userMessage: DialogueMessageItem;
  assistantMessage: DialogueMessageItem;
  prompt: string;
}

interface ScriptOrganizationInput {
  sourceText: string;
  sourceName: string;
}

interface PendingScriptImport extends ScriptOrganizationInput {
  analysis: ScriptImportAnalysis;
  createdAt: string;
}

interface PendingInspirationSeeds {
  seeds: ScriptInspirationSeed[];
  prompt: string;
  chapterId: string | null;
  createdAt: string;
}

const STEP_LABELS: Record<string, string> = {
  project_story: "剧本",
  story_structure: "剧情结构",
  storyboard: "分镜工作台",
  image_candidates: "候选图工作台",
  layout_export: "排版导出",
  asset_package: "素材包",
};

@Injectable()
export class DialogueService {
  private readonly threads = new Map<string, LocalDialogueThread>();
  private readonly pendingScriptImports = new Map<string, PendingScriptImport>();
  private readonly pendingInspirationSeeds = new Map<string, PendingInspirationSeeds>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
  ) {}

  async getProjectThread(projectId: string, stepKey: string, chapterId?: string | null): Promise<DialogueThread> {
    await this.projectsService.getWorkbenchSnapshot(projectId, chapterId ?? undefined);
    const normalizedStepKey = this.normalizeStepKey(stepKey);
    return this.toThreadDto(this.getOrCreateThread(projectId, normalizedStepKey, chapterId ?? null));
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
  ): Promise<void> {
    const turn = await this.createDialogueTurn(projectId, stepKey, input);
    await emit({
      type: "dialogue.message.created",
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      thread: this.toThreadDto(turn.thread),
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
      createdAt: new Date().toISOString(),
    });

    try {
      const toolResults = await this.tryHandleScriptTools(turn, input);
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

      const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
      const response = await this.openCodeRuntimeService.streamMessage(
        {
          sessionId: openCodeSessionId,
          model: input.model,
          content: turn.prompt,
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

  private async ensureOpenCodeSession(thread: LocalDialogueThread, snapshot: WorkbenchSnapshot): Promise<string> {
    if (thread.openCodeSessionId) {
      return thread.openCodeSessionId;
    }

    thread.openCodeSessionId = await this.openCodeRuntimeService.createSession(`${snapshot.project.name} · 对话框`);
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
    if (stepKey !== "project_story") {
      return input.chapterId ?? null;
    }

    return this.shouldOrganizeProvidedScript(input) || input.intent === "generate_inspiration_seeds"
      ? null
      : input.chapterId ?? null;
  }

  private async tryHandleScriptTools(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult[]> {
    const importResults = await this.tryHandleScriptImport(turn, input);
    if (importResults.length > 0) {
      return importResults;
    }

    const inspirationResult = await this.tryHandleScriptInspiration(turn, input);
    if (inspirationResult) {
      return [inspirationResult];
    }

    const updateResult = await this.tryHandleChapterDraftUpdate(turn, input);
    if (updateResult) {
      return [updateResult];
    }

    return [];
  }

  private async tryHandleScriptImport(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult[]> {
    const pendingResult = await this.tryResolvePendingScriptImport(turn, input);
    if (pendingResult) {
      return [pendingResult];
    }

    const scriptInput = this.getScriptOrganizationInput(input);
    if (!scriptInput) {
      return [];
    }

    const analysisToolCallId = randomUUID();
    const analysis = await this.projectsService.analyzeScriptImport(turn.thread.projectId, {
      sourceText: scriptInput.sourceText,
      sourceName: scriptInput.sourceName,
      userConfirmedOverwrite: this.isConfirmingScriptImport(input.content),
    });
    const analysisResult = this.createScriptImportAnalysisToolResult(turn, analysisToolCallId, scriptInput.sourceName, analysis);

    if (analysis.decision !== "ready_to_import") {
      if (analysis.decision === "needs_user_confirmation") {
        this.pendingScriptImports.set(turn.thread.id, {
          ...scriptInput,
          analysis,
          createdAt: new Date().toISOString(),
        });
      } else {
        this.pendingScriptImports.delete(turn.thread.id);
      }

      return [analysisResult];
    }

    this.pendingScriptImports.delete(turn.thread.id);
    return [
      analysisResult,
      await this.createImportScriptToChaptersToolResult(turn, scriptInput),
    ];
  }

  private async tryResolvePendingScriptImport(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult | null> {
    const pending = this.pendingScriptImports.get(turn.thread.id);
    if (!pending || this.hasScriptPayload(input)) {
      return null;
    }

    if (this.isCancellingScriptImport(input.content)) {
      this.pendingScriptImports.delete(turn.thread.id);
      const analysis: ScriptImportAnalysis = {
        ...pending.analysis,
        decision: "reject",
        reason: "已取消本次剧本导入。",
        risk: "未写入任何章节文件。",
        nextTool: null,
      };
      return this.createScriptImportAnalysisToolResult(turn, randomUUID(), pending.sourceName, analysis);
    }

    if (!this.isConfirmingScriptImport(input.content)) {
      return null;
    }

    this.pendingScriptImports.delete(turn.thread.id);
    return this.createImportScriptToChaptersToolResult(turn, pending);
  }

  private async createImportScriptToChaptersToolResult(
    turn: DialogueTurn,
    scriptInput: ScriptOrganizationInput,
  ): Promise<DialogueToolResult> {
    const toolCallId = randomUUID();
    const result = await this.projectsService.importScriptToChapters(turn.thread.projectId, {
      sourceText: scriptInput.sourceText,
      sourceName: scriptInput.sourceName,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
    });

    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "import_script_to_chapters",
      status: "succeeded",
      summary: `已根据${scriptInput.sourceName}整理并写入 ${result.chapters.length} 个章节，当前打开 ${result.currentChapter.title}。`,
      chapters: result.chapters,
      currentChapterId: result.currentChapter.id,
      analysis: null,
      inspirationSeeds: null,
      revision: result.revision,
      createdAt: now,
    };
  }

  private createScriptImportAnalysisToolResult(
    turn: DialogueTurn,
    toolCallId: string,
    sourceName: string,
    analysis: ScriptImportAnalysis,
  ): DialogueToolResult {
    const now = new Date().toISOString();
    const status = analysis.decision === "ready_to_import"
      ? "succeeded"
      : analysis.decision === "needs_user_confirmation"
        ? "needs_user_confirmation"
        : "failed";

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "analyze_script_import",
      status,
      summary: this.getScriptImportAnalysisSummary(sourceName, analysis),
      chapters: [],
      currentChapterId: null,
      analysis,
      inspirationSeeds: null,
      revision: null,
      createdAt: now,
    };
  }

  private getScriptImportAnalysisSummary(sourceName: string, analysis: ScriptImportAnalysis): string {
    if (analysis.decision === "ready_to_import") {
      return `已检查${sourceName}：${analysis.reason} 接下来会写入章节草稿。`;
    }

    if (analysis.decision === "needs_user_confirmation") {
      return `已检查${sourceName}：${analysis.reason} ${analysis.risk ?? ""} 请回复“确认导入”继续，或回复“取消导入”。`;
    }

    return `已检查${sourceName}：${analysis.reason} ${analysis.risk ?? ""} 本次没有写入章节。`;
  }

  private async tryHandleScriptInspiration(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult | null> {
    const pendingKey = this.getPendingInspirationKey(turn.thread.projectId, turn.normalizedStepKey);
    const pending = this.pendingInspirationSeeds.get(pendingKey);
    const selectedSeed = pending ? this.resolveSelectedInspirationSeed(input, pending.seeds) : null;
    if (pending && selectedSeed) {
      this.pendingInspirationSeeds.delete(pendingKey);
      return this.createGenerateScriptFromSeedToolResult(turn, input, selectedSeed, pending.prompt);
    }

    if (pending && this.isCancellingInspiration(input.content)) {
      this.pendingInspirationSeeds.delete(pendingKey);
      return this.createGenerateInspirationSeedsToolResult(turn, [], "已取消这组灵感方向，本次没有写入章节。");
    }

    if (!this.shouldGenerateInspirationSeeds(input)) {
      return null;
    }

    let seeds: ScriptInspirationSeed[];
    try {
      seeds = await this.generateInspirationSeedsWithAI(turn, input);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_inspiration_seeds",
        `灵感种子生成失败：${this.getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    this.pendingInspirationSeeds.set(pendingKey, {
      seeds,
      prompt: input.content,
      chapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      createdAt: new Date().toISOString(),
    });
    return this.createGenerateInspirationSeedsToolResult(turn, seeds);
  }

  private async createGenerateScriptFromSeedToolResult(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
  ): Promise<DialogueToolResult> {
    const chapterId = turn.snapshot.currentChapter?.id ?? turn.thread.chapterId;
    if (!chapterId) {
      return this.createFailedToolResult(turn, "generate_script_from_seed", "当前项目还没有可写入的章节，请先创建或打开第 1 章。");
    }

    const toolCallId = randomUUID();
    let sourceText: string;
    try {
      sourceText = await this.generateScriptFromSeedWithAI(turn, input, seed, seedPrompt);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_seed",
        `章节草稿生成失败：${this.getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, chapterId, {
      sourceText,
      title: `第 1 章：${seed.title}`,
      summary: `根据灵感种子「${seed.title}」生成第 1 章草稿。`,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      operation: "generate_script_from_seed",
    });
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "generate_script_from_seed",
      status: "succeeded",
      summary: `已选择方向「${seed.title}」，并生成 ${result.chapter.title} 草稿。来源：${this.formatRevisionSource(result.revision)}`,
      chapters: result.chapters,
      currentChapterId: result.chapter.id,
      analysis: null,
      inspirationSeeds: null,
      revision: result.revision,
      createdAt: now,
    };
  }

  private async tryHandleChapterDraftUpdate(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<DialogueToolResult | null> {
    if (!this.shouldUpdateChapterDraft(input, turn.snapshot)) {
      return null;
    }

    const chapterId = input.chapterId ?? turn.snapshot.currentChapter?.id ?? turn.thread.chapterId;
    if (!chapterId) {
      return this.createFailedToolResult(turn, "update_chapter_draft", "当前没有可编辑章节，请先打开一个章节。");
    }

    const sourceText = (input.context?.sourceText ?? turn.snapshot.currentChapter?.sourceText ?? "").trim();
    if (!sourceText) {
      return this.createFailedToolResult(turn, "update_chapter_draft", "当前章节还没有正文，无法直接改写。可以先让我生成灵感种子或第 1 章草稿。");
    }

    const toolCallId = randomUUID();
    let updatedSourceText: string;
    try {
      updatedSourceText = await this.rewriteChapterDraftWithAI(turn, input, sourceText);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "update_chapter_draft",
        `章节草稿改写失败：${this.getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const summary = this.summarizeDraftUpdate(input.content);
    const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, chapterId, {
      sourceText: updatedSourceText,
      summary,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      operation: "update_chapter_draft",
    });
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "update_chapter_draft",
      status: "succeeded",
      summary: `已通过受控工具更新当前章节草稿：${summary} 来源：${this.formatRevisionSource(result.revision)}`,
      chapters: result.chapters,
      currentChapterId: result.chapter.id,
      analysis: null,
      inspirationSeeds: null,
      revision: result.revision,
      createdAt: now,
    };
  }

  private createGenerateInspirationSeedsToolResult(
    turn: DialogueTurn,
    seeds: ScriptInspirationSeed[],
    fallbackSummary?: string,
  ): DialogueToolResult {
    const now = new Date().toISOString();
    const summary = fallbackSummary ?? [
      "我根据剧本灵感 skill 生成了 5 个漫画剧本方向，回复“选第 1 个”到“选第 5 个”就可以生成第 1 章草稿：",
      ...seeds.map((seed) => `${seed.order}. ${seed.title}：${seed.logline} 冲突：${seed.keyConflict} 画面钩子：${seed.visualHook}`),
    ].join("\n");

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_inspiration_seeds",
      status: seeds.length > 0 ? "succeeded" : "failed",
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      analysis: null,
      inspirationSeeds: seeds,
      revision: null,
      createdAt: now,
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
      analysis: null,
      inspirationSeeds: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private shouldGenerateInspirationSeeds(input: SendDialogueMessageRequest): boolean {
    if (input.intent === "generate_inspiration_seeds") {
      return true;
    }

    const content = input.content.trim();
    return /(帮我|给我|想|找|生成|来点|有没有).{0,10}(灵感|点子|创意|方向|题材|故事种子)|没有灵感|没想法|不知道写什么/.test(content);
  }

  private async generateInspirationSeedsWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): Promise<ScriptInspirationSeed[]> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildInspirationSeedsPrompt(turn, input),
    });

    return this.parseInspirationSeeds(response.content);
  }

  private buildInspirationSeedsPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
    const snapshot = turn.snapshot;
    const tags = snapshot.project.genreTags.length > 0 ? snapshot.project.genreTags.join("、") : "未设置";
    const currentChapterText = snapshot.currentChapter?.sourceText?.trim() || "（当前章节为空）";

    return [
      "你正在为 AI漫游执行剧本阶段 skill：script-inspiration-seeding。",
      "任务：根据用户输入，为漫画项目生成 5 个可选择的灵感种子。",
      "",
      "硬性规则：",
      "- 必须生成 5 个，不是 3 个。",
      "- 只生成灵感种子，不写章节正文，不声称已经更新项目文件。",
      "- 每个方向要明显不同，能支撑后续生成第 1 章。",
      "- 不要返回固定模板，要结合用户输入、项目名称、题材标签和当前章节状态。",
      "- 必须先返回一个 JSON 代码块，后端会解析这个 JSON。",
      "",
      "JSON 结构必须是：",
      "```json",
      "{\"seeds\":[{\"title\":\"\",\"genreTags\":[\"\"],\"logline\":\"\",\"keyConflict\":\"\",\"visualHook\":\"\",\"firstChapterDirection\":\"\"}]}",
      "```",
      "",
      "JSON 后可以用中文简短提示用户：回复“选第 N 个”即可生成第 1 章草稿。",
      "",
      `项目名称：${snapshot.project.name}`,
      `题材标签：${tags}`,
      `画幅：${snapshot.project.comicFormat}`,
      `画风：${snapshot.project.artStyle}`,
      "当前章节正文：",
      currentChapterText.slice(0, 1200),
      "用户本轮输入：",
      input.content,
    ].join("\n");
  }

  private parseInspirationSeeds(content: string): ScriptInspirationSeed[] {
    const jsonText = this.extractJsonPayload(content);
    const value = JSON.parse(jsonText) as unknown;
    const rawSeeds = Array.isArray(value)
      ? value
      : typeof value === "object" && value !== null && Array.isArray((value as { seeds?: unknown }).seeds)
        ? (value as { seeds: unknown[] }).seeds
        : null;

    if (!rawSeeds || rawSeeds.length < 5) {
      throw new Error("AI 没有按约定返回 5 个灵感种子");
    }

    return rawSeeds.slice(0, 5).map((rawSeed, index) => this.normalizeInspirationSeed(rawSeed, index));
  }

  private normalizeInspirationSeed(rawSeed: unknown, index: number): ScriptInspirationSeed {
    if (typeof rawSeed !== "object" || rawSeed === null || Array.isArray(rawSeed)) {
      throw new Error("灵感种子格式不正确");
    }

    const record = rawSeed as Record<string, unknown>;
    const title = this.getRequiredString(record, "title");
    const logline = this.getRequiredString(record, "logline");
    const keyConflict = this.getRequiredString(record, "keyConflict");
    const visualHook = this.getRequiredString(record, "visualHook");
    const firstChapterDirection = this.getRequiredString(record, "firstChapterDirection");
    const genreTags = Array.isArray(record.genreTags)
      ? record.genreTags.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
      : [];

    return {
      id: randomUUID(),
      order: index + 1,
      title,
      genreTags,
      logline,
      keyConflict,
      visualHook,
      firstChapterDirection,
    };
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

  private resolveSelectedInspirationSeed(
    input: SendDialogueMessageRequest,
    seeds: ScriptInspirationSeed[],
  ): ScriptInspirationSeed | null {
    if (input.intent === "generate_script_from_seed" && seeds.length > 0) {
      return this.findSeedByContent(input.content, seeds) ?? seeds[0];
    }

    return this.findSeedByContent(input.content, seeds);
  }

  private findSeedByContent(content: string, seeds: ScriptInspirationSeed[]): ScriptInspirationSeed | null {
    const normalized = content.trim();
    const numericMatch = normalized.match(/(?:选|选择|就|要|用|按|第)\s*([1-9一二三四五六七八九十])\s*(?:个|条|号|种|方向)?/)
      ?? normalized.match(/([1-9一二三四五六七八九十])\s*(?:个|条|号|种|方向)/);
    if (numericMatch) {
      const order = this.parseChineseOrder(numericMatch[1]);
      const seed = seeds.find((item) => item.order === order);
      if (seed) {
        return seed;
      }
    }

    return seeds.find((seed) => normalized.includes(seed.title)
      || seed.genreTags.some((tag) => normalized.includes(tag))
      || normalized.includes(seed.title.slice(0, 4))) ?? null;
  }

  private parseChineseOrder(value: string): number {
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };

    return Number(value) || map[value] || 0;
  }

  private isCancellingInspiration(content: string): boolean {
    return /(取消|不要|先不|不选|换一批|重新来|算了).{0,8}(灵感|方向|种子|生成)?/.test(content.trim());
  }

  private shouldUpdateChapterDraft(input: SendDialogueMessageRequest, snapshot: WorkbenchSnapshot): boolean {
    if (input.intent === "update_chapter_draft") {
      return true;
    }

    const content = input.content.trim();
    const hasChapterText = (input.context?.sourceText ?? snapshot.currentChapter?.sourceText ?? "").trim().length > 0;
    if (!hasChapterText) {
      return false;
    }

    const asksForCurrentChapter = /(这一章|这章|当前章|当前章节|本章|这段|当前草稿|剧本)/.test(content);
    const asksForRewrite = /(改|改写|润色|重写|调整|优化|压缩|扩写|加强|写得|变得|更紧张|更刺激|节奏|对白|冲突)/.test(content);
    return asksForRewrite && (asksForCurrentChapter || /润色对白|优化开场|加强冲突|节奏加快|写得更紧张/.test(content));
  }

  private async generateScriptFromSeedWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildScriptFromSeedPrompt(turn, input, seed, seedPrompt),
    });

    return this.ensureChapterMarkdown(response.content, seed.title);
  }

  private buildScriptFromSeedPrompt(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
  ): string {
    return [
      "你正在为 AI漫游执行剧本阶段 skill：script-chapter-drafting。",
      "任务：根据用户选中的灵感种子，生成第 1 章完整漫画剧本草稿。",
      "",
      "硬性规则：",
      "- 只返回章节 Markdown 正文，不要返回 JSON，不要包代码块。",
      "- 必须包含 Markdown 一级标题，例如 `# 第 1 章：标题`。",
      "- 内容要能直接写入 `chapters/chapter-001/script.md`。",
      "- 保持漫画剧本可读性：画面、角色动作、冲突推进和对白要清楚。",
      "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
      "",
      `项目名称：${turn.snapshot.project.name}`,
      `用户最初找灵感时说：${seedPrompt}`,
      `用户当前选择：${input.content}`,
      "选中的灵感种子：",
      JSON.stringify({
        title: seed.title,
        genreTags: seed.genreTags,
        logline: seed.logline,
        keyConflict: seed.keyConflict,
        visualHook: seed.visualHook,
        firstChapterDirection: seed.firstChapterDirection,
      }, null, 2),
    ].join("\n");
  }

  private async rewriteChapterDraftWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    sourceText: string,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildChapterEditingPrompt(turn, input, sourceText),
    });

    return this.ensureChapterMarkdown(response.content, turn.snapshot.currentChapter?.title ?? "第 1 章");
  }

  private buildChapterEditingPrompt(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    sourceText: string,
  ): string {
    return [
      "你正在为 AI漫游执行剧本阶段 skill：script-chapter-editing。",
      "任务：根据用户要求，改写当前章节草稿。",
      "",
      "硬性规则：",
      "- 必须返回完整更新后的章节 Markdown，不要只返回建议或片段。",
      "- 不要返回 JSON，不要包代码块。",
      "- 必须保留或补上 Markdown 一级标题。",
      "- 尊重原文核心设定，不擅自换故事方向。",
      "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
      "",
      `项目名称：${turn.snapshot.project.name}`,
      `当前章节：${turn.snapshot.currentChapter?.title ?? "当前章节"}`,
      "用户改写要求：",
      input.content,
      "当前编辑器最新草稿：",
      sourceText,
    ].join("\n");
  }

  private ensureChapterMarkdown(content: string, fallbackTitle: string): string {
    const markdown = this.stripMarkdownFence(content).trim();
    if (!markdown) {
      throw new Error("AI 没有返回章节正文");
    }

    if (/^#{1,3}\s+/m.test(markdown)) {
      return `${markdown}\n`;
    }

    return `# 第 1 章：${fallbackTitle}\n\n${markdown}\n`;
  }

  private stripMarkdownFence(content: string): string {
    const fenced = content.trim().match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
    return fenced?.[1]?.trim() ?? content.trim();
  }

  private summarizeDraftUpdate(instruction: string): string {
    if (/紧张|刺激|压迫|悬疑|冲突/.test(instruction)) {
      return "强化当前章节紧张感和冲突推进。";
    }

    if (/节奏|加快|压缩/.test(instruction)) {
      return "加快当前章节节奏并压缩铺垫。";
    }

    if (/对白|台词/.test(instruction)) {
      return "润色当前章节对白和潜台词。";
    }

    return "根据用户要求更新当前章节草稿。";
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getScriptOrganizationInput(input: SendDialogueMessageRequest): ScriptOrganizationInput | null {
    if (!this.shouldOrganizeProvidedScript(input)) {
      return null;
    }

    const attachments = this.getTextAttachments(input.attachments);
    if (attachments.length > 0) {
      return {
        sourceName: attachments.length === 1 ? attachments[0].name : `${attachments.length} 个附件`,
        sourceText: attachments.map((attachment) => attachment.content).join("\n\n"),
      };
    }

    return {
      sourceName: "粘贴剧本",
      sourceText: input.content,
    };
  }

  private shouldOrganizeProvidedScript(input: SendDialogueMessageRequest): boolean {
    if (input.intent === "organize_script_to_chapters") {
      return true;
    }

    const content = input.content.trim();
    const hasAttachment = this.getTextAttachments(input.attachments).length > 0;
    const hasExplicitIntent = /(整理|拆分|拆成|导入|写入).{0,8}(章节|剧本)|按章节|整理成章节/.test(content);
    if (hasExplicitIntent) {
      return true;
    }

    if (hasAttachment) {
      return false;
    }

    return content.length >= 1200;
  }

  private hasScriptPayload(input: SendDialogueMessageRequest): boolean {
    return this.getTextAttachments(input.attachments).length > 0 || input.content.trim().length >= 1200;
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

    return [
      "你是 AI漫游的漫画创作助手，当前运行在项目工作区的左侧对话框。",
      `当前项目：${input.snapshot.project.name}`,
      `当前步骤：${stepLabel}`,
      `当前章节：${chapterTitle}`,
      "工作原则：",
      "1. 普通聊天只提供建议、总结、提问和结构化分析。",
      "2. 当用户明确要求整理成章节、上传附件整理、或粘贴长剧本时，系统会通过受控工具写入章节草稿。",
      "3. 不要声称你直接操作了本地物理文件；只能说明通过系统工具更新章节草稿。",
      "4. 回复使用中文，优先围绕漫画剧本创作、人物目标、冲突、节奏和画面化表达。",
      "当前章节剧本文档：",
      sourceText || "（用户还没有填写剧本内容）",
      "本轮附件文本：",
      input.attachmentText || "（本轮没有文本附件）",
      "最近对话：",
      recentDialogue || "（暂无历史对话）",
      "用户本次消息：",
      input.userContent,
    ].join("\n\n");
  }
}
