import { describe, expect, it } from "vitest";

import {
  assertG3RuntimeMigrationLedgerV1,
  G3_RUNTIME_MIGRATION_NAME,
  G3_RUNTIME_MIGRATION_NAMES,
  loadG3RuntimeMigrationExpectationsV1,
} from "./g3-runtime-migration-ledger.js";

describe("G3 runtime migration ledger", () => {
  it("extends the G2 ten-row baseline with 0010", async () => {
    const expected = await loadG3RuntimeMigrationExpectationsV1();
    expect(expected).toHaveLength(10);
    expect(expected.map((entry) => entry.migrationName)).toEqual(G3_RUNTIME_MIGRATION_NAMES);
    expect(expected.at(-1)?.migrationName).toBe(G3_RUNTIME_MIGRATION_NAME);
    expect(expected.at(-1)?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts only successful, exact rows", async () => {
    const expected = await loadG3RuntimeMigrationExpectationsV1();
    const rows = expected.map((entry) => ({
      migration_name: entry.migrationName,
      checksum: entry.checksum,
      finished_at: new Date("2026-07-12T00:00:00.000Z"),
      rolled_back_at: null,
      logs: null,
      applied_steps_count: 1,
    }));
    expect(() => assertG3RuntimeMigrationLedgerV1(expected, rows)).not.toThrow();
    expect(() => assertG3RuntimeMigrationLedgerV1(expected, rows.slice(0, -1))).toThrow(
      "DB_PERSISTENCE_G3_MIGRATION_LEDGER_MISSING:" + G3_RUNTIME_MIGRATION_NAME,
    );
  });
});
