-- G1 deterministic base migration: 0002_project_chapter_script

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "projects" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'comic',
  "lifecycle_status" TEXT NOT NULL DEFAULT 'active',
  "story_title" TEXT,
  "genre_tags" JSONB NOT NULL,
  "comic_format" TEXT NOT NULL,
  "art_style" TEXT,
  "description" TEXT,
  "current_chapter_id" TEXT,
  "current_script_outline_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "deleting_at" DATETIME,
  CONSTRAINT "fk_projects_current_chapter_id__chapters" FOREIGN KEY ("current_chapter_id") REFERENCES "chapters" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_projects_current_script_outline_id__project_script_outlines" FOREIGN KEY ("current_script_outline_id") REFERENCES "project_script_outlines" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE "project_script_outlines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "title" TEXT NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "confirmed_at" DATETIME,
  CONSTRAINT "fk_project_script_outlines_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "chapters" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "milestone_status" TEXT NOT NULL DEFAULT 'draft',
  "script_working_text" TEXT NOT NULL DEFAULT '',
  "script_working_digest" TEXT NOT NULL,
  "script_working_state" TEXT NOT NULL DEFAULT 'empty',
  "summary" TEXT,
  "completed_at" DATETIME,
  "current_script_version_id" TEXT,
  "current_story_version_id" TEXT,
  "pending_story_version_id" TEXT,
  "current_storyboard_version_id" TEXT,
  "pending_storyboard_version_id" TEXT,
  "current_preflight_revision_id" TEXT,
  "current_layout_revision_id" TEXT,
  "current_export_revision_id" TEXT,
  "last_script_revision_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_chapters_current_export_revision_id__export_revisions" FOREIGN KEY ("current_export_revision_id") REFERENCES "export_revisions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_current_layout_revision_id__layout_revisions" FOREIGN KEY ("current_layout_revision_id") REFERENCES "layout_revisions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_current_preflight_revision_id__preflight_revisions" FOREIGN KEY ("current_preflight_revision_id") REFERENCES "preflight_revisions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_current_script_version_id__chapter_script_versions" FOREIGN KEY ("current_script_version_id") REFERENCES "chapter_script_versions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_current_story_version_id__story_versions" FOREIGN KEY ("current_story_version_id") REFERENCES "story_versions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_current_storyboard_version_id__storyboard_versions" FOREIGN KEY ("current_storyboard_version_id") REFERENCES "storyboard_versions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_last_script_revision_id__chapter_script_revisions" FOREIGN KEY ("last_script_revision_id") REFERENCES "chapter_script_revisions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_pending_story_version_id__story_versions" FOREIGN KEY ("pending_story_version_id") REFERENCES "story_versions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_pending_storyboard_version_id__storyboard_versions" FOREIGN KEY ("pending_storyboard_version_id") REFERENCES "storyboard_versions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapters_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "chapter_script_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chapter_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" DATETIME,
  CONSTRAINT "fk_chapter_script_versions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "chapter_script_pending" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chapter_id" TEXT NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "thread_id" TEXT,
  "message_id" TEXT,
  "tool_call_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_chapter_script_pending_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapter_script_pending_message_id__conversation_messages" FOREIGN KEY ("message_id") REFERENCES "conversation_messages" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapter_script_pending_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "chapter_script_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chapter_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "thread_id" TEXT,
  "message_id" TEXT,
  "tool_call_id" TEXT,
  "operation" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "target_working_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_chapter_script_revisions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapter_script_revisions_message_id__conversation_messages" FOREIGN KEY ("message_id") REFERENCES "conversation_messages" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_chapter_script_revisions_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "ix_projects_lifecycle_updated_at" ON "projects" ("lifecycle_status" ASC, "updated_at" ASC);

CREATE UNIQUE INDEX "uq_project_script_outlines_id_project" ON "project_script_outlines" ("id" ASC, "project_id" ASC);

CREATE UNIQUE INDEX "uq_project_script_outlines_project_version" ON "project_script_outlines" ("project_id" ASC, "version" ASC);

CREATE INDEX "ix_project_script_outlines_project_status" ON "project_script_outlines" ("project_id" ASC, "status" ASC);

CREATE UNIQUE INDEX "uq_chapters_id_project" ON "chapters" ("id" ASC, "project_id" ASC);

CREATE UNIQUE INDEX "uq_chapters_project_order" ON "chapters" ("project_id" ASC, "order" ASC);

CREATE UNIQUE INDEX "uq_chapters_project_slug" ON "chapters" ("project_id" ASC, "slug" ASC);

CREATE INDEX "ix_chapters_project_milestone" ON "chapters" ("project_id" ASC, "milestone_status" ASC);

CREATE UNIQUE INDEX "uq_chapter_script_versions_chapter_version" ON "chapter_script_versions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_chapter_script_versions_id_chapter" ON "chapter_script_versions" ("id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_chapter_script_pending_chapter" ON "chapter_script_pending" ("chapter_id" ASC);

CREATE INDEX "ix_chapter_script_pending_thread_tool" ON "chapter_script_pending" ("thread_id" ASC, "tool_call_id" ASC);

CREATE UNIQUE INDEX "uq_chapter_script_revisions_thread_tool" ON "chapter_script_revisions" ("thread_id" ASC, "tool_call_id" ASC);

CREATE INDEX "ix_chapter_script_revisions_chapter_created_at" ON "chapter_script_revisions" ("chapter_id" ASC, "created_at" ASC);

COMMIT;
