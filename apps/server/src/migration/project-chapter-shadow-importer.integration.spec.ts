import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { createMigrationDecisionArtifact, type MigrationDecisionEntry } from "./migration-decision.js";
import { buildComicFormatIssue } from "./migration-issue.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { ProjectChapterShadowImporter } from "./project-chapter-shadow-importer.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { SnapshotService } from "./snapshot.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const schemaPath = path.join(repoRoot, "apps/server/prisma/schema.prisma");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const SOURCE = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ENV_NAMES = ["AIROAMING_PERSISTENCE_MODE", "DATABASE_URL"] as const;

async function deploy(databaseUrl: string): Promise<void> {
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
}

async function createSnapshot(root: string, formats: Record<string, string>, options: { duplicateChapterOrder?: boolean } = {}) {
  const workspace = path.join(root, "workspace");
  const staging = path.join(root, "staging");
  await mkdir(staging);
  for (const [projectId, comicFormat] of Object.entries(formats)) {
    const projectDir = path.join(workspace, "projects", projectId);
    await mkdir(path.join(projectDir, "chapters", "chapter-001"), { recursive: true });
    await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify({ id: projectId, name: `项目 ${projectId}`, type: "comic", comicFormat, genreTags: ["fantasy"], storyTitle: `故事 ${projectId}`, artStyle: "ink", description: "legacy", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", currentChapterId: `${projectId}-chapter-001` })}\n`);
    await writeFile(path.join(projectDir, "chapters", "chapter-001", "chapter.json"), `${JSON.stringify({ id: `${projectId}-chapter-001`, order: 1, title: "第一章", status: "draft", summary: "开端", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" })}\n`);
    await writeFile(path.join(projectDir, "chapters", "chapter-001", "script.md"), "夜色落下。\n");
    if (options.duplicateChapterOrder) {
      await mkdir(path.join(projectDir, "chapters", "chapter-002"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-002", "chapter.json"), `${JSON.stringify({ id: `${projectId}-chapter-002`, order: 1, title: "重复顺序", status: "draft" })}\n`);
      await writeFile(path.join(projectDir, "chapters", "chapter-002", "script.md"), "重复。\n");
    }
  }
  const coordinator = new MaintenanceCoordinator();
  await coordinator.drain();
  await coordinator.close();
  const bundlePath = path.join(root, "runtime-bundle.json");
  await new RuntimeBundleFileService().writeAtomic(bundlePath, await coordinator.createRuntimeBundle());
  return new SnapshotService().createSnapshot({ workspaceRoot: workspace, stagingRoot: staging, runtimeBundle: bundlePath });
}

describe("G3-M3-A2 Project/Chapter shadow importer", () => {
  let root: string | null = null;
  let prisma: PrismaService | null = null;
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]] as const));

  async function prepare() {
    root = await mkdtemp(path.join(os.tmpdir(), "airoaming-g3-shadow-"));
    const databasePath = path.join(root, "db.sqlite");
    const handle = await open(databasePath, "wx", 0o600);
    await handle.close();
    const databaseUrl = `file:${databasePath}`;
    await deploy(databaseUrl);
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.onModuleInit();
    return { root, repository: new PrismaMigrationLedgerRepository(prisma) };
  }

  async function writeDecisions(snapshot: Awaited<ReturnType<SnapshotService["createSnapshot"]>>, entries: MigrationDecisionEntry[]) {
    const decisionsPath = path.join(root!, "decisions.json");
    await writeFile(decisionsPath, `${JSON.stringify(createMigrationDecisionArtifact(snapshot.sourceManifest.manifestDigest, entries), null, 2)}\n`);
    return decisionsPath;
  }

  afterEach(async () => {
    await prisma?.onModuleDestroy();
    prisma = null;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it("IMP-A2-01 imports canonical and page_horizontal projects with stable IDs", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll", p2: "page_horizontal" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const result = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-1", startedAt: "2026-07-12T00:00:00.000Z" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary).toMatchObject({ projectCount: 2, importedCount: 2, entityCounts: { Project: 2, Chapter: 2 } });
    const projects = await prisma!.database().project.findMany({ orderBy: { name: "asc" } });
    expect(projects).toHaveLength(2);
    expect(projects.map((project) => project.comicFormat)).toEqual(["vertical_scroll", "paged_comic"]);
    expect(projects.every((project) => project.id.startsWith("project_"))).toBe(true);
    expect(await prisma!.database().chapter.count()).toBe(2);
    expect(await prisma!.database().importedEntitySource.count()).toBe(4);
    expect((await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().project.count()).toBe(2);
    expect(await prisma!.database().chapter.count()).toBe(2);
  }, 30_000);

  it("IMP-A2-02 leaves a decision_required project uninserted and blocks the run", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "four_panel", p2: "vertical_scroll" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const result = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-blocked" });
    expect(result.run.status).toBe("blocked");
    expect(result.report.summary.unresolvedBlockerCount).toBe(1);
    expect(await prisma!.database().project.count()).toBe(1);
    expect(await prisma!.database().project.findFirstOrThrow()).toMatchObject({ comicFormat: "vertical_scroll" });
    expect(await prisma!.database().migrationIssue.count({ where: { runId: "shadow-a2-blocked", resolutionStatus: "open" } })).toBe(1);
  }, 30_000);

  it("IMP-A2-03 consumes a matching four_panel decision before Project INSERT", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "four_panel" });
    const projectItem = snapshot.sourceManifest.items.find((item) => item.storageKey === "projects/p1/project.json")!;
    const issue = buildComicFormatIssue({ runId: "ignored", projectId: "p1", sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, mapping: mapLegacyComicFormat("four_panel"), createdAt: "2026-07-12T00:00:00.000Z" })!;
    const decisionsPath = await writeDecisions(snapshot, [{ issueKey: issue.issueKey, sourceKey: "workspace-v1:p1:Project:p1", sourceDigest: projectItem.sha256, action: "set_comic_format", chosenComicFormat: "paged_comic", layoutPresetIntent: "four_panel" }]);
    const result = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-resolved" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.projects[0]).toMatchObject({ mappingKind: "decision_required", resolutionStatus: "resolved", importStatus: "imported", targetComicFormat: "paged_comic" });
    expect(await prisma!.database().project.findFirstOrThrow()).toMatchObject({ comicFormat: "paged_comic" });
    expect(await prisma!.database().migrationIssue.findFirstOrThrow()).toMatchObject({ resolutionStatus: "resolved" });
  }, 30_000);

  it("IMP-A2-04 rolls back the whole shadow transaction on a chapter constraint failure", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { duplicateChapterOrder: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await expect(new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-rollback" })).rejects.toThrow();
    expect(await prisma!.database().project.count()).toBe(0);
    expect(await prisma!.database().chapter.count()).toBe(0);
    expect((await prisma!.database().migrationRun.findUniqueOrThrow({ where: { id: "shadow-a2-rollback" } })).status).toBe("failed");
  }, 30_000);
});
