import { describe, expect, it } from "vitest";

import type { SendDialogueMessageRequest, WorkbenchSnapshot } from "@airoaming/shared";
import type { AiChapterGenerationContext } from "../projects/script-workflow-source.repository.js";
import type { DialogueTurn } from "./dialogue-types.js";
import { parseInspirationSeeds } from "./dialogue-json.util.js";
import {
  buildChapterEditingPrompt,
  buildInspirationSeedsPrompt,
  buildScriptFromOutlinePrompt,
  buildScriptOutlineFromTopicPrompt,
} from "./dialogue-prompt.util.js";

function turn(): DialogueTurn {
  return {
    snapshot: {
      project: { name: "雨夜证人", storyTitle: "雨夜证人", genreTags: ["悬疑"], comicFormat: "vertical_scroll", artStyle: "comic_style" },
      currentChapter: { sourceText: "这段旧正文绝不能进入 A2 灵感 Prompt。" },
    } as WorkbenchSnapshot,
  } as DialogueTurn;
}

function request(content: string): SendDialogueMessageRequest {
  return { content };
}

const digest = `sha256:${"a".repeat(64)}` as const;

function context(): AiChapterGenerationContext {
  const first = { order: 1, title: "旧钥匙", chapterGoal: "发现钥匙", coreConflict: "不能惊动追踪者", majorTurn: "钥匙刻着父亲编号", endingHook: "门外响起暗号", nextChapterBridge: "来客现身" };
  const second = { order: 2, title: "门外来客", chapterGoal: "确认来客身份", coreConflict: "信任会暴露藏身处", majorTurn: "来客说出父亲暗号", endingHook: "暗号指向警局内鬼", nextChapterBridge: "追查内鬼" };
  return {
    project: { id: "project", name: "雨夜证人", storyTitle: "雨夜证人", genreTags: ["悬疑"], comicFormat: "vertical_scroll", artStyle: "comic_style" },
    outline: {
      id: "outline",
      title: "雨夜证人",
      sourceText: "# 剧本大纲\n完整项目大纲正文",
      sourceDigest: digest,
      document: { title: "雨夜证人", genreStyle: "悬疑", episodeLength: "短篇", chapterCount: 3, synopsis: "追查父亲失踪真相", mainCharacters: ["林舟（主角）：调查者"], plotStages: ["开端：找到钥匙"], endingDirection: "揭露内鬼", chapterCards: [first, second, { ...second, order: 3, title: "内鬼" }] },
    },
    chapter: { id: "chapter-2", order: 2, title: "门外来客", rowVersion: 0 },
    targetCard: second,
    previousCard: first,
    nextCard: { ...second, order: 3, title: "内鬼" },
    previousScript: {
      id: "script-1",
      chapterId: "chapter-1",
      chapterTitle: "旧钥匙",
      sourceText: "【前章开头】林舟从旧屋地板下找到钥匙。\n【前章中段】钥匙刻着父亲编号。\n【前章结尾】门外响起三短一长的暗号。",
      sourceDigest: digest,
    },
    sourceBindings: [],
    sourceSetDigest: digest,
  };
}

describe("A2-A4 创作 Prompt 契约", () => {
  it("A2 只要求严格三项 JSON，不注入当前章节正文", () => {
    const prompt = buildInspirationSeedsPrompt(turn(), request("给我三个悬疑方向"));
    expect(prompt).toContain("只返回一个严格 JSON 对象");
    expect(prompt).toContain("P1 灵感质量门");
    expect(prompt).toContain("主角承受的核心压力、冲突发动机和视觉前提上实质不同");
    expect(prompt).toContain("不新增字段");
    expect(prompt).not.toContain("```json");
    expect(prompt).not.toContain("这段旧正文绝不能进入");
  });

  it("A3 明确四段项目大纲、具体章数、章节卡和结局方向", () => {
    const prompt = buildScriptOutlineFromTopicPrompt(turn(), request("写一个 6 章悬疑故事"));
    expect(prompt).toContain("## 四、章节安排");
    expect(prompt).toContain("结局方向：");
    expect(prompt).toContain("剧集章数：12 章");
    expect(prompt).toContain("章节卡数量必须与剧集章数完全一致");
    expect(prompt).toContain("P2 因果大纲与结局方向质量门");
    expect(prompt).toContain("终章的下一章衔接必须明确标记故事已经收束");
    expect(prompt).toContain("不要输出评分、检查报告或额外字段");
  });

  it("A4 只生成当前章，并完整读取目标卡、相邻卡和上一章正式正文", () => {
    const prompt = buildScriptFromOutlinePrompt(request("生成当前章节"), context());
    expect(prompt).toContain("## 第 2 章：门外来客");
    expect(prompt).toContain("P3 场景契约");
    expect(prompt).toContain("P5 连续性");
    expect(prompt).toContain("【前章开头】林舟从旧屋地板下找到钥匙。");
    expect(prompt).toContain("【前章中段】钥匙刻着父亲编号。");
    expect(prompt).toContain("【前章结尾】门外响起三短一长的暗号。");
    expect(prompt).toContain("不要把这些分析新增为输出字段");
    expect(prompt).toContain("第 1 章无前章检查");
    expect(prompt).toContain('"title": "旧钥匙"');
    expect(prompt).toContain('"title": "内鬼"');
    expect(prompt).toContain("（无；本轮只是发出生成命令）");
  });

  it("P4 把修订层和保护范围放进内部 Prompt，但不新增输出字段", () => {
    const prompt = buildChapterEditingPrompt(
      turn(),
      request("只润色本章对白，不要修改结尾"),
      "# 章节剧本\n\n## 第 2 章：门外来客\n\n当前完整草稿",
      "scene_dialogue",
    );
    expect(prompt).toContain("P4 当前修订层：场景与对白修订（scene_dialogue）");
    expect(prompt).toContain("必须保留本章方向、结尾事实、项目基础字段和角色名单");
    expect(prompt).toContain("章序永远不能改变");
    expect(prompt).toContain("不要把层级、清单、评分、诊断或差异说明输出给用户");
    expect(prompt).toContain("当前完整草稿");
  });
});

describe("A2 灵感输出解析", () => {
  const seed = (title: string) => ({ title, genreTags: ["悬疑", "都市"], logline: `${title}一句话`, keyConflict: `${title}冲突`, visualHook: `${title}画面`, firstChapterDirection: `${title}第一章` });

  it("只接受恰好三项且没有围栏或额外字段的严格 JSON", () => {
    const json = JSON.stringify({ seeds: [seed("一"), seed("二"), seed("三")] });
    expect(parseInspirationSeeds(json)).toHaveLength(3);
    expect(() => parseInspirationSeeds(`\`\`\`json\n${json}\n\`\`\``)).toThrow();
    expect(() => parseInspirationSeeds(JSON.stringify({ seeds: [seed("一"), seed("二"), seed("三"), seed("四")] }))).toThrow();
    expect(() => parseInspirationSeeds(JSON.stringify({ seeds: [seed("一"), seed("二"), { ...seed("三"), extra: true }] }))).toThrow();
  });
});
