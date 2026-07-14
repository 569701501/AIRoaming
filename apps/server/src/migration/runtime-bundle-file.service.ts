import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import { canonicalizeMaintenanceJson, digestMaintenanceJson } from "../maintenance/canonical-json.js";
import type { RuntimeBundleEnvelope, SnapshotDigest } from "./snapshot.types.js";

export class RuntimeBundleFileError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type RuntimeBundleProfile = "snapshot" | "cutover";

function isAbsoluteFilePath(value: string): boolean {
  return path.isAbsolute(value) && !value.includes("\0");
}

async function assertNoSymlinkAncestors(targetPath: string): Promise<void> {
  let current = path.resolve(targetPath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    });
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_UNSAFE");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export class RuntimeBundleFileService {
  async readAndVerify(filePath: string, options: { profile?: RuntimeBundleProfile } = {}): Promise<{ bundle: RuntimeBundleEnvelope; digest: SnapshotDigest }> {
    if (!isAbsoluteFilePath(filePath)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_INVALID");
    await assertNoSymlinkAncestors(filePath);
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
    if (bundle.schemaVersion !== 1 || bundle.kind !== "airoaming_runtime_bundle_v1" || bundle.maintenanceState !== "closed" || bundle.activeMutations !== 0 || bundle.activeStreams !== 0 || typeof bundle.payloadDigest !== "string") {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_INVALID");
    }
    const { payloadDigest, ...payload } = bundle;
    if (digestMaintenanceJson(payload) !== payloadDigest) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_DIGEST_MISMATCH");
    if (JSON.stringify(bundle).match(/(?:apiKey|token|authorization|cookie|secret|password)/i)) {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_SECRET_DETECTED");
    }
    if (options.profile === "cutover") {
      if (typeof bundle.runtimeInstanceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bundle.runtimeInstanceId)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_IDENTITY_INVALID");
      const participants = bundle.participants;
      if (!participants || typeof participants !== "object" || Array.isArray(participants) || Object.keys(participants).length === 0) {
        throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PARTICIPANTS_INVALID");
      }
      for (const participant of Object.values(participants)) {
        if (!participant || typeof participant !== "object" || Array.isArray(participant)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PARTICIPANTS_INVALID");
        const status = (participant as { status?: unknown }).status;
        if (!status || typeof status !== "object" || Array.isArray(status)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PARTICIPANT_STATUS_INVALID");
        const value = status as Record<string, unknown>;
        if (value.active !== 0 || value.queued !== 0 || value.blockedReason !== null) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PARTICIPANT_BUSY");
      }
      if (bundle.redaction.redactedCount < 0 || !Array.isArray(bundle.unobservableBeforeBridge)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_INVALID");
    }
    return { bundle, digest: digestMaintenanceJson(bundle) };
  }

  async writeAtomic(filePath: string, bundle: RuntimeBundleEnvelope): Promise<SnapshotDigest> {
    if (!isAbsoluteFilePath(filePath)) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_INVALID");
    await assertNoSymlinkAncestors(filePath);
    if (JSON.stringify(bundle).match(/(?:apiKey|token|authorization|cookie|secret|password)/i)) {
      throw new RuntimeBundleFileError("RUNTIME_BUNDLE_SECRET_DETECTED");
    }
    const { payloadDigest, ...payload } = bundle;
    const expectedPayloadDigest = digestMaintenanceJson(payload);
    if (payloadDigest !== expectedPayloadDigest) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_DIGEST_MISMATCH");
    const parent = path.dirname(filePath);
    const existingParent = await lstat(parent).catch(() => null);
    if (existingParent?.isSymbolicLink() || (existingParent && !existingParent.isDirectory())) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_UNSAFE");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const verifiedParent = await lstat(parent).catch(() => null);
    if (!verifiedParent || verifiedParent.isSymbolicLink() || !verifiedParent.isDirectory()) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_UNSAFE");
    const existingFile = await lstat(filePath).catch(() => null);
    if (existingFile && (existingFile.isSymbolicLink() || !existingFile.isFile())) throw new RuntimeBundleFileError("RUNTIME_BUNDLE_PATH_UNSAFE");
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      try { await handle.writeFile(`${canonicalizeMaintenanceJson(bundle)}\n`, "utf8"); await handle.sync(); }
      catch (error) { await handle.close().catch(() => undefined); await rm(temporary, { force: true }).catch(() => undefined); throw error; }
      await handle.close();
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    try {
      await chmod(temporary, 0o600);
      await rename(temporary, filePath);
      const parentHandle = await open(parent, "r");
      try { await parentHandle.sync(); } finally { await parentHandle.close(); }
    } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
    return digestMaintenanceJson(bundle);
  }
}
