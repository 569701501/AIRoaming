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

export function buildScenePrompt(scene: { name: string; location: string; timeOfDay: string; atmosphere: string; purpose: string }): string {
  return [scene.name, scene.location, scene.timeOfDay, scene.atmosphere, `画面用途:${scene.purpose}`]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("，");
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
      "Drawn illustration style only. One same character, same outfit, same proportions, neutral expression, plain light background.",
      "The single image must contain four panels: front half-body portrait, front full-body, side full-body, back full-body.",
      "No text labels, no logo, no watermark, no extra characters, no dramatic pose changes.",
      base,
    ].join("\n");
  }

  return [
    "Create a clean front preview portrait for a comic/manhua character library.",
    "Drawn illustration style only. One character, front view, half-body portrait, clear face and costume cues, plain light background.",
    "No text labels, no logo, no watermark, no extra characters.",
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
