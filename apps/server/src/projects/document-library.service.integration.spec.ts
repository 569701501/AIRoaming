import { randomUUID } from "node:crypto";
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
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { DocumentLibraryRepository } from "./document-library.repository.js";
import { DocumentLibraryStore } from "./document-library.store.js";
import { DocumentLibraryService } from "./document-library.service.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FORMAL_SCHEMA_PATH = path.join(REPO_ROOT, "apps/server/prisma/schema.prisma");
const FIXTURES_ROOT = path.join(REPO_ROOT, "tests/fixtures/document-library");

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

describe("DocumentLibrary service", () => {
  let testRoot: string | null = null;
  let markerPath: string | null = null;
  const previousEnvironment = new Map(
    ENVIRONMENT_NAMES.map((name) => [name, process.env[name]] as const),
  );

  async function prepare(): Promise<{ service: DocumentLibraryService }> {
    const runId = `document-service-${randomUUID()}`;
    testRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), `${runId}-`)));
    markerPath = path.join(testRoot, ".airoaming-test-root");
    await writeFile(
      markerPath,
      `${JSON.stringify({ schemaVersion: 1, owner: "document-service", runId, root: testRoot })}\n`,
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

    const { PrismaService } = await import("../persistence/prisma.service.js");
    const prismaService = new PrismaService();
    await prismaService.onModuleInit();
    const workspacePathService = new WorkspacePathService();
    await workspacePathService.ensureReady();
    const repository = new DocumentLibraryRepository(prismaService);
    const store = new DocumentLibraryStore(workspacePathService);
    const service = new DocumentLibraryService(repository, store);
    return { service };
  }

  afterEach(async () => {
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (testRoot && markerPath) {
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as { owner: string; root: string };
      expect(marker).toMatchObject({ owner: "document-service", root: testRoot });
      await rm(testRoot, { recursive: true, force: false });
    }
    testRoot = null;
    markerPath = null;
  });

  it("imports a GBK novel head, splits chapters, and serves chapter text", async () => {
    const { service } = await prepare();
    const buffer = await readFile(path.join(FIXTURES_ROOT, "renfan-1-head-gbk.bin"));

    const result = await service.importSource("凡人修仙传.txt", buffer);
    expect(result.encoding).toBe("gb18030");
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.chapters[0]!.title).toContain("第一章");
    expect(result.work.name).toBe("凡人修仙传");
    expect(result.work.chapterCount).toBe(result.chapters.length);

    const detail = await service.getDetail(result.work.id);
    expect(detail?.work.id).toBe(result.work.id);
    expect(detail?.groups.length).toBeGreaterThanOrEqual(1);
    const firstChapterId = detail!.chapters[0]!.id;
    const chapterText = await service.readChapterText(result.work.id, firstChapterId);
    expect(chapterText).toContain("第一章");

    const renamed = await service.rename(result.work.id, "修仙传改名");
    expect(renamed.name).toBe("修仙传改名");
    expect(renamed.chapterCount).toBe(result.chapters.length);

    const list = await service.list();
    expect(list).toHaveLength(1);
  });

  it("imports a UTF-8 novel head and detects utf-8", async () => {
    const { service } = await prepare();
    const buffer = await readFile(path.join(FIXTURES_ROOT, "renfan-2-head-utf8.txt"));
    const result = await service.importSource("第二部.md", buffer);
    expect(result.encoding).toBe("utf-8");
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.work.name).toBe("第二部");
  });

  it("rejects unsupported formats and oversized files", async () => {
    const { service } = await prepare();
    await expect(service.importSource("script.pdf", Buffer.from("x"))).rejects.toThrow(
      "DOCUMENT_FORMAT_UNSUPPORTED",
    );
    await expect(service.importSource("empty.txt", Buffer.alloc(0))).rejects.toThrow(
      "DOCUMENT_EMPTY",
    );
  });

  it("removes a document work and its files", async () => {
    const { service } = await prepare();
    const buffer = Buffer.from("第一章 开始\n正文", "utf8");
    const created = await service.importSource("novel.txt", buffer);
    expect(created.chapters.length).toBe(1);

    await service.remove(created.work.id);
    expect(await service.list()).toHaveLength(0);
    expect(await service.getDetail(created.work.id)).toBeNull();
  });
});
