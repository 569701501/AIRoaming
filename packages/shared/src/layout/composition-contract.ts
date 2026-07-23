import {
  canonicalJsonBytes,
  canonicalizeJson,
  digestCanonicalJson,
  sha256Bytes,
} from "../versioning/canonical-json.js";
import { StoryboardDocumentCodecV2 } from "../versioning/document-codec.js";
import type { StoryboardDocumentV2 } from "../versioning/document-contract.js";
import type { TaskSourceProjectionV1 } from "../versioning/task-source-projection.js";
import {
  LayoutDocumentCodecV2,
  type LayoutDocumentV2,
} from "./automation.js";
import {
  parseEditorCommandBatchV2,
  type EditorCommandBatchV2,
} from "./commands-v2.js";
import { LayoutProfileCodecV1 } from "./codec.js";
import type {
  CandidateImageSourceV1,
  EncodedLayoutValue,
  LayoutDigest,
  LayoutFontPolicyV1,
  LayoutProfileV1,
} from "./document.js";
import {
  parseLayoutImageAnalysisV1,
  type LayoutShotVisualAnalysisV1,
} from "./visual-analysis.js";
import {
  legacyLayoutTypographyPresetV1,
  type LayoutTypographyFaceV1,
  type LayoutTypographyPresetV1,
} from "./semantic-style.js";

export const LAYOUT_COMPOSITION_MODES_V1 = [
  "initial",
  "full_reflow",
  "scoped_reflow",
] as const;
export type LayoutCompositionModeV1 = (typeof LAYOUT_COMPOSITION_MODES_V1)[number];

export const LAYOUT_COMPOSITION_INTENTS_V1 = [
  "standard",
  "more_compact",
  "more_relaxed",
  "emphasize_focus",
  "dialogue_readability",
] as const;
export type LayoutCompositionIntentV1 = (typeof LAYOUT_COMPOSITION_INTENTS_V1)[number];

export interface LayoutCompositionScopeV1 {
  canvasIds: string[];
  elementIds: string[];
  shotIds: string[];
}

export interface CreateLayoutCompositionRequestV1 {
  schemaVersion: 1;
  mode: LayoutCompositionModeV1;
  intent: LayoutCompositionIntentV1;
  scope: LayoutCompositionScopeV1 | null;
  expectedWorkingCopyRowVersion: number | null;
  expectedDocumentDigest: LayoutDigest | null;
}

export interface LayoutCompositionSourceItemV1 {
  order: number;
  source: CandidateImageSourceV1;
  assetDigest: LayoutDigest;
  width: number;
  height: number;
}

export interface LayoutCompositionCharacterV1 {
  characterId: string;
  name: string;
}

export interface LayoutVisualAnalysisProviderV1 {
  providerId: string;
  modelId: string;
}

export interface LayoutCompositionFrozenSourceV1 {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  storyboard: {
    versionId: string;
    documentDigest: LayoutDigest;
    document: StoryboardDocumentV2;
  };
  candidateLockSet: {
    digest: LayoutDigest;
    items: LayoutCompositionSourceItemV1[];
  };
  characterCatalog: {
    digest: LayoutDigest;
    items: LayoutCompositionCharacterV1[];
  };
  fontPolicy: LayoutFontPolicyV1;
  typographyPreset: LayoutTypographyPresetV1;
  profile: LayoutProfileV1;
  visualAnalysisProvider: LayoutVisualAnalysisProviderV1 | null;
  baseWorkingCopy: null | {
    id: string;
    rowVersion: number;
    documentDigest: LayoutDigest;
    document: LayoutDocumentV2;
  };
  policy: {
    composition: "layout_composition_v1";
    dialogue: "layout_dialogue_v1";
    visualAnalysis: "layout_visual_analysis_v1";
    scoring: "layout_score_v1";
    automation: "layout_automation_v1";
  };
}

export interface LayoutCompositionTaskInputV1 {
  schemaVersion: 1;
  chapterId: string;
  mode: LayoutCompositionModeV1;
  intent: LayoutCompositionIntentV1;
  scope: LayoutCompositionScopeV1 | null;
  scopeDigest: LayoutDigest;
  policySetDigest: LayoutDigest;
  sourceProjection: TaskSourceProjectionV1;
  sourceProjectionDigest: LayoutDigest;
  source: LayoutCompositionFrozenSourceV1;
}

export interface LayoutCompositionIssueV1 {
  code: string;
  severity: "info" | "warning" | "error";
  canvasId: string | null;
  elementId: string | null;
  shotId: string | null;
}

export interface LayoutCompositionTaskOutputV1 {
  schemaVersion: 1;
  mode: LayoutCompositionModeV1;
  sourceProjectionDigest: LayoutDigest;
  baseDocumentDigest: LayoutDigest | null;
  result: {
    kind: "initial_document" | "command_batch";
    document: LayoutDocumentV2 | null;
    commandBatch: EditorCommandBatchV2 | null;
  };
  visualAnalyses: LayoutShotVisualAnalysisV1[];
  report: {
    planDigest: LayoutDigest;
    analysisMode: "vision" | "mixed" | "rule_fallback";
    candidateCount: number;
    selectedScore: number;
    scoreBreakdown: Record<string, number>;
    shotCoverage: { expected: number; placed: number };
    dialogueCoverage: {
      expected: number;
      placedOriginal: number;
      userModified: number;
      userSuppressed: number;
    };
    issues: LayoutCompositionIssueV1[];
  };
}

export interface LayoutCompositionApplicationEvidenceV1 {
  schemaVersion: 1;
  kind: "layout_composition_application_v1";
  taskId: string;
  result: "initial_working_copy" | "pending_command";
  targetId: string;
  baseDocumentDigest: LayoutDigest | null;
  resultDocumentDigest: LayoutDigest;
  targetRowVersion: number;
}

export interface LayoutCompositionApplyResponseV1 {
  schemaVersion: 1;
  result: "applied" | "replayed";
  target: "working_copy" | "pending_command";
  taskId: string;
  targetId: string;
  documentDigest: LayoutDigest;
  rowVersion: number;
}

export class LayoutCompositionContractError extends Error {
  readonly code = "LAYOUT_COMPOSITION_BODY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutCompositionContractError";
  }
}

function fail(path: string, message: string): never {
  throw new LayoutCompositionContractError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected a plain object");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) fail(`${path}.${key}`, "unknown field");
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}`, "missing required field");
  }
  return row;
}

function id(value: unknown, path: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 500
    || value.trim() !== value
    || value.includes("\0")
    || value.includes("\n")
    || value.includes("\r")
  ) fail(path, "expected a trimmed non-empty single-line ID");
  return value.normalize("NFC");
}

function text(value: unknown, path: string, maximum = 500): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || value.trim() !== value
    || value.includes("\0")
  ) fail(path, `expected trimmed text with at most ${maximum} characters`);
  return value.normalize("NFC");
}

function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    fail(path, `expected integer ${minimum}..${maximum}`);
  }
  return value;
}

function finite(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(path, `expected finite number >= ${minimum}`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function digest(value: unknown, path: string): LayoutDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    fail(path, "expected sha256:<64 lowercase hex> digest");
  }
  return value as LayoutDigest;
}

function nullableDigest(value: unknown, path: string): LayoutDigest | null {
  return value === null ? null : digest(value, path);
}

function enumeration<T extends string | number>(value: unknown, values: readonly T[], path: string): T {
  if (!values.includes(value as T)) {
    fail(path, `expected one of ${values.join(", ")}`);
  }
  return value as T;
}

function stringArray(value: unknown, path: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `expected at most ${maximum} IDs`);
  const result = value.map((item, index) => id(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail(path, "duplicate ID");
  return result;
}

function parseScope(value: unknown, path: string): LayoutCompositionScopeV1 {
  const row = exact(value, ["canvasIds", "elementIds", "shotIds"], path);
  return {
    canvasIds: stringArray(row.canvasIds, `${path}.canvasIds`, 2_000),
    elementIds: stringArray(row.elementIds, `${path}.elementIds`, 20_000),
    shotIds: stringArray(row.shotIds, `${path}.shotIds`, 20_000),
  };
}

function parseFontPolicy(value: unknown, path: string): LayoutFontPolicyV1 {
  const row = exact(value, ["defaultFontAssetId", "fallbackFontAssetIds"], path);
  const defaultFontAssetId = id(row.defaultFontAssetId, `${path}.defaultFontAssetId`);
  const fallbackFontAssetIds = stringArray(row.fallbackFontAssetIds, `${path}.fallbackFontAssetIds`, 32);
  if (fallbackFontAssetIds.includes(defaultFontAssetId)) fail(path, "default font must not be repeated as fallback");
  return { defaultFontAssetId, fallbackFontAssetIds };
}

function parseTypographyFace(value: unknown, path: string): LayoutTypographyFaceV1 {
  const row = exact(value, ["fontAssetId", "fontWeight", "fontStyle"], path);
  return {
    fontAssetId: id(row.fontAssetId, `${path}.fontAssetId`),
    fontWeight: enumeration(
      row.fontWeight,
      [100, 200, 300, 400, 500, 600, 700, 800, 900] as const,
      `${path}.fontWeight`,
    ),
    fontStyle: enumeration(row.fontStyle, ["normal", "italic"] as const, `${path}.fontStyle`),
  };
}

function parseTypographyPreset(value: unknown, path: string): LayoutTypographyPresetV1 {
  const row = exact(
    value,
    ["policyVersion", "speech", "thought", "shout", "caption"],
    path,
  );
  if (row.policyVersion !== "layout_typography_preset_v1") {
    fail(`${path}.policyVersion`, "expected layout_typography_preset_v1");
  }
  return {
    policyVersion: "layout_typography_preset_v1",
    speech: parseTypographyFace(row.speech, `${path}.speech`),
    thought: parseTypographyFace(row.thought, `${path}.thought`),
    shout: parseTypographyFace(row.shout, `${path}.shout`),
    caption: parseTypographyFace(row.caption, `${path}.caption`),
  };
}

function parseCandidateSource(value: unknown, path: string): CandidateImageSourceV1 {
  const row = exact(value, [
    "shotId",
    "candidateId",
    "candidateLockRevisionId",
    "assetId",
    "sourceDigest",
  ], path);
  return {
    shotId: id(row.shotId, `${path}.shotId`),
    candidateId: id(row.candidateId, `${path}.candidateId`),
    candidateLockRevisionId: id(row.candidateLockRevisionId, `${path}.candidateLockRevisionId`),
    assetId: id(row.assetId, `${path}.assetId`),
    sourceDigest: digest(row.sourceDigest, `${path}.sourceDigest`),
  };
}

export function parseCreateLayoutCompositionRequestV1(
  input: unknown,
): CreateLayoutCompositionRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "mode",
    "intent",
    "scope",
    "expectedWorkingCopyRowVersion",
    "expectedDocumentDigest",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  const mode = enumeration(row.mode, LAYOUT_COMPOSITION_MODES_V1, "request.mode");
  const intent = enumeration(row.intent, LAYOUT_COMPOSITION_INTENTS_V1, "request.intent");
  const scope = row.scope === null ? null : parseScope(row.scope, "request.scope");
  const expectedWorkingCopyRowVersion = row.expectedWorkingCopyRowVersion === null
    ? null
    : integer(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion");
  const expectedDocumentDigest = nullableDigest(row.expectedDocumentDigest, "request.expectedDocumentDigest");
  if (mode === "initial") {
    if (scope !== null || expectedWorkingCopyRowVersion !== null || expectedDocumentDigest !== null) {
      fail("request", "initial mode requires null scope and null working-copy expectations");
    }
  } else {
    if (expectedWorkingCopyRowVersion === null || expectedDocumentDigest === null) {
      fail("request", "reflow mode requires working-copy expectations");
    }
    if (mode === "full_reflow" && scope !== null) fail("request.scope", "full_reflow requires null scope");
    if (
      mode === "scoped_reflow"
      && (
        scope === null
        || scope.canvasIds.length + scope.elementIds.length + scope.shotIds.length === 0
      )
    ) fail("request.scope", "scoped_reflow requires at least one target");
  }
  if (mode === "initial" && intent !== "standard") fail("request.intent", "initial mode requires standard intent");
  return {
    schemaVersion: 1,
    mode,
    intent,
    scope,
    expectedWorkingCopyRowVersion,
    expectedDocumentDigest,
  };
}

export function digestLayoutCompositionScopeV1(
  scope: LayoutCompositionScopeV1 | null,
): LayoutDigest {
  return digestCanonicalJson({
    policyVersion: "layout_composition_scope_digest_v1",
    scope: scope === null
      ? null
      : {
          canvasIds: [...scope.canvasIds].sort(),
          elementIds: [...scope.elementIds].sort(),
          shotIds: [...scope.shotIds].sort(),
        },
  });
}

function parseFrozenSource(value: unknown, path: string): LayoutCompositionFrozenSourceV1 {
  const sourceValue = record(value, path);
  const row = exact({
    typographyPreset: null,
    visualAnalysisProvider: null,
    ...sourceValue,
  }, [
    "schemaVersion",
    "projectId",
    "chapterId",
    "comicFormat",
    "storyboard",
    "candidateLockSet",
    "characterCatalog",
    "fontPolicy",
    "typographyPreset",
    "profile",
    "visualAnalysisProvider",
    "baseWorkingCopy",
    "policy",
  ], path);
  if (row.schemaVersion !== 1) fail(`${path}.schemaVersion`, "expected 1");
  const projectId = id(row.projectId, `${path}.projectId`);
  const chapterId = id(row.chapterId, `${path}.chapterId`);
  const comicFormat = enumeration(
    row.comicFormat,
    ["vertical_scroll", "paged_comic"] as const,
    `${path}.comicFormat`,
  );
  const storyboardRow = exact(
    row.storyboard,
    ["versionId", "documentDigest", "document"],
    `${path}.storyboard`,
  );
  const storyboard = StoryboardDocumentCodecV2.encode(storyboardRow.document);
  const storyboardDigest = digest(storyboardRow.documentDigest, `${path}.storyboard.documentDigest`);
  if (storyboard.digest !== storyboardDigest) fail(`${path}.storyboard.documentDigest`, "does not match document");
  if (storyboard.value.chapterId !== chapterId) fail(`${path}.storyboard.document.chapterId`, "scope mismatch");

  const lockRow = exact(row.candidateLockSet, ["digest", "items"], `${path}.candidateLockSet`);
  if (!Array.isArray(lockRow.items) || lockRow.items.length < 1 || lockRow.items.length > 20_000) {
    fail(`${path}.candidateLockSet.items`, "expected 1..20000 items");
  }
  const items = lockRow.items.map((item, index): LayoutCompositionSourceItemV1 => {
    const itemPath = `${path}.candidateLockSet.items[${index}]`;
    const itemRow = exact(item, ["order", "source", "assetDigest", "width", "height"], itemPath);
    return {
      order: integer(itemRow.order, `${itemPath}.order`, 1, 20_000),
      source: parseCandidateSource(itemRow.source, `${itemPath}.source`),
      assetDigest: digest(itemRow.assetDigest, `${itemPath}.assetDigest`),
      width: integer(itemRow.width, `${itemPath}.width`, 1, 65_535),
      height: integer(itemRow.height, `${itemPath}.height`, 1, 65_535),
    };
  });
  if (new Set(items.map((item) => item.order)).size !== items.length) fail(`${path}.candidateLockSet.items`, "duplicate order");
  if (new Set(items.map((item) => item.source.shotId)).size !== items.length) {
    fail(`${path}.candidateLockSet.items`, "duplicate shot");
  }

  const charactersRow = exact(row.characterCatalog, ["digest", "items"], `${path}.characterCatalog`);
  if (!Array.isArray(charactersRow.items) || charactersRow.items.length > 20_000) {
    fail(`${path}.characterCatalog.items`, "expected at most 20000 items");
  }
  const characterItems = charactersRow.items.map((item, index): LayoutCompositionCharacterV1 => {
    const itemPath = `${path}.characterCatalog.items[${index}]`;
    const itemRow = exact(item, ["characterId", "name"], itemPath);
    return {
      characterId: id(itemRow.characterId, `${itemPath}.characterId`),
      name: text(itemRow.name, `${itemPath}.name`, 500),
    };
  });
  if (new Set(characterItems.map((item) => item.characterId)).size !== characterItems.length) {
    fail(`${path}.characterCatalog.items`, "duplicate character");
  }
  const characterDigest = digest(charactersRow.digest, `${path}.characterCatalog.digest`);
  if (digestCanonicalJson(characterItems) !== characterDigest) {
    fail(`${path}.characterCatalog.digest`, "does not match items");
  }

  const profile = LayoutProfileCodecV1.parseAndNormalize(row.profile);
  if (
    (comicFormat === "paged_comic" && profile.kind !== "paged")
    || (comicFormat === "vertical_scroll" && profile.kind !== "vertical_strip")
  ) fail(`${path}.profile`, "does not match comicFormat");
  const fontPolicy = parseFontPolicy(row.fontPolicy, `${path}.fontPolicy`);
  const typographyPreset = row.typographyPreset === null
    ? legacyLayoutTypographyPresetV1(fontPolicy)
    : parseTypographyPreset(row.typographyPreset, `${path}.typographyPreset`);
  const visualAnalysisProvider = row.visualAnalysisProvider === null
    ? null
    : (() => {
        const providerRow = exact(
          row.visualAnalysisProvider,
          ["providerId", "modelId"],
          `${path}.visualAnalysisProvider`,
        );
        return {
          providerId: id(providerRow.providerId, `${path}.visualAnalysisProvider.providerId`),
          modelId: id(providerRow.modelId, `${path}.visualAnalysisProvider.modelId`),
        };
      })();

  let baseWorkingCopy: LayoutCompositionFrozenSourceV1["baseWorkingCopy"] = null;
  if (row.baseWorkingCopy !== null) {
    const baseRow = exact(
      row.baseWorkingCopy,
      ["id", "rowVersion", "documentDigest", "document"],
      `${path}.baseWorkingCopy`,
    );
    const document = LayoutDocumentCodecV2.encode(baseRow.document, { projectId, chapterId, comicFormat });
    const documentDigest = digest(baseRow.documentDigest, `${path}.baseWorkingCopy.documentDigest`);
    if (document.digest !== documentDigest) fail(`${path}.baseWorkingCopy.documentDigest`, "does not match document");
    baseWorkingCopy = {
      id: id(baseRow.id, `${path}.baseWorkingCopy.id`),
      rowVersion: integer(baseRow.rowVersion, `${path}.baseWorkingCopy.rowVersion`),
      documentDigest,
      document: document.value,
    };
  }

  const policyRow = exact(
    row.policy,
    ["composition", "dialogue", "visualAnalysis", "scoring", "automation"],
    `${path}.policy`,
  );
  if (
    policyRow.composition !== "layout_composition_v1"
    || policyRow.dialogue !== "layout_dialogue_v1"
    || policyRow.visualAnalysis !== "layout_visual_analysis_v1"
    || policyRow.scoring !== "layout_score_v1"
    || policyRow.automation !== "layout_automation_v1"
  ) fail(`${path}.policy`, "unsupported policy set");

  return {
    schemaVersion: 1,
    projectId,
    chapterId,
    comicFormat,
    storyboard: {
      versionId: id(storyboardRow.versionId, `${path}.storyboard.versionId`),
      documentDigest: storyboardDigest,
      document: storyboard.value,
    },
    candidateLockSet: {
      digest: digest(lockRow.digest, `${path}.candidateLockSet.digest`),
      items: items.sort((left, right) => left.order - right.order),
    },
    characterCatalog: { digest: characterDigest, items: characterItems },
    fontPolicy,
    typographyPreset,
    profile,
    visualAnalysisProvider,
    baseWorkingCopy,
    policy: {
      composition: "layout_composition_v1",
      dialogue: "layout_dialogue_v1",
      visualAnalysis: "layout_visual_analysis_v1",
      scoring: "layout_score_v1",
      automation: "layout_automation_v1",
    },
  };
}

export function parseLayoutCompositionTaskInputV1(
  input: unknown,
): LayoutCompositionTaskInputV1 {
  const row = exact(input, [
    "schemaVersion",
    "chapterId",
    "mode",
    "intent",
    "scope",
    "scopeDigest",
    "policySetDigest",
    "sourceProjection",
    "sourceProjectionDigest",
    "source",
  ], "input");
  if (row.schemaVersion !== 1) fail("input.schemaVersion", "expected 1");
  const chapterId = id(row.chapterId, "input.chapterId");
  const mode = enumeration(row.mode, LAYOUT_COMPOSITION_MODES_V1, "input.mode");
  const intent = enumeration(row.intent, LAYOUT_COMPOSITION_INTENTS_V1, "input.intent");
  const scope = row.scope === null ? null : parseScope(row.scope, "input.scope");
  const scopeDigest = digest(row.scopeDigest, "input.scopeDigest");
  if (digestLayoutCompositionScopeV1(scope) !== scopeDigest) fail("input.scopeDigest", "does not match scope");
  const source = parseFrozenSource(row.source, "input.source");
  if (source.chapterId !== chapterId) fail("input.source.chapterId", "scope mismatch");
  if ((mode === "initial") !== (source.baseWorkingCopy === null)) {
    fail("input.source.baseWorkingCopy", "must be null only for initial mode");
  }
  const projection = record(row.sourceProjection, "input.sourceProjection") as unknown as TaskSourceProjectionV1;
  if (
    projection.schemaVersion !== 1
    || projection.projectId !== source.projectId
    || projection.chapterId !== chapterId
    || projection.consumerType !== "layout_compose"
    || !Array.isArray(projection.sources)
    || projection.sources.length < 1
  ) fail("input.sourceProjection", "invalid layout_compose source projection");
  const sourceProjectionDigest = digest(row.sourceProjectionDigest, "input.sourceProjectionDigest");
  if (digestCanonicalJson(projection) !== sourceProjectionDigest) {
    fail("input.sourceProjectionDigest", "does not match sourceProjection");
  }
  const policySetDigest = digest(row.policySetDigest, "input.policySetDigest");
  const currentPolicyDigest = digestCanonicalJson({
    policyVersion: "layout_composition_policy_set_digest_v1",
    profile: source.profile,
    fontPolicy: source.fontPolicy,
    typographyPreset: source.typographyPreset,
    policy: source.policy,
    intent,
    visualAnalysisProvider: source.visualAnalysisProvider,
  });
  const previousPolicyDigest = digestCanonicalJson({
    policyVersion: "layout_composition_policy_set_digest_v1",
    profile: source.profile,
    fontPolicy: source.fontPolicy,
    policy: source.policy,
    intent,
    visualAnalysisProvider: source.visualAnalysisProvider,
  });
  const legacyPolicyDigest = digestCanonicalJson({
    policyVersion: "layout_composition_policy_set_digest_v1",
    profile: source.profile,
    fontPolicy: source.fontPolicy,
    policy: source.policy,
    intent,
  });
  if (
    currentPolicyDigest !== policySetDigest
    && previousPolicyDigest !== policySetDigest
    && legacyPolicyDigest !== policySetDigest
  ) {
    fail("input.policySetDigest", "does not match policy set");
  }
  return {
    schemaVersion: 1,
    chapterId,
    mode,
    intent,
    scope,
    scopeDigest,
    policySetDigest,
    sourceProjection: structuredClone(projection),
    sourceProjectionDigest,
    source,
  };
}

function parseCoverage(value: unknown, path: string): {
  expected: number;
  placedOriginal: number;
  userModified: number;
  userSuppressed: number;
} {
  const row = exact(value, [
    "expected",
    "placedOriginal",
    "userModified",
    "userSuppressed",
  ], path);
  const result = {
    expected: integer(row.expected, `${path}.expected`, 0, 100_000),
    placedOriginal: integer(row.placedOriginal, `${path}.placedOriginal`, 0, 100_000),
    userModified: integer(row.userModified, `${path}.userModified`, 0, 100_000),
    userSuppressed: integer(row.userSuppressed, `${path}.userSuppressed`, 0, 100_000),
  };
  if (result.placedOriginal + result.userModified + result.userSuppressed !== result.expected) {
    fail(path, "coverage counts must sum to expected");
  }
  return result;
}

function assertNoSensitiveOutput(value: unknown, path = "output"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveOutput(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const denied = /^(apiKey|authorization|accessToken|secret|storageKey|absolutePath|filePath|buffer|providerRaw|rawProviderOutput)$/i;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (denied.test(key)) fail(`${path}.${key}`, "sensitive or runtime-only field is forbidden");
    assertNoSensitiveOutput(child, `${path}.${key}`);
  }
}

export function parseLayoutCompositionTaskOutputV1(
  input: unknown,
): LayoutCompositionTaskOutputV1 {
  const outputValue = record(input, "output");
  const row = exact({
    visualAnalyses: [],
    ...outputValue,
  }, [
    "schemaVersion",
    "mode",
    "sourceProjectionDigest",
    "baseDocumentDigest",
    "result",
    "visualAnalyses",
    "report",
  ], "output");
  if (row.schemaVersion !== 1) fail("output.schemaVersion", "expected 1");
  const mode = enumeration(row.mode, LAYOUT_COMPOSITION_MODES_V1, "output.mode");
  const resultRow = exact(row.result, ["kind", "document", "commandBatch"], "output.result");
  const kind = enumeration(
    resultRow.kind,
    ["initial_document", "command_batch"] as const,
    "output.result.kind",
  );
  const document = resultRow.document === null
    ? null
    : LayoutDocumentCodecV2.parseAndNormalize(resultRow.document);
  const commandBatch = resultRow.commandBatch === null
    ? null
    : parseEditorCommandBatchV2(resultRow.commandBatch);
  if (
    (kind === "initial_document" && (document === null || commandBatch !== null || mode !== "initial"))
    || (kind === "command_batch" && (document !== null || commandBatch === null || mode === "initial"))
  ) fail("output.result", "kind, mode, document and commandBatch are inconsistent");
  if (!Array.isArray(row.visualAnalyses) || row.visualAnalyses.length > 20_000) {
    fail("output.visualAnalyses", "expected at most 20000 shot analyses");
  }
  const visualAnalysisShotIds = new Set<string>();
  const visualAnalyses = row.visualAnalyses.map((value, index): LayoutShotVisualAnalysisV1 => {
    const analysisPath = `output.visualAnalyses[${index}]`;
    const analysisRow = exact(value, ["shotId", "sourceDigest", "analysis"], analysisPath);
    const shotId = id(analysisRow.shotId, `${analysisPath}.shotId`);
    if (visualAnalysisShotIds.has(shotId)) fail(`${analysisPath}.shotId`, "duplicate shot analysis");
    visualAnalysisShotIds.add(shotId);
    return {
      shotId,
      sourceDigest: digest(analysisRow.sourceDigest, `${analysisPath}.sourceDigest`),
      analysis: parseLayoutImageAnalysisV1(analysisRow.analysis),
    };
  }).sort((left, right) => (
    left.shotId < right.shotId ? -1 : left.shotId > right.shotId ? 1 : 0
  ));

  const reportRow = exact(row.report, [
    "planDigest",
    "analysisMode",
    "candidateCount",
    "selectedScore",
    "scoreBreakdown",
    "shotCoverage",
    "dialogueCoverage",
    "issues",
  ], "output.report");
  const scoreRow = record(reportRow.scoreBreakdown, "output.report.scoreBreakdown");
  const scoreBreakdown = Object.fromEntries(Object.entries(scoreRow).map(([key, value]) => [
    id(key, `output.report.scoreBreakdown.${key}`),
    finite(value, `output.report.scoreBreakdown.${key}`),
  ]));
  const shotRow = exact(reportRow.shotCoverage, ["expected", "placed"], "output.report.shotCoverage");
  const shotCoverage = {
    expected: integer(shotRow.expected, "output.report.shotCoverage.expected", 0, 100_000),
    placed: integer(shotRow.placed, "output.report.shotCoverage.placed", 0, 100_000),
  };
  if (shotCoverage.placed !== shotCoverage.expected) fail("output.report.shotCoverage", "all shots must be placed");
  if (!Array.isArray(reportRow.issues) || reportRow.issues.length > 20_000) {
    fail("output.report.issues", "expected at most 20000 issues");
  }
  const issues = reportRow.issues.map((value, index): LayoutCompositionIssueV1 => {
    const issuePath = `output.report.issues[${index}]`;
    const issue = exact(value, ["code", "severity", "canvasId", "elementId", "shotId"], issuePath);
    return {
      code: id(issue.code, `${issuePath}.code`),
      severity: enumeration(issue.severity, ["info", "warning", "error"] as const, `${issuePath}.severity`),
      canvasId: issue.canvasId === null ? null : id(issue.canvasId, `${issuePath}.canvasId`),
      elementId: issue.elementId === null ? null : id(issue.elementId, `${issuePath}.elementId`),
      shotId: issue.shotId === null ? null : id(issue.shotId, `${issuePath}.shotId`),
    };
  });
  const output: LayoutCompositionTaskOutputV1 = {
    schemaVersion: 1,
    mode,
    sourceProjectionDigest: digest(row.sourceProjectionDigest, "output.sourceProjectionDigest"),
    baseDocumentDigest: nullableDigest(row.baseDocumentDigest, "output.baseDocumentDigest"),
    result: { kind, document, commandBatch },
    visualAnalyses,
    report: {
      planDigest: digest(reportRow.planDigest, "output.report.planDigest"),
      analysisMode: enumeration(
        reportRow.analysisMode,
        ["vision", "mixed", "rule_fallback"] as const,
        "output.report.analysisMode",
      ),
      candidateCount: integer(reportRow.candidateCount, "output.report.candidateCount", 1, 32),
      selectedScore: finite(reportRow.selectedScore, "output.report.selectedScore"),
      scoreBreakdown,
      shotCoverage,
      dialogueCoverage: parseCoverage(reportRow.dialogueCoverage, "output.report.dialogueCoverage"),
      issues,
    },
  };
  if ((mode === "initial") !== (output.baseDocumentDigest === null)) {
    fail("output.baseDocumentDigest", "must be null only for initial mode");
  }
  assertNoSensitiveOutput(output);
  return output;
}

export function encodeLayoutCompositionTaskOutputV1(
  input: unknown,
): EncodedLayoutValue<LayoutCompositionTaskOutputV1> {
  const value = parseLayoutCompositionTaskOutputV1(input);
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return {
    schemaVersion: 1,
    value,
    canonical,
    canonicalBytes,
    digest: sha256Bytes(canonicalBytes),
  };
}

export function parseLayoutCompositionApplicationEvidenceV1(
  input: unknown,
): LayoutCompositionApplicationEvidenceV1 {
  const row = exact(input, [
    "schemaVersion",
    "kind",
    "taskId",
    "result",
    "targetId",
    "baseDocumentDigest",
    "resultDocumentDigest",
    "targetRowVersion",
  ], "evidence");
  if (row.schemaVersion !== 1 || row.kind !== "layout_composition_application_v1") {
    fail("evidence", "unsupported composition application evidence");
  }
  return {
    schemaVersion: 1,
    kind: "layout_composition_application_v1",
    taskId: id(row.taskId, "evidence.taskId"),
    result: enumeration(
      row.result,
      ["initial_working_copy", "pending_command"] as const,
      "evidence.result",
    ),
    targetId: id(row.targetId, "evidence.targetId"),
    baseDocumentDigest: nullableDigest(row.baseDocumentDigest, "evidence.baseDocumentDigest"),
    resultDocumentDigest: digest(row.resultDocumentDigest, "evidence.resultDocumentDigest"),
    targetRowVersion: integer(row.targetRowVersion, "evidence.targetRowVersion"),
  };
}
