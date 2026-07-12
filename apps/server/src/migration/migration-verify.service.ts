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
    const base = {
      schemaVersion: 1 as const,
      kind: "airoaming_migration_verification_v1" as const,
      runId,
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      effectiveSchemaManifestDigest: effective.effectiveSchemaManifestDigest,
      checks: { runSucceeded: run.status === "succeeded", sourceManifestMatch: run.sourceManifestDigest === snapshot.sourceManifest.manifestDigest, snapshotManifestMatch: run.snapshotManifestDigest === snapshot.snapshotManifest.manifestDigest, integrityCheck, foreignKeyViolationCount: foreignKeyRows.length, openBlockerCount, sourceMismatchCount, unregisteredEntityTypeCount: sourceEvidence.unregisteredEntityTypeCount },
      passed: errors.length === 0,
      errors: [...errors].sort(),
    };
    return { report: { ...base, reportDigest: digestCanonicalJson(base) } };
  }
}
