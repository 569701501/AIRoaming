import { digestCanonicalJson } from "../versioning/canonical-json.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  digestLayoutDialogueTextV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
} from "./automation.js";
import {
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  projectLayoutSourceBindings,
} from "./digest.js";
import type {
  LayoutDigest,
  LayoutDocumentV1,
  LayoutPublicationProfileV1,
} from "./document.js";
import type { LayoutFontCatalogItemV1 } from "./font.js";
import { collectLayoutTextIssuesV1 } from "./font.js";
import { evaluateCoverCropV1, normalizeLayoutNumber } from "./geometry.js";
import type { LayoutDialogueLedgerV1 } from "./dialogue.js";
import { richTextPlainTextV1 } from "./text.js";
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
  | "VISIBLE_TEXT_EMPTY"
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

export type LayoutPreflightCodeV2 =
  | LayoutPreflightCodeV1
  | "REVISION_DOCUMENT_DIGEST_MISMATCH"
  | "VISIBLE_DOCUMENT_DIGEST_MISMATCH"
  | "VISIBLE_PROJECTION_UNSTABLE"
  | "DIALOGUE_LEDGER_INVALID"
  | "DIALOGUE_LEDGER_WARNING"
  | "DIALOGUE_BINDING_MISSING"
  | "DIALOGUE_BINDING_UNEXPECTED"
  | "DIALOGUE_BINDING_DUPLICATE"
  | "DIALOGUE_BINDING_DANGLING"
  | "DIALOGUE_BINDING_SOURCE_MISMATCH"
  | "DIALOGUE_BALLOON_KIND_MISMATCH"
  | "DIALOGUE_BALLOON_SPEAKER_MISMATCH"
  | "DIALOGUE_TEXT_UNPROTECTED"
  | "DIALOGUE_USER_MODIFIED"
  | "DIALOGUE_USER_SUPPRESSED"
  | "LAYOUT_COMPOSITION_MISSING"
  | "LAYOUT_COMPOSITION_STALE"
  | "LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH"
  | "LAYOUT_COMPOSITION_SOURCE_OVERRIDE"
  | "LAYOUT_PROTECTION_INVALID";

export interface LayoutPreflightIssueV2 extends Omit<LayoutPreflightIssueV1, "code"> {
  code: LayoutPreflightCodeV2;
}

export interface LayoutPreflightTargetV2 {
  kind: "working_copy" | "layout_revision";
  id: string;
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  rowVersion: number | null;
}

export interface LayoutCurrentCompositionV2 {
  compositionDigest: LayoutDigest;
  storyboardVersionId: string;
  storyboardDigest: LayoutDigest;
  visualAnalysisSetDigest: LayoutDigest | null;
  compositionSourceLocks: readonly LayoutCompositionSourceLockV2[];
}

export interface LayoutCompositionSourceLockV2 {
  shotId: string;
  candidateLockRevisionId: string;
}

export interface LayoutDialogueCoverageSummaryV2 {
  expected: number;
  placedOriginal: number;
  userModified: number;
  userSuppressed: number;
}

export interface LayoutPreflightReportV2 {
  schemaVersion: 2;
  policyVersion: "layout_preflight_v2";
  target: LayoutPreflightTargetV2;
  sourceLockSetDigest: LayoutDigest | null;
  currentLockSetDigest: LayoutDigest | null;
  compositionDigest: LayoutDigest | null;
  currentCompositionEvidenceDigest: LayoutDigest | null;
  dialogueLedgerDigest: LayoutDigest;
  dialogueCoverage: LayoutDialogueCoverageSummaryV2;
  exportProfileDigest: LayoutDigest | null;
  status: "ready" | "warning" | "blocked";
  issues: LayoutPreflightIssueV2[];
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

function hasVisibleTextCodePoint(value: string): boolean {
  return value.replace(/[\p{White_Space}\p{Cf}]/gu, "").length > 0;
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
      if (
        (element.type === "text" || element.type === "balloon")
        && !hasVisibleTextCodePoint(richTextPlainTextV1(element.richText))
      ) {
        add("VISIBLE_TEXT_EMPTY", "error", ["revision", "export"], false, {
          canvasId: canvas.id,
          elementId: element.id,
        }, {});
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

function invalidV2Code(message: string): LayoutPreflightCodeV2 {
  if (/dialogueBindings.*duplicate|duplicate id/i.test(message)) return "DIALOGUE_BINDING_DUPLICATE";
  if (/dialogueBindings|balloon.*missing|bound more than once/i.test(message)) return "DIALOGUE_BINDING_DANGLING";
  if (/automation\.protections|protection target|scope .*not applicable/i.test(message)) return "LAYOUT_PROTECTION_INVALID";
  return "LAYOUT_SCHEMA_INVALID";
}

function digestCurrentCompositionEvidenceV2(
  value: LayoutCurrentCompositionV2 | null,
): LayoutDigest | null {
  if (value === null) return null;
  return digestCanonicalJson({
    ...value,
    compositionSourceLocks: [...value.compositionSourceLocks]
      .sort((left, right) => compareUnicode(left.shotId, right.shotId)),
  });
}

function invalidV2Report(input: {
  target: LayoutPreflightTargetV2;
  profile: LayoutPublicationProfileV1 | null;
  dialogueLedger: LayoutDialogueLedgerV1;
  currentComposition: LayoutCurrentCompositionV2 | null;
}, error: unknown): LayoutPreflightReportV2 {
  const message = error instanceof Error ? error.message : "invalid V2 document";
  const code = invalidV2Code(message);
  const identity = {
    code,
    canvasId: null,
    elementId: null,
    shotId: null,
    details: { reason: message.slice(0, 500) },
  };
  const issue: LayoutPreflightIssueV2 = {
    issueKey: `issue_${digestCanonicalJson(identity).slice(7, 31)}`,
    severity: "error",
    blockingScopes: ["revision", "export"],
    requiresAcknowledgement: false,
    ...identity,
  };
  const exportProfileDigest = input.profile ? digestCanonicalJson(input.profile) : null;
  const dialogueCoverage = {
    expected: Array.isArray(input.dialogueLedger?.items) ? input.dialogueLedger.items.length : 0,
    placedOriginal: 0,
    userModified: 0,
    userSuppressed: 0,
  };
  const currentCompositionEvidenceDigest = digestCurrentCompositionEvidenceV2(
    input.currentComposition,
  );
  const digestInput = {
    policyVersion: "layout_preflight_v2",
    target: input.target,
    sourceLockSetDigest: null,
    currentLockSetDigest: null,
    compositionDigest: null,
    currentCompositionEvidenceDigest,
    dialogueLedgerDigest: input.dialogueLedger.ledgerDigest,
    dialogueCoverage,
    exportProfileDigest,
    issues: [issue],
  };
  return {
    schemaVersion: 2,
    policyVersion: "layout_preflight_v2",
    target: input.target,
    sourceLockSetDigest: null,
    currentLockSetDigest: null,
    compositionDigest: null,
    currentCompositionEvidenceDigest,
    dialogueLedgerDigest: input.dialogueLedger.ledgerDigest,
    dialogueCoverage,
    exportProfileDigest,
    status: "blocked",
    issues: [issue],
    preflightDigest: digestCanonicalJson(digestInput),
  };
}

export function runLayoutPreflightV2(input: {
  document: unknown;
  target: LayoutPreflightTargetV2;
  currentSources: readonly LayoutSourceCatalogItemV1[];
  activeShotIds?: readonly string[];
  imageAssets: Readonly<Record<string, LayoutPreflightImageAssetV1>>;
  fontCatalog: readonly LayoutFontCatalogItemV1[];
  profile: LayoutPublicationProfileV1 | null;
  dialogueLedger: LayoutDialogueLedgerV1;
  currentComposition: LayoutCurrentCompositionV2 | null;
  workingCopyRevisionDocumentDigest?: LayoutDigest | null;
}): LayoutPreflightReportV2 {
  let revision: ReturnType<typeof LayoutDocumentCodecV2.encode>;
  try {
    revision = LayoutDocumentCodecV2.encode(input.document);
  } catch (error) {
    return invalidV2Report(input, error);
  }
  const document: LayoutDocumentV2 = revision.value;
  const currentCompositionEvidenceDigest = digestCurrentCompositionEvidenceV2(
    input.currentComposition,
  );
  const visible = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(document));
  const stableVisible = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(
    LayoutDocumentCodecV2.parse(revision.canonical),
  ));
  const base = runLayoutPreflightV1({
    document: visible.value,
    target: {
      kind: input.target.kind,
      id: input.target.id,
      documentDigest: visible.digest,
      rowVersion: input.target.rowVersion,
    },
    currentSources: input.currentSources,
    activeShotIds: input.activeShotIds,
    imageAssets: input.imageAssets,
    fontCatalog: input.fontCatalog,
    profile: input.profile,
  });
  const issues: LayoutPreflightIssueV2[] = base.issues.map((issue) => ({ ...issue }));
  const dedupe = new Set(issues.map((issue) => issue.issueKey));
  const add = (
    code: LayoutPreflightCodeV2,
    severity: LayoutPreflightIssueV2["severity"],
    blockingScopes: LayoutPreflightIssueV2["blockingScopes"],
    requiresAcknowledgement: boolean,
    location: { canvasId?: string | null; elementId?: string | null; shotId?: string | null },
    details: Record<string, string | number | boolean | null> = {},
  ): void => {
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

  if (revision.digest !== input.target.revisionDocumentDigest) {
    add("REVISION_DOCUMENT_DIGEST_MISMATCH", "error", ["revision", "export"], false, {}, {
      actualRevisionDocumentDigest: revision.digest,
    });
  }
  if (visible.digest !== input.target.visibleDocumentDigest) {
    add("VISIBLE_DOCUMENT_DIGEST_MISMATCH", "error", ["revision", "export"], false, {}, {
      actualVisibleDocumentDigest: visible.digest,
    });
  }
  if (stableVisible.digest !== visible.digest) {
    add("VISIBLE_PROJECTION_UNSTABLE", "error", ["revision", "export"], false, {}, {
      firstVisibleDocumentDigest: visible.digest,
      secondVisibleDocumentDigest: stableVisible.digest,
    });
  }

  const ledgerBase = {
    schemaVersion: input.dialogueLedger.schemaVersion,
    policyVersion: input.dialogueLedger.policyVersion,
    items: input.dialogueLedger.items,
    issues: input.dialogueLedger.issues,
  };
  if (
    input.dialogueLedger.schemaVersion !== 1
    || input.dialogueLedger.policyVersion !== "layout_dialogue_v1"
    || input.dialogueLedger.ledgerDigest !== digestCanonicalJson(ledgerBase)
  ) {
    add("DIALOGUE_LEDGER_INVALID", "error", ["revision", "export"], false, {}, {});
  }
  const itemById = new Map(input.dialogueLedger.items.map((item) => [item.id, item]));
  if (itemById.size !== input.dialogueLedger.items.length) {
    add("DIALOGUE_LEDGER_INVALID", "error", ["revision", "export"], false, {}, {
      reason: "duplicate_item_id",
    });
  }
  for (const ledgerIssue of input.dialogueLedger.issues) {
    if (ledgerIssue.severity !== "warning") continue;
    add("DIALOGUE_LEDGER_WARNING", "warning", [], true, { shotId: ledgerIssue.shotId }, {
      ledgerCode: ledgerIssue.code,
      source: ledgerIssue.source,
      sourceIndex: ledgerIssue.sourceIndex,
    });
  }

  const bindingById = new Map(document.automation.dialogueBindings.map((binding) => [
    binding.dialogueItemId,
    binding,
  ]));
  if (bindingById.size !== document.automation.dialogueBindings.length) {
    add("DIALOGUE_BINDING_DUPLICATE", "error", ["revision", "export"], false, {}, {});
  }
  const balloonById = new Map<string, {
    canvasId: string;
    balloon: Extract<LayoutDocumentV1["canvases"][number]["elements"][number], { type: "balloon" }>;
  }>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type === "balloon") balloonById.set(element.id, { canvasId: canvas.id, balloon: element });
    }
  }
  const dialogueCoverage: LayoutDialogueCoverageSummaryV2 = {
    expected: input.dialogueLedger.items.length,
    placedOriginal: 0,
    userModified: 0,
    userSuppressed: 0,
  };
  for (const item of input.dialogueLedger.items) {
    const binding = bindingById.get(item.id);
    if (!binding) {
      add("DIALOGUE_BINDING_MISSING", "error", ["revision", "export"], false, { shotId: item.shotId }, {
        dialogueItemId: item.id,
      });
      continue;
    }
    if (
      binding.sourceShotId !== item.shotId
      || binding.sourceTextDigest !== item.sourceTextDigest
      || binding.initialTextDigest !== item.textDigest
    ) {
      add("DIALOGUE_BINDING_SOURCE_MISMATCH", "error", ["revision", "export"], false, {
        elementId: binding.elementId,
        shotId: item.shotId,
      }, { dialogueItemId: item.id });
    }
    if (binding.disposition === "user_suppressed") {
      dialogueCoverage.userSuppressed += 1;
      const located = binding.elementId === null ? null : balloonById.get(binding.elementId);
      add("DIALOGUE_USER_SUPPRESSED", "warning", [], true, {
        canvasId: located?.canvasId ?? null,
        elementId: binding.elementId,
        shotId: item.shotId,
      }, {
        dialogueItemId: item.id,
        tombstone: binding.elementId === null,
      });
      continue;
    }
    if (binding.elementId === null) {
      add("DIALOGUE_BINDING_DANGLING", "error", ["revision", "export"], false, {
        shotId: item.shotId,
      }, { dialogueItemId: item.id });
      continue;
    }
    const located = balloonById.get(binding.elementId);
    if (!located) {
      add("DIALOGUE_BINDING_DANGLING", "error", ["revision", "export"], false, {
        elementId: binding.elementId,
        shotId: item.shotId,
      }, { dialogueItemId: item.id });
      continue;
    }
    const location = {
      canvasId: located.canvasId,
      elementId: located.balloon.id,
      shotId: item.shotId,
    };
    if (located.balloon.balloonKind !== item.kind) {
      add("DIALOGUE_BALLOON_KIND_MISMATCH", "error", ["revision", "export"], false, location, {
        dialogueItemId: item.id,
        actualKind: located.balloon.balloonKind,
        expectedKind: item.kind,
      });
    }
    if (located.balloon.speakerCharacterId !== item.speakerCharacterId) {
      add("DIALOGUE_BALLOON_SPEAKER_MISMATCH", "error", ["revision", "export"], false, location, {
        dialogueItemId: item.id,
        actualSpeakerCharacterId: located.balloon.speakerCharacterId,
        expectedSpeakerCharacterId: item.speakerCharacterId,
      });
    }
    const actualTextDigest = digestLayoutDialogueTextV1(
      richTextPlainTextV1(located.balloon.richText),
    );
    if (actualTextDigest === item.textDigest) {
      dialogueCoverage.placedOriginal += 1;
      continue;
    }
    const textProtected = document.automation.protections.some((entry) => (
      entry.targetKind === "element"
      && entry.targetId === located.balloon.id
      && entry.reason === "user_edit"
      && entry.scopes.includes("text")
    ));
    if (!textProtected) {
      add("DIALOGUE_TEXT_UNPROTECTED", "error", ["revision", "export"], false, location, {
        dialogueItemId: item.id,
      });
      continue;
    }
    dialogueCoverage.userModified += 1;
    add("DIALOGUE_USER_MODIFIED", "warning", [], true, location, {
      dialogueItemId: item.id,
      actualTextDigest,
      initialTextDigest: item.textDigest,
    });
  }
  for (const binding of document.automation.dialogueBindings) {
    if (itemById.has(binding.dialogueItemId)) continue;
    add("DIALOGUE_BINDING_UNEXPECTED", "error", ["revision", "export"], false, {
      elementId: binding.elementId,
      shotId: binding.sourceShotId,
    }, { dialogueItemId: binding.dialogueItemId });
  }

  const composition = document.automation.composition;
  if (composition === null) {
    add("LAYOUT_COMPOSITION_MISSING", "error", ["revision", "export"], false, {}, {});
  } else if (input.currentComposition === null) {
    add("LAYOUT_COMPOSITION_STALE", "error", ["revision", "export"], false, {}, {
      reason: "authoritative_composition_evidence_missing",
    });
    add("LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH", "error", ["revision", "export"], false, {}, {
      compositionSourceLockSetDigest: composition.sourceLockSetDigest,
      reason: "authoritative_source_lock_evidence_missing",
    });
  } else {
    const staleFields: string[] = [];
    if (composition.compositionDigest !== input.currentComposition.compositionDigest) {
      staleFields.push("compositionDigest");
    }
    if (composition.storyboardVersionId !== input.currentComposition.storyboardVersionId) {
      staleFields.push("storyboardVersionId");
    }
    if (composition.storyboardDigest !== input.currentComposition.storyboardDigest) {
      staleFields.push("storyboardDigest");
    }
    if (composition.visualAnalysisSetDigest !== input.currentComposition.visualAnalysisSetDigest) {
      staleFields.push("visualAnalysisSetDigest");
    }
    if (staleFields.length > 0) {
      add("LAYOUT_COMPOSITION_STALE", "error", ["revision", "export"], false, {}, {
        fields: staleFields.join(","),
      });
    }
    const evidence = [...input.currentComposition.compositionSourceLocks]
      .sort((left, right) => compareUnicode(left.shotId, right.shotId));
    const evidenceByShot = new Map(evidence.map((entry) => [
      entry.shotId,
      entry.candidateLockRevisionId,
    ]));
    const evidenceDigest = evidence.length > 0 && evidenceByShot.size === evidence.length
      ? digestCanonicalJson(evidence)
      : null;
    const currentByShot = new Map(input.currentSources.map((entry) => [
      entry.source.shotId,
      entry.source.candidateLockRevisionId,
    ]));
    const activeShotIds = [...new Set(input.activeShotIds
      ?? input.currentSources.map((entry) => entry.source.shotId))]
      .sort(compareUnicode);
    const evidenceComplete = evidenceDigest === composition.sourceLockSetDigest
      && evidenceByShot.size === activeShotIds.length
      && activeShotIds.every((shotId) => evidenceByShot.has(shotId));
    const changedShotIds = activeShotIds.filter((shotId) => (
      evidenceByShot.get(shotId) !== currentByShot.get(shotId)
    ));
    const changedShotSet = new Set(changedShotIds);
    const appearances: Array<{
      shotId: string;
      targetKind: "panel_image" | "element";
      targetId: string;
    }> = [];
    for (const canvas of document.canvases) {
      for (const element of canvas.elements) {
        if (
          element.type === "panel_frame"
          && element.contentImage
          && changedShotSet.has(element.contentImage.source.shotId)
        ) {
          appearances.push({
            shotId: element.contentImage.source.shotId,
            targetKind: "panel_image",
            targetId: element.contentImage.id,
          });
        } else if (element.type === "free_image" && changedShotSet.has(element.source.shotId)) {
          appearances.push({
            shotId: element.source.shotId,
            targetKind: "element",
            targetId: element.id,
          });
        }
      }
    }
    const unprotectedAppearances = appearances.filter((appearance) => !document.automation.protections.some((entry) => (
      entry.targetKind === appearance.targetKind
      && entry.targetId === appearance.targetId
      && entry.reason === "user_edit"
      && entry.scopes.includes("source")
      && entry.scopes.includes("crop")
    )));
    const everyChangedShotAppears = changedShotIds.every((shotId) => (
      appearances.some((appearance) => appearance.shotId === shotId)
    ));
    const visibleSourcesAreCurrent = base.sourceLockSetDigest !== null
      && base.sourceLockSetDigest === base.currentLockSetDigest;
    if (!evidenceComplete) {
      add("LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH", "error", ["revision", "export"], false, {}, {
        compositionEvidenceDigest: evidenceDigest,
        compositionSourceLockSetDigest: composition.sourceLockSetDigest,
        evidenceComplete: false,
      });
    } else if (
      composition.sourceLockSetDigest !== base.currentLockSetDigest
      || composition.sourceLockSetDigest !== base.sourceLockSetDigest
    ) {
      if (
        evidenceComplete
        && changedShotIds.length > 0
        && everyChangedShotAppears
        && visibleSourcesAreCurrent
        && unprotectedAppearances.length === 0
      ) {
        add("LAYOUT_COMPOSITION_SOURCE_OVERRIDE", "warning", [], true, {}, {
          changedShotIds: changedShotIds.join(","),
          compositionSourceLockSetDigest: composition.sourceLockSetDigest,
          currentSourceLockSetDigest: base.currentLockSetDigest,
        });
      } else {
        add("LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH", "error", ["revision", "export"], false, {}, {
          changedShotIds: changedShotIds.join(","),
          compositionEvidenceDigest: evidenceDigest,
          compositionSourceLockSetDigest: composition.sourceLockSetDigest,
          currentSourceLockSetDigest: base.currentLockSetDigest,
          documentSourceLockSetDigest: base.sourceLockSetDigest,
          evidenceComplete,
          unprotectedAppearanceIds: unprotectedAppearances.map((entry) => entry.targetId).join(","),
        });
      }
    }
  }

  if (
    input.target.kind === "layout_revision"
    && input.workingCopyRevisionDocumentDigest
    && input.workingCopyRevisionDocumentDigest !== input.target.revisionDocumentDigest
  ) {
    add("WORKING_COPY_AHEAD_OF_REVISION", "warning", [], true, {}, {
      workingCopyRevisionDocumentDigest: input.workingCopyRevisionDocumentDigest,
    });
  }

  issues.sort((left, right) => left.issueKey.localeCompare(right.issueKey));
  const scope = input.target.kind === "working_copy" || input.profile === null ? "revision" : "export";
  const status = issues.some((issue) => issue.blockingScopes.includes(scope))
    ? "blocked"
    : issues.some((issue) => issue.severity === "warning" || issue.requiresAcknowledgement)
      ? "warning"
      : "ready";
  const digestInput = {
    policyVersion: "layout_preflight_v2",
    target: input.target,
    sourceLockSetDigest: base.sourceLockSetDigest,
    currentLockSetDigest: base.currentLockSetDigest,
    compositionDigest: composition?.compositionDigest ?? null,
    currentCompositionEvidenceDigest,
    dialogueLedgerDigest: input.dialogueLedger.ledgerDigest,
    dialogueCoverage,
    exportProfileDigest: base.exportProfileDigest,
    issues,
  };
  return {
    schemaVersion: 2,
    policyVersion: "layout_preflight_v2",
    target: input.target,
    sourceLockSetDigest: base.sourceLockSetDigest,
    currentLockSetDigest: base.currentLockSetDigest,
    compositionDigest: composition?.compositionDigest ?? null,
    currentCompositionEvidenceDigest,
    dialogueLedgerDigest: input.dialogueLedger.ledgerDigest,
    dialogueCoverage,
    exportProfileDigest: base.exportProfileDigest,
    status,
    issues,
    preflightDigest: digestCanonicalJson(digestInput),
  };
}
