import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  reanchorRunOwnedChromiumPath,
  validateAllowedChromiumExecutablePath,
} from "./playwright-browser-path.ts";

const execFileAsync = promisify(execFile);

test("reanchors only paths reported below this run's HOME or XDG cache", () => {
  const runId = "g1-browser-reanchor";
  const testRoot = `/tmp/airoaming-e2e-${runId}`;
  const accountHome = "/Users/tester";
  const repoRoot = "/repo";
  const playwrightCorePackageDir = "/repo/node_modules/.pnpm/playwright-core/node_modules/playwright-core";
  const common = {
    runId,
    home: `${testRoot}/home`,
    xdgCacheHome: `${testRoot}/xdg-cache`,
    accountHome,
    platform: "darwin" as const,
    repoRoot,
    testRoot,
    playwrightCorePackageDir,
  };
  assert.equal(reanchorRunOwnedChromiumPath({
    reportedPath: `${testRoot}/home/Library/Caches/ms-playwright/chromium/browser`,
    ...common,
  }), "/Users/tester/Library/Caches/ms-playwright/chromium/browser");
  assert.equal(reanchorRunOwnedChromiumPath({
    reportedPath: `${testRoot}/xdg-cache/ms-playwright/chromium/browser`,
    ...common,
  }), "/Users/tester/Library/Caches/ms-playwright/chromium/browser");
  assert.throws(() => reanchorRunOwnedChromiumPath({
    reportedPath: "/opt/playwright/chromium/browser",
    ...common,
  }), /E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT/);
  assert.throws(() => reanchorRunOwnedChromiumPath({
    reportedPath: `${testRoot}/home/.ssh/tool`,
    ...common,
  }), /E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT/);
  assert.throws(() => reanchorRunOwnedChromiumPath({
    reportedPath: `${testRoot}/xdg-cache/other/tool`,
    ...common,
  }), /E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT/);
  assert.throws(() => reanchorRunOwnedChromiumPath({
    reportedPath: "/tmp/airoaming-e2e-g1-browser-reanchor/home/Library/Caches/ms-playwright/chromium/browser",
    ...common,
    home: "/tmp/airoaming-e2e-other-run/home",
  }), /E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT/);
  const localBrowser = "/repo/node_modules/.pnpm/playwright-core/node_modules/playwright-core/.local-browsers/chromium/browser";
  assert.equal(reanchorRunOwnedChromiumPath({
    reportedPath: localBrowser,
    ...common,
  }), localBrowser);
  assert.throws(() => reanchorRunOwnedChromiumPath({
    reportedPath: "/repo/node_modules/other/.local-browsers/chromium/browser",
    ...common,
  }), /E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT/);
  assert.throws(() => reanchorRunOwnedChromiumPath({
    reportedPath: `${testRoot}/home/Library/Caches/ms-playwright`,
    ...common,
  }), /E2E_CHROMIUM_REANCHOR_SUFFIX_INVALID/);
});

test("rejects an account-cache symlink that escapes to an external executable", async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "airoaming-browser-symlink-test-"));
  try {
    const accountHome = path.join(sandbox, "account-home");
    const repoRoot = path.join(sandbox, "repo");
    const allowedRoot = path.join(accountHome, "Library", "Caches", "ms-playwright");
    const externalExecutable = path.join(sandbox, "external-browser");
    const escapedCandidate = path.join(allowedRoot, "chromium", "browser");
    await mkdir(path.dirname(escapedCandidate), { recursive: true });
    await mkdir(path.join(repoRoot, "node_modules"), { recursive: true });
    await writeFile(externalExecutable, "external-executable-bytes", "utf8");
    await chmod(externalExecutable, 0o700);
    await symlink(externalExecutable, escapedCandidate);
    const before = await fileEvidence(externalExecutable);

    assert.throws(() => validateAllowedChromiumExecutablePath({
      candidatePath: escapedCandidate,
      accountHome,
      repoRoot,
      platform: "darwin",
      playwrightCorePackageDir: path.join(repoRoot, "node_modules", "playwright-core"),
    }), /E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT/);
    assert.deepEqual(await fileEvidence(externalExecutable), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("main runner and isolated worker converge without trusting an inherited override", async () => {
  const mainScript = String.raw`
    import path from "node:path";
    import { pathToFileURL } from "node:url";
    import { chromium } from "@playwright/test";

    const poisonedPath = process.env.AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH;
    if (poisonedPath !== "/bin/sh") {
      throw new Error("E2E_CHROMIUM_POISON_NOT_APPLIED");
    }
    const resolvedBeforeIsolation = chromium.executablePath();
    const configUrl = pathToFileURL(path.join(process.cwd(), "playwright.config.ts")).href;
    const importedConfig = await import(configUrl);
    const config = importedConfig.default?.default ?? importedConfig.default;
    const configured = config.use?.launchOptions?.executablePath;
    const projectConfigured = config.projects?.[0]?.use?.launchOptions?.executablePath;
    if (configured !== resolvedBeforeIsolation || projectConfigured !== resolvedBeforeIsolation) {
      throw new Error("E2E_CHROMIUM_PATH_NOT_PINNED_BEFORE_HOME_ISOLATION");
    }
    const isolatedHome = process.env.HOME;
    if (!isolatedHome?.includes("airoaming-e2e-") || configured.startsWith(isolatedHome)) {
      throw new Error("E2E_CHROMIUM_PATH_DEPENDS_ON_ISOLATED_HOME");
    }
    if (process.env.AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH !== undefined) {
      throw new Error("E2E_CHROMIUM_POISON_REACHED_PARENT_ENVIRONMENT");
    }
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    if (webServers.some((server) => server?.env?.AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH !== undefined)) {
      throw new Error("E2E_CHROMIUM_POISON_REACHED_WEB_SERVER_ENVIRONMENT");
    }
    const server = webServers.find((service) => service?.name === "server");
    if (server?.env?.AIROAMING_LAYOUT_RENDERER_EXECUTABLE_PATH !== configured) {
      throw new Error("E2E_LAYOUT_RENDERER_PATH_NOT_PINNED");
    }
    process.stdout.write(JSON.stringify({
      resolvedBeforeIsolation,
      configured,
      environment: process.env,
    }));
  `;

  const mainResult = await execFileAsync(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    mainScript,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH: "/bin/sh",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(mainResult.stderr, "");
  const main = JSON.parse(mainResult.stdout) as {
    resolvedBeforeIsolation: string;
    configured: string;
    environment: Record<string, string>;
  };
  assert.equal(main.configured, main.resolvedBeforeIsolation);

  const workerScript = String.raw`
    import path from "node:path";
    import { pathToFileURL } from "node:url";
    import { chromium } from "@playwright/test";

    const reportedBeforeConfig = chromium.executablePath();
    const configUrl = pathToFileURL(path.join(process.cwd(), "playwright.config.ts")).href;
    const importedConfig = await import(configUrl);
    const config = importedConfig.default?.default ?? importedConfig.default;
    const configured = config.use?.launchOptions?.executablePath;
    const projectConfigured = config.projects?.[0]?.use?.launchOptions?.executablePath;
    if (configured !== ${JSON.stringify(main.configured)} || projectConfigured !== configured) {
      throw new Error("E2E_CHROMIUM_WORKER_PATH_DID_NOT_CONVERGE");
    }
    if (!reportedBeforeConfig.startsWith(${JSON.stringify(main.environment.HOME)})) {
      throw new Error("E2E_CHROMIUM_WORKER_PATH_WAS_NOT_ISOLATED");
    }
    if (process.env.AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH !== undefined) {
      throw new Error("E2E_CHROMIUM_POISON_REACHED_WORKER_PARENT_ENVIRONMENT");
    }
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    if (webServers.some((server) => server?.env?.AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH !== undefined)) {
      throw new Error("E2E_CHROMIUM_POISON_REACHED_WORKER_WEB_SERVER_ENVIRONMENT");
    }
    const server = webServers.find((service) => service?.name === "server");
    if (server?.env?.AIROAMING_LAYOUT_RENDERER_EXECUTABLE_PATH !== configured) {
      throw new Error("E2E_LAYOUT_RENDERER_WORKER_PATH_NOT_PINNED");
    }
  `;
  const workerResult = await execFileAsync(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    workerScript,
  ], {
    cwd: process.cwd(),
    env: {
      ...main.environment,
      AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH: "/bin/sh",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  assert.equal(workerResult.stderr, "");
});

test("rejects PLAYWRIGHT_BROWSERS_PATH pointing at a sandbox executable without writing it", async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "airoaming-browser-override-test-"));
  const registryRoot = path.join(sandbox, "external-registry");
  try {
    const probe = await execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      'import { chromium } from "@playwright/test"; process.stdout.write(chromium.executablePath());',
    ], {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: registryRoot },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const fakeExecutable = probe.stdout;
    await mkdir(path.dirname(fakeExecutable), { recursive: true });
    await writeFile(fakeExecutable, "sandbox-browser-must-not-run-or-change", "utf8");
    await chmod(fakeExecutable, 0o700);
    const before = await fileEvidence(fakeExecutable);
    const rejectScript = String.raw`
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      const configUrl = pathToFileURL(path.join(process.cwd(), "playwright.config.ts")).href;
      try {
        await import(configUrl);
      } catch (error) {
        if (error instanceof Error && error.message === "E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT") {
          process.exit(0);
        }
        throw error;
      }
      throw new Error("E2E_EXTERNAL_PLAYWRIGHT_BROWSER_OVERRIDE_ACCEPTED");
    `;
    await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      rejectScript,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: registryRoot,
        AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH: "/bin/sh",
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    assert.deepEqual(await fileEvidence(fakeExecutable), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

async function fileEvidence(target: string) {
  const [bytes, metadata] = await Promise.all([readFile(target), stat(target)]);
  return {
    bytes: bytes.toString("base64"),
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
  };
}
