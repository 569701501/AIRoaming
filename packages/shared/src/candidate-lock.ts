import type { CandidateGenerationPurpose } from "./domain.js";
import type {
  StoryboardShotComic,
  StoryboardShotMotion,
  StoryboardShotStatus,
} from "./dto.js";
import type {
  ArtifactFreshness,
  ChapterProductionState,
} from "./versioning/production-state.js";

export const CANDIDATE_STATUSES = [
  "generated",
  "rejected",
  "superseded",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_LOCK_ACTIONS = ["lock", "replace", "clear"] as const;
export type CandidateLockAction = (typeof CANDIDATE_LOCK_ACTIONS)[number];

export const CANDIDATE_LOCK_DECISION_STATES = [
  "unset",
  "finalized",
  "cleared",
] as const;
export type CandidateLockDecisionState =
  (typeof CANDIDATE_LOCK_DECISION_STATES)[number];

export const CANDIDATE_LOCK_ORIGINS = ["runtime", "legacy_import"] as const;
export type CandidateLockOrigin = (typeof CANDIDATE_LOCK_ORIGINS)[number];

export const CANDIDATE_LOCK_COMMIT_RESULTS = [
  "created",
  "no_op",
  "replayed",
] as const;
export type CandidateLockCommitResult =
  (typeof CANDIDATE_LOCK_COMMIT_RESULTS)[number];

export const CANDIDATE_LOCK_SET_STATES = [
  "complete",
  "incomplete",
  "unresolved",
] as const;
export type CandidateLockSetState =
  (typeof CANDIDATE_LOCK_SET_STATES)[number];

export type CandidateDecisionState = CandidateLockDecisionState;

export const BINDING_SOURCE_RESOLUTIONS = [
  "current",
  "stale",
  "unresolved",
] as const;
export type BindingSourceResolution =
  (typeof BINDING_SOURCE_RESOLUTIONS)[number];

export const REVISION_POSITIONS = [
  "working_copy",
  "current",
  "historical",
] as const;
export type RevisionPosition = (typeof REVISION_POSITIONS)[number];

export const TASK_APPLICABILITIES = [
  "current",
  "historical",
  "legacy_unresolved",
] as const;
export type TaskApplicability = (typeof TASK_APPLICABILITIES)[number];

export interface CandidateRecord {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  taskId: string;
  assetId: string;
  index: number;
  status: CandidateStatus;
  favoriteAt: string | null;
  label: string;
  notes: string;
  score: number | null;
  promptDigest: string | null;
  generationPurpose: CandidateGenerationPurpose;
  generationSpecVersion: number | null;
  generationSpecDigest: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateLockRevisionRecord {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  revision: number;
  action: CandidateLockAction;
  candidateId: string | null;
  previousRevisionId: string | null;
  origin: CandidateLockOrigin;
  reason: string | null;
  decidedAt: string | null;
  recordedAt: string;
}

export type CandidateLockRevisionDto = CandidateLockRevisionRecord;

export type CurrentCandidateDecision =
  | {
      state: "unset";
      revisionId: null;
      revision: null;
      action: null;
      candidateId: null;
      previousRevisionId: null;
      decidedAt: null;
    }
  | {
      state: "finalized";
      revisionId: string;
      revision: number;
      action: "lock" | "replace";
      candidateId: string;
      previousRevisionId: string | null;
      decidedAt: string | null;
    }
  | {
      state: "cleared";
      revisionId: string;
      revision: number;
      action: "clear";
      candidateId: null;
      previousRevisionId: string;
      decidedAt: string | null;
    };

export type CandidateLockIntent =
  | { action: "lock"; candidateId: string }
  | { action: "replace"; candidateId: string }
  | { action: "clear" };

export type PreviewCandidateLockRequest = CandidateLockIntent;

interface CandidateLockCommitFields {
  expectedCurrentRevisionId: string | null;
  impactDigest: `sha256:${string}`;
  reason: string | null;
}

export type CommitCandidateLockRequest =
  | ({ action: "lock"; candidateId: string } & CandidateLockCommitFields)
  | ({ action: "replace"; candidateId: string } & CandidateLockCommitFields)
  | ({ action: "clear" } & CandidateLockCommitFields);

export type CandidateLockErrorCode =
  | "CANDIDATE_LOCK_BODY_INVALID"
  | "CANDIDATE_LOCK_BODY_UNKNOWN_FIELD"
  | "CANDIDATE_LOCK_ACTION_REQUIRED"
  | "CANDIDATE_LOCK_ACTION_INVALID"
  | "CANDIDATE_ID_REQUIRED"
  | "CANDIDATE_ID_INVALID"
  | "CANDIDATE_ID_FORBIDDEN"
  | "EXPECTED_CURRENT_REVISION_REQUIRED"
  | "EXPECTED_CURRENT_REVISION_INVALID"
  | "IMPACT_DIGEST_REQUIRED"
  | "IMPACT_DIGEST_INVALID"
  | "CANDIDATE_LOCK_REASON_TOO_LONG"
  | "PROJECT_NOT_FOUND"
  | "CHAPTER_NOT_FOUND"
  | "SHOT_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_SHOT_MISMATCH"
  | "CANDIDATE_REJECTED"
  | "CANDIDATE_SUPERSEDED"
  | "CANDIDATE_ASSET_NOT_READY"
  | "CANDIDATE_LOCK_REVISION_CONFLICT"
  | "CANDIDATE_LOCK_IMPACT_CHANGED"
  | "CANDIDATE_SOURCE_NOT_CURRENT"
  | "SHOT_NOT_ACTIVE"
  | "UPSTREAM_WORK_NOT_CONFIRMED"
  | "CANDIDATE_IS_CURRENT_FINAL"
  | "CANDIDATE_STATUS_TRANSITION_INVALID"
  | "CANDIDATE_LOCK_SET_INCOMPLETE"
  | "CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT"
  | "LAYOUT_SOURCE_STALE"
  | "LAYOUT_SOURCE_UNRESOLVED"
  | "LAYOUT_SOURCE_DIGEST_MISMATCH";

export type CandidateLockContractErrorCode = Extract<
  CandidateLockErrorCode,
  | "CANDIDATE_LOCK_BODY_INVALID"
  | "CANDIDATE_LOCK_BODY_UNKNOWN_FIELD"
  | "CANDIDATE_LOCK_ACTION_REQUIRED"
  | "CANDIDATE_LOCK_ACTION_INVALID"
  | "CANDIDATE_ID_REQUIRED"
  | "CANDIDATE_ID_INVALID"
  | "CANDIDATE_ID_FORBIDDEN"
  | "EXPECTED_CURRENT_REVISION_REQUIRED"
  | "EXPECTED_CURRENT_REVISION_INVALID"
  | "IMPACT_DIGEST_REQUIRED"
  | "IMPACT_DIGEST_INVALID"
  | "CANDIDATE_LOCK_REASON_TOO_LONG"
>;

export class CandidateLockContractError extends Error {
  constructor(readonly code: CandidateLockContractErrorCode) {
    super(code);
    this.name = "CandidateLockContractError";
  }
}

function fail(code: CandidateLockContractErrorCode): never {
  throw new CandidateLockContractError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("CANDIDATE_LOCK_BODY_INVALID");
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedFields = new Set(allowed);
  if (Object.keys(input).some((key) => !allowedFields.has(key))) {
    fail("CANDIDATE_LOCK_BODY_UNKNOWN_FIELD");
  }
}

function parseAction(input: Record<string, unknown>): CandidateLockAction {
  if (!("action" in input)) fail("CANDIDATE_LOCK_ACTION_REQUIRED");
  if (
    typeof input.action !== "string" ||
    !CANDIDATE_LOCK_ACTIONS.includes(
      input.action as (typeof CANDIDATE_LOCK_ACTIONS)[number],
    )
  ) {
    fail("CANDIDATE_LOCK_ACTION_INVALID");
  }
  return input.action as CandidateLockAction;
}

function parseCandidateId(input: Record<string, unknown>): string {
  const value = input.candidateId;
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    fail("CANDIDATE_ID_REQUIRED");
  }
  if (typeof value !== "string" || value.trim() !== value) {
    fail("CANDIDATE_ID_INVALID");
  }
  return value;
}

export function parsePreviewCandidateLockRequest(
  value: unknown,
): PreviewCandidateLockRequest {
  const input = record(value);
  assertKnownFields(input, ["action", "candidateId"]);
  const action = parseAction(input);
  if (action === "clear") {
    if ("candidateId" in input) fail("CANDIDATE_ID_FORBIDDEN");
    return { action };
  }
  return { action, candidateId: parseCandidateId(input) };
}

export function parseCommitCandidateLockRequest(
  value: unknown,
): CommitCandidateLockRequest {
  const input = record(value);
  assertKnownFields(input, [
    "action",
    "candidateId",
    "expectedCurrentRevisionId",
    "impactDigest",
    "reason",
  ]);
  const action = parseAction(input);
  const intent: CandidateLockIntent = action === "clear"
    ? (() => {
        if ("candidateId" in input) fail("CANDIDATE_ID_FORBIDDEN");
        return { action };
      })()
    : { action, candidateId: parseCandidateId(input) };

  if (!("expectedCurrentRevisionId" in input)) {
    fail("EXPECTED_CURRENT_REVISION_REQUIRED");
  }
  const expected = input.expectedCurrentRevisionId;
  if (
    expected !== null &&
    (typeof expected !== "string" ||
      expected.length === 0 ||
      expected.trim() !== expected)
  ) {
    fail("EXPECTED_CURRENT_REVISION_INVALID");
  }

  if (!("impactDigest" in input) || input.impactDigest === "") {
    fail("IMPACT_DIGEST_REQUIRED");
  }
  if (
    typeof input.impactDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(input.impactDigest)
  ) {
    fail("IMPACT_DIGEST_INVALID");
  }

  if (input.reason !== undefined && typeof input.reason !== "string") {
    fail("CANDIDATE_LOCK_BODY_INVALID");
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if ([...reason].length > 500) fail("CANDIDATE_LOCK_REASON_TOO_LONG");

  return {
    ...intent,
    expectedCurrentRevisionId: expected as string | null,
    impactDigest: input.impactDigest as `sha256:${string}`,
    reason: reason || null,
  } as CommitCandidateLockRequest;
}

export type CandidateLockabilityReasonCode =
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_SHOT_MISMATCH"
  | "CANDIDATE_REJECTED"
  | "CANDIDATE_SUPERSEDED"
  | "CANDIDATE_ASSET_NOT_READY"
  | "CANDIDATE_SOURCE_NOT_CURRENT"
  | "SHOT_NOT_ACTIVE"
  | "UPSTREAM_WORK_NOT_CONFIRMED";

export interface CandidateLockability {
  lockable: boolean;
  candidateId: string;
  sourceApplicability: TaskApplicability | null;
  reasonCodes: CandidateLockabilityReasonCode[];
}

export interface CandidateLockSetEntry {
  shotId: string;
  candidateLockRevisionId: string;
  candidateId: string;
}

export interface CandidateLockSetSummary {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  storyboardVersionId: string;
  state: CandidateLockSetState;
  sourceApplicability: TaskApplicability | null;
  entries: CandidateLockSetEntry[];
  missingShotIds: string[];
  clearedShotIds: string[];
  unresolvedShotIds: string[];
  digest: string | null;
}

export interface AffectedWorkingCopyElementRef {
  workingCopyId: string;
  elementId: string;
}

export interface AffectedLayoutBindingRef {
  layoutRevisionId: string;
  elementId: string;
}

export interface CandidateLockImpactDetails {
  affectedWorkingCopyElements: AffectedWorkingCopyElementRef[];
  affectedLayoutBindings: AffectedLayoutBindingRef[];
  affectedLayoutRevisionIds: string[];
  affectedExportRevisionIds: string[];
  activeTaskIds: string[];
  currentLayoutRevisionAffected: boolean;
  currentExportRevisionAffected: boolean;
  alreadyStaleWorkingCopyElementCount: number;
  unresolvedWorkingCopyElementCount: number;
  preservedLayoutHistoryCount: number;
  preservedExportHistoryCount: number;
}

export interface CandidateLockImpactPreviewResponse {
  schemaVersion: 1;
  policyVersion: "candidate_lock_impact_v1";
  projectId: string;
  chapterId: string;
  shotId: string;
  action: CandidateLockAction;
  targetCandidateId: string | null;
  currentDecision: CurrentCandidateDecision;
  expectedCurrentRevisionId: string | null;
  noOp: boolean;
  commitAllowed: boolean;
  commitBlockedReasonCodes: CandidateLockabilityReasonCode[];
  impact: CandidateLockImpactDetails;
  impactDigest: string;
}

export interface WorkbenchShotV2 {
  id: string;
  chapterId: string;
  order: number;
  beatId: string | null;
  sceneId: string | null;
  sceneName: string;
  characterIds: string[];
  characters: string[];
  coreAction: string;
  emotion: string;
  comic: StoryboardShotComic;
  motion: StoryboardShotMotion;
  promptDraft: string;
  status: StoryboardShotStatus;
  currentCandidateDecision: CurrentCandidateDecision;
}

export interface WorkbenchCandidateV2 {
  id: string;
  chapterId: string;
  shotId: string;
  label: string;
  status: CandidateStatus;
  favoriteAt: string | null;
  isCurrentFinal: boolean;
  sourceApplicability: TaskApplicability;
  assetId: string;
  taskId: string;
  index: number;
  promptDigest: string | null;
  generationPurpose: CandidateGenerationPurpose;
  generationSpecVersion: number | null;
  generationSpecDigest: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateLockCommitResponse {
  schemaVersion: 1;
  result: CandidateLockCommitResult;
  revision: CandidateLockRevisionDto;
  currentDecision: CurrentCandidateDecision;
  shot: WorkbenchShotV2;
  candidatesForShot: WorkbenchCandidateV2[];
  candidateLockSet: CandidateLockSetSummary;
  productionState: ChapterProductionState;
  committedImpact: CandidateLockImpactDetails;
}

export type LayoutSourceReasonCode =
  | "SOURCE_BINDING_MISSING"
  | "SOURCE_LOCK_REVISION_MISSING"
  | "SOURCE_SCOPE_MISMATCH"
  | "SOURCE_CANDIDATE_MISSING"
  | "SOURCE_ASSET_NOT_READY"
  | "CURRENT_LOCK_MISSING"
  | "CURRENT_LOCK_CLEARED"
  | "SOURCE_LOCK_CHANGED"
  | "LOCK_SET_DIGEST_MISMATCH";

export interface LayoutBindingSourceEvaluation {
  layoutRevisionId: string | null;
  workingCopyId: string | null;
  elementId: string;
  shotId: string | null;
  candidateLockRevisionId: string | null;
  currentCandidateLockRevisionId: string | null;
  resolution: BindingSourceResolution;
  reasonCodes: LayoutSourceReasonCode[];
}

export interface LayoutSourceEvaluation {
  revisionPosition: RevisionPosition;
  sourceResolution: BindingSourceResolution;
  artifactFreshness: ArtifactFreshness | null;
  sourceLockSetDigest: string | null;
  currentLockSetDigest: string | null;
  staleElementIds: string[];
  unresolvedElementIds: string[];
  reasonCodes: LayoutSourceReasonCode[];
}

export interface ExportRevisionSourceEvaluation {
  revisionPosition: "current" | "historical";
  completionApplicability: TaskApplicability;
  sourceResolution: BindingSourceResolution;
  artifactFreshness: ArtifactFreshness | null;
  layoutRevisionId: string;
  sourceLockSetDigest: string;
  currentLockSetDigest: string | null;
  reasonCodes: string[];
}
