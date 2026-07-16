import { describe, expect, it } from "vitest";
import {
  parseCreativeIdeationOutputV1,
  parseScriptOutlineMarkdownV1,
  serializeChapterScriptMarkdownV1,
  type ChapterScriptDocumentV1,
} from "@airoaming/shared";

import {
  assertP1InspirationQuality,
  assertP2OutlineQuality,
  assertP3P5ChapterDraftQuality,
  ScriptCreativeQualityError,
} from "./script-creative-quality.util.js";
import { normalizeInspirationSeed } from "./dialogue-text.util.js";

const GOOD_SEEDS = {
  seeds: [
    { title: "记忆典当行", genreTags: ["奇幻", "悬疑"], logline: "失忆少女必须赎回被父亲卖掉的最后一天。", keyConflict: "每取回一段记忆，敌人就会获得她的另一段秘密。", visualHook: "霓虹雨夜里，记忆瓶沿高墙流进地下金库。", firstChapterDirection: "少女闯入拍卖会，却看见主持人戴着父亲的脸。" },
    { title: "潮汐列车", genreTags: ["灾难", "亲情"], logline: "胆小列车员驾驶末班列车寻找被洪水困住的弟弟。", keyConflict: "每救一站乘客都会耗尽无法补充的浮力燃料。", visualHook: "银色列车在淹没楼群的海面轨道上跃过巨浪。", firstChapterDirection: "列车员违令停靠学校站，得到弟弟留下的车票。" },
    { title: "纸兽法庭", genreTags: ["古风", "法庭"], logline: "见习讼师必须替一只被控弑主的纸鹤辩护。", keyConflict: "纸兽每次作证都会烧毁一页决定主人生死的契约。", visualHook: "宣纸百兽盘踞悬空法庭，墨迹随证词化作锁链。", firstChapterDirection: "讼师发现纸鹤隐瞒的名字属于老师，决定冒险接案。" },
  ],
} as const;

const GOOD_OUTLINE = `# 剧本大纲

## 一、基础信息
剧集名称：雨夜末班车
题材风格：都市悬疑
剧集篇幅：2 章短篇
剧集章数：2 章
剧情简介：林夏想寻找失踪姐姐，但是异常末班车会抹去乘客记录，因此她必须在车辆进入隧道前查清真相。

## 二、主要角色
林夏（主角）：想找到姐姐，却逃避自己曾错过姐姐求救的愧疚。

## 三、情节概要
开端：林夏登上无人末班车，但是车辆拒绝停车，因此她被迫追查姐姐留下的钥匙。
发展：钥匙打开封闭总站，然而公开证据会危及姐姐，所以林夏必须在救人和留证之间选择。
结局方向：林夏冒险直播运营方的罪证并救出姐姐，承认自己的愧疚但不再被它控制。

## 四、章节安排

### 第 1 章：无人末班车
章节目标：找到姐姐留下的第一条线索
核心冲突：登车追踪线索就可能无法返回
关键转折：广播准确叫出林夏的名字
结尾钩子：姐姐的钥匙指向封闭总站
下一章衔接：钥匙迫使林夏继续前往封闭总站

### 第 2 章：封闭总站
章节目标：救出姐姐并公开事故证据
核心冲突：救人会让运营方有时间销毁证据
关键转折：姐姐主动要求林夏先开启直播
结尾钩子：负责人在直播中承认掩盖事故
下一章衔接：姐妹获救、证据公开，故事收束（终章）
`;

function normalizedSeeds(value: unknown = GOOD_SEEDS) {
  return parseCreativeIdeationOutputV1(value).seeds.map(normalizeInspirationSeed);
}

const GOOD_CHAPTER: ChapterScriptDocumentV1 = {
  chapterOrder: 2,
  chapterTitle: "门外来客",
  type: "悬疑",
  theme: "信任",
  style: "紧凑",
  comicForm: "竖向条漫",
  targetLength: "约 1200 字",
  logline: "林舟判断门外来客是否可信。",
  chapterGoal: "确认门外来客身份。",
  coreConflict: "开门会暴露藏身处。",
  emotionalArc: "戒备到震惊。",
  endingHook: "暗号指向警局内鬼。",
  highlights: ["暗号", "选择", "内鬼"],
  visualAtmosphere: "雨夜",
  colorDirection: "冷蓝",
  visualMotif: "旧钥匙",
  scenes: [
    {
      order: 1,
      name: "门内门外",
      location: "旧屋",
      time: "夜",
      atmosphere: "戒备",
      characters: "林舟、许澄",
      description: "许澄在门外说出父亲暗号，林舟借暗号确认门外来客身份。",
      actions: "林舟没有立刻开门，因为开门会暴露藏身处。",
      dialogue: "许澄：三短一长，我来交出名册。",
      narration: "雨声掩住脚步。",
      endingPoint: "林舟确认暗号无误，拉开门闩让许澄进入。",
    },
    {
      order: 2,
      name: "警员名册",
      location: "旧屋内",
      time: "同夜",
      atmosphere: "震惊",
      characters: "林舟、许澄",
      description: "许澄摊开警员名册，名单证明父亲暗号指向警局内鬼。",
      actions: "林舟锁门并圈出泄露藏身处的警员姓名。",
      dialogue: "林舟：内鬼一直知道我们的路线。",
      narration: "信任从这一刻变成共同承担的危险。",
      endingPoint: "林舟决定连夜核实名册，调查方向转向警局内部。",
    },
  ],
  endingEvent: "许澄交出警员名册。",
  suspense: "内鬼是谁？",
  nextChapterLead: "林舟开始核实名册。",
};

const PREVIOUS_CHAPTER = serializeChapterScriptMarkdownV1({
  ...GOOD_CHAPTER,
  chapterOrder: 1,
  chapterTitle: "旧钥匙",
  logline: "林舟在旧屋找到钥匙，并听见门外来客敲出父亲暗号。",
  scenes: [{
    ...GOOD_CHAPTER.scenes[0]!,
    order: 1,
    name: "暗号敲门",
    description: "林舟找到旧钥匙时，门外来客敲出父亲暗号。",
    actions: "林舟握住钥匙，停在门闩前。",
    dialogue: "门外来客：三短一长。",
    narration: "父亲只把这个暗号告诉过林舟。",
    endingPoint: "门外再次响起三短一长，来客等待林舟回应。",
  }],
  endingEvent: "门外来客敲出父亲暗号。",
  suspense: "来客为何知道父亲暗号？",
  nextChapterLead: "林舟必须确认门外来客身份。",
});

const GOOD_CHAPTER_CONTEXT = {
  targetCard: {
    order: 2,
    title: "门外来客",
    chapterGoal: "确认门外来客身份",
    coreConflict: "开门会暴露藏身处",
    majorTurn: "来客说出父亲暗号",
    endingHook: "暗号指向警局内鬼",
    nextChapterBridge: "追查内鬼",
  },
  mainCharacters: ["林舟（主角）：调查者", "许澄（搭档）：来客"],
  previousScriptSourceText: PREVIOUS_CHAPTER,
};

describe("P1 灵感质量门", () => {
  it("接受三个冲突发动机、视觉承诺和第一章方向均不同的候选", () => {
    expect(() => assertP1InspirationQuality(normalizedSeeds())).not.toThrow();
  });

  it("拒绝只换标题但复用相同核心内容的伪差异候选", () => {
    const duplicate = structuredClone(GOOD_SEEDS) as unknown as { seeds: Array<Record<string, unknown>> };
    for (const seed of duplicate.seeds.slice(1)) {
      seed.logline = duplicate.seeds[0]!.logline;
      seed.keyConflict = duplicate.seeds[0]!.keyConflict;
      seed.visualHook = duplicate.seeds[0]!.visualHook;
      seed.firstChapterDirection = duplicate.seeds[0]!.firstChapterDirection;
    }
    expect(() => assertP1InspirationQuality(normalizedSeeds(duplicate))).toThrow(ScriptCreativeQualityError);
    expect(() => assertP1InspirationQuality(normalizedSeeds(duplicate))).toThrow(/P1_CONFLICT_ENGINE_NOT_DISTINCT/);
  });
});

describe("P2 大纲质量门", () => {
  it("接受含转折、结果、明确结局和终章收束的轻量大纲", () => {
    expect(() => assertP2OutlineQuality(parseScriptOutlineMarkdownV1(GOOD_OUTLINE))).not.toThrow();
  });

  it("拒绝格式合法但没有因果推进、结局空泛且章节卡重复的大纲", () => {
    const weak = GOOD_OUTLINE
      .replace("林夏想寻找失踪姐姐，但是异常末班车会抹去乘客记录，因此她必须在车辆进入隧道前查清真相。", "林夏寻找失踪姐姐，登上末班车，来到封闭总站。")
      .replace("开端：林夏登上无人末班车，但是车辆拒绝停车，因此她被迫追查姐姐留下的钥匙。", "开端：林夏登上无人末班车。")
      .replace("发展：钥匙打开封闭总站，然而公开证据会危及姐姐，所以林夏必须在救人和留证之间选择。", "发展：林夏来到封闭总站。")
      .replace("林夏冒险直播运营方的罪证并救出姐姐，承认自己的愧疚但不再被它控制。", "开放式结局")
      .replace("救出姐姐并公开事故证据", "找到姐姐留下的第一条线索")
      .replace("救人会让运营方有时间销毁证据", "登车追踪线索就可能无法返回")
      .replace("姐姐主动要求林夏先开启直播", "广播准确叫出林夏的名字")
      .replace("负责人在直播中承认掩盖事故", "姐姐的钥匙指向封闭总站")
      .replace("姐妹获救、证据公开，故事收束（终章）", "钥匙迫使林夏继续前往封闭总站");
    expect(() => assertP2OutlineQuality(parseScriptOutlineMarkdownV1(weak))).toThrow(/P2_TURN_CONNECTOR_MISSING/);
    expect(() => assertP2OutlineQuality(parseScriptOutlineMarkdownV1(weak))).toThrow(/P2_ENDING_DIRECTION_VAGUE/);
    expect(() => assertP2OutlineQuality(parseScriptOutlineMarkdownV1(weak))).toThrow(/P2_FINAL_BRIDGE_NOT_TERMINAL/);
  });
});

describe("P3/P5 章节草稿质量门", () => {
  it("接受场景有动作和退出变化、章节卡可观察且承接前章结尾的草稿", () => {
    expect(() => assertP3P5ChapterDraftQuality(GOOD_CHAPTER, GOOD_CHAPTER_CONTEXT)).not.toThrow();
  });

  it("拒绝剧情或动作缺失以及空泛场景结束点", () => {
    const weak = structuredClone(GOOD_CHAPTER);
    weak.scenes[0]!.description = "无";
    weak.scenes[0]!.actions = "无动作";
    weak.scenes[0]!.endingPoint = "场景结束";
    expect(() => assertP3P5ChapterDraftQuality(weak, GOOD_CHAPTER_CONTEXT)).toThrow(/P3_SCENE_DESCRIPTION_MISSING/);
    expect(() => assertP3P5ChapterDraftQuality(weak, GOOD_CHAPTER_CONTEXT)).toThrow(/P3_SCENE_ACTIONS_MISSING/);
    expect(() => assertP3P5ChapterDraftQuality(weak, GOOD_CHAPTER_CONTEXT)).toThrow(/P3_SCENE_ENDING_GENERIC/);
  });

  it("拒绝多个场景复制相同的有效剧情、动作、对白和结束点", () => {
    const weak = structuredClone(GOOD_CHAPTER);
    weak.scenes[1] = { ...weak.scenes[1]!, description: weak.scenes[0]!.description, actions: weak.scenes[0]!.actions, dialogue: weak.scenes[0]!.dialogue, endingPoint: weak.scenes[0]!.endingPoint };
    expect(() => assertP3P5ChapterDraftQuality(weak, GOOD_CHAPTER_CONTEXT)).toThrow(/P3_SCENE_DESCRIPTION_REPEATED/);
    expect(() => assertP3P5ChapterDraftQuality(weak, GOOD_CHAPTER_CONTEXT)).toThrow(/P3_SCENE_ENDING_REPEATED/);
  });

  it("不把多个场景中的极短自然回应误判成场景复制", () => {
    const shortReplies = structuredClone(GOOD_CHAPTER);
    shortReplies.scenes[0]!.dialogue = "好。";
    shortReplies.scenes[1]!.dialogue = "好。";
    expect(() => assertP3P5ChapterDraftQuality(shortReplies, GOOD_CHAPTER_CONTEXT)).not.toThrow();
  });

  it("拒绝章节卡四项承诺在正文中完全不可观察的跑题草稿", () => {
    const unrelated = {
      ...GOOD_CHAPTER_CONTEXT,
      previousScriptSourceText: null,
      targetCard: {
        ...GOOD_CHAPTER_CONTEXT.targetCard,
        chapterGoal: "摧毁海底反应堆",
        coreConflict: "氧气耗尽迫使潜水员抛弃同伴",
        majorTurn: "白鲸揭露卫星密码",
        endingHook: "深海城升上海面",
      },
    };
    expect(() => assertP3P5ChapterDraftQuality(GOOD_CHAPTER, unrelated)).toThrow(/P3_CHAPTER_GOAL_NOT_OBSERVABLE/);
    expect(() => assertP3P5ChapterDraftQuality(GOOD_CHAPTER, unrelated)).toThrow(/P3_MAJOR_TURN_NOT_OBSERVABLE/);
  });

  it("拒绝第 2 章与上一章结尾没有任何稳定锚点的明显重置稿，但第 1 章跳过该检查", () => {
    const reset = { ...GOOD_CHAPTER_CONTEXT, previousScriptSourceText: "上一章结尾：雪山卫星坠入冰湖，白鲸密码被永远冻结。" };
    expect(() => assertP3P5ChapterDraftQuality(GOOD_CHAPTER, reset)).toThrow(/P5_PREVIOUS_ENDING_NOT_CARRIED/);
    expect(() => assertP3P5ChapterDraftQuality(GOOD_CHAPTER, { ...GOOD_CHAPTER_CONTEXT, previousScriptSourceText: null })).not.toThrow();
  });
});
