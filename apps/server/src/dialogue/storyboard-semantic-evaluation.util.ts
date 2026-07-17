import type { StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import { extractJsonPayload } from "./dialogue-json.util.js";

export const STORYBOARD_SEMANTIC_COVERAGE_STATUSES = [
  "covered",
  "partial",
  "missing",
  "contradicted",
] as const;

export type StoryboardSemanticCoverageStatus = typeof STORYBOARD_SEMANTIC_COVERAGE_STATUSES[number];
export type StoryboardSemanticEvaluationOverallStatus = "pass" | "warning" | "fail";

export interface StoryboardBeatSemanticEvaluation {
  beatId: string;
  summaryStatus: StoryboardSemanticCoverageStatus;
  outcomeStatus: StoryboardSemanticCoverageStatus;
  evidenceShotOrders: number[];
  missingFacts: string[];
  contradictions: string[];
  reason: string;
}

export interface StoryboardSemanticEvaluationReport {
  schemaVersion: 1;
  overallStatus: StoryboardSemanticEvaluationOverallStatus;
  summary: {
    beatCount: number;
    coveredDimensions: number;
    partialDimensions: number;
    missingDimensions: number;
    contradictedDimensions: number;
  };
  beats: StoryboardBeatSemanticEvaluation[];
}

export class StoryboardSemanticEvaluationContractError extends Error {
  readonly code = "STORYBOARD_SEMANTIC_EVALUATION_CONTRACT_FAILED";

  constructor(readonly issues: readonly string[]) {
    super(`${"STORYBOARD_SEMANTIC_EVALUATION_CONTRACT_FAILED"}:${issues.join(",")}`);
  }
}

const ROOT_KEYS = ["beats"] as const;
const BEAT_KEYS = [
  "beatId",
  "summaryStatus",
  "outcomeStatus",
  "evidenceShotOrders",
  "missingFacts",
  "contradictions",
  "reason",
] as const;
const STATUS_SET = new Set<string>(STORYBOARD_SEMANTIC_COVERAGE_STATUSES);

function asExactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`OBJECT_REQUIRED:${path}`);
    return {};
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) issues.push(`UNKNOWN_FIELD:${path}.${key}`);
  }
  for (const key of keys) {
    if (!(key in record)) issues.push(`FIELD_REQUIRED:${path}.${key}`);
  }
  return record;
}

function stringField(record: Record<string, unknown>, key: string, path: string, issues: string[]): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`STRING_REQUIRED:${path}.${key}`);
    return "";
  }
  return value.trim();
}

function statusField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
): StoryboardSemanticCoverageStatus {
  const value = record[key];
  if (typeof value !== "string" || !STATUS_SET.has(value)) {
    issues.push(`STATUS_INVALID:${path}.${key}`);
    return "missing";
  }
  return value as StoryboardSemanticCoverageStatus;
}

function stringArrayField(record: Record<string, unknown>, key: string, path: string, issues: string[]): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push(`STRING_ARRAY_REQUIRED:${path}.${key}`);
    return [];
  }
  const result: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      issues.push(`STRING_REQUIRED:${path}.${key}[${index}]`);
      return;
    }
    result.push(item.trim());
  });
  return result;
}

function orderArrayField(record: Record<string, unknown>, path: string, issues: string[]): number[] {
  const value = record.evidenceShotOrders;
  if (!Array.isArray(value)) {
    issues.push(`INTEGER_ARRAY_REQUIRED:${path}.evidenceShotOrders`);
    return [];
  }
  const result: number[] = [];
  value.forEach((item, index) => {
    if (!Number.isInteger(item) || Number(item) < 1) {
      issues.push(`POSITIVE_INTEGER_REQUIRED:${path}.evidenceShotOrders[${index}]`);
      return;
    }
    const order = Number(item);
    if (result.includes(order)) issues.push(`EVIDENCE_SHOT_DUPLICATE:${path}:${order}`);
    else result.push(order);
  });
  return result;
}

function compactStoryboardEvidence(structure: Pick<StoryStructureJson, "beats">, storyboard: StoryboardJson): unknown[] {
  return structure.beats.map((beat) => ({
    beatId: beat.id,
    shots: storyboard.shots
      .filter((shot) => shot.beatId === beat.id)
      .map((shot) => ({
        order: shot.order,
        coreAction: shot.coreAction,
        comic: {
          panelDescription: shot.comic.panelDescription,
          dialogue: shot.comic.dialogue,
          caption: shot.comic.caption,
        },
        motion: {
          visualDescription: shot.motion.visualDescription,
          voiceLines: shot.motion.voiceLines.map((line) => ({ name: line.name, line: line.line })),
        },
      })),
  }));
}

export function buildStoryboardSemanticEvaluationPrompt(
  structure: Pick<StoryStructureJson, "beats">,
  storyboard: StoryboardJson,
): string {
  const beatFacts = structure.beats.map((beat) => ({
    beatId: beat.id,
    order: beat.order,
    title: beat.title,
    summary: beat.summary,
    outcome: beat.outcome,
  }));
  return [
    "你正在执行 AI漫游 P6 分镜 Beat 语义覆盖评测。只做评测，不修改任何输入，也不提出新剧情或修订方案。",
    "任务：逐 Beat 对照 StoryStructure 的 summary/outcome 与该 Beat 现有镜头中可观察的漫画画面、漫画对白/旁白、漫剧画面和配音。分别判断 summary 与 outcome。",
    "状态只能使用 covered / partial / missing / contradicted：",
    "- covered：核心事件、因果或状态变化已直接可见或可听见；允许同义表达，不要求逐字重合。",
    "- partial：核心方向存在，但关键触发、对象、因果、决定性动作或结果只被暗示或弱化。",
    "- missing：镜头中没有足够证据让观众得到该事实。",
    "- contradicted：镜头明确表现了与结构事实相反的事件或结果。",
    "评测边界：",
    "- 不评价画风、构图美感、运镜偏好、镜头数量或商业节奏。",
    "- 不因措辞不同判缺失；只判断观众能否从实际画面或声音获得事实。",
    "- 不用下一 Beat 的镜头替当前 Beat 补证据；evidenceShotOrders 只能引用当前 beatId 下的镜头序号。",
    "- partial 或 missing 必须在 missingFacts 写清缺少的事实；contradicted 必须在 contradictions 写清相反内容。",
    "- 每个 Beat 恰好输出一项，顺序和 beatId 必须与输入一致；不要输出总分或 overallStatus，它由本地计算。",
    "- 只返回一个 JSON 对象，不要代码块、解释或额外字段。",
    "输出结构：",
    JSON.stringify({
      beats: [{
        beatId: "beat_01",
        summaryStatus: "covered",
        outcomeStatus: "partial",
        evidenceShotOrders: [1],
        missingFacts: ["缺少的关键触发或结果"],
        contradictions: [],
        reason: "一句简洁证据判断",
      }],
    }, null, 2),
    "待评测 Beat 事实：",
    JSON.stringify(beatFacts, null, 2),
    "按 Beat 聚合的现有镜头证据：",
    JSON.stringify(compactStoryboardEvidence(structure, storyboard), null, 2),
  ].join("\n\n");
}

export function parseStoryboardSemanticEvaluation(
  content: string,
  structure: Pick<StoryStructureJson, "beats">,
  storyboard: StoryboardJson,
): StoryboardSemanticEvaluationReport {
  const issues: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(content)) as unknown;
  } catch (error) {
    throw new StoryboardSemanticEvaluationContractError([
      `JSON_INVALID:${error instanceof Error ? error.message : "unknown"}`,
    ]);
  }
  const root = asExactRecord(parsed, ROOT_KEYS, "root", issues);
  const rawBeats = root.beats;
  if (!Array.isArray(rawBeats)) issues.push("BEATS_ARRAY_REQUIRED");
  const items = Array.isArray(rawBeats) ? rawBeats : [];
  if (items.length !== structure.beats.length) {
    issues.push(`BEAT_COUNT:${items.length}:${structure.beats.length}`);
  }

  const beats: StoryboardBeatSemanticEvaluation[] = [];
  items.forEach((value, index) => {
    const path = `beats[${index}]`;
    const record = asExactRecord(value, BEAT_KEYS, path, issues);
    const beatId = stringField(record, "beatId", path, issues);
    const expectedBeat = structure.beats[index];
    if (expectedBeat && beatId !== expectedBeat.id) {
      issues.push(`BEAT_ORDER:${path}:${beatId}:${expectedBeat.id}`);
    }
    const summaryStatus = statusField(record, "summaryStatus", path, issues);
    const outcomeStatus = statusField(record, "outcomeStatus", path, issues);
    const evidenceShotOrders = orderArrayField(record, path, issues);
    const missingFacts = stringArrayField(record, "missingFacts", path, issues);
    const contradictions = stringArrayField(record, "contradictions", path, issues);
    const reason = stringField(record, "reason", path, issues);
    const allowedOrders = new Set(
      storyboard.shots.filter((shot) => shot.beatId === expectedBeat?.id).map((shot) => shot.order),
    );
    evidenceShotOrders.forEach((order) => {
      if (!allowedOrders.has(order)) issues.push(`EVIDENCE_SHOT:${path}:${order}:${expectedBeat?.id ?? "unknown"}`);
    });
    const statuses = [summaryStatus, outcomeStatus];
    if (statuses.some((status) => status !== "missing") && evidenceShotOrders.length === 0) {
      issues.push(`EVIDENCE_REQUIRED:${path}`);
    }
    const needsMissingFacts = statuses.some((status) => status === "partial" || status === "missing");
    if (needsMissingFacts && missingFacts.length === 0) {
      issues.push(`MISSING_FACT_REQUIRED:${path}`);
    }
    if (!needsMissingFacts && missingFacts.length > 0) {
      issues.push(`MISSING_FACT_UNEXPECTED:${path}`);
    }
    const needsContradictions = statuses.includes("contradicted");
    if (needsContradictions && contradictions.length === 0) {
      issues.push(`CONTRADICTION_REQUIRED:${path}`);
    }
    if (!needsContradictions && contradictions.length > 0) {
      issues.push(`CONTRADICTION_UNEXPECTED:${path}`);
    }
    beats.push({
      beatId,
      summaryStatus,
      outcomeStatus,
      evidenceShotOrders,
      missingFacts,
      contradictions,
      reason,
    });
  });

  if (issues.length > 0) throw new StoryboardSemanticEvaluationContractError([...new Set(issues)]);
  const statuses = beats.flatMap((beat) => [beat.summaryStatus, beat.outcomeStatus]);
  const count = (status: StoryboardSemanticCoverageStatus): number => statuses.filter((item) => item === status).length;
  const contradictedDimensions = count("contradicted");
  const partialDimensions = count("partial");
  const missingDimensions = count("missing");
  return {
    schemaVersion: 1,
    overallStatus: contradictedDimensions > 0
      ? "fail"
      : partialDimensions > 0 || missingDimensions > 0
        ? "warning"
        : "pass",
    summary: {
      beatCount: beats.length,
      coveredDimensions: count("covered"),
      partialDimensions,
      missingDimensions,
      contradictedDimensions,
    },
    beats,
  };
}
