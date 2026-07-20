import { describe, expect, it } from "vitest";
import {
  serializeChapterScriptMarkdownV1,
  type ChapterScriptDocumentV1,
  type StoryStructureJson,
} from "@airoaming/shared";
import {
  buildStoryboardDialogueReference,
  type StoryboardDialogueReference,
} from "./storyboard-dialogue-reference.util.js";
import {
  assertStoryboardQuality,
  StoryboardQualityError,
} from "./storyboard-quality.util.js";
import type { StoryboardJson } from "@airoaming/shared";

function formalScript(dialogue = [
  "林舟：先听完。",
  "林舟压低声音：再决定。",
  "广播：滋……滋……",
].join("\n\n")): string {
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
    endingHook: "录音里出现失踪者声音",
    highlights: ["录音笔", "雨夜", "身份反转"],
    visualAtmosphere: "冷雨",
    colorDirection: "冷蓝",
    visualMotif: "红色录音灯",
    scenes: [{
      order: 1,
      name: "雨夜办公室",
      location: "旧办公室",
      time: "深夜",
      atmosphere: "戒备",
      characters: "林舟",
      description: "林舟把录音笔推过桌面。",
      actions: "林舟收回手，盯着对方。",
      dialogue,
      narration: "无",
      endingPoint: "录音灯亮起。",
    }],
    endingEvent: "录音开始播放",
    suspense: "声音来自谁",
    nextChapterLead: "追查录音来源",
  };
  return serializeChapterScriptMarkdownV1(document);
}

function structure(): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜交易",
    sourceScriptVersionId: "script-v1",
    synopsis: "林舟交出录音笔。",
    direction: { logline: "交出录音", chapterGoal: "确认内容", coreConflict: "互不信任", emotionalArc: "警惕到合作", endingHook: "失踪者声音" },
    characters: [{ id: "character_01", projectCharacterId: "char-lin", name: "林舟", role: "记者", level: "lead", entityType: "human", motivation: "查明真相", relationship: "", visualTraits: "灰色风衣", notes: "" }],
    scenes: [{ id: "scene_01", name: "雨夜办公室", location: "旧办公室", timeOfDay: "深夜", atmosphere: "戒备", purpose: "交出录音" }],
    beats: [{ id: "beat_01", order: 1, title: "交出录音", summary: "林舟交出录音笔", conflict: "互不信任", characters: ["character_01"], sceneId: "scene_01", visualFocus: "录音笔", outcome: "录音开始播放" }],
    notes: "",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function storyboard(line: string): StoryboardJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜交易",
    sourceStoryVersionId: "story-v1",
    shots: [{
      id: "shot_001",
      order: 1,
      beatId: "beat_01",
      sceneId: "scene_01",
      characterIds: ["character_01"],
      coreAction: "林舟把录音笔推过桌面",
      emotion: "警惕",
      shotType: "medium",
      cameraAngle: "over_shoulder",
      comic: { panelDescription: "录音笔停在桌面中央", composition: "录音笔前景，林舟位于右后方", dialogue: `林舟：${line}`, caption: "", panelRhythm: "normal" },
      motion: { visualDescription: "林舟把录音笔推到桌面中央后收回手", compositionDesign: "视线沿桌面移动到录音笔", cameraMovement: "push_in", frameType: "dialogue", durationMs: 2500, durationHint: "约 2.5s", voiceLines: [{ characterId: "character_01", name: "林舟", line, voiceStyle: "克制" }] },
      promptDraft: "雨夜旧办公室，红灯录音笔停在桌面中央，冷蓝光",
      lockedCandidateId: null,
      status: "draft",
    }],
    notes: "",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function issuesOf(run: () => void): readonly string[] {
  try {
    run();
    return [];
  } catch (error) {
    if (error instanceof StoryboardQualityError) return error.issues;
    throw error;
  }
}

describe("V2.3 正式对白候选", () => {
  it("从完整正式章节提取逐字台词，保留来源说话人并映射可识别角色", () => {
    const reference = buildStoryboardDialogueReference(formalScript(), structure());

    expect(reference.available).toBe(true);
    expect(reference.candidates).toEqual([
      expect.objectContaining({ localRef: "dialogue-0001", sceneRef: "scene_01", sourceSpeaker: "林舟", characterRef: "character_01", line: "先听完。" }),
      expect.objectContaining({ localRef: "dialogue-0002", sceneRef: "scene_01", sourceSpeaker: "林舟压低声音", characterRef: "character_01", line: "再决定。" }),
      expect.objectContaining({ localRef: "dialogue-0003", sceneRef: "scene_01", sourceSpeaker: "广播", characterRef: null, line: "滋……滋……" }),
    ]);
  });

  it("去掉成对外层引号，但不改写台词正文和标点", () => {
    const reference = buildStoryboardDialogueReference(formalScript("林舟：“先听完，再决定。”"), structure());
    expect(reference.candidates[0]?.line).toBe("先听完，再决定。");
  });

  it("去掉冒号后的行首表演提示，只把可配音原句编译成逐字候选", () => {
    const reference = buildStoryboardDialogueReference(formalScript([
      "林舟：（压低声音）「先听完。」",
      "林舟：(停顿后)“再决定。”",
    ].join("\n\n")), structure());

    expect(reference.candidates.map((candidate) => candidate.line)).toEqual([
      "先听完。",
      "再决定。",
    ]);
  });

  it("纳入旁白和动作或结束点中有明确声音证据的引号文本", () => {
    const source = formalScript().replace(
      "旁白：\n无\n\n场景结束点：\n录音灯亮起。",
      "旁白：\n雨越下越大。\n\n场景结束点：\n广播响起冰冷提示：“门已经锁定。”",
    );
    const reference = buildStoryboardDialogueReference(source, structure());
    expect(reference.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceSpeaker: "旁白", sourceKind: "narration", line: "雨越下越大。" }),
      expect.objectContaining({ sourceSpeaker: "广播", sourceKind: "quoted_audio", line: "门已经锁定。" }),
    ]));
  });

  it("固定 Markdown 即使没有对白也视为可验证，历史纯文本则降级为不可验证", () => {
    const noDialogue = buildStoryboardDialogueReference(formalScript("无"), structure());
    const legacy = buildStoryboardDialogueReference("林舟把录音笔推过桌面。", structure());
    expect(noDialogue).toEqual(expect.objectContaining({ available: true, candidates: [] }));
    expect(legacy).toEqual(expect.objectContaining({ available: false, candidates: [] }));
  });

  it("可解析正文逐字命中时通过，编造或改写台词时给出确定性质量问题", () => {
    const reference: StoryboardDialogueReference = buildStoryboardDialogueReference(formalScript(), structure());
    expect(() => assertStoryboardQuality(storyboard("先听完。"), structure(), reference)).not.toThrow();
    expect(issuesOf(() => assertStoryboardQuality(storyboard("先听完再决定。"), structure(), reference)))
      .toContain("STORYBOARD_VOICE_LINE_NOT_IN_FORMAL_SCRIPT:shots[0].motion.voiceLines[0]");
  });

  it("历史纯文本没有稳定候选时不新增来源硬门", () => {
    const legacy = buildStoryboardDialogueReference("林舟把录音笔推过桌面。", structure());
    expect(() => assertStoryboardQuality(storyboard("听完再决定。"), structure(), legacy)).not.toThrow();
  });
});
