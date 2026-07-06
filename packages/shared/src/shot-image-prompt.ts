/**
 * 分镜候选图 prompt 拼装纯函数（见 文档/04_方案与决策/2026-07-06_候选图工作台MVP方案.md 第 5.3 节）。
 *
 * finalPrompt = [系统级模板] + [画风段] + [用户级段]
 * - 系统级模板：全局设置 imagePromptTemplate，本文件只提供默认值。
 * - 画风段：来自 preflight styleCheck 的 comicFormatLabel/artStyleLabel。
 * - 用户级段：userPromptOverride 为 null 时由分镜字段实时自动拼装；手改后用用户版本。
 *
 * 本文件必须保持纯函数（无 IO、无时钟），保证可测可复现。
 */

import type { CameraAngle, ShotType, StoryboardShot } from "./dto.js";
import type { ShotPromptSnapshot } from "./image-candidates.js";

/** 系统级默认模板。用户在设置页可整段替换，打磨措辞不需改代码。 */
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = [
  "Comic/manhua panel illustration for a professional comic production pipeline.",
  "Drawn illustration style only: stylized comic linework, controlled cel shading or painterly comic shading, clean readable silhouette.",
  "Not photorealism: no real-photo look, no live-action still, no 3D render, no watermark, no text overlay, no speech bubbles.",
  "Single panel, coherent composition, production-ready quality.",
].join("\n");

const SHOT_TYPE_PHRASES: Record<ShotType, string> = {
  establishing: "establishing shot",
  wide: "wide shot",
  full: "full shot",
  medium: "medium shot",
  close_up: "close-up",
  extreme_close_up: "extreme close-up",
};

const CAMERA_ANGLE_PHRASES: Record<CameraAngle, string> = {
  eye_level: "eye-level angle",
  high_angle: "high angle",
  low_angle: "low angle",
  over_shoulder: "over-the-shoulder view",
  top_down: "top-down view",
  dutch_angle: "dutch angle",
};

export interface ShotPromptCharacterInput {
  name: string;
  appearance: string;
  promptFragment: string;
}

export interface ShotPromptSceneInput {
  name: string;
  location: string;
  timeOfDay: string;
  atmosphere: string;
}

export interface ShotPromptStyleInput {
  comicFormatLabel: string;
  artStyleLabel: string;
}

function joinNonEmpty(parts: ReadonlyArray<string>, separator: string): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(separator);
}

/** 画风段：章节级固定，来自已确认 preflight 的 styleCheck。 */
export function buildShotStylePart(style: ShotPromptStyleInput): string {
  return joinNonEmpty([
    style.artStyleLabel ? `Art style: ${style.artStyleLabel}.` : "",
    style.comicFormatLabel ? `Format: ${style.comicFormatLabel}.` : "",
  ], "\n");
}

/**
 * 用户级段自动拼装：这一格画什么。
 * 取材：动作/情绪/景别/机位/画格描述/构图/出场角色片段/场景。
 * 不包含 dialogue/caption：气泡文字不进生图 prompt（排版阶段另处理）。
 */
export function buildShotUserPrompt(
  shot: Pick<StoryboardShot, "coreAction" | "emotion" | "shotType" | "cameraAngle" | "comic">,
  characters: ReadonlyArray<ShotPromptCharacterInput>,
  scene: ShotPromptSceneInput | null,
): string {
  const characterLines = characters.map((character) => {
    const traits = joinNonEmpty([character.appearance, character.promptFragment], ", ");
    return traits ? `${character.name}: ${traits}` : character.name;
  });
  const sceneLine = scene
    ? joinNonEmpty([scene.name, scene.location, scene.timeOfDay, scene.atmosphere], ", ")
    : "";
  return joinNonEmpty([
    shot.comic.panelDescription,
    shot.coreAction ? `Action: ${shot.coreAction}` : "",
    shot.emotion ? `Mood: ${shot.emotion}` : "",
    `Camera: ${SHOT_TYPE_PHRASES[shot.shotType]}, ${CAMERA_ANGLE_PHRASES[shot.cameraAngle]}`,
    shot.comic.composition ? `Composition: ${shot.comic.composition}` : "",
    characterLines.length > 0 ? `Characters:\n${characterLines.join("\n")}` : "",
    sceneLine ? `Scene: ${sceneLine}` : "",
  ], "\n");
}

export interface BuildShotImagePromptInput {
  /** 系统级模板；空白时用 DEFAULT_IMAGE_PROMPT_TEMPLATE。 */
  systemTemplate: string | null | undefined;
  style: ShotPromptStyleInput;
  shot: Pick<StoryboardShot, "coreAction" | "emotion" | "shotType" | "cameraAngle" | "comic">;
  characters: ReadonlyArray<ShotPromptCharacterInput>;
  scene: ShotPromptSceneInput | null;
  /** 用户手改的用户级段；null 表示自动拼装。 */
  userPromptOverride: string | null;
}

export function buildShotImagePrompt(input: BuildShotImagePromptInput): ShotPromptSnapshot {
  const systemPart = input.systemTemplate?.trim() ? input.systemTemplate.trim() : DEFAULT_IMAGE_PROMPT_TEMPLATE;
  const stylePart = buildShotStylePart(input.style);
  const userPart = input.userPromptOverride !== null && input.userPromptOverride.trim()
    ? input.userPromptOverride.trim()
    : buildShotUserPrompt(input.shot, input.characters, input.scene);
  return {
    systemPart,
    stylePart,
    userPart,
    finalPrompt: joinNonEmpty([systemPart, stylePart, userPart], "\n\n"),
  };
}
