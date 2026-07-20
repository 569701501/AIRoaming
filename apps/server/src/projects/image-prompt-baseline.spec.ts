import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compileImagePromptBaseline,
  parseImagePromptBaselineSuite,
} from "./image-prompt-baseline.util.js";

const fixturePath = fileURLToPath(new URL("../../../../tests/fixtures/image-prompt/s4-baseline-v1.json", import.meta.url));

async function compileFixture() {
  const suite = parseImagePromptBaselineSuite(JSON.parse(await readFile(fixturePath, "utf8")) as unknown);
  return compileImagePromptBaseline(suite);
}

describe("S4 图片 Prompt 离线固定基线", () => {
  it("角色预览、角色定稿和场景参考直接使用生产 builder 并通过固定契约", async () => {
    const report = await compileFixture();
    expect(report.summary.referenceCaseCount).toBe(3);
    expect(report.referenceCases.map((item) => item.kind)).toEqual([
      "character_preview",
      "character_final",
      "scene_reference",
    ]);
    expect(report.referenceCases.every((item) => item.passed)).toBe(true);
  });

  it("五类候选镜头通过同一生产规格并编译四个 provider profile", async () => {
    const report = await compileFixture();
    expect(report.summary).toMatchObject({
      candidateCaseCount: 5,
      providerProfileCount: 20,
      runtimeImageCountWhenAuthorized: 40,
      failedCaseIds: [],
      passed: true,
    });
    expect(report.candidateCases.map((item) => item.category)).toEqual([
      "no_character_establishing",
      "single_character_closeup",
      "two_character_dialogue",
      "group_staging",
      "scene_effect",
    ]);
    expect(report.candidateCases.every((item) => item.passed)).toBe(true);
  });

  it("同一输入重复编译完全确定，不依赖时间或图片 provider", async () => {
    const first = await compileFixture();
    const second = await compileFixture();
    expect(second).toEqual(first);
  });
});
