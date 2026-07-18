import {
  StoryDocumentCodecV2,
  type StoryDocumentV2,
  type StoryStructureJson,
} from "@airoaming/shared";

/**
 * 只允许出现在待确认 Working Copy 的临时项目角色引用。
 * StoryVersionRepository 会在同一事务内按角色名解析或创建正式角色后重写。
 */
export const UNRESOLVED_STORY_CHARACTER_PREFIX = "unresolved-story-character:";

function semanticKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

/**
 * 把模型可理解的剧情结构语义输出转换成现有 StoryDocumentV2。
 * 模型只引用角色名/本地引用；数据库关联在后续事务内解析。
 */
export function toStoryDocumentV2(structure: StoryStructureJson): StoryDocumentV2 {
  const characterRefs = new Map<string, string>();
  const characters = structure.characters.map((character) => {
    if (!character.level) throw new TypeError(`STORY_STRUCTURE_CHARACTER_LEVEL_MISSING:${character.id}`);
    if (!character.entityType) throw new TypeError(`STORY_STRUCTURE_CHARACTER_ENTITY_TYPE_MISSING:${character.id}`);
    characterRefs.set(character.id, character.id);
    characterRefs.set(character.name, character.id);
    characterRefs.set(semanticKey(character.name), character.id);
    return {
      id: character.id,
      projectCharacterId: character.projectCharacterId?.trim()
        || `${UNRESOLVED_STORY_CHARACTER_PREFIX}${character.id}`,
      name: character.name,
      role: character.role,
      level: character.level,
      entityType: character.entityType,
      motivation: character.motivation,
      relationship: character.relationship,
      visualTraits: character.visualTraits,
      notes: character.notes,
    };
  });

  const document: StoryDocumentV2 = {
    schemaVersion: 2,
    chapterId: structure.chapterId,
    synopsis: structure.synopsis,
    direction: structure.direction,
    characters,
    scenes: structure.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      atmosphere: scene.atmosphere,
      purpose: scene.purpose,
    })),
    beats: structure.beats.map((beat) => ({
      id: beat.id,
      order: beat.order,
      title: beat.title,
      summary: beat.summary,
      conflict: beat.conflict,
      characters: beat.characters.map((token) => {
        const resolved = characterRefs.get(token) ?? characterRefs.get(semanticKey(token));
        if (!resolved) throw new TypeError(`STORY_STRUCTURE_BEAT_CHARACTER_UNRESOLVED:${beat.id}:${token}`);
        return resolved;
      }),
      sceneId: beat.sceneId,
      visualFocus: beat.visualFocus,
      outcome: beat.outcome,
    })),
    notes: structure.notes,
  };
  return StoryDocumentCodecV2.parse(document);
}
