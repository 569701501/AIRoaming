-- G1 deterministic base migration: 0001_persistence_and_migration

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE "persistence_states" (
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
  CONSTRAINT "fk_persistence_states_cutover_run_id__migration_runs" FOREIGN KEY ("cutover_run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "migration_runs" (
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
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "imported_entity_sources" (
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
  CONSTRAINT "fk_imported_entity_sources_last_run_id__migration_runs" FOREIGN KEY ("last_run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "migration_issues" (
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
  CONSTRAINT "fk_migration_issues_run_id__migration_runs" FOREIGN KEY ("run_id") REFERENCES "migration_runs" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "ix_migration_runs_status_started_at" ON "migration_runs" ("status" ASC, "started_at" ASC);

CREATE UNIQUE INDEX "uq_imported_entity_sources_source_key" ON "imported_entity_sources" ("source_key" ASC);

CREATE INDEX "ix_imported_entity_sources_entity" ON "imported_entity_sources" ("entity_type" ASC, "entity_id" ASC);

CREATE INDEX "ix_imported_entity_sources_last_run" ON "imported_entity_sources" ("last_run_id" ASC);

CREATE UNIQUE INDEX "uq_migration_issues_run_issue_key" ON "migration_issues" ("run_id" ASC, "issue_key" ASC);

CREATE INDEX "ix_migration_issues_code" ON "migration_issues" ("code" ASC);

CREATE INDEX "ix_migration_issues_run_severity" ON "migration_issues" ("run_id" ASC, "severity" ASC);

COMMIT;
