import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertG2OverlayInspectionV1,
  assertG2OverlaySqlShapeV1,
  inspectG2OverlayV1,
  readG2OverlayMigrationSql,
} from "./g2-overlay-contract.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");

describe("G2 version/freshness overlay contract", () => {
  it("keeps the hand-written overlay SQL at the fixed 2-index/14-trigger shape", async () => {
    const sql = await readG2OverlayMigrationSql(migrationRoot);
    assertG2OverlaySqlShapeV1(sql);
    expect(sql).toContain("WHERE \"status\" = 'pending_confirmation'");
    expect(sql).toContain("AIR_G2:preflight_nonlegacy_v1_pending");
  });

  it("deploys on top of fresh G1 SQLite without adding tables/columns or leaving temp guards", async () => {
    const database = new DatabaseSync(":memory:");
    const g1Names = (await readFile(path.join(repoRoot, "apps/server/src/persistence/g1-runtime-migration-ledger.ts"), "utf8"));
    expect(g1Names).toContain("0008_sqlite_checks_triggers_indexes");
    for (const name of [
      "0001_persistence_and_migration",
      "0002_project_chapter_script",
      "0003_story_storyboard_preflight",
      "0004_character_asset_candidate",
      "0005_dialogue_settings_secret_metadata",
      "0006_generation_task_worker",
      "0007_layout_export_outbox",
      "0008_sqlite_checks_triggers_indexes",
    ]) {
      database.exec(await readFile(path.join(migrationRoot, name, "migration.sql"), "utf8"));
    }
    const beforeTables = (database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
    const beforeColumns = database.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    database.exec(await readG2OverlayMigrationSql(migrationRoot));
    const afterTables = (database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
    const afterColumns = database.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(afterTables).toEqual(beforeTables);
    expect(afterColumns).toEqual(beforeColumns);
    assertG2OverlayInspectionV1(inspectG2OverlayV1(database));
    const indexSql = database
      .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'uq_g2_%' ORDER BY name")
      .all() as Array<{ name: string; sql: string }>;
    expect(indexSql).toEqual([
      {
        name: "uq_g2_story_versions_active_pending_chapter",
        sql: expect.stringContaining("WHERE \"status\" = 'pending_confirmation'"),
      },
      {
        name: "uq_g2_storyboard_versions_active_pending_chapter",
        sql: expect.stringContaining("WHERE \"status\" = 'pending_confirmation'"),
      },
    ]);
    database.close();
  });
});
