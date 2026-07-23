import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  composeVisuallyGuidedLayoutV1,
  createLayoutImageAnalysisV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  projectVisibleShotPlacementsV1,
  richTextPlainTextV1,
  type BalloonElementV1,
  type LayoutVisualCompositionInputV1,
} from "./index.js";

const smartFixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/smart-layout",
);

const fixtureNames = [
  "fix-p01-paged",
  "fix-p02-paged",
  "fix-p03-paged",
  "fix-p04-paged",
  "fix-v01-vertical",
  "fix-v02-vertical",
  "fix-v03-vertical",
  "fix-v04-vertical",
  "fix-x01-paged",
  "fix-x01-vertical",
  "fix-x02-paged",
  "fix-x02-vertical",
] as const;

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

function balloons(document: ReturnType<typeof composeVisuallyGuidedLayoutV1>["document"]): BalloonElementV1[] {
  return document.canvases.flatMap((canvas) => canvas.elements.filter(
    (element): element is BalloonElementV1 => element.type === "balloon",
  ));
}

describe("Smart layout M3 visual candidates, scoring and bounded repair", () => {
  it("SML-SCO-001 produces three stable valid candidates and selects deterministically", async () => {
    const sample = await fixture("fix-p03-paged");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    const first = composeVisuallyGuidedLayoutV1(input);
    const second = composeVisuallyGuidedLayoutV1(input);
    expect(first.candidates).toHaveLength(3);
    expect(first.candidates.every((candidate) => candidate.status === "valid" && candidate.repairRounds <= 4)).toBe(true);
    expect(first.planDigest).toBe(second.planDigest);
    expect(first.documentDigest).toBe(second.documentDigest);
    expect(first.report.selectedStrategy).toBe(second.report.selectedStrategy);
    expect(first.candidates.map((candidate) => candidate.planDigest)).toEqual(second.candidates.map((candidate) => candidate.planDigest));
    const tied = first.candidates.filter((candidate) => (
      candidate.score.total === first.candidates[0]!.score.total
      && JSON.stringify(candidate.score.dimensions) === JSON.stringify(first.candidates[0]!.score.dimensions)
    ));
    if (tied.length > 1) {
      expect(tied.map((candidate) => candidate.planDigest)).toEqual(
        tied.map((candidate) => candidate.planDigest).sort(),
      );
    }
    expect(first.report.quality.hardGatePassed).toBe(true);
    expect(LayoutDocumentCodecV2.encode(first.document).digest).toBe(first.documentDigest);

    const alternative = composeVisuallyGuidedLayoutV1({
      ...input,
      avoidVisibleDocumentDigest: first.visibleDocumentDigest,
    });
    expect(alternative.visibleDocumentDigest).not.toBe(first.visibleDocumentDigest);
    expect(alternative.candidates.some((candidate) => (
      candidate.visibleDocumentDigest === alternative.visibleDocumentDigest
    ))).toBe(true);
  });

  it("keeps all 69 shots and 59 source text items exact at the frozen 100% automated pre-screen", async () => {
    const visual = await visualFixture();
    let shots = 0;
    let textItems = 0;
    let panelPassed = 0;
    let balloonPassed = 0;
    const diagnostics: Array<{
      name: string;
      strategy: string;
      panels: string[];
      balloons: string[];
      panelRate: number;
      balloonRate: number;
    }> = [];
    for (const name of fixtureNames) {
      const sample = await fixture(name);
      const plan = composeVisuallyGuidedLayoutV1(inputFromFixture(sample, visual));
      const placements = projectVisibleShotPlacementsV1(projectLayoutDocumentV2ToV1(plan.document));
      const expectedItems = sample.inputs.dialogueLedger.items;
      expect(Object.keys(placements), name).toHaveLength(sample.inputs.storyboardVersion.document.shots.length);
      expect(Object.values(placements).every((entries) => entries.length === 1), name).toBe(true);
      expect(plan.report.dialogueCoverage, name).toMatchObject({
        expected: expectedItems.length,
        placedOriginal: expectedItems.length,
        status: "passed",
      });
      const actualText = balloons(plan.document).map((balloon) => richTextPlainTextV1(balloon.richText)).sort();
      expect(actualText, name).toEqual(expectedItems.map((item: any) => item.text).sort());
      expect(plan.report.textOverflowCount, name).toBe(0);
      expect(plan.report.silentRewriteCount, name).toBe(0);
      shots += plan.report.quality.panels.length;
      textItems += plan.report.quality.balloons.length;
      panelPassed += plan.report.quality.panels.filter((item) => item.directUsable).length;
      balloonPassed += plan.report.quality.balloons.filter((item) => item.directUsable).length;
      diagnostics.push({
        name,
        strategy: plan.report.selectedStrategy,
        panels: plan.report.quality.panels.filter((item) => !item.directUsable).map((item) => `${item.shotId}:${item.issues.join("+")}`),
        balloons: plan.report.quality.balloons.filter((item) => !item.directUsable).map((item) => `${item.dialogueItemId}:${item.issues.join("+")}`),
        panelRate: plan.report.quality.panelDirectUsableRate,
        balloonRate: plan.report.quality.balloonDirectUsableRate,
      });
    }
    expect(shots).toBe(69);
    expect(textItems).toBe(59);
    if (panelPassed !== shots || balloonPassed !== textItems) {
      throw new Error(JSON.stringify({ panelRate: panelPassed / shots, balloonRate: balloonPassed / textItems, diagnostics }, null, 2));
    }
  });

  it("rejects malformed provider analysis and safely composes with a mixed fallback", async () => {
    const sample = await fixture("fix-v01-vertical");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    input.visualEvidence[0]!.analysis = { providerText: "not a contract" };
    const plan = composeVisuallyGuidedLayoutV1(input);
    expect(plan.report.analysisMode).toBe("mixed");
    expect(plan.report.issues.some((issue) => issue.code === "visual_analysis_rejected")).toBe(true);
    expect(plan.report.shotCoverage).toEqual({ expected: 6, placed: 6 });
    expect(plan.report.dialogueCoverage.status).toBe("passed");
  });

  it("SML-VIS-002 survives provider timeout and disables untrusted low-confidence tails", async () => {
    const sample = await fixture("fix-v02-vertical");
    const visual = await visualFixture();
    const timedOut = inputFromFixture(sample, visual);
    timedOut.visualEvidence = timedOut.visualEvidence.map((entry) => ({ ...entry, analysis: null }));
    const fallback = composeVisuallyGuidedLayoutV1(timedOut);
    expect(fallback.report.analysisMode).toBe("rule_fallback");
    expect(fallback.report.issues.filter((issue) => issue.code === "visual_analysis_unavailable")).toHaveLength(8);
    expect(balloons(fallback.document).every((balloon) => balloon.tail.enabled === false)).toBe(true);

    const lowConfidence = inputFromFixture(sample, visual);
    const first = lowConfidence.visualEvidence[0]!;
    const { analysisDigest: _digest, ...draft } = first.analysis as any;
    first.analysis = createLayoutImageAnalysisV1({
      ...draft,
      subjects: draft.subjects.map((subject: any) => ({ ...subject, confidence: 0.2 })),
    });
    const degraded = composeVisuallyGuidedLayoutV1(lowConfidence);
    expect(degraded.report.issues.some((issue) => issue.code === "visual_analysis_low_confidence" && issue.shotId === first.shotId)).toBe(true);
    expect(balloons(degraded.document).filter((balloon) => balloon.sourceShotId === first.shotId)
      .every((balloon) => balloon.tail.enabled === false)).toBe(true);
  });

  it("SML-VIS-003 preserves every high-confidence subject and face in the frozen multi-person page", async () => {
    const sample = await fixture("fix-p02-paged");
    const visual = await visualFixture();
    const plan = composeVisuallyGuidedLayoutV1(inputFromFixture(sample, visual));
    expect(plan.report.quality.panels).toHaveLength(5);
    expect(plan.report.quality.panels.every((panel) => panel.cropOk)).toBe(true);
    expect(plan.report.quality.panels.every((panel) => panel.bodyVisibility >= 0.985 && panel.faceVisibility >= 0.998)).toBe(true);
    expect(plan.report.quality.panels.every((panel) => panel.directUsable)).toBe(true);
    expect(plan.report.quality.balloons.every((balloon) => balloon.directUsable)).toBe(true);

    const firstPanel = plan.document.canvases.flatMap((canvas) => canvas.elements).find((element) => (
      element.type === "panel_frame" && element.contentImage?.source.shotId === "fix-p02-paged_shot_01"
    ));
    const firstShotBalloons = balloons(plan.document).filter((balloon) => (
      balloon.sourceShotId === "fix-p02-paged_shot_01"
    ));
    expect(firstPanel?.type).toBe("panel_frame");
    if (!firstPanel || firstPanel.type !== "panel_frame") throw new Error("frozen multi-speaker panel missing");
    expect(firstShotBalloons).toHaveLength(2);
    expect(firstShotBalloons.every((balloon) => balloon.transform.width < firstPanel.transform.width * 0.62)).toBe(true);
  });

  it("keeps tail-less captions visibly attached to their source panels", async () => {
    const sample = await fixture("fix-p04-paged");
    const visual = await visualFixture();
    const plan = composeVisuallyGuidedLayoutV1(inputFromFixture(sample, visual));
    const captionIds = new Set(balloons(plan.document)
      .filter((balloon) => balloon.balloonKind === "caption")
      .map((balloon) => balloon.id));
    const captionQuality = plan.report.quality.balloons.filter((balloon) => captionIds.has(balloon.elementId));
    expect(captionQuality).toHaveLength(3);
    expect(captionQuality.every((balloon) => (
      balloon.directUsable && !balloon.issues.includes("balloon_detached_from_source_panel")
    ))).toBe(true);
  });

  it("fails before planning when visual asset evidence is stale", async () => {
    const sample = await fixture("fix-p01-paged");
    const visual = await visualFixture();
    const input = inputFromFixture(sample, visual);
    input.visualEvidence[0]!.assetDigest = `sha256:${"0".repeat(64)}`;
    expect(() => composeVisuallyGuidedLayoutV1(input)).toThrow(/visual evidence digest is stale/);
  });
});
