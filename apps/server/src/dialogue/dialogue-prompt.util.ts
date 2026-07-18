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
  const skillName = "script-import-normalize";
  const analysisExample = {
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
  };
  const excludedRangeExample = {
    sourceRange: {
      sourceRef: first?.sourceRef ?? "source-001",
      startBlockRef: first?.blockRef ?? "source-001:block-000001",
      endBlockRef: first?.blockRef ?? "source-001:block-000001",
    },
    category: "non_story",
    reason: "排除原因",
  };
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "import-analysis-prompt.md"),
    {
      HIERARCHY_SUFFIX: input.hierarchyLabel ? `（${input.hierarchyLabel}）` : "",
      ANALYSIS_EXAMPLE_JSON: JSON.stringify(analysisExample, null, 2),
      EXCLUDED_RANGE_EXAMPLE_JSON: JSON.stringify(excludedRangeExample, null, 2),
      SOURCE_DIGEST: input.source.sourceDigest,
      INPUT_MODE: input.source.inputMode,
      DOCUMENTS_JSON: JSON.stringify(input.source.documents.map((document) => ({
        sourceRef: document.sourceRef,
        order: document.order,
        name: document.name,
        mediaType: document.mediaType,
      })), null, 2),
      SOURCE_BLOCKS_LABEL: input.sourceBlocksMode === "catalog"
        ? "稳定原稿 block 目录（正文事实已由下方相邻分段分析给出；必须重新合并全部 block，不得丢失中段）："
        : "稳定原稿 blocks（完整输入，不得主动忽略中段）：",
      SOURCE_BLOCKS_JSON: importSourceBlocksForPrompt(input.source.blocks, input.sourceBlocksMode),
      SEGMENT_ANALYSES_JSON: input.segmentAnalyses?.length
        ? JSON.stringify(input.segmentAnalyses, null, 2)
        : "（无，当前直接读取原稿正文）",
      USER_REQUEST: input.userRequest || "请忠实分析并提出拆章候选。",
      PREVIOUS_ANALYSIS_JSON: input.previousAnalysis
        ? JSON.stringify(input.previousAnalysis, null, 2)
        : "（无）",
    },
  );
}

export function buildScriptImportMaterializePrompt(context: ImportItemWorkContext): string {
  const skillName = "script-import-normalize";
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "import-materialize-prompt.md"),
    {
      EXPECTED_CHAPTER_HEADING: `第 ${context.chapter.order} 章：${context.chapter.title}`,
      CHAPTER_FORMAT: getChapterScriptFormatPrompt(),
      OBSERVED_OUTLINE_JSON: JSON.stringify(context.analysis.observedOutline, null, 2),
      MAP_ITEM_JSON: JSON.stringify(context.mapItem, null, 2),
      SOURCE_BLOCKS_JSON: importSourceBlocksForPrompt(context.sourceBlocks),
    },
  );
}

export function buildScriptImportVerifyPrompt(context: ImportItemWorkContext, sourceText: string): string {
  const outputLines = sourceText.trimEnd().split("\n").map((line, index) => ({
    lineRef: `line-${String(index + 1).padStart(6, "0")}`,
    text: line,
  }));
  const skillName = "script-import-normalize";
  const fidelityExample = {
    schemaVersion: "import-fidelity/1.0",
    sourceCoverage: [{ sourceRange: context.mapItem.sourceRanges[0], outputLineRanges: [{ startLineRef: "line-000001", endLineRef: `line-${String(outputLines.length).padStart(6, "0")}` }], disposition: "reformatted_in_body", note: "说明原稿如何保留" }],
    unsupportedAdditions: [],
    sequenceFindings: [],
    dialogueFindings: [],
    entityFindings: [],
    metadataFindings: [],
    uncertainties: [],
  };
  const findingExample = {
    code: "SOURCE_OMISSION",
    description: "问题说明",
    sourceBlockRefs: [context.sourceBlocks[0]?.blockRef ?? "source-001:block-000001"],
    outputLineRefs: ["line-000001"],
  };
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "import-verify-prompt.md"),
    {
      FIDELITY_EXAMPLE_JSON: JSON.stringify(fidelityExample, null, 2),
      FINDING_EXAMPLE_JSON: JSON.stringify(findingExample, null, 2),
      MAP_ITEM_JSON: JSON.stringify(context.mapItem, null, 2),
      SOURCE_BLOCKS_JSON: importSourceBlocksForPrompt(context.sourceBlocks),
      OUTPUT_LINES_JSON: JSON.stringify(outputLines, null, 2),
    },
  );
}

export function buildScriptImportFormatRepairPrompt(input: {
  stage: "analysis" | "materialize" | "verify";
  validationError: string;
  originalPrompt: string;
  invalidOutput: string;
}): string {
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference("script-import-normalize", "repair-validation-failure.md"),
    {
      STAGE: input.stage,
      VALIDATION_ERROR: input.validationError,
      ORIGINAL_PROMPT: input.originalPrompt,
      INVALID_OUTPUT: input.invalidOutput,
    },
  );
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
  const skillName = "script-chapter-editing";
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "chapter-edit-prompt.md"),
    {
      SCRIPT_STAGE_BOUNDARY: buildScriptStageBoundaryContract(),
      LAYER_LABEL: getScriptRevisionLayerLabel(layer),
      LAYER: layer,
      LAYER_CONTRACT: readOpenCodeSkillReference(skillName, chapterEditingLayerReference(layer)),
      CONTINUITY_RULE: readOpenCodeSkillReference(
        skillName,
        previousScript ? "continuity-with-source.md" : "continuity-without-source.md",
      ),
      CHAPTER_FORMAT: getChapterScriptFormatPrompt(),
      FORBIDDEN_OUTPUT: getChapterScriptForbiddenOutputPrompt(),
      PROJECT_NAME: turn.snapshot.project.name,
      CURRENT_CHAPTER_TITLE: turn.snapshot.currentChapter?.title ?? "当前章节",
      USER_INSTRUCTION: input.content,
      SOURCE_TEXT: sourceText,
      PREVIOUS_VERSION_ID: previousScript?.id ?? "（无）",
      PREVIOUS_CHAPTER_TITLE: previousScript?.chapterTitle ?? "（无）",
      PREVIOUS_SOURCE_DIGEST: previousScript?.sourceDigest ?? "（无）",
      PREVIOUS_SCRIPT: previousScript?.sourceText ?? "（无；第 1 章或没有可用的上一章正式正文）",
    },
  );
}

const CHAPTER_EDITING_LAYER_REFERENCES: Record<ScriptRevisionLayer, string> = {
  continuity: "layer-continuity.md",
  development: "layer-development.md",
  scene_dialogue: "layer-scene-dialogue.md",
  prose: "layer-prose.md",
};

function chapterEditingLayerReference(layer: ScriptRevisionLayer): string {
  return CHAPTER_EDITING_LAYER_REFERENCES[layer];
}

export function buildChapterEditingRepairPrompt(input: {
  invalidOutput: string;
  validationError: string;
  qualityGate?: "P4" | "P5";
  qualityIssues?: readonly string[];
  layer: ScriptRevisionLayer;
  userInstruction: string;
  headingRule: string;
  sourceText: string;
  previousScript: ChapterRevisionContinuityContext["previousScript"];
}): string {
  const skillName = "script-chapter-editing";
  const commonVariables = {
    LAYER_LABEL: getScriptRevisionLayerLabel(input.layer),
    LAYER: input.layer,
    LAYER_CONTRACT: readOpenCodeSkillReference(skillName, chapterEditingLayerReference(input.layer)),
    USER_INSTRUCTION: input.userInstruction,
    HEADING_RULE: input.headingRule,
    CHAPTER_FORMAT: getChapterScriptFormatPrompt(),
    SOURCE_TEXT: input.sourceText,
    PREVIOUS_SCRIPT: input.previousScript?.sourceText ?? "（无；第 1 章或没有可用的上一章正式正文）",
    INVALID_OUTPUT: input.invalidOutput,
  };
  if (input.qualityGate) {
    return renderOpenCodePromptTemplate(
      readOpenCodeSkillReference(
        skillName,
        input.qualityGate === "P5" ? "repair-p5-quality-failure.md" : "repair-p4-quality-failure.md",
      ),
      {
        ...commonVariables,
        ISSUES: input.qualityIssues?.join("、") || `${input.qualityGate}_QUALITY_FAILED`,
      },
    );
  }
  return renderOpenCodePromptTemplate(
    readOpenCodeSkillReference(skillName, "repair-validation-failure.md"),
    {
      ...commonVariables,
      VALIDATION_ERROR: input.validationError,
    },
  );
}
