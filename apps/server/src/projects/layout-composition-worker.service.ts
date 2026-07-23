import { Inject, Injectable } from "@nestjs/common";
import {
  LayoutCommandError,
  LayoutCompositionContractError,
  LayoutDocumentCodecV1,
  LayoutDialogueContractError,
  LayoutRuleCompositionError,
  LayoutScopedReflowError,
  LayoutVisualCompositionError,
  applyLayoutCommandBatchV2,
  buildScopedLayoutReflowV1,
  composeRuleBasedLayoutV1,
  composeVisuallyGuidedLayoutV1,
  digestCanonicalJson,
  encodeLayoutCompositionTaskOutputV1,
  parseLayoutCompositionTaskInputV1,
  projectLayoutDocumentV2ToV1,
  resolveLayoutCompositionScopeV1,
  type EditorCommandBatchV2,
  type GenerationTaskItem,
  type LayoutCompositionIssueV1,
  type LayoutCompositionTaskOutputV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import {
  PersistentTaskRepository,
  TaskLeaseLostError,
  type ClaimedPersistentTask,
} from "../tasks/persistent-task.repository.js";
import { LayoutCompositionSourceError, LayoutCompositionSourceProjector } from "./layout-composition-source-projector.service.js";
import { LayoutVisualAnalyzerService } from "./layout-visual-analyzer.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

function taskError(error: unknown): {
  code: string;
  message: string;
  retryable: false;
  details?: unknown;
} {
  if (error instanceof LayoutCompositionSourceError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof LayoutDialogueContractError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof LayoutVisualCompositionError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof LayoutScopedReflowError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof LayoutRuleCompositionError) {
    const code = error.code === "LAYOUT_COMPOSITION_SOURCE_INVALID"
      ? "LAYOUT_COMPOSITION_SOURCE_INCOMPLETE"
      : error.code;
    return { code, message: error.message, retryable: false };
  }
  if (error instanceof LayoutCommandError) {
    const protectedEdit = /protected|locked/i.test(error.message);
    return {
      code: protectedEdit
        ? "LAYOUT_COMPOSITION_PROTECTION_VIOLATION"
        : "LAYOUT_COMPOSITION_NO_VALID_PLAN",
      message: error.message,
      retryable: false,
    };
  }
  if (error instanceof LayoutCompositionContractError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: message.split(":", 1)[0] || "LAYOUT_COMPOSITION_NO_VALID_PLAN",
    message: message.slice(0, 500),
    retryable: false,
  };
}

function issues(
  values: readonly {
    code: string;
    severity: "info" | "warning" | "error";
    shotId: string | null;
    elementId: string | null;
  }[],
): LayoutCompositionIssueV1[] {
  return values.map((issue) => ({
    code: issue.code,
    severity: issue.code === "visual_analysis_outside_requested_scope"
      ? "info"
      : issue.severity,
    canvasId: null,
    elementId: issue.elementId,
    shotId: issue.shotId,
  }));
}

@Injectable()
export class LayoutCompositionWorkerService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly tasks: PersistentTaskRepository,
    @Inject(LayoutCompositionSourceProjector) private readonly sources: LayoutCompositionSourceProjector,
    @Inject(LayoutVisualAnalyzerService) private readonly visualAnalyzer: LayoutVisualAnalyzerService,
  ) {}

  async run(claim: ClaimedPersistentTask): Promise<GenerationTaskItem> {
    try {
      await this.tasks.heartbeat(
        claim.item.id,
        claim.claimToken,
        new Date(),
        5,
        "validate_input",
      );
      const input = parseLayoutCompositionTaskInputV1(claim.item.input);
      if (
        claim.item.type !== "layout_compose"
        || claim.item.target?.type !== "chapter"
        || claim.item.target.id !== input.chapterId
        || claim.item.target.chapterId !== input.chapterId
      ) throw new Error("LAYOUT_COMPOSITION_TASK_MAPPING_INVALID");
      await this.tasks.heartbeat(
        claim.item.id,
        claim.claimToken,
        new Date(),
        20,
        "compose_candidates",
      );
      const source = input.source;
      const compositionInput = {
        projectId: source.projectId,
        chapterId: source.chapterId,
        comicFormat: source.comicFormat,
        profile: source.profile,
        fontPolicy: source.fontPolicy,
        storyboardVersion: {
          id: source.storyboard.versionId,
          documentDigest: source.storyboard.documentDigest,
          document: source.storyboard.document,
        },
        sourceLockSetDigest: source.candidateLockSet.digest,
        sources: source.candidateLockSet.items.map((item) => ({
          order: item.order,
          source: item.source,
          width: item.width,
          height: item.height,
        })),
        characterCatalog: source.characterCatalog.items,
      };
      const rulePlan = composeRuleBasedLayoutV1(compositionInput);
      const requestedShotIds = input.mode === "scoped_reflow" && input.scope && source.baseWorkingCopy
        ? new Set(resolveLayoutCompositionScopeV1({
            document: source.baseWorkingCopy.document,
            storyboard: source.storyboard.document,
            narrativePlan: rulePlan.narrativePlan,
            scope: input.scope,
          }).effectiveShotIds)
        : undefined;
      const analysisRun = await this.visualAnalyzer.analyze(input, requestedShotIds);
      const plan = composeVisuallyGuidedLayoutV1({
        ...compositionInput,
        visualEvidence: analysisRun.visualEvidence,
        avoidVisibleDocumentDigest: source.baseWorkingCopy
          ? LayoutDocumentCodecV1.encode(
              projectLayoutDocumentV2ToV1(source.baseWorkingCopy.document),
            ).digest
          : null,
      });
      await this.tasks.heartbeat(
        claim.item.id,
        claim.claimToken,
        new Date(),
        85,
        "validate_plan",
      );

      let result: LayoutCompositionTaskOutputV1["result"];
      let resultPlanDigest = plan.planDigest;
      const resultIssues: LayoutCompositionIssueV1[] = [];
      if (input.mode === "initial") {
        result = {
          kind: "initial_document",
          document: plan.document,
          commandBatch: null,
        };
      } else if (input.mode === "scoped_reflow") {
        const base = source.baseWorkingCopy;
        if (!base || !input.scope) throw new Error("LAYOUT_COMPOSITION_BASE_CONFLICT");
        const scoped = buildScopedLayoutReflowV1({
          baseDocument: base.document,
          targetDocument: plan.document,
          storyboard: source.storyboard.document,
          narrativePlan: rulePlan.narrativePlan,
          scope: input.scope,
          intent: input.intent,
        });
        applyLayoutCommandBatchV2(base.document, scoped.commandBatch);
        resultPlanDigest = scoped.planDigest;
        resultIssues.push(...scoped.warnings.map((code): LayoutCompositionIssueV1 => ({
          code,
          severity: "warning",
          canvasId: null,
          elementId: null,
          shotId: null,
        })));
        result = {
          kind: "command_batch",
          document: null,
          commandBatch: scoped.commandBatch,
        };
      } else {
        const base = source.baseWorkingCopy;
        if (!base) throw new Error("LAYOUT_COMPOSITION_BASE_CONFLICT");
        let commandBatch: EditorCommandBatchV2 = {
          schemaVersion: 2,
          batchId: `layout_reflow_${digestCanonicalJson({
            baseDocumentDigest: base.documentDigest,
            planDigest: plan.planDigest,
            scopeDigest: input.scopeDigest,
          }).slice("sha256:".length, "sha256:".length + 24)}`,
          label: "智能调整排版",
          commands: [{
            schemaVersion: 2,
            commandId: `layout_reflow_command_${plan.planDigest.slice("sha256:".length, "sha256:".length + 24)}`,
            type: "layout.resize_profile",
            label: "更新画格与气泡布局",
            actor: "smart",
            payload: {
              profile: plan.document.profile,
              canvases: plan.document.canvases,
            },
          }],
        };
        try {
          applyLayoutCommandBatchV2(base.document, commandBatch);
        } catch (error) {
          if (!(error instanceof LayoutCommandError) || !/protected|locked/i.test(error.message)) {
            throw error;
          }
          const scoped = buildScopedLayoutReflowV1({
            baseDocument: base.document,
            targetDocument: plan.document,
            storyboard: source.storyboard.document,
            narrativePlan: rulePlan.narrativePlan,
            scope: {
              canvasIds: base.document.canvases.map((canvas) => canvas.id),
              elementIds: [],
              shotIds: [],
            },
            intent: input.intent,
          });
          commandBatch = scoped.commandBatch;
          resultPlanDigest = scoped.planDigest;
          resultIssues.push(...scoped.warnings.map((code): LayoutCompositionIssueV1 => ({
            code,
            severity: "warning",
            canvasId: null,
            elementId: null,
            shotId: null,
          })));
          applyLayoutCommandBatchV2(base.document, commandBatch);
        }
        result = {
          kind: "command_batch",
          document: null,
          commandBatch,
        };
      }

      const output = encodeLayoutCompositionTaskOutputV1({
        schemaVersion: 1,
        mode: input.mode,
        sourceProjectionDigest: input.sourceProjectionDigest,
        baseDocumentDigest: source.baseWorkingCopy?.documentDigest ?? null,
        result,
        visualAnalyses: plan.analyses,
        report: {
          planDigest: resultPlanDigest,
          analysisMode: plan.report.analysisMode,
          candidateCount: plan.report.candidateCount,
          selectedScore: plan.report.quality.total,
          scoreBreakdown: plan.report.quality.dimensions,
          shotCoverage: plan.report.shotCoverage,
          dialogueCoverage: {
            expected: plan.report.dialogueCoverage.expected,
            placedOriginal: plan.report.dialogueCoverage.placedOriginal,
            userModified: plan.report.dialogueCoverage.userModified,
            userSuppressed: plan.report.dialogueCoverage.userSuppressed,
          },
          issues: [...issues(plan.report.issues), ...resultIssues],
        },
      }).value;
      await this.tasks.heartbeat(
        claim.item.id,
        claim.claimToken,
        new Date(),
        95,
        "seal_output",
      );
      return this.finalizeSuccess(claim, input, output);
    } catch (error) {
      if (error instanceof TaskLeaseLostError) throw error;
      return this.finalizeFailure(claim, error);
    }
  }

  private async finalizeSuccess(
    claim: ClaimedPersistentTask,
    input: ReturnType<typeof parseLayoutCompositionTaskInputV1>,
    output: LayoutCompositionTaskOutputV1,
  ): Promise<GenerationTaskItem> {
    const scope: VersionScopeV1 = {
      projectId: claim.item.projectId,
      chapterId: input.chapterId,
    };
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const task = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
      if (!task || task.status !== "running" || task.leaseToken !== claim.claimToken) {
        throw new TaskLeaseLostError(claim.item.id);
      }
      if (task.cancelRequestedAt) {
        return this.tasks.finishInTransaction(tx, {
          taskId: task.id,
          claimToken: claim.claimToken,
          outcome: "cancelled",
          applicability: "historical",
        });
      }
      let applicability: "current" | "historical" = "current";
      try {
        await this.sources.assertCurrentMatches(scope, input, tx);
      } catch (error) {
        if (
          error instanceof LayoutCompositionSourceError
          && [
            "LAYOUT_COMPOSITION_SOURCE_STALE",
            "LAYOUT_COMPOSITION_BASE_CONFLICT",
            "LAYOUT_COMPOSITION_ALREADY_EXISTS",
          ].includes(error.code)
        ) applicability = "historical";
        else throw error;
      }
      return this.tasks.finishInTransaction(tx, {
        taskId: task.id,
        claimToken: claim.claimToken,
        outcome: "succeeded",
        output: output as unknown as Record<string, unknown>,
        applicability,
      });
    });
  }

  private async finalizeFailure(
    claim: ClaimedPersistentTask,
    error: unknown,
  ): Promise<GenerationTaskItem> {
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const task = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
      if (!task || task.status !== "running" || task.leaseToken !== claim.claimToken) {
        throw new TaskLeaseLostError(claim.item.id);
      }
      if (task.cancelRequestedAt) {
        return this.tasks.finishInTransaction(tx, {
          taskId: task.id,
          claimToken: claim.claimToken,
          outcome: "cancelled",
          applicability: "historical",
        });
      }
      return this.tasks.finishInTransaction(tx, {
        taskId: task.id,
        claimToken: claim.claimToken,
        outcome: "failed",
        error: taskError(error),
        applicability: "historical",
      });
    });
  }
}
