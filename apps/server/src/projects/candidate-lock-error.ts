import type { CandidateLockErrorCode } from "@airoaming/shared";

export type CandidateLockHttpStatus = 400 | 404 | 409 | 422 | 500;

export class CandidateLockServiceError extends Error {
  constructor(
    readonly status: CandidateLockHttpStatus,
    readonly code: CandidateLockErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "CandidateLockServiceError";
  }
}

export function candidateLockError(
  status: CandidateLockHttpStatus,
  code: CandidateLockErrorCode,
  details?: unknown,
): CandidateLockServiceError {
  return new CandidateLockServiceError(status, code, details);
}
