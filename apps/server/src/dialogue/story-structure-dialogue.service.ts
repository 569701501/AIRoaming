import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ChapterStoryStructure,
  DialogueToolResult,
  SendDialogueMessageRequest,
  StoryStructureJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
  PendingStoryStructure,
} from "./dialogue-types.js";
import {
  isConfirmingStoryStructure,
  isConfirmingStoryStructureRegeneration,
  shouldGenerateStoryStructure,
} from "./dialogue-intent.util.js";
import { buildStoryStructurePrompt } from "./dialogue-prompt.util.js";
import { parseStoryStructureJson, normalizeStoryStructureJson } from "./dialogue-json.util.js";
import { getErrorMessage } from "./dialogue-text.util.js";
import { getPendingStoryStructureKey } from "./dialogue-key.util.js";

/**
 * 剧情结构工具链对话编排(从 DialogueService 抽出,见任务 2026-07-02_DialogueService拆分)。
 *
 * 收口剧情结构(story_structure)步骤的两个子流程:生成剧情结构 / 确认剧情结构。
 * 持有进程内 pendingStoryStructures Map。
 * AI 调用器依赖 OpenCode session,但 session 解析器由 DialogueService 注入(setEnsureSession),
 * 避免重复持有线程状态。
 */
@Injectable()
export class StoryStructureDialogueService {
  private readonly pendingStoryStructures = new Map<string, PendingStoryStructure>();

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
   * 清理本项目在 pendingStoryStructures 里的条目(用 projectId 前缀匹配)。
   * 返回已删除条目数,供上层清理统计使用。
   */
  clearForProject(projectId: string): number {
    let deletedCount = 0;
    const projectPrefix = `${projectId}:story_structure:`;
    for (const key of this.pendingStoryStructures.keys()) {
      if (key.startsWith(projectPrefix)) {
        this.pendingStoryStructures.delete(key);
        deletedCount += 1;
      }
    }
    return deletedCount;
  }

  /**
   * 剧情结构工具链主入口。
   * 处理 story_structure 步骤的确认 / 生成 / 覆盖警告流程。
   * 命中即返回结果;未命中返回 null,交由上层继续尝试后续工具或走 OpenCode 对话。
   */
  async handleStoryStructureTurn(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<DialogueToolResult | null> {
    if (turn.normalizedStepKey !== "story_structure") {
      return null;
    }

    const pendingKey = getPendingStoryStructureKey(turn.thread.projectId, turn.thread.chapterId);
    const pending = this.pendingStoryStructures.get(pendingKey);
    if (pending && (input.intent === "confirm_story_structure" || isConfirmingStoryStructure(input.content))) {
      this.pendingStoryStructures.delete(pendingKey);
      return this.createConfirmStoryStructureToolResult(turn, pending.storyStructure);
    }

    if (!shouldGenerateStoryStructure(input)) {
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

    if (chapter.status !== "script_done" && !isConfirmingStoryStructureRegeneration(input.content)) {
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
        `剧情结构生成失败：${getErrorMessage(error)}。本次没有写入章节结构。`,
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
      structureJson: normalizeStoryStructureJson(structureJson, chapter.id, chapter.title, {
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

  private async generateStoryStructureWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<StoryStructureJson> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildStoryStructurePrompt(turn, input),
      signal,
    });

    return parseStoryStructureJson(
      response.content,
      turn.snapshot.currentChapter?.id ?? undefined,
      turn.snapshot.currentChapter?.title ?? "",
      turn.snapshot.currentChapter?.currentScriptVersionId ?? undefined,
    );
  }
}
