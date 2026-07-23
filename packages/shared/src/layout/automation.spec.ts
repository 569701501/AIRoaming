import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV1OrV2,
  LayoutDocumentCodecV2,
  buildLayoutRenderPlanV1,
  digestLayoutCompositionV1,
  digestLayoutDialogueTextV1,
  projectLayoutDocumentV2ToV1,
  richTextPlainTextV1,
  upgradeLayoutWorkingCopyV1ToV2,
  type LayoutDialogueBindingV1,
  type LayoutDocumentV1,
  type LayoutDocumentV2,
} from "./index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/layout",
);

const fixtureNames = [
  "paged-four-panel-rich-text",
  "paged-rtl-reading-order",
  "vertical-long-20-sections",
  "vertical-rich-text-mixed",
  "balloons-all-kinds",
  "crop-rotate-flip",
  "stale-source-a-to-b",
  "preflight-errors",
] as const;

async function fixture(name: string): Promise<{
  document: LayoutDocumentV1;
  expected: Record<string, any>;
}> {
  return JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8"));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function freshV2(name = "balloons-all-kinds"): Promise<LayoutDocumentV2> {
  const sample = await fixture(name);
  return LayoutDocumentCodecV2.parseAndNormalize({
    ...sample.document,
    schemaVersion: 2,
    kind: "layout_document_v2",
    automation: {
      policyVersion: "layout_automation_v1",
      composition: null,
      dialogueBindings: [],
      protections: [],
    },
  });
}

function binding(document: LayoutDocumentV2, elementId = "balloon_speech"): LayoutDialogueBindingV1 {
  const balloon = document.canvases.flatMap((canvas) => canvas.elements)
    .find((element) => element.id === elementId);
  if (!balloon || balloon.type !== "balloon") throw new Error(`balloon ${elementId} missing`);
  const textDigest = digestLayoutDialogueTextV1(richTextPlainTextV1(balloon.richText));
  return {
    dialogueItemId: `dialogue_${elementId}`,
    sourceShotId: balloon.sourceShotId!,
    sourceTextDigest: textDigest,
    initialTextDigest: textDigest,
    elementId,
    disposition: "placed",
  };
}

describe("Smart layout M1 LayoutDocumentV2 automation contract", () => {
  it("SML-STA-003 upgrades every V1 working copy conservatively and projects it back without visible drift", async () => {
    for (const name of fixtureNames) {
      const sample = await fixture(name);
      const beforeDigest = LayoutDocumentCodecV1.encode(sample.document).digest;
      const upgraded = upgradeLayoutWorkingCopyV1ToV2(sample.document);
      const projected = projectLayoutDocumentV2ToV1(upgraded);
      expect(projected, name).toEqual(sample.document);
      expect(LayoutDocumentCodecV1.encode(projected).digest, name).toBe(beforeDigest);
      expect(upgraded.automation).toMatchObject({
        policyVersion: "layout_automation_v1",
        composition: null,
        dialogueBindings: [],
      });
      const expectedProtectionCount = sample.document.canvases.reduce((count, canvas) => (
        count + 1 + canvas.elements.length + canvas.elements.filter(
          (element) => element.type === "panel_frame" && element.contentImage !== null,
        ).length
      ), 0);
      expect(upgraded.automation.protections, name).toHaveLength(expectedProtectionCount);
      expect(upgraded.automation.protections.every((entry) => entry.reason === "explicit_preserve"), name).toBe(true);
      expect(sample.document.schemaVersion, name).toBe(1);
    }
  });

  it("SML-STA-002 round-trips normalized V2 JSON and rejects unknown or illegal protection fields", async () => {
    const upgraded = upgradeLayoutWorkingCopyV1ToV2((await fixture("crop-rotate-flip")).document);
    const encoded = LayoutDocumentCodecV2.encode(upgraded);
    expect(LayoutDocumentCodecV2.parseAndNormalize(encoded.canonical)).toEqual(upgraded);
    expect(LayoutDocumentCodecV1OrV2.parse(encoded.canonical)).toEqual(upgraded);
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(upgraded)).toThrow(/unknown field|expected 1/);

    expect(() => LayoutDocumentCodecV2.parseAndNormalize({ ...upgraded, viewport: {} })).toThrow(/unknown field/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...upgraded,
      automation: { ...upgraded.automation, taskId: "task_private" },
    })).toThrow(/unknown field/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...upgraded,
      automation: {
        ...upgraded.automation,
        protections: [{ targetKind: "element", targetId: "missing", scopes: ["geometry"], reason: "user_edit" }],
      },
    })).toThrow(/missing/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...upgraded,
      automation: {
        ...upgraded.automation,
        protections: [{ targetKind: "panel_image", targetId: "panel_crop_image", scopes: ["text"], reason: "user_edit" }],
      },
    })).toThrow(/not applicable/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...upgraded,
      automation: {
        ...upgraded.automation,
        protections: [{ targetKind: "element", targetId: "panel_crop", scopes: ["geometry", "geometry"], reason: "user_edit" }],
      },
    })).toThrow(/duplicate scope/);
  });

  it("SML-STA-007 enforces placed, suppressed, unique and sorted dialogue binding invariants", async () => {
    const document = await freshV2();
    const thoughtBalloon = document.canvases[0]!.elements.find((item) => item.id === "balloon_thought");
    if (!thoughtBalloon || thoughtBalloon.type !== "balloon") throw new Error("thought balloon missing");
    thoughtBalloon.sourceShotId = "shot_001";
    const speech = binding(document, "balloon_speech");
    const thought = binding(document, "balloon_thought");
    const normalized = LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, dialogueBindings: [thought, speech] },
    });
    expect(normalized.automation.dialogueBindings.map((item) => item.dialogueItemId)).toEqual([
      speech.dialogueItemId,
      thought.dialogueItemId,
    ]);

    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, dialogueBindings: [speech, { ...thought, dialogueItemId: speech.dialogueItemId }] },
    })).toThrow(/duplicate id/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, dialogueBindings: [speech, { ...thought, elementId: speech.elementId }] },
    })).toThrow(/bound more than once/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, dialogueBindings: [{ ...speech, elementId: "missing" }] },
    })).toThrow(/missing/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, dialogueBindings: [{ ...speech, elementId: null }] },
    })).toThrow(/requires a balloon/);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, dialogueBindings: [{ ...speech, disposition: "user_suppressed" }] },
    })).toThrow(/must be hidden/);

    const hidden = clone(document);
    const balloon = hidden.canvases[0]!.elements.find((item) => item.id === speech.elementId)!;
    balloon.hidden = true;
    hidden.automation.dialogueBindings = [{ ...speech, disposition: "user_suppressed" }];
    expect(LayoutDocumentCodecV2.parseAndNormalize(hidden).automation.dialogueBindings[0]?.disposition)
      .toBe("user_suppressed");
    hidden.canvases[0]!.elements = hidden.canvases[0]!.elements.filter((item) => item.id !== speech.elementId);
    hidden.automation.dialogueBindings = [{ ...speech, disposition: "user_suppressed", elementId: null }];
    expect(LayoutDocumentCodecV2.parseAndNormalize(hidden).automation.dialogueBindings[0]?.elementId).toBeNull();
  });

  it("SML-STA-004 builds composition provenance only from path-free deterministic fields", async () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const input = {
      compositionPolicyVersion: "layout_composition_v1" as const,
      storyboardVersionId: "storyboard_v1",
      storyboardDigest: digest,
      sourceLockSetDigest: digest,
      visualAnalysisSetDigest: null,
      mode: "rule_fallback" as const,
      planDigest: digest,
      initialVisibleDocumentDigest: digest,
      initialDialogueBindingsDigest: digest,
    };
    const first = digestLayoutCompositionV1(input);
    const noisy = digestLayoutCompositionV1({
      ...input,
      taskId: "task_1",
      createdAt: "2099-01-01T00:00:00Z",
      localPath: "/private/tmp/layout.json",
      providerUrl: "https://provider.invalid/raw",
    } as typeof input);
    expect(noisy).toBe(first);
    expect(() => digestLayoutCompositionV1({
      ...input,
      compositionPolicyVersion: "layout_composition_v0",
    } as unknown as typeof input)).toThrow(/layout_composition_v1/);

    const document = await freshV2();
    const composition = {
      compositionDigest: first,
      compositionPolicyVersion: "layout_composition_v1" as const,
      storyboardVersionId: input.storyboardVersionId,
      storyboardDigest: input.storyboardDigest,
      sourceLockSetDigest: input.sourceLockSetDigest,
      visualAnalysisSetDigest: input.visualAnalysisSetDigest,
      mode: input.mode,
    };
    expect(LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, composition },
    }).automation.composition).toEqual(composition);
    expect(() => LayoutDocumentCodecV2.parseAndNormalize({
      ...document,
      automation: { ...document.automation, composition: { ...composition, createdAt: "now" } },
    })).toThrow(/unknown field/);
  });

  it("SML-REG-004 preserves all fixed G5 render-plan goldens through the ephemeral V2 projection", async () => {
    for (const name of fixtureNames) {
      const sample = await fixture(name);
      const projected = projectLayoutDocumentV2ToV1(upgradeLayoutWorkingCopyV1ToV2(sample.document));
      const v1Plan = buildLayoutRenderPlanV1({
        document: sample.document,
        sourceLockSetDigest: sample.expected.sourceLockSetDigest,
        profile: sample.expected.profile,
        assets: sample.expected.assetManifest,
      });
      const projectedPlan = buildLayoutRenderPlanV1({
        document: projected,
        sourceLockSetDigest: sample.expected.sourceLockSetDigest,
        profile: sample.expected.profile,
        assets: sample.expected.assetManifest,
      });
      expect(projectedPlan.renderPlanDigest, name).toBe(v1Plan.renderPlanDigest);
      expect(projectedPlan, name).toEqual(v1Plan);
    }
  });
});
