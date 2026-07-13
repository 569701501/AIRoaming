import "reflect-metadata";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { afterEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { Prisma } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { AppModule } from "../app.module.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { RuntimeBundleFileService } from "../migration/runtime-bundle-file.service.js";
import { createMigrationDecisionArtifact } from "../migration/migration-decision.js";
import { createComicFormatReport } from "../migration/migration-report.js";
import { createFinalImportReport } from "../migration/final-import-report.js";
import { FULL_SHADOW_SLICE_ORDER } from "../migration/full-shadow-importer.js";
import type { SnapshotDigest } from "../migration/snapshot.types.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { AppBackupService } from "./app-backup.service.js";
import { AppRestoreService } from "./app-restore.service.js";
import { DbActivateService } from "../migration/db-activate.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const serverRoot = path.join(repoRoot, "apps/server");
const backupCli = path.join(serverRoot, "src/backup/app-backup.cli.ts");
const restoreCli = path.join(serverRoot, "src/backup/app-restore.cli.ts");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { readonly DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void } };
const roots: string[] = [];
const SOURCE_DIGEST = ("sha256:" + "1".repeat(64)) as SnapshotDigest;
const SNAPSHOT_DIGEST = ("sha256:" + "2".repeat(64)) as SnapshotDigest;

async function runCli(cliPath: string, ...args: string[]) {
  try {
    const result = await execFileAsync(process.execPath, ["--import", "tsx", cliPath, ...args], { cwd: serverRoot, env: { ...process.env, AIROAMING_PERSISTENCE_MODE: "db" } });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string };
    return { code: result.code ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }
}

async function recomputeBundleSeal(bundlePath: string): Promise<string> {
  const manifestPath = path.join(bundlePath, "backup-manifest.json");
  const summaryPath = path.join(bundlePath, "migration/run-summary.json");
  const sealedPath = path.join(bundlePath, "SEALED");
  const settingsPath = path.join(bundlePath, "config/settings.redacted.json");
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<string, unknown>;
  const { runSummaryDigest: _runSummaryDigest, ...summaryBase } = summary;
  summary.runSummaryDigest = digestCanonicalJson(summaryBase);
  await writeFile(summaryPath, JSON.stringify(summary) + "\n", { mode: 0o600 });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, any>;
  const databaseBytes = await readFile(path.join(bundlePath, "database/app.db"));
  manifest.database = { ...manifest.database, bytes: databaseBytes.byteLength, sha256: `sha256:${createHash("sha256").update(databaseBytes).digest("hex")}` };
  manifest.migration.runSummaryDigest = summary.runSummaryDigest;
  const { bundleDigest: _bundleDigest, ...manifestBase } = manifest;
  manifest.bundleDigest = digestCanonicalJson(manifestBase);
  await writeFile(manifestPath, JSON.stringify(manifest) + "\n", { mode: 0o600 });
  const sealed = JSON.parse(await readFile(sealedPath, "utf8")) as Record<string, unknown>;
  sealed.bundleDigest = manifest.bundleDigest;
  sealed.manifestDigest = digestCanonicalJson(manifest);
  sealed.databaseDigest = manifest.database.sha256;
  sealed.assetInventoryDigest = digestCanonicalJson(manifest.assets);
  sealed.runSummaryDigest = summary.runSummaryDigest;
  sealed.configDigest = digestCanonicalJson(JSON.parse(await readFile(settingsPath, "utf8")));
  await writeFile(sealedPath, JSON.stringify(sealed) + "\n", { mode: 0o600 });
  const nextPath = path.join(path.dirname(bundlePath), "backup-" + manifest.bundleDigest);
  await rename(bundlePath, nextPath);
  return nextPath;
}

async function copyReleaseFixture(root: string): Promise<string> {
  const releaseRoot = path.join(root, "release-fixture");
  await mkdir(path.join(releaseRoot, "apps/server/prisma"), { recursive: true });
  await cp(path.join(repoRoot, "apps/server/prisma/schema.prisma"), path.join(releaseRoot, "apps/server/prisma/schema.prisma"));
  await cp(path.join(repoRoot, "apps/server/prisma/migrations"), path.join(releaseRoot, "apps/server/prisma/migrations"), { recursive: true });
  return releaseRoot;
}

function mutateBundleDatabase(bundlePath: string, sql: string): void {
  const database = new DatabaseSync(path.join(bundlePath, "database/app.db"));
  try { database.exec(sql); } finally { database.close(); }
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-backup-"));
  roots.push(root);
  const workspaceRoot = path.join(root, "workspace");
  const dataRoot = path.join(root, "data");
  const outputRoot = path.join(root, "output");
  const dbDir = path.join(dataRoot, "db");
  await mkdir(path.join(workspaceRoot, "projects", "p1", "assets"), { recursive: true });
  await mkdir(dbDir, { recursive: true });
  await mkdir(outputRoot);
  const databaseUrl = "file:" + path.join(dbDir, "airoaming.sqlite");
  const databaseHandle = await open(path.join(dbDir, "airoaming.sqlite"), "wx", 0o600);
  await databaseHandle.close();
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", path.join(repoRoot, "apps/server/prisma/schema.prisma")], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
  const previous = { DATABASE_URL: process.env.DATABASE_URL, AIROAMING_PERSISTENCE_MODE: process.env.AIROAMING_PERSISTENCE_MODE };
  process.env.DATABASE_URL = databaseUrl;
  process.env.AIROAMING_PERSISTENCE_MODE = "db";
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const db = prisma.database();
  await db.persistenceState.create({ data: { id: "primary" } });
  await db.project.create({ data: { id: "p1", name: "Backup fixture", genreTags: [], comicFormat: "vertical_scroll" } });
  await db.chapter.create({ data: { id: "chapter-1", projectId: "p1", slug: "chapter-001", order: 1, title: "第一章", scriptWorkingDigest: digestCanonicalJson("") } });
  await db.project.update({ where: { id: "p1" }, data: { currentChapterId: "chapter-1" } });
  if (await db.project.count() !== 1 || await db.chapter.count() !== 1) throw new Error("BACKUP_FIXTURE_SCOPE_MISSING");
  const assetBytes = Buffer.from("fixture-image");
  const assetPath = path.join(workspaceRoot, "projects/p1/assets/one.txt");
  await writeFile(assetPath, assetBytes, { mode: 0o600 });
  const assetDigest = (`sha256:${createHash("sha256").update(assetBytes).digest("hex")}`) as SnapshotDigest;
  await db.asset.create({ data: { id: "asset-1", projectId: "p1", chapterId: "chapter-1", type: "image", role: "candidate", mimeType: "text/plain", storageKey: "projects/p1/assets/one.txt", status: "staged", sourceTaskId: null, metadataJson: {}, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson({}) } });
  await db.asset.update({ where: { id: "asset-1" }, data: { status: "ready", sha256: assetDigest, bytes: assetBytes.byteLength, width: 1, height: 1, readyAt: new Date("2026-07-13T00:00:00.000Z") } });
  const report = createComicFormatReport([]);
  const decisions = createMigrationDecisionArtifact(SOURCE_DIGEST, []);
  const slices = FULL_SHADOW_SLICE_ORDER.map((slice, index) => ({ slice, runId: "full-fixture-" + String(index + 1).padStart(2, "0"), status: "succeeded" as const, reportDigest: report.reportDigest, counts: report.summary, report }));
  for (let index = 0; index < slices.length; index += 1) {
    await db.migrationRun.create({ data: { id: slices[index].runId, kind: "shadow", status: "running", importerVersion: "g3-m3-a" + String(index + 2), sourceManifestDigest: SOURCE_DIGEST, startedAt: new Date("2026-07-13T00:00:00.000Z") } });
    await db.migrationRun.update({ where: { id: slices[index].runId }, data: { status: "succeeded", snapshotManifestDigest: SNAPSHOT_DIGEST, decisionsDigest: decisions.decisionsDigest, reportDigest: report.reportDigest, countsJson: report.summary, countsSchemaVersion: 1, verificationJson: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true }, verificationSchemaVersion: 1, finishedAt: new Date("2026-07-13T00:01:00.000Z") } });
  }
  const fullImportBase = { schemaVersion: 1 as const, kind: "airoaming_full_shadow_import_v1" as const, status: "succeeded" as const, slices: slices.map(({ slice, runId, status, reportDigest, counts, report }) => ({ slice, runId, status, reportDigest, counts, report })) };
  const fullImportReport = { ...fullImportBase, reportDigest: digestCanonicalJson({ schemaVersion: 1, kind: fullImportBase.kind, status: fullImportBase.status, slices: slices.map(({ slice, status, reportDigest, counts }) => ({ slice, status, reportDigest, counts })) }) };
  const fullImportPath = path.join(root, "full-import-report.json");
  const decisionsPath = path.join(root, "decisions.json");
  await writeFile(fullImportPath, JSON.stringify(fullImportReport) + "\n", { mode: 0o600 });
  await writeFile(decisionsPath, JSON.stringify(decisions) + "\n", { mode: 0o600 });
  const coordinator = new MaintenanceCoordinator();
  await coordinator.drain();
  await coordinator.close();
  const maintenanceBundle = path.join(root, "maintenance-bundle.json");
  await new RuntimeBundleFileService().writeAtomic(maintenanceBundle, await coordinator.createRuntimeBundle());
  return { root, workspaceRoot, dataRoot, outputRoot, databaseUrl, fullImportPath, decisionsPath, maintenanceBundle, assetPath, prisma, previous };
}

async function prepareFinalReadyFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const release = await loadReleaseSchemaIdentityV1(repoRoot);
  const childRuns = await fixture.prisma.database().migrationRun.findMany({ orderBy: { id: "asc" } });
  const slices = FULL_SHADOW_SLICE_ORDER.map((slice, index) => ({
    slice,
    runId: childRuns[index]!.id,
    status: "succeeded" as const,
    reportDigest: childRuns[index]!.reportDigest as SnapshotDigest,
    counts: childRuns[index]!.countsJson as Record<string, unknown>,
    evidence: { verificationReportDigest: childRuns[index]!.reportDigest as SnapshotDigest, passed: true },
  }));
  const finalReport = createFinalImportReport({ schemaVersion: 1, kind: "airoaming_final_import_report_v1", sourceManifestDigest: SOURCE_DIGEST, snapshotManifestDigest: SNAPSHOT_DIGEST, decisionsDigest: (await fixture.prisma.database().migrationRun.findFirstOrThrow()).decisionsDigest as SnapshotDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, slices });
  const finalRunId = "final-fixture-ready";
  await fixture.prisma.database().migrationRun.create({ data: {
    id: finalRunId,
    kind: "final",
    status: "running",
    importerVersion: "d2-a7-final-v1",
    sourceManifestDigest: SOURCE_DIGEST,
    startedAt: new Date("2026-07-13T00:02:00.000Z"),
  } });
  await fixture.prisma.database().migrationRun.update({ where: { id: finalRunId }, data: {
    status: "succeeded",
    snapshotManifestDigest: SNAPSHOT_DIGEST,
    decisionsDigest: finalReport.decisionsDigest,
    reportDigest: finalReport.reportDigest,
    countsJson: { aggregateReport: finalReport } as unknown as Prisma.InputJsonValue,
    countsSchemaVersion: 1,
    verificationJson: { schemaVersion: 1, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, sourceManifestDigest: SOURCE_DIGEST, snapshotManifestDigest: SNAPSHOT_DIGEST, decisionsDigest: finalReport.decisionsDigest, integrityCheck: "ok", foreignKeyViolationCount: 0, failedLedgerCount: 0, migrationChecksumStatus: "verified", openBlockerCount: 0, secretScanCount: 0 },
    verificationSchemaVersion: 1,
    finishedAt: new Date("2026-07-13T00:03:00.000Z"),
  } });
  await fixture.prisma.database().persistenceState.update({ where: { id: "primary" }, data: { activationState: "ready_for_activation", cutoverRunId: finalRunId, sourceManifestDigest: SOURCE_DIGEST, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, lastVerifiedAt: new Date("2026-07-13T00:03:00.000Z") } });
  return { finalRunId, finalReport };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env.DATABASE_URL;
  delete process.env.AIROAMING_PERSISTENCE_MODE;
});

describe("M5-A1 coordinated backup", () => {
  it("M6A1-BK-01 creates and restores a sealed pre-cutover final/ready bundle", async () => {
    const fixture = await createFixture();
    const restoreRoot = await mkdtemp(path.join(fixture.root, "restore-"));
    try {
      const { finalRunId, finalReport } = await prepareFinalReadyFixture(fixture);
      const result = await new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "pre-cutover", runId: finalRunId });
      const manifest = JSON.parse(await readFile(path.join(result.bundlePath, "backup-manifest.json"), "utf8")) as { backupKind: string; migration: { runKind: string; finalRunId: string; runIds: string[]; fullImportReportDigest: string }; persistenceState: { activationState: string; cutoverRunId: string | null; activatedAt: string | null; firstBusinessWriteAt: string | null } };
      expect(result.runCount).toBe(1);
      expect(manifest).toMatchObject({ backupKind: "pre-cutover", migration: { runKind: "final", finalRunId, runIds: [finalRunId], fullImportReportDigest: finalReport.reportDigest }, persistenceState: { activationState: "ready_for_activation", cutoverRunId: finalRunId, activatedAt: null, firstBusinessWriteAt: null } });
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(restoreRoot, "data"), targetWorkspaceRoot: path.join(restoreRoot, "workspace"), mode: "verify-only" })).resolves.toMatchObject({ mode: "verify-only", bundleDigest: result.bundleDigest });
    } finally {
      await fixture.prisma.onModuleDestroy();
    }
  });

  it("M6A1-ACT-01 dry-runs and executes only the matching pre-cutover bundle", async () => {
    const fixture = await createFixture();
    try {
      const { finalRunId } = await prepareFinalReadyFixture(fixture);
      const backup = await new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "pre-cutover", runId: finalRunId });
      const release = await loadReleaseSchemaIdentityV1(repoRoot);
      const activate = new DbActivateService(fixture.prisma);
      await expect(activate.activate({ runId: finalRunId, sourceManifestDigest: SOURCE_DIGEST, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup: backup.bundlePath, gate: "ACT-08", mode: "dry-run" })).resolves.toMatchObject({ mode: "dry-run", activationState: "ready_for_activation", firstBusinessWriteAt: null });
      expect((await fixture.prisma.database().persistenceState.findUnique({ where: { id: "primary" } }))?.activationState).toBe("ready_for_activation");
      await expect(activate.activate({ runId: finalRunId, sourceManifestDigest: SOURCE_DIGEST, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup: backup.bundlePath, gate: "ACT-08", mode: "execute" })).resolves.toMatchObject({ mode: "execute", activationState: "db_only", firstBusinessWriteAt: null });
    } finally {
      await fixture.prisma.onModuleDestroy();
    }
  });
  it("A4-CLI-01 rejects extra positional arguments before Prisma initialization", async () => {
    const backup = await runCli(
      backupCli,
      "--database-url", "file:/tmp/airoaming-a4.sqlite",
      "--workspace-root", "/tmp/airoaming-workspace",
      "--data-root", "/tmp/airoaming-data",
      "--release-root", "/tmp/airoaming-release",
      "--app-commit", "abcdef1234567",
      "--maintenance-bundle", "/tmp/maintenance-bundle.json",
      "--full-import-report", "/tmp/full-import.json",
      "--decisions", "/tmp/decisions.json",
      "--output", "/tmp/airoaming-output",
      "--kind", "coordinated",
      "--format", "json",
      "unexpected",
    );
    expect(backup.code).toBe(1);
    expect(backup.stderr.trim()).toContain("BACKUP_ARGS_INVALID");

    const restore = await runCli(
      restoreCli,
      "--backup", "/tmp/airoaming-backup",
      "--release-root", "/tmp/airoaming-release",
      "--target-data-root", "/tmp/airoaming-restore-data",
      "--target-workspace-root", "/tmp/airoaming-restore-workspace",
      "--mode", "verify-only",
      "--format", "json",
      "unexpected",
    );
    expect(restore.code).toBe(1);
    expect(restore.stderr.trim()).toContain("RESTORE_ARGS_INVALID");
  });

  it("A4-BAK-02 rejects an active writer and leaves no sealed bundle", async () => {
    const fixture = await createFixture();
    const writer = new DatabaseSync(path.join(fixture.dataRoot, "db/airoaming.sqlite"));
    try {
      writer.exec("PRAGMA busy_timeout = 50");
      writer.exec("BEGIN IMMEDIATE");
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_NOT_OFFLINE" });
      expect(await readdir(fixture.outputRoot)).toEqual([]);
    } finally {
      try { writer.exec("ROLLBACK"); } catch { /* preserve the assertion */ }
      writer.close();
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-BAK-01 holds the write fence before a second writer can begin", async () => {
    const fixture = await createFixture();
    const writer = new DatabaseSync(path.join(fixture.dataRoot, "db/airoaming.sqlite"));
    let writerBlocked = false;
    try {
      const result = await new AppBackupService(fixture.prisma, {
        onFenceAcquired: () => {
          writer.exec("PRAGMA busy_timeout = 50");
          try {
            writer.exec("BEGIN IMMEDIATE");
          } catch {
            writerBlocked = true;
          }
        },
      }).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" });
      expect(result.runCount).toBe(16);
      expect(writerBlocked).toBe(true);
    } finally {
      try { writer.exec("ROLLBACK"); } catch { /* preserve the assertion */ }
      writer.close();
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("BAK-01 creates a sealed bundle with 16 verified runs and ready assets", async () => {
    const fixture = await createFixture();
    try {
      const result = await new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" });
      const manifest = JSON.parse(await readFile(path.join(result.bundlePath, "backup-manifest.json"), "utf8")) as { bundleDigest: string; migration: { runIds: string[]; sliceCount: number }; assets: Array<{ storageKey: string; sha256: string }> };
      expect(manifest.bundleDigest).toBe(result.bundleDigest);
      expect(manifest.migration.sliceCount).toBe(16);
      expect(manifest.migration.runIds).toHaveLength(16);
      expect(manifest.assets).toHaveLength(1);
      expect(manifest.assets[0]).toMatchObject({ storageKey: "projects/p1/assets/one.txt", sha256: expect.stringMatching(/^sha256:/) });
      expect(await readFile(path.join(result.bundlePath, "SEALED"), "utf8")).toContain(result.manifestDigest);
      expect(await readFile(path.join(result.bundlePath, "config/settings.redacted.json"), "utf8")).not.toContain("app-settings.json");
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("BAK-02 fails closed when a ready asset is missing and leaves no sealed bundle", async () => {
    const fixture = await createFixture();
    try {
      await unlink(fixture.assetPath);
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_ASSET_MISMATCH" });
      expect(await readdir(fixture.outputRoot)).toEqual([]);
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("BAK-03 requires a final run for pre-cutover backup", async () => {
    const fixture = await createFixture();
    try {
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "pre-cutover", runId: "missing-final" })).rejects.toMatchObject({ code: "BACKUP_RUN_INVALID" });
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it.each([
    ["missing slice", (report: { slices: unknown[] }) => { report.slices.pop(); }],
    ["duplicate slice", (report: { slices: unknown[] }) => { report.slices[1] = report.slices[0]; }],
  ])("A4-BAK-03 rejects a full-shadow report with %s", async (_label, mutate) => {
    const fixture = await createFixture();
    try {
      const reportPath = fixture.fullImportPath;
      const report = JSON.parse(await readFile(reportPath, "utf8")) as { slices: unknown[] };
      mutate(report);
      await writeFile(reportPath, JSON.stringify(report) + "\n", { mode: 0o600 });
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: reportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_RUN_INVALID" });
      expect(await readdir(fixture.outputRoot)).toEqual([]);
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-BAK-04 rejects a sentinel in DB user text before sealing", async () => {
    const fixture = await createFixture();
    try {
      await fixture.prisma.database().project.update({ where: { id: "p1" }, data: { name: "airoaming-test-secret-db" } });
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_SECRET_DETECTED" });
      expect(await readdir(fixture.outputRoot)).toEqual([]);
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-BAK-04 rejects a sentinel in ready Asset bytes before sealing", async () => {
    const fixture = await createFixture();
    try {
      const bytes = Buffer.from("airoaming-test-secret-asset");
      await writeFile(fixture.assetPath, bytes, { mode: 0o600 });
      const database = new DatabaseSync(path.join(fixture.dataRoot, "db/airoaming.sqlite"));
      database.exec("DROP TRIGGER IF EXISTS trg_assets_ready_core_immutable_update");
      database.close();
      await fixture.prisma.database().asset.update({ where: { id: "asset-1" }, data: { bytes: bytes.byteLength, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` } });
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_SECRET_DETECTED" });
      expect(await readdir(fixture.outputRoot)).toEqual([]);
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-BAK-04 rejects symlink and overlapping backup roots", async () => {
    const fixture = await createFixture();
    try {
      const linkedWorkspace = path.join(fixture.root, "linked-workspace");
      await symlink(fixture.workspaceRoot, linkedWorkspace);
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: linkedWorkspace, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_PATH_UNSAFE" });
      const nestedOutput = path.join(fixture.workspaceRoot, "nested-output");
      await mkdir(nestedOutput);
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: nestedOutput, kind: "coordinated" })).rejects.toMatchObject({ code: "BACKUP_PATH_UNSAFE" });
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });
});

describe("M5-A2 restore", () => {
  async function createBundle() {
    const fixture = await createFixture();
    const result = await new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "coordinated" });
    await fixture.prisma.onModuleDestroy();
    return { fixture, result };
  }

  it("A4-RST-01B rejects a release identity mismatch before writing targets", async () => {
    const { fixture, result } = await createBundle();
    try {
      const releaseRoot = await copyReleaseFixture(fixture.root);
      const migrationPath = path.join(releaseRoot, "apps/server/prisma/migrations/0001_persistence_and_migration/migration.sql");
      await writeFile(migrationPath, Buffer.concat([await readFile(migrationPath), Buffer.from("\n-- release tamper\n")]));
      const dataTarget = path.join(fixture.root, "release-mismatch-data");
      const workspaceTarget = path.join(fixture.root, "release-mismatch-workspace");
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_RELEASE_IDENTITY_MISMATCH" });
      await expect(lstat(dataTarget)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(workspaceTarget)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-01H rejects missing, duplicate, or relative release-root before restore side effects", async () => {
    const base = [
      "--backup", "/tmp/airoaming-backup",
      "--target-data-root", "/tmp/airoaming-restore-data",
      "--target-workspace-root", "/tmp/airoaming-restore-workspace",
      "--mode", "verify-only",
      "--format", "json",
    ];
    const missing = await runCli(restoreCli, ...base);
    expect(missing.code).toBe(1);
    expect(missing.stderr.trim()).toContain("RESTORE_ARGS_INVALID");
    const duplicate = await runCli(restoreCli, ...base.slice(0, 2), "--release-root", "/tmp/airoaming-release", "--release-root", "/tmp/airoaming-release-2", ...base.slice(2));
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr.trim()).toContain("RESTORE_ARGS_INVALID");
    const relative = await runCli(restoreCli, ...base.slice(0, 2), "--release-root", "relative-release", ...base.slice(2));
    expect(relative.code).toBe(1);
    expect(relative.stderr.trim()).toContain("RESTORE_ARGS_INVALID");
  });

  it("A4-RST-01C rejects a resealed summary with the wrong fixed slice order", async () => {
    const { fixture, result } = await createBundle();
    try {
      const summaryPath = path.join(result.bundlePath, "migration/run-summary.json");
      const summary = JSON.parse(await readFile(summaryPath, "utf8")) as { slices: unknown[] };
      [summary.slices[0], summary.slices[1]] = [summary.slices[1], summary.slices[0]];
      await writeFile(summaryPath, JSON.stringify(summary) + "\n", { mode: 0o600 });
      const bundlePath = await recomputeBundleSeal(result.bundlePath);
      await expect(new AppRestoreService().restore({ backup: bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "summary-order-data"), targetWorkspaceRoot: path.join(fixture.root, "summary-order-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-01D rejects a resealed summary whose importer version disagrees with the DB ledger", async () => {
    const { fixture, result } = await createBundle();
    try {
      const summaryPath = path.join(result.bundlePath, "migration/run-summary.json");
      const summary = JSON.parse(await readFile(summaryPath, "utf8")) as { slices: Array<{ importerVersion: string }> };
      summary.slices[0].importerVersion = "tampered-importer";
      await writeFile(summaryPath, JSON.stringify(summary) + "\n", { mode: 0o600 });
      const bundlePath = await recomputeBundleSeal(result.bundlePath);
      await expect(new AppRestoreService().restore({ backup: bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "summary-ledger-data"), targetWorkspaceRoot: path.join(fixture.root, "summary-ledger-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-01E rejects a resealed DB ledger mutation", async () => {
    const { fixture, result } = await createBundle();
    try {
      mutateBundleDatabase(result.bundlePath, "DROP TRIGGER IF EXISTS trg_migration_runs_terminal_immutable_update; DROP TRIGGER IF EXISTS trg_migration_runs_state_transition; UPDATE migration_runs SET importer_version = 'tampered-importer' WHERE id = 'full-fixture-01';");
      const bundlePath = await recomputeBundleSeal(result.bundlePath);
      await expect(new AppRestoreService().restore({ backup: bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "db-ledger-data"), targetWorkspaceRoot: path.join(fixture.root, "db-ledger-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-01F rejects a resealed DB with an open migration issue", async () => {
    const { fixture, result } = await createBundle();
    try {
      mutateBundleDatabase(result.bundlePath, "DROP TRIGGER IF EXISTS trg_migration_issues_running_run_insert; INSERT INTO migration_issues (id, run_id, issue_key, severity, code, detail_json, detail_schema_version, resolution_status) VALUES ('tampered-issue', 'full-fixture-01', 'tampered-open', 'warning', 'TAMPERED', '{}', 1, 'open');");
      const bundlePath = await recomputeBundleSeal(result.bundlePath);
      await expect(new AppRestoreService().restore({ backup: bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "open-issue-data"), targetWorkspaceRoot: path.join(fixture.root, "open-issue-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-01G rejects a resealed manifest whose PersistenceState leaves coordinated shadow", async () => {
    const { fixture, result } = await createBundle();
    try {
      const manifestPath = path.join(result.bundlePath, "backup-manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { persistenceState: { activationState: string } };
      manifest.persistenceState.activationState = "ready_for_activation";
      await writeFile(manifestPath, JSON.stringify(manifest) + "\n", { mode: 0o600 });
      const bundlePath = await recomputeBundleSeal(result.bundlePath);
      await expect(new AppRestoreService().restore({ backup: bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "persistence-data"), targetWorkspaceRoot: path.join(fixture.root, "persistence-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it.each([
    ["backup-manifest.json", "RESTORE_VERIFICATION_FAILED"],
    ["SEALED", "RESTORE_VERIFICATION_FAILED"],
    ["migration/run-summary.json", "RESTORE_VERIFICATION_FAILED"],
    ["database/app.db", "RESTORE_VERIFICATION_FAILED"],
    ["assets/projects/p1/assets/one.txt", "RESTORE_VERIFICATION_FAILED"],
  ])("A4-RST-02 raw tamper rejects %s", async (relativePath, expectedCode) => {
    const { fixture, result } = await createBundle();
    try {
      const filePath = path.join(result.bundlePath, relativePath);
      const bytes = await readFile(filePath);
      bytes[0] = bytes[0] ^ 0xff;
      await writeFile(filePath, bytes);
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "raw-tamper-data"), targetWorkspaceRoot: path.join(fixture.root, "raw-tamper-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: expectedCode });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("RST-01 verifies without creating targets or changing the bundle", async () => {
    const { fixture, result } = await createBundle();
    try {
      const manifestBefore = await readFile(path.join(result.bundlePath, "backup-manifest.json"));
      const dataTarget = path.join(fixture.root, "restore-data");
      const workspaceTarget = path.join(fixture.root, "restore-workspace");
      const verified = await new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "verify-only" });
      expect(verified.assetCount).toBe(1);
      expect(await readFile(path.join(result.bundlePath, "backup-manifest.json"))).toEqual(manifestBefore);
      await expect(lstat(dataTarget)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(workspaceTarget)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("RST-02 materializes DB and assets into two absent roots", async () => {
    const { fixture, result } = await createBundle();
    try {
      const dataTarget = path.join(fixture.root, "restore-data");
      const workspaceTarget = path.join(fixture.root, "restore-workspace");
      const restored = await new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "materialize" });
      expect(restored.targetDataRoot).toBe(dataTarget);
      expect(await readFile(path.join(dataTarget, "db/airoaming.sqlite"))).toEqual(await readFile(path.join(result.bundlePath, "database/app.db")));
      expect(await readFile(path.join(workspaceTarget, "projects/p1/assets/one.txt"))).toEqual(Buffer.from("fixture-image"));
      const previous = { DATABASE_URL: process.env.DATABASE_URL, AIROAMING_PERSISTENCE_MODE: process.env.AIROAMING_PERSISTENCE_MODE };
      process.env.DATABASE_URL = "file:" + path.join(dataTarget, "db/airoaming.sqlite");
      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      const restoredPrisma = new PrismaService();
      await restoredPrisma.onModuleInit();
      expect(await restoredPrisma.database().project.count()).toBe(1);
      expect((await restoredPrisma.database().persistenceState.findUnique({ where: { id: "primary" } }))?.activationState).toBe("shadow");
      await restoredPrisma.onModuleDestroy();
      if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.DATABASE_URL;
      if (previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previous.AIROAMING_PERSISTENCE_MODE;
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("RST-03 rejects an existing target before writing", async () => {
    const { fixture, result } = await createBundle();
    try {
      const manifestPath = path.join(result.bundlePath, "backup-manifest.json");
      const manifestBytes = await readFile(manifestPath, "utf8");
      const tampered = JSON.parse(manifestBytes) as Record<string, unknown>;
      tampered.appCommit = "tampered";
      await writeFile(manifestPath, JSON.stringify(tampered) + "\n", { mode: 0o600 });
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "tampered-data"), targetWorkspaceRoot: path.join(fixture.root, "tampered-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
      await writeFile(manifestPath, manifestBytes, { mode: 0o600 });
      const dataTarget = path.join(fixture.root, "restore-data");
      const workspaceTarget = path.join(fixture.root, "restore-workspace");
      await mkdir(dataTarget);
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "materialize" })).rejects.toMatchObject({ code: "RESTORE_TARGET_NOT_EMPTY" });
      expect(await readdir(fixture.outputRoot)).toHaveLength(1);
      await expect(lstat(workspaceTarget)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("RST-04 restarts the server and reads the restored project API without a write", async () => {
    const { fixture, result } = await createBundle();
    try {
      const dataTarget = path.join(fixture.root, "restore-data");
      const workspaceTarget = path.join(fixture.root, "restore-workspace");
      await new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "materialize" });
      const previous = { DATABASE_URL: process.env.DATABASE_URL, AIROAMING_PERSISTENCE_MODE: process.env.AIROAMING_PERSISTENCE_MODE, AIROAMING_TASK_WORKER_ENABLED: process.env.AIROAMING_TASK_WORKER_ENABLED };
      process.env.DATABASE_URL = "file:" + path.join(dataTarget, "db/airoaming.sqlite");
      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      process.env.AIROAMING_TASK_WORKER_ENABLED = "false";
      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix("api");
      await app.listen(0, "127.0.0.1");
      try {
        const address = app.getHttpServer().address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/api/projects`);
        expect(response.status).toBe(200);
        const body = await response.json() as { success: boolean; data: { items: Array<{ id: string }> } };
        expect(body).toMatchObject({ success: true, data: { items: [{ id: "p1" }] } });
      } finally {
        await app.close();
        if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.DATABASE_URL;
        if (previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previous.AIROAMING_PERSISTENCE_MODE;
        if (previous.AIROAMING_TASK_WORKER_ENABLED === undefined) delete process.env.AIROAMING_TASK_WORKER_ENABLED; else process.env.AIROAMING_TASK_WORKER_ENABLED = previous.AIROAMING_TASK_WORKER_ENABLED;
      }
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-03 rejects a non-sealed bundle and leaves targets untouched", async () => {
    const { fixture, result } = await createBundle();
    try {
      const unsealed = path.join(fixture.root, "unsealed-bundle");
      await cp(result.bundlePath, unsealed, { recursive: true });
      const dataTarget = path.join(fixture.root, "unsealed-data");
      const workspaceTarget = path.join(fixture.root, "unsealed-workspace");
      await expect(new AppRestoreService().restore({ backup: unsealed, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "verify-only" })).rejects.toMatchObject({ code: "BACKUP_NOT_SEALED" });
      await expect(lstat(dataTarget)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(workspaceTarget)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-03 rejects symlink and overlapping restore targets", async () => {
    const { fixture, result } = await createBundle();
    try {
      const linkedTarget = path.join(fixture.root, "linked-target");
      await mkdir(path.join(fixture.root, "linked-destination"));
      await symlink(path.join(fixture.root, "linked-destination"), linkedTarget);
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: linkedTarget, targetWorkspaceRoot: path.join(fixture.root, "restore-workspace"), mode: "materialize" })).rejects.toMatchObject({ code: "RESTORE_TARGET_NOT_EMPTY" });
      const overlapParent = path.join(fixture.root, "overlap-parent");
      await mkdir(overlapParent);
      await expect(new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(overlapParent, "data"), targetWorkspaceRoot: overlapParent, mode: "verify-only" })).rejects.toMatchObject({ code: "BACKUP_PATH_UNSAFE" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-03 rejects an unsafe storageKey after the outer seal is recomputed", async () => {
    const { fixture, result } = await createBundle();
    try {
      const manifestPath = path.join(result.bundlePath, "backup-manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { assets: Array<{ storageKey: string }> };
      manifest.assets[0].storageKey = "../../escape.txt";
      await writeFile(manifestPath, JSON.stringify(manifest) + "\n", { mode: 0o600 });
      const bundlePath = await recomputeBundleSeal(result.bundlePath);
      await expect(new AppRestoreService().restore({ backup: bundlePath, releaseRoot: repoRoot, targetDataRoot: path.join(fixture.root, "unsafe-storage-data"), targetWorkspaceRoot: path.join(fixture.root, "unsafe-storage-workspace"), mode: "verify-only" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-04 safely cleans the first root when the second publish fails", async () => {
    const { fixture, result } = await createBundle();
    try {
      const dataTarget = path.join(fixture.root, "compensation-data");
      const workspaceTarget = path.join(fixture.root, "compensation-workspace");
      const restore = new AppRestoreService({ rename: async (source, destination) => {
        if (path.basename(destination) === path.basename(workspaceTarget)) throw new Error("INJECTED_SECOND_RENAME");
        return rename(source, destination);
      } });
      await expect(restore.restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "materialize" })).rejects.toMatchObject({ code: "RESTORE_VERIFICATION_FAILED" });
      await expect(lstat(dataTarget)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(workspaceTarget)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await readdir(fixture.root)).filter((entry) => entry.includes(".restore-staging-")).length).toBe(0);
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-04 preserves an externally modified first root", async () => {
    const { fixture, result } = await createBundle();
    try {
      const dataTarget = path.join(fixture.root, "unsafe-compensation-data");
      const workspaceTarget = path.join(fixture.root, "unsafe-compensation-workspace");
      const restore = new AppRestoreService({ rename: async (source, destination) => {
        if (path.basename(destination) === path.basename(workspaceTarget)) {
          await writeFile(path.join(dataTarget, "external.txt"), "external", { mode: 0o600 });
          throw new Error("INJECTED_SECOND_RENAME");
        }
        return rename(source, destination);
      } });
      await expect(restore.restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "materialize" })).rejects.toMatchObject({ code: "RESTORE_COMPENSATION_UNSAFE" });
      expect(await readFile(path.join(dataTarget, "external.txt"), "utf8")).toBe("external");
      await expect(lstat(workspaceTarget)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });

  it("A4-RST-05 materializes clean roots and restarts in closed maintenance", async () => {
    const { fixture, result } = await createBundle();
    try {
      const dataTarget = path.join(fixture.root, "rst-05-data");
      const workspaceTarget = path.join(fixture.root, "rst-05-workspace");
      await new AppRestoreService().restore({ backup: result.bundlePath, releaseRoot: repoRoot, targetDataRoot: dataTarget, targetWorkspaceRoot: workspaceTarget, mode: "materialize" });
      const restoredDatabaseBytes = await readFile(path.join(dataTarget, "db/airoaming.sqlite"));
      const restoredAssetBytes = await readFile(path.join(workspaceTarget, "projects/p1/assets/one.txt"));
      expect(restoredDatabaseBytes.toString("utf8")).not.toContain("airoaming-test-secret-");
      expect(restoredAssetBytes.toString("utf8")).not.toContain("airoaming-test-secret-");
      const previous = { DATABASE_URL: process.env.DATABASE_URL, AIROAMING_PERSISTENCE_MODE: process.env.AIROAMING_PERSISTENCE_MODE, AIROAMING_TASK_WORKER_ENABLED: process.env.AIROAMING_TASK_WORKER_ENABLED, AIROAMING_MAINTENANCE_MODE: process.env.AIROAMING_MAINTENANCE_MODE };
      process.env.DATABASE_URL = "file:" + path.join(dataTarget, "db/airoaming.sqlite");
      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      process.env.AIROAMING_TASK_WORKER_ENABLED = "false";
      process.env.AIROAMING_MAINTENANCE_MODE = "closed";
      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix("api");
      await app.listen(0, "127.0.0.1");
      try {
        const coordinator = app.get(MaintenanceCoordinator);
        expect(coordinator.getState()).toBe("closed");
        expect((await coordinator.status()).state).toBe("closed");
        const state = await app.get(PrismaService).database().persistenceState.findUnique({ where: { id: "primary" } });
        expect(state).toMatchObject({ activationState: "shadow", cutoverRunId: null, firstBusinessWriteAt: null });
        const address = app.getHttpServer().address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/api/projects`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, data: { items: [{ id: "p1" }] } });
      } finally {
        await app.close();
        if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.DATABASE_URL;
        if (previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previous.AIROAMING_PERSISTENCE_MODE;
        if (previous.AIROAMING_TASK_WORKER_ENABLED === undefined) delete process.env.AIROAMING_TASK_WORKER_ENABLED; else process.env.AIROAMING_TASK_WORKER_ENABLED = previous.AIROAMING_TASK_WORKER_ENABLED;
        if (previous.AIROAMING_MAINTENANCE_MODE === undefined) delete process.env.AIROAMING_MAINTENANCE_MODE; else process.env.AIROAMING_MAINTENANCE_MODE = previous.AIROAMING_MAINTENANCE_MODE;
      }
    } finally {
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });
});
