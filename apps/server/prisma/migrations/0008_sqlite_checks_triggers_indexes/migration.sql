-- G1 deterministic final SQLite CHECK/trigger/index rebuild

PRAGMA foreign_keys = OFF;

CREATE TEMP TABLE "_g1_foreign_key_mode_guard" (
  "enabled" INTEGER NOT NULL,
  CONSTRAINT "ck_g1_foreign_key_mode_guard_disabled" CHECK ("enabled" = 0)
);

INSERT OR ROLLBACK INTO "_g1_foreign_key_mode_guard" ("enabled") SELECT CASE WHEN COUNT(*) = 1 THEN MAX(foreign_keys) ELSE -1 END FROM pragma_foreign_keys;

DROP TABLE "_g1_foreign_key_mode_guard";

BEGIN IMMEDIATE;

CREATE TEMP TABLE "_g1_rebuild_row_guard" (
  "table_name" TEXT NOT NULL,
  "before_count" INTEGER NOT NULL,
  "after_count" INTEGER NOT NULL,
  "difference_count" INTEGER NOT NULL,
  CONSTRAINT "ck_g1_rebuild_row_guard_count_equal" CHECK ("before_count" = "after_count"),
  CONSTRAINT "ck_g1_rebuild_row_guard_value_equal" CHECK ("difference_count" = 0)
);

CREATE TABLE "persistence_states__g1_new" (
  "id" TEXT NOT NULL DEFAULT 'primary' PRIMARY KEY,
  "storage_contract_version" INTEGER NOT NULL DEFAULT 1,
  "activation_state" TEXT NOT NULL DEFAULT 'shadow',
  "cutover_run_id" TEXT,
  "source_manifest_digest" TEXT,
  "effective_schema_manifest_digest" TEXT,
  "activated_at" DATETIME,
  "first_business_write_at" DATETIME,
  "last_verified_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_persistence_states_cutover_run_id__migration_runs" FOREIGN KEY ("cutover_run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_persistence_states_activation_shape" CHECK ((activation_state = 'shadow' AND cutover_run_id IS NULL AND source_manifest_digest IS NULL AND effective_schema_manifest_digest IS NULL AND activated_at IS NULL AND first_business_write_at IS NULL) OR (activation_state = 'ready_for_activation' AND cutover_run_id IS NOT NULL AND source_manifest_digest IS NOT NULL AND effective_schema_manifest_digest IS NOT NULL AND activated_at IS NULL AND first_business_write_at IS NULL) OR (activation_state = 'db_only' AND cutover_run_id IS NOT NULL AND source_manifest_digest IS NOT NULL AND effective_schema_manifest_digest IS NOT NULL AND activated_at IS NOT NULL) OR (activation_state = 'recovery_required' AND ((cutover_run_id IS NULL AND source_manifest_digest IS NULL AND effective_schema_manifest_digest IS NULL AND activated_at IS NULL AND first_business_write_at IS NULL) OR (cutover_run_id IS NOT NULL AND source_manifest_digest IS NOT NULL AND effective_schema_manifest_digest IS NOT NULL AND (first_business_write_at IS NULL OR activated_at IS NOT NULL))))),
  CONSTRAINT "ck_persistence_states_activation_state" CHECK (activation_state IN ('shadow', 'ready_for_activation', 'db_only', 'recovery_required')),
  CONSTRAINT "ck_persistence_states_digest_format" CHECK ((source_manifest_digest IS NULL OR (length(source_manifest_digest) = 71 AND substr(source_manifest_digest, 1, 7) = 'sha256:' AND substr(source_manifest_digest, 8) = lower(substr(source_manifest_digest, 8)) AND substr(source_manifest_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (effective_schema_manifest_digest IS NULL OR (length(effective_schema_manifest_digest) = 71 AND substr(effective_schema_manifest_digest, 1, 7) = 'sha256:' AND substr(effective_schema_manifest_digest, 8) = lower(substr(effective_schema_manifest_digest, 8)) AND substr(effective_schema_manifest_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_persistence_states_singleton" CHECK (id = 'primary'),
  CONSTRAINT "ck_persistence_states_storage_contract_version" CHECK (typeof(storage_contract_version) = 'integer' AND storage_contract_version >= 1)
);

INSERT INTO "persistence_states__g1_new" ("id", "storage_contract_version", "activation_state", "cutover_run_id", "source_manifest_digest", "effective_schema_manifest_digest", "activated_at", "first_business_write_at", "last_verified_at", "created_at", "updated_at") SELECT "id", "storage_contract_version", "activation_state", "cutover_run_id", "source_manifest_digest", "effective_schema_manifest_digest", "activated_at", "first_business_write_at", "last_verified_at", "created_at", "updated_at" FROM "persistence_states";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'persistence_states', (SELECT COUNT(*) FROM "persistence_states"), (SELECT COUNT(*) FROM "persistence_states__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "storage_contract_version", "activation_state", "cutover_run_id", "source_manifest_digest", "effective_schema_manifest_digest", "activated_at", "first_business_write_at", "last_verified_at", "created_at", "updated_at" FROM "persistence_states" EXCEPT SELECT "id", "storage_contract_version", "activation_state", "cutover_run_id", "source_manifest_digest", "effective_schema_manifest_digest", "activated_at", "first_business_write_at", "last_verified_at", "created_at", "updated_at" FROM "persistence_states__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "storage_contract_version", "activation_state", "cutover_run_id", "source_manifest_digest", "effective_schema_manifest_digest", "activated_at", "first_business_write_at", "last_verified_at", "created_at", "updated_at" FROM "persistence_states__g1_new" EXCEPT SELECT "id", "storage_contract_version", "activation_state", "cutover_run_id", "source_manifest_digest", "effective_schema_manifest_digest", "activated_at", "first_business_write_at", "last_verified_at", "created_at", "updated_at" FROM "persistence_states"));

DROP TABLE "persistence_states";

ALTER TABLE "persistence_states__g1_new" RENAME TO "persistence_states";

CREATE TABLE "migration_runs__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "importer_version" TEXT NOT NULL,
  "source_manifest_digest" TEXT NOT NULL,
  "snapshot_manifest_digest" TEXT,
  "decisions_digest" TEXT,
  "report_digest" TEXT,
  "counts_json" JSONB,
  "counts_schema_version" INTEGER,
  "verification_json" JSONB,
  "verification_schema_version" INTEGER,
  "error_code" TEXT,
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_migration_runs_digest_format" CHECK ((length(source_manifest_digest) = 71 AND substr(source_manifest_digest, 1, 7) = 'sha256:' AND substr(source_manifest_digest, 8) = lower(substr(source_manifest_digest, 8)) AND substr(source_manifest_digest, 8) NOT GLOB '*[^0-9a-f]*') AND (snapshot_manifest_digest IS NULL OR (length(snapshot_manifest_digest) = 71 AND substr(snapshot_manifest_digest, 1, 7) = 'sha256:' AND substr(snapshot_manifest_digest, 8) = lower(substr(snapshot_manifest_digest, 8)) AND substr(snapshot_manifest_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (decisions_digest IS NULL OR (length(decisions_digest) = 71 AND substr(decisions_digest, 1, 7) = 'sha256:' AND substr(decisions_digest, 8) = lower(substr(decisions_digest, 8)) AND substr(decisions_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (report_digest IS NULL OR (length(report_digest) = 71 AND substr(report_digest, 1, 7) = 'sha256:' AND substr(report_digest, 8) = lower(substr(report_digest, 8)) AND substr(report_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_migration_runs_json_pairs" CHECK (((counts_json IS NULL AND counts_schema_version IS NULL) OR (counts_json IS NOT NULL AND counts_schema_version IS NOT NULL AND typeof(counts_schema_version) = 'integer' AND counts_schema_version >= 1 AND CASE WHEN json_valid(counts_json) = 1 THEN json_type(counts_json) = 'object' ELSE 0 END)) AND ((verification_json IS NULL AND verification_schema_version IS NULL) OR (verification_json IS NOT NULL AND verification_schema_version IS NOT NULL AND typeof(verification_schema_version) = 'integer' AND verification_schema_version >= 1 AND CASE WHEN json_valid(verification_json) = 1 THEN json_type(verification_json) = 'object' ELSE 0 END))),
  CONSTRAINT "ck_migration_runs_kind" CHECK (kind IN ('audit', 'shadow', 'final', 'rollback_restore')),
  CONSTRAINT "ck_migration_runs_status" CHECK (status IN ('running', 'blocked', 'succeeded', 'failed')),
  CONSTRAINT "ck_migration_runs_terminal_time" CHECK ((status = 'running' AND finished_at IS NULL) OR (status IN ('blocked', 'succeeded', 'failed') AND finished_at IS NOT NULL))
);

INSERT INTO "migration_runs__g1_new" ("id", "kind", "status", "importer_version", "source_manifest_digest", "snapshot_manifest_digest", "decisions_digest", "report_digest", "counts_json", "counts_schema_version", "verification_json", "verification_schema_version", "error_code", "started_at", "finished_at", "created_at") SELECT "id", "kind", "status", "importer_version", "source_manifest_digest", "snapshot_manifest_digest", "decisions_digest", "report_digest", "counts_json", "counts_schema_version", "verification_json", "verification_schema_version", "error_code", "started_at", "finished_at", "created_at" FROM "migration_runs";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'migration_runs', (SELECT COUNT(*) FROM "migration_runs"), (SELECT COUNT(*) FROM "migration_runs__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "kind", "status", "importer_version", "source_manifest_digest", "snapshot_manifest_digest", "decisions_digest", "report_digest", "counts_json", "counts_schema_version", "verification_json", "verification_schema_version", "error_code", "started_at", "finished_at", "created_at" FROM "migration_runs" EXCEPT SELECT "id", "kind", "status", "importer_version", "source_manifest_digest", "snapshot_manifest_digest", "decisions_digest", "report_digest", "counts_json", "counts_schema_version", "verification_json", "verification_schema_version", "error_code", "started_at", "finished_at", "created_at" FROM "migration_runs__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "kind", "status", "importer_version", "source_manifest_digest", "snapshot_manifest_digest", "decisions_digest", "report_digest", "counts_json", "counts_schema_version", "verification_json", "verification_schema_version", "error_code", "started_at", "finished_at", "created_at" FROM "migration_runs__g1_new" EXCEPT SELECT "id", "kind", "status", "importer_version", "source_manifest_digest", "snapshot_manifest_digest", "decisions_digest", "report_digest", "counts_json", "counts_schema_version", "verification_json", "verification_schema_version", "error_code", "started_at", "finished_at", "created_at" FROM "migration_runs"));

DROP TABLE "migration_runs";

ALTER TABLE "migration_runs__g1_new" RENAME TO "migration_runs";

CREATE INDEX "ix_migration_runs_status_started_at" ON "migration_runs" ("status" ASC, "started_at" ASC);

CREATE TABLE "imported_entity_sources__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source_key" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "source_storage_key" TEXT,
  "source_digest" TEXT NOT NULL,
  "payload_digest" TEXT,
  "provenance_status" TEXT NOT NULL DEFAULT 'reference_only',
  "first_run_id" TEXT NOT NULL,
  "last_run_id" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_imported_entity_sources_first_run_id__migration_runs" FOREIGN KEY ("first_run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_imported_entity_sources_last_run_id__migration_runs" FOREIGN KEY ("last_run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_imported_entity_sources_digest_format" CHECK ((length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*') AND (payload_digest IS NULL OR (length(payload_digest) = 71 AND substr(payload_digest, 1, 7) = 'sha256:' AND substr(payload_digest, 8) = lower(substr(payload_digest, 8)) AND substr(payload_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_imported_entity_sources_provenance_status" CHECK (provenance_status IN ('reference_only', 'partial', 'complete')),
  CONSTRAINT "ck_imported_entity_sources_storage_key" CHECK (source_storage_key IS NULL OR (typeof(source_storage_key) = 'text' AND length(source_storage_key) > 0 AND substr(source_storage_key, 1, 1) <> '/' AND source_storage_key NOT GLOB '[A-Za-z]:*' AND instr(source_storage_key, '\') = 0 AND instr(source_storage_key, char(0)) = 0 AND instr(source_storage_key, '//') = 0 AND source_storage_key NOT IN ('.', '..') AND source_storage_key NOT GLOB './*' AND source_storage_key NOT GLOB '../*' AND source_storage_key NOT GLOB '*/./*' AND source_storage_key NOT GLOB '*/../*' AND source_storage_key NOT GLOB '*/.' AND source_storage_key NOT GLOB '*/..'))
);

INSERT INTO "imported_entity_sources__g1_new" ("id", "source_key", "entity_type", "entity_id", "source_storage_key", "source_digest", "payload_digest", "provenance_status", "first_run_id", "last_run_id", "created_at", "updated_at") SELECT "id", "source_key", "entity_type", "entity_id", "source_storage_key", "source_digest", "payload_digest", "provenance_status", "first_run_id", "last_run_id", "created_at", "updated_at" FROM "imported_entity_sources";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'imported_entity_sources', (SELECT COUNT(*) FROM "imported_entity_sources"), (SELECT COUNT(*) FROM "imported_entity_sources__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "source_key", "entity_type", "entity_id", "source_storage_key", "source_digest", "payload_digest", "provenance_status", "first_run_id", "last_run_id", "created_at", "updated_at" FROM "imported_entity_sources" EXCEPT SELECT "id", "source_key", "entity_type", "entity_id", "source_storage_key", "source_digest", "payload_digest", "provenance_status", "first_run_id", "last_run_id", "created_at", "updated_at" FROM "imported_entity_sources__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "source_key", "entity_type", "entity_id", "source_storage_key", "source_digest", "payload_digest", "provenance_status", "first_run_id", "last_run_id", "created_at", "updated_at" FROM "imported_entity_sources__g1_new" EXCEPT SELECT "id", "source_key", "entity_type", "entity_id", "source_storage_key", "source_digest", "payload_digest", "provenance_status", "first_run_id", "last_run_id", "created_at", "updated_at" FROM "imported_entity_sources"));

DROP TABLE "imported_entity_sources";

ALTER TABLE "imported_entity_sources__g1_new" RENAME TO "imported_entity_sources";

CREATE UNIQUE INDEX "uq_imported_entity_sources_source_key" ON "imported_entity_sources" ("source_key" ASC);

CREATE INDEX "ix_imported_entity_sources_entity" ON "imported_entity_sources" ("entity_type" ASC, "entity_id" ASC);

CREATE INDEX "ix_imported_entity_sources_last_run" ON "imported_entity_sources" ("last_run_id" ASC);

CREATE TABLE "migration_issues__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "issue_key" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "source_key" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "storage_key" TEXT,
  "detail_json" JSONB NOT NULL,
  "detail_schema_version" INTEGER NOT NULL,
  "resolution_status" TEXT NOT NULL DEFAULT 'open',
  "resolution_json" JSONB,
  "resolved_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_migration_issues_run_id__migration_runs" FOREIGN KEY ("run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_migration_issues_resolution_payload" CHECK ((resolution_status IN ('not_needed', 'open') AND resolution_json IS NULL AND resolved_at IS NULL) OR (resolution_status = 'resolved' AND resolution_json IS NOT NULL AND resolved_at IS NOT NULL AND CASE WHEN json_valid(resolution_json) = 1 THEN json_type(resolution_json) = 'object' AND json_type(resolution_json, '$.decisionSchemaVersion') = 'integer' AND json_extract(resolution_json, '$.decisionSchemaVersion') = 1 ELSE 0 END)),
  CONSTRAINT "ck_migration_issues_resolution_status" CHECK (resolution_status IN ('not_needed', 'open', 'resolved')),
  CONSTRAINT "ck_migration_issues_severity" CHECK (severity IN ('blocker', 'warning', 'info')),
  CONSTRAINT "ck_migration_issues_storage_key" CHECK (storage_key IS NULL OR (typeof(storage_key) = 'text' AND length(storage_key) > 0 AND substr(storage_key, 1, 1) <> '/' AND storage_key NOT GLOB '[A-Za-z]:*' AND instr(storage_key, '\') = 0 AND instr(storage_key, char(0)) = 0 AND instr(storage_key, '//') = 0 AND storage_key NOT IN ('.', '..') AND storage_key NOT GLOB './*' AND storage_key NOT GLOB '../*' AND storage_key NOT GLOB '*/./*' AND storage_key NOT GLOB '*/../*' AND storage_key NOT GLOB '*/.' AND storage_key NOT GLOB '*/..'))
);

INSERT INTO "migration_issues__g1_new" ("id", "run_id", "issue_key", "severity", "code", "source_key", "entity_type", "entity_id", "storage_key", "detail_json", "detail_schema_version", "resolution_status", "resolution_json", "resolved_at", "created_at") SELECT "id", "run_id", "issue_key", "severity", "code", "source_key", "entity_type", "entity_id", "storage_key", "detail_json", "detail_schema_version", "resolution_status", "resolution_json", "resolved_at", "created_at" FROM "migration_issues";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'migration_issues', (SELECT COUNT(*) FROM "migration_issues"), (SELECT COUNT(*) FROM "migration_issues__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "run_id", "issue_key", "severity", "code", "source_key", "entity_type", "entity_id", "storage_key", "detail_json", "detail_schema_version", "resolution_status", "resolution_json", "resolved_at", "created_at" FROM "migration_issues" EXCEPT SELECT "id", "run_id", "issue_key", "severity", "code", "source_key", "entity_type", "entity_id", "storage_key", "detail_json", "detail_schema_version", "resolution_status", "resolution_json", "resolved_at", "created_at" FROM "migration_issues__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "run_id", "issue_key", "severity", "code", "source_key", "entity_type", "entity_id", "storage_key", "detail_json", "detail_schema_version", "resolution_status", "resolution_json", "resolved_at", "created_at" FROM "migration_issues__g1_new" EXCEPT SELECT "id", "run_id", "issue_key", "severity", "code", "source_key", "entity_type", "entity_id", "storage_key", "detail_json", "detail_schema_version", "resolution_status", "resolution_json", "resolved_at", "created_at" FROM "migration_issues"));

DROP TABLE "migration_issues";

ALTER TABLE "migration_issues__g1_new" RENAME TO "migration_issues";

CREATE UNIQUE INDEX "uq_migration_issues_run_issue_key" ON "migration_issues" ("run_id" ASC, "issue_key" ASC);

CREATE INDEX "ix_migration_issues_code" ON "migration_issues" ("code" ASC);

CREATE INDEX "ix_migration_issues_run_severity" ON "migration_issues" ("run_id" ASC, "severity" ASC);

CREATE TABLE "projects__g1_new" (
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
  CONSTRAINT "fk_projects_current_script_outline_id__project_script_outlines" FOREIGN KEY ("current_script_outline_id") REFERENCES "project_script_outlines" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_projects_comic_format" CHECK (comic_format IN ('vertical_scroll', 'paged_comic')),
  CONSTRAINT "ck_projects_deleting_time" CHECK ((lifecycle_status = 'active' AND deleting_at IS NULL) OR (lifecycle_status = 'deleting' AND deleting_at IS NOT NULL)),
  CONSTRAINT "ck_projects_lifecycle_status" CHECK (lifecycle_status IN ('active', 'deleting')),
  CONSTRAINT "ck_projects_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_projects_type" CHECK (type IN ('comic', 'light_motion', 'mixed'))
);

INSERT INTO "projects__g1_new" ("id", "name", "type", "lifecycle_status", "story_title", "genre_tags", "comic_format", "art_style", "description", "current_chapter_id", "current_script_outline_id", "row_version", "created_at", "updated_at", "deleting_at") SELECT "id", "name", "type", "lifecycle_status", "story_title", "genre_tags", "comic_format", "art_style", "description", "current_chapter_id", "current_script_outline_id", "row_version", "created_at", "updated_at", "deleting_at" FROM "projects";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'projects', (SELECT COUNT(*) FROM "projects"), (SELECT COUNT(*) FROM "projects__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "name", "type", "lifecycle_status", "story_title", "genre_tags", "comic_format", "art_style", "description", "current_chapter_id", "current_script_outline_id", "row_version", "created_at", "updated_at", "deleting_at" FROM "projects" EXCEPT SELECT "id", "name", "type", "lifecycle_status", "story_title", "genre_tags", "comic_format", "art_style", "description", "current_chapter_id", "current_script_outline_id", "row_version", "created_at", "updated_at", "deleting_at" FROM "projects__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "name", "type", "lifecycle_status", "story_title", "genre_tags", "comic_format", "art_style", "description", "current_chapter_id", "current_script_outline_id", "row_version", "created_at", "updated_at", "deleting_at" FROM "projects__g1_new" EXCEPT SELECT "id", "name", "type", "lifecycle_status", "story_title", "genre_tags", "comic_format", "art_style", "description", "current_chapter_id", "current_script_outline_id", "row_version", "created_at", "updated_at", "deleting_at" FROM "projects"));

DROP TABLE "projects";

ALTER TABLE "projects__g1_new" RENAME TO "projects";

CREATE INDEX "ix_projects_lifecycle_updated_at" ON "projects" ("lifecycle_status" ASC, "updated_at" ASC);

CREATE TABLE "project_script_outlines__g1_new" (
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
  CONSTRAINT "fk_project_script_outlines_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_project_script_outlines_confirmed_time" CHECK ((status = 'draft' AND confirmed_at IS NULL) OR (status IN ('confirmed', 'archived') AND confirmed_at IS NOT NULL)),
  CONSTRAINT "ck_project_script_outlines_digest_format" CHECK (length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_project_script_outlines_status" CHECK (status IN ('draft', 'confirmed', 'archived')),
  CONSTRAINT "ck_project_script_outlines_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "project_script_outlines__g1_new" ("id", "project_id", "version", "status", "title", "source_text", "source_digest", "created_at", "updated_at", "confirmed_at") SELECT "id", "project_id", "version", "status", "title", "source_text", "source_digest", "created_at", "updated_at", "confirmed_at" FROM "project_script_outlines";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'project_script_outlines', (SELECT COUNT(*) FROM "project_script_outlines"), (SELECT COUNT(*) FROM "project_script_outlines__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "version", "status", "title", "source_text", "source_digest", "created_at", "updated_at", "confirmed_at" FROM "project_script_outlines" EXCEPT SELECT "id", "project_id", "version", "status", "title", "source_text", "source_digest", "created_at", "updated_at", "confirmed_at" FROM "project_script_outlines__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "version", "status", "title", "source_text", "source_digest", "created_at", "updated_at", "confirmed_at" FROM "project_script_outlines__g1_new" EXCEPT SELECT "id", "project_id", "version", "status", "title", "source_text", "source_digest", "created_at", "updated_at", "confirmed_at" FROM "project_script_outlines"));

DROP TABLE "project_script_outlines";

ALTER TABLE "project_script_outlines__g1_new" RENAME TO "project_script_outlines";

CREATE UNIQUE INDEX "uq_project_script_outlines_id_project" ON "project_script_outlines" ("id" ASC, "project_id" ASC);

CREATE UNIQUE INDEX "uq_project_script_outlines_project_version" ON "project_script_outlines" ("project_id" ASC, "version" ASC);

CREATE INDEX "ix_project_script_outlines_project_status" ON "project_script_outlines" ("project_id" ASC, "status" ASC);

CREATE TABLE "chapters__g1_new" (
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
  CONSTRAINT "fk_chapters_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_chapters_distinct_story_pointers" CHECK (current_story_version_id IS NULL OR pending_story_version_id IS NULL OR current_story_version_id IS NOT pending_story_version_id),
  CONSTRAINT "ck_chapters_distinct_storyboard_pointers" CHECK (current_storyboard_version_id IS NULL OR pending_storyboard_version_id IS NULL OR current_storyboard_version_id IS NOT pending_storyboard_version_id),
  CONSTRAINT "ck_chapters_milestone_status" CHECK (milestone_status IN ('draft', 'script_done', 'structured', 'storyboard_done', 'images_done', 'layout_done', 'exported')),
  CONSTRAINT "ck_chapters_order" CHECK (typeof("order") = 'integer' AND "order" >= 1),
  CONSTRAINT "ck_chapters_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_chapters_script_working_state" CHECK (script_working_state IN ('empty', 'clean', 'dirty')),
  CONSTRAINT "ck_chapters_working_consistency" CHECK ((script_working_state = 'empty' AND script_working_text = '') OR (script_working_state = 'dirty' AND current_script_version_id IS NOT NULL AND script_working_text = '') OR (script_working_state IN ('clean', 'dirty') AND length(script_working_text) > 0))
);

INSERT INTO "chapters__g1_new" ("id", "project_id", "slug", "order", "title", "milestone_status", "script_working_text", "script_working_digest", "script_working_state", "summary", "completed_at", "current_script_version_id", "current_story_version_id", "pending_story_version_id", "current_storyboard_version_id", "pending_storyboard_version_id", "current_preflight_revision_id", "current_layout_revision_id", "current_export_revision_id", "last_script_revision_id", "row_version", "created_at", "updated_at") SELECT "id", "project_id", "slug", "order", "title", "milestone_status", "script_working_text", "script_working_digest", "script_working_state", "summary", "completed_at", "current_script_version_id", "current_story_version_id", "pending_story_version_id", "current_storyboard_version_id", "pending_storyboard_version_id", "current_preflight_revision_id", "current_layout_revision_id", "current_export_revision_id", "last_script_revision_id", "row_version", "created_at", "updated_at" FROM "chapters";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'chapters', (SELECT COUNT(*) FROM "chapters"), (SELECT COUNT(*) FROM "chapters__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "slug", "order", "title", "milestone_status", "script_working_text", "script_working_digest", "script_working_state", "summary", "completed_at", "current_script_version_id", "current_story_version_id", "pending_story_version_id", "current_storyboard_version_id", "pending_storyboard_version_id", "current_preflight_revision_id", "current_layout_revision_id", "current_export_revision_id", "last_script_revision_id", "row_version", "created_at", "updated_at" FROM "chapters" EXCEPT SELECT "id", "project_id", "slug", "order", "title", "milestone_status", "script_working_text", "script_working_digest", "script_working_state", "summary", "completed_at", "current_script_version_id", "current_story_version_id", "pending_story_version_id", "current_storyboard_version_id", "pending_storyboard_version_id", "current_preflight_revision_id", "current_layout_revision_id", "current_export_revision_id", "last_script_revision_id", "row_version", "created_at", "updated_at" FROM "chapters__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "slug", "order", "title", "milestone_status", "script_working_text", "script_working_digest", "script_working_state", "summary", "completed_at", "current_script_version_id", "current_story_version_id", "pending_story_version_id", "current_storyboard_version_id", "pending_storyboard_version_id", "current_preflight_revision_id", "current_layout_revision_id", "current_export_revision_id", "last_script_revision_id", "row_version", "created_at", "updated_at" FROM "chapters__g1_new" EXCEPT SELECT "id", "project_id", "slug", "order", "title", "milestone_status", "script_working_text", "script_working_digest", "script_working_state", "summary", "completed_at", "current_script_version_id", "current_story_version_id", "pending_story_version_id", "current_storyboard_version_id", "pending_storyboard_version_id", "current_preflight_revision_id", "current_layout_revision_id", "current_export_revision_id", "last_script_revision_id", "row_version", "created_at", "updated_at" FROM "chapters"));

DROP TABLE "chapters";

ALTER TABLE "chapters__g1_new" RENAME TO "chapters";

CREATE UNIQUE INDEX "uq_chapters_id_project" ON "chapters" ("id" ASC, "project_id" ASC);

CREATE UNIQUE INDEX "uq_chapters_project_order" ON "chapters" ("project_id" ASC, "order" ASC);

CREATE UNIQUE INDEX "uq_chapters_project_slug" ON "chapters" ("project_id" ASC, "slug" ASC);

CREATE INDEX "ix_chapters_project_milestone" ON "chapters" ("project_id" ASC, "milestone_status" ASC);

CREATE TABLE "chapter_script_versions__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chapter_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "source_text" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" DATETIME,
  CONSTRAINT "fk_chapter_script_versions_chapter_id__chapters" FOREIGN KEY ("chapter_id") REFERENCES "chapters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_chapter_script_versions_digest_format" CHECK (length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_chapter_script_versions_nonempty_source" CHECK (typeof(source_text) = 'text' AND length(trim(source_text)) > 0 AND instr(source_text, char(0)) = 0),
  CONSTRAINT "ck_chapter_script_versions_origin" CHECK (origin IN ('user', 'import', 'ai_confirmed')),
  CONSTRAINT "ck_chapter_script_versions_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "chapter_script_versions__g1_new" ("id", "chapter_id", "version", "source_text", "source_digest", "origin", "created_at", "completed_at") SELECT "id", "chapter_id", "version", "source_text", "source_digest", "origin", "created_at", "completed_at" FROM "chapter_script_versions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'chapter_script_versions', (SELECT COUNT(*) FROM "chapter_script_versions"), (SELECT COUNT(*) FROM "chapter_script_versions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "chapter_id", "version", "source_text", "source_digest", "origin", "created_at", "completed_at" FROM "chapter_script_versions" EXCEPT SELECT "id", "chapter_id", "version", "source_text", "source_digest", "origin", "created_at", "completed_at" FROM "chapter_script_versions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "chapter_id", "version", "source_text", "source_digest", "origin", "created_at", "completed_at" FROM "chapter_script_versions__g1_new" EXCEPT SELECT "id", "chapter_id", "version", "source_text", "source_digest", "origin", "created_at", "completed_at" FROM "chapter_script_versions"));

DROP TABLE "chapter_script_versions";

ALTER TABLE "chapter_script_versions__g1_new" RENAME TO "chapter_script_versions";

CREATE UNIQUE INDEX "uq_chapter_script_versions_chapter_version" ON "chapter_script_versions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_chapter_script_versions_id_chapter" ON "chapter_script_versions" ("id" ASC, "chapter_id" ASC);

CREATE TABLE "chapter_script_pending__g1_new" (
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
  CONSTRAINT "fk_chapter_script_pending_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_chapter_script_pending_digest_format" CHECK (length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_chapter_script_pending_nonempty_source" CHECK (typeof(source_text) = 'text' AND length(trim(source_text)) > 0 AND instr(source_text, char(0)) = 0),
  CONSTRAINT "ck_chapter_script_pending_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_chapter_script_pending_tool_source_shape" CHECK ((thread_id IS NULL AND message_id IS NULL AND tool_call_id IS NULL) OR (thread_id IS NOT NULL AND message_id IS NOT NULL AND tool_call_id IS NOT NULL))
);

INSERT INTO "chapter_script_pending__g1_new" ("id", "chapter_id", "source_text", "source_digest", "operation", "thread_id", "message_id", "tool_call_id", "row_version", "created_at", "updated_at") SELECT "id", "chapter_id", "source_text", "source_digest", "operation", "thread_id", "message_id", "tool_call_id", "row_version", "created_at", "updated_at" FROM "chapter_script_pending";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'chapter_script_pending', (SELECT COUNT(*) FROM "chapter_script_pending"), (SELECT COUNT(*) FROM "chapter_script_pending__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "chapter_id", "source_text", "source_digest", "operation", "thread_id", "message_id", "tool_call_id", "row_version", "created_at", "updated_at" FROM "chapter_script_pending" EXCEPT SELECT "id", "chapter_id", "source_text", "source_digest", "operation", "thread_id", "message_id", "tool_call_id", "row_version", "created_at", "updated_at" FROM "chapter_script_pending__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "chapter_id", "source_text", "source_digest", "operation", "thread_id", "message_id", "tool_call_id", "row_version", "created_at", "updated_at" FROM "chapter_script_pending__g1_new" EXCEPT SELECT "id", "chapter_id", "source_text", "source_digest", "operation", "thread_id", "message_id", "tool_call_id", "row_version", "created_at", "updated_at" FROM "chapter_script_pending"));

DROP TABLE "chapter_script_pending";

ALTER TABLE "chapter_script_pending__g1_new" RENAME TO "chapter_script_pending";

CREATE UNIQUE INDEX "uq_chapter_script_pending_chapter" ON "chapter_script_pending" ("chapter_id" ASC);

CREATE INDEX "ix_chapter_script_pending_thread_tool" ON "chapter_script_pending" ("thread_id" ASC, "tool_call_id" ASC);

CREATE TABLE "chapter_script_revisions__g1_new" (
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
  CONSTRAINT "fk_chapter_script_revisions_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_chapter_script_revisions_target_digest_format" CHECK (length(target_working_digest) = 71 AND substr(target_working_digest, 1, 7) = 'sha256:' AND substr(target_working_digest, 8) = lower(substr(target_working_digest, 8)) AND substr(target_working_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_chapter_script_revisions_tool_source_shape" CHECK ((thread_id IS NULL AND message_id IS NULL AND tool_call_id IS NULL) OR (thread_id IS NOT NULL AND message_id IS NOT NULL AND tool_call_id IS NOT NULL))
);

INSERT INTO "chapter_script_revisions__g1_new" ("id", "chapter_id", "source", "thread_id", "message_id", "tool_call_id", "operation", "summary", "target_working_digest", "created_at") SELECT "id", "chapter_id", "source", "thread_id", "message_id", "tool_call_id", "operation", "summary", "target_working_digest", "created_at" FROM "chapter_script_revisions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'chapter_script_revisions', (SELECT COUNT(*) FROM "chapter_script_revisions"), (SELECT COUNT(*) FROM "chapter_script_revisions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "chapter_id", "source", "thread_id", "message_id", "tool_call_id", "operation", "summary", "target_working_digest", "created_at" FROM "chapter_script_revisions" EXCEPT SELECT "id", "chapter_id", "source", "thread_id", "message_id", "tool_call_id", "operation", "summary", "target_working_digest", "created_at" FROM "chapter_script_revisions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "chapter_id", "source", "thread_id", "message_id", "tool_call_id", "operation", "summary", "target_working_digest", "created_at" FROM "chapter_script_revisions__g1_new" EXCEPT SELECT "id", "chapter_id", "source", "thread_id", "message_id", "tool_call_id", "operation", "summary", "target_working_digest", "created_at" FROM "chapter_script_revisions"));

DROP TABLE "chapter_script_revisions";

ALTER TABLE "chapter_script_revisions__g1_new" RENAME TO "chapter_script_revisions";

CREATE UNIQUE INDEX "uq_chapter_script_revisions_thread_tool" ON "chapter_script_revisions" ("thread_id" ASC, "tool_call_id" ASC);

CREATE INDEX "ix_chapter_script_revisions_chapter_created_at" ON "chapter_script_revisions" ("chapter_id" ASC, "created_at" ASC);

CREATE TABLE "story_versions__g1_new" (
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
  CONSTRAINT "fk_story_versions_source_script_version_id__chapter_script_versions" FOREIGN KEY ("source_script_version_id") REFERENCES "chapter_script_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_story_versions_digest_format" CHECK ((source_digest IS NULL OR (length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (length(document_digest) = 71 AND substr(document_digest, 1, 7) = 'sha256:' AND substr(document_digest, 8) = lower(substr(document_digest, 8)) AND substr(document_digest, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_story_versions_lifecycle_times" CHECK ((status = 'pending_confirmation' AND confirmed_at IS NULL AND archived_at IS NULL) OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND archived_at IS NULL) OR (status = 'archived' AND confirmed_at IS NULL AND archived_at IS NOT NULL)),
  CONSTRAINT "ck_story_versions_origin" CHECK (origin IN ('user_edit', 'ai_generate', 'import', 'legacy_import')),
  CONSTRAINT "ck_story_versions_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_story_versions_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1),
  CONSTRAINT "ck_story_versions_source_shape" CHECK (origin = 'legacy_import' OR (source_script_version_id IS NOT NULL AND source_policy_version IS NOT NULL AND source_digest IS NOT NULL)),
  CONSTRAINT "ck_story_versions_status" CHECK (status IN ('pending_confirmation', 'confirmed', 'archived')),
  CONSTRAINT "ck_story_versions_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "story_versions__g1_new" ("id", "project_id", "chapter_id", "version", "status", "source_script_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at") SELECT "id", "project_id", "chapter_id", "version", "status", "source_script_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "story_versions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'story_versions', (SELECT COUNT(*) FROM "story_versions"), (SELECT COUNT(*) FROM "story_versions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "version", "status", "source_script_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "story_versions" EXCEPT SELECT "id", "project_id", "chapter_id", "version", "status", "source_script_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "story_versions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "version", "status", "source_script_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "story_versions__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "version", "status", "source_script_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "story_versions"));

DROP TABLE "story_versions";

ALTER TABLE "story_versions__g1_new" RENAME TO "story_versions";

CREATE UNIQUE INDEX "uq_story_versions_chapter_version" ON "story_versions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_story_versions_id_scope" ON "story_versions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_story_versions_chapter_status" ON "story_versions" ("chapter_id" ASC, "status" ASC);

CREATE INDEX "ix_story_versions_source_script" ON "story_versions" ("source_script_version_id" ASC);

CREATE TABLE "story_scene_projections__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "story_version_id" TEXT NOT NULL,
  "chapter_scene_id" TEXT NOT NULL,
  "scene_key" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "semantic_digest" TEXT NOT NULL,
  CONSTRAINT "fk_story_scene_projections_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_story_scene_projections_story_version_id__story_versions" FOREIGN KEY ("story_version_id") REFERENCES "story_versions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_story_scene_projections_digest_format" CHECK (length(semantic_digest) = 71 AND substr(semantic_digest, 1, 7) = 'sha256:' AND substr(semantic_digest, 8) = lower(substr(semantic_digest, 8)) AND substr(semantic_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_story_scene_projections_order" CHECK (typeof("order") = 'integer' AND "order" >= 1)
);

INSERT INTO "story_scene_projections__g1_new" ("id", "story_version_id", "chapter_scene_id", "scene_key", "order", "name", "semantic_digest") SELECT "id", "story_version_id", "chapter_scene_id", "scene_key", "order", "name", "semantic_digest" FROM "story_scene_projections";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'story_scene_projections', (SELECT COUNT(*) FROM "story_scene_projections"), (SELECT COUNT(*) FROM "story_scene_projections__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "story_version_id", "chapter_scene_id", "scene_key", "order", "name", "semantic_digest" FROM "story_scene_projections" EXCEPT SELECT "id", "story_version_id", "chapter_scene_id", "scene_key", "order", "name", "semantic_digest" FROM "story_scene_projections__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "story_version_id", "chapter_scene_id", "scene_key", "order", "name", "semantic_digest" FROM "story_scene_projections__g1_new" EXCEPT SELECT "id", "story_version_id", "chapter_scene_id", "scene_key", "order", "name", "semantic_digest" FROM "story_scene_projections"));

DROP TABLE "story_scene_projections";

ALTER TABLE "story_scene_projections__g1_new" RENAME TO "story_scene_projections";

CREATE UNIQUE INDEX "uq_story_scene_projections_version_key" ON "story_scene_projections" ("story_version_id" ASC, "scene_key" ASC);

CREATE UNIQUE INDEX "uq_story_scene_projections_version_order" ON "story_scene_projections" ("story_version_id" ASC, "order" ASC);

CREATE INDEX "ix_story_scene_projections_chapter_scene" ON "story_scene_projections" ("chapter_scene_id" ASC);

CREATE TABLE "story_beat_projections__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "story_version_id" TEXT NOT NULL,
  "beat_key" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "chapter_scene_id" TEXT,
  "summary" TEXT NOT NULL,
  "semantic_digest" TEXT NOT NULL,
  CONSTRAINT "fk_story_beat_projections_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_story_beat_projections_story_version_id__story_versions" FOREIGN KEY ("story_version_id") REFERENCES "story_versions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_story_beat_projections_digest_format" CHECK (length(semantic_digest) = 71 AND substr(semantic_digest, 1, 7) = 'sha256:' AND substr(semantic_digest, 8) = lower(substr(semantic_digest, 8)) AND substr(semantic_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_story_beat_projections_order" CHECK (typeof("order") = 'integer' AND "order" >= 1)
);

INSERT INTO "story_beat_projections__g1_new" ("id", "story_version_id", "beat_key", "order", "chapter_scene_id", "summary", "semantic_digest") SELECT "id", "story_version_id", "beat_key", "order", "chapter_scene_id", "summary", "semantic_digest" FROM "story_beat_projections";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'story_beat_projections', (SELECT COUNT(*) FROM "story_beat_projections"), (SELECT COUNT(*) FROM "story_beat_projections__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "story_version_id", "beat_key", "order", "chapter_scene_id", "summary", "semantic_digest" FROM "story_beat_projections" EXCEPT SELECT "id", "story_version_id", "beat_key", "order", "chapter_scene_id", "summary", "semantic_digest" FROM "story_beat_projections__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "story_version_id", "beat_key", "order", "chapter_scene_id", "summary", "semantic_digest" FROM "story_beat_projections__g1_new" EXCEPT SELECT "id", "story_version_id", "beat_key", "order", "chapter_scene_id", "summary", "semantic_digest" FROM "story_beat_projections"));

DROP TABLE "story_beat_projections";

ALTER TABLE "story_beat_projections__g1_new" RENAME TO "story_beat_projections";

CREATE UNIQUE INDEX "uq_story_beat_projections_version_key" ON "story_beat_projections" ("story_version_id" ASC, "beat_key" ASC);

CREATE UNIQUE INDEX "uq_story_beat_projections_version_order" ON "story_beat_projections" ("story_version_id" ASC, "order" ASC);

CREATE INDEX "ix_story_beat_projections_chapter_scene" ON "story_beat_projections" ("chapter_scene_id" ASC);

CREATE TABLE "scene_visuals__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chapter_scene_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "source_task_id" TEXT,
  "version" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_scene_visuals_asset_id__assets" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_scene_visuals_chapter_scene_id__chapter_scenes" FOREIGN KEY ("chapter_scene_id") REFERENCES "chapter_scenes" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_scene_visuals_source_task_id__generation_tasks" FOREIGN KEY ("source_task_id") REFERENCES "generation_tasks" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_scene_visuals_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "scene_visuals__g1_new" ("id", "chapter_scene_id", "asset_id", "source_task_id", "version", "created_at") SELECT "id", "chapter_scene_id", "asset_id", "source_task_id", "version", "created_at" FROM "scene_visuals";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'scene_visuals', (SELECT COUNT(*) FROM "scene_visuals"), (SELECT COUNT(*) FROM "scene_visuals__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "chapter_scene_id", "asset_id", "source_task_id", "version", "created_at" FROM "scene_visuals" EXCEPT SELECT "id", "chapter_scene_id", "asset_id", "source_task_id", "version", "created_at" FROM "scene_visuals__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "chapter_scene_id", "asset_id", "source_task_id", "version", "created_at" FROM "scene_visuals__g1_new" EXCEPT SELECT "id", "chapter_scene_id", "asset_id", "source_task_id", "version", "created_at" FROM "scene_visuals"));

DROP TABLE "scene_visuals";

ALTER TABLE "scene_visuals__g1_new" RENAME TO "scene_visuals";

CREATE UNIQUE INDEX "uq_scene_visuals_asset" ON "scene_visuals" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_scene_visuals_id_scene" ON "scene_visuals" ("id" ASC, "chapter_scene_id" ASC);

CREATE UNIQUE INDEX "uq_scene_visuals_scene_version" ON "scene_visuals" ("chapter_scene_id" ASC, "version" ASC);

CREATE TABLE "storyboard_versions__g1_new" (
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
  CONSTRAINT "fk_storyboard_versions_source_story_version_id__story_versions" FOREIGN KEY ("source_story_version_id") REFERENCES "story_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_storyboard_versions_digest_format" CHECK ((source_digest IS NULL OR (length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (length(document_digest) = 71 AND substr(document_digest, 1, 7) = 'sha256:' AND substr(document_digest, 8) = lower(substr(document_digest, 8)) AND substr(document_digest, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_storyboard_versions_lifecycle_times" CHECK ((status = 'pending_confirmation' AND confirmed_at IS NULL AND archived_at IS NULL) OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND archived_at IS NULL) OR (status = 'archived' AND confirmed_at IS NULL AND archived_at IS NOT NULL)),
  CONSTRAINT "ck_storyboard_versions_origin" CHECK (origin IN ('user_edit', 'ai_generate', 'import', 'legacy_import')),
  CONSTRAINT "ck_storyboard_versions_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_storyboard_versions_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1),
  CONSTRAINT "ck_storyboard_versions_source_shape" CHECK (origin = 'legacy_import' OR (source_story_version_id IS NOT NULL AND source_policy_version IS NOT NULL AND source_digest IS NOT NULL)),
  CONSTRAINT "ck_storyboard_versions_status" CHECK (status IN ('pending_confirmation', 'confirmed', 'archived')),
  CONSTRAINT "ck_storyboard_versions_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "storyboard_versions__g1_new" ("id", "project_id", "chapter_id", "version", "status", "source_story_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at") SELECT "id", "project_id", "chapter_id", "version", "status", "source_story_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "storyboard_versions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'storyboard_versions', (SELECT COUNT(*) FROM "storyboard_versions"), (SELECT COUNT(*) FROM "storyboard_versions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "version", "status", "source_story_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "storyboard_versions" EXCEPT SELECT "id", "project_id", "chapter_id", "version", "status", "source_story_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "storyboard_versions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "version", "status", "source_story_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "storyboard_versions__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "version", "status", "source_story_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "origin", "row_version", "created_at", "updated_at", "confirmed_at", "archived_at" FROM "storyboard_versions"));

DROP TABLE "storyboard_versions";

ALTER TABLE "storyboard_versions__g1_new" RENAME TO "storyboard_versions";

CREATE UNIQUE INDEX "uq_storyboard_versions_chapter_version" ON "storyboard_versions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_storyboard_versions_id_scope" ON "storyboard_versions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_storyboard_versions_chapter_status" ON "storyboard_versions" ("chapter_id" ASC, "status" ASC);

CREATE INDEX "ix_storyboard_versions_source_story" ON "storyboard_versions" ("source_story_version_id" ASC);

CREATE TABLE "shots__g1_new" (
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
  CONSTRAINT "fk_shots_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_shots_lifecycle_status" CHECK (lifecycle_status IN ('active', 'retired')),
  CONSTRAINT "ck_shots_retired_time" CHECK ((lifecycle_status = 'active' AND retired_at IS NULL) OR (lifecycle_status = 'retired' AND retired_at IS NOT NULL))
);

INSERT INTO "shots__g1_new" ("id", "project_id", "chapter_id", "lifecycle_status", "current_candidate_lock_revision_id", "created_at", "updated_at", "retired_at") SELECT "id", "project_id", "chapter_id", "lifecycle_status", "current_candidate_lock_revision_id", "created_at", "updated_at", "retired_at" FROM "shots";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'shots', (SELECT COUNT(*) FROM "shots"), (SELECT COUNT(*) FROM "shots__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "lifecycle_status", "current_candidate_lock_revision_id", "created_at", "updated_at", "retired_at" FROM "shots" EXCEPT SELECT "id", "project_id", "chapter_id", "lifecycle_status", "current_candidate_lock_revision_id", "created_at", "updated_at", "retired_at" FROM "shots__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "lifecycle_status", "current_candidate_lock_revision_id", "created_at", "updated_at", "retired_at" FROM "shots__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "lifecycle_status", "current_candidate_lock_revision_id", "created_at", "updated_at", "retired_at" FROM "shots"));

DROP TABLE "shots";

ALTER TABLE "shots__g1_new" RENAME TO "shots";

CREATE UNIQUE INDEX "uq_shots_id_scope" ON "shots" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_shots_chapter_lifecycle" ON "shots" ("chapter_id" ASC, "lifecycle_status" ASC);

CREATE TABLE "storyboard_shot_projections__g1_new" (
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
  CONSTRAINT "fk_storyboard_shot_projections_storyboard_version_id__storyboard_versions" FOREIGN KEY ("storyboard_version_id") REFERENCES "storyboard_versions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_storyboard_shot_projections_digest_format" CHECK (length(semantic_digest) = 71 AND substr(semantic_digest, 1, 7) = 'sha256:' AND substr(semantic_digest, 8) = lower(substr(semantic_digest, 8)) AND substr(semantic_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_storyboard_shot_projections_order" CHECK (typeof("order") = 'integer' AND "order" >= 1)
);

INSERT INTO "storyboard_shot_projections__g1_new" ("id", "storyboard_version_id", "shot_id", "order", "story_beat_projection_id", "chapter_scene_id", "semantic_digest") SELECT "id", "storyboard_version_id", "shot_id", "order", "story_beat_projection_id", "chapter_scene_id", "semantic_digest" FROM "storyboard_shot_projections";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'storyboard_shot_projections', (SELECT COUNT(*) FROM "storyboard_shot_projections"), (SELECT COUNT(*) FROM "storyboard_shot_projections__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "storyboard_version_id", "shot_id", "order", "story_beat_projection_id", "chapter_scene_id", "semantic_digest" FROM "storyboard_shot_projections" EXCEPT SELECT "id", "storyboard_version_id", "shot_id", "order", "story_beat_projection_id", "chapter_scene_id", "semantic_digest" FROM "storyboard_shot_projections__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "storyboard_version_id", "shot_id", "order", "story_beat_projection_id", "chapter_scene_id", "semantic_digest" FROM "storyboard_shot_projections__g1_new" EXCEPT SELECT "id", "storyboard_version_id", "shot_id", "order", "story_beat_projection_id", "chapter_scene_id", "semantic_digest" FROM "storyboard_shot_projections"));

DROP TABLE "storyboard_shot_projections";

ALTER TABLE "storyboard_shot_projections__g1_new" RENAME TO "storyboard_shot_projections";

CREATE UNIQUE INDEX "uq_storyboard_shot_projections_version_order" ON "storyboard_shot_projections" ("storyboard_version_id" ASC, "order" ASC);

CREATE UNIQUE INDEX "uq_storyboard_shot_projections_version_shot" ON "storyboard_shot_projections" ("storyboard_version_id" ASC, "shot_id" ASC);

CREATE INDEX "ix_storyboard_shot_projections_shot" ON "storyboard_shot_projections" ("shot_id" ASC);

CREATE INDEX "ix_storyboard_shot_projections_story_beat" ON "storyboard_shot_projections" ("story_beat_projection_id" ASC);

CREATE TABLE "storyboard_shot_characters__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storyboard_shot_projection_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "source_token" TEXT NOT NULL,
  "character_id" TEXT,
  CONSTRAINT "fk_storyboard_shot_characters_character_id__characters" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_storyboard_shot_characters_storyboard_shot_projection_id__storyboard_shot_projections" FOREIGN KEY ("storyboard_shot_projection_id") REFERENCES "storyboard_shot_projections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_storyboard_shot_characters_order" CHECK (typeof("order") = 'integer' AND "order" >= 1),
  CONSTRAINT "ck_storyboard_shot_characters_source_token" CHECK (typeof(source_token) = 'text' AND length(trim(source_token)) > 0 AND instr(source_token, char(0)) = 0)
);

INSERT INTO "storyboard_shot_characters__g1_new" ("id", "storyboard_shot_projection_id", "order", "source_token", "character_id") SELECT "id", "storyboard_shot_projection_id", "order", "source_token", "character_id" FROM "storyboard_shot_characters";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'storyboard_shot_characters', (SELECT COUNT(*) FROM "storyboard_shot_characters"), (SELECT COUNT(*) FROM "storyboard_shot_characters__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "storyboard_shot_projection_id", "order", "source_token", "character_id" FROM "storyboard_shot_characters" EXCEPT SELECT "id", "storyboard_shot_projection_id", "order", "source_token", "character_id" FROM "storyboard_shot_characters__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "storyboard_shot_projection_id", "order", "source_token", "character_id" FROM "storyboard_shot_characters__g1_new" EXCEPT SELECT "id", "storyboard_shot_projection_id", "order", "source_token", "character_id" FROM "storyboard_shot_characters"));

DROP TABLE "storyboard_shot_characters";

ALTER TABLE "storyboard_shot_characters__g1_new" RENAME TO "storyboard_shot_characters";

CREATE UNIQUE INDEX "uq_storyboard_shot_characters_projection_order" ON "storyboard_shot_characters" ("storyboard_shot_projection_id" ASC, "order" ASC);

CREATE INDEX "ix_storyboard_shot_characters_character" ON "storyboard_shot_characters" ("character_id" ASC);

CREATE TABLE "preflight_revisions__g1_new" (
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
  CONSTRAINT "fk_preflight_revisions_source_storyboard_version_id__storyboard_versions" FOREIGN KEY ("source_storyboard_version_id") REFERENCES "storyboard_versions" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_preflight_revisions_confirmed_time" CHECK ((status = 'confirmed' AND confirmed_at IS NOT NULL) OR (status = 'archived' AND confirmed_at IS NOT NULL)),
  CONSTRAINT "ck_preflight_revisions_digest_format" CHECK ((length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*') AND (length(document_digest) = 71 AND substr(document_digest, 1, 7) = 'sha256:' AND substr(document_digest, 8) = lower(substr(document_digest, 8)) AND substr(document_digest, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_preflight_revisions_ready_boolean" CHECK (typeof(ready) = 'integer' AND ready IN (0, 1)),
  CONSTRAINT "ck_preflight_revisions_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1),
  CONSTRAINT "ck_preflight_revisions_status" CHECK (status IN ('confirmed', 'archived')),
  CONSTRAINT "ck_preflight_revisions_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "preflight_revisions__g1_new" ("id", "project_id", "chapter_id", "version", "status", "source_storyboard_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "ready", "created_at", "confirmed_at") SELECT "id", "project_id", "chapter_id", "version", "status", "source_storyboard_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "ready", "created_at", "confirmed_at" FROM "preflight_revisions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'preflight_revisions', (SELECT COUNT(*) FROM "preflight_revisions"), (SELECT COUNT(*) FROM "preflight_revisions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "version", "status", "source_storyboard_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "ready", "created_at", "confirmed_at" FROM "preflight_revisions" EXCEPT SELECT "id", "project_id", "chapter_id", "version", "status", "source_storyboard_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "ready", "created_at", "confirmed_at" FROM "preflight_revisions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "version", "status", "source_storyboard_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "ready", "created_at", "confirmed_at" FROM "preflight_revisions__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "version", "status", "source_storyboard_version_id", "source_policy_version", "source_digest", "document_json", "schema_version", "document_digest", "ready", "created_at", "confirmed_at" FROM "preflight_revisions"));

DROP TABLE "preflight_revisions";

ALTER TABLE "preflight_revisions__g1_new" RENAME TO "preflight_revisions";

CREATE UNIQUE INDEX "uq_preflight_revisions_chapter_version" ON "preflight_revisions" ("chapter_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_preflight_revisions_id_scope" ON "preflight_revisions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_preflight_revisions_source_storyboard" ON "preflight_revisions" ("source_storyboard_version_id" ASC);

CREATE TABLE "characters__g1_new" (
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
  CONSTRAINT "fk_characters_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_characters_entity_type" CHECK (entity_type IN ('human', 'creature', 'group', 'voice')),
  CONSTRAINT "ck_characters_finalized_time" CHECK ((status IN ('draft', 'needs_reference') AND finalized_at IS NULL) OR (status IN ('finalized', 'in_use') AND finalized_at IS NOT NULL)),
  CONSTRAINT "ck_characters_level" CHECK (level IN ('lead', 'recurring', 'chapter', 'minor', 'extra')),
  CONSTRAINT "ck_characters_normalized_name" CHECK (typeof(normalized_name) = 'text' AND length(trim(normalized_name)) > 0 AND instr(normalized_name, char(0)) = 0),
  CONSTRAINT "ck_characters_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_characters_source" CHECK (source IN ('script_outline', 'imported_script', 'manual', 'story_structure', 'image_preflight')),
  CONSTRAINT "ck_characters_status" CHECK (status IN ('draft', 'needs_reference', 'finalized', 'in_use'))
);

INSERT INTO "characters__g1_new" ("id", "project_id", "name", "normalized_name", "role", "level", "entity_type", "status", "appearance", "personality", "prompt_fragment", "source", "preview_visual_id", "primary_visual_id", "row_version", "created_at", "updated_at", "finalized_at") SELECT "id", "project_id", "name", "normalized_name", "role", "level", "entity_type", "status", "appearance", "personality", "prompt_fragment", "source", "preview_visual_id", "primary_visual_id", "row_version", "created_at", "updated_at", "finalized_at" FROM "characters";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'characters', (SELECT COUNT(*) FROM "characters"), (SELECT COUNT(*) FROM "characters__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "name", "normalized_name", "role", "level", "entity_type", "status", "appearance", "personality", "prompt_fragment", "source", "preview_visual_id", "primary_visual_id", "row_version", "created_at", "updated_at", "finalized_at" FROM "characters" EXCEPT SELECT "id", "project_id", "name", "normalized_name", "role", "level", "entity_type", "status", "appearance", "personality", "prompt_fragment", "source", "preview_visual_id", "primary_visual_id", "row_version", "created_at", "updated_at", "finalized_at" FROM "characters__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "name", "normalized_name", "role", "level", "entity_type", "status", "appearance", "personality", "prompt_fragment", "source", "preview_visual_id", "primary_visual_id", "row_version", "created_at", "updated_at", "finalized_at" FROM "characters__g1_new" EXCEPT SELECT "id", "project_id", "name", "normalized_name", "role", "level", "entity_type", "status", "appearance", "personality", "prompt_fragment", "source", "preview_visual_id", "primary_visual_id", "row_version", "created_at", "updated_at", "finalized_at" FROM "characters"));

DROP TABLE "characters";

ALTER TABLE "characters__g1_new" RENAME TO "characters";

CREATE UNIQUE INDEX "uq_characters_id_project" ON "characters" ("id" ASC, "project_id" ASC);

CREATE UNIQUE INDEX "uq_characters_project_normalized_name" ON "characters" ("project_id" ASC, "normalized_name" ASC);

CREATE INDEX "ix_characters_project_level" ON "characters" ("project_id" ASC, "level" ASC);

CREATE INDEX "ix_characters_project_status" ON "characters" ("project_id" ASC, "status" ASC);

CREATE TABLE "character_visuals__g1_new" (
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
  CONSTRAINT "fk_character_visuals_source_visual_id__character_visuals" FOREIGN KEY ("source_visual_id") REFERENCES "character_visuals" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_character_visuals_confirmed_time" CHECK ((kind = 'preview_front' AND confirmed_at IS NULL) OR (kind = 'final_reference' AND confirmed_at IS NOT NULL)),
  CONSTRAINT "ck_character_visuals_kind" CHECK (kind IN ('preview_front', 'final_reference')),
  CONSTRAINT "ck_character_visuals_status" CHECK (status IN ('available', 'superseded', 'removed')),
  CONSTRAINT "ck_character_visuals_version" CHECK (typeof(version) = 'integer' AND version >= 1)
);

INSERT INTO "character_visuals__g1_new" ("id", "character_id", "asset_id", "kind", "version", "source_visual_id", "status", "created_at", "confirmed_at") SELECT "id", "character_id", "asset_id", "kind", "version", "source_visual_id", "status", "created_at", "confirmed_at" FROM "character_visuals";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'character_visuals', (SELECT COUNT(*) FROM "character_visuals"), (SELECT COUNT(*) FROM "character_visuals__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "character_id", "asset_id", "kind", "version", "source_visual_id", "status", "created_at", "confirmed_at" FROM "character_visuals" EXCEPT SELECT "id", "character_id", "asset_id", "kind", "version", "source_visual_id", "status", "created_at", "confirmed_at" FROM "character_visuals__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "character_id", "asset_id", "kind", "version", "source_visual_id", "status", "created_at", "confirmed_at" FROM "character_visuals__g1_new" EXCEPT SELECT "id", "character_id", "asset_id", "kind", "version", "source_visual_id", "status", "created_at", "confirmed_at" FROM "character_visuals"));

DROP TABLE "character_visuals";

ALTER TABLE "character_visuals__g1_new" RENAME TO "character_visuals";

CREATE UNIQUE INDEX "uq_character_visuals_asset" ON "character_visuals" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_character_visuals_character_version" ON "character_visuals" ("character_id" ASC, "version" ASC);

CREATE UNIQUE INDEX "uq_character_visuals_id_character" ON "character_visuals" ("id" ASC, "character_id" ASC);

CREATE INDEX "ix_character_visuals_source_visual" ON "character_visuals" ("source_visual_id" ASC);

CREATE TABLE "assets__g1_new" (
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
  CONSTRAINT "fk_assets_source_task_id__generation_tasks" FOREIGN KEY ("source_task_id") REFERENCES "generation_tasks" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_assets_metadata_digest_format" CHECK ((length(metadata_digest) = 71 AND substr(metadata_digest, 1, 7) = 'sha256:' AND substr(metadata_digest, 8) = lower(substr(metadata_digest, 8)) AND substr(metadata_digest, 8) NOT GLOB '*[^0-9a-f]*') AND (sha256 IS NULL OR (length(sha256) = 71 AND substr(sha256, 1, 7) = 'sha256:' AND substr(sha256, 8) = lower(substr(sha256, 8)) AND substr(sha256, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_assets_metadata_schema_version" CHECK (typeof(metadata_schema_version) = 'integer' AND metadata_schema_version >= 1),
  CONSTRAINT "ck_assets_nonnegative_dimensions" CHECK ((bytes IS NULL OR (typeof(bytes) = 'integer' AND bytes >= 0)) AND (width IS NULL OR (typeof(width) = 'integer' AND width >= 0)) AND (height IS NULL OR (typeof(height) = 'integer' AND height >= 0)) AND (duration_ms IS NULL OR (typeof(duration_ms) = 'integer' AND duration_ms >= 0))),
  CONSTRAINT "ck_assets_ready_requirements" CHECK (status <> 'ready' OR (sha256 IS NOT NULL AND bytes IS NOT NULL AND typeof(bytes) = 'integer' AND bytes > 0 AND typeof(mime_type) = 'text' AND length(trim(mime_type)) > 0 AND instr(mime_type, char(0)) = 0 AND ready_at IS NOT NULL AND (type <> 'image' OR (width IS NOT NULL AND typeof(width) = 'integer' AND width > 0 AND height IS NOT NULL AND typeof(height) = 'integer' AND height > 0)))),
  CONSTRAINT "ck_assets_status" CHECK (status IN ('staged', 'ready', 'failed', 'missing', 'deleting')),
  CONSTRAINT "ck_assets_storage_key" CHECK (typeof(storage_key) = 'text' AND length(storage_key) > 0 AND substr(storage_key, 1, 1) <> '/' AND storage_key NOT GLOB '[A-Za-z]:*' AND instr(storage_key, '\') = 0 AND instr(storage_key, char(0)) = 0 AND instr(storage_key, '//') = 0 AND storage_key NOT IN ('.', '..') AND storage_key NOT GLOB './*' AND storage_key NOT GLOB '../*' AND storage_key NOT GLOB '*/./*' AND storage_key NOT GLOB '*/../*' AND storage_key NOT GLOB '*/.' AND storage_key NOT GLOB '*/..'),
  CONSTRAINT "ck_assets_terminal_times" CHECK ((status = 'staged' AND ready_at IS NULL AND failed_at IS NULL AND deleting_at IS NULL) OR (status IN ('ready', 'missing') AND ready_at IS NOT NULL AND failed_at IS NULL AND deleting_at IS NULL) OR (status = 'failed' AND ready_at IS NULL AND failed_at IS NOT NULL AND deleting_at IS NULL) OR (status = 'deleting' AND failed_at IS NULL AND deleting_at IS NOT NULL)),
  CONSTRAINT "ck_assets_type" CHECK (type IN ('image', 'audio', 'video', 'document', 'archive', 'font'))
);

INSERT INTO "assets__g1_new" ("id", "project_id", "chapter_id", "type", "role", "mime_type", "storage_key", "status", "sha256", "bytes", "width", "height", "duration_ms", "source_task_id", "metadata_json", "metadata_schema_version", "metadata_digest", "created_at", "updated_at", "ready_at", "failed_at", "deleting_at") SELECT "id", "project_id", "chapter_id", "type", "role", "mime_type", "storage_key", "status", "sha256", "bytes", "width", "height", "duration_ms", "source_task_id", "metadata_json", "metadata_schema_version", "metadata_digest", "created_at", "updated_at", "ready_at", "failed_at", "deleting_at" FROM "assets";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'assets', (SELECT COUNT(*) FROM "assets"), (SELECT COUNT(*) FROM "assets__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "type", "role", "mime_type", "storage_key", "status", "sha256", "bytes", "width", "height", "duration_ms", "source_task_id", "metadata_json", "metadata_schema_version", "metadata_digest", "created_at", "updated_at", "ready_at", "failed_at", "deleting_at" FROM "assets" EXCEPT SELECT "id", "project_id", "chapter_id", "type", "role", "mime_type", "storage_key", "status", "sha256", "bytes", "width", "height", "duration_ms", "source_task_id", "metadata_json", "metadata_schema_version", "metadata_digest", "created_at", "updated_at", "ready_at", "failed_at", "deleting_at" FROM "assets__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "type", "role", "mime_type", "storage_key", "status", "sha256", "bytes", "width", "height", "duration_ms", "source_task_id", "metadata_json", "metadata_schema_version", "metadata_digest", "created_at", "updated_at", "ready_at", "failed_at", "deleting_at" FROM "assets__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "type", "role", "mime_type", "storage_key", "status", "sha256", "bytes", "width", "height", "duration_ms", "source_task_id", "metadata_json", "metadata_schema_version", "metadata_digest", "created_at", "updated_at", "ready_at", "failed_at", "deleting_at" FROM "assets"));

DROP TABLE "assets";

ALTER TABLE "assets__g1_new" RENAME TO "assets";

CREATE UNIQUE INDEX "uq_assets_id_scope" ON "assets" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_assets_storage_key" ON "assets" ("storage_key" ASC);

CREATE INDEX "ix_assets_chapter_role" ON "assets" ("chapter_id" ASC, "role" ASC);

CREATE INDEX "ix_assets_project_status_type" ON "assets" ("project_id" ASC, "status" ASC, "type" ASC);

CREATE INDEX "ix_assets_source_task" ON "assets" ("source_task_id" ASC);

CREATE TABLE "candidates__g1_new" (
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
  CONSTRAINT "fk_candidates_task_id_project_id_chapter_id__generation_tasks" FOREIGN KEY ("task_id", "project_id", "chapter_id") REFERENCES "generation_tasks" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_candidates_digest_format" CHECK ((prompt_digest IS NULL OR (length(prompt_digest) = 71 AND substr(prompt_digest, 1, 7) = 'sha256:' AND substr(prompt_digest, 8) = lower(substr(prompt_digest, 8)) AND substr(prompt_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (generation_spec_digest IS NULL OR (length(generation_spec_digest) = 71 AND substr(generation_spec_digest, 1, 7) = 'sha256:' AND substr(generation_spec_digest, 8) = lower(substr(generation_spec_digest, 8)) AND substr(generation_spec_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_candidates_generation_purpose" CHECK (generation_purpose IN ('shot_clean_plate', 'legacy_unspecified')),
  CONSTRAINT "ck_candidates_generation_spec_pair" CHECK ((generation_purpose = 'shot_clean_plate' AND prompt_digest IS NOT NULL AND generation_spec_version IS NOT NULL AND generation_spec_digest IS NOT NULL) OR (generation_purpose = 'legacy_unspecified')),
  CONSTRAINT "ck_candidates_index" CHECK (typeof("index") = 'integer' AND "index" >= 1),
  CONSTRAINT "ck_candidates_score" CHECK (score IS NULL OR (typeof(score) IN ('integer', 'real') AND score >= -1.7976931348623157e308 AND score <= 1.7976931348623157e308)),
  CONSTRAINT "ck_candidates_status" CHECK (status IN ('generated', 'rejected', 'superseded'))
);

INSERT INTO "candidates__g1_new" ("id", "project_id", "chapter_id", "shot_id", "task_id", "asset_id", "index", "status", "favorite_at", "label", "notes", "score", "prompt_digest", "generation_purpose", "generation_spec_version", "generation_spec_digest", "created_at", "updated_at") SELECT "id", "project_id", "chapter_id", "shot_id", "task_id", "asset_id", "index", "status", "favorite_at", "label", "notes", "score", "prompt_digest", "generation_purpose", "generation_spec_version", "generation_spec_digest", "created_at", "updated_at" FROM "candidates";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'candidates', (SELECT COUNT(*) FROM "candidates"), (SELECT COUNT(*) FROM "candidates__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "shot_id", "task_id", "asset_id", "index", "status", "favorite_at", "label", "notes", "score", "prompt_digest", "generation_purpose", "generation_spec_version", "generation_spec_digest", "created_at", "updated_at" FROM "candidates" EXCEPT SELECT "id", "project_id", "chapter_id", "shot_id", "task_id", "asset_id", "index", "status", "favorite_at", "label", "notes", "score", "prompt_digest", "generation_purpose", "generation_spec_version", "generation_spec_digest", "created_at", "updated_at" FROM "candidates__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "shot_id", "task_id", "asset_id", "index", "status", "favorite_at", "label", "notes", "score", "prompt_digest", "generation_purpose", "generation_spec_version", "generation_spec_digest", "created_at", "updated_at" FROM "candidates__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "shot_id", "task_id", "asset_id", "index", "status", "favorite_at", "label", "notes", "score", "prompt_digest", "generation_purpose", "generation_spec_version", "generation_spec_digest", "created_at", "updated_at" FROM "candidates"));

DROP TABLE "candidates";

ALTER TABLE "candidates__g1_new" RENAME TO "candidates";

CREATE UNIQUE INDEX "uq_candidates_asset" ON "candidates" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_candidates_id_scope_shot" ON "candidates" ("id" ASC, "project_id" ASC, "chapter_id" ASC, "shot_id" ASC);

CREATE UNIQUE INDEX "uq_candidates_task_shot_index" ON "candidates" ("task_id" ASC, "shot_id" ASC, "index" ASC);

CREATE INDEX "ix_candidates_chapter_created_at" ON "candidates" ("chapter_id" ASC, "created_at" ASC);

CREATE INDEX "ix_candidates_shot_status" ON "candidates" ("shot_id" ASC, "status" ASC);

CREATE TABLE "candidate_lock_revisions__g1_new" (
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
  CONSTRAINT "fk_candidate_lock_revisions_shot_id_project_id_chapter_id__shots" FOREIGN KEY ("shot_id", "project_id", "chapter_id") REFERENCES "shots" ("id", "project_id", "chapter_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_candidate_lock_revisions_action" CHECK (action IN ('lock', 'replace', 'clear')),
  CONSTRAINT "ck_candidate_lock_revisions_action_candidate" CHECK ((action = 'clear' AND candidate_id IS NULL) OR (action IN ('lock', 'replace') AND candidate_id IS NOT NULL)),
  CONSTRAINT "ck_candidate_lock_revisions_origin" CHECK (origin IN ('runtime', 'legacy_import')),
  CONSTRAINT "ck_candidate_lock_revisions_revision" CHECK (typeof(revision) = 'integer' AND revision >= 1),
  CONSTRAINT "ck_candidate_lock_revisions_runtime_time" CHECK ((origin = 'runtime' AND decided_at IS NOT NULL) OR origin = 'legacy_import')
);

INSERT INTO "candidate_lock_revisions__g1_new" ("id", "project_id", "chapter_id", "shot_id", "revision", "action", "candidate_id", "previous_revision_id", "origin", "reason", "decided_at", "recorded_at") SELECT "id", "project_id", "chapter_id", "shot_id", "revision", "action", "candidate_id", "previous_revision_id", "origin", "reason", "decided_at", "recorded_at" FROM "candidate_lock_revisions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'candidate_lock_revisions', (SELECT COUNT(*) FROM "candidate_lock_revisions"), (SELECT COUNT(*) FROM "candidate_lock_revisions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "shot_id", "revision", "action", "candidate_id", "previous_revision_id", "origin", "reason", "decided_at", "recorded_at" FROM "candidate_lock_revisions" EXCEPT SELECT "id", "project_id", "chapter_id", "shot_id", "revision", "action", "candidate_id", "previous_revision_id", "origin", "reason", "decided_at", "recorded_at" FROM "candidate_lock_revisions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "shot_id", "revision", "action", "candidate_id", "previous_revision_id", "origin", "reason", "decided_at", "recorded_at" FROM "candidate_lock_revisions__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "shot_id", "revision", "action", "candidate_id", "previous_revision_id", "origin", "reason", "decided_at", "recorded_at" FROM "candidate_lock_revisions"));

DROP TABLE "candidate_lock_revisions";

ALTER TABLE "candidate_lock_revisions__g1_new" RENAME TO "candidate_lock_revisions";

CREATE UNIQUE INDEX "uq_candidate_lock_revisions_id_scope_shot" ON "candidate_lock_revisions" ("id" ASC, "project_id" ASC, "chapter_id" ASC, "shot_id" ASC);

CREATE UNIQUE INDEX "uq_candidate_lock_revisions_shot_revision" ON "candidate_lock_revisions" ("shot_id" ASC, "revision" ASC);

CREATE INDEX "ix_candidate_lock_revisions_candidate" ON "candidate_lock_revisions" ("candidate_id" ASC);

CREATE INDEX "ix_candidate_lock_revisions_previous" ON "candidate_lock_revisions" ("previous_revision_id" ASC);

CREATE INDEX "ix_candidate_lock_revisions_scope_revision" ON "candidate_lock_revisions" ("project_id" ASC, "chapter_id" ASC, "shot_id" ASC, "revision" DESC);

CREATE TABLE "app_preferences__g1_new" (
  "id" TEXT NOT NULL DEFAULT 'primary' PRIMARY KEY,
  "theme" TEXT NOT NULL DEFAULT 'system',
  "active_image_provider_id" TEXT,
  "default_text_provider_id" TEXT,
  "default_text_model_id" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_app_preferences_active_image_provider_id__provider_configs" FOREIGN KEY ("active_image_provider_id") REFERENCES "provider_configs" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_app_preferences_default_text_provider_id__provider_configs" FOREIGN KEY ("default_text_provider_id") REFERENCES "provider_configs" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_app_preferences_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_app_preferences_singleton" CHECK (id = 'primary'),
  CONSTRAINT "ck_app_preferences_theme" CHECK (theme IN ('system', 'dark', 'light'))
);

INSERT INTO "app_preferences__g1_new" ("id", "theme", "active_image_provider_id", "default_text_provider_id", "default_text_model_id", "row_version", "updated_at") SELECT "id", "theme", "active_image_provider_id", "default_text_provider_id", "default_text_model_id", "row_version", "updated_at" FROM "app_preferences";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'app_preferences', (SELECT COUNT(*) FROM "app_preferences"), (SELECT COUNT(*) FROM "app_preferences__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "theme", "active_image_provider_id", "default_text_provider_id", "default_text_model_id", "row_version", "updated_at" FROM "app_preferences" EXCEPT SELECT "id", "theme", "active_image_provider_id", "default_text_provider_id", "default_text_model_id", "row_version", "updated_at" FROM "app_preferences__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "theme", "active_image_provider_id", "default_text_provider_id", "default_text_model_id", "row_version", "updated_at" FROM "app_preferences__g1_new" EXCEPT SELECT "id", "theme", "active_image_provider_id", "default_text_provider_id", "default_text_model_id", "row_version", "updated_at" FROM "app_preferences"));

DROP TABLE "app_preferences";

ALTER TABLE "app_preferences__g1_new" RENAME TO "app_preferences";

CREATE TABLE "provider_configs__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider_id" TEXT NOT NULL,
  "runtime_kind" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "base_url" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT 0,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "ck_provider_configs_enabled_boolean" CHECK (typeof(enabled) = 'integer' AND enabled IN (0, 1)),
  CONSTRAINT "ck_provider_configs_nonempty_ids" CHECK ((typeof(provider_id) = 'text' AND length(trim(provider_id)) > 0 AND instr(provider_id, char(0)) = 0) AND (typeof(model_id) = 'text' AND length(trim(model_id)) > 0 AND instr(model_id, char(0)) = 0)),
  CONSTRAINT "ck_provider_configs_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_provider_configs_runtime_kind" CHECK (runtime_kind IN ('text', 'image'))
);

INSERT INTO "provider_configs__g1_new" ("id", "provider_id", "runtime_kind", "display_name", "model_id", "base_url", "enabled", "row_version", "created_at", "updated_at") SELECT "id", "provider_id", "runtime_kind", "display_name", "model_id", "base_url", "enabled", "row_version", "created_at", "updated_at" FROM "provider_configs";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'provider_configs', (SELECT COUNT(*) FROM "provider_configs"), (SELECT COUNT(*) FROM "provider_configs__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "provider_id", "runtime_kind", "display_name", "model_id", "base_url", "enabled", "row_version", "created_at", "updated_at" FROM "provider_configs" EXCEPT SELECT "id", "provider_id", "runtime_kind", "display_name", "model_id", "base_url", "enabled", "row_version", "created_at", "updated_at" FROM "provider_configs__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "provider_id", "runtime_kind", "display_name", "model_id", "base_url", "enabled", "row_version", "created_at", "updated_at" FROM "provider_configs__g1_new" EXCEPT SELECT "id", "provider_id", "runtime_kind", "display_name", "model_id", "base_url", "enabled", "row_version", "created_at", "updated_at" FROM "provider_configs"));

DROP TABLE "provider_configs";

ALTER TABLE "provider_configs__g1_new" RENAME TO "provider_configs";

CREATE UNIQUE INDEX "uq_provider_configs_provider_id" ON "provider_configs" ("provider_id" ASC);

CREATE INDEX "ix_provider_configs_runtime_enabled" ON "provider_configs" ("runtime_kind" ASC, "enabled" ASC);

CREATE TABLE "credential_metadata__g1_new" (
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
  CONSTRAINT "fk_credential_metadata_provider_config_id__provider_configs" FOREIGN KEY ("provider_config_id") REFERENCES "provider_configs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_credential_metadata_configured_boolean" CHECK (typeof(configured) = 'integer' AND configured IN (0, 1)),
  CONSTRAINT "ck_credential_metadata_configured_shape" CHECK ((status = 'unconfigured' AND configured = 0) OR (status IN ('configured', 'rotating', 'clearing') AND configured = 1) OR status = 'error'),
  CONSTRAINT "ck_credential_metadata_fingerprint_format" CHECK (fingerprint IS NULL OR (length(fingerprint) = 71 AND substr(fingerprint, 1, 7) = 'sha256:' AND substr(fingerprint, 8) = lower(substr(fingerprint, 8)) AND substr(fingerprint, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_credential_metadata_owner" CHECK (owner IN ('opencode', 'image_secret_store', 'environment')),
  CONSTRAINT "ck_credential_metadata_secret_ref_format" CHECK (secret_ref IS NULL OR (length(secret_ref) = 55 AND substr(secret_ref, 1, 19) = 'airoaming:image:v1:' AND substr(secret_ref, 20) = lower(substr(secret_ref, 20)) AND substr(secret_ref, 28, 1) = '-' AND substr(secret_ref, 33, 1) = '-' AND substr(secret_ref, 34, 1) = '4' AND substr(secret_ref, 38, 1) = '-' AND substr(secret_ref, 39, 1) IN ('8', '9', 'a', 'b') AND substr(secret_ref, 43, 1) = '-' AND length(replace(substr(secret_ref, 20), '-', '')) = 32 AND replace(substr(secret_ref, 20), '-', '') NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_credential_metadata_status" CHECK (status IN ('unconfigured', 'configured', 'rotating', 'clearing', 'error')),
  CONSTRAINT "ck_credential_metadata_text_owner_shape" CHECK ((configured = 0 AND fingerprint IS NULL AND secret_ref IS NULL) OR (configured = 1 AND fingerprint IS NOT NULL AND ((owner = 'image_secret_store' AND secret_ref IS NOT NULL) OR (owner IN ('opencode', 'environment') AND secret_ref IS NULL))))
);

INSERT INTO "credential_metadata__g1_new" ("id", "provider_config_id", "owner", "status", "secret_ref", "fingerprint", "configured", "rotated_at", "created_at", "updated_at") SELECT "id", "provider_config_id", "owner", "status", "secret_ref", "fingerprint", "configured", "rotated_at", "created_at", "updated_at" FROM "credential_metadata";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'credential_metadata', (SELECT COUNT(*) FROM "credential_metadata"), (SELECT COUNT(*) FROM "credential_metadata__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "provider_config_id", "owner", "status", "secret_ref", "fingerprint", "configured", "rotated_at", "created_at", "updated_at" FROM "credential_metadata" EXCEPT SELECT "id", "provider_config_id", "owner", "status", "secret_ref", "fingerprint", "configured", "rotated_at", "created_at", "updated_at" FROM "credential_metadata__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "provider_config_id", "owner", "status", "secret_ref", "fingerprint", "configured", "rotated_at", "created_at", "updated_at" FROM "credential_metadata__g1_new" EXCEPT SELECT "id", "provider_config_id", "owner", "status", "secret_ref", "fingerprint", "configured", "rotated_at", "created_at", "updated_at" FROM "credential_metadata"));

DROP TABLE "credential_metadata";

ALTER TABLE "credential_metadata__g1_new" RENAME TO "credential_metadata";

CREATE UNIQUE INDEX "uq_credential_metadata_provider" ON "credential_metadata" ("provider_config_id" ASC);

CREATE UNIQUE INDEX "uq_credential_metadata_secret_ref" ON "credential_metadata" ("secret_ref" ASC);

CREATE TABLE "project_context_facts__g1_new" (
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
  CONSTRAINT "fk_project_context_facts_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_project_context_facts_digest_format" CHECK (length(content_digest) = 71 AND substr(content_digest, 1, 7) = 'sha256:' AND substr(content_digest, 8) = lower(substr(content_digest, 8)) AND substr(content_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_project_context_facts_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1),
  CONSTRAINT "ck_project_context_facts_status" CHECK (status IN ('confirmed', 'superseded', 'archived')),
  CONSTRAINT "ck_project_context_facts_superseded_time" CHECK ((status = 'confirmed' AND superseded_at IS NULL) OR (status IN ('superseded', 'archived') AND superseded_at IS NOT NULL))
);

INSERT INTO "project_context_facts__g1_new" ("id", "project_id", "type", "content_json", "schema_version", "content_digest", "source_type", "source_id", "status", "created_at", "superseded_at") SELECT "id", "project_id", "type", "content_json", "schema_version", "content_digest", "source_type", "source_id", "status", "created_at", "superseded_at" FROM "project_context_facts";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'project_context_facts', (SELECT COUNT(*) FROM "project_context_facts"), (SELECT COUNT(*) FROM "project_context_facts__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "type", "content_json", "schema_version", "content_digest", "source_type", "source_id", "status", "created_at", "superseded_at" FROM "project_context_facts" EXCEPT SELECT "id", "project_id", "type", "content_json", "schema_version", "content_digest", "source_type", "source_id", "status", "created_at", "superseded_at" FROM "project_context_facts__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "type", "content_json", "schema_version", "content_digest", "source_type", "source_id", "status", "created_at", "superseded_at" FROM "project_context_facts__g1_new" EXCEPT SELECT "id", "project_id", "type", "content_json", "schema_version", "content_digest", "source_type", "source_id", "status", "created_at", "superseded_at" FROM "project_context_facts"));

DROP TABLE "project_context_facts";

ALTER TABLE "project_context_facts__g1_new" RENAME TO "project_context_facts";

CREATE INDEX "ix_project_context_facts_project_type_status" ON "project_context_facts" ("project_id" ASC, "type" ASC, "status" ASC);

CREATE INDEX "ix_project_context_facts_source" ON "project_context_facts" ("source_type" ASC, "source_id" ASC);

CREATE TABLE "conversation_threads__g1_new" (
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
  CONSTRAINT "fk_conversation_threads_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_conversation_threads_scope_key" CHECK ((scope_key = 'project' AND chapter_id IS NULL) OR (chapter_id IS NOT NULL AND scope_key = 'chapter:' || chapter_id)),
  CONSTRAINT "ck_conversation_threads_status" CHECK (status IN ('active', 'archived'))
);

INSERT INTO "conversation_threads__g1_new" ("id", "project_id", "chapter_id", "step_key", "scope_key", "title", "status", "created_at", "updated_at") SELECT "id", "project_id", "chapter_id", "step_key", "scope_key", "title", "status", "created_at", "updated_at" FROM "conversation_threads";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'conversation_threads', (SELECT COUNT(*) FROM "conversation_threads"), (SELECT COUNT(*) FROM "conversation_threads__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "step_key", "scope_key", "title", "status", "created_at", "updated_at" FROM "conversation_threads" EXCEPT SELECT "id", "project_id", "chapter_id", "step_key", "scope_key", "title", "status", "created_at", "updated_at" FROM "conversation_threads__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "step_key", "scope_key", "title", "status", "created_at", "updated_at" FROM "conversation_threads__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "step_key", "scope_key", "title", "status", "created_at", "updated_at" FROM "conversation_threads"));

DROP TABLE "conversation_threads";

ALTER TABLE "conversation_threads__g1_new" RENAME TO "conversation_threads";

CREATE UNIQUE INDEX "uq_conversation_threads_id_scope" ON "conversation_threads" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_conversation_threads_scope" ON "conversation_threads" ("project_id" ASC, "step_key" ASC, "scope_key" ASC);

CREATE INDEX "ix_conversation_threads_project_status" ON "conversation_threads" ("project_id" ASC, "status" ASC);

CREATE TABLE "conversation_messages__g1_new" (
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
  CONSTRAINT "fk_conversation_messages_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_conversation_messages_error_pair" CHECK ((status IN ('running', 'completed') AND error_json IS NULL AND error_schema_version IS NULL) OR (status = 'failed' AND error_json IS NOT NULL AND error_schema_version IS NOT NULL AND typeof(error_schema_version) = 'integer' AND error_schema_version >= 1 AND CASE WHEN json_valid(error_json) = 1 THEN json_type(error_json) = 'object' ELSE 0 END)),
  CONSTRAINT "ck_conversation_messages_role" CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  CONSTRAINT "ck_conversation_messages_status" CHECK (status IN ('running', 'completed', 'failed')),
  CONSTRAINT "ck_conversation_messages_terminal_time" CHECK ((status = 'running' AND completed_at IS NULL) OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL))
);

INSERT INTO "conversation_messages__g1_new" ("id", "thread_id", "role", "content", "status", "provider_id", "model_id", "error_json", "error_schema_version", "created_at", "updated_at", "completed_at") SELECT "id", "thread_id", "role", "content", "status", "provider_id", "model_id", "error_json", "error_schema_version", "created_at", "updated_at", "completed_at" FROM "conversation_messages";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'conversation_messages', (SELECT COUNT(*) FROM "conversation_messages"), (SELECT COUNT(*) FROM "conversation_messages__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "thread_id", "role", "content", "status", "provider_id", "model_id", "error_json", "error_schema_version", "created_at", "updated_at", "completed_at" FROM "conversation_messages" EXCEPT SELECT "id", "thread_id", "role", "content", "status", "provider_id", "model_id", "error_json", "error_schema_version", "created_at", "updated_at", "completed_at" FROM "conversation_messages__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "thread_id", "role", "content", "status", "provider_id", "model_id", "error_json", "error_schema_version", "created_at", "updated_at", "completed_at" FROM "conversation_messages__g1_new" EXCEPT SELECT "id", "thread_id", "role", "content", "status", "provider_id", "model_id", "error_json", "error_schema_version", "created_at", "updated_at", "completed_at" FROM "conversation_messages"));

DROP TABLE "conversation_messages";

ALTER TABLE "conversation_messages__g1_new" RENAME TO "conversation_messages";

CREATE INDEX "ix_conversation_messages_status" ON "conversation_messages" ("status" ASC);

CREATE INDEX "ix_conversation_messages_thread_created_at" ON "conversation_messages" ("thread_id" ASC, "created_at" ASC);

CREATE TABLE "dialogue_tool_results__g1_new" (
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
  CONSTRAINT "fk_dialogue_tool_results_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_dialogue_tool_results_digest_format" CHECK (length(payload_digest) = 71 AND substr(payload_digest, 1, 7) = 'sha256:' AND substr(payload_digest, 8) = lower(substr(payload_digest, 8)) AND substr(payload_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_dialogue_tool_results_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1),
  CONSTRAINT "ck_dialogue_tool_results_status" CHECK (status IN ('succeeded', 'failed', 'needs_user_confirmation'))
);

INSERT INTO "dialogue_tool_results__g1_new" ("id", "thread_id", "message_id", "tool_call_id", "tool", "status", "summary", "payload_json", "schema_version", "payload_digest", "created_at") SELECT "id", "thread_id", "message_id", "tool_call_id", "tool", "status", "summary", "payload_json", "schema_version", "payload_digest", "created_at" FROM "dialogue_tool_results";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'dialogue_tool_results', (SELECT COUNT(*) FROM "dialogue_tool_results"), (SELECT COUNT(*) FROM "dialogue_tool_results__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "thread_id", "message_id", "tool_call_id", "tool", "status", "summary", "payload_json", "schema_version", "payload_digest", "created_at" FROM "dialogue_tool_results" EXCEPT SELECT "id", "thread_id", "message_id", "tool_call_id", "tool", "status", "summary", "payload_json", "schema_version", "payload_digest", "created_at" FROM "dialogue_tool_results__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "thread_id", "message_id", "tool_call_id", "tool", "status", "summary", "payload_json", "schema_version", "payload_digest", "created_at" FROM "dialogue_tool_results__g1_new" EXCEPT SELECT "id", "thread_id", "message_id", "tool_call_id", "tool", "status", "summary", "payload_json", "schema_version", "payload_digest", "created_at" FROM "dialogue_tool_results"));

DROP TABLE "dialogue_tool_results";

ALTER TABLE "dialogue_tool_results__g1_new" RENAME TO "dialogue_tool_results";

CREATE UNIQUE INDEX "uq_dialogue_tool_results_thread_call" ON "dialogue_tool_results" ("thread_id" ASC, "tool_call_id" ASC);

CREATE INDEX "ix_dialogue_tool_results_message" ON "dialogue_tool_results" ("message_id" ASC);

CREATE TABLE "dialogue_runtime_sessions__g1_new" (
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
  CONSTRAINT "fk_dialogue_runtime_sessions_thread_id__conversation_threads" FOREIGN KEY ("thread_id") REFERENCES "conversation_threads" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_dialogue_runtime_sessions_closed_time" CHECK ((status = 'active' AND closed_at IS NULL) OR (status IN ('archived', 'closed') AND closed_at IS NOT NULL)),
  CONSTRAINT "ck_dialogue_runtime_sessions_status" CHECK (status IN ('active', 'archived', 'closed'))
);

INSERT INTO "dialogue_runtime_sessions__g1_new" ("id", "thread_id", "runtime", "external_session_id", "status", "provider_id", "model_id", "variant", "created_at", "updated_at", "closed_at") SELECT "id", "thread_id", "runtime", "external_session_id", "status", "provider_id", "model_id", "variant", "created_at", "updated_at", "closed_at" FROM "dialogue_runtime_sessions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'dialogue_runtime_sessions', (SELECT COUNT(*) FROM "dialogue_runtime_sessions"), (SELECT COUNT(*) FROM "dialogue_runtime_sessions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "thread_id", "runtime", "external_session_id", "status", "provider_id", "model_id", "variant", "created_at", "updated_at", "closed_at" FROM "dialogue_runtime_sessions" EXCEPT SELECT "id", "thread_id", "runtime", "external_session_id", "status", "provider_id", "model_id", "variant", "created_at", "updated_at", "closed_at" FROM "dialogue_runtime_sessions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "thread_id", "runtime", "external_session_id", "status", "provider_id", "model_id", "variant", "created_at", "updated_at", "closed_at" FROM "dialogue_runtime_sessions__g1_new" EXCEPT SELECT "id", "thread_id", "runtime", "external_session_id", "status", "provider_id", "model_id", "variant", "created_at", "updated_at", "closed_at" FROM "dialogue_runtime_sessions"));

DROP TABLE "dialogue_runtime_sessions";

ALTER TABLE "dialogue_runtime_sessions__g1_new" RENAME TO "dialogue_runtime_sessions";

CREATE UNIQUE INDEX "uq_dialogue_runtime_sessions_external" ON "dialogue_runtime_sessions" ("runtime" ASC, "external_session_id" ASC);

CREATE INDEX "ix_dialogue_runtime_sessions_thread_status" ON "dialogue_runtime_sessions" ("thread_id" ASC, "status" ASC);

CREATE TABLE "pending_dialogue_artifacts__g1_new" (
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
  CONSTRAINT "fk_pending_dialogue_artifacts_tool_result_id__dialogue_tool_results" FOREIGN KEY ("tool_result_id") REFERENCES "dialogue_tool_results" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_pending_dialogue_artifacts_active_slot" CHECK ((status = 'pending' AND active_slot_key IS NOT NULL) OR (status IN ('applied', 'discarded', 'superseded', 'expired') AND active_slot_key IS NULL)),
  CONSTRAINT "ck_pending_dialogue_artifacts_digest_format" CHECK (length(payload_digest) = 71 AND substr(payload_digest, 1, 7) = 'sha256:' AND substr(payload_digest, 8) = lower(substr(payload_digest, 8)) AND substr(payload_digest, 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "ck_pending_dialogue_artifacts_kind" CHECK (kind IN ('script_import', 'inspiration_seeds', 'script_outline_decision', 'layout_editor_command_set')),
  CONSTRAINT "ck_pending_dialogue_artifacts_resolved_time" CHECK ((status = 'pending' AND resolved_at IS NULL) OR (status IN ('applied', 'discarded', 'superseded', 'expired') AND resolved_at IS NOT NULL)),
  CONSTRAINT "ck_pending_dialogue_artifacts_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1),
  CONSTRAINT "ck_pending_dialogue_artifacts_status" CHECK (status IN ('pending', 'applied', 'discarded', 'superseded', 'expired'))
);

INSERT INTO "pending_dialogue_artifacts__g1_new" ("id", "project_id", "chapter_id", "thread_id", "kind", "status", "active_slot_key", "payload_json", "schema_version", "payload_digest", "source_message_id", "tool_result_id", "created_at", "updated_at", "resolved_at") SELECT "id", "project_id", "chapter_id", "thread_id", "kind", "status", "active_slot_key", "payload_json", "schema_version", "payload_digest", "source_message_id", "tool_result_id", "created_at", "updated_at", "resolved_at" FROM "pending_dialogue_artifacts";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'pending_dialogue_artifacts', (SELECT COUNT(*) FROM "pending_dialogue_artifacts"), (SELECT COUNT(*) FROM "pending_dialogue_artifacts__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "thread_id", "kind", "status", "active_slot_key", "payload_json", "schema_version", "payload_digest", "source_message_id", "tool_result_id", "created_at", "updated_at", "resolved_at" FROM "pending_dialogue_artifacts" EXCEPT SELECT "id", "project_id", "chapter_id", "thread_id", "kind", "status", "active_slot_key", "payload_json", "schema_version", "payload_digest", "source_message_id", "tool_result_id", "created_at", "updated_at", "resolved_at" FROM "pending_dialogue_artifacts__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "thread_id", "kind", "status", "active_slot_key", "payload_json", "schema_version", "payload_digest", "source_message_id", "tool_result_id", "created_at", "updated_at", "resolved_at" FROM "pending_dialogue_artifacts__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "thread_id", "kind", "status", "active_slot_key", "payload_json", "schema_version", "payload_digest", "source_message_id", "tool_result_id", "created_at", "updated_at", "resolved_at" FROM "pending_dialogue_artifacts"));

DROP TABLE "pending_dialogue_artifacts";

ALTER TABLE "pending_dialogue_artifacts__g1_new" RENAME TO "pending_dialogue_artifacts";

CREATE UNIQUE INDEX "uq_pending_dialogue_artifacts_active_slot" ON "pending_dialogue_artifacts" ("active_slot_key" ASC);

CREATE INDEX "ix_pending_dialogue_artifacts_project_kind_status" ON "pending_dialogue_artifacts" ("project_id" ASC, "kind" ASC, "status" ASC);

CREATE INDEX "ix_pending_dialogue_artifacts_thread_created_at" ON "pending_dialogue_artifacts" ("thread_id" ASC, "created_at" ASC);

CREATE TABLE "generation_tasks__g1_new" (
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
  CONSTRAINT "fk_generation_tasks_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_generation_tasks_applicability" CHECK (applicability IS NULL OR (applicability IN ('current', 'historical', 'legacy_unresolved'))),
  CONSTRAINT "ck_generation_tasks_attempt_range" CHECK (typeof(attempt) = 'integer' AND attempt >= 0 AND typeof(max_attempts) = 'integer' AND max_attempts >= 0 AND attempt <= max_attempts),
  CONSTRAINT "ck_generation_tasks_digest_format" CHECK ((input_digest IS NULL OR (length(input_digest) = 71 AND substr(input_digest, 1, 7) = 'sha256:' AND substr(input_digest, 8) = lower(substr(input_digest, 8)) AND substr(input_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (output_digest IS NULL OR (length(output_digest) = 71 AND substr(output_digest, 1, 7) = 'sha256:' AND substr(output_digest, 8) = lower(substr(output_digest, 8)) AND substr(output_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (source_digest IS NULL OR (length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_generation_tasks_import_shape" CHECK ((record_kind = 'runtime' AND import_source IS NULL AND imported_at IS NULL AND observed_evidence_json IS NULL AND evidence_schema_version IS NULL) OR record_kind IN ('legacy_imported', 'legacy_stub')),
  CONSTRAINT "ck_generation_tasks_json_pairs" CHECK (((input_json IS NULL AND input_schema_version IS NULL) OR (input_json IS NOT NULL AND input_schema_version IS NOT NULL AND typeof(input_schema_version) = 'integer' AND input_schema_version >= 1 AND CASE WHEN json_valid(input_json) = 1 THEN json_type(input_json) = 'object' ELSE 0 END AND (record_kind <> 'runtime' OR (json_type(input_json, '$.schemaVersion') = 'integer' AND json_extract(input_json, '$.schemaVersion') = input_schema_version AND json_type(input_json, '$.sourceProjection') = 'object' AND json_type(input_json, '$.sourceProjection.schemaVersion') = 'integer' AND json_extract(input_json, '$.sourceProjection.schemaVersion') = 1)))) AND ((output_json IS NULL AND output_schema_version IS NULL) OR (output_json IS NOT NULL AND output_schema_version IS NOT NULL AND typeof(output_schema_version) = 'integer' AND output_schema_version >= 1 AND CASE WHEN json_valid(output_json) = 1 THEN json_type(output_json) = 'object' ELSE 0 END)) AND ((error_json IS NULL AND error_schema_version IS NULL) OR (error_json IS NOT NULL AND error_schema_version IS NOT NULL AND typeof(error_schema_version) = 'integer' AND error_schema_version >= 1 AND CASE WHEN json_valid(error_json) = 1 THEN json_type(error_json) = 'object' ELSE 0 END)) AND ((observed_evidence_json IS NULL AND evidence_schema_version IS NULL) OR (observed_evidence_json IS NOT NULL AND evidence_schema_version IS NOT NULL AND typeof(evidence_schema_version) = 'integer' AND evidence_schema_version >= 1 AND CASE WHEN json_valid(observed_evidence_json) = 1 THEN json_type(observed_evidence_json) = 'object' ELSE 0 END))),
  CONSTRAINT "ck_generation_tasks_lease_shape" CHECK ((status = 'running' AND lease_owner_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL AND lease_expires_at > heartbeat_at) OR (status IS NULL OR status <> 'running') AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL),
  CONSTRAINT "ck_generation_tasks_legacy_imported_shape" CHECK (record_kind <> 'legacy_imported' OR (retry_disabled = 1 AND max_attempts = 0 AND attempt = 0 AND (status IS NULL OR status IN ('succeeded', 'failed', 'cancelled')) AND next_run_at IS NULL AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL AND cancel_requested_at IS NULL)),
  CONSTRAINT "ck_generation_tasks_legacy_stub_shape" CHECK (record_kind <> 'legacy_stub' OR (status IS NULL AND retry_disabled = 1 AND max_attempts = 0 AND attempt = 0 AND next_run_at IS NULL AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL AND cancel_requested_at IS NULL)),
  CONSTRAINT "ck_generation_tasks_progress_percent" CHECK (progress_percent IS NULL OR (typeof(progress_percent) = 'integer' AND progress_percent BETWEEN 0 AND 100)),
  CONSTRAINT "ck_generation_tasks_provenance_status" CHECK (provenance_status IN ('reference_only', 'partial', 'complete')),
  CONSTRAINT "ck_generation_tasks_record_kind" CHECK (record_kind IN ('runtime', 'legacy_imported', 'legacy_stub')),
  CONSTRAINT "ck_generation_tasks_record_provenance_pair" CHECK ((record_kind = 'runtime' AND provenance_status = 'complete') OR (record_kind = 'legacy_imported' AND provenance_status IN ('partial', 'complete')) OR (record_kind = 'legacy_stub' AND provenance_status IN ('reference_only', 'partial'))),
  CONSTRAINT "ck_generation_tasks_runtime_shape" CHECK (record_kind <> 'runtime' OR (status IS NOT NULL AND retry_disabled = 0 AND max_attempts >= 1 AND idempotency_key IS NOT NULL AND input_json IS NOT NULL AND input_schema_version IS NOT NULL AND input_digest IS NOT NULL AND source_digest IS NOT NULL AND (status = 'queued' OR source_set_sealed_at IS NOT NULL))),
  CONSTRAINT "ck_generation_tasks_status" CHECK (status IS NULL OR (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying'))),
  CONSTRAINT "ck_generation_tasks_terminal_time" CHECK ((status IS NULL AND finished_at IS NULL) OR (status = 'queued' AND started_at IS NULL AND finished_at IS NULL) OR (status IN ('running', 'retrying') AND started_at IS NOT NULL AND finished_at IS NULL) OR (status IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL))
);

INSERT INTO "generation_tasks__g1_new" ("id", "project_id", "chapter_id", "type", "record_kind", "provenance_status", "status", "phase", "progress_percent", "target_type", "target_id", "input_json", "input_schema_version", "input_digest", "output_json", "output_schema_version", "output_digest", "error_json", "error_schema_version", "source_digest", "source_set_sealed_at", "idempotency_key", "concurrency_key", "priority", "attempt", "max_attempts", "next_run_at", "lease_owner_id", "lease_token", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "retry_disabled", "needs_review", "applicability", "import_source", "imported_at", "observed_evidence_json", "evidence_schema_version", "created_at", "updated_at", "started_at", "finished_at") SELECT "id", "project_id", "chapter_id", "type", "record_kind", "provenance_status", "status", "phase", "progress_percent", "target_type", "target_id", "input_json", "input_schema_version", "input_digest", "output_json", "output_schema_version", "output_digest", "error_json", "error_schema_version", "source_digest", "source_set_sealed_at", "idempotency_key", "concurrency_key", "priority", "attempt", "max_attempts", "next_run_at", "lease_owner_id", "lease_token", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "retry_disabled", "needs_review", "applicability", "import_source", "imported_at", "observed_evidence_json", "evidence_schema_version", "created_at", "updated_at", "started_at", "finished_at" FROM "generation_tasks";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'generation_tasks', (SELECT COUNT(*) FROM "generation_tasks"), (SELECT COUNT(*) FROM "generation_tasks__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "type", "record_kind", "provenance_status", "status", "phase", "progress_percent", "target_type", "target_id", "input_json", "input_schema_version", "input_digest", "output_json", "output_schema_version", "output_digest", "error_json", "error_schema_version", "source_digest", "source_set_sealed_at", "idempotency_key", "concurrency_key", "priority", "attempt", "max_attempts", "next_run_at", "lease_owner_id", "lease_token", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "retry_disabled", "needs_review", "applicability", "import_source", "imported_at", "observed_evidence_json", "evidence_schema_version", "created_at", "updated_at", "started_at", "finished_at" FROM "generation_tasks" EXCEPT SELECT "id", "project_id", "chapter_id", "type", "record_kind", "provenance_status", "status", "phase", "progress_percent", "target_type", "target_id", "input_json", "input_schema_version", "input_digest", "output_json", "output_schema_version", "output_digest", "error_json", "error_schema_version", "source_digest", "source_set_sealed_at", "idempotency_key", "concurrency_key", "priority", "attempt", "max_attempts", "next_run_at", "lease_owner_id", "lease_token", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "retry_disabled", "needs_review", "applicability", "import_source", "imported_at", "observed_evidence_json", "evidence_schema_version", "created_at", "updated_at", "started_at", "finished_at" FROM "generation_tasks__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "type", "record_kind", "provenance_status", "status", "phase", "progress_percent", "target_type", "target_id", "input_json", "input_schema_version", "input_digest", "output_json", "output_schema_version", "output_digest", "error_json", "error_schema_version", "source_digest", "source_set_sealed_at", "idempotency_key", "concurrency_key", "priority", "attempt", "max_attempts", "next_run_at", "lease_owner_id", "lease_token", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "retry_disabled", "needs_review", "applicability", "import_source", "imported_at", "observed_evidence_json", "evidence_schema_version", "created_at", "updated_at", "started_at", "finished_at" FROM "generation_tasks__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "type", "record_kind", "provenance_status", "status", "phase", "progress_percent", "target_type", "target_id", "input_json", "input_schema_version", "input_digest", "output_json", "output_schema_version", "output_digest", "error_json", "error_schema_version", "source_digest", "source_set_sealed_at", "idempotency_key", "concurrency_key", "priority", "attempt", "max_attempts", "next_run_at", "lease_owner_id", "lease_token", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "retry_disabled", "needs_review", "applicability", "import_source", "imported_at", "observed_evidence_json", "evidence_schema_version", "created_at", "updated_at", "started_at", "finished_at" FROM "generation_tasks"));

DROP TABLE "generation_tasks";

ALTER TABLE "generation_tasks__g1_new" RENAME TO "generation_tasks";

CREATE UNIQUE INDEX "uq_generation_tasks_id_scope" ON "generation_tasks" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE UNIQUE INDEX "uq_generation_tasks_idempotency_key" ON "generation_tasks" ("idempotency_key" ASC);

CREATE INDEX "ix_generation_tasks_chapter_type_created" ON "generation_tasks" ("chapter_id" ASC, "type" ASC, "created_at" ASC);

CREATE INDEX "ix_generation_tasks_claim" ON "generation_tasks" ("record_kind" ASC, "status" ASC, "next_run_at" ASC, "priority" ASC, "created_at" ASC);

CREATE INDEX "ix_generation_tasks_project_status_updated" ON "generation_tasks" ("project_id" ASC, "status" ASC, "updated_at" ASC);

CREATE INDEX "ix_generation_tasks_recovery" ON "generation_tasks" ("status" ASC, "lease_expires_at" ASC);

CREATE INDEX "ix_generation_tasks_target" ON "generation_tasks" ("target_type" ASC, "target_id" ASC);

CREATE TABLE "task_attempts__g1_new" (
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
  CONSTRAINT "fk_task_attempts_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_task_attempts_attempt_no" CHECK (typeof(attempt_no) = 'integer' AND attempt_no >= 1),
  CONSTRAINT "ck_task_attempts_finished_shape" CHECK ((outcome IS NULL AND finished_at IS NULL) OR (outcome IS NOT NULL AND finished_at IS NOT NULL)),
  CONSTRAINT "ck_task_attempts_json_pairs" CHECK (((error_json IS NULL AND error_schema_version IS NULL) OR (error_json IS NOT NULL AND error_schema_version IS NOT NULL AND typeof(error_schema_version) = 'integer' AND error_schema_version >= 1 AND CASE WHEN json_valid(error_json) = 1 THEN json_type(error_json) = 'object' ELSE 0 END)) AND ((artifact_refs_json IS NULL AND artifact_schema_version IS NULL) OR (artifact_refs_json IS NOT NULL AND artifact_schema_version IS NOT NULL AND typeof(artifact_schema_version) = 'integer' AND artifact_schema_version >= 1 AND CASE WHEN json_valid(artifact_refs_json) = 1 THEN json_type(artifact_refs_json) = 'array' ELSE 0 END))),
  CONSTRAINT "ck_task_attempts_outcome" CHECK (outcome IS NULL OR (outcome IN ('succeeded', 'failed', 'cancelled', 'interrupted')))
);

INSERT INTO "task_attempts__g1_new" ("id", "task_id", "attempt_no", "worker_id", "claim_token", "outcome", "error_json", "error_schema_version", "artifact_refs_json", "artifact_schema_version", "started_at", "finished_at", "created_at") SELECT "id", "task_id", "attempt_no", "worker_id", "claim_token", "outcome", "error_json", "error_schema_version", "artifact_refs_json", "artifact_schema_version", "started_at", "finished_at", "created_at" FROM "task_attempts";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'task_attempts', (SELECT COUNT(*) FROM "task_attempts"), (SELECT COUNT(*) FROM "task_attempts__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "task_id", "attempt_no", "worker_id", "claim_token", "outcome", "error_json", "error_schema_version", "artifact_refs_json", "artifact_schema_version", "started_at", "finished_at", "created_at" FROM "task_attempts" EXCEPT SELECT "id", "task_id", "attempt_no", "worker_id", "claim_token", "outcome", "error_json", "error_schema_version", "artifact_refs_json", "artifact_schema_version", "started_at", "finished_at", "created_at" FROM "task_attempts__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "task_id", "attempt_no", "worker_id", "claim_token", "outcome", "error_json", "error_schema_version", "artifact_refs_json", "artifact_schema_version", "started_at", "finished_at", "created_at" FROM "task_attempts__g1_new" EXCEPT SELECT "id", "task_id", "attempt_no", "worker_id", "claim_token", "outcome", "error_json", "error_schema_version", "artifact_refs_json", "artifact_schema_version", "started_at", "finished_at", "created_at" FROM "task_attempts"));

DROP TABLE "task_attempts";

ALTER TABLE "task_attempts__g1_new" RENAME TO "task_attempts";

CREATE UNIQUE INDEX "uq_task_attempts_claim_token" ON "task_attempts" ("claim_token" ASC);

CREATE UNIQUE INDEX "uq_task_attempts_task_attempt_no" ON "task_attempts" ("task_id" ASC, "attempt_no" ASC);

CREATE INDEX "ix_task_attempts_task_started_at" ON "task_attempts" ("task_id" ASC, "started_at" ASC);

CREATE TABLE "task_concurrency_slots__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "concurrency_key" TEXT NOT NULL,
  "slot_no" INTEGER NOT NULL,
  "task_id" TEXT,
  "lease_owner_id" TEXT,
  "claim_token" TEXT,
  "lease_expires_at" DATETIME,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "fk_task_concurrency_slots_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_task_concurrency_slots_claim_shape" CHECK ((task_id IS NULL AND lease_owner_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL) OR (task_id IS NOT NULL AND lease_owner_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CONSTRAINT "ck_task_concurrency_slots_slot_no" CHECK (typeof(slot_no) = 'integer' AND slot_no >= 1)
);

INSERT INTO "task_concurrency_slots__g1_new" ("id", "concurrency_key", "slot_no", "task_id", "lease_owner_id", "claim_token", "lease_expires_at", "updated_at") SELECT "id", "concurrency_key", "slot_no", "task_id", "lease_owner_id", "claim_token", "lease_expires_at", "updated_at" FROM "task_concurrency_slots";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'task_concurrency_slots', (SELECT COUNT(*) FROM "task_concurrency_slots"), (SELECT COUNT(*) FROM "task_concurrency_slots__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "concurrency_key", "slot_no", "task_id", "lease_owner_id", "claim_token", "lease_expires_at", "updated_at" FROM "task_concurrency_slots" EXCEPT SELECT "id", "concurrency_key", "slot_no", "task_id", "lease_owner_id", "claim_token", "lease_expires_at", "updated_at" FROM "task_concurrency_slots__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "concurrency_key", "slot_no", "task_id", "lease_owner_id", "claim_token", "lease_expires_at", "updated_at" FROM "task_concurrency_slots__g1_new" EXCEPT SELECT "id", "concurrency_key", "slot_no", "task_id", "lease_owner_id", "claim_token", "lease_expires_at", "updated_at" FROM "task_concurrency_slots"));

DROP TABLE "task_concurrency_slots";

ALTER TABLE "task_concurrency_slots__g1_new" RENAME TO "task_concurrency_slots";

CREATE UNIQUE INDEX "uq_task_concurrency_slots_key_no" ON "task_concurrency_slots" ("concurrency_key" ASC, "slot_no" ASC);

CREATE UNIQUE INDEX "uq_task_concurrency_slots_task" ON "task_concurrency_slots" ("task_id" ASC);

CREATE INDEX "ix_task_concurrency_slots_lease_expires" ON "task_concurrency_slots" ("lease_expires_at" ASC);

CREATE TABLE "generation_task_sources__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "task_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  CONSTRAINT "fk_generation_task_sources_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_generation_task_sources_digest_format" CHECK ((length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_generation_task_sources_nonempty_source" CHECK ((typeof(role) = 'text' AND length(trim(role)) > 0 AND instr(role, char(0)) = 0) AND (typeof(source_type) = 'text' AND length(trim(source_type)) > 0 AND instr(source_type, char(0)) = 0) AND (typeof(source_id) = 'text' AND length(trim(source_id)) > 0 AND instr(source_id, char(0)) = 0)),
  CONSTRAINT "ck_generation_task_sources_order" CHECK (typeof("order") = 'integer' AND "order" >= 1)
);

INSERT INTO "generation_task_sources__g1_new" ("id", "task_id", "role", "order", "source_type", "source_id", "source_digest") SELECT "id", "task_id", "role", "order", "source_type", "source_id", "source_digest" FROM "generation_task_sources";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'generation_task_sources', (SELECT COUNT(*) FROM "generation_task_sources"), (SELECT COUNT(*) FROM "generation_task_sources__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "task_id", "role", "order", "source_type", "source_id", "source_digest" FROM "generation_task_sources" EXCEPT SELECT "id", "task_id", "role", "order", "source_type", "source_id", "source_digest" FROM "generation_task_sources__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "task_id", "role", "order", "source_type", "source_id", "source_digest" FROM "generation_task_sources__g1_new" EXCEPT SELECT "id", "task_id", "role", "order", "source_type", "source_id", "source_digest" FROM "generation_task_sources"));

DROP TABLE "generation_task_sources";

ALTER TABLE "generation_task_sources__g1_new" RENAME TO "generation_task_sources";

CREATE UNIQUE INDEX "uq_generation_task_sources_task_role_order" ON "generation_task_sources" ("task_id" ASC, "role" ASC, "order" ASC);

CREATE INDEX "ix_generation_task_sources_source" ON "generation_task_sources" ("source_type" ASC, "source_id" ASC);

CREATE TABLE "layout_working_copies__g1_new" (
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
  CONSTRAINT "ck_layout_working_copies_document_kind" CHECK (document_kind IN ('legacy_chapter_layout_v1', 'layout_document_v1')),
  CONSTRAINT "ck_layout_working_copies_row_version" CHECK (typeof(row_version) = 'integer' AND row_version >= 0),
  CONSTRAINT "ck_layout_working_copies_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1)
);

INSERT INTO "layout_working_copies__g1_new" ("id", "project_id", "chapter_id", "document_kind", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "based_on_revision_id", "row_version", "created_at", "updated_at") SELECT "id", "project_id", "chapter_id", "document_kind", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "based_on_revision_id", "row_version", "created_at", "updated_at" FROM "layout_working_copies";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'layout_working_copies', (SELECT COUNT(*) FROM "layout_working_copies"), (SELECT COUNT(*) FROM "layout_working_copies__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "document_kind", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "based_on_revision_id", "row_version", "created_at", "updated_at" FROM "layout_working_copies" EXCEPT SELECT "id", "project_id", "chapter_id", "document_kind", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "based_on_revision_id", "row_version", "created_at", "updated_at" FROM "layout_working_copies__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "document_kind", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "based_on_revision_id", "row_version", "created_at", "updated_at" FROM "layout_working_copies__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "document_kind", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "based_on_revision_id", "row_version", "created_at", "updated_at" FROM "layout_working_copies"));

DROP TABLE "layout_working_copies";

ALTER TABLE "layout_working_copies__g1_new" RENAME TO "layout_working_copies";

CREATE UNIQUE INDEX "uq_layout_working_copies_chapter" ON "layout_working_copies" ("chapter_id" ASC);

CREATE UNIQUE INDEX "uq_layout_working_copies_id_scope" ON "layout_working_copies" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE TABLE "layout_revisions__g1_new" (
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
  CONSTRAINT "fk_layout_revisions_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_layout_revisions_digest_format" CHECK ((length(document_digest) = 71 AND substr(document_digest, 1, 7) = 'sha256:' AND substr(document_digest, 8) = lower(substr(document_digest, 8)) AND substr(document_digest, 8) NOT GLOB '*[^0-9a-f]*') AND (source_lock_set_digest IS NULL OR (length(source_lock_set_digest) = 71 AND substr(source_lock_set_digest, 1, 7) = 'sha256:' AND substr(source_lock_set_digest, 8) = lower(substr(source_lock_set_digest, 8)) AND substr(source_lock_set_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_layout_revisions_origin" CHECK (origin IN ('runtime', 'legacy_import')),
  CONSTRAINT "ck_layout_revisions_revision" CHECK (typeof(revision) = 'integer' AND revision >= 1),
  CONSTRAINT "ck_layout_revisions_save_reason" CHECK (save_reason IN ('user_checkpoint', 'export_checkpoint', 'history_restore', 'legacy_import')),
  CONSTRAINT "ck_layout_revisions_schema_version" CHECK (typeof(schema_version) = 'integer' AND schema_version >= 1)
);

INSERT INTO "layout_revisions__g1_new" ("id", "project_id", "chapter_id", "revision", "previous_revision_id", "content_based_on_revision_id", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "origin", "save_reason", "binding_set_sealed_at", "created_at") SELECT "id", "project_id", "chapter_id", "revision", "previous_revision_id", "content_based_on_revision_id", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "origin", "save_reason", "binding_set_sealed_at", "created_at" FROM "layout_revisions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'layout_revisions', (SELECT COUNT(*) FROM "layout_revisions"), (SELECT COUNT(*) FROM "layout_revisions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "revision", "previous_revision_id", "content_based_on_revision_id", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "origin", "save_reason", "binding_set_sealed_at", "created_at" FROM "layout_revisions" EXCEPT SELECT "id", "project_id", "chapter_id", "revision", "previous_revision_id", "content_based_on_revision_id", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "origin", "save_reason", "binding_set_sealed_at", "created_at" FROM "layout_revisions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "revision", "previous_revision_id", "content_based_on_revision_id", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "origin", "save_reason", "binding_set_sealed_at", "created_at" FROM "layout_revisions__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "revision", "previous_revision_id", "content_based_on_revision_id", "document_json", "schema_version", "document_digest", "source_lock_set_digest", "origin", "save_reason", "binding_set_sealed_at", "created_at" FROM "layout_revisions"));

DROP TABLE "layout_revisions";

ALTER TABLE "layout_revisions__g1_new" RENAME TO "layout_revisions";

CREATE UNIQUE INDEX "uq_layout_revisions_chapter_revision" ON "layout_revisions" ("chapter_id" ASC, "revision" ASC);

CREATE UNIQUE INDEX "uq_layout_revisions_id_scope" ON "layout_revisions" ("id" ASC, "project_id" ASC, "chapter_id" ASC);

CREATE INDEX "ix_layout_revisions_content_based" ON "layout_revisions" ("content_based_on_revision_id" ASC);

CREATE INDEX "ix_layout_revisions_previous" ON "layout_revisions" ("previous_revision_id" ASC);

CREATE TABLE "layout_source_bindings__g1_new" (
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
  CONSTRAINT "fk_layout_source_bindings_shot_id__shots" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_layout_source_bindings_digest_format" CHECK ((length(source_digest) = 71 AND substr(source_digest, 1, 7) = 'sha256:' AND substr(source_digest, 8) = lower(substr(source_digest, 8)) AND substr(source_digest, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_layout_source_bindings_order" CHECK (typeof("order") = 'integer' AND "order" >= 1),
  CONSTRAINT "ck_layout_source_bindings_reference_shape" CHECK ((candidate_lock_revision_id IS NULL OR (shot_id IS NOT NULL AND candidate_id IS NOT NULL AND asset_id IS NOT NULL)) AND (candidate_id IS NULL OR (shot_id IS NOT NULL AND asset_id IS NOT NULL)))
);

INSERT INTO "layout_source_bindings__g1_new" ("id", "layout_revision_id", "element_id", "role", "order", "shot_id", "candidate_id", "candidate_lock_revision_id", "asset_id", "source_digest") SELECT "id", "layout_revision_id", "element_id", "role", "order", "shot_id", "candidate_id", "candidate_lock_revision_id", "asset_id", "source_digest" FROM "layout_source_bindings";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'layout_source_bindings', (SELECT COUNT(*) FROM "layout_source_bindings"), (SELECT COUNT(*) FROM "layout_source_bindings__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "layout_revision_id", "element_id", "role", "order", "shot_id", "candidate_id", "candidate_lock_revision_id", "asset_id", "source_digest" FROM "layout_source_bindings" EXCEPT SELECT "id", "layout_revision_id", "element_id", "role", "order", "shot_id", "candidate_id", "candidate_lock_revision_id", "asset_id", "source_digest" FROM "layout_source_bindings__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "layout_revision_id", "element_id", "role", "order", "shot_id", "candidate_id", "candidate_lock_revision_id", "asset_id", "source_digest" FROM "layout_source_bindings__g1_new" EXCEPT SELECT "id", "layout_revision_id", "element_id", "role", "order", "shot_id", "candidate_id", "candidate_lock_revision_id", "asset_id", "source_digest" FROM "layout_source_bindings"));

DROP TABLE "layout_source_bindings";

ALTER TABLE "layout_source_bindings__g1_new" RENAME TO "layout_source_bindings";

CREATE UNIQUE INDEX "uq_layout_source_bindings_element_role" ON "layout_source_bindings" ("layout_revision_id" ASC, "element_id" ASC, "role" ASC);

CREATE UNIQUE INDEX "uq_layout_source_bindings_revision_role_order" ON "layout_source_bindings" ("layout_revision_id" ASC, "role" ASC, "order" ASC);

CREATE INDEX "ix_layout_source_bindings_asset" ON "layout_source_bindings" ("asset_id" ASC);

CREATE INDEX "ix_layout_source_bindings_candidate_lock" ON "layout_source_bindings" ("candidate_lock_revision_id" ASC);

CREATE INDEX "ix_layout_source_bindings_shot" ON "layout_source_bindings" ("shot_id" ASC);

CREATE TABLE "export_revisions__g1_new" (
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
  CONSTRAINT "fk_export_revisions_task_id__generation_tasks" FOREIGN KEY ("task_id") REFERENCES "generation_tasks" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_export_revisions_completion_applicability" CHECK (completion_applicability IS NULL OR (completion_applicability IN ('current', 'historical', 'legacy_unresolved'))),
  CONSTRAINT "ck_export_revisions_digest_format" CHECK ((source_lock_set_digest IS NULL OR (length(source_lock_set_digest) = 71 AND substr(source_lock_set_digest, 1, 7) = 'sha256:' AND substr(source_lock_set_digest, 8) = lower(substr(source_lock_set_digest, 8)) AND substr(source_lock_set_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (profile_digest IS NULL OR (length(profile_digest) = 71 AND substr(profile_digest, 1, 7) = 'sha256:' AND substr(profile_digest, 8) = lower(substr(profile_digest, 8)) AND substr(profile_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (preflight_digest IS NULL OR (length(preflight_digest) = 71 AND substr(preflight_digest, 1, 7) = 'sha256:' AND substr(preflight_digest, 8) = lower(substr(preflight_digest, 8)) AND substr(preflight_digest, 8) NOT GLOB '*[^0-9a-f]*')) AND (manifest_digest IS NULL OR (length(manifest_digest) = 71 AND substr(manifest_digest, 1, 7) = 'sha256:' AND substr(manifest_digest, 8) = lower(substr(manifest_digest, 8)) AND substr(manifest_digest, 8) NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT "ck_export_revisions_json_pairs" CHECK (((profile_json IS NULL AND profile_schema_version IS NULL) OR (profile_json IS NOT NULL AND profile_schema_version IS NOT NULL AND typeof(profile_schema_version) = 'integer' AND profile_schema_version >= 1 AND CASE WHEN json_valid(profile_json) = 1 THEN json_type(profile_json) = 'object' ELSE 0 END AND (origin <> 'runtime' OR (json_type(profile_json, '$.schemaVersion') = 'integer' AND json_extract(profile_json, '$.schemaVersion') = profile_schema_version)))) AND ((manifest_json IS NULL AND manifest_schema_version IS NULL) OR (manifest_json IS NOT NULL AND manifest_schema_version IS NOT NULL AND typeof(manifest_schema_version) = 'integer' AND manifest_schema_version >= 1 AND CASE WHEN json_valid(manifest_json) = 1 THEN json_type(manifest_json) = 'object' ELSE 0 END AND (origin <> 'runtime' OR (json_type(manifest_json, '$.schemaVersion') = 'integer' AND json_extract(manifest_json, '$.schemaVersion') = manifest_schema_version))))),
  CONSTRAINT "ck_export_revisions_kind" CHECK (kind IN ('layout_publication', 'asset_package', 'video')),
  CONSTRAINT "ck_export_revisions_origin" CHECK (origin IN ('runtime', 'legacy_import')),
  CONSTRAINT "ck_export_revisions_ready_shape" CHECK (status <> 'ready' OR (manifest_json IS NOT NULL AND manifest_schema_version IS NOT NULL AND manifest_digest IS NOT NULL AND completion_applicability IS NOT NULL AND ready_at IS NOT NULL)),
  CONSTRAINT "ck_export_revisions_revision" CHECK (typeof(revision) = 'integer' AND revision >= 1),
  CONSTRAINT "ck_export_revisions_scope_key" CHECK ((scope_key = 'project' AND chapter_id IS NULL) OR (chapter_id IS NOT NULL AND scope_key = 'chapter:' || chapter_id)),
  CONSTRAINT "ck_export_revisions_status" CHECK (status IN ('queued', 'rendering', 'ready', 'failed', 'cancelled')),
  CONSTRAINT "ck_export_revisions_terminal_times" CHECK ((status IN ('queued', 'rendering') AND ready_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL) OR (status = 'ready' AND ready_at IS NOT NULL AND failed_at IS NULL AND cancelled_at IS NULL) OR (status = 'failed' AND ready_at IS NULL AND failed_at IS NOT NULL AND cancelled_at IS NULL) OR (status = 'cancelled' AND ready_at IS NULL AND failed_at IS NULL AND cancelled_at IS NOT NULL))
);

INSERT INTO "export_revisions__g1_new" ("id", "project_id", "chapter_id", "scope_key", "revision", "kind", "status", "task_id", "layout_revision_id", "source_lock_set_digest", "profile_json", "profile_schema_version", "profile_digest", "preflight_digest", "renderer_version", "manifest_json", "manifest_schema_version", "manifest_digest", "completion_applicability", "origin", "created_at", "ready_at", "failed_at", "cancelled_at") SELECT "id", "project_id", "chapter_id", "scope_key", "revision", "kind", "status", "task_id", "layout_revision_id", "source_lock_set_digest", "profile_json", "profile_schema_version", "profile_digest", "preflight_digest", "renderer_version", "manifest_json", "manifest_schema_version", "manifest_digest", "completion_applicability", "origin", "created_at", "ready_at", "failed_at", "cancelled_at" FROM "export_revisions";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'export_revisions', (SELECT COUNT(*) FROM "export_revisions"), (SELECT COUNT(*) FROM "export_revisions__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "scope_key", "revision", "kind", "status", "task_id", "layout_revision_id", "source_lock_set_digest", "profile_json", "profile_schema_version", "profile_digest", "preflight_digest", "renderer_version", "manifest_json", "manifest_schema_version", "manifest_digest", "completion_applicability", "origin", "created_at", "ready_at", "failed_at", "cancelled_at" FROM "export_revisions" EXCEPT SELECT "id", "project_id", "chapter_id", "scope_key", "revision", "kind", "status", "task_id", "layout_revision_id", "source_lock_set_digest", "profile_json", "profile_schema_version", "profile_digest", "preflight_digest", "renderer_version", "manifest_json", "manifest_schema_version", "manifest_digest", "completion_applicability", "origin", "created_at", "ready_at", "failed_at", "cancelled_at" FROM "export_revisions__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "project_id", "chapter_id", "scope_key", "revision", "kind", "status", "task_id", "layout_revision_id", "source_lock_set_digest", "profile_json", "profile_schema_version", "profile_digest", "preflight_digest", "renderer_version", "manifest_json", "manifest_schema_version", "manifest_digest", "completion_applicability", "origin", "created_at", "ready_at", "failed_at", "cancelled_at" FROM "export_revisions__g1_new" EXCEPT SELECT "id", "project_id", "chapter_id", "scope_key", "revision", "kind", "status", "task_id", "layout_revision_id", "source_lock_set_digest", "profile_json", "profile_schema_version", "profile_digest", "preflight_digest", "renderer_version", "manifest_json", "manifest_schema_version", "manifest_digest", "completion_applicability", "origin", "created_at", "ready_at", "failed_at", "cancelled_at" FROM "export_revisions"));

DROP TABLE "export_revisions";

ALTER TABLE "export_revisions__g1_new" RENAME TO "export_revisions";

CREATE UNIQUE INDEX "uq_export_revisions_id_scope" ON "export_revisions" ("id" ASC, "project_id" ASC, "scope_key" ASC);

CREATE UNIQUE INDEX "uq_export_revisions_scope_kind_revision" ON "export_revisions" ("project_id" ASC, "scope_key" ASC, "kind" ASC, "revision" ASC);

CREATE UNIQUE INDEX "uq_export_revisions_task" ON "export_revisions" ("task_id" ASC);

CREATE INDEX "ix_export_revisions_chapter_kind_status" ON "export_revisions" ("chapter_id" ASC, "kind" ASC, "status" ASC);

CREATE INDEX "ix_export_revisions_layout" ON "export_revisions" ("layout_revision_id" ASC);

CREATE TABLE "export_artifacts__g1_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "export_revision_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  CONSTRAINT "fk_export_artifacts_asset_id__assets" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_export_artifacts_export_revision_id__export_revisions" FOREIGN KEY ("export_revision_id") REFERENCES "export_revisions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_export_artifacts_nonempty_role" CHECK ((typeof(role) = 'text' AND length(trim(role)) > 0 AND instr(role, char(0)) = 0)),
  CONSTRAINT "ck_export_artifacts_order" CHECK (typeof("order") = 'integer' AND "order" >= 1)
);

INSERT INTO "export_artifacts__g1_new" ("id", "export_revision_id", "asset_id", "role", "order") SELECT "id", "export_revision_id", "asset_id", "role", "order" FROM "export_artifacts";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'export_artifacts', (SELECT COUNT(*) FROM "export_artifacts"), (SELECT COUNT(*) FROM "export_artifacts__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "export_revision_id", "asset_id", "role", "order" FROM "export_artifacts" EXCEPT SELECT "id", "export_revision_id", "asset_id", "role", "order" FROM "export_artifacts__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "export_revision_id", "asset_id", "role", "order" FROM "export_artifacts__g1_new" EXCEPT SELECT "id", "export_revision_id", "asset_id", "role", "order" FROM "export_artifacts"));

DROP TABLE "export_artifacts";

ALTER TABLE "export_artifacts__g1_new" RENAME TO "export_artifacts";

CREATE UNIQUE INDEX "uq_export_artifacts_asset" ON "export_artifacts" ("asset_id" ASC);

CREATE UNIQUE INDEX "uq_export_artifacts_revision_role_order" ON "export_artifacts" ("export_revision_id" ASC, "role" ASC, "order" ASC);

CREATE TABLE "outbox_events__g1_new" (
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
  "idempotency_key" TEXT NOT NULL,
  CONSTRAINT "ck_outbox_events_attempt_range" CHECK (typeof(attempt) = 'integer' AND attempt >= 0 AND typeof(max_attempts) = 'integer' AND max_attempts = 3 AND attempt <= max_attempts),
  CONSTRAINT "ck_outbox_events_digest_format" CHECK ((length(payload_digest) = 71 AND substr(payload_digest, 1, 7) = 'sha256:' AND substr(payload_digest, 8) = lower(substr(payload_digest, 8)) AND substr(payload_digest, 8) NOT GLOB '*[^0-9a-f]*')),
  CONSTRAINT "ck_outbox_events_lease_shape" CHECK ((status = 'processing' AND lease_owner_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at > updated_at) OR (status IN ('pending', 'processed', 'failed') AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)),
  CONSTRAINT "ck_outbox_events_processed_time" CHECK ((status = 'processed' AND processed_at IS NOT NULL) OR (status IN ('pending', 'processing', 'failed') AND processed_at IS NULL)),
  CONSTRAINT "ck_outbox_events_schema_version" CHECK (typeof(payload_schema_version) = 'integer' AND payload_schema_version >= 1),
  CONSTRAINT "ck_outbox_events_status" CHECK (status IN ('pending', 'processing', 'processed', 'failed'))
);

INSERT INTO "outbox_events__g1_new" ("id", "event_type", "aggregate_type", "aggregate_id", "payload_json", "payload_schema_version", "payload_digest", "status", "attempt", "max_attempts", "available_at", "lease_owner_id", "lease_token", "lease_expires_at", "last_error_json", "created_at", "updated_at", "processed_at", "idempotency_key") SELECT "id", "event_type", "aggregate_type", "aggregate_id", "payload_json", "payload_schema_version", "payload_digest", "status", "attempt", "max_attempts", "available_at", "lease_owner_id", "lease_token", "lease_expires_at", "last_error_json", "created_at", "updated_at", "processed_at", "idempotency_key" FROM "outbox_events";

INSERT OR ROLLBACK INTO "_g1_rebuild_row_guard" ("table_name", "before_count", "after_count", "difference_count") SELECT 'outbox_events', (SELECT COUNT(*) FROM "outbox_events"), (SELECT COUNT(*) FROM "outbox_events__g1_new"), (SELECT COUNT(*) FROM (SELECT "id", "event_type", "aggregate_type", "aggregate_id", "payload_json", "payload_schema_version", "payload_digest", "status", "attempt", "max_attempts", "available_at", "lease_owner_id", "lease_token", "lease_expires_at", "last_error_json", "created_at", "updated_at", "processed_at", "idempotency_key" FROM "outbox_events" EXCEPT SELECT "id", "event_type", "aggregate_type", "aggregate_id", "payload_json", "payload_schema_version", "payload_digest", "status", "attempt", "max_attempts", "available_at", "lease_owner_id", "lease_token", "lease_expires_at", "last_error_json", "created_at", "updated_at", "processed_at", "idempotency_key" FROM "outbox_events__g1_new")) + (SELECT COUNT(*) FROM (SELECT "id", "event_type", "aggregate_type", "aggregate_id", "payload_json", "payload_schema_version", "payload_digest", "status", "attempt", "max_attempts", "available_at", "lease_owner_id", "lease_token", "lease_expires_at", "last_error_json", "created_at", "updated_at", "processed_at", "idempotency_key" FROM "outbox_events__g1_new" EXCEPT SELECT "id", "event_type", "aggregate_type", "aggregate_id", "payload_json", "payload_schema_version", "payload_digest", "status", "attempt", "max_attempts", "available_at", "lease_owner_id", "lease_token", "lease_expires_at", "last_error_json", "created_at", "updated_at", "processed_at", "idempotency_key" FROM "outbox_events"));

DROP TABLE "outbox_events";

ALTER TABLE "outbox_events__g1_new" RENAME TO "outbox_events";

CREATE UNIQUE INDEX "uq_outbox_events_idempotency_key" ON "outbox_events" ("idempotency_key" ASC);

CREATE UNIQUE INDEX "uq_outbox_events_lease_token" ON "outbox_events" ("lease_token" ASC);

CREATE INDEX "ix_outbox_events_aggregate" ON "outbox_events" ("aggregate_type" ASC, "aggregate_id" ASC);

CREATE INDEX "ix_outbox_events_claim" ON "outbox_events" ("status" ASC, "available_at" ASC, "created_at" ASC);

CREATE INDEX "ix_outbox_events_recovery" ON "outbox_events" ("status" ASC, "lease_expires_at" ASC);

DROP TABLE "_g1_rebuild_row_guard";

CREATE TRIGGER trg_app_preferences_no_second_row BEFORE INSERT ON app_preferences WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_app_preferences_no_second_row') WHERE EXISTS (SELECT 1 FROM app_preferences); END;

CREATE TRIGGER trg_app_preferences_provider_runtime_kind_insert BEFORE INSERT ON app_preferences WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_app_preferences_provider_runtime_kind_insert') WHERE NOT ((NEW.active_image_provider_id IS NULL OR EXISTS ( SELECT 1 FROM provider_configs AS image_provider WHERE image_provider.id = NEW.active_image_provider_id AND image_provider.runtime_kind = 'image' )) AND (NEW.default_text_provider_id IS NULL OR EXISTS ( SELECT 1 FROM provider_configs AS text_provider WHERE text_provider.id = NEW.default_text_provider_id AND text_provider.runtime_kind = 'text' ))); END;

CREATE TRIGGER trg_app_preferences_provider_runtime_kind_update BEFORE UPDATE ON app_preferences WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_app_preferences_provider_runtime_kind_update') WHERE NOT ((NEW.active_image_provider_id IS NULL OR EXISTS ( SELECT 1 FROM provider_configs AS image_provider WHERE image_provider.id = NEW.active_image_provider_id AND image_provider.runtime_kind = 'image' )) AND (NEW.default_text_provider_id IS NULL OR EXISTS ( SELECT 1 FROM provider_configs AS text_provider WHERE text_provider.id = NEW.default_text_provider_id AND text_provider.runtime_kind = 'text' ))); END;

CREATE TRIGGER trg_assets_ready_core_immutable_delete BEFORE DELETE ON assets WHEN OLD.ready_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_assets_ready_core_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_assets_ready_core_immutable_update BEFORE UPDATE ON assets WHEN OLD.ready_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_assets_ready_core_immutable_update') WHERE NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.type IS NOT OLD.type OR NEW.role IS NOT OLD.role OR NEW.created_at IS NOT OLD.created_at OR NEW.ready_at IS NOT OLD.ready_at OR NEW.storage_key IS NOT OLD.storage_key OR NEW.sha256 IS NOT OLD.sha256 OR NEW.bytes IS NOT OLD.bytes OR NEW.mime_type IS NOT OLD.mime_type OR NEW.width IS NOT OLD.width OR NEW.height IS NOT OLD.height OR NEW.duration_ms IS NOT OLD.duration_ms OR NEW.source_task_id IS NOT OLD.source_task_id OR NEW.metadata_json IS NOT OLD.metadata_json OR NEW.metadata_schema_version IS NOT OLD.metadata_schema_version OR NEW.metadata_digest IS NOT OLD.metadata_digest; END;

CREATE TRIGGER trg_assets_ready_transition BEFORE UPDATE ON assets WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_assets_ready_transition') WHERE (NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'staged' AND NEW.status IN ('ready', 'failed', 'deleting')) OR (OLD.status = 'ready' AND NEW.status IN ('missing', 'deleting')) OR (OLD.status = 'missing' AND NEW.status IN ('ready', 'deleting')))) OR (OLD.status = 'staged' AND NEW.status = 'ready' AND (OLD.ready_at IS NOT NULL OR NEW.ready_at IS NULL OR NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active'))) OR (OLD.status = 'missing' AND NEW.status = 'ready' AND NEW.ready_at IS NOT OLD.ready_at) OR (OLD.status = 'deleting' AND NEW.status <> 'deleting'); END;

CREATE TRIGGER trg_assets_source_scope_insert BEFORE INSERT ON assets WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_assets_source_scope_insert') WHERE NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generation_tasks AS task WHERE task.id = NEW.source_task_id AND task.project_id = NEW.project_id AND (task.chapter_id IS NULL OR NEW.chapter_id IS NULL OR task.chapter_id = NEW.chapter_id)); END;

CREATE TRIGGER trg_assets_source_scope_update BEFORE UPDATE ON assets WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_assets_source_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.source_task_id IS NOT OLD.source_task_id OR NEW.created_at IS NOT OLD.created_at OR (NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generation_tasks AS task WHERE task.id = NEW.source_task_id AND task.project_id = NEW.project_id AND (task.chapter_id IS NULL OR NEW.chapter_id IS NULL OR task.chapter_id = NEW.chapter_id))); END;

CREATE TRIGGER trg_assets_unready_insert BEFORE INSERT ON assets WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_assets_unready_insert') WHERE NEW.status = 'ready' OR NEW.ready_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_candidate_lock_revisions_immutable_delete BEFORE DELETE ON candidate_lock_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_candidate_lock_revisions_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_candidate_lock_revisions_immutable_update BEFORE UPDATE ON candidate_lock_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_candidate_lock_revisions_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.shot_id IS NOT OLD.shot_id OR NEW.revision IS NOT OLD.revision OR NEW.action IS NOT OLD.action OR NEW.candidate_id IS NOT OLD.candidate_id OR NEW.previous_revision_id IS NOT OLD.previous_revision_id OR NEW.origin IS NOT OLD.origin OR NEW.reason IS NOT OLD.reason OR NEW.decided_at IS NOT OLD.decided_at OR NEW.recorded_at IS NOT OLD.recorded_at; END;

CREATE TRIGGER trg_candidate_lock_revisions_initial_insert BEFORE INSERT ON candidate_lock_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_candidate_lock_revisions_initial_insert') WHERE NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR NOT EXISTS (SELECT 1 FROM shots AS shot WHERE shot.id = NEW.shot_id AND shot.project_id = NEW.project_id AND shot.chapter_id = NEW.chapter_id) OR (NEW.candidate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidates AS candidate WHERE candidate.id = NEW.candidate_id AND candidate.project_id = NEW.project_id AND candidate.chapter_id = NEW.chapter_id AND candidate.shot_id = NEW.shot_id)) OR (NEW.previous_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_lock_revisions AS previous_revision WHERE previous_revision.id = NEW.previous_revision_id AND previous_revision.project_id = NEW.project_id AND previous_revision.chapter_id = NEW.chapter_id AND previous_revision.shot_id = NEW.shot_id)); END;

CREATE TRIGGER trg_candidates_history_delete BEFORE DELETE ON candidates WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_candidates_history_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_candidates_identity_immutable_update BEFORE UPDATE ON candidates WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_candidates_identity_immutable_update') WHERE NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.shot_id IS NOT OLD.shot_id OR NEW.task_id IS NOT OLD.task_id OR NEW.asset_id IS NOT OLD.asset_id OR NEW."index" IS NOT OLD."index" OR NEW.prompt_digest IS NOT OLD.prompt_digest OR NEW.generation_purpose IS NOT OLD.generation_purpose OR NEW.generation_spec_version IS NOT OLD.generation_spec_version OR NEW.generation_spec_digest IS NOT OLD.generation_spec_digest OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_candidates_task_provenance_insert BEFORE INSERT ON candidates WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_candidates_task_provenance_insert') WHERE NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR NOT EXISTS (SELECT 1 FROM generation_tasks AS task WHERE task.id = NEW.task_id AND task.project_id = NEW.project_id AND task.chapter_id = NEW.chapter_id AND ((task.record_kind = 'runtime' AND NEW.generation_purpose = 'shot_clean_plate' AND NEW.prompt_digest IS NOT NULL AND NEW.generation_spec_version IS NOT NULL AND NEW.generation_spec_digest IS NOT NULL) OR (task.record_kind IN ('legacy_imported', 'legacy_stub') AND NEW.generation_purpose = 'legacy_unspecified'))); END;

CREATE TRIGGER trg_chapter_scenes_current_visual_scope_insert BEFORE INSERT ON chapter_scenes WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_scenes_current_visual_scope_insert') WHERE NEW.current_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scene_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id JOIN projects AS project ON project.id = NEW.project_id WHERE visual.id = NEW.current_visual_id AND visual.chapter_scene_id = NEW.id AND asset.project_id = NEW.project_id AND asset.chapter_id = NEW.chapter_id AND asset.status = 'ready' AND project.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_chapter_scenes_current_visual_scope_update BEFORE UPDATE ON chapter_scenes WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_scenes_current_visual_scope_update') WHERE NEW.current_visual_id IS NOT OLD.current_visual_id AND (NEW.current_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scene_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id JOIN projects AS project ON project.id = NEW.project_id WHERE visual.id = NEW.current_visual_id AND visual.chapter_scene_id = NEW.id AND asset.project_id = NEW.project_id AND asset.chapter_id = NEW.chapter_id AND asset.status = 'ready' AND project.lifecycle_status = 'active')); END;

CREATE TRIGGER trg_chapter_scenes_purge_delete_guard BEFORE DELETE ON chapter_scenes WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_scenes_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_chapter_scenes_scope_insert BEFORE INSERT ON chapter_scenes WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_scenes_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.id = NEW.project_id AND project.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_chapter_scenes_scope_update BEFORE UPDATE ON chapter_scenes WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_scenes_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.scene_key IS NOT OLD.scene_key OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM chapters AS chapter WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id); END;

CREATE TRIGGER trg_chapter_script_pending_dialogue_scope_insert BEFORE INSERT ON chapter_script_pending WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_pending_dialogue_scope_insert') WHERE NOT (EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND (NEW.thread_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_threads AS source_thread WHERE source_thread.id = NEW.thread_id AND source_thread.project_id = owner_chapter.project_id AND source_thread.chapter_id = owner_chapter.id AND (NEW.message_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.message_id AND source_message.thread_id = source_thread.id )) )) )); END;

CREATE TRIGGER trg_chapter_script_pending_dialogue_scope_update BEFORE UPDATE ON chapter_script_pending WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_pending_dialogue_scope_update') WHERE NOT (EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND (NEW.thread_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_threads AS source_thread WHERE source_thread.id = NEW.thread_id AND source_thread.project_id = owner_chapter.project_id AND source_thread.chapter_id = owner_chapter.id AND (NEW.message_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.message_id AND source_message.thread_id = source_thread.id )) )) )); SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_pending_dialogue_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.message_id IS NOT OLD.message_id OR NEW.tool_call_id IS NOT OLD.tool_call_id OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_chapter_script_revisions_dialogue_scope_insert BEFORE INSERT ON chapter_script_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_revisions_dialogue_scope_insert') WHERE NOT (EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND (NEW.thread_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_threads AS source_thread WHERE source_thread.id = NEW.thread_id AND source_thread.project_id = owner_chapter.project_id AND source_thread.chapter_id = owner_chapter.id AND (NEW.message_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.message_id AND source_message.thread_id = source_thread.id )) )) )); END;

CREATE TRIGGER trg_chapter_script_revisions_dialogue_scope_update BEFORE UPDATE ON chapter_script_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_revisions_dialogue_scope_update') WHERE NOT (EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND (NEW.thread_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_threads AS source_thread WHERE source_thread.id = NEW.thread_id AND source_thread.project_id = owner_chapter.project_id AND source_thread.chapter_id = owner_chapter.id AND (NEW.message_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.message_id AND source_message.thread_id = source_thread.id )) )) )); SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_revisions_dialogue_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.source IS NOT OLD.source OR NEW.thread_id IS NOT OLD.thread_id OR NEW.message_id IS NOT OLD.message_id OR NEW.tool_call_id IS NOT OLD.tool_call_id OR NEW.operation IS NOT OLD.operation OR NEW.summary IS NOT OLD.summary OR NEW.target_working_digest IS NOT OLD.target_working_digest OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_chapter_script_revisions_purge_delete_guard BEFORE DELETE ON chapter_script_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_revisions_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM chapters WHERE id = OLD.chapter_id) AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = (SELECT project_id FROM chapters WHERE id = OLD.chapter_id) AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = (SELECT project_id FROM chapters WHERE id = OLD.chapter_id) AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_chapter_script_versions_immutable_delete BEFORE DELETE ON chapter_script_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_versions_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM chapters WHERE id = OLD.chapter_id) AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = (SELECT project_id FROM chapters WHERE id = OLD.chapter_id) AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = (SELECT project_id FROM chapters WHERE id = OLD.chapter_id) AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_chapter_script_versions_immutable_update BEFORE UPDATE ON chapter_script_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapter_script_versions_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.version IS NOT OLD.version OR NEW.source_text IS NOT OLD.source_text OR NEW.source_digest IS NOT OLD.source_digest OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at OR NEW.completed_at IS NOT OLD.completed_at; END;

CREATE TRIGGER trg_chapters_milestone_monotonic BEFORE UPDATE ON chapters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_milestone_monotonic') WHERE CASE NEW.milestone_status WHEN 'draft' THEN 0 WHEN 'script_done' THEN 1 WHEN 'structured' THEN 2 WHEN 'storyboard_done' THEN 3 WHEN 'images_done' THEN 4 WHEN 'layout_done' THEN 5 WHEN 'exported' THEN 6 END < CASE OLD.milestone_status WHEN 'draft' THEN 0 WHEN 'script_done' THEN 1 WHEN 'structured' THEN 2 WHEN 'storyboard_done' THEN 3 WHEN 'images_done' THEN 4 WHEN 'layout_done' THEN 5 WHEN 'exported' THEN 6 END; END;

CREATE TRIGGER trg_chapters_pointer_scope_insert BEFORE INSERT ON chapters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_pointer_scope_insert') WHERE NOT ( (EXISTS (SELECT 1 FROM projects AS owner_project WHERE owner_project.id = NEW.project_id) AND (NEW.current_script_version_id IS NULL OR EXISTS (SELECT 1 FROM chapter_script_versions AS value WHERE value.id = NEW.current_script_version_id AND value.chapter_id = NEW.id)) AND (NEW.current_story_version_id IS NULL OR EXISTS (SELECT 1 FROM story_versions AS value WHERE value.id = NEW.current_story_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.source_script_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL)) AND (NEW.pending_story_version_id IS NULL OR EXISTS (SELECT 1 FROM story_versions AS value WHERE value.id = NEW.pending_story_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'pending_confirmation')) AND (NEW.current_storyboard_version_id IS NULL OR EXISTS (SELECT 1 FROM storyboard_versions AS value WHERE value.id = NEW.current_storyboard_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.source_story_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL)) AND (NEW.pending_storyboard_version_id IS NULL OR EXISTS (SELECT 1 FROM storyboard_versions AS value WHERE value.id = NEW.pending_storyboard_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'pending_confirmation')) AND (NEW.current_preflight_revision_id IS NULL OR EXISTS (SELECT 1 FROM preflight_revisions AS value WHERE value.id = NEW.current_preflight_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.ready = 1 AND value.source_storyboard_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL)) AND (NEW.current_layout_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions AS value WHERE value.id = NEW.current_layout_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.binding_set_sealed_at IS NOT NULL AND NOT (json_extract(value.document_json, '$.kind') = 'legacy_chapter_layout_v1' AND json_extract(value.document_json, '$.sourceResolution') IS NOT 'complete'))) AND (NEW.current_export_revision_id IS NULL OR EXISTS (SELECT 1 FROM export_revisions AS value WHERE value.id = NEW.current_export_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id)) AND (NEW.last_script_revision_id IS NULL OR EXISTS (SELECT 1 FROM chapter_script_revisions AS value WHERE value.id = NEW.last_script_revision_id AND value.chapter_id = NEW.id))) AND ((NEW.current_script_version_id IS NULL AND NEW.current_story_version_id IS NULL AND NEW.pending_story_version_id IS NULL AND NEW.current_storyboard_version_id IS NULL AND NEW.pending_storyboard_version_id IS NULL AND NEW.current_preflight_revision_id IS NULL AND NEW.current_layout_revision_id IS NULL AND NEW.current_export_revision_id IS NULL) OR EXISTS ( SELECT 1 FROM projects AS active_project WHERE active_project.id = NEW.project_id AND active_project.lifecycle_status = 'active' )) ); END;

CREATE TRIGGER trg_chapters_pointer_scope_update BEFORE UPDATE ON chapters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_pointer_scope_update') WHERE NOT (EXISTS (SELECT 1 FROM projects AS owner_project WHERE owner_project.id = NEW.project_id) AND (NEW.current_script_version_id IS NULL OR EXISTS (SELECT 1 FROM chapter_script_versions AS value WHERE value.id = NEW.current_script_version_id AND value.chapter_id = NEW.id)) AND (NEW.current_story_version_id IS NULL OR EXISTS (SELECT 1 FROM story_versions AS value WHERE value.id = NEW.current_story_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.source_script_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL)) AND (NEW.pending_story_version_id IS NULL OR EXISTS (SELECT 1 FROM story_versions AS value WHERE value.id = NEW.pending_story_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'pending_confirmation')) AND (NEW.current_storyboard_version_id IS NULL OR EXISTS (SELECT 1 FROM storyboard_versions AS value WHERE value.id = NEW.current_storyboard_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.source_story_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL)) AND (NEW.pending_storyboard_version_id IS NULL OR EXISTS (SELECT 1 FROM storyboard_versions AS value WHERE value.id = NEW.pending_storyboard_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'pending_confirmation')) AND (NEW.current_preflight_revision_id IS NULL OR EXISTS (SELECT 1 FROM preflight_revisions AS value WHERE value.id = NEW.current_preflight_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.ready = 1 AND value.source_storyboard_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL)) AND (NEW.current_layout_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions AS value WHERE value.id = NEW.current_layout_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.binding_set_sealed_at IS NOT NULL AND NOT (json_extract(value.document_json, '$.kind') = 'legacy_chapter_layout_v1' AND json_extract(value.document_json, '$.sourceResolution') IS NOT 'complete'))) AND (NEW.current_export_revision_id IS NULL OR EXISTS (SELECT 1 FROM export_revisions AS value WHERE value.id = NEW.current_export_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id)) AND (NEW.last_script_revision_id IS NULL OR EXISTS (SELECT 1 FROM chapter_script_revisions AS value WHERE value.id = NEW.last_script_revision_id AND value.chapter_id = NEW.id))); SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_pointer_scope_update') WHERE (NEW.current_script_version_id IS NOT OLD.current_script_version_id OR NEW.current_story_version_id IS NOT OLD.current_story_version_id OR NEW.pending_story_version_id IS NOT OLD.pending_story_version_id OR NEW.current_storyboard_version_id IS NOT OLD.current_storyboard_version_id OR NEW.pending_storyboard_version_id IS NOT OLD.pending_storyboard_version_id OR NEW.current_preflight_revision_id IS NOT OLD.current_preflight_revision_id OR NEW.current_layout_revision_id IS NOT OLD.current_layout_revision_id OR NEW.current_export_revision_id IS NOT OLD.current_export_revision_id OR NEW.last_script_revision_id IS NOT OLD.last_script_revision_id) AND NOT EXISTS (SELECT 1 FROM projects AS owner_project WHERE owner_project.id = NEW.project_id AND owner_project.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_chapters_purge_delete_guard BEFORE DELETE ON chapters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_chapters_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = OLD.project_id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = OLD.project_id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_character_visuals_asset_scope_insert BEFORE INSERT ON character_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_character_visuals_asset_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM characters AS character JOIN assets AS asset ON asset.id = NEW.asset_id JOIN projects AS project ON project.id = character.project_id WHERE character.id = NEW.character_id AND asset.project_id = character.project_id AND asset.status = 'ready' AND project.lifecycle_status = 'active') OR (NEW.source_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS source_visual WHERE source_visual.id = NEW.source_visual_id AND source_visual.character_id = NEW.character_id)); END;

CREATE TRIGGER trg_character_visuals_asset_scope_update BEFORE UPDATE ON character_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_character_visuals_asset_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.character_id IS NOT OLD.character_id OR NEW.asset_id IS NOT OLD.asset_id OR NEW.kind IS NOT OLD.kind OR NEW.version IS NOT OLD.version OR NEW.source_visual_id IS NOT OLD.source_visual_id OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM characters AS character JOIN assets AS asset ON asset.id = NEW.asset_id WHERE character.id = NEW.character_id AND asset.project_id = character.project_id AND asset.status = 'ready'); END;

CREATE TRIGGER trg_character_visuals_current_reverse_update BEFORE UPDATE ON character_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_character_visuals_current_reverse_update') WHERE NEW.status IS NOT OLD.status AND NEW.status <> 'available' AND EXISTS (SELECT 1 FROM characters AS character WHERE character.preview_visual_id = OLD.id OR character.primary_visual_id = OLD.id); END;

CREATE TRIGGER trg_character_visuals_purge_delete_guard BEFORE DELETE ON character_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_character_visuals_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM characters WHERE id = OLD.character_id) AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_characters_current_visual_scope_insert BEFORE INSERT ON characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_characters_current_visual_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR (NEW.preview_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.preview_visual_id AND visual.character_id = NEW.id AND visual.kind = 'preview_front' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready')) OR (NEW.primary_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.primary_visual_id AND visual.character_id = NEW.id AND visual.kind = 'final_reference' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready')); END;

CREATE TRIGGER trg_characters_current_visual_scope_update BEFORE UPDATE ON characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_characters_current_visual_scope_update') WHERE (NEW.preview_visual_id IS NOT OLD.preview_visual_id OR NEW.primary_visual_id IS NOT OLD.primary_visual_id) AND (NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR (NEW.preview_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.preview_visual_id AND visual.character_id = NEW.id AND visual.kind = 'preview_front' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready')) OR (NEW.primary_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.primary_visual_id AND visual.character_id = NEW.id AND visual.kind = 'final_reference' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready'))); END;

CREATE TRIGGER trg_characters_purge_delete_guard BEFORE DELETE ON characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_characters_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_conversation_messages_initial_insert BEFORE INSERT ON conversation_messages WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_messages_initial_insert') WHERE NOT ( (NEW.role IN ('user', 'system', 'tool') AND NEW.status = 'completed' AND NEW.completed_at IS NOT NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL) OR (NEW.role = 'assistant' AND NEW.status = 'running' AND NEW.completed_at IS NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL) OR (NEW.role = 'assistant' AND NEW.status = 'completed' AND NEW.completed_at IS NOT NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL) ); END;

CREATE TRIGGER trg_conversation_messages_running_append_only BEFORE UPDATE ON conversation_messages WHEN OLD.status = 'running' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_messages_running_append_only') WHERE NEW.id IS NOT OLD.id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.role IS NOT OLD.role OR NEW.created_at IS NOT OLD.created_at OR length(NEW.content) < length(OLD.content) OR substr(NEW.content, 1, length(OLD.content)) IS NOT OLD.content; END;

CREATE TRIGGER trg_conversation_messages_state_transition BEFORE UPDATE ON conversation_messages WHEN OLD.status = 'running' OR NEW.status IS NOT OLD.status BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_messages_state_transition') WHERE NOT ( (OLD.status = 'running' AND NEW.status = 'running' AND NEW.completed_at IS NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL) OR (OLD.status = 'running' AND NEW.status = 'completed' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL) OR (OLD.status = 'running' AND NEW.status = 'failed' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND NEW.error_json IS NOT NULL AND NEW.error_schema_version IS NOT NULL) ); END;

CREATE TRIGGER trg_conversation_messages_terminal_immutable_delete BEFORE DELETE ON conversation_messages WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_messages_terminal_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_conversation_messages_terminal_immutable_update BEFORE UPDATE ON conversation_messages WHEN OLD.status IN ('completed', 'failed') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_messages_terminal_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.role IS NOT OLD.role OR NEW.content IS NOT OLD.content OR NEW.status IS NOT OLD.status OR NEW.provider_id IS NOT OLD.provider_id OR NEW.model_id IS NOT OLD.model_id OR NEW.error_json IS NOT OLD.error_json OR NEW.error_schema_version IS NOT OLD.error_schema_version OR NEW.created_at IS NOT OLD.created_at OR NEW.updated_at IS NOT OLD.updated_at OR NEW.completed_at IS NOT OLD.completed_at; END;

CREATE TRIGGER trg_conversation_threads_purge_delete_guard BEFORE DELETE ON conversation_threads WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_threads_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = OLD.project_id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = OLD.project_id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_conversation_threads_scope_insert BEFORE INSERT ON conversation_threads WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_threads_scope_insert') WHERE NOT ((NEW.chapter_id IS NULL AND NEW.scope_key = 'project') OR (NEW.chapter_id IS NOT NULL AND NEW.scope_key = 'chapter:' || NEW.chapter_id AND EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND owner_chapter.project_id = NEW.project_id ))); END;

CREATE TRIGGER trg_conversation_threads_scope_update BEFORE UPDATE ON conversation_threads WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_threads_scope_update') WHERE NOT ((NEW.chapter_id IS NULL AND NEW.scope_key = 'project') OR (NEW.chapter_id IS NOT NULL AND NEW.scope_key = 'chapter:' || NEW.chapter_id AND EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND owner_chapter.project_id = NEW.project_id ))); SELECT RAISE(ABORT, 'AIR_G1:trg_conversation_threads_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.step_key IS NOT OLD.step_key OR NEW.scope_key IS NOT OLD.scope_key OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_credential_metadata_provider_owner_insert BEFORE INSERT ON credential_metadata WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_provider_owner_insert') WHERE NOT (EXISTS ( SELECT 1 FROM provider_configs AS provider WHERE provider.id = NEW.provider_config_id AND ((provider.runtime_kind = 'text' AND NEW.owner = 'opencode') OR (provider.runtime_kind = 'image' AND NEW.owner IN ('image_secret_store', 'environment'))) )); END;

CREATE TRIGGER trg_credential_metadata_provider_owner_update BEFORE UPDATE ON credential_metadata WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_provider_owner_update') WHERE NOT (EXISTS ( SELECT 1 FROM provider_configs AS provider WHERE provider.id = NEW.provider_config_id AND ((provider.runtime_kind = 'text' AND NEW.owner = 'opencode') OR (provider.runtime_kind = 'image' AND NEW.owner IN ('image_secret_store', 'environment'))) )); SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_provider_owner_update') WHERE NEW.id IS NOT OLD.id OR NEW.provider_config_id IS NOT OLD.provider_config_id OR NEW.owner IS NOT OLD.owner OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_credential_metadata_secret_ref_delete BEFORE DELETE ON credential_metadata WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_secret_ref_delete') WHERE OLD.secret_ref IS NOT NULL OR OLD.status IS NOT 'unconfigured' OR OLD.configured IS NOT 0 OR OLD.fingerprint IS NOT NULL; END;

CREATE TRIGGER trg_credential_metadata_secret_ref_update BEFORE UPDATE ON credential_metadata WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_secret_ref_update') WHERE OLD.secret_ref IS NULL AND NEW.secret_ref IS NOT NULL AND NOT (OLD.owner = 'image_secret_store' AND NEW.owner = 'image_secret_store'); SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_secret_ref_update') WHERE OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS OLD.secret_ref AND NEW.fingerprint IS NOT OLD.fingerprint; SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_secret_ref_update') WHERE OLD.owner = 'image_secret_store' AND OLD.status = 'configured' AND NEW.status = 'clearing' AND NEW.secret_ref IS OLD.secret_ref AND NOT (EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'pending' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END ) OR EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'processed' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END )); SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_secret_ref_update') WHERE OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS NOT NULL AND NEW.secret_ref IS NOT OLD.secret_ref AND NOT (OLD.owner = 'image_secret_store' AND NEW.owner = 'image_secret_store' AND NEW.status IN ('configured', 'rotating') AND NEW.configured = 1 AND (EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'pending' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END ) OR EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'processed' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END ))); SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_secret_ref_update') WHERE OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS NULL AND NOT (OLD.status = 'clearing' AND OLD.configured = 1 AND NEW.status = 'unconfigured' AND NEW.configured = 0 AND NEW.fingerprint IS NULL AND EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'processed' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END )); END;

CREATE TRIGGER trg_credential_metadata_status_transition BEFORE UPDATE ON credential_metadata WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_credential_metadata_status_transition') WHERE NOT ( OLD.status = NEW.status OR (OLD.status = 'unconfigured' AND NEW.status IN ('configured', 'error')) OR (OLD.status = 'configured' AND NEW.status = 'rotating') OR (OLD.status = 'configured' AND NEW.status = 'error') OR (OLD.status = 'configured' AND NEW.status = 'unconfigured' AND OLD.secret_ref IS NULL AND NEW.secret_ref IS NULL AND NEW.configured = 0 AND NEW.fingerprint IS NULL) OR (OLD.status = 'configured' AND NEW.status = 'clearing' AND OLD.owner = 'image_secret_store' AND OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS OLD.secret_ref AND NEW.fingerprint IS OLD.fingerprint AND NEW.configured = 1 AND (EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'pending' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END ) OR EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'processed' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END ))) OR (OLD.status = 'rotating' AND NEW.status IN ('configured', 'error')) OR (OLD.status = 'clearing' AND NEW.status = 'unconfigured' AND NEW.configured = 0 AND NEW.secret_ref IS NULL AND NEW.fingerprint IS NULL AND EXISTS ( SELECT 1 FROM outbox_events AS secret_outbox WHERE secret_outbox.event_type = 'secret.delete_old_ref' AND secret_outbox.aggregate_type = 'credential_metadata' AND secret_outbox.aggregate_id = OLD.id AND secret_outbox.status = 'processed' AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref ELSE 0 END )) OR (OLD.status = 'error' AND NEW.status IN ('unconfigured', 'configured')) ); END;

CREATE TRIGGER trg_dialogue_runtime_sessions_identity_immutable_update BEFORE UPDATE ON dialogue_runtime_sessions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_runtime_sessions_identity_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.runtime IS NOT OLD.runtime OR NEW.external_session_id IS NOT OLD.external_session_id OR NEW.provider_id IS NOT OLD.provider_id OR NEW.model_id IS NOT OLD.model_id OR NEW.variant IS NOT OLD.variant OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_dialogue_runtime_sessions_initial_insert BEFORE INSERT ON dialogue_runtime_sessions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_runtime_sessions_initial_insert') WHERE NEW.status IS NOT 'active' OR NEW.closed_at IS NOT NULL; END;

CREATE TRIGGER trg_dialogue_runtime_sessions_state_transition BEFORE UPDATE ON dialogue_runtime_sessions WHEN OLD.status = 'active' OR NEW.status IS NOT OLD.status BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_runtime_sessions_state_transition') WHERE NOT ( (OLD.status = 'active' AND NEW.status = 'active' AND NEW.closed_at IS NULL) OR (OLD.status = 'active' AND NEW.status IN ('archived', 'closed') AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL) ); END;

CREATE TRIGGER trg_dialogue_runtime_sessions_terminal_immutable_delete BEFORE DELETE ON dialogue_runtime_sessions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_runtime_sessions_terminal_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_dialogue_runtime_sessions_terminal_immutable_update BEFORE UPDATE ON dialogue_runtime_sessions WHEN OLD.status IN ('archived', 'closed') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_runtime_sessions_terminal_immutable_update') WHERE NEW.status IS NOT OLD.status OR NEW.closed_at IS NOT OLD.closed_at OR NEW.updated_at IS NOT OLD.updated_at; END;

CREATE TRIGGER trg_dialogue_tool_results_audit_immutable_delete BEFORE DELETE ON dialogue_tool_results WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_tool_results_audit_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = (SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id) AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_dialogue_tool_results_audit_immutable_update BEFORE UPDATE ON dialogue_tool_results WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_tool_results_audit_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.message_id IS NOT OLD.message_id OR NEW.tool_call_id IS NOT OLD.tool_call_id OR NEW.tool IS NOT OLD.tool OR NEW.status IS NOT OLD.status OR NEW.summary IS NOT OLD.summary OR NEW.payload_json IS NOT OLD.payload_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.payload_digest IS NOT OLD.payload_digest OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_dialogue_tool_results_message_scope_insert BEFORE INSERT ON dialogue_tool_results WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_dialogue_tool_results_message_scope_insert') WHERE NOT EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.message_id AND source_message.thread_id = NEW.thread_id ); END;

CREATE TRIGGER trg_export_artifacts_parent_ready_delete BEFORE DELETE ON export_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_artifacts_parent_ready_delete') WHERE (EXISTS (SELECT 1 FROM export_revisions e WHERE e.id = OLD.export_revision_id AND e.status = 'ready')) AND NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = (SELECT project_id FROM export_revisions WHERE id = OLD.export_revision_id) AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = (SELECT project_id FROM export_revisions WHERE id = OLD.export_revision_id) AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = (SELECT project_id FROM export_revisions WHERE id = OLD.export_revision_id) AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_export_artifacts_parent_ready_insert BEFORE INSERT ON export_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_artifacts_parent_ready_insert') WHERE EXISTS (SELECT 1 FROM export_revisions e WHERE e.id = NEW.export_revision_id AND e.status = 'ready'); END;

CREATE TRIGGER trg_export_artifacts_parent_ready_update BEFORE UPDATE ON export_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_artifacts_parent_ready_update') WHERE EXISTS (SELECT 1 FROM export_revisions e WHERE e.id = NEW.export_revision_id AND e.status = 'ready'); END;

CREATE TRIGGER trg_export_artifacts_scope_insert BEFORE INSERT ON export_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_artifacts_scope_insert') WHERE NOT (EXISTS ( SELECT 1 FROM export_revisions e JOIN assets a ON a.id = NEW.asset_id WHERE e.id = NEW.export_revision_id AND a.project_id = e.project_id AND (e.chapter_id IS NULL OR a.chapter_id IS NULL OR a.chapter_id = e.chapter_id) )); END;

CREATE TRIGGER trg_export_artifacts_scope_update BEFORE UPDATE ON export_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_artifacts_scope_update') WHERE NEW.export_revision_id IS NOT OLD.export_revision_id OR NOT (EXISTS ( SELECT 1 FROM export_revisions e JOIN assets a ON a.id = NEW.asset_id WHERE e.id = NEW.export_revision_id AND a.project_id = e.project_id AND (e.chapter_id IS NULL OR a.chapter_id IS NULL OR a.chapter_id = e.chapter_id) )); END;

CREATE TRIGGER trg_export_revisions_ready_guard_update BEFORE UPDATE ON export_revisions WHEN OLD.status <> 'ready' AND NEW.status = 'ready' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_ready_guard_update') WHERE NOT ( NEW.ready_at IS NOT NULL AND NEW.manifest_json IS NOT NULL AND NEW.manifest_schema_version IS NOT NULL AND NEW.manifest_digest IS NOT NULL AND NEW.completion_applicability IS NOT NULL AND NEW.failed_at IS NULL AND NEW.cancelled_at IS NULL AND EXISTS (SELECT 1 FROM export_artifacts ea WHERE ea.export_revision_id = NEW.id) AND NOT EXISTS ( SELECT 1 FROM export_artifacts ea JOIN assets a ON a.id = ea.asset_id WHERE ea.export_revision_id = NEW.id AND a.status <> 'ready' ) ); END;

CREATE TRIGGER trg_export_revisions_ready_immutable_delete BEFORE DELETE ON export_revisions WHEN OLD.status = 'ready' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_ready_immutable_delete') WHERE NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = OLD.project_id AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = OLD.project_id AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = OLD.project_id AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_export_revisions_ready_immutable_update BEFORE UPDATE ON export_revisions WHEN OLD.status = 'ready' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_ready_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.scope_key IS NOT OLD.scope_key OR NEW.revision IS NOT OLD.revision OR NEW.kind IS NOT OLD.kind OR NEW.status IS NOT OLD.status OR NEW.task_id IS NOT OLD.task_id OR NEW.layout_revision_id IS NOT OLD.layout_revision_id OR NEW.source_lock_set_digest IS NOT OLD.source_lock_set_digest OR NEW.profile_json IS NOT OLD.profile_json OR NEW.profile_schema_version IS NOT OLD.profile_schema_version OR NEW.profile_digest IS NOT OLD.profile_digest OR NEW.preflight_digest IS NOT OLD.preflight_digest OR NEW.renderer_version IS NOT OLD.renderer_version OR NEW.manifest_json IS NOT OLD.manifest_json OR NEW.manifest_schema_version IS NOT OLD.manifest_schema_version OR NEW.manifest_digest IS NOT OLD.manifest_digest OR NEW.completion_applicability IS NOT OLD.completion_applicability OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at OR NEW.ready_at IS NOT OLD.ready_at OR NEW.failed_at IS NOT OLD.failed_at OR NEW.cancelled_at IS NOT OLD.cancelled_at; END;

CREATE TRIGGER trg_export_revisions_runtime_source_immutable_update BEFORE UPDATE ON export_revisions WHEN OLD.origin = 'runtime' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_runtime_source_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.scope_key IS NOT OLD.scope_key OR NEW.revision IS NOT OLD.revision OR NEW.kind IS NOT OLD.kind OR NEW.task_id IS NOT OLD.task_id OR NEW.layout_revision_id IS NOT OLD.layout_revision_id OR NEW.source_lock_set_digest IS NOT OLD.source_lock_set_digest OR NEW.profile_json IS NOT OLD.profile_json OR NEW.profile_schema_version IS NOT OLD.profile_schema_version OR NEW.profile_digest IS NOT OLD.profile_digest OR NEW.preflight_digest IS NOT OLD.preflight_digest OR NEW.renderer_version IS NOT OLD.renderer_version OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_export_revisions_scope_insert BEFORE INSERT ON export_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_scope_insert') WHERE NOT (EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id) AND ((NEW.chapter_id IS NULL AND NEW.scope_key = 'project') OR (NEW.chapter_id IS NOT NULL AND NEW.scope_key = 'chapter:' || NEW.chapter_id AND EXISTS (SELECT 1 FROM chapters c WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id))) AND (NEW.task_id IS NULL OR EXISTS (SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.project_id = NEW.project_id AND t.chapter_id IS NEW.chapter_id)) AND (NEW.layout_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.layout_revision_id AND r.project_id = NEW.project_id AND r.chapter_id IS NEW.chapter_id))); END;

CREATE TRIGGER trg_export_revisions_scope_update BEFORE UPDATE ON export_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_scope_update') WHERE NOT (EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id) AND ((NEW.chapter_id IS NULL AND NEW.scope_key = 'project') OR (NEW.chapter_id IS NOT NULL AND NEW.scope_key = 'chapter:' || NEW.chapter_id AND EXISTS (SELECT 1 FROM chapters c WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id))) AND (NEW.task_id IS NULL OR EXISTS (SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.project_id = NEW.project_id AND t.chapter_id IS NEW.chapter_id)) AND (NEW.layout_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.layout_revision_id AND r.project_id = NEW.project_id AND r.chapter_id IS NEW.chapter_id))); END;

CREATE TRIGGER trg_export_revisions_unready_insert BEFORE INSERT ON export_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_export_revisions_unready_insert') WHERE NEW.status = 'ready' OR NEW.ready_at IS NOT NULL OR NEW.completion_applicability IS NOT NULL; END;

CREATE TRIGGER trg_generation_task_sources_append_only_update BEFORE UPDATE ON generation_task_sources WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_task_sources_append_only_update'); END;

CREATE TRIGGER trg_generation_task_sources_history_delete BEFORE DELETE ON generation_task_sources WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_task_sources_history_delete') WHERE NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = (SELECT project_id FROM generation_tasks WHERE id = OLD.task_id) AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = (SELECT project_id FROM generation_tasks WHERE id = OLD.task_id) AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = (SELECT project_id FROM generation_tasks WHERE id = OLD.task_id) AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_generation_task_sources_scope_insert BEFORE INSERT ON generation_task_sources WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_task_sources_scope_insert') WHERE NOT EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.source_set_sealed_at IS NULL AND (NEW.source_type NOT IN ('project', 'project_script_outline', 'chapter', 'chapter_script_version', 'story_version', 'storyboard_version', 'preflight_revision', 'character', 'character_visual', 'chapter_scene', 'scene_visual', 'shot', 'asset', 'candidate', 'candidate_lock_revision', 'lock_set', 'layout_revision', 'export_revision') OR ((NEW.source_type = 'project' AND NEW.source_id = t.project_id) OR (NEW.source_type = 'project_script_outline' AND EXISTS (SELECT 1 FROM project_script_outlines x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND x.source_digest = NEW.source_digest)) OR (NEW.source_type = 'chapter' AND EXISTS (SELECT 1 FROM chapters x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.id = t.chapter_id))) OR (NEW.source_type = 'chapter_script_version' AND EXISTS (SELECT 1 FROM chapter_script_versions x JOIN chapters c ON c.id = x.chapter_id WHERE x.id = NEW.source_id AND c.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.source_digest = NEW.source_digest)) OR (NEW.source_type = 'story_version' AND EXISTS (SELECT 1 FROM story_versions x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.status = 'confirmed' AND x.document_digest = NEW.source_digest)) OR (NEW.source_type = 'storyboard_version' AND EXISTS (SELECT 1 FROM storyboard_versions x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.status = 'confirmed' AND x.document_digest = NEW.source_digest)) OR (NEW.source_type = 'preflight_revision' AND EXISTS (SELECT 1 FROM preflight_revisions x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.status = 'confirmed' AND x.ready = 1 AND x.source_digest = NEW.source_digest)) OR (NEW.source_type = 'character' AND EXISTS (SELECT 1 FROM characters x WHERE x.id = NEW.source_id AND x.project_id = t.project_id)) OR (NEW.source_type = 'character_visual' AND EXISTS (SELECT 1 FROM character_visuals x JOIN characters c ON c.id = x.character_id JOIN assets a ON a.id = x.asset_id WHERE x.id = NEW.source_id AND c.project_id = t.project_id AND x.status = 'available' AND a.status = 'ready' AND a.sha256 = NEW.source_digest)) OR (NEW.source_type = 'chapter_scene' AND EXISTS (SELECT 1 FROM chapter_scenes x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id))) OR (NEW.source_type = 'scene_visual' AND EXISTS (SELECT 1 FROM scene_visuals x JOIN chapter_scenes s ON s.id = x.chapter_scene_id JOIN assets a ON a.id = x.asset_id WHERE x.id = NEW.source_id AND s.project_id = t.project_id AND (t.chapter_id IS NULL OR s.chapter_id = t.chapter_id) AND a.status = 'ready' AND a.sha256 = NEW.source_digest)) OR (NEW.source_type = 'shot' AND EXISTS (SELECT 1 FROM shots x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.lifecycle_status = 'active') AND EXISTS (SELECT 1 FROM generation_task_sources sb JOIN storyboard_shot_projections sp ON sp.storyboard_version_id = sb.source_id AND sp.shot_id = NEW.source_id WHERE sb.task_id = t.id AND sb.source_type = 'storyboard_version')) OR (NEW.source_type = 'asset' AND EXISTS (SELECT 1 FROM assets x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.status = 'ready' AND x.sha256 = NEW.source_digest)) OR (NEW.source_type = 'candidate' AND EXISTS (SELECT 1 FROM candidates x JOIN assets a ON a.id = x.asset_id WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND a.status = 'ready' AND a.sha256 = NEW.source_digest)) OR (NEW.source_type = 'candidate_lock_revision' AND EXISTS (SELECT 1 FROM candidate_lock_revisions x JOIN candidates c ON c.id = x.candidate_id JOIN assets a ON a.id = c.asset_id WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.action IN ('lock', 'replace') AND a.status = 'ready' AND a.sha256 = NEW.source_digest)) OR (NEW.source_type = 'lock_set' AND t.chapter_id IS NOT NULL AND NEW.source_id = t.chapter_id) OR (NEW.source_type = 'layout_revision' AND EXISTS (SELECT 1 FROM layout_revisions x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.binding_set_sealed_at IS NOT NULL AND x.document_digest = NEW.source_digest)) OR (NEW.source_type = 'export_revision' AND EXISTS (SELECT 1 FROM export_revisions x WHERE x.id = NEW.source_id AND x.project_id = t.project_id AND (t.chapter_id IS NULL OR x.chapter_id IS NULL OR x.chapter_id = t.chapter_id) AND x.status = 'ready' AND x.manifest_digest = NEW.source_digest)))) AND (t.record_kind = 'runtime' OR t.provenance_status <> 'complete') ); END;

CREATE TRIGGER trg_generation_tasks_claim_materialize AFTER UPDATE OF status, attempt, lease_owner_id, lease_token, lease_expires_at, heartbeat_at, started_at ON generation_tasks WHEN OLD.record_kind = 'runtime' AND OLD.status IN ('queued', 'retrying') AND NEW.status = 'running' BEGIN UPDATE task_concurrency_slots SET task_id = NEW.id, lease_owner_id = NEW.lease_owner_id, claim_token = NEW.lease_token, lease_expires_at = NEW.lease_expires_at, updated_at = NEW.heartbeat_at WHERE id = (SELECT id FROM task_concurrency_slots WHERE concurrency_key = NEW.concurrency_key AND task_id IS NULL ORDER BY slot_no ASC LIMIT 1) AND NEW.concurrency_key IS NOT NULL; SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_claim_materialize') WHERE NEW.concurrency_key IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = NEW.id AND s.claim_token = NEW.lease_token AND s.lease_owner_id = NEW.lease_owner_id AND s.lease_expires_at = NEW.lease_expires_at ); INSERT INTO task_attempts (id, task_id, attempt_no, worker_id, claim_token, outcome, error_json, error_schema_version, artifact_refs_json, artifact_schema_version, started_at, finished_at, created_at) VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2, 3) || '-' || substr('89ab', ((instr('0123456789abcdef', substr(lower(hex(randomblob(1))), 1, 1)) - 1) % 4) + 1, 1) || substr(lower(hex(randomblob(2))), 2, 3) || '-' || lower(hex(randomblob(6))), NEW.id, NEW.attempt, NEW.lease_owner_id, NEW.lease_token, NULL, NULL, NULL, NULL, NULL, NEW.heartbeat_at, NULL, NEW.heartbeat_at); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_claim_materialize') WHERE NOT EXISTS ( SELECT 1 FROM task_attempts a WHERE a.task_id = NEW.id AND a.attempt_no = NEW.attempt AND a.claim_token = NEW.lease_token AND a.finished_at IS NULL ); END;

CREATE TRIGGER trg_generation_tasks_claim_validate BEFORE UPDATE OF status, attempt, lease_owner_id, lease_token, lease_expires_at, heartbeat_at, started_at ON generation_tasks WHEN OLD.record_kind = 'runtime' AND OLD.status IN ('queued', 'retrying') AND NEW.status = 'running' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_claim_validate') WHERE NEW.source_set_sealed_at IS NULL OR NEW.cancel_requested_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.lifecycle_status = 'active') OR (OLD.next_run_at IS NOT NULL AND OLD.next_run_at > NEW.heartbeat_at) OR NEW.attempt <> OLD.attempt + 1 OR NEW.attempt > NEW.max_attempts OR NEW.lease_owner_id IS NULL OR NEW.lease_token IS NULL OR NEW.lease_expires_at IS NULL OR NEW.heartbeat_at IS NULL OR NEW.lease_expires_at <= NEW.heartbeat_at OR (OLD.started_at IS NULL AND NEW.started_at IS NOT NEW.heartbeat_at) OR (OLD.started_at IS NOT NULL AND NEW.started_at IS NOT OLD.started_at) OR EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = NEW.id AND a.finished_at IS NULL) OR (NEW.concurrency_key IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.concurrency_key = NEW.concurrency_key AND s.task_id IS NULL )); END;

CREATE TRIGGER trg_generation_tasks_heartbeat_materialize AFTER UPDATE ON generation_tasks WHEN OLD.record_kind = 'runtime' AND OLD.status = 'running' AND NEW.status = 'running' AND NEW.heartbeat_at IS NOT OLD.heartbeat_at BEGIN UPDATE task_concurrency_slots SET lease_expires_at = NEW.lease_expires_at, updated_at = NEW.heartbeat_at WHERE task_id = OLD.id AND claim_token = OLD.lease_token AND NEW.concurrency_key IS NOT NULL; SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_heartbeat_materialize') WHERE NEW.concurrency_key IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = NEW.id AND s.claim_token = NEW.lease_token AND s.lease_expires_at = NEW.lease_expires_at AND s.updated_at = NEW.heartbeat_at ); END;

CREATE TRIGGER trg_generation_tasks_heartbeat_validate BEFORE UPDATE ON generation_tasks WHEN OLD.record_kind = 'runtime' AND OLD.status = 'running' AND NEW.status = 'running' AND NEW.heartbeat_at IS NOT OLD.heartbeat_at BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_heartbeat_validate') WHERE NEW.lease_owner_id IS NOT OLD.lease_owner_id OR NEW.lease_token IS NOT OLD.lease_token OR NEW.attempt <> OLD.attempt OR NEW.started_at IS NOT OLD.started_at OR OLD.lease_token IS NULL OR NEW.heartbeat_at <= OLD.heartbeat_at OR NEW.lease_expires_at <= NEW.heartbeat_at OR NOT EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = OLD.id AND a.attempt_no = OLD.attempt AND a.claim_token = OLD.lease_token AND a.finished_at IS NULL) OR (OLD.concurrency_key IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = OLD.id AND s.claim_token = OLD.lease_token AND s.lease_owner_id = OLD.lease_owner_id AND s.lease_expires_at = OLD.lease_expires_at )); END;

CREATE TRIGGER trg_generation_tasks_history_delete BEFORE DELETE ON generation_tasks WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_history_delete') WHERE NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = OLD.project_id AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = OLD.project_id AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = OLD.project_id AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_generation_tasks_initial_insert BEFORE INSERT ON generation_tasks WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_initial_insert') WHERE NEW.source_set_sealed_at IS NOT NULL; SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_initial_insert') WHERE NEW.record_kind = 'runtime' AND NOT ( NEW.status = 'queued' AND NEW.attempt = 0 AND NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL AND NEW.heartbeat_at IS NULL AND NEW.cancel_requested_at IS NULL AND NEW.started_at IS NULL AND NEW.finished_at IS NULL AND EXISTS (SELECT 1 FROM projects AS p WHERE p.id = NEW.project_id AND p.lifecycle_status = 'active') ); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_initial_insert') WHERE NEW.record_kind <> 'runtime' AND ( NEW.lease_owner_id IS NOT NULL OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.heartbeat_at IS NOT NULL OR NEW.cancel_requested_at IS NOT NULL OR NEW.attempt <> 0 ); END;

CREATE TRIGGER trg_generation_tasks_input_immutable BEFORE UPDATE ON generation_tasks WHEN OLD.record_kind = 'runtime' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_input_immutable') WHERE NEW.input_json IS NOT OLD.input_json OR NEW.input_schema_version IS NOT OLD.input_schema_version OR NEW.input_digest IS NOT OLD.input_digest OR NEW.source_digest IS NOT OLD.source_digest OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.concurrency_key IS NOT OLD.concurrency_key OR NEW.max_attempts IS NOT OLD.max_attempts OR NEW.target_type IS NOT OLD.target_type OR NEW.target_id IS NOT OLD.target_id; END;

CREATE TRIGGER trg_generation_tasks_legacy_evidence_upgrade BEFORE UPDATE ON generation_tasks WHEN OLD.record_kind IN ('legacy_stub', 'legacy_imported') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_legacy_evidence_upgrade') WHERE NOT ( (OLD.record_kind = NEW.record_kind) OR (OLD.record_kind = 'legacy_stub' AND NEW.record_kind = 'legacy_imported') ); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_legacy_evidence_upgrade') WHERE NOT ( OLD.provenance_status = NEW.provenance_status OR (OLD.provenance_status = 'reference_only' AND NEW.provenance_status = 'partial') OR (OLD.provenance_status = 'partial' AND NEW.provenance_status = 'complete') ); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_legacy_evidence_upgrade') WHERE (OLD.input_json IS NOT NULL AND NEW.input_json IS NOT OLD.input_json) OR (OLD.input_schema_version IS NOT NULL AND NEW.input_schema_version IS NOT OLD.input_schema_version) OR (OLD.input_digest IS NOT NULL AND NEW.input_digest IS NOT OLD.input_digest) OR (OLD.output_json IS NOT NULL AND NEW.output_json IS NOT OLD.output_json) OR (OLD.output_schema_version IS NOT NULL AND NEW.output_schema_version IS NOT OLD.output_schema_version) OR (OLD.output_digest IS NOT NULL AND NEW.output_digest IS NOT OLD.output_digest) OR (OLD.error_json IS NOT NULL AND NEW.error_json IS NOT OLD.error_json) OR (OLD.error_schema_version IS NOT NULL AND NEW.error_schema_version IS NOT OLD.error_schema_version) OR (OLD.source_digest IS NOT NULL AND NEW.source_digest IS NOT OLD.source_digest) OR (OLD.import_source IS NOT NULL AND NEW.import_source IS NOT OLD.import_source) OR (OLD.imported_at IS NOT NULL AND NEW.imported_at IS NOT OLD.imported_at); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_legacy_evidence_upgrade') WHERE OLD.observed_evidence_json IS NOT NULL AND NEW.observed_evidence_json IS NOT OLD.observed_evidence_json AND EXISTS ( SELECT 1 FROM json_tree(OLD.observed_evidence_json) AS old_leaf WHERE old_leaf.atom IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.observed_evidence_json) = 1 THEN NEW.observed_evidence_json ELSE '{}' END) AS new_leaf WHERE new_leaf.fullkey = old_leaf.fullkey AND new_leaf.type = old_leaf.type AND new_leaf.atom IS old_leaf.atom ) ); END;

CREATE TRIGGER trg_generation_tasks_legacy_execution_guard_update BEFORE UPDATE ON generation_tasks WHEN OLD.record_kind <> 'runtime' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_legacy_execution_guard_update') WHERE NEW.status IN ('queued', 'running', 'retrying') OR NEW.lease_owner_id IS NOT NULL OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.heartbeat_at IS NOT NULL OR NEW.cancel_requested_at IS NOT NULL OR NEW.next_run_at IS NOT NULL OR NEW.attempt <> 0 OR NEW.retry_disabled IS NOT 1; END;

CREATE TRIGGER trg_generation_tasks_record_identity_immutable BEFORE UPDATE ON generation_tasks WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_record_identity_immutable') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.type IS NOT OLD.type OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_generation_tasks_running_fencing_update BEFORE UPDATE ON generation_tasks WHEN OLD.record_kind = 'runtime' AND OLD.status = 'running' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_running_fencing_update') WHERE OLD.lease_token IS NULL OR NOT EXISTS ( SELECT 1 FROM task_attempts a WHERE a.task_id = OLD.id AND a.attempt_no = OLD.attempt AND a.claim_token = OLD.lease_token AND (a.finished_at IS NULL OR NEW.status <> 'running') ); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_running_fencing_update') WHERE OLD.concurrency_key IS NOT NULL AND NEW.status = 'running' AND NOT EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = OLD.id AND s.concurrency_key = OLD.concurrency_key AND s.claim_token = OLD.lease_token AND s.lease_owner_id = OLD.lease_owner_id AND s.lease_expires_at = OLD.lease_expires_at ); END;

CREATE TRIGGER trg_generation_tasks_runtime_state_transition BEFORE UPDATE ON generation_tasks WHEN OLD.record_kind = 'runtime' BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_runtime_state_transition') WHERE NOT ( OLD.status = NEW.status OR (OLD.status IN ('queued', 'retrying') AND NEW.status = 'running') OR (OLD.status IN ('queued', 'retrying') AND NEW.status = 'cancelled' AND NEW.cancel_requested_at IS NOT NULL AND NEW.finished_at IS NOT NULL) OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'cancelled', 'retrying', 'failed') AND EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = NEW.id AND a.attempt_no = OLD.attempt AND a.claim_token = OLD.lease_token AND a.finished_at IS NOT NULL)) ); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_runtime_state_transition') WHERE NEW.status = 'retrying' AND NOT ( NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL AND NEW.heartbeat_at IS NULL AND NEW.finished_at IS NULL AND NEW.next_run_at IS NOT NULL AND NEW.next_run_at > NEW.updated_at ); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_runtime_state_transition') WHERE NEW.status IN ('succeeded', 'cancelled', 'failed') AND NOT ( NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL AND NEW.heartbeat_at IS NULL AND NEW.next_run_at IS NULL AND NEW.finished_at IS NOT NULL ); END;

CREATE TRIGGER trg_generation_tasks_source_set_seal BEFORE UPDATE ON generation_tasks WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_source_set_seal') WHERE (OLD.source_set_sealed_at IS NOT NULL AND NEW.source_set_sealed_at IS NOT OLD.source_set_sealed_at) OR (OLD.source_set_sealed_at IS NULL AND NEW.source_set_sealed_at IS NULL AND NEW.source_digest IS NOT OLD.source_digest); SELECT RAISE(ABORT, 'AIR_G1:trg_generation_tasks_source_set_seal') WHERE OLD.source_set_sealed_at IS NULL AND NEW.source_set_sealed_at IS NOT NULL AND ( (NEW.record_kind = 'runtime' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.lifecycle_status = 'active')) OR NOT EXISTS (SELECT 1 FROM generation_task_sources s WHERE s.task_id = NEW.id) OR EXISTS (SELECT 1 FROM generation_task_sources s WHERE s.task_id = NEW.id AND (s.source_type NOT IN ('project', 'project_script_outline', 'chapter', 'chapter_script_version', 'story_version', 'storyboard_version', 'preflight_revision', 'character', 'character_visual', 'chapter_scene', 'scene_visual', 'shot', 'asset', 'candidate', 'candidate_lock_revision', 'lock_set', 'layout_revision', 'export_revision') OR NOT ((s.source_type = 'project' AND s.source_id = NEW.project_id) OR (s.source_type = 'project_script_outline' AND EXISTS (SELECT 1 FROM project_script_outlines x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND x.source_digest = s.source_digest)) OR (s.source_type = 'chapter' AND EXISTS (SELECT 1 FROM chapters x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.id = NEW.chapter_id))) OR (s.source_type = 'chapter_script_version' AND EXISTS (SELECT 1 FROM chapter_script_versions x JOIN chapters c ON c.id = x.chapter_id WHERE x.id = s.source_id AND c.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.source_digest = s.source_digest)) OR (s.source_type = 'story_version' AND EXISTS (SELECT 1 FROM story_versions x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.status = 'confirmed' AND x.document_digest = s.source_digest)) OR (s.source_type = 'storyboard_version' AND EXISTS (SELECT 1 FROM storyboard_versions x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.status = 'confirmed' AND x.document_digest = s.source_digest)) OR (s.source_type = 'preflight_revision' AND EXISTS (SELECT 1 FROM preflight_revisions x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.status = 'confirmed' AND x.ready = 1 AND x.source_digest = s.source_digest)) OR (s.source_type = 'character' AND EXISTS (SELECT 1 FROM characters x WHERE x.id = s.source_id AND x.project_id = NEW.project_id)) OR (s.source_type = 'character_visual' AND EXISTS (SELECT 1 FROM character_visuals x JOIN characters c ON c.id = x.character_id JOIN assets a ON a.id = x.asset_id WHERE x.id = s.source_id AND c.project_id = NEW.project_id AND x.status = 'available' AND a.status = 'ready' AND a.sha256 = s.source_digest)) OR (s.source_type = 'chapter_scene' AND EXISTS (SELECT 1 FROM chapter_scenes x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id))) OR (s.source_type = 'scene_visual' AND EXISTS (SELECT 1 FROM scene_visuals x JOIN chapter_scenes s ON s.id = x.chapter_scene_id JOIN assets a ON a.id = x.asset_id WHERE x.id = s.source_id AND s.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR s.chapter_id = NEW.chapter_id) AND a.status = 'ready' AND a.sha256 = s.source_digest)) OR (s.source_type = 'shot' AND EXISTS (SELECT 1 FROM shots x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.lifecycle_status = 'active') AND EXISTS (SELECT 1 FROM generation_task_sources sb JOIN storyboard_shot_projections sp ON sp.storyboard_version_id = sb.source_id AND sp.shot_id = s.source_id WHERE sb.task_id = NEW.id AND sb.source_type = 'storyboard_version')) OR (s.source_type = 'asset' AND EXISTS (SELECT 1 FROM assets x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.status = 'ready' AND x.sha256 = s.source_digest)) OR (s.source_type = 'candidate' AND EXISTS (SELECT 1 FROM candidates x JOIN assets a ON a.id = x.asset_id WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND a.status = 'ready' AND a.sha256 = s.source_digest)) OR (s.source_type = 'candidate_lock_revision' AND EXISTS (SELECT 1 FROM candidate_lock_revisions x JOIN candidates c ON c.id = x.candidate_id JOIN assets a ON a.id = c.asset_id WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.action IN ('lock', 'replace') AND a.status = 'ready' AND a.sha256 = s.source_digest)) OR (s.source_type = 'lock_set' AND NEW.chapter_id IS NOT NULL AND s.source_id = NEW.chapter_id) OR (s.source_type = 'layout_revision' AND EXISTS (SELECT 1 FROM layout_revisions x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.binding_set_sealed_at IS NOT NULL AND x.document_digest = s.source_digest)) OR (s.source_type = 'export_revision' AND EXISTS (SELECT 1 FROM export_revisions x WHERE x.id = s.source_id AND x.project_id = NEW.project_id AND (NEW.chapter_id IS NULL OR x.chapter_id IS NULL OR x.chapter_id = NEW.chapter_id) AND x.status = 'ready' AND x.manifest_digest = s.source_digest))))) OR NEW.input_json IS NULL OR CASE WHEN json_valid(NEW.input_json) = 1 THEN NOT ( json_type(NEW.input_json, '$.sourceProjection') = 'object' AND json_extract(NEW.input_json, '$.sourceProjection.schemaVersion') = 1 AND json_type(NEW.input_json, '$.sourceProjection.policyVersion') = 'text' AND length(trim(json_extract(NEW.input_json, '$.sourceProjection.policyVersion'))) > 0 AND json_extract(NEW.input_json, '$.sourceProjection.projectId') IS NEW.project_id AND json_extract(NEW.input_json, '$.sourceProjection.chapterId') IS NEW.chapter_id AND json_extract(NEW.input_json, '$.sourceProjection.consumerType') IS NEW.type AND json_type(NEW.input_json, '$.sourceProjection.sources') = 'array' AND json_array_length(NEW.input_json, '$.sourceProjection.sources') = (SELECT count(*) FROM generation_task_sources s WHERE s.task_id = NEW.id) AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.input_json, '$.sourceProjection.sources') j LEFT JOIN generation_task_sources s ON s.task_id = NEW.id AND s.role = json_extract(j.value, '$.role') AND s."order" = json_extract(j.value, '$.order') WHERE s.id IS NULL OR s.source_type IS NOT json_extract(j.value, '$.sourceType') OR s.source_id IS NOT json_extract(j.value, '$.sourceId') OR s.source_digest IS NOT json_extract(j.value, '$.sourceDigest') ) AND NOT EXISTS ( SELECT 1 FROM generation_task_sources s WHERE s.task_id = NEW.id AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.input_json, '$.sourceProjection.sources') j WHERE json_extract(j.value, '$.role') IS s.role AND json_extract(j.value, '$.order') IS s."order" AND json_extract(j.value, '$.sourceType') IS s.source_type AND json_extract(j.value, '$.sourceId') IS s.source_id AND json_extract(j.value, '$.sourceDigest') IS s.source_digest ) ) AND NOT EXISTS ( SELECT 1 FROM ( SELECT s."order" AS actual_order, row_number() OVER (PARTITION BY s.role ORDER BY s.source_type COLLATE BINARY, s.source_id COLLATE BINARY) AS expected_order FROM generation_task_sources s WHERE s.task_id = NEW.id ) ordered_sources WHERE ordered_sources.actual_order <> ordered_sources.expected_order ) AND NOT EXISTS ( SELECT 1 FROM ( SELECT CAST(j.key AS INTEGER) + 1 AS actual_position, row_number() OVER (ORDER BY json_extract(j.value, '$.role') COLLATE BINARY, json_extract(j.value, '$.order')) AS expected_position, json_type(j.value, '$.role') AS role_type, json_type(j.value, '$.order') AS order_type FROM json_each(NEW.input_json, '$.sourceProjection.sources') j ) projected_sources WHERE projected_sources.actual_position <> projected_sources.expected_position OR projected_sources.role_type <> 'text' OR projected_sources.order_type <> 'integer' ) ) ELSE 1 END ); END;

CREATE TRIGGER trg_imported_entity_sources_identity_immutable BEFORE UPDATE ON imported_entity_sources WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_imported_entity_sources_identity_immutable') WHERE NEW.source_key IS NOT OLD.source_key OR NEW.entity_type IS NOT OLD.entity_type OR NEW.entity_id IS NOT OLD.entity_id OR NEW.source_storage_key IS NOT OLD.source_storage_key OR NEW.source_digest IS NOT OLD.source_digest OR NEW.first_run_id IS NOT OLD.first_run_id OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_imported_entity_sources_provenance_monotonic BEFORE UPDATE ON imported_entity_sources WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_imported_entity_sources_provenance_monotonic') WHERE NOT ( (OLD.provenance_status = NEW.provenance_status) OR (OLD.provenance_status = 'reference_only' AND NEW.provenance_status = 'partial') OR (OLD.provenance_status = 'partial' AND NEW.provenance_status = 'complete') ); SELECT RAISE(ABORT, 'AIR_G1:trg_imported_entity_sources_provenance_monotonic') WHERE (OLD.payload_digest IS NOT NULL AND NEW.payload_digest IS NOT OLD.payload_digest) OR (NEW.last_run_id IS NOT OLD.last_run_id AND NOT ( OLD.provenance_status IS NOT NEW.provenance_status OR (OLD.payload_digest IS NULL AND NEW.payload_digest IS NOT NULL) )); END;

CREATE TRIGGER trg_layout_revisions_binding_set_seal BEFORE UPDATE ON layout_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_binding_set_seal') WHERE OLD.binding_set_sealed_at IS NOT NULL AND NEW.binding_set_sealed_at IS NOT OLD.binding_set_sealed_at; SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_binding_set_seal') WHERE OLD.binding_set_sealed_at IS NULL AND NEW.binding_set_sealed_at IS NOT NULL AND CASE WHEN json_valid(NEW.document_json) <> 1 THEN 1 WHEN json_extract(NEW.document_json, '$.kind') = 'layout_document_v1' THEN NOT COALESCE(( json_extract(NEW.document_json, '$.schemaVersion') = 1 AND json_extract(NEW.document_json, '$.kind') = 'layout_document_v1' AND json_type(NEW.document_json, '$.canvases') IS 'array' AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.canvases') canvas WHERE json_type(canvas.value, '$.elements') IS NOT 'array' ) AND NOT EXISTS ( SELECT 1 FROM (SELECT json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.id') AS element_id, 'candidate_image' AS role, row_number() OVER (ORDER BY CAST(c.key AS INTEGER), CAST(e.key AS INTEGER)) AS binding_order, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.shotId') AS shot_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateId') AS candidate_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateLockRevisionId') AS lock_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.assetId') AS asset_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.sourceDigest') AS source_digest FROM json_each(NEW.document_json, '$.canvases') c, json_each(c.value, '$.elements') e WHERE (json_extract(e.value, '$.type') = 'panel_frame' AND json_type(e.value, '$.contentImage') = 'object') OR json_extract(e.value, '$.type') = 'free_image') p WHERE p.element_id IS NULL OR length(trim(p.element_id)) = 0 OR p.shot_id IS NULL OR length(trim(p.shot_id)) = 0 OR p.candidate_id IS NULL OR length(trim(p.candidate_id)) = 0 OR p.lock_id IS NULL OR length(trim(p.lock_id)) = 0 OR p.asset_id IS NULL OR length(trim(p.asset_id)) = 0 OR p.source_digest IS NULL OR length(trim(p.source_digest)) = 0 ) AND (SELECT count(*) FROM layout_source_bindings b WHERE b.layout_revision_id = NEW.id) = (SELECT count(*) FROM (SELECT json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.id') AS element_id, 'candidate_image' AS role, row_number() OVER (ORDER BY CAST(c.key AS INTEGER), CAST(e.key AS INTEGER)) AS binding_order, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.shotId') AS shot_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateId') AS candidate_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateLockRevisionId') AS lock_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.assetId') AS asset_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.sourceDigest') AS source_digest FROM json_each(NEW.document_json, '$.canvases') c, json_each(c.value, '$.elements') e WHERE (json_extract(e.value, '$.type') = 'panel_frame' AND json_type(e.value, '$.contentImage') = 'object') OR json_extract(e.value, '$.type') = 'free_image')) AND NOT EXISTS ( SELECT 1 FROM (SELECT json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.id') AS element_id, 'candidate_image' AS role, row_number() OVER (ORDER BY CAST(c.key AS INTEGER), CAST(e.key AS INTEGER)) AS binding_order, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.shotId') AS shot_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateId') AS candidate_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateLockRevisionId') AS lock_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.assetId') AS asset_id, json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.sourceDigest') AS source_digest FROM json_each(NEW.document_json, '$.canvases') c, json_each(c.value, '$.elements') e WHERE (json_extract(e.value, '$.type') = 'panel_frame' AND json_type(e.value, '$.contentImage') = 'object') OR json_extract(e.value, '$.type') = 'free_image') p LEFT JOIN layout_source_bindings b ON b.layout_revision_id = NEW.id AND b.role = p.role AND b."order" = p.binding_order WHERE b.id IS NULL OR b.element_id IS NOT p.element_id OR b.shot_id IS NOT p.shot_id OR b.candidate_id IS NOT p.candidate_id OR b.candidate_lock_revision_id IS NOT p.lock_id OR b.asset_id IS NOT p.asset_id OR b.source_digest IS NOT p.source_digest ) ), 0) WHEN json_extract(NEW.document_json, '$.kind') = 'legacy_chapter_layout_v1' THEN NOT COALESCE(( json_extract(NEW.document_json, '$.schemaVersion') = 1 AND json_extract(NEW.document_json, '$.kind') = 'legacy_chapter_layout_v1' AND json_extract(NEW.document_json, '$.sourceResolution') IN ('complete', 'unresolved') AND json_type(NEW.document_json, '$.sourceBindings') IS 'array' AND NOT ( json_extract(NEW.document_json, '$.sourceResolution') = 'complete' AND EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.sourceBindings') complete_source WHERE json_type(complete_source.value, '$.role') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.role'))) = 0 OR json_type(complete_source.value, '$.order') IS NOT 'integer' OR json_extract(complete_source.value, '$.order') < 1 OR json_type(complete_source.value, '$.elementId') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.elementId'))) = 0 OR json_type(complete_source.value, '$.shotId') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.shotId'))) = 0 OR json_type(complete_source.value, '$.candidateId') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.candidateId'))) = 0 OR json_type(complete_source.value, '$.candidateLockRevisionId') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.candidateLockRevisionId'))) = 0 OR json_type(complete_source.value, '$.assetId') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.assetId'))) = 0 OR json_type(complete_source.value, '$.sourceDigest') IS NOT 'text' OR length(trim(json_extract(complete_source.value, '$.sourceDigest'))) = 0 ) ) AND (SELECT count(*) FROM layout_source_bindings b WHERE b.layout_revision_id = NEW.id) = json_array_length(NEW.document_json, '$.sourceBindings') AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.sourceBindings') j LEFT JOIN layout_source_bindings b ON b.layout_revision_id = NEW.id AND b.role = json_extract(j.value, '$.role') AND b."order" = json_extract(j.value, '$.order') WHERE b.id IS NULL OR b.element_id IS NOT json_extract(j.value, '$.elementId') OR b.shot_id IS NOT json_extract(j.value, '$.shotId') OR b.candidate_id IS NOT json_extract(j.value, '$.candidateId') OR b.candidate_lock_revision_id IS NOT json_extract(j.value, '$.candidateLockRevisionId') OR b.asset_id IS NOT json_extract(j.value, '$.assetId') OR b.source_digest IS NOT json_extract(j.value, '$.sourceDigest') ) ), 0) ELSE 1 END; END;

CREATE TRIGGER trg_layout_revisions_immutable_delete BEFORE DELETE ON layout_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_immutable_delete') WHERE NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = OLD.project_id AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = OLD.project_id AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = OLD.project_id AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_layout_revisions_immutable_update BEFORE UPDATE ON layout_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.revision IS NOT OLD.revision OR NEW.previous_revision_id IS NOT OLD.previous_revision_id OR NEW.content_based_on_revision_id IS NOT OLD.content_based_on_revision_id OR NEW.document_json IS NOT OLD.document_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.document_digest IS NOT OLD.document_digest OR NEW.source_lock_set_digest IS NOT OLD.source_lock_set_digest OR NEW.origin IS NOT OLD.origin OR NEW.save_reason IS NOT OLD.save_reason OR NEW.created_at IS NOT OLD.created_at OR NOT ((OLD.binding_set_sealed_at IS NEW.binding_set_sealed_at) OR (OLD.binding_set_sealed_at IS NULL AND NEW.binding_set_sealed_at IS NOT NULL)); END;

CREATE TRIGGER trg_layout_revisions_scope_insert BEFORE INSERT ON layout_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_revisions_scope_insert') WHERE NEW.binding_set_sealed_at IS NOT NULL OR NOT ( EXISTS (SELECT 1 FROM chapters c JOIN projects p ON p.id = c.project_id WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id AND p.lifecycle_status = 'active') AND (NEW.previous_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.previous_revision_id AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id)) AND (NEW.content_based_on_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.content_based_on_revision_id AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id)) ); END;

CREATE TRIGGER trg_layout_source_bindings_append_only_update BEFORE UPDATE ON layout_source_bindings WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_source_bindings_append_only_update'); END;

CREATE TRIGGER trg_layout_source_bindings_history_delete BEFORE DELETE ON layout_source_bindings WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_source_bindings_history_delete') WHERE NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = (SELECT project_id FROM layout_revisions WHERE id = OLD.layout_revision_id) AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = (SELECT project_id FROM layout_revisions WHERE id = OLD.layout_revision_id) AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = (SELECT project_id FROM layout_revisions WHERE id = OLD.layout_revision_id) AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_layout_source_bindings_scope_insert BEFORE INSERT ON layout_source_bindings WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_source_bindings_scope_insert') WHERE NOT EXISTS ( SELECT 1 FROM layout_revisions r WHERE r.id = NEW.layout_revision_id AND r.binding_set_sealed_at IS NULL AND (NEW.shot_id IS NULL OR EXISTS (SELECT 1 FROM shots s WHERE s.id = NEW.shot_id AND s.project_id = r.project_id AND s.chapter_id = r.chapter_id)) AND (NEW.candidate_id IS NULL OR (NEW.asset_id IS NOT NULL AND EXISTS (SELECT 1 FROM candidates c WHERE c.id = NEW.candidate_id AND c.project_id = r.project_id AND c.chapter_id = r.chapter_id AND c.asset_id IS NEW.asset_id AND (NEW.shot_id IS NULL OR c.shot_id = NEW.shot_id)))) AND (NEW.candidate_lock_revision_id IS NULL OR (NEW.candidate_id IS NOT NULL AND EXISTS (SELECT 1 FROM candidate_lock_revisions l WHERE l.id = NEW.candidate_lock_revision_id AND l.project_id = r.project_id AND l.chapter_id = r.chapter_id AND l.action IN ('lock', 'replace') AND (NEW.shot_id IS NULL OR l.shot_id = NEW.shot_id) AND l.candidate_id IS NEW.candidate_id))) AND (NEW.asset_id IS NULL OR EXISTS (SELECT 1 FROM assets a WHERE a.id = NEW.asset_id AND a.project_id = r.project_id AND (a.chapter_id IS NULL OR a.chapter_id = r.chapter_id) AND a.status = 'ready' AND a.sha256 = NEW.source_digest)) ); END;

CREATE TRIGGER trg_layout_working_copies_scope_insert BEFORE INSERT ON layout_working_copies WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_working_copies_scope_insert') WHERE NOT (EXISTS (SELECT 1 FROM chapters c WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id) AND (NEW.based_on_revision_id IS NULL OR EXISTS ( SELECT 1 FROM layout_revisions r WHERE r.id = NEW.based_on_revision_id AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id ))); END;

CREATE TRIGGER trg_layout_working_copies_scope_update BEFORE UPDATE ON layout_working_copies WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_layout_working_copies_scope_update') WHERE NOT (EXISTS (SELECT 1 FROM chapters c WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id) AND (NEW.based_on_revision_id IS NULL OR EXISTS ( SELECT 1 FROM layout_revisions r WHERE r.id = NEW.based_on_revision_id AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id ))); END;

CREATE TRIGGER trg_migration_issues_no_delete BEFORE DELETE ON migration_issues WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_issues_no_delete'); END;

CREATE TRIGGER trg_migration_issues_running_run_insert BEFORE INSERT ON migration_issues WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_issues_running_run_insert') WHERE NOT (EXISTS ( SELECT 1 FROM migration_runs AS parent_run WHERE parent_run.id = NEW.run_id AND parent_run.status = 'running' )); END;

CREATE TRIGGER trg_migration_issues_running_run_update BEFORE UPDATE ON migration_issues WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_issues_running_run_update') WHERE NOT (EXISTS ( SELECT 1 FROM migration_runs AS parent_run WHERE parent_run.id = NEW.run_id AND parent_run.status = 'running' )); SELECT RAISE(ABORT, 'AIR_G1:trg_migration_issues_running_run_update') WHERE NEW.run_id IS NOT OLD.run_id OR NEW.issue_key IS NOT OLD.issue_key OR NEW.severity IS NOT OLD.severity OR NEW.code IS NOT OLD.code OR NEW.source_key IS NOT OLD.source_key OR NEW.entity_type IS NOT OLD.entity_type OR NEW.entity_id IS NOT OLD.entity_id OR NEW.storage_key IS NOT OLD.storage_key OR NEW.detail_json IS NOT OLD.detail_json OR NEW.detail_schema_version IS NOT OLD.detail_schema_version OR NEW.created_at IS NOT OLD.created_at; SELECT RAISE(ABORT, 'AIR_G1:trg_migration_issues_running_run_update') WHERE NOT ( OLD.resolution_status = NEW.resolution_status OR (OLD.resolution_status = 'open' AND NEW.resolution_status IN ('not_needed', 'resolved')) ); END;

CREATE TRIGGER trg_migration_runs_running_insert BEFORE INSERT ON migration_runs WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_runs_running_insert') WHERE NEW.status IS NOT 'running' OR NEW.finished_at IS NOT NULL OR NEW.report_digest IS NOT NULL OR NEW.verification_json IS NOT NULL OR NEW.verification_schema_version IS NOT NULL OR NEW.error_code IS NOT NULL; END;

CREATE TRIGGER trg_migration_runs_state_transition BEFORE UPDATE ON migration_runs WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_runs_state_transition') WHERE NOT ( (OLD.status = 'running' AND NEW.status = 'running' AND NEW.finished_at IS NULL) OR (OLD.status = 'running' AND NEW.status IN ('blocked', 'succeeded', 'failed') AND OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL) ); SELECT RAISE(ABORT, 'AIR_G1:trg_migration_runs_state_transition') WHERE OLD.status = 'running' AND NEW.status = 'succeeded' AND NEW.kind = 'final' AND NOT ( NEW.snapshot_manifest_digest IS NOT NULL AND NEW.decisions_digest IS NOT NULL AND NEW.report_digest IS NOT NULL AND NEW.counts_json IS NOT NULL AND NEW.counts_schema_version IS NOT NULL AND NEW.verification_json IS NOT NULL AND NEW.verification_schema_version = 1 AND CASE WHEN json_valid(NEW.verification_json) = 1 THEN COALESCE(( json_type(NEW.verification_json) IS 'object' AND json_extract(NEW.verification_json, '$.integrityCheck') = 'ok' AND json_extract(NEW.verification_json, '$.foreignKeyViolationCount') = 0 AND json_extract(NEW.verification_json, '$.failedLedgerCount') = 0 AND json_extract(NEW.verification_json, '$.migrationChecksumStatus') = 'verified' AND json_type(NEW.verification_json, '$.effectiveSchemaManifestDigest') IS 'text' AND length(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest')) = 71 AND substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 1, 7) = 'sha256:' AND substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 8) = lower(substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 8)) AND substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 8) NOT GLOB '*[^0-9a-f]*' AND json_type(NEW.verification_json, '$.sourceManifestDigest') IS 'text' AND json_extract(NEW.verification_json, '$.sourceManifestDigest') IS NEW.source_manifest_digest AND json_extract(NEW.verification_json, '$.openBlockerCount') = 0 ), 0) ELSE 0 END AND NOT EXISTS ( SELECT 1 FROM migration_issues AS blocker WHERE blocker.run_id = NEW.id AND blocker.severity = 'blocker' AND blocker.resolution_status IS NOT 'resolved' ) ); END;

CREATE TRIGGER trg_migration_runs_terminal_immutable_delete BEFORE DELETE ON migration_runs WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_runs_terminal_immutable_delete') WHERE OLD.status IN ('blocked', 'succeeded', 'failed'); END;

CREATE TRIGGER trg_migration_runs_terminal_immutable_update BEFORE UPDATE ON migration_runs WHEN OLD.status IN ('blocked', 'succeeded', 'failed') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_migration_runs_terminal_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.status IS NOT OLD.status OR NEW.importer_version IS NOT OLD.importer_version OR NEW.source_manifest_digest IS NOT OLD.source_manifest_digest OR NEW.snapshot_manifest_digest IS NOT OLD.snapshot_manifest_digest OR NEW.decisions_digest IS NOT OLD.decisions_digest OR NEW.report_digest IS NOT OLD.report_digest OR NEW.counts_json IS NOT OLD.counts_json OR NEW.counts_schema_version IS NOT OLD.counts_schema_version OR NEW.verification_json IS NOT OLD.verification_json OR NEW.verification_schema_version IS NOT OLD.verification_schema_version OR NEW.error_code IS NOT OLD.error_code OR NEW.started_at IS NOT OLD.started_at OR NEW.finished_at IS NOT OLD.finished_at OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_outbox_events_attempt_transition BEFORE UPDATE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_attempt_transition') WHERE NOT ( (OLD.status = 'pending' AND NEW.status = 'processing' AND NEW.attempt = OLD.attempt + 1 AND NEW.attempt <= NEW.max_attempts) OR (NOT (OLD.status = 'pending' AND NEW.status = 'processing') AND NEW.attempt = OLD.attempt) ); END;

CREATE TRIGGER trg_outbox_events_intent_immutable BEFORE UPDATE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_intent_immutable') WHERE NEW.id IS NOT OLD.id OR NEW.event_type IS NOT OLD.event_type OR NEW.aggregate_type IS NOT OLD.aggregate_type OR NEW.aggregate_id IS NOT OLD.aggregate_id OR NEW.payload_json IS NOT OLD.payload_json OR NEW.payload_schema_version IS NOT OLD.payload_schema_version OR NEW.payload_digest IS NOT OLD.payload_digest OR NEW.max_attempts IS NOT OLD.max_attempts OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_outbox_events_lease_fencing BEFORE UPDATE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_lease_fencing') WHERE OLD.status = 'processing' AND NEW.status = 'processing' AND ( NEW.lease_owner_id IS NOT OLD.lease_owner_id OR NEW.lease_token IS NOT OLD.lease_token OR NEW.updated_at <= OLD.updated_at OR NEW.lease_expires_at <= OLD.lease_expires_at ); SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_lease_fencing') WHERE OLD.status = 'processing' AND NEW.status <> 'processing' AND ( OLD.lease_owner_id IS NULL OR OLD.lease_token IS NULL OR OLD.lease_expires_at IS NULL ); END;

CREATE TRIGGER trg_outbox_events_lease_shape BEFORE UPDATE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_lease_shape') WHERE NOT ( (OLD.status = 'pending' AND NEW.status = 'processing' AND OLD.lease_owner_id IS NULL AND OLD.lease_token IS NULL AND OLD.lease_expires_at IS NULL AND NEW.lease_owner_id IS NOT NULL AND NEW.lease_token IS NOT NULL AND NEW.lease_expires_at > NEW.updated_at) OR (OLD.status = 'processing' AND NEW.status = 'processing' AND NEW.lease_owner_id IS NOT NULL AND NEW.lease_token IS NOT NULL AND NEW.lease_expires_at IS NOT NULL) OR (OLD.status = 'processing' AND NEW.status IN ('pending', 'processed', 'failed') AND NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL) ); END;

CREATE TRIGGER trg_outbox_events_no_delete BEFORE DELETE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_no_delete'); END;

CREATE TRIGGER trg_outbox_events_pending_insert BEFORE INSERT ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_pending_insert') WHERE NOT ( NEW.status = 'pending' AND NEW.attempt = 0 AND NEW.max_attempts = 3 AND NEW.processed_at IS NULL AND NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL ); END;

CREATE TRIGGER trg_outbox_events_processed_immutable BEFORE UPDATE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_processed_immutable') WHERE OLD.status = 'processing' AND NEW.status = 'processed' AND NOT (OLD.processed_at IS NULL AND NEW.processed_at IS NOT NULL); SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_processed_immutable') WHERE NEW.status <> 'processed' AND NEW.processed_at IS NOT NULL; SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_processed_immutable') WHERE OLD.status IN ('processed', 'failed') AND (NEW.status IS NOT OLD.status OR NEW.attempt IS NOT OLD.attempt OR NEW.available_at IS NOT OLD.available_at OR NEW.lease_owner_id IS NOT OLD.lease_owner_id OR NEW.lease_token IS NOT OLD.lease_token OR NEW.lease_expires_at IS NOT OLD.lease_expires_at OR NEW.last_error_json IS NOT OLD.last_error_json OR NEW.updated_at IS NOT OLD.updated_at OR NEW.processed_at IS NOT OLD.processed_at); END;

CREATE TRIGGER trg_outbox_events_state_transition BEFORE UPDATE ON outbox_events WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_state_transition') WHERE NOT ( (OLD.status = 'pending' AND NEW.status = 'processing' AND OLD.available_at <= NEW.updated_at AND NEW.available_at IS OLD.available_at) OR (OLD.status = 'processing' AND NEW.status = 'processing' AND NEW.available_at IS OLD.available_at) OR (OLD.status = 'processing' AND NEW.status = 'pending' AND OLD.attempt < OLD.max_attempts AND NEW.available_at > NEW.updated_at) OR (OLD.status = 'processing' AND NEW.status IN ('processed', 'failed') AND NEW.available_at IS OLD.available_at) ); END;

CREATE TRIGGER trg_pending_dialogue_artifacts_identity_immutable_update BEFORE UPDATE ON pending_dialogue_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_identity_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.kind IS NOT OLD.kind OR NEW.payload_json IS NOT OLD.payload_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.payload_digest IS NOT OLD.payload_digest OR NEW.source_message_id IS NOT OLD.source_message_id OR NEW.tool_result_id IS NOT OLD.tool_result_id OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_pending_dialogue_artifacts_initial_insert BEFORE INSERT ON pending_dialogue_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_initial_insert') WHERE NEW.status IS NOT 'pending' OR NEW.active_slot_key IS NULL OR NEW.resolved_at IS NOT NULL; END;

CREATE TRIGGER trg_pending_dialogue_artifacts_scope_insert BEFORE INSERT ON pending_dialogue_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_scope_insert') WHERE NOT (EXISTS ( SELECT 1 FROM conversation_threads AS owner_thread WHERE owner_thread.id = NEW.thread_id AND owner_thread.project_id = NEW.project_id AND owner_thread.chapter_id IS NEW.chapter_id ) AND (NEW.chapter_id IS NULL OR EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND owner_chapter.project_id = NEW.project_id )) AND (NEW.source_message_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.source_message_id AND source_message.thread_id = NEW.thread_id )) AND (NEW.tool_result_id IS NULL OR EXISTS ( SELECT 1 FROM dialogue_tool_results AS source_result WHERE source_result.id = NEW.tool_result_id AND source_result.thread_id = NEW.thread_id AND (NEW.source_message_id IS NULL OR source_result.message_id = NEW.source_message_id) ))); END;

CREATE TRIGGER trg_pending_dialogue_artifacts_scope_update BEFORE UPDATE ON pending_dialogue_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_scope_update') WHERE NOT (EXISTS ( SELECT 1 FROM conversation_threads AS owner_thread WHERE owner_thread.id = NEW.thread_id AND owner_thread.project_id = NEW.project_id AND owner_thread.chapter_id IS NEW.chapter_id ) AND (NEW.chapter_id IS NULL OR EXISTS ( SELECT 1 FROM chapters AS owner_chapter WHERE owner_chapter.id = NEW.chapter_id AND owner_chapter.project_id = NEW.project_id )) AND (NEW.source_message_id IS NULL OR EXISTS ( SELECT 1 FROM conversation_messages AS source_message WHERE source_message.id = NEW.source_message_id AND source_message.thread_id = NEW.thread_id )) AND (NEW.tool_result_id IS NULL OR EXISTS ( SELECT 1 FROM dialogue_tool_results AS source_result WHERE source_result.id = NEW.tool_result_id AND source_result.thread_id = NEW.thread_id AND (NEW.source_message_id IS NULL OR source_result.message_id = NEW.source_message_id) ))); END;

CREATE TRIGGER trg_pending_dialogue_artifacts_state_transition BEFORE UPDATE ON pending_dialogue_artifacts WHEN OLD.status = 'pending' OR NEW.status IS NOT OLD.status BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_state_transition') WHERE NOT ( (OLD.status = 'pending' AND NEW.status = 'pending' AND NEW.active_slot_key IS OLD.active_slot_key AND NEW.resolved_at IS NULL) OR (OLD.status = 'pending' AND NEW.status IN ('applied', 'discarded', 'superseded', 'expired') AND OLD.resolved_at IS NULL AND OLD.active_slot_key IS NOT NULL AND NEW.active_slot_key IS NULL AND NEW.resolved_at IS NOT NULL) ); END;

CREATE TRIGGER trg_pending_dialogue_artifacts_terminal_immutable_delete BEFORE DELETE ON pending_dialogue_artifacts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_terminal_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = OLD.project_id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = OLD.project_id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_pending_dialogue_artifacts_terminal_immutable_update BEFORE UPDATE ON pending_dialogue_artifacts WHEN OLD.status IN ('applied', 'discarded', 'superseded', 'expired') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_pending_dialogue_artifacts_terminal_immutable_update') WHERE NEW.status IS NOT OLD.status OR NEW.active_slot_key IS NOT OLD.active_slot_key OR NEW.updated_at IS NOT OLD.updated_at OR NEW.resolved_at IS NOT OLD.resolved_at; END;

CREATE TRIGGER trg_persistence_states_activation_first_write BEFORE UPDATE ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_activation_first_write') WHERE OLD.activated_at IS NULL AND NEW.activated_at IS NOT NULL AND NOT ( OLD.activation_state = 'ready_for_activation' AND NEW.activation_state = 'db_only' AND NEW.cutover_run_id IS NOT NULL AND NEW.source_manifest_digest IS NOT NULL AND NEW.effective_schema_manifest_digest IS NOT NULL AND EXISTS ( SELECT 1 FROM migration_runs AS activation_run WHERE activation_run.id = NEW.cutover_run_id AND activation_run.kind = 'final' AND activation_run.status = 'succeeded' AND activation_run.source_manifest_digest IS NEW.source_manifest_digest AND CASE WHEN json_valid(activation_run.verification_json) = 1 THEN json_type(activation_run.verification_json, '$.effectiveSchemaManifestDigest') IS 'text' AND json_extract(activation_run.verification_json, '$.effectiveSchemaManifestDigest') IS NEW.effective_schema_manifest_digest ELSE 0 END ) ); SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_activation_first_write') WHERE OLD.first_business_write_at IS NULL AND NEW.first_business_write_at IS NOT NULL AND NOT ( OLD.activated_at IS NOT NULL AND NEW.activated_at IS OLD.activated_at AND OLD.activation_state = 'db_only' AND NEW.activation_state = 'db_only' ); END;

CREATE TRIGGER trg_persistence_states_activation_identity_immutable BEFORE UPDATE ON persistence_states WHEN OLD.activated_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_activation_identity_immutable') WHERE NEW.activated_at IS NOT OLD.activated_at OR NEW.cutover_run_id IS NOT OLD.cutover_run_id OR NEW.source_manifest_digest IS NOT OLD.source_manifest_digest OR NEW.effective_schema_manifest_digest IS NOT OLD.effective_schema_manifest_digest; END;

CREATE TRIGGER trg_persistence_states_activation_transition BEFORE UPDATE ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_activation_transition') WHERE NOT ( (OLD.activation_state = NEW.activation_state) OR (OLD.activated_at IS NULL AND OLD.activation_state = 'shadow' AND NEW.activation_state IN ('ready_for_activation', 'recovery_required')) OR (OLD.activated_at IS NULL AND OLD.activation_state = 'ready_for_activation' AND NEW.activation_state IN ('shadow', 'db_only', 'recovery_required')) OR (OLD.activated_at IS NULL AND OLD.activation_state = 'recovery_required' AND NEW.activation_state IN ('shadow', 'ready_for_activation', 'recovery_required')) OR (OLD.activated_at IS NOT NULL AND OLD.activation_state = 'recovery_required' AND NEW.activation_state IN ('recovery_required', 'db_only')) OR (OLD.activated_at IS NOT NULL AND OLD.activation_state = 'db_only' AND NEW.activation_state IN ('db_only', 'recovery_required')) ); END;

CREATE TRIGGER trg_persistence_states_cutover_run_insert BEFORE INSERT ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_cutover_run_insert') WHERE NOT (NEW.cutover_run_id IS NULL OR EXISTS ( SELECT 1 FROM migration_runs AS cutover_run WHERE cutover_run.id = NEW.cutover_run_id AND cutover_run.kind = 'final' AND cutover_run.status = 'succeeded' AND cutover_run.source_manifest_digest IS NEW.source_manifest_digest AND CASE WHEN json_valid(cutover_run.verification_json) = 1 THEN json_type(cutover_run.verification_json) IS 'object' AND json_type(cutover_run.verification_json, '$.effectiveSchemaManifestDigest') IS 'text' AND json_extract(cutover_run.verification_json, '$.effectiveSchemaManifestDigest') IS NEW.effective_schema_manifest_digest ELSE 0 END )); END;

CREATE TRIGGER trg_persistence_states_cutover_run_update BEFORE UPDATE ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_cutover_run_update') WHERE NOT (NEW.cutover_run_id IS NULL OR EXISTS ( SELECT 1 FROM migration_runs AS cutover_run WHERE cutover_run.id = NEW.cutover_run_id AND cutover_run.kind = 'final' AND cutover_run.status = 'succeeded' AND cutover_run.source_manifest_digest IS NEW.source_manifest_digest AND CASE WHEN json_valid(cutover_run.verification_json) = 1 THEN json_type(cutover_run.verification_json) IS 'object' AND json_type(cutover_run.verification_json, '$.effectiveSchemaManifestDigest') IS 'text' AND json_extract(cutover_run.verification_json, '$.effectiveSchemaManifestDigest') IS NEW.effective_schema_manifest_digest ELSE 0 END )); END;

CREATE TRIGGER trg_persistence_states_first_write_monotonic BEFORE UPDATE ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_first_write_monotonic') WHERE (OLD.first_business_write_at IS NOT NULL AND NEW.first_business_write_at IS NOT OLD.first_business_write_at) OR (OLD.first_business_write_at IS NULL AND NEW.first_business_write_at IS NOT NULL AND NOT (OLD.activated_at IS NOT NULL AND NEW.activated_at IS OLD.activated_at AND OLD.activation_state = 'db_only' AND NEW.activation_state = 'db_only')); END;

CREATE TRIGGER trg_persistence_states_identity_immutable BEFORE UPDATE ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_identity_immutable') WHERE NEW.id IS NOT OLD.id OR NEW.storage_contract_version IS NOT OLD.storage_contract_version OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_persistence_states_initial_insert BEFORE INSERT ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_initial_insert') WHERE NOT ( NEW.id = 'primary' AND NEW.storage_contract_version = 1 AND NEW.activation_state = 'shadow' AND NEW.cutover_run_id IS NULL AND NEW.source_manifest_digest IS NULL AND NEW.effective_schema_manifest_digest IS NULL AND NEW.activated_at IS NULL AND NEW.first_business_write_at IS NULL ); END;

CREATE TRIGGER trg_persistence_states_no_delete BEFORE DELETE ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_no_delete'); END;

CREATE TRIGGER trg_persistence_states_no_second_row BEFORE INSERT ON persistence_states WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_no_second_row') WHERE EXISTS (SELECT 1 FROM persistence_states); END;

CREATE TRIGGER trg_preflight_revisions_immutable_delete BEFORE DELETE ON preflight_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_preflight_revisions_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_preflight_revisions_immutable_update BEFORE UPDATE ON preflight_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_preflight_revisions_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.version IS NOT OLD.version OR NEW.status IS NOT OLD.status OR NEW.source_storyboard_version_id IS NOT OLD.source_storyboard_version_id OR NEW.source_policy_version IS NOT OLD.source_policy_version OR NEW.source_digest IS NOT OLD.source_digest OR NEW.document_json IS NOT OLD.document_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.document_digest IS NOT OLD.document_digest OR NEW.ready IS NOT OLD.ready OR NEW.created_at IS NOT OLD.created_at OR NEW.confirmed_at IS NOT OLD.confirmed_at; END;

CREATE TRIGGER trg_preflight_revisions_scope_insert BEFORE INSERT ON preflight_revisions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_preflight_revisions_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id JOIN storyboard_versions AS storyboard ON storyboard.id = NEW.source_storyboard_version_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.lifecycle_status = 'active' AND storyboard.project_id = NEW.project_id AND storyboard.chapter_id = NEW.chapter_id AND storyboard.status = 'confirmed') OR NEW.source_policy_version IS NULL OR NEW.source_digest IS NULL OR NEW.schema_version NOT IN (1, 2) OR json_type(NEW.document_json, '$.schemaVersion') <> 'integer' OR json_extract(NEW.document_json, '$.schemaVersion') <> NEW.schema_version OR json_extract(NEW.document_json, '$.chapterId') <> NEW.chapter_id OR json_type(NEW.document_json, '$.ready') NOT IN ('true', 'false') OR json_extract(NEW.document_json, '$.ready') <> NEW.ready OR (NEW.schema_version = 1 AND json_extract(NEW.document_json, '$.sourceStoryboardId') IS NOT NEW.source_storyboard_version_id) OR (NEW.schema_version = 2 AND (json_extract(NEW.document_json, '$.policyVersion') IS NOT NEW.source_policy_version OR json_type(NEW.document_json, '$.sourceSnapshot') <> 'object' OR json_extract(NEW.document_json, '$.sourceSnapshot.schemaVersion') <> 1 OR json_extract(NEW.document_json, '$.sourceSnapshot.projectId') IS NOT NEW.project_id OR json_extract(NEW.document_json, '$.sourceSnapshot.chapterId') IS NOT NEW.chapter_id OR json_extract(NEW.document_json, '$.sourceSnapshot.consumerType') <> 'preflight_revision' OR json_extract(NEW.document_json, '$.sourceSnapshot.policyVersion') IS NOT NEW.source_policy_version OR json_extract(NEW.document_json, '$.sourceSnapshot.storyboard.id') IS NOT NEW.source_storyboard_version_id OR NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = NEW.source_storyboard_version_id AND json_extract(NEW.document_json, '$.sourceSnapshot.storyboard.digest') IS storyboard.document_digest))); END;

CREATE TRIGGER trg_project_context_facts_content_immutable BEFORE UPDATE ON project_context_facts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_project_context_facts_content_immutable') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.type IS NOT OLD.type OR NEW.content_json IS NOT OLD.content_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.content_digest IS NOT OLD.content_digest OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id OR NEW.created_at IS NOT OLD.created_at; SELECT RAISE(ABORT, 'AIR_G1:trg_project_context_facts_content_immutable') WHERE NOT ( OLD.status = NEW.status OR (OLD.status = 'confirmed' AND NEW.status IN ('superseded', 'archived')) OR (OLD.status = 'superseded' AND NEW.status = 'archived') ); SELECT RAISE(ABORT, 'AIR_G1:trg_project_context_facts_content_immutable') WHERE NOT ( (OLD.status = NEW.status AND NEW.superseded_at IS OLD.superseded_at) OR (OLD.status = 'confirmed' AND NEW.status IN ('superseded', 'archived') AND OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL) OR (OLD.status = 'superseded' AND NEW.status = 'archived' AND NEW.superseded_at IS OLD.superseded_at) ); END;

CREATE TRIGGER trg_project_context_facts_purge_delete_guard BEFORE DELETE ON project_context_facts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_project_context_facts_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = OLD.project_id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = OLD.project_id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_project_script_outlines_formal_immutable_delete BEFORE DELETE ON project_script_outlines WHEN OLD.status IN ('confirmed', 'archived') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_project_script_outlines_formal_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = OLD.project_id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = OLD.project_id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_project_script_outlines_formal_immutable_update BEFORE UPDATE ON project_script_outlines WHEN OLD.status IN ('confirmed', 'archived') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_project_script_outlines_formal_immutable_update') WHERE NEW.project_id IS NOT OLD.project_id OR NEW.version IS NOT OLD.version OR NEW.title IS NOT OLD.title OR NEW.source_text IS NOT OLD.source_text OR NEW.source_digest IS NOT OLD.source_digest OR NEW.confirmed_at IS NOT OLD.confirmed_at OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_project_script_outlines_lifecycle_update BEFORE UPDATE ON project_script_outlines WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_project_script_outlines_lifecycle_update') WHERE NOT ( OLD.status = NEW.status OR (OLD.status = 'draft' AND NEW.status = 'confirmed' AND OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL) OR (OLD.status = 'confirmed' AND NEW.status = 'archived' AND NEW.confirmed_at IS OLD.confirmed_at) ); END;

CREATE TRIGGER trg_projects_current_scope_insert BEFORE INSERT ON projects WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_projects_current_scope_insert') WHERE NOT ( ((NEW.current_chapter_id IS NULL OR EXISTS ( SELECT 1 FROM chapters AS current_chapter WHERE current_chapter.id = NEW.current_chapter_id AND current_chapter.project_id = NEW.id )) AND (NEW.current_script_outline_id IS NULL OR EXISTS ( SELECT 1 FROM project_script_outlines AS current_outline WHERE current_outline.id = NEW.current_script_outline_id AND current_outline.project_id = NEW.id ))) AND (NEW.lifecycle_status = 'active' OR (NEW.current_chapter_id IS NULL AND NEW.current_script_outline_id IS NULL)) ); END;

CREATE TRIGGER trg_projects_current_scope_update BEFORE UPDATE ON projects WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_projects_current_scope_update') WHERE NOT ((NEW.current_chapter_id IS NULL OR EXISTS ( SELECT 1 FROM chapters AS current_chapter WHERE current_chapter.id = NEW.current_chapter_id AND current_chapter.project_id = NEW.id )) AND (NEW.current_script_outline_id IS NULL OR EXISTS ( SELECT 1 FROM project_script_outlines AS current_outline WHERE current_outline.id = NEW.current_script_outline_id AND current_outline.project_id = NEW.id ))); SELECT RAISE(ABORT, 'AIR_G1:trg_projects_current_scope_update') WHERE (NEW.current_chapter_id IS NOT OLD.current_chapter_id OR NEW.current_script_outline_id IS NOT OLD.current_script_outline_id) AND NOT (OLD.lifecycle_status = 'active' AND NEW.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_projects_deleting_monotonic BEFORE UPDATE ON projects WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_projects_deleting_monotonic') WHERE NOT ( (OLD.lifecycle_status = 'active' AND NEW.lifecycle_status = 'active' AND NEW.deleting_at IS NULL) OR (OLD.lifecycle_status = 'active' AND NEW.lifecycle_status = 'deleting' AND OLD.deleting_at IS NULL AND NEW.deleting_at IS NOT NULL) OR (OLD.lifecycle_status = 'deleting' AND NEW.lifecycle_status = 'deleting' AND NEW.deleting_at IS OLD.deleting_at) ); END;

CREATE TRIGGER trg_projects_genre_tags_shape_insert BEFORE INSERT ON projects WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_projects_genre_tags_shape_insert') WHERE CASE WHEN json_valid(NEW.genre_tags) = 1 THEN json_type(NEW.genre_tags) IS NOT 'array' ELSE 1 END OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS tag WHERE tag.type IS NOT 'text' OR length(trim(tag.value)) = 0) OR EXISTS ( SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS left_tag JOIN json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS right_tag ON right_tag.key > left_tag.key AND right_tag.value = left_tag.value ); END;

CREATE TRIGGER trg_projects_genre_tags_shape_update BEFORE UPDATE ON projects WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_projects_genre_tags_shape_update') WHERE CASE WHEN json_valid(NEW.genre_tags) = 1 THEN json_type(NEW.genre_tags) IS NOT 'array' ELSE 1 END OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS tag WHERE tag.type IS NOT 'text' OR length(trim(tag.value)) = 0) OR EXISTS ( SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS left_tag JOIN json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS right_tag ON right_tag.key > left_tag.key AND right_tag.value = left_tag.value ); END;

CREATE TRIGGER trg_projects_purge_delete_guard BEFORE DELETE ON projects WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_projects_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.id AND purge_project.lifecycle_status = 'deleting' ) AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = OLD.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = OLD.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_provider_configs_identity_immutable_update BEFORE UPDATE ON provider_configs WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_provider_configs_identity_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.provider_id IS NOT OLD.provider_id OR NEW.runtime_kind IS NOT OLD.runtime_kind OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_scene_visuals_purge_delete_guard BEFORE DELETE ON scene_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_scene_visuals_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM chapter_scenes WHERE id = OLD.chapter_scene_id) AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_scene_visuals_scope_insert BEFORE INSERT ON scene_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_scene_visuals_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN assets AS asset ON asset.id = NEW.asset_id JOIN projects AS project ON project.id = scene.project_id WHERE scene.id = NEW.chapter_scene_id AND asset.project_id = scene.project_id AND asset.chapter_id = scene.chapter_id AND project.lifecycle_status = 'active') OR (NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN generation_tasks AS task ON task.id = NEW.source_task_id WHERE scene.id = NEW.chapter_scene_id AND task.project_id = scene.project_id AND task.chapter_id = scene.chapter_id)); END;

CREATE TRIGGER trg_scene_visuals_scope_update BEFORE UPDATE ON scene_visuals WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_scene_visuals_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.chapter_scene_id IS NOT OLD.chapter_scene_id OR NEW.asset_id IS NOT OLD.asset_id OR NEW.source_task_id IS NOT OLD.source_task_id OR NEW.version IS NOT OLD.version OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN assets AS asset ON asset.id = NEW.asset_id WHERE scene.id = NEW.chapter_scene_id AND asset.project_id = scene.project_id AND asset.chapter_id = scene.chapter_id) OR (NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN generation_tasks AS task ON task.id = NEW.source_task_id WHERE scene.id = NEW.chapter_scene_id AND task.project_id = scene.project_id AND task.chapter_id = scene.chapter_id)); END;

CREATE TRIGGER trg_shots_current_lock_scope_insert BEFORE INSERT ON shots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_shots_current_lock_scope_insert') WHERE NEW.current_candidate_lock_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_lock_revisions AS lock_revision JOIN projects AS project ON project.id = NEW.project_id WHERE lock_revision.id = NEW.current_candidate_lock_revision_id AND lock_revision.project_id = NEW.project_id AND lock_revision.chapter_id = NEW.chapter_id AND lock_revision.shot_id = NEW.id AND lock_revision.action IN ('lock', 'replace') AND project.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_shots_current_lock_scope_update BEFORE UPDATE ON shots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_shots_current_lock_scope_update') WHERE NEW.current_candidate_lock_revision_id IS NOT OLD.current_candidate_lock_revision_id AND (NEW.current_candidate_lock_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_lock_revisions AS lock_revision JOIN projects AS project ON project.id = NEW.project_id WHERE lock_revision.id = NEW.current_candidate_lock_revision_id AND lock_revision.project_id = NEW.project_id AND lock_revision.chapter_id = NEW.chapter_id AND lock_revision.shot_id = NEW.id AND lock_revision.action IN ('lock', 'replace') AND project.lifecycle_status = 'active')); END;

CREATE TRIGGER trg_shots_purge_delete_guard BEFORE DELETE ON shots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_shots_purge_delete_guard') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_shots_scope_insert BEFORE INSERT ON shots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_shots_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.lifecycle_status = 'active'); END;

CREATE TRIGGER trg_shots_scope_update BEFORE UPDATE ON shots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_shots_scope_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM chapters AS chapter WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id); END;

CREATE TRIGGER trg_story_beat_projections_parent_formal_delete BEFORE DELETE ON story_beat_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_beat_projections_parent_formal_delete') WHERE (EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = OLD.story_version_id AND story.status IN ('confirmed', 'archived'))) AND NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM story_versions WHERE id = OLD.story_version_id) AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_story_beat_projections_parent_formal_insert BEFORE INSERT ON story_beat_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_beat_projections_parent_formal_insert') WHERE EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_story_beat_projections_parent_formal_update BEFORE UPDATE ON story_beat_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_beat_projections_parent_formal_update') WHERE EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_story_beat_projections_scope_insert BEFORE INSERT ON story_beat_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_beat_projections_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id)); END;

CREATE TRIGGER trg_story_beat_projections_scope_update BEFORE UPDATE ON story_beat_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_beat_projections_scope_update') WHERE NEW.story_version_id IS NOT OLD.story_version_id OR NOT EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id)); END;

CREATE TRIGGER trg_story_scene_projections_parent_formal_delete BEFORE DELETE ON story_scene_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_scene_projections_parent_formal_delete') WHERE (EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = OLD.story_version_id AND story.status IN ('confirmed', 'archived'))) AND NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM story_versions WHERE id = OLD.story_version_id) AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_story_scene_projections_parent_formal_insert BEFORE INSERT ON story_scene_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_scene_projections_parent_formal_insert') WHERE EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_story_scene_projections_parent_formal_update BEFORE UPDATE ON story_scene_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_scene_projections_parent_formal_update') WHERE EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_story_scene_projections_scope_insert BEFORE INSERT ON story_scene_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_scene_projections_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id); END;

CREATE TRIGGER trg_story_scene_projections_scope_update BEFORE UPDATE ON story_scene_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_scene_projections_scope_update') WHERE NEW.story_version_id IS NOT OLD.story_version_id OR NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id); END;

CREATE TRIGGER trg_story_versions_formal_immutable_delete BEFORE DELETE ON story_versions WHEN OLD.status IN ('confirmed', 'archived') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_versions_formal_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_story_versions_formal_immutable_update BEFORE UPDATE ON story_versions WHEN OLD.status IN ('confirmed', 'archived') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_versions_formal_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.version IS NOT OLD.version OR NEW.status IS NOT OLD.status OR NEW.source_script_version_id IS NOT OLD.source_script_version_id OR NEW.source_policy_version IS NOT OLD.source_policy_version OR NEW.source_digest IS NOT OLD.source_digest OR NEW.document_json IS NOT OLD.document_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.document_digest IS NOT OLD.document_digest OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at OR NEW.confirmed_at IS NOT OLD.confirmed_at OR NEW.archived_at IS NOT OLD.archived_at; END;

CREATE TRIGGER trg_story_versions_formalize_guard BEFORE UPDATE ON story_versions WHEN NEW.status IS NOT OLD.status BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_versions_formalize_guard') WHERE NOT ( OLD.status = 'pending_confirmation' AND NEW.status IN ('confirmed', 'archived') AND ((NEW.status = 'confirmed' AND NEW.confirmed_at IS NOT NULL AND NEW.archived_at IS NULL) OR (NEW.status = 'archived' AND NEW.confirmed_at IS NULL AND NEW.archived_at IS NOT NULL)) ) OR (NEW.status = 'confirmed' AND ( NEW.source_script_version_id IS NULL OR NEW.source_policy_version IS NULL OR NEW.source_digest IS NULL OR json_type(NEW.document_json, '$.schemaVersion') <> 'integer' OR json_extract(NEW.document_json, '$.schemaVersion') <> NEW.schema_version OR NEW.schema_version NOT IN (1, 2) OR json_type(NEW.document_json, '$.chapterId') <> 'text' OR json_extract(NEW.document_json, '$.chapterId') <> NEW.chapter_id OR json_type(NEW.document_json, '$.scenes') <> 'array' OR json_type(NEW.document_json, '$.beats') <> 'array' OR (NEW.schema_version = 1 AND NEW.origin <> 'legacy_import' AND json_extract(NEW.document_json, '$.sourceScriptVersionId') IS NOT NEW.source_script_version_id) OR (NEW.schema_version = 1 AND NEW.origin = 'legacy_import' AND json_extract(NEW.document_json, '$.sourceScriptVersionId') IS NOT NULL AND json_extract(NEW.document_json, '$.sourceScriptVersionId') IS NOT NEW.source_script_version_id) OR EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.scenes') AS scene_json WHERE json_type(scene_json.value, '$.id') <> 'text' OR length(trim(json_extract(scene_json.value, '$.id'))) = 0 OR json_type(scene_json.value, '$.name') <> 'text' OR length(trim(json_extract(scene_json.value, '$.name'))) = 0 OR NOT EXISTS ( SELECT 1 FROM story_scene_projections AS scene_projection JOIN chapter_scenes AS chapter_scene ON chapter_scene.id = scene_projection.chapter_scene_id WHERE scene_projection.story_version_id = NEW.id AND scene_projection.scene_key = json_extract(scene_json.value, '$.id') AND scene_projection."order" = CAST(scene_json.key AS INTEGER) + 1 AND scene_projection.name = json_extract(scene_json.value, '$.name') AND chapter_scene.project_id = NEW.project_id AND chapter_scene.chapter_id = NEW.chapter_id AND chapter_scene.scene_key = json_extract(scene_json.value, '$.id') ) ) OR EXISTS ( SELECT 1 FROM story_scene_projections AS scene_projection WHERE scene_projection.story_version_id = NEW.id AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.scenes') AS scene_json WHERE scene_projection.scene_key = json_extract(scene_json.value, '$.id') AND scene_projection."order" = CAST(scene_json.key AS INTEGER) + 1 AND scene_projection.name = json_extract(scene_json.value, '$.name') ) ) OR EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.beats') AS beat_json WHERE json_type(beat_json.value, '$.id') <> 'text' OR length(trim(json_extract(beat_json.value, '$.id'))) = 0 OR json_type(beat_json.value, '$.order') <> 'integer' OR json_extract(beat_json.value, '$.order') <> CAST(beat_json.key AS INTEGER) + 1 OR json_type(beat_json.value, '$.summary') <> 'text' OR length(trim(json_extract(beat_json.value, '$.summary'))) = 0 OR NOT EXISTS ( SELECT 1 FROM story_beat_projections AS beat_projection WHERE beat_projection.story_version_id = NEW.id AND beat_projection.beat_key = json_extract(beat_json.value, '$.id') AND beat_projection."order" = CAST(beat_json.key AS INTEGER) + 1 AND beat_projection.summary = json_extract(beat_json.value, '$.summary') AND ((json_extract(beat_json.value, '$.sceneId') IS NULL AND beat_projection.chapter_scene_id IS NULL) OR EXISTS ( SELECT 1 FROM chapter_scenes AS beat_scene WHERE beat_scene.id = beat_projection.chapter_scene_id AND beat_scene.project_id = NEW.project_id AND beat_scene.chapter_id = NEW.chapter_id AND beat_scene.scene_key = json_extract(beat_json.value, '$.sceneId') )) ) ) OR EXISTS ( SELECT 1 FROM story_beat_projections AS beat_projection WHERE beat_projection.story_version_id = NEW.id AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.beats') AS beat_json WHERE beat_projection.beat_key = json_extract(beat_json.value, '$.id') AND beat_projection."order" = CAST(beat_json.key AS INTEGER) + 1 AND beat_projection.summary = json_extract(beat_json.value, '$.summary') ) ) )); END;

CREATE TRIGGER trg_story_versions_scope_insert BEFORE INSERT ON story_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_versions_scope_insert') WHERE NOT EXISTS ( SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.id = NEW.project_id ) OR (NEW.source_script_version_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM chapter_script_versions AS script_version JOIN chapters AS source_chapter ON source_chapter.id = script_version.chapter_id WHERE script_version.id = NEW.source_script_version_id AND source_chapter.id = NEW.chapter_id AND source_chapter.project_id = NEW.project_id )); END;

CREATE TRIGGER trg_story_versions_scope_update BEFORE UPDATE ON story_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_versions_scope_update') WHERE NOT EXISTS ( SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.id = NEW.project_id ) OR (NEW.source_script_version_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM chapter_script_versions AS script_version JOIN chapters AS source_chapter ON source_chapter.id = script_version.chapter_id WHERE script_version.id = NEW.source_script_version_id AND source_chapter.id = NEW.chapter_id AND source_chapter.project_id = NEW.project_id )); END;

CREATE TRIGGER trg_story_versions_unconfirmed_insert BEFORE INSERT ON story_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_story_versions_unconfirmed_insert') WHERE NEW.status <> 'pending_confirmation' OR NEW.confirmed_at IS NOT NULL OR NEW.archived_at IS NOT NULL; END;

CREATE TRIGGER trg_storyboard_shot_characters_parent_formal_delete BEFORE DELETE ON storyboard_shot_characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_characters_parent_formal_delete') WHERE (EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = OLD.storyboard_shot_projection_id AND storyboard.status IN ('confirmed', 'archived'))) AND NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT storyboard.project_id FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = OLD.storyboard_shot_projection_id) AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_storyboard_shot_characters_parent_formal_insert BEFORE INSERT ON storyboard_shot_characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_characters_parent_formal_insert') WHERE EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = NEW.storyboard_shot_projection_id AND storyboard.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_storyboard_shot_characters_parent_formal_update BEFORE UPDATE ON storyboard_shot_characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_characters_parent_formal_update') WHERE EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = NEW.storyboard_shot_projection_id AND storyboard.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_storyboard_shot_characters_scope_insert BEFORE INSERT ON storyboard_shot_characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_characters_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection WHERE projection.id = NEW.storyboard_shot_projection_id) OR (NEW.character_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id JOIN characters AS character ON character.id = NEW.character_id WHERE projection.id = NEW.storyboard_shot_projection_id AND character.project_id = storyboard.project_id)); END;

CREATE TRIGGER trg_storyboard_shot_characters_scope_update BEFORE UPDATE ON storyboard_shot_characters WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_characters_scope_update') WHERE NEW.storyboard_shot_projection_id IS NOT OLD.storyboard_shot_projection_id OR NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection WHERE projection.id = NEW.storyboard_shot_projection_id) OR (NEW.character_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id JOIN characters AS character ON character.id = NEW.character_id WHERE projection.id = NEW.storyboard_shot_projection_id AND character.project_id = storyboard.project_id)); END;

CREATE TRIGGER trg_storyboard_shot_projections_parent_formal_delete BEFORE DELETE ON storyboard_shot_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_projections_parent_formal_delete') WHERE (EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = OLD.storyboard_version_id AND storyboard.status IN ('confirmed', 'archived'))) AND NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = (SELECT project_id FROM storyboard_versions WHERE id = OLD.storyboard_version_id) AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_storyboard_shot_projections_parent_formal_insert BEFORE INSERT ON storyboard_shot_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_projections_parent_formal_insert') WHERE EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = NEW.storyboard_version_id AND storyboard.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_storyboard_shot_projections_parent_formal_update BEFORE UPDATE ON storyboard_shot_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_projections_parent_formal_update') WHERE EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = NEW.storyboard_version_id AND storyboard.status IN ('confirmed', 'archived')); END;

CREATE TRIGGER trg_storyboard_shot_projections_scope_insert BEFORE INSERT ON storyboard_shot_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_projections_scope_insert') WHERE NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN shots AS shot ON shot.id = NEW.shot_id WHERE storyboard.id = NEW.storyboard_version_id AND shot.project_id = storyboard.project_id AND shot.chapter_id = storyboard.chapter_id) OR (NEW.story_beat_projection_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN story_beat_projections AS beat ON beat.id = NEW.story_beat_projection_id WHERE storyboard.id = NEW.storyboard_version_id AND beat.story_version_id = storyboard.source_story_version_id)) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE storyboard.id = NEW.storyboard_version_id AND scene.project_id = storyboard.project_id AND scene.chapter_id = storyboard.chapter_id)); END;

CREATE TRIGGER trg_storyboard_shot_projections_scope_update BEFORE UPDATE ON storyboard_shot_projections WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_shot_projections_scope_update') WHERE NEW.storyboard_version_id IS NOT OLD.storyboard_version_id OR NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN shots AS shot ON shot.id = NEW.shot_id WHERE storyboard.id = NEW.storyboard_version_id AND shot.project_id = storyboard.project_id AND shot.chapter_id = storyboard.chapter_id) OR (NEW.story_beat_projection_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN story_beat_projections AS beat ON beat.id = NEW.story_beat_projection_id WHERE storyboard.id = NEW.storyboard_version_id AND beat.story_version_id = storyboard.source_story_version_id)) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE storyboard.id = NEW.storyboard_version_id AND scene.project_id = storyboard.project_id AND scene.chapter_id = storyboard.chapter_id)); END;

CREATE TRIGGER trg_storyboard_versions_formal_immutable_delete BEFORE DELETE ON storyboard_versions WHEN OLD.status IN ('confirmed', 'archived') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_versions_formal_immutable_delete') WHERE NOT (EXISTS ( SELECT 1 FROM projects AS purge_project WHERE purge_project.id = OLD.project_id AND purge_project.lifecycle_status = 'deleting' AND EXISTS ( SELECT 1 FROM outbox_events AS purge_event WHERE purge_event.event_type = 'project.delete_files' AND purge_event.aggregate_type = 'project' AND purge_event.aggregate_id = purge_project.id AND purge_event.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS purge_task WHERE purge_task.project_id = purge_project.id AND purge_task.record_kind = 'runtime' AND purge_task.status IN ('queued', 'running', 'retrying') ) )); END;

CREATE TRIGGER trg_storyboard_versions_formal_immutable_update BEFORE UPDATE ON storyboard_versions WHEN OLD.status IN ('confirmed', 'archived') BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_versions_formal_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.version IS NOT OLD.version OR NEW.status IS NOT OLD.status OR NEW.source_story_version_id IS NOT OLD.source_story_version_id OR NEW.source_policy_version IS NOT OLD.source_policy_version OR NEW.source_digest IS NOT OLD.source_digest OR NEW.document_json IS NOT OLD.document_json OR NEW.schema_version IS NOT OLD.schema_version OR NEW.document_digest IS NOT OLD.document_digest OR NEW.origin IS NOT OLD.origin OR NEW.created_at IS NOT OLD.created_at OR NEW.confirmed_at IS NOT OLD.confirmed_at OR NEW.archived_at IS NOT OLD.archived_at; END;

CREATE TRIGGER trg_storyboard_versions_formalize_guard BEFORE UPDATE ON storyboard_versions WHEN NEW.status IS NOT OLD.status BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_versions_formalize_guard') WHERE NOT ( OLD.status = 'pending_confirmation' AND NEW.status IN ('confirmed', 'archived') AND ((NEW.status = 'confirmed' AND NEW.confirmed_at IS NOT NULL AND NEW.archived_at IS NULL) OR (NEW.status = 'archived' AND NEW.confirmed_at IS NULL AND NEW.archived_at IS NOT NULL)) ) OR (NEW.status = 'confirmed' AND ( NEW.source_story_version_id IS NULL OR NEW.source_policy_version IS NULL OR NEW.source_digest IS NULL OR json_type(NEW.document_json, '$.schemaVersion') <> 'integer' OR json_extract(NEW.document_json, '$.schemaVersion') <> NEW.schema_version OR NEW.schema_version NOT IN (1, 2) OR json_type(NEW.document_json, '$.chapterId') <> 'text' OR json_extract(NEW.document_json, '$.chapterId') <> NEW.chapter_id OR json_type(NEW.document_json, '$.shots') <> 'array' OR (NEW.schema_version = 1 AND NEW.origin <> 'legacy_import' AND json_extract(NEW.document_json, '$.sourceStoryVersionId') IS NOT NEW.source_story_version_id) OR (NEW.schema_version = 1 AND NEW.origin = 'legacy_import' AND json_extract(NEW.document_json, '$.sourceStoryVersionId') IS NOT NULL AND json_extract(NEW.document_json, '$.sourceStoryVersionId') IS NOT NEW.source_story_version_id) OR EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.shots') AS shot_json WHERE json_type(shot_json.value, '$.id') <> 'text' OR length(trim(json_extract(shot_json.value, '$.id'))) = 0 OR json_type(shot_json.value, '$.order') <> 'integer' OR json_extract(shot_json.value, '$.order') <> CAST(shot_json.key AS INTEGER) + 1 OR json_type(shot_json.value, '$.characterIds') <> 'array' OR NOT EXISTS ( SELECT 1 FROM storyboard_shot_projections AS shot_projection JOIN shots AS shot ON shot.id = shot_projection.shot_id WHERE shot_projection.storyboard_version_id = NEW.id AND shot_projection.shot_id = json_extract(shot_json.value, '$.id') AND shot_projection."order" = CAST(shot_json.key AS INTEGER) + 1 AND shot.project_id = NEW.project_id AND shot.chapter_id = NEW.chapter_id AND ((json_extract(shot_json.value, '$.beatId') IS NULL AND shot_projection.story_beat_projection_id IS NULL) OR EXISTS ( SELECT 1 FROM story_beat_projections AS beat_projection WHERE beat_projection.id = shot_projection.story_beat_projection_id AND beat_projection.story_version_id = NEW.source_story_version_id AND beat_projection.beat_key = json_extract(shot_json.value, '$.beatId') )) AND ((json_extract(shot_json.value, '$.sceneId') IS NULL AND shot_projection.chapter_scene_id IS NULL) OR EXISTS ( SELECT 1 FROM chapter_scenes AS shot_scene WHERE shot_scene.id = shot_projection.chapter_scene_id AND shot_scene.project_id = NEW.project_id AND shot_scene.chapter_id = NEW.chapter_id AND shot_scene.scene_key = json_extract(shot_json.value, '$.sceneId') )) AND NOT EXISTS ( SELECT 1 FROM json_each(shot_json.value, '$.characterIds') AS character_json WHERE character_json.type <> 'text' OR length(trim(character_json.value)) = 0 OR NOT EXISTS ( SELECT 1 FROM storyboard_shot_characters AS shot_character WHERE shot_character.storyboard_shot_projection_id = shot_projection.id AND shot_character."order" = CAST(character_json.key AS INTEGER) + 1 AND shot_character.source_token = character_json.value AND ((NEW.schema_version = 1 AND ( (EXISTS ( SELECT 1 FROM characters AS resolved_character WHERE resolved_character.id = character_json.value AND resolved_character.project_id = NEW.project_id ) AND shot_character.character_id IS character_json.value) OR (NOT EXISTS ( SELECT 1 FROM characters AS legacy_character WHERE legacy_character.id = character_json.value AND legacy_character.project_id = NEW.project_id ) AND shot_character.character_id IS NULL) )) OR (NEW.schema_version = 2 AND EXISTS ( SELECT 1 FROM characters AS character WHERE character.id = shot_character.character_id AND character.project_id = NEW.project_id AND character.id = character_json.value ))) ) ) AND NOT EXISTS ( SELECT 1 FROM storyboard_shot_characters AS shot_character WHERE shot_character.storyboard_shot_projection_id = shot_projection.id AND NOT EXISTS ( SELECT 1 FROM json_each(shot_json.value, '$.characterIds') AS character_json WHERE shot_character."order" = CAST(character_json.key AS INTEGER) + 1 AND shot_character.source_token = character_json.value ) ) ) ) OR EXISTS ( SELECT 1 FROM storyboard_shot_projections AS shot_projection WHERE shot_projection.storyboard_version_id = NEW.id AND NOT EXISTS ( SELECT 1 FROM json_each(NEW.document_json, '$.shots') AS shot_json WHERE shot_projection.shot_id = json_extract(shot_json.value, '$.id') AND shot_projection."order" = CAST(shot_json.key AS INTEGER) + 1 ) ) )); END;

CREATE TRIGGER trg_storyboard_versions_scope_insert BEFORE INSERT ON storyboard_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_versions_scope_insert') WHERE NOT EXISTS ( SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.id = NEW.project_id ) OR (NEW.source_story_version_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM story_versions AS story WHERE story.id = NEW.source_story_version_id AND story.project_id = NEW.project_id AND story.chapter_id = NEW.chapter_id AND story.status = 'confirmed' )); END;

CREATE TRIGGER trg_storyboard_versions_scope_update BEFORE UPDATE ON storyboard_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_versions_scope_update') WHERE NOT EXISTS ( SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.id = NEW.project_id ) OR (NEW.source_story_version_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM story_versions AS story WHERE story.id = NEW.source_story_version_id AND story.project_id = NEW.project_id AND story.chapter_id = NEW.chapter_id AND story.status = 'confirmed' )); END;

CREATE TRIGGER trg_storyboard_versions_unconfirmed_insert BEFORE INSERT ON storyboard_versions WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_storyboard_versions_unconfirmed_insert') WHERE NEW.status <> 'pending_confirmation' OR NEW.confirmed_at IS NOT NULL OR NEW.archived_at IS NOT NULL; END;

CREATE TRIGGER trg_task_attempts_finish_materialize AFTER UPDATE ON task_attempts WHEN OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL AND NEW.outcome IS NOT NULL BEGIN UPDATE generation_tasks SET status = CASE WHEN NOT EXISTS ( SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active' ) THEN CASE WHEN NEW.outcome = 'cancelled' OR cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'failed' END WHEN NEW.outcome = 'succeeded' THEN 'succeeded' WHEN NEW.outcome = 'cancelled' THEN 'cancelled' WHEN NEW.outcome IN ('failed', 'interrupted') AND attempt < max_attempts AND next_run_at IS NOT NULL AND next_run_at > NEW.finished_at AND EXISTS (SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active') AND cancel_requested_at IS NULL THEN 'retrying' ELSE 'failed' END, finished_at = CASE WHEN NEW.outcome IN ('failed', 'interrupted') AND attempt < max_attempts AND next_run_at IS NOT NULL AND next_run_at > NEW.finished_at AND EXISTS (SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active') AND cancel_requested_at IS NULL THEN NULL ELSE NEW.finished_at END, next_run_at = CASE WHEN NEW.outcome IN ('failed', 'interrupted') AND attempt < max_attempts AND next_run_at IS NOT NULL AND next_run_at > NEW.finished_at AND EXISTS (SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active') AND cancel_requested_at IS NULL THEN next_run_at ELSE NULL END, lease_owner_id = NULL, lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL, updated_at = NEW.finished_at WHERE id = NEW.task_id AND status = 'running' AND attempt = NEW.attempt_no AND lease_token = NEW.claim_token; SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_finish_materialize') WHERE EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.status = 'running' ); UPDATE task_concurrency_slots SET task_id = NULL, lease_owner_id = NULL, claim_token = NULL, lease_expires_at = NULL, updated_at = NEW.finished_at WHERE task_id = NEW.task_id AND claim_token = NEW.claim_token; SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_finish_materialize') WHERE EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = NEW.task_id OR s.claim_token = NEW.claim_token ); END;

CREATE TRIGGER trg_task_attempts_finish_validate BEFORE UPDATE ON task_attempts WHEN OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL AND NEW.outcome IS NOT NULL BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_finish_validate') WHERE NOT EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = OLD.task_id AND t.record_kind = 'runtime' AND t.status = 'running' AND t.attempt = OLD.attempt_no AND t.lease_token = OLD.claim_token AND t.lease_owner_id = OLD.worker_id AND (t.concurrency_key IS NULL OR EXISTS ( SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = t.id AND s.claim_token = OLD.claim_token AND s.lease_owner_id = OLD.worker_id AND s.lease_expires_at = t.lease_expires_at )) ); SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_finish_validate') WHERE NEW.outcome = 'succeeded' AND ( NEW.error_json IS NOT NULL OR NEW.error_schema_version IS NOT NULL ); SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_finish_validate') WHERE NEW.outcome IN ('failed', 'interrupted') AND ( NEW.error_json IS NULL OR NEW.error_schema_version IS NULL ); SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_finish_validate') WHERE NEW.outcome = 'cancelled' AND NOT EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = OLD.task_id AND t.cancel_requested_at IS NOT NULL ); END;

CREATE TRIGGER trg_task_attempts_history_delete BEFORE DELETE ON task_attempts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_history_delete') WHERE NOT (EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = (SELECT project_id FROM generation_tasks WHERE id = OLD.task_id) AND pp.lifecycle_status = 'deleting') AND EXISTS ( SELECT 1 FROM outbox_events AS pe WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project' AND pe.aggregate_id = (SELECT project_id FROM generation_tasks WHERE id = OLD.task_id) AND pe.status = 'processed' ) AND NOT EXISTS ( SELECT 1 FROM generation_tasks AS pt WHERE pt.project_id = (SELECT project_id FROM generation_tasks WHERE id = OLD.task_id) AND pt.record_kind = 'runtime' AND pt.status IN ('queued', 'running', 'retrying') )); END;

CREATE TRIGGER trg_task_attempts_identity_immutable_update BEFORE UPDATE ON task_attempts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_identity_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.task_id IS NOT OLD.task_id OR NEW.attempt_no IS NOT OLD.attempt_no OR NEW.worker_id IS NOT OLD.worker_id OR NEW.claim_token IS NOT OLD.claim_token OR NEW.started_at IS NOT OLD.started_at OR NEW.created_at IS NOT OLD.created_at; END;

CREATE TRIGGER trg_task_attempts_runtime_task_insert BEFORE INSERT ON task_attempts WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_attempts_runtime_task_insert') WHERE NOT EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.record_kind = 'runtime' AND t.status = 'running' AND t.source_set_sealed_at IS NOT NULL AND t.attempt = NEW.attempt_no AND t.lease_owner_id = NEW.worker_id AND t.lease_token = NEW.claim_token AND t.heartbeat_at IS NEW.started_at AND NEW.created_at IS NEW.started_at AND NEW.outcome IS NULL AND NEW.finished_at IS NULL ); END;

CREATE TRIGGER trg_task_concurrency_slots_claim_matches_task_insert BEFORE INSERT ON task_concurrency_slots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_concurrency_slots_claim_matches_task_insert') WHERE NOT ((NEW.task_id IS NULL AND NEW.lease_owner_id IS NULL AND NEW.claim_token IS NULL AND NEW.lease_expires_at IS NULL) OR EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.record_kind = 'runtime' AND t.status = 'running' AND t.source_set_sealed_at IS NOT NULL AND t.concurrency_key = NEW.concurrency_key AND t.lease_owner_id = NEW.lease_owner_id AND t.lease_token = NEW.claim_token AND t.lease_expires_at = NEW.lease_expires_at )); END;

CREATE TRIGGER trg_task_concurrency_slots_claim_matches_task_update BEFORE UPDATE ON task_concurrency_slots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_concurrency_slots_claim_matches_task_update') WHERE NOT ((NEW.task_id IS NULL AND NEW.lease_owner_id IS NULL AND NEW.claim_token IS NULL AND NEW.lease_expires_at IS NULL) OR EXISTS ( SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.record_kind = 'runtime' AND t.status = 'running' AND t.source_set_sealed_at IS NOT NULL AND t.concurrency_key = NEW.concurrency_key AND t.lease_owner_id = NEW.lease_owner_id AND t.lease_token = NEW.claim_token AND t.lease_expires_at = NEW.lease_expires_at )); SELECT RAISE(ABORT, 'AIR_G1:trg_task_concurrency_slots_claim_matches_task_update') WHERE OLD.task_id IS NOT NULL AND NEW.task_id IS NULL AND NOT EXISTS ( SELECT 1 FROM task_attempts a JOIN generation_tasks t ON t.id = a.task_id WHERE a.task_id = OLD.task_id AND a.claim_token = OLD.claim_token AND a.finished_at IS NOT NULL AND t.status <> 'running' ); END;

CREATE TRIGGER trg_task_concurrency_slots_identity_immutable_update BEFORE UPDATE ON task_concurrency_slots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_concurrency_slots_identity_immutable_update') WHERE NEW.id IS NOT OLD.id OR NEW.concurrency_key IS NOT OLD.concurrency_key OR NEW.slot_no IS NOT OLD.slot_no; END;

CREATE TRIGGER trg_task_concurrency_slots_no_delete BEFORE DELETE ON task_concurrency_slots WHEN 1 BEGIN SELECT RAISE(ABORT, 'AIR_G1:trg_task_concurrency_slots_no_delete'); END;

CREATE TEMP TABLE "_g1_foreign_key_guard" (
  "violation_count" INTEGER NOT NULL,
  CONSTRAINT "ck_g1_foreign_key_guard_zero" CHECK ("violation_count" = 0)
);

INSERT OR ROLLBACK INTO "_g1_foreign_key_guard" ("violation_count") SELECT COUNT(*) FROM pragma_foreign_key_check;

DROP TABLE "_g1_foreign_key_guard";

COMMIT;

PRAGMA foreign_keys = ON;
