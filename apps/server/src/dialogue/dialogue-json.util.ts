/**
 * DialogueService JSON 解析与 normalize 函数(从 dialogue.service.ts 抽出)。
 *
 * 处理 AI 返回的剧情结构 / 分镜 / 灵感种子 JSON,统一字段与枚举。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */
import type {
  ScriptInspirationSeed,
  StoryboardJson,
  StoryboardShot,
  StoryStructureCharacterCard,
  StoryStructureJson,
} from "@airoaming/shared";
import {
  SCRIPT_INSPIRATION_SEED_COUNT,
  normalizeCameraAngle,
  normalizeCameraMovement,
  normalizeFrameType,
  normalizePanelRhythm,
  normalizeShotType,
  normalizeVoiceLines,
  parseDurationHintToMs,
} from "@airoaming/shared";
import {
  asRecord,
  getOptionalRecordNumber,
  getOptionalRecordString,
  getRecordStringArray,
  normalizeInspirationSeed,
} from "./dialogue-text.util.js";

/** 从 AI 返回的文本中提取 JSON 载荷(支持代码块包裹或裸 JSON)。 */
export function extractJsonPayload(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const startObject = content.indexOf("{");
  const endObject = content.lastIndexOf("}");
  if (startObject >= 0 && endObject > startObject) {
    return content.slice(startObject, endObject + 1);
  }

  const startArray = content.indexOf("[");
  const endArray = content.lastIndexOf("]");
  if (startArray >= 0 && endArray > startArray) {
    return content.slice(startArray, endArray + 1);
  }

  throw new Error("AI 返回中没有可解析的 JSON 内容");
}

// ---------- 分镜 JSON normalize ----------

export function normalizeStoryboardJson(
  input: unknown,
  chapterId: string,
  fallbackChapterTitle: string,
  overrides: Partial<Pick<StoryboardJson, "sourceStoryVersionId" | "createdAt" | "updatedAt">> = {},
): StoryboardJson {
  const record = asRecord(input);
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: getOptionalRecordString(record, "chapterTitle") ?? fallbackChapterTitle,
    sourceStoryVersionId: overrides.sourceStoryVersionId
      ?? getOptionalRecordString(record, "sourceStoryVersionId"),
    shots: normalizeStoryboardShots(record.shots),
    notes: getOptionalRecordString(record, "notes") ?? "",
    createdAt: overrides.createdAt ?? getOptionalRecordString(record, "createdAt") ?? now,
    updatedAt: overrides.updatedAt ?? getOptionalRecordString(record, "updatedAt") ?? now,
  };
}

export function normalizeStoryboardShots(input: unknown): StoryboardJson["shots"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0)
    .map((item, index) => normalizeStoryboardShot(item, index))
    .sort((left, right) => left.order - right.order);
}

export function normalizeStoryboardShot(item: Record<string, unknown>, index: number): StoryboardShot {
  const comic = asRecord(item.comic);
  const motion = asRecord(item.motion);
  const status = getOptionalRecordString(item, "status");

  return {
    id: getOptionalRecordString(item, "id") ?? `shot_${String(index + 1).padStart(3, "0")}`,
    order: getOptionalRecordNumber(item, "order") ?? getOptionalRecordNumber(item, "shotNumber") ?? index + 1,
    beatId: getOptionalRecordString(item, "beatId"),
    sceneId: getOptionalRecordString(item, "sceneId"),
    characterIds: getRecordStringArray(item, "characterIds").length > 0
      ? getRecordStringArray(item, "characterIds")
      : getRecordStringArray(item, "characters"),
    coreAction: getOptionalRecordString(item, "coreAction") ?? getOptionalRecordString(item, "action") ?? "",
    emotion: getOptionalRecordString(item, "emotion") ?? "",
    shotType: normalizeShotType(getOptionalRecordString(item, "shotType")),
    cameraAngle: normalizeCameraAngle(getOptionalRecordString(item, "cameraAngle")),
    comic: {
      panelDescription: getOptionalRecordString(comic, "panelDescription") ?? getOptionalRecordString(item, "action") ?? "",
      composition: getOptionalRecordString(comic, "composition") ?? getOptionalRecordString(item, "composition") ?? "",
      dialogue: getOptionalRecordString(comic, "dialogue") ?? getOptionalRecordString(item, "dialogue") ?? "",
      caption: getOptionalRecordString(comic, "caption") ?? getOptionalRecordString(item, "caption") ?? "",
      panelRhythm: normalizePanelRhythm(getOptionalRecordString(comic, "panelRhythm") ?? ""),
    },
    motion: {
      visualDescription: getOptionalRecordString(motion, "visualDescription") ?? getOptionalRecordString(item, "action") ?? "",
      compositionDesign: getOptionalRecordString(motion, "compositionDesign") ?? getOptionalRecordString(item, "camera") ?? "",
      cameraMovement: normalizeCameraMovement(getOptionalRecordString(motion, "cameraMovement") ?? ""),
      frameType: normalizeFrameType(getOptionalRecordString(motion, "frameType") ?? ""),
      durationMs: getOptionalRecordNumber(motion, "durationMs")
        ?? parseDurationHintToMs(getOptionalRecordString(motion, "durationHint")),
      durationHint: getOptionalRecordString(motion, "durationHint") ?? "",
      voiceLines: normalizeVoiceLines(motion),
    },
    promptDraft: getOptionalRecordString(item, "promptDraft") ?? "",
    lockedCandidateId: getOptionalRecordString(item, "lockedCandidateId"),
    status: status === "ready_for_image" || status === "image_generated" || status === "locked" || status === "needs_revision"
      ? status
      : "draft",
  };
}

/** 从 AI 返回文本解析分镜 JSON(含校验当前章节存在)。 */
export function parseStoryboardJson(content: string, currentChapterId: string | undefined, currentChapterTitle: string, currentStoryVersionId: string | undefined): StoryboardJson {
  const jsonText = extractJsonPayload(content);
  const value = JSON.parse(jsonText) as unknown;
  return normalizeStoryboardJson(value, currentChapterId ?? "", currentChapterTitle, {
    sourceStoryVersionId: currentStoryVersionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// ---------- 剧情结构 JSON normalize ----------

export function normalizeStoryStructureJson(
  input: unknown,
  chapterId: string,
  fallbackChapterTitle: string,
  overrides: Partial<Pick<StoryStructureJson, "sourceScriptVersionId" | "createdAt" | "updatedAt">> = {},
): StoryStructureJson {
  const record = asRecord(input);
  const now = new Date().toISOString();
  const direction = asRecord(record.direction);
  const scenes = normalizeStoryStructureScenes(record.scenes);

  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: getOptionalRecordString(record, "chapterTitle") ?? fallbackChapterTitle,
    sourceScriptVersionId: overrides.sourceScriptVersionId
      ?? getOptionalRecordString(record, "sourceScriptVersionId"),
    synopsis: getOptionalRecordString(record, "synopsis") ?? "",
    direction: {
      logline: getOptionalRecordString(direction, "logline") ?? "",
      chapterGoal: getOptionalRecordString(direction, "chapterGoal") ?? "",
      coreConflict: getOptionalRecordString(direction, "coreConflict") ?? "",
      emotionalArc: getOptionalRecordString(direction, "emotionalArc") ?? "",
      endingHook: getOptionalRecordString(direction, "endingHook") ?? "",
    },
    characters: normalizeStoryStructureCharacters(record.characters),
    scenes,
    beats: normalizeStoryStructureBeats(record.beats, scenes),
    notes: getOptionalRecordString(record, "notes") ?? "",
    createdAt: overrides.createdAt ?? getOptionalRecordString(record, "createdAt") ?? now,
    updatedAt: overrides.updatedAt ?? getOptionalRecordString(record, "updatedAt") ?? now,
  };
}

export function normalizeStoryStructureCharacters(input: unknown): StoryStructureJson["characters"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0)
    .map((item, index) => ({
      id: getOptionalRecordString(item, "id") ?? `character_${String(index + 1).padStart(2, "0")}`,
      projectCharacterId: getOptionalRecordString(item, "projectCharacterId"),
      name: getOptionalRecordString(item, "name") ?? `角色 ${index + 1}`,
      role: getOptionalRecordString(item, "role") ?? "",
      level: getOptionalRecordString(item, "level") as StoryStructureCharacterCard["level"],
      entityType: getOptionalRecordString(item, "entityType") as StoryStructureCharacterCard["entityType"],
      motivation: getOptionalRecordString(item, "motivation") ?? "",
      relationship: getOptionalRecordString(item, "relationship") ?? "",
      visualTraits: getOptionalRecordString(item, "visualTraits") ?? "",
      notes: getOptionalRecordString(item, "notes") ?? "",
    }));
}

export function normalizeStoryStructureScenes(input: unknown): StoryStructureJson["scenes"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0)
    .map((item, index) => ({
      id: getOptionalRecordString(item, "id") ?? `scene_${String(index + 1).padStart(2, "0")}`,
      name: getOptionalRecordString(item, "name") ?? `场景 ${index + 1}`,
      location: getOptionalRecordString(item, "location") ?? "",
      timeOfDay: getOptionalRecordString(item, "timeOfDay") ?? "",
      atmosphere: getOptionalRecordString(item, "atmosphere") ?? "",
      purpose: getOptionalRecordString(item, "purpose") ?? "",
    }));
}

export function normalizeStoryStructureBeats(input: unknown, scenes: StoryStructureJson["scenes"]): StoryStructureJson["beats"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0)
    .map((item, index) => {
      const sceneId = getOptionalRecordString(item, "sceneId")
        ?? resolveSceneIdByName(getOptionalRecordString(item, "sceneName"), scenes);
      return {
        id: getOptionalRecordString(item, "id") ?? `beat_${String(index + 1).padStart(2, "0")}`,
        order: getOptionalRecordNumber(item, "order") ?? index + 1,
        title: getOptionalRecordString(item, "title") ?? `节拍 ${index + 1}`,
        summary: getOptionalRecordString(item, "summary") ?? "",
        conflict: getOptionalRecordString(item, "conflict") ?? "",
        characters: getRecordStringArray(item, "characters"),
        sceneId,
        visualFocus: getOptionalRecordString(item, "visualFocus") ?? "",
        outcome: getOptionalRecordString(item, "outcome") ?? "",
      };
    });
}

export function resolveSceneIdByName(sceneName: string | null, scenes: StoryStructureJson["scenes"]): string | null {
  if (!sceneName) {
    return null;
  }

  return scenes.find((scene) => scene.name === sceneName)?.id ?? null;
}

/** 从 AI 返回文本解析剧情结构 JSON(含校验当前章节存在)。 */
export function parseStoryStructureJson(content: string, currentChapterId: string | undefined, currentChapterTitle: string, currentScriptVersionId: string | undefined): StoryStructureJson {
  const jsonText = extractJsonPayload(content);
  const value = JSON.parse(jsonText) as unknown;
  return normalizeStoryStructureJson(value, currentChapterId ?? "", currentChapterTitle, {
    sourceScriptVersionId: currentScriptVersionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// ---------- 灵感种子 JSON 解析 ----------

export function parseInspirationSeeds(content: string): ScriptInspirationSeed[] {
  const jsonText = extractJsonPayload(content);
  const value = JSON.parse(jsonText) as unknown;
  const rawSeeds = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { seeds?: unknown }).seeds)
      ? (value as { seeds: unknown[] }).seeds
      : null;

  if (!rawSeeds || rawSeeds.length < SCRIPT_INSPIRATION_SEED_COUNT) {
    throw new Error(`AI 没有按约定返回 ${SCRIPT_INSPIRATION_SEED_COUNT} 个灵感种子`);
  }

  return rawSeeds.slice(0, SCRIPT_INSPIRATION_SEED_COUNT).map((rawSeed, index) => normalizeInspirationSeed(rawSeed, index));
}
