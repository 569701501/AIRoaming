import { digestCanonicalJson } from "@airoaming/shared";

export const FINAL_IMPORT_REPORT_KIND = "airoaming_final_import_report_v1" as const;
export const FINAL_IMPORTER_VERSION = "d2-a7-final-v1" as const;

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const SLICE_KEYS = ["slice", "runId", "status", "reportDigest", "counts", "evidence"] as const;
const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "kind",
  "sourceManifestDigest",
  "snapshotManifestDigest",
  "decisionsDigest",
  "effectiveSchemaManifestDigest",
  "slices",
  "summary",
  "reportDigest",
] as const;

export type FinalSliceStatus = "succeeded" | "blocked" | "failed";

export interface FinalImportSlice {
  slice: string;
  runId: string;
  status: FinalSliceStatus;
  reportDigest: `sha256:${string}` | null;
  counts: Record<string, unknown> | null;
  evidence: {
    verificationReportDigest: `sha256:${string}` | null;
    passed: boolean;
  };
}

export interface FinalImportReport {
  schemaVersion: 1;
  kind: typeof FINAL_IMPORT_REPORT_KIND;
  sourceManifestDigest: `sha256:${string}`;
  snapshotManifestDigest: `sha256:${string}`;
  decisionsDigest: `sha256:${string}`;
  effectiveSchemaManifestDigest: `sha256:${string}`;
  slices: FinalImportSlice[];
  summary: {
    sliceCount: number;
    succeededCount: number;
    blockedCount: number;
    failedCount: number;
    entityCounts: Record<string, number>;
  };
  reportDigest: `sha256:${string}`;
}

export class FinalImportReportError extends Error {
  constructor(readonly code: string) { super(code); }
}

function record(value: unknown, code = "MIGRATION_FINAL_REPORT_INVALID"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinalImportReportError(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  return value as `sha256:${string}`;
}

function nullableDigest(value: unknown): `sha256:${string}` | null {
  return value === null ? null : digest(value);
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  return value as number;
}

function normalizeSlice(value: unknown): FinalImportSlice {
  const row = record(value);
  exactKeys(row, SLICE_KEYS);
  if (typeof row.slice !== "string" || !row.slice || typeof row.runId !== "string" || !row.runId) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  if (row.status !== "succeeded" && row.status !== "blocked" && row.status !== "failed") throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  const evidence = record(row.evidence);
  exactKeys(evidence, ["verificationReportDigest", "passed"]);
  if (typeof evidence.passed !== "boolean") throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  const counts = row.counts === null ? null : record(row.counts);
  return {
    slice: row.slice,
    runId: row.runId,
    status: row.status,
    reportDigest: nullableDigest(row.reportDigest),
    counts,
    evidence: { verificationReportDigest: nullableDigest(evidence.verificationReportDigest), passed: evidence.passed },
  };
}

export function createFinalImportReport(input: Omit<FinalImportReport, "reportDigest" | "summary"> & { slices: FinalImportSlice[]; entityCounts?: Record<string, number> }): FinalImportReport {
  const slices = [...input.slices];
  const summary = {
    sliceCount: slices.length,
    succeededCount: slices.filter((slice) => slice.status === "succeeded").length,
    blockedCount: slices.filter((slice) => slice.status === "blocked").length,
    failedCount: slices.filter((slice) => slice.status === "failed").length,
    entityCounts: Object.fromEntries(Object.entries(input.entityCounts ?? {}).sort(([left], [right]) => left.localeCompare(right))),
  };
  const base = {
    schemaVersion: 1 as const,
    kind: FINAL_IMPORT_REPORT_KIND,
    sourceManifestDigest: input.sourceManifestDigest,
    snapshotManifestDigest: input.snapshotManifestDigest,
    decisionsDigest: input.decisionsDigest,
    effectiveSchemaManifestDigest: input.effectiveSchemaManifestDigest,
    slices,
    summary,
  };
  return { ...base, reportDigest: digestCanonicalJson(base) };
}

export function normalizeFinalImportReport(value: unknown): FinalImportReport {
  const row = record(value);
  exactKeys(row, TOP_LEVEL_KEYS);
  if (row.schemaVersion !== 1 || row.kind !== FINAL_IMPORT_REPORT_KIND || !Array.isArray(row.slices)) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  const summary = record(row.summary);
  exactKeys(summary, ["sliceCount", "succeededCount", "blockedCount", "failedCount", "entityCounts"]);
  const entityCounts = record(summary.entityCounts);
  for (const count of Object.values(entityCounts)) nonNegativeInteger(count);
  const slices = row.slices.map(normalizeSlice);
  if (summary.sliceCount !== slices.length || summary.succeededCount !== slices.filter((slice) => slice.status === "succeeded").length || summary.blockedCount !== slices.filter((slice) => slice.status === "blocked").length || summary.failedCount !== slices.filter((slice) => slice.status === "failed").length) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  const base = {
    schemaVersion: 1 as const,
    kind: FINAL_IMPORT_REPORT_KIND,
    sourceManifestDigest: digest(row.sourceManifestDigest),
    snapshotManifestDigest: digest(row.snapshotManifestDigest),
    decisionsDigest: digest(row.decisionsDigest),
    effectiveSchemaManifestDigest: digest(row.effectiveSchemaManifestDigest),
    slices,
    summary: { ...summary, entityCounts: Object.fromEntries(Object.entries(entityCounts).sort(([left], [right]) => left.localeCompare(right))) },
  } as Omit<FinalImportReport, "reportDigest">;
  if (digest(row.reportDigest) !== digestCanonicalJson(base)) throw new FinalImportReportError("MIGRATION_FINAL_REPORT_INVALID");
  return { ...base, reportDigest: row.reportDigest as `sha256:${string}` };
}
