import { describe, expect, it } from "vitest";
import { compileImagePromptForProvider } from "./image-prompt-profile.util.js";

describe("image provider prompt profiles", () => {
  it.each(["openai", "doubao", "grok"] as const)("%s 使用自然语言禁令，不伪造独立 negative prompt", (providerType) => {
    const result = compileImagePromptForProvider({
      providerType,
      positivePrompt: "Create one clean comic illustration. Do not render text or bubbles.",
      negativePrompt: "text, speech bubbles, watermark",
    });
    expect(result.providerType).toBe(providerType);
    expect(result.profileId).toContain(providerType);
    expect(result.negativePromptDelivery).toBe("embedded_constraints");
    expect(result.prompt).toBe("Create one clean comic illustration. Do not render text or bubbles.");
    expect(result.prompt).not.toContain("Avoid:");
  });

  it("拒绝空规格", () => {
    expect(() => compileImagePromptForProvider({ providerType: "openai", positivePrompt: "", negativePrompt: "text" })).toThrow();
    expect(() => compileImagePromptForProvider({ providerType: "openai", positivePrompt: "image", negativePrompt: "" })).toThrow();
  });
});
