import type { SnapshotDigest } from "./snapshot.types.js";

export interface CutoverPlanV1 {
  schemaVersion: 1;
  kind: "airoaming_cutover_plan_v1";
  cutoverId: string;
  appCommit: string;
  runId: string;
  releaseRoot: string;
  sourceWorkspaceRoot: string;
  targetDatabaseUrl: `file:${string}`;
  targetDataRoot: string;
  targetWorkspaceRoot: string;
  snapshotRoot: string;
  decisionsPath: string;
  finalReportPath: string;
  maintenanceBaseUrl: string;
  maintenanceWindow: {
    startsAt: string;
    endsAt: string;
    timeZone: "Asia/Shanghai";
  };
  maintenanceTokenFile: string;
  runtimeBundlePath: string;
  backupRoot: string;
  restoreDataRoot: string;
  restoreWorkspaceRoot: string;
  archiveRoot: string;
  evidenceRoot: string;
  shadowGatePath?: string;
  settingsStartState: "already_sanitized" | "legacy_plaintext_requires_two_phase";
  credentialAction: "verify_existing" | "prestage_legacy";
  effectiveSchemaManifestDigest: SnapshotDigest;
  planDigest: SnapshotDigest;
}
