import type { Digest } from "./document-contract.js";
import type { ChapterProductionState, FreshnessReasonCode, ScriptWorkingState } from "./production-state.js";
import type { PreflightDocumentV2, StoryDocumentV2, StoryboardDocumentV2, StoryboardShotV2 } from "./document-contract.js";
import type { ProjectWorkflow } from "../dto.js";

export type VersionLifecycle = "pending_confirmation" | "confirmed" | "archived";
export type VersionFreshness = "current" | "stale" | "historical" | "pending";
export type VersionOrigin = "user_edit" | "ai_generate" | "import" | "legacy_import";

export interface VersionSummary {
  id: string;
  version: number;
  lifecycle: VersionLifecycle;
  schemaVersion: number;
  documentDigest: Digest;
  sourceId: string | null;
  sourceDigest: Digest | null;
  sourcePolicyVersion: string | null;
  origin: VersionOrigin;
  rowVersion: number | null;
  freshness: VersionFreshness;
  reasonCodes: FreshnessReasonCode[];
  createdAt: string;
  confirmedAt: string | null;
  archivedAt: string | null;
}

export interface ScriptVersionSummary extends VersionSummary {
  chapterId: string;
  status: "current" | "archived";
  sourceDigest: Digest;
  completedAt: string | null;
}

export interface ScriptWorkingCopyDto {
  chapterId: string;
  sourceText: string;
  title: string;
  summary: string | null;
  digest: Digest;
  state: ScriptWorkingState;
  currentVersion: ScriptVersionSummary | null;
  chapterRowVersion: number;
}

export interface ScriptPendingSuggestionDto {
  id: string;
  chapterId: string;
  sourceText: string;
  digest: Digest;
  operation: string;
  rowVersion: number;
  chapterRowVersion: number;
  threadId: string | null;
  messageId: string | null;
  toolCallId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptWorkingCopyUpdateRequest {
  sourceText: string;
  title?: string;
  summary?: string | null;
  expectedChapterRowVersion: number;
}

export interface ScriptWorkingCopyClearRequest {
  expectedWorkingDigest: Digest;
  expectedChapterRowVersion: number;
}

export interface ScriptWorkingCopyRevertRequest {
  expectedCurrentScriptVersionId: string;
  expectedWorkingDigest: Digest;
  expectedChapterRowVersion: number;
}

export interface ScriptPublishRequest {
  expectedCurrentScriptVersionId: string | null;
  expectedWorkingDigest: Digest;
  expectedChapterRowVersion: number;
  createNextChapter: boolean;
  nextChapterTitle?: string;
}

export interface ScriptPendingAdoptRequest {
  pendingId: string;
  expectedPendingRowVersion: number;
  expectedPendingDigest: Digest;
  expectedChapterRowVersion: number;
}

export interface ScriptPendingDiscardRequest {
  pendingId: string;
  expectedPendingRowVersion: number;
}

export interface StoryWorkingCopyDto {
  pending: VersionSummary | null;
  current: VersionSummary | null;
  document: StoryDocumentV2 | null;
  basedOnCurrentVersionId: string | null;
  sourceScriptVersionId: string | null;
  rowVersion: number | null;
  productionState: ChapterProductionState;
}

export interface CreateStoryWorkingCopyRequest {
  mode: "clone_current" | "empty";
  expectedCurrentVersionId: string | null;
  expectedSourceScriptVersionId: string;
  expectedChapterRowVersion: number;
}

export interface UpdateStoryWorkingCopyRequest {
  pendingVersionId: string;
  document: StoryDocumentV2;
  expectedPendingRowVersion: number;
  expectedChapterRowVersion: number;
}

export interface DiscardStoryWorkingCopyRequest {
  pendingVersionId: string;
  expectedPendingRowVersion: number;
  expectedChapterRowVersion: number;
}

export interface ConfirmStoryWorkingCopyRequest {
  pendingVersionId: string;
  expectedPendingDocumentDigest: Digest;
  expectedPendingRowVersion: number;
  expectedCurrentVersionId: string | null;
  expectedSourceScriptVersionId: string;
  expectedSourceDigest: Digest;
  expectedChapterRowVersion: number;
}

export interface StoryWorkingCopyMutationValue {
  current: VersionSummary;
  document: StoryDocumentV2;
}

export interface StoryboardWorkingCopyDto {
  pending: VersionSummary | null;
  current: VersionSummary | null;
  document: StoryboardDocumentV2 | null;
  basedOnCurrentVersionId: string | null;
  sourceStoryVersionId: string | null;
  rowVersion: number | null;
  productionState: ChapterProductionState;
}

export interface CreateStoryboardWorkingCopyRequest {
  mode: "clone_current" | "empty";
  expectedCurrentVersionId: string | null;
  expectedSourceStoryVersionId: string;
  expectedChapterRowVersion: number;
}

export interface UpdateStoryboardWorkingCopyRequest {
  pendingVersionId: string;
  document: StoryboardDocumentV2;
  expectedPendingRowVersion: number;
  expectedChapterRowVersion: number;
}

export interface DiscardStoryboardWorkingCopyRequest {
  pendingVersionId: string;
  expectedPendingRowVersion: number;
  expectedChapterRowVersion: number;
}

export interface ConfirmStoryboardWorkingCopyRequest {
  pendingVersionId: string;
  expectedPendingDocumentDigest: Digest;
  expectedPendingRowVersion: number;
  expectedCurrentVersionId: string | null;
  expectedSourceStoryVersionId: string;
  expectedSourceDigest: Digest;
  expectedChapterRowVersion: number;
}

export interface CreatePendingShotRequest {
  pendingVersionId: string;
  requestId: string;
  afterShotId: string | null;
  expectedPendingRowVersion: number;
  expectedChapterRowVersion: number;
  initial: Omit<StoryboardShotV2, "id" | "order">;
}

export interface CreatePendingShotResponse {
  shotId: string;
  workingCopy: StoryboardWorkingCopyDto;
  replayed: boolean;
}

export interface StoryboardWorkingCopyMutationValue {
  current: VersionSummary;
  document: StoryboardDocumentV2;
}

export interface GetChapterProductionStateResponse {
  productionState: ChapterProductionState;
  workflow: ProjectWorkflow;
  chapterRowVersion: number;
}

export interface PreflightRevisionDto {
  id: string;
  chapterId: string;
  version: number;
  lifecycle: "confirmed";
  sourceStoryboardVersionId: string;
  sourceDigest: Digest;
  documentDigest: Digest;
  document: PreflightDocumentV2;
  createdAt: string;
  confirmedAt: string;
}

export interface GetChapterPreflightPreviewResponse {
  preview: PreflightDocumentV2;
  sourceDigest: Digest;
  chapterRowVersion: number;
}

export interface ConfirmChapterPreflightRequest {
  expectedSourceStoryboardVersionId: string;
  expectedSourceDigest: Digest;
  expectedChapterRowVersion: number;
  notes?: string;
}

export interface ConfirmChapterPreflightResponse {
  preflight: PreflightRevisionDto;
  productionState: ChapterProductionState;
  chapterRowVersion: number;
  replayed: boolean;
}

export interface ScriptHistoryCopyRequest {
  expectedCurrentVersionId: string | null;
  expectedWorkingDigest: Digest;
  expectedChapterRowVersion: number;
}

export interface VersionHistoryCopyRequest {
  expectedCurrentVersionId: string | null;
  expectedChapterRowVersion: number;
}

export interface ScriptMutationResult<T> {
  value: T;
  productionState: ChapterProductionState;
  chapterRowVersion: number;
  replayed: boolean;
}

export type VersionMutationResult<T> = ScriptMutationResult<T>;

export interface VersionHistoryPage<T> {
  items: T[];
  nextBeforeVersion: number | null;
}

export type ScriptHistoryPage = VersionHistoryPage<ScriptVersionSummary>;

export interface ScriptPublishResponse {
  scriptVersion: ScriptVersionSummary;
  workingCopy: ScriptWorkingCopyDto;
  activeChapterId: string;
  createdNextChapter: boolean;
  productionState: ChapterProductionState;
  replayed: boolean;
}

export interface ScriptHistoryDetail extends ScriptVersionSummary {
  sourceText: string;
  isCurrent: boolean;
}
