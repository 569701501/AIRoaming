import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { PrismaService } from "../persistence/prisma.service.js";
import { G1_RUNTIME_MIGRATION_NAMES } from "../persistence/g1-runtime-migration-ledger.js";
import { PROJECT_PURGE_RUNTIME_MIGRATION_NAMES } from "../persistence/project-purge-runtime-migration-ledger.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectsModule } from "./projects.module.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectDeleteOutboxService } from "./project-delete-outbox.service.js";
import { DialogueModule } from "../dialogue/dialogue.module.js";
import { DialogueService } from "../dialogue/dialogue.service.js";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { ScriptVersionRepository } from "./versioning/script-version.repository.js";
import { ScriptVersionService } from "./versioning/script-version.service.js";
import { StoryVersionRepository } from "./versioning/story-version.repository.js";
import { StoryboardVersionRepository } from "./versioning/storyboard-version.repository.js";
import { ChapterProductionQueryService } from "./versioning/chapter-production-query.service.js";
import { NewWorkGateService } from "./versioning/new-work-gate.service.js";
import { PreflightRevisionService } from "./versioning/preflight-revision.service.js";
import { TaskApplicabilityGuardService } from "./versioning/task-applicability-guard.service.js";
import { PersistentTaskRepository, TaskLeaseLostError } from "../tasks/persistent-task.repository.js";
import { TasksService } from "../tasks/tasks.service.js";
import { PersistentTaskWorkerService } from "./persistent-task-worker.service.js";
import { buildTaskSourceProjection, digestCanonicalJson, encodePreflightDocumentV2, PreflightDocumentCodecV2, encodeScriptTextV1, type StoryDocumentV2, type StoryboardDocumentV2 } from "@airoaming/shared";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const FORMAL_PRISMA_ROOT = path.join(REPO_ROOT, "apps/server/prisma");
const FORMAL_SCHEMA_PATH = path.join(FORMAL_PRISMA_ROOT, "schema.prisma");
const ENVIRONMENT_NAMES = [
  "AIROAMING_PERSISTENCE_MODE",
  "AIROAMING_WORKSPACE_ROOT",
  "AIROAMING_DATA_ROOT",
  "AIROAMING_SECRET_STORE_ADAPTER",
  "AIROAMING_FAKE_SECRET_STORE_ROOT",
  "DATABASE_URL",
] as const;

interface PrismaResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runPrismaDeploy(
  databaseUrl: string,
  schemaPath = FORMAL_SCHEMA_PATH,
): Promise<PrismaResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, "apps/server/node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        schemaPath,
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function copyFormalMigration(
  prismaRoot: string,
  migrationName: (typeof PROJECT_PURGE_RUNTIME_MIGRATION_NAMES)[number],
): Promise<void> {
  const targetDirectory = path.join(prismaRoot, "migrations", migrationName);
  await mkdir(targetDirectory, { recursive: false });
  await writeFile(
    path.join(targetDirectory, "migration.sql"),
    await readFile(
      path.join(FORMAL_PRISMA_ROOT, "migrations", migrationName, "migration.sql"),
    ),
  );
}

async function materializePartialPrismaRoot(
  testRoot: string,
  migrationNames: readonly (typeof PROJECT_PURGE_RUNTIME_MIGRATION_NAMES)[number][],
): Promise<string> {
  const prismaRoot = path.join(testRoot, "partial-prisma");
  await mkdir(path.join(prismaRoot, "migrations"), { recursive: true });
  await writeFile(
    path.join(prismaRoot, "schema.prisma"),
    await readFile(FORMAL_SCHEMA_PATH),
  );
  await writeFile(
    path.join(prismaRoot, "migrations", "migration_lock.toml"),
    await readFile(path.join(FORMAL_PRISMA_ROOT, "migrations", "migration_lock.toml")),
  );
  for (const migrationName of migrationNames) {
    await copyFormalMigration(prismaRoot, migrationName);
  }
  return prismaRoot;
}

function readBusinessFacts(databasePath: string): {
  projects: number;
  chapters: number;
  triggers: number;
} {
  const database = new DatabaseSync(databasePath);
  try {
    return {
      projects: Number(
        (database.prepare('SELECT COUNT(*) AS count FROM "projects"').get() as { count: number | bigint }).count,
      ),
      chapters: Number(
        (database.prepare('SELECT COUNT(*) AS count FROM "chapters"').get() as { count: number | bigint }).count,
      ),
      triggers: Number(
        (database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'").get() as { count: number | bigint }).count,
      ),
    };
  } finally {
    database.close();
  }
}

describe("Project/Chapter/Script DB-only persistence", () => {
  let app: INestApplicationContext | null = null;
  let testRoot: string | null = null;
  let markerPath: string | null = null;
  const previousEnvironment = new Map(
    ENVIRONMENT_NAMES.map((name) => [name, process.env[name]] as const),
  );

  async function prepareDatabase(
    migrationNames: readonly (typeof PROJECT_PURGE_RUNTIME_MIGRATION_NAMES)[number][] =
      PROJECT_PURGE_RUNTIME_MIGRATION_NAMES,
  ): Promise<{
    readonly workspaceRoot: string;
    readonly dataRoot: string;
    readonly databasePath: string;
    readonly databaseUrl: string;
    readonly prismaRoot: string | null;
    readonly deployed: PrismaResult;
  }> {
    const runId = `project-db-${randomUUID()}`;
    testRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), `${runId}-`)));
    markerPath = path.join(testRoot, ".airoaming-test-root");
    await writeFile(
      markerPath,
      `${JSON.stringify({ schemaVersion: 1, owner: "project-db-persistence", runId, root: testRoot })}\n`,
      "utf8",
    );
    const workspaceRoot = path.join(testRoot, "workspace");
    const dataRoot = path.join(testRoot, "data");
    const databasePath = path.join(dataRoot, "db", "airoaming.sqlite");
    await mkdir(path.dirname(databasePath), { recursive: true });
    const handle = await open(databasePath, "wx", 0o600);
    await handle.close();
    const databaseUrl = `file:${databasePath}`;
    const isFormalTree =
      migrationNames.length === PROJECT_PURGE_RUNTIME_MIGRATION_NAMES.length &&
        migrationNames.every(
        (migrationName, index) => migrationName === PROJECT_PURGE_RUNTIME_MIGRATION_NAMES[index],
      );
    const prismaRoot = isFormalTree
      ? null
      : await materializePartialPrismaRoot(testRoot, migrationNames);
    const deployed = await runPrismaDeploy(
      databaseUrl,
      prismaRoot ? path.join(prismaRoot, "schema.prisma") : FORMAL_SCHEMA_PATH,
    );

    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.AIROAMING_WORKSPACE_ROOT = workspaceRoot;
    process.env.AIROAMING_DATA_ROOT = dataRoot;
    process.env.DATABASE_URL = databaseUrl;
    return {
      workspaceRoot,
      dataRoot,
      databasePath,
      databaseUrl,
      prismaRoot,
      deployed,
    };
  }

  afterEach(async () => {
    await app?.close();
    app = null;
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (testRoot && markerPath) {
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
        owner: string;
        root: string;
      };
      expect(marker).toMatchObject({ owner: "project-db-persistence", root: testRoot });
      await rm(testRoot, { recursive: true, force: false });
    }
    testRoot = null;
    markerPath = null;
  });

  it("fails closed when db mode is requested without Prisma DI", async () => {
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    const repository = new ProjectRepository({} as WorkspacePathService);
    await expect(repository.ensureLoaded()).rejects.toThrow(
      "DB_PERSISTENCE_PRISMA_SERVICE_MISSING",
    );
  });

  it("refuses startup on a real 0001-0007 ledger before any business write", async () => {
    const firstSeven = G1_RUNTIME_MIGRATION_NAMES.slice(0, 7);
    const { databasePath, deployed } = await prepareDatabase(firstSeven);
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    expect(deployed.stdout).toContain("7 migrations found");
    expect(readBusinessFacts(databasePath)).toEqual({
      projects: 0,
      chapters: 0,
      triggers: 0,
    });

    await expect(
      NestFactory.createApplicationContext(ProjectsModule, { logger: false }),
    ).rejects.toThrow(
      "DB_PERSISTENCE_PROJECT_PURGE_MIGRATION_LEDGER_MISSING:0008_sqlite_checks_triggers_indexes",
    );
    expect(readBusinessFacts(databasePath)).toEqual({
      projects: 0,
      chapters: 0,
      triggers: 0,
    });
  }, 20_000);

  it("refuses startup on a real P3018 0008 ledger before any business write", async () => {
    const firstSeven = G1_RUNTIME_MIGRATION_NAMES.slice(0, 7);
    const { databasePath, databaseUrl, prismaRoot, deployed } =
      await prepareDatabase(firstSeven);
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    expect(prismaRoot).not.toBeNull();

    const database = new DatabaseSync(databasePath);
    try {
      database.exec("PRAGMA foreign_keys = OFF;");
      database.exec(`INSERT INTO "migration_issues"
        ("id", "run_id", "issue_key", "severity", "code", "detail_json", "detail_schema_version", "resolution_status", "created_at")
        VALUES ('runtime-prisma-orphan', 'missing-run', 'runtime-prisma-orphan', 'info', 'PRISMA_ORPHAN', '{}', 1, 'open', '2026-07-12T00:00:00.000Z');`);
    } finally {
      database.close();
    }

    await copyFormalMigration(
      prismaRoot!,
      "0008_sqlite_checks_triggers_indexes",
    );
    const failed = await runPrismaDeploy(
      databaseUrl,
      path.join(prismaRoot!, "schema.prisma"),
    );
    expect(failed.code).toBe(1);
    expect(`${failed.stdout}\n${failed.stderr}`).toContain("P3018");
    expect(readBusinessFacts(databasePath)).toEqual({
      projects: 0,
      chapters: 0,
      triggers: 0,
    });

    await expect(
      NestFactory.createApplicationContext(ProjectsModule, { logger: false }),
    ).rejects.toThrow(
      "DB_PERSISTENCE_PROJECT_PURGE_MIGRATION_LEDGER_FAILED:0008_sqlite_checks_triggers_indexes",
    );
    expect(readBusinessFacts(databasePath)).toEqual({
      projects: 0,
      chapters: 0,
      triggers: 0,
    });
  }, 20_000);

  it("persists the public create/draft/complete path across a Nest restart without a workspace project tree", async () => {
    const { workspaceRoot, databasePath, deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    expect(deployed.stdout).toContain("11 migrations found");
    expect(deployed.stdout).toContain("All migrations have been successfully applied.");

    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    let projects = app.get(ProjectsService);
    const first = await projects.createProject({
      name: "DB 垂直切片一",
      type: "comic",
      comicFormat: "paged_comic",
      artStyle: "comic_style",
    });
    const second = await projects.createProject({
      name: "DB 垂直切片二",
      type: "comic",
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
    });
    expect(first.currentChapterId).toBe(`${first.id}_chapter_001`);
    expect(second.currentChapterId).toBe(`${second.id}_chapter_001`);
    expect(first.currentChapterId).not.toBe(second.currentChapterId);

    const draftText = "雨夜里，信使把最后一封信交到门前。";
    const normalizedDraftText = draftText;
    const script = app.get(ScriptVersionService);
    const firstWorking = await script.getWorkingCopy({ projectId: first.id, chapterId: first.currentChapterId! });
    const draft = await script.updateWorkingCopy({ projectId: first.id, chapterId: first.currentChapterId! }, { sourceText: draftText, title: "雨夜来信", summary: "信使抵达", expectedChapterRowVersion: firstWorking.chapterRowVersion });
    expect(draft.value.sourceText).toBe(draftText);
    const completed = await script.publish({ projectId: first.id, chapterId: first.currentChapterId! }, {
      expectedCurrentScriptVersionId: null,
      expectedWorkingDigest: draft.value.digest,
      expectedChapterRowVersion: draft.value.chapterRowVersion,
      createNextChapter: false,
    });
    expect(completed.createdNextChapter).toBe(false);
    expect(completed.scriptVersion.status).toBe("current");
    expect(
      (await app.get(PrismaService).database().chapter.findUniqueOrThrow({
        where: { id: first.currentChapterId! },
      })).scriptWorkingState,
    ).toBe("clean");

    const secondWorking = await script.getWorkingCopy({ projectId: second.id, chapterId: second.currentChapterId! });
    const secondDraft = await script.updateWorkingCopy({ projectId: second.id, chapterId: second.currentChapterId! }, { sourceText: "第二个项目也完成第一章。", expectedChapterRowVersion: secondWorking.chapterRowVersion });
    const secondCompletion = await script.publish({ projectId: second.id, chapterId: second.currentChapterId! }, {
      expectedCurrentScriptVersionId: null,
      expectedWorkingDigest: secondDraft.value.digest,
      expectedChapterRowVersion: secondDraft.value.chapterRowVersion,
      createNextChapter: true,
    });
    expect(secondCompletion.createdNextChapter).toBe(true);
    expect((await projects.getWorkbenchSnapshot(second.id)).chapters).toHaveLength(2);
    expect((await projects.getWorkbenchSnapshot(second.id)).chapters[1]?.id).toBe(`${second.id}_chapter_002`);

    await expect(projects.resetProjectScript(first.id)).rejects.toMatchObject({ response: expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_WRITE_ROUTE_DISABLED" }) }) });
    await expect(
      access(path.join(workspaceRoot, "projects", first.id)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await app.close();
    app = null;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    projects = app.get(ProjectsService);
    const reopened = await projects.getChapter(first.id, first.currentChapterId!);
    expect(reopened.chapter).toMatchObject({
      id: first.currentChapterId,
      title: "雨夜来信",
      status: "script_done",
      currentScriptVersionId: completed.scriptVersion.id,
    });
    expect(reopened.chapter.sourceText.trim()).toBe(draftText);
    expect((await projects.listProjects()).map((project) => project.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    const reopenedSecond = await projects.listChapters(second.id);
    expect(reopenedSecond.currentChapterId).toBe(`${second.id}_chapter_001`);
    expect(reopenedSecond.chapters.map((chapter) => chapter.id)).toEqual([
      `${second.id}_chapter_001`,
      `${second.id}_chapter_002`,
    ]);

    const database = app.get(PrismaService).database();
    const [projectRow, chapterRow, versionRows, secondProjectRow, secondChapterRows] = await Promise.all([
      database.project.findUniqueOrThrow({ where: { id: first.id } }),
      database.chapter.findUniqueOrThrow({ where: { id: first.currentChapterId! } }),
      database.chapterScriptVersion.findMany({
        where: { chapterId: first.currentChapterId! },
      }),
      database.project.findUniqueOrThrow({ where: { id: second.id } }),
      database.chapter.findMany({
        where: { projectId: second.id },
        orderBy: { order: "asc" },
      }),
    ]);
    expect(projectRow.currentChapterId).toBe(first.currentChapterId);
    expect(projectRow.comicFormat).toBe("paged_comic");
    expect(chapterRow).toMatchObject({
      milestoneStatus: "script_done",
      scriptWorkingState: "clean",
      currentScriptVersionId: completed.scriptVersion.id,
    });
    expect(chapterRow.scriptWorkingText.trim()).toBe(draftText);
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0]).toMatchObject({
      id: completed.scriptVersion.id,
      version: 1,
      sourceText: normalizedDraftText,
      origin: "user",
    });
    expect(versionRows[0]?.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(secondProjectRow.currentChapterId).toBe(`${second.id}_chapter_001`);
    expect(secondChapterRows.map((chapter) => chapter.id)).toEqual([
      `${second.id}_chapter_001`,
      `${second.id}_chapter_002`,
    ]);
    await expect(
      access(path.join(workspaceRoot, "projects", first.id)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable", async () => {
    const { workspaceRoot, databasePath, deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const script = app.get(ScriptVersionService);
    const project = await projects.createProject({ name: "A2-1 命令闭环", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });

    const before = await projects.getWorkbenchSnapshot(project.id);
    expect(before.versioningCapability).toMatchObject({ mode: "g2_db", schemaVersion: 2, supports: { scriptWorkingCopy: true, importer: false } });
    const metadata = await projects.updateProjectDraft(project.id, { name: "A2-1 已更新", description: "只改 metadata" });
    expect(metadata.name).toBe("A2-1 已更新");
    const ensured = await projects.ensureChapterExists(project.id, 2, "第二章");
    const replayedChapter = await projects.ensureChapterExists(project.id, 2, "不会覆盖标题");
    expect(replayedChapter.id).toBe(ensured.id);
    expect(replayedChapter.title).toBe("第二章");

    const aiInput = { sourceText: "第二章正文\n", title: "第二章", summary: "AI 建议", threadId: "missing-thread", messageId: "missing-message", toolCallId: "tool-a2-1", operation: "generate_script_from_outline" as const };
    const pendingResult = await projects.writeChapterDraftFromAI(project.id, ensured.id, aiInput);
    const pendingReplay = await projects.writeChapterDraftFromAI(project.id, ensured.id, aiInput);
    expect(pendingReplay.revision.id).toBe(pendingResult.revision.id);
    const pending = await script.getPendingSuggestion({ projectId: project.id, chapterId: ensured.id });
    expect(pending).toMatchObject({ sourceText: "第二章正文", threadId: null, messageId: null, toolCallId: null });
    const adopted = await script.adoptPendingSuggestion({ projectId: project.id, chapterId: ensured.id }, { pendingId: pending!.id, expectedPendingRowVersion: pending!.rowVersion, expectedPendingDigest: pending!.digest, expectedChapterRowVersion: pending!.chapterRowVersion });
    expect(adopted.value.sourceText.trim()).toBe("第二章正文");
    expect((await app.get(PrismaService).database().chapterScriptVersion.count({ where: { chapterId: ensured.id } }))).toBe(0);

    const outlineInput = { sourceText: "# A2-1 大纲\n\n第一幕", threadId: "missing-thread", messageId: "missing-message", toolCallId: "outline-a2-1" };
    const outline = await projects.saveScriptOutlineFromAI(project.id, outlineInput);
    expect(outline.status).toBe("draft");
    expect((await projects.saveScriptOutlineFromAI(project.id, outlineInput)).id).toBe(outline.id);
    const confirmed = await projects.confirmScriptOutline(project.id, outline.id);
    expect(confirmed.status).toBe("confirmed");
    await expect(projects.confirmScriptOutline(project.id, "stale-outline")).rejects.toMatchObject({ response: expect.objectContaining({ error: expect.objectContaining({ code: "VERSION_NOT_FOUND" }) }) });

    expect((await projects.getWorkbenchSnapshot(project.id)).currentChapter?.sourceText.trim()).toBe("第二章正文");
    await writeFile(path.join(workspaceRoot, "projects", project.id, "project.json"), "{\"name\":\"tampered\"}\n").catch(() => undefined);
    expect((await projects.getWorkbenchSnapshot(project.id)).project.name).toBe("A2-1 已更新");
    await app.close();
    app = null;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    expect((await app.get(ProjectsService).getWorkbenchSnapshot(project.id)).scriptOutline?.id).toBe(outline.id);
    expect(readBusinessFacts(databasePath).projects).toBe(1);
  }, 20_000);

  it("A2-2: legacy destructive routes are retired with modern replacements", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const project = await projects.createProject({ name: "A2-2 退役路由", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const expectRetired = (promise: Promise<unknown>, operation?: string) => expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_WRITE_ROUTE_DISABLED", details: expect.objectContaining(operation ? { operation } : {}) }) }) });
    await expectRetired(projects.resetProjectScript(project.id), "reset_project_script");
    await expectRetired(projects.importScriptToChapters(project.id, { sourceText: "# 旧导入", sourceName: "legacy.md", threadId: "t", messageId: "m", toolCallId: "c" }), "import_script_to_chapters");
    await expectRetired(projects.clearChapterScript(project.id, project.currentChapterId!), undefined);
    await expectRetired(projects.confirmChapterPendingSource(project.id, project.currentChapterId!), undefined);
    await expectRetired(projects.discardChapterPendingSource(project.id, project.currentChapterId!), undefined);
    expect((await projects.getScriptImpactPreview(project.id)).replacement).toContain("逐章");
    expect((await projects.getWorkbenchSnapshot(project.id)).versioningCapability.mode).toBe("g2_db");
  }, 20_000);

  it("A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements", async () => {
    const { databasePath, deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const project = await projects.createProject({ name: "A3-1 退役路由", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapterId = project.currentChapterId!;
    const expectRetired = (promise: Promise<unknown>, operation: string, replacement: string) => expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "LEGACY_WRITE_ROUTE_DISABLED",
          details: expect.objectContaining({ operation, replacement: expect.stringContaining(replacement) }),
        }),
      }),
    });
    await expectRetired(projects.confirmChapterStoryStructure(project.id, chapterId, {} as never), "confirm_story_structure", "/story-structure/working-copy");
    await expectRetired(projects.updateChapterStoryStructure(project.id, chapterId, {} as never), "update_story_structure", "/story-structure/working-copy");
    await expectRetired(projects.confirmChapterImagePreflight(project.id, chapterId), "confirm_image_preflight", "/image-preflight/preview");
    await expectRetired(projects.resolveImagePreflightCharacter(project.id, chapterId, { token: "主角", action: "ignore" }), "resolve_image_preflight_character", "/image-preflight/preview");
    await expectRetired(projects.savePendingChapterStoryboard(project.id, chapterId, {} as never), "save_pending_storyboard", "/storyboard/working-copy");
    await expectRetired(projects.confirmChapterStoryboard(project.id, chapterId, {} as never), "confirm_storyboard", "/storyboard/working-copy/confirm");
    await expectRetired(projects.updateChapterStoryboard(project.id, chapterId, {} as never), "update_storyboard", "/storyboard/working-copy");
    expect(readBusinessFacts(databasePath)).toMatchObject({ projects: 1, chapters: 1 });
  }, 20_000);

  it("P4-LEGACY-01: retires synchronous/bulk character reference routes in DB mode", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const project = await projects.createProject({ name: "P4 参考图旧入口", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapterId = project.currentChapterId!;
    const expectRetired = (promise: Promise<unknown>, operation: string, replacement: string) => expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ error: expect.objectContaining({ code: "LEGACY_WRITE_ROUTE_DISABLED", details: expect.objectContaining({ operation, replacement: expect.stringContaining(replacement) }) }) }) });
    await expectRetired(projects.ensureProjectCharacterPreviewTasks(project.id), "ensure_character_previews", "/characters/");
    await expectRetired(projects.generateCharacterReference(project.id, "character-1"), "generate_character_reference", "/characters/");
    await expectRetired(projects.generateSceneReference(project.id, chapterId, "scene-1"), "generate_scene_reference", "/chapters/");
  }, 20_000);

  it("P4-CHAR-01: updates character identity in DB without workspace writes", async () => {
    const { databasePath, workspaceRoot, deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 角色身份", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({
      data: {
        id: randomUUID(), projectId: project.id, name: "旧名", normalizedName: "旧名", role: "配角", level: "chapter", entityType: "human", status: "draft",
        appearance: "旧外观", personality: "旧性格", promptFragment: "旧提示词", source: "manual",
      },
    });
    const marker = path.join(workspaceRoot, "projects", project.id, "legacy-characters.json");
    await mkdir(path.dirname(marker), { recursive: true });
    await writeFile(marker, "legacy-must-not-be-touched\n");
    const updated = await projects.updateProjectCharacter(project.id, character.id, { name: "新名", role: "主角", appearance: "新外观" });
    expect(updated.character).toMatchObject({ id: character.id, name: "新名", role: "主角", appearance: "新外观" });
    expect(await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).toMatchObject({ name: "新名", role: "主角", appearance: "新外观", rowVersion: 1 });
    expect(await readFile(marker, "utf8")).toBe("legacy-must-not-be-touched\n");
    expect(readBusinessFacts(databasePath)).toMatchObject({ projects: 1, chapters: 1 });
  }, 20_000);

  it("P4-CHAR-02: extracts character identity into DB without a legacy characters file", async () => {
    const { databasePath, deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const project = await projects.createProject({
      name: "P4 角色提取", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style",
      sourceText: "主要角色：\n林默：调查员，冷静克制\n苏晚：记者，敏锐勇敢\n\n场景：雨夜街口",
    });
    const extracted = await projects.extractProjectCharacters(project.id, { source: "current_chapter" });
    expect(extracted.createdCount).toBe(2);
    expect(extracted.characters.map((item) => item.name)).toEqual(["林默", "苏晚"]);
    expect(await app.get(PrismaService).database().character.count({ where: { projectId: project.id } })).toBe(2);
    expect(readBusinessFacts(databasePath)).toMatchObject({ projects: 1, chapters: 1 });
  }, 20_000);

  it("P4-CHAR-03: queues a DB character reference task with frozen source", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 角色任务", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({
      data: {
        id: randomUUID(), projectId: project.id, name: "角色甲", normalizedName: "角色甲", role: "主角", level: "lead", entityType: "human", status: "needs_reference",
        appearance: "黑发", personality: "冷静", promptFragment: "黑发主角", source: "manual",
      },
    });
    const queued = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "固定测试提示词" });
    expect(queued.createdCount).toBe(1);
    expect(queued.tasks[0]).toMatchObject({ type: "character_reference_generate", target: { type: "character", id: character.id }, status: "queued" });
    const task = await prisma.generationTask.findUniqueOrThrow({ where: { id: queued.tasks[0]!.id }, include: { generationTaskSourcesByTask: true } });
    expect(task.sourceSetSealedAt).not.toBeNull();
    expect(task.generationTaskSourcesByTask).toHaveLength(1);
    expect(task.generationTaskSourcesByTask[0]).toMatchObject({ sourceType: "character", sourceId: character.id, role: "character" });
    const replay = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "固定测试提示词" });
    expect(replay.createdCount).toBe(0);
    expect(replay.tasks[0]!.id).toBe(queued.tasks[0]!.id);
  }, 20_000);

  it("P4-CHAR-04: claims a character reference task and promotes a ready visual without provider access", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const workspace = app.get(WorkspacePathService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 角色出图", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({
      data: {
        id: randomUUID(), projectId: project.id, name: "角色乙", normalizedName: "角色乙", role: "主角", level: "chapter", entityType: "human", status: "draft",
        appearance: "白发", personality: "坚毅", promptFragment: "白发角色", source: "manual",
      },
    });
    const queued = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "固定 worker 测试提示词" });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("character_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    const finished = await worker.runOnce("character-worker");
    expect(finished).toMatchObject({ id: queued.tasks[0]!.id, status: "succeeded", output: { characterId: character.id, referenceKind: "preview_front" } });
    const asset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: queued.tasks[0]!.id } });
    expect(asset).toMatchObject({ status: "ready", role: "character_reference", chapterId: null, mimeType: "image/png", bytes: png.byteLength, width: 1, height: 1 });
    const visual = await prisma.characterVisual.findFirstOrThrow({ where: { characterId: character.id } });
    expect(visual).toMatchObject({ assetId: asset.id, kind: "preview_front", version: 1, status: "available", confirmedAt: null });
    expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).previewVisualId).toBe(visual.id);
    await expect(readFile(workspace.resolveVirtualPath(`/workspace/${asset.storageKey}`))).resolves.toEqual(png);
  }, 20_000);

  it("OBS-08-ASSET-01: reads an imported ready Asset from its DB storageKey instead of the legacy display path", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const prisma = app.get(PrismaService).database();
    const workspace = app.get(WorkspacePathService);
    const project = await projects.createProject({ name: "OBS-08 导入素材读取", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const assetId = randomUUID();
    const storageKey = `legacy-import/${project.id}/${assetId}`;
    const bytes = Buffer.from("imported-ready-asset");
    await mkdir(path.dirname(workspace.resolveVirtualPath(`/workspace/${storageKey}`)), { recursive: true });
    await writeFile(workspace.resolveVirtualPath(`/workspace/${storageKey}`), bytes);
    const metadata = {
      legacyName: "导入素材",
      legacyPath: "projects/legacy-source/chapters/chapter-001/assets/imported.webp",
    };
    await prisma.asset.create({
      data: {
        id: assetId,
        projectId: project.id,
        chapterId: project.currentChapterId,
        type: "image",
        role: "legacy_image",
        mimeType: "image/png",
        storageKey,
        status: "staged",
        metadataJson: metadata,
        metadataSchemaVersion: 1,
        metadataDigest: digestCanonicalJson(metadata),
      },
    });
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: "ready",
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        bytes: bytes.byteLength,
        width: 1,
        height: 1,
        readyAt: new Date("2026-07-14T00:00:00.000Z"),
      },
    });

    await app.close();
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    await expect(app.get(ProjectsService).getProjectAssetFile(project.id, assetId)).resolves.toEqual({
      buffer: bytes,
      mimeType: "image/png",
      fileName: "imported.webp",
    });
  }, 20_000);

  it("P4-CHAR-05: keeps a late character visual historical when identity source changed after queue", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 角色迟到", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({
      data: {
        id: randomUUID(), projectId: project.id, name: "角色丙", normalizedName: "角色丙", role: "配角", level: "chapter", entityType: "human", status: "draft",
        appearance: "黑发", personality: "沉默", promptFragment: "黑发角色", source: "manual",
      },
    });
    const queued = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "旧身份提示词" });
    await prisma.character.update({ where: { id: character.id }, data: { appearance: "白发", rowVersion: { increment: 1 } } });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("character_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    const finished = await worker.runOnce("character-worker");
    expect(finished).toMatchObject({ id: queued.tasks[0]!.id, status: "succeeded" });
    expect((await prisma.generationTask.findUniqueOrThrow({ where: { id: queued.tasks[0]!.id } })).applicability).toBe("historical");
    expect(await prisma.characterVisual.count({ where: { characterId: character.id } })).toBe(1);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).previewVisualId).toBeNull();
  }, 20_000);

  it("P4-CHAR-06: confirms a DB preview visual and preserves the final queue boundary", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 预览确认", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({ data: { id: randomUUID(), projectId: project.id, name: "路人甲", normalizedName: "路人甲", role: "路人", level: "extra", entityType: "human", status: "draft", appearance: "灰衣", personality: "安静", promptFragment: "灰衣路人", source: "manual" } });
    const queued = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "预览确认" });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("character_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    await worker.runOnce("character-worker");
    const previewAsset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: queued.tasks[0]!.id } });
    const confirmed = await projects.confirmCharacterPreview(project.id, character.id, { assetId: previewAsset.id });
    expect(confirmed.character.previewReferenceAssetId).toBe(previewAsset.id);
    expect(confirmed.tasks).toHaveLength(0);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).previewVisualId).toBeTruthy();
  }, 20_000);

  it("P4-CHAR-07: confirms a DB final visual without workspace writes", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 定稿确认", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({ data: { id: randomUUID(), projectId: project.id, name: "主角丁", normalizedName: "主角丁", role: "主角", level: "chapter", entityType: "human", status: "draft", appearance: "蓝衣", personality: "坚定", promptFragment: "蓝衣主角", source: "manual" } });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("character_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    const previewTask = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "预览" });
    await worker.runOnce("character-worker");
    const previewAsset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: previewTask.tasks[0]!.id } });
    const previewConfirmed = await projects.confirmCharacterPreview(project.id, character.id, { assetId: previewAsset.id });
    expect(previewConfirmed.tasks).toHaveLength(1);
    await worker.runOnce("character-worker");
    const finalAsset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: previewConfirmed.tasks[0]!.id } });
    const saved = await projects.confirmCharacterReference(project.id, character.id, { assetId: finalAsset.id });
    expect(saved.character.primaryReferenceAssetId).toBe(finalAsset.id);
    expect(saved.character.status).toBe("finalized");
    expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).primaryVisualId).toBeTruthy();
  }, 20_000);

  it("P5-CHAR-DELETE-01: records an idempotent asset.delete intent without physical deletion", async () => {
    const { deployed, workspaceRoot } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P5 角色删除意图", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({ data: { id: randomUUID(), projectId: project.id, name: "待清理角色", normalizedName: "待清理角色", role: "配角", level: "chapter", entityType: "human", status: "draft", appearance: "灰衣", personality: "谨慎", promptFragment: "灰衣角色", source: "manual" } });
    const queued = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "删除意图测试" });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("character_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    await worker.runOnce("character-delete-worker");
    const asset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: queued.tasks[0]!.id } });
    const visual = await prisma.characterVisual.findFirstOrThrow({ where: { characterId: character.id, assetId: asset.id } });
    const first = await projects.deleteCharacterReference(project.id, character.id, asset.id);
    expect(first).toMatchObject({ deletedAssetId: asset.id, cleanupStatus: "pending", cleanupEventId: expect.any(String) });
    expect(first.character.previewReferenceAssetId).toBeNull();
    expect(first.character.referenceAssetIds).not.toContain(asset.id);
    expect(await prisma.characterVisual.findUniqueOrThrow({ where: { id: visual.id } })).toMatchObject({ status: "removed" });
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({ status: "deleting", deletingAt: expect.any(Date) });
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: first.cleanupEventId! } });
    expect(event).toMatchObject({ eventType: "asset.delete", aggregateType: "asset", aggregateId: asset.id, status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `asset.delete:${asset.id}:${asset.sha256}:explicit_delete` });
    expect(event.payloadJson).toMatchObject({ schemaVersion: 1, assetId: asset.id, projectId: project.id, chapterId: null, storageKey: asset.storageKey, expectedSha256: asset.sha256, reason: "explicit_delete" });
    await expect(readFile(path.join(workspaceRoot, asset.storageKey))).resolves.toEqual(png);

    const replay = await projects.deleteCharacterReference(project.id, character.id, asset.id);
    expect(replay.cleanupEventId).toBe(first.cleanupEventId);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: asset.id, eventType: "asset.delete" } })).toBe(1);
  }, 20_000);

  it("P5-CHAR-DELETE-02: rejects deleting an in-use primary visual", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P5 角色锁定删除", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const character = await prisma.character.create({ data: { id: randomUUID(), projectId: project.id, name: "锁定角色", normalizedName: "锁定角色", role: "主角", level: "chapter", entityType: "human", status: "draft", appearance: "黑衣", personality: "坚决", promptFragment: "黑衣角色", source: "manual" } });
    const queued = await projects.queueCharacterReference(project.id, character.id, { referenceKind: "preview_front", prompt: "锁定删除测试" });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("character_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    await worker.runOnce("character-lock-delete-worker");
    const previewAsset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: queued.tasks[0]!.id } });
    const previewConfirmed = await projects.confirmCharacterPreview(project.id, character.id, { assetId: previewAsset.id });
    await worker.runOnce("character-lock-delete-final-worker");
    const finalTaskId = previewConfirmed.tasks[0]!.id;
    const finalAsset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: finalTaskId } });
    await projects.confirmCharacterReference(project.id, character.id, { assetId: finalAsset.id });
    const asset = finalAsset;
    const visual = await prisma.characterVisual.findFirstOrThrow({ where: { characterId: character.id, assetId: asset.id } });
    await prisma.character.update({ where: { id: character.id }, data: { status: "in_use", rowVersion: { increment: 1 } } });
    await expect(projects.deleteCharacterReference(project.id, character.id, asset.id)).rejects.toMatchObject({ message: "PROJECT_CHARACTER_IN_USE_LOCKED" });
    expect(await prisma.outboxEvent.count({ where: { eventType: "asset.delete", aggregateId: asset.id } })).toBe(0);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({ status: "ready" });
  }, 20_000);

  it("P4-CHAR-08: promotes a DB scene reference through SceneVisual with a fake handler", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const worker = app.get(PersistentTaskWorkerService);
    const tasks = app.get(PersistentTaskRepository);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P4 场景视觉", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { projectId: project.id } });
    const scene = await prisma.chapterScene.create({ data: { id: randomUUID(), projectId: project.id, chapterId: chapter.id, sceneKey: "scene-1" } });
    const sourceProjection = buildTaskSourceProjection({ policyVersion: "scene-reference-source-v1", projectId: project.id, chapterId: chapter.id, consumerType: "scene_reference_generate", sources: [{ role: "scene", sourceType: "chapter_scene", sourceId: scene.id, sourceDigest: digestCanonicalJson({ id: scene.id, projectId: project.id, chapterId: chapter.id, sceneKey: scene.sceneKey, updatedAt: scene.updatedAt.toISOString() }) }] });
    const task = await tasks.create({ projectId: project.id, type: "scene_reference_generate", target: { type: "scene", id: scene.id, chapterId: chapter.id }, input: { schemaVersion: 1, projectId: project.id, chapterId: chapter.id, sceneId: scene.id, prompt: "场景测试", sourceProjection } });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("scene_reference_generate", async () => ({ buffer: png, mimeType: "image/png" }));
    const finished = await worker.runOnce("scene-worker");
    expect(finished).toMatchObject({ id: task.item.id, status: "succeeded", output: { sceneId: scene.id } });
    const asset = await prisma.asset.findFirstOrThrow({ where: { sourceTaskId: task.item.id } });
    const visual = await prisma.sceneVisual.findFirstOrThrow({ where: { sourceTaskId: task.item.id } });
    expect(asset).toMatchObject({ status: "ready", role: "scene_reference", chapterId: chapter.id, bytes: png.byteLength, width: 1, height: 1 });
    expect((await prisma.chapterScene.findUniqueOrThrow({ where: { id: scene.id } })).currentVisualId).toBe(visual.id);
  }, 20_000);

  it("P4-SCENE-01: queues a DB scene reference with chapter-scene source freeze and replay", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const prisma = app.get(PrismaService).database();
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const project = await projects.createProject({ name: "P4 场景排队", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { projectId: project.id } });
    const scope = { projectId: project.id, chapterId: chapter.id };
    const scriptText = "场景测试剧本";
    const scriptEncoded = encodeScriptTextV1(scriptText, { allowEmpty: false });
    const scriptWorking = await scripts.updateWorkingCopy(scope, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish(scope, {
      expectedCurrentScriptVersionId: null,
      expectedWorkingDigest: scriptEncoded.digest,
      expectedChapterRowVersion: scriptWorking.value.chapterRowVersion,
      createNextChapter: false,
    });
    const storyCreated = await stories.createWorkingCopy(scope, {
      mode: "empty",
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedChapterRowVersion: published.workingCopy.chapterRowVersion,
    });
    const document: StoryDocumentV2 = { schemaVersion: 2, chapterId: chapter.id, direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" }, synopsis: "", characters: [], scenes: [{ id: "scene-1", name: "旧街", location: "旧街", timeOfDay: "夜", atmosphere: "雨", purpose: "铺垫" }], beats: [], notes: "" };
    const storyUpdated = await stories.updateWorkingCopy(scope, {
      pendingVersionId: storyCreated.value.pending!.id,
      document,
      expectedPendingRowVersion: 0,
      expectedChapterRowVersion: storyCreated.chapterRowVersion,
    });
    const storyConfirmed = await stories.confirmWorkingCopy(scope, {
      pendingVersionId: storyCreated.value.pending!.id,
      expectedPendingDocumentDigest: storyUpdated.value.pending!.documentDigest,
      expectedPendingRowVersion: 1,
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedSourceDigest: published.scriptVersion.sourceDigest,
      expectedChapterRowVersion: storyUpdated.chapterRowVersion,
    });
    expect(storyConfirmed.value.current?.id).toBe(storyCreated.value.pending!.id);
    const scene = await prisma.chapterScene.findFirstOrThrow({ where: { projectId: project.id, chapterId: chapter.id, sceneKey: "scene-1" } });
    const queued = await projects.queueSceneReference(project.id, chapter.id, "scene-1", { prompt: "固定场景提示词" });
    expect(queued.createdCount).toBe(1);
    expect(queued.tasks[0]).toMatchObject({ type: "scene_reference_generate", target: { type: "scene", id: scene.id, chapterId: chapter.id }, status: "queued" });
    const task = await prisma.generationTask.findUniqueOrThrow({ where: { id: queued.tasks[0]!.id }, include: { generationTaskSourcesByTask: true } });
    expect(task.sourceSetSealedAt).not.toBeNull();
    expect(task.generationTaskSourcesByTask[0]).toMatchObject({ sourceType: "chapter_scene", sourceId: scene.id, role: "scene" });
    const replay = await projects.queueSceneReference(project.id, chapter.id, "scene-1", { prompt: "固定场景提示词" });
    expect(replay.createdCount).toBe(0);
    expect(replay.tasks[0]!.id).toBe(queued.tasks[0]!.id);
  }, 20_000);

  it("fails closed when an active DB project has no current chapter", async () => {
    const { databasePath, deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const created = await app.get(ProjectsService).createProject({
      name: "损坏当前章节指针",
      type: "comic",
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
    });
    await app.close();
    app = null;

    const database = new DatabaseSync(databasePath);
    try {
      database.prepare(
        'UPDATE "projects" SET "current_chapter_id" = NULL WHERE "id" = ?',
      ).run(created.id);
    } finally {
      database.close();
    }

    await expect(
      NestFactory.createApplicationContext(ProjectsModule, { logger: false }),
    ).rejects.toThrow(
      `DB_PERSISTENCE_CURRENT_CHAPTER_INVALID:${created.id}:null`,
    );
    expect(readBusinessFacts(databasePath)).toMatchObject({
      projects: 1,
      chapters: 1,
    });
  }, 20_000);

  it("executes G2 Script working copy/publish/replay/restart through the DB repository", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const repository = app.get(ScriptVersionRepository);
    const project = await projects.createProject({
      name: "G2 Script Repository",
      type: "comic",
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
    });
    const scope = { projectId: project.id, chapterId: project.currentChapterId! };
    const initial = await repository.getWorkingCopy(scope);
    expect(initial).toMatchObject({ state: "empty", chapterRowVersion: 0, currentVersion: null });

    const text = "第一行\r\n\r\n第二行";
    const encoded = encodeScriptTextV1(text, { allowEmpty: true });
    const updated = await repository.updateWorkingCopy(scope, {
      sourceText: text,
      title: "第一章",
      summary: "开场",
      expectedChapterRowVersion: initial.chapterRowVersion,
    });
    expect(updated).toMatchObject({ replayed: false, value: { sourceText: "第一行\n\n第二行", digest: encoded.digest, state: "dirty", chapterRowVersion: 1 } });

    const replayedUpdate = await repository.updateWorkingCopy(scope, {
      sourceText: text,
      title: "第一章",
      summary: "开场",
      expectedChapterRowVersion: initial.chapterRowVersion,
    });
    expect(replayedUpdate.replayed).toBe(true);
    await expect(repository.updateWorkingCopy(scope, {
      sourceText: "并发覆盖",
      expectedChapterRowVersion: initial.chapterRowVersion,
    })).rejects.toThrow("CHAPTER_VERSION_CONFLICT");

    const published = await repository.publish(scope, {
      expectedCurrentScriptVersionId: null,
      expectedWorkingDigest: encoded.digest,
      expectedChapterRowVersion: updated.value.chapterRowVersion,
      createNextChapter: true,
      nextChapterTitle: "第二章",
    });
    expect(published).toMatchObject({ replayed: false, createdNextChapter: true, activeChapterId: scope.chapterId, scriptVersion: { version: 1 }, workingCopy: { state: "clean", chapterRowVersion: 2 } });
    const publishReplay = await repository.publish(scope, {
      expectedCurrentScriptVersionId: null,
      expectedWorkingDigest: encoded.digest,
      expectedChapterRowVersion: updated.value.chapterRowVersion,
      createNextChapter: true,
    });
    expect(publishReplay.replayed).toBe(true);
    expect((await repository.listHistory(scope)).items).toHaveLength(1);

    const cleared = await repository.clearWorkingCopy(scope, {
      expectedWorkingDigest: encoded.digest,
      expectedChapterRowVersion: published.workingCopy.chapterRowVersion,
    });
    expect(cleared.value).toMatchObject({ state: "dirty", sourceText: "", chapterRowVersion: 3 });
    const reverted = await repository.revertWorkingCopy(scope, {
      expectedCurrentScriptVersionId: published.scriptVersion.id,
      expectedWorkingDigest: cleared.value.digest,
      expectedChapterRowVersion: cleared.value.chapterRowVersion,
    });
    expect(reverted.value).toMatchObject({ state: "clean", sourceText: "第一行\n\n第二行", chapterRowVersion: 4 });

    const secondText = "第二版正文";
    const secondEncoded = encodeScriptTextV1(secondText, { allowEmpty: true });
    const secondWorking = await repository.updateWorkingCopy(scope, {
      sourceText: secondText,
      expectedChapterRowVersion: reverted.value.chapterRowVersion,
    });
    const secondPublished = await repository.publish(scope, {
      expectedCurrentScriptVersionId: published.scriptVersion.id,
      expectedWorkingDigest: secondEncoded.digest,
      expectedChapterRowVersion: secondWorking.value.chapterRowVersion,
      createNextChapter: false,
    });
    expect(secondPublished.scriptVersion.version).toBe(2);
    const copiedHistorical = await repository.copyHistoryToWorkingCopy(scope, published.scriptVersion.id, {
      expectedCurrentVersionId: secondPublished.scriptVersion.id,
      expectedWorkingDigest: secondEncoded.digest,
      expectedChapterRowVersion: secondPublished.workingCopy.chapterRowVersion,
    });
    expect(copiedHistorical.value).toMatchObject({ state: "dirty", sourceText: "第一行\n\n第二行", chapterRowVersion: 7 });

    const pendingText = "AI 建议稿";
    const pendingEncoded = encodeScriptTextV1(pendingText, { allowEmpty: false });
    const pending = await app.get(PrismaService).database().chapterScriptPending.create({
      data: {
        id: randomUUID(),
        chapterId: scope.chapterId,
        sourceText: pendingText,
        sourceDigest: pendingEncoded.digest,
        operation: "generate_script",
      },
    });
    expect(await repository.getPendingSuggestion(scope)).toMatchObject({ id: pending.id, rowVersion: 0, digest: pendingEncoded.digest });
    const adopted = await repository.adoptPendingSuggestion(scope, {
      pendingId: pending.id,
      expectedPendingRowVersion: pending.rowVersion,
      expectedPendingDigest: pendingEncoded.digest,
      expectedChapterRowVersion: copiedHistorical.value.chapterRowVersion,
    });
    expect(adopted.value).toMatchObject({ sourceText: pendingText, state: "dirty", chapterRowVersion: 8 });
    const discardPending = await app.get(PrismaService).database().chapterScriptPending.create({
      data: {
        id: randomUUID(),
        chapterId: scope.chapterId,
        sourceText: "待丢弃",
        sourceDigest: encodeScriptTextV1("待丢弃", { allowEmpty: false }).digest,
        operation: "generate_script",
      },
    });
    expect((await repository.discardPendingSuggestion(scope, { pendingId: discardPending.id, expectedPendingRowVersion: 0 })).replayed).toBe(false);

    await app.close();
    app = null;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const reopened = await app.get(ScriptVersionRepository).getWorkingCopy(scope);
    expect(reopened).toMatchObject({ state: "dirty", sourceText: pendingText, currentVersion: { id: secondPublished.scriptVersion.id, version: 2 }, chapterRowVersion: 8 });
    expect((await app.get(PrismaService).database().chapter.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } })).map((chapter) => chapter.order)).toEqual([1, 2]);
  }, 30_000);

  it("executes G2 Story pending/update/confirm/discard/replay with projections", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const project = await projects.createProject({
      name: "G2 Story Repository",
      type: "comic",
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
    });
    const scope = { projectId: project.id, chapterId: project.currentChapterId! };
    const chapter = await app.get(PrismaService).database().chapter.findUniqueOrThrow({ where: { id: scope.chapterId } });
    const scriptText = "故事脚本";
    const scriptEncoded = encodeScriptTextV1(scriptText, { allowEmpty: false });
    const scriptWorking = await scripts.updateWorkingCopy(scope, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish(scope, {
      expectedCurrentScriptVersionId: null,
      expectedWorkingDigest: scriptEncoded.digest,
      expectedChapterRowVersion: scriptWorking.value.chapterRowVersion,
      createNextChapter: false,
    });
    const afterScript = await stories.getWorkingCopy(scope);
    expect(afterScript).toMatchObject({ pending: null, current: null, rowVersion: null });
    const created = await stories.createWorkingCopy(scope, {
      mode: "empty",
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedChapterRowVersion: published.workingCopy.chapterRowVersion,
    });
    expect(created).toMatchObject({ replayed: false, value: { pending: { lifecycle: "pending_confirmation", rowVersion: 0 }, rowVersion: 0 }, chapterRowVersion: 3 });
    const createReplay = await stories.createWorkingCopy(scope, {
      mode: "empty",
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedChapterRowVersion: published.workingCopy.chapterRowVersion,
    });
    expect(createReplay.replayed).toBe(true);

    const document: StoryDocumentV2 = {
      schemaVersion: 2,
      chapterId: scope.chapterId,
      synopsis: "开场",
      direction: { logline: "冲突", chapterGoal: "目标", coreConflict: "矛盾", emotionalArc: "情绪", endingHook: "钩子" },
      characters: [],
      scenes: [{ id: "scene-1", name: "门口", location: "街道", timeOfDay: "夜", atmosphere: "雨", purpose: "相遇" }],
      beats: [{ id: "beat-1", order: 1, title: "相遇", summary: "两人相遇", conflict: "误会", characters: [], sceneId: "scene-1", visualFocus: "雨幕", outcome: "留下线索" }],
      notes: "",
    };
    const updated = await stories.updateWorkingCopy(scope, {
      pendingVersionId: created.value.pending!.id,
      document,
      expectedPendingRowVersion: 0,
      expectedChapterRowVersion: created.chapterRowVersion,
    });
    expect(updated).toMatchObject({ replayed: false, value: { pending: { rowVersion: 1, documentDigest: digestCanonicalJson(document) }, rowVersion: 1 }, chapterRowVersion: 4 });
    const digest = updated.value.pending!.documentDigest;
    const confirmed = await stories.confirmWorkingCopy(scope, {
      pendingVersionId: created.value.pending!.id,
      expectedPendingDocumentDigest: digest,
      expectedPendingRowVersion: 1,
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedSourceDigest: published.scriptVersion.sourceDigest,
      expectedChapterRowVersion: updated.chapterRowVersion,
    });
    expect(confirmed).toMatchObject({ replayed: false, value: { current: { lifecycle: "confirmed", id: created.value.pending!.id }, document }, chapterRowVersion: 5 });
    const confirmReplay = await stories.confirmWorkingCopy(scope, {
      pendingVersionId: created.value.pending!.id,
      expectedPendingDocumentDigest: digest,
      expectedPendingRowVersion: 1,
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedSourceDigest: published.scriptVersion.sourceDigest,
      expectedChapterRowVersion: updated.chapterRowVersion,
    });
    expect(confirmReplay.replayed).toBe(true);
    const projections = await app.get(PrismaService).database().storySceneProjection.findMany({ where: { storyVersionId: created.value.pending!.id } });
    expect(projections).toHaveLength(1);
    expect(await app.get(PrismaService).database().storyBeatProjection.count({ where: { storyVersionId: created.value.pending!.id } })).toBe(1);

    const next = await stories.createWorkingCopy(scope, {
      mode: "clone_current",
      expectedCurrentVersionId: created.value.pending!.id,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedChapterRowVersion: confirmed.chapterRowVersion,
    });
    expect(next.value.pending?.rowVersion).toBe(0);
    const discarded = await stories.discardWorkingCopy(scope, {
      pendingVersionId: next.value.pending!.id,
      expectedPendingRowVersion: 0,
      expectedChapterRowVersion: next.chapterRowVersion,
    });
    expect(discarded).toMatchObject({ replayed: false, value: { pending: null, current: { id: created.value.pending!.id, lifecycle: "confirmed" } } });

    await app.close();
    app = null;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    expect(await app.get(StoryVersionRepository).getWorkingCopy(scope)).toMatchObject({ pending: null, current: { id: created.value.pending!.id, lifecycle: "confirmed" }, document });
  }, 30_000);

  it("executes G2 Storyboard pending/stable-shot/confirm/retire with projections", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const boards = app.get(StoryboardVersionRepository);
    const project = await projects.createProject({ name: "G2 Storyboard Repository", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const scope = { projectId: project.id, chapterId: project.currentChapterId! };
    const initialChapter = await app.get(PrismaService).database().chapter.findUniqueOrThrow({ where: { id: scope.chapterId } });
    const scriptText = "分镜脚本";
    const scriptEncoded = encodeScriptTextV1(scriptText, { allowEmpty: false });
    const scriptWorking = await scripts.updateWorkingCopy(scope, { sourceText: scriptText, expectedChapterRowVersion: initialChapter.rowVersion });
    const published = await scripts.publish(scope, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: scriptEncoded.digest, expectedChapterRowVersion: scriptWorking.value.chapterRowVersion, createNextChapter: false });
    const storyCreated = await stories.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedChapterRowVersion: published.workingCopy.chapterRowVersion });
    const storyDocument: StoryDocumentV2 = { schemaVersion: 2, chapterId: scope.chapterId, synopsis: "", direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" }, characters: [], scenes: [], beats: [], notes: "" };
    const storyUpdated = await stories.updateWorkingCopy(scope, { pendingVersionId: storyCreated.value.pending!.id, document: storyDocument, expectedPendingRowVersion: 0, expectedChapterRowVersion: storyCreated.chapterRowVersion });
    const storyConfirmed = await stories.confirmWorkingCopy(scope, { pendingVersionId: storyCreated.value.pending!.id, expectedPendingDocumentDigest: storyUpdated.value.pending!.documentDigest, expectedPendingRowVersion: 1, expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedSourceDigest: published.scriptVersion.sourceDigest, expectedChapterRowVersion: storyUpdated.chapterRowVersion });
    const boardCreated = await boards.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedChapterRowVersion: storyConfirmed.chapterRowVersion });
    expect(boardCreated.value.pending?.rowVersion).toBe(0);
    const initial = {
      beatId: null,
      sceneId: null,
      characterIds: [],
      coreAction: "开门",
      emotion: "紧张",
      shotType: "medium" as const,
      cameraAngle: "eye_level" as const,
      comic: { panelDescription: "门口", composition: "中景", dialogue: "", caption: "", panelRhythm: "normal" as const },
      motion: { visualDescription: "雨夜开门", compositionDesign: "居中", cameraMovement: "static" as const, frameType: "action" as const, durationMs: 0, durationHint: "", voiceLines: [] },
      promptDraft: "",
    };
    const shotRequestId = randomUUID();
    const createdShot = await boards.createPendingShot(scope, { pendingVersionId: boardCreated.value.pending!.id, requestId: shotRequestId, afterShotId: null, expectedPendingRowVersion: 0, expectedChapterRowVersion: boardCreated.chapterRowVersion, initial });
    expect(createdShot.replayed).toBe(false);
    const shotReplay = await boards.createPendingShot(scope, { pendingVersionId: boardCreated.value.pending!.id, requestId: shotRequestId, afterShotId: null, expectedPendingRowVersion: 0, expectedChapterRowVersion: boardCreated.chapterRowVersion, initial });
    expect(shotReplay.replayed).toBe(true);
    const pending = createdShot.workingCopy.pending!;
    const confirmed = await boards.confirmWorkingCopy(scope, { pendingVersionId: pending.id, expectedPendingDocumentDigest: pending.documentDigest, expectedPendingRowVersion: 1, expectedCurrentVersionId: null, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedSourceDigest: storyConfirmed.value.current.documentDigest, expectedChapterRowVersion: createdShot.workingCopy.productionState.chapterRowVersion });
    expect(confirmed.value.current.lifecycle).toBe("confirmed");
    expect(await app.get(PrismaService).database().storyboardShotProjection.count({ where: { storyboardVersionId: pending.id } })).toBe(1);
    const next = await boards.createWorkingCopy(scope, { mode: "clone_current", expectedCurrentVersionId: pending.id, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedChapterRowVersion: confirmed.chapterRowVersion });
    const emptyNext: StoryboardDocumentV2 = { schemaVersion: 2, chapterId: scope.chapterId, shots: [], notes: "" };
    const nextUpdated = await boards.updateWorkingCopy(scope, { pendingVersionId: next.value.pending!.id, document: emptyNext, expectedPendingRowVersion: 0, expectedChapterRowVersion: next.chapterRowVersion });
    const retired = await boards.confirmWorkingCopy(scope, { pendingVersionId: next.value.pending!.id, expectedPendingDocumentDigest: nextUpdated.value.pending!.documentDigest, expectedPendingRowVersion: 1, expectedCurrentVersionId: pending.id, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedSourceDigest: storyConfirmed.value.current.documentDigest, expectedChapterRowVersion: nextUpdated.chapterRowVersion });
    expect(retired.value.current.lifecycle).toBe("confirmed");
    expect(await app.get(PrismaService).database().shot.count({ where: { chapterId: scope.chapterId, lifecycleStatus: "retired" } })).toBe(1);
  }, 30_000);

  it("projects production state and enforces the new-work gate across a restart", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const productionQuery = app.get(ChapterProductionQueryService);
    const gate = app.get(NewWorkGateService);
    const applicability = app.get(TaskApplicabilityGuardService);
    const project = await projects.createProject({ name: "G2 Production State", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const scope = { projectId: project.id, chapterId: project.currentChapterId! };

    const initial = await productionQuery.get(scope);
    expect(initial.productionState).toMatchObject({ milestoneStatus: "draft", script: { workingState: "empty", freshness: null } });
    expect(initial.workflow.currentStepKey).toBe("project_story");
    expect(initial.workflow.steps.find((step) => step.key === "project_story")).toMatchObject({ status: "needs_confirmation", attention: "needs_confirmation", canStartTask: false });
    expect(initial.workflow.steps.find((step) => step.key === "story_structure")).toMatchObject({ status: "waiting", canStartTask: false });

    const chapter = await app.get(PrismaService).database().chapter.findUniqueOrThrow({ where: { id: scope.chapterId } });
    const scriptText = "门在雨夜里打开。";
    const scriptDigest = encodeScriptTextV1(scriptText, { allowEmpty: false }).digest;
    const scriptWorking = await scripts.updateWorkingCopy(scope, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish(scope, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: scriptDigest, expectedChapterRowVersion: scriptWorking.value.chapterRowVersion, createNextChapter: false });

    const afterScript = await productionQuery.get(scope);
    expect(afterScript.productionState).toMatchObject({ milestoneStatus: "script_done", script: { freshness: "current", workingState: "clean" }, story: { freshness: null, reasonCodes: ["STORY_VERSION_MISSING"] } });
    expect(afterScript.workflow.currentStepKey).toBe("story_structure");
    expect(afterScript.workflow.steps.find((step) => step.key === "story_structure")).toMatchObject({ status: "active", canStartTask: true, attention: null });

    const missingTarget = await gate.check(scope, "story_parse", { sourceId: published.scriptVersion.id, sourceDigest: published.scriptVersion.sourceDigest });
    expect(missingTarget.allowed).toBe(false);
    expect(missingTarget.reasonCodes).toContain("PENDING_VERSION_CHANGED");

    const created = await stories.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedChapterRowVersion: afterScript.chapterRowVersion });
    const pending = created.value.pending!;
    const allowed = await gate.check(scope, "story_parse", { expectedTargetId: pending.id, expectedTargetRowVersion: pending.rowVersion ?? 0, sourceId: published.scriptVersion.id, sourceDigest: published.scriptVersion.sourceDigest });
    expect(allowed).toMatchObject({ allowed: true, operation: "story_parse", reasonCodes: [] });
    const currentApplicability = await applicability.evaluate(scope, "story_parse", { expectedTargetId: pending.id, expectedTargetRowVersion: pending.rowVersion ?? 0, sourceId: published.scriptVersion.id, sourceDigest: published.scriptVersion.sourceDigest });
    expect(currentApplicability).toMatchObject({ applicability: "current", reasonCodes: [] });

    const pendingState = await productionQuery.get(scope);
    expect(pendingState.productionState.story).toMatchObject({ pendingVersionId: pending.id, freshness: "pending", reasonCodes: ["STORY_PENDING_CONFIRMATION"] });
    expect(pendingState.workflow.steps.find((step) => step.key === "story_structure")).toMatchObject({ status: "needs_confirmation", attention: "needs_confirmation", currentArtifactId: null });
    await expect(gate.assertAllowed(scope, "shot_generate", { expectedTargetId: "not-created", expectedTargetRowVersion: 0, sourceId: "not-current" })).rejects.toThrow("UPSTREAM_WORK_NOT_CONFIRMED");
    const historicalApplicability = await applicability.evaluate(scope, "shot_generate", { expectedTargetId: "not-created", expectedTargetRowVersion: 0, sourceId: "not-current" });
    expect(historicalApplicability.applicability).toBe("historical");

    await app.close();
    app = null;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const reopened = await app.get(ChapterProductionQueryService).get(scope);
    expect(reopened.chapterRowVersion).toBe(pendingState.chapterRowVersion);
    expect(reopened.productionState.story.pendingVersionId).toBe(pending.id);
    expect(reopened.workflow.currentStepKey).toBe("story_structure");
  }, 30_000);

  it("builds and confirms a DB Preflight revision, then marks it stale after a new Storyboard current", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const boards = app.get(StoryboardVersionRepository);
    const preflight = app.get(PreflightRevisionService);
    const productionQuery = app.get(ChapterProductionQueryService);
    const project = await projects.createProject({ name: "G2 Preflight Revision", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const scope = { projectId: project.id, chapterId: project.currentChapterId! };
    const chapter = await app.get(PrismaService).database().chapter.findUniqueOrThrow({ where: { id: scope.chapterId } });
    const scriptText = "一扇门在雨夜打开。";
    const scriptDigest = encodeScriptTextV1(scriptText, { allowEmpty: false }).digest;
    const scriptWorking = await scripts.updateWorkingCopy(scope, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish(scope, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: scriptDigest, expectedChapterRowVersion: scriptWorking.value.chapterRowVersion, createNextChapter: false });
    const storyCreated = await stories.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedChapterRowVersion: published.workingCopy.chapterRowVersion });
    const storyUpdated = await stories.updateWorkingCopy(scope, { pendingVersionId: storyCreated.value.pending!.id, document: { schemaVersion: 2, chapterId: scope.chapterId, synopsis: "", direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" }, characters: [], scenes: [], beats: [], notes: "" }, expectedPendingRowVersion: 0, expectedChapterRowVersion: storyCreated.chapterRowVersion });
    const storyConfirmed = await stories.confirmWorkingCopy(scope, { pendingVersionId: storyCreated.value.pending!.id, expectedPendingDocumentDigest: storyUpdated.value.pending!.documentDigest, expectedPendingRowVersion: 1, expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedSourceDigest: published.scriptVersion.sourceDigest, expectedChapterRowVersion: storyUpdated.chapterRowVersion });
    const boardCreated = await boards.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedChapterRowVersion: storyConfirmed.chapterRowVersion });
    const boardConfirmed = await boards.confirmWorkingCopy(scope, { pendingVersionId: boardCreated.value.pending!.id, expectedPendingDocumentDigest: boardCreated.value.pending!.documentDigest, expectedPendingRowVersion: 0, expectedCurrentVersionId: null, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedSourceDigest: storyConfirmed.value.current.documentDigest, expectedChapterRowVersion: boardCreated.chapterRowVersion });

    const preview = await preflight.getPreview(scope, "首次确认");
    expect(preview.preview).toMatchObject({ schemaVersion: 2, chapterId: scope.chapterId, ready: true, shotCount: 0, issues: [], notes: "首次确认" });
    expect(preview.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const confirmed = await preflight.confirm(scope, { expectedSourceStoryboardVersionId: boardConfirmed.value.current.id, expectedSourceDigest: preview.sourceDigest, expectedChapterRowVersion: preview.chapterRowVersion, notes: "首次确认" });
    expect(confirmed).toMatchObject({ replayed: false, preflight: { lifecycle: "confirmed", sourceStoryboardVersionId: boardConfirmed.value.current.id, sourceDigest: preview.sourceDigest, document: { ready: true, notes: "首次确认" } }, chapterRowVersion: preview.chapterRowVersion + 1 });
    const storedPreflight = await app.get(PrismaService).database().preflightRevision.findUniqueOrThrow({ where: { id: confirmed.preflight.id } });
    expect(() => encodePreflightDocumentV2(storedPreflight.documentJson)).not.toThrow();
    const replay = await preflight.confirm(scope, { expectedSourceStoryboardVersionId: boardConfirmed.value.current.id, expectedSourceDigest: preview.sourceDigest, expectedChapterRowVersion: preview.chapterRowVersion, notes: "首次确认" });
    expect(replay.replayed).toBe(true);

    const nextBoard = await boards.createWorkingCopy(scope, { mode: "clone_current", expectedCurrentVersionId: boardConfirmed.value.current.id, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedChapterRowVersion: confirmed.chapterRowVersion });
    const nextBoardConfirmed = await boards.confirmWorkingCopy(scope, { pendingVersionId: nextBoard.value.pending!.id, expectedPendingDocumentDigest: nextBoard.value.pending!.documentDigest, expectedPendingRowVersion: 0, expectedCurrentVersionId: boardConfirmed.value.current.id, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedSourceDigest: storyConfirmed.value.current.documentDigest, expectedChapterRowVersion: nextBoard.chapterRowVersion });
    expect(nextBoardConfirmed.value.current.id).not.toBe(boardConfirmed.value.current.id);
    const persistedChain = await app.get(PrismaService).database().chapter.findUniqueOrThrow({ where: { id: scope.chapterId }, include: { currentPreflightRevision: true, currentStoryboardVersion: true } });
    const persistedSnapshot = persistedChain.currentPreflightRevision ? PreflightDocumentCodecV2.parse(persistedChain.currentPreflightRevision.documentJson).sourceSnapshot : null;
    expect(persistedSnapshot?.storyboard.id).toBe(boardConfirmed.value.current.id);
    expect(persistedChain.currentPreflightRevision?.sourceDigest).toBe(preview.sourceDigest);
    const stale = await productionQuery.get(scope);
    expect(stale.productionState.preflight).toMatchObject({ freshness: "stale", reasonCodes: ["PREFLIGHT_SOURCE_STORYBOARD_CHANGED"] });
    expect(stale.workflow.steps.find((step) => step.key === "image_preflight")).toMatchObject({ status: "needs_update", attention: "source_updated" });
  }, 30_000);

  it("persists task source projection, claim fencing, retry, finish and expired-lease recovery", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const repository = app.get(PersistentTaskRepository);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const project = await projects.createProject({ name: "G2 task runtime", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapterId = project.currentChapterId!;
    const chapter = await app.get(PrismaService).database().chapter.findUniqueOrThrow({ where: { id: chapterId } });
    const scriptText = "任务运行前的当前剧本。";
    const scriptDigest = encodeScriptTextV1(scriptText, { allowEmpty: false }).digest;
    const scriptWorking = await scripts.updateWorkingCopy({ projectId: project.id, chapterId }, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish({ projectId: project.id, chapterId }, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: scriptDigest, expectedChapterRowVersion: scriptWorking.value.chapterRowVersion, createNextChapter: false });
    const pendingStory = await stories.createWorkingCopy({ projectId: project.id, chapterId }, { mode: "empty", expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedChapterRowVersion: published.workingCopy.chapterRowVersion });
    const pendingStoryId = pendingStory.value.pending!.id;
    const sourceDigest = published.scriptVersion.sourceDigest;
    const taskInput = (instruction: string) => ({
      schemaVersion: 2,
      chapterId,
      expectedTargetId: pendingStoryId,
      expectedTargetRowVersion: 0,
      instruction,
      sourceProjection: {
        schemaVersion: 1,
        policyVersion: "g2-task-source-v1",
        projectId: project.id,
        chapterId,
        consumerType: "story_parse",
        sources: [
          { role: "source", order: 1, sourceType: "chapter_script_version", sourceId: published.scriptVersion.id, sourceDigest },
        ],
      },
    });
    const createInput = (instruction: string) => ({
      projectId: project.id,
      type: "story_parse" as const,
      target: { type: "chapter" as const, id: chapterId, chapterId },
      input: taskInput(instruction),
    });

    const created = await repository.create(createInput("first"));
    expect(created.replayed).toBe(false);
    expect(created.item.status).toBe("queued");
    const replay = await repository.create(createInput("first"));
    expect(replay.replayed).toBe(true);
    expect(replay.item.id).toBe(created.item.id);
    const persisted = await app.get(PrismaService).database().generationTask.findUniqueOrThrow({ where: { id: created.item.id }, include: { generationTaskSourcesByTask: { orderBy: [{ role: "asc" }, { order: "asc" }] } } });
    expect(persisted.sourceSetSealedAt).not.toBeNull();
    expect(persisted.sourceDigest).toBe(digestCanonicalJson(persisted.inputJson && typeof persisted.inputJson === "object" ? (persisted.inputJson as { sourceProjection: unknown }).sourceProjection : null));
    expect(persisted.generationTaskSourcesByTask.map((source) => [source.role, source.order])).toEqual([["source", 1]]);

    const claim = await repository.claimNext("worker-a");
    expect(claim?.item).toMatchObject({ id: created.item.id, status: "running", attempt: 1 });
    expect(await repository.claimNext("worker-b")).toBeNull();
    const heartbeat = await repository.heartbeat(created.item.id, claim!.claimToken, new Date(), 42, "provider_running");
    expect(heartbeat.progressPercent).toBe(42);
    const retryAt = new Date(Date.now() + 5_000);
    const retried = await repository.finish({ taskId: created.item.id, claimToken: claim!.claimToken, outcome: "failed", error: { code: "PROVIDER_TEMPORARY", message: "retry", retryable: true }, retryAt });
    expect(retried.status).toBe("retrying");
    const secondClaim = await repository.claimNext("worker-b", new Date(retryAt.getTime() + 1));
    expect(secondClaim?.attempt).toBe(2);
    const succeeded = await repository.finish({ taskId: created.item.id, claimToken: secondClaim!.claimToken, outcome: "succeeded", output: { schemaVersion: 2, targetId: pendingStoryId, targetDocument: {}, targetDocumentDigest: sourceDigest, warnings: [] } }, new Date(retryAt.getTime() + 2_000));
    expect(succeeded).toMatchObject({ status: "succeeded", progressPercent: 100, attempt: 2 });
    expect((await repository.getDetail(created.item.id)).attempts.map((attempt) => attempt.outcome)).toEqual(["failed", "succeeded"]);
    await expect(repository.finish({ taskId: created.item.id, claimToken: claim!.claimToken, outcome: "succeeded", output: {} })).rejects.toBeInstanceOf(TaskLeaseLostError);

    const recoveryTask = await repository.create(createInput("recovery"));
    const recoveryClaim = await repository.claimNext("worker-c");
    expect(recoveryClaim?.item.id).toBe(recoveryTask.item.id);
    const recovered = await repository.recoverExpired(new Date(Date.parse(recoveryClaim!.leaseExpiresAt) + 1));
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ id: recoveryTask.item.id, status: "retrying", attempt: 1 });
  }, 30_000);

  it("runs a claimed story_parse task and atomically applies current or historical output", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const repository = app.get(PersistentTaskRepository);
    const worker = app.get(PersistentTaskWorkerService);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const storyboards = app.get(StoryboardVersionRepository);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "G2 worker", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapterId = project.currentChapterId!;
    const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
    const scriptText = "旧城的钟在雨里响起。";
    const scriptDigest = encodeScriptTextV1(scriptText, { allowEmpty: false }).digest;
    const working = await scripts.updateWorkingCopy({ projectId: project.id, chapterId }, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish({ projectId: project.id, chapterId }, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: scriptDigest, expectedChapterRowVersion: working.value.chapterRowVersion, createNextChapter: false });
    const pending = await stories.createWorkingCopy({ projectId: project.id, chapterId }, { mode: "empty", expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedChapterRowVersion: published.workingCopy.chapterRowVersion });
    const pendingId = pending.value.pending!.id;
    const input = {
      schemaVersion: 2,
      chapterId,
      expectedTargetId: pendingId,
      expectedTargetRowVersion: 0,
      instruction: null,
      sourceProjection: {
        schemaVersion: 1,
        policyVersion: "g2-task-source-v1",
        projectId: project.id,
        chapterId,
        consumerType: "story_parse",
        sources: [{ role: "source", order: 1, sourceType: "chapter_script_version", sourceId: published.scriptVersion.id, sourceDigest: published.scriptVersion.sourceDigest }],
      },
    };
    const document: StoryDocumentV2 = {
      schemaVersion: 2,
      chapterId,
      synopsis: "雨中的钟声拉开序幕。",
      direction: { logline: "钟声", chapterGoal: "建立悬念", coreConflict: "未知来客", emotionalArc: "不安", endingHook: "门外有人" },
      characters: [], scenes: [], beats: [], notes: "worker test",
    };
    worker.setHandler("story_parse", async () => document);
    const created = await repository.create({ projectId: project.id, type: "story_parse", target: { type: "chapter", id: chapterId, chapterId }, input });
    const completed = await worker.runOnce("test-worker");
    expect(completed).toMatchObject({ id: created.item.id, status: "succeeded", output: { targetId: pendingId }, });
    const applied = await prisma.storyVersion.findUniqueOrThrow({ where: { id: pendingId } });
    expect(applied.rowVersion).toBe(1);
    expect((applied.documentJson as { synopsis: string }).synopsis).toBe(document.synopsis);
    expect((await prisma.taskAttempt.findFirstOrThrow({ where: { taskId: created.item.id } })).outcome).toBe("succeeded");

    const staleTask = await repository.create({ projectId: project.id, type: "story_parse", target: { type: "chapter", id: chapterId, chapterId }, input: { ...input, instruction: "stale" } });
    const stalePending = await stories.updateWorkingCopy({ projectId: project.id, chapterId }, {
      pendingVersionId: pendingId,
      expectedChapterRowVersion: (await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } })).rowVersion,
      expectedPendingRowVersion: 1,
      document: { ...document, synopsis: "用户后来修改的版本" },
    });
    const staleCompleted = await worker.runOnce("test-worker");
    expect(staleCompleted).toMatchObject({ id: staleTask.item.id, status: "succeeded" });
    expect((await prisma.generationTask.findUniqueOrThrow({ where: { id: staleTask.item.id } })).applicability).toBe("historical");
    expect(stalePending.value.pending!.rowVersion).toBe(2);
    expect((await prisma.storyVersion.findUniqueOrThrow({ where: { id: pendingId } })).documentJson).toMatchObject({ synopsis: "用户后来修改的版本" });

    const storyRow = await prisma.storyVersion.findUniqueOrThrow({ where: { id: pendingId } });
    const confirmed = await stories.confirmWorkingCopy({ projectId: project.id, chapterId }, {
      pendingVersionId: pendingId,
      expectedPendingDocumentDigest: storyRow.documentDigest as `sha256:${string}`,
      expectedPendingRowVersion: storyRow.rowVersion,
      expectedCurrentVersionId: null,
      expectedSourceScriptVersionId: published.scriptVersion.id,
      expectedSourceDigest: published.scriptVersion.sourceDigest,
      expectedChapterRowVersion: (await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } })).rowVersion,
    });
    const board = await storyboards.createWorkingCopy({ projectId: project.id, chapterId }, {
      mode: "empty",
      expectedCurrentVersionId: null,
      expectedSourceStoryVersionId: confirmed.value.current.id,
      expectedChapterRowVersion: confirmed.chapterRowVersion,
    });
    const boardId = board.value.pending!.id;
    const boardInput = {
      schemaVersion: 2,
      chapterId,
      expectedTargetId: boardId,
      expectedTargetRowVersion: 0,
      instruction: null,
      sourceProjection: {
        schemaVersion: 1,
        policyVersion: "g2-task-source-v1",
        projectId: project.id,
        chapterId,
        consumerType: "shot_generate",
        sources: [{ role: "source", order: 1, sourceType: "story_version", sourceId: confirmed.value.current.id, sourceDigest: confirmed.value.current.documentDigest }],
      },
    };
    const boardDocument: StoryboardDocumentV2 = { schemaVersion: 2, chapterId, shots: [], notes: "worker test" };
    worker.setHandler("shot_generate", async () => boardDocument);
    const boardTask = await repository.create({ projectId: project.id, type: "shot_generate", target: { type: "chapter", id: chapterId, chapterId }, input: boardInput });
    const boardCompleted = await worker.runOnce("test-worker");
    expect(boardCompleted).toMatchObject({ id: boardTask.item.id, status: "succeeded" });
    expect((await prisma.generationTask.findUniqueOrThrow({ where: { id: boardTask.item.id } })).applicability).toBe("current");
    expect((await prisma.storyboardVersion.findUniqueOrThrow({ where: { id: boardId } })).rowVersion).toBe(1);
  }, 30_000);

  it("P6-LAYOUT-EXPORT-01: creates shot prompt/image tasks, locks them, and exports layout/package through DB", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const tasks = app.get(TasksService);
    const scripts = app.get(ScriptVersionRepository);
    const stories = app.get(StoryVersionRepository);
    const boards = app.get(StoryboardVersionRepository);
    const preflight = app.get(PreflightRevisionService);
    const worker = app.get(PersistentTaskWorkerService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "G2 Shot Tasks", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const scope = { projectId: project.id, chapterId: project.currentChapterId! };
    const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: scope.chapterId } });
    const scriptText = "雨夜的门缓缓打开。";
    const scriptDigest = encodeScriptTextV1(scriptText, { allowEmpty: false }).digest;
    const working = await scripts.updateWorkingCopy(scope, { sourceText: scriptText, expectedChapterRowVersion: chapter.rowVersion });
    const published = await scripts.publish(scope, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: scriptDigest, expectedChapterRowVersion: working.value.chapterRowVersion, createNextChapter: false });
    const story = await stories.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedChapterRowVersion: published.workingCopy.chapterRowVersion });
    const storyDoc: StoryDocumentV2 = { schemaVersion: 2, chapterId: scope.chapterId, synopsis: "", direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" }, characters: [], scenes: [], beats: [], notes: "" };
    const storyUpdated = await stories.updateWorkingCopy(scope, { pendingVersionId: story.value.pending!.id, document: storyDoc, expectedPendingRowVersion: 0, expectedChapterRowVersion: story.chapterRowVersion });
    const storyConfirmed = await stories.confirmWorkingCopy(scope, { pendingVersionId: story.value.pending!.id, expectedPendingDocumentDigest: storyUpdated.value.pending!.documentDigest, expectedPendingRowVersion: 1, expectedCurrentVersionId: null, expectedSourceScriptVersionId: published.scriptVersion.id, expectedSourceDigest: published.scriptVersion.sourceDigest, expectedChapterRowVersion: storyUpdated.chapterRowVersion });
    const board = await boards.createWorkingCopy(scope, { mode: "empty", expectedCurrentVersionId: null, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedChapterRowVersion: storyConfirmed.chapterRowVersion });
    const shot = await boards.createPendingShot(scope, {
      pendingVersionId: board.value.pending!.id,
      requestId: randomUUID(),
      afterShotId: null,
      expectedPendingRowVersion: 0,
      expectedChapterRowVersion: board.chapterRowVersion,
      initial: {
        beatId: null, sceneId: null, characterIds: [], coreAction: "开门", emotion: "紧张", shotType: "medium", cameraAngle: "eye_level",
        comic: { panelDescription: "雨夜门口", composition: "中景", dialogue: "", caption: "", panelRhythm: "normal" },
        motion: { visualDescription: "静止", compositionDesign: "居中", cameraMovement: "static", frameType: "action", durationMs: 0, durationHint: "", voiceLines: [] }, promptDraft: "",
      },
    });
    const pendingBoard = shot.workingCopy.pending!;
    const boardConfirmed = await boards.confirmWorkingCopy(scope, { pendingVersionId: pendingBoard.id, expectedPendingDocumentDigest: pendingBoard.documentDigest, expectedPendingRowVersion: pendingBoard.rowVersion ?? 0, expectedCurrentVersionId: null, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedSourceDigest: storyConfirmed.value.current.documentDigest, expectedChapterRowVersion: shot.workingCopy.productionState.chapterRowVersion });
    const preview = await preflight.getPreview(scope, "shot tasks");
    const preflightConfirmed = await preflight.confirm(scope, { expectedSourceStoryboardVersionId: boardConfirmed.value.current.id, expectedSourceDigest: preview.sourceDigest, expectedChapterRowVersion: preview.chapterRowVersion, notes: "shot tasks" });
    const shotId = shot.shotId;

    const promptTask = await tasks.create({ projectId: project.id, type: "shot_prompt_generate", target: { type: "shot", id: shotId, chapterId: scope.chapterId }, input: { chapterId: scope.chapterId, shotId } });
    expect(promptTask.input.sourceProjection).toBeTruthy();
    const promptDone = await worker.runOnce("shot-worker");
    expect(promptDone).toMatchObject({ id: promptTask.id, status: "succeeded", output: { targetId: shotId } });
    expect((await prisma.generationTask.findUniqueOrThrow({ where: { id: promptTask.id } })).applicability).toBe("current");

    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000005fe02fea20000000049454e44ae426082", "hex");
    worker.setHandler("image_generate", async () => ({ candidates: [{ index: 1, buffer: png, mimeType: "image/png" }] }));
    const imageTask = await tasks.create({ projectId: project.id, type: "image_generate", target: { type: "shot", id: shotId, chapterId: scope.chapterId }, input: { chapterId: scope.chapterId, shotId, requestId: randomUUID(), candidateCount: 1 } });
    const imageDone = await worker.runOnce("shot-worker");
    expect(imageDone).toMatchObject({ id: imageTask.id, status: "succeeded", output: { targetId: shotId, candidates: [{ index: 1 }] } });
    const candidate = await prisma.candidate.findFirstOrThrow({ where: { taskId: imageTask.id } });
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: candidate.assetId } });
    expect(asset).toMatchObject({ status: "ready", sourceTaskId: imageTask.id, sha256: expect.stringMatching(/^sha256:/) });
    expect((await prisma.shot.findUniqueOrThrow({ where: { id: shotId } })).currentCandidateLockRevisionId).toBeNull();
    const cancelTask = await tasks.create({ projectId: project.id, type: "image_generate", target: { type: "shot", id: shotId, chapterId: scope.chapterId }, input: { chapterId: scope.chapterId, shotId, requestId: randomUUID(), candidateCount: 1 }, options: { priority: 2 } });
    const cancelled = await tasks.cancelForApi(cancelTask.id);
    expect(cancelled.status).toBe("cancelled");
    expect(await worker.runOnce("shot-worker")).toBeNull();
    expect(await prisma.candidate.count({ where: { taskId: cancelTask.id } })).toBe(0);

    const staleTask = await tasks.create({ projectId: project.id, type: "shot_prompt_generate", target: { type: "shot", id: shotId, chapterId: scope.chapterId }, input: { chapterId: scope.chapterId, shotId }, options: { priority: 1 } });
    const nextBoard = await boards.createWorkingCopy(scope, { mode: "clone_current", expectedCurrentVersionId: boardConfirmed.value.current.id, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedChapterRowVersion: preflightConfirmed.chapterRowVersion });
    const nextConfirmed = await boards.confirmWorkingCopy(scope, { pendingVersionId: nextBoard.value.pending!.id, expectedPendingDocumentDigest: nextBoard.value.pending!.documentDigest, expectedPendingRowVersion: nextBoard.value.pending!.rowVersion ?? 0, expectedCurrentVersionId: boardConfirmed.value.current.id, expectedSourceStoryVersionId: storyConfirmed.value.current.id, expectedSourceDigest: storyConfirmed.value.current.documentDigest, expectedChapterRowVersion: nextBoard.chapterRowVersion });
    expect(nextConfirmed.value.current.id).not.toBe(boardConfirmed.value.current.id);
    const staleDone = await worker.runOnce("shot-worker");
    expect(staleDone).toMatchObject({ id: staleTask.id, status: "succeeded" });
    expect((await prisma.generationTask.findUniqueOrThrow({ where: { id: staleTask.id } })).applicability).toBe("historical");
    const nextPreview = await preflight.getPreview(scope, "shot tasks after replacement");
    await preflight.confirm(scope, { expectedSourceStoryboardVersionId: nextConfirmed.value.current.id, expectedSourceDigest: nextPreview.sourceDigest, expectedChapterRowVersion: nextPreview.chapterRowVersion, notes: "shot tasks after replacement" });
    const locked = await projects.lockChapterCandidate(project.id, scope.chapterId, { candidateId: candidate.id });
    expect(locked.candidate).toMatchObject({ id: candidate.id, status: "locked" });
    expect(locked.shots.find((item) => item.id === shotId)?.lockedCandidateId).toBe(candidate.id);
    const lockRevision = await prisma.candidateLockRevision.findFirstOrThrow({ where: { shotId }, orderBy: { revision: "desc" } });
    expect(lockRevision).toMatchObject({ action: "lock", candidateId: candidate.id, revision: 1, origin: "runtime" });
    const replayLock = await projects.lockChapterCandidate(project.id, scope.chapterId, { candidateId: candidate.id });
    expect(replayLock.candidate.status).toBe("locked");
    expect(await prisma.candidateLockRevision.count({ where: { shotId } })).toBe(1);
    const completedImages = await projects.completeChapterImages(project.id, scope.chapterId);
    expect(completedImages.chapter.status).toBe("images_done");
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: scope.chapterId } })).milestoneStatus).toBe("images_done");

    const layout = await projects.buildChapterLayout(project.id, scope.chapterId);
    expect(layout.layout.pages).toHaveLength(1);
    expect(await prisma.layoutWorkingCopy.count({ where: { chapterId: scope.chapterId } })).toBe(1);
    const exported = await projects.exportChapterLayout(project.id, scope.chapterId);
    expect(exported.layout.pages).toHaveLength(1);
    const layoutRevision = await prisma.layoutRevision.findFirstOrThrow({ where: { chapterId: scope.chapterId } });
    expect(layoutRevision.bindingSetSealedAt).not.toBeNull();
    expect(await prisma.layoutSourceBinding.count({ where: { layoutRevisionId: layoutRevision.id } })).toBe(1);
    const exportRevision = await prisma.exportRevision.findFirstOrThrow({ where: { chapterId: scope.chapterId, kind: "layout_publication" } });
    expect(exportRevision).toMatchObject({ status: "ready", completionApplicability: "current" });
    expect(await prisma.exportArtifact.count({ where: { exportRevisionId: exportRevision.id } })).toBe(1);
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: scope.chapterId } })).currentExportRevisionId).toBe(exportRevision.id);
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: scope.chapterId } })).currentLayoutRevisionId).toBe(layoutRevision.id);
    const workingCopyAfterExport = await prisma.layoutWorkingCopy.findUniqueOrThrow({ where: { chapterId: scope.chapterId } });
    expect({ wc: workingCopyAfterExport.documentDigest, rev: layoutRevision.documentDigest, wcLocks: workingCopyAfterExport.sourceLockSetDigest, revLocks: layoutRevision.sourceLockSetDigest }).toEqual({ wc: layoutRevision.documentDigest, rev: layoutRevision.documentDigest, wcLocks: layoutRevision.sourceLockSetDigest, revLocks: layoutRevision.sourceLockSetDigest });
    const replayedExport = await projects.exportChapterLayout(project.id, scope.chapterId);
    expect(replayedExport.layout.id).toBe(exported.layout.id);
    expect(await prisma.layoutRevision.count({ where: { chapterId: scope.chapterId } })).toBe(1);
    expect(await prisma.exportRevision.count({ where: { chapterId: scope.chapterId, kind: "layout_publication" } })).toBe(1);
    const packageResult = await projects.exportAssetPackage(project.id, scope.chapterId);
    expect(packageResult.manifest.files.length).toBeGreaterThan(1);
    expect(packageResult.asset.type).toBe("archive");
    const packageRevision = await prisma.exportRevision.findFirstOrThrow({ where: { chapterId: scope.chapterId, kind: "asset_package" } });
    expect(packageRevision).toMatchObject({ status: "ready", completionApplicability: "current" });
    expect(await prisma.exportArtifact.count({ where: { exportRevisionId: packageRevision.id } })).toBe(1);
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: scope.chapterId } })).milestoneStatus).toBe("exported");
  }, 30_000);

  it("P7-DIALOGUE-DB-01: persists dialogue thread/messages/session and settles running messages after restart", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(DialogueModule, { logger: false });
    const projects = app.get(ProjectsService);
    const dialogue = app.get(DialogueService);
    const runtime = app.get(OpenCodeRuntimeService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P7 对话 DB", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const fakeModel = { providerId: "fake", modelId: "fake-dialogue" };
    runtime.createSession = async () => "fake-session-1";
    runtime.sendMessage = async ({ content }) => content.includes("灵感")
      ? {
        content: JSON.stringify({ seeds: [
          { title: "方向一", logline: "一个关于选择的故事", keyConflict: "选择与代价", visualHook: "雨夜车站", firstChapterDirection: "主角在车站做出第一次选择", genreTags: ["剧情"] },
          { title: "方向二", logline: "一个关于寻找的故事", keyConflict: "真相与谎言", visualHook: "废弃剧院", firstChapterDirection: "主角在剧院发现第一条线索", genreTags: ["悬疑"] },
          { title: "方向三", logline: "一个关于守护的故事", keyConflict: "责任与自由", visualHook: "海边灯塔", firstChapterDirection: "主角在灯塔守住秘密", genreTags: ["奇幻"] },
        ]}),
        model: fakeModel,
      }
      : { content: "fake response", model: fakeModel };
    const first = await dialogue.sendMessage(project.id, "project_story", { content: "hello", model: fakeModel });
    expect(first.assistantMessage.status).toBe("completed");
    expect(await prisma.conversationThread.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.conversationMessage.count({ where: { threadId: first.thread.id } })).toBe(2);
    expect(await prisma.dialogueRuntimeSession.count({ where: { threadId: first.thread.id, status: "active" } })).toBe(1);
    const toolTurn = await dialogue.sendMessage(project.id, "project_characters", { content: "请提取项目角色", intent: "generate_project_characters", model: fakeModel });
    expect(toolTurn.toolResults?.[0]?.status).toBe("failed");
    expect(await prisma.dialogueToolResult.count({ where: { threadId: toolTurn.thread.id } })).toBe(1);
    const pendingTurn = await dialogue.sendMessage(project.id, "project_story", { content: "请生成灵感方向", intent: "generate_inspiration_seeds", model: fakeModel });
    expect(pendingTurn.toolResults?.[0]?.status).toBe("succeeded");
    expect(await prisma.pendingDialogueArtifact.count({ where: { projectId: project.id, status: "pending" } })).toBe(1);
    const interruptedId = randomUUID();
    await prisma.conversationMessage.create({ data: { id: interruptedId, threadId: first.thread.id, role: "assistant", content: "", status: "running", providerId: fakeModel.providerId, modelId: fakeModel.modelId, errorJson: undefined, errorSchemaVersion: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null } });
    await app.close();
    app = null;
    app = await NestFactory.createApplicationContext(DialogueModule, { logger: false });
    const reopened = await app.get(DialogueService).getProjectThread(project.id, "project_story", null);
    expect(reopened.messages.find((message) => message.id === interruptedId)).toMatchObject({ status: "failed", error: { code: "DIALOGUE_STREAM_INTERRUPTED" } });
    const reopenedPrisma = app.get(PrismaService).database();
    expect(await reopenedPrisma.conversationMessage.findUniqueOrThrow({ where: { id: interruptedId } })).toMatchObject({ status: "failed" });
    expect(await reopenedPrisma.dialogueRuntimeSession.count({ where: { threadId: first.thread.id, status: "closed" } })).toBe(1);
    const discarded = await app.get(DialogueService).sendMessage(project.id, "project_story", { content: "取消灵感", model: fakeModel });
    expect(discarded.toolResults?.[0]).toMatchObject({ tool: "generate_inspiration_seeds", status: "failed" });
    expect(await reopenedPrisma.pendingDialogueArtifact.count({ where: { projectId: project.id, status: "pending" } })).toBe(0);
    expect(await reopenedPrisma.pendingDialogueArtifact.count({ where: { projectId: project.id, status: "discarded" } })).toBe(1);
    const reopenedRuntime = app.get(OpenCodeRuntimeService);
    reopenedRuntime.createSession = async () => "fake-session-2";
    reopenedRuntime.sendMessage = async () => ({ content: "fake response after restart", model: fakeModel });
    await app.get(DialogueService).sendMessage(project.id, "project_story", { content: "hello after restart", model: fakeModel });
    expect(await reopenedPrisma.dialogueRuntimeSession.count({ where: { threadId: first.thread.id, status: "active" } })).toBe(1);
    expect(await reopenedPrisma.dialogueRuntimeSession.count({ where: { threadId: first.thread.id } })).toBe(2);
    const maintenance = app.get(MaintenanceCoordinator);
    await maintenance.drain(1_000);
    await maintenance.close();
    await expect(app.get(DialogueService).sendMessage(project.id, "project_story", { content: "blocked by maintenance", model: fakeModel })).rejects.toMatchObject({ code: "MAINTENANCE_MODE" });
    await maintenance.reopen();
    const messageCountBeforeDeleting = await reopenedPrisma.conversationMessage.count({ where: { threadId: first.thread.id } });
    await reopenedPrisma.project.update({ where: { id: project.id }, data: { lifecycleStatus: "deleting", deletingAt: new Date() } });
    await expect(app.get(DialogueService).sendMessage(project.id, "project_story", { content: "blocked by deleting", model: fakeModel })).rejects.toMatchObject({ message: "PROJECT_NOT_FOUND" });
    expect(await reopenedPrisma.conversationMessage.count({ where: { threadId: first.thread.id } })).toBe(messageCountBeforeDeleting);
  }, 30_000);

  it("P8-OTB-01/DEL-00: claims strict events and records a DB project deleting intent idempotently", async () => {
    const { deployed, workspaceRoot } = await prepareDatabase();
    expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const outbox = app.get(ProjectDeleteOutboxService);
    const prisma = app.get(PrismaService).database();
    const workspace = app.get(WorkspacePathService);
    const project = await projects.createProject({ name: "P8 删除意图", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const chapterId = project.currentChapterId!;
    const scripts = app.get(ScriptVersionService);
    const initialWorking = await scripts.getWorkingCopy({ projectId: project.id, chapterId });
    const scriptText = "OBS-06 必须能删除已经发布正式剧本的临时项目。";
    const updatedWorking = await scripts.updateWorkingCopy(
      { projectId: project.id, chapterId },
      {
        sourceText: scriptText,
        expectedChapterRowVersion: initialWorking.chapterRowVersion,
      },
    );
    const published = await scripts.publish(
      { projectId: project.id, chapterId },
      {
        expectedCurrentScriptVersionId: null,
        expectedWorkingDigest: updatedWorking.value.digest,
        expectedChapterRowVersion: updatedWorking.value.chapterRowVersion,
        createNextChapter: false,
      },
    );
    expect(published.scriptVersion.status).toBe("current");
    await mkdir(path.join(workspaceRoot, "projects", project.id), { recursive: true });
    await writeFile(path.join(workspaceRoot, "projects", project.id, "project.json"), "legacy metadata", "utf8");
    const first = await projects.deleteProject(project.id);
    expect(first).toMatchObject({ deletedProjectId: project.id, status: "pending", cleanupEventId: expect.any(String) });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ lifecycleStatus: "deleting", deletingAt: expect.any(Date) });
    expect(await prisma.outboxEvent.count({ where: { eventType: "project.delete_files", aggregateId: project.id } })).toBe(1);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "chapters"
          SET "current_script_version_id" = NULL,
              "script_working_state" = 'dirty',
              "row_version" = "row_version" + 1
          WHERE "project_id" = ?`,
        project.id,
      ),
    ).rejects.toMatchObject({
      meta: { message: "AIR_G1:trg_chapters_pointer_scope_update" },
    });
    const replay = await projects.deleteProject(project.id);
    expect(replay.cleanupEventId).toBe(first.cleanupEventId);
    expect(await prisma.outboxEvent.count({ where: { eventType: "project.delete_files", aggregateId: project.id } })).toBe(1);
    await app.close();
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const reopenedOutbox = app.get(ProjectDeleteOutboxService);
    const reopenedPrisma = app.get(PrismaService).database();
    const processed = await reopenedOutbox.processNext("p8-worker");
    expect(processed).toMatchObject({ eventId: first.cleanupEventId, eventType: "project.delete_files", status: "processed", attempt: 1 });
    expect(await reopenedPrisma.outboxEvent.findUniqueOrThrow({ where: { id: first.cleanupEventId! } })).toMatchObject({ status: "processed", leaseToken: null, processedAt: expect.any(Date) });
    await expect(access(path.join(workspaceRoot, "projects", project.id))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(app.get(ProjectsService).updateProjectDraft(project.id, { name: "late write" })).rejects.toThrow();
    await expect(app.get(ProjectsService).purgeDeletedProject(project.id)).resolves.toMatchObject({ projectId: project.id, purged: true });
    expect(await reopenedPrisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await reopenedPrisma.chapter.count({ where: { projectId: project.id } })).toBe(0);
    expect(await reopenedPrisma.chapterScriptVersion.count({ where: { chapterId } })).toBe(0);
    expect(await reopenedPrisma.outboxEvent.findUniqueOrThrow({ where: { id: first.cleanupEventId! } })).toMatchObject({ status: "processed" });
    expect(workspace.resolveVirtualPath(`/workspace/projects/${project.id}`)).toContain(path.join(workspaceRoot, "projects", project.id));
  }, 30_000);

  it("P8-OTB-02/OTB-FS-01: rejects unknown payload fields and keeps the event terminal", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const outbox = app.get(ProjectDeleteOutboxService);
    const prisma = app.get(PrismaService).database();
    const payload = { schemaVersion: 1, projectId: randomUUID(), projectRootStorageKey: "projects/unknown", assetManifestDigest: digestCanonicalJson([]), unexpected: "must reject" };
    const event = await prisma.outboxEvent.create({ data: { eventType: "project.delete_files", aggregateType: "project", aggregateId: payload.projectId, payloadJson: payload, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson(payload), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `p8-unknown:${randomUUID()}` } });
    const result = await outbox.processNext("p8-strict");
    expect(result).toMatchObject({ eventId: event.id, status: "failed", errorCode: "OUTBOX_PROJECT_DELETE_PAYLOAD_UNKNOWN_OR_MISSING_FIELD" });
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: "failed", attempt: 1 });
    await expect(outbox.processNext("p8-strict-replay")).resolves.toBeNull();
  }, 30_000);

  it("P8-OTB-05: heartbeat fences the lease and expired processing is recovered", async () => {
    const { deployed } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const outbox = app.get(ProjectDeleteOutboxService);
    const prisma = app.get(PrismaService).database();
    const payload = { schemaVersion: 1, projectId: randomUUID(), projectRootStorageKey: "projects/lease", assetManifestDigest: digestCanonicalJson([]) };
    const event = await prisma.outboxEvent.create({ data: { eventType: "project.delete_files", aggregateType: "project", aggregateId: payload.projectId, payloadJson: { ...payload, unexpected: "lease" }, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson({ ...payload, unexpected: "lease" }), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `p8-lease:${randomUUID()}` } });
    const firstNow = new Date();
    const first = await outbox.claimNext("lease-a", firstNow);
    expect(first).toMatchObject({ event: { id: event.id, status: "processing", attempt: 1 }, workerId: "lease-a" });
    const heartbeat = await outbox.heartbeat(event.id, first!.leaseToken, new Date(firstNow.getTime() + 1_000));
    expect(heartbeat.leaseOwnerId).toBe("lease-a");
    const recoveredAt = new Date(firstNow.getTime() + 61_000);
    expect(await outbox.claimNext("lease-b", recoveredAt)).toBeNull();
    const recoveryRun = new Date(firstNow.getTime() + 120_000);
    expect(await outbox.claimNext("lease-b", recoveryRun)).toBeNull();
    const second = await outbox.claimNext("lease-b", new Date(recoveryRun.getTime() + 6_000));
    expect(second).toMatchObject({ event: { id: event.id, status: "processing", attempt: 2 }, workerId: "lease-b" });
    expect(await outbox.processNext("lease-c", new Date(firstNow.getTime() + 68_000))).toBeNull();
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: "processing", attempt: 2 });
  }, 30_000);

  it("P8-OTB-03/OTB-FS-02: promotes and deletes an exact asset path with hash fencing", async () => {
    const { deployed, workspaceRoot } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const outbox = app.get(ProjectDeleteOutboxService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P8 资产事件", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const bytes = Buffer.from("p8-asset-bytes", "utf8");
    const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as `sha256:${string}`;
    const assetId = randomUUID();
    const tempStorageKey = `projects/${project.id}/staging/${assetId}.bin`;
    const finalStorageKey = `projects/${project.id}/assets/${assetId}.bin`;
    await mkdir(path.join(workspaceRoot, path.dirname(tempStorageKey)), { recursive: true });
    await writeFile(path.join(workspaceRoot, tempStorageKey), bytes);
    await prisma.asset.create({ data: { id: assetId, projectId: project.id, chapterId: null, type: "document", role: "test_asset", mimeType: "application/octet-stream", storageKey: finalStorageKey, status: "staged", sha256: null, bytes: null, width: null, height: null, durationMs: null, sourceTaskId: null, metadataJson: {}, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson({}), createdAt: new Date(), updatedAt: new Date(), readyAt: null, failedAt: null, deletingAt: null } });
    const promotePayload = { schemaVersion: 1, assetId, projectId: project.id, chapterId: null, tempStorageKey, finalStorageKey, sha256, bytes: bytes.byteLength };
    const promote = await prisma.outboxEvent.create({ data: { eventType: "asset.promote", aggregateType: "asset", aggregateId: assetId, payloadJson: promotePayload, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson(promotePayload), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `asset.promote:${assetId}:${sha256}` } });
    expect(await outbox.processNext("p8-asset-worker")).toMatchObject({ eventId: promote.id, status: "processed" });
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).toMatchObject({ status: "ready", sha256, bytes: bytes.byteLength, readyAt: expect.any(Date) });
    await expect(readFile(path.join(workspaceRoot, finalStorageKey))).resolves.toEqual(bytes);
    const deletePayload = { schemaVersion: 1, assetId, projectId: project.id, chapterId: null, storageKey: finalStorageKey, expectedSha256: sha256, reason: "explicit_delete" as const };
    const deletion = await prisma.outboxEvent.create({ data: { eventType: "asset.delete", aggregateType: "asset", aggregateId: assetId, payloadJson: deletePayload, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson(deletePayload), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `asset.delete:${assetId}:${sha256}:explicit_delete` } });
    expect(await outbox.processNext("p8-asset-worker")).toMatchObject({ eventId: deletion.id, status: "processed" });
    await expect(access(path.join(workspaceRoot, finalStorageKey))).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("P8-OTB-04/SEC-11/ACT-archive: deletes an old fake secret ref and archives metadata without asset bytes", async () => {
    const { deployed, workspaceRoot } = await prepareDatabase();
    expect(deployed.code).toBe(0);
    process.env.AIROAMING_SECRET_STORE_ADAPTER = "fake";
    process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = path.join(testRoot!, "fake-secret-store");
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const projects = app.get(ProjectsService);
    const outbox = app.get(ProjectDeleteOutboxService);
    const secretStore = app.get((await import("../settings/secret-store.js")).SecretStoreService);
    const prisma = app.get(PrismaService).database();
    const project = await projects.createProject({ name: "P8 归档与秘密", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const projectJson = Buffer.from("metadata", "utf8");
    const projectPath = path.join(workspaceRoot, "projects", project.id, "project.json");
    await mkdir(path.dirname(projectPath), { recursive: true });
    await writeFile(projectPath, projectJson);
    const metadataEntry = { storageKey: `projects/${project.id}/project.json`, sha256: `sha256:${createHash("sha256").update(projectJson).digest("hex")}`, bytes: projectJson.byteLength } as const;
    const metadataDigest = digestCanonicalJson([metadataEntry]);
    const provider = await prisma.providerConfig.create({ data: { id: randomUUID(), providerId: `p8-${randomUUID()}`, runtimeKind: "image", displayName: "P8 fake", modelId: "fake", baseUrl: null, enabled: false } });
    const credential = await prisma.credentialMetadata.create({ data: { id: randomUUID(), providerConfigId: provider.id, owner: "image_secret_store", status: "unconfigured", secretRef: null, fingerprint: null, configured: false } });
    const secretMetadata = await secretStore.put({ credentialId: credential.id, secret: (await import("../settings/secret-store.js")).SecretString.from("p8-secret") });
    await prisma.credentialMetadata.update({ where: { id: credential.id }, data: { status: "configured", configured: true, secretRef: secretMetadata.secretRef, fingerprint: secretMetadata.fingerprint } });
    const secretPayload = { schemaVersion: 1, credentialMetadataId: credential.id, oldSecretRef: secretMetadata.secretRef, expectedFingerprint: secretMetadata.fingerprint, reason: "clear" as const };
    const secretEvent = await prisma.outboxEvent.create({ data: { eventType: "secret.delete_old_ref", aggregateType: "credential_metadata", aggregateId: credential.id, payloadJson: secretPayload, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson(secretPayload), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `secret.delete_old_ref:${credential.id}:${secretMetadata.secretRef}` } });
    await prisma.credentialMetadata.update({ where: { id: credential.id }, data: { status: "clearing", configured: true, secretRef: secretMetadata.secretRef, fingerprint: secretMetadata.fingerprint } });
    expect(await outbox.processNext("p8-secret-worker")).toMatchObject({ eventId: secretEvent.id, status: "processed" });
    expect(await prisma.credentialMetadata.findUniqueOrThrow({ where: { id: credential.id } })).toMatchObject({ status: "unconfigured", configured: false, secretRef: null, fingerprint: null });
    await expect(secretStore.get(credential.id)).rejects.toMatchObject({ message: "SECRET_STORE_ENTRY_MISSING" });
    const archivePayload = { schemaVersion: 1, cutoverRunId: `p8-run-${randomUUID()}`, projectId: project.id, sourceManifestDigest: metadataDigest, archiveStorageKey: `archives/${project.id}`, metadataEntriesDigest: metadataDigest };
    const archiveEvent = await prisma.outboxEvent.create({ data: { eventType: "legacy_metadata.archive", aggregateType: "project", aggregateId: project.id, payloadJson: archivePayload, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson(archivePayload), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `legacy-metadata.archive:${archivePayload.cutoverRunId}:${project.id}:${metadataDigest}` } });
    expect(await outbox.processNext("p8-archive-worker")).toMatchObject({ eventId: archiveEvent.id, status: "processed" });
    await expect(access(path.join(workspaceRoot, "projects", project.id, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(workspaceRoot, archivePayload.archiveStorageKey, "project.json"))).resolves.toEqual(projectJson);
  }, 30_000);
});
