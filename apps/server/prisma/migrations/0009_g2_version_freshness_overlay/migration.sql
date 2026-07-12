-- G2-A1 version/freshness overlay.
-- This migration deliberately adds no table or column.  The preflight objects
-- are TEMP-only and are dropped before the migration returns.

CREATE UNIQUE INDEX "uq_g2_story_versions_active_pending_chapter"
  ON "story_versions" ("chapter_id")
  WHERE "status" = 'pending_confirmation';

CREATE UNIQUE INDEX "uq_g2_storyboard_versions_active_pending_chapter"
  ON "storyboard_versions" ("chapter_id")
  WHERE "status" = 'pending_confirmation';

-- A digest is a tagged lowercase SHA-256 string.  SQLite cannot calculate a
-- SHA-256 value, but it can enforce its shape and all relation invariants.

CREATE TRIGGER "trg_g2_chapters_script_working_shape_insert"
BEFORE INSERT ON "chapters"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_chapters_script_working_shape_insert')
  WHERE NOT (
    length(NEW."script_working_digest") = 71
    AND substr(NEW."script_working_digest", 1, 7) = 'sha256:'
    AND substr(NEW."script_working_digest", 8) = lower(substr(NEW."script_working_digest", 8))
    AND substr(NEW."script_working_digest", 8) NOT GLOB '*[^0-9a-f]*'
    AND (
      (NEW."script_working_state" = 'empty' AND NEW."script_working_text" = '' AND NEW."current_script_version_id" IS NULL)
      OR (NEW."script_working_state" = 'clean' AND NEW."current_script_version_id" IS NOT NULL AND length(NEW."script_working_text") > 0 AND NEW."script_working_digest" = (SELECT v."source_digest" FROM "chapter_script_versions" v WHERE v."id" = NEW."current_script_version_id" AND v."chapter_id" = NEW."id"))
      OR (NEW."script_working_state" = 'dirty' AND ((NEW."current_script_version_id" IS NULL AND length(NEW."script_working_text") > 0) OR (NEW."current_script_version_id" IS NOT NULL AND NEW."script_working_digest" IS NOT (SELECT v."source_digest" FROM "chapter_script_versions" v WHERE v."id" = NEW."current_script_version_id" AND v."chapter_id" = NEW."id"))))
    )
  );
END;

CREATE TRIGGER "trg_g2_chapters_script_working_shape_update"
BEFORE UPDATE ON "chapters"
WHEN NEW."script_working_text" IS NOT OLD."script_working_text"
  OR NEW."script_working_digest" IS NOT OLD."script_working_digest"
  OR NEW."script_working_state" IS NOT OLD."script_working_state"
  OR NEW."current_script_version_id" IS NOT OLD."current_script_version_id"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_chapters_script_working_shape_update')
  WHERE NOT (
    length(NEW."script_working_digest") = 71
    AND substr(NEW."script_working_digest", 1, 7) = 'sha256:'
    AND substr(NEW."script_working_digest", 8) = lower(substr(NEW."script_working_digest", 8))
    AND substr(NEW."script_working_digest", 8) NOT GLOB '*[^0-9a-f]*'
    AND (
      (NEW."script_working_state" = 'empty' AND NEW."script_working_text" = '' AND NEW."current_script_version_id" IS NULL)
      OR (NEW."script_working_state" = 'clean' AND NEW."current_script_version_id" IS NOT NULL AND length(NEW."script_working_text") > 0 AND NEW."script_working_digest" = (SELECT v."source_digest" FROM "chapter_script_versions" v WHERE v."id" = NEW."current_script_version_id" AND v."chapter_id" = NEW."id"))
      OR (NEW."script_working_state" = 'dirty' AND ((NEW."current_script_version_id" IS NULL AND length(NEW."script_working_text") > 0) OR (NEW."current_script_version_id" IS NOT NULL AND NEW."script_working_digest" IS NOT (SELECT v."source_digest" FROM "chapter_script_versions" v WHERE v."id" = NEW."current_script_version_id" AND v."chapter_id" = NEW."id"))))
    )
  );
END;

CREATE TRIGGER "trg_g2_chapters_command_row_version_update"
BEFORE UPDATE ON "chapters"
WHEN NEW."title" IS NOT OLD."title"
  OR NEW."summary" IS NOT OLD."summary"
  OR NEW."milestone_status" IS NOT OLD."milestone_status"
  OR NEW."script_working_text" IS NOT OLD."script_working_text"
  OR NEW."script_working_digest" IS NOT OLD."script_working_digest"
  OR NEW."script_working_state" IS NOT OLD."script_working_state"
  OR NEW."current_script_version_id" IS NOT OLD."current_script_version_id"
  OR NEW."current_story_version_id" IS NOT OLD."current_story_version_id"
  OR NEW."pending_story_version_id" IS NOT OLD."pending_story_version_id"
  OR NEW."current_storyboard_version_id" IS NOT OLD."current_storyboard_version_id"
  OR NEW."pending_storyboard_version_id" IS NOT OLD."pending_storyboard_version_id"
  OR NEW."current_preflight_revision_id" IS NOT OLD."current_preflight_revision_id"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_chapters_command_row_version_update')
  WHERE NEW."row_version" IS NOT OLD."row_version" + 1;
END;

CREATE TRIGGER "trg_g2_chapters_current_source_update"
BEFORE UPDATE ON "chapters"
WHEN NEW."current_story_version_id" IS NOT OLD."current_story_version_id"
  OR NEW."current_storyboard_version_id" IS NOT OLD."current_storyboard_version_id"
  OR NEW."current_preflight_revision_id" IS NOT OLD."current_preflight_revision_id"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_chapters_current_source_update')
  WHERE (NEW."current_story_version_id" IS NOT OLD."current_story_version_id" AND NOT EXISTS (
    SELECT 1 FROM "story_versions" v
    WHERE v."id" = NEW."current_story_version_id" AND v."chapter_id" = NEW."id" AND v."project_id" = NEW."project_id"
      AND v."status" = 'confirmed' AND v."source_script_version_id" = NEW."current_script_version_id"
  ))
  OR (NEW."current_storyboard_version_id" IS NOT OLD."current_storyboard_version_id" AND NOT EXISTS (
    SELECT 1 FROM "storyboard_versions" b
    WHERE b."id" = NEW."current_storyboard_version_id" AND b."chapter_id" = NEW."id" AND b."project_id" = NEW."project_id"
      AND b."status" = 'confirmed' AND b."source_story_version_id" = NEW."current_story_version_id"
  ))
  OR (NEW."current_preflight_revision_id" IS NOT OLD."current_preflight_revision_id" AND NOT EXISTS (
    SELECT 1 FROM "preflight_revisions" p
    WHERE p."id" = NEW."current_preflight_revision_id" AND p."chapter_id" = NEW."id" AND p."project_id" = NEW."project_id"
      AND p."status" = 'confirmed' AND p."ready" = 1 AND p."source_storyboard_version_id" = NEW."current_storyboard_version_id"
  ))
  OR NEW."pending_story_version_id" IS NOT NULL
  OR NEW."pending_storyboard_version_id" IS NOT NULL
  OR NEW."script_working_state" <> 'clean';
END;

CREATE TRIGGER "trg_g2_story_versions_pending_v2_insert"
BEFORE INSERT ON "story_versions"
WHEN NEW."status" = 'pending_confirmation'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_story_versions_pending_v2_insert')
  WHERE NEW."source_script_version_id" IS NULL
    OR NEW."source_policy_version" IS NULL
    OR NEW."source_digest" IS NULL
    OR (NEW."origin" <> 'legacy_import' AND (NEW."schema_version" <> 2 OR json_extract(NEW."document_json", '$.schemaVersion') <> 2))
    OR NEW."schema_version" NOT IN (1, 2);
END;

CREATE TRIGGER "trg_g2_story_versions_pending_update"
BEFORE UPDATE ON "story_versions"
WHEN OLD."status" = 'pending_confirmation'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_story_versions_pending_update')
  WHERE NOT EXISTS (SELECT 1 FROM "chapters" c WHERE c."id" = OLD."chapter_id" AND c."pending_story_version_id" = OLD."id")
    OR NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."version" IS NOT OLD."version"
    OR NEW."source_script_version_id" IS NOT OLD."source_script_version_id"
    OR NEW."source_policy_version" IS NOT OLD."source_policy_version"
    OR NEW."source_digest" IS NOT OLD."source_digest"
    OR NEW."origin" IS NOT OLD."origin"
    OR NEW."created_at" IS NOT OLD."created_at"
    OR NEW."status" NOT IN ('pending_confirmation', 'confirmed', 'archived')
    OR (NEW."status" = 'pending_confirmation' AND NEW."row_version" IS NOT OLD."row_version" + 1)
    OR (NEW."status" IN ('confirmed', 'archived') AND NEW."row_version" IS NOT OLD."row_version" + 1)
    OR (NEW."status" <> OLD."status" AND NEW."document_json" IS NOT OLD."document_json")
    OR (NEW."status" <> OLD."status" AND NEW."schema_version" IS NOT OLD."schema_version")
    OR (NEW."status" <> OLD."status" AND NEW."document_digest" IS NOT OLD."document_digest")
    OR (NEW."status" = 'pending_confirmation' AND NEW."origin" <> 'legacy_import' AND (NEW."schema_version" <> 2 OR json_extract(NEW."document_json", '$.schemaVersion') <> 2));
END;

CREATE TRIGGER "trg_g2_story_versions_confirm_source_update"
BEFORE UPDATE ON "story_versions"
WHEN OLD."status" = 'pending_confirmation' AND NEW."status" = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_story_versions_confirm_source_update')
  WHERE NOT EXISTS (
    SELECT 1 FROM "chapters" c
    WHERE c."id" = OLD."chapter_id" AND c."pending_story_version_id" = OLD."id"
      AND c."current_script_version_id" = NEW."source_script_version_id"
      AND c."script_working_state" = 'clean'
      AND c."id" = NEW."chapter_id"
  )
    OR EXISTS (SELECT 1 FROM "chapter_script_pending" p WHERE p."chapter_id" = OLD."chapter_id")
    OR NEW."source_script_version_id" IS NULL
    OR NEW."source_digest" IS NULL;
END;

CREATE TRIGGER "trg_g2_storyboard_versions_pending_v2_insert"
BEFORE INSERT ON "storyboard_versions"
WHEN NEW."status" = 'pending_confirmation'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_storyboard_versions_pending_v2_insert')
  WHERE NEW."source_story_version_id" IS NULL
    OR NEW."source_policy_version" IS NULL
    OR NEW."source_digest" IS NULL
    OR (NEW."origin" <> 'legacy_import' AND (NEW."schema_version" <> 2 OR json_extract(NEW."document_json", '$.schemaVersion') <> 2))
    OR NEW."schema_version" NOT IN (1, 2);
END;

CREATE TRIGGER "trg_g2_storyboard_versions_pending_update"
BEFORE UPDATE ON "storyboard_versions"
WHEN OLD."status" = 'pending_confirmation'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_storyboard_versions_pending_update')
  WHERE NOT EXISTS (SELECT 1 FROM "chapters" c WHERE c."id" = OLD."chapter_id" AND c."pending_storyboard_version_id" = OLD."id")
    OR NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."version" IS NOT OLD."version"
    OR NEW."source_story_version_id" IS NOT OLD."source_story_version_id"
    OR NEW."source_policy_version" IS NOT OLD."source_policy_version"
    OR NEW."source_digest" IS NOT OLD."source_digest"
    OR NEW."origin" IS NOT OLD."origin"
    OR NEW."created_at" IS NOT OLD."created_at"
    OR NEW."status" NOT IN ('pending_confirmation', 'confirmed', 'archived')
    OR NEW."row_version" IS NOT OLD."row_version" + 1
    OR (NEW."status" <> OLD."status" AND NEW."document_json" IS NOT OLD."document_json")
    OR (NEW."status" <> OLD."status" AND NEW."schema_version" IS NOT OLD."schema_version")
    OR (NEW."status" <> OLD."status" AND NEW."document_digest" IS NOT OLD."document_digest")
    OR (NEW."status" = 'pending_confirmation' AND NEW."origin" <> 'legacy_import' AND (NEW."schema_version" <> 2 OR json_extract(NEW."document_json", '$.schemaVersion') <> 2));
END;

CREATE TRIGGER "trg_g2_storyboard_versions_confirm_source_update"
BEFORE UPDATE ON "storyboard_versions"
WHEN OLD."status" = 'pending_confirmation' AND NEW."status" = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_storyboard_versions_confirm_source_update')
  WHERE NOT EXISTS (
    SELECT 1 FROM "chapters" c
    WHERE c."id" = OLD."chapter_id" AND c."pending_storyboard_version_id" = OLD."id"
      AND c."pending_story_version_id" IS NULL
      AND c."script_working_state" = 'clean'
      AND NOT EXISTS (SELECT 1 FROM "chapter_script_pending" p WHERE p."chapter_id" = c."id")
      AND c."current_story_version_id" = (SELECT b."source_story_version_id" FROM "storyboard_versions" b WHERE b."id" = NEW."id")
      AND c."current_script_version_id" = (SELECT s."source_script_version_id" FROM "story_versions" s WHERE s."id" = c."current_story_version_id" AND s."status" = 'confirmed')
  )
    OR NEW."source_story_version_id" IS NULL
    OR NEW."source_digest" IS NULL;
END;

CREATE TRIGGER "trg_g2_shots_retired_monotonic_update"
BEFORE UPDATE ON "shots"
WHEN OLD."lifecycle_status" = 'retired'
  OR NEW."lifecycle_status" = 'retired'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_shots_retired_monotonic_update')
  WHERE (OLD."lifecycle_status" = 'retired' AND NEW."lifecycle_status" <> 'retired')
    OR (OLD."lifecycle_status" = 'retired' AND NEW."retired_at" IS NOT OLD."retired_at")
    OR (NEW."lifecycle_status" = 'retired' AND OLD."lifecycle_status" <> 'retired' AND NEW."retired_at" IS NULL);
END;

CREATE TRIGGER "trg_g2_preflight_revisions_v2_current_insert"
BEFORE INSERT ON "preflight_revisions"
WHEN NEW."schema_version" = 2
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_preflight_revisions_v2_current_insert')
  WHERE NEW."status" <> 'confirmed'
    OR NEW."ready" <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM "chapters" c
      JOIN "storyboard_versions" b ON b."id" = NEW."source_storyboard_version_id"
      JOIN "story_versions" s ON s."id" = b."source_story_version_id"
      JOIN "chapter_script_versions" v ON v."id" = s."source_script_version_id"
      WHERE c."id" = NEW."chapter_id" AND c."project_id" = NEW."project_id"
        AND c."pending_story_version_id" IS NULL AND c."pending_storyboard_version_id" IS NULL
        AND c."script_working_state" = 'clean' AND NOT EXISTS (SELECT 1 FROM "chapter_script_pending" sp WHERE sp."chapter_id" = c."id")
        AND c."current_story_version_id" = s."id" AND c."current_storyboard_version_id" = b."id"
        AND b."status" = 'confirmed' AND s."status" = 'confirmed'
        AND v."id" = c."current_script_version_id"
    );
END;

CREATE TRIGGER "trg_g2_generation_tasks_new_work_gate_seal"
BEFORE UPDATE ON "generation_tasks"
WHEN OLD."source_set_sealed_at" IS NULL
  AND NEW."source_set_sealed_at" IS NOT NULL
  AND NEW."type" IN ('story_parse', 'shot_generate', 'shot_prompt_generate', 'image_generate')
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_generation_tasks_new_work_gate_seal')
  WHERE NEW."source_digest" IS NULL
    OR length(NEW."source_digest") <> 71
    OR substr(NEW."source_digest", 1, 7) <> 'sha256:'
    OR substr(NEW."source_digest", 8) <> lower(substr(NEW."source_digest", 8))
    OR substr(NEW."source_digest", 8) GLOB '*[^0-9a-f]*'
    OR NEW."input_json" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "generation_task_sources" s WHERE s."task_id" = NEW."id")
    OR (NEW."type" = 'story_parse' AND NOT (
      NEW."target_type" = 'chapter'
      AND NEW."target_id" = NEW."chapter_id"
      AND json_type(NEW."input_json", '$.expectedTargetId') = 'text'
      AND EXISTS (SELECT 1 FROM "chapters" c WHERE c."id" = NEW."chapter_id" AND c."script_working_state" = 'clean' AND c."current_script_version_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "chapter_script_pending" p WHERE p."chapter_id" = c."id"))
      AND EXISTS (SELECT 1 FROM "chapters" c JOIN "story_versions" v ON v."id" = c."pending_story_version_id" WHERE c."id" = NEW."chapter_id" AND v."id" = json_extract(NEW."input_json", '$.expectedTargetId'))
      AND EXISTS (SELECT 1 FROM "generation_task_sources" s WHERE s."task_id" = NEW."id" AND s."source_type" = 'chapter_script_version' AND s."source_id" = (SELECT c."current_script_version_id" FROM "chapters" c WHERE c."id" = NEW."chapter_id"))
    ))
    OR (NEW."type" = 'shot_generate' AND NOT (
      NEW."target_type" = 'chapter'
      AND NEW."target_id" = NEW."chapter_id"
      AND json_type(NEW."input_json", '$.expectedTargetId') = 'text'
      AND EXISTS (SELECT 1 FROM "chapters" c JOIN "story_versions" s ON s."id" = c."current_story_version_id" AND s."status" = 'confirmed' WHERE c."id" = NEW."chapter_id" AND c."script_working_state" = 'clean' AND c."pending_story_version_id" IS NULL AND NOT EXISTS (SELECT 1 FROM "chapter_script_pending" p WHERE p."chapter_id" = c."id") AND s."source_script_version_id" = c."current_script_version_id")
      AND EXISTS (SELECT 1 FROM "chapters" c JOIN "storyboard_versions" v ON v."id" = c."pending_storyboard_version_id" WHERE c."id" = NEW."chapter_id" AND v."id" = json_extract(NEW."input_json", '$.expectedTargetId'))
      AND EXISTS (SELECT 1 FROM "generation_task_sources" s JOIN "chapters" c ON c."current_story_version_id" = s."source_id" WHERE s."task_id" = NEW."id" AND s."source_type" = 'story_version' AND c."id" = NEW."chapter_id")
    ))
    OR (NEW."type" IN ('shot_prompt_generate', 'image_generate') AND NOT (
      NEW."target_type" = 'shot'
      AND EXISTS (SELECT 1 FROM "chapters" c WHERE c."id" = NEW."chapter_id" AND c."script_working_state" = 'clean' AND c."pending_story_version_id" IS NULL AND c."pending_storyboard_version_id" IS NULL AND NOT EXISTS (SELECT 1 FROM "chapter_script_pending" p WHERE p."chapter_id" = c."id") AND c."current_story_version_id" IS NOT NULL AND c."current_storyboard_version_id" IS NOT NULL AND c."current_preflight_revision_id" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "shots" s WHERE s."id" = NEW."target_id" AND s."project_id" = NEW."project_id" AND (NEW."chapter_id" IS NULL OR s."chapter_id" = NEW."chapter_id") AND s."lifecycle_status" = 'active')
    ));
END;

CREATE TRIGGER "trg_g2_generation_tasks_applicability_terminal"
BEFORE UPDATE ON "generation_tasks"
WHEN OLD."status" = 'running'
  AND NEW."status" = 'succeeded'
  AND NEW."type" IN ('story_parse', 'shot_generate', 'shot_prompt_generate', 'image_generate')
BEGIN
  SELECT RAISE(ABORT, 'AIR_G2:trg_g2_generation_tasks_applicability_terminal')
  WHERE NEW."applicability" NOT IN ('current', 'historical');
END;

-- Preflight guards intentionally run after all formal G1 objects exist.  They
-- abort with a distinct code and never become part of the persisted schema.
CREATE TEMP TABLE "_g2_overlay_preflight_guard" ("code" TEXT PRIMARY KEY);
CREATE TEMP TRIGGER "g2_guard_story_multiple_active_pending" AFTER INSERT ON "_g2_overlay_preflight_guard" WHEN NEW."code" = 'story_multiple_active_pending' BEGIN SELECT RAISE(ABORT, 'AIR_G2:preflight_story_multiple_active_pending'); END;
CREATE TEMP TRIGGER "g2_guard_board_multiple_active_pending" AFTER INSERT ON "_g2_overlay_preflight_guard" WHEN NEW."code" = 'board_multiple_active_pending' BEGIN SELECT RAISE(ABORT, 'AIR_G2:preflight_board_multiple_active_pending'); END;
CREATE TEMP TRIGGER "g2_guard_story_pending_pointer_mismatch" AFTER INSERT ON "_g2_overlay_preflight_guard" WHEN NEW."code" = 'story_pending_pointer_mismatch' BEGIN SELECT RAISE(ABORT, 'AIR_G2:preflight_story_pending_pointer_mismatch'); END;
CREATE TEMP TRIGGER "g2_guard_board_pending_pointer_mismatch" AFTER INSERT ON "_g2_overlay_preflight_guard" WHEN NEW."code" = 'board_pending_pointer_mismatch' BEGIN SELECT RAISE(ABORT, 'AIR_G2:preflight_board_pending_pointer_mismatch'); END;
CREATE TEMP TRIGGER "g2_guard_script_working_shape_invalid" AFTER INSERT ON "_g2_overlay_preflight_guard" WHEN NEW."code" = 'script_working_shape_invalid' BEGIN SELECT RAISE(ABORT, 'AIR_G2:preflight_script_working_shape_invalid'); END;
CREATE TEMP TRIGGER "g2_guard_nonlegacy_v1_pending" AFTER INSERT ON "_g2_overlay_preflight_guard" WHEN NEW."code" = 'nonlegacy_v1_pending' BEGIN SELECT RAISE(ABORT, 'AIR_G2:preflight_nonlegacy_v1_pending'); END;

INSERT INTO "_g2_overlay_preflight_guard" ("code") SELECT 'story_multiple_active_pending' WHERE EXISTS (SELECT 1 FROM "story_versions" WHERE "status" = 'pending_confirmation' GROUP BY "chapter_id" HAVING COUNT(*) > 1);
INSERT INTO "_g2_overlay_preflight_guard" ("code") SELECT 'board_multiple_active_pending' WHERE EXISTS (SELECT 1 FROM "storyboard_versions" WHERE "status" = 'pending_confirmation' GROUP BY "chapter_id" HAVING COUNT(*) > 1);
INSERT INTO "_g2_overlay_preflight_guard" ("code") SELECT 'story_pending_pointer_mismatch' WHERE EXISTS (SELECT 1 FROM "story_versions" v WHERE v."status" = 'pending_confirmation' AND NOT EXISTS (SELECT 1 FROM "chapters" c WHERE c."pending_story_version_id" = v."id"));
INSERT INTO "_g2_overlay_preflight_guard" ("code") SELECT 'board_pending_pointer_mismatch' WHERE EXISTS (SELECT 1 FROM "storyboard_versions" v WHERE v."status" = 'pending_confirmation' AND NOT EXISTS (SELECT 1 FROM "chapters" c WHERE c."pending_storyboard_version_id" = v."id"));
INSERT INTO "_g2_overlay_preflight_guard" ("code")
SELECT 'script_working_shape_invalid'
WHERE EXISTS (
  SELECT 1 FROM "chapters" c
  WHERE length(c."script_working_digest") <> 71
    OR substr(c."script_working_digest", 1, 7) <> 'sha256:'
    OR substr(c."script_working_digest", 8) <> lower(substr(c."script_working_digest", 8))
    OR substr(c."script_working_digest", 8) GLOB '*[^0-9a-f]*'
    OR c."script_working_state" NOT IN ('empty', 'clean', 'dirty')
    OR (c."script_working_state" = 'empty' AND NOT (c."script_working_text" = '' AND c."current_script_version_id" IS NULL))
    OR (c."script_working_state" = 'clean' AND NOT (c."current_script_version_id" IS NOT NULL AND length(c."script_working_text") > 0 AND c."script_working_digest" = (SELECT v."source_digest" FROM "chapter_script_versions" v WHERE v."id" = c."current_script_version_id" AND v."chapter_id" = c."id")))
    OR (c."script_working_state" = 'dirty' AND NOT ((c."current_script_version_id" IS NULL AND length(c."script_working_text") > 0) OR (c."current_script_version_id" IS NOT NULL AND c."script_working_digest" IS NOT (SELECT v."source_digest" FROM "chapter_script_versions" v WHERE v."id" = c."current_script_version_id" AND v."chapter_id" = c."id")))
));
INSERT INTO "_g2_overlay_preflight_guard" ("code") SELECT 'nonlegacy_v1_pending' WHERE EXISTS (SELECT 1 FROM "story_versions" WHERE "status" = 'pending_confirmation' AND "origin" <> 'legacy_import' AND ("schema_version" = 1 OR json_extract("document_json", '$.schemaVersion') = 1)) OR EXISTS (SELECT 1 FROM "storyboard_versions" WHERE "status" = 'pending_confirmation' AND "origin" <> 'legacy_import' AND ("schema_version" = 1 OR json_extract("document_json", '$.schemaVersion') = 1));

DROP TRIGGER "g2_guard_story_multiple_active_pending";
DROP TRIGGER "g2_guard_board_multiple_active_pending";
DROP TRIGGER "g2_guard_story_pending_pointer_mismatch";
DROP TRIGGER "g2_guard_board_pending_pointer_mismatch";
DROP TRIGGER "g2_guard_script_working_shape_invalid";
DROP TRIGGER "g2_guard_nonlegacy_v1_pending";
DROP TABLE "_g2_overlay_preflight_guard";
