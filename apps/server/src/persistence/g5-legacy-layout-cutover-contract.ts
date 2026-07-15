import { readFile } from "node:fs/promises";
import path from "node:path";

export const G5_LEGACY_LAYOUT_CUTOVER_MIGRATION_NAME =
  "0016_g5_legacy_layout_cutover" as const;

export async function readG5LegacyLayoutCutoverSql(migrationRoot: string): Promise<string> {
  return readFile(path.join(migrationRoot, G5_LEGACY_LAYOUT_CUTOVER_MIGRATION_NAME, "migration.sql"), "utf8");
}

export function assertG5LegacyLayoutCutoverSqlShape(sql: string): void {
  if (/CREATE TABLE|ALTER TABLE|DROP TABLE|ADD COLUMN|PRAGMA\s+writable_schema/i.test(sql)) {
    throw new Error("G5_LEGACY_LAYOUT_CUTOVER_SCHEMA_MUTATION_FORBIDDEN");
  }
  for (const required of [
    'DROP TRIGGER "trg_g5_layout_working_copies_v1_update"',
    'CREATE TRIGGER "trg_g5_layout_working_copies_v1_update"',
    'OLD."document_kind" = \'legacy_chapter_layout_v1\'',
    'NEW."document_kind" = \'layout_document_v1\'',
    'NEW."row_version" = OLD."row_version" + 1',
  ]) {
    if (!sql.includes(required)) throw new Error("G5_LEGACY_LAYOUT_CUTOVER_GUARD_MISSING");
  }
}
