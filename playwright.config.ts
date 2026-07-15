import { chromium, defineConfig, devices } from "@playwright/test";
import { createRequire } from "node:module";
import { userInfo } from "node:os";
import path from "node:path";
import {
  createE2EParentProcessEnvironment,
  createE2EProcessEnvironments,
  createE2ERuntime,
} from "./tests/e2e/support/e2e-env.ts";
import {
  reanchorRunOwnedChromiumPath,
  validateAllowedChromiumExecutablePath,
} from "./tests/e2e/support/playwright-browser-path.ts";

const reportedChromiumExecutablePath = chromium.executablePath();
const inheritedEnvironment = { ...process.env };
const runtime = createE2ERuntime();
const chromiumExecutablePath = resolvePinnedChromiumExecutablePath(
  reportedChromiumExecutablePath,
  runtime,
  inheritedEnvironment,
);
const environments = createE2EProcessEnvironments(runtime, inheritedEnvironment);
const parentEnvironment = createE2EParentProcessEnvironment(runtime, inheritedEnvironment);
for (const name of Object.keys(process.env)) {
  delete process.env[name];
}
Object.assign(process.env, parentEnvironment);

const runIdentity = `--run-id ${runtime.runId}`;

function resolvePinnedChromiumExecutablePath(
  reportedPath: string,
  currentRuntime: ReturnType<typeof createE2ERuntime>,
  inherited: NodeJS.ProcessEnv,
): string {
  const testPackagePath = createRequire(
    path.join(currentRuntime.repoRoot, "package.json"),
  ).resolve("@playwright/test/package.json");
  const playwrightCorePackageDir = path.dirname(
    createRequire(testPackagePath).resolve("playwright-core/package.json"),
  );
  const accountHome = userInfo().homedir;
  const candidate = reanchorRunOwnedChromiumPath({
    reportedPath,
    runId: currentRuntime.runId,
    home: inherited.HOME,
    xdgCacheHome: inherited.XDG_CACHE_HOME,
    accountHome,
    platform: process.platform,
    repoRoot: currentRuntime.repoRoot,
    testRoot: currentRuntime.testRoot,
    playwrightCorePackageDir,
  });
  return validateAllowedChromiumExecutablePath({
    candidatePath: candidate,
    accountHome,
    platform: process.platform,
    repoRoot: currentRuntime.repoRoot,
    playwrightCorePackageDir,
  });
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: `test-results/e2e/${runtime.runId}`,
  preserveOutput: "failures-only",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: `playwright-report/${runtime.runId}` }],
  ],
  globalSetup: "./tests/e2e/setup/global.setup.ts",
  globalTeardown: "./tests/e2e/setup/global.teardown.ts",
  use: {
    baseURL: runtime.webUrl,
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    serviceWorkers: "block",
    launchOptions: {
      executablePath: chromiumExecutablePath,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: chromiumExecutablePath,
        },
      },
    },
  ],
  webServer: [
    {
      name: "fake-provider",
      command: `node --import tsx tests/e2e/support/fake-provider-server.mjs provider ${runIdentity}`,
      cwd: runtime.repoRoot,
      env: environments.provider,
      url: `${runtime.providerUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "server",
      command: `node --import tsx tests/e2e/support/start-e2e-server.mjs server ${runIdentity}`,
      cwd: runtime.repoRoot,
      env: {
        ...environments.server,
        AIROAMING_LAYOUT_RENDERER_EXECUTABLE_PATH: chromiumExecutablePath,
      },
      url: `${runtime.serverUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "web",
      command: `node --import tsx tests/e2e/support/start-e2e-server.mjs web ${runIdentity}`,
      cwd: runtime.repoRoot,
      env: environments.web,
      url: `${runtime.webUrl}/projects`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
