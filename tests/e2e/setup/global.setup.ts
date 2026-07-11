import {
  createE2ERuntime,
  type E2ESetupSummary,
  prepareE2ERuntime,
  readE2EProcessStates,
  writeE2ESetupSummary,
} from "../support/e2e-env.ts";

export default async function globalSetup(): Promise<void> {
  const runtime = createE2ERuntime();
  await prepareE2ERuntime(runtime);

  const [providerHealth, serverHealth, webResponse] = await Promise.all([
    fetchExpected(`${runtime.providerUrl}/health`, "fake-provider"),
    fetchExpected(`${runtime.serverUrl}/api/health`, "server"),
    fetchExpected(`${runtime.webUrl}/projects`, "web"),
  ]);
  const states = await readE2EProcessStates(runtime);
  const readyRoles = states
    .filter((state) => state.status === "ready")
    .map((state) => state.role)
    .sort();
  if (readyRoles.join(",") !== "provider,server,web") {
    throw new Error(`E2E_SERVICES_NOT_READY:${readyRoles.join(",")}`);
  }

  const summary: E2ESetupSummary = {
    schemaVersion: 1,
    kind: "airoaming-e2e-setup",
    runId: runtime.runId,
    ports: {
      server: runtime.serverPort,
      web: runtime.webPort,
      provider: runtime.providerPort,
    },
    checks: [providerHealth, serverHealth, webResponse],
    readyRoles,
    createdAt: new Date().toISOString(),
  };
  await writeE2ESetupSummary(runtime, summary);
  console.log(
    `[e2e-setup] ready run=${runtime.runId} ports=${runtime.serverPort}/${runtime.webPort}/${runtime.providerPort}`,
  );
}

async function fetchExpected(url: string, label: string): Promise<{ label: string; status: number }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`E2E_${label.toUpperCase()}_READINESS_FAILED:${response.status}`);
  }
  await response.arrayBuffer();
  return { label, status: response.status };
}
