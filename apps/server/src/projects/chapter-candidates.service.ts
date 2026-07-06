import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  type CandidatesJson,
  type ChapterCandidateItem,
  type ChapterCandidateShotEntry,
  type ChapterCandidates,
  type DiscardShotCandidateRequest,
  type GenerateShotCandidatesRequest,
  type GenerateShotCandidatesResponse,
  type GenerationTaskItem,
  type GetChapterCandidatesResponse,
  type LockShotCandidateRequest,
  type ProjectCharacter,
  type SaveChapterCandidatesResponse,
  type ShotPromptSnapshot,
  type SkipShotCandidateRequest,
  type StoryboardShot,
  type UpdateShotPromptOverrideRequest,
  type WorkbenchAsset,
  buildShotImagePrompt,
  createEmptyCandidatesJson,
  getPendingCandidateShotIds,
  normalizeCandidatesJson,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as wsJson from "./workspace-json.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { ImageTaskQueue } from "./image-task-queue.service.js";

const CHARACTER_LEVEL_PRIORITY: Record<string, number> = { lead: 0, recurring: 1, chapter: 2, minor: 3, extra: 4 };
const DEFAULT_CANDIDATE_COUNT = 2;
const MAX_CANDIDATE_COUNT = 4;

/**
 * 候选图工作台编排（见 2026-07-06_候选图工作台MVP方案）。
 *
 * 边界：
 * - storyboard.json 只读；锁定/跳过/候选清单全部落 chapters/{slug}/candidates.json。
 * - candidates.json 不进 LocalChapter/项目保存周期，由本 service 直接读写（避免双写）。
 * - 确认时才碰 chapter.status（→ images_done），走 projectStore 正常写盘。
 */
@Injectable()
export class ChapterCandidatesService {
  private readonly logger = new Logger(ChapterCandidatesService.name);

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(CharacterReferenceService) private readonly characterRef: CharacterReferenceService,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(ImageTaskQueue) private readonly imageQueue: ImageTaskQueue,
  ) {}

  // ====== 读 ======

  async getChapterCandidates(projectId: string, chapterId: string): Promise<GetChapterCandidatesResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const doc = await this.readCandidatesJson(project.id, chapter);
    if (!chapter.storyboard) {
      return { candidates: doc ? this.toChapterCandidates(project.id, chapter, doc) : null, promptPreviews: {} };
    }
    const effective = doc ?? this.createDocForChapter(chapter);
    const promptPreviews: Record<string, ShotPromptSnapshot> = {};
    for (const shot of chapter.storyboard.storyboardJson.shots) {
      const entry = effective.shots.find((item) => item.shotId === shot.id);
      promptPreviews[shot.id] = this.buildPromptSnapshot(project, chapter, shot, entry?.userPromptOverride ?? null);
    }
    return { candidates: this.toChapterCandidates(project.id, chapter, effective), promptPreviews };
  }

  // ====== prompt override ======

  async updateShotPromptOverride(
    projectId: string,
    chapterId: string,
    shotId: string,
    input: UpdateShotPromptOverrideRequest,
  ): Promise<GetChapterCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    this.assertShotInStoryboard(chapter, shotId);
    const doc = (await this.readCandidatesJson(project.id, chapter)) ?? this.createDocForChapter(chapter);
    this.assertDocEditable(doc);
    const entry = this.ensureShotEntry(doc, shotId);
    const trimmed = typeof input.userPromptOverride === "string" ? input.userPromptOverride : null;
    entry.userPromptOverride = trimmed && trimmed.trim() ? trimmed : null;
    await this.writeCandidatesJson(project.id, chapter, doc);
    return this.getChapterCandidates(projectId, chapterId);
  }

  // ====== 生成 ======

  async generateShotCandidates(
    projectId: string,
    chapterId: string,
    shotId: string,
    input: GenerateShotCandidatesRequest = {},
  ): Promise<GenerateShotCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    const storyboard = chapter.storyboard!;
    const shot = this.assertShotInStoryboard(chapter, shotId);
    const imagePreflight = chapter.imagePreflight;
    if (!imagePreflight || !imagePreflightUtil.isChapterImagePreflightReady(
      project,
      chapter,
      (pid, cid) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, "final_reference"),
    )) {
      throw new BadRequestException("IMAGE_PREFLIGHT_NOT_CONFIRMED");
    }

    const existing = this.findActiveShotCandidateTask(project.id, chapter.id, shotId);
    if (existing) {
      const doc = (await this.readCandidatesJson(project.id, chapter)) ?? this.createDocForChapter(chapter);
      return { task: existing, candidates: this.toChapterCandidates(project.id, chapter, doc) };
    }

    const doc = (await this.readCandidatesJson(project.id, chapter)) ?? this.createDocForChapter(chapter);
    this.assertDocEditable(doc);
    const entry = this.ensureShotEntry(doc, shotId);
    const candidateCount = this.normalizeCandidateCount(input.candidateCount);
    const snapshot = this.buildPromptSnapshot(project, chapter, shot, entry.userPromptOverride);
    const referenceAssetIds = this.resolveShotReferenceAssetIds(project, chapter, shot);

    const task = this.tasksService.createControlled({
      projectId: project.id,
      type: "image_generate",
      target: { type: "shot", id: shotId, chapterId: chapter.id },
      input: {
        chapterId: chapter.id,
        shotId,
        imagePreflightId: imagePreflight.id,
        sourceStoryboardId: storyboard.id,
        sourceStoryboardUpdatedAt: storyboard.updatedAt,
        positivePrompt: snapshot.finalPrompt,
        promptSnapshot: { ...snapshot },
        referenceAssetIds,
        candidateCount,
      },
      options: { provider: this.imageProvider.getActiveProviderType() === "doubao" ? "doubao_image" : "openai_image" },
    });

    await this.writeCandidatesJson(project.id, chapter, doc);
    this.imageQueue.enqueue(() => this.runShotCandidateTask(task.id, project.id, chapter.id, shotId, snapshot, referenceAssetIds, candidateCount));
    return { task, candidates: this.toChapterCandidates(project.id, chapter, doc) };
  }

  private async runShotCandidateTask(
    taskId: string,
    projectId: string,
    chapterId: string,
    shotId: string,
    snapshot: ShotPromptSnapshot,
    referenceAssetIds: string[],
    candidateCount: number,
  ): Promise<void> {
    const current = this.tasksService.peek(taskId);
    if (!current || current.status === "cancelled") {
      return;
    }
    this.tasksService.start(taskId, "image_provider_running");
    const generatedCandidateIds: string[] = [];
    try {
      for (let index = 0; index < candidateCount; index += 1) {
        const latest = this.tasksService.peek(taskId);
        if (!latest || latest.status === "cancelled") {
          return;
        }
        const candidateId = await this.generateSingleCandidate(taskId, projectId, chapterId, shotId, snapshot, referenceAssetIds);
        generatedCandidateIds.push(candidateId);
        this.tasksService.progress(taskId, Math.round(((index + 1) / candidateCount) * 90) + 5, "image_provider_running");
      }
      this.tasksService.succeed(taskId, { chapterId, shotId, candidateIds: generatedCandidateIds, candidateCount: generatedCandidateIds.length });
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Shot candidate task failed (${shotId}): ${message}`);
      this.tasksService.fail(taskId, "IMAGE_GENERATE_FAILED", message, true, {
        generatedCandidateIds,
        warning: generatedCandidateIds.length > 0 ? "PARTIAL_CANDIDATES_KEPT" : undefined,
      });
    }
  }

  /** 生成单张候选：出图 → 写盘 → 注册 asset → 追加进 candidates.json（逐张落盘，失败保留已成功部分）。 */
  private async generateSingleCandidate(
    taskId: string,
    projectId: string,
    chapterId: string,
    shotId: string,
    snapshot: ShotPromptSnapshot,
    referenceAssetIds: string[],
  ): Promise<string> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const providerType = this.imageProvider.getActiveProviderType();
    const size = providerType === "doubao" ? "1920x1920" : "1024x1536";
    const referenceAsset = referenceAssetIds.length > 0
      ? project.assets.find((asset) => asset.id === referenceAssetIds[0]) ?? null
      : null;
    const generated = referenceAsset
      ? await this.imageProvider.editImage({
        prompt: snapshot.finalPrompt,
        size,
        referenceImage: await this.readProjectAssetFile(project, referenceAsset),
        outputFormat: "png",
      })
      : await this.imageProvider.generateImage({ prompt: snapshot.finalPrompt, size, outputFormat: "png" });

    this.projectStore.assertProjectStillActive(projectId);
    const doc = (await this.readCandidatesJson(projectId, chapter)) ?? this.createDocForChapter(chapter);
    const entry = this.ensureShotEntry(doc, shotId);
    const candidateId = `candidate_${String(this.countShotCandidates(doc, shotId) + 1).padStart(3, "0")}_${randomUUID().slice(0, 8)}`;
    const relativePath = `projects/${projectId}/chapters/${chapter.slug}/candidates/${shotId}/${candidateId}.png`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated);

    const now = new Date().toISOString();
    const asset: WorkbenchAsset = {
      id: `asset_${randomUUID()}`,
      chapterId: chapter.id,
      type: "image",
      name: `候选图 ${shotId}/${candidateId}`,
      path: relativePath,
      sourceTaskId: taskId,
      meta: JSON.stringify({ chapterId: chapter.id, shotId, candidateId, provider: providerType === "doubao" ? "doubao_image" : "openai_image", createdAt: now }),
    };
    const candidate: ChapterCandidateItem = {
      id: candidateId,
      taskId,
      assetPath: relativePath,
      status: "generated",
      promptSnapshot: { ...snapshot },
      referenceAssetIds,
      sourceStoryboardUpdatedAt: chapter.storyboard?.updatedAt ?? null,
      createdAt: now,
    };
    entry.candidates.push(candidate);
    await this.writeCandidatesJson(projectId, chapter, doc);

    const nextProject: LocalProject = { ...project, assets: [...project.assets, asset], updatedAt: now };
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return candidateId;
  }

  // ====== 锁定 / 跳过 / 废弃 ======

  async lockShotCandidate(projectId: string, chapterId: string, shotId: string, input: LockShotCandidateRequest): Promise<GetChapterCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    this.assertShotInStoryboard(chapter, shotId);
    const doc = await this.requireCandidatesJson(project.id, chapter);
    this.assertDocEditable(doc);
    const entry = this.ensureShotEntry(doc, shotId);
    const candidateId = input.candidateId?.trim();
    const candidate = entry.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new NotFoundException("SHOT_CANDIDATE_NOT_FOUND");
    }
    if (candidate.status !== "generated") {
      throw new BadRequestException("SHOT_CANDIDATE_DISCARDED");
    }
    entry.decision = "locked";
    entry.lockedCandidateId = candidate.id;
    entry.skipNote = "";
    await this.writeCandidatesJson(project.id, chapter, doc);
    return this.getChapterCandidates(projectId, chapterId);
  }

  async skipShot(projectId: string, chapterId: string, shotId: string, input: SkipShotCandidateRequest = {}): Promise<GetChapterCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    this.assertShotInStoryboard(chapter, shotId);
    const doc = (await this.readCandidatesJson(project.id, chapter)) ?? this.createDocForChapter(chapter);
    this.assertDocEditable(doc);
    const entry = this.ensureShotEntry(doc, shotId);
    entry.decision = "skipped";
    entry.lockedCandidateId = null;
    entry.skipNote = input.note?.trim() ?? "";
    await this.writeCandidatesJson(project.id, chapter, doc);
    return this.getChapterCandidates(projectId, chapterId);
  }

  /** 锁定/跳过回退到 pending（UI 反悄用）。 */
  async resetShotDecision(projectId: string, chapterId: string, shotId: string): Promise<GetChapterCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    this.assertShotInStoryboard(chapter, shotId);
    const doc = await this.requireCandidatesJson(project.id, chapter);
    this.assertDocEditable(doc);
    const entry = this.ensureShotEntry(doc, shotId);
    entry.decision = "pending";
    entry.lockedCandidateId = null;
    entry.skipNote = "";
    await this.writeCandidatesJson(project.id, chapter, doc);
    return this.getChapterCandidates(projectId, chapterId);
  }

  async discardShotCandidate(projectId: string, chapterId: string, shotId: string, input: DiscardShotCandidateRequest): Promise<GetChapterCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    this.assertShotInStoryboard(chapter, shotId);
    const doc = await this.requireCandidatesJson(project.id, chapter);
    this.assertDocEditable(doc);
    const entry = this.ensureShotEntry(doc, shotId);
    const candidate = entry.candidates.find((item) => item.id === input.candidateId?.trim());
    if (!candidate) {
      throw new NotFoundException("SHOT_CANDIDATE_NOT_FOUND");
    }
    candidate.status = "discarded";
    if (entry.lockedCandidateId === candidate.id) {
      entry.decision = "pending";
      entry.lockedCandidateId = null;
    }
    await this.writeCandidatesJson(project.id, chapter, doc);
    return this.getChapterCandidates(projectId, chapterId);
  }

  // ====== 确认 → images_done ======

  async confirmChapterCandidates(projectId: string, chapterId: string): Promise<SaveChapterCandidatesResponse> {
    const { project, chapter } = await this.getChapterWithConfirmedStoryboard(projectId, chapterId);
    const storyboard = chapter.storyboard!;
    const doc = await this.requireCandidatesJson(project.id, chapter);
    if (doc.sourceStoryboardId !== storyboard.id || doc.sourceStoryboardUpdatedAt !== storyboard.updatedAt) {
      throw new BadRequestException("CANDIDATES_STORYBOARD_OUTDATED");
    }
    const shotIds = storyboard.storyboardJson.shots.map((shot) => shot.id);
    const pending = getPendingCandidateShotIds(doc, shotIds);
    if (pending.length > 0) {
      throw new BadRequestException(`CANDIDATES_SHOTS_PENDING:${pending.join(",")}`);
    }
    if (this.hasActiveChapterCandidateTask(project.id, chapter.id)) {
      throw new BadRequestException("CANDIDATES_TASKS_RUNNING");
    }

    const now = new Date().toISOString();
    doc.status = "confirmed";
    doc.confirmedAt = now;
    await this.writeCandidatesJson(project.id, chapter, doc);

    const nextChapter: LocalChapter = { ...chapter, status: "images_done", updatedAt: now };
    const nextProject = this.projectStore.withUpdatedChapter({ ...project, currentChapterId: nextChapter.id, updatedAt: now }, nextChapter);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      candidates: this.toChapterCandidates(project.id, nextChapter, doc),
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }

  // ====== 内部：prompt / 参考图 ======

  private buildPromptSnapshot(
    project: LocalProject,
    chapter: LocalChapter,
    shot: StoryboardShot,
    userPromptOverride: string | null,
  ): ShotPromptSnapshot {
    const characters = this.resolveShotCharacters(project, shot);
    const scenes = chapter.storyStructure?.structureJson.scenes ?? [];
    const scene = shot.sceneId ? scenes.find((item) => item.id === shot.sceneId) ?? null : null;
    return buildShotImagePrompt({
      systemTemplate: this.settingsService.getRuntimeImagePromptTemplate(),
      style: {
        comicFormatLabel: wsDomain.getComicFormatLabel(project.comicFormat),
        artStyleLabel: wsDomain.getArtStyleLabel(project.artStyle),
      },
      shot,
      characters: characters.map((character) => ({
        name: character.name,
        appearance: character.appearance,
        promptFragment: character.promptFragment,
      })),
      scene: scene ? { name: scene.name, location: scene.location, timeOfDay: scene.timeOfDay, atmosphere: scene.atmosphere } : null,
      userPromptOverride,
    });
  }

  /** 出场角色按 lead > recurring > chapter > minor > extra 排序。 */
  private resolveShotCharacters(project: LocalProject, shot: StoryboardShot): ProjectCharacter[] {
    const byId = new Map(project.characters.map((character) => [character.id, character] as const));
    return shot.characterIds
      .map((id) => byId.get(id))
      .filter((character): character is ProjectCharacter => Boolean(character))
      .sort((left, right) => (CHARACTER_LEVEL_PRIORITY[left.level] ?? 9) - (CHARACTER_LEVEL_PRIORITY[right.level] ?? 9));
  }

  /**
   * 单参考图策略（方案 Q3）：取最重要出场角色在 preflight 中登记的可用参考图；
   * 数组完整记录供追溯，worker 只消费第 1 张；空镜返回空数组（纯文生图）。
   */
  private resolveShotReferenceAssetIds(project: LocalProject, chapter: LocalChapter, shot: StoryboardShot): string[] {
    const checks = chapter.imagePreflight?.preflightJson.characterChecks ?? [];
    const readyByCharacterId = new Map(
      checks.filter((check) => check.referenceReady && check.referenceAssetId).map((check) => [check.characterId, check.referenceAssetId as string] as const),
    );
    const ids: string[] = [];
    for (const character of this.resolveShotCharacters(project, shot)) {
      const assetId = readyByCharacterId.get(character.id)
        ?? (character.primaryReferenceKind === "final_reference" ? character.primaryReferenceAssetId : null);
      if (assetId && !ids.includes(assetId)) {
        ids.push(assetId);
      }
    }
    return ids;
  }

  private async readProjectAssetFile(project: Pick<LocalProject, "id">, asset: WorkbenchAsset): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const safePath = asset.path.replace(/^\/+/, "");
    if (!safePath.startsWith(`projects/${project.id}/`)) {
      throw new BadRequestException("PROJECT_ASSET_PATH_INVALID");
    }
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${safePath}`);
    const extension = path.extname(safePath).toLowerCase();
    const mimeType = extension === ".webp" ? "image/webp" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
    return { buffer: await readFile(absolutePath), mimeType, fileName: path.basename(safePath) };
  }

  // ====== 内部：文档读写与校验 ======

  private candidatesJsonPath(projectId: string, chapter: LocalChapter): string {
    return this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}/chapters/${chapter.slug}/candidates.json`);
  }

  private async readCandidatesJson(projectId: string, chapter: LocalChapter): Promise<CandidatesJson | null> {
    const raw = await wsJson.readOptionalTextFile(this.candidatesJsonPath(projectId, chapter));
    if (raw === null) {
      return null;
    }
    try {
      return normalizeCandidatesJson(JSON.parse(raw));
    } catch (error) {
      this.logger.warn(`candidates.json parse failed (${chapter.slug}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async requireCandidatesJson(projectId: string, chapter: LocalChapter): Promise<CandidatesJson> {
    const doc = await this.readCandidatesJson(projectId, chapter);
    if (!doc) {
      throw new NotFoundException("CHAPTER_CANDIDATES_NOT_FOUND");
    }
    return doc;
  }

  private async writeCandidatesJson(projectId: string, chapter: LocalChapter, doc: CandidatesJson): Promise<void> {
    doc.updatedAt = new Date().toISOString();
    const filePath = this.candidatesJsonPath(projectId, chapter);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }

  private createDocForChapter(chapter: LocalChapter): CandidatesJson {
    return createEmptyCandidatesJson({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceStoryboardId: chapter.storyboard?.id ?? null,
      sourceStoryboardUpdatedAt: chapter.storyboard?.updatedAt ?? null,
    });
  }

  private toChapterCandidates(projectId: string, chapter: LocalChapter, doc: CandidatesJson): ChapterCandidates {
    // 分镜重新确认后 sourceStoryboardId/updatedAt 漂移：标记 out-of-sync，不删历史候选（方案 Q6）。
    const storyboardInSync = Boolean(
      chapter.storyboard
      && doc.sourceStoryboardId === chapter.storyboard.id
      && doc.sourceStoryboardUpdatedAt === chapter.storyboard.updatedAt,
    );
    return {
      id: `${chapter.id}_candidates`,
      projectId,
      chapterId: chapter.id,
      candidatesPath: `projects/${projectId}/chapters/${chapter.slug}/candidates.json`,
      candidatesJson: doc,
      storyboardInSync,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private async getChapterWithConfirmedStoryboard(projectId: string, chapterId: string): Promise<{ project: LocalProject; chapter: LocalChapter }> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }
    return { project, chapter };
  }

  private assertShotInStoryboard(chapter: LocalChapter, shotId: string): StoryboardShot {
    const shot = chapter.storyboard?.storyboardJson.shots.find((item) => item.id === shotId);
    if (!shot) {
      throw new BadRequestException("GENERATION_TASK_SHOT_NOT_IN_CONFIRMED_STORYBOARD");
    }
    return shot;
  }

  /** 分镜变更后新建文档会指向新分镜；已确认文档不可再编辑（需回退章节状态后重开，MVP 不做）。 */
  private assertDocEditable(doc: CandidatesJson): void {
    if (doc.status === "confirmed") {
      throw new BadRequestException("CANDIDATES_ALREADY_CONFIRMED");
    }
  }

  private ensureShotEntry(doc: CandidatesJson, shotId: string): ChapterCandidateShotEntry {
    const existing = doc.shots.find((entry) => entry.shotId === shotId);
    if (existing) {
      return existing;
    }
    const entry: ChapterCandidateShotEntry = {
      shotId,
      decision: "pending",
      lockedCandidateId: null,
      skipNote: "",
      userPromptOverride: null,
      candidates: [],
    };
    doc.shots.push(entry);
    return entry;
  }

  private countShotCandidates(doc: CandidatesJson, shotId: string): number {
    return doc.shots.find((entry) => entry.shotId === shotId)?.candidates.length ?? 0;
  }

  private normalizeCandidateCount(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_CANDIDATE_COUNT;
    }
    return Math.min(MAX_CANDIDATE_COUNT, Math.max(1, Math.round(value)));
  }

  private findActiveShotCandidateTask(projectId: string, chapterId: string, shotId: string): GenerationTaskItem | null {
    return this.tasksService.list().find((task) =>
      task.projectId === projectId
      && task.type === "image_generate"
      && task.target?.type === "shot"
      && task.target.id === shotId
      && task.target.chapterId === chapterId
      && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
    ) ?? null;
  }

  private hasActiveChapterCandidateTask(projectId: string, chapterId: string): boolean {
    return this.tasksService.list().some((task) =>
      task.projectId === projectId
      && task.type === "image_generate"
      && task.target?.chapterId === chapterId
      && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
    );
  }
}
