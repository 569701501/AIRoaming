import { readFile } from "node:fs/promises";
import path from "node:path";

export const DOCUMENT_LIBRARY_MIGRATION_NAME = "0020_document_library" as const;

export async function readDocumentLibrarySql(migrationRoot: string): Promise<string> {
  return readFile(
    path.join(migrationRoot, DOCUMENT_LIBRARY_MIGRATION_NAME, "migration.sql"),
    "utf8",
  );
}

export function assertDocumentLibrarySqlShape(sql: string): void {
  for (const required of [
    'CREATE TABLE "document_works"',
    'CREATE TABLE "document_chapters"',
    'CREATE UNIQUE INDEX "uq_document_chapters_work_order"',
  ]) {
    if (!sql.includes(required)) {
      throw new Error(`DOCUMENT_LIBRARY_GUARD_MISSING:${required}`);
    }
  }
  // 文稿库迁移只允许 ADD COLUMN，禁止重建 chapters（会破坏既有 trigger）
  for (const forbidden of [
    'CREATE TABLE "new_chapters"',
    'DROP TABLE "chapters"',
  ]) {
    if (sql.includes(forbidden)) {
      throw new Error(`DOCUMENT_LIBRARY_CHAPTERS_REBUILD_FORBIDDEN:${forbidden}`);
    }
  }
}
