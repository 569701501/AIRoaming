import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";

/**
 * workspace JSON 读写与解析辅助(纯函数 + 轻量 fs)。
 * 从 ProjectsService 抽出,供 ProjectRepository 和 Service 共用(见任务 2026-06-21_ProjectsService拆分 阶段①子步 1a)。
 */

/** 判断错误是否"文件/目录不存在"(ENOENT)。 */
export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** 读文本文件,不存在返回 null(不抛 ENOENT)。 */
export async function readOptionalTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/** 读目录条目,不存在返回空数组(不抛 ENOENT)。 */
export async function readOptionalDirectory(dirPath: string): Promise<Dirent[]> {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

/** 解析 JSON 为对象,非对象抛错。 */
export function parseJsonRecord(content: string, filePath: string): Record<string, unknown> {
  const value = JSON.parse(content) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function getStringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

export function getOptionalStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function getStringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function getNumberField(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
