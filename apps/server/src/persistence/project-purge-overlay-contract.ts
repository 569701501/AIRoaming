import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_PURGE_OVERLAY_MIGRATION_NAME =
  "0011_g2_project_purge_pointer_teardown" as const;

export const PROJECT_PURGE_REPLACED_TRIGGER_NAMES = [
  "trg_chapters_pointer_scope_update",
  "trg_g2_chapters_current_source_update",
] as const;

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
  PROJECT_PURGE_OVERLAY_MIGRATION_NAME,
  "migration.sql",
);

export async function readProjectPurgeOverlaySql(
  migrationRoot = path.dirname(path.dirname(migrationPath)),
): Promise<string> {
  return readFile(
    path.join(
      migrationRoot,
      PROJECT_PURGE_OVERLAY_MIGRATION_NAME,
      "migration.sql",
    ),
    "utf8",
  );
}

export function assertProjectPurgeOverlaySqlShape(sql: string): void {
  if ((sql.match(/CREATE TABLE /g) ?? []).length !== 0) {
    throw new Error("PROJECT_PURGE_OVERLAY_TABLE_COUNT_INVALID");
  }
  if ((sql.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length !== 0) {
    throw new Error("PROJECT_PURGE_OVERLAY_INDEX_COUNT_INVALID");
  }
  if ((sql.match(/DROP TRIGGER /g) ?? []).length !== 2) {
    throw new Error("PROJECT_PURGE_OVERLAY_DROP_TRIGGER_COUNT_INVALID");
  }
  if ((sql.match(/CREATE TRIGGER /g) ?? []).length !== 2) {
    throw new Error("PROJECT_PURGE_OVERLAY_CREATE_TRIGGER_COUNT_INVALID");
  }
  for (const name of PROJECT_PURGE_REPLACED_TRIGGER_NAMES) {
    if (!sql.includes(`DROP TRIGGER "${name}"`)) {
      throw new Error(`PROJECT_PURGE_OVERLAY_DROP_TRIGGER_MISSING:${name}`);
    }
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) {
      throw new Error(`PROJECT_PURGE_OVERLAY_CREATE_TRIGGER_MISSING:${name}`);
    }
  }
  for (const required of [
    'purge_project."lifecycle_status" = \'deleting\'',
    'purge_event."event_type" = \'project.delete_files\'',
    'purge_event."status" = \'processed\'',
    'purge_task."status" IN (\'queued\', \'running\', \'retrying\')',
  ]) {
    if (!sql.includes(required)) {
      throw new Error("PROJECT_PURGE_OVERLAY_THREE_FACT_GUARD_MISSING");
    }
  }
}
