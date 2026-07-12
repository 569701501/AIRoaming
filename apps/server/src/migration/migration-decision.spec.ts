import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { buildComicFormatIssue } from "./migration-issue.js";
import { assertDecisionMatchesIssue, createMigrationDecisionArtifact, normalizeMigrationDecisionArtifact, type MigrationDecisionEntry } from "./migration-decision.js";
import { createComicFormatReport } from "./migration-report.js";

const SOURCE_DIGEST = "sha256:0000000000000000000000000000000000000000000000000000000000000000" as const;
const OTHER_DIGEST = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;

function issue() {
  return buildComicFormatIssue({ runId: "run-1", projectId: "p1", sourceStorageKey: "projects/p1/project.json", sourceDigest: SOURCE_DIGEST, mapping: mapLegacyComicFormat("four_panel"), createdAt: "2026-07-12T00:00:00.000Z" })!;
}

function entry(overrides: Partial<MigrationDecisionEntry> = {}): MigrationDecisionEntry {
  return {
    issueKey: "project:p1:comic-format",
    sourceKey: "workspace-v1:p1:Project:p1",
    sourceDigest: SOURCE_DIGEST,
    action: "set_comic_format",
    chosenComicFormat: "paged_comic",
    layoutPresetIntent: "four_panel",
    ...overrides,
  };
}

describe("migration decisions", () => {
  it("DEC-01 creates a stable non-empty digest for empty entries", () => {
    const left = createMigrationDecisionArtifact(SOURCE_DIGEST, []);
    const right = createMigrationDecisionArtifact(SOURCE_DIGEST, []);
    expect(left).toEqual(right);
    expect(left.decisionsDigest).toBe(digestCanonicalJson({ schemaVersion: 1, kind: "airoaming_migration_decisions_v1", sourceManifestDigest: SOURCE_DIGEST, entries: [] }));
  });

  it("DEC-02 accepts both legal four_panel resolutions", () => {
    for (const chosenComicFormat of ["vertical_scroll", "paged_comic"] as const) {
      const artifact = createMigrationDecisionArtifact(SOURCE_DIGEST, [entry({ chosenComicFormat })]);
      const normalized = normalizeMigrationDecisionArtifact(artifact, SOURCE_DIGEST);
      expect(normalized.entries[0].chosenComicFormat).toBe(chosenComicFormat);
      assertDecisionMatchesIssue(normalized.entries[0], issue().issueKey, issue().detailJson);
    }
  });

  it("DEC-03 rejects extra fields, duplicates, wrong order and forged intent", () => {
    const valid = createMigrationDecisionArtifact(SOURCE_DIGEST, [entry()]);
    awaitReject(() => normalizeMigrationDecisionArtifact({ ...valid, entries: [{ ...valid.entries[0], extra: true }] }));
    awaitReject(() => normalizeMigrationDecisionArtifact({ ...valid, entries: [valid.entries[0], valid.entries[0]], decisionsDigest: valid.decisionsDigest }));
    awaitReject(() => normalizeMigrationDecisionArtifact({ ...valid, entries: [{ ...valid.entries[0], layoutPresetIntent: null }], decisionsDigest: valid.decisionsDigest }));
    awaitReject(() => normalizeMigrationDecisionArtifact({ ...valid, entries: [{ ...valid.entries[0], sourceDigest: OTHER_DIGEST }], decisionsDigest: valid.decisionsDigest }));
  });

  it("DEC-04 rejects stale source manifest and issue evidence", () => {
    const valid = createMigrationDecisionArtifact(SOURCE_DIGEST, [entry()]);
    awaitReject(() => normalizeMigrationDecisionArtifact(valid, OTHER_DIGEST));
    awaitReject(() => assertDecisionMatchesIssue(valid.entries[0], valid.entries[0].issueKey, issue().detailJson.replace(SOURCE_DIGEST, OTHER_DIGEST)));
  });

  it("builds a deterministic report digest without a run timestamp", () => {
    const report = createComicFormatReport([{
      projectId: "p1",
      sourceStorageKey: "projects/p1/project.json",
      sourceDigest: SOURCE_DIGEST,
      originalComicFormat: { kind: "string", preview: "four_panel" },
      mappingKind: "decision_required",
      targetComicFormat: null,
      layoutPresetIntent: "four_panel",
      issueKey: "project:p1:comic-format",
      resolutionStatus: "open",
      importStatus: "blocked",
    }]);
    expect(report.summary).toMatchObject({ projectCount: 1, decisionRequiredCount: 1, unresolvedBlockerCount: 1 });
    expect(report.reportDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

function awaitReject(execute: () => unknown): void {
  expect(execute).toThrow();
}

