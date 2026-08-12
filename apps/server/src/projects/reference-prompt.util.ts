import type {
  ArtStyle,
  ComicFormat,
  ProjectCharacter,
  ProjectCharacterReferenceKind,
  ProjectType,
  WorkbenchAsset,
} from "@airoaming/shared";
import {
  readOpenCodeSkillJsonReference,
  readOpenCodeSkillReference,
  renderOpenCodePromptTemplate,
} from "../ai-runtime/opencode-skill-asset.util.js";
import type { LocalProject } from "./local-types.js";
import * as wsCharacter from "./character-domain.util.js";

/**
 * 角色/场景参考图动态数据装配 + asset meta 解析。
 * 稳定 Prompt 正文以 opencodeAI/skills/image-reference-generate 为唯一事实源。
 * V1 只为真实同语料 A/B 保留；生产默认使用 V2。
 */

const IMAGE_REFERENCE_SKILL = "image-reference-generate";

interface ReferencePromptDefaults {
  sceneStyle: string;
  appearance: string;
  personality: string;
  artStyles: Record<ArtStyle, string>;
  comicFormats: Record<ComicFormat, string>;
}

const REFERENCE_PROMPT_DEFAULTS = readOpenCodeSkillJsonReference<ReferencePromptDefaults>(
  IMAGE_REFERENCE_SKILL,
  "reference-defaults.json",
);

export type ImagePromptVersion = "v1" | "v2";

function getReferenceArtStyle(style: ArtStyle): string {
  const value = REFERENCE_PROMPT_DEFAULTS.artStyles[style]?.trim();
  if (!value) throw new TypeError(`IMAGE_REFERENCE_ART_STYLE_MISSING:${style}`);
  return value;
}

function getReferenceComicFormat(format: ComicFormat): string {
  const value = REFERENCE_PROMPT_DEFAULTS.comicFormats[format]?.trim();
  if (!value) throw new TypeError(`IMAGE_REFERENCE_COMIC_FORMAT_MISSING:${format}`);
  return value;
}

export function getProjectTypeLabel(type: ProjectType): string {
  const labels: Record<ProjectType, string> = {
    comic: "漫画",
    light_motion: "漫剧",
    mixed: "漫画 + 漫剧",
  };
  return labels[type] ?? "漫画";
}

export function buildScenePrompt(
  scene: { name: string; location: string; timeOfDay: string; atmosphere: string; purpose: string },
  project?: Pick<LocalProject, "artStyle" | "comicFormat">,
  version: ImagePromptVersion = "v2",
): string {
  const style = project
    ? `${getReferenceArtStyle(project.artStyle)}；${getReferenceComicFormat(project.comicFormat)}`
    : REFERENCE_PROMPT_DEFAULTS.sceneStyle;
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(IMAGE_REFERENCE_SKILL, version === "v1" ? "scene-v1.md" : "scene-v2.md"),
    {
      SCENE_NAME: scene.name.trim(),
      LOCATION: scene.location.trim(),
      PURPOSE: scene.purpose.trim(),
      TIME_OF_DAY: scene.timeOfDay.trim(),
      ATMOSPHERE: scene.atmosphere.trim(),
      STYLE: style,
    },
  );
}

export function buildCharacterReferenceStyleGuide(project: Pick<LocalProject, "artStyle" | "comicFormat">): string {
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(IMAGE_REFERENCE_SKILL, "style-guide.md"),
    {
      ART_STYLE: getReferenceArtStyle(project.artStyle),
      COMIC_FORMAT_HINT: getReferenceComicFormat(project.comicFormat),
    },
  );
}

export function buildCharacterReferencePrompt(
  project: LocalProject,
  character: ProjectCharacter,
  referenceKind: ProjectCharacterReferenceKind,
  version: ImagePromptVersion = "v2",
  hasReferenceImage = false,
): string {
  if (referenceKind === "none" || character.entityType === "voice") {
    throw new TypeError("CHARACTER_REFERENCE_NOT_REQUIRED");
  }
  if (referenceKind === "final_reference" && character.entityType !== "human") {
    throw new TypeError("CHARACTER_FINAL_REFERENCE_HUMAN_ONLY");
  }
  const templateName = referenceKind === "final_reference"
    ? `character-final-${version}.md`
    : version === "v2" && character.entityType === "creature"
      ? "creature-preview-v2.md"
      : version === "v2" && character.entityType === "group"
        ? "group-preview-v2.md"
        : `character-preview-${version}.md`;
  const styleGuide = buildCharacterReferenceStyleGuide(project);
  const genreTags = project.genreTags.join("、");
  const promptFragment = character.promptFragment?.trim() ?? "";
  // 有参考图时以参考图为身份锚点，appearance 降级为补充细节；无参考图时仍以文字外貌设定为主。
  const hasAppearance = Boolean(character.appearance?.trim());
  const appearanceValue = hasReferenceImage
    ? "参考所提供的角色图片，保持面部特征、发型和整体气质一致"
    : character.appearance || REFERENCE_PROMPT_DEFAULTS.appearance;
  const additionalNotes = hasReferenceImage && hasAppearance ? `补充细节：${character.appearance}` : "";
  const storyTitle = project.storyTitle.trim();
  const promptStoryTitle = storyTitle && storyTitle !== project.name.trim()
    ? storyTitle
    : "（未确认）";
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(IMAGE_REFERENCE_SKILL, templateName),
    {
      PROJECT_TYPE: getProjectTypeLabel(project.type),
      STORY_TITLE: promptStoryTitle,
      GENRE_TAGS_LINE: genreTags ? `- 题材标签：${genreTags}` : "",
      GENRE_TAGS_TEXT: genreTags ? `题材标签：${genreTags}` : "",
      COMIC_FORMAT_HINT: getReferenceComicFormat(project.comicFormat),
      ART_STYLE: getReferenceArtStyle(project.artStyle),
      STYLE_GUIDE: styleGuide,
      STYLE_GUIDE_BULLETS: styleGuide.split("\n").map((line) => `- ${line}`).join("\n"),
      CHARACTER_NAME: character.name,
      CHARACTER_ROLE: character.role || character.level,
      APPEARANCE: appearanceValue,
      ADDITIONAL_NOTES: additionalNotes,
      PERSONALITY: character.personality || REFERENCE_PROMPT_DEFAULTS.personality,
      PROMPT_FRAGMENT_LINE: promptFragment ? `- 固定视觉特征：${promptFragment}` : "",
      PROMPT_FRAGMENT_TEXT: promptFragment ? `提示词片段：${promptFragment}` : "",
    },
  );
}

export function getAssetCreatedAt(asset: WorkbenchAsset): string {
  try {
    const value = JSON.parse(asset.meta) as { createdAt?: unknown };
    return typeof value.createdAt === "string" ? value.createdAt : "1970-01-01T00:00:00.000Z";
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

export function getAssetReferenceKind(asset: WorkbenchAsset): ProjectCharacterReferenceKind | null {
  try {
    const value = JSON.parse(asset.meta) as { referenceKind?: unknown };
    return typeof value.referenceKind === "string" ? wsCharacter.normalizeCharacterReferenceKind(value.referenceKind) : null;
  } catch {
    return null;
  }
}
