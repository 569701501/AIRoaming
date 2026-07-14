import { describe, expect, it } from "vitest";

import type { LayoutDigest, LayoutDocumentV1 } from "./document.js";
import { digestCandidateImageSourceV1 } from "./digest.js";
import type { LayoutFontCatalogItemV1 } from "./font.js";
import { runLayoutPreflightV1 } from "./preflight.js";

const imageSha = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as LayoutDigest;
const fontSha = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as LayoutDigest;
const cmapDigest = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as LayoutDigest;

const unsignedSource = {
  shotId: "shot_1",
  candidateId: "candidate_1",
  candidateLockRevisionId: "lock_1",
  assetId: "asset_1",
};
const currentSource = { ...unsignedSource, sourceDigest: digestCandidateImageSourceV1(unsignedSource, imageSha) };
const font: LayoutFontCatalogItemV1 = {
  assetId: "font_400",
  sha256: fontSha,
  bytes: 100,
  mimeType: "font/woff2",
  metadata: {
    schemaVersion: 1,
    kind: "layout_font_asset_v1",
    packageId: "font@1",
    familyName: "Test",
    displayName: "Test",
    face: { weight: 400, style: "normal" },
    format: "woff2",
    license: { spdx: "OFL-1.1", sourceUrl: "https://example.com/font", embeddingAllowed: true },
    cmap: { digest: cmapDigest, codePointCount: 95, ranges: [[0x20, 0x7e]] },
  },
};

function document(text = "OK"): LayoutDocumentV1 {
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: "project_1",
    chapterId: "chapter_1",
    comicFormat: "paged_comic",
    profile: {
      kind: "paged",
      presetId: "custom",
      width: 1000,
      height: 1000,
      safeArea: { top: 40, right: 40, bottom: 40, left: 40 },
      panelReadingDirection: "ltr_ttb",
    },
    fontPolicy: { defaultFontAssetId: font.assetId, fallbackFontAssetIds: [] },
    canvases: [{
      id: "page_1",
      kind: "page",
      name: "第 1 页",
      width: 1000,
      height: 1000,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: ["panel_1"],
      elements: [
        {
          id: "panel_1",
          type: "panel_frame",
          name: "画格",
          transform: { x: 100, y: 100, width: 800, height: 800, rotation: 0, opacity: 1 },
          locked: false,
          hidden: false,
          shape: { kind: "rect", cornerRadius: 0 },
          border: { visible: true, color: "#000000FF", width: 4 },
          contentImage: {
            id: "image_1",
            type: "image",
            placement: "panel_content",
            name: "图片",
            locked: false,
            hidden: false,
            source: currentSource,
            crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
          },
        },
        {
          id: "text_1",
          type: "text",
          name: "文字",
          semantic: "caption",
          transform: { x: 120, y: 120, width: 400, height: 100, rotation: 0, opacity: 1 },
          locked: false,
          hidden: false,
          verticalAlign: "start",
          richText: {
            schemaVersion: 1,
            writingMode: "horizontal-tb",
            textOrientation: "mixed",
            paragraphs: [{
              align: "start",
              lineHeight: 1.2,
              runs: [{
                text,
                fontAssetId: font.assetId,
                fontSize: 32,
                fontWeight: 400,
                fontStyle: "normal",
                color: "#111111FF",
                letterSpacing: 0,
                stroke: null,
              }],
            }],
          },
        },
      ],
    }],
  };
}

function run(value: LayoutDocumentV1, source = currentSource) {
  return runLayoutPreflightV1({
    document: value,
    target: {
      kind: "working_copy",
      id: "wc_1",
      documentDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      rowVersion: 3,
    },
    currentSources: [{ order: 1, source, width: 1200, height: 1200 }],
    imageAssets: { asset_1: { assetId: "asset_1", sha256: imageSha, width: 1200, height: 1200, ready: true } },
    fontCatalog: [font],
    profile: null,
  });
}

describe("G5-M6 layout preflight", () => {
  it("is stable and ready for a valid current document", () => {
    const first = run(document());
    const second = run(document());
    expect(first.status).toBe("ready");
    expect(first.issues).toEqual([]);
    expect(first.preflightDigest).toBe(second.preflightDigest);
    expect(first.currentLockSetDigest).toBe(first.sourceLockSetDigest);
  });

  it("locates stale source, missing glyph and text overflow without localized text in digests", () => {
    const value = document("🙂".repeat(40));
    const nextUnsigned = { ...unsignedSource, candidateId: "candidate_2", candidateLockRevisionId: "lock_2", assetId: "asset_2" };
    const next = { ...nextUnsigned, sourceDigest: digestCandidateImageSourceV1(nextUnsigned, imageSha) };
    const report = run(value, next);
    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "FONT_GLYPH_MISSING",
      "SOURCE_STALE",
      "TEXT_OVERFLOW",
    ]));
    expect(report.issues.find((issue) => issue.code === "TEXT_OVERFLOW")?.blockingScopes).toEqual(["export"]);
    expect(report.issues.find((issue) => issue.code === "TEXT_OVERFLOW")?.requiresAcknowledgement).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/message|时间|文案/i);
  });

  it("reports visibility, safe-area and effective-resolution problems with stable issue keys", () => {
    const value = document();
    const panel = value.canvases[0]!.elements[0]!;
    panel.transform = { ...panel.transform, x: -700, width: 2400, height: 2400 };
    const report = runLayoutPreflightV1({
      document: value,
      target: {
        kind: "layout_revision",
        id: "revision_1",
        documentDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        rowVersion: null,
      },
      currentSources: [{ order: 1, source: currentSource, width: 1200, height: 1200 }],
      imageAssets: { asset_1: { assetId: "asset_1", sha256: imageSha, width: 1200, height: 1200, ready: true } },
      fontCatalog: [font],
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 2, includePdf: true, pdfPixelDpi: 96 },
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "ELEMENT_PARTLY_OUTSIDE_SAFE_AREA",
      "IMAGE_EFFECTIVE_RESOLUTION_CRITICAL",
    ]));
    expect(new Set(report.issues.map((issue) => issue.issueKey)).size).toBe(report.issues.length);
  });
});
