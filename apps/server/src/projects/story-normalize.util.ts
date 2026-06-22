import {
  normalizeCameraAngle,
  normalizeCameraMovement,
  normalizeFrameType,
  normalizePanelRhythm,
  normalizeShotType,
  normalizeVoiceLines,
  parseDurationHintToMs,
  type StoryboardJson,
  type StoryboardShot,
  type StoryStructureCharacterCard,
  type StoryStructureJson,
} from "@airoaming/shared";
import * as wsJson from "./workspace-json.util.js";

/**
 * 剧情结构 / 分镜 JSON 的领域 normalize(从 projects.service 抽出,供 ProjectRepository / Service 共用)。
 * 见任务 2026-06-21_ProjectsService拆分 阶段①子步 1b-pre-2。
 */

export function normalizeStoryStructureJson(
  input: unknown,
  chapterId: string,
  fallbackChapterTitle: string,
  overrides: Partial<Pick<StoryStructureJson, "sourceScriptVersionId" | "createdAt" | "updatedAt">> = {},
): StoryStructureJson {
  const record = typeof input === "object" && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const now = new Date().toISOString();
  const directionRecord = typeof record.direction === "object" && record.direction !== null && !Array.isArray(record.direction)
    ? record.direction as Record<string, unknown>
    : {};

  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: wsJson.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
    sourceScriptVersionId: overrides.sourceScriptVersionId
      ?? (typeof record.sourceScriptVersionId === "string" && record.sourceScriptVersionId.trim() ? record.sourceScriptVersionId : null),
    synopsis: wsJson.getStringField(record, "synopsis", ""),
    direction: {
      logline: wsJson.getStringField(directionRecord, "logline", ""),
      chapterGoal: wsJson.getStringField(directionRecord, "chapterGoal", ""),
      coreConflict: wsJson.getStringField(directionRecord, "coreConflict", ""),
      emotionalArc: wsJson.getStringField(directionRecord, "emotionalArc", ""),
      endingHook: wsJson.getStringField(directionRecord, "endingHook", ""),
    },
    characters: normalizeStoryStructureCharacters(record.characters),
    scenes: normalizeStoryStructureScenes(record.scenes),
    beats: normalizeStoryStructureBeats(record.beats),
    notes: wsJson.getStringField(record, "notes", ""),
    createdAt: overrides.createdAt ?? wsJson.getStringField(record, "createdAt", now),
    updatedAt: overrides.updatedAt ?? wsJson.getStringField(record, "updatedAt", now),
  };
}

function normalizeStoryStructureCharacters(input: unknown): StoryStructureJson["characters"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item, index) => ({
      id: wsJson.getStringField(item, "id", `character_${String(index + 1).padStart(2, "0")}`),
      projectCharacterId: wsJson.getOptionalStringField(item, "projectCharacterId"),
      name: wsJson.getStringField(item, "name", `角色 ${index + 1}`),
      role: wsJson.getStringField(item, "role", ""),
      level: wsJson.getOptionalStringField(item, "level") as StoryStructureCharacterCard["level"],
      entityType: wsJson.getOptionalStringField(item, "entityType") as StoryStructureCharacterCard["entityType"],
      motivation: wsJson.getStringField(item, "motivation", ""),
      relationship: wsJson.getStringField(item, "relationship", ""),
      visualTraits: wsJson.getStringField(item, "visualTraits", ""),
      notes: wsJson.getStringField(item, "notes", ""),
    }));
}

function normalizeStoryStructureScenes(input: unknown): StoryStructureJson["scenes"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item, index) => ({
      id: wsJson.getStringField(item, "id", `scene_${String(index + 1).padStart(2, "0")}`),
      name: wsJson.getStringField(item, "name", `场景 ${index + 1}`),
      location: wsJson.getStringField(item, "location", ""),
      timeOfDay: wsJson.getStringField(item, "timeOfDay", ""),
      atmosphere: wsJson.getStringField(item, "atmosphere", ""),
      purpose: wsJson.getStringField(item, "purpose", ""),
      referenceAssetId: wsJson.getOptionalStringField(item, "referenceAssetId") ?? null,
    }));
}

function normalizeStoryStructureBeats(input: unknown): StoryStructureJson["beats"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item, index) => ({
      id: wsJson.getStringField(item, "id", `beat_${String(index + 1).padStart(2, "0")}`),
      order: wsJson.getNumberField(item, "order", index + 1),
      title: wsJson.getStringField(item, "title", `节拍 ${index + 1}`),
      summary: wsJson.getStringField(item, "summary", ""),
      conflict: wsJson.getStringField(item, "conflict", ""),
      characters: wsJson.getStringArrayField(item, "characters"),
      sceneId: wsJson.getOptionalStringField(item, "sceneId"),
      visualFocus: wsJson.getStringField(item, "visualFocus", ""),
      outcome: wsJson.getStringField(item, "outcome", ""),
    }));
}

export function normalizeStoryboardJson(
  input: unknown,
  chapterId: string,
  fallbackChapterTitle: string,
  overrides: Partial<Pick<StoryboardJson, "sourceStoryVersionId" | "createdAt" | "updatedAt">> = {},
): StoryboardJson {
  const record = typeof input === "object" && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: wsJson.getStringField(record, "chapterTitle", fallbackChapterTitle || "当前章节"),
    sourceStoryVersionId: overrides.sourceStoryVersionId
      ?? (typeof record.sourceStoryVersionId === "string" && record.sourceStoryVersionId.trim() ? record.sourceStoryVersionId : null),
    shots: normalizeStoryboardShots(record.shots),
    notes: wsJson.getStringField(record, "notes", ""),
    createdAt: overrides.createdAt ?? wsJson.getStringField(record, "createdAt", now),
    updatedAt: overrides.updatedAt ?? wsJson.getStringField(record, "updatedAt", now),
  };
}

function normalizeStoryboardShots(input: unknown): StoryboardJson["shots"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item, index) => normalizeStoryboardShot(item, index))
    .sort((left, right) => left.order - right.order);
}

function normalizeStoryboardShot(item: Record<string, unknown>, index: number): StoryboardShot {
  const comic = typeof item.comic === "object" && item.comic !== null && !Array.isArray(item.comic)
    ? item.comic as Record<string, unknown>
    : {};
  const motion = typeof item.motion === "object" && item.motion !== null && !Array.isArray(item.motion)
    ? item.motion as Record<string, unknown>
    : {};
  const status = wsJson.getStringField(item, "status", "draft");

  return {
    id: wsJson.getStringField(item, "id", `shot_${String(index + 1).padStart(3, "0")}`),
    order: wsJson.getNumberField(item, "order", wsJson.getNumberField(item, "shotNumber", index + 1)),
    beatId: wsJson.getOptionalStringField(item, "beatId"),
    sceneId: wsJson.getOptionalStringField(item, "sceneId"),
    characterIds: wsJson.getStringArrayField(item, "characterIds"),
    coreAction: wsJson.getStringField(item, "coreAction", wsJson.getStringField(item, "action", "")),
    emotion: wsJson.getStringField(item, "emotion", ""),
    shotType: normalizeShotType(wsJson.getOptionalStringField(item, "shotType")),
    cameraAngle: normalizeCameraAngle(wsJson.getOptionalStringField(item, "cameraAngle")),
    comic: {
      panelDescription: wsJson.getStringField(comic, "panelDescription", wsJson.getStringField(item, "action", "")),
      composition: wsJson.getStringField(comic, "composition", wsJson.getStringField(item, "composition", wsJson.getStringField(item, "camera", ""))),
      dialogue: wsJson.getStringField(comic, "dialogue", wsJson.getStringField(item, "dialogue", "")),
      caption: wsJson.getStringField(comic, "caption", wsJson.getStringField(item, "caption", "")),
      panelRhythm: normalizePanelRhythm(wsJson.getStringField(comic, "panelRhythm", "")),
    },
    motion: {
      visualDescription: wsJson.getStringField(motion, "visualDescription", wsJson.getStringField(item, "action", "")),
      compositionDesign: wsJson.getStringField(motion, "compositionDesign", wsJson.getStringField(item, "camera", "")),
      cameraMovement: normalizeCameraMovement(wsJson.getStringField(motion, "cameraMovement", "")),
      frameType: normalizeFrameType(wsJson.getStringField(motion, "frameType", "")),
      durationMs: wsJson.getNumberField(
        motion,
        "durationMs",
        parseDurationHintToMs(wsJson.getStringField(motion, "durationHint", "")),
      ),
      durationHint: wsJson.getStringField(motion, "durationHint", ""),
      voiceLines: normalizeVoiceLines(motion),
    },
    promptDraft: wsJson.getStringField(item, "promptDraft", ""),
    lockedCandidateId: wsJson.getOptionalStringField(item, "lockedCandidateId"),
    status: status === "ready_for_image" || status === "image_generated" || status === "locked" || status === "needs_revision"
      ? status
      : "draft",
  };
}
