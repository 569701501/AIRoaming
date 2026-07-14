import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  buildLayoutSourceReplacementPreviewV1,
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  LayoutDocumentCodecV1,
  LayoutDocumentValidationError,
  LayoutRevisionContractError,
  LayoutSourceReplacementContractError,
  parseCommitLayoutSourceReplacementRequestV1,
  parseCreateLayoutRevisionRequestV1,
  parsePreviewLayoutSourceReplacementRequestV1,
  parseRestoreLayoutRevisionRequestV1,
  parseRunLayoutPreflightRequestV1,
  projectLayoutSourceBindings,
  runLayoutPreflightV1,
  type CommitLayoutSourceReplacementResponseV1,
  type CreateLayoutRevisionResponseV1,
  type LayoutDigest,
  type LayoutDocumentV1,
  type LayoutPreflightImageAssetV1,
  type LayoutPreflightReportV1,
  type LayoutRevisionDetailV1,
  type LayoutRevisionHistoryResponseV1,
  type LayoutRevisionSummaryV1,
  type LayoutSourceCatalogItemV1,
  type LayoutSourceReplacementPreviewV1,
  type LayoutWorkingCopyResponseV1,
  type RestoreLayoutRevisionResponseV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";
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

@Injectable()
export class LayoutVersioningService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(CandidateSourceQueryService) private readonly candidateSources: CandidateSourceQueryService,
    @Inject(LayoutFontService) private readonly layoutFonts: LayoutFontService,
    @Inject(LayoutWorkingCopyService) private readonly workingCopies: LayoutWorkingCopyService,
  ) {}

  async previewSourceReplacements(
    scope: VersionScopeV1,
    input: unknown,
  ): Promise<LayoutSourceReplacementPreviewV1> {
    return this.execute(async () => {
      const request = parsePreviewLayoutSourceReplacementRequestV1(input);
      return this.prismaService.runReadTransaction(async (tx) => {
        const workingCopy = await this.loadWorkingCopy(scope, tx);
        this.assertWorkingCopyExpectation(workingCopy, request.expectedWorkingCopyRowVersion, request.expectedDocumentDigest);
        const document = this.parseWorkingCopyDocument(scope, workingCopy);
        const current = await this.loadCurrentSources(scope, tx, true);
        const sourceDimensions = await this.loadSourceDimensions(document, tx);
        const built = buildLayoutSourceReplacementPreviewV1({
          document,
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
  ): Promise<CommitLayoutSourceReplacementResponseV1> {
    return this.execute(async () => {
      const request = parseCommitLayoutSourceReplacementRequestV1(input);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const workingCopy = await this.loadWorkingCopy(scope, tx);
        if (
          workingCopy.rowVersion === request.expectedWorkingCopyRowVersion + 1
          && workingCopy.documentDigest === request.resultDocumentDigest
        ) {
          return {
            schemaVersion: 1,
            result: "replayed",
            replacementDigest: request.replacementDigest,
            resultDocumentDigest: request.resultDocumentDigest,
            workingCopy: await this.workingCopies.responseForReader(scope, workingCopy, tx),
          };
        }
        this.assertWorkingCopyExpectation(workingCopy, request.expectedWorkingCopyRowVersion, request.expectedDocumentDigest);
        const document = this.parseWorkingCopyDocument(scope, workingCopy);
        const current = await this.loadCurrentSources(scope, tx, true);
        const sourceDimensions = await this.loadSourceDimensions(document, tx);
        const built = buildLayoutSourceReplacementPreviewV1({
          document,
          request,
          currentSources: current.items,
          sourceDimensions,
        });
        if (
          built.replacementDigest !== request.replacementDigest
          || built.resultDocumentDigest !== request.resultDocumentDigest
        ) {
          serviceError("LAYOUT_SOURCE_REPLACEMENT_PREVIEW_MISMATCH", 409, {
            replacementDigest: built.replacementDigest,
            resultDocumentDigest: built.resultDocumentDigest,
          });
        }
        const sourceLockSetDigest = digestLayoutSourceLockSet(built.resultDocument, current.activeShotIds);
        const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
        const update = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: workingCopy.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: request.expectedWorkingCopyRowVersion,
            documentDigest: request.expectedDocumentDigest,
          },
          data: {
            documentJson: built.resultDocument as unknown as Prisma.InputJsonValue,
            documentDigest: built.resultDocumentDigest,
            sourceLockSetDigest,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (update.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        const updated = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        return {
          schemaVersion: 1,
          result: "updated",
          replacementDigest: request.replacementDigest,
          resultDocumentDigest: request.resultDocumentDigest,
          workingCopy: await this.workingCopies.responseForReader(scope, updated, tx),
        };
      });
    });
  }

  async preflight(scope: VersionScopeV1, input: unknown): Promise<LayoutPreflightReportV1> {
    return this.execute(async () => {
      const request = parseRunLayoutPreflightRequestV1(input);
      return this.prismaService.runReadTransaction(async (tx) => {
        const current = await this.loadCurrentSources(scope, tx, false);
        const fontCatalog = await this.layoutFonts.listForReader(scope, tx, false);
        let document: LayoutDocumentV1;
        let target: LayoutPreflightReportV1["target"];
        let workingCopyDocumentDigest: LayoutDigest | null = null;
        if (request.target.kind === "working_copy") {
          const workingCopy = await this.loadWorkingCopy(scope, tx);
          this.assertWorkingCopyExpectation(
            workingCopy,
            request.target.expectedRowVersion,
            request.target.expectedDocumentDigest,
          );
          document = this.parseWorkingCopyDocument(scope, workingCopy);
          target = {
            kind: "working_copy",
            id: workingCopy.id,
            documentDigest: asDigest(workingCopy.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH"),
            rowVersion: workingCopy.rowVersion,
          };
        } else {
          const revision = await this.loadRevision(scope, request.target.layoutRevisionId, tx);
          document = this.parseRevisionDocument(scope, revision);
          target = {
            kind: "layout_revision",
            id: revision.id,
            documentDigest: asDigest(revision.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH"),
            rowVersion: null,
          };
          const workingCopy = await tx.layoutWorkingCopy.findFirst({
            where: { projectId: scope.projectId, chapterId: scope.chapterId, documentKind: "layout_document_v1" },
            select: { documentDigest: true },
          });
          workingCopyDocumentDigest = workingCopy
            ? asDigest(workingCopy.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH")
            : null;
        }
        const imageAssets = await this.loadImageAssets(document, current.items, tx);
        return runLayoutPreflightV1({
          document,
          target,
          currentSources: current.current ? current.items : [],
          activeShotIds: current.activeShotIds,
          imageAssets,
          fontCatalog,
          profile: request.profile,
          workingCopyDocumentDigest,
        });
      });
    });
  }

  async createRevision(scope: VersionScopeV1, input: unknown): Promise<CreateLayoutRevisionResponseV1> {
    return this.execute(async () => {
      const request = parseCreateLayoutRevisionRequestV1(input);
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
        const currentRevision = chapter.currentLayoutRevisionId
          ? await tx.layoutRevision.findFirst({
              where: { id: chapter.currentLayoutRevisionId, projectId: scope.projectId, chapterId: scope.chapterId },
            })
          : null;
        if (
          currentRevision
          && currentRevision.previousRevisionId === request.expectedCurrentRevisionId
          && currentRevision.documentDigest === request.expectedDocumentDigest
          && currentRevision.saveReason === request.saveReason
          && workingCopy.rowVersion === request.expectedWorkingCopyRowVersion + 1
          && workingCopy.documentDigest === request.expectedDocumentDigest
          && workingCopy.basedOnRevisionId === currentRevision.id
        ) {
          const current = await this.loadCurrentSources(scope, tx, false);
          const detail = await this.toRevisionDetail(scope, current, currentRevision, tx);
          const report = await this.runRevisionPreflight(scope, detail.document, currentRevision, current, workingCopy.documentDigest, tx);
          return {
            schemaVersion: 1,
            result: "replayed",
            revision: detail,
            warnings: report.issues.filter((issue) => issue.severity !== "error"),
            preflight: report,
            workingCopy: await this.workingCopies.responseForReader(scope, workingCopy, tx),
          };
        }
        this.assertWorkingCopyExpectation(workingCopy, request.expectedWorkingCopyRowVersion, request.expectedDocumentDigest);
        if (chapter.currentLayoutRevisionId !== request.expectedCurrentRevisionId) {
          serviceError("LAYOUT_EXPECTED_CURRENT_REVISION_MISMATCH", 409, {
            currentLayoutRevisionId: chapter.currentLayoutRevisionId,
          });
        }
        const document = this.parseWorkingCopyDocument(scope, workingCopy);
        const current = await this.loadCurrentSources(scope, tx, false);
        const sourceLockSetDigest = digestLayoutSourceLockSet(document, current.activeShotIds);
        const expectedCurrentDigest = current.current ? current.digest : null;
        if (sourceLockSetDigest !== expectedCurrentDigest) {
          serviceError("LAYOUT_SOURCE_DIGEST_MISMATCH", 409, {
            sourceLockSetDigest,
            currentLockSetDigest: expectedCurrentDigest,
          });
        }
        const target = {
          kind: "working_copy" as const,
          id: workingCopy.id,
          documentDigest: asDigest(workingCopy.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH"),
          rowVersion: workingCopy.rowVersion,
        };
        const report = await this.runPreflight(scope, document, target, current, null, tx);
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
            schemaVersion: 1,
            documentDigest: workingCopy.documentDigest,
            sourceLockSetDigest,
            origin: "runtime",
            saveReason: request.saveReason,
            bindingSetSealedAt: null,
            createdAt: now,
          },
        });
        for (const binding of projectLayoutSourceBindings(document)) {
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
          data: { currentLayoutRevisionId: sealed.id, rowVersion: { increment: 1 } },
        });
        if (pointer.count !== 1) serviceError("LAYOUT_EXPECTED_CURRENT_REVISION_MISMATCH", 409);
        const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
        const workingUpdate = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: workingCopy.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: request.expectedWorkingCopyRowVersion,
            documentDigest: request.expectedDocumentDigest,
          },
          data: {
            basedOnRevisionId: sealed.id,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (workingUpdate.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        const updatedWorkingCopy = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        return {
          schemaVersion: 1,
          result: "created",
          revision: await this.toRevisionDetail(scope, current, sealed, tx),
          warnings: report.issues.filter((issue) => issue.severity !== "error"),
          preflight: report,
          workingCopy: await this.workingCopies.responseForReader(scope, updatedWorkingCopy, tx),
        };
      });
    });
  }

  async listRevisions(scope: VersionScopeV1): Promise<LayoutRevisionHistoryResponseV1> {
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
      return {
        schemaVersion: 1,
        currentLayoutRevisionId: chapter.currentLayoutRevisionId,
        items: rows.map((row) => this.toRevisionSummary(current, row)),
      };
    }));
  }

  async getRevision(scope: VersionScopeV1, revisionId: string): Promise<LayoutRevisionDetailV1> {
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
  ): Promise<RestoreLayoutRevisionResponseV1> {
    return this.execute(async () => {
      const request = parseRestoreLayoutRevisionRequestV1(input);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const [revision, workingCopy] = await Promise.all([
          this.loadRevision(scope, revisionId, tx, true),
          this.loadWorkingCopy(scope, tx),
        ]);
        if (
          workingCopy.rowVersion === request.expectedWorkingCopyRowVersion + 1
          && workingCopy.documentDigest === revision.documentDigest
          && workingCopy.basedOnRevisionId === revision.id
        ) {
          return {
            schemaVersion: 1,
            result: "replayed",
            restoredFromRevisionId: revision.id,
            workingCopy: await this.workingCopies.responseForReader(scope, workingCopy, tx),
          };
        }
        this.assertWorkingCopyExpectation(
          workingCopy,
          request.expectedWorkingCopyRowVersion,
          request.expectedWorkingCopyDigest,
        );
        const document = this.parseRevisionDocument(scope, revision);
        const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
        const updated = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: workingCopy.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: request.expectedWorkingCopyRowVersion,
            documentDigest: request.expectedWorkingCopyDigest,
          },
          data: {
            documentJson: document as unknown as Prisma.InputJsonValue,
            documentDigest: revision.documentDigest,
            sourceLockSetDigest: revision.sourceLockSetDigest,
            basedOnRevisionId: revision.id,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (updated.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        const result = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        return {
          schemaVersion: 1,
          result: "restored",
          restoredFromRevisionId: revision.id,
          workingCopy: await this.workingCopies.responseForReader(scope, result, tx),
        };
      });
    });
  }

  private async runRevisionPreflight(
    scope: VersionScopeV1,
    document: LayoutDocumentV1,
    revision: { id: string; documentDigest: string },
    current: CurrentLayoutSources,
    workingCopyDocumentDigest: string | null,
    reader: Reader,
  ): Promise<LayoutPreflightReportV1> {
    return this.runPreflight(scope, document, {
      kind: "layout_revision",
      id: revision.id,
      documentDigest: asDigest(revision.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH"),
      rowVersion: null,
    }, current, workingCopyDocumentDigest, reader);
  }

  private async runPreflight(
    scope: VersionScopeV1,
    document: LayoutDocumentV1,
    target: LayoutPreflightReportV1["target"],
    current: CurrentLayoutSources,
    workingCopyDocumentDigest: string | null,
    reader: Reader,
  ): Promise<LayoutPreflightReportV1> {
    const [fontCatalog, imageAssets] = await Promise.all([
      this.layoutFonts.listForReader(scope, reader, false),
      this.loadImageAssets(document, current.items, reader),
    ]);
    return runLayoutPreflightV1({
      document,
      target,
      currentSources: current.current ? current.items : [],
      activeShotIds: current.activeShotIds,
      imageAssets,
      fontCatalog,
      profile: null,
      workingCopyDocumentDigest: workingCopyDocumentDigest
        ? asDigest(workingCopyDocumentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH")
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
      result[row.id] = {
        assetId: row.id,
        sha256: row.sha256 as LayoutDigest,
        width: row.width,
        height: row.height,
        ready: row.status === "ready",
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
    if (row.documentKind !== "layout_document_v1") {
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

  private parseWorkingCopyDocument(
    scope: VersionScopeV1,
    row: { documentJson: unknown; documentDigest: string },
  ): LayoutDocumentV1 {
    const document = LayoutDocumentCodecV1.parseAndNormalize(row.documentJson, scope);
    const encoded = LayoutDocumentCodecV1.encode(document);
    if (encoded.digest !== row.documentDigest) serviceError("LAYOUT_DOCUMENT_DIGEST_MISMATCH", 409);
    return encoded.value;
  }

  private parseRevisionDocument(
    scope: VersionScopeV1,
    row: { documentJson: unknown; documentDigest: string; schemaVersion: number },
  ): LayoutDocumentV1 {
    if (row.schemaVersion !== 1) serviceError("LAYOUT_REVISION_NOT_SUPPORTED", 409);
    return this.parseWorkingCopyDocument(scope, row);
  }

  private assertWorkingCopyExpectation(
    row: { rowVersion: number; documentDigest: string },
    expectedRowVersion: number,
    expectedDocumentDigest: string,
  ): void {
    if (row.rowVersion !== expectedRowVersion || row.documentDigest !== expectedDocumentDigest) {
      serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409, {
        currentRowVersion: row.rowVersion,
        currentDocumentDigest: row.documentDigest,
      });
    }
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
  ): LayoutRevisionSummaryV1 {
    const saveReason = row.saveReason === "user_checkpoint"
      || row.saveReason === "export_checkpoint"
      || row.saveReason === "history_restore"
      ? row.saveReason
      : "legacy_import";
    return {
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId,
      revision: row.revision,
      previousRevisionId: row.previousRevisionId,
      contentBasedOnRevisionId: row.contentBasedOnRevisionId,
      documentDigest: asDigest(row.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH"),
      sourceLockSetDigest: row.sourceLockSetDigest
        ? asDigest(row.sourceLockSetDigest, "LAYOUT_SOURCE_DIGEST_MISMATCH")
        : null,
      saveReason,
      sourceResolution: this.sourceResolution(current, row.layoutSourceBindingsByLayoutRevision ?? []),
      createdAt: row.createdAt.toISOString(),
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
  ): Promise<LayoutRevisionDetailV1> {
    if (!row.bindingSetSealedAt) serviceError("LAYOUT_REVISION_NOT_FOUND", 404);
    const bindings = row.layoutSourceBindingsByLayoutRevision
      ?? await reader.layoutSourceBinding.findMany({
        where: { layoutRevisionId: row.id },
        orderBy: { order: "asc" },
      });
    return {
      ...this.toRevisionSummary(current, { ...row, layoutSourceBindingsByLayoutRevision: bindings }),
      document: this.parseRevisionDocument(scope, row),
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
