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
const STORY_STRUCTURE_RESPONSE = Object.freeze({
  synopsis: "林夏在雨夜站台等待末班车，异常广播后空车进站。",
  direction: {
    logline: "错过末班车的林夏等来一辆无人驾驶的空车。",
    chapterGoal: "建立雨夜站台的悬疑事件。",
    coreConflict: "林夏必须在离开和登上异常末班车之间做出选择。",
    emotionalArc: "疲惫等待转为警觉，再转为直面未知。",
    endingHook: "无人驾驶的末班车在林夏面前打开车门。",
  },
  characters: [{
    name: "林夏",
    role: "本章视角主角",
    level: "lead",
    entityType: "human",
    motivation: "赶上回家的末班车。",
    relationship: "独自在站台等待。",
    visualTraits: "被雨淋湿的深色外套，神情疲惫而警觉。",
    notes: "保持主角外观连续。",
  }],
  scenes: [{
    name: "雨夜站台",
    location: "城市末班公交站",
    timeOfDay: "深夜",
    atmosphere: "冷清、潮湿、灯光闪烁",
    purpose: "建立异常末班车出现前的悬疑氛围。",
  }],
  beats: [
    {
      order: 1,
      title: "独自等待",
      summary: "林夏在雨夜站台等待迟迟未到的末班车。",
      conflict: "末班车已经超过到站时间。",
      characters: ["林夏"],
      sceneName: "雨夜站台",
      visualFocus: "雨幕、空站台和反复查看时间的林夏。",
      outcome: "林夏开始怀疑今晚没有末班车。",
    },
    {
      order: 2,
      title: "异常广播",
      summary: "关闭的广播突然播报一班不存在的车辆。",
      conflict: "广播内容与站牌信息矛盾。",
      characters: ["林夏"],
      sceneName: "雨夜站台",
      visualFocus: "闪烁的广播灯和林夏警觉的神情。",
      outcome: "远处出现车辆灯光。",
    },
    {
      order: 3,
      title: "空车进站",
      summary: "无人驾驶的末班车停在林夏面前并打开车门。",
      conflict: "林夏必须决定是否登车。",
      characters: ["林夏"],
      sceneName: "雨夜站台",
      visualFocus: "空驾驶座、开启的车门和车内冷光。",
      outcome: "章节停在林夏迈向车门的瞬间。",
    },
  ],
  notes: "后续分镜保持雨夜冷色调，并突出空驾驶座。",
});

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
        const payload = await readJsonBody(request);
        return sendJson(response, 200, {
          parts: [{ type: "text", text: deterministicOpenCodeResponse(payload) }],
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

function deterministicOpenCodeResponse(payload) {
  const prompt = Array.isArray(payload.parts)
    ? payload.parts
      .filter((part) => part && typeof part === "object" && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
    : "";
  if (prompt.includes("structure-story-parse")) {
    return `\`\`\`json\n${JSON.stringify(STORY_STRUCTURE_RESPONSE, null, 2)}\n\`\`\``;
  }
  return "E2E deterministic response";
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
