import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  cleanupE2EWorkspace,
  cleanupE2ERuntime,
  classifyE2ENetworkTarget,
  createE2EProcessEnvironments,
  createE2ERuntime,
  getE2EProcessStatePath,
  prepareE2ERuntime,
  readE2EProcessStates,
  writeE2EProcessState,
} from "./e2e-env.ts";

describe("G0 E2E environment guard", () => {
  let sandboxRoot: string;
  let repoRoot: string;
  let safeTempRoot: string;

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), "airoaming-e2e-env-test-"));
    repoRoot = path.join(sandboxRoot, "repo");
    safeTempRoot = path.join(sandboxRoot, "tmp");
    await mkdir(path.join(repoRoot, "workspace"), { recursive: true });
    await mkdir(safeTempRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  test("refuses repository, default workspace, home and filesystem root", () => {
    const dangerousRoots = [
      repoRoot,
      path.join(repoRoot, "workspace"),
      homedir(),
      path.parse(homedir()).root,
    ];

    for (const workspaceRoot of dangerousRoots) {
      assert.throws(
        () => createE2ERuntime({
          repoRoot,
          tempRoot: safeTempRoot,
          workspaceRoot,
          env: {
            AIROAMING_E2E_RUN_ID: "guard-dangerous-root",
            AIROAMING_E2E_SERVER_PORT: "24111",
            AIROAMING_E2E_WEB_PORT: "25111",
            AIROAMING_E2E_PROVIDER_PORT: "26111",
          },
        }),
        /E2E_WORKSPACE_(DANGEROUS|NAME_MISMATCH)/,
      );
    }
  });

  test("creates a run-bound marker and only removes the matching workspace", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "marker-success");
    await prepareE2ERuntime(runtime);

    const marker = JSON.parse(await readFile(runtime.markerPath, "utf8")) as Record<string, unknown>;
    assert.equal(marker.kind, "airoaming-e2e-root");
    assert.equal(marker.runId, runtime.runId);
    assert.equal(marker.workspaceRoot, runtime.workspaceRoot);

    await cleanupE2EWorkspace(runtime);
    await assert.rejects(access(runtime.workspaceRoot));
  });

  test("refuses cleanup when marker content does not match and preserves user data", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "marker-mismatch");
    await prepareE2ERuntime(runtime);
    const sentinelPath = path.join(runtime.workspaceRoot, "must-survive.txt");
    await writeFile(sentinelPath, "user-data", "utf8");
    await writeFile(runtime.markerPath, JSON.stringify({
      kind: "airoaming-e2e-root",
      runId: "another-run",
      workspaceRoot: runtime.workspaceRoot,
    }), "utf8");

    await assert.rejects(cleanupE2EWorkspace(runtime), /E2E_MARKER_MISMATCH/);
    assert.equal(await readFile(sentinelPath, "utf8"), "user-data");
  });

  test("refuses a symlinked workspace root", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "symlink-root");
    const target = path.join(sandboxRoot, "symlink-target");
    await mkdir(target, { recursive: true });
    await symlink(target, runtime.workspaceRoot);

    await assert.rejects(prepareE2ERuntime(runtime), /E2E_WORKSPACE_SYMLINK/);
  });

  test("builds loopback-only child environments without inherited real keys", () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "safe-child-env");
    const environments = createE2EProcessEnvironments(runtime, {
      ...process.env,
      OPENAI_API_KEY: "must-not-leak",
      OPENAI_IMAGE_API_KEY: "must-not-leak",
      GROK_IMAGE_API_KEY: "must-not-leak",
      XAI_API_KEY: "must-not-leak",
      SOME_SERVICE_TOKEN: "must-not-leak",
      GOOGLE_APPLICATION_CREDENTIALS: "/Users/test/.config/gcloud/application_default_credentials.json",
      OPENCODE_AUTH_JSON: "{\"provider\":\"real-credential\"}",
      DOCKER_AUTH_CONFIG: "{\"auths\":{\"registry.example\":{\"auth\":\"real-credential\"}}}",
      NPM_CONFIG_USERCONFIG: "/Users/test/.npmrc-with-token",
      OPENCODE_AUTO_START: "true",
      AIROAMING_WORKSPACE_ROOT: path.join(repoRoot, "workspace"),
      PATH: "/safe/e2e/bin",
    });

    assert.equal(environments.server.PORT, String(runtime.serverPort));
    assert.equal(environments.server.AIROAMING_WORKSPACE_ROOT, runtime.workspaceRoot);
    assert.equal(environments.server.OPENCODE_AUTO_START, "false");
    assert.equal(environments.server.OPENCODE_BASE_URL, runtime.opencodeBaseUrl);
    assert.equal(environments.server.OPENAI_IMAGE_BASE_URL, runtime.imageBaseUrl);
    assert.equal(environments.server.OPENAI_IMAGE_API_KEY, "e2e-fake-key");
    assert.equal(environments.server.OPENAI_API_KEY, "");
    assert.equal(environments.server.XAI_API_KEY, "");
    assert.equal(
      environments.server.TSX_TSCONFIG_PATH,
      path.join(runtime.repoRoot, "tests", "e2e", "tsconfig.server.json"),
    );
    assert.equal(environments.server.SOME_SERVICE_TOKEN, undefined);
    assert.equal(environments.web.VITE_API_BASE_URL, runtime.apiBaseUrl);
    assert.equal(environments.provider.AIROAMING_E2E_RUN_ID, runtime.runId);
    for (const environment of Object.values(environments)) {
      assert.equal(environment.PATH, "/safe/e2e/bin");
      assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
      assert.equal(environment.OPENCODE_AUTH_JSON, undefined);
      assert.equal(environment.DOCKER_AUTH_CONFIG, undefined);
      assert.equal(environment.NPM_CONFIG_USERCONFIG, undefined);
    }
  });

  test("allows only this run's loopback origins and classifies decorative CDN attempts as blocked", () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "network-audit");

    assert.equal(classifyE2ENetworkTarget(runtime, `${runtime.webUrl}/projects`).decision, "allow_loopback");
    assert.equal(classifyE2ENetworkTarget(runtime, `${runtime.serverUrl}/api/health`).decision, "allow_loopback");
    assert.equal(classifyE2ENetworkTarget(runtime, `${runtime.providerUrl}/opencode/config`).decision, "allow_loopback");
    assert.equal(classifyE2ENetworkTarget(runtime, `ws://127.0.0.1:${runtime.webPort}/`).decision, "allow_loopback");
    assert.equal(classifyE2ENetworkTarget(runtime, "data:image/png;base64,AA==").decision, "allow_non_network");
    assert.equal(classifyE2ENetworkTarget(runtime, "blob:http://127.0.0.1/example").decision, "allow_non_network");

    const diceBear = classifyE2ENetworkTarget(runtime, "https://api.dicebear.com/9.x/bottts/svg");
    const unsplash = classifyE2ENetworkTarget(runtime, "https://images.unsplash.com/photo.jpg");
    assert.deepEqual(diceBear, {
      decision: "block_external",
      origin: "https://api.dicebear.com",
      url: "https://api.dicebear.com/9.x/bottts/svg",
    });
    assert.equal(unsplash.decision, "block_external");
    assert.equal(
      classifyE2ENetworkTarget(runtime, `http://127.0.0.1.evil.example:${runtime.serverPort}/api`).decision,
      "block_external",
    );
  });

  test("keeps run and process state inside the current run directory", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "isolated-state");
    await prepareE2ERuntime(runtime);
    const runState = JSON.parse(await readFile(runtime.statePath, "utf8")) as Record<string, unknown>;
    assert.equal(runState.kind, "airoaming-e2e-run");
    assert.equal(runState.runId, runtime.runId);
    assert.equal(runState.runtimeDir, runtime.runtimeDir);

    await writeE2EProcessState(runtime, {
      role: "server",
      pid: 41_001,
      port: runtime.serverPort,
      status: "ready",
    });
    const states = await readE2EProcessStates(runtime);
    assert.deepEqual(states.map(({ role, pid, port, status }) => ({ role, pid, port, status })), [{
      role: "server",
      pid: 41_001,
      port: runtime.serverPort,
      status: "ready",
    }]);

    const processStatePath = getE2EProcessStatePath(runtime, "server");
    await writeFile(processStatePath, JSON.stringify({
      ...states[0],
      runId: "tampered-run",
    }), "utf8");
    await assert.rejects(readE2EProcessStates(runtime), /E2E_PROCESS_STATE_MISMATCH/);
  });

  test("refuses an out-of-run state directory", () => {
    assert.throws(
      () => createE2ERuntime({
        repoRoot,
        tempRoot: safeTempRoot,
        runtimeDir: path.join(sandboxRoot, "unowned-runtime"),
        env: {
          AIROAMING_E2E_RUN_ID: "g0-runtime-danger",
          AIROAMING_E2E_SERVER_PORT: "24111",
          AIROAMING_E2E_WEB_PORT: "25111",
          AIROAMING_E2E_PROVIDER_PORT: "26111",
        },
      }),
      /E2E_RUNTIME_DIR_DANGEROUS/,
    );
  });

  test("cleans both run-owned directories after revalidating their markers", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "cleanup-runtime");
    await prepareE2ERuntime(runtime);
    await cleanupE2ERuntime(runtime);

    await assert.rejects(access(runtime.workspaceRoot));
    await assert.rejects(access(runtime.runtimeDir));
  });
});

function createSafeRuntime(repoRoot: string, tempRoot: string, suffix: string) {
  return createE2ERuntime({
    repoRoot,
    tempRoot,
    env: {
      AIROAMING_E2E_RUN_ID: `g0-${suffix}`,
      AIROAMING_E2E_SERVER_PORT: "24111",
      AIROAMING_E2E_WEB_PORT: "25111",
      AIROAMING_E2E_PROVIDER_PORT: "26111",
    },
  });
}
