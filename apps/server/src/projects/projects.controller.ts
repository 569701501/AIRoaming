import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type { CompleteChapterRequest, CreateProjectRequest, SaveChapterDraftRequest, UpdateProjectDraftRequest } from "@airoaming/shared";
import { ok } from "../http.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Get()
  async list() {
    return ok({ items: await this.projectsService.listProjects() });
  }

  @Post()
  async create(@Body() body: CreateProjectRequest) {
    return ok({ project: await this.projectsService.createProject(body) });
  }

  @Delete(":projectId")
  async delete(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.deleteProject(projectId));
  }

  @Patch(":projectId")
  async updateDraft(@Param("projectId") projectId: string, @Body() body: UpdateProjectDraftRequest) {
    const project = await this.projectsService.updateProjectDraft(projectId, body);
    return ok({
      project,
      snapshot: await this.projectsService.getWorkbenchSnapshot(projectId),
    });
  }

  @Get(":projectId/workbench")
  async workbench(@Param("projectId") projectId: string, @Query("chapterId") chapterId?: string) {
    return ok({ snapshot: await this.projectsService.getWorkbenchSnapshot(projectId, chapterId) });
  }

  @Get(":projectId/chapters")
  async listChapters(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.listChapters(projectId));
  }

  @Get(":projectId/chapters/:chapterId")
  async getChapter(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.projectsService.getChapter(projectId, chapterId));
  }

  @Patch(":projectId/chapters/:chapterId/draft")
  async saveChapterDraft(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: SaveChapterDraftRequest,
  ) {
    return ok(await this.projectsService.saveChapterDraft(projectId, chapterId, body));
  }

  @Post(":projectId/chapters/:chapterId/complete")
  async completeChapter(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CompleteChapterRequest,
  ) {
    return ok(await this.projectsService.completeChapter(projectId, chapterId, body));
  }
}
