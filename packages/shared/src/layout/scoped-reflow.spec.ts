import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  addLayoutProtectionScopesV1,
  applyLayoutCommandBatchV2,
  buildScopedLayoutReflowV1,
  composeRuleBasedLayoutV1,
  composeVisuallyGuidedLayoutV1,
  resolveLayoutCompositionScopeV1,
  richTextPlainTextV1,
  type BalloonElementV1,
  type LayoutVisualCompositionInputV1,
  type PanelFrameElementV1,
} from "./index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/smart-layout",
);

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sourceInput(): Promise<LayoutVisualCompositionInputV1> {
  const value = await json(path.join(fixtureRoot, "fixtures", "fix-p03-paged.json"));
  const visual = await json(path.join(fixtureRoot, "m3-visual-analysis.fixture.json"));
  const variant = visual.variants.find((entry: any) => entry.variantId === value.variant.variantId);
  return {
    projectId: value.inputs.sourceCatalog.projectId,
    chapterId: value.inputs.sourceCatalog.chapterId,
    comicFormat: value.variant.comicFormat,
    profile: value.currentBaseline.layoutDocument.profile,
    fontPolicy: value.currentBaseline.layoutDocument.fontPolicy,
    storyboardVersion: {
      id: value.inputs.storyboardVersion.id,
      documentDigest: value.inputs.storyboardVersion.documentDigest,
      document: value.inputs.storyboardVersion.document,
    },
    sourceLockSetDigest: value.inputs.sourceCatalog.sourceLockSetDigest,
    sources: value.inputs.sourceCatalog.items,
    characterCatalog: value.inputs.characterCatalog.map((character: any) => ({
      characterId: character.id,
      name: character.name,
    })),
    visualEvidence: variant.entries.map((entry: any) => ({
      shotId: entry.shotId,
      assetId: entry.analysis.assetId,
      assetDigest: entry.analysis.assetDigest,
      analysis: entry.analysis,
    })),
  };
}

function firstPanel(
  document: ReturnType<typeof composeVisuallyGuidedLayoutV1>["document"],
  shotId?: string,
): PanelFrameElementV1 {
  const panel = document.canvases.flatMap((canvas) => canvas.elements)
    .find((element): element is PanelFrameElementV1 => (
      element.type === "panel_frame"
      && Boolean(element.contentImage)
      && (!shotId || element.contentImage?.source.shotId === shotId)
    ));
  if (!panel) throw new Error("fixture panel missing");
  return panel;
}

function firstBalloon(
  document: ReturnType<typeof composeVisuallyGuidedLayoutV1>["document"],
  shotId?: string,
): BalloonElementV1 {
  const balloon = document.canvases.flatMap((canvas) => canvas.elements)
    .find((element): element is BalloonElementV1 => (
      element.type === "balloon" && (!shotId || element.sourceShotId === shotId)
    ));
  if (!balloon) throw new Error("fixture balloon missing");
  return balloon;
}

describe("M6 scoped intelligent reflow", () => {
  it("expands an element selection to a complete narrative group and preserves protected fields", async () => {
    const input = await sourceInput();
    const target = composeVisuallyGuidedLayoutV1(input);
    const narrative = composeRuleBasedLayoutV1(input).narrativePlan;
    const base = structuredClone(target.document);
    const targetBalloon = firstBalloon(target.document);
    const balloonShotId = targetBalloon.sourceShotId;
    if (!balloonShotId) throw new Error("fixture balloon shot missing");
    const targetPanel = firstPanel(target.document, balloonShotId);
    const basePanel = firstPanel(base, balloonShotId);
    const baseBalloon = firstBalloon(base, balloonShotId);
    if (!basePanel.contentImage || !targetPanel.contentImage) throw new Error("fixture image missing");

    basePanel.contentImage.crop = {
      ...basePanel.contentImage.crop,
      offsetX: basePanel.contentImage.crop.offsetX + 5,
    };
    baseBalloon.transform = {
      ...baseBalloon.transform,
      x: baseBalloon.transform.x + 12,
    };
    baseBalloon.fillColor = targetBalloon.fillColor === "#00FF00FF"
      ? "#FF00FFFF"
      : "#00FF00FF";
    baseBalloon.tail = {
      ...baseBalloon.tail,
      targetX: baseBalloon.tail.targetX + 8,
    };
    base.automation = addLayoutProtectionScopesV1(
      base.automation,
      "panel_image",
      basePanel.contentImage.id,
      ["crop"],
    );
    base.automation = addLayoutProtectionScopesV1(
      base.automation,
      "element",
      baseBalloon.id,
      ["geometry", "text"],
    );

    const plan = buildScopedLayoutReflowV1({
      baseDocument: base,
      targetDocument: target.document,
      storyboard: input.storyboardVersion.document,
      narrativePlan: narrative,
      scope: { canvasIds: [], elementIds: [baseBalloon.id], shotIds: [] },
      intent: "dialogue_readability",
    });
    expect(plan.scope.effectiveShotIds).toContain(balloonShotId);
    expect(plan.protectedChangeCount).toBeGreaterThanOrEqual(2);
    expect(plan.warnings).toContain("SMART_PROTECTED_ITEMS_PRESERVED");
    expect(plan.commandBatch.commands.some((command) => (
      command.type === "balloon.set_visual_style" && command.payload.elementId === baseBalloon.id
    ))).toBe(true);
    expect(plan.commandBatch.commands.some((command) => (
      command.type === "image.set_crop" && command.payload.elementId === basePanel.id
    ))).toBe(false);

    const beforeText = richTextPlainTextV1(baseBalloon.richText);
    const applied = applyLayoutCommandBatchV2(base, plan.commandBatch).document;
    const afterPanel = firstPanel(applied, balloonShotId);
    const afterBalloon = firstBalloon(applied, balloonShotId);
    expect(afterPanel.contentImage?.crop).toEqual(basePanel.contentImage.crop);
    expect(afterBalloon.transform).toEqual(baseBalloon.transform);
    expect(richTextPlainTextV1(afterBalloon.richText)).toBe(beforeText);
    expect(afterBalloon.fillColor).toBe(targetBalloon.fillColor);
    expect(afterBalloon.tail).toEqual(targetBalloon.tail);
  });

  it("widens a panel selection to the complete narrative group", async () => {
    const input = await sourceInput();
    const target = composeVisuallyGuidedLayoutV1(input);
    const narrative = composeRuleBasedLayoutV1(input).narrativePlan;
    const group = narrative.groups.find((item) => item.shotIds.length > 1);
    if (!group) throw new Error("fixture multi-shot group missing");
    const panel = firstPanel(target.document, group.shotIds[0]);
    const resolved = resolveLayoutCompositionScopeV1({
      document: target.document,
      storyboard: input.storyboardVersion.document,
      narrativePlan: narrative,
      scope: { canvasIds: [], elementIds: [panel.id], shotIds: [] },
    });
    expect(resolved.expandedToNarrativeGroup).toBe(true);
    expect(resolved.effectiveShotIds).toEqual([...group.shotIds].sort());
  });

  it("uses an explicit shot target as a current-scene request before narrative expansion", async () => {
    const input = await sourceInput();
    const target = composeVisuallyGuidedLayoutV1(input);
    const narrative = composeRuleBasedLayoutV1(input).narrativePlan;
    const resolved = resolveLayoutCompositionScopeV1({
      document: target.document,
      storyboard: input.storyboardVersion.document,
      narrativePlan: narrative,
      scope: {
        canvasIds: [],
        elementIds: [],
        shotIds: ["fix-p03-paged_shot_01"],
      },
    });
    expect(resolved.expandedToScene).toBe(true);
    expect(resolved.effectiveShotIds).toEqual([
      "fix-p03-paged_shot_01",
      "fix-p03-paged_shot_02",
      "fix-p03-paged_shot_03",
      "fix-p03-paged_shot_04",
      "fix-p03-paged_shot_05",
      "fix-p03-paged_shot_06",
    ]);
    expect(resolved.effectiveShotIds).not.toContain("fix-p03-paged_shot_07");
  });

  it("rejects stale or non-storyboard element targets instead of widening silently", async () => {
    const input = await sourceInput();
    const target = composeVisuallyGuidedLayoutV1(input);
    const narrative = composeRuleBasedLayoutV1(input).narrativePlan;
    expect(() => resolveLayoutCompositionScopeV1({
      document: target.document,
      storyboard: input.storyboardVersion.document,
      narrativePlan: narrative,
      scope: { canvasIds: [], elementIds: ["missing_element"], shotIds: [] },
    })).toThrow(/missing_element/);
  });
});
