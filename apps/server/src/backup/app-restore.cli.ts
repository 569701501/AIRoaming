import * as path from "node:path";
import { readJsonFormat } from "../cli-format.js";
import { AppRestoreService, RestoreError, type RestoreInput, type RestoreMode } from "./app-restore.service.js";

class RestoreCliError extends Error {
  constructor(readonly code: string) { super(code); }
}

function readSingle(args: readonly string[], name: string): string {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1 || !args[indexes[0] + 1] || args[indexes[0] + 1].startsWith("--")) throw new RestoreCliError("RESTORE_ARGS_INVALID");
  return args[indexes[0] + 1];
}

function absolute(value: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new RestoreCliError("RESTORE_ARGS_INVALID");
  return value;
}

function assertExactArguments(args: readonly string[], valueNames: readonly string[]): void {
  const allowed = new Set([...valueNames, "--format"]);
  const consumed = new Set<number>();
  for (let index = 0; index < args.length; index += 1) {
    if (consumed.has(index)) continue;
    const argument = args[index];
    if (!argument.startsWith("--") || !allowed.has(argument)) throw new RestoreCliError("RESTORE_ARGS_INVALID");
    if (argument === "--format") {
      if (args[index + 1] !== "json") throw new RestoreCliError("RESTORE_ARGS_INVALID");
      consumed.add(index);
      consumed.add(index + 1);
      continue;
    }
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new RestoreCliError("RESTORE_ARGS_INVALID");
    consumed.add(index);
    consumed.add(index + 1);
  }
}

function parseArgs(args: readonly string[]): RestoreInput {
  const names = ["--backup", "--target-data-root", "--target-workspace-root", "--mode"] as const;
  assertExactArguments(args, names);
  if (readJsonFormat(args, () => new RestoreCliError("RESTORE_ARGS_INVALID")) !== "json") throw new RestoreCliError("RESTORE_ARGS_INVALID");
  const values = Object.fromEntries(names.map((name) => [name, readSingle(args, name)])) as Record<string, string>;
  if (values["--mode"] !== "verify-only" && values["--mode"] !== "materialize") throw new RestoreCliError("RESTORE_ARGS_INVALID");
  return { backup: absolute(values["--backup"]), targetDataRoot: absolute(values["--target-data-root"]), targetWorkspaceRoot: absolute(values["--target-workspace-root"]), mode: values["--mode"] as RestoreMode };
}

async function main(args = process.argv.slice(2)): Promise<number> {
  const input = parseArgs(args);
  const result = await new AppRestoreService().restore(input);
  process.stdout.write(JSON.stringify({ code: "RESTORE_OK", mode: result.mode, bundleDigest: result.bundleDigest, manifestDigest: result.manifestDigest, assetCount: result.assetCount, database: result.database, targetDataRoot: result.targetDataRoot ? path.basename(result.targetDataRoot) : null, targetWorkspaceRoot: result.targetWorkspaceRoot ? path.basename(result.targetWorkspaceRoot) : null }) + "\n");
  return 0;
}

main().then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
  const code = error instanceof RestoreError || error instanceof RestoreCliError || error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "RESTORE_VERIFICATION_FAILED";
  process.stderr.write(code + "\n");
  process.exitCode = 1;
});
