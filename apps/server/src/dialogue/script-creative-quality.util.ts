import type { ScriptInspirationSeed, ScriptOutlineDocumentV1 } from "@airoaming/shared";

export type ScriptCreativeQualityGate = "P1" | "P2";

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
