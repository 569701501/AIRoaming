export interface ResolveLayoutWorkingCopySaveInput {
  currentRowVersion: number;
  currentDocumentDigest: string;
  expectedRowVersion: number;
  baseDocumentDigest: string;
  nextDocumentDigest: string;
}

export type LayoutWorkingCopySaveDecision =
  | { result: "update" }
  | { result: "no_op" }
  | { result: "replayed" };

export class LayoutWorkingCopyConflictError extends Error {
  readonly code = "LAYOUT_WORKING_COPY_CONFLICT" as const;
  readonly status = 409 as const;

  constructor(readonly currentRowVersion: number, readonly currentDocumentDigest: string) {
    super("LAYOUT_WORKING_COPY_CONFLICT");
    this.name = "LayoutWorkingCopyConflictError";
  }
}

export function resolveLayoutWorkingCopySave(
  input: ResolveLayoutWorkingCopySaveInput,
): LayoutWorkingCopySaveDecision {
  if (
    input.currentRowVersion === input.expectedRowVersion + 1
    && input.currentDocumentDigest === input.nextDocumentDigest
  ) {
    return { result: "replayed" };
  }
  if (
    input.currentRowVersion !== input.expectedRowVersion
    || input.currentDocumentDigest !== input.baseDocumentDigest
  ) {
    throw new LayoutWorkingCopyConflictError(
      input.currentRowVersion,
      input.currentDocumentDigest,
    );
  }
  return input.currentDocumentDigest === input.nextDocumentDigest
    ? { result: "no_op" }
    : { result: "update" };
}
