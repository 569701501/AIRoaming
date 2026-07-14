export type SnapshotDigest = `sha256:${string}`;

export interface SnapshotManifestItem {
  storageKey: string;
  type: "file";
  bytes: number;
  sha256: SnapshotDigest;
}

export interface SnapshotManifest {
  schemaVersion: 1;
  kind: "airoaming_snapshot_manifest_v1";
  items: SnapshotManifestItem[];
  manifestDigest: SnapshotDigest;
}

export interface SnapshotTransform {
  sourceStorageKey: string;
  action: "copied" | "redacted" | "omitted";
  targetStorageKey: string | null;
  reason: string | null;
}

export interface RuntimeBundleEnvelope {
  schemaVersion: 1;
  kind: "airoaming_runtime_bundle_v1";
  runtimeInstanceId: string;
  createdAt: string;
  maintenanceState: "closed";
  activeMutations: 0;
  activeStreams: 0;
  participants: Record<string, unknown>;
  conversationState: unknown;
  pendingDialogueState: unknown;
  legacyTaskTerminalState: unknown;
  unobservableBeforeBridge: string[];
  redaction: { schemaVersion: 1; redactedCount: number };
  payloadDigest: SnapshotDigest;
}

export interface SealedSnapshot {
  schemaVersion: 1;
  kind: "airoaming_snapshot_sealed_v1";
  sourceManifestDigest: SnapshotDigest;
  snapshotManifestDigest: SnapshotDigest;
  transformDigest: SnapshotDigest;
  runtimeBundleDigest: SnapshotDigest;
}

export interface SnapshotResult {
  outputPath: string;
  sourceManifest: SnapshotManifest;
  snapshotManifest: SnapshotManifest;
  transformDigest: SnapshotDigest;
  runtimeBundleDigest: SnapshotDigest;
  sealed: SealedSnapshot;
}
