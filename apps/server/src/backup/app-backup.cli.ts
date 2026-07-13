import * as path from "node:path";
import { PrismaService } from "../persistence/prisma.service.js";
import { readJsonFormat } from "../cli-format.js";
import { AppBackupService, BackupError } from "./app-backup.service.js";
import type { BackupInput } from "./backup.types.js";

class BackupCliError extends Error {
  constructor(readonly code: string) { super(code); }
}

const REQUIRED = ["--database-url", "--workspace-root", "--data-root", "--release-root", "--app-commit", "--maintenance-bundle", "--full-import-report", "--decisions", "--output", "--kind"] as const;

function readSingle(args: readonly string[], name: string): string {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1 || !args[indexes[0] + 1] || args[indexes[0] + 1].startsWith("--")) throw new BackupCliError("BACKUP_ARGS_INVALID");
  return args[indexes[0] + 1];
}

function requireAbsoluteArgument(value: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new BackupCliError("BACKUP_ARGS_INVALID");
  return value;
}

function assertExactArguments(args: readonly string[], valueNames: readonly string[]): void {
  const allowed = new Set([...valueNames, "--format"]);
  const consumed = new Set<number>();
  for (let index = 0; index < args.length; index += 1) {
    if (consumed.has(index)) continue;
    const argument = args[index];
    if (!argument.startsWith("--") || !allowed.has(argument)) throw new BackupCliError("BACKUP_ARGS_INVALID");
    if (argument === "--format") {
      if (args[index + 1] !== "json") throw new BackupCliError("BACKUP_ARGS_INVALID");
      consumed.add(index);
      consumed.add(index + 1);
      continue;
    }
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new BackupCliError("BACKUP_ARGS_INVALID");
    consumed.add(index);
    consumed.add(index + 1);
  }
}

function parseArgs(args: readonly string[]): BackupInput {
  assertExactArguments(args, REQUIRED);
  if (readJsonFormat(args, () => new BackupCliError("BACKUP_ARGS_INVALID")) !== "json") throw new BackupCliError("BACKUP_ARGS_INVALID");
  const values = Object.fromEntries(REQUIRED.map((name) => [name, readSingle(args, name)])) as Record<string, string>;
  if (values["--kind"] !== "coordinated" && values["--kind"] !== "pre-cutover") throw new BackupCliError("BACKUP_ARGS_INVALID");
  if (values["--kind"] === "pre-cutover") throw new BackupCliError("MIGRATION_CAPABILITY_BLOCKED");
  return {
    databaseUrl: values["--database-url"],
    workspaceRoot: requireAbsoluteArgument(values["--workspace-root"]),
    dataRoot: requireAbsoluteArgument(values["--data-root"]),
    releaseRoot: requireAbsoluteArgument(values["--release-root"]),
    appCommit: values["--app-commit"],
    maintenanceBundle: requireAbsoluteArgument(values["--maintenance-bundle"]),
    fullImportReport: requireAbsoluteArgument(values["--full-import-report"]),
    decisions: requireAbsoluteArgument(values["--decisions"]),
    output: requireAbsoluteArgument(values["--output"]),
    kind: "coordinated",
  };
}

async function main(args = process.argv.slice(2)): Promise<number> {
  const input = parseArgs(args);
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  process.env.DATABASE_URL = input.databaseUrl;
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const result = await new AppBackupService(prisma).backup(input);
    process.stdout.write(JSON.stringify({ code: "BACKUP_OK", bundle: path.basename(result.bundlePath), bundleDigest: result.bundleDigest, manifestDigest: result.manifestDigest, assetCount: result.assetCount, runCount: result.runCount }) + "\n");
    return 0;
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
  const code = error instanceof BackupError || error instanceof BackupCliError || error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "BACKUP_FAILED";
  process.stderr.write(code + "\n");
  process.exitCode = code === "MIGRATION_CAPABILITY_BLOCKED" ? 2 : 1;
});
