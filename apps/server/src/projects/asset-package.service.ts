import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
  AssetPackageManifest,
  AssetPackageManifestFile,
  ExportAssetPackageResponse,
  WorkbenchAsset,
} from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";

@Injectable()
export class AssetPackageService {
  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
  ) {}

  async exportAssetPackage(projectId: string, chapterId?: string): Promise<ExportAssetPackageResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = chapterId
      ? this.projectStore.findChapter(project, chapterId)
      : wsDomain.getCurrentChapter(project);

    if (!chapter) {
      throw new BadRequestException("CHAPTER_REQUIRED");
    }
    if (chapter.status !== "layout_done" && chapter.status !== "exported") {
      throw new BadRequestException("CHAPTER_LAYOUT_NOT_DONE");
    }

    const now = new Date().toISOString();
    const packageId = `pkg_${randomUUID().slice(0, 8)}`;
    const packageRelativeDir = `projects/${project.id}/exports/packages/${packageId}`;
    const packageAbsDir = this.workspacePathService.resolveVirtualPath(`/workspace/${packageRelativeDir}`);
    await mkdir(packageAbsDir, { recursive: true });

    const files: AssetPackageManifestFile[] = [];
    const copyIntoPackage = async (
      sourceRelative: string,
      targetRelative: string,
      meta: Omit<AssetPackageManifestFile, "path" | "type"> & { type?: string },
    ) => {
      const sourceAbs = this.workspacePathService.resolveVirtualPath(`/workspace/${sourceRelative}`);
      const targetAbs = path.join(packageAbsDir, targetRelative);
      await mkdir(path.dirname(targetAbs), { recursive: true });
      try {
        await copyFile(sourceAbs, targetAbs);
        files.push({
          path: targetRelative,
          type: meta.type ?? (path.extname(targetRelative).replace(".", "") || "file"),
          chapterId: meta.chapterId ?? null,
          shotId: meta.shotId ?? null,
          candidateId: meta.candidateId ?? null,
          assetId: meta.assetId ?? null,
        });
      } catch {
        // missing optional files are skipped
      }
    };

    // chapter core documents
    await copyIntoPackage(
      `projects/${project.id}/chapters/${chapter.slug}/script.md`,
      `chapters/${chapter.slug}/script.md`,
      { type: "markdown", chapterId: chapter.id },
    );
    await copyIntoPackage(
      `projects/${project.id}/chapters/${chapter.slug}/structure.json`,
      `chapters/${chapter.slug}/structure.json`,
      { type: "json", chapterId: chapter.id },
    );
    await copyIntoPackage(
      `projects/${project.id}/chapters/${chapter.slug}/storyboard.json`,
      `chapters/${chapter.slug}/storyboard.json`,
      { type: "json", chapterId: chapter.id },
    );
    await copyIntoPackage(
      `projects/${project.id}/chapters/${chapter.slug}/preflight.json`,
      `chapters/${chapter.slug}/preflight.json`,
      { type: "json", chapterId: chapter.id },
    );
    await copyIntoPackage(
      `projects/${project.id}/chapters/${chapter.slug}/candidates.json`,
      `chapters/${chapter.slug}/candidates.json`,
      { type: "json", chapterId: chapter.id },
    );
    await copyIntoPackage(
      `projects/${project.id}/chapters/${chapter.slug}/layout/layout.json`,
      `chapters/${chapter.slug}/layout/layout.json`,
      { type: "json", chapterId: chapter.id },
    );

    // locked candidates + layout export assets
    for (const candidate of chapter.candidates ?? []) {
      if (candidate.status !== "locked") {
        continue;
      }
      const asset = project.assets.find((item) => item.id === candidate.assetId);
      if (!asset?.path) {
        continue;
      }
      const ext = path.extname(asset.path) || ".webp";
      await copyIntoPackage(
        asset.path,
        `chapters/${chapter.slug}/locked/${candidate.shotId}${ext}`,
        {
          type: "image",
          chapterId: chapter.id,
          shotId: candidate.shotId,
          candidateId: candidate.id,
          assetId: asset.id,
        },
      );
    }

    for (const asset of project.assets.filter((item) => item.chapterId === chapter.id)) {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(asset.meta || "{}") as Record<string, unknown>;
      } catch {
        meta = {};
      }
      if (meta.kind !== "layout_page_export") {
        continue;
      }
      const ext = path.extname(asset.path) || ".webp";
      const pageNumber = typeof meta.pageNumber === "number" ? meta.pageNumber : 0;
      await copyIntoPackage(
        asset.path,
        `chapters/${chapter.slug}/exports/page_${String(pageNumber).padStart(3, "0")}${ext}`,
        {
          type: "image",
          chapterId: chapter.id,
          shotId: typeof meta.shotId === "string" ? meta.shotId : null,
          candidateId: typeof meta.candidateId === "string" ? meta.candidateId : null,
          assetId: asset.id,
        },
      );
    }

    // project shared characters index
    await copyIntoPackage(
      `projects/${project.id}/shared/characters.json`,
      "shared/characters.json",
      { type: "json", chapterId: null },
    );

    const manifest: AssetPackageManifest = {
      schemaVersion: 1,
      packageId,
      projectId: project.id,
      chapterIds: [chapter.id],
      createdAt: now,
      files,
    };
    await writeFile(path.join(packageAbsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    files.unshift({
      path: "manifest.json",
      type: "json",
      chapterId: null,
      shotId: null,
      candidateId: null,
      assetId: null,
    });
    // rewrite with manifest included first
    manifest.files = files;
    await writeFile(path.join(packageAbsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const packageAsset: WorkbenchAsset = {
      id: `asset_${randomUUID()}`,
      chapterId: chapter.id,
      type: "archive",
      name: `${chapter.title} 素材包`,
      path: packageRelativeDir,
      sourceTaskId: null,
      meta: JSON.stringify({
        kind: "asset_package",
        packageId,
        chapterId: chapter.id,
        fileCount: files.length,
        createdAt: now,
      }),
    };

    const nextChapter: LocalChapter = {
      ...chapter,
      status: "exported",
      updatedAt: now,
    };
    const nextProject: LocalProject = {
      ...project,
      assets: [...project.assets, packageAsset],
      chapters: project.chapters.map((item) => item.id === nextChapter.id ? nextChapter : item),
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
      packageId,
      packagePath: packageRelativeDir,
      manifest,
      asset: packageAsset,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      assets: nextProject.assets,
      workflow,
    };
  }
}
