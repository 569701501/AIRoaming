import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Prisma } from "@prisma/client";
import { AppRestoreService } from "../backup/app-restore.service.js";
import { getBlockedDbCapabilities } from "./db-capability-registry.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";

export type DbActivateMode = "dry-run" | "execute";

export interface DbActivateInput {
  runId: string;
  sourceManifestDigest: string;
  effectiveManifestDigest: string;
  releaseRoot: string;
  backup: string;
  gate: "ACT-08";
  mode: DbActivateMode;
}

export interface DbActivateResult {
  mode: DbActivateMode;
  activationState: "ready_for_activation" | "db_only";
  runId: string;
  sourceManifestDigest: string;
  effectiveSchemaManifestDigest: string;
  backupVerified: true;
  activatedAt: string | null;
  firstBusinessWriteAt: string | null;
}

export class DbActivateError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;

function absolute(value: string, code: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new DbActivateError(code);
  return path.resolve(value);
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

/**
 * M6 cutover coordinator. It is deliberately a read-heavy service: the
 * execute path has one conditional transaction, while dry-run never updates
 * PersistenceState. Backup verification reuses the existing sealed-bundle
 * verifier against isolated temporary target parents.
 */
export class DbActivateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restore = new AppRestoreService(),
  ) {}

  private async verifyBackup(input: DbActivateInput): Promise<void> {
    const backup = absolute(input.backup, "ACTIVATE_BACKUP_UNVERIFIED");
    if (!path.basename(backup).startsWith("backup-")) throw new DbActivateError("ACTIVATE_BACKUP_UNVERIFIED");
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(await readFile(path.join(backup, "backup-manifest.json"), "utf8")) as Record<string, unknown>; } catch { throw new DbActivateError("ACTIVATE_BACKUP_UNVERIFIED"); }
    const migration = manifest.migration && typeof manifest.migration === "object" && !Array.isArray(manifest.migration) ? manifest.migration as Record<string, unknown> : null;
    if (manifest.backupKind !== "pre-cutover" || !migration || migration.runKind !== "final" || migration.finalRunId !== input.runId || migration.sourceManifestDigest !== input.sourceManifestDigest || migration.effectiveSchemaManifestDigest !== input.effectiveManifestDigest) throw new DbActivateError("ACTIVATE_BACKUP_UNVERIFIED");
    const scratch = await mkdtemp(path.join(os.tmpdir(), "airoaming-activate-"));
    const releaseRoot = absolute(input.releaseRoot, "ACTIVATE_IDENTITY_MISMATCH");
    try {
      // verify-only never publishes either target root. The parents are made
      // inside an isolated temp marker so no user root can be touched.
      await mkdir(scratch, { recursive: true });
      await this.restore.restore({
        backup,
        releaseRoot,
        targetDataRoot: path.join(scratch, "data-target"),
        targetWorkspaceRoot: path.join(scratch, "workspace-target"),
        mode: "verify-only",
      });
    } catch {
      throw new DbActivateError("ACTIVATE_BACKUP_UNVERIFIED");
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async assertReady(input: DbActivateInput): Promise<{
    state: Prisma.PersistenceStateGetPayload<{}>;
    effectiveSchemaManifestDigest: string;
  }> {
    if (input.gate !== "ACT-08") throw new DbActivateError("ACTIVATE_NOT_READY");
    if (!input.runId.trim() || !DIGEST.test(input.sourceManifestDigest) || !DIGEST.test(input.effectiveManifestDigest)) {
      throw new DbActivateError("ACTIVATE_NOT_READY");
    }
    const releaseRoot = absolute(input.releaseRoot, "ACTIVATE_IDENTITY_MISMATCH");
    const release = await loadReleaseSchemaIdentityV1(releaseRoot).catch(() => {
      throw new DbActivateError("ACTIVATE_IDENTITY_MISMATCH");
    });
    if (release.effectiveSchemaManifestDigest !== input.effectiveManifestDigest) {
      throw new DbActivateError("ACTIVATE_IDENTITY_MISMATCH");
    }
    if (getBlockedDbCapabilities().length > 0) throw new DbActivateError("MIGRATION_CAPABILITY_BLOCKED");
    const db = this.prisma.database();
    const run = await db.migrationRun.findUnique({ where: { id: input.runId } });
    if (!run || run.kind !== "final" || run.status !== "succeeded" || run.sourceManifestDigest !== input.sourceManifestDigest) {
      throw new DbActivateError("ACTIVATE_IDENTITY_MISMATCH");
    }
    const verification = run.verificationJson && typeof run.verificationJson === "object" && !Array.isArray(run.verificationJson)
      ? run.verificationJson as Record<string, unknown>
      : null;
    if (!verification || verification.effectiveSchemaManifestDigest !== input.effectiveManifestDigest || verification.sourceManifestDigest !== input.sourceManifestDigest || verification.snapshotManifestDigest !== run.snapshotManifestDigest || verification.decisionsDigest !== run.decisionsDigest || verification.integrityCheck !== "ok" || verification.foreignKeyViolationCount !== 0 || verification.failedLedgerCount !== 0 || verification.migrationChecksumStatus !== "verified" || verification.openBlockerCount !== 0 || verification.secretScanCount !== 0) {
      throw new DbActivateError("ACTIVATE_IDENTITY_MISMATCH");
    }
    const state = await db.persistenceState.findUnique({ where: { id: "primary" } });
    if (!state || state.activationState !== "ready_for_activation" || state.cutoverRunId !== input.runId || state.sourceManifestDigest !== input.sourceManifestDigest || state.effectiveSchemaManifestDigest !== input.effectiveManifestDigest || state.activatedAt !== null || state.firstBusinessWriteAt !== null) {
      throw new DbActivateError("ACTIVATE_NOT_READY");
    }
    return { state, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest };
  }

  async activate(input: DbActivateInput): Promise<DbActivateResult> {
    await this.assertReady(input);
    await this.verifyBackup(input);
    if (input.mode === "dry-run") {
      const state = await this.prisma.database().persistenceState.findUnique({ where: { id: "primary" } });
      if (!state) throw new DbActivateError("ACTIVATE_NOT_READY");
      return {
        mode: input.mode,
        activationState: "ready_for_activation",
        runId: input.runId,
        sourceManifestDigest: input.sourceManifestDigest,
        effectiveSchemaManifestDigest: input.effectiveManifestDigest,
        backupVerified: true,
        activatedAt: iso(state.activatedAt),
        firstBusinessWriteAt: iso(state.firstBusinessWriteAt),
      };
    }
    const activatedAt = new Date();
    await this.prisma.database().$transaction(async (tx) => {
      const current = await tx.persistenceState.findUnique({ where: { id: "primary" } });
      if (!current || current.activationState !== "ready_for_activation" || current.cutoverRunId !== input.runId || current.sourceManifestDigest !== input.sourceManifestDigest || current.effectiveSchemaManifestDigest !== input.effectiveManifestDigest || current.activatedAt !== null || current.firstBusinessWriteAt !== null) {
        throw new DbActivateError("ACTIVATE_NOT_READY");
      }
      await tx.persistenceState.update({ where: { id: "primary" }, data: { activationState: "db_only", activatedAt } });
    });
    const state = await this.prisma.database().persistenceState.findUnique({ where: { id: "primary" } });
    if (!state || state.activationState !== "db_only" || state.activatedAt === null || state.firstBusinessWriteAt !== null) throw new DbActivateError("ACTIVATE_NOT_READY");
    return {
      mode: input.mode,
      activationState: "db_only",
      runId: input.runId,
      sourceManifestDigest: input.sourceManifestDigest,
      effectiveSchemaManifestDigest: input.effectiveManifestDigest,
      backupVerified: true,
      activatedAt: iso(state.activatedAt),
      firstBusinessWriteAt: iso(state.firstBusinessWriteAt),
    };
  }
}
