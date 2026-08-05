import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
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

import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { DocumentLibraryRepository } from "./document-library.repository.js";
import { DocumentLibraryStore } from "./document-library.store.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FORMAL_SCHEMA_PATH = path.join(REPO_ROOT, "apps/server/prisma/schema.prisma");

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

function runPrismaDeploy(databaseUrl: string): Promise<PrismaResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, "apps/server/node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        FORMAL_SCHEMA_PATH,
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("DocumentLibrary repository & store", () => {
  let testRoot: string | null = null;
  let markerPath: string | null = null;
  const previousEnvironment = new Map(
    ENVIRONMENT_NAMES.map((name) => [name, process.env[name]] as const),
  );

  async function prepare(): Promise<{
    workspaceRoot: string;
    databasePath: string;
    repository: DocumentLibraryRepository;
    store: DocumentLibraryStore;
  }> {
    const runId = `document-library-${randomUUID()}`;
    testRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), `${runId}-`)));
    markerPath = path.join(testRoot, ".airoaming-test-root");
    await writeFile(
      markerPath,
      `${JSON.stringify({ schemaVersion: 1, owner: "document-library", runId, root: testRoot })}\n`,
      "utf8",
    );
    const workspaceRoot = path.join(testRoot, "workspace");
    const dataRoot = path.join(testRoot, "data");
    const databasePath = path.join(dataRoot, "db", "airoaming.sqlite");
    await mkdir(path.dirname(databasePath), { recursive: true });
    const handle = await open(databasePath, "wx", 0o600);
    await handle.close();
    const databaseUrl = `file:${databasePath}`;
    const deployed = await runPrismaDeploy(databaseUrl);
    if (deployed.code !== 0) throw new Error(`${deployed.stdout}\n${deployed.stderr}`);

    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.AIROAMING_WORKSPACE_ROOT = workspaceRoot;
    process.env.AIROAMING_DATA_ROOT = dataRoot;
    process.env.DATABASE_URL = databaseUrl;

    const prismaService = new (await import("../persistence/prisma.service.js")).PrismaService();
    await prismaService.onModuleInit();
    const workspacePathService = new WorkspacePathService();
    await workspacePathService.ensureReady();
    const repository = new DocumentLibraryRepository(prismaService);
    const store = new DocumentLibraryStore(workspacePathService);
    return { workspaceRoot, databasePath, repository, store };
  }

  afterEach(async () => {
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (testRoot && markerPath) {
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as { owner: string; root: string };
      expect(marker).toMatchObject({ owner: "document-library", root: testRoot });
      await rm(testRoot, { recursive: true, force: false });
    }
    testRoot = null;
    markerPath = null;
  });

  it("persists a document work with chapters and serves text projections", async () => {
    const { workspaceRoot, repository, store } = await prepare();

    const sourceText = "第一章 开始\n正文一\n\n第二章 继续\n正文二\n\n未分章内容\n";
    const content = Buffer.from(sourceText, "utf8");
    const workId = `dw_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const saved = await store.saveSourceFile(workId, "test-novel.txt", content);
    expect(saved.sha256).toBe(`sha256:${createHash("sha256").update(content).digest("hex")}`);
    expect(saved.storageKey).toContain(`/workspace/documents/${workId}/`);
    expect(await store.readSourceText(saved.storageKey)).toBe(sourceText);

    const created = await repository.createWorkWithChapters(
      {
        id: workId,
        name: "测试小说",
        kind: "text",
        sourceStorageKey: saved.storageKey,
        sourceSha256: saved.sha256,
        sourceBytes: saved.bytes,
        sourceEncoding: "utf-8",
      },
      [
        { workId, order: 1, title: "第一章 开始", groupLabel: "1-100 章", startOffset: 0, endOffset: 8, charCount: 8, anomaliesJson: null },
        { workId, order: 2, title: "第二章 继续", groupLabel: "1-100 章", startOffset: 10, endOffset: 18, charCount: 8, anomaliesJson: null },
        { workId, order: 3, title: "未分章内容", groupLabel: "未分章", startOffset: 20, endOffset: 26, charCount: 6, anomaliesJson: null },
      ],
    );
    expect(created.work.status).toBe("ready");
    expect(created.work.chapterCount).toBe(3);
    expect(created.work.unassignedCount).toBe(1);

    const list = await repository.listWorks();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("测试小说");

    const detail = await repository.getWorkWithChapters(created.work.id);
    expect(detail?.chapters).toHaveLength(3);
    expect(detail?.chapters[0]).toMatchObject({ order: 1, title: "第一章 开始", groupLabel: "1-100 章" });

    const chapterText = await store.readChapterText(saved.storageKey, 12, 18);
    expect(chapterText).toBe("第二章 继续");

    const renamed = await repository.renameWork(created.work.id, "改名小说");
    expect(renamed.name).toBe("改名小说");
    expect(workspaceRoot).toContain("workspace");
  });

  it("projects chapter text correctly for CRLF files (offset consistency with splitter)", async () => {
    const { repository, store } = await prepare();

    // 真实网文常为 \r\n 换行；拆章 offset 基于 \r\n→\n 归一化文本，读取端必须同样归一化
    const sourceText = "第一章 开始\r\n正文一\r\n\r\n第二章 继续\r\n正文二\r\n";
    const content = Buffer.from(sourceText, "utf8");
    const workId = `dw_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const saved = await store.saveSourceFile(workId, "crlf.txt", content);
    const { splitDocumentTextV1 } = await import("@airoaming/shared");
    const normalized = sourceText.replace(/\r\n/g, "\n");
    const split = splitDocumentTextV1(normalized);
    expect(split.chapters).toHaveLength(2);

    await repository.createWorkWithChapters(
      {
        id: workId,
        name: "CRLF测试",
        kind: "text",
        sourceStorageKey: saved.storageKey,
        sourceSha256: saved.sha256,
        sourceBytes: saved.bytes,
        sourceEncoding: "utf-8",
      },
      split.chapters.map((chapter) => ({
        workId,
        order: chapter.order,
        title: chapter.title,
        groupLabel: chapter.groupLabel,
        startOffset: chapter.startOffset,
        endOffset: chapter.endOffset,
        charCount: chapter.charCount,
        anomaliesJson: null,
      })),
    );

    const detail = await repository.getWorkWithChapters(workId);
    const first = detail!.chapters[0]!;
    const firstText = await store.readChapterText(saved.storageKey, first.startOffset, first.endOffset, "utf-8");
    expect(firstText).toContain("正文一");
    expect(firstText).not.toContain("第二章");
    expect(firstText).toContain("第一章 开始");
    const second = detail!.chapters[1]!;
    const secondText = await store.readChapterText(saved.storageKey, second.startOffset, second.endOffset, "utf-8");
    expect(secondText).toContain("正文二");
    expect(secondText).toContain("第二章 继续");
  });

  it("deletes work rows and files, and keeps all triggers intact", async () => {
    const { databasePath, repository, store } = await prepare();

    const content = Buffer.from("第一章 只有一章\n", "utf8");
    const workId = `dw_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const saved = await store.saveSourceFile(workId, "one.txt", content);
    const created = await repository.createWorkWithChapters(
      {
        id: workId,
        name: "单章",
        kind: "text",
        sourceStorageKey: saved.storageKey,
        sourceSha256: saved.sha256,
        sourceBytes: saved.bytes,
        sourceEncoding: null,
      },
      [
        { workId, order: 1, title: "第一章 只有一章", groupLabel: "单章", startOffset: 0, endOffset: 7, charCount: 7, anomaliesJson: null },
      ],
    );

    const before = (await repository.listWorks()).length;
    expect(before).toBe(1);

    await store.deleteWorkFiles(workId);
    await repository.deleteWork(created.work.id);
    expect(await repository.listWorks()).toHaveLength(0);

    const database = new DatabaseSync(databasePath);
    try {
      const triggers = database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'").get() as { count: number | bigint };
      expect(Number(triggers.count)).toBeGreaterThanOrEqual(200);
      const chapters = database.prepare("SELECT COUNT(*) AS count FROM document_chapters").get() as { count: number | bigint };
      expect(Number(chapters.count)).toBe(0);
    } finally {
      database.close();
    }
  });

  it("lists stored document storage keys under the workspace documents root", async () => {
    const { store } = await prepare();
    const workId = `dw_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    await store.saveSourceFile(workId, "a.txt", Buffer.from("abc", "utf8"));
    await store.saveSourceFile(workId, "b.md", Buffer.from("def", "utf8"));
    const keys = await store.listStorageKeys();
    expect(keys.filter((key) => key.includes(workId))).toHaveLength(2);
  });
});
