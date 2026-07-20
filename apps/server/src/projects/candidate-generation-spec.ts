import { createHash } from "node:crypto";
import {
  CANDIDATE_GENERATION_SPEC_VERSION,
  LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION,
  type CandidateGenerationReference,
  type CandidateGenerationSpec,
  type CandidatePromptOverrides,
  type CandidatePromptSection,
  type ArtStyle,
  type ComicFormat,
  type ProjectCharacterEntityType,
  type StoryboardShot,
} from "@airoaming/shared";
import {
  readOpenCodeSkillJsonReference,
  readOpenCodeSkillReference,
  renderOpenCodePromptTemplate,
} from "../ai-runtime/opencode-skill-asset.util.js";
import {
  extractCollectiveCountHint,
  findCandidateVisualIssues,
} from "./candidate-visual-quality.util.js";

export const CANDIDATE_GENERATION_PURPOSE = "shot_clean_plate" as const;

export const CANDIDATE_SHOT_CONTRACT_PREFIX = "AIROAMING_SHOT_CONTRACT_V2:";

export interface CandidateShotContractV2 {
  schemaVersion: 2;
  staging: "environment" | "single" | "pair" | "group" | "collective";
  subjectCount: number;
  subjectNames: string[];
  collectiveSubjectNames?: string[];
  groupCountHint?: string | null;
  action: string;
  composition: string;
  decisiveMoment: true;
  effectCausality: "conditional";
}

export interface CandidateGenerationCharacterContext {
  id: string;
  name: string;
  entityType?: ProjectCharacterEntityType | null;
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
  promptOverrides?: CandidatePromptOverrides | null;
  /** @deprecated 仅供旧调用方兼容，新路径使用 promptOverrides.visualDescription。 */
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
      entityType?: ProjectCharacterEntityType | null;
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
          entityType?: ProjectCharacterEntityType | null;
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
  promptOverrides?: CandidatePromptOverrides | null;
  /** @deprecated 仅供旧调用方兼容。 */
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

const IMAGE_CANDIDATE_SKILL = "image-candidate-generate";

interface CandidatePromptConfig {
  sectionLabels: Record<CandidatePromptSection["key"], string>;
  styleSuffix: string;
  systemConstraints: string[];
  negativePromptTokens: string[];
}

const CANDIDATE_PROMPT_CONFIG = readOpenCodeSkillJsonReference<CandidatePromptConfig>(
  IMAGE_CANDIDATE_SKILL,
  "candidate-config.json",
);

export const CANDIDATE_SYSTEM_CONSTRAINTS: readonly string[] = Object.freeze([
  ...CANDIDATE_PROMPT_CONFIG.systemConstraints,
]);

export const CANDIDATE_NEGATIVE_PROMPT = CANDIDATE_PROMPT_CONFIG.negativePromptTokens.join(", ");

export function buildCandidatePromptContent(input: BuildCandidatePromptContentInput): {
  positivePrompt: string;
  negativePrompt: string;
  sections: CandidatePromptSection[];
  systemConstraints: string[];
  visualIssues: ReturnType<typeof findCandidateVisualIssues>;
} {
  const visual = input.shot.comic.panelDescription.trim() || input.shot.coreAction.trim();
  const sections = compactSections([
    { key: "visual", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.visual, value: visual },
    { key: "action", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.action, value: joinNonEmpty([input.shot.coreAction, input.shot.emotion], "; ") },
    { key: "composition", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.composition, value: input.shot.comic.composition.trim() },
    { key: "camera", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.camera, value: `${input.shot.shotType}; ${input.shot.cameraAngle}` },
    { key: "characters", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.characters, value: formatCharacters(input.characters) },
    { key: "scene", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.scene, value: formatScene(input.scene) },
    { key: "style", label: CANDIDATE_PROMPT_CONFIG.sectionLabels.style, value: `${input.artStyle}; ${CANDIDATE_PROMPT_CONFIG.styleSuffix}` },
  ]);
  const shotContract = buildCandidateShotContract(input);
  const visualIssues = findCandidateVisualIssues({
    visualDescription: input.shot.comic.panelDescription,
    action: input.shot.coreAction,
    composition: input.shot.comic.composition,
    characters: input.characters.map((character) => ({
      name: character.name,
      entityType: character.entityType ?? "human",
    })),
  });
  const positivePrompt = renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(IMAGE_CANDIDATE_SKILL, "candidate-prompt.md"),
    {
      PURPOSE: CANDIDATE_SYSTEM_CONSTRAINTS[0] ?? "",
      SECTIONS: sections.map((section) => `${section.label.toUpperCase()}\n${section.value}`).join("\n\n"),
      OUTPUT_CONTRACT: CANDIDATE_SYSTEM_CONSTRAINTS.slice(1).map((constraint) => `- ${constraint}`).join("\n"),
    },
  );
  return {
    positivePrompt,
    negativePrompt: CANDIDATE_NEGATIVE_PROMPT,
    sections,
    // V1 的 positivePrompt 保持不变，便于同语料 A/B；V2 Provider Profile
    // 读取这些镜头级语义约束，按模型习惯编译成最终投递文案。
    systemConstraints: [
      ...CANDIDATE_SYSTEM_CONSTRAINTS,
      `${CANDIDATE_SHOT_CONTRACT_PREFIX}${JSON.stringify(shotContract)}`,
    ],
    visualIssues,
  };
}

/**
 * 候选图最终生成规格的唯一纯函数。
 *
 * 只读取分镜中的静态画面事实。chapterTitle、comicFormat、dialogue、caption、
 * promptDraft、motion 等字段即使存在也不会进入 provider prompt。
 */
export function buildCandidateGenerationSpec(input: BuildCandidateGenerationSpecInput): CandidateGenerationSpec {
  const promptOverrides = normalizePromptOverrides(input.promptOverrides, input.visualDescriptionOverride);
  const effectiveShot = applyPromptOverrides(input.shot, promptOverrides);
  const promptContent = buildCandidatePromptContent({
    artStyle: input.artStyle,
    shot: effectiveShot,
    scene: input.scene,
    characters: input.characters,
  });
  const { positivePrompt, negativePrompt, sections, systemConstraints, visualIssues } = promptContent;

  const digestSource = JSON.stringify({
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
    visualIssues,
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
    visualIssues,
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
      entityType: storyCharacter?.entityType ?? projectCharacter?.entityType ?? "human",
      appearance: firstVisualSegment(projectCharacter?.appearance) || firstVisualSegment(storyCharacter?.visualTraits),
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
    promptOverrides: input.promptOverrides,
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

/**
 * 漫画静态候选图的镜头任务模块。
 *
 * 不新增页面字段：人物数量来自正式分镜 characterIds，动作归属与站位来自
 * coreAction / comic.composition。这里生成语义约束，由 V2 Provider Profile 消费；
 * 旧 V1 positivePrompt 不读取这些字符串。
 */
function buildCandidateShotContract(input: BuildCandidatePromptContentInput): CandidateShotContractV2 {
  const characters = input.characters;
  const names = characters.map((character) => character.name.trim()).filter(Boolean);
  const collectiveSubjectNames = characters
    .filter((character) => character.entityType === "group")
    .map((character) => character.name.trim())
    .filter(Boolean);
  const action = input.shot.coreAction.trim();
  const composition = input.shot.comic.composition.trim();
  const staging = collectiveSubjectNames.length > 0
    ? "collective"
    : characters.length === 0
    ? "environment"
    : characters.length === 1
      ? "single"
      : characters.length === 2
        ? "pair"
        : "group";
  return {
    schemaVersion: 2,
    staging,
    subjectCount: characters.length,
    subjectNames: names,
    collectiveSubjectNames,
    groupCountHint: collectiveSubjectNames.length > 0
      ? extractCollectiveCountHint(
        [input.shot.comic.panelDescription, action, composition].join("\n"),
        collectiveSubjectNames,
      )
      : null,
    action,
    composition,
    decisiveMoment: true,
    effectCausality: "conditional",
  };
}

export function readCandidateShotContract(systemConstraints: string[]): CandidateShotContractV2 | null {
  const encoded = systemConstraints.find((constraint) => constraint.startsWith(CANDIDATE_SHOT_CONTRACT_PREFIX));
  if (!encoded) return null;
  let value: unknown;
  try {
    value = JSON.parse(encoded.slice(CANDIDATE_SHOT_CONTRACT_PREFIX.length));
  } catch {
    throw new TypeError("CANDIDATE_SHOT_CONTRACT_INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("CANDIDATE_SHOT_CONTRACT_INVALID");
  }
  const contract = value as Partial<CandidateShotContractV2>;
  const allowedStaging = new Set<CandidateShotContractV2["staging"]>(["environment", "single", "pair", "group", "collective"]);
  if (
    contract.schemaVersion !== 2
    || !contract.staging
    || !allowedStaging.has(contract.staging)
    || !Number.isInteger(contract.subjectCount)
    || (contract.subjectCount ?? -1) < 0
    || !Array.isArray(contract.subjectNames)
    || contract.subjectNames.some((name) => typeof name !== "string" || !name.trim())
    || (contract.staging !== "collective" && contract.subjectNames.length !== contract.subjectCount)
    || (contract.collectiveSubjectNames !== undefined && (
      !Array.isArray(contract.collectiveSubjectNames)
      || contract.collectiveSubjectNames.some((name) => typeof name !== "string" || !name.trim())
    ))
    || (contract.groupCountHint !== undefined && contract.groupCountHint !== null && typeof contract.groupCountHint !== "string")
    || typeof contract.action !== "string"
    || typeof contract.composition !== "string"
    || contract.decisiveMoment !== true
    || contract.effectCausality !== "conditional"
  ) {
    throw new TypeError("CANDIDATE_SHOT_CONTRACT_INVALID");
  }
  return contract as CandidateShotContractV2;
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

function normalizePromptOverrides(
  value: CandidatePromptOverrides | null | undefined,
  legacyVisualDescription: string | null | undefined,
): CandidatePromptOverrides {
  const normalized: CandidatePromptOverrides = {};
  const visualDescription = value?.visualDescription?.trim() || legacyVisualDescription?.trim();
  const action = value?.action?.trim();
  const composition = value?.composition?.trim();
  if (visualDescription) normalized.visualDescription = visualDescription;
  if (action) normalized.action = action;
  if (composition) normalized.composition = composition;
  return normalized;
}

function applyPromptOverrides(shot: StoryboardShot, overrides: CandidatePromptOverrides): StoryboardShot {
  return {
    ...shot,
    coreAction: overrides.action ?? shot.coreAction,
    comic: {
      ...shot.comic,
      panelDescription: overrides.visualDescription ?? shot.comic.panelDescription,
      composition: overrides.composition ?? shot.comic.composition,
    },
  };
}

function dedupeById(characters: CandidateGenerationCharacterContext[]): CandidateGenerationCharacterContext[] {
  return characters.filter((character, index) => characters.findIndex((item) => item.id === character.id) === index);
}

function dedupeReferences(references: CandidateGenerationReference[]): CandidateGenerationReference[] {
  return references.filter((reference, index) => references.findIndex((item) => item.assetId === reference.assetId) === index);
}
