import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";

@Module({
  imports: [WorkspaceModule, TasksModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
