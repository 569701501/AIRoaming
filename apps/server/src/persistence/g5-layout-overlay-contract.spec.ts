import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertG5LayoutOverlaySqlShape,
  G5_LAYOUT_INDEX_NAMES,
  G5_LAYOUT_OVERLAY_MIGRATION_NAME,
  G5_LAYOUT_TRIGGER_NAMES,
  readG5LayoutOverlaySql,
} from "./g5-layout-overlay-contract.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");
const prior = [
  "0001_persistence_and_migration", "0002_project_chapter_script",
  "0003_story_storyboard_preflight", "0004_character_asset_candidate",
  "0005_dialogue_settings_secret_metadata", "0006_generation_task_worker",
  "0007_layout_export_outbox", "0008_sqlite_checks_triggers_indexes",
  "0009_g2_version_freshness_overlay", "0010_g3_comic_format_immutable",
  "0011_g2_project_purge_pointer_teardown", "0012_g4_candidate_lock_linear_history",
] as const;

describe("G5 layout database overlay", () => {
  it("is a forward-only overlay and deploys after the exact G4 release", async () => {
    expect(G5_LAYOUT_OVERLAY_MIGRATION_NAME).toBe("0013_g5_layout_working_copy_overlay");
    const sql = await readG5LayoutOverlaySql(migrationRoot);
    assertG5LayoutOverlaySqlShape(sql);
    const database = new DatabaseSync(":memory:");
    for (const name of prior) database.exec(await readFile(path.join(migrationRoot, name, "migration.sql"), "utf8"));
    database.exec(sql);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'uq_g5_%' ORDER BY name").all().map((row) => String(row.name))).toEqual([...G5_LAYOUT_INDEX_NAMES]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_g5_%' ORDER BY name").all().map((row) => String(row.name))).toEqual([...G5_LAYOUT_TRIGGER_NAMES].sort());
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });
});
