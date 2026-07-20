import type {
  CandidateVisualIssue,
  ProjectCharacterEntityType,
} from "@airoaming/shared";

export interface CandidateVisualQualityCharacter {
  name: string;
  entityType: ProjectCharacterEntityType;
}

export interface CandidateVisualQualityInput {
  visualDescription: string;
  action: string;
  composition: string;
  characters: readonly CandidateVisualQualityCharacter[];
}

const TEXT_REQUIREMENT = /(?:文字|字样|字迹|写着|写有|刻着|刻有|显示(?:出|着|了)?(?:文字|字样|字迹|数字|编号|名称)|数字|编号|字母|标题|字幕|对话框|对白框|气泡|旁白框|拟声词|\btext\b|\bletters?\b|\bnumbers?\b|\bsubtitle\b|\bcaption\b|\bspeech bubbles?\b)/gi;
const TEXT_NEGATION_PREFIX = /(?:不|无|不要|不得|禁止|避免|去除|没有|无需)(?:再)?(?:生成|出现|包含|保留|带有|画出|显示|写出)?(?:任何)?\s*$/i;
const LOCATION_TRANSITION = /(?:[-=]?>|→|转到|切到|来到|转入|切入|换到|随后来到|镜头切换至)/;
const LOCATION_TRANSITION_WORDS = /(?:转到|切到|来到|转入|切入|换到|随后来到|镜头切换至)/;
const MOMENT_SEQUENCE = /(?:先.{0,24}再|随后|然后|继而|接着|片刻后|数秒后|数十秒|分钟后|一两分钟|开始.{0,32}最终|从.{0,24}开始.{0,32}结束)/;
const NON_VISUAL = /(?:气味|味道|闻到|闻见|听到|听见|声音|咳声|心想|内心|意识到|想起|感觉到|数十秒|一两分钟)/;
const IDENTITY_SHEET = /(?:角色设定图|人物设定图|三视图|四视图|正面半身|正面立绘|纯白背景|白底设定|联系表|contact sheet|character sheet)/i;
const PERSON_COUNT = /([0-9]+|[\u4e00二两三四五六七八九十百]+)\s*(?:人|名|个(?:人|人物|角色))/g;
const EXACT_GROUP_COUNT_SOURCE = String.raw`(?:[0-9]+|[一二两三四五六七八九十百]+|数十|几十|十余)\s*(?:人|名|个(?:人|人物|角色)|队员|守卫|士兵|村民|成员)`;
const NEUTRAL_GROUP_RANGE_SOURCE = String.raw`(?:数名|几名|若干名|一群|一队|成群|大批|一众|若干)`;
const GROUP_QUANTITY_PREFIX_SOURCE = `(?:${EXACT_GROUP_COUNT_SOURCE}|${NEUTRAL_GROUP_RANGE_SOURCE})`;
const GROUP_COUNT_HINT = new RegExp(
  `(?:${EXACT_GROUP_COUNT_SOURCE}|${NEUTRAL_GROUP_RANGE_SOURCE}\\s*(?:人|人群|众人|队员|守卫|士兵|村民|成员|商队成员|商队众人|群众|追兵))`,
  "u",
);

export function findCandidateVisualIssues(input: CandidateVisualQualityInput): CandidateVisualIssue[] {
  const visual = input.visualDescription.trim();
  const action = input.action.trim();
  const composition = input.composition.trim();
  const combined = [visual, action, composition].filter(Boolean).join("\n");
  const issues: CandidateVisualIssue[] = [];

  if (!visual) {
    issues.push(issue("VISUAL_DESCRIPTION_MISSING", "blocking", "visual", "请先填写一个能被单帧画出来的画面瞬间。"));
  }
  if (requiresRenderedText(combined)) {
    issues.push(issue("VISUAL_TEXT_CONFLICT", "blocking", "visual", "当前描述要求画出文字、数字或气泡，但候选底图合同明确禁止文字。"));
  }
  if (hasStaticVisualLocationTransition({
    visualDescription: visual,
    action,
    composition,
  })) {
    issues.push(issue("VISUAL_MULTIPLE_LOCATIONS", "blocking", "visual", "当前描述包含地点切换；一张候选图只能锁定一个地点。"));
  }
  if (MOMENT_SEQUENCE.test(combined)) {
    issues.push(issue("VISUAL_MULTIPLE_MOMENTS", "blocking", "visual", "当前描述串联了多个先后动作或时间跨度；请只保留一个决定性瞬间。"));
  }
  if (NON_VISUAL.test(combined)) {
    issues.push(issue("VISUAL_NON_VISUAL_INFORMATION", "warning", "visual", "描述中含声音、气味、心理或时长等不能直接入画的信息，建议改成有来源的可见结果。"));
  }
  if (IDENTITY_SHEET.test(combined)) {
    issues.push(issue("VISUAL_IDENTITY_SHEET_LANGUAGE", "warning", "visual", "镜头描述混入了角色设定图/三视图语言；候选图应只写当前剧情镜头。"));
  }

  const nonVoiceCharacters = input.characters.filter((character) => character.entityType !== "voice");
  const collectiveCharacters = nonVoiceCharacters.filter((character) => character.entityType === "group");
  const individualCharacters = nonVoiceCharacters.filter((character) => character.entityType !== "group");
  const humanCharacters = individualCharacters.filter((character) => character.entityType === "human");
  if (
    collectiveCharacters.length > 0
    && !extractCollectiveCountHint(combined, collectiveCharacters.map((character) => character.name))
  ) {
    issues.push(issue("VISUAL_GROUP_COUNT_MISSING", "blocking", "characters", `群体角色“${collectiveCharacters.map((character) => character.name).join("、")}”没有人数或范围，模型会把整群人误当成一个人。`));
  }

  if (collectiveCharacters.length === 0) {
    // 总人数只能由“画面”段声明；动作里的“其中一人/另一人”不是总人数。
    const explicitCounts = extractPersonCounts(visual);
    if (explicitCounts.length > 0 && !explicitCounts.includes(humanCharacters.length)) {
      issues.push(issue("VISUAL_SUBJECT_COUNT_CONFLICT", "blocking", "characters", `分镜绑定 ${humanCharacters.length} 个人类角色，但描述中的明确人数不一致。`));
    }
  }

  if (individualCharacters.length >= 2) {
    const namedCount = individualCharacters.filter((character) => combined.includes(character.name)).length;
    if (namedCount < 2) {
      issues.push(issue("VISUAL_ACTOR_RELATION_UNCLEAR", "warning", "action", "多人镜头没有同时点明至少两个角色的动作、承受或视线关系，容易交换主客体。"));
    }
  }

  return dedupeIssues(issues);
}

export function hasBlockingCandidateVisualIssues(issues: readonly CandidateVisualIssue[]): boolean {
  return issues.some((item) => item.severity === "blocking");
}

/**
 * 画面/动作里的箭头通常表示连续地点或阶段；构图里的箭头允许表达同一帧的空间阅读动线。
 * 构图仍拒绝“切到/转到/来到”等明确地点转换语言。
 */
export function hasStaticVisualLocationTransition(input: {
  visualDescription: string;
  action: string;
  composition: string;
}): boolean {
  const content = [input.visualDescription, input.action].filter(Boolean).join("\n");
  return LOCATION_TRANSITION.test(content) || LOCATION_TRANSITION_WORDS.test(input.composition);
}

export function extractCollectiveCountHint(
  value: string,
  collectiveNames: readonly string[] = [],
): string | null {
  for (const name of [...collectiveNames].sort((left, right) => right.length - left.length)) {
    if (!name.trim()) continue;
    const beforeBoundName = new RegExp(
      `(${GROUP_QUANTITY_PREFIX_SOURCE})\\s*(?=${escapeRegExp(name.trim())})`,
      "u",
    );
    const boundMatch = value.match(beforeBoundName)?.[1]?.trim();
    if (boundMatch) return boundMatch;
  }
  return value.match(GROUP_COUNT_HINT)?.[0]?.trim() ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requiresRenderedText(value: string): boolean {
  for (const match of value.matchAll(TEXT_REQUIREMENT)) {
    const prefix = value.slice(Math.max(0, match.index - 16), match.index);
    if (!TEXT_NEGATION_PREFIX.test(prefix)) return true;
  }
  return false;
}

function extractPersonCounts(value: string): number[] {
  const counts: number[] = [];
  for (const match of value.matchAll(PERSON_COUNT)) {
    const parsed = parseCount(match[1] ?? "");
    if (parsed !== null) counts.push(parsed);
  }
  return [...new Set(counts)];
}

function parseCount(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("百")) return null;
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    const tens = left ? digits[left] : 1;
    const ones = right ? digits[right] : 0;
    return tens === undefined || ones === undefined ? null : tens * 10 + ones;
  }
  return digits[value] ?? null;
}

function issue(
  code: CandidateVisualIssue["code"],
  severity: CandidateVisualIssue["severity"],
  field: CandidateVisualIssue["field"],
  message: string,
): CandidateVisualIssue {
  return { code, severity, field, message };
}

function dedupeIssues(issues: CandidateVisualIssue[]): CandidateVisualIssue[] {
  return issues.filter((item, index) => issues.findIndex((candidate) => candidate.code === item.code) === index);
}
