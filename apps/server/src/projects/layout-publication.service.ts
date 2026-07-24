import { HttpException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  buildTaskSourceProjection,
  digestCanonicalJson,
  LAYOUT_PUBLICATION_SOURCE_POLICY_V1,
  LAYOUT_PUBLICATION_SOURCE_POLICY_V2,
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV2,
  LayoutPublicationProfileCodecV1,
  parseCreateLayoutPublicationRequestV1OrV2,
  parseLayoutPublicationTaskInputV2,
  projectLayoutDocumentV2ToV1,
  taskSourceProjectionDigest,
  type CreateLayoutPublicationResponseV1,
  type CreateLayoutPublicationResponseV2,
  type CreateLayoutPublicationRequestV1OrV2,
  type GenerationTaskItem,
  type LayoutDigest,
  type LayoutDocumentV1,
  type LayoutDocumentV2,
  type LayoutPublicationHistoryResponseV1,
  type LayoutPublicationHistoryResponseV2,
  type LayoutPublicationSummaryV1,
  type LayoutPublicationSummaryV2,
  type PublicationManifestV1,
  type PublicationManifestV2,
  type RenderAssetManifestV1,
} from "@airoaming/shared";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { PrismaService } from "../persistence/prisma.service.js";
import { PersistentTaskRepository } from "../tasks/persistent-task.repository.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { LayoutRendererService } from "./layout-renderer.service.js";
import { LayoutVersioningService } from "./layout-versioning.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

class LayoutPublicationServiceError extends Error {
  constructor(readonly code: string, readonly status: number, readonly details?: unknown) {
    super(code);
    this.name = "LayoutPublicationServiceError";
  }
}

function publicationError(code: string, status: number, details?: unknown): never {
  throw new LayoutPublicationServiceError(code, status, details);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asDigest(value: string | null, code: string): LayoutDigest {
  if (!value || !/^sha256:[0-9a-f]{64}$/.test(value)) publicationError(code, 409);
  return value as LayoutDigest;
}

export function layoutPublicationIntentMatchesRequest(
  task: { inputSchemaVersion: number | null; inputJson: unknown },
  request: CreateLayoutPublicationRequestV1OrV2,
): boolean {
  const intent = task.inputJson
    && typeof task.inputJson === "object"
    && !Array.isArray(task.inputJson)
    ? task.inputJson as Record<string, unknown>
    : {};
  const acknowledgedIssueKeys = Array.isArray(intent.acknowledgedIssueKeys)
    && intent.acknowledgedIssueKeys.every((value) => typeof value === "string")
    && new Set(intent.acknowledgedIssueKeys).size
      === intent.acknowledgedIssueKeys.length
    ? [...intent.acknowledgedIssueKeys].sort()
    : null;
  const requestedAcknowledgedIssueKeys = request.schemaVersion === 2
    ? [...request.acknowledgedIssueKeys].sort()
    : null;
  return task.inputSchemaVersion === request.schemaVersion
    && intent.schemaVersion === request.schemaVersion
    && (
      request.schemaVersion === 1
      || intent.kind === "layout_publication_task_v2"
    )
    && intent.layoutRevisionId === request.layoutRevisionId
    && intent.profileDigest === request.profileDigest
    && intent.preflightDigest === request.preflightDigest
    && (
      request.schemaVersion === 1
      || (
        intent.revisionDocumentDigest === request.expectedRevisionDocumentDigest
        && intent.visibleDocumentDigest === request.expectedVisibleDocumentDigest
        && acknowledgedIssueKeys !== null
        && JSON.stringify(acknowledgedIssueKeys)
          === JSON.stringify(requestedAcknowledgedIssueKeys)
      )
    );
}

function collectFontAssetIds(document: LayoutDocumentV1 | LayoutDocumentV2): string[] {
  const values = new Set<string>([
    document.fontPolicy.defaultFontAssetId,
    ...document.fontPolicy.fallbackFontAssetIds,
  ]);
  for (const element of document.canvases.flatMap((canvas) => canvas.elements)) {
    if (element.type !== "text" && element.type !== "balloon") continue;
    for (const paragraph of element.richText.paragraphs) {
      for (const run of paragraph.runs) values.add(run.fontAssetId);
    }
  }
  return [...values].sort();
}

@Injectable()
export class LayoutPublicationService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly tasks: PersistentTaskRepository,
    @Inject(LayoutVersioningService) private readonly versioning: LayoutVersioningService,
    @Inject(LayoutRendererService) private readonly renderer: LayoutRendererService,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
  ) {}

  async create(
    scope: VersionScopeV1,
    input: unknown,
  ): Promise<CreateLayoutPublicationResponseV1 | CreateLayoutPublicationResponseV2> {
    return this.execute(async () => {
      const request = parseCreateLayoutPublicationRequestV1OrV2(input);
      const encodedProfile = LayoutPublicationProfileCodecV1.encode(request.profile);
      if (encodedProfile.digest !== request.profileDigest) {
        publicationError("LAYOUT_EXPORT_PROFILE_DIGEST_MISMATCH", 400, { profileDigest: encodedProfile.digest });
      }
      const renderer = await this.renderer.identity();
      const created = await this.prismaService.runBusinessTransaction(async (tx) => {
        const idempotencyKey = `layout-publication:${scope.projectId}:${scope.chapterId}:${request.requestId}`;
        const existingTask = await tx.generationTask.findUnique({ where: { idempotencyKey } });
        if (existingTask) {
          if (!layoutPublicationIntentMatchesRequest(existingTask, request)) {
            publicationError("LAYOUT_EXPORT_IDEMPOTENCY_KEY_REUSED", 409);
          }
          const existingExport = await tx.exportRevision.findUnique({ where: { taskId: existingTask.id } });
          if (!existingExport) publicationError("LAYOUT_EXPORT_TASK_MAPPING_INVALID", 409);
          return { taskId: existingTask.id, exportRevisionId: existingExport.id, result: "replayed" as const };
        }

        const chapter = await tx.chapter.findFirst({
          where: { id: scope.chapterId, projectId: scope.projectId, project: { lifecycleStatus: "active" } },
          select: { id: true, currentLayoutRevisionId: true },
        });
        if (!chapter) publicationError("LAYOUT_EXPORT_REVISION_NOT_CURRENT", 409);
        if (
          request.layoutRevisionId !== request.expectedCurrentLayoutRevisionId
          || chapter.currentLayoutRevisionId !== request.expectedCurrentLayoutRevisionId
        ) publicationError("LAYOUT_EXPORT_REVISION_NOT_CURRENT", 409, { currentLayoutRevisionId: chapter.currentLayoutRevisionId });
        const revision = await tx.layoutRevision.findFirst({
          where: {
            id: request.layoutRevisionId,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            bindingSetSealedAt: { not: null },
          },
        });
        if (!revision) publicationError("LAYOUT_EXPORT_REVISION_NOT_CURRENT", 409);
        if (revision.schemaVersion !== request.schemaVersion) {
          publicationError("LAYOUT_EXPORT_REVISION_SCHEMA_MISMATCH", 409, {
            revisionSchemaVersion: revision.schemaVersion,
            requestSchemaVersion: request.schemaVersion,
          });
        }
        let visibleDocument: LayoutDocumentV1;
        let revisionDocumentDigest: LayoutDigest;
        let visibleDocumentDigest: LayoutDigest;
        if (revision.schemaVersion === 1) {
          const encoded = LayoutDocumentCodecV1.encode(
            LayoutDocumentCodecV1.parseAndNormalize(revision.documentJson, scope),
            scope,
          );
          revisionDocumentDigest = encoded.digest;
          visibleDocumentDigest = asDigest(
            revision.visibleDocumentDigest ?? revision.documentDigest,
            "LAYOUT_DOCUMENT_DIGEST_MISMATCH",
          );
          if (
            revisionDocumentDigest !== revision.documentDigest
            || visibleDocumentDigest !== revisionDocumentDigest
          ) publicationError("LAYOUT_DOCUMENT_DIGEST_MISMATCH", 409);
          visibleDocument = encoded.value;
        } else if (revision.schemaVersion === 2) {
          const encoded = LayoutDocumentCodecV2.encode(revision.documentJson, scope);
          const visible = LayoutDocumentCodecV1.encode(
            projectLayoutDocumentV2ToV1(encoded.value, scope),
            scope,
          );
          revisionDocumentDigest = encoded.digest;
          visibleDocumentDigest = visible.digest;
          if (
            revisionDocumentDigest !== revision.documentDigest
            || visibleDocumentDigest !== revision.visibleDocumentDigest
            || request.schemaVersion !== 2
            || request.expectedRevisionDocumentDigest !== revisionDocumentDigest
            || request.expectedVisibleDocumentDigest !== visibleDocumentDigest
          ) publicationError("LAYOUT_DOCUMENT_DIGEST_MISMATCH", 409);
          visibleDocument = visible.value;
        } else {
          publicationError("LAYOUT_EXPORT_REVISION_SCHEMA_MISMATCH", 409, {
            revisionSchemaVersion: revision.schemaVersion,
          });
        }
        const report = await this.versioning.preflightForReader(scope, {
          schemaVersion: request.schemaVersion,
          target: { kind: "layout_revision", layoutRevisionId: revision.id },
          profile: request.profile,
        }, tx);
        if (report.preflightDigest !== request.preflightDigest) {
          publicationError("LAYOUT_EXPORT_PREFLIGHT_CHANGED", 409, { preflightDigest: report.preflightDigest });
        }
        const blockers = report.issues.filter((issue) => issue.blockingScopes.includes("export"));
        if (blockers.length > 0) {
          publicationError("LAYOUT_EXPORT_PREFLIGHT_BLOCKED", 409, { issueKeys: blockers.map((issue) => issue.issueKey) });
        }
        const allIssueKeys = new Set(report.issues.map((issue) => issue.issueKey));
        const unknown = request.acknowledgedIssueKeys.filter((key) => !allIssueKeys.has(key));
        const acknowledged = new Set(request.acknowledgedIssueKeys);
        const missing = report.issues.filter((issue) => issue.requiresAcknowledgement && !acknowledged.has(issue.issueKey));
        if (unknown.length > 0 || missing.length > 0) {
          publicationError("LAYOUT_EXPORT_WARNING_ACK_INVALID", 400, {
            unknownIssueKeys: unknown,
            missingIssueKeys: missing.map((issue) => issue.issueKey),
          });
        }
        const sourceLockSetDigest = asDigest(revision.sourceLockSetDigest, "LAYOUT_EXPORT_SOURCE_STALE");
        if (report.sourceLockSetDigest !== sourceLockSetDigest || report.currentLockSetDigest !== sourceLockSetDigest) {
          publicationError("LAYOUT_EXPORT_SOURCE_STALE", 409);
        }

        const bindings = await tx.layoutSourceBinding.findMany({
          where: { layoutRevisionId: revision.id },
          select: { candidateLockRevisionId: true, assetId: true },
          orderBy: { order: "asc" },
        });
        const imageAssetIds = [...new Set(bindings.flatMap((binding) => binding.assetId ? [binding.assetId] : []))].sort();
        const candidateLockIds = [...new Set(bindings.flatMap((binding) => binding.candidateLockRevisionId ? [binding.candidateLockRevisionId] : []))].sort();
        if (imageAssetIds.length === 0 || candidateLockIds.length === 0) publicationError("LAYOUT_RENDER_ASSET_INVALID", 422);
        const fontAssetIds = collectFontAssetIds(visibleDocument);
        const assets = await tx.asset.findMany({ where: { id: { in: [...imageAssetIds, ...fontAssetIds] } } });
        const assetById = new Map(assets.map((asset) => [asset.id, asset]));
        const images = imageAssetIds.map((assetId) => {
          const asset = assetById.get(assetId);
          if (!asset || asset.status !== "ready" || !asset.sha256 || !asset.bytes || !asset.width || !asset.height) {
            publicationError("LAYOUT_RENDER_ASSET_INVALID", 422, { assetId });
          }
          return { assetId, role: "candidate_image" as const, mimeType: asset.mimeType, sha256: asDigest(asset.sha256, "LAYOUT_RENDER_ASSET_INVALID"), bytes: asset.bytes, width: asset.width, height: asset.height };
        });
        const fonts = fontAssetIds.map((assetId) => {
          const asset = assetById.get(assetId);
          if (!asset || asset.status !== "ready" || !asset.sha256 || !asset.bytes || !asset.metadataDigest || asset.type !== "font") {
            publicationError("LAYOUT_RENDER_ASSET_INVALID", 422, { assetId });
          }
          return { assetId, role: "font" as const, mimeType: asset.mimeType, sha256: asDigest(asset.sha256, "LAYOUT_RENDER_ASSET_INVALID"), bytes: asset.bytes, metadataDigest: asDigest(asset.metadataDigest, "LAYOUT_RENDER_ASSET_INVALID") };
        });
        const assetManifest: RenderAssetManifestV1 = { schemaVersion: 1, images, fonts };
        const sourceProjection = buildTaskSourceProjection({
          policyVersion: request.schemaVersion === 1
            ? LAYOUT_PUBLICATION_SOURCE_POLICY_V1
            : LAYOUT_PUBLICATION_SOURCE_POLICY_V2,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          consumerType: "layout_export",
          sources: [
            { role: "layout_revision", sourceType: "layout_revision", sourceId: revision.id, sourceDigest: asDigest(revision.documentDigest, "LAYOUT_DOCUMENT_DIGEST_MISMATCH") },
            { role: "lock_set", sourceType: "lock_set", sourceId: scope.chapterId, sourceDigest: sourceLockSetDigest },
            ...candidateLockIds.map((sourceId) => {
              const binding = bindings.find((item) => item.candidateLockRevisionId === sourceId);
              const asset = binding?.assetId ? assetById.get(binding.assetId) : null;
              if (!asset?.sha256) publicationError("LAYOUT_RENDER_ASSET_INVALID", 422);
              return { role: "candidate_lock", sourceType: "candidate_lock_revision", sourceId, sourceDigest: asDigest(asset.sha256, "LAYOUT_RENDER_ASSET_INVALID") };
            }),
            ...images.map((asset) => ({ role: "image_asset", sourceType: "asset", sourceId: asset.assetId, sourceDigest: asset.sha256 })),
            ...fonts.map((asset) => ({ role: "font_asset", sourceType: "asset", sourceId: asset.assetId, sourceDigest: asset.sha256 })),
          ],
        });
        const exportRevisionId = `export_${randomUUID()}`;
        const taskId = randomUUID();
        const now = new Date();
        const taskInput = request.schemaVersion === 1
          ? {
              schemaVersion: 1 as const,
              requestId: request.requestId,
              sourceProjection,
              exportRevisionId,
              layoutRevisionId: revision.id,
              documentDigest: revisionDocumentDigest,
              sourceLockSetDigest,
              profile: request.profile,
              profileDigest: request.profileDigest,
              preflightDigest: request.preflightDigest,
              renderer,
              assetManifest,
            }
          : parseLayoutPublicationTaskInputV2({
              schemaVersion: 2,
              kind: "layout_publication_task_v2",
              requestId: request.requestId,
              sourceProjection,
              exportRevisionId,
              layoutRevisionId: revision.id,
              revisionDocumentDigest,
              visibleDocumentDigest,
              sourceLockSetDigest,
              profile: request.profile,
              profileDigest: request.profileDigest,
              preflightDigest: request.preflightDigest,
              acknowledgedIssueKeys: request.acknowledgedIssueKeys,
              renderer,
              assetManifest,
            });
        const inputDigest = digestCanonicalJson(taskInput);
        const sourceDigest = taskSourceProjectionDigest(sourceProjection);
        await tx.generationTask.create({
          data: {
            id: taskId,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            type: "layout_export",
            recordKind: "runtime",
            provenanceStatus: "complete",
            status: "queued",
            phase: "queued",
            progressPercent: 0,
            targetType: "export",
            targetId: exportRevisionId,
            inputJson: jsonValue(taskInput),
            inputSchemaVersion: request.schemaVersion,
            inputDigest,
            sourceDigest,
            idempotencyKey,
            concurrencyKey: "layout-render",
            priority: 0,
            attempt: 0,
            maxAttempts: 2,
            retryDisabled: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        for (const source of sourceProjection.sources) {
          await tx.generationTaskSource.create({
            data: { id: randomUUID(), taskId, role: source.role, order: source.order, sourceType: source.sourceType, sourceId: source.sourceId, sourceDigest: source.sourceDigest },
          });
        }
        const slot = await tx.taskConcurrencySlot.findFirst({ where: { concurrencyKey: "layout-render", slotNo: 1 } });
        if (!slot) {
          await tx.taskConcurrencySlot.create({
            data: { id: randomUUID(), concurrencyKey: "layout-render", slotNo: 1, taskId: null, leaseOwnerId: null, claimToken: null, leaseExpiresAt: null, updatedAt: now },
          });
        }
        await tx.generationTask.update({ where: { id: taskId }, data: { sourceSetSealedAt: now } });
        const latest = await tx.exportRevision.findFirst({
          where: { projectId: scope.projectId, scopeKey: `chapter:${scope.chapterId}`, kind: "layout_publication" },
          orderBy: { revision: "desc" },
          select: { revision: true },
        });
        await tx.exportRevision.create({
          data: {
            id: exportRevisionId,
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            scopeKey: `chapter:${scope.chapterId}`,
            revision: (latest?.revision ?? 0) + 1,
            kind: "layout_publication",
            status: "queued",
            taskId,
            layoutRevisionId: revision.id,
            revisionDocumentDigest,
            visibleDocumentDigest,
            sourceLockSetDigest,
            profileJson: jsonValue(request.profile),
            profileSchemaVersion: 1,
            profileDigest: request.profileDigest,
            preflightDigest: request.preflightDigest,
            rendererVersion: renderer.rendererVersion,
            manifestJson: Prisma.DbNull,
            manifestSchemaVersion: null,
            manifestDigest: null,
            completionApplicability: null,
            origin: "runtime",
            createdAt: now,
          },
        });
        return { taskId, exportRevisionId, result: "created" as const };
      });
      const [exportRevision, task] = await Promise.all([
        this.get(scope, created.exportRevisionId),
        this.tasks.get(created.taskId),
      ]);
      if (exportRevision.schemaVersion === 2) {
        return {
          schemaVersion: 2,
          result: created.result,
          exportRevision,
          task,
        };
      }
      return {
        schemaVersion: 1,
        result: created.result,
        exportRevision,
        task,
      };
    });
  }

  async list(
    scope: VersionScopeV1,
  ): Promise<LayoutPublicationHistoryResponseV1 | LayoutPublicationHistoryResponseV2> {
    return this.execute(async () => {
      const [chapter, rows] = await Promise.all([
        this.prismaService.database().chapter.findFirst({ where: { id: scope.chapterId, projectId: scope.projectId }, select: { currentExportRevisionId: true } }),
        this.prismaService.database().exportRevision.findMany({
          where: { projectId: scope.projectId, chapterId: scope.chapterId, kind: "layout_publication" },
          include: {
            layoutRevision: true,
            exportArtifactsByExportRevision: {
              include: { asset: true },
              orderBy: [{ role: "asc" }, { order: "asc" }],
            },
          },
          orderBy: { revision: "desc" },
        }),
      ]);
      if (!chapter) publicationError("LAYOUT_EXPORT_NOT_FOUND", 404);
      const items = rows.map((row) => this.toSummary(row, chapter.currentExportRevisionId));
      if (items.some((item) => item.schemaVersion === 2)) {
        return {
          schemaVersion: 2,
          currentExportRevisionId: chapter.currentExportRevisionId,
          items: items.map((item) => item.schemaVersion === 1
            ? { ...item, documentSchemaVersion: 1 as const }
            : item),
        };
      }
      return {
        schemaVersion: 1,
        currentExportRevisionId: chapter.currentExportRevisionId,
        items: items as LayoutPublicationSummaryV1[],
      };
    });
  }

  async get(
    scope: VersionScopeV1,
    exportRevisionId: string,
  ): Promise<LayoutPublicationSummaryV1 | LayoutPublicationSummaryV2> {
    return this.execute(async () => {
      const row = await this.prismaService.database().exportRevision.findFirst({
        where: { id: exportRevisionId, projectId: scope.projectId, chapterId: scope.chapterId, kind: "layout_publication" },
        include: {
          layoutRevision: true,
          exportArtifactsByExportRevision: {
            include: { asset: true },
            orderBy: [{ role: "asc" }, { order: "asc" }],
          },
        },
      });
      if (!row) publicationError("LAYOUT_EXPORT_NOT_FOUND", 404);
      const chapter = await this.prismaService.database().chapter.findUnique({ where: { id: scope.chapterId }, select: { currentExportRevisionId: true } });
      return this.toSummary(row, chapter?.currentExportRevisionId ?? null);
    });
  }

  async cancel(
    scope: VersionScopeV1,
    exportRevisionId: string,
  ): Promise<
    | { schemaVersion: 1; exportRevision: LayoutPublicationSummaryV1; task: GenerationTaskItem }
    | { schemaVersion: 2; exportRevision: LayoutPublicationSummaryV2; task: GenerationTaskItem }
  > {
    return this.execute(async () => {
      const taskId = await this.prismaService.runBusinessTransaction(async (tx) => {
        const row = await tx.exportRevision.findFirst({ where: { id: exportRevisionId, projectId: scope.projectId, chapterId: scope.chapterId, kind: "layout_publication" } });
        if (!row?.taskId) publicationError("LAYOUT_EXPORT_NOT_FOUND", 404);
        if (row.status === "ready" || row.status === "failed" || row.status === "cancelled") publicationError("LAYOUT_EXPORT_ALREADY_TERMINAL", 409);
        const task = await tx.generationTask.findUnique({ where: { id: row.taskId } });
        if (!task) publicationError("LAYOUT_EXPORT_TASK_MAPPING_INVALID", 409);
        const now = new Date();
        if (task.status === "running") {
          await tx.generationTask.update({ where: { id: task.id }, data: { cancelRequestedAt: now, updatedAt: now } });
        } else {
          await tx.generationTask.update({ where: { id: task.id }, data: { status: "cancelled", phase: "cancelled", cancelRequestedAt: now, finishedAt: now, nextRunAt: null, updatedAt: now } });
          await tx.exportRevision.update({ where: { id: row.id }, data: { status: "cancelled", cancelledAt: now } });
        }
        return task.id;
      });
      const [exportRevision, task] = await Promise.all([this.get(scope, exportRevisionId), this.tasks.get(taskId)]);
      return exportRevision.schemaVersion === 2
        ? { schemaVersion: 2, exportRevision, task }
        : { schemaVersion: 1, exportRevision, task };
    });
  }

  async readArtifact(scope: VersionScopeV1, exportRevisionId: string, assetId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string; sha256: LayoutDigest }> {
    return this.execute(async () => {
      const artifact = await this.prismaService.database().exportArtifact.findFirst({
        where: {
          exportRevisionId,
          assetId,
          exportRevision: { projectId: scope.projectId, chapterId: scope.chapterId, kind: "layout_publication", status: "ready" },
        },
        include: { asset: true },
      });
      if (!artifact || artifact.asset.status !== "ready" || !artifact.asset.sha256 || artifact.asset.bytes === null) {
        publicationError("LAYOUT_EXPORT_ARTIFACT_NOT_FOUND", 404);
      }
      const absolute = this.workspacePath.resolveVirtualPath(`/workspace/${artifact.asset.storageKey}`);
      const canonical = await realpath(absolute).catch(() => publicationError("LAYOUT_EXPORT_ARTIFACT_NOT_FOUND", 404));
      if (canonical !== absolute) publicationError("LAYOUT_EXPORT_ARTIFACT_INVALID", 409);
      const buffer = await readFile(absolute);
      const sha256 = `sha256:${createHash("sha256").update(buffer).digest("hex")}` as LayoutDigest;
      if (buffer.byteLength !== artifact.asset.bytes || sha256 !== artifact.asset.sha256) {
        publicationError("LAYOUT_EXPORT_ARTIFACT_INVALID", 409);
      }
      return { buffer, mimeType: artifact.asset.mimeType, fileName: path.basename(artifact.asset.storageKey), sha256 };
    });
  }

  private toSummary(
    row: Prisma.ExportRevisionGetPayload<{
      include: {
        layoutRevision: true;
        exportArtifactsByExportRevision: { include: { asset: true } };
      };
    }>,
    currentExportRevisionId: string | null,
  ): LayoutPublicationSummaryV1 | LayoutPublicationSummaryV2 {
    const profile = LayoutPublicationProfileCodecV1.parse(row.profileJson);
    const manifestJson = row.manifestJson
      && typeof row.manifestJson === "object"
      && !Array.isArray(row.manifestJson)
      ? row.manifestJson
      : null;
    const common = {
      id: row.id,
      projectId: row.projectId,
      chapterId: row.chapterId!,
      revision: row.revision,
      status: row.status as LayoutPublicationSummaryV1["status"],
      taskId: row.taskId!,
      layoutRevisionId: row.layoutRevisionId!,
      profile,
      profileDigest: asDigest(row.profileDigest, "LAYOUT_EXPORT_TASK_MAPPING_INVALID"),
      preflightDigest: asDigest(row.preflightDigest, "LAYOUT_EXPORT_TASK_MAPPING_INVALID"),
      rendererVersion: row.rendererVersion!,
      revisionPosition: (
        currentExportRevisionId === row.id ? "current" : "historical"
      ) as LayoutPublicationSummaryV1["revisionPosition"],
      artifacts: row.exportArtifactsByExportRevision.map(({ asset, ...artifact }) => {
        const metadata = asset.metadataJson && typeof asset.metadataJson === "object" && !Array.isArray(asset.metadataJson) ? asset.metadataJson as Record<string, unknown> : {};
        return {
          assetId: asset.id,
          role: artifact.role as LayoutPublicationSummaryV1["artifacts"][number]["role"],
          order: artifact.order,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          sha256: asset.sha256 ? asDigest(asset.sha256, "LAYOUT_EXPORT_TASK_MAPPING_INVALID") : null,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
          pageCount: typeof metadata.pageCount === "number" ? metadata.pageCount : null,
          status: asset.status,
        };
      }),
      createdAt: row.createdAt.toISOString(),
      readyAt: row.readyAt?.toISOString() ?? null,
      failedAt: row.failedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
    const manifestDigest = row.manifestDigest
      ? asDigest(row.manifestDigest, "LAYOUT_EXPORT_TASK_MAPPING_INVALID")
      : null;
    const completionApplicability = row.completionApplicability as
      | "current"
      | "historical"
      | null;
    if (row.layoutRevision?.schemaVersion === 2) {
      return {
        ...common,
        schemaVersion: 2,
        documentSchemaVersion: 2,
        revisionDocumentDigest: asDigest(
          row.revisionDocumentDigest,
          "LAYOUT_EXPORT_TASK_MAPPING_INVALID",
        ),
        visibleDocumentDigest: asDigest(
          row.visibleDocumentDigest,
          "LAYOUT_EXPORT_TASK_MAPPING_INVALID",
        ),
        manifest: manifestJson as unknown as PublicationManifestV2 | null,
        manifestDigest,
        completionApplicability,
      };
    }
    return {
      ...common,
      schemaVersion: 1,
      manifest: manifestJson as unknown as PublicationManifestV1 | null,
      manifestDigest,
      completionApplicability,
    };
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      if (!this.prismaService.isDatabaseMode()) publicationError("LAYOUT_DB_ONLY_REQUIRED", 409);
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof LayoutPublicationServiceError) {
        throw new HttpException({ success: false, error: { code: error.code, message: error.message, details: error.details } }, error.status);
      }
      if (error instanceof Error && "code" in error && "status" in error) {
        const value = error as Error & { code: string; status: number; details?: unknown };
        throw new HttpException({ success: false, error: { code: value.code, message: value.message, details: value.details } }, value.status);
      }
      if (error instanceof Error && /AIR_G[15]:/.test(error.message)) {
        throw new HttpException({ success: false, error: { code: "LAYOUT_EXPORT_CONFLICT", message: "LAYOUT_EXPORT_CONFLICT" } }, 409);
      }
      throw error;
    }
  }
}
