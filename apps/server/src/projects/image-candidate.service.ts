import { BadRequestException, ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
  ChapterDetail,
  ChapterListItem,
  ChapterStoryboard,
  CandidateGenerationSpec,
  CompleteChapterImagesResponse,
  GenerationTaskItem,
  LockChapterCandidateRequest,
  LockChapterCandidateResponse,
  ProjectCandidate,
  ProjectWorkflow,
  StoryboardJson,
  WorkbenchAsset,
  WorkbenchCandidate,
  WorkbenchShot,
} from "@airoaming/shared";
import { TasksService } from "../tasks/tasks.service.js";
import { TaskArtifactService } from "../tasks/task-artifact.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { createCandidateGenerationSpec } from "./candidate-generation-spec.js";
import { compileImagePromptForProvider } from "./image-prompt-profile.util.js";
import { CandidateReferenceResolver } from "./candidate-reference-resolver.js";
import { getImageAspectRatioWarning, readImageDimensions } from "./image-dimensions.util.js";
import { PrismaService } from "../persistence/prisma.service.js";

const PALETTES = ["#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be123c", "#047857"];

@Injectable()
export class ImageCandidateService {
  private readonly logger = new Logger(ImageCandidateService.name);
  private imageQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(TaskArtifactService) private readonly taskArtifactService: TaskArtifactService,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(CandidateReferenceResolver) private readonly candidateReferenceResolver: CandidateReferenceResolver,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  /** 串行执行 image_generate，降低 provider 限流概率。 */
  async runTaskSerialized(task: GenerationTaskItem): Promise<void> {
    const previous = this.imageQueue;
    let release!: () => void;
    this.imageQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await this.runImageGenerateTask(task.id);
    } finally {
      release();
    }
  }

  async runImageGenerateTask(taskId: string): Promise<void> {
    const task = this.tasksService.peek(taskId);
    if (!task || task.status === "cancelled") {
      return;
    }
    if (task.type !== "image_generate") {
      return;
    }

    try {
      await this.persistTaskArtifact(() => this.taskArtifactService.writeInput(task));
      this.tasksService.start(taskId, "image_generate_running");
      const project = await this.projectStore.getReadyProject(task.projectId);
      const chapterId = this.readString(task.input.chapterId) ?? task.target?.chapterId;
      if (!chapterId) {
        throw new BadRequestException("GENERATION_TASK_CHAPTER_ID_REQUIRED");
      }
      const chapter = this.projectStore.findChapter(project, chapterId);
      if (!chapter.storyboard) {
        throw new BadRequestException("STORYBOARD_REQUIRED");
      }
      if (!imagePreflightUtil.isChapterImagePreflightReady(project, chapter, () => false)) {
        throw new BadRequestException("IMAGE_PREFLIGHT_NOT_CONFIRMED");
      }

      const shotId = this.readString(task.input.shotId)
        ?? (task.target?.type === "shot" ? task.target.id : null);
      if (!shotId) {
        throw new BadRequestException("GENERATION_TASK_SHOT_ID_REQUIRED");
      }
      const shot = chapter.storyboard.storyboardJson.shots.find((item) => item.id === shotId);
      if (!shot) {
        throw new BadRequestException("GENERATION_TASK_SHOT_NOT_IN_CONFIRMED_STORYBOARD");
      }

      const candidateCount = this.readCandidateCount(task);
      const generationSpec = this.readCandidateGenerationSpec(task.input.candidateGenerationSpec)
        ?? createCandidateGenerationSpec({ project, chapter, shot });
      const providerType = this.imageProvider.getActiveProviderType();
      const compiledPrompt = compileImagePromptForProvider({
        providerType,
        positivePrompt: generationSpec.positivePrompt,
        negativePrompt: generationSpec.negativePrompt,
        sections: generationSpec.sections,
        systemConstraints: generationSpec.systemConstraints,
      });
      const size = this.toProviderSize(generationSpec, providerType);
      const referenceModeEnabled = process.env.AIROAMING_CANDIDATE_REFERENCE_MODE?.trim().toLowerCase() !== "off";
      const referenceResolution = referenceModeEnabled
        ? await this.candidateReferenceResolver.resolve(project, generationSpec)
        : { references: [], warnings: ["candidate_reference_mode_disabled"] };
      const generationWarnings = new Set([...generationSpec.warnings, ...referenceResolution.warnings]);
      const providerWarnings = new Set<string>();
      const providerId = this.toProviderMetaId(providerType);
      const outputFormat: "webp" | "png" = "webp";

      const createdCandidates: ProjectCandidate[] = [];
      const createdAssets: WorkbenchAsset[] = [];
      const createdOutputs: Array<Record<string, unknown>> = [];
      let nextProject = project;
      let nextChapter = chapter;

      for (let index = 1; index <= candidateCount; index += 1) {
        if (!this.tasksService.peek(taskId) || this.tasksService.get(taskId).status === "cancelled") {
          return;
        }
        this.tasksService.progress(taskId, Math.round((index - 1) / candidateCount * 80) + 10, `generating_${index}_of_${candidateCount}`);

        const providerResult = await this.imageProvider.generateCandidateImage({
          prompt: compiledPrompt.prompt,
          size,
          quality: "high",
          outputFormat,
          references: referenceResolution.references,
        });
        providerResult.warnings.forEach((warning) => providerWarnings.add(warning));
        const generated = providerResult.buffer;
        const actualSize = readImageDimensions(generated);
        const candidateWarnings = new Set([
          ...generationWarnings,
          ...providerResult.warnings,
        ]);
        const aspectRatioWarning = getImageAspectRatioWarning(generationSpec.requestedSize, actualSize);
        if (aspectRatioWarning) {
          candidateWarnings.add(aspectRatioWarning);
          providerWarnings.add(aspectRatioWarning);
        }

        this.projectStore.assertProjectStillActive(project.id);
        const candidateId = `candidate_${randomUUID()}`;
        const assetId = `asset_${randomUUID()}`;
        const fileName = `${candidateId}.${outputFormat}`;
        const relativePath = `projects/${project.id}/chapters/${chapter.slug}/candidates/${shotId}/${fileName}`;
        const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, generated);

        const now = new Date().toISOString();
        const asset: WorkbenchAsset = {
          id: assetId,
          chapterId: chapter.id,
          type: "image",
          name: `镜头 ${shot.order} 候选 ${index}`,
          path: relativePath,
          sourceTaskId: taskId,
          meta: JSON.stringify({
            shotId,
            candidateId,
            candidateIndex: index,
            provider: providerId,
            promptDigest: generationSpec.digest,
            generationPurpose: generationSpec.purpose,
            generationSpecVersion: generationSpec.schemaVersion,
            generationSpecDigest: generationSpec.digest,
            generationMode: providerResult.generationMode,
            requestedSize: generationSpec.requestedSize,
            requestedProviderSize: size,
            actualSize,
            referenceAssetIds: providerResult.usedReferenceAssetIds,
            referenceWarnings: [...generationWarnings, ...providerResult.warnings],
            warnings: [...candidateWarnings],
            createdAt: now,
          }),
        };
        const candidate: ProjectCandidate = {
          id: candidateId,
          projectId: project.id,
          chapterId: chapter.id,
          shotId,
          taskId,
          assetId,
          index,
          status: "generated",
          label: `候选 ${index}`,
          promptDigest: generationSpec.digest,
          generationPurpose: generationSpec.purpose,
          generationSpecVersion: generationSpec.schemaVersion,
          generationSpecDigest: generationSpec.digest,
          createdAt: now,
          updatedAt: now,
        };

        createdAssets.push(asset);
        createdCandidates.push(candidate);
        createdOutputs.push({
          candidateId,
          assetId,
          index,
          generationMode: providerResult.generationMode,
          requestedSize: generationSpec.requestedSize,
          actualSize,
          referenceAssetIds: providerResult.usedReferenceAssetIds,
        });

        const chapterCandidates = [...(nextChapter.candidates ?? []), candidate];
        const storyboard = this.withShotImageGenerated(nextChapter.storyboard!, shotId, now);
        nextChapter = {
          ...nextChapter,
          candidates: chapterCandidates,
          storyboard,
          updatedAt: now,
        };
        nextProject = {
          ...nextProject,
          assets: [...nextProject.assets, asset],
          chapters: nextProject.chapters.map((item) => item.id === nextChapter.id ? nextChapter : item),
          updatedAt: now,
        };
      }

      this.projectStore.assertProjectStillActive(project.id);
      await this.projectStore.writeProjectFiles(nextProject);
      this.repository.setProject(nextProject);

      const taskOutput: Record<string, unknown> = {
        provider: providerId,
        shotId,
        chapterId: chapter.id,
        candidateCount: createdCandidates.length,
        candidateIds: createdCandidates.map((item) => item.id),
        assetIds: createdAssets.map((item) => item.id),
        candidates: createdOutputs,
        generationPurpose: generationSpec.purpose,
        generationSpecVersion: generationSpec.schemaVersion,
        generationSpecDigest: generationSpec.digest,
        warnings: [...generationWarnings, ...providerWarnings],
      };
      await this.persistTaskArtifact(() => this.taskArtifactService.writeOutput(task.projectId, taskId, taskOutput));
      this.tasksService.succeed(taskId, taskOutput);
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      const latest = this.tasksService.peek(taskId);
      if (latest && (latest.status === "succeeded" || latest.status === "failed" || latest.status === "cancelled")) {
        return;
      }
      const taskError = {
        code: "IMAGE_GENERATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
      await this.persistTaskArtifact(() => this.taskArtifactService.writeError(task.projectId, taskId, taskError));
      this.tasksService.fail(taskId, taskError.code, taskError.message, taskError.retryable);
    }
  }

  async lockCandidate(
    projectId: string,
    chapterId: string,
    input: LockChapterCandidateRequest,
  ): Promise<LockChapterCandidateResponse> {
    if (this.prismaService.isDatabaseMode()) {
      throw new ConflictException({
        code: "LEGACY_WRITE_ROUTE_DISABLED",
        message: "LEGACY_WRITE_ROUTE_DISABLED",
        details: { replacement: `/api/projects/${projectId}/chapters/${chapterId}/shots/{shotId}/candidate-lock` },
      });
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_REQUIRED");
    }
    if (chapter.status !== "storyboard_done" && chapter.status !== "images_done") {
      throw new BadRequestException("CHAPTER_NOT_READY_FOR_CANDIDATE_LOCK");
    }

    const candidateId = input.candidateId?.trim();
    if (!candidateId) {
      throw new BadRequestException("CANDIDATE_ID_REQUIRED");
    }
    const candidates = [...(chapter.candidates ?? [])];
    const target = candidates.find((item) => item.id === candidateId);
    if (!target) {
      throw new BadRequestException("CANDIDATE_NOT_FOUND");
    }
    if (target.status === "rejected") {
      throw new BadRequestException("CANDIDATE_REJECTED");
    }

    const now = new Date().toISOString();
    const nextCandidates = candidates;

    const nextStoryboardJson: StoryboardJson = {
      ...chapter.storyboard.storyboardJson,
      shots: chapter.storyboard.storyboardJson.shots.map((shot) => {
        if (shot.id !== target.shotId) {
          return shot;
        }
        return {
          ...shot,
          lockedCandidateId: target.id,
          status: "locked",
        };
      }),
      // 旧 file projection 只改 Shot 决策，不再把 Candidate.status 当当前定稿；
      // 不更新 storyboardJson.updatedAt,避免让已确认的 preflight 因时间戳不匹配而误失效。
    };
    const nextStoryboard: ChapterStoryboard = {
      ...chapter.storyboard,
      storyboardJson: nextStoryboardJson,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      candidates: nextCandidates,
      storyboard: nextStoryboard,
      // 锁定过程不自动完成章节；仍停留 storyboard_done 直到用户完成本章候选图
      status: chapter.status === "images_done" ? "images_done" : "storyboard_done",
      updatedAt: now,
    };
    const nextProject: LocalProject = {
      ...project,
      chapters: project.chapters.map((item) => item.id === nextChapter.id ? nextChapter : item),
      updatedAt: now,
    };

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    const locked = nextCandidates.find((item) => item.id === target.id)!;
    return {
      candidate: this.toWorkbenchCandidate(locked),
      candidates: nextCandidates.map((item) => this.toWorkbenchCandidate(item)),
      shots: this.toWorkbenchShots(nextChapter),
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      storyboard: nextStoryboard,
      assets: nextProject.assets,
    };
  }

  async completeChapterImages(projectId: string, chapterId: string): Promise<CompleteChapterImagesResponse> {
    if (this.prismaService.isDatabaseMode()) {
      const project = await this.repository.refreshProjectFromDatabase(projectId);
      const chapter = project.chapters.find((item) => item.id === chapterId);
      if (!chapter?.storyboard) throw new BadRequestException("STORYBOARD_REQUIRED");
      if (!chapter.imagePreflight?.preflightJson.ready || chapter.imagePreflight.sourceStoryboardId !== chapter.storyboard.id) throw new BadRequestException("IMAGE_PREFLIGHT_NOT_CONFIRMED");
      const shots = chapter.storyboard.storyboardJson.shots;
      if (shots.length === 0) throw new BadRequestException("STORYBOARD_EMPTY");
      const unlocked = shots.filter((shot) => !shot.lockedCandidateId);
      if (unlocked.length > 0) throw new BadRequestException({ code: "CHAPTER_CANDIDATES_NOT_FULLY_LOCKED", message: `还有 ${unlocked.length} 个镜头未锁定候选图`, details: { unlockedShotIds: unlocked.map((shot) => shot.id) } });
      const db = this.prismaService.database();
      const row = await db.chapter.findFirst({ where: { id: chapterId, projectId } });
      if (!row) throw new BadRequestException("CHAPTER_NOT_FOUND");
      if (!["images_done", "layout_done", "exported"].includes(row.milestoneStatus)) throw new ConflictException("CANDIDATE_DECISION_COMPLETE_REQUIRED");
      const nextProject = await this.repository.refreshProjectFromDatabase(projectId);
      const nextChapter = nextProject.chapters.find((item) => item.id === chapterId);
      if (!nextChapter) throw new BadRequestException("CHAPTER_NOT_FOUND");
      return { chapter: wsDomain.toChapterDetail(nextChapter), chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)), candidates: (nextChapter.candidates ?? []).map((item) => this.toWorkbenchCandidate(item)), shots: this.toWorkbenchShots(nextChapter), storyboard: nextChapter.storyboard, workflow: this.buildWorkflow(nextProject, nextChapter) };
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_REQUIRED");
    }
    if (!imagePreflightUtil.isChapterImagePreflightReady(project, chapter, () => false)) {
      throw new BadRequestException("IMAGE_PREFLIGHT_NOT_CONFIRMED");
    }

    const shots = chapter.storyboard.storyboardJson.shots;
    if (shots.length === 0) {
      throw new BadRequestException("STORYBOARD_EMPTY");
    }
    const unlocked = shots.filter((shot) => !shot.lockedCandidateId);
    if (unlocked.length > 0) {
      throw new BadRequestException({
        code: "CHAPTER_CANDIDATES_NOT_FULLY_LOCKED",
        message: `还有 ${unlocked.length} 个镜头未锁定候选图`,
        details: { unlockedShotIds: unlocked.map((shot) => shot.id) },
      });
    }

    const now = new Date().toISOString();
    const nextChapter: LocalChapter = {
      ...chapter,
      status: "images_done",
      updatedAt: now,
      completedAt: chapter.completedAt ?? now,
    };
    const nextProject: LocalProject = {
      ...project,
      chapters: project.chapters.map((item) => item.id === nextChapter.id ? nextChapter : item),
      updatedAt: now,
    };
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    const workflow = this.buildWorkflow(nextProject, nextChapter);
    return {
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      candidates: (nextChapter.candidates ?? []).map((item) => this.toWorkbenchCandidate(item)),
      shots: this.toWorkbenchShots(nextChapter),
      storyboard: nextChapter.storyboard,
      workflow,
    };
  }

  toWorkbenchCandidate(candidate: ProjectCandidate): WorkbenchCandidate {
    return {
      id: candidate.id,
      chapterId: candidate.chapterId,
      shotId: candidate.shotId,
      label: candidate.label,
      status: candidate.status,
      assetId: candidate.assetId,
      taskId: candidate.taskId,
      index: candidate.index,
      palette: PALETTES[(candidate.index - 1) % PALETTES.length] ?? PALETTES[0],
      promptDigest: candidate.promptDigest,
      generationPurpose: candidate.generationPurpose ?? "legacy_unspecified",
      generationSpecVersion: candidate.generationSpecVersion ?? null,
      generationSpecDigest: candidate.generationSpecDigest ?? candidate.promptDigest,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    };
  }

  toWorkbenchShots(chapter: LocalChapter | null): WorkbenchShot[] {
    if (!chapter?.storyboard) {
      return [];
    }
    const sceneNameById = new Map(
      (chapter.storyStructure?.structureJson.scenes ?? []).map((scene) => [scene.id, scene.name]),
    );
    const characterNameById = new Map(
      (chapter.storyStructure?.structureJson.characters ?? []).map((character) => [character.id, character.name]),
    );
    return [...chapter.storyboard.storyboardJson.shots]
      .sort((left, right) => left.order - right.order)
      .map((shot) => ({
        id: shot.id,
        chapterId: chapter.id,
        order: shot.order,
        beatId: shot.beatId,
        sceneId: shot.sceneId,
        sceneName: (shot.sceneId ? sceneNameById.get(shot.sceneId) : null) ?? "",
        characterIds: shot.characterIds,
        characters: shot.characterIds.map((id) => characterNameById.get(id) ?? id),
        coreAction: shot.coreAction,
        emotion: shot.emotion,
        comic: shot.comic,
        motion: shot.motion,
        promptDraft: shot.promptDraft,
        status: shot.status,
        lockedCandidateId: shot.lockedCandidateId,
      }));
  }

  buildWorkflow(project: LocalProject, chapter: LocalChapter | null): ProjectWorkflow {
    const isPreflightReady = chapter
      ? imagePreflightUtil.isChapterImagePreflightReady(project, chapter, () => false)
      : false;
    return workflowUtil.buildProjectWorkflow(project, chapter, isPreflightReady);
  }

  private withShotImageGenerated(storyboard: ChapterStoryboard, shotId: string, _now: string): ChapterStoryboard {
    // 候选图生成只更新 shot.status(draft→image_generated),不改变分镜内容;
    // 因此不更新 storyboard.updatedAt,避免让已确认的 preflight 记录因时间戳不匹配而误失效。
    return {
      ...storyboard,
      storyboardJson: {
        ...storyboard.storyboardJson,
        shots: storyboard.storyboardJson.shots.map((shot) => {
          if (shot.id !== shotId) {
            return shot;
          }
          if (shot.lockedCandidateId) {
            return shot;
          }
          return {
            ...shot,
            status: shot.status === "locked" ? "locked" : "image_generated",
          };
        }),
      },
    };
  }

  private readCandidateCount(task: GenerationTaskItem): number {
    const fromInput = Number(task.input.candidateCount);
    const fromOptions = Number((task.input as { options?: { candidateCount?: unknown } }).options?.candidateCount);
    // options live on Create request; for controlled tasks check task.input only
    const raw = Number.isFinite(fromInput) && fromInput > 0
      ? fromInput
      : Number.isFinite(fromOptions) && fromOptions > 0
        ? fromOptions
        : 1;
    return Math.min(6, Math.max(1, Math.floor(raw)));
  }

  private readCandidateGenerationSpec(value: unknown): CandidateGenerationSpec | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const record = value as Partial<CandidateGenerationSpec>;
    if (
      record.schemaVersion !== 2
      || record.sizePolicyVersion !== "legacy_generation_default_v1"
      || record.purpose !== "shot_clean_plate"
      || typeof record.projectId !== "string"
      || typeof record.chapterId !== "string"
      || typeof record.shotId !== "string"
      || typeof record.positivePrompt !== "string"
      || typeof record.negativePrompt !== "string"
      || typeof record.digest !== "string"
      || !record.requestedSize
      || !Array.isArray(record.references)
      || !Array.isArray(record.sections)
      || !Array.isArray(record.systemConstraints)
      || !Array.isArray(record.warnings)
    ) {
      return null;
    }
    return record as CandidateGenerationSpec;
  }

  private toProviderSize(
    spec: CandidateGenerationSpec,
    providerType: "openai" | "doubao" | "grok",
  ): string {
    const { width, height } = spec.requestedSize;
    return `${width}x${height}`;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private toProviderMetaId(providerType: "openai" | "doubao" | "grok"): string {
    if (providerType === "doubao") return "doubao_image";
    if (providerType === "grok") return "grok_image";
    return "openai_image";
  }

  private async persistTaskArtifact(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      this.logger.warn(`TASK_ARTIFACT_WRITE_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// re-export helpers used by response builders
export type ChapterCandidateResponseFields = {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
};
