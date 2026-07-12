-- G1 deterministic base migration: 0005_dialogue_settings_secret_metadata

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "app_preferences" (
  "id" TEXT NOT NULL DEFAULT 'primary' PRIMARY KEY,
  "theme" TEXT NOT NULL DEFAULT 'system',
  "active_image_provider_id" TEXT,
  "default_text_provider_id" TEXT,
  "default_text_model_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_app_preferences_active_image_provider_id__provider_configs" FOREIGN KEY ("active_image_provider_id") REFERENCES "provider_configs" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_app_preferences_default_text_provider_id__provider_configs" FOREIGN KEY ("default_text_provider_id") REFERENCES "provider_configs" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE "provider_configs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider_id" TEXT NOT NULL,
  "runtime_kind" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "base_url" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT 0,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE TABLE "credential_metadata" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider_config_id" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unconfigured',
  "secret_ref" TEXT,
  "fingerprint" TEXT,
  "configured" BOOLEAN NOT NULL DEFAULT 0,
  "rotated_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_credential_metadata_provider_config_id__provider_configs" FOREIGN KEY ("provider_config_id") REFERENCES "provider_configs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "project_context_facts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "content_digest" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "superseded_at" DATETIME,
  CONSTRAINT "fk_project_context_facts_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "conversation_threads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT,
  "step_key" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_conversation_threads_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_conversation_threads_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "thread_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider_id" TEXT,
  "model_id" TEXT,
  "error_json" JSONB,
  "error_schema_version" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "completed_at" DATETIME,
  CONSTRAINT "fk_conversation_messages_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "dialogue_tool_results" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "thread_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "tool_call_id" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "payload_digest" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_dialogue_tool_results_message_id__conversation_messages" FOREIGN KEY ("message_id") REFERENCES "conversation_messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_dialogue_tool_results_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "dialogue_runtime_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "thread_id" TEXT NOT NULL,
  "runtime" TEXT NOT NULL,
  "external_session_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "provider_id" TEXT,
  "model_id" TEXT,
  "variant" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "closed_at" DATETIME,
  CONSTRAINT "fk_dialogue_runtime_sessions_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "pending_dialogue_artifacts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "chapter_id" TEXT,
  "thread_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "active_slot_key" TEXT,
  "payload_json" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "payload_digest" TEXT NOT NULL,
  "source_message_id" TEXT,
  "tool_result_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "resolved_at" DATETIME,
  CONSTRAINT "fk_pending_dialogue_artifacts_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_pending_dialogue_artifacts_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_pending_dialogue_artifacts_source_message_id__conversation_messages" FOREIGN KEY ("source_message_id") REFERENCES "conversation_messages" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_pending_dialogue_artifacts_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_pending_dialogue_artifacts_tool_result_id__dialogue_tool_results" FOREIGN KEY ("tool_result_id") REFERENCES "dialogue_tool_results" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_provider_configs_provider_id" ON "provider_configs" ("provider_id" ASC);

CREATE INDEX "ix_provider_configs_runtime_enabled" ON "provider_configs" ("runtime_kind" ASC, "enabled" ASC);

CREATE UNIQUE INDEX "uq_credential_metadata_provider" ON "credential_metadata" ("provider_config_id" ASC);

CREATE UNIQUE INDEX "uq_credential_metadata_secret_ref" ON "credential_metadata" ("secret_ref" ASC);

CREATE INDEX "ix_project_context_facts_project_type_status" ON "project_context_facts" ("project_id" ASC, "type" ASC, "status" ASC);

CREATE INDEX "ix_project_context_facts_source" ON "project_context_facts" ("source_type" ASC, "source_id" ASC);

CREATE UNIQUE INDEX "uq_conversation_threads_id_scope" ON "conversation_threads" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_conversation_threads_scope" ON "conversation_threads" ("project_id" ASC, "step_key" ASC, "scope_key" ASC);

CREATE INDEX "ix_conversation_threads_project_status" ON "conversation_threads" ("project_id" ASC, "status" ASC);

CREATE INDEX "ix_conversation_messages_status" ON "conversation_messages" ("status" ASC);

CREATE INDEX "ix_conversation_messages_thread_created_at" ON "conversation_messages" ("thread_id" ASC, "created_at" ASC);

CREATE UNIQUE INDEX "uq_dialogue_tool_results_thread_call" ON "dialogue_tool_results" ("thread_id" ASC, "tool_call_id" ASC);

CREATE INDEX "ix_dialogue_tool_results_message" ON "dialogue_tool_results" ("message_id" ASC);

CREATE UNIQUE INDEX "uq_dialogue_runtime_sessions_external" ON "dialogue_runtime_sessions" ("runtime" ASC, "external_session_id" ASC);

CREATE INDEX "ix_dialogue_runtime_sessions_thread_status" ON "dialogue_runtime_sessions" ("thread_id" ASC, "status" ASC);

CREATE UNIQUE INDEX "uq_pending_dialogue_artifacts_active_slot" ON "pending_dialogue_artifacts" ("active_slot_key" ASC);

CREATE INDEX "ix_pending_dialogue_artifacts_project_kind_status" ON "pending_dialogue_artifacts" ("project_id" ASC, "kind" ASC, "status" ASC);

CREATE INDEX "ix_pending_dialogue_artifacts_thread_created_at" ON "pending_dialogue_artifacts" ("thread_id" ASC, "created_at" ASC);

COMMIT;
