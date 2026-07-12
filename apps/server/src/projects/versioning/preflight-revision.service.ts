import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { ConfirmChapterPreflightRequest, ConfirmChapterPreflightResponse, GetChapterPreflightPreviewResponse } from "@airoaming/shared";
import { createG2DatabaseError, G2DatabaseError } from "./g2-database-error.mapper.js";
import { PreflightRevisionRepository } from "./preflight-revision.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

@Injectable()
export class PreflightRevisionService {
  constructor(@Inject(PreflightRevisionRepository) private readonly repository: PreflightRevisionRepository) {}

  getPreview(scope: VersionScopeV1, notes?: string): Promise<GetChapterPreflightPreviewResponse> {
    return this.execute(() => this.repository.getPreview(scope, notes?.trim() ?? ""));
  }

  confirm(scope: VersionScopeV1, request: ConfirmChapterPreflightRequest): Promise<ConfirmChapterPreflightResponse> {
    return this.execute(() => { validateConfirmRequest(request); return this.repository.confirm(scope, request); });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof G2DatabaseError) throw new HttpException({ success: false, error: { code: error.code, message: error.message, details: error.details } }, error.status);
      throw error;
    }
  }
}

function validateConfirmRequest(value: unknown): asserts value is ConfirmChapterPreflightRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { reason: "request must be an object" });
  const row = value as Record<string, unknown>;
  const allowed = new Set(["expectedSourceStoryboardVersionId", "expectedSourceDigest", "expectedChapterRowVersion", "notes"]);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: key, reason: "unknown field" });
  if (typeof row.expectedSourceStoryboardVersionId !== "string" || row.expectedSourceStoryboardVersionId.trim() === "") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "expectedSourceStoryboardVersionId" });
  if (typeof row.expectedSourceDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(row.expectedSourceDigest)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "expectedSourceDigest" });
  if (typeof row.expectedChapterRowVersion !== "number" || !Number.isInteger(row.expectedChapterRowVersion) || row.expectedChapterRowVersion < 0) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "expectedChapterRowVersion" });
  if (row.notes !== undefined && typeof row.notes !== "string") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "notes" });
}
