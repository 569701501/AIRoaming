import type {
  CandidateVisualIssue,
  ProjectCharacterEntityType,
} from "@airoaming/shared";
import {
  readOpenCodeSkillJsonReference,
  readOpenCodeSkillReference,
  renderOpenCodePromptTemplate,
} from "../ai-runtime/opencode-skill-asset.util.js";
import {
  findCandidateVisualIssues,
  type CandidateVisualQualityCharacter,
} from "./candidate-visual-quality.util.js";

const SKILL_NAME = "shot-prompt-optimize";
const ALLOWED_KEYS = new Set(["visualDescription", "action", "composition", "mustShow", "warnings"]);
const MAX_FIELD_LENGTH = 1_200;

export interface ShotPromptOptimizationWarning {
  readonly code: "SOURCE_CONFLICT";
  readonly message: string;
}

export interface ShotPromptOptimizationResult {
  readonly visualDescription: string;
  readonly action: string;
  readonly composition: string;
  readonly mustShow: readonly string[];
  readonly warnings: readonly ShotPromptOptimizationWarning[];
  readonly visualIssues: readonly CandidateVisualIssue[];
}

export interface ShotPromptOptimizationCharacter {
  readonly name: string;
  readonly entityType: ProjectCharacterEntityType;
}

export function buildShotPromptOptimizationPrompt(input: {
  promptSpec: Record<string, unknown>;
  visualIssues?: readonly CandidateVisualIssue[];
  instruction?: string | null;
}): string {
  const example = readOpenCodeSkillJsonReference<Record<string, unknown>>(
    SKILL_NAME,
    "optimization-example.json",
  );
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(SKILL_NAME, "optimize-prompt.md"),
    {
      OUTPUT_EXAMPLE_JSON: JSON.stringify(example, null, 2),
      PROMPT_SPEC_JSON: JSON.stringify(promptFacts(input.promptSpec), null, 2),
      VISUAL_ISSUES_JSON: JSON.stringify(input.visualIssues ?? [], null, 2),
      USER_INSTRUCTION: input.instruction?.trim() || "请在不改变正式事实的前提下，让画面更清楚、自然、可直接入画。",
    },
  );
}

export function buildShotPromptOptimizationRepairPrompt(input: {
  originalPrompt: string;
  invalidOutput: string;
  validationError: string;
}): string {
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(SKILL_NAME, "repair-prompt.md"),
    {
      ORIGINAL_PROMPT: input.originalPrompt,
      INVALID_OUTPUT: input.invalidOutput,
      VALIDATION_ERROR: input.validationError,
    },
  );
}

export function parseShotPromptOptimizationOutput(
  content: string,
  characters: readonly ShotPromptOptimizationCharacter[],
): ShotPromptOptimizationResult {
  const value = parseJsonObject(content);
  const unknownKeys = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) throw new TypeError(`SHOT_PROMPT_OPTIMIZATION_UNKNOWN_FIELDS:${unknownKeys.join(",")}`);
  const visualDescription = requiredText(value.visualDescription, "visualDescription");
  const action = requiredText(value.action, "action");
  const composition = requiredText(value.composition, "composition");
  const mustShow = stringArray(value.mustShow, "mustShow", 8);
  const warnings = warningArray(value.warnings);
  const qualityCharacters: CandidateVisualQualityCharacter[] = characters.map((character) => ({
    name: character.name,
    entityType: character.entityType,
  }));
  const visualIssues = findCandidateVisualIssues({
    visualDescription,
    action,
    composition,
    characters: qualityCharacters,
  });
  const repairableBlocking = visualIssues.filter((issue) =>
    issue.severity === "blocking"
    && issue.code !== "VISUAL_GROUP_COUNT_MISSING",
  );
  if (repairableBlocking.length > 0) {
    throw new TypeError(`SHOT_PROMPT_OPTIMIZATION_VISUAL_QUALITY:${repairableBlocking.map((issue) => issue.code).join(",")}`);
  }
  if (visualIssues.some((issue) => issue.code === "VISUAL_GROUP_COUNT_MISSING") && warnings.length === 0) {
    throw new TypeError("SHOT_PROMPT_OPTIMIZATION_GROUP_COUNT_WARNING_REQUIRED");
  }
  return { visualDescription, action, composition, mustShow, warnings, visualIssues };
}

function promptFacts(spec: Record<string, unknown>): Record<string, unknown> {
  return {
    shotId: spec.shotId,
    sections: Array.isArray(spec.sections) ? spec.sections : [],
    systemConstraints: Array.isArray(spec.systemConstraints) ? spec.systemConstraints : [],
    visualContext: isRecord(spec.visualContext) ? spec.visualContext : {},
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? content).trim();
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) throw new TypeError("SHOT_PROMPT_OPTIMIZATION_JSON_REQUIRED");
    value = JSON.parse(candidate.slice(start, end + 1));
  }
  if (!isRecord(value)) throw new TypeError("SHOT_PROMPT_OPTIMIZATION_OBJECT_REQUIRED");
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`SHOT_PROMPT_OPTIMIZATION_TEXT_REQUIRED:${field}`);
  const normalized = value.trim();
  if (normalized.length > MAX_FIELD_LENGTH) throw new TypeError(`SHOT_PROMPT_OPTIMIZATION_TEXT_TOO_LONG:${field}`);
  return normalized;
}

function stringArray(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`SHOT_PROMPT_OPTIMIZATION_STRING_ARRAY_INVALID:${field}`);
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}

function warningArray(value: unknown): ShotPromptOptimizationWarning[] {
  if (!Array.isArray(value)) throw new TypeError("SHOT_PROMPT_OPTIMIZATION_WARNINGS_ARRAY_REQUIRED");
  return value.map((item, index) => {
    if (!isRecord(item) || item.code !== "SOURCE_CONFLICT") {
      throw new TypeError(`SHOT_PROMPT_OPTIMIZATION_WARNING_INVALID:warnings[${index}]`);
    }
    return { code: "SOURCE_CONFLICT", message: requiredText(item.message, `warnings[${index}].message`) };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
