import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertProjectPurgeOverlaySqlShape,
  PROJECT_PURGE_REPLACED_TRIGGER_NAMES,
  readProjectPurgeOverlaySql,
} from "./project-purge-overlay-contract.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");

function inventory(database: DatabaseSync): Array<{
  type: string;
  name: string;
  sql: string | null;
}> {
  return database
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all() as Array<{ type: string; name: string; sql: string | null }>;
}

describe("project purge pointer teardown overlay", () => {
  it("replaces only the two pointer triggers and keeps the three-fact purge guard", async () => {
    const sql = await readProjectPurgeOverlaySql(migrationRoot);
    assertProjectPurgeOverlaySqlShape(sql);

    const database = new DatabaseSync(":memory:");
    for (const name of [
      "0001_persistence_and_migration",
      "0002_project_chapter_script",
      "0003_story_storyboard_preflight",
      "0004_character_asset_candidate",
      "0005_dialogue_settings_secret_metadata",
      "0006_generation_task_worker",
      "0007_layout_export_outbox",
      "0008_sqlite_checks_triggers_indexes",
      "0009_g2_version_freshness_overlay",
      "0010_g3_comic_format_immutable",
    ]) {
      database.exec(
        await readFile(
          path.join(migrationRoot, name, "migration.sql"),
          "utf8",
        ),
      );
    }

    const before = inventory(database);
    database.exec(sql);
    const after = inventory(database);
    expect(after.map(({ type, name }) => ({ type, name }))).toEqual(
      before.map(({ type, name }) => ({ type, name })),
    );
    for (const name of PROJECT_PURGE_REPLACED_TRIGGER_NAMES) {
      const beforeSql = before.find((row) => row.name === name)?.sql;
      const afterSql = after.find((row) => row.name === name)?.sql;
      expect(afterSql).not.toBe(beforeSql);
      expect(afterSql).toContain("project.delete_files");
    }
    database.close();
  });
});
