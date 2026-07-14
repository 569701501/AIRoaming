-- G5 Layout/Working Copy forward-only overlay.
-- G1 already owns every column and base CHECK/FK. This migration adds only
-- the missing V1 autosave, linear revision and publication transition guards.

CREATE UNIQUE INDEX "uq_g5_layout_revisions_previous_nonnull"
ON "layout_revisions" ("previous_revision_id" ASC)
WHERE "previous_revision_id" IS NOT NULL;

CREATE TRIGGER "trg_g5_layout_working_copies_v1_insert"
BEFORE INSERT ON "layout_working_copies"
WHEN NEW."document_kind" = 'layout_document_v1'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_V1_INVALID')
  WHERE NEW."schema_version" <> 1
    OR NEW."row_version" <> 0
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
    );
END;

CREATE TRIGGER "trg_g5_layout_working_copies_v1_update"
BEFORE UPDATE ON "layout_working_copies"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_IDENTITY_IMMUTABLE')
  WHERE NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."document_kind" IS NOT OLD."document_kind"
    OR NEW."schema_version" IS NOT OLD."schema_version"
    OR NEW."created_at" IS NOT OLD."created_at";

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
      NEW."document_json" IS NOT OLD."document_json"
      OR NEW."document_digest" IS NOT OLD."document_digest"
      OR NEW."source_lock_set_digest" IS NOT OLD."source_lock_set_digest"
      OR NEW."based_on_revision_id" IS NOT OLD."based_on_revision_id"
    )
    AND NOT (
      NEW."row_version" = OLD."row_version" + 1
      AND NEW."updated_at" IS NOT OLD."updated_at"
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_NOOP_MUTATION')
  WHERE NEW."document_json" IS OLD."document_json"
    AND NEW."document_digest" IS OLD."document_digest"
    AND NEW."source_lock_set_digest" IS OLD."source_lock_set_digest"
    AND NEW."based_on_revision_id" IS OLD."based_on_revision_id"
    AND (
      NEW."row_version" IS NOT OLD."row_version"
      OR NEW."updated_at" IS NOT OLD."updated_at"
    );
END;

CREATE TRIGGER "trg_g5_layout_revisions_linear_insert"
BEFORE INSERT ON "layout_revisions"
WHEN NEW."origin" = 'runtime'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_REVISION_LINEAR_HISTORY')
  WHERE (
    NEW."previous_revision_id" IS NULL
    AND NOT (
      NEW."revision" = 1
      AND EXISTS (
        SELECT 1
        FROM "chapters" AS chapter
        WHERE chapter."id" = NEW."chapter_id"
          AND chapter."project_id" = NEW."project_id"
          AND chapter."current_layout_revision_id" IS NULL
      )
    )
  )
  OR (
    NEW."previous_revision_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "layout_revisions" AS previous_revision
      JOIN "chapters" AS chapter
        ON chapter."id" = NEW."chapter_id"
       AND chapter."project_id" = NEW."project_id"
      WHERE previous_revision."id" = NEW."previous_revision_id"
        AND previous_revision."project_id" = NEW."project_id"
        AND previous_revision."chapter_id" = NEW."chapter_id"
        AND previous_revision."binding_set_sealed_at" IS NOT NULL
        AND chapter."current_layout_revision_id" = previous_revision."id"
        AND NEW."revision" = previous_revision."revision" + 1
    )
  );
END;

CREATE TRIGGER "trg_g5_chapters_current_layout_cas_update"
BEFORE UPDATE OF "current_layout_revision_id" ON "chapters"
WHEN NEW."current_layout_revision_id" IS NOT OLD."current_layout_revision_id"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_CURRENT_CAS')
  WHERE NEW."current_layout_revision_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "layout_revisions" AS revision
      WHERE revision."id" = NEW."current_layout_revision_id"
        AND revision."project_id" = NEW."project_id"
        AND revision."chapter_id" = NEW."id"
        AND revision."binding_set_sealed_at" IS NOT NULL
        AND (
          revision."origin" = 'legacy_import'
          OR revision."previous_revision_id" IS OLD."current_layout_revision_id"
        )
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_CURRENT_CLEAR_FORBIDDEN')
  WHERE NEW."current_layout_revision_id" IS NULL
    AND NOT (
      EXISTS (
        SELECT 1 FROM "projects" AS purge_project
        WHERE purge_project."id" = NEW."project_id"
          AND purge_project."lifecycle_status" = 'deleting'
      )
      AND EXISTS (
        SELECT 1 FROM "outbox_events" AS purge_event
        WHERE purge_event."event_type" = 'project.delete_files'
          AND purge_event."aggregate_type" = 'project'
          AND purge_event."aggregate_id" = NEW."project_id"
          AND purge_event."status" = 'processed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "generation_tasks" AS purge_task
        WHERE purge_task."project_id" = NEW."project_id"
          AND purge_task."record_kind" = 'runtime'
          AND purge_task."status" IN ('queued', 'running', 'retrying')
      )
    );
END;

CREATE TRIGGER "trg_g5_export_revisions_state_update"
BEFORE UPDATE OF "status" ON "export_revisions"
WHEN NEW."kind" = 'layout_publication'
  AND NEW."status" IS NOT OLD."status"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_STATE_INVALID')
  WHERE NOT (
    (OLD."status" = 'queued' AND NEW."status" IN ('rendering', 'failed', 'cancelled'))
    OR (OLD."status" = 'rendering' AND NEW."status" IN ('ready', 'failed', 'cancelled'))
  );
END;

CREATE TRIGGER "trg_g5_chapters_current_export_ready_update"
BEFORE UPDATE OF "current_export_revision_id" ON "chapters"
WHEN NEW."current_export_revision_id" IS NOT OLD."current_export_revision_id"
  AND NEW."current_export_revision_id" IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:CURRENT_EXPORT_NOT_READY')
  WHERE NOT EXISTS (
    SELECT 1
    FROM "export_revisions" AS publication
    WHERE publication."id" = NEW."current_export_revision_id"
      AND publication."project_id" = NEW."project_id"
      AND publication."chapter_id" = NEW."id"
      AND publication."status" = 'ready'
      AND publication."layout_revision_id" = NEW."current_layout_revision_id"
  );
END;
