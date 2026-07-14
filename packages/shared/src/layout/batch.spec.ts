import { describe, expect, it } from "vitest";

import {
  initializeLayoutCanvasesFromSourcesV1,
  type LayoutProfileV1,
  type LayoutSourceCatalogItemV1,
} from "./index.js";

const digest = `sha256:${"b".repeat(64)}` as const;

function sources(count: number): LayoutSourceCatalogItemV1[] {
  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    width: 1024,
    height: 1536,
    source: {
      shotId: `shot_${index + 1}`,
      candidateId: `candidate_${index + 1}`,
      candidateLockRevisionId: `lock_${index + 1}`,
      assetId: `asset_${index + 1}`,
      sourceDigest: digest,
    },
  }));
}

function createIdFactory(): (kind: "canvas" | "panel" | "image") => string {
  let value = 0;
  return (kind) => `${kind}_${++value}`;
}

describe("G5-M4 batch layout initialization", () => {
  it("groups paged sources into multi-panel pages without losing source order", () => {
    const profile: LayoutProfileV1 = {
      kind: "paged",
      presetId: "portrait_3_4",
      width: 1800,
      height: 2400,
      safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
      panelReadingDirection: "ltr_ttb",
    };
    const canvases = initializeLayoutCanvasesFromSourcesV1({
      profile,
      sources: sources(5),
      createId: createIdFactory(),
    });
    expect(canvases.map((canvas) => [canvas.kind, canvas.elements.length])).toEqual([
      ["page", 4],
      ["page", 1],
    ]);
    expect(canvases.flatMap((canvas) => canvas.elements).map((element) =>
      element.type === "panel_frame" ? element.contentImage?.source.shotId : null
    )).toEqual(["shot_1", "shot_2", "shot_3", "shot_4", "shot_5"]);
  });

  it("creates one independently reorderable strip section per source", () => {
    const profile: LayoutProfileV1 = {
      kind: "vertical_strip",
      presetId: "webtoon_1080",
      width: 1080,
      defaultSectionHeight: 1920,
      safeInsetX: 64,
    };
    const canvases = initializeLayoutCanvasesFromSourcesV1({
      profile,
      sources: sources(3),
      createId: createIdFactory(),
    });
    expect(canvases.map((canvas) => [canvas.kind, canvas.width, canvas.height, canvas.elements.length])).toEqual([
      ["strip_section", 1080, 1920, 1],
      ["strip_section", 1080, 1920, 1],
      ["strip_section", 1080, 1920, 1],
    ]);
    expect(canvases.map((canvas) => canvas.panelReadingOrder)).toSatisfy((orders: string[][]) =>
      orders.every((order) => order.length === 1));
  });
});
