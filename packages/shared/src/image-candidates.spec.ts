import { describe, expect, it } from "vitest";
import {
  createEmptyCandidatesJson,
  getPendingCandidateShotIds,
  normalizeCandidatesJson,
  normalizeChapterCandidateShotEntry,
} from "./image-candidates.js";
import {
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  buildShotImagePrompt,
  buildShotUserPrompt,
} from "./shot-image-prompt.js";
import type { StoryboardShot } from "./dto.js";

const baseShot: Pick<StoryboardShot, "coreAction" | "emotion" | "shotType" | "cameraAngle" | "comic"> = {
  coreAction: "少年在雨中回头",
  emotion: "紧张",
  shotType: "close_up",
  cameraAngle: "low_angle",
  comic: {
    panelDescription: "雨夜老街，霧气弥漫",
    composition: "主角居右，背景虹灯虚化",
    dialogue: "谁？",
    caption: "",
    panelRhythm: "impact",
  },
};

describe("buildShotImagePrompt", () => {
  it("拼接系统/画风/用户三段，快照字段完整", () => {
    const snapshot = buildShotImagePrompt({
      systemTemplate: null,
      style: { comicFormatLabel: "条漫", artStyleLabel: "日系彩色" },
      shot: baseShot,
      characters: [{ name: "阿影", appearance: "黑发金瞳", promptFragment: "black coat" }],
      scene: { name: "老街", location: "南城", timeOfDay: "夜", atmosphere: "雨" },
      userPromptOverride: null,
    });
    expect(snapshot.systemPart).toBe(DEFAULT_IMAGE_PROMPT_TEMPLATE);
    expect(snapshot.stylePart).toContain("日系彩色");
    expect(snapshot.userPart).toContain("阿影");
    expect(snapshot.userPart).toContain("close-up");
    expect(snapshot.userPart).toContain("low angle");
    expect(snapshot.finalPrompt).toBe(`${snapshot.systemPart}\n\n${snapshot.stylePart}\n\n${snapshot.userPart}`);
  });

  it("自定义系统模板生效；空白模板回退默认", () => {
    const custom = buildShotImagePrompt({
      systemTemplate: "MY TEMPLATE",
      style: { comicFormatLabel: "", artStyleLabel: "" },
      shot: baseShot,
      characters: [],
      scene: null,
      userPromptOverride: null,
    });
    expect(custom.systemPart).toBe("MY TEMPLATE");
    const blank = buildShotImagePrompt({
      systemTemplate: "   ",
      style: { comicFormatLabel: "", artStyleLabel: "" },
      shot: baseShot,
      characters: [],
      scene: null,
      userPromptOverride: null,
    });
    expect(blank.systemPart).toBe(DEFAULT_IMAGE_PROMPT_TEMPLATE);
  });

  it("userPromptOverride 优先于自动拼装；空白 override 回退自动", () => {
    const overridden = buildShotImagePrompt({
      systemTemplate: null,
      style: { comicFormatLabel: "", artStyleLabel: "" },
      shot: baseShot,
      characters: [],
      scene: null,
      userPromptOverride: "手写的 prompt",
    });
    expect(overridden.userPart).toBe("手写的 prompt");
    const blankOverride = buildShotImagePrompt({
      systemTemplate: null,
      style: { comicFormatLabel: "", artStyleLabel: "" },
      shot: baseShot,
      characters: [],
      scene: null,
      userPromptOverride: "  ",
    });
    expect(blankOverride.userPart).toBe(buildShotUserPrompt(baseShot, [], null));
  });

  it("气泡文字（dialogue）不进 prompt", () => {
    const snapshot = buildShotImagePrompt({
      systemTemplate: null,
      style: { comicFormatLabel: "", artStyleLabel: "" },
      shot: baseShot,
      characters: [],
      scene: null,
      userPromptOverride: null,
    });
    expect(snapshot.finalPrompt).not.toContain("谁？");
  });
});

describe("normalizeCandidatesJson", () => {
  it("空输入补默认骨架", () => {
    const doc = normalizeCandidatesJson({});
    expect(doc.schemaVersion).toBe(1);
    expect(doc.status).toBe("in_progress");
    expect(doc.shots).toEqual([]);
  });

  it("locked 但候选缺失/已废弃时回退 pending", () => {
    const entry = normalizeChapterCandidateShotEntry({
      shotId: "shot_001",
      decision: "locked",
      lockedCandidateId: "c1",
      candidates: [{ id: "c1", assetPath: "p.png", status: "discarded" }],
    });
    expect(entry?.decision).toBe("pending");
    expect(entry?.lockedCandidateId).toBeNull();
  });

  it("locked 指向有效候选时保留", () => {
    const entry = normalizeChapterCandidateShotEntry({
      shotId: "shot_001",
      decision: "locked",
      lockedCandidateId: "c1",
      candidates: [{ id: "c1", assetPath: "p.png", status: "generated" }],
    });
    expect(entry?.decision).toBe("locked");
    expect(entry?.lockedCandidateId).toBe("c1");
  });

  it("非 locked 时 lockedCandidateId 清空", () => {
    const entry = normalizeChapterCandidateShotEntry({
      shotId: "shot_001",
      decision: "skipped",
      lockedCandidateId: "c1",
      candidates: [],
    });
    expect(entry?.decision).toBe("skipped");
    expect(entry?.lockedCandidateId).toBeNull();
  });
});

describe("getPendingCandidateShotIds", () => {
  it("无记录的 shot 视为 pending；锁定/跳过的不算", () => {
    const doc = createEmptyCandidatesJson({
      chapterId: "chapter_001",
      chapterTitle: "第 1 章",
      sourceStoryboardId: "sb_v1",
      sourceStoryboardUpdatedAt: null,
    });
    doc.shots.push(
      {
        shotId: "shot_001",
        decision: "locked",
        lockedCandidateId: "c1",
        skipNote: "",
        userPromptOverride: null,
        candidates: [{
          id: "c1", taskId: null, assetPath: "p.png", status: "generated",
          promptSnapshot: { systemPart: "", stylePart: "", userPart: "", finalPrompt: "" },
          referenceAssetIds: [], sourceStoryboardUpdatedAt: null, createdAt: "2026-07-06T00:00:00.000Z",
        }],
      },
      { shotId: "shot_002", decision: "skipped", lockedCandidateId: null, skipNote: "过渡格", userPromptOverride: null, candidates: [] },
      { shotId: "shot_003", decision: "pending", lockedCandidateId: null, skipNote: "", userPromptOverride: null, candidates: [] },
    );
    expect(getPendingCandidateShotIds(doc, ["shot_001", "shot_002", "shot_003", "shot_004"]))
      .toEqual(["shot_003", "shot_004"]);
  });
});
