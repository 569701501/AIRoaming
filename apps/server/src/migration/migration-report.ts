import { digestCanonicalJson } from "@airoaming/shared";
import type { ComicFormatMapping } from "./comic-format-migration.plugin.js";
import type { Digest } from "./migration-issue.js";

export class MigrationReportCodecError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface ComicFormatReportProject {
  projectId: string;
  sourceStorageKey: string;
  sourceDigest: Digest;
  originalComicFormat: { kind: string; preview: string };
  mappingKind: ComicFormatMapping["mappingKind"];
  targetComicFormat: "vertical_scroll" | "paged_comic" | null;
  layoutPresetIntent: "four_panel" | null;
  issueKey: string | null;
  resolutionStatus: "not_needed" | "open" | "resolved";
  importStatus: "not_started" | "blocked" | "imported";
}

export interface ComicFormatReport {
  schemaVersion: 1;
  kind: "airoaming_migration_report_v1";
  projects: ComicFormatReportProject[];
  summary: {
    projectCount: number;
    canonicalCount: number;
    autoMappedCount: number;
    decisionRequiredCount: number;
    unresolvedBlockerCount: number;
    importedCount: number;
    entityCounts: Record<string, number>;
    warningCount: number;
  };
  reportDigest: Digest;
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const TOP_LEVEL_KEYS = ["schemaVersion", "kind", "projects", "summary", "reportDigest"] as const;
const PROJECT_KEYS = ["projectId", "sourceStorageKey", "sourceDigest", "originalComicFormat", "mappingKind", "targetComicFormat", "layoutPresetIntent", "issueKey", "resolutionStatus", "importStatus"] as const;
const ORIGINAL_FORMAT_KEYS = ["kind", "preview"] as const;
const SUMMARY_KEYS = ["projectCount", "canonicalCount", "autoMappedCount", "decisionRequiredCount", "unresolvedBlockerCount", "importedCount", "entityCounts", "warningCount"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
  }
}

function assertDigest(value: unknown): asserts value is Digest {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
}

function assertNonNegativeInteger(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
}

/** 只接受 importer 生成的规范报告，并用同一 canonical base 重算 reportDigest。 */
export function normalizeComicFormatReport(value: unknown): ComicFormatReport {
  if (!isRecord(value)) throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
  assertExactKeys(value, TOP_LEVEL_KEYS);
  if (value.schemaVersion !== 1 || value.kind !== "airoaming_migration_report_v1" || !Array.isArray(value.projects) || !isRecord(value.summary)) {
    throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
  }
  assertDigest(value.reportDigest);
  const projects = value.projects.map((candidate) => {
    if (!isRecord(candidate)) throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    assertExactKeys(candidate, PROJECT_KEYS);
    if (typeof candidate.projectId !== "string" || typeof candidate.sourceStorageKey !== "string" || typeof candidate.originalComicFormat !== "object" || candidate.originalComicFormat === null || Array.isArray(candidate.originalComicFormat)) {
      throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    }
    assertDigest(candidate.sourceDigest);
    const original = candidate.originalComicFormat as Record<string, unknown>;
    assertExactKeys(original, ORIGINAL_FORMAT_KEYS);
    if (typeof original.kind !== "string" || typeof original.preview !== "string") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    if (candidate.mappingKind !== "canonical" && candidate.mappingKind !== "auto_mapped" && candidate.mappingKind !== "decision_required") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    if (candidate.targetComicFormat !== null && candidate.targetComicFormat !== "vertical_scroll" && candidate.targetComicFormat !== "paged_comic") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    if (candidate.layoutPresetIntent !== null && candidate.layoutPresetIntent !== "four_panel") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    if (candidate.issueKey !== null && typeof candidate.issueKey !== "string") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    if (candidate.resolutionStatus !== "not_needed" && candidate.resolutionStatus !== "open" && candidate.resolutionStatus !== "resolved") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    if (candidate.importStatus !== "not_started" && candidate.importStatus !== "blocked" && candidate.importStatus !== "imported") throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
    return candidate as unknown as ComicFormatReportProject;
  }).sort((left, right) => left.projectId.localeCompare(right.projectId));
  const summary = value.summary as Record<string, unknown>;
  assertExactKeys(summary, SUMMARY_KEYS);
  for (const key of SUMMARY_KEYS.filter((item) => item !== "entityCounts")) assertNonNegativeInteger(summary[key]);
  if (!isRecord(summary.entityCounts) || Object.values(summary.entityCounts).some((count) => !Number.isInteger(count) || (count as number) < 0)) throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
  const normalizedSummary = summary as unknown as ComicFormatReport["summary"];
  const base = { schemaVersion: 1 as const, kind: "airoaming_migration_report_v1" as const, projects, summary: normalizedSummary };
  if (digestCanonicalJson(base) !== value.reportDigest) throw new MigrationReportCodecError("MIGRATION_REPORT_ARTIFACT_INVALID");
  return { ...base, reportDigest: value.reportDigest as Digest };
}

export function createComicFormatReport(projects: readonly ComicFormatReportProject[], options: { entityCounts?: Record<string, number>; warningCount?: number } = {}): ComicFormatReport {
  const sorted = [...projects].sort((left, right) => left.projectId.localeCompare(right.projectId));
  const summary = {
    projectCount: sorted.length,
    canonicalCount: sorted.filter((item) => item.mappingKind === "canonical").length,
    autoMappedCount: sorted.filter((item) => item.mappingKind === "auto_mapped").length,
    decisionRequiredCount: sorted.filter((item) => item.mappingKind === "decision_required").length,
    unresolvedBlockerCount: sorted.filter((item) => item.resolutionStatus === "open").length,
    importedCount: sorted.filter((item) => item.importStatus === "imported").length,
    entityCounts: { Project: sorted.filter((item) => item.importStatus === "imported").length, ...(options.entityCounts ?? {}) },
    warningCount: options.warningCount ?? 0,
  };
  const base = { schemaVersion: 1 as const, kind: "airoaming_migration_report_v1" as const, projects: sorted, summary };
  return { ...base, reportDigest: digestCanonicalJson(base) };
}
