import { lstat, readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { containsSecretSentinel } from "./credential-redactor.js";
import { getBlockedDbCapabilities } from "./db-capability-registry.js";
import { FINAL_IMPORTER_VERSION, normalizeFinalImportReport } from "./final-import-report.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";

export class ReadyCoordinatorError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface ReadyCoordinatorInput {
  runId: string;
  releaseRoot: string;
  workspaceRoot: string;
  secretStoreRoot: string;
  maintenanceBundle: string;
}

export interface ReadyCoordinatorResult {
  activationState: "ready_for_activation";
  runId: string;
  sourceManifestDigest: string;
  effectiveSchemaManifestDigest: string;
  secretScanCount: number;
  blockedCapabilityIds: string[];
}

function absolute(value: string, code: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new ReadyCoordinatorError(code);
  return path.resolve(value);
}

async function scanDirectory(root: string): Promise<number> {
  const stat = await lstat(root).catch(() => null);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new ReadyCoordinatorError("MIGRATION_READY_ROOT_INVALID");
  let count = 0;
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && containsSecretSentinel(await readFile(child))) count += 1;
    }
  };
  await walk(root);
  return count;
}

async function scanDatabase(prisma: PrismaService): Promise<number> {
  const tables = await prisma.database().$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  let count = 0;
  for (const { name } of tables) {
    const rows = await prisma.database().$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM \"${name.replace(/\"/g, "\"\"")}\"`);
    for (const row of rows) if (containsSecretSentinel(row)) count += 1;
  }
  return count;
}

export class ReadyCoordinator {
  constructor(private readonly prisma: PrismaService) {}

  async markReady(input: ReadyCoordinatorInput): Promise<ReadyCoordinatorResult> {
    if (!input.runId.trim()) throw new ReadyCoordinatorError("MIGRATION_READY_PRECONDITION_FAILED");
    const releaseRoot = absolute(input.releaseRoot, "MIGRATION_RELEASE_ROOT_INVALID");
    const workspaceRoot = absolute(input.workspaceRoot, "MIGRATION_WORKSPACE_ROOT_INVALID");
    const secretStoreRoot = absolute(input.secretStoreRoot, "MIGRATION_SECRET_STORE_ROOT_INVALID");
    const maintenanceBundle = absolute(input.maintenanceBundle, "MIGRATION_MAINTENANCE_BUNDLE_INVALID");
    try {
      await new RuntimeBundleFileService().readAndVerify(maintenanceBundle);
    } catch {
      throw new ReadyCoordinatorError("MIGRATION_MAINTENANCE_BUNDLE_INVALID");
    }
    if (process.env.AIROAMING_SECRET_STORE_ADAPTER !== "fake" || path.resolve(process.env.AIROAMING_FAKE_SECRET_STORE_ROOT ?? "") !== secretStoreRoot) throw new ReadyCoordinatorError("MIGRATION_SECRET_STORE_BINDING_INVALID");
    const release = await loadReleaseSchemaIdentityV1(releaseRoot).catch(() => { throw new ReadyCoordinatorError("MIGRATION_RELEASE_IDENTITY_INVALID"); });
    const run = await this.prisma.database().migrationRun.findUnique({ where: { id: input.runId } });
    if (!run || run.kind !== "final" || run.status !== "succeeded" || run.importerVersion !== FINAL_IMPORTER_VERSION) throw new ReadyCoordinatorError("MIGRATION_FINAL_RUN_NOT_READY");
    if (!run.reportDigest || !run.snapshotManifestDigest || !run.decisionsDigest) throw new ReadyCoordinatorError("MIGRATION_FINAL_REPORT_NOT_READY");
    const storedCounts = run.countsJson && typeof run.countsJson === "object" && !Array.isArray(run.countsJson) ? run.countsJson as Record<string, unknown> : null;
    let finalReport;
    try { finalReport = normalizeFinalImportReport(storedCounts?.aggregateReport); }
    catch { throw new ReadyCoordinatorError("MIGRATION_FINAL_REPORT_NOT_READY"); }
    if (finalReport.reportDigest !== run.reportDigest || finalReport.sourceManifestDigest !== run.sourceManifestDigest || finalReport.snapshotManifestDigest !== run.snapshotManifestDigest || finalReport.decisionsDigest !== run.decisionsDigest || finalReport.effectiveSchemaManifestDigest !== release.effectiveSchemaManifestDigest || finalReport.slices.length !== 16 || finalReport.slices.some((slice) => slice.status !== "succeeded" || !slice.evidence.passed)) throw new ReadyCoordinatorError("MIGRATION_FINAL_REPORT_NOT_READY");
    const verification = run.verificationJson && typeof run.verificationJson === "object" && !Array.isArray(run.verificationJson) ? run.verificationJson as Record<string, unknown> : null;
    if (!verification || verification.effectiveSchemaManifestDigest !== release.effectiveSchemaManifestDigest || verification.sourceManifestDigest !== run.sourceManifestDigest || verification.snapshotManifestDigest !== run.snapshotManifestDigest || verification.decisionsDigest !== run.decisionsDigest || verification.integrityCheck !== "ok" || verification.foreignKeyViolationCount !== 0 || verification.failedLedgerCount !== 0 || verification.migrationChecksumStatus !== "verified" || verification.openBlockerCount !== 0 || verification.secretScanCount !== 0) throw new ReadyCoordinatorError("MIGRATION_FINAL_VERIFICATION_NOT_READY");
    const slices = Array.isArray(verification.slices) ? verification.slices : [];
    if (slices.length !== 16 || slices.some((slice, index) => !slice || typeof slice !== "object" || (slice as Record<string, unknown>).slice !== finalReport.slices[index]?.slice || (slice as Record<string, unknown>).runId !== finalReport.slices[index]?.runId || (slice as Record<string, unknown>).status !== "succeeded" || (slice as Record<string, unknown>).passed !== true)) throw new ReadyCoordinatorError("MIGRATION_FINAL_SLICES_NOT_READY");
    const blockedCapabilityIds = getBlockedDbCapabilities().map((entry) => entry.id);
    if (blockedCapabilityIds.length > 0) throw new ReadyCoordinatorError("MIGRATION_CAPABILITY_BLOCKED");
    const secretScanCount = await scanDatabase(this.prisma) + await scanDirectory(workspaceRoot) + await scanDirectory(secretStoreRoot);
    if (secretScanCount !== 0) throw new ReadyCoordinatorError("MIGRATION_SECRET_SENTINEL_DETECTED");
    const state = await this.prisma.database().persistenceState.findUnique({ where: { id: "primary" } });
    if (!state || !["shadow", "recovery_required"].includes(state.activationState) || state.activatedAt !== null || state.firstBusinessWriteAt !== null) throw new ReadyCoordinatorError("MIGRATION_PERSISTENCE_STATE_NOT_READY");
    if (state.activationState === "recovery_required" && state.cutoverRunId !== null && state.sourceManifestDigest !== run.sourceManifestDigest) throw new ReadyCoordinatorError("MIGRATION_PERSISTENCE_IDENTITY_CONFLICT");
    const now = new Date();
    await this.prisma.database().$transaction(async (tx) => {
      const current = await tx.persistenceState.findUnique({ where: { id: "primary" } });
      if (!current || !["shadow", "recovery_required"].includes(current.activationState) || current.activatedAt !== null || current.firstBusinessWriteAt !== null) throw new ReadyCoordinatorError("MIGRATION_PERSISTENCE_STATE_CONFLICT");
      await tx.persistenceState.update({ where: { id: "primary" }, data: { activationState: "ready_for_activation", cutoverRunId: run.id, sourceManifestDigest: run.sourceManifestDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, lastVerifiedAt: now, updatedAt: now } });
    });
    return { activationState: "ready_for_activation", runId: run.id, sourceManifestDigest: run.sourceManifestDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, secretScanCount, blockedCapabilityIds };
  }
}
