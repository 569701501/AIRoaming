import { digestCanonicalJson } from "../versioning/canonical-json.js";
import type { LayoutDigest } from "./document.js";
import { normalizeLayoutNumber } from "./geometry.js";
import { normalizePlainLayoutText } from "./text.js";

export interface LayoutNormalizedRectV1 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNormalizedPointV1 {
  x: number;
  y: number;
}

export interface LayoutVisualSubjectV1 {
  id: string;
  characterId: string | null;
  bodyBox: LayoutNormalizedRectV1;
  faceBox: LayoutNormalizedRectV1 | null;
  importance: number;
  confidence: number;
}

export interface LayoutVisualFocalRegionV1 {
  box: LayoutNormalizedRectV1;
  weight: number;
}

export interface LayoutVisualTextSafeRegionV1 {
  box: LayoutNormalizedRectV1;
  score: number;
}

export interface LayoutImageAnalysisV1 {
  schemaVersion: 1;
  policyVersion: "layout_visual_analysis_v1";
  assetId: string;
  assetDigest: LayoutDigest;
  mode: "vision" | "rule_fallback";
  subjects: LayoutVisualSubjectV1[];
  focalRegions: LayoutVisualFocalRegionV1[];
  textSafeRegions: LayoutVisualTextSafeRegionV1[];
  visualCenter: LayoutNormalizedPointV1;
  warnings: string[];
  analysisDigest: LayoutDigest;
}

export type LayoutImageAnalysisDraftV1 = Omit<LayoutImageAnalysisV1, "analysisDigest">;

export interface EncodedLayoutImageAnalysisV1 {
  schemaVersion: 1;
  value: LayoutImageAnalysisV1;
  canonical: string;
  digest: LayoutDigest;
}

export interface LayoutShotVisualAnalysisV1 {
  shotId: string;
  sourceDigest: LayoutDigest;
  analysis: LayoutImageAnalysisV1;
}

export class LayoutVisualAnalysisError extends Error {
  readonly code = "LAYOUT_VISUAL_ANALYSIS_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutVisualAnalysisError";
  }
}

const MAX_SUBJECTS = 64;
const MAX_REGIONS = 128;
const MAX_WARNINGS = 128;

function invalid(path: string, message: string): never {
  throw new LayoutVisualAnalysisError(`${path}: ${message}`);
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
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) invalid(`${path}.${key}`, "missing required field");
  }
  return row;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "expected string");
  let normalized: string;
  try {
    normalized = normalizePlainLayoutText(value).trim();
  } catch (error) {
    invalid(path, error instanceof Error ? error.message : "invalid text");
  }
  if (normalized === "" || normalized.includes("\n")) invalid(path, "must be a non-empty single line");
  return normalized;
}

function digest(value: unknown, path: string): LayoutDigest {
  const normalized = text(value, path);
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) invalid(path, "expected sha256:<64 lowercase hex>");
  return normalized as LayoutDigest;
}

function bounded(value: unknown, path: string, minimum = 0, maximum = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(path, `expected a finite number in [${minimum}, ${maximum}]`);
  }
  return normalizeLayoutNumber(value);
}

function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) invalid(path, "expected array");
  if (value.length > maximum) invalid(path, `exceeds maximum ${maximum}`);
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(path, `expected one of ${allowed.join(", ")}`);
  return value as T;
}

function rect(value: unknown, path: string): LayoutNormalizedRectV1 {
  const row = exact(value, ["x", "y", "width", "height"], path);
  const result = {
    x: bounded(row.x, `${path}.x`),
    y: bounded(row.y, `${path}.y`),
    width: bounded(row.width, `${path}.width`, 0.001, 1),
    height: bounded(row.height, `${path}.height`, 0.001, 1),
  };
  if (result.x + result.width > 1.000_001 || result.y + result.height > 1.000_001) {
    invalid(path, "rectangle exceeds normalized image bounds");
  }
  return result;
}

function point(value: unknown, path: string): LayoutNormalizedPointV1 {
  const row = exact(value, ["x", "y"], path);
  return { x: bounded(row.x, `${path}.x`), y: bounded(row.y, `${path}.y`) };
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function compareRect(left: LayoutNormalizedRectV1, right: LayoutNormalizedRectV1): number {
  return left.y - right.y || left.x - right.x || left.width - right.width || left.height - right.height;
}

function unsignedAnalysis(input: unknown): LayoutImageAnalysisDraftV1 {
  const row = exact(input, [
    "schemaVersion",
    "policyVersion",
    "assetId",
    "assetDigest",
    "mode",
    "subjects",
    "focalRegions",
    "textSafeRegions",
    "visualCenter",
    "warnings",
  ], "analysis");
  if (row.schemaVersion !== 1) invalid("analysis.schemaVersion", "expected 1");
  if (row.policyVersion !== "layout_visual_analysis_v1") {
    invalid("analysis.policyVersion", "expected layout_visual_analysis_v1");
  }

  const subjectIds = new Set<string>();
  const subjects = array(row.subjects, "analysis.subjects", MAX_SUBJECTS).map((value, index): LayoutVisualSubjectV1 => {
    const path = `analysis.subjects[${index}]`;
    const item = exact(value, ["id", "characterId", "bodyBox", "faceBox", "importance", "confidence"], path);
    const idValue = text(item.id, `${path}.id`);
    if (subjectIds.has(idValue)) invalid(`${path}.id`, "duplicate subject id");
    subjectIds.add(idValue);
    const bodyBox = rect(item.bodyBox, `${path}.bodyBox`);
    const faceBox = item.faceBox === null ? null : rect(item.faceBox, `${path}.faceBox`);
    if (faceBox && intersectionAreaNormalizedV1(faceBox, bodyBox) + 1e-6 < normalizedRectAreaV1(faceBox) * 0.72) {
      invalid(`${path}.faceBox`, "must substantially overlap its bodyBox");
    }
    return {
      id: idValue,
      characterId: item.characterId === null ? null : text(item.characterId, `${path}.characterId`),
      bodyBox,
      faceBox,
      importance: bounded(item.importance, `${path}.importance`),
      confidence: bounded(item.confidence, `${path}.confidence`),
    };
  }).sort((left, right) => compareUnicodeCodePoints(left.id, right.id));

  const focalRegions = array(row.focalRegions, "analysis.focalRegions", MAX_REGIONS).map((value, index) => {
    const path = `analysis.focalRegions[${index}]`;
    const item = exact(value, ["box", "weight"], path);
    return { box: rect(item.box, `${path}.box`), weight: bounded(item.weight, `${path}.weight`) };
  }).sort((left, right) => compareRect(left.box, right.box) || left.weight - right.weight);

  const textSafeRegions = array(row.textSafeRegions, "analysis.textSafeRegions", MAX_REGIONS).map((value, index) => {
    const path = `analysis.textSafeRegions[${index}]`;
    const item = exact(value, ["box", "score"], path);
    return { box: rect(item.box, `${path}.box`), score: bounded(item.score, `${path}.score`) };
  }).sort((left, right) => compareRect(left.box, right.box) || left.score - right.score);

  const warnings = [...new Set(array(row.warnings, "analysis.warnings", MAX_WARNINGS).map(
    (value, index) => text(value, `analysis.warnings[${index}]`),
  ))].sort(compareUnicodeCodePoints);

  const mode = enumeration(row.mode, ["vision", "rule_fallback"] as const, "analysis.mode");
  if (mode === "rule_fallback" && (subjects.length > 0 || focalRegions.length > 0 || textSafeRegions.length > 0)) {
    invalid("analysis.mode", "rule_fallback cannot claim visual regions");
  }
  return {
    schemaVersion: 1,
    policyVersion: "layout_visual_analysis_v1",
    assetId: text(row.assetId, "analysis.assetId"),
    assetDigest: digest(row.assetDigest, "analysis.assetDigest"),
    mode,
    subjects,
    focalRegions,
    textSafeRegions,
    visualCenter: point(row.visualCenter, "analysis.visualCenter"),
    warnings,
  };
}

export function createLayoutImageAnalysisV1(input: LayoutImageAnalysisDraftV1): LayoutImageAnalysisV1 {
  const value = unsignedAnalysis(input);
  return { ...value, analysisDigest: digestCanonicalJson(value) };
}

export function parseLayoutImageAnalysisV1(input: unknown): LayoutImageAnalysisV1 {
  const row = exact(input, [
    "schemaVersion",
    "policyVersion",
    "assetId",
    "assetDigest",
    "mode",
    "subjects",
    "focalRegions",
    "textSafeRegions",
    "visualCenter",
    "warnings",
    "analysisDigest",
  ], "analysis");
  const { analysisDigest: claimed, ...draft } = row;
  const value = createLayoutImageAnalysisV1(draft as unknown as LayoutImageAnalysisDraftV1);
  const claimedDigest = digest(claimed, "analysis.analysisDigest");
  if (claimedDigest !== value.analysisDigest) invalid("analysis.analysisDigest", "does not match canonical analysis");
  return value;
}

export function encodeLayoutImageAnalysisV1(input: LayoutImageAnalysisDraftV1 | LayoutImageAnalysisV1): EncodedLayoutImageAnalysisV1 {
  const draft = "analysisDigest" in input
    ? (({ analysisDigest: _digest, ...value }) => value)(input)
    : input;
  const value = createLayoutImageAnalysisV1(draft);
  if ("analysisDigest" in input && input.analysisDigest !== value.analysisDigest) {
    invalid("analysis.analysisDigest", "does not match canonical analysis");
  }
  return {
    schemaVersion: 1,
    value,
    canonical: JSON.stringify(value),
    digest: value.analysisDigest,
  };
}

export const LayoutImageAnalysisCodecV1 = {
  parse: parseLayoutImageAnalysisV1,
  parseAndNormalize: parseLayoutImageAnalysisV1,
  encode: encodeLayoutImageAnalysisV1,
};

export function createRuleFallbackLayoutImageAnalysisV1(input: {
  assetId: string;
  assetDigest: LayoutDigest;
  warning: string;
}): LayoutImageAnalysisV1 {
  return createLayoutImageAnalysisV1({
    schemaVersion: 1,
    policyVersion: "layout_visual_analysis_v1",
    assetId: input.assetId,
    assetDigest: input.assetDigest,
    mode: "rule_fallback",
    subjects: [],
    focalRegions: [],
    textSafeRegions: [],
    visualCenter: { x: 0.5, y: 0.5 },
    warnings: [input.warning],
  });
}

export function digestLayoutVisualAnalysisSetV1(entries: readonly LayoutShotVisualAnalysisV1[]): LayoutDigest {
  const seen = new Set<string>();
  const normalized = entries.map((entry, index) => {
    const shotId = text(entry.shotId, `entries[${index}].shotId`);
    if (seen.has(shotId)) invalid(`entries[${index}].shotId`, "duplicate shot analysis");
    seen.add(shotId);
    const sourceDigest = digest(entry.sourceDigest, `entries[${index}].sourceDigest`);
    const analysis = parseLayoutImageAnalysisV1(entry.analysis);
    return { shotId, sourceDigest, analysisDigest: analysis.analysisDigest, mode: analysis.mode };
  }).sort((left, right) => compareUnicodeCodePoints(left.shotId, right.shotId));
  return digestCanonicalJson({ policyVersion: "layout_visual_analysis_set_v1", entries: normalized });
}

export function normalizedRectAreaV1(value: LayoutNormalizedRectV1): number {
  return normalizeLayoutNumber(Math.max(0, value.width) * Math.max(0, value.height));
}

export function intersectionAreaNormalizedV1(
  left: LayoutNormalizedRectV1,
  right: LayoutNormalizedRectV1,
): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return normalizeLayoutNumber(width * height);
}

export function unionNormalizedRectsV1(values: readonly LayoutNormalizedRectV1[]): LayoutNormalizedRectV1 | null {
  if (values.length === 0) return null;
  const left = Math.min(...values.map((value) => value.x));
  const top = Math.min(...values.map((value) => value.y));
  const right = Math.max(...values.map((value) => value.x + value.width));
  const bottom = Math.max(...values.map((value) => value.y + value.height));
  return {
    x: normalizeLayoutNumber(left),
    y: normalizeLayoutNumber(top),
    width: normalizeLayoutNumber(right - left),
    height: normalizeLayoutNumber(bottom - top),
  };
}
