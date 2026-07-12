import { digestCanonicalJson } from "@airoaming/shared";
import { readVerifiedSnapshot } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { checkSourceEvidence } from "./migration-source-evidence.registry.js";
import type { MigrationRunKind } from "./migration-ledger.js";

export class MigrationVerifyError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface MigrationVerificationReport {
  schemaVersion: 1;
  kind: "airoaming_migration_verification_v1";
  runId: string;
  sourceManifestDigest: string;
  snapshotManifestDigest: string;
  effectiveSchemaManifestDigest: string;
  checks: {
    runKind: MigrationRunKind;
    runSucceeded: boolean;
    sourceManifestMatch: boolean;
    snapshotManifestMatch: boolean;
    integrityCheck: "ok" | "failed";
    foreignKeyViolationCount: number;
    openBlockerCount: number;
    sourceEvidenceCount: number;
    sourceEvidenceExpected: boolean;
    sourceEvidenceExpectedCount: number;
    sourceEvidenceMissing: boolean;
    sourceEvidenceCountMismatch: boolean;
    sourceMismatchCount: number;
    unregisteredEntityTypeCount: number;
  };
  passed: boolean;
  errors: string[];
  reportDigest: `sha256:${string}`;
}

type SqliteRow = Record<string, unknown>;

function rows(value: unknown): SqliteRow[] {
  return Array.isArray(value) ? value as SqliteRow[] : [];
}

function text(value: unknown): string { return typeof value === "string" ? value : ""; }

interface SourceCountBinding {
  countKey: string;
  entityType: string;
}

const SOURCE_COUNT_BINDINGS_BY_IMPORTER: ReadonlyMap<string, readonly SourceCountBinding[]> = new Map([
  ["g3-m3-a2", [{ countKey: "Project", entityType: "Project" }, { countKey: "Chapter", entityType: "Chapter" }]],
  ["g3-m3-a3", [{ countKey: "ProjectScriptOutline", entityType: "ProjectScriptOutline" }, { countKey: "ChapterScriptVersion", entityType: "ChapterScriptVersion" }]],
  ["g3-m3-a4", [{ countKey: "ChapterScriptPending", entityType: "ChapterScriptPending" }, { countKey: "ChapterScriptRevision", entityType: "ChapterScriptRevision" }]],
  ["g3-m3-a5", [{ countKey: "StoryVersion", entityType: "StoryVersion" }, { countKey: "StorySceneProjection", entityType: "StorySceneProjection" }, { countKey: "StoryBeatProjection", entityType: "StoryBeatProjection" }]],
  // Shot rows are projections whose source evidence is recorded by the
  // StoryboardShotProjection row; there is intentionally no separate Shot
  // ImportedEntitySource row.
  ["g3-m3-a6", [{ countKey: "StoryboardVersion", entityType: "StoryboardVersion" }, { countKey: "StoryboardShotProjection", entityType: "StoryboardShotProjection" }]],
  ["g3-m3-a7", [{ countKey: "Character", entityType: "Character" }]],
  ["g3-m3-a8", [{ countKey: "Asset", entityType: "Asset" }]],
  // AssetReady is a report-level count; its source row is the physical
  // evidence record created during staged -> ready promotion.
  ["g3-m3-a9", [{ countKey: "AssetReady", entityType: "AssetPhysicalEvidence" }, { countKey: "CharacterVisual", entityType: "CharacterVisual" }, { countKey: "SceneVisual", entityType: "SceneVisual" }]],
  ["g3-m3-a10", [{ countKey: "PreflightRevision", entityType: "PreflightRevision" }]],
  ["g3-m3-a11a", [{ countKey: "GenerationTask", entityType: "GenerationTask" }]],
  ["g3-m3-a11b", [{ countKey: "Candidate", entityType: "Candidate" }]],
  ["g3-m3-a11c", [{ countKey: "CandidateLockRevision", entityType: "CandidateLockRevision" }]],
  ["g3-m3-a12", [{ countKey: "LayoutWorkingCopy", entityType: "LayoutWorkingCopy" }]],
  ["g3-m3-a13", [{ countKey: "ExportRevision", entityType: "ExportRevision" }]],
  ["g3-m3-a14", [{ countKey: "ProviderConfig", entityType: "ProviderConfig" }, { countKey: "CredentialMetadata", entityType: "CredentialMetadata" }, { countKey: "AppPreference", entityType: "AppPreference" }]],
  ["g3-m3-a15", [{ countKey: "ConversationThread", entityType: "ConversationThread" }, { countKey: "ConversationMessage", entityType: "ConversationMessage" }, { countKey: "DialogueToolResult", entityType: "DialogueToolResult" }, { countKey: "DialogueRuntimeSession", entityType: "DialogueRuntimeSession" }, { countKey: "PendingDialogueArtifact", entityType: "PendingDialogueArtifact" }]],
]);

function buildExpectedSourceCounts(importerVersion: string, counts: Record<string, unknown> | null): Map<string, number> {
  const entityCounts = counts?.entityCounts;
  if (!entityCounts || typeof entityCounts !== "object" || Array.isArray(entityCounts)) return new Map();
  const values = entityCounts as Record<string, unknown>;
  const bindings = SOURCE_COUNT_BINDINGS_BY_IMPORTER.get(importerVersion)
    ?? Object.keys(values).map((countKey) => ({ countKey, entityType: countKey }));
  return new Map(bindings.map(({ countKey, entityType }) => [entityType, typeof values[countKey] === "number" && values[countKey] > 0 ? values[countKey] : 0]));
}

/** M3/M4 只读 verifier：不修改终态 MigrationRun，也不推进 PersistenceState。 */
export class MigrationVerifyService {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async verify(snapshotPath: string, runId: string, workspaceRoot = process.cwd()): Promise<{ report: MigrationVerificationReport }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const run = await this.ledger.getRun(runId);
    const effective = await loadReleaseSchemaIdentityV1(workspaceRoot);
    const db = this.prisma.database();
    const integrityRows = rows(await db.$queryRawUnsafe("PRAGMA integrity_check"));
    const foreignKeyRows = rows(await db.$queryRawUnsafe("PRAGMA foreign_key_check"));
    const integrityCheck: "ok" | "failed" = integrityRows.length === 1 && text(integrityRows[0]?.integrity_check) === "ok" ? "ok" : "failed";
    const openBlockerCount = await db.migrationIssue.count({ where: { runId, severity: "blocker", resolutionStatus: "open" } });
    const imported = await db.importedEntitySource.findMany({ where: { lastRunId: runId }, select: { entityType: true, sourceStorageKey: true, sourceDigest: true } });
    const sourceEvidence = await checkSourceEvidence(snapshot, imported);
    const expectedSourceCounts = buildExpectedSourceCounts(run.importerVersion, run.counts);
    const actualSourceCounts = new Map<string, number>();
    for (const row of imported) actualSourceCounts.set(row.entityType, (actualSourceCounts.get(row.entityType) ?? 0) + 1);
    const sourceEvidenceExpectedCount = [...expectedSourceCounts.values()].reduce((sum, count) => sum + count, 0);
    const sourceEvidenceExpected = sourceEvidenceExpectedCount > 0;
    const sourceEvidenceMissingCount = [...expectedSourceCounts.entries()].reduce((sum, [entityType, expected]) => sum + Math.max(expected - (actualSourceCounts.get(entityType) ?? 0), 0), 0);
    const sourceEvidenceMissing = run.status === "succeeded" && sourceEvidenceMissingCount > 0;
    const sourceEvidenceCountMismatch = run.status === "succeeded" && (
      [...expectedSourceCounts.entries()].some(([entityType, expected]) => (actualSourceCounts.get(entityType) ?? 0) !== expected)
      || [...actualSourceCounts.keys()].some((entityType) => !expectedSourceCounts.has(entityType))
    );
    const sourceMismatchCount = sourceEvidence.sourceMismatchCount;
    const errors: string[] = [];
    if (run.kind !== "shadow") errors.push("MIGRATION_RUN_KIND_INVALID");
    if (run.status !== "succeeded") errors.push("MIGRATION_RUN_NOT_SUCCEEDED");
    if (run.sourceManifestDigest !== snapshot.sourceManifest.manifestDigest) errors.push("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (run.snapshotManifestDigest !== snapshot.snapshotManifest.manifestDigest) errors.push("MIGRATION_SNAPSHOT_DIGEST_MISMATCH");
    if (integrityCheck !== "ok") errors.push("MIGRATION_INTEGRITY_CHECK_FAILED");
    if (foreignKeyRows.length > 0) errors.push("MIGRATION_FOREIGN_KEY_CHECK_FAILED");
    if (openBlockerCount > 0) errors.push("MIGRATION_OPEN_BLOCKER");
    if (sourceMismatchCount > 0) errors.push("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (sourceEvidence.unregisteredEntityTypeCount > 0) errors.push("MIGRATION_SOURCE_EVIDENCE_UNREGISTERED");
    if (sourceEvidenceMissing) errors.push("MIGRATION_SOURCE_EVIDENCE_MISSING");
    if (sourceEvidenceCountMismatch && !sourceEvidenceMissing) errors.push("MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH");
    const base = {
      schemaVersion: 1 as const,
      kind: "airoaming_migration_verification_v1" as const,
      runId,
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      effectiveSchemaManifestDigest: effective.effectiveSchemaManifestDigest,
      checks: { runKind: run.kind, runSucceeded: run.status === "succeeded", sourceManifestMatch: run.sourceManifestDigest === snapshot.sourceManifest.manifestDigest, snapshotManifestMatch: run.snapshotManifestDigest === snapshot.snapshotManifest.manifestDigest, integrityCheck, foreignKeyViolationCount: foreignKeyRows.length, openBlockerCount, sourceEvidenceCount: imported.length, sourceEvidenceExpected, sourceEvidenceExpectedCount, sourceEvidenceMissing, sourceEvidenceCountMismatch, sourceMismatchCount, unregisteredEntityTypeCount: sourceEvidence.unregisteredEntityTypeCount },
      passed: errors.length === 0,
      errors: [...errors].sort(),
    };
    return { report: { ...base, reportDigest: digestCanonicalJson(base) } };
  }
}
