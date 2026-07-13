import type { SnapshotDigest } from "../migration/snapshot.types.js";

export interface BackupInput {
  databaseUrl: string;
  workspaceRoot: string;
  dataRoot: string;
  releaseRoot: string;
  appCommit: string;
  maintenanceBundle: string;
  fullImportReport: string;
  decisions: string;
  output: string;
  kind: "coordinated" | "pre-cutover";
}

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

export interface BackupManifest {
  schemaVersion: 1;
  kind: "airoaming_backup_bundle_v1";
  backupKind: "coordinated";
  appCommit: string;
  createdAt: string;
  migration: {
    runIds: string[];
    runKind: "shadow";
    sliceCount: 16;
    sourceManifestDigest: SnapshotDigest;
    snapshotManifestDigest: SnapshotDigest;
    decisionsDigest: SnapshotDigest;
    fullImportReportDigest: SnapshotDigest;
    runSummaryDigest: SnapshotDigest;
    effectiveSchemaManifestDigest: SnapshotDigest;
  };
  persistenceState: {
    activationState: string;
    cutoverRunId: string | null;
    firstBusinessWriteAt: string | null;
  };
  database: { storageKey: "database/app.db"; bytes: number; sha256: SnapshotDigest };
  assets: BackupAssetEntry[];
  missingAssets: Array<{ assetId: string; storageKey: string; status: string }>;
  secretHandling: { included: false; sentinelScan: "passed" };
  bundleDigest: SnapshotDigest;
}

export interface BackupResult {
  bundlePath: string;
  bundleDigest: SnapshotDigest;
  manifestDigest: SnapshotDigest;
  database: BackupManifest["database"];
  assetCount: number;
  runCount: 16;
}
