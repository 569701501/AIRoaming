import {
  digestCanonicalJson,
  type AffectedLayoutBindingRef,
  type AffectedWorkingCopyElementRef,
  type CandidateLockAction,
  type CandidateLockImpactDetails,
} from "@airoaming/shared";

import type { WorkingCopyCandidateBindingProjection } from "./layout-working-copy-dependency-projector.js";

export const CANDIDATE_LOCK_IMPACT_POLICY_VERSION =
  "candidate_lock_impact_v1" as const;

export interface CandidateLockImpactFormalBindingInput {
  layoutRevisionId: string;
  elementId: string;
  role: string;
  shotId: string | null;
  candidateLockRevisionId: string | null;
}

export interface CandidateLockImpactExportInput {
  id: string;
  layoutRevisionId: string | null;
}

export interface CandidateLockImpactTaskSourceInput {
  sourceType: string;
  sourceId: string;
  sourceDigest: string;
}

export interface CandidateLockImpactTaskInput {
  id: string;
  type: string;
  status: string;
  targetShotId?: string;
  sources: readonly CandidateLockImpactTaskSourceInput[];
}

export interface AnalyzeCandidateLockImpactInput {
  projectId: string;
  chapterId: string;
  shotId: string;
  action: CandidateLockAction;
  targetCandidateId: string | null;
  expectedCurrentRevisionId: string | null;
  noOp: boolean;
  workingCopyBindings: readonly WorkingCopyCandidateBindingProjection[];
  formalBindings: readonly CandidateLockImpactFormalBindingInput[];
  exportRevisions: readonly CandidateLockImpactExportInput[];
  tasks: readonly CandidateLockImpactTaskInput[];
  currentLayoutRevisionId: string | null;
  currentExportRevisionId: string | null;
  currentCompleteLockSetDigest: string | null;
}

export interface CandidateLockImpactAnalysis {
  impact: CandidateLockImpactDetails;
  impactDigest: `sha256:${string}`;
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function sortedIds(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUnicodeCodePoints);
}

function sortedWorkingCopyRefs(
  values: readonly AffectedWorkingCopyElementRef[],
): AffectedWorkingCopyElementRef[] {
  const byKey = new Map(values.map((value) => [`${value.workingCopyId}\u0000${value.elementId}`, value]));
  return [...byKey.values()].sort((left, right) =>
    compareUnicodeCodePoints(left.workingCopyId, right.workingCopyId)
      || compareUnicodeCodePoints(left.elementId, right.elementId));
}

function sortedLayoutRefs(
  values: readonly AffectedLayoutBindingRef[],
): AffectedLayoutBindingRef[] {
  const byKey = new Map(values.map((value) => [`${value.layoutRevisionId}\u0000${value.elementId}`, value]));
  return [...byKey.values()].sort((left, right) =>
    compareUnicodeCodePoints(left.layoutRevisionId, right.layoutRevisionId)
      || compareUnicodeCodePoints(left.elementId, right.elementId));
}

function emptyImpact(): CandidateLockImpactDetails {
  return {
    affectedWorkingCopyElements: [],
    affectedLayoutBindings: [],
    affectedLayoutRevisionIds: [],
    affectedExportRevisionIds: [],
    activeTaskIds: [],
    currentLayoutRevisionAffected: false,
    currentExportRevisionAffected: false,
    alreadyStaleWorkingCopyElementCount: 0,
    unresolvedWorkingCopyElementCount: 0,
    preservedLayoutHistoryCount: 0,
    preservedExportHistoryCount: 0,
  };
}

function digest(
  input: AnalyzeCandidateLockImpactInput,
  impact: CandidateLockImpactDetails,
): `sha256:${string}` {
  return digestCanonicalJson({
    schemaVersion: 1,
    policyVersion: CANDIDATE_LOCK_IMPACT_POLICY_VERSION,
    projectId: input.projectId,
    chapterId: input.chapterId,
    shotId: input.shotId,
    action: input.action,
    targetCandidateId: input.targetCandidateId,
    expectedCurrentRevisionId: input.expectedCurrentRevisionId,
    affectedWorkingCopyElements: impact.affectedWorkingCopyElements,
    affectedLayoutBindings: impact.affectedLayoutBindings,
    affectedLayoutRevisionIds: impact.affectedLayoutRevisionIds,
    affectedExportRevisionIds: impact.affectedExportRevisionIds,
    activeTaskIds: impact.activeTaskIds,
  });
}

export function analyzeCandidateLockImpact(
  input: AnalyzeCandidateLockImpactInput,
): CandidateLockImpactAnalysis {
  if (input.noOp) {
    const impact = emptyImpact();
    return { impact, impactDigest: digest(input, impact) };
  }

  const expected = input.expectedCurrentRevisionId;
  const affectedWorkingCopyElements = sortedWorkingCopyRefs(
    expected === null
      ? []
      : input.workingCopyBindings
        .filter((binding) =>
          binding.shotId === input.shotId
          && binding.sourceCandidateLockRevisionId === expected)
        .map(({ workingCopyId, elementId }) => ({ workingCopyId, elementId })),
  );
  const affectedWorkingKeys = new Set(
    affectedWorkingCopyElements.map((value) => `${value.workingCopyId}\u0000${value.elementId}`),
  );
  const scopedWorking = input.workingCopyBindings.filter((binding) => binding.shotId === input.shotId);
  const alreadyStaleWorkingCopyElementCount = new Set(
    scopedWorking
      .filter((binding) =>
        binding.resolution === "stale"
        && !affectedWorkingKeys.has(`${binding.workingCopyId}\u0000${binding.elementId}`))
      .map((binding) => `${binding.workingCopyId}\u0000${binding.elementId}`),
  ).size;
  const unresolvedWorkingCopyElementCount = new Set(
    scopedWorking
      .filter((binding) => binding.resolution === "unresolved")
      .map((binding) => `${binding.workingCopyId}\u0000${binding.elementId}`),
  ).size;

  const affectedLayoutBindings = sortedLayoutRefs(
    expected === null
      ? []
      : input.formalBindings
        .filter((binding) =>
          binding.shotId === input.shotId
          && binding.candidateLockRevisionId === expected)
        .map(({ layoutRevisionId, elementId }) => ({ layoutRevisionId, elementId })),
  );
  const affectedLayoutRevisionIds = sortedIds(
    affectedLayoutBindings.map((binding) => binding.layoutRevisionId),
  );
  const affectedLayoutSet = new Set(affectedLayoutRevisionIds);
  const affectedExportRevisionIds = sortedIds(
    input.exportRevisions
      .filter((revision) =>
        revision.layoutRevisionId !== null
        && affectedLayoutSet.has(revision.layoutRevisionId))
      .map((revision) => revision.id),
  );
  const affectedExportSet = new Set(affectedExportRevisionIds);
  const activeStatuses = new Set(["queued", "running", "retrying"]);
  const activeTaskIds = sortedIds(
    input.tasks
      .filter((task) => activeStatuses.has(task.status))
      .filter((task) => task.sources.some((source) =>
        (expected !== null
          && source.sourceType === "candidate_lock_revision"
          && source.sourceId === expected)
        || (input.currentCompleteLockSetDigest !== null
          && source.sourceType === "lock_set"
          && source.sourceId === input.chapterId
          && source.sourceDigest === input.currentCompleteLockSetDigest)
        || (source.sourceType === "layout_revision"
          && affectedLayoutSet.has(source.sourceId))
        || (source.sourceType === "export_revision"
          && affectedExportSet.has(source.sourceId))))
      .map((task) => task.id),
  );
  const impact: CandidateLockImpactDetails = {
    affectedWorkingCopyElements,
    affectedLayoutBindings,
    affectedLayoutRevisionIds,
    affectedExportRevisionIds,
    activeTaskIds,
    currentLayoutRevisionAffected: input.currentLayoutRevisionId !== null
      && affectedLayoutSet.has(input.currentLayoutRevisionId),
    currentExportRevisionAffected: input.currentExportRevisionId !== null
      && affectedExportSet.has(input.currentExportRevisionId),
    alreadyStaleWorkingCopyElementCount,
    unresolvedWorkingCopyElementCount,
    preservedLayoutHistoryCount: affectedLayoutRevisionIds.length,
    preservedExportHistoryCount: affectedExportRevisionIds.length,
  };
  return { impact, impactDigest: digest(input, impact) };
}
