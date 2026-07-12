import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  extractChapterScriptName,
  extractChapterScriptTitle,
  extractScriptOutlineTitle,
  stripChapterScriptName,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterPendingSourceText,
  type ChapterScriptVersionItem,
  type ClearChapterScriptResponse,
  type CompleteChapterRequest,
  type CompleteChapterResponse,
  type ConfirmChapterPendingSourceResponse,
  type DiscardChapterPendingSourceResponse,
  type GetChapterResponse,
  type ProjectScriptOutline,
  type ResetProjectScriptResponse,
  type SaveChapterDraftRequest,
  type SaveChapterDraftResponse,
  type ScriptImportAnalysis,
  type ScriptImportChapterPlan,
  type ScriptRevisionItem,
} from "@airoaming/shared";
import type { AnalyzeScriptImportInput } from "./script-import.util.js";
import type { LocalChapter, LocalChapterScriptVersion, LocalProject } from "./local-types.js";
import type {
  ImportScriptToChaptersInput,
  ImportScriptToChaptersResult,
  SaveScriptOutlineFromAIInput,
  WriteChapterDraftFromAIInput,
  WriteChapterDraftFromAIResult,
} from "./projects.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as scriptImportUtil from "./script-import.util.js";
import { DEFAULT_CHAPTER_ID, getDefaultChapterTitle } from "./project-domain.util.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";

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
  ) {}

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

  /**
   * 内部:写入/覆盖章节正文草稿缓冲(不碰正式 sourceText)。
   * 给 writeChapterDraftFromAI 和三期批量生成调用。
   */


  async importScriptToChapters(
    projectId: string,
    input: ImportScriptToChaptersInput,
  ): Promise<ImportScriptToChaptersResult> {
    const project = await this.projectStore.getReadyProject(projectId);
    const sourceText = input.sourceText.trim();
    if (!sourceText) {
      throw new BadRequestException("SCRIPT_SOURCE_REQUIRED");
    }

    const now = new Date().toISOString();
    const parsedChapters = scriptImportUtil.parseProvidedScriptChapters(sourceText);
    const revision: ScriptRevisionItem = {
      id: randomUUID(),
      projectId: project.id,
      chapterId: null,
      source: "ai_tool",
      threadId: input.threadId,
      messageId: input.messageId,
      toolCallId: input.toolCallId,
      operation: "import_script_to_chapters",
      summary: `根据${input.sourceName || "用户提供剧本"}整理并写入 ${parsedChapters.length} 个章节。`,
      createdAt: now,
    };
    const chapters = parsedChapters.map((item, index): LocalChapter => {
      const order = index + 1;
      const suffix = String(order).padStart(3, "0");
      const existing = project.chapters.find((chapter) => chapter.order === order);
      const chapterId = existing?.id ?? `chapter_${suffix}`;
      return {
        id: chapterId,
        projectId: project.id,
        slug: `chapter-${suffix}`,
        order,
        title: item.title || `第 ${order} 章`,
        status: "draft",
        currentScriptVersionId: null,
        currentStoryVersionId: null,
        sourceText: item.sourceText,
        summary: item.summary,
        storyStructure: null,
        storyboard: null,
        pendingStoryboard: null,
        pendingSourceText: null,
        imagePreflight: null,
        candidates: [],
        layout: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        completedAt: null,
        scriptVersions: existing?.scriptVersions ?? [],
        lastScriptRevision: {
          ...revision,
          chapterId,
        },
      };
    });
    const currentChapter = chapters[0] ?? wsDomain.createDefaultChapter(project.id, sourceText, now);
    const parsedStoryTitle = extractChapterScriptName(sourceText);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: currentChapter.id,
      storyTitle: parsedStoryTitle || project.storyTitle,
      sourceText: currentChapter.sourceText,
      chapters,
      updatedAt: now,
    };

    await this.repository.clearProjectChaptersDir(nextProject.id);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapters: wsDomain.sortChapters(chapters).map((item) => wsDomain.toChapterListItem(item)),
      currentChapter: wsDomain.toChapterDetail(currentChapter),
      revision,
    };
  }

  /**
   * 确保指定 order 的章节存在(边生成边建章,见 ADR-0008 三期)。
   * 存在则返回原章节;不存在则按 order 建一个空章节并落盘。
   * 用于批量逐章生成时,每生成一章前确保目标章节已就位。
   */


  async analyzeScriptImport(projectId: string, input: AnalyzeScriptImportInput): Promise<ScriptImportAnalysis> {
    const project = await this.projectStore.getReadyProject(projectId);
    const sourceText = input.sourceText.trim();
    if (!sourceText) {
      return {
        decision: "reject",
        contentType: "invalid",
        reason: "附件或粘贴内容为空，不能导入为章节。",
        chapters: [],
        risk: "没有可写入章节的正文。",
        nextTool: null,
      };
    }

    const parsedChapters = scriptImportUtil.parseProvidedScriptChapters(sourceText);
    const contentType = scriptImportUtil.inferScriptImportContentType(sourceText);
    const chapterPlans = parsedChapters.map((chapter, index): ScriptImportChapterPlan => ({
      order: index + 1,
      title: chapter.title,
      boundary: chapter.boundary,
      summary: chapter.summary,
    }));
    const hasOnlySingleFallbackChapter = parsedChapters.length === 1 && parsedChapters[0].boundary === "single_chapter";
    const hasNumericBoundaries = parsedChapters.some((chapter) => chapter.boundary === "numeric_heading");
    const hasNonEmptyExistingChapters = project.chapters.some((chapter) => chapter.sourceText.trim().length > 0);

    if (contentType === "invalid") {
      return scriptImportUtil.createScriptImportAnalysis({
        decision: "reject",
        contentType,
        reason: "这份内容太短或缺少连续剧情，暂时不像可导入的剧本。",
        chapters: chapterPlans,
        risk: "直接导入会生成空章节或无效章节正文。",
      });
    }

    if (contentType === "outline" || contentType === "worldbuilding") {
      return scriptImportUtil.createScriptImportAnalysis({
        decision: "reject",
        contentType,
        reason: contentType === "outline"
          ? "这份内容更像大纲或提纲，缺少可作为正文导入的连续剧情。"
          : "这份内容更像世界观、角色或素材设定，不适合作为章节正文直接导入。",
        chapters: chapterPlans,
        risk: "直接导入会把设定或提纲误写成章节正文。",
      });
    }

    if (hasNumericBoundaries && !scriptImportUtil.areNumericBoundariesCredible(parsedChapters)) {
      return scriptImportUtil.createScriptImportAnalysis({
        decision: "reject",
        contentType,
        reason: "识别到数字编号，但这些编号后面的正文不够像剧本章节，不能直接按 1、2、3 拆章。",
        chapters: chapterPlans,
        risk: "数字编号可能只是普通列表或提纲编号。",
      });
    }

    if (hasOnlySingleFallbackChapter) {
      return scriptImportUtil.createScriptImportAnalysis({
        decision: "needs_user_confirmation",
        contentType,
        reason: "这份内容像故事或剧本，但没有识别到明确章节边界。",
        chapters: chapterPlans,
        risk: "继续导入会先写成单个章节；如果要自动拆成多章，需要后续再做剧情节拍拆分。",
      });
    }

    if (hasNonEmptyExistingChapters && !input.userConfirmedOverwrite) {
      return scriptImportUtil.createScriptImportAnalysis({
        decision: "needs_user_confirmation",
        contentType,
        reason: "当前项目里已经有非空章节，导入会用新内容替换同序号章节草稿。",
        chapters: chapterPlans,
        risk: "继续导入可能覆盖已有章节草稿，请确认后再写入。",
      });
    }

    return scriptImportUtil.createScriptImportAnalysis({
      decision: "ready_to_import",
      contentType,
      reason: `识别到 ${parsedChapters.length} 个可信章节边界，内容可以整理为章节草稿。`,
      chapters: chapterPlans,
      risk: null,
    });
  }



  async writeChapterDraftFromAI(
    projectId: string,
    chapterId: string,
    input: WriteChapterDraftFromAIInput,
  ): Promise<WriteChapterDraftFromAIResult> {
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
    const project = await this.projectStore.getReadyProject(projectId);
    const sourceText = input.sourceText.trim();
    if (!sourceText) {
      throw new BadRequestException("AI_SCRIPT_OUTLINE_REQUIRED");
    }

    const now = new Date().toISOString();
    const title = extractScriptOutlineTitle(sourceText) ?? project.storyTitle ?? project.name;
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



  async confirmScriptOutline(projectId: string): Promise<ProjectScriptOutline> {
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



  async resetProjectScript(projectId: string): Promise<ResetProjectScriptResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const now = new Date().toISOString();
    const chapter = wsDomain.createDefaultChapter(project.id, "", now);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: chapter.id,
      sourceText: "",
      chapters: [chapter],
      updatedAt: now,
    };

    await this.repository.clearProjectChaptersDir(nextProject.id);
    await this.repository.clearLegacyStoryDir(nextProject.id);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapter: wsDomain.toChapterDetail(chapter),
      chapters: [wsDomain.toChapterListItem(chapter)],
    };
  }



  async ensureChapterExists(projectId: string, order: number, title?: string): Promise<ChapterDetail> {
    const project = await this.projectStore.getReadyProject(projectId);
    const existing = project.chapters.find((chapter) => chapter.order === order);
    if (existing) {
      return wsDomain.toChapterDetail(existing);
    }

    const now = new Date().toISOString();
    const nextChapter = this.createNextChapter(project.id, project.chapters, now, title);
    const nextProject: LocalProject = {
      ...project,
      chapters: [...project.chapters, nextChapter],
      currentChapterId: nextChapter.id,
      updatedAt: now,
    };

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return wsDomain.toChapterDetail(nextChapter);
  }



  async getChapter(projectId: string, chapterId: string): Promise<GetChapterResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      chapter: wsDomain.toChapterDetail(chapter),
    };
  }



}
