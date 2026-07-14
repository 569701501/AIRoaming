import { readFile } from "node:fs/promises";
import path from "node:path";

export const G4_CANDIDATE_LOCK_OVERLAY_MIGRATION_NAME =
  "0012_g4_candidate_lock_linear_history" as const;

export const G4_CANDIDATE_LOCK_INDEX_NAMES = [
  "uq_g4_candidate_lock_revisions_previous_nonnull",
] as const;

export const G4_CANDIDATE_LOCK_TRIGGER_NAMES = [
  "trg_g4_candidate_lock_revisions_linear_insert",
  "trg_g4_candidates_current_final_status_update",
] as const;

export const G4_CANDIDATE_LOCK_REPLACED_TRIGGER_NAMES = [
  "trg_shots_current_lock_scope_insert",
  "trg_shots_current_lock_scope_update",
] as const;

export async function readG4CandidateLockOverlaySql(
  migrationRoot: string,
): Promise<string> {
  return readFile(
    path.join(
      migrationRoot,
      G4_CANDIDATE_LOCK_OVERLAY_MIGRATION_NAME,
      "migration.sql",
    ),
    "utf8",
  );
}

export function assertG4CandidateLockOverlaySqlShape(sql: string): void {
  if (/CREATE TABLE|ALTER TABLE|DROP TABLE|ADD COLUMN|PRAGMA\s+writable_schema/i.test(sql)) {
    throw new Error("G4_CANDIDATE_LOCK_OVERLAY_SCHEMA_MUTATION_FORBIDDEN");
  }
  if ((sql.match(/CREATE UNIQUE INDEX /g) ?? []).length !== 1) {
    throw new Error("G4_CANDIDATE_LOCK_OVERLAY_INDEX_COUNT_INVALID");
  }
  if ((sql.match(/DROP TRIGGER /g) ?? []).length !== 2) {
    throw new Error("G4_CANDIDATE_LOCK_OVERLAY_DROP_TRIGGER_COUNT_INVALID");
  }
  if ((sql.match(/CREATE TRIGGER /g) ?? []).length !== 4) {
    throw new Error("G4_CANDIDATE_LOCK_OVERLAY_CREATE_TRIGGER_COUNT_INVALID");
  }
  for (const name of G4_CANDIDATE_LOCK_INDEX_NAMES) {
    if (!sql.includes(`CREATE UNIQUE INDEX "${name}"`)) {
      throw new Error(`G4_CANDIDATE_LOCK_OVERLAY_INDEX_MISSING:${name}`);
    }
  }
  for (const name of G4_CANDIDATE_LOCK_TRIGGER_NAMES) {
    if (!sql.includes(`CREATE TRIGGER "${name}"`)) {
      throw new Error(`G4_CANDIDATE_LOCK_OVERLAY_TRIGGER_MISSING:${name}`);
    }
  }
  for (const name of G4_CANDIDATE_LOCK_REPLACED_TRIGGER_NAMES) {
    if (
      !sql.includes(`DROP TRIGGER "${name}"`) ||
      !sql.includes(`CREATE TRIGGER "${name}"`)
    ) {
      throw new Error(`G4_CANDIDATE_LOCK_OVERLAY_REPLACEMENT_MISSING:${name}`);
    }
  }
  for (const required of [
    'NEW."previous_revision_id" IS NULL',
    'NEW."revision" = previous_revision."revision" + 1',
    'shot."current_candidate_lock_revision_id" = previous_revision."id"',
    'lock_revision."previous_revision_id" = OLD."current_candidate_lock_revision_id"',
    'purge_event."event_type" = \'project.delete_files\'',
  ]) {
    if (!sql.includes(required)) {
      throw new Error("G4_CANDIDATE_LOCK_OVERLAY_REQUIRED_GUARD_MISSING");
    }
  }
}
