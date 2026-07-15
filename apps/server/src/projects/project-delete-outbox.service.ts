import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";
import { assertNoSecretSentinel, redactCredentials } from "../migration/credential-redactor.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { SecretStoreError, SecretStoreService } from "../settings/secret-store.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

export const OUTBOX_EVENT_TYPES = [
  "asset.promote",
  "asset.delete",
  "project.delete_files",
  "secret.delete_old_ref",
  "legacy_metadata.archive",
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];
export type OutboxEventStatus = "pending" | "processing" | "processed" | "failed";

const OUTBOX_LEASE_MS = 60_000;
const OUTBOX_RETRY_BACKOFF_MS = [5_000, 30_000] as const;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const SECRET_REF_RE = /^[A-Za-z0-9._:-]{1,256}$/;

type OutboxRow = Prisma.OutboxEventGetPayload<{}>;

type AssetPromotePayload = {
  schemaVersion: 1;
  assetId: string;
  projectId: string;
  chapterId: string | null;
  tempStorageKey: string;
  finalStorageKey: string;
  sha256: `sha256:${string}`;
  bytes: number;
};

type AssetDeletePayload = {
  schemaVersion: 1;
  assetId: string;
  projectId: string;
  chapterId: string | null;
  storageKey: string;
  expectedSha256: `sha256:${string}`;
  reason: "project_purge" | "orphan_cleanup" | "failed_promotion" | "explicit_delete";
};

type ProjectDeletePayload = {
  schemaVersion: 1;
  projectId: string;
  projectRootStorageKey: string;
  assetManifestDigest: `sha256:${string}`;
};

type SecretDeletePayload = {
  schemaVersion: 1;
  credentialMetadataId: string;
  oldSecretRef: string;
  expectedFingerprint: `sha256:${string}`;
  reason: "rotate" | "clear";
};

type LegacyArchivePayload = {
  schemaVersion: 1;
  cutoverRunId: string;
  projectId: string;
  sourceManifestDigest: `sha256:${string}`;
  archiveStorageKey: string;
  metadataEntriesDigest: `sha256:${string}`;
};

type DecodedPayload = AssetPromotePayload | AssetDeletePayload | ProjectDeletePayload | SecretDeletePayload | LegacyArchivePayload;

export interface ClaimedOutboxEvent {
  event: OutboxRow;
  workerId: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface OutboxProcessResult {
  eventId: string;
  eventType: string;
  status: "processed" | "retrying" | "failed";
  attempt: number;
  errorCode?: string;
}

export interface DeleteProjectIntentResult {
  projectId: string;
  eventId: string;
  status: "pending" | "processing" | "processed";
  deletedTaskCount: number;
}

class OutboxHandlerError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new OutboxHandlerError(`OUTBOX_${name}_OBJECT_REQUIRED`, false);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new OutboxHandlerError(`OUTBOX_${name}_INVALID`, false);
  return value;
}

function opaqueId(value: unknown, name: string): string {
  const text = requiredString(value, name);
  if (text.length > 256 || /[\u0000\s/\\]/.test(text)) throw new OutboxHandlerError(`OUTBOX_${name}_INVALID`, false);
  return text;
}

function digest(value: unknown, name: string): `sha256:${string}` {
  const text = requiredString(value, name);
  if (!DIGEST_RE.test(text)) throw new OutboxHandlerError(`OUTBOX_${name}_INVALID`, false);
  return text as `sha256:${string}`;
}

function storageKey(value: unknown, name: string): string {
  const text = requiredString(value, name);
  if (text.startsWith("/") || text.includes("\\") || text.split("/").some((part) => part === "" || part === "." || part === "..") || /[\u0000]/.test(text)) {
    throw new OutboxHandlerError("PATH_OUT_OF_BOUNDS", false);
  }
  return text;
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new OutboxHandlerError(`OUTBOX_${name}_INVALID`, false);
  return value as number;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const actual = Object.keys(value).sort().join("\u0000");
  const expected = [...keys].sort().join("\u0000");
  if (actual !== expected) throw new OutboxHandlerError(`OUTBOX_${name}_UNKNOWN_OR_MISSING_FIELD`, false);
}

function nextStamp(now: Date, previous?: Date): Date {
  return new Date(Math.max(now.getTime(), previous?.getTime() ?? 0) + 1);
}

function errorCode(error: unknown): string {
  return error instanceof OutboxHandlerError
    ? error.code
    : error instanceof Error && error.message ? error.message.slice(0, 120) : "OUTBOX_HANDLER_FAILED";
}

function handlerError(error: unknown): OutboxHandlerError {
  if (error instanceof OutboxHandlerError) return error;
  if (error instanceof SecretStoreError) {
    return new OutboxHandlerError(error.code, error.code === "SECRET_STORE_OPERATION_FAILED");
  }
  if (error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "ENOENT") return new OutboxHandlerError("TRANSIENT_IO", true);
  return new OutboxHandlerError(errorCode(error), false);
}

function fileDigest(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function manifestDigest(entries: readonly unknown[]): `sha256:${string}` {
  return digestCanonicalJson(entries);
}

@Injectable()
export class ProjectDeleteOutboxService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
    @Optional() @Inject(SecretStoreService) private readonly secretStore?: SecretStoreService,
  ) {}

  private database() {
    if (!this.prismaService.isDatabaseMode()) throw new BadRequestException("DB_PERSISTENCE_REQUIRED");
    return this.prismaService.database();
  }

  private resolveStorageKey(key: string): string {
    return this.workspacePath.resolveVirtualPath(`/workspace/${key}`);
  }

  private decodePayload(event: OutboxRow): DecodedPayload {
    if (!OUTBOX_EVENT_TYPES.includes(event.eventType as OutboxEventType) || event.payloadSchemaVersion !== 1) {
      throw new OutboxHandlerError("OUTBOX_EVENT_TYPE_UNSUPPORTED", false);
    }
    const value = objectValue(event.payloadJson, "PAYLOAD");
    assertNoSecretSentinel(value);
    if (digestCanonicalJson(value) !== event.payloadDigest) throw new OutboxHandlerError("PAYLOAD_DIGEST_MISMATCH", false);
    const schemaVersion = value.schemaVersion;
    if (schemaVersion !== 1) throw new OutboxHandlerError("OUTBOX_PAYLOAD_SCHEMA_UNSUPPORTED", false);
    switch (event.eventType as OutboxEventType) {
      case "asset.promote": {
        exactKeys(value, ["schemaVersion", "assetId", "projectId", "chapterId", "tempStorageKey", "finalStorageKey", "sha256", "bytes"], "ASSET_PROMOTE_PAYLOAD");
        const payload: AssetPromotePayload = { schemaVersion: 1, assetId: opaqueId(value.assetId, "ASSET_ID"), projectId: opaqueId(value.projectId, "PROJECT_ID"), chapterId: value.chapterId === null ? null : opaqueId(value.chapterId, "CHAPTER_ID"), tempStorageKey: storageKey(value.tempStorageKey, "TEMP_STORAGE_KEY"), finalStorageKey: storageKey(value.finalStorageKey, "FINAL_STORAGE_KEY"), sha256: digest(value.sha256, "SHA256"), bytes: integer(value.bytes, "BYTES") };
        if (event.aggregateType !== "asset" || event.aggregateId !== payload.assetId) throw new OutboxHandlerError("OUTBOX_AGGREGATE_MISMATCH", false);
        return payload;
      }
      case "asset.delete": {
        exactKeys(value, ["schemaVersion", "assetId", "projectId", "chapterId", "storageKey", "expectedSha256", "reason"], "ASSET_DELETE_PAYLOAD");
        if (!["project_purge", "orphan_cleanup", "failed_promotion", "explicit_delete"].includes(value.reason as string)) throw new OutboxHandlerError("OUTBOX_REASON_INVALID", false);
        const payload: AssetDeletePayload = { schemaVersion: 1, assetId: opaqueId(value.assetId, "ASSET_ID"), projectId: opaqueId(value.projectId, "PROJECT_ID"), chapterId: value.chapterId === null ? null : opaqueId(value.chapterId, "CHAPTER_ID"), storageKey: storageKey(value.storageKey, "STORAGE_KEY"), expectedSha256: digest(value.expectedSha256, "EXPECTED_SHA256"), reason: value.reason as AssetDeletePayload["reason"] };
        if (event.aggregateType !== "asset" || event.aggregateId !== payload.assetId) throw new OutboxHandlerError("OUTBOX_AGGREGATE_MISMATCH", false);
        return payload;
      }
      case "project.delete_files": {
        exactKeys(value, ["schemaVersion", "projectId", "projectRootStorageKey", "assetManifestDigest"], "PROJECT_DELETE_PAYLOAD");
        const payload: ProjectDeletePayload = { schemaVersion: 1, projectId: opaqueId(value.projectId, "PROJECT_ID"), projectRootStorageKey: storageKey(value.projectRootStorageKey, "PROJECT_ROOT_STORAGE_KEY"), assetManifestDigest: digest(value.assetManifestDigest, "ASSET_MANIFEST_DIGEST") };
        if (event.aggregateType !== "project" || event.aggregateId !== payload.projectId) throw new OutboxHandlerError("OUTBOX_AGGREGATE_MISMATCH", false);
        return payload;
      }
      case "secret.delete_old_ref": {
        exactKeys(value, ["schemaVersion", "credentialMetadataId", "oldSecretRef", "expectedFingerprint", "reason"], "SECRET_DELETE_PAYLOAD");
        if (!["rotate", "clear"].includes(value.reason as string) || typeof value.oldSecretRef !== "string" || !SECRET_REF_RE.test(value.oldSecretRef)) throw new OutboxHandlerError("OUTBOX_SECRET_REF_INVALID", false);
        const payload: SecretDeletePayload = { schemaVersion: 1, credentialMetadataId: opaqueId(value.credentialMetadataId, "CREDENTIAL_METADATA_ID"), oldSecretRef: value.oldSecretRef, expectedFingerprint: digest(value.expectedFingerprint, "EXPECTED_FINGERPRINT"), reason: value.reason as SecretDeletePayload["reason"] };
        if (event.aggregateType !== "credential_metadata" || event.aggregateId !== payload.credentialMetadataId) throw new OutboxHandlerError("OUTBOX_AGGREGATE_MISMATCH", false);
        return payload;
      }
      case "legacy_metadata.archive": {
        exactKeys(value, ["schemaVersion", "cutoverRunId", "projectId", "sourceManifestDigest", "archiveStorageKey", "metadataEntriesDigest"], "LEGACY_ARCHIVE_PAYLOAD");
        const payload: LegacyArchivePayload = { schemaVersion: 1, cutoverRunId: opaqueId(value.cutoverRunId, "CUTOVER_RUN_ID"), projectId: opaqueId(value.projectId, "PROJECT_ID"), sourceManifestDigest: digest(value.sourceManifestDigest, "SOURCE_MANIFEST_DIGEST"), archiveStorageKey: storageKey(value.archiveStorageKey, "ARCHIVE_STORAGE_KEY"), metadataEntriesDigest: digest(value.metadataEntriesDigest, "METADATA_ENTRIES_DIGEST") };
        if (event.aggregateType !== "project" || event.aggregateId !== payload.projectId) throw new OutboxHandlerError("OUTBOX_AGGREGATE_MISMATCH", false);
        return payload;
      }
    }
  }

  private async recoverExpired(now: Date): Promise<void> {
    const expired = await this.database().outboxEvent.findMany({ where: { status: "processing", leaseExpiresAt: { lte: now } }, orderBy: { leaseExpiresAt: "asc" }, take: 64 });
    for (const event of expired) {
      const stamp = nextStamp(now, event.updatedAt);
      if (event.attempt >= event.maxAttempts) {
        await this.prismaService.runBusinessTransaction(async (tx) => { await tx.outboxEvent.updateMany({ where: { id: event.id, status: "processing", leaseToken: event.leaseToken }, data: { status: "failed", leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, lastErrorJson: { code: "OUTBOX_LEASE_EXPIRED_MAX_ATTEMPTS", retryable: false }, updatedAt: stamp } }); });
      } else {
        await this.prismaService.runBusinessTransaction(async (tx) => { await tx.outboxEvent.updateMany({ where: { id: event.id, status: "processing", leaseToken: event.leaseToken }, data: { status: "pending", availableAt: new Date(stamp.getTime() + OUTBOX_RETRY_BACKOFF_MS[Math.min(event.attempt - 1, OUTBOX_RETRY_BACKOFF_MS.length - 1)]), leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, lastErrorJson: { code: "OUTBOX_LEASE_EXPIRED", retryable: true }, updatedAt: stamp } }); });
      }
    }
  }

  async claimNext(workerId: string, now = new Date()): Promise<ClaimedOutboxEvent | null> {
    if (!workerId.trim()) throw new TypeError("workerId must be non-empty");
    await this.recoverExpired(now);
    const candidates = await this.database().outboxEvent.findMany({ where: { status: "pending", availableAt: { lte: now } }, orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }], take: 32 });
    for (const candidate of candidates) {
      const token = randomUUID();
      const stamp = nextStamp(now, candidate.updatedAt);
      const leaseExpiresAt = new Date(stamp.getTime() + OUTBOX_LEASE_MS);
      const claimed = await this.prismaService.runBusinessTransaction(async (tx) => {
        const current = await tx.outboxEvent.findUnique({ where: { id: candidate.id } });
        if (!current || current.status !== "pending" || current.availableAt > now || current.attempt >= current.maxAttempts) return null;
        const result = await tx.outboxEvent.updateMany({ where: { id: current.id, status: "pending", attempt: current.attempt }, data: { status: "processing", attempt: current.attempt + 1, leaseOwnerId: workerId, leaseToken: token, leaseExpiresAt, updatedAt: stamp } });
        return result.count === 1 ? tx.outboxEvent.findUnique({ where: { id: current.id } }) : null;
      });
      if (claimed) return { event: claimed, workerId, leaseToken: token, leaseExpiresAt: leaseExpiresAt.toISOString() };
    }
    return null;
  }

  private async claimAssetPromotion(assetId: string, workerId: string, now: Date): Promise<ClaimedOutboxEvent | null> {
    if (!assetId.trim() || !workerId.trim()) throw new TypeError("assetId and workerId must be non-empty");
    await this.recoverExpired(now);
    const candidate = await this.database().outboxEvent.findFirst({
      where: {
        eventType: "asset.promote",
        aggregateType: "asset",
        aggregateId: assetId,
        status: "pending",
        availableAt: { lte: now },
      },
    });
    if (!candidate) return null;
    const token = randomUUID();
    const stamp = nextStamp(now, candidate.updatedAt);
    const leaseExpiresAt = new Date(stamp.getTime() + OUTBOX_LEASE_MS);
    const claimed = await this.prismaService.runBusinessTransaction(async (tx) => {
      const current = await tx.outboxEvent.findUnique({ where: { id: candidate.id } });
      if (!current || current.eventType !== "asset.promote" || current.aggregateId !== assetId || current.status !== "pending" || current.availableAt > now || current.attempt >= current.maxAttempts) return null;
      const result = await tx.outboxEvent.updateMany({
        where: { id: current.id, status: "pending", attempt: current.attempt },
        data: { status: "processing", attempt: current.attempt + 1, leaseOwnerId: workerId, leaseToken: token, leaseExpiresAt, updatedAt: stamp },
      });
      return result.count === 1 ? tx.outboxEvent.findUnique({ where: { id: current.id } }) : null;
    });
    return claimed ? { event: claimed, workerId, leaseToken: token, leaseExpiresAt: leaseExpiresAt.toISOString() } : null;
  }

  async heartbeat(eventId: string, leaseToken: string, now = new Date()): Promise<OutboxRow> {
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const current = await tx.outboxEvent.findUnique({ where: { id: eventId } });
      if (!current || current.status !== "processing" || current.leaseToken !== leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt <= now) throw new OutboxHandlerError("OUTBOX_LEASE_LOST", false);
      const stamp = nextStamp(now, current.updatedAt);
      const updated = await tx.outboxEvent.update({ where: { id: eventId }, data: { updatedAt: stamp, leaseExpiresAt: new Date(stamp.getTime() + OUTBOX_LEASE_MS) } });
      return updated;
    });
  }

  private async markProcessed(event: OutboxRow, leaseToken: string, now: Date): Promise<OutboxRow> {
    const stamp = nextStamp(now, event.updatedAt);
    const updated = await this.prismaService.runBusinessTransaction(async (tx) => tx.outboxEvent.updateMany({ where: { id: event.id, status: "processing", leaseToken }, data: { status: "processed", processedAt: stamp, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, updatedAt: stamp } }));
    if (updated.count !== 1) throw new OutboxHandlerError("OUTBOX_LEASE_LOST", false);
    return this.database().outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
  }

  private async markFailure(event: OutboxRow, leaseToken: string, error: OutboxHandlerError, now: Date): Promise<"retrying" | "failed"> {
    const current = await this.database().outboxEvent.findUnique({ where: { id: event.id } });
    if (!current || current.status !== "processing" || current.leaseToken !== leaseToken) return "failed";
    const stamp = nextStamp(now, current.updatedAt);
    const redacted = redactCredentials({ code: error.code, retryable: error.retryable });
    assertNoSecretSentinel(redacted.value);
    const shouldRetry = error.retryable && current.attempt < current.maxAttempts;
    await this.prismaService.runBusinessTransaction(async (tx) => tx.outboxEvent.update({ where: { id: event.id }, data: shouldRetry
      ? { status: "pending", availableAt: new Date(stamp.getTime() + OUTBOX_RETRY_BACKOFF_MS[Math.min(current.attempt - 1, OUTBOX_RETRY_BACKOFF_MS.length - 1)]), leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, lastErrorJson: redacted.value as Prisma.InputJsonValue, updatedAt: stamp }
      : { status: "failed", leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, lastErrorJson: redacted.value as Prisma.InputJsonValue, updatedAt: stamp } }));
    return shouldRetry ? "retrying" : "failed";
  }

  async processNext(workerId: string, now = new Date()): Promise<OutboxProcessResult | null> {
    const claim = await this.claimNext(workerId, now);
    if (!claim) return null;
    return this.processClaim(claim, now);
  }

  /** 只处理指定发布产物的提升事件，避免发布 worker 顺带消费无关删除事件。 */
  async processAssetPromotion(assetId: string, workerId: string, now = new Date()): Promise<OutboxProcessResult | null> {
    const claim = await this.claimAssetPromotion(assetId, workerId, now);
    if (!claim) return null;
    return this.processClaim(claim, now);
  }

  private async processClaim(claim: ClaimedOutboxEvent, now: Date): Promise<OutboxProcessResult> {
    let decoded: DecodedPayload;
    let markedProcessed = false;
    try {
      decoded = this.decodePayload(claim.event);
      await this.dispatch(claim.event, decoded);
      await this.markProcessed(claim.event, claim.leaseToken, now);
      markedProcessed = true;
      if (claim.event.eventType === "secret.delete_old_ref") await this.finalizeSecret(decoded as SecretDeletePayload, now);
      return { eventId: claim.event.id, eventType: claim.event.eventType, status: "processed", attempt: claim.event.attempt };
    } catch (rawError) {
      const error = handlerError(rawError);
      // A processed event is immutable.  A post-commit finalization failure
      // must be reported without trying to reopen the terminal outbox row.
      if (markedProcessed) return { eventId: claim.event.id, eventType: claim.event.eventType, status: "processed", attempt: claim.event.attempt, errorCode: error.code };
      const status = await this.markFailure(claim.event, claim.leaseToken, error, now);
      return { eventId: claim.event.id, eventType: claim.event.eventType, status, attempt: claim.event.attempt, errorCode: error.code };
    }
  }

  private async dispatch(event: OutboxRow, payload: DecodedPayload): Promise<void> {
    switch (event.eventType as OutboxEventType) {
      case "asset.promote": return this.handleAssetPromote(payload as AssetPromotePayload);
      case "asset.delete": return this.handleAssetDelete(payload as AssetDeletePayload);
      case "project.delete_files": return this.handleProjectDelete(payload as ProjectDeletePayload, event.id);
      case "secret.delete_old_ref": return this.handleSecretDelete(payload as SecretDeletePayload);
      case "legacy_metadata.archive": return this.handleLegacyArchive(payload as LegacyArchivePayload);
    }
  }

  private async handleAssetPromote(payload: AssetPromotePayload): Promise<void> {
    const asset = await this.database().asset.findFirst({ where: { id: payload.assetId, projectId: payload.projectId }, select: { id: true, projectId: true, chapterId: true, storageKey: true, status: true, sha256: true, bytes: true } });
    if (!asset || asset.storageKey !== payload.finalStorageKey || asset.chapterId !== payload.chapterId) throw new OutboxHandlerError("ASSET_OWNER_MISMATCH", false);
    const project = await this.database().project.findUnique({ where: { id: payload.projectId }, select: { lifecycleStatus: true } });
    if (!project) throw new OutboxHandlerError("PROJECT_NOT_FOUND", false);
    const tempPath = this.resolveStorageKey(payload.tempStorageKey);
    const finalPath = this.resolveStorageKey(payload.finalStorageKey);
    await mkdir(path.dirname(finalPath), { recursive: true });
    let finalMatches = false;
    try {
      const finalBytes = await readFile(finalPath);
      if (fileDigest(finalBytes) !== payload.sha256 || finalBytes.byteLength !== payload.bytes) throw new OutboxHandlerError("FINAL_CONTENT_CONFLICT", false);
      finalMatches = true;
    } catch (error) {
      if (error instanceof OutboxHandlerError) throw error;
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw new OutboxHandlerError("TRANSIENT_IO", true);
    }
    if (!finalMatches) {
      let tempBytes: Buffer;
      try { tempBytes = await readFile(tempPath); } catch { throw new OutboxHandlerError("TRANSIENT_IO", true); }
      if (fileDigest(tempBytes) !== payload.sha256 || tempBytes.byteLength !== payload.bytes) throw new OutboxHandlerError("DIGEST_CONFLICT", false);
      await rename(tempPath, finalPath);
    } else {
      await unlink(tempPath).catch((error: unknown) => { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; });
    }
    const now = new Date();
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const current = await tx.asset.findUnique({ where: { id: payload.assetId } });
      if (!current) throw new OutboxHandlerError("ASSET_NOT_FOUND", false);
      const currentProject = await tx.project.findUnique({ where: { id: payload.projectId }, select: { lifecycleStatus: true } });
      if (!currentProject) throw new OutboxHandlerError("PROJECT_NOT_FOUND", false);
      if (currentProject.lifecycleStatus !== "active") {
        await tx.asset.update({ where: { id: payload.assetId }, data: { status: "deleting", deletingAt: now, updatedAt: now } });
        return;
      }
      if (current.status === "ready" && current.sha256 === payload.sha256 && current.bytes === payload.bytes) return;
      await tx.asset.update({ where: { id: payload.assetId }, data: { status: "ready", sha256: payload.sha256, bytes: payload.bytes, readyAt: now, failedAt: null, updatedAt: now } });
    });
  }

  private async handleAssetDelete(payload: AssetDeletePayload): Promise<void> {
    const asset = await this.database().asset.findFirst({ where: { id: payload.assetId, projectId: payload.projectId }, select: { id: true, storageKey: true, sha256: true, status: true } });
    if (!asset || asset.storageKey !== payload.storageKey || asset.sha256 !== payload.expectedSha256) throw new OutboxHandlerError("ASSET_OWNER_MISMATCH", false);
    const filePath = this.resolveStorageKey(payload.storageKey);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new OutboxHandlerError("PATH_OUT_OF_BOUNDS", false);
      const bytes = await readFile(filePath);
      if (fileDigest(bytes) !== payload.expectedSha256) throw new OutboxHandlerError("HASH_MISMATCH", false);
      await unlink(filePath);
    } catch (error) {
      if (error instanceof OutboxHandlerError) throw error;
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return;
      throw new OutboxHandlerError("TRANSIENT_IO", true);
    }
  }

  private async projectAssetManifest(projectId: string): Promise<Array<{ assetId: string; chapterId: string | null; storageKey: string; sha256: string | null; bytes: number | null }>> {
    const assets = await this.database().asset.findMany({ where: { projectId }, select: { id: true, chapterId: true, storageKey: true, sha256: true, bytes: true }, orderBy: { id: "asc" } });
    return assets.map((asset) => ({ assetId: asset.id, chapterId: asset.chapterId, storageKey: asset.storageKey, sha256: asset.sha256, bytes: asset.bytes }));
  }

  private async handleProjectDelete(payload: ProjectDeletePayload, eventId: string): Promise<void> {
    if (payload.projectRootStorageKey !== `projects/${payload.projectId}`) throw new OutboxHandlerError("PATH_OUT_OF_BOUNDS", false);
    const project = await this.database().project.findUnique({ where: { id: payload.projectId }, select: { lifecycleStatus: true } });
    if (!project || project.lifecycleStatus !== "deleting") throw new OutboxHandlerError("PROJECT_DELETE_STATE_INVALID", false);
    const manifest = await this.projectAssetManifest(payload.projectId);
    if (manifestDigest(manifest) !== payload.assetManifestDigest) throw new OutboxHandlerError("DIGEST_DRIFT", false);
    const activeTasks = await this.database().generationTask.count({ where: { projectId: payload.projectId, recordKind: "runtime", status: { in: ["queued", "running", "retrying"] } } });
    if (activeTasks > 0) throw new OutboxHandlerError("ACTIVE_RUNTIME_TASK", true);
    const unsettled = await this.database().outboxEvent.count({ where: { id: { not: eventId }, aggregateType: "asset", status: { in: ["pending", "processing"] }, aggregateId: { in: manifest.map((item) => item.assetId) } } });
    if (unsettled > 0) throw new OutboxHandlerError("UNSETTLED_ASSET_EVENT", true);
    for (const item of manifest) {
      if (!item.storageKey.startsWith(`projects/${payload.projectId}/`)) throw new OutboxHandlerError("PATH_OUT_OF_BOUNDS", false);
      if (!item.sha256) continue;
      await this.deleteVerifiedFile(item.storageKey, item.sha256);
    }
    const root = this.resolveStorageKey(payload.projectRootStorageKey);
    await rm(root, { recursive: true, force: true });
  }

  private async deleteVerifiedFile(storageKeyValue: string, expectedSha256: string): Promise<void> {
    const filePath = this.resolveStorageKey(storageKeyValue);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new OutboxHandlerError("PATH_OUT_OF_BOUNDS", false);
      const bytes = await readFile(filePath);
      if (fileDigest(bytes) !== expectedSha256) throw new OutboxHandlerError("HASH_MISMATCH", false);
      await unlink(filePath);
    } catch (error) {
      if (error instanceof OutboxHandlerError) throw error;
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return;
      throw new OutboxHandlerError("TRANSIENT_IO", true);
    }
  }

  private async handleSecretDelete(payload: SecretDeletePayload): Promise<void> {
    if (!this.secretStore) throw new OutboxHandlerError("SECRET_STORE_UNAVAILABLE", true);
    try {
      await this.secretStore.delete(payload.credentialMetadataId);
    } catch (error) {
      if (error instanceof SecretStoreError && error.code === "SECRET_STORE_ENTRY_MISSING") return;
      throw error;
    }
  }

  private async finalizeSecret(payload: SecretDeletePayload, now: Date): Promise<void> {
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const row = await tx.credentialMetadata.findUnique({ where: { id: payload.credentialMetadataId } });
      if (!row) return;
      if (row.status === "clearing" && row.secretRef === payload.oldSecretRef) {
        await tx.credentialMetadata.update({ where: { id: row.id }, data: { status: "unconfigured", configured: false, secretRef: null, fingerprint: null, updatedAt: now } });
      } else if (payload.reason === "clear" && row.secretRef === payload.oldSecretRef) {
        throw new OutboxHandlerError("OWNER_MISMATCH", false);
      }
    });
  }

  private async metadataEntries(projectId: string): Promise<Array<{ storageKey: string; sha256: `sha256:${string}`; bytes: number }>> {
    const root = this.resolveStorageKey(`projects/${projectId}`);
    const entries: Array<{ storageKey: string; sha256: `sha256:${string}`; bytes: number }> = [];
    const walk = async (directory: string, relative: string): Promise<void> => {
      let children;
      try { children = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return; throw error; }
      for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
        const childRelative = relative ? `${relative}/${child.name}` : child.name;
        if (childRelative === "assets" || childRelative.startsWith("assets/")) continue;
        const childPath = path.join(directory, child.name);
        if (child.isDirectory()) await walk(childPath, childRelative);
        else if (child.isFile()) {
          const bytes = await readFile(childPath);
          entries.push({ storageKey: `projects/${projectId}/${childRelative}`, sha256: fileDigest(bytes), bytes: bytes.byteLength });
        } else throw new OutboxHandlerError("UNKNOWN_ENTRY", false);
      }
    };
    await walk(root, "");
    return entries.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
  }

  private async handleLegacyArchive(payload: LegacyArchivePayload): Promise<void> {
    const archiveRoot = this.resolveStorageKey(payload.archiveStorageKey);
    const manifestPath = path.join(archiveRoot, "manifest.json");
    try {
      const existing = JSON.parse(await readFile(manifestPath, "utf8")) as { entries?: unknown };
      if (digestCanonicalJson(existing.entries ?? []) === payload.metadataEntriesDigest) return;
      throw new OutboxHandlerError("DIGEST_DRIFT", false);
    } catch (error) {
      if (error instanceof OutboxHandlerError) throw error;
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw new OutboxHandlerError("DIGEST_DRIFT", false);
    }
    const entries = await this.metadataEntries(payload.projectId);
    if (manifestDigest(entries) !== payload.metadataEntriesDigest || manifestDigest(entries) !== payload.sourceManifestDigest) throw new OutboxHandlerError("DIGEST_DRIFT", false);
    await mkdir(archiveRoot, { recursive: true });
    const sourceRoot = this.resolveStorageKey(`projects/${payload.projectId}`);
    for (const entry of entries) {
      const relative = entry.storageKey.slice(`projects/${payload.projectId}/`.length);
      const source = path.join(sourceRoot, relative);
      const target = path.join(archiveRoot, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(source, target);
    }
    await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, projectId: payload.projectId, entries }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async requestProjectDelete(projectId: string): Promise<DeleteProjectIntentResult> {
    const database = this.database();
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, lifecycleStatus: true, rowVersion: true } });
      if (!project) throw new NotFoundException("PROJECT_NOT_FOUND");
      const existing = await tx.outboxEvent.findFirst({ where: { eventType: "project.delete_files", aggregateType: "project", aggregateId: projectId }, orderBy: { createdAt: "desc" } });
      if (project.lifecycleStatus === "deleting") {
        if (!existing) throw new BadRequestException("PROJECT_DELETE_INTENT_MISSING");
        if (existing.status === "failed") throw new BadRequestException("PROJECT_DELETE_OUTBOX_FAILED");
        return { projectId, eventId: existing.id, status: existing.status as DeleteProjectIntentResult["status"], deletedTaskCount: 0 };
      }
      if (project.lifecycleStatus !== "active") throw new NotFoundException("PROJECT_NOT_FOUND");
      const assets = await tx.asset.findMany({ where: { projectId }, select: { id: true, chapterId: true, storageKey: true, sha256: true, bytes: true }, orderBy: { id: "asc" } });
      const manifest = assets.map((asset) => ({ assetId: asset.id, chapterId: asset.chapterId, storageKey: asset.storageKey, sha256: asset.sha256, bytes: asset.bytes }));
      const assetManifestDigest = manifestDigest(manifest);
      const now = new Date();
      const cancelQueued = await tx.generationTask.updateMany({ where: { projectId, recordKind: "runtime", status: { in: ["queued", "retrying"] } }, data: { status: "cancelled", phase: "cancelled", finishedAt: now, cancelRequestedAt: now, nextRunAt: null, updatedAt: now } });
      const running = await tx.generationTask.updateMany({ where: { projectId, recordKind: "runtime", status: "running" }, data: { cancelRequestedAt: now, updatedAt: now } });
      // Clear reverse pointers while the project is still active.  G1
      // deliberately forbids changing current pointers after active->deleting
      // so that a later child purge cannot trigger an implicit scope update.
      const detached = await tx.project.updateMany({ where: { id: projectId, lifecycleStatus: "active", rowVersion: project.rowVersion }, data: { currentChapterId: null, currentScriptOutlineId: null, rowVersion: { increment: 1 }, updatedAt: now } });
      if (detached.count !== 1) throw new BadRequestException("PROJECT_DELETE_CONFLICT");
      const updated = await tx.project.updateMany({ where: { id: projectId, lifecycleStatus: "active", rowVersion: project.rowVersion + 1 }, data: { lifecycleStatus: "deleting", deletingAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      if (updated.count !== 1) throw new BadRequestException("PROJECT_DELETE_CONFLICT");
      const payload: ProjectDeletePayload = { schemaVersion: 1, projectId, projectRootStorageKey: `projects/${projectId}`, assetManifestDigest };
      const event = await tx.outboxEvent.create({ data: { eventType: "project.delete_files", aggregateType: "project", aggregateId: projectId, payloadJson: payload, payloadSchemaVersion: 1, payloadDigest: digestCanonicalJson(payload), status: "pending", attempt: 0, maxAttempts: 3, idempotencyKey: `project.delete_files:${projectId}:${assetManifestDigest}`, createdAt: now, updatedAt: now } });
      return { projectId, eventId: event.id, status: "pending", deletedTaskCount: cancelQueued.count + running.count };
    });
  }

  /**
   * Purges only after the project-files event is terminally processed.  The
   * SQL order follows the G1 purge ownership registry and deliberately leaves
   * OutboxEvent rows as immutable audit facts.
   */
  async purgeDeletedProject(projectId: string): Promise<{ projectId: string; purged: true }> {
    const database = this.database();
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } });
      if (!project || project.lifecycleStatus !== "deleting") throw new NotFoundException("PROJECT_NOT_FOUND");
      const event = await tx.outboxEvent.findFirst({ where: { eventType: "project.delete_files", aggregateType: "project", aggregateId: projectId, status: "processed" } });
      if (!event) throw new BadRequestException("PROJECT_DELETE_FILES_NOT_PROCESSED");
      const activeTasks = await tx.generationTask.count({ where: { projectId, recordKind: "runtime", status: { in: ["queued", "running", "retrying"] } } });
      if (activeTasks > 0) throw new BadRequestException("PROJECT_DELETE_ACTIVE_TASKS");
      const q = async (sql: string): Promise<void> => { await tx.$executeRawUnsafe(sql, projectId); };
      // Detach every Chapter reverse pointer before deleting immutable child
      // rows. This avoids relying on SQLite ON DELETE SET NULL side effects,
      // while the coordinated-purge triggers still require deleting + a
      // processed project.delete_files event + no active runtime task.
      await q(`UPDATE "chapters"
        SET "current_script_version_id" = NULL,
            "current_story_version_id" = NULL,
            "pending_story_version_id" = NULL,
            "current_storyboard_version_id" = NULL,
            "pending_storyboard_version_id" = NULL,
            "current_preflight_revision_id" = NULL,
            "current_layout_revision_id" = NULL,
            "current_export_revision_id" = NULL,
            "last_script_revision_id" = NULL,
            "script_working_state" = CASE WHEN length("script_working_text") = 0 THEN 'empty' ELSE 'dirty' END,
            "row_version" = "row_version" + 1
        WHERE "project_id" = ?
          AND ("current_script_version_id" IS NOT NULL
            OR "current_story_version_id" IS NOT NULL
            OR "pending_story_version_id" IS NOT NULL
            OR "current_storyboard_version_id" IS NOT NULL
            OR "pending_storyboard_version_id" IS NOT NULL
            OR "current_preflight_revision_id" IS NOT NULL
            OR "current_layout_revision_id" IS NOT NULL
            OR "current_export_revision_id" IS NOT NULL
            OR "last_script_revision_id" IS NOT NULL)`);
      await q('DELETE FROM "pending_dialogue_artifacts" WHERE "project_id" = ?');
      await q('DELETE FROM "chapter_script_pending" WHERE "chapter_id" IN (SELECT "id" FROM "chapters" WHERE "project_id" = ?)');
      await q('DELETE FROM "chapter_script_revisions" WHERE "chapter_id" IN (SELECT "id" FROM "chapters" WHERE "project_id" = ?)');
      await q('DELETE FROM "dialogue_tool_results" WHERE "thread_id" IN (SELECT "id" FROM "conversation_threads" WHERE "project_id" = ?)');
      await q('DELETE FROM "dialogue_runtime_sessions" WHERE "thread_id" IN (SELECT "id" FROM "conversation_threads" WHERE "project_id" = ?)');
      await q('DELETE FROM "conversation_messages" WHERE "thread_id" IN (SELECT "id" FROM "conversation_threads" WHERE "project_id" = ?)');
      await q('DELETE FROM "conversation_threads" WHERE "project_id" = ?');
      await q('DELETE FROM "export_artifacts" WHERE "export_revision_id" IN (SELECT "id" FROM "export_revisions" WHERE "project_id" = ?)');
      await q('DELETE FROM "export_revisions" WHERE "project_id" = ?');
      await q('DELETE FROM "layout_source_bindings" WHERE "layout_revision_id" IN (SELECT "id" FROM "layout_revisions" WHERE "project_id" = ?)');
      await q('DELETE FROM "layout_working_copies" WHERE "project_id" = ?');
      const layoutRevisions = await tx.layoutRevision.findMany({ where: { projectId }, select: { id: true }, orderBy: { createdAt: "desc" } });
      for (const revision of layoutRevisions) await tx.layoutRevision.delete({ where: { id: revision.id } });
      await q('DELETE FROM "preflight_revisions" WHERE "project_id" = ?');
      await q('DELETE FROM "storyboard_shot_characters" WHERE "storyboard_shot_projection_id" IN (SELECT "id" FROM "storyboard_shot_projections" WHERE "storyboard_version_id" IN (SELECT "id" FROM "storyboard_versions" WHERE "project_id" = ?))');
      await q('DELETE FROM "storyboard_shot_projections" WHERE "storyboard_version_id" IN (SELECT "id" FROM "storyboard_versions" WHERE "project_id" = ?)');
      await q('DELETE FROM "story_scene_projections" WHERE "story_version_id" IN (SELECT "id" FROM "story_versions" WHERE "project_id" = ?)');
      await q('DELETE FROM "story_beat_projections" WHERE "story_version_id" IN (SELECT "id" FROM "story_versions" WHERE "project_id" = ?)');
      await q('DELETE FROM "storyboard_versions" WHERE "project_id" = ?');
      await q('DELETE FROM "story_versions" WHERE "project_id" = ?');
      await q('DELETE FROM "candidate_lock_revisions" WHERE "project_id" = ?');
      await q('DELETE FROM "layout_source_bindings" WHERE "shot_id" IN (SELECT "id" FROM "shots" WHERE "project_id" = ?)');
      await q('DELETE FROM "candidates" WHERE "project_id" = ?');
      await q('DELETE FROM "scene_visuals" WHERE "chapter_scene_id" IN (SELECT "id" FROM "chapter_scenes" WHERE "project_id" = ?)');
      await q('DELETE FROM "character_visuals" WHERE "character_id" IN (SELECT "id" FROM "characters" WHERE "project_id" = ?)');
      await q('DELETE FROM "shots" WHERE "project_id" = ?');
      await q('DELETE FROM "chapter_scenes" WHERE "project_id" = ?');
      await q('DELETE FROM "characters" WHERE "project_id" = ?');
      await q('DELETE FROM "assets" WHERE "project_id" = ?');
      await q('UPDATE "task_concurrency_slots" SET "task_id" = NULL, "lease_owner_id" = NULL, "claim_token" = NULL, "lease_expires_at" = NULL WHERE "task_id" IN (SELECT "id" FROM "generation_tasks" WHERE "project_id" = ?)');
      await q('DELETE FROM "task_attempts" WHERE "task_id" IN (SELECT "id" FROM "generation_tasks" WHERE "project_id" = ?)');
      await q('DELETE FROM "generation_task_sources" WHERE "task_id" IN (SELECT "id" FROM "generation_tasks" WHERE "project_id" = ?)');
      await q('DELETE FROM "generation_tasks" WHERE "project_id" = ?');
      await q('DELETE FROM "project_context_facts" WHERE "project_id" = ?');
      await q('DELETE FROM "chapter_script_versions" WHERE "chapter_id" IN (SELECT "id" FROM "chapters" WHERE "project_id" = ?)');
      await q('DELETE FROM "chapters" WHERE "project_id" = ?');
      await q('DELETE FROM "project_script_outlines" WHERE "project_id" = ?');
      await tx.project.delete({ where: { id: projectId } });
    });
    return { projectId, purged: true };
  }
}
