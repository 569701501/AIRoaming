import { Module } from "@nestjs/common";
import { AIRuntimeController } from "./ai-runtime.controller.js";
import { OpenCodeRuntimeService } from "./opencode-runtime.service.js";

@Module({
  controllers: [AIRuntimeController],
  providers: [OpenCodeRuntimeService],
  exports: [OpenCodeRuntimeService],
})
export class AIRuntimeModule {}
