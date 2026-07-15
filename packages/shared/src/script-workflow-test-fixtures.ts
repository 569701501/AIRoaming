import type { ScriptSourceBlockRefV1, ScriptWorkflowStageId } from "./script-workflow-contract.js";

export const VALID_CREATIVE_IDEATION_OUTPUT_V1 = {
  seeds: [
    {
      title: "记忆典当行",
      genreTags: ["都市奇幻", "悬疑"],
      logline: "能典当记忆的少女必须找回被父亲卖掉的最后一天，否则她会忘记自己为何活着。",
      keyConflict: "每取回一段记忆，典当行都会把她珍视的另一段经历转卖给敌人。",
      visualHook: "雨夜霓虹下，透明记忆瓶沿着高墙传送带流向地下金库。",
      firstChapterDirection: "少女发现母亲的记忆瓶即将拍卖，第一次闯入只换来父亲仍活着的证据。",
    },
    {
      title: "潮汐列车",
      genreTags: ["公路", "灾难", "亲情"],
      logline: "海水淹没城市后，胆小的列车员必须驾驶最后一班潮汐列车寻找失踪弟弟。",
      keyConflict: "列车每救下一座站台的人，就会消耗无法补充的浮力燃料并推迟寻找弟弟。",
      visualHook: "银色列车在楼群之间的海面轨道上跃过巨浪，车窗内挤满幸存者。",
      firstChapterDirection: "列车员违令停靠学校站，却从获救孩子手里看到弟弟留下的车票。",
    },
    {
      title: "纸兽法庭",
      genreTags: ["古风", "法庭", "成长"],
      logline: "只能让纸兽说真话的见习讼师，被迫替一只被指控弑主的纸鹤辩护。",
      keyConflict: "每次纸兽作证都会烧掉一页契约，而契约烧尽时真正的主人也会消失。",
      visualHook: "宣纸折成的百兽盘踞在悬空法庭，墨迹随着证词化作锁链。",
      firstChapterDirection: "见习讼师发现纸鹤拒绝说出的名字属于自己的老师，决定冒险接案。",
    },
  ],
} as const;

export const VALID_SCRIPT_OUTLINE_MARKDOWN_V1 = `# 剧本大纲

## 一、基础信息
剧集名称：记忆典当行
题材风格：都市奇幻、悬疑、成长
剧集篇幅：中篇条漫
剧集章数：2 章
剧情简介：少女追查被父亲典当的记忆，在一次次交换中发现典当行正在制造可控制全城的共同记忆。

## 二、主要角色
林夏（主角）：想找回母亲；需要接受失去无法全部逆转；逃避父亲可能主动背叛的事实；被典当行持续追捕
周默（搭档）：想赎回自己的姓名；需要重新信任他人；习惯用交易代替承诺；掌握地下金库入口

## 三、情节概要
第 1 章：林夏为夺回母亲记忆闯入拍卖会，却发现父亲仍活着并在替典当行工作。
第 2 章：林夏利用父亲留下的漏洞进入金库，必须在个人记忆与全城自由之间作出选择。
结局方向：林夏放弃恢复全部私人记忆，释放全城被篡改的记忆，并保留重新认识父亲的可能。

## 四、章节安排

### 第 1 章：拍卖夜
章节目标：夺回即将被拍卖的母亲记忆
核心冲突：救出记忆会暴露周默并失去唯一内应
关键转折：林夏发现拍卖主持人使用的是父亲的身份
结尾钩子：父亲暗中留下通往地下金库的钥匙
下一章衔接：钥匙迫使林夏在信任父亲和立即逃亡之间作出选择

### 第 2 章：共同记忆
章节目标：阻止典当行发布控制全城的共同记忆
核心冲突：关闭装置会永久销毁林夏尚未找回的私人记忆
关键转折：林夏确认父亲多年潜伏是为保住关闭装置的机会
结尾钩子：林夏选择释放全城记忆并承担自己的永久失去
下一章衔接：故事收束（终章）
`;

export const VALID_CHAPTER_SCRIPT_MARKDOWN_V1 = `# 章节剧本

## 第 1 章：拍卖夜

### 一、基础方向
类型：都市奇幻悬疑
主题：记忆与选择
风格：紧张、克制
漫画形式：竖向条漫
目标篇幅：完整呈现本章行动与转折

### 二、本章方向
一句话梗概：林夏闯入记忆拍卖会，却发现主持人使用着父亲的身份。
本章目标：夺回母亲的记忆瓶
核心冲突：行动会暴露作为内应的周默
情绪走向：压抑潜入到身份揭示后的震惊
结尾钩子：父亲留下地下金库钥匙

### 三、剧本亮点
亮点 1：记忆瓶在霓虹传送带上流动
亮点 2：林夏在竞拍声中逆向攀爬高墙
亮点 3：主持人摘下面具露出父亲的脸

### 四、视觉基调
画面氛围：潮湿、拥挤、危险
色调方向：冷蓝霓虹与记忆瓶暖金形成对比
视觉记忆点：透明记忆瓶映出不同人生片段

### 五、剧本正文

#### 场景 1：拍卖会外墙
地点：旧商场外墙
时间：雨夜
氛围：急促而隐秘
出场人物：林夏、周默

剧情描写：
林夏沿维护梯逆向攀爬，头顶的记忆瓶正被传送进拍卖厅。

人物动作：
周默切断一盏探照灯，林夏趁黑跃进破损的通风窗。

对白：
周默：“进去以后，我只能替你争取三分钟。”

旁白：
无

场景结束点：
林夏落在拍卖厅上方的钢梁上。

#### 场景 2：记忆拍卖厅
地点：旧商场中庭
时间：同夜
氛围：华丽而压迫
出场人物：林夏、主持人、买家

剧情描写：
母亲的记忆瓶被推上展台，主持人宣布竞拍开始。

人物动作：
林夏割断吊索降到展台，主持人在混乱中摘下面具。

对白：
主持人：“你还是来了。”

旁白：
林夏认出那是失踪多年的父亲。

场景结束点：
父亲把一枚金属钥匙踢到林夏脚边。

### 六、本章结尾
结尾事件：林夏带着母亲记忆瓶和金库钥匙逃出拍卖厅
悬念：父亲为何替典当行主持拍卖
下一章引子：钥匙指向典当行地下金库
`;

export const IMPORT_SOURCE_BLOCKS_V1: readonly ScriptSourceBlockRefV1[] = [
  { sourceRef: "source-001", blockRef: "block-000001", globalOrder: 1 },
  { sourceRef: "source-001", blockRef: "block-000002", globalOrder: 2 },
  { sourceRef: "source-001", blockRef: "block-000003", globalOrder: 3 },
  { sourceRef: "source-001", blockRef: "block-000004", globalOrder: 4 },
];

export const VALID_IMPORT_ANALYSIS_OUTPUT_V1 = {
  schemaVersion: "import-analysis/1.0",
  outlineRole: "observed",
  sourceProfile: { contentType: "script", explicitBoundaryLevel: "chapter" },
  observedOutline: {
    sourceTitle: { value: "雨夜来客", basis: "source" },
    synopsis: "林舟寻找失踪证人，并发现追捕命令来自直属上司。",
    mainCharacters: [
      {
        name: "林舟",
        aliases: ["小林"],
        observedIdentity: "负责寻找证人的警员",
        observedPursuit: "在封锁前找到证人",
        relationships: ["与许澄为搭档"],
        sourceRanges: [{ sourceRef: "source-001", startBlockRef: "block-000001", endBlockRef: "block-000003" }],
      },
    ],
    plotStages: [
      {
        order: 1,
        label: "证人失踪",
        summary: "林舟从寻找证人转向调查内部命令。",
        sourceRanges: [{ sourceRef: "source-001", startBlockRef: "block-000001", endBlockRef: "block-000003" }],
      },
    ],
    endingObservation: {
      kind: "open",
      summary: "原稿停在林舟收到旧录音的位置。",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: "block-000003", endBlockRef: "block-000003" }],
    },
  },
  chapterCandidates: [
    {
      localRef: "chapter-001",
      order: 1,
      title: { value: "失踪的证人", basis: "suggested" },
      summary: "林舟寻找证人并发现内部追捕命令。",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: "block-000001", endBlockRef: "block-000003" }],
      boundaryMode: "proposed_story_transition",
      boundaryEvidence: {
        start: { type: "source_start", anchorBlockRef: "block-000001", description: "原稿正文开始。" },
        end: { type: "major_turn", anchorBlockRef: "block-000003", description: "主要行动目标发生改变。" },
      },
      confidence: "high",
      warnings: [],
    },
  ],
  excludedRanges: [
    {
      sourceRange: { sourceRef: "source-001", startBlockRef: "block-000004", endBlockRef: "block-000004" },
      category: "author_note",
      reason: "作者修订说明，不属于叙事正文。",
    },
  ],
  unresolvedItems: [],
  globalWarnings: [],
} as const;

export const IMPORT_OUTPUT_LINE_REFS_V1 = ["line-0001", "line-0002", "line-0003", "line-0004", "line-0005"] as const;

export const VALID_IMPORT_FIDELITY_OUTPUT_V1 = {
  schemaVersion: "import-fidelity/1.0",
  sourceCoverage: [
    {
      sourceRange: { sourceRef: "source-001", startBlockRef: "block-000001", endBlockRef: "block-000003" },
      outputLineRanges: [{ startLineRef: "line-0001", endLineRef: "line-0005" }],
      disposition: "reformatted_in_body",
      note: "三个原稿块均按原顺序进入剧本正文。",
    },
  ],
  unsupportedAdditions: [],
  sequenceFindings: [],
  dialogueFindings: [],
  entityFindings: [],
  metadataFindings: [],
  uncertainties: [],
} as const;

export interface ScriptWorkflowStageFixtureV1 {
  stageId: ScriptWorkflowStageId;
  valid: unknown;
  invalid: unknown;
}

export const SCRIPT_WORKFLOW_STAGE_FIXTURES_V1: readonly ScriptWorkflowStageFixtureV1[] = [
  {
    stageId: "creative.ideation",
    valid: VALID_CREATIVE_IDEATION_OUTPUT_V1,
    invalid: { seeds: VALID_CREATIVE_IDEATION_OUTPUT_V1.seeds.slice(0, 2) },
  },
  {
    stageId: "creative.outline",
    valid: VALID_SCRIPT_OUTLINE_MARKDOWN_V1,
    invalid: VALID_SCRIPT_OUTLINE_MARKDOWN_V1.replace("剧集章数：2 章", "剧集章数：3 章"),
  },
  {
    stageId: "creative.chapter-draft",
    valid: VALID_CHAPTER_SCRIPT_MARKDOWN_V1,
    invalid: VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("### 六、本章结尾", "### 七、本章结尾"),
  },
  {
    stageId: "creative.chapter-edit",
    valid: VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("急促而隐秘", "安静却随时可能失控"),
    invalid: VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("#### 场景 2：记忆拍卖厅", "#### 场景 3：记忆拍卖厅"),
  },
  {
    stageId: "import.analyze",
    valid: VALID_IMPORT_ANALYSIS_OUTPUT_V1,
    invalid: { ...VALID_IMPORT_ANALYSIS_OUTPUT_V1, readyForNextStage: true },
  },
  {
    stageId: "import.materialize",
    valid: VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("完整呈现本章行动与转折", "按本章确认原稿范围完整整理"),
    invalid: VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("林夏沿维护梯逆向攀爬", "sourceRef=source-001；林夏沿维护梯逆向攀爬"),
  },
  {
    stageId: "import.verify",
    valid: VALID_IMPORT_FIDELITY_OUTPUT_V1,
    invalid: { ...VALID_IMPORT_FIDELITY_OUTPUT_V1, verdict: "ready" },
  },
] as const;
