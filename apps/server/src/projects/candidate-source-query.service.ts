import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  digestCanonicalJson,
  type CandidateChapterSourceState,
  type CandidateLockErrorCode,
  type LayoutBindingSourceEvaluation,
  type LayoutSourceEvaluation,
  type TaskApplicability,
} from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { resolveCandidateLockSet } from "./candidate-lock-set-resolver.js";
import {
  evaluateExportRevisionSource,
  evaluateLayoutBindingSource,
  evaluateLayoutSource,
} from "./layout-source-freshness-resolver.js";
import { projectLayoutWorkingCopyDependencies } from "./layout-working-copy-dependency-projector.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

type Reader = Prisma.TransactionClient | PrismaClient;

interface SourceChapter {
  id: string;
  projectId: string;
  currentStoryboardVersionId: string;
  currentPreflightRevisionId: string | null;
  currentLayoutRevisionId: string | null;
  currentExportRevisionId: string | null;
  currentPreflightRevision: { sourceDigest: string } | null;
}

interface SourceCandidate {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  status: string;
  asset: { status: string };
  task: {
    recordKind: string;
    applicability: string | null;
    generationTaskSourcesByTask: Array<{ sourceType: string; sourceId: string; sourceDigest: string }>;
  };
}

type CandidateSourceGateInput = Pick<
  CandidateChapterSourceState,
  "candidateLockSet" | "layoutWorkingCopy" | "currentLayout" | "currentExport"
>;

function uniqueGate(reasonCodes: CandidateLockErrorCode[]) {
  const unique = [...new Set(reasonCodes)];
  return { allowed: unique.length === 0, reasonCodes: unique };
}

function layoutGateReasons(
  source: LayoutSourceEvaluation,
  currentDigest: string | null,
): CandidateLockErrorCode[] {
  const reasons: CandidateLockErrorCode[] = [];
  if (
    source.reasonCodes.includes("LOCK_SET_DIGEST_MISMATCH")
    || source.sourceLockSetDigest === null
  ) reasons.push("LAYOUT_SOURCE_DIGEST_MISMATCH");
  if (source.sourceResolution === "stale") reasons.push("LAYOUT_SOURCE_STALE");
  if (source.sourceResolution === "unresolved") reasons.push("LAYOUT_SOURCE_UNRESOLVED");
  if (
    source.sourceLockSetDigest === null
    || source.sourceLockSetDigest !== currentDigest
  ) reasons.push("LAYOUT_SOURCE_DIGEST_MISMATCH");
  return [...new Set(reasons)];
}

export function deriveCandidateSourceGates(
  input: CandidateSourceGateInput,
): CandidateChapterSourceState["gates"] {
  const currentDigest = input.candidateLockSet.digest;
  const lockReasons: CandidateLockErrorCode[] = input.candidateLockSet.state !== "complete"
    ? ["CANDIDATE_LOCK_SET_INCOMPLETE"]
    : input.candidateLockSet.sourceApplicability !== "current"
      ? ["CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT"]
      : [];
  const workingReasons = input.layoutWorkingCopy
    ? layoutGateReasons(input.layoutWorkingCopy.source, currentDigest)
    : [];
  const layoutReasons = input.currentLayout
    ? layoutGateReasons(input.currentLayout.source, currentDigest)
    : ["LAYOUT_SOURCE_UNRESOLVED" as CandidateLockErrorCode];
  const exportReasons: CandidateLockErrorCode[] = input.currentExport?.source.reasonCodes.includes("LOCK_SET_DIGEST_MISMATCH")
    ? ["LAYOUT_SOURCE_DIGEST_MISMATCH"]
    : input.currentExport?.source.sourceResolution === "stale"
      ? ["LAYOUT_SOURCE_STALE"]
      : input.currentExport?.source.sourceResolution === "unresolved" || !input.currentExport
        ? ["LAYOUT_SOURCE_UNRESOLVED"]
        : [];
  return {
    buildLayoutWorkingCopy: uniqueGate([...lockReasons, ...workingReasons]),
    createLayoutRevision: uniqueGate([
      ...lockReasons,
      ...(input.layoutWorkingCopy
        ? workingReasons
        : ["LAYOUT_SOURCE_UNRESOLVED" as CandidateLockErrorCode]),
    ]),
    exportLayout: uniqueGate([...lockReasons, ...layoutReasons]),
    exportPackage: uniqueGate([...lockReasons, ...layoutReasons, ...exportReasons]),
  };
}

@Injectable()
export class CandidateSourceQueryService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async get(
    scope: VersionScopeV1,
    reader: Reader = this.prismaService.database(),
  ): Promise<CandidateChapterSourceState> {
    const chapter = await reader.chapter.findFirst({
      where: { id: scope.chapterId, projectId: scope.projectId },
      include: { currentPreflightRevision: true },
    });
    if (!chapter?.currentStoryboardVersionId) throw new Error("CANDIDATE_SOURCE_CHAPTER_NOT_READY");
    const sourceChapter = chapter as SourceChapter;
    const shots = await reader.shot.findMany({
      where: { projectId: scope.projectId, chapterId: scope.chapterId },
      include: {
        currentCandidateLockRevision: {
          include: { candidate: { include: { asset: true, task: { include: { generationTaskSourcesByTask: true } } } } },
        },
      },
    });
    const candidateLockSet = resolveCandidateLockSet({
      projectId: scope.projectId,
      chapterId: scope.chapterId,
      storyboardVersionId: sourceChapter.currentStoryboardVersionId,
      shots: shots.map((shot) => {
        const revision = shot.currentCandidateLockRevision;
        const candidate = revision?.candidate as SourceCandidate | null | undefined;
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
            status: candidate.status as "generated" | "rejected" | "superseded",
            assetReady: candidate.asset.status === "ready",
            sourceApplicability: this.candidateApplicability(candidate, sourceChapter),
          } : null,
        };
      }),
    });
    const currentByShot = new Map(shots.map((shot) => [shot.id, shot.currentCandidateLockRevision]));
    const workingCopy = await reader.layoutWorkingCopy.findUnique({ where: { chapterId: scope.chapterId } });
    const workingCopySource = workingCopy
      ? this.evaluateWorkingCopy(workingCopy, currentByShot, candidateLockSet.digest)
      : null;
    const currentLayout = sourceChapter.currentLayoutRevisionId
      ? await this.evaluateLayoutRevision(reader, sourceChapter.currentLayoutRevisionId, sourceChapter, currentByShot, candidateLockSet.digest, "current")
      : null;
    const currentExportRow = sourceChapter.currentExportRevisionId
      ? await reader.exportRevision.findFirst({ where: { id: sourceChapter.currentExportRevisionId, projectId: scope.projectId, chapterId: scope.chapterId } })
      : null;
    let currentExport: CandidateChapterSourceState["currentExport"] = null;
    if (currentExportRow) {
      const exportLayout = currentExportRow.layoutRevisionId === currentLayout?.id
        ? currentLayout.source
        : currentExportRow.layoutRevisionId
          ? (await this.evaluateLayoutRevision(reader, currentExportRow.layoutRevisionId, sourceChapter, currentByShot, candidateLockSet.digest, "historical"))?.source
          : null;
      currentExport = {
        id: currentExportRow.id,
        source: exportLayout && currentExportRow.layoutRevisionId && currentExportRow.sourceLockSetDigest
          ? evaluateExportRevisionSource({
              revisionPosition: "current",
              completionApplicability: this.normalizeTaskApplicability(currentExportRow.completionApplicability),
              layoutRevisionId: currentExportRow.layoutRevisionId,
              sourceLockSetDigest: currentExportRow.sourceLockSetDigest,
              currentLockSetDigest: candidateLockSet.digest,
              layout: exportLayout,
            })
          : {
              revisionPosition: "current",
              completionApplicability: this.normalizeTaskApplicability(currentExportRow.completionApplicability),
              sourceResolution: "unresolved",
              artifactFreshness: null,
              layoutRevisionId: currentExportRow.layoutRevisionId ?? "",
              sourceLockSetDigest: currentExportRow.sourceLockSetDigest ?? "",
              currentLockSetDigest: candidateLockSet.digest,
              reasonCodes: ["LAYOUT_SOURCE_UNRESOLVED"],
            },
      };
    }

    const gates = deriveCandidateSourceGates({
      candidateLockSet,
      layoutWorkingCopy: workingCopySource,
      currentLayout,
      currentExport,
    });
    return {
      schemaVersion: 1,
      projectId: scope.projectId,
      chapterId: scope.chapterId,
      candidateLockSet,
      layoutWorkingCopy: workingCopySource,
      currentLayout,
      currentExport,
      gates,
    };
  }

  /**
   * Completion-time fence for G4/G5 tasks. Sealed immutable source rows prove
   * what the task started from; this comparison only decides whether that
   * source is still the chapter's current formal chain.
   */
  async taskApplicability(
    scope: VersionScopeV1,
    taskId: string,
    reader: Reader = this.prismaService.database(),
  ): Promise<TaskApplicability> {
    const task = await reader.generationTask.findFirst({
      where: {
        id: taskId,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
      },
      include: { generationTaskSourcesByTask: true },
    });
    if (!task || task.recordKind !== "runtime" || !task.sourceSetSealedAt) {
      return "legacy_unresolved";
    }
    const state = await this.get(scope, reader);
    const currentLockRevisionIds = new Set(
      state.candidateLockSet.entries.flatMap((entry) => entry.candidateLockRevisionId
        ? [entry.candidateLockRevisionId]
        : []),
    );
    let mutableSourceCount = 0;
    for (const source of task.generationTaskSourcesByTask) {
      if (source.sourceType === "candidate_lock_revision") {
        mutableSourceCount += 1;
        if (!currentLockRevisionIds.has(source.sourceId)) return "historical";
      } else if (source.sourceType === "lock_set") {
        mutableSourceCount += 1;
        if (
          source.sourceId !== scope.chapterId
          || source.sourceDigest !== state.candidateLockSet.digest
        ) return "historical";
      } else if (source.sourceType === "layout_revision") {
        mutableSourceCount += 1;
        if (
          source.sourceId !== state.currentLayout?.id
          || state.currentLayout.source.sourceResolution !== "current"
        ) return "historical";
      } else if (source.sourceType === "export_revision") {
        mutableSourceCount += 1;
        if (
          source.sourceId !== state.currentExport?.id
          || state.currentExport.source.sourceResolution !== "current"
        ) return "historical";
      }
    }
    if (mutableSourceCount === 0) return "legacy_unresolved";
    return state.candidateLockSet.state === "complete"
      && state.candidateLockSet.sourceApplicability === "current"
      ? "current"
      : "historical";
  }

  private evaluateWorkingCopy(
    workingCopy: {
      id: string;
      documentKind: string;
      documentDigest: string;
      documentJson: unknown;
      sourceLockSetDigest: string | null;
    },
    currentByShot: Map<string, { id: string; action: string } | null>,
    currentLockSetDigest: string | null,
  ): NonNullable<CandidateChapterSourceState["layoutWorkingCopy"]> {
    try {
      const currentRevisionByShot = Object.fromEntries([...currentByShot].flatMap(([shotId, revision]) => revision
        ? [[shotId, { id: revision.id, action: revision.action as "lock" | "replace" | "clear" }]]
        : []));
      const projected = projectLayoutWorkingCopyDependencies({
        workingCopyId: workingCopy.id,
        documentKind: workingCopy.documentKind as "legacy_chapter_layout_v1" | "layout_document_v1",
        documentDigest: workingCopy.documentDigest,
        documentJson: workingCopy.documentJson,
        currentRevisionByShot,
      });
      const bindings: LayoutBindingSourceEvaluation[] = projected.map((binding) => ({
        layoutRevisionId: null,
        workingCopyId: workingCopy.id,
        elementId: binding.elementId,
        shotId: binding.shotId,
        candidateLockRevisionId: binding.sourceCandidateLockRevisionId,
        currentCandidateLockRevisionId: binding.shotId ? currentByShot.get(binding.shotId)?.id ?? null : null,
        resolution: binding.resolution,
        reasonCodes: binding.resolution === "current" ? [] : binding.resolution === "stale" ? ["SOURCE_LOCK_CHANGED"] : ["SOURCE_BINDING_MISSING"],
      }));
      const source = evaluateLayoutSource({
        revisionPosition: "working_copy",
        bindings: bindings.length > 0 ? bindings : [this.missingBinding(null, workingCopy.id)],
        sourceLockSetDigest: workingCopy.sourceLockSetDigest,
        bindingLockSetDigest: this.bindingDigest(projected.map((binding) => ({ shotId: binding.shotId, revisionId: binding.sourceCandidateLockRevisionId }))),
        currentLockSetDigest,
      });
      return { id: workingCopy.id, source };
    } catch {
      return {
        id: workingCopy.id,
        source: evaluateLayoutSource({
          revisionPosition: "working_copy",
          bindings: [this.missingBinding(null, workingCopy.id)],
          sourceLockSetDigest: workingCopy.sourceLockSetDigest,
          bindingLockSetDigest: null,
          currentLockSetDigest,
        }),
      };
    }
  }

  private async evaluateLayoutRevision(
    reader: Reader,
    revisionId: string,
    chapter: SourceChapter,
    currentByShot: Map<string, { id: string; action: string } | null>,
    currentLockSetDigest: string | null,
    position: "current" | "historical",
  ): Promise<NonNullable<CandidateChapterSourceState["currentLayout"]> | null> {
    const revision = await reader.layoutRevision.findFirst({
      where: { id: revisionId, projectId: chapter.projectId, chapterId: chapter.id },
      include: {
        layoutSourceBindingsByLayoutRevision: {
          include: { candidateLockRevision: true, candidate: { include: { asset: true } } },
        },
      },
    });
    if (!revision) return null;
    const bindings = revision.layoutSourceBindingsByLayoutRevision.map((binding) => {
      const current = binding.shotId ? currentByShot.get(binding.shotId) ?? null : null;
      const sourceRevision = binding.candidateLockRevision;
      const candidate = binding.candidate;
      return evaluateLayoutBindingSource({
        layoutRevisionId: revision.id,
        workingCopyId: null,
        elementId: binding.elementId,
        binding: {
          shotId: binding.shotId,
          candidateLockRevisionId: binding.candidateLockRevisionId,
          sourceRevisionExists: sourceRevision !== null,
          scopeMatches: sourceRevision !== null
            && sourceRevision.projectId === chapter.projectId
            && sourceRevision.chapterId === chapter.id
            && sourceRevision.shotId === binding.shotId,
          candidateExists: candidate !== null && sourceRevision?.candidateId === candidate.id,
          assetReady: candidate?.asset.status === "ready",
        },
        currentCandidateLockRevisionId: current?.id ?? null,
        currentAction: (current?.action as "lock" | "replace" | "clear" | undefined) ?? null,
      });
    });
    const source = evaluateLayoutSource({
      revisionPosition: position,
      bindings: bindings.length > 0 ? bindings : [this.missingBinding(revision.id, null)],
      sourceLockSetDigest: revision.sourceLockSetDigest,
      bindingLockSetDigest: this.bindingDigest(revision.layoutSourceBindingsByLayoutRevision.map((binding) => ({
        shotId: binding.shotId,
        revisionId: binding.candidateLockRevisionId,
      }))),
      currentLockSetDigest,
    });
    return { id: revision.id, source };
  }

  private candidateApplicability(candidate: SourceCandidate, chapter: SourceChapter): TaskApplicability {
    if (candidate.task.recordKind !== "runtime") return "legacy_unresolved";
    const source = candidate.task.generationTaskSourcesByTask.find((item) => item.sourceType === "preflight_revision");
    if (!source) return "legacy_unresolved";
    return candidate.task.applicability === "current"
      && chapter.currentPreflightRevisionId !== null
      && chapter.currentPreflightRevision !== null
      && source.sourceId === chapter.currentPreflightRevisionId
      && source.sourceDigest === chapter.currentPreflightRevision.sourceDigest
      ? "current"
      : "historical";
  }

  private normalizeTaskApplicability(value: string | null): TaskApplicability {
    return value === "current" || value === "historical" || value === "legacy_unresolved"
      ? value
      : "legacy_unresolved";
  }

  private bindingDigest(bindings: Array<{ shotId: string | null; revisionId: string | null }>): string | null {
    if (bindings.length === 0 || bindings.some((binding) => binding.shotId === null || binding.revisionId === null)) return null;
    const normalized = bindings.map((binding) => ({ shotId: binding.shotId!, candidateLockRevisionId: binding.revisionId! }))
      .sort((left, right) => this.compare(left.shotId, right.shotId));
    if (new Set(normalized.map((binding) => binding.shotId)).size !== normalized.length) return null;
    return digestCanonicalJson(normalized);
  }

  private missingBinding(layoutRevisionId: string | null, workingCopyId: string | null): LayoutBindingSourceEvaluation {
    return {
      layoutRevisionId,
      workingCopyId,
      elementId: "__document__",
      shotId: null,
      candidateLockRevisionId: null,
      currentCandidateLockRevisionId: null,
      resolution: "unresolved",
      reasonCodes: ["SOURCE_BINDING_MISSING"],
    };
  }

  private compare(left: string, right: string): number {
    const a = Array.from(left, (value) => value.codePointAt(0)!);
    const b = Array.from(right, (value) => value.codePointAt(0)!);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      if (a[index] !== b[index]) return a[index]! - b[index]!;
    }
    return a.length - b.length;
  }
}
