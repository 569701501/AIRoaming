import { readFile } from "node:fs/promises";
import path from "node:path";

export const G3_OVERLAY_MIGRATION_NAME =
  "0010_g3_comic_format_immutable" as const;
export const G3_OVERLAY_TRIGGER_NAME =
  "trg_g3_projects_comic_format_immutable" as const;
export const G3_OVERLAY_TRIGGER_NAMES = [G3_OVERLAY_TRIGGER_NAME] as const;
export const G3_OVERLAY_ERROR_TOKEN = "AIR_G3:COMIC_FORMAT_IMMUTABLE" as const;

export interface G3OverlaySqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

export interface G3OverlayInspection {
  readonly tables: readonly string[];
  readonly columns: readonly string[];
  readonly indexes: readonly string[];
  readonly checks: readonly string[];
  readonly triggers: readonly string[];
  readonly temporaryObjects: readonly string[];
}

export async function readG3OverlayMigrationSql(
  migrationRoot: string,
): Promise<string> {
  return readFile(
    path.join(migrationRoot, G3_OVERLAY_MIGRATION_NAME, "migration.sql"),
    "utf8",
  );
}

export function inspectG3OverlayV1(
  database: G3OverlaySqliteDatabase,
): G3OverlayInspection {
  const objects = database
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY type, name",
    )
    .all() as Array<{ type: string; name: string; sql: string | null }>;
  const temporaryObjects = database
    .prepare("SELECT type, name FROM sqlite_temp_master ORDER BY type, name")
    .all() as Array<{ type: string; name: string }>;
  return {
    tables: objects.filter((row) => row.type === "table").map((row) => row.name),
    columns: objects
      .filter((row) => row.type === "table")
      .map((row) => row.name + ":" + (row.sql ?? "")),
    indexes: objects.filter((row) => row.type === "index").map((row) => row.name),
    checks: objects
      .filter((row) => row.type === "table" && (row.sql ?? "").includes("CHECK"))
      .map((row) => row.name + ":" + (row.sql ?? "")),
    triggers: objects.filter((row) => row.type === "trigger").map((row) => row.name),
    temporaryObjects: temporaryObjects.map((row) => row.type + ":" + row.name),
  };
}

export function assertG3OverlayInspectionV1(
  before: G3OverlayInspection,
  after?: G3OverlayInspection,
): void {
  const inspection = after ?? before;
  const g3Triggers = inspection.triggers.filter((name) => name.startsWith("trg_g3_"));
  if (JSON.stringify(g3Triggers) !== JSON.stringify([...G3_OVERLAY_TRIGGER_NAMES])) {
    throw new Error("G3_OVERLAY_CONTRACT_TRIGGER_SET_INVALID");
  }
  if (inspection.temporaryObjects.length !== 0) {
    throw new Error("G3_OVERLAY_CONTRACT_TEMP_OBJECTS_REMAIN");
  }
  if (!after) return;
  if (JSON.stringify(after.tables) !== JSON.stringify(before.tables)) {
    throw new Error("G3_OVERLAY_CONTRACT_TABLES_CHANGED");
  }
  if (JSON.stringify(after.columns) !== JSON.stringify(before.columns)) {
    throw new Error("G3_OVERLAY_CONTRACT_COLUMNS_CHANGED");
  }
  if (JSON.stringify(after.indexes) !== JSON.stringify(before.indexes)) {
    throw new Error("G3_OVERLAY_CONTRACT_INDEXES_CHANGED");
  }
  if (JSON.stringify(after.checks) !== JSON.stringify(before.checks)) {
    throw new Error("G3_OVERLAY_CONTRACT_CHECKS_CHANGED");
  }
  const expectedTriggers = [...before.triggers, ...G3_OVERLAY_TRIGGER_NAMES].sort();
  if (JSON.stringify(after.triggers) !== JSON.stringify(expectedTriggers)) {
    throw new Error("G3_OVERLAY_CONTRACT_TRIGGER_SET_INVALID");
  }
  if (after.temporaryObjects.length !== 0) {
    throw new Error("G3_OVERLAY_CONTRACT_TEMP_OBJECTS_REMAIN");
  }
}

export function assertG3OverlaySqlShapeV1(sql: string): void {
  if ((sql.match(/CREATE TABLE /g) ?? []).length !== 0) {
    throw new Error("G3_OVERLAY_CONTRACT_TABLE_COUNT_INVALID");
  }
  if ((sql.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length !== 0) {
    throw new Error("G3_OVERLAY_CONTRACT_INDEX_COUNT_INVALID");
  }
  if ((sql.match(/CREATE TRIGGER /g) ?? []).length !== 1) {
    throw new Error("G3_OVERLAY_CONTRACT_TRIGGER_COUNT_INVALID");
  }
  if (!sql.includes('CREATE TRIGGER "' + G3_OVERLAY_TRIGGER_NAME + '"')) {
    throw new Error("G3_OVERLAY_CONTRACT_TRIGGER_MISSING");
  }
  if (!sql.includes('BEFORE UPDATE OF "comic_format" ON "projects"')) {
    throw new Error("G3_OVERLAY_CONTRACT_TRIGGER_EVENT_INVALID");
  }
  if (!sql.includes("RAISE(ABORT, '" + G3_OVERLAY_ERROR_TOKEN + "')")) {
    throw new Error("G3_OVERLAY_CONTRACT_ERROR_TOKEN_INVALID");
  }
  if (/\bWHEN\b|CREATE TEMP|CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|ADD COLUMN|PRAGMA\s+writable_schema/i.test(sql)) {
    throw new Error("G3_OVERLAY_CONTRACT_SQL_SHAPE_INVALID");
  }
}
