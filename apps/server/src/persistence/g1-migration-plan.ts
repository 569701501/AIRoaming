import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

import {
  assertG1PrismaForeignKeyContract,
  assertG1PrismaManifestCounts,
  assertG1PrismaSchemaMatchesManifestV1,
  g1PhysicalForeignKeyName,
  type G1PrismaManifest,
  type G1PrismaManifestField,
  type G1PrismaManifestForeignKey,
  type G1PrismaManifestIndex,
  type G1PrismaManifestModel,
} from "./g1-prisma-schema.js";
import { loadCurrentG1SchemaManifestV1 } from "./g1-schema-manifest-source.js";

export const G1_MIGRATION_ROOT = "apps/server/prisma/migrations" as const;

export const G1_MIGRATION_NAMES = [
  "0001_persistence_and_migration",
  "0002_project_chapter_script",
  "0003_story_storyboard_preflight",
  "0004_character_asset_candidate",
  "0005_dialogue_settings_secret_metadata",
  "0006_generation_task_worker",
  "0007_layout_export_outbox",
  "0008_sqlite_checks_triggers_indexes",
] as const;

export interface G1MigrationCheck {
  readonly ownerStage: string;
  readonly table: string;
  readonly name: string;
  readonly normalizedExpression: string;
}

export interface G1MigrationTrigger {
  readonly ownerStage: string;
  readonly table: string;
  readonly name: string;
  readonly timing: "BEFORE" | "AFTER";
  readonly event: "INSERT" | "UPDATE" | "DELETE";
  readonly updateColumns: readonly string[];
  readonly normalizedWhen: string;
  readonly normalizedBody: string;
  readonly normalizedSql: string;
}

export type G1MigrationManifest = Omit<G1PrismaManifest, "counts"> & {
  readonly manifestDigest: `sha256:${string}`;
  readonly status: string;
  readonly effectiveStage: string;
  readonly appliedOverlays: readonly string[];
  readonly completeness: {
    readonly ready: boolean;
    readonly issueCount: number;
  };
  readonly counts: G1PrismaManifest["counts"] & {
    readonly checks: number;
    readonly triggers: number;
  };
  readonly constraints: {
    readonly checks: readonly G1MigrationCheck[];
    readonly triggers: readonly G1MigrationTrigger[];
  };
};

export interface G1MigrationArtifactV1 {
  readonly path: string;
  readonly kind: "migration_lock" | "migration";
  readonly migrationName: (typeof G1_MIGRATION_NAMES)[number] | null;
  readonly bytes: string;
  readonly checksum: `sha256:${string}`;
}

export interface G1MigrationCopyMappingV1 {
  readonly table: string;
  readonly sourceColumns: readonly string[];
  readonly destinationColumns: readonly string[];
}

export interface G1MigrationPlanV1 {
  readonly schemaVersion: 1;
  readonly manifestDigest: `sha256:${string}`;
  readonly artifacts: readonly G1MigrationArtifactV1[];
  readonly copyMappings: readonly G1MigrationCopyMappingV1[];
  readonly counts: {
    readonly migrations: 8;
    readonly models: 44;
    readonly scalarFields: 556;
    readonly foreignKeys: 105;
    readonly uniqueConstraints: 70;
    readonly indexes: 60;
    readonly checks: 195;
    readonly triggers: 194;
    readonly rebuildTables: number;
    readonly copiedColumns: number;
  };
}

export interface G1FreshMigrationLedgerRowV1 {
  readonly migration_name: string;
  readonly checksum: string;
  readonly finished_at: unknown;
  readonly rolled_back_at: unknown;
  readonly logs: unknown;
  readonly applied_steps_count: number | bigint;
}

export interface G1SqliteStatementLike {
  all(...parameters: unknown[]): unknown[];
  get(...parameters: unknown[]): unknown;
}

export interface G1SqliteDatabaseLike {
  exec(sql: string): unknown;
  prepare(sql: string): G1SqliteStatementLike;
}

export interface G1SqliteDryVerificationV1 {
  readonly schemaVersion: 1;
  readonly sqliteMasterDigest: `sha256:${string}`;
  readonly models: 44;
  readonly scalarFields: 556;
  readonly primaryKeys: 44;
  readonly foreignKeys: 105;
  readonly uniqueConstraints: 70;
  readonly indexes: 60;
  readonly checks: 195;
  readonly triggers: 194;
  readonly integrityCheck: "ok";
  readonly foreignKeyViolationCount: 0;
  readonly failedLedgerCount: 0;
  readonly migrationChecksumStatus: "verified";
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function quoteIdentifier(value: string): string {
  invariant(value.length > 0, "G1_MIGRATION_IDENTIFIER_EMPTY");
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

function sqliteType(field: G1PrismaManifestField): string {
  switch (field.type) {
    case "String":
      return "TEXT";
    case "Int":
      return "INTEGER";
    case "DateTime":
      return "DATETIME";
    case "Json":
      return "JSONB";
    case "Boolean":
      return "BOOLEAN";
    case "Float":
      return "REAL";
  }
}

function sqliteDefault(field: G1PrismaManifestField): string | null {
  const value = field.default;
  if (value === null || value === "uuid()" || value === "@updatedAt") {
    return null;
  }
  if (value === "now()") return "CURRENT_TIMESTAMP";
  if (typeof value === "string") return quoteLiteral(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function renderColumn(field: G1PrismaManifestField): string {
  const parts = [quoteIdentifier(field.column), sqliteType(field)];
  if (!field.nullable) parts.push("NOT NULL");
  const defaultValue = sqliteDefault(field);
  if (defaultValue !== null) parts.push("DEFAULT", defaultValue);
  if (field.primaryKey) parts.push("PRIMARY KEY");
  return parts.join(" ");
}

const ACTION_SQL: Readonly<Record<string, string>> = {
  Cascade: "CASCADE",
  NoAction: "NO ACTION",
  Restrict: "RESTRICT",
  SetNull: "SET NULL",
};

function actionSql(value: string): string {
  const result = ACTION_SQL[value];
  invariant(result !== undefined, `G1_MIGRATION_UNKNOWN_FK_ACTION:${value}`);
  return result;
}

function renderForeignKey(foreignKey: G1PrismaManifestForeignKey): string {
  return [
    `CONSTRAINT ${quoteIdentifier(foreignKey.name)}`,
    `FOREIGN KEY (${foreignKey.localColumns.map(quoteIdentifier).join(", ")})`,
    `REFERENCES ${quoteIdentifier(foreignKey.targetTable)} (${foreignKey.targetColumns.map(quoteIdentifier).join(", ")})`,
    `ON DELETE ${actionSql(foreignKey.onDelete)}`,
    `ON UPDATE ${actionSql(foreignKey.onUpdate)}`,
  ].join(" ");
}

function renderCheck(check: G1MigrationCheck): string {
  return `CONSTRAINT ${quoteIdentifier(check.name)} CHECK (${check.normalizedExpression})`;
}

function renderCreateTable(
  model: G1PrismaManifestModel,
  tableName: string,
  checks: readonly G1MigrationCheck[],
): string {
  const definitions = [
    ...model.fields.map(renderColumn),
    ...model.foreignKeys.map(renderForeignKey),
    ...checks.map(renderCheck),
  ];
  return `CREATE TABLE ${quoteIdentifier(tableName)} (\n${definitions
    .map((definition) => `  ${definition}`)
    .join(",\n")}\n);`;
}

function renderUniqueIndex(
  model: G1PrismaManifestModel,
  unique: G1PrismaManifestModel["uniques"][number],
): string {
  return `CREATE UNIQUE INDEX ${quoteIdentifier(unique.name)} ON ${quoteIdentifier(model.table)} (${unique.columns
    .map((column) => `${quoteIdentifier(column)} ASC`)
    .join(", ")});`;
}

function renderIndex(
  model: G1PrismaManifestModel,
  index: G1PrismaManifestIndex,
): string {
  invariant(!index.unique, `G1_MIGRATION_INDEX_UNEXPECTED_UNIQUE:${index.name}`);
  return `CREATE INDEX ${quoteIdentifier(index.name)} ON ${quoteIdentifier(model.table)} (${index.columns
    .map(
      (column) =>
        `${quoteIdentifier(column.name)} ${column.direction === "DESC" ? "DESC" : "ASC"}`,
    )
    .join(", ")});`;
}

function renderIndexes(model: G1PrismaManifestModel): string[] {
  return [
    ...model.uniques.map((unique) => renderUniqueIndex(model, unique)),
    ...model.indexes.map((index) => renderIndex(model, index)),
  ];
}

function expectedTriggerSql(trigger: G1MigrationTrigger): string {
  const updateOf =
    trigger.event === "UPDATE" && trigger.updateColumns.length > 0
      ? ` OF ${trigger.updateColumns
          .map((column) =>
            column === "order" || column === "index"
              ? quoteIdentifier(column)
              : column,
          )
          .join(", ")}`
      : "";
  return [
    `CREATE TRIGGER ${trigger.name}`,
    `${trigger.timing} ${trigger.event}${updateOf} ON ${trigger.table}`,
    `WHEN ${trigger.normalizedWhen}`,
    `BEGIN ${trigger.normalizedBody}; END`,
  ].join(" ");
}

function assertUnique(values: readonly string[], code: string): void {
  invariant(new Set(values).size === values.length, code);
}

export function assertG1MigrationManifestV1(
  manifest: G1MigrationManifest,
): void {
  assertG1PrismaManifestCounts(manifest);
  assertG1PrismaForeignKeyContract(manifest);
  invariant(
    /^sha256:[0-9a-f]{64}$/.test(manifest.manifestDigest),
    "G1_MIGRATION_MANIFEST_DIGEST_INVALID",
  );
  invariant(
    manifest.status === "ready_for_materialization" &&
      manifest.effectiveStage === "G1" &&
      manifest.appliedOverlays.length === 0 &&
      manifest.completeness.ready === true &&
      manifest.completeness.issueCount === 0,
    "G1_MIGRATION_MANIFEST_NOT_READY_BASE_G1",
  );
  invariant(manifest.counts.checks === 195, "G1_MIGRATION_EXPECTED_195_CHECKS");
  invariant(
    manifest.counts.triggers === 194,
    "G1_MIGRATION_EXPECTED_194_TRIGGERS",
  );
  invariant(
    manifest.constraints.checks.length === 195,
    "G1_MIGRATION_CHECK_COUNT_MISMATCH",
  );
  invariant(
    manifest.constraints.triggers.length === 194,
    "G1_MIGRATION_TRIGGER_COUNT_MISMATCH",
  );

  const modelByTable = new Map(
    manifest.models.map((model) => [model.table, model] as const),
  );
  invariant(modelByTable.size === 44, "G1_MIGRATION_TABLE_COUNT_MISMATCH");
  const migrationNames = new Set<string>(G1_MIGRATION_NAMES.slice(0, 7));
  const physicalNames: string[] = [];

  for (const model of manifest.models) {
    invariant(
      migrationNames.has(model.migration),
      `G1_MIGRATION_MODEL_GROUP_INVALID:${model.model}:${model.migration}`,
    );
    invariant(
      model.fields.every((field) =>
        (field as G1PrismaManifestField & { migration?: string }).migration ===
        undefined
          ? true
          : (field as G1PrismaManifestField & { migration?: string }).migration ===
            model.migration,
      ),
      `G1_MIGRATION_FIELD_GROUP_DRIFT:${model.model}`,
    );
    assertUnique(
      model.fields.map((field) => field.column),
      `G1_MIGRATION_DUPLICATE_COLUMN:${model.table}`,
    );
    const columns = new Set(model.fields.map((field) => field.column));
    for (const unique of model.uniques) {
      invariant(
        unique.columns.length > 0 &&
          unique.columns.every((column) => columns.has(column)),
        `G1_MIGRATION_UNIQUE_COLUMN_INVALID:${model.table}:${unique.name}`,
      );
      physicalNames.push(unique.name);
    }
    for (const index of model.indexes) {
      invariant(
        index.columns.length > 0 &&
          index.columns.every((column) => columns.has(column.name)),
        `G1_MIGRATION_INDEX_COLUMN_INVALID:${model.table}:${index.name}`,
      );
      physicalNames.push(index.name);
    }
    for (const foreignKey of model.foreignKeys) {
      invariant(
        foreignKey.name ===
          g1PhysicalForeignKeyName(
            model.table,
            foreignKey.localColumns,
            foreignKey.targetTable,
          ),
        `G1_MIGRATION_FK_NAME_INVALID:${model.table}:${foreignKey.name}`,
      );
      physicalNames.push(foreignKey.name);
    }
  }

  const expectedGroupSizes = new Map<string, number>([
    ["0001_persistence_and_migration", 4],
    ["0002_project_chapter_script", 6],
    ["0003_story_storyboard_preflight", 10],
    ["0004_character_asset_candidate", 5],
    ["0005_dialogue_settings_secret_metadata", 9],
    ["0006_generation_task_worker", 4],
    ["0007_layout_export_outbox", 6],
  ]);
  for (const [migrationName, expectedSize] of expectedGroupSizes) {
    const actualSize = manifest.models.filter(
      (model) => model.migration === migrationName,
    ).length;
    invariant(
      actualSize === expectedSize,
      `G1_MIGRATION_MODEL_GROUP_SIZE:${migrationName}:${actualSize}:${expectedSize}`,
    );
  }

  for (const check of manifest.constraints.checks) {
    invariant(
      check.ownerStage === "G1" && modelByTable.has(check.table),
      `G1_MIGRATION_CHECK_OWNER_INVALID:${check.table}:${check.name}`,
    );
    invariant(
      check.name.startsWith("ck_") && check.normalizedExpression.trim().length > 0,
      `G1_MIGRATION_CHECK_INVALID:${check.table}:${check.name}`,
    );
    physicalNames.push(check.name);
  }
  for (const trigger of manifest.constraints.triggers) {
    invariant(
      trigger.ownerStage === "G1" && modelByTable.has(trigger.table),
      `G1_MIGRATION_TRIGGER_OWNER_INVALID:${trigger.table}:${trigger.name}`,
    );
    invariant(
      trigger.name.startsWith("trg_") &&
        normalizeSql(trigger.normalizedSql) ===
          normalizeSql(expectedTriggerSql(trigger)),
      `G1_MIGRATION_TRIGGER_SQL_INVALID:${trigger.table}:${trigger.name}`,
    );
    physicalNames.push(trigger.name);
  }
  assertUnique(physicalNames, "G1_MIGRATION_DUPLICATE_PHYSICAL_NAME");
}

function renderBaseMigration(
  manifest: G1MigrationManifest,
  migrationName: (typeof G1_MIGRATION_NAMES)[number],
): string {
  const models = manifest.models.filter(
    (model) => model.migration === migrationName,
  );
  invariant(models.length > 0, `G1_MIGRATION_EMPTY_GROUP:${migrationName}`);
  return `${[
    `-- G1 deterministic base migration: ${migrationName}`,
    "PRAGMA foreign_keys = ON;",
    "BEGIN IMMEDIATE;",
    ...models.map((model) => renderCreateTable(model, model.table, [])),
    ...models.flatMap(renderIndexes),
    "COMMIT;",
  ].join("\n\n")}\n`;
}

function renderFinalMigration(
  manifest: G1MigrationManifest,
): {
  readonly sql: string;
  readonly copyMappings: readonly G1MigrationCopyMappingV1[];
} {
  const checksByTable = new Map<string, G1MigrationCheck[]>();
  for (const check of manifest.constraints.checks) {
    const checks = checksByTable.get(check.table) ?? [];
    checks.push(check);
    checksByTable.set(check.table, checks);
  }
  const rebuildModels = manifest.models.filter(
    (model) => (checksByTable.get(model.table)?.length ?? 0) > 0,
  );
  const copyMappings = rebuildModels.map((model) => {
    const sourceColumns = model.fields.map((field) => field.column);
    const destinationColumns = model.fields.map((field) => field.column);
    invariant(
      sourceColumns.length === new Set(sourceColumns).size &&
        JSON.stringify(sourceColumns) === JSON.stringify(destinationColumns),
      `G1_MIGRATION_COPY_MAPPING_NOT_ONE_TO_ONE:${model.table}`,
    );
    return {
      table: model.table,
      sourceColumns,
      destinationColumns,
    };
  });

  const statements: string[] = [
    "-- G1 deterministic final SQLite CHECK/trigger/index rebuild",
    "PRAGMA foreign_keys = OFF;",
    `CREATE TEMP TABLE ${quoteIdentifier("_g1_foreign_key_mode_guard")} (\n  ${quoteIdentifier("enabled")} INTEGER NOT NULL,\n  CONSTRAINT ${quoteIdentifier("ck_g1_foreign_key_mode_guard_disabled")} CHECK (${quoteIdentifier("enabled")} = 0)\n);`,
    `INSERT OR ROLLBACK INTO ${quoteIdentifier("_g1_foreign_key_mode_guard")} (${quoteIdentifier("enabled")}) SELECT CASE WHEN COUNT(*) = 1 THEN MAX(foreign_keys) ELSE -1 END FROM pragma_foreign_keys;`,
    `DROP TABLE ${quoteIdentifier("_g1_foreign_key_mode_guard")};`,
    "BEGIN IMMEDIATE;",
    `CREATE TEMP TABLE ${quoteIdentifier("_g1_rebuild_row_guard")} (\n  ${quoteIdentifier("table_name")} TEXT NOT NULL,\n  ${quoteIdentifier("before_count")} INTEGER NOT NULL,\n  ${quoteIdentifier("after_count")} INTEGER NOT NULL,\n  ${quoteIdentifier("difference_count")} INTEGER NOT NULL,\n  CONSTRAINT ${quoteIdentifier("ck_g1_rebuild_row_guard_count_equal")} CHECK (${quoteIdentifier("before_count")} = ${quoteIdentifier("after_count")}),\n  CONSTRAINT ${quoteIdentifier("ck_g1_rebuild_row_guard_value_equal")} CHECK (${quoteIdentifier("difference_count")} = 0)\n);`,
  ];

  for (const [index, model] of rebuildModels.entries()) {
    const mapping = copyMappings[index];
    invariant(mapping !== undefined, `G1_MIGRATION_COPY_MAPPING_MISSING:${model.table}`);
    const temporaryTable = `${model.table}__g1_new`;
    const destination = mapping.destinationColumns.map(quoteIdentifier).join(", ");
    const source = mapping.sourceColumns.map(quoteIdentifier).join(", ");
    statements.push(
      renderCreateTable(
        model,
        temporaryTable,
        checksByTable.get(model.table) ?? [],
      ),
      `INSERT INTO ${quoteIdentifier(temporaryTable)} (${destination}) SELECT ${source} FROM ${quoteIdentifier(model.table)};`,
      `INSERT OR ROLLBACK INTO ${quoteIdentifier("_g1_rebuild_row_guard")} (${quoteIdentifier("table_name")}, ${quoteIdentifier("before_count")}, ${quoteIdentifier("after_count")}, ${quoteIdentifier("difference_count")}) SELECT ${quoteLiteral(model.table)}, (SELECT COUNT(*) FROM ${quoteIdentifier(model.table)}), (SELECT COUNT(*) FROM ${quoteIdentifier(temporaryTable)}), (SELECT COUNT(*) FROM (SELECT ${source} FROM ${quoteIdentifier(model.table)} EXCEPT SELECT ${destination} FROM ${quoteIdentifier(temporaryTable)})) + (SELECT COUNT(*) FROM (SELECT ${destination} FROM ${quoteIdentifier(temporaryTable)} EXCEPT SELECT ${source} FROM ${quoteIdentifier(model.table)}));`,
      `DROP TABLE ${quoteIdentifier(model.table)};`,
      `ALTER TABLE ${quoteIdentifier(temporaryTable)} RENAME TO ${quoteIdentifier(model.table)};`,
      ...renderIndexes(model),
    );
  }

  statements.push(
    `DROP TABLE ${quoteIdentifier("_g1_rebuild_row_guard")};`,
    ...manifest.constraints.triggers.map((trigger) => `${trigger.normalizedSql};`),
    `CREATE TEMP TABLE ${quoteIdentifier("_g1_foreign_key_guard")} (\n  ${quoteIdentifier("violation_count")} INTEGER NOT NULL,\n  CONSTRAINT ${quoteIdentifier("ck_g1_foreign_key_guard_zero")} CHECK (${quoteIdentifier("violation_count")} = 0)\n);`,
    `INSERT OR ROLLBACK INTO ${quoteIdentifier("_g1_foreign_key_guard")} (${quoteIdentifier("violation_count")}) SELECT COUNT(*) FROM pragma_foreign_key_check;`,
    `DROP TABLE ${quoteIdentifier("_g1_foreign_key_guard")};`,
    "COMMIT;",
    "PRAGMA foreign_keys = ON;",
  );
  return { sql: `${statements.join("\n\n")}\n`, copyMappings };
}

function renderArtifacts(manifest: G1MigrationManifest): {
  readonly artifacts: readonly G1MigrationArtifactV1[];
  readonly copyMappings: readonly G1MigrationCopyMappingV1[];
} {
  const finalMigration = renderFinalMigration(manifest);
  const rawArtifacts: Omit<G1MigrationArtifactV1, "checksum">[] = [
    {
      path: `${G1_MIGRATION_ROOT}/migration_lock.toml`,
      kind: "migration_lock",
      migrationName: null,
      bytes: 'provider = "sqlite"\n',
    },
    ...G1_MIGRATION_NAMES.map((migrationName) => ({
      path: `${G1_MIGRATION_ROOT}/${migrationName}/migration.sql`,
      kind: "migration" as const,
      migrationName,
      bytes:
        migrationName === "0008_sqlite_checks_triggers_indexes"
          ? finalMigration.sql
          : renderBaseMigration(manifest, migrationName),
    })),
  ];
  return {
    artifacts: rawArtifacts.map((artifact) => ({
      ...artifact,
      checksum: sha256(artifact.bytes),
    })),
    copyMappings: finalMigration.copyMappings,
  };
}

export function buildG1MigrationPlanV1(
  manifest: G1MigrationManifest,
): G1MigrationPlanV1 {
  assertG1MigrationManifestV1(manifest);
  const rendered = renderArtifacts(manifest);
  const copiedColumns = rendered.copyMappings.reduce(
    (sum, mapping) => sum + mapping.sourceColumns.length,
    0,
  );
  const plan: G1MigrationPlanV1 = {
    schemaVersion: 1,
    manifestDigest: manifest.manifestDigest,
    artifacts: rendered.artifacts,
    copyMappings: rendered.copyMappings,
    counts: {
      migrations: 8,
      models: 44,
      scalarFields: 556,
      foreignKeys: 105,
      uniqueConstraints: 70,
      indexes: 60,
      checks: 195,
      triggers: 194,
      rebuildTables: rendered.copyMappings.length,
      copiedColumns,
    },
  };
  assertG1MigrationPlanV1(manifest, plan);
  return plan;
}

export function assertG1MigrationPlanV1(
  manifest: G1MigrationManifest,
  plan: G1MigrationPlanV1,
): void {
  assertG1MigrationManifestV1(manifest);
  invariant(plan.schemaVersion === 1, "G1_MIGRATION_PLAN_VERSION_INVALID");
  invariant(
    plan.manifestDigest === manifest.manifestDigest,
    "G1_MIGRATION_PLAN_MANIFEST_MISMATCH",
  );
  const expected = renderArtifacts(manifest);
  invariant(
    plan.artifacts.length === expected.artifacts.length,
    "G1_MIGRATION_PLAN_ARTIFACT_COUNT_MISMATCH",
  );
  for (const [index, artifact] of plan.artifacts.entries()) {
    const expectedArtifact = expected.artifacts[index];
    invariant(
      expectedArtifact !== undefined &&
        artifact.path === expectedArtifact.path &&
        artifact.kind === expectedArtifact.kind &&
        artifact.migrationName === expectedArtifact.migrationName &&
        artifact.bytes === expectedArtifact.bytes &&
        artifact.checksum === expectedArtifact.checksum &&
        artifact.checksum === sha256(artifact.bytes),
      `G1_MIGRATION_PLAN_ARTIFACT_DRIFT:${artifact.path}`,
    );
  }
  invariant(
    JSON.stringify(plan.copyMappings) === JSON.stringify(expected.copyMappings),
    "G1_MIGRATION_PLAN_COPY_MAPPING_DRIFT",
  );
  for (const mapping of plan.copyMappings) {
    invariant(
      mapping.sourceColumns.length === mapping.destinationColumns.length &&
        mapping.sourceColumns.length === new Set(mapping.sourceColumns).size &&
        JSON.stringify(mapping.sourceColumns) ===
          JSON.stringify(mapping.destinationColumns),
      `G1_MIGRATION_COPY_MAPPING_NOT_ONE_TO_ONE:${mapping.table}`,
    );
  }
  invariant(
    plan.counts.migrations === 8 &&
      plan.counts.models === 44 &&
      plan.counts.scalarFields === 556 &&
      plan.counts.foreignKeys === 105 &&
      plan.counts.uniqueConstraints === 70 &&
      plan.counts.indexes === 60 &&
      plan.counts.checks === 195 &&
      plan.counts.triggers === 194 &&
      plan.counts.rebuildTables === expected.copyMappings.length &&
      plan.counts.copiedColumns ===
        expected.copyMappings.reduce(
          (sum, mapping) => sum + mapping.sourceColumns.length,
          0,
        ),
    "G1_MIGRATION_PLAN_COUNT_DRIFT",
  );
}

function migrationArtifacts(
  plan: G1MigrationPlanV1,
): readonly G1MigrationArtifactV1[] {
  return plan.artifacts.filter((artifact) => artifact.kind === "migration");
}

export function assertG1FreshMigrationLedgerV1(
  plan: G1MigrationPlanV1,
  rows: readonly G1FreshMigrationLedgerRowV1[],
): void {
  const migrations = migrationArtifacts(plan);
  invariant(
    rows.length === migrations.length,
    `G1_MIGRATION_LEDGER_COUNT_MISMATCH:${rows.length}:${migrations.length}`,
  );
  const rowsByName = new Map(rows.map((row) => [row.migration_name, row]));
  invariant(
    rowsByName.size === rows.length,
    "G1_MIGRATION_LEDGER_DUPLICATE_NAME",
  );
  for (const artifact of migrations) {
    invariant(artifact.migrationName !== null, "G1_MIGRATION_LEDGER_NAME_MISSING");
    const row = rowsByName.get(artifact.migrationName);
    invariant(
      row !== undefined,
      `G1_MIGRATION_LEDGER_MISSING:${artifact.migrationName}`,
    );
    invariant(
      row.checksum === artifact.checksum.slice("sha256:".length),
      `G1_MIGRATION_LEDGER_CHECKSUM_MISMATCH:${artifact.migrationName}`,
    );
    invariant(
      row.finished_at !== null &&
        row.finished_at !== undefined &&
        row.rolled_back_at === null &&
        (row.logs === null || row.logs === "") &&
        Number(row.applied_steps_count) === 1,
      `G1_MIGRATION_LEDGER_FAILED:${artifact.migrationName}`,
    );
  }
}

function rows(statementRows: unknown[]): Record<string, unknown>[] {
  return statementRows as Record<string, unknown>[];
}

function queryAll(
  database: G1SqliteDatabaseLike,
  sql: string,
): Record<string, unknown>[] {
  return rows(database.prepare(sql).all());
}

function queryGet(
  database: G1SqliteDatabaseLike,
  sql: string,
): Record<string, unknown> {
  const value = database.prepare(sql).get();
  invariant(value !== undefined, `G1_MIGRATION_SQLITE_ROW_MISSING:${sql}`);
  return value as Record<string, unknown>;
}

function quotedPragma(name: string, table: string): string {
  return `PRAGMA ${name}(${quoteLiteral(table)})`;
}

function assertColumnInventory(
  database: G1SqliteDatabaseLike,
  manifest: G1MigrationManifest,
): void {
  for (const model of manifest.models) {
    const tableInfo = queryAll(
      database,
      quotedPragma("table_info", model.table),
    );
    invariant(
      tableInfo.length === model.fields.length,
      `G1_MIGRATION_SQLITE_COLUMN_COUNT:${model.table}`,
    );
    for (const [index, field] of model.fields.entries()) {
      const actual = tableInfo[index];
      invariant(
        actual !== undefined &&
          Number(actual.cid) === index &&
          actual.name === field.column &&
          actual.type === sqliteType(field) &&
          Number(actual.notnull) === (field.nullable ? 0 : 1) &&
          Number(actual.pk) === (field.primaryKey ? 1 : 0) &&
          (actual.dflt_value ?? null) === sqliteDefault(field),
        `G1_MIGRATION_SQLITE_COLUMN_DRIFT:${model.table}:${field.column}`,
      );
    }
  }
}

function assertForeignKeyInventory(
  database: G1SqliteDatabaseLike,
  manifest: G1MigrationManifest,
  tableSqlByName: ReadonlyMap<string, string>,
): void {
  let count = 0;
  for (const model of manifest.models) {
    const tableSql = tableSqlByName.get(model.table) ?? "";
    const pragma = queryAll(
      database,
      quotedPragma("foreign_key_list", model.table),
    );
    const groups = new Map<number, Record<string, unknown>[]>();
    for (const row of pragma) {
      const id = Number(row.id);
      const group = groups.get(id) ?? [];
      group.push(row);
      groups.set(id, group);
    }
    invariant(
      groups.size === model.foreignKeys.length,
      `G1_MIGRATION_SQLITE_FK_COUNT:${model.table}`,
    );
    for (const foreignKey of model.foreignKeys) {
      const fragment = renderForeignKey(foreignKey);
      invariant(
        normalizeSql(tableSql).includes(normalizeSql(fragment)),
        `G1_MIGRATION_SQLITE_FK_NAME_OR_SQL_DRIFT:${model.table}:${foreignKey.name}`,
      );
      const matches = [...groups.values()].filter((group) => {
        const ordered = [...group].sort(
          (left, right) => Number(left.seq) - Number(right.seq),
        );
        return (
          ordered[0]?.table === foreignKey.targetTable &&
          JSON.stringify(ordered.map((row) => row.from)) ===
            JSON.stringify(foreignKey.localColumns) &&
          JSON.stringify(ordered.map((row) => row.to)) ===
            JSON.stringify(foreignKey.targetColumns) &&
          ordered.every(
            (row) =>
              row.on_delete === actionSql(foreignKey.onDelete) &&
              row.on_update === actionSql(foreignKey.onUpdate),
          )
        );
      });
      invariant(
        matches.length === 1,
        `G1_MIGRATION_SQLITE_FK_SEMANTIC_DRIFT:${model.table}:${foreignKey.name}`,
      );
      count += 1;
    }
  }
  invariant(count === 105, `G1_MIGRATION_SQLITE_FK_TOTAL:${count}`);
}

function assertIndexInventory(
  database: G1SqliteDatabaseLike,
  manifest: G1MigrationManifest,
): void {
  const expectedNames = new Set<string>();
  let uniqueCount = 0;
  let indexCount = 0;
  for (const model of manifest.models) {
    const expected = [
      ...model.uniques.map((unique) => ({
        name: unique.name,
        unique: 1,
        columns: unique.columns.map((name) => ({ name, desc: 0 })),
      })),
      ...model.indexes.map((index) => ({
        name: index.name,
        unique: 0,
        columns: index.columns.map((column) => ({
          name: column.name,
          desc: column.direction === "DESC" ? 1 : 0,
        })),
      })),
    ];
    const list = queryAll(database, quotedPragma("index_list", model.table));
    const listByName = new Map(list.map((row) => [String(row.name), row]));
    const explicitlyCreated = list.filter((row) => row.origin === "c");
    invariant(
      explicitlyCreated.length === expected.length &&
        explicitlyCreated.every((row) =>
          expected.some((item) => item.name === String(row.name)),
        ),
      `G1_MIGRATION_SQLITE_INDEX_INVENTORY:${model.table}`,
    );
    for (const item of expected) {
      invariant(!expectedNames.has(item.name), `G1_MIGRATION_SQLITE_INDEX_DUPLICATE:${item.name}`);
      expectedNames.add(item.name);
      const actual = listByName.get(item.name);
      invariant(
        actual !== undefined && Number(actual.unique) === item.unique,
        `G1_MIGRATION_SQLITE_INDEX_MISSING:${model.table}:${item.name}`,
      );
      const columns = queryAll(
        database,
        quotedPragma("index_xinfo", item.name),
      )
        .filter((row) => Number(row.key) === 1)
        .sort((left, right) => Number(left.seqno) - Number(right.seqno))
        .map((row) => ({ name: row.name, desc: Number(row.desc) }));
      invariant(
        JSON.stringify(columns) === JSON.stringify(item.columns),
        `G1_MIGRATION_SQLITE_INDEX_COLUMNS:${model.table}:${item.name}`,
      );
      if (item.unique === 1) uniqueCount += 1;
      else indexCount += 1;
    }
  }
  invariant(uniqueCount === 70, `G1_MIGRATION_SQLITE_UNIQUE_TOTAL:${uniqueCount}`);
  invariant(indexCount === 60, `G1_MIGRATION_SQLITE_INDEX_TOTAL:${indexCount}`);
}

export function verifyG1SqliteDryDatabaseV1(
  database: G1SqliteDatabaseLike,
  manifest: G1MigrationManifest,
  plan: G1MigrationPlanV1,
): G1SqliteDryVerificationV1 {
  assertG1MigrationPlanV1(manifest, plan);
  database.exec("PRAGMA foreign_keys = ON;");
  const enabledForeignKeys = queryGet(database, "PRAGMA foreign_keys");
  invariant(
    Number(Object.values(enabledForeignKeys)[0]) === 1,
    "G1_MIGRATION_SQLITE_FOREIGN_KEYS_DISABLED",
  );
  const masterRows = queryAll(
    database,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
  );
  const authorityRows = masterRows.filter(
    (row) => row.name !== "_prisma_migrations",
  );
  const tableRows = authorityRows.filter((row) => row.type === "table");
  const expectedTables = new Set(manifest.models.map((model) => model.table));
  invariant(
    tableRows.length === 44 &&
      tableRows.every((row) => expectedTables.has(String(row.name))),
    "G1_MIGRATION_SQLITE_TABLE_INVENTORY",
  );
  const tableSqlByName = new Map(
    tableRows.map((row) => [String(row.name), String(row.sql ?? "")] as const),
  );
  const indexRows = authorityRows.filter((row) => row.type === "index");
  invariant(
    authorityRows.every(
      (row) => row.type === "table" || row.type === "index" || row.type === "trigger",
    ) && indexRows.length === 130,
    "G1_MIGRATION_SQLITE_AUTHORITY_OBJECT_INVENTORY",
  );

  assertColumnInventory(database, manifest);
  assertForeignKeyInventory(database, manifest, tableSqlByName);
  assertIndexInventory(database, manifest);

  let checkCount = 0;
  const expectedCheckCountsByTable = new Map<string, number>();
  for (const check of manifest.constraints.checks) {
    const tableSql = tableSqlByName.get(check.table) ?? "";
    invariant(
      normalizeSql(tableSql).includes(normalizeSql(renderCheck(check))),
      `G1_MIGRATION_SQLITE_CHECK_DRIFT:${check.table}:${check.name}`,
    );
    expectedCheckCountsByTable.set(
      check.table,
      (expectedCheckCountsByTable.get(check.table) ?? 0) + 1,
    );
    checkCount += 1;
  }
  invariant(checkCount === 195, `G1_MIGRATION_SQLITE_CHECK_TOTAL:${checkCount}`);
  for (const model of manifest.models) {
    const tableSql = tableSqlByName.get(model.table) ?? "";
    const actualCount = tableSql.match(/\bCHECK\s*\(/gi)?.length ?? 0;
    invariant(
      actualCount === (expectedCheckCountsByTable.get(model.table) ?? 0),
      `G1_MIGRATION_SQLITE_CHECK_INVENTORY:${model.table}:${actualCount}`,
    );
  }

  const triggerRows = authorityRows.filter((row) => row.type === "trigger");
  const triggerByName = new Map(
    triggerRows.map((row) => [String(row.name), String(row.sql ?? "")] as const),
  );
  invariant(triggerByName.size === 194, "G1_MIGRATION_SQLITE_TRIGGER_TOTAL");
  for (const trigger of manifest.constraints.triggers) {
    invariant(
      normalizeSql(triggerByName.get(trigger.name) ?? "") ===
        normalizeSql(trigger.normalizedSql),
      `G1_MIGRATION_SQLITE_TRIGGER_DRIFT:${trigger.table}:${trigger.name}`,
    );
  }

  const integrityRows = queryAll(database, "PRAGMA integrity_check");
  invariant(
    integrityRows.length === 1 &&
      Object.values(integrityRows[0] ?? {})[0] === "ok",
    "G1_MIGRATION_SQLITE_INTEGRITY_FAILED",
  );
  const foreignKeyRows = queryAll(database, "PRAGMA foreign_key_check");
  invariant(
    foreignKeyRows.length === 0,
    `G1_MIGRATION_SQLITE_FOREIGN_KEY_VIOLATIONS:${foreignKeyRows.length}`,
  );
  const foreignKeys = queryGet(database, "PRAGMA foreign_keys");
  invariant(
    Number(Object.values(foreignKeys)[0]) === 1,
    "G1_MIGRATION_SQLITE_FOREIGN_KEYS_DISABLED",
  );

  const ledgerRows = queryAll(
    database,
    'SELECT migration_name, checksum, finished_at, rolled_back_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at, migration_name',
  ) as unknown as G1FreshMigrationLedgerRowV1[];
  assertG1FreshMigrationLedgerV1(plan, ledgerRows);

  const digestFacts = authorityRows.map((row) => ({
    type: row.type,
    name: row.name,
    table: row.tbl_name,
    sql: row.sql === null ? null : normalizeSql(String(row.sql)),
  }));
  return {
    schemaVersion: 1,
    sqliteMasterDigest: sha256(JSON.stringify(digestFacts)),
    models: 44,
    scalarFields: 556,
    primaryKeys: 44,
    foreignKeys: 105,
    uniqueConstraints: 70,
    indexes: 60,
    checks: 195,
    triggers: 194,
    integrityCheck: "ok",
    foreignKeyViolationCount: 0,
    failedLedgerCount: 0,
    migrationChecksumStatus: "verified",
  };
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await lstat(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function requiredLstat(value: string, code: string) {
  try {
    return await lstat(value, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${code}:MISSING`);
    }
    throw error;
  }
}

async function assertExactArtifactFile(
  filePath: string,
  artifact: G1MigrationArtifactV1,
): Promise<void> {
  const pathBefore = await requiredLstat(
    filePath,
    `G1_MIGRATION_ARTIFACT_FILE_INVALID:${artifact.path}`,
  );
  invariant(
    pathBefore.isFile() && !pathBefore.isSymbolicLink() && pathBefore.nlink === 1n,
    `G1_MIGRATION_ARTIFACT_FILE_INVALID:${artifact.path}`,
  );
  const handle = await open(filePath, "r");
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat({ bigint: true });
    const pathAfter = await requiredLstat(
      filePath,
      `G1_MIGRATION_ARTIFACT_FILE_INVALID:${artifact.path}`,
    );
    invariant(
      before.isFile() &&
        before.nlink === 1n &&
        before.dev === pathBefore.dev &&
        before.ino === pathBefore.ino &&
        after.dev === before.dev &&
        after.ino === before.ino &&
        after.size === before.size &&
        after.mtimeNs === before.mtimeNs &&
        after.nlink === 1n &&
        pathAfter.dev === before.dev &&
        pathAfter.ino === before.ino &&
        pathAfter.size === before.size &&
        pathAfter.mtimeNs === before.mtimeNs &&
        pathAfter.nlink === 1n,
      `G1_MIGRATION_ARTIFACT_FILE_CHANGED:${artifact.path}`,
    );
    invariant(
      bytes === artifact.bytes &&
        sha256(bytes) === artifact.checksum &&
        BigInt(Buffer.byteLength(bytes, "utf8")) === before.size,
      `G1_MIGRATION_ARTIFACT_BYTES_DRIFT:${artifact.path}`,
    );
  } finally {
    await handle.close();
  }
}

export async function assertG1MigrationArtifactTreeV1(
  outputRoot: string,
  plan: G1MigrationPlanV1,
): Promise<void> {
  invariant(plan.artifacts.length === 9, "G1_MIGRATION_ARTIFACT_TREE_PLAN_COUNT");
  const rootFacts = await requiredLstat(
    outputRoot,
    "G1_MIGRATION_ARTIFACT_ROOT_INVALID",
  );
  invariant(
    rootFacts.isDirectory() && !rootFacts.isSymbolicLink(),
    "G1_MIGRATION_ARTIFACT_ROOT_INVALID",
  );
  const expectedRootEntries = ["migration_lock.toml", ...G1_MIGRATION_NAMES].sort();
  const rootEntries = (await readdir(outputRoot)).sort();
  invariant(
    JSON.stringify(rootEntries) === JSON.stringify(expectedRootEntries),
    "G1_MIGRATION_ARTIFACT_ROOT_ENTRIES",
  );

  for (const migrationName of G1_MIGRATION_NAMES) {
    const directory = path.join(outputRoot, migrationName);
    const facts = await requiredLstat(
      directory,
      `G1_MIGRATION_ARTIFACT_DIRECTORY_INVALID:${migrationName}`,
    );
    invariant(
      facts.isDirectory() && !facts.isSymbolicLink(),
      `G1_MIGRATION_ARTIFACT_DIRECTORY_INVALID:${migrationName}`,
    );
    invariant(
      JSON.stringify((await readdir(directory)).sort()) ===
        JSON.stringify(["migration.sql"]),
      `G1_MIGRATION_ARTIFACT_DIRECTORY_ENTRIES:${migrationName}`,
    );
  }

  for (const artifact of plan.artifacts) {
    const relative = path.posix.relative(G1_MIGRATION_ROOT, artifact.path);
    invariant(
      relative.length > 0 &&
        !relative.startsWith("../") &&
        !path.posix.isAbsolute(relative),
      `G1_MIGRATION_ARTIFACT_PATH_ESCAPE:${artifact.path}`,
    );
    await assertExactArtifactFile(
      path.join(outputRoot, ...relative.split("/")),
      artifact,
    );
  }
}

async function loadCurrentMigrationInputs(canonicalRoot: string): Promise<{
  readonly manifest: G1MigrationManifest;
  readonly plan: G1MigrationPlanV1;
}> {
  const [current, currentSchema] = await Promise.all([
    loadCurrentG1SchemaManifestV1(canonicalRoot),
    readFile(
      path.join(canonicalRoot, "apps/server/prisma/schema.prisma"),
      "utf8",
    ),
  ]);
  const manifest = current.manifest as G1MigrationManifest;
  assertG1PrismaSchemaMatchesManifestV1(manifest, currentSchema);
  return { manifest, plan: buildG1MigrationPlanV1(manifest) };
}

function assertSameMigrationIdentity(
  first: Awaited<ReturnType<typeof loadCurrentMigrationInputs>>,
  final: Awaited<ReturnType<typeof loadCurrentMigrationInputs>>,
): void {
  invariant(
    final.manifest.manifestDigest === first.manifest.manifestDigest &&
      JSON.stringify(final.plan.artifacts) === JSON.stringify(first.plan.artifacts),
    "G1_MIGRATION_INPUTS_CHANGED_DURING_CHECK",
  );
}

export async function checkG1MigrationArtifactTreeV1(
  workspaceRoot: string,
): Promise<G1MigrationPlanV1> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const first = await loadCurrentMigrationInputs(canonicalRoot);
  const outputRoot = path.join(canonicalRoot, G1_MIGRATION_ROOT);
  await assertG1MigrationArtifactTreeV1(outputRoot, first.plan);
  const final = await loadCurrentMigrationInputs(canonicalRoot);
  assertSameMigrationIdentity(first, final);
  await assertG1MigrationArtifactTreeV1(outputRoot, final.plan);
  return first.plan;
}

export async function writeG1MigrationPlanV1(
  workspaceRoot: string,
): Promise<G1MigrationPlanV1> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const first = await loadCurrentMigrationInputs(canonicalRoot);
  const plan = first.plan;

  const prismaRoot = path.join(canonicalRoot, "apps/server/prisma");
  const outputRoot = path.join(canonicalRoot, G1_MIGRATION_ROOT);
  invariant(!(await pathExists(outputRoot)), "G1_MIGRATION_OUTPUT_ALREADY_EXISTS");
  const stageRoot = path.join(
    prismaRoot,
    `.g1-migrations-stage-${randomUUID()}`,
  );
  let committed = false;
  try {
    await mkdir(stageRoot, { recursive: false });
    const directories = new Set<string>([stageRoot]);
    for (const artifact of plan.artifacts) {
      const relative = path.posix.relative(G1_MIGRATION_ROOT, artifact.path);
      invariant(
        relative.length > 0 &&
          !relative.startsWith("../") &&
          !path.posix.isAbsolute(relative),
        `G1_MIGRATION_ARTIFACT_PATH_ESCAPE:${artifact.path}`,
      );
      const destination = path.join(stageRoot, ...relative.split("/"));
      const directory = path.dirname(destination);
      await mkdir(directory, { recursive: true });
      directories.add(directory);
      const handle = await open(destination, "wx", 0o600);
      try {
        await handle.writeFile(artifact.bytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
      await syncDirectory(directory);
    }

    const final = await loadCurrentMigrationInputs(canonicalRoot);
    assertSameMigrationIdentity(first, final);
    await assertG1MigrationArtifactTreeV1(stageRoot, plan);
    invariant(!(await pathExists(outputRoot)), "G1_MIGRATION_OUTPUT_RACED");
    await rename(stageRoot, outputRoot);
    committed = true;
    await syncDirectory(prismaRoot);
    await assertG1MigrationArtifactTreeV1(outputRoot, plan);
    return plan;
  } finally {
    if (!committed) {
      invariant(
        path.dirname(stageRoot) === prismaRoot &&
          path.basename(stageRoot).startsWith(".g1-migrations-stage-"),
        "G1_MIGRATION_STAGE_CLEANUP_BOUNDARY",
      );
      await rm(stageRoot, { recursive: true, force: true });
    }
  }
}
