import { HttpException, Inject, Injectable } from "@nestjs/common";
import type {
  ConfirmStoryWorkingCopyRequest,
  CreateStoryWorkingCopyRequest,
  DiscardStoryWorkingCopyRequest,
  StoryWorkingCopyDto,
  StoryWorkingCopyMutationValue,
  UpdateStoryWorkingCopyRequest,
  VersionMutationResult,
} from "@airoaming/shared";
import { createG2DatabaseError, G2DatabaseError } from "./g2-database-error.mapper.js";
import { StoryVersionRepository } from "./story-version.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

@Injectable()
export class StoryVersionService {
  constructor(@Inject(StoryVersionRepository) private readonly repository: StoryVersionRepository) {}

  getWorkingCopy(scope: VersionScopeV1): Promise<StoryWorkingCopyDto> {
    return this.execute(() => this.repository.getWorkingCopy(scope));
  }

  createWorkingCopy(scope: VersionScopeV1, request: CreateStoryWorkingCopyRequest): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    return this.execute(() => { validateCreateRequest(request); return this.repository.createWorkingCopy(scope, request); });
  }

  updateWorkingCopy(scope: VersionScopeV1, request: UpdateStoryWorkingCopyRequest): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    return this.execute(() => { validateUpdateRequest(request); return this.repository.updateWorkingCopy(scope, request); });
  }

  discardWorkingCopy(scope: VersionScopeV1, request: DiscardStoryWorkingCopyRequest): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    return this.execute(() => { validateDiscardRequest(request); return this.repository.discardWorkingCopy(scope, request); });
  }

  confirmWorkingCopy(scope: VersionScopeV1, request: ConfirmStoryWorkingCopyRequest): Promise<VersionMutationResult<StoryWorkingCopyMutationValue>> {
    return this.execute(() => { validateConfirmRequest(request); return this.repository.confirmWorkingCopy(scope, request); });
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
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { reason: "request must be an object" });
  }
  return value as UnknownRecord;
}

function exactRequest(value: unknown, required: readonly string[]): UnknownRecord {
  const row = record(value);
  const allowed = new Set(required);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "unknown field" });
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(row, key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "missing field" });
  return row;
}

function stringField(row: UnknownRecord, key: string): string {
  if (typeof row[key] !== "string" || row[key].trim() === "") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-empty string" });
  return row[key] as string;
}

function nullableStringField(row: UnknownRecord, key: string): void {
  if (row[key] !== null && typeof row[key] !== "string") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected string or null" });
  if (typeof row[key] === "string" && row[key].trim() === "") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-empty string or null" });
}

function digestField(row: UnknownRecord, key: string): void {
  const value = stringField(row, key);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "invalid digest" });
}

function integerField(row: UnknownRecord, key: string): void {
  if (typeof row[key] !== "number" || !Number.isInteger(row[key]) || (row[key] as number) < 0) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-negative integer" });
}

function validateCreateRequest(value: unknown): void {
  const row = exactRequest(value, ["mode", "expectedCurrentVersionId", "expectedSourceScriptVersionId", "expectedChapterRowVersion"]);
  if (row.mode !== "clone_current" && row.mode !== "empty") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "mode", reason: "expected clone_current or empty" });
  nullableStringField(row, "expectedCurrentVersionId");
  stringField(row, "expectedSourceScriptVersionId");
  integerField(row, "expectedChapterRowVersion");
}

function validateUpdateRequest(value: unknown): void {
  const row = exactRequest(value, ["pendingVersionId", "document", "expectedPendingRowVersion", "expectedChapterRowVersion"]);
  stringField(row, "pendingVersionId");
  if (typeof row.document !== "object" || row.document === null || Array.isArray(row.document)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "document", reason: "expected object" });
  integerField(row, "expectedPendingRowVersion");
  integerField(row, "expectedChapterRowVersion");
}

function validateDiscardRequest(value: unknown): void {
  const row = exactRequest(value, ["pendingVersionId", "expectedPendingRowVersion", "expectedChapterRowVersion"]);
  stringField(row, "pendingVersionId"); integerField(row, "expectedPendingRowVersion"); integerField(row, "expectedChapterRowVersion");
}

function validateConfirmRequest(value: unknown): void {
  const row = exactRequest(value, ["pendingVersionId", "expectedPendingDocumentDigest", "expectedPendingRowVersion", "expectedCurrentVersionId", "expectedSourceScriptVersionId", "expectedSourceDigest", "expectedChapterRowVersion"]);
  stringField(row, "pendingVersionId"); digestField(row, "expectedPendingDocumentDigest"); integerField(row, "expectedPendingRowVersion");
  nullableStringField(row, "expectedCurrentVersionId"); stringField(row, "expectedSourceScriptVersionId"); digestField(row, "expectedSourceDigest"); integerField(row, "expectedChapterRowVersion");
}
