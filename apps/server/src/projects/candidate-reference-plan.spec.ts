import { describe, expect, it } from "vitest";
import {
  compileCandidateReferencePlan,
  type CandidateImageReferenceInput,
} from "./candidate-reference-plan.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function reference(
  assetId: string,
  kind: CandidateImageReferenceInput["kind"],
  sourceReferenceKind: CandidateImageReferenceInput["sourceReferenceKind"] = kind === "character_identity"
    ? "preview_front"
    : "scene_background",
): CandidateImageReferenceInput {
  return {
    assetId,
    kind,
    label: assetId,
    priority: 100,
    buffer: ONE_PIXEL_PNG,
    mimeType: "image/png",
    fileName: `${assetId}.png`,
    sourceReferenceKind,
  };
}

describe("compileCandidateReferencePlan", () => {
  it("零引用保持纯生成计划且没有伪造覆盖", async () => {
    const result = await compileCandidateReferencePlan({ providerType: "grok", references: [] });

    expect(result.references).toEqual([]);
    expect(result.evidence).toMatchObject({
      strategy: "none",
      inputReferenceAssetIds: [],
      usedReferenceAssetIds: [],
      slots: [],
      omittedRequired: [],
    });
  });

  it("Grok 三角色加场景编成两槽且全部必需来源有物理覆盖", async () => {
    const result = await compileCandidateReferencePlan({
      providerType: "grok",
      references: [
        reference("character_a", "character_identity"),
        reference("character_b", "character_identity"),
        reference("character_c", "character_identity"),
        reference("scene_a", "scene_environment"),
      ],
    });

    expect(result.references).toHaveLength(2);
    expect(result.references.map((item) => item.kind)).toEqual(["cast_identity_board", "scene_environment"]);
    expect(result.evidence).toMatchObject({
      providerType: "grok",
      strategy: "cast_identity_board",
      usedReferenceAssetIds: ["character_a", "character_b", "character_c", "scene_a"],
      omittedRequired: [],
      compositionCoverage: "prompt_only",
      slots: [
        { order: 1, role: "cast_identity_board", covers: ["character_a", "character_b", "character_c"] },
        { order: 2, role: "scene_environment", covers: ["scene_a"] },
      ],
    });
  });

  it("OpenAI 容量足够时保留三角色加场景的四张独立输入", async () => {
    const result = await compileCandidateReferencePlan({
      providerType: "openai",
      references: [
        reference("character_a", "character_identity"),
        reference("character_b", "character_identity"),
        reference("character_c", "character_identity"),
        reference("scene_a", "scene_environment"),
      ],
    });

    expect(result.references).toHaveLength(4);
    expect(result.evidence.strategy).toBe("direct");
    expect(result.evidence.omittedRequired).toEqual([]);
  });

  it("单场景参考保持为单个图片输入", async () => {
    const result = await compileCandidateReferencePlan({
      providerType: "grok",
      references: [reference("scene_a", "scene_environment")],
    });

    expect(result.references).toHaveLength(1);
    expect(result.evidence.usedReferenceAssetIds).toEqual(["scene_a"]);
    expect(result.evidence.slots[0]).toMatchObject({ role: "scene_environment", covers: ["scene_a"] });
  });

  it("四视图不能伪装成单人身份锚点，必须在 Provider 调用前失败", async () => {
    await expect(compileCandidateReferencePlan({
      providerType: "openai",
      references: [reference("character_final", "character_identity", "final_reference")],
    })).rejects.toThrow("CANDIDATE_FINAL_REFERENCE_SINGLE_IDENTITY_ANCHOR_REQUIRED:character_final");
  });

  it("超过身份板技术容量时在 Provider 调用前失败", async () => {
    await expect(compileCandidateReferencePlan({
      providerType: "grok",
      references: [
        ...Array.from({ length: 13 }, (_, index) => reference(`character_${index + 1}`, "character_identity")),
        reference("scene_a", "scene_environment"),
      ],
    })).rejects.toThrow("CANDIDATE_CAST_IDENTITY_BOARD_CAPACITY_EXCEEDED:13:12");
  });

  it("必需引用损坏时失败关闭", async () => {
    await expect(compileCandidateReferencePlan({
      providerType: "grok",
      references: [{
        ...reference("character_bad", "character_identity"),
        buffer: Buffer.from("not-an-image"),
      }],
    })).rejects.toThrow("CANDIDATE_REFERENCE_IMAGE_INVALID:character_bad");
  });
});
