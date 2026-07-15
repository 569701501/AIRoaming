import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { AIRuntimeModule } from "../ai-runtime/ai-runtime.module.js";
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
import { ChapterVersionQueryRepository } from "./versioning/chapter-version-query.repository.js";
import { ScriptVersionRepository } from "./versioning/script-version.repository.js";
import { ScriptVersionService } from "./versioning/script-version.service.js";
import { StoryVersionRepository } from "./versioning/story-version.repository.js";
import { StoryVersionService } from "./versioning/story-version.service.js";
import { StoryboardVersionRepository } from "./versioning/storyboard-version.repository.js";
import { StoryboardVersionService } from "./versioning/storyboard-version.service.js";
import { ChapterProductionQueryService } from "./versioning/chapter-production-query.service.js";
import { NewWorkGateService } from "./versioning/new-work-gate.service.js";
import { VersionTransactionRunner } from "./versioning/version-transaction-runner.service.js";
import { SourceSnapshotBuilderService } from "./versioning/source-snapshot-builder.service.js";
import { PreflightRevisionRepository } from "./versioning/preflight-revision.repository.js";
import { PreflightRevisionService } from "./versioning/preflight-revision.service.js";
import { TaskApplicabilityGuardService } from "./versioning/task-applicability-guard.service.js";
import { PersistentTaskWorkerService } from "./persistent-task-worker.service.js";
import { PersistentG2TaskCreateGuardService } from "./persistent-g2-task-create-guard.service.js";
import { ProjectScriptCommandRepository } from "./project-script-command.repository.js";
import { ProjectDeleteOutboxService } from "./project-delete-outbox.service.js";
import { CandidateLockRepository } from "./candidate-lock.repository.js";
import { CandidateDecisionService } from "./candidate-decision.service.js";
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";
import { LayoutWorkingCopyService } from "./layout-working-copy.service.js";
import { LayoutFontService } from "./layout-font.service.js";
import { LayoutVersioningService } from "./layout-versioning.service.js";
import { LayoutRendererService } from "./layout-renderer.service.js";
import { LayoutPublicationService } from "./layout-publication.service.js";
import { LayoutPublicationWorkerService } from "./layout-publication-worker.service.js";

@Module({
  imports: [WorkspaceModule, TasksModule, SettingsModule, PersistenceModule, AIRuntimeModule],
  controllers: [ProjectsController],
  providers: [
    ProjectRepository,
    ProjectScriptCommandRepository,
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
    ChapterVersionQueryRepository,
    VersionTransactionRunner,
    ScriptVersionRepository,
    ScriptVersionService,
    StoryVersionRepository,
    StoryVersionService,
    StoryboardVersionRepository,
    StoryboardVersionService,
    ChapterProductionQueryService,
    NewWorkGateService,
    SourceSnapshotBuilderService,
    PreflightRevisionRepository,
    PreflightRevisionService,
    TaskApplicabilityGuardService,
    PersistentG2TaskCreateGuardService,
    PersistentTaskWorkerService,
    ProjectDeleteOutboxService,
    CandidateLockRepository,
    CandidateDecisionService,
    CandidateSourceQueryService,
    LayoutFontService,
    LayoutWorkingCopyService,
    LayoutVersioningService,
    LayoutRendererService,
    LayoutPublicationService,
    LayoutPublicationWorkerService,
  ],
  exports: [ProjectsService, ProjectDeleteOutboxService, CandidateDecisionService, ScriptVersionService, StoryVersionService, StoryboardVersionService, ChapterProductionQueryService, NewWorkGateService, PreflightRevisionService, TaskApplicabilityGuardService, PersistentTaskWorkerService, LayoutFontService, LayoutWorkingCopyService, LayoutVersioningService, LayoutPublicationService],
})
export class ProjectsModule {}
