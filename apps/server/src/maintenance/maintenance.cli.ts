import { chmod, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import * as path from "node:path";
import { readJsonFormat } from "../cli-format.js";

type Action = "status" | "drain" | "close" | "bundle" | "reopen";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  throw new Error("MAINTENANCE_USAGE");
}

async function main(): Promise<void> {
  const format = readJsonFormat(process.argv, () => new Error("MAINTENANCE_FORMAT_INVALID"));
  const action = process.argv[2] as Action | undefined;
  if (!action || !["status", "drain", "close", "bundle", "reopen"].includes(action)) usage();
  const baseArg = arg("--base-url");
  const tokenPath = arg("--token-file");
  if (!baseArg) throw new Error("MAINTENANCE_BASE_URL_REQUIRED");
  if (!tokenPath) throw new Error("MAINTENANCE_TOKEN_FILE_REQUIRED");
  const baseUrl = baseArg.replace(/\/$/, "");
  let token: string;
  try {
    if ((await stat(tokenPath)).mode & 0o077) throw new Error("MAINTENANCE_TOKEN_FILE_PERMISSIONS");
    token = (await readFile(tokenPath, "utf8")).trim();
  } catch (error) {
    if (error instanceof Error && error.message === "MAINTENANCE_TOKEN_FILE_PERMISSIONS") throw error;
    throw new Error("MAINTENANCE_TOKEN_INVALID");
  }
  if (!token) throw new Error("MAINTENANCE_TOKEN_INVALID");
  const body = action === "drain" && arg("--timeout-ms") ? { timeoutMs: Number(arg("--timeout-ms")) } : undefined;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/_local/maintenance/${action}`, {
      method: action === "status" ? "GET" : "POST",
      headers: { "X-AIRoaming-Maintenance-Token": token, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("MAINTENANCE_REQUEST_FAILED");
  }
  const payload = await response.json() as { success?: boolean; data?: unknown; error?: { code?: string } };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.code || `MAINTENANCE_HTTP_${response.status}`);
  }
  if (action === "bundle") {
    const output = arg("--output");
    if (!output) throw new Error("MAINTENANCE_BUNDLE_OUTPUT_REQUIRED");
    await writePrivateAtomic(output, JSON.stringify(payload.data, null, 2) + "\n");
  }
  if (format === "json") {
    process.stdout.write(JSON.stringify(payload.data) + "\n");
  } else if (action !== "bundle") {
    process.stdout.write(`${action.toUpperCase()}_OK\n`);
  }
}

async function writePrivateAtomic(output: string, content: string): Promise<void> {
  const target = path.resolve(output);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  await rename(temporary, target);
  try { await unlink(temporary); } catch { /* renamed successfully */ }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "MAINTENANCE_FAILED"}\n`);
  process.exitCode = 1;
});
