import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import * as path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { digestCanonicalJson } from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { normalizeMigrationDecisionArtifact } from "../migration/migration-decision.js";
import { FULL_SHADOW_SLICE_ORDER } from "../migration/full-shadow-importer.js";
import { normalizeComicFormatReport } from "../migration/migration-report.js";
import { RuntimeBundleFileService } from "../migration/runtime-bundle-file.service.js";
import { containsSecretSentinel } from "../migration/credential-redactor.js";
import type { SnapshotDigest } from "../migration/snapshot.types.js";
import type { BackupAssetEntry, BackupInput, BackupManifest, BackupResult, BackupRunSummary, BackupRunSummarySlice } from "./backup.types.js";
import { BackupPathError, assertDisjointRoots, emptyDirectory, existingDirectory, existingRegularFile, isWithin, parseSqliteFileUrl, resolveStorageFile } from "./backup-path.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};
type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;

export class BackupError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface FullShadowSliceArtifact {
  slice: string;
  runId: string;
  status: string;
  reportDigest: SnapshotDigest;
  counts: Record<string, unknown> | null;
  report: unknown;
}

interface FullShadowArtifact {
  schemaVersion: 1;
  kind: "airoaming_full_shadow_import_v1";
  status: "succeeded";
  slices: FullShadowSliceArtifact[];
  reportDigest: SnapshotDigest;
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const FULL_REPORT_KEYS = ["kind", "reportDigest", "schemaVersion", "slices", "status"];
const SLICE_KEYS = ["counts", "report", "reportDigest", "runId", "slice", "status"];

function fail(code: string): never {
  throw new BackupError(code);
}

function digestFile(bytes: Buffer): SnapshotDigest {
  return ("sha256:" + createHash("sha256").update(bytes).digest("hex")) as SnapshotDigest;
}

function isDigest(value: unknown): value is SnapshotDigest {
  return typeof value === "string" && DIGEST_RE.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return digestCanonicalJson(left) === digestCanonicalJson(right);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqliteContainsSecretSentinel(databasePath: string): boolean {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name?: unknown }>;
    for (const table of tables) {
      if (typeof table.name !== "string") continue;
      const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(table.name)})`).all() as Array<{ name?: unknown; type?: unknown }>;
      const names = columns.filter((column) => typeof column.name === "string" && /text|blob/i.test(String(column.type ?? ""))).map((column) => String(column.name));
      if (names.length === 0) continue;
      const rows = database.prepare(`SELECT ${names.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table.name)}`).all() as Array<Record<string, unknown>>;
      if (rows.some((row) => names.some((name) => containsSecretSentinel(row[name])))) return true;
    }
    return false;
  } finally {
    database.close();
  }
}

async function assertNoSecretSentinelsInStaging(staging: string, assets: readonly BackupAssetEntry[], includeManifest = true): Promise<"passed"> {
  const jsonFiles = includeManifest ? ["backup-manifest.json", "config/settings.redacted.json", "migration/run-summary.json"] : ["config/settings.redacted.json", "migration/run-summary.json"];
  for (const relative of jsonFiles) {
    if (containsSecretSentinel(await readFile(path.join(staging, relative)))) fail("BACKUP_SECRET_DETECTED");
  }
  const databasePath = path.join(staging, "database/app.db");
  if (containsSecretSentinel(await readFile(databasePath)) || sqliteContainsSecretSentinel(databasePath)) fail("BACKUP_SECRET_DETECTED");
  for (const asset of assets) {
    if (containsSecretSentinel(await readFile(path.join(staging, "assets", ...asset.storageKey.split("/"))))) fail("BACKUP_SECRET_DETECTED");
  }
  return "passed";
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  const temporary = filePath + ".tmp-" + process.pid + "-" + Date.now();
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  await rename(temporary, filePath);
}

async function copyAndDigest(source: string, target: string): Promise<{ bytes: number; sha256: SnapshotDigest }> {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await copyFile(source, target);
  await chmod(target, 0o600);
  const bytes = await readFile(target);
  const handle = await open(target, "r");
  try { await handle.sync(); } finally { await handle.close(); }
  return { bytes: bytes.byteLength, sha256: digestFile(bytes) };
}

function sqliteRows(database: DatabaseSync, sql: string): Record<string, unknown>[] {
  return database.prepare(sql).all() as unknown as Record<string, unknown>[];
}

function sqliteIntegrity(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    const integrity = sqliteRows(database, "PRAGMA integrity_check");
    const foreignKeys = sqliteRows(database, "PRAGMA foreign_key_check");
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok" || foreignKeys.length !== 0) fail("BACKUP_DATABASE_INVALID");
    const ledger = sqliteRows(database, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('migration_runs','persistence_states')");
    if (ledger.length !== 2) fail("BACKUP_DATABASE_INVALID");
  } catch (error) {
    if (error instanceof BackupError) throw error;
    fail("BACKUP_DATABASE_INVALID");
  } finally {
    database.close();
  }
}

async function copyDatabaseWhileLocked(source: string, target: string): Promise<{ bytes: number; sha256: SnapshotDigest }> {
  const result = await copyAndDigest(source, target);
  const sourceBytes = await readFile(source);
  if (sourceBytes.byteLength !== result.bytes || digestFile(sourceBytes) !== result.sha256) fail("BACKUP_NOT_OFFLINE");
  sqliteIntegrity(target);
  return result;
}

async function withDatabaseWriteFence<T>(source: string, operation: () => Promise<T>, onAcquired?: () => void | Promise<void>): Promise<T> {
  const database = new DatabaseSync(source);
  try {
    database.exec("PRAGMA busy_timeout = 1000");
    const checkpoint = database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy?: number; log?: number };
    if ((checkpoint.busy ?? 0) !== 0 || (checkpoint.log ?? 0) > 0) fail("BACKUP_NOT_OFFLINE");
    try { database.exec("BEGIN IMMEDIATE"); } catch { fail("BACKUP_NOT_OFFLINE"); }
    try {
      const walPath = source + "-wal";
      try {
        if ((await stat(walPath)).size !== 0) fail("BACKUP_NOT_OFFLINE");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await onAcquired?.();
      return await operation();
    } finally {
      try { database.exec("ROLLBACK"); } catch { /* preserve original result */ }
    }
  } catch (error) {
    if (error instanceof BackupError || error instanceof BackupPathError) throw error;
    throw new BackupError("BACKUP_NOT_OFFLINE");
  } finally {
    database.close();
  }
}

function normalizeFullShadowArtifact(raw: unknown): FullShadowArtifact {
  const value = record(raw, "BACKUP_RUN_INVALID");
  exactKeys(value, FULL_REPORT_KEYS, "BACKUP_RUN_INVALID");
  if (value.schemaVersion !== 1 || value.kind !== "airoaming_full_shadow_import_v1" || value.status !== "succeeded" || !Array.isArray(value.slices) || value.slices.length !== FULL_SHADOW_SLICE_ORDER.length || !isDigest(value.reportDigest)) fail("BACKUP_RUN_INVALID");
  const slices = value.slices.map((rawSlice): FullShadowSliceArtifact => {
    const slice = record(rawSlice, "BACKUP_RUN_INVALID");
    exactKeys(slice, SLICE_KEYS, "BACKUP_RUN_INVALID");
    if (typeof slice.slice !== "string" || typeof slice.runId !== "string" || slice.status !== "succeeded" || !isDigest(slice.reportDigest) || (slice.counts !== null && (typeof slice.counts !== "object" || Array.isArray(slice.counts)))) fail("BACKUP_RUN_INVALID");
    if (!slice.report || typeof slice.report !== "object" || Array.isArray(slice.report)) fail("BACKUP_RUN_INVALID");
    const report = normalizeComicFormatReport(slice.report);
    if (report.reportDigest !== slice.reportDigest) fail("BACKUP_RUN_INVALID");
    return { slice: slice.slice, runId: slice.runId, status: "succeeded", reportDigest: slice.reportDigest, counts: slice.counts as Record<string, unknown> | null, report };
  });
  for (let index = 0; index < FULL_SHADOW_SLICE_ORDER.length; index += 1) {
    if (slices[index].slice !== FULL_SHADOW_SLICE_ORDER[index]) fail("BACKUP_RUN_INVALID");
  }
  if (new Set(slices.map((slice) => slice.runId)).size !== slices.length) fail("BACKUP_RUN_INVALID");
  const digestInput = { schemaVersion: 1 as const, kind: "airoaming_full_shadow_import_v1" as const, status: "succeeded" as const, slices: slices.map(({ slice, status, reportDigest, counts }) => ({ slice, status, reportDigest, counts })) };
  if (digestCanonicalJson(digestInput) !== value.reportDigest) fail("BACKUP_RUN_INVALID");
  return { schemaVersion: 1, kind: "airoaming_full_shadow_import_v1", status: "succeeded", slices, reportDigest: value.reportDigest };
}

async function readJson(filePath: string, code: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    fail(code);
  }
}

function safeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export class AppBackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consistencyHooks: { readonly onFenceAcquired?: () => void | Promise<void> } = {},
  ) {}

  async backup(input: BackupInput): Promise<BackupResult> {
    if (input.kind !== "coordinated") fail("MIGRATION_CAPABILITY_BLOCKED");
    if (!/^[0-9a-f]{7,40}$/.test(input.appCommit)) fail("BACKUP_RELEASE_IDENTITY_INVALID");
    const workspaceRoot = await existingDirectory(input.workspaceRoot);
    const dataRoot = await existingDirectory(input.dataRoot);
    const releaseRoot = await existingDirectory(input.releaseRoot);
    const outputRoot = await emptyDirectory(input.output);
    const databasePath = await existingRegularFile(parseSqliteFileUrl(input.databaseUrl));
    if (!isWithin(dataRoot, databasePath)) fail("BACKUP_PATH_UNSAFE");
    const maintenanceBundle = await existingRegularFile(input.maintenanceBundle, "BACKUP_ARGS_INVALID");
    const fullImportReportPath = await existingRegularFile(input.fullImportReport, "BACKUP_ARGS_INVALID");
    const decisionsPath = await existingRegularFile(input.decisions, "BACKUP_ARGS_INVALID");
    assertDisjointRoots([workspaceRoot, dataRoot, releaseRoot, outputRoot]);
    const releaseIdentity = await loadReleaseSchemaIdentityV1(releaseRoot).catch(() => fail("BACKUP_RELEASE_IDENTITY_INVALID"));
    await new RuntimeBundleFileService().readAndVerify(maintenanceBundle).catch(() => fail("BACKUP_ARGS_INVALID"));
    const fullShadow = normalizeFullShadowArtifact(await readJson(fullImportReportPath, "BACKUP_RUN_INVALID"));

    const staging = path.join(outputRoot, ".backup-staging-" + process.pid + "-" + Date.now());
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      const snapshot = await withDatabaseWriteFence(databasePath, async () => {
        const db = this.prisma.database();
        const runs = await Promise.all(fullShadow.slices.map((slice) => db.migrationRun.findUnique({ where: { id: slice.runId } })));
        if (runs.some((run) => !run || run.kind !== "shadow" || run.status !== "succeeded" || !run.reportDigest || !run.snapshotManifestDigest || !run.decisionsDigest || !run.verificationJson)) fail("BACKUP_RUN_INVALID");
        const firstRun = runs[0]!;
        if (!isDigest(firstRun.sourceManifestDigest) || !isDigest(firstRun.snapshotManifestDigest!) || !isDigest(firstRun.decisionsDigest!)) fail("BACKUP_RUN_INVALID");
        const decisions = normalizeMigrationDecisionArtifact(await readJson(decisionsPath, "BACKUP_RUN_INVALID"), firstRun.sourceManifestDigest);
        const sourceManifestDigest = firstRun.sourceManifestDigest as SnapshotDigest;
        const snapshotManifestDigest = firstRun.snapshotManifestDigest as SnapshotDigest;
        for (let index = 0; index < runs.length; index += 1) {
          const run = runs[index]!;
          const slice = fullShadow.slices[index];
          if (run.sourceManifestDigest !== sourceManifestDigest || run.snapshotManifestDigest !== snapshotManifestDigest || run.decisionsDigest !== decisions.decisionsDigest || run.reportDigest !== slice.reportDigest || !jsonEqual(run.countsJson, slice.counts)) fail("BACKUP_RUN_INVALID");
          const verification = record(run.verificationJson, "BACKUP_RUN_INVALID");
          if (verification.sourceManifestVerified !== true || verification.snapshotManifestVerified !== true) fail("BACKUP_RUN_INVALID");
          const openIssues = await db.migrationIssue.count({ where: { runId: run.id, resolutionStatus: "open" } });
          if (openIssues !== 0) fail("BACKUP_RUN_INVALID");
        }
        const persistence = await db.persistenceState.findUnique({ where: { id: "primary" } });
        if (!persistence || persistence.activationState !== "shadow" || persistence.cutoverRunId !== null || persistence.firstBusinessWriteAt !== null) fail("BACKUP_RUN_INVALID");
        const persistenceState = { activationState: persistence.activationState, cutoverRunId: persistence.cutoverRunId, firstBusinessWriteAt: safeDate(persistence.firstBusinessWriteAt) };
        const assets = await db.asset.findMany({ orderBy: { storageKey: "asc" }, select: { id: true, storageKey: true, mimeType: true, status: true, sha256: true, bytes: true } });
        const readyAssets = assets.filter((asset) => asset.status === "ready");
        const missingAssets = assets.filter((asset) => asset.status !== "ready").map((asset) => ({ assetId: asset.id, storageKey: asset.storageKey, status: asset.status }));
        const database = await copyDatabaseWhileLocked(databasePath, path.join(staging, "database/app.db"));
        const copiedAssets: Array<{ assetId: string; storageKey: string; mimeType: string; bytes: number; sha256: SnapshotDigest }> = [];
        for (const asset of readyAssets) {
          if (!asset.sha256 || !isDigest(asset.sha256) || asset.bytes === null) fail("BACKUP_ASSET_MISMATCH");
          const source = await resolveStorageFile(workspaceRoot, asset.storageKey);
          const metadata = await stat(source);
          if (metadata.size !== asset.bytes) fail("BACKUP_ASSET_MISMATCH");
          const sourceBytes = await readFile(source);
          if (digestFile(sourceBytes) !== asset.sha256) fail("BACKUP_ASSET_MISMATCH");
          const copied = await copyAndDigest(source, path.join(staging, "assets", ...asset.storageKey.split("/")));
          if (copied.bytes !== asset.bytes || copied.sha256 !== asset.sha256) fail("BACKUP_ASSET_MISMATCH");
          const sourceAfter = await readFile(source);
          if (sourceAfter.byteLength !== asset.bytes || digestFile(sourceAfter) !== asset.sha256) fail("BACKUP_ASSET_MISMATCH");
          copiedAssets.push({ assetId: asset.id, storageKey: asset.storageKey, mimeType: asset.mimeType, bytes: copied.bytes, sha256: copied.sha256 });
        }
        const preference = await db.appPreference.findUnique({ where: { id: "primary" } });
        const providers = await db.providerConfig.findMany({ orderBy: { id: "asc" } });
        const credentials = await db.credentialMetadata.findMany({ orderBy: { id: "asc" } });
        const settingsRedacted = {
          schemaVersion: 1,
          kind: "airoaming_settings_redacted_v1",
          appPreference: preference ? { id: preference.id, theme: preference.theme, activeImageProviderId: preference.activeImageProviderId, defaultTextProviderId: preference.defaultTextProviderId, defaultTextModelId: preference.defaultTextModelId, rowVersion: preference.rowVersion, updatedAt: preference.updatedAt.toISOString() } : null,
          providers: providers.map((provider) => ({ id: provider.id, providerId: provider.providerId, runtimeKind: provider.runtimeKind, displayName: provider.displayName, modelId: provider.modelId, baseUrl: provider.baseUrl, enabled: provider.enabled, rowVersion: provider.rowVersion, createdAt: provider.createdAt.toISOString(), updatedAt: provider.updatedAt.toISOString() })),
          credentials: credentials.map((credential) => ({ id: credential.id, providerConfigId: credential.providerConfigId, owner: credential.owner, status: credential.status, fingerprint: credential.fingerprint, configured: credential.configured, rotatedAt: safeDate(credential.rotatedAt), createdAt: credential.createdAt.toISOString(), updatedAt: credential.updatedAt.toISOString() })),
        };
        if (containsSecretSentinel(fullShadow) || containsSecretSentinel(decisions) || containsSecretSentinel(settingsRedacted)) fail("BACKUP_SECRET_DETECTED");
        const runSummaryBase = {
          schemaVersion: 1 as const,
          kind: "airoaming_migration_run_summary_v1" as const,
          sourceManifestDigest,
          snapshotManifestDigest,
          decisionsDigest: decisions.decisionsDigest,
          fullImportReportDigest: fullShadow.reportDigest,
          slices: fullShadow.slices.map((slice, index): BackupRunSummarySlice => ({ slice: slice.slice, runId: slice.runId, importerVersion: runs[index]!.importerVersion, status: "succeeded", reportDigest: slice.reportDigest, counts: slice.counts })),
        };
        const runSummary: BackupRunSummary = { ...runSummaryBase, runSummaryDigest: digestCanonicalJson(runSummaryBase) };
        const manifestBase = {
          schemaVersion: 1 as const,
          kind: "airoaming_backup_bundle_v1" as const,
          backupKind: "coordinated" as const,
          appCommit: input.appCommit,
          createdAt: new Date().toISOString(),
          migration: { runIds: fullShadow.slices.map((slice) => slice.runId), runKind: "shadow" as const, sliceCount: 16 as const, sourceManifestDigest, snapshotManifestDigest, decisionsDigest: decisions.decisionsDigest, fullImportReportDigest: fullShadow.reportDigest, runSummaryDigest: runSummary.runSummaryDigest, effectiveSchemaManifestDigest: releaseIdentity.effectiveSchemaManifestDigest },
          persistenceState,
          database: { storageKey: "database/app.db" as const, ...database },
          assets: copiedAssets.sort((left, right) => left.storageKey.localeCompare(right.storageKey)),
          missingAssets,
        };
        return { database, copiedAssets, runSummary, manifestBase, settingsRedacted };
      }, this.consistencyHooks.onFenceAcquired);
      const { database, copiedAssets, runSummary, manifestBase, settingsRedacted } = snapshot;
      await mkdir(path.join(staging, "config"), { recursive: true, mode: 0o700 });
      await mkdir(path.join(staging, "migration"), { recursive: true, mode: 0o700 });
      await writePrivateJson(path.join(staging, "config/settings.redacted.json"), settingsRedacted);
      await writePrivateJson(path.join(staging, "migration/run-summary.json"), runSummary);
      const sentinelScan = await assertNoSecretSentinelsInStaging(staging, copiedAssets, false);
      const manifestWithSecretScan = { ...manifestBase, secretHandling: { included: false as const, sentinelScan } };
      const bundleDigest = digestCanonicalJson(manifestWithSecretScan);
      const manifest: BackupManifest = { ...manifestWithSecretScan, bundleDigest };
      const manifestDigest = digestCanonicalJson(manifest);
      await writePrivateJson(path.join(staging, "backup-manifest.json"), manifest);
      await assertNoSecretSentinelsInStaging(staging, copiedAssets);
      await writePrivateJson(path.join(staging, "SEALED"), { schemaVersion: 1, kind: "airoaming_backup_sealed_v1", manifestDigest, bundleDigest, databaseDigest: database.sha256, assetInventoryDigest: digestCanonicalJson(copiedAssets), configDigest: digestCanonicalJson(settingsRedacted), runSummaryDigest: runSummary.runSummaryDigest });
      await chmod(staging, 0o700);
      const finalPath = path.join(outputRoot, "backup-" + bundleDigest);
      await rename(staging, finalPath);
      return { bundlePath: finalPath, bundleDigest, manifestDigest, database: { storageKey: "database/app.db", ...database }, assetCount: copiedAssets.length, runCount: 16 };
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (error instanceof BackupError) throw error;
      if (error instanceof BackupPathError) throw new BackupError(error.code);
      throw error;
    }
  }
}
