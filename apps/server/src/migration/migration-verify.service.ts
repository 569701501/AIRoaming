import { digestCanonicalJson } from "@airoaming/shared";
import { readVerifiedSnapshot } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { checkSourceEvidence } from "./migration-source-evidence.registry.js";

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
    runSucceeded: boolean;
    sourceManifestMatch: boolean;
    snapshotManifestMatch: boolean;
    integrityCheck: "ok" | "failed";
    foreignKeyViolationCount: number;
    openBlockerCount: number;
    sourceEvidenceCount: number;
    sourceEvidenceExpected: boolean;
    sourceEvidenceMissing: boolean;
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

const SOURCE_COUNT_KEYS_BY_IMPORTER: ReadonlyMap<string, readonly string[]> = new Map([
  ["g3-m3-a2", ["Project", "Chapter"]],
  ["g3-m3-a3", ["ProjectScriptOutline", "ChapterScriptVersion"]],
  ["g3-m3-a4", ["ChapterScriptPending", "ChapterScriptRevision"]],
  ["g3-m3-a5", ["StoryVersion", "StorySceneProjection", "StoryBeatProjection"]],
  ["g3-m3-a6", ["StoryboardVersion", "Shot", "StoryboardShotProjection"]],
  ["g3-m3-a7", ["Character"]],
  ["g3-m3-a8", ["Asset"]],
  ["g3-m3-a9", ["AssetReady", "CharacterVisual", "SceneVisual"]],
  ["g3-m3-a10", ["PreflightRevision"]],
  ["g3-m3-a11a", ["GenerationTask"]],
  ["g3-m3-a11b", ["Candidate"]],
  ["g3-m3-a11c", ["CandidateLockRevision"]],
  ["g3-m3-a12", ["LayoutWorkingCopy"]],
  ["g3-m3-a13", ["ExportRevision"]],
  ["g3-m3-a14", ["ProviderConfig", "CredentialMetadata", "AppPreference"]],
  ["g3-m3-a15", ["ConversationThread", "ConversationMessage", "DialogueToolResult", "DialogueRuntimeSession", "PendingDialogueArtifact"]],
]);

function expectsSourceEvidence(importerVersion: string, counts: Record<string, unknown> | null): boolean {
  const entityCounts = counts?.entityCounts;
  if (!entityCounts || typeof entityCounts !== "object" || Array.isArray(entityCounts)) return false;
  const keys = SOURCE_COUNT_KEYS_BY_IMPORTER.get(importerVersion) ?? Object.keys(entityCounts as Record<string, unknown>);
  return keys.some((key) => typeof (entityCounts as Record<string, unknown>)[key] === "number" && Number((entityCounts as Record<string, unknown>)[key]) > 0);
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
    const sourceEvidenceExpected = expectsSourceEvidence(run.importerVersion, run.counts);
    const sourceEvidenceMissing = run.status === "succeeded" && sourceEvidenceExpected && imported.length === 0;
    const sourceMismatchCount = sourceEvidence.sourceMismatchCount;
    const errors: string[] = [];
    if (run.status !== "succeeded") errors.push("MIGRATION_RUN_NOT_SUCCEEDED");
    if (run.sourceManifestDigest !== snapshot.sourceManifest.manifestDigest) errors.push("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (run.snapshotManifestDigest !== snapshot.snapshotManifest.manifestDigest) errors.push("MIGRATION_SNAPSHOT_DIGEST_MISMATCH");
    if (integrityCheck !== "ok") errors.push("MIGRATION_INTEGRITY_CHECK_FAILED");
    if (foreignKeyRows.length > 0) errors.push("MIGRATION_FOREIGN_KEY_CHECK_FAILED");
    if (openBlockerCount > 0) errors.push("MIGRATION_OPEN_BLOCKER");
    if (sourceMismatchCount > 0) errors.push("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (sourceEvidence.unregisteredEntityTypeCount > 0) errors.push("MIGRATION_SOURCE_EVIDENCE_UNREGISTERED");
    if (sourceEvidenceMissing) errors.push("MIGRATION_SOURCE_EVIDENCE_MISSING");
    const base = {
      schemaVersion: 1 as const,
      kind: "airoaming_migration_verification_v1" as const,
      runId,
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      effectiveSchemaManifestDigest: effective.effectiveSchemaManifestDigest,
      checks: { runSucceeded: run.status === "succeeded", sourceManifestMatch: run.sourceManifestDigest === snapshot.sourceManifest.manifestDigest, snapshotManifestMatch: run.snapshotManifestDigest === snapshot.snapshotManifest.manifestDigest, integrityCheck, foreignKeyViolationCount: foreignKeyRows.length, openBlockerCount, sourceEvidenceCount: imported.length, sourceEvidenceExpected, sourceEvidenceMissing, sourceMismatchCount, unregisteredEntityTypeCount: sourceEvidence.unregisteredEntityTypeCount },
      passed: errors.length === 0,
      errors: [...errors].sort(),
    };
    return { report: { ...base, reportDigest: digestCanonicalJson(base) } };
  }
}
