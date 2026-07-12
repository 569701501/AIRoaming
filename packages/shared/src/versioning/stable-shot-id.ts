import { sha256Text } from "./canonical-json.js";

export interface StableShotIdInput {
  projectId: string;
  chapterId: string;
  pendingVersionId: string;
  requestId: string;
}

function required(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be non-empty`);
  return value;
}

/**
 * Stable identity for a Shot created in one pending storyboard request.
 * The request id is intentionally part of the namespace: retrying the same
 * command reuses the id, while a newly-created shot command receives a new id.
 */
export function stableShotId(input: StableShotIdInput): string {
  const projectId = required(input.projectId, "projectId");
  const chapterId = required(input.chapterId, "chapterId");
  const pendingVersionId = required(input.pendingVersionId, "pendingVersionId");
  const requestId = required(input.requestId, "requestId");
  const material = `g2-shot-v1\u0000${projectId}\u0000${chapterId}\u0000${pendingVersionId}\u0000${requestId}`;
  return `shot_${sha256Text(material).slice("sha256:".length, "sha256:".length + 32)}`;
}

export const buildStableShotId = stableShotId;
export const deriveStableShotId = stableShotId;
