import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaService } from "./prisma.service.js";
import {
  LocalDbRuntimeError,
  assertLocalDbRuntimeDatabaseFile,
  assertLocalDbRuntimeState,
  resolveLocalDbRuntimeProfile,
} from "./local-db-runtime.js";

type LocalDevTarget = "all" | "server";

function parseTarget(args: readonly string[]): LocalDevTarget {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length !== 1 || (normalized[0] !== "all" && normalized[0] !== "server")) {
    throw new LocalDbRuntimeError("LOCAL_DB_RUNTIME_ARGS_INVALID");
  }
  return normalized[0];
}

async function verifyRuntime(): Promise<void> {
  const profile = resolveLocalDbRuntimeProfile(process.env, os.homedir());
  process.env.AIROAMING_PERSISTENCE_MODE = profile.persistenceMode;
  process.env.AIROAMING_DATA_ROOT = profile.dataRoot;
  process.env.AIROAMING_WORKSPACE_ROOT = profile.workspaceRoot;
  process.env.DATABASE_URL = profile.databaseUrl;

  await assertLocalDbRuntimeDatabaseFile(profile.databasePath);

  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const state = await prisma.database().persistenceState.findUnique({
      where: { id: "primary" },
      select: { activationState: true, activatedAt: true },
    });
    assertLocalDbRuntimeState(state);
  } finally {
    await prisma.onModuleDestroy();
  }
}

async function runChild(target: LocalDevTarget): Promise<number> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const args = target === "all"
    ? ["--parallel", "--filter", "@airoaming/server", "--filter", "@airoaming/web", "dev"]
    : ["--filter", "@airoaming/server", "dev"];
  const child = spawn("pnpm", args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  return await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 1);
    });
  });
}

async function main(): Promise<number> {
  const target = parseTarget(process.argv.slice(2));
  await verifyRuntime();
  return runChild(target);
}

main().then((code) => {
  process.exitCode = code;
}).catch((error: unknown) => {
  const code = error instanceof LocalDbRuntimeError
    ? error.code
    : error instanceof Error
      ? error.message
      : "LOCAL_DB_RUNTIME_START_FAILED";
  process.stderr.write(`${code}\n`);
  process.stderr.write("标准开发入口只连接已激活的 DB-only 运行实例，未回退到文件模式。请先按既有切换/恢复流程准备运行数据。\n");
  process.exitCode = 1;
});
