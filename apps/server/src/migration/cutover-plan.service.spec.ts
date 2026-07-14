import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { CutoverPlanService } from "./cutover-plan.service.js";

function plan(root: string) {
  const unsigned = {
    schemaVersion: 1 as const, kind: "airoaming_cutover_plan_v1" as const, cutoverId: "c1", appCommit: "a".repeat(40), runId: "r1", releaseRoot: path.join(root, "release"), sourceWorkspaceRoot: path.join(root, "source"), targetDatabaseUrl: `file:${path.join(root, "target-data", "db.sqlite")}` as `file:${string}`, targetDataRoot: path.join(root, "target-data"), targetWorkspaceRoot: path.join(root, "target-workspace"), snapshotRoot: path.join(root, "snapshot"), decisionsPath: path.join(root, "decisions.json"), finalReportPath: path.join(root, "report.json"), maintenanceBaseUrl: "http://127.0.0.1:3010/api", maintenanceWindow: { startsAt: "2026-07-14T22:00:00+08:00", endsAt: "2026-07-14T23:00:00+08:00", timeZone: "Asia/Shanghai" as const }, maintenanceTokenFile: path.join(root, "token"), runtimeBundlePath: path.join(root, "runtime.json"), backupRoot: path.join(root, "backup"), restoreDataRoot: path.join(root, "restore-data"), restoreWorkspaceRoot: path.join(root, "restore-workspace"), archiveRoot: path.join(root, "archive"), evidenceRoot: path.join(root, "evidence"), settingsStartState: "already_sanitized" as const, credentialAction: "verify_existing" as const, effectiveSchemaManifestDigest: `sha256:${"1".repeat(64)}` as `sha256:${string}`,
  };
  return { ...unsigned, planDigest: digestCanonicalJson(unsigned) as `sha256:${string}` };
}

describe("CutoverPlanService", () => {
  it("accepts a private immutable plan and verifies its digest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-plan-"));
    const file = path.join(root, "plan.json");
    await writeFile(file, JSON.stringify(plan(root)), { mode: 0o600 });
    await expect(new CutoverPlanService().readAndVerify(file)).resolves.toMatchObject({ cutoverId: "c1", planDigest: expect.stringMatching(/^sha256:/) });
  });

  it("rejects digest tamper and overlapping roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-plan-"));
    const file = path.join(root, "plan.json");
    const value = plan(root);
    await writeFile(file, JSON.stringify({ ...value, appCommit: "b".repeat(40) }), { mode: 0o600 });
    await expect(new CutoverPlanService().readAndVerify(file)).rejects.toMatchObject({ code: "CUTOVER_PLAN_DIGEST_MISMATCH" });
    await chmod(file, 0o644);
    await expect(new CutoverPlanService().readAndVerify(file)).rejects.toMatchObject({ code: "CUTOVER_PLAN_FILE_INVALID" });
    const overlap = plan(root);
    const overlapUnsigned = { ...overlap, targetDataRoot: overlap.sourceWorkspaceRoot };
    const { planDigest: _oldDigest, ...withoutDigest } = overlapUnsigned;
    await writeFile(file, JSON.stringify({ ...overlapUnsigned, planDigest: digestCanonicalJson(withoutDigest) }), { mode: 0o600 });
    await chmod(file, 0o600);
    await expect(new CutoverPlanService().readAndVerify(file)).rejects.toMatchObject({ code: "CUTOVER_PLAN_ROOT_OVERLAP" });
  });

  it("rejects invalid maintenance window and non-loopback API paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-plan-"));
    const file = path.join(root, "plan.json");
    const value = plan(root);
    for (const changes of [
      { maintenanceWindow: { ...value.maintenanceWindow, endsAt: value.maintenanceWindow.startsAt } },
      { maintenanceWindow: { startsAt: "2026-07-14T14:00:00.000Z", endsAt: "2026-07-14T15:00:00.000Z", timeZone: "Asia/Shanghai" as const } },
      { maintenanceWindow: null as never },
      { appCommit: "short" },
      { maintenanceBaseUrl: "http://127.0.0.1:3010/admin" },
    ]) {
      const unsigned = { ...value, ...changes };
      const { planDigest: _oldDigest, ...withoutDigest } = unsigned;
      await writeFile(file, JSON.stringify({ ...unsigned, planDigest: digestCanonicalJson(withoutDigest) }), { mode: 0o600 });
      await expect(new CutoverPlanService().readAndVerify(file)).rejects.toBeInstanceOf(Error);
    }
  });
});
