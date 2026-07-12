import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { MigrationAuditError, MigrationAuditService } from "./migration-audit.service.js";

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
  await rename(temporary, filePath);
  try { await unlink(temporary); } catch { /* rename completed */ }
}

async function main(): Promise<number> {
  const snapshot = path.resolve(required("--snapshot"));
  const reportPath = path.resolve(required("--report"));
  const formatIndex = process.argv.indexOf("--format");
  const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : undefined;
  if (format !== undefined && format !== "json") throw new MigrationAuditError("MIGRATION_AUDIT_ARGS_INVALID");
  const result = await new MigrationAuditService().auditComicFormats(snapshot);
  await writePrivateJson(reportPath, result.report);
  process.stdout.write(`${JSON.stringify({ code: result.run.status === "blocked" ? "MIGRATION_AUDIT_BLOCKED" : "MIGRATION_AUDIT_OK", runId: result.run.id, status: result.run.status, reportDigest: result.report.reportDigest })}\n`);
  return result.run.status === "blocked" ? 2 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof MigrationAuditError ? error.code : "MIGRATION_AUDIT_FAILED"}\n`);
  process.exitCode = 1;
}
