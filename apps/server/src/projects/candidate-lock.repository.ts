import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  StoryboardDocumentCodecV2,
  isExactCandidateLockReplay,
  normalizeCandidateLockTargetCandidateId,
  resolveCandidateLockTransition,
  type CandidateLockCommitResponse,
  type CandidateLockHistoryPage,
  type CandidateLockImpactPreviewResponse,
  type CandidateLockRevisionDto,
  type CandidateLockSetSummary,
  type CandidatePreferenceResponse,
  type CandidateStatus,
  type CommitCandidateLockRequest,
  type CurrentCandidateDecision,
  type PreviewCandidateLockRequest,
  type TaskApplicability,
  type WorkbenchCandidateV2,
  type WorkbenchShotV2,
} from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { analyzeCandidateLockImpact } from "./candidate-lock-impact-analyzer.js";
import { resolveCandidateLockSet } from "./candidate-lock-set-resolver.js";
import { candidateLockError, CandidateLockServiceError } from "./candidate-lock-error.js";
import { projectLayoutWorkingCopyDependencies } from "./layout-working-copy-dependency-projector.js";
import { ChapterProductionQueryService } from "./versioning/chapter-production-query.service.js";
import { NewWorkGateService } from "./versioning/new-work-gate.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

type Reader = Prisma.TransactionClient | PrismaClient;

interface ChapterContext {
  id: string;
  projectId: string;
  currentStoryboardVersionId: string;
  currentStoryVersionId: string | null;
  currentPreflightRevisionId: string | null;
  currentLayoutRevisionId: string | null;
  currentExportRevisionId: string | null;
  milestoneStatus: string;
  completedAt: Date | null;
  currentStoryboardVersion: { documentJson: Prisma.JsonValue };
  currentPreflightRevision: { sourceDigest: string } | null;
}

interface RevisionRow {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  revision: number;
  action: string;
  candidateId: string | null;
  previousRevisionId: string | null;
  origin: string;
  reason: string | null;
  decidedAt: Date | null;
  recordedAt: Date;
}

interface CandidateRow {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  taskId: string;
  assetId: string;
  index: number;
  status: string;
  favoriteAt: Date | null;
  label: string;
  promptDigest: string | null;
  generationPurpose: string;
  generationSpecVersion: number | null;
  generationSpecDigest: string | null;
  createdAt: Date;
  updatedAt: Date;
  asset: { status: string };
  task: {
    recordKind: string;
    applicability: string | null;
    generationTaskSourcesByTask: Array<{
      sourceType: string;
      sourceId: string;
      sourceDigest: string;
    }>;
  };
}

interface DecisionContext {
  chapter: ChapterContext;
  shot: {
    id: string;
    lifecycleStatus: string;
    currentCandidateLockRevisionId: string | null;
    currentCandidateLockRevision: RevisionRow | null;
  };
  currentRevision: RevisionRow | null;
  currentDecision: CurrentCandidateDecision;
}

@Injectable()
export class CandidateLockRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(NewWorkGateService) private readonly newWorkGate: NewWorkGateService,
    @Inject(ChapterProductionQueryService) private readonly productionQuery: ChapterProductionQueryService,
  ) {}

  async preview(
    scope: VersionScopeV1,
    shotId: string,
    request: PreviewCandidateLockRequest,
  ): Promise<CandidateLockImpactPreviewResponse> {
    this.assertDatabaseMode();
    return this.prismaService.database().$transaction(async (tx) => {
      const context = await this.readDecisionContext(tx, scope, shotId);
      const transition = this.resolveTransition(context.currentDecision, request);
      await this.requireTargetCandidate(tx, context, request);
      const gate = await this.newWorkGate.check(
        scope,
        "image_generate",
        { targetShotId: shotId },
        tx,
      );
      const analysis = await this.readImpact(
        tx,
        context.chapter,
        shotId,
        request.action,
        normalizeCandidateLockTargetCandidateId(request),
        context.currentRevision?.id ?? null,
        transition.kind === "no_op",
      );
      return {
        schemaVersion: 1,
        policyVersion: "candidate_lock_impact_v1",
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        shotId,
        action: request.action,
        targetCandidateId: normalizeCandidateLockTargetCandidateId(request),
        currentDecision: context.currentDecision,
        expectedCurrentRevisionId: context.currentRevision?.id ?? null,
        noOp: transition.kind === "no_op",
        commitAllowed: gate.allowed,
        commitBlockedReasonCodes: gate.allowed ? [] : ["UPSTREAM_WORK_NOT_CONFIRMED"],
        impact: analysis.impact,
        impactDigest: analysis.impactDigest,
      };
    });
  }

  async commit(
    scope: VersionScopeV1,
    shotId: string,
    request: CommitCandidateLockRequest,
  ): Promise<CandidateLockCommitResponse> {
    this.assertDatabaseMode();
    let transactionResult: {
      result: "created" | "no_op" | "replayed";
      revision: RevisionRow;
      impact: Awaited<ReturnType<CandidateLockRepository["readImpact"]>>["impact"];
      activeTaskIds: string[];
    };
    try {
      transactionResult = await this.prismaService.runBusinessTransaction(async (tx) => {
        const context = await this.readDecisionContext(tx, scope, shotId);
        if (isExactCandidateLockReplay(context.currentRevision && this.toRevisionDto(context.currentRevision), request)) {
          const replayImpact = await this.readImpact(
            tx,
            context.chapter,
            shotId,
            request.action,
            normalizeCandidateLockTargetCandidateId(request),
            request.expectedCurrentRevisionId,
            false,
          );
          return {
            result: "replayed" as const,
            revision: context.currentRevision!,
            impact: replayImpact.impact,
            activeTaskIds: [],
          };
        }
        if ((context.currentRevision?.id ?? null) !== request.expectedCurrentRevisionId) {
          throw candidateLockError(409, "CANDIDATE_LOCK_REVISION_CONFLICT", {
            expectedCurrentRevisionId: request.expectedCurrentRevisionId,
            actualCurrentRevisionId: context.currentRevision?.id ?? null,
          });
        }
        const transition = this.resolveTransition(context.currentDecision, request);
        await this.requireTargetCandidate(tx, context, request);
        const gate = await this.newWorkGate.check(
          scope,
          "image_generate",
          { targetShotId: shotId },
          tx,
        );
        if (!gate.allowed) {
          throw candidateLockError(409, "UPSTREAM_WORK_NOT_CONFIRMED", {
            reasonCodes: gate.reasonCodes,
          });
        }
        const analysis = await this.readImpact(
          tx,
          context.chapter,
          shotId,
          request.action,
          normalizeCandidateLockTargetCandidateId(request),
          request.expectedCurrentRevisionId,
          transition.kind === "no_op",
        );
        if (analysis.impactDigest !== request.impactDigest) {
          throw candidateLockError(409, "CANDIDATE_LOCK_IMPACT_CHANGED", {
            expectedImpactDigest: request.impactDigest,
            actualImpactDigest: analysis.impactDigest,
          });
        }
        if (transition.kind === "no_op") {
          if (!context.currentRevision) {
            throw candidateLockError(500, "CANDIDATE_LOCK_REVISION_CONFLICT");
          }
          return {
            result: "no_op" as const,
            revision: context.currentRevision,
            impact: analysis.impact,
            activeTaskIds: [],
          };
        }
        const now = new Date();
        const revision = await tx.candidateLockRevision.create({
          data: {
            id: randomUUID(),
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            shotId,
            revision: (context.currentRevision?.revision ?? 0) + 1,
            action: transition.action,
            candidateId: transition.candidateId,
            previousRevisionId: context.currentRevision?.id ?? null,
            origin: "runtime",
            reason: request.reason,
            decidedAt: now,
            recordedAt: now,
          },
        });
        const pointer = await tx.shot.updateMany({
          where: {
            id: shotId,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            lifecycleStatus: "active",
            currentCandidateLockRevisionId: context.currentRevision?.id ?? null,
          },
          data: { currentCandidateLockRevisionId: revision.id, updatedAt: now },
        });
        if (pointer.count !== 1) {
          throw candidateLockError(409, "CANDIDATE_LOCK_REVISION_CONFLICT");
        }
        return {
          result: "created" as const,
          revision,
          impact: analysis.impact,
          activeTaskIds: analysis.impact.activeTaskIds,
        };
      });
    } catch (error) {
      if (error instanceof CandidateLockServiceError && error.code !== "CANDIDATE_LOCK_REVISION_CONFLICT") throw error;
      if (!this.isWriterConflict(error)) throw error;
      const current = await this.readCurrentRevision(scope, shotId);
      if (isExactCandidateLockReplay(current && this.toRevisionDto(current), request)) {
        const context = await this.readDecisionContext(this.prismaService.database(), scope, shotId);
        const impact = await this.readImpact(
          this.prismaService.database(),
          context.chapter,
          shotId,
          request.action,
          normalizeCandidateLockTargetCandidateId(request),
          request.expectedCurrentRevisionId,
          false,
        );
        transactionResult = {
          result: "replayed",
          revision: current!,
          impact: impact.impact,
          activeTaskIds: [],
        };
      } else {
        throw candidateLockError(409, "CANDIDATE_LOCK_REVISION_CONFLICT");
      }
    }

    if (transactionResult.result === "created" && transactionResult.activeTaskIds.length > 0) {
      const now = new Date();
      await this.prismaService.runBusinessTransaction((tx) => tx.generationTask.updateMany({
        where: {
          id: { in: transactionResult.activeTaskIds },
          status: { in: ["queued", "running", "retrying"] },
          cancelRequestedAt: null,
        },
        data: { cancelRequestedAt: now, updatedAt: now },
      })).catch(() => undefined);
    }
    return this.buildCommitResponse(
      scope,
      shotId,
      transactionResult.result,
      transactionResult.revision,
      transactionResult.impact,
    );
  }

  async history(
    scope: VersionScopeV1,
    shotId: string,
    limit: number,
    beforeRevision: number | null,
  ): Promise<CandidateLockHistoryPage> {
    this.assertDatabaseMode();
    await this.readDecisionContext(this.prismaService.database(), scope, shotId);
    const rows = await this.prismaService.database().candidateLockRevision.findMany({
      where: {
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        shotId,
        ...(beforeRevision === null ? {} : { revision: { lt: beforeRevision } }),
      },
      orderBy: { revision: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => this.toRevisionDto(row));
    return {
      schemaVersion: 1,
      items,
      nextBeforeRevision: hasMore ? items.at(-1)?.revision ?? null : null,
    };
  }

  async setFavorite(
    scope: VersionScopeV1,
    candidateId: string,
    favorite: boolean,
  ): Promise<CandidatePreferenceResponse> {
    this.assertDatabaseMode();
    const candidate = await this.requireCandidate(this.prismaService.database(), scope, candidateId);
    const isFavorite = candidate.favoriteAt !== null;
    if (isFavorite !== favorite) {
      await this.prismaService.runBusinessTransaction((tx) => tx.candidate.update({
        where: { id: candidateId },
        data: { favoriteAt: favorite ? new Date() : null },
      }));
    }
    return { schemaVersion: 1, candidate: await this.readWorkbenchCandidate(scope, candidateId) };
  }

  async setRejected(
    scope: VersionScopeV1,
    candidateId: string,
    rejected: boolean,
  ): Promise<CandidatePreferenceResponse> {
    this.assertDatabaseMode();
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const candidate = await this.requireCandidate(tx, scope, candidateId);
      const shot = await tx.shot.findFirst({
        where: { id: candidate.shotId, projectId: scope.projectId, chapterId: scope.chapterId },
        include: { currentCandidateLockRevision: true },
      });
      if (shot?.currentCandidateLockRevision?.candidateId === candidateId) {
        throw candidateLockError(409, "CANDIDATE_IS_CURRENT_FINAL");
      }
      if (candidate.status === "superseded") {
        throw candidateLockError(409, "CANDIDATE_STATUS_TRANSITION_INVALID");
      }
      const next = rejected ? "rejected" : "generated";
      if (candidate.status !== next) {
        await tx.candidate.update({ where: { id: candidateId }, data: { status: next } });
      }
    });
    return { schemaVersion: 1, candidate: await this.readWorkbenchCandidate(scope, candidateId) };
  }

  async completeChapter(scope: VersionScopeV1): Promise<{
    candidateLockSet: CandidateLockSetSummary;
    productionState: Awaited<ReturnType<ChapterProductionQueryService["get"]>>["productionState"];
  }> {
    this.assertDatabaseMode();
    await this.prismaService.runBusinessTransaction(async (tx) => {
      const chapter = await this.requireChapter(tx, scope);
      const activeShots = await tx.shot.findMany({
        where: { projectId: scope.projectId, chapterId: scope.chapterId, lifecycleStatus: "active" },
        select: { id: true },
      });
      if (activeShots.length === 0) {
        throw candidateLockError(409, "CANDIDATE_LOCK_SET_INCOMPLETE", { missingShotIds: [] });
      }
      for (const shot of activeShots) {
        const gate = await this.newWorkGate.check(scope, "image_generate", { targetShotId: shot.id }, tx);
        if (!gate.allowed) {
          throw candidateLockError(409, "UPSTREAM_WORK_NOT_CONFIRMED", {
            shotId: shot.id,
            reasonCodes: gate.reasonCodes,
          });
        }
      }
      const lockSet = await this.readLockSet(tx, chapter);
      if (lockSet.state !== "complete") {
        throw candidateLockError(409, "CANDIDATE_LOCK_SET_INCOMPLETE", {
          missingShotIds: lockSet.missingShotIds,
          clearedShotIds: lockSet.clearedShotIds,
          unresolvedShotIds: lockSet.unresolvedShotIds,
        });
      }
      if (lockSet.sourceApplicability !== "current") {
        throw candidateLockError(409, "CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT", {
          sourceApplicability: lockSet.sourceApplicability,
        });
      }
      if (!["images_done", "layout_done", "exported"].includes(chapter.milestoneStatus)) {
        await tx.chapter.update({
          where: { id: scope.chapterId },
          data: { milestoneStatus: "images_done", completedAt: chapter.completedAt ?? new Date(), rowVersion: { increment: 1 } },
        });
      }
    });
    const chapter = await this.requireChapter(this.prismaService.database(), scope);
    return {
      candidateLockSet: await this.readLockSet(this.prismaService.database(), chapter),
      productionState: (await this.productionQuery.get(scope)).productionState,
    };
  }

  private async buildCommitResponse(
    scope: VersionScopeV1,
    shotId: string,
    result: "created" | "no_op" | "replayed",
    revision: RevisionRow,
    impact: CandidateLockCommitResponse["committedImpact"],
  ): Promise<CandidateLockCommitResponse> {
    const db = this.prismaService.database();
    const context = await this.readDecisionContext(db, scope, shotId);
    const candidateRows = await this.readCandidateRows(db, scope, { shotId });
    const candidateLockSet = await this.readLockSet(db, context.chapter);
    const productionState = (await this.productionQuery.get(scope)).productionState;
    return {
      schemaVersion: 1,
      result,
      revision: this.toRevisionDto(revision),
      currentDecision: context.currentDecision,
      shot: await this.toWorkbenchShot(db, context, candidateRows),
      candidatesForShot: candidateRows.map((candidate) => this.toWorkbenchCandidate(candidate, context.currentDecision, context.chapter)),
      candidateLockSet,
      productionState,
      committedImpact: impact,
    };
  }

  private async readDecisionContext(reader: Reader, scope: VersionScopeV1, shotId: string): Promise<DecisionContext> {
    const chapter = await this.requireChapter(reader, scope);
    const shot = await reader.shot.findFirst({
      where: { id: shotId, projectId: scope.projectId, chapterId: scope.chapterId },
      include: { currentCandidateLockRevision: true },
    });
    if (!shot) throw candidateLockError(404, "SHOT_NOT_FOUND");
    if (shot.lifecycleStatus !== "active") throw candidateLockError(409, "SHOT_NOT_ACTIVE");
    const currentRevision = shot.currentCandidateLockRevision as RevisionRow | null;
    if (shot.currentCandidateLockRevisionId !== null && currentRevision === null) {
      throw candidateLockError(500, "CANDIDATE_LOCK_REVISION_CONFLICT");
    }
    return {
      chapter,
      shot: {
        id: shot.id,
        lifecycleStatus: shot.lifecycleStatus,
        currentCandidateLockRevisionId: shot.currentCandidateLockRevisionId,
        currentCandidateLockRevision: currentRevision,
      },
      currentRevision,
      currentDecision: this.toCurrentDecision(currentRevision),
    };
  }

  private async requireChapter(reader: Reader, scope: VersionScopeV1): Promise<ChapterContext> {
    const chapter = await reader.chapter.findFirst({
      where: { id: scope.chapterId, projectId: scope.projectId },
      include: { currentStoryboardVersion: true, currentPreflightRevision: true },
    });
    if (!chapter) {
      const project = await reader.project.findUnique({ where: { id: scope.projectId }, select: { id: true } });
      if (!project) throw candidateLockError(404, "PROJECT_NOT_FOUND");
      throw candidateLockError(404, "CHAPTER_NOT_FOUND");
    }
    if (!chapter.currentStoryboardVersionId || !chapter.currentStoryboardVersion) {
      throw candidateLockError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
    }
    return chapter as ChapterContext;
  }

  private async requireTargetCandidate(
    reader: Reader,
    context: DecisionContext,
    request: PreviewCandidateLockRequest | CommitCandidateLockRequest,
  ): Promise<CandidateRow | null> {
    if (request.action === "clear") return null;
    const candidate = await this.requireCandidate(reader, {
      projectId: context.chapter.projectId,
      chapterId: context.chapter.id,
    }, request.candidateId);
    if (candidate.shotId !== context.shot.id) throw candidateLockError(409, "CANDIDATE_SHOT_MISMATCH");
    if (candidate.status === "rejected") throw candidateLockError(409, "CANDIDATE_REJECTED");
    if (candidate.status === "superseded") throw candidateLockError(409, "CANDIDATE_SUPERSEDED");
    if (candidate.asset.status !== "ready") throw candidateLockError(409, "CANDIDATE_ASSET_NOT_READY");
    if (this.sourceApplicability(candidate, context.chapter) !== "current") {
      throw candidateLockError(409, "CANDIDATE_SOURCE_NOT_CURRENT");
    }
    return candidate;
  }

  private async requireCandidate(reader: Reader, scope: VersionScopeV1, candidateId: string): Promise<CandidateRow> {
    const candidate = await reader.candidate.findFirst({
      where: { id: candidateId, projectId: scope.projectId, chapterId: scope.chapterId },
      include: { asset: true, task: { include: { generationTaskSourcesByTask: true } } },
    });
    if (!candidate) throw candidateLockError(404, "CANDIDATE_NOT_FOUND");
    return candidate as CandidateRow;
  }

  private async readCandidateRows(
    reader: Reader,
    scope: VersionScopeV1,
    extra: { shotId?: string; candidateId?: string } = {},
  ): Promise<CandidateRow[]> {
    return await reader.candidate.findMany({
      where: {
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        ...(extra.shotId ? { shotId: extra.shotId } : {}),
        ...(extra.candidateId ? { id: extra.candidateId } : {}),
      },
      include: { asset: true, task: { include: { generationTaskSourcesByTask: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }) as CandidateRow[];
  }

  private async readWorkbenchCandidate(scope: VersionScopeV1, candidateId: string): Promise<WorkbenchCandidateV2> {
    const db = this.prismaService.database();
    const candidate = (await this.readCandidateRows(db, scope, { candidateId }))[0];
    if (!candidate) throw candidateLockError(404, "CANDIDATE_NOT_FOUND");
    const shot = await db.shot.findFirst({
      where: { id: candidate.shotId, projectId: scope.projectId, chapterId: scope.chapterId },
      include: { currentCandidateLockRevision: true },
    });
    const chapter = await this.requireChapter(db, scope);
    return this.toWorkbenchCandidate(candidate, this.toCurrentDecision(shot?.currentCandidateLockRevision as RevisionRow | null), chapter);
  }

  private sourceApplicability(candidate: CandidateRow, chapter: ChapterContext): TaskApplicability {
    if (candidate.task.recordKind !== "runtime") return "legacy_unresolved";
    const preflightSource = candidate.task.generationTaskSourcesByTask.find((source) => source.sourceType === "preflight_revision");
    if (!preflightSource) return "legacy_unresolved";
    if (
      candidate.task.applicability !== "current"
      || chapter.currentPreflightRevisionId === null
      || chapter.currentPreflightRevision === null
      || preflightSource.sourceId !== chapter.currentPreflightRevisionId
      || preflightSource.sourceDigest !== chapter.currentPreflightRevision.sourceDigest
    ) return "historical";
    return "current";
  }

  private async readLockSet(reader: Reader, chapter: ChapterContext): Promise<CandidateLockSetSummary> {
    const shots = await reader.shot.findMany({
      where: { projectId: chapter.projectId, chapterId: chapter.id },
      include: {
        currentCandidateLockRevision: {
          include: { candidate: { include: { asset: true, task: { include: { generationTaskSourcesByTask: true } } } } },
        },
      },
    });
    return resolveCandidateLockSet({
      projectId: chapter.projectId,
      chapterId: chapter.id,
      storyboardVersionId: chapter.currentStoryboardVersionId,
      shots: shots.map((shot) => {
        const revision = shot.currentCandidateLockRevision;
        const candidate = revision?.candidate as CandidateRow | null | undefined;
        return {
          shotId: shot.id,
          lifecycleStatus: shot.lifecycleStatus === "active" ? "active" as const : "retired" as const,
          currentCandidateLockRevisionId: shot.currentCandidateLockRevisionId,
          currentRevision: revision ? {
            id: revision.id,
            projectId: revision.projectId,
            chapterId: revision.chapterId,
            shotId: revision.shotId,
            action: revision.action as "lock" | "replace" | "clear",
            candidateId: revision.candidateId,
          } : null,
          candidate: candidate ? {
            id: candidate.id,
            projectId: candidate.projectId,
            chapterId: candidate.chapterId,
            shotId: candidate.shotId,
            status: this.candidateStatus(candidate.status),
            assetReady: candidate.asset.status === "ready",
            sourceApplicability: this.sourceApplicability(candidate, chapter),
          } : null,
        };
      }),
    });
  }

  private async readImpact(
    reader: Reader,
    chapter: ChapterContext,
    shotId: string,
    action: "lock" | "replace" | "clear",
    targetCandidateId: string | null,
    expectedCurrentRevisionId: string | null,
    noOp: boolean,
  ) {
    const [shots, workingCopy, formalBindings, exportRevisions, tasks, lockSet] = await Promise.all([
      reader.shot.findMany({
        where: { projectId: chapter.projectId, chapterId: chapter.id },
        include: { currentCandidateLockRevision: true },
      }),
      reader.layoutWorkingCopy.findUnique({ where: { chapterId: chapter.id } }),
      reader.layoutSourceBinding.findMany({
        where: { layoutRevision: { projectId: chapter.projectId, chapterId: chapter.id } },
      }),
      reader.exportRevision.findMany({ where: { projectId: chapter.projectId, chapterId: chapter.id } }),
      reader.generationTask.findMany({
        where: {
          projectId: chapter.projectId,
          chapterId: chapter.id,
          status: { in: ["queued", "running", "retrying"] },
        },
        include: { generationTaskSourcesByTask: true },
      }),
      this.readLockSet(reader, chapter),
    ]);
    const currentRevisionByShot = Object.fromEntries(shots.flatMap((shot) => shot.currentCandidateLockRevision
      ? [[shot.id, {
          id: shot.currentCandidateLockRevision.id,
          action: shot.currentCandidateLockRevision.action as "lock" | "replace" | "clear",
        }]]
      : []));
    const workingCopyBindings = workingCopy ? projectLayoutWorkingCopyDependencies({
      workingCopyId: workingCopy.id,
      documentKind: workingCopy.documentKind as "legacy_chapter_layout_v1" | "layout_document_v1",
      documentDigest: workingCopy.documentDigest,
      documentJson: workingCopy.documentJson,
      currentRevisionByShot,
    }) : [];
    return analyzeCandidateLockImpact({
      projectId: chapter.projectId,
      chapterId: chapter.id,
      shotId,
      action,
      targetCandidateId,
      expectedCurrentRevisionId,
      noOp,
      workingCopyBindings,
      formalBindings: formalBindings.map((binding) => ({
        layoutRevisionId: binding.layoutRevisionId,
        elementId: binding.elementId,
        role: binding.role,
        shotId: binding.shotId,
        candidateLockRevisionId: binding.candidateLockRevisionId,
      })),
      exportRevisions: exportRevisions.map((revision) => ({ id: revision.id, layoutRevisionId: revision.layoutRevisionId })),
      tasks: tasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status ?? "",
        targetShotId: task.targetType === "shot" ? task.targetId ?? undefined : undefined,
        sources: task.generationTaskSourcesByTask,
      })),
      currentLayoutRevisionId: chapter.currentLayoutRevisionId,
      currentExportRevisionId: chapter.currentExportRevisionId,
      currentCompleteLockSetDigest: lockSet.state === "complete" ? lockSet.digest : null,
    });
  }

  private async toWorkbenchShot(reader: Reader, context: DecisionContext, candidates: CandidateRow[]): Promise<WorkbenchShotV2> {
    const document = StoryboardDocumentCodecV2.parse(context.chapter.currentStoryboardVersion.documentJson);
    const shot = document.shots.find((item) => item.id === context.shot.id);
    if (!shot) throw candidateLockError(500, "SHOT_NOT_FOUND");
    const [scenes, characters] = await Promise.all([
      context.chapter.currentStoryVersionId
        ? reader.storySceneProjection.findMany({ where: { storyVersionId: context.chapter.currentStoryVersionId } })
        : [],
      shot.characterIds.length > 0
        ? reader.character.findMany({ where: { projectId: context.chapter.projectId, id: { in: shot.characterIds } } })
        : [],
    ]);
    const sceneName = scenes.find((scene) => scene.sceneKey === shot.sceneId)?.name ?? "";
    const characterNames = new Map(characters.map((character) => [character.id, character.name]));
    const status: WorkbenchShotV2["status"] = context.currentDecision.state === "finalized"
      ? "locked"
      : candidates.length > 0
        ? "image_generated"
        : "ready_for_image";
    return {
      id: shot.id,
      chapterId: context.chapter.id,
      order: shot.order,
      beatId: shot.beatId,
      sceneId: shot.sceneId,
      sceneName,
      characterIds: [...shot.characterIds],
      characters: shot.characterIds.map((id) => characterNames.get(id) ?? id),
      coreAction: shot.coreAction,
      emotion: shot.emotion,
      comic: shot.comic,
      motion: shot.motion,
      promptDraft: shot.promptDraft,
      status,
      currentCandidateDecision: context.currentDecision,
    };
  }

  private toWorkbenchCandidate(candidate: CandidateRow, decision: CurrentCandidateDecision, chapter: ChapterContext): WorkbenchCandidateV2 {
    return {
      id: candidate.id,
      chapterId: candidate.chapterId,
      shotId: candidate.shotId,
      label: candidate.label,
      status: this.candidateStatus(candidate.status),
      favoriteAt: candidate.favoriteAt?.toISOString() ?? null,
      isCurrentFinal: decision.state === "finalized" && decision.candidateId === candidate.id,
      sourceApplicability: this.sourceApplicability(candidate, chapter),
      assetId: candidate.assetId,
      taskId: candidate.taskId,
      index: candidate.index,
      promptDigest: candidate.promptDigest,
      generationPurpose: candidate.generationPurpose as WorkbenchCandidateV2["generationPurpose"],
      generationSpecVersion: candidate.generationSpecVersion,
      generationSpecDigest: candidate.generationSpecDigest,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    };
  }

  private toCurrentDecision(revision: RevisionRow | null): CurrentCandidateDecision {
    if (!revision) {
      return {
        state: "unset",
        revisionId: null,
        revision: null,
        action: null,
        candidateId: null,
        previousRevisionId: null,
        decidedAt: null,
      };
    }
    if (revision.action === "clear") {
      if (!revision.previousRevisionId) throw candidateLockError(500, "CANDIDATE_LOCK_REVISION_CONFLICT");
      return {
        state: "cleared",
        revisionId: revision.id,
        revision: revision.revision,
        action: "clear",
        candidateId: null,
        previousRevisionId: revision.previousRevisionId,
        decidedAt: revision.decidedAt?.toISOString() ?? null,
      };
    }
    if ((revision.action !== "lock" && revision.action !== "replace") || !revision.candidateId) {
      throw candidateLockError(500, "CANDIDATE_LOCK_REVISION_CONFLICT");
    }
    return {
      state: "finalized",
      revisionId: revision.id,
      revision: revision.revision,
      action: revision.action,
      candidateId: revision.candidateId,
      previousRevisionId: revision.previousRevisionId,
      decidedAt: revision.decidedAt?.toISOString() ?? null,
    };
  }

  private toRevisionDto(revision: RevisionRow): CandidateLockRevisionDto {
    return {
      id: revision.id,
      projectId: revision.projectId,
      chapterId: revision.chapterId,
      shotId: revision.shotId,
      revision: revision.revision,
      action: revision.action as CandidateLockRevisionDto["action"],
      candidateId: revision.candidateId,
      previousRevisionId: revision.previousRevisionId,
      origin: revision.origin as CandidateLockRevisionDto["origin"],
      reason: revision.reason,
      decidedAt: revision.decidedAt?.toISOString() ?? null,
      recordedAt: revision.recordedAt.toISOString(),
    };
  }

  private resolveTransition(current: CurrentCandidateDecision, request: PreviewCandidateLockRequest | CommitCandidateLockRequest) {
    try {
      return resolveCandidateLockTransition(current, request);
    } catch {
      throw candidateLockError(409, "CANDIDATE_LOCK_ACTION_INVALID");
    }
  }

  private candidateStatus(value: string): CandidateStatus {
    if (value === "generated" || value === "rejected" || value === "superseded") return value;
    throw candidateLockError(500, "CANDIDATE_STATUS_TRANSITION_INVALID");
  }

  private async readCurrentRevision(scope: VersionScopeV1, shotId: string): Promise<RevisionRow | null> {
    const shot = await this.prismaService.database().shot.findFirst({
      where: { id: shotId, projectId: scope.projectId, chapterId: scope.chapterId },
      include: { currentCandidateLockRevision: true },
    });
    return shot?.currentCandidateLockRevision as RevisionRow | null ?? null;
  }

  private isWriterConflict(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === "P2002" || error.code === "P2028" || error.code === "P2034";
    }
    const message = error instanceof Error ? error.message : String(error);
    return /SQLITE_BUSY|database is locked|candidate_lock_revisions_shot_revision|CANDIDATE_LOCK_REVISION_CONFLICT/i.test(message);
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw candidateLockError(409, "UPSTREAM_WORK_NOT_CONFIRMED", { requiredMode: "db" });
  }
}
