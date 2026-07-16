import {
  parseChapterScriptMarkdownV1,
  type ChapterScriptDocumentV1,
  type ScriptInspirationSeed,
  type ScriptOutlineChapterCardV1,
  type ScriptOutlineDocumentV1,
} from "@airoaming/shared";

export type ScriptCreativeQualityGate = "P1" | "P2" | "P3/P5" | "P4" | "P5";

export class ScriptCreativeQualityError extends Error {
  readonly code = "SCRIPT_CREATIVE_QUALITY_FAILED";

  constructor(
    readonly gate: ScriptCreativeQualityGate,
    readonly issues: readonly string[],
  ) {
    super(`${gate} 质量门未通过：${issues.join("、")}`);
    this.name = "ScriptCreativeQualityError";
  }
}

function semanticKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function repeatedValues(values: readonly string[]): boolean {
  const normalized = values.map(semanticKey);
  return new Set(normalized).size !== normalized.length;
}

const MISSING_SCENE_VALUES = new Set(["无", "无内容", "无动作", "未写", "省略", "略"]);
const GENERIC_SCENE_ENDINGS = new Set(["无", "结束", "场景结束", "本场结束", "转入下一场", "进入下一场", "继续", "待续"]);
const SEMANTIC_BIGRAM_STOP_WORDS = new Set([
  "一个", "一些", "已经", "开始", "继续", "然后", "但是", "因此", "所以", "必须", "需要", "为了", "通过",
  "本章", "章节", "场景", "剧情", "人物", "正文", "正式", "上一", "下一", "结尾", "引子", "悬念", "什么", "为何", "如何",
]);

function semanticBigrams(value: string, excludedNames: readonly string[] = []): Set<string> {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, " ");
  const result = new Set<string>();
  for (const run of normalized.match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? []) {
    if (/^[a-z0-9]+$/.test(run)) {
      if (run.length >= 3) result.add(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      const bigram = run.slice(index, index + 2);
      if (!SEMANTIC_BIGRAM_STOP_WORDS.has(bigram)) result.add(bigram);
    }
  }
  for (const name of excludedNames) {
    const normalizedName = semanticKey(name);
    for (let index = 0; index < normalizedName.length - 1; index += 1) {
      result.delete(normalizedName.slice(index, index + 2));
    }
  }
  return result;
}

function hasSemanticOverlap(expected: string, actual: string, excludedNames: readonly string[]): boolean {
  const expectedUnits = semanticBigrams(expected, excludedNames);
  if (expectedUnits.size === 0) return true;
  const actualUnits = semanticBigrams(actual, excludedNames);
  return [...expectedUnits].some((unit) => actualUnits.has(unit));
}

function mainCharacterNames(entries: readonly string[]): string[] {
  return entries
    .map((entry) => entry.split(/[（(:：]/, 1)[0]?.trim() ?? "")
    .filter(Boolean);
}

function meaningfulRepeatedValues(values: readonly string[]): boolean {
  const normalized = values
    .map(semanticKey)
    .filter((value) => value.length >= 4 && !MISSING_SCENE_VALUES.has(value));
  return new Set(normalized).size !== normalized.length;
}

function chapterSceneText(document: ChapterScriptDocumentV1): string {
  return document.scenes.flatMap((scene) => [
    scene.name,
    scene.location,
    scene.characters,
    scene.description,
    scene.actions,
    scene.dialogue,
    scene.narration,
    scene.endingPoint,
  ]).join("\n");
}

function previousEndingAnchors(sourceText: string): string {
  try {
    const previous = parseChapterScriptMarkdownV1(sourceText);
    return [
      previous.scenes.at(-1)?.endingPoint ?? "",
      previous.endingEvent,
      previous.suspense,
      previous.nextChapterLead,
    ].join("\n");
  } catch {
    return sourceText.slice(-800);
  }
}

function chapterCharacterNames(...documents: readonly ChapterScriptDocumentV1[]): string[] {
  return [...new Set(documents.flatMap((document) => document.scenes.flatMap((scene) =>
    scene.characters.split(/[、，,；;\s]+/u).map((name) => name.trim()).filter(Boolean),
  )))];
}

export function assertP5RevisionContinuity(
  source: ChapterScriptDocumentV1,
  revised: ChapterScriptDocumentV1,
  previousScriptSourceText: string,
): void {
  const names = chapterCharacterNames(source, revised);
  const anchorUnits = semanticBigrams(previousEndingAnchors(previousScriptSourceText), names);
  if (anchorUnits.size < 2) return;
  const sourceEvidence = [chapterSceneText(source), source.endingEvent, source.suspense, source.nextChapterLead].join("\n");
  const sourceUnits = semanticBigrams(sourceEvidence, names);
  if ([...anchorUnits].filter((unit) => sourceUnits.has(unit)).length < 2) return;
  const revisedEvidence = [chapterSceneText(revised), revised.endingEvent, revised.suspense, revised.nextChapterLead].join("\n");
  const revisedUnits = semanticBigrams(revisedEvidence, names);
  if ([...anchorUnits].filter((unit) => revisedUnits.has(unit)).length < 2) {
    throw new ScriptCreativeQualityError("P5", ["P5_PREVIOUS_ENDING_REGRESSED"]);
  }
}

export interface ChapterDraftQualityContext {
  targetCard: ScriptOutlineChapterCardV1;
  mainCharacters: readonly string[];
  previousScriptSourceText?: string | null;
}

export function assertP3P5ChapterDraftQuality(
  document: ChapterScriptDocumentV1,
  context: ChapterDraftQualityContext,
): void {
  const issues: string[] = [];
  for (const scene of document.scenes) {
    if (MISSING_SCENE_VALUES.has(semanticKey(scene.description))) issues.push(`P3_SCENE_DESCRIPTION_MISSING:scene-${scene.order}`);
    if (MISSING_SCENE_VALUES.has(semanticKey(scene.actions))) issues.push(`P3_SCENE_ACTIONS_MISSING:scene-${scene.order}`);
    if (GENERIC_SCENE_ENDINGS.has(semanticKey(scene.endingPoint))) issues.push(`P3_SCENE_ENDING_GENERIC:scene-${scene.order}`);
  }
  if (document.scenes.length > 1) {
    const repeatedFields: Array<[keyof Pick<ChapterScriptDocumentV1["scenes"][number], "description" | "actions" | "dialogue" | "endingPoint">, string]> = [
      ["description", "P3_SCENE_DESCRIPTION_REPEATED"],
      ["actions", "P3_SCENE_ACTIONS_REPEATED"],
      ["dialogue", "P3_SCENE_DIALOGUE_REPEATED"],
      ["endingPoint", "P3_SCENE_ENDING_REPEATED"],
    ];
    for (const [field, code] of repeatedFields) {
      if (meaningfulRepeatedValues(document.scenes.map((scene) => scene[field]))) issues.push(code);
    }
  }

  const names = mainCharacterNames(context.mainCharacters);
  const body = chapterSceneText(document);
  const observability: Array<[string, string]> = [
    [context.targetCard.chapterGoal, "P3_CHAPTER_GOAL_NOT_OBSERVABLE"],
    [context.targetCard.coreConflict, "P3_CORE_CONFLICT_NOT_OBSERVABLE"],
    [context.targetCard.majorTurn, "P3_MAJOR_TURN_NOT_OBSERVABLE"],
    [context.targetCard.endingHook, "P3_ENDING_HOOK_NOT_OBSERVABLE"],
  ];
  for (const [expected, code] of observability) {
    if (!hasSemanticOverlap(expected, body, names)) issues.push(code);
  }

  if (context.previousScriptSourceText) {
    const anchors = previousEndingAnchors(context.previousScriptSourceText);
    const anchorUnits = semanticBigrams(anchors, names);
    if (anchorUnits.size > 0) {
      const current = [body, document.endingEvent, document.suspense, document.nextChapterLead].join("\n");
      const currentUnits = semanticBigrams(current, names);
      if (![...anchorUnits].some((unit) => currentUnits.has(unit))) issues.push("P5_PREVIOUS_ENDING_NOT_CARRIED");
    }
  }

  if (issues.length > 0) throw new ScriptCreativeQualityError("P3/P5", issues);
}

export function assertP1InspirationQuality(seeds: readonly ScriptInspirationSeed[]): void {
  const fields: Array<[keyof Pick<ScriptInspirationSeed, "logline" | "keyConflict" | "visualHook" | "firstChapterDirection">, string]> = [
    ["logline", "P1_LOGLINE_NOT_DISTINCT"],
    ["keyConflict", "P1_CONFLICT_ENGINE_NOT_DISTINCT"],
    ["visualHook", "P1_VISUAL_PROMISE_NOT_DISTINCT"],
    ["firstChapterDirection", "P1_FIRST_CHAPTER_DIRECTION_NOT_DISTINCT"],
  ];
  const issues = fields
    .filter(([field]) => repeatedValues(seeds.map((seed) => seed[field])))
    .map(([, code]) => code);
  if (issues.length > 0) throw new ScriptCreativeQualityError("P1", issues);
}

const TURN_CONNECTOR = /(但是|可是|却|然而|不过|偏偏|反而)/;
const CONSEQUENCE_CONNECTOR = /(因此|所以|于是|导致|迫使|从而|以致|必须|不得不)/;
const TERMINAL_BRIDGE = /(终章|收束|结束|完结|落幕|全剧终)/;
const VAGUE_ENDINGS = new Set([
  "开放式结局",
  "开放结局",
  "待定",
  "未定",
  "保留悬念",
  "故事结束",
  "圆满结局",
  "悲剧结局",
]);

export function assertP2OutlineQuality(outline: ScriptOutlineDocumentV1): void {
  const issues: string[] = [];
  const causalText = [outline.synopsis, ...outline.plotStages].join("\n");
  if (!TURN_CONNECTOR.test(causalText)) issues.push("P2_TURN_CONNECTOR_MISSING");
  if (!CONSEQUENCE_CONNECTOR.test(causalText)) issues.push("P2_CONSEQUENCE_CONNECTOR_MISSING");
  if (VAGUE_ENDINGS.has(semanticKey(outline.endingDirection))) issues.push("P2_ENDING_DIRECTION_VAGUE");

  const fields: Array<[keyof Pick<ScriptOutlineDocumentV1["chapterCards"][number], "chapterGoal" | "coreConflict" | "majorTurn" | "endingHook" | "nextChapterBridge">, string]> = [
    ["chapterGoal", "P2_CHAPTER_GOAL_REPEATED"],
    ["coreConflict", "P2_CORE_CONFLICT_REPEATED"],
    ["majorTurn", "P2_MAJOR_TURN_REPEATED"],
    ["endingHook", "P2_ENDING_HOOK_REPEATED"],
    ["nextChapterBridge", "P2_NEXT_BRIDGE_REPEATED"],
  ];
  for (const [field, code] of fields) {
    if (outline.chapterCards.length > 1 && repeatedValues(outline.chapterCards.map((card) => card[field]))) {
      issues.push(code);
    }
  }

  const finalCard = outline.chapterCards.at(-1);
  if (finalCard && !TERMINAL_BRIDGE.test(finalCard.nextChapterBridge)) {
    issues.push("P2_FINAL_BRIDGE_NOT_TERMINAL");
  }
  for (const card of outline.chapterCards.slice(0, -1)) {
    if (TERMINAL_BRIDGE.test(card.nextChapterBridge)) {
      issues.push(`P2_NON_FINAL_BRIDGE_TERMINAL:chapter-${card.order}`);
    }
  }

  if (issues.length > 0) throw new ScriptCreativeQualityError("P2", issues);
}
