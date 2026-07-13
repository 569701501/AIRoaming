import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
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
  type ChapterLayout,
  type ComicFormat,
  type ImagePreflightCharacterCheck,
  type ImagePreflightIssue,
  type ImagePreflightJson,
  type ImagePreflightSceneCheck,
  type ImagePreflightStyleCheck,
  type ProjectCharacter,
  type ProjectCandidate,
  type ProjectCharacterEntityType,
  type ProjectCharacterLevel,
  type ProjectCharacterReferenceKind,
  type ProjectCharacterStatus,
  type ProjectScriptOutline,
  type ProjectWorkflow,
  type ScriptRevisionItem,
  type StoryDocumentV2,
  type StoryboardDocumentV2,
  type PreflightDocumentV2,
  type WorkbenchAsset,
} from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import type { LocalChapter, LocalChapterScriptVersion, LocalProject } from "./local-types.js";
import * as wsJson from "./workspace-json.util.js";
import * as wsDomain from "./project-domain.util.js";
import * as storyNormalize from "./story-normalize.util.js";
import * as wsCharacter from "./character-domain.util.js";
import {
  LegacyComicFormatDecisionRequiredAggregateError,
  LegacyComicFormatDecisionRequiredError,
  readLegacyProjectComicFormatV1,
} from "./legacy-project-comic-format.js";

const SCRIPT_VERSION_FILE_PATTERN = /^script-v(\d+)\.md$/;

const DB_PROJECT_INCLUDE = {
  chaptersByProject: {
    include: { chapterScriptVersionsByChapter: true },
  },
} satisfies Prisma.ProjectInclude;

type DatabaseProject = Prisma.ProjectGetPayload<{
  include: typeof DB_PROJECT_INCLUDE;
}>;

type DatabaseReadModel = {
  outlines: Prisma.ProjectScriptOutlineGetPayload<{}>[];
  pendings: Prisma.ChapterScriptPendingGetPayload<{}>[];
  revisions: Prisma.ChapterScriptRevisionGetPayload<{}>[];
  stories: Prisma.StoryVersionGetPayload<{}>[];
  storyboards: Prisma.StoryboardVersionGetPayload<{}>[];
  preflights: Prisma.PreflightRevisionGetPayload<{}>[];
  characters: Prisma.CharacterGetPayload<{}>[];
  characterVisuals: Prisma.CharacterVisualGetPayload<{}>[];
  assets: Prisma.AssetGetPayload<{}>[];
  candidates: Prisma.CandidateGetPayload<{}>[];
  shots: Prisma.ShotGetPayload<{}>[];
  locks: Prisma.CandidateLockRevisionGetPayload<{}>[];
  layouts: Prisma.LayoutWorkingCopyGetPayload<{}>[];
};

export type ProjectPersistenceWrite =
  | "create_project"
  | "save_chapter_draft"
  | "complete_chapter"
  | "unsupported";

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

  constructor(
    @Inject(WorkspacePathService)
    private readonly workspacePathService: WorkspacePathService,
    @Optional()
    @Inject(PrismaService)
    private readonly prismaService?: PrismaService,
  ) {}

  // ====== public 缓存 API ======

  async ensureLoaded(): Promise<void> {
    if (this.projectsLoaded) {
      return;
    }
    if (!this.projectsLoadPromise) {
      this.projectsLoadPromise = (
        this.isDatabaseMode()
          ? this.loadProjectsFromDatabase()
          : this.loadProjectsFromWorkspace()
      ).finally(() => {
        this.projectsLoadPromise = null;
      });
    }
    await this.projectsLoadPromise;
  }

  /**
   * Refresh one DB-backed identity-map entry after a focused command write.
   * This deliberately reads Prisma only; it never scans or merges workspace
   * files, so a stale legacy fixture cannot shadow database facts.
   */
  async refreshProjectFromDatabase(projectId: string): Promise<LocalProject> {
    if (!this.isDatabaseMode()) {
      const project = this.projects.get(projectId);
      if (!project) throw new NotFoundException("PROJECT_NOT_FOUND");
      return project;
    }
    const row = await this.database().project.findUnique({ where: { id: projectId }, include: DB_PROJECT_INCLUDE });
    if (!row || row.lifecycleStatus !== "active") {
      this.projects.delete(projectId);
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }
    const readModel = await this.loadDatabaseReadModel([projectId], row.chaptersByProject.map((chapter) => chapter.id));
    const project = this.databaseProjectToLocal(row, readModel);
    this.projects.set(projectId, project);
    return project;
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

  isDatabaseMode(): boolean {
    if (this.prismaService) return this.prismaService.isDatabaseMode();
    if (process.env.AIROAMING_PERSISTENCE_MODE?.trim() === "db") {
      throw new Error("DB_PERSISTENCE_PRISMA_SERVICE_MISSING");
    }
    return false;
  }

  createChapterId(projectId: string, order: number): string {
    const suffix = String(order).padStart(3, "0");
    return this.isDatabaseMode()
      ? `${projectId}_chapter_${suffix}`
      : `chapter_${suffix}`;
  }

  assertDatabaseOperationSupported(operation: string): void {
    if (this.isDatabaseMode()) {
      throw new BadRequestException(
        `DB_PERSISTENCE_OPERATION_UNSUPPORTED:${operation}`,
      );
    }
  }

  // ====== 写入链 ======

  /** 落盘整棵项目树。workflow 由调用方算好传入(依赖 buildImagePreflightJson 业务判断,见候选②)。 */
  async saveProject(
    project: LocalProject,
    workflow: ProjectWorkflow,
    write: ProjectPersistenceWrite = "unsupported",
  ): Promise<void> {
    if (this.isDatabaseMode()) {
      await this.saveProjectToDatabase(project, write);
      return;
    }
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
      comicFormat: this.persistedProjectComicFormat(project),
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

  private persistedProjectComicFormat(project: LocalProject): ComicFormat | 'page_horizontal' {
    return project.persistenceCompatibility?.comicFormatSource.kind === "legacy_alias"
      ? project.persistenceCompatibility.comicFormatSource.rawValue
      : project.comicFormat;
  }
  async clearProjectChaptersDir(projectId: string): Promise<void> {
    this.assertDatabaseOperationSupported("clear_project_chapters");
    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${projectId}`);
    await rm(path.join(projectDir, "chapters"), { recursive: true, force: true });
  }

  async clearLegacyStoryDir(projectId: string): Promise<void> {
    this.assertDatabaseOperationSupported("clear_legacy_story");
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

  private database(): PrismaClient {
    if (!this.prismaService) {
      throw new Error("DB_PERSISTENCE_PRISMA_SERVICE_MISSING");
    }
    return this.prismaService.database();
  }

  private digestText(value: string): string {
    return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.valueOf())) {
      throw new BadRequestException(`DB_PERSISTENCE_DATE_INVALID:${field}`);
    }
    return parsed;
  }

  private toDatabaseComicFormat(value: ComicFormat): string {
    if (value === "vertical_scroll") return value;
    if (value === "paged_comic") return value;
    throw new BadRequestException(`DB_PERSISTENCE_COMIC_FORMAT_UNSUPPORTED:${value}`);
  }

  private fromDatabaseComicFormat(value: string): ComicFormat {
    if (value === "vertical_scroll" || value === "paged_comic") return value;
    throw new Error(`DB_PERSISTENCE_COMIC_FORMAT_INVALID:${value}`);
  }

  private assertDatabaseProjectShape(project: LocalProject): void {
    for (const chapter of project.chapters) {
      if (chapter.projectId !== project.id) {
        throw new BadRequestException("DB_PERSISTENCE_PROJECT_CHAPTER_SCOPE_INVALID");
      }
    }
  }

  private chapterCreateData(
    chapter: LocalChapter,
  ): Prisma.ChapterUncheckedCreateInput {
    return {
      id: chapter.id,
      projectId: chapter.projectId,
      slug: chapter.slug,
      order: chapter.order,
      title: chapter.title,
      milestoneStatus: chapter.status,
      scriptWorkingText: chapter.sourceText,
      scriptWorkingDigest: this.digestText(chapter.sourceText),
      scriptWorkingState: chapter.sourceText.trim() ? "dirty" : "empty",
      summary: chapter.summary || null,
      completedAt: chapter.completedAt
        ? this.parseDate(chapter.completedAt, "chapter.completedAt")
        : null,
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      pendingStoryVersionId: null,
      currentStoryboardVersionId: null,
      pendingStoryboardVersionId: null,
      currentPreflightRevisionId: null,
      currentLayoutRevisionId: null,
      currentExportRevisionId: null,
      lastScriptRevisionId: null,
      rowVersion: 0,
      createdAt: this.parseDate(chapter.createdAt, "chapter.createdAt"),
      updatedAt: this.parseDate(chapter.updatedAt, "chapter.updatedAt"),
    };
  }

  private async createProjectInDatabase(project: LocalProject): Promise<void> {
    if (project.chapters.length !== 1 || project.chapters[0]?.scriptVersions.length) {
      throw new BadRequestException("DB_PERSISTENCE_CREATE_PROJECT_SHAPE_INVALID");
    }
    const currentChapterId = project.currentChapterId;
    if (
      currentChapterId === null ||
      !project.chapters.some((chapter) => chapter.id === currentChapterId)
    ) {
      throw new BadRequestException("DB_PERSISTENCE_CURRENT_CHAPTER_INVALID");
    }
    const database = this.database();
    await database.$transaction(async (transaction) => {
      await transaction.project.create({
        data: {
          id: project.id,
          name: project.name,
          type: project.type,
          lifecycleStatus: "active",
          storyTitle: project.storyTitle,
          genreTags: project.genreTags,
          comicFormat: this.toDatabaseComicFormat(project.comicFormat),
          artStyle: project.artStyle,
          description: project.description,
          currentChapterId: null,
          currentScriptOutlineId: null,
          rowVersion: 0,
          createdAt: this.parseDate(project.createdAt, "project.createdAt"),
          updatedAt: this.parseDate(project.updatedAt, "project.updatedAt"),
          deletingAt: null,
        },
      });
      await transaction.chapter.create({
        data: this.chapterCreateData(project.chapters[0]),
      });
      await transaction.project.update({
        where: { id: project.id },
        data: { currentChapterId },
      });
    });
  }

  private async saveChapterDraftInDatabase(
    previous: LocalProject,
    project: LocalProject,
  ): Promise<void> {
    if (
      project.chapters.length !== previous.chapters.length ||
      project.currentChapterId === null
    ) {
      throw new BadRequestException("DB_PERSISTENCE_DRAFT_TRANSITION_INVALID");
    }
    const chapter = project.chapters.find(
      (candidate) => candidate.id === project.currentChapterId,
    );
    const previousChapter = previous.chapters.find(
      (candidate) => candidate.id === project.currentChapterId,
    );
    if (
      !chapter ||
      !previousChapter ||
      JSON.stringify(chapter.scriptVersions) !==
        JSON.stringify(previousChapter.scriptVersions) ||
      chapter.status !== previousChapter.status ||
      chapter.currentScriptVersionId !== previousChapter.currentScriptVersionId ||
      chapter.completedAt !== previousChapter.completedAt
    ) {
      throw new BadRequestException("DB_PERSISTENCE_DRAFT_TRANSITION_INVALID");
    }
    const workingDigest = this.digestText(chapter.sourceText);
    const currentScriptVersion = chapter.currentScriptVersionId === null
      ? null
      : chapter.scriptVersions.find(
        (version) => version.id === chapter.currentScriptVersionId,
      );
    if (chapter.currentScriptVersionId !== null && !currentScriptVersion) {
      throw new BadRequestException("DB_PERSISTENCE_DRAFT_TRANSITION_INVALID");
    }
    const scriptWorkingState = !chapter.sourceText.trim()
      ? "empty"
      : currentScriptVersion &&
          this.digestText(currentScriptVersion.sourceText) === workingDigest
        ? "clean"
        : "dirty";
    const database = this.database();
    await database.$transaction(async (transaction) => {
      await transaction.chapter.update({
        where: { id: chapter.id },
        data: {
          title: chapter.title,
          summary: chapter.summary || null,
          scriptWorkingText: chapter.sourceText,
          scriptWorkingDigest: workingDigest,
          scriptWorkingState,
          rowVersion: { increment: 1 },
          updatedAt: this.parseDate(chapter.updatedAt, "chapter.updatedAt"),
        },
      });
      await transaction.project.update({
        where: { id: project.id },
        data: {
          storyTitle: project.storyTitle,
          currentChapterId: project.currentChapterId,
          rowVersion: { increment: 1 },
          updatedAt: this.parseDate(project.updatedAt, "project.updatedAt"),
        },
      });
    });
  }

  private async completeChapterInDatabase(
    previous: LocalProject,
    project: LocalProject,
  ): Promise<void> {
    const completionCandidates = project.chapters.flatMap((candidate) => {
      const prior = previous.chapters.find((item) => item.id === candidate.id);
      if (!prior) return [];
      const priorVersionIds = new Set(
        prior.scriptVersions.map((version) => version.id),
      );
      const addedVersions = candidate.scriptVersions.filter(
        (version) => !priorVersionIds.has(version.id),
      );
      return addedVersions.length > 0
        ? [{ chapter: candidate, previousChapter: prior, addedVersions }]
        : [];
    });
    const completion = completionCandidates[0];
    const chapter = completion?.chapter;
    const previousChapter = completion?.previousChapter;
    const newVersions = completion?.addedVersions ?? [];
    const newChapters = project.chapters.filter(
      (candidate) => !previous.chapters.some((item) => item.id === candidate.id),
    );
    const version = newVersions[0];
    if (
      !chapter ||
      !previousChapter ||
      completionCandidates.length !== 1 ||
      chapter.status !== "script_done" ||
      newVersions.length !== 1 ||
      chapter.currentScriptVersionId !== version?.id ||
      newChapters.length > 1 ||
      newChapters.some(
        (candidate) =>
          candidate.sourceText !== "" || candidate.scriptVersions.length > 0,
      )
    ) {
      throw new BadRequestException("DB_PERSISTENCE_COMPLETE_TRANSITION_INVALID");
    }

    const database = this.database();
    await database.$transaction(async (transaction) => {
      for (const newChapter of newChapters) {
        await transaction.chapter.create({ data: this.chapterCreateData(newChapter) });
      }
      await transaction.chapterScriptVersion.create({
        data: {
          id: version.id,
          chapterId: chapter.id,
          version: version.version,
          sourceText: version.sourceText,
          sourceDigest: this.digestText(version.sourceText),
          origin: "user",
          createdAt: this.parseDate(version.createdAt, "scriptVersion.createdAt"),
          completedAt: chapter.completedAt
            ? this.parseDate(chapter.completedAt, "chapter.completedAt")
            : null,
        },
      });
      await transaction.chapter.update({
        where: { id: chapter.id },
        data: {
          title: chapter.title,
          milestoneStatus: chapter.status,
          scriptWorkingText: chapter.sourceText,
          scriptWorkingDigest: this.digestText(chapter.sourceText),
          scriptWorkingState: "clean",
          summary: chapter.summary || null,
          completedAt: chapter.completedAt
            ? this.parseDate(chapter.completedAt, "chapter.completedAt")
            : null,
          currentScriptVersionId: version.id,
          rowVersion: { increment: 1 },
          updatedAt: this.parseDate(chapter.updatedAt, "chapter.updatedAt"),
        },
      });
      await transaction.project.update({
        where: { id: project.id },
        data: {
          storyTitle: project.storyTitle,
          currentChapterId: project.currentChapterId,
          rowVersion: { increment: 1 },
          updatedAt: this.parseDate(project.updatedAt, "project.updatedAt"),
        },
      });
    });
  }

  private async saveProjectToDatabase(
    project: LocalProject,
    write: ProjectPersistenceWrite,
  ): Promise<void> {
    this.assertDatabaseProjectShape(project);
    const previous = this.projects.get(project.id);
    if (write === "create_project" && previous === undefined) {
      await this.createProjectInDatabase(project);
      return;
    }
    if (write === "save_chapter_draft" && previous !== undefined) {
      await this.saveChapterDraftInDatabase(previous, project);
      return;
    }
    if (write === "complete_chapter" && previous !== undefined) {
      await this.completeChapterInDatabase(previous, project);
      return;
    }
    throw new BadRequestException(
      `DB_PERSISTENCE_OPERATION_UNSUPPORTED:${write}`,
    );
  }

  private async loadProjectsFromDatabase(): Promise<void> {
    const rows = await this.database().project.findMany({
      where: { lifecycleStatus: "active" },
      include: DB_PROJECT_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    const projectIds = rows.map((row) => row.id);
    const chapterIds = rows.flatMap((row) => row.chaptersByProject.map((chapter) => chapter.id));
    const readModel = await this.loadDatabaseReadModel(projectIds, chapterIds);
    for (const row of rows) {
      const project = this.databaseProjectToLocal(row, readModel);
      this.projects.set(project.id, project);
    }
    this.projectsLoaded = true;
  }

  private async loadDatabaseReadModel(projectIds: string[], chapterIds: string[]): Promise<DatabaseReadModel> {
    if (projectIds.length === 0) {
      return { outlines: [], pendings: [], revisions: [], stories: [], storyboards: [], preflights: [], characters: [], characterVisuals: [], assets: [], candidates: [], shots: [], locks: [], layouts: [] };
    }
    const database = this.database();
    const [outlines, pendings, revisions, stories, storyboards, preflights, characters, characterVisuals, assets, candidates, shots, locks, layouts] = await Promise.all([
      database.projectScriptOutline.findMany({ where: { projectId: { in: projectIds } } }),
      database.chapterScriptPending.findMany({ where: { chapterId: { in: chapterIds } } }),
      database.chapterScriptRevision.findMany({ where: { chapterId: { in: chapterIds } }, orderBy: { createdAt: "desc" } }),
      database.storyVersion.findMany({ where: { projectId: { in: projectIds } } }),
      database.storyboardVersion.findMany({ where: { projectId: { in: projectIds } } }),
      database.preflightRevision.findMany({ where: { projectId: { in: projectIds } } }),
      database.character.findMany({ where: { projectId: { in: projectIds } } }),
      database.characterVisual.findMany({ where: { character: { projectId: { in: projectIds } } } }),
      database.asset.findMany({ where: { projectId: { in: projectIds } } }),
      database.candidate.findMany({ where: { projectId: { in: projectIds } } }),
      database.shot.findMany({ where: { projectId: { in: projectIds } } }),
      database.candidateLockRevision.findMany({ where: { projectId: { in: projectIds } } }),
      database.layoutWorkingCopy.findMany({ where: { projectId: { in: projectIds } } }),
    ]);
    return { outlines, pendings, revisions, stories, storyboards, preflights, characters, characterVisuals, assets, candidates, shots, locks, layouts };
  }

  private databaseProjectToLocal(row: DatabaseProject, readModel: DatabaseReadModel): LocalProject {
    const projectOutlines = readModel.outlines.filter((item) => item.projectId === row.id);
    const projectCharacters = readModel.characters.filter((item) => item.projectId === row.id);
    const projectAssets = readModel.assets.filter((item) => item.projectId === row.id);
    const outline = projectOutlines.find((item) => item.id === row.currentScriptOutlineId)
      ?? projectOutlines.sort((left, right) => right.version - left.version)[0];
    const chapters = [...row.chaptersByProject]
      .sort((left, right) => left.order - right.order)
      .map((chapter): LocalChapter => {
        const versions = [...chapter.chapterScriptVersionsByChapter]
          .sort((left, right) => left.version - right.version)
          .map((version): LocalChapterScriptVersion => ({
            id: version.id,
            projectId: chapter.projectId,
            chapterId: chapter.id,
            version: version.version,
            sourcePath: `projects/${chapter.projectId}/chapters/${chapter.slug}/script.versions/script-v${String(version.version).padStart(3, "0")}.md`,
            status:
              version.id === chapter.currentScriptVersionId
                ? "current"
                : "archived",
            createdAt: version.createdAt.toISOString(),
            sourceText: version.sourceText,
          }));
        const currentStory = readModel.stories.find((item) => item.id === chapter.currentStoryVersionId) ?? null;
        const pendingStory = readModel.stories.find((item) => item.id === chapter.pendingStoryVersionId) ?? null;
        const currentStoryboard = readModel.storyboards.find((item) => item.id === chapter.currentStoryboardVersionId) ?? null;
        const pendingStoryboard = readModel.storyboards.find((item) => item.id === chapter.pendingStoryboardVersionId) ?? null;
        const currentPreflight = readModel.preflights.find((item) => item.id === chapter.currentPreflightRevisionId) ?? null;
        const layout = readModel.layouts.find((item) => item.chapterId === chapter.id) ?? null;
        const pending = readModel.pendings.find((item) => item.chapterId === chapter.id) ?? null;
        const revision = readModel.revisions.find((item) => item.id === chapter.lastScriptRevisionId) ?? null;
        const chapterCandidates = readModel.candidates.filter((item) => item.chapterId === chapter.id);
        const chapterShots = readModel.shots.filter((item) => item.chapterId === chapter.id);
        const chapterLocks = readModel.locks.filter((item) => item.chapterId === chapter.id);
        return {
          id: chapter.id,
          projectId: chapter.projectId,
          slug: chapter.slug,
          order: chapter.order,
          title: chapter.title,
          status: wsDomain.normalizeChapterStatus(chapter.milestoneStatus),
          currentScriptVersionId: chapter.currentScriptVersionId,
          currentStoryVersionId: chapter.currentStoryVersionId,
          sourceText: chapter.scriptWorkingText,
          summary: chapter.summary ?? "",
          storyStructure: currentStory ? this.databaseStoryToLocal(currentStory, chapter) : null,
          storyboard: currentStoryboard ? this.databaseStoryboardToLocal(currentStoryboard, chapter, chapterShots, chapterLocks, readModel.candidates) : null,
          pendingStoryboard: pendingStoryboard ? this.databaseStoryboardToLocal(pendingStoryboard, chapter, chapterShots, chapterLocks, readModel.candidates) : null,
          pendingSourceText: pending ? this.databasePendingSourceToLocal(pending) : null,
          imagePreflight: currentPreflight ? this.databasePreflightToLocal(currentPreflight, chapter) : null,
          candidates: chapterCandidates.map((item) => this.databaseCandidateToLocal(item, chapterLocks)),
          layout: layout ? this.databaseLayoutToLocal(layout) : null,
          createdAt: chapter.createdAt.toISOString(),
          updatedAt: chapter.updatedAt.toISOString(),
          completedAt: chapter.completedAt?.toISOString() ?? null,
          scriptVersions: versions,
          lastScriptRevision: revision ? this.databaseRevisionToLocal(revision, chapter.projectId, chapter.id) : null,
        };
      });
    if (row.currentChapterId === null) {
      throw new Error(`DB_PERSISTENCE_CURRENT_CHAPTER_INVALID:${row.id}:null`);
    }
    const currentChapter = chapters.find(
      (chapter) => chapter.id === row.currentChapterId,
    );
    if (!currentChapter) {
      throw new Error(
        `DB_PERSISTENCE_CURRENT_CHAPTER_INVALID:${row.id}:${row.currentChapterId}`,
      );
    }
    const genreTags = Array.isArray(row.genreTags)
      ? row.genreTags.filter((tag): tag is string => typeof tag === "string")
      : [];
    return {
      id: row.id,
      name: row.name,
      type: wsDomain.normalizeProjectType(row.type),
      currentChapterId: currentChapter.id,
      storyTitle: row.storyTitle ?? row.name,
      genreTags,
      comicFormat: this.fromDatabaseComicFormat(row.comicFormat),
      artStyle: wsDomain.normalizeArtStyle(row.artStyle as ArtStyle | undefined),
      description: row.description ?? row.storyTitle ?? row.name,
      sourceText: currentChapter.sourceText,
      scriptOutline: outline ? this.databaseOutlineToLocal(outline) : null,
      characters: projectCharacters.map((item) => this.databaseCharacterToLocal(item, readModel.characterVisuals)),
      assets: projectAssets.map((item) => this.databaseAssetToLocal(item)),
      chapters,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private databaseOutlineToLocal(row: Prisma.ProjectScriptOutlineGetPayload<{}>): ProjectScriptOutline {
    return {
      id: row.id,
      projectId: row.projectId,
      status: row.status === "confirmed" ? "confirmed" : "draft",
      title: row.title,
      sourceText: row.sourceText,
      outlinePath: `projects/${row.projectId}/script-outline.md`,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    };
  }

  private databaseStoryToLocal(
    row: Prisma.StoryVersionGetPayload<{}>,
    chapter: DatabaseProject["chaptersByProject"][number],
  ): ChapterStoryStructure {
    const document = this.jsonRecord(row.documentJson) as Partial<StoryDocumentV2>;
    const structureJson = {
      schemaVersion: 1 as const,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceScriptVersionId: row.sourceScriptVersionId,
      synopsis: typeof document.synopsis === "string" ? document.synopsis : "",
      direction: document.direction ?? { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" },
      characters: Array.isArray(document.characters) ? document.characters.map((item) => ({ ...item, level: item.level ?? "extra", entityType: item.entityType ?? "human" })) : [],
      scenes: Array.isArray(document.scenes) ? document.scenes : [],
      beats: Array.isArray(document.beats) ? document.beats : [],
      notes: typeof document.notes === "string" ? document.notes : "",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    return {
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId,
      version: row.version,
      status: row.status === "confirmed" ? "structured" : "pending_confirmation",
      structurePath: `projects/${row.projectId}/chapters/${chapter.slug}/structure.json`,
      sourceScriptVersionId: row.sourceScriptVersionId,
      structureJson,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    };
  }

  private databaseStoryboardToLocal(
    row: Prisma.StoryboardVersionGetPayload<{}>,
    chapter: DatabaseProject["chaptersByProject"][number],
    shots: Prisma.ShotGetPayload<{}>[],
    locks: Prisma.CandidateLockRevisionGetPayload<{}>[],
    candidates: Prisma.CandidateGetPayload<{}>[],
  ): ChapterStoryboard {
    const document = this.jsonRecord(row.documentJson) as Partial<StoryboardDocumentV2>;
    const shotRows = new Map(shots.map((item) => [item.id, item]));
    const lockRows = new Map(locks.map((item) => [item.id, item]));
    const candidateRows = new Map(candidates.map((item) => [item.id, item]));
    const storyboardJson = {
      schemaVersion: 1 as const,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceStoryVersionId: row.sourceStoryVersionId,
      shots: Array.isArray(document.shots) ? document.shots.map((item) => {
        const shot = shotRows.get(item.id);
        const lock = shot?.currentCandidateLockRevisionId ? lockRows.get(shot.currentCandidateLockRevisionId) : undefined;
        const candidate = lock?.candidateId ? candidateRows.get(lock.candidateId) : undefined;
        return {
          ...item,
          lockedCandidateId: lock?.candidateId ?? null,
          status: lock?.candidateId ? "locked" as const : candidate ? "image_generated" as const : "ready_for_image" as const,
        };
      }) : [],
      notes: typeof document.notes === "string" ? document.notes : "",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    return {
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId,
      version: row.version,
      status: row.status === "confirmed" ? "storyboard_done" : "pending_confirmation",
      storyboardPath: `projects/${row.projectId}/chapters/${chapter.slug}/storyboard.json`,
      sourceStoryVersionId: row.sourceStoryVersionId,
      storyboardJson,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    };
  }

  private databasePreflightToLocal(
    row: Prisma.PreflightRevisionGetPayload<{}>,
    chapter: DatabaseProject["chaptersByProject"][number],
  ): ChapterImagePreflight {
    const document = this.jsonRecord(row.documentJson) as Partial<PreflightDocumentV2>;
    const characterChecks = Array.isArray(document.characterChecks) ? document.characterChecks : [];
    const sourceSnapshot = document.sourceSnapshot;
    const preflightJson = {
      schemaVersion: 1 as const,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceStoryboardId: sourceSnapshot?.storyboard?.id ?? row.sourceStoryboardVersionId,
      sourceStoryboardUpdatedAt: null,
      shotCount: typeof document.shotCount === "number" ? document.shotCount : 0,
      unresolvedCharacters: characterChecks.filter((item) => !item.referenceReady).map((item) => item.name),
      characterChecks,
      sceneChecks: Array.isArray(document.sceneChecks) ? document.sceneChecks : [],
      styleCheck: (document.styleCheck ? {
        ...document.styleCheck,
        artStyle: wsDomain.normalizeArtStyle(document.styleCheck.artStyle as ArtStyle),
        comicFormat: document.styleCheck.comicFormat === "paged_comic" ? "paged_comic" : "vertical_scroll",
      } : { comicFormat: "vertical_scroll" as const, comicFormatLabel: "", artStyle: "comic_style" as const, artStyleLabel: "", status: "ok" as const, note: "" }) as ImagePreflightStyleCheck,
      issues: Array.isArray(document.issues) ? document.issues.map((item) => ({ ...item, relatedName: item.relatedName ?? undefined, relatedCharacterId: item.relatedCharacterId ?? undefined, relatedSceneId: item.relatedSceneId ?? undefined, relatedShotId: item.relatedShotId ?? undefined })) : [],
      ready: Boolean(document.ready),
      notes: typeof document.notes === "string" ? document.notes : "",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.createdAt.toISOString(),
    };
    return {
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId,
      version: row.version,
      status: "confirmed",
      preflightPath: `projects/${row.projectId}/chapters/${chapter.slug}/preflight.json`,
      sourceStoryboardId: preflightJson.sourceStoryboardId,
      sourceStoryboardUpdatedAt: preflightJson.sourceStoryboardUpdatedAt,
      preflightJson,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? row.createdAt.toISOString(),
    };
  }

  private databasePendingSourceToLocal(row: Prisma.ChapterScriptPendingGetPayload<{}>): ChapterPendingSourceText {
    const operation = row.operation === "generate_script_from_seed" || row.operation === "update_chapter_draft"
      ? row.operation
      : "generate_script_from_outline";
    return { sourceText: row.sourceText, threadId: row.threadId, messageId: row.messageId, toolCallId: row.toolCallId, operation, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  private databaseRevisionToLocal(row: Prisma.ChapterScriptRevisionGetPayload<{}>, projectId: string, chapterId: string): ScriptRevisionItem {
    return { id: row.id, projectId, chapterId, source: "ai_tool", threadId: row.threadId, messageId: row.messageId, toolCallId: row.toolCallId, operation: row.operation as ScriptRevisionItem["operation"], summary: row.summary, createdAt: row.createdAt.toISOString() };
  }

  private databaseCandidateToLocal(row: Prisma.CandidateGetPayload<{}>, locks: Prisma.CandidateLockRevisionGetPayload<{}>[] = []): ProjectCandidate {
    const status = locks.some((lock) => lock.candidateId === row.id && lock.action === "lock") ? "locked" : ["generated", "selected", "locked", "rejected", "superseded"].includes(row.status) ? row.status as ProjectCandidate["status"] : "generated";
    return { id: row.id, projectId: row.projectId, chapterId: row.chapterId, shotId: row.shotId, taskId: row.taskId, assetId: row.assetId, index: row.index, status, label: row.label, promptDigest: row.promptDigest ?? "", generationPurpose: row.generationPurpose === "legacy_unspecified" ? undefined : row.generationPurpose as ProjectCandidate["generationPurpose"], generationSpecVersion: row.generationSpecVersion ?? undefined, generationSpecDigest: row.generationSpecDigest ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  private databaseAssetToLocal(row: Prisma.AssetGetPayload<{}>): WorkbenchAsset {
    const metadata = this.jsonRecord(row.metadataJson);
    const publicMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "legacyName" && key !== "legacyPath" && key !== "physicalEvidence"));
    const name = typeof metadata.legacyName === "string" ? metadata.legacyName : typeof metadata.name === "string" ? metadata.name : path.basename(row.storageKey) || "未命名素材";
    const type = ["audio", "video", "document", "archive"].includes(row.type) ? row.type : "image";
    return { id: row.id, chapterId: row.chapterId, type: type as WorkbenchAsset["type"], name, path: typeof metadata.legacyPath === "string" ? metadata.legacyPath : row.storageKey, sourceTaskId: row.sourceTaskId, meta: JSON.stringify(publicMetadata) };
  }

  private databaseCharacterToLocal(row: Prisma.CharacterGetPayload<{}>, visuals: Prisma.CharacterVisualGetPayload<{}>[]): ProjectCharacter {
    const ownVisuals = visuals.filter((item) => item.characterId === row.id).sort((left, right) => left.version - right.version);
    const preview = ownVisuals.find((item) => item.id === row.previewVisualId);
    const primary = ownVisuals.find((item) => item.id === row.primaryVisualId);
    const level = wsCharacter.normalizeCharacterLevel(row.level);
    return { id: row.id, projectId: row.projectId, name: wsCharacter.normalizeCharacterName(row.name), role: row.role, level, entityType: wsCharacter.normalizeEntityType(row.entityType), status: wsCharacter.normalizeCharacterStatus(row.status), appearance: row.appearance, personality: row.personality, promptFragment: row.promptFragment, referenceAssetIds: ownVisuals.map((item) => item.assetId), previewReferenceAssetId: preview?.assetId ?? null, previewConfirmedAt: preview?.confirmedAt?.toISOString() ?? null, primaryReferenceAssetId: primary?.assetId ?? null, primaryReferenceKind: wsCharacter.normalizeCharacterReferenceKind(primary?.kind ?? "none"), visualVersion: ownVisuals.length ? Math.max(...ownVisuals.map((item) => item.version)) : 0, source: ["imported_script", "manual", "story_structure", "image_preflight"].includes(row.source) ? row.source as ProjectCharacter["source"] : "script_outline", createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), finalizedAt: row.finalizedAt?.toISOString() ?? null };
  }

  private databaseLayoutToLocal(row: Prisma.LayoutWorkingCopyGetPayload<{}>): ChapterLayout | null {
    const envelope = this.jsonRecord(row.documentJson);
    const legacy = envelope.legacyDocument;
    return legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy as ChapterLayout : null;
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  // ====== 加载链 ======

  private async loadProjectsFromWorkspace(): Promise<void> {
    await this.workspacePathService.ensureReady();

    const projectsDir = this.workspacePathService.resolveVirtualPath("/workspace/projects");
    const entries = await wsJson.readOptionalDirectory(projectsDir);
    const decisionIssues: LegacyComicFormatDecisionRequiredError[] = [];
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
        if (error instanceof LegacyComicFormatDecisionRequiredError) {
          decisionIssues.push(error);
          continue;
        }
        this.logger.warn("Skip project workspace " + entry.name + ": " + this.getErrorMessage(error));
     }
   }

    this.projectsLoaded = true;
    if (decisionIssues.length > 0) {
      this.projectsLoaded = false;
      throw new LegacyComicFormatDecisionRequiredAggregateError(
        decisionIssues.map((item) => item.issue),
      );
    }
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
    const comicFormatRead = readLegacyProjectComicFormatV1(metadata.comicFormat);
    if (comicFormatRead.status === "decision_required") {
      throw new LegacyComicFormatDecisionRequiredError({
        projectId,
        reason: comicFormatRead.reason,
        safeValueKind: comicFormatRead.safeValueKind,
      });
    }

    return {
      id: projectId,
      name: wsJson.getStringField(metadata, "name", projectId),
      type: wsDomain.normalizeProjectType(metadata.type),
      currentChapterId: currentChapter?.id ?? null,
      storyTitle,
      genreTags: wsJson.getStringArrayField(metadata, "genreTags"),
      comicFormat: comicFormatRead.runtimeValue,
      artStyle: wsDomain.normalizeArtStyle(metadata.artStyle as ArtStyle | undefined),
      description: wsJson.getStringField(metadata, "description", storyTitle),
      sourceText,
      scriptOutline,
      characters,
      assets,
      chapters: wsDomain.sortChapters(readyChapters),
      createdAt,
      updatedAt,
      persistenceCompatibility: comicFormatRead.status === "auto_mapped_read_only"
        ? {
            comicFormatSource: {
              kind: "legacy_alias",
              rawValue: comicFormatRead.mappedFrom,
              policyVersion: comicFormatRead.policyVersion,
            },
          }
        : undefined,
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
    const comicFormatRead = readLegacyProjectComicFormatV1(record.comicFormat);
    if (comicFormatRead.status === "decision_required") {
      throw new Error("LEGACY_PREFLIGHT_COMIC_FORMAT_DECISION_REQUIRED:" + comicFormatRead.reason);
    }
    const comicFormat = comicFormatRead.runtimeValue;
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
