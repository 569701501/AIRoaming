import { describe, expect, it } from "vitest";

import { G5_LAYOUT_OVERLAY_MIGRATION_NAME } from "./g5-layout-overlay-contract.js";
import { G5_LAYOUT_BINDING_DIGEST_MIGRATION_NAME } from "./g5-layout-binding-digest-contract.js";
import {
  assertG5RuntimeMigrationLedgerV1,
  G5_RUNTIME_MIGRATION_NAMES,
  loadG5RuntimeMigrationExpectationsV1,
} from "./g5-runtime-migration-ledger.js";

describe("G5 runtime migration ledger", () => {
  it("accepts only the exact successful 14-row release", async () => {
    const expected = await loadG5RuntimeMigrationExpectationsV1();
    expect(expected).toHaveLength(14);
    expect(expected.map((entry) => entry.migrationName)).toEqual(G5_RUNTIME_MIGRATION_NAMES);
    expect(expected.at(-1)).toMatchObject({
      migrationName: G5_LAYOUT_BINDING_DIGEST_MIGRATION_NAME,
      checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const rows = expected.map((entry) => ({
      migration_name: entry.migrationName,
      checksum: entry.checksum,
      finished_at: new Date("2026-07-15T00:00:00.000Z"),
      rolled_back_at: null,
      logs: null,
      applied_steps_count: 1,
    }));
    expect(() => assertG5RuntimeMigrationLedgerV1(expected, rows)).not.toThrow();
    expect(() => assertG5RuntimeMigrationLedgerV1(expected, rows.slice(0, -1))).toThrow(
      `DB_PERSISTENCE_G5_MIGRATION_LEDGER_MISSING:${G5_LAYOUT_BINDING_DIGEST_MIGRATION_NAME}`,
    );
    expect(expected.some((entry) => entry.migrationName === G5_LAYOUT_OVERLAY_MIGRATION_NAME)).toBe(true);
  });
});
