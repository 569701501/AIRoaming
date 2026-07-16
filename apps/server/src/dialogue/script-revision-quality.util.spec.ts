import { describe, expect, it } from "vitest";
import type { ChapterScriptDocumentV1 } from "@airoaming/shared";

import {
  assertP4LayeredRevision,
  classifyScriptRevisionLayer,
} from "./script-revision-quality.util.js";

const SOURCE: ChapterScriptDocumentV1 = {
  chapterOrder: 2,
  chapterTitle: "门外来客",
  type: "悬疑",
  theme: "信任",
  style: "紧凑",
  comicForm: "竖向条漫",
  targetLength: "约 1200 字",
  logline: "林舟判断门外来客是否可信。",
  chapterGoal: "确认来客身份。",
  coreConflict: "开门可能暴露藏身处。",
  emotionalArc: "戒备到震惊。",
  endingHook: "暗号指向警局内鬼。",
  highlights: ["暗号", "选择", "内鬼"],
  visualAtmosphere: "雨夜",
  colorDirection: "冷蓝",
  visualMotif: "旧钥匙",
  scenes: [{
    order: 1,
    name: "门内门外",
    location: "旧屋",
    time: "夜",
    atmosphere: "戒备",
    characters: "林舟、许澄",
    description: "许澄在门外说出父亲暗号。",
    actions: "林舟握紧钥匙，没有立刻开门。",
    dialogue: "许澄：三短一长。",
    narration: "雨声掩住脚步。",
    endingPoint: "林舟确认暗号后拉开门闩。",
  }],
  endingEvent: "许澄递出警员名册。",
  suspense: "内鬼是谁？",
  nextChapterLead: "林舟开始核实名册。",
};

describe("P4 修订层识别", () => {
  it("多层请求选择最高层，不清楚时默认文字层", () => {
    expect(classifyScriptRevisionLayer("修正许澄上一场受伤却突然奔跑的问题，并润色对白")).toBe("continuity");
    expect(classifyScriptRevisionLayer("加强人物动机和高潮，再调整台词")).toBe("development");
    expect(classifyScriptRevisionLayer("让对白更有潜台词，场景节奏更紧")).toBe("scene_dialogue");
    expect(classifyScriptRevisionLayer("只润色本章对白，不要修改结尾")).toBe("scene_dialogue");
    expect(classifyScriptRevisionLayer("润色一下，删掉重复句子")).toBe("prose");
    expect(classifyScriptRevisionLayer("把这章改得更顺")).toBe("prose");
  });
});

describe("P4 分层保护", () => {
  it("场景对白层允许改对白，但拒绝静默改变本章方向和结尾事实", () => {
    const dialogueOnly = structuredClone(SOURCE);
    dialogueOnly.scenes[0]!.dialogue = "许澄：你父亲教过我，三短一长。";
    expect(() => assertP4LayeredRevision(SOURCE, dialogueOnly, "scene_dialogue", "只润色本章对白")).not.toThrow();

    const crossed = structuredClone(dialogueOnly);
    crossed.chapterGoal = "立刻逮捕来客。";
    crossed.endingEvent = "林舟杀死许澄。";
    expect(() => assertP4LayeredRevision(SOURCE, crossed, "scene_dialogue", "只润色本章对白")).toThrow(/P4_UNREQUESTED_CHAPTER_GOAL_CHANGE/);
    expect(() => assertP4LayeredRevision(SOURCE, crossed, "scene_dialogue", "只润色本章对白")).toThrow(/P4_UNREQUESTED_ENDING_EVENT_CHANGE/);

    const negatedTarget = structuredClone(dialogueOnly);
    negatedTarget.endingHook = "来客其实是父亲本人。";
    expect(() => assertP4LayeredRevision(SOURCE, negatedTarget, "scene_dialogue", "只润色对白，不要改结尾钩子")).toThrow(/P4_UNREQUESTED_ENDING_HOOK_CHANGE/);
  });

  it("文字层允许改句子，但拒绝增删场景或改变场景结构", () => {
    const prose = structuredClone(SOURCE);
    prose.scenes[0]!.description = "许澄站在门外，敲出父亲留下的暗号。";
    prose.scenes[0]!.narration = "雨声吞没了远处的脚步。";
    expect(() => assertP4LayeredRevision(SOURCE, prose, "prose", "润色句子和语气")).not.toThrow();

    const structural = structuredClone(prose);
    structural.scenes[0]!.location = "警局";
    expect(() => assertP4LayeredRevision(SOURCE, structural, "prose", "润色句子和语气")).toThrow(/P4_PROSE_SCENE_STRUCTURE_CHANGED/);
  });

  it("发展性修订允许调整目标与场景，但保护未请求角色和项目基础字段", () => {
    const development = structuredClone(SOURCE);
    development.chapterGoal = "查清来客为何掌握父亲暗号。";
    development.scenes[0]!.description = "林舟反向盘问许澄，逼她证明暗号来源。";
    expect(() => assertP4LayeredRevision(SOURCE, development, "development", "加强人物动机和本章目标")).not.toThrow();

    const invented = structuredClone(development);
    invented.type = "喜剧";
    invented.scenes[0]!.characters = "林舟、许澄、周宁";
    expect(() => assertP4LayeredRevision(SOURCE, invented, "development", "加强人物动机和本章目标")).toThrow(/P4_UNREQUESTED_TYPE_CHANGE/);
    expect(() => assertP4LayeredRevision(SOURCE, invented, "development", "加强人物动机和本章目标")).toThrow(/P4_UNREQUESTED_CHARACTER_ROSTER_CHANGE/);
  });

  it("明确点名时允许改标题、类型和角色名单，但章序永远不能改变", () => {
    const targeted = structuredClone(SOURCE);
    targeted.chapterTitle = "暗号证人";
    targeted.type = "都市惊悚";
    targeted.scenes[0]!.characters = "林舟、周宁";
    expect(() => assertP4LayeredRevision(SOURCE, targeted, "development", "标题改成暗号证人，类型改为都市惊悚，把许澄替换为周宁")).not.toThrow();

    targeted.chapterOrder = 3;
    expect(() => assertP4LayeredRevision(SOURCE, targeted, "development", "改成第 3 章")).toThrow(/P4_CHAPTER_ORDER_CHANGED/);
  });

  it("拒绝模型完全没有执行修改要求", () => {
    expect(() => assertP4LayeredRevision(SOURCE, structuredClone(SOURCE), "prose", "润色句子")).toThrow(/P4_NO_EFFECTIVE_CHANGE/);
  });
});
