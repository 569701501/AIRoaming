import * as path from "node:path";
import { PrismaService } from "../persistence/prisma.service.js";
import { DbActivateError, DbActivateService, type DbActivateMode } from "./db-activate.service.js";

const VALUE_FLAGS = ["--format", "--database-url", "--run-id", "--source-manifest-digest", "--effective-manifest-digest", "--release-root", "--backup", "--gate"] as const;

class ActivateCliError extends Error {
  constructor(readonly code: string) { super(code); }
}

function parse(args: readonly string[]): { values: Record<string, string>; mode: DbActivateMode } {
  const values: Record<string, string> = {};
  let mode: DbActivateMode | undefined;
  const allowed = new Set<string>([...VALUE_FLAGS, "--dry-run", "--execute"]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
    if (flag === "--dry-run" || flag === "--execute") {
      if (mode !== undefined) throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
      mode = flag.slice(2) as DbActivateMode;
      continue;
    }
    if (values[flag] !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
    values[flag] = args[index + 1];
    index += 1;
  }
  for (const flag of VALUE_FLAGS) if (values[flag] === undefined) throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
  if (mode === undefined || values["--format"] !== "json" || values["--gate"] !== "ACT-08") throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
  if (!values["--database-url"].startsWith("file:") || !path.isAbsolute(values["--database-url"].slice("file:".length))) throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
  for (const flag of ["--release-root", "--backup"] as const) if (!path.isAbsolute(values[flag]) || values[flag].includes("\0")) throw new ActivateCliError("ACTIVATE_ARGS_INVALID");
  return { values, mode };
}

async function main(args = process.argv.slice(2)): Promise<number> {
  const { values, mode } = parse(args);
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  process.env.DATABASE_URL = values["--database-url"];
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const result = await new DbActivateService(prisma).activate({
      runId: values["--run-id"],
      sourceManifestDigest: values["--source-manifest-digest"],
      effectiveManifestDigest: values["--effective-manifest-digest"],
      releaseRoot: values["--release-root"],
      backup: values["--backup"],
      gate: "ACT-08",
      mode,
    });
    process.stdout.write(`${JSON.stringify({ code: mode === "dry-run" ? "ACTIVATE_DRY_RUN_OK" : "ACTIVATE_OK", ...result })}\n`);
    return 0;
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  process.stderr.write(`${error instanceof DbActivateError || error instanceof ActivateCliError ? error.code : "ACTIVATE_FAILED"}\n`);
  process.exitCode = 1;
});

