import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, open, rename, writeFile } from "node:fs/promises";
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
import { digestCanonicalJson } from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { toLegacyLayoutFormatV1 } from "./legacy-layout-format.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";

@Injectable()
export class LayoutExportService {
  constructor(
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(CandidateSourceQueryService) private readonly candidateSources: CandidateSourceQueryService,
  ) {}

  async buildChapterLayout(projectId: string, chapterId: string): Promise<BuildChapterLayoutResponse> {
    if (this.repository.isDatabaseMode()) return this.buildChapterLayoutInDatabase(projectId, chapterId);
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
    if (this.repository.isDatabaseMode()) return this.exportChapterLayoutInDatabase(projectId, chapterId);
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

  private async buildChapterLayoutInDatabase(projectId: string, chapterId: string): Promise<BuildChapterLayoutResponse> {
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const sourceState = await this.candidateSources.get({ projectId, chapterId }, tx);
      this.assertSourceGate(sourceState.gates.buildLayoutWorkingCopy);
      const input = await this.readDatabaseLayoutInput(projectId, chapterId, tx);
      const now = new Date();
      const layout = this.makeLayout(input, now.toISOString());
      const sourceBindings = input.pairs.map((pair, index) => ({
        elementId: layout.pages[index]!.id,
        role: "panel",
        order: index + 1,
        shotId: pair.shot.id,
        candidateId: pair.candidate.id,
        candidateLockRevisionId: pair.lock.id,
        assetId: pair.asset.id,
        sourceDigest: pair.asset.sha256!,
      }));
      const sourceLockSetDigest = sourceState.candidateLockSet.digest!;
      const existing = await tx.layoutWorkingCopy.findUnique({ where: { chapterId } });
      const existingDocument = existing?.documentJson && typeof existing.documentJson === "object" && !Array.isArray(existing.documentJson) ? existing.documentJson as { legacyDocument?: unknown } : null;
      const stableLayout = existing?.sourceLockSetDigest === sourceLockSetDigest && existingDocument?.legacyDocument && typeof existingDocument.legacyDocument === "object" ? existingDocument.legacyDocument as ChapterLayout : layout;
      const documentJson = existing?.sourceLockSetDigest === sourceLockSetDigest ? existing.documentJson as Prisma.InputJsonValue : ({ schemaVersion: 1, kind: "legacy_chapter_layout_v1", sourceResolution: "complete", legacyDocument: stableLayout, sourceBindings } as unknown as Prisma.InputJsonValue);
      const documentDigest = existing?.sourceLockSetDigest === sourceLockSetDigest ? existing.documentDigest : digestCanonicalJson(documentJson);
      if (!existing || existing.documentDigest !== documentDigest || existing.sourceLockSetDigest !== sourceLockSetDigest) {
        if (!existing) {
          await tx.layoutWorkingCopy.create({ data: { id: `layout_wc_${chapterId}`, projectId, chapterId, documentKind: "legacy_chapter_layout_v1", documentJson, schemaVersion: 1, documentDigest, sourceLockSetDigest, basedOnRevisionId: input.chapter.currentLayoutRevisionId, rowVersion: 0, createdAt: now, updatedAt: now } });
          return;
        }
        const result = await tx.layoutWorkingCopy.updateMany({ where: { id: existing.id, projectId, chapterId, rowVersion: existing.rowVersion }, data: { documentJson, documentKind: "legacy_chapter_layout_v1", schemaVersion: 1, documentDigest, sourceLockSetDigest, basedOnRevisionId: input.chapter.currentLayoutRevisionId, rowVersion: { increment: 1 }, updatedAt: now } });
        if (result.count !== 1) throw new BadRequestException("LAYOUT_WORKING_COPY_CONFLICT");
      }
    });
    const project = await this.repository.refreshProjectFromDatabase(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return { layout: chapter.layout!, chapter: wsDomain.toChapterDetail(chapter), chapters: wsDomain.sortChapters(project.chapters).map((item) => wsDomain.toChapterListItem(item)), assets: project.assets };
  }

  private async exportChapterLayoutInDatabase(projectId: string, chapterId: string): Promise<ExportChapterLayoutResponse> {
    const built = await this.buildChapterLayoutInDatabase(projectId, chapterId);
    const db = this.prismaService.database();
    const prepared = await this.prismaService.runBusinessTransaction(async (tx) => {
      const input = await this.readDatabaseLayoutInput(projectId, chapterId, tx);
      const workingCopy = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { chapterId } });
      const sourceBeforeRevision = await this.candidateSources.get({ projectId, chapterId }, tx);
      this.assertSourceGate(sourceBeforeRevision.gates.createLayoutRevision);
      const existingRevision = input.chapter.currentLayoutRevisionId ? await tx.layoutRevision.findUnique({ where: { id: input.chapter.currentLayoutRevisionId } }) : null;
      let revision = existingRevision;
      if (
        !revision
        || revision.documentDigest !== workingCopy.documentDigest
        || revision.sourceLockSetDigest !== workingCopy.sourceLockSetDigest
      ) {
        const latest = await tx.layoutRevision.findFirst({ where: { projectId, chapterId }, orderBy: { revision: "desc" } });
        const created = await tx.layoutRevision.create({ data: { id: `layout_rev_${randomUUID()}`, projectId, chapterId, revision: (latest?.revision ?? 0) + 1, previousRevisionId: latest?.id ?? null, contentBasedOnRevisionId: workingCopy.basedOnRevisionId, documentJson: workingCopy.documentJson as Prisma.InputJsonValue, schemaVersion: 1, documentDigest: workingCopy.documentDigest, sourceLockSetDigest: workingCopy.sourceLockSetDigest, origin: "runtime", saveReason: "export_checkpoint", bindingSetSealedAt: null, createdAt: new Date() } });
        const bindings = Array.isArray((workingCopy.documentJson as { sourceBindings?: unknown }).sourceBindings) ? (workingCopy.documentJson as { sourceBindings: Array<Record<string, unknown>> }).sourceBindings : [];
        for (const binding of bindings) {
          await tx.layoutSourceBinding.create({ data: { id: `layout_binding_${randomUUID()}`, layoutRevisionId: created.id, elementId: String(binding.elementId), role: String(binding.role), order: Number(binding.order), shotId: String(binding.shotId), candidateId: String(binding.candidateId), candidateLockRevisionId: String(binding.candidateLockRevisionId), assetId: String(binding.assetId), sourceDigest: String(binding.sourceDigest) } });
        }
        const sealed = await tx.layoutRevision.update({ where: { id: created.id }, data: { bindingSetSealedAt: new Date() } });
        await tx.chapter.update({ where: { id: chapterId }, data: { currentLayoutRevisionId: sealed.id, milestoneStatus: input.chapter.milestoneStatus === "exported" ? "exported" : "layout_done", rowVersion: { increment: 1 } } });
        revision = sealed;
      }
      const sourceBeforeExport = await this.candidateSources.get({ projectId, chapterId }, tx);
      this.assertSourceGate(sourceBeforeExport.gates.exportLayout);
      return { input, revision };
    });
    const { input, revision } = prepared;
    const now = new Date();
    const exportPath = `projects/${projectId}/chapters/${input.chapter.slug}/exports/layout/${revision.id}/layout.json`;
    const exportAbs = this.workspacePathService.resolveVirtualPath(`/workspace/${exportPath}`);
    const exportContent = `${JSON.stringify(built.layout, null, 2)}\n`;
    await this.atomicWrite(exportAbs, exportContent);
    const bytes = Buffer.byteLength(exportContent, "utf8");
    const exportSha256 = `sha256:${createHash("sha256").update(exportContent, "utf8").digest("hex")}`;
    const manifest = { schemaVersion: 1, kind: "layout_publication", exportRevisionId: `export_${revision.id}`, projectId, chapterId, layoutRevisionId: revision.id, files: [{ path: exportPath, role: "layout_json", order: 1, assetId: `export_asset_${revision.id}` }], createdAt: now.toISOString() };
    const manifestDigest = digestCanonicalJson(manifest);
    const profile = { schemaVersion: 1, format: input.project.comicFormat, renderer: "db-layout-v1" };
    const profileDigest = digestCanonicalJson(profile);
    const current = await db.exportRevision.findFirst({ where: { projectId, chapterId, kind: "layout_publication", layoutRevisionId: revision.id, status: "ready" }, orderBy: { revision: "desc" } });
    if (!current) {
      await this.prismaService.runBusinessTransaction(async (tx) => {
        const sourceBeforeCommit = await this.candidateSources.get({ projectId, chapterId }, tx);
        this.assertSourceGate(sourceBeforeCommit.gates.exportLayout);
        const latest = await tx.exportRevision.findFirst({ where: { projectId, scopeKey: `chapter:${chapterId}`, kind: "layout_publication" }, orderBy: { revision: "desc" } });
        const exportRevisionId = `export_${revision.id}`;
        const assetId = `export_asset_${revision.id}`;
        await tx.asset.create({ data: { id: assetId, projectId, chapterId, type: "document", role: "layout_export", mimeType: "application/json", storageKey: exportPath, status: "staged", sha256: exportSha256, bytes, width: null, height: null, durationMs: null, sourceTaskId: null, metadataJson: { kind: "layout_export", layoutRevisionId: revision.id, legacyPath: exportPath }, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson({ kind: "layout_export", layoutRevisionId: revision.id, legacyPath: exportPath }), createdAt: now, updatedAt: now, readyAt: null, failedAt: null, deletingAt: null } });
        await tx.asset.update({ where: { id: assetId }, data: { status: "ready", readyAt: now } });
        await tx.exportRevision.create({ data: { id: exportRevisionId, projectId, chapterId, scopeKey: `chapter:${chapterId}`, revision: (latest?.revision ?? 0) + 1, kind: "layout_publication", status: "queued", taskId: null, layoutRevisionId: revision.id, sourceLockSetDigest: revision.sourceLockSetDigest, profileJson: profile as Prisma.InputJsonValue, profileSchemaVersion: 1, profileDigest, preflightDigest: input.preflightDigest, rendererVersion: "db-layout-v1", manifestJson: manifest as Prisma.InputJsonValue, manifestSchemaVersion: 1, manifestDigest, completionApplicability: null, origin: "runtime", createdAt: now, readyAt: null, failedAt: null, cancelledAt: null } });
        await tx.exportArtifact.create({ data: { id: `export_artifact_${revision.id}`, exportRevisionId, assetId, role: "layout_json", order: 1 } });
        await tx.exportRevision.update({ where: { id: exportRevisionId }, data: { status: "rendering" } });
        await tx.exportRevision.update({ where: { id: exportRevisionId }, data: { status: "ready", readyAt: now, completionApplicability: "current" } });
        await tx.chapter.update({ where: { id: chapterId }, data: { currentExportRevisionId: exportRevisionId, milestoneStatus: input.chapter.milestoneStatus === "exported" ? "exported" : "layout_done", rowVersion: { increment: 1 } } });
      });
    }
    const projectAfter = await this.repository.refreshProjectFromDatabase(projectId);
    const chapterAfter = this.projectStore.findChapter(projectAfter, chapterId);
    const exportAssets = projectAfter.assets.filter((asset) => asset.id.startsWith("export_asset_") && asset.chapterId === chapterId);
    const workflow = workflowUtil.buildProjectWorkflow(projectAfter, chapterAfter, imagePreflightUtil.isChapterImagePreflightReady(projectAfter, chapterAfter, () => false));
    return { layout: chapterAfter.layout!, exportAssets, chapter: wsDomain.toChapterDetail(chapterAfter), chapters: wsDomain.sortChapters(projectAfter.chapters).map((item) => wsDomain.toChapterListItem(item)), assets: projectAfter.assets, workflow };
  }

  private async readDatabaseLayoutInput(
    projectId: string,
    chapterId: string,
    db: Prisma.TransactionClient | PrismaClient = this.prismaService.database(),
  ) {
    const [project, chapter] = await Promise.all([
      db.project.findUnique({ where: { id: projectId } }),
      db.chapter.findUnique({ where: { id: chapterId } }),
    ]);
    if (!project || project.lifecycleStatus !== "active") throw new BadRequestException("PROJECT_NOT_FOUND");
    if (!chapter || chapter.projectId !== projectId) throw new BadRequestException("CHAPTER_NOT_FOUND");
    if (!["images_done", "layout_done", "exported"].includes(chapter.milestoneStatus)) throw new BadRequestException("CHAPTER_IMAGES_NOT_DONE");
    const preflight = chapter.currentPreflightRevisionId ? await db.preflightRevision.findUnique({ where: { id: chapter.currentPreflightRevisionId } }) : null;
    if (!preflight?.ready) throw new BadRequestException("CHAPTER_PREFLIGHT_NOT_READY");
    const shots = await db.shot.findMany({ where: { projectId, chapterId, lifecycleStatus: "active" }, orderBy: { createdAt: "asc" } });
    if (shots.length === 0) throw new BadRequestException("NO_SHOTS");
    const pairs: Array<{ shot: typeof shots[number]; lock: NonNullable<Awaited<ReturnType<typeof db.candidateLockRevision.findUnique>>>; candidate: NonNullable<Awaited<ReturnType<typeof db.candidate.findUnique>>>; asset: NonNullable<Awaited<ReturnType<typeof db.asset.findUnique>>> }> = [];
    for (const shot of shots) {
      if (!shot.currentCandidateLockRevisionId) throw new BadRequestException("CHAPTER_CANDIDATES_NOT_FULLY_LOCKED");
      const lock = await db.candidateLockRevision.findUnique({ where: { id: shot.currentCandidateLockRevisionId } });
      const candidate = lock?.candidateId ? await db.candidate.findUnique({ where: { id: lock.candidateId } }) : null;
      const asset = candidate ? await db.asset.findUnique({ where: { id: candidate.assetId } }) : null;
      if (!lock || lock.action === "clear" || !candidate || candidate.projectId !== projectId || candidate.chapterId !== chapterId || !asset || asset.status !== "ready" || !asset.sha256 || !/^sha256:[0-9a-f]{64}$/.test(asset.sha256)) throw new BadRequestException("CHAPTER_CANDIDATES_NOT_FULLY_LOCKED");
      pairs.push({ shot, lock, candidate, asset });
    }
    return { project, chapter, preflightDigest: preflight.documentDigest, pairs };
  }

  private makeLayout(input: Awaited<ReturnType<LayoutExportService["readDatabaseLayoutInput"]>>, now: string): ChapterLayout {
    const format = toLegacyLayoutFormatV1(input.project.comicFormat as LocalProject["comicFormat"]);
    const width = format === "page_horizontal" ? 1920 : 1080;
    const height = format === "page_horizontal" ? 1080 : 1920;
    return { schemaVersion: 1, id: `layout_${input.chapter.id}`, projectId: input.project.id, chapterId: input.chapter.id, pages: input.pairs.map((pair, index) => ({ id: `layout_page_${String(index + 1).padStart(3, "0")}`, projectId: input.project.id, chapterId: input.chapter.id, pageNumber: index + 1, format, width, height, placements: [{ shotId: pair.shot.id, candidateId: pair.candidate.id, assetId: pair.asset.id, order: 1, x: 0, y: 0, w: width, h: height }], exportAssetId: null })), exportAssetIds: [], createdAt: now, updatedAt: now, confirmedAt: null };
  }

  private async atomicWrite(absolutePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const temporary = `${absolutePath}.tmp-${randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, absolutePath);
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

  private assertSourceGate(gate: { allowed: boolean; reasonCodes: readonly string[] }): void {
    if (!gate.allowed) {
      const code = gate.reasonCodes[0] ?? "LAYOUT_SOURCE_UNRESOLVED";
      throw new ConflictException({ code, message: code, details: { reasonCodes: gate.reasonCodes } });
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
