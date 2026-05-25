import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { TasksModule } from "./tasks/tasks.module.js";
import { WorkspaceModule } from "./workspace/workspace.module.js";

@Module({
  imports: [HealthModule, WorkspaceModule, ProjectsModule, TasksModule],
})
export class AppModule {}
