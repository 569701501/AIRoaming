import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MaintenanceAdminController } from "./maintenance-admin.controller.js";
import { MaintenanceCoordinator } from "./maintenance-coordinator.service.js";

const envTokenPath = "AIROAMING_MAINTENANCE_TOKEN_FILE";

function request(remoteAddress = "127.0.0.1", token?: string) {
  return {
    socket: { remoteAddress },
    header: (name: string) => name === "X-AIRoaming-Maintenance-Token" ? token : undefined,
  };
}

describe("G3-M0 maintenance gate", () => {
  afterEach(() => {
    delete process.env[envTokenPath];
    delete process.env.AIROAMING_MAINTENANCE_MODE;
  });

  it("MNT-01 drains active mutations before close", async () => {
    const coordinator = new MaintenanceCoordinator();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const running = coordinator.runMutation("test", () => gate, "projects");
    await vi.waitFor(async () => expect((await coordinator.status()).activeMutations).toBe(1));
    const draining = coordinator.drain(500);
    await expect(coordinator.runMutation("new", () => undefined)).rejects.toMatchObject({ code: "MAINTENANCE_MODE" });
    release();
    await running;
    await draining;
    expect((await coordinator.close()).state).toBe("closed");
    expect((await coordinator.status()).activeMutations).toBe(0);
  });

  it("MNT-02 remains draining when an existing write cannot finish", async () => {
    const coordinator = new MaintenanceCoordinator();
    const pending = coordinator.runMutation("test", () => new Promise<void>(() => undefined), "projects");
    await expect(coordinator.drain(15)).rejects.toMatchObject({ code: "MAINTENANCE_DRAIN_TIMEOUT" });
    expect((await coordinator.status()).state).toBe("draining");
    expect((await coordinator.status()).activeMutations).toBe(1);
    void pending;
  });

  it("MNT-03 exposes all five required participants", async () => {
    const coordinator = new MaintenanceCoordinator();
    expect((await coordinator.status()).participants.map((item) => item.name)).toEqual([
      "dialogue", "projects", "settings", "tasks", "tool-callback",
    ]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const task = coordinator.runMutation("tasks.worker", () => gate, "tasks");
    const tool = coordinator.runMutation("tool.callback", () => gate, "tool-callback");
    const stream = coordinator.runStream("dialogue.stream", () => gate);
    await vi.waitFor(async () => {
      const current = await coordinator.status();
      expect(current.participants.find((item) => item.name === "dialogue")?.active).toBe(1);
      expect(current.participants.find((item) => item.name === "tasks")?.active).toBe(1);
      expect(current.participants.find((item) => item.name === "tool-callback")?.active).toBe(1);
    });
    release();
    await Promise.all([task, tool, stream]);
  });

  it("MNT-05 requires loopback and a 0600 token file", async () => {
    const tokenRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-maintenance-"));
    const tokenPath = path.join(tokenRoot, "token");
    await writeFile(tokenPath, "secret-token\n", { mode: 0o600 });
    await chmod(tokenPath, 0o600);
    process.env[envTokenPath] = tokenPath;
    const controller = new MaintenanceAdminController(new MaintenanceCoordinator());
    await expect(controller.status(request("10.0.0.2", "secret-token"))).rejects.toMatchObject({ code: "MAINTENANCE_LOOPBACK_REQUIRED" });
    await expect(controller.status(request("127.0.0.1", "wrong"))).rejects.toMatchObject({ code: "MAINTENANCE_TOKEN_INVALID" });
    expect((await controller.status(request("127.0.0.1", "secret-token"))).success).toBe(true);
  });

  it("MNT-07 exposes only an explicitly bound file runtime identity", async () => {
    const tokenRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-maintenance-identity-"));
    const tokenPath = path.join(tokenRoot, "token");
    await writeFile(tokenPath, "secret-token\n", { mode: 0o600 });
    const previous = {
      token: process.env[envTokenPath],
      workspace: process.env.AIROAMING_WORKSPACE_ROOT,
      release: process.env.AIROAMING_RELEASE_ROOT,
      commit: process.env.AIROAMING_APP_COMMIT,
      mode: process.env.AIROAMING_PERSISTENCE_MODE,
    };
    process.env[envTokenPath] = tokenPath;
    process.env.AIROAMING_WORKSPACE_ROOT = path.join(tokenRoot, "workspace");
    process.env.AIROAMING_RELEASE_ROOT = path.join(tokenRoot, "release");
    process.env.AIROAMING_APP_COMMIT = "a".repeat(40);
    process.env.AIROAMING_PERSISTENCE_MODE = "file";
    try {
      const controller = new MaintenanceAdminController(new MaintenanceCoordinator());
      await expect(controller.identity(request("127.0.0.1", "secret-token"))).resolves.toMatchObject({ success: true, data: { persistenceMode: "file", appCommit: "a".repeat(40) } });
      delete process.env.AIROAMING_PERSISTENCE_MODE;
      await expect(controller.identity(request("127.0.0.1", "secret-token"))).rejects.toMatchObject({ code: "MAINTENANCE_RUNTIME_IDENTITY_UNAVAILABLE" });
      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      await expect(controller.identity(request("127.0.0.1", "secret-token"))).rejects.toMatchObject({ code: "MAINTENANCE_RUNTIME_IDENTITY_UNAVAILABLE" });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        const envName = key === "token" ? envTokenPath : key === "workspace" ? "AIROAMING_WORKSPACE_ROOT" : key === "release" ? "AIROAMING_RELEASE_ROOT" : key === "commit" ? "AIROAMING_APP_COMMIT" : "AIROAMING_PERSISTENCE_MODE";
        if (value === undefined) delete process.env[envName]; else process.env[envName] = value;
      }
    }
  });

  it("MNT-06 emits a closed bundle skeleton without secrets", async () => {
    const coordinator = new MaintenanceCoordinator();
    await coordinator.drain();
    await coordinator.close();
    const bundle = await coordinator.createRuntimeBundle();
    expect(bundle.kind).toBe("airoaming_runtime_bundle_v1");
    expect(bundle.payloadDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(bundle.unobservableBeforeBridge.length).toBeGreaterThan(0);
    expect(JSON.stringify(bundle)).not.toContain("secret-token");
    expect(bundle.redaction.redactedCount).toBe(0);
  });
});
