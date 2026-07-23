import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV2,
  PendingEditorCommandContractError,
  applyLayoutCommandBatch,
  applyLayoutCommandBatchV2,
  buildPendingEditorCommandSetV1,
  buildPendingEditorCommandSetV2,
  digestCanonicalJson,
  parseCreatePendingEditorCommandSetRequestV1,
  parsePendingEditorCommandSetV1,
  parsePendingEditorCommandSetV2,
  pendingEditorSourceProjectionUnchangedV1,
  pendingEditorSourceProjectionUnchangedV2,
  type ApplyPendingEditorCommandResponseV1OrV2,
  type DiscardPendingEditorCommandResponseV1,
  type EditorCommandBatchV1,
  type EditorCommandBatchV2,
  type LayoutDocumentV1,
  type LayoutDocumentV1OrV2,
  type LayoutDocumentV2,
  type LayoutDigest,
  type PendingEditorCommandCurrentResponseV1OrV2,
  type PendingEditorCommandPreviewV1,
  type PendingEditorCommandPreviewV1OrV2,
  type PendingEditorCommandPreviewV2,
  type PendingEditorCommandSetV1,
  type PendingEditorCommandSetV1OrV2,
  type PendingEditorCommandSetV2,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { LayoutWorkingCopyService } from "./layout-working-copy.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

export class LayoutPendingCommandServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "LayoutPendingCommandServiceError";
  }
}

function serviceError(code: string, status: number, details?: unknown): never {
  throw new LayoutPendingCommandServiceError(code, status, details);
}

const SOURCE_MUTATING_COMMANDS = new Set([
  "panel.attach_image",
  "panel.detach_image_to_free",
  "image.replace_source",
  "layout.replace_sources",
]);

function assertNoSourceMutation(batch: EditorCommandBatchV1 | EditorCommandBatchV2): void {
  if (batch.commands.some((command) => SOURCE_MUTATING_COMMANDS.has(command.type))) {
    serviceError("LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED", 409);
  }
}

function collectFontAssetIds(document: LayoutDocumentV1OrV2): string[] {
  const result = new Set<string>([
    document.fontPolicy.defaultFontAssetId,
    ...document.fontPolicy.fallbackFontAssetIds,
  ]);
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type !== "text" && element.type !== "balloon") continue;
      for (const paragraph of element.richText.paragraphs) {
        for (const run of paragraph.runs) result.add(run.fontAssetId);
      }
    }
  }
  return [...result];
}

export interface CreatePendingEditorCommandSetFromCompositionV2 {
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: LayoutDigest;
  selectionElementIds: string[];
  summary: string;
  warnings: string[];
  commandBatch: EditorCommandBatchV2;
}

function fontEmbeddingAllowed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const license = (metadata as Record<string, unknown>).license;
  return Boolean(license && typeof license === "object" && !Array.isArray(license)
    && (license as Record<string, unknown>).embeddingAllowed === true);
}

@Injectable()
export class LayoutPendingCommandService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LayoutWorkingCopyService) private readonly workingCopies: LayoutWorkingCopyService,
  ) {}

  async create(scope: VersionScopeV1, input: unknown): Promise<PendingEditorCommandPreviewV1> {
    return this.execute(async () => {
      const request = parseCreatePendingEditorCommandSetRequestV1(input);
      assertNoSourceMutation(request.commandBatch);
      return this.prismaService.runBusinessTransaction(async (tx) => {
        const [chapter, workingCopy] = await Promise.all([
          tx.chapter.findFirst({ where: { id: scope.chapterId, projectId: scope.projectId }, select: { id: true } }),
          tx.layoutWorkingCopy.findFirst({ where: { projectId: scope.projectId, chapterId: scope.chapterId } }),
        ]);
        if (!chapter || !workingCopy || workingCopy.documentKind !== "layout_document_v1") {
          serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
        }
        if (
          workingCopy.rowVersion !== request.expectedWorkingCopyRowVersion
          || workingCopy.documentDigest !== request.expectedDocumentDigest
        ) {
          serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409, {
            currentRowVersion: workingCopy.rowVersion,
            currentDocumentDigest: workingCopy.documentDigest,
          });
        }
        const document = LayoutDocumentCodecV1.parseAndNormalize(workingCopy.documentJson, scope);
        const built = buildPendingEditorCommandSetV1({
          workingCopyId: workingCopy.id,
          expectedRowVersion: workingCopy.rowVersion,
          baseDocumentDigest: request.expectedDocumentDigest,
          sourceLockSetDigest: workingCopy.sourceLockSetDigest as PendingEditorCommandSetV1["sourceLockSetDigest"],
          selectionElementIds: request.selectionElementIds,
          summary: request.summary,
          warnings: request.warnings,
          commandBatch: request.commandBatch,
          document,
        });
        const { resultDocument, ...payload } = built;
        if (!pendingEditorSourceProjectionUnchangedV1(document, resultDocument)) {
          serviceError("LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED", 409);
        }
        await this.assertFontsReady(scope, resultDocument, tx);
        const now = new Date();
        const activeSlotKey = `layout-command:${scope.chapterId}`;
        const existing = await tx.pendingDialogueArtifact.findUnique({ where: { activeSlotKey } });
        if (existing) {
          await tx.pendingDialogueArtifact.update({
            where: { id: existing.id },
            data: { status: "superseded", activeSlotKey: null, resolvedAt: now, updatedAt: now },
          });
        }
        const thread = await tx.conversationThread.upsert({
          where: {
            projectId_stepKey_scopeKey: {
              projectId: scope.projectId,
              stepKey: "layout_export",
              scopeKey: `chapter:${scope.chapterId}`,
            },
          },
          create: {
            id: `dialogue_thread_${randomUUID()}`,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            stepKey: "layout_export",
            scopeKey: `chapter:${scope.chapterId}`,
            title: "漫画成稿",
            status: "active",
            createdAt: now,
            updatedAt: now,
          },
          update: { updatedAt: now },
        });
        const row = await tx.pendingDialogueArtifact.create({
          data: {
            id: `layout_pending_${randomUUID()}`,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            threadId: thread.id,
            kind: "layout_editor_command_set",
            status: "pending",
            activeSlotKey,
            payloadJson: payload as unknown as Prisma.InputJsonValue,
            schemaVersion: 1,
            payloadDigest: digestCanonicalJson(payload),
            sourceMessageId: null,
            toolResultId: null,
            createdAt: now,
            updatedAt: now,
            resolvedAt: null,
          },
        });
        return this.toPreview(row, payload, resultDocument) as PendingEditorCommandPreviewV1;
      });
    });
  }

  async createFromCompositionInTransaction(
    scope: VersionScopeV1,
    input: CreatePendingEditorCommandSetFromCompositionV2,
    tx: Prisma.TransactionClient,
  ): Promise<PendingEditorCommandPreviewV2> {
    assertNoSourceMutation(input.commandBatch);
    const [chapter, workingCopy] = await Promise.all([
      tx.chapter.findFirst({
        where: { id: scope.chapterId, projectId: scope.projectId },
        select: { id: true },
      }),
      tx.layoutWorkingCopy.findFirst({
        where: { projectId: scope.projectId, chapterId: scope.chapterId },
      }),
    ]);
    if (!chapter || !workingCopy || workingCopy.documentKind !== "layout_document_v2") {
      serviceError("LAYOUT_WORKING_COPY_NOT_FOUND", 404);
    }
    if (
      workingCopy.rowVersion !== input.expectedWorkingCopyRowVersion
      || workingCopy.documentDigest !== input.expectedDocumentDigest
    ) {
      serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409, {
        currentRowVersion: workingCopy.rowVersion,
        currentDocumentDigest: workingCopy.documentDigest,
      });
    }
    const document = LayoutDocumentCodecV2.parseAndNormalize(workingCopy.documentJson, scope);
    const built = buildPendingEditorCommandSetV2({
      workingCopyId: workingCopy.id,
      expectedRowVersion: workingCopy.rowVersion,
      baseDocumentDigest: input.expectedDocumentDigest,
      sourceLockSetDigest: workingCopy.sourceLockSetDigest as PendingEditorCommandSetV2["sourceLockSetDigest"],
      selectionElementIds: input.selectionElementIds,
      summary: input.summary,
      warnings: input.warnings,
      commandBatch: input.commandBatch,
      document,
    });
    const { resultDocument, ...payload } = built;
    if (!pendingEditorSourceProjectionUnchangedV2(document, resultDocument)) {
      serviceError("LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED", 409);
    }
    await this.assertFontsReady(scope, resultDocument, tx);
    const now = new Date();
    const activeSlotKey = `layout-command:${scope.chapterId}`;
    const existing = await tx.pendingDialogueArtifact.findUnique({ where: { activeSlotKey } });
    if (existing) {
      await tx.pendingDialogueArtifact.update({
        where: { id: existing.id },
        data: {
          status: "superseded",
          activeSlotKey: null,
          resolvedAt: now,
          updatedAt: now,
        },
      });
    }
    const thread = await tx.conversationThread.upsert({
      where: {
        projectId_stepKey_scopeKey: {
          projectId: scope.projectId,
          stepKey: "layout_export",
          scopeKey: `chapter:${scope.chapterId}`,
        },
      },
      create: {
        id: `dialogue_thread_${randomUUID()}`,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        stepKey: "layout_export",
        scopeKey: `chapter:${scope.chapterId}`,
        title: "漫画成稿",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      update: { updatedAt: now },
    });
    const row = await tx.pendingDialogueArtifact.create({
      data: {
        id: `layout_pending_${randomUUID()}`,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        threadId: thread.id,
        kind: "layout_editor_command_set",
        status: "pending",
        activeSlotKey,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        schemaVersion: 2,
        payloadDigest: digestCanonicalJson(payload),
        sourceMessageId: null,
        toolResultId: null,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      },
    });
    return this.toPreview(row, payload, resultDocument) as PendingEditorCommandPreviewV2;
  }

  async current(scope: VersionScopeV1): Promise<PendingEditorCommandCurrentResponseV1OrV2> {
    return this.execute(async () => {
      const result = await this.prismaService.runBusinessTransaction(async (tx) => {
        const row = await tx.pendingDialogueArtifact.findUnique({
          where: { activeSlotKey: `layout-command:${scope.chapterId}` },
        });
        if (!row || row.projectId !== scope.projectId || row.chapterId !== scope.chapterId || row.kind !== "layout_editor_command_set") {
          return { item: null } as const;
        }
        const payload = this.parseStoredPayload(row.payloadJson, row.payloadDigest);
        const workingCopy = await tx.layoutWorkingCopy.findFirst({
          where: { id: payload.workingCopyId, projectId: scope.projectId, chapterId: scope.chapterId },
        });
        if (!workingCopy || !this.isFresh(workingCopy, payload)) {
          const now = new Date();
          await tx.pendingDialogueArtifact.update({
            where: { id: row.id },
            data: { status: "expired", activeSlotKey: null, resolvedAt: now, updatedAt: now },
          });
          return { item: null } as const;
        }
        const document = payload.schemaVersion === 1
          ? LayoutDocumentCodecV1.parseAndNormalize(workingCopy.documentJson, scope)
          : LayoutDocumentCodecV2.parseAndNormalize(workingCopy.documentJson, scope);
        const resultDocument = payload.schemaVersion === 1
          ? applyLayoutCommandBatch(document as LayoutDocumentV1, payload.commandBatch).document
          : applyLayoutCommandBatchV2(document as LayoutDocumentV2, payload.commandBatch).document;
        const sourceUnchanged = payload.schemaVersion === 1
          ? pendingEditorSourceProjectionUnchangedV1(
              document as LayoutDocumentV1,
              resultDocument as LayoutDocumentV1,
            )
          : pendingEditorSourceProjectionUnchangedV2(
              document as LayoutDocumentV2,
              resultDocument as LayoutDocumentV2,
            );
        if (!sourceUnchanged) serviceError("LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED", 409);
        const resultDigest = payload.schemaVersion === 1
          ? LayoutDocumentCodecV1.encode(resultDocument).digest
          : LayoutDocumentCodecV2.encode(resultDocument).digest;
        if (resultDigest !== payload.resultDocumentDigest) serviceError("LAYOUT_PENDING_COMMAND_INVALID", 409);
        return { item: this.toPreview(row, payload, resultDocument) } as const;
      });
      return { schemaVersion: 1, item: result.item };
    });
  }

  async apply(
    scope: VersionScopeV1,
    pendingId: string,
  ): Promise<ApplyPendingEditorCommandResponseV1OrV2> {
    return this.execute(async () => {
      const result = await this.prismaService.runBusinessTransaction(async (tx) => {
        const row = await tx.pendingDialogueArtifact.findFirst({
          where: {
            id: pendingId,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            kind: "layout_editor_command_set",
            status: "pending",
          },
        });
        if (!row) serviceError("LAYOUT_PENDING_COMMAND_NOT_FOUND", 404);
        const payload = this.parseStoredPayload(row.payloadJson, row.payloadDigest);
        assertNoSourceMutation(payload.commandBatch);
        const workingCopy = await tx.layoutWorkingCopy.findFirst({
          where: { id: payload.workingCopyId, projectId: scope.projectId, chapterId: scope.chapterId },
        });
        if (!workingCopy || !this.isFresh(workingCopy, payload)) {
          const now = new Date();
          await tx.pendingDialogueArtifact.update({
            where: { id: row.id },
            data: { status: "expired", activeSlotKey: null, resolvedAt: now, updatedAt: now },
          });
          return { expired: true as const };
        }
        const previousDocument = payload.schemaVersion === 1
          ? LayoutDocumentCodecV1.parseAndNormalize(workingCopy.documentJson, scope)
          : LayoutDocumentCodecV2.parseAndNormalize(workingCopy.documentJson, scope);
        const appliedDocument = payload.schemaVersion === 1
          ? applyLayoutCommandBatch(
              previousDocument as LayoutDocumentV1,
              payload.commandBatch,
            ).document
          : applyLayoutCommandBatchV2(
              previousDocument as LayoutDocumentV2,
              payload.commandBatch,
            ).document;
        const sourceUnchanged = payload.schemaVersion === 1
          ? pendingEditorSourceProjectionUnchangedV1(
              previousDocument as LayoutDocumentV1,
              appliedDocument as LayoutDocumentV1,
            )
          : pendingEditorSourceProjectionUnchangedV2(
              previousDocument as LayoutDocumentV2,
              appliedDocument as LayoutDocumentV2,
            );
        if (!sourceUnchanged) serviceError("LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED", 409);
        const encoded = payload.schemaVersion === 1
          ? LayoutDocumentCodecV1.encode(appliedDocument, scope)
          : LayoutDocumentCodecV2.encode(appliedDocument, scope);
        if (encoded.digest !== payload.resultDocumentDigest) serviceError("LAYOUT_PENDING_COMMAND_INVALID", 409);
        await this.assertFontsReady(scope, encoded.value, tx);
        if (encoded.digest !== workingCopy.documentDigest) {
          const updatedAt = new Date(Math.max(Date.now(), workingCopy.updatedAt.getTime() + 1));
          const updatedCount = await tx.layoutWorkingCopy.updateMany({
            where: {
              id: workingCopy.id,
              projectId: scope.projectId,
              chapterId: scope.chapterId,
              rowVersion: workingCopy.rowVersion,
              documentDigest: workingCopy.documentDigest,
            },
            data: {
              documentJson: encoded.value as unknown as Prisma.InputJsonValue,
              documentDigest: encoded.digest,
              rowVersion: { increment: 1 },
              updatedAt,
            },
          });
          if (updatedCount.count !== 1) serviceError("LAYOUT_WORKING_COPY_CONFLICT", 409);
        }
        const now = new Date();
        await tx.pendingDialogueArtifact.update({
          where: { id: row.id },
          data: { status: "applied", activeSlotKey: null, resolvedAt: now, updatedAt: now },
        });
        const updated = await tx.layoutWorkingCopy.findUniqueOrThrow({ where: { id: workingCopy.id } });
        return {
          expired: false as const,
          response: {
            schemaVersion: payload.schemaVersion,
            pendingId: row.id,
            appliedBatch: payload.commandBatch,
            previousDocument,
            workingCopy: await this.workingCopies.responseForReader(scope, updated, tx),
          } as ApplyPendingEditorCommandResponseV1OrV2,
        };
      });
      if (result.expired) serviceError("LAYOUT_PENDING_COMMAND_EXPIRED", 409);
      return result.response;
    });
  }

  async discard(scope: VersionScopeV1, pendingId: string): Promise<DiscardPendingEditorCommandResponseV1> {
    return this.execute(async () => this.prismaService.runBusinessTransaction(async (tx) => {
      const row = await tx.pendingDialogueArtifact.findFirst({
        where: {
          id: pendingId,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          kind: "layout_editor_command_set",
          status: "pending",
        },
      });
      if (!row) serviceError("LAYOUT_PENDING_COMMAND_NOT_FOUND", 404);
      const now = new Date();
      await tx.pendingDialogueArtifact.update({
        where: { id: row.id },
        data: { status: "discarded", activeSlotKey: null, resolvedAt: now, updatedAt: now },
      });
      return { schemaVersion: 1, pendingId: row.id, status: "discarded" };
    }));
  }

  private parseStoredPayload(
    value: unknown,
    claimedDigest: string,
  ): PendingEditorCommandSetV1OrV2 {
    if (digestCanonicalJson(value) !== claimedDigest) serviceError("LAYOUT_PENDING_COMMAND_INVALID", 409);
    const schemaVersion = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).schemaVersion
      : null;
    return schemaVersion === 2
      ? parsePendingEditorCommandSetV2(value)
      : parsePendingEditorCommandSetV1(value);
  }

  private isFresh(
    workingCopy: { id: string; documentKind: string; rowVersion: number; documentDigest: string; sourceLockSetDigest: string | null },
    payload: PendingEditorCommandSetV1OrV2,
  ): boolean {
    return workingCopy.documentKind === (payload.schemaVersion === 1 ? "layout_document_v1" : "layout_document_v2")
      && workingCopy.id === payload.workingCopyId
      && workingCopy.rowVersion === payload.expectedRowVersion
      && workingCopy.documentDigest === payload.baseDocumentDigest
      && workingCopy.sourceLockSetDigest === payload.sourceLockSetDigest;
  }

  private async assertFontsReady(
    scope: VersionScopeV1,
    document: LayoutDocumentV1OrV2,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = collectFontAssetIds(document);
    const assets = await tx.asset.findMany({ where: { id: { in: ids }, projectId: scope.projectId } });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const id of ids) {
      const asset = byId.get(id);
      if (
        !asset
        || (asset.chapterId !== null && asset.chapterId !== scope.chapterId)
        || asset.role !== "layout_font"
        || asset.status !== "ready"
        || !fontEmbeddingAllowed(asset.metadataJson)
      ) {
        serviceError("LAYOUT_FONT_NOT_READY", 422, { assetId: id });
      }
    }
  }

  private toPreview(
    row: { id: string; status: string; createdAt: Date; updatedAt: Date },
    payload: PendingEditorCommandSetV1OrV2,
    resultDocument: LayoutDocumentV1OrV2,
  ): PendingEditorCommandPreviewV1OrV2 {
    if (row.status !== "pending") serviceError("LAYOUT_PENDING_COMMAND_INVALID", 409);
    return {
      schemaVersion: payload.schemaVersion,
      id: row.id,
      status: "pending",
      payload,
      resultDocument,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } as PendingEditorCommandPreviewV1OrV2;
  }

  private async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof LayoutPendingCommandServiceError) {
        throw new HttpException({ success: false, error: { code: error.code, message: error.code, details: error.details } }, error.status);
      }
      if (error instanceof PendingEditorCommandContractError) {
        throw new HttpException({ success: false, error: { code: "LAYOUT_PENDING_COMMAND_INVALID", message: error.message } }, 400);
      }
      if (error instanceof Error && error.name === "LayoutCommandError") {
        throw new HttpException({ success: false, error: { code: "LAYOUT_PENDING_COMMAND_INVALID", message: error.message } }, 400);
      }
      throw error;
    }
  }
}
