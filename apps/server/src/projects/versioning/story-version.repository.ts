import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  DocumentValidationError,
  StoryDocumentCodecV2,
  digestCanonicalJson,
  encodeStoryDocumentV2,
  requiredCharacterReferenceKind,
  type Digest,
  type CreateStoryWorkingCopyRequest,
  type DiscardStoryWorkingCopyRequest,
  type ConfirmStoryWorkingCopyRequest,
  type ScriptMutationResult,
  type StoryDocumentV2,
  type StoryWorkingCopyDto,
  type StoryWorkingCopyMutationValue,
  type UpdateStoryWorkingCopyRequest,
  type VersionMutationResult,
  type VersionSummary,
  type VersionHistoryCopyRequest,
} from "@airoaming/shared";
import { PrismaService } from "../../persistence/prisma.service.js";
import { createG2DatabaseError, G2DatabaseError, mapG2DatabaseError } from "./g2-database-error.mapper.js";
import { ChapterVersionQueryRepository, type ChapterVersionQueryRow } from "./chapter-version-query.repository.js";
import { ScriptVersionRepository } from "./script-version.repository.js";
import { VersionTransactionRunner } from "./version-transaction-runner.service.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";
import * as wsCharacter from "../character-domain.util.js";
import { UNRESOLVED_STORY_CHARACTER_PREFIX } from "./story-document-adapter.util.js";

const STORY_SOURCE_POLICY = "story-source-v1";

export interface ApplyStoryTaskResultRequest {
  readonly expectedTargetId: string;
  readonly expectedTargetRowVersion: number;
  readonly sourceId: string;
  readonly sourceDigest?: Digest;
  readonly document: unknown;
}

function iso(value: Date): string {
  return value.toISOString();
}

function digest(value: string): Digest {
  return value as Digest;
}

function emptyStoryDocument(chapterId: string): StoryDocumentV2 {
  return {
    schemaVersion: 2,
    chapterId,
    synopsis: "",
    direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" },
    characters: [],
    scenes: [],
    beats: [],
    notes: "",
  };
}

function origin(value: string): "user_edit" | "ai_generate" | "import" | "legacy_import" {
  if (value === "ai_generate" || value === "import" || value === "legacy_import") return value;
  return "user_edit";
}

function versionSummary(
  row: NonNullable<ChapterVersionQueryRow["currentStoryVersion"]>,
  currentId: string | null,
): VersionSummary {
  const lifecycle = row.status as VersionSummary["lifecycle"];
  const freshness = lifecycle === "pending_confirmation"
    ? "pending"
    : row.id === currentId
      ? "current"
      : "historical";
  return {
    id: row.id,
    version: row.version,
    lifecycle,
    schemaVersion: row.schemaVersion,
    documentDigest: digest(row.documentDigest),
    sourceId: row.sourceScriptVersionId,
    sourceDigest: row.sourceDigest ? digest(row.sourceDigest) : null,
    sourcePolicyVersion: row.sourcePolicyVersion,
    origin: origin(row.origin),
    rowVersion: row.rowVersion,
    freshness,
    reasonCodes: [],
    createdAt: iso(row.createdAt),
    confirmedAt: row.confirmedAt ? iso(row.confirmedAt) : null,
    archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
  };
}

function parseStoryDocument(row: { documentJson: unknown; schemaVersion: number }): StoryDocumentV2 {
  if (row.schemaVersion !== 2) throw createG2DatabaseError(409, "VERSION_CODEC_UPGRADE_REQUIRED", { schemaVersion: row.schemaVersion, expected: 2 });
  try {
    return StoryDocumentCodecV2.parse(row.documentJson);
  } catch (error) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
  }
}

function encodeStoryDocument(document: unknown, chapterId: string) {
  try {
    const encoded = encodeStoryDocumentV2(document);
    if (encoded.value.chapterId !== chapterId) throw new DocumentValidationError("story.chapterId: scope mismatch");
    return encoded;
  } catch (error) {
    if (error instanceof G2DatabaseError) throw error;
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
  }
}

@Injectable()
export class StoryVersionRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
    @Inject(ChapterVersionQueryRepository) private readonly chapterQuery: ChapterVersionQueryRepository,
    @Inject(ScriptVersionRepository) private readonly scriptRepository: ScriptVersionRepository,
  ) {}

  async getWorkingCopy(scope: VersionScopeV1): Promise<StoryWorkingCopyDto> {
    this.assertDatabaseMode();
    const row = await this.chapterQuery.findByScope(scope);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return this.toWorkingCopy(row);
  }

  async createWorkingCopy(
    scope: VersionScopeV1,
    request: CreateStoryWorkingCopyRequest,
  ): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      this.assertScriptGate(chapter, request.expectedSourceScriptVersionId);
      const current = chapter.currentStoryVersion;
      const empty = encodeStoryDocument(emptyStoryDocument(chapter.id), chapter.id);
      const targetDocument = request.mode === "clone_current"
        ? current ? parseStoryDocument(current) : (() => { throw createG2DatabaseError(409, "VERSION_NOT_FOUND"); })()
        : empty.value;
      const targetEncoded = encodeStoryDocument(targetDocument, chapter.id);
      const pending = chapter.pendingStoryVersion;
      if (pending) {
        const sameTarget = pending.sourceScriptVersionId === request.expectedSourceScriptVersionId
          && pending.sourceDigest === chapter.currentScriptVersion?.sourceDigest
          && pending.documentDigest === targetEncoded.digest
          && chapter.pendingStoryVersionId === pending.id;
        if (sameTarget && chapter.currentStoryVersionId === request.expectedCurrentVersionId && chapter.rowVersion === request.expectedChapterRowVersion + 1) {
          return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        }
        throw createG2DatabaseError(409, "ACTIVE_PENDING_EXISTS");
      }
      if (chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (chapter.currentStoryVersionId !== request.expectedCurrentVersionId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      const now = new Date();
      const previous = await tx.storyVersion.findFirst({ where: { chapterId: chapter.id }, orderBy: { version: "desc" } });
      const created = await tx.storyVersion.create({
        data: {
          id: randomUUID(),
          projectId: chapter.projectId,
          chapterId: chapter.id,
          version: (previous?.version ?? 0) + 1,
          status: "pending_confirmation",
          sourceScriptVersionId: request.expectedSourceScriptVersionId,
          sourcePolicyVersion: STORY_SOURCE_POLICY,
          sourceDigest: chapter.currentScriptVersion!.sourceDigest,
          documentJson: targetEncoded.value as unknown as Prisma.InputJsonValue,
          schemaVersion: 2,
          documentDigest: targetEncoded.digest,
          origin: "user_edit",
          rowVersion: 0,
          createdAt: now,
        },
      });
      await this.rebuildProjections(tx, created.id, targetEncoded.value, scope);
      const pendingBoardCleared = chapter.pendingStoryboardVersionId !== null;
      if (pendingBoardCleared) await this.archivePendingStoryboard(tx, chapter);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        pendingStoryVersionId: created.id,
        pendingStoryboardVersionId: null,
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async updateWorkingCopy(
    scope: VersionScopeV1,
    request: UpdateStoryWorkingCopyRequest,
  ): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    this.assertDatabaseMode();
    const input = encodeStoryDocument(request.document, scope.chapterId).value;
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const document = await this.resolveCharacters(tx, scope.projectId, input);
      const encoded = encodeStoryDocument(document, scope.chapterId);
      const pending = chapter.pendingStoryVersion;
      if (!pending || chapter.pendingStoryVersionId !== request.pendingVersionId) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      if (chapter.rowVersion !== request.expectedChapterRowVersion || pending.rowVersion !== request.expectedPendingRowVersion) {
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && pending.rowVersion === request.expectedPendingRowVersion + 1 && pending.documentDigest === encoded.digest) {
          return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        }
        throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      }
      await tx.storyVersion.updateMany({
        where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion },
        data: { documentJson: encoded.value as unknown as Prisma.InputJsonValue, documentDigest: encoded.digest, schemaVersion: 2, rowVersion: { increment: 1 } },
      }).then((result) => { if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT"); });
      await this.rebuildProjections(tx, pending.id, encoded.value, scope);
      if (chapter.pendingStoryboardVersionId !== null) await this.archivePendingStoryboard(tx, chapter);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        pendingStoryboardVersionId: null,
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async discardWorkingCopy(
    scope: VersionScopeV1,
    request: DiscardStoryWorkingCopyRequest,
  ): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const pending = chapter.pendingStoryVersion;
      if (!pending) {
        const history = chapter.storyVersionsByChapter.find((item) => item.id === request.pendingVersionId);
        if (chapter.rowVersion === request.expectedChapterRowVersion + 1 && history?.status === "archived") return this.mutation(chapter, this.toWorkingCopy(chapter), true);
        throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      }
      if (pending.id !== request.pendingVersionId || pending.rowVersion !== request.expectedPendingRowVersion || chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      const now = new Date();
      await tx.storyVersion.updateMany({
        where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion, status: "pending_confirmation" },
        data: { status: "archived", archivedAt: now, rowVersion: { increment: 1 } },
      }).then((result) => { if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT"); });
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        pendingStoryVersionId: null,
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async copyHistoryToWorkingCopy(scope: VersionScopeV1, versionId: string, request: VersionHistoryCopyRequest): Promise<VersionMutationResult<StoryWorkingCopyDto>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const source = chapter.storyVersionsByChapter.find((item) => item.id === versionId);
      if (!source) throw createG2DatabaseError(404, "VERSION_NOT_FOUND");
      if (chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (chapter.currentStoryVersionId !== request.expectedCurrentVersionId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      if (chapter.pendingStoryVersionId !== null) throw createG2DatabaseError(409, "ACTIVE_PENDING_EXISTS");
      const document = parseStoryDocument(source);
      const previous = chapter.storyVersionsByChapter.reduce((max, item) => Math.max(max, item.version), 0);
      const now = new Date();
      const created = await tx.storyVersion.create({ data: {
        id: randomUUID(), projectId: chapter.projectId, chapterId: chapter.id, version: previous + 1,
        status: "pending_confirmation", sourceScriptVersionId: source.sourceScriptVersionId,
        sourcePolicyVersion: source.sourcePolicyVersion, sourceDigest: source.sourceDigest,
        documentJson: document as unknown as Prisma.InputJsonValue, schemaVersion: 2,
        documentDigest: source.documentDigest, origin: "user_edit", rowVersion: 0, createdAt: now,
      } });
      await this.rebuildProjections(tx, created.id, document, scope);
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, { pendingStoryVersionId: created.id, pendingStoryboardVersionId: null, rowVersion: { increment: 1 } });
      const updated = await this.readChapter(scope, tx);
      return this.mutation(updated, this.toWorkingCopy(updated), false);
    });
  }

  async confirmWorkingCopy(
    scope: VersionScopeV1,
    request: ConfirmStoryWorkingCopyRequest,
  ): Promise<VersionMutationResult<StoryWorkingCopyMutationValue>> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await this.readChapter(scope, tx);
      const current = chapter.currentStoryVersion;
      if (
        chapter.rowVersion === request.expectedChapterRowVersion + 1 &&
        chapter.currentStoryVersionId === request.pendingVersionId &&
        chapter.pendingStoryVersionId === null &&
        current?.documentDigest === request.expectedPendingDocumentDigest
      ) {
        const document = parseStoryDocument(current);
        return this.mutation(chapter, { current: versionSummary(current, chapter.currentStoryVersionId), document }, true);
      }
      const pending = chapter.pendingStoryVersion;
      this.assertScriptGate(chapter, request.expectedSourceScriptVersionId, request.expectedSourceDigest);
      if (!pending || chapter.pendingStoryVersionId !== request.pendingVersionId) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      if (chapter.rowVersion !== request.expectedChapterRowVersion || pending.rowVersion !== request.expectedPendingRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (chapter.currentStoryVersionId !== request.expectedCurrentVersionId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      if (pending.documentDigest !== request.expectedPendingDocumentDigest) throw createG2DatabaseError(409, "WORKING_DIGEST_CHANGED");
      const document = parseStoryDocument(pending);
      const encoded = encodeStoryDocument(document, chapter.id);
      if (encoded.digest !== request.expectedPendingDocumentDigest) throw createG2DatabaseError(409, "WORKING_DIGEST_CHANGED");
      await this.resolveCharacters(tx, scope.projectId, document);
      await this.rebuildProjections(tx, pending.id, document, scope);
      if (chapter.pendingStoryboardVersionId !== null) await this.archivePendingStoryboard(tx, chapter);
      const now = new Date();
      await tx.storyVersion.updateMany({
        where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedPendingRowVersion, status: "pending_confirmation" },
        data: { status: "confirmed", confirmedAt: now, rowVersion: { increment: 1 } },
      }).then((result) => { if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT"); });
      await this.updateChapterCas(tx, scope, request.expectedChapterRowVersion, {
        currentStoryVersionId: pending.id,
        pendingStoryVersionId: null,
        pendingStoryboardVersionId: null,
        // A later Story confirmation invalidates downstream freshness but must
        // never move the chapter milestone backwards from storyboard_done.
        milestoneStatus: chapter.currentStoryboardVersionId === null ? "structured" : chapter.milestoneStatus,
        rowVersion: { increment: 1 },
      });
      const updated = await this.readChapter(scope, tx);
      if (!updated.currentStoryVersion) throw createG2DatabaseError(500, "G2_DATABASE_CONTRACT_VIOLATION");
      return this.mutation(updated, { current: versionSummary(updated.currentStoryVersion, updated.currentStoryVersionId), document: parseStoryDocument(updated.currentStoryVersion) }, false);
    });
  }

  /**
   * Applies a story_parse provider result without confirming the version.  A
   * worker calls the transaction variant together with task finalization so
   * the pending pointer, document projections, attempt and task status are
   * one atomic operation.
   */
  async applyTaskResult(scope: VersionScopeV1, request: ApplyStoryTaskResultRequest): Promise<StoryDocumentV2> {
    this.assertDatabaseMode();
    return this.run((tx) => this.applyTaskResultInTransaction(tx, scope, request));
  }

  async applyTaskResultInTransaction(
    tx: Prisma.TransactionClient,
    scope: VersionScopeV1,
    request: ApplyStoryTaskResultRequest,
  ): Promise<StoryDocumentV2> {
    const chapter = await this.readChapter(scope, tx);
    const pending = chapter.pendingStoryVersion;
    if (!pending || chapter.pendingStoryVersionId !== request.expectedTargetId || pending.status !== "pending_confirmation") {
      throw createG2DatabaseError(409, "TASK_TARGET_SUPERSEDED", { expectedTargetId: request.expectedTargetId, actualTargetId: chapter.pendingStoryVersionId });
    }
    if (pending.rowVersion !== request.expectedTargetRowVersion) {
      throw createG2DatabaseError(409, "TASK_TARGET_SUPERSEDED", { expectedTargetId: request.expectedTargetId, expectedTargetRowVersion: request.expectedTargetRowVersion, actualRowVersion: pending.rowVersion });
    }
    this.assertScriptGate(chapter, request.sourceId, request.sourceDigest);
    const input = encodeStoryDocument(request.document, chapter.id).value;
    const document = await this.resolveCharacters(tx, chapter.projectId, input);
    const encoded = encodeStoryDocument(document, chapter.id);
    const updated = await tx.storyVersion.updateMany({
      where: { id: pending.id, chapterId: chapter.id, rowVersion: request.expectedTargetRowVersion, status: "pending_confirmation" },
      data: { documentJson: encoded.value as unknown as Prisma.InputJsonValue, documentDigest: encoded.digest, schemaVersion: 2, rowVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw createG2DatabaseError(409, "TASK_TARGET_SUPERSEDED", { expectedTargetId: request.expectedTargetId });
    await this.rebuildProjections(tx, pending.id, encoded.value, scope);
    await this.updateChapterCas(tx, scope, chapter.rowVersion, { rowVersion: { increment: 1 } });
    return encoded.value;
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED", { actualMode: this.prismaService.mode, requiredMode: "db" });
  }

  private async run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.transactionRunner.run(operation); }
    catch (error) {
      if (error instanceof G2DatabaseError) throw error;
      throw new G2DatabaseError(mapG2DatabaseError(error));
    }
  }

  private async readChapter(scope: VersionScopeV1, reader: Pick<Prisma.TransactionClient, "chapter">): Promise<ChapterVersionQueryRow> {
    const row = await this.chapterQuery.findByScope(scope, reader);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return row;
  }

  private assertScriptGate(chapter: ChapterVersionQueryRow, expectedScriptId: string, expectedDigest?: Digest): void {
    if (!chapter.currentScriptVersion || chapter.currentScriptVersionId !== expectedScriptId || chapter.scriptWorkingState !== "clean") throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
    if (expectedDigest !== undefined && chapter.currentScriptVersion.sourceDigest !== expectedDigest) throw createG2DatabaseError(409, "UPSTREAM_SOURCE_STALE");
    if (chapter.chapterScriptPendingByChapter) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
  }

  private toWorkingCopy(row: ChapterVersionQueryRow): StoryWorkingCopyDto {
    const pending = row.pendingStoryVersion;
    const current = row.currentStoryVersion;
    const documentRow = pending ?? current;
    const document = documentRow ? parseStoryDocument(documentRow) : null;
    return {
      pending: pending ? versionSummary(pending, row.currentStoryVersionId) : null,
      current: current ? versionSummary(current, row.currentStoryVersionId) : null,
      document,
      basedOnCurrentVersionId: pending && current && pending.documentDigest === current.documentDigest ? current.id : null,
      sourceScriptVersionId: pending?.sourceScriptVersionId ?? current?.sourceScriptVersionId ?? null,
      rowVersion: pending?.rowVersion ?? null,
      productionState: this.scriptRepository.toProductionState(row),
    };
  }

  private mutation<T>(row: ChapterVersionQueryRow, value: T, replayed: boolean): ScriptMutationResult<T> {
    return { value, productionState: this.scriptRepository.toProductionState(row), chapterRowVersion: row.rowVersion, replayed };
  }

  private async updateChapterCas(tx: Prisma.TransactionClient, scope: VersionScopeV1, expected: number, data: Prisma.ChapterUncheckedUpdateManyInput): Promise<void> {
    const result = await tx.chapter.updateMany({ where: { id: scope.chapterId, projectId: scope.projectId, rowVersion: expected }, data });
    if (result.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
  }

  private async resolveCharacters(tx: Prisma.TransactionClient, projectId: string, document: StoryDocumentV2): Promise<StoryDocumentV2> {
    if (document.characters.length === 0) return document;
    const rows = await tx.character.findMany({ where: { projectId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const byName = new Map(rows.map((row) => [row.normalizedName, row]));
    const byIdentity = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const rowEntityType = wsCharacter.normalizeEntityType(row.entityType);
      const identity = `${rowEntityType}:${wsCharacter.normalizeCharacterIdentityKey(row.name, rowEntityType)}`;
      if (!byIdentity.has(identity)) byIdentity.set(identity, row);
    }
    const characters = [] as StoryDocumentV2["characters"];

    for (const character of document.characters) {
      const normalizedName = wsCharacter.normalizeCharacterNameKey(character.name);
      const identityKey = `${character.entityType}:${wsCharacter.normalizeCharacterIdentityKey(character.name, character.entityType)}`;
      const isUnresolved = character.projectCharacterId.startsWith(UNRESOLVED_STORY_CHARACTER_PREFIX);
      // group 旧数据可能已经把“商队众人 / 商队多人”建成两个 Character。
      // 重新确认结构时始终优先使用保守身份键，让旧项目也逐步收敛到一份素材身份。
      let resolved = character.entityType === "group"
        ? byIdentity.get(identityKey) ?? (isUnresolved ? byName.get(normalizedName) : byId.get(character.projectCharacterId))
        : isUnresolved
          ? byName.get(normalizedName) ?? byIdentity.get(identityKey)
          : byId.get(character.projectCharacterId);

      if (!resolved && isUnresolved) {
        const id = `char_${randomUUID()}`;
        resolved = await tx.character.create({
          data: {
            id,
            projectId,
            name: wsCharacter.normalizeCharacterName(character.name),
            normalizedName,
            role: character.role.trim() || wsCharacter.getDefaultRoleForLevel(character.level),
            level: character.level,
            entityType: character.entityType,
            status: requiredCharacterReferenceKind(character) === "final_reference" ? "needs_reference" : "draft",
            appearance: character.visualTraits.trim() || character.notes.trim(),
            personality: character.motivation.trim(),
            promptFragment: character.visualTraits.trim(),
            source: "story_structure",
          },
        });
        byId.set(resolved.id, resolved);
        byName.set(resolved.normalizedName, resolved);
        byIdentity.set(identityKey, resolved);
      }

      if (!resolved) {
        throw createG2DatabaseError(422, "SOURCE_UNRESOLVED", { entityIds: [character.projectCharacterId] });
      }
      characters.push({ ...character, projectCharacterId: resolved.id });
    }

    return { ...document, characters };
  }

  private async archivePendingStoryboard(tx: Prisma.TransactionClient, chapter: ChapterVersionQueryRow): Promise<void> {
    if (!chapter.pendingStoryboardVersionId) return;
    const now = new Date();
    const result = await tx.storyboardVersion.updateMany({
      where: { id: chapter.pendingStoryboardVersionId, chapterId: chapter.id, projectId: chapter.projectId, status: "pending_confirmation" },
      data: { status: "archived", archivedAt: now, rowVersion: { increment: 1 } },
    });
    if (result.count !== 1) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
  }

  private async rebuildProjections(tx: Prisma.TransactionClient, storyVersionId: string, document: StoryDocumentV2, scope: VersionScopeV1): Promise<void> {
    await tx.storyBeatProjection.deleteMany({ where: { storyVersionId } });
    await tx.storySceneProjection.deleteMany({ where: { storyVersionId } });
    const sceneIds = new Map<string, string>();
    for (const [index, scene] of document.scenes.entries()) {
      const existing = await tx.chapterScene.findFirst({ where: { chapterId: scope.chapterId, sceneKey: scene.id } });
      const chapterScene = existing ?? await tx.chapterScene.create({ data: { id: randomUUID(), projectId: scope.projectId, chapterId: scope.chapterId, sceneKey: scene.id } });
      sceneIds.set(scene.id, chapterScene.id);
      await tx.storySceneProjection.create({ data: { id: randomUUID(), storyVersionId, chapterSceneId: chapterScene.id, sceneKey: scene.id, order: index + 1, name: scene.name, semanticDigest: digestCanonicalJson(scene) } });
    }
    for (const [index, beat] of document.beats.entries()) {
      await tx.storyBeatProjection.create({ data: { id: randomUUID(), storyVersionId, beatKey: beat.id, order: index + 1, chapterSceneId: beat.sceneId ? sceneIds.get(beat.sceneId) ?? null : null, summary: beat.summary, semanticDigest: digestCanonicalJson(beat) } });
    }
  }
}
