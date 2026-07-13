import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { afterEach, describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { RuntimeBundleFileService } from "../migration/runtime-bundle-file.service.js";
import { createMigrationDecisionArtifact } from "../migration/migration-decision.js";
import { createComicFormatReport } from "../migration/migration-report.js";
import { FULL_SHADOW_SLICE_ORDER } from "../migration/full-shadow-importer.js";
import type { SnapshotDigest } from "../migration/snapshot.types.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { AppBackupService } from "./app-backup.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const roots: string[] = [];
const SOURCE_DIGEST = ("sha256:" + "1".repeat(64)) as SnapshotDigest;
const SNAPSHOT_DIGEST = ("sha256:" + "2".repeat(64)) as SnapshotDigest;

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

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env.DATABASE_URL;
  delete process.env.AIROAMING_PERSISTENCE_MODE;
});

describe("M5-A1 coordinated backup", () => {
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

  it("BAK-03 keeps pre-cutover fail-closed even with a valid coordinated fixture", async () => {
    const fixture = await createFixture();
    try {
      await expect(new AppBackupService(fixture.prisma).backup({ databaseUrl: fixture.databaseUrl, workspaceRoot: fixture.workspaceRoot, dataRoot: fixture.dataRoot, releaseRoot: repoRoot, appCommit: "abcdef1234567", maintenanceBundle: fixture.maintenanceBundle, fullImportReport: fixture.fullImportPath, decisions: fixture.decisionsPath, output: fixture.outputRoot, kind: "pre-cutover" })).rejects.toMatchObject({ code: "MIGRATION_CAPABILITY_BLOCKED" });
    } finally {
      await fixture.prisma.onModuleDestroy();
      if (fixture.previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous.DATABASE_URL;
      if (fixture.previous.AIROAMING_PERSISTENCE_MODE === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = fixture.previous.AIROAMING_PERSISTENCE_MODE;
    }
  });
});
