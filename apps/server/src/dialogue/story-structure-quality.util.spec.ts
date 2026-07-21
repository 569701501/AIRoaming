import { describe, expect, it } from "vitest";
import { VALID_CHAPTER_SCRIPT_MARKDOWN_V1 } from "@airoaming/shared/script-workflow-test-fixtures";

import {
  assertStoryStructureQuality,
  StoryStructureQualityError,
} from "./story-structure-quality.util.js";
import { buildValidStoryStructure } from "./story-structure-quality.fixture.js";

describe("剧情结构固定质量门", () => {
  it("接受完整覆盖正式章节场景、人物和连续 beat 的结构", () => {
    expect(() => assertStoryStructureQuality(buildValidStoryStructure(), VALID_CHAPTER_SCRIPT_MARKDOWN_V1)).not.toThrow();
  });

  it("历史正文的括号说明不再被拆成伪角色", () => {
    const source = VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace(
      "出场人物：林夏、主持人、买家",
      "出场人物：林夏、主持人（广播/台上）、（屏幕中的失踪信息）、买家（短暂）",
    );

    expect(() => assertStoryStructureQuality(buildValidStoryStructure(), source)).not.toThrow();
  });

  it("拒绝漏掉正文场景或没有 beat 覆盖的场景", () => {
    const structure = buildValidStoryStructure();
    structure.scenes = structure.scenes.slice(0, 1);
    structure.beats = structure.beats.slice(0, 1);
    expect(() => assertStoryStructureQuality(structure, VALID_CHAPTER_SCRIPT_MARKDOWN_V1)).toThrowError(
      expect.objectContaining<Partial<StoryStructureQualityError>>({
        issues: expect.arrayContaining(["STRUCTURE_SOURCE_SCENE_COUNT_MISMATCH", "STRUCTURE_SOURCE_SCENE_MISSING:scene-2"]),
      }),
    );
  });

  it("拒绝非法角色枚举、未知人物引用和不连续 beat 顺序", () => {
    const structure = buildValidStoryStructure();
    structure.characters[0]!.level = "hero" as never;
    structure.beats[1]!.order = 4;
    structure.beats[1]!.characters = ["不存在的人物"];
    expect(() => assertStoryStructureQuality(structure, VALID_CHAPTER_SCRIPT_MARKDOWN_V1)).toThrowError(
      expect.objectContaining<Partial<StoryStructureQualityError>>({
        issues: expect.arrayContaining([
          "STRUCTURE_CHARACTER_LEVEL_INVALID:character-1",
          "STRUCTURE_BEAT_ORDER_NOT_CONTIGUOUS:beat-2",
          "STRUCTURE_BEAT_CHARACTER_UNKNOWN:beat-2:不存在的人物",
        ]),
      }),
    );
  });

  it("拒绝空壳字段和复制粘贴的关键事件", () => {
    const structure = buildValidStoryStructure();
    structure.direction.chapterGoal = "待补充";
    structure.scenes[0]!.purpose = "";
    structure.beats[1]!.summary = structure.beats[0]!.summary;
    structure.beats[1]!.outcome = "无";
    expect(() => assertStoryStructureQuality(structure, VALID_CHAPTER_SCRIPT_MARKDOWN_V1)).toThrowError(
      expect.objectContaining<Partial<StoryStructureQualityError>>({
        issues: expect.arrayContaining([
          "STRUCTURE_DIRECTION_PLACEHOLDER:chapterGoal",
          "STRUCTURE_SCENE_PURPOSE_EMPTY:scene-1",
          "STRUCTURE_BEAT_SUMMARY_REPEATED",
          "STRUCTURE_BEAT_OUTCOME_PLACEHOLDER:beat-2",
        ]),
      }),
    );
  });
});
