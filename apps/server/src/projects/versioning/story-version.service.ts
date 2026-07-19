import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import type {
  ConfirmStoryWorkingCopyRequest,
  CreateStoryWorkingCopyRequest,
  DiscardStoryWorkingCopyRequest,
  StoryWorkingCopyDto,
  StoryWorkingCopyMutationValue,
  UpdateStoryWorkingCopyRequest,
  VersionMutationResult,
  VersionHistoryCopyRequest,
} from "@airoaming/shared";
import { requiredCharacterReferenceKind } from "@airoaming/shared";
import { createG2DatabaseError, G2DatabaseError } from "./g2-database-error.mapper.js";
import { StoryVersionRepository } from "./story-version.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";
import { CharacterReferenceService } from "../character-reference.service.js";

@Injectable()
export class StoryVersionService {
  private readonly logger = new Logger(StoryVersionService.name);

  constructor(
    @Inject(StoryVersionRepository) private readonly repository: StoryVersionRepository,
    @Inject(CharacterReferenceService) private readonly characterReference: CharacterReferenceService,
  ) {}

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
    return this.execute(async () => {
      validateConfirmRequest(request);
      const result = await this.repository.confirmWorkingCopy(scope, request);
      await this.queueMissingCharacterPreviews(scope.projectId, result.value.document);
      return result;
    });
  }

  copyHistoryToWorkingCopy(scope: VersionScopeV1, versionId: string, request: VersionHistoryCopyRequest): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    return this.execute(() => this.repository.copyHistoryToWorkingCopy(scope, versionId, request));
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

  private async queueMissingCharacterPreviews(projectId: string, document: StoryWorkingCopyMutationValue["document"]): Promise<void> {
    try {
      const library = await this.characterReference.listProjectCharacters(projectId);
      const byId = new Map(library.characters.map((character) => [character.id, character]));
      for (const card of document.characters) {
        const character = byId.get(card.projectCharacterId);
        if (
          !character
          || requiredCharacterReferenceKind(character) === "none"
          || character.previewReferenceAssetId
          || character.status === "in_use"
        ) continue;
        await this.characterReference.queueCharacterReference(projectId, character.id, { referenceKind: "preview_front" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_CHARACTER_PREVIEW_QUEUE_ERROR";
      this.logger.warn(`剧情结构已确认，但角色预览图自动排队失败：${message}`);
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
