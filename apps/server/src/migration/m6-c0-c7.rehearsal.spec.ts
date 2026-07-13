import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getBlockedDbCapabilities } from "./db-capability-registry.js";
import { DbActivateService } from "./db-activate.service.js";
import { CutoverCoordinator } from "./cutover-coordinator.service.js";
import { MetadataArchiveService } from "./metadata-archive.service.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("M6 isolated C0-C7 rehearsal", () => {
  it("runs the ordered cutover stages on temporary roots and stops before real authorization", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-m6-c0-c7-"));
    try {
      const workspace = path.join(root, "workspace");
      const secretStore = path.join(root, "secret-store");
      await mkdir(path.join(workspace, "projects", "p1", "assets"), { recursive: true });
      await mkdir(secretStore, { recursive: true });
      await writeFile(path.join(workspace, "projects", "p1", "project.json"), JSON.stringify({ id: "p1", name: "isolated" }));
      await writeFile(path.join(workspace, "projects", "p1", "assets", "asset.bin"), "asset");
      await writeFile(path.join(secretStore, "provider.ref"), "fingerprint-only");
      const release = await loadReleaseSchemaIdentityV1(repoRoot);
      const sourceDigest = "sha256:" + "3".repeat(64);
      const runId = "m6-rehearsal-final";
      const state: Record<string, unknown> = { id: "primary", activationState: "ready_for_activation", cutoverRunId: runId, sourceManifestDigest: sourceDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, activatedAt: null, firstBusinessWriteAt: null };
      const snapshotDigest = "sha256:" + "4".repeat(64);
      const decisionsDigest = "sha256:" + "5".repeat(64);
      const run = { id: runId, kind: "final", status: "succeeded", sourceManifestDigest: sourceDigest, snapshotManifestDigest: snapshotDigest, decisionsDigest, verificationJson: { effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest, sourceManifestDigest: sourceDigest, snapshotManifestDigest: snapshotDigest, decisionsDigest, integrityCheck: "ok", foreignKeyViolationCount: 0, failedLedgerCount: 0, migrationChecksumStatus: "verified", openBlockerCount: 0, secretScanCount: 0 } };
      const backup = path.join(root, "backup-m6-rehearsal");
      await mkdir(backup, { recursive: true });
      await writeFile(path.join(backup, "backup-manifest.json"), JSON.stringify({ backupKind: "pre-cutover", migration: { runKind: "final", finalRunId: runId, sourceManifestDigest: sourceDigest, effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest } }));
      const db: any = {
        migrationRun: { findUnique: async () => run },
        persistenceState: {
          findUnique: async () => state,
          update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(state, data),
        },
        $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
      };
      const fakePrisma = {
        database: () => db,
        runBusinessTransaction: async (operation: () => Promise<unknown>) => {
          if (state.activationState === "ready_for_activation") throw new Error("DB_PERSISTENCE_NOT_ACTIVE");
          const result = await operation();
          if (state.activationState === "db_only" && state.firstBusinessWriteAt === null) state.firstBusinessWriteAt = new Date();
          return result;
        },
      };
      const restore = { restore: async () => ({ mode: "verify-only" }) };
      const activate = new DbActivateService(fakePrisma as never, restore as never);
      const maintenance = new MaintenanceCoordinator();
      const coordinator = new CutoverCoordinator(maintenance);

      await coordinator.runStep("C0", async () => {
        expect(getBlockedDbCapabilities()).toEqual([]);
        expect(release.effectiveSchemaManifestDigest).toBe(state.effectiveSchemaManifestDigest);
        return "bridge-release-and-gates-passed";
      });
      await coordinator.closeMaintenance();
      await coordinator.runStep("C2", async () => { await writeFile(path.join(root, "snapshot.marker"), "m6-rehearsal"); return "snapshot-and-restore-verified"; });
      await coordinator.runStep("C3", async () => { expect(await readFile(path.join(secretStore, "provider.ref"), "utf8")).toBe("fingerprint-only"); return "fresh-db-and-fake-secret-store"; });
      await coordinator.runStep("C4", async () => { expect(state.activationState).toBe("ready_for_activation"); return "final-verify-ready"; });
      await coordinator.runStep("C5", async () => { expect((await db.persistenceState.findUnique()).firstBusinessWriteAt).toBeNull(); return "closed-db-read-and-rollback-smoke"; });
      const archive = path.join(root, "metadata-archive");
      await coordinator.runStep("C6", async () => { const result = await new MetadataArchiveService().archive({ workspaceRoot: workspace, archiveRoot: archive, marker: "m6-rehearsal" }); expect(result.assetPathCount).toBe(1); return "metadata-only-archive-assets-retained-by-path"; });
      await coordinator.runStep("C7", async () => { await activate.activate({ runId, sourceManifestDigest: sourceDigest, effectiveManifestDigest: release.effectiveSchemaManifestDigest, releaseRoot: repoRoot, backup, gate: "ACT-08", mode: "execute" }); await fakePrisma.runBusinessTransaction(async () => "first-write"); return "db-only-reopened-and-first-write-recorded"; });

      expect(coordinator.status()).toHaveLength(8);
      expect(state.activationState).toBe("db_only");
      expect(state.firstBusinessWriteAt).toBeInstanceOf(Date);
      await expect(readFile(path.join(archive, "projects/p1/assets/asset.bin"))).rejects.toThrow();
      expect(coordinator.status().every((item) => item.status === "passed")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
