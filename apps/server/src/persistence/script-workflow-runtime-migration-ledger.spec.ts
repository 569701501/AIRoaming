import { describe, expect, it } from "vitest";

import {
  assertScriptWorkflowRuntimeMigrationLedgerV1,
  loadScriptWorkflowRuntimeMigrationExpectationsV1,
  SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES,
} from "./script-workflow-runtime-migration-ledger.js";

describe("script workflow runtime migration ledger", () => {
  it("extends the historical G5 ledger through LayoutDocumentV2 revision/publication", async () => {
    const expected = await loadScriptWorkflowRuntimeMigrationExpectationsV1();
    expect(expected.map((item) => item.migrationName)).toEqual(SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES);
    const rows = expected.map((item) => ({
      migration_name: item.migrationName,
      checksum: item.checksum,
      finished_at: "2026-07-15T00:00:00.000Z",
      rolled_back_at: null,
      logs: null,
      applied_steps_count: 1,
    }));
    expect(() => assertScriptWorkflowRuntimeMigrationLedgerV1(expected, rows)).not.toThrow();
  });

  it("fails closed when the new migration is absent", async () => {
    const expected = await loadScriptWorkflowRuntimeMigrationExpectationsV1();
    const rows = expected.slice(0, -1).map((item) => ({ migration_name: item.migrationName, checksum: item.checksum, finished_at: "done", rolled_back_at: null, logs: null, applied_steps_count: 1 }));
    expect(() => assertScriptWorkflowRuntimeMigrationLedgerV1(expected, rows)).toThrow(/LEDGER_MISSING/);
  });
});
