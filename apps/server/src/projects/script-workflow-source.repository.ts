import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import {
  buildConfirmedScriptChapterMapV1,
  buildScriptPendingSourceProjectionV1,
  buildScriptRawSourceSnapshotV1,
  digestCanonicalJson,
  encodeScriptTextV1,
  importFidelityHasHardIssuesV1,
  parseChapterScriptMarkdownV1,
  parseImportAnalysisOutputV1,
  parseImportFidelityOutputV1,
  parseScriptOutlineMarkdownV1,
  scriptOutlineCardDigestV1,
  scriptSourceBlockCatalogV1,
  type ConfirmedScriptChapterMapItemV1,
  type ConfirmedScriptChapterMapV1,
  type ImportAnalysisOutputV1,
  type ImportFidelityOutputV1,
  type ScriptPendingSourceBindingV1,
  type ScriptRawSourceDocumentInputV1,
  type ScriptRawSourceInputModeV1,
  type ScriptRawSourceContentTypeHintV1,
  type ScriptSourceBlockRefV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { getDefaultChapterTitle } from "./project-domain.util.js";
import { createG2DatabaseError, G2DatabaseError, mapG2DatabaseError } from "./versioning/g2-database-error.mapper.js";
import { VersionTransactionRunner } from "./versioning/version-transaction-runner.service.js";

const EMPTY_SCRIPT_DIGEST = encodeScriptTextV1("", { allowEmpty: true }).digest;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canonicalScript(sourceText: string, mode: "creative" | "import"): { sourceText: string; sourceDigest: `sha256:${string}` } {
  try {
    parseChapterScriptMarkdownV1(sourceText, { mode });
    const encoded = encodeScriptTextV1(sourceText);
    return { sourceText: encoded.canonical, sourceDigest: encoded.digest };
  } catch (error) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
  }
}

function lineRefs(sourceText: string): string[] {
  return sourceText.trimEnd().split("\n").map((_line, index) => `line-${String(index + 1).padStart(6, "0")}`);
}

function mapDocument(value: Prisma.JsonValue, expectedDigest: string): ConfirmedScriptChapterMapV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED");
  const document = value as unknown as ConfirmedScriptChapterMapV1;
  if (document.schemaVersion !== "script-chapter-map/1.0" || document.mapDigest !== expectedDigest || !Array.isArray(document.chapters) || document.chapters.length === 0) {
    throw createG2DatabaseError(422, "SOURCE_UNRESOLVED");
  }
  return document;
}

function sourceBlocksForMapItem(
  rows: readonly { sourceRef: string; blockRef: string; globalOrder: number; kind: string }[],
  item: ConfirmedScriptChapterMapItemV1,
): ScriptSourceBlockRefV1[] {
  const byRef = new Map(rows.map((row, index) => [`${row.sourceRef}\u0000${row.blockRef}`, index]));
  const selected = new Set<number>();
  for (const range of item.sourceRanges) {
    const start = byRef.get(`${range.sourceRef}\u0000${range.startBlockRef}`);
    const end = byRef.get(`${range.sourceRef}\u0000${range.endBlockRef}`);
    if (start === undefined || end === undefined || start > end) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED");
    for (let index = start; index <= end; index += 1) {
      const row = rows[index];
      if (!row || row.sourceRef !== range.sourceRef) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED");
      selected.add(index);
    }
  }
  return [...selected].sort((left, right) => left - right).map((index) => {
    const row = rows[index]!;
    return { sourceRef: row.sourceRef, blockRef: row.blockRef, globalOrder: row.globalOrder, kind: row.kind as ScriptSourceBlockRefV1["kind"] };
  });
}

export interface CreateRawScriptSourceInput {
  inputMode: ScriptRawSourceInputModeV1;
  contentTypeHint?: ScriptRawSourceContentTypeHintV1;
  documents: readonly ScriptRawSourceDocumentInputV1[];
}

export interface RawScriptSourceResult {
  id: string;
  projectId: string;
  version: number;
  sourceDigest: `sha256:${string}`;
  documentCount: number;
  blockCount: number;
  replayed: boolean;
}

export interface AnalysisCandidateResult {
  id: string;
  rawSourceVersionId: string;
  version: number;
  status: string;
  analysisDigest: `sha256:${string}`;
  candidateDigest: `sha256:${string}`;
  replayed: boolean;
}

export interface ChapterMapResult {
  id: string;
  rawSourceVersionId: string;
  analysisCandidateId: string;
  version: number;
  mapDigest: `sha256:${string}`;
  chapters: ConfirmedScriptChapterMapItemV1[];
  replayed: boolean;
}

export interface ImportBatchResult {
  id: string;
  chapterMapId: string;
  status: string;
  items: Array<{ id: string; chapterId: string; mapItemRef: string; order: number; status: string }>;
  replayed: boolean;
}

@Injectable()
export class ScriptWorkflowSourceRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
  ) {}

  async createRawSource(projectId: string, input: CreateRawScriptSourceInput): Promise<RawScriptSourceResult> {
    this.assertDatabaseMode();
    const snapshot = buildScriptRawSourceSnapshotV1(input);
    return this.run(async (tx) => {
      const project = await tx.project.findFirst({ where: { id: projectId, lifecycleStatus: "active" } });
      if (!project) throw createG2DatabaseError(404, "PROJECT_NOT_FOUND");
      const existing = await tx.scriptRawSourceVersion.findUnique({ where: { projectId_sourceDigest: { projectId, sourceDigest: snapshot.sourceDigest } } });
      if (existing) return { id: existing.id, projectId, version: existing.version, sourceDigest: existing.sourceDigest as `sha256:${string}`, documentCount: existing.documentCount, blockCount: existing.blockCount, replayed: true };
      const latest = await tx.scriptRawSourceVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
      const sourceId = randomUUID();
      const now = new Date();
      await tx.scriptRawSourceVersion.create({ data: {
        id: sourceId,
        projectId,
        version: (latest?.version ?? 0) + 1,
        schemaVersion: snapshot.schemaVersion,
        inputMode: snapshot.inputMode,
        contentTypeHint: snapshot.contentTypeHint,
        sourceDigest: snapshot.sourceDigest,
        documentCount: snapshot.documents.length,
        blockCount: snapshot.documents.reduce((sum, document) => sum + document.blocks.length, 0),
        createdAt: now,
      } });
      for (const document of snapshot.documents) {
        const documentId = randomUUID();
        await tx.scriptRawSourceDocument.create({ data: {
          id: documentId,
          rawSourceVersionId: sourceId,
          sourceRef: document.sourceRef,
          sourceOrder: document.order,
          sourceName: document.name,
          mediaType: document.mediaType,
          sourceText: document.sourceText,
          sourceDigest: document.sourceDigest,
          createdAt: now,
        } });
        await tx.scriptRawSourceBlock.createMany({ data: document.blocks.map((block) => ({
          id: randomUUID(),
          rawSourceVersionId: sourceId,
          sourceDocumentId: documentId,
          sourceRef: block.sourceRef,
          blockRef: block.blockRef,
          globalOrder: block.globalOrder,
          sourceOrder: block.sourceOrder,
          locatorLabel: block.locatorLabel,
          kind: block.kind,
          sourceText: block.sourceText,
          sourceDigest: block.sourceDigest,
          createdAt: now,
        })) });
      }
      return { id: sourceId, projectId, version: (latest?.version ?? 0) + 1, sourceDigest: snapshot.sourceDigest, documentCount: snapshot.documents.length, blockCount: snapshot.documents.reduce((sum, document) => sum + document.blocks.length, 0), replayed: false };
    });
  }

  async createAnalysisCandidate(input: {
    projectId: string;
    rawSourceVersionId: string;
    analysis: unknown;
    promptPackVersion: string;
  }): Promise<AnalysisCandidateResult> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const source = await tx.scriptRawSourceVersion.findFirst({
        where: { id: input.rawSourceVersionId, projectId: input.projectId },
        include: { blocks: { orderBy: { globalOrder: "asc" } } },
      });
      if (!source) throw createG2DatabaseError(404, "RAW_SOURCE_NOT_FOUND");
      let analysis: ImportAnalysisOutputV1;
      try {
        analysis = parseImportAnalysisOutputV1(input.analysis, {
          sourceBlocks: source.blocks.map((block) => ({ sourceRef: block.sourceRef, blockRef: block.blockRef, globalOrder: block.globalOrder, kind: block.kind as ScriptSourceBlockRefV1["kind"] })),
          requireCompleteAssignment: true,
        });
      } catch (error) {
        throw createG2DatabaseError(422, "IMPORT_ANALYSIS_BLOCKED", error);
      }
      const analysisDigest = digestCanonicalJson(analysis);
      const validation = { schemaVersion: "import-analysis-validation/1.0", blockingIssues: [] as string[] };
      const validationDigest = digestCanonicalJson(validation);
      const candidateDigest = digestCanonicalJson({ sourceDigest: source.sourceDigest, analysisDigest, validationDigest, promptPackVersion: input.promptPackVersion });
      const active = await tx.scriptImportAnalysisCandidate.findFirst({ where: { rawSourceVersionId: source.id, status: "active" } });
      if (active?.candidateDigest === candidateDigest) {
        return { id: active.id, rawSourceVersionId: source.id, version: active.version, status: active.status, analysisDigest: active.analysisDigest as `sha256:${string}`, candidateDigest: active.candidateDigest as `sha256:${string}`, replayed: true };
      }
      const now = new Date();
      if (active) await tx.scriptImportAnalysisCandidate.update({ where: { id: active.id }, data: { status: "superseded", resolvedAt: now } });
      const latest = await tx.scriptImportAnalysisCandidate.findFirst({ where: { rawSourceVersionId: source.id }, orderBy: { version: "desc" } });
      const created = await tx.scriptImportAnalysisCandidate.create({ data: {
        id: randomUUID(), projectId: input.projectId, rawSourceVersionId: source.id, version: (latest?.version ?? 0) + 1, status: "active",
        contractVersion: analysis.schemaVersion, analysisJson: json(analysis), analysisDigest, validationJson: json(validation), validationDigest,
        candidateDigest, sourceDigest: source.sourceDigest, promptPackVersion: input.promptPackVersion, createdAt: now,
      } });
      return { id: created.id, rawSourceVersionId: source.id, version: created.version, status: created.status, analysisDigest, candidateDigest, replayed: false };
    });
  }

  async confirmAnalysisCandidate(projectId: string, candidateId: string): Promise<ChapterMapResult> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const candidate = await tx.scriptImportAnalysisCandidate.findFirst({
        where: { id: candidateId, projectId },
        include: { rawSourceVersion: { include: { blocks: { orderBy: { globalOrder: "asc" } } } }, chapterMap: true },
      });
      if (!candidate) throw createG2DatabaseError(404, "IMPORT_ANALYSIS_NOT_FOUND");
      if (candidate.chapterMap) {
        const document = mapDocument(candidate.chapterMap.mapJson, candidate.chapterMap.mapDigest);
        return { id: candidate.chapterMap.id, rawSourceVersionId: candidate.rawSourceVersionId, analysisCandidateId: candidate.id, version: candidate.chapterMap.version, mapDigest: candidate.chapterMap.mapDigest as `sha256:${string}`, chapters: document.chapters, replayed: true };
      }
      if (candidate.status !== "active") throw createG2DatabaseError(409, "IMPORT_ANALYSIS_BLOCKED");
      let analysis: ImportAnalysisOutputV1;
      try {
        analysis = parseImportAnalysisOutputV1(candidate.analysisJson, {
          sourceBlocks: candidate.rawSourceVersion.blocks.map((block) => ({ sourceRef: block.sourceRef, blockRef: block.blockRef, globalOrder: block.globalOrder, kind: block.kind as ScriptSourceBlockRefV1["kind"] })),
          requireCompleteAssignment: true,
        });
      } catch (error) {
        throw createG2DatabaseError(422, "IMPORT_ANALYSIS_BLOCKED", error);
      }
      let map: ConfirmedScriptChapterMapV1;
      try { map = buildConfirmedScriptChapterMapV1({ rawSourceDigest: candidate.sourceDigest as `sha256:${string}`, analysis }); }
      catch (error) { throw createG2DatabaseError(422, "IMPORT_ANALYSIS_BLOCKED", error); }
      const now = new Date();
      await tx.scriptImportAnalysisCandidate.update({ where: { id: candidate.id }, data: { status: "confirmed", resolvedAt: now } });
      const latest = await tx.scriptChapterMap.findFirst({ where: { rawSourceVersionId: candidate.rawSourceVersionId }, orderBy: { version: "desc" } });
      const created = await tx.scriptChapterMap.create({ data: {
        id: randomUUID(), projectId, rawSourceVersionId: candidate.rawSourceVersionId, analysisCandidateId: candidate.id,
        version: (latest?.version ?? 0) + 1, schemaVersion: map.schemaVersion, mapJson: json(map), mapDigest: map.mapDigest,
        sourceDigest: map.rawSourceDigest, analysisDigest: map.analysisDigest, confirmedAt: now, createdAt: now,
      } });
      return { id: created.id, rawSourceVersionId: created.rawSourceVersionId, analysisCandidateId: candidate.id, version: created.version, mapDigest: map.mapDigest, chapters: map.chapters, replayed: false };
    });
  }

  async startImportBatch(projectId: string, chapterMapId: string): Promise<ImportBatchResult> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const mapRow = await tx.scriptChapterMap.findFirst({ where: { id: chapterMapId, projectId }, include: { importBatch: { include: { items: { orderBy: { order: "asc" } } } } } });
      if (!mapRow) throw createG2DatabaseError(404, "IMPORT_MAP_NOT_FOUND");
      if (mapRow.importBatch) return { id: mapRow.importBatch.id, chapterMapId, status: mapRow.importBatch.status, items: mapRow.importBatch.items.map((item) => ({ id: item.id, chapterId: item.chapterId, mapItemRef: item.mapItemRef, order: item.order, status: item.status })), replayed: true };
      const document = mapDocument(mapRow.mapJson, mapRow.mapDigest);
      const now = new Date();
      const mapOrders = new Set(document.chapters.map((item) => item.order));
      const existingChapters = await tx.chapter.findMany({
        where: { projectId },
        include: { chapterScriptPendingByChapter: true },
      });
      const occupied = existingChapters.find((chapter) =>
        !mapOrders.has(chapter.order)
        || chapter.currentScriptVersionId !== null
        || chapter.chapterScriptPendingByChapter !== null
        || chapter.scriptWorkingText !== ""
        || chapter.scriptWorkingState !== "empty",
      );
      if (occupied) {
        throw createG2DatabaseError(409, "IMPORT_CHAPTER_OCCUPIED", {
          chapterId: occupied.id,
          order: occupied.order,
        });
      }
      const existingByOrder = new Map(
        existingChapters.map((chapter) => [chapter.order, chapter]),
      );
      const chapters: Array<{ id: string; mapItem: ConfirmedScriptChapterMapItemV1 }> = [];
      for (const mapItem of document.chapters) {
        const existing = existingByOrder.get(mapItem.order);
        if (existing) {
          const title = mapItem.title || getDefaultChapterTitle(mapItem.order);
          if (existing.title !== title) {
            await tx.chapter.update({
              where: { id: existing.id },
              data: {
                title,
                rowVersion: { increment: 1 },
                updatedAt: now,
              },
            });
          }
          chapters.push({ id: existing.id, mapItem });
          continue;
        }
        const suffix = String(mapItem.order).padStart(3, "0");
        const created = await tx.chapter.create({ data: { id: `${projectId}_chapter_${suffix}`, projectId, slug: `chapter-${suffix}`, order: mapItem.order, title: mapItem.title || getDefaultChapterTitle(mapItem.order), milestoneStatus: "draft", scriptWorkingText: "", scriptWorkingDigest: EMPTY_SCRIPT_DIGEST, scriptWorkingState: "empty", rowVersion: 0, createdAt: now, updatedAt: now } });
        chapters.push({ id: created.id, mapItem });
      }
      const batch = await tx.scriptImportBatch.create({ data: { id: randomUUID(), projectId, rawSourceVersionId: mapRow.rawSourceVersionId, chapterMapId: mapRow.id, status: "queued", inputDigest: mapRow.mapDigest, rowVersion: 0, createdAt: now, updatedAt: now } });
      const items = [] as ImportBatchResult["items"];
      for (const chapter of chapters) {
        const created = await tx.scriptImportBatchItem.create({ data: { id: randomUUID(), batchId: batch.id, chapterId: chapter.id, mapItemRef: chapter.mapItem.mapItemRef, order: chapter.mapItem.order, status: "queued", attempt: 0, sourceRangeDigest: chapter.mapItem.sourceRangeDigest, rowVersion: 0, createdAt: now, updatedAt: now } });
        items.push({ id: created.id, chapterId: created.chapterId, mapItemRef: created.mapItemRef, order: created.order, status: created.status });
      }
      return { id: batch.id, chapterMapId, status: batch.status, items, replayed: false };
    });
  }

  async createAiChapterPending(input: { projectId: string; chapterId: string; outlineId: string; sourceText: string; operation?: string }): Promise<{ pendingId: string; sourceSetDigest: `sha256:${string}` }> {
    this.assertDatabaseMode();
    const script = canonicalScript(input.sourceText, "creative");
    return this.run(async (tx) => {
      const chapter = await tx.chapter.findFirst({ where: { id: input.chapterId, projectId: input.projectId }, include: { chapterScriptPendingByChapter: true } });
      if (!chapter) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
      if (chapter.chapterScriptPendingByChapter) throw createG2DatabaseError(409, "ACTIVE_PENDING_EXISTS");
      if (
        chapter.currentScriptVersionId !== null
        || chapter.scriptWorkingText !== ""
        || chapter.scriptWorkingState !== "empty"
      ) {
        throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT", {
          chapterId: chapter.id,
          order: chapter.order,
        });
      }
      const project = await tx.project.findFirst({ where: { id: input.projectId, lifecycleStatus: "active", currentScriptOutlineId: input.outlineId } });
      const outline = await tx.projectScriptOutline.findFirst({ where: { id: input.outlineId, projectId: input.projectId, status: "confirmed" } });
      if (!project || !outline) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
      let card;
      try { card = parseScriptOutlineMarkdownV1(outline.sourceText).chapterCards.find((item) => item.order === chapter.order); }
      catch (error) { throw createG2DatabaseError(422, "SOURCE_UNRESOLVED", error); }
      if (!card) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED", { chapterOrder: chapter.order });
      const bindings: ScriptPendingSourceBindingV1[] = [
        { role: "outline", order: 1, sourceType: "project_script_outline", sourceId: outline.id, sourceDigest: outline.sourceDigest as `sha256:${string}` },
        { role: "chapter_card", order: 2, sourceType: "project_script_outline_card", sourceId: `${outline.id}#chapter-${String(card.order).padStart(3, "0")}`, sourceDigest: scriptOutlineCardDigestV1(card) },
      ];
      if (chapter.order > 1) {
        const previous = await tx.chapter.findUnique({ where: { projectId_order: { projectId: input.projectId, order: chapter.order - 1 } }, include: { currentScriptVersion: true } });
        if (!previous?.currentScriptVersion) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
        bindings.push({ role: "previous_script", order: 3, sourceType: "chapter_script_version", sourceId: previous.currentScriptVersion.id, sourceDigest: previous.currentScriptVersion.sourceDigest as `sha256:${string}` });
      }
      const sealed = buildScriptPendingSourceProjectionV1({ kind: "ai", policyVersion: "ai-chapter-generate/1.0", bindings });
      const pendingId = randomUUID();
      const now = new Date();
      await tx.chapterScriptPending.create({ data: { id: pendingId, chapterId: chapter.id, sourceText: script.sourceText, sourceDigest: script.sourceDigest, operation: input.operation ?? "generate_chapter", kind: "ai", sourcePolicyVersion: "ai-chapter-generate/1.0", rowVersion: 0, createdAt: now, updatedAt: now } });
      await tx.chapterScriptPendingSourceBinding.createMany({ data: sealed.projection.bindings.map((binding) => ({ id: randomUUID(), pendingId, role: binding.role, order: binding.order, sourceType: binding.sourceType, sourceId: binding.sourceId, sourceDigest: binding.sourceDigest, createdAt: now })) });
      await tx.chapterScriptPending.update({ where: { id: pendingId }, data: { sourceProjectionJson: json(sealed.projection), sourceSetDigest: sealed.sourceSetDigest, sourceSetSealedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      return { pendingId, sourceSetDigest: sealed.sourceSetDigest };
    });
  }

  async beginImportItem(projectId: string, itemId: string): Promise<{ itemId: string; attempt: number }> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const item = await tx.scriptImportBatchItem.findFirst({ where: { id: itemId, batch: { projectId } }, include: { batch: true } });
      if (!item || !["queued", "generation_failed"].includes(item.status)) throw createG2DatabaseError(409, "IMPORT_ITEM_STATE_CONFLICT");
      const now = new Date();
      if (item.batch.status === "queued") await tx.scriptImportBatch.update({ where: { id: item.batch.id }, data: { status: "processing", startedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      else if (!["processing", "partial_failure", "ready_for_review"].includes(item.batch.status)) throw createG2DatabaseError(409, "IMPORT_ITEM_STATE_CONFLICT");
      else if (item.batch.status !== "processing") await tx.scriptImportBatch.update({ where: { id: item.batch.id }, data: { status: "processing", completedAt: null, rowVersion: { increment: 1 }, updatedAt: now } });
      const updated = await tx.scriptImportBatchItem.update({ where: { id: item.id }, data: { status: "materializing", attempt: { increment: 1 }, outputDigest: null, errorCode: null, errorJson: Prisma.JsonNull, completedAt: null, rowVersion: { increment: 1 }, updatedAt: now } });
      return { itemId: item.id, attempt: updated.attempt };
    });
  }

  async markImportItemVerifying(projectId: string, itemId: string, sourceText: string): Promise<{ itemId: string; outputDigest: `sha256:${string}` }> {
    this.assertDatabaseMode();
    const script = canonicalScript(sourceText, "import");
    return this.run(async (tx) => {
      const item = await tx.scriptImportBatchItem.findFirst({ where: { id: itemId, status: "materializing", batch: { projectId } } });
      if (!item) throw createG2DatabaseError(409, "IMPORT_ITEM_STATE_CONFLICT");
      const now = new Date();
      await tx.scriptImportBatchItem.update({ where: { id: item.id }, data: { status: "verifying", outputDigest: script.sourceDigest, rowVersion: { increment: 1 }, updatedAt: now } });
      return { itemId, outputDigest: script.sourceDigest };
    });
  }

  async recordImportFidelity(input: {
    projectId: string;
    itemId: string;
    sourceText: string;
    report: unknown;
    materializePromptVersion: string;
    verifyPromptVersion: string;
  }): Promise<{ reportId: string; pendingId: string | null; hasHardIssues: boolean }> {
    this.assertDatabaseMode();
    const script = canonicalScript(input.sourceText, "import");
    return this.run(async (tx) => {
      const item = await tx.scriptImportBatchItem.findFirst({
        where: { id: input.itemId, status: "verifying", batch: { projectId: input.projectId } },
        include: { batch: { include: { chapterMap: true, rawSourceVersion: { include: { blocks: { orderBy: { globalOrder: "asc" } } } } } }, chapter: { include: { chapterScriptPendingByChapter: true } }, fidelityReports: { orderBy: { sequence: "desc" }, take: 1 } },
      });
      if (!item || item.outputDigest !== script.sourceDigest || item.chapter.chapterScriptPendingByChapter) throw createG2DatabaseError(409, "IMPORT_ITEM_STATE_CONFLICT");
      const map = mapDocument(item.batch.chapterMap.mapJson, item.batch.chapterMap.mapDigest);
      const mapItem = map.chapters.find((candidate) => candidate.mapItemRef === item.mapItemRef && candidate.order === item.order);
      if (!mapItem || mapItem.sourceRangeDigest !== item.sourceRangeDigest) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED");
      const sourceBlocks = sourceBlocksForMapItem(item.batch.rawSourceVersion.blocks, mapItem);
      let report: ImportFidelityOutputV1;
      try { report = parseImportFidelityOutputV1(input.report, { sourceBlocks, outputLineRefs: lineRefs(script.sourceText) }); }
      catch (error) { throw createG2DatabaseError(422, "IMPORT_FIDELITY_FAILED", error); }
      const hasHardIssues = importFidelityHasHardIssuesV1(report);
      const reportDigest = digestCanonicalJson(report);
      const reportId = randomUUID();
      const now = new Date();
      const sequence = (item.fidelityReports[0]?.sequence ?? 0) + 1;
      await tx.scriptImportFidelityReport.create({ data: { id: reportId, batchItemId: item.id, attempt: item.attempt, sequence, contractVersion: report.schemaVersion, reportJson: json(report), reportDigest, sourceRangeDigest: item.sourceRangeDigest, candidateDigest: script.sourceDigest, hasHardIssues, materializePromptVersion: input.materializePromptVersion, verifyPromptVersion: input.verifyPromptVersion, createdAt: now } });
      if (hasHardIssues) {
        await tx.scriptImportBatchItem.update({ where: { id: item.id }, data: { status: "generation_failed", errorCode: "IMPORT_FIDELITY_FAILED", errorJson: json({ reportId, reportDigest }), completedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
        await this.refreshBatchReadiness(tx, item.batch.id, now);
        return { reportId, pendingId: null, hasHardIssues: true };
      }
      const bindings: ScriptPendingSourceBindingV1[] = [
        { role: "raw_source", order: 1, sourceType: "script_raw_source_version", sourceId: item.batch.rawSourceVersion.id, sourceDigest: item.batch.rawSourceVersion.sourceDigest as `sha256:${string}` },
        { role: "analysis", order: 2, sourceType: "script_import_analysis_candidate", sourceId: item.batch.chapterMap.analysisCandidateId, sourceDigest: item.batch.chapterMap.analysisDigest as `sha256:${string}` },
        { role: "chapter_map", order: 3, sourceType: "script_chapter_map", sourceId: item.batch.chapterMap.id, sourceDigest: item.batch.chapterMap.mapDigest as `sha256:${string}` },
        { role: "map_item", order: 4, sourceType: "script_chapter_map_item", sourceId: `${item.batch.chapterMap.id}#${item.mapItemRef}`, sourceDigest: item.sourceRangeDigest as `sha256:${string}` },
        { role: "batch_item", order: 5, sourceType: "script_import_batch_item", sourceId: item.id, sourceDigest: script.sourceDigest },
        { role: "fidelity_report", order: 6, sourceType: "script_import_fidelity_report", sourceId: reportId, sourceDigest: reportDigest },
      ];
      const sealed = buildScriptPendingSourceProjectionV1({ kind: "import", policyVersion: "import-chapter-materialize/1.0", bindings });
      const pendingId = randomUUID();
      await tx.chapterScriptPending.create({ data: { id: pendingId, chapterId: item.chapterId, sourceText: script.sourceText, sourceDigest: script.sourceDigest, operation: "import_materialize", kind: "import", sourcePolicyVersion: "import-chapter-materialize/1.0", rowVersion: 0, createdAt: now, updatedAt: now } });
      await tx.chapterScriptPendingSourceBinding.createMany({ data: sealed.projection.bindings.map((binding) => ({ id: randomUUID(), pendingId, role: binding.role, order: binding.order, sourceType: binding.sourceType, sourceId: binding.sourceId, sourceDigest: binding.sourceDigest, createdAt: now })) });
      await tx.chapterScriptPending.update({ where: { id: pendingId }, data: { sourceProjectionJson: json(sealed.projection), sourceSetDigest: sealed.sourceSetDigest, sourceSetSealedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      await tx.scriptImportBatchItem.update({ where: { id: item.id }, data: { status: "pending_ready", completedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      await this.refreshBatchReadiness(tx, item.batch.id, now);
      return { reportId, pendingId, hasHardIssues: false };
    });
  }

  async confirmImportPending(input: { projectId: string; chapterId: string; pendingId: string }): Promise<{ scriptVersionId: string; batchItemId: string }> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const chapter = await tx.chapter.findFirst({ where: { id: input.chapterId, projectId: input.projectId }, include: { chapterScriptPendingByChapter: { include: { sourceBindings: true } }, currentScriptVersion: true } });
      const pending = chapter?.chapterScriptPendingByChapter;
      if (!chapter || !pending) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
      if (pending.id !== input.pendingId || pending.kind !== "import" || pending.sourceSetSealedAt === null) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
      if (chapter.currentScriptVersion !== null || chapter.scriptWorkingText !== "" || chapter.scriptWorkingState !== "empty") throw createG2DatabaseError(409, "IMPORT_CHAPTER_OCCUPIED");
      const itemSource = pending.sourceBindings.find((binding) => binding.role === "batch_item" && binding.sourceType === "script_import_batch_item");
      if (!itemSource) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED");
      const item = await tx.scriptImportBatchItem.findFirst({ where: { id: itemSource.sourceId, chapterId: chapter.id, status: "pending_ready", outputDigest: pending.sourceDigest }, include: { batch: true } });
      if (!item) throw createG2DatabaseError(409, "IMPORT_ITEM_STATE_CONFLICT");
      const latest = await tx.chapterScriptVersion.findFirst({ where: { chapterId: chapter.id }, orderBy: { version: "desc" } });
      const now = new Date();
      const created = await tx.chapterScriptVersion.create({ data: { id: randomUUID(), chapterId: chapter.id, version: (latest?.version ?? 0) + 1, sourceText: pending.sourceText, sourceDigest: pending.sourceDigest, origin: "import", createdAt: now, completedAt: now } });
      await tx.scriptImportBatchItem.update({ where: { id: item.id }, data: { status: "confirmed", confirmedScriptVersionId: created.id, completedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      await tx.chapterScriptPending.delete({ where: { id: pending.id } });
      await tx.chapter.update({ where: { id: chapter.id }, data: { scriptWorkingText: created.sourceText, scriptWorkingDigest: created.sourceDigest, scriptWorkingState: "clean", currentScriptVersionId: created.id, milestoneStatus: "script_done", completedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      const remaining = await tx.scriptImportBatchItem.count({ where: { batchId: item.batchId, status: { not: "confirmed" } } });
      if (remaining === 0) await tx.scriptImportBatch.update({ where: { id: item.batchId }, data: { status: "completed", completedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
      return { scriptVersionId: created.id, batchItemId: item.id };
    });
  }

  private async refreshBatchReadiness(tx: Prisma.TransactionClient, batchId: string, now: Date): Promise<void> {
    const batch = await tx.scriptImportBatch.findUnique({ where: { id: batchId }, include: { items: true } });
    if (!batch || batch.status !== "processing") return;
    if (batch.items.some((item) => ["queued", "materializing", "verifying"].includes(item.status))) return;
    const failed = batch.items.some((item) => item.status === "generation_failed");
    await tx.scriptImportBatch.update({ where: { id: batch.id }, data: { status: failed ? "partial_failure" : "ready_for_review", completedAt: now, rowVersion: { increment: 1 }, updatedAt: now } });
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED");
  }

  private async run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.transactionRunner.run(operation); }
    catch (error) {
      if (error instanceof G2DatabaseError) throw error;
      throw new G2DatabaseError(mapG2DatabaseError(error));
    }
  }
}
