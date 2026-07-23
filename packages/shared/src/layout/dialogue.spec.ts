import { describe, expect, it } from "vitest";

import type { StoryboardDocumentV2, StoryboardShotV2 } from "../versioning/document-contract.js";
import {
  digestLayoutDialogueSourceTextV1,
  normalizeLayoutDialogueV1,
  type LayoutDialogueCharacterV1,
} from "./dialogue.js";

const characters: LayoutDialogueCharacterV1[] = [
  { characterId: "char_lin", name: "林舟" },
  { characterId: "char_xu", name: "许澄" },
];

function shot(overrides: Partial<StoryboardShotV2> = {}): StoryboardShotV2 {
  return {
    id: "shot_1",
    order: 1,
    beatId: "beat_1",
    sceneId: "scene_1",
    characterIds: ["char_lin"],
    coreAction: "林舟翻开记录",
    emotion: "冷静",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: {
      panelDescription: "林舟翻开记录",
      composition: "人物居中",
      dialogue: "",
      caption: "",
      panelRhythm: "normal",
    },
    motion: {
      visualDescription: "林舟翻开记录",
      compositionDesign: "中景",
      cameraMovement: "static",
      frameType: "dialogue",
      durationMs: 1200,
      durationHint: "normal",
      voiceLines: [],
    },
    promptDraft: "",
    ...overrides,
  };
}

function storyboard(shots: StoryboardShotV2[]): StoryboardDocumentV2 {
  return { schemaVersion: 2, chapterId: "chapter_1", shots, notes: "" };
}

describe("Smart layout M2 dialogue normalization", () => {
  it("SML-DLG-001/003 prefers voiceLines, removes exact duplicates and keeps captions in stable order", () => {
    const source = shot({
      comic: {
        panelDescription: "林舟翻开记录",
        composition: "人物居中",
        dialogue: "林舟：听完再决定。\r\n林舟:第二句。",
        caption: "雨还没有停。\r\n灯灭了。",
        panelRhythm: "normal",
      },
      motion: {
        visualDescription: "林舟翻开记录",
        compositionDesign: "中景",
        cameraMovement: "static",
        frameType: "dialogue",
        durationMs: 1200,
        durationHint: "normal",
        voiceLines: [
          { characterId: "char_lin", name: "林舟", line: "听完再决定。", voiceStyle: "平静" },
          { characterId: "char_lin", name: "林舟", line: "第二句。", voiceStyle: "内心、克制" },
        ],
      },
    });
    const first = normalizeLayoutDialogueV1({ storyboard: storyboard([source]), characterCatalog: characters });
    const second = normalizeLayoutDialogueV1({ storyboard: storyboard([source]), characterCatalog: characters });

    expect(first).toEqual(second);
    expect(first.items.map((item) => [item.source, item.text, item.kind, item.lineOrder])).toEqual([
      ["voice_line", "听完再决定。", "speech", 1],
      ["voice_line", "第二句。", "thought", 2],
      ["comic_caption", "雨还没有停。", "caption", 3],
      ["comic_caption", "灯灭了。", "caption", 4],
    ]);
    expect(first.issues.filter((issue) => issue.code === "duplicate_exact_record")).toHaveLength(2);
    expect(new Set(first.items.map((item) => item.id)).size).toBe(first.items.length);
  });

  it("SML-DLG-002/010/011 only removes an exact current-character prefix and preserves unresolved text", () => {
    const source = shot({
      comic: {
        panelDescription: "林舟翻开记录",
        composition: "人物居中",
        dialogue: "林舟：听完再决定。\n陌生人：不要回头。",
        caption: "",
        panelRhythm: "normal",
      },
    });
    const ledger = normalizeLayoutDialogueV1({ storyboard: storyboard([source]), characterCatalog: characters });

    expect(ledger.items).toHaveLength(2);
    expect(ledger.items[0]).toMatchObject({
      source: "comic_dialogue",
      sourceText: "林舟：听完再决定。",
      text: "听完再决定。",
      speakerCharacterId: "char_lin",
      speakerName: "林舟",
      normalization: "speaker_prefix_removed",
      confidence: "exact",
    });
    expect(ledger.items[0]?.sourceTextDigest).toBe(digestLayoutDialogueSourceTextV1("林舟：听完再决定。"));
    expect(ledger.items[1]).toMatchObject({
      sourceText: "陌生人：不要回头。",
      text: "陌生人：不要回头。",
      speakerCharacterId: null,
      speakerName: "",
      normalization: "identity",
      confidence: "unresolved",
    });
    expect(ledger.issues).toContainEqual({
      code: "speaker_unresolved",
      severity: "warning",
      shotId: "shot_1",
      source: "comic_dialogue",
      sourceIndex: 1,
    });
  });

  it("SML-DLG-004/012 retains ambiguous placeholders, drops only blank/punctuation records and never fuzzy-deduplicates", () => {
    const source = shot({
      characterIds: ["char_lin", "char_xu"],
      comic: {
        panelDescription: "两人对视",
        composition: "双人",
        dialogue: "林舟：已经到了！\nnone\n……\n   ",
        caption: "null\n——\n💥",
        panelRhythm: "normal",
      },
      motion: {
        visualDescription: "两人对视",
        compositionDesign: "双人",
        cameraMovement: "static",
        frameType: "dialogue",
        durationMs: 1200,
        durationHint: "normal",
        voiceLines: [
          { characterId: null, name: "门外声音", line: "已经到了。", voiceStyle: "平静" },
          { characterId: "char_xu", name: "许澄", line: "快走。", voiceStyle: "命令、急促" },
        ],
      },
    });
    const ledger = normalizeLayoutDialogueV1({ storyboard: storyboard([source]), characterCatalog: characters });

    expect(ledger.items.map((item) => [item.text, item.kind])).toEqual([
      ["已经到了。", "speech"],
      ["快走。", "shout"],
      ["已经到了！", "speech"],
      ["none", "speech"],
      ["null", "caption"],
      ["💥", "caption"],
    ]);
    expect(ledger.issues.filter((issue) => issue.code === "ambiguous_placeholder")).toHaveLength(2);
    expect(ledger.issues.filter((issue) => issue.code === "punctuation_only_record")).toHaveLength(2);
    expect(ledger.issues.some((issue) => issue.code === "speaker_unresolved" && issue.source === "voice_line")).toBe(true);
  });

  it("keeps stable IDs under permitted NFC/line-ending normalization but changes them with source identity", () => {
    const decomposed = "Cafe\u0301";
    const firstShot = shot({
      comic: { ...shot().comic, dialogue: `${decomposed}\r\n第二行` },
    });
    const normalizedShot = shot({
      comic: { ...shot().comic, dialogue: "Café\n第二行" },
    });
    const first = normalizeLayoutDialogueV1({ storyboard: storyboard([firstShot]), characterCatalog: characters });
    const second = normalizeLayoutDialogueV1({ storyboard: storyboard([normalizedShot]), characterCatalog: characters });
    expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
    expect(first.ledgerDigest).toBe(second.ledgerDigest);

    const changed = normalizeLayoutDialogueV1({
      storyboard: storyboard([{ ...normalizedShot, id: "shot_2", order: 1 }]),
      characterCatalog: characters,
    });
    expect(changed.items[0]?.id).not.toBe(first.items[0]?.id);
  });
});
