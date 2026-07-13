import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";

export const CUTOVER_STEPS = ["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"] as const;
export type CutoverStep = (typeof CUTOVER_STEPS)[number];

export interface CutoverStepEvidence {
  step: CutoverStep;
  status: "passed";
  startedAt: string;
  finishedAt: string;
  inputDigest: string;
  previousStepDigest: string | null;
  artifactDigests: Record<string, string>;
  summary: string;
  stepDigest: string;
}

export interface CutoverStepOptions {
  inputDigest?: string;
  artifactDigests?: Record<string, string>;
}

export interface CutoverIdentity {
  runId: string;
  sourceManifestDigest: string;
  effectiveSchemaManifestDigest: string;
}

interface CutoverEvidenceDocument {
  schemaVersion: 1;
  kind: "airoaming_cutover_evidence_v1";
  identity: CutoverIdentity;
  steps: CutoverStepEvidence[];
  evidenceDigest: string;
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
  private readonly evidence: CutoverStepEvidence[];
  private readonly evidenceRoot: string | null;
  private readonly identity: CutoverIdentity | null;

  constructor(private readonly maintenance?: MaintenanceCoordinator, options: { evidenceRoot?: string; identity?: CutoverIdentity } = {}) {
    this.evidenceRoot = options.evidenceRoot ? path.resolve(options.evidenceRoot) : null;
    this.identity = options.identity ?? null;
    if (this.evidenceRoot && !this.identity) throw new CutoverCoordinatorError("CUTOVER_IDENTITY_REQUIRED");
    this.evidence = this.readPersistedEvidence();
  }

  status(): readonly CutoverStepEvidence[] {
    return [...this.evidence];
  }

  private evidencePath(): string | null {
    return this.evidenceRoot ? path.join(this.evidenceRoot, "cutover-evidence.json") : null;
  }

  private readPersistedEvidence(): CutoverStepEvidence[] {
    const filePath = this.evidencePath();
    if (!filePath) return [];
    if (!existsSync(filePath)) {
      if (this.evidenceRoot && existsSync(this.evidenceRoot) && readdirSync(this.evidenceRoot).length > 0) {
        throw new CutoverCoordinatorError("CUTOVER_RESUME_CONFLICT");
      }
      return [];
    }
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as CutoverEvidenceDocument;
      if (raw.schemaVersion !== 1 || raw.kind !== "airoaming_cutover_evidence_v1" || !this.identity || JSON.stringify(raw.identity) !== JSON.stringify(this.identity) || !Array.isArray(raw.steps)) throw new Error("identity");
      const { evidenceDigest: _digest, ...unsigned } = raw;
      if (digestCanonicalJson(unsigned) !== raw.evidenceDigest) throw new Error("digest");
      if (raw.steps.length > CUTOVER_STEPS.length) throw new Error("steps");
      raw.steps.forEach((step, index) => {
        if (step.step !== CUTOVER_STEPS[index] || step.status !== "passed" || typeof step.stepDigest !== "string" || typeof step.inputDigest !== "string" || (index === 0 ? step.previousStepDigest !== null : step.previousStepDigest !== raw.steps[index - 1]?.stepDigest)) throw new Error("step");
        const { stepDigest: _stepDigest, ...stepUnsigned } = step;
        if (digestCanonicalJson(stepUnsigned) !== step.stepDigest) throw new Error("step-digest");
      });
      return raw.steps;
    } catch {
      throw new CutoverCoordinatorError("CUTOVER_RESUME_CONFLICT");
    }
  }

  private writeAtomic(filePath: string, value: unknown): void {
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const handle = openSync(temporary, "wx", 0o600);
    try { writeFileSync(handle, `${JSON.stringify(value)}\n`, "utf8"); fsyncSync(handle); } finally { closeSync(handle); }
    renameSync(temporary, filePath);
    try { unlinkSync(temporary); } catch { /* atomic rename already completed */ }
  }

  private persist(): void {
    if (!this.evidenceRoot || !this.identity) return;
    mkdirSync(this.evidenceRoot, { recursive: true, mode: 0o700 });
    const stepsRoot = path.join(this.evidenceRoot, "steps");
    mkdirSync(stepsRoot, { recursive: true, mode: 0o700 });
    for (const step of this.evidence) this.writeAtomic(path.join(stepsRoot, `${step.step}.json`), step);
    const unsigned = { schemaVersion: 1 as const, kind: "airoaming_cutover_evidence_v1" as const, identity: this.identity, steps: this.evidence };
    const document: CutoverEvidenceDocument = { ...unsigned, evidenceDigest: digestCanonicalJson(unsigned) };
    const filePath = this.evidencePath()!;
    this.writeAtomic(filePath, document);
    if (this.evidence.at(-1)?.step === "C6") this.writeAtomic(path.join(this.evidenceRoot, "C6_READY"), { schemaVersion: 1, evidenceDigest: document.evidenceDigest });
    if (this.evidence.at(-1)?.step === "C7") this.writeAtomic(path.join(this.evidenceRoot, "COMPLETED"), { schemaVersion: 1, evidenceDigest: document.evidenceDigest });
  }

  async runStep(step: CutoverStep, action: () => Promise<string> | string, options: CutoverStepOptions = {}): Promise<CutoverStepEvidence> {
    const stepIndex = CUTOVER_STEPS.indexOf(step);
    if (stepIndex < this.evidence.length) {
      const existing = this.evidence[stepIndex];
      if (options.inputDigest !== undefined && options.inputDigest !== existing.inputDigest) throw new CutoverCoordinatorError("CUTOVER_RESUME_CONFLICT");
      return existing;
    }
    const expected = CUTOVER_STEPS[this.evidence.length];
    if (step !== expected) throw new CutoverCoordinatorError("CUTOVER_ORDER_INVALID");
    const startedAt = new Date().toISOString();
    let summary: string;
    try {
      summary = await action();
    } catch {
      throw new CutoverCoordinatorError(`CUTOVER_${step}_FAILED`);
    }
    const inputDigest = options.inputDigest ?? digestCanonicalJson({ step, summary });
    const unsigned = { step, status: "passed" as const, startedAt, finishedAt: new Date().toISOString(), inputDigest, previousStepDigest: this.evidence.at(-1)?.stepDigest ?? null, artifactDigests: options.artifactDigests ?? {}, summary };
    const evidence: CutoverStepEvidence = { ...unsigned, stepDigest: digestCanonicalJson(unsigned) };
    this.evidence.push(evidence);
    this.persist();
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
