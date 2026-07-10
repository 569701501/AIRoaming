import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { TaskArtifactService } from "./task-artifact.service.js";

@Module({
  imports: [WorkspaceModule],
  controllers: [TasksController],
  providers: [TasksService, TaskArtifactService],
  exports: [TasksService, TaskArtifactService],
})
export class TasksModule {}
