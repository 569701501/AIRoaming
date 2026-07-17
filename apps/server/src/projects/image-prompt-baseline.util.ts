import {
  CANDIDATE_GENERATION_SPEC_VERSION,
  type ComicFormat,
  type ImageProviderType,
  type ProjectCharacter,
  type ProjectCharacterReferenceKind,
  type StoryboardShot,
} from "@airoaming/shared";
import type { LocalProject } from "./local-types.js";
import {
  createCandidateGenerationSpec,
  type CreateCandidateGenerationSpecInput,
} from "./candidate-generation-spec.js";
import { compileImagePromptForProvider } from "./image-prompt-profile.util.js";
import { buildCharacterReferencePrompt, buildScenePrompt } from "./reference-prompt.util.js";

type ReferencePromptKind = "character_preview" | "character_final" | "scene_reference";
type CandidateCaseCategory =
  | "no_character_establishing"
  | "single_character_closeup"
  | "two_character_dialogue"
  | "group_staging"
  | "scene_effect";

interface PromptExpectation {
  mustContain: string[];
  mustNotContain: string[];
}

interface ReferencePromptCase {
  caseId: string;
  title: string;
  kind: ReferencePromptKind;
  project: Record<string, unknown>;
  character?: Record<string, unknown>;
  scene?: {
    name: string;
    location: string;
    timeOfDay: string;
    atmosphere: string;
    purpose: string;
  };
  expected: PromptExpectation;
}

interface CandidatePromptCase {
  caseId: string;
  title: string;
  category: CandidateCaseCategory;
  comicFormat?: ComicFormat;
  shot: StoryboardShot;
  expected: PromptExpectation & {
    referenceAssetIds: string[];
    requestedSize: { width: number; height: number };
    sectionKeys: string[];
  };
  runtimeRubric: {
    variantsPerProvider: number;
    checks: Array<{ id: string; label: string; passRule: string }>;
  };
}

export interface ImagePromptBaselineSuite {
  schemaVersion: 1;
  suiteId: string;
  providers: ImageProviderType[];
  referenceCases: ReferencePromptCase[];
  candidateContext: Omit<CreateCandidateGenerationSpecInput, "shot" | "visualDescriptionOverride">;
  candidateCases: CandidatePromptCase[];
}

export interface ImagePromptBaselineCheck {
  id: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

export interface ImagePromptBaselineReport {
  schemaVersion: 1;
  suiteId: string;
  productionBaseline: {
    candidateSpecVersion: number;
    candidatePurpose: "shot_clean_plate";
    candidateProviderPromptSource: "positivePrompt";
    negativePromptDelivery: "embedded_constraints";
  };
  referenceCases: Array<{
    caseId: string;
    title: string;
    kind: ReferencePromptKind;
    delivery: "production_reference_service_raw_prompt";
    prompt: string;
    checks: ImagePromptBaselineCheck[];
    passed: boolean;
  }>;
  candidateCases: Array<{
    caseId: string;
    title: string;
    category: CandidateCaseCategory;
    generationSpec: ReturnType<typeof createCandidateGenerationSpec>;
    providerProfiles: ReturnType<typeof compileImagePromptForProvider>[];
    runtimeRubric: CandidatePromptCase["runtimeRubric"];
    checks: ImagePromptBaselineCheck[];
    passed: boolean;
  }>;
  summary: {
    referenceCaseCount: number;
    candidateCaseCount: number;
    providerProfileCount: number;
    runtimeImageCountWhenAuthorized: number;
    failedCaseIds: string[];
    passed: boolean;
  };
}

const PROVIDERS = new Set<ImageProviderType>(["openai", "doubao", "grok"]);
const REFERENCE_KINDS = new Set<ReferencePromptKind>([
  "character_preview",
  "character_final",
  "scene_reference",
]);
const CANDIDATE_CATEGORIES = new Set<CandidateCaseCategory>([
  "no_character_establishing",
  "single_character_closeup",
  "two_character_dialogue",
  "group_staging",
  "scene_effect",
]);

export function parseImagePromptBaselineSuite(value: unknown): ImagePromptBaselineSuite {
  const root = record(value, "root");
  if (root.schemaVersion !== 1) throw new Error("IMAGE_PROMPT_BASELINE_SCHEMA_VERSION");
  const suiteId = text(root.suiteId, "suiteId");
  const providers = array(root.providers, "providers").map((item, index) => {
    const provider = text(item, `providers[${index}]`) as ImageProviderType;
    if (!PROVIDERS.has(provider)) throw new Error(`IMAGE_PROMPT_BASELINE_PROVIDER:${provider}`);
    return provider;
  });
  if (new Set(providers).size !== providers.length || providers.length !== PROVIDERS.size) {
    throw new Error("IMAGE_PROMPT_BASELINE_PROVIDERS_MUST_COVER_ALL");
  }

  const referenceCases = array(root.referenceCases, "referenceCases").map((item, index) => {
    const row = record(item, `referenceCases[${index}]`);
    const kind = text(row.kind, `referenceCases[${index}].kind`) as ReferencePromptKind;
    if (!REFERENCE_KINDS.has(kind)) throw new Error(`IMAGE_PROMPT_BASELINE_REFERENCE_KIND:${kind}`);
    const expected = expectation(row.expected, `referenceCases[${index}].expected`);
    return {
      caseId: text(row.caseId, `referenceCases[${index}].caseId`),
      title: text(row.title, `referenceCases[${index}].title`),
      kind,
      project: record(row.project, `referenceCases[${index}].project`),
      character: row.character === undefined
        ? undefined
        : record(row.character, `referenceCases[${index}].character`),
      scene: row.scene === undefined
        ? undefined
        : parseScene(row.scene, `referenceCases[${index}].scene`),
      expected,
    } satisfies ReferencePromptCase;
  });
  if (referenceCases.length !== 3 || new Set(referenceCases.map((item) => item.kind)).size !== 3) {
    throw new Error("IMAGE_PROMPT_BASELINE_REFERENCE_CASES_REQUIRED");
  }

  const candidateContext = record(root.candidateContext, "candidateContext") as unknown as ImagePromptBaselineSuite["candidateContext"];
  const candidateCases = array(root.candidateCases, "candidateCases").map((item, index) => {
    const row = record(item, `candidateCases[${index}]`);
    const category = text(row.category, `candidateCases[${index}].category`) as CandidateCaseCategory;
    if (!CANDIDATE_CATEGORIES.has(category)) throw new Error(`IMAGE_PROMPT_BASELINE_CATEGORY:${category}`);
    const expectedRow = record(row.expected, `candidateCases[${index}].expected`);
    const expected = expectation(expectedRow, `candidateCases[${index}].expected`);
    const size = record(expectedRow.requestedSize, `candidateCases[${index}].expected.requestedSize`);
    const runtimeRubric = record(row.runtimeRubric, `candidateCases[${index}].runtimeRubric`);
    const comicFormat = row.comicFormat === undefined
      ? undefined
      : text(row.comicFormat, `candidateCases[${index}].comicFormat`) as ComicFormat;
    if (comicFormat && comicFormat !== "vertical_scroll" && comicFormat !== "paged_comic") {
      throw new Error(`IMAGE_PROMPT_BASELINE_COMIC_FORMAT:${comicFormat}`);
    }
    return {
      caseId: text(row.caseId, `candidateCases[${index}].caseId`),
      title: text(row.title, `candidateCases[${index}].title`),
      category,
      comicFormat,
      shot: record(row.shot, `candidateCases[${index}].shot`) as unknown as StoryboardShot,
      expected: {
        ...expected,
        referenceAssetIds: stringArray(expectedRow.referenceAssetIds, `candidateCases[${index}].expected.referenceAssetIds`),
        requestedSize: {
          width: integer(size.width, `candidateCases[${index}].expected.requestedSize.width`),
          height: integer(size.height, `candidateCases[${index}].expected.requestedSize.height`),
        },
        sectionKeys: stringArray(expectedRow.sectionKeys, `candidateCases[${index}].expected.sectionKeys`),
      },
      runtimeRubric: {
        variantsPerProvider: integer(runtimeRubric.variantsPerProvider, `candidateCases[${index}].runtimeRubric.variantsPerProvider`),
        checks: array(runtimeRubric.checks, `candidateCases[${index}].runtimeRubric.checks`).map((check, checkIndex) => {
          const checkRow = record(check, `candidateCases[${index}].runtimeRubric.checks[${checkIndex}]`);
          return {
            id: text(checkRow.id, `candidateCases[${index}].runtimeRubric.checks[${checkIndex}].id`),
            label: text(checkRow.label, `candidateCases[${index}].runtimeRubric.checks[${checkIndex}].label`),
            passRule: text(checkRow.passRule, `candidateCases[${index}].runtimeRubric.checks[${checkIndex}].passRule`),
          };
        }),
      },
    } satisfies CandidatePromptCase;
  });
  if (candidateCases.length !== CANDIDATE_CATEGORIES.size
    || new Set(candidateCases.map((item) => item.category)).size !== CANDIDATE_CATEGORIES.size) {
    throw new Error("IMAGE_PROMPT_BASELINE_FIVE_CATEGORIES_REQUIRED");
  }
  const allIds = [...referenceCases, ...candidateCases].map((item) => item.caseId);
  if (new Set(allIds).size !== allIds.length) throw new Error("IMAGE_PROMPT_BASELINE_CASE_ID_DUPLICATE");
  return { schemaVersion: 1, suiteId, providers, referenceCases, candidateContext, candidateCases };
}

export function compileImagePromptBaseline(suite: ImagePromptBaselineSuite): ImagePromptBaselineReport {
  const referenceCases = suite.referenceCases.map((fixture) => {
    const project = fixture.project as unknown as LocalProject;
    let prompt: string;
    if (fixture.kind === "scene_reference") {
      if (!fixture.scene) throw new Error(`IMAGE_PROMPT_BASELINE_SCENE_REQUIRED:${fixture.caseId}`);
      prompt = buildScenePrompt(fixture.scene, project);
    } else {
      if (!fixture.character) throw new Error(`IMAGE_PROMPT_BASELINE_CHARACTER_REQUIRED:${fixture.caseId}`);
      const referenceKind: ProjectCharacterReferenceKind = fixture.kind === "character_final"
        ? "final_reference"
        : "preview_front";
      prompt = buildCharacterReferencePrompt(
        project,
        fixture.character as unknown as ProjectCharacter,
        referenceKind,
      );
    }
    const checks = textChecks(prompt, fixture.expected);
    return {
      caseId: fixture.caseId,
      title: fixture.title,
      kind: fixture.kind,
      delivery: "production_reference_service_raw_prompt" as const,
      prompt,
      checks,
      passed: checks.every((check) => check.passed),
    };
  });

  const candidateCases = suite.candidateCases.map((fixture) => {
    const project = fixture.comicFormat
      ? { ...suite.candidateContext.project, comicFormat: fixture.comicFormat }
      : suite.candidateContext.project;
    const generationSpec = createCandidateGenerationSpec({
      project,
      chapter: suite.candidateContext.chapter,
      shot: fixture.shot,
    });
    const providerProfiles = suite.providers.map((providerType) => compileImagePromptForProvider({
      providerType,
      positivePrompt: generationSpec.positivePrompt,
      negativePrompt: generationSpec.negativePrompt,
    }));
    const checks = [
      ...textChecks(generationSpec.positivePrompt, fixture.expected),
      check("candidate_spec_version", CANDIDATE_GENERATION_SPEC_VERSION, generationSpec.schemaVersion),
      check("candidate_purpose", "shot_clean_plate", generationSpec.purpose),
      check(
        "reference_asset_ids",
        fixture.expected.referenceAssetIds,
        generationSpec.references.map((reference) => reference.assetId),
      ),
      check("requested_size", fixture.expected.requestedSize, generationSpec.requestedSize),
      check("section_keys", fixture.expected.sectionKeys, generationSpec.sections.map((section) => section.key)),
      check("provider_profile_count", suite.providers.length, providerProfiles.length),
      check(
        "provider_prompts_equal_positive_prompt",
        true,
        providerProfiles.every((profile) => profile.prompt === generationSpec.positivePrompt),
      ),
      check(
        "provider_negative_delivery",
        true,
        providerProfiles.every((profile) => profile.negativePromptDelivery === "embedded_constraints"),
      ),
      check(
        "provider_prompt_no_synthetic_avoid_suffix",
        false,
        providerProfiles.some((profile) => profile.prompt.includes("Avoid:")),
      ),
    ];
    return {
      caseId: fixture.caseId,
      title: fixture.title,
      category: fixture.category,
      generationSpec,
      providerProfiles,
      runtimeRubric: fixture.runtimeRubric,
      checks,
      passed: checks.every((item) => item.passed),
    };
  });

  const failedCaseIds = [...referenceCases, ...candidateCases]
    .filter((fixture) => !fixture.passed)
    .map((fixture) => fixture.caseId);
  return {
    schemaVersion: 1,
    suiteId: suite.suiteId,
    productionBaseline: {
      candidateSpecVersion: CANDIDATE_GENERATION_SPEC_VERSION,
      candidatePurpose: "shot_clean_plate",
      candidateProviderPromptSource: "positivePrompt",
      negativePromptDelivery: "embedded_constraints",
    },
    referenceCases,
    candidateCases,
    summary: {
      referenceCaseCount: referenceCases.length,
      candidateCaseCount: candidateCases.length,
      providerProfileCount: candidateCases.reduce((total, item) => total + item.providerProfiles.length, 0),
      runtimeImageCountWhenAuthorized: candidateCases.reduce(
        (total, item) => total + item.runtimeRubric.variantsPerProvider * suite.providers.length,
        0,
      ),
      failedCaseIds,
      passed: failedCaseIds.length === 0,
    },
  };
}

function textChecks(prompt: string, expected: PromptExpectation): ImagePromptBaselineCheck[] {
  return [
    ...expected.mustContain.map((fragment) => check(`contains:${fragment}`, true, prompt.includes(fragment))),
    ...expected.mustNotContain.map((fragment) => check(`excludes:${fragment}`, false, prompt.includes(fragment))),
  ];
}

function check(id: string, expected: unknown, actual: unknown): ImagePromptBaselineCheck {
  return { id, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual) };
}

function expectation(value: unknown, path: string): PromptExpectation {
  const row = record(value, path);
  return {
    mustContain: stringArray(row.mustContain, `${path}.mustContain`),
    mustNotContain: stringArray(row.mustNotContain, `${path}.mustNotContain`),
  };
}

function parseScene(value: unknown, path: string): NonNullable<ReferencePromptCase["scene"]> {
  const row = record(value, path);
  return {
    name: text(row.name, `${path}.name`),
    location: text(row.location, `${path}.location`),
    timeOfDay: text(row.timeOfDay, `${path}.timeOfDay`),
    atmosphere: text(row.atmosphere, `${path}.atmosphere`),
    purpose: text(row.purpose, `${path}.purpose`),
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`IMAGE_PROMPT_BASELINE_OBJECT_REQUIRED:${path}`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`IMAGE_PROMPT_BASELINE_ARRAY_REQUIRED:${path}`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`IMAGE_PROMPT_BASELINE_TEXT_REQUIRED:${path}`);
  }
  return value.trim();
}

function integer(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`IMAGE_PROMPT_BASELINE_POSITIVE_INTEGER_REQUIRED:${path}`);
  }
  return Number(value);
}
