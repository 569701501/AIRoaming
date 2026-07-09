import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
  ChapterDetail,
  ChapterListItem,
  ChapterStoryboard,
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
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";

const PALETTES = ["#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be123c", "#047857"];

@Injectable()
export class ImageCandidateService {
  private readonly logger = new Logger(ImageCandidateService.name);
  private imageQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
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
      const prompt = this.readString(task.input.positivePrompt)
        || shot.promptDraft
        || shot.comic.panelDescription
        || shot.coreAction
        || "comic panel illustration";
      const negativePrompt = this.readString(task.input.negativePrompt)
        || "low quality, blurry, photorealistic live-action";
      const fullPrompt = `${prompt}\n\nAvoid: ${negativePrompt}`;
      const size = this.readImageSize(task);
      const referenceAssetIds = this.readStringArray(task.input.referenceAssetIds)
        .concat(this.readStringArray(task.input.preflightCharacterReferenceAssetIds));
      const referenceSource = await this.resolveReferenceImage(project, referenceAssetIds);
      const providerType = this.imageProvider.getActiveProviderType();
      const outputFormat: "webp" | "png" = "webp";

      const createdCandidates: ProjectCandidate[] = [];
      const createdAssets: WorkbenchAsset[] = [];
      let nextProject = project;
      let nextChapter = chapter;

      for (let index = 1; index <= candidateCount; index += 1) {
        if (!this.tasksService.peek(taskId) || this.tasksService.get(taskId).status === "cancelled") {
          return;
        }
        this.tasksService.progress(taskId, Math.round((index - 1) / candidateCount * 80) + 10, `generating_${index}_of_${candidateCount}`);

        const generated = referenceSource
          ? await this.imageProvider.editImage({
            prompt: fullPrompt,
            size,
            quality: "high",
            outputFormat,
            referenceImage: referenceSource,
          })
          : await this.imageProvider.generateImage({
            prompt: fullPrompt,
            size,
            quality: "high",
            outputFormat,
          });

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
            provider: providerType === "doubao" ? "doubao_image" : "openai_image",
            promptDigest: this.digestPrompt(fullPrompt),
            generationMode: referenceSource ? "image_edit" : "image_generation",
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
          promptDigest: this.digestPrompt(fullPrompt),
          createdAt: now,
          updatedAt: now,
        };

        createdAssets.push(asset);
        createdCandidates.push(candidate);

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

      this.tasksService.succeed(taskId, {
        provider: providerType === "doubao" ? "doubao_image" : "openai_image",
        shotId,
        chapterId: chapter.id,
        candidateCount: createdCandidates.length,
        candidateIds: createdCandidates.map((item) => item.id),
        assetIds: createdAssets.map((item) => item.id),
      });
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      const latest = this.tasksService.peek(taskId);
      if (latest && (latest.status === "succeeded" || latest.status === "failed" || latest.status === "cancelled")) {
        return;
      }
      this.tasksService.fail(
        taskId,
        "IMAGE_GENERATE_FAILED",
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  async lockCandidate(
    projectId: string,
    chapterId: string,
    input: LockChapterCandidateRequest,
  ): Promise<LockChapterCandidateResponse> {
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
    const nextCandidates = candidates.map((item) => {
      if (item.id === target.id) {
        return { ...item, status: "locked" as const, updatedAt: now };
      }
      if (item.shotId === target.shotId && item.status === "locked") {
        return { ...item, status: "generated" as const, updatedAt: now };
      }
      return item;
    });

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
      updatedAt: now,
    };
    const nextStoryboard: ChapterStoryboard = {
      ...chapter.storyboard,
      storyboardJson: nextStoryboardJson,
      updatedAt: now,
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

  private withShotImageGenerated(storyboard: ChapterStoryboard, shotId: string, now: string): ChapterStoryboard {
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
        updatedAt: now,
      },
      updatedAt: now,
    };
  }

  private async resolveReferenceImage(
    project: LocalProject,
    assetIds: string[],
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
    for (const assetId of assetIds) {
      const asset = project.assets.find((item) => item.id === assetId);
      if (!asset?.path) {
        continue;
      }
      try {
        const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${asset.path}`);
        const buffer = await readFile(absolutePath);
        const ext = path.extname(absolutePath).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
        return {
          buffer,
          mimeType,
          fileName: path.basename(absolutePath),
        };
      } catch {
        // try next reference
      }
    }
    return null;
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

  private readImageSize(task: GenerationTaskItem): string {
    const image = task.input.image;
    if (image && typeof image === "object" && !Array.isArray(image)) {
      const size = (image as { size?: unknown }).size;
      if (typeof size === "string" && size.trim()) {
        return size.trim();
      }
    }
    return this.imageProvider.getActiveProviderType() === "doubao" ? "1440x2560" : "1024x1536";
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  private digestPrompt(prompt: string): string {
    return createHash("sha1").update(prompt).digest("hex").slice(0, 12);
  }
}

// re-export helpers used by response builders
export type ChapterCandidateResponseFields = {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
};
