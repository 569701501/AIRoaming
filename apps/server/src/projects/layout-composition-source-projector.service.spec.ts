import {
  StoryboardDocumentCodecV2,
  type StoryboardDocumentV2,
  type StoryboardShotV2,
} from "@airoaming/shared";
import { describe, expect, it } from "vitest";

import { LayoutCompositionSourceProjector } from "./layout-composition-source-projector.service.js";

function storyboard(characterToken: string): StoryboardDocumentV2 {
  const shot: StoryboardShotV2 = {
    id: "shot_dialogue",
    order: 1,
    beatId: "beat_dialogue",
    sceneId: "scene_dialogue",
    characterIds: [characterToken],
    coreAction: "角色开口",
    emotion: "平静",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: {
      panelDescription: "角色站在画面中央",
      composition: "中景",
      dialogue: "",
      caption: "",
      panelRhythm: "normal",
    },
    motion: {
      visualDescription: "角色站在画面中央",
      compositionDesign: "中景",
      cameraMovement: "static",
      frameType: "dialogue",
      durationMs: 1_200,
      durationHint: "normal",
      voiceLines: [{
        characterId: characterToken,
        name: "林舟",
        line: "现在开始。",
        voiceStyle: "平静",
      }],
    },
    promptDraft: "",
  };
  return {
    schemaVersion: 2,
    chapterId: "chapter_dialogue",
    shots: [shot],
    notes: "",
  };
}

function service(): LayoutCompositionSourceProjector {
  return new LayoutCompositionSourceProjector(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function reader(input: {
  document: StoryboardDocumentV2;
  characters: Array<{ id: string; name: string }>;
  mappings: Array<{
    sourceToken: string;
    character: { id: string; name: string } | null;
  }>;
}) {
  const encoded = StoryboardDocumentCodecV2.encode(input.document);
  return {
    chapter: {
      findFirst: async () => ({ currentStoryboardVersionId: "storyboard_dialogue" }),
    },
    storyboardVersion: {
      findFirst: async () => ({
        id: "storyboard_dialogue",
        documentJson: encoded.value,
        documentDigest: encoded.digest,
      }),
    },
    character: {
      findMany: async () => input.characters,
    },
    storyboardShotCharacter: {
      findMany: async () => input.mappings,
    },
  };
}

describe("LayoutCompositionSourceProjector dialogue preflight source", () => {
  it("resolves a Storyboard token that is already the direct Character ID", async () => {
    const source = await service().currentDialoguePreflightSource(
      { projectId: "project_dialogue", chapterId: "chapter_dialogue" },
      reader({
        document: storyboard("char_direct"),
        characters: [{ id: "char_direct", name: "林舟" }],
        mappings: [],
      }) as never,
    );

    expect(source).toMatchObject({
      storyboardVersionId: "storyboard_dialogue",
      storyboardDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      dialogueLedger: {
        items: [{
          shotId: "shot_dialogue",
          speakerCharacterId: "char_direct",
          speakerName: "林舟",
          text: "现在开始。",
        }],
      },
    });
  });

  it("resolves a Storyboard source token through the frozen projection mapping", async () => {
    const source = await service().currentDialoguePreflightSource(
      { projectId: "project_dialogue", chapterId: "chapter_dialogue" },
      reader({
        document: storyboard("story_token_lin"),
        characters: [{ id: "char_database_lin", name: "林舟" }],
        mappings: [{
          sourceToken: "story_token_lin",
          character: { id: "char_database_lin", name: "林舟" },
        }],
      }) as never,
    );

    expect(source.dialogueLedger.items).toEqual([
      expect.objectContaining({
        shotId: "shot_dialogue",
        speakerCharacterId: "story_token_lin",
        speakerName: "林舟",
        text: "现在开始。",
      }),
    ]);
  });
});
