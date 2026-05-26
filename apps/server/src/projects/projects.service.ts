import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  ART_STYLES,
  COMIC_FORMATS,
  type ArtStyle,
  type ComicFormat,
  type CreateProjectRequest,
  type DeleteProjectResponse,
  type ProjectListItem,
  type ProjectType,
  type UpdateProjectDraftRequest,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import { TasksService } from "../tasks/tasks.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

interface LocalProject {
  id: string;
  name: string;
  type: ProjectType;
  storyTitle: string;
  genreTags: string[];
  comicFormat: ComicFormat;
  artStyle: ArtStyle;
  description: string;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProjectsService {
  private readonly projects = new Map<string, LocalProject>();

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(TasksService) private readonly tasksService: TasksService,
  ) {}

  listProjects(): ProjectListItem[] {
    return [...this.projects.values()]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((project) => this.toProjectListItem(project));
  }

  async createProject(input: CreateProjectRequest): Promise<ProjectListItem> {
    const now = new Date().toISOString();
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("PROJECT_NAME_REQUIRED");
    }

    const storyTitle = input.storyTitle?.trim() || input.description?.trim() || name;
    const description = input.description?.trim() || storyTitle;
    const comicFormat = this.normalizeComicFormat(input.comicFormat);
    const artStyle = this.normalizeArtStyle(input.artStyle);
    const genreTags = this.normalizeGenreTags(input.genreTags);

    const project: LocalProject = {
      id: randomUUID(),
      name,
      type: input.type,
      storyTitle,
      genreTags,
      comicFormat,
      artStyle,
      description,
      sourceText: input.sourceText?.trim() ?? "",
      createdAt: now,
      updatedAt: now,
    };

    await this.writeProjectFiles(project);
    this.projects.set(project.id, project);
    return this.toProjectListItem(project);
  }

  async updateProjectDraft(projectId: string, input: UpdateProjectDraftRequest): Promise<ProjectListItem> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }

    const nextName = input.name === undefined ? project.name : input.name.trim();
    if (!nextName) {
      throw new BadRequestException("PROJECT_NAME_REQUIRED");
    }

    const nextStoryTitle = input.storyTitle === undefined ? project.storyTitle : input.storyTitle.trim();
    const nextDescription = input.description === undefined ? project.description : input.description.trim();

    const nextProject: LocalProject = {
      ...project,
      name: nextName,
      storyTitle: nextStoryTitle || nextName,
      genreTags: input.genreTags === undefined ? project.genreTags : this.normalizeGenreTags(input.genreTags),
      comicFormat: input.comicFormat === undefined ? project.comicFormat : this.normalizeComicFormat(input.comicFormat),
      artStyle: input.artStyle === undefined ? project.artStyle : this.normalizeArtStyle(input.artStyle),
      description: nextDescription || nextStoryTitle || nextName,
      sourceText: input.sourceText === undefined ? project.sourceText : input.sourceText,
      updatedAt: new Date().toISOString(),
    };

    await this.writeProjectFiles(nextProject);
    this.projects.set(nextProject.id, nextProject);
    return this.toProjectListItem(nextProject);
  }

  async deleteProject(projectId: string): Promise<DeleteProjectResponse> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }

    await this.workspacePathService.ensureReady();
    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    await rm(projectDir, { recursive: true, force: true });
    const deletedTaskCount = this.tasksService.deleteByProjectId(project.id);
    this.projects.delete(project.id);

    return {
      deletedProjectId: project.id,
      deletedTaskCount,
    };
  }

  getWorkbenchSnapshot(projectId: string): WorkbenchSnapshot {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new NotFoundException("PROJECT_NOT_FOUND");
    }

    const hasStory = project.sourceText.trim().length > 0;

    return {
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        status: hasStory ? "story_ready" : "draft",
        storyTitle: project.storyTitle,
        genreTags: project.genreTags,
        comicFormat: project.comicFormat,
        artStyle: project.artStyle,
        description: project.description,
        updatedAt: project.updatedAt,
      },
      stages: [
        {
          key: "project_story",
          label: "剧本",
          status: "active",
          summary: hasStory ? "故事草稿已保存，可进入剧情分析" : "补充故事原文后进入剧情分析",
          evidence: `/workspace/projects/${project.id}`,
        },
        {
          key: "story_structure",
          label: "剧情结构",
          status: "waiting",
          summary: hasStory ? "等待 AI 分析剧情" : "需要先保存故事原文",
          evidence: "story_parse",
        },
        {
          key: "storyboard",
          label: "分镜工作台",
          status: "waiting",
          summary: "结构化剧情后生成分镜",
          evidence: "shot_generate",
        },
        {
          key: "image_candidates",
          label: "候选图工作台",
          status: "waiting",
          summary: "分镜确认后生成候选图",
          evidence: "image_generate",
        },
        {
          key: "layout_export",
          label: "排版导出",
          status: "waiting",
          summary: "锁定候选后进入排版导出",
          evidence: "layout_export",
        },
        {
          key: "asset_package",
          label: "素材包",
          status: "waiting",
          summary: "导出后归档素材和 manifest",
          evidence: "asset_package_export",
        },
      ],
      story: {
        id: "story_draft",
        title: project.storyTitle,
        sourceText: project.sourceText,
        summary: hasStory ? "故事已进入项目，下一步执行结构化剧情。" : "还没有故事原文。",
        beats: [],
      },
      shots: [],
      candidates: [],
      assets: [],
      aiNotes: [
        {
          role: "orchestrator",
          title: "当前阶段",
          body: hasStory ? "可以运行 story_parse，生成结构化剧情和剧情节拍。" : "先补充故事原文，再进入结构化任务。",
        },
        {
          role: "worker",
          title: "数据边界",
          body: "项目创建后进入工作台，故事、分镜、候选图都应挂到 projectId 下。",
        },
        {
          role: "reviewer",
          title: "验收关注",
          body: "项目入口必须可返回，工作台不能替代项目管理页。",
        },
      ],
    };
  }

  private normalizeGenreTags(input: string[] | undefined): string[] {
    const tags = input?.map((tag) => tag.trim()).filter(Boolean) ?? [];
    return [...new Set(tags)].slice(0, 12);
  }

  private normalizeComicFormat(input: ComicFormat | undefined): ComicFormat {
    return input && COMIC_FORMATS.includes(input) ? input : "vertical_scroll";
  }

  private normalizeArtStyle(input: ArtStyle | undefined): ArtStyle {
    return input && ART_STYLES.includes(input) ? input : "dark_realistic";
  }

  private toProjectListItem(project: LocalProject): ProjectListItem {
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      status: project.sourceText.trim().length > 0 ? "story_ready" : "draft",
      storyTitle: project.storyTitle,
      genreTags: project.genreTags,
      comicFormat: project.comicFormat,
      artStyle: project.artStyle,
      description: project.description,
      sourceTextPreview: project.sourceText.slice(0, 96),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private async writeProjectFiles(project: LocalProject): Promise<void> {
    await this.workspacePathService.ensureReady();

    const projectDir = this.workspacePathService.resolveVirtualPath(`/workspace/projects/${project.id}`);
    await mkdir(path.join(projectDir, "story"), { recursive: true });
    await mkdir(path.join(projectDir, "assets"), { recursive: true });
    await mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await mkdir(path.join(projectDir, "exports"), { recursive: true });

    const metadata = {
      id: project.id,
      name: project.name,
      type: project.type,
      status: "draft",
      storyTitle: project.storyTitle,
      genreTags: project.genreTags,
      comicFormat: project.comicFormat,
      artStyle: project.artStyle,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "story", "story_draft.source.txt"), project.sourceText, "utf8");
  }
}
