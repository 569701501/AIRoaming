import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  compileImagePromptBaseline,
  parseImagePromptBaselineSuite,
} from "./image-prompt-baseline.util.js";
import {
  buildVisualAbSlots,
  createVisualAbLedger,
  extensionForMime,
  providerSize,
  shouldStopProviderAfterFailure,
  summarizeVisualAbLedger,
} from "./image-prompt-visual-ab.util.js";

function report() {
  const fixture = fileURLToPath(new URL("../../../../tests/fixtures/image-prompt/s4-baseline-v1.json", import.meta.url));
  return compileImagePromptBaseline(parseImagePromptBaselineSuite(JSON.parse(readFileSync(fixture, "utf8")) as unknown));
}

describe("image prompt visual A/B safety plan", () => {
  it("freezes exactly 30 unique slots in provider/case/variant order", () => {
    const slots = buildVisualAbSlots(report());
    expect(slots).toHaveLength(30);
    expect(new Set(slots.map((slot) => slot.slotId)).size).toBe(30);
    expect(slots[0]?.slotId).toBe("openai:candidate-no-character-establishing:v1");
    expect(slots[9]?.slotId).toBe("openai:candidate-scene-effect:v2");
    expect(slots[10]?.slotId).toBe("doubao:candidate-no-character-establishing:v1");
    expect(slots[29]?.slotId).toBe("grok:candidate-scene-effect:v2");
  });

  it("creates a stable pending ledger without credentials", () => {
    const ledger = createVisualAbLedger(report(), "2026-07-17T00:00:00.000Z");
    expect(ledger.maxProviderRequests).toBe(30);
    expect(ledger.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(summarizeVisualAbLedger(ledger)).toEqual({
      pending: 30,
      started: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      manual_review_required: 0,
    });
    expect(JSON.stringify(ledger)).not.toContain("apiKey");
    expect(JSON.stringify(ledger)).not.toContain("secretRef");
  });

  it("matches production provider size conventions", () => {
    expect(providerSize({ width: 1536, height: 1024 }, "openai")).toBe("1536x1024");
    expect(providerSize({ width: 1024, height: 1536 }, "grok")).toBe("1024x1536");
    expect(providerSize({ width: 1536, height: 1024 }, "doubao")).toBe("2560x1440");
    expect(providerSize({ width: 1024, height: 1536 }, "doubao")).toBe("1440x2560");
  });

  it("classifies output types and provider boundary failures", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(shouldStopProviderAfterFailure("IMAGE_PROVIDER_EDIT_FAILED:400")).toBe(true);
    expect(shouldStopProviderAfterFailure("fetch failed")).toBe(true);
    expect(shouldStopProviderAfterFailure("local write failed")).toBe(false);
  });
});
