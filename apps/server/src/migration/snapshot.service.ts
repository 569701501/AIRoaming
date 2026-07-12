import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { digestMaintenanceJson, canonicalizeMaintenanceJson } from "../maintenance/canonical-json.js";
import { redactCredentials } from "./credential-redactor.js";
import { RuntimeBundleFileError, RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import type { SealedSnapshot, SnapshotDigest, SnapshotManifest, SnapshotManifestItem, SnapshotResult, SnapshotTransform } from "./snapshot.types.js";

export class SnapshotError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface SnapshotOptions {
  workspaceRoot: string;
  stagingRoot: string;
  runtimeBundle: string;
  afterCopy?: () => Promise<void>;
}

interface ScannedSource {
  items: SnapshotManifestItem[];
  files: Map<string, Buffer>;
}

const SETTINGS_PREFIX = "settings/";
const SETTINGS_FILE = "settings/app-settings.json";

function manifestDigest(kind: SnapshotManifest["kind"], items: SnapshotManifestItem[]): SnapshotDigest {
  return digestMaintenanceJson({ schemaVersion: 1, kind, items });
}

function buildManifest(kind: SnapshotManifest["kind"], items: SnapshotManifestItem[]): SnapshotManifest {
  const sorted = [...items].sort((left, right) => left.storageKey.localeCompare(right.storageKey));
  return {
    schemaVersion: 1,
    kind,
    items: sorted,
    manifestDigest: manifestDigest(kind, sorted),
  };
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) && !value.includes("\0");
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function storageKeyFromRelative(relative: string): string {
  if (!relative || relative.includes("\\") || relative.includes("\0")) throw new SnapshotError("SNAPSHOT_PATH_UNSAFE");
  const storageKey = relative.split(path.sep).join("/");
  const segments = storageKey.split("/");
  if (storageKey.startsWith("/") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new SnapshotError("SNAPSHOT_PATH_UNSAFE");
  }
  return storageKey;
}

function sha256(bytes: Buffer): SnapshotDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function assertDirectory(root: string, code: string): Promise<void> {
  if (!isAbsolutePath(root)) throw new SnapshotError("SNAPSHOT_ARGS_INVALID");
  let metadata;
  try { metadata = await lstat(root); } catch { throw new SnapshotError(code); }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new SnapshotError(code);
}

async function assertEmptyDirectory(root: string): Promise<void> {
  if (!isAbsolutePath(root)) throw new SnapshotError("SNAPSHOT_ARGS_INVALID");
  try {
    const metadata = await lstat(root);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new SnapshotError("SNAPSHOT_ARGS_INVALID");
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    await mkdir(root, { recursive: true });
  }
  if ((await readdir(root)).length > 0) throw new SnapshotError("SNAPSHOT_ARGS_INVALID");
}

export class SnapshotService {
  constructor(private readonly runtimeBundles = new RuntimeBundleFileService()) {}

  async createSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
    const workspaceRoot = path.resolve(options.workspaceRoot);
    const stagingRoot = path.resolve(options.stagingRoot);
    await assertDirectory(workspaceRoot, "SNAPSHOT_WORKSPACE_INVALID");
    await assertEmptyDirectory(stagingRoot);
    if (isPathInside(workspaceRoot, stagingRoot)) throw new SnapshotError("SNAPSHOT_ARGS_INVALID");
    const runtime = await this.runtimeBundles.readAndVerify(path.resolve(options.runtimeBundle)).catch((error: unknown) => {
      if (error instanceof RuntimeBundleFileError) throw new SnapshotError(error.code);
      throw error;
    });

    const sourcePre = await this.scanSource(workspaceRoot);
    const sourceManifest = buildManifest("airoaming_snapshot_manifest_v1", sourcePre.items);
    const temporary = path.join(stagingRoot, `.snapshot-${process.pid}-${randomUUID()}.tmp`);
    await mkdir(path.join(temporary, "payload"), { recursive: true });
    try {
      const transforms: SnapshotTransform[] = [];
      const snapshotItems: SnapshotManifestItem[] = [];
      for (const item of sourcePre.items) {
        if (item.storageKey.startsWith(SETTINGS_PREFIX)) {
          transforms.push({
            sourceStorageKey: item.storageKey,
            action: item.storageKey === SETTINGS_FILE ? "redacted" : "omitted",
            targetStorageKey: item.storageKey === SETTINGS_FILE ? "settings.redacted.json" : null,
            reason: "settings_never_copied_in_plaintext",
          });
          continue;
        }
        const bytes = sourcePre.files.get(item.storageKey);
        if (!bytes) throw new SnapshotError("SNAPSHOT_SOURCE_READ_FAILED");
        const target = path.join(temporary, "payload", ...item.storageKey.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes, { mode: 0o600 });
        transforms.push({ sourceStorageKey: item.storageKey, action: "copied", targetStorageKey: `payload/${item.storageKey}`, reason: null });
        snapshotItems.push({ ...item, storageKey: `payload/${item.storageKey}` });
      }

      const settingsBytes = sourcePre.files.get(SETTINGS_FILE);
      const settingsValue = settingsBytes ? this.parseSettings(settingsBytes) : {};
      const redacted = redactCredentials(settingsValue);
      const settingsJson = Buffer.from(`${JSON.stringify(redacted.value, null, 2)}\n`, "utf8");
      await writeFile(path.join(temporary, "settings.redacted.json"), settingsJson, { mode: 0o600 });
      snapshotItems.push({ storageKey: "settings.redacted.json", type: "file", bytes: settingsJson.byteLength, sha256: sha256(settingsJson) });

      const runtimeJson = Buffer.from(`${canonicalizeMaintenanceJson(runtime.bundle)}\n`, "utf8");
      await writeFile(path.join(temporary, "runtime-bundle.json"), runtimeJson, { mode: 0o600 });
      snapshotItems.push({ storageKey: "runtime-bundle.json", type: "file", bytes: runtimeJson.byteLength, sha256: sha256(runtimeJson) });

      const snapshotManifest = buildManifest("airoaming_snapshot_manifest_v1", snapshotItems);
      const transformDigest = digestMaintenanceJson({ schemaVersion: 1, kind: "airoaming_snapshot_transforms_v1", items: transforms });
      await writeJson(path.join(temporary, "source-manifest.json"), sourceManifest);
      await writeJson(path.join(temporary, "snapshot-manifest.json"), snapshotManifest);
      await writeJson(path.join(temporary, "transforms.json"), { schemaVersion: 1, kind: "airoaming_snapshot_transforms_v1", items: transforms, transformDigest });

      if (options.afterCopy) await options.afterCopy();
      const sourcePost = buildManifest("airoaming_snapshot_manifest_v1", (await this.scanSource(workspaceRoot)).items);
      if (sourcePost.manifestDigest !== sourceManifest.manifestDigest) throw new SnapshotError("SNAPSHOT_SOURCE_CHANGED");

      const sealed: SealedSnapshot = {
        schemaVersion: 1,
        kind: "airoaming_snapshot_sealed_v1",
        sourceManifestDigest: sourceManifest.manifestDigest,
        snapshotManifestDigest: snapshotManifest.manifestDigest,
        transformDigest,
        runtimeBundleDigest: runtime.digest,
      };
      await writeJson(path.join(temporary, "SEALED"), sealed);
      await fsyncDirectory(temporary);
      const outputPath = path.join(stagingRoot, `snapshot-${snapshotManifest.manifestDigest.slice("sha256:".length)}`);
      await rename(temporary, outputPath);
      return { outputPath, sourceManifest, snapshotManifest, transformDigest, runtimeBundleDigest: runtime.digest, sealed };
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      if (error instanceof SnapshotError) throw error;
      throw new SnapshotError("SNAPSHOT_FAILED");
    }
  }

  private async scanSource(root: string): Promise<ScannedSource> {
    const items: SnapshotManifestItem[] = [];
    const files = new Map<string, Buffer>();
    const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
        const storageKey = storageKeyFromRelative(relative);
        const metadata = await lstat(absolute);
        if (metadata.isSymbolicLink() || metadata.isSocket() || metadata.isBlockDevice() || metadata.isCharacterDevice()) {
          throw new SnapshotError("SNAPSHOT_PATH_UNSAFE");
        }
        if (metadata.isDirectory()) {
          await visit(absolute, relative);
          continue;
        }
        if (!metadata.isFile()) throw new SnapshotError("SNAPSHOT_PATH_UNSAFE");
        const bytes = await readFile(absolute);
        files.set(storageKey, bytes);
        items.push({ storageKey, type: "file", bytes: bytes.byteLength, sha256: sha256(bytes) });
      }
    };
    await visit(root, "");
    items.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
    return { items, files };
  }

  private parseSettings(bytes: Buffer): unknown {
    try { return JSON.parse(bytes.toString("utf8")); } catch { throw new SnapshotError("SNAPSHOT_SETTINGS_INVALID"); }
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const handle = await open(filePath, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(filePath, 0o600);
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
