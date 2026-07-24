import type { LayoutDocumentV1OrV2 } from "@airoaming/shared";

/**
 * Restore concurrency belongs to the mutable Working Copy. The immutable
 * target revision may be V1 or V2, but it must never choose the request shape.
 */
export function restoreRequestSchemaForWorkingCopyV1(
  currentDocument: LayoutDocumentV1OrV2,
): 1 | 2 {
  return currentDocument.schemaVersion;
}
