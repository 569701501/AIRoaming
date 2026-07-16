import { describe, expect, it } from "vitest";
import type { ProjectCharacter, StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import { resolveStoryboardReferences, StoryboardReferenceError } from "./storyboard-reference.util.js";

const structure = {
  characters: [
    { id: "character_01", projectCharacterId: "char-lin", name: "林舟" },
    { id: "character_02", projectCharacterId: "char-xu", name: "许澄" },
  ],
  scenes: [{ id: "scene_01" }],
  beats: [{ id: "beat_01" }],
} as StoryStructureJson;

const projectCharacters = [
  { id: "char-lin", name: "林舟" },
  { id: "char-xu", name: "许澄" },
] as ProjectCharacter[];

function storyboard(): StoryboardJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜交易",
    sourceStoryVersionId: "story-1",
    shots: [{
      id: "shot_001",
      order: 1,
      beatId: "beat_01",
      sceneId: "scene_01",
      characterIds: ["character_01", "许澄", "character_01"],
      coreAction: "林舟把录音递给许澄",
      emotion: "警惕",
      shotType: "medium",
      cameraAngle: "over_shoulder",
      comic: { panelDescription: "两人隔桌对峙", composition: "林舟前景，许澄后景", dialogue: "林舟：听完再决定。", caption: "", panelRhythm: "normal" },
      motion: { visualDescription: "林舟推过录音笔", compositionDesign: "过肩构图", cameraMovement: "push_in", frameType: "dialogue", durationMs: 3000, durationHint: "约 3s", voiceLines: [{ characterId: "character_01", name: "林舟", line: "听完再决定。", voiceStyle: "克制" }] },
      promptDraft: "雨夜室内，两人对峙",
      lockedCandidateId: null,
      status: "draft",
    }],
    notes: "",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

describe("S1 分镜引用映射", () => {
  it("把角色卡 ID/角色名映射为项目角色 ID，并保留 beat/scene 本地 ID", () => {
    const result = resolveStoryboardReferences(storyboard(), structure, projectCharacters);
    expect(result.shots[0]).toMatchObject({
      beatId: "beat_01",
      sceneId: "scene_01",
      characterIds: ["char-lin", "char-xu"],
      cameraAngle: "over_shoulder",
    });
    expect(result.shots[0]?.motion.voiceLines[0]?.characterId).toBe("char-lin");
  });

  it("未绑定角色或越界 beat/scene 会在落库前失败", () => {
    const invalid = storyboard();
    invalid.shots[0]!.characterIds = ["陌生人"];
    invalid.shots[0]!.beatId = "beat_unknown";
    invalid.shots[0]!.sceneId = "scene_unknown";
    expect(() => resolveStoryboardReferences(invalid, structure, projectCharacters)).toThrow(StoryboardReferenceError);
    try {
      resolveStoryboardReferences(invalid, structure, projectCharacters);
    } catch (error) {
      expect((error as Error).message).toContain("beatId");
      expect((error as Error).message).toContain("sceneId");
      expect((error as Error).message).toContain("未绑定角色");
    }
  });
});
