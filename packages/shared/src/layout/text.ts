import { splitGraphemes } from "unicode-segmenter/grapheme";
import type {
  RichTextDocumentV1,
  RichTextParagraphV1,
  RichTextRunV1,
} from "./document.js";

export const LAYOUT_GRAPHEME_POLICY_VERSION = "unicode_17_0_uax29_rev47" as const;

export class LayoutTextValidationError extends Error {
  readonly code = "LAYOUT_TEXT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutTextValidationError";
  }
}

export function layoutGraphemes(text: string): string[] {
  return [...splitGraphemes(text)];
}

export function countLayoutGraphemes(text: string): number {
  let count = 0;
  for (const _value of splitGraphemes(text)) count += 1;
  return count;
}

export function normalizePlainLayoutText(value: string): string {
  if (typeof value !== "string") throw new LayoutTextValidationError("text must be a string");
  const lineNormalized = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(lineNormalized)) {
    throw new LayoutTextValidationError("text contains a non-display control character");
  }
  return lineNormalized.normalize("NFC");
}

function sameRunStyle(left: RichTextRunV1, right: RichTextRunV1): boolean {
  return left.fontAssetId === right.fontAssetId
    && left.fontSize === right.fontSize
    && left.fontWeight === right.fontWeight
    && left.fontStyle === right.fontStyle
    && left.color === right.color
    && left.letterSpacing === right.letterSpacing
    && JSON.stringify(left.stroke) === JSON.stringify(right.stroke);
}

function appendRun(target: RichTextRunV1[], run: RichTextRunV1): void {
  if (run.text === "") return;
  const previous = target.at(-1);
  if (previous && sameRunStyle(previous, run)) previous.text += run.text;
  else target.push({ ...run, stroke: run.stroke ? { ...run.stroke } : null });
}

function emptyRun(style: RichTextRunV1): RichTextRunV1 {
  return { ...style, text: "", stroke: style.stroke ? { ...style.stroke } : null };
}

export function normalizeRichTextDocumentV1(input: RichTextDocumentV1): RichTextDocumentV1 {
  if (input.paragraphs.length === 0) throw new LayoutTextValidationError("rich text requires at least one paragraph");
  const paragraphs: RichTextParagraphV1[] = [];
  for (const paragraph of input.paragraphs) {
    if (paragraph.runs.length === 0) throw new LayoutTextValidationError("paragraph requires at least one run");
    let current: RichTextParagraphV1 = { align: paragraph.align, lineHeight: paragraph.lineHeight, runs: [] };
    let currentStyle = paragraph.runs[0]!;
    for (const sourceRun of paragraph.runs) {
      currentStyle = sourceRun;
      const pieces = normalizePlainLayoutText(sourceRun.text).split("\n");
      for (let index = 0; index < pieces.length; index += 1) {
        appendRun(current.runs, { ...sourceRun, text: pieces[index]! });
        if (index < pieces.length - 1) {
          if (current.runs.length === 0) current.runs.push(emptyRun(sourceRun));
          paragraphs.push(current);
          current = { align: paragraph.align, lineHeight: paragraph.lineHeight, runs: [] };
        }
      }
    }
    if (current.runs.length === 0) current.runs.push(emptyRun(currentStyle));
    paragraphs.push(current);
  }
  return {
    schemaVersion: 1,
    writingMode: input.writingMode,
    textOrientation: input.textOrientation,
    paragraphs,
  };
}

export interface RichTextPositionV1 {
  paragraphIndex: number;
  graphemeOffset: number;
}

export interface RichTextRangeV1 {
  start: RichTextPositionV1;
  end: RichTextPositionV1;
}

export function richTextPlainTextV1(document: RichTextDocumentV1): string {
  return document.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n");
}

export function richTextPositionAtFlatGraphemeOffsetV1(
  source: RichTextDocumentV1,
  flatOffset: number,
): RichTextPositionV1 {
  const document = normalizeRichTextDocumentV1(source);
  if (!Number.isInteger(flatOffset) || flatOffset < 0) {
    throw new LayoutTextValidationError("flat grapheme offset is invalid");
  }
  let remaining = flatOffset;
  for (let paragraphIndex = 0; paragraphIndex < document.paragraphs.length; paragraphIndex += 1) {
    const paragraph = document.paragraphs[paragraphIndex]!;
    const length = paragraph.runs.reduce((sum, run) => sum + countLayoutGraphemes(run.text), 0);
    if (remaining <= length) return { paragraphIndex, graphemeOffset: remaining };
    remaining -= length;
    if (paragraphIndex < document.paragraphs.length - 1) remaining -= 1;
    if (remaining < 0) return { paragraphIndex, graphemeOffset: length };
  }
  throw new LayoutTextValidationError("flat grapheme offset exceeds document length");
}

export interface ReplaceRichTextRangeInputV1 extends RichTextRangeV1 {
  text: string;
}

function paragraphUnits(paragraph: RichTextParagraphV1): Array<{ value: string; style: RichTextRunV1 }> {
  return paragraph.runs.flatMap((run) => layoutGraphemes(run.text).map((value) => ({ value, style: run })));
}

function comparePosition(left: RichTextPositionV1, right: RichTextPositionV1): number {
  return left.paragraphIndex - right.paragraphIndex || left.graphemeOffset - right.graphemeOffset;
}

function assertPosition(document: RichTextDocumentV1, position: RichTextPositionV1, label: string): void {
  const paragraph = document.paragraphs[position.paragraphIndex];
  if (!paragraph || !Number.isInteger(position.graphemeOffset) || position.graphemeOffset < 0) {
    throw new LayoutTextValidationError(`${label} range position is invalid`);
  }
  const length = paragraph.runs.reduce((sum, run) => sum + countLayoutGraphemes(run.text), 0);
  if (position.graphemeOffset > length) throw new LayoutTextValidationError(`${label} range offset is invalid`);
}

function unitsToRuns(units: Array<{ value: string; style: RichTextRunV1 }>, fallback: RichTextRunV1): RichTextRunV1[] {
  const runs: RichTextRunV1[] = [];
  for (const unit of units) appendRun(runs, { ...unit.style, text: unit.value });
  return runs.length > 0 ? runs : [emptyRun(fallback)];
}

export function replaceRichTextRange(
  source: RichTextDocumentV1,
  input: ReplaceRichTextRangeInputV1,
): RichTextDocumentV1 {
  const document = normalizeRichTextDocumentV1(source);
  assertPosition(document, input.start, "start");
  assertPosition(document, input.end, "end");
  if (comparePosition(input.start, input.end) > 0) throw new LayoutTextValidationError("range start must not exceed end");
  const startParagraph = document.paragraphs[input.start.paragraphIndex]!;
  const endParagraph = document.paragraphs[input.end.paragraphIndex]!;
  const startUnits = paragraphUnits(startParagraph);
  const endUnits = paragraphUnits(endParagraph);
  const insertionStyle = startUnits[input.start.graphemeOffset - 1]?.style
    ?? startUnits[input.start.graphemeOffset]?.style
    ?? startParagraph.runs[0]!;
  const insertedLines = normalizePlainLayoutText(input.text).split("\n");
  const prefix = startUnits.slice(0, input.start.graphemeOffset);
  const suffix = endUnits.slice(input.end.graphemeOffset);
  const replacementParagraphs: RichTextParagraphV1[] = insertedLines.map((line, index) => {
    const inserted = layoutGraphemes(line).map((value) => ({ value, style: insertionStyle }));
    const units = [
      ...(index === 0 ? prefix : []),
      ...inserted,
      ...(index === insertedLines.length - 1 ? suffix : []),
    ];
    const paragraphStyle = index === insertedLines.length - 1 && insertedLines.length > 1
      ? endParagraph
      : startParagraph;
    return {
      align: paragraphStyle.align,
      lineHeight: paragraphStyle.lineHeight,
      runs: unitsToRuns(units, insertionStyle),
    };
  });
  return normalizeRichTextDocumentV1({
    ...document,
    paragraphs: [
      ...document.paragraphs.slice(0, input.start.paragraphIndex),
      ...replacementParagraphs,
      ...document.paragraphs.slice(input.end.paragraphIndex + 1),
    ],
  });
}

export type RichTextRunStylePatchV1 = Partial<Omit<RichTextRunV1, "text">>;

export function applyRichTextRangeStyle(
  source: RichTextDocumentV1,
  range: RichTextRangeV1,
  style: RichTextRunStylePatchV1,
): RichTextDocumentV1 {
  const document = normalizeRichTextDocumentV1(source);
  assertPosition(document, range.start, "start");
  assertPosition(document, range.end, "end");
  if (comparePosition(range.start, range.end) > 0) throw new LayoutTextValidationError("range start must not exceed end");
  const paragraphs = document.paragraphs.map((paragraph, paragraphIndex) => {
    if (paragraphIndex < range.start.paragraphIndex || paragraphIndex > range.end.paragraphIndex) return paragraph;
    const units = paragraphUnits(paragraph).map((unit, offset) => {
      const start = paragraphIndex === range.start.paragraphIndex ? range.start.graphemeOffset : 0;
      const end = paragraphIndex === range.end.paragraphIndex ? range.end.graphemeOffset : Number.POSITIVE_INFINITY;
      return offset >= start && offset < end
        ? { value: unit.value, style: { ...unit.style, ...style, stroke: style.stroke === undefined ? unit.style.stroke : style.stroke } }
        : unit;
    });
    return { ...paragraph, runs: unitsToRuns(units, paragraph.runs[0]!) };
  });
  return normalizeRichTextDocumentV1({ ...document, paragraphs });
}
