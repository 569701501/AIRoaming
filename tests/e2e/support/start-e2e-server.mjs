import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  cleanupE2EWorkspace,
  createE2ERuntime,
  prepareE2ERuntime,
  recoverE2EStartupFailure,
  writeE2EProcessState,
} from "./e2e-env.ts";

const LOOPBACK_HOST = "127.0.0.1";
const execFileAsync = promisify(execFile);

/**
 * @param {string[]} args
 * @param {string | undefined} inheritedRunId
 * @returns {"server" | "web"}
 */
export function parseE2EServiceIdentity(args, inheritedRunId) {
  const role = args[0];
  const runIdFlag = args.indexOf("--run-id");
  const cliRunId = runIdFlag >= 0 ? args[runIdFlag + 1] : undefined;
  if (
    (role !== "server" && role !== "web")
    || !cliRunId
    || !inheritedRunId
    || cliRunId !== inheritedRunId
  ) {
    throw new Error("E2E_SERVICE_CLI_IDENTITY_MISMATCH");
  }
  return role;
}

/**
 * @param {"server" | "web"} role
 * @param {ReturnType<typeof createE2ERuntime>} runtime
 */
export async function startE2EService(role, runtime) {
  await prepareE2ERuntime(runtime);
  const port = role === "server" ? runtime.serverPort : runtime.webPort;
  await writeE2EProcessState(runtime, {
    role,
    pid: process.pid,
    port,
    status: "starting",
  });

  let service;
  try {
    service = role === "server"
      ? await startNestServer(runtime)
      : await startViteServer(runtime);
    await writeE2EProcessState(runtime, {
      role,
      pid: process.pid,
      port,
      status: "ready",
    });
    return service;
  } catch (error) {
    await service?.close().catch(() => undefined);
    await writeE2EProcessState(runtime, {
      role,
      pid: process.pid,
      port,
      status: "failed",
    }).catch(() => undefined);
    await recoverE2EStartupFailure(runtime, process.pid).catch((cleanupError) => {
      console.error(
        `[e2e-${role}] startup cleanup refused: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    });
    throw error;
  }
}

async function startNestServer(runtime) {
  const requireFromServer = createRequire(path.join(runtime.repoRoot, "apps", "server", "package.json"));
  if (process.env.AIROAMING_PERSISTENCE_MODE === "db") {
    await execFileAsync(process.execPath, [
      path.join(runtime.repoRoot, "apps", "server", "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(runtime.repoRoot, "apps", "server", "prisma", "schema.prisma"),
    ], { cwd: runtime.repoRoot, env: process.env });
  }
  const nestCoreUrl = pathToFileURL(requireFromServer.resolve("@nestjs/core")).href;
  const appModuleUrl = pathToFileURL(path.join(runtime.repoRoot, "apps", "server", "src", "app.module.ts")).href;
  const workerServiceUrl = pathToFileURL(path.join(runtime.repoRoot, "apps", "server", "src", "projects", "persistent-task-worker.service.ts")).href;
  const importWorkerServiceUrl = pathToFileURL(path.join(runtime.repoRoot, "apps", "server", "src", "dialogue", "script-import-worker.service.ts")).href;
  const [{ NestFactory }, { AppModule }, { PersistentTaskWorkerService }, { ScriptImportWorkerService }] = await Promise.all([
    import(nestCoreUrl),
    import(appModuleUrl),
    import(workerServiceUrl),
    import(importWorkerServiceUrl),
  ]);
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ["error", "warn"],
  });
  app.setGlobalPrefix("api");
  if (process.env.AIROAMING_PERSISTENCE_MODE === "db") {
    app.get(PersistentTaskWorkerService).start(`e2e-worker-${runtime.runId}`);
    app.get(ScriptImportWorkerService).start();
  }
  try {
    await app.listen(runtime.serverPort, LOOPBACK_HOST);
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
  return {
    url: runtime.serverUrl,
    close: () => app.close(),
  };
}

async function startViteServer(runtime) {
  const webRoot = path.join(runtime.repoRoot, "apps", "web");
  const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
  const vitePackageDir = path.dirname(requireFromWeb.resolve("vite/package.json"));
  const viteUrl = pathToFileURL(path.join(vitePackageDir, "dist", "node", "index.js")).href;
  const viteModule = await import(viteUrl);
  const createServer = viteModule.createServer ?? viteModule.default?.createServer;
  if (typeof createServer !== "function") {
    throw new Error("E2E_VITE_CREATE_SERVER_MISSING");
  }
  const vite = await createServer(createE2EViteConfig(runtime));
  try {
    await vite.listen();
  } catch (error) {
    await vite.close().catch(() => undefined);
    throw error;
  }
  return {
    url: runtime.webUrl,
    close: () => vite.close(),
  };
}

export function createE2EViteConfig(runtime) {
  const webRoot = path.join(runtime.repoRoot, "apps", "web");
  return {
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    mode: `e2e-${runtime.runId}`,
    logLevel: "warn",
    resolve: {
      alias: [{
        find: "@airoaming/shared",
        replacement: path.join(runtime.repoRoot, "packages", "shared", "src", "index.ts"),
      }],
    },
    optimizeDeps: {
      exclude: ["@airoaming/shared"],
    },
    server: {
      host: LOOPBACK_HOST,
      port: runtime.webPort,
      strictPort: true,
      open: false,
    },
  };
}

async function runCli() {
  const role = parseE2EServiceIdentity(process.argv.slice(2), process.env.AIROAMING_E2E_RUN_ID);
  const runtime = createE2ERuntime();
  const service = await startE2EService(role, runtime);
  console.log(`[e2e-${role}] ready ${service.url} run=${runtime.runId}`);

  let shutdownPromise;
  const shutdown = () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      const port = role === "server" ? runtime.serverPort : runtime.webPort;
      await writeE2EProcessState(runtime, {
        role,
        pid: process.pid,
        port,
        status: "stopping",
      }).catch(() => undefined);
      await service.close();
      if (role === "server") {
        await cleanupE2EWorkspace(runtime);
      }
      await writeE2EProcessState(runtime, {
        role,
        pid: process.pid,
        port,
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
          console.error(`[e2e-${role}] shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        },
      );
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`[e2e-service] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
