import type { SnapshotDigest } from "../migration/snapshot.types.js";

interface BackupInputBase {
  databaseUrl: string;
  workspaceRoot: string;
  dataRoot: string;
  releaseRoot: string;
  appCommit: string;
  maintenanceBundle: string;
  decisions: string;
  output: string;
  runtimeProfile?: "snapshot" | "cutover";
}

export interface CoordinatedBackupInput extends BackupInputBase {
  kind: "coordinated";
  fullImportReport: string;
}

export interface PreCutoverBackupInput extends BackupInputBase {
  kind: "pre-cutover";
  runId: string;
}

export interface DbOnlyCoordinatedBackupInput extends BackupInputBase {
  kind: "db-only-coordinated";
  runId: string;
}

export type BackupInput =
  | CoordinatedBackupInput
  | PreCutoverBackupInput
  | DbOnlyCoordinatedBackupInput;

export interface BackupAssetEntry {
  assetId: string;
  storageKey: string;
  mimeType: string;
  bytes: number;
  sha256: SnapshotDigest;
}

export interface BackupRunSummarySlice {
  slice: string;
  runId: string;
  importerVersion: string;
  status: "succeeded";
  reportDigest: SnapshotDigest;
  counts: Record<string, unknown> | null;
}

export interface BackupRunSummary {
  schemaVersion: 1;
  kind: "airoaming_migration_run_summary_v1";
  sourceManifestDigest: SnapshotDigest;
  snapshotManifestDigest: SnapshotDigest;
  decisionsDigest: SnapshotDigest;
  fullImportReportDigest: SnapshotDigest;
  slices: BackupRunSummarySlice[];
  runSummaryDigest: SnapshotDigest;
}

interface BackupMigrationBase {
  sourceManifestDigest: SnapshotDigest;
  snapshotManifestDigest: SnapshotDigest;
  decisionsDigest: SnapshotDigest;
  fullImportReportDigest: SnapshotDigest;
  runSummaryDigest: SnapshotDigest;
  effectiveSchemaManifestDigest: SnapshotDigest;
}

export interface CoordinatedBackupManifest {
  schemaVersion: 1;
  kind: "airoaming_backup_bundle_v1";
  backupKind: "coordinated";
  appCommit: string;
  createdAt: string;
  maintenanceBundleDigest: SnapshotDigest;
  migration: BackupMigrationBase & {
    runIds: string[];
    runKind: "shadow";
    sliceCount: 16;
  };
  persistenceState: {
    activationState: "shadow";
    cutoverRunId: null;
    activatedAt: null;
    firstBusinessWriteAt: string | null;
  };
  database: { storageKey: "database/app.db"; bytes: number; sha256: SnapshotDigest };
  assets: BackupAssetEntry[];
  missingAssets: Array<{ assetId: string; storageKey: string; status: string }>;
  secretHandling: { included: false; sentinelScan: "passed" };
  bundleDigest: SnapshotDigest;
}

export interface PreCutoverBackupManifest {
  schemaVersion: 1;
  kind: "airoaming_backup_bundle_v1";
  backupKind: "pre-cutover";
  appCommit: string;
  createdAt: string;
  maintenanceBundleDigest: SnapshotDigest;
  migration: BackupMigrationBase & {
    runIds: [string];
    finalRunId: string;
    runKind: "final";
    sliceCount: 16;
  };
  persistenceState: {
    activationState: "ready_for_activation";
    cutoverRunId: string;
    activatedAt: null;
    firstBusinessWriteAt: null;
  };
  database: { storageKey: "database/app.db"; bytes: number; sha256: SnapshotDigest };
  assets: BackupAssetEntry[];
  missingAssets: Array<{ assetId: string; storageKey: string; status: string }>;
  secretHandling: { included: false; sentinelScan: "passed" };
  bundleDigest: SnapshotDigest;
}

export interface DbOnlyCoordinatedBackupManifest {
  schemaVersion: 1;
  kind: "airoaming_backup_bundle_v1";
  backupKind: "db-only-coordinated";
  appCommit: string;
  createdAt: string;
  maintenanceBundleDigest: SnapshotDigest;
  migration: BackupMigrationBase & {
    runIds: [string];
    finalRunId: string;
    runKind: "final";
    sliceCount: 16;
  };
  persistenceState: {
    activationState: "db_only";
    cutoverRunId: string;
    sourceManifestDigest: SnapshotDigest;
    effectiveSchemaManifestDigest: SnapshotDigest;
    activatedAt: string;
    firstBusinessWriteAt: string | null;
  };
  database: { storageKey: "database/app.db"; bytes: number; sha256: SnapshotDigest };
  assets: BackupAssetEntry[];
  missingAssets: Array<{ assetId: string; storageKey: string; status: string }>;
  secretHandling: { included: false; sentinelScan: "passed" };
  bundleDigest: SnapshotDigest;
}

export type BackupManifest =
  | CoordinatedBackupManifest
  | PreCutoverBackupManifest
  | DbOnlyCoordinatedBackupManifest;

export interface BackupResult {
  bundlePath: string;
  bundleDigest: SnapshotDigest;
  manifestDigest: SnapshotDigest;
  database: BackupManifest["database"];
  assetCount: number;
  runCount: number;
}
