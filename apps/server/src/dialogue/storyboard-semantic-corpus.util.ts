import { readFile } from "node:fs/promises";
import type { StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import {
  parseStoryboardSemanticEvaluation,
  type StoryboardSemanticCoverageStatus,
  type StoryboardSemanticEvaluationReport,
} from "./storyboard-semantic-evaluation.util.js";

const ROOT_KEYS = ["schemaVersion", "corpusId", "cases"] as const;
const CASE_KEYS = ["fixtureId", "genre", "coverageTags", "structure", "storyboard", "expected"] as const;

export interface StoryboardSemanticCorpusCase {
  fixtureId: string;
  genre: string;
  coverageTags: string[];
  structure: StoryStructureJson;
  storyboard: StoryboardJson;
  expected: StoryboardSemanticEvaluationReport;
}

export interface StoryboardSemanticCorpus {
  schemaVersion: 1;
  corpusId: string;
  cases: StoryboardSemanticCorpusCase[];
}

export type StoryboardSemanticCorpusRun =
  | {
    fixtureId: string;
    repeatIndex: number;
    status: "completed";
    report: StoryboardSemanticEvaluationReport;
    comparison?: StoryboardSemanticEvaluationComparison;
    providerId?: string;
    modelId?: string;
  }
  | {
    fixtureId: string;
    repeatIndex: number;
    status: "contract_failed" | "runtime_failed";
    errorCode: string;
    issues?: string[];
  };

export interface StoryboardSemanticDimensionMismatch {
  beatId: string;
  dimension: "summary" | "outcome";
  expected: StoryboardSemanticCoverageStatus;
  actual: StoryboardSemanticCoverageStatus;
}

export interface StoryboardSemanticEvaluationComparison {
  matchedDimensions: number;
  totalDimensions: number;
  agreementRate: number;
  dimensionMismatches: StoryboardSemanticDimensionMismatch[];
}

export interface StoryboardSemanticCorpusSummary {
  caseCount: number;
  requestedRuns: number;
  observedRuns: number;
  completedRuns: number;
  failedRuns: number;
  unattemptedRuns: number;
  expectedAgreement: {
    matchedDimensions: number;
    totalDimensions: number;
    rate: number;
  };
  repeatStability: {
    stableDimensions: number;
    comparableDimensions: number;
    rate: number;
  };
  caseSummaries: Array<{
    fixtureId: string;
    requestedRuns: number;
    observedRuns: number;
    completedRuns: number;
    failedRuns: number;
    expectedMatchedDimensions: number;
    expectedTotalDimensions: number;
    expectedAgreementRate: number;
    stableDimensions: number;
    comparableDimensions: number;
    repeatStabilityRate: number;
  }>;
}

export class StoryboardSemanticCorpusContractError extends Error {
  readonly code = "STORYBOARD_SEMANTIC_CORPUS_CONTRACT_FAILED";

  constructor(readonly issues: readonly string[]) {
    super(`${"STORYBOARD_SEMANTIC_CORPUS_CONTRACT_FAILED"}:${issues.join(",")}`);
  }
}

function exactRecord(value: unknown, keys: readonly string[], path: string, issues: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`OBJECT_REQUIRED:${path}`);
    return {};
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) issues.push(`UNKNOWN_FIELD:${path}.${key}`);
  }
  for (const key of keys) {
    if (!(key in record)) issues.push(`FIELD_REQUIRED:${path}.${key}`);
  }
  return record;
}

function requiredString(value: unknown, path: string, issues: string[]): string {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`STRING_REQUIRED:${path}`);
    return "";
  }
  return value.trim();
}

function requiredStringArray(value: unknown, path: string, issues: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`NON_EMPTY_STRING_ARRAY_REQUIRED:${path}`);
    return [];
  }
  const result: string[] = [];
  value.forEach((item, index) => {
    const normalized = requiredString(item, `${path}[${index}]`, issues);
    if (normalized) {
      if (result.includes(normalized)) issues.push(`STRING_DUPLICATE:${path}:${normalized}`);
      else result.push(normalized);
    }
  });
  return result;
}

function asStructure(value: unknown, path: string, issues: string[]): StoryStructureJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`OBJECT_REQUIRED:${path}`);
    return { beats: [] } as unknown as StoryStructureJson;
  }
  const record = value as Record<string, unknown>;
  requiredString(record.chapterId, `${path}.chapterId`, issues);
  if (!Array.isArray(record.beats) || record.beats.length === 0) {
    issues.push(`NON_EMPTY_ARRAY_REQUIRED:${path}.beats`);
  }
  return value as StoryStructureJson;
}

function asStoryboard(value: unknown, path: string, issues: string[]): StoryboardJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`OBJECT_REQUIRED:${path}`);
    return { shots: [] } as unknown as StoryboardJson;
  }
  const record = value as Record<string, unknown>;
  requiredString(record.chapterId, `${path}.chapterId`, issues);
  if (!Array.isArray(record.shots) || record.shots.length === 0) {
    issues.push(`NON_EMPTY_ARRAY_REQUIRED:${path}.shots`);
  }
  return value as StoryboardJson;
}

function validateRelations(
  fixtureId: string,
  structure: StoryStructureJson,
  storyboard: StoryboardJson,
  issues: string[],
): void {
  if (structure.chapterId !== storyboard.chapterId) {
    issues.push(`CHAPTER_ID_MISMATCH:${fixtureId}:${structure.chapterId}:${storyboard.chapterId}`);
  }
  const beatIds = new Set<string>();
  structure.beats.forEach((beat, index) => {
    if (!beat?.id) issues.push(`BEAT_ID_REQUIRED:${fixtureId}:${index}`);
    else if (beatIds.has(beat.id)) issues.push(`BEAT_ID_DUPLICATE:${fixtureId}:${beat.id}`);
    else beatIds.add(beat.id);
  });
  const shotOrders = new Set<number>();
  storyboard.shots.forEach((shot, index) => {
    if (!shot.beatId || !beatIds.has(shot.beatId)) {
      issues.push(`SHOT_BEAT_UNKNOWN:${fixtureId}:${index}:${shot.beatId ?? "null"}`);
    }
    if (!Number.isInteger(shot.order) || shot.order < 1) issues.push(`SHOT_ORDER_INVALID:${fixtureId}:${index}`);
    else if (shotOrders.has(shot.order)) issues.push(`SHOT_ORDER_DUPLICATE:${fixtureId}:${shot.order}`);
    else shotOrders.add(shot.order);
  });
  for (const beatId of beatIds) {
    if (!storyboard.shots.some((shot) => shot.beatId === beatId)) {
      issues.push(`BEAT_WITHOUT_SHOT:${fixtureId}:${beatId}`);
    }
  }
}

export function parseStoryboardSemanticCorpus(value: unknown): StoryboardSemanticCorpus {
  const issues: string[] = [];
  const root = exactRecord(value, ROOT_KEYS, "root", issues);
  if (root.schemaVersion !== 1) issues.push("SCHEMA_VERSION_INVALID:root.schemaVersion");
  const corpusId = requiredString(root.corpusId, "root.corpusId", issues);
  const rawCases = root.cases;
  if (!Array.isArray(rawCases) || rawCases.length === 0) issues.push("NON_EMPTY_ARRAY_REQUIRED:root.cases");
  const fixtureIds = new Set<string>();
  const cases: StoryboardSemanticCorpusCase[] = [];

  (Array.isArray(rawCases) ? rawCases : []).forEach((value, index) => {
    const path = `cases[${index}]`;
    const record = exactRecord(value, CASE_KEYS, path, issues);
    const fixtureId = requiredString(record.fixtureId, `${path}.fixtureId`, issues);
    if (fixtureId) {
      if (fixtureIds.has(fixtureId)) issues.push(`FIXTURE_ID_DUPLICATE:${fixtureId}`);
      else fixtureIds.add(fixtureId);
    }
    const genre = requiredString(record.genre, `${path}.genre`, issues);
    const coverageTags = requiredStringArray(record.coverageTags, `${path}.coverageTags`, issues);
    const structure = asStructure(record.structure, `${path}.structure`, issues);
    const storyboard = asStoryboard(record.storyboard, `${path}.storyboard`, issues);
    validateRelations(fixtureId || String(index), structure, storyboard, issues);
    let expected: StoryboardSemanticEvaluationReport | null = null;
    try {
      expected = parseStoryboardSemanticEvaluation(JSON.stringify(record.expected), structure, storyboard);
    } catch (error) {
      issues.push(`EXPECTED_REPORT_INVALID:${fixtureId || index}:${error instanceof Error ? error.message : "unknown"}`);
    }
    if (expected) cases.push({ fixtureId, genre, coverageTags, structure, storyboard, expected });
  });

  if (issues.length > 0) throw new StoryboardSemanticCorpusContractError([...new Set(issues)]);
  return { schemaVersion: 1, corpusId, cases };
}

export async function loadStoryboardSemanticCorpus(filePath: string | URL): Promise<StoryboardSemanticCorpus> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new StoryboardSemanticCorpusContractError([
      `CORPUS_FILE_INVALID:${String(filePath)}:${error instanceof Error ? error.message : "unknown"}`,
    ]);
  }
  return parseStoryboardSemanticCorpus(value);
}

function dimensionStatuses(report: StoryboardSemanticEvaluationReport): StoryboardSemanticCoverageStatus[] {
  return report.beats.flatMap((beat) => [beat.summaryStatus, beat.outcomeStatus]);
}

export function compareStoryboardSemanticEvaluation(
  expected: StoryboardSemanticEvaluationReport,
  actual: StoryboardSemanticEvaluationReport,
): StoryboardSemanticEvaluationComparison {
  if (expected.beats.length !== actual.beats.length) {
    throw new Error(`STORYBOARD_SEMANTIC_COMPARISON_BEAT_COUNT:${actual.beats.length}:${expected.beats.length}`);
  }
  const dimensionMismatches: StoryboardSemanticDimensionMismatch[] = [];
  expected.beats.forEach((expectedBeat, index) => {
    const actualBeat = actual.beats[index];
    if (!actualBeat || actualBeat.beatId !== expectedBeat.beatId) {
      throw new Error(`STORYBOARD_SEMANTIC_COMPARISON_BEAT_ORDER:${index}:${actualBeat?.beatId ?? "missing"}:${expectedBeat.beatId}`);
    }
    if (actualBeat.summaryStatus !== expectedBeat.summaryStatus) {
      dimensionMismatches.push({
        beatId: expectedBeat.beatId,
        dimension: "summary",
        expected: expectedBeat.summaryStatus,
        actual: actualBeat.summaryStatus,
      });
    }
    if (actualBeat.outcomeStatus !== expectedBeat.outcomeStatus) {
      dimensionMismatches.push({
        beatId: expectedBeat.beatId,
        dimension: "outcome",
        expected: expectedBeat.outcomeStatus,
        actual: actualBeat.outcomeStatus,
      });
    }
  });
  const totalDimensions = expected.beats.length * 2;
  const matchedDimensions = totalDimensions - dimensionMismatches.length;
  return {
    matchedDimensions,
    totalDimensions,
    agreementRate: totalDimensions > 0 ? matchedDimensions / totalDimensions : 0,
    dimensionMismatches,
  };
}

function repeatStability(reports: StoryboardSemanticEvaluationReport[]): {
  stableDimensions: number;
  comparableDimensions: number;
} {
  if (reports.length < 2) return { stableDimensions: 0, comparableDimensions: 0 };
  const first = reports[0]!;
  const firstStatuses = dimensionStatuses(first);
  for (const report of reports.slice(1)) {
    if (report.beats.length !== first.beats.length
      || report.beats.some((beat, index) => beat.beatId !== first.beats[index]?.beatId)) {
      throw new Error("STORYBOARD_SEMANTIC_STABILITY_BEAT_MISMATCH");
    }
  }
  const allStatuses = reports.map(dimensionStatuses);
  return {
    stableDimensions: firstStatuses.filter((status, index) => allStatuses.every((items) => items[index] === status)).length,
    comparableDimensions: firstStatuses.length,
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function summarizeStoryboardSemanticCorpusRuns(
  corpus: StoryboardSemanticCorpus,
  runs: StoryboardSemanticCorpusRun[],
  repeat: number,
): StoryboardSemanticCorpusSummary {
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error("STORYBOARD_SEMANTIC_CORPUS_REPEAT_INVALID");
  const knownFixtureIds = new Set(corpus.cases.map((item) => item.fixtureId));
  const runKeys = new Set<string>();
  for (const run of runs) {
    if (!knownFixtureIds.has(run.fixtureId)) throw new Error(`STORYBOARD_SEMANTIC_CORPUS_RUN_UNKNOWN:${run.fixtureId}`);
    if (!Number.isInteger(run.repeatIndex) || run.repeatIndex < 1 || run.repeatIndex > repeat) {
      throw new Error(`STORYBOARD_SEMANTIC_CORPUS_RUN_REPEAT_INVALID:${run.fixtureId}:${run.repeatIndex}`);
    }
    const key = `${run.fixtureId}:${run.repeatIndex}`;
    if (runKeys.has(key)) throw new Error(`STORYBOARD_SEMANTIC_CORPUS_RUN_DUPLICATE:${key}`);
    runKeys.add(key);
  }

  const caseSummaries = corpus.cases.map((fixture) => {
    const fixtureRuns = runs.filter((run) => run.fixtureId === fixture.fixtureId);
    const completed = fixtureRuns.filter((run): run is Extract<StoryboardSemanticCorpusRun, { status: "completed" }> => (
      run.status === "completed"
    ));
    const comparisons = completed.map((run) => compareStoryboardSemanticEvaluation(fixture.expected, run.report));
    const expectedMatchedDimensions = comparisons.reduce((sum, item) => sum + item.matchedDimensions, 0);
    const expectedTotalDimensions = comparisons.reduce((sum, item) => sum + item.totalDimensions, 0);
    const stability = repeatStability(completed.map((run) => run.report));
    return {
      fixtureId: fixture.fixtureId,
      requestedRuns: repeat,
      observedRuns: fixtureRuns.length,
      completedRuns: completed.length,
      failedRuns: fixtureRuns.length - completed.length,
      expectedMatchedDimensions,
      expectedTotalDimensions,
      expectedAgreementRate: rate(expectedMatchedDimensions, expectedTotalDimensions),
      stableDimensions: stability.stableDimensions,
      comparableDimensions: stability.comparableDimensions,
      repeatStabilityRate: rate(stability.stableDimensions, stability.comparableDimensions),
    };
  });
  const requestedRuns = corpus.cases.length * repeat;
  const completedRuns = caseSummaries.reduce((sum, item) => sum + item.completedRuns, 0);
  const failedRuns = caseSummaries.reduce((sum, item) => sum + item.failedRuns, 0);
  const expectedMatchedDimensions = caseSummaries.reduce((sum, item) => sum + item.expectedMatchedDimensions, 0);
  const expectedTotalDimensions = caseSummaries.reduce((sum, item) => sum + item.expectedTotalDimensions, 0);
  const stableDimensions = caseSummaries.reduce((sum, item) => sum + item.stableDimensions, 0);
  const comparableDimensions = caseSummaries.reduce((sum, item) => sum + item.comparableDimensions, 0);
  return {
    caseCount: corpus.cases.length,
    requestedRuns,
    observedRuns: runs.length,
    completedRuns,
    failedRuns,
    unattemptedRuns: requestedRuns - runs.length,
    expectedAgreement: {
      matchedDimensions: expectedMatchedDimensions,
      totalDimensions: expectedTotalDimensions,
      rate: rate(expectedMatchedDimensions, expectedTotalDimensions),
    },
    repeatStability: {
      stableDimensions,
      comparableDimensions,
      rate: rate(stableDimensions, comparableDimensions),
    },
    caseSummaries,
  };
}
