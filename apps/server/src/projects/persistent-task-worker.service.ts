import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  encodeStoryDocumentV2,
  encodeStoryboardDocumentV2,
  digestCanonicalJson,
  StoryDocumentCodecV2,
  taskSourceProjectionDigest,
  LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
  type Digest,
  type GenerationTaskItem,
  type GenerationTaskType,
  type StoryboardDocumentV2,
  type StoryStructureJson,
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
import {
  parseCandidateReferencePlanEvidence,
  type CandidateImageReferenceInput,
  type CandidateReferencePlanEvidence,
} from "./candidate-reference-plan.js";
import { compileImagePromptForProvider } from "./image-prompt-profile.util.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { detectImageMimeType, readImageDimensions } from "./image-dimensions.util.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";
import { LayoutPublicationWorkerService } from "./layout-publication-worker.service.js";
import {
  buildStoryStructurePromptFromFacts,
  buildStoryStructureRepairPrompt,
  buildStoryboardPromptFromFacts,
  buildStoryboardRepairPrompt,
} from "../dialogue/dialogue-prompt.util.js";
import { buildStoryboardDialogueReference } from "../dialogue/storyboard-dialogue-reference.util.js";
import { normalizeStoryboardJson, parseStoryStructureJson } from "../dialogue/dialogue-json.util.js";
import {
  assertStoryStructureQuality,
  StoryStructureQualityError,
} from "../dialogue/story-structure-quality.util.js";
import {
  assertStoryboardGenerationOutputContract,
  assertStoryboardQuality,
  StoryboardQualityError,
} from "../dialogue/storyboard-quality.util.js";
import { resolveStoryboardReferences } from "../dialogue/storyboard-reference.util.js";
import { getErrorMessage } from "../dialogue/dialogue-text.util.js";
import { toStoryDocumentV2 } from "./versioning/story-document-adapter.util.js";

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
  readonly referencePlan?: CandidateReferencePlanEvidence;
  readonly generationMode?: "image_generation" | "single_image_edit" | "multi_image_edit";
  readonly requestedSize?: { readonly width: number; readonly height: number };
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

interface CharacterReferenceTaskOutput {
  readonly schemaVersion: 1;
  readonly characterId: string;
  readonly referenceKind: "preview_front" | "final_reference";
  readonly generationSpecDigest: Digest;
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: `sha256:${string}`;
  readonly bytes: number;
  readonly warnings: readonly string[];
  readonly sourceVisualId?: string;
}
interface SceneReferenceTaskOutput {
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly chapterId: string;
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: `sha256:${string}`;
  readonly bytes: number;
  readonly warnings: readonly string[];
}

type NormalizedTaskOutput = VersionDocumentTaskOutputV2 | ShotPromptTaskOutput | ImageTaskOutput | CharacterReferenceTaskOutput | SceneReferenceTaskOutput;

const HANDLED_TASK_TYPES = ["character_reference_generate", "scene_reference_generate", "story_parse", "shot_generate", "shot_prompt_generate", "image_generate", "layout_export"] as const;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RETRY_DELAY_MS = 5_000;

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function assertGenerationPromptSpecV2(
  spec: Record<string, unknown>,
): asserts spec is Record<string, unknown> & {
  schemaVersion: 2;
  sizePolicyVersion: typeof LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION;
  image: { width: number; height: number; sizePolicyVersion: typeof LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION };
} {
  if (
    spec.schemaVersion !== 2 ||
    spec.sizePolicyVersion !== LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION
  ) {
    throw new Error("LEGACY_GENERATION_INPUT_UNSUPPORTED");
  }
  const image = object(spec.image, "input.promptSpec.image");
  if (image.sizePolicyVersion !== LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION) {
    throw new Error("LEGACY_GENERATION_INPUT_UNSUPPORTED");
  }
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
    @Inject(LayoutPublicationWorkerService) private readonly layoutPublicationWorker: LayoutPublicationWorkerService,
    @Optional() @Inject(MaintenanceCoordinator) private readonly maintenance?: MaintenanceCoordinator,
  ) {
    this.handlers.set("character_reference_generate", (context) => this.runCharacterReferenceProvider(context));
    this.handlers.set("scene_reference_generate", (context) => this.runSceneReferenceProvider(context));
    this.handlers.set("story_parse", (context) => this.runStoryProvider(context));
    this.handlers.set("shot_generate", (context) => this.runShotProvider(context));
    this.handlers.set("shot_prompt_generate", (context) => this.runShotPromptProvider(context));
    this.handlers.set("image_generate", (context) => this.runImageProvider(context));
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /** Register a deterministic/local provider (also useful for integration tests). */
  setHandler(type: GenerationTaskType, handler: PersistentTaskHandler): void {
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
    const execute = () => this.runOnceInternal(workerId, now);
    return this.maintenance ? this.maintenance.runMutation("tasks.worker", execute, "tasks") : execute();
  }

  private async runOnceInternal(workerId: string, now = new Date()): Promise<GenerationTaskItem | null> {
    if (!this.prismaService.isDatabaseMode()) return null;
    if (this.running) return null;
    this.running = true;
    try {
      const claim = await this.tasks.claimNext(workerId, now, HANDLED_TASK_TYPES);
      if (!claim) return null;
      if (claim.item.type === "layout_export" && claim.item.target?.type === "export") {
        const heartbeat = setInterval(() => {
          void this.tasks.heartbeat(claim.item.id, claim.claimToken, new Date()).catch(() => undefined);
        }, HEARTBEAT_INTERVAL_MS);
        try {
          return await this.layoutPublicationWorker.run(claim);
        } finally {
          clearInterval(heartbeat);
        }
      }
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
    const operation = claim.item.type as GenerationTaskType;
    if (operation === "character_reference_generate") return this.completeCharacterReferenceClaim(claim, raw);
    if (operation === "scene_reference_generate") return this.completeSceneReferenceClaim(claim, raw);
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
    const output = this.normalizeOutput(operation as "story_parse" | "shot_generate" | "shot_prompt_generate" | "image_generate", targetId, chapterId, raw, input, claim.item.projectId);
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
      const gate = await this.applicability.evaluate(scope, operation as "story_parse" | "shot_generate" | "shot_prompt_generate" | "image_generate", operation === "story_parse" || operation === "shot_generate"
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

  private async completeCharacterReferenceClaim(claim: ClaimedPersistentTask, raw: unknown): Promise<GenerationTaskItem> {
    const input = claim.item.input;
    const output = this.normalizeCharacterReferenceOutput(raw, input);
    const relativePath = this.characterReferenceStorageKey(claim.item.projectId, output.characterId, output.referenceKind, await this.nextCharacterVisualVersion(output.characterId) + 1);
    const absolutePath = this.workspacePath.resolveVirtualPath(`/workspace/${relativePath}`);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, output.buffer);
    try {
      const sourceProjection = object(input.sourceProjection, "input.sourceProjection") as unknown as TaskSourceProjectionV1;
      const sourceDigest = taskSourceProjectionDigest(sourceProjection);
      const result = await this.prismaService.runBusinessTransaction(async (tx) => {
        const persisted = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
        if (!persisted || persisted.status !== "running" || persisted.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
        if (persisted.sourceDigest !== sourceDigest) throw new TypeError("TASK_SOURCE_DIGEST_MISMATCH");
        const character = await tx.character.findFirst({ where: { id: output.characterId, projectId: claim.item.projectId } });
        if (!character) throw new Error("CHARACTER_NOT_FOUND");
        const source = sourceProjection.sources.find((item) => item.sourceType === "character");
        const currentDigest = digestCanonicalJson({ id: character.id, name: character.name, role: character.role, level: character.level, entityType: character.entityType, appearance: character.appearance, personality: character.personality, promptFragment: character.promptFragment, rowVersion: character.rowVersion });
        const applicability = source?.sourceDigest === currentDigest ? "current" : "historical";
        const sourceVisual = output.referenceKind === "final_reference" && output.sourceVisualId
          ? await tx.characterVisual.findFirst({
            where: { id: output.sourceVisualId, characterId: output.characterId },
            include: { asset: { select: { status: true } } },
          })
          : null;
        if (output.referenceKind === "final_reference" && output.sourceVisualId && (
          !sourceVisual
          || (sourceVisual.kind !== "preview_front" && sourceVisual.kind !== "single_front")
          || sourceVisual.status !== "available"
          || sourceVisual.asset.status !== "ready"
        )) {
          throw new Error("CHARACTER_FINAL_SOURCE_VISUAL_INVALID");
        }
        const finalSourceVisualId = sourceVisual?.id ?? null;
        const now = new Date();
        const metadata = { schemaVersion: 1, taskId: claim.item.id, characterId: output.characterId, referenceKind: output.referenceKind, sourceVisualId: finalSourceVisualId, sourceDigest, generationSpecDigest: output.generationSpecDigest, warnings: output.warnings };
        const assetId = randomUUID();
        const visualId = randomUUID();
        const version = await this.nextCharacterVisualVersion(output.characterId, tx) + 1;
        const storageKey = this.characterReferenceStorageKey(claim.item.projectId, output.characterId, output.referenceKind, version);
        await tx.asset.create({ data: { id: assetId, projectId: claim.item.projectId, chapterId: null, type: "image", role: "character_reference", mimeType: output.mimeType, storageKey, status: "staged", sha256: null, bytes: null, width: null, height: null, durationMs: null, sourceTaskId: claim.item.id, metadataJson: metadata, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson(metadata), createdAt: now, updatedAt: now } });
        await tx.asset.update({ where: { id: assetId }, data: { status: "ready", sha256: output.sha256, bytes: output.bytes, width: output.width, height: output.height, readyAt: now } });
        await tx.characterVisual.create({ data: { id: visualId, characterId: output.characterId, assetId, kind: output.referenceKind, version, sourceVisualId: finalSourceVisualId, status: "available", createdAt: now, confirmedAt: output.referenceKind === "final_reference" ? now : null } });
        if (applicability === "current" && output.referenceKind === "preview_front") {
          await tx.character.update({ where: { id: output.characterId }, data: { previewVisualId: visualId, rowVersion: { increment: 1 } } });
        }
        const finished = await this.tasks.finishInTransaction(tx, { taskId: claim.item.id, claimToken: claim.claimToken, outcome: "succeeded", output: { schemaVersion: 1, characterId: output.characterId, referenceKind: output.referenceKind, sourceVisualId: finalSourceVisualId, assetId, visualId, storageKey, sha256: output.sha256, bytes: output.bytes, width: output.width, height: output.height, warnings: output.warnings }, applicability });
        return { finished, storageKey };
      });
      if (result.storageKey !== relativePath) {
        const finalPath = this.workspacePath.resolveVirtualPath(`/workspace/${result.storageKey}`);
        await mkdir(path.dirname(finalPath), { recursive: true });
        await writeFile(finalPath, output.buffer);
        await rm(absolutePath, { force: true });
      }
      return result.finished;
    } catch (error) {
      await rm(absolutePath, { force: true });
      throw error;
    }
  }

  private async completeSceneReferenceClaim(claim: ClaimedPersistentTask, raw: unknown): Promise<GenerationTaskItem> {
    const input = claim.item.input;
    const output = this.normalizeSceneReferenceOutput(raw, input);
    const db = this.prismaService.database();
    const scene = await db.chapterScene.findFirst({ where: { id: output.sceneId, projectId: claim.item.projectId, chapterId: output.chapterId } });
    if (!scene) throw new Error("SCENE_DB_NOT_FOUND");
    // 每次重生成必须写入独立路径。若复用 scene/background.webp，后续 DB
    // 唯一约束失败时的清理会误删当前仍在使用的旧场景图。
    const assetId = randomUUID();
    const visualId = randomUUID();
    const relativePath = `projects/${claim.item.projectId}/chapters/${output.chapterId}/scenes/${scene.sceneKey}/visuals/${assetId}/background.webp`;
    const absolutePath = this.workspacePath.resolveVirtualPath(`/workspace/${relativePath}`);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, output.buffer);
    try {
      const projection = object(input.sourceProjection, "input.sourceProjection") as unknown as TaskSourceProjectionV1;
      const sourceDigest = taskSourceProjectionDigest(projection);
      const source = projection.sources.find((item) => item.sourceType === "chapter_scene");
      const currentDigest = digestCanonicalJson({ id: scene.id, projectId: scene.projectId, chapterId: scene.chapterId, sceneKey: scene.sceneKey, updatedAt: scene.updatedAt.toISOString() });
      const applicability = source?.sourceDigest === currentDigest ? "current" : "historical";
      const result = await this.prismaService.runBusinessTransaction(async (tx) => {
        const persisted = await tx.generationTask.findUnique({ where: { id: claim.item.id } });
        if (!persisted || persisted.status !== "running" || persisted.leaseToken !== claim.claimToken) throw new TaskLeaseLostError(claim.item.id);
        if (persisted.sourceDigest !== sourceDigest) throw new TypeError("TASK_SOURCE_DIGEST_MISMATCH");
        const latest = await tx.sceneVisual.findFirst({ where: { chapterSceneId: scene.id }, orderBy: { version: "desc" }, select: { version: true } });
        const version = (latest?.version ?? 0) + 1;
        const now = new Date();
        const metadata = { schemaVersion: 1, taskId: claim.item.id, sceneId: scene.id, chapterId: output.chapterId, sourceDigest, warnings: output.warnings };
        await tx.asset.create({ data: { id: assetId, projectId: claim.item.projectId, chapterId: output.chapterId, type: "image", role: "scene_reference", mimeType: output.mimeType, storageKey: relativePath, status: "staged", sha256: null, bytes: null, width: null, height: null, durationMs: null, sourceTaskId: claim.item.id, metadataJson: metadata, metadataSchemaVersion: 1, metadataDigest: digestCanonicalJson(metadata), createdAt: now, updatedAt: now } });
        await tx.asset.update({ where: { id: assetId }, data: { status: "ready", sha256: output.sha256, bytes: output.bytes, width: output.width, height: output.height, readyAt: now } });
        await tx.sceneVisual.create({ data: { id: visualId, chapterSceneId: scene.id, assetId, sourceTaskId: claim.item.id, version, createdAt: now } });
        if (applicability === "current") await tx.chapterScene.update({ where: { id: scene.id }, data: { currentVisualId: visualId, updatedAt: now } });
        return this.tasks.finishInTransaction(tx, { taskId: claim.item.id, claimToken: claim.claimToken, outcome: "succeeded", output: { schemaVersion: 1, sceneId: scene.id, chapterId: output.chapterId, assetId, visualId, storageKey: relativePath, sha256: output.sha256, bytes: output.bytes, width: output.width, height: output.height, warnings: output.warnings }, applicability });
      });
      return result;
    } catch (error) {
      await rm(absolutePath, { force: true });
      throw error;
    }
  }

  private characterReferenceStorageKey(projectId: string, characterId: string, referenceKind: "preview_front" | "final_reference", version: number): string {
    return `projects/${projectId}/assets/characters/${characterId}/visual-v${String(version).padStart(3, "0")}/${referenceKind === "final_reference" ? "final-reference.webp" : "preview.webp"}`;
  }

  private async nextCharacterVisualVersion(characterId: string, tx?: Pick<Prisma.TransactionClient, "characterVisual">): Promise<number> {
    const reader = tx ?? this.prismaService.database();
    const latest = await reader.characterVisual.findFirst({ where: { characterId }, orderBy: { version: "desc" }, select: { version: true } });
    return latest?.version ?? 0;
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

  private normalizeOutput(operation: GenerationTaskType, targetId: string, chapterId: string, raw: unknown, input: Record<string, unknown>, projectId: string): NormalizedTaskOutput {
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

  private normalizeCharacterReferenceOutput(raw: unknown, input: Record<string, unknown>): CharacterReferenceTaskOutput {
    const candidate = object(raw, "providerOutput");
    const buffer = candidate.buffer instanceof Uint8Array ? Buffer.from(candidate.buffer) : null;
    if (!buffer || buffer.length === 0) throw new TypeError("providerOutput.buffer must be non-empty");
    const referenceKind = input.referenceKind === "final_reference" ? "final_reference" : input.referenceKind === "preview_front" ? "preview_front" : null;
    if (!referenceKind) throw new TypeError("input.referenceKind must be a supported character reference kind");
    const characterId = text(input.characterId, "input.characterId");
    const dimensions = readImageDimensions(buffer);
    if (!dimensions) throw new TypeError("providerOutput.buffer must be a supported image");
    const mimeType = typeof candidate.mimeType === "string" && candidate.mimeType.trim() ? candidate.mimeType : "image/webp";
    const warnings = Array.isArray(candidate.warnings) ? candidate.warnings.filter((warning): warning is string => typeof warning === "string") : [];
    return {
      schemaVersion: 1,
      characterId,
      referenceKind,
      generationSpecDigest: digestCanonicalJson({ prompt: input.prompt, referenceKind, characterId }),
      buffer,
      mimeType,
      width: dimensions.width,
      height: dimensions.height,
      sha256: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
      bytes: buffer.length,
      warnings,
      ...(referenceKind === "final_reference" && typeof candidate.sourceVisualId === "string" && candidate.sourceVisualId.trim()
        ? { sourceVisualId: candidate.sourceVisualId }
        : {}),
    };
  }

  private normalizeSceneReferenceOutput(raw: unknown, input: Record<string, unknown>): SceneReferenceTaskOutput {
    const candidate = object(raw, "providerOutput");
    const buffer = candidate.buffer instanceof Uint8Array ? Buffer.from(candidate.buffer) : null;
    if (!buffer || buffer.length === 0) throw new TypeError("providerOutput.buffer must be non-empty");
    const dimensions = readImageDimensions(buffer);
    if (!dimensions) throw new TypeError("providerOutput.buffer must be a supported image");
    return { schemaVersion: 1, sceneId: text(input.sceneId, "input.sceneId"), chapterId: text(input.chapterId, "input.chapterId"), buffer, mimeType: typeof candidate.mimeType === "string" && candidate.mimeType.trim() ? candidate.mimeType : "image/webp", width: dimensions.width, height: dimensions.height, sha256: `sha256:${createHash("sha256").update(buffer).digest("hex")}`, bytes: buffer.length, warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((warning): warning is string => typeof warning === "string") : [] };
  }

  private normalizeShotPromptOutput(targetId: string, raw: unknown, input: Record<string, unknown>): ShotPromptTaskOutput {
    const candidate = object(raw, "providerOutput");
    const spec = object(input.promptSpec, "input.promptSpec");
    assertGenerationPromptSpecV2(spec);
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
    assertGenerationPromptSpecV2(spec);
    const requestedImage = object(spec.image, "input.promptSpec.image");
    const seen = new Set<number>();
    const candidates: NormalizedImageArtifact[] = rows.map((row, index) => {
      const value = object(row, `providerOutput.candidates[${index}]`);
      const buffer = value.buffer instanceof Uint8Array ? Buffer.from(value.buffer) : null;
      if (!buffer || buffer.length === 0) throw new TypeError(`providerOutput.candidates[${index}].buffer must be non-empty`);
      const itemIndex = value.index === undefined ? index + 1 : integer(value.index, `providerOutput.candidates[${index}].index`);
      if (itemIndex < 1 || itemIndex > 6 || seen.has(itemIndex)) throw new TypeError("providerOutput candidate index must be unique 1..6");
      seen.add(itemIndex);
      const declaredMimeType = typeof value.mimeType === "string" && value.mimeType.trim() ? value.mimeType : "image/webp";
      const mimeType = detectImageMimeType(buffer);
      if (!mimeType) throw new TypeError(`providerOutput.candidates[${index}].buffer must be PNG, JPEG or WebP`);
      const dimensions = readImageDimensions(buffer) ?? { width: integer(requestedImage.width, "input.promptSpec.image.width"), height: integer(requestedImage.height, "input.promptSpec.image.height") };
      const sha256 = `sha256:${createHash("sha256").update(buffer).digest("hex")}` as `sha256:${string}`;
      const referencePlan = value.referencePlan === undefined
        ? undefined
        : parseCandidateReferencePlanEvidence(value.referencePlan);
      const generationMode = value.generationMode === "image_generation"
        || value.generationMode === "single_image_edit"
        || value.generationMode === "multi_image_edit"
        ? value.generationMode
        : undefined;
      return {
        index: itemIndex, buffer, mimeType, width: dimensions.width, height: dimensions.height,
        warnings: [
          ...(Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string") : []),
          ...(declaredMimeType === mimeType ? [] : [`candidate_output_mime_normalized:${declaredMimeType}:${mimeType}`]),
        ],
        ...(referencePlan ? { referencePlan } : {}),
        ...(generationMode ? { generationMode } : {}),
        requestedSize: {
          width: integer(requestedImage.width, "input.promptSpec.image.width"),
          height: integer(requestedImage.height, "input.promptSpec.image.height"),
        },
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
        warnings: candidate.warnings ?? [],
        referencePlan: candidate.referencePlan ?? null,
        generationMode: candidate.generationMode ?? null,
        requestedSize: candidate.requestedSize ?? null,
        actualSize: { width: candidate.width, height: candidate.height },
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
        schemaVersion: 2,
        taskId: claim.item.id,
        shotId: output.targetId,
        sourceDigest,
        generationSpecDigest: output.generationSpecDigest,
        requestId: typeof input.requestId === "string" ? input.requestId : null,
        referenceAssetIds: candidate.referencePlan?.usedReferenceAssetIds ?? [],
        referencePlan: candidate.referencePlan
          ? JSON.parse(JSON.stringify(candidate.referencePlan)) as Prisma.InputJsonValue
          : null,
        warnings: [...(candidate.warnings ?? [])],
        providerType: candidate.referencePlan?.providerType ?? null,
        generationMode: candidate.generationMode ?? null,
        requestedSize: candidate.requestedSize ?? null,
        actualSize: { width: candidate.width, height: candidate.height },
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
          metadataSchemaVersion: 2,
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
    const chapterId = text(context.input.chapterId, "input.chapterId");
    const projection = object(context.input.sourceProjection, "input.sourceProjection") as unknown as TaskSourceProjectionV1;
    const source = projection.sources.find((item) => item.sourceType === "chapter_script_version");
    if (!source) throw new Error("SCRIPT_VERSION_SOURCE_MISSING");
    const db = this.prismaService.database();
    const [chapter, scriptVersion] = await Promise.all([
      db.chapter.findUnique({
        where: { id: chapterId },
        include: { project: true },
      }),
      db.chapterScriptVersion.findFirst({
        where: { id: source.sourceId, chapterId },
      }),
    ]);
    if (!chapter) throw new Error("CHAPTER_NOT_FOUND");
    if (!scriptVersion) throw new Error("SCRIPT_VERSION_MISSING");
    if (scriptVersion.sourceDigest !== source.sourceDigest) throw new Error("SCRIPT_VERSION_SOURCE_DIGEST_MISMATCH");
    const instruction = typeof context.input.instruction === "string" ? context.input.instruction : "";
    const sessionId = await this.openCode.createSession(`story_parse:${chapter.id}`);
    const prompt = buildStoryStructurePromptFromFacts({
      project: {
        name: chapter.project.name,
        storyTitle: chapter.project.storyTitle ?? "",
      },
      chapter: {
        title: chapter.title,
        status: chapter.milestoneStatus,
        currentScriptVersionId: scriptVersion.id,
        sourceText: scriptVersion.sourceText,
      },
      // 持久任务只使用 sourceProjection 已冻结的事实；当前任务协议尚未冻结 Outline，
      // 因而不能在运行时读取可能已经变化的项目大纲。
      scriptOutline: null,
    }, instruction.trim() || "生成当前章节剧情结构");

    const validate = (content: string) => {
      const structure = parseStoryStructureJson(
        content,
        chapter.id,
        chapter.title,
        scriptVersion.id,
      );
      assertStoryStructureQuality(structure, scriptVersion.sourceText);
      return toStoryDocumentV2(structure);
    };

    const response = await this.openCode.sendMessage({
      sessionId,
      content: prompt,
    });
    try {
      return validate(response.content);
    } catch (error) {
      const repaired = await this.openCode.sendMessage({
        sessionId,
        content: buildStoryStructureRepairPrompt({
          originalPrompt: prompt,
          invalidOutput: response.content,
          validationError: getErrorMessage(error),
          qualityIssues: error instanceof StoryStructureQualityError ? error.issues : undefined,
        }),
      });
      return validate(repaired.content);
    }
  }

  private async runCharacterReferenceProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const input = context.input;
    const characterId = text(input.characterId, "input.characterId");
    const referenceKind = input.referenceKind === "final_reference" ? "final_reference" : input.referenceKind === "preview_front" ? "preview_front" : null;
    if (!referenceKind) throw new TypeError("input.referenceKind must be a supported character reference kind");
    const character = await this.prismaService.database().character.findFirst({ where: { id: characterId, projectId: context.task.item.projectId }, include: { previewVisual: { include: { asset: true } } } });
    if (!character) throw new Error("CHARACTER_NOT_FOUND");
    const prompt = text(input.prompt, "input.prompt");
    const size = typeof input.size === "string" && input.size.trim() ? input.size : referenceKind === "final_reference" ? "3072x1536" : "1536x2048";
    let buffer: Buffer;
    if (referenceKind === "final_reference") {
      const asset = character.previewVisual?.asset;
      if (!asset || asset.status !== "ready") throw new Error("CHARACTER_PREVIEW_REFERENCE_REQUIRED");
      const referencePath = this.workspacePath.resolveVirtualPath(`/workspace/${asset.storageKey}`);
      buffer = await this.imageProvider.editImage({ prompt, size, quality: input.quality === "low" || input.quality === "medium" || input.quality === "high" ? input.quality : "high", outputFormat: "webp", referenceImage: { buffer: await readFile(referencePath), mimeType: asset.mimeType, fileName: path.basename(asset.storageKey) } });
    } else {
      buffer = await this.imageProvider.generateImage({ prompt, size, quality: input.quality === "low" || input.quality === "medium" || input.quality === "high" ? input.quality : "high", outputFormat: "webp" });
    }
    return {
      buffer,
      mimeType: "image/webp",
      warnings: [],
      ...(referenceKind === "final_reference" && character.previewVisual
        ? { sourceVisualId: character.previewVisual.id }
        : {}),
    };
  }

  private async runSceneReferenceProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const input = context.input;
    const buffer = await this.imageProvider.generateImage({ prompt: text(input.prompt, "input.prompt"), size: "2560x1440", quality: "high", outputFormat: "webp" });
    return { buffer, mimeType: "image/webp", warnings: [] };
  }

  private async runShotProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const chapter = await this.prismaService.database().chapter.findUnique({
      where: { id: text(context.input.chapterId, "input.chapterId") },
      include: {
        project: true,
        currentStoryVersion: { include: { sourceScriptVersion: true } },
      },
    });
    if (!chapter?.currentStoryVersion) throw new Error("STORY_VERSION_MISSING");
    if (!chapter.currentStoryVersion.sourceScriptVersion) throw new Error("STORY_SOURCE_SCRIPT_VERSION_MISSING");
    const story = StoryDocumentCodecV2.parse(chapter.currentStoryVersion.documentJson);
    if (story.chapterId !== chapter.id) throw new Error("STORY_VERSION_CHAPTER_MISMATCH");
    const sourceText = chapter.currentStoryVersion.sourceScriptVersion.sourceText.trim();
    const structure: StoryStructureJson = {
      schemaVersion: 1,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceScriptVersionId: chapter.currentStoryVersion.sourceScriptVersionId,
      synopsis: story.synopsis,
      direction: story.direction,
      characters: story.characters,
      scenes: story.scenes,
      beats: story.beats,
      notes: story.notes,
      createdAt: chapter.currentStoryVersion.createdAt.toISOString(),
      updatedAt: chapter.currentStoryVersion.updatedAt.toISOString(),
    };
    const dialogueReference = buildStoryboardDialogueReference(sourceText, structure);
    const instruction = typeof context.input.instruction === "string" ? context.input.instruction : "";
    const sessionId = await this.openCode.createSession(`shot_generate:${chapter.id}`);
    const prompt = buildStoryboardPromptFromFacts({
      project: {
        name: chapter.project.name,
        storyTitle: chapter.project.storyTitle ?? "",
        comicFormat: chapter.project.comicFormat,
        artStyle: chapter.project.artStyle,
      },
      chapter: {
        title: chapter.title,
        status: chapter.milestoneStatus,
        currentStoryVersionId: chapter.currentStoryVersion.id,
        sourceText,
      },
      structure: story,
    }, instruction.trim() || "生成当前章节完整分镜", "generate", dialogueReference);

    const validate = (content: string): StoryboardDocumentV2 => {
      const providerOutput = parseProviderJson(content);
      assertStoryboardGenerationOutputContract(providerOutput);
      const storyboard = normalizeStoryboardJson(providerOutput, chapter.id, chapter.title, {
        sourceStoryVersionId: chapter.currentStoryVersion!.id,
      });
      assertStoryboardQuality(storyboard, structure, dialogueReference);
      const resolved = resolveStoryboardReferences(
        storyboard,
        structure,
        story.characters.map((character) => ({ id: character.projectCharacterId, name: character.name })),
      );
      return {
        schemaVersion: 2,
        chapterId: chapter.id,
        shots: resolved.shots.map((shot) => ({
          id: randomUUID(),
          order: shot.order,
          beatId: shot.beatId,
          sceneId: shot.sceneId,
          characterIds: shot.characterIds,
          coreAction: shot.coreAction,
          emotion: shot.emotion,
          shotType: shot.shotType,
          cameraAngle: shot.cameraAngle,
          comic: shot.comic,
          motion: shot.motion,
          promptDraft: shot.promptDraft,
        })),
        notes: resolved.notes,
      };
    };

    const response = await this.openCode.sendMessage({
      sessionId,
      content: prompt,
    });
    try {
      return validate(response.content);
    } catch (error) {
      const repaired = await this.openCode.sendMessage({
        sessionId,
        content: buildStoryboardRepairPrompt({
          originalPrompt: prompt,
          invalidOutput: response.content,
          validationError: getErrorMessage(error),
          qualityIssues: error instanceof StoryboardQualityError ? error.issues : undefined,
          mode: "generate",
        }),
      });
      return validate(repaired.content);
    }
  }

  private async runShotPromptProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const input = context.input;
    const spec = object(input.promptSpec, "input.promptSpec");
    assertGenerationPromptSpecV2(spec);
    return {
      schemaVersion: 2,
      targetId: text(input.shotId, "input.shotId"),
      generationSpecDigest: text(input.generationSpecDigest, "input.generationSpecDigest"),
      prompt: text(spec.providerPrompt ?? spec.positivePrompt, "input.promptSpec.providerPrompt"),
      negativePrompt: text(spec.negativePrompt, "input.promptSpec.negativePrompt"),
      image: object(spec.image, "input.promptSpec.image"),
      warnings: [],
    };
  }

  private async runImageProvider(context: PersistentTaskHandlerContext): Promise<unknown> {
    const input = context.input;
    const spec = object(input.promptSpec, "input.promptSpec");
    assertGenerationPromptSpecV2(spec);
    const image = object(spec.image, "input.promptSpec.image");
    const width = integer(image.width, "input.promptSpec.image.width");
    const height = integer(image.height, "input.promptSpec.image.height");
    const count = integer(input.candidateCount, "input.candidateCount");
    const size = `${width}x${height}`;
    const references: CandidateImageReferenceInput[] = [];
    const referenceRows = Array.isArray(spec.referenceAssets) ? spec.referenceAssets : [];
    const assetIds = referenceRows.map((row) => object(row, "input.promptSpec.referenceAssets[]")).map((row) => text(row.assetId, "reference.assetId"));
    if (assetIds.length > 0) {
      const assets = await this.prismaService.database().asset.findMany({
        where: { id: { in: assetIds }, projectId: context.task.item.projectId, status: "ready" },
        include: { characterVisualByAsset: { select: { kind: true } } },
      });
      for (const [index, row] of referenceRows.entries()) {
        const reference = object(row, `input.promptSpec.referenceAssets[${index}]`);
        const asset = assets.find((candidate) => candidate.id === reference.assetId);
        if (!asset) {
          throw new Error(`CANDIDATE_REQUIRED_REFERENCE_ASSET_MISSING:${text(reference.assetId, "reference.assetId")}`);
        }
        try {
          references.push({
            assetId: asset.id,
            kind: reference.kind === "scene_environment" ? "scene_environment" : "character_identity",
            label: typeof reference.label === "string" ? reference.label : asset.id,
            priority: typeof reference.priority === "number" && Number.isFinite(reference.priority)
              ? reference.priority
              : 100 - index,
            buffer: await readFile(this.workspacePath.resolveVirtualPath(`/workspace/${asset.storageKey}`)),
            mimeType: asset.mimeType,
            fileName: path.basename(asset.storageKey),
            sourceReferenceKind: reference.kind === "scene_environment"
              ? "scene_background"
              : reference.sourceReferenceKind === "final_reference"
                || asset.characterVisualByAsset?.kind === "final_reference"
                || asset.characterVisualByAsset?.kind === "turnaround_4view"
                ? "final_reference"
                : "preview_front",
          });
        } catch {
          throw new Error(`CANDIDATE_REQUIRED_REFERENCE_UNREADABLE:${asset.id}`);
        }
      }
    }
    const candidates: ImageArtifact[] = [];
    const activeProviderType = this.imageProvider.getActiveProviderType();
    const frozenProviderType = text(spec.providerType ?? activeProviderType, "input.promptSpec.providerType");
    if (frozenProviderType !== activeProviderType) throw new Error("IMAGE_PROVIDER_PROFILE_CHANGED");
    const compiledPrompt = spec.providerPrompt
      ? { prompt: text(spec.providerPrompt, "input.promptSpec.providerPrompt") }
      : compileImagePromptForProvider({
        providerType: activeProviderType,
        positivePrompt: text(spec.positivePrompt, "input.promptSpec.positivePrompt"),
        negativePrompt: text(spec.negativePrompt, "input.promptSpec.negativePrompt"),
      });
    for (let index = 1; index <= count; index += 1) {
      const result = await this.imageProvider.generateCandidateImage({
        prompt: compiledPrompt.prompt,
        size,
        references,
        quality: "high",
        outputFormat: "webp",
      });
      const dimensions = readImageDimensions(result.buffer) ?? { width, height };
      candidates.push({
        index,
        buffer: result.buffer,
        mimeType: "image/webp",
        width: dimensions.width,
        height: dimensions.height,
        warnings: result.warnings,
        referencePlan: result.referencePlan,
        generationMode: result.generationMode,
        requestedSize: { width, height },
      });
    }
    return { schemaVersion: 2, targetId: text(input.shotId, "input.shotId"), generationSpecDigest: text(input.generationSpecDigest, "input.generationSpecDigest"), candidates, warnings: [] };
  }
}
