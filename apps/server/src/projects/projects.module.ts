import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { ProjectsController } from "./projects.controller.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import { ChapterCandidatesService } from "./chapter-candidates.service.js";
import { ImageTaskQueue } from "./image-task-queue.service.js";
import { ChapterScriptService } from "./chapter-script.service.js";
import { StoryboardService } from "./storyboard.service.js";
import { StoryStructureService } from "./story-structure.service.js";
import { ImagePreflightService } from "./image-preflight.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { ProjectsService } from "./projects.service.js";

@Module({
  imports: [WorkspaceModule, TasksModule, SettingsModule],
  controllers: [ProjectsController],
  providers: [ProjectRepository, ImageProviderService, ImageTaskQueue, ProjectStore, CharacterReferenceService, ChapterCandidatesService, ChapterScriptService, StoryboardService, StoryStructureService, ImagePreflightService, ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
