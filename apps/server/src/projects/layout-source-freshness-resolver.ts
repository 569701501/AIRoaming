import type {
  ArtifactFreshness,
  CandidateLockAction,
  ExportRevisionSourceEvaluation,
  LayoutBindingSourceEvaluation,
  LayoutSourceEvaluation,
  LayoutSourceReasonCode,
  RevisionPosition,
  TaskApplicability,
} from "@airoaming/shared";

export interface LayoutBindingRelationInput {
  shotId: string | null;
  candidateLockRevisionId: string | null;
  sourceRevisionExists: boolean;
  scopeMatches: boolean;
  candidateExists: boolean;
  assetReady: boolean;
}

export interface EvaluateLayoutBindingSourceInput {
  layoutRevisionId: string | null;
  workingCopyId: string | null;
  elementId: string;
  binding: LayoutBindingRelationInput | null;
  currentCandidateLockRevisionId: string | null;
  currentAction: CandidateLockAction | null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return unique(values).sort(compareUnicodeCodePoints);
}

export function evaluateLayoutBindingSource(
  input: EvaluateLayoutBindingSourceInput,
): LayoutBindingSourceEvaluation {
  const base = {
    layoutRevisionId: input.layoutRevisionId,
    workingCopyId: input.workingCopyId,
    elementId: input.elementId,
    shotId: input.binding?.shotId ?? null,
    candidateLockRevisionId: input.binding?.candidateLockRevisionId ?? null,
    currentCandidateLockRevisionId: input.currentCandidateLockRevisionId,
  };
  if (input.binding === null) {
    return { ...base, resolution: "unresolved", reasonCodes: ["SOURCE_BINDING_MISSING"] };
  }
  const unresolved: LayoutSourceReasonCode[] = [];
  if (!input.binding.sourceRevisionExists || input.binding.candidateLockRevisionId === null) {
    unresolved.push("SOURCE_LOCK_REVISION_MISSING");
  }
  if (!input.binding.scopeMatches || input.binding.shotId === null) {
    unresolved.push("SOURCE_SCOPE_MISMATCH");
  }
  if (!input.binding.candidateExists) unresolved.push("SOURCE_CANDIDATE_MISSING");
  if (!input.binding.assetReady) unresolved.push("SOURCE_ASSET_NOT_READY");
  if (unresolved.length > 0) {
    return { ...base, resolution: "unresolved", reasonCodes: unique(unresolved) };
  }
  if (input.currentCandidateLockRevisionId === null) {
    return { ...base, resolution: "stale", reasonCodes: ["CURRENT_LOCK_MISSING"] };
  }
  if (input.currentAction === "clear") {
    return { ...base, resolution: "stale", reasonCodes: ["CURRENT_LOCK_CLEARED"] };
  }
  if (input.binding.candidateLockRevisionId !== input.currentCandidateLockRevisionId) {
    return { ...base, resolution: "stale", reasonCodes: ["SOURCE_LOCK_CHANGED"] };
  }
  return { ...base, resolution: "current", reasonCodes: [] };
}

export interface EvaluateLayoutSourceInput {
  revisionPosition: RevisionPosition;
  bindings: readonly LayoutBindingSourceEvaluation[];
  sourceLockSetDigest: string | null;
  bindingLockSetDigest: string | null;
  currentLockSetDigest: string | null;
}

function artifactFreshness(
  position: RevisionPosition,
  resolution: "current" | "stale" | "unresolved",
): ArtifactFreshness | null {
  if (position === "historical") return "historical";
  if (position === "working_copy" || resolution === "unresolved") return null;
  return resolution;
}

export function evaluateLayoutSource(
  input: EvaluateLayoutSourceInput,
): LayoutSourceEvaluation {
  const staleElementIds = uniqueSorted(
    input.bindings.filter((binding) => binding.resolution === "stale").map((binding) => binding.elementId),
  );
  const unresolvedElementIds = uniqueSorted(
    input.bindings.filter((binding) => binding.resolution === "unresolved").map((binding) => binding.elementId),
  );
  const digestMismatch = input.revisionPosition !== "working_copy"
    && input.sourceLockSetDigest !== input.bindingLockSetDigest;
  const sourceResolution = digestMismatch || unresolvedElementIds.length > 0
    ? "unresolved"
    : staleElementIds.length > 0
      ? "stale"
      : "current";
  const bindingReasons = input.bindings.flatMap((binding) => binding.reasonCodes);
  const reasonCodes = uniqueSorted<LayoutSourceReasonCode>([
    ...(digestMismatch ? ["LOCK_SET_DIGEST_MISMATCH" as const] : []),
    ...bindingReasons,
  ]);
  return {
    revisionPosition: input.revisionPosition,
    sourceResolution,
    artifactFreshness: artifactFreshness(input.revisionPosition, sourceResolution),
    sourceLockSetDigest: input.sourceLockSetDigest,
    currentLockSetDigest: input.currentLockSetDigest,
    staleElementIds,
    unresolvedElementIds,
    reasonCodes,
  };
}

export interface EvaluateExportRevisionSourceInput {
  revisionPosition: "current" | "historical";
  completionApplicability: TaskApplicability;
  layoutRevisionId: string;
  sourceLockSetDigest: string;
  currentLockSetDigest: string | null;
  layout: LayoutSourceEvaluation;
}

export function evaluateExportRevisionSource(
  input: EvaluateExportRevisionSourceInput,
): ExportRevisionSourceEvaluation {
  const digestMismatch = input.sourceLockSetDigest !== input.layout.sourceLockSetDigest;
  const sourceResolution = digestMismatch ? "unresolved" : input.layout.sourceResolution;
  const freshness: ArtifactFreshness | null = input.revisionPosition === "historical"
    ? "historical"
    : sourceResolution === "unresolved"
      ? null
      : sourceResolution;
  return {
    revisionPosition: input.revisionPosition,
    completionApplicability: input.completionApplicability,
    sourceResolution,
    artifactFreshness: freshness,
    layoutRevisionId: input.layoutRevisionId,
    sourceLockSetDigest: input.sourceLockSetDigest,
    currentLockSetDigest: input.currentLockSetDigest,
    reasonCodes: uniqueSorted([
      ...(digestMismatch ? ["LOCK_SET_DIGEST_MISMATCH"] : []),
      ...input.layout.reasonCodes,
    ]),
  };
}
