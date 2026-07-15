import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES } from "./script-workflow-runtime-migration-ledger.js";
import {
  SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME,
  SCRIPT_WORKFLOW_SOURCE_STATE_TABLES,
} from "./script-workflow-source-state-contract.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");

describe("script dual-flow source-state database contract", () => {
  it("extends pending in place and deploys the nine source-state tables", async () => {
    const sql = await readFile(
      path.join(
        migrationRoot,
        SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME,
        "migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(
      'ALTER TABLE "chapter_script_pending" ADD COLUMN "kind"',
    );
    expect(sql).not.toContain('DROP TABLE "chapter_script_pending"');

    const database: DatabaseSync = new DatabaseSync(":memory:");
    for (const migrationName of SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES) {
      database.exec(
        await readFile(
          path.join(migrationRoot, migrationName, "migration.sql"),
          "utf8",
        ),
      );
    }

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    for (const table of SCRIPT_WORKFLOW_SOURCE_STATE_TABLES) {
      expect(tables).toContain(table);
    }
    expect(
      database
        .prepare('PRAGMA table_info("chapter_script_pending")')
        .all()
        .map((row) => String(row.name)),
    ).toEqual(
      expect.arrayContaining([
        "kind",
        "source_policy_version",
        "source_projection_json",
        "source_set_digest",
        "source_set_sealed_at",
      ]),
    );
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_chapter_script_pending_dialogue_scope_insert'",
        )
        .get(),
    ).toEqual({ name: "trg_chapter_script_pending_dialogue_scope_insert" });
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });
});
