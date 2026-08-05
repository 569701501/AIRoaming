import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeDocumentBufferV1 } from "./document-encoding.js";
import { splitDocumentTextV1 } from "./document-splitter.js";

const FIXTURES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/document-library",
);

describe("document encoding detection", () => {
  it("detects UTF-8 text", () => {
    const text = "第一章 开始\n正文内容测试";
    const decoded = decodeDocumentBufferV1(new TextEncoder().encode(text));
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text).toBe(text);
  });

  it("detects GBK-encoded Chinese text", () => {
    // "第一章" 的 GBK 编码：B5 DA D2 BB D5 C2
    const gbkBytes = Buffer.from("B5DAD2BBD5C2", "hex");
    const decoded = decodeDocumentBufferV1(gbkBytes);
    expect(decoded.encoding).toBe("gb18030");
    expect(decoded.text).toBe("第一章");
  });

  it("recognizes the real GBK novel head (renfan-1)", async () => {
    const buffer = await readFile(path.join(FIXTURES_ROOT, "renfan-1-head-gbk.bin"));
    const decoded = decodeDocumentBufferV1(buffer);
    expect(decoded.encoding).toBe("gb18030");
    const result = splitDocumentTextV1(decoded.text);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.chapters[0]!.title).toContain("第一章");
  });

  it("recognizes the real UTF-8 novel head (renfan-2)", async () => {
    const buffer = await readFile(path.join(FIXTURES_ROOT, "renfan-2-head-utf8.txt"));
    const decoded = decodeDocumentBufferV1(buffer);
    expect(decoded.encoding).toBe("utf-8");
    const result = splitDocumentTextV1(decoded.text);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.chapters[0]!.title).toContain("第一章");
  });
});
