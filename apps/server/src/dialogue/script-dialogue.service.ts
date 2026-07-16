import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  DialogueToolResult,
  ImportAnalysisOutputV1,
  ProjectScriptOutline,
  ScriptImportWorkflowResult,
  ScriptInspirationSeed,
  SendDialogueMessageRequest,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import {
  SCRIPT_INSPIRATION_SEED_COUNT,
  extractChapterScriptTitle,
  getChapterScriptFormatPrompt,
  getScriptOutlineFormatPrompt,
  parseChapterScriptMarkdownV1,
  parseScriptOutlineMarkdownV1,
  serializeChapterScriptMarkdownV1,
  serializeScriptOutlineMarkdownV1,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import {
  ScriptWorkflowSourceRepository,
  type AiChapterGenerationContext,
  type ImportBatchProjection,
} from "../projects/script-workflow-source.repository.js";
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
  isExplicitlyRequestingChapterGeneration,
  isSelectingInspirationSeed,
  resolveBatchChapterRange,
  resolveRequestedScriptChapterOrder,
  resolveSelectedInspirationSeed,
  shouldGenerateInspirationSeeds,
  shouldOrganizeProvidedScript,
  shouldReviseScriptImportAnalysis,
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
  formatRevisionSource,
  getErrorMessage,
  summarizeDraftUpdate,
} from "./dialogue-text.util.js";
import { getPendingInspirationKey, getPendingScriptOutlineKey } from "./dialogue-key.util.js";
import { ScriptImportAnalysisService } from "./script-import-analysis.service.js";
import { ScriptImportWorkerService } from "./script-import-worker.service.js";
import {
  assertP1InspirationQuality,
  assertP2OutlineQuality,
  ScriptCreativeQualityError,
} from "./script-creative-quality.util.js";

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
    @Inject(ScriptWorkflowSourceRepository) private readonly scriptWorkflowSourceRepository: ScriptWorkflowSourceRepository,
    @Inject(ScriptImportWorkerService) private readonly scriptImportWorkerService: ScriptImportWorkerService,
    @Inject(ScriptImportAnalysisService) private readonly scriptImportAnalysisService: ScriptImportAnalysisService,
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
    const importResults = await this.tryHandleScriptImport(turn, input, signal);
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
    signal?: AbortSignal,
  ): Promise<DialogueToolResult[]> {
    const pendingResult = await this.tryResolvePendingScriptImport(turn, input, signal);
    if (pendingResult) {
      return [pendingResult];
    }

    const scriptInput = this.getScriptOrganizationInput(input);
    if (!scriptInput) {
      return [];
    }

    try {
      const raw = await this.scriptWorkflowSourceRepository.createRawSource(turn.thread.projectId, {
        inputMode: scriptInput.inputMode,
        contentTypeHint: "unknown",
        documents: scriptInput.documents,
      });
      const source = await this.scriptWorkflowSourceRepository.getRawSourceContext(turn.thread.projectId, raw.id);
      const analysis = await this.generateImportAnalysisWithAI(
        turn,
        input,
        source,
        scriptInput.inputMode === "paste" ? "请忠实分析这份粘贴原稿并给出完整拆章候选。" : input.content,
        undefined,
        signal,
      );
      const candidate = await this.scriptWorkflowSourceRepository.createAnalysisCandidate({
        projectId: turn.thread.projectId,
        rawSourceVersionId: raw.id,
        analysis,
        promptPackVersion: "import-analyze/2.0-hierarchical",
      });
      const pending: PendingScriptImport = {
        workflowVersion: 2,
        sourceName: scriptInput.sourceName,
        rawSourceVersionId: raw.id,
        analysisCandidateId: candidate.id,
        analysis,
        blockingIssues: candidate.blockingIssues,
        model: input.model ?? null,
        createdAt: new Date().toISOString(),
      };
      this.pendingScriptImports.set(turn.thread.id, pending);
      return [this.createScriptImportAnalysisToolResult(turn, randomUUID(), pending)];
    } catch (error) {
      return [this.createFailedToolResult(
        turn,
        "analyze_script_import",
        `已有剧本分析失败：${getErrorMessage(error)}。原稿不会覆盖任何章节。`,
      )];
    }
  }

  private async tryResolvePendingScriptImport(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    const pending = this.pendingScriptImports.get(turn.thread.id);
    if (!pending || hasScriptPayload(input)) {
      return null;
    }
    if ((pending as { workflowVersion?: number }).workflowVersion !== 2) {
      this.pendingScriptImports.delete(turn.thread.id);
      return null;
    }

    if (isCancellingScriptImport(input.content)) {
      this.pendingScriptImports.delete(turn.thread.id);
      return this.createScriptImportAnalysisToolResult(turn, randomUUID(), pending, "failed", "已取消本次已有剧本导入；原稿副本保留用于追溯，但没有创建章节目录或正文。");
    }

    const confirmsChapterMap = isConfirmingScriptImport(input.content, input.intent);
    const answersBlockingQuestion = pending.blockingIssues.length > 0
      && input.content.trim().length > 0
      && !/^(继续|可以|确认|没问题|为什么|解释一下)$/.test(input.content.trim());
    if (!confirmsChapterMap && (shouldReviseScriptImportAnalysis(input.content) || answersBlockingQuestion)) {
      try {
        const source = await this.scriptWorkflowSourceRepository.getRawSourceContext(turn.thread.projectId, pending.rawSourceVersionId);
        const analysis = await this.generateImportAnalysisWithAI(turn, input, source, input.content, pending.analysis, signal);
        const candidate = await this.scriptWorkflowSourceRepository.createAnalysisCandidate({
          projectId: turn.thread.projectId,
          rawSourceVersionId: source.id,
          analysis,
          promptPackVersion: "import-analyze/2.0-hierarchical",
        });
        const updated: PendingScriptImport = {
          ...pending,
          analysisCandidateId: candidate.id,
          analysis,
          blockingIssues: candidate.blockingIssues,
          model: input.model ?? pending.model,
          createdAt: new Date().toISOString(),
        };
        this.pendingScriptImports.set(turn.thread.id, updated);
        return this.createScriptImportAnalysisToolResult(turn, randomUUID(), updated, "needs_user_confirmation", "已根据你的边界反馈生成一份完整新拆章候选，请重新检查后整体确认。");
      } catch (error) {
        return this.createFailedToolResult(turn, "analyze_script_import", `重新分析拆章边界失败：${getErrorMessage(error)}。上一份候选仍保留。`);
      }
    }

    if (!confirmsChapterMap) {
      return null;
    }

    if (pending.blockingIssues.length > 0) {
      return this.createScriptImportAnalysisToolResult(
        turn,
        randomUUID(),
        pending,
        "needs_user_confirmation",
        `当前拆章候选仍有 ${pending.blockingIssues.length} 个阻断问题，不能确认目录。请先回答或补充原稿信息。`,
      );
    }

    try {
      const map = await this.scriptWorkflowSourceRepository.confirmAnalysisCandidate(turn.thread.projectId, pending.analysisCandidateId);
      const batch = await this.scriptWorkflowSourceRepository.startImportBatch(turn.thread.projectId, map.id);
      const projection = await this.scriptWorkflowSourceRepository.getImportBatchProjection(turn.thread.projectId, batch.id);
      this.scriptImportWorkerService.wake(batch.id, input.model ?? pending.model ?? undefined);
      this.pendingScriptImports.delete(turn.thread.id);
      const snapshot = await this.projectsService.getWorkbenchSnapshot(turn.thread.projectId, batch.items[0]?.chapterId);
      return this.createImportScriptToChaptersToolResult(turn, pending, map.id, projection, snapshot);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "import_script_to_chapters",
        `确认拆章目录失败：${getErrorMessage(error)}。系统没有覆盖任何正式章节。`,
      );
    }
  }

  private createImportScriptToChaptersToolResult(
    turn: DialogueTurn,
    pending: PendingScriptImport,
    chapterMapId: string,
    projection: ImportBatchProjection,
    snapshot: WorkbenchSnapshot,
  ): DialogueToolResult {
    const readyCount = projection.items.filter((item) => item.status === "pending_ready").length;
    const failedCount = projection.items.filter((item) => item.status === "generation_failed").length;
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool: "import_script_to_chapters",
      status: "succeeded",
      summary: ["queued", "processing"].includes(projection.status)
        ? `拆章目录已确认，共创建 ${projection.items.length} 个章节入口。系统正在后台逐章整理并验证；你可以自由切换章节查看进度，已经完成的章节会先进入“待确认”。`
        : failedCount > 0
        ? `拆章目录已确认，共创建 ${projection.items.length} 个章节入口；${readyCount} 章已生成待确认稿，${failedCount} 章整理或忠实度验证失败。成功章节可逐章确认，失败不会影响其他章节。`
        : `拆章目录已确认，共创建 ${projection.items.length} 个章节入口并完成全部待确认稿。请自由切换章节，完整查看后逐章点击“确认章节”。`,
      chapters: snapshot.chapters,
      currentChapterId: snapshot.currentChapter?.id ?? null,
      currentChapter: snapshot.currentChapter,
      analysis: null,
      importWorkflow: {
        stage: "batch_result",
        rawSourceVersionId: pending.rawSourceVersionId,
        analysisCandidateId: pending.analysisCandidateId,
        analysis: pending.analysis,
        blockingIssues: [],
        chapterMapId,
        batchId: projection.id,
        batchStatus: projection.status as ScriptImportWorkflowResult["batchStatus"],
        batchItems: projection.items.map((item) => ({
          ...item,
          status: item.status as ScriptImportWorkflowResult["batchItems"][number]["status"],
        })),
      },
      inspirationSeeds: null,
      scriptOutline: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
  }

  private createScriptImportAnalysisToolResult(
    turn: DialogueTurn,
    toolCallId: string,
    pending: PendingScriptImport,
    status: DialogueToolResult["status"] = "needs_user_confirmation",
    overrideSummary?: string,
  ): DialogueToolResult {
    const chapterCount = pending.analysis.chapterCandidates.length;
    const summary = overrideSummary ?? (pending.blockingIssues.length > 0
      ? `已保存并分析${pending.sourceName}，提出 ${chapterCount} 个章节候选，但有 ${pending.blockingIssues.length} 个阻断问题；解决前不能确认拆章目录。`
      : `已保存并分析${pending.sourceName}，提出 ${chapterCount} 个章节候选。请检查观察性大纲、章节范围和边界证据，再整体确认拆章目录。`);
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "analyze_script_import",
      status,
      summary,
      chapters: [],
      currentChapterId: null,
      currentChapter: null,
      analysis: null,
      importWorkflow: {
        stage: "analysis_candidate",
        rawSourceVersionId: pending.rawSourceVersionId,
        analysisCandidateId: pending.analysisCandidateId,
        analysis: pending.analysis,
        blockingIssues: pending.blockingIssues,
        chapterMapId: null,
        batchId: null,
        batchStatus: null,
        batchItems: [],
      },
      inspirationSeeds: null,
      scriptOutline: null,
      revision: null,
      createdAt: new Date().toISOString(),
    };
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
        inputMode: "upload",
        documents: attachments.map((attachment, index) => ({
          sourceRef: `source-${String(index + 1).padStart(3, "0")}`,
          name: attachment.name,
          mediaType: attachment.mimeType,
          sourceText: attachment.content,
        })),
      };
    }

    return {
      sourceName: "粘贴剧本",
      sourceText: input.content,
      inputMode: "paste",
      documents: [{ name: "粘贴剧本", mediaType: "text/plain", sourceText: input.content }],
    };
  }

  private async generateImportAnalysisWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    source: Awaited<ReturnType<ScriptWorkflowSourceRepository["getRawSourceContext"]>>,
    userRequest: string,
    previousAnalysis?: ImportAnalysisOutputV1,
    signal?: AbortSignal,
  ): Promise<ImportAnalysisOutputV1> {
    const sessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const result = await this.scriptImportAnalysisService.analyze({
      sessionId,
      source,
      userRequest,
      previousAnalysis,
      model: input.model,
      signal,
    });
    return result.analysis;
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
      chapterId: turn.thread.chapterId,
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
    if (batchRange) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_outline",
        "AI 创作路线按当前章节逐章生成，不支持一次生成多章。请先切换到目标章节，再在该章节对话中明确输入“生成当前章节”。",
      );
    }
    const explicitGeneration = isExplicitlyRequestingChapterGeneration(input);
    const confirmsPendingOutline = pending !== undefined && isConfirmingScriptOutline(input.content);
    if (explicitGeneration) {
      if (pending) this.pendingScriptOutlines.delete(pendingKey);
      return this.createGenerateScriptFromOutlineToolResult(turn, input, outline, signal);
    }

    if (confirmsPendingOutline) {
      this.pendingScriptOutlines.delete(pendingKey);
      const confirmedOutline = await this.projectsService.confirmScriptOutline(turn.thread.projectId, outline.id);
      return this.createGenerateScriptOutlineToolResult(
        turn,
        confirmedOutline,
        "剧本大纲已确认。本次没有生成章节；请打开目标章节，并在该章节对话中明确输入“生成当前章节”。",
        "succeeded",
        pending.source === "topic" ? "generate_script_outline_from_topic" : "generate_script_outline_from_seed",
      );
    }

    if (pending && isCancellingScriptOutline(input.content)) {
      this.pendingScriptOutlines.delete(pendingKey);
      return this.createGenerateScriptOutlineToolResult(
        turn,
        outline,
        "已取消当前剧本大纲确认，本次没有生成章节。你可以继续让我重新找灵感或重新生成大纲。",
        "failed",
        pending.source === "topic" ? "generate_script_outline_from_topic" : "generate_script_outline_from_seed",
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
      chapterId: turn.thread.chapterId,
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
      "generate_script_outline_from_seed",
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
      chapterId: turn.thread.chapterId,
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
      "generate_script_outline_from_topic",
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
    let context: AiChapterGenerationContext;
    try {
      context = await this.scriptWorkflowSourceRepository.getAiChapterGenerationContext({
        projectId: turn.thread.projectId,
        chapterId: targetChapter.id,
        outlineId: confirmedOutline.id,
      });
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_outline",
        `当前章节暂时不能生成：${getErrorMessage(error)}。请检查本章是否已有正文或待确认草稿，以及上一章是否已经完成。`,
      );
    }
    let sourceText: string;
    try {
      sourceText = await this.generateScriptFromOutlineWithAI(turn, input, context, signal);
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_outline",
        `章节草稿生成失败：${getErrorMessage(error)}。剧本大纲已保存，章节正文本次没有写入。`,
      );
    }

    const chapterTitle = extractChapterScriptTitle(sourceText) ?? `第 ${context.chapter.order} 章：${context.targetCard.title}`;
    try {
      await this.scriptWorkflowSourceRepository.createAiChapterPending({
        projectId: turn.thread.projectId,
        chapterId: targetChapter.id,
        outlineId: confirmedOutline.id,
        expectedSourceSetDigest: context.sourceSetDigest,
        sourceText,
        summary: `根据已确认剧本大纲「${confirmedOutline.title}」生成 ${chapterTitle} 待确认草稿。`,
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        toolCallId,
        operation: "generate_script_from_outline",
      });
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_script_from_outline",
        `章节已生成但来源发生变化，未写入待确认草稿：${getErrorMessage(error)}。请重新输入“生成当前章节”。`,
      );
    }
    const refreshed = await this.projectsService.getWorkbenchSnapshot(turn.thread.projectId, targetChapter.id);
    const chapter = refreshed.currentChapter;
    if (!chapter) return this.createFailedToolResult(turn, "generate_script_from_outline", "章节草稿已生成，但刷新当前章节失败。");
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId,
      tool: "generate_script_from_outline",
      status: "succeeded",
      summary: `已根据已确认剧本大纲「${confirmedOutline.title}」生成 ${chapter.title} 的待确认草稿。请先完整查看；采用后进入可编辑正文，完成本章后才形成正式版本。来源：${chapter.lastScriptRevision ? formatRevisionSource(chapter.lastScriptRevision) : "系统密封来源"}`,
      chapters: refreshed.chapters,
      currentChapterId: chapter.id,
      currentChapter: chapter,
      analysis: null,
      inspirationSeeds: null,
      scriptOutline: confirmedOutline,
      revision: chapter.lastScriptRevision,
      createdAt: now,
    };
  }

  private createGenerateScriptOutlineToolResult(
    turn: DialogueTurn,
    outline: ProjectScriptOutline,
    summary: string,
    status: DialogueToolResult["status"],
    tool: "generate_script_outline_from_seed" | "generate_script_outline_from_topic",
  ): DialogueToolResult {
    return {
      id: randomUUID(),
      projectId: turn.thread.projectId,
      threadId: turn.thread.id,
      messageId: turn.assistantMessage.id,
      toolCallId: randomUUID(),
      tool,
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
    const chapterId = input.chapterId ?? turn.snapshot.currentChapter?.id ?? turn.thread.chapterId;
    if (!chapterId) return null;
    const scopedChapter = turn.snapshot.chapters.find((item) => item.id === chapterId);
    const requestedOrder = resolveRequestedScriptChapterOrder(input.content, turn.snapshot);
    if (requestedOrder) {
      if (!scopedChapter || scopedChapter.order !== requestedOrder) {
        return {
          error: `当前对话作用域不是第 ${requestedOrder} 章。请先在章节下拉框切换到第 ${requestedOrder} 章，再输入“生成当前章节”。`,
        };
      }
      return toScriptFromOutlineTarget(scopedChapter);
    }

    return scopedChapter
      ? toScriptFromOutlineTarget(scopedChapter)
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

    const validate = (content: string): ScriptInspirationSeed[] => {
      const seeds = parseInspirationSeeds(content);
      assertP1InspirationQuality(seeds);
      return seeds;
    };

    try {
      return validate(response.content);
    } catch (error) {
      const qualityFailure = error instanceof ScriptCreativeQualityError;
      const repaired = await this.openCodeRuntimeService.sendMessage({
        sessionId: openCodeSessionId,
        model: input.model,
        content: qualityFailure
          ? [
              "上一次输出格式合法，但未通过 P1 灵感质量门。允许重新设计薄弱候选，但必须保持用户题材方向和固定六字段格式。",
              "请根据问题代码重新生成完整 3 项；必须让主角压力、冲突发动机和视觉前提形成实质差异，不能只换标题、人名或措辞。不要输出评分、诊断、代码块或解释。",
              "只返回严格 JSON；顶层只能有 seeds；seeds 必须恰好 3 项；每项只含 title、genreTags、logline、keyConflict、visualHook、firstChapterDirection。",
              `质量问题：${error.issues.join("、")}`,
              "待重写输出：",
              response.content,
            ].join("\n")
          : [
              "上一次输出未通过 creative.ideation/1.0 格式校验。只修复格式，不改变三套创意的语义。",
              "只返回严格 JSON；顶层只能有 seeds；seeds 必须恰好 3 项；每项只含 title、genreTags、logline、keyConflict、visualHook、firstChapterDirection。不要代码块或解释。",
              `校验错误：${getErrorMessage(error)}`,
              "待修复输出：",
              response.content,
            ].join("\n"),
        signal,
      });
      return validate(repaired.content);
    }
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

    return this.normalizeScriptOutlineWithOneRepair(openCodeSessionId, input, response.content, signal);
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

    return this.normalizeScriptOutlineWithOneRepair(openCodeSessionId, input, response.content, signal);
  }

  private async generateScriptFromOutlineWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    context: AiChapterGenerationContext,
    signal?: AbortSignal,
  ): Promise<string> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildScriptFromOutlinePrompt(input, context),
      signal,
    });
    const expectedHeading = `第 ${context.chapter.order} 章：${context.targetCard.title}`;
    try {
      return serializeChapterScriptMarkdownV1(parseChapterScriptMarkdownV1(response.content, { expectedChapterHeading: expectedHeading, mode: "creative" }));
    } catch (error) {
      const repaired = await this.openCodeRuntimeService.sendMessage({
        sessionId: openCodeSessionId,
        model: input.model,
        content: [
          "上一次输出未通过 creative.chapter-draft/1.0 格式校验。只修复格式，不新增、删减或改写剧情事实。",
          `二级标题必须精确为：## ${expectedHeading}`,
          getChapterScriptFormatPrompt(),
          `校验错误：${getErrorMessage(error)}`,
          "待修复输出：",
          response.content,
        ].join("\n"),
        signal,
      });
      return serializeChapterScriptMarkdownV1(parseChapterScriptMarkdownV1(repaired.content, { expectedChapterHeading: expectedHeading, mode: "creative" }));
    }
  }

  private async normalizeScriptOutlineWithOneRepair(
    sessionId: string,
    input: SendDialogueMessageRequest,
    sourceText: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const normalize = (content: string): string => {
      const document = parseScriptOutlineMarkdownV1(content);
      assertP2OutlineQuality(document);
      return serializeScriptOutlineMarkdownV1(document);
    };

    try {
      return normalize(sourceText);
    } catch (error) {
      const qualityFailure = error instanceof ScriptCreativeQualityError;
      const repaired = await this.openCodeRuntimeService.sendMessage({
        sessionId,
        model: input.model,
        content: qualityFailure
          ? [
              "上一次输出格式合法，但未通过 P2 因果大纲与结局方向质量门。保持用户题材、核心承诺和固定大纲格式，重新写清薄弱的因果推进、章节变化或结局兑现。",
              "允许调整情节概要和章节卡的语义内容，但不要新增栏目、详细场景、剧情节拍或章节正文。必须返回完整大纲，不要输出评分、诊断、代码块或解释。",
              `质量问题：${error.issues.join("、")}`,
              getScriptOutlineFormatPrompt(),
              "待重写输出：",
              sourceText,
            ].join("\n")
          : [
              "上一次输出未通过 creative.outline/1.0 格式校验。只修复格式，不改变故事方向、角色、章数或结局。",
              getScriptOutlineFormatPrompt(),
              `校验错误：${getErrorMessage(error)}`,
              "待修复输出：",
              sourceText,
            ].join("\n"),
        signal,
      });
      return normalize(repaired.content);
    }
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
