import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { CutoverCoordinator } from "./cutover-coordinator.service.js";

describe("CutoverCoordinator", () => {
  it("enforces C0-C7 order and records sealed step evidence", async () => {
    const coordinator = new CutoverCoordinator();
    await expect(coordinator.runStep("C1", () => "wrong")).rejects.toMatchObject({ code: "CUTOVER_ORDER_INVALID" });
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"] as const) await coordinator.runStep(step, () => `${step}-passed`);
    expect(coordinator.status().map((item) => item.step)).toEqual(["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]);
  });

  it("C1 drains, closes, and seals runtime state before advancing", async () => {
    const maintenance = new MaintenanceCoordinator();
    const coordinator = new CutoverCoordinator(maintenance);
    await coordinator.runStep("C0", () => "release-gates-passed");
    const result = await coordinator.closeMaintenance();
    expect(result.evidence.step).toBe("C1");
    expect(maintenance.getState()).toBe("closed");
  });

  it("persists C0-C7 evidence and resumes idempotently by identity", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-cutover-evidence-"));
    const identity = { runId: "final-1", sourceManifestDigest: `sha256:${"1".repeat(64)}`, effectiveSchemaManifestDigest: `sha256:${"2".repeat(64)}` };
    try {
      const first = new CutoverCoordinator(undefined, { evidenceRoot: root, identity });
      await first.runStep("C0", () => "gates");
      const resumed = new CutoverCoordinator(undefined, { evidenceRoot: root, identity });
      await expect(resumed.runStep("C0", () => { throw new Error("must-not-rerun"); })).resolves.toMatchObject({ step: "C0", summary: "gates" });
      await expect(resumed.runStep("C2", () => "skip")).rejects.toMatchObject({ code: "CUTOVER_ORDER_INVALID" });
      expect(() => new CutoverCoordinator(undefined, { evidenceRoot: root, identity: { ...identity, runId: "other" } })).toThrowError(expect.objectContaining({ code: "CUTOVER_RESUME_CONFLICT" }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("M6A1-EVD-01 writes per-step digests and C6_READY atomically", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-cutover-evidence-"));
    const identity = { runId: "final-atomic", sourceManifestDigest: `sha256:${"1".repeat(64)}`, effectiveSchemaManifestDigest: `sha256:${"2".repeat(64)}` };
    try {
      const coordinator = new CutoverCoordinator(undefined, { evidenceRoot: root, identity });
      for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const) await coordinator.runStep(step, () => `${step}-passed`, { inputDigest: `sha256:${step.toLowerCase().padEnd(64, "0")}` });
      const c6 = JSON.parse(await readFile(path.join(root, "steps/C6.json"), "utf8")) as { stepDigest: string; previousStepDigest: string | null };
      expect(c6.stepDigest).toMatch(/^sha256:/);
      expect(c6.previousStepDigest).toMatch(/^sha256:/);
      expect(JSON.parse(await readFile(path.join(root, "C6_READY"), "utf8"))).toMatchObject({ schemaVersion: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("M6A1-EVD-03 rejects a different input for an already completed step and preserves evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-cutover-evidence-"));
    const identity = { runId: "final-input", sourceManifestDigest: `sha256:${"1".repeat(64)}`, effectiveSchemaManifestDigest: `sha256:${"2".repeat(64)}` };
    try {
      const first = new CutoverCoordinator(undefined, { evidenceRoot: root, identity });
      await first.runStep("C0", () => "gates", { inputDigest: `sha256:${"a".repeat(64)}` });
      const before = await readFile(path.join(root, "cutover-evidence.json"), "utf8");
      const resumed = new CutoverCoordinator(undefined, { evidenceRoot: root, identity });
      await expect(resumed.runStep("C0", () => "must-not-run", { inputDigest: `sha256:${"b".repeat(64)}` })).rejects.toMatchObject({ code: "CUTOVER_RESUME_CONFLICT" });
      expect(await readFile(path.join(root, "cutover-evidence.json"), "utf8")).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("M6A1-EVD-04 rejects a resealed evidence manifest with a tampered step digest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-cutover-evidence-"));
    const identity = { runId: "final-tamper", sourceManifestDigest: `sha256:${"1".repeat(64)}`, effectiveSchemaManifestDigest: `sha256:${"2".repeat(64)}` };
    try {
      const coordinator = new CutoverCoordinator(undefined, { evidenceRoot: root, identity });
      await coordinator.runStep("C0", () => "gates", { inputDigest: `sha256:${"a".repeat(64)}` });
      const manifestPath = path.join(root, "cutover-evidence.json");
      const raw = JSON.parse(await readFile(manifestPath, "utf8")) as { steps: Array<{ summary: string }>; evidenceDigest: string };
      raw.steps[0].summary = "tampered";
      await writeFile(manifestPath, JSON.stringify(raw) + "\n", { mode: 0o600 });
      expect(() => new CutoverCoordinator(undefined, { evidenceRoot: root, identity })).toThrowError(expect.objectContaining({ code: "CUTOVER_RESUME_CONFLICT" }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
