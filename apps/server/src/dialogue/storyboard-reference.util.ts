import type {
  StoryboardJson,
  StoryStructureJson,
} from "@airoaming/shared";

export class StoryboardReferenceError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("；"));
    this.name = "StoryboardReferenceError";
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/**
 * AI 只负责输出 StoryStructure 内的本地引用；这里把角色卡 ID/名称映射成项目 Character ID。
 * beatId/sceneId 保持结构内 ID，但在落库前确认它们确实属于当前已确认结构。
 */
export function resolveStoryboardReferences(
  input: StoryboardJson,
  structure: StoryStructureJson,
  projectCharacters: ReadonlyArray<{ id: string; name: string }>,
): StoryboardJson {
  const projectById = new Map(projectCharacters.map((character) => [character.id, character]));
  const projectByName = new Map(projectCharacters.map((character) => [normalize(character.name), character]));
  const characterTokenToProjectId = new Map<string, string>();

  for (const card of structure.characters) {
    const projectCharacter = card.projectCharacterId
      ? projectById.get(card.projectCharacterId)
      : projectByName.get(normalize(card.name));
    if (!projectCharacter) continue;
    characterTokenToProjectId.set(card.id, projectCharacter.id);
    characterTokenToProjectId.set(normalize(card.name), projectCharacter.id);
    characterTokenToProjectId.set(projectCharacter.id, projectCharacter.id);
  }
  const beatIds = new Set(structure.beats.map((beat) => beat.id));
  const sceneIds = new Set(structure.scenes.map((scene) => scene.id));
  const issues: string[] = [];
  const resolveCharacter = (token: string, path: string): string | null => {
    const value = token.trim();
    const resolved = characterTokenToProjectId.get(value)
      ?? characterTokenToProjectId.get(normalize(value));
    if (!resolved) {
      const outside = projectById.get(value) ?? projectByName.get(normalize(value));
      issues.push(outside
        ? `${path} 引用了当前剧情结构未登记角色「${outside.name}」`
        : `${path} 引用了未绑定角色「${token}」`);
      return null;
    }
    return resolved;
  };

  const shots = input.shots.map((shot, index) => {
    const path = `shots[${index}]`;
    if (!shot.beatId || !beatIds.has(shot.beatId)) {
      issues.push(`${path}.beatId 必须引用当前剧情结构中的 beat`);
    }
    if (!shot.sceneId || !sceneIds.has(shot.sceneId)) {
      issues.push(`${path}.sceneId 必须引用当前剧情结构中的 scene`);
    }

    const characterIds = [...new Set(shot.characterIds
      .map((token, characterIndex) => resolveCharacter(token, `${path}.characterIds[${characterIndex}]`))
      .filter((value): value is string => value !== null))];
    const voiceLines = shot.motion.voiceLines.map((line, lineIndex) => ({
      ...line,
      characterId: line.characterId === null
        ? null
        : resolveCharacter(line.characterId, `${path}.motion.voiceLines[${lineIndex}].characterId`),
    }));

    return {
      ...shot,
      characterIds,
      motion: { ...shot.motion, voiceLines },
    };
  });

  if (issues.length > 0) {
    throw new StoryboardReferenceError(issues);
  }
  return { ...input, shots };
}
