import { HttpException, Injectable } from "@nestjs/common";
import { MaintenanceParticipant, MaintenanceParticipantStatus, MaintenanceState, MaintenanceStatus, RuntimeBundleV1 } from "./maintenance.types.js";
import { digestMaintenanceJson } from "./canonical-json.js";

export class MaintenanceException extends HttpException {
  readonly code: string;

  constructor(code: string, status: number, message = code) {
    super({ success: false, error: { code, message } }, status);
    this.code = code;
  }
}

class LeaseParticipant implements MaintenanceParticipant {
  private active = 0;
  private draining = false;

  constructor(public readonly name: string) {}

  async beginDrain(): Promise<void> {
    this.draining = true;
  }

  async status(): Promise<MaintenanceParticipantStatus> {
    return {
      active: this.active,
      queued: 0,
      blockedReason: this.active > 0 ? "ACTIVE_MUTATION" : null,
    };
  }

  async sealRuntimeState(): Promise<unknown> {
    const status = await this.status();
    return {
      captured: false,
      reason: "G3_M0_PARTICIPANT_CAPTURE_DEFERRED",
      status,
      active: status.active,
      draining: this.draining,
    };
  }

  async reopen(): Promise<void> {
    this.draining = false;
  }

  enter(): void {
    this.active += 1;
  }

  leave(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

type RuntimeParticipant = MaintenanceParticipant & { enter?: () => void; leave?: () => void };
type RuntimeStateProvider = () => Promise<{ conversationState?: unknown; pendingDialogueState?: unknown }> | { conversationState?: unknown; pendingDialogueState?: unknown };

@Injectable()
export class MaintenanceCoordinator {
  private state: MaintenanceState = this.initialState();
  private activeMutations = 0;
  private activeStreams = 0;
  private readonly participants = new Map<string, RuntimeParticipant>();
  private readonly runtimeStateProviders = new Map<string, RuntimeStateProvider>();

  constructor() {
    for (const name of ["projects", "dialogue", "tasks", "tool-callback", "settings"]) {
      this.participants.set(name, new LeaseParticipant(name));
    }
  }

  private initialState(): MaintenanceState {
    const configured = process.env.AIROAMING_MAINTENANCE_MODE?.trim().toLowerCase();
    return configured === "closed" || configured === "true" ? "closed" : "open";
  }

  getState(): MaintenanceState {
    return this.state;
  }

  registerParticipant(participant: MaintenanceParticipant): void {
    if (!participant.name.trim()) throw new TypeError("MAINTENANCE_PARTICIPANT_NAME_REQUIRED");
    if (this.participants.has(participant.name)) throw new TypeError(`MAINTENANCE_PARTICIPANT_DUPLICATE:${participant.name}`);
    this.participants.set(participant.name, participant);
  }

  registerRuntimeStateProvider(name: string, provider: RuntimeStateProvider): void {
    if (!this.participants.has(name)) throw new TypeError(`MAINTENANCE_PARTICIPANT_NOT_FOUND:${name}`);
    this.runtimeStateProviders.set(name, provider);
  }

  async status(): Promise<MaintenanceStatus> {
    const participants = await Promise.all([...this.participants.values()].map(async (participant) => ({
      name: participant.name,
      ...(await participant.status()),
    })));
    participants.sort((left, right) => left.name.localeCompare(right.name));
    return {
      state: this.state,
      activeMutations: this.activeMutations,
      activeStreams: this.activeStreams,
      participants,
    };
  }

  async runMutation<T>(operation: string, execute: () => Promise<T> | T, participantName?: string): Promise<T> {
    this.assertOpen(operation);
    const participant = participantName ? this.participants.get(participantName) : undefined;
    participant?.enter?.();
    this.activeMutations += 1;
    try {
      return await execute();
    } finally {
      this.activeMutations = Math.max(0, this.activeMutations - 1);
      participant?.leave?.();
    }
  }

  async runStream<T>(operation: string, execute: () => Promise<T>, participantName = "dialogue"): Promise<T> {
    this.assertOpen(operation);
    const participant = this.participants.get(participantName);
    participant?.enter?.();
    this.activeStreams += 1;
    try {
      return await execute();
    } finally {
      this.activeStreams = Math.max(0, this.activeStreams - 1);
      participant?.leave?.();
    }
  }

  private assertOpen(operation: string): void {
    if (this.state !== "open") {
      throw new MaintenanceException("MAINTENANCE_MODE", 503, `${operation} is blocked by maintenance state ${this.state}`);
    }
  }

  async drain(timeoutMs = 30_000): Promise<MaintenanceStatus> {
    if (this.state === "closed" || this.state === "handed_off") return this.status();
    if (this.state === "open") {
      this.state = "draining";
      await Promise.all([...this.participants.values()].map((participant) => participant.beginDrain()));
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const current = await this.status();
      if (current.activeMutations === 0 && current.activeStreams === 0 && current.participants.every((item) => item.active === 0 && item.queued === 0)) {
        return current;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new MaintenanceException("MAINTENANCE_DRAIN_TIMEOUT", 409);
  }

  async close(): Promise<MaintenanceStatus> {
    if (this.state !== "draining") {
      throw new MaintenanceException("MAINTENANCE_INVALID_TRANSITION", 409, `cannot close from ${this.state}`);
    }
    const current = await this.status();
    if (current.activeMutations || current.activeStreams || current.participants.some((item) => item.active || item.queued)) {
      throw new MaintenanceException("MAINTENANCE_PARTICIPANT_BUSY", 409);
    }
    this.state = "closed";
    return this.status();
  }

  async reopen(): Promise<MaintenanceStatus> {
    if (this.state !== "closed") {
      throw new MaintenanceException("MAINTENANCE_INVALID_TRANSITION", 409, `cannot reopen from ${this.state}`);
    }
    await Promise.all([...this.participants.values()].map((participant) => participant.reopen()));
    this.state = "open";
    return this.status();
  }

  async handOff(): Promise<MaintenanceStatus> {
    if (this.state !== "closed") throw new MaintenanceException("MAINTENANCE_INVALID_TRANSITION", 409, `cannot hand off from ${this.state}`);
    this.state = "handed_off";
    return this.status();
  }

  async createRuntimeBundle(): Promise<RuntimeBundleV1> {
    if (this.state !== "closed") throw new MaintenanceException("MAINTENANCE_BUNDLE_REQUIRES_CLOSED", 409);
    const current = await this.status();
    if (current.activeMutations || current.activeStreams || current.participants.some((item) => item.active || item.queued)) {
      throw new MaintenanceException("MAINTENANCE_PARTICIPANT_BUSY", 409);
    }
    const participants: Record<string, unknown> = {};
    for (const participant of [...this.participants.values()].sort((left, right) => left.name.localeCompare(right.name))) {
      participants[participant.name] = await participant.sealRuntimeState();
    }
    const providedState = await this.runtimeStateProviders.get("dialogue")?.();
    const conversationState = providedState?.conversationState ?? { captured: false, reason: "G3_M0_CONVERSATION_CAPTURE_DEFERRED" };
    const pendingDialogueState = providedState?.pendingDialogueState ?? { captured: false, reason: "G3_M0_DIALOGUE_CAPTURE_DEFERRED" };
    const unobservableBeforeBridge = [
      ...(conversationState && typeof conversationState === "object" && (conversationState as { captured?: unknown }).captured === true ? [] : ["conversationState"]),
      ...(pendingDialogueState && typeof pendingDialogueState === "object" && (pendingDialogueState as { captured?: unknown }).captured === true ? [] : ["pendingDialogueState"]),
      "legacyTaskTerminalState",
    ];
    const payload = {
      schemaVersion: 1 as const,
      kind: "airoaming_runtime_bundle_v1" as const,
      createdAt: new Date().toISOString(),
      maintenanceState: "closed" as const,
      activeMutations: 0 as const,
      activeStreams: 0 as const,
      participants,
      conversationState,
      pendingDialogueState,
      legacyTaskTerminalState: { captured: false, reason: "G3_M0_TASK_CAPTURE_DEFERRED" },
      unobservableBeforeBridge,
      redaction: { schemaVersion: 1 as const, redactedCount: 0 },
    };
    return { ...payload, payloadDigest: digestMaintenanceJson(payload) };
  }
}
