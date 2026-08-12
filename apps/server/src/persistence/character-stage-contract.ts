import { readFile } from "node:fs/promises";
import path from "node:path";

export const CHARACTER_STAGE_MIGRATION_NAME = "0021_character_stage" as const;

export async function readCharacterStageSql(migrationRoot: string): Promise<string> {
  return readFile(
    path.join(migrationRoot, CHARACTER_STAGE_MIGRATION_NAME, "migration.sql"),
    "utf8",
  );
}

export function assertCharacterStageSqlShape(sql: string): void {
  for (const required of [
    'CREATE TABLE "character_stages"',
    'CREATE UNIQUE INDEX "uq_character_stages_character_order"',
    'ADD COLUMN "anchor_asset_id"',
  ]) {
    if (!sql.includes(required)) {
      throw new Error(`CHARACTER_STAGE_GUARD_MISSING:${required}`);
    }
  }
  // 阶段迁移只允许 ADD COLUMN，禁止重建 characters（会破坏既有 trigger）
  for (const forbidden of [
    'CREATE TABLE "new_characters"',
    'DROP TABLE "characters"',
  ]) {
    if (sql.includes(forbidden)) {
      throw new Error(`CHARACTER_STAGE_CHARACTERS_REBUILD_FORBIDDEN:${forbidden}`);
    }
  }
}
