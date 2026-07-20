import { describe, expect, it, vi } from "vitest";
import type {
  ChapterStoryboard,
  ChapterScriptDocumentV1,
  StoryboardJson,
  StoryboardWorkingCopyDto,
} from "@airoaming/shared";
import { serializeChapterScriptMarkdownV1 } from "@airoaming/shared";
import type { DialogueTurn } from "./dialogue-types.js";
import { StoryboardDialogueService } from "./storyboard-dialogue.service.js";

const digest = `sha256:${"a".repeat(64)}` as const;

function formalScript(): string {
  const document: ChapterScriptDocumentV1 = {
    chapterOrder: 1,
    chapterTitle: "雨夜交易",
    type: "悬疑",
    theme: "信任",
    style: "克制",
    comicForm: "竖向条漫",
    targetLength: "完整单章",
    logline: "林舟交出录音笔。",
    chapterGoal: "确认录音内容",
    coreConflict: "双方互不信任",
    emotionalArc: "警惕到合作",
    endingHook: "录音出现失踪者声音",
    highlights: ["录音笔", "雨夜", "声音反转"],
    visualAtmosphere: "冷雨",
    colorDirection: "冷蓝",
    visualMotif: "红色录音灯",
    scenes: [{ order: 1, name: "雨夜办公室", location: "旧办公室", time: "深夜", atmosphere: "戒备", characters: "林舟", description: "林舟把录音笔推过桌面。", actions: "林舟收回手。", dialogue: "林舟：听完再决定。", narration: "无", endingPoint: "录音灯亮起。" }],
    endingEvent: "录音开始播放",
    suspense: "声音来自谁",
    nextChapterLead: "追查录音来源",
  };
  return serializeChapterScriptMarkdownV1(document);
}

function aiStoryboard(id?: string): StoryboardJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜交易",
    sourceStoryVersionId: "story-v1",
    shots: [{
      ...(id ? { id } : { id: "shot_001" }),
      order: 1,
      beatId: "beat_01",
      sceneId: "scene_01",
      characterIds: ["character_01"],
      coreAction: "林舟把录音笔推过桌面",
      emotion: "警惕",
      shotType: "medium",
      cameraAngle: "over_shoulder",
      comic: { panelDescription: "两人隔桌对峙", composition: "林舟肩后看向许澄", dialogue: "林舟：听完再决定。", caption: "", panelRhythm: "normal" },
      motion: { visualDescription: "录音笔滑过桌面", compositionDesign: "过肩构图", cameraMovement: "push_in", frameType: "dialogue", durationMs: 3000, durationHint: "约 3s", voiceLines: [{ characterId: "character_01", name: "林舟", line: "听完再决定。", voiceStyle: "克制" }] },
      promptDraft: "雨夜办公室，隔桌对峙",
      lockedCandidateId: null,
      status: "draft",
    }],
    notes: "结尾留停顿",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function aiVisualBrief(): Record<string, unknown> {
  return {
    shots: [{
      order: 1,
      visualDescription: "雨夜旧办公室内，林舟坐在木桌左侧，右手停在桌面中央的录音笔旁，警惕的目光越过道具投向对面，冷色窗光压住室内气氛。",
      action: "林舟用右手把录音笔稳稳推到桌面中央，手指仍贴着外壳，视线保持在对面的回应方向。",
      composition: "林舟位于左前景，桌面斜线把视线引向中央录音笔，右侧保留对峙对象所在的干净空间。",
      promptDraft: "雨夜旧办公室内，林舟在冷色窗光中把录音笔推到木桌中央，神情警惕克制，过肩视角聚焦手与录音笔。",
    }],
  };
}

function pendingBoard(id = "board-pending", shotId = "db-shot-1"): ChapterStoryboard {
  const storyboardJson = aiStoryboard(shotId);
  storyboardJson.shots[0]!.characterIds = ["char-lin"];
  storyboardJson.shots[0]!.motion.voiceLines[0]!.characterId = "char-lin";
  return {
    id,
    projectId: "project-1",
    chapterId: "chapter-1",
    version: 1,
    status: "pending_confirmation",
    storyboardPath: null,
    sourceStoryVersionId: "story-v1",
    storyboardJson,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    confirmedAt: null,
  };
}

function turn(mode: "legacy_file" | "g2_db" = "legacy_file", pending: ChapterStoryboard | null = null): DialogueTurn {
  const now = "2026-07-16T00:00:00.000Z";
  return {
    normalizedStepKey: "storyboard",
    snapshot: {
      versioningCapability: { mode },
      project: { id: "project-1", name: "雨夜证人", storyTitle: "雨夜证人" },
      currentChapter: { id: "chapter-1", title: "雨夜交易", order: 1, status: "structured", currentScriptVersionId: "script-v1", currentStoryVersionId: "story-v1", sourceText: "林舟把录音笔推给许澄。" },
      storyStructure: {
        id: "story-v1",
        sourceScriptVersionId: "script-v1",
        structureJson: {
          characters: [{ id: "character_01", projectCharacterId: "char-lin", name: "林舟" }],
          scenes: [{ id: "scene_01", name: "雨夜办公室" }],
          beats: [{ id: "beat_01", order: 1, title: "交出录音" }],
        },
      },
      pendingStoryboard: pending,
      characters: [{ id: "char-lin", projectId: "project-1", name: "林舟" }],
    } as DialogueTurn["snapshot"],
    thread: { id: "thread-1", projectId: "project-1", stepKey: "storyboard", chapterId: "chapter-1", openCodeSessionId: null, messages: [], toolResults: [], createdAt: now, updatedAt: now },
    userMessage: { id: "user-1" } as never,
    assistantMessage: { id: "assistant-1" } as never,
    prompt: "",
  };
}

function working(input: { pending?: boolean; rowVersion?: number; shotId?: string } = {}): StoryboardWorkingCopyDto {
  const hasPending = input.pending ?? false;
  const rowVersion = input.rowVersion ?? 0;
  const shotId = input.shotId;
  const document = hasPending ? {
    schemaVersion: 2 as const,
    chapterId: "chapter-1",
    shots: shotId ? [{
      id: shotId,
      order: 1,
      beatId: "beat_01",
      sceneId: "scene_01",
      characterIds: ["char-lin"],
      coreAction: "林舟把录音笔推过桌面",
      emotion: "警惕",
      shotType: "medium" as const,
      cameraAngle: "over_shoulder" as const,
      comic: { panelDescription: "两人隔桌对峙", composition: "过肩构图", dialogue: "", caption: "", panelRhythm: "normal" as const },
      motion: { visualDescription: "录音笔滑过桌面", compositionDesign: "过肩构图", cameraMovement: "push_in" as const, frameType: "dialogue" as const, durationMs: 3000, durationHint: "约 3s", voiceLines: [] },
      promptDraft: "雨夜办公室",
    }] : [],
    notes: "",
  } : null;
  return {
    pending: hasPending ? { id: "board-pending", version: 1, lifecycle: "pending_confirmation", schemaVersion: 2, documentDigest: digest, sourceId: "story-v1", sourceDigest: digest, sourcePolicyVersion: "storyboard-source-v1", origin: "ai_generate", rowVersion, freshness: "pending", reasonCodes: [], createdAt: "2026-07-16T00:00:00.000Z", confirmedAt: null, archivedAt: null } : null,
    current: null,
    document,
    basedOnCurrentVersionId: null,
    sourceStoryVersionId: hasPending ? "story-v1" : null,
    rowVersion: hasPending ? rowVersion : null,
    productionState: { chapterRowVersion: rowVersion + 6 } as never,
  };
}

describe("StoryboardDialogueService S1", () => {
  it("DB 首次生成把角色卡引用和临时镜头号转换为正式 Working Copy", async () => {
    const runtime = {
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify({ shots: aiStoryboard().shots.map(({ id: _id, ...shot }) => shot), notes: "结尾留停顿" }) })
        .mockResolvedValueOnce({ content: JSON.stringify(aiVisualBrief()) }),
    };
    const empty = working();
    const created = working({ pending: true, rowVersion: 0 });
    const withShot = working({ pending: true, rowVersion: 1, shotId: "db-shot-1" });
    const updated = working({ pending: true, rowVersion: 2, shotId: "db-shot-1" });
    const board = pendingBoard();
    const projects = {
      getWorkbenchSnapshot: vi.fn(async () => ({ ...turn("g2_db", board).snapshot, pendingStoryboard: board })),
      getPendingChapterStoryboard: vi.fn(),
    };
    const versions = {
      getWorkingCopy: vi.fn(async () => empty),
      createWorkingCopy: vi.fn(async () => ({ value: created, chapterRowVersion: 6, replayed: false })),
      createPendingShot: vi.fn(async () => ({ shotId: "db-shot-1", workingCopy: withShot, replayed: false })),
      updateWorkingCopy: vi.fn(async () => ({ value: updated, chapterRowVersion: 8, replayed: false })),
    };
    const scripts = {
      getWorkingCopy: vi.fn(async () => ({ state: "clean", currentVersion: { id: "script-v1" } })),
      getHistoryDetail: vi.fn(async () => ({ id: "script-v1", isCurrent: true, sourceText: "林舟把录音笔推给许澄。" })),
    };
    const service = new StoryboardDialogueService(projects as never, runtime as never, versions as never, scripts as never);
    service.setEnsureSession(async () => "session-1");

    const result = await service.handleStoryboardTurn(turn("g2_db"), { content: "生成分镜", intent: "generate_storyboard" });

    expect(result).toMatchObject({ status: "needs_user_confirmation", tool: "generate_storyboard", storyboard: { id: "board-pending" } });
    expect(versions.createWorkingCopy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: "empty", expectedSourceStoryVersionId: "story-v1" }));
    expect(versions.createPendingShot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      initial: expect.objectContaining({ characterIds: ["char-lin"], cameraAngle: "over_shoulder" }),
    }));
    expect(versions.updateWorkingCopy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      document: expect.objectContaining({
        shots: [expect.objectContaining({
          id: "db-shot-1",
          characterIds: ["char-lin"],
          comic: expect.objectContaining({ panelDescription: expect.stringContaining("林舟坐在木桌左侧") }),
        })],
      }),
    }));
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("character_01=林舟") }));
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("候选图工作台") }));
  });

  it("调整命令只修订当前 pending，并把完整草稿交回同一保存路径", async () => {
    const source = pendingBoard("legacy-pending", "shot-existing");
    const response = aiStoryboard("shot-existing");
    response.notes = "节奏已加快";
    const runtime = {
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(response) })
        .mockResolvedValueOnce({ content: JSON.stringify(aiVisualBrief()) }),
    };
    const projects = {
      getPendingChapterStoryboard: vi.fn(async () => source),
      savePendingChapterStoryboard: vi.fn(async () => ({ storyboard: { ...source, storyboardJson: response } })),
    };
    const service = new StoryboardDialogueService(projects as never, runtime as never);
    service.setEnsureSession(async () => "session-1");

    const result = await service.handleStoryboardTurn(turn("legacy_file", source), { content: "把分镜节奏加快" });

    expect(result).toMatchObject({ status: "needs_user_confirmation", summary: expect.stringContaining("已调整") });
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("动作：revise_pending") }));
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("shot-existing") }));
    expect(projects.savePendingChapterStoryboard).toHaveBeenCalledTimes(1);
  });

  it("没有 pending 时不会把调整要求直接作用到正式分镜", async () => {
    const runtime = { sendMessage: vi.fn() };
    const service = new StoryboardDialogueService({} as never, runtime as never);
    service.setEnsureSession(async () => "session-1");
    const result = await service.handleStoryboardTurn(turn("g2_db"), { content: "调整镜头节奏" });
    expect(result).toMatchObject({ status: "failed", summary: expect.stringContaining("没有待确认分镜草稿") });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("DB 正文存在未发布修改时不把脏稿作为分镜对白来源", async () => {
    const runtime = { sendMessage: vi.fn() };
    const versions = { getWorkingCopy: vi.fn() };
    const scripts = {
      getWorkingCopy: vi.fn(async () => ({ state: "dirty", currentVersion: { id: "script-v1" } })),
      getHistoryDetail: vi.fn(),
    };
    const service = new StoryboardDialogueService({} as never, runtime as never, versions as never, scripts as never);
    service.setEnsureSession(async () => "session-1");
    const result = await service.handleStoryboardTurn(turn("g2_db"), { content: "生成分镜", intent: "generate_storyboard" });
    expect(result).toMatchObject({ status: "failed", summary: expect.stringContaining("未发布修改") });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(versions.getWorkingCopy).not.toHaveBeenCalled();
  });

  it("DB 对话确认走正式 Working Copy confirm，不调用 legacy confirm", async () => {
    const source = pendingBoard();
    const currentBoard = { ...source, status: "storyboard_done" as const, confirmedAt: "2026-07-16T00:01:00.000Z" };
    const projects = {
      confirmChapterStoryboard: vi.fn(),
      getWorkbenchSnapshot: vi.fn(async () => ({ ...turn("g2_db").snapshot, pendingStoryboard: null, storyboard: currentBoard, currentChapter: turn("g2_db").snapshot.currentChapter, chapters: [turn("g2_db").snapshot.currentChapter] })),
    };
    const versions = {
      getWorkingCopy: vi.fn(async () => working({ pending: true, rowVersion: 2, shotId: "db-shot-1" })),
      confirmWorkingCopy: vi.fn(async () => ({ value: {}, chapterRowVersion: 9, replayed: false })),
    };
    const service = new StoryboardDialogueService(projects as never, { sendMessage: vi.fn() } as never, versions as never);
    service.setEnsureSession(async () => "session-1");
    const result = await service.handleStoryboardTurn(turn("g2_db", source), { content: "确认分镜", intent: "confirm_storyboard" });
    expect(result).toMatchObject({ status: "succeeded", tool: "confirm_storyboard", storyboard: { status: "storyboard_done" } });
    expect(versions.confirmWorkingCopy).toHaveBeenCalledTimes(1);
    expect(projects.confirmChapterStoryboard).not.toHaveBeenCalled();
  });

  it("S2 首次固定质量失败时只定向修复一次，合格后才保存 pending", async () => {
    const invalid = aiStoryboard();
    invalid.shots[0]!.coreAction = "待补充";
    const repaired = aiStoryboard();
    const source = pendingBoard("legacy-pending", "shot-existing");
    const runtime = {
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(invalid) })
        .mockResolvedValueOnce({ content: JSON.stringify(repaired) })
        .mockResolvedValueOnce({ content: JSON.stringify(aiVisualBrief()) }),
    };
    const projects = {
      getPendingChapterStoryboard: vi.fn(async () => null),
      savePendingChapterStoryboard: vi.fn(async (_projectId, _chapterId, input) => ({
        storyboard: { ...source, storyboardJson: input.storyboardJson },
      })),
    };
    const service = new StoryboardDialogueService(projects as never, runtime as never);
    service.setEnsureSession(async () => "session-1");

    const result = await service.handleStoryboardTurn(turn(), { content: "生成分镜", intent: "generate_storyboard" });

    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage.mock.calls[1]?.[0]?.content).toContain("STORYBOARD_CORE_ACTION:shots[0]:PLACEHOLDER");
    expect(projects.savePendingChapterStoryboard).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "needs_user_confirmation", tool: "generate_storyboard" });
  });

  it("S2 JSON 失败与后续质量失败共用一次修复预算，第二次失败不写 pending", async () => {
    const invalidAfterRepair = aiStoryboard();
    invalidAfterRepair.shots[0]!.promptDraft = "对白：听完再决定。16:9 分格";
    const runtime = {
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: "{这不是合法 JSON" })
        .mockResolvedValueOnce({ content: JSON.stringify(invalidAfterRepair) }),
    };
    const projects = {
      getPendingChapterStoryboard: vi.fn(async () => null),
      savePendingChapterStoryboard: vi.fn(),
    };
    const service = new StoryboardDialogueService(projects as never, runtime as never);
    service.setEnsureSession(async () => "session-1");

    const result = await service.handleStoryboardTurn(turn(), { content: "生成分镜", intent: "generate_storyboard" });

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage.mock.calls[1]?.[0]?.content).toContain("校验错误：");
    expect(projects.savePendingChapterStoryboard).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed", summary: expect.stringContaining("本次没有写入或替换待确认分镜") });
  });

  it("候选图详细说明返修后仍不合格时，整份分镜不写 pending", async () => {
    const invalidBrief = {
      shots: [{ order: 1, visualDescription: "太短", action: "太短", composition: "太短", promptDraft: "太短" }],
    };
    const runtime = {
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(aiStoryboard()) })
        .mockResolvedValueOnce({ content: JSON.stringify(invalidBrief) })
        .mockResolvedValueOnce({ content: JSON.stringify(invalidBrief) }),
    };
    const projects = {
      getPendingChapterStoryboard: vi.fn(async () => null),
      savePendingChapterStoryboard: vi.fn(),
    };
    const service = new StoryboardDialogueService(projects as never, runtime as never);
    service.setEnsureSession(async () => "session-1");

    const result = await service.handleStoryboardTurn(turn(), { content: "生成分镜", intent: "generate_storyboard" });

    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage.mock.calls[2]?.[0]?.content).toContain("VISUAL_BRIEF_TEXT_TOO_SHORT");
    expect(projects.savePendingChapterStoryboard).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "failed",
      summary: expect.stringContaining("本次没有写入或替换待确认分镜"),
    });
  });

  it("V2.3 正式正文对白被改写时进入同一次修复，逐字恢复后才保存 pending", async () => {
    const invalid = aiStoryboard();
    invalid.shots[0]!.comic.dialogue = "林舟：听完之后再决定。";
    invalid.shots[0]!.motion.voiceLines[0]!.line = "听完之后再决定。";
    const repaired = aiStoryboard();
    const source = pendingBoard("legacy-pending", "shot-existing");
    const runtime = {
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(invalid) })
        .mockResolvedValueOnce({ content: JSON.stringify(repaired) })
        .mockResolvedValueOnce({ content: JSON.stringify(aiVisualBrief()) }),
    };
    const projects = {
      getPendingChapterStoryboard: vi.fn(async () => null),
      savePendingChapterStoryboard: vi.fn(async (_projectId, _chapterId, input) => ({ storyboard: { ...source, storyboardJson: input.storyboardJson } })),
    };
    const sourceTurn = turn();
    sourceTurn.snapshot.currentChapter!.sourceText = formalScript();
    const service = new StoryboardDialogueService(projects as never, runtime as never);
    service.setEnsureSession(async () => "session-1");

    const result = await service.handleStoryboardTurn(sourceTurn, { content: "生成分镜", intent: "generate_storyboard" });

    expect(runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(runtime.sendMessage.mock.calls[1]?.[0]?.content).toContain("STORYBOARD_VOICE_LINE_NOT_IN_FORMAL_SCRIPT:shots[0].motion.voiceLines[0]");
    expect(projects.savePendingChapterStoryboard).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "needs_user_confirmation", tool: "generate_storyboard" });
  });
});
