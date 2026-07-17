import { describe, expect, it } from "vitest";

import {
  SCRIPT_WORKFLOW_STAGE_IDS,
  serializeChapterScriptMarkdownV1,
  type ChapterScriptDocumentV1,
  type ImportAnalysisOutputV1,
  type ScriptWorkflowStageId,
  type SendDialogueMessageRequest,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import { VALID_IMPORT_ANALYSIS_OUTPUT_V1 } from "@airoaming/shared/script-workflow-test-fixtures";
import type { AiChapterGenerationContext } from "../projects/script-workflow-source.repository.js";
import type {
  ImportItemWorkContext,
  RawScriptSourceContext,
} from "../projects/script-workflow-source.repository.js";
import type { DialogueTurn } from "./dialogue-types.js";
import { parseInspirationSeeds } from "./dialogue-json.util.js";
import {
  buildChapterEditingPrompt,
  buildInspirationSeedsPrompt,
  buildScriptFromOutlinePrompt,
  buildScriptImportAnalysisPrompt,
  buildScriptImportMaterializePrompt,
  buildScriptImportVerifyPrompt,
  buildScriptOutlineFromTopicPrompt,
  buildStoryStructurePrompt,
  buildStoryboardPrompt,
  buildStoryboardRepairPrompt,
} from "./dialogue-prompt.util.js";
import { compactPromptText } from "./dialogue-text.util.js";

function turn(): DialogueTurn {
  return {
    snapshot: {
      project: { name: "雨夜证人", storyTitle: "雨夜证人", genreTags: ["悬疑"], comicFormat: "vertical_scroll", artStyle: "comic_style" },
      currentChapter: { sourceText: "这段旧正文绝不能进入 A2 灵感 Prompt。" },
    } as WorkbenchSnapshot,
  } as DialogueTurn;
}

function request(content: string): SendDialogueMessageRequest {
  return { content };
}

const digest = `sha256:${"a".repeat(64)}` as const;

const SCRIPT_STAGE_SKILL_MATRIX = [
  { stageId: "creative.ideation", skill: "script-inspiration-seeding" },
  { stageId: "creative.outline", skill: "script-outline-drafting" },
  { stageId: "creative.chapter-draft", skill: "script-chapter-drafting" },
  { stageId: "creative.chapter-edit", skill: "script-chapter-editing" },
  { stageId: "import.analyze", skill: "script-import-normalize" },
  { stageId: "import.materialize", skill: "script-import-normalize" },
  { stageId: "import.verify", skill: "script-import-normalize" },
] satisfies readonly { stageId: ScriptWorkflowStageId; skill: string }[];

function importSource(): RawScriptSourceContext {
  return {
    id: "raw-1",
    projectId: "project",
    sourceDigest: digest,
    inputMode: "upload",
    contentTypeHint: "script",
    documents: [{ sourceRef: "source-001", order: 1, name: "完整剧本.md", mediaType: "text/markdown", sourceText: "林舟在旧屋找到钥匙。", sourceDigest: digest }],
    blocks: [{ sourceRef: "source-001", blockRef: "block-000001", globalOrder: 1, sourceOrder: 1, locatorLabel: "第 1 段", kind: "narrative", sourceText: "林舟在旧屋找到钥匙。", sourceDigest: digest }],
  };
}

function importWorkContext(): ImportItemWorkContext {
  const analysis = structuredClone(VALID_IMPORT_ANALYSIS_OUTPUT_V1) as unknown as ImportAnalysisOutputV1;
  const candidate = analysis.chapterCandidates[0]!;
  return {
    batchId: "batch-1",
    batchStatus: "processing",
    item: { id: "item-1", chapterId: "chapter-1", order: 1, status: "materializing", attempt: 1, mapItemRef: "chapter-001" },
    chapter: { id: "chapter-1", title: "旧屋钥匙", order: 1 },
    analysis,
    mapItem: {
      mapItemRef: candidate.localRef,
      order: candidate.order,
      title: "旧屋钥匙",
      titleBasis: candidate.title.basis,
      summary: "林舟在旧屋找到钥匙。",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: "block-000001", endBlockRef: "block-000001" }],
      boundaryMode: candidate.boundaryMode,
      boundaryEvidence: candidate.boundaryEvidence,
      confidence: candidate.confidence,
      warnings: [],
      sourceRangeDigest: digest,
    },
    sourceBlocks: importSource().blocks,
  };
}

function context(): AiChapterGenerationContext {
  const first = { order: 1, title: "旧钥匙", chapterGoal: "发现钥匙", coreConflict: "不能惊动追踪者", majorTurn: "钥匙刻着父亲编号", endingHook: "门外响起暗号", nextChapterBridge: "来客现身" };
  const second = { order: 2, title: "门外来客", chapterGoal: "确认来客身份", coreConflict: "信任会暴露藏身处", majorTurn: "来客说出父亲暗号", endingHook: "暗号指向警局内鬼", nextChapterBridge: "追查内鬼" };
  return {
    project: { id: "project", name: "雨夜证人", storyTitle: "雨夜证人", genreTags: ["悬疑"], comicFormat: "vertical_scroll", artStyle: "comic_style" },
    outline: {
      id: "outline",
      title: "雨夜证人",
      sourceText: "# 剧本大纲\n完整项目大纲正文",
      sourceDigest: digest,
      document: { title: "雨夜证人", genreStyle: "悬疑", episodeLength: "短篇", chapterCount: 3, synopsis: "追查父亲失踪真相", mainCharacters: ["林舟（主角）：调查者"], plotStages: ["开端：找到钥匙"], endingDirection: "揭露内鬼", chapterCards: [first, second, { ...second, order: 3, title: "内鬼" }] },
    },
    chapter: { id: "chapter-2", order: 2, title: "门外来客", rowVersion: 0 },
    targetCard: second,
    previousCard: first,
    nextCard: { ...second, order: 3, title: "内鬼" },
    previousScript: {
      id: "script-1",
      chapterId: "chapter-1",
      chapterTitle: "旧钥匙",
      sourceText: "【前章开头】林舟从旧屋地板下找到钥匙。\n【前章中段】钥匙刻着父亲编号。\n【前章结尾】门外响起三短一长的暗号。",
      sourceDigest: digest,
    },
    sourceBindings: [],
    sourceSetDigest: digest,
  };
}

describe("A2-A4 创作 Prompt 契约", () => {
  it("A2 只要求严格三项 JSON，不注入当前章节正文", () => {
    const prompt = buildInspirationSeedsPrompt(turn(), request("给我三个悬疑方向"));
    expect(prompt).toContain("只返回一个严格 JSON 对象");
    expect(prompt).toContain("P1 灵感质量门");
    expect(prompt).toContain("主角承受的核心压力、冲突发动机和视觉前提上实质不同");
    expect(prompt).toContain("不新增字段");
    expect(prompt).not.toContain("```json");
    expect(prompt).not.toContain("这段旧正文绝不能进入");
  });

  it("A3 明确四段项目大纲、具体章数、章节卡和结局方向", () => {
    const prompt = buildScriptOutlineFromTopicPrompt(turn(), request("写一个 6 章悬疑故事"));
    expect(prompt).toContain("## 四、章节安排");
    expect(prompt).toContain("结局方向：");
    expect(prompt).toContain("剧集章数：12 章");
    expect(prompt).toContain("章节卡数量必须与剧集章数完全一致");
    expect(prompt).toContain("P2 因果大纲与结局方向质量门");
    expect(prompt).toContain("终章的下一章衔接必须明确标记故事已经收束");
    expect(prompt).toContain("不要输出评分、检查报告或额外字段");
  });

  it("A4 只生成当前章，并完整读取目标卡、相邻卡和上一章正式正文", () => {
    const prompt = buildScriptFromOutlinePrompt(request("生成当前章节"), context());
    expect(prompt).toContain("## 第 2 章：门外来客");
    expect(prompt).toContain("P3 场景契约");
    expect(prompt).toContain("P5 连续性");
    expect(prompt).toContain("【前章开头】林舟从旧屋地板下找到钥匙。");
    expect(prompt).toContain("【前章中段】钥匙刻着父亲编号。");
    expect(prompt).toContain("【前章结尾】门外响起三短一长的暗号。");
    expect(prompt).toContain("不要把这些分析新增为输出字段");
    expect(prompt).toContain("第 1 章无前章检查");
    expect(prompt).toContain('"title": "旧钥匙"');
    expect(prompt).toContain('"title": "内鬼"');
    expect(prompt).toContain("（无；本轮只是发出生成命令）");
  });

  it("P4 把修订层和保护范围放进内部 Prompt，但不新增输出字段", () => {
    const prompt = buildChapterEditingPrompt(
      turn(),
      request("只润色本章对白，不要修改结尾"),
      "# 章节剧本\n\n## 第 2 章：门外来客\n\n当前完整草稿",
      "scene_dialogue",
    );
    expect(prompt).toContain("P4 当前修订层：场景与对白修订（scene_dialogue）");
    expect(prompt).toContain("必须保留本章方向、结尾事实、项目基础字段和角色名单");
    expect(prompt).toContain("章序永远不能改变");
    expect(prompt).toContain("不要把层级、清单、评分、诊断或差异说明输出给用户");
    expect(prompt).toContain("当前完整草稿");
  });
});

function storyboardTurn(): DialogueTurn {
  const shot = {
    id: "shot-existing",
    order: 1,
    beatId: "beat_01",
    sceneId: "scene_01",
    characterIds: ["char-lin"],
    coreAction: "林舟推过录音笔",
    emotion: "警惕",
    shotType: "medium" as const,
    cameraAngle: "over_shoulder" as const,
    comic: { panelDescription: "两人隔桌对峙", composition: "过肩构图", dialogue: "林舟：听完再决定。", caption: "", panelRhythm: "normal" as const },
    motion: { visualDescription: "林舟推过录音笔", compositionDesign: "过肩构图", cameraMovement: "push_in" as const, frameType: "dialogue" as const, durationMs: 3000, durationHint: "约 3s", voiceLines: [{ characterId: "char-lin", name: "林舟", line: "听完再决定。", voiceStyle: "克制" }] },
    promptDraft: "雨夜室内，两人对峙",
    lockedCandidateId: null,
    status: "draft" as const,
  };
  return {
    ...turn(),
    normalizedStepKey: "storyboard",
    snapshot: {
      ...turn().snapshot,
      currentChapter: { id: "chapter-1", title: "雨夜交易", status: "structured", currentStoryVersionId: "story-v1", sourceText: "林舟把录音笔推给许澄。" },
      storyStructure: {
        id: "story-v1",
        structureJson: {
          characters: [{ id: "character_01", projectCharacterId: "char-lin", name: "林舟" }],
          scenes: [{ id: "scene_01", name: "雨夜办公室" }],
          beats: [{ id: "beat_01", order: 1, title: "交出录音" }],
        },
      },
      pendingStoryboard: {
        id: "board-pending",
        storyboardJson: { chapterTitle: "雨夜交易", shots: [shot], notes: "当前节奏偏慢" },
      },
    } as WorkbenchSnapshot,
  } as DialogueTurn;
}

function longStoryboardScript(): string {
  const scene = (order: number, name: string, description: string, dialogue: string) => ({
    order,
    name,
    location: "旧办公室",
    time: "深夜",
    atmosphere: "戒备",
    characters: "林舟",
    description,
    actions: "林舟观察桌面上的录音笔。",
    dialogue,
    narration: "无",
    endingPoint: "录音灯继续闪烁。",
  });
  const document: ChapterScriptDocumentV1 = {
    chapterOrder: 1,
    chapterTitle: "雨夜交易",
    type: "悬疑",
    theme: "信任",
    style: "克制",
    comicForm: "竖向条漫",
    targetLength: "完整单章",
    logline: "林舟交出录音笔。",
    chapterGoal: "确认录音内容",
    coreConflict: "双方互不信任",
    emotionalArc: "警惕到合作",
    endingHook: "录音出现失踪者声音",
    highlights: ["录音笔", "雨夜", "声音反转"],
    visualAtmosphere: "冷雨",
    colorDirection: "冷蓝",
    visualMotif: "红色录音灯",
    scenes: [
      scene(1, "开场", "前段动作。".repeat(1200), "林舟：先坐下。"),
      scene(2, "中段", "两人隔桌对峙。", "林舟：这句只存在于被摘掉的正文中段。"),
      scene(3, "结尾", "后段动作。".repeat(1200), "林舟：录音开始了。"),
    ],
    endingEvent: "录音开始播放",
    suspense: "声音来自谁",
    nextChapterLead: "追查录音来源",
  };
  return serializeChapterScriptMarkdownV1(document);
}

describe("S1 分镜 Prompt 契约", () => {
  it("首次生成使用结构本地引用、正式枚举和固定双轨分镜方法", () => {
    const prompt = buildStoryboardPrompt(storyboardTurn(), request("生成分镜"), "generate");
    expect(prompt).toContain("动作：generate");
    expect(prompt).toContain("character_01=林舟");
    expect(prompt).toContain("不能填写数据库 UUID、角色名、别名或简称");
    expect(prompt).toContain("每个 beat 至少被一个 Shot 承接");
    expect(prompt).toContain("静态决定性瞬间");
    expect(prompt).toContain("预留不遮挡脸、手、关键道具和线索的空间");
    expect(prompt).toContain("不要强制 16:9、9:16、黄金三秒、CTA、固定总时长");
    expect(prompt).toContain("promptDraft：只压缩 comic 静态候选图所需");
    expect(prompt).toContain("over_shoulder");
    expect(prompt).not.toContain("over_the_shoulder");
    expect(prompt).toContain("首次生成的所有镜头都省略 id");
  });

  it("按对白分配、状态边界、共享 Shot、漫画静态价值的顺序规划，并保留双轨独立 Prompt", () => {
    const prompt = buildStoryboardPrompt(storyboardTurn(), request("生成当前章漫画和漫剧分镜"), "generate");
    const dialoguePlanningIndex = prompt.indexOf("步骤 1：正式对白/配音候选与选择");
    const dialogueSegmentIndex = prompt.indexOf("步骤 2：对白分段");
    const stateIndex = prompt.indexOf("步骤 3：状态边界");
    const shotIndex = prompt.indexOf("步骤 4：共享 Shot");
    const comicValueIndex = prompt.indexOf("步骤 5：comic 静态价值");
    const sharedIndex = prompt.indexOf("共享剧情事实契约");
    const comicIndex = prompt.indexOf("漫画分镜 Prompt（独立设计 comic）");
    const motionIndex = prompt.indexOf("漫剧分镜 Prompt（独立设计 motion");
    const boundaryIndex = prompt.indexOf("漫画 / 漫剧双轨一致性边界");

    expect(dialoguePlanningIndex).toBeGreaterThan(-1);
    expect(dialogueSegmentIndex).toBeGreaterThan(dialoguePlanningIndex);
    expect(stateIndex).toBeGreaterThan(dialogueSegmentIndex);
    expect(shotIndex).toBeGreaterThan(stateIndex);
    expect(comicValueIndex).toBeGreaterThan(shotIndex);
    expect(sharedIndex).toBeGreaterThan(comicValueIndex);
    expect(motionIndex).toBeGreaterThan(sharedIndex);
    expect(comicIndex).toBeGreaterThan(motionIndex);
    expect(boundaryIndex).toBeGreaterThan(comicIndex);
    expect(prompt).toContain("漫画版式：vertical_scroll");
    expect(prompt).toContain("项目画风：comic_style");
    expect(prompt).toContain("角色外观以结构角色卡 visualTraits 为准");
    expect(prompt).toContain("若输入上下文提供了正式角色资产描述，也必须一并遵守");
    expect(prompt).toContain("只有 direction.endingHook 和末尾 beat 已存在钩子时");
    expect(prompt).toContain("不得为了黄金三秒或刺激感自造线索、反转、人物或对白");
    expect(prompt).toContain("motion 不是 comic 的动态说明或附属结果");
    expect(prompt).toContain("motion.visualDescription 写清开始状态 → 一个主要动作/表演/信息变化 → 结束状态");
    expect(prompt).toContain("不得逐句改写 comic.panelDescription");
    expect(prompt).toContain("不机械复制 comic.composition");
    expect(prompt).toContain("一个 motion 默认只承载一个主要动作或一次明确的信息/情绪变化");
    expect(prompt).toContain("对白分段或状态边界确有两段时");
    expect(prompt).toContain("每段默认 1～3 条有内容对白只是复核触发，不是后端硬上限");
    expect(prompt).toContain("新增 comic 也必须承载不同且必要的静态决定性瞬间");
    expect(prompt).toContain("voiceLines[].line 只能逐字复制下方全章正式对白候选");
    expect(prompt).toContain("不得同义改写、补词、改标点");
    expect(prompt).toContain("不要求相同：决定性瞬间、画面描述、构图重点、阅读节奏、时间展开、人物表演和镜头运动");
    expect(prompt).not.toContain("comic 与 motion 描述同一个剧情瞬间");
    expect(prompt).not.toContain("motion 只能补充时间和运镜");
  });

  it("V2.3 先减负和分段，再执行状态停镜与 10 秒软复核，不做三条对白硬门", () => {
    const prompt = buildStoryboardPrompt(storyboardTurn(), request("生成当前章节完整分镜"), "generate");
    expect(prompt).toContain("每段默认 1～3 条有内容对白只是复核触发，不是后端硬上限");
    expect(prompt).toContain("达到退出状态就停镜");
    expect(prompt).toContain("人物改变行动目标或对象");
    expect(prompt).toContain("伸手→按键→屏幕亮起");
    expect(prompt).toContain("超过 10 秒只能用于一段需要不间断表演的单一对白或动作");
    expect(prompt).toContain("只根据本镜实际保留的 voiceLines、主要动作和必要停顿估算");
    expect(prompt).toContain("动态负载无法在一个共享锚点中清楚承接时才增加第二个");
    expect(prompt).toContain("陈述/揭示→选择/后果");
    expect(prompt).toContain("不按固定秒数机械切分");
    expect(prompt).toContain("当前 M1 每个 beat 最多两个 Shot");
    expect(prompt).toContain("达到两镜仍过载时，缩小每镜动作范围");
    expect(prompt).toContain("不能用重复反应、换景别或空画格填充");
    expect(prompt).not.toContain("每 3 条对白拆一镜");
  });

  it("V2.5 实验只在 V2.3 草稿后扫描三类稳定高风险事实，默认生产 Prompt 不启用", () => {
    const productionPrompt = buildStoryboardPrompt(
      storyboardTurn(),
      request("生成当前章节完整分镜"),
      "generate",
    );
    const experimentPrompt = buildStoryboardPrompt(
      storyboardTurn(),
      request("生成当前章节完整分镜"),
      "generate",
      undefined,
      "v2_5_experiment",
    );

    expect(productionPrompt).not.toContain("V2.5 实验：低权重定向风险扫描");
    expect(experimentPrompt).toContain("V2.5 实验：低权重定向风险扫描");
    expect(experimentPrompt).toContain("正常完成 V2.3 草稿后");
    expect(experimentPrompt).toContain("声音、屏幕变化或其他可见/可听信号");
    expect(experimentPrompt).toContain("只停在线索本身");
    expect(experimentPrompt).toContain("关键决定、行动结果或状态变化");
    expect(experimentPrompt).toContain("优先补强承载同一 beat 的既有 Shot");
    expect(experimentPrompt).toContain("不得因为扫描到一个风险事实就新建 Shot");
    expect(experimentPrompt).toContain("只有 V2.3 原有状态边界已经满足必要拆镜条件");
    expect(experimentPrompt).toContain("不要输出事实清单、逐 Beat 映射、评分或诊断字段");
  });

  it("正文摘录看不到中段台词时，仍注入完整正式对白候选表", () => {
    const sourceText = longStoryboardScript();
    expect(compactPromptText(sourceText, 6000)).not.toContain("这句只存在于被摘掉的正文中段。");
    const sourceTurn = storyboardTurn();
    sourceTurn.snapshot.currentChapter!.sourceText = sourceText;
    const prompt = buildStoryboardPrompt(sourceTurn, { ...request("生成分镜"), context: { sourceText } }, "generate");
    expect(prompt).toContain("全章正式对白/配音候选（voiceLines 唯一逐字来源）");
    expect(prompt).toContain('"line": "这句只存在于被摘掉的正文中段。"');
  });

  it("调整动作读取当前 pending、保留已有 ID，并要求返回完整草稿", () => {
    const prompt = buildStoryboardPrompt(storyboardTurn(), request("把结尾节奏加快"), "revise_pending");
    expect(prompt).toContain("动作：revise_pending");
    expect(prompt).toContain("当前待确认分镜");
    expect(prompt).toContain("shot-existing");
    expect(prompt).toContain("保留镜头必须沿用当前草稿 id");
    expect(prompt).toContain("必须返回完整 shots 数组");
    expect(prompt).toContain("把结尾节奏加快");
  });

  it("修复 Prompt 分别修复漫画静态画格和漫剧时间过程", () => {
    const prompt = buildStoryboardRepairPrompt({
      originalPrompt: "原分镜任务",
      invalidOutput: "{bad}",
      validationError: "invalid",
      qualityIssues: ["STORYBOARD_MOTION_VISUAL:shots[0]:PLACEHOLDER"],
      mode: "generate",
    });
    expect(prompt).toContain("comic 独立修复为一个可画的静态决定性瞬间");
    expect(prompt).toContain("motion 独立修复为开始状态→主要动作/表演变化→结束状态");
    expect(prompt).toContain("先从全章正式对白候选中删除非必要来回并完成最多两段分配");
    expect(prompt).toContain("达到退出状态就停镜");
    expect(prompt).toContain("新增 comic 仍必须是不同且必要的静态决定性瞬间");
    expect(prompt).toContain("voiceLines[].line 必须逐字复制原任务中的全章正式对白候选");
    expect(prompt).toContain("不要求描述同一瞬间、相同构图或相同节奏");
    expect(prompt).toContain("promptDraft 只属于静态候选图");
    expect(prompt).not.toContain("每个 Shot 只表达一个静态瞬间");
  });
});

describe("双流程汇合后的剧情结构 Prompt", () => {
  it("只从正式章节提取实际结构，大纲不得补写未发生剧情", () => {
    const prompt = buildStoryStructurePrompt({
      ...turn(),
      snapshot: {
        ...turn().snapshot,
        currentChapter: {
          id: "chapter-1",
          title: "拍卖夜",
          status: "script_done",
          currentScriptVersionId: "script-v1",
          sourceText: "#### 场景 1：拍卖厅\n地点：旧商场\n出场人物：林夏",
        },
        scriptOutline: { sourceText: "大纲计划下一章炸毁地下金库。" },
      } as WorkbenchSnapshot,
    }, request("生成剧情结构"));

    expect(prompt).toContain("正式章节正文是本阶段唯一的实际剧情事实源");
    expect(prompt).toContain("项目级剧本大纲只能帮助理解世界观和角色名称");
    expect(prompt).toContain("不得把大纲中尚未在本章正文发生的事件写入 synopsis、direction、characters、scenes 或 beats");
    expect(prompt).toContain("每一个正文场景都必须且只能对应一个场景卡");
    expect(prompt).toContain("每一个正文场景至少被一个 beat 引用");
    expect(prompt).toContain("sceneName 必须逐字使用对应场景卡 name");
    expect(prompt).toContain("人物名必须逐字使用 characters[].name");
    expect(prompt).toContain("不要输出评分、检查报告或新增字段");
  });
});

describe("P6 五个公开 Skill / 七个模型阶段", () => {
  it("七个冻结阶段全部映射到五个公开 Skill，不增加孤立 Skill", () => {
    expect(SCRIPT_STAGE_SKILL_MATRIX.map((item) => item.stageId)).toEqual(SCRIPT_WORKFLOW_STAGE_IDS);
    expect(new Set(SCRIPT_STAGE_SKILL_MATRIX.map((item) => item.skill))).toEqual(new Set([
      "script-inspiration-seeding",
      "script-outline-drafting",
      "script-chapter-drafting",
      "script-chapter-editing",
      "script-import-normalize",
    ]));
  });

  it("B2 Prompt 只做 observed 分析，并使用稳定来源引用覆盖全部原稿", () => {
    const prompt = buildScriptImportAnalysisPrompt({
      source: importSource(),
      userRequest: "忠实分析并拆章",
    });
    expect(prompt).toContain("已有剧本路线 B2");
    expect(prompt).toContain("outlineRole 必须是 observed");
    expect(prompt).toContain("不得补剧情、强化钩子、调整人物弧");
    expect(prompt).toContain('"sourceRef": "source-001"');
    expect(prompt).toContain('"blockRef": "block-000001"');
    expect(prompt).toContain("林舟在旧屋找到钥匙。");
    expect(prompt).toContain('"excludedRanges": [');
    expect(prompt).toContain('"sourceRange": {');
    expect(prompt).toContain('"category": "non_story"');
    expect(prompt).toContain("category 只能是 front_matter、table_of_contents、character_list、author_note、duplicate、non_story 之一");
    expect(prompt).not.toContain('"category": "front_matter|');
    expect(prompt).toContain("不要代码围栏、Markdown、解释或数据库 ID");
  });

  it("B4 materialize 只忠实整理确认范围，verify 只审计且不相信覆盖率或模型 ready", () => {
    const context = importWorkContext();
    const chapter = "# 章节剧本\n\n## 第 1 章：旧屋钥匙\n\n林舟在旧屋找到钥匙。";
    const materializePrompt = buildScriptImportMaterializePrompt(context);
    const verifyPrompt = buildScriptImportVerifyPrompt(context, chapter);

    expect(materializePrompt).toContain("已有剧本路线 B4");
    expect(materializePrompt).toContain("不得添加事件、对白、人物动机、结局、伏笔或原稿外信息");
    expect(materializePrompt).toContain("标签、录音、屏幕文字、档案内容");
    expect(materializePrompt).toContain("不得改写或重分类为人物对白");
    expect(materializePrompt).toContain("第 1 章：旧屋钥匙");
    expect(materializePrompt).toContain("林舟在旧屋找到钥匙。");
    expect(verifyPrompt).toContain("你只能审计，不能继续改写章节正文");
    expect(verifyPrompt).toContain("sourceCoverage 必须完整、无重叠覆盖");
    expect(verifyPrompt).toContain("可由原文直接支持的摘要、情绪走向、氛围或视觉标签");
    expect(verifyPrompt).toContain("不得作为无来源新增剧情");
    expect(verifyPrompt).toContain("不凭印象给覆盖率数字");
    expect(verifyPrompt).not.toContain("readyForNextStage");
  });
});

describe("A2 灵感输出解析", () => {
  const seed = (title: string) => ({ title, genreTags: ["悬疑", "都市"], logline: `${title}一句话`, keyConflict: `${title}冲突`, visualHook: `${title}画面`, firstChapterDirection: `${title}第一章` });

  it("只接受恰好三项且没有围栏或额外字段的严格 JSON", () => {
    const json = JSON.stringify({ seeds: [seed("一"), seed("二"), seed("三")] });
    expect(parseInspirationSeeds(json)).toHaveLength(3);
    expect(() => parseInspirationSeeds(`\`\`\`json\n${json}\n\`\`\``)).toThrow();
    expect(() => parseInspirationSeeds(JSON.stringify({ seeds: [seed("一"), seed("二"), seed("三"), seed("四")] }))).toThrow();
    expect(() => parseInspirationSeeds(JSON.stringify({ seeds: [seed("一"), seed("二"), { ...seed("三"), extra: true }] }))).toThrow();
  });
});
