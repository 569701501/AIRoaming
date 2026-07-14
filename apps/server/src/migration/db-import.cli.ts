import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
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
import { FinalImportError, FinalImportOrchestrator } from "./final-importer.js";
import { readJsonFormat } from "../cli-format.js";
import { SecretStoreService } from "../settings/secret-store.js";
import { CutoverCredentialVerifier } from "./cutover-credential-verifier.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
  return value;
}

const FINAL_FLAGS = ["--kind", "--snapshot", "--decisions", "--database-url", "--report", "--workspace-root", "--data-root", "--release-root", "--secret-store-root", "--credential-evidence", "--credential-expectations", "--secret-store-adapter", "--test-only-fake-secret-store", "--run-id", "--format"] as const;
type FinalArgs = Record<(typeof FINAL_FLAGS)[number], string>;

export function parseFinalArgs(args: readonly string[]): FinalArgs {
  const values = {} as Partial<FinalArgs>;
  const allowed = new Set<string>(FINAL_FLAGS);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new FinalImportError("MIGRATION_IMPORT_ARGS_INVALID");
    if (values[flag as keyof FinalArgs] !== undefined) throw new FinalImportError("MIGRATION_IMPORT_ARGS_INVALID");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new FinalImportError("MIGRATION_IMPORT_ARGS_INVALID");
    values[flag as keyof FinalArgs] = value;
    index += 1;
  }
  for (const flag of ["--kind", "--snapshot", "--decisions", "--database-url", "--report", "--workspace-root", "--data-root", "--release-root", "--run-id", "--format"] as const) if (values[flag] === undefined) throw new FinalImportError(flag === "--format" ? "MIGRATION_IMPORT_ARGS_INVALID" : "MIGRATION_FINAL_IMPORT_NOT_READY");
  if (values["--kind"] !== "final" || values["--format"] !== "json") throw new FinalImportError("MIGRATION_IMPORT_ARGS_INVALID");
  const pathFlags = ["--snapshot", "--decisions", "--report", "--workspace-root", "--data-root", "--release-root", "--secret-store-root", "--credential-evidence", "--credential-expectations"] as const;
  for (const flag of pathFlags) {
    const value = values[flag]!;
    if (value === undefined) continue;
    if (!path.isAbsolute(value) || value.includes("\0")) throw new FinalImportError("MIGRATION_IMPORT_ARGS_INVALID");
  }
  if (!values["--database-url"]!.startsWith("file:") || !path.isAbsolute(values["--database-url"]!.slice("file:".length))) throw new FinalImportError("MIGRATION_DATABASE_URL_INVALID");
  if (!values["--run-id"]!.trim()) throw new FinalImportError("MIGRATION_RUN_ID_INVALID");
  if (values["--secret-store-root"] === undefined && (values["--credential-evidence"] === undefined || values["--credential-expectations"] === undefined)) throw new FinalImportError("MIGRATION_CREDENTIAL_EVIDENCE_REQUIRED");
  if (values["--secret-store-root"] !== undefined && (values["--test-only-fake-secret-store"] !== "true" || process.env.NODE_ENV !== "test" || !path.resolve(values["--secret-store-root"]).startsWith(`${os.tmpdir()}${path.sep}`))) throw new FinalImportError("MIGRATION_SECRET_STORE_TEST_ONLY_REQUIRED");
  return values as FinalArgs;
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  let current = path.resolve(filePath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT" ? null : Promise.reject(error));
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  const parent = path.dirname(filePath);
  const existingParent = await lstat(parent).catch(() => null);
  if (existingParent?.isSymbolicLink() || (existingParent && !existingParent.isDirectory())) throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const verifiedParent = await lstat(parent).catch(() => null);
  if (!verifiedParent || verifiedParent.isSymbolicLink() || !verifiedParent.isDirectory()) throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
  const existing = await lstat(filePath).catch(() => null);
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new FinalImportError("MIGRATION_OUTPUT_PATH_UNSAFE");
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
    catch (error) { await handle.close().catch(() => undefined); await rm(temporary, { force: true }).catch(() => undefined); throw error; }
    await handle.close();
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
    const parentHandle = await open(parent, "r");
    try { await parentHandle.sync(); } finally { await parentHandle.close(); }
  } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

async function main(): Promise<number> {
  const kind = required("--kind");
  if (kind === "final") {
    const args = process.argv.slice(2);
    const snapshotIndex = process.argv.indexOf("--snapshot");
    const decisionsIndex = process.argv.indexOf("--decisions");
    const databaseIndex = process.argv.indexOf("--database-url");
    const reportIndex = process.argv.indexOf("--report");
    const workspaceIndex = process.argv.indexOf("--workspace-root");
    const dataIndex = process.argv.indexOf("--data-root");
    const releaseIndex = process.argv.indexOf("--release-root");
    const secretIndex = process.argv.indexOf("--secret-store-root");
    const runIndex = process.argv.indexOf("--run-id");
    const parsed = parseFinalArgs(args);
    const snapshot = parsed["--snapshot"];
    const decisions = parsed["--decisions"];
    const databaseUrl = parsed["--database-url"];
    const reportPath = parsed["--report"];
    const workspaceRoot = parsed["--workspace-root"];
    const dataRoot = parsed["--data-root"];
    const releaseRoot = parsed["--release-root"];
    const secretStoreRoot = parsed["--secret-store-root"];
    const runId = parsed["--run-id"];
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    const prisma = new PrismaService();
    try {
      await prisma.onModuleInit();
      const credentialEvidencePath = parsed["--credential-evidence"];
      const credentialVerifier = credentialEvidencePath ? new CutoverCredentialVerifier(new SecretStoreService()) : undefined;
      const credentialExpectations = parsed["--credential-expectations"] ? JSON.parse(await readFile(parsed["--credential-expectations"], "utf8")) as never : undefined;
      const result = await new FinalImportOrchestrator(prisma).import({ snapshotPath: snapshot, decisionsPath: decisions, databaseUrl, workspaceRoot, dataRoot, releaseRoot, secretStoreRoot, runId, credentialVerifier, credentialEvidencePath, credentialExpectations, requiredSecretStoreAdapter: parsed["--secret-store-adapter"] as "keychain" | "fake" | undefined });
      await writePrivateJson(reportPath, result.report);
      process.stdout.write(`${JSON.stringify({ code: result.run.status === "succeeded" ? "MIGRATION_FINAL_IMPORT_OK" : "MIGRATION_FINAL_IMPORT_BLOCKED", runId: result.run.id, status: result.run.status, reportDigest: result.report.reportDigest })}\n`);
      return result.run.status === "succeeded" ? 0 : 2;
    } finally {
      await prisma.onModuleDestroy();
    }
  }
  if (kind !== "shadow") throw new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID");
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
  readJsonFormat(process.argv, () => new ShadowImportError("MIGRATION_IMPORT_ARGS_INVALID"));
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
  const code = error instanceof FinalImportError || error instanceof ShadowImportError || error instanceof ScriptOutlineShadowImportError || error instanceof ScriptPendingRevisionShadowImportError || error instanceof StoryShadowImportError || error instanceof StoryboardShadowImportError || error instanceof CharacterShadowImportError || error instanceof AssetShadowImportError || error instanceof AssetVisualShadowImportError || error instanceof PreflightShadowImportError || error instanceof TaskShadowImportError || error instanceof CandidateShadowImportError || error instanceof CandidateLockShadowImportError || error instanceof LayoutShadowImportError || error instanceof ExportShadowImportError || error instanceof ProviderShadowImportError || error instanceof DialogueShadowImportError
    ? error.code
    : error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
