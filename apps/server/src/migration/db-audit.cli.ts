import * as path from "node:path";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { PrismaService } from "../persistence/prisma.service.js";
import { MigrationAuditError } from "./migration-audit.service.js";
import { DatabaseMigrationAuditService } from "./db-audit.service.js";
import { readJsonFormat } from "../cli-format.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new MigrationAuditError("MIGRATION_AUDIT_ARGS_INVALID");
  return value;
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  await rename(temporary, filePath);
  try { await unlink(temporary); } catch { /* rename completed */ }
}

async function main(): Promise<number> {
  const snapshot = path.resolve(required("--snapshot"));
  const databaseUrl = required("--database-url");
  const report = path.resolve(required("--report"));
  readJsonFormat(process.argv, () => new MigrationAuditError("MIGRATION_AUDIT_ARGS_INVALID"));
  if (!databaseUrl.startsWith("file:")) throw new MigrationAuditError("MIGRATION_DATABASE_URL_INVALID");
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const result = await new DatabaseMigrationAuditService(prisma).auditComicFormats(snapshot);
    await writePrivateJson(report, result.report);
    process.stdout.write(`${JSON.stringify({ code: result.run.status === "blocked" ? "MIGRATION_AUDIT_BLOCKED" : "MIGRATION_AUDIT_OK", runId: result.run.id, status: result.run.status, reportDigest: result.report.reportDigest })}\n`);
    return result.run.status === "blocked" ? 2 : 0;
  } finally {
    await prisma.onModuleDestroy();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof MigrationAuditError ? error.code : "MIGRATION_AUDIT_FAILED"}\n`);
  process.exitCode = 1;
}
