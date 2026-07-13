import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";

export const CUTOVER_STEPS = ["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"] as const;
export type CutoverStep = (typeof CUTOVER_STEPS)[number];

export interface CutoverStepEvidence {
  step: CutoverStep;
  status: "passed";
  startedAt: string;
  finishedAt: string;
  summary: string;
}

export class CutoverCoordinatorError extends Error {
  constructor(readonly code: string) { super(code); }
}

/**
 * Serialises the C0-C7 rehearsal. The coordinator intentionally accepts the
 * stage action as a callback: final import/restore services already own their
 * domain invariants, while this class owns the irreversible ordering and the
 * evidence ledger. A failed stage cannot be skipped or silently retried as a
 * later stage.
 */
export class CutoverCoordinator {
  private readonly evidence: CutoverStepEvidence[] = [];

  constructor(private readonly maintenance?: MaintenanceCoordinator) {}

  status(): readonly CutoverStepEvidence[] {
    return [...this.evidence];
  }

  async runStep(step: CutoverStep, action: () => Promise<string> | string): Promise<CutoverStepEvidence> {
    const expected = CUTOVER_STEPS[this.evidence.length];
    if (step !== expected) throw new CutoverCoordinatorError("CUTOVER_ORDER_INVALID");
    const startedAt = new Date().toISOString();
    let summary: string;
    try {
      summary = await action();
    } catch {
      throw new CutoverCoordinatorError(`CUTOVER_${step}_FAILED`);
    }
    const evidence: CutoverStepEvidence = { step, status: "passed", startedAt, finishedAt: new Date().toISOString(), summary };
    this.evidence.push(evidence);
    return evidence;
  }

  async closeMaintenance(timeoutMs = 30_000): Promise<{ runtimeBundle: unknown; evidence: CutoverStepEvidence }> {
    if (!this.maintenance) throw new CutoverCoordinatorError("CUTOVER_MAINTENANCE_REQUIRED");
    let runtimeBundle: unknown;
    return this.runStep("C1", async () => {
      await this.maintenance!.drain(timeoutMs);
      await this.maintenance!.close();
      runtimeBundle = await this.maintenance!.createRuntimeBundle();
      return JSON.stringify({ state: "closed", runtimeBundleDigest: (runtimeBundle as { payloadDigest?: string }).payloadDigest ?? null });
    }).then((evidence) => ({ runtimeBundle, evidence }));
  }
}
