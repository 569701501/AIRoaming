import { describe, expect, it } from "vitest";
import type { StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import {
  buildStoryboardSemanticEvaluationPrompt,
  parseStoryboardSemanticEvaluation,
  StoryboardSemanticEvaluationContractError,
} from "./storyboard-semantic-evaluation.util.js";

function structure(): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "无编号列车",
    sourceScriptVersionId: "script-1",
    synopsis: "停电站台出现旧列车。",
    direction: {
      logline: "检修员发现异常旧列车",
      chapterGoal: "进入旧列车",
      coreConflict: "规程失效",
      emotionalArc: "不安升级",
      endingHook: "姐姐声音出现",
    },
    characters: [],
    scenes: [
      { id: "scene-1", name: "停电站台", location: "站台", timeOfDay: "深夜", atmosphere: "死寂", purpose: "建立异常" },
      { id: "scene-2", name: "废弃轨道", location: "轨道", timeOfDay: "连续", atmosphere: "未知", purpose: "揭示旧列车" },
    ],
    beats: [
      {
        id: "beat-1",
        order: 1,
        title: "站台失联",
        summary: "程野确认主电源和通信全部失效。",
        conflict: "无法联系外界",
        characters: [],
        sceneId: "scene-1",
        visualFocus: "熄灭的通信柜",
        outcome: "旧机器刹车声把程野引向站台尽头。",
      },
      {
        id: "beat-2",
        order: 2,
        title: "旧列车出现",
        summary: "程野在废弃轨道发现无编号旧列车。",
        conflict: "轨道本应封死",
        characters: [],
        sceneId: "scene-2",
        visualFocus: "无编号车头",
        outcome: "程野登上旧列车。",
      },
    ],
    notes: "",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function storyboard(): StoryboardJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "无编号列车",
    sourceStoryVersionId: "story-1",
    shots: [
      {
        id: "shot-1",
        order: 1,
        beatId: "beat-1",
        sceneId: "scene-1",
        characterIds: [],
        coreAction: "程野确认站台失联并看向废弃轨道",
        emotion: "不安",
        shotType: "wide",
        cameraAngle: "eye_level",
        comic: {
          panelDescription: "程野站在熄灭的通信柜前看向轨道",
          composition: "站台纵深",
          dialogue: "请求站务中心确认。",
          caption: "",
          panelRhythm: "slow",
        },
        motion: {
          visualDescription: "程野检查通信柜后抬头看向废弃轨道方向。",
          compositionDesign: "结束时身体朝向轨道",
          cameraMovement: "slow_zoom",
          frameType: "atmosphere",
          durationMs: 8500,
          durationHint: "约 8.5s",
          voiceLines: [{ characterId: null, name: "程野", line: "请求站务中心确认。", voiceStyle: "克制" }],
        },
        promptDraft: "停电站台",
        lockedCandidateId: null,
        status: "draft",
      },
      {
        id: "shot-2",
        order: 2,
        beatId: "beat-2",
        sceneId: "scene-2",
        characterIds: [],
        coreAction: "程野发现无编号旧列车并登车",
        emotion: "警惕",
        shotType: "wide",
        cameraAngle: "eye_level",
        comic: {
          panelDescription: "无编号旧列车停在废弃轨道",
          composition: "车头占据纵深",
          dialogue: "",
          caption: "",
          panelRhythm: "impact",
        },
        motion: {
          visualDescription: "程野走到无编号旧列车前，确认车门开启后登车。",
          compositionDesign: "程野从站台进入车门",
          cameraMovement: "track_right",
          frameType: "action",
          durationMs: 7000,
          durationHint: "约 7s",
          voiceLines: [],
        },
        promptDraft: "旧列车",
        lockedCandidateId: null,
        status: "draft",
      },
    ],
    notes: "",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function modelOutput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    beats: [
      {
        beatId: "beat-1",
        summaryStatus: "covered",
        outcomeStatus: "partial",
        evidenceShotOrders: [1],
        missingFacts: ["没有明确听见旧机器刹车声"],
        contradictions: [],
        reason: "失联和朝向轨道已表达，但触发转向的声音未出现。",
      },
      {
        beatId: "beat-2",
        summaryStatus: "covered",
        outcomeStatus: "covered",
        evidenceShotOrders: [2],
        missingFacts: [],
        contradictions: [],
        reason: "旧列车揭示和登车结果均直接可见。",
      },
    ],
    ...overrides,
  });
}

describe("Storyboard Beat 语义评测", () => {
  it("Prompt 只提供 summary/outcome 和可观察镜头事实，并冻结四态含义", () => {
    const prompt = buildStoryboardSemanticEvaluationPrompt(structure(), storyboard());

    expect(prompt).toContain("covered / partial / missing / contradicted");
    expect(prompt).toContain("分别判断 summary 与 outcome");
    expect(prompt).toContain("旧机器刹车声把程野引向站台尽头");
    expect(prompt).toContain("程野检查通信柜后抬头看向废弃轨道方向");
    expect(prompt).not.toContain("promptDraft");
    expect(prompt).not.toContain("compositionDesign");
    expect(prompt).not.toContain("重写分镜");
  });

  it("严格解析逐 Beat 结果，并由本地把 partial 派生为 warning", () => {
    const report = parseStoryboardSemanticEvaluation(modelOutput(), structure(), storyboard());

    expect(report).toMatchObject({
      schemaVersion: 1,
      overallStatus: "warning",
      summary: {
        beatCount: 2,
        coveredDimensions: 3,
        partialDimensions: 1,
        missingDimensions: 0,
        contradictedDimensions: 0,
      },
    });
    expect(report.beats[0]).toMatchObject({ beatId: "beat-1", evidenceShotOrders: [1], outcomeStatus: "partial" });
  });

  it("全部 covered 时为 pass，任一 contradicted 时为 fail", () => {
    const covered = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    covered.beats[0]!.outcomeStatus = "covered";
    covered.beats[0]!.missingFacts = [];
    const pass = parseStoryboardSemanticEvaluation(JSON.stringify(covered), structure(), storyboard());
    expect(pass.overallStatus).toBe("pass");

    const contradicted = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    contradicted.beats[1]!.outcomeStatus = "contradicted";
    contradicted.beats[1]!.contradictions = ["镜头表现程野转身离开列车"];
    const fail = parseStoryboardSemanticEvaluation(JSON.stringify(contradicted), structure(), storyboard());
    expect(fail.overallStatus).toBe("fail");
  });

  it("允许用 missing 明确标记完全不可观察的事实，并派生为 warning", () => {
    const missing = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    missing.beats[0]!.summaryStatus = "missing";
    missing.beats[0]!.outcomeStatus = "missing";
    missing.beats[0]!.evidenceShotOrders = [];
    missing.beats[0]!.missingFacts = ["没有主电源与通信失效，也没有刹车声引导"];

    const report = parseStoryboardSemanticEvaluation(JSON.stringify(missing), structure(), storyboard());

    expect(report.overallStatus).toBe("warning");
    expect(report.summary).toMatchObject({ missingDimensions: 2, partialDimensions: 0 });
  });

  it("拒绝模型自报总状态或添加额外字段", () => {
    expect(() => parseStoryboardSemanticEvaluation(modelOutput({ overallStatus: "pass" }), structure(), storyboard()))
      .toThrow(StoryboardSemanticEvaluationContractError);
  });

  it("拒绝漏 Beat、乱序或重复 Beat", () => {
    const missing = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    missing.beats.pop();
    expect(() => parseStoryboardSemanticEvaluation(JSON.stringify(missing), structure(), storyboard()))
      .toThrowError(/BEAT_COUNT/);

    const reversed = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    reversed.beats.reverse();
    expect(() => parseStoryboardSemanticEvaluation(JSON.stringify(reversed), structure(), storyboard()))
      .toThrowError(/BEAT_ORDER/);
  });

  it("拒绝引用其他 Beat 的镜头或不存在的镜头序号", () => {
    const invalid = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    invalid.beats[0]!.evidenceShotOrders = [2, 99];
    expect(() => parseStoryboardSemanticEvaluation(JSON.stringify(invalid), structure(), storyboard()))
      .toThrowError(/EVIDENCE_SHOT/);
  });

  it("拒绝非法状态、空理由和非字符串问题数组", () => {
    const invalid = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    invalid.beats[0]!.summaryStatus = "mostly";
    invalid.beats[0]!.reason = "";
    invalid.beats[0]!.missingFacts = [1];
    expect(() => parseStoryboardSemanticEvaluation(JSON.stringify(invalid), structure(), storyboard()))
      .toThrow(StoryboardSemanticEvaluationContractError);
  });

  it("拒绝与状态不匹配的缺失或矛盾诊断", () => {
    const unexpectedMissing = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    unexpectedMissing.beats[1]!.missingFacts = ["已完整覆盖时不应携带缺失项"];
    expect(() => parseStoryboardSemanticEvaluation(JSON.stringify(unexpectedMissing), structure(), storyboard()))
      .toThrowError(/MISSING_FACT_UNEXPECTED/);

    const unexpectedContradiction = JSON.parse(modelOutput()) as { beats: Array<Record<string, unknown>> };
    unexpectedContradiction.beats[0]!.contradictions = ["未标记 contradicted 时不应携带矛盾项"];
    expect(() => parseStoryboardSemanticEvaluation(JSON.stringify(unexpectedContradiction), structure(), storyboard()))
      .toThrowError(/CONTRADICTION_UNEXPECTED/);
  });
});
