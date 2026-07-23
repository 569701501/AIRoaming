import { describe, expect, it } from "vitest";

import type { StoryboardDocumentV2, StoryboardShotV2 } from "../versioning/document-contract.js";
import { normalizeLayoutDialogueV1 } from "./dialogue.js";
import { buildLayoutNarrativeGroupsV1 } from "./narrative.js";

function shot(
  order: number,
  options: {
    scene?: string | null;
    beat?: string | null;
    frame?: StoryboardShotV2["motion"]["frameType"];
    rhythm?: StoryboardShotV2["comic"]["panelRhythm"];
    dialogue?: boolean;
  } = {},
): StoryboardShotV2 {
  const dialogue = options.dialogue ?? false;
  return {
    id: `shot_${order}`,
    order,
    beatId: options.beat === undefined ? "beat_1" : options.beat,
    sceneId: options.scene === undefined ? "scene_1" : options.scene,
    characterIds: dialogue ? ["char_lin"] : [],
    coreAction: `动作 ${order}`,
    emotion: "",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: {
      panelDescription: `动作 ${order}`,
      composition: "",
      dialogue: dialogue ? `林舟：台词 ${order}` : "",
      caption: "",
      panelRhythm: options.rhythm ?? "normal",
    },
    motion: {
      visualDescription: `动作 ${order}`,
      compositionDesign: "",
      cameraMovement: "static",
      frameType: options.frame ?? (dialogue ? "dialogue" : "reaction"),
      durationMs: 1000,
      durationHint: "",
      voiceLines: dialogue
        ? [{ characterId: "char_lin", name: "林舟", line: `台词 ${order}`, voiceStyle: "平静" }]
        : [],
    },
    promptDraft: "",
  };
}

function plan(shots: StoryboardShotV2[]) {
  const storyboard: StoryboardDocumentV2 = { schemaVersion: 2, chapterId: "chapter_1", shots, notes: "" };
  const ledger = normalizeLayoutDialogueV1({
    storyboard,
    characterCatalog: [{ characterId: "char_lin", name: "林舟" }],
  });
  return buildLayoutNarrativeGroupsV1(storyboard, ledger);
}

describe("Smart layout M2 narrative grouping", () => {
  it("SML-GRP-001 keeps contiguous same-beat shots ordered and never merges across scenes", () => {
    const result = plan([
      shot(1),
      shot(2),
      shot(3, { beat: "beat_2" }),
      shot(4, { scene: "scene_2", beat: "beat_3" }),
    ]);
    expect(result.groups.map((group) => group.shotOrders)).toEqual([[1, 2], [3], [4]]);
    expect(result.groups.flatMap((group) => group.shotOrders)).toEqual([1, 2, 3, 4]);
    expect(result.groups.every((group) => group.candidateStrategies.length === 3)).toBe(true);
  });

  it("SML-GRP-002 isolates transition and impact boundaries", () => {
    const result = plan([
      shot(1, { beat: "beat_1" }),
      shot(2, { beat: "beat_1", frame: "transition", rhythm: "transition" }),
      shot(3, { beat: "beat_2", frame: "action", rhythm: "impact" }),
      shot(4, { beat: "beat_3" }),
    ]);
    expect(result.groups.map((group) => [group.shotOrders, group.rhythm])).toEqual([
      [[1], "normal"],
      [[2], "transition"],
      [[3], "impact"],
      [[4], "normal"],
    ]);
  });

  it("SML-GRP-003 keeps a cross-beat two-person exchange together without allowing unbounded groups", () => {
    const result = plan([
      shot(1, { beat: "beat_1", dialogue: true }),
      shot(2, { beat: "beat_2", dialogue: true }),
      shot(3, { beat: "beat_3", dialogue: true }),
      shot(4, { beat: "beat_4", dialogue: true }),
      shot(5, { beat: "beat_5", dialogue: true }),
    ]);
    expect(result.groups.map((group) => group.shotOrders)).toEqual([[1, 2], [3, 4], [5]]);
    expect(result.groups[0]?.semantic).toBe("dialogue_exchange");
    expect(result.groups.every((group) => group.shotIds.length <= 4)).toBe(true);
  });

  it("is deterministic for the same normalized inputs", () => {
    const shots = [shot(1, { dialogue: true }), shot(2, { dialogue: true }), shot(3, { beat: "beat_2" })];
    expect(plan(shots)).toEqual(plan(shots));
  });
});
