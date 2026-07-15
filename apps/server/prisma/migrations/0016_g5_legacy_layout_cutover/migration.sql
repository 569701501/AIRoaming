-- G5-M8 forward-only legacy LayoutWorkingCopy cutover.
-- Replaces only the existing update trigger so a verified legacy row can move once
-- to LayoutDocument V1. V1 -> legacy and all other identity mutations remain closed.

DROP TRIGGER "trg_g5_layout_working_copies_v1_update";

CREATE TRIGGER "trg_g5_layout_working_copies_v1_update"
BEFORE UPDATE ON "layout_working_copies"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_IDENTITY_IMMUTABLE')
  WHERE NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."schema_version" IS NOT OLD."schema_version"
    OR NEW."created_at" IS NOT OLD."created_at"
    OR (
      NEW."document_kind" IS NOT OLD."document_kind"
      AND NOT (
        OLD."document_kind" = 'legacy_chapter_layout_v1'
        AND NEW."document_kind" = 'layout_document_v1'
      )
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_V1_INVALID')
  WHERE NEW."document_kind" = 'layout_document_v1'
    AND (
      NEW."schema_version" <> 1
      OR json_valid(NEW."document_json") <> 1
      OR json_extract(NEW."document_json", '$.schemaVersion') <> 1
      OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v1'
      OR json_extract(NEW."document_json", '$.projectId') IS NOT NEW."project_id"
      OR json_extract(NEW."document_json", '$.chapterId') IS NOT NEW."chapter_id"
      OR NOT EXISTS (
        SELECT 1
        FROM "projects" AS project
        WHERE project."id" = NEW."project_id"
          AND (
            (project."comic_format" = 'paged_comic'
              AND json_extract(NEW."document_json", '$.comicFormat') = 'paged_comic'
              AND json_extract(NEW."document_json", '$.profile.kind') = 'paged')
            OR
            (project."comic_format" = 'vertical_scroll'
              AND json_extract(NEW."document_json", '$.comicFormat') = 'vertical_scroll'
              AND json_extract(NEW."document_json", '$.profile.kind') = 'vertical_strip')
          )
      )
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_CAS_INVALID')
  WHERE (
      NEW."document_kind" IS NOT OLD."document_kind"
      OR NEW."document_json" IS NOT OLD."document_json"
      OR NEW."document_digest" IS NOT OLD."document_digest"
      OR NEW."source_lock_set_digest" IS NOT OLD."source_lock_set_digest"
      OR NEW."based_on_revision_id" IS NOT OLD."based_on_revision_id"
    )
    AND NOT (
      NEW."row_version" = OLD."row_version" + 1
      AND NEW."updated_at" IS NOT OLD."updated_at"
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_NOOP_MUTATION')
  WHERE NEW."document_kind" IS OLD."document_kind"
    AND NEW."document_json" IS OLD."document_json"
    AND NEW."document_digest" IS OLD."document_digest"
    AND NEW."source_lock_set_digest" IS OLD."source_lock_set_digest"
    AND NEW."based_on_revision_id" IS OLD."based_on_revision_id"
    AND (
      NEW."row_version" IS NOT OLD."row_version"
      OR NEW."updated_at" IS NOT OLD."updated_at"
    );
END;
