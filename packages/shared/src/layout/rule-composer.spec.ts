import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { StoryboardDocumentCodecV2 } from "../versioning/document-codec.js";
import {
  assertInitialLayoutDialogueCoverageV1,
  composeRuleBasedLayoutV1,
  evaluateRichTextOverflowV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  projectVisibleShotPlacementsV1,
  richTextPlainTextV1,
  type BalloonElementV1,
  type LayoutRuleCompositionInputV1,
} from "./index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/smart-layout/fixtures",
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

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8"));
}

function inputFromFixture(value: any): LayoutRuleCompositionInputV1 {
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
  };
}

function balloons(document: ReturnType<typeof composeRuleBasedLayoutV1>["document"]): BalloonElementV1[] {
  return document.canvases.flatMap((canvas) => canvas.elements.filter(
    (element): element is BalloonElementV1 => element.type === "balloon",
  ));
}

describe("Smart layout M2 deterministic rule composition", () => {
  it("SML-REQ-002/003 and SML-DLG-006 cover all 69 shots and 59 source text items without rewriting", async () => {
    let shotCount = 0;
    let dialogueCount = 0;
    for (const name of fixtureNames) {
      const sample = await fixture(name);
      const input = inputFromFixture(sample);
      const first = composeRuleBasedLayoutV1(input);
      const second = composeRuleBasedLayoutV1(input);
      const expectedLedger = sample.inputs.dialogueLedger.items;

      expect(second.planDigest, name).toBe(first.planDigest);
      expect(second.visibleDocumentDigest, name).toBe(first.visibleDocumentDigest);
      expect(second.documentDigest, name).toBe(first.documentDigest);
      expect(second.document, name).toEqual(first.document);
      expect(first.report.shotCoverage, name).toEqual({
        expected: sample.inputs.storyboardVersion.document.shots.length,
        placed: sample.inputs.storyboardVersion.document.shots.length,
      });
      expect(first.report.dialogueCoverage, name).toMatchObject({
        expected: expectedLedger.length,
        placedOriginal: expectedLedger.length,
        userModified: 0,
        userSuppressed: 0,
        status: "passed",
      });
      expect(first.report.silentRewriteCount, name).toBe(0);
      expect(first.report.textOverflowCount, name).toBe(0);
      expect(first.dialogueLedger.items.map((item) => ({
        shotId: item.shotId,
        text: item.text,
        kind: item.kind,
      })), name).toEqual(expectedLedger.map((item: any) => ({
        shotId: item.shotId,
        text: item.text,
        kind: item.expectedBalloonKind,
      })));
      expect(first.document.automation.dialogueBindings, name).toHaveLength(expectedLedger.length);
      expect(balloons(first.document), name).toHaveLength(expectedLedger.length);
      expect(balloons(first.document).every((balloon) => balloon.tail.enabled === false), name).toBe(true);
      expect(balloons(first.document).filter((balloon) => balloon.balloonKind === "caption").every(
        (balloon) => balloon.speakerCharacterId === null,
      ), name).toBe(true);

      const placements = projectVisibleShotPlacementsV1(projectLayoutDocumentV2ToV1(first.document));
      expect(Object.keys(placements), name).toHaveLength(sample.inputs.storyboardVersion.document.shots.length);
      expect(Object.values(placements).every((items) => items.length === 1), name).toBe(true);
      expect(LayoutDocumentCodecV2.encode(first.document).digest, name).toBe(first.documentDigest);

      shotCount += sample.inputs.storyboardVersion.document.shots.length;
      dialogueCount += expectedLedger.length;
    }
    expect(shotCount).toBe(69);
    expect(dialogueCount).toBe(59);
  });

  it("SML-LAY-002 creates variable-height multi-shot strip sections with stable reading order", async () => {
    const plans = await Promise.all([
      "fix-v01-vertical",
      "fix-v02-vertical",
      "fix-v03-vertical",
      "fix-v04-vertical",
    ].map(async (name) => composeRuleBasedLayoutV1(inputFromFixture(await fixture(name)))));
    const canvases = plans.flatMap((plan) => plan.document.canvases);
    const panelCounts = canvases.map((canvas) => canvas.elements.filter((element) => element.type === "panel_frame").length);
    expect(panelCounts.some((count) => count > 1)).toBe(true);
    expect(canvases.some((canvas) => canvas.height !== 1920)).toBe(true);
    expect(canvases.every((canvas) => canvas.kind === "strip_section" && canvas.height >= 320 && canvas.height <= 8192)).toBe(true);
    for (const canvas of canvases) {
      const panels = canvas.elements.filter((element) => element.type === "panel_frame");
      expect(canvas.panelReadingOrder).toEqual(panels.map((panel) => panel.id));
      expect(panels.every((panel) => panel.transform.x >= 0
        && panel.transform.y >= 0
        && panel.transform.x + panel.transform.width <= canvas.width
        && panel.transform.y + panel.transform.height <= canvas.height)).toBe(true);
    }
  });

  it("SML-LAY-003 paginates narrative groups atomically into 1..6 ordered panels", async () => {
    for (const name of ["fix-p01-paged", "fix-p02-paged", "fix-p03-paged", "fix-p04-paged"] as const) {
      const plan = composeRuleBasedLayoutV1(inputFromFixture(await fixture(name)));
      const groupCanvas = new Map<string, string>();
      for (const canvasPlan of plan.canvases) {
        expect(canvasPlan.shotIds.length, name).toBeGreaterThanOrEqual(1);
        expect(canvasPlan.shotIds.length, name).toBeLessThanOrEqual(6);
        for (const groupId of canvasPlan.groupIds) {
          expect(groupCanvas.has(groupId), `${name}/${groupId}`).toBe(false);
          groupCanvas.set(groupId, canvasPlan.canvasId);
        }
      }
      expect(groupCanvas.size, name).toBe(plan.narrativePlan.groups.length);
      expect(plan.canvases.flatMap((canvas) => canvas.shotIds), name).toEqual(
        plan.document.canvases.flatMap((canvas) => canvas.panelReadingOrder.map((panelId) => {
          const panel = canvas.elements.find((element) => element.id === panelId);
          if (!panel || panel.type !== "panel_frame" || !panel.contentImage) throw new Error("panel missing");
          return panel.contentImage.source.shotId;
        })),
      );
    }
  });

  it("SML-LAY-004 uses the fixed minimum font styles and proves every generated box fits", async () => {
    const plan = composeRuleBasedLayoutV1(inputFromFixture(await fixture("fix-p04-paged")));
    for (const balloon of balloons(plan.document)) {
      const fontSizes = balloon.richText.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.fontSize));
      expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(36);
      const overflow = evaluateRichTextOverflowV1(balloon.richText, {
        width: balloon.transform.width - balloon.padding.left - balloon.padding.right,
        height: balloon.transform.height - balloon.padding.top - balloon.padding.bottom,
      });
      expect(overflow.overflow, balloon.id).toBe(false);
    }
  });

  it("SML-DLG-005 fails closed when a placed balloon is rewritten or omitted", async () => {
    const plan = composeRuleBasedLayoutV1(inputFromFixture(await fixture("fix-v01-vertical")));
    const rewritten = structuredClone(plan.document);
    const firstBalloon = rewritten.canvases.flatMap((canvas) => canvas.elements)
      .find((element): element is BalloonElementV1 => element.type === "balloon");
    if (!firstBalloon) throw new Error("balloon missing");
    firstBalloon.richText.paragraphs[0]!.runs[0]!.text = "被静默改写";
    expect(() => assertInitialLayoutDialogueCoverageV1(rewritten, plan.dialogueLedger)).toThrow(/rewritten/);

    const omitted = structuredClone(plan.document);
    omitted.automation.dialogueBindings.splice(0, 1);
    expect(() => assertInitialLayoutDialogueCoverageV1(omitted, plan.dialogueLedger)).toThrow(/does not match expected/);
    expect(richTextPlainTextV1(firstBalloon.richText)).toBe("被静默改写");
  });

  it("SML-LAY-005 rejects an unfit source instead of emitting a partial document", async () => {
    const sample = await fixture("fix-p04-paged");
    const input = inputFromFixture(sample);
    const changed = structuredClone(input.storyboardVersion.document);
    changed.shots[0].motion.voiceLines[0].line = "无法安全排入的超长对白".repeat(800);
    changed.shots[0].comic.dialogue = `高远：${changed.shots[0].motion.voiceLines[0].line}`;
    input.storyboardVersion.document = changed;
    input.storyboardVersion.documentDigest = StoryboardDocumentCodecV2.encode(changed).digest;
    try {
      composeRuleBasedLayoutV1(input);
      throw new Error("expected composition failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "LAYOUT_TEXT_OVERFLOW" });
    }
  });

  it("rejects stale or incomplete source projections before planning", async () => {
    const sample = await fixture("fix-p01-paged");
    const stale = inputFromFixture(sample);
    stale.sourceLockSetDigest = `sha256:${"0".repeat(64)}`;
    expect(() => composeRuleBasedLayoutV1(stale)).toThrow(/source lock set digest mismatch/);

    const incomplete = inputFromFixture(sample);
    incomplete.sources = incomplete.sources.slice(1);
    expect(() => composeRuleBasedLayoutV1(incomplete)).toThrow(/does not cover every active shot/);
  });
});
