import { parseStrictJson } from "./versioning/canonical-json.js";

export const SCRIPT_WORKFLOW_STAGE_IDS = [
  "creative.ideation",
  "creative.outline",
  "creative.chapter-draft",
  "creative.chapter-edit",
  "import.analyze",
  "import.materialize",
  "import.verify",
] as const;

export type ScriptWorkflowStageId = typeof SCRIPT_WORKFLOW_STAGE_IDS[number];

export class ScriptWorkflowContractError extends Error {
  readonly code = "SCRIPT_WORKFLOW_OUTPUT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ScriptWorkflowContractError";
  }
}

function invalid(path: string, message: string): never {
  throw new ScriptWorkflowContractError(`${path}: ${message}`);
}

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    invalid(path, "expected a plain object");
  }
  return value as Record<string, unknown>;
}

function exactObject(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = plainObject(value, path);
  const expected = new Set(keys);
  for (const key of Object.keys(row)) {
    if (!expected.has(key)) invalid(`${path}.${key}`, "unknown field");
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) invalid(`${path}.${key}`, "missing required field");
  }
  return row;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "expected string");
  const result = value.trim();
  if (!result) invalid(path, "must be non-empty");
  return result;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : nonEmptyString(value, path);
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    invalid(path, "expected positive integer");
  }
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "expected array");
  return value;
}

function stringArray(value: unknown, path: string, options: { min?: number; max?: number } = {}): string[] {
  const result = array(value, path).map((item, index) => nonEmptyString(item, `${path}[${index}]`));
  if (options.min !== undefined && result.length < options.min) invalid(path, `expected at least ${options.min} items`);
  if (options.max !== undefined && result.length > options.max) invalid(path, `expected at most ${options.max} items`);
  if (new Set(result).size !== result.length) invalid(path, "duplicate item");
  return result;
}

function jsonInput(input: unknown, path: string): unknown {
  if (typeof input !== "string") return input;
  const source = input.trim();
  if (source.startsWith("```") || source.endsWith("```")) invalid(path, "code fences are not allowed");
  try {
    return parseStrictJson(source);
  } catch (error) {
    invalid(path, error instanceof Error ? error.message : "invalid JSON");
  }
}

function normalizeMarkdown(input: string, path: string): string {
  if (typeof input !== "string") invalid(path, "expected Markdown string");
  const source = input.replace(/\r\n?/g, "\n").trim();
  if (!source) invalid(path, "must be non-empty");
  if (source.startsWith("```") || source.endsWith("```") || /^```/m.test(source)) {
    invalid(path, "code fences are not allowed");
  }
  return source;
}

function assertNoTemplateResidue(value: string, path: string): void {
  if (value.includes("待补充")) invalid(path, "template placeholder 待补充 is not allowed");
  if (value.split("\n").some((line) => /^(?:…{2,}|\.{3,})$/.test(line.trim()))) {
    invalid(path, "standalone ellipsis placeholder is not allowed");
  }
}

// ---------- creative.ideation ----------

export interface CreativeIdeationCandidateV1 {
  title: string;
  genreTags: string[];
  logline: string;
  keyConflict: string;
  visualHook: string;
  firstChapterDirection: string;
}

export interface CreativeIdeationOutputV1 {
  seeds: CreativeIdeationCandidateV1[];
}

export function parseCreativeIdeationOutputV1(input: unknown): CreativeIdeationOutputV1 {
  const row = exactObject(jsonInput(input, "creativeIdeation"), ["seeds"], "creativeIdeation");
  const rawSeeds = array(row.seeds, "creativeIdeation.seeds");
  if (rawSeeds.length !== 3) invalid("creativeIdeation.seeds", "expected exactly 3 items");
  const seeds = rawSeeds.map((item, index): CreativeIdeationCandidateV1 => {
    const path = `creativeIdeation.seeds[${index}]`;
    const seed = exactObject(item, ["title", "genreTags", "logline", "keyConflict", "visualHook", "firstChapterDirection"], path);
    return {
      title: nonEmptyString(seed.title, `${path}.title`),
      genreTags: stringArray(seed.genreTags, `${path}.genreTags`, { min: 2, max: 5 }),
      logline: nonEmptyString(seed.logline, `${path}.logline`),
      keyConflict: nonEmptyString(seed.keyConflict, `${path}.keyConflict`),
      visualHook: nonEmptyString(seed.visualHook, `${path}.visualHook`),
      firstChapterDirection: nonEmptyString(seed.firstChapterDirection, `${path}.firstChapterDirection`),
    };
  });
  const normalizedTitles = seeds.map((seed) => seed.title.toLocaleLowerCase("zh-CN"));
  if (new Set(normalizedTitles).size !== normalizedTitles.length) invalid("creativeIdeation.seeds", "titles must be unique");
  return { seeds };
}

// ---------- creative.outline ----------

export const SCRIPT_OUTLINE_V1_SECTION_HEADINGS = [
  "## 一、基础信息",
  "## 二、主要角色",
  "## 三、情节概要",
  "## 四、章节安排",
] as const;

const OUTLINE_BASIC_FIELDS = ["剧集名称", "题材风格", "剧集篇幅", "剧集章数", "剧情简介"] as const;
const OUTLINE_CHAPTER_FIELDS = ["章节目标", "核心冲突", "关键转折", "结尾钩子", "下一章衔接"] as const;

export interface ScriptOutlineChapterCardV1 {
  order: number;
  title: string;
  chapterGoal: string;
  coreConflict: string;
  majorTurn: string;
  endingHook: string;
  nextChapterBridge: string;
}

export interface ScriptOutlineDocumentV1 {
  title: string;
  genreStyle: string;
  episodeLength: string;
  chapterCount: number;
  synopsis: string;
  mainCharacters: string[];
  plotStages: string[];
  endingDirection: string;
  chapterCards: ScriptOutlineChapterCardV1[];
}

function splitExactMarkdownSections(source: string, rootHeading: string, headings: readonly string[], path: string): Map<string, string[]> {
  const lines = source.split("\n");
  const firstNonEmpty = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmpty < 0 || lines[firstNonEmpty]?.trim() !== rootHeading) invalid(path, `expected root heading ${rootHeading}`);
  const rootHeadings = lines.filter((line) => /^#\s+/.test(line.trim()));
  if (rootHeadings.length !== 1) invalid(path, "expected exactly one level-1 root heading");
  const sectionStarts = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line.startsWith("## "));
  if (sectionStarts.length !== headings.length) invalid(path, `expected exactly ${headings.length} level-2 sections`);
  const firstSectionIndex = sectionStarts[0]?.index;
  if (firstSectionIndex === undefined) invalid(path, "missing required sections");
  if (lines.slice(firstNonEmpty + 1, firstSectionIndex).some((line) => line.trim())) invalid(path, "unexpected content before first section");
  sectionStarts.forEach((item, index) => {
    if (item.line !== headings[index]) invalid(`${path}.sections[${index}]`, `expected ${headings[index]}`);
  });
  const result = new Map<string, string[]>();
  sectionStarts.forEach((item, index) => {
    const end = sectionStarts[index + 1]?.index ?? lines.length;
    result.set(item.line, lines.slice(item.index + 1, end));
  });
  return result;
}

function nonBlankLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function parseExactSingleLineFields(lines: readonly string[], labels: readonly string[], path: string): Record<string, string> {
  const values = nonBlankLines(lines);
  if (values.length !== labels.length) invalid(path, `expected exactly ${labels.length} fields`);
  const result: Record<string, string> = {};
  labels.forEach((label, index) => {
    const line = values[index] ?? "";
    const match = line.match(new RegExp(`^${label}[：:]\\s*(.*)$`));
    if (!match) invalid(`${path}.${label}`, `expected field ${label} in fixed order`);
    result[label] = nonEmptyString(match[1], `${path}.${label}`);
  });
  return result;
}

export function parseScriptOutlineMarkdownV1(input: string): ScriptOutlineDocumentV1 {
  const source = normalizeMarkdown(input, "scriptOutline");
  assertNoTemplateResidue(source, "scriptOutline");
  const sections = splitExactMarkdownSections(source, "# 剧本大纲", SCRIPT_OUTLINE_V1_SECTION_HEADINGS, "scriptOutline");
  const basic = parseExactSingleLineFields(sections.get(SCRIPT_OUTLINE_V1_SECTION_HEADINGS[0]) ?? [], OUTLINE_BASIC_FIELDS, "scriptOutline.basicInfo");
  const chapterCountMatch = basic["剧集章数"]?.match(/^(\d+)\s*章$/);
  if (!chapterCountMatch) invalid("scriptOutline.basicInfo.剧集章数", "expected one explicit positive integer like 12 章");
  const chapterCount = Number(chapterCountMatch[1]);
  if (!Number.isSafeInteger(chapterCount) || chapterCount < 1) invalid("scriptOutline.basicInfo.剧集章数", "expected positive safe integer");

  const mainCharacters = nonBlankLines(sections.get(SCRIPT_OUTLINE_V1_SECTION_HEADINGS[1]) ?? []);
  if (mainCharacters.length === 0) invalid("scriptOutline.mainCharacters", "expected at least one character");
  mainCharacters.forEach((line, index) => {
    if (!/^.+[：:].+$/.test(line)) invalid(`scriptOutline.mainCharacters[${index}]`, "expected 角色名（定位）：描述");
  });

  const plotLines = nonBlankLines(sections.get(SCRIPT_OUTLINE_V1_SECTION_HEADINGS[2]) ?? []);
  const endingLines = plotLines.filter((line) => /^结局方向[：:]/.test(line));
  if (endingLines.length !== 1) invalid("scriptOutline.plotSummary", "expected exactly one 结局方向 field");
  const endingDirection = nonEmptyString(endingLines[0]?.replace(/^结局方向[：:]\s*/, ""), "scriptOutline.endingDirection");
  const plotStages = plotLines.filter((line) => !/^结局方向[：:]/.test(line));
  if (plotStages.length === 0) invalid("scriptOutline.plotStages", "expected at least one plot stage");
  plotStages.forEach((line, index) => {
    if (!/^.+[：:].+$/.test(line)) invalid(`scriptOutline.plotStages[${index}]`, "expected labeled plot stage");
  });

  const arrangement = sections.get(SCRIPT_OUTLINE_V1_SECTION_HEADINGS[3]) ?? [];
  const cardStarts = arrangement
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line.startsWith("### "));
  if (cardStarts.length !== chapterCount) invalid("scriptOutline.chapterCards", `expected ${chapterCount} chapter cards`);
  const chapterCards = cardStarts.map((item, index): ScriptOutlineChapterCardV1 => {
    const heading = item.line.match(/^###\s+第\s*(\d+)\s*章[：:]\s*(.+)$/);
    if (!heading) invalid(`scriptOutline.chapterCards[${index}].heading`, "expected ### 第 N 章：章节标题");
    const order = Number(heading[1]);
    if (order !== index + 1) invalid(`scriptOutline.chapterCards[${index}].order`, "chapter order must be contiguous from 1");
    const end = cardStarts[index + 1]?.index ?? arrangement.length;
    const fields = parseExactSingleLineFields(arrangement.slice(item.index + 1, end), OUTLINE_CHAPTER_FIELDS, `scriptOutline.chapterCards[${index}]`);
    return {
      order,
      title: nonEmptyString(heading[2], `scriptOutline.chapterCards[${index}].title`),
      chapterGoal: fields["章节目标"] ?? invalid(`scriptOutline.chapterCards[${index}].chapterGoal`, "missing"),
      coreConflict: fields["核心冲突"] ?? invalid(`scriptOutline.chapterCards[${index}].coreConflict`, "missing"),
      majorTurn: fields["关键转折"] ?? invalid(`scriptOutline.chapterCards[${index}].majorTurn`, "missing"),
      endingHook: fields["结尾钩子"] ?? invalid(`scriptOutline.chapterCards[${index}].endingHook`, "missing"),
      nextChapterBridge: fields["下一章衔接"] ?? invalid(`scriptOutline.chapterCards[${index}].nextChapterBridge`, "missing"),
    };
  });
  if (chapterCards.at(-1)?.order !== chapterCount) invalid("scriptOutline.chapterCards", "maximum chapter order must equal chapter count");
  return {
    title: basic["剧集名称"] ?? invalid("scriptOutline.title", "missing"),
    genreStyle: basic["题材风格"] ?? invalid("scriptOutline.genreStyle", "missing"),
    episodeLength: basic["剧集篇幅"] ?? invalid("scriptOutline.episodeLength", "missing"),
    chapterCount,
    synopsis: basic["剧情简介"] ?? invalid("scriptOutline.synopsis", "missing"),
    mainCharacters,
    plotStages,
    endingDirection,
    chapterCards,
  };
}

export function serializeScriptOutlineMarkdownV1(document: ScriptOutlineDocumentV1): string {
  const source = [
    "# 剧本大纲",
    "",
    "## 一、基础信息",
    `剧集名称：${document.title}`,
    `题材风格：${document.genreStyle}`,
    `剧集篇幅：${document.episodeLength}`,
    `剧集章数：${document.chapterCount} 章`,
    `剧情简介：${document.synopsis}`,
    "",
    "## 二、主要角色",
    ...document.mainCharacters,
    "",
    "## 三、情节概要",
    ...document.plotStages,
    `结局方向：${document.endingDirection}`,
    "",
    "## 四、章节安排",
    "",
    ...document.chapterCards.flatMap((card) => [
      `### 第 ${card.order} 章：${card.title}`,
      `章节目标：${card.chapterGoal}`,
      `核心冲突：${card.coreConflict}`,
      `关键转折：${card.majorTurn}`,
      `结尾钩子：${card.endingHook}`,
      `下一章衔接：${card.nextChapterBridge}`,
      "",
    ]),
  ].join("\n").trimEnd() + "\n";
  parseScriptOutlineMarkdownV1(source);
  return source;
}

// ---------- creative.chapter-draft / creative.chapter-edit / import.materialize ----------

export const CHAPTER_SCRIPT_V1_SECTION_HEADINGS = [
  "### 一、基础方向",
  "### 二、本章方向",
  "### 三、剧本亮点",
  "### 四、视觉基调",
  "### 五、剧本正文",
  "### 六、本章结尾",
] as const;

const CHAPTER_BASIC_FIELDS = ["类型", "主题", "风格", "漫画形式", "目标篇幅"] as const;
const CHAPTER_DIRECTION_FIELDS = ["一句话梗概", "本章目标", "核心冲突", "情绪走向", "结尾钩子"] as const;
const CHAPTER_HIGHLIGHT_FIELDS = ["亮点 1", "亮点 2", "亮点 3"] as const;
const CHAPTER_VISUAL_FIELDS = ["画面氛围", "色调方向", "视觉记忆点"] as const;
const CHAPTER_ENDING_FIELDS = ["结尾事件", "悬念", "下一章引子"] as const;
const SCENE_FIELDS = ["地点", "时间", "氛围", "出场人物", "剧情描写", "人物动作", "对白", "旁白", "场景结束点"] as const;

export interface ChapterScriptSceneV1 {
  order: number;
  name: string;
  location: string;
  time: string;
  atmosphere: string;
  characters: string;
  description: string;
  actions: string;
  dialogue: string;
  narration: string;
  endingPoint: string;
}

export interface ChapterScriptDocumentV1 {
  chapterOrder: number;
  chapterTitle: string;
  type: string;
  theme: string;
  style: string;
  comicForm: string;
  targetLength: string;
  logline: string;
  chapterGoal: string;
  coreConflict: string;
  emotionalArc: string;
  endingHook: string;
  highlights: [string, string, string];
  visualAtmosphere: string;
  colorDirection: string;
  visualMotif: string;
  scenes: ChapterScriptSceneV1[];
  endingEvent: string;
  suspense: string;
  nextChapterLead: string;
}

export interface ParseChapterScriptMarkdownV1Options {
  expectedChapterHeading?: string;
  mode?: "creative" | "import";
  characterRoster?: "legacy" | "strict";
}

export interface ChapterScriptCharacterRosterV1 {
  names: string[];
  annotations: string[];
  malformed: boolean;
}

/**
 * 把场景「出场人物」编译成稳定角色名。
 * 历史正文允许尾部括号说明；括号内的斜杠不是人物分隔符。
 */
export function parseChapterScriptCharacterRosterV1(value: string): ChapterScriptCharacterRosterV1 {
  const tokens: string[] = [];
  let buffer = "";
  let depth = 0;
  let malformed = false;
  const separators = new Set(["、", "，", ",", "；", ";", "/", "／", "\n"]);

  for (const character of value.normalize("NFKC")) {
    if (character === "(") {
      depth += 1;
      buffer += character;
      continue;
    }
    if (character === ")") {
      if (depth === 0) malformed = true;
      else depth -= 1;
      buffer += character;
      continue;
    }
    if (depth === 0 && separators.has(character)) {
      if (buffer.trim()) tokens.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += character;
  }
  if (buffer.trim()) tokens.push(buffer.trim());
  if (depth !== 0) malformed = true;

  const names: string[] = [];
  const annotations: string[] = [];
  for (const token of tokens) {
    let name = token;
    let matchedAnnotation = false;
    while (true) {
      const match = name.match(/^(.*?)\s*\(([^()]*)\)\s*$/u);
      if (!match) break;
      matchedAnnotation = true;
      if (match[2]?.trim()) annotations.unshift(match[2].trim());
      name = (match[1] ?? "").trim();
    }
    if (matchedAnnotation && !name) {
      annotations.push(token);
      continue;
    }
    if (name) names.push(name);
  }

  return {
    names: [...new Set(names)],
    annotations,
    malformed,
  };
}

function assertStrictChapterCharacterRosters(document: ChapterScriptDocumentV1): void {
  document.scenes.forEach((scene, index) => {
    const roster = parseChapterScriptCharacterRosterV1(scene.characters);
    if (roster.malformed || roster.annotations.length > 0) {
      invalid(
        `chapterScript.scenes[${index}].characters`,
        "only character names are allowed; move appearance notes to description, actions, dialogue, or narration",
      );
    }
  });
}

function parseChineseOrdinal(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of value) {
    if (char in digits) {
      number = digits[char] ?? 0;
      continue;
    }
    const unit = units[char];
    if (!unit) return null;
    if (unit === 10000) {
      section += number;
      total += (section || 1) * unit;
      section = 0;
      number = 0;
    } else {
      section += (number || 1) * unit;
      number = 0;
    }
  }
  const result = total + section + number;
  return result > 0 ? result : null;
}

function parseSceneBody(lines: readonly string[], path: string): Record<string, string> {
  const result: Record<string, string> = {};
  let cursor = 0;
  for (let fieldIndex = 0; fieldIndex < SCENE_FIELDS.length; fieldIndex += 1) {
    const label = SCENE_FIELDS[fieldIndex] ?? "";
    while (cursor < lines.length && !lines[cursor]?.trim()) cursor += 1;
    const line = lines[cursor]?.trim() ?? "";
    const match = line.match(new RegExp(`^${label}[：:]\\s*(.*)$`));
    if (!match) invalid(`${path}.${label}`, `expected field ${label} in fixed order`);
    cursor += 1;
    const chunks: string[] = [];
    if (match[1]?.trim()) chunks.push(match[1].trim());
    const nextLabel = SCENE_FIELDS[fieldIndex + 1];
    while (cursor < lines.length) {
      const current = lines[cursor]?.trim() ?? "";
      if (nextLabel && new RegExp(`^${nextLabel}[：:]`).test(current)) break;
      chunks.push(lines[cursor] ?? "");
      cursor += 1;
    }
    const value = chunks.join("\n").trim();
    result[label] = nonEmptyString(value, `${path}.${label}`);
  }
  if (lines.slice(cursor).some((line) => line.trim())) invalid(path, "unexpected content after 场景结束点");
  return result;
}

function assertNoForbiddenChapterArtifacts(source: string): void {
  const forbidden = /^(?:#{1,6}\s*)?(?:主体列表|正式场景列表|剧情节拍|分镜剧本|镜头编号|图片\s*Prompt|StoryStructure|Storyboard|readyForNextStage)(?:[：:]|\s*$)/i;
  source.split("\n").forEach((line, index) => {
    if (forbidden.test(line.trim())) invalid(`chapterScript.lines[${index + 1}]`, "downstream or system output is not allowed");
  });
}

export function parseChapterScriptMarkdownV1(input: string, options: ParseChapterScriptMarkdownV1Options = {}): ChapterScriptDocumentV1 {
  const source = normalizeMarkdown(input, "chapterScript");
  assertNoTemplateResidue(source, "chapterScript");
  assertNoForbiddenChapterArtifacts(source);
  const lines = source.split("\n");
  const nonEmpty = lines.map((line, index) => ({ line: line.trim(), index })).filter((item) => item.line);
  if (nonEmpty[0]?.line !== "# 章节剧本") invalid("chapterScript", "expected root heading # 章节剧本");
  const rootHeadings = nonEmpty.filter((item) => /^#\s+/.test(item.line));
  if (rootHeadings.length !== 1) invalid("chapterScript", "expected exactly one level-1 root heading");
  const chapterHeadings = nonEmpty.filter((item) => /^##\s+/.test(item.line) && !/^###\s+/.test(item.line));
  if (chapterHeadings.length !== 1) invalid("chapterScript.heading", "expected exactly one level-2 chapter heading");
  if (nonEmpty[0]!.index >= chapterHeadings[0]!.index) invalid("chapterScript.heading", "chapter heading must follow root heading");
  if (lines.slice(nonEmpty[0]!.index + 1, chapterHeadings[0]!.index).some((line) => line.trim())) invalid("chapterScript.heading", "unexpected content before chapter heading");
  const chapterHeading = chapterHeadings[0]?.line.replace(/^##\s+/, "") ?? "";
  if (options.expectedChapterHeading && chapterHeading !== options.expectedChapterHeading.trim().replace(/^##\s+/, "")) {
    invalid("chapterScript.heading", `expected ${options.expectedChapterHeading}`);
  }
  const headingMatch = chapterHeading.match(/^第\s*([\d一二三四五六七八九十百千万零〇两]+)\s*章[：:]\s*(.+)$/);
  if (!headingMatch) invalid("chapterScript.heading", "expected 第 N 章：章节标题");
  const chapterOrder = parseChineseOrdinal(headingMatch[1] ?? "");
  if (!chapterOrder) invalid("chapterScript.heading", "invalid chapter order");
  const chapterTitle = nonEmptyString(headingMatch[2], "chapterScript.chapterTitle");

  const sectionStarts = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line.startsWith("### "));
  if (sectionStarts.length !== CHAPTER_SCRIPT_V1_SECTION_HEADINGS.length) {
    invalid("chapterScript.sections", `expected exactly ${CHAPTER_SCRIPT_V1_SECTION_HEADINGS.length} sections`);
  }
  sectionStarts.forEach((item, index) => {
    if (item.line !== CHAPTER_SCRIPT_V1_SECTION_HEADINGS[index]) {
      invalid(`chapterScript.sections[${index}]`, `expected ${CHAPTER_SCRIPT_V1_SECTION_HEADINGS[index]}`);
    }
  });
  if (chapterHeadings[0]!.index >= sectionStarts[0]!.index) invalid("chapterScript.sections", "sections must follow chapter heading");
  if (lines.slice(chapterHeadings[0]!.index + 1, sectionStarts[0]!.index).some((line) => line.trim())) invalid("chapterScript.sections", "unexpected content before first section");
  const sectionBody = (index: number): string[] => {
    const start = sectionStarts[index]?.index;
    if (start === undefined) return [];
    const end = sectionStarts[index + 1]?.index ?? lines.length;
    return lines.slice(start + 1, end);
  };

  const basic = parseExactSingleLineFields(sectionBody(0), CHAPTER_BASIC_FIELDS, "chapterScript.basic");
  const direction = parseExactSingleLineFields(sectionBody(1), CHAPTER_DIRECTION_FIELDS, "chapterScript.direction");
  const highlights = parseExactSingleLineFields(sectionBody(2), CHAPTER_HIGHLIGHT_FIELDS, "chapterScript.highlights");
  const visual = parseExactSingleLineFields(sectionBody(3), CHAPTER_VISUAL_FIELDS, "chapterScript.visual");
  const ending = parseExactSingleLineFields(sectionBody(5), CHAPTER_ENDING_FIELDS, "chapterScript.ending");

  const bodyLines = sectionBody(4);
  const sceneStarts = bodyLines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line.startsWith("#### "));
  if (sceneStarts.length === 0) invalid("chapterScript.scenes", "expected at least one scene");
  const scenes = sceneStarts.map((item, index): ChapterScriptSceneV1 => {
    const heading = item.line.match(/^####\s+场景\s*(\d+)[：:]\s*(.+)$/);
    if (!heading) invalid(`chapterScript.scenes[${index}].heading`, "expected #### 场景 N：场景名");
    const order = Number(heading[1]);
    if (order !== index + 1) invalid(`chapterScript.scenes[${index}].order`, "scene order must be contiguous from 1");
    const end = sceneStarts[index + 1]?.index ?? bodyLines.length;
    const fields = parseSceneBody(bodyLines.slice(item.index + 1, end), `chapterScript.scenes[${index}]`);
    const name = nonEmptyString(heading[2], `chapterScript.scenes[${index}].name`);
    if (name === "场景名") invalid(`chapterScript.scenes[${index}].name`, "template scene name is not allowed");
    return {
      order,
      name,
      location: fields["地点"] ?? invalid(`chapterScript.scenes[${index}].location`, "missing"),
      time: fields["时间"] ?? invalid(`chapterScript.scenes[${index}].time`, "missing"),
      atmosphere: fields["氛围"] ?? invalid(`chapterScript.scenes[${index}].atmosphere`, "missing"),
      characters: fields["出场人物"] ?? invalid(`chapterScript.scenes[${index}].characters`, "missing"),
      description: fields["剧情描写"] ?? invalid(`chapterScript.scenes[${index}].description`, "missing"),
      actions: fields["人物动作"] ?? invalid(`chapterScript.scenes[${index}].actions`, "missing"),
      dialogue: fields["对白"] ?? invalid(`chapterScript.scenes[${index}].dialogue`, "missing"),
      narration: fields["旁白"] ?? invalid(`chapterScript.scenes[${index}].narration`, "missing"),
      endingPoint: fields["场景结束点"] ?? invalid(`chapterScript.scenes[${index}].endingPoint`, "missing"),
    };
  });
  const bodyMeaningful = scenes.some((scene) => [scene.description, scene.actions, scene.dialogue, scene.narration]
    .some((value) => !/^(?:原稿未明确|无)$/.test(value.trim())));
  if (!bodyMeaningful) invalid("chapterScript.scenes", "script body cannot contain only missing/none markers");
  if (options.mode === "import" && /(?:sourceRef|blockRef|readyForNextStage|pendingId|analysisCandidateId)/.test(source)) {
    invalid("chapterScript", "source references or system state must not appear in imported Markdown");
  }
  const document: ChapterScriptDocumentV1 = {
    chapterOrder,
    chapterTitle,
    type: basic["类型"] ?? invalid("chapterScript.type", "missing"),
    theme: basic["主题"] ?? invalid("chapterScript.theme", "missing"),
    style: basic["风格"] ?? invalid("chapterScript.style", "missing"),
    comicForm: basic["漫画形式"] ?? invalid("chapterScript.comicForm", "missing"),
    targetLength: basic["目标篇幅"] ?? invalid("chapterScript.targetLength", "missing"),
    logline: direction["一句话梗概"] ?? invalid("chapterScript.logline", "missing"),
    chapterGoal: direction["本章目标"] ?? invalid("chapterScript.chapterGoal", "missing"),
    coreConflict: direction["核心冲突"] ?? invalid("chapterScript.coreConflict", "missing"),
    emotionalArc: direction["情绪走向"] ?? invalid("chapterScript.emotionalArc", "missing"),
    endingHook: direction["结尾钩子"] ?? invalid("chapterScript.endingHook", "missing"),
    highlights: [
      highlights["亮点 1"] ?? invalid("chapterScript.highlights[0]", "missing"),
      highlights["亮点 2"] ?? invalid("chapterScript.highlights[1]", "missing"),
      highlights["亮点 3"] ?? invalid("chapterScript.highlights[2]", "missing"),
    ],
    visualAtmosphere: visual["画面氛围"] ?? invalid("chapterScript.visualAtmosphere", "missing"),
    colorDirection: visual["色调方向"] ?? invalid("chapterScript.colorDirection", "missing"),
    visualMotif: visual["视觉记忆点"] ?? invalid("chapterScript.visualMotif", "missing"),
    scenes,
    endingEvent: ending["结尾事件"] ?? invalid("chapterScript.endingEvent", "missing"),
    suspense: ending["悬念"] ?? invalid("chapterScript.suspense", "missing"),
    nextChapterLead: ending["下一章引子"] ?? invalid("chapterScript.nextChapterLead", "missing"),
  };
  if (options.mode === "import" && document.targetLength !== "按本章确认原稿范围完整整理") {
    invalid("chapterScript.targetLength", "import materialization must preserve the confirmed source range");
  }
  if (options.mode === "creative") {
    const creativeValues = [
      document.type, document.theme, document.style, document.comicForm, document.targetLength,
      document.logline, document.chapterGoal, document.coreConflict, document.emotionalArc, document.endingHook,
      ...document.highlights, document.visualAtmosphere, document.colorDirection, document.visualMotif,
      document.endingEvent, document.suspense, document.nextChapterLead,
      ...document.scenes.flatMap((scene) => [scene.location, scene.time, scene.atmosphere, scene.characters, scene.description, scene.actions, scene.dialogue, scene.narration, scene.endingPoint]),
    ];
    if (creativeValues.some((value) => value.trim() === "原稿未明确")) invalid("chapterScript", "creative output must not use import missing marker 原稿未明确");
  }
  if (options.mode !== undefined || options.characterRoster === "strict") {
    assertStrictChapterCharacterRosters(document);
  }
  return document;
}

export function serializeChapterScriptMarkdownV1(document: ChapterScriptDocumentV1): string {
  const source = [
    "# 章节剧本",
    "",
    `## 第 ${document.chapterOrder} 章：${document.chapterTitle}`,
    "",
    "### 一、基础方向",
    `类型：${document.type}`,
    `主题：${document.theme}`,
    `风格：${document.style}`,
    `漫画形式：${document.comicForm}`,
    `目标篇幅：${document.targetLength}`,
    "",
    "### 二、本章方向",
    `一句话梗概：${document.logline}`,
    `本章目标：${document.chapterGoal}`,
    `核心冲突：${document.coreConflict}`,
    `情绪走向：${document.emotionalArc}`,
    `结尾钩子：${document.endingHook}`,
    "",
    "### 三、剧本亮点",
    `亮点 1：${document.highlights[0]}`,
    `亮点 2：${document.highlights[1]}`,
    `亮点 3：${document.highlights[2]}`,
    "",
    "### 四、视觉基调",
    `画面氛围：${document.visualAtmosphere}`,
    `色调方向：${document.colorDirection}`,
    `视觉记忆点：${document.visualMotif}`,
    "",
    "### 五、剧本正文",
    "",
    ...document.scenes.flatMap((scene) => [
      `#### 场景 ${scene.order}：${scene.name}`,
      `地点：${scene.location}`,
      `时间：${scene.time}`,
      `氛围：${scene.atmosphere}`,
      `出场人物：${scene.characters}`,
      "",
      "剧情描写：",
      scene.description,
      "",
      "人物动作：",
      scene.actions,
      "",
      "对白：",
      scene.dialogue,
      "",
      "旁白：",
      scene.narration,
      "",
      "场景结束点：",
      scene.endingPoint,
      "",
    ]),
    "### 六、本章结尾",
    `结尾事件：${document.endingEvent}`,
    `悬念：${document.suspense}`,
    `下一章引子：${document.nextChapterLead}`,
  ].join("\n").trimEnd() + "\n";
  parseChapterScriptMarkdownV1(source, { characterRoster: "strict" });
  return source;
}

// ---------- import.analyze ----------

export interface ScriptSourceBlockRefV1 {
  sourceRef: string;
  blockRef: string;
  globalOrder: number;
  kind?: "narrative" | "title" | "non_story";
}

export interface ScriptSourceRangeV1 {
  sourceRef: string;
  startBlockRef: string;
  endBlockRef: string;
}

export type ImportContentTypeV1 = "script" | "story_prose" | "scene_draft" | "mixed";
export type ImportBoundaryLevelV1 = "volume" | "chapter" | "episode" | "act" | "scene" | "none" | "mixed";
export type ImportBoundaryModeV1 = "preserved_source_unit" | "grouped_source_scenes" | "proposed_story_transition" | "whole_source";
export type ImportBoundaryEvidenceTypeV1 = "source_start" | "explicit_heading" | "goal_or_conflict_resolution" | "major_turn" | "time_jump" | "location_shift" | "pov_or_mainline_shift" | "scene_sequence_end" | "source_end";
export type ImportConfidenceV1 = "high" | "medium" | "low";

export interface ImportAnalysisOutputV1 {
  schemaVersion: "import-analysis/1.0";
  outlineRole: "observed";
  sourceProfile: { contentType: ImportContentTypeV1; explicitBoundaryLevel: ImportBoundaryLevelV1 };
  observedOutline: {
    sourceTitle: { value: string | null; basis: "source" | "not_provided" };
    synopsis: string;
    mainCharacters: Array<{
      name: string;
      aliases: string[];
      observedIdentity: string;
      observedPursuit: string;
      relationships: string[];
      sourceRanges: ScriptSourceRangeV1[];
    }>;
    plotStages: Array<{ order: number; label: string; summary: string; sourceRanges: ScriptSourceRangeV1[] }>;
    endingObservation: { kind: "resolved" | "open" | "incomplete" | "multiple" | "unknown"; summary: string; sourceRanges: ScriptSourceRangeV1[] };
  };
  chapterCandidates: Array<{
    localRef: string;
    order: number;
    title: { value: string; basis: "source" | "suggested" };
    summary: string;
    sourceRanges: ScriptSourceRangeV1[];
    boundaryMode: ImportBoundaryModeV1;
    boundaryEvidence: {
      start: { type: ImportBoundaryEvidenceTypeV1; anchorBlockRef: string; description: string };
      end: { type: ImportBoundaryEvidenceTypeV1; anchorBlockRef: string; description: string };
    };
    confidence: ImportConfidenceV1;
    warnings: string[];
  }>;
  excludedRanges: Array<{ sourceRange: ScriptSourceRangeV1; category: "front_matter" | "table_of_contents" | "character_list" | "author_note" | "duplicate" | "non_story"; reason: string }>;
  unresolvedItems: Array<{ code: string; impact: "source_scope" | "source_order" | "boundary" | "interpretation" | "labeling"; description: string; affectedBlockRefs: string[] }>;
  globalWarnings: string[];
}

export interface ImportAnalysisValidationContextV1 {
  sourceBlocks?: readonly ScriptSourceBlockRefV1[];
  requireCompleteAssignment?: boolean;
}

const IMPORT_CONTENT_TYPES = ["script", "story_prose", "scene_draft", "mixed"] as const;
const IMPORT_BOUNDARY_LEVELS = ["volume", "chapter", "episode", "act", "scene", "none", "mixed"] as const;
const IMPORT_BOUNDARY_MODES = ["preserved_source_unit", "grouped_source_scenes", "proposed_story_transition", "whole_source"] as const;
const IMPORT_BOUNDARY_EVIDENCE_TYPES = ["source_start", "explicit_heading", "goal_or_conflict_resolution", "major_turn", "time_jump", "location_shift", "pov_or_mainline_shift", "scene_sequence_end", "source_end"] as const;
const IMPORT_CONFIDENCES = ["high", "medium", "low"] as const;
const IMPORT_ENDING_KINDS = ["resolved", "open", "incomplete", "multiple", "unknown"] as const;
const IMPORT_EXCLUDED_CATEGORIES = ["front_matter", "table_of_contents", "character_list", "author_note", "duplicate", "non_story"] as const;
const IMPORT_UNRESOLVED_IMPACTS = ["source_scope", "source_order", "boundary", "interpretation", "labeling"] as const;

function parseSourceRange(value: unknown, path: string): ScriptSourceRangeV1 {
  const row = exactObject(value, ["sourceRef", "startBlockRef", "endBlockRef"], path);
  return {
    sourceRef: nonEmptyString(row.sourceRef, `${path}.sourceRef`),
    startBlockRef: nonEmptyString(row.startBlockRef, `${path}.startBlockRef`),
    endBlockRef: nonEmptyString(row.endBlockRef, `${path}.endBlockRef`),
  };
}

function parseSourceRanges(value: unknown, path: string, allowEmpty = false): ScriptSourceRangeV1[] {
  const values = array(value, path);
  if (!allowEmpty && values.length === 0) invalid(path, "expected at least one source range");
  return values.map((item, index) => parseSourceRange(item, `${path}[${index}]`));
}

function parseBoundaryEvidence(value: unknown, path: string): { type: ImportBoundaryEvidenceTypeV1; anchorBlockRef: string; description: string } {
  const row = exactObject(value, ["type", "anchorBlockRef", "description"], path);
  return {
    type: enumeration(row.type, IMPORT_BOUNDARY_EVIDENCE_TYPES, `${path}.type`),
    anchorBlockRef: nonEmptyString(row.anchorBlockRef, `${path}.anchorBlockRef`),
    description: nonEmptyString(row.description, `${path}.description`),
  };
}

function parseImportAnalysisShape(input: unknown): ImportAnalysisOutputV1 {
  const row = exactObject(jsonInput(input, "importAnalysis"), ["schemaVersion", "outlineRole", "sourceProfile", "observedOutline", "chapterCandidates", "excludedRanges", "unresolvedItems", "globalWarnings"], "importAnalysis");
  if (row.schemaVersion !== "import-analysis/1.0") invalid("importAnalysis.schemaVersion", "expected import-analysis/1.0");
  if (row.outlineRole !== "observed") invalid("importAnalysis.outlineRole", "expected observed");
  const profile = exactObject(row.sourceProfile, ["contentType", "explicitBoundaryLevel"], "importAnalysis.sourceProfile");
  const observed = exactObject(row.observedOutline, ["sourceTitle", "synopsis", "mainCharacters", "plotStages", "endingObservation"], "importAnalysis.observedOutline");
  const sourceTitle = exactObject(observed.sourceTitle, ["value", "basis"], "importAnalysis.observedOutline.sourceTitle");
  const sourceTitleBasis = enumeration(sourceTitle.basis, ["source", "not_provided"] as const, "importAnalysis.observedOutline.sourceTitle.basis");
  const sourceTitleValue = nullableString(sourceTitle.value, "importAnalysis.observedOutline.sourceTitle.value");
  if (sourceTitleBasis === "source" && sourceTitleValue === null) invalid("importAnalysis.observedOutline.sourceTitle.value", "source title requires a value");
  if (sourceTitleBasis === "not_provided" && sourceTitleValue !== null) invalid("importAnalysis.observedOutline.sourceTitle.value", "not_provided title must be null");
  const mainCharacters = array(observed.mainCharacters, "importAnalysis.observedOutline.mainCharacters").map((item, index) => {
    const path = `importAnalysis.observedOutline.mainCharacters[${index}]`;
    const character = exactObject(item, ["name", "aliases", "observedIdentity", "observedPursuit", "relationships", "sourceRanges"], path);
    return {
      name: nonEmptyString(character.name, `${path}.name`),
      aliases: stringArray(character.aliases, `${path}.aliases`),
      observedIdentity: nonEmptyString(character.observedIdentity, `${path}.observedIdentity`),
      observedPursuit: nonEmptyString(character.observedPursuit, `${path}.observedPursuit`),
      relationships: stringArray(character.relationships, `${path}.relationships`),
      sourceRanges: parseSourceRanges(character.sourceRanges, `${path}.sourceRanges`),
    };
  });
  const plotStages = array(observed.plotStages, "importAnalysis.observedOutline.plotStages").map((item, index) => {
    const path = `importAnalysis.observedOutline.plotStages[${index}]`;
    const stage = exactObject(item, ["order", "label", "summary", "sourceRanges"], path);
    const order = positiveInteger(stage.order, `${path}.order`);
    if (order !== index + 1) invalid(`${path}.order`, "order must be contiguous from 1");
    return { order, label: nonEmptyString(stage.label, `${path}.label`), summary: nonEmptyString(stage.summary, `${path}.summary`), sourceRanges: parseSourceRanges(stage.sourceRanges, `${path}.sourceRanges`) };
  });
  if (plotStages.length === 0) invalid("importAnalysis.observedOutline.plotStages", "expected at least one plot stage");
  const ending = exactObject(observed.endingObservation, ["kind", "summary", "sourceRanges"], "importAnalysis.observedOutline.endingObservation");
  const chapterCandidates = array(row.chapterCandidates, "importAnalysis.chapterCandidates").map((item, index) => {
    const path = `importAnalysis.chapterCandidates[${index}]`;
    const candidate = exactObject(item, ["localRef", "order", "title", "summary", "sourceRanges", "boundaryMode", "boundaryEvidence", "confidence", "warnings"], path);
    const order = positiveInteger(candidate.order, `${path}.order`);
    if (order !== index + 1) invalid(`${path}.order`, "order must be contiguous from 1");
    const title = exactObject(candidate.title, ["value", "basis"], `${path}.title`);
    const evidence = exactObject(candidate.boundaryEvidence, ["start", "end"], `${path}.boundaryEvidence`);
    return {
      localRef: nonEmptyString(candidate.localRef, `${path}.localRef`),
      order,
      title: { value: nonEmptyString(title.value, `${path}.title.value`), basis: enumeration(title.basis, ["source", "suggested"] as const, `${path}.title.basis`) },
      summary: nonEmptyString(candidate.summary, `${path}.summary`),
      sourceRanges: parseSourceRanges(candidate.sourceRanges, `${path}.sourceRanges`),
      boundaryMode: enumeration(candidate.boundaryMode, IMPORT_BOUNDARY_MODES, `${path}.boundaryMode`),
      boundaryEvidence: { start: parseBoundaryEvidence(evidence.start, `${path}.boundaryEvidence.start`), end: parseBoundaryEvidence(evidence.end, `${path}.boundaryEvidence.end`) },
      confidence: enumeration(candidate.confidence, IMPORT_CONFIDENCES, `${path}.confidence`),
      warnings: stringArray(candidate.warnings, `${path}.warnings`),
    };
  });
  if (chapterCandidates.length === 0) invalid("importAnalysis.chapterCandidates", "expected at least one chapter candidate");
  const localRefs = chapterCandidates.map((item) => item.localRef);
  if (new Set(localRefs).size !== localRefs.length) invalid("importAnalysis.chapterCandidates", "duplicate localRef");
  const excludedRanges = array(row.excludedRanges, "importAnalysis.excludedRanges").map((item, index) => {
    const path = `importAnalysis.excludedRanges[${index}]`;
    const excluded = exactObject(item, ["sourceRange", "category", "reason"], path);
    return { sourceRange: parseSourceRange(excluded.sourceRange, `${path}.sourceRange`), category: enumeration(excluded.category, IMPORT_EXCLUDED_CATEGORIES, `${path}.category`), reason: nonEmptyString(excluded.reason, `${path}.reason`) };
  });
  const unresolvedItems = array(row.unresolvedItems, "importAnalysis.unresolvedItems").map((item, index) => {
    const path = `importAnalysis.unresolvedItems[${index}]`;
    const unresolved = exactObject(item, ["code", "impact", "description", "affectedBlockRefs"], path);
    return { code: nonEmptyString(unresolved.code, `${path}.code`), impact: enumeration(unresolved.impact, IMPORT_UNRESOLVED_IMPACTS, `${path}.impact`), description: nonEmptyString(unresolved.description, `${path}.description`), affectedBlockRefs: stringArray(unresolved.affectedBlockRefs, `${path}.affectedBlockRefs`, { min: 1 }) };
  });
  return {
    schemaVersion: "import-analysis/1.0",
    outlineRole: "observed",
    sourceProfile: { contentType: enumeration(profile.contentType, IMPORT_CONTENT_TYPES, "importAnalysis.sourceProfile.contentType"), explicitBoundaryLevel: enumeration(profile.explicitBoundaryLevel, IMPORT_BOUNDARY_LEVELS, "importAnalysis.sourceProfile.explicitBoundaryLevel") },
    observedOutline: {
      sourceTitle: { value: sourceTitleValue, basis: sourceTitleBasis },
      synopsis: nonEmptyString(observed.synopsis, "importAnalysis.observedOutline.synopsis"),
      mainCharacters,
      plotStages,
      endingObservation: { kind: enumeration(ending.kind, IMPORT_ENDING_KINDS, "importAnalysis.observedOutline.endingObservation.kind"), summary: nonEmptyString(ending.summary, "importAnalysis.observedOutline.endingObservation.summary"), sourceRanges: parseSourceRanges(ending.sourceRanges, "importAnalysis.observedOutline.endingObservation.sourceRanges") },
    },
    chapterCandidates,
    excludedRanges,
    unresolvedItems,
    globalWarnings: stringArray(row.globalWarnings, "importAnalysis.globalWarnings"),
  };
}

function buildSourceCatalog(blocks: readonly ScriptSourceBlockRefV1[], path: string): { ordered: ScriptSourceBlockRefV1[]; byKey: Map<string, number> } {
  const ordered = [...blocks].sort((left, right) => left.globalOrder - right.globalOrder);
  const byKey = new Map<string, number>();
  const globalBlockRefs = new Set<string>();
  ordered.forEach((block, index) => {
    if (!block.sourceRef.trim() || !block.blockRef.trim() || !Number.isInteger(block.globalOrder) || block.globalOrder < 1) invalid(`${path}[${index}]`, "invalid source block catalog item");
    const key = `${block.sourceRef}\u0000${block.blockRef}`;
    if (byKey.has(key)) invalid(path, `duplicate source block ${block.sourceRef}/${block.blockRef}`);
    if (globalBlockRefs.has(block.blockRef)) invalid(path, `blockRef must be globally unique: ${block.blockRef}`);
    byKey.set(key, index);
    globalBlockRefs.add(block.blockRef);
    if (index > 0 && ordered[index - 1]?.globalOrder === block.globalOrder) invalid(path, `duplicate globalOrder ${block.globalOrder}`);
  });
  return { ordered, byKey };
}

function expandRange(range: ScriptSourceRangeV1, catalog: ReturnType<typeof buildSourceCatalog>, path: string): number[] {
  const start = catalog.byKey.get(`${range.sourceRef}\u0000${range.startBlockRef}`);
  const end = catalog.byKey.get(`${range.sourceRef}\u0000${range.endBlockRef}`);
  if (start === undefined) invalid(`${path}.startBlockRef`, "unknown source block");
  if (end === undefined) invalid(`${path}.endBlockRef`, "unknown source block");
  if (start > end) invalid(path, "range start must not be after end");
  const indices = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  if (indices.some((index) => catalog.ordered[index]?.sourceRef !== range.sourceRef)) invalid(path, "range crosses sourceRef boundary");
  return indices;
}

export function parseImportAnalysisOutputV1(input: unknown, context: ImportAnalysisValidationContextV1 = {}): ImportAnalysisOutputV1 {
  const output = parseImportAnalysisShape(input);
  if (!context.sourceBlocks) return output;
  const catalog = buildSourceCatalog(context.sourceBlocks, "importAnalysisContext.sourceBlocks");
  const validateReferenceRange = (range: ScriptSourceRangeV1, path: string): void => { expandRange(range, catalog, path); };
  output.observedOutline.mainCharacters.forEach((character, characterIndex) => character.sourceRanges.forEach((range, rangeIndex) => validateReferenceRange(range, `importAnalysis.observedOutline.mainCharacters[${characterIndex}].sourceRanges[${rangeIndex}]`)));
  output.observedOutline.plotStages.forEach((stage, stageIndex) => stage.sourceRanges.forEach((range, rangeIndex) => validateReferenceRange(range, `importAnalysis.observedOutline.plotStages[${stageIndex}].sourceRanges[${rangeIndex}]`)));
  output.observedOutline.endingObservation.sourceRanges.forEach((range, rangeIndex) => validateReferenceRange(range, `importAnalysis.observedOutline.endingObservation.sourceRanges[${rangeIndex}]`));
  const assigned = new Map<number, string>();
  const assign = (range: ScriptSourceRangeV1, owner: string, path: string): number[] => {
    const indices = expandRange(range, catalog, path);
    for (const index of indices) {
      const previous = assigned.get(index);
      if (previous) invalid(path, `source block overlaps with ${previous}`);
      assigned.set(index, owner);
    }
    return indices;
  };
  let previousCandidateEnd = -1;
  output.chapterCandidates.forEach((candidate, candidateIndex) => {
    const indices = candidate.sourceRanges.flatMap((range, rangeIndex) => assign(range, candidate.localRef, `importAnalysis.chapterCandidates[${candidateIndex}].sourceRanges[${rangeIndex}]`));
    const ordered = [...indices].sort((left, right) => left - right);
    ordered.forEach((value, index) => {
      if (index > 0 && value !== (ordered[index - 1] ?? -2) + 1) invalid(`importAnalysis.chapterCandidates[${candidateIndex}].sourceRanges`, "candidate ranges must be globally contiguous");
    });
    if ((ordered[0] ?? -1) <= previousCandidateEnd) invalid(`importAnalysis.chapterCandidates[${candidateIndex}]`, "chapter candidates must follow source order");
    previousCandidateEnd = ordered.at(-1) ?? previousCandidateEnd;
    const candidateBlockRefs = new Set(indices.map((index) => catalog.ordered[index]?.blockRef));
    const anchors = [candidate.boundaryEvidence.start.anchorBlockRef, candidate.boundaryEvidence.end.anchorBlockRef];
    anchors.forEach((blockRef, index) => {
      if (!candidateBlockRefs.has(blockRef)) invalid(`importAnalysis.chapterCandidates[${candidateIndex}].boundaryEvidence.${index === 0 ? "start" : "end"}.anchorBlockRef`, "anchor must be inside candidate source range");
    });
  });
  output.excludedRanges.forEach((excluded, index) => assign(excluded.sourceRange, `excluded:${index}`, `importAnalysis.excludedRanges[${index}].sourceRange`));
  const allKnownRefs = new Set(catalog.ordered.map((block) => block.blockRef));
  output.unresolvedItems.forEach((item, itemIndex) => item.affectedBlockRefs.forEach((ref, refIndex) => {
    if (!allKnownRefs.has(ref)) invalid(`importAnalysis.unresolvedItems[${itemIndex}].affectedBlockRefs[${refIndex}]`, "unknown blockRef");
  }));
  if (context.requireCompleteAssignment !== false && assigned.size !== catalog.ordered.length) {
    const missing = catalog.ordered.filter((_block, index) => !assigned.has(index)).map((block) => block.blockRef);
    invalid("importAnalysis.assignment", `unassigned source blocks: ${missing.join(", ")}`);
  }
  return output;
}

// ---------- import.verify ----------

export type ImportFidelityDispositionV1 = "preserved_in_body" | "reformatted_in_body" | "preserved_in_title" | "summarized_metadata_only" | "missing" | "uncertain";
export type ImportFidelityIssueCodeV1 = "SOURCE_OMISSION" | "UNSUPPORTED_ADDITION" | "ORDER_CHANGE" | "OUT_OF_RANGE_CONTENT" | "DIALOGUE_ALTERED" | "SPEAKER_CHANGED" | "ENTITY_MERGED" | "ENTITY_SPLIT" | "UNSUPPORTED_METADATA" | "AMBIGUOUS_MAPPING";

export interface ImportFidelityFindingV1 {
  code: ImportFidelityIssueCodeV1;
  description: string;
  sourceBlockRefs: string[];
  outputLineRefs: string[];
}

export interface ImportFidelityOutputV1 {
  schemaVersion: "import-fidelity/1.0";
  sourceCoverage: Array<{
    sourceRange: ScriptSourceRangeV1;
    outputLineRanges: Array<{ startLineRef: string; endLineRef: string }>;
    disposition: ImportFidelityDispositionV1;
    note: string;
  }>;
  unsupportedAdditions: ImportFidelityFindingV1[];
  sequenceFindings: ImportFidelityFindingV1[];
  dialogueFindings: ImportFidelityFindingV1[];
  entityFindings: ImportFidelityFindingV1[];
  metadataFindings: ImportFidelityFindingV1[];
  uncertainties: ImportFidelityFindingV1[];
}

export interface ImportFidelityValidationContextV1 {
  sourceBlocks?: readonly ScriptSourceBlockRefV1[];
  outputLineRefs?: readonly string[];
}

const FIDELITY_DISPOSITIONS = ["preserved_in_body", "reformatted_in_body", "preserved_in_title", "summarized_metadata_only", "missing", "uncertain"] as const;
const FIDELITY_ISSUE_CODES = ["SOURCE_OMISSION", "UNSUPPORTED_ADDITION", "ORDER_CHANGE", "OUT_OF_RANGE_CONTENT", "DIALOGUE_ALTERED", "SPEAKER_CHANGED", "ENTITY_MERGED", "ENTITY_SPLIT", "UNSUPPORTED_METADATA", "AMBIGUOUS_MAPPING"] as const;
const FIDELITY_FINDING_KEYS = ["unsupportedAdditions", "sequenceFindings", "dialogueFindings", "entityFindings", "metadataFindings", "uncertainties"] as const;
const FIDELITY_CODES_BY_FINDING_KEY = {
  unsupportedAdditions: ["UNSUPPORTED_ADDITION", "OUT_OF_RANGE_CONTENT"],
  sequenceFindings: ["SOURCE_OMISSION", "ORDER_CHANGE", "OUT_OF_RANGE_CONTENT"],
  dialogueFindings: ["SOURCE_OMISSION", "UNSUPPORTED_ADDITION", "DIALOGUE_ALTERED", "SPEAKER_CHANGED"],
  entityFindings: ["ENTITY_MERGED", "ENTITY_SPLIT", "AMBIGUOUS_MAPPING"],
  metadataFindings: ["UNSUPPORTED_METADATA"],
  uncertainties: ["AMBIGUOUS_MAPPING"],
} as const satisfies Record<typeof FIDELITY_FINDING_KEYS[number], readonly ImportFidelityIssueCodeV1[]>;

function parseFidelityFinding(value: unknown, path: string): ImportFidelityFindingV1 {
  const row = exactObject(value, ["code", "description", "sourceBlockRefs", "outputLineRefs"], path);
  const sourceBlockRefs = stringArray(row.sourceBlockRefs, `${path}.sourceBlockRefs`);
  const outputLineRefs = stringArray(row.outputLineRefs, `${path}.outputLineRefs`);
  if (sourceBlockRefs.length === 0 && outputLineRefs.length === 0) invalid(path, "finding requires at least one source or output reference");
  return {
    code: enumeration(row.code, FIDELITY_ISSUE_CODES, `${path}.code`),
    description: nonEmptyString(row.description, `${path}.description`),
    sourceBlockRefs,
    outputLineRefs,
  };
}

export function parseImportFidelityOutputV1(input: unknown, context: ImportFidelityValidationContextV1 = {}): ImportFidelityOutputV1 {
  const row = exactObject(jsonInput(input, "importFidelity"), ["schemaVersion", "sourceCoverage", ...FIDELITY_FINDING_KEYS], "importFidelity");
  if (row.schemaVersion !== "import-fidelity/1.0") invalid("importFidelity.schemaVersion", "expected import-fidelity/1.0");
  const sourceCoverage = array(row.sourceCoverage, "importFidelity.sourceCoverage").map((item, index) => {
    const path = `importFidelity.sourceCoverage[${index}]`;
    const coverage = exactObject(item, ["sourceRange", "outputLineRanges", "disposition", "note"], path);
    const outputLineRanges = array(coverage.outputLineRanges, `${path}.outputLineRanges`).map((lineRange, lineIndex) => {
      const linePath = `${path}.outputLineRanges[${lineIndex}]`;
      const line = exactObject(lineRange, ["startLineRef", "endLineRef"], linePath);
      return { startLineRef: nonEmptyString(line.startLineRef, `${linePath}.startLineRef`), endLineRef: nonEmptyString(line.endLineRef, `${linePath}.endLineRef`) };
    });
    const disposition = enumeration(coverage.disposition, FIDELITY_DISPOSITIONS, `${path}.disposition`);
    if (["preserved_in_body", "reformatted_in_body", "preserved_in_title"].includes(disposition) && outputLineRanges.length === 0) invalid(`${path}.outputLineRanges`, "preserved coverage requires output line references");
    return { sourceRange: parseSourceRange(coverage.sourceRange, `${path}.sourceRange`), outputLineRanges, disposition, note: nonEmptyString(coverage.note, `${path}.note`) };
  });
  if (sourceCoverage.length === 0) invalid("importFidelity.sourceCoverage", "expected at least one coverage range");
  const parsedFindings = Object.fromEntries(FIDELITY_FINDING_KEYS.map((key) => {
    const findings = array(row[key], `importFidelity.${key}`).map((item, index) => parseFidelityFinding(item, `importFidelity.${key}[${index}]`));
    findings.forEach((finding, index) => {
      if (!(FIDELITY_CODES_BY_FINDING_KEY[key] as readonly ImportFidelityIssueCodeV1[]).includes(finding.code)) {
        invalid(`importFidelity.${key}[${index}].code`, `code ${finding.code} does not belong in ${key}`);
      }
    });
    return [key, findings];
  })) as Record<typeof FIDELITY_FINDING_KEYS[number], ImportFidelityFindingV1[]>;
  const output: ImportFidelityOutputV1 = {
    schemaVersion: "import-fidelity/1.0",
    sourceCoverage,
    unsupportedAdditions: parsedFindings.unsupportedAdditions,
    sequenceFindings: parsedFindings.sequenceFindings,
    dialogueFindings: parsedFindings.dialogueFindings,
    entityFindings: parsedFindings.entityFindings,
    metadataFindings: parsedFindings.metadataFindings,
    uncertainties: parsedFindings.uncertainties,
  };

  const allowedSourceRefs = context.sourceBlocks ? new Set(context.sourceBlocks.map((block) => block.blockRef)) : null;
  const allowedOutputRefs = context.outputLineRefs ? new Set(context.outputLineRefs) : null;
  const outputLineOrder = context.outputLineRefs ? new Map(context.outputLineRefs.map((ref, index) => [ref, index])) : null;
  const validateSourceRef = (ref: string, path: string): void => {
    if (allowedSourceRefs && !allowedSourceRefs.has(ref)) invalid(path, "unknown source blockRef");
  };
  const validateOutputRef = (ref: string, path: string): void => {
    if (allowedOutputRefs && !allowedOutputRefs.has(ref)) invalid(path, "unknown output lineRef");
  };
  FIDELITY_FINDING_KEYS.forEach((key) => output[key].forEach((finding, findingIndex) => {
    finding.sourceBlockRefs.forEach((ref, refIndex) => validateSourceRef(ref, `importFidelity.${key}[${findingIndex}].sourceBlockRefs[${refIndex}]`));
    finding.outputLineRefs.forEach((ref, refIndex) => validateOutputRef(ref, `importFidelity.${key}[${findingIndex}].outputLineRefs[${refIndex}]`));
  }));
  sourceCoverage.forEach((coverage, coverageIndex) => coverage.outputLineRanges.forEach((lineRange, rangeIndex) => {
    validateOutputRef(lineRange.startLineRef, `importFidelity.sourceCoverage[${coverageIndex}].outputLineRanges[${rangeIndex}].startLineRef`);
    validateOutputRef(lineRange.endLineRef, `importFidelity.sourceCoverage[${coverageIndex}].outputLineRanges[${rangeIndex}].endLineRef`);
    if (outputLineOrder && (outputLineOrder.get(lineRange.startLineRef) ?? Number.MAX_SAFE_INTEGER) > (outputLineOrder.get(lineRange.endLineRef) ?? -1)) {
      invalid(`importFidelity.sourceCoverage[${coverageIndex}].outputLineRanges[${rangeIndex}]`, "line range start must not be after end");
    }
  }));
  if (context.sourceBlocks) {
    const catalog = buildSourceCatalog(context.sourceBlocks, "importFidelityContext.sourceBlocks");
    const covered = new Set<number>();
    sourceCoverage.forEach((coverage, index) => {
      const indices = expandRange(coverage.sourceRange, catalog, `importFidelity.sourceCoverage[${index}].sourceRange`);
      if (coverage.disposition === "preserved_in_title" && indices.some((blockIndex) => catalog.ordered[blockIndex]?.kind !== undefined && catalog.ordered[blockIndex]?.kind !== "title")) {
        invalid(`importFidelity.sourceCoverage[${index}].disposition`, "preserved_in_title may only cover title blocks");
      }
      indices.forEach((blockIndex) => {
        if (covered.has(blockIndex)) invalid(`importFidelity.sourceCoverage[${index}]`, "source coverage ranges overlap");
        covered.add(blockIndex);
      });
    });
    if (covered.size !== catalog.ordered.length) {
      const missing = catalog.ordered.filter((_block, index) => !covered.has(index)).map((block) => block.blockRef);
      invalid("importFidelity.sourceCoverage", `missing source blocks: ${missing.join(", ")}`);
    }
  }
  return output;
}

export function importFidelityHasHardIssuesV1(output: ImportFidelityOutputV1): boolean {
  if (output.sourceCoverage.some((item) => !["preserved_in_body", "reformatted_in_body", "preserved_in_title"].includes(item.disposition))) return true;
  return output.unsupportedAdditions.length > 0
    || output.sequenceFindings.length > 0
    || output.dialogueFindings.length > 0
    || output.entityFindings.some((item) => item.code !== "AMBIGUOUS_MAPPING")
    || output.metadataFindings.length > 0;
}
