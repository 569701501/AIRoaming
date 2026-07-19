import { describe, expect, it } from "vitest";
import {
  buildShotPromptOptimizationPrompt,
  parseShotPromptOptimizationOutput,
} from "./shot-prompt-optimize.util.js";

const characters = [
  { name: "林舟", entityType: "human" as const },
  { name: "苏弥", entityType: "human" as const },
];

describe("shot-prompt-optimize", () => {
  it("只把冻结的镜头语义送入优化 Skill，不投递 provider Prompt", () => {
    const prompt = buildShotPromptOptimizationPrompt({
      promptSpec: {
        shotId: "shot_1",
        providerPrompt: "不应重复投递的最终模型 Prompt",
        sections: [{ key: "visual", label: "画面", value: "两人撑门" }],
        systemConstraints: ["one scene, one static moment"],
        visualContext: { characters },
      },
      instruction: "把主客体写清楚",
    });

    expect(prompt).toContain("两人撑门");
    expect(prompt).toContain("把主客体写清楚");
    expect(prompt).not.toContain("不应重复投递的最终模型 Prompt");
  });

  it("接受单地点单时刻、多人关系清楚的优化结果", () => {
    const result = parseShotPromptOptimizationOutput(JSON.stringify({
      visualDescription: "林舟和苏弥同时按住即将合拢的旧车门，雨水凝在两人的肩头。",
      action: "林舟在门外用右手撑门，苏弥从门内抓住他的左腕。",
      composition: "林舟位于左前景，苏弥位于右中景，交握的手位于视觉中心。",
      mustShow: ["两人同时入画", "交握的手"],
      warnings: [],
    }), characters);

    expect(result.visualIssues).toEqual([]);
    expect(result.mustShow).toHaveLength(2);
  });

  it("拒绝仍包含连续时刻的结果，以便运行层修复一次", () => {
    expect(() => parseShotPromptOptimizationOutput(JSON.stringify({
      visualDescription: "林舟先撑门，随后苏弥跑到车厢另一端。",
      action: "林舟和苏弥行动。",
      composition: "两人居中。",
      mustShow: [],
      warnings: [],
    }), characters)).toThrow(/VISUAL_MULTIPLE_MOMENTS/);
  });

  it("来源冲突警告不能绕过连续时刻等单帧硬伤", () => {
    expect(() => parseShotPromptOptimizationOutput(JSON.stringify({
      visualDescription: "林舟先撑门，随后苏弥跑到车厢另一端。",
      action: "林舟和苏弥行动。",
      composition: "两人居中。",
      mustShow: [],
      warnings: [{ code: "SOURCE_CONFLICT", message: "正式输入存在冲突。" }],
    }), characters)).toThrow(/VISUAL_MULTIPLE_MOMENTS/);
  });

  it("群体范围缺失时必须把无法消解的事实缺口告诉用户", () => {
    expect(() => parseShotPromptOptimizationOutput(JSON.stringify({
      visualDescription: "巡逻队停在旧城门前。",
      action: "巡逻队面向紧闭的城门。",
      composition: "巡逻队位于中景，城门占据背景。",
      mustShow: ["巡逻队", "紧闭的城门"],
      warnings: [],
    }), [{ name: "巡逻队", entityType: "group" }])).toThrow(/GROUP_COUNT_WARNING_REQUIRED/);
  });

  it("允许把正式事实无法消解的群体范围作为可见警告返回", () => {
    const result = parseShotPromptOptimizationOutput(JSON.stringify({
      visualDescription: "巡逻队停在旧城门前。",
      action: "巡逻队面向紧闭的城门。",
      composition: "巡逻队位于中景，城门占据背景。",
      mustShow: ["巡逻队", "紧闭的城门"],
      warnings: [{ code: "SOURCE_CONFLICT", message: "正式输入没有提供巡逻队人数或范围。" }],
    }), [{ name: "巡逻队", entityType: "group" }]);

    expect(result.visualIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "VISUAL_GROUP_COUNT_MISSING", severity: "blocking" }),
    ]));
  });
});
