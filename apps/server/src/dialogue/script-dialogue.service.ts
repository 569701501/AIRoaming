import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ChapterListItem,
  DialogueToolResult,
  ProjectScriptOutline,
  ScriptImportAnalysis,
  ScriptInspirationSeed,
  ScriptRevisionItem,
  SendDialogueMessageRequest,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { SCRIPT_INSPIRATION_SEED_COUNT, extractChapterScriptTitle } from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
  PendingInspirationSeeds,
  PendingScriptImport,
  PendingScriptOutline,
  PendingDialogueCaptureArtifact,
  ScriptOrganizationInput,
} from "./dialogue-types.js";
import {
  hasScriptPayload,
  isCancellingInspiration,
  isCancellingScriptImport,
  isCancellingScriptOutline,
  isConfirmingScriptImport,
  isConfirmingScriptOutline,
  isSelectingInspirationSeed,
  resolveBatchChapterRange,
  resolveRequestedScriptChapterOrder,
  resolveSelectedInspirationSeed,
  shouldGenerateInspirationSeeds,
  shouldOrganizeProvidedScript,
  shouldUpdateChapterDraft,
  getTextAttachments,
  toScriptFromOutlineTarget,
} from "./dialogue-intent.util.js";
import {
  buildChapterEditingPrompt,
  buildInspirationSeedsPrompt,
  buildScriptFromOutlinePrompt,
  buildScriptFromSeedPrompt,
  buildScriptOutlineFromSeedPrompt,
  buildScriptOutlineFromTopicPrompt,
} from "./dialogue-prompt.util.js";
import { parseInspirationSeeds } from "./dialogue-json.util.js";
import {
  ensureChapterMarkdown,
  ensureScriptOutlineMarkdown,
  formatRevisionSource,
  getErrorMessage,
  summarizeDraftUpdate,
} from "./dialogue-text.util.js";
import { getPendingInspirationKey, getPendingScriptOutlineKey } from "./dialogue-key.util.js";

/**
 * 剧本工具链对话编排(从 DialogueService 抽出,见任务 2026-07-02_DialogueService拆分)。
 *
 * 收口剧本阶段的四个子流程:剧本导入 / 灵感种子 / 剧本大纲 / 章节草稿。
 * 持有 3 个进程内 pending Map(pendingScriptImports / pendingInspirationSeeds / pendingScriptOutlines)。
 * AI 调用器依赖 OpenCode session,但 session 解析器由 DialogueService 注入(setEnsureSession),
 * 避免重复持有线程状态。
 */
@Injectable()
export class ScriptDialogueService {
  private readonly pendingScriptImports = new Map<string, PendingScriptImport>();
  private readonly pendingInspirationSeeds = new Map<string, PendingInspirationSeeds>();
  private readonly pendingScriptOutlines = new Map<string, PendingScriptOutline>();

  /** OpenCode session 解析器,由 DialogueService 注入(负责获取/创建 session)。 */
  private ensureSession!: (thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal) => Promise<string>;

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
  ) {}

  setEnsureSession(fn: (thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal) => Promise<string>): void {
    this.ensureSession = fn;
  }

  /**
   * 清理本项目在这 3 个 pending Map 里的条目(用 projectId 前缀匹配)。
   * 返回已删除条目数,供上层清理统计使用。
   */
  clearForProject(projectId: string): number {
    let deletedCount = 0;
    const projectPrefix = `${projectId}:`;
    for (const map of [this.pendingInspirationSeeds, this.pendingScriptOutlines] as Map<string, unknown>[]) {
      for (const key of map.keys()) {
        if (key.startsWith(projectPrefix)) {
          map.delete(key);
          deletedCount += 1;
        }
      }
    }
    // pendingScriptImports 以 threadId 为 key,无法按 projectId 前缀匹配,这里不动;
    // thread 维度的清理由 DialogueService 在删除线程时回调 tryDeleteThreadState。
    return deletedCount;
  }

  /**
   * 清理指定线程在 pendingScriptImports 里的条目(线程被删除时由 DialogueService 回调)。
   * 返回是否删除了条目。
   */
  tryDeleteThreadState(threadId: string): boolean {
    return this.pendingScriptImports.delete(threadId);
  }

  /**
   * 将进程内 pending Map 封口为可写入 runtime-bundle 的纯数据。
   * key 是逻辑槽的一部分，不能使用随机 UUID；这样重复封口/重放仍会落到同一稳定实体。
   */
  capturePendingArtifacts(threads: ReadonlyMap<string, LocalDialogueThread>): PendingDialogueCaptureArtifact[] {
    const artifacts: PendingDialogueCaptureArtifact[] = [];
    for (const [threadId, pending] of this.pendingScriptImports.entries()) {
      const thread = threads.get(threadId);
      if (!thread) continue;
      artifacts.push({
        id: `script-import:${threadId}`,
        projectId: thread.projectId,
        chapterId: thread.chapterId,
        threadId,
        kind: "script_import",
        status: "pending",
        activeSlotKey: `dialogue:${threadId}:script_import`,
        payload: pending,
        schemaVersion: 1,
        createdAt: pending.createdAt,
        updatedAt: pending.createdAt,
      });
    }
    for (const [key, pending] of this.pendingInspirationSeeds.entries()) {
      const projectId = key.endsWith(":inspiration") ? key.slice(0, -":inspiration".length).split(":")[0] : "";
      const stepKey = key.endsWith(":inspiration") ? key.slice(0, -":inspiration".length).slice(projectId.length + 1) : "project_story";
      const thread = [...threads.values()].find((candidate) => candidate.projectId === projectId && candidate.stepKey === stepKey && candidate.chapterId === pending.chapterId) ??
        [...threads.values()].find((candidate) => candidate.projectId === projectId && candidate.stepKey === stepKey);
      if (!thread) continue;
      artifacts.push({
        id: `inspiration-seeds:${key}`,
        projectId,
        chapterId: pending.chapterId,
        threadId: thread.id,
        kind: "inspiration_seeds",
        status: "pending",
        activeSlotKey: `dialogue:${projectId}:${stepKey}:inspiration`,
        payload: pending,
        schemaVersion: 1,
        createdAt: pending.createdAt,
        updatedAt: pending.createdAt,
      });
    }
    for (const [key, pending] of this.pendingScriptOutlines.entries()) {
      const projectId = key.endsWith(":script-outline") ? key.slice(0, -":script-outline".length).split(":")[0] : "";
      const stepKey = key.endsWith(":script-outline") ? key.slice(0, -":script-outline".length).slice(projectId.length + 1) : "project_story";
      const thread = [...threads.values()].find((candidate) => candidate.projectId === projectId && candidate.stepKey === stepKey && candidate.chapterId === pending.chapterId) ??
        [...threads.values()].find((candidate) => candidate.projectId === projectId && candidate.stepKey === stepKey);
      if (!thread) continue;
      artifacts.push({
        id: `script-outline:${key}`,
        projectId,
        chapterId: pending.chapterId,
        threadId: thread.id,
        kind: "script_outline_decision",
        status: "pending",
        activeSlotKey: `dialogue:${projectId}:${stepKey}:script-outline`,
        payload: pending,
        schemaVersion: 1,
        createdAt: pending.createdAt,
        updatedAt: pending.createdAt,
      });
    }
    return artifacts.sort((left, right) => left.activeSlotKey.localeCompare(right.activeSlotKey));
  }

  /** 从 DB runtime artifact 恢复进程内工具状态；payload 仍以 DB digest 为准校验后才进入 Map。 */
  restorePendingArtifact(artifact: PendingDialogueCaptureArtifact): void {
    if (artifact.status !== "pending") return;
    if (artifact.kind === "script_import") {
      this.pendingScriptImports.set(artifact.threadId, artifact.payload as PendingScriptImport);
      return;
    }
    const prefix = "dialogue:";
    const slot = artifact.activeSlotKey.startsWith(prefix) ? artifact.activeSlotKey.slice(prefix.length) : artifact.activeSlotKey;
    if (artifact.kind === "inspiration_seeds") this.pendingInspirationSeeds.set(slot, artifact.payload as PendingInspirationSeeds);
    else this.pendingScriptOutlines.set(slot, artifact.payload as PendingScriptOutline);
  }

  /**
   * 剧本工具链主入口。
   * 按 tryHandleScriptTools 中剧本分支的顺序调用 import → inspiration → chapter 子流程。
   * 命中任一分支即返回其结果;全部未命中返回空数组,交由上层走 OpenCode 对话。
   */
  async handleScriptTurn(
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

  // ---------- 剧本导入 ----------

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
      userConfirmedOverwrite: isConfirmingScriptImport(input.content),
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
    if (!pending || hasScriptPayload(input)) {
      return null;
    }

    if (isCancellingScriptImport(input.content)) {
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

    if (!isConfirmingScriptImport(input.content)) {
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

  private getScriptOrganizationInput(input: SendDialogueMessageRequest): ScriptOrganizationInput | null {
    if (!shouldOrganizeProvidedScript(input)) {
      return null;
    }

    const attachments = getTextAttachments(input.attachments);
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

  // ---------- 灵感种子 + 剧本大纲 ----------

  private async tryHandleScriptInspiration(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    const outlineResult = await this.tryHandlePendingScriptOutline(turn, input, signal);
    if (outlineResult) {
      return outlineResult;
    }

    const pendingKey = getPendingInspirationKey(turn.thread.projectId, turn.normalizedStepKey);
    const pending = this.pendingInspirationSeeds.get(pendingKey);
    const selectedSeed = pending ? resolveSelectedInspirationSeed(input, pending.seeds) : null;
    if (pending && selectedSeed) {
      this.pendingInspirationSeeds.delete(pendingKey);
      return this.createGenerateScriptOutlineFromSeedToolResult(turn, input, selectedSeed, pending.prompt, undefined, signal);
    }

    if (pending && isCancellingInspiration(input.content)) {
      this.pendingInspirationSeeds.delete(pendingKey);
      return this.createGenerateInspirationSeedsToolResult(turn, [], "已取消这组灵感方向，本次没有写入章节。");
    }

    if (pending && isSelectingInspirationSeed(input.content)) {
      return this.createFailedToolResult(
        turn,
        "generate_script_outline_from_seed",
        "我没识别出你选的是哪一个灵感种子。请回复“选第 1 个”“选第 2 个”或“选第 3 个”，也可以直接点击灵感卡片里的“生成大纲”。",
      );
    }

    const inspirationDecision = shouldGenerateInspirationSeeds(input);
    if (!inspirationDecision.trigger) {
      return null;
    }

    // 题材明确时绕过灵感种子,直接生成大纲(见 task 2026-06-21_直接题材生成大纲)
    if (inspirationDecision.mode === "topic") {
      return this.createGenerateScriptOutlineFromTopicToolResult(turn, input, signal);
    }

    let seeds: ScriptInspirationSeed[];
    try {
      seeds = await this.generateInspirationSeedsWithAI(turn, input, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_inspiration_seeds",
        `灵感种子生成失败：${getErrorMessage(error)}。本次没有写入章节。`,
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
    const pendingKey = getPendingScriptOutlineKey(turn.thread.projectId, turn.normalizedStepKey);
    const pending = this.pendingScriptOutlines.get(pendingKey);
    const outline = pending?.outline ?? turn.snapshot.scriptOutline;

    if (!outline) {
      return null;
    }

    const batchRange = resolveBatchChapterRange(input.content);
    if (input.intent === "generate_script_from_outline" || isConfirmingScriptOutline(input.content) || batchRange) {
      this.pendingScriptOutlines.delete(pendingKey);
      if (batchRange) {
        return this.createGenerateMultipleChaptersToolResult(turn, input, outline, batchRange, signal);
      }
      return this.createGenerateScriptFromOutlineToolResult(turn, input, outline, signal);
    }

    if (isCancellingScriptOutline(input.content)) {
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

    // 按来源模式路由重新生成:seed 走种子,topic 走直接题材(见 task 2026-06-21_直接题材生成大纲)
    if (pending.source === "topic") {
      return this.createGenerateScriptOutlineFromTopicToolResult(turn, input, signal);
    }
    return this.createGenerateScriptOutlineFromSeedToolResult(turn, input, pending.seed!, pending.seedPrompt ?? "", outline, signal);
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
        `剧本大纲生成失败：${getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const outline = await this.projectsService.saveScriptOutlineFromAI(turn.thread.projectId, {
      sourceText,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
    });

    this.pendingScriptOutlines.set(getPendingScriptOutlineKey(turn.thread.projectId, turn.normalizedStepKey), {
      outline,
      source: "seed",
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

  /**
   * 直接题材生成大纲的 tool result 组装(绕过灵感种子,见 task 2026-06-21_直接题材生成大纲)。
   */
  private async createGenerateScriptOutlineFromTopicToolResult(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult> {
    const toolCallId = randomUUID();
    let sourceText: string;
    try {
      sourceText = await this.generateScriptOutlineFromTopicWithAI(turn, input, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_outline_from_topic",
        `剧本大纲生成失败：${getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const outline = await this.projectsService.saveScriptOutlineFromAI(turn.thread.projectId, {
      sourceText,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
    });

    this.pendingScriptOutlines.set(getPendingScriptOutlineKey(turn.thread.projectId, turn.normalizedStepKey), {
      outline,
      source: "topic",
      chapterId: turn.snapshot.currentChapter?.id ?? turn.thread.chapterId,
      createdAt: new Date().toISOString(),
    });

    return this.createGenerateScriptOutlineToolResult(
      turn,
      outline,
      [
        `已根据你给定的题材生成项目级剧本大纲，并保存到 ${outline.outlinePath}。`,
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
    const targetChapter = this.resolveScriptFromOutlineTargetChapter(turn, input);
    if (!targetChapter) {
      return this.createFailedToolResult(turn, "generate_script_from_outline", "当前项目还没有可写入的章节，请先创建或打开第 1 章。");
    }
    if ("error" in targetChapter) {
      return this.createFailedToolResult(turn, "generate_script_from_outline", targetChapter.error);
    }

    const confirmedOutline = await this.projectsService.confirmScriptOutline(turn.thread.projectId, outline.id);
    const toolCallId = randomUUID();
    let sourceText: string;
    try {
      sourceText = await this.generateScriptFromOutlineWithAI(turn, input, confirmedOutline, targetChapter.title, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_outline",
        `章节草稿生成失败：${getErrorMessage(error)}。剧本大纲已保存，章节正文本次没有写入。`,
      );
    }

    const chapterTitle = extractChapterScriptTitle(sourceText) ?? targetChapter.title;
    const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, targetChapter.id, {
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
      summary: `已根据已确认剧本大纲「${confirmedOutline.title}」生成 ${result.chapter.title} 的草稿。草稿在右侧待确认，采用后才会覆盖正式正文。来源：${formatRevisionSource(result.revision)}`,
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

  /**
   * 多章批量生成(见 ADR-0008 三期)。
   * 从 start 开始连续生成 count 章:每章 ensureChapterExists → 检查正式非空停 → AI 生成 → 写 pending。
   * 碰已有正式正文的章节停下,返回已停位置;AI 生成失败也停下。
   * 正文写入 pending 缓冲,不覆盖正式 sourceText;用户事后逐章确认。
   */
  private async createGenerateMultipleChaptersToolResult(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    outline: ProjectScriptOutline,
    range: { start: number; count: number },
    signal?: AbortSignal,
  ): Promise<DialogueToolResult> {
    const confirmedOutline = await this.projectsService.confirmScriptOutline(turn.thread.projectId, outline.id);
    const toolCallId = randomUUID();
    const generatedChapters: ChapterListItem[] = [];
    const summaries: string[] = [];
    let stoppedAt: { order: number; title: string } | null = null;
    let failedAt: { order: number; reason: string } | null = null;
    let lastChapterId: string | null = null;
    let lastRevision: ScriptRevisionItem | null = null;

    for (let offset = 0; offset < range.count; offset += 1) {
      const order = range.start + offset;

      // 确保章节存在(边生成边建章)
      const ensured = await this.projectsService.ensureChapterExists(
        turn.thread.projectId,
        order,
        `第 ${order} 章`,
      );

      // 碰正式非空章节停下(保护用户已有内容)
      if (ensured.sourceText.trim().length > 0) {
        stoppedAt = { order, title: ensured.title };
        summaries.push(`第 ${order} 章「${ensured.title}」已有正式正文,已停止,未覆盖。`);
        lastChapterId = ensured.id;
        break;
      }

      // AI 生成该章正文
      let sourceText: string;
      try {
        sourceText = await this.generateScriptFromOutlineWithAI(turn, input, confirmedOutline, ensured.title, signal);
      } catch (error) {
        failedAt = { order, reason: getErrorMessage(error) };
        summaries.push(`第 ${order} 章「${ensured.title}」生成失败:${getErrorMessage(error)}。`);
        lastChapterId = ensured.id;
        break;
      }

      // 写入 pending 缓冲(不碰正式 sourceText)
      const chapterTitle = extractChapterScriptTitle(sourceText) ?? ensured.title;
      const result = await this.projectsService.writeChapterDraftFromAI(turn.thread.projectId, ensured.id, {
        sourceText,
        title: chapterTitle,
        summary: `批量生成第 ${order} 章「${chapterTitle}」草稿。`,
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        toolCallId,
        operation: "generate_script_from_outline",
      });
      generatedChapters.push(result.chapter);
      lastChapterId = result.chapter.id;
      lastRevision = result.revision;
      summaries.push(`第 ${order} 章「${result.chapter.title}」草稿已生成(待确认)。`);
    }

    const now = new Date().toISOString();
    const succeededCount = generatedChapters.length;
    const status: DialogueToolResult["status"] = succeededCount > 0 ? "succeeded" : "failed";

    let summaryText: string;
    if (succeededCount === 0) {
      summaryText = failedAt
        ? `批量生成失败,第 ${failedAt.order} 章生成出错:${failedAt.reason}。本次没有写入任何草稿。`
        : `批量生成未开始:第 ${stoppedAt?.order} 章已有正式正文。`;
    } else if (stoppedAt) {
      summaryText = `已生成 ${succeededCount} 章草稿(第 ${range.start} - ${range.start + succeededCount - 1} 章),在第 ${stoppedAt.order} 章「${stoppedAt.title}」处停止(已有正式正文)。草稿在右侧待确认,采用后才覆盖正式正文。`;
    } else if (failedAt) {
      summaryText = `已生成 ${succeededCount} 章草稿,在第 ${failedAt.order} 章处因生成出错停止(${failedAt.reason})。已生成的草稿在右侧待确认。`;
    } else {
      summaryText = `已生成 ${succeededCount} 章草稿(第 ${range.start} - ${range.start + succeededCount - 1} 章)。草稿在右侧待确认,采用后才覆盖正式正文。`;
    }

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "generate_multiple_chapters",
      status,
      summary: [summaryText, "", ...summaries].join("\n"),
      chapters: generatedChapters,
      currentChapterId: lastChapterId,
      currentChapter: null,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: confirmedOutline,
      revision: lastRevision,
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
        `章节草稿生成失败：${getErrorMessage(error)}。本次没有写入章节。`,
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
      summary: `已选择方向「${seed.title}」，并生成 ${result.chapter.title} 的草稿。草稿在右侧待确认，采用后才会覆盖正式正文。来源：${formatRevisionSource(result.revision)}`,
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

  // ---------- 章节草稿更新 ----------

  private async tryHandleChapterDraftUpdate(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    if (!shouldUpdateChapterDraft(input, turn.snapshot)) {
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
        `章节草稿改写失败：${getErrorMessage(error)}。本次没有写入章节。`,
      );
    }

    const summary = summarizeDraftUpdate(input.content);
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
      summary: `已通过受控工具更新当前章节草稿（待确认）：${summary} 采用后才覆盖正式正文。来源：${formatRevisionSource(result.revision)}`,
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

  private resolveScriptFromOutlineTargetChapter(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
  ): { id: string; title: string; order: number | null } | { error: string } | null {
    const requestedOrder = resolveRequestedScriptChapterOrder(input.content, turn.snapshot);
    if (requestedOrder) {
      const chapter = turn.snapshot.chapters.find((item) => item.order === requestedOrder);
      if (!chapter) {
        return {
          error: `第 ${requestedOrder} 章还不存在。请先完成当前章进入下一章，或先创建第 ${requestedOrder} 章后再生成。`,
        };
      }

      return toScriptFromOutlineTarget(chapter);
    }

    const chapterId = input.chapterId ?? turn.snapshot.currentChapter?.id ?? turn.thread.chapterId;
    if (!chapterId) {
      return null;
    }

    const chapter = turn.snapshot.chapters.find((item) => item.id === chapterId);
    return chapter
      ? toScriptFromOutlineTarget(chapter)
      : {
          id: chapterId,
          title: turn.snapshot.currentChapter?.title ?? "当前章节",
          order: turn.snapshot.currentChapter?.order ?? null,
        };
  }

  // ---------- AI 调用器 ----------

  private async generateInspirationSeedsWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<ScriptInspirationSeed[]> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildInspirationSeedsPrompt(turn, input),
      signal,
    });

    return parseInspirationSeeds(response.content);
  }

  private async generateScriptOutlineFromSeedWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    previousOutline?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildScriptOutlineFromSeedPrompt(turn, input, seed, seedPrompt, previousOutline),
      signal,
    });

    return ensureScriptOutlineMarkdown(response.content, seed.title);
  }

  /**
   * 直接题材生成大纲(绕过灵感种子,见 task 2026-06-21_直接题材生成大纲)。
   * 题材来自用户输入(input.content),不依赖 seed。
   */
  private async generateScriptOutlineFromTopicWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildScriptOutlineFromTopicPrompt(turn, input),
      signal,
    });

    return ensureScriptOutlineMarkdown(response.content, turn.snapshot.project.storyTitle || turn.snapshot.project.name);
  }

  private async generateScriptFromOutlineWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    outline: ProjectScriptOutline,
    targetChapterTitle: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildScriptFromOutlinePrompt(turn, input, outline, targetChapterTitle),
      signal,
    });

    return ensureChapterMarkdown(response.content, targetChapterTitle);
  }

  private async generateScriptFromSeedWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    seed: ScriptInspirationSeed,
    seedPrompt: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildScriptFromSeedPrompt(turn, input, seed, seedPrompt),
      signal,
    });

    return ensureChapterMarkdown(response.content, seed.title);
  }

  private async rewriteChapterDraftWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    sourceText: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildChapterEditingPrompt(turn, input, sourceText),
      signal,
    });

    return ensureChapterMarkdown(response.content, turn.snapshot.currentChapter?.title ?? "第 1 章");
  }
}
