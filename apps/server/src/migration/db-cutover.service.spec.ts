import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { DbCutoverService } from "./db-cutover.service.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("DbCutoverService", () => {
  it("RCUT-CLI-03/04 runs an isolated C0 and rejects a skipped step", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-cutover-"));
    const release = await loadReleaseSchemaIdentityV1(repoRoot);
    const planUnsigned = {
      schemaVersion: 1 as const, kind: "airoaming_cutover_plan_v1" as const, cutoverId: "c0", appCommit: "abc", runId: "r0", releaseRoot: repoRoot, sourceWorkspaceRoot: path.join(root, "source"), targetDatabaseUrl: `file:${path.join(root, "target-data", "db.sqlite")}` as `file:${string}`, targetDataRoot: path.join(root, "target-data"), targetWorkspaceRoot: path.join(root, "target-workspace"), snapshotRoot: path.join(root, "snapshot"), decisionsPath: path.join(root, "decisions.json"), finalReportPath: path.join(root, "report.json"), maintenanceBaseUrl: "http://127.0.0.1:3010", maintenanceTokenFile: path.join(root, "token"), runtimeBundlePath: path.join(root, "runtime.json"), backupRoot: path.join(root, "backup"), restoreDataRoot: path.join(root, "restore-data"), restoreWorkspaceRoot: path.join(root, "restore-workspace"), archiveRoot: path.join(root, "archive"), evidenceRoot: path.join(root, "evidence"), settingsStartState: "already_sanitized" as const, credentialAction: "verify_existing" as const, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
    };
    const plan = { ...planUnsigned, planDigest: digestCanonicalJson(planUnsigned) as `sha256:${string}` };
    const planPath = path.join(root, "plan.json"); await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
    await mkdir(plan.sourceWorkspaceRoot, { recursive: true });
    await writeFile(plan.maintenanceTokenFile, "isolated-token\n", { mode: 0o600 });
    const service = new DbCutoverService();
    await expect(service.runStep(planPath, plan.evidenceRoot, "C0", async () => ({ summaryCode: "CUTOVER_C0_OK" }))).resolves.toMatchObject({ code: "CUTOVER_C0_OK", replayed: false });
    await expect(service.runStep(planPath, plan.evidenceRoot, "C2", async () => ({ summaryCode: "bad" }))).rejects.toMatchObject({ code: "CUTOVER_AUTH_REQUIRED" });
  });

  it("rejects an unknown step before reading or mutating the plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-cutover-"));
    const service = new DbCutoverService();
    let called = false;
    await expect(service.runStep(path.join(root, "missing-plan.json"), root, "C8" as never, async () => {
      called = true;
      return { summaryCode: "BAD" };
    })).rejects.toMatchObject({ code: "CUTOVER_STEP_INVALID" });
    expect(called).toBe(false);
  });

  it("RCUT-RB-01 isolates C1-C4 failures without advancing evidence or changing the source", async () => {
    for (const failedStep of ["C1", "C2", "C3", "C4"] as const) {
      const root = await mkdtemp(path.join(os.tmpdir(), `airoaming-cutover-rb-${failedStep.toLowerCase()}-`));
      const release = await loadReleaseSchemaIdentityV1(repoRoot);
      const sourceRoot = path.join(root, "source");
      const sourceFile = path.join(sourceRoot, "source.txt");
      await mkdir(sourceRoot, { recursive: true });
      await writeFile(path.join(root, "token"), "isolated-token\n", { mode: 0o600 });
      const originalSource = "source-remains-byte-identical\n";
      await writeFile(sourceFile, originalSource, { mode: 0o600 });
      const unsigned = {
        schemaVersion: 1 as const, kind: "airoaming_cutover_plan_v1" as const, cutoverId: `rollback-${failedStep}`, appCommit: "abc1234", runId: `rollback-run-${failedStep}`, releaseRoot: repoRoot, sourceWorkspaceRoot: sourceRoot, targetDatabaseUrl: `file:${path.join(root, "target-data", "db.sqlite")}` as `file:${string}`, targetDataRoot: path.join(root, "target-data"), targetWorkspaceRoot: path.join(root, "target-workspace"), snapshotRoot: path.join(root, "snapshot"), decisionsPath: path.join(root, "decisions.json"), finalReportPath: path.join(root, "report.json"), maintenanceBaseUrl: "http://127.0.0.1:3010", maintenanceTokenFile: path.join(root, "token"), runtimeBundlePath: path.join(root, "runtime.json"), backupRoot: path.join(root, "backup"), restoreDataRoot: path.join(root, "restore-data"), restoreWorkspaceRoot: path.join(root, "restore-workspace"), archiveRoot: path.join(root, "archive"), evidenceRoot: path.join(root, "evidence"), settingsStartState: "already_sanitized" as const, credentialAction: "verify_existing" as const, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
      };
      const plan = { ...unsigned, planDigest: digestCanonicalJson(unsigned) as `sha256:${string}` };
      const planPath = path.join(root, "plan.json");
      await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
      await mkdir(path.dirname(plan.maintenanceTokenFile), { recursive: true });
      await writeFile(plan.maintenanceTokenFile, "isolated-token\n", { mode: 0o600 });
      const service = new DbCutoverService();
      const c0 = await service.runStep(planPath, plan.evidenceRoot, "C0", async () => ({ summaryCode: "C0_OK" }));
      const authUnsigned = { schemaVersion: 1 as const, kind: "airoaming_cutover_authorization_v1" as const, scope: "AUTH-C1" as const, cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest, evidenceDigest: c0.evidenceDigest, authorizedAt: "2026-07-13T00:00:00.000Z", authorizedBy: "isolated-rollback-test", acknowledgement: "我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并按 plan 执行 C3 凭据验证；未授权 C5/C7。" };
      const authPath = path.join(root, "AUTH-C1.json");
      await writeFile(authPath, JSON.stringify({ ...authUnsigned, authorizationDigest: digestCanonicalJson(authUnsigned) }), { mode: 0o600 });
      const stepsBeforeFailure = ["C1", "C2", "C3", "C4"].slice(0, ["C1", "C2", "C3", "C4"].indexOf(failedStep));
      const action = async ({ step }: { step: string }) => {
        if (step === failedStep) throw new Error(`INJECTED_${failedStep}_FAILURE`);
        return { summaryCode: `${step}_OK` };
      };
      for (const step of stepsBeforeFailure) await service.runStep(planPath, plan.evidenceRoot, step as never, action as never, authPath);
      await expect(service.runStep(planPath, plan.evidenceRoot, failedStep, action as never, authPath)).rejects.toThrow(`INJECTED_${failedStep}_FAILURE`);
      const status = await service.status(planPath, plan.evidenceRoot);
      const expectedThrough = stepsBeforeFailure.at(-1) ?? "C0";
      expect(status.completedThrough).toBe(expectedThrough);
      expect(await readFile(sourceFile, "utf8")).toBe(originalSource);
      await expect(readFile(path.join(plan.evidenceRoot, "steps", `${failedStep}.json`), "utf8")).rejects.toThrow();
    }
  });

  it("runs two fresh isolated evidence-bound C0-C7 protocol chains with separate identities", async () => {
    const runChain = async (suffix: string) => {
      const root = await mkdtemp(path.join(os.tmpdir(), `airoaming-cutover-chain-${suffix}-`));
      const release = await loadReleaseSchemaIdentityV1(repoRoot);
      const unsigned = {
        schemaVersion: 1 as const, kind: "airoaming_cutover_plan_v1" as const, cutoverId: `cutover-${suffix}`, appCommit: "abc1234", runId: `run-${suffix}`, releaseRoot: repoRoot, sourceWorkspaceRoot: path.join(root, "source"), targetDatabaseUrl: `file:${path.join(root, "target-data", "db.sqlite")}` as `file:${string}`, targetDataRoot: path.join(root, "target-data"), targetWorkspaceRoot: path.join(root, "target-workspace"), snapshotRoot: path.join(root, "snapshot"), decisionsPath: path.join(root, "decisions.json"), finalReportPath: path.join(root, "report.json"), maintenanceBaseUrl: "http://127.0.0.1:3010", maintenanceTokenFile: path.join(root, "token"), runtimeBundlePath: path.join(root, "runtime.json"), backupRoot: path.join(root, "backup"), restoreDataRoot: path.join(root, "restore-data"), restoreWorkspaceRoot: path.join(root, "restore-workspace"), archiveRoot: path.join(root, "archive"), evidenceRoot: path.join(root, "evidence"), settingsStartState: "already_sanitized" as const, credentialAction: "verify_existing" as const, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
      };
      const plan = { ...unsigned, planDigest: digestCanonicalJson(unsigned) as `sha256:${string}` };
      const planPath = path.join(root, "plan.json");
      await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
      await mkdir(plan.sourceWorkspaceRoot, { recursive: true });
      await writeFile(plan.maintenanceTokenFile, "isolated-token\n", { mode: 0o600 });
      const service = new DbCutoverService();
      const authorization = async (scope: "AUTH-C1" | "AUTH-C5" | "AUTH-C7", evidenceDigest: string, fileName: string) => {
        const acknowledgements = {
          "AUTH-C1": "我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并按 plan 执行 C3 凭据验证；未授权 C5/C7。",
          "AUTH-C5": "我确认 C4 证据、备份与回滚责任人，授权进入 C5 并执行 DB smoke/archive；未授权 C7。",
          "AUTH-C7": "我理解 DB activate 不可逆边界，确认 C6 证据、备份与回滚责任人，授权执行 C7。",
        } as const;
        const authUnsigned = { schemaVersion: 1 as const, kind: "airoaming_cutover_authorization_v1" as const, scope, cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest, evidenceDigest, authorizedAt: "2026-07-13T00:00:00.000Z", authorizedBy: "isolated-test", acknowledgement: acknowledgements[scope] };
        const file = path.join(root, fileName);
        await writeFile(file, JSON.stringify({ ...authUnsigned, authorizationDigest: digestCanonicalJson(authUnsigned) }), { mode: 0o600 });
        return file;
      };
      const actions = new Map<string, number>();
      const action = async ({ step }: { step: string }) => { actions.set(step, (actions.get(step) ?? 0) + 1); return { summaryCode: `${step}_OK`, ...(step === "C7" ? { completion: { activatedAt: "2026-07-13T00:00:00.000Z", firstBusinessWriteAt: null } } : {}) }; };
      const c0 = await service.runStep(planPath, plan.evidenceRoot, "C0", action as never);
      const authC1 = await authorization("AUTH-C1", c0.evidenceDigest, "AUTH-C1.json");
      for (const step of ["C1", "C2", "C3", "C4"] as const) await service.runStep(planPath, plan.evidenceRoot, step, action as never, authC1);
      const c4 = await service.status(planPath, plan.evidenceRoot);
      const authC5 = await authorization("AUTH-C5", c4.evidenceDigest!, "AUTH-C5.json");
      for (const step of ["C5", "C6"] as const) await service.runStep(planPath, plan.evidenceRoot, step, action as never, authC5);
      const c6 = await service.status(planPath, plan.evidenceRoot);
      const authC7 = await authorization("AUTH-C7", c6.evidenceDigest!, "AUTH-C7.json");
      await service.runStep(planPath, plan.evidenceRoot, "C7", action as never, authC7);
      const replay = await service.runStep(planPath, plan.evidenceRoot, "C7", action as never, authC7);
      expect(replay.replayed).toBe(true);
      expect(actions.get("C7")).toBe(1);
      return { cutoverId: plan.cutoverId, status: await service.status(planPath, plan.evidenceRoot) };
    };
    const first = await runChain("one");
    const second = await runChain("two");
    expect(first.status.completedThrough).toBe("C7");
    expect(second.status.completedThrough).toBe("C7");
    expect(first.cutoverId).not.toBe(second.cutoverId);
  });
});
