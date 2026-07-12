import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { MigrationAuditService } from "./migration-audit.service.js";
import { SnapshotService } from "./snapshot.service.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-audit-"));
  const workspace = path.join(root, "workspace");
  const staging = path.join(root, "staging");
  await mkdir(path.join(workspace, "projects", "p1"), { recursive: true });
  await mkdir(path.join(workspace, "projects", "p2"), { recursive: true });
  await mkdir(staging);
  await writeFile(path.join(workspace, "projects", "p1", "project.json"), JSON.stringify({ id: "p1", comicFormat: "vertical_scroll" }) + "\n");
  await writeFile(path.join(workspace, "projects", "p2", "project.json"), JSON.stringify({ id: "p2", comicFormat: "four_panel" }) + "\n");
  const coordinator = new MaintenanceCoordinator();
  await coordinator.drain();
  await coordinator.close();
  const bundlePath = path.join(root, "runtime-bundle.json");
  await new RuntimeBundleFileService().writeAtomic(bundlePath, await coordinator.createRuntimeBundle());
  const snapshot = await new SnapshotService().createSnapshot({ workspaceRoot: workspace, stagingRoot: staging, runtimeBundle: bundlePath });
  return { ...snapshot, root };
}

describe("G3-M3-A0 snapshot audit", () => {
  it("AUDIT-01 produces a deterministic report and blocked run for four_panel", async () => {
    const fixtureValue = await fixture();
    const result = await new MigrationAuditService().auditComicFormats(fixtureValue.outputPath, undefined, { runId: "audit-1", startedAt: "2026-07-12T00:00:00.000Z" });
    expect(result.run.status).toBe("blocked");
    expect(result.report.summary).toMatchObject({ projectCount: 2, canonicalCount: 1, decisionRequiredCount: 1, unresolvedBlockerCount: 1 });
    expect(result.report.projects[1]).toMatchObject({ projectId: "p2", issueKey: "project:p2:comic-format", importStatus: "blocked" });
    expect(result.report.reportDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("AUDIT-02 rejects tampered project bytes before mapping", async () => {
    const fixtureValue = await fixture();
    await writeFile(path.join(fixtureValue.outputPath, "payload", "projects", "p1", "project.json"), '{"id":"p1","comicFormat":"paged_comic"}\n');
    await expect(new MigrationAuditService().auditComicFormats(fixtureValue.outputPath)).rejects.toMatchObject({ code: "MIGRATION_SOURCE_DIGEST_MISMATCH" });
  });

  it("AUDIT-03 does not write a database or mutate snapshot files", async () => {
    const fixtureValue = await fixture();
    const before = await readFile(path.join(fixtureValue.outputPath, "SEALED"), "utf8");
    await new MigrationAuditService().auditComicFormats(fixtureValue.outputPath, undefined, { runId: "audit-3" });
    expect(await readFile(path.join(fixtureValue.outputPath, "SEALED"), "utf8")).toBe(before);
  });
});
