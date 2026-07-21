import {
  parseChapterScriptCharacterRosterV1,
  parseChapterScriptMarkdownV1,
  type ChapterScriptDocumentV1,
  type StoryStructureJson,
} from "@airoaming/shared";

export class StoryStructureQualityError extends Error {
  readonly code = "STORY_STRUCTURE_QUALITY_FAILED";

  constructor(readonly issues: readonly string[]) {
    super(`剧情结构质量门未通过：${issues.join("、")}`);
    this.name = "StoryStructureQualityError";
  }
}
const CHARACTER_LEVELS = new Set(["lead", "recurring", "chapter", "minor", "extra"]);
const CHARACTER_ENTITY_TYPES = new Set(["human", "creature", "group", "voice"]);
const PLACEHOLDER_VALUES = new Set([
  "待补充",
  "待定",
  "未知",
  "无",
  "无内容",
  "未写",
  "省略",
  "略",
  "todo",
  "tbd",
]);
const EMPTY_ROSTER_VALUES = new Set(["无", "无明确人物", "原稿未明确", "无人"]);

function semanticKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(semanticKey(value));
}

function addRequiredTextIssue(issues: string[], value: string, emptyCode: string, placeholderCode: string): void {
  if (!value.trim()) {
    issues.push(emptyCode);
  } else if (isPlaceholder(value)) {
    issues.push(placeholderCode);
  }
}

function duplicateMeaningfulValues(values: readonly string[]): boolean {
  const keys = values.map(semanticKey).filter((value) => value.length > 0);
  return new Set(keys).size !== keys.length;
}

function uniqueIssues(issues: readonly string[]): string[] {
  return [...new Set(issues)];
}

function parseSourceDocument(sourceText: string): ChapterScriptDocumentV1 | null {
  try {
    return parseChapterScriptMarkdownV1(sourceText);
  } catch {
    // 历史章节可能不是当前固定 Markdown。此时仍执行结构自身的高置信检查，
    // 但不伪造“已完成正文场景覆盖”的结论。
    return null;
  }
}

function splitSourceCharacterNames(value: string): string[] {
  return parseChapterScriptCharacterRosterV1(value).names
    .filter((item) => item.length > 0 && !EMPTY_ROSTER_VALUES.has(semanticKey(item)));
}

function assertDirection(structure: StoryStructureJson, issues: string[]): void {
  const fields = ["logline", "chapterGoal", "coreConflict", "emotionalArc", "endingHook"] as const;
  for (const field of fields) {
    addRequiredTextIssue(
      issues,
      structure.direction[field],
      `STRUCTURE_DIRECTION_EMPTY:${field}`,
      `STRUCTURE_DIRECTION_PLACEHOLDER:${field}`,
    );
  }
}

function assertCharacters(
  structure: StoryStructureJson,
  sourceText: string,
  sourceDocument: ChapterScriptDocumentV1 | null,
  issues: string[],
): Map<string, string> {
  const tokens = new Map<string, string>();
  const seenNames = new Set<string>();
  const normalizedSource = semanticKey(sourceText);

  for (const character of structure.characters) {
    const key = semanticKey(character.name);
    addRequiredTextIssue(
      issues,
      character.name,
      `STRUCTURE_CHARACTER_NAME_EMPTY:${character.id}`,
      `STRUCTURE_CHARACTER_NAME_PLACEHOLDER:${character.id}`,
    );
    if (key && seenNames.has(key)) issues.push(`STRUCTURE_CHARACTER_NAME_DUPLICATE:${character.name}`);
    if (key) seenNames.add(key);
    if (!CHARACTER_LEVELS.has(character.level ?? "")) issues.push(`STRUCTURE_CHARACTER_LEVEL_INVALID:${character.id}`);
    if (!CHARACTER_ENTITY_TYPES.has(character.entityType ?? "")) issues.push(`STRUCTURE_CHARACTER_ENTITY_TYPE_INVALID:${character.id}`);
    if (key && !normalizedSource.includes(key)) issues.push(`STRUCTURE_CHARACTER_NOT_IN_SOURCE:${character.name}`);
    tokens.set(character.id, character.name);
    if (key) tokens.set(key, character.name);
  }

  if (sourceDocument) {
    const requiredNames = new Map<string, string>();
    for (const scene of sourceDocument.scenes) {
      for (const name of splitSourceCharacterNames(scene.characters)) {
        requiredNames.set(semanticKey(name), name);
      }
    }
    for (const [key, name] of requiredNames) {
      if (!tokens.has(key)) issues.push(`STRUCTURE_SOURCE_CHARACTER_MISSING:${name}`);
    }
  }

  return tokens;
}

function assertScenes(
  structure: StoryStructureJson,
  sourceDocument: ChapterScriptDocumentV1 | null,
  issues: string[],
): Set<string> {
  if (structure.scenes.length === 0) issues.push("STRUCTURE_SCENES_EMPTY");
  const sceneIds = new Set<string>();
  const sceneNames = new Set<string>();
  for (const scene of structure.scenes) {
    if (sceneIds.has(scene.id)) issues.push(`STRUCTURE_SCENE_ID_DUPLICATE:${scene.id}`);
    sceneIds.add(scene.id);
    const nameKey = semanticKey(scene.name);
    addRequiredTextIssue(issues, scene.name, `STRUCTURE_SCENE_NAME_EMPTY:${scene.id}`, `STRUCTURE_SCENE_NAME_PLACEHOLDER:${scene.id}`);
    if (nameKey && sceneNames.has(nameKey)) issues.push(`STRUCTURE_SCENE_NAME_DUPLICATE:${scene.name}`);
    if (nameKey) sceneNames.add(nameKey);
    addRequiredTextIssue(issues, scene.purpose, `STRUCTURE_SCENE_PURPOSE_EMPTY:${scene.id}`, `STRUCTURE_SCENE_PURPOSE_PLACEHOLDER:${scene.id}`);
  }

  if (sourceDocument) {
    if (structure.scenes.length !== sourceDocument.scenes.length) issues.push("STRUCTURE_SOURCE_SCENE_COUNT_MISMATCH");
    sourceDocument.scenes.forEach((sourceScene, index) => {
      const scene = structure.scenes[index];
      if (!scene) {
        issues.push(`STRUCTURE_SOURCE_SCENE_MISSING:scene-${sourceScene.order}`);
        return;
      }
      if (semanticKey(scene.name) !== semanticKey(sourceScene.name)) issues.push(`STRUCTURE_SOURCE_SCENE_NAME_MISMATCH:scene-${sourceScene.order}`);
      if (semanticKey(scene.location) !== semanticKey(sourceScene.location)) issues.push(`STRUCTURE_SOURCE_SCENE_LOCATION_MISMATCH:scene-${sourceScene.order}`);
      if (semanticKey(scene.timeOfDay) !== semanticKey(sourceScene.time)) issues.push(`STRUCTURE_SOURCE_SCENE_TIME_MISMATCH:scene-${sourceScene.order}`);
      if (semanticKey(scene.atmosphere) !== semanticKey(sourceScene.atmosphere)) issues.push(`STRUCTURE_SOURCE_SCENE_ATMOSPHERE_MISMATCH:scene-${sourceScene.order}`);
    });
  }

  return sceneIds;
}

function assertBeats(
  structure: StoryStructureJson,
  sceneIds: ReadonlySet<string>,
  characterTokens: ReadonlyMap<string, string>,
  issues: string[],
): void {
  if (structure.beats.length === 0) issues.push("STRUCTURE_BEATS_EMPTY");
  const beatIds = new Set<string>();
  const usedSceneIds = new Set<string>();

  structure.beats.forEach((beat, index) => {
    if (beatIds.has(beat.id)) issues.push(`STRUCTURE_BEAT_ID_DUPLICATE:${beat.id}`);
    beatIds.add(beat.id);
    if (beat.order !== index + 1) issues.push(`STRUCTURE_BEAT_ORDER_NOT_CONTIGUOUS:${beat.id}`);
    addRequiredTextIssue(issues, beat.title, `STRUCTURE_BEAT_TITLE_EMPTY:${beat.id}`, `STRUCTURE_BEAT_TITLE_PLACEHOLDER:${beat.id}`);
    addRequiredTextIssue(issues, beat.summary, `STRUCTURE_BEAT_SUMMARY_EMPTY:${beat.id}`, `STRUCTURE_BEAT_SUMMARY_PLACEHOLDER:${beat.id}`);
    addRequiredTextIssue(issues, beat.conflict, `STRUCTURE_BEAT_CONFLICT_EMPTY:${beat.id}`, `STRUCTURE_BEAT_CONFLICT_PLACEHOLDER:${beat.id}`);
    addRequiredTextIssue(issues, beat.visualFocus, `STRUCTURE_BEAT_VISUAL_FOCUS_EMPTY:${beat.id}`, `STRUCTURE_BEAT_VISUAL_FOCUS_PLACEHOLDER:${beat.id}`);
    addRequiredTextIssue(issues, beat.outcome, `STRUCTURE_BEAT_OUTCOME_EMPTY:${beat.id}`, `STRUCTURE_BEAT_OUTCOME_PLACEHOLDER:${beat.id}`);
    if (!beat.sceneId || !sceneIds.has(beat.sceneId)) {
      issues.push(`STRUCTURE_BEAT_SCENE_UNKNOWN:${beat.id}`);
    } else {
      usedSceneIds.add(beat.sceneId);
    }
    for (const token of beat.characters) {
      const key = characterTokens.has(token) ? token : semanticKey(token);
      if (!characterTokens.has(key)) issues.push(`STRUCTURE_BEAT_CHARACTER_UNKNOWN:${beat.id}:${token}`);
    }
  });

  for (const scene of structure.scenes) {
    if (!usedSceneIds.has(scene.id)) issues.push(`STRUCTURE_SCENE_WITHOUT_BEAT:${scene.id}`);
  }
  if (structure.beats.length > 1 && duplicateMeaningfulValues(structure.beats.map((beat) => beat.summary))) {
    issues.push("STRUCTURE_BEAT_SUMMARY_REPEATED");
  }
  if (structure.beats.length > 1 && duplicateMeaningfulValues(structure.beats.map((beat) => beat.outcome))) {
    issues.push("STRUCTURE_BEAT_OUTCOME_REPEATED");
  }
}

/**
 * 剧情结构进入待确认预览前的高置信质量门。
 * 只检查可由现有正文和结构引用确定的错误，不尝试替代人物弧、节奏或艺术判断。
 */
export function assertStoryStructureQuality(structure: StoryStructureJson, sourceText: string): void {
  const issues: string[] = [];
  addRequiredTextIssue(issues, structure.synopsis, "STRUCTURE_SYNOPSIS_EMPTY", "STRUCTURE_SYNOPSIS_PLACEHOLDER");
  assertDirection(structure, issues);
  const sourceDocument = parseSourceDocument(sourceText);
  const characterTokens = assertCharacters(structure, sourceText, sourceDocument, issues);
  const sceneIds = assertScenes(structure, sourceDocument, issues);
  assertBeats(structure, sceneIds, characterTokens, issues);

  const result = uniqueIssues(issues);
  if (result.length > 0) throw new StoryStructureQualityError(result);
}
