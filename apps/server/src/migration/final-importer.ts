import { digestCanonicalJson } from "@airoaming/shared";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { containsSecretSentinel } from "./credential-redactor.js";
import { readVerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact } from "./migration-decision.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { FullShadowImporter, FULL_SHADOW_SLICE_ORDER } from "./full-shadow-importer.js";
import { MigrationVerifyService } from "./migration-verify.service.js";
import { createFinalImportReport, FINAL_IMPORTER_VERSION, normalizeFinalImportReport, type FinalImportReport, type FinalImportSlice } from "./final-import-report.js";
import type { CutoverCredentialVerifier, CredentialExpectation } from "./cutover-credential-verifier.js";

export class FinalImportError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface FinalImportOptions {
  snapshotPath: string;
  decisionsPath: string;
  databaseUrl: string;
  workspaceRoot: string;
  dataRoot: string;
  releaseRoot: string;
  secretStoreRoot?: string;
  credentialVerifier?: CutoverCredentialVerifier;
  credentialExpectations?: readonly CredentialExpectation[];
  credentialEvidencePath?: string;
  requiredSecretStoreAdapter?: "keychain" | "fake";
  runId: string;
}

export interface FinalImportResult {
  run: Awaited<ReturnType<PrismaMigrationLedgerRepository["getRun"]>>;
  report: FinalImportReport;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function assertAbsolute(value: string, code: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new FinalImportError(code);
  return path.resolve(value);
}

async function assertDirectory(root: string, code: string, create = false): Promise<void> {
  await assertNoSymlinkAncestors(root, code);
  if (create) await mkdir(root, { recursive: true });
  const stat = await lstat(root).catch(() => null);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new FinalImportError(code);
}

async function assertEmptyDirectory(root: string, code: string): Promise<void> {
  await assertDirectory(root, code, true);
  if ((await readdir(root)).length > 0) throw new FinalImportError(code);
}

async function assertNoSymlinkAncestors(targetPath: string, code: string): Promise<void> {
  let current = path.resolve(targetPath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    });
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new FinalImportError(code);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await assertNoSymlinkAncestors(filePath, "MIGRATION_OUTPUT_PATH_UNSAFE");
  const parent = path.dirname(filePath);
  const existingParent = await lstat(parent).catch(() => null);
  if (existingParent?.isSymbolicLink() || (existingParent && !existingParent.isDirectory())) throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const verifiedParent = await lstat(parent).catch(() => null);
  if (!verifiedParent || verifiedParent.isSymbolicLink() || !verifiedParent.isDirectory()) throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
  const existingFile = await lstat(filePath).catch(() => null);
  if (existingFile && (existingFile.isSymbolicLink() || !existingFile.isFile())) throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
    catch (error) { await handle.close().catch(() => undefined); await rm(temporary, { force: true }).catch(() => undefined); throw error; }
    await handle.close();
  } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
    const parentHandle = await open(parent, "r");
    try { await parentHandle.sync(); } finally { await parentHandle.close(); }
  } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

/**
 * D2-A7 final 编排器。它不复制 16 套 mapper，而是调用已经通过 M4
 * 证据的 FullShadowImporter 作为 child evidence，再由一个权威 final
 * MigrationRun 汇总、验证和绑定 release identity。
 */
export class FinalImportOrchestrator {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(options: FinalImportOptions): Promise<FinalImportResult> {
    const snapshotPath = assertAbsolute(options.snapshotPath, "MIGRATION_SNAPSHOT_PATH_INVALID");
    const decisionsPath = assertAbsolute(options.decisionsPath, "MIGRATION_DECISION_PATH_INVALID");
    const workspaceRoot = assertAbsolute(options.workspaceRoot, "MIGRATION_WORKSPACE_ROOT_INVALID");
    const dataRoot = assertAbsolute(options.dataRoot, "MIGRATION_DATA_ROOT_INVALID");
    const releaseRoot = assertAbsolute(options.releaseRoot, "MIGRATION_RELEASE_ROOT_INVALID");
    const secretStoreRoot = options.secretStoreRoot ? assertAbsolute(options.secretStoreRoot, "MIGRATION_SECRET_STORE_ROOT_INVALID") : null;
    if (!options.databaseUrl.startsWith("file:")) throw new FinalImportError("MIGRATION_DATABASE_URL_INVALID");
    if (process.env.DATABASE_URL !== options.databaseUrl) throw new FinalImportError("MIGRATION_DATABASE_URL_MISMATCH");
    if (!options.runId.trim()) throw new FinalImportError("MIGRATION_RUN_ID_INVALID");
    if (options.credentialVerifier) {
      if (!options.credentialEvidencePath || !path.isAbsolute(options.credentialEvidencePath) || !options.credentialExpectations?.length) throw new FinalImportError("MIGRATION_CREDENTIAL_EVIDENCE_REQUIRED");
      await assertNoSymlinkAncestors(options.credentialEvidencePath, "MIGRATION_CREDENTIAL_EVIDENCE_INVALID");
      const verified = await options.credentialVerifier.verify({ runId: options.runId, entries: options.credentialExpectations, requiredAdapter: options.requiredSecretStoreAdapter });
      await writeJson(options.credentialEvidencePath, verified.evidence);
    } else {
      if (!secretStoreRoot || process.env.AIROAMING_SECRET_STORE_ADAPTER !== "fake" || path.resolve(process.env.AIROAMING_FAKE_SECRET_STORE_ROOT ?? "") !== secretStoreRoot) throw new FinalImportError("MIGRATION_SECRET_STORE_BINDING_INVALID");
    }
    const release = await loadReleaseSchemaIdentityV1(releaseRoot).catch(() => { throw new FinalImportError("MIGRATION_RELEASE_IDENTITY_INVALID"); });
    await assertDirectory(dataRoot, "MIGRATION_DATA_ROOT_INVALID", true);
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const existing = await this.prisma.database().migrationRun.findUnique({ where: { id: options.runId } });
    if (existing) {
      if (existing.kind !== "final" || existing.sourceManifestDigest !== snapshot.sourceManifest.manifestDigest || existing.snapshotManifestDigest !== snapshot.snapshotManifest.manifestDigest || existing.decisionsDigest !== decisions.decisionsDigest) throw new FinalImportError("MIGRATION_FINAL_IDENTITY_CONFLICT");
      if (existing.status !== "succeeded") throw new FinalImportError("MIGRATION_FINAL_RUN_NOT_REPLAYABLE");
      const counts = existing.countsJson && typeof existing.countsJson === "object" && !Array.isArray(existing.countsJson) ? existing.countsJson as Record<string, unknown> : null;
      const aggregate = counts?.aggregateReport;
      if (!aggregate) throw new FinalImportError("MIGRATION_FINAL_REPORT_MISSING");
      let report: FinalImportReport;
      try { report = normalizeFinalImportReport(aggregate); }
      catch { throw new FinalImportError("MIGRATION_FINAL_REPORT_INVALID"); }
      return { run: await this.ledger.getRun(options.runId), report };
    }
    await assertEmptyDirectory(workspaceRoot, "MIGRATION_TARGET_WORKSPACE_NOT_EMPTY");
    if (secretStoreRoot) await assertDirectory(secretStoreRoot, "MIGRATION_SECRET_STORE_ROOT_INVALID", true);
    await this.assertFreshTarget();
    const run = await this.ledger.beginRun({ kind: "final", importerVersion: FINAL_IMPORTER_VERSION, sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId });
    let temporaryRoot: string | null = null;
    try {
      temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-final-child-reports-"));
      const child = await new FullShadowImporter(this.prisma).import(snapshotPath, decisionsPath, { workspaceRoot, runIdPrefix: `${run.id}-child` });
      const slices: FinalImportSlice[] = [];
      const entityCounts: Record<string, number> = {};
      let childVerificationFailed = false;
      for (const result of child.slices) {
        const counts = result.counts;
        const childReportPath = path.join(temporaryRoot, `${result.slice}.json`);
        let passed = false;
        let verificationReportDigest: `sha256:${string}` | null = null;
        if (result.status === "succeeded" && result.report) {
          await writeJson(childReportPath, result.report);
          const verification = await new MigrationVerifyService(this.prisma).verify(snapshotPath, result.runId, releaseRoot, decisionsPath, childReportPath);
          passed = verification.report.passed;
          verificationReportDigest = verification.report.reportDigest;
          if (!passed) childVerificationFailed = true;
        } else {
          childVerificationFailed = true;
        }
        if (counts && typeof counts === "object") {
          const nested = (counts as Record<string, unknown>).entityCounts;
          if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            for (const [key, value] of Object.entries(nested)) if (Number.isInteger(value) && Number(value) >= 0) entityCounts[key] = (entityCounts[key] ?? 0) + Number(value);
          }
        }
        slices.push({ slice: result.slice, runId: result.runId, status: result.status === "succeeded" && passed ? "succeeded" : result.status === "blocked" ? "blocked" : "failed", reportDigest: result.reportDigest as `sha256:${string}` | null, counts, evidence: { verificationReportDigest, passed } });
      }
      if (slices.length !== FULL_SHADOW_SLICE_ORDER.length || slices.some((slice, index) => slice.slice !== FULL_SHADOW_SLICE_ORDER[index])) childVerificationFailed = true;
      const integrity = await this.readIntegrity();
      const secretScanCount = await this.scanSecretSentinels(snapshot, workspaceRoot);
      const failedLedgerCount = await this.prisma.database().migrationRun.count({ where: { status: "failed" } });
      const verification = {
        schemaVersion: 1,
        effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
        sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
        snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
        decisionsDigest: decisions.decisionsDigest,
        integrityCheck: integrity.integrityCheck,
        foreignKeyViolationCount: integrity.foreignKeyViolationCount,
        failedLedgerCount,
        migrationChecksumStatus: "verified",
        openBlockerCount: 0,
        secretScanCount,
        slices: slices.map((slice) => ({ slice: slice.slice, runId: slice.runId, status: slice.status, passed: slice.evidence.passed })),
      };
      const report = createFinalImportReport({ schemaVersion: 1, kind: "airoaming_final_import_report_v1", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, slices, entityCounts });
      const canSucceed = child.status === "succeeded" && !childVerificationFailed && integrity.integrityCheck === "ok" && integrity.foreignKeyViolationCount === 0 && failedLedgerCount === 0 && secretScanCount === 0;
      if (!canSucceed) {
        await this.prisma.database().$transaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey: "final:verification", code: "MIGRATION_FINAL_VERIFICATION_FAILED", entityType: "MigrationRun", entityId: run.id, detailJson: jsonValue({ schemaVersion: 1, childStatus: child.status, childVerificationFailed, integrity, failedLedgerCount, secretScanCount }) }));
        const blocked = await this.ledger.finishRun(run.id, { status: "blocked", reportDigest: report.reportDigest, counts: { aggregateReport: report, entityCounts }, verification: { ...verification, openBlockerCount: 1 }, finishedAt: new Date().toISOString() });
        return { run: blocked, report };
      }
      const finished = await this.ledger.finishRun(run.id, { status: "succeeded", reportDigest: report.reportDigest, counts: { aggregateReport: report, entityCounts }, verification, finishedAt: new Date().toISOString() });
      return { run: finished, report };
    } catch (error) {
      const code = error instanceof FinalImportError ? error.code : error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_FINAL_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original */ }
      if (error instanceof FinalImportError) throw error;
      throw new FinalImportError(code);
    } finally {
      if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  private async readDecisions(decisionsPath: string, expectedSourceDigest: string) {
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expectedSourceDigest as `sha256:${string}`); }
    catch (error) { if (error instanceof Error && "code" in error) throw new FinalImportError(String((error as Error & { code: unknown }).code)); throw new FinalImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async assertFreshTarget(): Promise<void> {
    const db = this.prisma.database();
    const names = await db.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'");
    const allowed = new Set(["persistence_states"]);
    for (const { name } of names) {
      if (allowed.has(name)) continue;
      const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number }>>(`SELECT COUNT(*) AS count FROM \"${name.replace(/\"/g, "\"\"")}\"`);
      if (Number(rows[0]?.count ?? 0) > 0) throw new FinalImportError("MIGRATION_TARGET_NOT_EMPTY");
    }
    const state = await db.persistenceState.findUnique({ where: { id: "primary" } });
    if (!state) {
      try {
        await db.persistenceState.create({ data: { id: "primary" } });
      } catch {
        throw new FinalImportError("MIGRATION_TARGET_STATE_INVALID");
      }
      return;
    }
    if (state.activationState !== "shadow" || state.cutoverRunId !== null || state.activatedAt !== null || state.firstBusinessWriteAt !== null) throw new FinalImportError("MIGRATION_TARGET_STATE_INVALID");
  }

  private async readIntegrity(): Promise<{ integrityCheck: "ok" | "failed"; foreignKeyViolationCount: number }> {
    const db = this.prisma.database();
    const integrity = await db.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA integrity_check");
    const foreignKeys = await db.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check");
    return { integrityCheck: integrity.length === 1 && integrity[0]?.integrity_check === "ok" ? "ok" : "failed", foreignKeyViolationCount: foreignKeys.length };
  }

  private async scanSecretSentinels(snapshot: Awaited<ReturnType<typeof readVerifiedSnapshot>>, workspaceRoot: string): Promise<number> {
    let count = 0;
    for (const item of snapshot.sourceManifest.items) {
      try { if (containsSecretSentinel((await snapshot.readPayload(item.storageKey)).bytes)) count += 1; } catch { /* source verification already owns missing/digest errors */ }
    }
    for (const item of snapshot.snapshotManifest.items) {
      try { if (containsSecretSentinel(await readFile(path.join(snapshot.root, ...item.storageKey.split("/"))))) count += 1; } catch { count += 1; }
    }
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new FinalImportError("MIGRATION_SYMLINK_UNSAFE");
        if (entry.isDirectory()) await walk(child);
        else if (entry.isFile() && containsSecretSentinel(await readFile(child))) count += 1;
      }
    };
    await walk(workspaceRoot);
    const tableNames = await this.prisma.database().$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    for (const { name } of tableNames) {
      const rows = await this.prisma.database().$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM \"${name.replace(/\"/g, "\"\"")}\"`);
      for (const row of rows) if (containsSecretSentinel(row)) count += 1;
    }
    return count;
  }
}
