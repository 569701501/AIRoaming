export const DOCUMENT_SPLITTER_POLICY_VERSION = "document_splitter_v1" as const;

export const UNASSIGNED_GROUP_LABEL = "未分章" as const;
export const SPECIAL_GROUP_LABEL = "序章/尾声/番外" as const;

export interface DocumentChapterSplitV1 {
  order: number;
  title: string;
  groupLabel: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
  anomalies: string[];
}

export interface DocumentSplitResultV1 {
  policyVersion: typeof DOCUMENT_SPLITTER_POLICY_VERSION;
  chapters: DocumentChapterSplitV1[];
  totalChars: number;
  groupLabels: string[];
}

const CN_NUM = "[一二三四五六七八九十百千万两零〇0-9０-９]";
const CN_NUM_SEQ = `${CN_NUM}+`;
// 章标题：行首的第X章/回/节/话（标准格式）
const CHAPTER_RE = new RegExp(`^第\\s*${CN_NUM_SEQ}\\s*[章回节话]`);
// 行内任意位置的第X章（用于卷章同行检测：第X卷...第Y章...）
const INLINE_CHAPTER_RE = new RegExp(`第\\s*${CN_NUM_SEQ}\\s*[章回节话]`);
  // 卷标题：行首的第X卷（独立成行或卷章同行）；正文叙述（如"第四卷的内容比之前三卷艰深很多"）行太长，不判定为卷
  const VOLUME_RE = new RegExp(`^第\\s*${CN_NUM_SEQ}\\s*卷`);
const EN_CHAPTER_RE = /^(?:chapter|CHAPTER|Chapter|Ch\.|CH\.)\s*[0-9０-９]+(?:\s|[:：.．]|$)/;
const SPECIAL_RE = /^\s*(?:序章|楔子|前言|引子|序言|尾声|后记|番外|外传|终章|完结章|题记|感言)(?:\s|[:：.．]|$)/;

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000, 万: 10000,
};
const ARABIC_FULL = { "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9" } as const;

function toArabic(value: string): string {
  return value.split("").map((char) => ARABIC_FULL[char as keyof typeof ARABIC_FULL] ?? char).join("");
}

function cnNumberToInt(value: string): number {
  const arabic = toArabic(value);
  if (/^\d+$/.test(arabic)) return Number(arabic);
  let total = 0;
  let digit = 0;
  for (const char of value) {
    const num = CN_DIGITS[char];
    if (num === undefined) continue;
    if (num >= 10) {
      total += (digit === 0 ? 1 : digit) * num;
      digit = 0;
    } else {
      digit = num;
    }
  }
  return total + digit;
}

export interface ClassifiedLineV1 {
  kind: "volume" | "chapter" | "special" | "body" | "blank";
  title: string;
  chapterNumber: number | null;
  inlineVolume: string | null;
}

export function classifyDocumentLineV1(raw: string): ClassifiedLineV1 {
  const title = raw.replace(/\r/g, "").trim();
  if (title === "") return { kind: "blank", title, chapterNumber: null, inlineVolume: null };

  // 卷章同行：第X卷...第Y章... → 章；卷作为组（卷号+完整卷名都记录，split 后按卷号归组取主导名）
  if (VOLUME_RE.test(title) && INLINE_CHAPTER_RE.test(title)) {
    const chapterNumbers = [...title.matchAll(/第\s*([一二三四五六七八九十百千万两零〇0-9０-９]+)\s*[章回节话]/g)];
    const lastChapter = chapterNumbers.at(-1);
    const volumeMatch = title.match(/^第\s*([一二三四五六七八九十百千万两零〇0-9０-９]+)\s*卷(.*?)(?=第\s*[一二三四五六七八九十百千万两零〇0-9０-９]+\s*[章回节话])/);
    const volumeLabel = volumeMatch
      ? `第${volumeMatch[1]}卷${(volumeMatch[2] ?? "").trim()}`
      : null;
    return {
      kind: "chapter",
      title,
      chapterNumber: lastChapter ? cnNumberToInt(lastChapter[1]!) : null,
      inlineVolume: volumeLabel,
    };
  }
  // 独立卷标题：第X卷 后跟标点/空白/行尾，或跟 ≤8 个字符的短名（"第一卷 风起"）；正文叙述（"第四卷的内容..."）不算
  if (VOLUME_RE.test(title)) {
    const afterVolume = title.slice(title.search(/卷/) + 1);
    const rest = afterVolume.trim();
    const isShortName = rest.length > 0 && rest.length <= 8 && !INLINE_CHAPTER_RE.test(rest);
    if (rest === "" || /^[\s·:：、.．\-—~～，,。.！!？?]*$/.test(rest) || isShortName) {
      return { kind: "volume", title, chapterNumber: null, inlineVolume: null };
    }
  }
  if (/^卷\s*[0-9０-９]+(?:\s|[:：.．]|$)/.test(title)) {
    return { kind: "volume", title, chapterNumber: null, inlineVolume: null };
  }
  if (CHAPTER_RE.test(title)) {
    const match = title.match(/第\s*([一二三四五六七八九十百千万两零〇0-9０-９]+)\s*[章回节话]/);
    return { kind: "chapter", title, chapterNumber: match ? cnNumberToInt(match[1]!) : null, inlineVolume: null };
  }
  if (EN_CHAPTER_RE.test(title)) {
    const match = title.match(/[0-9０-９]+/);
    return {
      kind: "chapter",
      title,
      chapterNumber: match ? Number(toArabic(match[0])) : null,
      inlineVolume: null,
    };
  }
  if (SPECIAL_RE.test(title)) return { kind: "special", title, chapterNumber: null, inlineVolume: null };
  return { kind: "body", title, chapterNumber: null, inlineVolume: null };
}

function computeLineOffsets(lines: readonly string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

export function splitDocumentTextV1(text: string): DocumentSplitResultV1 {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const lineOffsets = computeLineOffsets(lines);

  interface RawSection {
    startLine: number;
    endLine: number;
    title: string;
    groupLabel: string;
    chapterNumber: number | null;
  }

  const sections: RawSection[] = [];
  let currentVolume: string | null = null;
  let pending: {
    startLine: number;
    title: string;
    kind: "chapter" | "special";
    chapterNumber: number | null;
    inlineVolume: string | null;
  } | null = null;

  const closePending = (endLine: number): void => {
    if (!pending) return;
    sections.push({
      startLine: pending.startLine,
      endLine,
      title: pending.title,
      groupLabel: pending.inlineVolume
        ?? currentVolume
        ?? (pending.kind === "special" ? SPECIAL_GROUP_LABEL : UNASSIGNED_GROUP_LABEL),
      chapterNumber: pending.chapterNumber,
    });
    pending = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const classified = classifyDocumentLineV1(lines[index]!);
    if (classified.kind === "volume") {
      closePending(index);
      currentVolume = classified.title;
      continue;
    }
    if (classified.kind === "chapter" || classified.kind === "special") {
      closePending(index);
      // 卷章同行（第X卷名第Y章）更新当前卷上下文，卷内偶发漏卷前缀的章节也归入本卷
      if (classified.inlineVolume) {
        currentVolume = classified.inlineVolume;
      }
      pending = {
        startLine: index,
        title: classified.title,
        kind: classified.kind,
        chapterNumber: classified.chapterNumber,
        inlineVolume: classified.inlineVolume,
      };
      continue;
    }
    if (classified.kind === "blank" && pending) {
      // 标题后紧跟空行：空行前的标题行已足够，正文从后续非空行开始
      if (index === pending.startLine + 1) {
        closePending(index + 1);
      }
      continue;
    }
  }
  closePending(lines.length);

  // 第二层兜底：无章节标题时，按连续空行分块（仅多行文本）
  if (sections.length === 0 && lines.length > 1) {
    const blankSeparated: RawSection[] = [];
    let blockStart = 0;
    let sawContent = false;
    for (let index = 0; index < lines.length; index += 1) {
      const blank = lines[index]!.trim() === "";
      if (blank && sawContent) {
        if (index - blockStart > 0) {
          blankSeparated.push({
            startLine: blockStart,
            endLine: index,
            title: `片段 ${blankSeparated.length + 1}`,
            groupLabel: UNASSIGNED_GROUP_LABEL,
            chapterNumber: null,
          });
        }
        sawContent = false;
        blockStart = index + 1;
      } else if (!blank && !sawContent) {
        sawContent = true;
      }
    }
    if (sawContent && blockStart < lines.length) {
      blankSeparated.push({
        startLine: blockStart,
        endLine: lines.length,
        title: `片段 ${blankSeparated.length + 1}`,
        groupLabel: UNASSIGNED_GROUP_LABEL,
        chapterNumber: null,
      });
    }
    if (blankSeparated.length > 1 || (blankSeparated.length === 1 && normalized.includes("\n\n"))) {
      for (const section of blankSeparated) sections.push(section);
    }
  }

  // 第三层兜底：整篇单章
  if (sections.length === 0) {
    const trimmed = normalized.trim();
    const leading = normalized.length - normalized.trimStart().length;
    return {
      policyVersion: DOCUMENT_SPLITTER_POLICY_VERSION,
      chapters: [{
        order: 1,
        title: "全文",
        groupLabel: "全文",
        startOffset: leading,
        endOffset: leading + trimmed.length,
        charCount: trimmed.length,
        anomalies: [],
      }],
      totalChars: normalized.length,
      groupLabels: ["全文"],
    };
  }

  // 章节号连续性检查
  const numbered = sections.filter((section) => section.chapterNumber !== null);
  const anomalies: string[] = [];
  for (let index = 1; index < numbered.length; index += 1) {
    const prev = numbered[index - 1]!.chapterNumber!;
    const current = numbered[index]!.chapterNumber!;
    if (current !== prev + 1) {
      anomalies.push(`章节号断裂：第 ${prev} 章后接第 ${current} 章`);
    }
  }

  // 卷名归一化：同一卷号的残缺卷名（原文件错字，如"第十卷"vs"第十卷魔界之战"）统一为出现次数最多的完整卷名
  const volumeNameCounts = new Map<string, Map<string, number>>();
  for (const section of sections) {
    const match = section.groupLabel.match(/^第([一二三四五六七八九十百千万两零〇0-9０-９]+)卷/);
    if (!match) continue;
    const volumeNumber = `第${match[1]}卷`;
    if (!volumeNameCounts.has(volumeNumber)) volumeNameCounts.set(volumeNumber, new Map());
    const variants = volumeNameCounts.get(volumeNumber)!;
    variants.set(section.groupLabel, (variants.get(section.groupLabel) ?? 0) + 1);
  }
  const dominantVolumeName = new Map<string, string>();
  for (const [volumeNumber, variants] of volumeNameCounts) {
    let dominant = volumeNumber;
    let maxCount = 0;
    for (const [name, count] of variants) {
      if (count > maxCount) {
        dominant = name;
        maxCount = count;
      }
    }
    dominantVolumeName.set(volumeNumber, dominant);
  }
  const sectionsWithNormalizedVolume = sections.map((section) => {
    const match = section.groupLabel.match(/^第([一二三四五六七八九十百千万两零〇0-9０-９]+)卷/);
    if (!match) return section;
    const normalized = dominantVolumeName.get(`第${match[1]}卷`);
    return normalized && normalized !== section.groupLabel
      ? { ...section, groupLabel: normalized }
      : section;
  });

  const chapters: DocumentChapterSplitV1[] = sectionsWithNormalizedVolume.map((section, index) => {
    const startOffset = lineOffsets[section.startLine] ?? 0;
    const endOffset = index + 1 < sections.length
      ? (lineOffsets[sections[index + 1]!.startLine] ?? normalized.length)
      : normalized.length;
    return {
      order: index + 1,
      title: section.title,
      groupLabel: section.groupLabel,
      startOffset,
      endOffset,
      charCount: Math.max(0, endOffset - startOffset),
      anomalies: [],
    };
  });

  const groupLabels = [...new Set(chapters.map((chapter) => chapter.groupLabel))].sort((a, b) => {
    const aSpecial = a === SPECIAL_GROUP_LABEL || a === UNASSIGNED_GROUP_LABEL;
    const bSpecial = b === SPECIAL_GROUP_LABEL || b === UNASSIGNED_GROUP_LABEL;
    if (aSpecial !== bSpecial) return aSpecial ? 1 : -1;
    return a.localeCompare(b, "zh-CN");
  });

  return {
    policyVersion: DOCUMENT_SPLITTER_POLICY_VERSION,
    chapters,
    totalChars: normalized.length,
    groupLabels,
  };
}
