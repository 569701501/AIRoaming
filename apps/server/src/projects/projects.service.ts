import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  ART_STYLES,
  CHAPTER_STATUSES,
  COMIC_FORMATS,
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
  type SaveChapterDraftRequest,
  type SaveChapterDraftResponse,
  type UpdateProjectDraftRequest,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import { TasksService } from "../tasks/tasks.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

const DEFAULT_CHAPTER_ID = "chapter_001";
const DEFAULT_CHAPTER_SLUG = "chapter-001";
const DEFAULT_CHAPTER_TITLE = "第 1 章";
const SCRIPT_VERSION_FILE_PATTERN = /^script-v(\d+)\.md$/;

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
      stages: [
        {
          key: "project_story",
          label: "剧本",
          status: "active",
          summary: hasStory ? "故事草稿已保存，可进入剧情分析" : "补充故事原文后进入剧情分析",
          evidence: `/workspace/projects/${readyProject.id}/chapters/${currentChapter?.slug ?? DEFAULT_CHAPTER_SLUG}/script.md`,
        },
        {
          key: "story_structure",
          label: "剧情结构",
          status: "waiting",
          summary: hasStory ? "等待 AI 分析剧情" : "需要先保存故事原文",
          evidence: "story_parse",
        },
        {
          key: "storyboard",
          label: "分镜工作台",
          status: "waiting",
          summary: "结构化剧情后生成分镜",
          evidence: "shot_generate",
        },
        {
          key: "image_candidates",
          label: "候选图工作台",
          status: "waiting",
          summary: "分镜确认后生成候选图",
          evidence: "image_generate",
        },
        {
          key: "layout_export",
          label: "排版导出",
          status: "waiting",
          summary: "锁定候选后进入排版导出",
          evidence: "layout_export",
        },
        {
          key: "asset_package",
          label: "素材包",
          status: "waiting",
          summary: "导出后归档素材和 manifest",
          evidence: "asset_package_export",
        },
      ],
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
    for (const chapter of this.sortChapters(project.chapters.length > 0 ? project.chapters : [currentChapter])) {
      await this.writeChapterFiles(projectDir, chapter);
    }
  }

  private async writeChapterFiles(projectDir: string, chapter: LocalChapter): Promise<void> {
    const chapterDir = path.join(projectDir, "chapters", chapter.slug);
    const versionsDir = path.join(chapterDir, "script.versions");
    await mkdir(versionsDir, { recursive: true });
    await mkdir(path.join(chapterDir, "candidates"), { recursive: true });
    await mkdir(path.join(chapterDir, "layout"), { recursive: true });
    await mkdir(path.join(chapterDir, "exports"), { recursive: true });

    await writeFile(path.join(chapterDir, "chapter.json"), `${JSON.stringify(this.toChapterDetail(chapter), null, 2)}\n`, "utf8");
    await writeFile(path.join(chapterDir, "script.md"), chapter.sourceText, "utf8");
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
