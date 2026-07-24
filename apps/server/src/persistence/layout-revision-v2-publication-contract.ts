import { readFile } from "node:fs/promises";
import path from "node:path";

export const LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME =
  "0019_layout_revision_v2_publication" as const;

export const LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_NAMES = [
  "trg_layout_revisions_scope_insert",
  "trg_layout_revisions_binding_set_seal",
  "trg_layout_revisions_immutable_update",
  "trg_g5_layout_publications_runtime_insert",
  "trg_g5_layout_publications_ready_update",
  "trg_export_revisions_ready_immutable_update",
  "trg_export_revisions_runtime_source_immutable_update",
] as const;

export async function readLayoutRevisionV2PublicationSql(
  migrationRoot: string,
): Promise<string> {
  return readFile(
    path.join(
      migrationRoot,
      LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME,
      "migration.sql",
    ),
    "utf8",
  );
}

export function assertLayoutRevisionV2PublicationSqlShape(sql: string): void {
  for (const required of [
    'ADD COLUMN "visible_document_digest"',
    'ADD COLUMN "revision_document_digest"',
    "'layout_document_v1', 'layout_document_v2'",
    "$.automation.dialogueBindings",
    "$.automation.protections",
    "layout_publication_task_v2",
    "layout_publication_manifest_v2",
    "$.revisionDocumentDigest",
    "$.visibleDocumentDigest",
  ]) {
    if (!sql.includes(required)) {
      throw new Error(`LAYOUT_REVISION_V2_PUBLICATION_GUARD_MISSING:${required}`);
    }
  }
  for (const trigger of LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${trigger}"`)) {
      throw new Error(`LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_MISSING:${trigger}`);
    }
  }
}
