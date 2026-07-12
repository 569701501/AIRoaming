import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
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
import type { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectsModule } from "./projects.module.js";
import { ProjectsService } from "./projects.service.js";

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
  migrationName: (typeof G1_RUNTIME_MIGRATION_NAMES)[number],
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
  migrationNames: readonly (typeof G1_RUNTIME_MIGRATION_NAMES)[number][],
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
    migrationNames: readonly (typeof G1_RUNTIME_MIGRATION_NAMES)[number][] =
      G1_RUNTIME_MIGRATION_NAMES,
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
      migrationNames.length === G1_RUNTIME_MIGRATION_NAMES.length &&
      migrationNames.every(
        (migrationName, index) => migrationName === G1_RUNTIME_MIGRATION_NAMES[index],
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
      "DB_PERSISTENCE_MIGRATION_LEDGER_MISSING:0008_sqlite_checks_triggers_indexes",
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
      "DB_PERSISTENCE_MIGRATION_LEDGER_FAILED:0008_sqlite_checks_triggers_indexes",
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
    expect(deployed.stdout).toContain("8 migrations found");
    expect(deployed.stdout).toContain("All migrations have been successfully applied.");

    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    let projects = app.get(ProjectsService);
    const first = await projects.createProject({
      name: "DB 垂直切片一",
      type: "comic",
      comicFormat: "page_horizontal",
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
    const normalizedDraftText = `${draftText}\n`;
    const draft = await projects.saveChapterDraft(
      first.id,
      first.currentChapterId!,
      { sourceText: draftText, title: "雨夜来信", summary: "信使抵达" },
    );
    expect(draft.chapter.sourceText).toBe(normalizedDraftText);
    const completed = await projects.completeChapter(
      first.id,
      first.currentChapterId!,
      { sourceText: draftText, createNextChapter: false },
    );
    expect(completed.createdNextChapter).toBe(false);
    expect(completed.completedChapter.status).toBe("script_done");
    expect(completed.scriptVersion.status).toBe("current");
    await projects.saveChapterDraft(first.id, first.currentChapterId!, {
      sourceText: draftText,
      title: "雨夜来信",
      summary: "信使抵达",
    });
    expect(
      (await app.get(PrismaService).database().chapter.findUniqueOrThrow({
        where: { id: first.currentChapterId! },
      })).scriptWorkingState,
    ).toBe("clean");

    const secondCompletion = await projects.completeChapter(
      second.id,
      second.currentChapterId!,
      { sourceText: "第二个项目也完成第一章。" },
    );
    expect(secondCompletion.createdNextChapter).toBe(true);
    expect(secondCompletion.chapters).toHaveLength(2);
    expect(new Set(secondCompletion.chapters.map((chapter) => chapter.id)).size).toBe(2);
    expect(secondCompletion.chapters[1]?.id).toBe(`${second.id}_chapter_002`);

    await expect(projects.resetProjectScript(first.id)).rejects.toThrow(
      "DB_PERSISTENCE_OPERATION_UNSUPPORTED:reset_project_script",
    );
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
      sourceText: normalizedDraftText,
      currentScriptVersionId: completed.scriptVersion.id,
    });
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
      scriptWorkingText: normalizedDraftText,
      scriptWorkingState: "clean",
      currentScriptVersionId: completed.scriptVersion.id,
    });
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
});
