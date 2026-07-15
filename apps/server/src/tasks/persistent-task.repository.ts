import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateGenerationTaskRequest,
  GenerationTaskItem,
  GenerationTaskStatus,
  GenerationTaskTarget,
  GenerationTaskType,
} from "@airoaming/shared";
import {
  buildTaskSourceProjection,
  digestCanonicalJson,
  taskSourceProjectionDigest,
  type TaskSourceProjectionV1,
} from "@airoaming/shared";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../persistence/prisma.service.js";

export const TASK_LEASE_TTL_MS = 60_000;
export const TASK_RETRY_BACKOFF_MS = 1_000;

const TERMINAL_STATUSES = new Set<GenerationTaskStatus>(["succeeded", "failed", "cancelled"]);

const TASK_DEFAULTS: Record<string, { maxAttempts: number; concurrencyKey: string; slotCount: number }> = {
  character_reference_generate: { maxAttempts: 3, concurrencyKey: "image-provider", slotCount: 1 },
  scene_reference_generate: { maxAttempts: 3, concurrencyKey: "image-provider", slotCount: 1 },
  story_parse: { maxAttempts: 3, concurrencyKey: "llm-provider", slotCount: 1 },
  shot_generate: { maxAttempts: 3, concurrencyKey: "llm-provider", slotCount: 1 },
  shot_prompt_generate: { maxAttempts: 2, concurrencyKey: "local-cpu", slotCount: 2 },
  image_generate: { maxAttempts: 3, concurrencyKey: "image-provider", slotCount: 1 },
  layout_export: { maxAttempts: 2, concurrencyKey: "layout-render", slotCount: 1 },
  tts_generate: { maxAttempts: 1, concurrencyKey: "tts-provider", slotCount: 1 },
  video_export: { maxAttempts: 1, concurrencyKey: "local-cpu", slotCount: 2 },
  asset_package_export: { maxAttempts: 1, concurrencyKey: "local-cpu", slotCount: 2 },
};

export interface PersistentTaskCreateOptions {
  maxAttempts?: number;
  concurrencyKey?: string | null;
  concurrencySlots?: number;
  priority?: number;
  policyVersion?: string;
}

export interface PersistentTaskCreateInput extends CreateGenerationTaskRequest {
  options?: PersistentTaskCreateOptions & Record<string, unknown>;
}

export interface PersistentTaskCreateResult {
  item: GenerationTaskItem;
  replayed: boolean;
}

export interface PersistentTaskAttemptItem {
  readonly id: string;
  readonly taskId: string;
  readonly attemptNo: number;
  readonly workerId: string;
  readonly claimToken: string;
  readonly outcome: string | null;
  readonly error: Record<string, unknown> | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

export interface ClaimedPersistentTask {
  item: GenerationTaskItem;
  claimToken: string;
  workerId: string;
  attempt: number;
  leaseExpiresAt: string;
}

export type PersistentTaskOutcome = "succeeded" | "failed" | "cancelled" | "interrupted";

export interface FinishPersistentTaskInput {
  taskId: string;
  claimToken: string;
  outcome: PersistentTaskOutcome;
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  retryAt?: Date;
  applicability?: "current" | "historical" | "legacy_unresolved";
}

export class TaskLeaseLostError extends ConflictException {
  constructor(taskId: string) {
    super({ code: "TASK_LEASE_LOST", taskId });
  }
}

type TaskRow = Prisma.GenerationTaskGetPayload<{}>;

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}:${error.message}` : String(error);
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${field} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function targetFromRow(row: TaskRow): GenerationTaskTarget | null {
  if (!row.targetType || !row.targetId) return null;
  return {
    type: row.targetType as GenerationTaskTarget["type"],
    id: row.targetId,
    ...(row.chapterId ? { chapterId: row.chapterId } : {}),
  };
}

function itemFromRow(row: TaskRow): GenerationTaskItem {
  const input = row.inputJson && typeof row.inputJson === "object" && !Array.isArray(row.inputJson)
    ? row.inputJson as Record<string, unknown>
    : {};
  const output = row.outputJson && typeof row.outputJson === "object" && !Array.isArray(row.outputJson)
    ? row.outputJson as Record<string, unknown>
    : null;
  const error = row.errorJson && typeof row.errorJson === "object" && !Array.isArray(row.errorJson)
    ? row.errorJson as { code: string; message: string; retryable: boolean; details?: unknown }
    : null;
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as GenerationTaskType,
    status: row.status as GenerationTaskStatus,
    phase: row.phase ?? "queued",
    progressPercent: row.progressPercent,
    target: targetFromRow(row),
    input,
    output,
    error,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt.toISOString(),
    startedAt: asIso(row.startedAt),
    finishedAt: asIso(row.finishedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateVersionTaskInput(
  type: string,
  input: Record<string, unknown>,
  projection: TaskSourceProjectionV1,
  chapterId: string | null,
  target: GenerationTaskTarget | undefined,
): void {
  if (type !== "story_parse" && type !== "shot_generate") return;
  if (chapterId === null || target?.type !== "chapter" || target.id !== chapterId) throw new TypeError(`${type} target must route to its chapter`);
  if (input.schemaVersion !== 2) throw new TypeError(`${type} input.schemaVersion must be 2`);
  if (typeof input.expectedTargetId !== "string" || input.expectedTargetId.trim() === "") throw new TypeError(`${type}.expectedTargetId must be non-empty`);
  if (typeof input.expectedTargetRowVersion !== "number" || !Number.isInteger(input.expectedTargetRowVersion) || input.expectedTargetRowVersion < 0) throw new TypeError(`${type}.expectedTargetRowVersion must be a non-negative integer`);
  if (input.instruction !== null && input.instruction !== undefined && typeof input.instruction !== "string") throw new TypeError(`${type}.instruction must be string|null`);
  if (projection.sources.length !== 1) throw new TypeError(`${type} sourceProjection must contain exactly one source`);
  const expectedSourceType = type === "story_parse" ? "chapter_script_version" : "story_version";
  if (projection.sources[0]?.sourceType !== expectedSourceType) throw new TypeError(`${type} source type must be ${expectedSourceType}`);
}

function validateShotTaskInput(
  type: string,
  input: Record<string, unknown>,
  projection: TaskSourceProjectionV1,
  chapterId: string | null,
  target: GenerationTaskTarget | undefined,
): void {
  if (type !== "shot_prompt_generate" && type !== "image_generate") return;
  if (chapterId === null || target?.type !== "shot" || target.id !== input.shotId || target.chapterId !== chapterId) throw new TypeError(`${type} target must route to its shot`);
  if (input.schemaVersion !== 2) throw new TypeError(`${type} input.schemaVersion must be 2`);
  if (typeof input.shotId !== "string" || input.shotId.trim() === "") throw new TypeError(`${type}.shotId must be non-empty`);
  if (typeof input.generationSpecDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(input.generationSpecDigest)) throw new TypeError(`${type}.generationSpecDigest must be sha256 digest`);
  if (typeof input.promptSpec !== "object" || input.promptSpec === null || Array.isArray(input.promptSpec)) throw new TypeError(`${type}.promptSpec must be object`);
  if (digestCanonicalJson(input.promptSpec) !== input.generationSpecDigest) throw new TypeError(`${type}.generationSpecDigest must match promptSpec`);
  if (!Number.isInteger(input.candidateCount) || (input.candidateCount as number) < 1 || (input.candidateCount as number) > 6) throw new TypeError(`${type}.candidateCount must be 1..6`);
  const sourceTypes = new Set(projection.sources.map((source) => source.sourceType));
  for (const required of ["storyboard_version", "shot", "preflight_revision"]) {
    if (!sourceTypes.has(required)) throw new TypeError(`${type} sourceProjection must include ${required}`);
  }
  if (type === "image_generate" && (typeof input.requestId !== "string" || input.requestId.trim() === "")) throw new TypeError("image_generate.requestId must be non-empty");
}

@Injectable()
export class PersistentTaskRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  private async runTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prismaService.runBusinessTransaction(operation);
      } catch (error) {
        lastError = error;
        if (!/SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(errorText(error)) || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, [10, 30, 90][attempt] ?? 90));
      }
    }
    throw lastError;
  }

  private database() {
    if (!this.prismaService.isDatabaseMode()) {
      throw new Error("DB_PERSISTENCE_REQUIRED_FOR_TASK_REPOSITORY");
    }
    return this.prismaService.database();
  }

  async create(input: PersistentTaskCreateInput): Promise<PersistentTaskCreateResult> {
    const prepared = this.prepareCreate(input);
    try {
      return await this.runTransaction(async (tx) => {
        const existing = await tx.generationTask.findUnique({ where: { idempotencyKey: prepared.idempotencyKey } });
        if (existing) return { item: itemFromRow(existing), replayed: true };

        const taskId = randomUUID();
        const createdAt = new Date();
        const task = await tx.generationTask.create({
          data: {
            id: taskId,
            projectId: prepared.projectId,
            chapterId: prepared.chapterId,
            type: prepared.type,
            recordKind: "runtime",
            provenanceStatus: "complete",
            status: "queued",
            phase: "queued",
            progressPercent: 0,
            targetType: prepared.targetType,
            targetId: prepared.targetId,
            inputJson: jsonValue(prepared.inputJson),
            inputSchemaVersion: prepared.inputSchemaVersion,
            inputDigest: prepared.inputDigest,
            sourceDigest: prepared.sourceDigest,
            idempotencyKey: prepared.idempotencyKey,
            concurrencyKey: prepared.concurrencyKey,
            priority: prepared.priority,
            attempt: 0,
            maxAttempts: prepared.maxAttempts,
            retryDisabled: false,
            createdAt,
            updatedAt: createdAt,
          },
        });

        // `shot` source validation references the already inserted storyboard
        // source row.  Insert the dependency first even though the canonical
        // projection itself remains role/order sorted and immutable.
        const sourceRows = [...prepared.sourceProjection.sources].sort((left, right) =>
          (left.sourceType === "storyboard_version" ? -1 : 0) - (right.sourceType === "storyboard_version" ? -1 : 0),
        );
        for (const source of sourceRows) {
          await tx.generationTaskSource.create({
            data: {
              id: randomUUID(),
              taskId,
              role: source.role,
              order: source.order,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              sourceDigest: source.sourceDigest,
            },
          });
        }

        if (prepared.concurrencyKey) {
          const existingSlots = await tx.taskConcurrencySlot.findMany({ where: { concurrencyKey: prepared.concurrencyKey } });
          const existingNumbers = new Set(existingSlots.map((slot) => slot.slotNo));
          for (let index = 1; index <= prepared.concurrencySlots; index += 1) {
            if (existingNumbers.has(index)) continue;
            await tx.taskConcurrencySlot.create({
              data: {
                id: randomUUID(),
                concurrencyKey: prepared.concurrencyKey,
                slotNo: index,
                taskId: null,
                leaseOwnerId: null,
                claimToken: null,
                leaseExpiresAt: null,
                updatedAt: createdAt,
              },
            });
          }
        }

        const sealed = await tx.generationTask.update({
          where: { id: task.id },
          data: { sourceSetSealedAt: createdAt },
        });
        return { item: itemFromRow(sealed), replayed: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.database().generationTask.findUnique({ where: { idempotencyKey: prepared.idempotencyKey } });
        if (existing) return { item: itemFromRow(existing), replayed: true };
      }
      throw error;
    }
  }

  async list(projectId?: string): Promise<GenerationTaskItem[]> {
    const rows = await this.database().generationTask.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(itemFromRow);
  }

  async get(taskId: string): Promise<GenerationTaskItem> {
    const row = await this.database().generationTask.findUnique({ where: { id: taskId } });
    if (!row) throw new NotFoundException("GENERATION_TASK_NOT_FOUND");
    return itemFromRow(row);
  }

  async getDetail(taskId: string): Promise<{ item: GenerationTaskItem; attempts: PersistentTaskAttemptItem[]; applicability: string | null }> {
    const row = await this.database().generationTask.findUnique({
      where: { id: taskId },
      include: { taskAttemptsByTask: { orderBy: { attemptNo: "asc" } } },
    });
    if (!row) throw new NotFoundException("GENERATION_TASK_NOT_FOUND");
    return {
      item: itemFromRow(row),
      applicability: row.applicability,
      attempts: row.taskAttemptsByTask.map((attempt) => ({
        id: attempt.id,
        taskId: attempt.taskId,
        attemptNo: attempt.attemptNo,
        workerId: attempt.workerId,
        claimToken: attempt.claimToken,
        outcome: attempt.outcome,
        error: attempt.errorJson && typeof attempt.errorJson === "object" && !Array.isArray(attempt.errorJson) ? attempt.errorJson as Record<string, unknown> : null,
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  async claimNext(workerId: string, now = new Date(), taskTypes?: readonly string[]): Promise<ClaimedPersistentTask | null> {
    if (!workerId.trim()) throw new TypeError("workerId must be non-empty");
    const candidates = await this.database().generationTask.findMany({
      where: {
        recordKind: "runtime",
        ...(taskTypes && taskTypes.length > 0 ? { type: { in: [...taskTypes] } } : {}),
        status: { in: ["queued", "retrying"] },
        sourceSetSealedAt: { not: null },
        cancelRequestedAt: null,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
        project: { lifecycleStatus: "active" },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: 32,
    });

    for (const candidate of candidates) {
      const claimToken = randomUUID();
      const heartbeatAt = new Date(Math.max(now.getTime(), candidate.heartbeatAt?.getTime() ?? 0) + 1);
      const leaseExpiresAt = new Date(heartbeatAt.getTime() + TASK_LEASE_TTL_MS);
      try {
        const claimed = await this.runTransaction(async (tx) => {
          const current = await tx.generationTask.findUnique({ where: { id: candidate.id } });
          if (!current || (current.status !== "queued" && current.status !== "retrying") || current.cancelRequestedAt || !current.sourceSetSealedAt) return null;
          if (current.nextRunAt && current.nextRunAt > heartbeatAt) return null;
          const nextAttempt = current.attempt + 1;
          if (nextAttempt > current.maxAttempts) return null;
          const result = await tx.generationTask.updateMany({
            where: { id: current.id, status: current.status, attempt: current.attempt, cancelRequestedAt: null },
            data: {
              status: "running",
              phase: "claimed",
              attempt: nextAttempt,
              progressPercent: Math.max(current.progressPercent ?? 0, 0),
              nextRunAt: null,
              leaseOwnerId: workerId,
              leaseToken: claimToken,
              leaseExpiresAt,
              heartbeatAt,
              startedAt: current.startedAt ?? heartbeatAt,
            },
          });
          if (result.count !== 1) return null;
          if (current.type === "layout_export" && current.targetType === "export") {
            if (current.status === "queued") {
              const exportClaim = await tx.exportRevision.updateMany({
                where: { taskId: current.id, id: current.targetId!, status: "queued", kind: "layout_publication" },
                data: { status: "rendering" },
              });
              if (exportClaim.count !== 1) throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
            } else {
              const mapped = await tx.exportRevision.findFirst({
                where: { taskId: current.id, id: current.targetId!, status: "rendering", kind: "layout_publication" },
                select: { id: true },
              });
              if (!mapped) throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
            }
          }
          return tx.generationTask.findUnique({ where: { id: current.id } });
        });
        if (claimed) {
          return {
            item: itemFromRow(claimed),
            claimToken,
            workerId,
            attempt: claimed.attempt,
            leaseExpiresAt: leaseExpiresAt.toISOString(),
          };
        }
      } catch (error) {
        // A competing worker may have consumed the only slot between the
        // candidate read and the CAS update. The SQLite trigger is the final
        // arbiter; move on to the next candidate instead of failing the poll.
        if (/trg_generation_tasks_claim_(validate|materialize)/.test(errorText(error))) continue;
        throw error;
      }
    }
    return null;
  }

  async heartbeat(taskId: string, claimToken: string, now = new Date(), progressPercent?: number, phase?: string): Promise<GenerationTaskItem> {
    return this.runTransaction(async (tx) => {
      const current = await tx.generationTask.findUnique({ where: { id: taskId } });
      if (!current || current.status !== "running" || current.leaseToken !== claimToken || !current.leaseExpiresAt || current.leaseExpiresAt <= now) {
        throw new TaskLeaseLostError(taskId);
      }
      const heartbeatAt = new Date(Math.max(now.getTime(), current.heartbeatAt?.getTime() ?? 0) + 1);
      const updated = await tx.generationTask.update({
        where: { id: taskId },
        data: {
          heartbeatAt,
          leaseExpiresAt: new Date(heartbeatAt.getTime() + TASK_LEASE_TTL_MS),
          ...(progressPercent === undefined ? {} : { progressPercent }),
          ...(phase === undefined ? {} : { phase }),
        },
      });
      return itemFromRow(updated);
    });
  }

  async finish(input: FinishPersistentTaskInput, now = new Date()): Promise<GenerationTaskItem> {
    return this.finishInternal(input, now, false);
  }

  /**
   * Completes a claimed task inside the caller's domain transaction.  The
   * worker uses this seam to make the version projection and TaskAttempt
   * terminal transition one atomic write.  Callers must already hold the
   * claim token; this method deliberately performs the same fencing checks as
   * the public finish() method.
   */
  async finishInTransaction(
    tx: Prisma.TransactionClient,
    input: FinishPersistentTaskInput,
    now = new Date(),
    allowExpired = false,
  ): Promise<GenerationTaskItem> {
    return this.finishInTransactionInternal(tx, input, now, allowExpired);
  }

  async recoverExpired(now = new Date()): Promise<GenerationTaskItem[]> {
    const expired = await this.database().generationTask.findMany({
      where: { recordKind: "runtime", status: "running", leaseExpiresAt: { lte: now } },
      orderBy: { leaseExpiresAt: "asc" },
    });
    const recovered: GenerationTaskItem[] = [];
    for (const task of expired) {
      if (!task.leaseToken) continue;
      const outcome: PersistentTaskOutcome = task.cancelRequestedAt ? "cancelled" : "interrupted";
      const retryAt = outcome === "interrupted" && task.attempt < task.maxAttempts
        ? new Date(now.getTime() + TASK_RETRY_BACKOFF_MS * Math.max(1, 2 ** (task.attempt - 1)))
        : undefined;
      try {
        recovered.push(await this.finishInternal({
          taskId: task.id,
          claimToken: task.leaseToken,
          outcome,
          error: { code: "TASK_LEASE_EXPIRED", message: "任务租约已过期，由恢复器接管", retryable: outcome === "interrupted" },
          retryAt,
          applicability: "historical",
        }, now, true));
      } catch (error) {
        if (!(error instanceof TaskLeaseLostError)) throw error;
      }
    }
    return recovered;
  }

  async cancel(taskId: string, now = new Date()): Promise<GenerationTaskItem> {
    return this.runTransaction(async (tx) => {
      const current = await tx.generationTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException("GENERATION_TASK_NOT_FOUND");
      if (TERMINAL_STATUSES.has(current.status as GenerationTaskStatus)) return itemFromRow(current);
      if (current.status === "running") {
        const updated = await tx.generationTask.update({ where: { id: taskId }, data: { cancelRequestedAt: now } });
        return itemFromRow(updated);
      }
      const updated = await tx.generationTask.update({
        where: { id: taskId },
        data: { status: "cancelled", phase: "cancelled", cancelRequestedAt: now, finishedAt: now, nextRunAt: null },
      });
      if (current.type === "layout_export" && current.targetType === "export") {
        const exportCancel = await tx.exportRevision.updateMany({
          where: { taskId: current.id, id: current.targetId!, status: "queued", kind: "layout_publication" },
          data: { status: "cancelled", cancelledAt: now },
        });
        if (exportCancel.count !== 1) throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
      }
      return itemFromRow(updated);
    });
  }

  private async finishInternal(input: FinishPersistentTaskInput, now: Date, allowExpired: boolean): Promise<GenerationTaskItem> {
    return this.runTransaction((tx) => this.finishInTransactionInternal(tx, input, now, allowExpired));
  }

  private async finishInTransactionInternal(
    tx: Prisma.TransactionClient,
    input: FinishPersistentTaskInput,
    now: Date,
    allowExpired: boolean,
  ): Promise<GenerationTaskItem> {
    if (input.outcome === "succeeded" && !input.output) throw new TypeError("successful task requires output");
    if ((input.outcome === "failed" || input.outcome === "interrupted") && !input.error) throw new TypeError("failed task requires error");
      const current = await tx.generationTask.findUnique({ where: { id: input.taskId } });
      if (!current || current.status !== "running" || current.leaseToken !== input.claimToken || !current.leaseExpiresAt) throw new TaskLeaseLostError(input.taskId);
      if (!allowExpired && current.leaseExpiresAt <= now) throw new TaskLeaseLostError(input.taskId);
      if (input.outcome === "succeeded" && current.cancelRequestedAt) throw new TaskLeaseLostError(input.taskId);

      const finishedAt = new Date(Math.max(now.getTime(), current.heartbeatAt?.getTime() ?? 0) + 1);
      const shouldRetry = (input.outcome === "failed" || input.outcome === "interrupted") &&
        input.retryAt !== undefined && input.retryAt > finishedAt && current.attempt < current.maxAttempts && !current.cancelRequestedAt;
      const error = input.error ? jsonObject(input.error, "error") : null;
      const output = input.output ? jsonObject(input.output, "output") : null;

      await tx.generationTask.update({
        where: { id: current.id },
        data: {
          phase: input.outcome === "succeeded" ? "completed" : shouldRetry ? "retrying" : input.outcome === "cancelled" ? "cancelled" : "failed",
          progressPercent: input.outcome === "succeeded" ? 100 : current.progressPercent,
          outputJson: output ? jsonValue(output) : Prisma.DbNull,
          outputSchemaVersion: output ? (typeof output.schemaVersion === "number" ? output.schemaVersion : 1) : null,
          outputDigest: output ? digestCanonicalJson(output) : null,
          errorJson: error ? jsonValue(error) : Prisma.DbNull,
          errorSchemaVersion: error ? 1 : null,
          nextRunAt: shouldRetry ? input.retryAt : null,
          applicability: input.applicability ?? current.applicability ?? (input.outcome === "succeeded" ? "current" : "historical"),
        },
      });

      const attempt = await tx.taskAttempt.findUnique({ where: { claimToken: input.claimToken } });
      if (!attempt || attempt.taskId !== current.id || attempt.finishedAt) throw new TaskLeaseLostError(input.taskId);
      await tx.taskAttempt.update({
        where: { claimToken: input.claimToken },
        data: {
          outcome: input.outcome,
          errorJson: error ? jsonValue(error) : Prisma.DbNull,
          errorSchemaVersion: error ? 1 : null,
          finishedAt,
        },
      });
      const final = await tx.generationTask.findUnique({ where: { id: current.id } });
      if (!final) throw new NotFoundException("GENERATION_TASK_NOT_FOUND");
      return itemFromRow(final);
  }

  private prepareCreate(input: PersistentTaskCreateInput): {
    projectId: string;
    chapterId: string | null;
    type: string;
    targetType: string | null;
    targetId: string | null;
    inputJson: Record<string, unknown>;
    inputSchemaVersion: number;
    inputDigest: `sha256:${string}`;
    sourceProjection: TaskSourceProjectionV1;
    sourceDigest: `sha256:${string}`;
    idempotencyKey: string;
    concurrencyKey: string | null;
    concurrencySlots: number;
    maxAttempts: number;
    priority: number;
  } {
    const projectId = input.projectId.trim();
    if (!projectId) throw new TypeError("projectId must be non-empty");
    const type = input.type;
    const rawInput = jsonObject(input.input ?? {}, "input");
    const rawProjection = jsonObject(rawInput.sourceProjection, "input.sourceProjection");
    const rawSources = rawProjection.sources;
    if (!Array.isArray(rawSources)) throw new TypeError("input.sourceProjection.sources must be an array");
    const chapterId = input.target?.chapterId ?? (typeof rawInput.chapterId === "string" ? rawInput.chapterId : null);
    if (chapterId !== null && !chapterId.trim()) throw new TypeError("chapterId must be non-empty");
    if (rawProjection.projectId !== projectId) throw new TypeError("sourceProjection.projectId must match projectId");
    if (rawProjection.chapterId !== chapterId) throw new TypeError("sourceProjection.chapterId must match task chapterId");
    if (rawProjection.consumerType !== type) throw new TypeError("sourceProjection.consumerType must match task type");
    const sourceProjection = buildTaskSourceProjection({
      policyVersion: String(rawProjection.policyVersion ?? input.options?.policyVersion ?? "g2-task-source-v1"),
      projectId,
      chapterId,
      consumerType: type,
      sources: rawSources.map((source, index) => {
        const row = jsonObject(source, `sourceProjection.sources[${index}]`);
        return {
          role: String(row.role ?? ""),
          sourceType: String(row.sourceType ?? ""),
          sourceId: String(row.sourceId ?? ""),
          sourceDigest: String(row.sourceDigest ?? "") as `sha256:${string}`,
        };
      }),
    });
    const sourceDigest = taskSourceProjectionDigest(sourceProjection);
    const inputSchemaVersion = typeof rawInput.schemaVersion === "number" ? rawInput.schemaVersion : 2;
    if (!Number.isInteger(inputSchemaVersion) || inputSchemaVersion < 1) throw new TypeError("input.schemaVersion must be a positive integer");
    validateVersionTaskInput(type, rawInput, sourceProjection, chapterId, input.target);
    validateShotTaskInput(type, rawInput, sourceProjection, chapterId, input.target);
    const options = input.options && Object.keys(input.options).length > 0 ? { ...input.options } : undefined;
    const inputJson: Record<string, unknown> = { ...rawInput, ...(options ? { options } : {}) };
    inputJson.sourceProjection = sourceProjection;
    const inputDigest = digestCanonicalJson(inputJson);
    const defaults = TASK_DEFAULTS[type] ?? { maxAttempts: 1, concurrencyKey: "local-cpu", slotCount: 1 };
    const maxAttempts = input.options?.maxAttempts ?? defaults.maxAttempts;
    const concurrencySlots = input.options?.concurrencySlots ?? defaults.slotCount;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError("maxAttempts must be a positive integer");
    if (!Number.isInteger(concurrencySlots) || concurrencySlots < 1 || concurrencySlots > 32) throw new TypeError("concurrencySlots must be 1..32");
    const concurrencyKey = input.options?.concurrencyKey === null ? null : String(input.options?.concurrencyKey ?? defaults.concurrencyKey);
    const target = input.target;
    const targetType = type === "story_parse" || type === "shot_generate" ? "chapter" : target?.type ?? (chapterId ? "chapter" : null);
    const targetId = type === "story_parse" || type === "shot_generate" ? chapterId : target?.id ?? null;
    if (!targetType || !targetId) throw new TypeError("runtime task target is required");
    if ((type === "story_parse" || type === "shot_generate") && !chapterId) throw new TypeError("chapter scoped task requires chapterId");
    const idempotencyKey = type === "story_parse"
      ? `story-parse:${projectId}:${chapterId}:${String(rawInput.expectedTargetId)}:${sourceDigest}:${inputDigest}`
      : type === "shot_generate"
        ? `shot-generate:${projectId}:${chapterId}:${String(rawInput.expectedTargetId)}:${sourceDigest}:${inputDigest}`
        : type === "shot_prompt_generate"
          ? `shot-prompt:${projectId}:${chapterId}:${String(rawInput.shotId)}:${sourceDigest}:${inputDigest}`
          : type === "image_generate"
            ? `image-generate:${projectId}:${chapterId}:${String(rawInput.shotId)}:${String(rawInput.generationSpecDigest)}:${String(rawInput.requestId)}`
            : `task:${digestCanonicalJson({ projectId, chapterId, type, targetType, targetId, input: inputJson, options: options ?? null })}`;
    return {
      projectId,
      chapterId,
      type,
      targetType,
      targetId,
      inputJson,
      inputSchemaVersion,
      inputDigest,
      sourceProjection,
      sourceDigest,
      idempotencyKey,
      concurrencyKey,
      concurrencySlots,
      maxAttempts,
      priority: input.options?.priority ?? 0,
    };
  }
}
