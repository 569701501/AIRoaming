import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { containsSecretSentinel, redactCredentials } from "./credential-redactor.js";

export interface MetadataArchiveInput {
  workspaceRoot: string;
  archiveRoot: string;
  marker: string;
}

export interface MetadataArchiveResult {
  archiveRoot: string;
  marker: string;
  metadataFileCount: number;
  assetPathCount: number;
  metadataDigest: `sha256:${string}`;
}

export class MetadataArchiveError extends Error {
  constructor(readonly code: string) { super(code); }
}

const METADATA_NAMES = new Set([
  "project.json", "workflow.json", "chapter.json", "script.md", "script-outline.md", "script-outline.json",
  "structure.json", "storyboard.json", "storyboard.pending.json", "preflight.json", "candidates.json", "layout.json", "latest.json",
]);

function root(value: string, code: string): string {
  if (!path.isAbsolute(value) || value.includes("\0")) throw new MetadataArchiveError(code);
  return path.resolve(value);
}

async function digestFiles(files: Array<{ key: string; bytes: Buffer }>): Promise<`sha256:${string}`> {
  const hash = createHash("sha256");
  for (const file of files.sort((left, right) => left.key.localeCompare(right.key))) hash.update(file.key).update("\0").update(file.bytes).update("\0");
  return `sha256:${hash.digest("hex")}`;
}

export class MetadataArchiveService {
  async archive(input: MetadataArchiveInput): Promise<MetadataArchiveResult> {
    const workspaceRoot = root(input.workspaceRoot, "ARCHIVE_ROOT_INVALID");
    const archiveRoot = root(input.archiveRoot, "ARCHIVE_ROOT_INVALID");
    if (!input.marker.trim() || input.marker.includes("\0")) throw new MetadataArchiveError("ARCHIVE_MARKER_INVALID");
    const sourceStat = await lstat(workspaceRoot).catch(() => null);
    if (!sourceStat?.isDirectory() || sourceStat.isSymbolicLink()) throw new MetadataArchiveError("ARCHIVE_ROOT_INVALID");
    const archiveStat = await lstat(archiveRoot).catch(() => null);
    if (archiveStat) {
      if (!archiveStat.isDirectory() || archiveStat.isSymbolicLink() || (await readdir(archiveRoot)).length > 0) throw new MetadataArchiveError("ARCHIVE_TARGET_NOT_EMPTY");
    } else {
      await mkdir(path.dirname(archiveRoot), { recursive: true, mode: 0o700 });
    }
    const staging = `${archiveRoot}.staging-${process.pid}-${Date.now()}`;
    await mkdir(staging, { recursive: true, mode: 0o700 });
    const files: Array<{ key: string; bytes: Buffer }> = [];
    const assetPaths: string[] = [];
    const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const source = path.join(directory, entry.name);
        const relative = path.join(relativeDirectory, entry.name);
        if (entry.isSymbolicLink()) throw new MetadataArchiveError("ARCHIVE_SYMLINK_UNSAFE");
        if (entry.isDirectory()) {
          if (entry.name === "assets") {
            await collectAssets(source, relative);
          } else {
            await visit(source, relative);
          }
          continue;
        }
        if (!entry.isFile() || !METADATA_NAMES.has(entry.name)) continue;
        const original = await readFile(source);
        let bytes = original;
        if (entry.name.endsWith(".json")) {
          let parsed: unknown;
          try { parsed = JSON.parse(original.toString("utf8")); } catch { throw new MetadataArchiveError("ARCHIVE_METADATA_INVALID"); }
          const redacted = redactCredentials(parsed).value;
          if (containsSecretSentinel(redacted)) throw new MetadataArchiveError("ARCHIVE_SECRET_DETECTED");
          bytes = Buffer.from(`${JSON.stringify(redacted, null, 2)}\n`, "utf8");
        } else if (containsSecretSentinel(original)) {
          throw new MetadataArchiveError("ARCHIVE_SECRET_DETECTED");
        }
        const target = path.join(staging, relative);
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target, bytes, { mode: 0o600 });
        files.push({ key: relative.split(path.sep).join("/"), bytes });
      }
    };
    const collectAssets = async (directory: string, relativeDirectory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const source = path.join(directory, entry.name);
        const relative = path.join(relativeDirectory, entry.name);
        if (entry.isSymbolicLink()) throw new MetadataArchiveError("ARCHIVE_SYMLINK_UNSAFE");
        if (entry.isDirectory()) await collectAssets(source, relative);
        else if (entry.isFile()) assetPaths.push(relative.split(path.sep).join("/"));
      }
    };
    try {
      await visit(workspaceRoot, "");
      const metadataDigest = await digestFiles(files);
      const manifest = { schemaVersion: 1, kind: "airoaming_metadata_archive_v1", marker: input.marker, metadataFileCount: files.length, assetPathCount: assetPaths.length, assetPaths: assetPaths.sort(), metadataDigest };
      await writeFile(path.join(staging, "archive-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      if (archiveStat) await rm(archiveRoot, { recursive: true, force: true });
      await rename(staging, archiveRoot);
      return { archiveRoot, marker: input.marker, metadataFileCount: files.length, assetPathCount: assetPaths.length, metadataDigest };
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (error instanceof MetadataArchiveError) throw error;
      throw new MetadataArchiveError("ARCHIVE_FAILED");
    }
  }
}
