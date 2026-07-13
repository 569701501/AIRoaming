import { lstat, realpath, stat, readdir } from "node:fs/promises";
import * as path from "node:path";

export class BackupPathError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function requireAbsolutePath(value: string, code = "BACKUP_PATH_UNSAFE"): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new BackupPathError(code);
  return path.normalize(value);
}

export async function existingDirectory(value: string): Promise<string> {
  const absolute = requireAbsolutePath(value);
  let metadata;
  try { metadata = await lstat(absolute); } catch { throw new BackupPathError("BACKUP_PATH_UNSAFE"); }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new BackupPathError("BACKUP_PATH_UNSAFE");
  return realpath(absolute);
}

export async function emptyDirectory(value: string): Promise<string> {
  const absolute = await existingDirectory(value);
  if ((await readdir(absolute)).length !== 0) throw new BackupPathError("BACKUP_ARGS_INVALID");
  return absolute;
}

export async function existingRegularFile(value: string, code = "BACKUP_PATH_UNSAFE"): Promise<string> {
  const absolute = requireAbsolutePath(value, code);
  let metadata;
  try { metadata = await lstat(absolute); } catch { throw new BackupPathError(code); }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) throw new BackupPathError(code);
  return realpath(absolute);
}

export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

export function assertDisjointRoots(roots: readonly string[]): void {
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (isWithin(roots[left], roots[right]) || isWithin(roots[right], roots[left])) {
        throw new BackupPathError("BACKUP_PATH_UNSAFE");
      }
    }
  }
}

export function parseSqliteFileUrl(value: string): string {
  if (!value.startsWith("file:") || value.includes("?") || value.includes("#")) throw new BackupPathError("BACKUP_ARGS_INVALID");
  const raw = value.slice("file:".length);
  if (raw.startsWith("//")) throw new BackupPathError("BACKUP_ARGS_INVALID");
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { throw new BackupPathError("BACKUP_ARGS_INVALID"); }
  return requireAbsolutePath(decoded, "BACKUP_ARGS_INVALID");
}

export async function resolveStorageFile(root: string, storageKey: string): Promise<string> {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.includes("\0")) throw new BackupPathError("BACKUP_PATH_UNSAFE");
  const segments = storageKey.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new BackupPathError("BACKUP_PATH_UNSAFE");
  }
  const candidate = path.resolve(root, ...segments);
  if (!isWithin(root, candidate)) throw new BackupPathError("BACKUP_PATH_UNSAFE");
  const canonical = await existingRegularFile(candidate, "BACKUP_ASSET_MISMATCH");
  if (!isWithin(root, canonical)) throw new BackupPathError("BACKUP_PATH_UNSAFE");
  const metadata = await stat(canonical);
  if (!metadata.isFile()) throw new BackupPathError("BACKUP_ASSET_MISMATCH");
  return canonical;
}
