import { chmod, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { canonicalizeMaintenanceJson, digestMaintenanceJson } from "../maintenance/canonical-json.js";
import type { RuntimeBundleEnvelope, SnapshotDigest } from "./snapshot.types.js";

export class RuntimeBundleFileError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function isAbsoluteFilePath(value: string): boolean {
  return path.isAbsolute(value) && !value.includes("\0");
}

export class RuntimeBundleFileService {
  async readAndVerify(filePath: string): Promise<{ bundle: RuntimeBundleEnvelope; digest: SnapshotDigest }> {
    if (!isAbsoluteFilePath(filePath)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_INVALID");
    let metadata;
    try {
      metadata = await lstat(filePath);
    } catch {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_NOT_FOUND");
    }
    if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PERMISSIONS");
    let bundle: RuntimeBundleEnvelope;
    try {
      bundle = JSON.parse(await readFile(filePath, "utf8")) as RuntimeBundleEnvelope;
    } catch {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_INVALID");
    }
    if (bundle.schemaVersion !== 1 || bundle.kind !== "airoaming_runtime_bundle_v1" || typeof bundle.payloadDigest !== "string") {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_INVALID");
    }
    const { payloadDigest, ...payload } = bundle;
    if (digestMaintenanceJson(payload) !== payloadDigest) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_DIGEST_MISMATCH");
    if (JSON.stringify(bundle).match(/(?:apiKey|token|authorization|cookie|secret|password)/i)) {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_SECRET_DETECTED");
    }
    return { bundle, digest: digestMaintenanceJson(bundle) };
  }

  async writeAtomic(filePath: string, bundle: RuntimeBundleEnvelope): Promise<SnapshotDigest> {
    if (!isAbsoluteFilePath(filePath)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_INVALID");
    if (JSON.stringify(bundle).match(/(?:apiKey|token|authorization|cookie|secret|password)/i)) {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_SECRET_DETECTED");
    }
    const { payloadDigest, ...payload } = bundle;
    const expectedPayloadDigest = digestMaintenanceJson(payload);
    if (payloadDigest !== expectedPayloadDigest) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_DIGEST_MISMATCH");
    const parent = path.dirname(filePath);
    await mkdir(parent, { recursive: true });
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${canonicalizeMaintenanceJson(bundle)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
    try { await unlink(temporary); } catch { /* atomic rename already completed */ }
    return digestMaintenanceJson(bundle);
  }
}
