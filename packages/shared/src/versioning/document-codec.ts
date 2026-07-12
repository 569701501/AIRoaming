import { stripChapterScriptName } from "../script-format.js";
import {
  canonicalJsonBytes,
  canonicalizeJson,
  digestCanonicalJson,
  parseStrictJson,
  sha256Bytes,
} from "./canonical-json.js";
import type {
  CameraAngleV2,
  CameraMovementV2,
  Digest,
  EncodedDocument,
  FrameTypeV2,
  PanelRhythmV2,
  PreflightCharacterCheckV2,
  PreflightDocumentV2,
  PreflightIssueTypeV2,
  PreflightSceneCheckV2,
  PreflightSourceSnapshotV1,
  PreflightStyleCheckV2,
  StoryBeatV2,
  StoryCharacterEntityType,
  StoryCharacterLevel,
  StoryCharacterV2,
  StoryDirectionV2,
  StoryDocumentV2,
  StorySceneV2,
  StoryboardComicV2,
  StoryboardDocumentV2,
  StoryboardMotionV2,
  StoryboardShotV2,
  StoryboardVoiceLineV2,
  ShotTypeV2,
} from "./document-contract.js";

export class DocumentValidationError extends Error {
  readonly code = "VERSION_DOCUMENT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

function invalid(path: string, message: string): never {
  throw new DocumentValidationError(`${path}: ${message}`);
}

function inputValue(input: unknown): unknown {
  if (typeof input === "string") {
    try { return parseStrictJson(input); } catch (error) {
      invalid("document", error instanceof Error ? error.message : "invalid JSON");
    }
  }
  return input;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    invalid(path, "expected a plain object");
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const result = object(value, path);
  const expected = new Set(keys);
  for (const key of Object.keys(result)) if (!expected.has(key)) invalid(`${path}.${key}`, "unknown field");
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(result, key)) invalid(`${path}.${key}`, "missing required field");
  return result;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string") invalid(path, "expected string");
  if (!allowEmpty && value.trim() === "") invalid(path, "must be non-empty");
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "expected boolean");
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) invalid(path, `expected integer >= ${minimum}`);
  return value;
}

function enumeration<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid(path, `expected one of ${values.join(", ")}`);
  return value as T;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function atomicAssetTriple(visualId: string | null, assetId: string | null, assetSha256: Digest | null, path: string): void {
  const filled = [visualId, assetId, assetSha256].filter((item) => item !== null).length;
  if (filled !== 0 && filled !== 3) invalid(path, "visualId, assetId and assetSha256 must be all null or all filled");
}

function digest(value: unknown, path: string): Digest {
  const result = string(value, path);
  if (!/^sha256:[0-9a-f]{64}$/.test(result)) invalid(path, "expected sha256:<64 lowercase hex>");
  return result as Digest;
}

function uniqueIds(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) invalid(path, `duplicate id ${value}`);
    seen.add(value);
  }
}

function ordered(values: readonly number[], path: string): void {
  values.forEach((value, index) => {
    if (value !== index + 1) invalid(`${path}[${index}]`, "order must be contiguous from 1");
  });
}

const LEVELS = ["lead", "recurring", "chapter", "minor", "extra"] as const satisfies readonly StoryCharacterLevel[];
const ENTITY_TYPES = ["human", "creature", "group", "voice"] as const satisfies readonly StoryCharacterEntityType[];
const SHOT_TYPES = ["establishing", "wide", "full", "medium", "close_up", "extreme_close_up"] as const satisfies readonly ShotTypeV2[];
const CAMERA_ANGLES = ["eye_level", "high_angle", "low_angle", "over_shoulder", "top_down", "dutch_angle"] as const satisfies readonly CameraAngleV2[];
const RHYTHMS = ["slow", "normal", "fast", "impact", "transition"] as const satisfies readonly PanelRhythmV2[];
const MOVEMENTS = ["static", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "track_left", "track_right", "slow_zoom", "handheld", "none"] as const satisfies readonly CameraMovementV2[];
const FRAME_TYPES = ["atmosphere", "dialogue", "action", "reaction", "detail", "transition"] as const satisfies readonly FrameTypeV2[];
const CHECK_STATUSES = ["ok", "warning", "blocked"] as const;
const ISSUE_TYPES = ["missing_storyboard", "unresolved_character", "missing_reference", "running_reference_task", "missing_scene", "missing_scene_reference", "missing_style_context"] as const satisfies readonly PreflightIssueTypeV2[];

function parseDirection(value: unknown, path: string): StoryDirectionV2 {
  const row = exact(value, ["logline", "chapterGoal", "coreConflict", "emotionalArc", "endingHook"], path);
  return {
    logline: string(row.logline, `${path}.logline`, true),
    chapterGoal: string(row.chapterGoal, `${path}.chapterGoal`, true),
    coreConflict: string(row.coreConflict, `${path}.coreConflict`, true),
    emotionalArc: string(row.emotionalArc, `${path}.emotionalArc`, true),
    endingHook: string(row.endingHook, `${path}.endingHook`, true),
  };
}

function parseCharacter(value: unknown, path: string): StoryCharacterV2 {
  const row = exact(value, ["id", "projectCharacterId", "name", "role", "level", "entityType", "motivation", "relationship", "visualTraits", "notes"], path);
  return {
    id: string(row.id, `${path}.id`), projectCharacterId: string(row.projectCharacterId, `${path}.projectCharacterId`),
    name: string(row.name, `${path}.name`), role: string(row.role, `${path}.role`, true),
    level: enumeration(row.level, LEVELS, `${path}.level`), entityType: enumeration(row.entityType, ENTITY_TYPES, `${path}.entityType`),
    motivation: string(row.motivation, `${path}.motivation`, true), relationship: string(row.relationship, `${path}.relationship`, true),
    visualTraits: string(row.visualTraits, `${path}.visualTraits`, true), notes: string(row.notes, `${path}.notes`, true),
  };
}

function parseScene(value: unknown, path: string): StorySceneV2 {
  const row = exact(value, ["id", "name", "location", "timeOfDay", "atmosphere", "purpose"], path);
  return {
    id: string(row.id, `${path}.id`), name: string(row.name, `${path}.name`), location: string(row.location, `${path}.location`, true),
    timeOfDay: string(row.timeOfDay, `${path}.timeOfDay`, true), atmosphere: string(row.atmosphere, `${path}.atmosphere`, true), purpose: string(row.purpose, `${path}.purpose`, true),
  };
}

function parseStringArray(value: unknown, path: string, allowEmpty = false): string[] {
  if (!Array.isArray(value)) invalid(path, "expected array");
  return value.map((item, index) => string(item, `${path}[${index}]`, allowEmpty));
}

function parseBeat(value: unknown, path: string, characterIds: Set<string>, sceneIds: Set<string>): StoryBeatV2 {
  const row = exact(value, ["id", "order", "title", "summary", "conflict", "characters", "sceneId", "visualFocus", "outcome"], path);
  const characters = parseStringArray(row.characters, `${path}.characters`);
  characters.forEach((id, index) => { if (!characterIds.has(id)) invalid(`${path}.characters[${index}]`, "unknown character id"); });
  const sceneId = nullableString(row.sceneId, `${path}.sceneId`);
  if (sceneId !== null && !sceneIds.has(sceneId)) invalid(`${path}.sceneId`, "unknown scene id");
  return {
    id: string(row.id, `${path}.id`), order: integer(row.order, `${path}.order`, 1), title: string(row.title, `${path}.title`),
    summary: string(row.summary, `${path}.summary`, true), conflict: string(row.conflict, `${path}.conflict`, true), characters,
    sceneId, visualFocus: string(row.visualFocus, `${path}.visualFocus`, true), outcome: string(row.outcome, `${path}.outcome`, true),
  };
}

export function parseStoryDocumentV2(input: unknown): StoryDocumentV2 {
  const row = exact(inputValue(input), ["schemaVersion", "chapterId", "synopsis", "direction", "characters", "scenes", "beats", "notes"], "story");
  if (row.schemaVersion !== 2) invalid("story.schemaVersion", "expected 2");
  if (!Array.isArray(row.characters) || !Array.isArray(row.scenes) || !Array.isArray(row.beats)) invalid("story", "characters/scenes/beats must be arrays");
  const characters = row.characters.map((item, index) => parseCharacter(item, `story.characters[${index}]`));
  const scenes = row.scenes.map((item, index) => parseScene(item, `story.scenes[${index}]`));
  uniqueIds(characters.map((item) => item.id), "story.characters"); uniqueIds(scenes.map((item) => item.id), "story.scenes");
  const characterIds = new Set(characters.map((item) => item.id)); const sceneIds = new Set(scenes.map((item) => item.id));
  const beats = row.beats.map((item, index) => parseBeat(item, `story.beats[${index}]`, characterIds, sceneIds));
  uniqueIds(beats.map((item) => item.id), "story.beats"); ordered(beats.map((item) => item.order), "story.beats");
  return { schemaVersion: 2, chapterId: string(row.chapterId, "story.chapterId"), synopsis: string(row.synopsis, "story.synopsis", true), direction: parseDirection(row.direction, "story.direction"), characters, scenes, beats, notes: string(row.notes, "story.notes", true) };
}

function parseVoiceLine(value: unknown, path: string, characterIds: ReadonlySet<string>): StoryboardVoiceLineV2 {
  const row = exact(value, ["characterId", "name", "line", "voiceStyle"], path);
  const characterId = nullableString(row.characterId, `${path}.characterId`);
  if (characterId !== null && characterIds.size > 0 && !characterIds.has(characterId)) invalid(`${path}.characterId`, "unknown character id");
  return { characterId, name: string(row.name, `${path}.name`, true), line: string(row.line, `${path}.line`, true), voiceStyle: string(row.voiceStyle, `${path}.voiceStyle`, true) };
}

function parseComic(value: unknown, path: string): StoryboardComicV2 {
  const row = exact(value, ["panelDescription", "composition", "dialogue", "caption", "panelRhythm"], path);
  return { panelDescription: string(row.panelDescription, `${path}.panelDescription`, true), composition: string(row.composition, `${path}.composition`, true), dialogue: string(row.dialogue, `${path}.dialogue`, true), caption: string(row.caption, `${path}.caption`, true), panelRhythm: enumeration(row.panelRhythm, RHYTHMS, `${path}.panelRhythm`) };
}

function parseMotion(value: unknown, path: string, characterIds: ReadonlySet<string>): StoryboardMotionV2 {
  const row = exact(value, ["visualDescription", "compositionDesign", "cameraMovement", "frameType", "durationMs", "durationHint", "voiceLines"], path);
  if (!Array.isArray(row.voiceLines)) invalid(`${path}.voiceLines`, "expected array");
  return { visualDescription: string(row.visualDescription, `${path}.visualDescription`, true), compositionDesign: string(row.compositionDesign, `${path}.compositionDesign`, true), cameraMovement: enumeration(row.cameraMovement, MOVEMENTS, `${path}.cameraMovement`), frameType: enumeration(row.frameType, FRAME_TYPES, `${path}.frameType`), durationMs: integer(row.durationMs, `${path}.durationMs`), durationHint: string(row.durationHint, `${path}.durationHint`, true), voiceLines: row.voiceLines.map((item, index) => parseVoiceLine(item, `${path}.voiceLines[${index}]`, characterIds)) };
}

function parseShot(value: unknown, path: string, beatIds: ReadonlySet<string>, sceneIds: ReadonlySet<string>, characterIds: ReadonlySet<string>): StoryboardShotV2 {
  const row = exact(value, ["id", "order", "beatId", "sceneId", "characterIds", "coreAction", "emotion", "shotType", "cameraAngle", "comic", "motion", "promptDraft"], path);
  const characterIdsValue = parseStringArray(row.characterIds, `${path}.characterIds`); characterIdsValue.forEach((id, index) => { if (characterIds.size > 0 && !characterIds.has(id)) invalid(`${path}.characterIds[${index}]`, "unknown character id"); });
  const beatId = nullableString(row.beatId, `${path}.beatId`); if (beatId !== null && beatIds.size > 0 && !beatIds.has(beatId)) invalid(`${path}.beatId`, "unknown beat id");
  const sceneId = nullableString(row.sceneId, `${path}.sceneId`); if (sceneId !== null && sceneIds.size > 0 && !sceneIds.has(sceneId)) invalid(`${path}.sceneId`, "unknown scene id");
  return { id: string(row.id, `${path}.id`), order: integer(row.order, `${path}.order`, 1), beatId, sceneId, characterIds: characterIdsValue, coreAction: string(row.coreAction, `${path}.coreAction`, true), emotion: string(row.emotion, `${path}.emotion`, true), shotType: enumeration(row.shotType, SHOT_TYPES, `${path}.shotType`), cameraAngle: enumeration(row.cameraAngle, CAMERA_ANGLES, `${path}.cameraAngle`), comic: parseComic(row.comic, `${path}.comic`), motion: parseMotion(row.motion, `${path}.motion`, characterIds), promptDraft: string(row.promptDraft, `${path}.promptDraft`, true) };
}

export interface StoryboardReferenceContext {
  beatIds?: ReadonlySet<string>;
  sceneIds?: ReadonlySet<string>;
  characterIds?: ReadonlySet<string>;
}

export function parseStoryboardDocumentV2(input: unknown, context: StoryboardReferenceContext = {}): StoryboardDocumentV2 {
  const row = exact(inputValue(input), ["schemaVersion", "chapterId", "shots", "notes"], "storyboard");
  if (row.schemaVersion !== 2) invalid("storyboard.schemaVersion", "expected 2");
  if (!Array.isArray(row.shots)) invalid("storyboard.shots", "expected array");
  const shotsValue = row.shots as unknown[];
  const beatIds = context.beatIds ?? new Set<string>(); const sceneIds = context.sceneIds ?? new Set<string>(); const characterIds = context.characterIds ?? new Set<string>();
  // A storyboard is self-contained. Referenced IDs are validated for shape and
  // uniqueness here; cross-document IDs are checked by the Storyboard service.
  const shots = shotsValue.map((item, index) => parseShot(item, `storyboard.shots[${index}]`, beatIds, sceneIds, characterIds));
  uniqueIds(shots.map((item) => item.id), "storyboard.shots"); ordered(shots.map((item) => item.order), "storyboard.shots");
  return { schemaVersion: 2, chapterId: string(row.chapterId, "storyboard.chapterId"), shots, notes: string(row.notes, "storyboard.notes", true) };
}

function parsePreflightSourceSnapshot(value: unknown, path: string): PreflightSourceSnapshotV1 {
  const row = exact(value, ["schemaVersion", "policyVersion", "projectId", "chapterId", "consumerType", "storyboard", "style", "characters", "scenes"], path);
  if (row.schemaVersion !== 1) invalid(`${path}.schemaVersion`, "expected 1");
  if (row.policyVersion !== "preflight-source-v1") invalid(`${path}.policyVersion`, "unsupported policy");
  if (row.consumerType !== "preflight_revision") invalid(`${path}.consumerType`, "expected preflight_revision");
  const storyboard = exact(row.storyboard, ["id", "digest"], `${path}.storyboard`);
  const style = exact(row.style, ["comicFormat", "artStyle", "styleDigest"], `${path}.style`);
  if (!Array.isArray(row.characters) || !Array.isArray(row.scenes)) invalid(path, "characters/scenes must be arrays");
  const characters = row.characters.map((item, index) => {
    const child = exact(item, ["characterId", "required", "generationInputDigest", "visualId", "assetId", "assetSha256"], `${path}.characters[${index}]`);
    const value = { characterId: string(child.characterId, `${path}.characters[${index}].characterId`), required: boolean(child.required, `${path}.characters[${index}].required`), generationInputDigest: digest(child.generationInputDigest, `${path}.characters[${index}].generationInputDigest`), visualId: nullableString(child.visualId, `${path}.characters[${index}].visualId`), assetId: nullableString(child.assetId, `${path}.characters[${index}].assetId`), assetSha256: child.assetSha256 === null ? null : digest(child.assetSha256, `${path}.characters[${index}].assetSha256`) };
    atomicAssetTriple(value.visualId, value.assetId, value.assetSha256, `${path}.characters[${index}]`);
    return value;
  });
  const scenes = row.scenes.map((item, index) => {
    const child = exact(item, ["chapterSceneId", "sceneKey", "visualId", "assetId", "assetSha256"], `${path}.scenes[${index}]`);
    const value = { chapterSceneId: string(child.chapterSceneId, `${path}.scenes[${index}].chapterSceneId`), sceneKey: string(child.sceneKey, `${path}.scenes[${index}].sceneKey`), visualId: nullableString(child.visualId, `${path}.scenes[${index}].visualId`), assetId: nullableString(child.assetId, `${path}.scenes[${index}].assetId`), assetSha256: child.assetSha256 === null ? null : digest(child.assetSha256, `${path}.scenes[${index}].assetSha256`) };
    atomicAssetTriple(value.visualId, value.assetId, value.assetSha256, `${path}.scenes[${index}]`);
    return value;
  });
  uniqueIds(characters.map((item) => item.characterId), `${path}.characters`); uniqueIds(scenes.map((item) => item.chapterSceneId), `${path}.scenes`);
  return { schemaVersion: 1, policyVersion: "preflight-source-v1", projectId: string(row.projectId, `${path}.projectId`), chapterId: string(row.chapterId, `${path}.chapterId`), consumerType: "preflight_revision", storyboard: { id: string(storyboard.id, `${path}.storyboard.id`), digest: digest(storyboard.digest, `${path}.storyboard.digest`) }, style: { comicFormat: enumeration(style.comicFormat, ["vertical_scroll", "paged_comic"], `${path}.style.comicFormat`), artStyle: string(style.artStyle, `${path}.style.artStyle`), styleDigest: digest(style.styleDigest, `${path}.style.styleDigest`) }, characters: characters.sort((a, b) => a.characterId.localeCompare(b.characterId)), scenes: scenes.sort((a, b) => a.chapterSceneId.localeCompare(b.chapterSceneId) || a.sceneKey.localeCompare(b.sceneKey)) };
}

function parseCharacterCheck(value: unknown, path: string): PreflightCharacterCheckV2 {
  const row = exact(value, ["characterId", "name", "level", "appearanceCount", "requiredReference", "referenceReady", "referenceAssetId", "status", "note"], path);
  return { characterId: string(row.characterId, `${path}.characterId`), name: string(row.name, `${path}.name`), level: enumeration(row.level, LEVELS, `${path}.level`), appearanceCount: integer(row.appearanceCount, `${path}.appearanceCount`), requiredReference: boolean(row.requiredReference, `${path}.requiredReference`), referenceReady: boolean(row.referenceReady, `${path}.referenceReady`), referenceAssetId: nullableString(row.referenceAssetId, `${path}.referenceAssetId`), status: enumeration(row.status, CHECK_STATUSES, `${path}.status`), note: string(row.note, `${path}.note`, true) };
}

function parseSceneCheck(value: unknown, path: string): PreflightSceneCheckV2 {
  const row = exact(value, ["sceneId", "name", "shotCount", "referenceAssetId", "referenceReady", "status", "note"], path);
  return { sceneId: string(row.sceneId, `${path}.sceneId`), name: string(row.name, `${path}.name`), shotCount: integer(row.shotCount, `${path}.shotCount`), referenceAssetId: nullableString(row.referenceAssetId, `${path}.referenceAssetId`), referenceReady: boolean(row.referenceReady, `${path}.referenceReady`), status: enumeration(row.status, CHECK_STATUSES, `${path}.status`), note: string(row.note, `${path}.note`, true) };
}

function parseStyleCheck(value: unknown, path: string): PreflightStyleCheckV2 {
  const row = exact(value, ["comicFormat", "comicFormatLabel", "artStyle", "artStyleLabel", "status", "note"], path);
  return { comicFormat: enumeration(row.comicFormat, ["vertical_scroll", "paged_comic"], `${path}.comicFormat`), comicFormatLabel: string(row.comicFormatLabel, `${path}.comicFormatLabel`), artStyle: string(row.artStyle, `${path}.artStyle`), artStyleLabel: string(row.artStyleLabel, `${path}.artStyleLabel`), status: enumeration(row.status, CHECK_STATUSES, `${path}.status`), note: string(row.note, `${path}.note`, true) };
}

function parseIssue(value: unknown, path: string): PreflightDocumentV2["issues"][number] {
  const row = exact(value, ["type", "status", "message", "relatedName", "relatedCharacterId", "relatedSceneId", "relatedShotId"], path);
  return { type: enumeration(row.type, ISSUE_TYPES, `${path}.type`), status: enumeration(row.status, ["warning", "blocked"], `${path}.status`), message: string(row.message, `${path}.message`), relatedName: nullableString(row.relatedName, `${path}.relatedName`), relatedCharacterId: nullableString(row.relatedCharacterId, `${path}.relatedCharacterId`), relatedSceneId: nullableString(row.relatedSceneId, `${path}.relatedSceneId`), relatedShotId: nullableString(row.relatedShotId, `${path}.relatedShotId`) };
}

export function parsePreflightDocumentV2(input: unknown): PreflightDocumentV2 {
  const row = exact(inputValue(input), ["schemaVersion", "chapterId", "sourceSnapshot", "shotCount", "characterChecks", "sceneChecks", "styleCheck", "issues", "ready", "notes", "policyVersion"], "preflight");
  if (row.schemaVersion !== 2) invalid("preflight.schemaVersion", "expected 2");
  if (row.policyVersion !== "preflight-source-v1") invalid("preflight.policyVersion", "unsupported policy");
  if (!Array.isArray(row.characterChecks) || !Array.isArray(row.sceneChecks) || !Array.isArray(row.issues)) invalid("preflight", "checks/issues must be arrays");
  const characterChecks = row.characterChecks.map((item, index) => parseCharacterCheck(item, `preflight.characterChecks[${index}]`));
  const sceneChecks = row.sceneChecks.map((item, index) => parseSceneCheck(item, `preflight.sceneChecks[${index}]`));
  uniqueIds(characterChecks.map((item) => item.characterId), "preflight.characterChecks"); uniqueIds(sceneChecks.map((item) => item.sceneId), "preflight.sceneChecks");
  const chapterId = string(row.chapterId, "preflight.chapterId");
  const sourceSnapshot = parsePreflightSourceSnapshot(row.sourceSnapshot, "preflight.sourceSnapshot");
  if (sourceSnapshot.chapterId !== chapterId) invalid("preflight.sourceSnapshot.chapterId", "must match preflight.chapterId");
  const issues = row.issues.map((item, index) => parseIssue(item, `preflight.issues[${index}]`));
  const ready = boolean(row.ready, "preflight.ready");
  if (ready && issues.some((issue) => issue.status === "blocked")) invalid("preflight.ready", "cannot be true while a blocked issue exists");
  if (ready && sourceSnapshot.characters.some((character) => character.required && character.visualId === null)) invalid("preflight.sourceSnapshot.characters", "required character must have a visual/asset when ready");
  return { schemaVersion: 2, chapterId, sourceSnapshot, shotCount: integer(row.shotCount, "preflight.shotCount"), characterChecks, sceneChecks, styleCheck: parseStyleCheck(row.styleCheck, "preflight.styleCheck"), issues, ready, notes: string(row.notes, "preflight.notes", true), policyVersion: "preflight-source-v1" };
}

function encode<T>(value: T, schemaVersion: number): EncodedDocument<T> {
  const canonical = canonicalizeJson(value);
  return { schemaVersion, canonical, canonicalBytes: new TextEncoder().encode(canonical), digest: sha256Bytes(new TextEncoder().encode(canonical)), value };
}

export function encodeStoryDocumentV2(input: unknown): EncodedDocument<StoryDocumentV2> { const value = parseStoryDocumentV2(input); return encode(value, 2); }
export function encodeStoryboardDocumentV2(input: unknown): EncodedDocument<StoryboardDocumentV2> { const value = parseStoryboardDocumentV2(input); return encode(value, 2); }
export function encodePreflightDocumentV2(input: unknown): EncodedDocument<PreflightDocumentV2> { const value = parsePreflightDocumentV2(input); return encode(value, 2); }

export const StoryDocumentCodecV2 = { schemaVersion: 2 as const, parse: parseStoryDocumentV2, encode: encodeStoryDocumentV2 };
export const StoryboardDocumentCodecV2 = { schemaVersion: 2 as const, parse: parseStoryboardDocumentV2, encode: encodeStoryboardDocumentV2 };
export const PreflightDocumentCodecV2 = { schemaVersion: 2 as const, parse: parsePreflightDocumentV2, encode: encodePreflightDocumentV2 };
export const StoryDocumentCodec = StoryDocumentCodecV2;
export const StoryboardDocumentCodec = StoryboardDocumentCodecV2;
export const PreflightDocumentCodec = PreflightDocumentCodecV2;

export interface EncodedScriptText {
  schemaVersion: 1;
  canonical: string;
  canonicalBytes: Uint8Array;
  digest: Digest;
}

export function normalizeScriptText(input: string | Uint8Array, options: { allowEmpty?: boolean } = {}): string {
  let text: string;
  if (typeof input === "string") text = input;
  else {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(input); } catch { throw new DocumentValidationError("script: invalid UTF-8 bytes"); }
  }
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  text = stripChapterScriptName(text).trim();
  if (!options.allowEmpty && text === "") throw new DocumentValidationError("script: normalized text must be non-empty");
  return text;
}

export function encodeScriptTextV1(input: string | Uint8Array, options: { allowEmpty?: boolean } = {}): EncodedScriptText {
  const canonical = normalizeScriptText(input, options);
  const canonicalBytes = new TextEncoder().encode(canonical);
  return { schemaVersion: 1, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export const ScriptTextCodecV1 = { schemaVersion: 1 as const, normalize: normalizeScriptText, encode: encodeScriptTextV1 };
export const ScriptTextCodec = ScriptTextCodecV1;

// Kept public for callers that need to verify a stored digest without knowing
// which V2 document type produced it.
export { canonicalJsonBytes, digestCanonicalJson };
