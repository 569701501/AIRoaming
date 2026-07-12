import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  DocumentValidationError,
  encodeScriptTextV1,
  PreflightDocumentCodecV2,
  resolveChapterProductionState,
  type ChapterProductionState,
  type ChapterVersionGraphInput,
  type Digest,
  type PreflightSourceSnapshotV1,
  type ScriptHistoryCopyRequest,
  type ScriptHistoryDetail,
  type ScriptHistoryPage,
  type ScriptMutationResult,
  type ScriptPendingAdoptRequest,
  type ScriptPendingDiscardRequest,
  type ScriptPendingSuggestionDto,
  type ScriptPublishRequest,
  type ScriptPublishResponse,
  type ScriptVersionSummary,
  type ScriptWorkingCopyClearRequest,
  type ScriptWorkingCopyDto,
  type ScriptWorkingCopyRevertRequest,
  type ScriptWorkingCopyUpdateRequest,
} from "@airoaming/shared";
import { getDefaultChapterTitle } from "../project-domain.util.js";
import { PrismaService } from "../../persistence/prisma.service.js";
import { createG2DatabaseError, G2DatabaseError, mapG2DatabaseError } from "./g2-database-error.mapper.js";
import { ChapterVersionQueryRepository, type ChapterVersionQueryRow } from "./chapter-version-query.repository.js";
import { VersionTransactionRunner } from "./version-transaction-runner.service.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;
const EMPTY_SCRIPT_DIGEST = encodeScriptTextV1("", { allowEmpty: true }).digest;

type ScriptChapterReader = Pick<Prisma.TransactionClient, "chapter">;

function iso(value: Date): string {
  return value.toISOString();
}

function digest(value: string): Digest {
  return value as Digest;
}

function normalizeScript(value: string, allowEmpty = true): { text: string; digest: Digest } {
  try {
    const encoded = encodeScriptTextV1(value, { allowEmpty });
    if (encoded.canonicalBytes.byteLength > SCRIPT_MAX_BYTES) {
      throw new DocumentValidationError("script: normalized text exceeds 2 MiB");
    }
    return { text: encoded.canonical, digest: encoded.digest };
  } catch (error) {
    if (error instanceof G2DatabaseError) throw error;
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
  }
}

function workingState(
  text: string,
  workingDigest: Digest,
  currentSourceDigest: Digest | null,
): "empty" | "clean" | "dirty" {
  if (text === "" && currentSourceDigest === null) return "empty";
  if (text !== "" && currentSourceDigest !== null && workingDigest === currentSourceDigest) return "clean";
  return "dirty";
}

function scriptSummary(
  row: NonNullable<ChapterVersionQueryRow["currentScriptVersion"]>,
  chapterId: string,
  status: "current" | "archived" = "current",
): ScriptVersionSummary {
  return {
    id: row.id,
    chapterId,
    version: row.version,
    lifecycle: status === "current" ? "confirmed" : "archived",
    schemaVersion: 1,
    documentDigest: digest(row.sourceDigest),
    sourceId: null,
    sourcePolicyVersion: null,
    origin: row.origin === "legacy_import" ? "legacy_import" : row.origin === "ai_generate" ? "ai_generate" : row.origin === "import" ? "import" : "user_edit",
    rowVersion: null,
    freshness: status === "current" ? "current" : "historical",
    reasonCodes: [],
    status,
    sourceDigest: digest(row.sourceDigest),
    createdAt: iso(row.createdAt),
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    confirmedAt: status === "current" && row.completedAt ? iso(row.completedAt) : null,
    archivedAt: null,
  };
}

function scriptVersionStatus(
  version: { id: string },
  currentId: string | null,
): "current" | "archived" {
  return version.id === currentId ? "current" : "archived";
}

function errorForMismatch(code: "CHAPTER_VERSION_CONFLICT" | "CURRENT_VERSION_CHANGED" | "WORKING_DIGEST_CHANGED"): never {
  throw createG2DatabaseError(409, code);
}

@Injectable()
export class ScriptVersionRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
    @Inject(ChapterVersionQueryRepository) private readonly chapterQuery: ChapterVersionQueryRepository,
  ) {}

  async getWorkingCopy(scope: VersionScopeV1): Promise<ScriptWorkingCopyDto> {
    this.assertDatabaseMode();
    const row = await this.chapterQuery.findByScope(scope);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return this.toWorkingCopy(row);
  }

  async updateWorkingCopy(
    scope: VersionScopeV1,
    request: ScriptWorkingCopyUpdateRequest,
  ): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    this.assertDatabaseMode();
    const encoded = normalizeScript(request.sourceText, true);
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const title = request.title === undefined ? chapter.title : request.title.trim();
      const summary = request.summary === undefined ? chapter.summary : request.summary?.trim() || null;
      const state = workingState(encoded.text, encoded.digest, chapter.currentScriptVersion?.sourceDigest as Digest | null ?? null);
      if (chapter.rowVersion !== request.expectedChapterRowVersion) {
        if (
          chapter.rowVersion === request.expectedChapterRowVersion + 1 &&
          chapter.title === title &&
          chapter.summary === summary &&
          chapter.scriptWorkingText === encoded.text &&
          chapter.scriptWorkingDigest === encoded.digest
        ) {
          return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        }
        errorForMismatch("CHAPTER_VERSION_CONFLICT");
      }
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        title,
        summary,
        scriptWorkingText: encoded.text,
        scriptWorkingDigest: encoded.digest,
        scriptWorkingState: state,
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async clearWorkingCopy(
    scope: VersionScopeV1,
    request: ScriptWorkingCopyClearRequest,
  ): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      if (chapter.rowVersion !== request.expectedChapterRowVersion) {
        const targetState = chapter.currentScriptVersion ? "dirty" : "empty";
        if (
          chapter.rowVersion === request.expectedChapterRowVersion + 1 &&
          chapter.scriptWorkingText === "" &&
          chapter.scriptWorkingDigest === EMPTY_SCRIPT_DIGEST &&
          chapter.scriptWorkingState === targetState
        ) return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        errorForMismatch("CHAPTER_VERSION_CONFLICT");
      }
      if (chapter.scriptWorkingDigest !== request.expectedWorkingDigest) {
        errorForMismatch("WORKING_DIGEST_CHANGED");
      }
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        scriptWorkingText: "",
        scriptWorkingDigest: EMPTY_SCRIPT_DIGEST,
        scriptWorkingState: chapter.currentScriptVersion ? "dirty" : "empty",
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async revertWorkingCopy(
    scope: VersionScopeV1,
    request: ScriptWorkingCopyRevertRequest,
  ): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const current = chapter.currentScriptVersion;
      if (!current) throw createG2DatabaseError(409, "SCRIPT_VERSION_MISSING");
      if (chapter.rowVersion !== request.expectedChapterRowVersion) {
        if (
          chapter.rowVersion === request.expectedChapterRowVersion + 1 &&
          chapter.currentScriptVersionId === request.expectedCurrentScriptVersionId &&
          chapter.scriptWorkingDigest === current.sourceDigest &&
          chapter.scriptWorkingState === "clean"
        ) return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        errorForMismatch("CHAPTER_VERSION_CONFLICT");
      }
      if (chapter.currentScriptVersionId !== request.expectedCurrentScriptVersionId) errorForMismatch("CURRENT_VERSION_CHANGED");
      if (chapter.scriptWorkingDigest !== request.expectedWorkingDigest) errorForMismatch("WORKING_DIGEST_CHANGED");
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        scriptWorkingText: current.sourceText,
        scriptWorkingDigest: current.sourceDigest,
        scriptWorkingState: "clean",
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async publish(scope: VersionScopeV1, request: ScriptPublishRequest): Promise<ScriptPublishResponse> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const current = chapter.currentScriptVersion;
      const isReplay = chapter.rowVersion === request.expectedChapterRowVersion + 1 &&
        chapter.scriptWorkingState === "clean" &&
        chapter.scriptWorkingDigest === request.expectedWorkingDigest &&
        current?.sourceDigest === request.expectedWorkingDigest;
      if (isReplay) {
        if (!current) throw createG2DatabaseError(409, "SCRIPT_VERSION_MISSING");
        const next = request.createNextChapter ? await this.findNextChapter(tx, scope.projectId, chapter.order) : null;
        return this.publishResponse(chapter, current, next !== null, true);
      }
      if (chapter.rowVersion !== request.expectedChapterRowVersion) errorForMismatch("CHAPTER_VERSION_CONFLICT");
      if (chapter.currentScriptVersionId !== request.expectedCurrentScriptVersionId) errorForMismatch("CURRENT_VERSION_CHANGED");
      if (chapter.scriptWorkingDigest !== request.expectedWorkingDigest) errorForMismatch("WORKING_DIGEST_CHANGED");
      if (!chapter.scriptWorkingText.trim()) throw createG2DatabaseError(400, "SCRIPT_WORKING_EMPTY");

      const now = new Date();
      const encoded = normalizeScript(chapter.scriptWorkingText, false);
      if (encoded.digest !== request.expectedWorkingDigest) errorForMismatch("WORKING_DIGEST_CHANGED");
      const last = await tx.chapterScriptVersion.findFirst({ where: { chapterId: chapter.id }, orderBy: { version: "desc" } });
      const version = (last?.version ?? 0) + 1;
      const id = randomUUID();
      const created = await tx.chapterScriptVersion.create({
        data: {
          id,
          chapterId: chapter.id,
          version,
          sourceText: encoded.text,
          sourceDigest: encoded.digest,
          origin: "user",
          createdAt: now,
          completedAt: now,
        },
      });
      if (chapter.pendingStoryVersionId !== null) {
        const archived = await tx.storyVersion.updateMany({
          where: { id: chapter.pendingStoryVersionId, chapterId: chapter.id, projectId: chapter.projectId },
          data: { status: "archived", archivedAt: now, rowVersion: { increment: 1 } },
        });
        if (archived.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      }
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        title: chapter.title,
        milestoneStatus: "script_done",
        scriptWorkingText: encoded.text,
        scriptWorkingDigest: encoded.digest,
        scriptWorkingState: "clean",
        currentScriptVersionId: created.id,
        pendingStoryVersionId: null,
        completedAt: now,
        rowVersion: { increment: 1 },
      });
      const next = request.createNextChapter ? await this.ensureNextChapter(tx, scope.projectId, chapter.order, request.nextChapterTitle) : null;
      const updated = await this.readChapter(scope, tx);
      return this.publishResponse(updated, created, next !== null, false);
    });
  }

  async getPendingSuggestion(scope: VersionScopeV1): Promise<ScriptPendingSuggestionDto | null> {
    this.assertDatabaseMode();
    const chapter = await this.chapterQuery.findByScope(scope);
    if (!chapter) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return chapter.chapterScriptPendingByChapter ? this.toPending(chapter.chapterScriptPendingByChapter) : null;
  }

  async adoptPendingSuggestion(
    scope: VersionScopeV1,
    request: ScriptPendingAdoptRequest,
  ): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const pending = chapter.chapterScriptPendingByChapter;
      if (!pending) {
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && chapter.scriptWorkingDigest === request.expectedPendingDigest) {
          return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        }
        throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      }
      if (pending.id !== request.pendingId || pending.rowVersion !== request.expectedPendingRowVersion || pending.sourceDigest !== request.expectedPendingDigest) {
        throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      }
      if (chapter.rowVersion !== request.expectedChapterRowVersion) errorForMismatch("CHAPTER_VERSION_CONFLICT");
      const encoded = normalizeScript(pending.sourceText, false);
      if (encoded.digest !== pending.sourceDigest) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      await tx.chapterScriptPending.delete({ where: { id: pending.id } });
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        scriptWorkingText: encoded.text,
        scriptWorkingDigest: encoded.digest,
        scriptWorkingState: workingState(encoded.text, encoded.digest, chapter.currentScriptVersion?.sourceDigest as Digest | null ?? null),
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async discardPendingSuggestion(
    scope: VersionScopeV1,
    request: ScriptPendingDiscardRequest,
  ): Promise<ScriptMutationResult<null>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const pending = chapter.chapterScriptPendingByChapter;
      if (!pending) return this.mutation(chapter, null, true);
      if (pending.id !== request.pendingId || pending.rowVersion !== request.expectedPendingRowVersion) {
        throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      }
      await tx.chapterScriptPending.delete({ where: { id: pending.id } });
      return this.mutation(await this.readChapter(scope, tx), null, false);
    });
  }

  async listHistory(scope: VersionScopeV1, options: { limit?: number; beforeVersion?: number } = {}): Promise<ScriptHistoryPage> {
    this.assertDatabaseMode();
    const chapter = await this.chapterQuery.findByScope(scope);
    if (!chapter) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    const limit = options.limit ?? 20;
    const beforeVersion = options.beforeVersion;
    const candidates = chapter.chapterScriptVersionsByChapter
      .filter((version) => beforeVersion === undefined || version.version < beforeVersion)
    const versions = candidates.slice(0, limit);
    return {
      items: versions.map((version) => scriptSummary(version, chapter.id, scriptVersionStatus(version, chapter.currentScriptVersionId))),
      nextBeforeVersion: candidates.length > limit ? versions.at(-1)?.version ?? null : null,
    };
  }

  async getHistoryDetail(scope: VersionScopeV1, versionId: string): Promise<ScriptHistoryDetail> {
    this.assertDatabaseMode();
    const row = await this.chapterQuery.findByScope(scope);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    const version = row.chapterScriptVersionsByChapter.find((item) => item.id === versionId);
    if (!version) {
      const existing = await this.prismaService.database().chapterScriptVersion.findUnique({ where: { id: versionId } });
      throw createG2DatabaseError(existing ? 409 : 404, existing ? "VERSION_SCOPE_MISMATCH" : "VERSION_NOT_FOUND");
    }
    return {
      ...scriptSummary(version, row.id, scriptVersionStatus(version, row.currentScriptVersionId)),
      sourceText: version.sourceText,
      isCurrent: row.currentScriptVersionId === version.id,
    };
  }

  async copyHistoryToWorkingCopy(
    scope: VersionScopeV1,
    versionId: string,
    request: ScriptHistoryCopyRequest,
  ): Promise<ScriptMutationResult<ScriptWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const version = chapter.chapterScriptVersionsByChapter.find((item) => item.id === versionId);
      if (!version) {
        const existing = await tx.chapterScriptVersion.findUnique({ where: { id: versionId } });
        throw createG2DatabaseError(existing ? 409 : 404, existing ? "VERSION_SCOPE_MISMATCH" : "VERSION_NOT_FOUND");
      }
      if (chapter.rowVersion !== request.expectedChapterRowVersion) {
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && chapter.scriptWorkingDigest === version.sourceDigest) {
          return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        }
        errorForMismatch("CHAPTER_VERSION_CONFLICT");
      }
      if (chapter.currentScriptVersionId !== request.expectedCurrentVersionId) errorForMismatch("CURRENT_VERSION_CHANGED");
      if (chapter.scriptWorkingDigest !== request.expectedWorkingDigest) errorForMismatch("WORKING_DIGEST_CHANGED");
      const encoded = normalizeScript(version.sourceText, false);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        scriptWorkingText: encoded.text,
        scriptWorkingDigest: encoded.digest,
        scriptWorkingState: workingState(encoded.text, encoded.digest, chapter.currentScriptVersion?.sourceDigest as Digest | null ?? null),
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED", { actualMode: this.prismaService.mode, requiredMode: "db" });
  }

  private async run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.transactionRunner.run(operation);
    } catch (error) {
      if (error instanceof G2DatabaseError) throw error;
      throw new G2DatabaseError(mapG2DatabaseError(error));
    }
  }

  private async readChapter(scope: VersionScopeV1, reader: ScriptChapterReader): Promise<ChapterVersionQueryRow> {
    const row = await this.chapterQuery.findByScope(scope, reader);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return row;
  }

  private async updateChapterCas(
    tx: Prisma.TransactionClient,
    scope: VersionScopeV1,
    expectedRowVersion: number,
    data: Prisma.ChapterUncheckedUpdateManyInput,
  ): Promise<void> {
    const result = await tx.chapter.updateMany({
      where: { id: scope.chapterId, projectId: scope.projectId, rowVersion: expectedRowVersion },
      data,
    });
    if (result.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
  }

  private toWorkingCopy(row: ChapterVersionQueryRow): ScriptWorkingCopyDto {
    return {
      chapterId: row.id,
      sourceText: row.scriptWorkingText,
      title: row.title,
      summary: row.summary,
      digest: digest(row.scriptWorkingDigest),
      state: row.scriptWorkingState as ScriptWorkingCopyDto["state"],
      currentVersion: row.currentScriptVersion ? scriptSummary(row.currentScriptVersion, row.id) : null,
      chapterRowVersion: row.rowVersion,
    };
  }

  private mutation<T>(row: ChapterVersionQueryRow, value: T, replayed: boolean): ScriptMutationResult<T> {
    return {
      value,
      productionState: this.toProductionState(row),
      chapterRowVersion: row.rowVersion,
      replayed,
    };
  }

  private toPending(row: NonNullable<ChapterVersionQueryRow["chapterScriptPendingByChapter"]>): ScriptPendingSuggestionDto {
    return {
      id: row.id,
      chapterId: row.chapterId,
      sourceText: row.sourceText,
      digest: digest(row.sourceDigest),
      operation: row.operation,
      rowVersion: row.rowVersion,
      threadId: row.threadId,
      messageId: row.messageId,
      toolCallId: row.toolCallId,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private async findNextChapter(tx: Prisma.TransactionClient, projectId: string, order: number) {
    return tx.chapter.findFirst({ where: { projectId, order: order + 1 } });
  }

  private async ensureNextChapter(tx: Prisma.TransactionClient, projectId: string, order: number, title?: string) {
    const existing = await this.findNextChapter(tx, projectId, order);
    if (existing) return existing;
    const nextOrder = order + 1;
    const suffix = String(nextOrder).padStart(3, "0");
    return tx.chapter.create({
      data: {
        id: randomUUID(),
        projectId,
        slug: `chapter-${suffix}`,
        order: nextOrder,
        title: title?.trim() || getDefaultChapterTitle(nextOrder),
        milestoneStatus: "draft",
        scriptWorkingText: "",
        scriptWorkingDigest: EMPTY_SCRIPT_DIGEST,
        scriptWorkingState: "empty",
        summary: null,
        currentScriptVersionId: null,
        currentStoryVersionId: null,
        pendingStoryVersionId: null,
        currentStoryboardVersionId: null,
        pendingStoryboardVersionId: null,
        currentPreflightRevisionId: null,
        currentLayoutRevisionId: null,
        currentExportRevisionId: null,
        lastScriptRevisionId: null,
      },
    });
  }

  private publishResponse(
    chapter: ChapterVersionQueryRow,
    current: NonNullable<ChapterVersionQueryRow["currentScriptVersion"]>,
    createdNextChapter: boolean,
    replayed: boolean,
  ): ScriptPublishResponse {
    const productionState = this.toProductionState(chapter);
    return {
      scriptVersion: scriptSummary(current, chapter.id),
      workingCopy: this.toWorkingCopy(chapter),
      activeChapterId: chapter.id,
      createdNextChapter,
      productionState,
      replayed,
    };
  }

  public toProductionState(row: ChapterVersionQueryRow): ChapterProductionState {
    const artifact = (item: { id: string; projectId: string; chapterId: string; status: string; sourceScriptVersionId?: string | null; sourceStoryVersionId?: string | null; sourceDigest: string | null; documentDigest: string | null; sourcePolicyVersion: string | null } | null) => item ? {
      id: item.id,
      projectId: item.projectId,
      chapterId: item.chapterId,
      status: item.status as "pending_confirmation" | "confirmed" | "archived",
      sourceId: item.sourceScriptVersionId ?? item.sourceStoryVersionId ?? null,
      sourceDigest: item.sourceDigest as Digest | null,
      documentDigest: item.documentDigest as Digest | null,
      sourcePolicyVersion: item.sourcePolicyVersion,
    } : null;
    let preflightSnapshot: PreflightSourceSnapshotV1 | null = null;
    if (row.currentPreflightRevision) {
      try {
        preflightSnapshot = PreflightDocumentCodecV2.parse(row.currentPreflightRevision.documentJson).sourceSnapshot;
      } catch {
        preflightSnapshot = null;
      }
    }
    const input: ChapterVersionGraphInput = {
      chapter: {
        id: row.id,
        projectId: row.projectId,
        rowVersion: row.rowVersion,
        milestoneStatus: row.milestoneStatus as ChapterVersionGraphInput["chapter"]["milestoneStatus"],
        scriptWorkingText: row.scriptWorkingText,
        scriptWorkingDigest: digest(row.scriptWorkingDigest),
        scriptWorkingState: row.scriptWorkingState as ChapterVersionGraphInput["chapter"]["scriptWorkingState"],
        hasAiPending: row.chapterScriptPendingByChapter !== null,
        currentScriptVersionId: row.currentScriptVersionId,
        currentStoryVersionId: row.currentStoryVersionId,
        pendingStoryVersionId: row.pendingStoryVersionId,
        currentStoryboardVersionId: row.currentStoryboardVersionId,
        pendingStoryboardVersionId: row.pendingStoryboardVersionId,
        currentPreflightRevisionId: row.currentPreflightRevisionId,
      },
      currentScript: row.currentScriptVersion ? { id: row.currentScriptVersion.id, projectId: row.projectId, chapterId: row.id, status: "current", sourceDigest: digest(row.currentScriptVersion.sourceDigest) } : null,
      currentStory: artifact(row.currentStoryVersion),
      pendingStory: artifact(row.pendingStoryVersion),
      currentStoryboard: artifact(row.currentStoryboardVersion),
      pendingStoryboard: artifact(row.pendingStoryboardVersion),
      currentPreflight: row.currentPreflightRevision ? { id: row.currentPreflightRevision.id, projectId: row.projectId, chapterId: row.id, status: row.currentPreflightRevision.status as "confirmed" | "archived" | "pending_confirmation", sourceId: row.currentPreflightRevision.sourceStoryboardVersionId, sourceDigest: digest(row.currentPreflightRevision.sourceDigest), documentDigest: digest(row.currentPreflightRevision.documentDigest), sourcePolicyVersion: row.currentPreflightRevision.sourcePolicyVersion } : null,
      currentPreflightSourceSnapshot: preflightSnapshot,
      historyCounts: { script: row.chapterScriptVersionsByChapter.length, story: row.storyVersionsByChapter.length, storyboard: row.storyboardVersionsByChapter.length, preflight: row.preflightRevisionsByChapter.length },
    };
    return resolveChapterProductionState(input);
  }
}
