import { readFile } from "node:fs/promises";
import path from "node:path";

export const LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME =
  "0018_layout_document_v2_working_copy" as const;

export const LAYOUT_DOCUMENT_V2_WORKING_COPY_TRIGGER_NAMES = [
  "trg_layout_working_copies_scope_insert",
  "trg_layout_working_copies_scope_update",
  "trg_g5_layout_working_copies_v1_insert",
  "trg_g5_layout_working_copies_v1_update",
] as const;

export const LAYOUT_COMPOSITION_APPLICATION_TRIGGER_NAMES = [
  "trg_layout_composition_applications_insert",
  "trg_layout_composition_applications_immutable_update",
] as const;

export async function readLayoutDocumentV2WorkingCopySql(
  migrationRoot: string,
): Promise<string> {
  return readFile(
    path.join(
      migrationRoot,
      LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME,
      "migration.sql",
    ),
    "utf8",
  );
}

export function assertLayoutDocumentV2WorkingCopySqlShape(sql: string): void {
  for (const required of [
    "'legacy_chapter_layout_v1', 'layout_document_v1', 'layout_document_v2'",
    "OLD.\"document_kind\" = 'layout_document_v1'",
    "NEW.\"document_kind\" = 'layout_document_v2'",
    "OLD.\"schema_version\" = 1",
    "NEW.\"schema_version\" = 2",
    "NEW.\"row_version\" = OLD.\"row_version\" + 1",
    "$.automation.policyVersion",
    "layout_automation_v1",
    'CREATE TABLE "layout_composition_applications"',
    "'initial_working_copy'",
    "'pending_command'",
    'task."type" = \'layout_compose\'',
  ]) {
    if (!sql.includes(required)) {
      throw new Error("LAYOUT_DOCUMENT_V2_WORKING_COPY_GUARD_MISSING");
    }
  }
  if (/OLD\."document_kind"\s*=\s*'layout_document_v2'[\s\S]*NEW\."document_kind"\s*=\s*'layout_document_v1'/i.test(sql)) {
    throw new Error("LAYOUT_DOCUMENT_V2_WORKING_COPY_DOWNGRADE_FORBIDDEN");
  }
  for (const name of LAYOUT_DOCUMENT_V2_WORKING_COPY_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) {
      throw new Error(`LAYOUT_DOCUMENT_V2_WORKING_COPY_TRIGGER_MISSING:${name}`);
    }
  }
  for (const name of LAYOUT_COMPOSITION_APPLICATION_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) {
      throw new Error(`LAYOUT_COMPOSITION_APPLICATION_TRIGGER_MISSING:${name}`);
    }
  }
}
