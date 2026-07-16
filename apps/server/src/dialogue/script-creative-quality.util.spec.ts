import { describe, expect, it } from "vitest";
import {
  parseCreativeIdeationOutputV1,
  parseScriptOutlineMarkdownV1,
} from "@airoaming/shared";

import {
  assertP1InspirationQuality,
  assertP2OutlineQuality,
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
