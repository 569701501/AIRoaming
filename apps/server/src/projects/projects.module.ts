import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { ProjectsController } from "./projects.controller.js";
import { ImageProviderService } from "./image-provider.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectsService } from "./projects.service.js";

@Module({
  imports: [WorkspaceModule, TasksModule, SettingsModule],
  controllers: [ProjectsController],
  providers: [ProjectRepository, ImageProviderService, ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
