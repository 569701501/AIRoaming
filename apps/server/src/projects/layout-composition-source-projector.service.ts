import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  LayoutDocumentCodecV2,
  StoryboardDocumentCodecV2,
  buildTaskSourceProjection,
  digestCanonicalJson,
  digestLayoutCompositionScopeV1,
  parseLayoutCompositionTaskInputV1,
  taskSourceProjectionDigest,
  type CreateLayoutCompositionRequestV1,
  type Digest,
  type LayoutCompositionCharacterV1,
  type LayoutCompositionFrozenSourceV1,
  type LayoutCompositionTaskInputV1,
  type LayoutDigest,
  type LayoutFontPolicyV1,
  type LayoutProfileV1,
  type LayoutTypographyFaceV1,
  type LayoutTypographyPresetV1,
  type LayoutSourceCatalogResponseV1,
} from "@airoaming/shared";

import { PrismaService } from "../persistence/prisma.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { LayoutFontService } from "./layout-font.service.js";
import { LayoutWorkingCopyService } from "./layout-working-copy.service.js";
import type { VersionScopeV1 } from "./versioning/versioning-database.types.js";

type Reader = Prisma.TransactionClient | PrismaClient;

export class LayoutCompositionSourceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "LayoutCompositionSourceError";
  }
}

function sourceError(code: string, status: number, details?: unknown): never {
  throw new LayoutCompositionSourceError(code, status, details);
}

function asDigest(value: string | null, field: string): LayoutDigest {
  if (!value || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, { field });
  }
  return value as LayoutDigest;
}

function defaultProfile(comicFormat: "vertical_scroll" | "paged_comic"): LayoutProfileV1 {
  return comicFormat === "vertical_scroll"
    ? {
        kind: "vertical_strip",
        presetId: "webtoon_1080",
        width: 1080,
        defaultSectionHeight: 1920,
        safeInsetX: 64,
      }
    : {
        kind: "paged",
        presetId: "portrait_3_4",
        width: 1800,
        height: 2400,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb",
      };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

interface CharacterProjectionV1 {
  token: string;
  databaseId: string;
  name: string;
}

@Injectable()
export class LayoutCompositionSourceProjector {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LayoutWorkingCopyService) private readonly workingCopies: LayoutWorkingCopyService,
    @Inject(LayoutFontService) private readonly layoutFonts: LayoutFontService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  async freeze(
    scope: VersionScopeV1,
    request: CreateLayoutCompositionRequestV1,
  ): Promise<LayoutCompositionTaskInputV1> {
    if (!this.prismaService.isDatabaseMode()) {
      sourceError("LAYOUT_DB_ONLY_REQUIRED", 409);
    }
    const runtimeAI = this.settings.getRuntimeAIKeySettings();
    const visualAnalysisEnabled = process.env.LAYOUT_VISUAL_ANALYSIS_ENABLED !== "false"
      && (Boolean(runtimeAI.apiKey) || process.env.LAYOUT_VISUAL_ANALYSIS_ENABLED === "true");
    const visualAnalysisProvider = visualAnalysisEnabled
      ? {
          providerId: runtimeAI.providerId,
          modelId: runtimeAI.modelId,
        }
      : null;
    const fontCatalog = await this.layoutFonts.ensureReady(scope);
    return this.prismaService.runReadTransaction(async (tx) => {
      const [project, chapter, workingCopy] = await Promise.all([
        tx.project.findUnique({
          where: { id: scope.projectId },
          select: { id: true, lifecycleStatus: true, comicFormat: true },
        }),
        tx.chapter.findFirst({
          where: { id: scope.chapterId, projectId: scope.projectId },
          select: { id: true, currentStoryboardVersionId: true },
        }),
        tx.layoutWorkingCopy.findFirst({
          where: { projectId: scope.projectId, chapterId: scope.chapterId },
        }),
      ]);
      if (!project || !chapter) sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409);
      if (project.lifecycleStatus !== "active") sourceError("LAYOUT_PROJECT_NOT_ACTIVE", 409);
      if (project.comicFormat !== "vertical_scroll" && project.comicFormat !== "paged_comic") {
        sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, { field: "comicFormat" });
      }
      if (request.mode === "initial" && workingCopy) {
        sourceError("LAYOUT_COMPOSITION_ALREADY_EXISTS", 409, {
          workingCopyId: workingCopy.id,
        });
      }
      if (request.mode !== "initial" && !workingCopy) {
        sourceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409, { reason: "WORKING_COPY_MISSING" });
      }
      if (
        request.mode !== "initial"
        && workingCopy
        && (
          workingCopy.documentKind !== "layout_document_v2"
          || workingCopy.rowVersion !== request.expectedWorkingCopyRowVersion
          || workingCopy.documentDigest !== request.expectedDocumentDigest
        )
      ) {
        sourceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409, {
          reason: workingCopy.documentKind !== "layout_document_v2"
            ? "LAYOUT_DOCUMENT_V2_REQUIRED"
            : "WORKING_COPY_CHANGED",
          currentRowVersion: workingCopy.rowVersion,
          currentDocumentDigest: workingCopy.documentDigest,
        });
      }

      const storyboardRow = chapter.currentStoryboardVersionId
        ? await tx.storyboardVersion.findFirst({
            where: {
              id: chapter.currentStoryboardVersionId,
              projectId: scope.projectId,
              chapterId: scope.chapterId,
              status: "confirmed",
            },
          })
        : null;
      if (!storyboardRow) sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, { field: "storyboard" });
      const storyboard = StoryboardDocumentCodecV2.encode(storyboardRow.documentJson);
      if (storyboard.digest !== storyboardRow.documentDigest) {
        sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, { field: "storyboardDigest" });
      }

      const sourceCatalog = await this.workingCopies.sourceCatalogForReader(scope, tx);
      const assetRows = await tx.asset.findMany({
        where: {
          id: { in: sourceCatalog.items.map((item) => item.source.assetId) },
          projectId: scope.projectId,
          status: "ready",
        },
        select: { id: true, sha256: true, width: true, height: true },
      });
      const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));
      const sourceItems = sourceCatalog.items.map((item) => {
        const asset = assetById.get(item.source.assetId);
        if (
          !asset
          || asset.width !== item.width
          || asset.height !== item.height
        ) {
          sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, {
            assetId: item.source.assetId,
          });
        }
        return {
          order: item.order,
          source: item.source,
          assetDigest: asDigest(asset.sha256, `asset:${asset.id}`),
          width: item.width,
          height: item.height,
        };
      });
      if (sourceItems.length !== storyboard.value.shots.length) {
        sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, {
          expectedShots: storyboard.value.shots.length,
          lockedShots: sourceItems.length,
        });
      }

      const characterProjection = await this.projectCharacters(
        scope,
        storyboardRow.id,
        storyboard.value,
        tx,
      );
      const characterCatalog: LayoutCompositionCharacterV1[] = characterProjection.map((item) => ({
        characterId: item.token,
        name: item.name,
      }));
      const characterCatalogDigest = digestCanonicalJson(characterCatalog);

      const regularFont = fontCatalog.find((item) =>
        item.metadata.face.weight === 400 && item.metadata.face.style === "normal");
      if (!regularFont) sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, { field: "defaultFont" });
      const boldFont = fontCatalog.find((item) =>
        item.metadata.face.weight === 700 && item.metadata.face.style === "normal");
      const baseDocument = workingCopy?.documentKind === "layout_document_v2"
        ? LayoutDocumentCodecV2.encode(workingCopy.documentJson, {
            projectId: scope.projectId,
            chapterId: scope.chapterId,
            comicFormat: project.comicFormat,
          })
        : null;
      if (baseDocument && baseDocument.digest !== workingCopy?.documentDigest) {
        sourceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409, { reason: "DOCUMENT_DIGEST_MISMATCH" });
      }
      const fontPolicy: LayoutFontPolicyV1 = baseDocument?.value.fontPolicy ?? {
        defaultFontAssetId: regularFont.assetId,
        fallbackFontAssetIds: boldFont ? [boldFont.assetId] : [],
      };
      const fontById = new Map(fontCatalog.map((item) => [item.assetId, item]));
      const defaultFont = fontById.get(fontPolicy.defaultFontAssetId) ?? regularFont;
      const semanticFace = (weight: number): LayoutTypographyFaceV1 => {
        const exactFace = fontCatalog.find((item) =>
          item.metadata.familyName === defaultFont.metadata.familyName
          && item.metadata.face.weight === weight
          && item.metadata.face.style === "normal");
        const face = exactFace ?? defaultFont;
        return {
          fontAssetId: face.assetId,
          fontWeight: face.metadata.face.weight,
          fontStyle: face.metadata.face.style,
        };
      };
      const typographyPreset: LayoutTypographyPresetV1 = {
        policyVersion: "layout_typography_preset_v1",
        speech: semanticFace(400),
        thought: semanticFace(400),
        shout: semanticFace(900),
        caption: semanticFace(500),
      };
      const profile = baseDocument?.value.profile ?? defaultProfile(project.comicFormat);
      await this.layoutFonts.validateReferences(
        scope,
        unique([
          fontPolicy.defaultFontAssetId,
          ...fontPolicy.fallbackFontAssetIds,
          typographyPreset.speech.fontAssetId,
          typographyPreset.thought.fontAssetId,
          typographyPreset.shout.fontAssetId,
          typographyPreset.caption.fontAssetId,
        ]),
        tx,
      );

      const policy: LayoutCompositionFrozenSourceV1["policy"] = {
        composition: "layout_composition_v1",
        dialogue: "layout_dialogue_v1",
        visualAnalysis: "layout_visual_analysis_v1",
        scoring: "layout_score_v1",
        automation: "layout_automation_v1",
      };
      const source: LayoutCompositionFrozenSourceV1 = {
        schemaVersion: 1,
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        comicFormat: project.comicFormat,
        storyboard: {
          versionId: storyboardRow.id,
          documentDigest: storyboard.digest,
          document: storyboard.value,
        },
        candidateLockSet: {
          digest: sourceCatalog.sourceLockSetDigest,
          items: sourceItems,
        },
        characterCatalog: {
          digest: characterCatalogDigest,
          items: characterCatalog,
        },
        fontPolicy,
        typographyPreset,
        profile,
        visualAnalysisProvider,
        baseWorkingCopy: workingCopy && baseDocument
          ? {
              id: workingCopy.id,
              rowVersion: workingCopy.rowVersion,
              documentDigest: baseDocument.digest,
              document: baseDocument.value,
            }
          : null,
        policy,
      };
      const policySetDigest = digestCanonicalJson({
        policyVersion: "layout_composition_policy_set_digest_v1",
        profile,
        fontPolicy,
        typographyPreset,
        policy,
        intent: request.intent,
        visualAnalysisProvider,
      });
      const projectionSources: Array<{
        role: string;
        sourceType: string;
        sourceId: string;
        sourceDigest: Digest;
      }> = [
        {
          role: "storyboard",
          sourceType: "storyboard_version",
          sourceId: storyboardRow.id,
          sourceDigest: storyboard.digest,
        },
        {
          role: "lock_set",
          sourceType: "lock_set",
          sourceId: scope.chapterId,
          sourceDigest: sourceCatalog.sourceLockSetDigest,
        },
        {
          role: "policy",
          sourceType: "project",
          sourceId: scope.projectId,
          sourceDigest: policySetDigest,
        },
      ];
      for (const item of sourceItems) {
        projectionSources.push(
          {
            role: "candidate_lock",
            sourceType: "candidate_lock_revision",
            sourceId: item.source.candidateLockRevisionId,
            sourceDigest: item.assetDigest,
          },
          {
            role: "image_asset",
            sourceType: "asset",
            sourceId: item.source.assetId,
            sourceDigest: item.assetDigest,
          },
        );
      }
      for (const fontId of unique([
        fontPolicy.defaultFontAssetId,
        ...fontPolicy.fallbackFontAssetIds,
        typographyPreset.speech.fontAssetId,
        typographyPreset.thought.fontAssetId,
        typographyPreset.shout.fontAssetId,
        typographyPreset.caption.fontAssetId,
      ])) {
        const font = fontById.get(fontId);
        if (!font) sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, { fontId });
        projectionSources.push({
          role: "font_asset",
          sourceType: "asset",
          sourceId: font.assetId,
          sourceDigest: font.sha256,
        });
      }
      for (const item of unique(characterProjection.map((entry) => entry.databaseId))
        .map((databaseId) => characterProjection.find((entry) => entry.databaseId === databaseId)!)) {
        projectionSources.push({
          role: "character",
          sourceType: "character",
          sourceId: item.databaseId,
          sourceDigest: digestCanonicalJson({
            token: item.token,
            databaseId: item.databaseId,
            name: item.name,
          }),
        });
      }
      const sourceProjection = buildTaskSourceProjection({
        policyVersion: "layout-compose-source-v1",
        projectId: scope.projectId,
        chapterId: scope.chapterId,
        consumerType: "layout_compose",
        sources: this.deduplicateProjectionSources(projectionSources),
      });
      const input: LayoutCompositionTaskInputV1 = {
        schemaVersion: 1,
        chapterId: scope.chapterId,
        mode: request.mode,
        intent: request.intent,
        scope: request.scope,
        scopeDigest: digestLayoutCompositionScopeV1(request.scope),
        policySetDigest,
        sourceProjection,
        sourceProjectionDigest: taskSourceProjectionDigest(sourceProjection),
        source,
      };
      return parseLayoutCompositionTaskInputV1(input);
    });
  }

  async assertCurrentMatches(
    scope: VersionScopeV1,
    input: LayoutCompositionTaskInputV1,
    reader: Reader,
  ): Promise<void> {
    const parsed = parseLayoutCompositionTaskInputV1(input);
    const [project, chapter, storyboard, workingCopy] = await Promise.all([
      reader.project.findUnique({
        where: { id: scope.projectId },
        select: { lifecycleStatus: true, comicFormat: true },
      }),
      reader.chapter.findFirst({
        where: { id: scope.chapterId, projectId: scope.projectId },
        select: { currentStoryboardVersionId: true },
      }),
      reader.storyboardVersion.findFirst({
        where: {
          id: parsed.source.storyboard.versionId,
          projectId: scope.projectId,
          chapterId: scope.chapterId,
          status: "confirmed",
        },
        select: { id: true, documentDigest: true },
      }),
      reader.layoutWorkingCopy.findFirst({
        where: { projectId: scope.projectId, chapterId: scope.chapterId },
      }),
    ]);
    if (
      !project
      || project.lifecycleStatus !== "active"
      || project.comicFormat !== parsed.source.comicFormat
      || !chapter
      || chapter.currentStoryboardVersionId !== parsed.source.storyboard.versionId
      || !storyboard
      || storyboard.documentDigest !== parsed.source.storyboard.documentDigest
    ) sourceError("LAYOUT_COMPOSITION_SOURCE_STALE", 409);

    if (parsed.mode === "initial") {
      if (workingCopy) sourceError("LAYOUT_COMPOSITION_ALREADY_EXISTS", 409);
    } else {
      const base = parsed.source.baseWorkingCopy;
      if (
        !base
        || !workingCopy
        || workingCopy.documentKind !== "layout_document_v2"
        || workingCopy.id !== base.id
        || workingCopy.rowVersion !== base.rowVersion
        || workingCopy.documentDigest !== base.documentDigest
      ) sourceError("LAYOUT_COMPOSITION_BASE_CONFLICT", 409);
    }

    const catalog = await this.workingCopies.sourceCatalogForReader(scope, reader);
    if (!this.sameSourceCatalog(parsed.source, catalog)) {
      sourceError("LAYOUT_COMPOSITION_SOURCE_STALE", 409);
    }
    const currentCharacters = await this.projectCharacters(
      scope,
      parsed.source.storyboard.versionId,
      parsed.source.storyboard.document,
      reader,
    );
    const currentCharacterCatalog = currentCharacters.map((item) => ({
      characterId: item.token,
      name: item.name,
    }));
    if (
      digestCanonicalJson(currentCharacterCatalog) !== parsed.source.characterCatalog.digest
      || digestCanonicalJson(currentCharacterCatalog) !== digestCanonicalJson(parsed.source.characterCatalog.items)
    ) sourceError("LAYOUT_COMPOSITION_SOURCE_STALE", 409, { field: "characterCatalog" });
    const assetIds = unique([
      ...parsed.source.candidateLockSet.items.map((item) => item.source.assetId),
      parsed.source.fontPolicy.defaultFontAssetId,
      ...parsed.source.fontPolicy.fallbackFontAssetIds,
      parsed.source.typographyPreset.speech.fontAssetId,
      parsed.source.typographyPreset.thought.fontAssetId,
      parsed.source.typographyPreset.shout.fontAssetId,
      parsed.source.typographyPreset.caption.fontAssetId,
    ]);
    const assets = await reader.asset.findMany({
      where: { id: { in: assetIds }, projectId: scope.projectId, status: "ready" },
      select: { id: true, sha256: true, width: true, height: true },
    });
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    for (const item of parsed.source.candidateLockSet.items) {
      const asset = assetById.get(item.source.assetId);
      if (
        !asset
        || asset.sha256 !== item.assetDigest
        || asset.width !== item.width
        || asset.height !== item.height
      ) sourceError("LAYOUT_COMPOSITION_SOURCE_STALE", 409, { assetId: item.source.assetId });
    }
    for (const fontId of unique([
      parsed.source.fontPolicy.defaultFontAssetId,
      ...parsed.source.fontPolicy.fallbackFontAssetIds,
      parsed.source.typographyPreset.speech.fontAssetId,
      parsed.source.typographyPreset.thought.fontAssetId,
      parsed.source.typographyPreset.shout.fontAssetId,
      parsed.source.typographyPreset.caption.fontAssetId,
    ])) {
      const asset = assetById.get(fontId);
      const projection = parsed.sourceProjection.sources.find((entry) =>
        entry.role === "font_asset" && entry.sourceId === fontId);
      if (!asset?.sha256 || !projection || asset.sha256 !== projection.sourceDigest) {
        sourceError("LAYOUT_COMPOSITION_SOURCE_STALE", 409, { fontId });
      }
    }
  }

  private sameSourceCatalog(
    source: LayoutCompositionFrozenSourceV1,
    catalog: LayoutSourceCatalogResponseV1,
  ): boolean {
    if (
      catalog.sourceLockSetDigest !== source.candidateLockSet.digest
      || catalog.items.length !== source.candidateLockSet.items.length
    ) return false;
    return catalog.items.every((item, index) => {
      const expected = source.candidateLockSet.items[index];
      return Boolean(
        expected
        && item.order === expected.order
        && item.width === expected.width
        && item.height === expected.height
        && digestCanonicalJson(item.source) === digestCanonicalJson(expected.source),
      );
    });
  }

  private async projectCharacters(
    scope: VersionScopeV1,
    storyboardVersionId: string,
    document: ReturnType<typeof StoryboardDocumentCodecV2.parse>,
    reader: Reader,
  ): Promise<CharacterProjectionV1[]> {
    const tokens = unique(document.shots.flatMap((shot) => [
      ...shot.characterIds,
      ...shot.motion.voiceLines.flatMap((line) => line.characterId ? [line.characterId] : []),
    ]));
    if (tokens.length === 0) return [];
    const [characters, mappings] = await Promise.all([
      reader.character.findMany({
        where: { projectId: scope.projectId },
        select: { id: true, name: true },
      }),
      reader.storyboardShotCharacter.findMany({
        where: {
          storyboardShotProjection: { storyboardVersionId },
        },
        include: { character: { select: { id: true, name: true } } },
      }),
    ]);
    const direct = new Map(characters.map((character) => [character.id, character]));
    const byToken = new Map<string, { id: string; name: string }>();
    for (const mapping of mappings) {
      if (mapping.character) byToken.set(mapping.sourceToken, mapping.character);
    }
    return tokens.map((token) => {
      const resolved = direct.get(token) ?? byToken.get(token);
      if (!resolved) {
        sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, {
          field: "characterCatalog",
          characterId: token,
        });
      }
      return { token, databaseId: resolved.id, name: resolved.name };
    });
  }

  private deduplicateProjectionSources<T extends {
    role: string;
    sourceType: string;
    sourceId: string;
    sourceDigest: Digest;
  }>(sources: readonly T[]): T[] {
    const seen = new Map<string, T>();
    for (const source of sources) {
      const key = `${source.role}\0${source.sourceType}\0${source.sourceId}`;
      const existing = seen.get(key);
      if (existing && existing.sourceDigest !== source.sourceDigest) {
        sourceError("LAYOUT_COMPOSITION_SOURCE_INCOMPLETE", 409, {
          reason: "SOURCE_DIGEST_CONFLICT",
          sourceType: source.sourceType,
          sourceId: source.sourceId,
        });
      }
      if (!existing) seen.set(key, source);
    }
    return [...seen.values()];
  }
}
