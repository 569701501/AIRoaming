import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { buildComicFormatIssue } from "./migration-issue.js";
import { MigrationAuditService } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { SnapshotService } from "./snapshot.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const schemaPath = path.join(repoRoot, "apps/server/prisma/schema.prisma");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const SOURCE = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ENV_NAMES = ["AIROAMING_PERSISTENCE_MODE", "DATABASE_URL"] as const;

function issue(runId: string, projectId = "p1") {
  return buildComicFormatIssue({ runId, projectId, sourceStorageKey: `projects/${projectId}/project.json`, sourceDigest: SOURCE, mapping: { mappingKind: "decision_required", targetComicFormat: null, issueCode: "COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER", layoutPresetIntent: "four_panel", originalValueKind: "string", originalValuePreview: "four_panel" }, createdAt: "2026-07-12T00:00:00.000Z" })!;
}

async function deploy(databaseUrl: string): Promise<void> {
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
}

describe("G3-M3-A1 Prisma migration ledger", () => {
  let root: string | null = null;
  let prisma: PrismaService | null = null;
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]] as const));

  async function prepare() {
    root = await mkdtemp(path.join(os.tmpdir(), "airoaming-g3-ledger-"));
    const databasePath = path.join(root, "db.sqlite");
    const handle = await open(databasePath, "wx", 0o600);
    await handle.close();
    const databaseUrl = `file:${databasePath}`;
    await deploy(databaseUrl);
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.onModuleInit();
    return { root, databaseUrl, repository: new PrismaMigrationLedgerRepository(prisma) };
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

  it("RUN-DB-01 persists blocked audit issue and terminal run", async () => {
    const { repository } = await prepare();
    const run = await repository.beginRun({ id: "db-run-1", kind: "audit", importerVersion: "g3-m3-a1", sourceManifestDigest: SOURCE, startedAt: "2026-07-12T00:00:00.000Z" });
    await repository.recordIssue(issue(run.id));
    const finished = await repository.finishRun(run.id, { status: "blocked", finishedAt: "2026-07-12T00:01:00.000Z" });
    expect(finished.status).toBe("blocked");
    expect((await repository.listIssues(run.id))[0]).toMatchObject({ issueKey: "project:p1:comic-format", resolutionStatus: "open" });
    await expect(repository.recordIssue(issue(run.id, "p2"))).rejects.toThrow("MIGRATION_RUN_TERMINAL_IMMUTABLE");
  }, 30_000);

  it("RUN-DB-02 resolves a new run without mutating the old run", async () => {
    const { repository } = await prepare();
    await repository.beginRun({ id: "db-run-old", kind: "audit", importerVersion: "g3-m3-a1", sourceManifestDigest: SOURCE });
    await repository.recordIssue(issue("db-run-old"));
    await repository.finishRun("db-run-old", { status: "blocked" });
    await repository.beginRun({ id: "db-run-new", kind: "shadow", importerVersion: "g3-m3-a1", sourceManifestDigest: SOURCE });
    await repository.recordIssue(issue("db-run-new"));
    await repository.resolveIssue("db-run-new", "project:p1:comic-format", { decisionSchemaVersion: 1, action: "set_comic_format", chosenComicFormat: "paged_comic", layoutPresetIntent: "four_panel" });
    expect((await repository.finishRun("db-run-new", { status: "succeeded" })).status).toBe("succeeded");
    expect((await repository.getRun("db-run-old")).status).toBe("blocked");
    expect((await repository.listIssues("db-run-old"))[0].resolutionStatus).toBe("open");
  }, 30_000);

  it("RUN-DB-03 enforces source identity and database terminal immutability", async () => {
    const { repository } = await prepare();
    await repository.beginRun({ id: "db-run-source", kind: "shadow", importerVersion: "g3-m3-a1", sourceManifestDigest: SOURCE });
    const sourceKey = "workspace-v1:p1:Project:p1";
    const entityId = PrismaMigrationLedgerRepository.stableEntityId("Project", sourceKey);
    await repository.recordImportedEntitySource("db-run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: SOURCE, provenanceStatus: "reference_only" });
    expect((await repository.recordImportedEntitySource("db-run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: SOURCE, provenanceStatus: "partial" })).provenanceStatus).toBe("partial");
    expect((await repository.recordImportedEntitySource("db-run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: SOURCE, provenanceStatus: "complete" })).provenanceStatus).toBe("complete");
    await expect(repository.recordImportedEntitySource("db-run-source", { sourceKey, entityType: "Project", entityId, sourceDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })).rejects.toThrow("MIGRATION_SOURCE_CONFLICT");
    await repository.finishRun("db-run-source", { status: "succeeded" });
    const client = prisma!.database();
    await expect(client.migrationRun.update({ where: { id: "db-run-source" }, data: { importerVersion: "tampered" } })).rejects.toThrow();
    await expect(client.migrationRun.delete({ where: { id: "db-run-source" } })).rejects.toThrow();
  }, 30_000);

  it("AUDIT-DB-01 writes the sealed snapshot audit into Prisma", async () => {
    const { root: databaseRoot, repository } = await prepare();
    const workspace = path.join(databaseRoot!, "workspace");
    const staging = path.join(databaseRoot!, "staging");
    await mkdir(path.join(workspace, "projects", "p1"), { recursive: true });
    await writeFile(path.join(workspace, "projects", "p1", "project.json"), '{"id":"p1","comicFormat":"four_panel"}\n');
    await mkdir(staging);
    const coordinator = new MaintenanceCoordinator();
    await coordinator.drain();
    await coordinator.close();
    const bundlePath = path.join(databaseRoot!, "runtime-bundle.json");
    await new RuntimeBundleFileService().writeAtomic(bundlePath, await coordinator.createRuntimeBundle());
    const snapshot = await new SnapshotService().createSnapshot({ workspaceRoot: workspace, stagingRoot: staging, runtimeBundle: bundlePath });
    const result = await new MigrationAuditService().auditComicFormats(snapshot.outputPath, repository, { runId: "db-audit-1", startedAt: "2026-07-12T00:00:00.000Z" });
    expect(result.run.status).toBe("blocked");
    expect(result.report.summary.unresolvedBlockerCount).toBe(1);
    expect((await repository.getRun("db-audit-1")).reportDigest).toBe(result.report.reportDigest);
    const row = await prisma!.database().migrationIssue.findUniqueOrThrow({ where: { runId_issueKey: { runId: "db-audit-1", issueKey: "project:p1:comic-format" } } });
    expect(row.storageKey).toBe("projects/p1/project.json");
    expect(row.entityId).toBe("p1");
    expect(await readFile(path.join(snapshot.outputPath, "SEALED"), "utf8")).toContain("airoaming_snapshot_sealed_v1");
  }, 30_000);
});
