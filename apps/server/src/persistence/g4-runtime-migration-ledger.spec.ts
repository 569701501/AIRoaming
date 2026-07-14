import { describe, expect, it } from "vitest";

import {
  assertG4RuntimeMigrationLedgerV1,
  G4_RUNTIME_MIGRATION_NAMES,
  loadG4RuntimeMigrationExpectationsV1,
} from "./g4-runtime-migration-ledger.js";
import { G4_CANDIDATE_LOCK_OVERLAY_MIGRATION_NAME } from "./g4-candidate-lock-overlay-contract.js";

describe("G4 runtime migration ledger", () => {
  it("extends the prior 11-row release with the candidate lock overlay", async () => {
    const expected = await loadG4RuntimeMigrationExpectationsV1();
    expect(expected).toHaveLength(12);
    expect(expected.map((entry) => entry.migrationName)).toEqual(
      G4_RUNTIME_MIGRATION_NAMES,
    );
    expect(expected.at(-1)).toMatchObject({
      migrationName: G4_CANDIDATE_LOCK_OVERLAY_MIGRATION_NAME,
      checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("accepts only the exact successful 12-row ledger", async () => {
    const expected = await loadG4RuntimeMigrationExpectationsV1();
    const rows = expected.map((entry) => ({
      migration_name: entry.migrationName,
      checksum: entry.checksum,
      finished_at: new Date("2026-07-14T00:00:00.000Z"),
      rolled_back_at: null,
      logs: null,
      applied_steps_count: 1,
    }));
    expect(() => assertG4RuntimeMigrationLedgerV1(expected, rows)).not.toThrow();
    expect(() =>
      assertG4RuntimeMigrationLedgerV1(expected, rows.slice(0, -1)),
    ).toThrow(
      `DB_PERSISTENCE_G4_MIGRATION_LEDGER_MISSING:${G4_CANDIDATE_LOCK_OVERLAY_MIGRATION_NAME}`,
    );
  });
});
