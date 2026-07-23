import { digestCanonicalJson } from "../../packages/shared/src/index.ts";

export const M3_HUMAN_REVIEW_STANDARD_ID_V2 = "AIR-QA-COMIC-FINAL-001-v1" as const;
export const M3_HUMAN_REVIEW_THRESHOLDS_V2 = {
  normal: 0.9,
  challenging: 0.8,
} as const;

export const M3_PANEL_REASONS_V2 = [
  "layout_ok",
  "crop_ok",
  "reading_order_ok",
  "subject_occlusion_ok",
] as const;

export const M3_BALLOON_REASONS_V2 = [
  "balloon_geometry_ok",
  "balloon_type_ok",
  "reading_order_ok",
  "subject_occlusion_ok",
  "text_fit_ok",
  "source_fidelity_ok",
  "tail_ok",
  "shape_safe_ok",
] as const;

export const M3_PAGE_REASONS_V2 = [
  "page_reading_order",
  "page_rhythm",
  "page_publishable",
] as const;

const ITEM_CRITICAL_REASONS = new Set<string>([
  "crop_ok",
  "reading_order_ok",
  "subject_occlusion_ok",
  "text_fit_ok",
  "source_fidelity_ok",
  "tail_ok",
  "shape_safe_ok",
]);
const PAGE_CRITICAL_REASONS = new Set<string>(["page_reading_order"]);

export type M3HumanReviewRoundV2 = "A" | "B";
export type M3HumanReviewDifficultyV2 = "normal" | "challenging";
export type M3HumanReviewBucketNameV2 = "panel" | "required_balloon" | "page";
export type M3HumanReviewStatusV2 =
  | "passed"
  | "pending"
  | "invalid"
  | "critical_failure"
  | "below_threshold";

export interface M3HumanReviewManifestItemV2 {
  variantId: string;
  variantTitle: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  difficulty: M3HumanReviewDifficultyV2;
  itemType: "panel" | "required_balloon";
  itemId: string;
  shotId: string;
  shotOrder: number;
  shotSummary: string;
  sourceText: string;
  speakerName: string;
  balloonKind: string;
  evidencePath: string;
  sourceImagePath: string;
  overlay: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface M3HumanReviewManifestPageV2 {
  pageId: string;
  variantId: string;
  variantTitle: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  difficulty: M3HumanReviewDifficultyV2;
  evidencePath: string;
  label: string;
  itemIds: string[];
}

export interface M3HumanReviewManifestV2 {
  schemaVersion: 2;
  kind: "m3_human_review_visual_evidence_v2";
  reviewStandardId: typeof M3_HUMAN_REVIEW_STANDARD_ID_V2;
  acceptancePolicy: {
    normalDirectUseRate: 0.9;
    challengingDirectUseRate: 0.8;
    criticalVisibleFailureLimit: 0;
    requiredIndependentRounds: 2;
    buckets: ["panel", "required_balloon", "page"];
  };
  sourceStatement: string;
  sourceAssetCount: number;
  sourceAssetSetDigest: `sha256:${string}`;
  sourceAssets: Array<{
    key: string;
    category: "empty" | "single" | "two" | "group" | "effect";
    relativePath: string;
    mimeType: "image/jpeg" | "image/png";
    sha256: `sha256:${string}`;
    width: number;
    height: number;
  }>;
  renderer: Record<string, unknown> | null;
  variantCount: number;
  pageCount: number;
  panelCount: number;
  balloonCount: number;
  pages: M3HumanReviewManifestPageV2[];
  items: M3HumanReviewManifestItemV2[];
  artifacts: Array<{
    variantId: string;
    role: string;
    order: number;
    relativePath: string;
    sha256: string;
    bytes: number;
    width?: number;
    height?: number;
  }>;
  outputManifestDigest: `sha256:${string}`;
}

export interface M3HumanReviewRateV2 {
  passed: number;
  total: number;
  rate: number;
  threshold: number;
}

export interface M3HumanReviewDifficultyResultV2 {
  panel: M3HumanReviewRateV2;
  balloon: M3HumanReviewRateV2;
  page: M3HumanReviewRateV2;
}

export interface M3HumanReviewRoundResultV2 {
  round: M3HumanReviewRoundV2;
  status: M3HumanReviewStatusV2;
  reviewerId: string | null;
  completedAt: string | null;
  completed: number;
  expected: number;
  normal: M3HumanReviewDifficultyResultV2;
  challenging: M3HumanReviewDifficultyResultV2;
  criticalFailureCount: number;
  criticalFailures: Array<{ id: string; failed: string[] }>;
  errors: string[];
}

export interface M3HumanReviewPairResultV2 {
  reviewStandardId: typeof M3_HUMAN_REVIEW_STANDARD_ID_V2;
  status: M3HumanReviewStatusV2;
  releaseGatePassed: boolean;
  roundA: M3HumanReviewRoundResultV2;
  roundB: M3HumanReviewRoundResultV2;
  errors: string[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function parseJson(value: string | unknown, label: string): { value: unknown; errors: string[] } {
  if (typeof value !== "string") return { value, errors: [] };
  try {
    return { value: JSON.parse(value), errors: [] };
  } catch {
    return { value: null, errors: [`${label}:JSON_PARSE_FAILED`] };
  }
}

function exactString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function digestString(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function normalizedRate(passed: number, total: number): number {
  return total === 0 ? 1 : Math.round((passed / total) * 100_000) / 100_000;
}

function emptyDifficultyResult(difficulty: M3HumanReviewDifficultyV2): M3HumanReviewDifficultyResultV2 {
  const threshold = M3_HUMAN_REVIEW_THRESHOLDS_V2[difficulty];
  const empty = (): M3HumanReviewRateV2 => ({ passed: 0, total: 0, rate: 1, threshold });
  return { panel: empty(), balloon: empty(), page: empty() };
}

export function validateM3HumanReviewManifestV2(
  input: string | unknown,
): { manifest: M3HumanReviewManifestV2 | null; errors: string[] } {
  const parsed = parseJson(input, "manifest");
  const errors = [...parsed.errors];
  const value = record(parsed.value);
  if (!value) return { manifest: null, errors: [...errors, "manifest:OBJECT_REQUIRED"] };

  if (value.schemaVersion !== 2) errors.push("manifest:SCHEMA_VERSION_MISMATCH");
  if (value.kind !== "m3_human_review_visual_evidence_v2") errors.push("manifest:KIND_MISMATCH");
  if (value.reviewStandardId !== M3_HUMAN_REVIEW_STANDARD_ID_V2) errors.push("manifest:STANDARD_ID_MISMATCH");
  const policy = record(value.acceptancePolicy);
  if (!policy
    || policy.normalDirectUseRate !== 0.9
    || policy.challengingDirectUseRate !== 0.8
    || policy.criticalVisibleFailureLimit !== 0
    || policy.requiredIndependentRounds !== 2
    || JSON.stringify(policy.buckets) !== JSON.stringify(["panel", "required_balloon", "page"])) {
    errors.push("manifest:ACCEPTANCE_POLICY_MISMATCH");
  }
  if (!exactString(value.sourceStatement)) errors.push("manifest:SOURCE_STATEMENT_REQUIRED");
  if (!digestString(value.sourceAssetSetDigest)) errors.push("manifest:SOURCE_ASSET_SET_DIGEST_INVALID");
  if (!digestString(value.outputManifestDigest)) errors.push("manifest:OUTPUT_DIGEST_INVALID");
  if (!Array.isArray(value.sourceAssets)) errors.push("manifest:SOURCE_ASSETS_REQUIRED");
  if (!Array.isArray(value.pages)) errors.push("manifest:PAGES_REQUIRED");
  if (!Array.isArray(value.items)) errors.push("manifest:ITEMS_REQUIRED");
  if (!Array.isArray(value.artifacts)) errors.push("manifest:ARTIFACTS_REQUIRED");
  if (errors.length > 0) return { manifest: null, errors };

  const sourceAssets = value.sourceAssets as unknown[];
  const pages = value.pages as unknown[];
  const items = value.items as unknown[];
  const artifacts = value.artifacts as unknown[];
  if (value.sourceAssetCount !== sourceAssets.length) errors.push("manifest:SOURCE_ASSET_COUNT_MISMATCH");
  if (value.pageCount !== pages.length) errors.push("manifest:PAGE_COUNT_MISMATCH");

  const sourcePaths = new Set<string>();
  const sourceKeys = new Set<string>();
  const sourceDigestInput: Array<{ key: string; sha256: string; width: number; height: number }> = [];
  for (const [index, candidate] of sourceAssets.entries()) {
    const asset = record(candidate);
    const prefix = `manifest:SOURCE_${index}`;
    if (!asset) {
      errors.push(`${prefix}:OBJECT_REQUIRED`);
      continue;
    }
    if (!exactString(asset.key) || sourceKeys.has(asset.key)) errors.push(`${prefix}:KEY_INVALID_OR_DUPLICATE`);
    else sourceKeys.add(asset.key);
    if (!exactString(asset.relativePath) || sourcePaths.has(asset.relativePath)) {
      errors.push(`${prefix}:PATH_INVALID_OR_DUPLICATE`);
    } else {
      sourcePaths.add(asset.relativePath);
    }
    if (!digestString(asset.sha256)) errors.push(`${prefix}:DIGEST_INVALID`);
    if (!positiveInteger(asset.width) || !positiveInteger(asset.height)) errors.push(`${prefix}:DIMENSIONS_INVALID`);
    if (asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/png") errors.push(`${prefix}:MIME_INVALID`);
    if (!["empty", "single", "two", "group", "effect"].includes(String(asset.category))) {
      errors.push(`${prefix}:CATEGORY_INVALID`);
    }
    if (exactString(asset.key) && digestString(asset.sha256)
      && positiveInteger(asset.width) && positiveInteger(asset.height)) {
      sourceDigestInput.push({
        key: asset.key,
        sha256: asset.sha256,
        width: asset.width,
        height: asset.height,
      });
    }
  }
  if (digestCanonicalJson(sourceDigestInput) !== value.sourceAssetSetDigest) {
    errors.push("manifest:SOURCE_ASSET_SET_DIGEST_MISMATCH");
  }

  const artifactPaths = new Set<string>();
  for (const [index, candidate] of artifacts.entries()) {
    const artifact = record(candidate);
    if (!artifact || !exactString(artifact.relativePath) || artifactPaths.has(artifact.relativePath)) {
      errors.push(`manifest:ARTIFACT_${index}:PATH_INVALID_OR_DUPLICATE`);
      continue;
    }
    artifactPaths.add(artifact.relativePath);
    if (!digestString(artifact.sha256)) errors.push(`manifest:ARTIFACT_${index}:DIGEST_INVALID`);
    if (!positiveInteger(artifact.bytes)) errors.push(`manifest:ARTIFACT_${index}:BYTES_INVALID`);
  }

  const itemById = new Map<string, JsonRecord>();
  let panelCount = 0;
  let balloonCount = 0;
  const variantIds = new Set<string>();
  for (const [index, candidate] of items.entries()) {
    const item = record(candidate);
    const prefix = `manifest:ITEM_${index}`;
    if (!item) {
      errors.push(`${prefix}:OBJECT_REQUIRED`);
      continue;
    }
    if (!exactString(item.itemId) || itemById.has(item.itemId)) {
      errors.push(`${prefix}:ID_INVALID_OR_DUPLICATE`);
    } else {
      itemById.set(item.itemId, item);
    }
    if (item.itemType === "panel") panelCount += 1;
    else if (item.itemType === "required_balloon") balloonCount += 1;
    else errors.push(`${prefix}:TYPE_INVALID`);
    if (item.difficulty !== "normal" && item.difficulty !== "challenging") errors.push(`${prefix}:DIFFICULTY_INVALID`);
    if (!exactString(item.variantId)) errors.push(`${prefix}:VARIANT_ID_REQUIRED`);
    else variantIds.add(item.variantId);
    for (const field of ["variantTitle", "shotId", "shotSummary", "evidencePath", "sourceImagePath"] as const) {
      if (!exactString(item[field])) errors.push(`${prefix}:${field}:REQUIRED`);
    }
    if (!positiveInteger(item.shotOrder)) errors.push(`${prefix}:SHOT_ORDER_INVALID`);
    if (!sourcePaths.has(String(item.sourceImagePath))) errors.push(`${prefix}:SOURCE_IMAGE_NOT_FROZEN`);
    if (!artifactPaths.has(String(item.evidencePath))) errors.push(`${prefix}:EVIDENCE_NOT_FROZEN`);
    const overlay = record(item.overlay);
    if (!overlay) {
      errors.push(`${prefix}:OVERLAY_REQUIRED`);
    } else {
      const x = Number(overlay.x);
      const y = Number(overlay.y);
      const width = Number(overlay.width);
      const height = Number(overlay.height);
      if (![x, y, width, height].every(Number.isFinite)
        || x < 0 || y < 0 || width <= 0 || height <= 0
        || x + width > 1.001 || y + height > 1.001) {
        errors.push(`${prefix}:OVERLAY_INVALID`);
      }
    }
  }
  if (value.panelCount !== panelCount) errors.push("manifest:PANEL_COUNT_MISMATCH");
  if (value.balloonCount !== balloonCount) errors.push("manifest:BALLOON_COUNT_MISMATCH");
  if (value.variantCount !== variantIds.size) errors.push("manifest:VARIANT_COUNT_MISMATCH");

  const pageIds = new Set<string>();
  const itemMembership = new Map<string, number>();
  for (const [index, candidate] of pages.entries()) {
    const page = record(candidate);
    const prefix = `manifest:PAGE_${index}`;
    if (!page) {
      errors.push(`${prefix}:OBJECT_REQUIRED`);
      continue;
    }
    if (!exactString(page.pageId) || pageIds.has(page.pageId)) errors.push(`${prefix}:ID_INVALID_OR_DUPLICATE`);
    else pageIds.add(page.pageId);
    if (!exactString(page.evidencePath) || !artifactPaths.has(page.evidencePath)) {
      errors.push(`${prefix}:EVIDENCE_NOT_FROZEN`);
    }
    if (!Array.isArray(page.itemIds) || page.itemIds.length === 0) {
      errors.push(`${prefix}:ITEM_IDS_REQUIRED`);
      continue;
    }
    const localIds = new Set<string>();
    for (const itemId of page.itemIds) {
      if (!exactString(itemId) || localIds.has(itemId)) {
        errors.push(`${prefix}:ITEM_ID_INVALID_OR_DUPLICATE`);
        continue;
      }
      localIds.add(itemId);
      itemMembership.set(itemId, (itemMembership.get(itemId) ?? 0) + 1);
      const item = itemById.get(itemId);
      if (!item) {
        errors.push(`${prefix}:${itemId}:ITEM_UNKNOWN`);
      } else if (item.evidencePath !== page.evidencePath
        || item.variantId !== page.variantId
        || item.difficulty !== page.difficulty) {
        errors.push(`${prefix}:${itemId}:ITEM_PAGE_MISMATCH`);
      }
    }
  }
  for (const itemId of itemById.keys()) {
    if (itemMembership.get(itemId) !== 1) errors.push(`manifest:${itemId}:ITEM_MUST_BELONG_TO_ONE_PAGE`);
  }

  const { outputManifestDigest: _digest, ...unsigned } = value;
  if (digestCanonicalJson(unsigned) !== value.outputManifestDigest) {
    errors.push("manifest:OUTPUT_DIGEST_MISMATCH");
  }
  return {
    manifest: errors.length === 0 ? value as unknown as M3HumanReviewManifestV2 : null,
    errors,
  };
}

interface ParsedDecisionResult {
  complete: boolean;
  passed: boolean;
  critical: boolean;
  failed: string[];
}

function validateDecision(input: {
  decision: JsonRecord;
  allowedReasons: readonly string[];
  criticalReasons: ReadonlySet<string>;
  prefix: string;
  errors: string[];
}): ParsedDecisionResult {
  const allowed = new Set(input.allowedReasons);
  const failedValue = input.decision.failed;
  const failed = Array.isArray(failedValue) && failedValue.every((entry) => typeof entry === "string")
    ? failedValue as string[]
    : [];
  if (!Array.isArray(failedValue) || failedValue.some((entry) => typeof entry !== "string")) {
    input.errors.push(`${input.prefix}:FAILED_REASONS_INVALID`);
  }
  if (new Set(failed).size !== failed.length) input.errors.push(`${input.prefix}:FAILED_REASONS_DUPLICATE`);
  for (const reason of failed) {
    if (!allowed.has(reason)) input.errors.push(`${input.prefix}:FAILED_REASON_NOT_APPLICABLE:${reason}`);
  }
  const state = input.decision.state;
  const notes = typeof input.decision.notes === "string" ? input.decision.notes : "";
  if (typeof input.decision.notes !== "string") input.errors.push(`${input.prefix}:NOTES_INVALID`);
  if (state !== "pass" && state !== "adjust") input.errors.push(`${input.prefix}:STATE_INVALID`);
  if (state === "pass" && (failed.length > 0 || notes.trim().length > 0)) {
    input.errors.push(`${input.prefix}:PASS_MUST_NOT_HAVE_FAILURES`);
  }
  if (state === "adjust" && (failed.length === 0 || notes.trim().length === 0)) {
    input.errors.push(`${input.prefix}:ADJUSTMENT_REASON_AND_NOTES_REQUIRED`);
  }
  const critical = failed.some((reason) => input.criticalReasons.has(reason));
  if (input.decision.critical !== critical) input.errors.push(`${input.prefix}:CRITICAL_FLAG_MISMATCH`);
  return {
    complete: state === "pass" || (state === "adjust" && failed.length > 0 && notes.trim().length > 0),
    passed: state === "pass",
    critical,
    failed,
  };
}

function buildRate(
  passed: number,
  total: number,
  difficulty: M3HumanReviewDifficultyV2,
): M3HumanReviewRateV2 {
  return {
    passed,
    total,
    rate: normalizedRate(passed, total),
    threshold: M3_HUMAN_REVIEW_THRESHOLDS_V2[difficulty],
  };
}

export function validateM3HumanReviewRoundV2(input: {
  round: M3HumanReviewRoundV2;
  review: string | unknown;
  manifest: string | unknown;
}): M3HumanReviewRoundResultV2 {
  const manifestResult = validateM3HumanReviewManifestV2(input.manifest);
  const empty = {
    round: input.round,
    status: "invalid" as const,
    reviewerId: null,
    completedAt: null,
    completed: 0,
    expected: 0,
    normal: emptyDifficultyResult("normal"),
    challenging: emptyDifficultyResult("challenging"),
    criticalFailureCount: 0,
    criticalFailures: [],
    errors: manifestResult.errors,
  };
  if (!manifestResult.manifest) return empty;
  const manifest = manifestResult.manifest;
  const parsed = parseJson(input.review, `round_${input.round}`);
  const structuralErrors = [...parsed.errors];
  const pendingErrors: string[] = [];
  const review = record(parsed.value);
  if (!review) {
    return { ...empty, expected: manifest.items.length + manifest.pages.length, errors: [...structuralErrors, `round_${input.round}:OBJECT_REQUIRED`] };
  }
  const prefix = `round_${input.round}`;
  if (review.schemaVersion !== 2) structuralErrors.push(`${prefix}:SCHEMA_VERSION_MISMATCH`);
  if (review.kind !== "m3_human_review_v2") structuralErrors.push(`${prefix}:KIND_MISMATCH`);
  if (review.reviewStandardId !== manifest.reviewStandardId) structuralErrors.push(`${prefix}:STANDARD_ID_MISMATCH`);
  if (review.manifestDigest !== manifest.outputManifestDigest) structuralErrors.push(`${prefix}:MANIFEST_DIGEST_MISMATCH`);
  if (review.round !== input.round) structuralErrors.push(`${prefix}:ROUND_MISMATCH`);

  let reviewerId: string | null = null;
  if (typeof review.reviewerId !== "string") structuralErrors.push(`${prefix}:REVIEWER_ID_INVALID`);
  else if (review.reviewerId.trim().length === 0) pendingErrors.push(`${prefix}:REVIEWER_ID_MISSING`);
  else if (review.reviewerId !== review.reviewerId.trim()) structuralErrors.push(`${prefix}:REVIEWER_ID_NOT_TRIMMED`);
  else reviewerId = review.reviewerId;
  if (review.independent === false) pendingErrors.push(`${prefix}:INDEPENDENCE_NOT_CONFIRMED`);
  else if (review.independent !== true) structuralErrors.push(`${prefix}:INDEPENDENCE_INVALID`);
  if (review.calibrated === false) pendingErrors.push(`${prefix}:CALIBRATION_NOT_CONFIRMED`);
  else if (review.calibrated !== true) structuralErrors.push(`${prefix}:CALIBRATION_INVALID`);

  let completedAt: string | null = null;
  if (review.completedAt === null || review.completedAt === "") {
    pendingErrors.push(`${prefix}:COMPLETED_AT_MISSING`);
  } else if (typeof review.completedAt !== "string" || Number.isNaN(Date.parse(review.completedAt))) {
    structuralErrors.push(`${prefix}:COMPLETED_AT_INVALID`);
  } else {
    completedAt = review.completedAt;
  }

  const itemDecisions = Array.isArray(review.itemDecisions) ? review.itemDecisions : [];
  const pageDecisions = Array.isArray(review.pageDecisions) ? review.pageDecisions : [];
  if (!Array.isArray(review.itemDecisions)) structuralErrors.push(`${prefix}:ITEM_DECISIONS_REQUIRED`);
  if (!Array.isArray(review.pageDecisions)) structuralErrors.push(`${prefix}:PAGE_DECISIONS_REQUIRED`);
  const itemDecisionById = new Map<string, JsonRecord>();
  const pageDecisionById = new Map<string, JsonRecord>();
  for (const [index, candidate] of itemDecisions.entries()) {
    const decision = record(candidate);
    if (!decision || !exactString(decision.itemId) || itemDecisionById.has(decision.itemId)) {
      structuralErrors.push(`${prefix}:ITEM_DECISION_${index}:ID_INVALID_OR_DUPLICATE`);
    } else {
      itemDecisionById.set(decision.itemId, decision);
    }
  }
  for (const [index, candidate] of pageDecisions.entries()) {
    const decision = record(candidate);
    if (!decision || !exactString(decision.pageId) || pageDecisionById.has(decision.pageId)) {
      structuralErrors.push(`${prefix}:PAGE_DECISION_${index}:ID_INVALID_OR_DUPLICATE`);
    } else {
      pageDecisionById.set(decision.pageId, decision);
    }
  }
  const manifestItemIds = new Set(manifest.items.map((item) => item.itemId));
  const manifestPageIds = new Set(manifest.pages.map((page) => page.pageId));
  for (const itemId of itemDecisionById.keys()) {
    if (!manifestItemIds.has(itemId)) structuralErrors.push(`${prefix}:${itemId}:ITEM_DECISION_UNKNOWN`);
  }
  for (const pageId of pageDecisionById.keys()) {
    if (!manifestPageIds.has(pageId)) structuralErrors.push(`${prefix}:${pageId}:PAGE_DECISION_UNKNOWN`);
  }

  const totals = {
    normal: { panel: 0, balloon: 0, page: 0 },
    challenging: { panel: 0, balloon: 0, page: 0 },
  };
  const passed = {
    normal: { panel: 0, balloon: 0, page: 0 },
    challenging: { panel: 0, balloon: 0, page: 0 },
  };
  const criticalFailures: Array<{ id: string; failed: string[] }> = [];
  let completed = 0;

  for (const item of manifest.items) {
    const bucket = item.itemType === "panel" ? "panel" : "balloon";
    totals[item.difficulty][bucket] += 1;
    const decision = itemDecisionById.get(item.itemId);
    if (!decision) {
      pendingErrors.push(`${prefix}:${item.itemId}:DECISION_MISSING`);
      continue;
    }
    for (const [field, expected] of Object.entries({
      itemType: item.itemType,
      variantId: item.variantId,
      difficulty: item.difficulty,
      shotId: item.shotId,
      evidencePath: item.evidencePath,
      sourceImagePath: item.sourceImagePath,
    })) {
      if (decision[field] !== expected) structuralErrors.push(`${prefix}:${item.itemId}:${field}:SOURCE_MISMATCH`);
    }
    const before = structuralErrors.length;
    const result = validateDecision({
      decision,
      allowedReasons: item.itemType === "panel" ? M3_PANEL_REASONS_V2 : M3_BALLOON_REASONS_V2,
      criticalReasons: ITEM_CRITICAL_REASONS,
      prefix: `${prefix}:${item.itemId}`,
      errors: structuralErrors,
    });
    if (result.complete && structuralErrors.length === before) {
      completed += 1;
      if (result.passed) passed[item.difficulty][bucket] += 1;
      if (result.critical) criticalFailures.push({ id: item.itemId, failed: result.failed });
    }
  }

  for (const page of manifest.pages) {
    totals[page.difficulty].page += 1;
    const decision = pageDecisionById.get(page.pageId);
    if (!decision) {
      pendingErrors.push(`${prefix}:${page.pageId}:DECISION_MISSING`);
      continue;
    }
    for (const [field, expected] of Object.entries({
      variantId: page.variantId,
      difficulty: page.difficulty,
      evidencePath: page.evidencePath,
    })) {
      if (decision[field] !== expected) structuralErrors.push(`${prefix}:${page.pageId}:${field}:SOURCE_MISMATCH`);
    }
    const before = structuralErrors.length;
    const result = validateDecision({
      decision,
      allowedReasons: M3_PAGE_REASONS_V2,
      criticalReasons: PAGE_CRITICAL_REASONS,
      prefix: `${prefix}:${page.pageId}`,
      errors: structuralErrors,
    });
    if (result.complete && structuralErrors.length === before) {
      completed += 1;
      if (result.passed) passed[page.difficulty].page += 1;
      if (result.critical) criticalFailures.push({ id: page.pageId, failed: result.failed });
    }
  }

  const results = (difficulty: M3HumanReviewDifficultyV2): M3HumanReviewDifficultyResultV2 => ({
    panel: buildRate(passed[difficulty].panel, totals[difficulty].panel, difficulty),
    balloon: buildRate(passed[difficulty].balloon, totals[difficulty].balloon, difficulty),
    page: buildRate(passed[difficulty].page, totals[difficulty].page, difficulty),
  });
  const normal = results("normal");
  const challenging = results("challenging");
  const expected = manifest.items.length + manifest.pages.length;
  const belowThreshold = [normal.panel, normal.balloon, normal.page, challenging.panel, challenging.balloon, challenging.page]
    .some((bucket) => bucket.total > 0 && bucket.rate < bucket.threshold);

  let status: M3HumanReviewStatusV2;
  if (structuralErrors.length > 0) status = "invalid";
  else if (pendingErrors.length > 0 || completed !== expected) status = "pending";
  else if (criticalFailures.length > 0) status = "critical_failure";
  else if (belowThreshold) status = "below_threshold";
  else status = "passed";
  return {
    round: input.round,
    status,
    reviewerId,
    completedAt,
    completed,
    expected,
    normal,
    challenging,
    criticalFailureCount: criticalFailures.length,
    criticalFailures,
    errors: [...structuralErrors, ...pendingErrors],
  };
}

export function validateM3HumanReviewPairV2(input: {
  manifest: string | unknown;
  roundA: string | unknown;
  roundB: string | unknown;
}): M3HumanReviewPairResultV2 {
  const roundA = validateM3HumanReviewRoundV2({ round: "A", review: input.roundA, manifest: input.manifest });
  const roundB = validateM3HumanReviewRoundV2({ round: "B", review: input.roundB, manifest: input.manifest });
  const errors: string[] = [];
  if (roundA.reviewerId && roundB.reviewerId
    && roundA.reviewerId.localeCompare(roundB.reviewerId, undefined, { sensitivity: "accent" }) === 0) {
    errors.push("PAIR_REVIEWERS_MUST_BE_DISTINCT");
  }
  let status: M3HumanReviewStatusV2;
  if (errors.length > 0 || roundA.status === "invalid" || roundB.status === "invalid") status = "invalid";
  else if (roundA.status === "pending" || roundB.status === "pending") status = "pending";
  else if (roundA.status === "critical_failure" || roundB.status === "critical_failure") status = "critical_failure";
  else if (roundA.status === "below_threshold" || roundB.status === "below_threshold") status = "below_threshold";
  else status = "passed";
  return {
    reviewStandardId: M3_HUMAN_REVIEW_STANDARD_ID_V2,
    status,
    releaseGatePassed: status === "passed",
    roundA,
    roundB,
    errors,
  };
}
