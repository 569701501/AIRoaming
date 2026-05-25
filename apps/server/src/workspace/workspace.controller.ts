import { Controller, Get, Inject } from "@nestjs/common";
import type { WorkspaceInfo } from "@airoaming/shared";
import { ok } from "../http.js";
import { WorkspacePathService } from "./workspace-path.service.js";

@Controller("workspace")
export class WorkspaceController {
  constructor(@Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService) {}

  @Get()
  async info() {
    await this.workspacePathService.ensureReady();
    return ok<WorkspaceInfo>(this.workspacePathService.getInfo());
  }
}
