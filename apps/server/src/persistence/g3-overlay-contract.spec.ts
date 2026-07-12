import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertG3OverlayInspectionV1,
  assertG3OverlaySqlShapeV1,
  G3_OVERLAY_ERROR_TOKEN,
  G3_OVERLAY_TRIGGER_NAME,
  inspectG3OverlayV1,
  readG3OverlayMigrationSql,
} from "./g3-overlay-contract.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");

describe("G3 comic format immutable overlay contract", () => {
  it("keeps the hand-written overlay at one trigger with no schema mutation", async () => {
    const sql = await readG3OverlayMigrationSql(migrationRoot);
    assertG3OverlaySqlShapeV1(sql);
    expect(sql).toContain(G3_OVERLAY_ERROR_TOKEN);
    expect(sql).not.toMatch(/\bWHEN\b/);
  });

  it("adds only the immutable trigger on top of the fresh G1 and G2 schema", async () => {
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
    ]) {
      database.exec(await readFile(path.join(migrationRoot, name, "migration.sql"), "utf8"));
    }
    const before = inspectG3OverlayV1(database);
    database.exec(await readG3OverlayMigrationSql(migrationRoot));
    const after = inspectG3OverlayV1(database);
    assertG3OverlayInspectionV1(before, after);
    expect(after.triggers).toContain(G3_OVERLAY_TRIGGER_NAME);

    database.exec(
      "INSERT INTO \"projects\" (\"id\", \"name\", \"type\", \"genre_tags\", \"comic_format\", \"art_style\", \"created_at\", \"updated_at\") VALUES ('g3-project', 'G3', 'comic', '[]', 'vertical_scroll', 'comic_style', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z')",
    );
    expect(() =>
      database.exec(
        "UPDATE \"projects\" SET \"comic_format\" = 'paged_comic' WHERE \"id\" = 'g3-project'",
      ),
    ).toThrow(G3_OVERLAY_ERROR_TOKEN);
    expect(
      (
        database
          .prepare('SELECT comic_format FROM "projects" WHERE id = ?')
          .get("g3-project") as { comic_format: string }
      ).comic_format,
    ).toBe("vertical_scroll");
    database.close();
  });
});
