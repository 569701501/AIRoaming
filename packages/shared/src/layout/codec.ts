import {
  canonicalJsonBytes,
  canonicalizeJson,
  parseStrictJson,
  sha256Bytes,
} from "../versioning/canonical-json.js";
import type {
  BalloonElementV1,
  CandidateImageSourceV1,
  CoverCropV1,
  EncodedLayoutValue,
  FreeImageElementV1,
  LayoutCanvasV1,
  LayoutDocumentV1,
  LayoutFontPolicyV1,
  LayoutInsetsV1,
  LayoutDigest,
  LayoutProfileV1,
  LayoutTopLevelElementV1,
  LayoutTransformV1,
  PageProfileV1,
  PanelFrameElementV1,
  PanelImageElementV1,
  RichTextDocumentV1,
  RichTextFontWeightV1,
  RichTextRunV1,
  StripProfileV1,
  TextElementV1,
} from "./document.js";
import { evaluateCoverCropV1, normalizeLayoutNumber, normalizeLayoutRotation } from "./geometry.js";
import { digestCandidateImageSourceV1 } from "./digest.js";
import { countLayoutGraphemes, normalizePlainLayoutText, normalizeRichTextDocumentV1 } from "./text.js";

export const LAYOUT_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
export const LAYOUT_DOCUMENT_MAX_CANVASES = 200;
export const LAYOUT_CANVAS_MAX_ELEMENTS = 500;
export const LAYOUT_DOCUMENT_MAX_ELEMENTS = 5_000;
export const LAYOUT_TEXT_MAX_GRAPHEMES = 20_000;
export const LAYOUT_DOCUMENT_MAX_GRAPHEMES = 200_000;

export class LayoutDocumentValidationError extends Error {
  readonly code: "LAYOUT_DOCUMENT_INVALID" | "LAYOUT_DOCUMENT_TOO_LARGE";
  readonly httpStatus: 400 | 413;

  constructor(message: string, code: "LAYOUT_DOCUMENT_INVALID" | "LAYOUT_DOCUMENT_TOO_LARGE" = "LAYOUT_DOCUMENT_INVALID") {
    super(message);
    this.name = "LayoutDocumentValidationError";
    this.code = code;
    this.httpStatus = code === "LAYOUT_DOCUMENT_TOO_LARGE" ? 413 : 400;
  }
}

export interface LayoutImageValidationContextV1 {
  width: number;
  height: number;
  sha256?: LayoutDigest;
  ready?: boolean;
  projectId?: string;
  chapterId?: string;
  shotId?: string;
  candidateId?: string;
  candidateLockRevisionId?: string;
}

export interface LayoutDocumentValidationContextV1 {
  projectId?: string;
  chapterId?: string;
  comicFormat?: LayoutDocumentV1["comicFormat"];
  imageByAssetId?: Readonly<Record<string, LayoutImageValidationContextV1>>;
}

function invalid(path: string, message: string): never {
  throw new LayoutDocumentValidationError(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "expected a plain object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path, "expected a plain object");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = object(value, path);
  const expected = new Set(keys);
  for (const key of Object.keys(row)) if (!expected.has(key)) invalid(`${path}.${key}`, "unknown field");
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) invalid(`${path}.${key}`, "missing required field");
  return row;
}

function text(value: unknown, path: string, allowEmpty = true): string {
  if (typeof value !== "string") invalid(path, "expected string");
  let normalized: string;
  try { normalized = normalizePlainLayoutText(value); } catch (error) {
    invalid(path, error instanceof Error ? error.message : "invalid text");
  }
  if (!allowEmpty && normalized.trim() === "") invalid(path, "must be non-empty");
  return normalized;
}

function id(value: unknown, path: string): string {
  const normalized = text(value, path, false).trim();
  if (normalized.includes("\n")) invalid(path, "id must not contain a line break");
  return normalized;
}

function nullableId(value: unknown, path: string): string | null {
  return value === null ? null : id(value, path);
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "expected boolean");
  return value;
}

function number(value: unknown, path: string, minimum?: number, maximum?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "expected finite number");
  const normalized = normalizeLayoutNumber(value);
  if (minimum !== undefined && normalized < minimum) invalid(path, `must be >= ${minimum}`);
  if (maximum !== undefined && normalized > maximum) invalid(path, `must be <= ${maximum}`);
  return normalized;
}

function integer(value: unknown, path: string, minimum?: number, maximum?: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) invalid(path, "expected integer");
  if (minimum !== undefined && value < minimum) invalid(path, `must be >= ${minimum}`);
  if (maximum !== undefined && value > maximum) invalid(path, `must be <= ${maximum}`);
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(path, `expected one of ${allowed.join(", ")}`);
  return value as T;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "expected array");
  return value;
}

function color(value: unknown, path: string, opaque = false): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value)) {
    invalid(path, "expected #RRGGBB or #RRGGBBAA");
  }
  const normalized = `${value.toUpperCase()}${value.length === 7 ? "FF" : ""}`;
  if (opaque && !normalized.endsWith("FF")) invalid(path, "must be opaque");
  return normalized;
}

function digest(value: unknown, path: string): `sha256:${string}` {
  const normalized = text(value, path, false);
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) invalid(path, "expected sha256:<64 lowercase hex>");
  return normalized as `sha256:${string}`;
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) invalid(path, `duplicate id ${value}`);
    seen.add(value);
  }
}

function parseInsets(value: unknown, path: string): LayoutInsetsV1 {
  const row = exact(value, ["top", "right", "bottom", "left"], path);
  return {
    top: number(row.top, `${path}.top`, 0),
    right: number(row.right, `${path}.right`, 0),
    bottom: number(row.bottom, `${path}.bottom`, 0),
    left: number(row.left, `${path}.left`, 0),
  };
}

export function parsePageProfileV1(value: unknown, path = "profile"): PageProfileV1 {
  const row = exact(value, ["kind", "presetId", "width", "height", "safeArea", "panelReadingDirection"], path);
  if (row.kind !== "paged") invalid(`${path}.kind`, "expected paged");
  const width = number(row.width, `${path}.width`, 320, 8192);
  const height = number(row.height, `${path}.height`, 320, 8192);
  const safeArea = parseInsets(row.safeArea, `${path}.safeArea`);
  if (safeArea.left + safeArea.right >= width || safeArea.top + safeArea.bottom >= height) invalid(`${path}.safeArea`, "must leave a usable area");
  const presetId = enumeration(row.presetId, ["portrait_3_4", "landscape_4_3", "square_1_1", "custom"] as const, `${path}.presetId`);
  const expected = presetId === "portrait_3_4" ? [1800, 2400]
    : presetId === "landscape_4_3" ? [2400, 1800]
      : presetId === "square_1_1" ? [1800, 1800]
        : null;
  if (expected && (width !== expected[0] || height !== expected[1])) invalid(path, `preset ${presetId} dimensions must be ${expected[0]}x${expected[1]}`);
  return {
    kind: "paged",
    presetId,
    width,
    height,
    safeArea,
    panelReadingDirection: enumeration(row.panelReadingDirection, ["ltr_ttb", "rtl_ttb"] as const, `${path}.panelReadingDirection`),
  };
}

export function parseStripProfileV1(value: unknown, path = "profile"): StripProfileV1 {
  const row = exact(value, ["kind", "presetId", "width", "defaultSectionHeight", "safeInsetX"], path);
  if (row.kind !== "vertical_strip") invalid(`${path}.kind`, "expected vertical_strip");
  const width = number(row.width, `${path}.width`, 320, 4096);
  const defaultSectionHeight = number(row.defaultSectionHeight, `${path}.defaultSectionHeight`, 320, 8192);
  const safeInsetX = number(row.safeInsetX, `${path}.safeInsetX`, 0);
  if (safeInsetX * 2 >= width) invalid(`${path}.safeInsetX`, "must leave a usable width");
  const presetId = enumeration(row.presetId, ["webtoon_1080", "custom"] as const, `${path}.presetId`);
  if (presetId === "webtoon_1080" && (width !== 1080 || defaultSectionHeight !== 1920)) invalid(path, "webtoon_1080 dimensions must be 1080x1920");
  return { kind: "vertical_strip", presetId, width, defaultSectionHeight, safeInsetX };
}

function parseFontPolicy(value: unknown, path: string): LayoutFontPolicyV1 {
  const row = exact(value, ["defaultFontAssetId", "fallbackFontAssetIds"], path);
  const fallbackFontAssetIds = array(row.fallbackFontAssetIds, `${path}.fallbackFontAssetIds`).map((item, index) => id(item, `${path}.fallbackFontAssetIds[${index}]`));
  unique(fallbackFontAssetIds, `${path}.fallbackFontAssetIds`);
  const defaultFontAssetId = id(row.defaultFontAssetId, `${path}.defaultFontAssetId`);
  if (fallbackFontAssetIds.includes(defaultFontAssetId)) invalid(path, "default font must not be repeated as fallback");
  return { defaultFontAssetId, fallbackFontAssetIds };
}

function parseTransform(value: unknown, path: string, canvasMaxEdge: number): LayoutTransformV1 {
  const row = exact(value, ["x", "y", "width", "height", "rotation", "opacity"], path);
  const limit = canvasMaxEdge * 4;
  return {
    x: number(row.x, `${path}.x`, -limit, limit),
    y: number(row.y, `${path}.y`, -limit, limit),
    width: number(row.width, `${path}.width`, 0.001, limit),
    height: number(row.height, `${path}.height`, 0.001, limit),
    rotation: normalizeLayoutRotation(typeof row.rotation === "number" ? row.rotation : invalid(`${path}.rotation`, "expected finite number")),
    opacity: number(row.opacity, `${path}.opacity`, 0, 1),
  };
}

function parseSource(value: unknown, path: string): CandidateImageSourceV1 {
  const row = exact(value, ["shotId", "candidateId", "candidateLockRevisionId", "assetId", "sourceDigest"], path);
  return {
    shotId: id(row.shotId, `${path}.shotId`),
    candidateId: id(row.candidateId, `${path}.candidateId`),
    candidateLockRevisionId: id(row.candidateLockRevisionId, `${path}.candidateLockRevisionId`),
    assetId: id(row.assetId, `${path}.assetId`),
    sourceDigest: digest(row.sourceDigest, `${path}.sourceDigest`),
  };
}

function parseCrop(value: unknown, path: string, canvasMaxEdge: number): CoverCropV1 {
  const row = exact(value, ["zoom", "offsetX", "offsetY", "rotation", "flipX", "flipY"], path);
  const rotation = typeof row.rotation === "number" ? normalizeLayoutRotation(row.rotation) : invalid(`${path}.rotation`, "expected finite number");
  return {
    zoom: number(row.zoom, `${path}.zoom`, 1),
    offsetX: number(row.offsetX, `${path}.offsetX`, -canvasMaxEdge * 4, canvasMaxEdge * 4),
    offsetY: number(row.offsetY, `${path}.offsetY`, -canvasMaxEdge * 4, canvasMaxEdge * 4),
    rotation,
    flipX: bool(row.flipX, `${path}.flipX`),
    flipY: bool(row.flipY, `${path}.flipY`),
  };
}

function parseRun(value: unknown, path: string): RichTextRunV1 {
  const row = exact(value, ["text", "fontAssetId", "fontSize", "fontWeight", "fontStyle", "color", "letterSpacing", "stroke"], path);
  let stroke: RichTextRunV1["stroke"] = null;
  if (row.stroke !== null) {
    const strokeRow = exact(row.stroke, ["color", "width"], `${path}.stroke`);
    stroke = { color: color(strokeRow.color, `${path}.stroke.color`), width: number(strokeRow.width, `${path}.stroke.width`, 0, 64) };
  }
  const fontWeight = integer(row.fontWeight, `${path}.fontWeight`, 100, 900);
  if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(fontWeight)) invalid(`${path}.fontWeight`, "expected a 100-step weight from 100 to 900");
  return {
    text: text(row.text, `${path}.text`),
    fontAssetId: id(row.fontAssetId, `${path}.fontAssetId`),
    fontSize: number(row.fontSize, `${path}.fontSize`, 6, 512),
    fontWeight: fontWeight as RichTextFontWeightV1,
    fontStyle: enumeration(row.fontStyle, ["normal", "italic"] as const, `${path}.fontStyle`),
    color: color(row.color, `${path}.color`),
    letterSpacing: number(row.letterSpacing, `${path}.letterSpacing`, -20, 200),
    stroke,
  };
}

export function parseRichTextDocumentV1(value: unknown, path = "richText"): RichTextDocumentV1 {
  const row = exact(value, ["schemaVersion", "writingMode", "textOrientation", "paragraphs"], path);
  if (row.schemaVersion !== 1) invalid(`${path}.schemaVersion`, "expected 1");
  const paragraphs = array(row.paragraphs, `${path}.paragraphs`).map((paragraphValue, paragraphIndex) => {
    const paragraphPath = `${path}.paragraphs[${paragraphIndex}]`;
    const paragraph = exact(paragraphValue, ["align", "lineHeight", "runs"], paragraphPath);
    const runs = array(paragraph.runs, `${paragraphPath}.runs`).map((runValue, runIndex) => parseRun(runValue, `${paragraphPath}.runs[${runIndex}]`));
    if (runs.length === 0) invalid(`${paragraphPath}.runs`, "requires at least one run");
    return {
      align: enumeration(paragraph.align, ["start", "center", "end"] as const, `${paragraphPath}.align`),
      lineHeight: number(paragraph.lineHeight, `${paragraphPath}.lineHeight`, 0.8, 3),
      runs,
    };
  });
  if (paragraphs.length === 0) invalid(`${path}.paragraphs`, "requires at least one paragraph");
  const normalized = normalizeRichTextDocumentV1({
    schemaVersion: 1,
    writingMode: enumeration(row.writingMode, ["horizontal-tb", "vertical-rl"] as const, `${path}.writingMode`),
    textOrientation: enumeration(row.textOrientation, ["mixed", "upright"] as const, `${path}.textOrientation`),
    paragraphs,
  });
  const count = normalized.paragraphs.reduce((sum, paragraph) => sum + paragraph.runs.reduce((runSum, run) => runSum + countLayoutGraphemes(run.text), 0), 0);
  if (count > LAYOUT_TEXT_MAX_GRAPHEMES) invalid(path, `grapheme count exceeds ${LAYOUT_TEXT_MAX_GRAPHEMES}`);
  return normalized;
}

function parsePanelImage(value: unknown, path: string, canvasMaxEdge: number): PanelImageElementV1 {
  const row = exact(value, ["id", "type", "placement", "name", "locked", "hidden", "source", "crop"], path);
  if (row.type !== "image") invalid(`${path}.type`, "expected image");
  if (row.placement !== "panel_content") invalid(`${path}.placement`, "expected panel_content");
  return {
    id: id(row.id, `${path}.id`), type: "image", placement: "panel_content", name: text(row.name, `${path}.name`),
    locked: bool(row.locked, `${path}.locked`), hidden: bool(row.hidden, `${path}.hidden`),
    source: parseSource(row.source, `${path}.source`), crop: parseCrop(row.crop, `${path}.crop`, canvasMaxEdge),
  };
}

function base(value: Record<string, unknown>, path: string, type: LayoutTopLevelElementV1["type"], canvasMaxEdge: number) {
  if (value.type !== type) invalid(`${path}.type`, `expected ${type}`);
  return {
    id: id(value.id, `${path}.id`), type, name: text(value.name, `${path}.name`),
    transform: parseTransform(value.transform, `${path}.transform`, canvasMaxEdge),
    locked: bool(value.locked, `${path}.locked`), hidden: bool(value.hidden, `${path}.hidden`),
  };
}

function validateSourceContext(
  source: CandidateImageSourceV1,
  path: string,
  document: Pick<LayoutDocumentV1, "projectId" | "chapterId">,
  context: LayoutDocumentValidationContextV1,
): LayoutImageValidationContextV1 | null {
  const asset = context.imageByAssetId?.[source.assetId] ?? null;
  if (!asset) return null;
  if (asset.ready === false) invalid(path, "asset is not ready");
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) invalid(path, "asset dimensions must be positive finite numbers");
  for (const [field, expected] of [["projectId", document.projectId], ["chapterId", document.chapterId], ["shotId", source.shotId], ["candidateId", source.candidateId], ["candidateLockRevisionId", source.candidateLockRevisionId]] as const) {
    const actual = asset[field];
    if (actual !== undefined && actual !== expected) invalid(path, `${field} scope mismatch`);
  }
  if (asset.sha256 !== undefined) {
    const { sourceDigest: _sourceDigest, ...unsignedSource } = source;
    if (digestCandidateImageSourceV1(unsignedSource, asset.sha256) !== source.sourceDigest) invalid(path, "sourceDigest does not match the controlled Asset sha");
  }
  return asset;
}

function parseElement(
  value: unknown,
  path: string,
  canvasMaxEdge: number,
  document: Pick<LayoutDocumentV1, "projectId" | "chapterId">,
  context: LayoutDocumentValidationContextV1,
): LayoutTopLevelElementV1 {
  const raw = object(value, path);
  if (raw.type === "panel_frame") {
    const row = exact(raw, ["id", "type", "name", "transform", "locked", "hidden", "shape", "border", "contentImage"], path);
    const parsedBase = base(row, path, "panel_frame", canvasMaxEdge);
    const shapeRow = exact(row.shape, ["kind", "cornerRadius"], `${path}.shape`);
    const shapeKind = enumeration(shapeRow.kind, ["rect", "rounded_rect"] as const, `${path}.shape.kind`);
    const cornerRadius = number(shapeRow.cornerRadius, `${path}.shape.cornerRadius`, 0, Math.min(parsedBase.transform.width, parsedBase.transform.height) / 2);
    if (shapeKind === "rect" && cornerRadius !== 0) invalid(`${path}.shape.cornerRadius`, "rect requires 0");
    const borderRow = exact(row.border, ["visible", "color", "width"], `${path}.border`);
    const contentImage = row.contentImage === null ? null : parsePanelImage(row.contentImage, `${path}.contentImage`, canvasMaxEdge);
    if (contentImage) {
      const asset = validateSourceContext(contentImage.source, `${path}.contentImage.source`, document, context);
      if (asset && !evaluateCoverCropV1({ sourceWidth: asset.width, sourceHeight: asset.height, frameWidth: parsedBase.transform.width, frameHeight: parsedBase.transform.height, crop: contentImage.crop }).covered) {
        invalid(`${path}.contentImage.crop`, "crop exposes an uncovered area");
      }
    }
    return {
      ...parsedBase,
      type: "panel_frame",
      shape: { kind: shapeKind, cornerRadius },
      border: { visible: bool(borderRow.visible, `${path}.border.visible`), color: color(borderRow.color, `${path}.border.color`), width: number(borderRow.width, `${path}.border.width`, 0, 512) },
      contentImage,
    } satisfies PanelFrameElementV1;
  }
  if (raw.type === "free_image") {
    const row = exact(raw, ["id", "type", "name", "transform", "locked", "hidden", "source", "display"], path);
    const parsedBase = base(row, path, "free_image", canvasMaxEdge);
    const source = parseSource(row.source, `${path}.source`);
    const asset = validateSourceContext(source, `${path}.source`, document, context);
    const displayRow = object(row.display, `${path}.display`);
    let display: FreeImageElementV1["display"];
    if (displayRow.mode === "contain") {
      exact(displayRow, ["mode"], `${path}.display`);
      display = { mode: "contain" };
    } else if (displayRow.mode === "cover") {
      const coverRow = exact(displayRow, ["mode", "crop"], `${path}.display`);
      const crop = parseCrop(coverRow.crop, `${path}.display.crop`, canvasMaxEdge);
      if (asset && !evaluateCoverCropV1({ sourceWidth: asset.width, sourceHeight: asset.height, frameWidth: parsedBase.transform.width, frameHeight: parsedBase.transform.height, crop }).covered) {
        invalid(`${path}.display.crop`, "crop exposes an uncovered area");
      }
      display = { mode: "cover", crop };
    } else invalid(`${path}.display.mode`, "expected contain or cover");
    return { ...parsedBase, type: "free_image", source, display } satisfies FreeImageElementV1;
  }
  if (raw.type === "text") {
    const row = exact(raw, ["id", "type", "name", "transform", "locked", "hidden", "semantic", "verticalAlign", "richText"], path);
    return {
      ...base(row, path, "text", canvasMaxEdge), type: "text",
      semantic: enumeration(row.semantic, ["title", "caption", "sfx", "custom"] as const, `${path}.semantic`),
      verticalAlign: enumeration(row.verticalAlign, ["start", "center", "end"] as const, `${path}.verticalAlign`),
      richText: parseRichTextDocumentV1(row.richText, `${path}.richText`),
    } satisfies TextElementV1;
  }
  if (raw.type === "balloon") {
    const row = exact(raw, ["id", "type", "name", "transform", "locked", "hidden", "balloonKind", "sourceShotId", "speakerCharacterId", "fillColor", "strokeColor", "strokeWidth", "padding", "verticalAlign", "tail", "richText"], path);
    const parsedBase = base(row, path, "balloon", canvasMaxEdge);
    const padding = parseInsets(row.padding, `${path}.padding`);
    if (padding.left + padding.right >= parsedBase.transform.width || padding.top + padding.bottom >= parsedBase.transform.height) invalid(`${path}.padding`, "must leave a text area");
    const tailRow = exact(row.tail, ["enabled", "rootRatio", "targetX", "targetY", "baseWidth"], `${path}.tail`);
    const rootRatio = number(tailRow.rootRatio, `${path}.tail.rootRatio`, 0, 1);
    if (rootRatio >= 1) invalid(`${path}.tail.rootRatio`, "must be < 1");
    return {
      ...parsedBase,
      type: "balloon",
      balloonKind: enumeration(row.balloonKind, ["speech", "thought", "shout", "caption"] as const, `${path}.balloonKind`),
      sourceShotId: nullableId(row.sourceShotId, `${path}.sourceShotId`),
      speakerCharacterId: nullableId(row.speakerCharacterId, `${path}.speakerCharacterId`),
      fillColor: color(row.fillColor, `${path}.fillColor`),
      strokeColor: color(row.strokeColor, `${path}.strokeColor`),
      strokeWidth: number(row.strokeWidth, `${path}.strokeWidth`, 0, 512),
      padding,
      verticalAlign: enumeration(row.verticalAlign, ["start", "center", "end"] as const, `${path}.verticalAlign`),
      tail: {
        enabled: bool(tailRow.enabled, `${path}.tail.enabled`), rootRatio,
        targetX: number(tailRow.targetX, `${path}.tail.targetX`, -canvasMaxEdge * 4, canvasMaxEdge * 4),
        targetY: number(tailRow.targetY, `${path}.tail.targetY`, -canvasMaxEdge * 4, canvasMaxEdge * 4),
        baseWidth: number(tailRow.baseWidth, `${path}.tail.baseWidth`, 0, canvasMaxEdge * 4),
      },
      richText: parseRichTextDocumentV1(row.richText, `${path}.richText`),
    } satisfies BalloonElementV1;
  }
  invalid(`${path}.type`, "expected panel_frame, free_image, text or balloon");
}

function parseCanvas(
  value: unknown,
  path: string,
  profile: PageProfileV1 | StripProfileV1,
  document: Pick<LayoutDocumentV1, "projectId" | "chapterId">,
  context: LayoutDocumentValidationContextV1,
): LayoutCanvasV1 {
  const row = exact(value, ["id", "kind", "name", "width", "height", "backgroundColor", "panelReadingOrder", "elements"], path);
  const kind = enumeration(row.kind, ["page", "strip_section"] as const, `${path}.kind`);
  const width = number(row.width, `${path}.width`, 320, profile.kind === "paged" ? 8192 : 4096);
  const height = number(row.height, `${path}.height`, 320, 8192);
  if (width * height > 33_554_432) invalid(path, "logical area exceeds 33,554,432");
  if (profile.kind === "paged" && (kind !== "page" || width !== profile.width || height !== profile.height)) invalid(path, "page canvas kind/size must match PageProfile");
  if (profile.kind === "vertical_strip" && (kind !== "strip_section" || width !== profile.width)) invalid(path, "strip canvas kind/width must match StripProfile");
  const elementsInput = array(row.elements, `${path}.elements`);
  if (elementsInput.length > LAYOUT_CANVAS_MAX_ELEMENTS) invalid(`${path}.elements`, `must contain at most ${LAYOUT_CANVAS_MAX_ELEMENTS}`);
  const maxEdge = Math.max(width, height);
  const elements = elementsInput.map((element, index) => parseElement(element, `${path}.elements[${index}]`, maxEdge, document, context));
  unique(elements.flatMap((element) => [
    element.id,
    ...(element.type === "panel_frame" && element.contentImage ? [element.contentImage.id] : []),
  ]), `${path}.elements`);
  const panelIds = elements.filter((element): element is PanelFrameElementV1 => element.type === "panel_frame").map((element) => element.id);
  const panelReadingOrder = array(row.panelReadingOrder, `${path}.panelReadingOrder`).map((item, index) => id(item, `${path}.panelReadingOrder[${index}]`));
  unique(panelReadingOrder, `${path}.panelReadingOrder`);
  if (panelReadingOrder.length !== panelIds.length || panelReadingOrder.some((panelId) => !panelIds.includes(panelId))) {
    invalid(`${path}.panelReadingOrder`, "must contain every panel_frame exactly once and no other ID");
  }
  return {
    id: id(row.id, `${path}.id`), kind, name: text(row.name, `${path}.name`), width, height,
    backgroundColor: color(row.backgroundColor, `${path}.backgroundColor`, true), panelReadingOrder, elements,
  };
}

function inputValue(input: unknown): unknown {
  if (typeof input !== "string") return input;
  if (new TextEncoder().encode(input).length > LAYOUT_DOCUMENT_MAX_BYTES) {
    throw new LayoutDocumentValidationError(`document: canonical bytes exceed ${LAYOUT_DOCUMENT_MAX_BYTES}`, "LAYOUT_DOCUMENT_TOO_LARGE");
  }
  try { return parseStrictJson(input); } catch (error) {
    invalid("document", error instanceof Error ? error.message : "invalid JSON");
  }
}

export function parseAndNormalizeLayoutDocumentV1(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): LayoutDocumentV1 {
  const row = exact(inputValue(input), ["schemaVersion", "kind", "projectId", "chapterId", "comicFormat", "profile", "fontPolicy", "canvases"], "document");
  if (row.schemaVersion !== 1) invalid("document.schemaVersion", "expected 1");
  if (row.kind !== "layout_document_v1") invalid("document.kind", "expected layout_document_v1");
  const projectId = id(row.projectId, "document.projectId");
  const chapterId = id(row.chapterId, "document.chapterId");
  const comicFormat = enumeration(row.comicFormat, ["vertical_scroll", "paged_comic"] as const, "document.comicFormat");
  if (context.projectId !== undefined && context.projectId !== projectId) invalid("document.projectId", "scope mismatch");
  if (context.chapterId !== undefined && context.chapterId !== chapterId) invalid("document.chapterId", "scope mismatch");
  if (context.comicFormat !== undefined && context.comicFormat !== comicFormat) invalid("document.comicFormat", "scope mismatch");
  const profile = comicFormat === "paged_comic" ? parsePageProfileV1(row.profile, "document.profile") : parseStripProfileV1(row.profile, "document.profile");
  const canvasesInput = array(row.canvases, "document.canvases");
  if (canvasesInput.length < 1 || canvasesInput.length > LAYOUT_DOCUMENT_MAX_CANVASES) invalid("document.canvases", `must contain 1..${LAYOUT_DOCUMENT_MAX_CANVASES}`);
  const scope = { projectId, chapterId };
  const canvases = canvasesInput.map((canvas, index) => parseCanvas(canvas, `document.canvases[${index}]`, profile, scope, context));
  const elementCount = canvases.reduce((sum, canvas) => sum + canvas.elements.length, 0);
  if (elementCount > LAYOUT_DOCUMENT_MAX_ELEMENTS) invalid("document.canvases", `top-level elements exceed ${LAYOUT_DOCUMENT_MAX_ELEMENTS}`);
  const allIds = canvases.flatMap((canvas) => [canvas.id, ...canvas.elements.flatMap((element) => [element.id, ...(element.type === "panel_frame" && element.contentImage ? [element.contentImage.id] : [])])]);
  unique(allIds, "document IDs");
  const shotRevisions = new Map<string, string>();
  let graphemeCount = 0;
  for (const canvas of canvases) {
    for (const element of canvas.elements) {
      if (element.type === "text" || element.type === "balloon") {
        graphemeCount += element.richText.paragraphs.reduce((sum, paragraph) => sum + paragraph.runs.reduce((runSum, run) => runSum + countLayoutGraphemes(run.text), 0), 0);
      }
      const source = element.type === "panel_frame" ? element.contentImage?.source : element.type === "free_image" ? element.source : null;
      if (source) {
        const previous = shotRevisions.get(source.shotId);
        if (previous !== undefined && previous !== source.candidateLockRevisionId) invalid("document", `shot ${source.shotId} binds multiple CandidateLockRevision IDs`);
        shotRevisions.set(source.shotId, source.candidateLockRevisionId);
      }
    }
  }
  if (graphemeCount > LAYOUT_DOCUMENT_MAX_GRAPHEMES) invalid("document", `grapheme count exceeds ${LAYOUT_DOCUMENT_MAX_GRAPHEMES}`);
  const document: LayoutDocumentV1 = {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId,
    chapterId,
    comicFormat,
    profile,
    fontPolicy: parseFontPolicy(row.fontPolicy, "document.fontPolicy"),
    canvases,
  };
  if (canonicalJsonBytes(document).length > LAYOUT_DOCUMENT_MAX_BYTES) {
    throw new LayoutDocumentValidationError(`document: canonical bytes exceed ${LAYOUT_DOCUMENT_MAX_BYTES}`, "LAYOUT_DOCUMENT_TOO_LARGE");
  }
  return document;
}

export function encodeLayoutDocumentV1(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): EncodedLayoutValue<LayoutDocumentV1> {
  const value = parseAndNormalizeLayoutDocumentV1(input, context);
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 1, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export const LayoutDocumentCodecV1 = {
  schemaVersion: 1 as const,
  parse: parseAndNormalizeLayoutDocumentV1,
  parseAndNormalize: parseAndNormalizeLayoutDocumentV1,
  encode: encodeLayoutDocumentV1,
};

function standaloneInput(input: unknown, path: string): unknown {
  if (typeof input !== "string") return input;
  if (new TextEncoder().encode(input).length > LAYOUT_DOCUMENT_MAX_BYTES) {
    throw new LayoutDocumentValidationError(`${path}: canonical bytes exceed ${LAYOUT_DOCUMENT_MAX_BYTES}`, "LAYOUT_DOCUMENT_TOO_LARGE");
  }
  try { return parseStrictJson(input); } catch (error) {
    invalid(path, error instanceof Error ? error.message : "invalid JSON");
  }
}

function encodeStandalone<T>(value: T): EncodedLayoutValue<T> {
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 1, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export function parseLayoutProfileV1(input: unknown): LayoutProfileV1 {
  const value = standaloneInput(input, "profile");
  const row = object(value, "profile");
  if (row.kind === "paged") return parsePageProfileV1(row);
  if (row.kind === "vertical_strip") return parseStripProfileV1(row);
  invalid("profile.kind", "expected paged or vertical_strip");
}

export const LayoutProfileCodecV1 = {
  schemaVersion: 1 as const,
  parse: parseLayoutProfileV1,
  parseAndNormalize: parseLayoutProfileV1,
  encode(input: unknown): EncodedLayoutValue<LayoutProfileV1> {
    return encodeStandalone(parseLayoutProfileV1(input));
  },
};

export const RichTextDocumentCodecV1 = {
  schemaVersion: 1 as const,
  parse(input: unknown): RichTextDocumentV1 {
    return parseRichTextDocumentV1(standaloneInput(input, "richText"));
  },
  parseAndNormalize(input: unknown): RichTextDocumentV1 {
    return parseRichTextDocumentV1(standaloneInput(input, "richText"));
  },
  encode(input: unknown): EncodedLayoutValue<RichTextDocumentV1> {
    return encodeStandalone(parseRichTextDocumentV1(standaloneInput(input, "richText")));
  },
};

export interface LayoutElementCodecContextV1 extends LayoutDocumentValidationContextV1 {
  canvasWidth: number;
  canvasHeight: number;
  projectId: string;
  chapterId: string;
}

export function parseLayoutTopLevelElementV1(
  input: unknown,
  context: LayoutElementCodecContextV1,
): LayoutTopLevelElementV1 {
  const value = standaloneInput(input, "element");
  if (!Number.isFinite(context.canvasWidth) || !Number.isFinite(context.canvasHeight) || context.canvasWidth <= 0 || context.canvasHeight <= 0) {
    invalid("element context", "canvas dimensions must be positive finite numbers");
  }
  return parseElement(
    value,
    "element",
    Math.max(context.canvasWidth, context.canvasHeight),
    { projectId: context.projectId, chapterId: context.chapterId },
    context,
  );
}

export const LayoutElementCodecV1 = {
  schemaVersion: 1 as const,
  parse: parseLayoutTopLevelElementV1,
  parseAndNormalize: parseLayoutTopLevelElementV1,
  encode(input: unknown, context: LayoutElementCodecContextV1): EncodedLayoutValue<LayoutTopLevelElementV1> {
    return encodeStandalone(parseLayoutTopLevelElementV1(input, context));
  },
};
