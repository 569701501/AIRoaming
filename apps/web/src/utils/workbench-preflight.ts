/**
 * 出图准备 / 角色库就绪度纯函数(从 workbench-store.ts 抽出)。
 *
 * 这些函数只读参数,不依赖 store 状态。供 store 的 apply* action 和 preflight UI 共用。
 * 见前端大文件拆分轮次1。
 */
import type { ProjectCharacter, WorkbenchSnapshot } from "@airoaming/shared";

/** 项目角色库是否就绪:主角和常驻角色全部已定稿(final_reference)。 */
export function isProjectCharacterLibraryReady(characters: ProjectCharacter[]): boolean {
  const required = characters.filter((character) => character.level === "lead" || character.level === "recurring");
  return required.length > 0 && required.every((character) =>
    (character.status === "finalized" || character.status === "in_use")
    && Boolean(character.primaryReferenceAssetId)
    && character.primaryReferenceKind === "final_reference",
  );
}

/** 本章出图准备是否就绪:preflight.ready + 分镜一致 + 镜头角色全部有定稿图。 */
export function isChapterImagePreflightReady(snapshot: WorkbenchSnapshot): boolean {
  const imagePreflight = snapshot.imagePreflight;
  const storyboard = snapshot.storyboard;
  if (!imagePreflight?.preflightJson.ready || !storyboard) {
    return false;
  }
  if (
    imagePreflight.sourceStoryboardId !== storyboard.id
    || imagePreflight.sourceStoryboardUpdatedAt !== storyboard.updatedAt
  ) {
    return false;
  }

  const shots = snapshot.shots ?? [];
  if (shots.length === 0) {
    return false;
  }

  const characterById = new Map(snapshot.characters.map((character) => [character.id, character]));
  const characterByName = new Map(snapshot.characters.map((character) => [character.name.trim().toLowerCase(), character]));
  const appearanceCounts = new Map<string, number>();

  for (const shot of shots) {
    const seenInShot = new Set<string>();
    for (const token of getShotCharacterTokens(shot)) {
      const character = characterById.get(token) ?? characterByName.get(token.toLowerCase());
      if (!character) {
        return false;
      }
      seenInShot.add(character.id);
    }
    for (const characterId of seenInShot) {
      appearanceCounts.set(characterId, (appearanceCounts.get(characterId) ?? 0) + 1);
    }
  }

  for (const [characterId, count] of appearanceCounts) {
    const character = characterById.get(characterId);
    if (!character) {
      return false;
    }
    if (isRequiredPreflightReferenceCharacter(character, count) && !hasFinalReference(character)) {
      return false;
    }
  }

  return true;
}

/** 提取镜头里的角色标识(去重 + 排除环境/旁白占位)。 */
export function getShotCharacterTokens(shot: WorkbenchSnapshot["shots"][number]) {
  return [...new Set(shot.characterIds
    .map((item) => item.trim())
    .filter((item) => item && !/^(无|无人|旁白|环境|背景)$/i.test(item)))];
}

/** 角色是否已锁定定稿图。 */
export function hasFinalReference(character: ProjectCharacter) {
  return Boolean(character.primaryReferenceAssetId && character.primaryReferenceKind === "final_reference");
}

/** 角色是否需要出图准备阶段锁定定稿图(主角/常驻必锁,chapter 出场>1 锁)。 */
export function isRequiredPreflightReferenceCharacter(character: ProjectCharacter, appearanceCount: number) {
  return character.level === "lead"
    || character.level === "recurring"
    || (character.level === "chapter" && appearanceCount > 1);
}
