import type {
  ProjectCharacterEntityType,
  StoryboardJson,
  StoryStructureJson,
} from "@airoaming/shared";
import {
  readOpenCodeSkillJsonReference,
  readOpenCodeSkillReference,
  renderOpenCodePromptTemplate,
} from "../ai-runtime/opencode-skill-asset.util.js";
import { findCandidateVisualIssues } from "../projects/candidate-visual-quality.util.js";
import { extractJsonPayload } from "./dialogue-json.util.js";
import { getErrorMessage } from "./dialogue-text.util.js";

interface StoryboardVisualBriefRow {
  order: number;
  visualDescription: string;
  action: string;
  composition: string;
  promptDraft: string;
}

interface StoryboardVisualBriefOutput {
  shots: StoryboardVisualBriefRow[];
}

export interface StoryboardVisualBriefInput {
  storyboard: StoryboardJson;
  structure: StoryStructureJson;
  comicFormat?: string | null;
  artStyle?: string | null;
}

export interface EnrichStoryboardVisualBriefInput extends StoryboardVisualBriefInput {
  send: (content: string) => Promise<string>;
  validate?: (storyboard: StoryboardJson) => void;
}

export class StoryboardVisualBriefError extends Error {
  readonly code = "STORYBOARD_VISUAL_BRIEF_FAILED";

  constructor(readonly issues: readonly string[]) {
    super(`候选图画面说明未通过校验：${issues.join("、")}`);
    this.name = "StoryboardVisualBriefError";
  }
}

const SKILL_NAME = "storyboard-shot-generate";
const ROOT_KEYS = new Set(["shots"]);
const SHOT_KEYS = new Set(["order", "visualDescription", "action", "composition", "promptDraft"]);
const FIELD_LIMITS: Record<Exclude<keyof StoryboardVisualBriefRow, "order">, { min: number; max: number }> = {
  visualDescription: { min: 30, max: 500 },
  action: { min: 12, max: 300 },
  composition: { min: 12, max: 300 },
  promptDraft: { min: 20, max: 500 },
};

/**
 * 分镜骨架通过固定质量门后，统一编译章节级候选图画面说明 Prompt。
 * 创作规则只存在于 storyboard-shot-generate Skill reference 中。
 */
export function buildStoryboardVisualBriefPrompt(input: StoryboardVisualBriefInput): string {
  const example = readOpenCodeSkillJsonReference<StoryboardVisualBriefOutput>(
    SKILL_NAME,
    "visual-brief-example.json",
  );
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(SKILL_NAME, "visual-brief-prompt.md"),
    {
      COMIC_FORMAT: input.comicFormat?.trim() || "未指定",
      ART_STYLE: input.artStyle?.trim() || "未指定",
      SHOT_VISUAL_CONSTRAINTS_JSON: JSON.stringify(compactShotVisualConstraints(input.storyboard, input.structure), null, 2),
      STRUCTURE_CONTEXT_JSON: JSON.stringify(compactStructureContext(input.structure), null, 2),
      FROZEN_STORYBOARD_JSON: JSON.stringify(compactFrozenStoryboard(input.storyboard), null, 2),
      OUTPUT_EXAMPLE_JSON: JSON.stringify(example, null, 2),
    },
  );
}

export function buildStoryboardVisualBriefRepairPrompt(input: {
  originalPrompt: string;
  invalidOutput: string;
  validationError: string;
}): string {
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(SKILL_NAME, "visual-brief-repair-prompt.md"),
    {
      ORIGINAL_PROMPT: input.originalPrompt,
      INVALID_OUTPUT: input.invalidOutput,
      VALIDATION_ERROR: input.validationError,
    },
  );
}

/**
 * 严格解析章节级整理结果，并且只覆盖四个候选图说明字段。
 * 镜头数量、顺序、剧情锚点、角色绑定、对白和 motion 均由构造方式冻结。
 */
export function parseAndApplyStoryboardVisualBrief(
  content: string,
  input: StoryboardVisualBriefInput,
): StoryboardJson {
  const value = JSON.parse(extractJsonPayload(content)) as unknown;
  const output = parseVisualBriefOutput(value, input.storyboard);
  const rowsByOrder = new Map(output.shots.map((row) => [row.order, row]));
  const characterIndex = buildCharacterIndex(input.structure);
  const allCharacters = input.structure.characters.map((character) => ({
    name: character.name,
    entityType: normalizeEntityType(character.entityType),
  }));
  const qualityIssues: string[] = [];

  input.storyboard.shots.forEach((shot, index) => {
    const row = rowsByOrder.get(shot.order)!;
    const resolvedCharacters = shot.characterIds.map((id) => ({ id, character: characterIndex.get(id) }));
    resolvedCharacters.forEach(({ id, character }) => {
      if (!character) qualityIssues.push(`VISUAL_BRIEF_CHARACTER_REFERENCE_UNRESOLVED:shots[${index}]:${id}`);
    });
    const characters = resolvedCharacters
      .map(({ character }) => character)
      .filter((character): character is { name: string; entityType: ProjectCharacterEntityType } => Boolean(character));
    const combined = [row.visualDescription, row.action, row.composition, row.promptDraft].join("\n");
    const visibleCharacters = characters.filter((character) => character.entityType !== "voice");
    const individuals = visibleCharacters.filter((character) => character.entityType !== "group");
    const collectives = visibleCharacters.filter((character) => character.entityType === "group");

    if (
      individuals.length >= 2
      && collectives.length === 0
      && individuals.every((character) => character.entityType === "human")
      && !hasExactSubjectCount(row.visualDescription, individuals.length)
    ) {
      qualityIssues.push(`VISUAL_BRIEF_SUBJECT_COUNT_MISSING:shots[${index}]:${individuals.length}`);
    }

    visibleCharacters.forEach((character) => {
      if (!combined.includes(character.name)) {
        qualityIssues.push(`VISUAL_BRIEF_BOUND_CHARACTER_MISSING:shots[${index}]:${character.name}`);
      }
    });
    const boundNames = new Set(visibleCharacters.map((character) => character.name));
    allCharacters.forEach((character) => {
      if (
        character.entityType !== "voice"
        && character.name.length >= 2
        && !boundNames.has(character.name)
        && combined.includes(character.name)
      ) {
        qualityIssues.push(`VISUAL_BRIEF_UNBOUND_CHARACTER_ADDED:shots[${index}]:${character.name}`);
      }
    });

    findCandidateVisualIssues({
      visualDescription: row.visualDescription,
      action: row.action,
      composition: row.composition,
      characters,
    }).forEach((issue) => {
      qualityIssues.push(`VISUAL_BRIEF_${issue.code}:shots[${index}]`);
    });
  });

  if (qualityIssues.length > 0) {
    throw new StoryboardVisualBriefError([...new Set(qualityIssues)]);
  }

  return {
    ...input.storyboard,
    shots: input.storyboard.shots.map((shot) => {
      const row = rowsByOrder.get(shot.order)!;
      return {
        ...shot,
        coreAction: row.action,
        comic: {
          ...shot.comic,
          panelDescription: row.visualDescription,
          composition: row.composition,
        },
        promptDraft: row.promptDraft,
      };
    }),
  };
}

/** 一次章节级整理；固定门失败时整章只自动返修一次。 */
export async function enrichStoryboardVisualBrief(
  input: EnrichStoryboardVisualBriefInput,
): Promise<StoryboardJson> {
  const prompt = buildStoryboardVisualBriefPrompt(input);
  const firstOutput = await input.send(prompt);
  const validate = (content: string): StoryboardJson => {
    const storyboard = parseAndApplyStoryboardVisualBrief(content, input);
    input.validate?.(storyboard);
    return storyboard;
  };

  try {
    return validate(firstOutput);
  } catch (error) {
    const repairedOutput = await input.send(buildStoryboardVisualBriefRepairPrompt({
      originalPrompt: prompt,
      invalidOutput: firstOutput,
      validationError: getErrorMessage(error),
    }));
    return validate(repairedOutput);
  }
}

function parseVisualBriefOutput(value: unknown, storyboard: StoryboardJson): StoryboardVisualBriefOutput {
  const issues: string[] = [];
  const root = strictRecord(value, "visualBrief", ROOT_KEYS, issues);
  const shotsValue = root.shots;
  const rows: StoryboardVisualBriefRow[] = [];
  if (!Array.isArray(shotsValue)) {
    issues.push("VISUAL_BRIEF_SHOTS_ARRAY_REQUIRED");
  } else {
    if (shotsValue.length !== storyboard.shots.length) {
      issues.push(`VISUAL_BRIEF_SHOT_COUNT_MISMATCH:${shotsValue.length}:${storyboard.shots.length}`);
    }
    shotsValue.forEach((value, index) => {
      const path = `shots[${index}]`;
      const row = strictRecord(value, path, SHOT_KEYS, issues);
      const order = row.order;
      if (!Number.isInteger(order)) issues.push(`VISUAL_BRIEF_ORDER_INVALID:${path}`);
      rows.push({
        order: Number.isInteger(order) ? Number(order) : 0,
        visualDescription: strictText(row.visualDescription, "visualDescription", path, issues),
        action: strictText(row.action, "action", path, issues),
        composition: strictText(row.composition, "composition", path, issues),
        promptDraft: strictText(row.promptDraft, "promptDraft", path, issues),
      });
    });
  }

  const expectedOrders = storyboard.shots.map((shot) => shot.order);
  const actualOrders = rows.map((row) => row.order);
  if (new Set(actualOrders).size !== actualOrders.length) issues.push("VISUAL_BRIEF_ORDER_DUPLICATE");
  if (
    expectedOrders.length !== actualOrders.length
    || expectedOrders.some((order, index) => order !== actualOrders[index])
  ) {
    issues.push(`VISUAL_BRIEF_ORDER_MISMATCH:${actualOrders.join(",")}:${expectedOrders.join(",")}`);
  }

  if (issues.length > 0) throw new StoryboardVisualBriefError([...new Set(issues)]);
  return { shots: rows };
}

function strictRecord(
  value: unknown,
  path: string,
  allowedKeys: ReadonlySet<string>,
  issues: string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push(`VISUAL_BRIEF_OBJECT_REQUIRED:${path}`);
    return {};
  }
  const row = value as Record<string, unknown>;
  const extraKeys = Object.keys(row).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) issues.push(`VISUAL_BRIEF_EXTRA_KEYS:${path}:${extraKeys.join(",")}`);
  allowedKeys.forEach((key) => {
    if (!(key in row)) issues.push(`VISUAL_BRIEF_FIELD_MISSING:${path}.${key}`);
  });
  return row;
}

function strictText(
  value: unknown,
  key: Exclude<keyof StoryboardVisualBriefRow, "order">,
  path: string,
  issues: string[],
): string {
  if (typeof value !== "string") {
    issues.push(`VISUAL_BRIEF_STRING_REQUIRED:${path}.${key}`);
    return "";
  }
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  const limits = FIELD_LIMITS[key];
  if (length < limits.min) issues.push(`VISUAL_BRIEF_TEXT_TOO_SHORT:${path}.${key}:${length}`);
  if (length > limits.max) issues.push(`VISUAL_BRIEF_TEXT_TOO_LONG:${path}.${key}:${length}`);
  return normalized;
}

function compactStructureContext(structure: StoryStructureJson): Record<string, unknown> {
  return {
    chapterId: structure.chapterId,
    chapterTitle: structure.chapterTitle,
    characters: structure.characters.map((character) => ({
      id: character.id,
      projectCharacterId: character.projectCharacterId ?? null,
      name: character.name,
      entityType: character.entityType,
      visualTraits: character.visualTraits,
    })),
    scenes: structure.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      atmosphere: scene.atmosphere,
    })),
    beats: structure.beats.map((beat) => ({
      id: beat.id,
      order: beat.order,
      title: beat.title,
      summary: beat.summary,
      characters: beat.characters,
      sceneId: beat.sceneId,
      visualFocus: beat.visualFocus,
      outcome: beat.outcome,
    })),
  };
}

function compactFrozenStoryboard(storyboard: StoryboardJson): Record<string, unknown> {
  return {
    chapterId: storyboard.chapterId,
    shots: storyboard.shots.map((shot) => ({
      order: shot.order,
      beatId: shot.beatId,
      sceneId: shot.sceneId,
      characterIds: shot.characterIds,
      emotion: shot.emotion,
      shotType: shot.shotType,
      cameraAngle: shot.cameraAngle,
      current: {
        visualDescription: shot.comic.panelDescription,
        action: shot.coreAction,
        composition: shot.comic.composition,
        promptDraft: shot.promptDraft,
        dialogueContextOnly: shot.comic.dialogue,
      },
    })),
  };
}

/**
 * 把需要精确执行的多人/群体约束逐镜编译出来，避免让模型从整章角色表反推。
 * 只提供中性群体范围示例，不在原事实没有数量时虚构精确人数。
 */
function compactShotVisualConstraints(
  storyboard: StoryboardJson,
  structure: StoryStructureJson,
): Array<Record<string, unknown>> {
  const characterIndex = buildCharacterIndex(structure);
  return storyboard.shots.flatMap((shot) => {
    const visibleCharacters = shot.characterIds
      .map((id) => characterIndex.get(id))
      .filter((character): character is { name: string; entityType: ProjectCharacterEntityType } => (
        Boolean(character) && character?.entityType !== "voice"
      ));
    const collectives = visibleCharacters.filter((character) => character.entityType === "group");
    const individuals = visibleCharacters.filter((character) => character.entityType !== "group");
    const humanCount = individuals.filter((character) => character.entityType === "human").length;
    if (collectives.length === 0 && humanCount < 2) return [];
    return [{
      order: shot.order,
      ...(collectives.length === 0 ? { requiredHumanTotal: humanCount } : {}),
      ...(collectives.length > 0
        ? {
            requiredCollectiveRanges: collectives.map((character) => ({
              groupName: character.name,
              neutralRangeExample: `一群${character.name}`,
            })),
          }
        : {}),
    }];
  });
}

function buildCharacterIndex(
  structure: StoryStructureJson,
): Map<string, { name: string; entityType: ProjectCharacterEntityType }> {
  const result = new Map<string, { name: string; entityType: ProjectCharacterEntityType }>();
  structure.characters.forEach((character) => {
    const value = { name: character.name, entityType: normalizeEntityType(character.entityType) };
    result.set(character.id, value);
    if (character.projectCharacterId) result.set(character.projectCharacterId, value);
  });
  return result;
}

function normalizeEntityType(value: unknown): ProjectCharacterEntityType {
  return value === "voice" || value === "group" || value === "creature"
    ? value
    : "human";
}

function hasExactSubjectCount(value: string, count: number): boolean {
  const chinese = countToChinese(count);
  const tokens = count === 2
    ? [String(count), "二", "两"]
    : chinese ? [String(count), chinese] : [String(count)];
  return new RegExp(`(?:${tokens.join("|")})\\s*(?:人|名|个(?:人|人物|角色))`, "u").test(value);
}

function countToChinese(value: number): string | null {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value >= 1 && value <= 9) return digits[value] ?? null;
  if (value === 10) return "十";
  if (value > 10 && value < 20) return `十${digits[value - 10]}`;
  if (value >= 20 && value < 100) {
    const tens = digits[Math.floor(value / 10)];
    const ones = value % 10 === 0 ? "" : digits[value % 10];
    return `${tens}十${ones}`;
  }
  return null;
}
