import { describe, expect, it } from "vitest";

import {
  splitDocumentTextV1,
  DOCUMENT_SPLITTER_POLICY_VERSION,
  SPECIAL_GROUP_LABEL,
} from "./document-splitter.js";

describe("document splitter", () => {
  it("splits standard Chinese chapter headings", () => {
    const text = [
      "第一章 初入宗门",
      "正文一",
      "",
      "第二章 筑基",
      "正文二",
      "",
      "第三章 历练",
      "正文三",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.policyVersion).toBe(DOCUMENT_SPLITTER_POLICY_VERSION);
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[0]).toMatchObject({ title: "第一章 初入宗门" });
    expect(result.chapters[1]?.title).toBe("第二章 筑基");
    expect(result.chapters[2]?.title).toBe("第三章 历练");
  });

  it("handles full-width digits and Chinese numerals", () => {
    const text = [
      "第１章 全角",
      "a",
      "",
      "第十章 中文数字",
      "b",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第１章 全角", "第十章 中文数字"]);
  });

  it("splits volumes into groups and chapters under volumes", () => {
    const text = [
      "第一卷 风起",
      "第一章 相遇",
      "正文",
      "",
      "第二章 别离",
      "正文",
      "",
      "第二卷 云涌",
      "第三章 重逢",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.groupLabels).toContain("第一卷 风起");
    expect(result.groupLabels).toContain("第二卷 云涌");
    expect(result.chapters[0]?.groupLabel).toBe("第一卷 风起");
    expect(result.chapters[1]?.groupLabel).toBe("第一卷 风起");
    expect(result.chapters[2]?.groupLabel).toBe("第二卷 云涌");
  });

  it("recognizes English Chapter headings", () => {
    const text = ["Chapter 1", "body", "", "Chapter 2", "body"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("groups special titles (prologue/epilogue/extra) into the special group", () => {
    const text = ["楔子", "引子正文", "", "第一章 开始", "正文", "", "番外", "番外正文"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.some((chapter) => chapter.title === "楔子" && chapter.groupLabel === SPECIAL_GROUP_LABEL)).toBe(true);
    expect(result.chapters.some((chapter) => chapter.title === "番外" && chapter.groupLabel === SPECIAL_GROUP_LABEL)).toBe(true);
    expect(result.chapters.some((chapter) => chapter.title === "第一章 开始")).toBe(true);
  });

  it("falls back to blank-line separation when no headings exist", () => {
    const text = ["第一段内容", "", "第二段内容", "", "第三段内容"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.length).toBeGreaterThanOrEqual(3);
    expect(result.chapters.every((chapter) => chapter.groupLabel === "未分章")).toBe(true);
  });

  it("falls back to a single chapter for unstructured text", () => {
    const text = "这是一整段没有任何结构的文本内容。";
    const result = splitDocumentTextV1(text);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]?.title).toBe("全文");
    expect(result.chapters[0]?.charCount).toBe(text.length);
  });

  it("flags chapter number gaps as anomalies", () => {
    const text = ["第一章 一", "a", "", "第三章 三", "b"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters).toHaveLength(2);
  });

  it("keeps leading unassigned content visible inside the first chapter", () => {
    const text = ["前言杂记", "第一章 开始", "正文"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters[0]?.title).toBe("第一章 开始");
    expect(result.chapters[0]?.startOffset).toBeGreaterThan(0);
  });

  it("is deterministic for identical input", () => {
    const text = ["第一章 a", "x", "", "第二章 b", "y"].join("\n");
    expect(splitDocumentTextV1(text)).toEqual(splitDocumentTextV1(text));
  });

  it("splits chapters when title is followed by blank line", () => {
    const text = [
      "第一章",
      "",
      "正文开始",
      "",
      "第二章",
      "",
      "正文继续",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第一章", "第二章"]);
  });

  it("handles leading-zero chapter numbers (第001章)", () => {
    const text = ["第001章 开始", "a", "", "第002章 继续", "b"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第001章 开始", "第002章 继续"]);
    expect(result.chapters[0]?.groupLabel).toBe("未分章");
  });

  it("handles volume with special chapters inside", () => {
    const text = [
      "第一卷 风起",
      "楔子",
      "楔子正文",
      "",
      "第一章 开始",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters[0]?.groupLabel).toBe("第一卷 风起");
    expect(result.chapters[1]?.groupLabel).toBe("第一卷 风起");
  });

  it("mixes chapter styles (中文 + Chapter + 第X节)", () => {
    const text = [
      "第一章 一",
      "a",
      "",
      "Chapter 2",
      "b",
      "",
      "第三节 三",
      "c",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第一章 一", "Chapter 2", "第三节 三"]);
  });

  it("treats a heading-like line inside body text as chapter when pattern matches", () => {
    const text = ["第一章 一", "他说：第一章 是个重要的地方", "", "第二章 二", "正文"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters).toHaveLength(2);
  });

  it("computes charCount matching chapter ranges", () => {
    const text = ["第一章", "12345", "", "第二章", "678"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters[0]?.charCount).toBe(11);
    expect(result.chapters[1]?.charCount).toBe(7);
  });

  it("groups unknown non-heading content into unassigned", () => {
    const text = ["一些没有标题的内容", "", "第一章 开始", "正文"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.some((chapter) => chapter.groupLabel === "未分章")).toBe(true);
  });

  it("handles blank lines with spaces and tabs", () => {
    const text = ["第一章", "a", "   ", "第二章", "b", "\t"].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第一章", "第二章"]);
  });

  it("splits multi-paragraph chapter body without losing content", () => {
    const text = [
      "第一章",
      "第一段",
      "",
      "第二段",
      "",
      "第二章",
      "后续",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters).toHaveLength(2);
    const first = result.chapters[0]!;
    const second = result.chapters[1]!;
    expect(text.slice(first.startOffset, first.endOffset)).toContain("第二段");
    expect(text.slice(second.startOffset, second.endOffset)).toBe("第二章\n后续");
  });

  it("treats volume+chapter on one line as a chapter under the volume group", () => {
    const text = [
      "第八卷初入灵界第一千二百七十五章青狼、赤蟒、豹禽",
      "正文",
      "",
      "第八卷初入灵界第一千二百七十六章玄天圣器",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]?.groupLabel).toBe("第八卷初入灵界");
    expect(result.chapters[0]?.title).toContain("第一千二百七十五章");
  });

  it("does not treat a body line starting with 第X卷 as a volume heading", () => {
    const text = [
      "第一章 开始",
      "第四卷的内容比之前三卷艰深很多，需要凝聚足足六团时间道纹",
      "",
      "第二章 继续",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["第一章 开始", "第二章 继续"]);
    expect(result.groupLabels).not.toContain("第四卷的内容比之前三卷艰深很多，需要凝聚足足六团时间道纹");
  });

  it("recognizes a short named volume heading", () => {
    const text = [
      "第一卷 风起",
      "第一章 相遇",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters[0]?.groupLabel).toBe("第一卷 风起");
  });

  it("merges truncated volume names into the dominant volume name", () => {
    const text = [
      "第十卷魔界之战第两千一百五十四章二号阵眼",
      "正文",
      "",
      "第十卷第两千一百五十五章继续",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    const labels = result.chapters.map((chapter) => chapter.groupLabel);
    expect(labels).toEqual(["第十卷魔界之战", "第十卷魔界之战"]);
  });

  it("carries the current volume into following chapters without a volume prefix", () => {
    const text = [
      "第五卷名震一方第六百四十八章至木灵婴",
      "正文",
      "",
      "第六百五十六章碎魂门人",
      "正文",
    ].join("\n");
    const result = splitDocumentTextV1(text);
    expect(result.chapters.map((chapter) => chapter.groupLabel)).toEqual([
      "第五卷名震一方",
      "第五卷名震一方",
    ]);
  });
});
