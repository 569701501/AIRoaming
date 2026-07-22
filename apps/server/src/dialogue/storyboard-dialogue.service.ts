import { Inject, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ChapterStoryboard,
  DialogueToolResult,
  SendDialogueMessageRequest,
  StoryboardDocumentV2,
  StoryboardJson,
  StoryboardShotV2,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ScriptVersionService } from "../projects/versioning/script-version.service.js";
import { StoryboardVersionService } from "../projects/versioning/storyboard-version.service.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
} from "./dialogue-types.js";
import {
  isConfirmingStoryboard,
  isConfirmingStoryboardRegeneration,
  shouldGenerateStoryboard,
  shouldRevisePendingStoryboard,
} from "./dialogue-intent.util.js";
import { buildStoryboardPrompt, buildStoryboardRepairPrompt, type StoryboardPromptMode } from "./dialogue-prompt.util.js";
import { normalizeStoryboardJson, parseStoryboardJson } from "./dialogue-json.util.js";
import { getErrorMessage } from "./dialogue-text.util.js";
import { resolveStoryboardReferences } from "./storyboard-reference.util.js";
import { buildStoryboardDialogueReference } from "./storyboard-dialogue-reference.util.js";
import {
  assertStoryboardQuality,
  StoryboardQualityError,
} from "./storyboard-quality.util.js";
import { enrichStoryboardVisualBrief } from "./storyboard-visual-brief.util.js";

/**
 * 分镜工具链对话编排(从 DialogueService 抽出,见任务 2026-07-02_DialogueService拆分)。
 *
 * 收口分镜工作台(storyboard)步骤的两个子流程:生成分镜 / 确认分镜。
 * 不持有进程内 pending Map——分镜的 pending 走 projectsService 持久层
 * (getPendingChapterStoryboard / savePendingChapterStoryboard)。
 * AI 调用器依赖 OpenCode session,但 session 解析器由 DialogueService 注入(setEnsureSession),
 * 避免重复持有线程状态。
 */
@Injectable()
export class StoryboardDialogueService {
  /** OpenCode session 解析器,由 DialogueService 注入(负责获取/创建 session)。 */
  private ensureSession!: (thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal) => Promise<string>;

  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(OpenCodeRuntimeService) private readonly openCodeRuntimeService: OpenCodeRuntimeService,
    @Optional() @Inject(StoryboardVersionService) private readonly storyboardVersionService?: StoryboardVersionService,
    @Optional() @Inject(ScriptVersionService) private readonly scriptVersionService?: ScriptVersionService,
  ) {}

  setEnsureSession(fn: (thread: LocalDialogueThread, snapshot: WorkbenchSnapshot, signal?: AbortSignal) => Promise<string>): void {
    this.ensureSession = fn;
  }

  /**
   * 分镜工具链主入口。
   * 处理 storyboard 步骤的确认 / 生成 / 覆盖警告流程。
   * 命中即返回结果;未命中返回 null,交由上层继续尝试后续工具或走 OpenCode 对话。
   */
  async handleStoryboardTurn(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "storyboard") {
      return null;
    }

    const pending = turn.snapshot.pendingStoryboard
      ?? (turn.snapshot.versioningCapability?.mode !== "g2_db" && turn.thread.chapterId
        ? await this.projectsService.getPendingChapterStoryboard(turn.thread.projectId, turn.thread.chapterId)
        : null);
    if (pending && (input.intent === "confirm_storyboard" || isConfirmingStoryboard(input.content))) {
      return this.createConfirmStoryboardToolResult(turn, pending);
    }

    const generationRequested = shouldGenerateStoryboard(input);
    const revisionRequested = !generationRequested && shouldRevisePendingStoryboard(input);
    if (!revisionRequested && !generationRequested) {
      return null;
    }

    const chapter = turn.snapshot.currentChapter;
    if (!chapter) {
      return this.createFailedToolResult(turn, "generate_storyboard", "当前项目还没有可生成分镜的章节。");
    }

    if (revisionRequested && !pending) {
      return this.createFailedToolResult(
        turn,
        "generate_storyboard",
        "当前没有待确认分镜草稿。请先明确输入“生成分镜”；已有正式分镜如需重做，仍要先确认重新生成的影响。",
      );
    }

    if (!turn.snapshot.storyStructure || !chapter.currentStoryVersionId || chapter.status === "script_done" || chapter.status === "draft") {
      return this.createFailedToolResult(
        turn,
        "generate_storyboard",
        "当前章节还没有确认剧情结构，请先在剧情结构步骤完成确认，再生成分镜。",
      );
    }

    if (!revisionRequested && chapter.status !== "structured" && !isConfirmingStoryboardRegeneration(input.content)) {
      return this.createStoryboardWarningToolResult(
        turn,
        "本章已经有分镜或后续产物。重新生成会影响候选图、排版和轻漫剧镜头字段；确认要重新生成，请回复“确认重新生成分镜”。",
      );
    }

    let storyboardJson: StoryboardJson;
    try {
      storyboardJson = await this.generateStoryboardWithAI(
        turn,
        input,
        revisionRequested ? "revise_pending" : "generate",
        signal,
      );
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_storyboard",
        `分镜${revisionRequested ? "调整" : "生成"}失败：${getErrorMessage(error)}。本次没有写入或替换待确认分镜。`,
      );
    }

    let saved: ChapterStoryboard;
    try {
      saved = await this.savePendingStoryboard(turn, normalizeStoryboardJson(storyboardJson, chapter.id, chapter.title, {
        sourceStoryVersionId: chapter.currentStoryVersionId,
      }));
    } catch (error) {
      return this.createFailedToolResult(
        turn,
        "generate_storyboard",
        `分镜草稿保存失败：${getErrorMessage(error)}。正式分镜没有被修改。`,
      );
    }

    return this.createGenerateStoryboardToolResult(turn, saved, revisionRequested);
  }

  private async createConfirmStoryboardToolResult(
    turn: DialogueTurn,
    storyboard: ChapterStoryboard,
  ): Promise<DialogueToolResult> {
    if (turn.snapshot.versioningCapability?.mode === "g2_db") {
      if (!this.storyboardVersionService) {
        return this.createFailedToolResult(turn, "confirm_storyboard", "数据库分镜版本服务不可用，未确认分镜。");
      }
      const scope = { projectId: turn.thread.projectId, chapterId: storyboard.chapterId };
      const working = await this.storyboardVersionService.getWorkingCopy(scope);
      if (!working.pending || !working.document || !working.pending.sourceDigest) {
        return this.createFailedToolResult(turn, "confirm_storyboard", "当前待确认分镜已经变化，请刷新后重新确认。");
      }
      await this.storyboardVersionService.confirmWorkingCopy(scope, {
        pendingVersionId: working.pending.id,
        expectedPendingDocumentDigest: working.pending.documentDigest,
        expectedPendingRowVersion: working.pending.rowVersion ?? 0,
        expectedCurrentVersionId: working.current?.id ?? null,
        expectedSourceStoryVersionId: working.pending.sourceId ?? "",
        expectedSourceDigest: working.pending.sourceDigest,
        expectedChapterRowVersion: working.productionState.chapterRowVersion,
      });
      const snapshot = await this.projectsService.getWorkbenchSnapshot(turn.thread.projectId, storyboard.chapterId);
      if (!snapshot.storyboard || !snapshot.currentChapter) {
        return this.createFailedToolResult(turn, "confirm_storyboard", "分镜版本已确认，但刷新工作台失败，请重新打开当前章节。");
      }
      return {
        id: randomUUID(),
        projectId: turn.thread.projectId,
        threadId: turn.thread.id,
        messageId: turn.assistantMessage.id,
        toolCallId: randomUUID(),
        tool: "confirm_storyboard",
        status: "succeeded",
        summary: `已确认「${snapshot.currentChapter.title}」的分镜并形成正式版本。现在可以进入出图准备。`,
        chapters: snapshot.chapters,
        currentChapterId: snapshot.currentChapter.id,
        currentChapter: snapshot.currentChapter,
        storyboard: snapshot.storyboard,
        revision: null,
        createdAt: new Date().toISOString(),
      };
    }

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
    revised = false,
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
        `已${revised ? "调整" : "生成"}「${storyboard.storyboardJson.chapterTitle}」的分镜预览，共 ${storyboard.storyboardJson.shots.length} 镜，右侧可查看。`,
        "每个镜头包含漫画画格字段、基础漫剧镜头字段，并已自动整理本次候选图的详细单帧说明。",
        "这还是待确认预览；确认后才会形成正式分镜版本，也才能进入出图准备。",
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

  // ---------- AI 调用器 ----------

  private async generateStoryboardWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    mode: StoryboardPromptMode,
    signal?: AbortSignal,
  ): Promise<StoryboardJson> {
    const sourceText = await this.resolveFormalScriptSource(turn);
    const structure = turn.snapshot.storyStructure?.structureJson;
    if (!structure) throw new Error("当前章节没有可读取的已确认剧情结构");
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const dialogueReference = buildStoryboardDialogueReference(sourceText, structure);
    const prompt = buildStoryboardPrompt(turn, {
      ...input,
      context: { ...input.context, sourceText },
    }, mode, dialogueReference);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: prompt,
      signal,
    });
    const validate = (content: string): StoryboardJson => {
      const storyboard = parseStoryboardJson(
        content,
        turn.snapshot.currentChapter?.id,
        turn.snapshot.currentChapter?.title ?? "",
        turn.snapshot.currentChapter?.currentStoryVersionId ?? undefined,
      );
      assertStoryboardQuality(storyboard, structure, dialogueReference);
      return resolveStoryboardReferences(storyboard, structure, turn.snapshot.characters);
    };

    let storyboard: StoryboardJson;
    try {
      storyboard = validate(response.content);
    } catch (error) {
      const issues = error instanceof StoryboardQualityError ? error.issues : undefined;
      const repaired = await this.openCodeRuntimeService.sendMessage({
        sessionId: openCodeSessionId,
        model: input.model,
        content: buildStoryboardRepairPrompt({
          originalPrompt: prompt,
          invalidOutput: response.content,
          validationError: getErrorMessage(error),
          qualityIssues: issues,
          mode,
        }),
        signal,
      });
      storyboard = validate(repaired.content);
    }

    return enrichStoryboardVisualBrief({
      storyboard,
      structure,
      comicFormat: turn.snapshot.project.comicFormat,
      artStyle: turn.snapshot.project.artStyle,
      send: async (content) => {
        const result = await this.openCodeRuntimeService.sendMessage({
          sessionId: openCodeSessionId,
          model: input.model,
          content,
          signal,
        });
        return result.content;
      },
      validate: (enriched) => assertStoryboardQuality(enriched, structure, dialogueReference),
    });
  }

  private async resolveFormalScriptSource(turn: DialogueTurn): Promise<string> {
    const chapter = turn.snapshot.currentChapter;
    if (turn.snapshot.versioningCapability?.mode !== "g2_db") {
      return chapter?.sourceText?.trim() ?? "";
    }
    const sourceScriptVersionId = turn.snapshot.storyStructure?.sourceScriptVersionId;
    if (!chapter?.currentScriptVersionId || !sourceScriptVersionId || !this.scriptVersionService) {
      throw new Error("当前分镜无法读取剧情结构绑定的正式剧本版本");
    }
    if (sourceScriptVersionId !== chapter.currentScriptVersionId) {
      throw new Error("当前剧情结构来源已经过期，请先重新确认剧情结构");
    }
    const scope = { projectId: turn.thread.projectId, chapterId: chapter.id };
    const working = await this.scriptVersionService.getWorkingCopy(scope);
    if (working.state !== "clean" || working.currentVersion?.id !== sourceScriptVersionId) {
      throw new Error("当前章节正文有未发布修改，请先处理后再生成分镜");
    }
    const formal = await this.scriptVersionService.getHistoryDetail(scope, sourceScriptVersionId);
    if (!formal.isCurrent || formal.id !== sourceScriptVersionId) {
      throw new Error("当前正式剧本版本已经变化，请刷新后重新生成分镜");
    }
    return formal.sourceText.trim();
  }

  private async savePendingStoryboard(
    turn: DialogueTurn,
    storyboardJson: StoryboardJson,
  ): Promise<ChapterStoryboard> {
    const chapter = turn.snapshot.currentChapter;
    if (!chapter) throw new Error("当前章节不存在");
    if (turn.snapshot.versioningCapability?.mode !== "g2_db") {
      const saved = await this.projectsService.savePendingChapterStoryboard(turn.thread.projectId, chapter.id, { storyboardJson });
      return saved.storyboard;
    }
    if (!this.storyboardVersionService || !chapter.currentStoryVersionId) {
      throw new Error("数据库分镜版本服务或正式剧情结构不可用");
    }

    const scope = { projectId: turn.thread.projectId, chapterId: chapter.id };
    let working = await this.storyboardVersionService.getWorkingCopy(scope);
    let chapterRowVersion = working.productionState.chapterRowVersion;
    if (!working.pending) {
      const created = await this.storyboardVersionService.createWorkingCopy(scope, {
        mode: "empty",
        expectedCurrentVersionId: working.current?.id ?? null,
        expectedSourceStoryVersionId: chapter.currentStoryVersionId,
        expectedChapterRowVersion: chapterRowVersion,
      });
      working = created.value;
      chapterRowVersion = created.chapterRowVersion;
    }
    if (!working.pending || !working.document) {
      throw new Error("无法创建待确认分镜 Working Copy");
    }

    const existingIds = new Set(working.document.shots.map((shot) => shot.id));
    const usedExistingIds = new Set<string>();
    const finalShots: StoryboardShotV2[] = [];
    for (const sourceShot of storyboardJson.shots) {
      let shotId: string;
      if (existingIds.has(sourceShot.id) && !usedExistingIds.has(sourceShot.id)) {
        shotId = sourceShot.id;
        usedExistingIds.add(shotId);
      } else {
        const created = await this.storyboardVersionService.createPendingShot(scope, {
          pendingVersionId: working.pending.id,
          requestId: randomUUID(),
          afterShotId: null,
          expectedPendingRowVersion: working.pending.rowVersion ?? 0,
          expectedChapterRowVersion: chapterRowVersion,
          initial: this.toStoryboardShotV2(sourceShot),
        });
        shotId = created.shotId;
        working = created.workingCopy;
        chapterRowVersion = working.productionState.chapterRowVersion;
        if (!working.pending) throw new Error("创建镜头时待确认分镜已经变化");
      }
      finalShots.push({ ...this.toStoryboardShotV2(sourceShot), id: shotId, order: finalShots.length + 1 });
    }

    const document: StoryboardDocumentV2 = {
      schemaVersion: 2,
      chapterId: chapter.id,
      shots: finalShots,
      notes: storyboardJson.notes,
    };
    const updated = await this.storyboardVersionService.updateWorkingCopy(scope, {
      pendingVersionId: working.pending.id,
      document,
      expectedPendingRowVersion: working.pending.rowVersion ?? 0,
      expectedChapterRowVersion: chapterRowVersion,
    });
    const snapshot = await this.projectsService.getWorkbenchSnapshot(turn.thread.projectId, chapter.id);
    if (!snapshot.pendingStoryboard || snapshot.pendingStoryboard.id !== updated.value.pending?.id) {
      throw new Error("待确认分镜已保存，但工作台刷新结果不一致");
    }
    return snapshot.pendingStoryboard;
  }

  private toStoryboardShotV2(shot: StoryboardJson["shots"][number]): Omit<StoryboardShotV2, "id" | "order"> {
    return {
      beatId: shot.beatId,
      sceneId: shot.sceneId,
      characterIds: shot.characterIds,
      coreAction: shot.coreAction,
      emotion: shot.emotion,
      shotType: shot.shotType,
      cameraAngle: shot.cameraAngle,
      comic: shot.comic,
      motion: shot.motion,
      promptDraft: shot.promptDraft,
    };
  }
}
