import type {
  ProjectCharacter,
  ProjectCharacterReferenceKind,
  ProjectType,
  WorkbenchAsset,
} from "@airoaming/shared";
import { getComicFormatDefinition } from "@airoaming/shared";
import type { LocalProject } from "./local-types.js";
import * as wsDomain from "./project-domain.util.js";
import * as wsCharacter from "./character-domain.util.js";

/**
 * 角色/场景参考图 prompt 构造 + asset meta 解析(从 projects.service 抽出,见任务 2026-06-21_ProjectsService拆分 候选C)。
 * 参考图生成的状态编排(queue/run/confirm/delete)留 Service(依赖 tasksService/settingsService/repository)。
 */

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
): string {
  const style = project
    ? `${wsDomain.getArtStyleLabel(project.artStyle)}；${getComicFormatDefinition(project.comicFormat).referencePromptHint}`
    : "production-ready comic/manhua background illustration";
  return [
    "Create one reusable environment reference image for a comic/manhua production pipeline.",
    "This is a clean background asset, not a story panel and not a standalone concept-art poster.",
    "",
    "ENVIRONMENT IDENTITY",
    `- Scene: ${scene.name.trim()}`,
    `- Location: ${scene.location.trim()}`,
    `- Narrative use: ${scene.purpose.trim()}`,
    "",
    "SPATIAL CONTRACT",
    "- Establish a readable foreground, midground, and background with stable architectural relationships.",
    "- Use one neutral wide establishing viewpoint, believable perspective, reusable landmarks, and clear entrances/exits.",
    "- Preserve enough uncluttered space for later character placement and varied shot crops.",
    "",
    "LIGHTING AND ATMOSPHERE",
    `- Time: ${scene.timeOfDay.trim()}`,
    `- Atmosphere: ${scene.atmosphere.trim()}`,
    "- Keep the light direction, weather cues, color temperature, and landmark visibility internally consistent.",
    "",
    "STYLE",
    `- ${style}.`,
    "- Drawn comic background language; readable shapes and production-ready detail, not photorealistic live action or 3D rendering.",
    "",
    "OUTPUT CONTRACT",
    "- One environment only. No people, characters, crowds, silhouettes, portraits, vehicles as subjects, or staged action.",
    "- No text, signs with readable lettering, numbers, UI, logo, watermark, caption, speech bubble, panel border, collage, or contact sheet.",
  ].join("\n");
}

export function buildCharacterReferenceStyleGuide(project: Pick<LocalProject, "artStyle" | "comicFormat">): string {
  const artStyle = wsDomain.getArtStyleLabel(project.artStyle);
  const comicFormat = getComicFormatDefinition(project.comicFormat).referencePromptHint;
  return [
    `Style guide: ${artStyle}; ${comicFormat}.`,
    "Use stylized comic linework, controlled cel shading or painterly comic shading, clean readable silhouette, and production-ready character consistency.",
    "Even if the story is realistic or dark, interpret realism as comic realism, not photorealism.",
  ].join("\n");
}

export function buildCharacterReferencePrompt(
  project: LocalProject,
  character: ProjectCharacter,
  referenceKind: ProjectCharacterReferenceKind,
): string {
  const styleGuide = buildCharacterReferenceStyleGuide(project);
  const base = [
    `项目类型：${getProjectTypeLabel(project.type)}。This is a comic/manhua production project, not a live-action casting project.`,
    `作品名：${project.storyTitle || project.name}`,
    project.genreTags.length > 0 ? `题材标签：${project.genreTags.join("、")}` : "",
    `漫画形式：${getComicFormatDefinition(project.comicFormat).referencePromptHint}`,
    `美术风格：${wsDomain.getArtStyleLabel(project.artStyle)}`,
    "风格硬约束：必须是绘制感漫画/条漫/漫画角色设定图，不能生成真人照片、真人演员定妆照、摄影棚肖像、电影剧照、cosplay 照片或 3D 渲染。",
    styleGuide,
    `角色名：${character.name}`,
    `角色身份：${character.role || character.level}`,
    `外貌设定：${character.appearance || "根据项目风格补全，但保持简洁稳定"}`,
    `性格气质：${character.personality || "符合角色身份"}`,
    character.promptFragment ? `提示词片段：${character.promptFragment}` : "",
  ].filter(Boolean).join("\n");

  if (referenceKind === "final_reference") {
    return [
      "Create a clean final character reference sheet for a comic/manhua production pipeline using the provided preview image as the strict character identity reference.",
      "Preserve the same face, hairstyle, outfit, age, body proportions, and overall temperament from the preview image.",
      "IDENTITY LOCK: one same character, one same outfit, identical face, hair silhouette, body proportions, costume construction, colors, accessories, and age across every view.",
      "Drawn illustration style only. Neutral standing pose, neutral expression, even studio-like lighting, plain light background, no perspective distortion.",
      "LAYOUT: the single image contains exactly four clearly separated views in this order: front half-body portrait, front full-body, side full-body, back full-body.",
      "Keep scale and baseline consistent across the three full-body views; show hands, footwear, costume layers, and recurring accessories clearly.",
      "No text labels, measurements, color names, logo, watermark, extra characters, props hiding the body, cropped limbs, dramatic pose changes, scene background, photo, cosplay, or 3D render.",
      base,
    ].join("\n");
  }

  return [
    "Create a clean front preview portrait for a comic/manhua character library.",
    "IDENTITY SEED: establish one unmistakable face, hairstyle silhouette, age, body type, costume construction, colors, and recurring accessories for later consistency.",
    "Drawn illustration style only. Exactly one character, front view, half-body portrait, neutral readable expression, even lighting, plain light background.",
    "Keep both shoulders and the main costume silhouette visible; avoid foreshortening and avoid hands covering the face or costume cues.",
    "No text labels, logo, watermark, extra characters, scene background, cropped face, dramatic action pose, photo, cosplay, or 3D render.",
    base,
  ].join("\n");
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
