import { describe, expect, it } from "vitest";
import {
  readOpenCodeSkill,
  readOpenCodeSkillJsonReference,
  readOpenCodeSkillReference,
  renderOpenCodePromptTemplate,
} from "./opencode-skill-asset.util.js";

describe("OpenCode Skill production assets", () => {
  it("读取并验证项目内正式 Skill", () => {
    const skill = readOpenCodeSkill("storyboard-shot-generate");
    expect(skill.name).toBe("storyboard-shot-generate");
    expect(skill.description).toContain("当前章分镜");
    expect(skill.body).toContain("生产模板");
  });

  it("读取 Skill reference 与 JSON 配置", () => {
    expect(readOpenCodeSkillReference("image-reference-generate", "scene-v2.md")).toContain("exactly zero people");
    const config = readOpenCodeSkillJsonReference<{ systemConstraints: string[] }>(
      "image-candidate-generate",
      "candidate-config.json",
    );
    expect(config.systemConstraints).toContain("Create exactly one clean comic illustration for one storyboard shot.");
    expect(readOpenCodeSkillReference("shot-prompt-optimize", "optimize-prompt.md"))
      .toContain("结果只供用户选择采用");
    expect(readOpenCodeSkillReference("storyboard-shot-generate", "visual-brief-prompt.md"))
      .toContain("第二阶段");
    const visualBriefExample = readOpenCodeSkillJsonReference<{
      shots: Array<{ visualDescription: string }>;
    }>(
      "storyboard-shot-generate",
      "visual-brief-example.json",
    );
    expect(visualBriefExample.shots).toHaveLength(1);
    expect(visualBriefExample.shots[0]?.visualDescription).toContain("两人");
  });

  it("严格渲染模板并拒绝缺失变量", () => {
    expect(renderOpenCodePromptTemplate("A={{VALUE}} / B={{VALUE}}", { VALUE: "事实" })).toBe("A=事实 / B=事实");
    expect(() => renderOpenCodePromptTemplate("{{MISSING}}", {})).toThrow("OPENCODE_PROMPT_TEMPLATE_VARIABLE_MISSING:MISSING");
  });

  it("拒绝越界 reference 路径", () => {
    expect(() => readOpenCodeSkillReference("storyboard-shot-generate", "../SKILL.md")).toThrow(
      "OPENCODE_SKILL_REFERENCE_INVALID",
    );
  });
});
