import { digestCanonicalJson } from "../versioning/canonical-json.js";
import {
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
} from "./automation.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  applyLayoutCommandBatchV2,
  type EditorCommandBatchV2,
  type EditorCommandV2,
} from "./commands-v2.js";
import { projectLayoutSourceBindings } from "./digest.js";
import type {
  CandidateImageSourceV1,
  CoverCropV1,
  LayoutDigest,
  LayoutDocumentV1,
} from "./document.js";
import { evaluateCoverCropV1, normalizeLayoutNumber } from "./geometry.js";
import type { LayoutSourceCatalogItemV1 } from "./working-copy.js";
import type { LayoutWorkingCopyResponseV1 } from "./working-copy.js";

export type LayoutSourceReplacementCropModeV1 =
  | "preserve_normalized_crop"
  | "reset_cover";

export interface LayoutSourceReplacementSelectionV1 {
  imageElementId: string;
  cropMode: LayoutSourceReplacementCropModeV1;
}

export interface PreviewLayoutSourceReplacementRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: LayoutDigest;
  replacements: LayoutSourceReplacementSelectionV1[];
}

export interface CommitLayoutSourceReplacementRequestV1 extends PreviewLayoutSourceReplacementRequestV1 {
  replacementDigest: LayoutDigest;
  resultDocumentDigest: LayoutDigest;
}

export interface PreviewLayoutSourceReplacementRequestV2 {
  schemaVersion: 2;
  expectedWorkingCopyRowVersion: number;
  expectedRevisionDocumentDigest: LayoutDigest;
  expectedVisibleDocumentDigest: LayoutDigest;
  replacements: LayoutSourceReplacementSelectionV1[];
}

export interface CommitLayoutSourceReplacementRequestV2 extends PreviewLayoutSourceReplacementRequestV2 {
  replacementDigest: LayoutDigest;
  resultRevisionDocumentDigest: LayoutDigest;
  resultVisibleDocumentDigest: LayoutDigest;
}

export interface LayoutSourceReplacementPreviewItemV1 {
  imageElementId: string;
  from: CandidateImageSourceV1;
  to: CandidateImageSourceV1;
  cropMode: LayoutSourceReplacementCropModeV1;
  resultCrop: CoverCropV1 | null;
  cropCompatibility: "compatible" | "review_required";
  warningCodes: string[];
}

export interface LayoutSourceReplacementPreviewV1 {
  schemaVersion: 1;
  policyVersion: "layout_source_replace_v1";
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: LayoutDigest;
  replacementDigest: LayoutDigest;
  resultDocumentDigest: LayoutDigest;
  items: LayoutSourceReplacementPreviewItemV1[];
}

export interface BuiltLayoutSourceReplacementPreviewV1 extends LayoutSourceReplacementPreviewV1 {
  resultDocument: LayoutDocumentV1;
}

export interface LayoutSourceReplacementPreviewItemV2 extends LayoutSourceReplacementPreviewItemV1 {
  canvasId: string;
  commandElementId: string;
  selectionOrigin: "requested" | "same_shot_expansion";
}

export interface LayoutSourceReplacementPreviewV2 {
  schemaVersion: 2;
  policyVersion: "layout_source_replace_v2";
  expectedWorkingCopyRowVersion: number;
  expectedRevisionDocumentDigest: LayoutDigest;
  expectedVisibleDocumentDigest: LayoutDigest;
  replacementDigest: LayoutDigest;
  resultRevisionDocumentDigest: LayoutDigest;
  resultVisibleDocumentDigest: LayoutDigest;
  items: LayoutSourceReplacementPreviewItemV2[];
  commandBatch: EditorCommandBatchV2;
}

export interface BuiltLayoutSourceReplacementPreviewV2 extends LayoutSourceReplacementPreviewV2 {
  resultDocument: LayoutDocumentV2;
}

export interface CommitLayoutSourceReplacementResponseV1 {
  schemaVersion: 1;
  result: "updated" | "replayed";
  replacementDigest: LayoutDigest;
  resultDocumentDigest: LayoutDigest;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export interface CommitLayoutSourceReplacementResponseV2 {
  schemaVersion: 2;
  result: "updated" | "replayed";
  replacementDigest: LayoutDigest;
  resultRevisionDocumentDigest: LayoutDigest;
  resultVisibleDocumentDigest: LayoutDigest;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export class LayoutSourceReplacementContractError extends Error {
  readonly code = "LAYOUT_SOURCE_REPLACEMENT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutSourceReplacementContractError";
  }
}

function fail(path: string, message: string): never {
  throw new LayoutSourceReplacementContractError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) fail(`${path}.${key}`, "unknown field");
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}`, "missing required field");
  return row;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value || value.includes("\0")) {
    fail(path, "expected non-empty ID");
  }
  return value;
}

function digest(value: unknown, path: string): LayoutDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(path, "expected sha256 digest");
  return value as LayoutDigest;
}

function rowVersion(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(path, "expected non-negative integer");
  return value as number;
}

function parseSelections(value: unknown): LayoutSourceReplacementSelectionV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5_000) {
    fail("request.replacements", "expected 1..5000 entries");
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const row = exact(entry, ["imageElementId", "cropMode"], `request.replacements[${index}]`);
    const imageElementId = id(row.imageElementId, `request.replacements[${index}].imageElementId`);
    if (seen.has(imageElementId)) fail(`request.replacements[${index}].imageElementId`, "duplicate imageElementId");
    seen.add(imageElementId);
    if (row.cropMode !== "preserve_normalized_crop" && row.cropMode !== "reset_cover") {
      fail(`request.replacements[${index}].cropMode`, "unsupported crop mode");
    }
    return { imageElementId, cropMode: row.cropMode };
  });
}

export function parsePreviewLayoutSourceReplacementRequestV1(
  input: unknown,
): PreviewLayoutSourceReplacementRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedDocumentDigest",
    "replacements",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  return {
    schemaVersion: 1,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedDocumentDigest: digest(row.expectedDocumentDigest, "request.expectedDocumentDigest"),
    replacements: parseSelections(row.replacements),
  };
}

export function parseCommitLayoutSourceReplacementRequestV1(
  input: unknown,
): CommitLayoutSourceReplacementRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedDocumentDigest",
    "replacements",
    "replacementDigest",
    "resultDocumentDigest",
  ], "request");
  const preview = parsePreviewLayoutSourceReplacementRequestV1({
    schemaVersion: row.schemaVersion,
    expectedWorkingCopyRowVersion: row.expectedWorkingCopyRowVersion,
    expectedDocumentDigest: row.expectedDocumentDigest,
    replacements: row.replacements,
  });
  return {
    ...preview,
    replacementDigest: digest(row.replacementDigest, "request.replacementDigest"),
    resultDocumentDigest: digest(row.resultDocumentDigest, "request.resultDocumentDigest"),
  };
}

export function parsePreviewLayoutSourceReplacementRequestV2(
  input: unknown,
): PreviewLayoutSourceReplacementRequestV2 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedRevisionDocumentDigest",
    "expectedVisibleDocumentDigest",
    "replacements",
  ], "request");
  if (row.schemaVersion !== 2) fail("request.schemaVersion", "expected 2");
  return {
    schemaVersion: 2,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedRevisionDocumentDigest: digest(
      row.expectedRevisionDocumentDigest,
      "request.expectedRevisionDocumentDigest",
    ),
    expectedVisibleDocumentDigest: digest(
      row.expectedVisibleDocumentDigest,
      "request.expectedVisibleDocumentDigest",
    ),
    replacements: parseSelections(row.replacements),
  };
}

export function parseCommitLayoutSourceReplacementRequestV2(
  input: unknown,
): CommitLayoutSourceReplacementRequestV2 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedRevisionDocumentDigest",
    "expectedVisibleDocumentDigest",
    "replacements",
    "replacementDigest",
    "resultRevisionDocumentDigest",
    "resultVisibleDocumentDigest",
  ], "request");
  const preview = parsePreviewLayoutSourceReplacementRequestV2({
    schemaVersion: row.schemaVersion,
    expectedWorkingCopyRowVersion: row.expectedWorkingCopyRowVersion,
    expectedRevisionDocumentDigest: row.expectedRevisionDocumentDigest,
    expectedVisibleDocumentDigest: row.expectedVisibleDocumentDigest,
    replacements: row.replacements,
  });
  return {
    ...preview,
    replacementDigest: digest(row.replacementDigest, "request.replacementDigest"),
    resultRevisionDocumentDigest: digest(
      row.resultRevisionDocumentDigest,
      "request.resultRevisionDocumentDigest",
    ),
    resultVisibleDocumentDigest: digest(
      row.resultVisibleDocumentDigest,
      "request.resultVisibleDocumentDigest",
    ),
  };
}

export function parsePreviewLayoutSourceReplacementRequestV1OrV2(
  input: unknown,
): PreviewLayoutSourceReplacementRequestV1 | PreviewLayoutSourceReplacementRequestV2 {
  return record(input, "request").schemaVersion === 2
    ? parsePreviewLayoutSourceReplacementRequestV2(input)
    : parsePreviewLayoutSourceReplacementRequestV1(input);
}

export function parseCommitLayoutSourceReplacementRequestV1OrV2(
  input: unknown,
): CommitLayoutSourceReplacementRequestV1 | CommitLayoutSourceReplacementRequestV2 {
  return record(input, "request").schemaVersion === 2
    ? parseCommitLayoutSourceReplacementRequestV2(input)
    : parseCommitLayoutSourceReplacementRequestV1(input);
}

interface LocatedImage {
  canvasId: string;
  commandElementId: string;
  source: CandidateImageSourceV1;
  crop: CoverCropV1 | null;
  frame: { width: number; height: number };
  set(source: CandidateImageSourceV1, crop: CoverCropV1 | null): void;
}

function locateImage(document: LayoutDocumentV1, imageElementId: string): LocatedImage {
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type === "panel_frame" && element.contentImage?.id === imageElementId) {
        if (element.locked || element.contentImage.locked) fail("request.replacements", `image ${imageElementId} is locked`);
        return {
          canvasId: canvas.id,
          commandElementId: element.id,
          source: element.contentImage.source,
          crop: element.contentImage.crop,
          frame: { width: element.transform.width, height: element.transform.height },
          set(source, crop) {
            element.contentImage!.source = structuredClone(source);
            if (!crop) fail("replacement.resultCrop", "panel replacement requires crop");
            element.contentImage!.crop = structuredClone(crop);
          },
        };
      }
      if (element.type === "free_image" && element.id === imageElementId) {
        if (element.locked) fail("request.replacements", `image ${imageElementId} is locked`);
        return {
          canvasId: canvas.id,
          commandElementId: element.id,
          source: element.source,
          crop: element.display.mode === "cover" ? element.display.crop : null,
          frame: { width: element.transform.width, height: element.transform.height },
          set(source, crop) {
            element.source = structuredClone(source);
            if (element.display.mode === "cover") {
              if (!crop) fail("replacement.resultCrop", "cover replacement requires crop");
              element.display.crop = structuredClone(crop);
            } else if (crop) fail("replacement.resultCrop", "contain replacement must not contain crop");
          },
        };
      }
    }
  }
  fail("request.replacements", `image ${imageElementId} is missing`);
}

function resetCrop(): CoverCropV1 {
  return { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
}

function migratedCrop(
  located: LocatedImage,
  target: LayoutSourceCatalogItemV1,
  mode: LayoutSourceReplacementCropModeV1,
  previousDimensions: { width: number; height: number } | undefined,
): { crop: CoverCropV1 | null; compatibility: "compatible" | "review_required"; warnings: string[] } {
  if (!located.crop) return { crop: null, compatibility: "compatible", warnings: [] };
  if (mode === "reset_cover") return { crop: resetCrop(), compatibility: "compatible", warnings: [] };
  const crop = structuredClone(located.crop);
  const evaluation = evaluateCoverCropV1({
    sourceWidth: target.width,
    sourceHeight: target.height,
    frameWidth: located.frame.width,
    frameHeight: located.frame.height,
    crop,
  });
  const warnings: string[] = [];
  if (!evaluation.covered) {
    crop.zoom = normalizeLayoutNumber(Math.max(
      crop.zoom,
      evaluation.requiredScaleWithOffset / evaluation.baseScale + 0.001,
    ));
    warnings.push("CROP_ZOOM_ADJUSTED");
  }
  const previousRatio = previousDimensions ? previousDimensions.width / previousDimensions.height : null;
  const targetRatio = target.width / target.height;
  const review = warnings.length > 0 || previousRatio === null || Math.abs(previousRatio - targetRatio) > 0.001;
  if (review) warnings.push("CROP_REVIEW_RECOMMENDED");
  return {
    crop,
    compatibility: review ? "review_required" : "compatible",
    warnings: [...new Set(warnings)],
  };
}

export function buildLayoutSourceReplacementPreviewV1(input: {
  document: LayoutDocumentV1;
  request: PreviewLayoutSourceReplacementRequestV1;
  currentSources: readonly LayoutSourceCatalogItemV1[];
  sourceDimensions: Readonly<Record<string, { width: number; height: number }>>;
}): BuiltLayoutSourceReplacementPreviewV1 {
  const encoded = LayoutDocumentCodecV1.encode(input.document);
  if (encoded.digest !== input.request.expectedDocumentDigest) {
    fail("request.expectedDocumentDigest", "does not match document");
  }
  const resultDocument = structuredClone(encoded.value);
  const targetByShot = new Map(input.currentSources.map((item) => [item.source.shotId, item]));
  const items: LayoutSourceReplacementPreviewItemV1[] = [];
  for (const selection of input.request.replacements) {
    const located = locateImage(resultDocument, selection.imageElementId);
    const target = targetByShot.get(located.source.shotId);
    if (!target) fail("currentSources", `shot ${located.source.shotId} has no current source`);
    const migrated = migratedCrop(
      located,
      target,
      selection.cropMode,
      input.sourceDimensions[located.source.assetId],
    );
    const from = structuredClone(located.source);
    located.set(target.source, migrated.crop);
    items.push({
      imageElementId: selection.imageElementId,
      from,
      to: structuredClone(target.source),
      cropMode: selection.cropMode,
      resultCrop: migrated.crop,
      cropCompatibility: migrated.compatibility,
      warningCodes: migrated.warnings,
    });
  }
  const result = LayoutDocumentCodecV1.encode(resultDocument);
  const replacementDigest = digestCanonicalJson({
    schemaVersion: 1,
    policyVersion: "layout_source_replace_v1",
    expectedWorkingCopyRowVersion: input.request.expectedWorkingCopyRowVersion,
    expectedDocumentDigest: input.request.expectedDocumentDigest,
    resultDocumentDigest: result.digest,
    items,
  });
  return {
    schemaVersion: 1,
    policyVersion: "layout_source_replace_v1",
    expectedWorkingCopyRowVersion: input.request.expectedWorkingCopyRowVersion,
    expectedDocumentDigest: input.request.expectedDocumentDigest,
    replacementDigest,
    resultDocumentDigest: result.digest,
    items,
    resultDocument: result.value,
  };
}

function shortDigestId(prefix: string, value: unknown): string {
  return `${prefix}_${digestCanonicalJson(value).slice(7, 31)}`;
}

export function buildLayoutSourceReplacementPreviewV2(input: {
  document: LayoutDocumentV2;
  request: PreviewLayoutSourceReplacementRequestV2;
  currentSources: readonly LayoutSourceCatalogItemV1[];
  sourceDimensions: Readonly<Record<string, { width: number; height: number }>>;
}): BuiltLayoutSourceReplacementPreviewV2 {
  const revision = LayoutDocumentCodecV2.encode(input.document);
  if (revision.digest !== input.request.expectedRevisionDocumentDigest) {
    fail("request.expectedRevisionDocumentDigest", "does not match document");
  }
  const visible = projectLayoutDocumentV2ToV1(revision.value);
  const visibleEncoded = LayoutDocumentCodecV1.encode(visible);
  if (visibleEncoded.digest !== input.request.expectedVisibleDocumentDigest) {
    fail("request.expectedVisibleDocumentDigest", "does not match the V2 visible projection");
  }

  const selectedElementIds = new Set(input.request.replacements.map((entry) => entry.imageElementId));
  const cropModeByShot = new Map<string, LayoutSourceReplacementCropModeV1>();
  for (const selection of input.request.replacements) {
    const located = locateImage(structuredClone(visible), selection.imageElementId);
    const previous = cropModeByShot.get(located.source.shotId);
    if (previous !== undefined && previous !== selection.cropMode) {
      fail("request.replacements", `same shot ${located.source.shotId} must use one crop mode`);
    }
    cropModeByShot.set(located.source.shotId, selection.cropMode);
  }

  const expandedSelections = projectLayoutSourceBindings(visible)
    .filter((binding) => cropModeByShot.has(binding.shotId))
    .map((binding) => ({
      imageElementId: binding.elementId,
      cropMode: cropModeByShot.get(binding.shotId)!,
    }));
  if (expandedSelections.length === 0) fail("request.replacements", "selected shots have no image appearances");

  const visiblePreview = buildLayoutSourceReplacementPreviewV1({
    document: visible,
    request: {
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: input.request.expectedWorkingCopyRowVersion,
      expectedDocumentDigest: visibleEncoded.digest,
      replacements: expandedSelections,
    },
    currentSources: input.currentSources,
    sourceDimensions: input.sourceDimensions,
  });
  const items = visiblePreview.items.map((item): LayoutSourceReplacementPreviewItemV2 => {
    const located = locateImage(structuredClone(visible), item.imageElementId);
    return {
      ...item,
      canvasId: located.canvasId,
      commandElementId: located.commandElementId,
      selectionOrigin: selectedElementIds.has(item.imageElementId)
        ? "requested"
        : "same_shot_expansion",
    };
  });

  const identity = {
    policyVersion: "layout_source_replace_v2",
    expectedWorkingCopyRowVersion: input.request.expectedWorkingCopyRowVersion,
    expectedRevisionDocumentDigest: input.request.expectedRevisionDocumentDigest,
    expectedVisibleDocumentDigest: input.request.expectedVisibleDocumentDigest,
    items,
  };
  const command: EditorCommandV2<"layout.replace_sources"> = {
    schemaVersion: 2,
    commandId: shortDigestId("command", identity),
    type: "layout.replace_sources",
    label: "替换镜头来源",
    actor: "user",
    payload: {
      replacements: items.map((item) => ({
        canvasId: item.canvasId,
        elementId: item.commandElementId,
        source: structuredClone(item.to),
        crop: structuredClone(item.resultCrop),
      })),
    },
  };
  const commandBatch: EditorCommandBatchV2 = {
    schemaVersion: 2,
    batchId: shortDigestId("batch", { ...identity, command }),
    label: "替换镜头来源",
    commands: [command],
  };
  const applied = applyLayoutCommandBatchV2(revision.value, commandBatch);
  const resultRevision = LayoutDocumentCodecV2.encode(applied.document);
  const resultVisible = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(resultRevision.value));
  if (resultVisible.digest !== visiblePreview.resultDocumentDigest) {
    fail("resultDocument", "V2 command projection does not match the deterministic V1 replacement preview");
  }
  const replacementDigest = digestCanonicalJson({
    ...identity,
    commandBatch,
    resultRevisionDocumentDigest: resultRevision.digest,
    resultVisibleDocumentDigest: resultVisible.digest,
  });
  return {
    schemaVersion: 2,
    policyVersion: "layout_source_replace_v2",
    expectedWorkingCopyRowVersion: input.request.expectedWorkingCopyRowVersion,
    expectedRevisionDocumentDigest: input.request.expectedRevisionDocumentDigest,
    expectedVisibleDocumentDigest: input.request.expectedVisibleDocumentDigest,
    replacementDigest,
    resultRevisionDocumentDigest: resultRevision.digest,
    resultVisibleDocumentDigest: resultVisible.digest,
    items,
    commandBatch,
    resultDocument: resultRevision.value,
  };
}
