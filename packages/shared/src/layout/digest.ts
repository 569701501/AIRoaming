import { digestCanonicalJson } from "../versioning/canonical-json.js";
import type {
  CandidateImageSourceV1,
  LayoutDocumentV1,
  LayoutDigest,
  LayoutSourceBindingProjectionV1,
} from "./document.js";

export function digestCandidateImageSourceV1(
  source: Omit<CandidateImageSourceV1, "sourceDigest">,
  assetSha256: LayoutDigest,
): `sha256:${string}` {
  return digestCanonicalJson({
    schemaVersion: 1,
    role: "candidate_image",
    shotId: source.shotId,
    candidateId: source.candidateId,
    candidateLockRevisionId: source.candidateLockRevisionId,
    assetId: source.assetId,
    assetSha256,
  });
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

export function projectLayoutSourceBindings(document: LayoutDocumentV1): LayoutSourceBindingProjectionV1[] {
  const bindings: LayoutSourceBindingProjectionV1[] = [];
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      const source = element.type === "panel_frame"
        ? element.contentImage?.source ?? null
        : element.type === "free_image"
          ? element.source
          : null;
      if (!source) continue;
      bindings.push({
        elementId: element.type === "panel_frame" ? element.contentImage!.id : element.id,
        role: "candidate_image",
        order: bindings.length + 1,
        ...source,
      });
    }
  }
  return bindings;
}

export function digestLayoutSourceLockSet(
  document: LayoutDocumentV1,
  activeShotIds: readonly string[],
): `sha256:${string}` | null {
  const revisions = new Map<string, string>();
  for (const binding of projectLayoutSourceBindings(document)) {
    const existing = revisions.get(binding.shotId);
    if (existing !== undefined && existing !== binding.candidateLockRevisionId) {
      throw new Error(`shot ${binding.shotId} is bound to multiple lock revisions`);
    }
    revisions.set(binding.shotId, binding.candidateLockRevisionId);
  }
  const active = [...new Set(activeShotIds)].sort(compareUnicodeCodePoints);
  if (active.some((shotId) => !revisions.has(shotId))) return null;
  if ([...revisions.keys()].some((shotId) => !active.includes(shotId))) return null;
  return digestCanonicalJson(active.map((shotId) => ({
    shotId,
    candidateLockRevisionId: revisions.get(shotId)!,
  })));
}
