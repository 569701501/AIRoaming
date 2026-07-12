import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
  BuildChapterLayoutResponse,
  ChapterLayout,
  ExportChapterLayoutResponse,
  LayoutPage,
  PanelPlacement,
  ProjectCandidate,
  WorkbenchAsset,
} from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { toLegacyLayoutFormatV1 } from "./legacy-layout-format.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";

@Injectable()
export class LayoutExportService {
  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
  ) {}

  async buildChapterLayout(projectId: string, chapterId: string): Promise<BuildChapterLayoutResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    this.assertReadyForLayout(chapter);

    const now = new Date().toISOString();
    const lockedPairs = this.getLockedShotCandidates(chapter);
    const pages = this.buildPages(project, chapter, lockedPairs, now);
    const layout: ChapterLayout = {
      schemaVersion: 1,
      id: chapter.layout?.id ?? `layout_${chapter.id}`,
      projectId: project.id,
      chapterId: chapter.id,
      pages,
      exportAssetIds: chapter.layout?.exportAssetIds ?? [],
      createdAt: chapter.layout?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: null,
    };

    const nextChapter: LocalChapter = {
      ...chapter,
      layout,
      updatedAt: now,
    };
    const nextProject: LocalProject = {
      ...project,
      chapters: project.chapters.map((item) => item.id === nextChapter.id ? nextChapter : item),
      updatedAt: now,
    };
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      layout,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      assets: nextProject.assets,
    };
  }

  async exportChapterLayout(projectId: string, chapterId: string): Promise<ExportChapterLayoutResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    let chapter = this.projectStore.findChapter(project, chapterId);
    this.assertReadyForLayout(chapter);

    if (!chapter.layout || chapter.layout.pages.length === 0) {
      const built = await this.buildChapterLayout(projectId, chapterId);
      const reloaded = await this.projectStore.getReadyProject(projectId);
      chapter = this.projectStore.findChapter(reloaded, chapterId);
      if (!chapter.layout) {
        throw new BadRequestException("LAYOUT_BUILD_FAILED");
      }
      // continue with reloaded project below
    }

    const readyProject = await this.projectStore.getReadyProject(projectId);
    chapter = this.projectStore.findChapter(readyProject, chapterId);
    const layout = chapter.layout!;
    const now = new Date().toISOString();
    const exportAssets: WorkbenchAsset[] = [];
    const nextPages: LayoutPage[] = [];

    for (const page of layout.pages) {
      const placement = page.placements[0];
      if (!placement) {
        nextPages.push(page);
        continue;
      }
      const candidate = (chapter.candidates ?? []).find((item) => item.id === placement.candidateId);
      const sourceAsset = readyProject.assets.find((item) => item.id === (candidate?.assetId ?? placement.assetId));
      if (!sourceAsset?.path) {
        throw new BadRequestException("LAYOUT_SOURCE_ASSET_MISSING");
      }

      const sourceAbs = this.workspacePathService.resolveVirtualPath(`/workspace/${sourceAsset.path}`);
      const ext = path.extname(sourceAsset.path) || ".webp";
      const fileName = `page_${String(page.pageNumber).padStart(3, "0")}${ext}`;
      const relativePath = `projects/${readyProject.id}/chapters/${chapter.slug}/exports/pages/${fileName}`;
      const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await copyFile(sourceAbs, absolutePath);

      const assetId = `asset_${randomUUID()}`;
      const asset: WorkbenchAsset = {
        id: assetId,
        chapterId: chapter.id,
        type: "image",
        name: `${chapter.title} 第 ${page.pageNumber} 页`,
        path: relativePath,
        sourceTaskId: null,
        meta: JSON.stringify({
          kind: "layout_page_export",
          pageNumber: page.pageNumber,
          shotId: placement.shotId,
          candidateId: placement.candidateId,
          sourceAssetId: sourceAsset.id,
          createdAt: now,
        }),
      };
      exportAssets.push(asset);
      nextPages.push({
        ...page,
        exportAssetId: assetId,
      });
    }

    // write layout.json snapshot for package/export consumers
    const layoutRelative = `projects/${readyProject.id}/chapters/${chapter.slug}/layout/layout.json`;
    const layoutAbs = this.workspacePathService.resolveVirtualPath(`/workspace/${layoutRelative}`);
    const nextLayout: ChapterLayout = {
      ...layout,
      pages: nextPages,
      exportAssetIds: exportAssets.map((item) => item.id),
      updatedAt: now,
      confirmedAt: now,
    };
    await mkdir(path.dirname(layoutAbs), { recursive: true });
    await writeFile(layoutAbs, `${JSON.stringify(nextLayout, null, 2)}\n`, "utf8");

    const nextChapter: LocalChapter = {
      ...chapter,
      layout: nextLayout,
      status: "layout_done",
      updatedAt: now,
    };
    const nextProject: LocalProject = {
      ...readyProject,
      assets: [...readyProject.assets, ...exportAssets],
      chapters: readyProject.chapters.map((item) => item.id === nextChapter.id ? nextChapter : item),
      updatedAt: now,
    };
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    const workflow = workflowUtil.buildProjectWorkflow(
      nextProject,
      nextChapter,
      imagePreflightUtil.isChapterImagePreflightReady(nextProject, nextChapter, () => false),
    );

    return {
      layout: nextLayout,
      exportAssets,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      assets: nextProject.assets,
      workflow,
    };
  }

  private assertReadyForLayout(chapter: LocalChapter): void {
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_REQUIRED");
    }
    if (chapter.status !== "images_done" && chapter.status !== "layout_done" && chapter.status !== "exported") {
      throw new BadRequestException("CHAPTER_IMAGES_NOT_DONE");
    }
    const unlocked = chapter.storyboard.storyboardJson.shots.filter((shot) => !shot.lockedCandidateId);
    if (unlocked.length > 0) {
      throw new BadRequestException("CHAPTER_CANDIDATES_NOT_FULLY_LOCKED");
    }
  }

  private getLockedShotCandidates(chapter: LocalChapter): Array<{ shotId: string; order: number; candidate: ProjectCandidate }> {
    const candidates = chapter.candidates ?? [];
    const pairs: Array<{ shotId: string; order: number; candidate: ProjectCandidate }> = [];
    for (const shot of [...chapter.storyboard!.storyboardJson.shots].sort((a, b) => a.order - b.order)) {
      if (!shot.lockedCandidateId) {
        continue;
      }
      const candidate = candidates.find((item) => item.id === shot.lockedCandidateId);
      if (!candidate) {
        throw new BadRequestException(`LOCKED_CANDIDATE_MISSING:${shot.id}`);
      }
      pairs.push({ shotId: shot.id, order: shot.order, candidate });
    }
    if (pairs.length === 0) {
      throw new BadRequestException("NO_LOCKED_CANDIDATES");
    }
    return pairs;
  }

  private buildPages(
    project: LocalProject,
    chapter: LocalChapter,
    pairs: Array<{ shotId: string; order: number; candidate: ProjectCandidate }>,
    now: string,
  ): LayoutPage[] {
    const format = toLegacyLayoutFormatV1(project.comicFormat);
    const width = format === "page_horizontal" ? 1920 : 1080;
    const height = format === "page_horizontal" ? 1080 : 1920;

    return pairs.map((pair, index) => {
      const placement: PanelPlacement = {
        shotId: pair.shotId,
        candidateId: pair.candidate.id,
        assetId: pair.candidate.assetId,
        order: index + 1,
        x: 0,
        y: 0,
        w: width,
        h: height,
      };
      return {
        id: `layout_page_${String(index + 1).padStart(3, "0")}`,
        projectId: project.id,
        chapterId: chapter.id,
        pageNumber: index + 1,
        format,
        width,
        height,
        placements: [placement],
        exportAssetId: null,
      };
    });
  }
}
