import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  type ChapterImagePreflight,
  type ImagePreflightCharacterCheck,
  type ImagePreflightIssue,
  type ImagePreflightJson,
  type ImagePreflightSceneCheck,
  type ImagePreflightStyleCheck,
  type ResolveImagePreflightCharacterRequest,
  type ResolveImagePreflightCharacterResponse,
  type GetChapterImagePreflightResponse,
  type SaveChapterImagePreflightResponse,
  type ConfirmChapterImagePreflightRequest,
  type ArtStyle,
  type ComicFormat,
  type ChapterStoryboard,
  type ProjectCharacter,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as wsCharacter from "./character-domain.util.js";
import * as wsJson from "./workspace-json.util.js";
import * as storyNormalize from "./story-normalize.util.js";
import * as imagePreflightUtil from "./image-preflight.util.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { CharacterReferenceService } from "./character-reference.service.js";

/**
 * 出图准备编排(从 ProjectsService 抽出,见任务 2026-06-24_流程编排Service拆分)。
 * resolveImagePreflightCharacter 改调 storyNormalize.normalizeStoryboardJson(纯函数,解分镜耦合)。
 */
@Injectable()
export class ImagePreflightService {
  constructor(
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(CharacterReferenceService) private readonly characterRef: CharacterReferenceService,
  ) {}

  normalizeImagePreflightJson(input: unknown, chapterId: string, fallbackChapterTitle: string): ImagePreflightJson {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const now = new Date().toISOString();
    const sourceStoryboardId = wsJson.getOptionalStringField(record, "sourceStoryboardId");
    const sourceStoryboardUpdatedAt = wsJson.getOptionalStringField(record, "sourceStoryboardUpdatedAt");
    const issues = this.normalizeImagePreflightIssues(record.issues);
    const unresolvedCharacters = wsJson.getStringArrayField(record, "unresolvedCharacters").map((item) => item.trim()).filter(Boolean);
    const characterChecks = this.normalizeImagePreflightCharacterChecks(record.characterChecks);
    const sceneChecks = this.normalizeImagePreflightSceneChecks(record.sceneChecks);
    const styleCheck = this.normalizeImagePreflightStyleCheck(record.styleCheck);

    return {
      schemaVersion: 1,
      chapterId,
      chapterTitle: wsJson.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
      sourceStoryboardId,
      sourceStoryboardUpdatedAt,
      shotCount: wsJson.getNumberField(record, "shotCount", 0),
      unresolvedCharacters,
      characterChecks,
      sceneChecks,
      styleCheck,
      issues,
      ready: typeof record.ready === "boolean" ? record.ready : issues.length === 0,
      notes: wsJson.getStringField(record, "notes", ""),
      createdAt: wsJson.getStringField(record, "createdAt", now),
      updatedAt: wsJson.getStringField(record, "updatedAt", now),
    };
  }



  normalizeImagePreflightCharacterChecks(input: unknown): ImagePreflightCharacterCheck[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => {
        const status = this.normalizeImagePreflightStatus(wsJson.getStringField(item, "status", "ok"));
        return {
          characterId: wsJson.getStringField(item, "characterId", ""),
          name: wsJson.getStringField(item, "name", "未命名角色"),
          level: wsCharacter.normalizeCharacterLevel(wsJson.getStringField(item, "level", "extra")),
          appearanceCount: wsJson.getNumberField(item, "appearanceCount", 0),
          requiredReference: Boolean(item.requiredReference),
          referenceReady: Boolean(item.referenceReady),
          referenceAssetId: wsJson.getOptionalStringField(item, "referenceAssetId"),
          status,
          note: wsJson.getStringField(item, "note", ""),
        };
      });
  }



  normalizeImagePreflightSceneChecks(input: unknown): ImagePreflightSceneCheck[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => ({
        sceneId: wsJson.getStringField(item, "sceneId", ""),
        name: wsJson.getStringField(item, "name", "未命名场景"),
        shotCount: wsJson.getNumberField(item, "shotCount", 0),
        referenceAssetId: wsJson.getOptionalStringField(item, "referenceAssetId"),
        referenceReady: Boolean(item.referenceReady),
        status: this.normalizeImagePreflightStatus(wsJson.getStringField(item, "status", "ok")),
        note: wsJson.getStringField(item, "note", ""),
      }));
  }



  normalizeImagePreflightStyleCheck(input: unknown): ImagePreflightStyleCheck {
    const record = typeof input === "object" && input !== null && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const comicFormat = wsDomain.parseCanonicalComicFormat(wsJson.getStringField(record, "comicFormat", "vertical_scroll"));
    const artStyle = wsDomain.normalizeArtStyle(wsJson.getStringField(record, "artStyle", "comic_style") as ArtStyle);
    return {
      comicFormat,
      comicFormatLabel: wsJson.getStringField(record, "comicFormatLabel", wsDomain.getComicFormatLabel(comicFormat)),
      artStyle,
      artStyleLabel: wsJson.getStringField(record, "artStyleLabel", wsDomain.getArtStyleLabel(artStyle)),
      status: this.normalizeImagePreflightStatus(wsJson.getStringField(record, "status", "ok")),
      note: wsJson.getStringField(record, "note", ""),
    };
  }



  normalizeImagePreflightIssues(input: unknown): ImagePreflightIssue[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => {
        const type = wsJson.getStringField(item, "type", "unresolved_character");
        return {
          type: type === "missing_storyboard"
            || type === "missing_reference"
            || type === "running_reference_task"
            || type === "missing_scene"
            || type === "missing_style_context"
            ? type
            : "unresolved_character",
          status: this.normalizeImagePreflightStatus(wsJson.getStringField(item, "status", "blocked")) === "warning" ? "warning" : "blocked",
          message: wsJson.getStringField(item, "message", ""),
          relatedName: wsJson.getOptionalStringField(item, "relatedName") ?? undefined,
          relatedCharacterId: wsJson.getOptionalStringField(item, "relatedCharacterId") ?? undefined,
          relatedSceneId: wsJson.getOptionalStringField(item, "relatedSceneId") ?? undefined,
          relatedShotId: wsJson.getOptionalStringField(item, "relatedShotId") ?? undefined,
        };
      });
  }



  normalizeImagePreflightStatus(value: string): ImagePreflightCharacterCheck["status"] {
    return value === "warning" || value === "blocked" ? value : "ok";
  }



  async getChapterImagePreflight(projectId: string, chapterId: string): Promise<GetChapterImagePreflightResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      imagePreflight: chapter.imagePreflight,
    };
  }



  async confirmChapterImagePreflight(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterImagePreflightRequest = {},
  ): Promise<SaveChapterImagePreflightResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const now = new Date().toISOString();
    const preflightJson = imagePreflightUtil.buildImagePreflightJson(project, chapter, input.notes?.trim() ?? "", now, (pid, cid) => this.characterRef.hasActiveCharacterReferenceTask(pid, cid, "final_reference"));
    if (!preflightJson.ready) {
      throw new BadRequestException("IMAGE_PREFLIGHT_BLOCKED");
    }

    const version = (chapter.imagePreflight?.version ?? 0) + 1;
    const imagePreflight: ChapterImagePreflight = {
      id: `${chapter.id}_image_preflight_v${String(version).padStart(3, "0")}`,
      projectId,
      chapterId: chapter.id,
      version,
      status: "confirmed",
      preflightPath: `projects/${projectId}/chapters/${chapter.slug}/preflight.json`,
      sourceStoryboardId: chapter.storyboard.id,
      sourceStoryboardUpdatedAt: chapter.storyboard.updatedAt,
      preflightJson,
      createdAt: chapter.imagePreflight?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      imagePreflight,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      imagePreflight,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }



  async resolveImagePreflightCharacter(
    projectId: string,
    chapterId: string,
    input: ResolveImagePreflightCharacterRequest,
  ): Promise<ResolveImagePreflightCharacterResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyboard) {
      throw new BadRequestException("STORYBOARD_NOT_CONFIRMED");
    }

    const token = input.token?.trim();
    if (!token) {
      throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_TOKEN_REQUIRED");
    }

    const storyboard = chapter.storyboard;
    const tokenExists = storyboard.storyboardJson.shots.some((shot) =>
      imagePreflightUtil.getShotCharacterTokens(shot.characterIds).some((item) => wsCharacter.normalizeCharacterNameKey(item) === wsCharacter.normalizeCharacterNameKey(token)),
    );
    if (!tokenExists) {
      throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_TOKEN_NOT_FOUND");
    }

    const now = new Date().toISOString();
    let nextCharacters = project.characters;
    let character: ProjectCharacter | null = null;
    let replacementCharacterId: string | null = null;

    switch (input.action) {
      case "add_to_library": {
        const result = imagePreflightUtil.resolveOrCreatePreflightCharacter(project, nextCharacters, token, input.level ?? "chapter", input, now);
        nextCharacters = result.characters;
        character = result.character;
        replacementCharacterId = result.character.id;
        break;
      }
      case "mark_temporary": {
        const result = imagePreflightUtil.resolveOrCreatePreflightCharacter(project, nextCharacters, token, "extra", {
          ...input,
          role: input.role || "临时/背景角色",
        }, now);
        nextCharacters = result.characters;
        character = result.character;
        replacementCharacterId = result.character.id;
        break;
      }
      case "merge_existing": {
        if (!input.targetCharacterId?.trim()) {
          throw new BadRequestException("TARGET_CHARACTER_ID_REQUIRED");
        }
        character = this.characterRef.findProjectCharacter({ ...project, characters: nextCharacters }, input.targetCharacterId);
        replacementCharacterId = character.id;
        break;
      }
      case "ignore": {
        replacementCharacterId = null;
        break;
      }
      default:
        throw new BadRequestException("IMAGE_PREFLIGHT_CHARACTER_ACTION_INVALID");
    }

    const storyboardJson = storyNormalize.normalizeStoryboardJson({
      ...storyboard.storyboardJson,
      shots: storyboard.storyboardJson.shots.map((shot) => ({
        ...shot,
        characterIds: imagePreflightUtil.resolveStoryboardCharacterIds(shot.characterIds, token, replacementCharacterId),
      })),
    }, chapter.id, chapter.title, {
      sourceStoryVersionId: storyboard.sourceStoryVersionId,
      createdAt: storyboard.storyboardJson.createdAt,
      updatedAt: now,
    });
    const nextStoryboard: ChapterStoryboard = {
      ...storyboard,
      storyboardJson,
      updatedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      storyboard: nextStoryboard,
      imagePreflight: null,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...project,
      characters: wsDomain.sortProjectCharacters(nextCharacters),
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      storyboard: nextStoryboard,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
      characters: wsDomain.sortProjectCharacters(nextProject.characters),
      assets: nextProject.assets,
      ready: this.characterRef.isProjectCharacterLibraryReady(nextProject),
      imagePreflight: null,
      character,
    };
  }



}
