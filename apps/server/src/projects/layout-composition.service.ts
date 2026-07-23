import { HttpException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  LayoutCompositionContractError,
  LayoutDocumentCodecV2,
  digestCanonicalJson,
  digestLayoutSourceLockSet,
  parseCreateLayoutCompositionRequestV1,
  parseLayoutCompositionApplicationEvidenceV1,
  parseLayoutCompositionTaskInputV1,
  parseLayoutCompositionTaskOutputV1,
  projectLayoutDocumentV2ToV1,
  type GenerationTaskItem,
  type LayoutCompositionApplicationEvidenceV1,
  type LayoutCompositionApplyResponseV1,
  type LayoutDigest,
  type LayoutImageValidationContextV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { PersistentTaskRepository } from "../tasks/persistent-task.repository.js";
import {
  LayoutCompositionSourceError,
  LayoutCompositionSourceProjector,
} from "./layout-composition-source-projector.service.js";
import {
  LayoutPendingCommandService,
  LayoutPendingCommandServiceError,
} from "./layout-pending-command.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

class LayoutCompositionServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "LayoutCompositionServiceError";
  }
}

function serviceError(code: string, status: number, details?: unknown): never {
  throw new LayoutCompositionServiceError(code, status, details);
}

function response(
  result: "applied" | "replayed",
  target: "working_copy" | "pending_command",
  taskId: string,
  targetId: string,
  documentDigest: LayoutDigest,
  rowVersion: number,
): LayoutCompositionApplyResponseV1 {
  return {
    schemaVersion: 1,
    result,
    target,
    taskId,
    targetId,
    documentDigest,
    rowVersion,
  };
}

function commandSelectionElementIds(
  commandBatch: NonNullable<ReturnType<typeof parseLayoutCompositionTaskOutputV1>["result"]["commandBatch"]>,
): string[] {
  const result = new Set<string>();
  for (const command of commandBatch.commands) {
    const payload = command.payload as unknown as Record<string, unknown>;
    if (typeof payload.elementId === "string") result.add(payload.elementId);
    if (Array.isArray(payload.elementIds)) {
      for (const elementId of payload.elementIds) {
        if (typeof elementId === "string") result.add(elementId);
      }
    }
  }
  return [...result];
}

@Injectable()
export class LayoutCompositionService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly tasks: PersistentTaskRepository,
    @Inject(LayoutCompositionSourceProjector) private readonly sources: LayoutCompositionSourceProjector,
    @Inject(LayoutPendingCommandService) private readonly pendingCommands: LayoutPendingCommandService,
  ) {}

  async create(
    scope: VersionScopeV1,
    body: unknown,
  ): Promise<{ schemaVersion: 1; replayed: boolean; task: GenerationTaskItem }> {
    return this.execute(async () => {
      const request = parseCreateLayoutCompositionRequestV1(body);
      const input = await this.sources.freeze(scope, request);
      const created = await this.tasks.create({
        projectId: scope.projectId,
        type: "layout_compose",
        target: { type: "chapter", id: scope.chapterId, chapterId: scope.chapterId },
        input: input as unknown as Record<string, unknown>,
      });
      return { schemaVersion: 1, replayed: created.replayed, task: created.item };
    });
  }

  async get(
    scope: VersionScopeV1,
    taskId: string,
  ): Promise<{ schemaVersion: 1; task: GenerationTaskItem }> {
    return this.execute(async () => {
      const task = await this.tasks.get(taskId);
      this.assertTaskScope(scope, task);
      return { schemaVersion: 1, task };
    });
  }

  async apply(
    scope: VersionScopeV1,
    taskId: string,
  ): Promise<LayoutCompositionApplyResponseV1> {
    return this.execute(() => this.prismaService.runBusinessTransaction(async (tx) => {
      const task = await tx.generationTask.findFirst({
        where: {
          id: taskId,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          type: "layout_compose",
          targetType: "chapter",
          targetId: scope.chapterId,
          recordKind: "runtime",
        },
      });
      if (!task) serviceError("GENERATION_TASK_NOT_FOUND", 404);
      if (task.status !== "succeeded" || !task.outputJson) {
        serviceError("LAYOUT_COMPOSITION_TASK_NOT_READY", 409, {
          status: task.status,
        });
      }
      const input = parseLayoutCompositionTaskInputV1(task.inputJson);
      const output = parseLayoutCompositionTaskOutputV1(task.outputJson);
      if (
        input.mode !== output.mode
        || input.sourceProjectionDigest !== output.sourceProjectionDigest
        || (input.source.baseWorkingCopy?.documentDigest ?? null) !== output.baseDocumentDigest
      ) serviceError("LAYOUT_COMPOSITION_TASK_NOT_READY", 409, { reason: "OUTPUT_INPUT_MISMATCH" });

      const priorRow = await tx.layoutCompositionApplication.findUnique({
        where: { taskId },
      });
      const prior = priorRow
        ? parseLayoutCompositionApplicationEvidenceV1({
            schemaVersion: 1,
            kind: "layout_composition_application_v1",
            taskId: priorRow.taskId,
            result: priorRow.result,
            targetId: priorRow.targetId,
            baseDocumentDigest: priorRow.baseDocumentDigest,
            resultDocumentDigest: priorRow.resultDocumentDigest,
            targetRowVersion: priorRow.targetRowVersion,
          })
        : null;
      if (prior) return this.replay(scope, taskId, prior, tx);

      await this.sources.assertCurrentMatches(scope, input, tx);
      if (output.result.kind === "initial_document") {
        if (!output.result.document) serviceError("LAYOUT_COMPOSITION_TASK_NOT_READY", 409);
        const imageByAssetId = Object.fromEntries(
          input.source.candidateLockSet.items.map((item) => [
            item.source.assetId,
            {
              width: item.width,
              height: item.height,
              sha256: item.assetDigest,
              ready: true,
              projectId: scope.projectId,
              chapterId: scope.chapterId,
              shotId: item.source.shotId,
              candidateId: item.source.candidateId,
              candidateLockRevisionId: item.source.candidateLockRevisionId,
            } satisfies LayoutImageValidationContextV1,
          ]),
        );
        const document = LayoutDocumentCodecV2.encode(output.result.document, {
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          comicFormat: input.source.comicFormat,
          imageByAssetId,
        });
        const sourceLockSetDigest = digestLayoutSourceLockSet(
          projectLayoutDocumentV2ToV1(document.value),
          input.source.storyboard.document.shots.map((shot) => shot.id),
        );
        if (sourceLockSetDigest !== input.source.candidateLockSet.digest) {
          serviceError("LAYOUT_COMPOSITION_SOURCE_STALE", 409);
        }
        const chapter = await tx.chapter.findFirst({
          where: { id: scope.chapterId, projectId: scope.projectId },
          select: { currentLayoutRevisionId: true },
        });
        if (!chapter) serviceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409);
        const now = new Date();
        const workingCopy = await tx.layoutWorkingCopy.create({
          data: {
            id: `layout_wc_${randomUUID()}`,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            documentKind: "layout_document_v2",
            documentJson: document.value as unknown as Prisma.InputJsonValue,
            schemaVersion: 2,
            documentDigest: document.digest,
            sourceLockSetDigest,
            basedOnRevisionId: chapter.currentLayoutRevisionId,
            rowVersion: 0,
            createdAt: now,
            updatedAt: now,
          },
        });
        const evidence: LayoutCompositionApplicationEvidenceV1 = {
          schemaVersion: 1,
          kind: "layout_composition_application_v1",
          taskId,
          result: "initial_working_copy",
          targetId: workingCopy.id,
          baseDocumentDigest: null,
          resultDocumentDigest: document.digest,
          targetRowVersion: 0,
        };
        await tx.layoutCompositionApplication.create({
          data: {
            id: `layout_composition_application_${randomUUID()}`,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            taskId,
            result: evidence.result,
            targetId: evidence.targetId,
            baseDocumentDigest: evidence.baseDocumentDigest,
            resultDocumentDigest: evidence.resultDocumentDigest,
            targetRowVersion: evidence.targetRowVersion,
            createdAt: now,
          },
        });
        return response(
          "applied",
          "working_copy",
          taskId,
          workingCopy.id,
          document.digest,
          0,
        );
      }

      if (!output.result.commandBatch || !input.source.baseWorkingCopy) {
        serviceError("LAYOUT_COMPOSITION_TASK_NOT_READY", 409);
      }
      const usedVisualAnalysis = output.report.analysisMode !== "rule_fallback";
      const summary = input.mode === "scoped_reflow"
        ? usedVisualAnalysis
          ? "系统结合画面分析调整了选中范围，可预览后使用或保留当前排法。"
          : "系统根据分镜与对白调整了选中范围，可预览后使用或保留当前排法。"
        : usedVisualAnalysis
          ? "系统结合画面分析生成了一版新排法，可对比后使用或保留当前排法。"
          : "系统根据分镜、图片尺寸和对白规则生成了一版新排法，可对比后使用或保留当前排法。";
      const preview = await this.pendingCommands.createFromCompositionInTransaction(
        scope,
        {
          expectedWorkingCopyRowVersion: input.source.baseWorkingCopy.rowVersion,
          expectedDocumentDigest: input.source.baseWorkingCopy.documentDigest,
          selectionElementIds: input.mode === "scoped_reflow"
            ? commandSelectionElementIds(output.result.commandBatch)
            : [],
          summary,
          warnings: [...new Set(output.report.issues
            .filter((issue) => issue.severity !== "info")
            .map((issue) => issue.code))]
            .slice(0, 100),
          commandBatch: output.result.commandBatch,
        },
        tx,
      );
      const evidence: LayoutCompositionApplicationEvidenceV1 = {
        schemaVersion: 1,
        kind: "layout_composition_application_v1",
        taskId,
        result: "pending_command",
        targetId: preview.id,
        baseDocumentDigest: input.source.baseWorkingCopy.documentDigest,
        resultDocumentDigest: preview.payload.resultDocumentDigest,
        targetRowVersion: input.source.baseWorkingCopy.rowVersion,
      };
      await tx.layoutCompositionApplication.create({
        data: {
          id: `layout_composition_application_${randomUUID()}`,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          taskId,
          result: evidence.result,
          targetId: evidence.targetId,
          baseDocumentDigest: evidence.baseDocumentDigest,
          resultDocumentDigest: evidence.resultDocumentDigest,
          targetRowVersion: evidence.targetRowVersion,
          createdAt: new Date(),
        },
      });
      return response(
        "applied",
        "pending_command",
        taskId,
        preview.id,
        preview.payload.resultDocumentDigest,
        input.source.baseWorkingCopy.rowVersion,
      );
    }));
  }

  private assertTaskScope(scope: VersionScopeV1, task: GenerationTaskItem): void {
    if (
      task.projectId !== scope.projectId
      || task.type !== "layout_compose"
      || task.target?.type !== "chapter"
      || task.target.id !== scope.chapterId
      || task.target.chapterId !== scope.chapterId
    ) serviceError("GENERATION_TASK_NOT_FOUND", 404);
  }

  private async replay(
    scope: VersionScopeV1,
    taskId: string,
    evidence: LayoutCompositionApplicationEvidenceV1,
    tx: Prisma.TransactionClient,
  ): Promise<LayoutCompositionApplyResponseV1> {
    if (evidence.taskId !== taskId) {
      serviceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409);
    }
    if (evidence.result === "initial_working_copy") {
      const workingCopy = await tx.layoutWorkingCopy.findFirst({
        where: {
          id: evidence.targetId,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
        },
      });
      if (
        !workingCopy
        || workingCopy.documentKind !== "layout_document_v2"
        || workingCopy.rowVersion !== evidence.targetRowVersion
        || workingCopy.documentDigest !== evidence.resultDocumentDigest
      ) serviceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409);
      return response(
        "replayed",
        "working_copy",
        taskId,
        workingCopy.id,
        evidence.resultDocumentDigest,
        workingCopy.rowVersion,
      );
    }
    const pending = await tx.pendingDialogueArtifact.findFirst({
      where: {
        id: evidence.targetId,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        kind: "layout_editor_command_set",
        status: "pending",
      },
    });
    const workingCopy = await tx.layoutWorkingCopy.findFirst({
      where: { projectId: scope.projectId, chapterId: scope.chapterId },
    });
    if (
      !pending
      || pending.payloadDigest !== digestCanonicalJson(pending.payloadJson)
      || !workingCopy
      || workingCopy.documentKind !== "layout_document_v2"
      || workingCopy.rowVersion !== evidence.targetRowVersion
      || workingCopy.documentDigest !== evidence.baseDocumentDigest
    ) serviceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409);
    return response(
      "replayed",
      "pending_command",
      taskId,
      pending.id,
      evidence.resultDocumentDigest,
      workingCopy.rowVersion,
    );
  }

  private async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      if (!this.prismaService.isDatabaseMode()) serviceError("LAYOUT_DB_ONLY_REQUIRED", 409);
      return await action();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof LayoutCompositionServiceError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.code, details: error.details },
        }, error.status);
      }
      if (error instanceof LayoutCompositionSourceError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.code, details: error.details },
        }, error.status);
      }
      if (error instanceof LayoutPendingCommandServiceError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.code, details: error.details },
        }, error.status);
      }
      if (error instanceof LayoutCompositionContractError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.message },
        }, 400);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpException({
          success: false,
          error: {
            code: "LAYOUT_COMPOSITION_ALREADY_EXISTS",
            message: "LAYOUT_COMPOSITION_ALREADY_EXISTS",
          },
        }, 409);
      }
      throw error;
    }
  }
}
