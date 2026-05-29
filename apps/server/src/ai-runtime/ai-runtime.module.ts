import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { AIRuntimeController } from "./ai-runtime.controller.js";
import { OpenCodeRuntimeService } from "./opencode-runtime.service.js";

@Module({
  imports: [SettingsModule],
  controllers: [AIRuntimeController],
  providers: [OpenCodeRuntimeService],
  exports: [OpenCodeRuntimeService],
})
export class AIRuntimeModule {}
