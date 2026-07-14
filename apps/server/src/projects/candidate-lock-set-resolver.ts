import {
  digestCanonicalJson,
  type CandidateLockAction,
  type CandidateLockSetSummary,
  type CandidateStatus,
  type TaskApplicability,
} from "@airoaming/shared";

export interface CandidateLockSetRevisionInput {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  action: CandidateLockAction;
  candidateId: string | null;
}

export interface CandidateLockSetCandidateInput {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  status: CandidateStatus;
  assetReady: boolean;
  sourceApplicability: TaskApplicability;
}

export interface CandidateLockSetShotInput {
  shotId: string;
  lifecycleStatus: "active" | "retired";
  currentCandidateLockRevisionId: string | null;
  currentRevision: CandidateLockSetRevisionInput | null;
  candidate: CandidateLockSetCandidateInput | null;
}

export interface ResolveCandidateLockSetInput {
  projectId: string;
  chapterId: string;
  storyboardVersionId: string;
  shots: readonly CandidateLockSetShotInput[];
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUnicodeCodePoints);
}

function aggregateApplicability(values: readonly TaskApplicability[]): TaskApplicability {
  if (values.includes("legacy_unresolved")) return "legacy_unresolved";
  if (values.includes("historical")) return "historical";
  return "current";
}

export function resolveCandidateLockSet(
  input: ResolveCandidateLockSetInput,
): CandidateLockSetSummary {
  const entries: CandidateLockSetSummary["entries"] = [];
  const missingShotIds: string[] = [];
  const clearedShotIds: string[] = [];
  const unresolvedShotIds: string[] = [];
  const applicabilities: TaskApplicability[] = [];
  const activeShots = input.shots
    .filter((shot) => shot.lifecycleStatus === "active")
    .sort((left, right) => compareUnicodeCodePoints(left.shotId, right.shotId));

  for (const shot of activeShots) {
    if (shot.currentCandidateLockRevisionId === null) {
      missingShotIds.push(shot.shotId);
      continue;
    }
    const revision = shot.currentRevision;
    if (
      revision === null
      || revision.id !== shot.currentCandidateLockRevisionId
      || revision.projectId !== input.projectId
      || revision.chapterId !== input.chapterId
      || revision.shotId !== shot.shotId
    ) {
      unresolvedShotIds.push(shot.shotId);
      continue;
    }
    if (revision.action === "clear") {
      if (revision.candidateId === null) clearedShotIds.push(shot.shotId);
      else unresolvedShotIds.push(shot.shotId);
      continue;
    }
    const candidate = shot.candidate;
    if (
      revision.candidateId === null
      || candidate === null
      || candidate.id !== revision.candidateId
      || candidate.projectId !== input.projectId
      || candidate.chapterId !== input.chapterId
      || candidate.shotId !== shot.shotId
      || candidate.status !== "generated"
      || !candidate.assetReady
    ) {
      unresolvedShotIds.push(shot.shotId);
      continue;
    }
    entries.push({
      shotId: shot.shotId,
      candidateLockRevisionId: revision.id,
      candidateId: candidate.id,
    });
    applicabilities.push(candidate.sourceApplicability);
  }

  const sortedMissing = uniqueSorted(missingShotIds);
  const sortedCleared = uniqueSorted(clearedShotIds);
  const sortedUnresolved = uniqueSorted(unresolvedShotIds);
  const state = sortedUnresolved.length > 0
    ? "unresolved"
    : sortedMissing.length + sortedCleared.length > 0
      ? "incomplete"
      : "complete";
  const sortedEntries = [...entries].sort((left, right) => compareUnicodeCodePoints(left.shotId, right.shotId));
  const digest = state === "complete"
    ? digestCanonicalJson(sortedEntries.map(({ shotId, candidateLockRevisionId }) => ({ shotId, candidateLockRevisionId })))
    : null;
  return {
    schemaVersion: 1,
    projectId: input.projectId,
    chapterId: input.chapterId,
    storyboardVersionId: input.storyboardVersionId,
    state,
    sourceApplicability: state === "complete" ? aggregateApplicability(applicabilities) : null,
    entries: sortedEntries,
    missingShotIds: sortedMissing,
    clearedShotIds: sortedCleared,
    unresolvedShotIds: sortedUnresolved,
    digest,
  };
}
