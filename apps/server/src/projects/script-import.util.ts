import {
  formatChapterScriptDocument,
  isChapterScriptDocument,
  stripChapterScriptName,
  type ScriptImportAnalysis,
  type ScriptImportChapterBoundary,
  type ScriptImportChapterPlan,
  type ScriptImportContentType,
} from "@airoaming/shared";
import { DEFAULT_CHAPTER_TITLE } from "./project-domain.util.js";

/**
 * 剧本导入分析纯算法(从 projects.service 抽出,见任务 2026-06-24_ProjectsService拆分第二轮 候选D)。
 *
 * 这些函数零外部依赖:不碰 repository/tasks/workspacePath,只互相调用。
 * 有状态编排入口(analyzeScriptImport / importScriptToChapters)留在 Service,委托本 util。
 */

export interface AnalyzeScriptImportInput {
  sourceText: string;
  sourceName: string;
  userConfirmedOverwrite?: boolean;
}

interface ParsedScriptChapter {
  title: string;
  sourceText: string;
  summary: string;
  boundary: ScriptImportChapterBoundary;
}

interface ChapterBoundaryMatch {
  index: number;
  title: string;
  boundary: ScriptImportChapterBoundary;
}

interface ScriptTextSignals {
  nonEmptyLineCount: number;
  averageLineLength: number;
  bulletRatio: number;
  dialogueLineCount: number;
  sceneLineCount: number;
  storySentenceCount: number;
  outlineWordCount: number;
  worldbuildingWordCount: number;
}

export type { ParsedScriptChapter };

export function parseProvidedScriptChapters(sourceText: string): ParsedScriptChapter[] {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const chapterStarts: ChapterBoundaryMatch[] = [];

  lines.forEach((line, index) => {
    const boundary = extractChapterBoundary(line);
    if (boundary) {
      chapterStarts.push({ index, ...boundary });
    }
  });

  if (chapterStarts.length === 0) {
    return [{
      title: DEFAULT_CHAPTER_TITLE,
      sourceText: formatChapterSource(DEFAULT_CHAPTER_TITLE, sourceText),
      summary: summarizeScript(sourceText),
      boundary: "single_chapter",
    }];
  }

  return chapterStarts.map((start, index) => {
    const end = chapterStarts[index + 1]?.index ?? lines.length;
    const body = lines.slice(start.index + 1, end).join("\n").trim();
    return {
      title: start.title,
      sourceText: formatChapterSource(start.title, body),
      summary: summarizeScript(body || start.title),
      boundary: start.boundary,
    };
  });
}

export function extractChapterBoundary(line: string): Omit<ChapterBoundaryMatch, "index"> | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const markdownMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
  const candidate = markdownMatch ? markdownMatch[1]?.trim() ?? "" : trimmed;

  if (/^第\s*[\d一二三四五六七八九十百千万零〇两]+\s*[章节回话幕]/.test(candidate)) {
    return {
      title: candidate.replace(/[:：]\s*$/, ""),
      boundary: "explicit_chapter_heading",
    };
  }

  const numericMatch = candidate.match(/^(\d{1,3}|[一二三四五六七八九十百千万零〇两]{1,4})[.、．)]?$/);
  if (numericMatch) {
    return {
      title: `第 ${numericMatch[1]} 章`,
      boundary: "numeric_heading",
    };
  }

  return null;
}

export function createScriptImportAnalysis(input: {
  decision: ScriptImportAnalysis["decision"];
  contentType: ScriptImportContentType;
  reason: string;
  chapters: ScriptImportChapterPlan[];
  risk: string | null;
}): ScriptImportAnalysis {
  return {
    decision: input.decision,
    contentType: input.contentType,
    reason: input.reason,
    chapters: input.chapters,
    risk: input.risk,
    nextTool: input.decision === "ready_to_import" ? "import_script_to_chapters" : null,
  };
}

export function inferScriptImportContentType(sourceText: string): ScriptImportContentType {
  const text = sourceText.trim();
  if (text.length < 80) {
    return "invalid";
  }

  const signals = getScriptTextSignals(text);
  if (
    signals.worldbuildingWordCount >= 2
    && signals.storySentenceCount < 3
    && signals.dialogueLineCount === 0
  ) {
    return "worldbuilding";
  }

  if (
    signals.outlineWordCount >= 2
    || (signals.bulletRatio > 0.45 && signals.averageLineLength < 80 && signals.storySentenceCount < 4)
  ) {
    return "outline";
  }

  if (signals.dialogueLineCount >= 2 || signals.sceneLineCount >= 1) {
    return "script";
  }

  if (signals.storySentenceCount >= 4 || (text.length >= 500 && signals.storySentenceCount >= 2)) {
    return "story_prose";
  }

  return "invalid";
}

export function getScriptTextSignals(sourceText: string): ScriptTextSignals {
  const lines = sourceText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nonEmptyLineCount = lines.length;
  const totalLineLength = lines.reduce((sum, line) => sum + line.length, 0);
  const bulletLineCount = lines.filter((line) => /^([-*+]|\d+[.、．)]|[一二三四五六七八九十]+[.、．)])\s*\S+/.test(line)).length;
  const dialogueLineCount = lines.filter((line) => /^.{1,16}[：:]\s*\S+/.test(line) || /[“"].+[”"]/.test(line)).length;
  const sceneLineCount = lines.filter((line) => /^(场景|地点|时间|内景|外景|INT\.|EXT\.)/i.test(line)).length;
  const storySentenceCount = (sourceText.match(/[。！？!?]/g) ?? []).length
    + lines.filter((line) => /(走|看|说|问|发现|推开|冲|站|回头|听见|醒来|追|逃|笑|哭|沉默|望向|拿起|打开)/.test(line)).length;
  const outlineWordCount = (sourceText.match(/(大纲|提纲|梗概|章节梗概|待补|TODO|主题|卖点|目标用户)/g) ?? []).length;
  const worldbuildingWordCount = (sourceText.match(/(世界观|角色设定|人物设定|设定|能力|技能|阵营|规则|素材|画风|参考图|提示词)/g) ?? []).length;

  return {
    nonEmptyLineCount,
    averageLineLength: nonEmptyLineCount === 0 ? 0 : totalLineLength / nonEmptyLineCount,
    bulletRatio: nonEmptyLineCount === 0 ? 0 : bulletLineCount / nonEmptyLineCount,
    dialogueLineCount,
    sceneLineCount,
    storySentenceCount,
    outlineWordCount,
    worldbuildingWordCount,
  };
}

export function areNumericBoundariesCredible(chapters: ParsedScriptChapter[]): boolean {
  const numericChapters = chapters.filter((chapter) => chapter.boundary === "numeric_heading");
  if (numericChapters.length === 0) {
    return true;
  }

  if (chapters.length < 2) {
    return false;
  }

  return chapters.every((chapter) => {
    const text = chapter.sourceText.replace(/^#{1,3}\s+.+\n?/, "").trim();
    const signals = getScriptTextSignals(text);
    return text.length >= 80 && (
      signals.dialogueLineCount > 0
      || signals.sceneLineCount > 0
      || signals.storySentenceCount >= 2
    );
  });
}

export function formatChapterSource(title: string, rawText: string): string {
  const text = rawText.trim();
  if (!text) {
    return formatChapterScriptDocument({ chapterTitle: title });
  }

  if (isChapterScriptDocument(text)) {
    return stripChapterScriptName(text);
  }

  return formatChapterScriptDocument({
    chapterTitle: title,
    sourceText: text,
  });
}

export function summarizeScript(sourceText: string): string {
  const firstLine = sourceText
    .split("\n")
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
    .find((line) => line.length > 0);
  return (firstLine ?? "").slice(0, 120);
}
