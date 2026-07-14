import { canonicalJsonBytes, canonicalizeJson } from "../versioning/canonical-json.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import type {
  BalloonElementV1,
  BalloonTailV1,
  CandidateImageSourceV1,
  CoverCropV1,
  FreeImageElementV1,
  LayoutCanvasV1,
  LayoutDocumentV1,
  LayoutInsetsV1,
  LayoutProfileV1,
  LayoutPublicationProfileV1,
  LayoutTransformV1,
  LayoutTopLevelElementV1,
  PanelFrameElementV1,
  PanelImageElementV1,
  RichTextDocumentV1,
  RichTextParagraphV1,
  TextElementV1,
} from "./document.js";
import { applyRichTextRangeStyle, replaceRichTextRange, type RichTextRangeV1, type RichTextRunStylePatchV1 } from "./text.js";

export const EDITOR_COMMAND_TYPES_V1 = [
  "canvas.add", "canvas.duplicate", "canvas.delete", "canvas.reorder", "canvas.resize", "layout.resize_profile",
  "element.add", "element.duplicate", "element.delete", "element.reorder", "element.set_transform", "element.set_locked", "element.set_hidden",
  "panel.set_shape", "panel.set_border", "panel.attach_image", "panel.detach_image_to_free",
  "image.set_display", "image.set_crop", "image.replace_source",
  "text.replace_range", "text.apply_range_style", "text.set_paragraph_style", "text.replace_document", "text.set_semantic",
  "balloon.set_kind", "balloon.set_visual_style", "balloon.set_tail", "balloon.set_source_refs", "balloon.replace_text_document",
  "batch.transform", "batch.align", "batch.distribute", "batch.reorder", "batch.set_locked", "batch.set_hidden", "batch.delete",
  "layout.apply_preset", "layout.replace_sources",
] as const;

export type EditorCommandTypeV1 = (typeof EDITOR_COMMAND_TYPES_V1)[number];

interface CanvasTargetV1 { canvasId: string }
interface ElementTargetV1 extends CanvasTargetV1 { elementId: string }
interface LayerInsertionV1 { beforeElementId: string | null }

export interface LayoutSourceReplacementCommandV1 extends ElementTargetV1 {
  source: CandidateImageSourceV1;
  crop: CoverCropV1 | null;
}

export interface EditorCommandPayloadMapV1 {
  "canvas.add": { canvas: LayoutCanvasV1; beforeCanvasId: string | null };
  "canvas.duplicate": { sourceCanvasId: string; canvas: LayoutCanvasV1; beforeCanvasId: string | null };
  "canvas.delete": { canvasId: string };
  "canvas.reorder": { canvasId: string; beforeCanvasId: string | null };
  "canvas.resize": { canvasId: string; canvas: LayoutCanvasV1 };
  "layout.resize_profile": { profile: LayoutProfileV1; canvases: LayoutCanvasV1[] };
  "element.add": CanvasTargetV1 & LayerInsertionV1 & { element: LayoutTopLevelElementV1 };
  "element.duplicate": CanvasTargetV1 & LayerInsertionV1 & { sourceElementId: string; element: LayoutTopLevelElementV1 };
  "element.delete": ElementTargetV1;
  "element.reorder": ElementTargetV1 & LayerInsertionV1;
  "element.set_transform": ElementTargetV1 & { transform: LayoutTransformV1 };
  "element.set_locked": ElementTargetV1 & { locked: boolean };
  "element.set_hidden": ElementTargetV1 & { hidden: boolean };
  "panel.set_shape": ElementTargetV1 & { shape: PanelFrameElementV1["shape"] };
  "panel.set_border": ElementTargetV1 & { border: PanelFrameElementV1["border"] };
  "panel.attach_image": ElementTargetV1 & { image: PanelImageElementV1 };
  "panel.detach_image_to_free": ElementTargetV1 & LayerInsertionV1 & { freeImage: FreeImageElementV1 };
  "image.set_display": ElementTargetV1 & { display: FreeImageElementV1["display"] };
  "image.set_crop": ElementTargetV1 & { crop: CoverCropV1 };
  "image.replace_source": LayoutSourceReplacementCommandV1;
  "text.replace_range": ElementTargetV1 & RichTextRangeV1 & { text: string };
  "text.apply_range_style": ElementTargetV1 & RichTextRangeV1 & { style: RichTextRunStylePatchV1 };
  "text.set_paragraph_style": ElementTargetV1 & { paragraphIndex: number; align: RichTextParagraphV1["align"]; lineHeight: number };
  "text.replace_document": ElementTargetV1 & { richText: RichTextDocumentV1 };
  "text.set_semantic": ElementTargetV1 & { semantic: TextElementV1["semantic"] };
  "balloon.set_kind": ElementTargetV1 & { balloonKind: BalloonElementV1["balloonKind"] };
  "balloon.set_visual_style": ElementTargetV1 & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    padding: LayoutInsetsV1;
    verticalAlign: BalloonElementV1["verticalAlign"];
  };
  "balloon.set_tail": ElementTargetV1 & { tail: BalloonTailV1 };
  "balloon.set_source_refs": ElementTargetV1 & { sourceShotId: string | null; speakerCharacterId: string | null };
  "balloon.replace_text_document": ElementTargetV1 & { richText: RichTextDocumentV1 };
  "batch.transform": { commands: EditorCommandV1[] };
  "batch.align": { commands: EditorCommandV1[] };
  "batch.distribute": { commands: EditorCommandV1[] };
  "batch.reorder": { commands: EditorCommandV1[] };
  "batch.set_locked": { commands: EditorCommandV1[] };
  "batch.set_hidden": { commands: EditorCommandV1[] };
  "batch.delete": { commands: EditorCommandV1[] };
  "layout.apply_preset": { canvasId: string; panels: PanelFrameElementV1[]; panelReadingOrder: string[] };
  "layout.replace_sources": { replacements: LayoutSourceReplacementCommandV1[] };
}

export type EditorCommandV1<TType extends EditorCommandTypeV1 = EditorCommandTypeV1> = TType extends EditorCommandTypeV1 ? {
  schemaVersion: 1;
  commandId: string;
  type: TType;
  label: string;
  payload: EditorCommandPayloadMapV1[TType];
} : never;

export interface EditorCommandBatchV1 {
  schemaVersion: 1;
  batchId: string;
  label: string;
  commands: EditorCommandV1[];
}

export interface LayoutInverseCommandV1 {
  schemaVersion: 1;
  commandId: string;
  type: "layout.restore_snapshot";
  label: string;
  payload: { document: LayoutDocumentV1 };
}

export type ApplicableLayoutCommandV1 = EditorCommandV1 | LayoutInverseCommandV1;

export type LayoutPreflightScopeV1 = "document" | "geometry" | "layers" | "sources" | "text" | "fonts";

export interface ApplyLayoutCommandResultV1 {
  document: LayoutDocumentV1;
  inverse: LayoutInverseCommandV1;
  changedElementIds: string[];
  invalidatedPreflightScopes: LayoutPreflightScopeV1[];
}

export class LayoutCommandError extends Error {
  readonly code = "LAYOUT_COMMAND_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutCommandError";
  }
}

function fail(message: string): never {
  throw new LayoutCommandError(message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path}: expected object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${path}: expected plain object`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) fail(`${path}.${key}: unknown field`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}: missing required field`);
  return row;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${path}: expected non-empty string`);
  return value.trim();
}

function optionalId(value: unknown, path: string): string | null {
  return value === null ? null : id(value, path);
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(`${path}: expected boolean`);
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) fail(`${path}: expected integer >= ${minimum}`);
  return value;
}

function jsonObject(value: unknown, path: string): Record<string, unknown> {
  const row = record(value, path);
  try { canonicalizeJson(row); } catch { fail(`${path}: expected JSON object`); }
  return row;
}

function partial(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const fields = new Set(allowed);
  if (Object.keys(row).length === 0) fail(`${path}: requires at least one field`);
  for (const key of Object.keys(row)) if (!fields.has(key)) fail(`${path}.${key}: unknown field`);
  return row;
}

const SIMPLE_KEYS: Partial<Record<EditorCommandTypeV1, readonly string[]>> = {
  "canvas.add": ["canvas", "beforeCanvasId"],
  "canvas.duplicate": ["sourceCanvasId", "canvas", "beforeCanvasId"],
  "canvas.delete": ["canvasId"],
  "canvas.reorder": ["canvasId", "beforeCanvasId"],
  "canvas.resize": ["canvasId", "canvas"],
  "layout.resize_profile": ["profile", "canvases"],
  "element.add": ["canvasId", "element", "beforeElementId"],
  "element.duplicate": ["canvasId", "sourceElementId", "element", "beforeElementId"],
  "element.delete": ["canvasId", "elementId"],
  "element.reorder": ["canvasId", "elementId", "beforeElementId"],
  "element.set_transform": ["canvasId", "elementId", "transform"],
  "element.set_locked": ["canvasId", "elementId", "locked"],
  "element.set_hidden": ["canvasId", "elementId", "hidden"],
  "panel.set_shape": ["canvasId", "elementId", "shape"],
  "panel.set_border": ["canvasId", "elementId", "border"],
  "panel.attach_image": ["canvasId", "elementId", "image"],
  "panel.detach_image_to_free": ["canvasId", "elementId", "freeImage", "beforeElementId"],
  "image.set_display": ["canvasId", "elementId", "display"],
  "image.set_crop": ["canvasId", "elementId", "crop"],
  "image.replace_source": ["canvasId", "elementId", "source", "crop"],
  "text.replace_range": ["canvasId", "elementId", "start", "end", "text"],
  "text.apply_range_style": ["canvasId", "elementId", "start", "end", "style"],
  "text.set_paragraph_style": ["canvasId", "elementId", "paragraphIndex", "align", "lineHeight"],
  "text.replace_document": ["canvasId", "elementId", "richText"],
  "text.set_semantic": ["canvasId", "elementId", "semantic"],
  "balloon.set_kind": ["canvasId", "elementId", "balloonKind"],
  "balloon.set_visual_style": ["canvasId", "elementId", "fillColor", "strokeColor", "strokeWidth", "padding", "verticalAlign"],
  "balloon.set_tail": ["canvasId", "elementId", "tail"],
  "balloon.set_source_refs": ["canvasId", "elementId", "sourceShotId", "speakerCharacterId"],
  "balloon.replace_text_document": ["canvasId", "elementId", "richText"],
  "batch.transform": ["commands"], "batch.align": ["commands"], "batch.distribute": ["commands"], "batch.reorder": ["commands"],
  "batch.set_locked": ["commands"], "batch.set_hidden": ["commands"], "batch.delete": ["commands"],
  "layout.apply_preset": ["canvasId", "panels", "panelReadingOrder"],
  "layout.replace_sources": ["replacements"],
};

function parsePosition(value: unknown, path: string): { paragraphIndex: number; graphemeOffset: number } {
  const row = exact(value, ["paragraphIndex", "graphemeOffset"], path);
  return { paragraphIndex: integer(row.paragraphIndex, `${path}.paragraphIndex`), graphemeOffset: integer(row.graphemeOffset, `${path}.graphemeOffset`) };
}

function parseNestedCommands(value: unknown, path: string): EditorCommandV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) fail(`${path}: expected 1..500 commands`);
  return value.map((item, index) => {
    const parsed = parseEditorCommandV1(item);
    if (parsed.type.startsWith("batch.") || parsed.type === "layout.apply_preset" || parsed.type === "layout.replace_sources") {
      fail(`${path}[${index}]: nested batch commands are forbidden`);
    }
    return parsed;
  });
}

function validatePayload(type: EditorCommandTypeV1, value: unknown): Record<string, unknown> {
  const payload = exact(value, SIMPLE_KEYS[type]!, "command.payload");
  if ("canvasId" in payload) payload.canvasId = id(payload.canvasId, "command.payload.canvasId");
  if ("elementId" in payload) payload.elementId = id(payload.elementId, "command.payload.elementId");
  if ("sourceCanvasId" in payload) payload.sourceCanvasId = id(payload.sourceCanvasId, "command.payload.sourceCanvasId");
  if ("sourceElementId" in payload) payload.sourceElementId = id(payload.sourceElementId, "command.payload.sourceElementId");
  if ("beforeCanvasId" in payload) payload.beforeCanvasId = optionalId(payload.beforeCanvasId, "command.payload.beforeCanvasId");
  if ("beforeElementId" in payload) payload.beforeElementId = optionalId(payload.beforeElementId, "command.payload.beforeElementId");
  if ("canvas" in payload) payload.canvas = jsonObject(payload.canvas, "command.payload.canvas");
  if ("element" in payload) payload.element = jsonObject(payload.element, "command.payload.element");
  if ("transform" in payload) payload.transform = exact(payload.transform, ["x", "y", "width", "height", "rotation", "opacity"], "command.payload.transform");
  if ("locked" in payload) payload.locked = bool(payload.locked, "command.payload.locked");
  if ("hidden" in payload) payload.hidden = bool(payload.hidden, "command.payload.hidden");
  if ("shape" in payload) payload.shape = exact(payload.shape, ["kind", "cornerRadius"], "command.payload.shape");
  if ("border" in payload) payload.border = exact(payload.border, ["visible", "color", "width"], "command.payload.border");
  if ("image" in payload) payload.image = jsonObject(payload.image, "command.payload.image");
  if ("freeImage" in payload) payload.freeImage = jsonObject(payload.freeImage, "command.payload.freeImage");
  if ("display" in payload) payload.display = jsonObject(payload.display, "command.payload.display");
  if ("crop" in payload && payload.crop !== null) payload.crop = exact(payload.crop, ["zoom", "offsetX", "offsetY", "rotation", "flipX", "flipY"], "command.payload.crop");
  if ("source" in payload) payload.source = exact(payload.source, ["shotId", "candidateId", "candidateLockRevisionId", "assetId", "sourceDigest"], "command.payload.source");
  if ("start" in payload) payload.start = parsePosition(payload.start, "command.payload.start");
  if ("end" in payload) payload.end = parsePosition(payload.end, "command.payload.end");
  if ("text" in payload && typeof payload.text !== "string") fail("command.payload.text: expected string");
  if ("style" in payload) payload.style = partial(payload.style, ["fontAssetId", "fontSize", "fontWeight", "fontStyle", "color", "letterSpacing", "stroke"], "command.payload.style");
  if ("paragraphIndex" in payload) payload.paragraphIndex = integer(payload.paragraphIndex, "command.payload.paragraphIndex");
  if ("richText" in payload) payload.richText = jsonObject(payload.richText, "command.payload.richText");
  if ("commands" in payload) payload.commands = parseNestedCommands(payload.commands, "command.payload.commands");
  if ("profile" in payload) payload.profile = jsonObject(payload.profile, "command.payload.profile");
  if ("canvases" in payload) {
    if (!Array.isArray(payload.canvases)) fail("command.payload.canvases: expected array");
    payload.canvases = payload.canvases.map((item, index) => jsonObject(item, `command.payload.canvases[${index}]`));
  }
  if ("panels" in payload) {
    if (!Array.isArray(payload.panels)) fail("command.payload.panels: expected array");
    payload.panels = payload.panels.map((item, index) => jsonObject(item, `command.payload.panels[${index}]`));
  }
  if ("panelReadingOrder" in payload) {
    if (!Array.isArray(payload.panelReadingOrder)) fail("command.payload.panelReadingOrder: expected array");
    const panelReadingOrder = payload.panelReadingOrder.map((item, index) => id(item, `command.payload.panelReadingOrder[${index}]`));
    if (new Set(panelReadingOrder).size !== panelReadingOrder.length) fail("command.payload.panelReadingOrder: duplicate id");
    payload.panelReadingOrder = panelReadingOrder;
  }
  if ("replacements" in payload) {
    if (!Array.isArray(payload.replacements)) fail("command.payload.replacements: expected array");
    payload.replacements = payload.replacements.map((item, index) => {
      const replacement = exact(item, ["canvasId", "elementId", "source", "crop"], `command.payload.replacements[${index}]`);
      replacement.canvasId = id(replacement.canvasId, `command.payload.replacements[${index}].canvasId`);
      replacement.elementId = id(replacement.elementId, `command.payload.replacements[${index}].elementId`);
      replacement.source = exact(replacement.source, ["shotId", "candidateId", "candidateLockRevisionId", "assetId", "sourceDigest"], `command.payload.replacements[${index}].source`);
      if (replacement.crop !== null) replacement.crop = exact(replacement.crop, ["zoom", "offsetX", "offsetY", "rotation", "flipX", "flipY"], `command.payload.replacements[${index}].crop`);
      return replacement;
    });
  }
  return payload;
}

export function parseEditorCommandV1(input: unknown): EditorCommandV1 {
  const row = exact(input, ["schemaVersion", "commandId", "type", "label", "payload"], "command");
  if (row.schemaVersion !== 1) fail("command.schemaVersion: expected 1");
  if (typeof row.type !== "string" || !EDITOR_COMMAND_TYPES_V1.includes(row.type as EditorCommandTypeV1)) fail("command.type: unsupported V1 command");
  const type = row.type as EditorCommandTypeV1;
  return {
    schemaVersion: 1,
    commandId: id(row.commandId, "command.commandId"),
    type,
    label: id(row.label, "command.label"),
    payload: validatePayload(type, row.payload),
  } as EditorCommandV1;
}

export function parseEditorCommandBatchV1(input: unknown): EditorCommandBatchV1 {
  const row = exact(input, ["schemaVersion", "batchId", "label", "commands"], "batch");
  if (row.schemaVersion !== 1) fail("batch.schemaVersion: expected 1");
  return {
    schemaVersion: 1,
    batchId: id(row.batchId, "batch.batchId"),
    label: id(row.label, "batch.label"),
    commands: parseNestedCommands(row.commands, "batch.commands"),
  };
}

function canvas(document: LayoutDocumentV1, canvasId: string): LayoutCanvasV1 {
  const result = document.canvases.find((item) => item.id === canvasId);
  if (!result) fail(`canvas ${canvasId} is missing`);
  return result;
}

function element(target: LayoutCanvasV1, elementId: string): LayoutTopLevelElementV1 {
  const result = target.elements.find((item) => item.id === elementId);
  if (!result) fail(`element ${elementId} is missing`);
  return result;
}

function mutableElement(target: LayoutCanvasV1, elementId: string, allowLocked = false): LayoutTopLevelElementV1 {
  const result = element(target, elementId);
  if (result.locked && !allowLocked) fail(`element ${elementId} is locked`);
  return result;
}

function panel(target: LayoutCanvasV1, elementId: string, allowLocked = false): PanelFrameElementV1 {
  const result = mutableElement(target, elementId, allowLocked);
  if (result.type !== "panel_frame") fail(`element ${elementId} is not a panel`);
  return result;
}

function textElement(target: LayoutCanvasV1, elementId: string): TextElementV1 {
  const result = mutableElement(target, elementId);
  if (result.type !== "text") fail(`element ${elementId} is not text`);
  return result;
}

function balloon(target: LayoutCanvasV1, elementId: string): BalloonElementV1 {
  const result = mutableElement(target, elementId);
  if (result.type !== "balloon") fail(`element ${elementId} is not a balloon`);
  return result;
}

function insertBefore<T extends { id: string }>(values: T[], value: T, beforeId: string | null): void {
  if (beforeId === null) { values.push(value); return; }
  const index = values.findIndex((item) => item.id === beforeId);
  if (index < 0) fail(`before target ${beforeId} is missing`);
  values.splice(index, 0, value);
}

function reorder<T extends { id: string }>(values: T[], valueId: string, beforeId: string | null): void {
  if (beforeId === valueId) return;
  const index = values.findIndex((item) => item.id === valueId);
  if (index < 0) fail(`target ${valueId} is missing`);
  const [value] = values.splice(index, 1);
  insertBefore(values, value!, beforeId);
}

function payload(command: EditorCommandV1): Record<string, any> {
  return command.payload as Record<string, any>;
}

function executePrimitive(document: LayoutDocumentV1, command: EditorCommandV1): void {
  const p = payload(command);
  switch (command.type) {
    case "canvas.add":
      insertBefore(document.canvases, structuredClone(p.canvas), p.beforeCanvasId);
      return;
    case "canvas.duplicate":
      canvas(document, p.sourceCanvasId);
      insertBefore(document.canvases, structuredClone(p.canvas), p.beforeCanvasId);
      return;
    case "canvas.delete": {
      if (document.canvases.length === 1) fail("cannot delete the last canvas");
      const index = document.canvases.findIndex((item) => item.id === p.canvasId);
      if (index < 0) fail(`canvas ${p.canvasId} is missing`);
      document.canvases.splice(index, 1);
      return;
    }
    case "canvas.reorder": reorder(document.canvases, p.canvasId, p.beforeCanvasId); return;
    case "canvas.resize": {
      const index = document.canvases.findIndex((item) => item.id === p.canvasId);
      if (index < 0) fail(`canvas ${p.canvasId} is missing`);
      if (p.canvas.id !== p.canvasId) fail("resized canvas ID must not change");
      document.canvases[index] = structuredClone(p.canvas);
      return;
    }
    case "layout.resize_profile":
      document.profile = structuredClone(p.profile);
      document.canvases = structuredClone(p.canvases);
      return;
    case "element.add": {
      const target = canvas(document, p.canvasId);
      insertBefore(target.elements, structuredClone(p.element), p.beforeElementId);
      if (p.element.type === "panel_frame") target.panelReadingOrder.push(p.element.id);
      return;
    }
    case "element.duplicate": {
      const target = canvas(document, p.canvasId);
      mutableElement(target, p.sourceElementId);
      insertBefore(target.elements, structuredClone(p.element), p.beforeElementId);
      if (p.element.type === "panel_frame") {
        const sourceOrder = target.panelReadingOrder.indexOf(p.sourceElementId);
        target.panelReadingOrder.splice(sourceOrder < 0 ? target.panelReadingOrder.length : sourceOrder + 1, 0, p.element.id);
      }
      return;
    }
    case "element.delete": {
      const target = canvas(document, p.canvasId);
      const found = mutableElement(target, p.elementId);
      target.elements.splice(target.elements.indexOf(found), 1);
      if (found.type === "panel_frame") target.panelReadingOrder = target.panelReadingOrder.filter((idValue) => idValue !== found.id);
      return;
    }
    case "element.reorder": {
      const target = canvas(document, p.canvasId);
      mutableElement(target, p.elementId);
      reorder(target.elements, p.elementId, p.beforeElementId);
      return;
    }
    case "element.set_transform": mutableElement(canvas(document, p.canvasId), p.elementId).transform = structuredClone(p.transform); return;
    case "element.set_locked": mutableElement(canvas(document, p.canvasId), p.elementId, true).locked = p.locked; return;
    case "element.set_hidden": mutableElement(canvas(document, p.canvasId), p.elementId).hidden = p.hidden; return;
    case "panel.set_shape": panel(canvas(document, p.canvasId), p.elementId).shape = structuredClone(p.shape); return;
    case "panel.set_border": panel(canvas(document, p.canvasId), p.elementId).border = structuredClone(p.border); return;
    case "panel.attach_image": {
      const target = panel(canvas(document, p.canvasId), p.elementId);
      if (target.contentImage !== null) fail(`panel ${p.elementId} already has an image`);
      target.contentImage = structuredClone(p.image);
      return;
    }
    case "panel.detach_image_to_free": {
      const target = canvas(document, p.canvasId);
      const frame = panel(target, p.elementId);
      if (frame.contentImage === null) fail(`panel ${p.elementId} has no image`);
      if (frame.contentImage.locked) fail(`image ${frame.contentImage.id} is locked`);
      frame.contentImage = null;
      insertBefore(target.elements, structuredClone(p.freeImage), p.beforeElementId);
      return;
    }
    case "image.set_display": {
      const target = mutableElement(canvas(document, p.canvasId), p.elementId);
      if (target.type !== "free_image") fail(`element ${p.elementId} is not a free image`);
      target.display = structuredClone(p.display);
      return;
    }
    case "image.set_crop": {
      const target = mutableElement(canvas(document, p.canvasId), p.elementId);
      if (target.type === "panel_frame") {
        if (!target.contentImage) fail(`panel ${p.elementId} has no image`);
        if (target.contentImage.locked) fail(`image ${target.contentImage.id} is locked`);
        target.contentImage.crop = structuredClone(p.crop);
      } else if (target.type === "free_image") {
        if (target.display.mode !== "cover") fail(`free image ${p.elementId} is not in cover mode`);
        target.display.crop = structuredClone(p.crop);
      } else fail(`element ${p.elementId} has no crop`);
      return;
    }
    case "image.replace_source": {
      const target = mutableElement(canvas(document, p.canvasId), p.elementId);
      if (target.type === "panel_frame") {
        if (!target.contentImage) fail(`panel ${p.elementId} has no image`);
        if (target.contentImage.locked) fail(`image ${target.contentImage.id} is locked`);
        target.contentImage.source = structuredClone(p.source);
        if (p.crop === null) fail("panel source replacement requires explicit crop");
        target.contentImage.crop = structuredClone(p.crop);
      } else if (target.type === "free_image") {
        target.source = structuredClone(p.source);
        if (target.display.mode === "cover") {
          if (p.crop === null) fail("cover source replacement requires explicit crop");
          target.display.crop = structuredClone(p.crop);
        } else if (p.crop !== null) fail("contain source replacement must use crop=null");
      } else fail(`element ${p.elementId} has no image source`);
      return;
    }
    case "text.replace_range": {
      const target = textElement(canvas(document, p.canvasId), p.elementId);
      target.richText = replaceRichTextRange(target.richText, { start: p.start, end: p.end, text: p.text });
      return;
    }
    case "text.apply_range_style": {
      const target = textElement(canvas(document, p.canvasId), p.elementId);
      target.richText = applyRichTextRangeStyle(target.richText, { start: p.start, end: p.end }, p.style as RichTextRunStylePatchV1);
      return;
    }
    case "text.set_paragraph_style": {
      const target = textElement(canvas(document, p.canvasId), p.elementId);
      const paragraph = target.richText.paragraphs[p.paragraphIndex];
      if (!paragraph) fail(`paragraph ${p.paragraphIndex} is missing`);
      paragraph.align = p.align;
      paragraph.lineHeight = p.lineHeight;
      return;
    }
    case "text.replace_document": textElement(canvas(document, p.canvasId), p.elementId).richText = structuredClone(p.richText); return;
    case "text.set_semantic": textElement(canvas(document, p.canvasId), p.elementId).semantic = p.semantic; return;
    case "balloon.set_kind": balloon(canvas(document, p.canvasId), p.elementId).balloonKind = p.balloonKind; return;
    case "balloon.set_visual_style": {
      const target = balloon(canvas(document, p.canvasId), p.elementId);
      target.fillColor = p.fillColor; target.strokeColor = p.strokeColor; target.strokeWidth = p.strokeWidth;
      target.padding = structuredClone(p.padding); target.verticalAlign = p.verticalAlign;
      return;
    }
    case "balloon.set_tail": balloon(canvas(document, p.canvasId), p.elementId).tail = structuredClone(p.tail); return;
    case "balloon.set_source_refs": {
      const target = balloon(canvas(document, p.canvasId), p.elementId);
      target.sourceShotId = p.sourceShotId; target.speakerCharacterId = p.speakerCharacterId;
      return;
    }
    case "balloon.replace_text_document": balloon(canvas(document, p.canvasId), p.elementId).richText = structuredClone(p.richText); return;
    case "layout.apply_preset": {
      const target = canvas(document, p.canvasId);
      const occupiedImageIds = target.elements.flatMap((item) => item.type === "panel_frame" && item.contentImage ? [item.contentImage.id] : []);
      const nextImageIds = (p.panels as Array<Record<string, any>>).flatMap((item) => item.contentImage ? [item.contentImage.id] : []);
      if (p.panels.length < occupiedImageIds.length) fail("preset has fewer panels than occupied panels");
      if (occupiedImageIds.some((imageId) => !nextImageIds.includes(imageId))) fail("preset must explicitly preserve every occupied panel image");
      const firstPanelIndex = target.elements.findIndex((item) => item.type === "panel_frame");
      const nonPanels = target.elements.filter((item) => item.type !== "panel_frame");
      const insertion = firstPanelIndex < 0 ? 0 : target.elements.slice(0, firstPanelIndex).filter((item) => item.type !== "panel_frame").length;
      nonPanels.splice(insertion, 0, ...structuredClone(p.panels));
      target.elements = nonPanels;
      target.panelReadingOrder = structuredClone(p.panelReadingOrder);
      return;
    }
    case "layout.replace_sources": {
      if (p.replacements.length < 1 || p.replacements.length > 5_000) fail("source replacements must contain 1..5000 entries");
      for (const replacementValue of p.replacements) {
        const replacement = exact(replacementValue, ["canvasId", "elementId", "source", "crop"], "replacement");
        executePrimitive(document, parseEditorCommandV1({
          schemaVersion: 1,
          commandId: `${command.commandId}:${id(replacement.elementId, "replacement.elementId")}`,
          type: "image.replace_source",
          label: command.label,
          payload: replacement,
        }));
      }
      return;
    }
    case "batch.transform": case "batch.align": case "batch.distribute": case "batch.reorder":
    case "batch.set_locked": case "batch.set_hidden": case "batch.delete":
      for (const child of p.commands as EditorCommandV1[]) executePrimitive(document, child);
      return;
  }
}

function elementMap(document: LayoutDocumentV1): Map<string, string> {
  const result = new Map<string, string>();
  for (const target of document.canvases) {
    for (const item of target.elements) result.set(item.id, canonicalizeJson(item));
  }
  return result;
}

function changedIds(before: LayoutDocumentV1, after: LayoutDocumentV1): string[] {
  const left = elementMap(before);
  const right = elementMap(after);
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((item) => left.get(item) !== right.get(item))
    .sort();
}

function scopes(type: EditorCommandTypeV1 | "layout.restore_snapshot"): LayoutPreflightScopeV1[] {
  if (type === "layout.restore_snapshot" || type.startsWith("canvas.") || type === "layout.resize_profile" || type === "layout.apply_preset") return ["document", "geometry", "layers", "sources", "text", "fonts"];
  if (type.startsWith("text.") || type.startsWith("balloon.")) return ["text", "fonts", "geometry"];
  if (type.startsWith("image.") || type === "panel.attach_image" || type === "panel.detach_image_to_free" || type === "layout.replace_sources") return ["sources", "geometry"];
  if (type === "element.reorder") return ["layers"];
  if (type.startsWith("batch.")) return ["document", "geometry", "layers", "sources", "text"];
  return ["geometry"];
}

function inverse(before: LayoutDocumentV1, commandId: string, label: string): LayoutInverseCommandV1 {
  return {
    schemaVersion: 1,
    commandId: `inverse:${commandId}`,
    type: "layout.restore_snapshot",
    label: `Undo ${label}`,
    payload: { document: structuredClone(before) },
  };
}

export function applyLayoutCommand(
  input: LayoutDocumentV1,
  commandInput: ApplicableLayoutCommandV1,
): ApplyLayoutCommandResultV1 {
  const before = LayoutDocumentCodecV1.parseAndNormalize(input);
  if (commandInput.type === "layout.restore_snapshot") {
    const row = exact(commandInput, ["schemaVersion", "commandId", "type", "label", "payload"], "inverse");
    if (row.schemaVersion !== 1) fail("inverse.schemaVersion: expected 1");
    const payloadRow = exact(row.payload, ["document"], "inverse.payload");
    const restored = LayoutDocumentCodecV1.parseAndNormalize(payloadRow.document);
    return {
      document: restored,
      inverse: inverse(before, id(row.commandId, "inverse.commandId"), id(row.label, "inverse.label")),
      changedElementIds: changedIds(before, restored),
      invalidatedPreflightScopes: scopes("layout.restore_snapshot"),
    };
  }
  const command = parseEditorCommandV1(commandInput);
  const draft = structuredClone(before);
  executePrimitive(draft, command);
  let after: LayoutDocumentV1;
  try { after = LayoutDocumentCodecV1.parseAndNormalize(draft); } catch (error) {
    fail(error instanceof Error ? error.message : "command produced an invalid document");
  }
  return {
    document: after,
    inverse: inverse(before, command.commandId, command.label),
    changedElementIds: changedIds(before, after),
    invalidatedPreflightScopes: scopes(command.type),
  };
}

export function applyLayoutCommandBatch(
  input: LayoutDocumentV1,
  batchInput: EditorCommandBatchV1,
): ApplyLayoutCommandResultV1 {
  const batch = parseEditorCommandBatchV1(batchInput);
  const before = LayoutDocumentCodecV1.parseAndNormalize(input);
  let current = before;
  const scopeSet = new Set<LayoutPreflightScopeV1>();
  for (const command of batch.commands) {
    const result = applyLayoutCommand(current, command);
    current = result.document;
    result.invalidatedPreflightScopes.forEach((scope) => scopeSet.add(scope));
  }
  return {
    document: current,
    inverse: inverse(before, batch.batchId, batch.label),
    changedElementIds: changedIds(before, current),
    invalidatedPreflightScopes: [...scopeSet],
  };
}

export const LAYOUT_HISTORY_MAX_BATCHES = 200;
export const LAYOUT_HISTORY_MAX_BYTES = 50 * 1024 * 1024;

export interface LayoutCommandHistoryEntryV1 {
  batchId: string;
  label: string;
  inverse: LayoutInverseCommandV1;
  forward: EditorCommandV1 | EditorCommandBatchV1;
}

export interface StoredLayoutCommandHistoryEntryV1 extends LayoutCommandHistoryEntryV1 {
  byteSize: number;
}

export interface LayoutCommandHistoryV1 {
  undo: StoredLayoutCommandHistoryEntryV1[];
  redo: StoredLayoutCommandHistoryEntryV1[];
  bytes: number;
}

export function createLayoutCommandHistory(): LayoutCommandHistoryV1 {
  return { undo: [], redo: [], bytes: 0 };
}

export function pushLayoutCommandHistory(
  history: LayoutCommandHistoryV1,
  entry: LayoutCommandHistoryEntryV1,
): LayoutCommandHistoryV1 {
  const value: LayoutCommandHistoryEntryV1 = {
    batchId: id(entry.batchId, "history.batchId"),
    label: id(entry.label, "history.label"),
    inverse: structuredClone(entry.inverse),
    forward: structuredClone(entry.forward),
  };
  const normalized: StoredLayoutCommandHistoryEntryV1 = { ...value, byteSize: canonicalJsonBytes(value).length };
  const undo = [...history.undo, normalized];
  let bytes = history.bytes + normalized.byteSize;
  while (undo.length > LAYOUT_HISTORY_MAX_BATCHES || bytes > LAYOUT_HISTORY_MAX_BYTES) {
    bytes -= undo.shift()!.byteSize;
  }
  return { undo, redo: [], bytes };
}

export type { CandidateImageSourceV1, CoverCropV1, FreeImageElementV1, LayoutPublicationProfileV1, PanelImageElementV1, RichTextDocumentV1, RichTextRangeV1 };
