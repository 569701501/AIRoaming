/**
 * DialogueService prompt 构造与边界契约(从 dialogue.service.ts 抽出)。
 *
 * 这些是纯字符串构造函数,无状态依赖。各 prompt 构造器接收 turn/input,
 * 边界契约函数接收 snapshot。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */
import type {
  DialogueMessageItem,
  ImportAnalysisOutputV1,
  ScriptInspirationSeed,
  SendDialogueMessageRequest,
  StoryboardJson,
  StoryDocumentV2,
  StoryStructureJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import type {
  AiChapterGenerationContext,
  ChapterRevisionContinuityContext,
  ImportItemWorkContext,
  RawScriptSourceContext,
} from "../projects/script-workflow-source.repository.js";
import {
  SCRIPT_INSPIRATION_SEED_COUNT,
  getChapterScriptForbiddenOutputPrompt,
  getChapterScriptFormatPrompt,
  getScriptOutlineFormatPrompt,
} from "@airoaming/shared";
import type { DialogueTurn } from "./dialogue-types.js";
import { compactPromptText } from "./dialogue-text.util.js";
import {
  getScriptRevisionLayerContract,
  getScriptRevisionLayerLabel,
  type ScriptRevisionLayer,
} from "./script-revision-quality.util.js";
import {
  buildStoryboardDialogueReference,
  type StoryboardDialogueReference,
} from "./storyboard-dialogue-reference.util.js";
import {
  readOpenCodeSkillJsonReference,
  readOpenCodeSkillReference,
  renderOpenCodePromptTemplate,
} from "../ai-runtime/opencode-skill-asset.util.js";

/** workflow 步骤中文标签(用于 prompt 上下文)。 */
export const STEP_LABELS: Record<string, string> = {
  project_story: "剧本",
  project_characters: "项目角色库",
  story_structure: "剧情结构",
  storyboard: "分镜工作台",
  image_preflight: "出图准备",
  image_candidates: "候选图工作台",
  layout_export: "排版导出",
  asset_package: "素材包",
};

// ---------- 边界契约 ----------

export function buildScriptStageBoundaryContract(): string {
  return [
    "剧本阶段统一边界契约：",
    "",
    "事实源：",
    "1. 当前章节正文以工作台注入的 `currentChapter.sourceText` 或本轮 `context.sourceText` 为准。",
    "2. 用户上传附件、粘贴文本、普通聊天内容都不是项目事实；只有写入项目级剧本大纲、写入章节草稿、保存、完成本章或被用户确认后，才可作为后续事实。",
    "3. `Chapter` 是剧本阶段的一等工作单元；写入目标只能是当前章节或系统明确指定的章节。",
    "4. 聊天回复不是正式产物；正式产物必须落到章节草稿、章节版本、项目事实或后续受控任务中。",
    "",
    "行为分级：",
    "A. 只能回答，不能写入：用户只是询问想法、评价、分析、解释、讨论方向；用户要求“看看怎么样”“有什么问题”“给我建议”；用户提供的是世界观、角色设定、灵感笔记、提纲或零散资料但没有明确要求写成章节；用户的问题属于剧情结构、分镜、图片、排版或素材包阶段且当前没有对应受控工具。",
    "B. 可以生成候选，但不能直接写章节：用户说没有灵感、想要几个方向、想看故事种子；用户选择灵感种子后，应先生成并保存项目级剧本大纲，等待用户确认；用户提供多个方向要求帮忙挑选；用户给出的内容可用但章节边界不清晰；写入会覆盖已有非空章节、替换整本剧本或造成后续产物失效。",
    "C. 可以通过受控工具写入章节：用户明确要求导入、整理成章节、写入章节；用户确认了项目级剧本大纲并要求生成第一章；用户在当前章节中明确要求改写、润色、扩写、压缩、调整节奏、补对白或加强冲突；后端提供了对应受控工具，并能校验 `projectId`、`chapterId`、当前步骤和写入范围。",
    "",
    "写入前确认规则：",
    "以下情况必须先说明影响范围并等待用户确认：覆盖已有非空章节；替换整本剧本或清空旧章节集合；根据不清晰章节边界拆章；把小说正文、提纲、设定资料转换成章节剧本；修改可能导致后续剧情结构、分镜、候选图或排版需要重新生成。确认语义必须明确，例如“确认导入”“确认覆盖”“按这个方案写入”。",
    "",
    "禁止事项：",
    "- 不直接操作本地物理路径、数据库、shell 或 workspace 文件。",
    "- 不绕过 AI漫游受控工具/API 写入章节。",
    "- 不把未确认聊天内容自动当作项目事实。",
    "- 不在用户选择灵感种子后直接写章节；必须先生成项目级剧本大纲，用户确认大纲后才生成单个目标章节。",
    "- 不在剧本阶段擅自生成分镜、图片、排版或素材包产物。",
    "- 不把主体列表、正式场景列表、剧情节拍、分镜剧本、镜头编号、图片 Prompt 或 JSON 作为最终章节剧本输出；这些属于后续剧情结构、分镜工作台或候选图阶段。",
    "- 不把普通建议包装成已经完成的写入。",
    "- 不在用户已有固定剧本时擅自换题材、换主角或推翻核心设定。",
    "- 不只因为文本里有 `1`、`2`、`# 1` 这类低可信编号就拆成章节。",
    "",
    getChapterScriptForbiddenOutputPrompt(),
    "",
    "回复口径：",
    "- 如果只是建议，明确说“我建议”，不要说“我已更新”。",
    "- 如果调用了受控工具，说“已通过系统工具更新章节草稿”，并说明影响章节和摘要。",
    "- 如果不能写入，说明原因，并给用户下一步选择。",
    "- 如果需要确认，列出将影响哪些章节、是否覆盖旧内容、继续需要用户回复什么。",
  ].join("\n");
}

export function buildProjectCharactersBoundaryContract(snapshot: WorkbenchSnapshot): string {
  const requiredCharacters = snapshot.characters.filter((character) =>
    character.level === "lead" || character.level === "recurring",
  );
  return [
    "项目角色库阶段边界契约：",
    "",
    "目标：提取项目级主角、常驻角色和可选本章重要角色，生成可供后续漫画候选图复用的角色视觉基准。",
    "事实源：已确认剧本大纲、已完成章节剧本和右侧项目角色库。",
    "写入规则：普通聊天不能直接写文件；只有调用系统受控工具后，才可把角色草稿写入 `shared/characters.json`。",
    "图片规则：所有角色进入角色库后都应自动生成正面半身预览图；主角和常驻角色确认预览后必须生成并确认角色定稿图；本章重要角色可按需补定稿图；临时/背景角色只保留预览图。",
    "禁区：不要声称 OpenCode 自己调用图片模型或写入本地文件；图片生成必须由 AI漫游后端受控接口执行。",
    `当前必需定稿角色数：${requiredCharacters.length}`,
  ].join("\n");
}

export function buildImagePreflightBoundaryContract(snapshot: WorkbenchSnapshot): string {
  return [
    "出图准备阶段边界契约：",
    "",
    "目标：检查当前章节正式分镜能否进入候选图生成。",
    "检查项：正式 storyboard.json、镜头角色绑定、项目角色库匹配、主角/常驻角色定稿图、本章重要角色参考图、正在运行的角色图任务。",
    "角色库定位：项目角色库是项目级资产入口，不是线性主流程步骤；缺图或未绑定角色只阻塞候选图，不阻塞剧情结构或分镜。",
    "写入规则：只有用户在出图准备页确认、且后端 image-preflight/confirm API 返回成功后，才能声称已写入 preflight.json；未确认时只能解释阻塞项和补齐建议。",
    `当前正式分镜镜头数：${snapshot.shots.length}`,
    `当前项目角色数：${snapshot.characters.length}`,
  ].join("\n");
}

// ---------- 通用 prompt 装配 ----------

export function buildPrompt(input: {
  snapshot: WorkbenchSnapshot;
  stepKey: string;
  userContent: string;
  contextSourceText?: string;
  attachmentText?: string;
  recentMessages: DialogueMessageItem[];
}): string {
  const stepLabel = STEP_LABELS[input.stepKey] ?? "剧本";
  const currentChapter = input.snapshot.currentChapter;
  const chapterTitle = currentChapter?.title || input.snapshot.story.title || "当前章节";
  const sourceText = (input.contextSourceText ?? currentChapter?.sourceText ?? input.snapshot.story.sourceText).trim();
  const recentDialogue = input.recentMessages
    .filter((message) => message.content.trim())
    .map((message) => `${message.role === "user" ? "用户" : "AI"}（${STEP_LABELS[message.stepKey] ?? message.stepKey}）：${message.content}`)
    .join("\n");
  const scriptBoundary = input.stepKey === "project_story" ? buildScriptStageBoundaryContract() : "";
  const projectCharactersBoundary = input.stepKey === "project_characters" ? buildProjectCharactersBoundaryContract(input.snapshot) : "";
  const imagePreflightBoundary = input.stepKey === "image_preflight" ? buildImagePreflightBoundaryContract(input.snapshot) : "";

  return [
    "你是 AI漫游的漫画创作助手，当前运行在项目工作区的左侧对话框。",
    `当前项目：${input.snapshot.project.name}`,
    `当前步骤：${stepLabel}`,
    `当前章节：${chapterTitle}`,
    scriptBoundary,
    projectCharactersBoundary,
    imagePreflightBoundary,
    "工作原则：",
    "1. 回复使用中文，优先围绕当前步骤、漫画创作目标和用户正在编辑的产物。",
    "2. 没有明确写入权限或受控工具时，只能给建议、分析、问题清单或候选方案。",
    "3. 不要声称你直接操作了本地物理文件；如确实由系统工具写入，只能说“已通过系统工具更新”。",
    "当前章节剧本文档：",
    sourceText || "（用户还没有填写剧本内容）",
    "项目级剧本大纲：",
    input.snapshot.scriptOutline?.sourceText?.trim() || "（项目还没有保存剧本大纲）",
    "当前项目角色库：",
    input.snapshot.characters.length > 0
      ? input.snapshot.characters.map((character) => `${character.name} / ${character.level} / ${character.status} / ${character.primaryReferenceKind}`).join("\n")
      : "（项目角色库为空）",
    "本轮附件文本：",
    input.attachmentText || "（本轮没有文本附件）",
    "最近对话：",
    recentDialogue || "（暂无历史对话）",
    "用户本次消息：",
    input.userContent,
  ].filter(Boolean).join("\n\n");
}

// ---------- 已有剧本 B1～B4 Prompt ----------

function importSourceBlocksForPrompt(
  blocks: RawScriptSourceContext["blocks"],
  mode: "full" | "catalog" = "full",
): string {
  return JSON.stringify(blocks.map((block) => ({
    sourceRef: block.sourceRef,
    blockRef: block.blockRef,
    globalOrder: block.globalOrder,
    locatorLabel: block.locatorLabel,
    kind: block.kind,
    ...(mode === "full" ? { sourceText: block.sourceText } : {
      sourceExcerpt: block.sourceText.length <= 360
        ? block.sourceText
        : `${block.sourceText.slice(0, 180)}…${block.sourceText.slice(-180)}`,
    }),
  })), null, 2);
}

export function buildScriptImportAnalysisPrompt(input: {
  source: RawScriptSourceContext;
  userRequest: string;
  previousAnalysis?: unknown;
  sourceBlocksMode?: "full" | "catalog";
  segmentAnalyses?: readonly ImportAnalysisOutputV1[];
  hierarchyLabel?: string;
}): string {
  const first = input.source.blocks[0];
  const last = input.source.blocks.at(-1);
  return [
    `你正在执行 AI漫游已有剧本路线 B2：原稿观察性分析与拆章候选${input.hierarchyLabel ? `（${input.hierarchyLabel}）` : ""}。`,
    "你是来源分析员，不是改编作者。只描述原稿实际内容，不得补剧情、强化钩子、调整人物弧或为了套公式改变章节边界。",
    "只输出一个严格 JSON 对象，不要代码围栏、Markdown、解释或数据库 ID。",
    "",
    "硬性规则：",
    "- schemaVersion 必须是 import-analysis/1.0，outlineRole 必须是 observed。",
    "- 每个原稿 block 必须且只能归入一个 chapterCandidates.sourceRanges 或 excludedRanges；不得遗漏、重叠或打乱全局顺序。",
    "- 优先保留原稿明确章节/话/幕边界；只有没有可靠源边界时，才可按完整的目标、冲突、转折或场景序列结束提出生产章节边界。",
    "- boundaryEvidence.start/end 的 anchorBlockRef 必须位于该候选范围内。",
    "- 无法确定文件顺序、正文范围或章节边界时，写入 unresolvedItems；impact 使用 source_scope/source_order/boundary，系统会阻止确认，不要猜测。",
    "- 标题来自原稿时 basis=source；否则只能给保守建议并写 basis=suggested。",
    "- observedOutline 只能做观察性摘要，不得伪造作者意图。",
    "- chapterCandidates.order 和 plotStages.order 必须从 1 连续递增。",
    "- sourceRanges 只使用提供的 sourceRef/blockRef。",
    "- excludedRanges 的每一项只允许使用单数 sourceRange；禁止写成 sourceRanges。没有排除内容时必须输出空数组，不得为了套示例排除正文。",
    "- excludedRanges[].category 只能是 front_matter、table_of_contents、character_list、author_note、duplicate、non_story 之一。",
    "",
    "必须输出以下精确顶层字段：",
    JSON.stringify({
      schemaVersion: "import-analysis/1.0",
      outlineRole: "observed",
      sourceProfile: { contentType: "script|story_prose|scene_draft|mixed", explicitBoundaryLevel: "volume|chapter|episode|act|scene|none|mixed" },
      observedOutline: {
        sourceTitle: { value: "原稿标题或 null", basis: "source|not_provided" },
        synopsis: "观察性剧情摘要",
        mainCharacters: [{ name: "角色名", aliases: [], observedIdentity: "原稿可观察身份", observedPursuit: "原稿可观察追求", relationships: [], sourceRanges: [{ sourceRef: first?.sourceRef ?? "source-001", startBlockRef: first?.blockRef ?? "source-001:block-000001", endBlockRef: first?.blockRef ?? "source-001:block-000001" }] }],
        plotStages: [{ order: 1, label: "阶段名", summary: "原稿阶段摘要", sourceRanges: [{ sourceRef: first?.sourceRef ?? "source-001", startBlockRef: first?.blockRef ?? "source-001:block-000001", endBlockRef: last?.sourceRef === first?.sourceRef ? last?.blockRef ?? first?.blockRef : first?.blockRef ?? "source-001:block-000001" }] }],
        endingObservation: { kind: "resolved|open|incomplete|multiple|unknown", summary: "结尾观察", sourceRanges: [{ sourceRef: last?.sourceRef ?? "source-001", startBlockRef: last?.blockRef ?? "source-001:block-000001", endBlockRef: last?.blockRef ?? "source-001:block-000001" }] },
      },
      chapterCandidates: [{
        localRef: "chapter-001",
        order: 1,
        title: { value: "章节标题", basis: "source|suggested" },
        summary: "本章原稿摘要",
        sourceRanges: [{ sourceRef: first?.sourceRef ?? "source-001", startBlockRef: first?.blockRef ?? "source-001:block-000001", endBlockRef: last?.sourceRef === first?.sourceRef ? last?.blockRef ?? first?.blockRef : first?.blockRef ?? "source-001:block-000001" }],
        boundaryMode: "preserved_source_unit|grouped_source_scenes|proposed_story_transition|whole_source",
        boundaryEvidence: {
          start: { type: "source_start|explicit_heading|goal_or_conflict_resolution|major_turn|time_jump|location_shift|pov_or_mainline_shift|scene_sequence_end|source_end", anchorBlockRef: first?.blockRef ?? "source-001:block-000001", description: "开始边界证据" },
          end: { type: "source_start|explicit_heading|goal_or_conflict_resolution|major_turn|time_jump|location_shift|pov_or_mainline_shift|scene_sequence_end|source_end", anchorBlockRef: last?.blockRef ?? "source-001:block-000001", description: "结束边界证据" },
        },
        confidence: "high|medium|low",
        warnings: [],
      }],
      excludedRanges: [],
      unresolvedItems: [],
      globalWarnings: [],
    }, null, 2),
    "excludedRanges 条目精确结构（仅在原稿确有非正文排除内容时使用；否则保持空数组）：",
    JSON.stringify({
      sourceRange: {
        sourceRef: first?.sourceRef ?? "source-001",
        startBlockRef: first?.blockRef ?? "source-001:block-000001",
        endBlockRef: first?.blockRef ?? "source-001:block-000001",
      },
      category: "non_story",
      reason: "排除原因",
    }, null, 2),
    "",
    `原稿版本摘要：${input.source.sourceDigest}`,
    `输入模式：${input.source.inputMode}`,
    "原稿文件：",
    JSON.stringify(input.source.documents.map((document) => ({ sourceRef: document.sourceRef, order: document.order, name: document.name, mediaType: document.mediaType })), null, 2),
    input.sourceBlocksMode === "catalog"
      ? "稳定原稿 block 目录（正文事实已由下方相邻分段分析给出；必须重新合并全部 block，不得丢失中段）："
      : "稳定原稿 blocks（完整输入，不得主动忽略中段）：",
    importSourceBlocksForPrompt(input.source.blocks, input.sourceBlocksMode),
    "相邻分段的严格分析结果（需要合并时使用；不得把分段边界误当章节边界）：",
    input.segmentAnalyses?.length ? JSON.stringify(input.segmentAnalyses, null, 2) : "（无，当前直接读取原稿正文）",
    "用户本轮要求或边界反馈：",
    input.userRequest || "请忠实分析并提出拆章候选。",
    "上一版分析候选（仅在用户要求调整边界时参考；本轮仍必须输出完整新候选）：",
    input.previousAnalysis ? JSON.stringify(input.previousAnalysis, null, 2) : "（无）",
  ].join("\n");
}

export function buildScriptImportMaterializePrompt(context: ImportItemWorkContext): string {
  return [
    "你正在执行 AI漫游已有剧本路线 B4：把一个已确认原稿范围忠实整理为标准章节剧本。",
    "只输出章节剧本 Markdown，不要代码围栏、解释、JSON、sourceRef、blockRef 或系统状态。",
    "",
    "忠实边界：",
    "- 只使用本章确认范围内的原稿，不得添加事件、对白、人物动机、结局、伏笔或原稿外信息。",
    "- 不得删除剧情信息、改变事件顺序、合并或拆分人物身份、改变对白说话人。",
    "- 标签、录音、屏幕文字、档案内容、书信或广播等非人物口头发言，必须保持原有载体和文本功能，不得改写或重分类为人物对白；没有人物对白的场景统一写“原稿未明确”。",
    "- 可以把小说叙述或分场稿规范为场景字段，但只能做格式转换，不得润色成新剧情。",
    "- 原稿未明确的辅助字段统一写“原稿未明确”；正文中的原有叙事、动作和对白必须完整保留。",
    `- 章节标题必须是“第 ${context.chapter.order} 章：${context.chapter.title}”。`,
    "- 目标篇幅必须固定写“按本章确认原稿范围完整整理”。",
    "- 不输出角色卡、场景卡、剧情节拍、分镜、镜头或图片 Prompt。",
    "",
    getChapterScriptFormatPrompt(),
    "",
    "观察性项目大纲（只能辅助理解称谓，不得覆盖原稿）：",
    JSON.stringify(context.analysis.observedOutline, null, 2),
    "确认的本章目录项：",
    JSON.stringify(context.mapItem, null, 2),
    "本章确认范围内的完整原稿 blocks：",
    importSourceBlocksForPrompt(context.sourceBlocks),
  ].join("\n");
}

export function buildScriptImportVerifyPrompt(context: ImportItemWorkContext, sourceText: string): string {
  const outputLines = sourceText.trimEnd().split("\n").map((line, index) => ({
    lineRef: `line-${String(index + 1).padStart(6, "0")}`,
    text: line,
  }));
  return [
    "你正在执行 AI漫游已有剧本路线 B4：忠实度验证。你只能审计，不能继续改写章节正文。",
    "只输出一个严格 JSON 对象，不要代码围栏、Markdown 或解释。",
    "",
    "审计规则：",
    "- sourceCoverage 必须完整、无重叠覆盖本章确认范围的每个原稿 block。",
    "- 每一项只能使用给定 sourceRef/blockRef 和 lineRef。",
    "- 原稿信息完整保留且只做格式变化时使用 preserved_in_body/reformatted_in_body/preserved_in_title。",
    "- 可由原文直接支持的摘要、情绪走向、氛围或视觉标签，属于章节格式中的结构化归纳，不得作为无来源新增剧情；例如原文写“海雾压住崖城”，归纳为“压迫氛围”是允许的。",
    "- unsupportedAdditions 只记录输出新加入的具体剧情事实，例如原稿没有的事件、动作、对白、人物关系、身份、结果或伏笔；不要把有原文证据的辅助字段标签放入该数组。",
    "- 辅助字段既无法由原文直接支持、又没有写“原稿未明确”时，才使用 metadataFindings 的 UNSUPPORTED_METADATA。",
    "- 任何遗漏、无来源新增、顺序变化、对白或说话人改变、人物合并拆分、越界内容都必须进入对应 finding 数组，不能用 uncertainties 掩盖硬问题。",
    "- 不凭印象给覆盖率数字；只输出逐范围证据。",
    "",
    "精确顶层结构：",
    JSON.stringify({
      schemaVersion: "import-fidelity/1.0",
      sourceCoverage: [{ sourceRange: context.mapItem.sourceRanges[0], outputLineRanges: [{ startLineRef: "line-000001", endLineRef: `line-${String(outputLines.length).padStart(6, "0")}` }], disposition: "reformatted_in_body", note: "说明原稿如何保留" }],
      unsupportedAdditions: [],
      sequenceFindings: [],
      dialogueFindings: [],
      entityFindings: [],
      metadataFindings: [],
      uncertainties: [],
    }, null, 2),
    "finding 结构固定为：",
    JSON.stringify({ code: "SOURCE_OMISSION", description: "问题说明", sourceBlockRefs: [context.sourceBlocks[0]?.blockRef ?? "source-001:block-000001"], outputLineRefs: ["line-000001"] }, null, 2),
    "",
    "本章确认目录项：",
    JSON.stringify(context.mapItem, null, 2),
    "本章确认范围原稿 blocks：",
    importSourceBlocksForPrompt(context.sourceBlocks),
    "待验证章节输出（每行已添加只用于审计的 lineRef）：",
    JSON.stringify(outputLines, null, 2),
  ].join("\n");
}

export function buildScriptImportFormatRepairPrompt(input: {
  stage: "analysis" | "materialize" | "verify";
  validationError: string;
  originalPrompt: string;
  invalidOutput: string;
}): string {
  return [
    `上一份 ${input.stage} 输出未通过固定契约校验。`,
    "只修复格式、字段、引用和结构错误，不新增、删除、改写或重新解释任何剧情事实。",
    "仍需遵守原任务全部忠实边界，只输出原任务要求的最终内容，不要解释。",
    `校验错误：${input.validationError}`,
    "原任务：",
    input.originalPrompt,
    "未通过的输出：",
    input.invalidOutput,
  ].join("\n\n");
}

// ---------- 剧情结构 prompt ----------

export interface StoryStructurePromptFacts {
  project: {
    name: string;
    storyTitle: string;
  };
  chapter: {
    title?: string | null;
    status?: string | null;
    currentScriptVersionId?: string | null;
    sourceText?: string | null;
  };
  scriptOutline?: string | null;
}

export function buildStoryStructurePrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  const snapshot = turn.snapshot;
  const currentChapter = snapshot.currentChapter;
  const sourceText = (input.context?.sourceText ?? currentChapter?.sourceText ?? snapshot.story.sourceText).trim();
  return buildStoryStructurePromptFromFacts({
    project: snapshot.project,
    chapter: {
      title: currentChapter?.title,
      status: currentChapter?.status,
      currentScriptVersionId: currentChapter?.currentScriptVersionId,
      sourceText,
    },
    scriptOutline: snapshot.scriptOutline?.sourceText,
  }, input.content);
}

/**
 * 剧情结构 Skill 的统一事实装配入口。
 * 对话路径和持久任务路径只能在这里注入动态事实，不在代码中维护创作规则。
 */
export function buildStoryStructurePromptFromFacts(
  facts: StoryStructurePromptFacts,
  userRequest: string,
): string {
  const skillName = "structure-story-parse";
  const example = readOpenCodeSkillJsonReference<Record<string, unknown>>(
    skillName,
    "story-structure-example.json",
  );
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "story-structure-prompt.md"),
    {
      STRUCTURE_EXAMPLE_JSON: JSON.stringify(example, null, 2),
      PROJECT_NAME: facts.project.name,
      STORY_TITLE: facts.project.storyTitle,
      CHAPTER_TITLE: facts.chapter.title?.trim() || "当前章节",
      CHAPTER_STATUS: facts.chapter.status?.trim() || "unknown",
      SCRIPT_VERSION_ID: facts.chapter.currentScriptVersionId?.trim() || "未生成版本",
      SCRIPT_OUTLINE: facts.scriptOutline?.trim() || "（暂无项目级剧本大纲）",
      CHAPTER_SCRIPT: facts.chapter.sourceText?.trim() || "（当前章节为空）",
      USER_REQUEST: userRequest.trim() || "生成当前章节剧情结构",
    },
  );
}

export function buildStoryStructureRepairPrompt(input: {
  originalPrompt: string;
  invalidOutput: string;
  validationError: string;
  qualityIssues?: readonly string[];
}): string {
  const qualityFailure = Boolean(input.qualityIssues?.length);
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(
      "structure-story-parse",
      qualityFailure ? "repair-quality-failure.md" : "repair-validation-failure.md",
    ),
    qualityFailure
      ? {
        ISSUES: input.qualityIssues!.join("、"),
        ORIGINAL_PROMPT: input.originalPrompt,
        INVALID_OUTPUT: input.invalidOutput,
      }
      : {
        VALIDATION_ERROR: input.validationError,
        ORIGINAL_PROMPT: input.originalPrompt,
        INVALID_OUTPUT: input.invalidOutput,
      },
  );
}

// ---------- 分镜 prompt ----------

export type StoryboardPromptMode = "generate" | "revise_pending";
export type StoryboardPromptVariant = "v2_3" | "v2_5_experiment";

export interface StoryboardPromptFacts {
  project: {
    name: string;
    storyTitle: string;
    comicFormat?: string | null;
    artStyle?: string | null;
  };
  chapter: {
    title?: string | null;
    status?: string | null;
    currentStoryVersionId?: string | null;
    sourceText?: string | null;
  };
  structure: StoryStructureJson | StoryDocumentV2 | null | undefined;
  pendingStoryboard?: StoryboardJson | null;
}

export function buildStoryboardPrompt(
  turn: DialogueTurn,
  input: SendDialogueMessageRequest,
  mode: StoryboardPromptMode = "generate",
  suppliedDialogueReference?: StoryboardDialogueReference,
  variant: StoryboardPromptVariant = "v2_3",
): string {
  const snapshot = turn.snapshot;
  const currentChapter = snapshot.currentChapter;
  return buildStoryboardPromptFromFacts({
    project: snapshot.project,
    chapter: {
      title: currentChapter?.title,
      status: currentChapter?.status,
      currentStoryVersionId: currentChapter?.currentStoryVersionId,
      sourceText: input.context?.sourceText?.trim() ?? currentChapter?.sourceText?.trim() ?? "",
    },
    structure: snapshot.storyStructure?.structureJson,
    pendingStoryboard: snapshot.pendingStoryboard?.storyboardJson,
  }, input.content, mode, suppliedDialogueReference, variant);
}

/**
 * 分镜 Skill 的统一事实装配入口。
 * 对话路径和持久任务路径都必须复用这里，避免出现第二套分镜创作方法。
 */
export function buildStoryboardPromptFromFacts(
  facts: StoryboardPromptFacts,
  userRequest: string,
  mode: StoryboardPromptMode = "generate",
  suppliedDialogueReference?: StoryboardDialogueReference,
  variant: StoryboardPromptVariant = "v2_3",
): string {
  const currentChapter = facts.chapter;
  const structure = facts.structure;
  const availableCharacterRefs = Array.isArray(structure?.characters)
    ? structure.characters
      .filter((card) => typeof card?.id === "string" && card.id.trim() !== "" && typeof card?.name === "string" && card.name.trim() !== "")
      .map((card) => `${card.id}=${card.name}`)
    : [];
  const beatCount = Array.isArray(structure?.beats) ? structure.beats.length : 0;
  const targetShotRange = beatCount > 0
    ? `${beatCount}-${beatCount * 2}`
    : "8-16";
  const sourceText = currentChapter.sourceText?.trim() ?? "";
  const chapterScriptExcerpt = compactPromptText(sourceText, 6000);
  const dialogueReference = suppliedDialogueReference ?? buildStoryboardDialogueReference(
    sourceText,
    {
      characters: structure?.characters ?? [],
      scenes: structure?.scenes ?? [],
    },
  );
  const pendingStoryboard = facts.pendingStoryboard ?? null;
  const isRevision = mode === "revise_pending";
  const exampleCharacterRef = structure?.characters?.[0]?.id ?? "character_01";
  const exampleBeatRef = structure?.beats?.[0]?.id ?? "beat_01";
  const exampleSceneRef = structure?.scenes?.[0]?.id ?? "scene_01";
  const skillName = "storyboard-shot-generate";
  const escapeJsonString = (value: string): string => JSON.stringify(value).slice(1, -1);
  const shotExample = renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(
      skillName,
      isRevision ? "shot-example-revise-pending.json" : "shot-example-generate.json",
    ),
    {
      CHARACTER_REF: escapeJsonString(exampleCharacterRef),
      BEAT_REF: escapeJsonString(exampleBeatRef),
      SCENE_REF: escapeJsonString(exampleSceneRef),
      EXISTING_SHOT_ID: escapeJsonString(pendingStoryboard?.shots[0]?.id ?? "existing_shot_id"),
    },
  );
  const normalizedShotExample = JSON.stringify(JSON.parse(shotExample), null, 2);
  const dialogueCandidates = dialogueReference.available
    ? JSON.stringify(dialogueReference.candidates.map((candidate) => ({
      localRef: candidate.localRef,
      sceneRef: candidate.sceneRef,
      sourceSpeaker: candidate.sourceSpeaker,
      characterRef: candidate.characterRef,
      sourceKind: candidate.sourceKind,
      line: candidate.line,
    })), null, 2)
    : "（未提供稳定全章候选）";
  const pendingStoryboardSection = isRevision
    ? renderOpenCodePromptTemplate(
      readOpenCodeSkillReference(skillName, "pending-storyboard-section.md"),
      { PENDING_STORYBOARD_JSON: JSON.stringify(pendingStoryboard ?? {}, null, 2) },
    )
    : "";
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "storyboard-prompt.md"),
    {
      MODE_CONTRACT: readOpenCodeSkillReference(skillName, isRevision ? "mode-revise-pending.md" : "mode-generate.md"),
      AVAILABLE_CHARACTER_REFS: availableCharacterRefs.join("、") || "暂无",
      TARGET_SHOT_RANGE: targetShotRange,
      DIALOGUE_SELECTION_RULE: readOpenCodeSkillReference(
        skillName,
        dialogueReference.available ? "dialogue-with-candidates.md" : "dialogue-without-candidates.md",
      ),
      EXPERIMENT_RULES: variant === "v2_5_experiment"
        ? readOpenCodeSkillReference(skillName, "risk-v2-5.md")
        : "",
      SHOT_EXAMPLE_JSON: normalizedShotExample,
      PROJECT_NAME: facts.project.name,
      STORY_TITLE: facts.project.storyTitle,
      COMIC_FORMAT: facts.project.comicFormat ?? "未指定",
      ART_STYLE: facts.project.artStyle?.trim() || "未指定",
      CHAPTER_TITLE: currentChapter.title ?? "当前章节",
      CHAPTER_STATUS: currentChapter.status ?? "unknown",
      STORY_VERSION_ID: currentChapter.currentStoryVersionId ?? "未确认",
      STRUCTURE_JSON: JSON.stringify(structure ?? {}, null, 2),
      CHAPTER_SCRIPT_EXCERPT: chapterScriptExcerpt || "（当前章节为空）",
      DIALOGUE_CANDIDATES: dialogueCandidates,
      PENDING_STORYBOARD_SECTION: pendingStoryboardSection,
      USER_REQUEST: userRequest,
    },
  );
}

export function buildStoryboardRepairPrompt(input: {
  originalPrompt: string;
  invalidOutput: string;
  validationError: string;
  qualityIssues?: readonly string[];
  mode: StoryboardPromptMode;
}): string {
  const skillName = "storyboard-shot-generate";
  const qualityFailure = Boolean(input.qualityIssues?.length);
  const issues = input.qualityIssues?.length ? input.qualityIssues.join("、") : input.validationError;
  const failureIntro = renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(
      skillName,
      qualityFailure ? "repair-quality-failure.md" : "repair-validation-failure.md",
    ),
    { ISSUES: issues },
  );
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "repair-prompt.md"),
    {
      FAILURE_INTRO: failureIntro,
      REPAIR_MODE_CONTRACT: readOpenCodeSkillReference(
        skillName,
        input.mode === "revise_pending" ? "repair-mode-revise-pending.md" : "repair-mode-generate.md",
      ),
      ORIGINAL_PROMPT: input.originalPrompt,
      INVALID_OUTPUT: input.invalidOutput,
    },
  );
}

// ---------- 灵感种子 prompt ----------

export function buildInspirationSeedsPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  const snapshot = turn.snapshot;
  const tags = snapshot.project.genreTags.length > 0 ? snapshot.project.genreTags.join("、") : "未设置";
  const skillName = "script-inspiration-seeding";
  const example = readOpenCodeSkillJsonReference<Record<string, unknown>>(
    skillName,
    "inspiration-example.json",
  );
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "inspiration-prompt.md"),
    {
      SEED_COUNT: SCRIPT_INSPIRATION_SEED_COUNT,
      SCRIPT_STAGE_BOUNDARY: buildScriptStageBoundaryContract(),
      SEED_EXAMPLE_JSON: JSON.stringify(example),
      PROJECT_NAME: snapshot.project.name,
      GENRE_TAGS: tags,
      COMIC_FORMAT: snapshot.project.comicFormat,
      ART_STYLE: snapshot.project.artStyle,
      USER_REQUEST: input.content,
    },
  );
}

export function buildInspirationSeedsRepairPrompt(input: {
  invalidOutput: string;
  validationError: string;
  qualityIssues?: readonly string[];
}): string {
  const skillName = "script-inspiration-seeding";
  const qualityFailure = Boolean(input.qualityIssues?.length);
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(
      skillName,
      qualityFailure ? "repair-quality-failure.md" : "repair-validation-failure.md",
    ),
    qualityFailure
      ? {
        SEED_COUNT: SCRIPT_INSPIRATION_SEED_COUNT,
        ISSUES: input.qualityIssues!.join("、"),
        INVALID_OUTPUT: input.invalidOutput,
      }
      : {
        SEED_COUNT: SCRIPT_INSPIRATION_SEED_COUNT,
        VALIDATION_ERROR: input.validationError,
        INVALID_OUTPUT: input.invalidOutput,
      },
  );
}

// ---------- 剧本大纲 prompt ----------

export function buildScriptOutlineFromTopicPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  const skillName = "script-outline-drafting";
  const modeContract = renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "mode-topic.md"),
    { USER_TOPIC: input.content },
  );
  return buildScriptOutlinePromptFromFacts(turn, modeContract);
}

export function buildScriptOutlineFromSeedPrompt(
  turn: DialogueTurn,
  input: SendDialogueMessageRequest,
  seed: ScriptInspirationSeed,
  seedPrompt: string,
  previousOutline?: string,
): string {
  const skillName = "script-outline-drafting";
  const modeContract = renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "mode-seed.md"),
    {
      SEED_TITLE: seed.title,
      SEED_PROMPT: seedPrompt,
      USER_REQUEST: input.content,
      SEED_JSON: JSON.stringify({
        title: seed.title,
        genreTags: seed.genreTags,
        logline: seed.logline,
        keyConflict: seed.keyConflict,
        visualHook: seed.visualHook,
        firstChapterDirection: seed.firstChapterDirection,
      }, null, 2),
      PREVIOUS_OUTLINE: previousOutline?.trim() || "（无；首次生成）",
    },
  );
  return buildScriptOutlinePromptFromFacts(turn, modeContract);
}

function buildScriptOutlinePromptFromFacts(turn: DialogueTurn, modeContract: string): string {
  const skillName = "script-outline-drafting";
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "outline-prompt.md"),
    {
      MODE_CONTRACT: modeContract,
      SCRIPT_STAGE_BOUNDARY: buildScriptStageBoundaryContract(),
      OUTLINE_FORMAT: getScriptOutlineFormatPrompt(),
      PROJECT_NAME: turn.snapshot.project.name,
      GENRE_TAGS: turn.snapshot.project.genreTags.length > 0
        ? turn.snapshot.project.genreTags.join("、")
        : "未设置",
      COMIC_FORMAT: turn.snapshot.project.comicFormat,
      ART_STYLE: turn.snapshot.project.artStyle,
    },
  );
}

export function buildScriptOutlineRepairPrompt(input: {
  invalidOutput: string;
  validationError: string;
  qualityIssues?: readonly string[];
}): string {
  const skillName = "script-outline-drafting";
  const qualityFailure = Boolean(input.qualityIssues?.length);
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(
      skillName,
      qualityFailure ? "repair-quality-failure.md" : "repair-validation-failure.md",
    ),
    qualityFailure
      ? {
        ISSUES: input.qualityIssues!.join("、"),
        OUTLINE_FORMAT: getScriptOutlineFormatPrompt(),
        INVALID_OUTPUT: input.invalidOutput,
      }
      : {
        OUTLINE_FORMAT: getScriptOutlineFormatPrompt(),
        VALIDATION_ERROR: input.validationError,
        INVALID_OUTPUT: input.invalidOutput,
      },
  );
}

// ---------- 章节剧本 prompt ----------

export function buildScriptFromOutlinePrompt(
  input: SendDialogueMessageRequest,
  context: AiChapterGenerationContext,
): string {
  const expectedHeading = `第 ${context.chapter.order} 章：${context.targetCard.title}`;
  const userSupplement = input.content
    .replace(/(请|帮我|现在|开始)?\s*(生成|写|起草|创作|重新生成|重写)\s*(当前章节|当前章|这一章|这章|本章|第\s*[0-9一二三四五六七八九十百千万零〇两]+\s*(?:章|话))?/g, "")
    .replace(/确认大纲[：:]?[^，。；\n]*/g, "")
    .trim();
  const skillName = "script-chapter-drafting";
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "chapter-draft-prompt.md"),
    {
      EXPECTED_HEADING: expectedHeading,
      SCRIPT_STAGE_BOUNDARY: buildScriptStageBoundaryContract(),
      OUTLINE_TITLE: context.outline.title,
      CHAPTER_ORDER: context.chapter.order,
      CHAPTER_FORMAT: getChapterScriptFormatPrompt(),
      FORBIDDEN_OUTPUT: getChapterScriptForbiddenOutputPrompt(),
      PROJECT_NAME: context.project.name,
      GENRE: context.project.genreTags.join("、") || context.outline.document.genreStyle,
      COMIC_FORMAT: context.project.comicFormat,
      ART_STYLE: context.project.artStyle,
      TARGET_CARD_JSON: JSON.stringify(context.targetCard, null, 2),
      PREVIOUS_CARD_JSON: context.previousCard
        ? JSON.stringify(context.previousCard, null, 2)
        : "（第 1 章，无前一张章节卡）",
      NEXT_CARD_JSON: context.nextCard
        ? JSON.stringify(context.nextCard, null, 2)
        : "（最终章，无后一张章节卡）",
      PREVIOUS_SCRIPT: context.previousScript?.sourceText ?? "（第 1 章，无上一章正文）",
      CONFIRMED_OUTLINE: context.outline.sourceText,
      USER_SUPPLEMENT: userSupplement || "（无；本轮只是发出生成命令）",
    },
  );
}

export function buildChapterDraftRepairPrompt(input: {
  invalidOutput: string;
  validationError: string;
  qualityIssues?: readonly string[];
  expectedHeading: string;
  targetCard: AiChapterGenerationContext["targetCard"];
}): string {
  const skillName = "script-chapter-drafting";
  const qualityFailure = Boolean(input.qualityIssues?.length);
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(
      skillName,
      qualityFailure ? "repair-quality-failure.md" : "repair-validation-failure.md",
    ),
    qualityFailure
      ? {
        ISSUES: input.qualityIssues!.join("、"),
        TARGET_CARD_JSON: JSON.stringify(input.targetCard, null, 2),
        EXPECTED_HEADING: input.expectedHeading,
        CHAPTER_FORMAT: getChapterScriptFormatPrompt(),
        INVALID_OUTPUT: input.invalidOutput,
      }
      : {
        EXPECTED_HEADING: input.expectedHeading,
        CHAPTER_FORMAT: getChapterScriptFormatPrompt(),
        VALIDATION_ERROR: input.validationError,
        INVALID_OUTPUT: input.invalidOutput,
      },
  );
}

// ---------- 章节改写 prompt ----------

export function buildChapterEditingPrompt(
  turn: DialogueTurn,
  input: SendDialogueMessageRequest,
  sourceText: string,
  layer: ScriptRevisionLayer,
  previousScript: ChapterRevisionContinuityContext["previousScript"] = null,
): string {
  const layerContract = getScriptRevisionLayerContract(layer);
  return [
    "你正在为 AI漫游执行剧本阶段 skill：script-chapter-editing。",
    "任务：根据用户要求，改写当前章节草稿。",
    buildScriptStageBoundaryContract(),
    "",
    "硬性规则：",
    "- 必须返回完整更新后的章节 Markdown，不要只返回建议或片段。",
    "- 不要返回 JSON，不要包代码块。",
    "- 必须保留或补齐「章节剧本」固定格式。",
    "- 不要在章节正文里输出“剧本名称”；剧本名称属于项目级标题，会在章节下拉框右侧展示。",
    "- 如果你调整了章节标题，必须同步修改 `## 第 X 章：章节标题` 这一行。",
    `- P4 当前修订层：${getScriptRevisionLayerLabel(layer)}（${layer}）。若用户一句话同时涉及多层，已按最高层处理。`,
    `- ${layerContract[0]}`,
    `- ${layerContract[1]}`,
    "- 章序永远不能改变。标题、类型、主题、风格、漫画形式、目标篇幅和角色名单只有用户明确点名时才可改变。",
    "- 先在内部列出“允许修改 / 必须保护”，再执行；不要把层级、清单、评分、诊断或差异说明输出给用户。",
    "- 尊重当前草稿中的既有事实和剧情方向，不为了写得更顺擅自发明人物、道具、关系或事件。",
    previousScript
      ? "- P5：下方上一章正式正文是只读跨章事实；如果当前草稿已经承接其结尾，改写后不得丢失、重置或矛盾。不得改写上一章。"
      : "- P5：当前是第 1 章或没有可用的上一章正式正文；跳过跨章检查，不得自行编造前情。",
    "- 后续章节卡或未来规划不是已经发生的事实，不得用它覆盖正式前情。",
    "- 不要新增主体列表、正式场景列表、剧情节拍、分镜剧本、镜头编号或图片 Prompt。",
    "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
    "",
    getChapterScriptFormatPrompt(),
    "",
    getChapterScriptForbiddenOutputPrompt(),
    "",
    `项目名称：${turn.snapshot.project.name}`,
    `当前章节：${turn.snapshot.currentChapter?.title ?? "当前章节"}`,
    "用户改写要求：",
    input.content,
    "当前编辑器最新草稿（这是本轮保护基线，最终仍返回完整更新稿）：",
    sourceText,
    ...(previousScript ? [
      "上一章正式正文（只读跨章事实，不是改写对象）：",
      `正式版本：${previousScript.id}`,
      `章节：${previousScript.chapterTitle}`,
      `内容摘要：${previousScript.sourceDigest}`,
      previousScript.sourceText,
    ] : []),
  ].join("\n");
}
