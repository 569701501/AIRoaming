import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import {
  buildLayoutSourceReplacementPreviewV1,
  buildLayoutSourceReplacementPreviewV2,
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV1OrV2,
  LayoutDocumentValidationError,
  LayoutRevisionContractError,
  LayoutSourceReplacementContractError,
  parseCommitLayoutSourceReplacementRequestV1OrV2,
  parseCreateLayoutRevisionRequestV1OrV2,
  parsePreviewLayoutSourceReplacementRequestV1OrV2,
  parseRestoreLayoutRevisionRequestV1OrV2,
  parseRunLayoutPreflightRequestV1OrV2,
  projectLayoutDocumentV2ToV1,
  projectLayoutSourceBindings,
  runLayoutPreflightV1,
  runLayoutPreflightV2,
  upgradeLayoutWorkingCopyV1ToV2,
  type CommitLayoutSourceReplacementResponseV1,
  type CommitLayoutSourceReplacementResponseV2,
  type CreateLayoutRevisionResponseV1,
  type CreateLayoutRevisionResponseV2,
  type LayoutDigest,
  type LayoutDocumentV1,
  type LayoutDocumentV1OrV2,
  type LayoutDocumentV2,
  type LayoutPreflightImageAssetV1,
  type LayoutPreflightReportV1,
  type LayoutPreflightReportV2,
  type LayoutPublicationProfileV1,
  type LayoutRevisionDetailV1,
  type LayoutRevisionDetailV2,
  type LayoutRevisionHistoryResponseV1,
  type LayoutRevisionHistoryResponseV2,
  type LayoutRevisionSummaryV1,
  type LayoutRevisionSummaryV1OrV2,
  type LayoutRevisionSummaryV2,
  type LayoutSourceCatalogItemV1,
  type LayoutSourceReplacementPreviewV1,
  type LayoutSourceReplacementPreviewV2,
  type RestoreLayoutRevisionResponseV1,
  type RestoreLayoutRevisionResponseV2,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";
import { LayoutCompositionSourceProjector } from "./layout-composition-source-projector.service.js";
import { inspectLayoutImageNormalizationV1 } from "./layout-image-normalization.util.js";
import { LayoutFontService } from "./layout-font.service.js";
import { LayoutWorkingCopyService } from "./layout-working-copy.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

type Reader = Prisma.TransactionClient | PrismaClient;

interface CurrentLayoutSources {
  activeShotIds: string[];
  items: LayoutSourceCatalogItemV1[];
  current: boolean;
  digest: LayoutDigest | null;
}

interface LayoutDocumentState {
  document: LayoutDocumentV1OrV2;
  visibleDocument: LayoutDocumentV1;
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
}

class LayoutVersioningServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "LayoutVersioningServiceError";
  }
}

function serviceError(code: string, status: number, details?: unknown): never {
  throw new LayoutVersioningServiceError(code, status, details);
}

function asDigest(value: string | null, code: string): LayoutDigest {
  if (!value || !/^sha256:[0-9a-f]{64}$/.test(value)) serviceError(code, 409);
  return value as LayoutDigest;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function assertLayoutRestoreSchemaPolicy(input: {
  requestSchemaVersion: 1 | 2;
  workingCopySchemaVersion: 1 | 2;
  targetRevisionSchemaVersion: 1 | 2;
}): void {
  if (
    input.requestSchemaVersion !== input.workingCopySchemaVersion
    || (
      input.requestSchemaVersion === 1
      && input.targetRevisionSchemaVersion !== 1
    )
  ) {
    serviceError("LAYOUT_DOCUMENT_SCHEMA_VERSION_MISMATCH", 409, {
      requestSchemaVersion: input.requestSchemaVersion,
      workingCopySchemaVersion: input.workingCopySchemaVersion,
      targetRevisionSchemaVersion: input.targetRevisionSchemaVersion,
    });
  }
}

@Injectable()
export class LayoutVersioningService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(CandidateSourceQueryService) private readonly candidateSources: CandidateSourceQueryService,
    @Inject(LayoutFontService) private readonly layoutFonts: LayoutFontService,
    @Inject(LayoutWorkingCopyService) private readonly workingCopies: LayoutWorkingCopyService,
    @Inject(LayoutCompositionSourceProjector) private readonly compositionSources: LayoutCompositionSourceProjector,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
  ) {}

  async previewSourceReplacements(
    scope: VersionScopeV1,
    input: unknown,
  ): Promise<LayoutSourceReplacementPreviewV1 | LayoutSourceReplacementPreviewV2> {
    return this.execute(async () => {
      const request = parsePreviewLayoutSourceReplacementRequestV1OrV2(input);
      return this.prismaService.runReadTransaction(async (tx) => {
        const workingCopy = await this.loadWorkingCopy(scope, tx);
        const state = this.parseWorkingCopyState(scope, workingCopy);
        this.assertRequestMatchesDocumentSchema(request.schemaVersion, state.document.schemaVersion);
        this.assertWorkingCopyRequestExpectation(workingCopy, state, request);
        const current = await this.loadCurrentSources(scope, tx, true);
        const sourceDimensions = await this.loadSourceDimensions(state.visibleDocument, tx);
        const built = request.schemaVersion === 1
          ? buildLayoutSourceReplacementPreviewV1({
              document: state.document as LayoutDocumentV1,
              request,
              currentSources: current.items,
              sourceDimensions,
            })
          : buildLayoutSourceReplacementPreviewV2({
              document: state.document as LayoutDocumentV2,
              request,
              currentSources: current.items,
              sourceDimensions,
            });
        const { resultDocument: _resultDocument, ...preview } = built;
        return preview;
      });
    });
  }

  async commitSourceReplacements(
    scope: VersionScopeV1,
    input: unknown,
  ): Promise<
    CommitLayoutSourceReplacementResponseV1
    | CommitLayoutSourceReplacementResponseV2
  > {
    return this.execute(async () => {
      const request = parseCommitLayoutSourceReplacementRequestV1OrV2(input);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const workingCopy = await this.loadWorkingCopy(scope, tx);
        const state = this.parseWorkingCopyState(scope, workingCopy);
        this.assertRequestMatchesDocumentSchema(request.schemaVersion, state.document.schemaVersion);
        const replayed = workingCopy.rowVersion
          === request.expectedWorkingCopyRowVersion + 1
          && workingCopy.documentDigest === (
            request.schemaVersion === 1
              ? request.resultDocumentDigest
              : request.resultRevisionDocumentDigest
          )
          && (
            request.schemaVersion === 1
            || state.visibleDocumentDigest === request.resultVisibleDocumentDigest
          );
        if (replayed) {
          const common = {
            result: "replayed" as const,
            replacementDigest: request.replacementDigest,
            workingCopy: await this.workingCopies.responseForReader(
              scope,
              workingCopy,
              tx,
            ),
          };
          return request.schemaVersion === 1
            ? {
                schemaVersion: 1,
                ...common,
                resultDocumentDigest: request.resultDocumentDigest,
              }
            : {
                schemaVersion: 2,
                ...common,
                resultRevisionDocumentDigest:
                  request.resultRevisionDocumentDigest,
                resultVisibleDocumentDigest: request.resultVisibleDocumentDigest,
              };
        }
        this.assertWorkingCopyRequestExpectation(workingCopy, state, request);
        const current = await this.loadCurrentSources(scope, tx, true);
        const sourceDimensions = await this.loadSourceDimensions(state.visibleDocument, tx);
        const built = request.schemaVersion === 1
          ? buildLayoutSourceReplacementPreviewV1({
              document: state.document as LayoutDocumentV1,
              request,
              currentSources: current.items,
              sourceDimensions,
            })
          : buildLayoutSourceReplacementPreviewV2({
              document: state.document as LayoutDocumentV2,
              request,
              currentSources: current.items,
              sourceDimensions,
            });
        const previewMatches = request.schemaVersion === 1
          ? built.schemaVersion === 1
            && built.replacementDigest === request.replacementDigest
            && built.resultDocumentDigest === request.resultDocumentDigest
          : built.schemaVersion === 2
            && built.replacementDigest === request.replacementDigest
            && built.resultRevisionDocumentDigest
              === request.resultRevisionDocumentDigest
            && built.resultVisibleDocumentDigest
              === request.resultVisibleDocumentDigest;
        if (!previewMatches) {
          serviceError("LAYOUT_SOURCE_REPLACEMENT_PREVIEW_MISMATCH", 409, {
            replacementDigest: built.replacementDigest,
            resultRevisionDocumentDigest: built.schemaVersion === 1
              ? built.resultDocumentDigest
              : built.resultRevisionDocumentDigest,
            resultVisibleDocumentDigest: built.schemaVersion === 1
              ? built.resultDocumentDigest
              : built.resultVisibleDocumentDigest,
          });
        }
        const resultVisibleDocument = built.schemaVersion === 1
          ? built.resultDocument
          : projectLayoutDocumentV2ToV1(built.resultDocument, scope);
        const resultRevisionDocumentDigest = built.schemaVersion === 1
          ? built.resultDocumentDigest
          : built.resultRevisionDocumentDigest;
        const sourceLockSetDigest = digestLayoutSourceLockSet(
          resultVisibleDocument,
          current.activeShotIds,
        );
        const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
        const update = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: workingCopy.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: request.expectedWorkingCopyRowVersion,
            documentDigest: workingCopy.documentDigest,
          },
          data: {
            documentJson: built.resultDocument as unknown as Prisma.InputJsonValue,
            documentDigest: resultRevisionDocumentDigest,
            sourceLockSetDigest,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (update.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        const updated = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        const common = {
          result: "updated" as const,
          replacementDigest: request.replacementDigest,
          workingCopy: await this.workingCopies.responseForReader(scope, updated, tx),
        };
        return request.schemaVersion === 1
          ? {
              schemaVersion: 1,
              ...common,
              resultDocumentDigest: request.resultDocumentDigest,
            }
          : {
              schemaVersion: 2,
              ...common,
              resultRevisionDocumentDigest:
                request.resultRevisionDocumentDigest,
              resultVisibleDocumentDigest: request.resultVisibleDocumentDigest,
            };
      });
    });
  }

  async preflight(
    scope: VersionScopeV1,
    input: unknown,
  ): Promise<LayoutPreflightReportV1 | LayoutPreflightReportV2> {
    return this.execute(() => this.prismaService.runReadTransaction(
      (tx) => this.preflightForReader(scope, input, tx),
    ));
  }

  /** Re-runs preflight inside the caller's publication-creation transaction. */
  async preflightForReader(
    scope: VersionScopeV1,
    input: unknown,
    reader: Reader,
  ): Promise<LayoutPreflightReportV1 | LayoutPreflightReportV2> {
    const request = parseRunLayoutPreflightRequestV1OrV2(input);
    const current = await this.loadCurrentSources(scope, reader, false);
    const fontCatalog = await this.layoutFonts.listForReader(scope, reader, false);
    let state: ReturnType<LayoutVersioningService["parseDocumentState"]>;
    let targetId: string;
    let targetRowVersion: number | null;
    let workingCopyRevisionDocumentDigest: LayoutDigest | null = null;
    if (request.target.kind === "working_copy") {
      const workingCopy = await this.loadWorkingCopy(scope, reader);
      state = this.parseWorkingCopyState(scope, workingCopy);
      this.assertRequestMatchesDocumentSchema(request.schemaVersion, state.document.schemaVersion);
      this.assertPreflightWorkingCopyExpectation(workingCopy, state, request.target);
      targetId = workingCopy.id;
      targetRowVersion = workingCopy.rowVersion;
    } else {
      const revision = await this.loadRevision(scope, request.target.layoutRevisionId, reader);
      state = this.parseRevisionState(scope, revision);
      this.assertRequestMatchesDocumentSchema(request.schemaVersion, state.document.schemaVersion);
      targetId = revision.id;
      targetRowVersion = null;
      const workingCopy = await reader.layoutWorkingCopy.findFirst({
        where: { projectId: scope.projectId, chapterId: scope.chapterId },
      });
      workingCopyRevisionDocumentDigest = workingCopy
        ? this.parseWorkingCopyState(scope, workingCopy).revisionDocumentDigest
        : null;
    }
    const imageAssets = await this.loadImageAssets(
      state.visibleDocument,
      current.items,
      reader,
    );
    if (request.schemaVersion === 1) {
      return runLayoutPreflightV1({
        document: state.document as LayoutDocumentV1,
        target: {
          kind: request.target.kind,
          id: targetId,
          documentDigest: state.revisionDocumentDigest,
          rowVersion: targetRowVersion,
        },
        currentSources: current.current ? current.items : [],
        activeShotIds: current.activeShotIds,
        imageAssets,
        fontCatalog,
        profile: request.profile,
        workingCopyDocumentDigest: workingCopyRevisionDocumentDigest,
      });
    }
    const document = state.document as LayoutDocumentV2;
    const [dialogue, evidence] = await Promise.all([
      this.compositionSources.currentDialoguePreflightSource(scope, reader),
      document.automation.composition
        ? this.compositionSources.compositionPreflightEvidence(
            scope,
            document.automation.composition.compositionDigest,
            reader,
          )
        : Promise.resolve(null),
    ]);
    const currentComposition = evidence
      ? {
          ...evidence,
          storyboardVersionId: dialogue.storyboardVersionId,
          storyboardDigest: dialogue.storyboardDigest,
        }
      : null;
    return runLayoutPreflightV2({
      document,
      target: {
        kind: request.target.kind,
        id: targetId,
        revisionDocumentDigest: state.revisionDocumentDigest,
        visibleDocumentDigest: state.visibleDocumentDigest,
        rowVersion: targetRowVersion,
      },
      currentSources: current.current ? current.items : [],
      activeShotIds: current.activeShotIds,
      imageAssets,
      fontCatalog,
      profile: request.profile,
      dialogueLedger: dialogue.dialogueLedger,
      currentComposition,
      workingCopyRevisionDocumentDigest,
    });
  }

  async createRevision(
    scope: VersionScopeV1,
    input: unknown,
  ): Promise<CreateLayoutRevisionResponseV1 | CreateLayoutRevisionResponseV2> {
    return this.execute(async () => {
      const request = parseCreateLayoutRevisionRequestV1OrV2(input);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const [chapter, workingCopy] = await Promise.all([
          tx.chapter.findFirst({
            where: { id: scope.chapterId, projectId: scope.projectId },
            include: { project: true },
          }),
          this.loadWorkingCopy(scope, tx),
        ]);
        if (!chapter || chapter.project.lifecycleStatus !== "active") {
          serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
        }
        const state = this.parseWorkingCopyState(scope, workingCopy);
        this.assertRequestMatchesDocumentSchema(
          request.schemaVersion,
          state.document.schemaVersion,
        );
        const expectedRevisionDocumentDigest = request.schemaVersion === 1
          ? request.expectedDocumentDigest
          : request.expectedRevisionDocumentDigest;
        const expectedVisibleDocumentDigest = request.schemaVersion === 1
          ? request.expectedDocumentDigest
          : request.expectedVisibleDocumentDigest;
        const currentRevision = chapter.currentLayoutRevisionId
          ? await tx.layoutRevision.findFirst({
              where: { id: chapter.currentLayoutRevisionId, projectId: scope.projectId, chapterId: scope.chapterId },
            })
          : null;
        if (
          currentRevision
          && currentRevision.previousRevisionId === request.expectedCurrentRevisionId
          && currentRevision.schemaVersion === request.schemaVersion
          && currentRevision.documentDigest === expectedRevisionDocumentDigest
          && (
            currentRevision.visibleDocumentDigest
              ?? currentRevision.documentDigest
          ) === expectedVisibleDocumentDigest
          && currentRevision.saveReason === request.saveReason
          && workingCopy.rowVersion === request.expectedWorkingCopyRowVersion + 1
          && workingCopy.documentDigest === expectedRevisionDocumentDigest
          && workingCopy.basedOnRevisionId === currentRevision.id
        ) {
          const current = await this.loadCurrentSources(scope, tx, false);
          const detail = await this.toRevisionDetail(scope, current, currentRevision, tx);
          const report = await this.runRevisionPreflight(
            scope,
            this.parseRevisionState(scope, currentRevision),
            currentRevision,
            current,
            workingCopy.documentDigest,
            tx,
          );
          const common = {
            result: "replayed" as const,
            revision: detail,
            warnings: report.issues.filter((issue) => issue.severity !== "error"),
            preflight: report,
            workingCopy: await this.workingCopies.responseForReader(scope, workingCopy, tx),
          };
          return request.schemaVersion === 1
            ? {
                schemaVersion: 1,
                ...common,
                revision: detail as LayoutRevisionDetailV1,
                preflight: report as LayoutPreflightReportV1,
                warnings: report.issues.filter(
                  (issue) => issue.severity !== "error",
                ) as LayoutPreflightReportV1["issues"],
              }
            : {
                schemaVersion: 2,
                ...common,
                revision: detail as LayoutRevisionDetailV2,
                preflight: report as LayoutPreflightReportV2,
                warnings: report.issues.filter(
                  (issue) => issue.severity !== "error",
                ) as LayoutPreflightReportV2["issues"],
              };
        }
        this.assertCreateRevisionExpectation(workingCopy, state, request);
        if (chapter.currentLayoutRevisionId !== request.expectedCurrentRevisionId) {
          serviceError("LAYOUT_EXPECTED_CURRENT_REVISION_MISMATCH", 409, {
            currentLayoutRevisionId: chapter.currentLayoutRevisionId,
          });
        }
        const document = state.document;
        const visibleDocument = state.visibleDocument;
        const current = await this.loadCurrentSources(scope, tx, false);
        const sourceLockSetDigest = digestLayoutSourceLockSet(
          visibleDocument,
          current.activeShotIds,
        );
        const expectedCurrentDigest = current.current ? current.digest : null;
        if (sourceLockSetDigest !== expectedCurrentDigest) {
          serviceError("LAYOUT_SOURCE_DIGEST_MISMATCH", 409, {
            sourceLockSetDigest,
            currentLockSetDigest: expectedCurrentDigest,
          });
        }
        const report = await this.runPreflight(
          scope,
          state,
          {
            kind: "working_copy",
            id: workingCopy.id,
            rowVersion: workingCopy.rowVersion,
          },
          current,
          null,
          null,
          tx,
        );
        const blockingIssues = report.issues.filter((issue) => issue.blockingScopes.includes("revision"));
        if (blockingIssues.length > 0) {
          serviceError("LAYOUT_REVISION_PREFLIGHT_BLOCKED", 409, {
            preflightDigest: report.preflightDigest,
            issueKeys: blockingIssues.map((issue) => issue.issueKey),
          });
        }
        const reportIssueKeys = new Set(report.issues.map((issue) => issue.issueKey));
        const unknownAcknowledgements = request.acknowledgedIssueKeys.filter(
          (issueKey) => !reportIssueKeys.has(issueKey),
        );
        if (unknownAcknowledgements.length > 0) {
          serviceError("LAYOUT_PREFLIGHT_ACKNOWLEDGEMENT_INVALID", 409, {
            preflightDigest: report.preflightDigest,
            issueKeys: unknownAcknowledgements,
          });
        }
        const acknowledged = new Set(request.acknowledgedIssueKeys);
        const missingAcknowledgements = report.issues.filter((issue) =>
          issue.requiresAcknowledgement && !acknowledged.has(issue.issueKey));
        if (missingAcknowledgements.length > 0) {
          serviceError("LAYOUT_PREFLIGHT_ACKNOWLEDGEMENT_REQUIRED", 409, {
            preflightDigest: report.preflightDigest,
            issueKeys: missingAcknowledgements.map((issue) => issue.issueKey),
          });
        }
        const revisionNumber = (currentRevision?.revision ?? 0) + 1;
        const now = new Date();
        const created = await tx.layoutRevision.create({
          data: {
            id: `layout_rev_${randomUUID()}`,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            revision: revisionNumber,
            previousRevisionId: chapter.currentLayoutRevisionId,
            contentBasedOnRevisionId: workingCopy.basedOnRevisionId,
            documentJson: document as unknown as Prisma.InputJsonValue,
            schemaVersion: document.schemaVersion,
            documentDigest: workingCopy.documentDigest,
            visibleDocumentDigest: state.visibleDocumentDigest,
            sourceLockSetDigest,
            origin: "runtime",
            saveReason: request.saveReason,
            bindingSetSealedAt: null,
            createdAt: now,
          },
        });
        for (const binding of projectLayoutSourceBindings(visibleDocument)) {
          await tx.layoutSourceBinding.create({
            data: {
              id: `layout_binding_${randomUUID()}`,
              layoutRevisionId: created.id,
              elementId: binding.elementId,
              role: binding.role,
              order: binding.order,
              shotId: binding.shotId,
              candidateId: binding.candidateId,
              candidateLockRevisionId: binding.candidateLockRevisionId,
              assetId: binding.assetId,
              sourceDigest: binding.sourceDigest,
            },
          });
        }
        const sealed = await tx.layoutRevision.update({
          where: { id: created.id },
          data: { bindingSetSealedAt: now },
        });
        const pointer = await tx.chapter.updateMany({
          where: {
            id: scope.chapterId,
            projectId: scope.projectId,
            currentLayoutRevisionId: request.expectedCurrentRevisionId,
          },
          data: {
            currentLayoutRevisionId: sealed.id,
            // 已有历史出版指针时保留 exported；freshness 由来源查询派生，不能伪造删除旧 current 证据。
            milestoneStatus: chapter.currentExportRevisionId ? chapter.milestoneStatus : "layout_done",
            rowVersion: { increment: 1 },
          },
        });
        if (pointer.count !== 1) serviceError("LAYOUT_EXPECTED_CURRENT_REVISION_MISMATCH", 409);
        const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
        const workingUpdate = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: workingCopy.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: request.expectedWorkingCopyRowVersion,
            documentDigest: expectedRevisionDocumentDigest,
          },
          data: {
            basedOnRevisionId: sealed.id,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (workingUpdate.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        const updatedWorkingCopy = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        const detail = await this.toRevisionDetail(scope, current, sealed, tx);
        const common = {
          result: "created" as const,
          revision: detail,
          warnings: report.issues.filter((issue) => issue.severity !== "error"),
          preflight: report,
          workingCopy: await this.workingCopies.responseForReader(scope, updatedWorkingCopy, tx),
        };
        return request.schemaVersion === 1
          ? {
              schemaVersion: 1,
              ...common,
              revision: detail as LayoutRevisionDetailV1,
              preflight: report as LayoutPreflightReportV1,
              warnings: report.issues.filter(
                (issue) => issue.severity !== "error",
              ) as LayoutPreflightReportV1["issues"],
            }
          : {
              schemaVersion: 2,
              ...common,
              revision: detail as LayoutRevisionDetailV2,
              preflight: report as LayoutPreflightReportV2,
              warnings: report.issues.filter(
                (issue) => issue.severity !== "error",
              ) as LayoutPreflightReportV2["issues"],
            };
      });
    });
  }

  async listRevisions(
    scope: VersionScopeV1,
  ): Promise<LayoutRevisionHistoryResponseV1 | LayoutRevisionHistoryResponseV2> {
    return this.execute(() => this.prismaService.runReadTransaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({
        where: { id: scope.chapterId, projectId: scope.projectId },
        select: { currentLayoutRevisionId: true },
      });
      if (!chapter) serviceError("LAYOUT_REVISION_NOT_FOUND", 404);
      const current = await this.loadCurrentSources(scope, tx, false);
      const rows = await tx.layoutRevision.findMany({
        where: { projectId: scope.projectId, chapterId: scope.chapterId, bindingSetSealedAt: { not: null } },
        include: { layoutSourceBindingsByLayoutRevision: { orderBy: { order: "asc" } } },
        orderBy: { revision: "desc" },
      });
      const items = rows.map((row) => this.toRevisionSummary(current, row));
      if (items.every((item) => !("documentSchemaVersion" in item))) {
        return {
          schemaVersion: 1,
          currentLayoutRevisionId: chapter.currentLayoutRevisionId,
          items: items as LayoutRevisionSummaryV1[],
        };
      }
      return {
        schemaVersion: 2,
        currentLayoutRevisionId: chapter.currentLayoutRevisionId,
        items: items.map((item): LayoutRevisionSummaryV1OrV2 => (
          "documentSchemaVersion" in item
            ? item
            : { ...item, documentSchemaVersion: 1 }
        )),
      };
    }));
  }

  async getRevision(
    scope: VersionScopeV1,
    revisionId: string,
  ): Promise<LayoutRevisionDetailV1 | LayoutRevisionDetailV2> {
    return this.execute(() => this.prismaService.runReadTransaction(async (tx) => {
      const current = await this.loadCurrentSources(scope, tx, false);
      const revision = await this.loadRevision(scope, revisionId, tx, true);
      return this.toRevisionDetail(scope, current, revision, tx);
    }));
  }

  async restoreRevision(
    scope: VersionScopeV1,
    revisionId: string,
    input: unknown,
  ): Promise<RestoreLayoutRevisionResponseV1 | RestoreLayoutRevisionResponseV2> {
    return this.execute(async () => {
      const request = parseRestoreLayoutRevisionRequestV1OrV2(input);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const [revision, workingCopy] = await Promise.all([
          this.loadRevision(scope, revisionId, tx, true),
          this.loadWorkingCopy(scope, tx),
        ]);
        const workingState = this.parseWorkingCopyState(scope, workingCopy);
        const revisionState = this.parseRevisionState(scope, revision);
        assertLayoutRestoreSchemaPolicy({
          requestSchemaVersion: request.schemaVersion,
          workingCopySchemaVersion: workingState.document.schemaVersion,
          targetRevisionSchemaVersion: revisionState.document.schemaVersion,
        });
        const finalDocument = request.schemaVersion === 2
          && revisionState.document.schemaVersion === 1
          ? upgradeLayoutWorkingCopyV1ToV2(revisionState.document, scope)
          : revisionState.document;
        const finalState = this.parseDocumentState(scope, finalDocument);
        if (
          workingCopy.rowVersion === request.expectedWorkingCopyRowVersion + 1
          && workingCopy.documentDigest === finalState.revisionDocumentDigest
          && workingCopy.basedOnRevisionId === revision.id
        ) {
          const common = {
            result: "replayed",
            restoredFromRevisionId: revision.id,
            workingCopy: await this.workingCopies.responseForReader(scope, workingCopy, tx),
          };
          return finalDocument.schemaVersion === 1
            ? { schemaVersion: 1, ...common } as RestoreLayoutRevisionResponseV1
            : { schemaVersion: 2, ...common } as RestoreLayoutRevisionResponseV2;
        }
        this.assertRestoreExpectation(workingCopy, workingState, request);
        const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
        const updated = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: workingCopy.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: request.expectedWorkingCopyRowVersion,
            documentDigest: workingState.revisionDocumentDigest,
          },
          data: {
            documentKind: finalDocument.kind,
            documentJson: finalDocument as unknown as Prisma.InputJsonValue,
            schemaVersion: finalDocument.schemaVersion,
            documentDigest: finalState.revisionDocumentDigest,
            sourceLockSetDigest: revision.sourceLockSetDigest,
            basedOnRevisionId: revision.id,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (updated.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        const result = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        const common = {
          result: "restored",
          restoredFromRevisionId: revision.id,
          workingCopy: await this.workingCopies.responseForReader(scope, result, tx),
        };
        return finalDocument.schemaVersion === 1
          ? { schemaVersion: 1, ...common } as RestoreLayoutRevisionResponseV1
          : { schemaVersion: 2, ...common } as RestoreLayoutRevisionResponseV2;
      });
    });
  }

  private async runRevisionPreflight(
    scope: VersionScopeV1,
    state: LayoutDocumentState,
    revision: { id: string },
    current: CurrentLayoutSources,
    workingCopyRevisionDocumentDigest: string | null,
    reader: Reader,
  ): Promise<LayoutPreflightReportV1 | LayoutPreflightReportV2> {
    return this.runPreflight(
      scope,
      state,
      { kind: "layout_revision", id: revision.id, rowVersion: null },
      current,
      workingCopyRevisionDocumentDigest,
      null,
      reader,
    );
  }

  private async runPreflight(
    scope: VersionScopeV1,
    state: LayoutDocumentState,
    target: {
      kind: "working_copy" | "layout_revision";
      id: string;
      rowVersion: number | null;
    },
    current: CurrentLayoutSources,
    workingCopyRevisionDocumentDigest: string | null,
    profile: LayoutPublicationProfileV1 | null,
    reader: Reader,
  ): Promise<LayoutPreflightReportV1 | LayoutPreflightReportV2> {
    const [fontCatalog, imageAssets] = await Promise.all([
      this.layoutFonts.listForReader(scope, reader, false),
      this.loadImageAssets(state.visibleDocument, current.items, reader),
    ]);
    if (state.document.schemaVersion === 1) {
      return runLayoutPreflightV1({
        document: state.document,
        target: {
          ...target,
          documentDigest: state.revisionDocumentDigest,
        },
        currentSources: current.current ? current.items : [],
        activeShotIds: current.activeShotIds,
        imageAssets,
        fontCatalog,
        profile,
        workingCopyDocumentDigest: workingCopyRevisionDocumentDigest
          ? asDigest(
              workingCopyRevisionDocumentDigest,
              "LAYOUT_DOCUMENT_DIGEST_MISMATCH",
            )
          : null,
      });
    }
    const document = state.document;
    const [dialogue, evidence] = await Promise.all([
      this.compositionSources.currentDialoguePreflightSource(scope, reader),
      document.automation.composition
        ? this.compositionSources.compositionPreflightEvidence(
            scope,
            document.automation.composition.compositionDigest,
            reader,
          )
        : Promise.resolve(null),
    ]);
    return runLayoutPreflightV2({
      document,
      target: {
        ...target,
        revisionDocumentDigest: state.revisionDocumentDigest,
        visibleDocumentDigest: state.visibleDocumentDigest,
      },
      currentSources: current.current ? current.items : [],
      activeShotIds: current.activeShotIds,
      imageAssets,
      fontCatalog,
      profile,
      dialogueLedger: dialogue.dialogueLedger,
      currentComposition: evidence
        ? {
            ...evidence,
            storyboardVersionId: dialogue.storyboardVersionId,
            storyboardDigest: dialogue.storyboardDigest,
          }
        : null,
      workingCopyRevisionDocumentDigest:
        workingCopyRevisionDocumentDigest
          ? asDigest(
              workingCopyRevisionDocumentDigest,
              "LAYOUT_DOCUMENT_DIGEST_MISMATCH",
            )
          : null,
    });
  }

  private async loadCurrentSources(
    scope: VersionScopeV1,
    reader: Reader,
    requireCurrent: boolean,
  ): Promise<CurrentLayoutSources> {
    const chapter = await reader.chapter.findFirst({
      where: { id: scope.chapterId, projectId: scope.projectId },
      select: { currentStoryboardVersionId: true },
    });
    if (!chapter?.currentStoryboardVersionId) {
      if (requireCurrent) serviceError("LAYOUT_LOCK_SET_INCOMPLETE", 409);
      return { activeShotIds: [], items: [], current: false, digest: null };
    }
    const [sourceState, projections, shots] = await Promise.all([
      this.candidateSources.get(scope, reader),
      reader.storyboardShotProjection.findMany({
        where: { storyboardVersionId: chapter.currentStoryboardVersionId },
        orderBy: { order: "asc" },
        select: { shotId: true, order: true },
      }),
      reader.shot.findMany({
        where: { projectId: scope.projectId, chapterId: scope.chapterId, lifecycleStatus: "active" },
        include: {
          currentCandidateLockRevision: {
            include: { candidate: { include: { asset: true } } },
          },
        },
      }),
    ]);
    const orderByShot = new Map(projections.map((projection) => [projection.shotId, projection.order]));
    const ordered = [...shots].sort((left, right) =>
      (orderByShot.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderByShot.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id));
    const activeShotIds = ordered.map((shot) => shot.id);
    const items: LayoutSourceCatalogItemV1[] = [];
    for (const [index, shot] of ordered.entries()) {
      const revision = shot.currentCandidateLockRevision;
      const candidate = revision?.candidate;
      const asset = candidate?.asset;
      if (
        !revision
        || !candidate
        || !asset
        || !["lock", "replace"].includes(revision.action)
        || candidate.status !== "generated"
        || asset.status !== "ready"
        || !asset.sha256
        || !/^sha256:[0-9a-f]{64}$/.test(asset.sha256)
        || !asset.width
        || !asset.height
      ) continue;
      const unsigned = {
        shotId: shot.id,
        candidateId: candidate.id,
        candidateLockRevisionId: revision.id,
        assetId: asset.id,
      };
      items.push({
        order: orderByShot.get(shot.id) ?? index + 1,
        source: {
          ...unsigned,
          sourceDigest: digestCandidateImageSourceV1(unsigned, asset.sha256 as LayoutDigest),
        },
        width: asset.width,
        height: asset.height,
      });
    }
    const current = sourceState.candidateLockSet.state === "complete"
      && sourceState.candidateLockSet.sourceApplicability === "current"
      && items.length === activeShotIds.length
      && sourceState.candidateLockSet.digest !== null;
    if (requireCurrent && !current) {
      serviceError("LAYOUT_LOCK_SET_INCOMPLETE", 409, {
        reasonCodes: sourceState.gates.buildLayoutWorkingCopy.reasonCodes,
      });
    }
    return {
      activeShotIds,
      items,
      current,
      digest: current
        ? asDigest(sourceState.candidateLockSet.digest, "LAYOUT_SOURCE_DIGEST_MISMATCH")
        : null,
    };
  }

  private async loadImageAssets(
    document: LayoutDocumentV1,
    currentSources: readonly LayoutSourceCatalogItemV1[],
    reader: Reader,
  ): Promise<Record<string, LayoutPreflightImageAssetV1>> {
    const assetIds = unique([
      ...projectLayoutSourceBindings(document).map((binding) => binding.assetId),
      ...currentSources.map((source) => source.source.assetId),
    ]);
    if (assetIds.length === 0) return {};
    const rows = await reader.asset.findMany({ where: { id: { in: assetIds } } });
    const result: Record<string, LayoutPreflightImageAssetV1> = {};
    for (const row of rows) {
      if (!row.sha256 || !/^sha256:[0-9a-f]{64}$/.test(row.sha256) || !row.width || !row.height) continue;
      let ready = row.status === "ready";
      let normalizationIssues: LayoutPreflightImageAssetV1["normalizationIssues"] = [];
      if (ready) {
        try {
          const absolute = this.workspacePath.resolveVirtualPath(`/workspace/${row.storageKey}`);
          const canonical = await realpath(absolute);
          if (canonical !== absolute) throw new Error("LAYOUT_IMAGE_PATH_NOT_CANONICAL");
          const bytes = await readFile(absolute);
          const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
          if (row.bytes !== bytes.byteLength || row.sha256 !== digest) throw new Error("LAYOUT_IMAGE_BYTES_MISMATCH");
          normalizationIssues = inspectLayoutImageNormalizationV1(bytes, row.mimeType).issueCodes;
        } catch {
          ready = false;
        }
      }
      result[row.id] = {
        assetId: row.id,
        sha256: row.sha256 as LayoutDigest,
        width: row.width,
        height: row.height,
        ready,
        normalizationIssues,
      };
    }
    return result;
  }

  private async loadSourceDimensions(
    document: LayoutDocumentV1,
    reader: Reader,
  ): Promise<Record<string, { width: number; height: number }>> {
    const assetIds = unique(projectLayoutSourceBindings(document).map((binding) => binding.assetId));
    if (assetIds.length === 0) return {};
    const rows = await reader.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, width: true, height: true },
    });
    return Object.fromEntries(rows.flatMap((row) => row.width && row.height
      ? [[row.id, { width: row.width, height: row.height }]]
      : []));
  }

  private async loadWorkingCopy(scope: VersionScopeV1, reader: Reader) {
    const row = await reader.layoutWorkingCopy.findFirst({
      where: { projectId: scope.projectId, chapterId: scope.chapterId },
    });
    if (!row) serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
    if (
      (row.documentKind !== "layout_document_v1"
        && row.documentKind !== "layout_document_v2")
      || (row.schemaVersion !== 1 && row.schemaVersion !== 2)
    ) {
      serviceError("LAYOUT_WORKING_COPY_EXISTS", 409, { documentKind: row.documentKind });
    }
    return row;
  }

  private async loadRevision(
    scope: VersionScopeV1,
    revisionId: string,
    reader: Reader,
    includeBindings = false,
  ) {
    const row = await reader.layoutRevision.findFirst({
      where: { id: revisionId, projectId: scope.projectId, chapterId: scope.chapterId },
      include: includeBindings
        ? { layoutSourceBindingsByLayoutRevision: { orderBy: { order: "asc" } } }
        : undefined,
    });
    if (!row || !row.bindingSetSealedAt) serviceError("LAYOUT_REVISION_NOT_FOUND", 404);
    return row;
  }

  private parseDocumentState(
    scope: VersionScopeV1,
    input: unknown,
  ): LayoutDocumentState {
    const revision = LayoutDocumentCodecV1OrV2.encode(input, scope);
    const visible = revision.value.schemaVersion === 1
      ? LayoutDocumentCodecV1.encode(revision.value, scope)
      : LayoutDocumentCodecV1.encode(
          projectLayoutDocumentV2ToV1(revision.value, scope),
          scope,
        );
    return {
      document: revision.value,
      visibleDocument: visible.value,
      revisionDocumentDigest: revision.digest,
      visibleDocumentDigest: visible.digest,
    };
  }

  private parseWorkingCopyState(
    scope: VersionScopeV1,
    row: {
      documentJson: unknown;
      documentDigest: string;
      documentKind: string;
      schemaVersion: number;
    },
  ): LayoutDocumentState {
    const state = this.parseDocumentState(scope, row.documentJson);
    if (
      state.document.schemaVersion !== row.schemaVersion
      || state.document.kind !== row.documentKind
      || state.revisionDocumentDigest !== row.documentDigest
    ) serviceError("LAYOUT_DOCUMENT_DIGEST_MISMATCH", 409);
    return state;
  }

  private parseRevisionState(
    scope: VersionScopeV1,
    row: {
      documentJson: unknown;
      documentDigest: string;
      visibleDocumentDigest: string | null;
      schemaVersion: number;
    },
  ): LayoutDocumentState {
    const state = this.parseDocumentState(scope, row.documentJson);
    const storedVisible = row.visibleDocumentDigest ?? (
      row.schemaVersion === 1 ? row.documentDigest : null
    );
    if (
      state.document.schemaVersion !== row.schemaVersion
      || state.revisionDocumentDigest !== row.documentDigest
      || storedVisible !== state.visibleDocumentDigest
    ) serviceError("LAYOUT_DOCUMENT_DIGEST_MISMATCH", 409);
    return state;
  }

  private assertRequestMatchesDocumentSchema(
    requestSchemaVersion: 1 | 2,
    documentSchemaVersion: 1 | 2,
  ): void {
    if (requestSchemaVersion !== documentSchemaVersion) {
      serviceError("LAYOUT_DOCUMENT_SCHEMA_VERSION_MISMATCH", 409, {
        requestSchemaVersion,
        documentSchemaVersion,
      });
    }
  }

  private workingCopyConflict(
    row: { rowVersion: number },
    state: LayoutDocumentState,
  ): never {
    serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409, {
      currentRowVersion: row.rowVersion,
      currentRevisionDocumentDigest: state.revisionDocumentDigest,
      currentVisibleDocumentDigest: state.visibleDocumentDigest,
    });
  }

  private assertWorkingCopyRequestExpectation(
    row: { rowVersion: number },
    state: LayoutDocumentState,
    request:
      | ReturnType<typeof parsePreviewLayoutSourceReplacementRequestV1OrV2>
      | ReturnType<typeof parseCommitLayoutSourceReplacementRequestV1OrV2>,
  ): void {
    const valid = row.rowVersion === request.expectedWorkingCopyRowVersion
      && (
        request.schemaVersion === 1
          ? state.revisionDocumentDigest === request.expectedDocumentDigest
          : state.revisionDocumentDigest
              === request.expectedRevisionDocumentDigest
            && state.visibleDocumentDigest
              === request.expectedVisibleDocumentDigest
      );
    if (!valid) this.workingCopyConflict(row, state);
  }

  private assertPreflightWorkingCopyExpectation(
    row: { rowVersion: number },
    state: LayoutDocumentState,
    target: Extract<
      ReturnType<typeof parseRunLayoutPreflightRequestV1OrV2>["target"],
      { kind: "working_copy" }
    >,
  ): void {
    const valid = row.rowVersion === target.expectedRowVersion
      && (
        "expectedDocumentDigest" in target
          ? state.revisionDocumentDigest === target.expectedDocumentDigest
          : state.revisionDocumentDigest
              === target.expectedRevisionDocumentDigest
            && state.visibleDocumentDigest
              === target.expectedVisibleDocumentDigest
      );
    if (!valid) this.workingCopyConflict(row, state);
  }

  private assertCreateRevisionExpectation(
    row: { rowVersion: number },
    state: LayoutDocumentState,
    request: ReturnType<typeof parseCreateLayoutRevisionRequestV1OrV2>,
  ): void {
    const valid = row.rowVersion === request.expectedWorkingCopyRowVersion
      && (
        request.schemaVersion === 1
          ? state.revisionDocumentDigest === request.expectedDocumentDigest
          : state.revisionDocumentDigest
              === request.expectedRevisionDocumentDigest
            && state.visibleDocumentDigest
              === request.expectedVisibleDocumentDigest
      );
    if (!valid) this.workingCopyConflict(row, state);
  }

  private assertRestoreExpectation(
    row: { rowVersion: number },
    state: LayoutDocumentState,
    request: ReturnType<typeof parseRestoreLayoutRevisionRequestV1OrV2>,
  ): void {
    const valid = row.rowVersion === request.expectedWorkingCopyRowVersion
      && (
        request.schemaVersion === 1
          ? state.revisionDocumentDigest === request.expectedWorkingCopyDigest
          : state.revisionDocumentDigest
              === request.expectedWorkingCopyRevisionDocumentDigest
            && state.visibleDocumentDigest
              === request.expectedWorkingCopyVisibleDocumentDigest
      );
    if (!valid) this.workingCopyConflict(row, state);
  }

  private sourceResolution(
    current: CurrentLayoutSources,
    bindings: Array<{
      shotId: string | null;
      candidateId: string | null;
      candidateLockRevisionId: string | null;
      assetId: string | null;
      sourceDigest: string;
    }>,
  ): LayoutRevisionSummaryV1["sourceResolution"] {
    if (!current.current) return "unresolved";
    const currentByShot = new Map(current.items.map((item) => [item.source.shotId, item.source]));
    const boundShots = new Set<string>();
    for (const binding of bindings) {
      if (!binding.shotId) return "unresolved";
      const source = currentByShot.get(binding.shotId);
      if (!source) return "unresolved";
      boundShots.add(binding.shotId);
      if (
        binding.candidateId !== source.candidateId
        || binding.candidateLockRevisionId !== source.candidateLockRevisionId
        || binding.assetId !== source.assetId
        || binding.sourceDigest !== source.sourceDigest
      ) return "stale";
    }
    if (current.activeShotIds.some((shotId) => !boundShots.has(shotId))) return "stale";
    return "current";
  }

  private toRevisionSummary(
    current: CurrentLayoutSources,
    row: {
      id: string;
      projectId: string;
      chapterId: string;
      revision: number;
      previousRevisionId: string | null;
      contentBasedOnRevisionId: string | null;
      documentDigest: string;
      visibleDocumentDigest: string | null;
      schemaVersion: number;
      sourceLockSetDigest: string | null;
      saveReason: string;
      createdAt: Date;
      layoutSourceBindingsByLayoutRevision?: Array<{
        shotId: string | null;
        candidateId: string | null;
        candidateLockRevisionId: string | null;
        assetId: string | null;
        sourceDigest: string;
      }>;
    },
  ): LayoutRevisionSummaryV1 | LayoutRevisionSummaryV2 {
    const saveReason: LayoutRevisionSummaryV1["saveReason"] = row.saveReason === "user_checkpoint"
      || row.saveReason === "export_checkpoint"
      || row.saveReason === "history_restore"
      ? row.saveReason
      : "legacy_import";
    const common = {
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId,
      revision: row.revision,
      previousRevisionId: row.previousRevisionId,
      contentBasedOnRevisionId: row.contentBasedOnRevisionId,
      sourceLockSetDigest: row.sourceLockSetDigest
        ? asDigest(row.sourceLockSetDigest, "LAYOUT_SOURCE_DIGEST_MISMATCH")
        : null,
      saveReason,
      sourceResolution: this.sourceResolution(current, row.layoutSourceBindingsByLayoutRevision ?? []),
      createdAt: row.createdAt.toISOString(),
    };
    if (row.schemaVersion === 1) {
      return {
        ...common,
        documentDigest: asDigest(
          row.documentDigest,
          "LAYOUT_DOCUMENT_DIGEST_MISMATCH",
        ),
      };
    }
    if (row.schemaVersion !== 2) serviceError("LAYOUT_REVISION_NOT_SUPPORTED", 409);
    return {
      documentSchemaVersion: 2,
      ...common,
      sourceLockSetDigest: asDigest(
        row.sourceLockSetDigest,
        "LAYOUT_SOURCE_DIGEST_MISMATCH",
      ),
      revisionDocumentDigest: asDigest(
        row.documentDigest,
        "LAYOUT_DOCUMENT_DIGEST_MISMATCH",
      ),
      visibleDocumentDigest: asDigest(
        row.visibleDocumentDigest,
        "LAYOUT_VISIBLE_DOCUMENT_DIGEST_MISMATCH",
      ),
    };
  }

  private async toRevisionDetail(
    scope: VersionScopeV1,
    current: CurrentLayoutSources,
    row: {
      id: string;
      projectId: string;
      chapterId: string;
      revision: number;
      previousRevisionId: string | null;
      contentBasedOnRevisionId: string | null;
      documentJson: unknown;
      documentDigest: string;
      visibleDocumentDigest: string | null;
      sourceLockSetDigest: string | null;
      schemaVersion: number;
      saveReason: string;
      bindingSetSealedAt: Date | null;
      createdAt: Date;
      layoutSourceBindingsByLayoutRevision?: Array<{
        shotId: string | null;
        candidateId: string | null;
        candidateLockRevisionId: string | null;
        assetId: string | null;
        sourceDigest: string;
      }>;
    },
    reader: Reader,
  ): Promise<LayoutRevisionDetailV1 | LayoutRevisionDetailV2> {
    if (!row.bindingSetSealedAt) serviceError("LAYOUT_REVISION_NOT_FOUND", 404);
    const bindings = row.layoutSourceBindingsByLayoutRevision
      ?? await reader.layoutSourceBinding.findMany({
        where: { layoutRevisionId: row.id },
        orderBy: { order: "asc" },
      });
    const summary = this.toRevisionSummary(current, {
      ...row,
      layoutSourceBindingsByLayoutRevision: bindings,
    });
    const state = this.parseRevisionState(scope, row);
    return row.schemaVersion === 1
      ? {
          ...(summary as LayoutRevisionSummaryV1),
          document: state.document as LayoutDocumentV1,
          bindingSetSealedAt: row.bindingSetSealedAt.toISOString(),
        }
      : {
          ...(summary as LayoutRevisionSummaryV2),
          document: state.document as LayoutDocumentV2,
          bindingSetSealedAt: row.bindingSetSealedAt.toISOString(),
        };
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      if (!this.prismaService.isDatabaseMode()) serviceError("LAYOUT_DB_ONLY_REQUIRED", 409);
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof LayoutVersioningServiceError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.message, details: error.details },
        }, error.status);
      }
      if (error instanceof LayoutDocumentValidationError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.message },
        }, error.httpStatus);
      }
      if (error instanceof LayoutRevisionContractError || error instanceof LayoutSourceReplacementContractError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.message },
        }, 400);
      }
      if (error instanceof Error && /AIR_G[15]:/.test(error.message)) {
        throw new HttpException({
          success: false,
          error: { code: "LAYOUT_REVISION_CONFLICT", message: "LAYOUT_REVISION_CONFLICT" },
        }, 409);
      }
      throw error;
    }
  }
}
