import { readFile } from "node:fs/promises";
import path from "node:path";

export const G2_OVERLAY_MIGRATION_NAME =
  "0009_g2_version_freshness_overlay" as const;

export const G2_OVERLAY_INDEX_NAMES = [
  "uq_g2_story_versions_active_pending_chapter",
  "uq_g2_storyboard_versions_active_pending_chapter",
] as const;

export const G2_OVERLAY_TRIGGER_NAMES = [
  "trg_g2_chapters_script_working_shape_insert",
  "trg_g2_chapters_script_working_shape_update",
  "trg_g2_chapters_command_row_version_update",
  "trg_g2_chapters_current_source_update",
  "trg_g2_story_versions_pending_v2_insert",
  "trg_g2_story_versions_pending_update",
  "trg_g2_story_versions_confirm_source_update",
  "trg_g2_storyboard_versions_pending_v2_insert",
  "trg_g2_storyboard_versions_pending_update",
  "trg_g2_storyboard_versions_confirm_source_update",
  "trg_g2_shots_retired_monotonic_update",
  "trg_g2_preflight_revisions_v2_current_insert",
  "trg_g2_generation_tasks_new_work_gate_seal",
  "trg_g2_generation_tasks_applicability_terminal",
] as const;

export interface G2OverlaySqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

export interface G2OverlayInspection {
  readonly indexes: readonly string[];
  readonly triggers: readonly string[];
  readonly temporaryObjects: readonly string[];
}

const overlayPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../prisma/migrations",
  G2_OVERLAY_MIGRATION_NAME,
  "migration.sql",
);

export async function readG2OverlayMigrationSql(
  migrationRoot = path.dirname(path.dirname(overlayPath)),
): Promise<string> {
  return readFile(
    path.join(migrationRoot, G2_OVERLAY_MIGRATION_NAME, "migration.sql"),
    "utf8",
  );
}

export function inspectG2OverlayV1(
  database: G2OverlaySqliteDatabase,
): G2OverlayInspection {
  const rows = database
    .prepare(
      "SELECT type, name FROM sqlite_master WHERE name LIKE 'uq_g2_%' OR name LIKE 'trg_g2_%' ORDER BY type, name",
    )
    .all() as Array<{ type: string; name: string }>;
  const temporaryObjects = database
    .prepare(
      "SELECT type, name FROM sqlite_temp_master WHERE name LIKE '%g2%' ORDER BY type, name",
    )
    .all() as Array<{ type: string; name: string }>;
  return {
    indexes: rows.filter((row) => row.type === "index").map((row) => row.name),
    triggers: rows.filter((row) => row.type === "trigger").map((row) => row.name),
    temporaryObjects: temporaryObjects.map((row) => `${row.type}:${row.name}`),
  };
}

export function assertG2OverlayInspectionV1(
  inspection: G2OverlayInspection,
): void {
  if (JSON.stringify(inspection.indexes) !== JSON.stringify([...G2_OVERLAY_INDEX_NAMES].sort())) {
    throw new Error("G2_OVERLAY_CONTRACT_INDEX_SET_INVALID");
  }
  if (JSON.stringify(inspection.triggers) !== JSON.stringify([...G2_OVERLAY_TRIGGER_NAMES].sort())) {
    throw new Error("G2_OVERLAY_CONTRACT_TRIGGER_SET_INVALID");
  }
  if (inspection.temporaryObjects.length !== 0) {
    throw new Error("G2_OVERLAY_CONTRACT_TEMP_OBJECTS_REMAIN");
  }
}

export function assertG2OverlaySqlShapeV1(sql: string): void {
  if ((sql.match(/CREATE UNIQUE INDEX /g) ?? []).length !== 2) {
    throw new Error("G2_OVERLAY_CONTRACT_INDEX_COUNT_INVALID");
  }
  if ((sql.match(/CREATE TRIGGER /g) ?? []).length !== 14) {
    throw new Error("G2_OVERLAY_CONTRACT_TRIGGER_COUNT_INVALID");
  }
  if ((sql.match(/CREATE (?:TEMP )?TABLE /g) ?? []).length !== 1 || !sql.includes("CREATE TEMP TABLE")) {
    throw new Error("G2_OVERLAY_CONTRACT_GUARD_TABLE_INVALID");
  }
  for (const name of G2_OVERLAY_INDEX_NAMES) {
    if (!sql.includes(`CREATE UNIQUE INDEX "${name}"`)) {
      throw new Error(`G2_OVERLAY_CONTRACT_INDEX_MISSING:${name}`);
    }
  }
  for (const name of G2_OVERLAY_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) {
      throw new Error(`G2_OVERLAY_CONTRACT_TRIGGER_MISSING:${name}`);
    }
  }
}
