import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  DocumentValidationError,
  StoryDocumentCodecV2,
  StoryboardDocumentCodecV2,
  digestCanonicalJson,
  encodeStoryboardDocumentV2,
  stableShotId,
  type CreatePendingShotRequest,
  type CreateStoryboardWorkingCopyRequest,
  type ConfirmStoryboardWorkingCopyRequest,
  type Digest,
  type DiscardStoryboardWorkingCopyRequest,
  type StoryboardDocumentV2,
  type StoryboardWorkingCopyDto,
  type StoryboardWorkingCopyMutationValue,
  type UpdateStoryboardWorkingCopyRequest,
  type VersionMutationResult,
  type VersionSummary,
  type CreatePendingShotResponse,
  type VersionHistoryCopyRequest,
} from "@airoaming/shared";
import { PrismaService } from "../../persistence/prisma.service.js";
import { createG2DatabaseError, G2DatabaseError, mapG2DatabaseError } from "./g2-database-error.mapper.js";
import { ChapterVersionQueryRepository, type ChapterVersionQueryRow } from "./chapter-version-query.repository.js";
import { ScriptVersionRepository } from "./script-version.repository.js";
import { VersionTransactionRunner } from "./version-transaction-runner.service.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

const BOARD_SOURCE_POLICY = "storyboard-source-v1";

export interface ApplyStoryboardTaskResultRequest {
  readonly expectedTargetId: string;
  readonly expectedTargetRowVersion: number;
  readonly sourceId: string;
  readonly sourceDigest?: Digest;
  readonly document: unknown;
}

function iso(value: Date): string { return value.toISOString(); }
function digest(value: string): Digest { return value as Digest; }
function origin(value: string): VersionSummary["origin"] {
  return value === "ai_generate" || value === "import" || value === "legacy_import" ? value : "user_edit";
}
function emptyStoryboardDocument(chapterId: string): StoryboardDocumentV2 {
  return { schemaVersion: 2, chapterId, shots: [], notes: "" };
}
function summary(row: NonNullable<ChapterVersionQueryRow["currentStoryboardVersion"]>, currentId: string | null): VersionSummary {
  const lifecycle = row.status as VersionSummary["lifecycle"];
  return {
    id: row.id, version: row.version, lifecycle, schemaVersion: row.schemaVersion,
    documentDigest: digest(row.documentDigest), sourceId: row.sourceStoryVersionId,
    sourceDigest: row.sourceDigest ? digest(row.sourceDigest) : null, sourcePolicyVersion: row.sourcePolicyVersion,
    origin: origin(row.origin), rowVersion: row.rowVersion, freshness: lifecycle === "pending_confirmation" ? "pending" : row.id === currentId ? "current" : "historical",
    reasonCodes: [], createdAt: iso(row.createdAt), confirmedAt: row.confirmedAt ? iso(row.confirmedAt) : null, archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
  };
}
function parseDocument(row: { documentJson: unknown; schemaVersion: number }): StoryboardDocumentV2 {
  if (row.schemaVersion !== 2) throw createG2DatabaseError(409, "VERSION_CODEC_UPGRADE_REQUIRED", { schemaVersion: row.schemaVersion, expected: 2 });
  try { return StoryboardDocumentCodecV2.parse(row.documentJson); }
  catch (error) { throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error); }
}
function encodeDocument(document: unknown, chapterId: string) {
  try {
    const encoded = encodeStoryboardDocumentV2(document);
    if (encoded.value.chapterId !== chapterId) throw new DocumentValidationError("storyboard.chapterId: scope mismatch");
    return encoded;
  } catch (error) {
    if (error instanceof G2DatabaseError) throw error;
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
  }
}

@Injectable()
export class StoryboardVersionRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
    @Inject(ChapterVersionQueryRepository) private readonly chapterQuery: ChapterVersionQueryRepository,
    @Inject(ScriptVersionRepository) private readonly scriptRepository: ScriptVersionRepository,
  ) {}

  async getWorkingCopy(scope: VersionScopeV1): Promise<StoryboardWorkingCopyDto> {
    this.assertDatabaseMode();
    const row = await this.chapterQuery.findByScope(scope);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return this.toWorkingCopy(row);
  }

  async createWorkingCopy(scope: VersionScopeV1, request: CreateStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      this.assertSourceGate(chapter, request.expectedSourceStoryVersionId);
      const current = chapter.currentStoryboardVersion;
      if (chapter.pendingStoryboardVersion) {
        const target = request.mode === "clone_current" ? current ? parseDocument(current) : (() => { throw createG2DatabaseError(409, "VERSION_NOT_FOUND"); })() : emptyStoryboardDocument(chapter.id);
        const encoded = encodeDocument(target, chapter.id);
        const pending = chapter.pendingStoryboardVersion;
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && chapter.currentStoryboardVersionId === request.expectedCurrentVersionId && pending.documentDigest === encoded.digest && pending.sourceStoryVersionId === request.expectedSourceStoryVersionId) {
          return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        }
        throw createG2DatabaseError(409, "ACTIVE_PENDING_EXISTS");
      }
      if (chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (chapter.currentStoryboardVersionId !== request.expectedCurrentVersionId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      const target = request.mode === "clone_current" ? current ? parseDocument(current) : (() => { throw createG2DatabaseError(409, "VERSION_NOT_FOUND"); })() : emptyStoryboardDocument(chapter.id);
      const encoded = encodeDocument(target, chapter.id);
      const previous = await tx.storyboardVersion.findFirst({ where: { chapterId: chapter.id }, orderBy: { version: "desc" } });
      const created = await tx.storyboardVersion.create({ data: {
        id: randomUUID(), projectId: chapter.projectId, chapterId: chapter.id, version: (previous?.version ?? 0) + 1,
        status: "pending_confirmation", sourceStoryVersionId: request.expectedSourceStoryVersionId, sourcePolicyVersion: BOARD_SOURCE_POLICY,
        sourceDigest: chapter.currentStoryVersion!.documentDigest, documentJson: encoded.value as unknown as Prisma.InputJsonValue,
        schemaVersion: 2, documentDigest: encoded.digest, origin: "user_edit", rowVersion: 0, createdAt: new Date(),
      } });
      await this.rebuildProjections(tx, created.id, encoded.value, chapter);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { pendingStoryboardVersionId: created.id, rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async updateWorkingCopy(scope: VersionScopeV1, request: UpdateStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> {
    this.assertDatabaseMode();
    const encoded = encodeDocument(request.document, scope.chapterId);
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      this.assertSourceGate(chapter, chapter.currentStoryVersionId ?? "");
      const pending = chapter.pendingStoryboardVersion;
      if (!pending || chapter.pendingStoryboardVersionId !== request.pendingVersionId) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      await this.assertShotScope(tx, chapter, encoded.value);
      if (chapter.rowVersion !== request.expectedChapterRowVersion || pending.rowVersion !== request.expectedPendingRowVersion) {
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && pending.rowVersion === request.expectedPendingRowVersion + 1 && pending.documentDigest === encoded.digest) return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      }
      const result = await tx.storyboardVersion.updateMany({ where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion }, data: { documentJson: encoded.value as unknown as Prisma.InputJsonValue, documentDigest: encoded.digest, schemaVersion: 2, rowVersion: { increment: 1 } } });
      if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      await this.rebuildProjections(tx, pending.id, encoded.value, chapter);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async discardWorkingCopy(scope: VersionScopeV1, request: DiscardStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const pending = chapter.pendingStoryboardVersion;
      if (!pending) {
        const history = chapter.storyboardVersionsByChapter.find((item) => item.id === request.pendingVersionId);
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && history?.status === "archived") return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      }
      if (pending.id !== request.pendingVersionId || pending.rowVersion !== request.expectedPendingRowVersion || chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      const result = await tx.storyboardVersion.updateMany({ where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion, status: "pending_confirmation" }, data: { status: "archived", archivedAt: new Date(), rowVersion: { increment: 1 } } });
      if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { pendingStoryboardVersionId: null, rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async copyHistoryToWorkingCopy(scope: VersionScopeV1, versionId: string, request: VersionHistoryCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const source = chapter.storyboardVersionsByChapter.find((item) => item.id === versionId);
      if (!source) throw createG2DatabaseError(404, "VERSION_NOT_FOUND");
      if (chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (chapter.currentStoryboardVersionId !== request.expectedCurrentVersionId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      if (chapter.pendingStoryboardVersionId !== null) throw createG2DatabaseError(409, "ACTIVE_PENDING_EXISTS");
      const document = parseDocument(source);
      const previous = chapter.storyboardVersionsByChapter.reduce((max, item) => Math.max(max, item.version), 0);
      const now = new Date();
      const created = await tx.storyboardVersion.create({ data: {
        id: randomUUID(), projectId: chapter.projectId, chapterId: chapter.id, version: previous + 1,
        status: "pending_confirmation", sourceStoryVersionId: source.sourceStoryVersionId,
        sourcePolicyVersion: source.sourcePolicyVersion, sourceDigest: source.sourceDigest,
        documentJson: document as unknown as Prisma.InputJsonValue, schemaVersion: 2,
        documentDigest: source.documentDigest, origin: "user_edit", rowVersion: 0, createdAt: now,
      } });
      await this.rebuildProjections(tx, created.id, document, chapter);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { pendingStoryboardVersionId: created.id, rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async confirmWorkingCopy(scope: VersionScopeV1, request: ConfirmStoryboardWorkingCopyRequest): Promise<VersionMutationResult<StoryboardWorkingCopyMutationValue>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const current = chapter.currentStoryboardVersion;
      if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && chapter.currentStoryboardVersionId === request.pendingVersionId && chapter.pendingStoryboardVersionId === null && current?.documentDigest === request.expectedPendingDocumentDigest) {
        return this.mutation(chapter, { current: summary(current, chapter.currentStoryboardVersionId), document: parseDocument(current) }, true);
      }
      this.assertSourceGate(chapter, request.expectedSourceStoryVersionId, request.expectedSourceDigest);
      const pending = chapter.pendingStoryboardVersion;
      if (!pending || chapter.pendingStoryboardVersionId !== request.pendingVersionId) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      if (chapter.rowVersion !== request.expectedChapterRowVersion || pending.rowVersion !== request.expectedPendingRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (chapter.currentStoryboardVersionId !== request.expectedCurrentVersionId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      if (pending.documentDigest !== request.expectedPendingDocumentDigest) throw createG2DatabaseError(409, "WORKING_DIGEST_CHANGED");
      const document = parseDocument(pending);
      const encoded = encodeDocument(document, chapter.id);
      if (encoded.digest !== request.expectedPendingDocumentDigest) throw createG2DatabaseError(409, "WORKING_DIGEST_CHANGED");
      await this.assertShotScope(tx, chapter, document);
      await this.rebuildProjections(tx, pending.id, document, chapter);
      const currentIds = new Set((chapter.currentStoryboardVersion ? parseDocument(chapter.currentStoryboardVersion).shots : []).map((shot) => shot.id));
      const nextIds = new Set(document.shots.map((shot) => shot.id));
      const retiredAt = new Date();
      for (const shotId of currentIds) if (!nextIds.has(shotId)) await tx.shot.updateMany({ where: { id: shotId, chapterId: chapter.id, projectId: chapter.projectId, lifecycleStatus: "active" }, data: { lifecycleStatus: "retired", retiredAt } });
      const result = await tx.storyboardVersion.updateMany({ where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion, status: "pending_confirmation" }, data: { status: "confirmed", confirmedAt: new Date(), rowVersion: { increment: 1 } } });
      if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { currentStoryboardVersionId: pending.id, pendingStoryboardVersionId: null, milestoneStatus: "storyboard_done", rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      if (!updated.currentStoryboardVersion) throw createG2DatabaseError(500, "G2_DATABASE_CONTRACT_VIOLATION");
      return this.mutation(updated, { current: summary(updated.currentStoryboardVersion, updated.currentStoryboardVersionId), document: parseDocument(updated.currentStoryboardVersion) }, false);
    });
  }

  async createPendingShot(scope: VersionScopeV1, request: CreatePendingShotRequest): Promise<CreatePendingShotResponse> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const pending = chapter.pendingStoryboardVersion;
      if (!pending || pending.id !== request.pendingVersionId) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      if (chapter.rowVersion !== request.expectedChapterRowVersion || pending.rowVersion !== request.expectedPendingRowVersion) {
        const shotId = stableShotId({ projectId: scope.projectId, chapterId: scope.chapterId, pendingVersionId: pending.id, requestId: request.requestId });
        const existing = await tx.storyboardShotProjection.findFirst({ where: { storyboardVersionId: pending.id, shotId } });
        if (existing && chapter.rowVersion === request.expectedChapterRowVersion + 1 && pending.rowVersion === request.expectedPendingRowVersion + 1) return { shotId, workingCopy: this.toWorkingCopy(chapter), replayed: true };
        throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      }
      const document = parseDocument(pending);
      const shotId = stableShotId({ projectId: scope.projectId, chapterId: scope.chapterId, pendingVersionId: pending.id, requestId: request.requestId });
      if (document.shots.some((shot) => shot.id === shotId)) return { shotId, workingCopy: this.toWorkingCopy(chapter), replayed: true };
      if (await tx.shot.findFirst({ where: { id: shotId, chapterId: chapter.id } })) throw createG2DatabaseError(409, "SHOT_ID_RETIRED");
      const insertAt = request.afterShotId === null ? document.shots.length : document.shots.findIndex((shot) => shot.id === request.afterShotId) + 1;
      if (request.afterShotId !== null && insertAt === 0) throw createG2DatabaseError(400, "SHOT_ID_UNKNOWN");
      const shot = { ...request.initial, id: shotId, order: 0 };
      const shots = [...document.shots]; shots.splice(insertAt, 0, shot);
      const next = { ...document, shots: shots.map((item, index) => ({ ...item, order: index + 1 })) };
      const encoded = encodeDocument(next, chapter.id);
      await tx.shot.create({ data: { id: shotId, projectId: chapter.projectId, chapterId: chapter.id, lifecycleStatus: "active" } });
      await this.assertShotScope(tx, chapter, encoded.value);
      await tx.storyboardVersion.updateMany({ where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion }, data: { documentJson: encoded.value as unknown as Prisma.InputJsonValue, documentDigest: encoded.digest, rowVersion: { increment: 1 } } });
      await this.rebuildProjections(tx, pending.id, encoded.value, chapter);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      return { shotId, workingCopy: this.toWorkingCopy(updated), replayed: false };
    });
  }

  /** Applies a shot_generate result while keeping the storyboard pending. */
  async applyTaskResult(scope: VersionScopeV1, request: ApplyStoryboardTaskResultRequest): Promise<StoryboardDocumentV2> {
    this.assertDatabaseMode();
    return this.run((tx) => this.applyTaskResultInTransaction(tx, scope, request));
  }

  async applyTaskResultInTransaction(
    tx: Prisma.TransactionClient,
    scope: VersionScopeV1,
    request: ApplyStoryboardTaskResultRequest,
  ): Promise<StoryboardDocumentV2> {
    const chapter = await this.readChapter(scope, tx);
    const pending = chapter.pendingStoryboardVersion;
    if (!pending || chapter.pendingStoryboardVersionId !== request.expectedTargetId || pending.status !== "pending_confirmation") {
      throw createG2DatabaseError(409, "TASK_TARGET_SUPERSEDED", { expectedTargetId: request.expectedTargetId, actualTargetId: chapter.pendingStoryboardVersionId });
    }
    if (pending.rowVersion !== request.expectedTargetRowVersion) {
      throw createG2DatabaseError(409, "TASK_TARGET_SUPERSEDED", { expectedTargetId: request.expectedTargetId, expectedTargetRowVersion: request.expectedTargetRowVersion, actualRowVersion: pending.rowVersion });
    }
    this.assertSourceGate(chapter, request.sourceId, request.sourceDigest);
    const encoded = encodeDocument(request.document, chapter.id);
    await this.assertShotScope(tx, chapter, encoded.value);
    const updated = await tx.storyboardVersion.updateMany({
      where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedTargetRowVersion, status: "pending_confirmation" },
      data: { documentJson: encoded.value as unknown as Prisma.InputJsonValue, documentDigest: encoded.digest, schemaVersion: 2, rowVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw createG2DatabaseError(409, "TASK_TARGET_SUPERSEDED", { expectedTargetId: request.expectedTargetId });
    await this.rebuildProjections(tx, pending.id, encoded.value, chapter);
    await this.updateChapterCas(tx, scope, chapter.rowVersion, { rowVersion: { increment: 1 } });
    return encoded.value;
  }

  private assertDatabaseMode(): void { if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED", { actualMode: this.prismaService.mode, requiredMode: "db" }); }
  private async run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> { try { return await this.transactionRunner.run(operation); } catch (error) { if (error instanceof G2DatabaseError) throw error; throw new G2DatabaseError(mapG2DatabaseError(error)); } }
  private async readChapter(scope: VersionScopeV1, reader: Pick<Prisma.TransactionClient, "chapter">): Promise<ChapterVersionQueryRow> { const row = await this.chapterQuery.findByScope(scope, reader); if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND"); return row; }
  private assertSourceGate(chapter: ChapterVersionQueryRow, expectedStoryId: string, expectedDigest?: Digest): void {
    if (!chapter.currentStoryVersion || chapter.currentStoryVersionId !== expectedStoryId || chapter.currentStoryVersion.status !== "confirmed" || chapter.pendingStoryVersionId !== null || chapter.scriptWorkingState !== "clean" || chapter.chapterScriptPendingByChapter) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
    if (expectedDigest !== undefined && chapter.currentStoryVersion.documentDigest !== expectedDigest) throw createG2DatabaseError(409, "UPSTREAM_SOURCE_STALE");
  }
  private toWorkingCopy(row: ChapterVersionQueryRow): StoryboardWorkingCopyDto {
    const pending = row.pendingStoryboardVersion; const current = row.currentStoryboardVersion; const documentRow = pending ?? current;
    return { pending: pending ? summary(pending, row.currentStoryboardVersionId) : null, current: current ? summary(current, row.currentStoryboardVersionId) : null, document: documentRow ? parseDocument(documentRow) : null, basedOnCurrentVersionId: pending && current && pending.documentDigest === current.documentDigest ? current.id : null, sourceStoryVersionId: pending?.sourceStoryVersionId ?? current?.sourceStoryVersionId ?? null, rowVersion: pending?.rowVersion ?? null, productionState: this.scriptRepository.toProductionState(row) };
  }
  private mutation<T>(row: ChapterVersionQueryRow, value: T, replayed: boolean): VersionMutationResult<T> { return { value, productionState: this.scriptRepository.toProductionState(row), chapterRowVersion: row.rowVersion, replayed }; }
  private async updateChapterCas(tx: Prisma.TransactionClient, scope: VersionScopeV1, expected: number, data: Prisma.ChapterUncheckedUpdateManyInput): Promise<void> { const result = await tx.chapter.updateMany({ where: { id: scope.chapterId, projectId: scope.projectId, rowVersion: expected }, data }); if (result.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT"); }
  private async assertShotScope(tx: Prisma.TransactionClient, chapter: ChapterVersionQueryRow, document: StoryboardDocumentV2): Promise<void> {
    const ids = [...new Set(document.shots.map((shot) => shot.id))];
    const shots = ids.length ? await tx.shot.findMany({ where: { id: { in: ids }, projectId: chapter.projectId, chapterId: chapter.id }, select: { id: true, lifecycleStatus: true } }) : [];
    const found = new Set(shots.map((shot) => shot.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw createG2DatabaseError(400, "SHOT_ID_UNKNOWN", { shotIds: missing });
    const retired = shots.filter((shot) => shot.lifecycleStatus === "retired").map((shot) => shot.id);
    if (retired.length) throw createG2DatabaseError(409, "SHOT_ID_RETIRED", { shotIds: retired });
    const characterIds = [...new Set(document.shots.flatMap((shot) => shot.characterIds))];
    const characters = characterIds.length ? await tx.character.findMany({ where: { projectId: chapter.projectId, id: { in: characterIds } }, select: { id: true } }) : [];
    const foundCharacters = new Set(characters.map((character) => character.id));
    const unresolved = characterIds.filter((id) => !foundCharacters.has(id));
    if (unresolved.length) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED", { entityIds: unresolved });
    if (!chapter.currentStoryVersion) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
    let sourceCharacterIds: Set<string>;
    try {
      sourceCharacterIds = new Set(StoryDocumentCodecV2.parse(chapter.currentStoryVersion.documentJson).characters.map((item) => item.projectCharacterId));
    } catch (error) {
      throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
    }
    const outsideCurrentStructure = characterIds.filter((id) => !sourceCharacterIds.has(id));
    if (outsideCurrentStructure.length) {
      throw createG2DatabaseError(422, "SOURCE_UNRESOLVED", {
        entityIds: outsideCurrentStructure,
        reason: "STORYBOARD_CHARACTER_OUTSIDE_CURRENT_STORY_STRUCTURE",
      });
    }
  }
  private async rebuildProjections(tx: Prisma.TransactionClient, storyboardVersionId: string, document: StoryboardDocumentV2, chapter: ChapterVersionQueryRow): Promise<void> {
    await tx.storyboardShotCharacter.deleteMany({ where: { storyboardShotProjection: { storyboardVersionId } } });
    await tx.storyboardShotProjection.deleteMany({ where: { storyboardVersionId } });
    const sourceStoryId = chapter.currentStoryVersionId;
    for (const shot of document.shots) {
      const scene = shot.sceneId ? await tx.chapterScene.findFirst({ where: { chapterId: chapter.id, sceneKey: shot.sceneId } }) : null;
      const beat = shot.beatId && sourceStoryId ? await tx.storyBeatProjection.findFirst({ where: { storyVersionId: sourceStoryId, beatKey: shot.beatId } }) : null;
      const projection = await tx.storyboardShotProjection.create({ data: { id: randomUUID(), storyboardVersionId, shotId: shot.id, order: shot.order, storyBeatProjectionId: beat?.id ?? null, chapterSceneId: scene?.id ?? null, semanticDigest: digestCanonicalJson(shot) } });
      for (const [index, characterId] of shot.characterIds.entries()) await tx.storyboardShotCharacter.create({ data: { id: randomUUID(), storyboardShotProjectionId: projection.id, order: index + 1, sourceToken: characterId, characterId } });
    }
  }
}
