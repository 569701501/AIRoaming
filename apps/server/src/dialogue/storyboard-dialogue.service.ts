import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ChapterStoryboard,
  DialogueToolResult,
  SendDialogueMessageRequest,
  StoryboardJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type {
  DialogueTurn,
  LocalDialogueThread,
} from "./dialogue-types.js";
import {
  isConfirmingStoryboard,
  isConfirmingStoryboardRegeneration,
  shouldGenerateStoryboard,
} from "./dialogue-intent.util.js";
import { buildStoryboardPrompt } from "./dialogue-prompt.util.js";
import { normalizeStoryboardJson, parseStoryboardJson } from "./dialogue-json.util.js";
import { getErrorMessage } from "./dialogue-text.util.js";

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

    const pending = turn.thread.chapterId
      ? await this.projectsService.getPendingChapterStoryboard(turn.thread.projectId, turn.thread.chapterId)
      : null;
    if (pending && (input.intent === "confirm_storyboard" || isConfirmingStoryboard(input.content))) {
      return this.createConfirmStoryboardToolResult(turn, pending);
    }

    if (!shouldGenerateStoryboard(input)) {
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

    if (chapter.status !== "structured" && !isConfirmingStoryboardRegeneration(input.content)) {
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
        `分镜生成失败：${getErrorMessage(error)}。本次没有写入 storyboard.json。`,
      );
    }

    const saved = await this.projectsService.savePendingChapterStoryboard(turn.thread.projectId, chapter.id, {
      storyboardJson: normalizeStoryboardJson(storyboardJson, chapter.id, chapter.title, {
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

  // ---------- AI 调用器 ----------

  private async generateStoryboardWithAI(
    turn: DialogueTurn,
    input: SendDialogueMessageRequest,
    signal?: AbortSignal,
  ): Promise<StoryboardJson> {
    const openCodeSessionId = await this.ensureSession(turn.thread, turn.snapshot, signal);
    const response = await this.openCodeRuntimeService.sendMessage({
      sessionId: openCodeSessionId,
      model: input.model,
      content: buildStoryboardPrompt(turn, input),
      signal,
    });

    return parseStoryboardJson(
      response.content,
      turn.snapshot.currentChapter?.id,
      turn.snapshot.currentChapter?.title ?? "",
      turn.snapshot.currentChapter?.currentStoryVersionId ?? undefined,
    );
  }
}
