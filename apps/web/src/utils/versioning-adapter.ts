import type {
  ProjectCharacter,
  StoryDocumentV2,
  StoryboardDocumentV2,
  StoryStructureJson,
  StoryboardJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { characterVisualIdentityKey } from "@airoaming/shared";

// Request-only token. The DB repository resolves it to a real Character.id
// before the StoryVersion pending document is persisted.
const UNRESOLVED_STORY_CHARACTER_PREFIX = "unresolved-story-character:";

/** Convert the legacy-shaped workbench editor value to the strict G2 document. */
export function toStoryDocumentV2(input: StoryStructureJson, snapshot: WorkbenchSnapshot): StoryDocumentV2 {
  const byName = new Map(snapshot.characters.map((character) => [normalize(character.name), character]));
  const byId = new Map(snapshot.characters.map((character) => [character.id, character]));
  const byVisualIdentity = new Map<string, ProjectCharacter>();
  snapshot.characters.forEach((character) => {
    const key = `${character.entityType}:${characterVisualIdentityKey(character.name, character.entityType)}`;
    if (!byVisualIdentity.has(key)) byVisualIdentity.set(key, character);
  });
  const structureCharacterIdByToken = new Map<string, string>();
  input.characters.forEach((character) => {
    structureCharacterIdByToken.set(character.id, character.id);
    structureCharacterIdByToken.set(normalize(character.name), character.id);
  });
  const characters = input.characters.map((character) => {
    const entityType = character.entityType ?? "human";
    const identityKey = `${entityType}:${characterVisualIdentityKey(character.name, entityType)}`;
    const projectCharacter = entityType === "group"
      ? byVisualIdentity.get(identityKey)
        ?? (character.projectCharacterId ? byId.get(character.projectCharacterId) : undefined)
        ?? byName.get(normalize(character.name))
      : character.projectCharacterId
        ? byId.get(character.projectCharacterId)
        : byName.get(normalize(character.name));
    return {
      id: character.id,
      projectCharacterId: projectCharacter?.id ?? `${UNRESOLVED_STORY_CHARACTER_PREFIX}${encodeURIComponent(normalize(character.name))}`,
      name: character.name,
      role: character.role,
      level: character.level ?? "extra",
      entityType,
      motivation: character.motivation,
      relationship: character.relationship,
      visualTraits: character.visualTraits,
      notes: character.notes,
    };
  });
  return {
    schemaVersion: 2,
    chapterId: input.chapterId,
    synopsis: input.synopsis,
    direction: input.direction,
    characters,
    scenes: input.scenes.map(({ id, name, location, timeOfDay, atmosphere, purpose }) => ({ id, name, location, timeOfDay, atmosphere, purpose })),
    beats: input.beats.map(({ id, order, title, summary, conflict, characters: beatCharacters, sceneId, visualFocus, outcome }) => ({
      id,
      order,
      title,
      summary,
      conflict,
      characters: beatCharacters.map((token) => structureCharacterIdByToken.get(token) ?? structureCharacterIdByToken.get(normalize(token)) ?? token),
      sceneId,
      visualFocus,
      outcome,
    })),
    notes: input.notes,
  };
}

export function toStoryboardDocumentV2(input: StoryboardJson, snapshot?: WorkbenchSnapshot): StoryboardDocumentV2 {
  const characterIdByToken = new Map<string, string>();
  if (snapshot) {
    for (const character of snapshot.characters) {
      characterIdByToken.set(character.id, character.id);
      characterIdByToken.set(normalize(character.name), character.id);
    }
    for (const card of snapshot.storyStructure?.structureJson.characters ?? []) {
      const projectCharacter = card.projectCharacterId
        ? snapshot.characters.find((item) => item.id === card.projectCharacterId)
        : findProjectCharacter(snapshot, card.name);
      if (!projectCharacter) continue;
      characterIdByToken.set(card.id, projectCharacter.id);
      characterIdByToken.set(normalize(card.name), projectCharacter.id);
    }
  }
  const resolveCharacter = (token: string): string => {
    if (!snapshot) return token;
    const resolved = characterIdByToken.get(token) ?? characterIdByToken.get(normalize(token));
    if (!resolved) throw new Error(`分镜引用的角色「${token}」尚未绑定到项目角色库`);
    return resolved;
  };

  return {
    schemaVersion: 2,
    chapterId: input.chapterId,
    shots: input.shots.map((shot) => ({
      id: shot.id,
      order: shot.order,
      beatId: shot.beatId,
      sceneId: shot.sceneId,
      characterIds: [...new Set(shot.characterIds.map(resolveCharacter))],
      coreAction: shot.coreAction,
      emotion: shot.emotion,
      shotType: shot.shotType,
      cameraAngle: shot.cameraAngle,
      comic: shot.comic,
      motion: {
        ...shot.motion,
        voiceLines: shot.motion.voiceLines.map((line) => ({
          ...line,
          characterId: line.characterId === null ? null : resolveCharacter(line.characterId),
        })),
      },
      promptDraft: shot.promptDraft,
    })),
    notes: input.notes,
  };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function findProjectCharacter(snapshot: WorkbenchSnapshot, name: string): ProjectCharacter | undefined {
  return snapshot.characters.find((item) => normalize(item.name) === normalize(name));
}
