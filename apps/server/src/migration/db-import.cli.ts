import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { PrismaService } from "../persistence/prisma.service.js";
import { ShadowImportError, ProjectChapterShadowImporter } from "./project-chapter-shadow-importer.js";
import { ScriptOutlineShadowImporter, ScriptOutlineShadowImportError } from "./script-outline-shadow-importer.js";
import { ScriptPendingRevisionShadowImporter, ScriptPendingRevisionShadowImportError } from "./script-pending-revision-shadow-importer.js";
import { StoryShadowImporter, StoryShadowImportError } from "./story-shadow-importer.js";
import { StoryboardShadowImporter, StoryboardShadowImportError } from "./storyboard-shadow-importer.js";
import { CharacterShadowImporter, CharacterShadowImportError } from "./character-shadow-importer.js";
import { AssetShadowImporter, AssetShadowImportError } from "./asset-shadow-importer.js";
import { AssetVisualShadowImporter, AssetVisualShadowImportError } from "./asset-visual-shadow-importer.js";
import { PreflightShadowImporter, PreflightShadowImportError } from "./preflight-shadow-importer.js";
import { TaskShadowImporter, TaskShadowImportError } from "./task-shadow-importer.js";
import { CandidateShadowImporter, CandidateShadowImportError } from "./candidate-shadow-importer.js";
import { CandidateLockShadowImporter, CandidateLockShadowImportError } from "./candidate-lock-shadow-importer.js";
import { LayoutShadowImporter, LayoutShadowImportError } from "./layout-shadow-importer.js";
import { ExportShadowImporter, ExportShadowImportError } from "./export-shadow-importer.js";
import { ProviderShadowImporter, ProviderShadowImportError } from "./provider-shadow-importer.js";
import { DialogueShadowImporter, DialogueShadowImportError } from "./dialogue-shadow-importer.js";
import { FullShadowImporter } from "./full-shadow-importer.js";

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
  if (slice !== "full" && slice !== "project-chapter" && slice !== "script-outline" && slice !== "script-pending-revision" && slice !== "story" && slice !== "storyboard" && slice !== "preflight" && slice !== "tasks" && slice !== "candidates" && slice !== "candidate-locks" && slice !== "layout" && slice !== "exports" && slice !== "providers" && slice !== "dialogue" && slice !== "characters" && slice !== "assets" && slice !== "asset-visuals") throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
  const snapshot = path.resolve(required("--snapshot"));
  const decisions = path.resolve(required("--decisions"));
  const databaseUrl = required("--database-url");
  const reportPath = path.resolve(required("--report"));
  const workspaceRootIndex = process.argv.indexOf("--workspace-root");
  const workspaceRootValue = workspaceRootIndex >= 0 ? process.argv[workspaceRootIndex + 1] : undefined;
  const workspaceRoot = workspaceRootValue ? path.resolve(workspaceRootValue) : undefined;
  if ((slice === "asset-visuals" || slice === "full") && !workspaceRoot) throw new ShadowImportError("MIGRATION_WORKSPACE_ROOT_INVALID");
  const formatIndex = process.argv.indexOf("--format");
  const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : undefined;
  if (format !== undefined && format !== "json") throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
  if (!databaseUrl.startsWith("file:")) throw new ShadowImportError("MIGRATION_DATABASE_URL_INVALID");
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    if (slice === "full") {
      const prefixIndex = process.argv.indexOf("--run-id-prefix");
      const runIdPrefix = prefixIndex >= 0 ? process.argv[prefixIndex + 1] : undefined;
      const result = await new FullShadowImporter(prisma).import(snapshot, decisions, { workspaceRoot: workspaceRoot!, runIdPrefix });
      await writePrivateJson(reportPath, result);
      process.stdout.write(`${JSON.stringify({ code: result.status === "blocked" ? "MIGRATION_IMPORT_BLOCKED" : "MIGRATION_IMPORT_OK", status: result.status, reportDigest: result.reportDigest })}\n`);
      return result.status === "blocked" ? 2 : 0;
    }
    const result = slice === "script-outline"
      ? await new ScriptOutlineShadowImporter(prisma).import(snapshot, decisions)
      : slice === "script-pending-revision"
        ? await new ScriptPendingRevisionShadowImporter(prisma).import(snapshot, decisions)
        : slice === "story"
          ? await new StoryShadowImporter(prisma).import(snapshot, decisions)
          : slice === "storyboard"
            ? await new StoryboardShadowImporter(prisma).import(snapshot, decisions)
            : slice === "characters"
              ? await new CharacterShadowImporter(prisma).import(snapshot, decisions)
              : slice === "assets"
                ? await new AssetShadowImporter(prisma).import(snapshot, decisions)
                : slice === "asset-visuals"
                  ? await new AssetVisualShadowImporter(prisma).import(snapshot, decisions, { workspaceRoot })
                  : slice === "preflight"
                    ? await new PreflightShadowImporter(prisma).import(snapshot, decisions)
                    : slice === "tasks"
                      ? await new TaskShadowImporter(prisma).import(snapshot, decisions)
                      : slice === "candidates"
                        ? await new CandidateShadowImporter(prisma).import(snapshot, decisions)
                        : slice === "candidate-locks"
                          ? await new CandidateLockShadowImporter(prisma).import(snapshot, decisions)
                          : slice === "layout"
                            ? await new LayoutShadowImporter(prisma).import(snapshot, decisions)
                            : slice === "exports"
                              ? await new ExportShadowImporter(prisma).import(snapshot, decisions)
                              : slice === "providers"
                              ? await new ProviderShadowImporter(prisma).import(snapshot, decisions)
                              : slice === "dialogue"
                                ? await new DialogueShadowImporter(prisma).import(snapshot, decisions)
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
  const code = error instanceof ShadowImportError || error instanceof ScriptOutlineShadowImportError || error instanceof ScriptPendingRevisionShadowImportError || error instanceof StoryShadowImportError || error instanceof StoryboardShadowImportError || error instanceof CharacterShadowImportError || error instanceof AssetShadowImportError || error instanceof AssetVisualShadowImportError || error instanceof PreflightShadowImportError || error instanceof TaskShadowImportError || error instanceof CandidateShadowImportError || error instanceof CandidateLockShadowImportError || error instanceof LayoutShadowImportError || error instanceof ExportShadowImportError || error instanceof ProviderShadowImportError || error instanceof DialogueShadowImportError
    ? error.code
    : error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
