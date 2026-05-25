import { Module } from "@nestjs/common";
import { WorkspaceController } from "./workspace.controller.js";
import { WorkspacePathService } from "./workspace-path.service.js";

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspacePathService],
  exports: [WorkspacePathService],
})
export class WorkspaceModule {}
