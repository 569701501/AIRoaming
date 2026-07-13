import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
  AssetPackageManifest,
  AssetPackageManifestFile,
  ExportAssetPackageResponse,
  WorkbenchAsset,
} from "@airoaming/shared";
import { digestCanonicalJson } from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { PrismaService } from "../persistence/prisma.service.js";

@Injectable()
export class AssetPackageService {
  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  async exportAssetPackage(projectId: string, chapterId?: string): Promise<ExportAssetPackageResponse> {
    if (this.repository.isDatabaseMode()) return this.exportAssetPackageInDatabase(projectId, chapterId);
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

  private async exportAssetPackageInDatabase(projectId: string, chapterId?: string): Promise<ExportAssetPackageResponse> {
    const db = this.prismaService.database();
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project || project.lifecycleStatus !== "active") throw new BadRequestException("PROJECT_NOT_FOUND");
    const chapter = chapterId
      ? await db.chapter.findUnique({ where: { id: chapterId } })
      : await db.chapter.findUnique({ where: { id: project.currentChapterId ?? "" } });
    if (!chapter || chapter.projectId !== projectId) throw new BadRequestException("CHAPTER_REQUIRED");
    if (!["layout_done", "exported"].includes(chapter.milestoneStatus) || !chapter.currentLayoutRevisionId) throw new BadRequestException("CHAPTER_LAYOUT_NOT_DONE");
    const layoutRevision = await db.layoutRevision.findUnique({ where: { id: chapter.currentLayoutRevisionId } });
    if (!layoutRevision?.bindingSetSealedAt) throw new BadRequestException("LAYOUT_REVISION_NOT_SEALED");
    const bindings = await db.layoutSourceBinding.findMany({ where: { layoutRevisionId: layoutRevision.id }, orderBy: { order: "asc" } });
    const sourceAssets = await db.asset.findMany({ where: { id: { in: bindings.flatMap((binding) => binding.assetId ? [binding.assetId] : []) }, projectId, status: "ready" } });
    if (sourceAssets.length !== bindings.length) throw new BadRequestException("PACKAGE_SOURCE_ASSET_MISSING");
    const packageId = `pkg_${randomUUID().slice(0, 8)}`;
    const packageRelativeDir = `projects/${projectId}/exports/packages/${packageId}`;
    const packageAbsDir = this.workspacePathService.resolveVirtualPath(`/workspace/${packageRelativeDir}`);
    await mkdir(packageAbsDir, { recursive: true });
    const files: AssetPackageManifestFile[] = [];
    const layoutPath = `chapters/${chapter.slug}/layout/layout.json`;
    const layoutSource = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}/chapters/${chapter.slug}/exports/layout/${layoutRevision.id}/layout.json`);
    const layoutTarget = path.join(packageAbsDir, layoutPath);
    await mkdir(path.dirname(layoutTarget), { recursive: true });
    try { await copyFile(layoutSource, layoutTarget); } catch { throw new BadRequestException("PACKAGE_LAYOUT_SOURCE_MISSING"); }
    files.push({ path: layoutPath, type: "json", chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    for (const binding of bindings) {
      const asset = sourceAssets.find((item) => item.id === binding.assetId)!;
      const ext = path.extname(asset.storageKey) || ".bin";
      const targetRelative = `chapters/${chapter.slug}/locked/${binding.shotId ?? binding.elementId}${ext}`;
      const target = path.join(packageAbsDir, targetRelative);
      await mkdir(path.dirname(target), { recursive: true });
      try { await copyFile(this.workspacePathService.resolveVirtualPath(`/workspace/${asset.storageKey}`), target); } catch { throw new BadRequestException("PACKAGE_SOURCE_ASSET_MISSING"); }
      files.push({ path: targetRelative, type: asset.mimeType.split("/")[1] ?? "file", chapterId: chapter.id, shotId: binding.shotId, candidateId: binding.candidateId, assetId: asset.id });
    }
    const now = new Date();
    const manifest: AssetPackageManifest = { schemaVersion: 1, packageId, projectId, chapterIds: [chapter.id], createdAt: now.toISOString(), files: [{ path: "manifest.json", type: "json", chapterId: null, shotId: null, candidateId: null, assetId: null }, ...files] };
    await this.atomicWrite(path.join(packageAbsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const manifestDigest = digestCanonicalJson(manifest);
    const packageAssetId = `package_asset_${packageId}`;
    const exportRevisionId = `package_export_${packageId}`;
    await db.$transaction(async (tx) => {
      const latest = await tx.exportRevision.findFirst({ where: { projectId, scopeKey: `chapter:${chapter.id}`, kind: "asset_package" }, orderBy: { revision: "desc" } });
      const profile = { schemaVersion: 1, packageId };
      await tx.asset.create({ data: { id: packageAssetId, projectId, chapterId: chapter.id, type: "archive", role: "asset_package", mimeType: "application/json", storageKey: packageRelativeDir, status: "staged", sha256: manifestDigest, bytes: Buffer.byteLength(JSON.stringify(manifest), "utf8"), width: null, height: null, durationMs: null, sourceTaskId: null, metadataJson: { kind: "asset_package", packageId, legacyPath: packageRelativeDir }, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson({ kind: "asset_package", packageId, legacyPath: packageRelativeDir }), createdAt: now, updatedAt: now, readyAt: null, failedAt: null, deletingAt: null } });
      await tx.asset.update({ where: { id: packageAssetId }, data: { status: "ready", readyAt: now } });
      await tx.exportRevision.create({ data: { id: exportRevisionId, projectId, chapterId: chapter.id, scopeKey: `chapter:${chapter.id}`, revision: (latest?.revision ?? 0) + 1, kind: "asset_package", status: "queued", taskId: null, layoutRevisionId: layoutRevision.id, sourceLockSetDigest: layoutRevision.sourceLockSetDigest, profileJson: profile as Prisma.InputJsonValue, profileSchemaVersion: 1, profileDigest: digestCanonicalJson(profile), preflightDigest: null, rendererVersion: "db-package-v1", manifestJson: manifest as unknown as Prisma.InputJsonValue, manifestSchemaVersion: 1, manifestDigest, completionApplicability: null, origin: "runtime", createdAt: now, readyAt: null, failedAt: null, cancelledAt: null } });
      await tx.exportArtifact.create({ data: { id: `package_artifact_${packageId}`, exportRevisionId, assetId: packageAssetId, role: "asset_package", order: 1 } });
      await tx.exportRevision.update({ where: { id: exportRevisionId }, data: { status: "ready", readyAt: now, completionApplicability: "current" } });
      await tx.chapter.update({ where: { id: chapter.id }, data: { currentExportRevisionId: exportRevisionId, milestoneStatus: "exported", rowVersion: { increment: 1 } } });
    });
    const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
    const localChapter = this.projectStore.findChapter(refreshed, chapter.id);
    const asset = refreshed.assets.find((item) => item.id === packageAssetId);
    if (!asset) throw new BadRequestException("PACKAGE_ASSET_NOT_MATERIALIZED");
    const workflow = workflowUtil.buildProjectWorkflow(refreshed, localChapter, imagePreflightUtil.isChapterImagePreflightReady(refreshed, localChapter, () => false));
    return { packageId, packagePath: packageRelativeDir, manifest, asset, chapter: wsDomain.toChapterDetail(localChapter), chapters: wsDomain.sortChapters(refreshed.chapters).map((item) => wsDomain.toChapterListItem(item)), assets: refreshed.assets, workflow };
  }

  private async atomicWrite(absolutePath: string, content: string): Promise<void> {
    const temporary = `${absolutePath}.tmp-${randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, absolutePath);
  }
}
