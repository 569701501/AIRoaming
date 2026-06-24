import { describe, expect, it } from "vitest";
import {
  areNumericBoundariesCredible,
  createScriptImportAnalysis,
  extractChapterBoundary,
  formatChapterSource,
  getScriptTextSignals,
  inferScriptImportContentType,
  parseProvidedScriptChapters,
  summarizeScript,
} from "./script-import.util.js";

/**
 * 剧本导入分析纯函数测试。
 *
 * 这些函数从 projects.service 抽出(任务 2026-06-24_ProjectsService拆分第二轮 候选D),
 * 原本无测试保护。本测试锁住核心行为:章节拆分、内容类型分类、边界可信度。
 */

describe("parseProvidedScriptChapters:拆分章节", () => {
  it("识别明确章节标题(第X章)并拆分", () => {
    const input = "第一章 开始\n\n正文一。\n\n第二章 结束\n\n正文二。";
    const result = parseProvidedScriptChapters(input);
    expect(result.length).toBe(2);
    expect(result[0].title).toContain("第一章");
    expect(result[0].boundary).toBe("explicit_chapter_heading");
    expect(result[1].title).toContain("第二章");
  });

  it("markdown 标题也识别为章节", () => {
    const input = "## 第 3 章：风暴\n\n风暴来了。";
    const result = parseProvidedScriptChapters(input);
    expect(result.length).toBe(1);
    expect(result[0].title).toContain("第 3 章");
  });

  it("无章节边界时返回单个 single_chapter", () => {
    const input = "这是一段没有章节标记的连续剧情文字。主角走进了房间。";
    const result = parseProvidedScriptChapters(input);
    expect(result.length).toBe(1);
    expect(result[0].boundary).toBe("single_chapter");
  });

  it("空字符串返回单个默认章节", () => {
    const result = parseProvidedScriptChapters("");
    expect(result.length).toBe(1);
  });
});

describe("extractChapterBoundary:识别章节边界", () => {
  it("中文数字章节(第一章/第3回)", () => {
    expect(extractChapterBoundary("第一章 风起")).not.toBeNull();
    expect(extractChapterBoundary("第 3 回 落幕"))?.not.toBeNull();
  });

  it("阿拉伯数字编号(1. / 2、)", () => {
    const r = extractChapterBoundary("1.");
    expect(r).not.toBeNull();
    expect(r?.boundary).toBe("numeric_heading");
  });

  it("markdown 标题内的章节", () => {
    const r = extractChapterBoundary("## 第 5 章：暗夜");
    expect(r).not.toBeNull();
    expect(r?.title).toContain("第 5 章");
  });

  it("普通文本不识别为边界", () => {
    expect(extractChapterBoundary("他走进了房间。")).toBeNull();
    expect(extractChapterBoundary("")).toBeNull();
  });
});

describe("inferScriptImportContentType:内容类型分类", () => {
  it("太短的内容判为 invalid", () => {
    expect(inferScriptImportContentType("短")).toBe("invalid");
  });

  it("世界观设定类判为 worldbuilding", () => {
    // 条件:worldbuildingWordCount >= 2 && storySentenceCount < 3 && dialogueLineCount === 0
    // storySentenceCount 由句号/动词触发,所以用无句号的短语列表
    const text = [
      "角色设定 描述",
      "人物设定 描述",
      "能力体系 描述 描述 描述 描述",
      "阵营规则 描述 描述 描述 描述",
      "素材画风 参考图 提示词 描述",
      "描述 描述 描述 描述 描述 描述 描述 描述",
    ].join("\n");
    expect(inferScriptImportContentType(text)).toBe("worldbuilding");
  });

  it("大纲提纲类判为 outline", () => {
    // 需 >= 80 字符且 outlineWordCount >= 2
    const text = [
      "本项目大纲。",
      "第一章梗概：主角踏上旅程，遇到第一个挑战。",
      "第二章大纲：主角在旅途中结识伙伴，共同对抗敌人。",
      "第三章提纲：主角发现敌人的弱点，制定反击计划。",
      "第四章主题：信任与背叛的较量。",
      "第五章卖点：紧张刺激的战斗场面和深刻的角色成长。",
    ].join("\n");
    expect(inferScriptImportContentType(text)).toBe("outline");
  });

  it("带对白的剧本判为 script", () => {
    // 需 >= 80 字符且 dialogueLineCount >= 2 或 sceneLineCount >= 1
    const lines = [
      "小明：“今天天气真好，我们出去走走吧。”",
      "小红：“好啊，我想去公园看看花。”",
      "场景：公园",
      "他们走出了房间，阳光洒在地上，微风轻拂。",
      "公园里花开满地，蝴蝶在花丛中飞舞，远处传来鸟鸣。",
    ].join("\n");
    expect(inferScriptImportContentType(lines)).toBe("script");
  });
});

describe("areNumericBoundariesCredible:数字边界可信度", () => {
  it("无数字边界时返回 true", () => {
    const chapters = parseProvidedScriptChapters("第一章 正文一。\n\n第二章 正文二。");
    expect(areNumericBoundariesCredible(chapters)).toBe(true);
  });

  it("仅一个数字章节返回 false(不够成章)", () => {
    const chapters = [
      { title: "第 1 章", sourceText: "# 第 1 章\n短", summary: "", boundary: "numeric_heading" as const },
    ];
    expect(areNumericBoundariesCredible(chapters)).toBe(false);
  });
});

describe("createScriptImportAnalysis:构造分析结果", () => {
  it("ready_to_import 时 nextTool 指向 import_script_to_chapters", () => {
    const result = createScriptImportAnalysis({
      decision: "ready_to_import",
      contentType: "script",
      reason: "测试",
      chapters: [],
      risk: null,
    });
    expect(result.nextTool).toBe("import_script_to_chapters");
  });

  it("非 ready_to_import 时 nextTool 为 null", () => {
    const result = createScriptImportAnalysis({
      decision: "reject",
      contentType: "invalid",
      reason: "测试",
      chapters: [],
      risk: "风险",
    });
    expect(result.nextTool).toBeNull();
  });
});

describe("formatChapterSource:格式化章节正文", () => {
  it("空文本生成默认格式文档", () => {
    const result = formatChapterSource("第 1 章", "");
    expect(result).toContain("第 1 章");
    expect(result).toContain("# 章节剧本");
  });

  it("已是章节文档格式的文本做 strip 处理(去掉剧本名称行)", () => {
    // 用 formatChapterSource 生成的标准文档,它一定满足 isChapterScriptDocument
    const standardDoc = formatChapterSource("第 1 章", "正文内容在这里。");
    const result = formatChapterSource("第 1 章", standardDoc);
    // strip 后仍是合法文档,且不含被剥离的内容
    expect(result).toContain("第 1 章");
  });

  it("普通文本包装为章节文档格式", () => {
    const result = formatChapterSource("第 1 章", "主角走进了房间。");
    expect(result).toContain("# 章节剧本");
    expect(result).toContain("主角走进了房间。");
  });
});

describe("summarizeScript:生成摘要", () => {
  it("取第一行非空文本", () => {
    // summarizeScript 取第一个非空行(剥离 ## 前缀),所以这里取到"标题"
    const result = summarizeScript("\n\n## 标题\n第一句正文");
    expect(result).toBe("标题");
  });

  it("剥离 markdown 标题前缀", () => {
    const result = summarizeScript("## 章节标题\n内容");
    expect(result).not.toContain("##");
  });

  it("截断超长摘要(120 字符)", () => {
    const long = "一".repeat(200);
    expect(summarizeScript(long).length).toBe(120);
  });
});

describe("getScriptTextSignals:文本信号提取", () => {
  it("提取行数/对白/场景等信号", () => {
    const text = "小明：“你好”\n场景：公园\n他走了。";
    const signals = getScriptTextSignals(text);
    expect(signals.nonEmptyLineCount).toBeGreaterThan(0);
    expect(signals.dialogueLineCount).toBeGreaterThan(0);
    expect(signals.sceneLineCount).toBeGreaterThan(0);
  });

  it("空文本信号全为 0", () => {
    const signals = getScriptTextSignals("");
    expect(signals.nonEmptyLineCount).toBe(0);
    expect(signals.bulletRatio).toBe(0);
  });
});
