import { describe, expect, it } from "vitest";

import {
  assertG2RuntimeMigrationLedgerV1,
  G2_RUNTIME_MIGRATION_NAME,
  G2_RUNTIME_MIGRATION_NAMES,
  loadG2RuntimeMigrationExpectationsV1,
} from "./g2-runtime-migration-ledger.js";

describe("G2 runtime migration ledger", () => {
  it("extends the G1 eight-row baseline with 0009 without changing G1 names", async () => {
    const expected = await loadG2RuntimeMigrationExpectationsV1();
    expect(expected).toHaveLength(9);
    expect(expected.map((entry) => entry.migrationName)).toEqual(G2_RUNTIME_MIGRATION_NAMES);
    expect(expected.at(-1)?.migrationName).toBe(G2_RUNTIME_MIGRATION_NAME);
    expect(expected.at(-1)?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts only successful, exact rows", async () => {
    const expected = await loadG2RuntimeMigrationExpectationsV1();
    const rows = expected.map((entry) => ({
      migration_name: entry.migrationName,
      checksum: entry.checksum,
      finished_at: new Date("2026-07-12T00:00:00.000Z"),
      rolled_back_at: null,
      logs: null,
      applied_steps_count: 1,
    }));
    expect(() => assertG2RuntimeMigrationLedgerV1(expected, rows)).not.toThrow();
    expect(() => assertG2RuntimeMigrationLedgerV1(expected, rows.slice(0, -1))).toThrow(
      `DB_PERSISTENCE_G2_MIGRATION_LEDGER_MISSING:${G2_RUNTIME_MIGRATION_NAME}`,
    );
  });
});
