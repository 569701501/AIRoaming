import { Inject, Injectable } from "@nestjs/common";
import type {
  ArtifactFreshness,
  ChapterProductionState,
  FreshnessReasonCode,
  ProjectWorkflow,
  ProjectWorkflowStep,
  ProjectWorkflowStepKey,
  GetChapterProductionStateResponse,
} from "@airoaming/shared";
import { PROJECT_WORKFLOW_SCHEMA_VERSION, PROJECT_WORKFLOW_STEPS } from "@airoaming/shared";
import { PrismaService } from "../../persistence/prisma.service.js";
import { createG2DatabaseError } from "./g2-database-error.mapper.js";
import { ChapterVersionQueryRepository, type ChapterVersionQueryRow } from "./chapter-version-query.repository.js";
import { ScriptVersionRepository } from "./script-version.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";
import { CandidateSourceQueryService } from "../candidate-source-query.service.js";
import { SourceSnapshotBuilderService, type SourceSnapshotBuilderReader } from "./source-snapshot-builder.service.js";

type VersionNode = ChapterProductionState["script"] | ChapterProductionState["story"] | ChapterProductionState["storyboard"] | ChapterProductionState["preflight"];

const NODE_BY_STEP: Partial<Record<ProjectWorkflowStepKey, keyof Pick<ChapterProductionState, "script" | "story" | "storyboard" | "preflight">>> = {
  project_story: "script",
  story_structure: "story",
  storyboard: "storyboard",
  image_preflight: "preflight",
};

const STEP_ORDER = new Map(PROJECT_WORKFLOW_STEPS.map((step, index) => [step.key, index]));
const MILESTONE_ORDER = new Map([
  ["draft", 0], ["script_done", 1], ["structured", 2], ["storyboard_done", 3], ["images_done", 4], ["layout_done", 5], ["exported", 6],
]);

@Injectable()
export class ChapterProductionQueryService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ChapterVersionQueryRepository) private readonly chapterQuery: ChapterVersionQueryRepository,
    @Inject(ScriptVersionRepository) private readonly scriptRepository: ScriptVersionRepository,
    @Inject(CandidateSourceQueryService) private readonly candidateSources: CandidateSourceQueryService,
    @Inject(SourceSnapshotBuilderService) private readonly sourceSnapshotBuilder: SourceSnapshotBuilderService,
  ) {}

  async get(scope: VersionScopeV1): Promise<GetChapterProductionStateResponse> {
    this.assertDatabaseMode();
    const row = await this.chapterQuery.findByScope(scope);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    const baseProductionState = await this.resolveProductionState(scope, row, this.prismaService.database());
    const productionState = row.currentStoryboardVersionId
      ? { ...baseProductionState, candidateSources: await this.candidateSources.get(scope) }
      : baseProductionState;
    return { productionState, workflow: this.buildWorkflow(row, productionState), chapterRowVersion: row.rowVersion };
  }

  /** Shared read path for NewWorkGate; caller supplies a transaction reader when needed. */
  async readScoped(scope: VersionScopeV1, reader: SourceSnapshotBuilderReader = this.prismaService.database()): Promise<{ row: ChapterVersionQueryRow; productionState: ChapterProductionState }> {
    this.assertDatabaseMode();
    const row = await this.chapterQuery.findByScope(scope, reader);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    return { row, productionState: await this.resolveProductionState(scope, row, reader) };
  }

  private async resolveProductionState(
    scope: VersionScopeV1,
    row: ChapterVersionQueryRow,
    reader: SourceSnapshotBuilderReader,
  ): Promise<ChapterProductionState> {
    const storedState = this.scriptRepository.toProductionState(row);
    if (!row.currentPreflightRevisionId || storedState.storyboard.freshness !== "current") return storedState;
    const live = await this.sourceSnapshotBuilder.build(scope, "", reader);
    return this.scriptRepository.toProductionState(row, live.sourceSnapshot);
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED", { actualMode: this.prismaService.mode, requiredMode: "db" });
  }

  private buildWorkflow(row: ChapterVersionQueryRow, state: ChapterProductionState): ProjectWorkflow {
    const currentStepKey = this.resolveCurrentStep(state);
    const currentIndex = STEP_ORDER.get(currentStepKey) ?? 0;
    return {
      schemaVersion: PROJECT_WORKFLOW_SCHEMA_VERSION,
      projectId: row.projectId,
      currentChapterId: row.id,
      currentStepKey,
      steps: PROJECT_WORKFLOW_STEPS.map((definition) => this.toStep(definition, row, state, currentIndex)),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private resolveCurrentStep(state: ChapterProductionState): ProjectWorkflowStepKey {
    if (state.preflight.freshness === "current" && state.storyboard.freshness === "current") {
      const milestone = MILESTONE_ORDER.get(state.milestoneStatus) ?? 0;
      if (milestone < 4) return "image_candidates";
      const sources = state.candidateSources;
      if (!sources) return milestone >= 5 ? "asset_package" : "layout_export";
      if (
        sources.candidateLockSet.state !== "complete"
        || sources.candidateLockSet.sourceApplicability !== "current"
      ) return "image_candidates";
      if (
        !sources.currentLayout
        || sources.currentLayout.source.sourceResolution !== "current"
      ) return "layout_export";
      return "asset_package";
    }
    return state.earliestAttentionStep;
  }

  private toStep(
    definition: (typeof PROJECT_WORKFLOW_STEPS)[number],
    row: ChapterVersionQueryRow,
    state: ChapterProductionState,
    currentIndex: number,
  ): ProjectWorkflowStep {
    const stepIndex = STEP_ORDER.get(definition.key) ?? 0;
    const nodeKey = NODE_BY_STEP[definition.key];
    const node = nodeKey ? state[nodeKey] as VersionNode : null;
    const milestoneReached = this.milestoneReached(definition.key, state.milestoneStatus);
    const status = this.resolveStatus(definition.key, stepIndex, currentIndex, node, milestoneReached, state);
    const reasonCodes = node?.reasonCodes ?? [];
    const sourceProjection = this.sourceProjection(definition.key, state);
    return {
      key: definition.key,
      label: definition.label,
      status,
      scope: definition.scope,
      summary: this.summary(definition.key, status),
      evidence: `db://projects/${row.projectId}/chapters/${row.id}/${definition.key}`,
      completionCriteria: [...definition.completionCriteria],
      milestoneReached,
      currentArtifactId: node?.currentVersionId ?? sourceProjection.currentArtifactId,
      freshness: node?.freshness ?? sourceProjection.freshness ?? (milestoneReached ? "current" : null),
      attention: this.attention(status, reasonCodes),
      canStartTask: this.canStartTask(definition.key, state),
      historyAvailable: (node?.historyCount ?? 0) > 0,
      reasonCodes: [...reasonCodes],
    };
  }

  private resolveStatus(
    key: ProjectWorkflowStepKey,
    index: number,
    currentIndex: number,
    node: VersionNode | null,
    milestoneReached: boolean,
    state: ChapterProductionState,
  ): ProjectWorkflowStep["status"] {
    const sourceStatus = this.sourceStatus(key, state);
    if (sourceStatus) return sourceStatus;
    if (node?.pendingVersionId !== null && node?.pendingVersionId !== undefined) return "needs_confirmation";
    if (node && node.freshness === "stale") return "needs_update";
    if (node && node.freshness === null && index === currentIndex) return key === "project_story" ? "needs_confirmation" : "active";
    if (milestoneReached || (node?.freshness === "current" && index < currentIndex)) return "done";
    if (index === currentIndex) return "active";
    if (index < currentIndex) return "blocked";
    return "waiting";
  }

  private milestoneReached(key: ProjectWorkflowStepKey, milestone: ChapterProductionState["milestoneStatus"]): boolean {
    const rank = MILESTONE_ORDER.get(milestone) ?? 0;
    const required = key === "project_story" ? 1 : key === "story_structure" ? 2 : key === "storyboard" ? 3 : key === "image_preflight" ? 4 : key === "image_candidates" ? 5 : key === "layout_export" ? 6 : 7;
    return rank >= required;
  }

  private canStartTask(key: ProjectWorkflowStepKey, state: ChapterProductionState): boolean {
    if (key === "story_structure") return state.script.freshness === "current" && state.script.workingState === "clean" && !state.script.hasScriptPending;
    if (key === "storyboard") return state.story.freshness === "current" && state.story.pendingVersionId === null;
    if (key === "image_preflight") return state.storyboard.freshness === "current" && state.storyboard.pendingVersionId === null;
    if (key === "image_candidates") return state.preflight.freshness === "current";
    if (key === "layout_export") {
      const gates = state.candidateSources?.gates;
      return Boolean(
        gates?.buildLayoutWorkingCopy.allowed
        || gates?.createLayoutRevision.allowed
        || gates?.exportLayout.allowed,
      );
    }
    if (key === "asset_package") return state.candidateSources?.gates.exportPackage.allowed ?? false;
    return false;
  }

  private sourceStatus(
    key: ProjectWorkflowStepKey,
    state: ChapterProductionState,
  ): ProjectWorkflowStep["status"] | null {
    const sources = state.candidateSources;
    if (!sources) return null;
    const milestone = MILESTONE_ORDER.get(state.milestoneStatus) ?? 0;
    if (key === "image_candidates" && milestone >= 4) {
      return sources.candidateLockSet.state === "complete"
        && sources.candidateLockSet.sourceApplicability === "current"
        ? "done"
        : "needs_update";
    }
    if (key === "layout_export" && milestone >= 4) {
      if (!sources.currentLayout) return milestone >= 5 ? "blocked" : null;
      if (sources.currentLayout.source.sourceResolution === "stale") return "needs_update";
      if (sources.currentLayout.source.sourceResolution === "unresolved") return "blocked";
      if (milestone >= 5) return "done";
    }
    if (key === "asset_package" && milestone >= 5) {
      if (!sources.currentExport) return milestone >= 6 ? "blocked" : null;
      if (sources.currentExport.source.sourceResolution === "stale") return "needs_update";
      if (sources.currentExport.source.sourceResolution === "unresolved") return "blocked";
      if (milestone >= 6) return "done";
    }
    return null;
  }

  private sourceProjection(
    key: ProjectWorkflowStepKey,
    state: ChapterProductionState,
  ): { currentArtifactId: string | null; freshness: ArtifactFreshness | null } {
    const sources = state.candidateSources;
    if (!sources) return { currentArtifactId: null, freshness: null };
    if (key === "image_candidates") {
      return {
        currentArtifactId: null,
        freshness: sources.candidateLockSet.state === "complete"
          && sources.candidateLockSet.sourceApplicability === "current"
          ? "current"
          : "stale",
      };
    }
    if (key === "layout_export") {
      return {
        currentArtifactId: sources.currentLayout?.id ?? null,
        freshness: sources.currentLayout?.source.artifactFreshness ?? null,
      };
    }
    if (key === "asset_package") {
      return {
        currentArtifactId: sources.currentExport?.id ?? null,
        freshness: sources.currentExport?.source.artifactFreshness ?? null,
      };
    }
    return { currentArtifactId: null, freshness: null };
  }

  private attention(status: ProjectWorkflowStep["status"], reasons: readonly FreshnessReasonCode[]): ProjectWorkflowStep["attention"] {
    if (status === "needs_confirmation") return "needs_confirmation";
    if (status === "needs_update") return "source_updated";
    if (status === "blocked" || reasons.includes("STORY_SOURCE_UNRESOLVED") || reasons.includes("STORYBOARD_SOURCE_UNRESOLVED") || reasons.includes("PREFLIGHT_SOURCE_UNRESOLVED")) return "blocked";
    return null;
  }

  private summary(key: ProjectWorkflowStepKey, status: ProjectWorkflowStep["status"]): string {
    if (status === "needs_confirmation") return `${key} 有待确认的 Working Copy。`;
    if (status === "needs_update") return `${key} 的正式来源已变化，需要基于新来源更新。`;
    if (status === "blocked") return `${key} 被前置来源或完整性条件阻断。`;
    if (status === "done") return `${key} 已完成并有正式来源。`;
    if (status === "waiting") return `${key} 等待前置步骤完成。`;
    return `${key} 当前可继续操作。`;
  }
}
