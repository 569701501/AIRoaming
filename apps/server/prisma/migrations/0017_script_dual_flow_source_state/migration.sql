-- A+ script dual-flow source/state foundation.
-- This migration keeps the existing ChapterScript/StoryStructure payloads intact.
-- It adds immutable import provenance, one confirmed boundary decision, per-chapter
-- import state, and sealed provenance for the existing pending-script container.

ALTER TABLE "chapter_script_pending" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "chapter_script_pending" ADD COLUMN "source_policy_version" TEXT;
ALTER TABLE "chapter_script_pending" ADD COLUMN "source_projection_json" JSONB;
ALTER TABLE "chapter_script_pending" ADD COLUMN "source_set_digest" TEXT;
ALTER TABLE "chapter_script_pending" ADD COLUMN "source_set_sealed_at" DATETIME;

CREATE TABLE "script_raw_source_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL,
  "input_mode" TEXT NOT NULL,
  "content_type_hint" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "document_count" INTEGER NOT NULL,
  "block_count" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_script_raw_source_versions_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_raw_source_versions_shape" CHECK (
    typeof("version") = 'integer' AND "version" >= 1
    AND "schema_version" = 'script-raw-source/1.0'
    AND "input_mode" IN ('upload', 'paste', 'mixed')
    AND "content_type_hint" IN ('script', 'story_prose', 'scene_draft', 'mixed', 'unknown')
    AND typeof("document_count") = 'integer' AND "document_count" >= 1
    AND typeof("block_count") = 'integer' AND "block_count" >= 1
    AND length("source_digest") = 71 AND substr("source_digest", 1, 7) = 'sha256:'
    AND substr("source_digest", 8) = lower(substr("source_digest", 8))
    AND substr("source_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE TABLE "script_raw_source_documents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "raw_source_version_id" TEXT NOT NULL,
  "source_ref" TEXT NOT NULL,
  "source_order" INTEGER NOT NULL,
  "source_name" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_script_raw_source_documents_version" FOREIGN KEY ("raw_source_version_id") REFERENCES "script_raw_source_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_raw_source_documents_shape" CHECK (
    typeof("source_order") = 'integer' AND "source_order" >= 1
    AND length(trim("source_ref")) > 0 AND length(trim("source_name")) > 0
    AND length(trim("media_type")) > 0 AND length(trim("source_text")) > 0
    AND instr("source_text", char(0)) = 0
    AND length("source_digest") = 71 AND substr("source_digest", 1, 7) = 'sha256:'
    AND substr("source_digest", 8) = lower(substr("source_digest", 8))
    AND substr("source_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE TABLE "script_raw_source_blocks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "raw_source_version_id" TEXT NOT NULL,
  "source_document_id" TEXT NOT NULL,
  "source_ref" TEXT NOT NULL,
  "block_ref" TEXT NOT NULL,
  "global_order" INTEGER NOT NULL,
  "source_order" INTEGER NOT NULL,
  "locator_label" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_script_raw_source_blocks_version" FOREIGN KEY ("raw_source_version_id") REFERENCES "script_raw_source_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_raw_source_blocks_document" FOREIGN KEY ("source_document_id") REFERENCES "script_raw_source_documents" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_raw_source_blocks_shape" CHECK (
    typeof("global_order") = 'integer' AND "global_order" >= 1
    AND typeof("source_order") = 'integer' AND "source_order" >= 1
    AND length(trim("source_ref")) > 0 AND length(trim("block_ref")) > 0
    AND length(trim("locator_label")) > 0 AND length(trim("source_text")) > 0
    AND "kind" IN ('narrative', 'title', 'non_story')
    AND length("source_digest") = 71 AND substr("source_digest", 1, 7) = 'sha256:'
    AND substr("source_digest", 8) = lower(substr("source_digest", 8))
    AND substr("source_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE TABLE "script_import_analysis_candidates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "raw_source_version_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "contract_version" TEXT NOT NULL,
  "analysis_json" JSONB NOT NULL,
  "analysis_digest" TEXT NOT NULL,
  "validation_json" JSONB NOT NULL,
  "validation_digest" TEXT NOT NULL,
  "candidate_digest" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "prompt_pack_version" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" DATETIME,
  CONSTRAINT "fk_script_import_analysis_candidates_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_import_analysis_candidates_source" FOREIGN KEY ("raw_source_version_id") REFERENCES "script_raw_source_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_import_analysis_candidates_shape" CHECK (
    typeof("version") = 'integer' AND "version" >= 1
    AND "status" IN ('active', 'confirmed', 'superseded', 'cancelled')
    AND "contract_version" = 'import-analysis/1.0'
    AND json_valid("analysis_json") = 1 AND json_valid("validation_json") = 1
    AND length(trim("prompt_pack_version")) > 0
    AND ("status" = 'active') = ("resolved_at" IS NULL)
    AND length("analysis_digest") = 71 AND substr("analysis_digest", 1, 7) = 'sha256:'
    AND length("validation_digest") = 71 AND substr("validation_digest", 1, 7) = 'sha256:'
    AND length("candidate_digest") = 71 AND substr("candidate_digest", 1, 7) = 'sha256:'
    AND length("source_digest") = 71 AND substr("source_digest", 1, 7) = 'sha256:'
  )
);

CREATE TABLE "script_chapter_maps" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "raw_source_version_id" TEXT NOT NULL,
  "analysis_candidate_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL,
  "map_json" JSONB NOT NULL,
  "map_digest" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "analysis_digest" TEXT NOT NULL,
  "confirmed_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_script_chapter_maps_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_chapter_maps_source" FOREIGN KEY ("raw_source_version_id") REFERENCES "script_raw_source_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_chapter_maps_candidate" FOREIGN KEY ("analysis_candidate_id") REFERENCES "script_import_analysis_candidates" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_chapter_maps_shape" CHECK (
    typeof("version") = 'integer' AND "version" >= 1
    AND "schema_version" = 'script-chapter-map/1.0'
    AND json_valid("map_json") = 1
    AND json_array_length(json_extract("map_json", '$.chapters')) >= 1
    AND length("map_digest") = 71 AND substr("map_digest", 1, 7) = 'sha256:'
    AND length("source_digest") = 71 AND substr("source_digest", 1, 7) = 'sha256:'
    AND length("analysis_digest") = 71 AND substr("analysis_digest", 1, 7) = 'sha256:'
  )
);

CREATE TABLE "script_import_batches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "raw_source_version_id" TEXT NOT NULL,
  "chapter_map_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "input_digest" TEXT NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" DATETIME,
  "completed_at" DATETIME,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_script_import_batches_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_import_batches_source" FOREIGN KEY ("raw_source_version_id") REFERENCES "script_raw_source_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_import_batches_map" FOREIGN KEY ("chapter_map_id") REFERENCES "script_chapter_maps" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_import_batches_shape" CHECK (
    "status" IN ('queued', 'processing', 'ready_for_review', 'partial_failure', 'failed', 'completed', 'cancelled')
    AND typeof("row_version") = 'integer' AND "row_version" >= 0
    AND length("input_digest") = 71 AND substr("input_digest", 1, 7) = 'sha256:'
    AND ("status" NOT IN ('completed', 'cancelled') OR "completed_at" IS NOT NULL)
  )
);

CREATE TABLE "script_import_batch_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "map_item_ref" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "source_range_digest" TEXT NOT NULL,
  "output_digest" TEXT,
  "error_code" TEXT,
  "error_json" JSONB,
  "confirmed_script_version_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "completed_at" DATETIME,
  CONSTRAINT "fk_script_import_batch_items_batch" FOREIGN KEY ("batch_id") REFERENCES "script_import_batches" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_import_batch_items_chapter" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_script_import_batch_items_script" FOREIGN KEY ("confirmed_script_version_id") REFERENCES "chapter_script_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_import_batch_items_shape" CHECK (
    typeof("order") = 'integer' AND "order" >= 1
    AND typeof("attempt") = 'integer' AND "attempt" >= 0
    AND typeof("row_version") = 'integer' AND "row_version" >= 0
    AND length(trim("map_item_ref")) > 0
    AND "status" IN ('queued', 'materializing', 'verifying', 'pending_ready', 'generation_failed', 'confirmed')
    AND length("source_range_digest") = 71 AND substr("source_range_digest", 1, 7) = 'sha256:'
    AND ("output_digest" IS NULL OR (length("output_digest") = 71 AND substr("output_digest", 1, 7) = 'sha256:'))
    AND ("error_json" IS NULL OR json_valid("error_json") = 1)
    AND ("status" = 'confirmed') = ("confirmed_script_version_id" IS NOT NULL)
    AND ("status" NOT IN ('pending_ready', 'confirmed') OR "output_digest" IS NOT NULL)
  )
);

CREATE TABLE "script_import_fidelity_reports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batch_item_id" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "contract_version" TEXT NOT NULL,
  "report_json" JSONB NOT NULL,
  "report_digest" TEXT NOT NULL,
  "source_range_digest" TEXT NOT NULL,
  "candidate_digest" TEXT NOT NULL,
  "has_hard_issues" BOOLEAN NOT NULL,
  "materialize_prompt_version" TEXT NOT NULL,
  "verify_prompt_version" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_script_import_fidelity_reports_item" FOREIGN KEY ("batch_item_id") REFERENCES "script_import_batch_items" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_script_import_fidelity_reports_shape" CHECK (
    typeof("attempt") = 'integer' AND "attempt" >= 1
    AND typeof("sequence") = 'integer' AND "sequence" >= 1
    AND "contract_version" = 'import-fidelity/1.0'
    AND json_valid("report_json") = 1
    AND "has_hard_issues" IN (0, 1)
    AND length(trim("materialize_prompt_version")) > 0
    AND length(trim("verify_prompt_version")) > 0
    AND length("report_digest") = 71 AND substr("report_digest", 1, 7) = 'sha256:'
    AND length("source_range_digest") = 71 AND substr("source_range_digest", 1, 7) = 'sha256:'
    AND length("candidate_digest") = 71 AND substr("candidate_digest", 1, 7) = 'sha256:'
  )
);

CREATE TABLE "chapter_script_pending_source_bindings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pending_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_chapter_script_pending_sources_pending" FOREIGN KEY ("pending_id") REFERENCES "chapter_script_pending" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_chapter_script_pending_sources_shape" CHECK (
    typeof("order") = 'integer' AND "order" >= 1
    AND length(trim("role")) > 0 AND length(trim("source_type")) > 0 AND length(trim("source_id")) > 0
    AND length("source_digest") = 71 AND substr("source_digest", 1, 7) = 'sha256:'
    AND substr("source_digest", 8) = lower(substr("source_digest", 8))
    AND substr("source_digest", 8) NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE UNIQUE INDEX "uq_script_raw_source_versions_project_version" ON "script_raw_source_versions" ("project_id", "version");
CREATE UNIQUE INDEX "uq_script_raw_source_versions_project_digest" ON "script_raw_source_versions" ("project_id", "source_digest");
CREATE UNIQUE INDEX "uq_script_raw_source_versions_id_project" ON "script_raw_source_versions" ("id", "project_id");
CREATE UNIQUE INDEX "uq_script_raw_source_documents_version_ref" ON "script_raw_source_documents" ("raw_source_version_id", "source_ref");
CREATE UNIQUE INDEX "uq_script_raw_source_documents_version_order" ON "script_raw_source_documents" ("raw_source_version_id", "source_order");
CREATE UNIQUE INDEX "uq_script_raw_source_documents_id_version" ON "script_raw_source_documents" ("id", "raw_source_version_id");
CREATE UNIQUE INDEX "uq_script_raw_source_blocks_version_ref" ON "script_raw_source_blocks" ("raw_source_version_id", "block_ref");
CREATE UNIQUE INDEX "uq_script_raw_source_blocks_version_global_order" ON "script_raw_source_blocks" ("raw_source_version_id", "global_order");
CREATE UNIQUE INDEX "uq_script_raw_source_blocks_document_order" ON "script_raw_source_blocks" ("source_document_id", "source_order");
CREATE UNIQUE INDEX "uq_script_import_analysis_candidates_source_version" ON "script_import_analysis_candidates" ("raw_source_version_id", "version");
CREATE UNIQUE INDEX "uq_script_import_analysis_candidates_scope" ON "script_import_analysis_candidates" ("id", "project_id", "raw_source_version_id");
CREATE UNIQUE INDEX "uq_script_import_analysis_candidates_active" ON "script_import_analysis_candidates" ("raw_source_version_id") WHERE "status" = 'active';
CREATE INDEX "ix_script_import_analysis_candidates_project_status" ON "script_import_analysis_candidates" ("project_id", "status");
CREATE UNIQUE INDEX "uq_script_chapter_maps_analysis_candidate" ON "script_chapter_maps" ("analysis_candidate_id");
CREATE UNIQUE INDEX "uq_script_chapter_maps_source_version" ON "script_chapter_maps" ("raw_source_version_id", "version");
CREATE UNIQUE INDEX "uq_script_chapter_maps_scope" ON "script_chapter_maps" ("id", "project_id", "raw_source_version_id");
CREATE UNIQUE INDEX "uq_script_import_batches_chapter_map" ON "script_import_batches" ("chapter_map_id");
CREATE UNIQUE INDEX "uq_script_import_batches_id_project" ON "script_import_batches" ("id", "project_id");
CREATE INDEX "ix_script_import_batches_project_status" ON "script_import_batches" ("project_id", "status");
CREATE UNIQUE INDEX "uq_script_import_batch_items_batch_order" ON "script_import_batch_items" ("batch_id", "order");
CREATE UNIQUE INDEX "uq_script_import_batch_items_batch_map_ref" ON "script_import_batch_items" ("batch_id", "map_item_ref");
CREATE UNIQUE INDEX "uq_script_import_batch_items_batch_chapter" ON "script_import_batch_items" ("batch_id", "chapter_id");
CREATE INDEX "ix_script_import_batch_items_chapter_status" ON "script_import_batch_items" ("chapter_id", "status");
CREATE UNIQUE INDEX "uq_script_import_fidelity_reports_item_attempt_sequence" ON "script_import_fidelity_reports" ("batch_item_id", "attempt", "sequence");
CREATE INDEX "ix_script_import_fidelity_reports_item_created_at" ON "script_import_fidelity_reports" ("batch_item_id", "created_at" DESC);
CREATE UNIQUE INDEX "uq_chapter_script_pending_sources_pending_order" ON "chapter_script_pending_source_bindings" ("pending_id", "order");
CREATE UNIQUE INDEX "uq_chapter_script_pending_sources_identity" ON "chapter_script_pending_source_bindings" ("pending_id", "role", "source_type", "source_id");

-- Source and confirmed-decision scope/immutability.
CREATE TRIGGER "trg_script_raw_source_versions_insert"
BEFORE INSERT ON "script_raw_source_versions"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:RAW_SOURCE_SCOPE_INVALID')
  WHERE NOT EXISTS (SELECT 1 FROM "projects" WHERE "id" = NEW."project_id" AND "lifecycle_status" = 'active');
END;

CREATE TRIGGER "trg_script_raw_source_versions_update"
BEFORE UPDATE ON "script_raw_source_versions"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:RAW_SOURCE_IMMUTABLE');
END;

CREATE TRIGGER "trg_script_raw_source_documents_insert"
BEFORE INSERT ON "script_raw_source_documents"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:RAW_DOCUMENT_SCOPE_INVALID')
  WHERE NOT EXISTS (SELECT 1 FROM "script_raw_source_versions" WHERE "id" = NEW."raw_source_version_id");
END;

CREATE TRIGGER "trg_script_raw_source_documents_update"
BEFORE UPDATE ON "script_raw_source_documents"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:RAW_DOCUMENT_IMMUTABLE');
END;

CREATE TRIGGER "trg_script_raw_source_blocks_insert"
BEFORE INSERT ON "script_raw_source_blocks"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:RAW_BLOCK_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "script_raw_source_documents" AS document
    WHERE document."id" = NEW."source_document_id"
      AND document."raw_source_version_id" = NEW."raw_source_version_id"
      AND document."source_ref" = NEW."source_ref"
  );
END;

CREATE TRIGGER "trg_script_raw_source_blocks_update"
BEFORE UPDATE ON "script_raw_source_blocks"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:RAW_BLOCK_IMMUTABLE');
END;

CREATE TRIGGER "trg_script_import_analysis_candidates_insert"
BEFORE INSERT ON "script_import_analysis_candidates"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:ANALYSIS_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "script_raw_source_versions" AS source
    JOIN "projects" AS project ON project."id" = source."project_id"
    WHERE source."id" = NEW."raw_source_version_id"
      AND source."project_id" = NEW."project_id"
      AND source."source_digest" = NEW."source_digest"
      AND project."lifecycle_status" = 'active'
  );
END;

CREATE TRIGGER "trg_script_import_analysis_candidates_update"
BEFORE UPDATE ON "script_import_analysis_candidates"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:ANALYSIS_CONTENT_IMMUTABLE')
  WHERE NEW."id" IS NOT OLD."id"
    OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."raw_source_version_id" IS NOT OLD."raw_source_version_id"
    OR NEW."version" IS NOT OLD."version"
    OR NEW."contract_version" IS NOT OLD."contract_version"
    OR NEW."analysis_json" IS NOT OLD."analysis_json"
    OR NEW."analysis_digest" IS NOT OLD."analysis_digest"
    OR NEW."validation_json" IS NOT OLD."validation_json"
    OR NEW."validation_digest" IS NOT OLD."validation_digest"
    OR NEW."candidate_digest" IS NOT OLD."candidate_digest"
    OR NEW."source_digest" IS NOT OLD."source_digest"
    OR NEW."prompt_pack_version" IS NOT OLD."prompt_pack_version"
    OR NEW."created_at" IS NOT OLD."created_at";
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:ANALYSIS_TRANSITION_INVALID')
  WHERE OLD."status" <> 'active'
    OR NEW."status" NOT IN ('confirmed', 'superseded', 'cancelled')
    OR NEW."resolved_at" IS NULL;
END;

CREATE TRIGGER "trg_script_chapter_maps_insert"
BEFORE INSERT ON "script_chapter_maps"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:CHAPTER_MAP_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "script_import_analysis_candidates" AS candidate
    JOIN "script_raw_source_versions" AS source ON source."id" = candidate."raw_source_version_id"
    WHERE candidate."id" = NEW."analysis_candidate_id"
      AND candidate."project_id" = NEW."project_id"
      AND candidate."raw_source_version_id" = NEW."raw_source_version_id"
      AND candidate."status" = 'confirmed'
      AND candidate."analysis_digest" = NEW."analysis_digest"
      AND source."source_digest" = NEW."source_digest"
  );
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:CHAPTER_MAP_DOCUMENT_INVALID')
  WHERE json_extract(NEW."map_json", '$.schemaVersion') <> 'script-chapter-map/1.0'
    OR json_extract(NEW."map_json", '$.rawSourceDigest') IS NOT NEW."source_digest"
    OR json_extract(NEW."map_json", '$.analysisDigest') IS NOT NEW."analysis_digest";
END;

CREATE TRIGGER "trg_script_chapter_maps_update"
BEFORE UPDATE ON "script_chapter_maps"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:CHAPTER_MAP_IMMUTABLE');
END;

CREATE TRIGGER "trg_script_import_batches_insert"
BEFORE INSERT ON "script_import_batches"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_BATCH_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "script_chapter_maps" AS map
    JOIN "projects" AS project ON project."id" = map."project_id"
    WHERE map."id" = NEW."chapter_map_id"
      AND map."project_id" = NEW."project_id"
      AND map."raw_source_version_id" = NEW."raw_source_version_id"
      AND map."map_digest" = NEW."input_digest"
      AND project."lifecycle_status" = 'active'
  );
END;

CREATE TRIGGER "trg_script_import_batches_update"
BEFORE UPDATE ON "script_import_batches"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_BATCH_IDENTITY_IMMUTABLE')
  WHERE NEW."id" IS NOT OLD."id" OR NEW."project_id" IS NOT OLD."project_id"
    OR NEW."raw_source_version_id" IS NOT OLD."raw_source_version_id"
    OR NEW."chapter_map_id" IS NOT OLD."chapter_map_id"
    OR NEW."input_digest" IS NOT OLD."input_digest" OR NEW."created_at" IS NOT OLD."created_at";
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_BATCH_CAS_INVALID')
  WHERE NEW."row_version" <> OLD."row_version" + 1 OR NEW."updated_at" IS OLD."updated_at";
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_BATCH_TRANSITION_INVALID')
  WHERE (OLD."status" = 'queued' AND NEW."status" NOT IN ('processing', 'cancelled'))
     OR (OLD."status" = 'processing' AND NEW."status" NOT IN ('ready_for_review', 'partial_failure', 'failed', 'cancelled'))
     OR (OLD."status" IN ('ready_for_review', 'partial_failure') AND NEW."status" NOT IN ('completed', 'processing', 'cancelled'))
     OR OLD."status" IN ('failed', 'completed', 'cancelled');
END;

CREATE TRIGGER "trg_script_import_batch_items_insert"
BEFORE INSERT ON "script_import_batch_items"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_ITEM_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "script_import_batches" AS batch
    JOIN "chapters" AS chapter ON chapter."id" = NEW."chapter_id"
    JOIN "script_chapter_maps" AS map ON map."id" = batch."chapter_map_id"
    JOIN json_each(map."map_json", '$.chapters') AS map_item
    WHERE batch."id" = NEW."batch_id"
      AND chapter."project_id" = batch."project_id"
      AND json_extract(map_item.value, '$.mapItemRef') = NEW."map_item_ref"
      AND json_extract(map_item.value, '$.order') = NEW."order"
      AND json_extract(map_item.value, '$.sourceRangeDigest') = NEW."source_range_digest"
  );
END;

CREATE TRIGGER "trg_script_import_batch_items_update"
BEFORE UPDATE ON "script_import_batch_items"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_ITEM_IDENTITY_IMMUTABLE')
  WHERE NEW."id" IS NOT OLD."id" OR NEW."batch_id" IS NOT OLD."batch_id"
    OR NEW."chapter_id" IS NOT OLD."chapter_id" OR NEW."map_item_ref" IS NOT OLD."map_item_ref"
    OR NEW."order" IS NOT OLD."order" OR NEW."source_range_digest" IS NOT OLD."source_range_digest"
    OR NEW."created_at" IS NOT OLD."created_at";
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_ITEM_CAS_INVALID')
  WHERE NEW."row_version" <> OLD."row_version" + 1 OR NEW."updated_at" IS OLD."updated_at";
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_ITEM_TRANSITION_INVALID')
  WHERE (OLD."status" = 'queued' AND NEW."status" NOT IN ('materializing', 'generation_failed'))
     OR (OLD."status" = 'materializing' AND NEW."status" NOT IN ('verifying', 'generation_failed'))
     OR (OLD."status" = 'verifying' AND NEW."status" NOT IN ('pending_ready', 'generation_failed'))
     OR (OLD."status" = 'generation_failed' AND NEW."status" NOT IN ('materializing'))
     OR (OLD."status" = 'pending_ready' AND NEW."status" NOT IN ('confirmed'))
     OR OLD."status" = 'confirmed';
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:IMPORT_ITEM_SCRIPT_SCOPE_INVALID')
  WHERE NEW."confirmed_script_version_id" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "chapter_script_versions" WHERE "id" = NEW."confirmed_script_version_id" AND "chapter_id" = NEW."chapter_id" AND "source_digest" = NEW."output_digest");
END;

CREATE TRIGGER "trg_script_import_fidelity_reports_insert"
BEFORE INSERT ON "script_import_fidelity_reports"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:FIDELITY_SCOPE_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "script_import_batch_items" AS item
    WHERE item."id" = NEW."batch_item_id"
      AND item."status" = 'verifying'
      AND item."attempt" = NEW."attempt"
      AND item."source_range_digest" = NEW."source_range_digest"
      AND item."output_digest" = NEW."candidate_digest"
  );
END;

CREATE TRIGGER "trg_script_import_fidelity_reports_update"
BEFORE UPDATE ON "script_import_fidelity_reports"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:FIDELITY_REPORT_IMMUTABLE');
END;

-- Pending provenance is written as rows, then sealed once. Existing rows remain
-- legacy and intentionally do not receive invented historical provenance.
CREATE TRIGGER "trg_script_pending_source_shape_insert"
BEFORE INSERT ON "chapter_script_pending"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:PENDING_SOURCE_SHAPE_INVALID')
  WHERE NEW."kind" NOT IN ('legacy', 'ai', 'import')
    OR (NEW."kind" = 'legacy' AND (NEW."source_policy_version" IS NOT NULL OR NEW."source_projection_json" IS NOT NULL OR NEW."source_set_digest" IS NOT NULL OR NEW."source_set_sealed_at" IS NOT NULL))
    OR (NEW."kind" IN ('ai', 'import') AND (NEW."source_policy_version" IS NULL OR NEW."source_projection_json" IS NOT NULL OR NEW."source_set_digest" IS NOT NULL OR NEW."source_set_sealed_at" IS NOT NULL))
    OR (NEW."kind" = 'ai' AND NEW."source_policy_version" <> 'ai-chapter-generate/1.0')
    OR (NEW."kind" = 'import' AND NEW."source_policy_version" <> 'import-chapter-materialize/1.0');
END;

CREATE TRIGGER "trg_script_pending_source_shape_update"
BEFORE UPDATE ON "chapter_script_pending"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:PENDING_SOURCE_IDENTITY_IMMUTABLE')
  WHERE NEW."kind" IS NOT OLD."kind" OR NEW."source_policy_version" IS NOT OLD."source_policy_version"
    OR (OLD."source_set_sealed_at" IS NOT NULL AND (
      NEW."source_projection_json" IS NOT OLD."source_projection_json"
      OR NEW."source_set_digest" IS NOT OLD."source_set_digest"
      OR NEW."source_set_sealed_at" IS NOT OLD."source_set_sealed_at"
    ));
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:PENDING_SOURCE_SEAL_INVALID')
  WHERE OLD."source_set_sealed_at" IS NULL
    AND NEW."source_set_sealed_at" IS NOT NULL
    AND (
      OLD."kind" NOT IN ('ai', 'import')
      OR NEW."source_projection_json" IS NULL OR json_valid(NEW."source_projection_json") <> 1
      OR json_extract(NEW."source_projection_json", '$.schemaVersion') <> 'script-pending-sources/1.0'
      OR json_extract(NEW."source_projection_json", '$.kind') IS NOT OLD."kind"
      OR json_extract(NEW."source_projection_json", '$.policyVersion') IS NOT OLD."source_policy_version"
      OR NEW."source_set_digest" IS NULL OR length(NEW."source_set_digest") <> 71 OR substr(NEW."source_set_digest", 1, 7) <> 'sha256:'
      OR NEW."row_version" <> OLD."row_version" + 1
      OR (SELECT COUNT(*) FROM json_each(NEW."source_projection_json", '$.bindings')) <> (SELECT COUNT(*) FROM "chapter_script_pending_source_bindings" WHERE "pending_id" = OLD."id")
      OR EXISTS (
        SELECT 1 FROM "chapter_script_pending_source_bindings" AS binding
        WHERE binding."pending_id" = OLD."id"
          AND NOT EXISTS (
            SELECT 1 FROM json_each(NEW."source_projection_json", '$.bindings') AS projected
            WHERE json_extract(projected.value, '$.role') = binding."role"
              AND json_extract(projected.value, '$.order') = binding."order"
              AND json_extract(projected.value, '$.sourceType') = binding."source_type"
              AND json_extract(projected.value, '$.sourceId') = binding."source_id"
              AND json_extract(projected.value, '$.sourceDigest') = binding."source_digest"
          )
      )
    );
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:PENDING_SOURCE_PARTIAL_INVALID')
  WHERE (NEW."source_projection_json" IS NULL) <> (NEW."source_set_digest" IS NULL)
     OR (NEW."source_projection_json" IS NULL) <> (NEW."source_set_sealed_at" IS NULL);
END;

CREATE TRIGGER "trg_script_pending_source_bindings_insert"
BEFORE INSERT ON "chapter_script_pending_source_bindings"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:PENDING_SOURCE_BINDING_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM "chapter_script_pending" AS pending
    WHERE pending."id" = NEW."pending_id"
      AND pending."kind" IN ('ai', 'import')
      AND pending."source_set_sealed_at" IS NULL
      AND (
        (pending."kind" = 'ai' AND (
          (NEW."role" = 'outline' AND NEW."source_type" = 'project_script_outline')
          OR (NEW."role" = 'chapter_card' AND NEW."source_type" = 'project_script_outline_card')
          OR (NEW."role" = 'previous_script' AND NEW."source_type" = 'chapter_script_version')
        ))
        OR (pending."kind" = 'import' AND (
          (NEW."role" = 'raw_source' AND NEW."source_type" = 'script_raw_source_version')
          OR (NEW."role" = 'analysis' AND NEW."source_type" = 'script_import_analysis_candidate')
          OR (NEW."role" = 'chapter_map' AND NEW."source_type" = 'script_chapter_map')
          OR (NEW."role" = 'map_item' AND NEW."source_type" = 'script_chapter_map_item')
          OR (NEW."role" = 'batch_item' AND NEW."source_type" = 'script_import_batch_item')
          OR (NEW."role" = 'fidelity_report' AND NEW."source_type" = 'script_import_fidelity_report')
        ))
      )
  );
END;

CREATE TRIGGER "trg_script_pending_source_bindings_update"
BEFORE UPDATE ON "chapter_script_pending_source_bindings"
BEGIN
  SELECT RAISE(ABORT, 'AIR_SCRIPT_FLOW:PENDING_SOURCE_BINDING_IMMUTABLE');
END;
