import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { AppBackupService } from "../backup/app-backup.service.js";
import { AppRestoreService } from "../backup/app-restore.service.js";
import { CutoverCoordinator } from "./cutover-coordinator.service.js";
import { DbActivateService } from "./db-activate.service.js";
import { createMigrationDecisionArtifact } from "./migration-decision.js";
import { MetadataArchiveService } from "./metadata-archive.service.js";
import { FinalImportOrchestrator } from "./final-importer.js";
import { ReadyCoordinator } from "./ready-coordinator.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { SnapshotService } from "./snapshot.service.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { getBlockedDbCapabilities } from "./db-capability-registry.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const schemaPath = path.join(repoRoot, "apps/server/prisma/schema.prisma");

async function deploy(databaseUrl: string): Promise<void> {
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

describe("M6 isolated C0-C7 rehearsal", () => {
  it("M6A1-C0-C7 / M6A1-CHAIN-01 / M6A1-RDY-01 / M6A1-RDY-02 runs real final import, closed ready, backup, API smoke, activation and first write on isolated SQLite", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-m6-c0-c7-real-"));
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      AIROAMING_PERSISTENCE_MODE: process.env.AIROAMING_PERSISTENCE_MODE,
      AIROAMING_SECRET_STORE_ADAPTER: process.env.AIROAMING_SECRET_STORE_ADAPTER,
      AIROAMING_FAKE_SECRET_STORE_ROOT: process.env.AIROAMING_FAKE_SECRET_STORE_ROOT,
      AIROAMING_TASK_WORKER_ENABLED: process.env.AIROAMING_TASK_WORKER_ENABLED,
    };
    let prisma: PrismaService | undefined;
    let app: any = null;
    try {
      const sourceWorkspace = path.join(root, "source-workspace");
      const snapshotStaging = path.join(root, "snapshot-staging");
      const dataRoot = path.join(root, "target-data");
      const targetWorkspace = path.join(root, "target-workspace");
      const secretStoreRoot = path.join(root, "fake-secret-store");
      const backupOutput = path.join(root, "backup-output");
      const restoreRoot = path.join(root, "restore");
      const archiveRoot = path.join(root, "metadata-archive");
      const evidenceRoot = path.join(root, "cutover-evidence");
      const databasePath = path.join(dataRoot, "db", "airoaming.sqlite");
      const databaseUrl = `file:${databasePath}`;
      await mkdir(path.join(sourceWorkspace, "projects", "p1", "chapters", "chapter-001"), { recursive: true });
      await mkdir(path.join(sourceWorkspace, "projects", "p1", "assets"), { recursive: true });
      await mkdir(path.join(dataRoot, "db"), { recursive: true });
      await mkdir(targetWorkspace, { recursive: true });
      await mkdir(secretStoreRoot, { recursive: true });
      await mkdir(backupOutput, { recursive: true });
      await mkdir(restoreRoot, { recursive: true });
      await open(databasePath, "wx", 0o600).then((handle) => handle.close());
      await writeFile(path.join(sourceWorkspace, "projects/p1/project.json"), `${JSON.stringify({ id: "p1", name: "隔离验收项目", type: "comic", comicFormat: "vertical_scroll", genreTags: ["fantasy"], storyTitle: "隔离验收", artStyle: "ink", description: "M6 A1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" })}\n`);
      await writeFile(path.join(sourceWorkspace, "projects/p1/chapters/chapter-001/chapter.json"), `${JSON.stringify({ id: "p1-chapter-001", order: 1, title: "第一章", status: "draft", summary: "隔离验收", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" })}\n`);
      await writeFile(path.join(sourceWorkspace, "projects/p1/chapters/chapter-001/script.md"), "夜色落下。\n");
      await writeFile(path.join(sourceWorkspace, "projects/p1/assets/asset.bin"), Buffer.from("asset-bytes"), { mode: 0o600 });

      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      process.env.DATABASE_URL = databaseUrl;
      process.env.AIROAMING_SECRET_STORE_ADAPTER = "fake";
      process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = secretStoreRoot;
      process.env.AIROAMING_TASK_WORKER_ENABLED = "false";

      const maintenance = new MaintenanceCoordinator();
      await maintenance.drain();
      await maintenance.close();
      const maintenanceBundle = path.join(root, "runtime-bundle.json");
      await new RuntimeBundleFileService().writeAtomic(maintenanceBundle, await maintenance.createRuntimeBundle());
      const beforeSnapshot = await stat(path.join(sourceWorkspace, "projects/p1/project.json"));
      const snapshot = await new SnapshotService().createSnapshot({ workspaceRoot: sourceWorkspace, stagingRoot: snapshotStaging, runtimeBundle: maintenanceBundle });
      const afterSnapshot = await stat(path.join(sourceWorkspace, "projects/p1/project.json"));
      const decisionsPath = path.join(root, "decisions.json");
      await writeFile(decisionsPath, `${JSON.stringify(createMigrationDecisionArtifact(snapshot.sourceManifest.manifestDigest, []))}\n`, { mode: 0o600 });
      const release = await loadReleaseSchemaIdentityV1(repoRoot);
      const runId = "m6-a1-real-c0-c7";
      const coordinator = new CutoverCoordinator(maintenance, { evidenceRoot, identity: { runId, sourceManifestDigest: snapshot.sourceManifest.manifestDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest } });

      await coordinator.runStep("C0", async () => {
        expect(getBlockedDbCapabilities()).toEqual([]);
        expect(release.effectiveSchemaManifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(path.resolve(sourceWorkspace)).not.toBe(path.resolve(dataRoot));
        return "release-gates-and-isolated-roots-passed";
      });
      await coordinator.runStep("C1", async () => {
        const runtime = await new RuntimeBundleFileService().readAndVerify(maintenanceBundle);
        expect(runtime.bundle.maintenanceState).toBe("closed");
        expect(runtime.bundle.activeMutations).toBe(0);
        expect(runtime.bundle.activeStreams).toBe(0);
        return "maintenance-closed-runtime-bundle-sealed";
      });
      await coordinator.runStep("C2", async () => {
        expect(snapshot.sourceManifest.items.length).toBeGreaterThan(0);
        expect(afterSnapshot.mtimeMs).toBe(beforeSnapshot.mtimeMs);
        return "real-snapshot-source-unchanged";
      });
      await coordinator.runStep("C3", async () => {
        await deploy(databaseUrl);
        prisma = new PrismaService();
        await prisma.onModuleInit();
        expect(await prisma.database().$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name='persistence_states'")).toHaveLength(1);
        expect(databaseUrl).not.toContain(path.resolve(sourceWorkspace));
        return "fresh-migrated-temp-sqlite-and-fake-secret-store";
      });
      await coordinator.runStep("C4", async () => {
        const finalResult = await new FinalImportOrchestrator(prisma!).import({ snapshotPath: snapshot.outputPath, decisionsPath, databaseUrl, workspaceRoot: targetWorkspace, dataRoot, releaseRoot: repoRoot, secretStoreRoot, runId });
        expect(finalResult.run.status).toBe("succeeded");
        expect(finalResult.report.slices).toHaveLength(16);
        await expect(new ReadyCoordinator(prisma!).markReady({ runId, releaseRoot: repoRoot, workspaceRoot: targetWorkspace, secretStoreRoot, maintenanceBundle: path.join(root, "missing-runtime-bundle.json") })).rejects.toMatchObject({ code: "MIGRATION_MAINTENANCE_BUNDLE_INVALID" });
        const ready = await new ReadyCoordinator(prisma!).markReady({ runId, releaseRoot: repoRoot, workspaceRoot: targetWorkspace, secretStoreRoot, maintenanceBundle });
        expect(ready.activationState).toBe("ready_for_activation");
        const backup = await new AppBackupService(prisma!).backup({ databaseUrl, workspaceRoot: sourceWorkspace, dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle, decisions: decisionsPath, output: backupOutput, kind: "pre-cutover", runId });
        const restore = await new AppRestoreService().restore({ backup: backup.bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(restoreRoot, "data"), targetWorkspaceRoot: path.join(restoreRoot, "workspace"), mode: "verify-only" });
        expect(restore.mode).toBe("verify-only");
        return JSON.stringify({ final: finalResult.report.reportDigest, backup: backup.bundleDigest, restore: restore.bundleDigest });
      });
      await coordinator.runStep("C5", async () => {
        app = await NestFactory.create(AppModule, { logger: false });
        app.setGlobalPrefix("api");
        await app.listen(0, "127.0.0.1");
        const address = app.getHttpServer().address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/api/projects`);
        expect(response.status).toBe(200);
        const body = await response.json() as { success: boolean; data: { items: Array<{ id: string }> } };
        expect(body).toMatchObject({ success: true, data: { items: [{ id: expect.stringMatching(/^project_/) }] } });
        await expect(prisma!.runBusinessTransaction(async () => "must-not-run")).rejects.toThrow("DB_PERSISTENCE_NOT_ACTIVE");
        expect((await prisma!.database().persistenceState.findUnique({ where: { id: "primary" } }))?.firstBusinessWriteAt).toBeNull();
        return "real-api-read-and-closed-write-rollback-smoke";
      });
      await coordinator.runStep("C6", async () => {
        const result = await new MetadataArchiveService().archive({ workspaceRoot: sourceWorkspace, archiveRoot, marker: runId });
        expect(result.assetPathCount).toBe(1);
        await expect(readFile(path.join(archiveRoot, "projects/p1/assets/asset.bin"))).rejects.toThrow();
        return "metadata-only-archive-retains-asset-path-not-bytes";
      });
      await coordinator.runStep("C7", async () => {
        const backupEntries = await readdir(backupOutput);
        const backup = path.join(backupOutput, backupEntries.find((entry) => entry.startsWith("backup-"))!);
        const activate = new DbActivateService(prisma!);
        await expect(activate.activate({ runId, sourceManifestDigest: snapshot.sourceManifest.manifestDigest, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup, gate: "ACT-08", mode: "dry-run" })).resolves.toMatchObject({ activationState: "ready_for_activation", firstBusinessWriteAt: null });
        await expect(activate.activate({ runId, sourceManifestDigest: snapshot.sourceManifest.manifestDigest, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup, gate: "ACT-08", mode: "execute" })).resolves.toMatchObject({ activationState: "db_only", firstBusinessWriteAt: null });
        const project = await prisma!.database().project.findFirstOrThrow();
        await prisma!.runBusinessTransaction(async (tx) => {
          await tx.project.update({ where: { id: project.id }, data: { description: "first business write" } });
        });
        const state = await prisma!.database().persistenceState.findUnique({ where: { id: "primary" } });
        expect(state?.activationState).toBe("db_only");
        expect(state?.firstBusinessWriteAt).toBeInstanceOf(Date);
        return "activate-execute-and-first-business-write-recorded";
      });

      expect(coordinator.status()).toHaveLength(8);
      expect(coordinator.status().every((item) => item.status === "passed")).toBe(true);
      const persistedEvidence = JSON.parse(await readFile(path.join(evidenceRoot, "cutover-evidence.json"), "utf8")) as { steps: unknown[]; evidenceDigest: string };
      expect(persistedEvidence.steps).toHaveLength(8);
      expect(persistedEvidence.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    } finally {
      await app?.close();
      if (prisma) await prisma.onModuleDestroy();
      if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.DATABASE_URL;
      if (previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previous.AIROAMING_PERSISTENCE_MODE;
      if (previous.AIROAMING_SECRET_STORE_ADAPTER === undefined) delete process.env.AIROAMING_SECRET_STORE_ADAPTER; else process.env.AIROAMING_SECRET_STORE_ADAPTER = previous.AIROAMING_SECRET_STORE_ADAPTER;
      if (previous.AIROAMING_FAKE_SECRET_STORE_ROOT === undefined) delete process.env.AIROAMING_FAKE_SECRET_STORE_ROOT; else process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = previous.AIROAMING_FAKE_SECRET_STORE_ROOT;
      if (previous.AIROAMING_TASK_WORKER_ENABLED === undefined) delete process.env.AIROAMING_TASK_WORKER_ENABLED; else process.env.AIROAMING_TASK_WORKER_ENABLED = previous.AIROAMING_TASK_WORKER_ENABLED;
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
