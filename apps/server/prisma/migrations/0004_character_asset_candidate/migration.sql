-- G1 deterministic base migration: 0004_character_asset_candidate

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "characters" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL DEFAULT 'human',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "appearance" TEXT NOT NULL,
  "personality" TEXT NOT NULL,
  "prompt_fragment" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "preview_visual_id" TEXT,
  "primary_visual_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "finalized_at" DATETIME,
  CONSTRAINT "fk_characters_preview_visual_id__character_visuals" FOREIGN KEY ("preview_visual_id") REFERENCES "character_visuals" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_characters_primary_visual_id__character_visuals" FOREIGN KEY ("primary_visual_id") REFERENCES "character_visuals" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_characters_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "character_visuals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "character_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "source_visual_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'available',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" DATETIME,
  CONSTRAINT "fk_character_visuals_asset_id__assets" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_character_visuals_character_id__characters" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_character_visuals_source_visual_id__character_visuals" FOREIGN KEY ("source_visual_id") REFERENCES "character_visuals" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "assets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT,
  "type" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'staged',
  "sha256" TEXT,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "duration_ms" INTEGER,
  "source_task_id" TEXT,
  "metadata_json" JSONB NOT NULL,
  "metadata_schema_version" INTEGER NOT NULL,
  "metadata_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "ready_at" DATETIME,
  "failed_at" DATETIME,
  "deleting_at" DATETIME,
  CONSTRAINT "fk_assets_chapter_id_project_id__chapters" FOREIGN KEY ("chapter_id", "project_id") REFERENCES "chapters" ("id", "project_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_assets_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_assets_source_task_id__generation_tasks" FOREIGN KEY ("source_task_id") REFERENCES "generation_tasks" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "candidates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "shot_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generated',
  "favorite_at" DATETIME,
  "label" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "score" REAL,
  "prompt_digest" TEXT,
  "generation_purpose" TEXT NOT NULL,
  "generation_spec_version" INTEGER,
  "generation_spec_digest" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_candidates_asset_id_project_id_chapter_id__assets" FOREIGN KEY ("asset_id", "project_id", "chapter_id") REFERENCES "assets" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_candidates_shot_id_project_id_chapter_id__shots" FOREIGN KEY ("shot_id", "project_id", "chapter_id") REFERENCES "shots" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_candidates_task_id_project_id_chapter_id__generation_tasks" FOREIGN KEY ("task_id", "project_id", "chapter_id") REFERENCES "generation_tasks" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "candidate_lock_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "shot_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "candidate_id" TEXT,
  "previous_revision_id" TEXT,
  "origin" TEXT NOT NULL,
  "reason" TEXT,
  "decided_at" DATETIME,
  "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_candidate_lock_revisions_candidate_id_shot_id_project_id_chapter_id__candidates" FOREIGN KEY ("candidate_id", "shot_id", "project_id", "chapter_id") REFERENCES "candidates" ("id", "shot_id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_candidate_lock_revisions_previous_revision_id_shot_id_project_id_chapter_id__candidate_lock_revisions" FOREIGN KEY ("previous_revision_id", "shot_id", "project_id", "chapter_id") REFERENCES "candidate_lock_revisions" ("id", "shot_id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_candidate_lock_revisions_shot_id_project_id_chapter_id__shots" FOREIGN KEY ("shot_id", "project_id", "chapter_id") REFERENCES "shots" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_characters_id_project" ON "characters" ("id" ASC, "project_id" ASC);

CREATE UNIQUE INDEX "uq_characters_project_normalized_name" ON "characters" ("project_id" ASC, "normalized_name" ASC);

CREATE INDEX "ix_characters_project_level" ON "characters" ("project_id" ASC, "level" ASC);

CREATE INDEX "ix_characters_project_status" ON "characters" ("project_id" ASC, "status" ASC);

CREATE UNIQUE INDEX "uq_character_visuals_asset" ON "character_visuals" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_character_visuals_character_version" ON "character_visuals" ("character_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_character_visuals_id_character" ON "character_visuals" ("id" ASC, "character_id" ASC);

CREATE INDEX "ix_character_visuals_source_visual" ON "character_visuals" ("source_visual_id" ASC);

CREATE UNIQUE INDEX "uq_assets_id_scope" ON "assets" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_assets_storage_key" ON "assets" ("storage_key" ASC);

CREATE INDEX "ix_assets_chapter_role" ON "assets" ("chapter_id" ASC, "role" ASC);

CREATE INDEX "ix_assets_project_status_type" ON "assets" ("project_id" ASC, "status" ASC, "type" ASC);

CREATE INDEX "ix_assets_source_task" ON "assets" ("source_task_id" ASC);

CREATE UNIQUE INDEX "uq_candidates_asset" ON "candidates" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_candidates_id_scope_shot" ON "candidates" ("id" ASC, "project_id" ASC, "chapter_id" ASC, "shot_id" ASC);

CREATE UNIQUE INDEX "uq_candidates_task_shot_index" ON "candidates" ("task_id" ASC, "shot_id" ASC, "index" ASC);

CREATE INDEX "ix_candidates_chapter_created_at" ON "candidates" ("chapter_id" ASC, "created_at" ASC);

CREATE INDEX "ix_candidates_shot_status" ON "candidates" ("shot_id" ASC, "status" ASC);

CREATE UNIQUE INDEX "uq_candidate_lock_revisions_id_scope_shot" ON "candidate_lock_revisions" ("id" ASC, "project_id" ASC, "chapter_id" ASC, "shot_id" ASC);

CREATE UNIQUE INDEX "uq_candidate_lock_revisions_shot_revision" ON "candidate_lock_revisions" ("shot_id" ASC, "revision" ASC);

CREATE INDEX "ix_candidate_lock_revisions_candidate" ON "candidate_lock_revisions" ("candidate_id" ASC);

CREATE INDEX "ix_candidate_lock_revisions_previous" ON "candidate_lock_revisions" ("previous_revision_id" ASC);

CREATE INDEX "ix_candidate_lock_revisions_scope_revision" ON "candidate_lock_revisions" ("project_id" ASC, "chapter_id" ASC, "shot_id" ASC, "revision" DESC);

COMMIT;
