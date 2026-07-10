import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  extractChapterScriptName,
  extractChapterScriptTitle,
  extractScriptOutlineTitle,
  type ArtStyle,
  type ChapterImagePreflight,
  type ChapterPendingSourceText,
  type ChapterStoryboard,
  type ChapterStoryStructure,
  type ComicFormat,
  type ImagePreflightCharacterCheck,
  type ImagePreflightIssue,
  type ImagePreflightJson,
  type ImagePreflightSceneCheck,
  type ImagePreflightStyleCheck,
  type ProjectCharacter,
  type ProjectCharacterEntityType,
  type ProjectCharacterLevel,
  type ProjectCharacterReferenceKind,
  type ProjectCharacterStatus,
  type ProjectScriptOutline,
  type ProjectWorkflow,
  type ScriptRevisionItem,
  type WorkbenchAsset,
} from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { LocalChapter, LocalChapterScriptVersion, LocalProject } from "./local-types.js";
import * as wsJson from "./workspace-json.util.js";
import * as wsDomain from "./project-domain.util.js";
import * as storyNormalize from "./story-normalize.util.js";
import * as wsCharacter from "./character-domain.util.js";

const SCRIPT_VERSION_FILE_PATTERN = /^script-v(\d+)\.md$/;

/**
 * 项目持久化 Repository:缓存(projects Map)+ workspace 加载链 + normalizeImagePreflightJson 等。
 * 从 ProjectsService 抽出(见任务 2026-06-21_ProjectsService拆分 阶段①子步 1b)。
 * Repository 有状态(IdentityMap 式):projectsLoaded/projectsLoadPromise + projects Map。
 */
@Injectable()
export class ProjectRepository {
  private readonly logger = new Logger(ProjectRepository.name);
  private readonly projects = new Map<string, LocalProject>();
  private projectsLoaded = false;
  private projectsLoadPromise: Promise<void> | null = null;

  constructor(@Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService) {}

  // ====== public 缓存 API ======

  async ensureLoaded(): Promise<void> {
    if (this.projectsLoaded) {
      return;
    }
    if (!this.projectsLoadPromise) {
      this.projectsLoadPromise = this.loadProjectsFromWorkspace().finally(() => {
        this.projectsLoadPromise = null;
      });
    }
    await this.projectsLoadPromise;
  }

  getProject(projectId: string): LocalProject | undefined {
    return this.projects.get(projectId);
  }

  getAllProjects(): LocalProject[] {
    return [...this.projects.values()];
  }

  setProject(project: LocalProject): void {
    this.projects.set(project.id, project);
  }

  deleteProject(projectId: string): void {
    this.projects.delete(projectId);
  }

  hasProject(projectId: string): boolean {
    return this.projects.has(projectId);
  }

  // ====== 写入链 ======

  /** 落盘整棵项目树。workflow 由调用方算好传入(依赖 buildImagePreflightJson 业务判断,见候选②)。 */
  async saveProject(project: LocalProject, workflow: ProjectWorkflow): Promise<void> {
    await this.workspacePathService.ensureReady();

    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    const currentChapter = wsDomain.getCurrentChapter(project) ?? wsDomain.createDefaultChapter(project.id, project.sourceText, project.createdAt);
    await mkdir(path.join(projectDir, "shared"), { recursive: true });
    await mkdir(path.join(projectDir, "assets"), { recursive: true });
    await mkdir(path.join(projectDir, "assets", "characters"), { recursive: true });
    await mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await mkdir(path.join(projectDir, "exports"), { recursive: true });

    const metadata = {
      id: project.id,
      name: project.name,
      type: project.type,
      status: "draft",
      currentChapterId: project.currentChapterId,
      storyTitle: project.storyTitle,
      genreTags: project.genreTags,
      comicFormat: project.comicFormat,
      artStyle: project.artStyle,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "workflow.json"), `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "shared", "characters.json"), `${JSON.stringify({
      projectId: project.id,
      characters: wsDomain.sortProjectCharacters(project.characters),
      updatedAt: project.updatedAt,
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "shared", "assets.json"), `${JSON.stringify({
      projectId: project.id,
      assets: project.assets,
      updatedAt: project.updatedAt,
    }, null, 2)}\n`, "utf8");
    if (project.scriptOutline) {
      await writeFile(path.join(projectDir, "script-outline.md"), project.scriptOutline.sourceText, "utf8");
      await writeFile(path.join(projectDir, "script-outline.json"), `${JSON.stringify({
        id: project.scriptOutline.id,
        projectId: project.scriptOutline.projectId,
        status: project.scriptOutline.status,
        title: project.scriptOutline.title,
        outlinePath: project.scriptOutline.outlinePath,
        createdAt: project.scriptOutline.createdAt,
        updatedAt: project.scriptOutline.updatedAt,
        confirmedAt: project.scriptOutline.confirmedAt,
      }, null, 2)}\n`, "utf8");
    }
    for (const chapter of wsDomain.sortChapters(project.chapters.length > 0 ? project.chapters : [currentChapter])) {
      await this.writeChapterFiles(projectDir, chapter);
    }
  }

  async clearProjectChaptersDir(projectId: string): Promise<void> {
    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}`);
    await rm(path.join(projectDir, "chapters"), { recursive: true, force: true });
  }

  async clearLegacyStoryDir(projectId: string): Promise<void> {
    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}`);
    await rm(path.join(projectDir, "story"), { recursive: true, force: true });
  }

  private async writeChapterFiles(projectDir: string, chapter: LocalChapter): Promise<void> {
    const chapterDir = path.join(projectDir, "chapters", chapter.slug);
    const versionsDir = path.join(chapterDir, "script.versions");
    const revisionsDir = path.join(chapterDir, "script.revisions");
    await mkdir(chapterDir, { recursive: true });
    if (chapter.scriptVersions.length > 0) {
      await mkdir(versionsDir, { recursive: true });
    } else {
      await rm(versionsDir, { recursive: true, force: true });
    }
    await mkdir(path.join(chapterDir, "candidates"), { recursive: true });
    await mkdir(path.join(chapterDir, "layout"), { recursive: true });
    await mkdir(path.join(chapterDir, "exports"), { recursive: true });

    await writeFile(path.join(chapterDir, "chapter.json"), `${JSON.stringify(wsDomain.toChapterDetail(chapter), null, 2)}\n`, "utf8");
    await writeFile(path.join(chapterDir, "script.md"), chapter.sourceText, "utf8");
    if (chapter.pendingSourceText) {
      await writeFile(path.join(chapterDir, "script-pending.json"), `${JSON.stringify(chapter.pendingSourceText, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "script-pending.json"), { force: true });
    }
    if (chapter.storyStructure) {
      await writeFile(path.join(chapterDir, "structure.json"), `${JSON.stringify(chapter.storyStructure, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "structure.json"), { force: true });
    }
    if (chapter.storyboard) {
      await writeFile(path.join(chapterDir, "storyboard.json"), `${JSON.stringify(chapter.storyboard, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "storyboard.json"), { force: true });
    }
    if (chapter.pendingStoryboard) {
      await writeFile(path.join(chapterDir, "storyboard.pending.json"), `${JSON.stringify(chapter.pendingStoryboard, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "storyboard.pending.json"), { force: true });
    }
    if (chapter.imagePreflight) {
      await writeFile(path.join(chapterDir, "preflight.json"), `${JSON.stringify(chapter.imagePreflight, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "preflight.json"), { force: true });
    }
    if (chapter.candidates && chapter.candidates.length > 0) {
      await writeFile(
        path.join(chapterDir, "candidates.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          projectId: chapter.projectId,
          chapterId: chapter.id,
          candidates: chapter.candidates,
          updatedAt: chapter.updatedAt,
        }, null, 2)}\n`,
        "utf8",
      );
    } else {
      await rm(path.join(chapterDir, "candidates.json"), { force: true });
    }
    if (chapter.layout) {
      await mkdir(path.join(chapterDir, "layout"), { recursive: true });
      await writeFile(path.join(chapterDir, "layout", "layout.json"), `${JSON.stringify(chapter.layout, null, 2)}\n`, "utf8");
    } else {
      await rm(path.join(chapterDir, "layout", "layout.json"), { force: true });
    }
    if (chapter.lastScriptRevision) {
      await mkdir(revisionsDir, { recursive: true });
      await writeFile(path.join(revisionsDir, "latest.json"), `${JSON.stringify(chapter.lastScriptRevision, null, 2)}\n`, "utf8");
    } else {
      await rm(revisionsDir, { recursive: true, force: true });
    }
    if (chapter.scriptVersions.length > 0) {
      for (const version of chapter.scriptVersions) {
        await writeFile(path.join(versionsDir, `script-v${String(version.version).padStart(3, "0")}.md`), version.sourceText, "utf8");
      }
    }
  }

  // ====== 加载链 ======

  private async loadProjectsFromWorkspace(): Promise<void> {
    await this.workspacePathService.ensureReady();

    const projectsDir = this.workspacePathService.resolveVirtualPath("/workspace/projects");
    const entries = await wsJson.readOptionalDirectory(projectsDir);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        const project = await this.readProjectFromWorkspace(entry.name);
        if (project) {
          this.projects.set(project.id, project);
        }
      } catch (error) {
        this.logger.warn(`Skip project workspace "${entry.name}": ${this.getErrorMessage(error)}`);
      }
    }

    this.projectsLoaded = true;
  }

  private async readProjectFromWorkspace(projectDirName: string): Promise<LocalProject | null> {
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectDirName}`);
    const metadataPath = path.join(projectDir, "project.json");
    const metadataText = await wsJson.readOptionalTextFile(metadataPath);
    if (metadataText === null) {
      return null;
    }

    const metadata = wsJson.parseJsonRecord(metadataText, metadataPath);
    const projectId = projectDirName;
    const createdAt = wsJson.getStringField(metadata, "createdAt", new Date().toISOString());
    const updatedAt = wsJson.getStringField(metadata, "updatedAt", createdAt);
    const chapters = await this.readChaptersFromWorkspace(projectDir, projectId);
    const metadataSourceText = wsJson.getStringField(metadata, "sourceText", "");
    const fallbackSourceText = metadataSourceText;
    const readyChapters = chapters.length > 0
      ? chapters
      : [wsDomain.createDefaultChapter(projectId, fallbackSourceText, createdAt)];
    const requestedCurrentChapterId = wsJson.getOptionalStringField(metadata, "currentChapterId");
    const currentChapter = readyChapters.find((chapter) => chapter.id === requestedCurrentChapterId) ?? readyChapters[0] ?? null;
    const sourceText = currentChapter?.sourceText ?? fallbackSourceText;
    const parsedStoryTitle = extractChapterScriptName(sourceText);
    const scriptOutline = await this.readProjectScriptOutline(projectDir, projectId, createdAt, updatedAt);
    const assets = await this.readProjectAssets(projectDir);
    const characters = await this.readProjectCharacters(projectDir, projectId, createdAt, updatedAt);
    const storyTitle = parsedStoryTitle ?? wsJson.getStringField(metadata, "storyTitle", wsJson.getStringField(metadata, "name", projectId));

    return {
      id: projectId,
      name: wsJson.getStringField(metadata, "name", projectId),
      type: wsDomain.normalizeProjectType(metadata.type),
      currentChapterId: currentChapter?.id ?? null,
      storyTitle,
      genreTags: wsJson.getStringArrayField(metadata, "genreTags"),
      comicFormat: wsDomain.normalizeComicFormat(metadata.comicFormat as ComicFormat | undefined),
      artStyle: wsDomain.normalizeArtStyle(metadata.artStyle as ArtStyle | undefined),
      description: wsJson.getStringField(metadata, "description", storyTitle),
      sourceText,
      scriptOutline,
      characters,
      assets,
      chapters: wsDomain.sortChapters(readyChapters),
      createdAt,
      updatedAt,
    };
  }

  private async readProjectScriptOutline(
    projectDir: string,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
  ): Promise<ProjectScriptOutline | null> {
    const outlinePath = path.join(projectDir, "script-outline.md");
    const sourceText = await wsJson.readOptionalTextFile(outlinePath);
    if (sourceText === null || !sourceText.trim()) {
      return null;
    }

    const metadataPath = path.join(projectDir, "script-outline.json");
    const metadataText = await wsJson.readOptionalTextFile(metadataPath);
    const metadata = metadataText ? wsJson.parseJsonRecord(metadataText, metadataPath) : {};
    const title = extractScriptOutlineTitle(sourceText)
      ?? wsJson.getStringField(metadata, "title", "未命名剧本大纲");
    const status = metadata.status === "confirmed" ? "confirmed" : "draft";

    return {
      id: wsJson.getStringField(metadata, "id", "script_outline_current"),
      projectId,
      status,
      title,
      sourceText,
      outlinePath: `projects/${projectId}/script-outline.md`,
      createdAt: wsJson.getStringField(metadata, "createdAt", fallbackCreatedAt),
      updatedAt: wsJson.getStringField(metadata, "updatedAt", fallbackUpdatedAt),
      confirmedAt: wsJson.getOptionalStringField(metadata, "confirmedAt"),
    };
  }

  private async readProjectCharacters(
    projectDir: string,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
  ): Promise<ProjectCharacter[]> {
    const charactersPath = path.join(projectDir, "shared", "characters.json");
    const content = await wsJson.readOptionalTextFile(charactersPath);
    if (content === null || !content.trim()) {
      return [];
    }

    const record = wsJson.parseJsonRecord(content, charactersPath);
    const input = Array.isArray(record.characters) ? record.characters : [];
    return wsDomain.sortProjectCharacters(input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item, index) => this.normalizeProjectCharacter(item, projectId, fallbackCreatedAt, fallbackUpdatedAt, index)));
  }

  private async readProjectAssets(projectDir: string): Promise<WorkbenchAsset[]> {
    const assetsPath = path.join(projectDir, "shared", "assets.json");
    const content = await wsJson.readOptionalTextFile(assetsPath);
    if (content === null || !content.trim()) {
      return [];
    }

    const record = wsJson.parseJsonRecord(content, assetsPath);
    const input = Array.isArray(record.assets) ? record.assets : [];
    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item): WorkbenchAsset => {
        const type = item.type === "audio" || item.type === "video" || item.type === "document" || item.type === "archive"
          ? item.type
          : "image";
        return {
          id: wsJson.getStringField(item, "id", `asset_${randomUUID()}`),
          chapterId: wsJson.getOptionalStringField(item, "chapterId"),
          type,
          name: wsJson.getStringField(item, "name", "未命名素材"),
          path: wsJson.getStringField(item, "path", ""),
          sourceTaskId: wsJson.getOptionalStringField(item, "sourceTaskId"),
          meta: wsJson.getStringField(item, "meta", "{}"),
        };
      })
      .filter((asset) => asset.path.trim());
  }

  private async readChaptersFromWorkspace(projectDir: string, projectId: string): Promise<LocalChapter[]> {
    const chaptersDir = path.join(projectDir, "chapters");
    const entries = await wsJson.readOptionalDirectory(chaptersDir);
    const chapters: LocalChapter[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const chapter = await this.readChapterFromWorkspace(projectDir, projectId, entry.name, chapters.length + 1);
      if (chapter) {
        chapters.push(chapter);
      }
    }

    return wsDomain.sortChapters(chapters);
  }

  private async readChapterFromWorkspace(
    projectDir: string,
    projectId: string,
    slug: string,
    fallbackOrder: number,
  ): Promise<LocalChapter | null> {
    const chapterDir = path.join(projectDir, "chapters", slug);
    const metadataPath = path.join(chapterDir, "chapter.json");
    const metadataText = await wsJson.readOptionalTextFile(metadataPath);
    const metadata = metadataText === null ? {} : wsJson.parseJsonRecord(metadataText, metadataPath);
    const order = wsJson.getNumberField(metadata, "order", this.getOrderFromChapterSlug(slug) ?? fallbackOrder);
    const suffix = String(order).padStart(3, "0");
    const chapterId = wsJson.getStringField(metadata, "id", `chapter_${suffix}`);
    const formalSourceText = await wsJson.readOptionalTextFile(path.join(chapterDir, "script.md"))
      ?? wsJson.getStringField(metadata, "sourceText", "");
    const createdAt = wsJson.getStringField(metadata, "createdAt", new Date().toISOString());
    const updatedAt = wsJson.getStringField(metadata, "updatedAt", createdAt);
    const currentScriptVersionId = wsJson.getOptionalStringField(metadata, "currentScriptVersionId");
    const lastScriptRevision = this.parseScriptRevision(metadata.lastScriptRevision)
      ?? await this.readLatestScriptRevision(path.join(chapterDir, "script.revisions", "latest.json"));
    const scriptVersions = await this.readChapterScriptVersions(
      projectId,
      chapterId,
      slug,
      path.join(chapterDir, "script.versions"),
      currentScriptVersionId,
      updatedAt,
    );
    const storyStructure = await this.readChapterStoryStructure(
      projectId,
      chapterId,
      slug,
      path.join(chapterDir, "structure.json"),
      updatedAt,
    );
    const restoredCurrentScriptVersionId = currentScriptVersionId
      ?? scriptVersions.find((version) => version.status === "current")?.id
      ?? null;
    const status = wsDomain.normalizeChapterStatus(metadata.status);
    const currentScriptVersion = scriptVersions.find((version) => version.id === restoredCurrentScriptVersionId)
      ?? scriptVersions.find((version) => version.status === "current");
    const sourceText = formalSourceText.trim()
      ? formalSourceText
      : status !== "draft" && currentScriptVersion?.sourceText.trim()
        ? currentScriptVersion.sourceText
        : formalSourceText;
    const restoredCurrentStoryVersionId = wsJson.getOptionalStringField(metadata, "currentStoryVersionId")
      ?? storyStructure?.id
      ?? null;

    return {
      id: chapterId,
      projectId,
      slug,
      order,
      title: extractChapterScriptTitle(sourceText) ?? wsJson.getStringField(metadata, "title", `第 ${order} 章`),
      status,
      currentScriptVersionId: restoredCurrentScriptVersionId,
      currentStoryVersionId: restoredCurrentStoryVersionId,
      sourceText,
      summary: wsJson.getStringField(metadata, "summary", ""),
      storyStructure,
      storyboard: await this.readChapterStoryboard(
        projectId,
        chapterId,
        slug,
        path.join(chapterDir, "storyboard.json"),
        updatedAt,
      ),
      pendingStoryboard: await this.readPendingChapterStoryboard(
        projectId,
        chapterId,
        slug,
        path.join(chapterDir, "storyboard.pending.json"),
        updatedAt,
      ),
      pendingSourceText: await this.readPendingChapterSourceText(
        path.join(chapterDir, "script-pending.json"),
      ),
      imagePreflight: await this.readChapterImagePreflight(
        projectId,
        chapterId,
        slug,
        path.join(chapterDir, "preflight.json"),
        updatedAt,
      ),
      candidates: await this.readChapterCandidates(
        projectId,
        chapterId,
        path.join(chapterDir, "candidates.json"),
      ),
      layout: await this.readChapterLayout(
        path.join(chapterDir, "layout", "layout.json"),
      ),
      createdAt,
      updatedAt,
      completedAt: wsJson.getOptionalStringField(metadata, "completedAt"),
      scriptVersions,
      lastScriptRevision,
    };
  }

  private async readChapterCandidates(
    projectId: string,
    chapterId: string,
    filePath: string,
  ): Promise<import("@airoaming/shared").ProjectCandidate[]> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return [];
    }
    try {
      const record = wsJson.parseJsonRecord(content, filePath);
      const input = Array.isArray(record.candidates) ? record.candidates : [];
      return input
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
        .map((item, index): import("@airoaming/shared").ProjectCandidate => {
          const status: import("@airoaming/shared").CandidateStatus = item.status === "selected"
            || item.status === "locked"
            || item.status === "rejected"
            || item.status === "superseded"
            ? item.status
            : "generated";
          return {
            id: wsJson.getStringField(item, "id", `candidate_${index + 1}`),
            projectId: wsJson.getStringField(item, "projectId", projectId),
            chapterId: wsJson.getStringField(item, "chapterId", chapterId),
            shotId: wsJson.getStringField(item, "shotId", ""),
            taskId: wsJson.getStringField(item, "taskId", ""),
            assetId: wsJson.getStringField(item, "assetId", ""),
            index: wsJson.getNumberField(item, "index", index + 1),
            status,
            label: wsJson.getStringField(item, "label", `候选 ${index + 1}`),
            promptDigest: wsJson.getStringField(item, "promptDigest", ""),
            generationPurpose: item.generationPurpose === "shot_clean_plate" ? "shot_clean_plate" : undefined,
            generationSpecVersion: typeof item.generationSpecVersion === "number" ? item.generationSpecVersion : undefined,
            generationSpecDigest: wsJson.getOptionalStringField(item, "generationSpecDigest") ?? undefined,
            createdAt: wsJson.getStringField(item, "createdAt", new Date().toISOString()),
            updatedAt: wsJson.getStringField(item, "updatedAt", new Date().toISOString()),
          };
        })
        .filter((item) => item.shotId && item.assetId);
    } catch {
      return [];
    }
  }

  private async readChapterLayout(
    filePath: string,
  ): Promise<import("@airoaming/shared").ChapterLayout | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }
    try {
      const record = JSON.parse(content) as import("@airoaming/shared").ChapterLayout;
      if (!record || record.schemaVersion !== 1 || !Array.isArray(record.pages)) {
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  private async readChapterScriptVersions(
    projectId: string,
    chapterId: string,
    slug: string,
    versionsDir: string,
    currentScriptVersionId: string | null,
    fallbackCreatedAt: string,
  ): Promise<LocalChapterScriptVersion[]> {
    const entries = await wsJson.readOptionalDirectory(versionsDir);
    const versionFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const match = entry.name.match(SCRIPT_VERSION_FILE_PATTERN);
        return match ? { fileName: entry.name, version: Number(match[1]) } : null;
      })
      .filter((item): item is { fileName: string; version: number } => item !== null)
      .sort((left, right) => left.version - right.version);
    const versions: LocalChapterScriptVersion[] = [];

    for (const item of versionFiles) {
      const id = `${chapterId}_script_v${String(item.version).padStart(3, "0")}`;
      versions.push({
        id,
        projectId,
        chapterId,
        version: item.version,
        sourcePath: `projects/${projectId}/chapters/${slug}/script.versions/${item.fileName}`,
        status: id === currentScriptVersionId ? "current" : "archived",
        createdAt: fallbackCreatedAt,
        sourceText: await readFile(path.join(versionsDir, item.fileName), "utf8"),
      });
    }

    if (versions.length > 0 && !versions.some((version) => version.status === "current")) {
      versions[versions.length - 1].status = "current";
    }

    return versions;
  }

  private async readChapterStoryStructure(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterStoryStructure | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = wsJson.parseJsonRecord(content, filePath);
    const structureJson = storyNormalize.normalizeStoryStructureJson(record.structureJson ?? record, chapterId, wsJson.getStringField(record, "chapterTitle", ""));
    const version = wsJson.getNumberField(record, "version", 1);
    const createdAt = wsJson.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = wsJson.getStringField(record, "updatedAt", createdAt);

    return {
      id: wsJson.getStringField(record, "id", `${chapterId}_story_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "structured",
      structurePath: `projects/${projectId}/chapters/${slug}/structure.json`,
      sourceScriptVersionId: wsJson.getOptionalStringField(record, "sourceScriptVersionId") ?? structureJson.sourceScriptVersionId,
      structureJson,
      createdAt,
      updatedAt,
      confirmedAt: wsJson.getOptionalStringField(record, "confirmedAt") ?? updatedAt,
    };
  }

  private async readChapterStoryboard(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterStoryboard | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = wsJson.parseJsonRecord(content, filePath);
    const storyboardJson = storyNormalize.normalizeStoryboardJson(record.storyboardJson ?? record, chapterId, wsJson.getStringField(record, "chapterTitle", ""));
    const version = wsJson.getNumberField(record, "version", 1);
    const createdAt = wsJson.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = wsJson.getStringField(record, "updatedAt", createdAt);

    return {
      id: wsJson.getStringField(record, "id", `${chapterId}_storyboard_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "storyboard_done",
      storyboardPath: `projects/${projectId}/chapters/${slug}/storyboard.json`,
      sourceStoryVersionId: wsJson.getOptionalStringField(record, "sourceStoryVersionId") ?? storyboardJson.sourceStoryVersionId,
      storyboardJson,
      createdAt,
      updatedAt,
      confirmedAt: wsJson.getOptionalStringField(record, "confirmedAt") ?? updatedAt,
    };
  }

  private async readPendingChapterStoryboard(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterStoryboard | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = wsJson.parseJsonRecord(content, filePath);
    const storyboardJson = storyNormalize.normalizeStoryboardJson(record.storyboardJson ?? record, chapterId, wsJson.getStringField(record, "chapterTitle", ""));
    const version = wsJson.getNumberField(record, "version", 1);
    const createdAt = wsJson.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = wsJson.getStringField(record, "updatedAt", createdAt);

    return {
      id: wsJson.getStringField(record, "id", `${chapterId}_storyboard_pending_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "pending_confirmation",
      storyboardPath: `projects/${projectId}/chapters/${slug}/storyboard.pending.json`,
      sourceStoryVersionId: wsJson.getOptionalStringField(record, "sourceStoryVersionId") ?? storyboardJson.sourceStoryVersionId,
      storyboardJson,
      createdAt,
      updatedAt,
      confirmedAt: null,
    };
  }

  private async readPendingChapterSourceText(
    filePath: string,
  ): Promise<ChapterPendingSourceText | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = wsJson.parseJsonRecord(content, filePath);
    const sourceText = wsJson.getStringField(record, "sourceText", "");
    if (!sourceText.trim()) {
      return null;
    }

    const createdAt = wsJson.getStringField(record, "createdAt", new Date().toISOString());
    const operation = wsJson.getStringField(record, "operation", "generate_script_from_outline");
    const validOperation = operation === "generate_script_from_seed"
      || operation === "generate_script_from_outline"
      || operation === "update_chapter_draft"
      ? operation
      : "generate_script_from_outline";

    return {
      sourceText,
      threadId: wsJson.getStringField(record, "threadId", ""),
      messageId: wsJson.getStringField(record, "messageId", ""),
      toolCallId: wsJson.getStringField(record, "toolCallId", ""),
      operation: validOperation,
      createdAt,
      updatedAt: wsJson.getStringField(record, "updatedAt", createdAt),
    };
  }

  private async readChapterImagePreflight(
    projectId: string,
    chapterId: string,
    slug: string,
    filePath: string,
    fallbackCreatedAt: string,
  ): Promise<ChapterImagePreflight | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null || !content.trim()) {
      return null;
    }

    const record = wsJson.parseJsonRecord(content, filePath);
    const preflightJson = this.normalizeImagePreflightJson(record.preflightJson ?? record, chapterId, wsJson.getStringField(record, "chapterTitle", ""));
    const version = wsJson.getNumberField(record, "version", 1);
    const createdAt = wsJson.getStringField(record, "createdAt", fallbackCreatedAt);
    const updatedAt = wsJson.getStringField(record, "updatedAt", createdAt);
    const confirmedAt = wsJson.getStringField(record, "confirmedAt", updatedAt);

    return {
      id: wsJson.getStringField(record, "id", `${chapterId}_image_preflight_v${String(version).padStart(3, "0")}`),
      projectId,
      chapterId,
      version,
      status: "confirmed",
      preflightPath: `projects/${projectId}/chapters/${slug}/preflight.json`,
      sourceStoryboardId: wsJson.getOptionalStringField(record, "sourceStoryboardId") ?? preflightJson.sourceStoryboardId,
      sourceStoryboardUpdatedAt: wsJson.getOptionalStringField(record, "sourceStoryboardUpdatedAt") ?? preflightJson.sourceStoryboardUpdatedAt,
      preflightJson,
      createdAt,
      updatedAt,
      confirmedAt,
    };
  }

  private async readLatestScriptRevision(filePath: string): Promise<ScriptRevisionItem | null> {
    const content = await wsJson.readOptionalTextFile(filePath);
    if (content === null) {
      return null;
    }

    try {
      return this.parseScriptRevision(JSON.parse(content));
    } catch {
      return null;
    }
  }

  // ====== 只加载链用的 normalize/parse(私有) ======

  private normalizeProjectCharacter(
    item: Record<string, unknown>,
    projectId: string,
    fallbackCreatedAt: string,
    fallbackUpdatedAt: string,
    index: number,
  ): ProjectCharacter {
    const level = wsCharacter.normalizeCharacterLevel(wsJson.getStringField(item, "level", index === 0 ? "lead" : "recurring"));
    const primaryReferenceAssetId = wsJson.getOptionalStringField(item, "primaryReferenceAssetId");
    const status = wsCharacter.normalizeCharacterStatus(wsJson.getStringField(item, "status", primaryReferenceAssetId ? "finalized" : "draft"));
    return {
      id: wsJson.getStringField(item, "id", `char_${String(index + 1).padStart(3, "0")}`),
      projectId,
      name: wsCharacter.normalizeCharacterName(wsJson.getStringField(item, "name", `角色 ${index + 1}`)),
      role: wsJson.getStringField(item, "role", ""),
      level,
      entityType: wsCharacter.normalizeEntityType(item.entityType),
      status,
      appearance: wsJson.getStringField(item, "appearance", ""),
      personality: wsJson.getStringField(item, "personality", ""),
      promptFragment: wsJson.getStringField(item, "promptFragment", ""),
      referenceAssetIds: wsJson.getStringArrayField(item, "referenceAssetIds"),
      previewReferenceAssetId: wsJson.getOptionalStringField(item, "previewReferenceAssetId"),
      previewConfirmedAt: wsJson.getOptionalStringField(item, "previewConfirmedAt"),
      primaryReferenceAssetId,
      primaryReferenceKind: wsCharacter.normalizeCharacterReferenceKind(
        wsJson.getStringField(item, "primaryReferenceKind", wsCharacter.defaultReferenceKindForLevel(level)),
      ),
      visualVersion: wsJson.getNumberField(item, "visualVersion", primaryReferenceAssetId ? 1 : 0),
      source: item.source === "imported_script" || item.source === "manual" || item.source === "story_structure" || item.source === "image_preflight" ? item.source : "script_outline",
      createdAt: wsJson.getStringField(item, "createdAt", fallbackCreatedAt),
      updatedAt: wsJson.getStringField(item, "updatedAt", fallbackUpdatedAt),
      finalizedAt: wsJson.getOptionalStringField(item, "finalizedAt"),
    };
  }

  private parseScriptRevision(value: unknown): ScriptRevisionItem | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const operation = record.operation;
    if (
      operation !== "import_script_to_chapters"
      && operation !== "update_chapter_draft"
      && operation !== "generate_script_from_seed"
      && operation !== "generate_script_from_outline"
    ) {
      return null;
    }

    const requiredStrings = ["id", "projectId", "threadId", "messageId", "toolCallId", "summary", "createdAt"];
    if (!requiredStrings.every((key) => typeof record[key] === "string")) {
      return null;
    }

    return {
      id: record.id as string,
      projectId: record.projectId as string,
      chapterId: typeof record.chapterId === "string" ? record.chapterId : null,
      source: "ai_tool",
      threadId: record.threadId as string,
      messageId: record.messageId as string,
      toolCallId: record.toolCallId as string,
      operation,
      summary: record.summary as string,
      createdAt: record.createdAt as string,
    };
  }

  private getOrderFromChapterSlug(slug: string): number | null {
    const match = slug.match(/^chapter-(\d+)$/);
    if (!match) {
      return null;
    }
    return Number(match[1]);
  }

  private normalizeImagePreflightJson(input: unknown, chapterId: string, fallbackChapterTitle: string): ImagePreflightJson {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const now = new Date().toISOString();
    const sourceStoryboardId = wsJson.getOptionalStringField(record, "sourceStoryboardId");
    const sourceStoryboardUpdatedAt = wsJson.getOptionalStringField(record, "sourceStoryboardUpdatedAt");
    const issues = this.normalizeImagePreflightIssues(record.issues);
    const unresolvedCharacters = wsJson.getStringArrayField(record, "unresolvedCharacters").map((item) => item.trim()).filter(Boolean);
    const characterChecks = this.normalizeImagePreflightCharacterChecks(record.characterChecks);
    const sceneChecks = this.normalizeImagePreflightSceneChecks(record.sceneChecks);
    const styleCheck = this.normalizeImagePreflightStyleCheck(record.styleCheck);

    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: wsJson.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
      sourceStoryboardId,
      sourceStoryboardUpdatedAt,
      shotCount: wsJson.getNumberField(record, "shotCount", 0),
      unresolvedCharacters,
      characterChecks,
      sceneChecks,
      styleCheck,
      issues,
      ready: typeof record.ready === "boolean" ? record.ready : issues.length === 0,
      notes: wsJson.getStringField(record, "notes", ""),
      createdAt: wsJson.getStringField(record, "createdAt", now),
      updatedAt: wsJson.getStringField(record, "updatedAt", now),
    };
  }

  private normalizeImagePreflightCharacterChecks(input: unknown): ImagePreflightCharacterCheck[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => {
        const status = this.normalizeImagePreflightStatus(wsJson.getStringField(item, "status", "ok"));
        return {
          characterId: wsJson.getStringField(item, "characterId", ""),
          name: wsJson.getStringField(item, "name", "未命名角色"),
          level: wsCharacter.normalizeCharacterLevel(wsJson.getStringField(item, "level", "extra")),
          appearanceCount: wsJson.getNumberField(item, "appearanceCount", 0),
          requiredReference: Boolean(item.requiredReference),
          referenceReady: Boolean(item.referenceReady),
          referenceAssetId: wsJson.getOptionalStringField(item, "referenceAssetId"),
          status,
          note: wsJson.getStringField(item, "note", ""),
        };
      });
  }

  private normalizeImagePreflightSceneChecks(input: unknown): ImagePreflightSceneCheck[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => ({
        sceneId: wsJson.getStringField(item, "sceneId", ""),
        name: wsJson.getStringField(item, "name", "未命名场景"),
        shotCount: wsJson.getNumberField(item, "shotCount", 0),
        referenceAssetId: wsJson.getOptionalStringField(item, "referenceAssetId"),
        referenceReady: Boolean(item.referenceReady),
        status: this.normalizeImagePreflightStatus(wsJson.getStringField(item, "status", "ok")),
        note: wsJson.getStringField(item, "note", ""),
      }));
  }

  private normalizeImagePreflightStyleCheck(input: unknown): ImagePreflightStyleCheck {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const comicFormat = wsDomain.normalizeComicFormat(wsJson.getStringField(record, "comicFormat", "vertical_scroll") as ComicFormat);
    const artStyle = wsDomain.normalizeArtStyle(wsJson.getStringField(record, "artStyle", "comic_style") as ArtStyle);
    return {
      comicFormat,
      comicFormatLabel: wsJson.getStringField(record, "comicFormatLabel", wsDomain.getComicFormatLabel(comicFormat)),
      artStyle,
      artStyleLabel: wsJson.getStringField(record, "artStyleLabel", wsDomain.getArtStyleLabel(artStyle)),
      status: this.normalizeImagePreflightStatus(wsJson.getStringField(record, "status", "ok")),
      note: wsJson.getStringField(record, "note", ""),
    };
  }

  private normalizeImagePreflightIssues(input: unknown): ImagePreflightIssue[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => {
        const type = wsJson.getStringField(item, "type", "unresolved_character");
        return {
          type: type === "missing_storyboard"
            || type === "missing_reference"
            || type === "running_reference_task"
            || type === "missing_scene"
            || type === "missing_style_context"
            ? type
            : "unresolved_character",
          status: this.normalizeImagePreflightStatus(wsJson.getStringField(item, "status", "blocked")) === "warning" ? "warning" : "blocked",
          message: wsJson.getStringField(item, "message", ""),
          relatedName: wsJson.getOptionalStringField(item, "relatedName") ?? undefined,
          relatedCharacterId: wsJson.getOptionalStringField(item, "relatedCharacterId") ?? undefined,
          relatedSceneId: wsJson.getOptionalStringField(item, "relatedSceneId") ?? undefined,
          relatedShotId: wsJson.getOptionalStringField(item, "relatedShotId") ?? undefined,
        };
      });
  }

  private normalizeImagePreflightStatus(value: string): ImagePreflightCharacterCheck["status"] {
    return value === "warning" || value === "blocked" ? value : "ok";
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
