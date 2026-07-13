import { createHash } from "node:crypto";

/**
 * Runtime command identities are deliberately independent from the migration
 * ledger. Length-prefixed JSON gives us an unambiguous, deterministic key for
 * replay without timestamps, random UUIDs, or provider response material.
 */
export function createRuntimeCommandId(kind: string, parts: readonly string[]): string {
  const payload = JSON.stringify(parts.map((part) => `${part.length}:${part}`));
  const digest = createHash("sha256").update(payload, "utf8").digest("hex");
  return `${kind}_${digest.slice(0, 40)}`;
}

export function createScriptPendingIds(input: {
  projectId: string;
  chapterId: string;
  threadId: string;
  toolCallId: string;
  operation: string;
}): { pendingId: string; revisionId: string } {
  const parts = [input.projectId, input.chapterId, input.threadId, input.toolCallId, input.operation] as const;
  return {
    pendingId: createRuntimeCommandId("script_pending", parts),
    revisionId: createRuntimeCommandId("script_revision", parts),
  };
}

export function createScriptOutlineId(input: {
  projectId: string;
  threadId: string;
  toolCallId: string;
}): string {
  return createRuntimeCommandId("script_outline", [input.projectId, input.threadId, input.toolCallId]);
}
