import { Module } from "@nestjs/common";
import { AIRuntimeModule } from "./ai-runtime/ai-runtime.module.js";
import { DialogueModule } from "./dialogue/dialogue.module.js";
import { HealthModule } from "./health/health.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { TasksModule } from "./tasks/tasks.module.js";
import { WorkspaceModule } from "./workspace/workspace.module.js";

@Module({
  imports: [HealthModule, WorkspaceModule, AIRuntimeModule, ProjectsModule, TasksModule, DialogueModule],
})
export class AppModule {}
