import { PrismaService } from "../persistence/prisma.service.js";
import * as path from "node:path";
import { ReadyCoordinator, ReadyCoordinatorError } from "./ready-coordinator.js";

const READY_FLAGS = ["--format", "--database-url", "--run-id", "--release-root", "--workspace-root", "--secret-store-root", "--maintenance-bundle"] as const;
type ReadyArgs = Record<(typeof READY_FLAGS)[number], string>;

function parseArgs(args: readonly string[]): ReadyArgs {
  const values = {} as Partial<ReadyArgs>;
  const allowed = new Set<string>(READY_FLAGS);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag) || values[flag as keyof ReadyArgs] !== undefined) throw new ReadyCoordinatorError("MIGRATION_READY_ARGS_INVALID");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new ReadyCoordinatorError("MIGRATION_READY_ARGS_INVALID");
    values[flag as keyof ReadyArgs] = value;
    index += 1;
  }
  for (const flag of READY_FLAGS) if (values[flag] === undefined) throw new ReadyCoordinatorError("MIGRATION_READY_ARGS_INVALID");
  if (values["--format"] !== "json") throw new ReadyCoordinatorError("MIGRATION_READY_ARGS_INVALID");
  for (const flag of ["--release-root", "--workspace-root", "--secret-store-root", "--maintenance-bundle"] as const) if (!path.isAbsolute(values[flag]!) || values[flag]!.includes("\0")) throw new ReadyCoordinatorError("MIGRATION_READY_ARGS_INVALID");
  if (!values["--database-url"]!.startsWith("file:") || !path.isAbsolute(values["--database-url"]!.slice("file:".length))) throw new ReadyCoordinatorError("MIGRATION_DATABASE_URL_INVALID");
  return values as ReadyArgs;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = args["--database-url"];
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const result = await new ReadyCoordinator(prisma).markReady({ runId: args["--run-id"], releaseRoot: args["--release-root"], workspaceRoot: args["--workspace-root"], secretStoreRoot: args["--secret-store-root"], maintenanceBundle: args["--maintenance-bundle"] });
    process.stdout.write(`${JSON.stringify({ code: "MIGRATION_READY_FOR_ACTIVATION", ...result })}\n`);
    return 0;
  } finally {
    await prisma.onModuleDestroy();
  }
}

try { process.exitCode = await main(); } catch (error) { process.stderr.write(`${error instanceof ReadyCoordinatorError ? error.code : "MIGRATION_READY_FAILED"}\n`); process.exitCode = 1; }
