import { digestCanonicalJson } from "../versioning/canonical-json.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  projectLayoutSourceBindings,
} from "./digest.js";
import type {
  CandidateImageSourceV1,
  LayoutDigest,
  LayoutDocumentV1,
  LayoutPublicationProfileV1,
} from "./document.js";
import type { LayoutFontCatalogItemV1 } from "./font.js";
import { collectLayoutTextIssuesV1 } from "./font.js";
import { evaluateCoverCropV1, normalizeLayoutNumber } from "./geometry.js";
import type { LayoutSourceCatalogItemV1 } from "./working-copy.js";

export type LayoutPreflightCodeV1 =
  | "LAYOUT_SCHEMA_INVALID"
  | "LAYOUT_PROFILE_INVALID"
  | "ACTIVE_SHOT_UNPLACED"
  | "ACTIVE_SHOT_NOT_VISIBLE"
  | "SOURCE_LOCK_SET_INCOMPLETE"
  | "SOURCE_STALE"
  | "SOURCE_UNRESOLVED"
  | "SOURCE_DIGEST_MISMATCH"
  | "IMAGE_ASSET_MISSING_OR_NOT_READY"
  | "IMAGE_SHA_MISMATCH"
  | "IMAGE_ORIENTATION_UNNORMALIZED"
  | "IMAGE_COLORSPACE_UNSUPPORTED"
  | "IMAGE_ANIMATION_UNSUPPORTED"
  | "FONT_ASSET_MISSING_OR_NOT_READY"
  | "FONT_EMBEDDING_FORBIDDEN"
  | "FONT_GLYPH_MISSING"
  | "TEXT_OVERFLOW"
  | "WORKING_COPY_AHEAD_OF_REVISION"
  | "IMAGE_EFFECTIVE_RESOLUTION_CRITICAL"
  | "IMAGE_EFFECTIVE_RESOLUTION_LOW"
  | "ELEMENT_FULLY_OUTSIDE_CANVAS"
  | "ELEMENT_PARTLY_OUTSIDE_SAFE_AREA"
  | "CANVAS_EMPTY"
  | "HIDDEN_ELEMENT_PRESENT"
  | "STRIP_CUT_CROSSES_CONTENT"
  | "OUTPUT_DIMENSION_UNSUPPORTED"
  | "OUTPUT_PIXEL_LIMIT_EXCEEDED"
  | "PDF_NOT_SUPPORTED_FOR_FORMAT"
  | "RENDERER_CAPABILITY_MISSING";

export interface LayoutPreflightIssueV1 {
  issueKey: string;
  code: LayoutPreflightCodeV1;
  severity: "error" | "warning" | "info";
  blockingScopes: Array<"revision" | "export">;
  requiresAcknowledgement: boolean;
  canvasId: string | null;
  elementId: string | null;
  shotId: string | null;
  details: Record<string, string | number | boolean | null>;
}

export interface LayoutPreflightReportV1 {
  schemaVersion: 1;
  policyVersion: "layout_preflight_v1";
  target: {
    kind: "working_copy" | "layout_revision";
    id: string;
    documentDigest: LayoutDigest;
    rowVersion: number | null;
  };
  sourceLockSetDigest: LayoutDigest | null;
  currentLockSetDigest: LayoutDigest | null;
  exportProfileDigest: LayoutDigest | null;
  status: "ready" | "warning" | "blocked";
  issues: LayoutPreflightIssueV1[];
  preflightDigest: LayoutDigest;
}

export interface LayoutPreflightImageAssetV1 {
  assetId: string;
  sha256: LayoutDigest;
  width: number;
  height: number;
  ready: boolean;
  normalizationIssues?: Array<
    | "IMAGE_ORIENTATION_UNNORMALIZED"
    | "IMAGE_COLORSPACE_UNSUPPORTED"
    | "IMAGE_ANIMATION_UNSUPPORTED"
  >;
}

function compareUnicode(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function currentLockDigest(sources: readonly LayoutSourceCatalogItemV1[]): LayoutDigest | null {
  if (sources.length === 0) return null;
  const shotIds = sources.map((item) => item.source.shotId);
  if (new Set(shotIds).size !== shotIds.length) return null;
  return digestCanonicalJson(
    [...sources]
      .sort((left, right) => compareUnicode(left.source.shotId, right.source.shotId))
      .map((item) => ({
        shotId: item.source.shotId,
        candidateLockRevisionId: item.source.candidateLockRevisionId,
      })),
  );
}

function boxOutside(
  box: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): boolean {
  return box.x + box.width <= 0 || box.y + box.height <= 0 || box.x >= width || box.y >= height;
}

function boxOutsideSafeArea(
  box: { x: number; y: number; width: number; height: number },
  safe: { top: number; right: number; bottom: number; left: number },
  width: number,
  height: number,
): boolean {
  return box.x < safe.left
    || box.y < safe.top
    || box.x + box.width > width - safe.right
    || box.y + box.height > height - safe.bottom;
}

function profileScale(profile: LayoutPublicationProfileV1 | null): number {
  return profile?.outputScale ?? 1;
}

function safeInsets(document: LayoutDocumentV1) {
  return document.profile.kind === "paged"
    ? document.profile.safeArea
    : {
        top: 0,
        right: document.profile.safeInsetX,
        bottom: 0,
        left: document.profile.safeInsetX,
      };
}

function imageElements(document: LayoutDocumentV1) {
  return document.canvases.flatMap((canvas) => canvas.elements.flatMap((element) => {
    if (element.type === "panel_frame" && element.contentImage) {
      return [{
        canvas,
        elementId: element.contentImage.id,
        topElementId: element.id,
        source: element.contentImage.source,
        hidden: element.hidden || element.contentImage.hidden || element.transform.opacity <= 0,
        transform: element.transform,
        crop: element.contentImage.crop,
        displayMode: "cover" as const,
      }];
    }
    if (element.type === "free_image") {
      return [{
        canvas,
        elementId: element.id,
        topElementId: element.id,
        source: element.source,
        hidden: element.hidden || element.transform.opacity <= 0,
        transform: element.transform,
        crop: element.display.mode === "cover" ? element.display.crop : null,
        displayMode: element.display.mode,
      }];
    }
    return [];
  }));
}

function normalizeDetails(details: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [
    key,
    typeof value === "number" ? normalizeLayoutNumber(value) : value,
  ]));
}

export function runLayoutPreflightV1(input: {
  document: LayoutDocumentV1;
  target: LayoutPreflightReportV1["target"];
  currentSources: readonly LayoutSourceCatalogItemV1[];
  activeShotIds?: readonly string[];
  imageAssets: Readonly<Record<string, LayoutPreflightImageAssetV1>>;
  fontCatalog: readonly LayoutFontCatalogItemV1[];
  profile: LayoutPublicationProfileV1 | null;
  workingCopyDocumentDigest?: LayoutDigest | null;
}): LayoutPreflightReportV1 {
  const document = LayoutDocumentCodecV1.parseAndNormalize(input.document);
  const currentByShot = new Map(input.currentSources.map((item) => [item.source.shotId, item]));
  const activeShotIds = input.activeShotIds ?? input.currentSources.map((item) => item.source.shotId);
  const issues: LayoutPreflightIssueV1[] = [];
  const dedupe = new Set<string>();
  const add = (
    code: LayoutPreflightCodeV1,
    severity: LayoutPreflightIssueV1["severity"],
    blockingScopes: LayoutPreflightIssueV1["blockingScopes"],
    requiresAcknowledgement: boolean,
    location: { canvasId?: string | null; elementId?: string | null; shotId?: string | null },
    details: Record<string, string | number | boolean | null> = {},
  ) => {
    const normalized = normalizeDetails(details);
    const identity = {
      code,
      canvasId: location.canvasId ?? null,
      elementId: location.elementId ?? null,
      shotId: location.shotId ?? null,
      details: normalized,
    };
    const issueKey = `issue_${digestCanonicalJson(identity).slice(7, 31)}`;
    if (dedupe.has(issueKey)) return;
    dedupe.add(issueKey);
    issues.push({
      issueKey,
      severity,
      blockingScopes,
      requiresAcknowledgement,
      ...identity,
    });
  };

  if (
    input.profile
    && ((document.comicFormat === "paged_comic" && input.profile.kind !== "paged_publication")
      || (document.comicFormat === "vertical_scroll" && input.profile.kind !== "vertical_publication"))
  ) {
    add("LAYOUT_PROFILE_INVALID", "error", ["revision", "export"], false, {}, {
      comicFormat: document.comicFormat,
      profileKind: input.profile.kind,
    });
  }

  const bindings = projectLayoutSourceBindings(document);
  const bindingsByShot = new Map<string, typeof bindings>();
  for (const binding of bindings) {
    const current = bindingsByShot.get(binding.shotId) ?? [];
    current.push(binding);
    bindingsByShot.set(binding.shotId, current);
  }
  let sourceLockSetDigest: LayoutDigest | null = null;
  try {
    sourceLockSetDigest = digestLayoutSourceLockSet(document, activeShotIds);
  } catch {
    add("SOURCE_UNRESOLVED", "error", ["revision", "export"], false, {}, { reason: "multiple_lock_revisions" });
  }
  const currentLockSetDigest = activeShotIds.length === 0
    ? null
    : input.currentSources.length === activeShotIds.length
      ? currentLockDigest(input.currentSources)
      : null;
  if (activeShotIds.length > 0 && (!sourceLockSetDigest || !currentLockSetDigest)) {
    add("SOURCE_LOCK_SET_INCOMPLETE", "error", ["revision", "export"], false, {}, {});
  }

  const images = imageElements(document);
  for (const shotId of activeShotIds) {
    const current = currentByShot.get(shotId);
    const shotBindings = bindingsByShot.get(shotId) ?? [];
    if (shotBindings.length === 0) {
      add("ACTIVE_SHOT_UNPLACED", "error", ["revision", "export"], false, { shotId }, {});
      continue;
    }
    if (!current) continue;
    const visible = images.some((image) => image.source.shotId === current.source.shotId
      && !image.hidden
      && !boxOutside(image.transform, image.canvas.width, image.canvas.height));
    if (!visible) {
      add("ACTIVE_SHOT_NOT_VISIBLE", "error", ["revision", "export"], false, { shotId: current.source.shotId }, {});
    }
  }

  for (const image of images) {
    const current = currentByShot.get(image.source.shotId);
    if (!current) {
      add("SOURCE_UNRESOLVED", "error", ["revision", "export"], false, {
        canvasId: image.canvas.id,
        elementId: image.elementId,
        shotId: image.source.shotId,
      }, {});
    } else if (
      image.source.candidateId !== current.source.candidateId
      || image.source.candidateLockRevisionId !== current.source.candidateLockRevisionId
      || image.source.assetId !== current.source.assetId
    ) {
      add("SOURCE_STALE", "error", ["revision", "export"], false, {
        canvasId: image.canvas.id,
        elementId: image.elementId,
        shotId: image.source.shotId,
      }, {
        currentCandidateLockRevisionId: current.source.candidateLockRevisionId,
        documentCandidateLockRevisionId: image.source.candidateLockRevisionId,
      });
    } else if (image.source.sourceDigest !== current.source.sourceDigest) {
      add("SOURCE_DIGEST_MISMATCH", "error", ["revision", "export"], false, {
        canvasId: image.canvas.id,
        elementId: image.elementId,
        shotId: image.source.shotId,
      }, {});
    }

    const asset = input.imageAssets[image.source.assetId];
    if (!asset || !asset.ready) {
      add("IMAGE_ASSET_MISSING_OR_NOT_READY", "error", ["revision", "export"], false, {
        canvasId: image.canvas.id,
        elementId: image.elementId,
        shotId: image.source.shotId,
      }, { assetId: image.source.assetId });
    } else {
      const expectedDigest = digestCandidateImageSourceV1({
        shotId: image.source.shotId,
        candidateId: image.source.candidateId,
        candidateLockRevisionId: image.source.candidateLockRevisionId,
        assetId: image.source.assetId,
      }, asset.sha256);
      if (expectedDigest !== image.source.sourceDigest) {
        add("IMAGE_SHA_MISMATCH", "error", ["revision", "export"], false, {
          canvasId: image.canvas.id,
          elementId: image.elementId,
          shotId: image.source.shotId,
        }, { assetId: image.source.assetId });
      }
      for (const code of asset.normalizationIssues ?? []) {
        add(code, "error", ["revision", "export"], false, {
          canvasId: image.canvas.id,
          elementId: image.elementId,
          shotId: image.source.shotId,
        }, { assetId: image.source.assetId });
      }
      const outputScale = profileScale(input.profile);
      let sourceToOutputScale: number;
      if (image.displayMode === "cover" && image.crop) {
        sourceToOutputScale = evaluateCoverCropV1({
          sourceWidth: asset.width,
          sourceHeight: asset.height,
          frameWidth: image.transform.width,
          frameHeight: image.transform.height,
          crop: image.crop,
        }).actualScale * outputScale;
      } else {
        sourceToOutputScale = Math.min(
          image.transform.width / asset.width,
          image.transform.height / asset.height,
        ) * outputScale;
      }
      const ratio = 1 / Math.max(sourceToOutputScale, 0.000001);
      if (ratio < 0.5) {
        add("IMAGE_EFFECTIVE_RESOLUTION_CRITICAL", "error", ["export"], false, {
          canvasId: image.canvas.id,
          elementId: image.elementId,
          shotId: image.source.shotId,
        }, { ratio });
      } else if (ratio < 1) {
        add("IMAGE_EFFECTIVE_RESOLUTION_LOW", "warning", [], true, {
          canvasId: image.canvas.id,
          elementId: image.elementId,
          shotId: image.source.shotId,
        }, { ratio });
      }
    }
  }

  for (const issue of collectLayoutTextIssuesV1(document, input.fontCatalog)) {
    if (issue.code === "LAYOUT_FONT_ASSET_MISSING") {
      add("FONT_ASSET_MISSING_OR_NOT_READY", "error", ["revision", "export"], false, issue, {
        fontAssetId: issue.fontAssetId ?? null,
      });
    } else if (issue.code === "LAYOUT_FONT_EMBEDDING_FORBIDDEN") {
      add("FONT_EMBEDDING_FORBIDDEN", "error", ["revision", "export"], false, issue, {
        fontAssetId: issue.fontAssetId ?? null,
      });
    } else if (issue.code === "LAYOUT_FONT_GLYPH_MISSING") {
      add("FONT_GLYPH_MISSING", "error", ["revision", "export"], false, issue, {
        fontAssetId: issue.fontAssetId ?? null,
        missingCodePoints: issue.missingCodePoints?.join(",") ?? "",
        paragraphIndex: issue.paragraphIndex ?? null,
        graphemeOffset: issue.graphemeOffset ?? null,
      });
    } else {
      add("TEXT_OVERFLOW", "warning", ["export"], true, issue, {
        axis: issue.axis ?? null,
        required: issue.required ?? null,
        available: issue.available ?? null,
        paragraphIndex: issue.paragraphIndex ?? null,
        graphemeOffset: issue.graphemeOffset ?? null,
      });
    }
  }

  const safe = safeInsets(document);
  for (const canvas of document.canvases) {
    const visible = canvas.elements.filter((element) => !element.hidden && element.transform.opacity > 0);
    if (visible.length === 0) add("CANVAS_EMPTY", "warning", [], true, { canvasId: canvas.id }, {});
    for (const element of canvas.elements) {
      if (element.hidden || element.transform.opacity <= 0) {
        add("HIDDEN_ELEMENT_PRESENT", "info", [], false, { canvasId: canvas.id, elementId: element.id }, {});
        continue;
      }
      if (boxOutside(element.transform, canvas.width, canvas.height)) {
        add("ELEMENT_FULLY_OUTSIDE_CANVAS", "warning", [], true, { canvasId: canvas.id, elementId: element.id }, {});
      } else if (
        (element.type === "text" || element.type === "balloon" || element.type === "panel_frame")
        && boxOutsideSafeArea(element.transform, safe, canvas.width, canvas.height)
      ) {
        add("ELEMENT_PARTLY_OUTSIDE_SAFE_AREA", "warning", [], true, { canvasId: canvas.id, elementId: element.id }, {});
      }
    }
  }

  if (
    input.target.kind === "layout_revision"
    && input.workingCopyDocumentDigest
    && input.workingCopyDocumentDigest !== input.target.documentDigest
  ) {
    add("WORKING_COPY_AHEAD_OF_REVISION", "warning", [], true, {}, {
      workingCopyDocumentDigest: input.workingCopyDocumentDigest,
    });
  }

  issues.sort((left, right) => left.issueKey.localeCompare(right.issueKey));
  const exportProfileDigest = input.profile ? digestCanonicalJson(input.profile) : null;
  const scope = input.target.kind === "working_copy" || input.profile === null ? "revision" : "export";
  const blocked = issues.some((issue) => issue.blockingScopes.includes(scope));
  const status = blocked
    ? "blocked"
    : issues.some((issue) => issue.severity === "warning" || issue.requiresAcknowledgement)
      ? "warning"
      : "ready";
  const digestInput = {
    policyVersion: "layout_preflight_v1",
    target: input.target,
    sourceLockSetDigest,
    currentLockSetDigest,
    exportProfileDigest,
    issues,
  };
  return {
    schemaVersion: 1,
    policyVersion: "layout_preflight_v1",
    target: input.target,
    sourceLockSetDigest,
    currentLockSetDigest,
    exportProfileDigest,
    status,
    issues,
    preflightDigest: digestCanonicalJson(digestInput),
  };
}
