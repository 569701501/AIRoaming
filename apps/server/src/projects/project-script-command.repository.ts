import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { encodeScriptTextV1, stripChapterScriptName, extractScriptOutlineTitle } from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { getDefaultChapterTitle } from "./project-domain.util.js";
import { VersionTransactionRunner } from "./versioning/version-transaction-runner.service.js";
import { createG2DatabaseError } from "./versioning/g2-database-error.mapper.js";
import { createScriptOutlineId, createScriptPendingIds } from "./versioning/runtime-command-id.js";
import type { SaveScriptOutlineFromAIInput, WriteChapterDraftFromAIInput } from "./projects.service.js";

const EMPTY_SCRIPT_DIGEST = encodeScriptTextV1("", { allowEmpty: true }).digest;

export interface ProjectMetadataPatch {
  name?: string;
  storyTitle?: string;
  genreTags?: string[];
  artStyle?: string;
  description?: string;
}

export interface ScriptCommandResult {
  pendingId: string;
  revisionId: string;
  replayed: boolean;
}

function digestText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function cleanTags(tags: string[] | undefined): string[] | undefined {
  return tags?.map((tag) => tag.trim()).filter(Boolean);
}

@Injectable()
export class ProjectScriptCommandRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
  ) {}

  async updateProjectMetadata(projectId: string, patch: ProjectMetadataPatch): Promise<void> {
    this.assertDatabaseMode();
    await this.transactionRunner.run(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project || project.lifecycleStatus !== "active") throw createG2DatabaseError(404, "PROJECT_NOT_FOUND");
      const data: Prisma.ProjectUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name.trim();
      if (patch.storyTitle !== undefined) data.storyTitle = patch.storyTitle.trim() || null;
      if (patch.genreTags !== undefined) data.genreTags = cleanTags(patch.genreTags) ?? [];
      if (patch.artStyle !== undefined) data.artStyle = patch.artStyle.trim() || null;
      if (patch.description !== undefined) data.description = patch.description.trim() || null;
      const current = {
        name: project.name,
        storyTitle: project.storyTitle,
        genreTags: Array.isArray(project.genreTags) ? project.genreTags : [],
        artStyle: project.artStyle,
        description: project.description,
      };
      const next = {
        name: patch.name === undefined ? current.name : patch.name.trim(),
        storyTitle: patch.storyTitle === undefined ? current.storyTitle : patch.storyTitle.trim() || null,
        genreTags: patch.genreTags === undefined ? current.genreTags : cleanTags(patch.genreTags) ?? [],
        artStyle: patch.artStyle === undefined ? current.artStyle : patch.artStyle.trim() || null,
        description: patch.description === undefined ? current.description : patch.description.trim() || null,
      };
      if (JSON.stringify(current) === JSON.stringify(next)) return;
      const updated = await tx.project.updateMany({ where: { id: projectId, rowVersion: project.rowVersion, lifecycleStatus: "active" }, data: { ...data, rowVersion: { increment: 1 } } });
      if (updated.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
    });
  }

  async ensureChapter(projectId: string, order: number, title?: string): Promise<{ id: string; replayed: boolean }> {
    this.assertDatabaseMode();
    if (!Number.isInteger(order) || order <= 0) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "order" });
    return this.transactionRunner.run(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project || project.lifecycleStatus !== "active") throw createG2DatabaseError(404, "PROJECT_NOT_FOUND");
      const existing = await tx.chapter.findUnique({ where: { projectId_order: { projectId, order } } });
      if (existing) return { id: existing.id, replayed: true };
      const suffix = String(order).padStart(3, "0");
      const id = `${projectId}_chapter_${suffix}`;
      const now = new Date();
      await tx.chapter.create({ data: { id, projectId, slug: `chapter-${suffix}`, order, title: title?.trim() || getDefaultChapterTitle(order), milestoneStatus: "draft", scriptWorkingText: "", scriptWorkingDigest: EMPTY_SCRIPT_DIGEST, scriptWorkingState: "empty", rowVersion: 0, createdAt: now, updatedAt: now } });
      const updated = await tx.project.updateMany({ where: { id: projectId, rowVersion: project.rowVersion, lifecycleStatus: "active" }, data: { currentChapterId: id, rowVersion: { increment: 1 } } });
      if (updated.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      return { id, replayed: false };
    });
  }

  async createAiPendingSuggestion(projectId: string, chapterId: string, input: WriteChapterDraftFromAIInput): Promise<ScriptCommandResult> {
    this.assertDatabaseMode();
    const sourceText = stripChapterScriptName(input.sourceText.trim());
    if (!sourceText) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "sourceText" });
    let encoded: ReturnType<typeof encodeScriptTextV1>;
    try { encoded = encodeScriptTextV1(sourceText); } catch (error) { throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error); }
    const ids = createScriptPendingIds({ projectId, chapterId, threadId: input.threadId, toolCallId: input.toolCallId, operation: input.operation });
    return this.transactionRunner.run(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      const chapter = await tx.chapter.findUnique({ where: { id: chapterId, projectId } });
      if (!project || project.lifecycleStatus !== "active") throw createG2DatabaseError(404, "PROJECT_NOT_FOUND");
      if (!chapter) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
      if (input.operation === "update_chapter_draft" && chapter.order > 1) {
        const continuitySource = input.continuitySource;
        if (!continuitySource) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
        const previous = await tx.chapter.findUnique({
          where: { projectId_order: { projectId, order: chapter.order - 1 } },
          include: { currentScriptVersion: true },
        });
        if (!previous?.currentScriptVersion) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
        if (
          previous.id !== continuitySource.previousChapterId
          || previous.currentScriptVersion.id !== continuitySource.previousScriptVersionId
          || previous.currentScriptVersion.sourceDigest !== continuitySource.previousSourceDigest
        ) {
          throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
        }
      }
      const existing = await tx.chapterScriptPending.findUnique({ where: { id: ids.pendingId } });
      if (existing) {
        if (existing.chapterId !== chapterId || existing.sourceDigest !== encoded.digest || existing.operation !== input.operation) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
        return { pendingId: existing.id, revisionId: ids.revisionId, replayed: true };
      }
      const active = await tx.chapterScriptPending.findUnique({ where: { chapterId } });
      if (active) throw createG2DatabaseError(409, "ACTIVE_PENDING_EXISTS");
      const thread = input.threadId ? await tx.conversationThread.findUnique({ where: { id: input.threadId } }) : null;
      const message = input.messageId ? await tx.conversationMessage.findUnique({ where: { id: input.messageId } }) : null;
      const now = new Date();
      const persistedToolCallId = thread && message ? input.toolCallId : null;
      await tx.chapterScriptPending.create({ data: { id: ids.pendingId, chapterId, sourceText: encoded.canonical, sourceDigest: encoded.digest, operation: input.operation, threadId: thread ? input.threadId : null, messageId: message ? input.messageId : null, toolCallId: persistedToolCallId, rowVersion: 0, createdAt: now, updatedAt: now } });
      await tx.chapterScriptRevision.create({ data: { id: ids.revisionId, chapterId, source: "ai_tool", threadId: thread ? input.threadId : null, messageId: message ? input.messageId : null, toolCallId: persistedToolCallId, operation: input.operation, summary: input.summary.trim(), targetWorkingDigest: encoded.digest, createdAt: now } });
      const updated = await tx.chapter.updateMany({ where: { id: chapterId, projectId, rowVersion: chapter.rowVersion }, data: { lastScriptRevisionId: ids.revisionId, rowVersion: { increment: 1 } } });
      if (updated.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      return { pendingId: ids.pendingId, revisionId: ids.revisionId, replayed: false };
    });
  }

  async saveScriptOutline(projectId: string, input: SaveScriptOutlineFromAIInput): Promise<{ outlineId: string; replayed: boolean }> {
    this.assertDatabaseMode();
    const sourceText = input.sourceText.trim();
    if (!sourceText) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "sourceText" });
    const canonical = sourceText.endsWith("\n") ? sourceText : `${sourceText}\n`;
    const sourceDigest = digestText(canonical);
    const outlineId = createScriptOutlineId({ projectId, threadId: input.threadId, toolCallId: input.toolCallId });
    return this.transactionRunner.run(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project || project.lifecycleStatus !== "active") throw createG2DatabaseError(404, "PROJECT_NOT_FOUND");
      const existing = await tx.projectScriptOutline.findUnique({ where: { id: outlineId } });
      if (existing) {
        if (existing.sourceDigest !== sourceDigest) throw createG2DatabaseError(409, "PENDING_VERSION_CONFLICT");
        return { outlineId, replayed: true };
      }
      const current = project.currentScriptOutlineId ? await tx.projectScriptOutline.findUnique({ where: { id: project.currentScriptOutlineId } }) : null;
      if (current?.status === "draft" && current.sourceDigest === sourceDigest) return { outlineId: current.id, replayed: true };
      const last = await tx.projectScriptOutline.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
      const now = new Date();
      const title = extractScriptOutlineTitle(canonical) ?? (project.storyTitle?.trim() || "未命名故事");
      await tx.projectScriptOutline.create({ data: { id: outlineId, projectId, version: (last?.version ?? 0) + 1, status: "draft", title, sourceText: canonical, sourceDigest, createdAt: now, updatedAt: now } });
      const updated = await tx.project.updateMany({ where: { id: projectId, rowVersion: project.rowVersion }, data: { currentScriptOutlineId: outlineId, storyTitle: title, rowVersion: { increment: 1 } } });
      if (updated.count !== 1) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      return { outlineId, replayed: false };
    });
  }

  async confirmScriptOutline(projectId: string, expectedOutlineId: string): Promise<{ outlineId: string; replayed: boolean }> {
    this.assertDatabaseMode();
    return this.transactionRunner.run(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      const outline = await tx.projectScriptOutline.findUnique({ where: { id: expectedOutlineId } });
      if (!project || project.lifecycleStatus !== "active") throw createG2DatabaseError(404, "PROJECT_NOT_FOUND");
      if (!outline || outline.projectId !== projectId) throw createG2DatabaseError(404, "VERSION_NOT_FOUND");
      if (project.currentScriptOutlineId !== expectedOutlineId) throw createG2DatabaseError(409, "CURRENT_VERSION_CHANGED");
      if (outline.status === "confirmed") return { outlineId: expectedOutlineId, replayed: true };
      const now = new Date();
      await tx.projectScriptOutline.updateMany({ where: { projectId, status: "confirmed", id: { not: expectedOutlineId } }, data: { status: "archived" } });
      await tx.projectScriptOutline.update({ where: { id: expectedOutlineId }, data: { status: "confirmed", confirmedAt: now } });
      await tx.project.update({ where: { id: projectId }, data: { rowVersion: { increment: 1 } } });
      return { outlineId: expectedOutlineId, replayed: false };
    });
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED", { actualMode: this.prismaService.mode, requiredMode: "db" });
  }
}
