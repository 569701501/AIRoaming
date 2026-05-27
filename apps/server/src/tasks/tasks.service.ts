import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CreateGenerationTaskRequest,
  GenerationTaskItem,
  GenerationTaskStatus,
} from "@airoaming/shared";
import { CHAPTER_SCOPED_GENERATION_TASK_TYPES } from "@airoaming/shared";

const chapterScopedTaskTypes = new Set<string>(CHAPTER_SCOPED_GENERATION_TASK_TYPES);

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, GenerationTaskItem>();

  list(): GenerationTaskItem[] {
    return [...this.tasks.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  get(taskId: string): GenerationTaskItem {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundException("GENERATION_TASK_NOT_FOUND");
    }
    return task;
  }

  create(input: CreateGenerationTaskRequest): GenerationTaskItem {
    const taskInput = this.normalizeTaskInput(input);
    const now = new Date().toISOString();
    const task: GenerationTaskItem = {
      id: randomUUID(),
      projectId: input.projectId,
      type: input.type,
      status: "queued",
      phase: "queued",
      progressPercent: 0,
      target: input.target ?? null,
      input: taskInput,
      output: null,
      error: null,
      attempt: 0,
      maxAttempts: 1,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    this.runMockTask(task.id);
    return task;
  }

  private normalizeTaskInput(input: CreateGenerationTaskRequest): Record<string, unknown> {
    const taskInput = input.input ?? {};
    if (!chapterScopedTaskTypes.has(input.type)) {
      return taskInput;
    }

    const targetChapterId = this.getTargetChapterId(input.target?.chapterId);
    const inputChapterId = this.getInputChapterId(input.input);
    if (inputChapterId !== null && inputChapterId !== targetChapterId) {
      throw new BadRequestException("GENERATION_TASK_CHAPTER_ID_MISMATCH");
    }

    return {
      ...taskInput,
      chapterId: targetChapterId,
    };
  }

  private getTargetChapterId(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException("GENERATION_TASK_CHAPTER_ID_REQUIRED");
    }

    return value.trim();
  }

  private getInputChapterId(input: Record<string, unknown> | undefined): string | null {
    const value = input?.chapterId;
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException("GENERATION_TASK_INPUT_CHAPTER_ID_INVALID");
    }

    return value.trim();
  }

  cancel(taskId: string): GenerationTaskItem {
    const task = this.get(taskId);
    if (this.isTerminal(task.status)) {
      return task;
    }
    return this.update(taskId, {
      status: "cancelled",
      phase: "cancelled",
      progressPercent: task.progressPercent,
      finishedAt: new Date().toISOString(),
    });
  }

  deleteByProjectId(projectId: string): number {
    let deletedCount = 0;
    for (const task of this.tasks.values()) {
      if (task.projectId === projectId) {
        this.tasks.delete(task.id);
        deletedCount += 1;
      }
    }
    return deletedCount;
  }

  private async runMockTask(taskId: string): Promise<void> {
    await this.delay(80);
    const current = this.tasks.get(taskId);
    if (!current || current.status === "cancelled") return;

    this.update(taskId, {
      status: "running",
      phase: "mock_provider_running",
      progressPercent: 35,
      attempt: 1,
      startedAt: new Date().toISOString(),
    });

    await this.delay(500);
    const latest = this.tasks.get(taskId);
    if (!latest || latest.status === "cancelled") return;

    this.update(taskId, {
      status: "succeeded",
      phase: "completed",
      progressPercent: 100,
      output: {
        provider: "mock",
        message: "Scaffold task completed. Replace this with a real provider worker later.",
      },
      finishedAt: new Date().toISOString(),
    });
  }

  private update(taskId: string, patch: Partial<GenerationTaskItem>): GenerationTaskItem {
    const current = this.get(taskId);
    const next: GenerationTaskItem = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, next);
    return next;
  }

  private isTerminal(status: GenerationTaskStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "cancelled";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
