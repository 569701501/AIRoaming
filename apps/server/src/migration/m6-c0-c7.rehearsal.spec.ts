import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import { digestCanonicalJson } from "@airoaming/shared";
import { AppModule } from "../app.module.js";
import { AppBackupService } from "../backup/app-backup.service.js";
import { AppRestoreService } from "../backup/app-restore.service.js";
import { CutoverEvidenceStore, type CutoverEvidenceStep } from "./cutover-evidence.service.js";
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
  it("M6A1-C0-C7 / M6A1-CHAIN-01 / M6A1-RDY-01 / M6A1-RDY-02 / M6A1-ACT-05 / M6A1-RB-02 runs real final import, restore, closed ready, API smoke and first write on isolated SQLite", async () => {
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
    let materializedDataRoot: string | undefined;
    let materializedWorkspaceRoot: string | undefined;
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
      const decisions = createMigrationDecisionArtifact(snapshot.sourceManifest.manifestDigest, []);
      await writeFile(decisionsPath, `${JSON.stringify(decisions)}\n`, { mode: 0o600 });
      const release = await loadReleaseSchemaIdentityV1(repoRoot);
      const runId = "m6-a1-real-c0-c7";
      const evidenceStore = new CutoverEvidenceStore(evidenceRoot, {
        cutoverId: "m6-a1-real-c0-c7",
        appCommit: "a".repeat(40),
        planDigest: digestCanonicalJson({ runId, sourceManifestDigest: snapshot.sourceManifest.manifestDigest }) as `sha256:${string}`,
        runId,
        effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
      });
      const runStep = async (
        step: CutoverEvidenceStep,
        action: () => Promise<string | { summaryCode: string; completion: { activatedAt: string; firstBusinessWriteAt: null } }>,
        artifactDigests: Record<string, `sha256:${string}`> = {},
      ) => evidenceStore.runStep(
        step,
        digestCanonicalJson({ runId, step }) as `sha256:${string}`,
        async () => {
          const result = await action();
          return typeof result === "string"
            ? { summaryCode: result, artifactDigests }
            : { ...result, artifactDigests };
        },
      );

      await runStep("C0", async () => {
        expect(getBlockedDbCapabilities()).toEqual([]);
        expect(release.effectiveSchemaManifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(path.resolve(sourceWorkspace)).not.toBe(path.resolve(dataRoot));
        return "release-gates-and-isolated-roots-passed";
      });
      await runStep("C1", async () => {
        const runtime = await new RuntimeBundleFileService().readAndVerify(maintenanceBundle);
        expect(runtime.bundle.maintenanceState).toBe("closed");
        expect(runtime.bundle.activeMutations).toBe(0);
        expect(runtime.bundle.activeStreams).toBe(0);
        return "maintenance-closed-runtime-bundle-sealed";
      });
      await runStep("C2", async () => {
        expect(snapshot.sourceManifest.items.length).toBeGreaterThan(0);
        expect(afterSnapshot.mtimeMs).toBe(beforeSnapshot.mtimeMs);
        return "real-snapshot-source-unchanged";
      }, {
        sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
        snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      });
      await runStep("C3", async () => {
        await deploy(databaseUrl);
        prisma = new PrismaService();
        await prisma.onModuleInit();
        expect(await prisma.database().$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name='persistence_states'")).toHaveLength(1);
        expect(databaseUrl).not.toContain(path.resolve(sourceWorkspace));
        return "fresh-migrated-temp-sqlite-and-fake-secret-store";
      });
      await runStep("C4", async () => {
        const finalResult = await new FinalImportOrchestrator(prisma!).import({ snapshotPath: snapshot.outputPath, decisionsPath, databaseUrl, workspaceRoot: targetWorkspace, dataRoot, releaseRoot: repoRoot, secretStoreRoot, runId });
        expect(finalResult.run.status).toBe("succeeded");
        expect(finalResult.report.slices).toHaveLength(16);
        await expect(new ReadyCoordinator(prisma!).markReady({ runId, releaseRoot: repoRoot, workspaceRoot: targetWorkspace, secretStoreRoot, maintenanceBundle: path.join(root, "missing-runtime-bundle.json") })).rejects.toMatchObject({ code: "MIGRATION_MAINTENANCE_BUNDLE_INVALID" });
        const ready = await new ReadyCoordinator(prisma!).markReady({ runId, releaseRoot: repoRoot, workspaceRoot: targetWorkspace, secretStoreRoot, maintenanceBundle });
        expect(ready.activationState).toBe("ready_for_activation");
        const backup = await new AppBackupService(prisma!).backup({ databaseUrl, workspaceRoot: sourceWorkspace, dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle, decisions: decisionsPath, output: backupOutput, kind: "pre-cutover", runId });
        const restore = await new AppRestoreService().restore({ backup: backup.bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(restoreRoot, "data"), targetWorkspaceRoot: path.join(restoreRoot, "workspace"), mode: "verify-only" });
        expect(restore.mode).toBe("verify-only");
        materializedDataRoot = path.join(restoreRoot, "materialized-data");
        materializedWorkspaceRoot = path.join(restoreRoot, "materialized-workspace");
        await expect(new AppRestoreService().restore({ backup: backup.bundlePath, releaseRoot: repoRoot, targetDataRoot: materializedDataRoot, targetWorkspaceRoot: materializedWorkspaceRoot, mode: "materialize" })).resolves.toMatchObject({ mode: "materialize" });
        return JSON.stringify({ final: finalResult.report.reportDigest, backup: backup.bundleDigest, restore: restore.bundleDigest });
      }, { decisionsDigest: decisions.decisionsDigest });
      await runStep("C5", async () => {
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
        const failedSmoke = await fetch(`http://127.0.0.1:${address.port}/api/m6-c5-smoke-failure`);
        expect(failedSmoke.status).toBe(404);
        expect(materializedDataRoot && materializedWorkspaceRoot).toBeTruthy();
        expect(await stat(path.join(materializedDataRoot!, "db/airoaming.sqlite"))).toBeTruthy();
        expect(await stat(materializedWorkspaceRoot!)).toBeTruthy();
        return "real-api-read-and-closed-write-rollback-smoke";
      });
      await runStep("C6", async () => {
        const result = await new MetadataArchiveService().archive({ workspaceRoot: sourceWorkspace, archiveRoot, marker: runId });
        expect(result.assetPathCount).toBe(1);
        await expect(readFile(path.join(archiveRoot, "projects/p1/assets/asset.bin"))).rejects.toThrow();
        return "metadata-only-archive-retains-asset-path-not-bytes";
      });
      await runStep("C7", async () => {
        const backupEntries = await readdir(backupOutput);
        const backup = path.join(backupOutput, backupEntries.find((entry) => entry.startsWith("backup-"))!);
        const activate = new DbActivateService(prisma!);
        await expect(activate.activate({ runId, sourceManifestDigest: snapshot.sourceManifest.manifestDigest, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup, gate: "ACT-08", mode: "dry-run" })).resolves.toMatchObject({ activationState: "ready_for_activation", firstBusinessWriteAt: null });
        const activated = await activate.activate({ runId, sourceManifestDigest: snapshot.sourceManifest.manifestDigest, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup, gate: "ACT-08", mode: "execute" });
        expect(activated).toMatchObject({ activationState: "db_only", firstBusinessWriteAt: null });
        if (!activated.activatedAt) throw new Error("M6_C7_ACTIVATED_AT_MISSING");
        return {
          summaryCode: "activate-execute-before-first-business-write",
          completion: { activatedAt: activated.activatedAt, firstBusinessWriteAt: null },
        };
      });
      expect(await stat(path.join(evidenceRoot, "COMPLETED"))).toBeTruthy();
      const project = await prisma!.database().project.findFirstOrThrow();
      await prisma!.runBusinessTransaction(async (tx) => {
        await tx.project.update({ where: { id: project.id }, data: { description: "first business write" } });
      });
      const state = await prisma!.database().persistenceState.findUnique({ where: { id: "primary" } });
      expect(state?.activationState).toBe("db_only");
      expect(state?.firstBusinessWriteAt).toBeInstanceOf(Date);

      const verifiedEvidence = await evidenceStore.readVerified();
      expect(verifiedEvidence.steps).toHaveLength(8);
      expect(verifiedEvidence.steps.every((item) => item.status === "passed")).toBe(true);
      const persistedEvidence = JSON.parse(await readFile(path.join(evidenceRoot, "cutover-evidence.json"), "utf8")) as { stepDigests: unknown[]; evidenceDigest: string };
      expect(persistedEvidence.stepDigests).toHaveLength(8);
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

  it("M6A1-RB-01 rejects a tampered final snapshot without changing the source or creating a ready state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-m6-rb-01-"));
    const previous = { DATABASE_URL: process.env.DATABASE_URL, AIROAMING_PERSISTENCE_MODE: process.env.AIROAMING_PERSISTENCE_MODE, AIROAMING_SECRET_STORE_ADAPTER: process.env.AIROAMING_SECRET_STORE_ADAPTER, AIROAMING_FAKE_SECRET_STORE_ROOT: process.env.AIROAMING_FAKE_SECRET_STORE_ROOT };
    let prisma: PrismaService | undefined;
    try {
      const sourceWorkspace = path.join(root, "source-workspace");
      const snapshotStaging = path.join(root, "snapshot-staging");
      const dataRoot = path.join(root, "target-data");
      const targetWorkspace = path.join(root, "target-workspace");
      const secretStoreRoot = path.join(root, "fake-secret-store");
      const databasePath = path.join(dataRoot, "db", "airoaming.sqlite");
      const databaseUrl = `file:${databasePath}`;
      await mkdir(path.join(sourceWorkspace, "projects", "p1"), { recursive: true });
      await mkdir(path.join(dataRoot, "db"), { recursive: true });
      await mkdir(targetWorkspace, { recursive: true });
      await mkdir(secretStoreRoot, { recursive: true });
      await open(databasePath, "wx", 0o600).then((handle) => handle.close());
      const sourceProject = path.join(sourceWorkspace, "projects/p1/project.json");
      await writeFile(sourceProject, `${JSON.stringify({ id: "p1", name: "rollback fixture", type: "comic", comicFormat: "vertical_scroll", genreTags: [] })}\n`, { mode: 0o600 });
      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      process.env.DATABASE_URL = databaseUrl;
      process.env.AIROAMING_SECRET_STORE_ADAPTER = "fake";
      process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = secretStoreRoot;
      const maintenance = new MaintenanceCoordinator();
      await maintenance.drain();
      await maintenance.close();
      const maintenanceBundle = path.join(root, "runtime-bundle.json");
      await new RuntimeBundleFileService().writeAtomic(maintenanceBundle, await maintenance.createRuntimeBundle());
      const snapshot = await new SnapshotService().createSnapshot({ workspaceRoot: sourceWorkspace, stagingRoot: snapshotStaging, runtimeBundle: maintenanceBundle });
      const decisionsPath = path.join(root, "decisions.json");
      await writeFile(decisionsPath, `${JSON.stringify(createMigrationDecisionArtifact(snapshot.sourceManifest.manifestDigest, []))}\n`, { mode: 0o600 });
      await deploy(databaseUrl);
      prisma = new PrismaService();
      await prisma.onModuleInit();
      const tamperedSnapshot = path.join(root, "tampered-snapshot");
      await cp(snapshot.outputPath, tamperedSnapshot, { recursive: true });
      await writeFile(path.join(tamperedSnapshot, "SEALED"), "tampered\n", { mode: 0o600 });
      const before = await readFile(sourceProject);
      await expect(new FinalImportOrchestrator(prisma).import({ snapshotPath: tamperedSnapshot, decisionsPath, databaseUrl, workspaceRoot: targetWorkspace, dataRoot, releaseRoot: repoRoot, secretStoreRoot, runId: "m6-rb-01-final" })).rejects.toThrow();
      expect(await readFile(sourceProject)).toEqual(before);
      expect(await prisma.database().migrationRun.count()).toBe(0);
      expect(await prisma.database().persistenceState.findUnique({ where: { id: "primary" } })).toBeNull();
    } finally {
      if (prisma) await prisma.onModuleDestroy();
      if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.DATABASE_URL;
      if (previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previous.AIROAMING_PERSISTENCE_MODE;
      if (previous.AIROAMING_SECRET_STORE_ADAPTER === undefined) delete process.env.AIROAMING_SECRET_STORE_ADAPTER; else process.env.AIROAMING_SECRET_STORE_ADAPTER = previous.AIROAMING_SECRET_STORE_ADAPTER;
      if (previous.AIROAMING_FAKE_SECRET_STORE_ROOT === undefined) delete process.env.AIROAMING_FAKE_SECRET_STORE_ROOT; else process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = previous.AIROAMING_FAKE_SECRET_STORE_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
