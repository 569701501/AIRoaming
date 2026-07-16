import type { ImageProviderType } from "@airoaming/shared";

export type NegativePromptDelivery = "embedded_constraints";

export interface CompiledImagePrompt {
  profileId: string;
  providerType: ImageProviderType;
  prompt: string;
  negativePromptDelivery: NegativePromptDelivery;
}

const PROFILE_IDS: Record<ImageProviderType, string> = {
  openai: "openai-image-instruction-v1",
  doubao: "doubao-image-instruction-v1",
  grok: "grok-image-instruction-v1",
};

/**
 * 当前三个 provider 的公共网关都只接收一个 prompt 字符串。
 * positivePrompt 已包含自然语言输出禁令；negativePrompt 保留作领域审计，
 * 不能假装所有 provider 都支持独立 negative_prompt 参数并统一追加 Avoid。
 */
export function compileImagePromptForProvider(input: {
  providerType: ImageProviderType;
  positivePrompt: string;
  negativePrompt: string;
}): CompiledImagePrompt {
  const positivePrompt = input.positivePrompt.trim();
  if (!positivePrompt) throw new TypeError("positivePrompt must be non-empty");
  if (!input.negativePrompt.trim()) throw new TypeError("negativePrompt must be non-empty");
  return {
    profileId: PROFILE_IDS[input.providerType],
    providerType: input.providerType,
    prompt: positivePrompt,
    negativePromptDelivery: "embedded_constraints",
  };
}
