-- G1 deterministic base migration: 0006_generation_task_worker

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "generation_tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT,
  "type" TEXT NOT NULL,
  "record_kind" TEXT NOT NULL,
  "provenance_status" TEXT NOT NULL,
  "status" TEXT,
  "phase" TEXT,
  "progress_percent" INTEGER,
  "target_type" TEXT,
  "target_id" TEXT,
  "input_json" JSONB,
  "input_schema_version" INTEGER,
  "input_digest" TEXT,
  "output_json" JSONB,
  "output_schema_version" INTEGER,
  "output_digest" TEXT,
  "error_json" JSONB,
  "error_schema_version" INTEGER,
  "source_digest" TEXT,
  "source_set_sealed_at" DATETIME,
  "idempotency_key" TEXT,
  "concurrency_key" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 0,
  "next_run_at" DATETIME,
  "lease_owner_id" TEXT,
  "lease_token" TEXT,
  "lease_expires_at" DATETIME,
  "heartbeat_at" DATETIME,
  "cancel_requested_at" DATETIME,
  "retry_disabled" BOOLEAN NOT NULL DEFAULT 1,
  "needs_review" BOOLEAN NOT NULL DEFAULT 0,
  "applicability" TEXT,
  "import_source" TEXT,
  "imported_at" DATETIME,
  "observed_evidence_json" JSONB,
  "evidence_schema_version" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "started_at" DATETIME,
  "finished_at" DATETIME,
  CONSTRAINT "fk_generation_tasks_chapter_id_project_id__chapters" FOREIGN KEY ("chapter_id", "project_id") REFERENCES "chapters" ("id", "project_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_generation_tasks_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "task_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "task_id" TEXT NOT NULL,
  "attempt_no" INTEGER NOT NULL,
  "worker_id" TEXT NOT NULL,
  "claim_token" TEXT NOT NULL,
  "outcome" TEXT,
  "error_json" JSONB,
  "error_schema_version" INTEGER,
  "artifact_refs_json" JSONB,
  "artifact_schema_version" INTEGER,
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_task_attempts_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "task_concurrency_slots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "concurrency_key" TEXT NOT NULL,
  "slot_no" INTEGER NOT NULL,
  "task_id" TEXT,
  "lease_owner_id" TEXT,
  "claim_token" TEXT,
  "lease_expires_at" DATETIME,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_task_concurrency_slots_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE "generation_task_sources" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "task_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  CONSTRAINT "fk_generation_task_sources_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_generation_tasks_id_scope" ON "generation_tasks" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_generation_tasks_idempotency_key" ON "generation_tasks" ("idempotency_key" ASC);

CREATE INDEX "ix_generation_tasks_chapter_type_created" ON "generation_tasks" ("chapter_id" ASC, "type" ASC, "created_at" ASC);

CREATE INDEX "ix_generation_tasks_claim" ON "generation_tasks" ("record_kind" ASC, "status" ASC, "next_run_at" ASC, "priority" ASC, "created_at" ASC);

CREATE INDEX "ix_generation_tasks_project_status_updated" ON "generation_tasks" ("project_id" ASC, "status" ASC, "updated_at" ASC);

CREATE INDEX "ix_generation_tasks_recovery" ON "generation_tasks" ("status" ASC, "lease_expires_at" ASC);

CREATE INDEX "ix_generation_tasks_target" ON "generation_tasks" ("target_type" ASC, "target_id" ASC);

CREATE UNIQUE INDEX "uq_task_attempts_claim_token" ON "task_attempts" ("claim_token" ASC);

CREATE UNIQUE INDEX "uq_task_attempts_task_attempt_no" ON "task_attempts" ("task_id" ASC, "attempt_no" ASC);

CREATE INDEX "ix_task_attempts_task_started_at" ON "task_attempts" ("task_id" ASC, "started_at" ASC);

CREATE UNIQUE INDEX "uq_task_concurrency_slots_key_no" ON "task_concurrency_slots" ("concurrency_key" ASC, "slot_no" ASC);

CREATE UNIQUE INDEX "uq_task_concurrency_slots_task" ON "task_concurrency_slots" ("task_id" ASC);

CREATE INDEX "ix_task_concurrency_slots_lease_expires" ON "task_concurrency_slots" ("lease_expires_at" ASC);

CREATE UNIQUE INDEX "uq_generation_task_sources_task_role_order" ON "generation_task_sources" ("task_id" ASC, "role" ASC, "order" ASC);

CREATE INDEX "ix_generation_task_sources_source" ON "generation_task_sources" ("source_type" ASC, "source_id" ASC);

COMMIT;
