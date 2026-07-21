import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  type ChapterStoryStructure,
  type ConfirmChapterStoryStructureRequest,
  type ProjectCharacter,
  type ProjectCharacterEntityType,
  type ProjectCharacterLevel,
  type GetChapterStoryStructureResponse,
  type SaveChapterStoryStructureResponse,
  type StoryStructureJson,
  type UpdateChapterStoryStructureRequest,
  requiredCharacterReferenceKind,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as wsCharacter from "./character-domain.util.js";
import * as storyNormalize from "./story-normalize.util.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { CharacterReferenceService } from "./character-reference.service.js";

/**
 * 剧情结构编排(从 ProjectsService 抽出,见任务 2026-06-24_流程编排Service拆分)。
 * syncStoryStructureCharacters 调 CharacterReferenceService 的角色辅助(已 public)。
 */
@Injectable()
export class StoryStructureService {
  constructor(
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(CharacterReferenceService) private readonly characterRef: CharacterReferenceService,
  ) {}

  createChapterStoryStructure(
    projectId: string,
    chapter: LocalChapter,
    input: StoryStructureJson,
    version: number,
    now: string,
  ): ChapterStoryStructure {
    const id = `${chapter.id}_story_v${String(version).padStart(3, "0")}`;
    const structureJson = storyNormalize.normalizeStoryStructureJson(input, chapter.id, chapter.title, {
      sourceScriptVersionId: chapter.currentScriptVersionId,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    return {
      id,
      projectId,
      chapterId: chapter.id,
      version,
      status: "structured",
      structurePath: `projects/${projectId}/chapters/${chapter.slug}/structure.json`,
      sourceScriptVersionId: structureJson.sourceScriptVersionId,
      structureJson,
      createdAt: chapter.storyStructure?.createdAt ?? now,
      updatedAt: now,
      confirmedAt: now,
    };
  }



  normalizeStoryStructureJson(
    input: unknown,
    chapterId: string,
    fallbackChapterTitle: string,
    overrides: Partial<Pick<StoryStructureJson, "sourceScriptVersionId" | "createdAt" | "updatedAt">> = {},
  ): StoryStructureJson {
    return storyNormalize.normalizeStoryStructureJson(input, chapterId, fallbackChapterTitle, overrides);
  }

  // normalizeStoryStructureCharacters/Scenes/Beats 已抽到 ./story-normalize.util.ts(见任务 2026-06-21_ProjectsService拆分 1b-pre-2)。



  buildStoryStructureCharacterPrompt(card: StoryStructureJson["characters"][number]): string {
    const parts = [
      card.visualTraits.trim(),
      card.role.trim() ? `${card.name.trim()}，${card.role.trim()}` : "",
      card.relationship.trim(),
      card.motivation.trim(),
      card.notes.trim(),
    ].filter(Boolean);
    return parts.join("；") || `${card.name.trim()}，本章出镜角色。`;
  }



  resolveCardEntityType(card: StoryStructureJson["characters"][number]): ProjectCharacterEntityType {
    return wsCharacter.normalizeEntityType(card.entityType);
  }

  /**
   * 结构卡 level 优先用 AI 输出(card.level),AI 没给才回落 inferCharacterLevel(见 task 2026-06-21_角色分层双维度)。
   * 保留 inferCharacterLevel 作兜底:① 旧 structure.json 无 level;② AI 偶发漏填;③ 剧本导入链路继续用。
   */


  resolveCardLevel(
    card: StoryStructureJson["characters"][number],
    name: string,
    description: string,
    index: number,
  ): ProjectCharacterLevel {
    if (card.level) {
      return wsCharacter.normalizeCharacterLevel(card.level);
    }
    return this.characterRef.inferCharacterLevel(name, card.role, description, index);
  }


  assertChapterCanSaveStoryStructure(chapter: LocalChapter): void {
    if (!chapter.sourceText.trim()) {
      throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
    }

    if (chapter.status === "draft") {
      throw new BadRequestException("CHAPTER_SCRIPT_NOT_COMPLETED");
    }
  }



  async getChapterStoryStructure(projectId: string, chapterId: string): Promise<GetChapterStoryStructureResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    return {
      storyStructure: chapter.storyStructure,
    };
  }



  async confirmChapterStoryStructure(
    projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryStructureRequest,
  ): Promise<SaveChapterStoryStructureResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    this.assertChapterCanSaveStoryStructure(chapter);

    const now = new Date().toISOString();
    const previousVersion = chapter.storyStructure?.version ?? 0;
    const storyStructure = this.createChapterStoryStructure(project.id, chapter, input.structureJson, previousVersion + 1, now);
    const synced = this.syncStoryStructureCharacters(project, storyStructure.structureJson, now);
    const nextChapter: LocalChapter = {
      ...chapter,
      status: "structured",
      currentStoryVersionId: storyStructure.id,
      storyStructure: { ...storyStructure, structureJson: synced.structureJson },
      pendingStoryboard: null,
      imagePreflight: null,
      updatedAt: now,
    };
    const nextProject = this.projectStore.withUpdatedChapter({
      ...synced.project,
      currentChapterId: nextChapter.id,
      updatedAt: now,
    }, nextChapter);

    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);

    return {
      storyStructure,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }



  async updateChapterStoryStructure(
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryStructureRequest,
  ): Promise<SaveChapterStoryStructureResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    if (!chapter.storyStructure) {
      throw new BadRequestException("STORY_STRUCTURE_NOT_CONFIRMED");
    }

    const now = new Date().toISOString();
    const structureJson = storyNormalize.normalizeStoryStructureJson(input.structureJson, chapter.id, chapter.title, {
      sourceScriptVersionId: chapter.storyStructure.sourceScriptVersionId,
      createdAt: chapter.storyStructure.structureJson.createdAt,
      updatedAt: now,
    });
    const storyStructure: ChapterStoryStructure = {
      ...chapter.storyStructure,
      sourceScriptVersionId: structureJson.sourceScriptVersionId,
      structureJson,
      updatedAt: now,
    };
    const nextChapter: LocalChapter = {
      ...chapter,
      currentStoryVersionId: storyStructure.id,
      storyStructure,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
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
      storyStructure,
      chapter: wsDomain.toChapterDetail(nextChapter),
      chapters: wsDomain.sortChapters(nextProject.chapters).map((item) => wsDomain.toChapterListItem(item)),
    };
  }



  syncStoryStructureCharacters(
    project: LocalProject,
    structureJson: StoryStructureJson,
    now: string,
  ): { project: LocalProject; structureJson: StoryStructureJson } {
    const existingByName = new Map(project.characters.map((character) => [
      wsCharacter.normalizeCharacterNameKey(character.name),
      character,
    ]));
    const existingByIdentity = new Map(project.characters.map((character) => [
      `${character.entityType}:${wsCharacter.normalizeCharacterIdentityKey(character.name, character.entityType)}`,
      character,
    ]));
    const nextCharacters = [...project.characters];
    // 结构角色卡浅拷贝,用于回填 projectCharacterId(见 ADR-0006)
    const nextCards = structureJson.characters.map((card) => ({ ...card }));
    let charactersChanged = false;

    structureJson.characters.forEach((card, index) => {
      const rawName = card.name.trim();
      if (!rawName) {
        return;
      }

      const name = wsCharacter.normalizeCharacterName(rawName);
      const key = wsCharacter.normalizeCharacterNameKey(name);
      const description = this.buildStoryStructureCharacterPrompt(card);
      const inferredLevel = this.resolveCardLevel(card, name, description, index);
      const cardEntityType = this.resolveCardEntityType(card);
      const identityKey = `${cardEntityType}:${wsCharacter.normalizeCharacterIdentityKey(name, cardEntityType)}`;
      // group 优先按保守身份匹配，使旧项目中的群体别名在再次确认结构时
      // 回收到同一个项目角色；其他主体仍然优先精确名称。
      const existing = cardEntityType === "group"
        ? existingByIdentity.get(identityKey) ?? existingByName.get(key)
        : existingByName.get(key) ?? existingByIdentity.get(identityKey);

      if (existing) {
        // 回填项目角色 id,独立于角色库是否有变更:
        // 旧结构重新确认时角色库可能无变化,但结构卡的 projectCharacterId 仍需补全。
        nextCards[index].projectCharacterId = existing.id;

        const level = this.characterRef.resolveMoreImportantCharacterLevel(existing.level, inferredLevel);
        const nextEntityType = typeof card.entityType === "string"
          ? wsCharacter.normalizeEntityType(card.entityType)
          : existing.entityType;
        const primary = this.characterRef.resolvePrimaryReferenceForLevel({ ...existing, entityType: nextEntityType }, level);
        const nextRole = existing.role || card.role.trim() || wsCharacter.getDefaultRoleForLevel(level);
        const nextStatus = this.characterRef.resolveCharacterStatusForReference(
          level,
          primary.primaryReferenceAssetId,
          existing.status === "in_use",
          primary.primaryReferenceKind,
          nextEntityType,
        );
        const nextAppearance = existing.appearance || description;
        const nextPersonality = existing.personality || card.motivation.trim();
        const nextPromptFragment = existing.promptFragment || description;
        const hasChanges = existing.role !== nextRole
          || existing.level !== level
          || existing.status !== nextStatus
          || existing.appearance !== nextAppearance
          || existing.personality !== nextPersonality
          || existing.promptFragment !== nextPromptFragment
          || existing.entityType !== nextEntityType
          || existing.primaryReferenceAssetId !== primary.primaryReferenceAssetId
          || existing.primaryReferenceKind !== primary.primaryReferenceKind
          || existing.finalizedAt !== primary.finalizedAt;
        if (!hasChanges) {
          return;
        }
        const nextCharacter: ProjectCharacter = {
          ...existing,
          role: nextRole,
          level,
          status: nextStatus,
          appearance: nextAppearance,
          personality: nextPersonality,
          promptFragment: nextPromptFragment,
          entityType: nextEntityType,
          primaryReferenceAssetId: primary.primaryReferenceAssetId,
          primaryReferenceKind: primary.primaryReferenceKind,
          finalizedAt: primary.finalizedAt,
          updatedAt: now,
        };
        const characterIndex = nextCharacters.findIndex((item) => item.id === existing.id);
        if (characterIndex >= 0) {
          nextCharacters[characterIndex] = nextCharacter;
          existingByName.set(key, nextCharacter);
          existingByIdentity.set(`${nextEntityType}:${wsCharacter.normalizeCharacterIdentityKey(nextCharacter.name, nextEntityType)}`, nextCharacter);
          charactersChanged = true;
        }
        return;
      }

      const character: ProjectCharacter = {
        id: `char_${randomUUID()}`,
        projectId: project.id,
        name,
        role: card.role.trim() || wsCharacter.getDefaultRoleForLevel(inferredLevel),
        level: inferredLevel,
        entityType: cardEntityType,
        status: requiredCharacterReferenceKind({ level: inferredLevel, entityType: cardEntityType }) === "final_reference" ? "needs_reference" : "draft",
        appearance: description,
        personality: card.motivation.trim(),
        promptFragment: description,
        referenceAssetIds: [],
        previewReferenceAssetId: null,
        previewConfirmedAt: null,
        primaryReferenceAssetId: null,
        primaryReferenceKind: requiredCharacterReferenceKind({ level: inferredLevel, entityType: cardEntityType }),
        visualVersion: 0,
        source: "story_structure",
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
      };
      nextCharacters.push(character);
      existingByName.set(key, character);
      existingByIdentity.set(identityKey, character);
      nextCards[index].projectCharacterId = character.id;
      charactersChanged = true;
    });

    const nextProject = charactersChanged
      ? {
          ...project,
          characters: wsDomain.sortProjectCharacters(nextCharacters),
          updatedAt: now,
        }
      : project;

    return {
      project: nextProject,
      structureJson: { ...structureJson, characters: nextCards },
    };
  }



}
