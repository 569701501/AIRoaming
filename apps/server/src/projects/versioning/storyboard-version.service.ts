import { HttpException, Inject, Injectable } from "@nestjs/common";
import type {
  ConfirmStoryboardWorkingCopyRequest,
  CreatePendingShotRequest,
  CreateStoryboardWorkingCopyRequest,
  DiscardStoryboardWorkingCopyRequest,
  StoryboardWorkingCopyDto,
  StoryboardWorkingCopyMutationValue,
  UpdateStoryboardWorkingCopyRequest,
  VersionMutationResult,
  CreatePendingShotResponse,
} from "@airoaming/shared";
import { createG2DatabaseError, G2DatabaseError } from "./g2-database-error.mapper.js";
import { StoryboardVersionRepository } from "./storyboard-version.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

@Injectable()
export class StoryboardVersionService {
  constructor(@Inject(StoryboardVersionRepository) private readonly repository: StoryboardVersionRepository) {}
  getWorkingCopy(scope: VersionScopeV1): Promise<StoryboardWorkingCopyDto> { return this.execute(() => this.repository.getWorkingCopy(scope)); }
  createWorkingCopy(scope: VersionScopeV1, request: CreateStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> { return this.execute(() => { validateCreate(request); return this.repository.createWorkingCopy(scope, request); }); }
  updateWorkingCopy(scope: VersionScopeV1, request: UpdateStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> { return this.execute(() => { validateUpdate(request); return this.repository.updateWorkingCopy(scope, request); }); }
  discardWorkingCopy(scope: VersionScopeV1, request: DiscardStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> { return this.execute(() => { validateDiscard(request); return this.repository.discardWorkingCopy(scope, request); }); }
  confirmWorkingCopy(scope: VersionScopeV1, request: ConfirmStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyMutationValue>> { return this.execute(() => { validateConfirm(request); return this.repository.confirmWorkingCopy(scope, request); }); }
  createPendingShot(scope: VersionScopeV1, request: CreatePendingShotRequest): Promise<CreatePendingShotResponse> { return this.execute(() => { validateShot(request); return this.repository.createPendingShot(scope, request); }); }
  private async execute<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch (error) { if (error instanceof G2DatabaseError) throw new HttpException({ success: false, error: { code: error.code, message: error.message, details: error.details } }, error.status); throw error; } }
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { if (typeof value !== "object" || value === null || Array.isArray(value)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { reason: "request must be an object" }); return value as RecordValue; }
function exact(value: unknown, required: readonly string[]): RecordValue { const row = record(value); const allowed = new Set(required); for (const key of Object.keys(row)) if (!allowed.has(key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "unknown field" }); for (const key of required) if (!Object.prototype.hasOwnProperty.call(row, key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "missing field" }); return row; }
function stringField(row: RecordValue, key: string): string { if (typeof row[key] !== "string" || row[key].trim() === "") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-empty string" }); return row[key] as string; }
function nullableString(row: RecordValue, key: string): void { if (row[key] !== null && typeof row[key] !== "string") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected string or null" }); if (typeof row[key] === "string" && row[key].trim() === "") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-empty string or null" }); }
function digestField(row: RecordValue, key: string): void { const value = stringField(row, key); if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "invalid digest" }); }
function integerField(row: RecordValue, key: string): void { if (typeof row[key] !== "number" || !Number.isInteger(row[key]) || (row[key] as number) < 0) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected non-negative integer" }); }
function objectField(row: RecordValue, key: string): void { if (typeof row[key] !== "object" || row[key] === null || Array.isArray(row[key])) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "expected object" }); }
function validateCreate(value: unknown): void { const row = exact(value, ["mode", "expectedCurrentVersionId", "expectedSourceStoryVersionId", "expectedChapterRowVersion"]); if (row.mode !== "clone_current" && row.mode !== "empty") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "mode", reason: "expected clone_current or empty" }); nullableString(row, "expectedCurrentVersionId"); stringField(row, "expectedSourceStoryVersionId"); integerField(row, "expectedChapterRowVersion"); }
function validateUpdate(value: unknown): void { const row = exact(value, ["pendingVersionId", "document", "expectedPendingRowVersion", "expectedChapterRowVersion"]); stringField(row, "pendingVersionId"); objectField(row, "document"); integerField(row, "expectedPendingRowVersion"); integerField(row, "expectedChapterRowVersion"); }
function validateDiscard(value: unknown): void { const row = exact(value, ["pendingVersionId", "expectedPendingRowVersion", "expectedChapterRowVersion"]); stringField(row, "pendingVersionId"); integerField(row, "expectedPendingRowVersion"); integerField(row, "expectedChapterRowVersion"); }
function validateConfirm(value: unknown): void { const row = exact(value, ["pendingVersionId", "expectedPendingDocumentDigest", "expectedPendingRowVersion", "expectedCurrentVersionId", "expectedSourceStoryVersionId", "expectedSourceDigest", "expectedChapterRowVersion"]); stringField(row, "pendingVersionId"); digestField(row, "expectedPendingDocumentDigest"); integerField(row, "expectedPendingRowVersion"); nullableString(row, "expectedCurrentVersionId"); stringField(row, "expectedSourceStoryVersionId"); digestField(row, "expectedSourceDigest"); integerField(row, "expectedChapterRowVersion"); }
function validateShot(value: unknown): void { const row = exact(value, ["pendingVersionId", "requestId", "afterShotId", "expectedPendingRowVersion", "expectedChapterRowVersion", "initial"]); stringField(row, "pendingVersionId"); const requestId = stringField(row, "requestId"); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "requestId", reason: "expected UUID v4" }); nullableString(row, "afterShotId"); integerField(row, "expectedPendingRowVersion"); integerField(row, "expectedChapterRowVersion"); objectField(row, "initial"); }
