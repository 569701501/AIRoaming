import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  composeVisuallyGuidedLayoutV1,
  intersectPixelRectsV1,
  normalizeLayoutDialogueV1,
  projectCoverCropV1,
  projectNormalizedRectToCanvasV1,
  scoreVisualLayoutCandidateV1,
  type BalloonElementV1,
  type LayoutVisualCompositionInputV1,
  type PanelFrameElementV1,
} from "./index.js";

const smartFixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/smart-layout",
);

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function fixture(name: string): Promise<any> {
  return json(path.join(smartFixtureRoot, "fixtures", `${name}.json`));
}

async function visualFixture(): Promise<any> {
  return json(path.join(smartFixtureRoot, "m3-visual-analysis.fixture.json"));
}

function inputFromFixture(value: any, visual: any): LayoutVisualCompositionInputV1 {
  const variant = visual.variants.find((entry: any) => entry.variantId === value.variant.variantId);
  if (!variant) throw new Error(`visual analysis missing for ${value.variant.variantId}`);
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

function firstBalloonAndPanel(document: ReturnType<typeof composeVisuallyGuidedLayoutV1>["document"]): {
  balloon: BalloonElementV1;
  panel: PanelFrameElementV1;
} {
  const boundIds = new Set(document.automation.dialogueBindings.flatMap((binding) => (
    binding.elementId ? [binding.elementId] : []
  )));
  const balloon = document.canvases.flatMap((canvas) => canvas.elements).find(
    (element): element is BalloonElementV1 => (
      element.type === "balloon" && !element.hidden && !!element.sourceShotId && boundIds.has(element.id)
    ),
  );
  const panel = document.canvases.flatMap((canvas) => canvas.elements).find(
    (element): element is PanelFrameElementV1 => (
      element.type === "panel_frame"
      && element.contentImage?.source.shotId === balloon?.sourceShotId
    ),
  );
  if (!balloon || !panel) throw new Error("fixture must contain a bound balloon and source panel");
  return { balloon, panel };
}

describe("layout composition safety score", () => {
  it("rejects a rule-fallback balloon placed inside its panel with a tail", async () => {
    const sample = await fixture("fix-v02-vertical");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    input.visualEvidence = input.visualEvidence.map((entry) => ({ ...entry, analysis: null }));
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const { balloon, panel } = firstBalloonAndPanel(document);
    balloon.transform.x = panel.transform.x + 20;
    balloon.transform.y = panel.transform.y + 20;
    balloon.tail.enabled = true;

    const dialogueLedger = normalizeLayoutDialogueV1({
      storyboard: input.storyboardVersion.document,
      characterCatalog: input.characterCatalog,
    });
    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger,
      sources: input.sources,
      analyses: plan.analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === balloon.id)?.issues).toEqual(
      expect.arrayContaining([
        "fallback_balloon_must_be_external",
        "fallback_tail_must_be_disabled",
      ]),
    );
  });

  it("rejects an in-panel vision balloon that is not covered by a verified safe region", async () => {
    const sample = await fixture("fix-v02-vertical");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const { balloon, panel } = firstBalloonAndPanel(document);
    balloon.transform.x = panel.transform.x + 20;
    balloon.transform.y = panel.transform.y + 20;
    const analyses = plan.analyses.map((entry) => (
      entry.shotId === balloon.sourceShotId
        ? { ...entry, analysis: { ...entry.analysis, textSafeRegions: [] } }
        : entry
    ));

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === balloon.id)?.issues).toContain(
      "balloon_outside_verified_safe_region",
    );
  });

  it("rejects a vision balloon whose in-panel fragment is safe but whose body crosses the panel edge", async () => {
    const sample = await fixture("fix-v02-vertical");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const { balloon, panel } = firstBalloonAndPanel(document);
    balloon.transform.x = panel.transform.x + 20;
    balloon.transform.y = panel.transform.y - balloon.transform.height + 20;
    const analyses = plan.analyses.map((entry) => (
      entry.shotId === balloon.sourceShotId
        ? {
            ...entry,
            analysis: {
              ...entry.analysis,
              textSafeRegions: [{
                box: { x: 0, y: 0, width: 1, height: 1 },
                score: 1,
              }],
            },
          }
        : entry
    ));

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === balloon.id)?.issues).toContain(
      "balloon_outside_verified_safe_region",
    );
  });

  it("treats even a narrow balloon overlap as a hard collision", async () => {
    const sample = await fixture("fix-p04-paged");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const canvas = document.canvases.find((candidate) => (
      candidate.elements.filter((element) => element.type === "balloon" && !element.hidden).length >= 2
    ));
    const pair = canvas?.elements.filter(
      (element): element is BalloonElementV1 => element.type === "balloon" && !element.hidden,
    ).slice(0, 2);
    if (!pair || pair.length < 2) throw new Error("fixture must contain two visible balloons on one canvas");
    const [first, second] = pair;
    second.transform.x = first.transform.x + first.transform.width - 2;
    second.transform.y = first.transform.y;

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses: plan.analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === first.id)?.issues).toContain(
      "balloon_collision",
    );
    expect(score.balloons.find((item) => item.elementId === second.id)?.issues).toContain(
      "balloon_collision",
    );
  });

  it("does not award verified crop protection when fallback analysis has no subjects", async () => {
    const sample = await fixture("fix-v02-vertical");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    input.visualEvidence = input.visualEvidence.map((entry) => ({ ...entry, analysis: null }));
    const plan = composeVisuallyGuidedLayoutV1(input);
    const score = scoreVisualLayoutCandidateV1({
      document: plan.document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses: plan.analyses,
    });

    expect(score.hardGatePassed).toBe(true);
    expect(score.dimensions.subjectCropProtection).toBeLessThan(25);
    expect(score.panelDirectUsableRate).toBe(0);
    expect(score.panels.every((panel) => panel.issues.includes("visual_protection_unverified"))).toBe(true);
  });

  it("rejects a fallback balloon detached beyond the bounded clear-lane distance", async () => {
    const sample = await fixture("fix-v02-vertical");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    input.visualEvidence = input.visualEvidence.map((entry) => ({ ...entry, analysis: null }));
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const { balloon, panel } = firstBalloonAndPanel(document);
    const canvas = document.canvases.find((candidate) => candidate.elements.some(
      (element) => element.id === balloon.id,
    ));
    if (!canvas) throw new Error("fixture must contain the balloon canvas");
    canvas.height = 3400;
    canvas.panelReadingOrder = [panel.id];
    canvas.elements = [panel, balloon];
    balloon.transform.x = 64;
    balloon.transform.y = 64;
    panel.transform.x = 64;
    panel.transform.y = 2200;

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses: plan.analyses,
    });
    const balloonScore = score.balloons.find((item) => item.elementId === balloon.id);

    expect(balloonScore?.issues).toContain("balloon_detached_from_source_panel");
    expect(balloonScore?.balloonGeometryOk).toBe(false);
    expect(score.hardGatePassed).toBe(false);
  });

  it("marks a panel unusable when a balloon covers a protected focal region", async () => {
    const sample = await fixture("fix-p02-paged");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const analysisByShot = new Map(plan.analyses.map((entry) => [entry.shotId, entry.analysis]));
    const sourceByShot = new Map(input.sources.map((source) => [source.source.shotId, source]));
    const balloon = document.canvases.flatMap((canvas) => canvas.elements).find(
      (element): element is BalloonElementV1 => (
        element.type === "balloon"
        && !element.hidden
        && !!element.sourceShotId
        && (analysisByShot.get(element.sourceShotId)?.focalRegions.some((region) => region.weight >= 0.65) ?? false)
      ),
    );
    const panel = document.canvases.flatMap((canvas) => canvas.elements).find(
      (element): element is PanelFrameElementV1 => (
        element.type === "panel_frame"
        && element.contentImage?.source.shotId === balloon?.sourceShotId
      ),
    );
    const analysis = balloon?.sourceShotId ? analysisByShot.get(balloon.sourceShotId) : undefined;
    const source = balloon?.sourceShotId ? sourceByShot.get(balloon.sourceShotId) : undefined;
    const focal = analysis?.focalRegions.find((region) => region.weight >= 0.65);
    if (!balloon || !panel?.contentImage || !analysis || !source || !focal) {
      throw new Error("fixture must contain a balloon with a protected focal region");
    }
    const projection = projectCoverCropV1({
      frame: panel.transform,
      sourceWidth: source.width,
      sourceHeight: source.height,
      crop: panel.contentImage.crop,
    });
    const focalRect = intersectPixelRectsV1(
      projectNormalizedRectToCanvasV1(focal.box, projection),
      panel.transform,
    );
    balloon.transform.x = focalRect.x;
    balloon.transform.y = focalRect.y;
    balloon.transform.width = Math.max(20, Math.min(balloon.transform.width, focalRect.width));
    balloon.transform.height = Math.max(20, Math.min(balloon.transform.height, focalRect.height));

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses: plan.analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === balloon.id)?.issues).toContain(
      "balloon_overlaps_focal_region",
    );
    expect(score.panels.find((item) => item.panelId === panel.id)).toMatchObject({
      subjectOcclusionOk: false,
      directUsable: false,
    });
  });

  it("does not ignore a narrow balloon overlap with a protected subject body", async () => {
    const sample = await fixture("fix-p02-paged");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const analysisByShot = new Map(plan.analyses.map((entry) => [entry.shotId, entry.analysis]));
    const sourceByShot = new Map(input.sources.map((source) => [source.source.shotId, source]));
    const balloon = document.canvases.flatMap((canvas) => canvas.elements).find(
      (element): element is BalloonElementV1 => (
        element.type === "balloon"
        && !element.hidden
        && !!element.sourceShotId
        && (analysisByShot.get(element.sourceShotId)?.subjects.some((subject) => (
          subject.confidence >= 0.65 && subject.importance >= 0.45
        )) ?? false)
      ),
    );
    const panel = document.canvases.flatMap((canvas) => canvas.elements).find(
      (element): element is PanelFrameElementV1 => (
        element.type === "panel_frame"
        && element.contentImage?.source.shotId === balloon?.sourceShotId
      ),
    );
    const analysis = balloon?.sourceShotId ? analysisByShot.get(balloon.sourceShotId) : undefined;
    const source = balloon?.sourceShotId ? sourceByShot.get(balloon.sourceShotId) : undefined;
    const subject = analysis?.subjects.find((candidate) => (
      candidate.confidence >= 0.65 && candidate.importance >= 0.45
    ));
    if (!balloon || !panel?.contentImage || !source || !subject) {
      throw new Error("fixture must contain a balloon and protected subject");
    }
    const projection = projectCoverCropV1({
      frame: panel.transform,
      sourceWidth: source.width,
      sourceHeight: source.height,
      crop: panel.contentImage.crop,
    });
    const bodyRect = intersectPixelRectsV1(
      projectNormalizedRectToCanvasV1(subject.bodyBox, projection),
      panel.transform,
    );
    balloon.transform.x = bodyRect.x + bodyRect.width - 2;
    balloon.transform.y = bodyRect.y;
    const analyses = plan.analyses.map((entry) => ({
      ...entry,
      analysis: {
        ...entry.analysis,
        subjects: entry.shotId === balloon.sourceShotId
          ? [{ ...subject, faceBox: null }]
          : [],
        focalRegions: [],
        textSafeRegions: [],
      },
    }));

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === balloon.id)?.issues).toContain(
      "balloon_overlaps_subject",
    );
  });

  it("rejects a balloon that is external to its source but covers another panel", async () => {
    const sample = await fixture("fix-p02-paged");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const plan = composeVisuallyGuidedLayoutV1(input);
    const document = structuredClone(plan.document);
    const boundIds = new Set(document.automation.dialogueBindings.flatMap((binding) => (
      binding.elementId ? [binding.elementId] : []
    )));
    const canvas = document.canvases.find((candidate) => (
      candidate.elements.filter((element) => element.type === "panel_frame").length >= 2
      && candidate.elements.some((element) => element.type === "balloon" && boundIds.has(element.id))
    ));
    const panels = canvas?.elements.filter(
      (element): element is PanelFrameElementV1 => element.type === "panel_frame" && !!element.contentImage,
    );
    const balloon = canvas?.elements.find(
      (element): element is BalloonElementV1 => (
        element.type === "balloon" && !element.hidden && boundIds.has(element.id)
      ),
    );
    const sourcePanel = panels?.find((panel) => (
      panel.contentImage?.source.shotId === balloon?.sourceShotId
    ));
    const otherPanel = panels?.find((panel) => panel.id !== sourcePanel?.id);
    if (!balloon || !sourcePanel || !otherPanel) {
      throw new Error("fixture must contain a bound balloon and adjacent panel");
    }
    balloon.transform.x = otherPanel.transform.x + 10;
    balloon.transform.y = otherPanel.transform.y + 10;
    balloon.tail.enabled = false;
    const analyses = plan.analyses.map((entry) => ({
      ...entry,
      analysis: {
        ...entry.analysis,
        subjects: [],
        focalRegions: [],
        textSafeRegions: [],
      },
    }));

    const score = scoreVisualLayoutCandidateV1({
      document,
      storyboard: input.storyboardVersion.document,
      dialogueLedger: normalizeLayoutDialogueV1({
        storyboard: input.storyboardVersion.document,
        characterCatalog: input.characterCatalog,
      }),
      sources: input.sources,
      analyses,
    });

    expect(score.hardGatePassed).toBe(false);
    expect(score.balloons.find((item) => item.elementId === balloon.id)?.issues).toContain(
      "balloon_overlaps_other_panel",
    );
  });
});
