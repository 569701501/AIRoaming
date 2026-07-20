import type {
  CandidatePromptSection,
  ImageProviderType,
} from "@airoaming/shared";
import {
  readOpenCodeSkillJsonReference,
  renderOpenCodePromptTemplate,
} from "../ai-runtime/opencode-skill-asset.util.js";
import {
  readCandidateShotContract,
  type CandidateShotContractV2,
} from "./candidate-generation-spec.js";

export type NegativePromptDelivery = "embedded_constraints";

export interface CompiledImagePrompt {
  profileId: string;
  providerType: ImageProviderType;
  prompt: string;
  negativePromptDelivery: NegativePromptDelivery;
}

export interface CompileImagePromptInput {
  providerType: ImageProviderType;
  positivePrompt: string;
  negativePrompt: string;
  /** V2 读取领域分段，不要求页面或数据库新增字段。 */
  sections?: CandidatePromptSection[];
  /** V2 只消费其中的镜头级动态合同；公共 clean-plate 合同由 Skill Profile 表达。 */
  systemConstraints?: string[];
}

export interface CompileImageReferenceGuidanceInput {
  providerType: ImageProviderType;
  prompt: string;
  references: ReadonlyArray<{
    kind: "character_identity" | "cast_identity_board" | "scene_environment";
    label: string;
  }>;
}

type PromptFields = Partial<Record<CandidatePromptSection["key"], string>>;
type ProviderBlockSource = CandidatePromptSection["key"] | "literal" | "shotContract" | "outputContract";

interface ProviderProfileConfig {
  legacyProfileId: string;
  profileId: string;
  namesSeparator: string;
  defaultAction: string;
  defaultComposition: string;
  separator: string;
  fallbackTemplate: string;
  blocks: Array<{
    label: string;
    source: ProviderBlockSource;
    value?: string;
  }>;
  outputContract: string[];
  shotContract?: Record<CandidateShotContractV2["staging"] | "shared", string[]>;
  shotContractSource?: ImageProviderType;
  referenceGuidance?: {
    heading: string;
    character: string;
    castIdentityBoard: string;
    scene: string;
    closing: string;
  };
  referenceGuidanceSource?: ImageProviderType;
  shotRuleLabels?: {
    environment: string[];
    subjects: string[];
  };
}

type ProviderProfileRegistry = Record<ImageProviderType, ProviderProfileConfig>;

const IMAGE_CANDIDATE_SKILL = "image-candidate-generate";
const PROVIDER_PROFILES = readOpenCodeSkillJsonReference<ProviderProfileRegistry>(
  IMAGE_CANDIDATE_SKILL,
  "provider-profiles.json",
);

/**
 * 冻结的旧版 Provider 行为，仅用于同语料 V1/V2 A/B 和历史兼容。
 * 生产新任务使用 compileImagePromptForProvider（V2）。
 */
export function compileImagePromptForProviderV1(input: CompileImagePromptInput): CompiledImagePrompt {
  const { positivePrompt } = validateInput(input);
  const profile = getProviderProfile(input.providerType);
  return {
    profileId: profile.legacyProfileId,
    providerType: input.providerType,
    prompt: positivePrompt,
    negativePromptDelivery: "embedded_constraints",
  };
}

/**
 * V2 图片 Provider 编译器。
 *
 * 领域创作语义与各家单 Prompt 投递 Profile 全部来自
 * opencodeAI/skills/image-candidate-generate；代码只选择 Profile、填充动态事实。
 */
export function compileImagePromptForProvider(input: CompileImagePromptInput): CompiledImagePrompt {
  const validated = validateInput(input);
  const profile = getProviderProfile(input.providerType);
  const fields = promptFields(input.sections ?? []);
  const shotContract = readCandidateShotContract(input.systemConstraints ?? []);
  const prompt = Object.keys(fields).length === 0
    ? renderOpenCodePromptTemplate(profile.fallbackTemplate, {
      SOURCE_PROMPT: validated.positivePrompt,
      OUTPUT_CONTRACT: bulletText(profile.outputContract),
    })
    : compileProfilePrompt(profile, fields, shotContract);

  return {
    profileId: profile.profileId,
    providerType: input.providerType,
    prompt,
    negativePromptDelivery: "embedded_constraints",
  };
}

/**
 * 把最终选中的参考图职责追加到 provider Prompt。
 * 稳定措辞来自 image-candidate-generate Skill，代码只填图片序号和标签。
 */
export function compileImageReferenceGuidanceForProvider(
  input: CompileImageReferenceGuidanceInput,
): string {
  const prompt = input.prompt.trim();
  if (!prompt) throw new TypeError("prompt must be non-empty");
  if (input.references.length === 0) return prompt;

  const profile = getProviderProfile(input.providerType);
  const sourceProfile = profile.referenceGuidanceSource
    ? getProviderProfile(profile.referenceGuidanceSource)
    : profile;
  const guidance = sourceProfile.referenceGuidance;
  if (!guidance) {
    throw new TypeError(
      `IMAGE_PROVIDER_REFERENCE_GUIDANCE_MISSING:${profile.referenceGuidanceSource ?? input.providerType}`,
    );
  }
  const rows = input.references.map((reference, index) => {
    const template = reference.kind === "character_identity"
      ? guidance.character
      : reference.kind === "cast_identity_board"
        ? guidance.castIdentityBoard
        : guidance.scene;
    return renderOpenCodePromptTemplate(template, { INDEX: index + 1, LABEL: reference.label });
  });
  return [prompt, "", guidance.heading, ...rows, guidance.closing].join("\n");
}

function compileProfilePrompt(
  profile: ProviderProfileConfig,
  fields: PromptFields,
  shotContract: CandidateShotContractV2 | null,
): string {
  const shotRules = shotContract ? compileShotContract(profile, shotContract) : [];
  const blocks = profile.blocks.map((block): [label: string, value: string | undefined] => {
    if (block.source === "literal") return [block.label, block.value];
    if (block.source === "shotContract") return [block.label, bulletText(shotRules)];
    if (block.source === "outputContract") return [block.label, bulletText(profile.outputContract)];
    return [block.label, fields[block.source]];
  });
  return compactBlocks(blocks, profile.separator);
}

function compileShotContract(
  profile: ProviderProfileConfig,
  contract: CandidateShotContractV2,
): string[] {
  const sourceProfile = profile.shotContractSource
    ? getProviderProfile(profile.shotContractSource)
    : profile;
  if (!sourceProfile.shotContract) {
    throw new TypeError(`IMAGE_PROVIDER_SHOT_CONTRACT_MISSING:${profile.shotContractSource ?? "current"}`);
  }
  const variables = {
    NAMES: contract.subjectNames.join(sourceProfile.namesSeparator),
    COLLECTIVE_NAMES: (contract.collectiveSubjectNames ?? []).join(sourceProfile.namesSeparator),
    GROUP_COUNT_HINT: contract.groupCountHint ?? "unspecified",
    ACTION: contract.action || sourceProfile.defaultAction,
    COMPOSITION: contract.composition || sourceProfile.defaultComposition,
    SUBJECT_COUNT: contract.subjectCount,
  };
  const rules = [
    ...sourceProfile.shotContract[contract.staging],
    ...sourceProfile.shotContract.shared,
  ].map((rule) => renderOpenCodePromptTemplate(rule, variables));
  if (!profile.shotRuleLabels) return rules;

  const labels = contract.staging === "environment"
    ? profile.shotRuleLabels.environment
    : profile.shotRuleLabels.subjects;
  return rules.map((rule, index) => `${labels[Math.min(index, labels.length - 1)]}: ${rule}`);
}

function validateInput(input: CompileImagePromptInput): { positivePrompt: string; negativePrompt: string } {
  const positivePrompt = input.positivePrompt.trim();
  const negativePrompt = input.negativePrompt.trim();
  if (!positivePrompt) throw new TypeError("positivePrompt must be non-empty");
  if (!negativePrompt) throw new TypeError("negativePrompt must be non-empty");
  return { positivePrompt, negativePrompt };
}

function getProviderProfile(providerType: ImageProviderType): ProviderProfileConfig {
  const profile = PROVIDER_PROFILES[providerType];
  if (!profile) throw new TypeError(`IMAGE_PROVIDER_PROMPT_PROFILE_MISSING:${providerType}`);
  return profile;
}

function promptFields(sections: CandidatePromptSection[]): PromptFields {
  return Object.fromEntries(sections.map((section) => [section.key, section.value.trim()])) as PromptFields;
}

function compactBlocks(
  blocks: Array<[label: string, value: string | undefined]>,
  separator = "\n",
): string {
  return blocks
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([label, value]) => {
      const normalized = value!.trim();
      const joiner = separator === "：" && normalized.startsWith("-") ? "：\n" : separator;
      return `${label}${joiner}${normalized}`;
    })
    .join("\n\n");
}

function bulletText(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}
