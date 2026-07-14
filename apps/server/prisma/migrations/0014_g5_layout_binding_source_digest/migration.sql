-- G5-M6 forward-only repair.
-- LayoutDocumentV1 sourceDigest binds Shot/Candidate/LockRevision/Asset plus
-- the Asset sha. The G1 trigger incorrectly compared that composite digest
-- directly with Asset.sha256. Keep the provenance/readiness checks here;
-- the seal trigger checks exact document/binding equality and the service
-- recomputes the composite digest from the ready Asset sha.

DROP TRIGGER "trg_layout_source_bindings_scope_insert";

CREATE TRIGGER "trg_layout_source_bindings_scope_insert"
BEFORE INSERT ON "layout_source_bindings"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_source_bindings_scope_insert')
  WHERE NOT EXISTS (
    SELECT 1
    FROM "layout_revisions" AS revision
    WHERE revision."id" = NEW."layout_revision_id"
      AND revision."binding_set_sealed_at" IS NULL
      AND (
        NEW."shot_id" IS NULL
        OR EXISTS (
          SELECT 1
          FROM "shots" AS shot
          WHERE shot."id" = NEW."shot_id"
            AND shot."project_id" = revision."project_id"
            AND shot."chapter_id" = revision."chapter_id"
        )
      )
      AND (
        NEW."candidate_id" IS NULL
        OR (
          NEW."asset_id" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "candidates" AS candidate
            WHERE candidate."id" = NEW."candidate_id"
              AND candidate."project_id" = revision."project_id"
              AND candidate."chapter_id" = revision."chapter_id"
              AND candidate."asset_id" IS NEW."asset_id"
              AND (NEW."shot_id" IS NULL OR candidate."shot_id" = NEW."shot_id")
          )
        )
      )
      AND (
        NEW."candidate_lock_revision_id" IS NULL
        OR (
          NEW."candidate_id" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "candidate_lock_revisions" AS lock_revision
            WHERE lock_revision."id" = NEW."candidate_lock_revision_id"
              AND lock_revision."project_id" = revision."project_id"
              AND lock_revision."chapter_id" = revision."chapter_id"
              AND lock_revision."action" IN ('lock', 'replace')
              AND (NEW."shot_id" IS NULL OR lock_revision."shot_id" = NEW."shot_id")
              AND lock_revision."candidate_id" IS NEW."candidate_id"
          )
        )
      )
      AND (
        NEW."asset_id" IS NULL
        OR EXISTS (
          SELECT 1
          FROM "assets" AS asset
          WHERE asset."id" = NEW."asset_id"
            AND asset."project_id" = revision."project_id"
            AND (asset."chapter_id" IS NULL OR asset."chapter_id" = revision."chapter_id")
            AND asset."status" = 'ready'
            AND asset."sha256" IS NOT NULL
        )
      )
  );
END;
