import { describe, expect, it } from "vitest";
import { buildComicFormatIssue } from "./migration-issue.js";
import { MigrationLedger } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";

const SOURCE = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function issue(runId: string, projectId = "p1") {
  return buildComicFormatIssue({ runId, projectId, sourceStorageKey: `projects/${projectId}/project.json`, sourceDigest: SOURCE, mapping: mapLegacyComicFormat("four_panel"), createdAt: "2026-07-12T00:00:00.000Z" })!;
}

describe("G3-M3-A0 migration ledger", () => {
  it("RUN-01 finishes an audit with an open blocker as blocked", () => {
    const ledger = new MigrationLedger();
    const run = ledger.beginRun({ id: "run-a", kind: "audit", importerVersion: "g3-m3-a0", sourceManifestDigest: SOURCE, startedAt: "2026-07-12T00:00:00.000Z" });
    ledger.recordIssue(issue(run.id));
    const finished = ledger.finishRun(run.id, { status: "blocked", finishedAt: "2026-07-12T00:01:00.000Z" });
    expect(finished.status).toBe("blocked");
    expect(ledger.hasOpenBlocker(run.id)).toBe(true);
  });

  it("RUN-02 keeps an old run unchanged when a new run resolves the issue", () => {
    const ledger = new MigrationLedger();
    ledger.beginRun({ id: "run-old", kind: "audit", importerVersion: "g3-m3-a0", sourceManifestDigest: SOURCE });
    ledger.recordIssue(issue("run-old"));
    ledger.finishRun("run-old", { status: "blocked" });
    ledger.beginRun({ id: "run-new", kind: "audit", importerVersion: "g3-m3-a0", sourceManifestDigest: SOURCE });
    ledger.recordIssue(issue("run-new"));
    ledger.resolveIssue("run-new", "project:p1:comic-format", { decisionSchemaVersion: 1, action: "set_comic_format", chosenComicFormat: "paged_comic", layoutPresetIntent: "four_panel" });
    expect(ledger.finishRun("run-new", { status: "succeeded" }).status).toBe("succeeded");
    expect(ledger.getRun("run-old").status).toBe("blocked");
    expect(ledger.listIssues("run-old")[0].resolutionStatus).toBe("open");
  });

  it("RUN-03 rejects changes after a terminal state", () => {
    const ledger = new MigrationLedger();
    ledger.beginRun({ id: "run-terminal", kind: "audit", importerVersion: "g3-m3-a0", sourceManifestDigest: SOURCE });
    ledger.finishRun("run-terminal", { status: "succeeded" });
    expect(() => ledger.recordIssue(issue("run-terminal"))).toThrowError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
    expect(() => ledger.finishRun("run-terminal", { status: "failed", errorCode: "LATE" })).toThrowError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
  });

  it("records stable source identity and blocks digest conflicts", () => {
    const ledger = new MigrationLedger();
    ledger.beginRun({ id: "run-source", kind: "shadow", importerVersion: "g3-m3-a0", sourceManifestDigest: SOURCE });
    const sourceKey = "workspace-v1:p1:Project:p1";
    const entityId = MigrationLedger.stableEntityId("Project", sourceKey);
    ledger.recordImportedEntitySource("run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: SOURCE, provenanceStatus: "reference_only" });
    expect(ledger.recordImportedEntitySource("run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: SOURCE, provenanceStatus: "complete" }).provenanceStatus).toBe("complete");
    expect(() => ledger.recordImportedEntitySource("run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })).toThrowError("MIGRATION_SOURCE_CONFLICT");
  });
});
