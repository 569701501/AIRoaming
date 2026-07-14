import { readFile } from "node:fs/promises";
import path from "node:path";

export const G5_LAYOUT_BINDING_DIGEST_MIGRATION_NAME =
  "0014_g5_layout_binding_source_digest" as const;

export async function readG5LayoutBindingDigestSql(migrationRoot: string): Promise<string> {
  return readFile(
    path.join(migrationRoot, G5_LAYOUT_BINDING_DIGEST_MIGRATION_NAME, "migration.sql"),
    "utf8",
  );
}

export function assertG5LayoutBindingDigestSqlShape(sql: string): void {
  if (/CREATE TABLE|ALTER TABLE|DROP TABLE|ADD COLUMN|PRAGMA\s+writable_schema/i.test(sql)) {
    throw new Error("G5_LAYOUT_BINDING_DIGEST_SCHEMA_MUTATION_FORBIDDEN");
  }
  if ((sql.match(/DROP TRIGGER /g) ?? []).length !== 1 || (sql.match(/CREATE TRIGGER /g) ?? []).length !== 1) {
    throw new Error("G5_LAYOUT_BINDING_DIGEST_TRIGGER_COUNT_INVALID");
  }
  for (const required of [
    'DROP TRIGGER "trg_layout_source_bindings_scope_insert"',
    'CREATE TRIGGER "trg_layout_source_bindings_scope_insert"',
    'revision."binding_set_sealed_at" IS NULL',
    'asset."status" = \'ready\'',
    'asset."sha256" IS NOT NULL',
  ]) {
    if (!sql.includes(required)) throw new Error("G5_LAYOUT_BINDING_DIGEST_REQUIRED_GUARD_MISSING");
  }
  if (/asset\."sha256"\s+IS\s+NEW\."source_digest"/i.test(sql)) {
    throw new Error("G5_LAYOUT_BINDING_DIGEST_COMPOSITE_DIGEST_MISUSED");
  }
}
