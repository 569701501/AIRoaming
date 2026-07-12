-- G1 deterministic base migration: 0007_layout_export_outbox

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "layout_working_copies" (
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
  CONSTRAINT "fk_layout_working_copies_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "layout_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previous_revision_id" TEXT,
  "content_based_on_revision_id" TEXT,
  "document_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "document_digest" TEXT NOT NULL,
  "source_lock_set_digest" TEXT,
  "origin" TEXT NOT NULL,
  "save_reason" TEXT NOT NULL,
  "binding_set_sealed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_layout_revisions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_revisions_content_based_on_revision_id__layout_revisions" FOREIGN KEY ("content_based_on_revision_id") REFERENCES "layout_revisions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_revisions_previous_revision_id__layout_revisions" FOREIGN KEY ("previous_revision_id") REFERENCES "layout_revisions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_revisions_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "layout_source_bindings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "layout_revision_id" TEXT NOT NULL,
  "element_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "shot_id" TEXT,
  "candidate_id" TEXT,
  "candidate_lock_revision_id" TEXT,
  "asset_id" TEXT,
  "source_digest" TEXT NOT NULL,
  CONSTRAINT "fk_layout_source_bindings_asset_id__assets" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_source_bindings_candidate_id__candidates" FOREIGN KEY ("candidate_id") REFERENCES "candidates" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_source_bindings_candidate_lock_revision_id__candidate_lock_revisions" FOREIGN KEY ("candidate_lock_revision_id") REFERENCES "candidate_lock_revisions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_source_bindings_layout_revision_id__layout_revisions" FOREIGN KEY ("layout_revision_id") REFERENCES "layout_revisions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_layout_source_bindings_shot_id__shots" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "export_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT,
  "scope_key" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "task_id" TEXT,
  "layout_revision_id" TEXT,
  "source_lock_set_digest" TEXT,
  "profile_json" JSONB,
  "profile_schema_version" INTEGER,
  "profile_digest" TEXT,
  "preflight_digest" TEXT,
  "renderer_version" TEXT,
  "manifest_json" JSONB,
  "manifest_schema_version" INTEGER,
  "manifest_digest" TEXT,
  "completion_applicability" TEXT,
  "origin" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ready_at" DATETIME,
  "failed_at" DATETIME,
  "cancelled_at" DATETIME,
  CONSTRAINT "fk_export_revisions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_export_revisions_layout_revision_id__layout_revisions" FOREIGN KEY ("layout_revision_id") REFERENCES "layout_revisions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_export_revisions_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_export_revisions_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "export_artifacts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "export_revision_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  CONSTRAINT "fk_export_artifacts_asset_id__assets" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_export_artifacts_export_revision_id__export_revisions" FOREIGN KEY ("export_revision_id") REFERENCES "export_revisions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "outbox_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "event_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "payload_schema_version" INTEGER NOT NULL,
  "payload_digest" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "available_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_owner_id" TEXT,
  "lease_token" TEXT,
  "lease_expires_at" DATETIME,
  "last_error_json" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "processed_at" DATETIME,
  "idempotency_key" TEXT NOT NULL
);

CREATE UNIQUE INDEX "uq_layout_working_copies_chapter" ON "layout_working_copies" ("chapter_id" ASC);

CREATE UNIQUE INDEX "uq_layout_working_copies_id_scope" ON "layout_working_copies" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_layout_revisions_chapter_revision" ON "layout_revisions" ("chapter_id" ASC, "revision" ASC);

CREATE UNIQUE INDEX "uq_layout_revisions_id_scope" ON "layout_revisions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_layout_revisions_content_based" ON "layout_revisions" ("content_based_on_revision_id" ASC);

CREATE INDEX "ix_layout_revisions_previous" ON "layout_revisions" ("previous_revision_id" ASC);

CREATE UNIQUE INDEX "uq_layout_source_bindings_element_role" ON "layout_source_bindings" ("layout_revision_id" ASC, "element_id" ASC, "role" ASC);

CREATE UNIQUE INDEX "uq_layout_source_bindings_revision_role_order" ON "layout_source_bindings" ("layout_revision_id" ASC, "role" ASC, "order" ASC);

CREATE INDEX "ix_layout_source_bindings_asset" ON "layout_source_bindings" ("asset_id" ASC);

CREATE INDEX "ix_layout_source_bindings_candidate_lock" ON "layout_source_bindings" ("candidate_lock_revision_id" ASC);

CREATE INDEX "ix_layout_source_bindings_shot" ON "layout_source_bindings" ("shot_id" ASC);

CREATE UNIQUE INDEX "uq_export_revisions_id_scope" ON "export_revisions" ("id" ASC, "project_id" ASC, "scope_key" ASC);

CREATE UNIQUE INDEX "uq_export_revisions_scope_kind_revision" ON "export_revisions" ("project_id" ASC, "scope_key" ASC, "kind" ASC, "revision" ASC);

CREATE UNIQUE INDEX "uq_export_revisions_task" ON "export_revisions" ("task_id" ASC);

CREATE INDEX "ix_export_revisions_chapter_kind_status" ON "export_revisions" ("chapter_id" ASC, "kind" ASC, "status" ASC);

CREATE INDEX "ix_export_revisions_layout" ON "export_revisions" ("layout_revision_id" ASC);

CREATE UNIQUE INDEX "uq_export_artifacts_asset" ON "export_artifacts" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_export_artifacts_revision_role_order" ON "export_artifacts" ("export_revision_id" ASC, "role" ASC, "order" ASC);

CREATE UNIQUE INDEX "uq_outbox_events_idempotency_key" ON "outbox_events" ("idempotency_key" ASC);

CREATE UNIQUE INDEX "uq_outbox_events_lease_token" ON "outbox_events" ("lease_token" ASC);

CREATE INDEX "ix_outbox_events_aggregate" ON "outbox_events" ("aggregate_type" ASC, "aggregate_id" ASC);

CREATE INDEX "ix_outbox_events_claim" ON "outbox_events" ("status" ASC, "available_at" ASC, "created_at" ASC);

CREATE INDEX "ix_outbox_events_recovery" ON "outbox_events" ("status" ASC, "lease_expires_at" ASC);

COMMIT;
