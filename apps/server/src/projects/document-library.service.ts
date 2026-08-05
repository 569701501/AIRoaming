import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  decodeDocumentBufferV1,
  splitDocumentTextV1,
} from "@airoaming/shared";

import { DocumentLibraryRepository } from "./document-library.repository.js";
import { DocumentLibraryStore } from "./document-library.store.js";

export interface DocumentWorkListItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  chapterCount: number;
  unassignedCount: number;
  importError: string | null;
  sourceBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChapterListItem {
  id: string;
  order: number;
  title: string;
  groupLabel: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
}

export interface DocumentWorkDetail {
  work: DocumentWorkListItem;
  chapters: DocumentChapterListItem[];
  groups: Array<{ label: string; chapterCount: number }>;
  sourceStorageKey: string;
  sourceEncoding: string | null;
}

export interface DocumentImportResult {
  work: DocumentWorkListItem;
  chapters: DocumentChapterListItem[];
  encoding: "utf-8" | "gb18030";
}

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

@Injectable()
export class DocumentLibraryService {
  constructor(
    @Inject(DocumentLibraryRepository) private readonly repository: DocumentLibraryRepository,
    @Inject(DocumentLibraryStore) private readonly store: DocumentLibraryStore,
  ) {}

  private toListItem(row: {
    id: string;
    name: string;
    kind: string;
    status: string;
    chapterCount: number;
    unassignedCount: number;
    importError: string | null;
    sourceBytes: number;
    createdAt: Date;
    updatedAt: Date;
  }): DocumentWorkListItem {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      status: row.status,
      chapterCount: row.chapterCount,
      unassignedCount: row.unassignedCount,
      importError: row.importError,
      sourceBytes: row.sourceBytes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(): Promise<DocumentWorkListItem[]> {
    const rows = await this.repository.listWorks();
    return rows.map((row) => this.toListItem(row));
  }

  async getDetail(id: string): Promise<DocumentWorkDetail | null> {
    const detail = await this.repository.getWorkWithChapters(id);
    if (!detail) return null;
    const groupsMap = new Map<string, number>();
    for (const chapter of detail.chapters) {
      groupsMap.set(chapter.groupLabel, (groupsMap.get(chapter.groupLabel) ?? 0) + 1);
    }
    return {
      work: this.toListItem(detail.work),
      chapters: detail.chapters.map((chapter) => ({
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        groupLabel: chapter.groupLabel,
        startOffset: chapter.startOffset,
        endOffset: chapter.endOffset,
        charCount: chapter.charCount,
      })),
      groups: [...groupsMap.entries()].map(([label, chapterCount]) => ({ label, chapterCount })),
      sourceStorageKey: detail.work.sourceStorageKey,
      sourceEncoding: detail.work.sourceEncoding,
    };
  }

  async importSource(fileName: string, content: Buffer): Promise<DocumentImportResult> {
    // multer 默认按 latin1 解码 multipart filename，中文文件名会变 mojibake（如 é›¨å¤œ），修正回 UTF-8
    let originalName = fileName;
    const repaired = Buffer.from(fileName, "latin1").toString("utf8");
    if (repaired !== fileName && /[\u4e00-\u9fff]/.test(repaired)) {
      originalName = repaired;
    }
    if (content.byteLength > MAX_SOURCE_BYTES) {
      throw new BadRequestException(`DOCUMENT_TOO_LARGE:max=${MAX_SOURCE_BYTES}`);
    }
    if (!/\.(txt|md|markdown)$/i.test(originalName)) {
      throw new BadRequestException("DOCUMENT_FORMAT_UNSUPPORTED:only .txt/.md");
    }
    const decoded = decodeDocumentBufferV1(content);
    if (decoded.text.trim().length === 0) {
      throw new BadRequestException("DOCUMENT_EMPTY");
    }
    const split = splitDocumentTextV1(decoded.text);
    if (split.chapters.length === 0) {
      throw new BadRequestException("DOCUMENT_SPLIT_FAILED");
    }

    const workId = `dw_${randomUUID().replaceAll("-", "")}`;
    const saved = await this.store.saveSourceFile(workId, originalName, content);

    const created = await this.repository.createWorkWithChapters(
      {
        id: workId,
        name: originalName.replace(/\.[^.]+$/, ""),
        kind: "text",
        sourceStorageKey: saved.storageKey,
        sourceSha256: saved.sha256,
        sourceBytes: saved.bytes,
        sourceEncoding: decoded.encoding,
      },
      split.chapters.map((chapter) => ({
        workId,
        order: chapter.order,
        title: chapter.title,
        groupLabel: chapter.groupLabel,
        startOffset: chapter.startOffset,
        endOffset: chapter.endOffset,
        charCount: chapter.charCount,
        anomaliesJson: chapter.anomalies,
      })),
    );

    return {
      work: this.toListItem(created.work),
      chapters: split.chapters.map((chapter, index) => ({
        id: `dc_${workId}_${index + 1}`,
        order: chapter.order,
        title: chapter.title,
        groupLabel: chapter.groupLabel,
        startOffset: chapter.startOffset,
        endOffset: chapter.endOffset,
        charCount: chapter.charCount,
      })),
      encoding: decoded.encoding,
    };
  }

  async rename(id: string, name: string): Promise<DocumentWorkListItem> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException("DOCUMENT_NAME_REQUIRED");
    const existing = await this.repository.getWork(id);
    if (!existing) throw new NotFoundException("DOCUMENT_NOT_FOUND");
    const updated = await this.repository.renameWork(id, trimmed);
    return this.toListItem(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.getWork(id);
    if (!existing) throw new NotFoundException("DOCUMENT_NOT_FOUND");
    await this.repository.deleteWork(id);
    await this.store.deleteWorkFiles(id).catch(() => undefined);
  }

  async readChapterText(id: string, chapterId: string): Promise<string | null> {
    const detail = await this.repository.getWorkWithChapters(id);
    if (!detail) return null;
    const chapter = detail.chapters.find((item) => item.id === chapterId);
    if (!chapter) return null;
    return this.store.readChapterText(
      detail.work.sourceStorageKey,
      chapter.startOffset,
      chapter.endOffset,
      detail.work.sourceEncoding === "gb18030" ? "gb18030" : "utf-8",
    );
  }
}
