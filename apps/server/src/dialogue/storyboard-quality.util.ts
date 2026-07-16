import type { StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import type { StoryboardDialogueReference } from "./storyboard-dialogue-reference.util.js";

export class StoryboardOutputContractError extends Error {
  readonly code = "STORYBOARD_OUTPUT_CONTRACT_FAILED";

  constructor(readonly issues: readonly string[]) {
    super(`分镜输出契约未通过：${issues.join("、")}`);
    this.name = "StoryboardOutputContractError";
  }
}

export class StoryboardQualityError extends Error {
  readonly code = "STORYBOARD_QUALITY_FAILED";

  constructor(readonly issues: readonly string[]) {
    super(`分镜固定质量门未通过：${issues.join("、")}`);
    this.name = "StoryboardQualityError";
  }
}

const PLACEHOLDER_VALUES = new Set([
  "待补充",
  "待定",
  "未知",
  "无内容",
  "未写",
  "省略",
  "略",
  "todo",
  "tbd",
  "镜头核心动作",
  "漫画画格画面描述",
  "构图人物位置视觉重心不含景别机位",
  "动态画面描述",
  "漫剧动态画面描述",
  "动态构图设计",
  "给后续图片提示词生成的简短草稿不是最终prompt",
  "情绪",
  "构图",
]);

const PROMPT_DRAFT_FORBIDDEN = /(?:字幕|气泡|对白\s*[:：]|旁白\s*[:：]|整页|分格|多格|16\s*[:：x×]\s*9|midjourney|stable\s*diffusion|openai|gpt|doubao|grok|negative\s*prompt|--ar\b)/iu;
const SHOT_TYPES = new Set(["establishing", "wide", "full", "medium", "close_up", "extreme_close_up"]);
const CAMERA_ANGLES = new Set(["eye_level", "high_angle", "low_angle", "over_shoulder", "top_down", "dutch_angle"]);
const PANEL_RHYTHMS = new Set(["slow", "normal", "fast", "impact", "transition"]);
const CAMERA_MOVEMENTS = new Set(["static", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "track_left", "track_right", "slow_zoom", "handheld", "none"]);
const FRAME_TYPES = new Set(["atmosphere", "dialogue", "action", "reaction", "detail", "transition"]);

function enumMember(values: ReadonlySet<string>): (value: unknown) => boolean {
  return (value) => typeof value === "string" && values.has(value);
}

function semanticKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function record(value: unknown, path: string, issues: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push(`STORYBOARD_FIELD_OBJECT_REQUIRED:${path}`);
    return {};
  }
  return value as Record<string, unknown>;
}

function stringField(
  row: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  allowEmpty = false,
): string {
  const value = row[key];
  if (typeof value !== "string") {
    issues.push(`STORYBOARD_FIELD_STRING_REQUIRED:${path}.${key}`);
    return "";
  }
  if (!allowEmpty && !value.trim()) issues.push(`STORYBOARD_FIELD_EMPTY:${path}.${key}`);
  return value;
}

function stringArrayField(row: Record<string, unknown>, key: string, path: string, issues: string[]): void {
  const value = row[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    issues.push(`STORYBOARD_FIELD_STRING_ARRAY_REQUIRED:${path}.${key}`);
  }
}

function enumField(
  row: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  validate: (value: unknown) => boolean,
): void {
  if (!validate(row[key])) issues.push(`STORYBOARD_ENUM_INVALID:${path}.${key}`);
}

function uniqueIssues(issues: readonly string[]): string[] {
  return [...new Set(issues)];
}

/**
 * 新 AI 输出的严格契约。历史文件仍通过兼容 normalize 读取，不调用本函数。
 */
export function assertStoryboardGenerationOutputContract(input: unknown): void {
  const issues: string[] = [];
  const root = record(input, "storyboard", issues);
  if (typeof root.notes !== "string") issues.push("STORYBOARD_FIELD_STRING_REQUIRED:storyboard.notes");
  if (!Array.isArray(root.shots) || root.shots.length === 0) {
    issues.push("STORYBOARD_SHOTS_EMPTY");
  } else {
    root.shots.forEach((value, index) => {
      const path = `shots[${index}]`;
      const shot = record(value, path, issues);
      if ("id" in shot && (typeof shot.id !== "string" || !shot.id.trim())) {
        issues.push(`STORYBOARD_SHOT_ID_INVALID:${path}`);
      }
      if (!Number.isInteger(shot.order) || Number(shot.order) !== index + 1) {
        issues.push(`STORYBOARD_ORDER_NOT_CONTIGUOUS:${path}`);
      }
      stringField(shot, "beatId", path, issues);
      stringField(shot, "sceneId", path, issues);
      stringArrayField(shot, "characterIds", path, issues);
      stringField(shot, "coreAction", path, issues);
      stringField(shot, "emotion", path, issues);
      enumField(shot, "shotType", path, issues, enumMember(SHOT_TYPES));
      enumField(shot, "cameraAngle", path, issues, enumMember(CAMERA_ANGLES));

      const comic = record(shot.comic, `${path}.comic`, issues);
      stringField(comic, "panelDescription", `${path}.comic`, issues);
      stringField(comic, "composition", `${path}.comic`, issues);
      stringField(comic, "dialogue", `${path}.comic`, issues, true);
      stringField(comic, "caption", `${path}.comic`, issues, true);
      enumField(comic, "panelRhythm", `${path}.comic`, issues, enumMember(PANEL_RHYTHMS));

      const motion = record(shot.motion, `${path}.motion`, issues);
      stringField(motion, "visualDescription", `${path}.motion`, issues);
      stringField(motion, "compositionDesign", `${path}.motion`, issues);
      enumField(motion, "cameraMovement", `${path}.motion`, issues, enumMember(CAMERA_MOVEMENTS));
      enumField(motion, "frameType", `${path}.motion`, issues, enumMember(FRAME_TYPES));
      if (!Number.isInteger(motion.durationMs) || Number(motion.durationMs) <= 0) {
        issues.push(`STORYBOARD_DURATION_INVALID:${path}.motion.durationMs`);
      }
      stringField(motion, "durationHint", `${path}.motion`, issues);
      if (!Array.isArray(motion.voiceLines)) {
        issues.push(`STORYBOARD_VOICE_LINES_ARRAY_REQUIRED:${path}`);
      } else {
        motion.voiceLines.forEach((lineValue, lineIndex) => {
          const linePath = `${path}.motion.voiceLines[${lineIndex}]`;
          const line = record(lineValue, linePath, issues);
          if (line.characterId !== null && (typeof line.characterId !== "string" || !line.characterId.trim())) {
            issues.push(`STORYBOARD_VOICE_CHARACTER_INVALID:${linePath}`);
          }
          stringField(line, "name", linePath, issues, line.characterId === null);
          stringField(line, "line", linePath, issues);
          stringField(line, "voiceStyle", linePath, issues, true);
        });
      }
      stringField(shot, "promptDraft", path, issues);
    });
  }

  const result = uniqueIssues(issues);
  if (result.length > 0) throw new StoryboardOutputContractError(result);
}

function assertMeaningfulText(issues: string[], value: string, code: string): void {
  const key = semanticKey(value);
  if (!key) {
    issues.push(`${code}:EMPTY`);
  } else if (PLACEHOLDER_VALUES.has(key)) {
    issues.push(`${code}:PLACEHOLDER`);
  }
}

/**
 * 待确认分镜写入前的高确定性质量门。
 * 不评价审美、商业节奏或主观镜头优劣。
 */
export function assertStoryboardQuality(
  storyboard: StoryboardJson,
  structure: StoryStructureJson,
  dialogueReference?: StoryboardDialogueReference,
): void {
  const issues: string[] = [];
  const beatOrder = new Map(structure.beats.map((beat) => [beat.id, beat.order]));
  const beatScene = new Map(structure.beats.map((beat) => [beat.id, beat.sceneId]));
  const coveredBeats = new Set<string>();
  const shotIds = new Set<string>();
  const shotSignatures = new Set<string>();
  const promptDraftKeys: string[] = [];
  const allowedVoiceLines = dialogueReference?.available
    ? new Set(dialogueReference.candidates.map((candidate) => candidate.line))
    : null;
  let previousBeatOrder = 0;

  storyboard.shots.forEach((shot, index) => {
    const path = `shots[${index}]`;
    if (shotIds.has(shot.id)) issues.push(`STORYBOARD_SHOT_ID_DUPLICATE:${shot.id}`);
    shotIds.add(shot.id);
    assertMeaningfulText(issues, shot.coreAction, `STORYBOARD_CORE_ACTION:${path}`);
    assertMeaningfulText(issues, shot.emotion, `STORYBOARD_EMOTION:${path}`);
    assertMeaningfulText(issues, shot.comic.panelDescription, `STORYBOARD_PANEL_DESCRIPTION:${path}`);
    assertMeaningfulText(issues, shot.comic.composition, `STORYBOARD_COMPOSITION:${path}`);
    assertMeaningfulText(issues, shot.motion.visualDescription, `STORYBOARD_MOTION_VISUAL:${path}`);
    assertMeaningfulText(issues, shot.motion.compositionDesign, `STORYBOARD_MOTION_COMPOSITION:${path}`);
    assertMeaningfulText(issues, shot.promptDraft, `STORYBOARD_PROMPT_DRAFT:${path}`);

    if (shot.beatId) {
      coveredBeats.add(shot.beatId);
      const order = beatOrder.get(shot.beatId);
      if (order !== undefined) {
        if (order < previousBeatOrder) issues.push(`STORYBOARD_BEAT_ORDER_REGRESSION:${path}:${shot.beatId}`);
        previousBeatOrder = Math.max(previousBeatOrder, order);
      }
      const expectedSceneId = beatScene.get(shot.beatId);
      if (expectedSceneId && shot.sceneId !== expectedSceneId) {
        issues.push(`STORYBOARD_BEAT_SCENE_MISMATCH:${path}:${shot.beatId}`);
      }
    }

    const signature = [shot.beatId, shot.sceneId, shot.coreAction, shot.comic.panelDescription, shot.comic.composition]
      .map((item) => semanticKey(item ?? ""))
      .join("|");
    if (shotSignatures.has(signature)) issues.push(`STORYBOARD_SHOT_DUPLICATE:${path}`);
    shotSignatures.add(signature);

    const dialogueKey = semanticKey(shot.comic.dialogue);
    const voiceLineKeys = shot.motion.voiceLines.map((line) => semanticKey(line.line)).filter(Boolean);
    if (allowedVoiceLines) {
      shot.motion.voiceLines.forEach((line, lineIndex) => {
        if (!allowedVoiceLines.has(line.line.trim())) {
          issues.push(`STORYBOARD_VOICE_LINE_NOT_IN_FORMAL_SCRIPT:${path}.motion.voiceLines[${lineIndex}]`);
        }
      });
    }
    if (shot.motion.frameType === "dialogue" && !dialogueKey && voiceLineKeys.length === 0) {
      issues.push(`STORYBOARD_DIALOGUE_FRAME_EMPTY:${path}`);
    }
    if (dialogueKey && !voiceLineKeys.some((line) => dialogueKey.includes(line) || line.includes(dialogueKey))) {
      issues.push(`STORYBOARD_DIALOGUE_MOTION_MISMATCH:${path}`);
    }

    const promptDraftKey = semanticKey(shot.promptDraft);
    promptDraftKeys.push(promptDraftKey);
    if (PROMPT_DRAFT_FORBIDDEN.test(shot.promptDraft)) issues.push(`STORYBOARD_PROMPT_DRAFT_FORBIDDEN:${path}`);
    if (voiceLineKeys.some((line) => line.length >= 4 && promptDraftKey.includes(line))) {
      issues.push(`STORYBOARD_PROMPT_DRAFT_DIALOGUE_LEAK:${path}`);
    }
  });

  for (const beat of structure.beats) {
    if (!coveredBeats.has(beat.id)) issues.push(`STORYBOARD_BEAT_MISSING:${beat.id}`);
  }
  if (promptDraftKeys.length > 1 && new Set(promptDraftKeys).size === 1) {
    issues.push("STORYBOARD_PROMPT_DRAFT_REPEATED");
  }

  const result = uniqueIssues(issues);
  if (result.length > 0) throw new StoryboardQualityError(result);
}
