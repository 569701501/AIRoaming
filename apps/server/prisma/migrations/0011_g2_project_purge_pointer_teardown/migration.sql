-- Allow a coordinated project purge to detach Chapter reverse pointers before
-- immutable child rows are deleted. Ordinary business updates keep the exact
-- G1/G2 pointer, source, shape, and row-version guards.

DROP TRIGGER "trg_chapters_pointer_scope_update";

CREATE TRIGGER "trg_chapters_pointer_scope_update"
BEFORE UPDATE ON "chapters"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_pointer_scope_update')
  WHERE NOT (
    EXISTS (SELECT 1 FROM "projects" AS owner_project WHERE owner_project."id" = NEW."project_id")
    AND (NEW."current_script_version_id" IS NULL OR EXISTS (SELECT 1 FROM "chapter_script_versions" AS value WHERE value."id" = NEW."current_script_version_id" AND value."chapter_id" = NEW."id"))
    AND (NEW."current_story_version_id" IS NULL OR EXISTS (SELECT 1 FROM "story_versions" AS value WHERE value."id" = NEW."current_story_version_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id" AND value."status" = 'confirmed' AND value."source_script_version_id" IS NOT NULL AND value."source_policy_version" IS NOT NULL AND value."source_digest" IS NOT NULL))
    AND (NEW."pending_story_version_id" IS NULL OR EXISTS (SELECT 1 FROM "story_versions" AS value WHERE value."id" = NEW."pending_story_version_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id" AND value."status" = 'pending_confirmation'))
    AND (NEW."current_storyboard_version_id" IS NULL OR EXISTS (SELECT 1 FROM "storyboard_versions" AS value WHERE value."id" = NEW."current_storyboard_version_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id" AND value."status" = 'confirmed' AND value."source_story_version_id" IS NOT NULL AND value."source_policy_version" IS NOT NULL AND value."source_digest" IS NOT NULL))
    AND (NEW."pending_storyboard_version_id" IS NULL OR EXISTS (SELECT 1 FROM "storyboard_versions" AS value WHERE value."id" = NEW."pending_storyboard_version_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id" AND value."status" = 'pending_confirmation'))
    AND (NEW."current_preflight_revision_id" IS NULL OR EXISTS (SELECT 1 FROM "preflight_revisions" AS value WHERE value."id" = NEW."current_preflight_revision_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id" AND value."status" = 'confirmed' AND value."ready" = 1 AND value."source_storyboard_version_id" IS NOT NULL AND value."source_policy_version" IS NOT NULL AND value."source_digest" IS NOT NULL))
    AND (NEW."current_layout_revision_id" IS NULL OR EXISTS (SELECT 1 FROM "layout_revisions" AS value WHERE value."id" = NEW."current_layout_revision_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id" AND value."binding_set_sealed_at" IS NOT NULL AND NOT (json_extract(value."document_json", '$.kind') = 'legacy_chapter_layout_v1' AND json_extract(value."document_json", '$.sourceResolution') IS NOT 'complete')))
    AND (NEW."current_export_revision_id" IS NULL OR EXISTS (SELECT 1 FROM "export_revisions" AS value WHERE value."id" = NEW."current_export_revision_id" AND value."project_id" = NEW."project_id" AND value."chapter_id" = NEW."id"))
    AND (NEW."last_script_revision_id" IS NULL OR EXISTS (SELECT 1 FROM "chapter_script_revisions" AS value WHERE value."id" = NEW."last_script_revision_id" AND value."chapter_id" = NEW."id"))
  );

  SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_pointer_scope_update')
  WHERE (
    NEW."current_script_version_id" IS NOT OLD."current_script_version_id"
    OR NEW."current_story_version_id" IS NOT OLD."current_story_version_id"
    OR NEW."pending_story_version_id" IS NOT OLD."pending_story_version_id"
    OR NEW."current_storyboard_version_id" IS NOT OLD."current_storyboard_version_id"
    OR NEW."pending_storyboard_version_id" IS NOT OLD."pending_storyboard_version_id"
    OR NEW."current_preflight_revision_id" IS NOT OLD."current_preflight_revision_id"
    OR NEW."current_layout_revision_id" IS NOT OLD."current_layout_revision_id"
    OR NEW."current_export_revision_id" IS NOT OLD."current_export_revision_id"
    OR NEW."last_script_revision_id" IS NOT OLD."last_script_revision_id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "projects" AS owner_project
    WHERE owner_project."id" = NEW."project_id" AND owner_project."lifecycle_status" = 'active'
  )
  AND NOT (
    NEW."current_script_version_id" IS NULL
    AND NEW."current_story_version_id" IS NULL
    AND NEW."pending_story_version_id" IS NULL
    AND NEW."current_storyboard_version_id" IS NULL
    AND NEW."pending_storyboard_version_id" IS NULL
    AND NEW."current_preflight_revision_id" IS NULL
    AND NEW."current_layout_revision_id" IS NULL
    AND NEW."current_export_revision_id" IS NULL
    AND NEW."last_script_revision_id" IS NULL
    AND EXISTS (
      SELECT 1 FROM "projects" AS purge_project
      WHERE purge_project."id" = NEW."project_id" AND purge_project."lifecycle_status" = 'deleting'
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

DROP TRIGGER "trg_g2_chapters_current_source_update";

CREATE TRIGGER "trg_g2_chapters_current_source_update"
BEFORE UPDATE ON "chapters"
WHEN NEW."current_story_version_id" IS NOT OLD."current_story_version_id"
  OR NEW."current_storyboard_version_id" IS NOT OLD."current_storyboard_version_id"
  OR NEW."current_preflight_revision_id" IS NOT OLD."current_preflight_revision_id"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_chapters_current_source_update')
  WHERE NOT (
    NEW."current_script_version_id" IS NULL
    AND NEW."current_story_version_id" IS NULL
    AND NEW."pending_story_version_id" IS NULL
    AND NEW."current_storyboard_version_id" IS NULL
    AND NEW."pending_storyboard_version_id" IS NULL
    AND NEW."current_preflight_revision_id" IS NULL
    AND NEW."current_layout_revision_id" IS NULL
    AND NEW."current_export_revision_id" IS NULL
    AND NEW."last_script_revision_id" IS NULL
    AND EXISTS (
      SELECT 1 FROM "projects" AS purge_project
      WHERE purge_project."id" = NEW."project_id" AND purge_project."lifecycle_status" = 'deleting'
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
  )
  AND (
    (NEW."current_story_version_id" IS NOT OLD."current_story_version_id" AND NOT EXISTS (
      SELECT 1 FROM "story_versions" AS value
      WHERE value."id" = NEW."current_story_version_id"
        AND value."chapter_id" = NEW."id"
        AND value."project_id" = NEW."project_id"
        AND value."status" = 'confirmed'
        AND value."source_script_version_id" = NEW."current_script_version_id"
    ))
    OR (NEW."current_storyboard_version_id" IS NOT OLD."current_storyboard_version_id" AND NOT EXISTS (
      SELECT 1 FROM "storyboard_versions" AS value
      WHERE value."id" = NEW."current_storyboard_version_id"
        AND value."chapter_id" = NEW."id"
        AND value."project_id" = NEW."project_id"
        AND value."status" = 'confirmed'
        AND value."source_story_version_id" = NEW."current_story_version_id"
    ))
    OR (NEW."current_preflight_revision_id" IS NOT OLD."current_preflight_revision_id" AND NOT EXISTS (
      SELECT 1 FROM "preflight_revisions" AS value
      WHERE value."id" = NEW."current_preflight_revision_id"
        AND value."chapter_id" = NEW."id"
        AND value."project_id" = NEW."project_id"
        AND value."status" = 'confirmed'
        AND value."ready" = 1
        AND value."source_storyboard_version_id" = NEW."current_storyboard_version_id"
    ))
    OR NEW."pending_story_version_id" IS NOT NULL
    OR NEW."pending_storyboard_version_id" IS NOT NULL
    OR NEW."script_working_state" <> 'clean'
  );
END;
