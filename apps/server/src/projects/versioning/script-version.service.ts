import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import type {
  ScriptHistoryCopyRequest,
  ScriptHistoryDetail,
  ScriptHistoryPage,
  ScriptMutationResult,
  ScriptPendingAdoptRequest,
  ScriptPendingDiscardRequest,
  ScriptPendingSuggestionDto,
  ScriptPublishRequest,
  ScriptPublishResponse,
  ScriptWorkingCopyClearRequest,
  ScriptWorkingCopyDto,
  ScriptWorkingCopyRevertRequest,
  ScriptWorkingCopyUpdateRequest,
} from "@airoaming/shared";
import { createG2DatabaseError, G2DatabaseError } from "./g2-database-error.mapper.js";
import { ScriptVersionRepository } from "./script-version.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";
import { ProjectRepository } from "../project-repository.service.js";

@Injectable()
export class ScriptVersionService {
  constructor(
    @Inject(ScriptVersionRepository) private readonly repository: ScriptVersionRepository,
    @Optional() @Inject(ProjectRepository) private readonly projectRepository?: ProjectRepository,
  ) {}

  getWorkingCopy(scope: VersionScopeV1): Promise<ScriptWorkingCopyDto> {
    return this.execute(() => this.repository.getWorkingCopy(scope));
  }

  updateWorkingCopy(scope: VersionScopeV1, request: ScriptWorkingCopyUpdateRequest): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    return this.executeAndRefresh(scope, () => { validateUpdateRequest(request); return this.repository.updateWorkingCopy(scope, request); });
  }

  clearWorkingCopy(scope: VersionScopeV1, request: ScriptWorkingCopyClearRequest): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    return this.executeAndRefresh(scope, () => { validateClearRequest(request); return this.repository.clearWorkingCopy(scope, request); });
  }

  revertWorkingCopy(scope: VersionScopeV1, request: ScriptWorkingCopyRevertRequest): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    return this.executeAndRefresh(scope, () => { validateRevertRequest(request); return this.repository.revertWorkingCopy(scope, request); });
  }

  publish(scope: VersionScopeV1, request: ScriptPublishRequest): Promise<ScriptPublishResponse> {
    return this.executeAndRefresh(scope, () => { validatePublishRequest(request); return this.repository.publish(scope, request); });
  }

  getPendingSuggestion(scope: VersionScopeV1): Promise<ScriptPendingSuggestionDto | null> {
    return this.execute(() => this.repository.getPendingSuggestion(scope));
  }

  adoptPendingSuggestion(scope: VersionScopeV1, request: ScriptPendingAdoptRequest): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    return this.executeAndRefresh(scope, () => { validateAdoptRequest(request); return this.repository.adoptPendingSuggestion(scope, request); });
  }

  discardPendingSuggestion(scope: VersionScopeV1, request: ScriptPendingDiscardRequest): Promise<ScriptMutationResult<null>> {
    return this.executeAndRefresh(scope, () => { validateDiscardRequest(request); return this.repository.discardPendingSuggestion(scope, request); });
  }

  listHistory(scope: VersionScopeV1, options?: { limit?: number; beforeVersion?: number }): Promise<ScriptHistoryPage> {
    return this.execute(() => { validateHistoryQuery(options); return this.repository.listHistory(scope, options); });
  }

  getHistoryDetail(scope: VersionScopeV1, versionId: string): Promise<ScriptHistoryDetail> {
    return this.execute(() => this.repository.getHistoryDetail(scope, versionId));
  }

  copyHistoryToWorkingCopy(scope: VersionScopeV1, versionId: string, request: ScriptHistoryCopyRequest): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    return this.executeAndRefresh(scope, () => { validateHistoryCopyRequest(request); return this.repository.copyHistoryToWorkingCopy(scope, versionId, request); });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof G2DatabaseError) {
        throw new HttpException({ success: false, error: { code: error.code, message: error.message, details: error.details } }, error.status);
      }
      throw error;
    }
  }

  private async executeAndRefresh<T>(scope: VersionScopeV1, operation: () => Promise<T>): Promise<T> {
    const result = await this.execute(operation);
    if (this.projectRepository) await this.projectRepository.refreshProjectFromDatabase(scope.projectId);
    return result;
  }
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { reason: "request must be an object" });
  }
  return value as UnknownRecord;
}

function exactRequest(value: unknown, required: readonly string[], optional: readonly string[] = []): UnknownRecord {
  const row = record(value);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "unknown field" });
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(row, key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "missing field" });
  return row;
}

function stringField(row: UnknownRecord, key: string, allowEmpty = false): string {
  if (typeof row[key] !== "string" || (!allowEmpty && row[key].trim() === "")) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected string" });
  return row[key] as string;
}

function digestField(row: UnknownRecord, key: string): void {
  const value = stringField(row, key);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "invalid digest" });
}

function integerField(row: UnknownRecord, key: string): void {
  if (typeof row[key] !== "number" || !Number.isInteger(row[key]) || (row[key] as number) < 0) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-negative integer" });
}

function validateUpdateRequest(value: unknown): void {
  const row = exactRequest(value, ["sourceText", "expectedChapterRowVersion"], ["title", "summary"]);
  stringField(row, "sourceText", true); integerField(row, "expectedChapterRowVersion");
  if (row.title !== undefined) stringField(row, "title", true);
  if (row.summary !== undefined && row.summary !== null) stringField(row, "summary", true);
}

function validateClearRequest(value: unknown): void {
  const row = exactRequest(value, ["expectedWorkingDigest", "expectedChapterRowVersion"]);
  digestField(row, "expectedWorkingDigest"); integerField(row, "expectedChapterRowVersion");
}

function validateRevertRequest(value: unknown): void {
  const row = exactRequest(value, ["expectedCurrentScriptVersionId", "expectedWorkingDigest", "expectedChapterRowVersion"]);
  stringField(row, "expectedCurrentScriptVersionId"); digestField(row, "expectedWorkingDigest"); integerField(row, "expectedChapterRowVersion");
}

function validatePublishRequest(value: unknown): void {
  const row = exactRequest(value, ["expectedCurrentScriptVersionId", "expectedWorkingDigest", "expectedChapterRowVersion", "createNextChapter"], ["nextChapterTitle"]);
  if (row.expectedCurrentScriptVersionId !== null) stringField(row, "expectedCurrentScriptVersionId");
  digestField(row, "expectedWorkingDigest"); integerField(row, "expectedChapterRowVersion");
  if (typeof row.createNextChapter !== "boolean") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "createNextChapter", reason: "expected boolean" });
  if (row.nextChapterTitle !== undefined) stringField(row, "nextChapterTitle", true);
}

function validateAdoptRequest(value: unknown): void {
  const row = exactRequest(value, ["pendingId", "expectedPendingRowVersion", "expectedPendingDigest", "expectedChapterRowVersion"]);
  stringField(row, "pendingId"); integerField(row, "expectedPendingRowVersion"); digestField(row, "expectedPendingDigest"); integerField(row, "expectedChapterRowVersion");
}

function validateDiscardRequest(value: unknown): void {
  const row = exactRequest(value, ["pendingId", "expectedPendingRowVersion"]);
  stringField(row, "pendingId"); integerField(row, "expectedPendingRowVersion");
}

function validateHistoryCopyRequest(value: unknown): void {
  const row = exactRequest(value, ["expectedCurrentVersionId", "expectedWorkingDigest", "expectedChapterRowVersion"]);
  if (row.expectedCurrentVersionId !== null) stringField(row, "expectedCurrentVersionId"); digestField(row, "expectedWorkingDigest"); integerField(row, "expectedChapterRowVersion");
}

function validateHistoryQuery(options: { limit?: number; beforeVersion?: number } | undefined): void {
  if (options?.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "limit", reason: "expected integer 1..100" });
  }
  if (options?.beforeVersion !== undefined && (!Number.isInteger(options.beforeVersion) || options.beforeVersion < 1)) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "beforeVersion", reason: "expected positive integer" });
  }
}
