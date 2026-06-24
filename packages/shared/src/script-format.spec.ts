import { describe, expect, it } from "vitest";
import {
  extractChapterScriptName,
  extractChapterScriptTitle,
  formatChapterScriptDocument,
  isChapterScriptDocument,
  stripChapterScriptName,
} from "./script-format.js";

/**
 * 章节剧本格式纯函数测试。
 *
 * 背景:2026-06-24 的 sourceText 空覆盖 bug 修复后,数据恢复依赖
 * stripChapterScriptName(剥离"剧本名称:"行)和 extractChapterScriptTitle
 * (从正文提取章节标题)。这些纯函数是写入/恢复链的基础,需要回归保护。
 */
describe("stripChapterScriptName:剥离剧本名称行", () => {
  it("剥离开头的「剧本名称:」行", () => {
    const input = "剧本名称：全职猎人\n\n## 第 1 章\n\n正文内容";
    const result = stripChapterScriptName(input);
    expect(result).not.toContain("剧本名称");
    expect(result).toContain("## 第 1 章");
    expect(result).toContain("正文内容");
  });

  it("支持多种名称前缀(剧本名/故事名称/作品名等)", () => {
    for (const prefix of ["剧本名称", "剧本名", "故事名称", "故事名", "作品名称", "作品名"]) {
      const input = `${prefix}：测试标题\n\n正文`;
      const result = stripChapterScriptName(input);
      expect(result).not.toContain(prefix);
      expect(result).toContain("正文");
    }
  });

  it("支持英文冒号", () => {
    const input = "剧本名称: 测试标题\n\n正文";
    const result = stripChapterScriptName(input);
    expect(result).not.toContain("剧本名称");
  });

  it("无名称行时原样返回(仅 trimEnd + 补换行)", () => {
    const input = "## 第 1 章\n\n正文内容";
    const result = stripChapterScriptName(input);
    expect(result).toBe("## 第 1 章\n\n正文内容\n");
  });

  it("空字符串返回空字符串", () => {
    expect(stripChapterScriptName("")).toBe("");
  });

  it("纯空白返回空字符串", () => {
    expect(stripChapterScriptName("   \n\n  ")).toBe("");
  });
});

describe("extractChapterScriptTitle:提取章节标题", () => {
  it("从 markdown 标题提取(## 第 X 章：标题)", () => {
    const input = "# 章节剧本\n\n## 第 1 章：离岛的少年\n\n正文";
    expect(extractChapterScriptTitle(input)).toBe("第 1 章：离岛的少年");
  });

  it("从纯文本标题提取(无 # 前缀)", () => {
    const input = "第 2 章 暗夜降临\n\n正文";
    expect(extractChapterScriptTitle(input)).toContain("第 2 章");
  });

  it("中文数字章节标题", () => {
    const input = "## 第三章：风暴\n\n正文";
    expect(extractChapterScriptTitle(input)).toContain("第三章");
  });

  it("无章节标题时返回 null", () => {
    expect(extractChapterScriptTitle("只有正文,没有章节标题")).toBeNull();
  });
});

describe("extractChapterScriptName:提取剧本名称", () => {
  it("提取「剧本名称:」后的标题", () => {
    expect(extractChapterScriptName("剧本名称：全职猎人：黑暗试炼篇\n\n正文")).toBe("全职猎人：黑暗试炼篇");
  });

  it("支持作品名称前缀", () => {
    expect(extractChapterScriptName("作品名称：测试作品\n正文")).toBe("测试作品");
  });

  it("无名称行返回 null", () => {
    expect(extractChapterScriptName("## 第 1 章\n\n正文")).toBeNull();
  });
});

describe("formatChapterScriptDocument:格式化章节剧本", () => {
  it("生成的文档能被 isChapterScriptDocument 识别", () => {
    const doc = formatChapterScriptDocument({
      chapterTitle: "第 1 章：测试",
      sourceText: "正文内容",
    });
    expect(isChapterScriptDocument(doc)).toBe(true);
    expect(doc).toContain("第 1 章：测试");
    expect(doc).toContain("正文内容");
    expect(doc).toContain("# 章节剧本");
  });

  it("sourceText 为空时用占位符", () => {
    const doc = formatChapterScriptDocument({ chapterTitle: "第 1 章" });
    expect(isChapterScriptDocument(doc)).toBe(true);
    expect(doc).toContain("……");
  });
});
