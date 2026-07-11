import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  cleanupE2ERuntime,
  createE2EProcessEnvironments,
  createE2ERuntime,
  prepareE2ERuntime,
  terminateRecordedE2EProcesses,
  writeE2EProcessState,
} from "./e2e-env.ts";

describe("G0 E2E owned process cleanup", () => {
  test("refuses to kill an unrelated process even when a state file is tampered with its PID", async () => {
    const sandboxRoot = await mkdtemp(path.join(tmpdir(), "airoaming-e2e-process-test-"));
    const repoRoot = path.join(sandboxRoot, "repo");
    const tempRoot = path.join(sandboxRoot, "tmp");
    await mkdir(repoRoot, { recursive: true });
    await mkdir(tempRoot, { recursive: true });
    const runtime = createE2ERuntime({
      repoRoot,
      tempRoot,
      env: {
        AIROAMING_E2E_RUN_ID: "g0-process-identity",
        AIROAMING_E2E_SERVER_PORT: "24121",
        AIROAMING_E2E_WEB_PORT: "25121",
        AIROAMING_E2E_PROVIDER_PORT: "26121",
      },
    });
    await prepareE2ERuntime(runtime);

    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "unrelated-dev-service"], {
      stdio: "ignore",
    });
    try {
      assert.ok(unrelated.pid);
      await waitUntilRunning(unrelated);
      await writeE2EProcessState(runtime, {
        role: "server",
        pid: unrelated.pid,
        port: runtime.serverPort,
        status: "ready",
      });

      await assert.rejects(terminateRecordedE2EProcesses(runtime), /E2E_PROCESS_IDENTITY_MISMATCH/);
      assert.equal(isAlive(unrelated.pid), true);
    } finally {
      await stopProcess(unrelated);
      await cleanupE2ERuntime(runtime);
      await rm(sandboxRoot, { recursive: true, force: true });
    }
  });

  test("a web startup failure stops only this run's provider and removes owned directories", async () => {
    const runId = `g0-startup-failure-${process.pid}-${Date.now().toString(36)}`;
    const runtime = createE2ERuntime({
      repoRoot: process.cwd(),
      env: { AIROAMING_E2E_RUN_ID: runId },
    });
    const environments = createE2EProcessEnvironments(runtime);
    let provider: ChildProcess | undefined;
    let web: ChildProcess | undefined;
    let portOwner: Server | undefined;
    try {
      portOwner = createServer();
      await listen(portOwner, runtime.webPort);
      provider = spawn(process.execPath, [
        "--import",
        "tsx",
        "tests/e2e/support/fake-provider-server.mjs",
        "provider",
        "--run-id",
        runtime.runId,
      ], {
        cwd: runtime.repoRoot,
        env: environments.provider,
        stdio: "ignore",
      });
      await waitForHttp(`${runtime.providerUrl}/health`);

      web = spawn(process.execPath, [
        "--import",
        "tsx",
        "tests/e2e/support/start-e2e-server.mjs",
        "web",
        "--run-id",
        runtime.runId,
      ], {
        cwd: runtime.repoRoot,
        env: environments.web,
        stdio: "ignore",
      });
      const webExit = await waitForExit(web, 10_000);
      assert.notEqual(webExit.code, 0);
      await waitUntilDead(provider.pid!, 5_000);
      assert.equal(isAlive(provider.pid!), false);
      await assert.rejects(access(runtime.testRoot));
      await assert.rejects(access(runtime.workspaceRoot));
      await assert.rejects(access(runtime.dataRoot));
      await assert.rejects(access(runtime.fakeSecretStoreRoot));
      await assert.rejects(access(runtime.runtimeDir));
      assert.equal(portOwner.listening, true);
    } finally {
      await stopProcess(web);
      await stopProcess(provider);
      if (portOwner) {
        await closeServer(portOwner);
      }
      try {
        await cleanupE2ERuntime(runtime);
      } catch {
        // Safe cleanup intentionally refuses marker/state mismatches; preserve that evidence for diagnosis.
      }
    }
  });

  test("an abrupt service-process death cannot leave a child listener behind", async () => {
    const runId = `g0-abrupt-exit-${process.pid}-${Date.now().toString(36)}`;
    const runtime = createE2ERuntime({
      repoRoot: process.cwd(),
      env: { AIROAMING_E2E_RUN_ID: runId },
    });
    const environments = createE2EProcessEnvironments(runtime);
    const provider = spawn(process.execPath, [
      "--import",
      "tsx",
      "tests/e2e/support/fake-provider-server.mjs",
      "provider",
      "--run-id",
      runtime.runId,
    ], {
      cwd: runtime.repoRoot,
      env: environments.provider,
      stdio: "ignore",
    });
    try {
      await waitForHttp(`${runtime.providerUrl}/health`);
      const exited = waitForExit(provider, 5_000);
      provider.kill("SIGKILL");
      await exited;
      await waitForHttpFailure(`${runtime.providerUrl}/health`);
      assert.equal(isAlive(provider.pid!), false);
    } finally {
      await stopProcess(provider);
      await cleanupE2ERuntime(runtime);
    }
  });
});

async function waitUntilRunning(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null) {
      reject(new Error(`child exited early: ${child.exitCode}`));
      return;
    }
    const timeout = setTimeout(resolve, 50);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child?.pid || !isAlive(child.pid)) {
    return;
  }
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await exited;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The owned process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function waitForHttpFailure(url: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(150) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`listener survived process death: ${url}`);
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("child exit timeout")), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function waitUntilDead(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
