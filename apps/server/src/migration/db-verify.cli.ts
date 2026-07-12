import * as path from "node:path";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { PrismaService } from "../persistence/prisma.service.js";
import { MigrationVerifyError, MigrationVerifyService } from "./migration-verify.service.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new MigrationVerifyError("MIGRATION_VERIFY_ARGS_INVALID");
  return value;
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await chmod(temporary, 0o600); await rename(temporary, filePath); try { await unlink(temporary); } catch { /* rename completed */ }
}

async function main(): Promise<number> {
  const snapshot = path.resolve(required("--snapshot"));
  const databaseUrl = required("--database-url");
  const runId = required("--run-id");
  const reportPath = path.resolve(required("--report"));
  const workspaceRoot = path.resolve(required("--workspace-root"));
  if (!databaseUrl.startsWith("file:")) throw new MigrationVerifyError("MIGRATION_DATABASE_URL_INVALID");
  process.env.AIROAMING_PERSISTENCE_MODE = "db"; process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaService();
  try { await prisma.onModuleInit(); const result = await new MigrationVerifyService(prisma).verify(snapshot, runId, workspaceRoot); await writePrivateJson(reportPath, result.report); process.stdout.write(`${JSON.stringify({ code: result.report.passed ? "MIGRATION_VERIFY_OK" : "MIGRATION_VERIFY_FAILED", runId, passed: result.report.passed, reportDigest: result.report.reportDigest })}\n`); return result.report.passed ? 0 : 2; } finally { await prisma.onModuleDestroy(); }
}

try { process.exitCode = await main(); } catch (error) { process.stderr.write(`${error instanceof MigrationVerifyError ? error.code : "MIGRATION_VERIFY_FAILED"}\n`); process.exitCode = 1; }
