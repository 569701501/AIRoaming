import { chmod, lstat, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import { SnapshotService } from "./snapshot.service.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { CutoverSettingsService } from "../settings/cutover-settings.service.js";
import { MacOSKeychainSecretStore, type SecretStore } from "../settings/secret-store.js";
import { CutoverCredentialVerifier } from "./cutover-credential-verifier.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { FinalImportOrchestrator } from "./final-importer.js";
import { ReadyCoordinator } from "./ready-coordinator.js";
import { AppBackupService } from "../backup/app-backup.service.js";
import { AppRestoreService } from "../backup/app-restore.service.js";
import { MetadataArchiveService } from "./metadata-archive.service.js";
import { DbActivateService } from "./db-activate.service.js";
import { CutoverEvidenceStore } from "./cutover-evidence.service.js";
import { readVerifiedCutoverShadowGate } from "./cutover-shadow-gate.js";
import { DbCutoverError, type CutoverAction } from "./db-cutover.service.js";
import type { CutoverEvidenceStep } from "./cutover-evidence.service.js";
import type { CutoverPlanV1 } from "./cutover-plan.types.js";

type SpawnLike = typeof spawn;
type FetchLike = typeof fetch;

export interface CutoverRunnerDependencies {
  readonly fetch: FetchLike;
  readonly spawn: SpawnLike;
  readonly secretStore: SecretStore;
  readonly secretStoreAdapter: "keychain" | "fake";
  readonly createPrisma: () => PrismaService;
  readonly createSnapshot: () => SnapshotService;
  readonly createSettings: (store: SecretStore) => CutoverSettingsService;
  readonly createFinalImporter: (prisma: PrismaService) => FinalImportOrchestrator;
  readonly createReady: (prisma: PrismaService) => ReadyCoordinator;
  readonly createBackup: (prisma: PrismaService) => AppBackupService;
  readonly createRestore: () => AppRestoreService;
  readonly createArchive: () => MetadataArchiveService;
  readonly createActivate: (prisma: PrismaService) => DbActivateService;
}

export function productionCutoverRunnerDependencies(): CutoverRunnerDependencies {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    spawn,
    // The production cutover entry must not be redirected by the test-only
    // AIROAMING_SECRET_STORE_ADAPTER environment variable. Tests replace this
    // dependency explicitly; the real runner always binds to macOS Keychain.
    secretStore: new MacOSKeychainSecretStore(),
    secretStoreAdapter: "keychain",
    createPrisma: () => new PrismaService(),
    createSnapshot: () => new SnapshotService(),
    createSettings: (store) => new CutoverSettingsService(store),
    createFinalImporter: (prisma) => new FinalImportOrchestrator(prisma),
    createReady: (prisma) => new ReadyCoordinator(prisma),
    createBackup: (prisma) => new AppBackupService(prisma),
    createRestore: () => new AppRestoreService(),
    createArchive: () => new MetadataArchiveService(),
    createActivate: (prisma) => new DbActivateService(prisma),
  };
}

const artifacts = (value: Record<string, `sha256:${string}`>) => value;

async function requireRegularFile(filePath: string, code: string): Promise<void> {
  await assertNoSymlinkAncestors(filePath, code);
  const metadata = await lstat(filePath).catch(() => null);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isFile()) throw new DbCutoverError(code);
}

async function requireRegularDirectory(directoryPath: string, code: string): Promise<void> {
  await assertNoSymlinkAncestors(directoryPath, code);
  const metadata = await lstat(directoryPath).catch(() => null);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) throw new DbCutoverError(code);
}

async function assertNoSymlinkAncestors(filePath: string, code: string): Promise<void> {
  let current = path.resolve(filePath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT") return null;
      throw new DbCutoverError(code);
    });
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new DbCutoverError(code);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function assertSafeOutputPath(filePath: string, code = "CUTOVER_PATH_SYMLINK"): Promise<void> {
  await assertNoSymlinkAncestors(filePath, code);
  const metadata = await lstat(filePath).catch(() => null);
  if (metadata?.isSymbolicLink() || (metadata && !metadata.isFile())) throw new DbCutoverError(code);
}

async function assertSafeDirectoryPath(directoryPath: string, code = "CUTOVER_PATH_SYMLINK"): Promise<void> {
  await assertNoSymlinkAncestors(directoryPath, code);
  const metadata = await lstat(directoryPath).catch(() => null);
  if (metadata?.isSymbolicLink() || (metadata && !metadata.isDirectory())) throw new DbCutoverError(code);
}

async function writePrivateJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await assertSafeOutputPath(filePath);
  const parent = path.dirname(filePath);
  const parentMetadata = await lstat(parent).catch(() => null);
  if (parentMetadata?.isSymbolicLink() || (parentMetadata && !parentMetadata.isDirectory())) throw new DbCutoverError("CUTOVER_PATH_SYMLINK");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const verifiedParent = await lstat(parent).catch(() => null);
  if (!verifiedParent || verifiedParent.isSymbolicLink() || !verifiedParent.isDirectory()) throw new DbCutoverError("CUTOVER_PATH_SYMLINK");
  const existing = await lstat(filePath).catch(() => null);
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new DbCutoverError("CUTOVER_PATH_SYMLINK");
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
    const parentHandle = await open(parent, "r");
    try { await parentHandle.sync(); } finally { await parentHandle.close(); }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function runMigrations(deps: CutoverRunnerDependencies, plan: CutoverPlanV1): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = deps.spawn("pnpm", ["--dir", "apps/server", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
      cwd: plan.releaseRoot,
      env: { ...process.env, DATABASE_URL: plan.targetDatabaseUrl },
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8").slice(-1000); });
    child.once("error", () => reject(new DbCutoverError("CUTOVER_MIGRATION_EXECUTOR_FAILED")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new DbCutoverError(stderr.includes("secret") ? "CUTOVER_MIGRATION_EXECUTOR_FAILED" : "CUTOVER_MIGRATION_DEPLOY_FAILED")));
  });
}

export function createCutoverAction(step: CutoverEvidenceStep, authorizationFile: string | undefined, deps: CutoverRunnerDependencies = productionCutoverRunnerDependencies()): CutoverAction {
  return async ({ plan }) => {
    if (step === "C0") {
      if (!plan.shadowGatePath) throw new DbCutoverError("CUTOVER_C0_SHADOW_GATE_REQUIRED");
      try {
        const gate = await readVerifiedCutoverShadowGate(plan.shadowGatePath, plan);
        return { summaryCode: "CUTOVER_C0_OK", artifactDigests: artifacts({ shadowGateDigest: gate.gateDigest, migrationReportDigest: gate.migrationReportDigest }) };
      } catch (error) {
        if (error instanceof Error && "code" in error) throw new DbCutoverError(String((error as Error & { code: unknown }).code));
        throw error;
      }
    }
    if (step === "C1") {
      const tokenPath = plan.maintenanceTokenFile;
      await requireRegularFile(tokenPath, "CUTOVER_TOKEN_INVALID");
      if ((await stat(tokenPath)).mode & 0o077) throw new DbCutoverError("CUTOVER_TOKEN_PERMISSIONS");
      const token = (await readFile(tokenPath, "utf8")).trim();
      if (!token) throw new DbCutoverError("CUTOVER_TOKEN_INVALID");
      const call = async (name: "drain" | "close" | "bundle") => {
        const response = await deps.fetch(`${plan.maintenanceBaseUrl}/_local/maintenance/${name}`, { method: "POST", headers: { "X-AIRoaming-Maintenance-Token": token, "content-type": "application/json" }, body: name === "drain" ? JSON.stringify({ timeoutMs: 120_000 }) : undefined });
        const payload = await response.json() as { success?: boolean; data?: unknown; error?: { code?: string } };
        if (!response.ok || payload.success === false) throw new DbCutoverError(payload.error?.code ?? "CUTOVER_MAINTENANCE_FAILED");
        return payload.data;
      };
      await call("drain"); await call("close");
      const bundle = await call("bundle");
      await new RuntimeBundleFileService().writeAtomic(plan.runtimeBundlePath, bundle as never);
      const verified = await new RuntimeBundleFileService().readAndVerify(plan.runtimeBundlePath, { profile: "cutover" });
      return { summaryCode: "CUTOVER_C1_OK", artifactDigests: artifacts({ runtimeBundleDigest: verified.digest }) };
    }
    if (step === "C2") {
      const stagingRoot = `${plan.snapshotRoot}.staging`;
      const snapshot = await deps.createSnapshot().createSnapshot({ workspaceRoot: plan.sourceWorkspaceRoot, stagingRoot, runtimeBundle: plan.runtimeBundlePath });
      if (await lstat(plan.snapshotRoot).catch(() => null)) throw new DbCutoverError("CUTOVER_SNAPSHOT_TARGET_EXISTS");
      await mkdir(path.dirname(plan.snapshotRoot), { recursive: true, mode: 0o700 });
      await rename(snapshot.outputPath, plan.snapshotRoot);
      await rm(stagingRoot, { recursive: true, force: true });
      return { summaryCode: "CUTOVER_C2_OK", artifactDigests: artifacts({ sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, runtimeBundleDigest: snapshot.runtimeBundleDigest }) };
    }
    if (step === "C3") {
      await assertSafeDirectoryPath(plan.evidenceRoot);
      await assertSafeOutputPath(`${plan.evidenceRoot}/credential-expectations.json`);
      await assertSafeDirectoryPath(plan.targetDataRoot);
      const targetDataBefore = await lstat(plan.targetDataRoot).catch(() => null);
      const databasePath = path.resolve(plan.targetDatabaseUrl.slice("file:".length));
      await assertNoSymlinkAncestors(databasePath, "CUTOVER_TARGET_PATH_UNSAFE");
      const databaseBefore = await lstat(databasePath).catch(() => null);
      let settings: CutoverSettingsService | null = null;
      let prestaged: Awaited<ReturnType<CutoverSettingsService["prestage"]>> | null = null;
      try {
        await mkdir(plan.targetDataRoot, { recursive: true, mode: 0o700 });
        await mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
        const existingDatabase = await lstat(databasePath).catch(() => null);
        if (existingDatabase && (!existingDatabase.isFile() || existingDatabase.size > 0)) throw new DbCutoverError("CUTOVER_TARGET_NOT_EMPTY");
        const databaseHandle = await open(databasePath, "a", 0o600);
        await databaseHandle.close();
        await runMigrations(deps, plan);
        const settingsPath = `${plan.sourceWorkspaceRoot}/settings/app-settings.json`;
        settings = deps.createSettings(deps.secretStore);
        const inspection = await settings.inspect(settingsPath);
        if (inspection.startState !== plan.settingsStartState || (inspection.startState === "legacy_plaintext_requires_two_phase" ? plan.credentialAction !== "prestage_legacy" : plan.credentialAction !== "verify_existing")) throw new DbCutoverError("CUTOVER_SETTINGS_START_STATE_MISMATCH");
        prestaged = await settings.prestage(inspection, { textAuthVerified: inspection.hasLegacyTextCredential ? true : undefined });
        const expectationsPath = `${plan.evidenceRoot}/credential-expectations.json`;
        await mkdir(plan.evidenceRoot, { recursive: true, mode: 0o700 });
        await writePrivateJsonAtomic(expectationsPath, prestaged.expectations);
      } catch (error) {
        if (settings && prestaged) await settings.rollbackPrestage(prestaged).catch(() => undefined);
        const currentData = await lstat(plan.targetDataRoot).catch(() => null);
        if (!databaseBefore) {
          for (const databaseArtifact of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
            const artifact = await lstat(databaseArtifact).catch(() => null);
            if (artifact && !artifact.isSymbolicLink()) await rm(databaseArtifact, { force: true }).catch(() => undefined);
          }
        }
        if (currentData && !currentData.isSymbolicLink() && !targetDataBefore) await rm(plan.targetDataRoot, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      const expectations = prestaged!;
      const digest = `sha256:${createHash("sha256").update(JSON.stringify(expectations.expectations), "utf8").digest("hex")}` as `sha256:${string}`;
      return { summaryCode: "CUTOVER_C3_OK", artifactDigests: artifacts({ credentialExpectationsDigest: digest }) };
    }
    if (step === "C4") {
      const expectationsPath = `${plan.evidenceRoot}/credential-expectations.json`;
      await assertSafeDirectoryPath(plan.evidenceRoot);
      await assertSafeOutputPath(expectationsPath, "CUTOVER_CREDENTIAL_EXPECTATIONS_INVALID");
      await assertSafeOutputPath(plan.finalReportPath);
      await assertSafeOutputPath(`${plan.evidenceRoot}/credential-evidence.json`, "CUTOVER_CREDENTIAL_EVIDENCE_INVALID");
      await assertSafeOutputPath(`${plan.evidenceRoot}/backup-pointer.json`);
      await requireRegularFile(expectationsPath, "CUTOVER_CREDENTIAL_EXPECTATIONS_INVALID");
      const credentialExpectations = JSON.parse(await readFile(expectationsPath, "utf8")) as never;
      await requireRegularFile(plan.decisionsPath, "CUTOVER_DECISIONS_PATH_INVALID");
      const decisionsArtifact = JSON.parse(await readFile(plan.decisionsPath, "utf8")) as { decisionsDigest?: unknown };
      if (typeof decisionsArtifact.decisionsDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(decisionsArtifact.decisionsDigest)) throw new DbCutoverError("CUTOVER_DECISIONS_DIGEST_MISSING");
      const decisionsDigest = decisionsArtifact.decisionsDigest as `sha256:${string}`;
      const credentialEvidencePath = `${plan.evidenceRoot}/credential-evidence.json`;
      const previousPersistenceMode = process.env.AIROAMING_PERSISTENCE_MODE;
      const previousDatabaseUrl = process.env.DATABASE_URL;
      process.env.AIROAMING_PERSISTENCE_MODE = "db"; process.env.DATABASE_URL = plan.targetDatabaseUrl;
      const prisma = deps.createPrisma();
      try {
        await prisma.onModuleInit();
        const verifier = new CutoverCredentialVerifier(deps.secretStore);
        const finalResult = await deps.createFinalImporter(prisma).import({ snapshotPath: plan.snapshotRoot, decisionsPath: plan.decisionsPath, databaseUrl: plan.targetDatabaseUrl, workspaceRoot: plan.targetWorkspaceRoot, dataRoot: plan.targetDataRoot, releaseRoot: plan.releaseRoot, runId: plan.runId, credentialVerifier: verifier, credentialExpectations, credentialEvidencePath, requiredSecretStoreAdapter: deps.secretStoreAdapter });
        if (finalResult.run.status !== "succeeded") throw new DbCutoverError("CUTOVER_FINAL_IMPORT_BLOCKED");
        await writePrivateJsonAtomic(plan.finalReportPath, finalResult.report);
        await deps.createReady(prisma).markReady({ runId: plan.runId, releaseRoot: plan.releaseRoot, workspaceRoot: plan.targetWorkspaceRoot, maintenanceBundle: plan.runtimeBundlePath, credentialEvidencePath, requiredSecretStoreAdapter: deps.secretStoreAdapter, strictRuntimeProfile: true });
        await mkdir(plan.backupRoot, { recursive: true, mode: 0o700 });
        // The final-imported Asset rows point at files materialized under the
        // target workspace. Back up that sealed target projection, not the
        // legacy source workspace (which intentionally remains unchanged).
        const backup = await deps.createBackup(prisma).backup({ databaseUrl: plan.targetDatabaseUrl, workspaceRoot: plan.targetWorkspaceRoot, dataRoot: plan.targetDataRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, maintenanceBundle: plan.runtimeBundlePath, decisions: plan.decisionsPath, output: plan.backupRoot, kind: "pre-cutover", runId: plan.runId, runtimeProfile: "cutover" });
        await writePrivateJsonAtomic(`${plan.evidenceRoot}/backup-pointer.json`, { bundlePath: backup.bundlePath, bundleDigest: backup.bundleDigest });
        await deps.createRestore().restore({ backup: backup.bundlePath, releaseRoot: plan.releaseRoot, targetDataRoot: plan.restoreDataRoot, targetWorkspaceRoot: plan.restoreWorkspaceRoot, mode: "verify-only" });
        const settings = deps.createSettings(deps.secretStore);
        const inspection = await settings.inspect(`${plan.sourceWorkspaceRoot}/settings/app-settings.json`);
        if (inspection.startState !== plan.settingsStartState) throw new DbCutoverError("CUTOVER_SETTINGS_START_STATE_CHANGED");
        if (inspection.startState === "legacy_plaintext_requires_two_phase") {
          const redacted = await settings.commit(await settings.prestage(inspection, { textAuthVerified: true }), { textAuthVerified: true });
          return { summaryCode: "CUTOVER_C4_OK", artifactDigests: artifacts({ finalReportDigest: finalResult.report.reportDigest, backupDigest: backup.bundleDigest, redactedSettingsDigest: redacted.redactedBytesDigest, decisionsDigest }) };
        }
        return { summaryCode: "CUTOVER_C4_OK", artifactDigests: artifacts({ finalReportDigest: finalResult.report.reportDigest, backupDigest: backup.bundleDigest, redactedSettingsDigest: inspection.originalBytesDigest, decisionsDigest }) };
      } finally {
        await prisma.onModuleDestroy();
        if (previousPersistenceMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previousPersistenceMode;
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
    if (step === "C5") {
      const previousPersistenceMode = process.env.AIROAMING_PERSISTENCE_MODE;
      const previousDatabaseUrl = process.env.DATABASE_URL;
      process.env.AIROAMING_PERSISTENCE_MODE = "db"; process.env.DATABASE_URL = plan.targetDatabaseUrl;
      const prisma = deps.createPrisma();
      try {
        const runtime = await new RuntimeBundleFileService().readAndVerify(plan.runtimeBundlePath, { profile: "cutover" });
        await prisma.onModuleInit();
        const state = await prisma.database().persistenceState.findUnique({ where: { id: "primary" } });
        if (!state || state.activationState !== "ready_for_activation" || state.firstBusinessWriteAt !== null) throw new DbCutoverError("CUTOVER_C5_STATE_INVALID");
        await prisma.database().$transaction(async (tx) => { await tx.$queryRaw`SELECT 1`; });
        return { summaryCode: "CUTOVER_C5_OK", artifactDigests: artifacts({ runtimeBundleDigest: runtime.digest }) };
      } finally {
        await prisma.onModuleDestroy();
        if (previousPersistenceMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previousPersistenceMode;
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
    if (step === "C6") {
      const archived = await deps.createArchive().archive({ workspaceRoot: plan.sourceWorkspaceRoot, archiveRoot: plan.archiveRoot, marker: plan.runId });
      return { summaryCode: "CUTOVER_C6_OK", artifactDigests: artifacts({ archiveDigest: archived.metadataDigest }) };
    }
    if (step === "C7") {
      await assertSafeOutputPath(`${plan.evidenceRoot}/backup-pointer.json`, "CUTOVER_BACKUP_POINTER_INVALID");
      const evidence = await new CutoverEvidenceStore(plan.evidenceRoot, { cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest }).readVerified();
      if (!evidence.manifest.sourceManifestDigest) throw new DbCutoverError("CUTOVER_SOURCE_DIGEST_MISSING");
      const backupPointerPath = `${plan.evidenceRoot}/backup-pointer.json`;
      await requireRegularFile(backupPointerPath, "CUTOVER_BACKUP_POINTER_INVALID");
      const backupPointer = JSON.parse(await readFile(backupPointerPath, "utf8")) as { bundlePath?: string; bundleDigest?: string };
      if (!backupPointer.bundlePath || !backupPointer.bundleDigest || !authorizationFile) throw new DbCutoverError("CUTOVER_BACKUP_POINTER_MISSING");
      if (!path.isAbsolute(backupPointer.bundlePath) || backupPointer.bundlePath.includes("\0") || !/^sha256:[0-9a-f]{64}$/.test(backupPointer.bundleDigest)) throw new DbCutoverError("CUTOVER_BACKUP_POINTER_INVALID");
      const expectedBackupDigest = evidence.steps.find((item) => item.step === "C4")?.artifactDigests.backupDigest;
      if (!expectedBackupDigest || backupPointer.bundleDigest !== expectedBackupDigest) throw new DbCutoverError("CUTOVER_BACKUP_DIGEST_MISMATCH");
      await requireRegularDirectory(backupPointer.bundlePath, "CUTOVER_BACKUP_POINTER_INVALID");
      const previousPersistenceMode = process.env.AIROAMING_PERSISTENCE_MODE;
      const previousDatabaseUrl = process.env.DATABASE_URL;
      process.env.AIROAMING_PERSISTENCE_MODE = "db"; process.env.DATABASE_URL = plan.targetDatabaseUrl;
      const prisma = deps.createPrisma();
      try {
        await prisma.onModuleInit();
        const activate = deps.createActivate(prisma);
        const activateInput = { cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, sourceManifestDigest: evidence.manifest.sourceManifestDigest, effectiveManifestDigest: plan.effectiveSchemaManifestDigest, releaseRoot: plan.releaseRoot, backup: backupPointer.bundlePath, maintenanceBundle: plan.runtimeBundlePath, cutoverEvidenceRoot: plan.evidenceRoot, authorizationFile, strictEvidence: true, gate: "ACT-08" as const };
        const current = await prisma.database().persistenceState.findUnique({ where: { id: "primary" } });
        const resumableAfterCrash = current?.activationState === "db_only" && current.activatedAt !== null && current.firstBusinessWriteAt === null;
        if (!resumableAfterCrash) await activate.activate({ ...activateInput, mode: "dry-run" });
        const executed = await activate.activate({ ...activateInput, mode: "execute" });
        if (!executed.activatedAt || executed.firstBusinessWriteAt !== null) throw new DbCutoverError("CUTOVER_C7_ACTIVATION_STATE_INVALID");
        return { summaryCode: "CUTOVER_C7_OK", artifactDigests: artifacts({ activatedAtDigest: `sha256:${createHash("sha256").update(executed.activatedAt, "utf8").digest("hex")}` as `sha256:${string}` }), completion: { activatedAt: executed.activatedAt, firstBusinessWriteAt: null } };
      } finally {
        await prisma.onModuleDestroy();
        if (previousPersistenceMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previousPersistenceMode;
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
    throw new DbCutoverError("CUTOVER_ACTION_NOT_WIRED");
  };
}
