import { describe, expect, it } from "vitest";

import {
  assertProjectPurgeRuntimeMigrationLedgerV1,
  loadProjectPurgeRuntimeMigrationExpectationsV1,
  PROJECT_PURGE_RUNTIME_MIGRATION_NAMES,
} from "./project-purge-runtime-migration-ledger.js";
import { PROJECT_PURGE_OVERLAY_MIGRATION_NAME } from "./project-purge-overlay-contract.js";

describe("project purge runtime migration ledger", () => {
  it("extends the G3 ten-row baseline with the forward purge overlay", async () => {
    const expected = await loadProjectPurgeRuntimeMigrationExpectationsV1();
    expect(expected).toHaveLength(11);
    expect(expected.map((entry) => entry.migrationName)).toEqual(
      PROJECT_PURGE_RUNTIME_MIGRATION_NAMES,
    );
    expect(expected.at(-1)?.migrationName).toBe(
      PROJECT_PURGE_OVERLAY_MIGRATION_NAME,
    );
    expect(expected.at(-1)?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts only successful, exact rows", async () => {
    const expected = await loadProjectPurgeRuntimeMigrationExpectationsV1();
    const rows = expected.map((entry) => ({
      migration_name: entry.migrationName,
      checksum: entry.checksum,
      finished_at: new Date("2026-07-14T00:00:00.000Z"),
      rolled_back_at: null,
      logs: null,
      applied_steps_count: 1,
    }));
    expect(() =>
      assertProjectPurgeRuntimeMigrationLedgerV1(expected, rows),
    ).not.toThrow();
    expect(() =>
      assertProjectPurgeRuntimeMigrationLedgerV1(expected, rows.slice(0, -1)),
    ).toThrow(
      `DB_PERSISTENCE_PROJECT_PURGE_MIGRATION_LEDGER_MISSING:${PROJECT_PURGE_OVERLAY_MIGRATION_NAME}`,
    );
  });
});
