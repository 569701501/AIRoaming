import { describe, expect, it } from "vitest";
import type { CandidatePromptSection } from "@airoaming/shared";
import {
  compileImageReferenceGuidanceForProvider,
  compileImagePromptForProvider,
  compileImagePromptForProviderV1,
} from "./image-prompt-profile.util.js";
import { CANDIDATE_SHOT_CONTRACT_PREFIX } from "./candidate-generation-spec.js";

const sections: CandidatePromptSection[] = [
  { key: "visual", label: "主体与静态瞬间", value: "林舟与许澄停在雨棚下，共同看向仓库门。" },
  { key: "action", label: "动作与情绪", value: "许澄按住林舟肩膀；克制紧张" },
  { key: "composition", label: "构图与视觉重心", value: "双人位于左侧，右侧保留视线通道。" },
  { key: "camera", label: "景别与机位", value: "medium; eye_level" },
  { key: "characters", label: "角色身份与外观", value: "林舟: 黑色短发; 许澄: 栗色低马尾" },
  { key: "scene", label: "环境、光线与氛围", value: "雨夜旧港; 冷雨; 低照度" },
  { key: "style", label: "漫画画风", value: "comic_style; drawn comic/manhua illustration" },
];

const systemConstraints = [
  "Create exactly one clean comic illustration for one storyboard shot.",
  `${CANDIDATE_SHOT_CONTRACT_PREFIX}${JSON.stringify({
    schemaVersion: 2,
    staging: "pair",
    subjectCount: 2,
    subjectNames: ["林舟", "许澄"],
    action: "许澄按住林舟肩膀",
    composition: "双人位于左侧，右侧保留视线通道。",
    decisiveMoment: true,
    effectCausality: "conditional",
  })}`,
];

describe("image provider prompt profiles", () => {
  it("冻结 V1 为原正向 Prompt 直通，供真实 A/B 使用", () => {
    const result = compileImagePromptForProviderV1({
      providerType: "openai",
      positivePrompt: "Create one clean comic illustration. Do not render text or bubbles.",
      negativePrompt: "text, speech bubbles, watermark",
    });
    expect(result.profileId).toBe("openai-image-instruction-v1");
    expect(result.prompt).toBe("Create one clean comic illustration. Do not render text or bubbles.");
  });

  it("V2 为三家 Provider 编译不同的专业制作简报", () => {
    const profiles = (["openai", "doubao", "grok"] as const).map((providerType) => compileImagePromptForProvider({
      providerType,
      positivePrompt: "legacy source prompt",
      negativePrompt: "text, speech bubbles, watermark",
      sections,
      systemConstraints,
    }));

    expect(new Set(profiles.map((profile) => profile.prompt)).size).toBe(3);
    expect(profiles[0]).toMatchObject({ profileId: "openai-comic-clean-plate-v2", negativePromptDelivery: "embedded_constraints" });
    expect(profiles[0]?.prompt).toContain("INTENDED USE");
    expect(profiles[0]?.prompt).toContain("ACTION AND EMOTION");
    expect(profiles[1]).toMatchObject({ profileId: "doubao-seedream-comic-clean-plate-v2", negativePromptDelivery: "embedded_constraints" });
    expect(profiles[1]?.prompt).toContain("用途：");
    expect(profiles[1]?.prompt).toContain("动作与情绪：");
    expect(profiles[2]).toMatchObject({ profileId: "grok-comic-clean-plate-v2", negativePromptDelivery: "embedded_constraints" });
    expect(profiles[2]?.prompt).toContain("one borderless full-frame comic illustration");
    expect(profiles[2]?.prompt).toContain("No extra people beyond the named subjects");
    expect(profiles[0]?.prompt).toContain("Show exactly two distinct subjects");
    expect(profiles[0]?.prompt).not.toContain("人物数量：");
    expect(profiles[1]?.prompt).toContain("画面准确出现两个不同角色");
    expect(profiles[2]?.prompt).toContain("COUNT: Show exactly two distinct subjects");
    expect(profiles[2]?.prompt).not.toContain("人物数量：");
    expect(profiles.every((profile) => !profile.prompt.includes("Avoid:"))).toBe(true);
  });

  it("无分段的旧规格仍可兼容编译，但不会伪造独立 negative prompt", () => {
    const result = compileImagePromptForProvider({
      providerType: "doubao",
      positivePrompt: "Create one clean comic illustration.",
      negativePrompt: "text, speech bubbles, watermark",
    });
    expect(result.prompt).toContain("用途：");
    expect(result.prompt).toContain("Create one clean comic illustration.");
    expect(result.prompt).not.toContain("Avoid:");
    expect(result.negativePromptDelivery).toBe("embedded_constraints");
  });

  it("群体角色使用数量提示，不把整群人当成一个人", () => {
    const collectiveContract = [
      systemConstraints[0]!,
      `${CANDIDATE_SHOT_CONTRACT_PREFIX}${JSON.stringify({
        schemaVersion: 2,
        staging: "collective",
        subjectCount: 2,
        subjectNames: ["阿肃", "商队众人"],
        collectiveSubjectNames: ["商队众人"],
        groupCountHint: "十余名",
        action: "阿肃挡在商队众人前方",
        composition: "阿肃在前景，商队众人在后景",
        decisiveMoment: true,
        effectCausality: "conditional",
      })}`,
    ];
    const openai = compileImagePromptForProvider({
      providerType: "openai",
      positivePrompt: "legacy source prompt",
      negativePrompt: "text",
      sections,
      systemConstraints: collectiveContract,
    });
    const doubao = compileImagePromptForProvider({
      providerType: "doubao",
      positivePrompt: "legacy source prompt",
      negativePrompt: "text",
      sections,
      systemConstraints: collectiveContract,
    });
    expect(openai.prompt).toContain("collective population is 十余名");
    expect(openai.prompt).toContain("never collapse a crowd or team into one person");
    expect(doubao.prompt).toContain("群体规模为十余名");
  });

  it("从 Skill Profile 编译 provider 参考图职责", () => {
    const openai = compileImageReferenceGuidanceForProvider({
      providerType: "openai",
      prompt: "one clean illustration",
      references: [
        { kind: "character_identity", label: "酷拉皮卡" },
        { kind: "scene_environment", label: "海边病房" },
      ],
    });
    const doubao = compileImageReferenceGuidanceForProvider({
      providerType: "doubao",
      prompt: "一张干净漫画画面",
      references: [{ kind: "character_identity", label: "酷拉皮卡" }],
    });

    expect(openai).toContain("Image 1 (酷拉皮卡) supplies character identity only");
    expect(openai).toContain("Image 2 (海边病房) supplies scene identity only");
    expect(doubao).toContain("图 1（酷拉皮卡）：只提供这个角色的身份");
  });

  it("拒绝空规格", () => {
    expect(() => compileImagePromptForProvider({ providerType: "openai", positivePrompt: "", negativePrompt: "text" })).toThrow();
    expect(() => compileImagePromptForProvider({ providerType: "openai", positivePrompt: "image", negativePrompt: "" })).toThrow();
  });
});
