import { createHash } from "node:crypto";
import {
  CANDIDATE_GENERATION_SPEC_VERSION,
  LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
  type CandidateGenerationReference,
  type CandidateGenerationSpec,
  type CandidatePromptSection,
  type ArtStyle,
  type ComicFormat,
  type StoryboardShot,
} from "@airoaming/shared";

export const CANDIDATE_GENERATION_PURPOSE = "shot_clean_plate" as const;

export interface CandidateGenerationCharacterContext {
  id: string;
  name: string;
  appearance: string;
  promptFragment: string;
}

export interface CandidateGenerationSceneContext {
  id: string;
  name: string;
  location: string;
  timeOfDay: string;
  atmosphere: string;
}

export interface CandidatePromptShot {
  coreAction: string;
  emotion: string;
  shotType: StoryboardShot["shotType"];
  cameraAngle: StoryboardShot["cameraAngle"];
  comic: Pick<StoryboardShot["comic"], "panelDescription" | "composition">;
}

export interface BuildCandidatePromptContentInput {
  artStyle: string;
  shot: CandidatePromptShot;
  scene: CandidateGenerationSceneContext | null;
  characters: CandidateGenerationCharacterContext[];
}

export interface BuildCandidateGenerationSpecInput {
  projectId: string;
  chapterId: string;
  /** 只为证明/约束 builder 不会把章节标题带进 provider prompt。 */
  chapterTitle: string;
  /** 只用于上游推导 requestedSize，不得以页面格式名进入 prompt。 */
  comicFormat: ComicFormat;
  artStyle: ArtStyle;
  shot: StoryboardShot;
  scene: CandidateGenerationSceneContext | null;
  characters: CandidateGenerationCharacterContext[];
  references: CandidateGenerationReference[];
  requestedSize: { width: number; height: number };
  visualDescriptionOverride?: string | null;
  warnings?: string[];
}

export interface CreateCandidateGenerationSpecInput {
  project: {
    id: string;
    comicFormat: ComicFormat;
    artStyle: ArtStyle;
    characters: Array<{
      id: string;
      name: string;
      appearance: string;
      promptFragment: string;
      previewReferenceAssetId: string | null;
      previewConfirmedAt: string | null;
      primaryReferenceAssetId: string | null;
    }>;
    assets: Array<{ id: string; path: string }>;
  };
  chapter: {
    id: string;
    title: string;
    storyStructure: {
      structureJson: {
        characters: Array<{
          id: string;
          projectCharacterId: string | null;
          name: string;
          visualTraits: string;
        }>;
        scenes: Array<{
          id: string;
          name: string;
          location: string;
          timeOfDay: string;
          atmosphere: string;
          referenceAssetId?: string | null;
        }>;
      };
    } | null;
  };
  shot: StoryboardShot;
  visualDescriptionOverride?: string | null;
}

export interface CandidateGenerationTaskInput extends Record<string, unknown> {
  chapterId: string;
  shotId: string;
  candidateCount: number;
  generationPurpose: typeof CANDIDATE_GENERATION_PURPOSE;
  generationSpecVersion: typeof CANDIDATE_GENERATION_SPEC_VERSION;
  generationSpecDigest: string;
  candidateGenerationSpec: CandidateGenerationSpec;
  image: {
    width: number;
    height: number;
    sizePolicyVersion: typeof LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION;
  };
}

export const CANDIDATE_SYSTEM_CONSTRAINTS = [
  "Create exactly one clean comic illustration for one storyboard shot.",
  "Show one scene, one static moment, and one camera composition in a full-bleed image.",
  "Preserve the supplied character identity, environment identity, costume, props, spatial relationships, and light direction.",
  "Use readable comic staging with a clear focal subject, foreground/midground/background separation, and intentional negative space.",
  "Do not render text, letters, numbers, logos, watermarks, subtitles, captions, speech bubbles, thought bubbles, or sound effects.",
  "Do not create page layouts, multiple panels, split screens, grids, borders, gutters, collages, contact sheets, or character sheets.",
] as const;

export const CANDIDATE_NEGATIVE_PROMPT = [
  "text",
  "typography",
  "letters",
  "numbers",
  "logo",
  "watermark",
  "subtitle",
  "caption",
  "speech bubbles",
  "thought bubbles",
  "sound effects",
  "multiple panels",
  "split screen",
  "page layout",
  "panel borders",
  "gutters",
  "collage",
  "contact sheet",
  "character sheet",
  "low quality",
  "blurry",
  "extra fingers",
  "photorealistic live-action",
  "3d render",
].join(", ");

export function buildCandidatePromptContent(input: BuildCandidatePromptContentInput): {
  positivePrompt: string;
  negativePrompt: string;
  sections: CandidatePromptSection[];
  systemConstraints: string[];
} {
  const visual = input.shot.comic.panelDescription.trim() || input.shot.coreAction.trim();
  const sections = compactSections([
    { key: "visual", label: "主体与静态瞬间", value: visual },
    { key: "action", label: "动作与情绪", value: joinNonEmpty([input.shot.coreAction, input.shot.emotion], "; ") },
    { key: "composition", label: "构图与视觉重心", value: input.shot.comic.composition.trim() },
    { key: "camera", label: "景别与机位", value: `${input.shot.shotType}; ${input.shot.cameraAngle}` },
    { key: "characters", label: "角色身份与外观", value: formatCharacters(input.characters) },
    { key: "scene", label: "环境、光线与氛围", value: formatScene(input.scene) },
    { key: "style", label: "漫画画风", value: `${input.artStyle}; drawn comic/manhua illustration; consistent linework and controlled shading` },
  ]);
  const positivePrompt = [
    "PURPOSE",
    CANDIDATE_SYSTEM_CONSTRAINTS[0],
    "",
    ...sections.flatMap((section) => [section.label.toUpperCase(), section.value, ""]),
    "OUTPUT CONTRACT",
    ...CANDIDATE_SYSTEM_CONSTRAINTS.slice(1).map((constraint) => `- ${constraint}`),
  ].join("\n").trim();
  return {
    positivePrompt,
    negativePrompt: CANDIDATE_NEGATIVE_PROMPT,
    sections,
    systemConstraints: [...CANDIDATE_SYSTEM_CONSTRAINTS],
  };
}

/**
 * 候选图最终生成规格的唯一纯函数。
 *
 * 只读取分镜中的静态画面事实。chapterTitle、comicFormat、dialogue、caption、
 * promptDraft、motion 等字段即使存在也不会进入 provider prompt。
 */
export function buildCandidateGenerationSpec(input: BuildCandidateGenerationSpecInput): CandidateGenerationSpec {
  const promptContent = buildCandidatePromptContent({
    artStyle: input.artStyle,
    shot: input.visualDescriptionOverride?.trim()
      ? { ...input.shot, comic: { ...input.shot.comic, panelDescription: input.visualDescriptionOverride.trim() } }
      : input.shot,
    scene: input.scene,
    characters: input.characters,
  });
  const { positivePrompt, negativePrompt, sections, systemConstraints } = promptContent;

  const digestSource = JSON.stringify({
    schemaVersion: CANDIDATE_GENERATION_SPEC_VERSION,
    sizePolicyVersion: LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
    purpose: CANDIDATE_GENERATION_PURPOSE,
    projectId: input.projectId,
    chapterId: input.chapterId,
    shotId: input.shot.id,
    positivePrompt,
    negativePrompt,
    requestedSize: input.requestedSize,
    references: input.references,
  });

  return {
    schemaVersion: CANDIDATE_GENERATION_SPEC_VERSION,
    sizePolicyVersion: LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
    purpose: CANDIDATE_GENERATION_PURPOSE,
    projectId: input.projectId,
    chapterId: input.chapterId,
    shotId: input.shot.id,
    positivePrompt,
    negativePrompt,
    sections,
    systemConstraints,
    requestedSize: input.requestedSize,
    references: input.references,
    warnings: [...new Set(input.warnings ?? [])],
    digest: createHash("sha1").update(digestSource).digest("hex").slice(0, 12),
  };
}

/**
 * 从正式 project/chapter/shot 事实中解析候选图规格。
 * 这里同时收口镜头级角色与场景引用，调用方不能再传全章 referenceAssetIds。
 */
export function createCandidateGenerationSpec(input: CreateCandidateGenerationSpecInput): CandidateGenerationSpec {
  const storyCharacters = input.chapter.storyStructure?.structureJson.characters ?? [];
  const assetsById = new Map(input.project.assets.map((asset) => [asset.id, asset]));
  const warnings: string[] = [];
  const characters: CandidateGenerationCharacterContext[] = [];
  const references: CandidateGenerationReference[] = [];

  for (const [characterIndex, characterToken] of input.shot.characterIds.entries()) {
    const storyCharacter = storyCharacters.find((character) =>
      character.id === characterToken
      || character.projectCharacterId === characterToken
      || character.name === characterToken,
    );
    const projectCharacter = input.project.characters.find((character) =>
      character.id === characterToken
      || character.id === storyCharacter?.projectCharacterId
      || character.name === storyCharacter?.name
      || character.name === characterToken,
    );

    const characterId = projectCharacter?.id ?? storyCharacter?.projectCharacterId ?? storyCharacter?.id ?? characterToken;
    const characterName = projectCharacter?.name ?? storyCharacter?.name ?? characterToken;
    characters.push({
      id: characterId,
      name: characterName,
      appearance: storyCharacter?.visualTraits?.trim() || firstVisualSegment(projectCharacter?.appearance),
      promptFragment: firstVisualSegment(projectCharacter?.promptFragment),
    });

    const previewAssetId = projectCharacter?.previewReferenceAssetId ?? null;
    if (previewAssetId && projectCharacter?.previewConfirmedAt && assetsById.has(previewAssetId)) {
      references.push({
        assetId: previewAssetId,
        kind: "character_identity",
        entityId: characterId,
        label: characterName,
        priority: characterIndex === 0 ? 100 : Math.max(1, 81 - characterIndex),
      });
    } else if (projectCharacter) {
      warnings.push(`character_preview_reference_omitted:${projectCharacter.id}`);
    }
  }

  const sceneSource = input.chapter.storyStructure?.structureJson.scenes.find((scene) => scene.id === input.shot.sceneId) ?? null;
  const scene: CandidateGenerationSceneContext | null = sceneSource
    ? {
      id: sceneSource.id,
      name: sceneSource.name,
      location: sceneSource.location,
      timeOfDay: sceneSource.timeOfDay,
      atmosphere: sceneSource.atmosphere,
    }
    : null;
  if (sceneSource?.referenceAssetId && assetsById.has(sceneSource.referenceAssetId)) {
    references.push({
      assetId: sceneSource.referenceAssetId,
      kind: "scene_environment",
      entityId: sceneSource.id,
      label: sceneSource.name,
      priority: 90,
    });
  } else if (sceneSource) {
    warnings.push(`scene_reference_omitted:${sceneSource.id}`);
  }

  return buildCandidateGenerationSpec({
    projectId: input.project.id,
    chapterId: input.chapter.id,
    chapterTitle: input.chapter.title,
    comicFormat: input.project.comicFormat,
    artStyle: input.project.artStyle,
    shot: input.shot,
    scene,
    characters: dedupeById(characters),
    references: dedupeReferences(references),
    requestedSize: getLegacyGenerationDefaultSize(input.project.comicFormat).requestedSize,
    visualDescriptionOverride: input.visualDescriptionOverride,
    warnings,
  });
}

export function getCandidateRequestedSize(comicFormat: ComicFormat): { width: number; height: number } {
  return getLegacyGenerationDefaultSize(comicFormat).requestedSize;
}

export function getLegacyGenerationDefaultSize(comicFormat: ComicFormat): {
  requestedSize: { width: number; height: number };
  sizePolicyVersion: typeof LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION;
} {
  return {
    requestedSize: comicFormat === "paged_comic"
      ? { width: 1536, height: 1024 }
      : { width: 1024, height: 1536 },
    sizePolicyVersion: LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
  };
}

/**
 * 把客户端的语义请求收口成可执行任务输入。
 * 除 candidateCount 外不信任客户端生成参数；Prompt、引用和尺寸全部来自服务端 spec。
 */
export function createCandidateGenerationTaskInput(
  spec: CandidateGenerationSpec,
  clientInput: Record<string, unknown> | undefined,
): CandidateGenerationTaskInput {
  const rawCandidateCount = Number(clientInput?.candidateCount);
  const candidateCount = Number.isFinite(rawCandidateCount) && rawCandidateCount > 0
    ? Math.min(6, Math.max(1, Math.floor(rawCandidateCount)))
    : 1;
  return {
    chapterId: spec.chapterId,
    shotId: spec.shotId,
    candidateCount,
    generationPurpose: spec.purpose,
    generationSpecVersion: spec.schemaVersion,
    generationSpecDigest: spec.digest,
    candidateGenerationSpec: spec,
    image: { ...spec.requestedSize, sizePolicyVersion: spec.sizePolicyVersion },
  };
}

function compactSections(sections: CandidatePromptSection[]): CandidatePromptSection[] {
  return sections.filter((section) => section.value.trim().length > 0);
}

function formatScene(scene: CandidateGenerationSceneContext | null): string {
  if (!scene) {
    return "";
  }
  return joinNonEmpty([scene.name, scene.location, scene.timeOfDay, scene.atmosphere], "; ");
}

function formatCharacters(characters: CandidateGenerationCharacterContext[]): string {
  return characters
    .map((character) => {
      const description = joinUnique([character.appearance, character.promptFragment], ", ");
      return description ? `${character.name}: ${description}` : character.name;
    })
    .filter(Boolean)
    .join("; ");
}

function joinNonEmpty(values: Array<string | null | undefined>, separator: string): string {
  return values.map((value) => value?.trim() ?? "").filter(Boolean).join(separator);
}

function joinUnique(values: Array<string | null | undefined>, separator: string): string {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))].join(separator);
}

function firstVisualSegment(value: string | null | undefined): string {
  return (value ?? "").split(/[；;\n]/, 1)[0]?.trim().slice(0, 200) ?? "";
}

function dedupeById(characters: CandidateGenerationCharacterContext[]): CandidateGenerationCharacterContext[] {
  return characters.filter((character, index) => characters.findIndex((item) => item.id === character.id) === index);
}

function dedupeReferences(references: CandidateGenerationReference[]): CandidateGenerationReference[] {
  return references.filter((reference, index) => references.findIndex((item) => item.assetId === reference.assetId) === index);
}
