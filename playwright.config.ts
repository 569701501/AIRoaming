import { defineConfig, devices } from "@playwright/test";
import {
  createE2EProcessEnvironments,
  createE2ERuntime,
} from "./tests/e2e/support/e2e-env.ts";

const runtime = createE2ERuntime();
const environments = createE2EProcessEnvironments(runtime);
delete process.env.NO_COLOR;

Object.assign(process.env, {
  AIROAMING_E2E_RUN_ID: runtime.runId,
  AIROAMING_E2E_REPO_ROOT: runtime.repoRoot,
  AIROAMING_E2E_RUNTIME_DIR: runtime.runtimeDir,
  AIROAMING_E2E_SERVER_PORT: String(runtime.serverPort),
  AIROAMING_E2E_WEB_PORT: String(runtime.webPort),
  AIROAMING_E2E_PROVIDER_PORT: String(runtime.providerPort),
  AIROAMING_WORKSPACE_ROOT: runtime.workspaceRoot,
  OPENCODE_AUTO_START: "false",
  OPENCODE_BASE_URL: runtime.opencodeBaseUrl,
  OPENAI_IMAGE_BASE_URL: runtime.imageBaseUrl,
  OPENAI_IMAGE_API_KEY: "e2e-fake-key",
  OPENAI_API_KEY: "",
  ARK_API_KEY: "",
  DOUBAO_API_KEY: "",
  GROK_IMAGE_API_KEY: "e2e-fake-key",
  XAI_API_KEY: "",
  VITE_API_BASE_URL: runtime.apiBaseUrl,
});

const runIdentity = `--run-id ${runtime.runId}`;

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
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
      env: environments.server,
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
