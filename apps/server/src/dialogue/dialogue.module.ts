import { Module } from "@nestjs/common";
import { AIRuntimeModule } from "../ai-runtime/ai-runtime.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { DialogueController } from "./dialogue.controller.js";
import { DialogueService } from "./dialogue.service.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";

@Module({
  imports: [AIRuntimeModule, ProjectsModule],
  controllers: [DialogueController],
  providers: [DialogueService, ScriptDialogueService],
})
export class DialogueModule {}
