import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { ProjectsController } from "./projects.controller.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import { ChapterScriptService } from "./chapter-script.service.js";
import { StoryboardService } from "./storyboard.service.js";
import { StoryStructureService } from "./story-structure.service.js";
import { ImagePreflightService } from "./image-preflight.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { ImageCandidateService } from "./image-candidate.service.js";
import { CandidateReferenceResolver } from "./candidate-reference-resolver.js";
import { LayoutExportService } from "./layout-export.service.js";
import { AssetPackageService } from "./asset-package.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { ProjectsService } from "./projects.service.js";

@Module({
  imports: [WorkspaceModule, TasksModule, SettingsModule, PersistenceModule],
  controllers: [ProjectsController],
  providers: [
    ProjectRepository,
    ImageProviderService,
    CandidateReferenceResolver,
    ProjectStore,
    CharacterReferenceService,
    ChapterScriptService,
    StoryboardService,
    StoryStructureService,
    ImagePreflightService,
    ImageCandidateService,
    LayoutExportService,
    AssetPackageService,
    ProjectsService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
