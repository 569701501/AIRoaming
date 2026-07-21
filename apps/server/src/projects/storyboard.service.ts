import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  type ChapterStoryboard,
  type ConfirmChapterStoryboardRequest,
  type GetChapterStoryboardResponse,
  type SaveChapterStoryboardResponse,

  type StoryboardJson,
  type UpdateChapterStoryboardRequest,
} from "@airoaming/shared";
import type { LocalChapter } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as storyNormalize from "./story-normalize.util.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";

/**
 * 分镜编排(从 ProjectsService 抽出,见任务 2026-06-24_流程编排Service拆分)。
 * 依赖 ProjectStore/Repository,零跨域耦合。
 */
@Injectable()
export class StoryboardService {
  constructor(
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
  ) {}

  createChapterStoryboard(
    projectId: string,
    chapter: LocalChapter,
    input: StoryboardJson,
    version: number,
    now: string,
  ): ChapterStoryboard {
    const id = `${chapter.id}_storyboard_v${String(version).padStart(3, "0")}`;
    const storyboardJson = storyNormalize.normalizeStoryboardJson(input, chapter.id, chapter.title, {
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



  createPendingChapterStoryboard(
    projectId: string,
    chapter: LocalChapter,
    input: StoryboardJson,
    version: number,
    now: string,
  ): ChapterStoryboard {
    const storyboardJson = storyNormalize.normalizeStoryboardJson(input, chapter.id, chapter.title, {
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



  normalizeStoryboardJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryboardJson, "sourceStoryVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryboardJson {
    return storyNormalize.normalizeStoryboardJson(input, chapterId, fallbackChapterTitle, overrides);
  }

  // normalizeStoryboardShots/Shot 已抽到 ./story-normalize.util.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre-2)。



  assertChapterCanSaveStoryboard(chapter: LocalChapter): void {
    if (!chapter.storyStructure || !chapter.currentStoryVersionId) {
      throw new BadRequestException("STORY_STRUCTURE_REQUIRED");
    }

    if (chapter.status === "draft" || chapter.status === "script_done") {
      throw new BadRequestException("STORY_STRUCTURE_NOT_COMPLETED");
    }
  }



  async getChapterStoryboard(projectId: string, chapterId: string): Promise<GetChapterStoryboardResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      storyboard: chapter.storyboard,
      pendingStoryboard: chapter.pendingStoryboard ?? null,
    };
  }



  async getPendingChapterStoryboard(projectId: string, chapterId: string): Promise<ChapterStoryboard | null> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return chapter.pendingStoryboard ?? null;
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
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
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
      candidates: [],
      layout: null,
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
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
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
    const storyboardJson = storyNormalize.normalizeStoryboardJson(input.storyboardJson, chapter.id, chapter.title, {
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
      candidates: [],
      layout: null,
      // 分镜改动后候选与排版失效，回退到 storyboard_done 之前的可编辑态
      status: chapter.status === "draft" || chapter.status === "script_done" || chapter.status === "structured"
        ? chapter.status
        : "storyboard_done",
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
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }



}
