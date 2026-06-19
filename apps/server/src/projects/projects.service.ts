import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  ART_STYLES,
  CHAPTER_STATUSES,
  COMIC_FORMATS,
  PROJECT_WORKFLOW_SCHEMA_VERSION,
  PROJECT_WORKFLOW_STEP_KEYS,
  PROJECT_WORKFLOW_STEPS,
  PROJECT_TYPES,
  extractChapterScriptName,
  extractChapterScriptTitle,
  extractScriptOutlineTitle,
  formatChapterScriptDocument,
  isChapterScriptDocument,
  stripChapterScriptName,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterScriptVersionItem,
  type ChapterImagePreflight,
  type ChapterStoryboard,
  type ChapterStoryStructure,
  type ChapterStatus,
  type ClearChapterScriptResponse,
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
  type StoryStructureJson,
  type UpdateChapterStoryboardRequest,
  type UpdateChapterStoryStructureRequest,
  type UpdateProjectCharacterRequest,
  type UpdateProjectDraftRequest,
  type WorkbenchAsset,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import { SettingsService } from "../settings/settings.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

const DEFAULT_CHAPTER_ID = "chapter_001";
const DEFAULT_CHAPTER_SLUG = "chapter-001";
const getDefaultChapterTitle = (order: number): string => `第 ${order} 章`;
const DEFAULT_CHAPTER_TITLE = getDefaultChapterTitle(1);
const SCRIPT_VERSION_FILE_PATTERN = /^script-v(\d+)\.md$/;
const workflowStepOrder = new Map<ProjectWorkflowStepKey, number>(
  PROJECT_WORKFLOW_STEP_KEYS.map((key, index) => [key, index]),
);
const characterLevels: ProjectCharacterLevel[] = ["lead", "recurring", "chapter", "extra"];
const characterStatuses: ProjectCharacterStatus[] = ["draft", "needs_reference", "finalized", "in_use"];
const characterReferenceKinds: ProjectCharacterReferenceKind[] = ["preview_front", "final_reference", "none"];
const imageCandidateTaskTypes = new Set(["shot_prompt_generate", "image_generate"]);

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
  storyStructure: ChapterStoryStructure | null;
  storyboard: ChapterStoryboard | null;
  pendingStoryboard?: ChapterStoryboard | null;
  imagePreflight: ChapterImagePreflight | null;
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
  scriptOutline: ProjectScriptOutline | null;
  characters: ProjectCharacter[];
  assets: WorkbenchAsset[];
  chapters: LocalChapter[];
  createdAt: string;
  updatedAt: string;
}

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

type ProjectDeletedListener = (projectId: string) => number | void;

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly projects = new Map<string, LocalProject>();
  private projectsLoaded = false;
  private projectsLoadPromise: Promise<void> | null = null;
  private characterReferenceQueue: Promise<void> = Promise.resolve();
  private readonly projectDeletedListeners = new Set<ProjectDeletedListener>();

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.tasksService.setCreateGuard((input) => this.guardGenerationTaskCreate(input));
    await this.ensureProjectsLoaded();
  }

  async listProjects(): Promise<ProjectListItem[]> {
    await this.ensureProjectsLoaded();
    return [...this.projects.values()]
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
      scriptOutline: null,
      characters: [],
      assets: [],
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

  async listProjectCharacters(projectId: string): Promise<ProjectCharactersResponse> {
    const project = await this.getReadyProject(projectId);
    return this.toProjectCharactersResponse(project);
  }

  async ensureProjectCharacterPreviewTasks(projectId: string): Promise<QueueCharacterReferenceResponse> {
    const project = await this.getReadyProject(projectId);
    const tasks = project.characters
      .map((character) => this.queueMissingCharacterReferenceTask(project, character, "preview_front"))
      .filter((task): task is NonNullable<typeof task> => Boolean(task));
    return {
      ...this.toProjectCharactersResponse(project),
      tasks,
      createdCount: tasks.length,
    };
  }

  async extractProjectCharacters(
    projectId: string,
    input: ExtractProjectCharactersRequest = {},
  ): Promise<ExtractProjectCharactersResponse> {
    const project = await this.getReadyProject(projectId);
    const now = new Date().toISOString();
    const extracted = this.extractCharactersFromProjectSource(project, input.source ?? "auto", now);
    const existingByName = new Map(project.characters.map((character) => [this.normalizeCharacterNameKey(character.name), character]));
    let createdCount = 0;
    let updatedCount = 0;
    const nextCharacters = [...project.characters];

    for (const candidate of extracted) {
      const key = this.normalizeCharacterNameKey(candidate.name);
      const existing = existingByName.get(key);
      if (!existing) {
        nextCharacters.push(candidate);
        existingByName.set(key, candidate);
        createdCount += 1;
        continue;
      }

      const nextCharacter: ProjectCharacter = {
        ...existing,
        role: existing.role || candidate.role,
        level: this.resolveMoreImportantCharacterLevel(existing.level, candidate.level),
        appearance: existing.appearance || candidate.appearance,
        personality: existing.personality || candidate.personality,
        promptFragment: existing.promptFragment || candidate.promptFragment,
        updatedAt: now,
      };
      const index = nextCharacters.findIndex((character) => character.id === existing.id);
      if (index >= 0) {
        nextCharacters[index] = nextCharacter;
        updatedCount += 1;
      }
    }

    const nextProject: LocalProject = {
      ...project,
      characters: this.sortProjectCharacters(nextCharacters),
      updatedAt: now,
    };
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      ...this.toProjectCharactersResponse(nextProject),
      createdCount,
      updatedCount,
    };
  }

  async updateProjectCharacter(
    projectId: string,
    characterId: string,
    input: UpdateProjectCharacterRequest,
  ): Promise<SaveProjectCharacterResponse> {
    const project = await this.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }

    const updatedAt = new Date().toISOString();
    const nextName = input.name === undefined ? character.name : this.normalizeCharacterName(input.name);
    const duplicatedName = project.characters.some((item) =>
      item.id !== character.id
      && this.normalizeCharacterNameKey(item.name) === this.normalizeCharacterNameKey(nextName),
    );
    if (duplicatedName) {
      throw new BadRequestException("PROJECT_CHARACTER_NAME_DUPLICATED");
    }

    const nextLevel = input.level === undefined ? character.level : this.normalizeCharacterLevel(input.level);
    const nextReference = this.resolvePrimaryReferenceForLevel(character, nextLevel);
    const nextCharacter: ProjectCharacter = {
      ...character,
      name: nextName,
      role: input.role === undefined ? character.role : input.role.trim(),
      level: nextLevel,
      status: this.resolveCharacterStatusForReference(
        nextLevel,
        nextReference.primaryReferenceAssetId,
        false,
        nextReference.primaryReferenceKind,
      ),
      appearance: input.appearance === undefined ? character.appearance : input.appearance.trim(),
      personality: input.personality === undefined ? character.personality : input.personality.trim(),
      promptFragment: input.promptFragment === undefined ? character.promptFragment : input.promptFragment.trim(),
      primaryReferenceAssetId: nextReference.primaryReferenceAssetId,
      primaryReferenceKind: nextReference.primaryReferenceKind,
      finalizedAt: nextReference.finalizedAt,
      updatedAt,
    };
    const nextProject = this.withUpdatedProjectCharacter(project, nextCharacter, updatedAt);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return {
      ...this.toProjectCharactersResponse(nextProject),
      character: nextCharacter,
    };
  }

  async generateCharacterReference(
    projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest & { sourceTaskId?: string } = {},
  ): Promise<GenerateCharacterReferenceResponse> {
    const project = await this.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }

    const referenceKind = this.normalizeRequestedReferenceKind(character, input.referenceKind);
    if (referenceKind === "none") {
      throw new BadRequestException("CHARACTER_REFERENCE_NOT_REQUIRED");
    }

    const settings = this.settingsService.getRuntimeImageProviderSettings();
    const apiKey = settings.apiKey?.trim();
    const baseUrl = settings.baseUrl?.trim() || process.env.OPENAI_IMAGE_BASE_URL?.trim() || "";
    if (!apiKey || !baseUrl) {
      throw new BadRequestException("IMAGE_PROVIDER_NOT_CONFIGURED");
    }

    const nextVisualVersion = Math.max(1, character.visualVersion + 1);
    const fileName = referenceKind === "final_reference" ? "final-reference.webp" : "preview.webp";
    const relativePath = `projects/${project.id}/assets/characters/${character.id}/visual-v${String(nextVisualVersion).padStart(3, "0")}/${fileName}`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
    const prompt = input.prompt?.trim() || this.buildCharacterReferencePrompt(project, character, referenceKind);
    const referenceSource = referenceKind === "final_reference"
      ? await this.getConfirmedPreviewReferenceSource(project, character)
      : null;
    // 豆包 size:用 WIDTHxHEIGHT 指定比例(豆包不支持 '2K 16:9' 写法,且要求 ≥3686400 像素)。
    // 三向图用 16:9 横图(正面/侧面/背面横排),角色预览图用 1:1 方图。
    const doubaoSize = referenceKind === "final_reference" ? "2560x1440" : "1920x1920";
    const generated = referenceSource
      ? (settings.type === "doubao"
        ? await this.requestDoubaoImageEdit({
            apiKey,
            baseUrl,
            model: settings.modelId || "doubao-seedream-4-5-251128",
            prompt,
            size: doubaoSize,
            referenceImage: referenceSource,
          })
        : await this.requestOpenAiImageEdit({
            apiKey,
            baseUrl,
            model: settings.modelId || "gpt-image-2",
            prompt,
            size: input.size?.trim() || "3072x1536",
            quality: input.quality ?? "high",
            outputFormat: input.outputFormat ?? "webp",
            referenceImage: referenceSource,
          }))
      : (settings.type === "doubao"
        ? await this.requestDoubaoImage({
            apiKey,
            baseUrl,
            model: settings.modelId || "doubao-seedream-4-5-251128",
            prompt,
            size: doubaoSize,
          })
        : await this.requestOpenAiImage({
            apiKey,
            baseUrl,
            model: settings.modelId || "gpt-image-2",
            prompt,
            size: input.size?.trim() || (referenceKind === "final_reference" ? "3072x1536" : "1536x2048"),
            quality: input.quality ?? "high",
            outputFormat: input.outputFormat ?? "webp",
          }));

    this.assertProjectStillActive(project.id);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated);

    const now = new Date().toISOString();
    const asset: WorkbenchAsset = {
      id: `asset_${randomUUID()}`,
      chapterId: null,
      type: "image",
      name: `${character.name} ${referenceKind === "final_reference" ? "角色定稿图" : "角色预览图"}`,
      path: relativePath,
      sourceTaskId: input.sourceTaskId ?? null,
      meta: JSON.stringify({
        characterId: character.id,
        referenceKind,
        provider: settings.type === "doubao" ? "doubao_image" : "openai_image",
        model: settings.modelId || (settings.type === "doubao" ? "doubao-seedream-4-5-251128" : "gpt-image-2"),
        promptDigest: this.digestPrompt(prompt),
        generationMode: referenceSource ? "image_edit" : "image_generation",
        sourceReferenceAssetId: referenceSource?.asset.id ?? null,
        createdAt: now,
      }),
    };
    const hasCompatiblePrimaryReference = this.isPrimaryReferenceCompatible(character.primaryReferenceAssetId, character.primaryReferenceKind);
    const nextCharacter: ProjectCharacter = {
      ...character,
      status: this.resolveCharacterStatusForReference(
        character.level,
        hasCompatiblePrimaryReference ? character.primaryReferenceAssetId : null,
        false,
        hasCompatiblePrimaryReference ? character.primaryReferenceKind : referenceKind,
      ),
      primaryReferenceAssetId: hasCompatiblePrimaryReference ? character.primaryReferenceAssetId : null,
      primaryReferenceKind: hasCompatiblePrimaryReference ? character.primaryReferenceKind : this.defaultReferenceKindForLevel(character.level),
      referenceAssetIds: [...new Set([...character.referenceAssetIds, asset.id])],
      visualVersion: nextVisualVersion,
      finalizedAt: hasCompatiblePrimaryReference ? character.finalizedAt : null,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter({
      ...project,
      assets: [...project.assets, asset],
    }, nextCharacter, now);
    this.assertProjectStillActive(project.id);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      ...this.toProjectCharactersResponse(nextProject),
      character: nextCharacter,
      asset,
    };
  }

  /**
   * 场景背景图:排队生成入口(对称 queueCharacterReference,但更简单——纯文生图)
   */
  async queueSceneReference(
    projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest = {},
  ): Promise<QueueSceneReferenceResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    const storyStructure = chapter.storyStructure;
    if (!storyStructure) {
      throw new BadRequestException("STORY_STRUCTURE_REQUIRED");
    }
    const scene = storyStructure.structureJson.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new BadRequestException("SCENE_NOT_FOUND");
    }

    const settings = this.settingsService.getRuntimeImageProviderSettings();
    if (!settings.apiKey) {
      throw new BadRequestException("IMAGE_PROVIDER_NOT_CONFIGURED");
    }

    // 已有同场景活跃任务则复用
    const existing = this.tasksService.list().find((task) =>
      task.projectId === project.id
      && task.type === "scene_reference_generate"
      && task.target?.type === "scene"
      && task.target.id === sceneId
      && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
    );

    let task: GenerationTaskItem | null = existing ?? null;
    if (!task) {
      task = await this.tasksService.createControlled({
        projectId: project.id,
        type: "scene_reference_generate",
        target: { type: "scene", id: sceneId, chapterId },
        input: {
          sceneId,
          chapterId,
          sceneName: scene.name,
          prompt: input.prompt ?? "",
          size: input.size ?? "",
        },
        options: {
          provider: settings.type === "doubao" ? "doubao_image" : "openai_image",
        },
      });
      this.enqueueSceneReferenceTaskRun(task.id, project.id, chapterId, sceneId, input);
    }

    return {
      storyStructure,
      assets: project.assets,
      tasks: task ? [task] : [],
      createdCount: task && !existing ? 1 : 0,
    };
  }

  /** 场景背景图:真正出图(同步,由任务队列调用) */
  async generateSceneReference(
    projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest & { sourceTaskId?: string } = {},
  ): Promise<{ storyStructure: ChapterStoryStructure; asset: WorkbenchAsset }> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    const storyStructure = chapter.storyStructure;
    if (!storyStructure) {
      throw new BadRequestException("STORY_STRUCTURE_REQUIRED");
    }
    const scene = storyStructure.structureJson.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new BadRequestException("SCENE_NOT_FOUND");
    }

    const settings = this.settingsService.getRuntimeImageProviderSettings();
    const apiKey = settings.apiKey;
    const baseUrl = settings.baseUrl ?? process.env.OPENAI_IMAGE_BASE_URL?.trim() ?? null;
    if (!apiKey || !baseUrl) {
      throw new BadRequestException("IMAGE_PROVIDER_NOT_CONFIGURED");
    }

    const prompt = input.prompt?.trim() || this.buildScenePrompt(scene);
    const size = "2560x1440";
    const model = settings.modelId || (settings.type === "doubao" ? "doubao-seedream-4-5-251128" : "gpt-image-2");

    const generated = settings.type === "doubao"
      ? await this.requestDoubaoImage({ apiKey, baseUrl, model, prompt, size })
      : await this.requestOpenAiImage({ apiKey, baseUrl, model, prompt, size, quality: "high", outputFormat: "webp" });

    const relativePath = `projects/${project.id}/chapters/${chapter.slug}/scenes/${sceneId}/background.webp`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
    await this.workspacePathService.ensureReady();
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated);

    const now = new Date().toISOString();
    const asset: WorkbenchAsset = {
      id: `asset_${randomUUID()}`,
      chapterId: chapter.id,
      type: "image",
      name: `${scene.name}-背景`,
      path: relativePath,
      sourceTaskId: input.sourceTaskId ?? null,
      meta: JSON.stringify({
        sceneId,
        chapterId: chapter.id,
        referenceKind: "scene_background",
        provider: settings.type === "doubao" ? "doubao_image" : "openai_image",
        model,
        promptDigest: this.digestPrompt(prompt),
        generationMode: "image_generation",
        createdAt: now,
      }),
    };

    // 回写 scene.referenceAssetId
    const nextScenes = storyStructure.structureJson.scenes.map((item) =>
      item.id === sceneId ? { ...item, referenceAssetId: asset.id } : item,
    );
    const nextStoryStructure: ChapterStoryStructure = {
      ...storyStructure,
      structureJson: { ...storyStructure.structureJson, scenes: nextScenes },
      updatedAt: now,
    };
    const nextChapter: LocalChapter = { ...chapter, storyStructure: nextStoryStructure, updatedAt: now };
    const nextProject = this.withUpdatedChapter({
      ...project,
      assets: [...project.assets, asset],
    }, nextChapter);
    this.assertProjectStillActive(project.id);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return { storyStructure: nextStoryStructure, asset };
  }

  /** 由场景字段拼成生图 prompt */
  private buildScenePrompt(scene: { name: string; location: string; timeOfDay: string; atmosphere: string; purpose: string }): string {
    return [scene.name, scene.location, scene.timeOfDay, scene.atmosphere, `画面用途:${scene.purpose}`]
      .map((item) => item.trim())
      .filter(Boolean)
      .join("，");
  }

  private enqueueSceneReferenceTaskRun(
    taskId: string,
    projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest,
  ): void {
    const run = () => this.runSceneReferenceTask(taskId, projectId, chapterId, sceneId, input);
    this.characterReferenceQueue = this.characterReferenceQueue.then(run, run);
    void this.characterReferenceQueue.catch((error) => {
      this.logger.error(`Scene reference queue failed: ${this.getErrorMessage(error)}`);
    });
  }

  private async runSceneReferenceTask(
    taskId: string,
    projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest,
  ): Promise<void> {
    const current = this.tasksService.peek(taskId);
    if (!current || current.status === "cancelled") {
      return;
    }
    this.tasksService.start(taskId, "image_provider_running");
    try {
      const result = await this.generateSceneReference(projectId, chapterId, sceneId, {
        ...input,
        sourceTaskId: taskId,
      });
      this.tasksService.succeed(taskId, { sceneId, chapterId, assetId: result.asset.id });
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      this.tasksService.fail(taskId, "SCENE_REFERENCE_GENERATE_FAILED", this.getErrorMessage(error), true);
    }
  }

  async queueCharacterReference(
    projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest = {},
  ): Promise<QueueCharacterReferenceResponse> {
    let project = await this.getReadyProject(projectId);
    let character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const referenceKind = this.normalizeRequestedReferenceKind(character, input.referenceKind);
    if (referenceKind === "none") {
      throw new BadRequestException("CHARACTER_REFERENCE_NOT_REQUIRED");
    }
    if (referenceKind === "final_reference" && !character.previewReferenceAssetId) {
      const previewAsset = this.getCharacterReferenceAssets(project, character, "preview_front")[0] ?? null;
      if (!previewAsset) {
        throw new BadRequestException("CHARACTER_PREVIEW_REFERENCE_REQUIRED");
      }
      const now = new Date().toISOString();
      character = {
        ...character,
        previewReferenceAssetId: previewAsset.id,
        previewConfirmedAt: now,
        status: character.level === "lead" || character.level === "recurring" ? "needs_reference" : character.status,
        updatedAt: now,
      };
      project = this.withUpdatedProjectCharacter(project, character, now);
      await this.writeProjectFiles(project);
      this.projects.set(project.id, project);
    }
    const alreadyActive = this.hasActiveCharacterReferenceTask(project.id, character.id, referenceKind);
    const task = this.queueCharacterReferenceTask(project, character, referenceKind, input);
    return {
      ...this.toProjectCharactersResponse(project),
      tasks: [task],
      createdCount: alreadyActive ? 0 : 1,
    };
  }

  async confirmCharacterPreview(
    projectId: string,
    characterId: string,
    input: ConfirmCharacterPreviewRequest,
  ): Promise<ConfirmCharacterPreviewResponse> {
    const project = await this.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const asset = project.assets.find((item) => item.id === input.assetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_PREVIEW_ASSET_NOT_FOUND");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    if (this.getAssetReferenceKind(asset) !== "preview_front") {
      throw new BadRequestException("CHARACTER_PREVIEW_KIND_MISMATCH");
    }

    const now = new Date().toISOString();
    // ADR-0004 规则 9:点定稿 = 锁定角色图 + 自动生成三向图,对所有非 extra 层级生效
    const shouldFinalize = character.level !== "extra";
    const nextCharacter: ProjectCharacter = {
      ...character,
      previewReferenceAssetId: asset.id,
      previewConfirmedAt: now,
      status: shouldFinalize ? "needs_reference" : character.status,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter(project, nextCharacter, now);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    const task = shouldFinalize
      ? this.queueMissingCharacterReferenceTask(nextProject, nextCharacter, "final_reference")
      : null;
    return {
      ...this.toProjectCharactersResponse(nextProject),
      character: nextCharacter,
      tasks: task ? [task] : [],
    };
  }

  async confirmCharacterReference(
    projectId: string,
    characterId: string,
    input: ConfirmCharacterReferenceRequest,
  ): Promise<SaveProjectCharacterResponse> {
    const project = await this.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use" && character.primaryReferenceAssetId !== input.assetId) {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }

    const asset = project.assets.find((item) => item.id === input.assetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_REFERENCE_ASSET_NOT_FOUND");
    }
    if (asset.type !== "image") {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_TYPE_INVALID");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    const referenceKind = this.getAssetReferenceKind(asset) ?? character.primaryReferenceKind;
    if (!this.isPrimaryReferenceCompatible(asset.id, referenceKind)) {
      throw new BadRequestException("CHARACTER_REFERENCE_KIND_MISMATCH");
    }

    const now = new Date().toISOString();
    const nextCharacter: ProjectCharacter = {
      ...character,
      status: character.status === "in_use" ? "in_use" : "finalized",
      primaryReferenceAssetId: asset.id,
      primaryReferenceKind: referenceKind,
      updatedAt: now,
      finalizedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter(project, nextCharacter, now);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return {
      ...this.toProjectCharactersResponse(nextProject),
      character: nextCharacter,
    };
  }

  async deleteCharacterReference(
    projectId: string,
    characterId: string,
    assetId: string,
  ): Promise<SaveProjectCharacterResponse & { deletedAssetId: string }> {
    const project = await this.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use" && character.primaryReferenceAssetId === assetId) {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }

    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_REFERENCE_ASSET_NOT_FOUND");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }

    const now = new Date().toISOString();
    const nextPrimaryReferenceAssetId = character.primaryReferenceAssetId === asset.id
      ? null
      : character.primaryReferenceAssetId;
    const nextPrimaryReferenceKind = nextPrimaryReferenceAssetId
      ? character.primaryReferenceKind
      : this.defaultReferenceKindForLevel(character.level);
    const nextCharacter: ProjectCharacter = {
      ...character,
      referenceAssetIds: character.referenceAssetIds.filter((item) => item !== asset.id),
      previewReferenceAssetId: character.previewReferenceAssetId === asset.id ? null : character.previewReferenceAssetId,
      previewConfirmedAt: character.previewReferenceAssetId === asset.id ? null : character.previewConfirmedAt,
      primaryReferenceAssetId: nextPrimaryReferenceAssetId,
      primaryReferenceKind: nextPrimaryReferenceKind,
      finalizedAt: nextPrimaryReferenceAssetId ? character.finalizedAt : null,
      status: this.resolveCharacterStatusForReference(
        character.level,
        nextPrimaryReferenceAssetId,
        false,
        nextPrimaryReferenceKind,
      ),
      updatedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter({
      ...project,
      assets: project.assets.filter((item) => item.id !== asset.id),
    }, nextCharacter, now);
    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    await this.removeProjectAssetFile(project, asset);

    return {
      ...this.toProjectCharactersResponse(nextProject),
      character: nextCharacter,
      deletedAssetId: asset.id,
    };
  }

  async getProjectAssetFile(projectId: string, assetId: string): Promise<ProjectAssetFile> {
    const project = await this.getReadyProject(projectId);
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new NotFoundException("PROJECT_ASSET_NOT_FOUND");
    }

    return this.readProjectAssetFile(project, asset);
  }

  async saveChapterDraft(
    projectId: string,
    chapterId: string,
    input: SaveChapterDraftRequest,
  ): Promise<SaveChapterDraftResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
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
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      storyTitle: parsedStoryTitle || project.storyTitle,
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

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      completedChapter: this.toChapterDetail(completedChapter),
      activeChapter: this.toChapterDetail(completedChapter),
      chapters: this.sortChapters(chapters).map((item) => this.toChapterListItem(item)),
      scriptVersion: this.toChapterScriptVersionItem(scriptVersion),
      createdNextChapter,
    };
  }

  async clearChapterScript(projectId: string, chapterId: string): Promise<ClearChapterScriptResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
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
      imagePreflight: null,
      updatedAt,
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
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
        storyStructure: null,
        storyboard: null,
        pendingStoryboard: null,
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
    const rawSourceText = input.sourceText.trim();
    const sourceText = stripChapterScriptName(rawSourceText);
    if (!sourceText) {
      throw new BadRequestException("AI_CHAPTER_DRAFT_REQUIRED");
    }

    const updatedAt = new Date().toISOString();
    const parsedChapterTitle = extractChapterScriptTitle(sourceText);
    const parsedStoryTitle = extractChapterScriptName(rawSourceText);
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
      title: input.title?.trim() || parsedChapterTitle || chapter.title,
      summary: input.summary.trim() || chapter.summary,
      sourceText,
      updatedAt,
      lastScriptRevision: revision,
    };
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      storyTitle: parsedStoryTitle || project.storyTitle,
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

  async saveScriptOutlineFromAI(projectId: string, input: SaveScriptOutlineFromAIInput): Promise<ProjectScriptOutline> {
    const project = await this.getReadyProject(projectId);
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

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return outline;
  }

  async confirmScriptOutline(projectId: string): Promise<ProjectScriptOutline> {
    const project = await this.getReadyProject(projectId);
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

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return outline;
  }

  async getChapterStoryStructure(projectId: string, chapterId: string): Promise<GetChapterStoryStructureResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    return {
      storyStructure: chapter.storyStructure,
    };
  }

  async confirmChapterStoryStructure(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryStructureRequest,
  ): Promise<SaveChapterStoryStructureResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    this.assertChapterCanSaveStoryStructure(chapter);

    const now = new Date().toISOString();
    const previousVersion = chapter.storyStructure?.version ?? 0;
    const storyStructure = this.createChapterStoryStructure(project.id, chapter, input.structureJson, previousVersion + 1, now);
    const projectWithCharacters = this.syncStoryStructureCharacters(project, storyStructure.structureJson, now);
    const nextChapter: LocalChapter = {
      ...chapter,
      status: "structured",
      currentStoryVersionId: storyStructure.id,
      storyStructure,
      pendingStoryboard: null,
      imagePreflight: null,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedChapter({
      ...projectWithCharacters,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

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
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
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
      imagePreflight: null,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      storyStructure,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
    };
  }

  async getChapterStoryboard(projectId: string, chapterId: string): Promise<GetChapterStoryboardResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    return {
      storyboard: chapter.storyboard,
      pendingStoryboard: chapter.pendingStoryboard ?? null,
    };
  }

  async getChapterImagePreflight(projectId: string, chapterId: string): Promise<GetChapterImagePreflightResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    return {
      imagePreflight: chapter.imagePreflight,
    };
  }

  async confirmChapterImagePreflight(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterImagePreflightRequest = {},
  ): Promise<SaveChapterImagePreflightResponse> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const now = new Date().toISOString();
    const preflightJson = this.buildImagePreflightJson(project, chapter, input.notes?.trim() ?? "", now);
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
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

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
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const token = input.token?.trim();
    if (!token) {
      throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_TOKEN_REQUIRED");
    }

    const storyboard = chapter.storyboard;
    const tokenExists = storyboard.storyboardJson.shots.some((shot) =>
      this.getShotCharacterTokens(shot.characterIds).some((item) => this.normalizeCharacterNameKey(item) === this.normalizeCharacterNameKey(token)),
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
        const result = this.resolveOrCreatePreflightCharacter(project, nextCharacters, token, input.level ?? "chapter", input, now);
        nextCharacters = result.characters;
        character = result.character;
        replacementCharacterId = result.character.id;
        break;
      }
      case "mark_temporary": {
        const result = this.resolveOrCreatePreflightCharacter(project, nextCharacters, token, "extra", {
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
        character = this.findProjectCharacter({ ...project, characters: nextCharacters }, input.targetCharacterId);
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
        characterIds: this.resolveStoryboardCharacterIds(shot.characterIds, token, replacementCharacterId),
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
    const nextProject = this.withUpdatedChapter({
      ...project,
      characters: this.sortProjectCharacters(nextCharacters),
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      storyboard: nextStoryboard,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
      characters: this.sortProjectCharacters(nextProject.characters),
      assets: nextProject.assets,
      ready: this.isProjectCharacterLibraryReady(nextProject),
      imagePreflight: null,
      character,
    };
  }

  async getPendingChapterStoryboard(projectId: string, chapterId: string): Promise<ChapterStoryboard | null> {
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
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

    const project = await this.getReadyProject(projectId);
    const chapterId = this.getGenerationTaskChapterId(input);
    const chapter = this.findChapter(project, chapterId);
    if (!this.isChapterImagePreflightReady(project, chapter)) {
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
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
    this.assertChapterCanSaveStoryboard(chapter);

    const now = new Date().toISOString();
    const version = chapter.pendingStoryboard?.version ?? (chapter.storyboard?.version ?? 0) + 1;
    const storyboard = this.createPendingChapterStoryboard(project.id, chapter, input.storyboardJson, version, now);
    const nextChapter: LocalChapter = {
      ...chapter,
      pendingStoryboard: storyboard,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

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
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
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
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

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
    const project = await this.getReadyProject(projectId);
    const chapter = this.findChapter(project, chapterId);
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
    const nextProject = this.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);

    return {
      storyboard,
      chapter: this.toChapterDetail(nextChapter),
      chapters: this.sortChapters(nextProject.chapters).map((item) => this.toChapterListItem(item)),
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
    const readyProject = await this.selectCurrentChapter(await this.getReadyProject(projectId), chapterId);
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
        status: this.isProjectCharacterLibraryReady(readyProject) ? "characters_ready" : hasStory ? "story_ready" : "draft",
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
    const parsedStoryTitle = extractChapterScriptName(sourceText);
    const scriptOutline = await this.readProjectScriptOutline(projectDir, projectId, createdAt, updatedAt);
    const assets = await this.readProjectAssets(projectDir);
    const characters = await this.readProjectCharacters(projectDir, projectId, createdAt, updatedAt);
    const storyTitle = parsedStoryTitle ?? this.getStringField(metadata, "storyTitle", this.getStringField(metadata, "name", projectId));

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
      scriptOutline,
      characters,
      assets,
      chapters: this.sortChapters(readyChapters),
      createdAt,
      updatedAt,
    };
  }

  private async readProjectScriptOutline(
    projectDir: string,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
  ): Promise<ProjectScriptOutline | null> {
    const outlinePath = path.join(projectDir, "script-outline.md");
    const sourceText = await this.readOptionalTextFile(outlinePath);
    if (sourceText === null || !sourceText.trim()) {
      return null;
    }

    const metadataPath = path.join(projectDir, "script-outline.json");
    const metadataText = await this.readOptionalTextFile(metadataPath);
    const metadata = metadataText ? this.parseJsonRecord(metadataText, metadataPath) : {};
    const title = extractScriptOutlineTitle(sourceText)
      ?? this.getStringField(metadata, "title", "未命名剧本大纲");
    const status = metadata.status === "confirmed" ? "confirmed" : "draft";

    return {
      id: this.getStringField(metadata, "id", "script_outline_current"),
      projectId,
      status,
      title,
      sourceText,
      outlinePath: `projects/${projectId}/script-outline.md`,
      createdAt: this.getStringField(metadata, "createdAt", fallbackCreatedAt),
      updatedAt: this.getStringField(metadata, "updatedAt", fallbackUpdatedAt),
      confirmedAt: this.getOptionalStringField(metadata, "confirmedAt"),
    };
  }

  private async readProjectCharacters(
    projectDir: string,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
  ): Promise<ProjectCharacter[]> {
    const charactersPath = path.join(projectDir, "shared", "characters.json");
    const content = await this.readOptionalTextFile(charactersPath);
    if (content === null || !content.trim()) {
      return [];
    }

    const record = this.parseJsonRecord(content, charactersPath);
    const input = Array.isArray(record.characters) ? record.characters : [];
    return this.sortProjectCharacters(input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item, index) => this.normalizeProjectCharacter(item, projectId, fallbackCreatedAt, fallbackUpdatedAt, index)));
  }

  private async readProjectAssets(projectDir: string): Promise<WorkbenchAsset[]> {
    const assetsPath = path.join(projectDir, "shared", "assets.json");
    const content = await this.readOptionalTextFile(assetsPath);
    if (content === null || !content.trim()) {
      return [];
    }

    const record = this.parseJsonRecord(content, assetsPath);
    const input = Array.isArray(record.assets) ? record.assets : [];
    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item): WorkbenchAsset => {
        const type = item.type === "audio" || item.type === "video" || item.type === "document" || item.type === "archive"
          ? item.type
          : "image";
        return {
          id: this.getStringField(item, "id", `asset_${randomUUID()}`),
          chapterId: this.getOptionalStringField(item, "chapterId"),
          type,
          name: this.getStringField(item, "name", "未命名素材"),
          path: this.getStringField(item, "path", ""),
          sourceTaskId: this.getOptionalStringField(item, "sourceTaskId"),
          meta: this.getStringField(item, "meta", "{}"),
        };
      })
      .filter((asset) => asset.path.trim());
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
    const storyStructure = await this.readChapterStoryStructure(
      projectId,
      chapterId,
      slug,
      path.join(chapterDir, "structure.json"),
      updatedAt,
    );
    const restoredCurrentScriptVersionId = currentScriptVersionId
      ?? scriptVersions.find((version) => version.status === "current")?.id
      ?? null;
    const restoredCurrentStoryVersionId = this.getOptionalStringField(metadata, "currentStoryVersionId")
      ?? storyStructure?.id
      ?? null;

    return {
      id: chapterId,
      projectId,
      slug,
      order,
      title: extractChapterScriptTitle(sourceText) ?? this.getStringField(metadata, "title", `第 ${order} 章`),
      status: this.normalizeChapterStatus(metadata.status),
      currentScriptVersionId: restoredCurrentScriptVersionId,
      currentStoryVersionId: restoredCurrentStoryVersionId,
      sourceText,
      summary: this.getStringField(metadata, "summary", ""),
      storyStructure,
      storyboard: await this.readChapterStoryboard(
        projectId,
        chapterId,
        slug,
        path.join(chapterDir, "storyboard.json"),
        updatedAt,
      ),
      pendingStoryboard: await this.readPendingChapterStoryboard(
        projectId,
        chapterId,
        slug,
        path.join(chapterDir, "storyboard.pending.json"),
        updatedAt,
      ),
      imagePreflight: await this.readChapterImagePreflight(
        projectId,
        chapterId,
        slug,
        path.join(chapterDir, "preflight.json"),
        updatedAt,
      ),
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

  private async readChapterStoryStructure(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterStoryStructure | null> {
    const content = await this.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = this.parseJsonRecord(content, filePath);
    const structureJson = this.normalizeStoryStructureJson(record.structureJson ?? record, chapterId, this.getStringField(record, "chapterTitle", ""));
    const version = this.getNumberField(record, "version", 1);
    const createdAt = this.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = this.getStringField(record, "updatedAt", createdAt);

    return {
      id: this.getStringField(record, "id", `${chapterId}_story_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "structured",
      structurePath: `projects/${projectId}/chapters/${slug}/structure.json`,
      sourceScriptVersionId: this.getOptionalStringField(record, "sourceScriptVersionId") ?? structureJson.sourceScriptVersionId,
      structureJson,
      createdAt,
      updatedAt,
      confirmedAt: this.getOptionalStringField(record, "confirmedAt") ?? updatedAt,
    };
  }

  private async readChapterStoryboard(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterStoryboard | null> {
    const content = await this.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = this.parseJsonRecord(content, filePath);
    const storyboardJson = this.normalizeStoryboardJson(record.storyboardJson ?? record, chapterId, this.getStringField(record, "chapterTitle", ""));
    const version = this.getNumberField(record, "version", 1);
    const createdAt = this.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = this.getStringField(record, "updatedAt", createdAt);

    return {
      id: this.getStringField(record, "id", `${chapterId}_storyboard_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "storyboard_done",
      storyboardPath: `projects/${projectId}/chapters/${slug}/storyboard.json`,
      sourceStoryVersionId: this.getOptionalStringField(record, "sourceStoryVersionId") ?? storyboardJson.sourceStoryVersionId,
      storyboardJson,
      createdAt,
      updatedAt,
      confirmedAt: this.getOptionalStringField(record, "confirmedAt") ?? updatedAt,
    };
  }

  private async readPendingChapterStoryboard(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterStoryboard | null> {
    const content = await this.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = this.parseJsonRecord(content, filePath);
    const storyboardJson = this.normalizeStoryboardJson(record.storyboardJson ?? record, chapterId, this.getStringField(record, "chapterTitle", ""));
    const version = this.getNumberField(record, "version", 1);
    const createdAt = this.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = this.getStringField(record, "updatedAt", createdAt);

    return {
      id: this.getStringField(record, "id", `${chapterId}_storyboard_pending_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "pending_confirmation",
      storyboardPath: `projects/${projectId}/chapters/${slug}/storyboard.pending.json`,
      sourceStoryVersionId: this.getOptionalStringField(record, "sourceStoryVersionId") ?? storyboardJson.sourceStoryVersionId,
      storyboardJson,
      createdAt,
      updatedAt,
      confirmedAt: null,
    };
  }

  private async readChapterImagePreflight(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterImagePreflight | null> {
    const content = await this.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = this.parseJsonRecord(content, filePath);
    const preflightJson = this.normalizeImagePreflightJson(record.preflightJson ?? record, chapterId, this.getStringField(record, "chapterTitle", ""));
    const version = this.getNumberField(record, "version", 1);
    const createdAt = this.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = this.getStringField(record, "updatedAt", createdAt);
    const confirmedAt = this.getStringField(record, "confirmedAt", updatedAt);

    return {
      id: this.getStringField(record, "id", `${chapterId}_image_preflight_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "confirmed",
      preflightPath: `projects/${projectId}/chapters/${slug}/preflight.json`,
      sourceStoryboardId: this.getOptionalStringField(record, "sourceStoryboardId") ?? preflightJson.sourceStoryboardId,
      sourceStoryboardUpdatedAt: this.getOptionalStringField(record, "sourceStoryboardUpdatedAt") ?? preflightJson.sourceStoryboardUpdatedAt,
      preflightJson,
      createdAt,
      updatedAt,
      confirmedAt,
    };
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
      return formatChapterScriptDocument({ chapterTitle: title });
    }

    if (isChapterScriptDocument(text)) {
      return stripChapterScriptName(text);
    }

    return formatChapterScriptDocument({
      chapterTitle: title,
      sourceText: text,
    });
  }

  private summarizeScript(sourceText: string): string {
    const firstLine = sourceText
      .split("\n")
      .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
      .find((line) => line.length > 0);
    return (firstLine ?? "").slice(0, 120);
  }

  private buildProjectWorkflow(project: LocalProject, currentChapter: LocalChapter | null): ProjectWorkflow {
    const currentStepKey = this.resolveWorkflowCurrentStepKey(project, currentChapter);
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
    const status = this.resolveWorkflowStepStatus(
      definition.key,
      currentStepKey,
      currentChapter?.status ?? "draft",
    );
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

  private resolveWorkflowCurrentStepKey(project: LocalProject, chapter: LocalChapter | null): ProjectWorkflowStepKey {
    switch (chapter?.status) {
      case "script_done":
        return "story_structure";
      case "structured":
        return "storyboard";
      case "storyboard_done":
        return this.isChapterImagePreflightReady(project, chapter) ? "image_candidates" : "image_preflight";
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
    if (status === "blocked") {
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
      case "image_preflight":
        return "当前章节分镜已确认，检查角色参考图、镜头绑定和出图输入。";
      case "image_candidates":
        return "出图准备已通过，可以生成候选图并锁定结果。";
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
      case "image_preflight":
        return "出图准备已完成。";
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
      case "image_preflight":
        return "需要先确认当前章节分镜。";
      case "image_candidates":
        return "需要先通过出图准备。";
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
      case "image_preflight":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/preflight.json`;
      case "image_candidates":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/candidates/`;
      case "layout_export":
        return `/workspace/projects/${projectId}/chapters/${chapterSlug}/layout/`;
      case "asset_package":
        return `/workspace/projects/${projectId}/exports/packages/`;
    }
    return `/workspace/projects/${projectId}/workflow.json`;
  }

  private isChapterImagePreflightReady(project: LocalProject, chapter: LocalChapter | null): boolean {
    if (!chapter?.storyboard || !chapter.imagePreflight?.preflightJson.ready) {
      return false;
    }

    if (
      chapter.imagePreflight.sourceStoryboardId !== chapter.storyboard.id
      || chapter.imagePreflight.sourceStoryboardUpdatedAt !== chapter.storyboard.updatedAt
    ) {
      return false;
    }

    return this.buildImagePreflightJson(project, chapter, chapter.imagePreflight.preflightJson.notes, chapter.imagePreflight.updatedAt).ready;
  }

  private buildImagePreflightJson(
    project: LocalProject,
    chapter: LocalChapter,
    notes: string,
    now: string,
  ): ImagePreflightJson {
    const storyboard = chapter.storyboard;
    const issues: ImagePreflightIssue[] = [];
    const styleCheck = this.buildImagePreflightStyleCheck(project);
    if (styleCheck.status === "warning") {
      issues.push({
        type: "missing_style_context",
        status: "warning",
        message: styleCheck.note,
      });
    }

    if (!storyboard) {
      issues.push({
        type: "missing_storyboard",
        status: "blocked",
        message: "当前章节还没有正式 storyboard.json，请先确认分镜。",
      });
      return {
        schemaVersion: 1,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        sourceStoryboardId: null,
        sourceStoryboardUpdatedAt: null,
        shotCount: 0,
        unresolvedCharacters: [],
        characterChecks: [],
        sceneChecks: [],
        styleCheck,
        issues,
        ready: false,
        notes,
        createdAt: now,
        updatedAt: now,
      };
    }

    const shots = storyboard.storyboardJson.shots;
    const characterById = new Map(project.characters.map((character) => [character.id, character]));
    const characterByName = new Map(project.characters.map((character) => [character.name.trim().toLowerCase(), character]));
    const appearanceCounts = new Map<string, number>();
    const unresolvedCharacters = new Set<string>();
    const structureScenes = chapter.storyStructure?.structureJson.scenes ?? [];
    const sceneById = new Map(structureScenes.map((scene) => [scene.id, scene]));
    const sceneAppearanceCounts = new Map<string, number>();

    for (const shot of shots) {
      const seenInShot = new Set<string>();
      for (const token of this.getShotCharacterTokens(shot.characterIds)) {
        const character = characterById.get(token) ?? characterByName.get(token.toLowerCase());
        if (!character) {
          unresolvedCharacters.add(token);
          continue;
        }
        seenInShot.add(character.id);
      }

      for (const characterId of seenInShot) {
        appearanceCounts.set(characterId, (appearanceCounts.get(characterId) ?? 0) + 1);
      }

      const sceneId = shot.sceneId?.trim() ?? "";
      if (!sceneId) {
        issues.push({
          type: "missing_scene",
          status: "blocked",
          message: `镜头 ${shot.order} 还没有绑定场景，请先在分镜中补齐 sceneId。`,
          relatedShotId: shot.id,
        });
        continue;
      }

      if (!sceneById.has(sceneId)) {
        issues.push({
          type: "missing_scene",
          status: "blocked",
          message: `镜头 ${shot.order} 绑定的场景「${sceneId}」不在本章剧情结构场景卡中。`,
          relatedName: sceneId,
          relatedSceneId: sceneId,
          relatedShotId: shot.id,
        });
        continue;
      }

      sceneAppearanceCounts.set(sceneId, (sceneAppearanceCounts.get(sceneId) ?? 0) + 1);
    }

    for (const name of unresolvedCharacters) {
      issues.push({
        type: "unresolved_character",
        status: "blocked",
        message: `「${name}」还没有匹配到项目角色库角色，请先加入角色库、合并到已有角色或标记为临时/背景角色。`,
        relatedName: name,
      });
    }

    const characterChecks: ImagePreflightCharacterCheck[] = [];
    for (const [characterId, appearanceCount] of appearanceCounts) {
      const character = characterById.get(characterId);
      if (!character) {
        continue;
      }
      const requiredReference = this.isRequiredPreflightReferenceCharacter(character, appearanceCount);
      const referenceReady = this.isPrimaryReferenceCompatible(character.primaryReferenceAssetId, character.primaryReferenceKind);
      const runningReferenceTask = this.hasActiveCharacterReferenceTask(project.id, character.id, "final_reference");
      let status: ImagePreflightCharacterCheck["status"] = "ok";
      let note = "参考图满足当前出图要求。";
      if (runningReferenceTask) {
        status = "blocked";
        note = "角色定稿图任务正在生成，完成后再确认出图准备。";
        issues.push({
          type: "running_reference_task",
          status: "blocked",
          message: `「${character.name}」的角色定稿图任务仍在生成中。`,
          relatedName: character.name,
          relatedCharacterId: character.id,
        });
      } else if (requiredReference && !referenceReady) {
        status = "blocked";
        note = "该角色在本章需要定稿图。";
        issues.push({
          type: "missing_reference",
          status: "blocked",
          message: `「${character.name}」缺少可用角色定稿图。`,
          relatedName: character.name,
          relatedCharacterId: character.id,
        });
      } else if (!requiredReference && !referenceReady) {
        status = "warning";
        note = "当前按临时/轻量角色处理，可用文字描述进入候选图。";
      }

      characterChecks.push({
        characterId: character.id,
        name: character.name,
        level: character.level,
        appearanceCount,
        requiredReference,
        referenceReady,
        referenceAssetId: referenceReady ? character.primaryReferenceAssetId : null,
        status,
        note,
      });
    }

    characterChecks.sort((left, right) => right.appearanceCount - left.appearanceCount || left.name.localeCompare(right.name));
    const sceneChecks: ImagePreflightSceneCheck[] = [...sceneAppearanceCounts.entries()]
      .map(([sceneId, shotCount]) => {
        const scene = sceneById.get(sceneId);
        return {
          sceneId,
          name: scene?.name || sceneId,
          shotCount,
          status: "ok" as const,
          note: "场景已绑定到本章剧情结构场景卡，可供候选图提示词读取。",
        };
      })
      .sort((left, right) => right.shotCount - left.shotCount || left.name.localeCompare(right.name));

    const ready = issues.every((issue) => issue.status !== "blocked");
    return {
      schemaVersion: 1,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceStoryboardId: storyboard.id,
      sourceStoryboardUpdatedAt: storyboard.updatedAt,
      shotCount: shots.length,
      unresolvedCharacters: [...unresolvedCharacters.values()].sort(),
      characterChecks,
      sceneChecks,
      styleCheck,
      issues,
      ready,
      notes,
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildImagePreflightStyleCheck(project: Pick<LocalProject, "comicFormat" | "artStyle">): ImagePreflightStyleCheck {
    const comicFormatLabel = this.getComicFormatLabel(project.comicFormat);
    const artStyleLabel = this.getArtStyleLabel(project.artStyle);
    if (project.artStyle === "custom") {
      return {
        comicFormat: project.comicFormat,
        comicFormatLabel,
        artStyle: project.artStyle,
        artStyleLabel,
        status: "warning",
        note: "当前项目使用自定义画风，候选图可继续生成，但后续应补充更明确的画风参考或提示词片段。",
      };
    }

    return {
      comicFormat: project.comicFormat,
      comicFormatLabel,
      artStyle: project.artStyle,
      artStyleLabel,
      status: "ok",
      note: "漫画形式和美术风格已存在，可供候选图提示词读取。",
    };
  }

  private getShotCharacterTokens(characterIds: string[]): string[] {
    return [...new Set(characterIds
      .map((item) => item.trim())
      .filter((item) => item && !/^(无|无人|旁白|环境|背景)$/i.test(item)))];
  }

  private resolveStoryboardCharacterIds(characterIds: string[], token: string, replacementCharacterId: string | null): string[] {
    const tokenKey = this.normalizeCharacterNameKey(token);
    const next: string[] = [];
    for (const characterId of characterIds) {
      if (this.normalizeCharacterNameKey(characterId) === tokenKey) {
        if (replacementCharacterId && !next.includes(replacementCharacterId)) {
          next.push(replacementCharacterId);
        }
        continue;
      }
      if (!next.includes(characterId)) {
        next.push(characterId);
      }
    }
    return next;
  }

  private resolveOrCreatePreflightCharacter(
    project: Pick<LocalProject, "id">,
    characters: ProjectCharacter[],
    token: string,
    requestedLevel: ProjectCharacterLevel,
    input: Pick<ResolveImagePreflightCharacterRequest, "role" | "appearance" | "personality" | "promptFragment">,
    now: string,
  ): { character: ProjectCharacter; characters: ProjectCharacter[] } {
    const name = this.normalizeCharacterName(token);
    const existing = characters.find((character) => this.normalizeCharacterNameKey(character.name) === this.normalizeCharacterNameKey(name));
    if (existing) {
      return { character: existing, characters };
    }

    const level = this.normalizeCharacterLevel(requestedLevel);
    const description = input.appearance?.trim() || input.promptFragment?.trim() || `${name}，由出图准备待处理角色生成。`;
    const character: ProjectCharacter = {
      id: `char_${randomUUID()}`,
      projectId: project.id,
      name,
      role: input.role?.trim() || (level === "extra" ? "临时/背景角色" : "本章角色"),
      level,
      status: level === "lead" || level === "recurring" ? "needs_reference" : "draft",
      appearance: description,
      personality: input.personality?.trim() || "",
      promptFragment: input.promptFragment?.trim() || description,
      referenceAssetIds: [],
      previewReferenceAssetId: null,
      previewConfirmedAt: null,
      primaryReferenceAssetId: null,
      primaryReferenceKind: this.defaultReferenceKindForLevel(level),
      visualVersion: 0,
      source: "image_preflight",
      createdAt: now,
      updatedAt: now,
      finalizedAt: null,
    };
    return {
      character,
      characters: this.sortProjectCharacters([...characters, character]),
    };
  }

  private syncStoryStructureCharacters(
    project: LocalProject,
    structureJson: StoryStructureJson,
    now: string,
  ): LocalProject {
    const existingByName = new Map(project.characters.map((character) => [
      this.normalizeCharacterNameKey(character.name),
      character,
    ]));
    const nextCharacters = [...project.characters];
    let changed = false;

    structureJson.characters.forEach((card, index) => {
      const rawName = card.name.trim();
      if (!rawName) {
        return;
      }

      const name = this.normalizeCharacterName(rawName);
      const key = this.normalizeCharacterNameKey(name);
      const description = this.buildStoryStructureCharacterPrompt(card);
      const inferredLevel = this.inferCharacterLevel(name, card.role, description, index);
      const existing = existingByName.get(key);

      if (existing) {
        const level = this.resolveMoreImportantCharacterLevel(existing.level, inferredLevel);
        const primary = this.resolvePrimaryReferenceForLevel(existing, level);
        const nextRole = existing.role || card.role.trim() || this.getDefaultRoleForLevel(level);
        const nextStatus = this.resolveCharacterStatusForReference(
          level,
          primary.primaryReferenceAssetId,
          existing.status === "in_use",
          primary.primaryReferenceKind,
        );
        const nextAppearance = existing.appearance || description;
        const nextPersonality = existing.personality || card.motivation.trim();
        const nextPromptFragment = existing.promptFragment || description;
        const hasChanges = existing.role !== nextRole
          || existing.level !== level
          || existing.status !== nextStatus
          || existing.appearance !== nextAppearance
          || existing.personality !== nextPersonality
          || existing.promptFragment !== nextPromptFragment
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
          primaryReferenceAssetId: primary.primaryReferenceAssetId,
          primaryReferenceKind: primary.primaryReferenceKind,
          finalizedAt: primary.finalizedAt,
          updatedAt: now,
        };
        const characterIndex = nextCharacters.findIndex((item) => item.id === existing.id);
        if (characterIndex >= 0) {
          nextCharacters[characterIndex] = nextCharacter;
          existingByName.set(key, nextCharacter);
          changed = true;
        }
        return;
      }

      const character: ProjectCharacter = {
        id: `char_${randomUUID()}`,
        projectId: project.id,
        name,
        role: card.role.trim() || this.getDefaultRoleForLevel(inferredLevel),
        level: inferredLevel,
        status: inferredLevel === "lead" || inferredLevel === "recurring" ? "needs_reference" : "draft",
        appearance: description,
        personality: card.motivation.trim(),
        promptFragment: description,
        referenceAssetIds: [],
        previewReferenceAssetId: null,
        previewConfirmedAt: null,
        primaryReferenceAssetId: null,
        primaryReferenceKind: this.defaultReferenceKindForLevel(inferredLevel),
        visualVersion: 0,
        source: "story_structure",
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
      };
      nextCharacters.push(character);
      existingByName.set(key, character);
      changed = true;
    });

    if (!changed) {
      return project;
    }

    return {
      ...project,
      characters: this.sortProjectCharacters(nextCharacters),
      updatedAt: now,
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

  private getDefaultRoleForLevel(level: ProjectCharacterLevel): string {
    if (level === "lead") {
      return "主角";
    }
    if (level === "recurring") {
      return "常驻角色";
    }
    if (level === "extra") {
      return "临时/背景角色";
    }
    return "本章角色";
  }

  private isRequiredPreflightReferenceCharacter(character: ProjectCharacter, appearanceCount: number): boolean {
    return character.level === "lead"
      || character.level === "recurring"
      || (character.level === "chapter" && appearanceCount > 1);
  }

  private toProjectListItem(project: LocalProject): ProjectListItem {
    const currentChapter = this.getCurrentChapter(project);
    const sourceText = currentChapter?.sourceText ?? project.sourceText;

    const hasStory = sourceText.trim().length > 0;
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      status: this.isProjectCharacterLibraryReady(project) ? "characters_ready" : hasStory ? "story_ready" : "draft",
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
    await mkdir(path.join(projectDir, "shared"), { recursive: true });
    await mkdir(path.join(projectDir, "assets"), { recursive: true });
    await mkdir(path.join(projectDir, "assets", "characters"), { recursive: true });
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
    await writeFile(path.join(projectDir, "shared", "characters.json"), `${JSON.stringify({
      projectId: project.id,
      characters: this.sortProjectCharacters(project.characters),
      updatedAt: project.updatedAt,
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "shared", "assets.json"), `${JSON.stringify({
      projectId: project.id,
      assets: project.assets,
      updatedAt: project.updatedAt,
    }, null, 2)}\n`, "utf8");
    if (project.scriptOutline) {
      await writeFile(path.join(projectDir, "script-outline.md"), project.scriptOutline.sourceText, "utf8");
      await writeFile(path.join(projectDir, "script-outline.json"), `${JSON.stringify({
        id: project.scriptOutline.id,
        projectId: project.scriptOutline.projectId,
        status: project.scriptOutline.status,
        title: project.scriptOutline.title,
        outlinePath: project.scriptOutline.outlinePath,
        createdAt: project.scriptOutline.createdAt,
        updatedAt: project.scriptOutline.updatedAt,
        confirmedAt: project.scriptOutline.confirmedAt,
      }, null, 2)}\n`, "utf8");
    }
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
    await mkdir(chapterDir, { recursive: true });
    if (chapter.scriptVersions.length > 0) {
      await mkdir(versionsDir, { recursive: true });
    } else {
      await rm(versionsDir, { recursive: true, force: true });
    }
    await mkdir(path.join(chapterDir, "candidates"), { recursive: true });
    await mkdir(path.join(chapterDir, "layout"), { recursive: true });
    await mkdir(path.join(chapterDir, "exports"), { recursive: true });

    await writeFile(path.join(chapterDir, "chapter.json"), `${JSON.stringify(this.toChapterDetail(chapter), null, 2)}\n`, "utf8");
    await writeFile(path.join(chapterDir, "script.md"), chapter.sourceText, "utf8");
    if (chapter.storyStructure) {
      await writeFile(path.join(chapterDir, "structure.json"), `${JSON.stringify(chapter.storyStructure, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "structure.json"), { force: true });
    }
    if (chapter.storyboard) {
      await writeFile(path.join(chapterDir, "storyboard.json"), `${JSON.stringify(chapter.storyboard, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "storyboard.json"), { force: true });
    }
    if (chapter.pendingStoryboard) {
      await writeFile(path.join(chapterDir, "storyboard.pending.json"), `${JSON.stringify(chapter.pendingStoryboard, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "storyboard.pending.json"), { force: true });
    }
    if (chapter.imagePreflight) {
      await writeFile(path.join(chapterDir, "preflight.json"), `${JSON.stringify(chapter.imagePreflight, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "preflight.json"), { force: true });
    }
    if (chapter.lastScriptRevision) {
      await mkdir(revisionsDir, { recursive: true });
      await writeFile(path.join(revisionsDir, "latest.json"), `${JSON.stringify(chapter.lastScriptRevision, null, 2)}\n`, "utf8");
    } else {
      await rm(revisionsDir, { recursive: true, force: true });
    }
    if (chapter.scriptVersions.length > 0) {
      for (const version of chapter.scriptVersions) {
        await writeFile(path.join(versionsDir, `script-v${String(version.version).padStart(3, "0")}.md`), version.sourceText, "utf8");
      }
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
      storyStructure: null,
      storyboard: null,
      pendingStoryboard: null,
      imagePreflight: null,
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

  private normalizeStoryStructureJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryStructureJson, "sourceScriptVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryStructureJson {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const now = new Date().toISOString();
    const directionRecord = typeof record.direction === "object" && record.direction !== null && !Array.isArray(record.direction)
      ? record.direction as Record<string, unknown>
      : {};

    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: this.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
      sourceScriptVersionId: overrides.sourceScriptVersionId
        ?? (typeof record.sourceScriptVersionId === "string" && record.sourceScriptVersionId.trim() ? record.sourceScriptVersionId : null),
      synopsis: this.getStringField(record, "synopsis", ""),
      direction: {
        logline: this.getStringField(directionRecord, "logline", ""),
        chapterGoal: this.getStringField(directionRecord, "chapterGoal", ""),
        coreConflict: this.getStringField(directionRecord, "coreConflict", ""),
        emotionalArc: this.getStringField(directionRecord, "emotionalArc", ""),
        endingHook: this.getStringField(directionRecord, "endingHook", ""),
      },
      characters: this.normalizeStoryStructureCharacters(record.characters),
      scenes: this.normalizeStoryStructureScenes(record.scenes),
      beats: this.normalizeStoryStructureBeats(record.beats),
      notes: this.getStringField(record, "notes", ""),
      createdAt: overrides.createdAt ?? this.getStringField(record, "createdAt", now),
      updatedAt: overrides.updatedAt ?? this.getStringField(record, "updatedAt", now),
    };
  }

  private normalizeStoryStructureCharacters(input: unknown): StoryStructureJson["characters"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item, index) => ({
        id: this.getStringField(item, "id", `character_${String(index + 1).padStart(2, "0")}`),
        name: this.getStringField(item, "name", `角色 ${index + 1}`),
        role: this.getStringField(item, "role", ""),
        motivation: this.getStringField(item, "motivation", ""),
        relationship: this.getStringField(item, "relationship", ""),
        visualTraits: this.getStringField(item, "visualTraits", ""),
        notes: this.getStringField(item, "notes", ""),
      }));
  }

  private normalizeStoryStructureScenes(input: unknown): StoryStructureJson["scenes"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item, index) => ({
        id: this.getStringField(item, "id", `scene_${String(index + 1).padStart(2, "0")}`),
        name: this.getStringField(item, "name", `场景 ${index + 1}`),
        location: this.getStringField(item, "location", ""),
        timeOfDay: this.getStringField(item, "timeOfDay", ""),
        atmosphere: this.getStringField(item, "atmosphere", ""),
        purpose: this.getStringField(item, "purpose", ""),
        referenceAssetId: this.getOptionalStringField(item, "referenceAssetId") ?? null,
      }));
  }

  private normalizeStoryStructureBeats(input: unknown): StoryStructureJson["beats"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item, index) => ({
        id: this.getStringField(item, "id", `beat_${String(index + 1).padStart(2, "0")}`),
        order: this.getNumberField(item, "order", index + 1),
        title: this.getStringField(item, "title", `节拍 ${index + 1}`),
        summary: this.getStringField(item, "summary", ""),
        conflict: this.getStringField(item, "conflict", ""),
        characters: this.getStringArrayField(item, "characters"),
        sceneId: this.getOptionalStringField(item, "sceneId"),
        visualFocus: this.getStringField(item, "visualFocus", ""),
        outcome: this.getStringField(item, "outcome", ""),
      }));
  }

  private normalizeStoryboardJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryboardJson, "sourceStoryVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryboardJson {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const now = new Date().toISOString();

    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: this.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
      sourceStoryVersionId: overrides.sourceStoryVersionId
        ?? (typeof record.sourceStoryVersionId === "string" && record.sourceStoryVersionId.trim() ? record.sourceStoryVersionId : null),
      shots: this.normalizeStoryboardShots(record.shots),
      notes: this.getStringField(record, "notes", ""),
      createdAt: overrides.createdAt ?? this.getStringField(record, "createdAt", now),
      updatedAt: overrides.updatedAt ?? this.getStringField(record, "updatedAt", now),
    };
  }

  private normalizeStoryboardShots(input: unknown): StoryboardJson["shots"] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item, index) => this.normalizeStoryboardShot(item, index))
      .sort((left, right) => left.order - right.order);
  }

  private normalizeStoryboardShot(item: Record<string, unknown>, index: number): StoryboardShot {
    const comic = typeof item.comic === "object" && item.comic !== null && !Array.isArray(item.comic)
      ? item.comic as Record<string, unknown>
      : {};
    const motion = typeof item.motion === "object" && item.motion !== null && !Array.isArray(item.motion)
      ? item.motion as Record<string, unknown>
      : {};
    const status = this.getStringField(item, "status", "draft");

    return {
      id: this.getStringField(item, "id", `shot_${String(index + 1).padStart(3, "0")}`),
      order: this.getNumberField(item, "order", this.getNumberField(item, "shotNumber", index + 1)),
      beatId: this.getOptionalStringField(item, "beatId"),
      sceneId: this.getOptionalStringField(item, "sceneId"),
      characterIds: this.getStringArrayField(item, "characterIds"),
      coreAction: this.getStringField(item, "coreAction", this.getStringField(item, "action", "")),
      emotion: this.getStringField(item, "emotion", ""),
      comic: {
        panelDescription: this.getStringField(comic, "panelDescription", this.getStringField(item, "action", "")),
        composition: this.getStringField(comic, "composition", this.getStringField(item, "composition", this.getStringField(item, "camera", ""))),
        dialogue: this.getStringField(comic, "dialogue", this.getStringField(item, "dialogue", "")),
        caption: this.getStringField(comic, "caption", this.getStringField(item, "caption", "")),
        panelRhythm: this.getStringField(comic, "panelRhythm", ""),
      },
      motion: {
        visualDescription: this.getStringField(motion, "visualDescription", this.getStringField(item, "action", "")),
        compositionDesign: this.getStringField(motion, "compositionDesign", this.getStringField(item, "camera", "")),
        cameraMovement: this.getStringField(motion, "cameraMovement", ""),
        voiceRole: this.getStringField(motion, "voiceRole", ""),
        line: this.getStringField(motion, "line", this.getStringField(item, "dialogue", "")),
        durationHint: this.getStringField(motion, "durationHint", ""),
        frameType: this.getStringField(motion, "frameType", ""),
      },
      promptDraft: this.getStringField(item, "promptDraft", ""),
      lockedCandidateId: this.getOptionalStringField(item, "lockedCandidateId"),
      status: status === "ready_for_image" || status === "image_generated" || status === "locked" || status === "needs_revision"
        ? status
        : "draft",
    };
  }

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
          level: this.normalizeCharacterLevel(this.getStringField(item, "level", "extra")),
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

  private toProjectCharactersResponse(project: LocalProject): ProjectCharactersResponse {
    return {
      characters: this.sortProjectCharacters(project.characters),
      assets: project.assets,
      ready: this.isProjectCharacterLibraryReady(project),
    };
  }

  private queueMissingCharacterReferenceTask(
    project: LocalProject,
    character: ProjectCharacter,
    referenceKind: ProjectCharacterReferenceKind,
  ): GenerationTaskItem | null {
    if (referenceKind === "none") {
      return null;
    }
    if (character.status === "in_use") {
      return null;
    }
    if (this.getCharacterReferenceAssets(project, character, referenceKind).length > 0) {
      return null;
    }
    if (this.hasActiveCharacterReferenceTask(project.id, character.id, referenceKind)) {
      return null;
    }
    return this.queueCharacterReferenceTask(project, character, referenceKind);
  }

  private queueCharacterReferenceTask(
    project: LocalProject,
    character: ProjectCharacter,
    referenceKind: ProjectCharacterReferenceKind,
    input: GenerateCharacterReferenceRequest = {},
  ): GenerationTaskItem {
    if (this.hasActiveCharacterReferenceTask(project.id, character.id, referenceKind)) {
      const existing = this.tasksService.list().find((task) =>
        task.projectId === project.id
        && task.type === "character_reference_generate"
        && task.target?.type === "character"
        && task.target.id === character.id
        && task.input.referenceKind === referenceKind
        && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
      );
      if (existing) {
        return existing;
      }
    }

    const task = this.tasksService.createControlled({
      projectId: project.id,
      type: "character_reference_generate",
      target: {
        type: "character",
        id: character.id,
      },
      input: {
        characterId: character.id,
        characterName: character.name,
        referenceKind,
        ...(referenceKind === "final_reference" && character.previewReferenceAssetId
          ? { sourceReferenceAssetId: character.previewReferenceAssetId }
          : {}),
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        outputFormat: input.outputFormat,
      },
      options: {
        provider: this.settingsService.getRuntimeImageProviderSettings().type === "doubao" ? "doubao_image" : "openai_image",
      },
    });
    this.enqueueCharacterReferenceTaskRun(task.id, project.id, character.id, referenceKind, input);
    return task;
  }

  private enqueueCharacterReferenceTaskRun(
    taskId: string,
    projectId: string,
    characterId: string,
    referenceKind: ProjectCharacterReferenceKind,
    input: GenerateCharacterReferenceRequest,
  ): void {
    const run = () => this.runCharacterReferenceTask(taskId, projectId, characterId, referenceKind, input);
    this.characterReferenceQueue = this.characterReferenceQueue.then(run, run);
    void this.characterReferenceQueue.catch((error) => {
      this.logger.error(`Character reference queue failed: ${this.getErrorMessage(error)}`);
    });
  }

  private async runCharacterReferenceTask(
    taskId: string,
    projectId: string,
    characterId: string,
    referenceKind: ProjectCharacterReferenceKind,
    input: GenerateCharacterReferenceRequest,
  ): Promise<void> {
    const current = this.tasksService.peek(taskId);
    if (!current) {
      return;
    }
    if (current.status === "cancelled") {
      return;
    }
    this.tasksService.start(taskId, "image_provider_running");
    try {
      const result = await this.generateCharacterReference(projectId, characterId, {
        ...input,
        referenceKind,
        sourceTaskId: taskId,
      });
      this.tasksService.succeed(taskId, {
        characterId,
        referenceKind,
        assetId: result.asset.id,
      });
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      this.tasksService.fail(taskId, "CHARACTER_REFERENCE_GENERATE_FAILED", this.getErrorMessage(error), true);
    }
  }

  private hasActiveCharacterReferenceTask(projectId: string, characterId: string, referenceKind: ProjectCharacterReferenceKind): boolean {
    return this.tasksService.list().some((task) =>
      task.projectId === projectId
      && task.type === "character_reference_generate"
      && task.target?.type === "character"
      && task.target.id === characterId
      && task.input.referenceKind === referenceKind
      && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
    );
  }

  private getCharacterReferenceAssets(
    project: Pick<LocalProject, "assets">,
    character: Pick<ProjectCharacter, "id" | "referenceAssetIds">,
    referenceKind: ProjectCharacterReferenceKind,
  ): WorkbenchAsset[] {
    const ids = new Set(character.referenceAssetIds);
    return project.assets
      .filter((asset) =>
        ids.has(asset.id)
        && this.getAssetReferenceKind(asset) === referenceKind,
      )
      .sort((left, right) => Date.parse(this.getAssetCreatedAt(right)) - Date.parse(this.getAssetCreatedAt(left)));
  }

  private getAssetCreatedAt(asset: WorkbenchAsset): string {
    try {
      const value = JSON.parse(asset.meta) as { createdAt?: unknown };
      return typeof value.createdAt === "string" ? value.createdAt : "1970-01-01T00:00:00.000Z";
    } catch {
      return "1970-01-01T00:00:00.000Z";
    }
  }

  private normalizeProjectCharacter(
    item: Record<string, unknown>,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
    index: number,
  ): ProjectCharacter {
    const level = this.normalizeCharacterLevel(this.getStringField(item, "level", index === 0 ? "lead" : "recurring"));
    const primaryReferenceAssetId = this.getOptionalStringField(item, "primaryReferenceAssetId");
    const status = this.normalizeCharacterStatus(this.getStringField(item, "status", primaryReferenceAssetId ? "finalized" : "draft"));
    return {
      id: this.getStringField(item, "id", `char_${String(index + 1).padStart(3, "0")}`),
      projectId,
      name: this.normalizeCharacterName(this.getStringField(item, "name", `角色 ${index + 1}`)),
      role: this.getStringField(item, "role", ""),
      level,
      status,
      appearance: this.getStringField(item, "appearance", ""),
      personality: this.getStringField(item, "personality", ""),
      promptFragment: this.getStringField(item, "promptFragment", ""),
      referenceAssetIds: this.getStringArrayField(item, "referenceAssetIds"),
      previewReferenceAssetId: this.getOptionalStringField(item, "previewReferenceAssetId"),
      previewConfirmedAt: this.getOptionalStringField(item, "previewConfirmedAt"),
      primaryReferenceAssetId,
      primaryReferenceKind: this.normalizeCharacterReferenceKind(
        this.getStringField(item, "primaryReferenceKind", this.defaultReferenceKindForLevel(level)),
      ),
      visualVersion: this.getNumberField(item, "visualVersion", primaryReferenceAssetId ? 1 : 0),
      source: item.source === "imported_script" || item.source === "manual" || item.source === "story_structure" || item.source === "image_preflight" ? item.source : "script_outline",
      createdAt: this.getStringField(item, "createdAt", fallbackCreatedAt),
      updatedAt: this.getStringField(item, "updatedAt", fallbackUpdatedAt),
      finalizedAt: this.getOptionalStringField(item, "finalizedAt"),
    };
  }

  private normalizeCharacterLevel(value: string): ProjectCharacterLevel {
    return characterLevels.includes(value as ProjectCharacterLevel) ? value as ProjectCharacterLevel : "chapter";
  }

  private normalizeCharacterStatus(value: string): ProjectCharacterStatus {
    return characterStatuses.includes(value as ProjectCharacterStatus) ? value as ProjectCharacterStatus : "draft";
  }

  private normalizeCharacterReferenceKind(value: string): ProjectCharacterReferenceKind {
    if (value === "turnaround_4view") {
      return "final_reference";
    }
    if (value === "single_front") {
      return "preview_front";
    }
    return characterReferenceKinds.includes(value as ProjectCharacterReferenceKind) ? value as ProjectCharacterReferenceKind : "none";
  }

  private defaultReferenceKindForLevel(level: ProjectCharacterLevel): ProjectCharacterReferenceKind {
    if (level === "lead" || level === "recurring") {
      return "final_reference";
    }
    if (level === "chapter" || level === "extra") {
      return "preview_front";
    }
    return "none";
  }

  private normalizeRequestedReferenceKind(
    character: ProjectCharacter,
    requested: ProjectCharacterReferenceKind | undefined,
  ): ProjectCharacterReferenceKind {
    const fallback = this.defaultReferenceKindForLevel(character.level);
    const normalized = requested ? this.normalizeCharacterReferenceKind(requested) : fallback;
    if (normalized === "preview_front") {
      return "preview_front";
    }
    if (normalized === "final_reference" && character.level === "extra") {
      return "none";
    }
    return normalized === "none" ? fallback : normalized;
  }

  private isProjectCharacterLibraryReady(project: Pick<LocalProject, "characters">): boolean {
    const required = project.characters.filter((character) => character.level === "lead" || character.level === "recurring");
    if (required.length === 0) {
      return false;
    }

    return required.every((character) =>
      (character.status === "finalized" || character.status === "in_use")
      && Boolean(character.primaryReferenceAssetId)
      && character.primaryReferenceKind === "final_reference",
    );
  }

  private resolvePrimaryReferenceForLevel(
    character: ProjectCharacter,
    level: ProjectCharacterLevel,
  ): Pick<ProjectCharacter, "primaryReferenceAssetId" | "primaryReferenceKind" | "finalizedAt"> {
    if (this.isPrimaryReferenceCompatible(character.primaryReferenceAssetId, character.primaryReferenceKind)) {
      return {
        primaryReferenceAssetId: character.primaryReferenceAssetId,
        primaryReferenceKind: character.primaryReferenceKind,
        finalizedAt: character.finalizedAt,
      };
    }

    return {
      primaryReferenceAssetId: null,
      primaryReferenceKind: this.defaultReferenceKindForLevel(level),
      finalizedAt: null,
    };
  }

  private isPrimaryReferenceCompatible(
    primaryReferenceAssetId: string | null,
    primaryReferenceKind: ProjectCharacterReferenceKind,
  ): boolean {
    if (!primaryReferenceAssetId) {
      return false;
    }
    return primaryReferenceKind === "final_reference";
  }

  private resolveCharacterStatusForReference(
    level: ProjectCharacterLevel,
    primaryReferenceAssetId: string | null,
    inUse: boolean,
    primaryReferenceKind = this.defaultReferenceKindForLevel(level),
  ): ProjectCharacterStatus {
    if (inUse) {
      return "in_use";
    }
    if (this.isPrimaryReferenceCompatible(primaryReferenceAssetId, primaryReferenceKind)) {
      return "finalized";
    }
    if (level === "lead" || level === "recurring") {
      return "needs_reference";
    }
    return "draft";
  }

  private sortProjectCharacters(characters: ProjectCharacter[]): ProjectCharacter[] {
    const order: Record<ProjectCharacterLevel, number> = {
      lead: 0,
      recurring: 1,
      chapter: 2,
      extra: 3,
    };
    return [...characters].sort((left, right) => {
      const levelDelta = order[left.level] - order[right.level];
      if (levelDelta !== 0) return levelDelta;
      return left.createdAt.localeCompare(right.createdAt);
    });
  }

  private normalizeCharacterName(value: string): string {
    const name = value.trim().replace(/^[-*•\d.\s]+/u, "");
    if (!name) {
      throw new BadRequestException("CHARACTER_NAME_REQUIRED");
    }
    return name.slice(0, 60);
  }

  private normalizeCharacterNameKey(name: string): string {
    return name.trim().toLowerCase();
  }

  private resolveMoreImportantCharacterLevel(
    left: ProjectCharacterLevel,
    right: ProjectCharacterLevel,
  ): ProjectCharacterLevel {
    const order: Record<ProjectCharacterLevel, number> = {
      lead: 0,
      recurring: 1,
      chapter: 2,
      extra: 3,
    };
    return order[left] <= order[right] ? left : right;
  }

  private extractCharactersFromProjectSource(
    project: LocalProject,
    source: "script_outline" | "current_chapter" | "auto",
    now: string,
  ): ProjectCharacter[] {
    const sourceText = source === "current_chapter"
      ? this.getCurrentChapter(project)?.sourceText ?? ""
      : project.scriptOutline?.sourceText || this.getCurrentChapter(project)?.sourceText || project.sourceText;
    const sourceType: ProjectCharacter["source"] = project.scriptOutline?.sourceText && source !== "current_chapter"
      ? "script_outline"
      : "imported_script";
    const section = this.extractMainCharactersSection(sourceText);
    if (!section.trim()) {
      return [];
    }

    const lines = section
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const candidates: ProjectCharacter[] = [];

    for (const line of lines) {
      const parsed = this.parseCharacterLine(line);
      if (!parsed) {
        continue;
      }
      const level = this.inferCharacterLevel(parsed.name, parsed.role, parsed.description, candidates.length);
      candidates.push({
        id: `char_${randomUUID()}`,
        projectId: project.id,
        name: parsed.name,
        role: parsed.role,
        level,
        status: level === "lead" || level === "recurring" ? "needs_reference" : "draft",
        appearance: parsed.description,
        personality: "",
        promptFragment: parsed.description,
        referenceAssetIds: [],
        previewReferenceAssetId: null,
        previewConfirmedAt: null,
        primaryReferenceAssetId: null,
        primaryReferenceKind: this.defaultReferenceKindForLevel(level),
        visualVersion: 0,
        source: sourceType,
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
      });
    }

    return candidates.slice(0, 12);
  }

  private extractMainCharactersSection(sourceText: string): string {
    const start = sourceText.search(/主要角色|角色设定|人物设定|角色列表|人物列表/u);
    if (start < 0) {
      return "";
    }
    const rest = sourceText.slice(start);
    const end = rest.search(/\n\s*(情节概要|剧情简介|章节|剧本正文|第\s*\d+\s*[章集]|##?\s+)/u);
    return end > 0 ? rest.slice(0, end) : rest;
  }

  private parseCharacterLine(line: string): { name: string; role: string; description: string } | null {
    const cleaned = line.replace(/^[-*•\d.\s]+/u, "").trim();
    const match = /^([^：:（(]{1,30})(?:[（(]([^）)]{1,30})[）)])?\s*[：:]\s*(.{2,})$/u.exec(cleaned);
    if (!match) {
      return null;
    }
    const rawName = match[1].trim();
    if (/^(主要角色|角色设定|人物设定|基础信息|剧情简介)$/u.test(rawName)) {
      return null;
    }
    return {
      name: this.normalizeCharacterName(rawName),
      role: (match[2] ?? "").trim(),
      description: match[3].trim(),
    };
  }

  private inferCharacterLevel(
    name: string,
    role: string,
    description: string,
    index: number,
  ): ProjectCharacterLevel {
    const text = `${name} ${role} ${description}`;
    if (/主角|女主|男主|核心视角|主人公/u.test(text) || index === 0) {
      return "lead";
    }
    if (/常驻|主要|反派|男二|女二|伙伴|搭档|摄政王|长期|宿敌/u.test(text)) {
      return "recurring";
    }
    if (/路人|背景|群众|侍卫|店员|司机/u.test(text)) {
      return "extra";
    }
    return "chapter";
  }

  private findProjectCharacter(project: LocalProject, characterId: string): ProjectCharacter {
    const character = project.characters.find((item) => item.id === characterId);
    if (!character) {
      throw new NotFoundException("PROJECT_CHARACTER_NOT_FOUND");
    }
    return character;
  }

  private withUpdatedProjectCharacter(
    project: LocalProject,
    character: ProjectCharacter,
    updatedAt: string,
  ): LocalProject {
    return {
      ...project,
      characters: this.sortProjectCharacters(project.characters.map((item) => (item.id === character.id ? character : item))),
      updatedAt,
    };
  }

  private buildCharacterReferencePrompt(
    project: LocalProject,
    character: ProjectCharacter,
    referenceKind: ProjectCharacterReferenceKind,
  ): string {
    const styleGuide = this.buildCharacterReferenceStyleGuide(project);
    const base = [
      `项目类型：${this.getProjectTypeLabel(project.type)}。This is a comic/manhua production project, not a live-action casting project.`,
      `作品名：${project.storyTitle || project.name}`,
      project.genreTags.length > 0 ? `题材标签：${project.genreTags.join("、")}` : "",
      `漫画形式：${this.getComicFormatLabel(project.comicFormat)}`,
      `美术风格：${this.getArtStyleLabel(project.artStyle)}`,
      "风格硬约束：必须是绘制感漫画/条漫/漫画角色设定图，不能生成真人照片、真人演员定妆照、摄影棚肖像、电影剧照、cosplay 照片或 3D 渲染。",
      styleGuide,
      `角色名：${character.name}`,
      `角色身份：${character.role || character.level}`,
      `外貌设定：${character.appearance || "根据项目风格补全，但保持简洁稳定"}`,
      `性格气质：${character.personality || "符合角色身份"}`,
      character.promptFragment ? `提示词片段：${character.promptFragment}` : "",
    ].filter(Boolean).join("\n");

    if (referenceKind === "final_reference") {
      return [
        "Create a clean final character reference sheet for a comic/manhua production pipeline using the provided preview image as the strict character identity reference.",
        "Preserve the same face, hairstyle, outfit, age, body proportions, and overall temperament from the preview image.",
        "Drawn illustration style only. One same character, same outfit, same proportions, neutral expression, plain light background.",
        "The single image must contain four panels: front half-body portrait, front full-body, side full-body, back full-body.",
        "No text labels, no logo, no watermark, no extra characters, no dramatic pose changes.",
        base,
      ].join("\n");
    }

    return [
      "Create a clean front preview portrait for a comic/manhua character library.",
      "Drawn illustration style only. One character, front view, half-body portrait, clear face and costume cues, plain light background.",
      "No text labels, no logo, no watermark, no extra characters.",
      base,
    ].join("\n");
  }

  private buildCharacterReferenceStyleGuide(project: Pick<LocalProject, "artStyle" | "comicFormat">): string {
    const artStyle = this.getArtStyleLabel(project.artStyle);
    const comicFormat = this.getComicFormatLabel(project.comicFormat);
    return [
      `Style guide: ${artStyle}; ${comicFormat}.`,
      "Use stylized comic linework, controlled cel shading or painterly comic shading, clean readable silhouette, and production-ready character consistency.",
      "Even if the story is realistic or dark, interpret realism as comic realism, not photorealism.",
    ].join("\n");
  }

  private getProjectTypeLabel(type: ProjectType): string {
    const labels: Record<ProjectType, string> = {
      comic: "漫画",
      light_motion: "漫剧",
      mixed: "漫画 + 漫剧",
    };
    return labels[type] ?? "漫画";
  }

  private getComicFormatLabel(format: ComicFormat): string {
    const labels: Record<ComicFormat, string> = {
      vertical_scroll: "竖版条漫 / vertical scrolling webcomic",
      page_horizontal: "页漫 / page-based comic",
      four_panel: "四格漫画 / four-panel comic",
    };
    return labels[format] ?? "竖版条漫 / vertical scrolling webcomic";
  }

  private getArtStyleLabel(style: ArtStyle): string {
    const labels: Record<ArtStyle, string> = {
      dark_realistic: "暗调漫画写实 / dark cinematic comic realism, non-photorealistic",
      semi_realistic: "半写实漫画 / semi-realistic comic illustration, non-photorealistic",
      japanese_realistic: "日系漫画写实 / Japanese manga-realistic illustration, non-photorealistic",
      comic_style: "漫画风格 / clean comic and manhua illustration",
      cyberpunk: "赛博朋克漫画 / cyberpunk comic illustration",
      custom: "自定义漫画美术 / custom comic illustration style",
    };
    return labels[style] ?? "漫画风格 / clean comic and manhua illustration";
  }

  private async getConfirmedPreviewReferenceSource(
    project: LocalProject,
    character: ProjectCharacter,
  ): Promise<CharacterReferenceSource> {
    if (!character.previewReferenceAssetId) {
      throw new BadRequestException("CHARACTER_PREVIEW_REFERENCE_REQUIRED");
    }

    const asset = project.assets.find((item) => item.id === character.previewReferenceAssetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_PREVIEW_ASSET_NOT_FOUND");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    if (this.getAssetReferenceKind(asset) !== "preview_front") {
      throw new BadRequestException("CHARACTER_PREVIEW_KIND_MISMATCH");
    }

    return {
      asset,
      ...(await this.readProjectAssetFile(project, asset)),
    };
  }

  private async readProjectAssetFile(project: Pick<LocalProject, "id">, asset: WorkbenchAsset): Promise<ProjectAssetFile> {
    const safePath = asset.path.replace(/^\/+/, "");
    if (!safePath.startsWith(`projects/${project.id}/`)) {
      throw new BadRequestException("PROJECT_ASSET_PATH_INVALID");
    }

    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${safePath}`);
    try {
      return {
        buffer: await readFile(absolutePath),
        mimeType: this.inferMimeType(asset.path),
        fileName: path.basename(asset.path),
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException("PROJECT_ASSET_FILE_NOT_FOUND");
      }
      throw error;
    }
  }

  private async removeProjectAssetFile(project: Pick<LocalProject, "id">, asset: WorkbenchAsset): Promise<void> {
    const safePath = asset.path.replace(/^\/+/, "");
    if (!safePath.startsWith(`projects/${project.id}/`)) {
      this.logger.warn(`Skip invalid project asset path during delete: ${asset.path}`);
      return;
    }

    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${safePath}`);
    try {
      await rm(absolutePath, { force: true });
    } catch (error) {
      this.logger.warn(`Failed to remove project asset file ${safePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async requestOpenAiImage(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    quality: "auto" | "low" | "medium" | "high";
    outputFormat: "webp" | "png" | "jpeg";
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        n: 1,
        size: input.size,
        quality: input.quality,
        output_format: input.outputFormat,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_FAILED:${response.status}`);
    }

    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`IMAGE_PROVIDER_URL_FAILED:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new BadRequestException("IMAGE_PROVIDER_EMPTY_RESPONSE");
  }

  private async requestOpenAiImageEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    quality: "auto" | "low" | "medium" | "high";
    outputFormat: "webp" | "png" | "jpeg";
    referenceImage: ProjectAssetFile;
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/edits`;
    const form = new FormData();
    const referenceBytes = new Uint8Array(input.referenceImage.buffer.length);
    referenceBytes.set(input.referenceImage.buffer);
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    form.set("n", "1");
    form.set("size", input.size);
    form.set("quality", input.quality);
    form.set("output_format", input.outputFormat);
    form.set(
      "image",
      new Blob([referenceBytes], { type: input.referenceImage.mimeType }),
      input.referenceImage.fileName,
    );

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }

    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`IMAGE_PROVIDER_EDIT_URL_FAILED:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new BadRequestException("IMAGE_PROVIDER_EDIT_EMPTY_RESPONSE");
  }

  /**
   * 豆包 doubao-seedream 文生图
   * endpoint: {baseUrl}/images/generations (JSON),响应取 data[0].url 下载
   */
  private async requestDoubaoImage(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        response_format: "url",
        watermark: true,
        stream: false,
        sequential_image_generation: "disabled",
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_FAILED:${response.status}`);
    }

    return this.downloadDoubaoImageResponse(response);
  }

  /**
   * 豆包 doubao-seedream 图生图
   * endpoint: {baseUrl}/images/generations (JSON),image 字段传 data:image/<fmt>;base64,<...>
   */
  private async requestDoubaoImageEdit(input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    prompt: string;
    size: string;
    referenceImage: ProjectAssetFile;
  }): Promise<Buffer> {
    const url = `${input.baseUrl.replace(/\/+$/, "")}/images/generations`;
    const base64Image = input.referenceImage.buffer.toString("base64");
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        image: `data:${input.referenceImage.mimeType};base64,${base64Image}`,
        size: input.size,
        response_format: "url",
        watermark: true,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`IMAGE_PROVIDER_EDIT_FAILED:${response.status}`);
    }

    return this.downloadDoubaoImageResponse(response);
  }

  /** 豆包响应统一处理:取 data[0].url 下载成 Buffer(豆包默认返回 url 格式) */
  private async downloadDoubaoImageResponse(response: Response): Promise<Buffer> {
    const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      const imageResponse = await this.fetchWithTimeout(first.url);
      if (!imageResponse.ok) {
        throw new BadRequestException(`IMAGE_PROVIDER_URL_FAILED:${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }
    throw new BadRequestException("IMAGE_PROVIDER_EMPTY_RESPONSE");
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 300_000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new BadRequestException("IMAGE_PROVIDER_TIMEOUT");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private digestPrompt(prompt: string): string {
    return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
  }

  private getAssetReferenceKind(asset: WorkbenchAsset): ProjectCharacterReferenceKind | null {
    try {
      const value = JSON.parse(asset.meta) as { referenceKind?: unknown };
      return typeof value.referenceKind === "string" ? this.normalizeCharacterReferenceKind(value.referenceKind) : null;
    } catch {
      return null;
    }
  }

  private inferMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      default:
        return "application/octet-stream";
    }
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

  private assertProjectStillActive(projectId: string): void {
    if (!this.projects.has(projectId)) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }
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
      title: title?.trim() || getDefaultChapterTitle(nextOrder),
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText: "",
      summary: "",
      storyStructure: null,
      storyboard: null,
      pendingStoryboard: null,
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
    return [...chapters].sort((left, right) => left.order - right.order);
  }

  private toChapterListItem(chapter: LocalChapter): ChapterListItem {
    const sourceText = stripChapterScriptName(chapter.sourceText);
    return {
      id: chapter.id,
      projectId: chapter.projectId,
      slug: chapter.slug,
      order: chapter.order,
      title: chapter.title,
      status: chapter.status,
      storyboardStatus: chapter.pendingStoryboard?.status ?? chapter.storyboard?.status ?? null,
      currentScriptVersionId: chapter.currentScriptVersionId,
      currentStoryVersionId: chapter.currentStoryVersionId,
      summary: chapter.summary,
      sourceTextPreview: sourceText.slice(0, 96),
      lastScriptRevision: chapter.lastScriptRevision,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
      completedAt: chapter.completedAt,
    };
  }

  private toChapterDetail(chapter: LocalChapter): ChapterDetail {
    const sourceText = stripChapterScriptName(chapter.sourceText);
    return {
      ...this.toChapterListItem(chapter),
      sourceText,
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
