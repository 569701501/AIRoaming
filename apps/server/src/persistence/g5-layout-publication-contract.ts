import { readFile } from "node:fs/promises";
import path from "node:path";

export const G5_LAYOUT_PUBLICATION_MIGRATION_NAME =
  "0015_g5_layout_publication_overlay" as const;

export const G5_LAYOUT_PUBLICATION_TRIGGER_NAMES = [
  "trg_g5_layout_publications_runtime_insert",
  "trg_g5_layout_publication_task_claim",
  "trg_g5_layout_publication_artifacts_insert",
  "trg_g5_layout_publications_ready_update",
  "trg_g5_layout_publication_attempt_finish",
] as const;

export async function readG5LayoutPublicationSql(migrationRoot: string): Promise<string> {
  return readFile(path.join(migrationRoot, G5_LAYOUT_PUBLICATION_MIGRATION_NAME, "migration.sql"), "utf8");
}

export function assertG5LayoutPublicationSqlShape(sql: string): void {
  if (/CREATE TABLE|ALTER TABLE|DROP TABLE|ADD COLUMN|PRAGMA\s+writable_schema/i.test(sql)) {
    throw new Error("G5_LAYOUT_PUBLICATION_SCHEMA_MUTATION_FORBIDDEN");
  }
  if ((sql.match(/CREATE TRIGGER /g) ?? []).length !== G5_LAYOUT_PUBLICATION_TRIGGER_NAMES.length) {
    throw new Error("G5_LAYOUT_PUBLICATION_TRIGGER_COUNT_INVALID");
  }
  for (const name of G5_LAYOUT_PUBLICATION_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) throw new Error(`G5_LAYOUT_PUBLICATION_TRIGGER_MISSING:${name}`);
  }
  for (const required of [
    "layout_publication_manifest_v1",
    "layout-render",
    "publication_manifest",
    "task.\"target_type\" = 'export'",
    "publication.\"status\" = 'rendering'",
    "asset.\"status\" <> 'ready'",
  ]) {
    if (!sql.includes(required)) throw new Error("G5_LAYOUT_PUBLICATION_REQUIRED_GUARD_MISSING");
  }
}
