export type MaintenanceState = "open" | "draining" | "closed" | "handed_off";

export interface MaintenanceParticipantStatus {
  active: number;
  queued: number;
  blockedReason: string | null;
}

export interface MaintenanceParticipant {
  name: string;
  beginDrain(): Promise<void>;
  status(): Promise<MaintenanceParticipantStatus>;
  sealRuntimeState(): Promise<unknown>;
  reopen(): Promise<void>;
}

export interface MaintenanceStatus {
  state: MaintenanceState;
  activeMutations: number;
  activeStreams: number;
  participants: Array<MaintenanceParticipantStatus & { name: string }>;
}

export interface RuntimeBundleV1 {
  schemaVersion: 1;
  kind: "airoaming_runtime_bundle_v1";
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
  payloadDigest: `sha256:${string}`;
}
