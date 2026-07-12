import { describe, expect, it } from "vitest";

import {
  assertG1RuntimeMigrationLedgerV1,
  assertG1RuntimeMigrationReadyV1,
  G1_RUNTIME_MIGRATION_NAMES,
  loadG1RuntimeMigrationExpectationsV1,
  type G1RuntimeMigrationLedgerRowV1,
} from "./g1-runtime-migration-ledger.js";

function successfulRows(
  expected: Awaited<ReturnType<typeof loadG1RuntimeMigrationExpectationsV1>>,
): G1RuntimeMigrationLedgerRowV1[] {
  return expected.map((entry) => ({
    migration_name: entry.migrationName,
    checksum: entry.checksum,
    finished_at: new Date("2026-07-12T00:00:00.000Z"),
    rolled_back_at: null,
    logs: null,
    applied_steps_count: 1n,
  }));
}

describe("G1 runtime migration ledger", () => {
  it("derives the exact eight checksums from the formal read-only migration tree", async () => {
    const expected = await loadG1RuntimeMigrationExpectationsV1();
    expect(expected.map((entry) => entry.migrationName)).toEqual(
      G1_RUNTIME_MIGRATION_NAMES,
    );
    expect(expected).toHaveLength(8);
    for (const entry of expected) {
      expect(entry.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(() =>
      assertG1RuntimeMigrationLedgerV1(expected, successfulRows(expected)),
    ).not.toThrow();
  });

  it("rejects missing, extra, duplicate, checksum-drifted and failed rows", async () => {
    const expected = await loadG1RuntimeMigrationExpectationsV1();
    const rows = successfulRows(expected);

    expect(() =>
      assertG1RuntimeMigrationLedgerV1(expected, rows.slice(0, -1)),
    ).toThrow(
      "DB_PERSISTENCE_MIGRATION_LEDGER_MISSING:0008_sqlite_checks_triggers_indexes",
    );
    expect(() =>
      assertG1RuntimeMigrationLedgerV1(expected, [
        ...rows,
        { ...rows[0], migration_name: "9999_unexpected" },
      ]),
    ).toThrow("DB_PERSISTENCE_MIGRATION_LEDGER_UNEXPECTED:9999_unexpected");
    expect(() =>
      assertG1RuntimeMigrationLedgerV1(expected, [
        ...rows.slice(0, -1),
        { ...rows[0] },
      ]),
    ).toThrow(
      "DB_PERSISTENCE_MIGRATION_LEDGER_DUPLICATE_NAME:0001_persistence_and_migration",
    );
    expect(() =>
      assertG1RuntimeMigrationLedgerV1(expected, [
        { ...rows[0], checksum: "0".repeat(64) },
        ...rows.slice(1),
      ]),
    ).toThrow(
      "DB_PERSISTENCE_MIGRATION_LEDGER_CHECKSUM_MISMATCH:0001_persistence_and_migration",
    );

    for (const failedRow of [
      { ...rows[0], finished_at: null },
      { ...rows[0], rolled_back_at: new Date() },
      { ...rows[0], logs: "P3018" },
      { ...rows[0], applied_steps_count: 0 },
    ]) {
      expect(() =>
        assertG1RuntimeMigrationLedgerV1(expected, [
          failedRow,
          ...rows.slice(1),
        ]),
      ).toThrow(
        "DB_PERSISTENCE_MIGRATION_LEDGER_FAILED:0001_persistence_and_migration",
      );
    }
  });

  it("maps a missing or unreadable Prisma ledger table to a stable startup error", async () => {
    await expect(
      assertG1RuntimeMigrationReadyV1({
        $queryRawUnsafe: async <T = unknown>() => {
          throw new Error("no such table: _prisma_migrations");
        },
      }),
    ).rejects.toThrow("DB_PERSISTENCE_MIGRATION_LEDGER_UNAVAILABLE");
  });
});
