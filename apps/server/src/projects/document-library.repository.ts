import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { PrismaService } from "../persistence/prisma.service.js";

export interface DocumentWorkSummary {
  id: string;
  name: string;
  kind: string;
  status: string;
  chapterCount: number;
  unassignedCount: number;
  importError: string | null;
  sourceBytes: number;
  sourceStorageKey: string;
  sourceEncoding: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChapterRow {
  id: string;
  workId: string;
  order: number;
  title: string;
  groupLabel: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
  anomaliesJson: unknown;
}

export interface CreateDocumentWorkInput {
  id?: string;
  name: string;
  kind: string;
  sourceStorageKey: string;
  sourceSha256: string;
  sourceBytes: number;
  sourceEncoding: string | null;
}

export interface CreateDocumentChapterInput {
  workId: string;
  order: number;
  title: string;
  groupLabel: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
  anomaliesJson: unknown;
}

@Injectable()
export class DocumentLibraryRepository {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  private db(): PrismaClient {
    return this.prismaService.database();
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw new Error("DB_PERSISTENCE_NOT_ENABLED");
  }

  async listWorks(): Promise<DocumentWorkSummary[]> {
    this.assertDatabaseMode();
    return this.db().documentWork.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        chapterCount: true,
        unassignedCount: true,
        importError: true,
        sourceBytes: true,
        sourceStorageKey: true,
        sourceEncoding: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getWork(id: string): Promise<DocumentWorkSummary | null> {
    this.assertDatabaseMode();
    return this.db().documentWork.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        chapterCount: true,
        unassignedCount: true,
        importError: true,
        sourceBytes: true,
        sourceStorageKey: true,
        sourceEncoding: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getWorkWithChapters(id: string): Promise<{
    work: DocumentWorkSummary;
    chapters: DocumentChapterRow[];
  } | null> {
    this.assertDatabaseMode();
    const work = await this.getWork(id);
    if (!work) return null;
    const chapters = await this.db().documentChapter.findMany({
      where: { workId: id },
      orderBy: { order: "asc" },
    });
    return {
      work,
      chapters: chapters.map((row) => ({
        id: row.id,
        workId: row.workId,
        order: row.order,
        title: row.title,
        groupLabel: row.groupLabel,
        startOffset: row.startOffset,
        endOffset: row.endOffset,
        charCount: row.charCount,
        anomaliesJson: row.anomaliesJson,
      })),
    };
  }

  async createWorkWithChapters(
    work: CreateDocumentWorkInput,
    chapters: CreateDocumentChapterInput[],
  ): Promise<{ work: DocumentWorkSummary; chapterCount: number }> {
    this.assertDatabaseMode();
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const created = await tx.documentWork.create({
        data: {
          ...(work.id ? { id: work.id } : {}),
          name: work.name,
          kind: work.kind,
          sourceStorageKey: work.sourceStorageKey,
          sourceSha256: work.sourceSha256,
          sourceBytes: work.sourceBytes,
          sourceEncoding: work.sourceEncoding,
          status: "ready",
          chapterCount: chapters.length,
          unassignedCount: chapters.filter((chapter) => chapter.groupLabel === "未分章").length,
        },
      });
      for (const chapter of chapters) {
        await tx.documentChapter.create({
          data: {
            workId: created.id,
            order: chapter.order,
            title: chapter.title,
            groupLabel: chapter.groupLabel,
            startOffset: chapter.startOffset,
            endOffset: chapter.endOffset,
            charCount: chapter.charCount,
            anomaliesJson: chapter.anomaliesJson === null || chapter.anomaliesJson === undefined
              ? Prisma.JsonNull
              : (chapter.anomaliesJson as Prisma.InputJsonValue),
          },
        });
      }
      return {
        work: {
          id: created.id,
          name: created.name,
          kind: created.kind,
          status: created.status,
          chapterCount: created.chapterCount,
          unassignedCount: created.unassignedCount,
          importError: created.importError,
          sourceBytes: created.sourceBytes,
          sourceStorageKey: created.sourceStorageKey,
          sourceEncoding: created.sourceEncoding,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        chapterCount: chapters.length,
      };
    });
  }

  async renameWork(id: string, name: string): Promise<DocumentWorkSummary> {
    this.assertDatabaseMode();
    const updated = await this.db().documentWork.update({
      where: { id },
      data: { name },
    });
    return {
      id: updated.id,
      name: updated.name,
      kind: updated.kind,
      status: updated.status,
      chapterCount: updated.chapterCount,
      unassignedCount: updated.unassignedCount,
      importError: updated.importError,
      sourceBytes: updated.sourceBytes,
      sourceStorageKey: updated.sourceStorageKey,
      sourceEncoding: updated.sourceEncoding,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async markImportFailed(id: string, error: string): Promise<void> {
    this.assertDatabaseMode();
    await this.db().documentWork.update({
      where: { id },
      data: { status: "failed", importError: error },
    });
  }

  async deleteWork(id: string): Promise<{ detachedChapterCount: number }> {
    this.assertDatabaseMode();
    return this.prismaService.runBusinessTransaction(async (tx) => {
      // 清理引用该文稿的项目章节引用，避免悬空引用
      const detached = await tx.chapter.updateMany({
        where: { documentWorkId: id },
        data: { documentWorkId: null, documentChapterId: null },
      });
      await tx.documentChapter.deleteMany({ where: { workId: id } });
      await tx.documentWork.delete({ where: { id } });
      return { detachedChapterCount: detached.count };
    });
  }
}
