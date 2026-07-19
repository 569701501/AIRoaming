import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import {
  buildPreflightSourceSnapshot,
  digestCanonicalJson,
  encodePreflightDocumentV2,
  referenceKindSatisfiesRequirement,
  requiredCharacterReferenceKind,
  sourceSnapshotDigest,
  type Digest,
  type PreflightDocumentV2,
  type PreflightSourceSnapshotV1,
  type ProjectCharacterEntityType,
  type ProjectCharacterReferenceKind,
  type StoryboardDocumentV2,
  StoryboardDocumentCodecV2,
} from "@airoaming/shared";
import { PrismaService } from "../../persistence/prisma.service.js";
import { createG2DatabaseError } from "./g2-database-error.mapper.js";
import { ChapterVersionQueryRepository, type ChapterVersionQueryRow } from "./chapter-version-query.repository.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

type SnapshotReader = Pick<PrismaClient, "chapter" | "project" | "character" | "chapterScene">;

function digest(value: string): Digest {
  return value as Digest;
}

function validAssetSha(value: string | null | undefined): Digest | null {
  return value && /^sha256:[0-9a-f]{64}$/.test(value) ? digest(value) : null;
}

function level(value: string): "lead" | "recurring" | "chapter" | "minor" | "extra" {
  return value === "lead" || value === "recurring" || value === "chapter" || value === "minor" ? value : "extra";
}

function entityType(value: string): ProjectCharacterEntityType {
  return value === "creature" || value === "group" || value === "voice" ? value : "human";
}

function referenceKind(value: string): ProjectCharacterReferenceKind {
  if (value === "turnaround_4view" || value === "final_reference") return "final_reference";
  if (value === "single_front" || value === "preview_front") return "preview_front";
  return "none";
}

function comicFormat(value: string): "vertical_scroll" | "paged_comic" {
  if (value === "vertical_scroll" || value === "paged_comic") return value;
  throw createG2DatabaseError(500, "PROJECT_COMIC_FORMAT_CORRUPTED");
}

function parseStoryboard(row: NonNullable<ChapterVersionQueryRow["currentStoryboardVersion"]>): StoryboardDocumentV2 {
  if (row.schemaVersion !== 2) throw createG2DatabaseError(409, "VERSION_CODEC_UPGRADE_REQUIRED", { schemaVersion: row.schemaVersion, expected: 2 });
  try {
    return StoryboardDocumentCodecV2.parse(row.documentJson);
  } catch (error) {
    throw createG2DatabaseError(400, "VERSION_DOCUMENT_INVALID", error);
  }
}

interface SnapshotBuildResult {
  readonly chapter: ChapterVersionQueryRow;
  readonly document: PreflightDocumentV2;
  readonly sourceSnapshot: PreflightSourceSnapshotV1;
  readonly sourceDigest: Digest;
  readonly sourceStoryboardVersionId: string;
}

@Injectable()
export class SourceSnapshotBuilderService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ChapterVersionQueryRepository) private readonly chapterQuery: ChapterVersionQueryRepository,
  ) {}

  async build(scope: VersionScopeV1, notes = "", reader: SnapshotReader = this.prismaService.database()): Promise<SnapshotBuildResult> {
    const row = await this.chapterQuery.findByScope(scope, reader);
    if (!row) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");
    if (!row.currentStoryboardVersion || row.currentStoryboardVersionId === null) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED", { reasonCodes: ["STORYBOARD_VERSION_MISSING"] });
    if (row.currentStoryboardVersion.status !== "confirmed" || row.currentStoryVersion?.status !== "confirmed" || row.currentStoryVersionId === null) throw createG2DatabaseError(409, "UPSTREAM_WORK_NOT_CONFIRMED", { reasonCodes: ["UPSTREAM_STALE"] });

    const [project, characters, chapterScenes] = await Promise.all([
      reader.project.findUnique({ where: { id: row.projectId }, select: { id: true, comicFormat: true, artStyle: true } }),
      reader.character.findMany({
        where: { projectId: row.projectId },
        select: {
          id: true, name: true, level: true, entityType: true, appearance: true, personality: true, promptFragment: true,
          previewVisualId: true,
          previewVisual: { include: { asset: { select: { id: true, sha256: true, status: true } } } },
          primaryVisualId: true,
          primaryVisual: { include: { asset: { select: { id: true, sha256: true, status: true } } } },
          rowVersion: true,
        },
      }),
      reader.chapterScene.findMany({
        where: { chapterId: row.id, projectId: row.projectId },
        select: {
          id: true, sceneKey: true, currentVisualId: true,
          currentVisual: { include: { asset: { select: { id: true, sha256: true, status: true } } } },
        },
      }),
    ]);
    if (!project) throw createG2DatabaseError(404, "CHAPTER_NOT_FOUND");

    const storyboard = parseStoryboard(row.currentStoryboardVersion);
    const appearanceCounts = new Map<string, number>();
    const sceneCounts = new Map<string, number>();
    for (const shot of storyboard.shots) {
      for (const characterId of new Set(shot.characterIds)) appearanceCounts.set(characterId, (appearanceCounts.get(characterId) ?? 0) + 1);
      if (shot.sceneId) sceneCounts.set(shot.sceneId, (sceneCounts.get(shot.sceneId) ?? 0) + 1);
    }

    const characterById = new Map(characters.map((character) => [character.id, character]));
    const sceneByKey = new Map(chapterScenes.map((scene) => [scene.sceneKey, scene]));
    const issues: PreflightDocumentV2["issues"] = [];
    const characterChecks: PreflightDocumentV2["characterChecks"] = [];
    const sourceCharacters: PreflightSourceSnapshotV1["characters"] = [];

    for (const [characterId, appearanceCount] of appearanceCounts) {
      const character = characterById.get(characterId);
      if (!character) {
        issues.push({ type: "unresolved_character", status: "blocked", message: `角色「${characterId}」未在项目角色库中找到。`, relatedName: characterId, relatedCharacterId: characterId, relatedSceneId: null, relatedShotId: null });
        sourceCharacters.push({ characterId, required: true, generationInputDigest: digestCanonicalJson({ characterId, unresolved: true }), visualId: null, assetId: null, assetSha256: null });
        continue;
      }
      const characterLevel = level(character.level);
      const characterEntityType = entityType(character.entityType);
      const requirement = requiredCharacterReferenceKind({ level: characterLevel, entityType: characterEntityType });
      const required = requirement !== "none";
      const readyVisual = (visual: typeof character.primaryVisual) => visual
        && visual.asset.status === "ready"
        && validAssetSha(visual.asset.sha256)
        ? visual
        : null;
      const readyPrimaryVisual = readyVisual(character.primaryVisual);
      const readyPreviewVisual = readyVisual(character.previewVisual);
      const finalVisual = readyPrimaryVisual && referenceKind(readyPrimaryVisual.kind) === "final_reference"
        ? readyPrimaryVisual
        : null;
      const previewVisual = readyPreviewVisual && referenceKind(readyPreviewVisual.kind) === "preview_front"
        ? readyPreviewVisual
        : null;
      const visual = requirement === "final_reference"
        ? finalVisual
        : requirement === "preview_front"
          ? finalVisual ?? previewVisual
          : null;
      const assetSha256 = visual ? validAssetSha(visual.asset.sha256) : null;
      const availableKind = visual ? referenceKind(visual.kind) : "none";
      const referenceReady = requirement === "none"
        || (visual !== null && assetSha256 !== null && referenceKindSatisfiesRequirement(requirement, availableKind));
      let status: "ok" | "warning" | "blocked" = "ok";
      let note = requirement === "none" ? "纯声音角色无需图片。" : "参考图满足当前出图要求。";
      if (!referenceReady) {
        status = "blocked";
        const referenceLabel = requirement === "final_reference" ? "定稿图" : "视觉参考图";
        note = `该主体在剧情结构阶段要求可用${referenceLabel}。`;
        issues.push({ type: "missing_reference", status: "blocked", message: `角色「${character.name}」缺少可用${referenceLabel}。`, relatedName: character.name, relatedCharacterId: character.id, relatedSceneId: null, relatedShotId: null });
      }
      characterChecks.push({ characterId: character.id, name: character.name, level: characterLevel, appearanceCount, requiredReference: required, referenceReady, referenceAssetId: visual?.asset.id ?? null, status, note });
      sourceCharacters.push({
        characterId: character.id,
        required,
        generationInputDigest: digestCanonicalJson({ id: character.id, name: character.name, level: characterLevel, entityType: characterEntityType, requiredReferenceKind: requirement, appearance: character.appearance, personality: character.personality, promptFragment: character.promptFragment, rowVersion: character.rowVersion }),
        visualId: visual?.id ?? null,
        assetId: visual?.asset.id ?? null,
        assetSha256: visual ? assetSha256 : null,
      });
    }

    const sourceScenes: PreflightSourceSnapshotV1["scenes"] = [];
    const sceneChecks: PreflightDocumentV2["sceneChecks"] = [];
    for (const [sceneId, shotCount] of sceneCounts) {
      const scene = sceneByKey.get(sceneId);
      if (!scene) {
        issues.push({ type: "missing_scene", status: "blocked", message: `镜头引用的场景「${sceneId}」不存在。`, relatedName: sceneId, relatedCharacterId: null, relatedSceneId: sceneId, relatedShotId: null });
        sourceScenes.push({ chapterSceneId: sceneId, sceneKey: sceneId, visualId: null, assetId: null, assetSha256: null });
        sceneChecks.push({ sceneId, name: sceneId, shotCount, referenceAssetId: null, referenceReady: false, status: "blocked", note: "场景不存在。" });
        continue;
      }
      const visual = scene.currentVisual && scene.currentVisual.asset.status === "ready" && validAssetSha(scene.currentVisual.asset.sha256) ? scene.currentVisual : null;
      const assetSha256 = visual ? validAssetSha(visual.asset.sha256) : null;
      const referenceReady = visual !== null && assetSha256 !== null;
      if (!referenceReady) issues.push({ type: "missing_scene_reference", status: "warning", message: `场景「${scene.sceneKey}」暂无参考图，候选图仍可使用文字描述。`, relatedName: scene.sceneKey, relatedCharacterId: null, relatedSceneId: scene.id, relatedShotId: null });
      sceneChecks.push({ sceneId: scene.id, name: scene.sceneKey, shotCount, referenceAssetId: referenceReady ? visual?.asset.id ?? null : null, referenceReady, status: referenceReady ? "ok" : "warning", note: referenceReady ? "场景已绑定参考图。" : "场景参考图缺失，不阻塞出图。" });
      sourceScenes.push({ chapterSceneId: scene.id, sceneKey: scene.sceneKey, visualId: referenceReady ? visual?.id ?? null : null, assetId: referenceReady ? visual?.asset.id ?? null : null, assetSha256 });
    }

    const normalizedFormat = comicFormat(project.comicFormat);
    const artStyle = project.artStyle?.trim() || "custom";
    const styleDigest = digestCanonicalJson({ comicFormat: normalizedFormat, artStyle });
    const styleStatus = project.artStyle?.trim() ? "ok" : "warning";
    const styleCheck = { comicFormat: normalizedFormat, comicFormatLabel: normalizedFormat === "vertical_scroll" ? "条漫" : "页漫", artStyle, artStyleLabel: artStyle, status: styleStatus as "ok" | "warning", note: project.artStyle?.trim() ? "漫画形式和美术风格已存在。" : "项目尚未填写明确画风，后续应补充。" };
    if (styleStatus === "warning") issues.push({ type: "missing_style_context", status: "warning", message: styleCheck.note, relatedName: null, relatedCharacterId: null, relatedSceneId: null, relatedShotId: null });

    const sourceSnapshot = buildPreflightSourceSnapshot({
      policyVersion: "preflight-source-v2", projectId: row.projectId, chapterId: row.id, consumerType: "preflight_revision",
      storyboard: { id: row.currentStoryboardVersion.id, digest: digest(row.currentStoryboardVersion.documentDigest) },
      style: { comicFormat: normalizedFormat, artStyle, styleDigest }, characters: sourceCharacters, scenes: sourceScenes,
    });
    const document = encodePreflightDocumentV2({
      schemaVersion: 2, chapterId: row.id, sourceSnapshot, shotCount: storyboard.shots.length,
      characterChecks: characterChecks.sort((left, right) => right.appearanceCount - left.appearanceCount || left.name.localeCompare(right.name)),
      sceneChecks: sceneChecks.sort((left, right) => right.shotCount - left.shotCount || left.name.localeCompare(right.name)), styleCheck,
      issues, ready: !issues.some((issue) => issue.status === "blocked"), notes, policyVersion: "preflight-source-v2",
    }).value;
    return { chapter: row, document, sourceSnapshot, sourceDigest: sourceSnapshotDigest(sourceSnapshot), sourceStoryboardVersionId: row.currentStoryboardVersion.id };
  }
}

export type SourceSnapshotBuilderReader = SnapshotReader;
