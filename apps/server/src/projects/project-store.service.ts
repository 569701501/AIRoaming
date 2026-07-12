import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as path from "node:path";
import { type ProjectCharacterReferenceKind } from "@airoaming/shared";
import * as wsJson from "./workspace-json.util.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as workflowUtil from "./workflow.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import {
  ProjectRepository,
  type ProjectPersistenceWrite,
} from "./project-repository.service.js";

/**
 * 项目读写骨架(从 ProjectsService 抽出,见任务 2026-06-24_ProjectStore骨架抽取)。
 *
 * 收口项目级的"加载→确保默认章→读写"统一入口,被 71 处调用。
 * 独立成 service 后,角色/章节/结构/分镜等编排可依赖 ProjectStore 而非 ProjectsService,
 * 打破骨架与编排的循环耦合(第四轮发现的 writeProjectFiles ↔ hasActiveCharacterReferenceTask)。
 *
 * writeProjectFiles 构造 workflow 时需要查询"是否有运行中的角色参考图任务"。
 * 该查询依赖 TasksService(在 ProjectsService 手里),通过 referenceTaskChecker 回调懒绑定:
 * ProjectsService.onModuleInit 时调用 setReferenceTaskChecker 注入。
 */
@Injectable()
export class ProjectStore {
  private referenceTaskChecker: (projectId: string, characterId: string, referenceKind: ProjectCharacterReferenceKind) => boolean = () => false;

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
  ) {}

  /** 注入角色参考图任务状态查询回调(由 ProjectsService.onModuleInit 调用)。 */
  setReferenceTaskChecker(checker: (projectId: string, characterId: string, referenceKind: ProjectCharacterReferenceKind) => boolean): void {
    this.referenceTaskChecker = checker;
  }

  /** 读:加载缓存 + 取项目 + 确保默认章就绪。 */
  async getReadyProject(projectId: string): Promise<LocalProject> {
    await this.ensureProjectsLoaded();
    const project = this.repository.getProject(projectId);
    if (!project) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }
    return this.ensureDefaultChapterReady(project);
  }

  /** 写:构造 workflow(含角色任务状态回调)+ 落盘。 */
  async writeProjectFiles(
    project: LocalProject,
    write: ProjectPersistenceWrite = "unsupported",
  ): Promise<void> {
    if (this.repository.isDatabaseMode()) {
      await this.repository.saveProject(
        project,
        workflowUtil.buildProjectWorkflow(project, wsDomain.getCurrentChapter(project), false),
        write,
      );
      return;
    }
    const currentChapter = wsDomain.getCurrentChapter(project) ?? wsDomain.createDefaultChapter(project.id, project.sourceText, project.createdAt);
    const workflow = workflowUtil.buildProjectWorkflow(
      project,
      currentChapter,
      imagePreflightUtil.isChapterImagePreflightReady(project, currentChapter, (pid, cid) => this.referenceTaskChecker(pid, cid, "final_reference")),
    );
    await this.repository.saveProject(project, workflow, write);
  }

  /** 切换当前章节(写回 currentChapterId)。 */
  async selectCurrentChapter(project: LocalProject, chapterId: string | undefined): Promise<LocalProject> {
    if (!chapterId || project.currentChapterId === chapterId) {
      return project;
    }

    this.findChapter(project, chapterId);
    const currentChapter = project.chapters.find((chapter) => chapter.id === chapterId);
    const nextProject: LocalProject = {
      ...project,
      currentChapterId: chapterId,
      sourceText: currentChapter?.sourceText ?? project.sourceText,
      updatedAt: new Date().toISOString(),
    };

    await this.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return nextProject;
  }

  /** 确保项目索引已加载。 */
  async ensureProjectsLoaded(): Promise<void> {
    await this.repository.ensureLoaded();
  }

  /** 确保默认章节就绪:读 script.md 兜底 sourceText + 写回。 */
  async ensureDefaultChapterReady(project: LocalProject): Promise<LocalProject> {
    if (this.repository.isDatabaseMode()) {
      return project;
    }
    const current = wsDomain.getCurrentChapter(project);
    const defaultChapter = current ?? wsDomain.createDefaultChapter(project.id, project.sourceText, project.createdAt);
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    const chapterScriptPath = path.join(projectDir, "chapters", defaultChapter.slug, "script.md");
    const chapterSourceText = await wsJson.readOptionalTextFile(chapterScriptPath);
    // 空字符串兜底:script.md 为空文件(0字节)时,?? 不会触发(空串非 null),
    // 会导致空串传播到 chapter.sourceText 并写回,形成数据损坏死循环。
    // 改用显式空判断,空串时回退到 defaultChapter/project 的 sourceText。
    const sourceText = chapterSourceText && chapterSourceText.trim()
      ? chapterSourceText
      : (defaultChapter.sourceText || project.sourceText);
    const updatedAt = sourceText === defaultChapter.sourceText ? defaultChapter.updatedAt : new Date().toISOString();
    const readyChapter: LocalChapter = {
      ...defaultChapter,
      sourceText,
      updatedAt,
      scriptVersions: defaultChapter.scriptVersions ?? [],
    };
    const chapters = project.chapters.some((chapter) => chapter.id === readyChapter.id)
      ? project.chapters.map((chapter) => (chapter.id === readyChapter.id ? readyChapter : chapter))
      : [readyChapter, ...project.chapters];
    const readyProject: LocalProject = {
      ...project,
      currentChapterId: project.currentChapterId ?? readyChapter.id,
      sourceText,
      chapters,
      updatedAt: sourceText === project.sourceText ? project.updatedAt : updatedAt,
    };

    await this.writeProjectFiles(readyProject);
    this.repository.setProject(readyProject);
    return readyProject;
  }

  /** 校验项目仍活跃(未被删除)。 */
  assertProjectStillActive(projectId: string): void {
    if (!this.repository.hasProject(projectId)) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }
  }

  /** 查找章节,不存在抛 CHAPTER_NOT_FOUND。 */
  findChapter(project: LocalProject, chapterId: string): LocalChapter {
    const chapter = project.chapters.find((item) => item.id === chapterId);
    if (!chapter) {
      throw new NotFoundException("CHAPTER_NOT_FOUND");
    }
    return chapter;
  }

  /** 返回替换指定章节后的新 project(不可变更新)。 */
  withUpdatedChapter(project: LocalProject, chapter: LocalChapter): LocalProject {
    return {
      ...project,
      chapters: wsDomain.sortChapters(project.chapters.map((item) => (item.id === chapter.id ? chapter : item))),
    };
  }
}
