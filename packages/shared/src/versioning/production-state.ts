import { digestCanonicalJson } from "./canonical-json.js";
import type { Digest, PreflightSourceSnapshotV1 } from "./document-contract.js";
import type { CandidateChapterSourceState } from "../candidate-lock.js";
import { sourceSnapshotDigest } from "./source-snapshot.js";

export type ArtifactFreshness = "current" | "stale" | "historical" | "pending";
export type VersionLifecycleStatus = "pending_confirmation" | "confirmed" | "archived";
export type PendingReadiness = "generating" | "ready" | "failed";
export type ScriptWorkingState = "empty" | "clean" | "dirty";
export type ChapterMilestoneStatus = "draft" | "script_done" | "structured" | "storyboard_done" | "images_done" | "layout_done" | "exported";
export type FreshnessReasonCode =
  | "SCRIPT_VERSION_MISSING" | "SCRIPT_WORKING_EMPTY" | "SCRIPT_WORKING_DIRTY" | "SCRIPT_AI_PENDING" | "SCRIPT_IMPORT_PENDING"
  | "STORY_VERSION_MISSING" | "STORY_PENDING_CONFIRMATION" | "STORYBOARD_VERSION_MISSING" | "STORYBOARD_PENDING_CONFIRMATION" | "PREFLIGHT_MISSING"
  | "STORY_SOURCE_SCRIPT_CHANGED" | "STORY_SOURCE_UNRESOLVED" | "STORYBOARD_SOURCE_STORY_CHANGED" | "STORYBOARD_SOURCE_UNRESOLVED"
  | "PREFLIGHT_SOURCE_STORYBOARD_CHANGED" | "PREFLIGHT_CHARACTER_INPUT_CHANGED" | "PREFLIGHT_SCENE_INPUT_CHANGED" | "PREFLIGHT_STYLE_INPUT_CHANGED" | "PREFLIGHT_SOURCE_UNRESOLVED" | "UPSTREAM_STALE" | "SOURCE_POLICY_UNSUPPORTED"
  | "EXPECTED_CURRENT_VERSION_MISMATCH" | "WORKING_COPY_CHANGED" | "PENDING_VERSION_CHANGED" | "SOURCE_SNAPSHOT_CHANGED" | "VERSION_SCOPE_MISMATCH" | "VERSION_LIFECYCLE_INVALID" | "VERSION_DOCUMENT_INVALID" | "SHOT_ID_RETIRED" | "TASK_TARGET_SUPERSEDED";

export interface VersionGraphArtifact {
  id: string;
  projectId: string;
  chapterId: string;
  status: VersionLifecycleStatus;
  sourceId: string | null;
  sourceDigest: Digest | null;
  documentDigest: Digest | null;
  sourcePolicyVersion: string | null;
  pendingReadiness?: PendingReadiness;
}

export interface ChapterScriptArtifact {
  id: string;
  projectId: string;
  chapterId: string;
  status: VersionLifecycleStatus | "current";
  sourceDigest: Digest;
}

export interface ChapterVersionGraphChapter {
  id: string;
  projectId: string;
  rowVersion: number;
  milestoneStatus: ChapterMilestoneStatus;
  scriptWorkingText: string;
  scriptWorkingDigest: Digest | null;
  scriptWorkingState?: ScriptWorkingState;
  hasAiPending?: boolean;
  hasScriptPending?: boolean;
  pendingKind?: "legacy" | "ai" | "import" | null;
  currentScriptVersionId: string | null;
  currentStoryVersionId: string | null;
  pendingStoryVersionId: string | null;
  currentStoryboardVersionId: string | null;
  pendingStoryboardVersionId: string | null;
  currentPreflightRevisionId: string | null;
}

export interface ChapterVersionGraphInput {
  chapter: ChapterVersionGraphChapter;
  currentScript: ChapterScriptArtifact | null;
  currentStory: VersionGraphArtifact | null;
  pendingStory: VersionGraphArtifact | null;
  currentStoryboard: VersionGraphArtifact | null;
  pendingStoryboard: VersionGraphArtifact | null;
  currentPreflight: VersionGraphArtifact | null;
  currentPreflightSourceSnapshot: PreflightSourceSnapshotV1 | null;
  historyCounts: Record<string, number>;
}

export interface VersionNodeState {
  currentVersionId: string | null;
  pendingVersionId: string | null;
  freshness: ArtifactFreshness | null;
  sourceDigest: Digest | null;
  pendingReadiness: PendingReadiness | null;
  historyCount: number;
  reasonCodes: FreshnessReasonCode[];
}

export interface ScriptVersionNodeState extends VersionNodeState {
  workingState: ScriptWorkingState;
  workingDigest: Digest | null;
  hasAiPending: boolean;
  hasScriptPending: boolean;
  pendingKind: "legacy" | "ai" | "import" | null;
}

export interface ChapterProductionState {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  chapterRowVersion: number;
  milestoneStatus: ChapterMilestoneStatus;
  script: ScriptVersionNodeState;
  story: VersionNodeState;
  storyboard: VersionNodeState;
  preflight: VersionNodeState;
  earliestAttentionStep: "project_story" | "story_structure" | "storyboard" | "image_preflight";
  generatedAt: string;
  candidateSources?: CandidateChapterSourceState;
}

function uniqueReasons(values: readonly FreshnessReasonCode[]): FreshnessReasonCode[] {
  return [...new Set(values)];
}

function historyCount(historyCounts: Record<string, number>, key: string): number {
  const value = historyCounts[key] ?? 0;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function baseNode(input: { currentVersionId: string | null; pendingVersionId: string | null; sourceDigest: Digest | null; historyCount: number; pendingReadiness?: PendingReadiness; }): VersionNodeState {
  return { currentVersionId: input.currentVersionId, pendingVersionId: input.pendingVersionId, freshness: null, sourceDigest: input.sourceDigest, pendingReadiness: input.pendingReadiness ?? null, historyCount: input.historyCount, reasonCodes: [] };
}

function checkScope(row: VersionGraphArtifact, chapter: ChapterVersionGraphChapter): FreshnessReasonCode | null {
  return row.projectId !== chapter.projectId || row.chapterId !== chapter.id ? "VERSION_SCOPE_MISMATCH" : null;
}

function resolveDerivedNode(input: {
  chapter: ChapterVersionGraphChapter;
  current: VersionGraphArtifact | null;
  pending: VersionGraphArtifact | null;
  currentVersionId: string | null;
  pendingVersionId: string | null;
  sourcePolicyVersion: string;
  expectedSource: { id: string; digest: Digest } | null;
  missingReason: FreshnessReasonCode;
  pendingReason: FreshnessReasonCode;
  changedReason: FreshnessReasonCode;
  unresolvedReason: FreshnessReasonCode;
  upstreamFreshness: ArtifactFreshness | null;
  historyKey: string;
  historyCounts: Record<string, number>;
}): VersionNodeState {
  const node = baseNode({ currentVersionId: input.currentVersionId, pendingVersionId: input.pendingVersionId, sourceDigest: input.current?.sourceDigest ?? null, pendingReadiness: input.pending?.pendingReadiness, historyCount: historyCount(input.historyCounts, input.historyKey) });
  if (input.pendingVersionId !== null && input.pending?.id !== input.pendingVersionId) {
    node.freshness = "stale";
    node.reasonCodes.push("PENDING_VERSION_CHANGED");
    return node;
  }
  if (input.pendingVersionId !== null && input.pending?.id === input.pendingVersionId && input.pending.status === "pending_confirmation") {
    node.freshness = "pending"; node.reasonCodes.push(input.pendingReason); return node;
  }
  if (input.currentVersionId === null || input.current === null) {
    node.freshness = null; node.reasonCodes.push(input.missingReason); return node;
  }
  if (input.current.id !== input.currentVersionId) {
    node.freshness = "historical"; node.reasonCodes.push("VERSION_DOCUMENT_INVALID"); return node;
  }
  const scopeReason = checkScope(input.current, input.chapter);
  if (scopeReason !== null) { node.freshness = "stale"; node.reasonCodes.push(scopeReason); return node; }
  if (input.current.status !== "confirmed") { node.freshness = "stale"; node.reasonCodes.push("VERSION_LIFECYCLE_INVALID"); return node; }
  if (input.current.sourcePolicyVersion !== input.sourcePolicyVersion) { node.freshness = "stale"; node.reasonCodes.push("SOURCE_POLICY_UNSUPPORTED"); return node; }
  if (input.current.sourceId === null || input.current.sourceDigest === null || input.current.documentDigest === null) { node.freshness = "stale"; node.reasonCodes.push(input.unresolvedReason); return node; }
  if (input.upstreamFreshness !== null && input.upstreamFreshness !== "current") { node.freshness = "stale"; node.reasonCodes.push("UPSTREAM_STALE"); return node; }
  if (input.expectedSource === null) { node.freshness = "stale"; node.reasonCodes.push(input.unresolvedReason); return node; }
  if (input.current.sourceId !== input.expectedSource.id || input.current.sourceDigest !== input.expectedSource.digest) { node.freshness = "stale"; node.reasonCodes.push(input.changedReason); return node; }
  node.freshness = "current";
  return node;
}

function resolveScript(input: ChapterVersionGraphInput): ScriptVersionNodeState {
  const chapter = input.chapter;
  const workingState = chapter.scriptWorkingState ?? (chapter.scriptWorkingText.trim() === "" ? "empty" : input.currentScript?.id ? (chapter.scriptWorkingDigest === input.currentScript.sourceDigest ? "clean" : "dirty") : "dirty");
  const hasAiPending = chapter.hasAiPending ?? false;
  const hasScriptPending = chapter.hasScriptPending ?? hasAiPending;
  const pendingKind = chapter.pendingKind ?? (hasAiPending ? "legacy" : null);
  const node: ScriptVersionNodeState = { ...baseNode({ currentVersionId: chapter.currentScriptVersionId, pendingVersionId: null, sourceDigest: input.currentScript?.sourceDigest ?? null, historyCount: historyCount(input.historyCounts, "script") }), workingState, workingDigest: chapter.scriptWorkingDigest, hasAiPending, hasScriptPending, pendingKind };
  if (chapter.currentScriptVersionId === null || input.currentScript === null) { node.freshness = null; node.reasonCodes.push("SCRIPT_VERSION_MISSING"); }
  else if (input.currentScript.id !== chapter.currentScriptVersionId) { node.freshness = "historical"; node.reasonCodes.push("VERSION_DOCUMENT_INVALID"); }
  else if (input.currentScript.projectId !== chapter.projectId || input.currentScript.chapterId !== chapter.id) { node.freshness = "stale"; node.reasonCodes.push("VERSION_SCOPE_MISMATCH"); }
  else if (input.currentScript.status !== "confirmed" && input.currentScript.status !== "current") { node.freshness = "stale"; node.reasonCodes.push("VERSION_LIFECYCLE_INVALID"); }
  else node.freshness = "current";
  if (workingState === "empty") node.reasonCodes.push("SCRIPT_WORKING_EMPTY");
  else if (workingState === "dirty") node.reasonCodes.push("SCRIPT_WORKING_DIRTY");
  if (node.hasScriptPending) node.reasonCodes.push(node.pendingKind === "import" ? "SCRIPT_IMPORT_PENDING" : "SCRIPT_AI_PENDING");
  return node;
}

function expectedPreflightSource(input: ChapterVersionGraphInput): { id: string; digest: Digest } | null {
  const storyboard = input.currentStoryboard;
  const snapshot = input.currentPreflightSourceSnapshot;
  if (storyboard === null || snapshot === null) return null;
  if (snapshot.storyboard.id !== storyboard.id || snapshot.storyboard.digest !== storyboard.documentDigest) return null;
  if (input.currentPreflight?.sourceDigest !== sourceSnapshotDigest(snapshot)) return null;
  return { id: storyboard.id, digest: sourceSnapshotDigest(snapshot) };
}

export function resolveChapterProductionState(input: ChapterVersionGraphInput, generatedAt = new Date().toISOString()): ChapterProductionState {
  const script = resolveScript(input);
  const scriptUpstream: ArtifactFreshness | null = script.freshness === null ? null : script.freshness === "current" && script.workingState === "clean" && !script.hasScriptPending ? "current" : "stale";
  const story = resolveDerivedNode({ chapter: input.chapter, current: input.currentStory, pending: input.pendingStory, currentVersionId: input.chapter.currentStoryVersionId, pendingVersionId: input.chapter.pendingStoryVersionId, sourcePolicyVersion: "story-source-v1", expectedSource: script.currentVersionId !== null && input.currentScript !== null ? { id: input.currentScript.id, digest: input.currentScript.sourceDigest } : null, missingReason: "STORY_VERSION_MISSING", pendingReason: "STORY_PENDING_CONFIRMATION", changedReason: "STORY_SOURCE_SCRIPT_CHANGED", unresolvedReason: "STORY_SOURCE_UNRESOLVED", upstreamFreshness: scriptUpstream, historyKey: "story", historyCounts: input.historyCounts });
  const storyboard = resolveDerivedNode({ chapter: input.chapter, current: input.currentStoryboard, pending: input.pendingStoryboard, currentVersionId: input.chapter.currentStoryboardVersionId, pendingVersionId: input.chapter.pendingStoryboardVersionId, sourcePolicyVersion: "storyboard-source-v1", expectedSource: story.freshness === "current" && input.currentStory?.documentDigest !== null && input.currentStory?.documentDigest !== undefined ? { id: input.currentStory.id, digest: input.currentStory.documentDigest } as { id: string; digest: Digest } : null, missingReason: "STORYBOARD_VERSION_MISSING", pendingReason: "STORYBOARD_PENDING_CONFIRMATION", changedReason: "STORYBOARD_SOURCE_STORY_CHANGED", unresolvedReason: "STORYBOARD_SOURCE_UNRESOLVED", upstreamFreshness: story.freshness, historyKey: "storyboard", historyCounts: input.historyCounts });
  const preflightExpected = expectedPreflightSource(input);
  const preflightSourceChanged = input.currentPreflightSourceSnapshot !== null
    && input.currentStoryboard !== null
    && (input.currentPreflightSourceSnapshot.storyboard.id !== input.currentStoryboard.id || input.currentPreflightSourceSnapshot.storyboard.digest !== input.currentStoryboard.documentDigest);
  const preflightUnresolvedReason: FreshnessReasonCode = preflightSourceChanged ? "PREFLIGHT_SOURCE_STORYBOARD_CHANGED" : "PREFLIGHT_SOURCE_UNRESOLVED";
  const preflight = resolveDerivedNode({ chapter: input.chapter, current: input.currentPreflight, pending: null, currentVersionId: input.chapter.currentPreflightRevisionId, pendingVersionId: null, sourcePolicyVersion: "preflight-source-v2", expectedSource: storyboard.freshness === "current" ? preflightExpected : null, missingReason: "PREFLIGHT_MISSING", pendingReason: "PREFLIGHT_MISSING", changedReason: preflightSourceChanged ? "PREFLIGHT_SOURCE_STORYBOARD_CHANGED" : "PREFLIGHT_SOURCE_UNRESOLVED", unresolvedReason: preflightUnresolvedReason, upstreamFreshness: storyboard.freshness, historyKey: "preflight", historyCounts: input.historyCounts });
  const earliestAttentionStep = script.freshness !== "current" || script.workingState !== "clean" || script.hasScriptPending ? "project_story" : story.freshness !== "current" ? "story_structure" : storyboard.freshness !== "current" ? "storyboard" : preflight.freshness !== "current" ? "image_preflight" : "image_preflight";
  return { schemaVersion: 1, projectId: input.chapter.projectId, chapterId: input.chapter.id, chapterRowVersion: input.chapter.rowVersion, milestoneStatus: input.chapter.milestoneStatus, script, story, storyboard, preflight, earliestAttentionStep, generatedAt };
}
