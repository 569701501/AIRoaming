import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { PrismaService } from "../persistence/prisma.service.js";
import { ShadowImportError, ProjectChapterShadowImporter } from "./project-chapter-shadow-importer.js";
import { ScriptOutlineShadowImporter, ScriptOutlineShadowImportError } from "./script-outline-shadow-importer.js";
import { ScriptPendingRevisionShadowImporter, ScriptPendingRevisionShadowImportError } from "./script-pending-revision-shadow-importer.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
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
  const kind = required("--kind");
  if (kind !== "shadow") throw new ShadowImportError("MIGRATION_FINAL_IMPORT_NOT_READY");
  const sliceIndex = process.argv.indexOf("--slice");
  const slice = sliceIndex >= 0 ? process.argv[sliceIndex + 1] : "project-chapter";
  if (slice !== "project-chapter" && slice !== "script-outline" && slice !== "script-pending-revision") throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
  const snapshot = path.resolve(required("--snapshot"));
  const decisions = path.resolve(required("--decisions"));
  const databaseUrl = required("--database-url");
  const reportPath = path.resolve(required("--report"));
  const formatIndex = process.argv.indexOf("--format");
  const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : undefined;
  if (format !== undefined && format !== "json") throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
  if (!databaseUrl.startsWith("file:")) throw new ShadowImportError("MIGRATION_DATABASE_URL_INVALID");
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    const result = slice === "script-outline"
      ? await new ScriptOutlineShadowImporter(prisma).import(snapshot, decisions)
      : slice === "script-pending-revision"
        ? await new ScriptPendingRevisionShadowImporter(prisma).import(snapshot, decisions)
        : await new ProjectChapterShadowImporter(prisma).import(snapshot, decisions);
    await writePrivateJson(reportPath, result.report);
    process.stdout.write(`${JSON.stringify({ code: result.run.status === "blocked" ? "MIGRATION_IMPORT_BLOCKED" : "MIGRATION_IMPORT_OK", runId: result.run.id, status: result.run.status, reportDigest: result.report.reportDigest })}\n`);
    return result.run.status === "blocked" ? 2 : 0;
  } finally {
    await prisma.onModuleDestroy();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  const code = error instanceof ShadowImportError || error instanceof ScriptOutlineShadowImportError || error instanceof ScriptPendingRevisionShadowImportError
    ? error.code
    : error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
