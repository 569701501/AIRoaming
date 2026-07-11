import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  classifyE2ENetworkTarget,
  createE2ERuntime,
  readE2EProcessStates,
} from "./e2e-env.ts";

test("@infra starts Chromium and three owned loopback services with isolated G1 roots", async ({ page, request }, testInfo) => {
  const runtime = createE2ERuntime();
  const networkAudit: Array<{ decision: string; origin: string; url: string }> = [];
  await page.route("**/*", async (route) => {
    const target = classifyE2ENetworkTarget(runtime, route.request().url());
    networkAudit.push(target);
    if (target.decision === "block_external" || target.decision === "block_invalid") {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const [provider, server, web] = await Promise.all([
    request.get(`${runtime.providerUrl}/health`),
    request.get(`${runtime.serverUrl}/api/health`),
    request.get(`${runtime.webUrl}/projects`),
  ]);
  expect(provider.ok()).toBe(true);
  expect(server.ok()).toBe(true);
  expect(web.ok()).toBe(true);

  const marker = JSON.parse(await readFile(runtime.markerPath, "utf8")) as Record<string, unknown>;
  expect(marker).toMatchObject({
    kind: "airoaming-e2e-root",
    runId: runtime.runId,
    testRoot: runtime.testRoot,
    workspaceRoot: runtime.workspaceRoot,
    dataRoot: runtime.dataRoot,
    fakeSecretStoreRoot: runtime.fakeSecretStoreRoot,
  });
  expect(await readFile(
    `${runtime.fakeSecretStoreRoot}/image-provider.secret`,
    "utf8",
  )).toBe(`airoaming-test-secret-${runtime.runId}`);
  expect(process.env.AIROAMING_DATA_ROOT).toBe(runtime.dataRoot);
  expect(process.env.AIROAMING_SECRET_STORE_ADAPTER).toBe("fake");
  expect(process.env.AIROAMING_FAKE_SECRET_STORE_ROOT).toBe(runtime.fakeSecretStoreRoot);
  expect(process.env.DATABASE_URL).toBe(`file:${path.join(runtime.dataRoot, "db", "airoaming.sqlite")}`);
  expect(process.env.AIROAMING_PERSISTENCE_MODE).toBe("file");
  expect(process.env.AIROAMING_MAINTENANCE_MODE).toBeUndefined();
  expect(process.env.HOME).toBe(path.join(runtime.testRoot, "home"));
  expect(process.env.XDG_CONFIG_HOME).toBe(path.join(runtime.testRoot, "xdg-config"));
  expect(process.env.XDG_CACHE_HOME).toBe(path.join(runtime.testRoot, "xdg-cache"));
  expect(process.env.OPENAI_IMAGE_API_KEY).toBeUndefined();
  expect(process.env.GROK_IMAGE_API_KEY).toBeUndefined();
  expect(process.env.OPENCODE_AUTH_JSON).toBeUndefined();
  expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  expect(process.env.DOCKER_AUTH_CONFIG).toBeUndefined();
  expect(process.env.NPM_CONFIG_USERCONFIG).toBeUndefined();
  expect(process.env.SOME_SERVICE_TOKEN).toBeUndefined();
  expect(process.env.LC_FAKE_TOKEN).toBeUndefined();
  expect(process.env.AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH).toBeUndefined();
  expect(process.env.OPENCODE_AUTO_START).toBe("false");

  const sentinel = Buffer.from(`airoaming-test-secret-${runtime.runId}`);
  const scannedFiles = (await Promise.all([
    listFiles(runtime.testRoot),
    listFiles(runtime.runtimeDir),
  ])).flat().sort();
  const sentinelMatches: string[] = [];
  for (const file of scannedFiles) {
    if ((await readFile(file)).indexOf(sentinel) >= 0) {
      sentinelMatches.push(file);
    }
  }
  expect(sentinelMatches).toEqual([
    path.join(runtime.fakeSecretStoreRoot, "image-provider.secret"),
  ]);
  expect(new URL(runtime.serverUrl).hostname).toBe("127.0.0.1");
  expect(new URL(runtime.webUrl).hostname).toBe("127.0.0.1");
  expect(new URL(runtime.providerUrl).hostname).toBe("127.0.0.1");

  await page.goto("/projects");
  await expect(page).toHaveURL(`${runtime.webUrl}/projects`);
  expect(networkAudit.some((entry) => entry.decision === "allow_loopback")).toBe(true);
  expect(networkAudit.every((entry) => entry.decision !== "block_invalid")).toBe(true);

  const states = await readE2EProcessStates(runtime);
  expect(states.map(({ role, status }) => ({ role, status }))).toEqual([
    { role: "provider", status: "ready" },
    { role: "server", status: "ready" },
    { role: "web", status: "ready" },
  ]);
  await testInfo.attach("e2e-run-summary", {
    body: JSON.stringify({
      runId: runtime.runId,
      ports: [runtime.serverPort, runtime.webPort, runtime.providerPort],
      roles: states.map((state) => state.role),
      networkAudit,
    }),
    contentType: "application/json",
  });
});

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
  return files;
}
