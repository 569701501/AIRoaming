import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AIRuntimeModelSelection,
  DialogueAttachmentInput,
  DialogueMessageItem,
  DialogueStreamEvent,
  DialogueThread,
  DialogueToolResult,
  ProjectScriptOutline,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  ScriptImportAnalysis,
  ScriptInspirationSeed,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import {
  SCRIPT_INSPIRATION_SEED_COUNT,
  extractChapterScriptTitle,
  extractScriptOutlineTitle,
  formatScriptOutlineDocument,
  formatChapterScriptDocument,
  getChapterScriptForbiddenOutputPrompt,
  getChapterScriptFormatPrompt,
  getScriptOutlineFormatPrompt,
  isChapterScriptDocument,
  isScriptOutlineDocument,
  stripChapterScriptName,
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

interface PendingScriptOutline {
  outline: ProjectScriptOutline;
  seed: ScriptInspirationSeed;
  seedPrompt: string;
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
  private readonly activeStreamingAssistantMessageIds = new Set<string>();
  private readonly pendingScriptImports = new Map<string, PendingScriptImport>();
  private readonly pendingInspirationSeeds = new Map<string, PendingInspirationSeeds>();
  private readonly pendingScriptOutlines = new Map<string, PendingScriptOutline>();

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
  ) {}

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

    return this.shouldOrganizeProvidedScript(input)
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
    const importResults = await this.tryHandleScriptImport(turn, input);
    if (importResults.length > 0) {
      return importResults;
    }

    const inspirationResult = await this.tryHandleScriptInspiration(turn, input, signal);
    if (inspirationResult) {
      return [inspirationResult];
    }

    const updateResult = await this.tryHandleChapterDraftUpdate(turn, input, signal);
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
      currentChapter: result.currentChapter,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
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
      currentChapter: null,
      analysis,
      inspirationSeeds: null,
      scriptOutline: null,
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
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    const outlineResult = await this.tryHandlePendingScriptOutline(turn, input, signal);
    if (outlineResult) {
      return outlineResult;
    }

    const pendingKey = this.getPendingInspirationKey(turn.thread.projectId, turn.normalizedStepKey);
    const pending = this.pendingInspirationSeeds.get(pendingKey);
    const selectedSeed = pending ? this.resolveSelectedInspirationSeed(input, pending.seeds) : null;
    if (pending && selectedSeed) {
      this.pendingInspirationSeeds.delete(pendingKey);
      return this.createGenerateScriptOutlineFromSeedToolResult(turn, input, selectedSeed, pending.prompt, undefined, signal);
    }

    if (pending && this.isCancellingInspiration(input.content)) {
      this.pendingInspirationSeeds.delete(pendingKey);
      return this.createGenerateInspirationSeedsToolResult(turn, [], "已取消这组灵感方向，本次没有写入章节。");
    }

    if (pending && this.isSelectingInspirationSeed(input.content)) {
      return this.createFailedToolResult(
        turn,
        "generate_script_outline_from_seed",
        "我没识别出你选的是哪一个灵感种子。请回复“选第 1 个”“选第 2 个”或“选第 3 个”，也可以直接点击灵感卡片里的“生成大纲”。",
      );
    }

    if (!this.shouldGenerateInspirationSeeds(input)) {
      return null;
    }

    let seeds: ScriptInspirationSeed[];
    try {
      seeds = await this.generateInspirationSeedsWithAI(turn, input, signal);
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

  private async tryHandlePendingScriptOutline(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    const pendingKey = this.getPendingScriptOutlineKey(turn.thread.projectId, turn.normalizedStepKey);
    const pending = this.pendingScriptOutlines.get(pendingKey);
    const outline = pending?.outline ?? turn.snapshot.scriptOutline;

    if (!outline) {
      return null;
    }

    if (input.intent === "generate_script_from_outline" || this.isConfirmingScriptOutline(input.content)) {
      this.pendingScriptOutlines.delete(pendingKey);
      return this.createGenerateScriptFromOutlineToolResult(turn, input, outline, signal);
    }

    if (this.isCancellingScriptOutline(input.content)) {
      this.pendingScriptOutlines.delete(pendingKey);
      return this.createGenerateScriptOutlineToolResult(
        turn,
        outline,
        "已取消当前剧本大纲确认，本次没有生成章节。你可以继续让我重新找灵感或重新生成大纲。",
        "failed",
      );
    }

    if (!pending) {
      return null;
    }

    return this.createGenerateScriptOutlineFromSeedToolResult(turn, input, pending.seed, pending.seedPrompt, outline, signal);
  }

  private async createGenerateScriptOutlineFromSeedToolResult(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    previousOutline?: ProjectScriptOutline,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult> {
    const toolCallId = randomUUID();
    let sourceText: string;
    try {
      sourceText = await this.generateScriptOutlineFromSeedWithAI(turn, input, seed, seedPrompt, previousOutline?.sourceText, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_outline_from_seed",
        `剧本大纲生成失败：${this.getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const outline = await this.projectsService.saveScriptOutlineFromAI(turn.thread.projectId, {
      sourceText,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
    });

    this.pendingScriptOutlines.set(this.getPendingScriptOutlineKey(turn.thread.projectId, turn.normalizedStepKey), {
      outline,
      seed,
      seedPrompt,
      chapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      createdAt: new Date().toISOString(),
    });

    return this.createGenerateScriptOutlineToolResult(
      turn,
      outline,
      [
        `已根据方向「${seed.title}」生成项目级剧本大纲，并保存到 ${outline.outlinePath}。`,
        "请确认这份大纲是否可以继续生成第 1 章。确认就回复“确认大纲”或点击按钮；不满意请直接说修改要求，我会重新生成大纲。",
        "",
        outline.sourceText.trim(),
      ].join("\n"),
      "needs_user_confirmation",
    );
  }

  private async createGenerateScriptFromOutlineToolResult(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    outline: ProjectScriptOutline,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult> {
    const chapterId = input.chapterId ?? turn.snapshot.currentChapter?.id ?? turn.thread.chapterId;
    if (!chapterId) {
      return this.createFailedToolResult(turn, "generate_script_from_outline", "当前项目还没有可写入的章节，请先创建或打开第 1 章。");
    }

    const confirmedOutline = await this.projectsService.confirmScriptOutline(turn.thread.projectId);
    const toolCallId = randomUUID();
    let sourceText: string;
    try {
      sourceText = await this.generateScriptFromOutlineWithAI(turn, input, confirmedOutline, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_outline",
        `第一章草稿生成失败：${this.getErrorMessage(error)}。剧本大纲已保存，章节正文本次没有写入。`,
      );
    }

    const chapterTitle = extractChapterScriptTitle(sourceText) ?? `第 1 章：${confirmedOutline.title}`;
    const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, chapterId, {
      sourceText,
      title: chapterTitle,
      summary: `根据已确认剧本大纲「${confirmedOutline.title}」生成 ${chapterTitle} 草稿。`,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      operation: "generate_script_from_outline",
    });
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "generate_script_from_outline",
      status: "succeeded",
      summary: `已确认剧本大纲「${confirmedOutline.title}」，并只生成当前一章：${result.chapter.title}。来源：${this.formatRevisionSource(result.revision)}`,
      chapters: result.chapters,
      currentChapterId: result.chapter.id,
      currentChapter: result.chapter,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: confirmedOutline,
      revision: result.revision,
      createdAt: now,
    };
  }

  private createGenerateScriptOutlineToolResult(
    turn: DialogueTurn,
    outline: ProjectScriptOutline,
    summary: string,
    status: DialogueToolResult["status"],
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "generate_script_outline_from_seed",
      status,
      summary,
      chapters: [],
      currentChapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      currentChapter: turn.snapshot.currentChapter ?? null,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: outline,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private async createGenerateScriptFromSeedToolResult(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult> {
    const chapterId = turn.snapshot.currentChapter?.id ?? turn.thread.chapterId;
    if (!chapterId) {
      return this.createFailedToolResult(turn, "generate_script_from_seed", "当前项目还没有可写入的章节，请先创建或打开第 1 章。");
    }

    const toolCallId = randomUUID();
    let sourceText: string;
    try {
      sourceText = await this.generateScriptFromSeedWithAI(turn, input, seed, seedPrompt, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_seed",
        `章节草稿生成失败：${this.getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const chapterTitle = extractChapterScriptTitle(sourceText) ?? `第 1 章：${seed.title}`;
    const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, chapterId, {
      sourceText,
      title: chapterTitle,
      summary: `根据灵感种子「${seed.title}」生成 ${chapterTitle} 草稿。`,
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
      currentChapter: result.chapter,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
      revision: result.revision,
      createdAt: now,
    };
  }

  private async tryHandleChapterDraftUpdate(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
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
      updatedSourceText = await this.rewriteChapterDraftWithAI(turn, input, sourceText, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "update_chapter_draft",
        `章节草稿改写失败：${this.getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const summary = this.summarizeDraftUpdate(input.content);
    const chapterTitle = extractChapterScriptTitle(updatedSourceText);
    const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, chapterId, {
      sourceText: updatedSourceText,
      title: chapterTitle ?? undefined,
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
      currentChapter: result.chapter,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
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
      `我根据剧本灵感 skill 生成了 ${SCRIPT_INSPIRATION_SEED_COUNT} 个漫画剧本方向。回复“选第 1 个”“选第 2 个”或“选第 3 个”就可以生成项目级剧本大纲；不喜欢也可以说“换一批”：`,
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
      currentChapter: turn.snapshot.currentChapter ?? null,
      analysis: null,
      inspirationSeeds: seeds,
      scriptOutline: null,
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
      currentChapter: turn.snapshot.currentChapter ?? null,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: null,
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
    signal?: AbortSignal,
  ): Promise<ScriptInspirationSeed[]> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildInspirationSeedsPrompt(turn, input),
      signal,
    });

    return this.parseInspirationSeeds(response.content);
  }

  private buildInspirationSeedsPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
    const snapshot = turn.snapshot;
    const tags = snapshot.project.genreTags.length > 0 ? snapshot.project.genreTags.join("、") : "未设置";
    const currentChapterText = snapshot.currentChapter?.sourceText?.trim() || "（当前章节为空）";

    return [
      "你正在为 AI漫游执行剧本阶段 skill：script-inspiration-seeding。",
      `任务：根据用户输入，为漫画项目生成 ${SCRIPT_INSPIRATION_SEED_COUNT} 个可选择的灵感种子。`,
      this.buildScriptStageBoundaryContract(),
      "",
      "硬性规则：",
      `- 必须生成 ${SCRIPT_INSPIRATION_SEED_COUNT} 个灵感种子，不多也不少。`,
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
      "JSON 后可以用中文简短提示用户：回复“选第 N 个”即可生成项目级剧本大纲；不喜欢可以要求重新生成 3 个。",
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

    if (!rawSeeds || rawSeeds.length < SCRIPT_INSPIRATION_SEED_COUNT) {
      throw new Error(`AI 没有按约定返回 ${SCRIPT_INSPIRATION_SEED_COUNT} 个灵感种子`);
    }

    return rawSeeds.slice(0, SCRIPT_INSPIRATION_SEED_COUNT).map((rawSeed, index) => this.normalizeInspirationSeed(rawSeed, index));
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
    if ((input.intent === "generate_script_from_seed" || input.intent === "generate_script_outline_from_seed") && seeds.length > 0) {
      return this.findSeedByContent(input.content, seeds) ?? seeds[0];
    }

    return this.findSeedByContent(input.content, seeds);
  }

  private findSeedByContent(content: string, seeds: ScriptInspirationSeed[]): ScriptInspirationSeed | null {
    const normalized = content.trim();
    const numericMatch = normalized.match(/(?:选|选择|就|要|用|按|第)\s*([1-9一二三四五六七八九十])\s*(?:个|条|号|种|方向)?/)
      ?? normalized.match(/([1-9一二三四五六七八九十])\s*(?:个|条|号|种|方向)/)
      ?? (this.isBareInspirationOrder(normalized) ? normalized.match(/^([1-9一二三四五六七八九十])$/) : null);
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

  private isBareInspirationOrder(content: string): boolean {
    return /^[1-9一二三四五六七八九十]$/.test(content.trim());
  }

  private isSelectingInspirationSeed(content: string): boolean {
    const normalized = content.trim();
    return this.isBareInspirationOrder(normalized)
      || /(选|选择|就|要|用|按|喜欢|定|决定|生成|写|这个|那个|第)\s*[1-9一二三四五六七八九十这个那种条号方向]/.test(normalized)
      || /第\s*[1-9一二三四五六七八九十]\s*(个|条|号|种|方向)?/.test(normalized);
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

  private isConfirmingScriptOutline(content: string): boolean {
    const text = content.trim();
    if (/(不行|不可以|不满意|不喜欢|先别|不要)/.test(text)) {
      return false;
    }

    return /^(确认|可以|继续|同意|就这个|没问题|通过)$/.test(text)
      || /(确认|通过).{0,8}(大纲|方向)/.test(text)
      || /(按这个|就这个).{0,8}(生成|写|继续)/.test(text)
      || /生成\s*(?:第\s*)?(?:1|一)\s*章|生成第一章/.test(text);
  }

  private isCancellingScriptOutline(content: string): boolean {
    return /(取消|不要|先不|不生成|别生成|算了).{0,10}(大纲|第一章|章节|生成)?/.test(content.trim());
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

  private async generateScriptOutlineFromSeedWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    previousOutline?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildScriptOutlineFromSeedPrompt(turn, input, seed, seedPrompt, previousOutline),
      signal,
    });

    return this.ensureScriptOutlineMarkdown(response.content, seed.title);
  }

  private buildScriptOutlineFromSeedPrompt(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    previousOutline?: string,
  ): string {
    return [
      "你正在为 AI漫游执行剧本阶段 skill：script-outline-drafting。",
      "任务：根据用户选中的灵感种子，生成或重生成项目级「剧本大纲」。",
      this.buildScriptStageBoundaryContract(),
      "",
      "硬性规则：",
      "- 只返回剧本大纲 Markdown 正文，不要返回 JSON，不要包代码块。",
      "- 必须按「剧本大纲」固定格式输出，不要改名、删块或合并块。",
      `- 剧集名称优先使用选中的灵感种子标题：${seed.title}`,
      "- 大纲是项目级产物，用于让用户确认故事方向；不要写章节正文。",
      "- 情节概要按漫剧集数段落写，例如「第 1 - 2 集：...」，但具体内容必须来自当前项目和灵感种子。",
      "- 剧集章数要说明每集或每组集数对应的漫画章节规划；第一版后续只会生成当前一章，不会一次性生成多章。",
      "- 不要套用用户示例里的人名、古装重生剧情、角色关系或情节，只参考格式。",
      "- 不要声称你直接操作本地文件；保存由后端受控工具完成。",
      "",
      getScriptOutlineFormatPrompt(),
      "",
      `项目名称：${turn.snapshot.project.name}`,
      `题材标签：${turn.snapshot.project.genreTags.length > 0 ? turn.snapshot.project.genreTags.join("、") : "未设置"}`,
      `画幅：${turn.snapshot.project.comicFormat}`,
      `画风：${turn.snapshot.project.artStyle}`,
      `用户最初找灵感时说：${seedPrompt}`,
      `用户当前要求：${input.content}`,
      "选中的灵感种子：",
      JSON.stringify({
        title: seed.title,
        genreTags: seed.genreTags,
        logline: seed.logline,
        keyConflict: seed.keyConflict,
        visualHook: seed.visualHook,
        firstChapterDirection: seed.firstChapterDirection,
      }, null, 2),
      previousOutline ? "上一版剧本大纲：" : "",
      previousOutline ?? "",
    ].filter(Boolean).join("\n");
  }

  private async generateScriptFromOutlineWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    outline: ProjectScriptOutline,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildScriptFromOutlinePrompt(turn, input, outline),
      signal,
    });

    return this.ensureChapterMarkdown(response.content, turn.snapshot.currentChapter?.title ?? "第 1 章");
  }

  private buildScriptFromOutlinePrompt(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    outline: ProjectScriptOutline,
  ): string {
    return [
      "你正在为 AI漫游执行剧本阶段 skill：script-chapter-drafting。",
      "任务：根据用户已确认的项目级「剧本大纲」，只生成当前一章的完整「章节剧本」。",
      this.buildScriptStageBoundaryContract(),
      "",
      "硬性规则：",
      "- 只返回章节 Markdown 正文，不要返回 JSON，不要包代码块。",
      "- 必须按「章节剧本」固定格式输出，不要改名、删块或合并块。",
      `- 项目级剧本名称是「${outline.title}」，只作为上下文使用，不要在章节正文里输出“剧本名称”。`,
      "- 只生成当前一章，不要一次性生成多章，也不要输出整部大纲。",
      "- 内容要能直接写入当前章节的 `script.md`。",
      "- 「视觉基调」只是方向，不是图片 Prompt。",
      "- 「剧本正文」里可以有场景、人物、动作和对白，但不能输出正式场景列表、剧情节拍、分镜剧本或镜头编号。",
      "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
      "",
      getChapterScriptFormatPrompt(),
      "",
      getChapterScriptForbiddenOutputPrompt(),
      "",
      `当前章节：${turn.snapshot.currentChapter?.title ?? "第 1 章"}`,
      `用户确认消息：${input.content}`,
      "已确认剧本大纲：",
      outline.sourceText,
    ].join("\n");
  }

  private async generateScriptFromSeedWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildScriptFromSeedPrompt(turn, input, seed, seedPrompt),
      signal,
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
      "任务：根据用户选中的灵感种子，生成第 1 章完整「章节剧本」。",
      this.buildScriptStageBoundaryContract(),
      "",
      "硬性规则：",
      "- 只返回章节 Markdown 正文，不要返回 JSON，不要包代码块。",
      "- 必须按「章节剧本」固定格式输出，不要改名、删块或合并块。",
      `- 项目级剧本名称是「${seed.title}」，只作为上下文使用，不要在章节正文里输出“剧本名称”。`,
      "- 章节标题是本章标题，后端会把它同步为章节列表标题。",
      "- 内容要能直接写入 `chapters/chapter-001/script.md`。",
      "- 「视觉基调」只是方向，不是图片 Prompt。",
      "- 「剧本正文」里可以有场景、人物、动作和对白，但不能输出正式场景列表、剧情节拍、分镜剧本或镜头编号。",
      "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
      "",
      getChapterScriptFormatPrompt(),
      "",
      getChapterScriptForbiddenOutputPrompt(),
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
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureOpenCodeSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: this.buildChapterEditingPrompt(turn, input, sourceText),
      signal,
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
      this.buildScriptStageBoundaryContract(),
      "",
      "硬性规则：",
      "- 必须返回完整更新后的章节 Markdown，不要只返回建议或片段。",
      "- 不要返回 JSON，不要包代码块。",
      "- 必须保留或补齐「章节剧本」固定格式。",
      "- 不要在章节正文里输出“剧本名称”；剧本名称属于项目级标题，会在章节下拉框右侧展示。",
      "- 如果你调整了章节标题，必须同步修改 `## 第 X 章：章节标题` 这一行。",
      "- 尊重原文核心设定，不擅自换故事方向。",
      "- 不要新增主体列表、正式场景列表、剧情节拍、分镜剧本、镜头编号或图片 Prompt。",
      "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
      "",
      getChapterScriptFormatPrompt(),
      "",
      getChapterScriptForbiddenOutputPrompt(),
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

    if (isChapterScriptDocument(markdown)) {
      return stripChapterScriptName(markdown);
    }

    return formatChapterScriptDocument({
      chapterTitle: fallbackTitle,
      sourceText: stripChapterScriptName(markdown),
    });
  }

  private ensureScriptOutlineMarkdown(content: string, fallbackTitle: string): string {
    const markdown = this.stripMarkdownFence(content).trim();
    if (!markdown) {
      throw new Error("AI 没有返回剧本大纲");
    }

    if (isScriptOutlineDocument(markdown)) {
      return markdown.endsWith("\n") ? markdown : `${markdown}\n`;
    }

    const title = extractScriptOutlineTitle(markdown) ?? fallbackTitle;
    return `${formatScriptOutlineDocument({
      title,
      sourceText: markdown,
    })}\n`;
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

  private getPendingScriptOutlineKey(projectId: string, stepKey: string): string {
    return `${projectId}:${stepKey}:script-outline`;
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
    const scriptBoundary = input.stepKey === "project_story" ? this.buildScriptStageBoundaryContract() : "";

    return [
      "你是 AI漫游的漫画创作助手，当前运行在项目工作区的左侧对话框。",
      `当前项目：${input.snapshot.project.name}`,
      `当前步骤：${stepLabel}`,
      `当前章节：${chapterTitle}`,
      scriptBoundary,
      "工作原则：",
      "1. 回复使用中文，优先围绕当前步骤、漫画创作目标和用户正在编辑的产物。",
      "2. 没有明确写入权限或受控工具时，只能给建议、分析、问题清单或候选方案。",
      "3. 不要声称你直接操作了本地物理文件；如确实由系统工具写入，只能说“已通过系统工具更新”。",
      "当前章节剧本文档：",
      sourceText || "（用户还没有填写剧本内容）",
      "项目级剧本大纲：",
      input.snapshot.scriptOutline?.sourceText?.trim() || "（项目还没有保存剧本大纲）",
      "本轮附件文本：",
      input.attachmentText || "（本轮没有文本附件）",
      "最近对话：",
      recentDialogue || "（暂无历史对话）",
      "用户本次消息：",
      input.userContent,
    ].filter(Boolean).join("\n\n");
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
      "- 不在用户选择灵感种子后直接写章节；必须先生成项目级剧本大纲，用户确认大纲后才生成当前一章。",
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
