import {
  canonicalJsonBytes,
  canonicalizeJson,
  parseStrictJson,
  sha256Bytes,
} from "../versioning/canonical-json.js";
import {
  buildTaskSourceProjection,
  type TaskSourceProjectionV1,
} from "../versioning/task-source-projection.js";
import type {
  EncodedLayoutValue,
  LayoutCanvasV1,
  LayoutDigest,
  LayoutPublicationProfileV1,
} from "./document.js";

export const LAYOUT_PUBLICATION_SOURCE_POLICY_V1 =
  "layout-publication-source-v1" as const;
export const LAYOUT_PUBLICATION_SOURCE_POLICY_V2 =
  "layout-publication-source-v2" as const;
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
} from "./automation.js";
import type { GenerationTaskItem } from "../dto.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label}: expected object`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const row = record(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(`${label}.${key}: unknown field`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) throw new Error(`${label}.${key}: missing required field`);
  return row;
}

function encode(value: LayoutPublicationProfileV1): EncodedLayoutValue<LayoutPublicationProfileV1> {
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 1, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export function parseLayoutPublicationProfileV1(input: unknown): LayoutPublicationProfileV1 {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  const base = record(value, "profile");
  if (base.kind === "paged_publication") {
    const row = exact(base, ["schemaVersion", "kind", "outputScale", "includePdf", "pdfPixelDpi"], "profile");
    if (row.schemaVersion !== 1 || (row.outputScale !== 1 && row.outputScale !== 2) || typeof row.includePdf !== "boolean" || row.pdfPixelDpi !== 96) {
      throw new Error("profile: invalid paged publication profile");
    }
    return { schemaVersion: 1, kind: "paged_publication", outputScale: row.outputScale, includePdf: row.includePdf, pdfPixelDpi: 96 };
  }
  if (base.kind === "vertical_publication") {
    const row = exact(base, ["schemaVersion", "kind", "outputScale", "maxSliceHeightPx", "cutPolicy", "includeLongPng"], "profile");
    if (row.schemaVersion !== 1 || (row.outputScale !== 1 && row.outputScale !== 2)
      || typeof row.maxSliceHeightPx !== "number" || !Number.isInteger(row.maxSliceHeightPx)
      || row.maxSliceHeightPx < 2048 || row.maxSliceHeightPx > 8192
      || row.cutPolicy !== "prefer_section_boundary_then_exact" || typeof row.includeLongPng !== "boolean") {
      throw new Error("profile: invalid vertical publication profile");
    }
    return {
      schemaVersion: 1,
      kind: "vertical_publication",
      outputScale: row.outputScale,
      maxSliceHeightPx: row.maxSliceHeightPx,
      cutPolicy: "prefer_section_boundary_then_exact",
      includeLongPng: row.includeLongPng,
    };
  }
  throw new Error("profile.kind: invalid publication kind");
}

export const LayoutPublicationProfileCodecV1 = {
  schemaVersion: 1 as const,
  parse: parseLayoutPublicationProfileV1,
  encode(input: unknown): EncodedLayoutValue<LayoutPublicationProfileV1> {
    return encode(parseLayoutPublicationProfileV1(input));
  },
};

export interface RenderImageAssetV1 {
  assetId: string;
  role: "candidate_image";
  mimeType: string;
  sha256: LayoutDigest;
  bytes: number;
  width: number;
  height: number;
}

export interface RenderFontAssetV1 {
  assetId: string;
  role: "font";
  mimeType: string;
  sha256: LayoutDigest;
  bytes: number;
  metadataDigest: LayoutDigest;
}

export interface RenderAssetManifestV1 {
  schemaVersion: 1;
  images: RenderImageAssetV1[];
  fonts: RenderFontAssetV1[];
}

export interface RenderCanvasPlanV1 {
  canvasId: string;
  order: number;
  width: number;
  height: number;
  canvas: LayoutCanvasV1;
}

export interface RenderPlanDiagnosticV1 {
  code: string;
  canvasId: string | null;
  elementId: string | null;
}

export interface RenderPlanV1 {
  schemaVersion: 1;
  documentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  profileDigest: LayoutDigest;
  rendererPolicyVersion: "layout_render_policy_v1";
  canvases: RenderCanvasPlanV1[];
  assets: RenderAssetManifestV1;
  diagnostics: RenderPlanDiagnosticV1[];
  renderPlanDigest: LayoutDigest;
}

export interface RenderPlanV2 {
  schemaVersion: 2;
  kind: "layout_render_plan_v2";
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  profileDigest: LayoutDigest;
  rendererPolicyVersion: "layout_render_policy_v1";
  canvases: RenderCanvasPlanV1[];
  assets: RenderAssetManifestV1;
  diagnostics: RenderPlanDiagnosticV1[];
  renderPlanDigest: LayoutDigest;
}

export interface LayoutRendererIdentityV1 {
  rendererId: "airoaming_layout_renderer";
  rendererVersion: string;
  rendererPolicyVersion: "layout_render_policy_v1";
  geometryPolicyVersion: "layout_geometry_v1";
  textPolicyVersion: "layout_text_v1";
  balloonPolicyVersion: "balloon_shape_v1";
  rasterEngine: "chromium" | "resvg" | "other_approved";
  rasterEngineVersion: string;
  buildDigest: LayoutDigest;
}

export interface LayoutRendererCapabilitiesV1 {
  maxCanvasWidthPx: number;
  maxCanvasHeightPx: number;
  maxRasterPixels: number;
  maxPdfPages: number;
  maxLongPngHeightPx: number;
  supportsPagedPdf: boolean;
  supportsLongPng: boolean;
  supportedImageMimeTypes: string[];
  supportedFontMimeTypes: string[];
}

export interface VerticalSlicePlanV1 {
  order: number;
  startY: number;
  endY: number;
  height: number;
  crossesContent: boolean;
}

export interface CreateLayoutPublicationRequestV1 {
  schemaVersion: 1;
  requestId: string;
  layoutRevisionId: string;
  expectedCurrentLayoutRevisionId: string;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  preflightDigest: LayoutDigest;
  acknowledgedIssueKeys: string[];
}

export interface CreateLayoutPublicationRequestV2 {
  schemaVersion: 2;
  requestId: string;
  layoutRevisionId: string;
  expectedCurrentLayoutRevisionId: string;
  expectedRevisionDocumentDigest: LayoutDigest;
  expectedVisibleDocumentDigest: LayoutDigest;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  preflightDigest: LayoutDigest;
  acknowledgedIssueKeys: string[];
}

export type CreateLayoutPublicationRequestV1OrV2 =
  | CreateLayoutPublicationRequestV1
  | CreateLayoutPublicationRequestV2;

export interface LayoutPublicationArtifactV1 {
  assetId: string;
  role: PublicationOutputRoleV1 | "publication_manifest";
  order: number;
  storageKey: string;
  mimeType: string;
  sha256: LayoutDigest | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  status: string;
}

export interface LayoutPublicationSummaryV1 {
  schemaVersion: 1;
  id: string;
  projectId: string;
  chapterId: string;
  revision: number;
  status: "queued" | "rendering" | "ready" | "failed" | "cancelled";
  taskId: string;
  layoutRevisionId: string;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  preflightDigest: LayoutDigest;
  rendererVersion: string;
  manifest: PublicationManifestV1 | null;
  manifestDigest: LayoutDigest | null;
  completionApplicability: "current" | "historical" | null;
  revisionPosition: "current" | "historical";
  artifacts: LayoutPublicationArtifactV1[];
  createdAt: string;
  readyAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
}

export interface LayoutPublicationSummaryV2 {
  schemaVersion: 2;
  documentSchemaVersion: 2;
  id: string;
  projectId: string;
  chapterId: string;
  revision: number;
  status: "queued" | "rendering" | "ready" | "failed" | "cancelled";
  taskId: string;
  layoutRevisionId: string;
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  preflightDigest: LayoutDigest;
  rendererVersion: string;
  manifest: PublicationManifestV2 | null;
  manifestDigest: LayoutDigest | null;
  completionApplicability: "current" | "historical" | null;
  revisionPosition: "current" | "historical";
  artifacts: LayoutPublicationArtifactV1[];
  createdAt: string;
  readyAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
}

export interface CreateLayoutPublicationResponseV1 {
  schemaVersion: 1;
  result: "created" | "replayed";
  exportRevision: LayoutPublicationSummaryV1;
  task: GenerationTaskItem;
}

export interface CreateLayoutPublicationResponseV2 {
  schemaVersion: 2;
  result: "created" | "replayed";
  exportRevision: LayoutPublicationSummaryV2;
  task: GenerationTaskItem;
}

export interface LayoutPublicationHistoryResponseV1 {
  schemaVersion: 1;
  currentExportRevisionId: string | null;
  items: LayoutPublicationSummaryV1[];
}

export interface LayoutPublicationHistoryResponseV2 {
  schemaVersion: 2;
  currentExportRevisionId: string | null;
  items: Array<
    | (LayoutPublicationSummaryV1 & { documentSchemaVersion: 1 })
    | LayoutPublicationSummaryV2
  >;
}

export interface PublicationInputAssetV1 {
  assetId: string;
  role: "candidate_image" | "font";
  sha256: LayoutDigest;
  mimeType: string;
}

export type PublicationOutputRoleV1 = "page_png" | "strip_slice_png" | "document_pdf" | "long_png";

export interface PublicationOutputArtifactV1 {
  assetId: string;
  role: PublicationOutputRoleV1;
  order: number;
  storageKey: string;
  mimeType: string;
  sha256: LayoutDigest;
  bytes: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
}

export interface PublicationManifestV1 {
  schemaVersion: 1;
  kind: "layout_publication_manifest_v1";
  projectId: string;
  chapterId: string;
  exportRevisionId: string;
  exportRevision: number;
  layoutRevisionId: string;
  layoutRevision: number;
  documentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  renderer: LayoutRendererIdentityV1;
  inputs: { images: PublicationInputAssetV1[]; fonts: PublicationInputAssetV1[] };
  outputs: PublicationOutputArtifactV1[];
}

export interface PublicationManifestV2 {
  schemaVersion: 2;
  kind: "layout_publication_manifest_v2";
  projectId: string;
  chapterId: string;
  exportRevisionId: string;
  exportRevision: number;
  layoutRevisionId: string;
  layoutRevision: number;
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  renderer: LayoutRendererIdentityV1;
  inputs: { images: PublicationInputAssetV1[]; fonts: PublicationInputAssetV1[] };
  outputs: PublicationOutputArtifactV1[];
}

export interface EncodedPublicationManifestV2 {
  schemaVersion: 2;
  value: PublicationManifestV2;
  canonical: string;
  canonicalBytes: Uint8Array;
  digest: LayoutDigest;
}

export interface LayoutPublicationTaskInputV2 {
  schemaVersion: 2;
  kind: "layout_publication_task_v2";
  requestId: string;
  exportRevisionId: string;
  layoutRevisionId: string;
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  profile: LayoutPublicationProfileV1;
  profileDigest: LayoutDigest;
  preflightDigest: LayoutDigest;
  acknowledgedIssueKeys: string[];
  renderer: LayoutRendererIdentityV1;
  assetManifest: RenderAssetManifestV1;
  sourceProjection: TaskSourceProjectionV1;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label}: expected non-empty string`);
  return value.trim();
}

function digest(value: unknown, label: string): LayoutDigest {
  const normalized = nonEmpty(value, label);
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) throw new Error(`${label}: expected sha256 digest`);
  return normalized as LayoutDigest;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error(`${label}: expected positive integer`);
  return value;
}

function normalizeRenderAssets(input: unknown): RenderAssetManifestV1 {
  const value = record(input, "assets");
  if (!Array.isArray(value.images) || !Array.isArray(value.fonts)) throw new Error("assets: images and fonts must be arrays");
  const images = value.images.map((raw, index) => {
    const item = record(raw, `assets.images[${index}]`);
    return {
      assetId: nonEmpty(item.assetId ?? item.id, `assets.images[${index}].assetId`),
      role: "candidate_image" as const,
      mimeType: nonEmpty(item.mimeType, `assets.images[${index}].mimeType`),
      sha256: digest(item.sha256, `assets.images[${index}].sha256`),
      bytes: positiveInteger(item.bytes, `assets.images[${index}].bytes`),
      width: positiveInteger(item.width, `assets.images[${index}].width`),
      height: positiveInteger(item.height, `assets.images[${index}].height`),
    };
  }).sort((left, right) => left.assetId.localeCompare(right.assetId));
  const fonts = value.fonts.flatMap((raw, index) => {
    const item = record(raw, `assets.fonts[${index}]`);
    if (item.status === "red") return [];
    const metadataDigest = item.metadataDigest === undefined
      ? digestCanonical(record(item.metadata, `assets.fonts[${index}].metadata`))
      : digest(item.metadataDigest, `assets.fonts[${index}].metadataDigest`);
    return [{
      assetId: nonEmpty(item.assetId, `assets.fonts[${index}].assetId`),
      role: "font" as const,
      mimeType: nonEmpty(item.mimeType, `assets.fonts[${index}].mimeType`),
      sha256: digest(item.sha256, `assets.fonts[${index}].sha256`),
      bytes: positiveInteger(item.bytes, `assets.fonts[${index}].bytes`),
      metadataDigest,
    }];
  }).sort((left, right) => left.assetId.localeCompare(right.assetId));
  return { schemaVersion: 1, images, fonts };
}

function digestCanonical(value: unknown): LayoutDigest {
  return sha256Bytes(canonicalJsonBytes(value));
}

function issueKeys(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 5_000) throw new Error(`${label}: expected array with at most 5000 entries`);
  const parsed = value.map((item, index) => nonEmpty(item, `${label}[${index}]`)).sort();
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label}: duplicate issue key`);
  return parsed;
}

function parseRendererIdentityV1(input: unknown): LayoutRendererIdentityV1 {
  const row = exact(input, [
    "rendererId",
    "rendererVersion",
    "rendererPolicyVersion",
    "geometryPolicyVersion",
    "textPolicyVersion",
    "balloonPolicyVersion",
    "rasterEngine",
    "rasterEngineVersion",
    "buildDigest",
  ], "renderer");
  if (row.rendererId !== "airoaming_layout_renderer") throw new Error("renderer.rendererId: unsupported renderer");
  if (row.rendererPolicyVersion !== "layout_render_policy_v1") throw new Error("renderer.rendererPolicyVersion: unsupported policy");
  if (row.geometryPolicyVersion !== "layout_geometry_v1") throw new Error("renderer.geometryPolicyVersion: unsupported policy");
  if (row.textPolicyVersion !== "layout_text_v1") throw new Error("renderer.textPolicyVersion: unsupported policy");
  if (row.balloonPolicyVersion !== "balloon_shape_v1") throw new Error("renderer.balloonPolicyVersion: unsupported policy");
  if (row.rasterEngine !== "chromium" && row.rasterEngine !== "resvg" && row.rasterEngine !== "other_approved") {
    throw new Error("renderer.rasterEngine: unsupported engine");
  }
  return {
    rendererId: "airoaming_layout_renderer",
    rendererVersion: nonEmpty(row.rendererVersion, "renderer.rendererVersion"),
    rendererPolicyVersion: "layout_render_policy_v1",
    geometryPolicyVersion: "layout_geometry_v1",
    textPolicyVersion: "layout_text_v1",
    balloonPolicyVersion: "balloon_shape_v1",
    rasterEngine: row.rasterEngine,
    rasterEngineVersion: nonEmpty(row.rasterEngineVersion, "renderer.rasterEngineVersion"),
    buildDigest: digest(row.buildDigest, "renderer.buildDigest"),
  };
}

function parseTaskSourceProjectionV1(input: unknown): TaskSourceProjectionV1 {
  const row = exact(input, [
    "schemaVersion",
    "policyVersion",
    "projectId",
    "chapterId",
    "consumerType",
    "sources",
  ], "sourceProjection");
  if (row.schemaVersion !== 1) throw new Error("sourceProjection.schemaVersion: expected 1");
  if (!Array.isArray(row.sources)) throw new Error("sourceProjection.sources: expected array");
  const sources = row.sources.map((entry, index) => {
    const item = exact(entry, [
      "role",
      "order",
      "sourceType",
      "sourceId",
      "sourceDigest",
    ], `sourceProjection.sources[${index}]`);
    return {
      role: nonEmpty(item.role, `sourceProjection.sources[${index}].role`),
      order: positiveInteger(item.order, `sourceProjection.sources[${index}].order`),
      sourceType: nonEmpty(item.sourceType, `sourceProjection.sources[${index}].sourceType`),
      sourceId: nonEmpty(item.sourceId, `sourceProjection.sources[${index}].sourceId`),
      sourceDigest: digest(item.sourceDigest, `sourceProjection.sources[${index}].sourceDigest`),
    };
  });
  const normalized = buildTaskSourceProjection({
    policyVersion: nonEmpty(row.policyVersion, "sourceProjection.policyVersion"),
    projectId: nonEmpty(row.projectId, "sourceProjection.projectId"),
    chapterId: row.chapterId === null
      ? null
      : nonEmpty(row.chapterId, "sourceProjection.chapterId"),
    consumerType: nonEmpty(row.consumerType, "sourceProjection.consumerType"),
    sources: sources.map(({ order: _order, ...source }) => source),
  });
  if (canonicalizeJson(normalized) !== canonicalizeJson({
    schemaVersion: 1,
    policyVersion: row.policyVersion,
    projectId: row.projectId,
    chapterId: row.chapterId,
    consumerType: row.consumerType,
    sources,
  })) {
    throw new Error("sourceProjection: source order does not match canonical projection");
  }
  return normalized;
}

export function buildLayoutRenderPlanV1(input: {
  document: unknown;
  sourceLockSetDigest: unknown;
  profile: unknown;
  assets: unknown;
  diagnostics?: readonly RenderPlanDiagnosticV1[];
}): RenderPlanV1 {
  const document = LayoutDocumentCodecV1.parseAndNormalize(input.document);
  const profile = LayoutPublicationProfileCodecV1.encode(input.profile);
  if ((document.comicFormat === "paged_comic") !== (profile.value.kind === "paged_publication")) {
    throw new Error("render plan: profile format mismatch");
  }
  const assets = normalizeRenderAssets(input.assets);
  const diagnostics = [...(input.diagnostics ?? [])].map((item) => ({
    code: nonEmpty(item.code, "diagnostics.code"),
    canvasId: item.canvasId ?? null,
    elementId: item.elementId ?? null,
  })).sort((left, right) => left.code.localeCompare(right.code)
    || (left.canvasId ?? "").localeCompare(right.canvasId ?? "")
    || (left.elementId ?? "").localeCompare(right.elementId ?? ""));
  const unsigned = {
    schemaVersion: 1 as const,
    documentDigest: LayoutDocumentCodecV1.encode(document).digest,
    sourceLockSetDigest: digest(input.sourceLockSetDigest, "sourceLockSetDigest"),
    profileDigest: profile.digest,
    rendererPolicyVersion: "layout_render_policy_v1" as const,
    canvases: document.canvases.map((canvas, index) => ({
      canvasId: canvas.id,
      order: index + 1,
      width: canvas.width,
      height: canvas.height,
      canvas,
    })),
    assets,
    diagnostics,
  };
  return { ...unsigned, renderPlanDigest: digestCanonical(unsigned) };
}

export function buildLayoutRenderPlanV2(input: {
  document: LayoutDocumentV2;
  sourceLockSetDigest: unknown;
  profile: unknown;
  assets: unknown;
  diagnostics?: readonly RenderPlanDiagnosticV1[];
}): RenderPlanV2 {
  const revision = LayoutDocumentCodecV2.encode(input.document);
  const visible = projectLayoutDocumentV2ToV1(revision.value);
  const visiblePlan = buildLayoutRenderPlanV1({
    document: visible,
    sourceLockSetDigest: input.sourceLockSetDigest,
    profile: input.profile,
    assets: input.assets,
    diagnostics: input.diagnostics,
  });
  const unsigned = {
    schemaVersion: 2 as const,
    kind: "layout_render_plan_v2" as const,
    revisionDocumentDigest: revision.digest,
    visibleDocumentDigest: visiblePlan.documentDigest,
    sourceLockSetDigest: visiblePlan.sourceLockSetDigest,
    profileDigest: visiblePlan.profileDigest,
    rendererPolicyVersion: visiblePlan.rendererPolicyVersion,
    canvases: visiblePlan.canvases,
    assets: visiblePlan.assets,
    diagnostics: visiblePlan.diagnostics,
  };
  return { ...unsigned, renderPlanDigest: digestCanonical(unsigned) };
}

export function buildVerticalSlicePlanV1(
  canvases: readonly Pick<LayoutCanvasV1, "height">[],
  maxSliceHeightPx: number,
  outputScale: 1 | 2,
): VerticalSlicePlanV1[] {
  if (!Number.isInteger(maxSliceHeightPx) || maxSliceHeightPx < 1) throw new Error("maxSliceHeightPx: expected positive integer");
  const boundaries = [0];
  for (const canvas of canvases) boundaries.push(boundaries.at(-1)! + Math.round(canvas.height * outputScale));
  const total = boundaries.at(-1)!;
  const slices: VerticalSlicePlanV1[] = [];
  let startY = 0;
  while (startY < total) {
    const alignedMaximumHeight = Math.max(outputScale, Math.floor(maxSliceHeightPx / outputScale) * outputScale);
    const maximumEnd = Math.min(total, startY + alignedMaximumHeight);
    const boundaryEnd = [...boundaries].reverse().find((value) => value > startY && value <= maximumEnd);
    const endY = boundaryEnd ?? maximumEnd;
    slices.push({
      order: slices.length + 1,
      startY,
      endY,
      height: endY - startY,
      crossesContent: !boundaries.includes(endY),
    });
    startY = endY;
  }
  return slices;
}

export function parseCreateLayoutPublicationRequestV1(input: unknown): CreateLayoutPublicationRequestV1 {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  const row = exact(value, [
    "schemaVersion", "requestId", "layoutRevisionId", "expectedCurrentLayoutRevisionId",
    "profile", "profileDigest", "preflightDigest", "acknowledgedIssueKeys",
  ], "layoutPublicationRequest");
  if (row.schemaVersion !== 1) throw new Error("layoutPublicationRequest.schemaVersion: expected 1");
  if (!Array.isArray(row.acknowledgedIssueKeys)) throw new Error("layoutPublicationRequest.acknowledgedIssueKeys: expected array");
  const acknowledgedIssueKeys = row.acknowledgedIssueKeys.map((item, index) => nonEmpty(item, `acknowledgedIssueKeys[${index}]`)).sort();
  if (new Set(acknowledgedIssueKeys).size !== acknowledgedIssueKeys.length) throw new Error("layoutPublicationRequest.acknowledgedIssueKeys: duplicate issue key");
  return {
    schemaVersion: 1,
    requestId: nonEmpty(row.requestId, "layoutPublicationRequest.requestId"),
    layoutRevisionId: nonEmpty(row.layoutRevisionId, "layoutPublicationRequest.layoutRevisionId"),
    expectedCurrentLayoutRevisionId: nonEmpty(row.expectedCurrentLayoutRevisionId, "layoutPublicationRequest.expectedCurrentLayoutRevisionId"),
    profile: LayoutPublicationProfileCodecV1.parse(row.profile),
    profileDigest: digest(row.profileDigest, "layoutPublicationRequest.profileDigest"),
    preflightDigest: digest(row.preflightDigest, "layoutPublicationRequest.preflightDigest"),
    acknowledgedIssueKeys,
  };
}

export function parseCreateLayoutPublicationRequestV2(input: unknown): CreateLayoutPublicationRequestV2 {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  const row = exact(value, [
    "schemaVersion",
    "requestId",
    "layoutRevisionId",
    "expectedCurrentLayoutRevisionId",
    "expectedRevisionDocumentDigest",
    "expectedVisibleDocumentDigest",
    "profile",
    "profileDigest",
    "preflightDigest",
    "acknowledgedIssueKeys",
  ], "layoutPublicationRequest");
  if (row.schemaVersion !== 2) throw new Error("layoutPublicationRequest.schemaVersion: expected 2");
  const profile = LayoutPublicationProfileCodecV1.encode(row.profile);
  const profileDigest = digest(row.profileDigest, "layoutPublicationRequest.profileDigest");
  if (profile.digest !== profileDigest) {
    throw new Error("layoutPublicationRequest.profileDigest: does not match canonical profile");
  }
  return {
    schemaVersion: 2,
    requestId: nonEmpty(row.requestId, "layoutPublicationRequest.requestId"),
    layoutRevisionId: nonEmpty(row.layoutRevisionId, "layoutPublicationRequest.layoutRevisionId"),
    expectedCurrentLayoutRevisionId: nonEmpty(
      row.expectedCurrentLayoutRevisionId,
      "layoutPublicationRequest.expectedCurrentLayoutRevisionId",
    ),
    expectedRevisionDocumentDigest: digest(
      row.expectedRevisionDocumentDigest,
      "layoutPublicationRequest.expectedRevisionDocumentDigest",
    ),
    expectedVisibleDocumentDigest: digest(
      row.expectedVisibleDocumentDigest,
      "layoutPublicationRequest.expectedVisibleDocumentDigest",
    ),
    profile: profile.value,
    profileDigest,
    preflightDigest: digest(row.preflightDigest, "layoutPublicationRequest.preflightDigest"),
    acknowledgedIssueKeys: issueKeys(
      row.acknowledgedIssueKeys,
      "layoutPublicationRequest.acknowledgedIssueKeys",
    ),
  };
}

export function parseCreateLayoutPublicationRequestV1OrV2(
  input: unknown,
): CreateLayoutPublicationRequestV1OrV2 {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  return record(value, "layoutPublicationRequest").schemaVersion === 2
    ? parseCreateLayoutPublicationRequestV2(value)
    : parseCreateLayoutPublicationRequestV1(value);
}

export function parseLayoutPublicationTaskInputV2(input: unknown): LayoutPublicationTaskInputV2 {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  const row = exact(value, [
    "schemaVersion",
    "kind",
    "requestId",
    "exportRevisionId",
    "layoutRevisionId",
    "revisionDocumentDigest",
    "visibleDocumentDigest",
    "sourceLockSetDigest",
    "profile",
    "profileDigest",
    "preflightDigest",
    "acknowledgedIssueKeys",
    "renderer",
    "assetManifest",
    "sourceProjection",
  ], "layoutPublicationTask");
  if (row.schemaVersion !== 2) throw new Error("layoutPublicationTask.schemaVersion: expected 2");
  if (row.kind !== "layout_publication_task_v2") throw new Error("layoutPublicationTask.kind: expected layout_publication_task_v2");
  const profile = LayoutPublicationProfileCodecV1.encode(row.profile);
  const profileDigest = digest(row.profileDigest, "layoutPublicationTask.profileDigest");
  if (profile.digest !== profileDigest) {
    throw new Error("layoutPublicationTask.profileDigest: does not match canonical profile");
  }
  const sourceProjection = parseTaskSourceProjectionV1(row.sourceProjection);
  if (sourceProjection.policyVersion !== LAYOUT_PUBLICATION_SOURCE_POLICY_V2) {
    throw new Error(
      `layoutPublicationTask.sourceProjection.policyVersion: expected ${LAYOUT_PUBLICATION_SOURCE_POLICY_V2}`,
    );
  }
  if (sourceProjection.consumerType !== "layout_export") {
    throw new Error(
      "layoutPublicationTask.sourceProjection.consumerType: expected layout_export",
    );
  }
  return {
    schemaVersion: 2,
    kind: "layout_publication_task_v2",
    requestId: nonEmpty(row.requestId, "layoutPublicationTask.requestId"),
    exportRevisionId: nonEmpty(row.exportRevisionId, "layoutPublicationTask.exportRevisionId"),
    layoutRevisionId: nonEmpty(row.layoutRevisionId, "layoutPublicationTask.layoutRevisionId"),
    revisionDocumentDigest: digest(
      row.revisionDocumentDigest,
      "layoutPublicationTask.revisionDocumentDigest",
    ),
    visibleDocumentDigest: digest(
      row.visibleDocumentDigest,
      "layoutPublicationTask.visibleDocumentDigest",
    ),
    sourceLockSetDigest: digest(row.sourceLockSetDigest, "layoutPublicationTask.sourceLockSetDigest"),
    profile: profile.value,
    profileDigest,
    preflightDigest: digest(row.preflightDigest, "layoutPublicationTask.preflightDigest"),
    acknowledgedIssueKeys: issueKeys(
      row.acknowledgedIssueKeys,
      "layoutPublicationTask.acknowledgedIssueKeys",
    ),
    renderer: parseRendererIdentityV1(row.renderer),
    assetManifest: normalizeRenderAssets(row.assetManifest),
    sourceProjection,
  };
}

export function buildPublicationManifestV1(
  input: Omit<PublicationManifestV1, "schemaVersion" | "kind" | "profileDigest">,
): EncodedLayoutValue<PublicationManifestV1> {
  const profile = LayoutPublicationProfileCodecV1.encode(input.profile);
  const outputs = [...input.outputs].sort((left, right) => left.role.localeCompare(right.role) || left.order - right.order);
  const value: PublicationManifestV1 = {
    schemaVersion: 1,
    kind: "layout_publication_manifest_v1",
    projectId: nonEmpty(input.projectId, "manifest.projectId"),
    chapterId: nonEmpty(input.chapterId, "manifest.chapterId"),
    exportRevisionId: nonEmpty(input.exportRevisionId, "manifest.exportRevisionId"),
    exportRevision: positiveInteger(input.exportRevision, "manifest.exportRevision"),
    layoutRevisionId: nonEmpty(input.layoutRevisionId, "manifest.layoutRevisionId"),
    layoutRevision: positiveInteger(input.layoutRevision, "manifest.layoutRevision"),
    documentDigest: digest(input.documentDigest, "manifest.documentDigest"),
    sourceLockSetDigest: digest(input.sourceLockSetDigest, "manifest.sourceLockSetDigest"),
    profile: profile.value,
    profileDigest: profile.digest,
    renderer: input.renderer,
    inputs: {
      images: [...input.inputs.images].sort((left, right) => left.assetId.localeCompare(right.assetId)),
      fonts: [...input.inputs.fonts].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    },
    outputs,
  };
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 1, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export function buildPublicationManifestV2(
  input: Omit<PublicationManifestV2, "schemaVersion" | "kind" | "profileDigest">,
): EncodedPublicationManifestV2 {
  const profile = LayoutPublicationProfileCodecV1.encode(input.profile);
  const outputs = [...input.outputs].sort((left, right) => left.role.localeCompare(right.role) || left.order - right.order);
  const value: PublicationManifestV2 = {
    schemaVersion: 2,
    kind: "layout_publication_manifest_v2",
    projectId: nonEmpty(input.projectId, "manifest.projectId"),
    chapterId: nonEmpty(input.chapterId, "manifest.chapterId"),
    exportRevisionId: nonEmpty(input.exportRevisionId, "manifest.exportRevisionId"),
    exportRevision: positiveInteger(input.exportRevision, "manifest.exportRevision"),
    layoutRevisionId: nonEmpty(input.layoutRevisionId, "manifest.layoutRevisionId"),
    layoutRevision: positiveInteger(input.layoutRevision, "manifest.layoutRevision"),
    revisionDocumentDigest: digest(input.revisionDocumentDigest, "manifest.revisionDocumentDigest"),
    visibleDocumentDigest: digest(input.visibleDocumentDigest, "manifest.visibleDocumentDigest"),
    sourceLockSetDigest: digest(input.sourceLockSetDigest, "manifest.sourceLockSetDigest"),
    profile: profile.value,
    profileDigest: profile.digest,
    renderer: parseRendererIdentityV1(input.renderer),
    inputs: {
      images: [...input.inputs.images].sort((left, right) => left.assetId.localeCompare(right.assetId)),
      fonts: [...input.inputs.fonts].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    },
    outputs,
  };
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 2, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}
