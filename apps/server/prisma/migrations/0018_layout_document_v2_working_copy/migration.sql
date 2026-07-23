-- Smart layout M4 forward-only Working Copy overlay.
-- Keeps legacy/V1 rows byte-identical while admitting LayoutDocumentV2 and a
-- one-way V1 -> V2 upgrade. V2 -> V1 remains forbidden.

DROP TRIGGER IF EXISTS "trg_g5_layout_working_copies_v1_insert";
DROP TRIGGER IF EXISTS "trg_g5_layout_working_copies_v1_update";
DROP TRIGGER IF EXISTS "trg_layout_working_copies_scope_insert";
DROP TRIGGER IF EXISTS "trg_layout_working_copies_scope_update";

CREATE TABLE "layout_working_copies__v2_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "document_kind" TEXT NOT NULL,
  "document_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "document_digest" TEXT NOT NULL,
  "source_lock_set_digest" TEXT,
  "based_on_revision_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_layout_working_copies_based_on_revision_id__layout_revisions" FOREIGN KEY ("based_on_revision_id") REFERENCES "layout_revisions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_working_copies_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_working_copies_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_layout_working_copies_digest_format" CHECK ((length(document_digest) = 71 AND substr(document_digest, 1, 7) = 'sha256:' AND substr(document_digest, 8) = lower(substr(document_digest, 8)) AND substr(document_digest, 8) NOT GLOB '*[^0-9a-f]*') AND (source_lock_set_digest IS NULL OR (length(source_lock_set_digest) = 71 AND substr(source_lock_set_digest, 1, 7) = 'sha256:' AND substr(source_lock_set_digest, 8) = lower(substr(source_lock_set_digest, 8)) AND substr(source_lock_set_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_layout_working_copies_document_kind" CHECK (document_kind IN ('legacy_chapter_layout_v1', 'layout_document_v1', 'layout_document_v2')),
  CONSTRAINT "ck_layout_working_copies_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_layout_working_copies_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1)
);

INSERT INTO "layout_working_copies__v2_new" (
  "id",
  "project_id",
  "chapter_id",
  "document_kind",
  "document_json",
  "schema_version",
  "document_digest",
  "source_lock_set_digest",
  "based_on_revision_id",
  "row_version",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "project_id",
  "chapter_id",
  "document_kind",
  "document_json",
  "schema_version",
  "document_digest",
  "source_lock_set_digest",
  "based_on_revision_id",
  "row_version",
  "created_at",
  "updated_at"
FROM "layout_working_copies";

DROP TABLE "layout_working_copies";
ALTER TABLE "layout_working_copies__v2_new" RENAME TO "layout_working_copies";

CREATE UNIQUE INDEX "uq_layout_working_copies_chapter"
ON "layout_working_copies" ("chapter_id" ASC);

CREATE UNIQUE INDEX "uq_layout_working_copies_id_scope"
ON "layout_working_copies" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE TRIGGER "trg_layout_working_copies_scope_insert"
BEFORE INSERT ON "layout_working_copies"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_working_copies_scope_insert')
  WHERE NOT (
    EXISTS (
      SELECT 1
      FROM "chapters" AS chapter
      WHERE chapter."id" = NEW."chapter_id"
        AND chapter."project_id" = NEW."project_id"
    )
    AND (
      NEW."based_on_revision_id" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "layout_revisions" AS revision
        WHERE revision."id" = NEW."based_on_revision_id"
          AND revision."project_id" = NEW."project_id"
          AND revision."chapter_id" = NEW."chapter_id"
      )
    )
  );
END;

CREATE TRIGGER "trg_layout_working_copies_scope_update"
BEFORE UPDATE ON "layout_working_copies"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_G1:trg_layout_working_copies_scope_update')
  WHERE NOT (
    EXISTS (
      SELECT 1
      FROM "chapters" AS chapter
      WHERE chapter."id" = NEW."chapter_id"
        AND chapter."project_id" = NEW."project_id"
    )
    AND (
      NEW."based_on_revision_id" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "layout_revisions" AS revision
        WHERE revision."id" = NEW."based_on_revision_id"
          AND revision."project_id" = NEW."project_id"
          AND revision."chapter_id" = NEW."chapter_id"
      )
    )
  );
END;

CREATE TRIGGER "trg_g5_layout_working_copies_v1_insert"
BEFORE INSERT ON "layout_working_copies"
WHEN NEW."document_kind" IN ('layout_document_v1', 'layout_document_v2')
BEGIN
  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_DOCUMENT_INVALID')
  WHERE NEW."row_version" <> 0
    OR json_valid(NEW."document_json") <> 1
    OR (
      NEW."document_kind" = 'layout_document_v1'
      AND (
        NEW."schema_version" <> 1
        OR json_extract(NEW."document_json", '$.schemaVersion') <> 1
        OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v1'
      )
    )
    OR (
      NEW."document_kind" = 'layout_document_v2'
      AND (
        NEW."schema_version" <> 2
        OR json_extract(NEW."document_json", '$.schemaVersion') <> 2
        OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v2'
        OR json_extract(NEW."document_json", '$.automation.policyVersion') <> 'layout_automation_v1'
      )
    )
    OR json_extract(NEW."document_json", '$.projectId') IS NOT NEW."project_id"
    OR json_extract(NEW."document_json", '$.chapterId') IS NOT NEW."chapter_id"
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
          OR
          (
            project."comic_format" = 'vertical_scroll'
            AND json_extract(NEW."document_json", '$.comicFormat') = 'vertical_scroll'
            AND json_extract(NEW."document_json", '$.profile.kind') = 'vertical_strip'
          )
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
    OR NEW."created_at" IS NOT OLD."created_at"
    OR (
      NEW."document_kind" IS NOT OLD."document_kind"
      AND NOT (
        (
          OLD."document_kind" = 'legacy_chapter_layout_v1'
          AND NEW."document_kind" = 'layout_document_v1'
          AND OLD."schema_version" = NEW."schema_version"
        )
        OR (
          OLD."document_kind" = 'layout_document_v1'
          AND NEW."document_kind" = 'layout_document_v2'
          AND OLD."schema_version" = 1
          AND NEW."schema_version" = 2
        )
      )
    )
    OR (
      NEW."schema_version" IS NOT OLD."schema_version"
      AND NOT (
        OLD."document_kind" = 'layout_document_v1'
        AND NEW."document_kind" = 'layout_document_v2'
        AND OLD."schema_version" = 1
        AND NEW."schema_version" = 2
      )
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_DOCUMENT_INVALID')
  WHERE NEW."document_kind" IN ('layout_document_v1', 'layout_document_v2')
    AND (
      json_valid(NEW."document_json") <> 1
      OR (
        NEW."document_kind" = 'layout_document_v1'
        AND (
          NEW."schema_version" <> 1
          OR json_extract(NEW."document_json", '$.schemaVersion') <> 1
          OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v1'
        )
      )
      OR (
        NEW."document_kind" = 'layout_document_v2'
        AND (
          NEW."schema_version" <> 2
          OR json_extract(NEW."document_json", '$.schemaVersion') <> 2
          OR json_extract(NEW."document_json", '$.kind') <> 'layout_document_v2'
          OR json_extract(NEW."document_json", '$.automation.policyVersion') <> 'layout_automation_v1'
        )
      )
      OR json_extract(NEW."document_json", '$.projectId') IS NOT NEW."project_id"
      OR json_extract(NEW."document_json", '$.chapterId') IS NOT NEW."chapter_id"
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
            OR
            (
              project."comic_format" = 'vertical_scroll'
              AND json_extract(NEW."document_json", '$.comicFormat') = 'vertical_scroll'
              AND json_extract(NEW."document_json", '$.profile.kind') = 'vertical_strip'
            )
          )
      )
    );

  SELECT RAISE(ABORT, 'AIR_G5:LAYOUT_WORKING_COPY_CAS_INVALID')
  WHERE (
      NEW."document_kind" IS NOT OLD."document_kind"
      OR NEW."schema_version" IS NOT OLD."schema_version"
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
    AND NEW."schema_version" IS OLD."schema_version"
    AND NEW."document_json" IS OLD."document_json"
    AND NEW."document_digest" IS OLD."document_digest"
    AND NEW."source_lock_set_digest" IS OLD."source_lock_set_digest"
    AND NEW."based_on_revision_id" IS OLD."based_on_revision_id"
    AND (
      NEW."row_version" IS NOT OLD."row_version"
      OR NEW."updated_at" IS NOT OLD."updated_at"
    );
END;

-- A composition result is applied exactly once. This evidence belongs to the
-- runtime application boundary, not to legacy import evidence on GenerationTask.
CREATE TABLE "layout_composition_applications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "base_document_digest" TEXT,
  "result_document_digest" TEXT NOT NULL,
  "target_row_version" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_layout_composition_applications_project_id__projects"
    FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_composition_applications_chapter_scope__chapters"
    FOREIGN KEY ("chapter_id", "project_id") REFERENCES "chapters" ("id", "project_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_composition_applications_task_scope__generation_tasks"
    FOREIGN KEY ("task_id", "project_id", "chapter_id") REFERENCES "generation_tasks" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_layout_composition_applications_result"
    CHECK (
      (result = 'initial_working_copy' AND base_document_digest IS NULL)
      OR
      (result = 'pending_command' AND base_document_digest IS NOT NULL)
    ),
  CONSTRAINT "ck_layout_composition_applications_digest_format"
    CHECK (
      (base_document_digest IS NULL OR (
        length(base_document_digest) = 71
        AND substr(base_document_digest, 1, 7) = 'sha256:'
        AND substr(base_document_digest, 8) = lower(substr(base_document_digest, 8))
        AND substr(base_document_digest, 8) NOT GLOB '*[^0-9a-f]*'
      ))
      AND length(result_document_digest) = 71
      AND substr(result_document_digest, 1, 7) = 'sha256:'
      AND substr(result_document_digest, 8) = lower(substr(result_document_digest, 8))
      AND substr(result_document_digest, 8) NOT GLOB '*[^0-9a-f]*'
    ),
  CONSTRAINT "ck_layout_composition_applications_row_version"
    CHECK (typeof(target_row_version) = 'integer' AND target_row_version >= 0)
);

CREATE UNIQUE INDEX "uq_layout_composition_applications_task"
ON "layout_composition_applications" ("task_id" ASC);

CREATE UNIQUE INDEX "uq_layout_composition_applications_task_scope"
ON "layout_composition_applications" ("task_id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_layout_composition_applications_scope_created"
ON "layout_composition_applications" ("project_id" ASC, "chapter_id" ASC, "created_at" DESC);

CREATE TRIGGER "trg_layout_composition_applications_insert"
BEFORE INSERT ON "layout_composition_applications"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_M4:LAYOUT_COMPOSITION_APPLICATION_TASK_INVALID')
  WHERE NOT EXISTS (
    SELECT 1
    FROM "generation_tasks" AS task
    WHERE task."id" = NEW."task_id"
      AND task."project_id" = NEW."project_id"
      AND task."chapter_id" = NEW."chapter_id"
      AND task."type" = 'layout_compose'
      AND task."record_kind" = 'runtime'
      AND task."target_type" = 'chapter'
      AND task."target_id" = NEW."chapter_id"
      AND task."status" = 'succeeded'
      AND task."output_json" IS NOT NULL
  );

  SELECT RAISE(ABORT, 'AIR_M4:LAYOUT_COMPOSITION_APPLICATION_TARGET_INVALID')
  WHERE (
    NEW."result" = 'initial_working_copy'
    AND NOT EXISTS (
      SELECT 1
      FROM "layout_working_copies" AS working_copy
      WHERE working_copy."id" = NEW."target_id"
        AND working_copy."project_id" = NEW."project_id"
        AND working_copy."chapter_id" = NEW."chapter_id"
        AND working_copy."document_kind" = 'layout_document_v2'
        AND working_copy."document_digest" = NEW."result_document_digest"
        AND working_copy."row_version" = NEW."target_row_version"
    )
  )
  OR (
    NEW."result" = 'pending_command'
    AND NOT EXISTS (
      SELECT 1
      FROM "pending_dialogue_artifacts" AS pending
      WHERE pending."id" = NEW."target_id"
        AND pending."project_id" = NEW."project_id"
        AND pending."chapter_id" = NEW."chapter_id"
        AND pending."kind" = 'layout_editor_command_set'
        AND pending."status" = 'pending'
        AND json_extract(pending."payload_json", '$.baseDocumentDigest') = NEW."base_document_digest"
        AND json_extract(pending."payload_json", '$.resultDocumentDigest') = NEW."result_document_digest"
        AND json_extract(pending."payload_json", '$.expectedRowVersion') = NEW."target_row_version"
    )
  );
END;

CREATE TRIGGER "trg_layout_composition_applications_immutable_update"
BEFORE UPDATE ON "layout_composition_applications"
WHEN 1
BEGIN
  SELECT RAISE(ABORT, 'AIR_M4:LAYOUT_COMPOSITION_APPLICATION_IMMUTABLE');
END;
