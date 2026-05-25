import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import type { CreateProjectRequest, UpdateProjectDraftRequest } from "@airoaming/shared";
import { ok } from "../http.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return ok({ items: this.projectsService.listProjects() });
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
      snapshot: this.projectsService.getWorkbenchSnapshot(projectId),
    });
  }

  @Get(":projectId/workbench")
  workbench(@Param("projectId") projectId: string) {
    return ok({ snapshot: this.projectsService.getWorkbenchSnapshot(projectId) });
  }
}
