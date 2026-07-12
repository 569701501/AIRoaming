export type G3ProjectDatabaseErrorCode =
  | "COMIC_FORMAT_IMMUTABLE"
  | "LEGACY_COMIC_FORMAT_DECISION_REQUIRED"
  | "G3_DATABASE_CONTRACT_VIOLATION";

export interface G3MappedProjectDatabaseError {
  readonly status: 409 | 500;
  readonly code: G3ProjectDatabaseErrorCode;
  readonly message: string;
  readonly cause: unknown;
  readonly details?: unknown;
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mapG3ProjectDatabaseError(
  error: unknown,
): G3MappedProjectDatabaseError | null {
  const message = text(error);
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "LEGACY_COMIC_FORMAT_DECISION_REQUIRED"
  ) {
    const issues = "issues" in error && Array.isArray(error.issues)
      ? error.issues.slice(0, 100)
      : [];
    return {
      status: 409,
      code: "LEGACY_COMIC_FORMAT_DECISION_REQUIRED",
      message: "LEGACY_COMIC_FORMAT_DECISION_REQUIRED",
      cause: error,
      details: { issueCount: issues.length, projects: issues },
    };
  }
  if (message.includes("AIR_G3:COMIC_FORMAT_IMMUTABLE")) {
    return {
      status: 409,
      code: "COMIC_FORMAT_IMMUTABLE",
      message: "COMIC_FORMAT_IMMUTABLE",
      cause: error,
    };
  }
  if (/AIR_G3:/.test(message)) {
    return {
      status: 500,
      code: "G3_DATABASE_CONTRACT_VIOLATION",
      message: "G3_DATABASE_CONTRACT_VIOLATION",
      cause: error,
    };
  }
  return null;
}
