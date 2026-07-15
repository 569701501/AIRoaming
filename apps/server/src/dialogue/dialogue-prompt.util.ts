/**
 * DialogueService prompt 构造与边界契约(从 dialogue.service.ts 抽出)。
 *
 * 这些是纯字符串构造函数,无状态依赖。各 prompt 构造器接收 turn/input,
 * 边界契约函数接收 snapshot。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */
import type {
  DialogueMessageItem,
  ScriptInspirationSeed,
  SendDialogueMessageRequest,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import type { AiChapterGenerationContext } from "../projects/script-workflow-source.repository.js";
import {
  SCRIPT_INSPIRATION_SEED_COUNT,
  getChapterScriptForbiddenOutputPrompt,
  getChapterScriptFormatPrompt,
  getScriptOutlineFormatPrompt,
} from "@airoaming/shared";
import type { DialogueTurn } from "./dialogue-types.js";
import { compactPromptText } from "./dialogue-text.util.js";

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

// ---------- 剧情结构 prompt ----------

export function buildStoryStructurePrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  const snapshot = turn.snapshot;
  const currentChapter = snapshot.currentChapter;
  const sourceText = (input.context?.sourceText ?? currentChapter?.sourceText ?? snapshot.story.sourceText).trim();

  return [
    "你正在为 AI漫游执行剧情结构阶段 skill：structure-story-parse。",
    "任务：只针对当前章节生成「剧情结构」JSON，供后续分镜工作台使用。",
    "",
    "硬性边界：",
    "- 只生成当前章节的剧情结构，不要生成整部作品结构。",
    "- 剧情结构不是章节剧本正文，也不是分镜稿。",
    "- 角色卡和场景卡默认都是本章结构卡，不要声称已创建项目级角色库或场景库。",
    "- 角色卡里的 projectCharacterId 字段由后端在确认结构时按角色名匹配项目角色库后回填，你不要输出它。",
    "- 角色卡必须显式输出 level 和 entityType 两个字段，从以下固定值中选一个（见角色分层双维度）：",
    "  - level(戏份重要性): lead=主角 / recurring=重要配角 / chapter=本章关键角色 / minor=小角色·功能角色 / extra=背景路人",
    "  - entityType(存在形态): human=人类 / creature=怪物·异常体·非人生物 / group=群体角色 / voice=纯声音角色(不露脸)",
    "  - 判断依据：主角(视角核心/第一主角)给 lead；长期出现的重要配角/反派/搭档给 recurring；本章重要但未必长期给 chapter；有台词有功能但戏份少给 minor；纯背景填充给 extra。",
    "- 剧情节拍按关键剧情事件切分，粒度要比分镜粗；不要输出镜头编号、景别、机位、构图、图片 Prompt 或 JSON 以外的 Markdown 正文。",
    "- visualFocus 只能写轻量画面重点，不能写镜头语言。",
    "- 必须先返回一个 JSON 代码块，后端会解析这个 JSON。",
    "",
    "JSON 结构必须是：",
    "```json",
    JSON.stringify({
      synopsis: "本章剧情摘要",
      direction: {
        logline: "一句话梗概",
        chapterGoal: "本章目标",
        coreConflict: "核心冲突",
        emotionalArc: "情绪走向",
        endingHook: "结尾钩子",
      },
      characters: [
        {
          name: "角色名",
          role: "本章职能",
          level: "lead",
          entityType: "human",
          motivation: "本章动机",
          relationship: "和本章其他角色的关系",
          visualTraits: "可供后续理解的视觉特征",
          notes: "备注",
        },
      ],
      scenes: [
        {
          name: "场景名",
          location: "地点",
          timeOfDay: "时间",
          atmosphere: "氛围",
          purpose: "剧情作用",
        },
      ],
      beats: [
        {
          order: 1,
          title: "节拍标题",
          summary: "关键事件",
          conflict: "这一拍的冲突或转折",
          characters: ["角色名"],
          sceneName: "场景名",
          visualFocus: "轻量画面重点",
          outcome: "结果/推动",
        },
      ],
      notes: "给后续分镜的结构提醒",
    }, null, 2),
    "```",
    "",
    `项目名称：${snapshot.project.name}`,
    `剧集名称：${snapshot.project.storyTitle}`,
    `当前章节：${currentChapter?.title ?? "当前章节"}`,
    `当前章节状态：${currentChapter?.status ?? "unknown"}`,
    `当前剧本版本：${currentChapter?.currentScriptVersionId ?? "未生成版本"}`,
    "项目级剧本大纲：",
    snapshot.scriptOutline?.sourceText?.trim() || "（暂无项目级剧本大纲）",
    "当前章节剧本：",
    sourceText || "（当前章节为空）",
    "用户本次要求：",
    input.content,
  ].join("\n");
}

// ---------- 分镜 prompt ----------

export function buildStoryboardPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  const snapshot = turn.snapshot;
  const currentChapter = snapshot.currentChapter;
  const structure = snapshot.storyStructure?.structureJson;
  const availableCharacterNames = Array.isArray(structure?.characters)
    ? structure.characters.map((card) => card?.name).filter((name): name is string => typeof name === "string" && name.trim() !== "")
    : [];
  const beatCount = Array.isArray(structure?.beats) ? structure.beats.length : 0;
  const targetShotRange = beatCount > 0
    ? `${beatCount}-${Math.min(Math.max(beatCount * 2, beatCount), 24)}`
    : "8-16";
  const chapterScriptExcerpt = compactPromptText(currentChapter?.sourceText?.trim() ?? "", 6000);

  return [
    "你正在为 AI漫游执行分镜工作台阶段 skill：storyboard-shot-generate。",
    "任务：只针对当前章节，把已确认剧情结构拆成可编辑 Shot[]。",
    "",
    "硬性边界：",
    "- 只生成当前章节分镜，不要生成整部作品分镜。",
    "- 输入事实源是已确认的 structure.json，不读取未确认聊天内容作为正式事实。",
    "- 每个 Shot 必须有共同核心字段，并同时包含 comic 漫画画格表达和 motion 基础漫剧镜头表达。",
    "- M1 可以默认一个 Shot 对应一个漫画画格和一个基础漫剧镜头，但不要在文案中声称未来永远一一对应。",
    "- 不要生成最终图片 Prompt；promptDraft 只能是给后续候选图阶段的草稿摘要。",
    "- 不要生成候选图、TTS、字幕、视频或排版。",
    `- characterIds 必须从已确认剧情结构的角色名里选(可用角色名：${availableCharacterNames.join("、") || "暂无"})，不要自创新名字、用别名或简称。`,
    `- 本章建议生成 ${targetShotRange} 个 Shot；每个剧情节拍默认拆 1-2 个 Shot，除非关键动作/情绪转折必须拆开。`,
    "- 只输出一个 JSON 代码块，不要在 JSON 后追加解释。",
    "- 必须先返回一个 JSON 代码块，后端会解析这个 JSON。",
    "",
    "枚举字段必须从下面固定值中选一个，不要自创值（见 ADR-0007）：",
    "- shotType(景别，共同核心): establishing / wide / full / medium / close_up / extreme_close_up",
    "- cameraAngle(机位角度，共同核心): eye_level / high_angle / low_angle / over_the_shoulder / top_down / dutch_angle",
    "- comic.panelRhythm(画格节奏): slow / normal / fast / impact / transition",
    "- motion.cameraMovement(运镜): static / push_in / pull_out / pan_left / pan_right / tilt_up / tilt_down / track_left / track_right / slow_zoom / handheld / none",
    "- motion.frameType(镜头类型): atmosphere / dialogue / action / reaction / detail / transition",
    "- shotType 和 cameraAngle 放在 Shot 顶层（comic 和 motion 共用一份），不要在 comic/motion 里重复填。",
    "- comic.composition 只写构图（人物位置、视觉重心），不要再塞景别和机位。",
    "- motion.durationMs 给数字（毫秒，如 3000），durationHint 给人看的文本（如「约 3s」）。",
    "- motion.voiceLines 是数组，支持一个镜头多人对话；没有台词就给空数组 []。不要再用旧的 voiceRole / line 字段。",
    "",
    "JSON 结构必须是：",
    "```json",
    JSON.stringify({
      shots: [
        {
          order: 1,
          beatId: "beat_01",
          sceneId: "scene_01",
          characterIds: ["角色名"],
          coreAction: "镜头核心动作",
          emotion: "情绪",
          shotType: "medium",
          cameraAngle: "eye_level",
          comic: {
            panelDescription: "漫画画格画面描述",
            composition: "构图（人物位置/视觉重心，不含景别机位）",
            dialogue: "对白气泡文字，没有就空字符串",
            caption: "旁白，没有就空字符串",
            panelRhythm: "slow",
          },
          motion: {
            visualDescription: "漫剧动态画面描述",
            compositionDesign: "动态构图设计",
            cameraMovement: "push_in",
            frameType: "atmosphere",
            durationMs: 3000,
            durationHint: "约 3s",
            voiceLines: [
              {
                characterId: null,
                name: "角色名",
                line: "台词内容",
                voiceStyle: "声音风格，如低声、克制",
              },
            ],
          },
          promptDraft: "给后续图片提示词生成的简短草稿，不是最终 Prompt",
        },
      ],
      notes: "分镜节奏说明",
    }, null, 2),
    "```",
    "",
    `项目名称：${snapshot.project.name}`,
    `剧集名称：${snapshot.project.storyTitle}`,
    `当前章节：${currentChapter?.title ?? "当前章节"}`,
    `当前章节状态：${currentChapter?.status ?? "unknown"}`,
    `当前剧情结构版本：${currentChapter?.currentStoryVersionId ?? "未确认"}`,
    "已确认剧情结构：",
    JSON.stringify(structure ?? {}, null, 2),
    "当前章节剧本摘录（仅作对白和动作参考；正式拆分以 structure.json 为准）：",
    chapterScriptExcerpt || "（当前章节为空）",
    "用户本次要求：",
    input.content,
  ].join("\n");
}

// ---------- 灵感种子 prompt ----------

export function buildInspirationSeedsPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  const snapshot = turn.snapshot;
  const tags = snapshot.project.genreTags.length > 0 ? snapshot.project.genreTags.join("、") : "未设置";
  return [
    "你正在为 AI漫游执行剧本阶段 skill：script-inspiration-seeding。",
    `任务：根据用户输入，为漫画项目生成 ${SCRIPT_INSPIRATION_SEED_COUNT} 个可选择的灵感种子。`,
    buildScriptStageBoundaryContract(),
    "",
    "硬性规则：",
    `- 必须生成 ${SCRIPT_INSPIRATION_SEED_COUNT} 个灵感种子，不多也不少。`,
    "- 只生成灵感种子，不写章节正文，不声称已经更新项目文件。",
    "- 每个方向要明显不同，能支撑后续生成第 1 章。",
    "- 不要返回固定模板，要结合用户输入、项目名称、题材标签和当前章节状态。",
    "- 只返回一个严格 JSON 对象，不要代码块，不要 Markdown，不要在 JSON 前后追加解释。",
    "- JSON 顶层只能有 seeds；每个 seed 只能有约定的 6 个字段。",
    "",
    "JSON 结构必须是：",
    "{\"seeds\":[{\"title\":\"\",\"genreTags\":[\"\"],\"logline\":\"\",\"keyConflict\":\"\",\"visualHook\":\"\",\"firstChapterDirection\":\"\"}]}",
    "",
    `项目名称：${snapshot.project.name}`,
    `题材标签：${tags}`,
    `画幅：${snapshot.project.comicFormat}`,
    `画风：${snapshot.project.artStyle}`,
    "用户本轮输入：",
    input.content,
  ].join("\n");
}

// ---------- 剧本大纲 prompt ----------

export function buildScriptOutlineFromTopicPrompt(turn: DialogueTurn, input: SendDialogueMessageRequest): string {
  return [
    "你正在为 AI漫游执行剧本阶段 skill：script-outline-drafting。",
    "任务：用户已给出明确题材/方向,直接生成或重生成项目级「剧本大纲」,不需要灵感种子。",
    buildScriptStageBoundaryContract(),
    "",
    "硬性规则：",
    "- 只返回剧本大纲 Markdown 正文,不要返回 JSON,不要包代码块。",
    "- 必须按「剧本大纲」固定格式输出,不要改名、删块或合并块。",
    "- 剧集名称优先使用用户题材里提到的作品名或篇章名;如果没有,用一个贴合题材的标题。",
    "- 大纲是项目级产物,用于让用户确认故事方向;不要写章节正文。",
    "- 情节概要必须形成清晰的“但是/因此”因果推进，并明确最终结局方向，不以空泛口号代替结局。",
    "- 剧集章数必须确定为一个正整数；如果用户给范围，要结合故事体量选定一个具体数字。",
    "- 必须为每一章生成一张轻量章节卡；章节卡只规划目标、冲突、转折、钩子和跨章衔接，不生成详细场景与剧情节拍。",
    "- 不要套用提示中示例的人名、剧情或设定,只参考格式。",
    "- 不要声称你直接操作本地文件;保存由后端受控工具完成。",
    "",
    getScriptOutlineFormatPrompt(),
    "",
    `项目名称：${turn.snapshot.project.name}`,
    `题材标签：${turn.snapshot.project.genreTags.length > 0 ? turn.snapshot.project.genreTags.join("、") : "未设置"}`,
    `画幅：${turn.snapshot.project.comicFormat}`,
    `画风：${turn.snapshot.project.artStyle}`,
    "用户给定的题材/方向(直接据此生成大纲,不要偏题)：",
    input.content,
  ].join("\n");
}

export function buildScriptOutlineFromSeedPrompt(
  turn: DialogueTurn,
  input: SendDialogueMessageRequest,
  seed: ScriptInspirationSeed,
  seedPrompt: string,
  previousOutline?: string,
): string {
  return [
    "你正在为 AI漫游执行剧本阶段 skill：script-outline-drafting。",
    "任务：根据用户选中的灵感种子，生成或重生成项目级「剧本大纲」。",
    buildScriptStageBoundaryContract(),
    "",
    "硬性规则：",
    "- 只返回剧本大纲 Markdown 正文，不要返回 JSON，不要包代码块。",
    "- 必须按「剧本大纲」固定格式输出，不要改名、删块或合并块。",
    `- 剧集名称优先使用选中的灵感种子标题：${seed.title}`,
    "- 大纲是项目级产物，用于让用户确认故事方向；不要写章节正文。",
    "- 情节概要必须形成清晰的“但是/因此”因果推进，并明确最终结局方向。",
    "- 剧集章数必须确定为一个正整数，并为每一章生成一张轻量章节卡；后续只按单个目标章节生成。",
    "- 章节卡只规划目标、冲突、转折、钩子和跨章衔接，不生成详细场景、剧情节拍或正文。",
    "- 不要套用用户示例里的人名、古装重生剧情、角色关系或情节，只参考格式。",
    "- 不要声称你直接操作本地文件；保存由后端受控工具完成。",
    "",
    getScriptOutlineFormatPrompt(),
    "",
    `项目名称：${turn.snapshot.project.name}`,
    `题材标签：${turn.snapshot.project.genreTags.length > 0 ? turn.snapshot.project.genreTags.join("、") : "未设置"}`,
    `画幅：${turn.snapshot.project.comicFormat}`,
    `画风：${turn.snapshot.project.artStyle}`,
    `用户最初找灵感时说：${seedPrompt}`,
    `用户当前要求：${input.content}`,
    "选中的灵感种子：",
    JSON.stringify({
      title: seed.title,
      genreTags: seed.genreTags,
      logline: seed.logline,
      keyConflict: seed.keyConflict,
      visualHook: seed.visualHook,
      firstChapterDirection: seed.firstChapterDirection,
    }, null, 2),
    previousOutline ? "上一版剧本大纲：" : "",
    previousOutline ?? "",
  ].filter(Boolean).join("\n");
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
  return [
    "你正在为 AI漫游执行剧本阶段 skill：script-chapter-drafting。",
    `任务：依据密封的已确认来源，只生成「${expectedHeading}」这一章的完整章节剧本。`,
    buildScriptStageBoundaryContract(),
    "",
    "硬性规则：",
    "- 只返回章节 Markdown 正文，不要返回 JSON，不要包代码块。",
    "- 必须按「章节剧本」固定格式输出，不要改名、删块或合并块。",
    `- 二级标题必须精确为「## ${expectedHeading}」，章序和标题不得自行改动。`,
    `- 项目级剧本名称是「${context.outline.title}」，只作为上下文使用，不要在章节正文里输出“剧本名称”。`,
    `- 只生成第 ${context.chapter.order} 章，不要提前写下一章，不要输出整部大纲。`,
    "- 来源优先级固定为：当前章节卡与项目大纲 > 上一章已确认正式正文 > 用户本轮有效补充。来源冲突时不得自行猜测或覆盖上位来源。",
    "- P3 场景契约：每场戏都要有进入状态、明确目的、阻力或选择、可见变化和退出状态；没有推动剧情或人物的场景应合并或删除。",
    "- P5 连续性：人物状态、已知信息、关键物品、地点、关系和未回收悬念必须承接上一章正式正文；不得把未确认草稿当事实。",
    "- 当前章节卡的章节目标、核心冲突、关键转折和结尾钩子必须在正文中可观察，不得只写在顶部摘要字段。",
    "- 内容要能直接进入当前章节的待确认草稿。",
    "- 「视觉基调」只是方向，不是图片 Prompt。",
    "- 「剧本正文」里可以有场景、人物、动作和对白，但不能输出正式场景列表、剧情节拍、分镜剧本或镜头编号。",
    "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
    "",
    getChapterScriptFormatPrompt(),
    "",
    getChapterScriptForbiddenOutputPrompt(),
    "",
    `项目：${context.project.name}`,
    `题材：${context.project.genreTags.join("、") || context.outline.document.genreStyle}`,
    `漫画形式：${context.project.comicFormat}`,
    `画风：${context.project.artStyle}`,
    "当前章节卡（本章直接写作合同）：",
    JSON.stringify(context.targetCard, null, 2),
    "前一张章节卡（只用于跨章衔接）：",
    context.previousCard ? JSON.stringify(context.previousCard, null, 2) : "（第 1 章，无前一张章节卡）",
    "后一张章节卡（只用于控制本章结尾，不得提前写入下一章）：",
    context.nextCard ? JSON.stringify(context.nextCard, null, 2) : "（最终章，无后一张章节卡）",
    "上一章已确认正式正文（必须完整承接；第 1 章为空）：",
    context.previousScript?.sourceText ?? "（第 1 章，无上一章正文）",
    "已确认项目级剧本大纲（项目方向与结局事实源）：",
    context.outline.sourceText,
    "用户本轮有效补充：",
    userSupplement || "（无；本轮只是发出生成命令）",
  ].join("\n");
}

export function buildScriptFromSeedPrompt(
  turn: DialogueTurn,
  input: SendDialogueMessageRequest,
  seed: ScriptInspirationSeed,
  seedPrompt: string,
): string {
  return [
    "你正在为 AI漫游执行剧本阶段 skill：script-chapter-drafting。",
    "任务：根据用户选中的灵感种子，生成第 1 章完整「章节剧本」。",
    buildScriptStageBoundaryContract(),
    "",
    "硬性规则：",
    "- 只返回章节 Markdown 正文，不要返回 JSON，不要包代码块。",
    "- 必须按「章节剧本」固定格式输出，不要改名、删块或合并块。",
    `- 项目级剧本名称是「${seed.title}」，只作为上下文使用，不要在章节正文里输出“剧本名称”。`,
    "- 章节标题是本章标题，后端会把它同步为章节列表标题。",
    "- 内容要能直接写入 `chapters/chapter-001/script.md`。",
    "- 「视觉基调」只是方向，不是图片 Prompt。",
    "- 「剧本正文」里可以有场景、人物、动作和对白，但不能输出正式场景列表、剧情节拍、分镜剧本或镜头编号。",
    "- 不要声称你直接操作本地文件；写入由后端受控工具完成。",
    "",
    getChapterScriptFormatPrompt(),
    "",
    getChapterScriptForbiddenOutputPrompt(),
    "",
    `项目名称：${turn.snapshot.project.name}`,
    `剧集名称：${turn.snapshot.project.storyTitle}`,
    `用户最初找灵感时说：${seedPrompt}`,
    `用户当前要求：${input.content}`,
    "选中的灵感种子：",
    JSON.stringify({
      title: seed.title,
      genreTags: seed.genreTags,
      logline: seed.logline,
      keyConflict: seed.keyConflict,
      visualHook: seed.visualHook,
      firstChapterDirection: seed.firstChapterDirection,
    }, null, 2),
    "用户本次要求：",
    input.content,
  ].join("\n");
}

// ---------- 章节改写 prompt ----------

export function buildChapterEditingPrompt(
  turn: DialogueTurn,
  input: SendDialogueMessageRequest,
  sourceText: string,
): string {
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
    "- 尊重原文核心设定，不擅自换故事方向。",
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
    "当前编辑器最新草稿：",
    sourceText,
  ].join("\n");
}
