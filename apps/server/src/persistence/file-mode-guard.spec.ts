import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import { assertFileModeBridgeAllowed } from "./file-mode-guard.js";
import { PrismaService } from "./prisma.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const schemaPath = path.join(repoRoot, "apps/server/prisma/schema.prisma");

describe("file mode bridge guard", () => {
  it("rejects non-file bridge URLs before opening a client", async () => {
    await expect(assertFileModeBridgeAllowed("postgres://invalid")).rejects.toThrow("FILE_MODE_DATABASE_URL_INVALID");
  });

  it("M6A1-TX-08 / M6A1-RB-04 rejects a file bridge after the first db-only business write", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-file-bridge-"));
    const databasePath = path.join(root, "db.sqlite");
    await writeFile(databasePath, "", { mode: 0o600 });
    const databaseUrl = `file:${databasePath}`;
    const previousUrl = process.env.DATABASE_URL;
    const previousMode = process.env.AIROAMING_PERSISTENCE_MODE;
    let prisma: PrismaService | undefined;
    try {
      await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
      process.env.DATABASE_URL = databaseUrl;
      process.env.AIROAMING_PERSISTENCE_MODE = "db";
      prisma = new PrismaService();
      await prisma.onModuleInit();
      const sourceManifestDigest = `sha256:${"1".repeat(64)}`;
      const effectiveSchemaManifestDigest = `sha256:${"2".repeat(64)}`;
      const run = await prisma.database().migrationRun.create({ data: {
        id: "file-bridge-final",
        kind: "final",
        importerVersion: "d2-a7-final-v1",
        sourceManifestDigest,
      } });
      await prisma.database().migrationRun.update({ where: { id: run.id }, data: {
        status: "succeeded",
        snapshotManifestDigest: `sha256:${"3".repeat(64)}`,
        decisionsDigest: `sha256:${"4".repeat(64)}`,
        reportDigest: `sha256:${"5".repeat(64)}`,
        countsJson: { aggregateReport: {} },
        countsSchemaVersion: 1,
        verificationJson: { schemaVersion: 1, effectiveSchemaManifestDigest, sourceManifestDigest, snapshotManifestDigest: `sha256:${"3".repeat(64)}`, decisionsDigest: `sha256:${"4".repeat(64)}`, integrityCheck: "ok", foreignKeyViolationCount: 0, failedLedgerCount: 0, migrationChecksumStatus: "verified", openBlockerCount: 0, secretScanCount: 0 },
        verificationSchemaVersion: 1,
        finishedAt: new Date("2026-07-13T00:00:00.000Z"),
      } });
      await prisma.database().persistenceState.create({ data: { id: "primary" } });
      await prisma.database().persistenceState.update({ where: { id: "primary" }, data: { activationState: "ready_for_activation", cutoverRunId: run.id, sourceManifestDigest, effectiveSchemaManifestDigest } });
      await prisma.database().persistenceState.update({ where: { id: "primary" }, data: { activationState: "db_only", activatedAt: new Date("2026-07-13T00:00:00.000Z") } });
      await prisma.database().persistenceState.update({ where: { id: "primary" }, data: { firstBusinessWriteAt: new Date("2026-07-13T00:01:00.000Z") } });
      await expect(assertFileModeBridgeAllowed(databaseUrl)).rejects.toThrow("FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE");
    } finally {
      if (prisma) await prisma.onModuleDestroy();
      await rm(root, { recursive: true, force: true });
      if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
      if (previousMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previousMode;
    }
  });
});
