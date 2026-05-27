import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  ART_STYLES,
  CHAPTER_STATUSES,
  COMIC_FORMATS,
  PROJECT_WORKFLOW_SCHEMA_VERSION,
  PROJECT_WORKFLOW_STEP_KEYS,
  PROJECT_WORKFLOW_STEPS,
  PROJECT_TYPES,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterScriptVersionItem,
  type ChapterStatus,
  type ArtStyle,
  type ComicFormat,
  type CompleteChapterRequest,
  type CompleteChapterResponse,
  type CreateProjectRequest,
  type DeleteProjectResponse,
  type GetChapterResponse,
  type ListChaptersResponse,
  type ProjectListItem,
  type ProjectType,
  type ProjectWorkflow,
  type ProjectWorkflowStep,
  type ProjectWorkflowStepKey,
  type ResetProjectScriptResponse,
  type SaveChapterDraftRequest,
  type SaveChapterDraftResponse,
  type ScriptImportAnalysis,
  type ScriptImportChapterBoundary,
  type ScriptImportChapterPlan,
  type ScriptImportContentType,
  type ScriptRevisionItem,
  type UpdateProjectDraftRequest,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import { TasksService } from "../tasks/tasks.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

const DEFAULT_CHAPTER_ID = "chapter_001";
const DEFAULT_CHAPTER_SLUG = "chapter-001";
const DEFAULT_CHAPTER_TITLE = "第 1 章";
const SCRIPT_VERSION_FILE_PATTERN = /^script-v(\d+)\.md$/;
const workflowStepOrder = new Map<ProjectWorkflowStepKey, number>(
  PROJECT_WORKFLOW_STEP_KEYS.map((key, index) => [key, index]),
);

interface LocalChapterScriptVersion extends ChapterScriptVersionItem {
  sourceText: string;
}

interface LocalChapter {
  id: string;
  projectId: string;
  slug: string;
  order: number;
  title: string;
  status: ChapterStatus;
  currentScriptVersionId: string | null;
  currentStoryVersionId: string | null;
  sourceText: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  scriptVersions: LocalChapterScriptVersion[];
  lastScriptRevision: ScriptRevisionItem | null;
}

interface LocalProject {
  id: string;
  name: string;
  type: ProjectType;
  currentChapterId: string | null;
  storyTitle: string;
  genreTags: string[];
  comicFormat: ComicFormat;
  artStyle: ArtStyle;
  description: string;
  sourceText: string;
  chapters: LocalChapter[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportScriptToChaptersInput {
  sourceText: string;
  sourceName: string;
  threadId: string;
  messageId: string;
  toolCallId: string;
}

export interface ImportScriptToChaptersResult {
  chapters: ChapterListItem[];
  currentChapter: ChapterDetail;
  revision: ScriptRevisionItem;
}

export interface WriteChapterDraftFromAIInput {
  sourceText: string;
  title?: string;
  summary: string;
  threadId: string;
  messageId: string;
  toolCallId: string;
  operation: "update_chapter_draft" | "generate_script_from_seed";
}

export interface WriteChapterDraftFromAIResult {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
  revision: ScriptRevisionItem;
}

export interface AnalyzeScriptImportInput {
  sourceText: string;
  sourceName: string;
  userConfirmedOverwrite?: boolean;
}

interface ParsedScriptChapter {
  title: string;
  sourceText: string;
  summary: string;
  boundary: ScriptImportChapterBoundary;
}

interface ChapterBoundaryMatch {
  index: number;
  title: string;
  boundary: ScriptImportChapterBoundary;
}

interface ScriptTextSignals {
  nonEmptyLineCount: number;
  averageLineLength: number;
  bulletRatio: number;
  dialogueLineCount: number;
  sceneLineCount: number;
  storySentenceCount: number;
  outlineWordCount: number;
  worldbuildingWordCount: number;
}

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly projects = new Map<string, LocalProject>();
  private projectsLoaded = false;
  private projectsLoadPromise: Promise<void> | null = null;

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(TasksService) private readonly tasksService: TasksService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureProjectsLoaded();
  }

  async listProjects(): Promise<ProjectListItem[]> {
    await this.ensureProjectsLoaded();
    return [...this.projects.values()]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((project) => this.toProjectListItem(project));
  }

  async createProject(input: CreateProjectRequest): Promise<ProjectListItem> {
    await this.ensureProjectsLoaded();
    const now = new Date().toISOString();
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("PROJECT_NAME_REQUIRED");
    }

    const storyTitle = input.storyTitle?.trim() || input.description?.trim() || name;
    const description = input.description?.trim() || storyTitle;
    const comicFormat = this.normalizeComicFormat(input.comicFormat);
    const artStyle = this.normalizeArtStyle(input.artStyle);
    const genreTags = this.normalizeGenreTags(input.genreTags);
    const sourceText = input.sourceText?.trim() ?? "";
    const projectId = randomUUID();

    const project: LocalProject = {
      id: projectId,
      name,
      type: this.normalizeProjectType(input.type),
      currentChapterId: DEFAULT_CHAPTER_ID,
      storyTitle,
      genreTags,
      comicFormat,
      artStyle,
      description,
      sourceText,
      chapters: [this.createDefaultChapter(projectId, sourceText, now)],
      createdAt: now,
      updatedAt: now,
    };

    await this.writeProjectFiles(project);
    this.projects.set(project.id, project);
    return this.toProjectListItem(project);
  }

  async updateProjectDraft(projectId: string, input: UpdateProjectDraftRequest): Promise<ProjectListItem> {
    const project = await this.getReadyProject(projectId);

    const nextName = input.name === undefined ? project.name : input.name.trim();
    if (!nextName) {
      throw new BadRequestException("PROJECT_NAME_REQUIRED");
    }

    const nextStoryTitle = input.storyTitle === undefined ? project.storyTitle : input.storyTitle.trim();
    const nextDescription = input.description === undefined ? project.description : input.description.trim();
    const nextSourceText = input.sourceText === undefined ? project.sourceText : input.sourceText;
    const updatedAt = new Date().toISOString();
    const nextChapters = this.updateCurrentChapterSource(project, nextSourceText, updatedAt);

    const nextProject: LocalProject = {
      ...project,
      name: nextName,
      storyTitle: nextStoryTitle || nextName,
      genreTags: input.genreTags === undefined ? project.genreTags : this.normalizeGenreTags(input.genreTags),
      comicFormat: input.comicFormat === undefined ? project.comicFormat : this.normalizeComicFormat(input.comicFormat),
      artStyle: input.artStyle === undefined ? project.artStyle : this.normalizeArtStyle(input.artStyle),
      description: nextDescription || nextStoryTitle || nextName,
      sourceText: nextSourceText,
      chapters: nextChapters,
      updatedAt,
    };

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return this.toProjectListItem(nextProject);
  }

  async listChapters(projectId: string): Promise<ListChaptersResponse> {
    const project = await this.getReadyProject(projectId);
    return {
      chapters: this.sortChapters(project.chapters).map((chapter) => this.toChapterListItem(chapter)),
      currentChapterId: project.currentChapterId,
    };
  }

  async getChapter(projectId: string, chapterId: string): Promise<GetChapterResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    return {
      chapter: this.toChapterDetail(chapter),
    };
  }

  async saveChapterDraft(
    projectId: string,
    chapterId: string,
    input: SaveChapterDraftRequest,
  ): Promise<SaveChapterDraftResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    const updatedAt = new Date().toISOString();
    const nextChapter: LocalChapter = {
      ...chapter,
      title: input.title?.trim() || chapter.title,
      summary: input.summary === undefined ? chapter.summary : input.summary.trim(),
      sourceText: input.sourceText,
      updatedAt,
    };
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      sourceText: nextChapter.sourceText,
      updatedAt,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async completeChapter(
    projectId: string,
    chapterId: string,
    input: CompleteChapterRequest,
  ): Promise<CompleteChapterResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    const completedAt = new Date().toISOString();
    const scriptVersion = this.createChapterScriptVersion(chapter, input.sourceText, completedAt);
    const completedChapter: LocalChapter = {
      ...chapter,
      title: input.title?.trim() || chapter.title,
      summary: input.summary === undefined ? chapter.summary : input.summary.trim(),
      sourceText: input.sourceText,
      status: "script_done",
      currentScriptVersionId: scriptVersion.id,
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

    let chapters = this.sortChapters(project.chapters)
      .map((item) => (item.id === completedChapter.id ? completedChapter : item));
    const existingNextChapter = chapters.find((item) => item.order > completedChapter.order);
    let activeChapter = existingNextChapter ?? completedChapter;
    let createdNextChapter = false;

    if (!existingNextChapter && input.createNextChapter !== false) {
      activeChapter = this.createNextChapter(project.id, chapters, completedAt, input.nextChapterTitle);
      chapters = [...chapters, activeChapter];
      createdNextChapter = true;
    }

    const nextProject: LocalProject = {
      ...project,
      currentChapterId: activeChapter.id,
      sourceText: activeChapter.sourceText,
      chapters,
      updatedAt: completedAt,
    };

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      completedChapter: this.toChapterDetail(completedChapter),
      activeChapter: this.toChapterDetail(activeChapter),
      chapters: this.sortChapters(chapters).map((item) => this.toChapterListItem(item)),
      scriptVersion: this.toChapterScriptVersionItem(scriptVersion),
      createdNextChapter,
    };
  }

  async importScriptToChapters(
    projectId: string,
    input: ImportScriptToChaptersInput,
  ): Promise<ImportScriptToChaptersResult> {
    const project = await this.getReadyProject(projectId);
    const sourceText = input.sourceText.trim();
    if (!sourceText) {
      throw new BadRequestException("SCRIPT_SOURCE_REQUIRED");
    }

    const now = new Date().toISOString();
    const parsedChapters = this.parseProvidedScriptChapters(sourceText);
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
    const currentChapter = chapters[0] ?? this.createDefaultChapter(project.id, sourceText, now);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: currentChapter.id,
      sourceText: currentChapter.sourceText,
      chapters,
      updatedAt: now,
    };

    await this.clearProjectChaptersDir(nextProject.id);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      chapters: this.sortChapters(chapters).map((item) => this.toChapterListItem(item)),
      currentChapter: this.toChapterDetail(currentChapter),
      revision,
    };
  }

  async writeChapterDraftFromAI(
    projectId: string,
    chapterId: string,
    input: WriteChapterDraftFromAIInput,
  ): Promise<WriteChapterDraftFromAIResult> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    const sourceText = input.sourceText.trim();
    if (!sourceText) {
      throw new BadRequestException("AI_CHAPTER_DRAFT_REQUIRED");
    }

    const updatedAt = new Date().toISOString();
    const revision: ScriptRevisionItem = {
      id: randomUUID(),
      projectId,
      chapterId: chapter.id,
      source: "ai_tool",
      threadId: input.threadId,
      messageId: input.messageId,
      toolCallId: input.toolCallId,
      operation: input.operation,
      summary: input.summary,
      createdAt: updatedAt,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      title: input.title?.trim() || chapter.title,
      summary: input.summary.trim() || chapter.summary,
      sourceText,
      updatedAt,
      lastScriptRevision: revision,
    };
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      sourceText: nextChapter.sourceText,
      updatedAt,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
      revision,
    };
  }

  async resetProjectScript(projectId: string): Promise<ResetProjectScriptResponse> {
    const project = await this.getReadyProject(projectId);
    const now = new Date().toISOString();
    const chapter = this.createDefaultChapter(project.id, "", now);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: chapter.id,
      sourceText: "",
      chapters: [chapter],
      updatedAt: now,
    };

    await this.clearProjectChaptersDir(nextProject.id);
    await this.clearLegacyStoryDir(nextProject.id);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      chapter: this.toChapterDetail(chapter),
      chapters: [this.toChapterListItem(chapter)],
    };
  }

  async analyzeScriptImport(projectId: string, input: AnalyzeScriptImportInput): Promise<ScriptImportAnalysis> {
    const project = await this.getReadyProject(projectId);
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

    const parsedChapters = this.parseProvidedScriptChapters(sourceText);
    const contentType = this.inferScriptImportContentType(sourceText);
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
      return this.createScriptImportAnalysis({
        decision: "reject",
        contentType,
        reason: "这份内容太短或缺少连续剧情，暂时不像可导入的剧本。",
        chapters: chapterPlans,
        risk: "直接导入会生成空章节或无效章节正文。",
      });
    }

    if (contentType === "outline" || contentType === "worldbuilding") {
      return this.createScriptImportAnalysis({
        decision: "reject",
        contentType,
        reason: contentType === "outline"
          ? "这份内容更像大纲或提纲，缺少可作为正文导入的连续剧情。"
          : "这份内容更像世界观、角色或素材设定，不适合作为章节正文直接导入。",
        chapters: chapterPlans,
        risk: "直接导入会把设定或提纲误写成章节正文。",
      });
    }

    if (hasNumericBoundaries && !this.areNumericBoundariesCredible(parsedChapters)) {
      return this.createScriptImportAnalysis({
        decision: "reject",
        contentType,
        reason: "识别到数字编号，但这些编号后面的正文不够像剧本章节，不能直接按 1、2、3 拆章。",
        chapters: chapterPlans,
        risk: "数字编号可能只是普通列表或提纲编号。",
      });
    }

    if (hasOnlySingleFallbackChapter) {
      return this.createScriptImportAnalysis({
        decision: "needs_user_confirmation",
        contentType,
        reason: "这份内容像故事或剧本，但没有识别到明确章节边界。",
        chapters: chapterPlans,
        risk: "继续导入会先写成单个章节；如果要自动拆成多章，需要后续再做剧情节拍拆分。",
      });
    }

    if (hasNonEmptyExistingChapters && !input.userConfirmedOverwrite) {
      return this.createScriptImportAnalysis({
        decision: "needs_user_confirmation",
        contentType,
        reason: "当前项目里已经有非空章节，导入会用新内容替换同序号章节草稿。",
        chapters: chapterPlans,
        risk: "继续导入可能覆盖已有章节草稿，请确认后再写入。",
      });
    }

    return this.createScriptImportAnalysis({
      decision: "ready_to_import",
      contentType,
      reason: `识别到 ${parsedChapters.length} 个可信章节边界，内容可以整理为章节草稿。`,
      chapters: chapterPlans,
      risk: null,
    });
  }

  async deleteProject(projectId: string): Promise<DeleteProjectResponse> {
    const project = await this.getReadyProject(projectId);

    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    await rm(projectDir, { recursive: true, force: true });
    const deletedTaskCount = this.tasksService.deleteByProjectId(project.id);
    this.projects.delete(project.id);

    return {
      deletedProjectId: project.id,
      deletedTaskCount,
    };
  }

  async getWorkbenchSnapshot(projectId: string, chapterId?: string): Promise<WorkbenchSnapshot> {
    const readyProject = await this.selectCurrentChapter(await this.getReadyProject(projectId), chapterId);
    const currentChapter = this.getCurrentChapter(readyProject);
    const sourceText = currentChapter?.sourceText ?? readyProject.sourceText;
    const hasStory = sourceText.trim().length > 0;
    const chapters = this.sortChapters(readyProject.chapters).map((chapter) => this.toChapterListItem(chapter));
    const currentChapterDetail = currentChapter ? this.toChapterDetail(currentChapter) : null;
    const workflow = this.buildProjectWorkflow(readyProject, currentChapter);

    return {
      project: {
        id: readyProject.id,
        name: readyProject.name,
        type: readyProject.type,
        status: hasStory ? "story_ready" : "draft",
        storyTitle: readyProject.storyTitle,
        genreTags: readyProject.genreTags,
        comicFormat: readyProject.comicFormat,
        artStyle: readyProject.artStyle,
        description: readyProject.description,
        updatedAt: readyProject.updatedAt,
      },
      chapters,
      currentChapter: currentChapterDetail,
      workflow,
      stages: workflow.steps,
      story: {
        id: currentChapter?.currentStoryVersionId ?? "chapter_script_draft",
        chapterId: currentChapter?.id ?? null,
        title: currentChapter?.title || readyProject.storyTitle,
        sourceText,
        summary: hasStory ? "故事已进入项目，下一步执行结构化剧情。" : "还没有故事原文。",
        beats: [],
      },
      shots: [],
      candidates: [],
      assets: [],
      aiNotes: [
        {
          role: "orchestrator",
          title: "当前阶段",
          body: hasStory ? "可以运行 story_parse，生成结构化剧情和剧情节拍。" : "先补充故事原文，再进入结构化任务。",
        },
        {
          role: "worker",
          title: "数据边界",
          body: "项目创建后会默认创建 chapter-001；章节内剧本、结构、分镜、候选图和排版应优先挂到 chapterId 下。",
        },
        {
          role: "reviewer",
          title: "验收关注",
          body: "项目入口必须可返回，工作台不能替代项目管理页。",
        },
      ],
    };
  }

  private async ensureProjectsLoaded(): Promise<void> {
    if (this.projectsLoaded) {
      return;
    }

    if (!this.projectsLoadPromise) {
      this.projectsLoadPromise = this.loadProjectsFromWorkspace().finally(() => {
        this.projectsLoadPromise = null;
      });
    }

    await this.projectsLoadPromise;
  }

  private async loadProjectsFromWorkspace(): Promise<void> {
    await this.workspacePathService.ensureReady();

    const projectsDir = this.workspacePathService.resolveVirtualPath("/workspace/projects");
    const entries = await this.readOptionalDirectory(projectsDir);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        const project = await this.readProjectFromWorkspace(entry.name);
        if (project) {
          this.projects.set(project.id, project);
        }
      } catch (error) {
        this.logger.warn(`Skip project workspace "${entry.name}": ${this.getErrorMessage(error)}`);
      }
    }

    this.projectsLoaded = true;
  }

  private async readProjectFromWorkspace(projectDirName: string): Promise<LocalProject | null> {
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectDirName}`);
    const metadataPath = path.join(projectDir, "project.json");
    const metadataText = await this.readOptionalTextFile(metadataPath);
    if (metadataText === null) {
      return null;
    }

    const metadata = this.parseJsonRecord(metadataText, metadataPath);
    const projectId = projectDirName;
    const createdAt = this.getStringField(metadata, "createdAt", new Date().toISOString());
    const updatedAt = this.getStringField(metadata, "updatedAt", createdAt);
    const chapters = await this.readChaptersFromWorkspace(projectDir, projectId);
    const metadataSourceText = this.getStringField(metadata, "sourceText", "");
    const fallbackSourceText = metadataSourceText;
    const readyChapters = chapters.length > 0
      ? chapters
      : [this.createDefaultChapter(projectId, fallbackSourceText, createdAt)];
    const requestedCurrentChapterId = this.getOptionalStringField(metadata, "currentChapterId");
    const currentChapter = readyChapters.find((chapter) => chapter.id === requestedCurrentChapterId) ?? readyChapters[0] ?? null;
    const sourceText = currentChapter?.sourceText ?? fallbackSourceText;
    const storyTitle = this.getStringField(metadata, "storyTitle", this.getStringField(metadata, "name", projectId));

    return {
      id: projectId,
      name: this.getStringField(metadata, "name", projectId),
      type: this.normalizeProjectType(metadata.type),
      currentChapterId: currentChapter?.id ?? null,
      storyTitle,
      genreTags: this.getStringArrayField(metadata, "genreTags"),
      comicFormat: this.normalizeComicFormat(metadata.comicFormat as ComicFormat | undefined),
      artStyle: this.normalizeArtStyle(metadata.artStyle as ArtStyle | undefined),
      description: this.getStringField(metadata, "description", storyTitle),
      sourceText,
      chapters: this.sortChapters(readyChapters),
      createdAt,
      updatedAt,
    };
  }

  private async readChaptersFromWorkspace(projectDir: string, projectId: string): Promise<LocalChapter[]> {
    const chaptersDir = path.join(projectDir, "chapters");
    const entries = await this.readOptionalDirectory(chaptersDir);
    const chapters: LocalChapter[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const chapter = await this.readChapterFromWorkspace(projectDir, projectId, entry.name, chapters.length + 1);
      if (chapter) {
        chapters.push(chapter);
      }
    }

    return this.sortChapters(chapters);
  }

  private async readChapterFromWorkspace(
    projectDir: string,
    projectId: string,
    slug: string,
    fallbackOrder: number,
  ): Promise<LocalChapter | null> {
    const chapterDir = path.join(projectDir, "chapters", slug);
    const metadataPath = path.join(chapterDir, "chapter.json");
    const metadataText = await this.readOptionalTextFile(metadataPath);
    const metadata = metadataText === null ? {} : this.parseJsonRecord(metadataText, metadataPath);
    const order = this.getNumberField(metadata, "order", this.getOrderFromChapterSlug(slug) ?? fallbackOrder);
    const suffix = String(order).padStart(3, "0");
    const chapterId = this.getStringField(metadata, "id", `chapter_${suffix}`);
    const sourceText = await this.readOptionalTextFile(path.join(chapterDir, "script.md"))
      ?? this.getStringField(metadata, "sourceText", "");
    const createdAt = this.getStringField(metadata, "createdAt", new Date().toISOString());
    const updatedAt = this.getStringField(metadata, "updatedAt", createdAt);
    const currentScriptVersionId = this.getOptionalStringField(metadata, "currentScriptVersionId");
    const lastScriptRevision = this.parseScriptRevision(metadata.lastScriptRevision)
      ?? await this.readLatestScriptRevision(path.join(chapterDir, "script.revisions", "latest.json"));
    const scriptVersions = await this.readChapterScriptVersions(
      projectId,
      chapterId,
      slug,
      path.join(chapterDir, "script.versions"),
      currentScriptVersionId,
      updatedAt,
    );
    const restoredCurrentScriptVersionId = currentScriptVersionId
      ?? scriptVersions.find((version) => version.status === "current")?.id
      ?? null;

    return {
      id: chapterId,
      projectId,
      slug,
      order,
      title: this.getStringField(metadata, "title", `第 ${order} 章`),
      status: this.normalizeChapterStatus(metadata.status),
      currentScriptVersionId: restoredCurrentScriptVersionId,
      currentStoryVersionId: this.getOptionalStringField(metadata, "currentStoryVersionId"),
      sourceText,
      summary: this.getStringField(metadata, "summary", ""),
      createdAt,
      updatedAt,
      completedAt: this.getOptionalStringField(metadata, "completedAt"),
      scriptVersions,
      lastScriptRevision,
    };
  }

  private async readChapterScriptVersions(
    projectId: string,
    chapterId: string,
    slug: string,
    versionsDir: string,
    currentScriptVersionId: string | null,
    fallbackCreatedAt: string,
  ): Promise<LocalChapterScriptVersion[]> {
    const entries = await this.readOptionalDirectory(versionsDir);
    const versionFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const match = entry.name.match(SCRIPT_VERSION_FILE_PATTERN);
        return match ? { fileName: entry.name, version: Number(match[1]) } : null;
      })
      .filter((item): item is { fileName: string; version: number } => item !== null)
      .sort((left, right) => left.version - right.version);
    const versions: LocalChapterScriptVersion[] = [];

    for (const item of versionFiles) {
      const id = `${chapterId}_script_v${String(item.version).padStart(3, "0")}`;
      versions.push({
        id,
        projectId,
        chapterId,
        version: item.version,
        sourcePath: `projects/${projectId}/chapters/${slug}/script.versions/${item.fileName}`,
        status: id === currentScriptVersionId ? "current" : "archived",
        createdAt: fallbackCreatedAt,
        sourceText: await readFile(path.join(versionsDir, item.fileName), "utf8"),
      });
    }

    if (versions.length > 0 && !versions.some((version) => version.status === "current")) {
      versions[versions.length - 1].status = "current";
    }

    return versions;
  }

  private async readLatestScriptRevision(filePath: string): Promise<ScriptRevisionItem | null> {
    const content = await this.readOptionalTextFile(filePath);
    if (content === null) {
      return null;
    }

    try {
      return this.parseScriptRevision(JSON.parse(content));
    } catch {
      return null;
    }
  }

  private async readOptionalDirectory(dirPath: string) {
    try {
      return await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }

      throw error;
    }
  }

  private normalizeGenreTags(input: string[] | undefined): string[] {
    const tags = input?.map((tag) => tag.trim()).filter(Boolean) ?? [];
    return [...new Set(tags)].slice(0, 12);
  }

  private normalizeProjectType(input: unknown): ProjectType {
    return typeof input === "string" && PROJECT_TYPES.includes(input as ProjectType) ? input as ProjectType : "comic";
  }

  private normalizeComicFormat(input: ComicFormat | undefined): ComicFormat {
    return input && COMIC_FORMATS.includes(input) ? input : "vertical_scroll";
  }

  private normalizeArtStyle(input: ArtStyle | undefined): ArtStyle {
    return input && ART_STYLES.includes(input) ? input : "dark_realistic";
  }

  private normalizeChapterStatus(input: unknown): ChapterStatus {
    return typeof input === "string" && CHAPTER_STATUSES.includes(input as ChapterStatus) ? input as ChapterStatus : "draft";
  }

  private parseProvidedScriptChapters(sourceText: string): ParsedScriptChapter[] {
    const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
    const chapterStarts: ChapterBoundaryMatch[] = [];

    lines.forEach((line, index) => {
      const boundary = this.extractChapterBoundary(line);
      if (boundary) {
        chapterStarts.push({ index, ...boundary });
      }
    });

    if (chapterStarts.length === 0) {
      return [{
        title: DEFAULT_CHAPTER_TITLE,
        sourceText: this.formatChapterSource(DEFAULT_CHAPTER_TITLE, sourceText),
        summary: this.summarizeScript(sourceText),
        boundary: "single_chapter",
      }];
    }

    return chapterStarts.map((start, index) => {
      const end = chapterStarts[index + 1]?.index ?? lines.length;
      const body = lines.slice(start.index + 1, end).join("\n").trim();
      return {
        title: start.title,
        sourceText: this.formatChapterSource(start.title, body),
        summary: this.summarizeScript(body || start.title),
        boundary: start.boundary,
      };
    });
  }

  private extractChapterBoundary(line: string): Omit<ChapterBoundaryMatch, "index"> | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const markdownMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    const candidate = markdownMatch ? markdownMatch[1]?.trim() ?? "" : trimmed;

    if (/^第\s*[\d一二三四五六七八九十百千万零〇两]+\s*[章节回话幕]/.test(candidate)) {
      return {
        title: candidate.replace(/[:：]\s*$/, ""),
        boundary: "explicit_chapter_heading",
      };
    }

    const numericMatch = candidate.match(/^(\d{1,3}|[一二三四五六七八九十百千万零〇两]{1,4})[.、．)]?$/);
    if (numericMatch) {
      return {
        title: `第 ${numericMatch[1]} 章`,
        boundary: "numeric_heading",
      };
    }

    return null;
  }

  private createScriptImportAnalysis(input: {
    decision: ScriptImportAnalysis["decision"];
    contentType: ScriptImportContentType;
    reason: string;
    chapters: ScriptImportChapterPlan[];
    risk: string | null;
  }): ScriptImportAnalysis {
    return {
      decision: input.decision,
      contentType: input.contentType,
      reason: input.reason,
      chapters: input.chapters,
      risk: input.risk,
      nextTool: input.decision === "ready_to_import" ? "import_script_to_chapters" : null,
    };
  }

  private inferScriptImportContentType(sourceText: string): ScriptImportContentType {
    const text = sourceText.trim();
    if (text.length < 80) {
      return "invalid";
    }

    const signals = this.getScriptTextSignals(text);
    if (
      signals.worldbuildingWordCount >= 2
      && signals.storySentenceCount < 3
      && signals.dialogueLineCount === 0
    ) {
      return "worldbuilding";
    }

    if (
      signals.outlineWordCount >= 2
      || (signals.bulletRatio > 0.45 && signals.averageLineLength < 80 && signals.storySentenceCount < 4)
    ) {
      return "outline";
    }

    if (signals.dialogueLineCount >= 2 || signals.sceneLineCount >= 1) {
      return "script";
    }

    if (signals.storySentenceCount >= 4 || (text.length >= 500 && signals.storySentenceCount >= 2)) {
      return "story_prose";
    }

    return "invalid";
  }

  private getScriptTextSignals(sourceText: string): ScriptTextSignals {
    const lines = sourceText
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const nonEmptyLineCount = lines.length;
    const totalLineLength = lines.reduce((sum, line) => sum + line.length, 0);
    const bulletLineCount = lines.filter((line) => /^([-*+]|\d+[.、．)]|[一二三四五六七八九十]+[.、．)])\s*\S+/.test(line)).length;
    const dialogueLineCount = lines.filter((line) => /^.{1,16}[：:]\s*\S+/.test(line) || /[“"].+[”"]/.test(line)).length;
    const sceneLineCount = lines.filter((line) => /^(场景|地点|时间|内景|外景|INT\.|EXT\.)/i.test(line)).length;
    const storySentenceCount = (sourceText.match(/[。！？!?]/g) ?? []).length
      + lines.filter((line) => /(走|看|说|问|发现|推开|冲|站|回头|听见|醒来|追|逃|笑|哭|沉默|望向|拿起|打开)/.test(line)).length;
    const outlineWordCount = (sourceText.match(/(大纲|提纲|梗概|章节梗概|待补|TODO|主题|卖点|目标用户)/g) ?? []).length;
    const worldbuildingWordCount = (sourceText.match(/(世界观|角色设定|人物设定|设定|能力|技能|阵营|规则|素材|画风|参考图|提示词)/g) ?? []).length;

    return {
      nonEmptyLineCount,
      averageLineLength: nonEmptyLineCount === 0 ? 0 : totalLineLength / nonEmptyLineCount,
      bulletRatio: nonEmptyLineCount === 0 ? 0 : bulletLineCount / nonEmptyLineCount,
      dialogueLineCount,
      sceneLineCount,
      storySentenceCount,
      outlineWordCount,
      worldbuildingWordCount,
    };
  }

  private areNumericBoundariesCredible(chapters: ParsedScriptChapter[]): boolean {
    const numericChapters = chapters.filter((chapter) => chapter.boundary === "numeric_heading");
    if (numericChapters.length === 0) {
      return true;
    }

    if (chapters.length < 2) {
      return false;
    }

    return chapters.every((chapter) => {
      const text = chapter.sourceText.replace(/^#{1,3}\s+.+\n?/, "").trim();
      const signals = this.getScriptTextSignals(text);
      return text.length >= 80 && (
        signals.dialogueLineCount > 0
        || signals.sceneLineCount > 0
        || signals.storySentenceCount >= 2
      );
    });
  }

  private formatChapterSource(title: string, rawText: string): string {
    const text = rawText.trim();
    if (!text) {
      return `# ${title}\n`;
    }

    if (/^#{1,3}\s+/m.test(text.split("\n")[0] ?? "")) {
      return `${text}\n`;
    }

    return `# ${title}\n\n${text}\n`;
  }

  private summarizeScript(sourceText: string): string {
    const firstLine = sourceText
      .split("\n")
      .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
      .find((line) => line.length > 0);
    return (firstLine ?? "").slice(0, 120);
  }

  private buildProjectWorkflow(project: LocalProject, currentChapter: LocalChapter | null): ProjectWorkflow {
    const currentStepKey = this.resolveWorkflowCurrentStepKey(currentChapter);
    return {
      schemaVersion: PROJECT_WORKFLOW_SCHEMA_VERSION,
      projectId: project.id,
      currentChapterId: currentChapter?.id ?? null,
      currentStepKey,
      steps: PROJECT_WORKFLOW_STEPS.map((step) => this.toWorkflowStep(project, currentChapter, step, currentStepKey)),
      updatedAt: project.updatedAt,
    };
  }

  private toWorkflowStep(
    project: LocalProject,
    currentChapter: LocalChapter | null,
    definition: (typeof PROJECT_WORKFLOW_STEPS)[number],
    currentStepKey: ProjectWorkflowStepKey,
  ): ProjectWorkflowStep {
    const status = this.resolveWorkflowStepStatus(definition.key, currentStepKey, currentChapter?.status ?? "draft");
    return {
      key: definition.key,
      label: definition.label,
      status,
      scope: definition.scope,
      summary: this.getWorkflowStepSummary(definition.key, status, currentChapter),
      evidence: this.getWorkflowStepEvidence(project.id, currentChapter, definition.key),
      completionCriteria: [...definition.completionCriteria],
    };
  }

  private resolveWorkflowCurrentStepKey(chapter: LocalChapter | null): ProjectWorkflowStepKey {
    switch (chapter?.status) {
      case "script_done":
        return "story_structure";
      case "structured":
        return "storyboard";
      case "storyboard_done":
        return "image_candidates";
      case "images_done":
        return "layout_export";
      case "layout_done":
      case "exported":
        return "asset_package";
      case "draft":
      default:
        return "project_story";
    }
  }

  private resolveWorkflowStepStatus(
    stepKey: ProjectWorkflowStepKey,
    currentStepKey: ProjectWorkflowStepKey,
    chapterStatus: ChapterStatus,
  ): ProjectWorkflowStep["status"] {
    if (chapterStatus === "exported") {
      return "done";
    }

    const stepIndex = workflowStepOrder.get(stepKey) ?? 0;
    const currentIndex = workflowStepOrder.get(currentStepKey) ?? 0;
    if (stepIndex < currentIndex) {
      return "done";
    }
    if (stepIndex === currentIndex) {
      return "active";
    }
    return "waiting";
  }

  private getWorkflowStepSummary(
    stepKey: ProjectWorkflowStepKey,
    status: ProjectWorkflowStep["status"],
    chapter: LocalChapter | null,
  ): string {
    if (status === "done") {
      return this.getWorkflowDoneSummary(stepKey);
    }
    if (status === "waiting") {
      return this.getWorkflowWaitingSummary(stepKey);
    }

    switch (stepKey) {
      case "project_story":
        return chapter?.sourceText.trim()
          ? "当前章节已有草稿，保存后可点击完成本章。"
          : "补充当前章节剧本，保存草稿后继续推进。";
      case "story_structure":
        return "当前章节剧本已完成，可以运行 story_parse 生成结构化剧情。";
      case "storyboard":
        return "当前章节剧情结构已就绪，可以生成和编辑分镜。";
      case "image_candidates":
        return "当前章节分镜已就绪，可以生成候选图并锁定结果。";
      case "layout_export":
        return "当前章节图片结果已就绪，可以排版并导出。";
      case "asset_package":
        return "当前章节或项目导出已就绪，可以归档素材包。";
    }
    return "继续推进当前工作流步骤。";
  }

  private getWorkflowDoneSummary(stepKey: ProjectWorkflowStepKey): string {
    switch (stepKey) {
      case "project_story":
        return "章节剧本已完成并写入版本快照。";
      case "story_structure":
        return "结构化剧情已完成。";
      case "storyboard":
        return "分镜已完成。";
      case "image_candidates":
        return "候选图或锁定图已完成。";
      case "layout_export":
        return "排版导出已完成。";
      case "asset_package":
        return "素材包已归档。";
    }
    return "该步骤已完成。";
  }

  private getWorkflowWaitingSummary(stepKey: ProjectWorkflowStepKey): string {
    switch (stepKey) {
      case "project_story":
        return "等待进入剧本阶段。";
      case "story_structure":
        return "需要先完成当前章节剧本。";
      case "storyboard":
        return "需要先完成当前章节剧情结构。";
      case "image_candidates":
        return "需要先完成当前章节分镜。";
      case "layout_export":
        return "需要先锁定当前章节候选图。";
      case "asset_package":
        return "需要先完成章节排版和导出。";
    }
    return "等待前置步骤完成。";
  }

  private getWorkflowStepEvidence(
    projectId: string,
    chapter: LocalChapter | null,
    stepKey: ProjectWorkflowStepKey,
  ): string {
    const chapterSlug = chapter?.slug ?? DEFAULT_CHAPTER_SLUG;
    switch (stepKey) {
      case "project_story":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/script.md`;
      case "story_structure":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/structure.json`;
      case "storyboard":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/storyboard.json`;
      case "image_candidates":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/candidates/`;
      case "layout_export":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/layout/`;
      case "asset_package":
        return `/workspace/projects/${projectId}/exports/packages/`;
    }
    return `/workspace/projects/${projectId}/workflow.json`;
  }

  private toProjectListItem(project: LocalProject): ProjectListItem {
    const currentChapter = this.getCurrentChapter(project);
    const sourceText = currentChapter?.sourceText ?? project.sourceText;

    return {
      id: project.id,
      name: project.name,
      type: project.type,
      status: sourceText.trim().length > 0 ? "story_ready" : "draft",
      currentChapterId: project.currentChapterId,
      chapterCount: project.chapters.length,
      storyTitle: project.storyTitle,
      genreTags: project.genreTags,
      comicFormat: project.comicFormat,
      artStyle: project.artStyle,
      description: project.description,
      sourceTextPreview: sourceText.slice(0, 96),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private async writeProjectFiles(project: LocalProject): Promise<void> {
    await this.workspacePathService.ensureReady();

    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    const currentChapter = this.getCurrentChapter(project) ?? this.createDefaultChapter(project.id, project.sourceText, project.createdAt);
    await mkdir(path.join(projectDir, "assets"), { recursive: true });
    await mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await mkdir(path.join(projectDir, "exports"), { recursive: true });

    const metadata = {
      id: project.id,
      name: project.name,
      type: project.type,
      status: "draft",
      currentChapterId: project.currentChapterId,
      storyTitle: project.storyTitle,
      genreTags: project.genreTags,
      comicFormat: project.comicFormat,
      artStyle: project.artStyle,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "workflow.json"), `${JSON.stringify(this.buildProjectWorkflow(project, currentChapter), null, 2)}\n`, "utf8");
    for (const chapter of this.sortChapters(project.chapters.length > 0 ? project.chapters : [currentChapter])) {
      await this.writeChapterFiles(projectDir, chapter);
    }
  }

  private async clearProjectChaptersDir(projectId: string): Promise<void> {
    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}`);
    await rm(path.join(projectDir, "chapters"), { recursive: true, force: true });
  }

  private async clearLegacyStoryDir(projectId: string): Promise<void> {
    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}`);
    await rm(path.join(projectDir, "story"), { recursive: true, force: true });
  }

  private async writeChapterFiles(projectDir: string, chapter: LocalChapter): Promise<void> {
    const chapterDir = path.join(projectDir, "chapters", chapter.slug);
    const versionsDir = path.join(chapterDir, "script.versions");
    const revisionsDir = path.join(chapterDir, "script.revisions");
    await mkdir(versionsDir, { recursive: true });
    await mkdir(path.join(chapterDir, "candidates"), { recursive: true });
    await mkdir(path.join(chapterDir, "layout"), { recursive: true });
    await mkdir(path.join(chapterDir, "exports"), { recursive: true });

    await writeFile(path.join(chapterDir, "chapter.json"), `${JSON.stringify(this.toChapterDetail(chapter), null, 2)}\n`, "utf8");
    await writeFile(path.join(chapterDir, "script.md"), chapter.sourceText, "utf8");
    if (chapter.lastScriptRevision) {
      await mkdir(revisionsDir, { recursive: true });
      await writeFile(path.join(revisionsDir, "latest.json"), `${JSON.stringify(chapter.lastScriptRevision, null, 2)}\n`, "utf8");
    } else {
      await rm(revisionsDir, { recursive: true, force: true });
    }
    for (const version of chapter.scriptVersions) {
      await writeFile(path.join(versionsDir, `script-v${String(version.version).padStart(3, "0")}.md`), version.sourceText, "utf8");
    }
  }

  private createDefaultChapter(projectId: string, sourceText: string, now: string): LocalChapter {
    return {
      id: DEFAULT_CHAPTER_ID,
      projectId,
      slug: DEFAULT_CHAPTER_SLUG,
      order: 1,
      title: DEFAULT_CHAPTER_TITLE,
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText,
      summary: "",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
    };
  }

  private updateCurrentChapterSource(project: LocalProject, sourceText: string, updatedAt: string): LocalChapter[] {
    const chapters = project.chapters.length > 0
      ? project.chapters
      : [this.createDefaultChapter(project.id, project.sourceText, project.createdAt)];
    const currentChapterId = project.currentChapterId ?? chapters[0]?.id ?? DEFAULT_CHAPTER_ID;
    let foundCurrentChapter = false;

    const nextChapters = chapters.map((chapter) => {
      if (chapter.id !== currentChapterId) {
        return chapter;
      }

      foundCurrentChapter = true;
      return {
        ...chapter,
        sourceText,
        updatedAt,
      };
    });

    return foundCurrentChapter
      ? nextChapters
      : [this.createDefaultChapter(project.id, sourceText, updatedAt), ...nextChapters];
  }

  private async ensureDefaultChapterReady(project: LocalProject): Promise<LocalProject> {
    const current = this.getCurrentChapter(project);
    const defaultChapter = current ?? this.createDefaultChapter(project.id, project.sourceText, project.createdAt);
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    const chapterScriptPath = path.join(projectDir, "chapters", defaultChapter.slug, "script.md");
    const chapterSourceText = await this.readOptionalTextFile(chapterScriptPath);
    const sourceText = chapterSourceText ?? defaultChapter.sourceText ?? project.sourceText;
    const updatedAt = sourceText === defaultChapter.sourceText ? defaultChapter.updatedAt : new Date().toISOString();
    const readyChapter: LocalChapter = {
      ...defaultChapter,
      sourceText,
      updatedAt,
      scriptVersions: defaultChapter.scriptVersions ?? [],
    };
    const chapters = project.chapters.some((chapter) => chapter.id === readyChapter.id)
      ? project.chapters.map((chapter) => (chapter.id === readyChapter.id ? readyChapter : chapter))
      : [readyChapter, ...project.chapters];
    const readyProject: LocalProject = {
      ...project,
      currentChapterId: project.currentChapterId ?? readyChapter.id,
      sourceText,
      chapters,
      updatedAt: sourceText === project.sourceText ? project.updatedAt : updatedAt,
    };

    await this.writeProjectFiles(readyProject);
    this.projects.set(readyProject.id, readyProject);
    return readyProject;
  }

  private async readOptionalTextFile(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private parseJsonRecord(content: string, filePath: string): Record<string, unknown> {
    const value = JSON.parse(content) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${filePath} must contain a JSON object`);
    }

    return value as Record<string, unknown>;
  }

  private getStringField(record: Record<string, unknown>, key: string, fallback: string): string {
    const value = record[key];
    return typeof value === "string" ? value : fallback;
  }

  private getOptionalStringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value : null;
  }

  private getStringArrayField(record: Record<string, unknown>, key: string): string[] {
    const value = record[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  private getNumberField(record: Record<string, unknown>, key: string, fallback: number): number {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private parseScriptRevision(value: unknown): ScriptRevisionItem | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const operation = record.operation;
    if (
      operation !== "import_script_to_chapters"
      && operation !== "update_chapter_draft"
      && operation !== "generate_script_from_seed"
    ) {
      return null;
    }

    const requiredStrings = ["id", "projectId", "threadId", "messageId", "toolCallId", "summary", "createdAt"];
    if (!requiredStrings.every((key) => typeof record[key] === "string")) {
      return null;
    }

    return {
      id: record.id as string,
      projectId: record.projectId as string,
      chapterId: typeof record.chapterId === "string" ? record.chapterId : null,
      source: "ai_tool",
      threadId: record.threadId as string,
      messageId: record.messageId as string,
      toolCallId: record.toolCallId as string,
      operation,
      summary: record.summary as string,
      createdAt: record.createdAt as string,
    };
  }

  private getOrderFromChapterSlug(slug: string): number | null {
    const match = slug.match(/^chapter-(\d+)$/);
    if (!match) {
      return null;
    }

    return Number(match[1]);
  }

  private isNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getCurrentChapter(project: LocalProject): LocalChapter | null {
    return project.chapters.find((chapter) => chapter.id === project.currentChapterId)
      ?? project.chapters[0]
      ?? null;
  }

  private async getReadyProject(projectId: string): Promise<LocalProject> {
    await this.ensureProjectsLoaded();
    const project = this.projects.get(projectId);
    if (!project) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }

    return this.ensureDefaultChapterReady(project);
  }

  private async selectCurrentChapter(project: LocalProject, chapterId: string | undefined): Promise<LocalProject> {
    if (!chapterId || project.currentChapterId === chapterId) {
      return project;
    }

    this.findChapter(project, chapterId);
    const currentChapter = project.chapters.find((chapter) => chapter.id === chapterId);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: chapterId,
      sourceText: currentChapter?.sourceText ?? project.sourceText,
      updatedAt: new Date().toISOString(),
    };

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return nextProject;
  }

  private findChapter(project: LocalProject, chapterId: string): LocalChapter {
    const chapter = project.chapters.find((item) => item.id === chapterId);
    if (!chapter) {
      throw new NotFoundException("CHAPTER_NOT_FOUND");
    }

    return chapter;
  }

  private withUpdatedChapter(project: LocalProject, chapter: LocalChapter): LocalProject {
    return {
      ...project,
      chapters: this.sortChapters(project.chapters.map((item) => (item.id === chapter.id ? chapter : item))),
    };
  }

  private createNextChapter(
    projectId: string,
    chapters: LocalChapter[],
    now: string,
    title: string | undefined,
  ): LocalChapter {
    const nextOrder = Math.max(0, ...chapters.map((chapter) => chapter.order)) + 1;
    const suffix = String(nextOrder).padStart(3, "0");
    return {
      id: `chapter_${suffix}`,
      projectId,
      slug: `chapter-${suffix}`,
      order: nextOrder,
      title: title?.trim() || `第 ${nextOrder} 章`,
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText: "",
      summary: "",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
    };
  }

  private createChapterScriptVersion(
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

  private sortChapters(chapters: LocalChapter[]): LocalChapter[] {
    return [...chapters].sort((left, right) => left.order - right.order);
  }

  private toChapterListItem(chapter: LocalChapter): ChapterListItem {
    return {
      id: chapter.id,
      projectId: chapter.projectId,
      slug: chapter.slug,
      order: chapter.order,
      title: chapter.title,
      status: chapter.status,
      currentScriptVersionId: chapter.currentScriptVersionId,
      currentStoryVersionId: chapter.currentStoryVersionId,
      summary: chapter.summary,
      sourceTextPreview: chapter.sourceText.slice(0, 96),
      lastScriptRevision: chapter.lastScriptRevision,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
      completedAt: chapter.completedAt,
    };
  }

  private toChapterDetail(chapter: LocalChapter): ChapterDetail {
    return {
      ...this.toChapterListItem(chapter),
      sourceText: chapter.sourceText,
      scriptPath: `projects/${chapter.projectId}/chapters/${chapter.slug}/script.md`,
    };
  }

  private toChapterScriptVersionItem(version: LocalChapterScriptVersion): ChapterScriptVersionItem {
    return {
      id: version.id,
      projectId: version.projectId,
      chapterId: version.chapterId,
      version: version.version,
      sourcePath: version.sourcePath,
      status: version.status,
      createdAt: version.createdAt,
    };
  }
}
