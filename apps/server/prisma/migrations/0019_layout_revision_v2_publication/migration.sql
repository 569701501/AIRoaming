-- LayoutDocumentV2 immutable revision/publication overlay.
--
-- Existing LayoutRevision.document_digest remains the digest of the complete
-- stored document.  The visible digest is added separately so a V2 document
-- can freeze its deterministic V2 -> V1 projection without rewriting any
-- historical V1 row.

ALTER TABLE "layout_revisions"
ADD COLUMN "visible_document_digest" TEXT
CHECK (
  "visible_document_digest" IS NULL
  OR (
    length("visible_document_digest") = 71
    AND substr("visible_document_digest", 1, 7) = 'sha256:'
    AND substr("visible_document_digest", 8) = lower(substr("visible_document_digest", 8))
    AND substr("visible_document_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

ALTER TABLE "export_revisions"
ADD COLUMN "revision_document_digest" TEXT
CHECK (
  "revision_document_digest" IS NULL
  OR (
    length("revision_document_digest") = 71
    AND substr("revision_document_digest", 1, 7) = 'sha256:'
    AND substr("revision_document_digest", 8) = lower(substr("revision_document_digest", 8))
    AND substr("revision_document_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

ALTER TABLE "export_revisions"
ADD COLUMN "visible_document_digest" TEXT
CHECK (
  "visible_document_digest" IS NULL
  OR (
    length("visible_document_digest") = 71
    AND substr("visible_document_digest", 1, 7) = 'sha256:'
    AND substr("visible_document_digest", 8) = lower(substr("visible_document_digest", 8))
    AND substr("visible_document_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

DROP TRIGGER "trg_layout_revisions_scope_insert";
DROP TRIGGER "trg_layout_revisions_binding_set_seal";
DROP TRIGGER "trg_layout_revisions_immutable_update";
DROP TRIGGER "trg_g5_layout_publications_runtime_insert";
DROP TRIGGER "trg_g5_layout_publications_ready_update";
DROP TRIGGER "trg_export_revisions_ready_immutable_update";
DROP TRIGGER "trg_export_revisions_runtime_source_immutable_update";

CREATE TRIGGER "trg_layout_revisions_scope_insert"
BEFORE INSERT ON "layout_revisions"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_scope_insert')
  WHERE NEW."binding_set_sealed_at" IS NOT NULL
    OR NOT (
      EXISTS (
        SELECT 1
        FROM "chapters" AS chapter
        JOIN "projects" AS project ON project."id" = chapter."project_id"
        WHERE chapter."id" = NEW."chapter_id"
          AND chapter."project_id" = NEW."project_id"
          AND project."lifecycle_status" = 'active'
      )
      AND (
        NEW."previous_revision_id" IS NULL
        OR EXISTS (
          SELECT 1 FROM "layout_revisions" AS revision
          WHERE revision."id" = NEW."previous_revision_id"
            AND revision."project_id" = NEW."project_id"
            AND revision."chapter_id" = NEW."chapter_id"
        )
      )
      AND (
        NEW."content_based_on_revision_id" IS NULL
        OR EXISTS (
          SELECT 1 FROM "layout_revisions" AS revision
          WHERE revision."id" = NEW."content_based_on_revision_id"
            AND revision."project_id" = NEW."project_id"
            AND revision."chapter_id" = NEW."chapter_id"
        )
      )
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_REVISION_DOCUMENT_INVALID')
  WHERE NEW."origin" = 'runtime'
    AND (
      NEW."schema_version" NOT IN (1, 2)
      OR NEW."source_lock_set_digest" IS NULL
      OR NEW."visible_document_digest" IS NULL
      OR json_valid(NEW."document_json") <> 1
      OR json_extract(NEW."document_json", '$.projectId') IS NOT NEW."project_id"
      OR json_extract(NEW."document_json", '$.chapterId') IS NOT NEW."chapter_id"
      OR json_type(NEW."document_json", '$.canvases') IS NOT 'array'
      OR (
        NEW."schema_version" = 1
        AND (
          json_extract(NEW."document_json", '$.schemaVersion') <> 1
          OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v1'
          OR NEW."visible_document_digest" IS NOT NEW."document_digest"
        )
      )
      OR (
        NEW."schema_version" = 2
        AND (
          json_extract(NEW."document_json", '$.schemaVersion') <> 2
          OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v2'
          OR json_extract(NEW."document_json", '$.automation.policyVersion') <> 'layout_automation_v1'
          OR json_type(NEW."document_json", '$.automation.dialogueBindings') IS NOT 'array'
          OR json_type(NEW."document_json", '$.automation.protections') IS NOT 'array'
          OR json_type(NEW."document_json", '$.automation.composition') IS NOT 'object'
        )
      )
      OR NOT EXISTS (
        SELECT 1
        FROM "projects" AS project
        WHERE project."id" = NEW."project_id"
          AND (
            (
              project."comic_format" = 'paged_comic'
              AND json_extract(NEW."document_json", '$.comicFormat') = 'paged_comic'
              AND json_extract(NEW."document_json", '$.profile.kind') = 'paged'
            )
            OR (
              project."comic_format" = 'vertical_scroll'
              AND json_extract(NEW."document_json", '$.comicFormat') = 'vertical_scroll'
              AND json_extract(NEW."document_json", '$.profile.kind') = 'vertical_strip'
            )
          )
      )
    );
END;

CREATE TRIGGER "trg_layout_revisions_binding_set_seal"
BEFORE UPDATE ON "layout_revisions"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_binding_set_seal')
  WHERE OLD."binding_set_sealed_at" IS NOT NULL
    AND NEW."binding_set_sealed_at" IS NOT OLD."binding_set_sealed_at";

  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_binding_set_seal')
  WHERE OLD."binding_set_sealed_at" IS NULL
    AND NEW."binding_set_sealed_at" IS NOT NULL
    AND CASE
      WHEN json_valid(NEW."document_json") <> 1 THEN 1
      WHEN json_extract(NEW."document_json", '$.kind') IN ('layout_document_v1', 'layout_document_v2')
      THEN NOT COALESCE((
        (
          (
            json_extract(NEW."document_json", '$.kind') = 'layout_document_v1'
            AND NEW."schema_version" = 1
            AND json_extract(NEW."document_json", '$.schemaVersion') = 1
            AND NEW."visible_document_digest" IS NEW."document_digest"
          )
          OR (
            json_extract(NEW."document_json", '$.kind') = 'layout_document_v2'
            AND NEW."schema_version" = 2
            AND json_extract(NEW."document_json", '$.schemaVersion') = 2
            AND NEW."visible_document_digest" IS NOT NULL
            AND json_extract(NEW."document_json", '$.automation.policyVersion') = 'layout_automation_v1'
            AND json_type(NEW."document_json", '$.automation.composition') = 'object'
            AND json_type(NEW."document_json", '$.automation.dialogueBindings') = 'array'
            AND json_type(NEW."document_json", '$.automation.protections') = 'array'
          )
        )
        AND json_type(NEW."document_json", '$.canvases') = 'array'
        AND NOT EXISTS (
          SELECT 1
          FROM json_each(NEW."document_json", '$.canvases') AS canvas
          WHERE json_type(canvas.value, '$.elements') IS NOT 'array'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.id'
              ) AS element_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.shotId'
              ) AS shot_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.candidateId'
              ) AS candidate_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.candidateLockRevisionId'
              ) AS lock_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.assetId'
              ) AS asset_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.sourceDigest'
              ) AS source_digest
            FROM json_each(NEW."document_json", '$.canvases') AS canvas,
                 json_each(canvas.value, '$.elements') AS element
            WHERE (
              json_extract(element.value, '$.type') = 'panel_frame'
              AND json_type(element.value, '$.contentImage') = 'object'
            )
            OR json_extract(element.value, '$.type') = 'free_image'
          ) AS projected
          WHERE projected.element_id IS NULL OR length(trim(projected.element_id)) = 0
            OR projected.shot_id IS NULL OR length(trim(projected.shot_id)) = 0
            OR projected.candidate_id IS NULL OR length(trim(projected.candidate_id)) = 0
            OR projected.lock_id IS NULL OR length(trim(projected.lock_id)) = 0
            OR projected.asset_id IS NULL OR length(trim(projected.asset_id)) = 0
            OR projected.source_digest IS NULL OR length(trim(projected.source_digest)) = 0
        )
        AND (
          SELECT count(*) FROM "layout_source_bindings" AS binding
          WHERE binding."layout_revision_id" = NEW."id"
        ) = (
          SELECT count(*)
          FROM json_each(NEW."document_json", '$.canvases') AS canvas,
               json_each(canvas.value, '$.elements') AS element
          WHERE (
            json_extract(element.value, '$.type') = 'panel_frame'
            AND json_type(element.value, '$.contentImage') = 'object'
          )
          OR json_extract(element.value, '$.type') = 'free_image'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.id'
              ) AS element_id,
              'candidate_image' AS role,
              row_number() OVER (
                ORDER BY CAST(canvas.key AS INTEGER), CAST(element.key AS INTEGER)
              ) AS binding_order,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.shotId'
              ) AS shot_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.candidateId'
              ) AS candidate_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.candidateLockRevisionId'
              ) AS lock_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.assetId'
              ) AS asset_id,
              json_extract(
                CASE
                  WHEN json_extract(element.value, '$.type') = 'panel_frame'
                  THEN json_extract(element.value, '$.contentImage')
                  ELSE element.value
                END,
                '$.source.sourceDigest'
              ) AS source_digest
            FROM json_each(NEW."document_json", '$.canvases') AS canvas,
                 json_each(canvas.value, '$.elements') AS element
            WHERE (
              json_extract(element.value, '$.type') = 'panel_frame'
              AND json_type(element.value, '$.contentImage') = 'object'
            )
            OR json_extract(element.value, '$.type') = 'free_image'
          ) AS projected
          LEFT JOIN "layout_source_bindings" AS binding
            ON binding."layout_revision_id" = NEW."id"
           AND binding."role" = projected.role
           AND binding."order" = projected.binding_order
          WHERE binding."id" IS NULL
            OR binding."element_id" IS NOT projected.element_id
            OR binding."shot_id" IS NOT projected.shot_id
            OR binding."candidate_id" IS NOT projected.candidate_id
            OR binding."candidate_lock_revision_id" IS NOT projected.lock_id
            OR binding."asset_id" IS NOT projected.asset_id
            OR binding."source_digest" IS NOT projected.source_digest
        )
      ), 0)
      WHEN json_extract(NEW."document_json", '$.kind') = 'legacy_chapter_layout_v1'
      THEN NOT COALESCE((
        json_extract(NEW."document_json", '$.schemaVersion') = 1
        AND json_extract(NEW."document_json", '$.sourceResolution') IN ('complete', 'unresolved')
        AND json_type(NEW."document_json", '$.sourceBindings') = 'array'
        AND NOT (
          json_extract(NEW."document_json", '$.sourceResolution') = 'complete'
          AND EXISTS (
            SELECT 1
            FROM json_each(NEW."document_json", '$.sourceBindings') AS source
            WHERE json_type(source.value, '$.role') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.role'))) = 0
              OR json_type(source.value, '$.order') IS NOT 'integer'
              OR json_extract(source.value, '$.order') < 1
              OR json_type(source.value, '$.elementId') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.elementId'))) = 0
              OR json_type(source.value, '$.shotId') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.shotId'))) = 0
              OR json_type(source.value, '$.candidateId') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.candidateId'))) = 0
              OR json_type(source.value, '$.candidateLockRevisionId') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.candidateLockRevisionId'))) = 0
              OR json_type(source.value, '$.assetId') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.assetId'))) = 0
              OR json_type(source.value, '$.sourceDigest') IS NOT 'text'
              OR length(trim(json_extract(source.value, '$.sourceDigest'))) = 0
          )
        )
        AND (
          SELECT count(*) FROM "layout_source_bindings" AS binding
          WHERE binding."layout_revision_id" = NEW."id"
        ) = json_array_length(NEW."document_json", '$.sourceBindings')
        AND NOT EXISTS (
          SELECT 1
          FROM json_each(NEW."document_json", '$.sourceBindings') AS source
          LEFT JOIN "layout_source_bindings" AS binding
            ON binding."layout_revision_id" = NEW."id"
           AND binding."role" = json_extract(source.value, '$.role')
           AND binding."order" = json_extract(source.value, '$.order')
          WHERE binding."id" IS NULL
            OR binding."element_id" IS NOT json_extract(source.value, '$.elementId')
            OR binding."shot_id" IS NOT json_extract(source.value, '$.shotId')
            OR binding."candidate_id" IS NOT json_extract(source.value, '$.candidateId')
            OR binding."candidate_lock_revision_id" IS NOT json_extract(source.value, '$.candidateLockRevisionId')
            OR binding."asset_id" IS NOT json_extract(source.value, '$.assetId')
            OR binding."source_digest" IS NOT json_extract(source.value, '$.sourceDigest')
        )
      ), 0)
      ELSE 1
    END;
END;

CREATE TRIGGER "trg_layout_revisions_immutable_update"
BEFORE UPDATE ON "layout_revisions"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_immutable_update')
  WHERE NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."revision" IS NOT OLD."revision"
    OR NEW."previous_revision_id" IS NOT OLD."previous_revision_id"
    OR NEW."content_based_on_revision_id" IS NOT OLD."content_based_on_revision_id"
    OR NEW."document_json" IS NOT OLD."document_json"
    OR NEW."schema_version" IS NOT OLD."schema_version"
    OR NEW."document_digest" IS NOT OLD."document_digest"
    OR NEW."visible_document_digest" IS NOT OLD."visible_document_digest"
    OR NEW."source_lock_set_digest" IS NOT OLD."source_lock_set_digest"
    OR NEW."origin" IS NOT OLD."origin"
    OR NEW."save_reason" IS NOT OLD."save_reason"
    OR NEW."created_at" IS NOT OLD."created_at"
    OR NOT (
      OLD."binding_set_sealed_at" IS NEW."binding_set_sealed_at"
      OR (
        OLD."binding_set_sealed_at" IS NULL
        AND NEW."binding_set_sealed_at" IS NOT NULL
      )
    );
END;

CREATE TRIGGER "trg_g5_layout_publications_runtime_insert"
BEFORE INSERT ON "export_revisions"
WHEN NEW."kind" = 'layout_publication'
  AND NEW."origin" = 'runtime'
  AND NEW."task_id" IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_PUBLICATION_RUNTIME_INSERT_INVALID')
  WHERE NEW."chapter_id" IS NULL
    OR NEW."scope_key" IS NOT ('chapter:' || NEW."chapter_id")
    OR NEW."status" <> 'queued'
    OR NEW."layout_revision_id" IS NULL
    OR NEW."revision_document_digest" IS NULL
    OR NEW."visible_document_digest" IS NULL
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
        AND revision."document_digest" IS NEW."revision_document_digest"
        AND COALESCE(revision."visible_document_digest", revision."document_digest")
          IS NEW."visible_document_digest"
        AND (
          (
            project."comic_format" = 'paged_comic'
            AND json_extract(NEW."profile_json", '$.kind') = 'paged_publication'
          )
          OR (
            project."comic_format" = 'vertical_scroll'
            AND json_extract(NEW."profile_json", '$.kind') = 'vertical_publication'
          )
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
        AND json_extract(task."input_json", '$.exportRevisionId') IS NEW."id"
        AND json_extract(task."input_json", '$.layoutRevisionId') IS NEW."layout_revision_id"
        AND json_extract(task."input_json", '$.sourceLockSetDigest') IS NEW."source_lock_set_digest"
        AND json_extract(task."input_json", '$.profileDigest') IS NEW."profile_digest"
        AND json_extract(task."input_json", '$.preflightDigest') IS NEW."preflight_digest"
        AND json_extract(task."input_json", '$.renderer.rendererVersion') IS NEW."renderer_version"
        AND (
          (
            task."input_schema_version" = 1
            AND json_extract(task."input_json", '$.schemaVersion') = 1
            AND json_extract(task."input_json", '$.documentDigest') IS NEW."revision_document_digest"
            AND NEW."visible_document_digest" IS NEW."revision_document_digest"
          )
          OR (
            task."input_schema_version" = 2
            AND json_extract(task."input_json", '$.schemaVersion') = 2
            AND json_extract(task."input_json", '$.kind') = 'layout_publication_task_v2'
            AND json_extract(task."input_json", '$.revisionDocumentDigest') IS NEW."revision_document_digest"
            AND json_extract(task."input_json", '$.visibleDocumentDigest') IS NEW."visible_document_digest"
          )
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
    OR NOT (
      (
        NEW."manifest_schema_version" = 1
        AND json_extract(NEW."manifest_json", '$.schemaVersion') = 1
        AND json_extract(NEW."manifest_json", '$.kind') = 'layout_publication_manifest_v1'
        AND (
          (
            NEW."revision_document_digest" IS NOT NULL
            AND json_extract(NEW."manifest_json", '$.documentDigest')
              IS NEW."revision_document_digest"
            AND NEW."visible_document_digest" IS NEW."revision_document_digest"
          )
          OR (
            NEW."revision_document_digest" IS NULL
            AND NEW."visible_document_digest" IS NULL
            AND EXISTS (
              SELECT 1
              FROM "layout_revisions" AS revision
              WHERE revision."id" = NEW."layout_revision_id"
                AND revision."project_id" = NEW."project_id"
                AND revision."chapter_id" = NEW."chapter_id"
                AND revision."schema_version" = 1
                AND revision."document_digest"
                  IS json_extract(NEW."manifest_json", '$.documentDigest')
            )
          )
        )
      )
      OR (
        NEW."manifest_schema_version" = 2
        AND json_extract(NEW."manifest_json", '$.schemaVersion') = 2
        AND json_extract(NEW."manifest_json", '$.kind') = 'layout_publication_manifest_v2'
        AND json_extract(NEW."manifest_json", '$.revisionDocumentDigest')
          IS NEW."revision_document_digest"
        AND json_extract(NEW."manifest_json", '$.visibleDocumentDigest')
          IS NEW."visible_document_digest"
      )
    )
    OR json_extract(NEW."manifest_json", '$.exportRevisionId') IS NOT NEW."id"
    OR json_extract(NEW."manifest_json", '$.layoutRevisionId') IS NOT NEW."layout_revision_id"
    OR json_extract(NEW."manifest_json", '$.sourceLockSetDigest') IS NOT NEW."source_lock_set_digest"
    OR json_extract(NEW."manifest_json", '$.profileDigest') IS NOT NEW."profile_digest"
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
    OR (SELECT count(*) FROM "export_artifacts" WHERE "export_revision_id" = NEW."id") < 2
    OR (
      SELECT count(*) FROM "export_artifacts"
      WHERE "export_revision_id" = NEW."id" AND "role" = 'publication_manifest'
    ) <> 1
    OR EXISTS (
      SELECT 1
      FROM "export_artifacts" AS artifact
      JOIN "assets" AS asset ON asset."id" = artifact."asset_id"
      WHERE artifact."export_revision_id" = NEW."id"
        AND (
          asset."status" <> 'ready'
          OR asset."sha256" IS NULL
          OR asset."bytes" IS NULL
          OR asset."storage_key" NOT LIKE (
            'projects/' || NEW."project_id" || '/chapters/%/exports/' || NEW."id" || '/%'
          )
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
        NOT EXISTS (
          SELECT 1 FROM "export_artifacts"
          WHERE "export_revision_id" = NEW."id" AND "role" = 'page_png'
        )
        OR EXISTS (
          SELECT 1 FROM "export_artifacts"
          WHERE "export_revision_id" = NEW."id"
            AND "role" IN ('strip_slice_png', 'long_png')
        )
      )
    )
    OR (
      json_extract(NEW."profile_json", '$.kind') = 'vertical_publication'
      AND (
        NOT EXISTS (
          SELECT 1 FROM "export_artifacts"
          WHERE "export_revision_id" = NEW."id" AND "role" = 'strip_slice_png'
        )
        OR EXISTS (
          SELECT 1 FROM "export_artifacts"
          WHERE "export_revision_id" = NEW."id"
            AND "role" IN ('page_png', 'document_pdf')
        )
      )
    );
END;

CREATE TRIGGER "trg_export_revisions_ready_immutable_update"
BEFORE UPDATE ON "export_revisions"
WHEN OLD."status" = 'ready'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_ready_immutable_update')
  WHERE NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."scope_key" IS NOT OLD."scope_key"
    OR NEW."revision" IS NOT OLD."revision"
    OR NEW."kind" IS NOT OLD."kind"
    OR NEW."status" IS NOT OLD."status"
    OR NEW."task_id" IS NOT OLD."task_id"
    OR NEW."layout_revision_id" IS NOT OLD."layout_revision_id"
    OR NEW."revision_document_digest" IS NOT OLD."revision_document_digest"
    OR NEW."visible_document_digest" IS NOT OLD."visible_document_digest"
    OR NEW."source_lock_set_digest" IS NOT OLD."source_lock_set_digest"
    OR NEW."profile_json" IS NOT OLD."profile_json"
    OR NEW."profile_schema_version" IS NOT OLD."profile_schema_version"
    OR NEW."profile_digest" IS NOT OLD."profile_digest"
    OR NEW."preflight_digest" IS NOT OLD."preflight_digest"
    OR NEW."renderer_version" IS NOT OLD."renderer_version"
    OR NEW."manifest_json" IS NOT OLD."manifest_json"
    OR NEW."manifest_schema_version" IS NOT OLD."manifest_schema_version"
    OR NEW."manifest_digest" IS NOT OLD."manifest_digest"
    OR NEW."completion_applicability" IS NOT OLD."completion_applicability"
    OR NEW."origin" IS NOT OLD."origin"
    OR NEW."created_at" IS NOT OLD."created_at"
    OR NEW."ready_at" IS NOT OLD."ready_at"
    OR NEW."failed_at" IS NOT OLD."failed_at"
    OR NEW."cancelled_at" IS NOT OLD."cancelled_at";
END;

CREATE TRIGGER "trg_export_revisions_runtime_source_immutable_update"
BEFORE UPDATE ON "export_revisions"
WHEN OLD."origin" = 'runtime'
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_runtime_source_immutable_update')
  WHERE NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id"
    OR NEW."scope_key" IS NOT OLD."scope_key"
    OR NEW."revision" IS NOT OLD."revision"
    OR NEW."kind" IS NOT OLD."kind"
    OR NEW."task_id" IS NOT OLD."task_id"
    OR NEW."layout_revision_id" IS NOT OLD."layout_revision_id"
    OR NEW."revision_document_digest" IS NOT OLD."revision_document_digest"
    OR NEW."visible_document_digest" IS NOT OLD."visible_document_digest"
    OR NEW."source_lock_set_digest" IS NOT OLD."source_lock_set_digest"
    OR NEW."profile_json" IS NOT OLD."profile_json"
    OR NEW."profile_schema_version" IS NOT OLD."profile_schema_version"
    OR NEW."profile_digest" IS NOT OLD."profile_digest"
    OR NEW."preflight_digest" IS NOT OLD."preflight_digest"
    OR NEW."renderer_version" IS NOT OLD."renderer_version"
    OR NEW."origin" IS NOT OLD."origin"
    OR NEW."created_at" IS NOT OLD."created_at";
END;
