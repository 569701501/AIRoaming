import { Inject, Injectable } from "@nestjs/common";
import {
  PreflightDocumentCodecV2,
  StoryDocumentCodecV2,
  StoryboardDocumentCodecV2,
  buildTaskSourceProjection,
  digestCanonicalJson,
  LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
  type CreateGenerationTaskRequest,
  type Digest,
  type TaskSourceProjectionV1,
} from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { NewWorkGateService } from "./versioning/new-work-gate.service.js";
import { ChapterVersionQueryRepository } from "./versioning/chapter-version-query.repository.js";
import { createG2DatabaseError } from "./versioning/g2-database-error.mapper.js";
import type { G2VersionTaskType, VersionScopeV1 } from "./versioning/versioning-database.types.js";
import { buildCandidatePromptContent } from "./candidate-generation-spec.js";
import { ImageProviderService } from "./image-provider.service.js";
import { compileImagePromptForProvider } from "./image-prompt-profile.util.js";

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field });
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field });
  return value;
}

function targetChapter(input: CreateGenerationTaskRequest): string {
  const targetChapterId = input.target?.chapterId?.trim() ?? "";
  const inputChapterId = typeof input.input?.chapterId === "string" ? input.input.chapterId.trim() : "";
  if (!targetChapterId && !inputChapterId) throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", { field: "chapterId" });
  if (targetChapterId && inputChapterId && targetChapterId !== inputChapterId) throw createG2DatabaseError(400, "VERSION_SCOPE_MISMATCH");
  return targetChapterId || inputChapterId;
}

function digest(value: string): Digest { return value as Digest; }

/**
 * DB-mode task creation is deliberately server-owned.  The caller may request
 * a target and an instruction, but it cannot supply a stale source projection
 * or generation prompt.  This service reads the current chain, checks
 * NewWorkGate, and freezes the exact input that the worker will later execute.
 */
@Injectable()
export class PersistentG2TaskCreateGuardService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ChapterVersionQueryRepository) private readonly chapterQuery: ChapterVersionQueryRepository,
    @Inject(NewWorkGateService) private readonly newWorkGate: NewWorkGateService,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
  ) {}

  async prepare(input: CreateGenerationTaskRequest): Promise<CreateGenerationTaskRequest> {
    if (!this.prismaService.isDatabaseMode()) return input;
    const operation = input.type as G2VersionTaskType;
    if (!["story_parse", "shot_generate", "shot_prompt_generate", "image_generate"].includes(operation)) {
      throw createG2DatabaseError(409, "LEGACY_WRITE_ROUTE_DISABLED", { type: input.type });
    }
    const chapterId = targetChapter(input);
    const scope: VersionScopeV1 = { projectId: text(input.projectId, "projectId"), chapterId };
    const row = await this.chapterQuery.findByScope(scope);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");

    if (operation === "story_parse" || operation === "shot_generate") {
      const expectedTargetId = text(input.input?.expectedTargetId ?? input.target?.id, "expectedTargetId");
      const pending = operation === "story_parse" ? row.pendingStoryVersion : row.pendingStoryboardVersion;
      if (!pending || pending.id !== expectedTargetId) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
      const expectedTargetRowVersion = integer(input.input?.expectedTargetRowVersion, "expectedTargetRowVersion", pending.rowVersion);
      const sourceId = operation === "story_parse" ? row.currentScriptVersionId : row.currentStoryVersionId;
      const sourceDigest = operation === "story_parse" ? row.currentScriptVersion?.sourceDigest : row.currentStoryVersion?.documentDigest;
      if (!sourceId || !sourceDigest) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
      await this.newWorkGate.assertAllowed(scope, operation, { expectedTargetId, expectedTargetRowVersion, sourceId, sourceDigest: digest(sourceDigest) });
      const sourceProjection = buildTaskSourceProjection({
        policyVersion: "g2-task-source-v1", projectId: scope.projectId, chapterId,
        consumerType: operation,
        sources: [{ role: "source", sourceType: operation === "story_parse" ? "chapter_script_version" : "story_version", sourceId, sourceDigest: digest(sourceDigest) }],
      });
      return {
        projectId: scope.projectId,
        type: operation,
        target: { type: "chapter", id: chapterId, chapterId },
        input: {
          schemaVersion: 2,
          chapterId,
          expectedTargetId,
          expectedTargetRowVersion,
          instruction: optionalText(input.input?.instruction),
          sourceProjection,
        },
        options: input.options,
      };
    }

    const shotId = text(input.input?.shotId ?? (input.target?.type === "shot" ? input.target.id : undefined), "shotId");
    if (input.target?.type && input.target.type !== "shot") throw createG2DatabaseError(400, "VERSION_SCOPE_MISMATCH");
    await this.newWorkGate.assertAllowed(scope, operation, { targetShotId: shotId });
    const db = this.prismaService.database();
    const board = row.currentStoryboardVersion;
    const preflight = row.currentPreflightRevision;
    if (!board || !preflight) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED");
    const projection = await db.storyboardShotProjection.findFirst({ where: { storyboardVersionId: board.id, shotId } });
    const shot = await db.shot.findFirst({ where: { id: shotId, projectId: scope.projectId, chapterId, lifecycleStatus: "active" } });
    if (!projection || !shot) throw createG2DatabaseError(409, "VERSION_SCOPE_MISMATCH");

    let story: ReturnType<typeof StoryDocumentCodecV2.parse>;
    let storyboard: ReturnType<typeof StoryboardDocumentCodecV2.parse>;
    let preflightDocument: ReturnType<typeof PreflightDocumentCodecV2.parse>;
    try {
      if (!row.currentStoryVersion) throw new Error("current story version missing");
      story = StoryDocumentCodecV2.parse(row.currentStoryVersion.documentJson);
      storyboard = StoryboardDocumentCodecV2.parse(board.documentJson);
      preflightDocument = PreflightDocumentCodecV2.parse(preflight.documentJson);
    } catch (error) {
      throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
    }
    const shotDocument = storyboard.shots.find((item) => item.id === shotId);
    if (!shotDocument) throw createG2DatabaseError(409, "VERSION_SCOPE_MISMATCH");
    const sourceProjection = this.buildShotProjection(scope, operation, shotId, board.id, board.documentDigest, projection.semanticDigest, preflight, preflightDocument, shotDocument);
    const promptSpec = await this.buildPromptSpec(scope, shotDocument, preflightDocument, story);
    const generationSpecDigest = digestCanonicalJson(promptSpec);
    const requestId = operation === "image_generate"
      ? text(input.input?.requestId ?? input.input?.idempotencyKey, "requestId")
      : undefined;
    const candidateCount = Math.min(6, Math.max(1, integer(input.input?.candidateCount, "candidateCount", 1)));
    const normalizedInput: Record<string, unknown> = {
      schemaVersion: 2,
      chapterId,
      shotId,
      promptSpec,
      generationSpecDigest,
      candidateCount,
      sourceProjection,
      ...(requestId ? { requestId } : {}),
    };
    return {
      projectId: scope.projectId,
      type: operation,
      target: { type: "shot", id: shotId, chapterId },
      input: normalizedInput,
      options: input.options,
    };
  }

  private buildShotProjection(
    scope: VersionScopeV1,
    operation: G2VersionTaskType,
    shotId: string,
    storyboardId: string,
    storyboardDigest: string,
    shotDigest: string,
    preflight: { id: string; sourceDigest: string },
    document: ReturnType<typeof PreflightDocumentCodecV2.parse>,
    shot: ReturnType<typeof StoryboardDocumentCodecV2.parse>["shots"][number],
  ): TaskSourceProjectionV1 {
    const sources: Array<{ role: string; sourceType: string; sourceId: string; sourceDigest: Digest }> = [
      { role: "storyboard", sourceType: "storyboard_version", sourceId: storyboardId, sourceDigest: digest(storyboardDigest) },
      { role: "shot", sourceType: "shot", sourceId: shotId, sourceDigest: digest(shotDigest) },
      { role: "preflight", sourceType: "preflight_revision", sourceId: preflight.id, sourceDigest: digest(preflight.sourceDigest) },
    ];
    for (const character of document.sourceSnapshot.characters) {
      if (shot.characterIds.includes(character.characterId) && character.visualId && character.assetSha256) sources.push({ role: "character_visual", sourceType: "character_visual", sourceId: character.visualId, sourceDigest: character.assetSha256 });
    }
    for (const scene of document.sourceSnapshot.scenes) {
      if (scene.sceneKey === shot.sceneId && scene.visualId && scene.assetSha256) sources.push({ role: "scene_visual", sourceType: "scene_visual", sourceId: scene.visualId, sourceDigest: scene.assetSha256 });
    }
    return buildTaskSourceProjection({ policyVersion: "g2-task-source-v1", projectId: scope.projectId, chapterId: scope.chapterId, consumerType: operation, sources });
  }

  private async buildPromptSpec(
    scope: VersionScopeV1,
    shot: ReturnType<typeof StoryboardDocumentCodecV2.parse>["shots"][number],
    document: ReturnType<typeof PreflightDocumentCodecV2.parse>,
    story: ReturnType<typeof StoryDocumentCodecV2.parse>,
  ): Promise<Record<string, unknown>> {
    const database = this.prismaService.database();
    const projectCharacterIds = [...new Set(shot.characterIds.flatMap((token) => {
      const storyCharacter = story.characters.find((character) => character.id === token || character.projectCharacterId === token);
      return storyCharacter?.projectCharacterId ? [token, storyCharacter.projectCharacterId] : [token];
    }))];
    const projectCharacters = projectCharacterIds.length > 0
      ? await database.character.findMany({ where: { projectId: scope.projectId, id: { in: projectCharacterIds } } })
      : [];
    const characters = shot.characterIds.map((token) => {
      const storyCharacter = story.characters.find((character) => character.id === token || character.projectCharacterId === token);
      const projectCharacter = projectCharacters.find((character) => character.id === token || character.id === storyCharacter?.projectCharacterId);
      return {
        id: projectCharacter?.id ?? storyCharacter?.projectCharacterId ?? storyCharacter?.id ?? token,
        name: projectCharacter?.name ?? storyCharacter?.name ?? token,
        appearance: storyCharacter?.visualTraits?.trim() || projectCharacter?.appearance?.trim() || "",
        promptFragment: projectCharacter?.promptFragment?.trim() || "",
      };
    });
    const storyScene = story.scenes.find((scene) => scene.id === shot.sceneId) ?? null;
    const scene = storyScene
      ? {
        id: storyScene.id,
        name: storyScene.name,
        location: storyScene.location,
        timeOfDay: storyScene.timeOfDay,
        atmosphere: storyScene.atmosphere,
      }
      : null;
    const content = buildCandidatePromptContent({
      artStyle: document.styleCheck.artStyle,
      shot,
      scene,
      characters,
    });
    const compiled = compileImagePromptForProvider({
      providerType: this.imageProvider.getActiveProviderType(),
      positivePrompt: content.positivePrompt,
      negativePrompt: content.negativePrompt,
      sections: content.sections,
      systemConstraints: content.systemConstraints,
    });
    const referenceAssets = [
      ...document.sourceSnapshot.characters
        .filter((character) => shot.characterIds.includes(character.characterId) && character.assetId)
        .map((character) => ({ assetId: character.assetId!, kind: "character_identity", label: character.characterId })),
      ...document.sourceSnapshot.scenes
        .filter((scene) => scene.sceneKey === shot.sceneId && scene.assetId)
        .map((scene) => ({ assetId: scene.assetId!, kind: "scene_environment", label: scene.sceneKey })),
    ];
    const image = document.styleCheck.comicFormat === "paged_comic"
      ? { width: 1536, height: 1024 }
      : { width: 1024, height: 1536 };
    return {
      schemaVersion: 2,
      sizePolicyVersion: LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
      projectId: scope.projectId,
      chapterId: scope.chapterId,
      shotId: shot.id,
      positivePrompt: content.positivePrompt,
      negativePrompt: content.negativePrompt,
      providerType: compiled.providerType,
      providerProfileId: compiled.profileId,
      providerPrompt: compiled.prompt,
      negativePromptDelivery: compiled.negativePromptDelivery,
      sections: content.sections,
      systemConstraints: content.systemConstraints,
      image: {
        ...image,
        sizePolicyVersion: LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
      },
      referenceAssets,
    };
  }
}
