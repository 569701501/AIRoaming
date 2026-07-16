import type { ChapterScriptDocumentV1 } from "@airoaming/shared";

import { ScriptCreativeQualityError } from "./script-creative-quality.util.js";

export type ScriptRevisionLayer = "continuity" | "development" | "scene_dialogue" | "prose";

const REVISION_LAYER_LABELS: Record<ScriptRevisionLayer, string> = {
  continuity: "连续性修复",
  development: "发展性修订",
  scene_dialogue: "场景与对白修订",
  prose: "文字修订",
};

const REVISION_LAYER_CONTRACTS: Record<ScriptRevisionLayer, string[]> = {
  continuity: [
    "修正时间、地点、人物知识、伤势、道具、关系或已发生事实，并只联动必要的下层表达。",
    "不得借连续性修复发明无关剧情、改变章序或改动未点名的项目基础字段和角色名单。",
  ],
  development: [
    "修正剧情功能、人物推动力、因果、高潮或人物弧，并允许必要的场景、对白和文字联动。",
    "必须保留既有连续性事实，不得改变章序或改动未点名的项目基础字段和角色名单。",
  ],
  scene_dialogue: [
    "只调整场景目标、阻力、节奏、潜台词、转折及其文字表达。",
    "必须保留本章方向、结尾事实、项目基础字段和角色名单；除非用户明确点名对应字段。",
  ],
  prose: [
    "只修改句子、重复、语气、错字、标点和文字表达。",
    "必须保留全部剧情事实和场景结构，包括场景数量、顺序、名称、地点、时间、氛围、出场人物和结束点。",
  ],
};

const CONTINUITY_REQUEST = /(连续性|前后矛盾|设定冲突|时间线|时间不对|地点不对|人物已知|人物知道|人物不知道|伤势|受伤|道具|物品|关系错|事实错误|已发生事实|穿帮|称呼错)/;
const DEVELOPMENT_REQUEST = /(剧情功能|剧情方向|故事方向|人物动机|角色动机|推动力|因果|高潮|核心冲突|本章目标|章节目标|人物弧|角色弧|主线|支线|伏笔|回收|结局|结尾|钩子)/;
const SCENE_DIALOGUE_REQUEST = /(场景|对白|台词|潜台词|冲突|阻力|转折|节奏|开场|收场|戏剧|悬念)/;

function positiveRevisionInstruction(instruction: string): string {
  return instruction.replace(/(?:不要|别|不得|无需|保持|保留)[^，,。；;\n]*/g, "").trim();
}

export function classifyScriptRevisionLayer(instruction: string): ScriptRevisionLayer {
  const value = positiveRevisionInstruction(instruction);
  if (CONTINUITY_REQUEST.test(value)) return "continuity";
  if (DEVELOPMENT_REQUEST.test(value)) return "development";
  if (SCENE_DIALOGUE_REQUEST.test(value)) return "scene_dialogue";
  return "prose";
}

export function getScriptRevisionLayerLabel(layer: ScriptRevisionLayer): string {
  return REVISION_LAYER_LABELS[layer];
}

export function getScriptRevisionLayerContract(layer: ScriptRevisionLayer): readonly string[] {
  return REVISION_LAYER_CONTRACTS[layer];
}

function semanticKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pushChanged(
  issues: string[],
  source: unknown,
  revised: unknown,
  code: string,
  instruction: string,
  targetPattern?: RegExp,
): void {
  if (!valuesEqual(source, revised) && !(targetPattern?.test(positiveRevisionInstruction(instruction)) ?? false)) issues.push(code);
}

function normalizeCharacterName(value: string): string {
  return value.replace(/[（(][^）)]*[）)]/g, "").trim();
}

function characterRoster(document: ChapterScriptDocumentV1): Set<string> {
  const names = document.scenes
    .flatMap((scene) => scene.characters.split(/[、,，/／;；\s]+/))
    .map(normalizeCharacterName)
    .filter((name) => name.length > 0 && name !== "无");
  return new Set(names);
}

function rosterChangeWasRequested(instruction: string, source: ChapterScriptDocumentV1, revised: ChapterScriptDocumentV1): boolean {
  const positiveInstruction = positiveRevisionInstruction(instruction);
  if (/(新增|增加|加入|删除|移除|替换|更换).{0,8}(角色|人物)|角色.{0,4}(改名|更名)/.test(positiveInstruction)) return true;
  const before = characterRoster(source);
  const after = characterRoster(revised);
  const changed = [...before].filter((name) => !after.has(name)).concat([...after].filter((name) => !before.has(name)));
  const normalizedInstruction = semanticKey(positiveInstruction);
  return changed.every((name) => normalizedInstruction.includes(semanticKey(name)));
}

const HIGH_LEVEL_FIELDS: Array<{
  field: keyof Pick<ChapterScriptDocumentV1, "logline" | "chapterGoal" | "coreConflict" | "emotionalArc" | "endingHook" | "highlights" | "visualAtmosphere" | "colorDirection" | "visualMotif">;
  code: string;
  target: RegExp;
}> = [
  { field: "logline", code: "P4_UNREQUESTED_LOGLINE_CHANGE", target: /(一句话梗概|梗概)/ },
  { field: "chapterGoal", code: "P4_UNREQUESTED_CHAPTER_GOAL_CHANGE", target: /(本章目标|章节目标)/ },
  { field: "coreConflict", code: "P4_UNREQUESTED_CORE_CONFLICT_CHANGE", target: /核心冲突/ },
  { field: "emotionalArc", code: "P4_UNREQUESTED_EMOTIONAL_ARC_CHANGE", target: /(情绪走向|情绪弧)/ },
  { field: "endingHook", code: "P4_UNREQUESTED_ENDING_HOOK_CHANGE", target: /(结尾钩子|钩子)/ },
  { field: "highlights", code: "P4_UNREQUESTED_HIGHLIGHTS_CHANGE", target: /亮点/ },
  { field: "visualAtmosphere", code: "P4_UNREQUESTED_VISUAL_ATMOSPHERE_CHANGE", target: /(画面氛围|视觉氛围)/ },
  { field: "colorDirection", code: "P4_UNREQUESTED_COLOR_DIRECTION_CHANGE", target: /(色调|颜色)/ },
  { field: "visualMotif", code: "P4_UNREQUESTED_VISUAL_MOTIF_CHANGE", target: /(视觉记忆点|视觉意象)/ },
];

const ENDING_FIELDS: Array<{
  field: keyof Pick<ChapterScriptDocumentV1, "endingEvent" | "suspense" | "nextChapterLead">;
  code: string;
  target: RegExp;
}> = [
  { field: "endingEvent", code: "P4_UNREQUESTED_ENDING_EVENT_CHANGE", target: /结尾事件/ },
  { field: "suspense", code: "P4_UNREQUESTED_SUSPENSE_CHANGE", target: /悬念/ },
  { field: "nextChapterLead", code: "P4_UNREQUESTED_NEXT_CHAPTER_LEAD_CHANGE", target: /(下一章|引子)/ },
];

export function assertP4LayeredRevision(
  source: ChapterScriptDocumentV1,
  revised: ChapterScriptDocumentV1,
  layer: ScriptRevisionLayer,
  instruction: string,
): void {
  const issues: string[] = [];
  if (valuesEqual(source, revised)) issues.push("P4_NO_EFFECTIVE_CHANGE");
  if (source.chapterOrder !== revised.chapterOrder) issues.push("P4_CHAPTER_ORDER_CHANGED");
  pushChanged(issues, source.chapterTitle, revised.chapterTitle, "P4_UNREQUESTED_TITLE_CHANGE", instruction, /(标题|章名)/);
  pushChanged(issues, source.type, revised.type, "P4_UNREQUESTED_TYPE_CHANGE", instruction, /(类型|题材)/);
  pushChanged(issues, source.theme, revised.theme, "P4_UNREQUESTED_THEME_CHANGE", instruction, /主题/);
  pushChanged(issues, source.style, revised.style, "P4_UNREQUESTED_STYLE_CHANGE", instruction, /风格/);
  pushChanged(issues, source.comicForm, revised.comicForm, "P4_UNREQUESTED_COMIC_FORM_CHANGE", instruction, /(漫画形式|条漫|页漫)/);
  pushChanged(issues, source.targetLength, revised.targetLength, "P4_UNREQUESTED_TARGET_LENGTH_CHANGE", instruction, /(目标篇幅|篇幅|字数|长度|扩写|压缩)/);

  if (!valuesEqual([...characterRoster(source)].sort(), [...characterRoster(revised)].sort())
    && !rosterChangeWasRequested(instruction, source, revised)) {
    issues.push("P4_UNREQUESTED_CHARACTER_ROSTER_CHANGE");
  }

  if (layer === "scene_dialogue" || layer === "prose") {
    for (const item of HIGH_LEVEL_FIELDS) {
      pushChanged(issues, source[item.field], revised[item.field], item.code, instruction, item.target);
    }
    for (const item of ENDING_FIELDS) {
      pushChanged(issues, source[item.field], revised[item.field], item.code, instruction, item.target);
    }
  }

  if (layer === "prose") {
    if (source.scenes.length !== revised.scenes.length) {
      issues.push("P4_PROSE_SCENE_COUNT_CHANGED");
    } else {
      const structuralFields: Array<keyof Pick<ChapterScriptDocumentV1["scenes"][number], "order" | "name" | "location" | "time" | "atmosphere" | "characters" | "endingPoint">> = [
        "order", "name", "location", "time", "atmosphere", "characters", "endingPoint",
      ];
      source.scenes.forEach((scene, index) => {
        const next = revised.scenes[index];
        if (!next) return;
        for (const field of structuralFields) {
          if (!valuesEqual(scene[field], next[field])) issues.push(`P4_PROSE_SCENE_STRUCTURE_CHANGED:scene-${scene.order}:${field}`);
        }
      });
    }
  }

  if (issues.length > 0) throw new ScriptCreativeQualityError("P4", [...new Set(issues)]);
}
