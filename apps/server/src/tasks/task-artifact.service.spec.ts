import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { GenerationTaskItem } from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { TaskArtifactService } from "./task-artifact.service.js";

describe("TaskArtifactService", () => {
  let root: string | null = null;

  afterEach(async () => {
    delete process.env.AIROAMING_WORKSPACE_ROOT;
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  it("按任务文件契约持久化完整 input、output 和 error JSON", async () => {
    root = await mkdtemp(path.join(tmpdir(), "airoaming-task-artifacts-"));
    process.env.AIROAMING_WORKSPACE_ROOT = root;
    const service = new TaskArtifactService(new WorkspacePathService());
    const task: GenerationTaskItem = {
      id: "task_001",
      projectId: "project_001",
      type: "image_generate",
      status: "queued",
      phase: "queued",
      progressPercent: 0,
      target: { type: "shot", id: "shot_015", chapterId: "chapter_001" },
      input: {
        chapterId: "chapter_001",
        shotId: "shot_015",
        candidateGenerationSpec: {
          schemaVersion: 1,
          purpose: "shot_clean_plate",
          digest: "digest_001",
        },
      },
      output: null,
      error: null,
      attempt: 0,
      maxAttempts: 1,
      createdAt: "2026-07-10T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      updatedAt: "2026-07-10T00:00:00.000Z",
    };

    await service.writeInput(task);
    await service.writeOutput(task.projectId, task.id, { candidateIds: ["candidate_001"] });
    await service.writeError(task.projectId, task.id, {
      code: "IMAGE_GENERATE_FAILED",
      message: "provider failed",
      retryable: true,
    });

    const taskDir = path.join(root, "projects/project_001/tasks");
    const input = JSON.parse(await readFile(path.join(taskDir, "task_001.input.json"), "utf8")) as GenerationTaskItem;
    const output = JSON.parse(await readFile(path.join(taskDir, "task_001.output.json"), "utf8")) as Record<string, unknown>;
    const error = JSON.parse(await readFile(path.join(taskDir, "task_001.error.json"), "utf8")) as Record<string, unknown>;
    expect(input.input.candidateGenerationSpec).toEqual({
      schemaVersion: 1,
      purpose: "shot_clean_plate",
      digest: "digest_001",
    });
    expect(output).toEqual({ candidateIds: ["candidate_001"] });
    expect(error).toEqual({ code: "IMAGE_GENERATE_FAILED", message: "provider failed", retryable: true });
  });
});
