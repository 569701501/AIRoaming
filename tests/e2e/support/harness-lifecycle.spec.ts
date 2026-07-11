import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  classifyE2ENetworkTarget,
  createE2ERuntime,
  readE2EProcessStates,
} from "./e2e-env.ts";

test("@infra starts Chromium and three owned loopback services with an isolated workspace", async ({ page, request }, testInfo) => {
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
    workspaceRoot: runtime.workspaceRoot,
  });
  expect(process.env.OPENCODE_AUTO_START).toBe("false");
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
