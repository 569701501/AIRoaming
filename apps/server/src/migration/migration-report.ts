import { digestCanonicalJson } from "@airoaming/shared";
import type { ComicFormatMapping } from "./comic-format-migration.plugin.js";
import type { Digest } from "./migration-issue.js";

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

export function createComicFormatReport(projects: readonly ComicFormatReportProject[], options: { entityCounts?: Record<string, number> } = {}): ComicFormatReport {
  const sorted = [...projects].sort((left, right) => left.projectId.localeCompare(right.projectId));
  const summary = {
    projectCount: sorted.length,
    canonicalCount: sorted.filter((item) => item.mappingKind === "canonical").length,
    autoMappedCount: sorted.filter((item) => item.mappingKind === "auto_mapped").length,
    decisionRequiredCount: sorted.filter((item) => item.mappingKind === "decision_required").length,
    unresolvedBlockerCount: sorted.filter((item) => item.resolutionStatus === "open").length,
    importedCount: sorted.filter((item) => item.importStatus === "imported").length,
    entityCounts: { Project: sorted.filter((item) => item.importStatus === "imported").length, ...(options.entityCounts ?? {}) },
    warningCount: 0,
  };
  const base = { schemaVersion: 1 as const, kind: "airoaming_migration_report_v1" as const, projects: sorted, summary };
  return { ...base, reportDigest: digestCanonicalJson(base) };
}
