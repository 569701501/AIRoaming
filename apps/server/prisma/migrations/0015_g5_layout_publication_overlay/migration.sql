-- G5-M7 layout publication forward-only overlay.
-- Tables and columns are already sealed by G1.  These guards bind the
-- runtime layout_export task, immutable LayoutRevision and publication
-- artifacts into one exact state machine without rebuilding any table.

CREATE TRIGGER "trg_g5_layout_publications_runtime_insert"
BEFORE INSERT ON "export_revisions"
WHEN NEW."kind" = 'layout_publication' AND NEW."origin" = 'runtime' AND NEW."task_id" IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_RUNTIME_INSERT_INVALID')
  WHERE NEW."chapter_id" IS NULL
    OR NEW."scope_key" IS NOT ('chapter:' || NEW."chapter_id")
    OR NEW."status" <> 'queued'
    OR NEW."task_id" IS NULL
    OR NEW."layout_revision_id" IS NULL
    OR NEW."source_lock_set_digest" IS NULL
    OR NEW."profile_schema_version" <> 1
    OR NEW."profile_json" IS NULL
    OR json_valid(NEW."profile_json") <> 1
    OR json_extract(NEW."profile_json", '$.schemaVersion') <> 1
    OR NEW."profile_digest" IS NULL
    OR NEW."preflight_digest" IS NULL
    OR NEW."renderer_version" IS NULL
    OR NEW."manifest_json" IS NOT NULL
    OR NEW."manifest_schema_version" IS NOT NULL
    OR NEW."manifest_digest" IS NOT NULL
    OR NEW."completion_applicability" IS NOT NULL
    OR NEW."ready_at" IS NOT NULL
    OR NEW."failed_at" IS NOT NULL
    OR NEW."cancelled_at" IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "chapters" AS chapter
      JOIN "projects" AS project ON project."id" = chapter."project_id"
      JOIN "layout_revisions" AS revision ON revision."id" = NEW."layout_revision_id"
      WHERE chapter."id" = NEW."chapter_id"
        AND chapter."project_id" = NEW."project_id"
        AND chapter."current_layout_revision_id" = revision."id"
        AND project."lifecycle_status" = 'active'
        AND revision."project_id" = NEW."project_id"
        AND revision."chapter_id" = NEW."chapter_id"
        AND revision."binding_set_sealed_at" IS NOT NULL
        AND revision."source_lock_set_digest" IS NEW."source_lock_set_digest"
        AND (
          (project."comic_format" = 'paged_comic' AND json_extract(NEW."profile_json", '$.kind') = 'paged_publication')
          OR
          (project."comic_format" = 'vertical_scroll' AND json_extract(NEW."profile_json", '$.kind') = 'vertical_publication')
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM "generation_tasks" AS task
      WHERE task."id" = NEW."task_id"
        AND task."project_id" = NEW."project_id"
        AND task."chapter_id" = NEW."chapter_id"
        AND task."type" = 'layout_export'
        AND task."record_kind" = 'runtime'
        AND task."provenance_status" = 'complete'
        AND task."status" = 'queued'
        AND task."target_type" = 'export'
        AND task."target_id" = NEW."id"
        AND task."source_set_sealed_at" IS NOT NULL
        AND task."concurrency_key" = 'layout-render'
        AND task."max_attempts" = 2
        AND json_valid(task."input_json") = 1
        AND json_extract(task."input_json", '$.schemaVersion') = 1
        AND json_extract(task."input_json", '$.exportRevisionId') IS NEW."id"
        AND json_extract(task."input_json", '$.layoutRevisionId') IS NEW."layout_revision_id"
        AND json_extract(task."input_json", '$.sourceLockSetDigest') IS NEW."source_lock_set_digest"
        AND json_extract(task."input_json", '$.profileDigest') IS NEW."profile_digest"
        AND json_extract(task."input_json", '$.preflightDigest') IS NEW."preflight_digest"
        AND json_extract(task."input_json", '$.renderer.rendererVersion') IS NEW."renderer_version"
    );
END;

CREATE TRIGGER "trg_g5_layout_publication_task_claim"
BEFORE UPDATE OF "status" ON "generation_tasks"
WHEN NEW."type" = 'layout_export'
  AND NEW."target_type" = 'export'
  AND NEW."status" = 'running'
  AND NEW."status" IS NOT OLD."status"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_TASK_CLAIM_INVALID')
  WHERE NOT EXISTS (
    SELECT 1
    FROM "export_revisions" AS publication
    WHERE publication."id" = NEW."target_id"
      AND publication."task_id" = NEW."id"
      AND publication."project_id" = NEW."project_id"
      AND publication."chapter_id" = NEW."chapter_id"
      AND publication."kind" = 'layout_publication'
      AND (
        (OLD."status" = 'queued' AND publication."status" = 'queued')
        OR
        (OLD."status" = 'retrying' AND publication."status" = 'rendering')
      )
  );
END;

CREATE TRIGGER "trg_g5_layout_publication_artifacts_insert"
BEFORE INSERT ON "export_artifacts"
WHEN EXISTS (
  SELECT 1 FROM "export_revisions" AS publication
  WHERE publication."id" = NEW."export_revision_id"
    AND publication."kind" = 'layout_publication'
    AND publication."task_id" IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_ARTIFACT_INVALID')
  WHERE NEW."order" < 1
    OR NEW."role" NOT IN ('page_png', 'document_pdf', 'strip_slice_png', 'long_png', 'publication_manifest')
    OR NOT EXISTS (
      SELECT 1
      FROM "export_revisions" AS publication
      JOIN "assets" AS asset ON asset."id" = NEW."asset_id"
      WHERE publication."id" = NEW."export_revision_id"
        AND publication."kind" = 'layout_publication'
        AND publication."status" = 'rendering'
        AND asset."project_id" = publication."project_id"
        AND asset."chapter_id" = publication."chapter_id"
        AND asset."source_task_id" = publication."task_id"
        AND asset."role" = 'layout_publication'
        AND asset."status" IN ('staged', 'ready')
        AND (
          (NEW."role" IN ('page_png', 'strip_slice_png', 'long_png') AND asset."type" = 'image' AND asset."mime_type" = 'image/png')
          OR
          (NEW."role" = 'document_pdf' AND asset."type" = 'document' AND asset."mime_type" = 'application/pdf')
          OR
          (NEW."role" = 'publication_manifest' AND NEW."order" = 1 AND asset."type" = 'document' AND asset."mime_type" = 'application/json')
        )
    );
END;

CREATE TRIGGER "trg_g5_layout_publications_ready_update"
BEFORE UPDATE OF "status" ON "export_revisions"
WHEN NEW."kind" = 'layout_publication'
  AND NEW."task_id" IS NOT NULL
  AND OLD."status" = 'rendering'
  AND NEW."status" = 'ready'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_READY_INVALID')
  WHERE NEW."manifest_json" IS NULL
    OR json_valid(NEW."manifest_json") <> 1
    OR json_extract(NEW."manifest_json", '$.schemaVersion') <> 1
    OR json_extract(NEW."manifest_json", '$.kind') <> 'layout_publication_manifest_v1'
    OR json_extract(NEW."manifest_json", '$.exportRevisionId') IS NOT NEW."id"
    OR json_extract(NEW."manifest_json", '$.layoutRevisionId') IS NOT NEW."layout_revision_id"
    OR json_extract(NEW."manifest_json", '$.sourceLockSetDigest') IS NOT NEW."source_lock_set_digest"
    OR json_extract(NEW."manifest_json", '$.profileDigest') IS NOT NEW."profile_digest"
    OR NEW."manifest_schema_version" <> 1
    OR NEW."manifest_digest" IS NULL
    OR NEW."completion_applicability" NOT IN ('current', 'historical')
    OR NEW."ready_at" IS NULL
    OR NEW."failed_at" IS NOT NULL
    OR NEW."cancelled_at" IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM "generation_tasks" AS task
      WHERE task."id" = NEW."task_id"
        AND task."status" = 'running'
        AND task."target_type" = 'export'
        AND task."target_id" = NEW."id"
    )
    OR (SELECT COUNT(*) FROM "export_artifacts" WHERE "export_revision_id" = NEW."id") < 2
    OR (SELECT COUNT(*) FROM "export_artifacts" WHERE "export_revision_id" = NEW."id" AND "role" = 'publication_manifest') <> 1
    OR EXISTS (
      SELECT 1
      FROM "export_artifacts" AS artifact
      JOIN "assets" AS asset ON asset."id" = artifact."asset_id"
      WHERE artifact."export_revision_id" = NEW."id"
        AND (
          asset."status" <> 'ready'
          OR asset."sha256" IS NULL
          OR asset."bytes" IS NULL
          OR asset."storage_key" NOT LIKE ('projects/' || NEW."project_id" || '/chapters/%/exports/' || NEW."id" || '/%')
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM "export_artifacts" AS artifact
      JOIN "assets" AS asset ON asset."id" = artifact."asset_id"
      WHERE artifact."export_revision_id" = NEW."id"
        AND artifact."role" = 'publication_manifest'
        AND asset."sha256" = NEW."manifest_digest"
    )
    OR (
      json_extract(NEW."profile_json", '$.kind') = 'paged_publication'
      AND (
        NOT EXISTS (SELECT 1 FROM "export_artifacts" WHERE "export_revision_id" = NEW."id" AND "role" = 'page_png')
        OR EXISTS (SELECT 1 FROM "export_artifacts" WHERE "export_revision_id" = NEW."id" AND "role" IN ('strip_slice_png', 'long_png'))
      )
    )
    OR (
      json_extract(NEW."profile_json", '$.kind') = 'vertical_publication'
      AND (
        NOT EXISTS (SELECT 1 FROM "export_artifacts" WHERE "export_revision_id" = NEW."id" AND "role" = 'strip_slice_png')
        OR EXISTS (SELECT 1 FROM "export_artifacts" WHERE "export_revision_id" = NEW."id" AND "role" IN ('page_png', 'document_pdf'))
      )
    );
END;

CREATE TRIGGER "trg_g5_layout_publication_attempt_finish"
BEFORE UPDATE OF "finished_at" ON "task_attempts"
WHEN OLD."finished_at" IS NULL
  AND NEW."finished_at" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "generation_tasks" AS task
    WHERE task."id" = NEW."task_id"
      AND task."type" = 'layout_export'
      AND task."target_type" = 'export'
  )
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_TASK_TERMINAL_MISMATCH')
  WHERE NOT EXISTS (
    SELECT 1
    FROM "generation_tasks" AS task
    JOIN "export_revisions" AS publication
      ON publication."id" = task."target_id"
     AND publication."task_id" = task."id"
    WHERE task."id" = NEW."task_id"
      AND publication."kind" = 'layout_publication'
      AND (
        (NEW."outcome" = 'succeeded' AND publication."status" = 'ready')
        OR
        (NEW."outcome" = 'cancelled' AND publication."status" = 'cancelled')
        OR
        (NEW."outcome" IN ('failed', 'interrupted') AND task."attempt" < task."max_attempts" AND task."next_run_at" IS NOT NULL AND task."next_run_at" > NEW."finished_at" AND publication."status" = 'rendering')
        OR
        (NEW."outcome" IN ('failed', 'interrupted') AND NOT (task."attempt" < task."max_attempts" AND task."next_run_at" IS NOT NULL AND task."next_run_at" > NEW."finished_at") AND publication."status" = 'failed')
      )
  );
END;
