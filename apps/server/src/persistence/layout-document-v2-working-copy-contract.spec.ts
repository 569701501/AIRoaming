import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertLayoutDocumentV2WorkingCopySqlShape,
  LAYOUT_COMPOSITION_APPLICATION_TRIGGER_NAMES,
  LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME,
  LAYOUT_DOCUMENT_V2_WORKING_COPY_TRIGGER_NAMES,
  readLayoutDocumentV2WorkingCopySql,
} from "./layout-document-v2-working-copy-contract.js";
import { SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES } from "./script-workflow-runtime-migration-ledger.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");
const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const timestamp = "2026-07-23T00:00:00.000Z";

function seedScope(database: DatabaseSync): void {
  database.prepare(`
    INSERT INTO "projects"
      ("id", "name", "type", "lifecycle_status", "genre_tags", "comic_format", "row_version", "updated_at")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run("project_v2", "V2 漫画", "comic", "active", "[]", "vertical_scroll", 0, timestamp);
  database.prepare(`
    INSERT INTO "chapters"
      ("id", "project_id", "slug", "order", "title", "milestone_status",
       "script_working_text", "script_working_digest", "script_working_state",
       "row_version", "updated_at")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "chapter_v2",
    "project_v2",
    "chapter-v2",
    1,
    "第一章",
    "draft",
    "",
    digestA,
    "empty",
    0,
    timestamp,
  );
}

function visibleDocument(schemaVersion: 1 | 2): Record<string, unknown> {
  return {
    schemaVersion,
    kind: schemaVersion === 1 ? "layout_document_v1" : "layout_document_v2",
    projectId: "project_v2",
    chapterId: "chapter_v2",
    comicFormat: "vertical_scroll",
    profile: { kind: "vertical_strip" },
    fontPolicy: {},
    canvases: [],
    ...(schemaVersion === 2
      ? { automation: { policyVersion: "layout_automation_v1" } }
      : {}),
  };
}

describe("LayoutDocumentV2 Working Copy migration", () => {
  it("preserves V1 rows, permits one-way V1→V2 CAS, and rejects downgrade", async () => {
    const sql = await readLayoutDocumentV2WorkingCopySql(migrationRoot);
    expect(LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME)
      .toBe("0018_layout_document_v2_working_copy");
    assertLayoutDocumentV2WorkingCopySqlShape(sql);

    const database: DatabaseSync = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    for (const migrationName of SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES.slice(0, -1)) {
      database.exec(
        await readFile(
          path.join(migrationRoot, migrationName, "migration.sql"),
          "utf8",
        ),
      );
    }
    seedScope(database);
    database.prepare(`
      INSERT INTO "layout_working_copies"
        ("id", "project_id", "chapter_id", "document_kind", "document_json",
         "schema_version", "document_digest", "row_version", "updated_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "working_copy_v2",
      "project_v2",
      "chapter_v2",
      "layout_document_v1",
      JSON.stringify(visibleDocument(1)),
      1,
      digestA,
      0,
      timestamp,
    );
    const before = database.prepare(
      'SELECT * FROM "layout_working_copies" WHERE "id" = ?',
    ).get("working_copy_v2");

    database.exec(sql);
    expect(
      database.prepare(
        'SELECT * FROM "layout_working_copies" WHERE "id" = ?',
      ).get("working_copy_v2"),
    ).toEqual(before);
    expect(
      database.prepare(`
        SELECT "name"
        FROM "sqlite_master"
        WHERE "type" = 'trigger' AND "tbl_name" = 'layout_working_copies'
        ORDER BY "name"
      `).all().map((row) => String(row.name)),
    ).toEqual([...LAYOUT_DOCUMENT_V2_WORKING_COPY_TRIGGER_NAMES].sort());
    expect(
      database.prepare(`
        SELECT "name"
        FROM "sqlite_master"
        WHERE "type" = 'trigger' AND "tbl_name" = 'layout_composition_applications'
        ORDER BY "name"
      `).all().map((row) => String(row.name)),
    ).toEqual([...LAYOUT_COMPOSITION_APPLICATION_TRIGGER_NAMES].sort());

    expect(() => database.prepare(`
      UPDATE "layout_working_copies"
      SET "document_kind" = ?,
          "document_json" = ?,
          "schema_version" = ?,
          "document_digest" = ?,
          "row_version" = "row_version" + 1,
          "updated_at" = ?
      WHERE "id" = ?
    `).run(
      "layout_document_v2",
      JSON.stringify(visibleDocument(2)),
      2,
      digestB,
      "2026-07-23T00:01:00.000Z",
      "working_copy_v2",
    )).not.toThrow();
    expect(
      database.prepare(`
        SELECT "document_kind", "schema_version", "row_version"
        FROM "layout_working_copies"
        WHERE "id" = ?
      `).get("working_copy_v2"),
    ).toEqual({
      document_kind: "layout_document_v2",
      schema_version: 2,
      row_version: 1,
    });

    expect(() => database.prepare(`
      UPDATE "layout_working_copies"
      SET "document_kind" = ?,
          "document_json" = ?,
          "schema_version" = ?,
          "document_digest" = ?,
          "row_version" = "row_version" + 1,
          "updated_at" = ?
      WHERE "id" = ?
    `).run(
      "layout_document_v1",
      JSON.stringify(visibleDocument(1)),
      1,
      digestA,
      "2026-07-23T00:02:00.000Z",
      "working_copy_v2",
    )).toThrow(/LAYOUT_WORKING_COPY_IDENTITY_IMMUTABLE/);
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });
});
