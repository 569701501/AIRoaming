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
import { ChapterScriptService } from "./chapter-script.service.js";
import { StoryboardService } from "./storyboard.service.js";
import { StoryStructureService } from "./story-structure.service.js";
import { ImagePreflightService } from "./image-preflight.service.js";
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
    @Inject(ChapterScriptService) private readonly chapterScript: ChapterScriptService,
    @Inject(StoryboardService) private readonly storyboard: StoryboardService,
    @Inject(StoryStructureService) private readonly storyStructure: StoryStructureService,
    @Inject(ImagePreflightService) private readonly imagePreflight: ImagePreflightService,
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

  async getChapter(projectId: string, chapterId: string) : Promise<GetChapterResponse> {
    return this.chapterScript.getChapter(projectId, chapterId);
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

  async saveChapterDraft(projectId: string,
    chapterId: string,
    input: SaveChapterDraftRequest,) : Promise<SaveChapterDraftResponse> {
    return this.chapterScript.saveChapterDraft(projectId, chapterId, input);
  }

  async completeChapter(projectId: string,
    chapterId: string,
    input: CompleteChapterRequest,) : Promise<CompleteChapterResponse> {
    return this.chapterScript.completeChapter(projectId, chapterId, input);
  }

  async clearChapterScript(projectId: string, chapterId: string) : Promise<ClearChapterScriptResponse> {
    return this.chapterScript.clearChapterScript(projectId, chapterId);
  }

  /**
   * 确认章节正文草稿:把 pendingSourceText 覆盖到正式 sourceText,清掉 pending。
   * 仿 confirmChapterStoryboard(见 ADR-0008)。
   */
  async confirmChapterPendingSource(projectId: string,
    chapterId: string,) : Promise<ConfirmChapterPendingSourceResponse> {
    return this.chapterScript.confirmChapterPendingSource(projectId, chapterId);
  }

  /**
   * 丢弃章节正文草稿:删除 pendingSourceText,正式 sourceText 不变。
   */
  async discardChapterPendingSource(projectId: string,
    chapterId: string,) : Promise<DiscardChapterPendingSourceResponse> {
    return this.chapterScript.discardChapterPendingSource(projectId, chapterId);
  }

  /**
   * 内部:写入/覆盖章节正文草稿缓冲(不碰正式 sourceText)。
   * 给 writeChapterDraftFromAI 和三期批量生成调用。
   */
  async importScriptToChapters(projectId: string,
    input: ImportScriptToChaptersInput,) : Promise<ImportScriptToChaptersResult> {
    return this.chapterScript.importScriptToChapters(projectId, input);
  }

  /**
   * 确保指定 order 的章节存在(边生成边建章,见 ADR-0008 三期)。
   * 存在则返回原章节;不存在则按 order 建一个空章节并落盘。
   * 用于批量逐章生成时,每生成一章前确保目标章节已就位。
   */
  async ensureChapterExists(projectId: string, order: number, title?: string) : Promise<ChapterDetail> {
    return this.chapterScript.ensureChapterExists(projectId, order, title);
  }

  async writeChapterDraftFromAI(projectId: string,
    chapterId: string,
    input: WriteChapterDraftFromAIInput,) : Promise<WriteChapterDraftFromAIResult> {
    return this.chapterScript.writeChapterDraftFromAI(projectId, chapterId, input);
  }

  async saveScriptOutlineFromAI(projectId: string, input: SaveScriptOutlineFromAIInput) : Promise<ProjectScriptOutline> {
    return this.chapterScript.saveScriptOutlineFromAI(projectId, input);
  }

  async confirmScriptOutline(projectId: string): Promise<ProjectScriptOutline> {
    return this.chapterScript.confirmScriptOutline(projectId);
  }

  async getChapterStoryStructure(projectId: string, chapterId: string) : Promise<GetChapterStoryStructureResponse> {
    return this.storyStructure.getChapterStoryStructure(projectId, chapterId);
  }

  async confirmChapterStoryStructure(projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryStructureRequest,) : Promise<SaveChapterStoryStructureResponse> {
    return this.storyStructure.confirmChapterStoryStructure(projectId, chapterId, input);
  }

  async updateChapterStoryStructure(projectId: string,
    chapterId: string,
    input: UpdateChapterStoryStructureRequest,) : Promise<SaveChapterStoryStructureResponse> {
    return this.storyStructure.updateChapterStoryStructure(projectId, chapterId, input);
  }

  async getChapterStoryboard(projectId: string, chapterId: string) : Promise<GetChapterStoryboardResponse> {
    return this.storyboard.getChapterStoryboard(projectId, chapterId);
  }

  async getChapterImagePreflight(projectId: string, chapterId: string) : Promise<GetChapterImagePreflightResponse> {
    return this.imagePreflight.getChapterImagePreflight(projectId, chapterId);
  }

  async confirmChapterImagePreflight(projectId: string,
    chapterId: string,
    input: ConfirmChapterImagePreflightRequest = {},) : Promise<SaveChapterImagePreflightResponse> {
    return this.imagePreflight.confirmChapterImagePreflight(projectId, chapterId, input);
  }

  async resolveImagePreflightCharacter(projectId: string,
    chapterId: string,
    input: ResolveImagePreflightCharacterRequest,) : Promise<ResolveImagePreflightCharacterResponse> {
    return this.imagePreflight.resolveImagePreflightCharacter(projectId, chapterId, input);
  }

  async getPendingChapterStoryboard(projectId: string, chapterId: string) : Promise<ChapterStoryboard | null> {
    return this.storyboard.getPendingChapterStoryboard(projectId, chapterId);
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

  async savePendingChapterStoryboard(projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,) : Promise<SaveChapterStoryboardResponse> {
    return this.storyboard.savePendingChapterStoryboard(projectId, chapterId, input);
  }

  async confirmChapterStoryboard(projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryboardRequest,) : Promise<SaveChapterStoryboardResponse> {
    return this.storyboard.confirmChapterStoryboard(projectId, chapterId, input);
  }

  async updateChapterStoryboard(projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,) : Promise<SaveChapterStoryboardResponse> {
    return this.storyboard.updateChapterStoryboard(projectId, chapterId, input);
  }

  async resetProjectScript(projectId: string) : Promise<ResetProjectScriptResponse> {
    return this.chapterScript.resetProjectScript(projectId);
  }

  async analyzeScriptImport(projectId: string, input: AnalyzeScriptImportInput) : Promise<ScriptImportAnalysis> {
    return this.chapterScript.analyzeScriptImport(projectId, input);
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

  // normalizeStoryStructureCharacters/Scenes/Beats 已抽到 ./story-normalize.util.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre-2)。

  // normalizeStoryboardShots/Shot 已抽到 ./story-normalize.util.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre-2)。

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
  /**
   * 结构卡 level 优先用 AI 输出(card.level),AI 没给才回落 inferCharacterLevel(见 task 2026-06-21_角色分层双维度)。
   * 保留 inferCharacterLevel 作兜底:① 旧 structure.json 无 level;② AI 偶发漏填;③ 剧本导入链路继续用。
   */
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
