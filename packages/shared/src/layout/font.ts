import type {
  LayoutDigest,
  LayoutDocumentV1,
  RichTextDocumentV1,
  RichTextRunV1,
} from "./document.js";
import { layoutGraphemes } from "./text.js";

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const FONT_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/;

export interface LayoutFontCmapV1 {
  digest: LayoutDigest;
  codePointCount: number;
  ranges: Array<[start: number, end: number]>;
}

export interface LayoutFontAssetMetadataV1 {
  schemaVersion: 1;
  kind: "layout_font_asset_v1";
  packageId: string;
  familyName: string;
  displayName: string;
  face: {
    weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
    style: "normal" | "italic";
  };
  format: "woff2" | "otf" | "ttf";
  license: {
    spdx: string;
    sourceUrl: string;
    embeddingAllowed: boolean;
  };
  cmap: LayoutFontCmapV1;
}

export interface LayoutFontCatalogItemV1 {
  assetId: string;
  sha256: LayoutDigest;
  bytes: number;
  mimeType: "font/woff2" | "font/otf" | "font/ttf";
  metadata: LayoutFontAssetMetadataV1;
}

export interface LayoutFontCatalogResponseV1 {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  items: LayoutFontCatalogItemV1[];
}

export interface LayoutFontProvisionResponseV1 extends LayoutFontCatalogResponseV1 {
  result: "existing" | "provisioned";
}

export class LayoutFontContractError extends Error {
  readonly code = "LAYOUT_FONT_METADATA_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutFontContractError";
  }
}

function fail(path: string, message: string): never {
  throw new LayoutFontContractError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const expected = new Set(keys);
  for (const key of Object.keys(row)) if (!expected.has(key)) fail(`${path}.${key}`, "unknown field");
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}`, "missing required field");
  return row;
}

function text(value: unknown, path: string, maximum = 512): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(path, "expected non-empty text");
  }
  return value.trim();
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(path, `expected integer ${minimum}..${maximum}`);
  }
  return value as number;
}

function digest(value: unknown, path: string): LayoutDigest {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail(path, "expected sha256 digest");
  return value as LayoutDigest;
}

export function parseLayoutFontAssetMetadataV1(value: unknown): LayoutFontAssetMetadataV1 {
  const row = exact(value, ["schemaVersion", "kind", "packageId", "familyName", "displayName", "face", "format", "license", "cmap"], "fontMetadata");
  if (row.schemaVersion !== 1 || row.kind !== "layout_font_asset_v1") fail("fontMetadata", "unsupported schema");
  const face = exact(row.face, ["weight", "style"], "fontMetadata.face");
  const weight = integer(face.weight, "fontMetadata.face.weight", 100, 900);
  if (weight % 100 !== 0) fail("fontMetadata.face.weight", "expected a 100-step weight");
  if (face.style !== "normal" && face.style !== "italic") fail("fontMetadata.face.style", "unsupported style");
  if (row.format !== "woff2" && row.format !== "otf" && row.format !== "ttf") fail("fontMetadata.format", "unsupported format");
  const license = exact(row.license, ["spdx", "sourceUrl", "embeddingAllowed"], "fontMetadata.license");
  const sourceUrl = text(license.sourceUrl, "fontMetadata.license.sourceUrl", 2048);
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:") fail("fontMetadata.license.sourceUrl", "expected https URL");
  } catch (error) {
    if (error instanceof LayoutFontContractError) throw error;
    fail("fontMetadata.license.sourceUrl", "expected valid URL");
  }
  if (typeof license.embeddingAllowed !== "boolean") fail("fontMetadata.license.embeddingAllowed", "expected boolean");
  const cmap = exact(row.cmap, ["digest", "codePointCount", "ranges"], "fontMetadata.cmap");
  if (!Array.isArray(cmap.ranges) || cmap.ranges.length === 0 || cmap.ranges.length > 8192) {
    fail("fontMetadata.cmap.ranges", "expected 1..8192 ranges");
  }
  let previousEnd = -1;
  const ranges = cmap.ranges.map((range, index): [number, number] => {
    if (!Array.isArray(range) || range.length !== 2) fail(`fontMetadata.cmap.ranges[${index}]`, "expected [start,end]");
    const start = integer(range[0], `fontMetadata.cmap.ranges[${index}][0]`, 0, 0x10ffff);
    const end = integer(range[1], `fontMetadata.cmap.ranges[${index}][1]`, start, 0x10ffff);
    if (start <= previousEnd) fail(`fontMetadata.cmap.ranges[${index}]`, "ranges must be sorted and must not overlap");
    previousEnd = end;
    return [start, end];
  });
  return {
    schemaVersion: 1,
    kind: "layout_font_asset_v1",
    packageId: text(row.packageId, "fontMetadata.packageId"),
    familyName: text(row.familyName, "fontMetadata.familyName"),
    displayName: text(row.displayName, "fontMetadata.displayName"),
    face: { weight: weight as LayoutFontAssetMetadataV1["face"]["weight"], style: face.style },
    format: row.format,
    license: {
      spdx: text(license.spdx, "fontMetadata.license.spdx", 64),
      sourceUrl,
      embeddingAllowed: license.embeddingAllowed,
    },
    cmap: {
      digest: digest(cmap.digest, "fontMetadata.cmap.digest"),
      codePointCount: integer(cmap.codePointCount, "fontMetadata.cmap.codePointCount", 1, 0x110000),
      ranges,
    },
  };
}

export function layoutFontFamilyNameV1(assetId: string): string {
  if (!FONT_ID_RE.test(assetId)) throw new LayoutFontContractError("assetId: invalid font asset id");
  return `AIR_${[...assetId].map((character) => character.codePointAt(0)!.toString(16)).join("_")}`;
}

function rangeCovers(ranges: readonly [number, number][], codePoint: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = ranges[middle]!;
    if (codePoint < start) high = middle - 1;
    else if (codePoint > end) low = middle + 1;
    else return true;
  }
  return false;
}

export function fontAssetCoversTextV1(
  metadata: LayoutFontAssetMetadataV1,
  value: string,
): { covered: boolean; missingCodePoints: number[] } {
  const missing = new Set<number>();
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (!rangeCovers(metadata.cmap.ranges, codePoint)) missing.add(codePoint);
  }
  return { covered: missing.size === 0, missingCodePoints: [...missing].sort((left, right) => left - right) };
}

export interface LayoutTextOverflowResultV1 {
  overflow: boolean;
  axis: "width" | "height";
  required: number;
  available: number;
  firstOverflow: { paragraphIndex: number; graphemeOffset: number } | null;
}

function graphemeAdvance(grapheme: string, run: RichTextRunV1): number {
  const first = grapheme.codePointAt(0) ?? 0;
  // Noto CJK renders these East-Asian ambiguous punctuation marks at a full
  // ideographic advance. Treating them as Latin punctuation underestimates
  // lines such as “……林夏——” and can make browser/PDF output wrap once more
  // than the deterministic preflight predicts.
  const cjkAmbiguousPunctuation = first === 0x2014
    || first === 0x2015
    || first === 0x2025
    || first === 0x2026;
  const wide = first >= 0x2e80 || first > 0xffff || cjkAmbiguousPunctuation;
  return Math.max(0.01, run.fontSize * (wide ? 1 : 0.6) + run.letterSpacing);
}

function richTextUnits(document: RichTextDocumentV1): Array<{
  paragraphIndex: number;
  graphemeOffset: number;
  grapheme: string;
  run: RichTextRunV1;
}> {
  return document.paragraphs.flatMap((paragraph, paragraphIndex) => {
    let offset = 0;
    return paragraph.runs.flatMap((run) => layoutGraphemes(run.text).map((grapheme) => ({
      paragraphIndex,
      graphemeOffset: offset++,
      grapheme,
      run,
    })));
  });
}

export function evaluateRichTextOverflowV1(
  document: RichTextDocumentV1,
  box: { width: number; height: number },
): LayoutTextOverflowResultV1 {
  const horizontal = document.writingMode === "horizontal-tb";
  const inlineAvailable = Math.max(0, horizontal ? box.width : box.height);
  const blockAvailable = Math.max(0, horizontal ? box.height : box.width);
  let blockUsed = 0;
  let firstOverflow: LayoutTextOverflowResultV1["firstOverflow"] = null;
  for (let paragraphIndex = 0; paragraphIndex < document.paragraphs.length; paragraphIndex += 1) {
    const paragraph = document.paragraphs[paragraphIndex]!;
    const units = richTextUnits({ ...document, paragraphs: [paragraph] }).map((unit) => ({ ...unit, paragraphIndex }));
    const lineSize = Math.max(...paragraph.runs.map((run) => run.fontSize * paragraph.lineHeight), 1);
    let inlineUsed = 0;
    let lineStarted = false;
    if (units.length === 0) {
      blockUsed += lineSize;
      if (!firstOverflow && blockUsed > blockAvailable) firstOverflow = { paragraphIndex, graphemeOffset: 0 };
      continue;
    }
    for (const unit of units) {
      const advance = graphemeAdvance(unit.grapheme, unit.run);
      if (lineStarted && inlineUsed + advance > inlineAvailable) {
        blockUsed += lineSize;
        inlineUsed = 0;
        lineStarted = false;
      }
      if (!lineStarted) {
        if (blockUsed + lineSize > blockAvailable && !firstOverflow) {
          firstOverflow = { paragraphIndex, graphemeOffset: unit.graphemeOffset };
        }
        lineStarted = true;
      }
      inlineUsed += advance;
      if (advance > inlineAvailable && !firstOverflow) {
        firstOverflow = { paragraphIndex, graphemeOffset: unit.graphemeOffset };
      }
    }
    blockUsed += lineSize;
  }
  return {
    overflow: firstOverflow !== null,
    axis: horizontal ? "height" : "width",
    required: Math.round(blockUsed * 1000) / 1000,
    available: blockAvailable,
    firstOverflow,
  };
}

export type LayoutTextIssueCodeV1 =
  | "LAYOUT_FONT_ASSET_MISSING"
  | "LAYOUT_FONT_EMBEDDING_FORBIDDEN"
  | "LAYOUT_FONT_GLYPH_MISSING"
  | "LAYOUT_TEXT_OVERFLOW";

export interface LayoutTextIssueV1 {
  code: LayoutTextIssueCodeV1;
  canvasId: string;
  elementId: string;
  fontAssetId?: string;
  paragraphIndex?: number;
  graphemeOffset?: number;
  missingCodePoints?: number[];
  axis?: "width" | "height";
  required?: number;
  available?: number;
}

function runMissingCodePoints(
  run: RichTextRunV1,
  fallbacks: readonly string[],
  catalog: ReadonlyMap<string, LayoutFontCatalogItemV1>,
): number[] | null {
  const chain = [run.fontAssetId, ...fallbacks.filter((id) => id !== run.fontAssetId)];
  const fonts = chain.map((id) => catalog.get(id)).filter((item): item is LayoutFontCatalogItemV1 => Boolean(item));
  if (fonts.length === 0) return null;
  const missing = new Set<number>();
  for (const character of run.text) {
    const codePoint = character.codePointAt(0)!;
    if (!fonts.some((font) => rangeCovers(font.metadata.cmap.ranges, codePoint))) missing.add(codePoint);
  }
  return [...missing].sort((left, right) => left - right);
}

export function collectLayoutTextIssuesV1(
  document: LayoutDocumentV1,
  fontCatalog: readonly LayoutFontCatalogItemV1[],
): LayoutTextIssueV1[] {
  const catalog = new Map(fontCatalog.map((item) => [item.assetId, item]));
  const issues: LayoutTextIssueV1[] = [];
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.hidden || (element.type !== "text" && element.type !== "balloon")) continue;
      const referenced = new Set<string>();
      for (const paragraph of element.richText.paragraphs) {
        for (const run of paragraph.runs) referenced.add(run.fontAssetId);
      }
      for (const fontAssetId of referenced) {
        const font = catalog.get(fontAssetId);
        if (!font) {
          issues.push({ code: "LAYOUT_FONT_ASSET_MISSING", canvasId: canvas.id, elementId: element.id, fontAssetId });
        } else if (!font.metadata.license.embeddingAllowed) {
          issues.push({ code: "LAYOUT_FONT_EMBEDDING_FORBIDDEN", canvasId: canvas.id, elementId: element.id, fontAssetId });
        }
      }
      for (let paragraphIndex = 0; paragraphIndex < element.richText.paragraphs.length; paragraphIndex += 1) {
        const paragraph = element.richText.paragraphs[paragraphIndex]!;
        let graphemeOffset = 0;
        for (const run of paragraph.runs) {
          const missing = runMissingCodePoints(run, document.fontPolicy.fallbackFontAssetIds, catalog);
          if (missing?.length) {
            issues.push({
              code: "LAYOUT_FONT_GLYPH_MISSING",
              canvasId: canvas.id,
              elementId: element.id,
              fontAssetId: run.fontAssetId,
              paragraphIndex,
              graphemeOffset,
              missingCodePoints: missing,
            });
          }
          graphemeOffset += layoutGraphemes(run.text).length;
        }
      }
      const padding = element.type === "balloon"
        ? {
            width: element.padding.left + element.padding.right,
            height: element.padding.top + element.padding.bottom,
          }
        : { width: 0, height: 0 };
      const overflow = evaluateRichTextOverflowV1(element.richText, {
        width: Math.max(0, element.transform.width - padding.width),
        height: Math.max(0, element.transform.height - padding.height),
      });
      if (overflow.overflow) {
        issues.push({
          code: "LAYOUT_TEXT_OVERFLOW",
          canvasId: canvas.id,
          elementId: element.id,
          paragraphIndex: overflow.firstOverflow!.paragraphIndex,
          graphemeOffset: overflow.firstOverflow!.graphemeOffset,
          axis: overflow.axis,
          required: overflow.required,
          available: overflow.available,
        });
      }
    }
  }
  return issues;
}
