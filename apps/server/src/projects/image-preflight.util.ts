import { randomUUID } from "node:crypto";
import type {
  ImagePreflightCharacterCheck,
  ImagePreflightIssue,
  ImagePreflightJson,
  ImagePreflightSceneCheck,
  ImagePreflightStyleCheck,
  ProjectCharacter,
  ProjectCharacterLevel,
  ResolveImagePreflightCharacterRequest,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as wsCharacter from "./character-domain.util.js";

/**
 * 出图准备纯逻辑(从 projects.service 抽出,见任务 2026-06-21_ProjectsService拆分 候选B)。
 * buildImagePreflightJson 需判断角色参考图任务是否运行中(依赖 tasksService),由调用方传入 isReferenceTaskRunning 回调。
 */

export function getShotCharacterTokens(characterIds: string[]): string[] {
  return [...new Set(characterIds
    .map((item) => item.trim())
    .filter((item) => item && !/^(无|无人|旁白|环境|背景)$/i.test(item)))];
}

export function resolveStoryboardCharacterIds(characterIds: string[], token: string, replacementCharacterId: string | null): string[] {
  const tokenKey = wsCharacter.normalizeCharacterNameKey(token);
  const next: string[] = [];
  for (const characterId of characterIds) {
    if (wsCharacter.normalizeCharacterNameKey(characterId) === tokenKey) {
      if (replacementCharacterId && !next.includes(replacementCharacterId)) {
        next.push(replacementCharacterId);
      }
      continue;
    }
    if (!next.includes(characterId)) {
      next.push(characterId);
    }
  }
  return next;
}

export function resolveOrCreatePreflightCharacter(
  project: Pick<LocalProject, "id">,
  characters: ProjectCharacter[],
  token: string,
  requestedLevel: ProjectCharacterLevel,
  input: Pick<ResolveImagePreflightCharacterRequest, "role" | "appearance" | "personality" | "promptFragment">,
  now: string,
): { character: ProjectCharacter; characters: ProjectCharacter[] } {
  const name = wsCharacter.normalizeCharacterName(token);
  const existing = characters.find((character) => wsCharacter.normalizeCharacterNameKey(character.name) === wsCharacter.normalizeCharacterNameKey(name));
  if (existing) {
    return { character: existing, characters };
  }

  const level = wsCharacter.normalizeCharacterLevel(requestedLevel);
  const description = input.appearance?.trim() || input.promptFragment?.trim() || `${name}，由出图准备待处理角色生成。`;
  const character: ProjectCharacter = {
    id: `char_${randomUUID()}`,
    projectId: project.id,
    name,
    role: input.role?.trim() || wsCharacter.getDefaultRoleForLevel(level),
    level,
    entityType: "human",
    status: level === "lead" || level === "recurring" ? "needs_reference" : "draft",
    appearance: description,
    personality: input.personality?.trim() || "",
    promptFragment: input.promptFragment?.trim() || description,
    referenceAssetIds: [],
    previewReferenceAssetId: null,
    previewConfirmedAt: null,
    primaryReferenceAssetId: null,
    primaryReferenceKind: wsCharacter.defaultReferenceKindForLevel(level),
    visualVersion: 0,
    source: "image_preflight",
    createdAt: now,
    updatedAt: now,
    finalizedAt: null,
  };
  return {
    character,
    characters: wsDomain.sortProjectCharacters([...characters, character]),
  };
}

export function buildImagePreflightStyleCheck(project: Pick<LocalProject, "comicFormat" | "artStyle">): ImagePreflightStyleCheck {
  const comicFormatLabel = wsDomain.getComicFormatLabel(project.comicFormat);
  const artStyleLabel = wsDomain.getArtStyleLabel(project.artStyle);
  if (project.artStyle === "custom") {
    return {
      comicFormat: project.comicFormat,
      comicFormatLabel,
      artStyle: project.artStyle,
      artStyleLabel,
      status: "warning",
      note: "当前项目使用自定义画风，候选图可继续生成，但后续应补充更明确的画风参考或提示词片段。",
    };
  }

  return {
    comicFormat: project.comicFormat,
    comicFormatLabel,
    artStyle: project.artStyle,
    artStyleLabel,
    status: "ok",
    note: "漫画形式和美术风格已存在，可供候选图提示词读取。",
  };
}

export function buildImagePreflightJson(
  project: LocalProject,
  chapter: LocalChapter,
  notes: string,
  now: string,
  isReferenceTaskRunning: (projectId: string, characterId: string) => boolean,
): ImagePreflightJson {
  const storyboard = chapter.storyboard;
  const issues: ImagePreflightIssue[] = [];
  const styleCheck = buildImagePreflightStyleCheck(project);
  if (styleCheck.status === "warning") {
    issues.push({
      type: "missing_style_context",
      status: "warning",
      message: styleCheck.note,
    });
  }

  if (!storyboard) {
    issues.push({
      type: "missing_storyboard",
      status: "blocked",
      message: "当前章节还没有正式 storyboard.json，请先确认分镜。",
    });
    return {
      schemaVersion: 1,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceStoryboardId: null,
      sourceStoryboardUpdatedAt: null,
      shotCount: 0,
      unresolvedCharacters: [],
      characterChecks: [],
      sceneChecks: [],
      styleCheck,
      issues,
      ready: false,
      notes,
      createdAt: now,
      updatedAt: now,
    };
  }

  const shots = storyboard.storyboardJson.shots;
  const characterById = new Map(project.characters.map((character) => [character.id, character]));
  const characterByName = new Map(project.characters.map((character) => [character.name.trim().toLowerCase(), character]));
  const appearanceCounts = new Map<string, number>();
  const dialogueCharacterIds = new Set<string>();
  const unresolvedCharacters = new Set<string>();
  const structureScenes = chapter.storyStructure?.structureJson.scenes ?? [];
  const sceneById = new Map(structureScenes.map((scene) => [scene.id, scene]));
  const sceneAppearanceCounts = new Map<string, number>();

  for (const shot of shots) {
    const seenInShot = new Set<string>();
    for (const token of getShotCharacterTokens(shot.characterIds)) {
      const character = characterById.get(token) ?? characterByName.get(token.toLowerCase());
      if (!character) {
        unresolvedCharacters.add(token);
        continue;
      }
      seenInShot.add(character.id);
    }

    for (const characterId of seenInShot) {
      appearanceCounts.set(characterId, (appearanceCounts.get(characterId) ?? 0) + 1);
    }

    // 统计角色台词:从 comic.dialogue 文本(格式"角色名：台词")匹配出场角色名。
    // 有台词的角色(chapter/minor/extra)需要定稿图;无台词的纯背景角色不需要。
    const dialogue = shot.comic?.dialogue?.trim() ?? "";
    if (dialogue) {
      for (const character of project.characters) {
        if (!seenInShot.has(character.id)) continue;
        if (dialogue.includes(character.name.trim())) {
          dialogueCharacterIds.add(character.id);
        }
      }
    }

    const sceneId = shot.sceneId?.trim() ?? "";
    if (!sceneId) {
      issues.push({
        type: "missing_scene",
        status: "blocked",
        message: `镜头 ${shot.order} 还没有绑定场景，请先在分镜中补齐 sceneId。`,
        relatedShotId: shot.id,
      });
      continue;
    }

    if (!sceneById.has(sceneId)) {
      issues.push({
        type: "missing_scene",
        status: "blocked",
        message: `镜头 ${shot.order} 绑定的场景「${sceneId}」不在本章剧情结构场景卡中。`,
        relatedName: sceneId,
        relatedSceneId: sceneId,
        relatedShotId: shot.id,
      });
      continue;
    }

    sceneAppearanceCounts.set(sceneId, (sceneAppearanceCounts.get(sceneId) ?? 0) + 1);
  }

  for (const name of unresolvedCharacters) {
    issues.push({
      type: "unresolved_character",
      status: "blocked",
      message: `「${name}」还没有匹配到项目角色库角色，请先加入角色库、合并到已有角色或标记为临时/背景角色。`,
      relatedName: name,
    });
  }

  const characterChecks: ImagePreflightCharacterCheck[] = [];
  for (const [characterId, appearanceCount] of appearanceCounts) {
    const character = characterById.get(characterId);
    if (!character) {
      continue;
    }
    const hasDialogue = dialogueCharacterIds.has(characterId);
    const requiredReference = wsCharacter.isRequiredPreflightReferenceCharacter(character, appearanceCount, hasDialogue);
    const referenceReady = wsCharacter.isPrimaryReferenceCompatible(character.primaryReferenceAssetId, character.primaryReferenceKind);
    const runningReferenceTask = isReferenceTaskRunning(project.id, character.id);
    let status: ImagePreflightCharacterCheck["status"] = "ok";
    let note = "参考图满足当前出图要求。";
    if (runningReferenceTask) {
      status = "blocked";
      note = "角色定稿图任务正在生成，完成后再确认出图准备。";
      issues.push({
        type: "running_reference_task",
        status: "blocked",
        message: `「${character.name}」的角色定稿图任务仍在生成中。`,
        relatedName: character.name,
        relatedCharacterId: character.id,
      });
    } else if (requiredReference && !referenceReady) {
      status = "blocked";
      note = "该角色在本章需要定稿图。";
      issues.push({
        type: "missing_reference",
        status: "blocked",
        message: `「${character.name}」缺少可用角色定稿图。`,
        relatedName: character.name,
        relatedCharacterId: character.id,
      });
    } else if (!requiredReference && !referenceReady) {
      status = "warning";
      note = "当前按临时/轻量角色处理，可用文字描述进入候选图。";
    }

    characterChecks.push({
      characterId: character.id,
      name: character.name,
      level: character.level,
      appearanceCount,
      requiredReference,
      referenceReady,
      referenceAssetId: referenceReady ? character.primaryReferenceAssetId : null,
      status,
      note,
    });
  }

  characterChecks.sort((left, right) => right.appearanceCount - left.appearanceCount || left.name.localeCompare(right.name));
  const sceneChecks: ImagePreflightSceneCheck[] = [...sceneAppearanceCounts.entries()]
    .map(([sceneId, shotCount]) => {
      const scene = sceneById.get(sceneId);
      const referenceAssetId = scene?.referenceAssetId ?? null;
      const referenceReady = Boolean(referenceAssetId);
      // 场景参考图(背景图)缺失只给 warning 提示,不阻塞出图;候选图可继续用文字描述生成。
      if (!referenceReady) {
        issues.push({
          type: "missing_scene_reference",
          status: "warning",
          message: `场景「${scene?.name || sceneId}」还没有生成参考图，建议在剧情结构页补充，不阻塞当前出图。`,
          relatedName: scene?.name || sceneId,
          relatedSceneId: sceneId,
        });
      }
      return {
        sceneId,
        name: scene?.name || sceneId,
        shotCount,
        referenceAssetId,
        referenceReady,
        status: referenceReady ? ("ok" as const) : ("warning" as const),
        note: referenceReady
          ? "场景已绑定参考图，可供候选图提示词读取。"
          : "场景已绑定到本章剧情结构场景卡，但还没有参考图。可用文字描述进入候选图，建议补充场景参考图。",
      };
    })
    .sort((left, right) => right.shotCount - left.shotCount || left.name.localeCompare(right.name));

  const ready = issues.every((issue) => issue.status !== "blocked");
  return {
    schemaVersion: 1,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sourceStoryboardId: storyboard.id,
    sourceStoryboardUpdatedAt: storyboard.updatedAt,
    shotCount: shots.length,
    unresolvedCharacters: [...unresolvedCharacters.values()].sort(),
    characterChecks,
    sceneChecks,
    styleCheck,
    issues,
    ready,
    notes,
    createdAt: now,
    updatedAt: now,
  };
}

export function isChapterImagePreflightReady(
  project: LocalProject,
  chapter: LocalChapter | null,
  isReferenceTaskRunning: (projectId: string, characterId: string) => boolean,
): boolean {
  if (!chapter?.storyboard || !chapter.imagePreflight?.preflightJson.ready) {
    return false;
  }

  if (
    chapter.imagePreflight.sourceStoryboardId !== chapter.storyboard.id
    || chapter.imagePreflight.sourceStoryboardUpdatedAt !== chapter.storyboard.updatedAt
  ) {
    return false;
  }

  return buildImagePreflightJson(project, chapter, chapter.imagePreflight.preflightJson.notes, chapter.imagePreflight.updatedAt, isReferenceTaskRunning).ready;
}
