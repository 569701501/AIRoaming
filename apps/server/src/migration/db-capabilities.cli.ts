import { readJsonFormat } from "../cli-format.js";
import {
  assertDbCapabilityRegistry,
  getBlockedDbCapabilities,
  getDbCapabilityRegistry,
} from "./db-capability-registry.js";

class DbCapabilityCliError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function parseArgs(args: readonly string[]): { check: boolean } {
  const format = readJsonFormat(args, () => new DbCapabilityCliError("DB_CAPABILITIES_ARGS_INVALID"));
  if (format !== "json") throw new DbCapabilityCliError("DB_CAPABILITIES_ARGS_INVALID");
  const checkFlags = args.filter((arg) => arg === "--check");
  if (checkFlags.length > 1 || args.some((arg, index) => arg !== "--check"
    && arg !== "--format"
    && arg !== "json")) {
    throw new DbCapabilityCliError("DB_CAPABILITIES_ARGS_INVALID");
  }
  return { check: checkFlags.length === 1 };
}

async function main(args = process.argv.slice(2)): Promise<number> {
  const { check } = parseArgs(args);
  const capabilities = getDbCapabilityRegistry();
  assertDbCapabilityRegistry(capabilities);
  const blocked = getBlockedDbCapabilities(capabilities);
  if (check && blocked.length > 0) {
    process.stdout.write(`${JSON.stringify({ code: "MIGRATION_CAPABILITY_BLOCKED", capabilities, blockedIds: blocked.map((entry) => entry.id) })}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify({ code: "DB_CAPABILITIES_REPORTED", capabilities, blockedIds: blocked.map((entry) => entry.id) })}\n`);
  return 0;
}

main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error: unknown) => {
  const code = error instanceof DbCapabilityCliError ? error.code : "DB_CAPABILITIES_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
