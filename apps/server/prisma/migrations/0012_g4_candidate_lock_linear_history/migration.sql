-- G4 CandidateLockRevision overlay.
-- G1 already owns columns, action/nullability checks, scope FKs, immutable
-- history, and revision query indexes. This forward-only overlay adds only the
-- missing linear-chain/CAS defenses and current-final status guard.

CREATE UNIQUE INDEX "uq_g4_candidate_lock_revisions_previous_nonnull"
ON "candidate_lock_revisions" ("previous_revision_id" ASC)
WHERE "previous_revision_id" IS NOT NULL;

CREATE TRIGGER "trg_g4_candidate_lock_revisions_linear_insert"
BEFORE INSERT ON "candidate_lock_revisions"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G4:CANDIDATE_LOCK_LINEAR_HISTORY')
  WHERE (
    NEW."previous_revision_id" IS NULL
    AND NOT (
      NEW."revision" = 1
      AND NEW."action" = 'lock'
      AND EXISTS (
        SELECT 1
        FROM "shots" AS shot
        WHERE shot."id" = NEW."shot_id"
          AND shot."project_id" = NEW."project_id"
          AND shot."chapter_id" = NEW."chapter_id"
          AND shot."current_candidate_lock_revision_id" IS NULL
      )
    )
  )
  OR (
    NEW."previous_revision_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "candidate_lock_revisions" AS previous_revision
      JOIN "shots" AS shot
        ON shot."id" = NEW."shot_id"
       AND shot."project_id" = NEW."project_id"
       AND shot."chapter_id" = NEW."chapter_id"
      WHERE previous_revision."id" = NEW."previous_revision_id"
        AND previous_revision."project_id" = NEW."project_id"
        AND previous_revision."chapter_id" = NEW."chapter_id"
        AND previous_revision."shot_id" = NEW."shot_id"
        AND shot."current_candidate_lock_revision_id" = previous_revision."id"
        AND NEW."revision" = previous_revision."revision" + 1
        AND (
          (previous_revision."action" = 'clear' AND NEW."action" = 'lock')
          OR (
            previous_revision."action" IN ('lock', 'replace')
            AND NEW."action" IN ('replace', 'clear')
          )
        )
        AND (
          NEW."action" <> 'replace'
          OR NEW."candidate_id" IS NOT previous_revision."candidate_id"
        )
    )
  );
END;

DROP TRIGGER "trg_shots_current_lock_scope_insert";

CREATE TRIGGER "trg_shots_current_lock_scope_insert"
BEFORE INSERT ON "shots"
WHEN NEW."current_candidate_lock_revision_id" IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AIR_G4:CANDIDATE_LOCK_CURRENT_CAS')
  WHERE NOT EXISTS (
    SELECT 1
    FROM "candidate_lock_revisions" AS lock_revision
    JOIN "projects" AS owner_project
      ON owner_project."id" = NEW."project_id"
    WHERE lock_revision."id" = NEW."current_candidate_lock_revision_id"
      AND lock_revision."project_id" = NEW."project_id"
      AND lock_revision."chapter_id" = NEW."chapter_id"
      AND lock_revision."shot_id" = NEW."id"
      AND owner_project."lifecycle_status" = 'active'
  );
END;

DROP TRIGGER "trg_shots_current_lock_scope_update";

CREATE TRIGGER "trg_shots_current_lock_scope_update"
BEFORE UPDATE ON "shots"
WHEN NEW."current_candidate_lock_revision_id" IS NOT OLD."current_candidate_lock_revision_id"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G4:CANDIDATE_LOCK_CURRENT_CAS')
  WHERE (
    NEW."current_candidate_lock_revision_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "candidate_lock_revisions" AS lock_revision
      JOIN "projects" AS owner_project
        ON owner_project."id" = NEW."project_id"
      WHERE lock_revision."id" = NEW."current_candidate_lock_revision_id"
        AND lock_revision."project_id" = NEW."project_id"
        AND lock_revision."chapter_id" = NEW."chapter_id"
        AND lock_revision."shot_id" = NEW."id"
        AND owner_project."lifecycle_status" = 'active'
        AND (
          (
            OLD."current_candidate_lock_revision_id" IS NULL
            AND lock_revision."previous_revision_id" IS NULL
            AND lock_revision."revision" = 1
            AND lock_revision."action" = 'lock'
          )
          OR lock_revision."previous_revision_id" = OLD."current_candidate_lock_revision_id"
        )
    )
  )
  OR (
    NEW."current_candidate_lock_revision_id" IS NULL
    AND NOT (
      EXISTS (
        SELECT 1
        FROM "projects" AS purge_project
        WHERE purge_project."id" = NEW."project_id"
          AND purge_project."lifecycle_status" = 'deleting'
      )
      AND EXISTS (
        SELECT 1
        FROM "outbox_events" AS purge_event
        WHERE purge_event."event_type" = 'project.delete_files'
          AND purge_event."aggregate_type" = 'project'
          AND purge_event."aggregate_id" = NEW."project_id"
          AND purge_event."status" = 'processed'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "generation_tasks" AS purge_task
        WHERE purge_task."project_id" = NEW."project_id"
          AND purge_task."record_kind" = 'runtime'
          AND purge_task."status" IN ('queued', 'running', 'retrying')
      )
    )
  );
END;

CREATE TRIGGER "trg_g4_candidates_current_final_status_update"
BEFORE UPDATE OF "status" ON "candidates"
WHEN NEW."status" IS NOT OLD."status"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G4:CANDIDATE_IS_CURRENT_FINAL')
  WHERE NEW."status" IN ('rejected', 'superseded')
    AND EXISTS (
      SELECT 1
      FROM "shots" AS shot
      JOIN "candidate_lock_revisions" AS current_revision
        ON current_revision."id" = shot."current_candidate_lock_revision_id"
      WHERE shot."id" = OLD."shot_id"
        AND shot."project_id" = OLD."project_id"
        AND shot."chapter_id" = OLD."chapter_id"
        AND current_revision."candidate_id" = OLD."id"
        AND current_revision."action" IN ('lock', 'replace')
    );
END;
