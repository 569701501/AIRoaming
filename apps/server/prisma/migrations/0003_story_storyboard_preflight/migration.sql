-- G1 deterministic base migration: 0003_story_storyboard_preflight

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "story_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "source_script_version_id" TEXT,
  "source_policy_version" TEXT,
  "source_digest" TEXT,
  "document_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "document_digest" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "confirmed_at" DATETIME,
  "archived_at" DATETIME,
  CONSTRAINT "fk_story_versions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_story_versions_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_story_versions_source_script_version_id__chapter_script_versions" FOREIGN KEY ("source_script_version_id") REFERENCES "chapter_script_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "story_scene_projections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "story_version_id" TEXT NOT NULL,
  "chapter_scene_id" TEXT NOT NULL,
  "scene_key" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "semantic_digest" TEXT NOT NULL,
  CONSTRAINT "fk_story_scene_projections_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_story_scene_projections_story_version_id__story_versions" FOREIGN KEY ("story_version_id") REFERENCES "story_versions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "story_beat_projections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "story_version_id" TEXT NOT NULL,
  "beat_key" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "chapter_scene_id" TEXT,
  "summary" TEXT NOT NULL,
  "semantic_digest" TEXT NOT NULL,
  CONSTRAINT "fk_story_beat_projections_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_story_beat_projections_story_version_id__story_versions" FOREIGN KEY ("story_version_id") REFERENCES "story_versions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "chapter_scenes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "scene_key" TEXT NOT NULL,
  "current_visual_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_chapter_scenes_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapter_scenes_current_visual_id__scene_visuals" FOREIGN KEY ("current_visual_id") REFERENCES "scene_visuals" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapter_scenes_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "scene_visuals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chapter_scene_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "source_task_id" TEXT,
  "version" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_scene_visuals_asset_id__assets" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_scene_visuals_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_scene_visuals_source_task_id__generation_tasks" FOREIGN KEY ("source_task_id") REFERENCES "generation_tasks" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "storyboard_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "source_story_version_id" TEXT,
  "source_policy_version" TEXT,
  "source_digest" TEXT,
  "document_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "document_digest" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "confirmed_at" DATETIME,
  "archived_at" DATETIME,
  CONSTRAINT "fk_storyboard_versions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_versions_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_versions_source_story_version_id__story_versions" FOREIGN KEY ("source_story_version_id") REFERENCES "story_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "shots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "lifecycle_status" TEXT NOT NULL DEFAULT 'active',
  "current_candidate_lock_revision_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "retired_at" DATETIME,
  CONSTRAINT "fk_shots_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_shots_current_candidate_lock_revision_id__candidate_lock_revisions" FOREIGN KEY ("current_candidate_lock_revision_id") REFERENCES "candidate_lock_revisions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_shots_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "storyboard_shot_projections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storyboard_version_id" TEXT NOT NULL,
  "shot_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "story_beat_projection_id" TEXT,
  "chapter_scene_id" TEXT,
  "semantic_digest" TEXT NOT NULL,
  CONSTRAINT "fk_storyboard_shot_projections_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_shot_projections_shot_id__shots" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_shot_projections_story_beat_projection_id__story_beat_projections" FOREIGN KEY ("story_beat_projection_id") REFERENCES "story_beat_projections" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_shot_projections_storyboard_version_id__storyboard_versions" FOREIGN KEY ("storyboard_version_id") REFERENCES "storyboard_versions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "storyboard_shot_characters" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storyboard_shot_projection_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "source_token" TEXT NOT NULL,
  "character_id" TEXT,
  CONSTRAINT "fk_storyboard_shot_characters_character_id__characters" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_shot_characters_storyboard_shot_projection_id__storyboard_shot_projections" FOREIGN KEY ("storyboard_shot_projection_id") REFERENCES "storyboard_shot_projections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "preflight_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "source_storyboard_version_id" TEXT NOT NULL,
  "source_policy_version" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "document_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "document_digest" TEXT NOT NULL,
  "ready" BOOLEAN NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" DATETIME,
  CONSTRAINT "fk_preflight_revisions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_preflight_revisions_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_preflight_revisions_source_storyboard_version_id__storyboard_versions" FOREIGN KEY ("source_storyboard_version_id") REFERENCES "storyboard_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_story_versions_chapter_version" ON "story_versions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_story_versions_id_scope" ON "story_versions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_story_versions_chapter_status" ON "story_versions" ("chapter_id" ASC, "status" ASC);

CREATE INDEX "ix_story_versions_source_script" ON "story_versions" ("source_script_version_id" ASC);

CREATE UNIQUE INDEX "uq_story_scene_projections_version_key" ON "story_scene_projections" ("story_version_id" ASC, "scene_key" ASC);

CREATE UNIQUE INDEX "uq_story_scene_projections_version_order" ON "story_scene_projections" ("story_version_id" ASC, "order" ASC);

CREATE INDEX "ix_story_scene_projections_chapter_scene" ON "story_scene_projections" ("chapter_scene_id" ASC);

CREATE UNIQUE INDEX "uq_story_beat_projections_version_key" ON "story_beat_projections" ("story_version_id" ASC, "beat_key" ASC);

CREATE UNIQUE INDEX "uq_story_beat_projections_version_order" ON "story_beat_projections" ("story_version_id" ASC, "order" ASC);

CREATE INDEX "ix_story_beat_projections_chapter_scene" ON "story_beat_projections" ("chapter_scene_id" ASC);

CREATE UNIQUE INDEX "uq_chapter_scenes_chapter_key" ON "chapter_scenes" ("chapter_id" ASC, "scene_key" ASC);

CREATE UNIQUE INDEX "uq_chapter_scenes_id_scope" ON "chapter_scenes" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_scene_visuals_asset" ON "scene_visuals" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_scene_visuals_id_scene" ON "scene_visuals" ("id" ASC, "chapter_scene_id" ASC);

CREATE UNIQUE INDEX "uq_scene_visuals_scene_version" ON "scene_visuals" ("chapter_scene_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_storyboard_versions_chapter_version" ON "storyboard_versions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_storyboard_versions_id_scope" ON "storyboard_versions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_storyboard_versions_chapter_status" ON "storyboard_versions" ("chapter_id" ASC, "status" ASC);

CREATE INDEX "ix_storyboard_versions_source_story" ON "storyboard_versions" ("source_story_version_id" ASC);

CREATE UNIQUE INDEX "uq_shots_id_scope" ON "shots" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_shots_chapter_lifecycle" ON "shots" ("chapter_id" ASC, "lifecycle_status" ASC);

CREATE UNIQUE INDEX "uq_storyboard_shot_projections_version_order" ON "storyboard_shot_projections" ("storyboard_version_id" ASC, "order" ASC);

CREATE UNIQUE INDEX "uq_storyboard_shot_projections_version_shot" ON "storyboard_shot_projections" ("storyboard_version_id" ASC, "shot_id" ASC);

CREATE INDEX "ix_storyboard_shot_projections_shot" ON "storyboard_shot_projections" ("shot_id" ASC);

CREATE INDEX "ix_storyboard_shot_projections_story_beat" ON "storyboard_shot_projections" ("story_beat_projection_id" ASC);

CREATE UNIQUE INDEX "uq_storyboard_shot_characters_projection_order" ON "storyboard_shot_characters" ("storyboard_shot_projection_id" ASC, "order" ASC);

CREATE INDEX "ix_storyboard_shot_characters_character" ON "storyboard_shot_characters" ("character_id" ASC);

CREATE UNIQUE INDEX "uq_preflight_revisions_chapter_version" ON "preflight_revisions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_preflight_revisions_id_scope" ON "preflight_revisions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_preflight_revisions_source_storyboard" ON "preflight_revisions" ("source_storyboard_version_id" ASC);

COMMIT;
