import { Module } from "@nestjs/common";
import { AIRuntimeModule } from "../ai-runtime/ai-runtime.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { DialogueController } from "./dialogue.controller.js";
import { DialogueService } from "./dialogue.service.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";
import { ScriptImportBatchService } from "./script-import-batch.service.js";
import { StoryStructureDialogueService } from "./story-structure-dialogue.service.js";
import { StoryboardDialogueService } from "./storyboard-dialogue.service.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";

@Module({
  imports: [AIRuntimeModule, ProjectsModule, PersistenceModule, MaintenanceModule],
  controllers: [DialogueController],
  providers: [DialogueService, ScriptDialogueService, ScriptImportBatchService, StoryStructureDialogueService, StoryboardDialogueService],
})
export class DialogueModule {}
