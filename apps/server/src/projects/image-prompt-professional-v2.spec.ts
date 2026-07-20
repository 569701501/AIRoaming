import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compileImagePromptBaseline,
  parseImagePromptBaselineSuite,
} from "./image-prompt-baseline.util.js";
import { readCandidateShotContract } from "./candidate-generation-spec.js";

const fixturePath = fileURLToPath(new URL("../../../../tests/fixtures/image-prompt/s4-baseline-v1.json", import.meta.url));

async function compileV2() {
  const suite = parseImagePromptBaselineSuite(JSON.parse(await readFile(fixturePath, "utf8")) as unknown);
  return compileImagePromptBaseline(suite, { promptVersion: "v2" });
}

describe("专业图片 Prompt V2 离线编译", () => {
  it("同一组五类镜头为四家 Provider 生成 20 份不再直通的 V2 Profile", async () => {
    const report = await compileV2();
    expect(report.summary).toMatchObject({
      referenceCaseCount: 3,
      candidateCaseCount: 5,
      providerProfileCount: 20,
      failedCaseIds: [],
      passed: true,
    });
    expect(report.productionBaseline).toMatchObject({
      promptVersion: "v2",
      candidateProviderPromptSource: "provider_profile_v2",
    });

    for (const candidate of report.candidateCases) {
      expect(new Set(candidate.providerProfiles.map((profile) => profile.prompt)).size).toBe(4);
      expect(candidate.providerProfiles.every((profile) => profile.profileId.endsWith("v2"))).toBe(true);
      expect(candidate.providerProfiles.every((profile) => profile.prompt !== candidate.generationSpec.positivePrompt)).toBe(true);
      expect(candidate.providerProfiles.every((profile) => profile.prompt.length >= 500 && profile.prompt.length <= 5_000)).toBe(true);
    }
  });

  it("按无人、单人、双人、多人和特效场景注入不同镜头合同", async () => {
    const report = await compileV2();
    const byCategory = new Map(report.candidateCases.map((candidate) => [candidate.category, candidate]));

    expect(readCandidateShotContract(byCategory.get("no_character_establishing")!.generationSpec.systemConstraints))
      .toMatchObject({ staging: "environment", subjectCount: 0 });
    expect(readCandidateShotContract(byCategory.get("single_character_closeup")!.generationSpec.systemConstraints))
      .toMatchObject({ staging: "single", subjectCount: 1, subjectNames: ["林舟"] });
    expect(readCandidateShotContract(byCategory.get("two_character_dialogue")!.generationSpec.systemConstraints))
      .toMatchObject({ staging: "pair", subjectCount: 2, subjectNames: ["林舟", "许澄"] });
    expect(readCandidateShotContract(byCategory.get("group_staging")!.generationSpec.systemConstraints))
      .toMatchObject({ staging: "group", subjectCount: 4 });
    expect(readCandidateShotContract(byCategory.get("scene_effect")!.generationSpec.systemConstraints))
      .toMatchObject({ effectCausality: "conditional" });

    for (const candidate of report.candidateCases) {
      const openai = candidate.providerProfiles.find((profile) => profile.providerType === "openai")!;
      const doubao = candidate.providerProfiles.find((profile) => profile.providerType === "doubao")!;
      const grok = candidate.providerProfiles.find((profile) => profile.providerType === "grok")!;
      expect(openai.prompt).not.toMatch(/人物数量：|动作主客体：|特效因果：/);
      expect(grok.prompt).not.toMatch(/人物数量：|动作主客体：|特效因果：/);
      expect(doubao.prompt).toContain("只呈现动作最清晰的一个决定性瞬间");
    }
  });

  it("V2 参考资产模板保持角色身份锁、四视图和无人场景合同", async () => {
    const report = await compileV2();
    expect(report.referenceCases.every((item) => item.passed)).toBe(true);
    expect(report.referenceCases.find((item) => item.kind === "character_preview")?.prompt).toContain("Prioritize repeatable identity cues");
    expect(report.referenceCases.find((item) => item.kind === "character_final")?.prompt).toContain("Ignore the preview image background");
    expect(report.referenceCases.find((item) => item.kind === "scene_reference")?.prompt).toContain("exactly zero people");
  });
});
