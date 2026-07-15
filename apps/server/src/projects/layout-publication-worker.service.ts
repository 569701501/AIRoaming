import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  buildLayoutRenderPlanV1,
  buildPublicationManifestV1,
  digestCanonicalJson,
  LayoutDocumentCodecV1,
  LayoutPublicationProfileCodecV1,
  type GenerationTaskItem,
  type LayoutDigest,
  type LayoutRendererIdentityV1,
  type PublicationInputAssetV1,
  type PublicationOutputArtifactV1,
  type RenderAssetManifestV1,
} from "@airoaming/shared";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { PrismaService } from "../persistence/prisma.service.js";
import {
  PersistentTaskRepository,
  TaskLeaseLostError,
  type ClaimedPersistentTask,
} from "../tasks/persistent-task.repository.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { CandidateSourceQueryService } from "./candidate-source-query.service.js";
import { LayoutRendererService, type RenderedPublicationArtifactV1, type ResolvedRenderAssetV1 } from "./layout-renderer.service.js";
import { ProjectDeleteOutboxService } from "./project-delete-outbox.service.js";

interface LayoutPublicationTaskInputV1 {
  schemaVersion: 1;
  requestId: string;
  exportRevisionId: string;
  layoutRevisionId: string;
  documentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  profile: unknown;
  profileDigest: LayoutDigest;
  preflightDigest: LayoutDigest;
  renderer: LayoutRendererIdentityV1;
  assetManifest: RenderAssetManifestV1;
  sourceProjection: unknown;
}

interface StagedOutput {
  rendered: RenderedPublicationArtifactV1;
  assetId: string;
  finalStorageKey: string;
  tempStorageKey: string;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`LAYOUT_RENDER_INPUT_INVALID:${label}`);
  return value as Record<string, unknown>;
}

function digest(value: unknown, label: string): LayoutDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`LAYOUT_RENDER_INPUT_INVALID:${label}`);
  return value as LayoutDigest;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`LAYOUT_RENDER_INPUT_INVALID:${label}`);
  return value;
}

function sha256(bytes: Uint8Array): LayoutDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stableAssetId(exportRevisionId: string, role: string, order: number): string {
  return `asset_${createHash("sha256").update(`${exportRevisionId}\0${role}\0${order}`).digest("hex").slice(0, 32)}`;
}

function parseTaskInput(value: unknown): LayoutPublicationTaskInputV1 {
  const row = record(value, "task");
  if (row.schemaVersion !== 1) throw new Error("LAYOUT_RENDER_INPUT_INVALID:schemaVersion");
  const renderer = record(row.renderer, "renderer") as unknown as LayoutRendererIdentityV1;
  const assetManifest = record(row.assetManifest, "assetManifest") as unknown as RenderAssetManifestV1;
  if (assetManifest.schemaVersion !== 1 || !Array.isArray(assetManifest.images) || !Array.isArray(assetManifest.fonts)) {
    throw new Error("LAYOUT_RENDER_INPUT_INVALID:assetManifest");
  }
  return {
    schemaVersion: 1,
    requestId: text(row.requestId, "requestId"),
    exportRevisionId: text(row.exportRevisionId, "exportRevisionId"),
    layoutRevisionId: text(row.layoutRevisionId, "layoutRevisionId"),
    documentDigest: digest(row.documentDigest, "documentDigest"),
    sourceLockSetDigest: digest(row.sourceLockSetDigest, "sourceLockSetDigest"),
    profile: row.profile,
    profileDigest: digest(row.profileDigest, "profileDigest"),
    preflightDigest: digest(row.preflightDigest, "preflightDigest"),
    renderer,
    assetManifest,
    sourceProjection: row.sourceProjection,
  };
}

function retryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /LAYOUT_RENDER_(ENGINE_CRASHED|SCENE_TIMEOUT|PROMOTION_FAILED)|TRANSIENT_IO|browser has been closed|Target page|timeout/i.test(message);
}

function errorPayload(error: unknown, canRetry: boolean): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error);
  return { code: message.split(":", 1)[0] || "LAYOUT_RENDER_ENGINE_CRASHED", message: message.slice(0, 240), retryable: canRetry };
}

@Injectable()
export class LayoutPublicationWorkerService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly tasks: PersistentTaskRepository,
    @Inject(LayoutRendererService) private readonly renderer: LayoutRendererService,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
    @Inject(ProjectDeleteOutboxService) private readonly outbox: ProjectDeleteOutboxService,
    @Inject(CandidateSourceQueryService) private readonly sourceQuery: CandidateSourceQueryService,
  ) {}

  async run(claim: ClaimedPersistentTask): Promise<GenerationTaskItem> {
    try {
      const input = parseTaskInput(claim.item.input);
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 5, "validate_input");
      const prepared = await this.prepare(claim, input);
      const resumed = await this.resumeStagedPublication(claim, input);
      if (resumed) {
        await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 94, "promote_assets");
        await this.promoteAll(input.exportRevisionId);
        const manifest = await this.readAndValidateStagedManifest(input);
        await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 98, "finalize_revision");
        return await this.finalizeSuccess(claim, input, manifest.value, manifest.digest);
      }
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 15, "resolve_assets");
      const resolvedAssets = await this.resolveAssets(input.assetManifest);
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 25, "build_render_plan");
      const plan = buildLayoutRenderPlanV1({
        document: prepared.document,
        sourceLockSetDigest: input.sourceLockSetDigest,
        profile: prepared.profile,
        assets: input.assetManifest,
      });
      if (plan.documentDigest !== input.documentDigest || plan.profileDigest !== input.profileDigest) {
        throw new Error("LAYOUT_RENDER_INPUT_DIGEST_MISMATCH");
      }
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 30, "render_primary");
      const rendered = await this.renderer.render(plan, prepared.profile, resolvedAssets);
      if (
        rendered.renderer.rendererVersion !== input.renderer.rendererVersion
        || rendered.renderer.buildDigest !== input.renderer.buildDigest
      ) throw new Error("LAYOUT_RENDERER_IDENTITY_MISMATCH");
      await this.assertNotCancelled(claim);
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 88, "stage_assets");
      const staged = await this.writeStaging(claim, prepared.chapterSlug, rendered.artifacts);
      const manifest = await this.stageAssetsAndManifest(claim, input, prepared, rendered.renderer, staged);
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 94, "promote_assets");
      await this.promoteAll(input.exportRevisionId);
      await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 98, "finalize_revision");
      return await this.finalizeSuccess(claim, input, manifest.value, manifest.digest);
    } catch (error) {
      if (error instanceof TaskLeaseLostError) throw error;
      return this.finalizeFailure(claim, error);
    }
  }

  private async prepare(claim: ClaimedPersistentTask, input: LayoutPublicationTaskInputV1) {
    const sourceProjection = record(input.sourceProjection, "sourceProjection");
    if (claim.item.target?.type !== "export" || claim.item.target.id !== input.exportRevisionId || claim.item.target.chapterId !== sourceProjection.chapterId) {
      throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
    }
    return this.prismaService.runReadTransaction(async (tx) => {
      const [task, publication, revision, chapter] = await Promise.all([
        tx.generationTask.findUnique({ where: { id: claim.item.id } }),
        tx.exportRevision.findUnique({ where: { id: input.exportRevisionId } }),
        tx.layoutRevision.findUnique({ where: { id: input.layoutRevisionId } }),
        tx.chapter.findUnique({ where: { id: claim.item.target!.chapterId! }, select: { slug: true } }),
      ]);
      if (!task || task.status !== "running" || task.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
      if (!publication || publication.taskId !== task.id || publication.status !== "rendering" || publication.layoutRevisionId !== input.layoutRevisionId) {
        throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
      }
      if (!revision?.bindingSetSealedAt || revision.documentDigest !== input.documentDigest || revision.sourceLockSetDigest !== input.sourceLockSetDigest) {
        throw new Error("LAYOUT_RENDER_INPUT_DIGEST_MISMATCH");
      }
      if (!chapter) throw new Error("LAYOUT_EXPORT_CHAPTER_NOT_FOUND");
      const document = LayoutDocumentCodecV1.parseAndNormalize(revision.documentJson, { projectId: claim.item.projectId, chapterId: claim.item.target!.chapterId! });
      const profile = LayoutPublicationProfileCodecV1.parse(input.profile);
      return { document, profile, chapterSlug: chapter.slug, layoutRevision: revision.revision, exportRevision: publication.revision };
    });
  }

  private async resolveAssets(manifest: RenderAssetManifestV1): Promise<ResolvedRenderAssetV1[]> {
    const expected = [...manifest.images, ...manifest.fonts];
    const rows = await this.prismaService.database().asset.findMany({ where: { id: { in: expected.map((asset) => asset.assetId) } } });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const result: ResolvedRenderAssetV1[] = [];
    for (const asset of expected) {
      const row = rowById.get(asset.assetId);
      if (!row || row.status !== "ready" || row.sha256 !== asset.sha256 || row.mimeType !== asset.mimeType || row.bytes !== asset.bytes) {
        throw new Error(`LAYOUT_RENDER_ASSET_INVALID:${asset.assetId}`);
      }
      const absolute = this.workspacePath.resolveVirtualPath(`/workspace/${row.storageKey}`);
      const canonical = await realpath(absolute).catch(() => { throw new Error(`LAYOUT_RENDER_ASSET_INVALID:${asset.assetId}`); });
      if (canonical !== absolute) throw new Error(`LAYOUT_RENDER_ASSET_INVALID:${asset.assetId}`);
      const bytes = await readFile(absolute);
      if (bytes.byteLength !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`LAYOUT_RENDER_ASSET_INVALID:${asset.assetId}`);
      result.push({ assetId: asset.assetId, mimeType: asset.mimeType, sha256: asset.sha256, bytes });
    }
    return result;
  }

  private async assertNotCancelled(claim: ClaimedPersistentTask): Promise<void> {
    const row = await this.prismaService.database().generationTask.findUnique({ where: { id: claim.item.id }, select: { status: true, leaseToken: true, cancelRequestedAt: true } });
    if (!row || row.status !== "running" || row.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
    if (row.cancelRequestedAt) throw new Error("LAYOUT_EXPORT_CANCEL_REQUESTED");
  }

  /** DB 已经封存产物后，重试只恢复提升与终态，不重新渲染或重复建行。 */
  private async resumeStagedPublication(claim: ClaimedPersistentTask, input: LayoutPublicationTaskInputV1): Promise<boolean> {
    const artifacts = await this.prismaService.database().exportArtifact.findMany({
      where: { exportRevisionId: input.exportRevisionId },
      include: { asset: true },
    });
    if (artifacts.length === 0) return false;
    if (artifacts.length < 2 || artifacts.filter((artifact) => artifact.role === "publication_manifest").length !== 1) {
      throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    }
    if (artifacts.some((artifact) => artifact.asset.projectId !== claim.item.projectId || artifact.asset.chapterId !== claim.item.target!.chapterId || artifact.asset.sourceTaskId !== claim.item.id)) {
      throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    }
    return true;
  }

  private async readAndValidateStagedManifest(input: LayoutPublicationTaskInputV1): Promise<{ value: Record<string, unknown>; digest: LayoutDigest }> {
    const artifacts = await this.prismaService.database().exportArtifact.findMany({
      where: { exportRevisionId: input.exportRevisionId },
      include: { asset: true },
    });
    const manifestArtifact = artifacts.find((artifact) => artifact.role === "publication_manifest");
    if (!manifestArtifact || manifestArtifact.asset.status !== "ready" || !manifestArtifact.asset.sha256 || manifestArtifact.asset.bytes === null) {
      throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    }
    const absolute = this.workspacePath.resolveVirtualPath(`/workspace/${manifestArtifact.asset.storageKey}`);
    const bytes = await readFile(absolute);
    if (bytes.byteLength !== manifestArtifact.asset.bytes || sha256(bytes) !== manifestArtifact.asset.sha256) {
      throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    }
    let value: Record<string, unknown>;
    try {
      value = record(JSON.parse(bytes.toString("utf8")), "publicationManifest");
    } catch {
      throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    }
    const manifestDigest = digestCanonicalJson(value);
    if (
      manifestDigest !== manifestArtifact.asset.sha256
      || value.schemaVersion !== 1
      || value.exportRevisionId !== input.exportRevisionId
      || value.layoutRevisionId !== input.layoutRevisionId
      || value.documentDigest !== input.documentDigest
      || value.sourceLockSetDigest !== input.sourceLockSetDigest
      || value.profileDigest !== input.profileDigest
      || value.preflightDigest !== undefined
    ) throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    const outputRows = Array.isArray(value.outputs) ? value.outputs.map((item) => record(item, "publicationManifest.output")) : [];
    const expected = artifacts
      .filter((artifact) => artifact.role !== "publication_manifest")
      .map((artifact) => `${artifact.assetId}\0${artifact.role}\0${artifact.order}\0${artifact.asset.sha256 ?? ""}`)
      .sort();
    const actual = outputRows
      .map((output) => `${String(output.assetId)}\0${String(output.role)}\0${String(output.order)}\0${String(output.sha256)}`)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("LAYOUT_RENDER_STAGED_SET_INVALID");
    return { value, digest: manifestDigest };
  }

  private outputStorageKey(projectId: string, chapterSlug: string, exportRevisionId: string, output: RenderedPublicationArtifactV1): string {
    return `projects/${projectId}/chapters/${chapterSlug}/exports/${exportRevisionId}/${output.fileName}`;
  }

  private async writeStaging(claim: ClaimedPersistentTask, chapterSlug: string, outputs: readonly RenderedPublicationArtifactV1[]): Promise<StagedOutput[]> {
    const stagingRoot = `projects/${claim.item.projectId}/.staging/tasks/${claim.item.id}/${claim.claimToken}`;
    const result: StagedOutput[] = [];
    for (const output of outputs) {
      const tempStorageKey = `${stagingRoot}/${output.fileName}`;
      const absolute = this.workspacePath.resolveVirtualPath(`/workspace/${tempStorageKey}`);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, output.bytes, { flag: "wx", mode: 0o600 });
      result.push({
        rendered: output,
        assetId: stableAssetId(claim.item.target!.id, output.role, output.order),
        finalStorageKey: this.outputStorageKey(claim.item.projectId, chapterSlug, claim.item.target!.id, output),
        tempStorageKey,
      });
    }
    return result;
  }

  private async stageAssetsAndManifest(
    claim: ClaimedPersistentTask,
    input: LayoutPublicationTaskInputV1,
    prepared: { chapterSlug: string; layoutRevision: number; exportRevision: number },
    renderer: LayoutRendererIdentityV1,
    outputs: readonly StagedOutput[],
  ) {
    const publicationOutputs: PublicationOutputArtifactV1[] = outputs.map((output) => ({
      assetId: output.assetId,
      role: output.rendered.role,
      order: output.rendered.order,
      storageKey: output.finalStorageKey,
      mimeType: output.rendered.mimeType,
      sha256: output.rendered.sha256,
      bytes: output.rendered.bytes.byteLength,
      width: output.rendered.width,
      height: output.rendered.height,
      pageCount: output.rendered.pageCount,
    }));
    const inputs: { images: PublicationInputAssetV1[]; fonts: PublicationInputAssetV1[] } = {
      images: input.assetManifest.images.map((asset) => ({ assetId: asset.assetId, role: "candidate_image", sha256: asset.sha256, mimeType: asset.mimeType })),
      fonts: input.assetManifest.fonts.map((asset) => ({ assetId: asset.assetId, role: "font", sha256: asset.sha256, mimeType: asset.mimeType })),
    };
    const manifest = buildPublicationManifestV1({
      projectId: claim.item.projectId,
      chapterId: claim.item.target!.chapterId!,
      exportRevisionId: input.exportRevisionId,
      exportRevision: prepared.exportRevision,
      layoutRevisionId: input.layoutRevisionId,
      layoutRevision: prepared.layoutRevision,
      documentDigest: input.documentDigest,
      sourceLockSetDigest: input.sourceLockSetDigest,
      profile: LayoutPublicationProfileCodecV1.parse(input.profile),
      renderer,
      inputs,
      outputs: publicationOutputs,
    });
    const manifestAssetId = stableAssetId(input.exportRevisionId, "publication_manifest", 1);
    const manifestFileName = "manifest.json";
    const manifestTempStorageKey = `projects/${claim.item.projectId}/.staging/tasks/${claim.item.id}/${claim.claimToken}/${manifestFileName}`;
    const manifestFinalStorageKey = `projects/${claim.item.projectId}/chapters/${prepared.chapterSlug}/exports/${input.exportRevisionId}/${manifestFileName}`;
    const manifestBytes = Buffer.from(manifest.canonicalBytes);
    const manifestAbsolute = this.workspacePath.resolveVirtualPath(`/workspace/${manifestTempStorageKey}`);
    await mkdir(path.dirname(manifestAbsolute), { recursive: true });
    await writeFile(manifestAbsolute, manifestBytes, { flag: "wx", mode: 0o600 });

    await this.prismaService.runBusinessTransaction(async (tx) => {
      const task = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
      const publication = await tx.exportRevision.findUnique({ where: { id: input.exportRevisionId } });
      if (!task || task.status !== "running" || task.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
      if (!publication || publication.status !== "rendering" || publication.taskId !== task.id) throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
      for (const output of outputs) await this.createStagedArtifact(tx, claim, input.exportRevisionId, output.assetId, output.rendered.role, output.rendered.order, output.rendered.mimeType === "application/pdf" ? "document" : "image", output.finalStorageKey, output.tempStorageKey, output.rendered.sha256, output.rendered.bytes.byteLength, {
        width: output.rendered.width,
        height: output.rendered.height,
        pageCount: output.rendered.pageCount,
      });
      await this.createStagedArtifact(tx, claim, input.exportRevisionId, manifestAssetId, "publication_manifest", 1, "document", manifestFinalStorageKey, manifestTempStorageKey, sha256(manifestBytes), manifestBytes.byteLength, { width: null, height: null, pageCount: null });
    });
    return manifest;
  }

  private async createStagedArtifact(
    tx: Prisma.TransactionClient,
    claim: ClaimedPersistentTask,
    exportRevisionId: string,
    assetId: string,
    role: string,
    order: number,
    type: "image" | "document",
    finalStorageKey: string,
    tempStorageKey: string,
    expectedSha256: LayoutDigest,
    bytes: number,
    dimensions: { width: number | null; height: number | null; pageCount: number | null },
  ): Promise<void> {
    const now = new Date();
    const metadata = { schemaVersion: 1, kind: "layout_publication_artifact_v1", exportRevisionId, role, order, pageCount: dimensions.pageCount };
    await tx.asset.create({
      data: {
        id: assetId,
        projectId: claim.item.projectId,
        chapterId: claim.item.target!.chapterId!,
        type,
        role: "layout_publication",
        mimeType: role.endsWith("png") ? "image/png" : role === "document_pdf" ? "application/pdf" : "application/json",
        storageKey: finalStorageKey,
        status: "staged",
        sha256: null,
        bytes: null,
        width: dimensions.width,
        height: dimensions.height,
        durationMs: null,
        sourceTaskId: claim.item.id,
        metadataJson: metadata,
        metadataSchemaVersion: 1,
        metadataDigest: digestCanonicalJson(metadata),
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.exportArtifact.create({ data: { id: randomUUID(), exportRevisionId, assetId, role, order } });
    const payload = { schemaVersion: 1, assetId, projectId: claim.item.projectId, chapterId: claim.item.target!.chapterId!, tempStorageKey, finalStorageKey, sha256: expectedSha256, bytes };
    await tx.outboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: "asset.promote",
        aggregateType: "asset",
        aggregateId: assetId,
        payloadJson: payload,
        payloadSchemaVersion: 1,
        payloadDigest: digestCanonicalJson(payload),
        status: "pending",
        attempt: 0,
        maxAttempts: 3,
        availableAt: now,
        idempotencyKey: `layout_publication_promote:${exportRevisionId}:${role}:${order}`,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  private async promoteAll(exportRevisionId: string): Promise<void> {
    for (let iteration = 0; iteration < 256; iteration += 1) {
      const artifacts = await this.prismaService.database().exportArtifact.findMany({
        where: { exportRevisionId },
        include: { asset: true },
      });
      if (artifacts.length > 0 && artifacts.every((artifact) => artifact.asset.status === "ready")) return;
      const failed = artifacts.find((artifact) => artifact.asset.status === "failed" || artifact.asset.status === "deleting");
      if (failed) throw new Error("LAYOUT_RENDER_PROMOTION_FAILED");
      const next = artifacts.find((artifact) => artifact.asset.status === "staged");
      if (!next) throw new Error("LAYOUT_RENDER_PROMOTION_FAILED");
      const processed = await this.outbox.processAssetPromotion(next.assetId, `layout-render-${exportRevisionId}`);
      if (!processed || processed.eventType !== "asset.promote" || processed.status !== "processed") throw new Error("LAYOUT_RENDER_PROMOTION_FAILED");
    }
    throw new Error("LAYOUT_RENDER_PROMOTION_FAILED");
  }

  private async finalizeSuccess(
    claim: ClaimedPersistentTask,
    input: LayoutPublicationTaskInputV1,
    manifest: unknown,
    manifestDigest: LayoutDigest,
  ): Promise<GenerationTaskItem> {
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const [task, publication, chapter, artifacts, sourceState] = await Promise.all([
        tx.generationTask.findUnique({ where: { id: claim.item.id } }),
        tx.exportRevision.findUnique({ where: { id: input.exportRevisionId } }),
        tx.chapter.findUnique({ where: { id: claim.item.target!.chapterId! } }),
        tx.exportArtifact.findMany({ where: { exportRevisionId: input.exportRevisionId }, include: { asset: true } }),
        this.sourceQuery.get({ projectId: claim.item.projectId, chapterId: claim.item.target!.chapterId! }, tx),
      ]);
      if (!task || task.status !== "running" || task.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
      if (!publication || publication.status !== "rendering" || publication.taskId !== task.id) throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
      if (!chapter || artifacts.length < 2 || artifacts.some((artifact) => artifact.asset.status !== "ready")) throw new Error("LAYOUT_RENDER_PROMOTION_FAILED");
      const current = chapter.currentLayoutRevisionId === input.layoutRevisionId
        && sourceState.candidateLockSet.state === "complete"
        && sourceState.candidateLockSet.sourceApplicability === "current"
        && sourceState.candidateLockSet.digest === input.sourceLockSetDigest;
      const applicability = current ? "current" : "historical";
      const now = new Date();
      await tx.exportRevision.update({
        where: { id: publication.id },
        data: {
          status: "ready",
          manifestJson: manifest as Prisma.InputJsonValue,
          manifestSchemaVersion: 1,
          manifestDigest,
          completionApplicability: applicability,
          readyAt: now,
        },
      });
      if (current) {
        await tx.chapter.update({
          where: { id: chapter.id },
          data: {
            currentExportRevisionId: publication.id,
            milestoneStatus: "exported",
            rowVersion: { increment: 1 },
          },
        });
      }
      return this.tasks.finishInTransaction(tx, {
        taskId: task.id,
        claimToken: claim.claimToken,
        outcome: "succeeded",
        output: { schemaVersion: 1, exportRevisionId: publication.id, manifestDigest, artifactIds: artifacts.map((artifact) => artifact.assetId).sort() },
        applicability,
      });
    });
  }

  private async finalizeFailure(claim: ClaimedPersistentTask, error: unknown): Promise<GenerationTaskItem> {
    const cancelRequested = error instanceof Error && error.message === "LAYOUT_EXPORT_CANCEL_REQUESTED";
    const canRetry = !cancelRequested && retryable(error) && claim.attempt < claim.item.maxAttempts;
    const retryAt = canRetry ? new Date(Date.now() + 5_000) : undefined;
    return this.prismaService.runBusinessTransaction(async (tx) => {
      const task = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
      const publication = await tx.exportRevision.findFirst({ where: { taskId: claim.item.id, kind: "layout_publication" } });
      if (!task || task.status !== "running" || task.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
      if (!publication || publication.status !== "rendering") throw new Error("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
      const now = new Date();
      if (cancelRequested || task.cancelRequestedAt) {
        await tx.exportRevision.update({ where: { id: publication.id }, data: { status: "cancelled", cancelledAt: now } });
        return this.tasks.finishInTransaction(tx, { taskId: task.id, claimToken: claim.claimToken, outcome: "cancelled", output: { schemaVersion: 1, exportRevisionId: publication.id }, applicability: "historical" });
      }
      if (!canRetry) await tx.exportRevision.update({ where: { id: publication.id }, data: { status: "failed", failedAt: now } });
      return this.tasks.finishInTransaction(tx, {
        taskId: task.id,
        claimToken: claim.claimToken,
        outcome: "failed",
        error: errorPayload(error, canRetry),
        retryAt,
        applicability: "historical",
      });
    });
  }
}
