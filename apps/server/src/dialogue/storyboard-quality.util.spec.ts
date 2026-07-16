import { describe, expect, it } from "vitest";
import type { StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import {
  assertStoryboardGenerationOutputContract,
  assertStoryboardQuality,
  StoryboardOutputContractError,
  StoryboardQualityError,
} from "./storyboard-quality.util.js";

function structure(): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜追踪",
    sourceScriptVersionId: "script-v1",
    synopsis: "林舟在站台发现线索并追上空车。",
    direction: { logline: "追上空车", chapterGoal: "取得线索", coreConflict: "列车即将离站", emotionalArc: "怀疑到决断", endingHook: "车内有人", },
    characters: [{ id: "character_01", projectCharacterId: "char-lin", name: "林舟", role: "记者", level: "lead", entityType: "human", motivation: "查明真相", relationship: "", visualTraits: "灰色风衣", notes: "" }],
    scenes: [
      { id: "scene_01", name: "雨夜站台", location: "旧站", timeOfDay: "深夜", atmosphere: "冷雨", purpose: "发现线索" },
      { id: "scene_02", name: "末班空车", location: "车厢", timeOfDay: "深夜", atmosphere: "压迫", purpose: "追上目标" },
    ],
    beats: [
      { id: "beat_01", order: 1, title: "发现车票", summary: "林舟看见湿车票", conflict: "列车将离站", characters: ["character_01"], sceneId: "scene_01", visualFocus: "车票", outcome: "锁定空车" },
      { id: "beat_02", order: 2, title: "跃入车厢", summary: "林舟赶在关门前上车", conflict: "车门关闭", characters: ["character_01"], sceneId: "scene_02", visualFocus: "车门", outcome: "进入空车" },
    ],
    notes: "",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function shot(input: { id: string; order: number; beatId: string; sceneId: string; action: string; frameType?: "action" | "dialogue" }): StoryboardJson["shots"][number] {
  return {
    id: input.id,
    order: input.order,
    beatId: input.beatId,
    sceneId: input.sceneId,
    characterIds: ["character_01"],
    coreAction: input.action,
    emotion: "紧张专注",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: { panelDescription: `${input.action}的定格瞬间`, composition: `${input.action}位于画面视觉中心`, dialogue: "", caption: "", panelRhythm: "fast" },
    motion: { visualDescription: `${input.action}，雨水沿衣角落下`, compositionDesign: "主体沿对角线运动", cameraMovement: "track_right", frameType: input.frameType ?? "action", durationMs: 2400, durationHint: "约 2.4s", voiceLines: [] },
    promptDraft: `林舟，${input.action}，深夜冷雨，对角线构图`,
    lockedCandidateId: null,
    status: "draft",
  };
}

function storyboard(): StoryboardJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜追踪",
    sourceStoryVersionId: "story-v1",
    shots: [
      shot({ id: "shot_001", order: 1, beatId: "beat_01", sceneId: "scene_01", action: "林舟俯身拾起湿车票" }),
      shot({ id: "shot_002", order: 2, beatId: "beat_02", sceneId: "scene_02", action: "林舟侧身跃入即将关闭的车门" }),
    ],
    notes: "先发现线索，再进入空车",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function issuesOf(run: () => void): readonly string[] {
  try {
    run();
    return [];
  } catch (error) {
    if (error instanceof StoryboardQualityError || error instanceof StoryboardOutputContractError) return error.issues;
    throw error;
  }
}

describe("S2 分镜输出契约与固定质量门", () => {
  it("接受字段完整、beat 全覆盖且顺序正确的分镜", () => {
    const value = storyboard();
    expect(() => assertStoryboardGenerationOutputContract(value)).not.toThrow();
    expect(() => assertStoryboardQuality(value, structure())).not.toThrow();
  });

  it("允许漫画锁定静态瞬间、漫剧表达同一剧情锚点的完整时间过程", () => {
    const value = storyboard();
    const target = value.shots[0]!;
    target.comic.panelDescription = "林舟指尖刚触到湿车票的定格瞬间";
    target.comic.composition = "车票位于前景，林舟的手从右上方进入，左侧保留旁白空间";
    target.motion.visualDescription = "林舟先环顾空站台，随后弯腰拾起湿车票，最后抬头锁定即将离站的空车";
    target.motion.compositionDesign = "人物从画面右侧进入中央，动作结束时视线指向左后方空车";

    expect(target.comic.panelDescription).not.toBe(target.motion.visualDescription);
    expect(() => assertStoryboardGenerationOutputContract(value)).not.toThrow();
    expect(() => assertStoryboardQuality(value, structure())).not.toThrow();
  });

  it("新 AI 输出缺字段、非法枚举或不连续 order 时不使用默认值掩盖", () => {
    const value = storyboard() as unknown as { notes: string; shots: Array<Record<string, unknown>> };
    value.shots[0]!.id = 123;
    value.shots[0]!.order = 3;
    value.shots[0]!.shotType = "cowboy";
    (value.shots[0]!.comic as Record<string, unknown>).composition = "";
    const issues = issuesOf(() => assertStoryboardGenerationOutputContract(value));
    expect(issues).toEqual(expect.arrayContaining([
      "STORYBOARD_SHOT_ID_INVALID:shots[0]",
      "STORYBOARD_ORDER_NOT_CONTIGUOUS:shots[0]",
      "STORYBOARD_ENUM_INVALID:shots[0].shotType",
      "STORYBOARD_FIELD_EMPTY:shots[0].comic.composition",
    ]));
  });

  it("阻断漏 beat、beat 倒序和 beat/scene 不一致", () => {
    const missing = storyboard();
    missing.shots = [missing.shots[0]!];
    expect(issuesOf(() => assertStoryboardQuality(missing, structure())))
      .toContain("STORYBOARD_BEAT_MISSING:beat_02");

    const reversed = storyboard();
    reversed.shots = [
      { ...reversed.shots[1]!, order: 1 },
      { ...reversed.shots[0]!, order: 2 },
    ];
    expect(issuesOf(() => assertStoryboardQuality(reversed, structure())))
      .toContain("STORYBOARD_BEAT_ORDER_REGRESSION:shots[1]:beat_01");

    const wrongScene = storyboard();
    wrongScene.shots[0]!.sceneId = "scene_02";
    expect(issuesOf(() => assertStoryboardQuality(wrongScene, structure())))
      .toContain("STORYBOARD_BEAT_SCENE_MISMATCH:shots[0]:beat_01");
  });

  it("阻断占位、完全重复镜头和重复 promptDraft", () => {
    const value = storyboard();
    value.shots[0]!.coreAction = "待补充";
    value.shots[0]!.motion.visualDescription = "漫剧动态画面描述";
    const duplicate = {
      ...structuredClone(value.shots[0]!),
      id: "shot_003",
      order: 2,
    };
    value.shots[1]!.order = 3;
    value.shots[1]!.promptDraft = value.shots[0]!.promptDraft;
    value.shots = [value.shots[0]!, duplicate, value.shots[1]!];
    const issues = issuesOf(() => assertStoryboardQuality(value, structure()));
    expect(issues).toContain("STORYBOARD_CORE_ACTION:shots[0]:PLACEHOLDER");
    expect(issues).toContain("STORYBOARD_MOTION_VISUAL:shots[0]:PLACEHOLDER");
    expect(issues).toContain("STORYBOARD_SHOT_DUPLICATE:shots[1]");
    expect(issues).toContain("STORYBOARD_PROMPT_DRAFT_REPEATED");
  });

  it("阻断 comic/motion 对话不一致与 promptDraft 文本污染", () => {
    const value = storyboard();
    const target = value.shots[0]!;
    target.motion.frameType = "dialogue";
    target.comic.dialogue = "林舟：车里有人。";
    target.motion.voiceLines = [{ characterId: "character_01", name: "林舟", line: "快走。", voiceStyle: "低声" }];
    target.promptDraft = "对白：车里有人，16:9 分格画面";
    const issues = issuesOf(() => assertStoryboardQuality(value, structure()));
    expect(issues).toEqual(expect.arrayContaining([
      "STORYBOARD_DIALOGUE_MOTION_MISMATCH:shots[0]",
      "STORYBOARD_PROMPT_DRAFT_FORBIDDEN:shots[0]",
    ]));
  });
});
