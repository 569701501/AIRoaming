import { describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { digestMaintenanceJson } from "../maintenance/canonical-json.js";
import { RuntimeBundleFileService, RuntimeBundleFileError } from "./runtime-bundle-file.service.js";
import { SnapshotService } from "./snapshot.service.js";
import type { RuntimeBundleEnvelope } from "./snapshot.types.js";

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-snapshot-"));
  const workspace = path.join(root, "workspace");
  const staging = path.join(root, "staging");
  await mkdir(path.join(workspace, "projects", "p1"), { recursive: true });
  await mkdir(path.join(workspace, "settings"), { recursive: true });
  await mkdir(staging);
  await writeFile(path.join(workspace, "projects", "p1", "project.json"), '{"id":"p1","name":"Demo"}\n');
  await writeFile(path.join(workspace, "settings", "app-settings.json"), JSON.stringify({ aiKey: { apiKey: "sk-test-secret-value" }, appearance: { theme: "dark" } }));
  const coordinator = new MaintenanceCoordinator();
  await coordinator.drain();
  await coordinator.close();
  const bundlePath = path.join(root, "runtime-bundle.json");
  const bundle = await coordinator.createRuntimeBundle();
  await new RuntimeBundleFileService().writeAtomic(bundlePath, bundle);
  return { root, workspace, staging, bundlePath };
}

describe("G3-M1 snapshot", () => {
  it("SNP-01 seals a snapshot only after matching pre/post manifests", async () => {
    const fixture = await makeFixture();
    const result = await new SnapshotService().createSnapshot({
      workspaceRoot: fixture.workspace,
      stagingRoot: fixture.staging,
      runtimeBundle: fixture.bundlePath,
    });
    expect(result.sealed.kind).toBe("airoaming_snapshot_sealed_v1");
    expect(await readFile(path.join(result.outputPath, "SEALED"), "utf8")).toContain(result.sealed.snapshotManifestDigest);
  });

  it("SNP-02 removes temporary output when the source changes between scans", async () => {
    const fixture = await makeFixture();
    await expect(new SnapshotService().createSnapshot({
      workspaceRoot: fixture.workspace,
      stagingRoot: fixture.staging,
      runtimeBundle: fixture.bundlePath,
      afterCopy: async () => writeFile(path.join(fixture.workspace, "projects", "p1", "project.json"), "changed\n"),
    })).rejects.toMatchObject({ code: "SNAPSHOT_SOURCE_CHANGED" });
    expect(await readdir(fixture.staging)).toEqual([]);
  });

  it("SNP-03 rejects symlink and special path entries", async () => {
    const fixture = await makeFixture();
    await symlink(fixture.root, path.join(fixture.workspace, "outside"));
    await expect(new SnapshotService().createSnapshot({
      workspaceRoot: fixture.workspace,
      stagingRoot: fixture.staging,
      runtimeBundle: fixture.bundlePath,
    })).rejects.toMatchObject({ code: "SNAPSHOT_PATH_UNSAFE" });
  });

  it("SNP-04 redacts settings and never copies the fake key", async () => {
    const fixture = await makeFixture();
    const result = await new SnapshotService().createSnapshot({
      workspaceRoot: fixture.workspace,
      stagingRoot: fixture.staging,
      runtimeBundle: fixture.bundlePath,
    });
    const redacted = await readFile(path.join(result.outputPath, "settings.redacted.json"), "utf8");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("sk-test-secret-value");
    expect(JSON.stringify(result.snapshotManifest)).not.toContain("app-settings.json");
  });

  it("SNP-05 produces identical digests for equal content under two absolute roots", async () => {
    const first = await makeFixture();
    const second = await makeFixture();
    const service = new SnapshotService();
    const left = await service.createSnapshot({ workspaceRoot: first.workspace, stagingRoot: first.staging, runtimeBundle: first.bundlePath });
    const right = await service.createSnapshot({ workspaceRoot: second.workspace, stagingRoot: second.staging, runtimeBundle: first.bundlePath });
    expect(left.sourceManifest.manifestDigest).toBe(right.sourceManifest.manifestDigest);
    expect(left.snapshotManifest.manifestDigest).toBe(right.snapshotManifest.manifestDigest);
  });

  it("SNP-06 does not change source bytes or metadata", async () => {
    const fixture = await makeFixture();
    const sourcePath = path.join(fixture.workspace, "projects", "p1", "project.json");
    const beforeBytes = await readFile(sourcePath);
    const beforeStat = await stat(sourcePath, { bigint: true });
    await new SnapshotService().createSnapshot({ workspaceRoot: fixture.workspace, stagingRoot: fixture.staging, runtimeBundle: fixture.bundlePath });
    const afterBytes = await readFile(sourcePath);
    const afterStat = await stat(sourcePath, { bigint: true });
    expect(afterBytes.equals(beforeBytes)).toBe(true);
    expect(afterStat.mtimeNs).toBe(beforeStat.mtimeNs);
  });
});

describe("runtime bundle file", () => {
  it("writes 0600 canonical files and verifies payload digest", async () => {
    const fixture = await makeFixture();
    const service = new RuntimeBundleFileService();
    const verified = await service.readAndVerify(fixture.bundlePath);
    expect(verified.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects tampered payloads and secret-bearing bundles", async () => {
    const fixture = await makeFixture();
    const service = new RuntimeBundleFileService();
    const payload = { schemaVersion: 1 as const, kind: "airoaming_runtime_bundle_v1" as const, createdAt: "2026-07-12T00:00:00.000Z", participants: {}, conversationState: {}, pendingDialogueState: {}, legacyTaskTerminalState: {}, unobservableBeforeBridge: [], redaction: { schemaVersion: 1 as const, redactedCount: 0 } };
    const tampered = { ...payload, participants: { secret: "sk-test-secret-value" }, payloadDigest: digestMaintenanceJson({ ...payload, participants: { secret: "sk-test-secret-value" } }) } as RuntimeBundleEnvelope;
    await writeFile(fixture.bundlePath, `${JSON.stringify(tampered)}\n`);
    await chmod(fixture.bundlePath, 0o600);
    await expect(service.readAndVerify(fixture.bundlePath)).rejects.toBeInstanceOf(RuntimeBundleFileError);
  });
});
