import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const LOOPBACK_HOST = "127.0.0.1";
const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;
const FAKE_SECRET_FILE_NAME = "image-provider.secret";
const SETUP_SUMMARY_FILE_NAME = "setup.json";
const ACCOUNT_HOME = realpathSync(userInfo().homedir);
const execFileAsync = promisify(execFile);

export interface E2ERuntime {
  readonly runId: string;
  readonly repoRoot: string;
  readonly testRoot: string;
  readonly workspaceRoot: string;
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly databaseUrl: string;
  readonly guardedDataRoot: string | null;
  readonly fakeSecretStoreRoot: string;
  readonly runtimeRoot: string;
  readonly runtimeDir: string;
  readonly markerPath: string;
  readonly statePath: string;
  readonly serverPort: number;
  readonly webPort: number;
  readonly providerPort: number;
  readonly serverUrl: string;
  readonly webUrl: string;
  readonly providerUrl: string;
  readonly apiBaseUrl: string;
  readonly opencodeBaseUrl: string;
  readonly imageBaseUrl: string;
}

export interface CreateE2ERuntimeOptions {
  readonly env?: Record<string, string | undefined>;
  readonly repoRoot?: string;
  readonly tempRoot?: string;
  readonly workspaceRoot?: string;
  readonly dataRoot?: string;
  readonly fakeSecretStoreRoot?: string;
  readonly runtimeDir?: string;
}

export interface E2EProcessEnvironments {
  readonly server: Record<string, string>;
  readonly web: Record<string, string>;
  readonly provider: Record<string, string>;
}

export type E2ENetworkDecision = "allow_loopback" | "allow_non_network" | "block_external" | "block_invalid";

export interface E2ENetworkTarget {
  readonly decision: E2ENetworkDecision;
  readonly origin: string;
  readonly url: string;
}

export type E2EProcessRole = "provider" | "server" | "web";
export type E2EProcessStatus = "starting" | "ready" | "stopping" | "stopped" | "failed";

export interface E2EProcessState {
  readonly schemaVersion: 1;
  readonly kind: "airoaming-e2e-process";
  readonly runId: string;
  readonly role: E2EProcessRole;
  readonly pid: number;
  readonly port: number;
  readonly status: E2EProcessStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface WriteE2EProcessStateInput {
  readonly role: E2EProcessRole;
  readonly pid: number;
  readonly port: number;
  readonly status: E2EProcessStatus;
}

export interface E2ESetupSummary {
  readonly schemaVersion: 1;
  readonly kind: "airoaming-e2e-setup";
  readonly runId: string;
  readonly ports: {
    readonly server: number;
    readonly web: number;
    readonly provider: number;
  };
  readonly checks: ReadonlyArray<{
    readonly label: string;
    readonly status: number;
  }>;
  readonly readyRoles: readonly E2EProcessRole[];
  readonly createdAt: string;
}

interface E2ERootMarker {
  readonly schemaVersion: 1;
  readonly kind: "airoaming-e2e-root";
  readonly runId: string;
  readonly testRoot: string;
  readonly workspaceRoot: string;
  readonly dataRoot: string;
  readonly fakeSecretStoreRoot: string;
  readonly createdAt: string;
}

interface E2ERunState {
  readonly schemaVersion: 1;
  readonly kind: "airoaming-e2e-run";
  readonly runId: string;
  readonly runtimeDir: string;
  readonly testRoot: string;
  readonly workspaceRoot: string;
  readonly dataRoot: string;
  readonly fakeSecretStoreRoot: string;
  readonly ports: {
    readonly server: number;
    readonly web: number;
    readonly provider: number;
  };
  readonly createdAt: string;
}

export function createE2ERuntime(options: CreateE2ERuntimeOptions = {}): E2ERuntime {
  const env = options.env ?? process.env;
  const repoRoot = canonicalizeExistingDirectory(
    options.repoRoot ?? env.AIROAMING_E2E_REPO_ROOT ?? process.cwd(),
    "E2E_REPO_ROOT_INVALID",
  );
  const runId = env.AIROAMING_E2E_RUN_ID ?? createRunId();
  assertRunId(runId);

  const canonicalTempRoot = canonicalizeExistingDirectory(
    options.tempRoot ?? tmpdir(),
    "E2E_TEMP_ROOT_INVALID",
  );
  const testRoot = path.join(canonicalTempRoot, `airoaming-e2e-${runId}`);
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? path.join(testRoot, "workspace"),
  );
  const dataRoot = path.resolve(options.dataRoot ?? path.join(testRoot, "data"));
  const databasePath = path.join(dataRoot, "db", "airoaming.sqlite");
  const guardedDataRoot = env.AIROAMING_DATA_ROOT
    ? canonicalizePotentialPath(env.AIROAMING_DATA_ROOT)
    : null;
  const fakeSecretStoreRoot = path.resolve(
    options.fakeSecretStoreRoot ?? path.join(testRoot, "fake-secret-store"),
  );
  assertSafeTestPaths({
    repoRoot,
    runId,
    testRoot,
    workspaceRoot,
    dataRoot,
    fakeSecretStoreRoot,
    protectedDataRoot: guardedDataRoot ?? undefined,
  });

  const defaultPorts = derivePorts(runId);
  const serverPort = parsePort(env.AIROAMING_E2E_SERVER_PORT, defaultPorts.server, "SERVER");
  const webPort = parsePort(env.AIROAMING_E2E_WEB_PORT, defaultPorts.web, "WEB");
  const providerPort = parsePort(env.AIROAMING_E2E_PROVIDER_PORT, defaultPorts.provider, "PROVIDER");
  if (new Set([serverPort, webPort, providerPort]).size !== 3) {
    throw new Error("E2E_PORTS_MUST_BE_DISTINCT");
  }

  const runtimeRoot = path.join(repoRoot, "tests", ".runtime");
  if (!samePath(canonicalizePotentialPath(runtimeRoot), runtimeRoot)) {
    throw new Error("E2E_RUNTIME_ROOT_CANONICAL_MISMATCH");
  }
  const expectedRuntimeDir = path.join(runtimeRoot, runId);
  const runtimeDir = path.resolve(options.runtimeDir ?? expectedRuntimeDir);
  if (runtimeDir !== expectedRuntimeDir) {
    throw new Error("E2E_RUNTIME_DIR_DANGEROUS");
  }
  const serverUrl = `http://${LOOPBACK_HOST}:${serverPort}`;
  const webUrl = `http://${LOOPBACK_HOST}:${webPort}`;
  const providerUrl = `http://${LOOPBACK_HOST}:${providerPort}`;

  return Object.freeze({
    runId,
    repoRoot,
    testRoot,
    workspaceRoot,
    dataRoot,
    databasePath,
    databaseUrl: `file:${databasePath}`,
    guardedDataRoot,
    fakeSecretStoreRoot,
    runtimeRoot,
    runtimeDir,
    markerPath: path.join(testRoot, ".airoaming-test-root"),
    statePath: path.join(runtimeDir, "run.json"),
    serverPort,
    webPort,
    providerPort,
    serverUrl,
    webUrl,
    providerUrl,
    apiBaseUrl: `${serverUrl}/api`,
    opencodeBaseUrl: `${providerUrl}/opencode`,
    imageBaseUrl: `${providerUrl}/image/v1`,
  });
}

export async function prepareE2ERuntime(runtime: E2ERuntime): Promise<void> {
  assertCanonicalRuntimeParent(runtime);
  assertCanonicalRuntimeStateParent(runtime);
  assertSafeTestPaths(runtime);
  const existingRoot = await tryLstat(runtime.testRoot);
  if (existingRoot?.isSymbolicLink()) {
    throw new Error("E2E_TEST_ROOT_SYMLINK");
  }
  if (existingRoot && !existingRoot.isDirectory()) {
    throw new Error("E2E_TEST_ROOT_NOT_DIRECTORY");
  }

  if (!existingRoot) {
    await mkdir(runtime.testRoot, { recursive: true });
  }

  const existingMarker = await tryLstat(runtime.markerPath);
  if (existingMarker) {
    await assertMatchingMarker(runtime, false, false);
  } else {
    const entries = await readdir(runtime.testRoot);
    if (entries.length === 1 && entries[0] === path.basename(runtime.markerPath)) {
      await assertMatchingMarker(runtime, false, false);
    } else if (entries.length > 0) {
      throw new Error("E2E_TEST_ROOT_UNMARKED");
    } else {
      const marker: E2ERootMarker = {
        schemaVersion: 1,
        kind: "airoaming-e2e-root",
        runId: runtime.runId,
        testRoot: runtime.testRoot,
        workspaceRoot: runtime.workspaceRoot,
        dataRoot: runtime.dataRoot,
        fakeSecretStoreRoot: runtime.fakeSecretStoreRoot,
        createdAt: new Date().toISOString(),
      };
      try {
        await writeFile(runtime.markerPath, `${JSON.stringify(marker, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw error;
        }
        await assertMatchingMarker(runtime, false, false);
      }
    }
  }

  await Promise.all([
    prepareOwnedDirectory(runtime.workspaceRoot, "E2E_WORKSPACE"),
    prepareOwnedDirectory(runtime.dataRoot, "E2E_DATA_ROOT"),
    prepareOwnedDirectory(runtime.fakeSecretStoreRoot, "E2E_FAKE_SECRET_STORE_ROOT"),
    prepareOwnedDirectory(path.join(runtime.testRoot, "home"), "E2E_HOME_ROOT"),
    prepareOwnedDirectory(path.join(runtime.testRoot, "xdg-config"), "E2E_XDG_CONFIG_ROOT"),
    prepareOwnedDirectory(path.join(runtime.testRoot, "xdg-cache"), "E2E_XDG_CACHE_ROOT"),
  ]);
  await prepareOwnedDirectory(path.dirname(runtime.databasePath), "E2E_DATABASE_DIR");
  await assertMatchingMarker(runtime);
  await prepareFakeSecretStore(runtime);
  await prepareRunState(runtime);
}

export async function cleanupE2EWorkspace(runtime: E2ERuntime): Promise<void> {
  assertCanonicalRuntimeParent(runtime);
  assertSafeTestPaths(runtime);
  const rootStat = await tryLstat(runtime.workspaceRoot);
  if (!rootStat) {
    return;
  }
  await assertMatchingMarker(runtime, true);
  // Re-read immediately before deletion so a stale earlier validation cannot authorize cleanup.
  await assertMatchingMarker(runtime, true);
  assertCanonicalRuntimeParent(runtime);
  await rm(runtime.workspaceRoot, { recursive: true, force: false });
}

export async function cleanupE2ERuntime(runtime: E2ERuntime): Promise<void> {
  assertCanonicalRuntimeParent(runtime);
  assertCanonicalRuntimeStateParent(runtime);
  assertSafeTestPaths(runtime);
  const runtimeStat = await tryLstat(runtime.runtimeDir);
  if (runtimeStat) {
    await assertMatchingRunState(runtime);
  }
  const testRootStat = await tryLstat(runtime.testRoot);
  if (testRootStat) {
    await assertMatchingMarker(runtime, true, false);
    await assertOwnedRootsSafeForCleanup(runtime);
    // The marker and all owned path types are re-read immediately before recursive removal.
    await assertMatchingMarker(runtime, true, false);
    await assertOwnedRootsSafeForCleanup(runtime);
    assertCanonicalRuntimeParent(runtime);
    await rm(runtime.testRoot, { recursive: true, force: false });
  }
  if (runtimeStat) {
    await assertMatchingRunState(runtime);
    await assertMatchingRunState(runtime);
    assertCanonicalRuntimeStateParent(runtime);
    await rm(runtime.runtimeDir, { recursive: true, force: false });
  }
}

export function getE2EProcessStatePath(runtime: E2ERuntime, role: E2EProcessRole): string {
  return path.join(runtime.runtimeDir, `process-${role}.json`);
}

export async function writeE2EProcessState(
  runtime: E2ERuntime,
  input: WriteE2EProcessStateInput,
): Promise<void> {
  await assertMatchingRunState(runtime);
  if (!Number.isInteger(input.pid) || input.pid <= 0 || input.port !== expectedPort(runtime, input.role)) {
    throw new Error("E2E_PROCESS_STATE_MISMATCH");
  }

  const statePath = getE2EProcessStatePath(runtime, input.role);
  const previous = await readProcessStateFile(runtime, input.role, false);
  const now = new Date().toISOString();
  const state: E2EProcessState = {
    schemaVersion: 1,
    kind: "airoaming-e2e-process",
    runId: runtime.runId,
    role: input.role,
    pid: input.pid,
    port: input.port,
    status: input.status,
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  };
  const temporaryPath = `${statePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  assertCanonicalRuntimeStateParent(runtime);
  await assertMatchingRunState(runtime);
  await rename(temporaryPath, statePath);
}

export async function writeE2ESetupSummary(
  runtime: E2ERuntime,
  summary: E2ESetupSummary,
): Promise<void> {
  assertMatchingSetupSummary(runtime, summary);
  assertCanonicalRuntimeStateParent(runtime);
  await assertMatchingRunState(runtime);

  const setupPath = path.join(runtime.runtimeDir, SETUP_SUMMARY_FILE_NAME);
  await assertSafeSetupSummaryTarget(setupPath);
  const temporaryPath = path.join(
    runtime.runtimeDir,
    `.setup.json.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  let ownsTemporaryFile = false;

  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    ownsTemporaryFile = true;
    try {
      await handle.writeFile(serialized, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }

    assertCanonicalRuntimeStateParent(runtime);
    await assertMatchingRunState(runtime);
    await assertSafeSetupSummaryTarget(setupPath);
    await assertOwnedSetupSummaryTemporary(runtime, temporaryPath);
    await rename(temporaryPath, setupPath);
    ownsTemporaryFile = false;

    assertCanonicalRuntimeStateParent(runtime);
    await assertMatchingRunState(runtime);
    await assertSafeSetupSummaryTarget(setupPath, true);
  } catch (error) {
    if (ownsTemporaryFile) {
      try {
        assertCanonicalRuntimeStateParent(runtime);
        await assertMatchingRunState(runtime);
        await removeOwnedSetupSummaryTemporary(runtime, temporaryPath);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "E2E_SETUP_SUMMARY_WRITE_AND_CLEANUP_FAILED",
        );
      }
    }
    throw error;
  }
}

export async function readE2EProcessStates(runtime: E2ERuntime): Promise<E2EProcessState[]> {
  await assertMatchingRunState(runtime);
  const states: E2EProcessState[] = [];
  for (const role of ["provider", "server", "web"] as const) {
    const state = await readProcessStateFile(runtime, role, false);
    if (state) {
      states.push(state);
    }
  }
  return states;
}

export async function terminateRecordedE2EProcesses(
  runtime: E2ERuntime,
  options: { readonly excludePids?: ReadonlySet<number> } = {},
): Promise<void> {
  const states = await readE2EProcessStates(runtime);
  const errors: Error[] = [];
  for (const state of states) {
    if (options.excludePids?.has(state.pid) || !isProcessAlive(state.pid)) {
      continue;
    }
    try {
      await assertOwnedProcessIdentity(runtime, state);
      if (!signalProcess(state.pid, "SIGTERM")) {
        continue;
      }
      await waitForProcessExit(state.pid, 2_000);
      if (isProcessAlive(state.pid)) {
        await assertOwnedProcessIdentity(runtime, state);
        if (!signalProcess(state.pid, "SIGKILL")) {
          continue;
        }
        await waitForProcessExit(state.pid, 1_000);
      }
      if (isProcessAlive(state.pid)) {
        throw new Error(`E2E_PROCESS_DID_NOT_EXIT:${state.role}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, errors.map((error) => error.message).join(","));
  }
}

export async function recoverE2EStartupFailure(runtime: E2ERuntime, currentPid: number): Promise<void> {
  await terminateRecordedE2EProcesses(runtime, { excludePids: new Set([currentPid]) });
  await cleanupE2ERuntime(runtime);
}

export function createE2EProcessEnvironments(
  runtime: E2ERuntime,
  inherited: NodeJS.ProcessEnv = process.env,
): E2EProcessEnvironments {
  const common = createCommonE2EEnvironment(runtime, inherited);
  const persistenceMode = inherited.AIROAMING_E2E_PERSISTENCE_MODE === "db" ? "db" : "file";

  return Object.freeze({
    server: {
      ...common,
      AIROAMING_E2E_ROLE: "server",
      AIROAMING_WORKSPACE_ROOT: runtime.workspaceRoot,
      AIROAMING_DATA_ROOT: runtime.dataRoot,
      AIROAMING_SECRET_STORE_ADAPTER: "fake",
      AIROAMING_FAKE_SECRET_STORE_ROOT: runtime.fakeSecretStoreRoot,
      DATABASE_URL: runtime.databaseUrl,
      AIROAMING_PERSISTENCE_MODE: persistenceMode,
      AIROAMING_TOOL_CALLBACK_BASE_URL: runtime.apiBaseUrl,
      AIROAMING_TOOL_CALLBACK_TOKEN: "",
      TSX_TSCONFIG_PATH: path.join(runtime.repoRoot, "tests", "e2e", "tsconfig.server.json"),
      PORT: String(runtime.serverPort),
      HOST: LOOPBACK_HOST,
      OPENCODE_HOST: LOOPBACK_HOST,
      OPENCODE_PORT: String(runtime.providerPort),
      OPENCODE_BASE_URL: runtime.opencodeBaseUrl,
      OPENCODE_AUTO_START: "false",
      OPENCODE_READY_TIMEOUT_MS: "2000",
      OPENAI_IMAGE_BASE_URL: runtime.imageBaseUrl,
      OPENAI_API_KEY: "",
      ARK_API_KEY: "",
      DOUBAO_API_KEY: "",
      GROK_IMAGE_BASE_URL: runtime.imageBaseUrl,
      XAI_IMAGE_BASE_URL: runtime.imageBaseUrl,
      XAI_API_KEY: "",
    },
    web: {
      ...common,
      AIROAMING_E2E_ROLE: "web",
      VITE_API_BASE_URL: runtime.apiBaseUrl,
    },
    provider: {
      ...common,
      AIROAMING_E2E_ROLE: "provider",
      HOST: LOOPBACK_HOST,
      PORT: String(runtime.providerPort),
    },
  });
}

export function createE2EParentProcessEnvironment(
  runtime: E2ERuntime,
  inherited: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return {
    ...createCommonE2EEnvironment(runtime, inherited),
    AIROAMING_WORKSPACE_ROOT: runtime.workspaceRoot,
    AIROAMING_DATA_ROOT: runtime.dataRoot,
    AIROAMING_SECRET_STORE_ADAPTER: "fake",
    AIROAMING_FAKE_SECRET_STORE_ROOT: runtime.fakeSecretStoreRoot,
    DATABASE_URL: runtime.databaseUrl,
    AIROAMING_PERSISTENCE_MODE: inherited.AIROAMING_E2E_PERSISTENCE_MODE === "db" ? "db" : "file",
    OPENCODE_AUTO_START: "false",
    OPENCODE_BASE_URL: runtime.opencodeBaseUrl,
    OPENAI_IMAGE_BASE_URL: runtime.imageBaseUrl,
    GROK_IMAGE_BASE_URL: runtime.imageBaseUrl,
    XAI_IMAGE_BASE_URL: runtime.imageBaseUrl,
    VITE_API_BASE_URL: runtime.apiBaseUrl,
  };
}

export function classifyE2ENetworkTarget(runtime: E2ERuntime, input: string): E2ENetworkTarget {
  let target: URL;
  try {
    target = new URL(input);
  } catch {
    return { decision: "block_invalid", origin: "invalid", url: input };
  }

  if (["about:", "blob:", "data:"].includes(target.protocol)) {
    return { decision: "allow_non_network", origin: target.protocol, url: input };
  }

  const normalizedProtocol = target.protocol === "ws:"
    ? "http:"
    : target.protocol === "wss:"
      ? "https:"
      : target.protocol;
  const normalizedOrigin = `${normalizedProtocol}//${target.host}`;
  const allowedOrigins = new Set([runtime.webUrl, runtime.serverUrl, runtime.providerUrl]);
  if (allowedOrigins.has(normalizedOrigin)) {
    return { decision: "allow_loopback", origin: target.origin, url: input };
  }

  return { decision: "block_external", origin: target.origin, url: input };
}

function createRunId(): string {
  return `g0-${process.pid}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("E2E_RUN_ID_INVALID");
  }
}

function assertSafeTestPaths(input: {
  repoRoot: string;
  runId: string;
  testRoot: string;
  workspaceRoot: string;
  dataRoot: string;
  fakeSecretStoreRoot: string;
  protectedDataRoot?: string;
  guardedDataRoot?: string | null;
}): void {
  const filesystemRoot = path.parse(input.testRoot).root;
  const userHome = ACCOUNT_HOME;
  const canonicalRepoRoot = canonicalizePotentialPath(input.repoRoot);
  const defaultWorkspace = canonicalizePotentialPath(path.join(canonicalRepoRoot, "workspace"));
  const protectedDataInput = input.protectedDataRoot ?? input.guardedDataRoot;
  const protectedDataRoot = protectedDataInput
    ? canonicalizePotentialPath(protectedDataInput)
    : null;
  const dangerousRoots = [userHome, canonicalRepoRoot, defaultWorkspace]
    .concat(protectedDataRoot ? [protectedDataRoot] : []);
  const canonicalTestRoot = canonicalizePotentialPath(input.testRoot);

  if (
    path.dirname(canonicalTestRoot) === filesystemRoot
    || dangerousRoots.some((candidate) => (
      samePath(candidate, canonicalTestRoot) || isPathInside(candidate, canonicalTestRoot)
    ))
  ) {
    throw new Error("E2E_TEMP_ROOT_DANGEROUS");
  }

  if (path.basename(input.testRoot) !== `airoaming-e2e-${input.runId}`) {
    throw new Error("E2E_WORKSPACE_NAME_MISMATCH");
  }

  const expectedRoots = [
    [input.workspaceRoot, path.join(input.testRoot, "workspace"), "E2E_WORKSPACE_NAME_MISMATCH"],
    [input.dataRoot, path.join(input.testRoot, "data"), "E2E_DATA_ROOT_NAME_MISMATCH"],
    [
      input.fakeSecretStoreRoot,
      path.join(input.testRoot, "fake-secret-store"),
      "E2E_FAKE_SECRET_STORE_ROOT_NAME_MISMATCH",
    ],
  ] as const;
  for (const [actual, expected, errorCode] of expectedRoots) {
    if (!samePath(actual, expected)) {
      throw new Error(errorCode);
    }
  }
}

function assertCanonicalRuntimeParent(runtime: E2ERuntime): void {
  const parent = path.dirname(runtime.testRoot);
  const canonicalParent = canonicalizeExistingDirectory(parent, "E2E_TEMP_ROOT_INVALID");
  if (!samePath(parent, canonicalParent)) {
    throw new Error("E2E_TEMP_ROOT_CANONICAL_MISMATCH");
  }
}

function assertCanonicalRuntimeStateParent(runtime: E2ERuntime): void {
  const expectedRuntimeRoot = path.join(runtime.repoRoot, "tests", ".runtime");
  if (
    !samePath(runtime.runtimeRoot, expectedRuntimeRoot)
    || !samePath(path.dirname(runtime.runtimeDir), runtime.runtimeRoot)
    || !samePath(canonicalizePotentialPath(runtime.runtimeRoot), runtime.runtimeRoot)
  ) {
    throw new Error("E2E_RUNTIME_ROOT_CANONICAL_MISMATCH");
  }
}

function canonicalizeExistingDirectory(input: string, errorCode: string): string {
  try {
    const canonical = realpathSync(path.resolve(input));
    if (!statSync(canonical).isDirectory()) {
      throw new Error(errorCode);
    }
    return canonical;
  } catch (error) {
    if (error instanceof Error && error.message === errorCode) {
      throw error;
    }
    throw new Error(errorCode);
  }
}

function canonicalizePotentialPath(input: string): string {
  const resolved = path.resolve(input);
  if (existsSync(resolved)) {
    return realpathSync(resolved);
  }
  const suffix: string[] = [];
  let cursor = resolved;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return resolved;
    }
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(realpathSync(cursor), ...suffix);
}

async function assertMatchingMarker(
  runtime: E2ERuntime,
  pathAlreadyValidated = false,
  requireOwnedRoots = true,
): Promise<void> {
  if (!pathAlreadyValidated) {
    assertSafeTestPaths(runtime);
  }
  const rootStat = await tryLstat(runtime.testRoot);
  const markerStat = await tryLstat(runtime.markerPath);
  if (
    !rootStat?.isDirectory()
    || rootStat.isSymbolicLink()
    || !markerStat?.isFile()
    || markerStat.isSymbolicLink()
  ) {
    throw new Error("E2E_MARKER_MISMATCH");
  }

  let marker: Partial<E2ERootMarker>;
  try {
    marker = JSON.parse(await readFile(runtime.markerPath, "utf8")) as Partial<E2ERootMarker>;
  } catch {
    throw new Error("E2E_MARKER_MISMATCH");
  }

  if (
    marker.schemaVersion !== 1
    || marker.kind !== "airoaming-e2e-root"
    || marker.runId !== runtime.runId
    || path.resolve(marker.testRoot ?? "") !== runtime.testRoot
    || path.resolve(marker.workspaceRoot ?? "") !== runtime.workspaceRoot
    || path.resolve(marker.dataRoot ?? "") !== runtime.dataRoot
    || path.resolve(marker.fakeSecretStoreRoot ?? "") !== runtime.fakeSecretStoreRoot
  ) {
    throw new Error("E2E_MARKER_MISMATCH");
  }

  if (requireOwnedRoots) {
    for (const ownedRoot of [
      runtime.workspaceRoot,
      runtime.dataRoot,
      runtime.fakeSecretStoreRoot,
      path.join(runtime.testRoot, "home"),
      path.join(runtime.testRoot, "xdg-config"),
      path.join(runtime.testRoot, "xdg-cache"),
    ]) {
      const ownedStat = await tryLstat(ownedRoot);
      if (!ownedStat?.isDirectory() || ownedStat.isSymbolicLink()) {
        throw new Error("E2E_MARKER_MISMATCH");
      }
    }
  }
}

async function prepareOwnedDirectory(target: string, errorPrefix: string): Promise<void> {
  const existing = await tryLstat(target);
  if (existing?.isSymbolicLink()) {
    throw new Error(`${errorPrefix}_SYMLINK`);
  }
  if (existing && !existing.isDirectory()) {
    throw new Error(`${errorPrefix}_NOT_DIRECTORY`);
  }
  if (!existing) {
    try {
      await mkdir(target, { recursive: false });
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }
      const concurrent = await tryLstat(target);
      if (!concurrent?.isDirectory() || concurrent.isSymbolicLink()) {
        throw new Error(`${errorPrefix}_NOT_DIRECTORY`);
      }
    }
  }
}

async function prepareFakeSecretStore(runtime: E2ERuntime): Promise<void> {
  const secretPath = path.join(runtime.fakeSecretStoreRoot, FAKE_SECRET_FILE_NAME);
  const sentinel = `airoaming-test-secret-${runtime.runId}`;
  try {
    await writeFile(secretPath, sentinel, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") {
      throw error;
    }
  }

  const secretStat = await tryLstat(secretPath);
  if (
    !secretStat?.isFile()
    || secretStat.isSymbolicLink()
    || await readFile(secretPath, "utf8") !== sentinel
  ) {
    throw new Error("E2E_FAKE_SECRET_STORE_SENTINEL_MISMATCH");
  }
}

async function assertOwnedRootsSafeForCleanup(runtime: E2ERuntime): Promise<void> {
  for (const ownedRoot of [
    runtime.workspaceRoot,
    runtime.dataRoot,
    runtime.fakeSecretStoreRoot,
    path.join(runtime.testRoot, "home"),
    path.join(runtime.testRoot, "xdg-config"),
    path.join(runtime.testRoot, "xdg-cache"),
  ]) {
    const ownedStat = await tryLstat(ownedRoot);
    if (ownedStat && (!ownedStat.isDirectory() || ownedStat.isSymbolicLink())) {
      throw new Error("E2E_MARKER_MISMATCH");
    }
  }
}

async function prepareRunState(runtime: E2ERuntime): Promise<void> {
  assertCanonicalRuntimeStateParent(runtime);
  const runtimeStat = await tryLstat(runtime.runtimeDir);
  if (runtimeStat?.isSymbolicLink()) {
    throw new Error("E2E_RUNTIME_DIR_SYMLINK");
  }
  if (runtimeStat && !runtimeStat.isDirectory()) {
    throw new Error("E2E_RUNTIME_DIR_NOT_DIRECTORY");
  }
  if (!runtimeStat) {
    await mkdir(runtime.runtimeDir, { recursive: true });
    assertCanonicalRuntimeStateParent(runtime);
  }

  const stateStat = await tryLstat(runtime.statePath);
  if (stateStat) {
    await assertMatchingRunState(runtime);
    return;
  }
  const entries = await readdir(runtime.runtimeDir);
  if (entries.length === 1 && entries[0] === path.basename(runtime.statePath)) {
    await assertMatchingRunState(runtime);
    return;
  }
  if (entries.length > 0) {
    throw new Error("E2E_RUNTIME_UNMARKED");
  }

  const state: E2ERunState = {
    schemaVersion: 1,
    kind: "airoaming-e2e-run",
    runId: runtime.runId,
    runtimeDir: runtime.runtimeDir,
    testRoot: runtime.testRoot,
    workspaceRoot: runtime.workspaceRoot,
    dataRoot: runtime.dataRoot,
    fakeSecretStoreRoot: runtime.fakeSecretStoreRoot,
    ports: {
      server: runtime.serverPort,
      web: runtime.webPort,
      provider: runtime.providerPort,
    },
    createdAt: new Date().toISOString(),
  };
  assertCanonicalRuntimeStateParent(runtime);
  try {
    await writeFile(runtime.statePath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") {
      throw error;
    }
    await assertMatchingRunState(runtime);
  }
}

async function assertMatchingRunState(runtime: E2ERuntime): Promise<void> {
  assertCanonicalRuntimeStateParent(runtime);
  const expectedRuntimeDir = path.join(runtime.runtimeRoot, runtime.runId);
  if (runtime.runtimeDir !== expectedRuntimeDir) {
    throw new Error("E2E_RUN_STATE_MISMATCH");
  }
  const runtimeStat = await tryLstat(runtime.runtimeDir);
  const stateStat = await tryLstat(runtime.statePath);
  if (
    !runtimeStat?.isDirectory()
    || runtimeStat.isSymbolicLink()
    || !stateStat?.isFile()
    || stateStat.isSymbolicLink()
  ) {
    throw new Error("E2E_RUN_STATE_MISMATCH");
  }

  let state: Partial<E2ERunState>;
  try {
    state = JSON.parse(await readFile(runtime.statePath, "utf8")) as Partial<E2ERunState>;
  } catch {
    throw new Error("E2E_RUN_STATE_MISMATCH");
  }
  if (
    state.schemaVersion !== 1
    || state.kind !== "airoaming-e2e-run"
    || state.runId !== runtime.runId
    || path.resolve(state.runtimeDir ?? "") !== runtime.runtimeDir
    || path.resolve(state.testRoot ?? "") !== runtime.testRoot
    || path.resolve(state.workspaceRoot ?? "") !== runtime.workspaceRoot
    || path.resolve(state.dataRoot ?? "") !== runtime.dataRoot
    || path.resolve(state.fakeSecretStoreRoot ?? "") !== runtime.fakeSecretStoreRoot
    || state.ports?.server !== runtime.serverPort
    || state.ports.web !== runtime.webPort
    || state.ports.provider !== runtime.providerPort
  ) {
    throw new Error("E2E_RUN_STATE_MISMATCH");
  }
}

function assertMatchingSetupSummary(runtime: E2ERuntime, summary: E2ESetupSummary): void {
  const validRoles: E2EProcessRole[] = ["provider", "server", "web"];
  if (
    summary.schemaVersion !== 1
    || summary.kind !== "airoaming-e2e-setup"
    || summary.runId !== runtime.runId
    || summary.ports.server !== runtime.serverPort
    || summary.ports.web !== runtime.webPort
    || summary.ports.provider !== runtime.providerPort
    || !Array.isArray(summary.checks)
    || summary.checks.some((check) => (
      typeof check.label !== "string"
      || !Number.isInteger(check.status)
    ))
    || !Array.isArray(summary.readyRoles)
    || summary.readyRoles.some((role) => !validRoles.includes(role))
    || typeof summary.createdAt !== "string"
  ) {
    throw new Error("E2E_SETUP_SUMMARY_MISMATCH");
  }
}

async function assertSafeSetupSummaryTarget(
  setupPath: string,
  required = false,
): Promise<void> {
  const targetStat = await tryLstat(setupPath);
  if (!targetStat) {
    if (required) {
      throw new Error("E2E_SETUP_SUMMARY_MISSING");
    }
    return;
  }
  if (targetStat.isSymbolicLink()) {
    throw new Error("E2E_SETUP_SUMMARY_SYMLINK");
  }
  if (!targetStat.isFile()) {
    throw new Error("E2E_SETUP_SUMMARY_NOT_FILE");
  }
}

async function assertOwnedSetupSummaryTemporary(
  runtime: E2ERuntime,
  temporaryPath: string,
): Promise<void> {
  assertSetupSummaryTemporaryPath(runtime, temporaryPath);
  const temporaryStat = await tryLstat(temporaryPath);
  if (!temporaryStat?.isFile() || temporaryStat.isSymbolicLink()) {
    throw new Error("E2E_SETUP_SUMMARY_TEMP_MISMATCH");
  }
}

async function removeOwnedSetupSummaryTemporary(
  runtime: E2ERuntime,
  temporaryPath: string,
): Promise<void> {
  assertSetupSummaryTemporaryPath(runtime, temporaryPath);
  const temporaryStat = await tryLstat(temporaryPath);
  if (!temporaryStat) {
    return;
  }
  if (!temporaryStat.isFile() && !temporaryStat.isSymbolicLink()) {
    throw new Error("E2E_SETUP_SUMMARY_TEMP_MISMATCH");
  }
  await rm(temporaryPath, { force: false });
}

function assertSetupSummaryTemporaryPath(runtime: E2ERuntime, temporaryPath: string): void {
  const basename = path.basename(temporaryPath);
  if (
    path.dirname(temporaryPath) !== runtime.runtimeDir
    || !basename.startsWith(".setup.json.")
    || !basename.endsWith(".tmp")
  ) {
    throw new Error("E2E_SETUP_SUMMARY_TEMP_MISMATCH");
  }
}

async function readProcessStateFile(
  runtime: E2ERuntime,
  role: E2EProcessRole,
  required: boolean,
): Promise<E2EProcessState | null> {
  const statePath = getE2EProcessStatePath(runtime, role);
  const stateStat = await tryLstat(statePath);
  if (!stateStat) {
    if (required) {
      throw new Error("E2E_PROCESS_STATE_MISMATCH");
    }
    return null;
  }
  if (!stateStat.isFile() || stateStat.isSymbolicLink()) {
    throw new Error("E2E_PROCESS_STATE_MISMATCH");
  }

  let state: Partial<E2EProcessState>;
  try {
    state = JSON.parse(await readFile(statePath, "utf8")) as Partial<E2EProcessState>;
  } catch {
    throw new Error("E2E_PROCESS_STATE_MISMATCH");
  }
  const statuses: E2EProcessStatus[] = ["starting", "ready", "stopping", "stopped", "failed"];
  if (
    state.schemaVersion !== 1
    || state.kind !== "airoaming-e2e-process"
    || state.runId !== runtime.runId
    || state.role !== role
    || !Number.isInteger(state.pid)
    || (state.pid ?? 0) <= 0
    || state.port !== expectedPort(runtime, role)
    || !statuses.includes(state.status as E2EProcessStatus)
    || typeof state.startedAt !== "string"
    || typeof state.updatedAt !== "string"
  ) {
    throw new Error("E2E_PROCESS_STATE_MISMATCH");
  }
  return state as E2EProcessState;
}

function expectedPort(runtime: E2ERuntime, role: E2EProcessRole): number {
  if (role === "server") {
    return runtime.serverPort;
  }
  if (role === "web") {
    return runtime.webPort;
  }
  return runtime.providerPort;
}

async function assertOwnedProcessIdentity(runtime: E2ERuntime, state: E2EProcessState): Promise<void> {
  let command: string;
  try {
    const result = await execFileAsync("ps", ["-p", String(state.pid), "-o", "command="], {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    });
    command = result.stdout.trim();
  } catch {
    throw new Error(`E2E_PROCESS_IDENTITY_MISMATCH:${state.role}`);
  }

  const script = state.role === "provider" ? "fake-provider-server.mjs" : "start-e2e-server.mjs";
  const requiredTokens = [script, state.role, "--run-id", runtime.runId];
  if (!command || requiredTokens.some((token) => !command.includes(token))) {
    throw new Error(`E2E_PROCESS_IDENTITY_MISMATCH:${state.role}`);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error) && error.code === "EPERM";
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function tryLstat(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function derivePorts(runId: string): { server: number; web: number; provider: number } {
  const hash = createHash("sha256").update(runId).digest().readUInt32BE(0);
  const base = 20_000 + (hash % 10_000) * 3;
  return { server: base, web: base + 1, provider: base + 2 };
}

function parsePort(raw: string | undefined, fallback: number, label: string): number {
  const port = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`E2E_${label}_PORT_INVALID`);
  }
  return port;
}

function createCommonE2EEnvironment(
  runtime: E2ERuntime,
  inherited: NodeJS.ProcessEnv,
): Record<string, string> {
  return {
    ...sanitizeInheritedEnvironment(inherited),
    HOME: path.join(runtime.testRoot, "home"),
    XDG_CONFIG_HOME: path.join(runtime.testRoot, "xdg-config"),
    XDG_CACHE_HOME: path.join(runtime.testRoot, "xdg-cache"),
    AIROAMING_E2E_RUN_ID: runtime.runId,
    AIROAMING_E2E_REPO_ROOT: runtime.repoRoot,
    AIROAMING_E2E_RUNTIME_DIR: runtime.runtimeDir,
    AIROAMING_E2E_SERVER_PORT: String(runtime.serverPort),
    AIROAMING_E2E_WEB_PORT: String(runtime.webPort),
    AIROAMING_E2E_PROVIDER_PORT: String(runtime.providerPort),
    NODE_ENV: "test",
    NODE_OPTIONS: "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
  };
}

function sanitizeInheritedEnvironment(inherited: NodeJS.ProcessEnv): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const allowedNames = new Set([
    "APPDATA",
    "CI",
    "COMSPEC",
    "COREPACK_HOME",
    "HOME",
    "LANG",
    "LANGUAGE",
    "LC_ADDRESS",
    "LC_ALL",
    "LC_COLLATE",
    "LC_CTYPE",
    "LC_IDENTIFICATION",
    "LC_MEASUREMENT",
    "LC_MESSAGES",
    "LC_MONETARY",
    "LC_NAME",
    "LC_NUMERIC",
    "LC_PAPER",
    "LC_TELEPHONE",
    "LC_TIME",
    "LOCALAPPDATA",
    "LOGNAME",
    "NVM_BIN",
    "NVM_DIR",
    "PATH",
    "PATHEXT",
    "PNPM_HOME",
    "SHELL",
    "SYSTEMROOT",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USER",
    "XDG_CACHE_HOME",
  ]);
  for (const [name, value] of Object.entries(inherited)) {
    if (
      value === undefined
      || !allowedNames.has(name)
    ) {
      continue;
    }
    sanitized[name] = value;
  }
  return sanitized;
}
