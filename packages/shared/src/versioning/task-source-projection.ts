import { digestCanonicalJson } from "./canonical-json.js";
import type { Digest } from "./document-contract.js";

export interface TaskSourceProjectionEntryV1 {
  role: string;
  order: number;
  sourceType: string;
  sourceId: string;
  sourceDigest: Digest;
}

export interface TaskSourceProjectionV1 {
  schemaVersion: 1;
  policyVersion: string;
  projectId: string;
  chapterId: string | null;
  consumerType: string;
  sources: TaskSourceProjectionEntryV1[];
}

function compareUtf8(left: string, right: string): number {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be non-empty`);
  }
  return value;
}

function digest(value: unknown, field: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${field} must be sha256:<64 lowercase hex>`);
  }
  return value as Digest;
}

/**
 * Canonicalizes task source rows using the same UTF-8/BINARY ordering as the
 * SQLite source-set trigger. The returned object is safe to persist as both
 * inputJson.sourceProjection and GenerationTaskSource rows.
 */
export function buildTaskSourceProjection(input: {
  policyVersion: string;
  projectId: string;
  chapterId: string | null;
  consumerType: string;
  sources: readonly Omit<TaskSourceProjectionEntryV1, "order">[];
}): TaskSourceProjectionV1 {
  const policyVersion = nonEmpty(input.policyVersion, "policyVersion");
  const projectId = nonEmpty(input.projectId, "projectId");
  const chapterId = input.chapterId === null ? null : nonEmpty(input.chapterId, "chapterId");
  const consumerType = nonEmpty(input.consumerType, "consumerType");
  if (input.sources.length === 0) throw new TypeError("sources must not be empty");

  const normalized = input.sources.map((source, index) => ({
    role: nonEmpty(source.role, `sources[${index}].role`),
    sourceType: nonEmpty(source.sourceType, `sources[${index}].sourceType`),
    sourceId: nonEmpty(source.sourceId, `sources[${index}].sourceId`),
    sourceDigest: digest(source.sourceDigest, `sources[${index}].sourceDigest`),
  }));
  const seen = new Set<string>();
  for (const source of normalized) {
    const key = `${source.role}\u0000${source.sourceType}\u0000${source.sourceId}`;
    if (seen.has(key)) throw new TypeError(`duplicate source ${key}`);
    seen.add(key);
  }

  normalized.sort((left, right) =>
    compareUtf8(left.role, right.role) ||
    compareUtf8(left.sourceType, right.sourceType) ||
    compareUtf8(left.sourceId, right.sourceId),
  );
  const roleOrders = new Map<string, number>();
  const sources = normalized.map((source) => {
    const order = (roleOrders.get(source.role) ?? 0) + 1;
    roleOrders.set(source.role, order);
    return { ...source, order };
  });
  return { schemaVersion: 1, policyVersion, projectId, chapterId, consumerType, sources };
}

export function taskSourceProjectionDigest(projection: TaskSourceProjectionV1): Digest {
  return digestCanonicalJson(projection);
}

