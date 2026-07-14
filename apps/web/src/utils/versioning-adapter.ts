import type {
  ProjectCharacter,
  StoryDocumentV2,
  StoryboardDocumentV2,
  StoryStructureJson,
  StoryboardJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";

/** Convert the legacy-shaped workbench editor value to the strict G2 document. */
export function toStoryDocumentV2(input: StoryStructureJson, snapshot: WorkbenchSnapshot): StoryDocumentV2 {
  const byName = new Map(snapshot.characters.map((character) => [normalize(character.name), character]));
  const characters = input.characters.map((character) => {
    const projectCharacter = character.projectCharacterId
      ? snapshot.characters.find((item) => item.id === character.projectCharacterId)
      : byName.get(normalize(character.name));
    if (!projectCharacter) throw new Error(`角色「${character.name}」尚未绑定项目角色库`);
    return {
      id: character.id,
      projectCharacterId: projectCharacter.id,
      name: character.name,
      role: character.role,
      level: character.level ?? "extra",
      entityType: character.entityType ?? "human",
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
    beats: input.beats.map(({ id, order, title, summary, conflict, characters: beatCharacters, sceneId, visualFocus, outcome }) => ({ id, order, title, summary, conflict, characters: beatCharacters, sceneId, visualFocus, outcome })),
    notes: input.notes,
  };
}

export function toStoryboardDocumentV2(input: StoryboardJson): StoryboardDocumentV2 {
  return {
    schemaVersion: 2,
    chapterId: input.chapterId,
    shots: input.shots.map((shot) => ({
      id: shot.id,
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
    notes: input.notes,
  };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function findProjectCharacter(snapshot: WorkbenchSnapshot, name: string): ProjectCharacter | undefined {
  return snapshot.characters.find((item) => normalize(item.name) === normalize(name));
}
