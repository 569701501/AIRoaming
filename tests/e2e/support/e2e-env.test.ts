import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  cleanupE2EWorkspace,
  cleanupE2ERuntime,
  classifyE2ENetworkTarget,
  createE2EParentProcessEnvironment,
  createE2EProcessEnvironments,
  createE2ERuntime,
  getE2EProcessStatePath,
  prepareE2ERuntime,
  readE2EProcessStates,
  writeE2ESetupSummary,
  writeE2EProcessState,
} from "./e2e-env.ts";

describe("G0/G1 E2E environment guard", () => {
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

  test("ENV-01: creates three distinct run-bound roots under one marked test root", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "g1-three-roots");

    assert.equal(runtime.workspaceRoot, path.join(runtime.testRoot, "workspace"));
    assert.equal(runtime.dataRoot, path.join(runtime.testRoot, "data"));
    assert.equal(runtime.fakeSecretStoreRoot, path.join(runtime.testRoot, "fake-secret-store"));
    assert.equal(new Set([
      runtime.workspaceRoot,
      runtime.dataRoot,
      runtime.fakeSecretStoreRoot,
    ]).size, 3);

    await prepareE2ERuntime(runtime);
    await Promise.all([
      access(runtime.workspaceRoot),
      access(runtime.dataRoot),
      access(runtime.fakeSecretStoreRoot),
      access(path.join(runtime.testRoot, "home")),
      access(path.join(runtime.testRoot, "xdg-config")),
      access(path.join(runtime.testRoot, "xdg-cache")),
    ]);

    const fakeSecretPath = path.join(runtime.fakeSecretStoreRoot, "image-provider.secret");
    assert.equal(await readFile(fakeSecretPath, "utf8"), `airoaming-test-secret-${runtime.runId}`);

    const marker = JSON.parse(await readFile(runtime.markerPath, "utf8")) as Record<string, unknown>;
    assert.equal(marker.kind, "airoaming-e2e-root");
    assert.equal(marker.runId, runtime.runId);
    assert.equal(marker.testRoot, runtime.testRoot);
    assert.equal(marker.workspaceRoot, runtime.workspaceRoot);
    assert.equal(marker.dataRoot, runtime.dataRoot);
    assert.equal(marker.fakeSecretStoreRoot, runtime.fakeSecretStoreRoot);
  });

  test("ENV-02: refuses dangerous root overrides before creating or deleting anything", () => {
    const env = {
      AIROAMING_E2E_RUN_ID: "g1-dangerous-owned-roots",
      AIROAMING_E2E_SERVER_PORT: "24111",
      AIROAMING_E2E_WEB_PORT: "25111",
      AIROAMING_E2E_PROVIDER_PORT: "26111",
    };

    assert.throws(
      () => createE2ERuntime({ repoRoot, tempRoot: safeTempRoot, dataRoot: homedir(), env }),
      /E2E_DATA_ROOT_NAME_MISMATCH/,
    );
    assert.throws(
      () => createE2ERuntime({
        repoRoot,
        tempRoot: safeTempRoot,
        fakeSecretStoreRoot: path.join(repoRoot, "workspace"),
        env,
      }),
      /E2E_FAKE_SECRET_STORE_ROOT_NAME_MISMATCH/,
    );
    assert.throws(
      () => createE2ERuntime({ repoRoot, tempRoot: homedir(), env }),
      /E2E_TEMP_ROOT_DANGEROUS/,
    );
  });

  test("ENV-02: canonical temp roots allow benign aliases but reject aliases into protected roots", async () => {
    const protectedDataRoot = path.join(sandboxRoot, "protected-data-root");
    const workspaceEvidencePath = path.join(repoRoot, "workspace", "must-survive.txt");
    const dataEvidencePath = path.join(protectedDataRoot, "must-survive.sqlite");
    await mkdir(protectedDataRoot, { recursive: true });
    await writeFile(workspaceEvidencePath, "workspace-evidence", "utf8");
    await writeFile(dataEvidencePath, "data-evidence", "utf8");
    const evidenceBefore = await Promise.all([
      fileEvidence(workspaceEvidencePath),
      fileEvidence(dataEvidencePath),
    ]);

    const benignAlias = path.join(sandboxRoot, "benign-temp-alias");
    await symlink(safeTempRoot, benignAlias);
    const benignRuntime = createSafeRuntime(repoRoot, benignAlias, "canonical-benign-alias");
    assert.equal(
      path.dirname(benignRuntime.testRoot),
      await realpath(safeTempRoot),
      "macOS /var-style aliases must canonicalize to their safe target",
    );
    await prepareE2ERuntime(benignRuntime);
    await cleanupE2ERuntime(benignRuntime);

    const cases = [
      {
        suffix: "canonical-protected-workspace",
        target: path.join(repoRoot, "workspace"),
        protectedDataRoot,
      },
      {
        suffix: "canonical-protected-data",
        target: protectedDataRoot,
        protectedDataRoot,
      },
      {
        suffix: "canonical-home",
        target: homedir(),
        protectedDataRoot,
      },
    ] as const;
    for (const item of cases) {
      const alias = path.join(sandboxRoot, `${item.suffix}-alias`);
      await symlink(item.target, alias);
      const runId = `g1-${item.suffix}`;
      const env = {
        AIROAMING_E2E_RUN_ID: runId,
        AIROAMING_E2E_SERVER_PORT: "24111",
        AIROAMING_E2E_WEB_PORT: "25111",
        AIROAMING_E2E_PROVIDER_PORT: "26111",
        AIROAMING_DATA_ROOT: item.protectedDataRoot,
      };
      assert.throws(
        () => createE2ERuntime({ repoRoot, tempRoot: alias, env }),
        /E2E_TEMP_ROOT_DANGEROUS/,
      );
      await assert.rejects(access(path.join(item.target, `airoaming-e2e-${runId}`)));
    }

    const safeRuntime = createE2ERuntime({
      repoRoot,
      tempRoot: safeTempRoot,
      env: {
        AIROAMING_E2E_RUN_ID: "g1-canonical-forged-prepare",
        AIROAMING_E2E_SERVER_PORT: "24111",
        AIROAMING_E2E_WEB_PORT: "25111",
        AIROAMING_E2E_PROVIDER_PORT: "26111",
        AIROAMING_DATA_ROOT: protectedDataRoot,
      },
    });
    for (const [label, target] of [
      ["workspace", path.join(repoRoot, "workspace")],
      ["data", protectedDataRoot],
      ["home", homedir()],
    ] as const) {
      const forgedAlias = path.join(sandboxRoot, `forged-${label}-prepare-alias`);
      await symlink(target, forgedAlias);
      const forgedTestRoot = path.join(forgedAlias, `airoaming-e2e-${safeRuntime.runId}`);
      const forgedRuntime = {
        ...safeRuntime,
        testRoot: forgedTestRoot,
        workspaceRoot: path.join(forgedTestRoot, "workspace"),
        dataRoot: path.join(forgedTestRoot, "data"),
        fakeSecretStoreRoot: path.join(forgedTestRoot, "fake-secret-store"),
        markerPath: path.join(forgedTestRoot, ".airoaming-test-root"),
      };
      await assert.rejects(
        prepareE2ERuntime(forgedRuntime),
        /E2E_TEMP_ROOT_(CANONICAL_MISMATCH|DANGEROUS)/,
      );
      await assert.rejects(access(forgedTestRoot));
    }
    assert.deepEqual(await Promise.all([
      fileEvidence(workspaceEvidencePath),
      fileEvidence(dataEvidencePath),
    ]), evidenceBefore);
  });

  test("ENV-02: a run-owned HOME cannot make the real account home pass the temp-root guard", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "stable-account-home");
    await prepareE2ERuntime(runtime);
    const previousHome = process.env.HOME;
    process.env.HOME = path.join(runtime.testRoot, "home");
    try {
      assert.throws(
        () => createE2ERuntime({
          repoRoot,
          tempRoot: userInfo().homedir,
          env: {
            AIROAMING_E2E_RUN_ID: "g1-real-account-home-rejected",
            AIROAMING_E2E_SERVER_PORT: "24111",
            AIROAMING_E2E_WEB_PORT: "25111",
            AIROAMING_E2E_PROVIDER_PORT: "26111",
          },
        }),
        /E2E_TEMP_ROOT_DANGEROUS/,
      );
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await cleanupE2ERuntime(runtime);
    }
  });

  test("ENV-02: cleanup rechecks a swapped canonical temp parent before workspace/runtime removal", async () => {
    for (const cleanupKind of ["workspace", "runtime"] as const) {
      const runtime = createSafeRuntime(repoRoot, safeTempRoot, `temp-parent-swap-${cleanupKind}`);
      await prepareE2ERuntime(runtime);
      const legalMarker = await readFile(runtime.markerPath, "utf8");
      const parkedTempRoot = `${safeTempRoot}-parked-${cleanupKind}`;
      const protectedTarget = path.join(sandboxRoot, `protected-temp-target-${cleanupKind}`);
      const forgedTestRoot = path.join(protectedTarget, path.basename(runtime.testRoot));
      const evidencePath = path.join(forgedTestRoot, "workspace", "must-survive.txt");

      await rename(safeTempRoot, parkedTempRoot);
      await mkdir(path.join(forgedTestRoot, "workspace"), { recursive: true });
      await mkdir(path.join(forgedTestRoot, "data", "db"), { recursive: true });
      await mkdir(path.join(forgedTestRoot, "fake-secret-store"), { recursive: true });
      await writeFile(path.join(forgedTestRoot, ".airoaming-test-root"), legalMarker);
      await writeFile(evidencePath, `protected-${cleanupKind}`, "utf8");
      const before = await fileEvidence(evidencePath);
      await symlink(protectedTarget, safeTempRoot);

      if (cleanupKind === "workspace") {
        await assert.rejects(cleanupE2EWorkspace(runtime), /E2E_TEMP_ROOT_CANONICAL_MISMATCH/);
      } else {
        await assert.rejects(cleanupE2ERuntime(runtime), /E2E_TEMP_ROOT_CANONICAL_MISMATCH/);
      }
      assert.deepEqual(await fileEvidence(evidencePath), before);

      await rm(safeTempRoot, { force: true });
      await rename(parkedTempRoot, safeTempRoot);
      await cleanupE2ERuntime(runtime);
      await rm(protectedTarget, { recursive: true, force: true });
    }
  });

  test("ENV-02: runtime-state parent swaps are fenced in prepare, state operations and cleanup", async () => {
    for (const ancestorKind of ["runtimeRoot", "testsRoot"] as const) {
      const runtime = createSafeRuntime(repoRoot, safeTempRoot, `runtime-parent-swap-${ancestorKind}`);
      await prepareE2ERuntime(runtime);
      const legalState = await readFile(runtime.statePath, "utf8");
      const swappedRoot = ancestorKind === "runtimeRoot"
        ? path.dirname(runtime.runtimeDir)
        : path.join(runtime.repoRoot, "tests");
      const parkedRoot = `${swappedRoot}-parked-${runtime.runId}`;
      const protectedTarget = path.join(sandboxRoot, `protected-runtime-target-${ancestorKind}`);
      const forgedRuntimeRoot = ancestorKind === "runtimeRoot"
        ? protectedTarget
        : path.join(protectedTarget, ".runtime");
      const forgedRuntimeDir = path.join(forgedRuntimeRoot, runtime.runId);
      const evidencePath = path.join(protectedTarget, "must-survive.txt");

      await rename(swappedRoot, parkedRoot);
      await mkdir(forgedRuntimeDir, { recursive: true });
      await writeFile(path.join(forgedRuntimeDir, "run.json"), legalState);
      await writeFile(evidencePath, `protected-${ancestorKind}`, "utf8");
      const before = await fileEvidence(evidencePath);
      await symlink(protectedTarget, swappedRoot);

      await assert.rejects(prepareE2ERuntime(runtime), /E2E_RUNTIME_ROOT_CANONICAL_MISMATCH/);
      await assert.rejects(readE2EProcessStates(runtime), /E2E_RUNTIME_ROOT_CANONICAL_MISMATCH/);
      await assert.rejects(writeE2EProcessState(runtime, {
        role: "server",
        pid: 41_001,
        port: runtime.serverPort,
        status: "ready",
      }), /E2E_RUNTIME_ROOT_CANONICAL_MISMATCH/);
      await assert.rejects(cleanupE2ERuntime(runtime), /E2E_RUNTIME_ROOT_CANONICAL_MISMATCH/);
      assert.deepEqual(await fileEvidence(evidencePath), before);

      await rm(swappedRoot, { force: true });
      await rename(parkedRoot, swappedRoot);
      await cleanupE2ERuntime(runtime);
      await rm(protectedTarget, { recursive: true, force: true });
    }
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

  test("ENV-02: every marker identity field is independently fenced before cleanup", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "marker-mismatch");
    await prepareE2ERuntime(runtime);
    const workspaceSentinel = path.join(runtime.workspaceRoot, "must-survive.txt");
    const dataSentinel = path.join(runtime.dataRoot, "must-survive.db");
    const secretSentinel = path.join(runtime.fakeSecretStoreRoot, "must-survive.secret");
    await Promise.all([
      writeFile(workspaceSentinel, "user-data", "utf8"),
      writeFile(dataSentinel, "database-data", "utf8"),
      writeFile(secretSentinel, "fake-secret-data", "utf8"),
    ]);
    const legalMarker = JSON.parse(await readFile(runtime.markerPath, "utf8")) as Record<string, unknown>;
    const mutations = {
      runId: "another-run",
      testRoot: `${runtime.testRoot}-tampered`,
      workspaceRoot: `${runtime.workspaceRoot}-tampered`,
      dataRoot: `${runtime.dataRoot}-tampered`,
      fakeSecretStoreRoot: `${runtime.fakeSecretStoreRoot}-tampered`,
    } as const;
    for (const [field, value] of Object.entries(mutations)) {
      await writeFile(runtime.markerPath, `${JSON.stringify({ ...legalMarker, [field]: value }, null, 2)}\n`, "utf8");
      await assert.rejects(cleanupE2ERuntime(runtime), /E2E_MARKER_MISMATCH/);
      assert.equal(await readFile(workspaceSentinel, "utf8"), "user-data");
      assert.equal(await readFile(dataSentinel, "utf8"), "database-data");
      assert.equal(await readFile(secretSentinel, "utf8"), "fake-secret-data");
    }
  });

  test("refuses a symlinked workspace root", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "symlink-root");
    await prepareE2ERuntime(runtime);
    const target = path.join(sandboxRoot, "symlink-target");
    await mkdir(target, { recursive: true });
    await rm(runtime.workspaceRoot, { recursive: true });
    await symlink(target, runtime.workspaceRoot);

    await assert.rejects(prepareE2ERuntime(runtime), /E2E_WORKSPACE_SYMLINK/);
  });

  test("ENV-02: prepare rejects symlinks at testRoot and every owned child without touching targets", async () => {
    for (const rootKind of ["testRoot", "workspaceRoot", "dataRoot", "fakeSecretStoreRoot"] as const) {
      const runtime = createSafeRuntime(repoRoot, safeTempRoot, `prepare-symlink-${rootKind}`);
      const target = path.join(sandboxRoot, `prepare-target-${rootKind}`);
      const evidencePath = path.join(target, "must-survive.txt");
      await mkdir(target, { recursive: true });
      await writeFile(evidencePath, `prepare-${rootKind}`, "utf8");
      const before = await fileEvidence(evidencePath);

      if (rootKind === "testRoot") {
        await symlink(target, runtime.testRoot);
      } else {
        await prepareE2ERuntime(runtime);
        await rm(runtime[rootKind], { recursive: true });
        await symlink(target, runtime[rootKind]);
      }

      await assert.rejects(prepareE2ERuntime(runtime), /E2E_(TEST_ROOT|WORKSPACE|DATA_ROOT|FAKE_SECRET_STORE_ROOT|MARKER).*?(SYMLINK|MISMATCH)/);
      assert.deepEqual(await fileEvidence(evidencePath), before);
    }
  });

  test("ENV-02: cleanup rejects symlinks at testRoot and every owned child without touching targets", async () => {
    for (const rootKind of ["testRoot", "workspaceRoot", "dataRoot", "fakeSecretStoreRoot"] as const) {
      const runtime = createSafeRuntime(repoRoot, safeTempRoot, `cleanup-symlink-${rootKind}`);
      await prepareE2ERuntime(runtime);
      const target = path.join(sandboxRoot, `cleanup-target-${rootKind}`);
      const evidencePath = path.join(target, "must-survive.txt");
      await mkdir(target, { recursive: true });
      await writeFile(evidencePath, `cleanup-${rootKind}`, "utf8");
      const before = await fileEvidence(evidencePath);

      if (rootKind === "testRoot") {
        await rename(runtime.testRoot, `${runtime.testRoot}-parked`);
        await symlink(target, runtime.testRoot);
      } else {
        await rm(runtime[rootKind], { recursive: true });
        await symlink(target, runtime[rootKind]);
      }

      await assert.rejects(cleanupE2ERuntime(runtime), /E2E_MARKER_MISMATCH/);
      assert.deepEqual(await fileEvidence(evidencePath), before);
    }
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
      DATABASE_URL: "file:/real/user.sqlite",
      AIROAMING_PERSISTENCE_MODE: "db",
      AIROAMING_MAINTENANCE_MODE: "closed",
      HOME: "/Users/test/real-home",
      XDG_CONFIG_HOME: "/Users/test/real-xdg-config",
      XDG_CACHE_HOME: "/Users/test/real-xdg-cache",
      LC_FAKE_TOKEN: "must-not-leak",
      DOCKER_AUTH_CONFIG: "{\"auths\":{\"registry.example\":{\"auth\":\"real-credential\"}}}",
      NPM_CONFIG_USERCONFIG: "/Users/test/.npmrc-with-token",
      OPENCODE_AUTO_START: "true",
      AIROAMING_WORKSPACE_ROOT: path.join(repoRoot, "workspace"),
      PATH: "/safe/e2e/bin",
    });

    assert.equal(environments.server.PORT, String(runtime.serverPort));
    assert.equal(environments.server.AIROAMING_WORKSPACE_ROOT, runtime.workspaceRoot);
    assert.equal(environments.server.AIROAMING_DATA_ROOT, runtime.dataRoot);
    assert.equal(environments.server.AIROAMING_SECRET_STORE_ADAPTER, "fake");
    assert.equal(environments.server.AIROAMING_FAKE_SECRET_STORE_ROOT, runtime.fakeSecretStoreRoot);
    assert.equal(environments.server.DATABASE_URL, `file:${path.join(runtime.dataRoot, "db", "airoaming.sqlite")}`);
    assert.equal(environments.server.AIROAMING_PERSISTENCE_MODE, "file");
    assert.equal(environments.server.AIROAMING_MAINTENANCE_MODE, undefined);
    assert.equal(environments.server.OPENCODE_AUTO_START, "false");
    assert.equal(environments.server.OPENCODE_BASE_URL, runtime.opencodeBaseUrl);
    assert.equal(environments.server.OPENAI_IMAGE_BASE_URL, runtime.imageBaseUrl);
    assert.equal(environments.server.OPENAI_IMAGE_API_KEY, undefined);
    assert.equal(environments.server.GROK_IMAGE_API_KEY, undefined);
    assert.equal(environments.server.OPENAI_API_KEY, "");
    assert.equal(environments.server.XAI_API_KEY, "");
    assert.equal(
      environments.server.TSX_TSCONFIG_PATH,
      path.join(runtime.repoRoot, "tests", "e2e", "tsconfig.server.json"),
    );
    assert.equal(environments.server.SOME_SERVICE_TOKEN, undefined);
    assert.equal(environments.web.VITE_API_BASE_URL, runtime.apiBaseUrl);
    assert.equal(environments.provider.AIROAMING_E2E_RUN_ID, runtime.runId);
    assert.equal(environments.web.DATABASE_URL, undefined);
    assert.equal(environments.provider.DATABASE_URL, undefined);
    for (const environment of Object.values(environments)) {
      assert.equal(environment.PATH, "/safe/e2e/bin");
      assert.equal(environment.HOME, path.join(runtime.testRoot, "home"));
      assert.equal(environment.XDG_CONFIG_HOME, path.join(runtime.testRoot, "xdg-config"));
      assert.equal(environment.XDG_CACHE_HOME, path.join(runtime.testRoot, "xdg-cache"));
      assert.equal(environment.LC_FAKE_TOKEN, undefined);
      assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
      assert.equal(environment.OPENCODE_AUTH_JSON, undefined);
      assert.equal(environment.DOCKER_AUTH_CONFIG, undefined);
      assert.equal(environment.NPM_CONFIG_USERCONFIG, undefined);
    }

    const parentEnvironment = createE2EParentProcessEnvironment(runtime, {
      ...process.env,
      OPENCODE_AUTH_JSON: "real-opencode-auth",
      GOOGLE_APPLICATION_CREDENTIALS: "/real/gcloud.json",
      DOCKER_AUTH_CONFIG: "real-docker-auth",
      NPM_CONFIG_USERCONFIG: "/real/npmrc",
      SOME_SERVICE_TOKEN: "real-token",
      LC_FAKE_TOKEN: "real-lc-token",
      DATABASE_URL: "file:/real/user.sqlite",
      PATH: "/safe/e2e/bin",
    });
    assert.equal(parentEnvironment.DATABASE_URL, runtime.databaseUrl);
    assert.equal(parentEnvironment.AIROAMING_PERSISTENCE_MODE, "file");
    assert.equal(parentEnvironment.AIROAMING_MAINTENANCE_MODE, undefined);
    assert.equal(parentEnvironment.HOME, path.join(runtime.testRoot, "home"));
    assert.equal(parentEnvironment.XDG_CONFIG_HOME, path.join(runtime.testRoot, "xdg-config"));
    assert.equal(parentEnvironment.XDG_CACHE_HOME, path.join(runtime.testRoot, "xdg-cache"));
    assert.equal(parentEnvironment.LC_FAKE_TOKEN, undefined);
    assert.equal(parentEnvironment.OPENCODE_AUTH_JSON, undefined);
    assert.equal(parentEnvironment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
    assert.equal(parentEnvironment.DOCKER_AUTH_CONFIG, undefined);
    assert.equal(parentEnvironment.NPM_CONFIG_USERCONFIG, undefined);
    assert.equal(parentEnvironment.SOME_SERVICE_TOKEN, undefined);
  });

  test("ENV-03: keeps the unique secret sentinel only inside the fake store", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "sentinel-isolation");
    await prepareE2ERuntime(runtime);
    const sentinel = `airoaming-test-secret-${runtime.runId}`;
    const files = await listFiles(runtime.testRoot);
    const matchingFiles: string[] = [];
    for (const file of files) {
      if ((await readFile(file, "utf8")).includes(sentinel)) {
        matchingFiles.push(file);
      }
    }

    assert.deepEqual(matchingFiles, [path.join(runtime.fakeSecretStoreRoot, "image-provider.secret")]);
    const environments = createE2EProcessEnvironments(runtime, {
      OPENAI_IMAGE_API_KEY: "inherited-real-key",
      GROK_IMAGE_API_KEY: "inherited-real-key",
      PATH: "/safe/e2e/bin",
    });
    assert.equal(JSON.stringify(environments).includes(sentinel), false);
    assert.equal(environments.server.OPENAI_IMAGE_API_KEY, undefined);
    assert.equal(environments.server.GROK_IMAGE_API_KEY, undefined);
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

  test("ENV-02: setup summary refuses a symlink without touching its external target", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "setup-summary-symlink");
    await prepareE2ERuntime(runtime);
    const externalSentinel = path.join(sandboxRoot, "outside-setup-sentinel.txt");
    const setupPath = path.join(runtime.runtimeDir, "setup.json");
    await writeFile(externalSentinel, "outside-bytes-must-survive", "utf8");
    const before = await fileEvidence(externalSentinel);
    await symlink(externalSentinel, setupPath);

    await assert.rejects(
      writeE2ESetupSummary(runtime, createSetupSummary(runtime, "first")),
      /E2E_SETUP_SUMMARY_SYMLINK/,
    );

    assert.deepEqual(await fileEvidence(externalSentinel), before);
    assert.deepEqual(await setupTemporaryEntries(runtime.runtimeDir), []);
  });

  test("writes and safely replaces setup summary without temporary residue", async () => {
    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "setup-summary-replace");
    await prepareE2ERuntime(runtime);
    const setupPath = path.join(runtime.runtimeDir, "setup.json");
    const first = createSetupSummary(runtime, "first");
    const second = createSetupSummary(runtime, "second");

    await writeE2ESetupSummary(runtime, first);
    assert.deepEqual(JSON.parse(await readFile(setupPath, "utf8")), first);
    await writeE2ESetupSummary(runtime, second);
    assert.deepEqual(JSON.parse(await readFile(setupPath, "utf8")), second);
    const setupStat = await lstat(setupPath);
    assert.equal(setupStat.isFile(), true);
    assert.equal(setupStat.isSymbolicLink(), false);
    assert.deepEqual(await setupTemporaryEntries(runtime.runtimeDir), []);
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

    await assert.rejects(access(runtime.testRoot));
    await assert.rejects(access(runtime.workspaceRoot));
    await assert.rejects(access(runtime.dataRoot));
    await assert.rejects(access(runtime.fakeSecretStoreRoot));
    await assert.rejects(access(runtime.runtimeDir));
  });

  test("ENV-04: prepare and cleanup leave protected workspace, data and settings bytes/mtime unchanged", async () => {
    const protectedWorkspace = path.join(sandboxRoot, "protected-workspace");
    const protectedDataRoot = path.join(sandboxRoot, "protected-data");
    const settingsPath = path.join(protectedWorkspace, "settings", "app-settings.json");
    const databasePath = path.join(protectedDataRoot, "db", "airoaming.sqlite");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await mkdir(path.dirname(databasePath), { recursive: true });
    await writeFile(settingsPath, "{\"mustSurvive\":true}\n", "utf8");
    await writeFile(databasePath, "protected-db-bytes", "utf8");
    const before = await Promise.all([fileEvidence(settingsPath), fileEvidence(databasePath)]);

    const runtime = createSafeRuntime(repoRoot, safeTempRoot, "protected-roots");
    await prepareE2ERuntime(runtime);
    await cleanupE2ERuntime(runtime);

    const after = await Promise.all([fileEvidence(settingsPath), fileEvidence(databasePath)]);
    assert.deepEqual(after, before);
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

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(target));
    } else if (entry.isFile()) {
      files.push(target);
    }
  }
  return files.sort();
}

async function fileEvidence(target: string) {
  const [bytes, metadata] = await Promise.all([readFile(target), stat(target)]);
  return {
    bytes: bytes.toString("base64"),
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
  };
}

function createSetupSummary(
  runtime: ReturnType<typeof createE2ERuntime>,
  label: string,
) {
  return {
    schemaVersion: 1 as const,
    kind: "airoaming-e2e-setup" as const,
    runId: runtime.runId,
    ports: {
      server: runtime.serverPort,
      web: runtime.webPort,
      provider: runtime.providerPort,
    },
    checks: [{ label, status: 200 }],
    readyRoles: ["provider", "server", "web"] as const,
    createdAt: `2026-07-11T00:00:0${label === "first" ? "1" : "2"}.000Z`,
  };
}

async function setupTemporaryEntries(runtimeDir: string): Promise<string[]> {
  return (await readdir(runtimeDir))
    .filter((entry) => entry.startsWith(".setup.json.") && entry.endsWith(".tmp"))
    .sort();
}
