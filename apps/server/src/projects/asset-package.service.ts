import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
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
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";

@Injectable()
export class AssetPackageService {
  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(CandidateSourceQueryService) private readonly candidateSources: CandidateSourceQueryService,
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

    // Candidate status is preference/lifecycle only. Current-final identity is
    // derived from the Shot decision pointer (legacy file projection here).
    const currentCandidateIds = new Set(
      chapter.storyboard?.storyboardJson.shots
        .map((shot) => shot.lockedCandidateId)
        .filter((candidateId): candidateId is string => candidateId !== null) ?? [],
    );
    for (const candidate of chapter.candidates ?? []) {
      if (!currentCandidateIds.has(candidate.id)) {
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
    const sourceState = await this.candidateSources.get({ projectId, chapterId: chapter.id });
    if (!sourceState.gates.exportPackage.allowed) {
      const code = sourceState.gates.exportPackage.reasonCodes[0] ?? "LAYOUT_SOURCE_UNRESOLVED";
      throw new ConflictException({ code, message: code, details: { reasonCodes: sourceState.gates.exportPackage.reasonCodes } });
    }
    if (!["layout_done", "exported"].includes(chapter.milestoneStatus) || !chapter.currentLayoutRevisionId) throw new BadRequestException("CHAPTER_LAYOUT_NOT_DONE");
    const layoutRevision = await db.layoutRevision.findUnique({ where: { id: chapter.currentLayoutRevisionId } });
    if (!layoutRevision?.bindingSetSealedAt) throw new BadRequestException("LAYOUT_REVISION_NOT_SEALED");
    const bindings = await db.layoutSourceBinding.findMany({ where: { layoutRevisionId: layoutRevision.id }, orderBy: { order: "asc" } });
    const sourceAssets = await db.asset.findMany({ where: { id: { in: bindings.flatMap((binding) => binding.assetId ? [binding.assetId] : []) }, projectId, status: "ready" } });
    const sourceAssetById = new Map(sourceAssets.map((asset) => [asset.id, asset]));
    if (bindings.some((binding) => !binding.assetId || !sourceAssetById.has(binding.assetId))) throw new BadRequestException("PACKAGE_SOURCE_ASSET_MISSING");
    const [script, story, storyboard, preflight, candidates, shots, characters, publication] = await Promise.all([
      chapter.currentScriptVersionId ? db.chapterScriptVersion.findFirst({ where: { id: chapter.currentScriptVersionId, chapterId: chapter.id } }) : null,
      chapter.currentStoryVersionId ? db.storyVersion.findFirst({ where: { id: chapter.currentStoryVersionId, projectId, chapterId: chapter.id } }) : null,
      chapter.currentStoryboardVersionId ? db.storyboardVersion.findFirst({ where: { id: chapter.currentStoryboardVersionId, projectId, chapterId: chapter.id } }) : null,
      chapter.currentPreflightRevisionId ? db.preflightRevision.findFirst({ where: { id: chapter.currentPreflightRevisionId, projectId, chapterId: chapter.id } }) : null,
      db.candidate.findMany({ where: { projectId, chapterId: chapter.id }, include: { asset: true }, orderBy: [{ shotId: "asc" }, { index: "asc" }] }),
      db.shot.findMany({ where: { projectId, chapterId: chapter.id, lifecycleStatus: "active" }, include: { currentCandidateLockRevision: true }, orderBy: { createdAt: "asc" } }),
      db.character.findMany({
        where: { projectId },
        include: {
          previewVisual: { include: { asset: true } },
          primaryVisual: { include: { asset: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      db.exportRevision.findFirst({
        where: {
          projectId,
          chapterId: chapter.id,
          kind: "layout_publication",
          status: "ready",
          completionApplicability: "current",
          layoutRevisionId: layoutRevision.id,
          sourceLockSetDigest: layoutRevision.sourceLockSetDigest,
        },
        include: { exportArtifactsByExportRevision: { include: { asset: true }, orderBy: [{ role: "asc" }, { order: "asc" }] } },
        orderBy: [{ readyAt: "desc" }, { revision: "desc" }],
      }),
    ]);
    if (!script || !story || !storyboard || !preflight) throw new BadRequestException("PACKAGE_FORMAL_SOURCE_MISSING");
    if (!publication || publication.exportArtifactsByExportRevision.length === 0) throw new BadRequestException("PACKAGE_PUBLICATION_MISSING");
    const packageId = `pkg_${randomUUID().slice(0, 8)}`;
    const packageRelativeDir = `projects/${projectId}/exports/packages/${packageId}`;
    const packageAbsDir = this.workspacePathService.resolveVirtualPath(`/workspace/${packageRelativeDir}`);
    await mkdir(packageAbsDir, { recursive: true });
    const files: AssetPackageManifestFile[] = [];
    const addJson = async (targetRelative: string, value: unknown, meta: Omit<AssetPackageManifestFile, "path" | "type">) => {
      const target = path.join(packageAbsDir, targetRelative);
      await mkdir(path.dirname(target), { recursive: true });
      await this.atomicWrite(target, `${JSON.stringify(value, null, 2)}\n`);
      files.push({ path: targetRelative, type: "json", ...meta });
    };
    const copyAsset = async (asset: { id: string; storageKey: string; mimeType: string }, targetRelative: string, meta: Omit<AssetPackageManifestFile, "path" | "type" | "assetId">) => {
      const target = path.join(packageAbsDir, targetRelative);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await copyFile(this.workspacePathService.resolveVirtualPath(`/workspace/${asset.storageKey}`), target);
      } catch {
        throw new BadRequestException("PACKAGE_SOURCE_ASSET_MISSING");
      }
      files.push({ path: targetRelative, type: asset.mimeType.startsWith("image/") ? "image" : asset.mimeType, assetId: asset.id, ...meta });
    };
    const chapterRoot = `chapters/${chapter.slug}`;
    const scriptPath = `${chapterRoot}/script.md`;
    await mkdir(path.dirname(path.join(packageAbsDir, scriptPath)), { recursive: true });
    await this.atomicWrite(path.join(packageAbsDir, scriptPath), script.sourceText.endsWith("\n") ? script.sourceText : `${script.sourceText}\n`);
    files.push({ path: scriptPath, type: "markdown", chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    await addJson(`${chapterRoot}/structure.json`, story.documentJson, { chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    await addJson(`${chapterRoot}/storyboard.json`, storyboard.documentJson, { chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    await addJson(`${chapterRoot}/preflight.json`, preflight.documentJson, { chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    const currentLockByShot = new Map(shots.map((shot) => [shot.id, shot.currentCandidateLockRevision]));
    await addJson(`${chapterRoot}/candidates.json`, {
      schemaVersion: 1,
      projectId,
      chapterId: chapter.id,
      storyboardVersionId: storyboard.id,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        shotId: candidate.shotId,
        index: candidate.index,
        status: candidate.status,
        label: candidate.label,
        notes: candidate.notes,
        score: candidate.score,
        promptDigest: candidate.promptDigest,
        generationPurpose: candidate.generationPurpose,
        generationSpecVersion: candidate.generationSpecVersion,
        generationSpecDigest: candidate.generationSpecDigest,
        asset: {
          id: candidate.asset.id,
          storageKey: candidate.asset.storageKey,
          mimeType: candidate.asset.mimeType,
          sha256: candidate.asset.sha256,
          bytes: candidate.asset.bytes,
          width: candidate.asset.width,
          height: candidate.asset.height,
        },
        isCurrentFinal: currentLockByShot.get(candidate.shotId)?.candidateId === candidate.id,
        createdAt: candidate.createdAt.toISOString(),
      })),
      currentDecisions: shots.map((shot) => ({
        shotId: shot.id,
        lockRevisionId: shot.currentCandidateLockRevisionId,
        candidateId: shot.currentCandidateLockRevision?.candidateId ?? null,
        action: shot.currentCandidateLockRevision?.action ?? null,
        revision: shot.currentCandidateLockRevision?.revision ?? null,
      })),
    }, { chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    const layoutPath = `chapters/${chapter.slug}/layout/layout.json`;
    // DB-only 后直接从 sealed LayoutRevision 投影规范 JSON，禁止回读已关闭的 legacy export/layout.json。
    await addJson(layoutPath, layoutRevision.documentJson, { chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    const copiedLockedSources = new Set<string>();
    for (const binding of bindings) {
      const lockedSourceKey = binding.candidateId ?? binding.assetId!;
      if (copiedLockedSources.has(lockedSourceKey)) continue;
      copiedLockedSources.add(lockedSourceKey);
      const asset = sourceAssetById.get(binding.assetId!)!;
      const ext = path.extname(asset.storageKey) || ".bin";
      const targetRelative = `chapters/${chapter.slug}/locked/${binding.shotId ?? binding.elementId}${ext}`;
      await copyAsset(asset, targetRelative, { chapterId: chapter.id, shotId: binding.shotId, candidateId: binding.candidateId });
    }
    await addJson(`${chapterRoot}/exports/publication.json`, {
      schemaVersion: 1,
      exportRevisionId: publication.id,
      layoutRevisionId: publication.layoutRevisionId,
      sourceLockSetDigest: publication.sourceLockSetDigest,
      rendererVersion: publication.rendererVersion,
      manifest: publication.manifestJson,
      manifestDigest: publication.manifestDigest,
      readyAt: publication.readyAt?.toISOString() ?? null,
    }, { chapterId: chapter.id, shotId: null, candidateId: null, assetId: null });
    for (const artifact of publication.exportArtifactsByExportRevision) {
      if (artifact.asset.status !== "ready") throw new BadRequestException("PACKAGE_PUBLICATION_ASSET_MISSING");
      const fileName = path.basename(artifact.asset.storageKey) || `${artifact.role}-${artifact.order}`;
      await copyAsset(artifact.asset, `${chapterRoot}/exports/${fileName}`, { chapterId: chapter.id, shotId: null, candidateId: null });
    }
    await addJson("shared/characters.json", {
      schemaVersion: 1,
      projectId,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        role: character.role,
        level: character.level,
        entityType: character.entityType,
        status: character.status,
        appearance: character.appearance,
        personality: character.personality,
        promptFragment: character.promptFragment,
        source: character.source,
        previewVisual: character.previewVisual ? {
          id: character.previewVisual.id,
          kind: character.previewVisual.kind,
          assetId: character.previewVisual.assetId,
          storageKey: character.previewVisual.asset.storageKey,
          sha256: character.previewVisual.asset.sha256,
        } : null,
        primaryVisual: character.primaryVisual ? {
          id: character.primaryVisual.id,
          kind: character.primaryVisual.kind,
          assetId: character.primaryVisual.assetId,
          storageKey: character.primaryVisual.asset.storageKey,
          sha256: character.primaryVisual.asset.sha256,
        } : null,
        createdAt: character.createdAt.toISOString(),
        updatedAt: character.updatedAt.toISOString(),
      })),
    }, { chapterId: null, shotId: null, candidateId: null, assetId: null });
    const now = new Date();
    const manifest: AssetPackageManifest = { schemaVersion: 1, packageId, projectId, chapterIds: [chapter.id], createdAt: now.toISOString(), files: [{ path: "manifest.json", type: "json", chapterId: null, shotId: null, candidateId: null, assetId: null }, ...files] };
    await this.atomicWrite(path.join(packageAbsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const manifestDigest = digestCanonicalJson(manifest);
    const packageAssetId = `package_asset_${packageId}`;
    const exportRevisionId = `package_export_${packageId}`;
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const sourceBeforeCommit = await this.candidateSources.get({ projectId, chapterId: chapter.id }, tx);
      if (!sourceBeforeCommit.gates.exportPackage.allowed) {
        const code = sourceBeforeCommit.gates.exportPackage.reasonCodes[0] ?? "LAYOUT_SOURCE_UNRESOLVED";
        throw new ConflictException({ code, message: code, details: { reasonCodes: sourceBeforeCommit.gates.exportPackage.reasonCodes } });
      }
      const latest = await tx.exportRevision.findFirst({ where: { projectId, scopeKey: `chapter:${chapter.id}`, kind: "asset_package" }, orderBy: { revision: "desc" } });
      const profile = { schemaVersion: 1, packageId };
      const packageMetadata = { kind: "asset_package", packageId, fileCount: manifest.files.length, createdAt: now.toISOString(), legacyName: `${chapter.title} 素材包`, legacyPath: packageRelativeDir };
      await tx.asset.create({ data: { id: packageAssetId, projectId, chapterId: chapter.id, type: "archive", role: "asset_package", mimeType: "application/json", storageKey: packageRelativeDir, status: "staged", sha256: manifestDigest, bytes: Buffer.byteLength(JSON.stringify(manifest), "utf8"), width: null, height: null, durationMs: null, sourceTaskId: null, metadataJson: packageMetadata, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson(packageMetadata), createdAt: now, updatedAt: now, readyAt: null, failedAt: null, deletingAt: null } });
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
