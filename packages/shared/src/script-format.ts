export const SCRIPT_INSPIRATION_SEED_COUNT = 3;

export const SCRIPT_OUTLINE_REQUIRED_SECTION_LABELS = [
  "一、基础信息",
  "二、主要角色",
  "三、情节概要",
] as const;

export const CHAPTER_SCRIPT_REQUIRED_SECTION_LABELS = [
  "一、基础方向",
  "二、本章方向",
  "三、剧本亮点",
  "四、视觉基调",
  "五、剧本正文",
  "六、本章结尾",
] as const;

export const CHAPTER_SCRIPT_FORBIDDEN_OUTPUT_LABELS = [
  "主体列表",
  "正式场景列表",
  "剧情节拍",
  "分镜剧本",
  "镜头编号",
  "图片 Prompt",
  "JSON",
] as const;

export interface FormatChapterScriptDocumentInput {
  chapterTitle: string;
  sourceText?: string;
  type?: string;
  theme?: string;
  style?: string;
  comicForm?: string;
  targetLength?: string;
  sceneName?: string;
}

export interface FormatScriptOutlineDocumentInput {
  title: string;
  sourceText?: string;
  genreStyle?: string;
  episodeLength?: string;
  episodeChapterPlan?: string;
}

export function isScriptOutlineDocument(sourceText: string): boolean {
  const text = sourceText.trim();
  return text.includes("剧本大纲")
    && SCRIPT_OUTLINE_REQUIRED_SECTION_LABELS.every((label) => text.includes(label));
}

export function formatScriptOutlineDocument(input: FormatScriptOutlineDocumentInput): string {
  const title = input.title.trim() || "待补充";
  const sourceText = input.sourceText?.trim() || "待补充";

  return [
    "# 剧本大纲",
    "",
    "## 一、基础信息",
    `剧集名称：${title}`,
    `题材风格：${input.genreStyle?.trim() || "待补充"}`,
    `剧集篇幅：${input.episodeLength?.trim() || "待补充"}`,
    `剧集章数：${input.episodeChapterPlan?.trim() || "待补充"}`,
    `剧情简介：${sourceText}`,
    "",
    "## 二、主要角色",
    "角色名（定位）：待补充",
    "",
    "## 三、情节概要",
    "第 1 - 2 集：待补充",
    "",
  ].join("\n");
}

export function getScriptOutlineFormatPrompt(): string {
  return [
    "项目级「剧本大纲」必须使用固定 Markdown 格式。",
    "只使用用户输入、项目上下文和选中的灵感种子生成内容；不要套用提示中的示例人名、剧情或设定。",
    "",
    "# 剧本大纲",
    "",
    "## 一、基础信息",
    "剧集名称：",
    "题材风格：",
    "剧集篇幅：",
    "剧集章数：",
    "剧情简介：",
    "",
    "## 二、主要角色",
    "角色名（定位）：",
    "",
    "## 三、情节概要",
    "第 1 - 2 集：",
    "",
    "字段说明：",
    "- 剧集名称：作品/故事名称。",
    "- 题材风格：题材、类型、情绪和画风倾向的合并描述。",
    "- 剧集篇幅：面向后续漫剧的总集数规划。",
    "- 剧集章数：说明每集对应多少漫画章节或每组集数覆盖的章节范围。",
    "- 剧情简介：整部作品的一段简介。",
    "- 主要角色：列出主角、重要关系角色和主要反派，每个角色一行，格式为「角色名（定位）：描述」。",
    "- 情节概要：按集数段落规划剧情，例如「第 1 - 2 集：剧情内容」，但具体内容必须来自当前项目。",
  ].join("\n");
}

export function extractScriptOutlineTitle(sourceText: string): string | null {
  const match = sourceText.match(/^\s*(?:剧集名称|剧本名称|剧本名|故事名称|故事名|作品名称|作品名)\s*[：:]\s*(.+?)\s*$/m);
  return normalizeExtractedText(match?.[1]);
}

export function isChapterScriptDocument(sourceText: string): boolean {
  const text = sourceText.trim();
  return text.includes("章节剧本")
    && CHAPTER_SCRIPT_REQUIRED_SECTION_LABELS.every((label) => text.includes(label));
}

export function formatChapterScriptDocument(input: FormatChapterScriptDocumentInput): string {
  const chapterTitle = normalizeChapterScriptTitle(input.chapterTitle);
  const sourceText = input.sourceText?.trim() || "……";
  const sceneName = input.sceneName?.trim() || "场景名";

  return [
    "# 章节剧本",
    "",
    `## ${chapterTitle}`,
    "",
    "### 一、基础方向",
    `类型：${input.type?.trim() || "待补充"}`,
    `主题：${input.theme?.trim() || "待补充"}`,
    `风格：${input.style?.trim() || "待补充"}`,
    `漫画形式：${input.comicForm?.trim() || "竖版条漫"}`,
    `目标篇幅：${input.targetLength?.trim() || "1 章，约 20 个分镜"}`,
    "",
    "### 二、本章方向",
    "一句话梗概：待补充",
    "本章目标：待补充",
    "核心冲突：待补充",
    "情绪走向：待补充",
    "结尾钩子：待补充",
    "",
    "### 三、剧本亮点",
    "亮点 1：待补充",
    "亮点 2：待补充",
    "亮点 3：待补充",
    "",
    "### 四、视觉基调",
    "画面氛围：待补充",
    "色调方向：待补充",
    "视觉记忆点：待补充",
    "",
    "### 五、剧本正文",
    "",
    `#### 场景 1：${sceneName}`,
    "地点：待补充",
    "时间：待补充",
    "氛围：待补充",
    "出场人物：待补充",
    "",
    "剧情描写：",
    sourceText,
    "",
    "人物动作：",
    "待补充",
    "",
    "对白：",
    "待补充",
    "",
    "旁白：",
    "待补充",
    "",
    "场景结束点：",
    "待补充",
    "",
    "### 六、本章结尾",
    "结尾事件：待补充",
    "悬念：待补充",
    "下一章引子：待补充",
    "",
  ].join("\n");
}

export function getChapterScriptFormatPrompt(): string {
  return [
    "剧本阶段最终输出必须是一份固定格式的「章节剧本」。",
    "使用 Markdown 标题表达层级，但内容结构必须严格包含以下块：",
    "",
    "# 章节剧本",
    "",
    "## 第 X 章：章节标题",
    "",
    "### 一、基础方向",
    "类型：",
    "主题：",
    "风格：",
    "漫画形式：",
    "目标篇幅：",
    "",
    "### 二、本章方向",
    "一句话梗概：",
    "本章目标：",
    "核心冲突：",
    "情绪走向：",
    "结尾钩子：",
    "",
    "### 三、剧本亮点",
    "亮点 1：",
    "亮点 2：",
    "亮点 3：",
    "",
    "### 四、视觉基调",
    "画面氛围：",
    "色调方向：",
    "视觉记忆点：",
    "",
    "### 五、剧本正文",
    "",
    "#### 场景 1：场景名",
    "地点：",
    "时间：",
    "氛围：",
    "出场人物：",
    "",
    "剧情描写：",
    "",
    "人物动作：",
    "",
    "对白：",
    "",
    "旁白：",
    "",
    "场景结束点：",
    "",
    "### 六、本章结尾",
    "结尾事件：",
    "悬念：",
    "下一章引子：",
  ].join("\n");
}

export function extractChapterScriptName(sourceText: string): string | null {
  const match = sourceText.match(/^\s*(?:剧本名称|剧本名|故事名称|故事名|作品名称|作品名)\s*[：:]\s*(.+?)\s*$/m);
  return normalizeExtractedText(match?.[1]);
}

export function extractChapterScriptTitle(sourceText: string): string | null {
  const markdownHeading = sourceText.match(/^#{1,6}\s*(第\s*[\d一二三四五六七八九十百千万零〇两]+\s*章[^\n]*)$/m);
  const plainHeading = sourceText.match(/^\s*(第\s*[\d一二三四五六七八九十百千万零〇两]+\s*章[^\n]*)$/m);
  const title = normalizeExtractedText(markdownHeading?.[1] ?? plainHeading?.[1]);
  return title ? normalizeChapterScriptTitle(title) : null;
}

export function stripChapterScriptName(sourceText: string): string {
  const lines = sourceText.trimEnd().split(/\r?\n/);
  const cleaned: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:剧本名称|剧本名|故事名称|故事名|作品名称|作品名)\s*[：:]/.test(line)) {
      if (cleaned[cleaned.length - 1]?.trim() === "" && lines[index + 1]?.trim() === "") {
        index += 1;
      }
      continue;
    }

    cleaned.push(line);
  }

  const stripped = cleaned.join("\n").trimEnd();
  return stripped ? `${stripped}\n` : "";
}

export function getChapterScriptForbiddenOutputPrompt(): string {
  return [
    "最终「章节剧本」不要输出后续阶段产物：",
    "- 不要输出主体列表。",
    "- 不要输出正式场景列表。",
    "- 不要输出剧情节拍。",
    "- 不要输出分镜剧本。",
    "- 不要输出镜头编号。",
    "- 不要输出图片 Prompt。",
    "- 不要把 JSON 作为最终章节正文。",
    "场景、人物和对白只能作为「剧本正文」的一部分出现，不能作为正式剧情结构或分镜产物。",
  ].join("\n");
}

function normalizeChapterScriptTitle(title: string): string {
  const cleaned = title.replace(/^#{1,6}\s+/, "").trim();
  if (!cleaned) {
    return "第 1 章：章节标题";
  }

  if (/^第\s*[\d一二三四五六七八九十百千万零〇两]+\s*章[：:]/.test(cleaned)) {
    return cleaned;
  }

  const chapterMatch = cleaned.match(/^(第\s*[\d一二三四五六七八九十百千万零〇两]+\s*章)\s*(.*)$/);
  if (chapterMatch) {
    const prefix = chapterMatch[1];
    const rest = chapterMatch[2]?.trim();
    return rest ? `${prefix}：${rest}` : `${prefix}：章节标题`;
  }

  return `第 1 章：${cleaned}`;
}

function normalizeExtractedText(value: string | undefined): string | null {
  const cleaned = value?.trim();
  if (!cleaned || /^(待补充|未设置|无|暂无|N\/A)$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}
