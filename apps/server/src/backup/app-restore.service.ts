import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import * as path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { digestCanonicalJson } from "@airoaming/shared";
import { FULL_SHADOW_SLICE_ORDER } from "../migration/full-shadow-importer.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import type { BackupAssetEntry, BackupManifest, BackupRunSummary } from "./backup.types.js";
import { assertDisjointRoots, existingDirectory, existingRegularFile, isWithin, requireAbsolutePath, resolveStorageFile } from "./backup-path.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { readonly DatabaseSync: typeof NodeDatabaseSync };
type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;

export type RestoreMode = "verify-only" | "materialize";

export interface RestoreInput {
  backup: string;
  releaseRoot: string;
  targetDataRoot: string;
  targetWorkspaceRoot: string;
  mode: RestoreMode;
}

export interface RestoreResult {
  mode: RestoreMode;
  bundleDigest: `sha256:${string}`;
  manifestDigest: `sha256:${string}`;
  assetCount: number;
  database: { bytes: number; sha256: `sha256:${string}` };
  targetDataRoot: string | null;
  targetWorkspaceRoot: string | null;
}

export class RestoreError extends Error {
  constructor(readonly code: string) { super(code); }
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const MANIFEST_KEYS = ["appCommit", "assets", "backupKind", "bundleDigest", "createdAt", "database", "kind", "migration", "missingAssets", "persistenceState", "schemaVersion", "secretHandling"];
const MIGRATION_KEYS = ["decisionsDigest", "effectiveSchemaManifestDigest", "fullImportReportDigest", "runIds", "runKind", "runSummaryDigest", "sliceCount", "snapshotManifestDigest", "sourceManifestDigest"];
const SEALED_KEYS = ["assetInventoryDigest", "bundleDigest", "configDigest", "databaseDigest", "kind", "manifestDigest", "runSummaryDigest", "schemaVersion"];
const RUN_SUMMARY_KEYS = ["decisionsDigest", "fullImportReportDigest", "kind", "runSummaryDigest", "schemaVersion", "slices", "snapshotManifestDigest", "sourceManifestDigest"];
const RUN_SUMMARY_SLICE_KEYS = ["counts", "importerVersion", "reportDigest", "runId", "slice", "status"];
const MARKER_NAME = "restore.marker";

function fail(code: string): never { throw new RestoreError(code); }

function isDigest(value: unknown): value is `sha256:${string}` { return typeof value === "string" && DIGEST_RE.test(value); }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("RESTORE_VERIFICATION_FAILED");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((item, index) => item !== keys[index])) fail("RESTORE_VERIFICATION_FAILED");
}

function digestFile(bytes: Buffer): `sha256:${string}` { return (`sha256:${createHash("sha256").update(bytes).digest("hex")}`) as `sha256:${string}`; }

function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return /api[_-]?key|authorization|bearer\s|cookie|password|secret|sk-[a-z0-9]/i.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value && typeof value === "object") return Object.values(value).some(containsSecret);
  return false;
}

async function readJson(filePath: string): Promise<unknown> {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { fail("RESTORE_VERIFICATION_FAILED"); }
}

async function readRegularJson(filePath: string): Promise<unknown> {
  await existingRegularFile(filePath, "RESTORE_VERIFICATION_FAILED");
  return readJson(filePath);
}

function parseSqliteJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { fail("RESTORE_VERIFICATION_FAILED"); }
}

function verifyDatabase(databasePath: string, manifest: BackupManifest, runSummary: BackupRunSummary): void {
  let database: DatabaseSync;
  try { database = new DatabaseSync(databasePath, { readOnly: true }); } catch { fail("RESTORE_VERIFICATION_FAILED"); }
  try {
    const integrity = database.prepare("PRAGMA integrity_check").all() as Array<Record<string, unknown>>;
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok" || foreignKeys.length !== 0) fail("RESTORE_VERIFICATION_FAILED");
    const runStatement = database.prepare("SELECT id, kind, status, importer_version, source_manifest_digest, snapshot_manifest_digest, decisions_digest, report_digest, counts_json, counts_schema_version, verification_json, verification_schema_version FROM migration_runs WHERE id = ?");
    const issueStatement = database.prepare("SELECT COUNT(*) AS count FROM migration_issues WHERE run_id = ? AND resolution_status = 'open'");
    for (let index = 0; index < runSummary.slices.length; index += 1) {
      const expected = runSummary.slices[index];
      const row = runStatement.get(expected.runId) as Record<string, unknown> | undefined;
      if (!row || row.id !== expected.runId || row.kind !== "shadow" || row.status !== "succeeded" || row.importer_version !== expected.importerVersion || row.source_manifest_digest !== manifest.migration.sourceManifestDigest || row.snapshot_manifest_digest !== manifest.migration.snapshotManifestDigest || row.decisions_digest !== manifest.migration.decisionsDigest || row.report_digest !== expected.reportDigest || row.counts_schema_version !== 1 || row.verification_schema_version !== 1) fail("RESTORE_VERIFICATION_FAILED");
      if (digestCanonicalJson(parseSqliteJson(row.counts_json)) !== digestCanonicalJson(expected.counts)) fail("RESTORE_VERIFICATION_FAILED");
      const verification = record(parseSqliteJson(row.verification_json));
      if (verification.schemaVersion !== 1 || verification.sourceManifestVerified !== true || verification.snapshotManifestVerified !== true) fail("RESTORE_VERIFICATION_FAILED");
      const issueRow = issueStatement.get(expected.runId) as { count?: number } | undefined;
      if ((issueRow?.count ?? -1) !== 0) fail("RESTORE_VERIFICATION_FAILED");
    }
    const persistenceRows = database.prepare("SELECT id, activation_state, cutover_run_id, first_business_write_at FROM persistence_states WHERE id = 'primary'").all() as Array<Record<string, unknown>>;
    if (persistenceRows.length !== 1) fail("RESTORE_VERIFICATION_FAILED");
    const persistence = persistenceRows[0];
    if (persistence.activation_state !== "shadow" || persistence.activation_state !== manifest.persistenceState.activationState || persistence.cutover_run_id !== manifest.persistenceState.cutoverRunId || persistence.first_business_write_at !== manifest.persistenceState.firstBusinessWriteAt || persistence.cutover_run_id !== null || persistence.first_business_write_at !== null) fail("RESTORE_VERIFICATION_FAILED");
  } catch (error) {
    if (error instanceof RestoreError) throw error;
    fail("RESTORE_VERIFICATION_FAILED");
  } finally {
    database.close();
  }
}

function verifyRunSummary(value: unknown, expected: BackupManifest["migration"]): BackupRunSummary {
  const summary = record(value);
  exactKeys(summary, RUN_SUMMARY_KEYS);
  if (summary.schemaVersion !== 1 || summary.kind !== "airoaming_migration_run_summary_v1" || !Array.isArray(summary.slices)) fail("RESTORE_VERIFICATION_FAILED");
  if (!isDigest(summary.sourceManifestDigest) || summary.sourceManifestDigest !== expected.sourceManifestDigest || !isDigest(summary.snapshotManifestDigest) || summary.snapshotManifestDigest !== expected.snapshotManifestDigest || !isDigest(summary.decisionsDigest) || summary.decisionsDigest !== expected.decisionsDigest || !isDigest(summary.fullImportReportDigest) || summary.fullImportReportDigest !== expected.fullImportReportDigest || !isDigest(summary.runSummaryDigest) || summary.runSummaryDigest !== expected.runSummaryDigest) fail("RESTORE_VERIFICATION_FAILED");
  if (summary.slices.length !== 16) fail("RESTORE_VERIFICATION_FAILED");
  const base = { schemaVersion: 1 as const, kind: "airoaming_migration_run_summary_v1" as const, sourceManifestDigest: summary.sourceManifestDigest, snapshotManifestDigest: summary.snapshotManifestDigest, decisionsDigest: summary.decisionsDigest, fullImportReportDigest: summary.fullImportReportDigest, slices: summary.slices };
  if (digestCanonicalJson(base) !== summary.runSummaryDigest) fail("RESTORE_VERIFICATION_FAILED");
  const slices = summary.slices.map((item, index) => {
    const slice = record(item);
    exactKeys(slice, RUN_SUMMARY_SLICE_KEYS);
    if (slice.slice !== FULL_SHADOW_SLICE_ORDER[index] || slice.runId !== expected.runIds[index] || typeof slice.runId !== "string" || !slice.runId || typeof slice.importerVersion !== "string" || !slice.importerVersion || slice.status !== "succeeded" || !isDigest(slice.reportDigest) || (slice.counts !== null && (!slice.counts || typeof slice.counts !== "object" || Array.isArray(slice.counts)))) fail("RESTORE_VERIFICATION_FAILED");
    return slice as unknown as BackupRunSummary["slices"][number];
  });
  const runIds = slices.map((item) => item.runId);
  if (runIds.length !== new Set(runIds).size || runIds.length !== FULL_SHADOW_SLICE_ORDER.length) fail("RESTORE_VERIFICATION_FAILED");
  return { schemaVersion: 1, kind: "airoaming_migration_run_summary_v1", sourceManifestDigest: summary.sourceManifestDigest as BackupRunSummary["sourceManifestDigest"], snapshotManifestDigest: summary.snapshotManifestDigest as BackupRunSummary["snapshotManifestDigest"], decisionsDigest: summary.decisionsDigest as BackupRunSummary["decisionsDigest"], fullImportReportDigest: summary.fullImportReportDigest as BackupRunSummary["fullImportReportDigest"], slices, runSummaryDigest: summary.runSummaryDigest as BackupRunSummary["runSummaryDigest"] };
}

function verifyManifest(value: unknown): { manifest: BackupManifest; manifestDigest: `sha256:${string}` } {
  const raw = record(value);
  exactKeys(raw, MANIFEST_KEYS);
  if (raw.schemaVersion !== 1 || raw.kind !== "airoaming_backup_bundle_v1" || raw.backupKind !== "coordinated" || typeof raw.appCommit !== "string" || !raw.appCommit || typeof raw.createdAt !== "string") fail("RESTORE_VERIFICATION_FAILED");
  if (!isDigest(raw.bundleDigest)) fail("RESTORE_VERIFICATION_FAILED");
  const migration = record(raw.migration);
  exactKeys(migration, MIGRATION_KEYS);
  if (migration.runKind !== "shadow" || migration.sliceCount !== 16 || !Array.isArray(migration.runIds) || migration.runIds.length !== 16 || !isDigest(migration.sourceManifestDigest) || !isDigest(migration.snapshotManifestDigest) || !isDigest(migration.decisionsDigest) || !isDigest(migration.fullImportReportDigest) || !isDigest(migration.runSummaryDigest) || !isDigest(migration.effectiveSchemaManifestDigest)) fail("RESTORE_VERIFICATION_FAILED");
  const database = record(raw.database);
  if (database.storageKey !== "database/app.db" || !isDigest(database.sha256) || !Number.isInteger(database.bytes) || (database.bytes as number) <= 0) fail("RESTORE_VERIFICATION_FAILED");
  const secretHandling = record(raw.secretHandling);
  if (!Array.isArray(raw.assets) || !Array.isArray(raw.missingAssets) || !record(raw.persistenceState) || secretHandling.included !== false || secretHandling.sentinelScan !== "passed") fail("RESTORE_VERIFICATION_FAILED");
  const { bundleDigest, ...unsigned } = raw;
  if (digestCanonicalJson(unsigned) !== bundleDigest) fail("RESTORE_VERIFICATION_FAILED");
  return { manifest: raw as unknown as BackupManifest, manifestDigest: digestCanonicalJson(raw) };
}

async function verifyAssets(bundlePath: string, manifest: BackupManifest): Promise<void> {
  const previous: string[] = [];
  for (const item of manifest.assets as BackupAssetEntry[]) {
    if (!item || typeof item.storageKey !== "string" || !isDigest(item.sha256) || !Number.isInteger(item.bytes) || item.bytes <= 0 || previous.includes(item.storageKey) || (previous.length > 0 && previous[previous.length - 1].localeCompare(item.storageKey) >= 0)) fail("RESTORE_VERIFICATION_FAILED");
    previous.push(item.storageKey);
    const assetPath = await resolveStorageFile(path.join(bundlePath, "assets"), item.storageKey.replace(/^projects\//, "projects/"));
    const bytes = await readFile(assetPath);
    if (bytes.byteLength !== item.bytes || digestFile(bytes) !== item.sha256) fail("RESTORE_VERIFICATION_FAILED");
  }
}

async function writeMarker(directory: string, marker: string): Promise<void> {
  const markerPath = path.join(directory, MARKER_NAME);
  const handle = await open(markerPath, "wx", 0o600);
  try { await handle.writeFile(marker, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await chmod(markerPath, 0o600);
}

async function markerMatches(directory: string, marker: string): Promise<boolean> {
  try { return (await readFile(path.join(directory, MARKER_NAME), "utf8")) === marker; } catch { return false; }
}

export class AppRestoreService {
  async restore(input: RestoreInput): Promise<RestoreResult> {
    const backupPath = requireAbsolutePath(input.backup, "RESTORE_ARGS_INVALID");
    const releaseRoot = (() => {
      try { return requireAbsolutePath(input.releaseRoot, "RESTORE_ARGS_INVALID"); } catch { fail("RESTORE_ARGS_INVALID"); }
    })();
    const dataPath = requireAbsolutePath(input.targetDataRoot, "RESTORE_ARGS_INVALID");
    const workspacePath = requireAbsolutePath(input.targetWorkspaceRoot, "RESTORE_ARGS_INVALID");
    if (input.mode !== "verify-only" && input.mode !== "materialize") fail("RESTORE_ARGS_INVALID");
    let releaseIdentity;
    try {
      releaseIdentity = await loadReleaseSchemaIdentityV1(releaseRoot);
    } catch {
      fail("RESTORE_RELEASE_IDENTITY_MISMATCH");
    }
    const backupRoot = await existingDirectory(backupPath);
    assertDisjointRoots([backupRoot, dataPath, workspacePath]);
    const dataParent = await existingDirectory(path.dirname(dataPath));
    const workspaceParent = await existingDirectory(path.dirname(workspacePath));
    for (const target of [dataPath, workspacePath]) {
      try { await lstat(target); fail("RESTORE_TARGET_NOT_EMPTY"); } catch (error) { if (error instanceof RestoreError) throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") fail("RESTORE_TARGET_NOT_EMPTY"); }
    }
    const manifestValue = await readRegularJson(path.join(backupRoot, "backup-manifest.json"));
    const { manifest, manifestDigest } = verifyManifest(manifestValue);
    if (path.basename(backupRoot) !== "backup-" + manifest.bundleDigest) fail("BACKUP_NOT_SEALED");
    if (manifest.migration.effectiveSchemaManifestDigest !== releaseIdentity.effectiveSchemaManifestDigest) fail("RESTORE_RELEASE_IDENTITY_MISMATCH");
    const sealedValue = record(await readRegularJson(path.join(backupRoot, "SEALED")));
    exactKeys(sealedValue, SEALED_KEYS);
    const settings = await readRegularJson(path.join(backupRoot, "config/settings.redacted.json"));
    if (sealedValue.schemaVersion !== 1 || sealedValue.kind !== "airoaming_backup_sealed_v1" || sealedValue.manifestDigest !== manifestDigest || sealedValue.bundleDigest !== manifest.bundleDigest || sealedValue.databaseDigest !== manifest.database.sha256 || sealedValue.assetInventoryDigest !== digestCanonicalJson(manifest.assets) || sealedValue.configDigest !== digestCanonicalJson(settings) || sealedValue.runSummaryDigest !== manifest.migration.runSummaryDigest) fail("BACKUP_NOT_SEALED");
    if (containsSecret(manifest) || containsSecret(settings)) fail("BACKUP_SECRET_DETECTED");
    const runSummary = await readRegularJson(path.join(backupRoot, "migration/run-summary.json"));
    const verifiedRunSummary = verifyRunSummary(runSummary, manifest.migration);
    const databasePath = await existingRegularFile(path.join(backupRoot, "database/app.db"), "RESTORE_VERIFICATION_FAILED");
    const databaseBytes = await readFile(databasePath);
    if (databaseBytes.byteLength !== manifest.database.bytes || digestFile(databaseBytes) !== manifest.database.sha256) fail("RESTORE_VERIFICATION_FAILED");
    verifyDatabase(databasePath, manifest, verifiedRunSummary);
    await verifyAssets(backupRoot, manifest);
    if (input.mode === "verify-only") return { mode: input.mode, bundleDigest: manifest.bundleDigest, manifestDigest, assetCount: manifest.assets.length, database: { bytes: databaseBytes.byteLength, sha256: manifest.database.sha256 }, targetDataRoot: null, targetWorkspaceRoot: null };
    const marker = JSON.stringify({ schemaVersion: 1, kind: "airoaming_restore_marker_v1", bundleDigest: manifest.bundleDigest, pid: process.pid }) + "\n";
    const dataStaging = path.join(dataParent, `.restore-staging-${process.pid}-${Date.now()}-data`);
    const workspaceStaging = path.join(workspaceParent, `.restore-staging-${process.pid}-${Date.now()}-workspace`);
    let dataPublished = false;
    let workspacePublished = false;
    try {
      await mkdir(path.join(dataStaging, "db"), { recursive: true, mode: 0o700 });
      await mkdir(workspaceStaging, { recursive: true, mode: 0o700 });
      await writeMarker(dataStaging, marker);
      await writeMarker(workspaceStaging, marker);
      await copyFile(databasePath, path.join(dataStaging, "db/airoaming.sqlite"));
      await chmod(path.join(dataStaging, "db/airoaming.sqlite"), 0o600);
      for (const item of manifest.assets as BackupAssetEntry[]) {
        const source = path.join(backupRoot, "assets", item.storageKey);
        const target = path.join(workspaceStaging, ...item.storageKey.split("/"));
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await copyFile(source, target);
        await chmod(target, 0o600);
      }
      await rename(dataStaging, dataPath);
      dataPublished = true;
      await rename(workspaceStaging, workspacePath);
      workspacePublished = true;
    } catch (error) {
      if (dataPublished && !workspacePublished && await markerMatches(dataPath, marker)) await rm(dataPath, { recursive: true, force: true });
      if (!dataPublished && await markerMatches(dataStaging, marker)) await rm(dataStaging, { recursive: true, force: true });
      if (!workspacePublished && await markerMatches(workspaceStaging, marker)) await rm(workspaceStaging, { recursive: true, force: true });
      if (error instanceof RestoreError) throw error;
      fail("RESTORE_VERIFICATION_FAILED");
    }
    return { mode: input.mode, bundleDigest: manifest.bundleDigest, manifestDigest, assetCount: manifest.assets.length, database: { bytes: databaseBytes.byteLength, sha256: manifest.database.sha256 }, targetDataRoot: dataPath, targetWorkspaceRoot: workspacePath };
  }
}
