/**
 * DialogueService 意图分类器(从 dialogue.service.ts 抽出)。
 *
 * 这些是纯正则/关键词判定函数,无状态依赖,决定用户消息应触发哪个对话工作流。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */
import type {
  ChapterListItem,
  ScriptInspirationSeed,
  SendDialogueMessageRequest,
  WorkbenchSnapshot,
} from "@airoaming/shared";

/** 批量生成章节的上限保护,防止 AI 失控无限生成(见 ADR-0008 三期)。 */
export const MAX_BATCH_CHAPTERS = 20;

// ---------- 生成意图判定 ----------

export function shouldGenerateInspirationSeeds(input: SendDialogueMessageRequest): { trigger: boolean; mode: "inspiration" | "topic" } {
  if (input.intent === "generate_inspiration_seeds") {
    return { trigger: true, mode: "inspiration" };
  }

  const content = input.content.trim();
  // 寻求创意类:找我灵感/点子/方向 → 走 3 选 1
  const inspirationMatch = /(帮我|给我|给点|给些|给几个|想|找|生成|来点|来几个|有没有).{0,10}(灵感|点子|创意|方向|题材|故事种子)|没有灵感|没想法|不知道写什么/.test(content);
  if (inspirationMatch) {
    return { trigger: true, mode: "inspiration" };
  }
  // 直接要内容类:生成 XX 篇/写个故事/生成 N 章/编个剧本 → 绕过种子直接生成大纲(见 task 2026-06-21_直接题材生成大纲)
  // 限定含故事/篇/章/剧本/剧情等内容词,避免误触别阶段(如"生成角色图")。
  const directContentMatch = /(生成|写|编|来|弄).{0,12}(故事|篇|章|剧本|剧情|小说|番外)/.test(content)
    || /(故事|篇|章|剧本|剧情).{0,6}(大纲|梗概|骨架|框架)/.test(content);
  if (directContentMatch) {
    return { trigger: true, mode: "topic" };
  }
  return { trigger: false, mode: "inspiration" };
}

export function shouldGenerateStoryStructure(input: SendDialogueMessageRequest): boolean {
  if (input.intent === "generate_story_structure") {
    return true;
  }

  const content = input.content.trim();
  return /(生成|整理|拆|做|创建|重新生成).{0,12}(剧情结构|剧本结构|结构化剧情|故事结构|story_parse)/.test(content)
    || /剧情结构/.test(content);
}

export function shouldGenerateProjectCharacters(input: SendDialogueMessageRequest): boolean {
  if (input.intent === "generate_project_characters") {
    return true;
  }

  const content = input.content.trim();
  return /(生成|提取|整理|创建|做).{0,12}(项目角色库|角色库|项目角色|角色定稿|主要角色|常驻角色)/.test(content)
    || /角色库/.test(content);
}

export function shouldGenerateStoryboard(input: SendDialogueMessageRequest): boolean {
  if (input.intent === "generate_storyboard") {
    return true;
  }

  const content = input.content.trim();
  return /(生成|整理|拆|做|创建|重新生成).{0,12}(分镜|镜头|storyboard|shot)/.test(content)
    || /分镜工作台/.test(content);
}

// ---------- 确认/取消判定 ----------

export function isConfirmingStoryStructure(content: string): boolean {
  const text = content.trim();
  if (/(不行|不可以|不满意|不要|先别|取消)/.test(text)) {
    return false;
  }

  return /^(确认|可以|继续|同意|就这个|没问题|通过)$/.test(text)
    || /(确认|通过|保存).{0,10}(剧情结构|剧本结构|结构)/.test(text)
    || /(按这个|就这个).{0,8}(保存|确认|继续)/.test(text);
}

export function isConfirmingStoryStructureRegeneration(content: string): boolean {
  return /(确认|确定|同意).{0,10}(重新生成|重生成|覆盖).{0,10}(剧情结构|剧本结构|结构)/.test(content.trim())
    || /(重新生成|重生成).{0,8}(剧情结构|剧本结构|结构)/.test(content.trim());
}

export function isConfirmingStoryboard(content: string): boolean {
  const text = content.trim();
  if (/(不行|不可以|不满意|不要|先别|取消)/.test(text)) {
    return false;
  }

  return /^(确认|可以|继续|同意|就这个|没问题|通过)$/.test(text)
    || /(确认|通过|保存).{0,10}(分镜|镜头|storyboard)/.test(text)
    || /(按这个|就这个).{0,8}(保存|确认|继续)/.test(text);
}

export function isConfirmingStoryboardRegeneration(content: string): boolean {
  return /(确认|确定|同意).{0,10}(重新生成|重生成|覆盖).{0,10}(分镜|镜头|storyboard)/.test(content.trim())
    || /(重新生成|重生成).{0,8}(分镜|镜头|storyboard)/.test(content.trim());
}

export function isConfirmingScriptImport(content: string): boolean {
  return /(确认|可以|继续|同意|覆盖).{0,8}(导入|写入|覆盖|继续)|确认导入|继续导入|确认覆盖/.test(content.trim());
}

export function isCancellingScriptImport(content: string): boolean {
  return /(取消|不要|先不|不导入|别导入|算了).{0,8}(导入|写入|覆盖)?/.test(content.trim());
}

export function isConfirmingScriptOutline(content: string): boolean {
  const text = content.trim();
  if (/(不行|不可以|不满意|不喜欢|先别|不要)/.test(text)) {
    return false;
  }

  return /^(确认|可以|继续|同意|就这个|没问题|通过)$/.test(text)
    || /(确认|通过).{0,8}(大纲|方向)/.test(text)
    || /(按这个|就这个).{0,8}(生成|写|继续)/.test(text);
}

/**
 * A4 只接受显式的当前章节生成命令。章节切换、裸“继续”、只说“第 2 章”
 * 都不属于生成命令；页面确认按钮通过 intent 明确表达同一动作。
 */
export function isExplicitlyRequestingChapterGeneration(input: SendDialogueMessageRequest): boolean {
  if (input.intent === "generate_script_from_outline") return true;
  const text = input.content.trim();
  if (/(不生成|别生成|不要写|先别写|取消)/.test(text)) return false;
  const generateVerb = /(生成|写|起草|创作|开始写|帮我写|重新生成|重写)/;
  const chapterTarget = /(?:当前章|当前章节|这一章|这章|本章|下一章|第\s*[0-9一二三四五六七八九十百千万零〇两]+\s*(?:章|话))/;
  return generateVerb.test(text) && chapterTarget.test(text);
}

export function isCancellingScriptOutline(content: string): boolean {
  return /(取消|不要|先不|不生成|别生成|算了).{0,10}(大纲|第一章|章节|生成)?/.test(content.trim());
}

export function isCancellingInspiration(content: string): boolean {
  return /(取消|不要|先不|不选|换一批|重新来|算了).{0,8}(灵感|方向|种子|生成)?/.test(content.trim());
}

// ---------- 灵感种子选择判定 ----------

export function isBareInspirationOrder(content: string): boolean {
  return /^[1-9一二三四五六七八九十]$/.test(content.trim());
}

export function isSelectingInspirationSeed(content: string): boolean {
  const normalized = content.trim();
  return isBareInspirationOrder(normalized)
    || /(选|选择|就|要|用|按|喜欢|定|决定|生成|写|这个|那个|第)\s*[1-9一二三四五六七八九十这个那种条号方向]/.test(normalized)
    || /第\s*[1-9一二三四五六七八九十]\s*(个|条|号|种|方向)?/.test(normalized);
}

export function parseChineseOrder(value: string): number {
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  if (map[value]) {
    return map[value];
  }

  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const tensText = value.slice(0, tenIndex);
    const onesText = value.slice(tenIndex + 1);
    const tens = tensText ? map[tensText] : 1;
    const ones = onesText ? map[onesText] : 0;
    return tens && ones >= 0 ? tens * 10 + ones : 0;
  }

  return 0;
}

export function findSeedByContent(content: string, seeds: ScriptInspirationSeed[]): ScriptInspirationSeed | null {
  const normalized = content.trim();
  const numericMatch = normalized.match(/(?:选|选择|就|要|用|按|第)\s*([1-9一二三四五六七八九十])\s*(?:个|条|号|种|方向)?/)
    ?? normalized.match(/([1-9一二三四五六七八九十])\s*(?:个|条|号|种|方向)/)
    ?? (isBareInspirationOrder(normalized) ? normalized.match(/^([1-9一二三四五六七八九十])$/) : null);
  if (numericMatch) {
    const order = parseChineseOrder(numericMatch[1]);
    const seed = seeds.find((item) => item.order === order);
    if (seed) {
      return seed;
    }
  }

  return seeds.find((seed) => normalized.includes(seed.title)
    || seed.genreTags.some((tag) => normalized.includes(tag))
    || normalized.includes(seed.title.slice(0, 4))) ?? null;
}

export function resolveSelectedInspirationSeed(
  input: SendDialogueMessageRequest,
  seeds: ScriptInspirationSeed[],
): ScriptInspirationSeed | null {
  if ((input.intent === "generate_script_from_seed" || input.intent === "generate_script_outline_from_seed") && seeds.length > 0) {
    return findSeedByContent(input.content, seeds) ?? seeds[0];
  }

  return findSeedByContent(input.content, seeds);
}

// ---------- 章节草稿更新判定 ----------

export function shouldUpdateChapterDraft(input: SendDialogueMessageRequest, snapshot: WorkbenchSnapshot): boolean {
  if (input.intent === "update_chapter_draft") {
    return true;
  }

  const content = input.content.trim();
  const hasChapterText = (input.context?.sourceText ?? snapshot.currentChapter?.sourceText ?? "").trim().length > 0;
  if (!hasChapterText) {
    return false;
  }

  const asksForCurrentChapter = /(这一章|这章|当前章|当前章节|本章|这段|当前草稿|剧本)/.test(content);
  const asksForRewrite = /(改|改写|润色|重写|调整|优化|压缩|扩写|加强|写得|变得|更紧张|更刺激|节奏|对白|冲突)/.test(content);
  return asksForRewrite && (asksForCurrentChapter || /润色对白|优化开场|加强冲突|节奏加快|写得更紧张/.test(content));
}

// ---------- 章节目标解析 ----------

export function toScriptFromOutlineTarget(chapter: ChapterListItem): { id: string; title: string; order: number } {
  return {
    id: chapter.id,
    title: chapter.title,
    order: chapter.order,
  };
}

export function resolveRequestedScriptChapterOrder(content: string, snapshot: WorkbenchSnapshot): number | null {
  const text = content.trim();
  const explicitMatch = text.match(/第\s*([0-9一二三四五六七八九十]+)\s*(?:章|张|话)/)
    ?? text.match(/([0-9一二三四五六七八九十]+)\s*(?:章|张|话)/);
  if (explicitMatch) {
    return parseChineseOrder(explicitMatch[1]) || null;
  }

  if (/下一章/.test(text)) {
    const currentOrder = snapshot.currentChapter?.order
      ?? snapshot.chapters.find((chapter) => chapter.id === snapshot.currentChapter?.id)?.order
      ?? null;
    return currentOrder ? currentOrder + 1 : null;
  }

  return null;
}

/**
 * 识别批量生成章节意图,返回 { start, count } 或 null。
 * 支持:"生成整本/全部章节"(默认从 1 开始,上限 MAX_BATCH_CHAPTERS)、
 * "生成前 N 章"、"生成 N 章"、"从第 X 章生成到第 Y 章"。
 * start 从 1 起;count 为要生成的章数。
 */
export function resolveBatchChapterRange(content: string): { start: number; count: number } | null {
  const text = content.trim();

  // 从第 X 章生成到第 Y 章 / 第 X-Y 章
  const rangeMatch = text.match(/(?:从\s*)?第?\s*([0-9一二三四五六七八九十]+)\s*[章话]?\s*(?:到|至|-|~|—)\s*第?\s*([0-9一二三四五六七八九十]+)\s*[章话]/);
  if (rangeMatch) {
    const startOrder = parseChineseOrder(rangeMatch[1]);
    const endOrder = parseChineseOrder(rangeMatch[2]);
    if (startOrder && endOrder && endOrder >= startOrder) {
      return { start: startOrder, count: endOrder - startOrder + 1 };
    }
  }

  // 前N章 / 生成N章 / 后续N章
  const countMatch = text.match(/(?:前|生成|后续|接下去|接着生成|连续生成)\s*([0-9一二三四五六七八九十]+)\s*章/);
  if (countMatch) {
    const count = parseChineseOrder(countMatch[1]);
    if (count && count > 0) {
      const startOrder = text.match(/从\s*第?\s*([0-9一二三四五六七八九十]+)\s*章/);
      const start = startOrder ? (parseChineseOrder(startOrder[1]) ?? 1) : 1;
      return { start, count };
    }
  }

  // 整本 / 全部 / 所有章节
  if (/(整本|全部章节|所有章节|全部生成|生成全部|批量生成|连续生成)/.test(text)) {
    return { start: 1, count: MAX_BATCH_CHAPTERS };
  }

  return null;
}

// ---------- 剧本导入/附件判定 ----------

export function getTextAttachments(attachments: { name: string; mimeType: string; content: string }[] | undefined): { name: string; mimeType: string; content: string }[] {
  return (attachments ?? []).filter((attachment) => {
    const name = attachment.name.toLowerCase();
    return (name.endsWith(".txt") || name.endsWith(".md") || attachment.mimeType.startsWith("text/"))
      && attachment.content.trim().length > 0;
  });
}

export function formatAttachmentContext(attachments: { name: string; mimeType: string; content: string }[] | undefined): string {
  const textAttachments = getTextAttachments(attachments);
  if (textAttachments.length === 0) {
    return "";
  }

  return textAttachments
    .map((attachment) => `【${attachment.name}】\n${attachment.content.trim()}`)
    .join("\n\n");
}

export function hasScriptPayload(input: SendDialogueMessageRequest): boolean {
  return getTextAttachments(input.attachments as { name: string; mimeType: string; content: string }[] | undefined).length > 0
    || input.content.trim().length >= 1200;
}

export function shouldOrganizeProvidedScript(input: SendDialogueMessageRequest): boolean {
  if (input.intent === "organize_script_to_chapters") {
    return true;
  }

  const content = input.content.trim();
  const hasAttachment = getTextAttachments(input.attachments as { name: string; mimeType: string; content: string }[] | undefined).length > 0;
  const hasExplicitIntent = /(整理|拆分|拆成|导入|写入).{0,8}(章节|剧本)|按章节|整理成章节/.test(content);
  if (hasExplicitIntent) {
    return true;
  }

  if (hasAttachment) {
    return false;
  }

  return content.length >= 1200;
}
