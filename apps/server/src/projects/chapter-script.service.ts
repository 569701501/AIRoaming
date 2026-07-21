import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  extractChapterScriptName,
  extractChapterScriptTitle,
  extractScriptOutlineTitle,
  parseChapterScriptMarkdownV1,
  stripChapterScriptName,
  type ChapterPendingSourceText,
  type ClearChapterScriptResponse,
  type CompleteChapterRequest,
  type CompleteChapterResponse,
  type ConfirmChapterPendingSourceResponse,
  type DiscardChapterPendingSourceResponse,
  type GetChapterResponse,
  type ProjectScriptOutline,
  type SaveChapterDraftRequest,
  type SaveChapterDraftResponse,
  type ScriptRevisionItem,
} from "@airoaming/shared";
import type { LocalChapter, LocalChapterScriptVersion, LocalProject } from "./local-types.js";
import type {
  SaveScriptOutlineFromAIInput,
  WriteChapterDraftFromAIInput,
  WriteChapterDraftFromAIResult,
} from "./projects.service.js";
import * as wsDomain from "./project-domain.util.js";
import { getDefaultChapterTitle } from "./project-domain.util.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { ProjectScriptCommandRepository } from "./project-script-command.repository.js";
import { G2DatabaseError } from "./versioning/g2-database-error.mapper.js";

/**
 * 章节剧本编排(从 ProjectsService 抽出,见任务 2026-06-24_ChapterScriptService抽取)。
 * 收口章节剧本的保存/完成/清空/草稿缓冲/导入/AI写入/大纲。
 * 依赖 ProjectStore/Repository,不依赖 ProjectsService(无循环)。
 */
@Injectable()
export class ChapterScriptService {
  constructor(
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectScriptCommandRepository) private readonly scriptCommands?: ProjectScriptCommandRepository,
  ) {}

  private isDatabaseMode(): boolean {
    return (this.repository as unknown as { isDatabaseMode?: () => boolean }).isDatabaseMode?.() === true;
  }

  private async runDbCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof G2DatabaseError) {
        throw new HttpException({ success: false, error: { code: error.code, message: error.message, details: error.details } }, error.status);
      }
      throw error;
    }
  }

  createChapterScriptVersion(
    chapter: LocalChapter,
    sourceText: string,
    createdAt: string,
  ): LocalChapterScriptVersion {
    const version = chapter.scriptVersions.length + 1;
    return {
      id: `${chapter.id}_script_v${String(version).padStart(3, "0")}`,
      projectId: chapter.projectId,
      chapterId: chapter.id,
      version,
      sourcePath: `projects/${chapter.projectId}/chapters/${chapter.slug}/script.versions/script-v${String(version).padStart(3, "0")}.md`,
      status: "current",
      createdAt,
      sourceText,
    };
  }



  createNextChapter(
    projectId: string,
    chapters: LocalChapter[],
    now: string,
    title: string | undefined,
  ): LocalChapter {
    const nextOrder = Math.max(0, ...chapters.map((chapter) => chapter.order)) + 1;
    const suffix = String(nextOrder).padStart(3, "0");
    return {
      id: this.repository.createChapterId(projectId, nextOrder),
      projectId,
      slug: `chapter-${suffix}`,
      order: nextOrder,
      title: title?.trim() || getDefaultChapterTitle(nextOrder),
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText: "",
      summary: "",
      storyStructure: null,
      storyboard: null,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
      candidates: [],
      layout: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
    };
  }



  async applyChapterPendingSource(
    project: LocalProject,
    chapter: LocalChapter,
    input: WriteChapterDraftFromAIInput,
  ): Promise<LocalProject> {
    const now = new Date().toISOString();
    const rawSourceText = input.sourceText.trim();
    const sourceText = stripChapterScriptName(rawSourceText);
    if (!sourceText) {
      throw new BadRequestException("AI_CHAPTER_DRAFT_REQUIRED");
    }
    const previous = chapter.pendingSourceText;
    const pendingSourceText: ChapterPendingSourceText = {
      sourceText,
      threadId: input.threadId,
      messageId: input.messageId,
      toolCallId: input.toolCallId,
      operation: input.operation,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    const parsedChapterTitle = extractChapterScriptTitle(sourceText);
    const nextChapter: LocalChapter = {
      ...chapter,
      title: input.title?.trim() || parsedChapterTitle || chapter.title,
      summary: input.summary.trim() || chapter.summary,
      pendingSourceText,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return nextProject;
  }



  async saveChapterDraft(
    projectId: string,
    chapterId: string,
    input: SaveChapterDraftRequest,
  ): Promise<SaveChapterDraftResponse> {
    // 非空校验:空 sourceText 会用空内容覆盖正式正文(与 completeChapter 一致)。
    // 切章竞态/前端空态误触发保存时,拒绝落盘,避免数据损坏。
    if (!input.sourceText?.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }

    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const updatedAt = new Date().toISOString();
    const parsedStoryTitle = extractChapterScriptName(input.sourceText);
    const sourceText = stripChapterScriptName(input.sourceText);
    if (!sourceText.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }
    const parsedChapterTitle = extractChapterScriptTitle(sourceText);
    const nextChapter: LocalChapter = {
      ...chapter,
      title: input.title?.trim() || parsedChapterTitle || chapter.title,
      summary: input.summary === undefined ? chapter.summary : input.summary.trim(),
      sourceText,
      updatedAt,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      storyTitle: parsedStoryTitle || project.storyTitle,
      sourceText: nextChapter.sourceText,
      updatedAt,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject, "save_chapter_draft");
    this.repository.setProject(nextProject);

    return {
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }



  async completeChapter(
    projectId: string,
    chapterId: string,
    input: CompleteChapterRequest,
  ): Promise<CompleteChapterResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const completedAt = new Date().toISOString();
    const payload = input ?? ({} as CompleteChapterRequest);
    const sourceTextInput = typeof payload.sourceText === "string" ? payload.sourceText : chapter.sourceText;
    if (!sourceTextInput.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }

    const parsedStoryTitle = extractChapterScriptName(sourceTextInput);
    const sourceText = stripChapterScriptName(sourceTextInput);
    if (!sourceText.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }
    const parsedChapterTitle = extractChapterScriptTitle(sourceText);
    if (sourceText.trimStart().startsWith("# 章节剧本")) {
      try {
        parseChapterScriptMarkdownV1(sourceText, { characterRoster: "strict" });
      } catch (error) {
        throw new BadRequestException({
          code: "VERSION_DOCUMENT_INVALID",
          message: error instanceof Error ? error.message : "章节剧本格式不合法",
        });
      }
    }
    const scriptVersion = this.createChapterScriptVersion(chapter, sourceText, completedAt);
    const completedChapter: LocalChapter = {
      ...chapter,
      title: payload.title?.trim() || parsedChapterTitle || chapter.title,
      summary: payload.summary === undefined ? chapter.summary : payload.summary.trim(),
      sourceText,
      status: "script_done",
      currentScriptVersionId: scriptVersion.id,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
      updatedAt: completedAt,
      completedAt,
      scriptVersions: [
        ...chapter.scriptVersions.map((version) => ({
          ...version,
          status: "archived" as const,
        })),
        scriptVersion,
      ],
    };

    let chapters = wsDomain.sortChapters(project.chapters)
      .map((item) => (item.id === completedChapter.id ? completedChapter : item));
    const existingNextChapter = chapters.find((item) => item.order > completedChapter.order);
    let activeChapter = existingNextChapter ?? completedChapter;
    let createdNextChapter = false;

    if (!existingNextChapter && payload.createNextChapter !== false) {
      activeChapter = this.createNextChapter(project.id, chapters, completedAt, payload.nextChapterTitle);
      chapters = [...chapters, activeChapter];
      createdNextChapter = true;
    }

    const nextProject: LocalProject = {
      ...project,
      currentChapterId: completedChapter.id,
      storyTitle: parsedStoryTitle || project.storyTitle,
      sourceText: completedChapter.sourceText,
      chapters,
      updatedAt: completedAt,
    };

    await this.projectStore.writeProjectFiles(nextProject, "complete_chapter");
    this.repository.setProject(nextProject);

    return {
      completedChapter: wsDomain.toChapterDetail(completedChapter),
      activeChapter: wsDomain.toChapterDetail(completedChapter),
      chapters: wsDomain.sortChapters(chapters).map((item) => wsDomain.toChapterListItem(item)),
      scriptVersion: wsDomain.toChapterScriptVersionItem(scriptVersion),
      createdNextChapter,
    };
  }



  async clearChapterScript(projectId: string, chapterId: string): Promise<ClearChapterScriptResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const updatedAt = new Date().toISOString();
    const nextChapter: LocalChapter = {
      ...chapter,
      title: getDefaultChapterTitle(chapter.order),
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText: "",
      summary: "",
      storyStructure: null,
      storyboard: null,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
      candidates: [],
      layout: null,
      updatedAt,
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      sourceText: nextChapter.sourceText,
      updatedAt,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }

  /**
   * 确认章节正文草稿:把 pendingSourceText 覆盖到正式 sourceText,清掉 pending。
   * 仿 confirmChapterStoryboard(见 ADR-0008)。
   */


  async confirmChapterPendingSource(
    projectId: string,
    chapterId: string,
  ): Promise<ConfirmChapterPendingSourceResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.pendingSourceText) {
      throw new BadRequestException("CHAPTER_PENDING_SOURCE_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const sourceText = chapter.pendingSourceText.sourceText;
    const parsedChapterTitle = extractChapterScriptTitle(sourceText);
    const revision: ScriptRevisionItem = {
      id: randomUUID(),
      projectId,
      chapterId: chapter.id,
      source: "ai_tool",
      threadId: chapter.pendingSourceText.threadId,
      messageId: chapter.pendingSourceText.messageId,
      toolCallId: chapter.pendingSourceText.toolCallId,
      operation: chapter.pendingSourceText.operation,
      summary: `确认草稿:${chapter.pendingSourceText.operation}`,
      createdAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      title: parsedChapterTitle || chapter.title,
      sourceText,
      pendingSourceText: null,
      lastScriptRevision: revision,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      sourceText: nextChapter.sourceText,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }

  /**
   * 丢弃章节正文草稿:删除 pendingSourceText,正式 sourceText 不变。
   */


  async discardChapterPendingSource(
    projectId: string,
    chapterId: string,
  ): Promise<DiscardChapterPendingSourceResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.pendingSourceText) {
      throw new BadRequestException("CHAPTER_PENDING_SOURCE_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const nextChapter: LocalChapter = {
      ...chapter,
      pendingSourceText: null,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }

  async writeChapterDraftFromAI(
    projectId: string,
    chapterId: string,
    input: WriteChapterDraftFromAIInput,
  ): Promise<WriteChapterDraftFromAIResult> {
    if (this.isDatabaseMode()) {
      if (!this.scriptCommands) throw new Error("DB_SCRIPT_COMMAND_REPOSITORY_MISSING");
      await this.runDbCommand(() => this.scriptCommands!.createAiPendingSuggestion(projectId, chapterId, input));
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      const chapter = refreshed.chapters.find((item) => item.id === chapterId);
      if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");
      return { chapter: wsDomain.toChapterDetail(chapter), chapters: wsDomain.sortChapters(refreshed.chapters).map((item) => wsDomain.toChapterListItem(item)), revision: chapter.lastScriptRevision ?? { id: "", projectId, chapterId, source: "ai_tool", threadId: input.threadId, messageId: input.messageId, toolCallId: input.toolCallId, operation: input.operation, summary: input.summary, createdAt: new Date().toISOString() } };
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const nextProject = await this.applyChapterPendingSource(project, chapter, input);
    const nextChapter = this.projectStore.findChapter(nextProject, chapterId);
    const now = new Date().toISOString();
    // 草稿写入记录(非正式 sourceText 的 revision;正式 revision 在确认草稿时产生)。
    const revision: ScriptRevisionItem = {
      id: randomUUID(),
      projectId,
      chapterId: nextChapter.id,
      source: "ai_tool",
      threadId: input.threadId,
      messageId: input.messageId,
      toolCallId: input.toolCallId,
      operation: input.operation,
      summary: `${input.summary}(草稿缓冲,待确认)`,
      createdAt: now,
    };

    return {
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      revision,
    };
  }



  async saveScriptOutlineFromAI(projectId: string, input: SaveScriptOutlineFromAIInput): Promise<ProjectScriptOutline> {
    if (this.isDatabaseMode()) {
      if (!this.scriptCommands) throw new Error("DB_SCRIPT_COMMAND_REPOSITORY_MISSING");
      const result = await this.runDbCommand(() => this.scriptCommands!.saveScriptOutline(projectId, input));
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      const outline = refreshed.scriptOutline;
      if (!outline || outline.id !== result.outlineId) throw new NotFoundException("VERSION_NOT_FOUND");
      return outline;
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const sourceText = input.sourceText.trim();
    if (!sourceText) {
      throw new BadRequestException("AI_SCRIPT_OUTLINE_REQUIRED");
    }

    const now = new Date().toISOString();
    const title = extractScriptOutlineTitle(sourceText) ?? (project.storyTitle || "未命名故事");
    const outline: ProjectScriptOutline = {
      id: project.scriptOutline?.id ?? "script_outline_current",
      projectId,
      status: "draft",
      title,
      sourceText: sourceText.endsWith("\n") ? sourceText : `${sourceText}\n`,
      outlinePath: `projects/${projectId}/script-outline.md`,
      createdAt: project.scriptOutline?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: null,
    };
    const nextProject: LocalProject = {
      ...project,
      storyTitle: title || project.storyTitle,
      scriptOutline: outline,
      updatedAt: now,
    };

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return outline;
  }



  async confirmScriptOutline(projectId: string, expectedOutlineId?: string): Promise<ProjectScriptOutline> {
    if (this.isDatabaseMode()) {
      if (!expectedOutlineId?.trim()) throw new BadRequestException("VERSION_DOCUMENT_INVALID");
      if (!this.scriptCommands) throw new Error("DB_SCRIPT_COMMAND_REPOSITORY_MISSING");
      const result = await this.runDbCommand(() => this.scriptCommands!.confirmScriptOutline(projectId, expectedOutlineId));
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      const outline = refreshed.scriptOutline;
      if (!outline || outline.id !== result.outlineId) throw new NotFoundException("VERSION_NOT_FOUND");
      return outline;
    }
    const project = await this.projectStore.getReadyProject(projectId);
    if (!project.scriptOutline) {
      throw new BadRequestException("SCRIPT_OUTLINE_REQUIRED");
    }

    const now = new Date().toISOString();
    const outline: ProjectScriptOutline = {
      ...project.scriptOutline,
      status: "confirmed",
      updatedAt: now,
      confirmedAt: now,
    };
    const nextProject: LocalProject = {
      ...project,
      scriptOutline: outline,
      updatedAt: now,
    };

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return outline;
  }



  async getChapter(projectId: string, chapterId: string): Promise<GetChapterResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      chapter: wsDomain.toChapterDetail(chapter),
    };
  }



}
