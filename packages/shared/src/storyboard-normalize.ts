/**
 * 分镜字段枚举兜底工具(见 ADR-0007)。
 *
 * 用途:两份 normalize(apps/server projects.service.ts / dialogue.service.ts)共用,
 * 确保枚举定义和兜底默认值只在一处,避免 schema 漂移。
 *
 * 设计:输入任意值,校验是否在合法枚举内;不在或缺失时返回兜底默认值。
 */

import type {
  CameraAngle,
  CameraMovement,
  FrameType,
  PanelRhythm,
  ShotType,
  StoryboardShotVoiceLine,
} from "./dto.js";

const SHOT_TYPES: readonly ShotType[] = [
  "establishing",
  "wide",
  "full",
  "medium",
  "close_up",
  "extreme_close_up",
];

const CAMERA_ANGLES: readonly CameraAngle[] = [
  "eye_level",
  "high_angle",
  "low_angle",
  "over_shoulder",
  "top_down",
  "dutch_angle",
];

const PANEL_RHYTHMS: readonly PanelRhythm[] = ["slow", "normal", "fast", "impact", "transition"];

const CAMERA_MOVEMENTS: readonly CameraMovement[] = [
  "static",
  "push_in",
  "pull_out",
  "pan_left",
  "pan_right",
  "tilt_up",
  "tilt_down",
  "track_left",
  "track_right",
  "slow_zoom",
  "handheld",
  "none",
];

const FRAME_TYPES: readonly FrameType[] = [
  "atmosphere",
  "dialogue",
  "action",
  "reaction",
  "detail",
  "transition",
];

function isShotType(value: unknown): value is ShotType {
  return typeof value === "string" && (SHOT_TYPES as readonly string[]).includes(value);
}

function isCameraAngle(value: unknown): value is CameraAngle {
  return typeof value === "string" && (CAMERA_ANGLES as readonly string[]).includes(value);
}

function isPanelRhythm(value: unknown): value is PanelRhythm {
  return typeof value === "string" && (PANEL_RHYTHMS as readonly string[]).includes(value);
}

function isCameraMovement(value: unknown): value is CameraMovement {
  return typeof value === "string" && (CAMERA_MOVEMENTS as readonly string[]).includes(value);
}

function isFrameType(value: unknown): value is FrameType {
  return typeof value === "string" && (FRAME_TYPES as readonly string[]).includes(value);
}

/** 景别兜底:非法值/缺失 → medium。 */
export function normalizeShotType(value: unknown): ShotType {
  return isShotType(value) ? value : "medium";
}

/** 机位角度兜底:非法值/缺失 → eye_level。 */
export function normalizeCameraAngle(value: unknown): CameraAngle {
  return isCameraAngle(value) ? value : "eye_level";
}

/** 画格节奏兜底:非法值/缺失 → normal。 */
export function normalizePanelRhythm(value: unknown): PanelRhythm {
  return isPanelRhythm(value) ? value : "normal";
}

/** 运镜兜底:非法值/缺失 → static。 */
export function normalizeCameraMovement(value: unknown): CameraMovement {
  return isCameraMovement(value) ? value : "static";
}

/** 镜头类型兜底:非法值/缺失 → atmosphere。 */
export function normalizeFrameType(value: unknown): FrameType {
  return isFrameType(value) ? value : "atmosphere";
}

/** 默认时长(毫秒)。 */
export const DEFAULT_SHOT_DURATION_MS = 2500;

/**
 * 从时长展示文本解析毫秒。支持 "2.5s"/"约3-4s"/"3000ms" 等形式,
 * 取识别到的第一个数字作为秒数(范围文本取下限)。解析失败返回默认值。
 */
export function parseDurationHintToMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_SHOT_DURATION_MS;
  }
  const trimmed = value.trim();
  const msMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*ms/i);
  if (msMatch) {
    return Math.round(Number(msMatch[1]));
  }
  const sMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (sMatch) {
    return Math.round(Number(sMatch[1]) * 1000);
  }
  const numMatch = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return Math.round(Number(numMatch[1]) * 1000);
  }
  return DEFAULT_SHOT_DURATION_MS;
}

/**
 * 规整配音台词数组(替换旧 voiceRole + line)。
 * 优先读 voiceLines;缺失时从旧 voiceRole/line 派生(向后兼容)。
 */
export function normalizeVoiceLines(
  record: Record<string, unknown>,
): StoryboardShotVoiceLine[] {
  const rawLines = record.voiceLines;
  if (Array.isArray(rawLines)) {
    return rawLines
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        characterId:
          typeof item.characterId === "string" && item.characterId.length > 0
            ? item.characterId
            : null,
        name: typeof item.name === "string" ? item.name : "",
        line: typeof item.line === "string" ? item.line : "",
        voiceStyle: typeof item.voiceStyle === "string" ? item.voiceStyle : "",
      }));
  }
  const legacyVoiceRole = typeof record.voiceRole === "string" ? record.voiceRole.trim() : "";
  const legacyLine = typeof record.line === "string" ? record.line.trim() : "";
  if (legacyVoiceRole || legacyLine) {
    return [
      {
        characterId: null,
        name: legacyVoiceRole,
        line: legacyLine,
        voiceStyle: "",
      },
    ];
  }
  return [];
}
