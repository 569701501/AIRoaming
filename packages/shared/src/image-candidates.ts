/**
 * 候选图工作台数据契约（见 文档/04_方案与决策/2026-07-06_候选图工作台MVP方案.md 第 5.1 节）。
 *
 * candidates.json 落盘位置：projects/{projectId}/chapters/{chapterSlug}/candidates.json
 * 边界：第 5 步对 storyboard.json 只读；锁定/跳过/候选清单全部落本文件。
 * normalize 风格对齐 storyboard-normalize.ts：任意输入、枚举兑底、缺失补默认。
 */

export type CandidateShotDecision = "pending" | "locked" | "skipped";
export type ChapterCandidateStatus = "generated" | "discarded";
export type ChapterCandidatesDocStatus = "in_progress" | "confirmed";

/** 生成时的 prompt 三段快照 + 最终拼接结果，保证可复现追溯。 */
export interface ShotPromptSnapshot {
  systemPart: string;
  stylePart: string;
  userPart: string;
  finalPrompt: string;
}

export interface ChapterCandidateItem {
  id: string;
  taskId: string | null;
  /** workspace 相对路径：projects/{projectId}/chapters/{chapterSlug}/candidates/{shotId}/{candidateId}.png */
  assetPath: string;
  status: ChapterCandidateStatus;
  promptSnapshot: ShotPromptSnapshot;
  referenceAssetIds: string[];
  /** 生成时正式分镜的 updatedAt；与当前不一致时 UI 标「基于旧分镜」。 */
  sourceStoryboardUpdatedAt: string | null;
  createdAt: string;
}

export interface ChapterCandidateShotEntry {
  shotId: string;
  decision: CandidateShotDecision;
  /** decision=locked 时必须指向本 shot 下一个 status=generated 的候选。 */
  lockedCandidateId: string | null;
  skipNote: string;
  /** 用户手改的用户级 prompt；null 表示用自动拼装。 */
  userPromptOverride: string | null;
  candidates: ChapterCandidateItem[];
}

export interface CandidatesJson {
  schemaVersion: 1;
  chapterId: string;
  chapterTitle: string;
  sourceStoryboardId: string | null;
  sourceStoryboardUpdatedAt: string | null;
  status: ChapterCandidatesDocStatus;
  shots: ChapterCandidateShotEntry[];
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CANDIDATE_SHOT_DECISIONS: readonly CandidateShotDecision[] = ["pending", "locked", "skipped"];
const CANDIDATE_STATUSES: readonly ChapterCandidateStatus[] = ["generated", "discarded"];
const DOC_STATUSES: readonly ChapterCandidatesDocStatus[] = ["in_progress", "confirmed"];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeShotPromptSnapshot(value: unknown): ShotPromptSnapshot {
  const record = asRecord(value);
  return {
    systemPart: asString(record.systemPart, ""),
    stylePart: asString(record.stylePart, ""),
    userPart: asString(record.userPart, ""),
    finalPrompt: asString(record.finalPrompt, ""),
  };
}

export function normalizeChapterCandidateItem(value: unknown): ChapterCandidateItem | null {
  const record = asRecord(value);
  const id = asNullableString(record.id);
  const assetPath = asNullableString(record.assetPath);
  if (!id || !assetPath) {
    return null;
  }
  return {
    id,
    taskId: asNullableString(record.taskId),
    assetPath,
    status: asEnum(record.status, CANDIDATE_STATUSES, "generated"),
    promptSnapshot: normalizeShotPromptSnapshot(record.promptSnapshot),
    referenceAssetIds: asStringArray(record.referenceAssetIds),
    sourceStoryboardUpdatedAt: asNullableString(record.sourceStoryboardUpdatedAt),
    createdAt: asString(record.createdAt, "1970-01-01T00:00:00.000Z"),
  };
}

export function normalizeChapterCandidateShotEntry(value: unknown): ChapterCandidateShotEntry | null {
  const record = asRecord(value);
  const shotId = asNullableString(record.shotId);
  if (!shotId) {
    return null;
  }
  const candidates = Array.isArray(record.candidates)
    ? record.candidates.map(normalizeChapterCandidateItem).filter((item): item is ChapterCandidateItem => item !== null)
    : [];
  let decision = asEnum(record.decision, CANDIDATE_SHOT_DECISIONS, "pending");
  let lockedCandidateId = asNullableString(record.lockedCandidateId);
  // 一致性兑底：锁定必须指向本 shot 内一个未废弃候选，否则回退 pending。
  if (decision === "locked") {
    const locked = lockedCandidateId ? candidates.find((item) => item.id === lockedCandidateId) : undefined;
    if (!locked || locked.status !== "generated") {
      decision = "pending";
      lockedCandidateId = null;
    }
  } else if (lockedCandidateId) {
    lockedCandidateId = null;
  }
  return {
    shotId,
    decision,
    lockedCandidateId,
    skipNote: asString(record.skipNote, ""),
    userPromptOverride: typeof record.userPromptOverride === "string" ? record.userPromptOverride : null,
    candidates,
  };
}

export function normalizeCandidatesJson(value: unknown): CandidatesJson {
  const record = asRecord(value);
  const shots = Array.isArray(record.shots)
    ? record.shots.map(normalizeChapterCandidateShotEntry).filter((item): item is ChapterCandidateShotEntry => item !== null)
    : [];
  return {
    schemaVersion: 1,
    chapterId: asString(record.chapterId, ""),
    chapterTitle: asString(record.chapterTitle, ""),
    sourceStoryboardId: asNullableString(record.sourceStoryboardId),
    sourceStoryboardUpdatedAt: asNullableString(record.sourceStoryboardUpdatedAt),
    status: asEnum(record.status, DOC_STATUSES, "in_progress"),
    shots,
    confirmedAt: asNullableString(record.confirmedAt),
    createdAt: asString(record.createdAt, "1970-01-01T00:00:00.000Z"),
    updatedAt: asString(record.updatedAt, "1970-01-01T00:00:00.000Z"),
  };
}

export function createEmptyCandidatesJson(input: {
  chapterId: string;
  chapterTitle: string;
  sourceStoryboardId: string | null;
  sourceStoryboardUpdatedAt: string | null;
  now?: string;
}): CandidatesJson {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    sourceStoryboardId: input.sourceStoryboardId,
    sourceStoryboardUpdatedAt: input.sourceStoryboardUpdatedAt,
    status: "in_progress",
    shots: [],
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 确认前置校验：所有 shot 均非 pending。shotIds 为当前正式分镜的全量 shot。 */
export function getPendingCandidateShotIds(doc: CandidatesJson, shotIds: readonly string[]): string[] {
  const entryByShotId = new Map(doc.shots.map((entry) => [entry.shotId, entry] as const));
  return shotIds.filter((shotId) => {
    const entry = entryByShotId.get(shotId);
    return !entry || entry.decision === "pending";
  });
}
