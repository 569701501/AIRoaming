import { Prisma } from "@prisma/client";

export type G2DatabaseErrorCode =
  | "G2_DB_MODE_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "CHAPTER_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "SCRIPT_VERSION_MISSING"
  | "SCRIPT_WORKING_EMPTY"
  | "CURRENT_VERSION_CHANGED"
  | "WORKING_DIGEST_CHANGED"
  | "VERSION_SCOPE_MISMATCH"
  | "VERSION_DOCUMENT_INVALID"
  | "LEGACY_WRITE_ROUTE_DISABLED"
  | "ACTIVE_PENDING_EXISTS"
  | "PENDING_VERSION_CONFLICT"
  | "CHAPTER_VERSION_CONFLICT"
  | "VERSION_CODEC_UPGRADE_REQUIRED"
  | "UPSTREAM_SOURCE_STALE"
  | "UPSTREAM_WORK_NOT_CONFIRMED"
  | "SHOT_ID_RETIRED"
  | "SHOT_ID_UNKNOWN"
  | "PREFLIGHT_SOURCE_CHANGED"
  | "SOURCE_UNRESOLVED"
  | "RAW_SOURCE_NOT_FOUND"
  | "IMPORT_ANALYSIS_NOT_FOUND"
  | "IMPORT_ANALYSIS_BLOCKED"
  | "IMPORT_MAP_NOT_FOUND"
  | "IMPORT_BATCH_NOT_FOUND"
  | "IMPORT_ITEM_NOT_FOUND"
  | "IMPORT_CHAPTER_OCCUPIED"
  | "IMPORT_ITEM_STATE_CONFLICT"
  | "IMPORT_FIDELITY_FAILED"
  | "IMPORT_PENDING_ACTION_NOT_ALLOWED"
  | "TASK_TARGET_SUPERSEDED"
  | "PROJECT_COMIC_FORMAT_CORRUPTED"
  | "G2_DATABASE_CONTRACT_VIOLATION";

export interface G2MappedDatabaseError {
  readonly status: 400 | 404 | 409 | 422 | 500;
  readonly code: G2DatabaseErrorCode;
  readonly message: string;
  readonly cause: unknown;
  readonly details?: unknown;
}

export class G2DatabaseError extends Error {
  readonly status: G2MappedDatabaseError["status"];
  readonly code: G2DatabaseErrorCode;
  readonly details?: unknown;

  constructor(mapped: G2MappedDatabaseError) {
    super(mapped.message, { cause: mapped.cause });
    this.name = "G2DatabaseError";
    this.status = mapped.status;
    this.code = mapped.code;
    this.details = mapped.details;
  }
}

function text(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function mapped(
  status: G2MappedDatabaseError["status"],
  code: G2DatabaseErrorCode,
  error: unknown,
): G2MappedDatabaseError {
  return { status, code, message: code, cause: error };
}

export function createG2DatabaseError(
  status: G2MappedDatabaseError["status"],
  code: G2DatabaseErrorCode,
  details?: unknown,
): G2DatabaseError {
  return new G2DatabaseError({ status, code, message: code, cause: details, details });
}

export function mapG2DatabaseError(error: unknown): G2MappedDatabaseError {
  const message = text(error);
  const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  const target = error instanceof Prisma.PrismaClientKnownRequestError
    ? String((error.meta as { target?: unknown } | undefined)?.target ?? "")
    : "";
  if (/uq_g2_.*active_pending|active.*pending.*chapter/i.test(message) || /chapter_id.*pending|pending.*chapter_id/i.test(target)) {
    return mapped(409, "ACTIVE_PENDING_EXISTS", error);
  }
  if (prismaCode === "P2002" && /story_versions|storyboard_versions|version/i.test(`${message}:${target}`)) {
    return mapped(409, "PENDING_VERSION_CONFLICT", error);
  }
  if (/pending_v2|schema_version|document_json|VERSION_CODEC_UPGRADE_REQUIRED/i.test(message)) {
    return mapped(400, "VERSION_CODEC_UPGRADE_REQUIRED", error);
  }
  if (/trg_g2_.*pending|pending_(?:story|storyboard)|PENDING_VERSION_CONFLICT/i.test(message)) {
    return mapped(409, "PENDING_VERSION_CONFLICT", error);
  }
  if (/trg_g2_chapters_(?:script_working|command_row_version)|CHAPTER_VERSION_CONFLICT/i.test(message)) {
    return mapped(409, "CHAPTER_VERSION_CONFLICT", error);
  }
  if (/current_source|confirm_source|UPSTREAM_SOURCE_STALE/i.test(message)) {
    return mapped(409, "UPSTREAM_SOURCE_STALE", error);
  }
  if (/new_work_gate_seal|UPSTREAM_WORK_NOT_CONFIRMED/i.test(message)) {
    return mapped(409, "UPSTREAM_WORK_NOT_CONFIRMED", error);
  }
  if (/shots_retired|SHOT_ID_RETIRED/i.test(message)) {
    return mapped(409, "SHOT_ID_RETIRED", error);
  }
  if (/preflight|PREFLIGHT_SOURCE_CHANGED/i.test(message)) {
    return mapped(409, "PREFLIGHT_SOURCE_CHANGED", error);
  }
  if (/SOURCE_UNRESOLVED/i.test(message)) {
    return mapped(422, "SOURCE_UNRESOLVED", error);
  }
  if (/AIR_SCRIPT_FLOW:.*(?:SCOPE|STATE|TRANSITION|CAS|IDENTITY)/i.test(message)) {
    return mapped(409, "IMPORT_ITEM_STATE_CONFLICT", error);
  }
  if (/AIR_SCRIPT_FLOW:/i.test(message)) {
    return mapped(422, "SOURCE_UNRESOLVED", error);
  }
  return mapped(500, "G2_DATABASE_CONTRACT_VIOLATION", error);
}

export function mapG2ConditionFailure(reason: string): G2MappedDatabaseError {
  if (/active.?pending/i.test(reason)) return mapped(409, "ACTIVE_PENDING_EXISTS", reason);
  if (/pending/i.test(reason)) return mapped(409, "PENDING_VERSION_CONFLICT", reason);
  if (/chapter.?version|row.?version/i.test(reason)) return mapped(409, "CHAPTER_VERSION_CONFLICT", reason);
  if (/stale|source/i.test(reason)) return mapped(409, "UPSTREAM_SOURCE_STALE", reason);
  if (/preflight/i.test(reason)) return mapped(409, "PREFLIGHT_SOURCE_CHANGED", reason);
  return mapped(500, "G2_DATABASE_CONTRACT_VIOLATION", reason);
}

export function throwMappedG2DatabaseError(error: unknown): never {
  throw new G2DatabaseError(mapG2DatabaseError(error));
}
