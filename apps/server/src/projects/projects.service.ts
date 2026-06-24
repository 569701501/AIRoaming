import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as wsJson from "./workspace-json.util.js";
import type { LocalChapter, LocalChapterScriptVersion, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as storyNormalize from "./story-normalize.util.js";
import * as wsCharacter from "./character-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import * as referencePromptUtil from "./reference-prompt.util.js";
import * as scriptImportUtil from "./script-import.util.js";
import type { AnalyzeScriptImportInput } from "./script-import.util.js";
import { ImageProviderService } from "./image-provider.service.js";
import { ProjectStore } from "./project-store.service.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import { CHARACTER_LEVEL_ORDER, DEFAULT_CHAPTER_ID, DEFAULT_CHAPTER_SLUG, DEFAULT_CHAPTER_TITLE, getDefaultChapterTitle } from "./project-domain.util.js";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  PROJECT_WORKFLOW_STEP_KEYS,
  extractChapterScriptName,
  extractChapterScriptTitle,
  extractScriptOutlineTitle,
  stripChapterScriptName,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterPendingSourceText,
  type ChapterScriptVersionItem,
  type ChapterImagePreflight,
  type ChapterStoryboard,
  type ChapterStoryStructure,
  type ChapterStatus,
  type ClearChapterScriptResponse,
  type ConfirmChapterPendingSourceResponse,
  type DiscardChapterPendingSourceResponse,
  type ArtStyle,
  type ComicFormat,
  type ConfirmCharacterPreviewRequest,
  type ConfirmCharacterPreviewResponse,
  type ConfirmChapterStoryboardRequest,
  type ConfirmChapterStoryStructureRequest,
  type ConfirmCharacterReferenceRequest,
  type ConfirmChapterImagePreflightRequest,
  type CompleteChapterRequest,
  type CompleteChapterResponse,
  type CreateGenerationTaskRequest,
  type CreateProjectRequest,
  type DeleteProjectResponse,
  type ExtractProjectCharactersRequest,
  type ExtractProjectCharactersResponse,
  type GenerateCharacterReferenceRequest,
  type GenerateCharacterReferenceResponse,
  type GenerationTaskItem,
  type GetChapterStoryStructureResponse,
  type GetChapterStoryboardResponse,
  type GetChapterImagePreflightResponse,
  type GetChapterResponse,
  type ImagePreflightCharacterCheck,
  type ImagePreflightIssue,
  type ImagePreflightJson,
  type ImagePreflightSceneCheck,
  type ImagePreflightStyleCheck,
  type ListChaptersResponse,
  type QueueCharacterReferenceResponse,
  type QueueSceneReferenceResponse,
  type GenerateSceneReferenceRequest,
  type ResolveImagePreflightCharacterRequest,
  type ResolveImagePreflightCharacterResponse,
  type ProjectCharacter,
  type ProjectCharacterEntityType,
  type ProjectCharacterLevel,
  type ProjectCharacterReferenceKind,
  type ProjectCharacterStatus,
  type ProjectCharactersResponse,
  type ProjectListItem,
  type ProjectScriptOutline,
  type ProjectType,
  type ProjectWorkflow,
  type ProjectWorkflowStep,
  type ProjectWorkflowStepKey,
  type ResetProjectScriptResponse,
  type SaveChapterDraftRequest,
  type SaveChapterDraftResponse,
  type SaveChapterImagePreflightResponse,
  type SaveChapterStoryStructureResponse,
  type SaveChapterStoryboardResponse,
  type SaveProjectCharacterResponse,
  type ScriptImportAnalysis,
  type ScriptImportChapterBoundary,
  type ScriptImportChapterPlan,
  type ScriptImportContentType,
  type ScriptRevisionItem,
  type StoryboardJson,
  type StoryboardShot,
  type StoryStructureCharacterCard,
  type StoryStructureJson,
  type UpdateChapterStoryboardRequest,
  type UpdateChapterStoryStructureRequest,
  type UpdateProjectCharacterRequest,
  type UpdateProjectDraftRequest,
  type WorkbenchAsset,
  type WorkbenchSnapshot,
  normalizeCameraAngle,
  normalizeCameraMovement,
  normalizeFrameType,
  normalizePanelRhythm,
  normalizeShotType,
  normalizeVoiceLines,
  parseDurationHintToMs,
} from "@airoaming/shared";
import { SettingsService } from "../settings/settings.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectRepository } from "./project-repository.service.js";

const SCRIPT_VERSION_FILE_PATTERN = /^script-v(\d+)\.md$/;
const imageCandidateTaskTypes = new Set(["shot_prompt_generate", "image_generate"]);

// LocalChapter / LocalProject / LocalChapterScriptVersion 已抽到 ./local-types.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre)。

interface ProjectAssetFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

interface CharacterReferenceSource extends ProjectAssetFile {
  asset: WorkbenchAsset;
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
  operation: "update_chapter_draft" | "generate_script_from_seed" | "generate_script_from_outline";
}

export interface WriteChapterDraftFromAIResult {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
  revision: ScriptRevisionItem;
}

export interface SaveScriptOutlineFromAIInput {
  sourceText: string;
  threadId: string;
  messageId: string;
  toolCallId: string;
}

type ProjectDeletedListener = (projectId: string) => number | void;

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);
  private characterReferenceQueue: Promise<void> = Promise.resolve();
  private readonly projectDeletedListeners = new Set<ProjectDeletedListener>();

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(CharacterReferenceService) private readonly characterRef: CharacterReferenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.tasksService.setCreateGuard((input) => this.guardGenerationTaskCreate(input));
    this.projectStore.setReferenceTaskChecker((pid, cid, kind) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, kind));
    await this.projectStore.ensureProjectsLoaded();
  }

  async listProjects(): Promise<ProjectListItem[]> {
    await this.projectStore.ensureProjectsLoaded();
    return this.repository.getAllProjects()
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((project) => this.toProjectListItem(project));
  }

  onProjectDeleted(listener: ProjectDeletedListener): () => void {
    this.projectDeletedListeners.add(listener);
    return () => {
      this.projectDeletedListeners.delete(listener);
    };
  }

  async createProject(input: CreateProjectRequest): Promise<ProjectListItem> {
    await this.projectStore.ensureProjectsLoaded();
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
      scriptOutline: null,
      characters: [],
      assets: [],
      chapters: [this.createDefaultChapter(projectId, sourceText, now)],
      createdAt: now,
      updatedAt: now,
    };

    await this.projectStore.writeProjectFiles(project);
    this.repository.setProject(project);
    return this.toProjectListItem(project);
  }

  async updateProjectDraft(projectId: string, input: UpdateProjectDraftRequest): Promise<ProjectListItem> {
    const project = await this.projectStore.getReadyProject(projectId);

    const nextName = input.name === undefined ? project.name : input.name.trim();
    if (!nextName) {
      throw new BadRequestException("PROJECT_NAME_REQUIRED");
    }

    const nextStoryTitle = input.storyTitle === undefined ? project.storyTitle : input.storyTitle.trim();
    const nextDescription = input.description === undefined ? project.description : input.description.trim();
    // 非空校验:显式传入空 sourceText 会用空内容覆盖当前章节正文(与 saveChapterDraft 一致)。
    if (input.sourceText !== undefined && !input.sourceText.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }
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

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return this.toProjectListItem(nextProject);
  }

  async listChapters(projectId: string): Promise<ListChaptersResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    return {
      chapters: this.sortChapters(project.chapters).map((chapter) => this.toChapterListItem(chapter)),
      currentChapterId: project.currentChapterId,
    };
  }

  async getChapter(projectId: string, chapterId: string): Promise<GetChapterResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      chapter: this.toChapterDetail(chapter),
    };
  }

  async listProjectCharacters(projectId: string) : Promise<ProjectCharactersResponse> {
    return this.characterRef.listProjectCharacters(projectId);
  }

  async ensureProjectCharacterPreviewTasks(projectId: string) : Promise<QueueCharacterReferenceResponse> {
    return this.characterRef.ensureProjectCharacterPreviewTasks(projectId);
  }

  async extractProjectCharacters(projectId: string,
    input: ExtractProjectCharactersRequest = {},) : Promise<ExtractProjectCharactersResponse> {
    return this.characterRef.extractProjectCharacters(projectId, input);
  }

  async updateProjectCharacter(projectId: string,
    characterId: string,
    input: UpdateProjectCharacterRequest,) : Promise<SaveProjectCharacterResponse> {
    return this.characterRef.updateProjectCharacter(projectId, characterId, input);
  }

  async generateCharacterReference(projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest & { sourceTaskId?: string } = {},) : Promise<GenerateCharacterReferenceResponse> {
    return this.characterRef.generateCharacterReference(projectId, characterId, input);
  }

  /**
   * 场景背景图:排队生成入口(对称 queueCharacterReference,但更简单——纯文生图)
   */
  async queueSceneReference(projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest = {},) : Promise<QueueSceneReferenceResponse> {
    return this.characterRef.queueSceneReference(projectId, chapterId, sceneId, input);
  }

  /** 场景背景图:真正出图(同步,由任务队列调用) */
  async generateSceneReference(projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest & { sourceTaskId?: string } = {},) : Promise<{ storyStructure: ChapterStoryStructure; asset: WorkbenchAsset }> {
    return this.characterRef.generateSceneReference(projectId, chapterId, sceneId, input);
  }

  /** 由场景字段拼成生图 prompt */
  async queueCharacterReference(projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest = {},) : Promise<QueueCharacterReferenceResponse> {
    return this.characterRef.queueCharacterReference(projectId, characterId, input);
  }

  async confirmCharacterPreview(projectId: string,
    characterId: string,
    input: ConfirmCharacterPreviewRequest,) : Promise<ConfirmCharacterPreviewResponse> {
    return this.characterRef.confirmCharacterPreview(projectId, characterId, input);
  }

  async confirmCharacterReference(projectId: string,
    characterId: string,
    input: ConfirmCharacterReferenceRequest,) : Promise<SaveProjectCharacterResponse> {
    return this.characterRef.confirmCharacterReference(projectId, characterId, input);
  }

  async deleteCharacterReference(projectId: string,
    characterId: string,
    assetId: string,) : Promise<SaveProjectCharacterResponse & { deletedAssetId: string }> {
    return this.characterRef.deleteCharacterReference(projectId, characterId, assetId);
  }

  async getProjectAssetFile(projectId: string, assetId: string) : Promise<ProjectAssetFile> {
    return this.characterRef.getProjectAssetFile(projectId, assetId);
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

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

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

    let chapters = this.sortChapters(project.chapters)
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

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      completedChapter: this.toChapterDetail(completedChapter),
      activeChapter: this.toChapterDetail(completedChapter),
      chapters: this.sortChapters(chapters).map((item) => this.toChapterListItem(item)),
      scriptVersion: this.toChapterScriptVersionItem(scriptVersion),
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
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
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
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
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
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  /**
   * 内部:写入/覆盖章节正文草稿缓冲(不碰正式 sourceText)。
   * 给 writeChapterDraftFromAI 和三期批量生成调用。
   */
  private async applyChapterPendingSource(
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
    const parsedStoryTitle = extractChapterScriptName(sourceText);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: currentChapter.id,
      storyTitle: parsedStoryTitle || project.storyTitle,
      sourceText: currentChapter.sourceText,
      chapters,
      updatedAt: now,
    };

    await this.clearProjectChaptersDir(nextProject.id);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapters: this.sortChapters(chapters).map((item) => this.toChapterListItem(item)),
      currentChapter: this.toChapterDetail(currentChapter),
      revision,
    };
  }

  /**
   * 确保指定 order 的章节存在(边生成边建章,见 ADR-0008 三期)。
   * 存在则返回原章节;不存在则按 order 建一个空章节并落盘。
   * 用于批量逐章生成时,每生成一章前确保目标章节已就位。
   */
  async ensureChapterExists(projectId: string, order: number, title?: string): Promise<ChapterDetail> {
    const project = await this.projectStore.getReadyProject(projectId);
    const existing = project.chapters.find((chapter) => chapter.order === order);
    if (existing) {
      return this.toChapterDetail(existing);
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

    return this.toChapterDetail(nextChapter);
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
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
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

  async getChapterStoryStructure(projectId: string, chapterId: string): Promise<GetChapterStoryStructureResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      storyStructure: chapter.storyStructure,
    };
  }

  async confirmChapterStoryStructure(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryStructureRequest,
  ): Promise<SaveChapterStoryStructureResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    this.assertChapterCanSaveStoryStructure(chapter);

    const now = new Date().toISOString();
    const previousVersion = chapter.storyStructure?.version ?? 0;
    const storyStructure = this.createChapterStoryStructure(project.id, chapter, input.structureJson, previousVersion + 1, now);
    const synced = this.syncStoryStructureCharacters(project, storyStructure.structureJson, now);
    const nextChapter: LocalChapter = {
      ...chapter,
      status: "structured",
      currentStoryVersionId: storyStructure.id,
      storyStructure: { ...storyStructure, structureJson: synced.structureJson },
      pendingStoryboard: null,
      imagePreflight: null,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...synced.project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      storyStructure,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async updateChapterStoryStructure(
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryStructureRequest,
  ): Promise<SaveChapterStoryStructureResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyStructure) {
      throw new BadRequestException("STORY_STRUCTURE_NOT_CONFIRMED");
    }

    const now = new Date().toISOString();
    const structureJson = this.normalizeStoryStructureJson(input.structureJson, chapter.id, chapter.title, {
      sourceScriptVersionId: chapter.storyStructure.sourceScriptVersionId,
      createdAt: chapter.storyStructure.structureJson.createdAt,
      updatedAt: now,
    });
    const storyStructure: ChapterStoryStructure = {
      ...chapter.storyStructure,
      sourceScriptVersionId: structureJson.sourceScriptVersionId,
      structureJson,
      updatedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      currentStoryVersionId: storyStructure.id,
      storyStructure,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
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
      storyStructure,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async getChapterStoryboard(projectId: string, chapterId: string): Promise<GetChapterStoryboardResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      storyboard: chapter.storyboard,
      pendingStoryboard: chapter.pendingStoryboard ?? null,
    };
  }

  async getChapterImagePreflight(projectId: string, chapterId: string): Promise<GetChapterImagePreflightResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      imagePreflight: chapter.imagePreflight,
    };
  }

  async confirmChapterImagePreflight(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterImagePreflightRequest = {},
  ): Promise<SaveChapterImagePreflightResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const now = new Date().toISOString();
    const preflightJson = imagePreflightUtil.buildImagePreflightJson(project, chapter, input.notes?.trim() ?? "", now, (pid, cid) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, "final_reference"));
    if (!preflightJson.ready) {
      throw new BadRequestException("IMAGE_PREFLIGHT_BLOCKED");
    }

    const version = (chapter.imagePreflight?.version ?? 0) + 1;
    const imagePreflight: ChapterImagePreflight = {
      id: `${chapter.id}_image_preflight_v${String(version).padStart(3, "0")}`,
      projectId,
      chapterId: chapter.id,
      version,
      status: "confirmed",
      preflightPath: `projects/${projectId}/chapters/${chapter.slug}/preflight.json`,
      sourceStoryboardId: chapter.storyboard.id,
      sourceStoryboardUpdatedAt: chapter.storyboard.updatedAt,
      preflightJson,
      createdAt: chapter.imagePreflight?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      imagePreflight,
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
      imagePreflight,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async resolveImagePreflightCharacter(
    projectId: string,
    chapterId: string,
    input: ResolveImagePreflightCharacterRequest,
  ): Promise<ResolveImagePreflightCharacterResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const token = input.token?.trim();
    if (!token) {
      throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_TOKEN_REQUIRED");
    }

    const storyboard = chapter.storyboard;
    const tokenExists = storyboard.storyboardJson.shots.some((shot) =>
      imagePreflightUtil.getShotCharacterTokens(shot.characterIds).some((item) => wsCharacter.normalizeCharacterNameKey(item) === wsCharacter.normalizeCharacterNameKey(token)),
    );
    if (!tokenExists) {
      throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_TOKEN_NOT_FOUND");
    }

    const now = new Date().toISOString();
    let nextCharacters = project.characters;
    let character: ProjectCharacter | null = null;
    let replacementCharacterId: string | null = null;

    switch (input.action) {
      case "add_to_library": {
        const result = imagePreflightUtil.resolveOrCreatePreflightCharacter(project, nextCharacters, token, input.level ?? "chapter", input, now);
        nextCharacters = result.characters;
        character = result.character;
        replacementCharacterId = result.character.id;
        break;
      }
      case "mark_temporary": {
        const result = imagePreflightUtil.resolveOrCreatePreflightCharacter(project, nextCharacters, token, "extra", {
          ...input,
          role: input.role || "临时/背景角色",
        }, now);
        nextCharacters = result.characters;
        character = result.character;
        replacementCharacterId = result.character.id;
        break;
      }
      case "merge_existing": {
        if (!input.targetCharacterId?.trim()) {
          throw new BadRequestException("TARGET_CHARACTER_ID_REQUIRED");
        }
        character = this.characterRef.findProjectCharacter({ ...project, characters: nextCharacters }, input.targetCharacterId);
        replacementCharacterId = character.id;
        break;
      }
      case "ignore": {
        replacementCharacterId = null;
        break;
      }
      default:
        throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_ACTION_INVALID");
    }

    const storyboardJson = this.normalizeStoryboardJson({
      ...storyboard.storyboardJson,
      shots: storyboard.storyboardJson.shots.map((shot) => ({
        ...shot,
        characterIds: imagePreflightUtil.resolveStoryboardCharacterIds(shot.characterIds, token, replacementCharacterId),
      })),
    }, chapter.id, chapter.title, {
      sourceStoryVersionId: storyboard.sourceStoryVersionId,
      createdAt: storyboard.storyboardJson.createdAt,
      updatedAt: now,
    });
    const nextStoryboard: ChapterStoryboard = {
      ...storyboard,
      storyboardJson,
      updatedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      storyboard: nextStoryboard,
      imagePreflight: null,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      characters: wsDomain.sortProjectCharacters(nextCharacters),
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      storyboard: nextStoryboard,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
      characters: wsDomain.sortProjectCharacters(nextProject.characters),
      assets: nextProject.assets,
      ready: this.characterRef.isProjectCharacterLibraryReady(nextProject),
      imagePreflight: null,
      character,
    };
  }

  async getPendingChapterStoryboard(projectId: string, chapterId: string): Promise<ChapterStoryboard | null> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return chapter.pendingStoryboard ?? null;
  }

  private async guardGenerationTaskCreate(input: CreateGenerationTaskRequest): Promise<CreateGenerationTaskRequest | void> {
    if (!imageCandidateTaskTypes.has(input.type)) {
      return;
    }

    const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
    if (!projectId) {
      throw new BadRequestException("GENERATION_TASK_PROJECT_ID_REQUIRED");
    }

    const project = await this.projectStore.getReadyProject(projectId);
    const chapterId = this.getGenerationTaskChapterId(input);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!imagePreflightUtil.isChapterImagePreflightReady(project, chapter, (pid, cid) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, "final_reference"))) {
      throw new BadRequestException("IMAGE_PREFLIGHT_NOT_CONFIRMED");
    }

    const storyboard = chapter.storyboard;
    const imagePreflight = chapter.imagePreflight;
    if (!storyboard || !imagePreflight) {
      throw new BadRequestException("IMAGE_PREFLIGHT_NOT_CONFIRMED");
    }

    this.assertGenerationTaskShotTarget(input, storyboard.storyboardJson.shots);

    return {
      ...input,
      projectId,
      input: {
        ...(input.input ?? {}),
        chapterId: chapter.id,
        imagePreflightId: imagePreflight.id,
        imagePreflightVersion: imagePreflight.version,
        imagePreflightPath: imagePreflight.preflightPath,
        imagePreflightConfirmedAt: imagePreflight.confirmedAt,
        sourceStoryboardId: imagePreflight.sourceStoryboardId,
        sourceStoryboardUpdatedAt: imagePreflight.sourceStoryboardUpdatedAt,
        preflightCharacterReferenceAssetIds: imagePreflight.preflightJson.characterChecks
          .map((check) => check.referenceAssetId)
          .filter((assetId): assetId is string => Boolean(assetId)),
      },
    };
  }

  private getGenerationTaskChapterId(input: CreateGenerationTaskRequest): string {
    const targetChapterId = typeof input.target?.chapterId === "string" ? input.target.chapterId.trim() : "";
    const inputChapterId = typeof input.input?.chapterId === "string" ? input.input.chapterId.trim() : "";
    const chapterId = targetChapterId || inputChapterId;
    if (!chapterId) {
      throw new BadRequestException("GENERATION_TASK_CHAPTER_ID_REQUIRED");
    }
    if (targetChapterId && inputChapterId && targetChapterId !== inputChapterId) {
      throw new BadRequestException("GENERATION_TASK_CHAPTER_ID_MISMATCH");
    }
    return chapterId;
  }

  private assertGenerationTaskShotTarget(input: CreateGenerationTaskRequest, shots: StoryboardShot[]): void {
    const targetShotId = input.target?.type === "shot" && typeof input.target.id === "string" ? input.target.id.trim() : "";
    const inputShotId = typeof input.input?.shotId === "string" ? input.input.shotId.trim() : "";
    const shotId = targetShotId || inputShotId;
    if (!shotId) {
      return;
    }
    if (targetShotId && inputShotId && targetShotId !== inputShotId) {
      throw new BadRequestException("GENERATION_TASK_SHOT_ID_MISMATCH");
    }
    if (!shots.some((shot) => shot.id === shotId)) {
      throw new BadRequestException("GENERATION_TASK_SHOT_NOT_IN_CONFIRMED_STORYBOARD");
    }
  }

  async savePendingChapterStoryboard(
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,
  ): Promise<SaveChapterStoryboardResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    this.assertChapterCanSaveStoryboard(chapter);

    const now = new Date().toISOString();
    const version = chapter.pendingStoryboard?.version ?? (chapter.storyboard?.version ?? 0) + 1;
    const storyboard = this.createPendingChapterStoryboard(project.id, chapter, input.storyboardJson, version, now);
    const nextChapter: LocalChapter = {
      ...chapter,
      pendingStoryboard: storyboard,
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
      storyboard,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async confirmChapterStoryboard(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryboardRequest,
  ): Promise<SaveChapterStoryboardResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    this.assertChapterCanSaveStoryboard(chapter);

    const now = new Date().toISOString();
    const previousVersion = chapter.storyboard?.version ?? 0;
    const storyboard = this.createChapterStoryboard(project.id, chapter, input.storyboardJson, previousVersion + 1, now);
    const nextChapter: LocalChapter = {
      ...chapter,
      status: "storyboard_done",
      storyboard,
      pendingStoryboard: null,
      imagePreflight: null,
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
      storyboard,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async updateChapterStoryboard(
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,
  ): Promise<SaveChapterStoryboardResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const now = new Date().toISOString();
    const storyboardJson = this.normalizeStoryboardJson(input.storyboardJson, chapter.id, chapter.title, {
      sourceStoryVersionId: chapter.storyboard.sourceStoryVersionId,
      createdAt: chapter.storyboard.storyboardJson.createdAt,
      updatedAt: now,
    });
    const storyboard: ChapterStoryboard = {
      ...chapter.storyboard,
      sourceStoryVersionId: storyboardJson.sourceStoryVersionId,
      storyboardJson,
      updatedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      storyboard,
      imagePreflight: null,
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
      storyboard,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async resetProjectScript(projectId: string): Promise<ResetProjectScriptResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
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
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      chapter: this.toChapterDetail(chapter),
      chapters: [this.toChapterListItem(chapter)],
    };
  }

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

  async deleteProject(projectId: string): Promise<DeleteProjectResponse> {
    const project = await this.projectStore.getReadyProject(projectId);

    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    await rm(projectDir, { recursive: true, force: true });
    const deletedTaskCount = this.tasksService.deleteByProjectId(project.id);
    this.repository.deleteProject(project.id);
    const deletedRuntimeStateCount = this.notifyProjectDeleted(project.id);

    return {
      deletedProjectId: project.id,
      deletedTaskCount,
      deletedRuntimeStateCount,
    };
  }

  private notifyProjectDeleted(projectId: string): number {
    let deletedStateCount = 0;
    for (const listener of this.projectDeletedListeners) {
      try {
        deletedStateCount += listener(projectId) ?? 0;
      } catch (error) {
        this.logger.warn(`Project delete listener failed for ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return deletedStateCount;
  }

  async getWorkbenchSnapshot(projectId: string, chapterId?: string): Promise<WorkbenchSnapshot> {
    const readyProject = await this.projectStore.selectCurrentChapter(await this.projectStore.getReadyProject(projectId), chapterId);
    const currentChapter = this.getCurrentChapter(readyProject);
    const sourceText = stripChapterScriptName(currentChapter?.sourceText ?? readyProject.sourceText);
    const hasStory = sourceText.trim().length > 0;
    const chapters = this.sortChapters(readyProject.chapters).map((chapter) => this.toChapterListItem(chapter));
    const currentChapterDetail = currentChapter ? this.toChapterDetail(currentChapter) : null;
    const workflow = this.buildProjectWorkflow(readyProject, currentChapter);

    return {
      project: {
        id: readyProject.id,
        name: readyProject.name,
        type: readyProject.type,
        status: this.characterRef.isProjectCharacterLibraryReady(readyProject) ? "characters_ready" : hasStory ? "story_ready" : "draft",
        storyTitle: readyProject.storyTitle,
        genreTags: readyProject.genreTags,
        comicFormat: readyProject.comicFormat,
        artStyle: readyProject.artStyle,
        description: readyProject.description,
        updatedAt: readyProject.updatedAt,
      },
      chapters,
      currentChapter: currentChapterDetail,
      scriptOutline: readyProject.scriptOutline,
      storyStructure: currentChapter?.storyStructure ?? null,
      storyboard: currentChapter?.storyboard ?? null,
      pendingStoryboard: currentChapter?.pendingStoryboard ?? null,
      imagePreflight: currentChapter?.imagePreflight ?? null,
      characters: readyProject.characters,
      workflow,
      stages: workflow.steps,
      story: {
        id: currentChapter?.currentStoryVersionId ?? "chapter_script_draft",
        chapterId: currentChapter?.id ?? null,
        title: currentChapter?.title || readyProject.storyTitle,
        sourceText,
        summary: currentChapter?.storyStructure?.structureJson.synopsis
          || (hasStory ? "故事已进入项目，下一步执行结构化剧情。" : "还没有故事原文。"),
        beats: (currentChapter?.storyStructure?.structureJson.beats ?? []).map((beat) => ({
          id: beat.id,
          order: beat.order,
          summary: beat.summary,
          sceneName: currentChapter?.storyStructure?.structureJson.scenes.find((scene) => scene.id === beat.sceneId)?.name ?? "",
          characterNames: beat.characters,
        })),
      },
      shots: this.toWorkbenchShots(currentChapter),
      candidates: [],
      assets: readyProject.assets,
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

  /** 加载链已抽到 ProjectRepository(见任务 2026-06-21_ProjectsService拆分 1b)。 */
  private normalizeGenreTags(input: string[] | undefined): string[] {
    const tags = input?.map((tag) => tag.trim()).filter(Boolean) ?? [];
    return [...new Set(tags)].slice(0, 12);
  }

  private normalizeProjectType(input: unknown): ProjectType {
    return wsDomain.normalizeProjectType(input);
  }

  private normalizeComicFormat(input: ComicFormat | undefined): ComicFormat {
    return wsDomain.normalizeComicFormat(input);
  }

  private normalizeArtStyle(input: ArtStyle | undefined): ArtStyle {
    return wsDomain.normalizeArtStyle(input);
  }

  private normalizeChapterStatus(input: unknown): ChapterStatus {
    return wsDomain.normalizeChapterStatus(input);
  }

  private buildProjectWorkflow(project: LocalProject, currentChapter: LocalChapter | null): ProjectWorkflow {
    return workflowUtil.buildProjectWorkflow(project, currentChapter, imagePreflightUtil.isChapterImagePreflightReady(project, currentChapter, (pid, cid) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, "final_reference")));
  }

  private syncStoryStructureCharacters(
    project: LocalProject,
    structureJson: StoryStructureJson,
    now: string,
  ): { project: LocalProject; structureJson: StoryStructureJson } {
    const existingByName = new Map(project.characters.map((character) => [
      wsCharacter.normalizeCharacterNameKey(character.name),
      character,
    ]));
    const nextCharacters = [...project.characters];
    // 结构角色卡浅拷贝,用于回填 projectCharacterId(见 ADR-0006)
    const nextCards = structureJson.characters.map((card) => ({ ...card }));
    let charactersChanged = false;

    structureJson.characters.forEach((card, index) => {
      const rawName = card.name.trim();
      if (!rawName) {
        return;
      }

      const name = wsCharacter.normalizeCharacterName(rawName);
      const key = wsCharacter.normalizeCharacterNameKey(name);
      const description = this.buildStoryStructureCharacterPrompt(card);
      const inferredLevel = this.resolveCardLevel(card, name, description, index);
      const existing = existingByName.get(key);

      if (existing) {
        // 回填项目角色 id,独立于角色库是否有变更:
        // 旧结构重新确认时角色库可能无变化,但结构卡的 projectCharacterId 仍需补全。
        nextCards[index].projectCharacterId = existing.id;

        const level = this.characterRef.resolveMoreImportantCharacterLevel(existing.level, inferredLevel);
        const primary = this.characterRef.resolvePrimaryReferenceForLevel(existing, level);
        const nextRole = existing.role || card.role.trim() || wsCharacter.getDefaultRoleForLevel(level);
        const nextStatus = this.characterRef.resolveCharacterStatusForReference(
          level,
          primary.primaryReferenceAssetId,
          existing.status === "in_use",
          primary.primaryReferenceKind,
        );
        const nextAppearance = existing.appearance || description;
        const nextPersonality = existing.personality || card.motivation.trim();
        const nextPromptFragment = existing.promptFragment || description;
        // entityType: AI 显式输出就用 AI 的(走 normalizeEntityType 校验),AI 没给(含旧数据 null)保留 existing。
        const nextEntityType = typeof card.entityType === "string"
          ? wsCharacter.normalizeEntityType(card.entityType)
          : existing.entityType;
        const hasChanges = existing.role !== nextRole
          || existing.level !== level
          || existing.status !== nextStatus
          || existing.appearance !== nextAppearance
          || existing.personality !== nextPersonality
          || existing.promptFragment !== nextPromptFragment
          || existing.entityType !== nextEntityType
          || existing.primaryReferenceAssetId !== primary.primaryReferenceAssetId
          || existing.primaryReferenceKind !== primary.primaryReferenceKind
          || existing.finalizedAt !== primary.finalizedAt;
        if (!hasChanges) {
          return;
        }
        const nextCharacter: ProjectCharacter = {
          ...existing,
          role: nextRole,
          level,
          status: nextStatus,
          appearance: nextAppearance,
          personality: nextPersonality,
          promptFragment: nextPromptFragment,
          entityType: nextEntityType,
          primaryReferenceAssetId: primary.primaryReferenceAssetId,
          primaryReferenceKind: primary.primaryReferenceKind,
          finalizedAt: primary.finalizedAt,
          updatedAt: now,
        };
        const characterIndex = nextCharacters.findIndex((item) => item.id === existing.id);
        if (characterIndex >= 0) {
          nextCharacters[characterIndex] = nextCharacter;
          existingByName.set(key, nextCharacter);
          charactersChanged = true;
        }
        return;
      }

      const character: ProjectCharacter = {
        id: `char_${randomUUID()}`,
        projectId: project.id,
        name,
        role: card.role.trim() || wsCharacter.getDefaultRoleForLevel(inferredLevel),
        level: inferredLevel,
        entityType: this.resolveCardEntityType(card),
        status: inferredLevel === "lead" || inferredLevel === "recurring" ? "needs_reference" : "draft",
        appearance: description,
        personality: card.motivation.trim(),
        promptFragment: description,
        referenceAssetIds: [],
        previewReferenceAssetId: null,
        previewConfirmedAt: null,
        primaryReferenceAssetId: null,
        primaryReferenceKind: wsCharacter.defaultReferenceKindForLevel(inferredLevel),
        visualVersion: 0,
        source: "story_structure",
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
      };
      nextCharacters.push(character);
      existingByName.set(key, character);
      nextCards[index].projectCharacterId = character.id;
      charactersChanged = true;
    });

    const nextProject = charactersChanged
      ? {
          ...project,
          characters: wsDomain.sortProjectCharacters(nextCharacters),
          updatedAt: now,
        }
      : project;

    return {
      project: nextProject,
      structureJson: { ...structureJson, characters: nextCards },
    };
  }

  private buildStoryStructureCharacterPrompt(card: StoryStructureJson["characters"][number]): string {
    const parts = [
      card.visualTraits.trim(),
      card.role.trim() ? `${card.name.trim()}，${card.role.trim()}` : "",
      card.relationship.trim(),
      card.motivation.trim(),
      card.notes.trim(),
    ].filter(Boolean);
    return parts.join("；") || `${card.name.trim()}，本章出镜角色。`;
  }

  private toProjectListItem(project: LocalProject): ProjectListItem {
    const currentChapter = this.getCurrentChapter(project);
    const sourceText = currentChapter?.sourceText ?? project.sourceText;

    const hasStory = sourceText.trim().length > 0;
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      status: this.characterRef.isProjectCharacterLibraryReady(project) ? "characters_ready" : hasStory ? "story_ready" : "draft",
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

  private async clearProjectChaptersDir(projectId: string): Promise<void> {
    await this.repository.clearProjectChaptersDir(projectId);
  }

  private async clearLegacyStoryDir(projectId: string): Promise<void> {
    await this.repository.clearLegacyStoryDir(projectId);
  }

  private createDefaultChapter(projectId: string, sourceText: string, now: string): LocalChapter {
    return wsDomain.createDefaultChapter(projectId, sourceText, now);
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

  private async readOptionalTextFile(filePath: string): Promise<string | null> {
    return wsJson.readOptionalTextFile(filePath);
  }

  private parseJsonRecord(content: string, filePath: string): Record<string, unknown> {
    return wsJson.parseJsonRecord(content, filePath);
  }

  private getStringField(record: Record<string, unknown>, key: string, fallback: string): string {
    return wsJson.getStringField(record, key, fallback);
  }

  private getOptionalStringField(record: Record<string, unknown>, key: string): string | null {
    return wsJson.getOptionalStringField(record, key);
  }

  private getStringArrayField(record: Record<string, unknown>, key: string): string[] {
    return wsJson.getStringArrayField(record, key);
  }

  private getNumberField(record: Record<string, unknown>, key: string, fallback: number): number {
    return wsJson.getNumberField(record, key, fallback);
  }

  private normalizeStoryStructureJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryStructureJson, "sourceScriptVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryStructureJson {
    return storyNormalize.normalizeStoryStructureJson(input, chapterId, fallbackChapterTitle, overrides);
  }

  // normalizeStoryStructureCharacters/Scenes/Beats 已抽到 ./story-normalize.util.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre-2)。

  private normalizeStoryboardJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryboardJson, "sourceStoryVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryboardJson {
    return storyNormalize.normalizeStoryboardJson(input, chapterId, fallbackChapterTitle, overrides);
  }

  // normalizeStoryboardShots/Shot 已抽到 ./story-normalize.util.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre-2)。

  private normalizeImagePreflightJson(input: unknown, chapterId: string, fallbackChapterTitle: string): ImagePreflightJson {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const now = new Date().toISOString();
    const sourceStoryboardId = this.getOptionalStringField(record, "sourceStoryboardId");
    const sourceStoryboardUpdatedAt = this.getOptionalStringField(record, "sourceStoryboardUpdatedAt");
    const issues = this.normalizeImagePreflightIssues(record.issues);
    const unresolvedCharacters = this.getStringArrayField(record, "unresolvedCharacters").map((item) => item.trim()).filter(Boolean);
    const characterChecks = this.normalizeImagePreflightCharacterChecks(record.characterChecks);
    const sceneChecks = this.normalizeImagePreflightSceneChecks(record.sceneChecks);
    const styleCheck = this.normalizeImagePreflightStyleCheck(record.styleCheck);

    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: this.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
      sourceStoryboardId,
      sourceStoryboardUpdatedAt,
      shotCount: this.getNumberField(record, "shotCount", 0),
      unresolvedCharacters,
      characterChecks,
      sceneChecks,
      styleCheck,
      issues,
      ready: typeof record.ready === "boolean" ? record.ready : issues.length === 0,
      notes: this.getStringField(record, "notes", ""),
      createdAt: this.getStringField(record, "createdAt", now),
      updatedAt: this.getStringField(record, "updatedAt", now),
    };
  }

  private normalizeImagePreflightCharacterChecks(input: unknown): ImagePreflightCharacterCheck[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => {
        const status = this.normalizeImagePreflightStatus(this.getStringField(item, "status", "ok"));
        return {
          characterId: this.getStringField(item, "characterId", ""),
          name: this.getStringField(item, "name", "未命名角色"),
          level: wsCharacter.normalizeCharacterLevel(this.getStringField(item, "level", "extra")),
          appearanceCount: this.getNumberField(item, "appearanceCount", 0),
          requiredReference: Boolean(item.requiredReference),
          referenceReady: Boolean(item.referenceReady),
          referenceAssetId: this.getOptionalStringField(item, "referenceAssetId"),
          status,
          note: this.getStringField(item, "note", ""),
        };
      });
  }

  private normalizeImagePreflightSceneChecks(input: unknown): ImagePreflightSceneCheck[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => ({
        sceneId: this.getStringField(item, "sceneId", ""),
        name: this.getStringField(item, "name", "未命名场景"),
        shotCount: this.getNumberField(item, "shotCount", 0),
        status: this.normalizeImagePreflightStatus(this.getStringField(item, "status", "ok")),
        note: this.getStringField(item, "note", ""),
      }));
  }

  private normalizeImagePreflightStyleCheck(input: unknown): ImagePreflightStyleCheck {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const comicFormat = this.normalizeComicFormat(this.getStringField(record, "comicFormat", "vertical_scroll") as ComicFormat);
    const artStyle = this.normalizeArtStyle(this.getStringField(record, "artStyle", "comic_style") as ArtStyle);
    return {
      comicFormat,
      comicFormatLabel: this.getStringField(record, "comicFormatLabel", this.getComicFormatLabel(comicFormat)),
      artStyle,
      artStyleLabel: this.getStringField(record, "artStyleLabel", this.getArtStyleLabel(artStyle)),
      status: this.normalizeImagePreflightStatus(this.getStringField(record, "status", "ok")),
      note: this.getStringField(record, "note", ""),
    };
  }

  private normalizeImagePreflightIssues(input: unknown): ImagePreflightIssue[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => {
        const type = this.getStringField(item, "type", "unresolved_character");
        return {
          type: type === "missing_storyboard"
            || type === "missing_reference"
            || type === "running_reference_task"
            || type === "missing_scene"
            || type === "missing_style_context"
            ? type
            : "unresolved_character",
          status: this.normalizeImagePreflightStatus(this.getStringField(item, "status", "blocked")) === "warning" ? "warning" : "blocked",
          message: this.getStringField(item, "message", ""),
          relatedName: this.getOptionalStringField(item, "relatedName") ?? undefined,
          relatedCharacterId: this.getOptionalStringField(item, "relatedCharacterId") ?? undefined,
          relatedSceneId: this.getOptionalStringField(item, "relatedSceneId") ?? undefined,
          relatedShotId: this.getOptionalStringField(item, "relatedShotId") ?? undefined,
        };
      });
  }

  private normalizeImagePreflightStatus(value: string): ImagePreflightCharacterCheck["status"] {
    return value === "warning" || value === "blocked" ? value : "ok";
  }

  private normalizeProjectCharacter(
    item: Record<string, unknown>,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
    index: number,
  ): ProjectCharacter {
    const level = wsCharacter.normalizeCharacterLevel(this.getStringField(item, "level", index === 0 ? "lead" : "recurring"));
    const primaryReferenceAssetId = this.getOptionalStringField(item, "primaryReferenceAssetId");
    const status = wsCharacter.normalizeCharacterStatus(this.getStringField(item, "status", primaryReferenceAssetId ? "finalized" : "draft"));
    return {
      id: this.getStringField(item, "id", `char_${String(index + 1).padStart(3, "0")}`),
      projectId,
      name: wsCharacter.normalizeCharacterName(this.getStringField(item, "name", `角色 ${index + 1}`)),
      role: this.getStringField(item, "role", ""),
      level,
      entityType: wsCharacter.normalizeEntityType(item.entityType),
      status,
      appearance: this.getStringField(item, "appearance", ""),
      personality: this.getStringField(item, "personality", ""),
      promptFragment: this.getStringField(item, "promptFragment", ""),
      referenceAssetIds: this.getStringArrayField(item, "referenceAssetIds"),
      previewReferenceAssetId: this.getOptionalStringField(item, "previewReferenceAssetId"),
      previewConfirmedAt: this.getOptionalStringField(item, "previewConfirmedAt"),
      primaryReferenceAssetId,
      primaryReferenceKind: wsCharacter.normalizeCharacterReferenceKind(
        this.getStringField(item, "primaryReferenceKind", wsCharacter.defaultReferenceKindForLevel(level)),
      ),
      visualVersion: this.getNumberField(item, "visualVersion", primaryReferenceAssetId ? 1 : 0),
      source: item.source === "imported_script" || item.source === "manual" || item.source === "story_structure" || item.source === "image_preflight" ? item.source : "script_outline",
      createdAt: this.getStringField(item, "createdAt", fallbackCreatedAt),
      updatedAt: this.getStringField(item, "updatedAt", fallbackUpdatedAt),
      finalizedAt: this.getOptionalStringField(item, "finalizedAt"),
    };
  }

  /** 结构卡 entityType 优先用 AI 输出,AI 没给(含旧数据 null)默认 human。 */
  private resolveCardEntityType(card: StoryStructureJson["characters"][number]): ProjectCharacterEntityType {
    return wsCharacter.normalizeEntityType(card.entityType);
  }

  /**
   * 结构卡 level 优先用 AI 输出(card.level),AI 没给才回落 inferCharacterLevel(见 task 2026-06-21_角色分层双维度)。
   * 保留 inferCharacterLevel 作兜底:① 旧 structure.json 无 level;② AI 偶发漏填;③ 剧本导入链路继续用。
   */
  private resolveCardLevel(
    card: StoryStructureJson["characters"][number],
    name: string,
    description: string,
    index: number,
  ): ProjectCharacterLevel {
    if (card.level) {
      return wsCharacter.normalizeCharacterLevel(card.level);
    }
    return this.characterRef.inferCharacterLevel(name, card.role, description, index);
  }
  private getComicFormatLabel(format: ComicFormat): string {
    return wsDomain.getComicFormatLabel(format);
  }

  private getArtStyleLabel(style: ArtStyle): string {
    return wsDomain.getArtStyleLabel(style);
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
      && operation !== "generate_script_from_outline"
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
    return wsJson.isNotFoundError(error);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getCurrentChapter(project: LocalProject): LocalChapter | null {
    return wsDomain.getCurrentChapter(project);
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

  private assertChapterCanSaveStoryStructure(chapter: LocalChapter): void {
    if (!chapter.sourceText.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }

    if (chapter.status === "draft") {
      throw new BadRequestException("CHAPTER_SCRIPT_NOT_COMPLETED");
    }
  }

  private assertChapterCanSaveStoryboard(chapter: LocalChapter): void {
    if (!chapter.storyStructure || !chapter.currentStoryVersionId) {
      throw new BadRequestException("STORY_STRUCTURE_REQUIRED");
    }

    if (chapter.status === "draft" || chapter.status === "script_done") {
      throw new BadRequestException("STORY_STRUCTURE_NOT_COMPLETED");
    }
  }

  private createChapterStoryStructure(
    projectId: string,
    chapter: LocalChapter,
    input: StoryStructureJson,
    version: number,
    now: string,
  ): ChapterStoryStructure {
    const id = `${chapter.id}_story_v${String(version).padStart(3, "0")}`;
    const structureJson = this.normalizeStoryStructureJson(input, chapter.id, chapter.title, {
      sourceScriptVersionId: chapter.currentScriptVersionId,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    return {
      id,
      projectId,
      chapterId: chapter.id,
      version,
      status: "structured",
      structurePath: `projects/${projectId}/chapters/${chapter.slug}/structure.json`,
      sourceScriptVersionId: structureJson.sourceScriptVersionId,
      structureJson,
      createdAt: chapter.storyStructure?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: now,
    };
  }

  private createChapterStoryboard(
    projectId: string,
    chapter: LocalChapter,
    input: StoryboardJson,
    version: number,
    now: string,
  ): ChapterStoryboard {
    const id = `${chapter.id}_storyboard_v${String(version).padStart(3, "0")}`;
    const storyboardJson = this.normalizeStoryboardJson(input, chapter.id, chapter.title, {
      sourceStoryVersionId: chapter.currentStoryVersionId,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    return {
      id,
      projectId,
      chapterId: chapter.id,
      version,
      status: "storyboard_done",
      storyboardPath: `projects/${projectId}/chapters/${chapter.slug}/storyboard.json`,
      sourceStoryVersionId: storyboardJson.sourceStoryVersionId,
      storyboardJson,
      createdAt: chapter.storyboard?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: now,
    };
  }

  private createPendingChapterStoryboard(
    projectId: string,
    chapter: LocalChapter,
    input: StoryboardJson,
    version: number,
    now: string,
  ): ChapterStoryboard {
    const storyboardJson = this.normalizeStoryboardJson(input, chapter.id, chapter.title, {
      sourceStoryVersionId: chapter.currentStoryVersionId,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    return {
      id: chapter.pendingStoryboard?.id ?? `${chapter.id}_storyboard_pending_v${String(version).padStart(3, "0")}`,
      projectId,
      chapterId: chapter.id,
      version,
      status: "pending_confirmation",
      storyboardPath: `projects/${projectId}/chapters/${chapter.slug}/storyboard.pending.json`,
      sourceStoryVersionId: storyboardJson.sourceStoryVersionId,
      storyboardJson,
      createdAt: chapter.pendingStoryboard?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: null,
    };
  }

  private toWorkbenchShots(chapter: LocalChapter | null): WorkbenchSnapshot["shots"] {
    const storyboard = chapter?.storyboard?.storyboardJson;
    const structure = chapter?.storyStructure?.structureJson;
    if (!chapter || !storyboard) {
      return [];
    }

    return storyboard.shots.map((shot) => {
      const scene = structure?.scenes.find((item) => item.id === shot.sceneId) ?? null;
      const beat = structure?.beats.find((item) => item.id === shot.beatId) ?? null;
      return {
        ...shot,
        chapterId: chapter.id,
        sceneName: scene?.name ?? "",
        characterIds: shot.characterIds,
        characters: shot.characterIds.length > 0 ? shot.characterIds : beat?.characters ?? [],
      };
    });
  }

  private sortChapters(chapters: LocalChapter[]): LocalChapter[] {
    return wsDomain.sortChapters(chapters);
  }

  private toChapterListItem(chapter: LocalChapter): ChapterListItem {
    return wsDomain.toChapterListItem(chapter);
  }

  private toChapterDetail(chapter: LocalChapter): ChapterDetail {
    return wsDomain.toChapterDetail(chapter);
  }

  private toChapterScriptVersionItem(version: LocalChapterScriptVersion): ChapterScriptVersionItem {
    return wsDomain.toChapterScriptVersionItem(version);
  }
}
