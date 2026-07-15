import { describe, expect, it } from "vitest";

import { convertLegacyChapterLayoutV1 } from "./layout-legacy-converter.js";

const sha = `sha256:${"a".repeat(64)}` as const;

describe("G5-M8 legacy ChapterLayout converter", () => {
  it("preserves page dimensions, order and exact source revision in a V1 Working Copy", () => {
    const converted = convertLegacyChapterLayoutV1({
      projectId: "project_1",
      chapterId: "chapter_1",
      comicFormat: "paged_comic",
      fontAssetId: "font_1",
      legacyDocument: {
        pages: [{
          id: "legacy_page",
          width: 1800,
          height: 2400,
          placements: [{ shotId: "legacy_shot", order: 2, x: 80, y: 120, w: 1640, h: 2160 }],
        }],
      },
      sources: [{
        elementId: "legacy_placement",
        shotId: "shot_1",
        candidateId: "candidate_1",
        candidateLockRevisionId: "lock_1",
        assetId: "asset_1",
        assetSha256: sha,
        width: 1024,
        height: 1536,
      }],
    });

    expect(converted.document).toMatchObject({
      kind: "layout_document_v1",
      profile: { kind: "paged", width: 1800, height: 2400 },
      canvases: [{
        width: 1800,
        height: 2400,
        panelReadingOrder: ["legacy_panel_001_001"],
        elements: [{
          id: "legacy_panel_001_001",
          transform: { x: 80, y: 120, width: 1640, height: 2160 },
          contentImage: { source: { shotId: "shot_1", candidateId: "candidate_1", candidateLockRevisionId: "lock_1", assetId: "asset_1" } },
        }],
      }],
    });
    expect(converted.documentDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(converted.sourceLockSetDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("refuses unresolved or mismatched legacy evidence instead of fabricating current source", () => {
    expect(() => convertLegacyChapterLayoutV1({
      projectId: "project_1",
      chapterId: "chapter_1",
      comicFormat: "vertical_scroll",
      fontAssetId: "font_1",
      legacyDocument: { pages: [{ width: 1080, height: 1920, placements: [{}] }] },
      sources: [],
    })).toThrow(/LEGACY_LAYOUT_SOURCE_COUNT_MISMATCH/);
  });

  it("sorts reading order without reassigning a legacy placement to another source", () => {
    const converted = convertLegacyChapterLayoutV1({
      projectId: "project_1",
      chapterId: "chapter_1",
      comicFormat: "vertical_scroll",
      fontAssetId: "font_1",
      legacyDocument: {
        pages: [{
          width: 1080,
          height: 1920,
          placements: [
            { order: 2, x: 0, y: 960, w: 1080, h: 960 },
            { order: 1, x: 0, y: 0, w: 1080, h: 960 },
          ],
        }],
      },
      sources: [
        { elementId: "placement_late", shotId: "shot_late", candidateId: "candidate_late", candidateLockRevisionId: "lock_late", assetId: "asset_late", assetSha256: sha, width: 1080, height: 960 },
        { elementId: "placement_early", shotId: "shot_early", candidateId: "candidate_early", candidateLockRevisionId: "lock_early", assetId: "asset_early", assetSha256: sha, width: 1080, height: 960 },
      ],
    });

    expect(converted.document.canvases[0]?.elements).toMatchObject([
      { transform: { y: 0 }, contentImage: { source: { shotId: "shot_early" } } },
      { transform: { y: 960 }, contentImage: { source: { shotId: "shot_late" } } },
    ]);
  });
});
