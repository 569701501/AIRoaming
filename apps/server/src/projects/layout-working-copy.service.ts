import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  canonicalizeJson,
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  generateLayoutPresetV1,
  LayoutDocumentCodecV1,
  LayoutDocumentValidationError,
  LayoutWorkingCopyContractError,
  parseInitializeLayoutWorkingCopyRequestV1,
  parseSaveLayoutWorkingCopyRequestV1,
  projectLayoutSourceBindings,
  type CandidateImageSourceV1,
  type InitializeLayoutWorkingCopyResponseV1,
  type LayoutCanvasV1,
  type LayoutDigest,
  type LayoutDocumentV1,
  type LayoutFontPolicyV1,
  type LayoutImageValidationContextV1,
  type LayoutProfileV1,
  type LayoutSourceCatalogResponseV1,
  type LayoutSourceEvaluation,
  type LayoutTopLevelElementV1,
  type LayoutWorkingCopyResponseV1,
  type SaveLayoutWorkingCopyResponseV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";
import { LayoutFontService } from "./layout-font.service.js";
import {
  LayoutWorkingCopyConflictError,
  resolveLayoutWorkingCopySave,
} from "./layout-working-copy-policy.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

type Reader = Prisma.TransactionClient | PrismaClient;

interface ReadyLayoutSource {
  order: number;
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  assetSha256: LayoutDigest;
  width: number;
  height: number;
}

class LayoutWorkingCopyServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "LayoutWorkingCopyServiceError";
  }
}

function serviceError(code: string, status: number, details?: unknown): never {
  throw new LayoutWorkingCopyServiceError(code, status, details);
}

function asDigest(value: string | null, code: string): LayoutDigest {
  if (!value || !/^sha256:[0-9a-f]{64}$/.test(value)) serviceError(code, 422);
  return value as LayoutDigest;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function collectFontAssetIds(document: LayoutDocumentV1): string[] {
  const result = [
    document.fontPolicy.defaultFontAssetId,
    ...document.fontPolicy.fallbackFontAssetIds,
  ];
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type !== "text" && element.type !== "balloon") continue;
      for (const paragraph of element.richText.paragraphs) {
        for (const run of paragraph.runs) result.push(run.fontAssetId);
      }
    }
  }
  return unique(result);
}

function sourceIdentity(source: CandidateImageSourceV1): string {
  return canonicalizeJson(source);
}

function sourceGeometryByElement(document: LayoutDocumentV1): Map<string, string> {
  const result = new Map<string, string>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type === "panel_frame" && element.contentImage) {
        result.set(element.contentImage.id, canonicalizeJson({
          frame: element.transform,
          crop: element.contentImage.crop,
        }));
      } else if (element.type === "free_image") {
        result.set(element.id, canonicalizeJson({
          frame: element.transform,
          display: element.display,
        }));
      }
    }
  }
  return result;
}

function profileInsets(profile: LayoutProfileV1) {
  return profile.kind === "paged"
    ? profile.safeArea
    : {
        top: 64,
        right: profile.safeInsetX,
        bottom: 64,
        left: profile.safeInsetX,
      };
}

function blankCanvas(profile: LayoutProfileV1, index: number): LayoutCanvasV1 {
  return {
    id: profile.kind === "paged" ? `page_${index + 1}` : `section_${index + 1}`,
    kind: profile.kind === "paged" ? "page" : "strip_section",
    name: profile.kind === "paged" ? `第 ${index + 1} 页` : `第 ${index + 1} 段`,
    width: profile.width,
    height: profile.kind === "paged" ? profile.height : profile.defaultSectionHeight,
    backgroundColor: "#FFFFFFFF",
    panelReadingOrder: [],
    elements: [],
  };
}

function presetIdForCount(count: number): "single" | "two_horizontal" | "three_focus" | "four_panel" {
  if (count === 1) return "single";
  if (count === 2) return "two_horizontal";
  if (count === 3) return "three_focus";
  return "four_panel";
}

function attachSources(
  panels: LayoutTopLevelElementV1[],
  sources: readonly ReadyLayoutSource[],
): LayoutTopLevelElementV1[] {
  return panels.map((element, index) => {
    if (element.type !== "panel_frame") return element;
    const source = sources[index]!;
    const unsigned = {
      shotId: source.shotId,
      candidateId: source.candidateId,
      candidateLockRevisionId: source.candidateLockRevisionId,
      assetId: source.assetId,
    };
    return {
      ...element,
      contentImage: {
        id: `image_${source.shotId}`,
        type: "image",
        placement: "panel_content",
        name: `镜头 ${source.shotId}`,
        locked: false,
        hidden: false,
        source: {
          ...unsigned,
          sourceDigest: digestCandidateImageSourceV1(unsigned, source.assetSha256),
        },
        crop: {
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          flipX: false,
          flipY: false,
        },
      },
    };
  });
}

function makeInitialDocument(input: {
  scope: VersionScopeV1;
  comicFormat: LayoutDocumentV1["comicFormat"];
  profile: LayoutProfileV1;
  fontPolicy: LayoutFontPolicyV1;
  mode: "default_storyboard_layout" | "blank";
  sources: readonly ReadyLayoutSource[];
}): LayoutDocumentV1 {
  const canvases: LayoutCanvasV1[] = [];
  if (input.mode === "blank" || input.sources.length === 0) {
    canvases.push(blankCanvas(input.profile, 0));
  } else {
    const groupSize = input.profile.kind === "paged" ? 4 : 1;
    for (let offset = 0; offset < input.sources.length; offset += groupSize) {
      const group = input.sources.slice(offset, offset + groupSize);
      const canvas = blankCanvas(input.profile, canvases.length);
      const panels = generateLayoutPresetV1({
        presetId: presetIdForCount(group.length),
        presetVersion: 1,
        width: canvas.width,
        height: canvas.height,
        inset: profileInsets(input.profile),
        gap: input.profile.kind === "paged" ? 48 : 0,
        panelIds: group.map((source) => `panel_${source.shotId}`),
      });
      canvas.elements = attachSources(panels, group);
      canvas.panelReadingOrder = panels.map((panel) => panel.id);
      canvases.push(canvas);
    }
  }
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: input.scope.projectId,
    chapterId: input.scope.chapterId,
    comicFormat: input.comicFormat,
    profile: input.profile,
    fontPolicy: input.fontPolicy,
    canvases,
  };
}

@Injectable()
export class LayoutWorkingCopyService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(CandidateSourceQueryService) private readonly candidateSources: CandidateSourceQueryService,
    @Inject(LayoutFontService) private readonly layoutFonts: LayoutFontService,
  ) {}

  async get(scope: VersionScopeV1): Promise<LayoutWorkingCopyResponseV1> {
    return this.execute(() => this.prismaService.runReadTransaction(async (tx) => {
      const row = await tx.layoutWorkingCopy.findFirst({
        where: { chapterId: scope.chapterId, projectId: scope.projectId },
      });
      if (!row) serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
      if (row.documentKind !== "layout_document_v1") {
        serviceError("LAYOUT_WORKING_COPY_EXISTS", 409, { documentKind: row.documentKind });
      }
      return this.toResponse(scope, row, tx);
    }));
  }

  async sourceCatalog(scope: VersionScopeV1): Promise<LayoutSourceCatalogResponseV1> {
    return this.execute(() => this.prismaService.runReadTransaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({
        where: { id: scope.chapterId, projectId: scope.projectId },
        select: { currentStoryboardVersionId: true },
      });
      if (!chapter) serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
      const sourceState = await this.candidateSources.get(scope, tx);
      if (
        sourceState.candidateLockSet.state !== "complete"
        || sourceState.candidateLockSet.sourceApplicability !== "current"
        || !sourceState.candidateLockSet.digest
      ) {
        serviceError("LAYOUT_LOCK_SET_INCOMPLETE", 409, {
          reasonCodes: sourceState.gates.buildLayoutWorkingCopy.reasonCodes,
        });
      }
      const sources = await this.readReadySources(scope, chapter.currentStoryboardVersionId, tx);
      return {
        schemaVersion: 1,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        sourceLockSetDigest: asDigest(
          sourceState.candidateLockSet.digest,
          "LAYOUT_SOURCE_DIGEST_MISMATCH",
        ),
        items: sources.map((source) => {
          const unsigned = {
            shotId: source.shotId,
            candidateId: source.candidateId,
            candidateLockRevisionId: source.candidateLockRevisionId,
            assetId: source.assetId,
          };
          return {
            order: source.order,
            source: {
              ...unsigned,
              sourceDigest: digestCandidateImageSourceV1(unsigned, source.assetSha256),
            },
            width: source.width,
            height: source.height,
          };
        }),
      };
    }));
  }

  async initialize(scope: VersionScopeV1, input: unknown): Promise<InitializeLayoutWorkingCopyResponseV1> {
    return this.execute(async () => {
      const request = parseInitializeLayoutWorkingCopyRequestV1(input);
      const fontCatalog = await this.layoutFonts.ensureReady(scope);
      const defaultFont = fontCatalog.find((item) => item.metadata.face.weight === 400 && item.metadata.face.style === "normal");
      if (!defaultFont) serviceError("LAYOUT_FONT_REFERENCE_INVALID", 422);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const existing = await tx.layoutWorkingCopy.findUnique({ where: { chapterId: scope.chapterId } });
        if (existing) {
          if (existing.projectId !== scope.projectId || existing.documentKind !== "layout_document_v1") {
            serviceError("LAYOUT_WORKING_COPY_EXISTS", 409, { documentKind: existing.documentKind });
          }
          return {
            schemaVersion: 1,
            result: "existing",
            value: await this.toResponse(scope, existing, tx),
          };
        }

        const chapter = await tx.chapter.findFirst({
          where: { id: scope.chapterId, projectId: scope.projectId },
          include: { project: true },
        });
        if (!chapter) serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
        if (chapter.project.lifecycleStatus !== "active") serviceError("LAYOUT_PROJECT_NOT_ACTIVE", 409);
        if (chapter.currentLayoutRevisionId !== request.expectedCurrentLayoutRevisionId) {
          serviceError("LAYOUT_EXPECTED_CURRENT_REVISION_MISMATCH", 409, {
            currentLayoutRevisionId: chapter.currentLayoutRevisionId,
          });
        }
        const comicFormat = chapter.project.comicFormat;
        if (comicFormat !== "paged_comic" && comicFormat !== "vertical_scroll") {
          serviceError("LAYOUT_COMIC_FORMAT_IMMUTABLE", 409);
        }
        if (
          (comicFormat === "paged_comic" && request.profile.kind !== "paged")
          || (comicFormat === "vertical_scroll" && request.profile.kind !== "vertical_strip")
        ) {
          serviceError("LAYOUT_PROFILE_FORMAT_MISMATCH", 400);
        }

        const sourceState = await this.candidateSources.get(scope, tx);
        if (!sourceState.gates.buildLayoutWorkingCopy.allowed) {
          serviceError("LAYOUT_LOCK_SET_INCOMPLETE", 409, {
            reasonCodes: sourceState.gates.buildLayoutWorkingCopy.reasonCodes,
          });
        }
        const sources = await this.readReadySources(scope, chapter.currentStoryboardVersionId, tx);
        const document = makeInitialDocument({
          scope,
          comicFormat,
          profile: request.profile,
          fontPolicy: { defaultFontAssetId: defaultFont.assetId, fallbackFontAssetIds: [] },
          mode: request.initializationMode,
          sources,
        });
        const imageByAssetId = Object.fromEntries(sources.map((source) => [source.assetId, {
          width: source.width,
          height: source.height,
          sha256: source.assetSha256,
          ready: true,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          shotId: source.shotId,
          candidateId: source.candidateId,
          candidateLockRevisionId: source.candidateLockRevisionId,
        } satisfies LayoutImageValidationContextV1]));
        const encoded = LayoutDocumentCodecV1.encode(document, {
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          comicFormat,
          imageByAssetId,
        });
        const activeShotIds = sources.map((source) => source.shotId);
        const sourceLockSetDigest = digestLayoutSourceLockSet(encoded.value, activeShotIds);
        if (
          request.initializationMode === "default_storyboard_layout"
          && sourceLockSetDigest !== sourceState.candidateLockSet.digest
        ) {
          serviceError("LAYOUT_SOURCE_DIGEST_MISMATCH", 409);
        }
        const now = new Date();
        const created = await tx.layoutWorkingCopy.create({
          data: {
            id: `layout_wc_${randomUUID()}`,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            documentKind: "layout_document_v1",
            documentJson: encoded.value as unknown as Prisma.InputJsonValue,
            schemaVersion: 1,
            documentDigest: encoded.digest,
            sourceLockSetDigest,
            basedOnRevisionId: chapter.currentLayoutRevisionId,
            rowVersion: 0,
            createdAt: now,
            updatedAt: now,
          },
        });
        return {
          schemaVersion: 1,
          result: "created",
          value: await this.toResponse(scope, created, tx),
        };
      });
    });
  }

  async save(scope: VersionScopeV1, input: unknown): Promise<SaveLayoutWorkingCopyResponseV1> {
    return this.execute(async () => {
      const structural = parseSaveLayoutWorkingCopyRequestV1(input, {
        projectId: scope.projectId,
        chapterId: scope.chapterId,
      });
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const [project, existing] = await Promise.all([
          tx.project.findUnique({ where: { id: scope.projectId } }),
          tx.layoutWorkingCopy.findFirst({ where: { projectId: scope.projectId, chapterId: scope.chapterId } }),
        ]);
        if (!project || project.lifecycleStatus !== "active") serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
        if (!existing) serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
        if (existing.documentKind !== "layout_document_v1") {
          serviceError("LAYOUT_WORKING_COPY_EXISTS", 409, { documentKind: existing.documentKind });
        }
        const comicFormat = project.comicFormat;
        if (comicFormat !== "paged_comic" && comicFormat !== "vertical_scroll") {
          serviceError("LAYOUT_COMIC_FORMAT_IMMUTABLE", 409);
        }
        const encoded = LayoutDocumentCodecV1.encode(structural.document, {
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          comicFormat,
        });
        const decision = resolveLayoutWorkingCopySave({
          currentRowVersion: existing.rowVersion,
          currentDocumentDigest: existing.documentDigest,
          expectedRowVersion: structural.expectedRowVersion,
          baseDocumentDigest: structural.baseDocumentDigest,
          nextDocumentDigest: encoded.digest,
        });
        if (decision.result !== "update") {
          return {
            schemaVersion: 1,
            result: decision.result,
            value: await this.toResponse(scope, existing, tx),
          };
        }

        const previous = LayoutDocumentCodecV1.parseAndNormalize(existing.documentJson, {
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          comicFormat,
        });
        const imageByAssetId = await this.validateChangedSources(scope, previous, encoded.value, tx);
        await this.validateChangedFonts(scope, previous, encoded.value, tx);
        const controlled = LayoutDocumentCodecV1.encode(encoded.value, {
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          comicFormat,
          imageByAssetId,
        });
        const activeShots = await tx.shot.findMany({
          where: { projectId: scope.projectId, chapterId: scope.chapterId, lifecycleStatus: "active" },
          select: { id: true },
        });
        let sourceLockSetDigest: LayoutDigest | null;
        try {
          sourceLockSetDigest = digestLayoutSourceLockSet(
            controlled.value,
            activeShots.map((shot) => shot.id),
          );
        } catch {
          serviceError("LAYOUT_SOURCE_UNRESOLVED", 409);
        }
        const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
        const result = await tx.layoutWorkingCopy.updateMany({
          where: {
            id: existing.id,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            rowVersion: existing.rowVersion,
            documentDigest: existing.documentDigest,
          },
          data: {
            documentJson: controlled.value as unknown as Prisma.InputJsonValue,
            documentDigest: controlled.digest,
            sourceLockSetDigest,
            rowVersion: { increment: 1 },
            updatedAt,
          },
        });
        if (result.count !== 1) {
          const current = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: existing.id } });
          throw new LayoutWorkingCopyConflictError(current.rowVersion, current.documentDigest);
        }
        const updated = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: existing.id } });
        return {
          schemaVersion: 1,
          result: "updated",
          value: await this.toResponse(scope, updated, tx),
        };
      });
    });
  }

  private async readReadySources(
    scope: VersionScopeV1,
    storyboardVersionId: string | null,
    reader: Reader,
  ): Promise<ReadyLayoutSource[]> {
    if (!storyboardVersionId) serviceError("LAYOUT_LOCK_SET_INCOMPLETE", 409);
    const projections = await reader.storyboardShotProjection.findMany({
      where: { storyboardVersionId },
      orderBy: { order: "asc" },
      include: {
        shot: {
          include: {
            currentCandidateLockRevision: {
              include: { candidate: { include: { asset: true } } },
            },
          },
        },
      },
    });
    const sources: ReadyLayoutSource[] = [];
    for (const projection of projections) {
      if (projection.shot.lifecycleStatus !== "active") continue;
      const revision = projection.shot.currentCandidateLockRevision;
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
        || !asset.width
        || !asset.height
      ) {
        serviceError("LAYOUT_SOURCE_UNRESOLVED", 409, { shotId: projection.shotId });
      }
      sources.push({
        order: projection.order,
        shotId: projection.shotId,
        candidateId: candidate.id,
        candidateLockRevisionId: revision.id,
        assetId: asset.id,
        assetSha256: asDigest(asset.sha256, "LAYOUT_SOURCE_DIGEST_MISMATCH"),
        width: asset.width,
        height: asset.height,
      });
    }
    return sources;
  }

  private async validateChangedSources(
    scope: VersionScopeV1,
    previous: LayoutDocumentV1,
    next: LayoutDocumentV1,
    reader: Reader,
  ): Promise<Record<string, LayoutImageValidationContextV1>> {
    const previousByElement = new Map(
      projectLayoutSourceBindings(previous).map((binding) => [binding.elementId, binding]),
    );
    const previousGeometry = sourceGeometryByElement(previous);
    const nextGeometry = sourceGeometryByElement(next);
    const changed = projectLayoutSourceBindings(next).filter((binding) => {
      const before = previousByElement.get(binding.elementId);
      return !before
        || sourceIdentity(before) !== sourceIdentity(binding)
        || previousGeometry.get(binding.elementId) !== nextGeometry.get(binding.elementId);
    });
    if (changed.length === 0) return {};
    const rows = await reader.candidateLockRevision.findMany({
      where: { id: { in: unique(changed.map((binding) => binding.candidateLockRevisionId)) } },
      include: { candidate: { include: { asset: true } } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const context: Record<string, LayoutImageValidationContextV1> = {};
    for (const binding of changed) {
      const revision = byId.get(binding.candidateLockRevisionId);
      const candidate = revision?.candidate;
      const asset = candidate?.asset;
      if (
        !revision
        || revision.projectId !== scope.projectId
        || revision.chapterId !== scope.chapterId
        || revision.shotId !== binding.shotId
        || !["lock", "replace"].includes(revision.action)
        || candidate?.id !== binding.candidateId
        || candidate.assetId !== binding.assetId
        || candidate.status !== "generated"
        || asset?.status !== "ready"
        || !asset.sha256
        || !asset.width
        || !asset.height
      ) {
        serviceError("LAYOUT_ASSET_NOT_READY", 422, { elementId: binding.elementId });
      }
      const assetDigest = asDigest(asset.sha256, "LAYOUT_SOURCE_DIGEST_MISMATCH");
      const expected = digestCandidateImageSourceV1({
        shotId: binding.shotId,
        candidateId: binding.candidateId,
        candidateLockRevisionId: binding.candidateLockRevisionId,
        assetId: binding.assetId,
      }, assetDigest);
      if (binding.sourceDigest !== expected) {
        serviceError("LAYOUT_SOURCE_DIGEST_MISMATCH", 409, { elementId: binding.elementId });
      }
      context[binding.assetId] = {
        width: asset.width,
        height: asset.height,
        sha256: assetDigest,
        ready: true,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        shotId: binding.shotId,
        candidateId: binding.candidateId,
        candidateLockRevisionId: binding.candidateLockRevisionId,
      };
    }
    return context;
  }

  private async validateChangedFonts(
    scope: VersionScopeV1,
    previous: LayoutDocumentV1,
    next: LayoutDocumentV1,
    reader: Reader,
  ): Promise<void> {
    void previous;
    await this.layoutFonts.validateReferences(scope, collectFontAssetIds(next), reader);
  }

  private async toResponse(
    scope: VersionScopeV1,
    row: {
      id: string;
      projectId: string;
      chapterId: string;
      documentJson: unknown;
      documentDigest: string;
      sourceLockSetDigest: string | null;
      basedOnRevisionId: string | null;
      rowVersion: number;
      updatedAt: Date;
    },
    reader: Reader,
  ): Promise<LayoutWorkingCopyResponseV1> {
    const document = LayoutDocumentCodecV1.parseAndNormalize(row.documentJson, {
      projectId: scope.projectId,
      chapterId: scope.chapterId,
    });
    const encoded = LayoutDocumentCodecV1.encode(document);
    if (encoded.digest !== row.documentDigest) serviceError("LAYOUT_DOCUMENT_DIGEST_MISMATCH", 409);
    const sourceState = await this.candidateSources.get(scope, reader);
    const sourceEvaluation: LayoutSourceEvaluation | undefined =
      sourceState.layoutWorkingCopy?.id === row.id
        ? sourceState.layoutWorkingCopy.source
        : undefined;
    if (!sourceEvaluation) serviceError("LAYOUT_SOURCE_UNRESOLVED", 409);
    return {
      schemaVersion: 1,
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId,
      document,
      documentDigest: asDigest(row.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH"),
      sourceLockSetDigest: row.sourceLockSetDigest === null
        ? null
        : asDigest(row.sourceLockSetDigest, "LAYOUT_SOURCE_DIGEST_MISMATCH"),
      basedOnRevisionId: row.basedOnRevisionId,
      rowVersion: row.rowVersion,
      saveState: "saved",
      sourceEvaluation,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      if (!this.prismaService.isDatabaseMode()) serviceError("LAYOUT_DB_ONLY_REQUIRED", 409);
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof LayoutWorkingCopyConflictError) {
        throw new HttpException({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              currentRowVersion: error.currentRowVersion,
              currentDocumentDigest: error.currentDocumentDigest,
            },
          },
        }, error.status);
      }
      if (error instanceof LayoutWorkingCopyServiceError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.message, details: error.details },
        }, error.status);
      }
      if (error instanceof LayoutDocumentValidationError) {
        const code = error.code === "LAYOUT_DOCUMENT_TOO_LARGE"
          ? "LAYOUT_DOCUMENT_TOO_LARGE"
          : "LAYOUT_BODY_INVALID";
        throw new HttpException({
          success: false,
          error: { code, message: error.message },
        }, error.httpStatus);
      }
      if (error instanceof LayoutWorkingCopyContractError) {
        const mismatch = /documentDigest.*does not match/i.test(error.message);
        throw new HttpException({
          success: false,
          error: {
            code: mismatch ? "LAYOUT_DOCUMENT_DIGEST_MISMATCH" : error.code,
            message: error.message,
          },
        }, mismatch ? 409 : 400);
      }
      throw error;
    }
  }
}
