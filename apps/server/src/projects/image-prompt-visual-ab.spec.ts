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
  VISUAL_AB_EVALUATION_POLICY,
} from "./image-prompt-visual-ab.util.js";

function report(promptVersion: "v1" | "v2" = "v1") {
  const fixture = fileURLToPath(new URL("../../../../tests/fixtures/image-prompt/s4-baseline-v1.json", import.meta.url));
  return compileImagePromptBaseline(
    parseImagePromptBaselineSuite(JSON.parse(readFileSync(fixture, "utf8")) as unknown),
    { promptVersion },
  );
}

describe("image prompt visual A/B safety plan", () => {
  it("freezes exactly 40 unique slots in provider/case/variant order", () => {
    const slots = buildVisualAbSlots(report());
    expect(slots).toHaveLength(40);
    expect(new Set(slots.map((slot) => slot.slotId)).size).toBe(40);
    expect(slots[0]?.slotId).toBe("v1:openai:candidate-no-character-establishing:v1");
    expect(slots[9]?.slotId).toBe("v1:openai:candidate-scene-effect:v2");
    expect(slots[10]?.slotId).toBe("v1:doubao:candidate-no-character-establishing:v1");
    expect(slots[29]?.slotId).toBe("v1:grok:candidate-scene-effect:v2");
    expect(slots[30]?.slotId).toBe("v1:runware:candidate-no-character-establishing:v1");
    expect(slots[39]?.slotId).toBe("v1:runware:candidate-scene-effect:v2");
  });

  it("creates a stable pending ledger without credentials", () => {
    const ledger = createVisualAbLedger(report(), "2026-07-17T00:00:00.000Z");
    expect(ledger).toMatchObject({ schemaVersion: 2, promptVersion: "v1" });
    expect(ledger.maxProviderRequests).toBe(40);
    expect(ledger.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(summarizeVisualAbLedger(ledger)).toEqual({
      pending: 40,
      started: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      manual_review_required: 0,
    });
    expect(JSON.stringify(ledger)).not.toContain("apiKey");
    expect(JSON.stringify(ledger)).not.toContain("secretRef");
  });

  it("keeps V1 and V2 in separate ledgers, slot ids, and plan digests", () => {
    const v1 = createVisualAbLedger(report("v1"), "2026-07-17T00:00:00.000Z");
    const v2 = createVisualAbLedger(report("v2"), "2026-07-17T00:00:00.000Z");
    expect(v1.promptVersion).toBe("v1");
    expect(v2.promptVersion).toBe("v2");
    expect(v1.slots[0]?.slotId).toMatch(/^v1:/);
    expect(v2.slots[0]?.slotId).toMatch(/^v2:/);
    expect(v1.planDigest).not.toBe(v2.planDigest);
  });

  it("matches production provider size conventions", () => {
    expect(providerSize({ width: 1536, height: 1024 }, "openai")).toBe("1536x1024");
    expect(providerSize({ width: 1024, height: 1536 }, "grok")).toBe("1024x1536");
    expect(providerSize({ width: 1536, height: 1024 }, "doubao")).toBe("1536x1024");
    expect(providerSize({ width: 1024, height: 1536 }, "doubao")).toBe("1024x1536");
    expect(providerSize({ width: 1536, height: 1024 }, "runware")).toBe("1536x1024");
  });

  it("classifies output types and provider boundary failures", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(shouldStopProviderAfterFailure("IMAGE_PROVIDER_EDIT_FAILED:400")).toBe(true);
    expect(shouldStopProviderAfterFailure("fetch failed")).toBe(true);
    expect(shouldStopProviderAfterFailure("local write failed")).toBe(false);
  });

  it("freezes Grok reference-plan limitations separately from prompt quality", () => {
    expect(VISUAL_AB_EVALUATION_POLICY.providerExceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        caseId: "candidate-no-character-establishing",
        requiredWarning: "grok_single_reference_output_aspect_ratio_follows_input",
        excludeFromCrossProviderChecks: ["requested_aspect_ratio"],
        stillEvaluateChecks: ["environment", "clean_plate", "empty_scene"],
      }),
      expect.objectContaining({
        caseId: "candidate-group-staging",
        requiredWarning: "candidate_references_packed:grok:cast_identity_board:4",
        excludeFromCrossProviderChecks: [],
        stillEvaluateChecks: ["identity", "environment", "clean_plate", "staging"],
      }),
    ]));
  });
});
