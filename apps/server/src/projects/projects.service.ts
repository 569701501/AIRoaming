import { BadRequestException, HttpException, Inject, Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { rm } from "node:fs/promises";
import type { LocalChapter, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { ProjectStore } from "./project-store.service.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import { ChapterScriptService } from "./chapter-script.service.js";
import { StoryboardService } from "./storyboard.service.js";
import { StoryStructureService } from "./story-structure.service.js";
import { ImagePreflightService } from "./image-preflight.service.js";
import { ImageCandidateService } from "./image-candidate.service.js";
import { LayoutPublicationService } from "./layout-publication.service.js";
import { AssetPackageService } from "./asset-package.service.js";
import { ProjectDeleteOutboxService } from "./project-delete-outbox.service.js";
import { parseCreateProjectRequestV1, parseUpdateProjectDraftRequestV1 } from "./project-input.contract.js";
import { mapG3ProjectDatabaseError } from "./g3-project-error.mapper.js";
import { DEFAULT_CHAPTER_ID } from "./project-domain.util.js";
import { randomUUID } from "node:crypto";
import {
  stripChapterScriptName,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterStoryboard,
  type ClearChapterScriptResponse,
  type ConfirmChapterPendingSourceResponse,
  type DiscardChapterPendingSourceResponse,
  type ArtStyle,
  type ConfirmCharacterPreviewRequest,
  type ConfirmCharacterPreviewResponse,
  type ConfirmChapterStoryboardRequest,
  type ConfirmChapterStoryStructureRequest,
  type ConfirmCharacterReferenceRequest,
  type DeleteCharacterReferenceResponse,
  type ConfirmChapterImagePreflightRequest,
  type CompleteChapterRequest,
  type CompleteChapterResponse,
  type CompleteChapterImagesResponse,
  type CandidateGenerationPreviewResponse,
  type CandidatePromptOverrides,
  type CreateGenerationTaskRequest,
  type DeleteProjectResponse,
  type ExportAssetPackageResponse,
  type CreateLayoutPublicationResponseV1,
  type CreateLayoutPublicationResponseV2,
  type LayoutPublicationHistoryResponseV1,
  type LayoutPublicationHistoryResponseV2,
  type LayoutPublicationSummaryV1,
  type LayoutPublicationSummaryV2,
  type ExtractProjectCharactersRequest,
  type ExtractProjectCharactersResponse,
  type GenerateCharacterReferenceRequest,
  type GetChapterStoryStructureResponse,
  type GetChapterStoryboardResponse,
  type GetChapterImagePreflightResponse,
  type GetChapterResponse,
  type ListChaptersResponse,
  type QueueCharacterReferenceResponse,
  type QueueSceneReferenceResponse,
  type GenerateSceneReferenceRequest,
  type ResolveImagePreflightCharacterRequest,
  type ResolveImagePreflightCharacterResponse,
  type ProjectCharactersResponse,
  type ProjectListItem,
  type ProjectScriptOutline,
  type ProjectType,
  type ProjectWorkflow,
  type SaveChapterDraftRequest,
  type SaveChapterDraftResponse,
  type SaveChapterImagePreflightResponse,
  type SaveChapterStoryStructureResponse,
  type SaveChapterStoryboardResponse,
  type SaveProjectCharacterResponse,
  type ScriptRevisionItem,
  type StoryboardShot,
  type UpdateChapterStoryboardRequest,
  type UpdateChapterStoryStructureRequest,
  type UpdateProjectCharacterRequest,
  type WorkbenchSnapshot,
  type VersioningCapability,
} from "@airoaming/shared";
import { TasksService } from "../tasks/tasks.service.js";
import { PersistentG2TaskCreateGuardService } from "./persistent-g2-task-create-guard.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { DocumentLibraryRepository } from "./document-library.repository.js";
import { DocumentLibraryStore } from "./document-library.store.js";
import { ProjectScriptCommandRepository } from "./project-script-command.repository.js";
import { G2DatabaseError } from "./versioning/g2-database-error.mapper.js";
import { ChapterProductionQueryService } from "./versioning/chapter-production-query.service.js";
import { CandidateDecisionService } from "./candidate-decision.service.js";
import {
  createCandidateGenerationSpec,
  createCandidateGenerationTaskInput,
} from "./candidate-generation-spec.js";
import { hasBlockingCandidateVisualIssues } from "./candidate-visual-quality.util.js";

const imageCandidateTaskTypes = new Set(["shot_prompt_generate", "image_generate"]);

function rethrowMappedG3ProjectError(error: unknown): never {
  const mapped = mapG3ProjectDatabaseError(error);
  if (mapped) {
    throw new HttpException(
      {
        success: false,
        error: {
          code: mapped.code,
          message: mapped.message,
          ...(mapped.details === undefined ? {} : { details: mapped.details }),
        },
      },
      mapped.status,
    );
  }
  throw error;
}

// LocalChapter / LocalProject / LocalChapterScriptVersion 已抽到 ./local-types.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre)。

interface ProjectAssetFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface WriteChapterDraftFromAIInput {
  sourceText: string;
  title?: string;
  summary: string;
  threadId: string;
  messageId: string;
  toolCallId: string;
  operation: "update_chapter_draft" | "generate_script_from_seed" | "generate_script_from_outline";
  continuitySource?: {
    previousChapterId: string;
    previousScriptVersionId: string;
    previousSourceDigest: `sha256:${string}`;
  };
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
  private readonly projectDeletedListeners = new Set<ProjectDeletedListener>();

  private isDatabaseMode(): boolean {
    return (this.repository as unknown as { isDatabaseMode?: () => boolean }).isDatabaseMode?.() === true;
  }

  /** Controller facade selector; keeps file and DB semantics behind one public route. */
  usesDatabasePersistence(): boolean {
    return this.isDatabaseMode();
  }

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(CharacterReferenceService) private readonly characterRef: CharacterReferenceService,
    @Inject(ChapterScriptService) private readonly chapterScript: ChapterScriptService,
    @Inject(StoryboardService) private readonly storyboard: StoryboardService,
    @Inject(StoryStructureService) private readonly storyStructure: StoryStructureService,
    @Inject(ImagePreflightService) private readonly imagePreflight: ImagePreflightService,
    @Inject(ImageCandidateService) private readonly imageCandidate: ImageCandidateService,
    @Inject(AssetPackageService) private readonly assetPackage: AssetPackageService,
    @Optional() @Inject(PersistentG2TaskCreateGuardService) private readonly g2TaskCreateGuard?: PersistentG2TaskCreateGuardService,
    @Optional() @Inject(ProjectScriptCommandRepository) private readonly scriptCommands?: ProjectScriptCommandRepository,
    @Optional() @Inject(ProjectDeleteOutboxService) private readonly projectDeleteOutbox?: ProjectDeleteOutboxService,
    @Optional() @Inject(ChapterProductionQueryService) private readonly chapterProductionQuery?: ChapterProductionQueryService,
    @Optional() @Inject(CandidateDecisionService) private readonly candidateDecision?: CandidateDecisionService,
    @Optional() @Inject(LayoutPublicationService) private readonly layoutPublication?: LayoutPublicationService,
    @Optional() @Inject(DocumentLibraryRepository) private readonly documentLibrary?: DocumentLibraryRepository,
    @Optional() @Inject(DocumentLibraryStore) private readonly documentLibraryStore?: DocumentLibraryStore,
  ) {}

  async onModuleInit(): Promise<void> {
    this.tasksService.setCreateGuard((input) => this.guardGenerationTaskCreate(input));
    this.tasksService.setWorker("image_generate", (task) => this.imageCandidate.runTaskSerialized(task));
    this.projectStore.setReferenceTaskChecker((pid, cid, kind) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, kind));
    await this.projectStore.ensureProjectsLoaded();
  }

  async listProjects(): Promise<ProjectListItem[]> {
    try {
      await this.projectStore.ensureProjectsLoaded();
    } catch (error) {
      rethrowMappedG3ProjectError(error);
    }
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

  async createProject(rawInput: unknown): Promise<ProjectListItem> {
    const input = parseCreateProjectRequestV1(rawInput);
    try {
      await this.projectStore.ensureProjectsLoaded();
    } catch (error) {
      rethrowMappedG3ProjectError(error);
    }
    const now = new Date().toISOString();
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("PROJECT_NAME_REQUIRED");
    }

    const storyTitle = input.storyTitle?.trim() ?? "";
    const description = input.description?.trim() ?? "";
    const comicFormat = input.comicFormat;
    const artStyle = this.normalizeArtStyle(input.artStyle);
    const genreTags = this.normalizeGenreTags(input.genreTags);
    const sourceText = input.sourceText?.trim() ?? "";
    const projectId = randomUUID();

    // 从文稿库导入：直接引用文稿章节建立章节壳（不复制正文、不触发 AI）
    let chapters: LocalChapter[];
    if (input.documentWorkId) {
      if (!this.documentLibrary) {
        throw new BadRequestException("DOCUMENT_LIBRARY_UNAVAILABLE");
      }
      const document = await this.documentLibrary.getWorkWithChapters(input.documentWorkId);
      if (!document) {
        throw new BadRequestException("DOCUMENT_NOT_FOUND");
      }
      if (document.chapters.length === 0) {
        throw new BadRequestException("DOCUMENT_HAS_NO_CHAPTERS");
      }
      chapters = document.chapters.map((chapter, index) => ({
        id: `${projectId}_chapter_${String(index + 1).padStart(3, "0")}`,
        projectId,
        slug: `chapter-${String(index + 1).padStart(3, "0")}`,
        order: index + 1,
        title: chapter.title,
        status: "draft" as const,
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
        documentWorkId: document.work.id,
        documentChapterId: chapter.id,
      }));
    } else {
      const defaultChapter = this.createDefaultChapter(projectId, sourceText, now);
      chapters = [defaultChapter];
    }

    const project: LocalProject = {
      id: projectId,
      name,
      type: this.normalizeProjectType(input.type),
      currentChapterId: chapters[0]!.id,
      storyTitle,
      genreTags,
      comicFormat,
      artStyle,
      description,
      sourceText,
      scriptOutline: null,
      characters: [],
      assets: [],
      chapters,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.projectStore.writeProjectFiles(project, "create_project");
    } catch (error) {
      rethrowMappedG3ProjectError(error);
    }
    this.repository.setProject(project);
    return this.toProjectListItem(project);
  }

  async updateProjectDraft(projectId: string, rawInput: unknown): Promise<ProjectListItem> {
    const input = parseUpdateProjectDraftRequestV1(rawInput);
    if (this.isDatabaseMode()) {
      if (rawInput && typeof rawInput === "object" && Object.prototype.hasOwnProperty.call(rawInput, "sourceText")) {
        throw new HttpException({ success: false, error: { code: "LEGACY_WRITE_ROUTE_DISABLED", message: "LEGACY_WRITE_ROUTE_DISABLED", details: { replacement: `/api/projects/${projectId}/chapters/{currentChapterId}/script/working-copy` } } }, 409);
      }
      try {
        if (!this.scriptCommands) throw new Error("DB_SCRIPT_COMMAND_REPOSITORY_MISSING");
        await this.scriptCommands.updateProjectMetadata(projectId, {
          name: input.name,
          storyTitle: input.storyTitle,
          genreTags: input.genreTags,
          artStyle: input.artStyle,
          description: input.description,
        });
      } catch (error) {
        if (error instanceof G2DatabaseError) {
          throw new HttpException({ success: false, error: { code: error.code, message: error.message, details: error.details } }, error.status);
        }
        throw error;
      }
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      return this.toProjectListItem(refreshed);
    }
    // 请求内容的既有校验必须早于存储模式门禁，避免 DB 模式改变公开 API 的参数错误语义。
    if (input.sourceText !== undefined && !input.sourceText.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }
    this.repository.assertDatabaseOperationSupported("update_project_draft");
    let project: LocalProject;
    try {
      project = await this.projectStore.getReadyProject(projectId);
    } catch (error) {
      rethrowMappedG3ProjectError(error);
    }

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
      storyTitle: nextStoryTitle,
      genreTags: input.genreTags === undefined ? project.genreTags : this.normalizeGenreTags(input.genreTags),
      artStyle: input.artStyle === undefined ? project.artStyle : this.normalizeArtStyle(input.artStyle),
      description: nextDescription,
      sourceText: nextSourceText,
      chapters: nextChapters,
      updatedAt,
    };

    try {
      await this.projectStore.writeProjectFiles(nextProject);
    } catch (error) {
      rethrowMappedG3ProjectError(error);
    }
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

  async extractProjectCharacters(projectId: string,
    input: ExtractProjectCharactersRequest = {},) : Promise<ExtractProjectCharactersResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("extract_characters");
    return this.characterRef.extractProjectCharacters(projectId, input);
  }

  async updateProjectCharacter(projectId: string,
    characterId: string,
    input: UpdateProjectCharacterRequest,) : Promise<SaveProjectCharacterResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("update_character");
    return this.characterRef.updateProjectCharacter(projectId, characterId, input);
  }

  /**
   * 场景背景图:排队生成入口(对称 queueCharacterReference,但更简单——纯文生图)
   */
  async queueSceneReference(projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest = {},) : Promise<QueueSceneReferenceResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("queue_scene_reference");
    return this.characterRef.queueSceneReference(projectId, chapterId, sceneId, input);
  }

  /** 由场景字段拼成生图 prompt */
  async queueCharacterReference(projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest = {},) : Promise<QueueCharacterReferenceResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("queue_character_reference");
    return this.characterRef.queueCharacterReference(projectId, characterId, input);
  }

  async confirmCharacterPreview(projectId: string,
    characterId: string,
    input: ConfirmCharacterPreviewRequest,) : Promise<ConfirmCharacterPreviewResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("confirm_character_preview");
    return this.characterRef.confirmCharacterPreview(projectId, characterId, input);
  }

  async confirmCharacterReference(projectId: string,
    characterId: string,
    input: ConfirmCharacterReferenceRequest,) : Promise<SaveProjectCharacterResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("confirm_character_reference");
    return this.characterRef.confirmCharacterReference(projectId, characterId, input);
  }

  async deleteCharacterReference(projectId: string,
    characterId: string,
    assetId: string,) : Promise<DeleteCharacterReferenceResponse> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("delete_character_reference");
    return this.characterRef.deleteCharacterReference(projectId, characterId, assetId);
  }

  async getProjectAssetFile(projectId: string, assetId: string) : Promise<ProjectAssetFile> {
    return this.characterRef.getProjectAssetFile(projectId, assetId);
  }

  async saveChapterDraft(projectId: string,
    chapterId: string,
    input: SaveChapterDraftRequest,) : Promise<SaveChapterDraftResponse> {
    if (this.isDatabaseMode()) this.throwLegacyWriteDisabled(projectId, chapterId, "PATCH");
    return this.chapterScript.saveChapterDraft(projectId, chapterId, input);
  }

  async completeChapter(projectId: string,
    chapterId: string,
    input: CompleteChapterRequest,) : Promise<CompleteChapterResponse> {
    if (this.isDatabaseMode()) this.throwLegacyWriteDisabled(projectId, chapterId, "POST");
    return this.chapterScript.completeChapter(projectId, chapterId, input);
  }

  async clearChapterScript(projectId: string, chapterId: string) : Promise<ClearChapterScriptResponse> {
    if (this.isDatabaseMode()) this.throwLegacyWriteDisabled(projectId, chapterId, "POST");
    this.repository.assertDatabaseOperationSupported("clear_chapter_script");
    return this.chapterScript.clearChapterScript(projectId, chapterId);
  }

  /**
   * 确认章节正文草稿:把 pendingSourceText 覆盖到正式 sourceText,清掉 pending。
   * 仿 confirmChapterStoryboard(见 ADR-0008)。
   */
  async confirmChapterPendingSource(projectId: string,
    chapterId: string,) : Promise<ConfirmChapterPendingSourceResponse> {
    if (this.isDatabaseMode()) this.throwLegacyWriteDisabled(projectId, chapterId, "POST");
    this.repository.assertDatabaseOperationSupported("confirm_chapter_pending_source");
    return this.chapterScript.confirmChapterPendingSource(projectId, chapterId);
  }

  /**
   * 丢弃章节正文草稿:删除 pendingSourceText,正式 sourceText 不变。
   */
  async discardChapterPendingSource(projectId: string,
    chapterId: string,) : Promise<DiscardChapterPendingSourceResponse> {
    if (this.isDatabaseMode()) this.throwLegacyWriteDisabled(projectId, chapterId, "DELETE");
    this.repository.assertDatabaseOperationSupported("discard_chapter_pending_source");
    return this.chapterScript.discardChapterPendingSource(projectId, chapterId);
  }

  private throwLegacyWriteDisabled(projectId: string, chapterId: string, _method: string): never {
    throw new HttpException({ success: false, error: { code: "LEGACY_WRITE_ROUTE_DISABLED", message: "LEGACY_WRITE_ROUTE_DISABLED", details: { replacement: `/api/projects/${projectId}/chapters/${chapterId}/script/working-copy` } } }, 409);
  }

  private throwLegacyVersioningRouteDisabled(projectId: string, chapterId: string, operation: string, replacement: string, reason: string): never {
    throw new HttpException({
      success: false,
      error: {
        code: "LEGACY_WRITE_ROUTE_DISABLED",
        message: "LEGACY_WRITE_ROUTE_DISABLED",
        details: { operation, replacement: `/api/projects/${projectId}/chapters/${chapterId}${replacement}`, reason },
      },
    }, 409);
  }

  async writeChapterDraftFromAI(projectId: string,
    chapterId: string,
    input: WriteChapterDraftFromAIInput,) : Promise<WriteChapterDraftFromAIResult> {
    if (!stripChapterScriptName(input.sourceText.trim())) {
      throw new BadRequestException("AI_CHAPTER_DRAFT_REQUIRED");
    }
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("write_chapter_draft_from_ai");
    return this.chapterScript.writeChapterDraftFromAI(projectId, chapterId, input);
  }

  async saveScriptOutlineFromAI(projectId: string, input: SaveScriptOutlineFromAIInput) : Promise<ProjectScriptOutline> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("save_script_outline_from_ai");
    return this.chapterScript.saveScriptOutlineFromAI(projectId, input);
  }

  async confirmScriptOutline(projectId: string, expectedOutlineId?: string): Promise<ProjectScriptOutline> {
    if (!this.isDatabaseMode()) this.repository.assertDatabaseOperationSupported("confirm_script_outline");
    return this.chapterScript.confirmScriptOutline(projectId, expectedOutlineId);
  }

  async getChapterStoryStructure(projectId: string, chapterId: string) : Promise<GetChapterStoryStructureResponse> {
    return this.storyStructure.getChapterStoryStructure(projectId, chapterId);
  }

  async confirmChapterStoryStructure(projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryStructureRequest,) : Promise<SaveChapterStoryStructureResponse> {
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "confirm_story_structure", "/story-structure/working-copy", "旧结构确认绕过 StoryVersion CAS、projection 和 source gate；请使用 G2 Working Copy confirm。");
    }
    this.repository.assertDatabaseOperationSupported("confirm_story_structure");
    return this.storyStructure.confirmChapterStoryStructure(projectId, chapterId, input);
  }

  async updateChapterStoryStructure(projectId: string,
    chapterId: string,
    input: UpdateChapterStoryStructureRequest,) : Promise<SaveChapterStoryStructureResponse> {
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "update_story_structure", "/story-structure/working-copy", "旧结构编辑会原地覆盖 confirmed document；请使用带 observed rowVersion 的 G2 Working Copy update。");
    }
    this.repository.assertDatabaseOperationSupported("update_story_structure");
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
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "confirm_image_preflight", "/image-preflight/preview", "旧预检确认没有携带 storyboard source digest；请先读取服务端 preview 再 confirm。");
    }
    this.repository.assertDatabaseOperationSupported("confirm_image_preflight");
    return this.imagePreflight.confirmChapterImagePreflight(projectId, chapterId, input);
  }

  async resolveImagePreflightCharacter(projectId: string,
    chapterId: string,
    input: ResolveImagePreflightCharacterRequest,) : Promise<ResolveImagePreflightCharacterResponse> {
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "resolve_image_preflight_character", "/image-preflight/preview", "角色与视觉写入属于 Character/Asset capability；请先走该能力并重新生成服务端预检。");
    }
    this.repository.assertDatabaseOperationSupported("resolve_image_preflight_character");
    return this.imagePreflight.resolveImagePreflightCharacter(projectId, chapterId, input);
  }

  async getPendingChapterStoryboard(projectId: string, chapterId: string) : Promise<ChapterStoryboard | null> {
    return this.storyboard.getPendingChapterStoryboard(projectId, chapterId);
  }

  private async guardGenerationTaskCreate(input: CreateGenerationTaskRequest): Promise<CreateGenerationTaskRequest | void> {
    if (this.isDatabaseMode()) {
      if (!this.g2TaskCreateGuard) throw new BadRequestException("G2_TASK_CREATE_GUARD_UNAVAILABLE");
      return this.g2TaskCreateGuard.prepare(input);
    }
    this.repository.assertDatabaseOperationSupported("generation_task_create");
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

    const preflightTrace = {
      chapterId: chapter.id,
      imagePreflightId: imagePreflight.id,
      imagePreflightVersion: imagePreflight.version,
      imagePreflightPath: imagePreflight.preflightPath,
      imagePreflightConfirmedAt: imagePreflight.confirmedAt,
      sourceStoryboardId: imagePreflight.sourceStoryboardId,
      sourceStoryboardUpdatedAt: imagePreflight.sourceStoryboardUpdatedAt,
    };

    if (input.type === "image_generate") {
      const shotId = this.getGenerationTaskShotId(input);
      const shot = storyboard.storyboardJson.shots.find((item) => item.id === shotId);
      if (!shot) {
        throw new BadRequestException("GENERATION_TASK_SHOT_NOT_IN_CONFIRMED_STORYBOARD");
      }
      const promptOverrides = this.getCandidatePromptOverrides(
        input.input?.promptOverrides,
        input.input?.visualDescriptionOverride,
      );
      const spec = createCandidateGenerationSpec({
        project,
        chapter,
        shot,
        promptOverrides,
      });
      if (hasBlockingCandidateVisualIssues(spec.visualIssues ?? [])) {
        throw new BadRequestException({
          code: "CANDIDATE_VISUAL_DESCRIPTION_BLOCKED",
          issues: spec.visualIssues?.filter((issue) => issue.severity === "blocking") ?? [],
        });
      }

      return {
        ...input,
        projectId,
        input: {
          ...createCandidateGenerationTaskInput(spec, input.input),
          ...preflightTrace,
        },
      };
    }

    return {
      ...input,
      projectId,
      input: {
        ...(input.input ?? {}),
        ...preflightTrace,
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

  private getGenerationTaskShotId(input: CreateGenerationTaskRequest): string {
    const targetShotId = input.target?.type === "shot" && typeof input.target.id === "string" ? input.target.id.trim() : "";
    const inputShotId = typeof input.input?.shotId === "string" ? input.input.shotId.trim() : "";
    const shotId = targetShotId || inputShotId;
    if (!shotId) {
      throw new BadRequestException("GENERATION_TASK_SHOT_ID_REQUIRED");
    }
    return shotId;
  }

  async getCandidateGenerationPreview(
    projectId: string,
    chapterId: string,
    shotId: string,
    promptOverrides?: CandidatePromptOverrides,
  ): Promise<CandidateGenerationPreviewResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const shot = chapter.storyboard?.storyboardJson.shots.find((item) => item.id === shotId);
    if (!shot) {
      throw new BadRequestException("GENERATION_TASK_SHOT_NOT_IN_CONFIRMED_STORYBOARD");
    }
    return {
      spec: createCandidateGenerationSpec({
        project,
        chapter,
        shot,
        promptOverrides: this.getCandidatePromptOverrides(promptOverrides),
      }),
    };
  }

  private getCandidatePromptOverrides(value: unknown, legacyVisualDescription?: unknown): CandidatePromptOverrides {
    const result: CandidatePromptOverrides = {};
    if (value !== undefined && value !== null) {
      if (typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("CANDIDATE_PROMPT_OVERRIDES_INVALID");
      const row = value as Record<string, unknown>;
      const allowed = ["visualDescription", "action", "composition"] as const;
      if (Object.keys(row).some((key) => !allowed.includes(key as typeof allowed[number]))) {
        throw new BadRequestException("CANDIDATE_PROMPT_OVERRIDES_INVALID");
      }
      for (const key of allowed) {
        const raw = row[key];
        if (raw === undefined || raw === null) continue;
        if (typeof raw !== "string" || !raw.trim() || raw.trim().length > 1_200) {
          throw new BadRequestException(`CANDIDATE_PROMPT_OVERRIDE_INVALID:${key}`);
        }
        result[key] = raw.trim();
      }
    }
    if (!result.visualDescription && legacyVisualDescription !== undefined && legacyVisualDescription !== null) {
      if (typeof legacyVisualDescription !== "string" || !legacyVisualDescription.trim() || legacyVisualDescription.trim().length > 1_200) {
        throw new BadRequestException("CANDIDATE_PROMPT_OVERRIDE_INVALID:visualDescription");
      }
      result.visualDescription = legacyVisualDescription.trim();
    }
    return result;
  }

  async savePendingChapterStoryboard(projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,) : Promise<SaveChapterStoryboardResponse> {
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "save_pending_storyboard", "/storyboard/working-copy", "旧 pending 分镜写入绕过 StoryboardVersion projection/CAS；请使用 G2 Working Copy。");
    }
    this.repository.assertDatabaseOperationSupported("save_pending_storyboard");
    return this.storyboard.savePendingChapterStoryboard(projectId, chapterId, input);
  }

  async confirmChapterStoryboard(projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryboardRequest,) : Promise<SaveChapterStoryboardResponse> {
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "confirm_storyboard", "/storyboard/working-copy/confirm", "旧分镜确认没有携带 observed pending/current/source 版本；请使用 G2 Working Copy confirm。");
    }
    this.repository.assertDatabaseOperationSupported("confirm_storyboard");
    return this.storyboard.confirmChapterStoryboard(projectId, chapterId, input);
  }

  async updateChapterStoryboard(projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,) : Promise<SaveChapterStoryboardResponse> {
    if (this.isDatabaseMode()) {
      this.throwLegacyVersioningRouteDisabled(projectId, chapterId, "update_storyboard", "/storyboard/working-copy", "旧分镜编辑会原地覆盖 confirmed document；请使用带 observed rowVersion 的 G2 Working Copy update。");
    }
    this.repository.assertDatabaseOperationSupported("update_storyboard");
    return this.storyboard.updateChapterStoryboard(projectId, chapterId, input);
  }

  async completeChapterImages(projectId: string, chapterId: string): Promise<CompleteChapterImagesResponse> {
    if (this.isDatabaseMode()) {
      if (!this.candidateDecision) throw new Error("CANDIDATE_DECISION_SERVICE_REQUIRED");
      await this.candidateDecision.complete(projectId, chapterId);
    } else {
      this.repository.assertDatabaseOperationSupported("complete_chapter_images");
    }
    return this.imageCandidate.completeChapterImages(projectId, chapterId);
  }

  async createLayoutPublication(projectId: string, chapterId: string, input: unknown): Promise<CreateLayoutPublicationResponseV1 | CreateLayoutPublicationResponseV2> {
    if (!this.layoutPublication) throw new Error("LAYOUT_PUBLICATION_SERVICE_REQUIRED");
    return this.layoutPublication.create({ projectId, chapterId }, input);
  }

  async listLayoutPublications(projectId: string, chapterId: string): Promise<LayoutPublicationHistoryResponseV1 | LayoutPublicationHistoryResponseV2> {
    if (!this.layoutPublication) throw new Error("LAYOUT_PUBLICATION_SERVICE_REQUIRED");
    return this.layoutPublication.list({ projectId, chapterId });
  }

  async getLayoutPublication(projectId: string, chapterId: string, exportRevisionId: string): Promise<LayoutPublicationSummaryV1 | LayoutPublicationSummaryV2> {
    if (!this.layoutPublication) throw new Error("LAYOUT_PUBLICATION_SERVICE_REQUIRED");
    return this.layoutPublication.get({ projectId, chapterId }, exportRevisionId);
  }

  async cancelLayoutPublication(projectId: string, chapterId: string, exportRevisionId: string) {
    if (!this.layoutPublication) throw new Error("LAYOUT_PUBLICATION_SERVICE_REQUIRED");
    return this.layoutPublication.cancel({ projectId, chapterId }, exportRevisionId);
  }

  async readLayoutPublicationArtifact(projectId: string, chapterId: string, exportRevisionId: string, assetId: string) {
    if (!this.layoutPublication) throw new Error("LAYOUT_PUBLICATION_SERVICE_REQUIRED");
    return this.layoutPublication.readArtifact({ projectId, chapterId }, exportRevisionId, assetId);
  }

  async exportAssetPackage(projectId: string, chapterId?: string): Promise<ExportAssetPackageResponse> {
    return this.assetPackage.exportAssetPackage(projectId, chapterId);
  }

  async deleteProject(projectId: string): Promise<DeleteProjectResponse> {
    if (this.isDatabaseMode()) {
      if (!this.projectDeleteOutbox) throw new BadRequestException("PROJECT_DELETE_OUTBOX_UNAVAILABLE");
      const intent = await this.projectDeleteOutbox.requestProjectDelete(projectId);
      this.repository.deleteProject(projectId);
      const deletedRuntimeStateCount = intent.status === "processed" ? this.notifyProjectDeleted(projectId) : 0;
      return {
        deletedProjectId: projectId,
        deletedTaskCount: intent.deletedTaskCount,
        deletedRuntimeStateCount,
        status: intent.status,
        cleanupEventId: intent.eventId,
      };
    }
    this.repository.assertDatabaseOperationSupported("delete_project");
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
    const sourceProject = this.isDatabaseMode()
      ? await this.repository.refreshProjectFromDatabase(projectId)
      : await this.projectStore.getReadyProject(projectId);
    const readyProject = await this.projectStore.selectCurrentChapter(sourceProject, chapterId);
    const currentChapter = this.getCurrentChapter(readyProject);
    // 文稿引用章节：正文按需从文稿库原文读取（只读投影，不落库）
    if (
      currentChapter
      && currentChapter.documentChapterId
      && currentChapter.documentWorkId
      && !currentChapter.sourceText.trim()
      && this.documentLibrary
      && this.documentLibraryStore
    ) {
      const document = await this.documentLibrary.getWorkWithChapters(currentChapter.documentWorkId);
      const documentChapter = document?.chapters.find(
        (item) => item.id === currentChapter.documentChapterId,
      );
      if (document && documentChapter) {
        const text = await this.documentLibraryStore.readChapterText(
          document.work.sourceStorageKey,
          documentChapter.startOffset,
          documentChapter.endOffset,
          document.work.sourceEncoding === "gb18030" ? "gb18030" : "utf-8",
        );
        currentChapter.sourceText = text;
      }
    }
    const sourceText = stripChapterScriptName(currentChapter?.sourceText ?? readyProject.sourceText);
    const hasStory = sourceText.trim().length > 0;
    const chapters = this.sortChapters(readyProject.chapters).map((chapter) => this.toChapterListItem(chapter));
    const currentChapterDetail = currentChapter ? this.toChapterDetail(currentChapter) : null;
    let workflow = this.buildProjectWorkflow(readyProject, currentChapter);
    let candidateSources = null;
    let candidateWorkbench: Awaited<ReturnType<CandidateDecisionService["workbench"]>> | null = null;
    if (this.isDatabaseMode() && currentChapter && this.chapterProductionQuery) {
      const dbWorkflow = await this.chapterProductionQuery.get({ projectId, chapterId: currentChapter.id });
      workflow = dbWorkflow.workflow;
      candidateSources = dbWorkflow.productionState.candidateSources ?? null;
      if (this.candidateDecision && currentChapter.storyboard) {
        candidateWorkbench = await this.candidateDecision.workbench(projectId, currentChapter.id);
      }
    }

    return {
      versioningCapability: this.isDatabaseMode()
        ? { mode: "g2_db", schemaVersion: 2, supports: { scriptWorkingCopy: true, storyWorkingCopy: true, storyboardWorkingCopy: true, preflightRevision: true, persistentTaskRuntime: true, importer: false } }
        : { mode: "legacy_file", schemaVersion: 2, supports: { scriptWorkingCopy: false, storyWorkingCopy: false, storyboardWorkingCopy: false, preflightRevision: false, persistentTaskRuntime: false, importer: false } } satisfies VersioningCapability,
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
      shots: candidateWorkbench
        ? candidateWorkbench.shots.map((shot) => ({
          ...shot,
          lockedCandidateId: shot.currentCandidateDecision.state === "finalized"
            ? shot.currentCandidateDecision.candidateId
            : null,
        }))
        : this.imageCandidate.toWorkbenchShots(currentChapter),
      candidates: candidateWorkbench
        ? candidateWorkbench.candidates.map((candidate) => ({
          ...candidate,
          palette: "",
          promptDigest: candidate.promptDigest ?? "",
          generationSpecDigest: candidate.generationSpecDigest ?? "",
        }))
        : (currentChapter?.candidates ?? []).map((item) => this.imageCandidate.toWorkbenchCandidate(item)),
      candidateSources,
      chapterLayout: currentChapter?.layout ?? null,
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

  private normalizeArtStyle(input: ArtStyle | undefined): ArtStyle {
    return wsDomain.normalizeArtStyle(input);
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

  private createDefaultChapter(projectId: string, sourceText: string, now: string): LocalChapter {
    return {
      ...wsDomain.createDefaultChapter(projectId, sourceText, now),
      id: this.repository.createChapterId(projectId, 1),
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

  private getCurrentChapter(project: LocalProject): LocalChapter | null {
    return wsDomain.getCurrentChapter(project);
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

}
