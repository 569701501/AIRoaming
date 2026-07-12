import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Digest, FreshnessReasonCode, ChapterProductionState } from "@airoaming/shared";
import { G2_VERSION_TASK_TYPES, type G2VersionTaskType } from "./versioning-database.types.js";
import { createG2DatabaseError } from "./g2-database-error.mapper.js";
import { PrismaService } from "../../persistence/prisma.service.js";
import { ChapterProductionQueryService } from "./chapter-production-query.service.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

export interface NewWorkGateInput {
  readonly expectedTargetId?: string;
  readonly expectedTargetRowVersion?: number;
  readonly sourceId?: string;
  readonly sourceDigest?: Digest;
  readonly targetShotId?: string;
}

export interface NewWorkGateResult {
  readonly allowed: boolean;
  readonly operation: G2VersionTaskType;
  readonly reasonCodes: readonly FreshnessReasonCode[];
  readonly productionState: ChapterProductionState;
}

export type GateReader = Pick<PrismaClient, "chapter" | "shot">;

function unique(values: readonly FreshnessReasonCode[]): FreshnessReasonCode[] { return [...new Set(values)]; }

@Injectable()
export class NewWorkGateService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ChapterProductionQueryService) private readonly productionQuery: ChapterProductionQueryService,
  ) {}

  async check(scope: VersionScopeV1, operation: G2VersionTaskType, input: NewWorkGateInput = {}, reader: GateReader = this.prismaService.database()): Promise<NewWorkGateResult> {
    if (!G2_VERSION_TASK_TYPES.includes(operation)) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { operation });
    const { row, productionState } = await this.productionQuery.readScoped(scope, reader);
    const reasons: FreshnessReasonCode[] = [];
    this.requireScriptReady(row, productionState, reasons);
    if (operation === "story_parse") this.checkStoryParse(row, productionState, input, reasons);
    if (operation === "shot_generate") this.checkShotGenerate(row, productionState, input, reasons);
    if (operation === "shot_prompt_generate" || operation === "image_generate") await this.checkShotImage(reader, row, productionState, input, reasons);
    const reasonCodes = unique(reasons);
    return { allowed: reasonCodes.length === 0, operation, reasonCodes, productionState };
  }

  async assertAllowed(scope: VersionScopeV1, operation: G2VersionTaskType, input: NewWorkGateInput = {}, reader?: GateReader): Promise<NewWorkGateResult> {
    const result = await this.check(scope, operation, input, reader ?? this.prismaService.database());
    if (!result.allowed) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED", { operation, reasonCodes: result.reasonCodes });
    return result;
  }

  private requireScriptReady(row: Awaited<ReturnType<ChapterProductionQueryService["readScoped"]>>["row"], state: ChapterProductionState, reasons: FreshnessReasonCode[]): void {
    if (row.currentScriptVersionId === null || state.script.freshness !== "current") reasons.push(...state.script.reasonCodes, "SCRIPT_VERSION_MISSING");
    if (state.script.workingState !== "clean") reasons.push(...state.script.reasonCodes, "SCRIPT_WORKING_DIRTY");
    if (state.script.hasAiPending || row.chapterScriptPendingByChapter !== null) reasons.push("SCRIPT_AI_PENDING");
  }

  private checkStoryParse(row: Awaited<ReturnType<ChapterProductionQueryService["readScoped"]>>["row"], state: ChapterProductionState, input: NewWorkGateInput, reasons: FreshnessReasonCode[]): void {
    if (!row.pendingStoryVersionId || row.pendingStoryVersionId !== input.expectedTargetId || !row.pendingStoryVersion) reasons.push("PENDING_VERSION_CHANGED");
    if (input.expectedTargetRowVersion === undefined || row.pendingStoryVersion?.rowVersion !== input.expectedTargetRowVersion) reasons.push("PENDING_VERSION_CHANGED");
    if (input.sourceId !== undefined && input.sourceId !== row.currentScriptVersionId) reasons.push("VERSION_SCOPE_MISMATCH");
    if (input.sourceDigest !== undefined && row.currentScriptVersion?.sourceDigest !== input.sourceDigest) reasons.push("STORY_SOURCE_SCRIPT_CHANGED");
    if (state.script.freshness !== "current") reasons.push("SCRIPT_VERSION_MISSING");
  }

  private checkShotGenerate(row: Awaited<ReturnType<ChapterProductionQueryService["readScoped"]>>["row"], state: ChapterProductionState, input: NewWorkGateInput, reasons: FreshnessReasonCode[]): void {
    if (state.story.freshness !== "current" || !row.currentStoryVersion || row.currentStoryVersion.status !== "confirmed") reasons.push(...state.story.reasonCodes, "STORY_VERSION_MISSING");
    if (row.pendingStoryVersionId !== null) reasons.push("STORY_PENDING_CONFIRMATION");
    if (!row.pendingStoryboardVersionId || row.pendingStoryboardVersionId !== input.expectedTargetId || !row.pendingStoryboardVersion) reasons.push("PENDING_VERSION_CHANGED");
    if (input.expectedTargetRowVersion === undefined || row.pendingStoryboardVersion?.rowVersion !== input.expectedTargetRowVersion) reasons.push("PENDING_VERSION_CHANGED");
    if (row.currentStoryVersionId !== null && row.currentStoryVersion?.sourceScriptVersionId !== row.currentScriptVersionId) reasons.push("STORY_SOURCE_SCRIPT_CHANGED");
    if (input.sourceId !== undefined && input.sourceId !== row.currentStoryVersionId) reasons.push("VERSION_SCOPE_MISMATCH");
    if (input.sourceDigest !== undefined && row.currentStoryVersion?.documentDigest !== input.sourceDigest) reasons.push("STORYBOARD_SOURCE_STORY_CHANGED");
  }

  private async checkShotImage(reader: GateReader, row: Awaited<ReturnType<ChapterProductionQueryService["readScoped"]>>["row"], state: ChapterProductionState, input: NewWorkGateInput, reasons: FreshnessReasonCode[]): Promise<void> {
    if (row.pendingStoryVersionId !== null || row.pendingStoryboardVersionId !== null) reasons.push("PENDING_VERSION_CHANGED");
    if (state.story.freshness !== "current") reasons.push(...state.story.reasonCodes, "STORY_VERSION_MISSING");
    if (state.storyboard.freshness !== "current" || row.currentStoryboardVersionId === null) reasons.push(...state.storyboard.reasonCodes, "STORYBOARD_VERSION_MISSING");
    if (state.preflight.freshness !== "current" || row.currentPreflightRevisionId === null) reasons.push(...state.preflight.reasonCodes, "PREFLIGHT_MISSING");
    const shotId = input.targetShotId;
    if (!shotId) { reasons.push("VERSION_DOCUMENT_INVALID"); return; }
    const shot = await reader.shot.findFirst({ where: { id: shotId, projectId: row.projectId, chapterId: row.id, lifecycleStatus: "active" } });
    if (!shot) { reasons.push("SHOT_ID_RETIRED"); return; }
    const projection = row.currentStoryboardVersionId === null ? null : await reader.shot.findFirst({ where: { id: shot.id, projectId: row.projectId, chapterId: row.id, lifecycleStatus: "active", storyboardShotProjectionsByShot: { some: { storyboardVersionId: row.currentStoryboardVersionId } } } });
    if (!projection) reasons.push("VERSION_SCOPE_MISMATCH");
  }
}
