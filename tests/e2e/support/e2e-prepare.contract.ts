import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createE2ERuntime } from "./e2e-env.ts";
import { createE2EViteConfig } from "./start-e2e-server.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd());
const sharedSourceEntry = path.join(repoRoot, "packages", "shared", "src", "index.ts");
const sharedDistRoot = path.join(repoRoot, "packages", "shared", "dist");
const serverTsconfigPath = path.join(repoRoot, "tests", "e2e", "tsconfig.server.json");

test("E2E environment preparation leaves shared build artifacts byte-for-byte untouched", async () => {
  const before = await snapshotDirectory(sharedDistRoot);
  let commandError: unknown;
  let commandOutput: CommandOutput | undefined;
  try {
    commandOutput = await runInherited("corepack", ["pnpm", "test:e2e:env"]);
  } catch (error) {
    commandError = error;
  }
  const after = await snapshotDirectory(sharedDistRoot);

  assert.deepEqual(after, before, "E2E_PREPARE_MUTATED_SHARED_DIST");
  if (commandError) {
    throw commandError;
  }
  assert.ok(commandOutput);
  assertPassingNodeTestSummary(commandOutput.stdout);
});

test("E2E Nest runtime resolves @airoaming/shared from source", async () => {
  const probe = [
    "const resolved = import.meta.resolve('@airoaming/shared');",
    "const shared = await import('@airoaming/shared');",
    "console.log(JSON.stringify({ resolved, usable: Array.isArray(shared.PROJECT_WORKFLOW_STEP_KEYS) }));",
  ].join(" ");
  const { stdout } = await execFileAsync(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    probe,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: serverTsconfigPath,
    },
    maxBuffer: 64 * 1024,
  });
  const result = JSON.parse(stdout.trim()) as { resolved: string; usable: boolean };

  assert.equal(fileURLToPath(result.resolved), sharedSourceEntry);
  assert.equal(result.usable, true);
});

test("E2E Vite runtime resolves @airoaming/shared from source", async () => {
  const webRoot = path.join(repoRoot, "apps", "web");
  const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
  const vitePackageDir = path.dirname(requireFromWeb.resolve("vite/package.json"));
  const viteUrl = pathToFileURL(path.join(vitePackageDir, "dist", "node", "index.js")).href;
  const viteModule = await import(viteUrl);
  const createServer = viteModule.createServer ?? viteModule.default?.createServer;
  assert.equal(typeof createServer, "function", "E2E_VITE_CREATE_SERVER_MISSING");

  const runtime = createE2ERuntime({
    repoRoot,
    env: { AIROAMING_E2E_RUN_ID: "g0-shared-source-probe" },
  });
  const baseConfig = createE2EViteConfig(runtime);
  const vite = await createServer({
    ...baseConfig,
    appType: "custom",
    logLevel: "silent",
    server: {
      ...baseConfig.server,
      hmr: false,
      middlewareMode: true,
    },
  });
  try {
    const resolved = await vite.pluginContainer.resolveId(
      "@airoaming/shared",
      path.join(webRoot, "src", "utils", "workbench-workflow.ts"),
    );
    assert.equal(path.resolve(resolved?.id.split("?", 1)[0] ?? ""), sharedSourceEntry);
  } finally {
    await vite.close();
  }
});

interface DirectorySnapshot {
  readonly exists: boolean;
  readonly entries: readonly {
    readonly path: string;
    readonly bytes: string;
    readonly contentSha256: string;
    readonly mtimeNs: string;
    readonly mode: string;
  }[];
}

async function snapshotDirectory(root: string): Promise<DirectorySnapshot> {
  const rootStat = await tryLstat(root);
  if (!rootStat) {
    return { exists: false, entries: [] };
  }
  assert.equal(rootStat.isDirectory(), true, "E2E_SHARED_DIST_NOT_DIRECTORY");

  const files = await listFiles(root);
  const entries = await Promise.all(files.map(async (absolutePath) => {
    const [content, stat] = await Promise.all([
      readFile(absolutePath),
      lstat(absolutePath, { bigint: true }),
    ]);
    return {
      path: path.relative(root, absolutePath),
      bytes: stat.size.toString(),
      contentSha256: createHash("sha256").update(content).digest("hex"),
      mtimeNs: stat.mtimeNs.toString(),
      mode: stat.mode.toString(),
    };
  }));
  return { exists: true, entries };
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function tryLstat(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

interface CommandOutput {
  readonly stdout: string;
  readonly stderr: string;
}

async function runInherited(command: string, args: readonly string[]): Promise<CommandOutput> {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  return new Promise<CommandOutput>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`E2E_PREPARE_CHILD_FAILED:${code ?? signal ?? "unknown"}`));
    });
  });
}

function assertPassingNodeTestSummary(stdout: string): void {
  const tests = readSummaryCount(stdout, "tests");
  const passed = readSummaryCount(stdout, "pass");
  const failed = readSummaryCount(stdout, "fail");
  assert.ok(tests > 0, "E2E_PREPARE_ENV_TESTS_NOT_RUN");
  assert.equal(passed, tests, "E2E_PREPARE_ENV_TESTS_NOT_ALL_PASSING");
  assert.equal(failed, 0, "E2E_PREPARE_ENV_TESTS_FAILED");
}

function readSummaryCount(stdout: string, label: string): number {
  const match = stdout.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
  assert.ok(match, `E2E_PREPARE_ENV_SUMMARY_MISSING:${label}`);
  return Number(match[1]);
}
