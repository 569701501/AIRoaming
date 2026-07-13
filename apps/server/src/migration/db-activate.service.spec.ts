import { describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { DbActivateError, DbActivateService } from "./db-activate.service.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const release = await loadReleaseSchemaIdentityV1(repoRoot);
const sourceManifestDigest = "sha256:" + "1".repeat(64);
const snapshotManifestDigest = "sha256:" + "3".repeat(64);
const decisionsDigest = "sha256:" + "4".repeat(64);
const runId = "final-m6-test";
const backupPath = "/tmp/backup-test-sealed";
await mkdir(backupPath, { recursive: true });
await writeFile(path.join(backupPath, "backup-manifest.json"), JSON.stringify({ backupKind: "pre-cutover", migration: { runKind: "final", finalRunId: runId, sourceManifestDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest } }));

function fixture() {
  const state: Record<string, unknown> = {
    id: "primary", activationState: "ready_for_activation", cutoverRunId: runId,
    sourceManifestDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
    activatedAt: null, firstBusinessWriteAt: null,
  };
  const run = {
    id: runId, kind: "final", status: "succeeded", sourceManifestDigest,
    snapshotManifestDigest, decisionsDigest,
    verificationJson: { effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, sourceManifestDigest, snapshotManifestDigest, decisionsDigest, integrityCheck: "ok", foreignKeyViolationCount: 0, failedLedgerCount: 0, migrationChecksumStatus: "verified", openBlockerCount: 0, secretScanCount: 0 },
  };
  const db = {
    migrationRun: { findUnique: vi.fn(async () => run) },
    persistenceState: { findUnique: vi.fn(async () => state) },
    $transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db)),
  };
  db.persistenceState = { findUnique: vi.fn(async () => state), update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state, data)) } as never;
  return { db, state };
}

function input(mode: "dry-run" | "execute") {
  return { runId, sourceManifestDigest, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup: backupPath, gate: "ACT-08" as const, mode };
}

describe("DbActivateService", () => {
  it("dry-run verifies the sealed backup and performs zero DB writes", async () => {
    const { db, state } = fixture();
    const restore = { restore: vi.fn(async () => ({ mode: "verify-only" })) };
    const service = new DbActivateService({ database: () => db } as never, restore as never);
    await expect(service.activate(input("dry-run"))).resolves.toMatchObject({ mode: "dry-run", activationState: "ready_for_activation", backupVerified: true, firstBusinessWriteAt: null });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(state.activationState).toBe("ready_for_activation");
    expect(restore.restore).toHaveBeenCalledTimes(1);
  });

  it("execute atomically transitions ready_for_activation to db_only without first write", async () => {
    const { db, state } = fixture();
    const service = new DbActivateService({ database: () => db } as never, { restore: vi.fn(async () => ({ mode: "verify-only" })) } as never);
    await expect(service.activate(input("execute"))).resolves.toMatchObject({ mode: "execute", activationState: "db_only", backupVerified: true, firstBusinessWriteAt: null });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(state.activationState).toBe("db_only");
    expect(state.firstBusinessWriteAt).toBeNull();
  });

  it("fails closed on source/effective identity mismatch", async () => {
    const { db } = fixture();
    const service = new DbActivateService({ database: () => db } as never, { restore: vi.fn() } as never);
    await expect(service.activate({ ...input("dry-run"), sourceManifestDigest: "sha256:" + "2".repeat(64) })).rejects.toMatchObject({ code: "ACTIVATE_IDENTITY_MISMATCH" });
  });

  it("rejects a coordinated shadow bundle even when its outer path is sealed-looking", async () => {
    await writeFile(path.join(backupPath, "backup-manifest.json"), JSON.stringify({ backupKind: "coordinated", migration: { runKind: "shadow", sourceManifestDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest } }));
    const { db } = fixture();
    const service = new DbActivateService({ database: () => db } as never, { restore: vi.fn() } as never);
    await expect(service.activate(input("dry-run"))).rejects.toMatchObject({ code: "ACTIVATE_BACKUP_UNVERIFIED" });
  });
});
