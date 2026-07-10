import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { GenerationTaskItem } from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

@Injectable()
export class TaskArtifactService {
  constructor(@Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService) {}

  async writeInput(task: GenerationTaskItem): Promise<void> {
    await this.writeJson(task.projectId, task.id, "input", task);
  }

  async writeOutput(projectId: string, taskId: string, output: Record<string, unknown>): Promise<void> {
    await this.writeJson(projectId, taskId, "output", output);
  }

  async writeError(
    projectId: string,
    taskId: string,
    error: { code: string; message: string; retryable: boolean; details?: unknown },
  ): Promise<void> {
    await this.writeJson(projectId, taskId, "error", error);
  }

  private async writeJson(
    projectId: string,
    taskId: string,
    kind: "input" | "output" | "error",
    value: unknown,
  ): Promise<void> {
    this.assertSafeId(projectId);
    this.assertSafeId(taskId);
    const virtualPath = `/workspace/projects/${projectId}/tasks/${taskId}.${kind}.json`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(virtualPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private assertSafeId(value: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new BadRequestException("TASK_ARTIFACT_ID_INVALID");
    }
  }
}
