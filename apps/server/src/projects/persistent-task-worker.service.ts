import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  encodeStoryDocumentV2,
  encodeStoryboardDocumentV2,
  digestCanonicalJson,
  taskSourceProjectionDigest,
  type Digest,
  type GenerationTaskItem,
  type TaskSourceProjectionV1,
} from "@airoaming/shared";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  PersistentTaskRepository,
  TaskLeaseLostError,
  type ClaimedPersistentTask,
} from "../tasks/persistent-task.repository.js";
import { StoryVersionRepository } from "./versioning/story-version.repository.js";
import { StoryboardVersionRepository } from "./versioning/storyboard-version.repository.js";
import { TaskApplicabilityGuardService } from "./versioning/task-applicability-guard.service.js";
import { VersionTransactionRunner } from "./versioning/version-transaction-runner.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { readImageDimensions } from "./image-dimensions.util.js";
import type { G2VersionTaskType, VersionScopeV1 } from "./versioning/versioning-database.types.js";

export interface VersionDocumentTaskOutputV2<TDocument = unknown> {
  readonly schemaVersion: 2;
  readonly targetId: string;
  readonly targetDocument: TDocument;
  readonly targetDocumentDigest: Digest;
  readonly warnings: readonly string[];
}

export interface PersistentTaskHandlerContext {
  readonly task: ClaimedPersistentTask;
  readonly input: Record<string, unknown>;
}

export type PersistentTaskHandler = (context: PersistentTaskHandlerContext) => Promise<unknown>;

interface ImageArtifact {
  readonly index: number;
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly warnings?: readonly string[];
}

interface NormalizedImageArtifact extends ImageArtifact {
  readonly candidateId: string;
  readonly assetId: string;
  readonly storageKey: string;
  readonly sha256: `sha256:${string}`;
  readonly bytes: number;
}

interface ShotPromptTaskOutput {
  readonly schemaVersion: 2;
  readonly targetId: string;
  readonly generationSpecDigest: Digest;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly image: { readonly width: number; readonly height: number };
  readonly warnings: readonly string[];
}

interface ImageTaskOutput {
  readonly schemaVersion: 2;
  readonly targetId: string;
  readonly generationSpecDigest: Digest;
  readonly candidates: readonly NormalizedImageArtifact[];
  readonly warnings: readonly string[];
}

type NormalizedTaskOutput = VersionDocumentTaskOutputV2 | ShotPromptTaskOutput | ImageTaskOutput;

const HANDLED_TASK_TYPES = ["story_parse", "shot_generate", "shot_prompt_generate", "image_generate"] as const;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RETRY_DELAY_MS = 5_000;

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return value;
}

function parseProviderJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? content).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) throw new TypeError("provider response does not contain a JSON object");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function errorPayload(error: unknown, retryable: boolean): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "TASK_PROVIDER_FAILED";
  return { code, message, retryable };
}

function isProviderFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return /OpenCode|OPENCODE|provider|ECONN|ETIMEDOUT|timeout/i.test(message);
}

@Injectable()
export class PersistentTaskWorkerService implements OnModuleDestroy {
  private readonly handlers = new Map<string, PersistentTaskHandler>();
  private loopTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly tasks: PersistentTaskRepository,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
    @Inject(TaskApplicabilityGuardService) private readonly applicability: TaskApplicabilityGuardService,
    @Inject(StoryVersionRepository) private readonly stories: StoryVersionRepository,
    @Inject(StoryboardVersionRepository) private readonly storyboards: StoryboardVersionRepository,
    @Inject(OpenCodeRuntimeService) private readonly openCode: OpenCodeRuntimeService,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
  ) {
    this.handlers.set("story_parse", (context) => this.runStoryProvider(context));
    this.handlers.set("shot_generate", (context) => this.runShotProvider(context));
    this.handlers.set("shot_prompt_generate", (context) => this.runShotPromptProvider(context));
    this.handlers.set("image_generate", (context) => this.runImageProvider(context));
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /** Register a deterministic/local provider (also useful for integration tests). */
  setHandler(type: G2VersionTaskType, handler: PersistentTaskHandler): void {
    this.handlers.set(type, handler);
  }

  /** Starts the DB worker loop. The application bootstrap opts into this explicitly. */
  start(workerId = process.env.AIROAMING_WORKER_ID?.trim() || "airoaming-worker"): void {
    if (this.loopTimer || !this.prismaService.isDatabaseMode()) return;
    this.loopTimer = setInterval(() => {
      void this.runOnce(workerId).catch(() => undefined);
    }, 250);
    void this.runOnce(workerId).catch(() => undefined);
  }

  stop(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
  }

  /** Claims and executes at most one G2 provider task. */
  async runOnce(workerId: string, now = new Date()): Promise<GenerationTaskItem | null> {
    if (!this.prismaService.isDatabaseMode()) return null;
    if (this.running) return null;
    this.running = true;
    try {
      const claim = await this.tasks.claimNext(workerId, now, HANDLED_TASK_TYPES);
      if (!claim) return null;
      const handler = this.handlers.get(claim.item.type);
      if (!handler) return this.failClaim(claim, new Error(`TASK_HANDLER_NOT_REGISTERED:${claim.item.type}`), false);
      const heartbeat = setInterval(() => {
        void this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), undefined, "provider_running").catch(() => undefined);
      }, HEARTBEAT_INTERVAL_MS);
      try {
        await this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date(), 5, "provider_running");
        const raw = await handler({ task: claim, input: claim.item.input });
        return await this.completeClaim(claim, raw);
      } catch (error) {
        return this.failClaim(claim, error, isProviderFailure(error));
      } finally {
        clearInterval(heartbeat);
      }
    } finally {
      this.running = false;
    }
  }

  private async completeClaim(claim: ClaimedPersistentTask, raw: unknown): Promise<GenerationTaskItem> {
    const input = claim.item.input;
    const operation = claim.item.type as G2VersionTaskType;
    const chapterId = text(input.chapterId, "input.chapterId");
    const projection = object(input.sourceProjection, "input.sourceProjection");
    const sources = projection.sources;
    if (!Array.isArray(sources) || sources.length === 0) throw new TypeError("input.sourceProjection.sources must not be empty");
    const source = object(sources.find((item) => {
      const candidate = object(item, "input.sourceProjection.sources[]");
      return candidate.sourceType === (operation === "story_parse" ? "chapter_script_version" : operation === "shot_generate" ? "story_version" : "preflight_revision");
    }) ?? sources[0], "input.sourceProjection.sources[0]");
    const sourceId = text(source.sourceId, "source.sourceId");
    const sourceDigest = text(source.sourceDigest, "source.sourceDigest") as Digest;
    const scope: VersionScopeV1 = { projectId: claim.item.projectId, chapterId };
    const targetId = operation === "story_parse" || operation === "shot_generate"
      ? text(input.expectedTargetId, "input.expectedTargetId")
      : text(input.shotId, "input.shotId");
    const expectedTargetRowVersion = operation === "story_parse" || operation === "shot_generate"
      ? integer(input.expectedTargetRowVersion, "input.expectedTargetRowVersion")
      : undefined;
    const output = this.normalizeOutput(operation, targetId, chapterId, raw, input, claim.item.projectId);
    const writtenFiles = await this.writeImageArtifacts(output);
    let artifactCommitted = false;
    try {
      const result = await this.transactionRunner.run(async (tx) => {
      const persisted = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
      if (!persisted || persisted.status !== "running" || persisted.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
      if (persisted.sourceDigest !== taskSourceProjectionDigest(projection as unknown as TaskSourceProjectionV1)) throw new TypeError("TASK_SOURCE_DIGEST_MISMATCH");
      if (persisted.cancelRequestedAt) {
        return { item: await this.tasks.finishInTransaction(tx, {
          taskId: claim.item.id,
          claimToken: claim.claimToken,
          outcome: "cancelled",
          output: this.serializableOutput(output),
          applicability: "historical",
        }), artifactCommitted: false };
      }
      const gate = await this.applicability.evaluate(scope, operation, operation === "story_parse" || operation === "shot_generate"
        ? { expectedTargetId: targetId, expectedTargetRowVersion, sourceId, sourceDigest }
        : { targetShotId: targetId, sourceDigest }, tx);
      if (gate.applicability === "current") {
        if (operation === "story_parse") {
          await this.stories.applyTaskResultInTransaction(tx, scope, {
            expectedTargetId: targetId,
            expectedTargetRowVersion: expectedTargetRowVersion!,
            sourceId,
            sourceDigest,
            document: (output as VersionDocumentTaskOutputV2).targetDocument,
          });
        } else if (operation === "shot_generate") {
          await this.storyboards.applyTaskResultInTransaction(tx, scope, {
            expectedTargetId: targetId,
            expectedTargetRowVersion: expectedTargetRowVersion!,
            sourceId,
            sourceDigest,
            document: (output as VersionDocumentTaskOutputV2).targetDocument,
          });
        } else if (operation === "image_generate") {
          await this.persistImageArtifacts(tx, claim, output as ImageTaskOutput, input, sourceDigest);
          artifactCommitted = true;
        }
      } else if (operation === "image_generate") {
        // Historical image results remain auditable candidates, but never move
        // the chapter's current candidate lock.
        await this.persistImageArtifacts(tx, claim, output as ImageTaskOutput, input, sourceDigest);
        artifactCommitted = true;
      }
      return { item: await this.tasks.finishInTransaction(tx, {
        taskId: claim.item.id,
        claimToken: claim.claimToken,
        outcome: "succeeded",
        output: this.serializableOutput(output),
        applicability: gate.applicability,
      }), artifactCommitted };
      });
      if (!result.artifactCommitted) await this.removeImageArtifacts(writtenFiles);
      return result.item;
    } catch (error) {
      await this.removeImageArtifacts(writtenFiles);
      throw error;
    }
  }

  private async failClaim(claim: ClaimedPersistentTask, error: unknown, retryable: boolean): Promise<GenerationTaskItem> {
    const retryAt = retryable && claim.attempt < claim.item.maxAttempts ? new Date(Date.now() + RETRY_DELAY_MS) : undefined;
    try {
      return await this.tasks.finish({
        taskId: claim.item.id,
        claimToken: claim.claimToken,
        outcome: "failed",
        error: errorPayload(error, retryable),
        retryAt,
        applicability: "historical",
      });
    } catch (finishError) {
      if (finishError instanceof TaskLeaseLostError) throw finishError;
      throw finishError;
    }
  }

  private normalizeOutput(operation: G2VersionTaskType, targetId: string, chapterId: string, raw: unknown, input: Record<string, unknown>, projectId: string): NormalizedTaskOutput {
    if (operation === "shot_prompt_generate") return this.normalizeShotPromptOutput(targetId, raw, input);
    if (operation === "image_generate") return this.normalizeImageOutput(targetId, raw, input, projectId);
    const candidate = object(raw, "providerOutput");
    const document = candidate.targetDocument ?? raw;
    const encoded = operation === "story_parse" ? encodeStoryDocumentV2(document) : encodeStoryboardDocumentV2(document);
    if (encoded.value.chapterId !== chapterId) throw new TypeError("provider document chapterId mismatch");
    const warnings = candidate.warnings;
    if (warnings !== undefined && (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string"))) throw new TypeError("providerOutput.warnings must be string[]");
    return {
      schemaVersion: 2,
      targetId,
      targetDocument: encoded.value,
      targetDocumentDigest: encoded.digest,
      warnings: (warnings as string[] | undefined) ?? [],
    };
  }

  private normalizeShotPromptOutput(targetId: string, raw: unknown, input: Record<string, unknown>): ShotPromptTaskOutput {
    const candidate = object(raw, "providerOutput");
    const spec = object(input.promptSpec, "input.promptSpec");
    const prompt = text(candidate.prompt ?? spec.positivePrompt, "providerOutput.prompt");
    const negativePrompt = text(candidate.negativePrompt ?? spec.negativePrompt, "providerOutput.negativePrompt");
    const image = object(candidate.image ?? spec.image, "providerOutput.image");
    const width = integer(image.width, "providerOutput.image.width");
    const height = integer(image.height, "providerOutput.image.height");
    if (width < 1 || height < 1) throw new TypeError("providerOutput.image dimensions must be positive");
    const warnings = candidate.warnings;
    if (warnings !== undefined && (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string"))) throw new TypeError("providerOutput.warnings must be string[]");
    return { schemaVersion: 2, targetId, generationSpecDigest: text(input.generationSpecDigest, "input.generationSpecDigest") as Digest, prompt, negativePrompt, image: { width, height }, warnings: (warnings as string[] | undefined) ?? [] };
  }

  private normalizeImageOutput(targetId: string, raw: unknown, input: Record<string, unknown>, projectId: string): ImageTaskOutput {
    const candidate = object(raw, "providerOutput");
    const rows = candidate.candidates;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 6) throw new TypeError("providerOutput.candidates must contain 1..6 items");
    const spec = object(input.promptSpec, "input.promptSpec");
    const requestedImage = object(spec.image, "input.promptSpec.image");
    const seen = new Set<number>();
    const candidates: NormalizedImageArtifact[] = rows.map((row, index) => {
      const value = object(row, `providerOutput.candidates[${index}]`);
      const buffer = value.buffer instanceof Uint8Array ? Buffer.from(value.buffer) : null;
      if (!buffer || buffer.length === 0) throw new TypeError(`providerOutput.candidates[${index}].buffer must be non-empty`);
      const itemIndex = value.index === undefined ? index + 1 : integer(value.index, `providerOutput.candidates[${index}].index`);
      if (itemIndex < 1 || itemIndex > 6 || seen.has(itemIndex)) throw new TypeError("providerOutput candidate index must be unique 1..6");
      seen.add(itemIndex);
      const mimeType = typeof value.mimeType === "string" && value.mimeType.trim() ? value.mimeType : "image/webp";
      const dimensions = readImageDimensions(buffer) ?? { width: integer(requestedImage.width, "input.promptSpec.image.width"), height: integer(requestedImage.height, "input.promptSpec.image.height") };
      const sha256 = `sha256:${createHash("sha256").update(buffer).digest("hex")}` as `sha256:${string}`;
      return {
        index: itemIndex, buffer, mimeType, width: dimensions.width, height: dimensions.height,
        warnings: Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string") : [],
        candidateId: randomUUID(), assetId: randomUUID(), storageKey: `projects/${projectId}/chapters/${text(input.chapterId, "input.chapterId")}/shots/${targetId}/candidates/${randomUUID()}.${mimeType.includes("png") ? "png" : mimeType.includes("jpeg") ? "jpg" : "webp"}`,
        sha256, bytes: buffer.length,
      };
    });
    const warnings = candidate.warnings;
    return { schemaVersion: 2, targetId, generationSpecDigest: text(input.generationSpecDigest, "input.generationSpecDigest") as Digest, candidates, warnings: Array.isArray(warnings) ? warnings.filter((warning): warning is string => typeof warning === "string") : [] };
  }

  private serializableOutput(output: NormalizedTaskOutput): Record<string, unknown> {
    if (!("candidates" in output)) return output as unknown as Record<string, unknown>;
    return {
      schemaVersion: output.schemaVersion,
      targetId: output.targetId,
      generationSpecDigest: output.generationSpecDigest,
      candidates: output.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        assetId: candidate.assetId,
        index: candidate.index,
        storageKey: candidate.storageKey,
        mimeType: candidate.mimeType,
        width: candidate.width,
        height: candidate.height,
        sha256: candidate.sha256,
        bytes: candidate.bytes,
      })),
      warnings: output.warnings,
    };
  }

  private async writeImageArtifacts(output: NormalizedTaskOutput): Promise<string[]> {
    if (!("candidates" in output)) return [];
    const paths: string[] = [];
    try {
      for (const candidate of output.candidates) {
        const absolutePath = this.workspacePath.resolveVirtualPath(`/workspace/${candidate.storageKey}`);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, candidate.buffer);
        paths.push(absolutePath);
      }
      return paths;
    } catch (error) {
      await this.removeImageArtifacts(paths);
      throw error;
    }
  }

  private async removeImageArtifacts(paths: readonly string[]): Promise<void> {
    await Promise.all(paths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
  }

  private async persistImageArtifacts(
    tx: Prisma.TransactionClient,
    claim: ClaimedPersistentTask,
    output: ImageTaskOutput,
    input: Record<string, unknown>,
    sourceDigest: Digest,
  ): Promise<void> {
    const promptDigest = output.generationSpecDigest;
    const now = new Date();
    for (const candidate of output.candidates) {
      const metadata = {
        schemaVersion: 1,
        taskId: claim.item.id,
        shotId: output.targetId,
        sourceDigest,
        generationSpecDigest: output.generationSpecDigest,
        requestId: input.requestId ?? null,
      };
      const metadataDigest = digestCanonicalJson(metadata);
      await tx.asset.create({
        data: {
          id: candidate.assetId,
          projectId: claim.item.projectId,
          chapterId: text(input.chapterId, "input.chapterId"),
          type: "image",
          role: "shot_candidate",
          mimeType: candidate.mimeType,
          storageKey: candidate.storageKey,
          status: "staged",
          sha256: null,
          bytes: null,
          width: null,
          height: null,
          sourceTaskId: claim.item.id,
          metadataJson: metadata,
          metadataSchemaVersion: 1,
          metadataDigest,
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.asset.update({
        where: { id: candidate.assetId },
        data: { status: "ready", sha256: candidate.sha256, bytes: candidate.bytes, width: candidate.width, height: candidate.height, readyAt: now },
      });
      await tx.candidate.create({
        data: {
          id: candidate.candidateId,
          projectId: claim.item.projectId,
          chapterId: text(input.chapterId, "input.chapterId"),
          shotId: output.targetId,
          taskId: claim.item.id,
          assetId: candidate.assetId,
          index: candidate.index,
          status: "generated",
          label: `候选 ${candidate.index}`,
          notes: "",
          promptDigest,
          generationPurpose: "shot_clean_plate",
          generationSpecVersion: 2,
          generationSpecDigest: output.generationSpecDigest,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  private async runStoryProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const chapter = await this.prismaService.database().chapter.findUnique({ where: { id: text(context.input.chapterId, "input.chapterId") }, include: { currentScriptVersion: true } });
    if (!chapter?.currentScriptVersion) throw new Error("SCRIPT_VERSION_MISSING");
    const instruction = typeof context.input.instruction === "string" ? context.input.instruction : "";
    const response = await this.openCode.sendMessage({
      sessionId: await this.openCode.createSession(`story_parse:${chapter.id}`),
      content: [
        "请把下面章节剧本转换为严格的 StoryDocumentV2 JSON。只输出 JSON 对象，不要 Markdown。",
        "必须保留 schemaVersion=2、chapterId，并为 direction、characters、scenes、beats、notes 提供完整字段。",
        `用户补充要求：${instruction || "无"}`,
        `chapterId=${chapter.id}`,
        "剧本：",
        chapter.currentScriptVersion.sourceText,
      ].join("\n\n"),
    });
    return parseProviderJson(response.content);
  }

  private async runShotProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const chapter = await this.prismaService.database().chapter.findUnique({ where: { id: text(context.input.chapterId, "input.chapterId") }, include: { currentStoryVersion: true } });
    if (!chapter?.currentStoryVersion) throw new Error("STORY_VERSION_MISSING");
    const instruction = typeof context.input.instruction === "string" ? context.input.instruction : "";
    const response = await this.openCode.sendMessage({
      sessionId: await this.openCode.createSession(`shot_generate:${chapter.id}`),
      content: [
        "请根据下面 StoryDocumentV2 生成严格的 StoryboardDocumentV2 JSON。只输出 JSON 对象，不要 Markdown。",
        "如果需要使用镜头 id，只能使用已有镜头 id；无法确定时返回 shots=[]，不要捏造数据库 id。",
        `用户补充要求：${instruction || "无"}`,
        `chapterId=${chapter.id}`,
        "故事结构：",
        JSON.stringify(chapter.currentStoryVersion.documentJson),
      ].join("\n\n"),
    });
    return parseProviderJson(response.content);
  }

  private async runShotPromptProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const input = context.input;
    const spec = object(input.promptSpec, "input.promptSpec");
    return {
      schemaVersion: 2,
      targetId: text(input.shotId, "input.shotId"),
      generationSpecDigest: text(input.generationSpecDigest, "input.generationSpecDigest"),
      prompt: text(spec.positivePrompt, "input.promptSpec.positivePrompt"),
      negativePrompt: text(spec.negativePrompt, "input.promptSpec.negativePrompt"),
      image: object(spec.image, "input.promptSpec.image"),
      warnings: [],
    };
  }

  private async runImageProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const input = context.input;
    const spec = object(input.promptSpec, "input.promptSpec");
    const image = object(spec.image, "input.promptSpec.image");
    const width = integer(image.width, "input.promptSpec.image.width");
    const height = integer(image.height, "input.promptSpec.image.height");
    const count = integer(input.candidateCount, "input.candidateCount");
    const size = `${width}x${height}`;
    const references: Array<{ assetId: string; kind: "character_identity" | "scene_environment"; label: string; priority: number; buffer: Buffer; mimeType: string; fileName: string }> = [];
    const referenceRows = Array.isArray(spec.referenceAssets) ? spec.referenceAssets : [];
    const assetIds = referenceRows.map((row) => object(row, "input.promptSpec.referenceAssets[]")).map((row) => text(row.assetId, "reference.assetId"));
    if (assetIds.length > 0) {
      const assets = await this.prismaService.database().asset.findMany({ where: { id: { in: assetIds }, projectId: context.task.item.projectId, status: "ready" } });
      for (const [index, row] of referenceRows.entries()) {
        const reference = object(row, `input.promptSpec.referenceAssets[${index}]`);
        const asset = assets.find((candidate) => candidate.id === reference.assetId);
        if (!asset) continue;
        try {
          references.push({
            assetId: asset.id,
            kind: reference.kind === "scene_environment" ? "scene_environment" : "character_identity",
            label: typeof reference.label === "string" ? reference.label : asset.id,
            priority: 100 - index,
            buffer: await readFile(this.workspacePath.resolveVirtualPath(`/workspace/${asset.storageKey}`)),
            mimeType: asset.mimeType,
            fileName: path.basename(asset.storageKey),
          });
        } catch {
          // Missing files are not allowed to become a silent current source;
          // the DB source projection still records the expected visual.
        }
      }
    }
    const candidates: ImageArtifact[] = [];
    for (let index = 1; index <= count; index += 1) {
      const result = await this.imageProvider.generateCandidateImage({
        prompt: text(spec.positivePrompt, "input.promptSpec.positivePrompt"),
        size,
        references,
        quality: "high",
        outputFormat: "webp",
      });
      const dimensions = readImageDimensions(result.buffer) ?? { width, height };
      candidates.push({ index, buffer: result.buffer, mimeType: "image/webp", width: dimensions.width, height: dimensions.height, warnings: result.warnings });
    }
    return { schemaVersion: 2, targetId: text(input.shotId, "input.shotId"), generationSpecDigest: text(input.generationSpecDigest, "input.generationSpecDigest"), candidates, warnings: [] };
  }
}
