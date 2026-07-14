import { describe, expect, it } from "vitest";
import {
  LAYOUT_GRAPHEME_POLICY_VERSION,
  countLayoutGraphemes,
  layoutGraphemes,
  normalizePlainLayoutText,
  normalizeRichTextDocumentV1,
  replaceRichTextRange,
  type RichTextDocumentV1,
} from "./index.js";

const run = (text: string) => ({
  text,
  fontAssetId: "font_main",
  fontSize: 48,
  fontWeight: 400 as const,
  fontStyle: "normal" as const,
  color: "#111827FF",
  letterSpacing: 0,
  stroke: null,
});

const richText = (text: string): RichTextDocumentV1 => ({
  schemaVersion: 1,
  writingMode: "horizontal-tb",
  textOrientation: "mixed",
  paragraphs: [{ align: "start", lineHeight: 1.2, runs: [run(text)] }],
});

describe("G5-M2 fixed grapheme and rich-text policy", () => {
  it("locks Unicode 17.0/UAX29 rev47 without host Intl.Segmenter", () => {
    expect(LAYOUT_GRAPHEME_POLICY_VERSION).toBe("unicode_17_0_uax29_rev47");
    expect(layoutGraphemes("Ae\u0301👩‍👩‍👧‍👦🇨🇳")).toEqual(["A", "é", "👩‍👩‍👧‍👦", "🇨🇳"]);
    expect(countLayoutGraphemes("क्‍ष")).toBe(1);
  });

  it("normalizes paste text and rejects non-display control characters", () => {
    expect(normalizePlainLayoutText("Cafe\u0301\r\nA\rB\tC")).toBe("Café\nA\nB    C");
    expect(() => normalizePlainLayoutText("bad\u0000text")).toThrow(/control/i);
    expect(() => normalizePlainLayoutText("bad\u0007text")).toThrow(/control/i);
  });

  it("merges adjacent equivalent runs and preserves an editable empty paragraph", () => {
    const normalized = normalizeRichTextDocumentV1({
      ...richText(""),
      paragraphs: [
        { align: "start", lineHeight: 1.2, runs: [run("A"), run(""), run("B")] },
        { align: "center", lineHeight: 1.35, runs: [run("")] },
      ],
    });
    expect(normalized.paragraphs[0]!.runs).toEqual([run("AB")]);
    expect(normalized.paragraphs[1]!.runs).toEqual([run("")]);
  });

  it("replaces ranges by grapheme without splitting emoji or combining sequences", () => {
    const before = richText("Ae\u0301👩‍👩‍👧‍👦Z");
    const after = replaceRichTextRange(before, {
      start: { paragraphIndex: 0, graphemeOffset: 1 },
      end: { paragraphIndex: 0, graphemeOffset: 3 },
      text: "雨",
    });
    expect(after.paragraphs[0]!.runs.map((item) => item.text).join("")).toBe("A雨Z");
    expect(() => replaceRichTextRange(before, {
      start: { paragraphIndex: 0, graphemeOffset: 5 },
      end: { paragraphIndex: 0, graphemeOffset: 5 },
      text: "x",
    })).toThrow(/range/i);
  });
});
