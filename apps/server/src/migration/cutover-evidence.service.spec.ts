import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { CutoverEvidenceStore } from "./cutover-evidence.service.js";

const identity = { cutoverId: "cutover-01", appCommit: "abc123", planDigest: `sha256:${"1".repeat(64)}` as `sha256:${string}`, runId: "run-01", effectiveSchemaManifestDigest: `sha256:${"2".repeat(64)}` as `sha256:${string}` };

describe("CutoverEvidenceStore", () => {
  it("RCUT-EVD-01 persists an ordered, chained and sealed C0-C6 ledger", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const) {
      await store.runStep(step, `sha256:${step.charCodeAt(0).toString(16).padStart(2, "0")}${"0".repeat(62)}` as `sha256:${string}`, async () => ({ summaryCode: `${step}_OK` }));
    }
    const verified = await store.readVerified();
    expect(verified.steps).toHaveLength(7);
    expect(verified.manifest.completedThrough).toBe("C6");
    expect(verified.steps.at(-1)?.previousStepDigest).toBe(verified.steps.at(-2)?.stepDigest);
    expect(JSON.parse(await readFile(path.join(root, "C6_READY"), "utf8"))).toMatchObject({ kind: "airoaming_cutover_c6_ready_v1", step: "C6", evidenceDigest: verified.manifest.evidenceDigest });
  });

  it("replays identical input without re-running action and rejects conflicting input", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    let calls = 0;
    const input = `sha256:${"3".repeat(64)}` as `sha256:${string}`;
    const first = await store.runStep("C0", input, async () => { calls += 1; return { summaryCode: "C0_OK" }; });
    const replay = await store.runStep("C0", input, async () => { calls += 1; return { summaryCode: "C0_BAD" }; });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(calls).toBe(1);
    await expect(store.runStep("C0", `sha256:${"4".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "bad" }))).rejects.toMatchObject({ code: "CUTOVER_EVIDENCE_ORDER_INVALID" });
  });

  it("rejects a tampered step digest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    await store.runStep("C0", `sha256:${"5".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C0_OK" }));
    const stepPath = path.join(root, "steps", "C0.json");
    const raw = JSON.parse(await readFile(stepPath, "utf8")) as Record<string, unknown>;
    raw.summaryCode = "tampered";
    await writeFile(stepPath, JSON.stringify(raw));
    await expect(store.readVerified()).rejects.toMatchObject({ code: "CUTOVER_EVIDENCE_STEP_DIGEST_MISMATCH" });
  });

  it("rejects semantic reseal with a different identity and leaves the chain unchanged", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    await store.runStep("C0", `sha256:${"8".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C0_OK" }));
    const stepPath = path.join(root, "steps", "C0.json");
    const raw = JSON.parse(await readFile(stepPath, "utf8")) as Record<string, unknown>;
    raw.runId = "different-run";
    const { stepDigest: _ignored, ...unsigned } = raw as { stepDigest?: unknown };
    raw.stepDigest = `sha256:${"9".repeat(64)}`;
    await writeFile(stepPath, JSON.stringify(raw));
    await expect(store.readVerified()).rejects.toMatchObject({ code: "CUTOVER_EVIDENCE_IDENTITY_MISMATCH" });
    expect((await readFile(path.join(root, "cutover-evidence.json"), "utf8"))).toContain(identity.runId);
    void unsigned;
  });

  it("fails resume closed when a new instance presents another run identity", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    await store.runStep("C0", `sha256:${"b".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C0_OK" }));
    const other = new CutoverEvidenceStore(root, { ...identity, runId: "other-run" });
    await expect(other.runStep("C1", `sha256:${"c".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "BAD" }))).rejects.toMatchObject({ code: "CUTOVER_RESUME_CONFLICT" });
  });

  it("does not persist a passed step when the action fails and can resume", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    await expect(store.runStep("C0", `sha256:${"a".repeat(64)}` as `sha256:${string}`, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(store.readVerified()).rejects.toMatchObject({ code: "CUTOVER_EVIDENCE_NOT_FOUND" });
    await expect(store.runStep("C0", `sha256:${"a".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C0_OK" }))).resolves.toMatchObject({ replayed: false });
  });

  it("keeps the manifest at the prior step when the step rename fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    await store.runStep("C0", `sha256:${"d".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C0_OK" }));
    await mkdir(path.join(root, "steps", "C1.json"));
    await expect(store.runStep("C1", `sha256:${"e".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C1_OK" }))).rejects.toThrow();
    await expect(store.readVerified()).resolves.toMatchObject({ manifest: { completedThrough: "C0" }, steps: [{ step: "C0" }] });
    await rm(path.join(root, "steps", "C1.json"), { recursive: true, force: true });
    await expect(store.runStep("C1", `sha256:${"e".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C1_OK" }))).resolves.toMatchObject({ replayed: false });
  });

  it("requires an activation completion seal before persisting C7", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const) await store.runStep(step, `sha256:${step.charCodeAt(0).toString(16).padStart(2, "0")}${"1".repeat(62)}` as `sha256:${string}`, async () => ({ summaryCode: `${step}_OK` }));
    await expect(store.runStep("C7", `sha256:${"6".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C7_OK" }))).rejects.toMatchObject({ code: "CUTOVER_COMPLETION_SEAL_REQUIRED" });
    await expect(store.readVerified()).resolves.toMatchObject({ manifest: { completedThrough: "C6" } });
    await store.runStep("C7", `sha256:${"7".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C7_OK", completion: { activatedAt: "2026-07-13T00:00:00.000Z", firstBusinessWriteAt: null } }));
    expect(JSON.parse(await readFile(path.join(root, "COMPLETED"), "utf8"))).toMatchObject({ kind: "airoaming_cutover_completed_v1", step: "C7", activatedAt: "2026-07-13T00:00:00.000Z", firstBusinessWriteAt: null });
  });

  it("reconciles a db_only activation without changing the activation timestamp", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const) await store.runStep(step, `sha256:${step.charCodeAt(0).toString(16).padStart(2, "0")}${"2".repeat(62)}` as `sha256:${string}`, async () => ({ summaryCode: `${step}_OK` }));
    await expect(store.reconcileCompletion({ activationState: "db_only", activatedAt: "2026-07-13T01:00:00.000Z", firstBusinessWriteAt: null })).resolves.toMatchObject({ step: { summaryCode: "CUTOVER_C7_RECONCILED" } });
    expect(JSON.parse(await readFile(path.join(root, "COMPLETED"), "utf8"))).toMatchObject({ activatedAt: "2026-07-13T01:00:00.000Z", firstBusinessWriteAt: null });
  });

  it("verifies C6_READY and COMPLETED contents instead of trusting marker existence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const) await store.runStep(step, `sha256:${step.charCodeAt(0).toString(16).padStart(2, "0")}${"3".repeat(62)}` as `sha256:${string}`, async () => ({ summaryCode: `${step}_OK` }));
    const c6Path = path.join(root, "C6_READY");
    const c6 = JSON.parse(await readFile(c6Path, "utf8")) as Record<string, unknown>;
    c6.evidenceDigest = `sha256:${"f".repeat(64)}`;
    await writeFile(c6Path, JSON.stringify(c6));
    await expect(store.readVerified()).rejects.toMatchObject({ code: "CUTOVER_EVIDENCE_SEAL_INVALID" });
  });

  it("RCUT-PATH-03 rejects group/world-readable step evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-evidence-"));
    const store = new CutoverEvidenceStore(root, identity);
    await store.runStep("C0", `sha256:${"c".repeat(64)}` as `sha256:${string}`, async () => ({ summaryCode: "C0_OK" }));
    await chmod(path.join(root, "steps", "C0.json"), 0o644);
    await expect(store.readVerified()).rejects.toMatchObject({ code: "CUTOVER_EVIDENCE_PATH_UNSAFE" });
  });
});
