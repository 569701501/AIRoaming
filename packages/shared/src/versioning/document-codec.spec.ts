import { describe, expect, it } from "vitest";
import {
  encodePreflightDocumentV2,
  encodeScriptTextV1,
  encodeStoryDocumentV2,
  encodeStoryboardDocumentV2,
  parseStoryDocumentV2,
} from "./document-codec.js";
import { sha256Text } from "./canonical-json.js";

const digest = sha256Text("fixture");

const story = {
  schemaVersion: 2,
  chapterId: "chapter_001",
  synopsis: "雨夜来信",
  direction: { logline: "信使抵达", chapterGoal: "找到收件人", coreConflict: "时间紧迫", emotionalArc: "不安到决意", endingHook: "门后有光" },
  characters: [{ id: "char_a", projectCharacterId: "pc_a", name: "阿澈", role: "lead", level: "lead", entityType: "human", motivation: "找真相", relationship: "独自行动", visualTraits: "短发", notes: "" }],
  scenes: [{ id: "scene_a", name: "旧站", location: "城郊", timeOfDay: "夜", atmosphere: "潮湿", purpose: "相遇" }],
  beats: [{ id: "beat_a", order: 1, title: "收到信", summary: "收到没有署名的信", conflict: "无人解释", characters: ["char_a"], sceneId: "scene_a", visualFocus: "雨幕", outcome: "决定追查" }],
  notes: "",
};

const shot = {
  id: "shot_001", order: 1, beatId: "beat_a", sceneId: "scene_a", characterIds: ["char_a"], coreAction: "拆信", emotion: "警觉", shotType: "medium", cameraAngle: "eye_level",
  comic: { panelDescription: "阿澈站在雨中", composition: "人物居中", dialogue: "", caption: "雨声", panelRhythm: "normal" },
  motion: { visualDescription: "手指拆开信封", compositionDesign: "中景", cameraMovement: "static", frameType: "detail", durationMs: 2000, durationHint: "约 2s", voiceLines: [] },
  promptDraft: "雨夜、旧站",
};

const storyboard = { schemaVersion: 2, chapterId: "chapter_001", shots: [shot], notes: "" };

const preflight = {
  schemaVersion: 2,
  chapterId: "chapter_001",
  sourceSnapshot: {
    schemaVersion: 1, policyVersion: "preflight-source-v1", projectId: "project_001", chapterId: "chapter_001", consumerType: "preflight_revision",
    storyboard: { id: "board_001", digest }, style: { comicFormat: "vertical_scroll", artStyle: "comic_style", styleDigest: digest },
    characters: [{ characterId: "char_a", required: true, generationInputDigest: digest, visualId: null, assetId: null, assetSha256: null }],
    scenes: [{ chapterSceneId: "scene_a", sceneKey: "old-station", visualId: null, assetId: null, assetSha256: null }],
  },
  shotCount: 1,
  characterChecks: [{ characterId: "char_a", name: "阿澈", level: "lead", appearanceCount: 1, requiredReference: true, referenceReady: false, referenceAssetId: null, status: "blocked", note: "缺少定稿" }],
  sceneChecks: [{ sceneId: "scene_a", name: "旧站", shotCount: 1, referenceAssetId: null, referenceReady: false, status: "warning", note: "" }],
  styleCheck: { comicFormat: "vertical_scroll", comicFormatLabel: "竖向条漫", artStyle: "comic_style", artStyleLabel: "漫画风", status: "ok", note: "" },
  issues: [{ type: "missing_reference", status: "blocked", message: "缺少角色参考图", relatedName: "阿澈", relatedCharacterId: "char_a", relatedSceneId: null, relatedShotId: null }],
  ready: false,
  notes: "待补角色图",
  policyVersion: "preflight-source-v1",
};

describe("G2 V2 document codecs", () => {
  it("encodes strict Story V2 and keeps narrative order", () => {
    const encoded = encodeStoryDocumentV2(story);
    expect(encoded.schemaVersion).toBe(2);
    expect(encoded.canonical).toContain('"chapterId":"chapter_001"');
    expect(encoded.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(parseStoryDocumentV2(encoded.canonical)).toEqual(story);
  });

  it("rejects unknown, missing and undeclared null fields", () => {
    expect(() => encodeStoryDocumentV2({ ...story, extra: true })).toThrow(/unknown field/);
    const { notes: _notes, ...missingNotes } = story;
    expect(() => encodeStoryDocumentV2(missingNotes)).toThrow(/missing required/);
    expect(() => encodeStoryDocumentV2({ ...story, synopsis: null })).toThrow(/expected string/);
  });

  it("excludes legacy metadata by rejecting it rather than digesting it", () => {
    expect(() => encodeStoryboardDocumentV2({ ...story, chapterTitle: "旧标题" })).toThrow(/unknown field/);
    const first = encodeStoryDocumentV2(story);
    const withDifferentNotes = encodeStoryDocumentV2({ ...story, notes: "备注" });
    expect(withDifferentNotes.digest).not.toBe(first.digest);
  });

  it("validates storyboard enums, orders and preflight source snapshot", () => {
    expect(encodeStoryboardDocumentV2(storyboard).digest).toMatch(/^sha256:/);
    expect(() => encodeStoryboardDocumentV2({ ...storyboard, shots: [{ ...shot, order: 2 }] })).toThrow(/contiguous/);
    expect(encodePreflightDocumentV2(preflight).digest).toMatch(/^sha256:/);
    expect(() => encodePreflightDocumentV2({ ...preflight, sourceSnapshot: { ...preflight.sourceSnapshot, policyVersion: "old" } })).toThrow(/unsupported/);
  });

  it("normalizes script bytes deterministically and rejects invalid UTF-8/empty publish", () => {
    const first = encodeScriptTextV1(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x0d, 0x0a, 0x42]));
    const second = encodeScriptTextV1("A\nB");
    expect(first.canonical).toBe("A\nB");
    expect(first.digest).toBe(second.digest);
    expect(() => encodeScriptTextV1(new Uint8Array([0xc3, 0x28]))).toThrow(/UTF-8/);
    expect(() => encodeScriptTextV1(" \n ")).toThrow(/non-empty/);
    expect(encodeScriptTextV1(" \n ", { allowEmpty: true }).canonical).toBe("");
  });
});

