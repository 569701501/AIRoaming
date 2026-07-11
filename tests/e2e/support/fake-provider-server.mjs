import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createE2ERuntime,
  prepareE2ERuntime,
  recoverE2EStartupFailure,
  writeE2EProcessState,
} from "./e2e-env.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const FAILURE_MODES = new Set(["success", "delay", "429", "500", "late_success"]);

/**
 * @param {{ host: string, port: number, runId: string, runtimeDir: string, logRequests?: boolean }} options
 */
export async function createFakeProviderServer(options) {
  if (!LOOPBACK_HOSTS.has(options.host)) {
    throw new Error("E2E_PROVIDER_LOOPBACK_REQUIRED");
  }
  if (!options.runId) {
    throw new Error("E2E_PROVIDER_RUN_ID_REQUIRED");
  }

  let failureMode = "success";
  let sessionSequence = 0;
  /** @type {Array<{ at: string, method: string, path: string }>} */
  const requestAudit = [];

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${options.host}`);
    requestAudit.push({ at: new Date().toISOString(), method, path: url.pathname });
    response.once("finish", () => {
      if (options.logRequests) {
        console.log(`[e2e-fake-provider] ${method} ${url.pathname} ${response.statusCode}`);
      }
    });

    try {
      if (method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { status: "ok", runId: options.runId });
      }
      if (method === "GET" && url.pathname === "/__e2e__/requests") {
        return sendJson(response, 200, { items: requestAudit });
      }
      if (method === "POST" && url.pathname === "/__e2e__/control") {
        const payload = await readJsonBody(request);
        if (!FAILURE_MODES.has(payload.mode)) {
          return sendJson(response, 400, { code: "E2E_FAILURE_MODE_INVALID" });
        }
        failureMode = payload.mode;
        response.writeHead(204).end();
        return;
      }
      if (method === "GET" && url.pathname === "/opencode/session") {
        return sendJson(response, 200, []);
      }
      if (method === "GET" && url.pathname === "/opencode/config") {
        return sendJson(response, 200, {
          provider: {
            e2e: {
              id: "e2e",
              name: "E2E deterministic provider",
              models: {
                deterministic: { id: "deterministic", name: "Deterministic text" },
              },
            },
          },
        });
      }
      if (method === "POST" && url.pathname === "/opencode/session") {
        await drainBody(request);
        sessionSequence += 1;
        return sendJson(response, 200, { id: `e2e-session-${sessionSequence}` });
      }
      if (method === "PUT" && /^\/opencode\/auth\/[^/]+$/.test(url.pathname)) {
        await drainBody(request);
        return sendJson(response, 200, true);
      }
      if (method === "POST" && /^\/opencode\/session\/[^/]+\/message$/.test(url.pathname)) {
        await drainBody(request);
        return sendJson(response, 200, {
          parts: [{ type: "text", text: "E2E deterministic response" }],
        });
      }
      if (method === "GET" && url.pathname === "/opencode/event") {
        response.writeHead(200, {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
        });
        response.end(": e2e-ready\n\n");
        return;
      }
      if (
        method === "POST"
        && ["/image/v1/images/generations", "/image/v1/images/edits"].includes(url.pathname)
      ) {
        await drainBody(request);
        const handledFailure = await respondForFailureMode(response, failureMode);
        if (handledFailure) {
          return;
        }
        return sendJson(response, 200, {
          created: 0,
          data: [{ b64_json: IMAGE_BASE64 }],
        });
      }

      await drainBody(request);
      return sendJson(response, 404, { code: "E2E_FAKE_ROUTE_NOT_FOUND" });
    } catch (error) {
      return sendJson(response, 400, {
        code: "E2E_FAKE_BAD_REQUEST",
        message: error instanceof Error ? error.message : "invalid request",
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: options.host, port: options.port, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("E2E_PROVIDER_ADDRESS_UNAVAILABLE");
  }

  let closed = false;
  return {
    host: options.host,
    port: address.port,
    url: `http://${options.host}:${address.port}`,
    server,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}

async function respondForFailureMode(response, mode) {
  if (mode === "delay") {
    await delay(100);
    return false;
  }
  if (mode === "late_success") {
    await delay(500);
    return false;
  }
  if (mode === "429") {
    sendJson(response, 429, { code: "E2E_FAKE_RATE_LIMITED" });
    return true;
  }
  if (mode === "500") {
    sendJson(response, 500, { code: "E2E_FAKE_PROVIDER_FAILED" });
    return true;
  }
  return false;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const body = await readBody(request, 64 * 1024);
  return body.length === 0 ? {} : JSON.parse(body.toString("utf8"));
}

async function drainBody(request) {
  await readBody(request, 20 * 1024 * 1024);
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new Error("E2E_FAKE_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runCli() {
  const role = process.argv[2];
  const runIdFlag = process.argv.indexOf("--run-id");
  const cliRunId = runIdFlag >= 0 ? process.argv[runIdFlag + 1] : undefined;
  if (role !== "provider" || !cliRunId || cliRunId !== process.env.AIROAMING_E2E_RUN_ID) {
    throw new Error("E2E_PROVIDER_CLI_IDENTITY_MISMATCH");
  }

  const runtime = createE2ERuntime();
  await prepareE2ERuntime(runtime);
  await writeE2EProcessState(runtime, {
    role: "provider",
    pid: process.pid,
    port: runtime.providerPort,
    status: "starting",
  });
  const fake = await createFakeProviderServer({
    host: "127.0.0.1",
    port: runtime.providerPort,
    runId: runtime.runId,
    runtimeDir: runtime.runtimeDir,
    logRequests: true,
  });
  await writeE2EProcessState(runtime, {
    role: "provider",
    pid: process.pid,
    port: runtime.providerPort,
    status: "ready",
  });
  console.log(`[e2e-fake-provider] ready ${fake.url} run=${runtime.runId}`);

  let shutdownPromise;
  const shutdown = () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      await writeE2EProcessState(runtime, {
        role: "provider",
        pid: process.pid,
        port: runtime.providerPort,
        status: "stopping",
      }).catch(() => undefined);
      await fake.close();
      await writeE2EProcessState(runtime, {
        role: "provider",
        pid: process.pid,
        port: runtime.providerPort,
        status: "stopped",
      }).catch(() => undefined);
    })();
    return shutdownPromise;
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shutdown().then(
        () => process.exit(0),
        (error) => {
          console.error(`[e2e-fake-provider] shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        },
      );
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`[e2e-fake-provider] failed: ${error instanceof Error ? error.message : String(error)}`);
    Promise.resolve()
      .then(async () => {
        const runtime = createE2ERuntime();
        await writeE2EProcessState(runtime, {
          role: "provider",
          pid: process.pid,
          port: runtime.providerPort,
          status: "failed",
        }).catch(() => undefined);
        await recoverE2EStartupFailure(runtime, process.pid);
      })
      .catch((cleanupError) => {
        console.error(
          `[e2e-fake-provider] startup cleanup refused: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      })
      .finally(() => {
        process.exitCode = 1;
      });
  });
}
