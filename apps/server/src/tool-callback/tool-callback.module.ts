import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { ToolCallbackController } from "./tool-callback.controller.js";
import { ToolCallbackService } from "./tool-callback.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [ToolCallbackController],
  providers: [ToolCallbackService],
})
export class ToolCallbackModule {}
