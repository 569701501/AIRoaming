import { describe, expect, it } from "vitest";
import type { StoryStructureJson } from "@airoaming/shared";
import {
  toStoryDocumentV2,
  UNRESOLVED_STORY_CHARACTER_PREFIX,
} from "./story-document-adapter.util.js";

function structure(): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜交易",
    sourceScriptVersionId: "script-version-1",
    synopsis: "林舟找到录音。",
    direction: {
      logline: "林舟找到录音。",
      chapterGoal: "带走录音。",
      coreConflict: "追兵逼近。",
      emotionalArc: "警觉转为坚定。",
      endingHook: "录音内容未知。",
    },
    characters: [{
      id: "character_01",
      projectCharacterId: null,
      name: "林舟",
      role: "主角",
      level: "lead",
      entityType: "human",
      motivation: "寻找真相",
      relationship: "",
      visualTraits: "",
      notes: "",
    }],
    scenes: [{
      id: "scene_01",
      name: "旧港仓库",
      location: "旧港仓库",
      timeOfDay: "深夜",
      atmosphere: "紧迫",
      purpose: "揭示线索",
    }],
    beats: [{
      id: "beat_01",
      order: 1,
      title: "发现录音",
      summary: "林舟找到录音。",
      conflict: "追兵逼近。",
      characters: ["林舟"],
      sceneId: "scene_01",
      visualFocus: "林舟握住录音。",
      outcome: "林舟带走录音。",
    }],
    notes: "",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}

describe("toStoryDocumentV2", () => {
  it("把角色名引用转换为本地角色 ID，并留下可事务解析的项目角色引用", () => {
    const result = toStoryDocumentV2(structure());
    expect(result.characters[0]?.projectCharacterId)
      .toBe(`${UNRESOLVED_STORY_CHARACTER_PREFIX}character_01`);
    expect(result.beats[0]?.characters).toEqual(["character_01"]);
  });

  it("未知角色引用立即失败，不生成无效正式文档", () => {
    const input = structure();
    input.beats[0]!.characters = ["不存在的人物"];
    expect(() => toStoryDocumentV2(input))
      .toThrow("STORY_STRUCTURE_BEAT_CHARACTER_UNRESOLVED:beat_01:不存在的人物");
  });
});
