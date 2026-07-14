import { readFile } from "node:fs/promises";
import path from "node:path";

export const G5_LAYOUT_OVERLAY_MIGRATION_NAME =
  "0013_g5_layout_working_copy_overlay" as const;

export const G5_LAYOUT_INDEX_NAMES = [
  "uq_g5_layout_revisions_previous_nonnull",
] as const;

export const G5_LAYOUT_TRIGGER_NAMES = [
  "trg_g5_chapters_current_export_ready_update",
  "trg_g5_chapters_current_layout_cas_update",
  "trg_g5_export_revisions_state_update",
  "trg_g5_layout_revisions_linear_insert",
  "trg_g5_layout_working_copies_v1_insert",
  "trg_g5_layout_working_copies_v1_update",
] as const;

export async function readG5LayoutOverlaySql(migrationRoot: string): Promise<string> {
  return readFile(
    path.join(migrationRoot, G5_LAYOUT_OVERLAY_MIGRATION_NAME, "migration.sql"),
    "utf8",
  );
}

export function assertG5LayoutOverlaySqlShape(sql: string): void {
  if (/CREATE TABLE|ALTER TABLE|DROP TABLE|ADD COLUMN|PRAGMA\s+writable_schema/i.test(sql)) {
    throw new Error("G5_LAYOUT_OVERLAY_SCHEMA_MUTATION_FORBIDDEN");
  }
  if ((sql.match(/CREATE UNIQUE INDEX /g) ?? []).length !== G5_LAYOUT_INDEX_NAMES.length) {
    throw new Error("G5_LAYOUT_OVERLAY_INDEX_COUNT_INVALID");
  }
  if ((sql.match(/CREATE TRIGGER /g) ?? []).length !== G5_LAYOUT_TRIGGER_NAMES.length) {
    throw new Error("G5_LAYOUT_OVERLAY_TRIGGER_COUNT_INVALID");
  }
  for (const name of G5_LAYOUT_INDEX_NAMES) {
    if (!sql.includes(`CREATE UNIQUE INDEX "${name}"`)) {
      throw new Error(`G5_LAYOUT_OVERLAY_INDEX_MISSING:${name}`);
    }
  }
  for (const name of G5_LAYOUT_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) {
      throw new Error(`G5_LAYOUT_OVERLAY_TRIGGER_MISSING:${name}`);
    }
  }
  for (const required of [
    "layout_document_v1",
    "NEW.\"row_version\" = OLD.\"row_version\" + 1",
    "NEW.\"previous_revision_id\" IS NULL",
    "chapter.\"current_layout_revision_id\" = previous_revision.\"id\"",
    "OLD.\"status\" = 'queued'",
    "publication.\"status\" = 'ready'",
  ]) {
    if (!sql.includes(required)) {
      throw new Error("G5_LAYOUT_OVERLAY_REQUIRED_GUARD_MISSING");
    }
  }
}
