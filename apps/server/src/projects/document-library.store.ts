import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";

import { WorkspacePathService } from "../workspace/workspace-path.service.js";

export interface StoredDocumentFile {
  storageKey: string;
  absolutePath: string;
  sha256: string;
  bytes: number;
}

const DOCUMENTS_VIRTUAL_DIR = "/workspace/documents";

@Injectable()
export class DocumentLibraryStore {
  constructor(@Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService) {}

  private documentsRoot(): string {
    const root = this.workspacePathService.resolveVirtualPath(DOCUMENTS_VIRTUAL_DIR);
    return root;
  }

  private workDir(workId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(workId)) throw new Error("DOCUMENT_WORK_ID_INVALID");
    return path.join(this.documentsRoot(), workId);
  }

  private storageKeyFor(workId: string, fileName: string): string {
    return `${DOCUMENTS_VIRTUAL_DIR}/${workId}/${fileName}`;
  }

  async saveSourceFile(workId: string, fileName: string, content: Buffer): Promise<StoredDocumentFile> {
    const dir = this.workDir(workId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const safeName = path.basename(fileName).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    const absolutePath = path.join(dir, safeName);
    await writeFile(absolutePath, content, { mode: 0o600 });
    const digest = createHash("sha256").update(content).digest("hex");
    return {
      storageKey: this.storageKeyFor(workId, safeName),
      absolutePath,
      sha256: `sha256:${digest}`,
      bytes: content.byteLength,
    };
  }

  async readSourceText(storageKey: string, encoding: "utf-8" | "gb18030" = "utf-8"): Promise<string> {
    const absolutePath = this.workspacePathService.resolveVirtualPath(storageKey);
    const buffer = await readFile(absolutePath);
    return new TextDecoder(encoding).decode(buffer).replace(/\r\n/g, "\n");
  }

  async readChapterText(
    storageKey: string,
    startOffset: number,
    endOffset: number,
    encoding: "utf-8" | "gb18030" = "utf-8",
  ): Promise<string> {
    const absolutePath = this.workspacePathService.resolveVirtualPath(storageKey);
    const buffer = await readFile(absolutePath);
    // 与拆章引擎保持一致：offset 基于 \r\n → \n 归一化后的文本计算，读取必须先归一化再 slice
    const text = new TextDecoder(encoding).decode(buffer).replace(/\r\n/g, "\n");
    const start = Math.max(0, Math.min(startOffset, text.length));
    const end = Math.max(start, Math.min(endOffset, text.length));
    return text.slice(start, end);
  }

  async workSourceStat(storageKey: string): Promise<{ bytes: number }> {
    const absolutePath = this.workspacePathService.resolveVirtualPath(storageKey);
    const result = await stat(absolutePath);
    return { bytes: result.size };
  }

  async deleteWorkFiles(workId: string): Promise<void> {
    const dir = this.workDir(workId);
    await rm(dir, { recursive: true, force: true });
  }

  async listStorageKeys(): Promise<string[]> {
    const root = this.documentsRoot();
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    const keys: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }
      for (const file of files) {
        keys.push(`${DOCUMENTS_VIRTUAL_DIR}/${entry.name}/${file}`);
      }
    }
    return keys.sort();
  }

  async renameWorkDir(workId: string, nextWorkId: string): Promise<void> {
    const from = this.workDir(workId);
    const to = this.workDir(nextWorkId);
    await rename(from, to);
  }
}
