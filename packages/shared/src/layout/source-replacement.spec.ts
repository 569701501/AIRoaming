import { describe, expect, it } from "vitest";

import type { LayoutDocumentV1, LayoutDigest } from "./document.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import { digestCandidateImageSourceV1, projectLayoutSourceBindings } from "./digest.js";
import {
  buildLayoutSourceReplacementPreviewV1,
  parseCommitLayoutSourceReplacementRequestV1,
  parsePreviewLayoutSourceReplacementRequestV1,
} from "./source-replacement.js";

const shaA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as LayoutDigest;
const shaB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as LayoutDigest;

function source(variant: "a" | "b") {
  const unsigned = variant === "a"
    ? { shotId: "shot_1", candidateId: "candidate_a", candidateLockRevisionId: "lock_a", assetId: "asset_a" }
    : { shotId: "shot_1", candidateId: "candidate_b", candidateLockRevisionId: "lock_b", assetId: "asset_b" };
  return { ...unsigned, sourceDigest: digestCandidateImageSourceV1(unsigned, variant === "a" ? shaA : shaB) };
}

function document(): LayoutDocumentV1 {
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
    fontPolicy: { defaultFontAssetId: "font_400", fallbackFontAssetIds: [] },
    canvases: [{
      id: "page_1",
      kind: "page",
      name: "第 1 页",
      width: 1000,
      height: 1000,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: ["panel_1"],
      elements: [{
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
          name: "A",
          locked: false,
          hidden: false,
          source: source("a"),
          crop: { zoom: 1, offsetX: 80, offsetY: 0, rotation: 0, flipX: false, flipY: false },
        },
      }],
    }],
  };
}

describe("G5-M6 source replacement contract", () => {
  it("previews A→B deterministically and records an explicit crop decision", () => {
    const original = LayoutDocumentCodecV1.encode(document());
    const input = {
      schemaVersion: 1 as const,
      expectedWorkingCopyRowVersion: 7,
      expectedDocumentDigest: original.digest,
      replacements: [{ imageElementId: "image_1", cropMode: "preserve_normalized_crop" as const }],
    };
    const first = buildLayoutSourceReplacementPreviewV1({
      document: original.value,
      request: input,
      currentSources: [{ order: 1, source: source("b"), width: 600, height: 1200 }],
      sourceDimensions: { asset_a: { width: 1200, height: 600 } },
    });
    const second = buildLayoutSourceReplacementPreviewV1({
      document: original.value,
      request: input,
      currentSources: [{ order: 1, source: source("b"), width: 600, height: 1200 }],
      sourceDimensions: { asset_a: { width: 1200, height: 600 } },
    });

    expect(first.replacementDigest).toBe(second.replacementDigest);
    expect(first.resultDocumentDigest).toBe(second.resultDocumentDigest);
    expect(first.items).toMatchObject([{
      imageElementId: "image_1",
      from: { candidateLockRevisionId: "lock_a" },
      to: { candidateLockRevisionId: "lock_b" },
      cropMode: "preserve_normalized_crop",
      cropCompatibility: "review_required",
    }]);
    expect(first.items[0]?.warningCodes).toContain("CROP_ZOOM_ADJUSTED");
    expect(projectLayoutSourceBindings(first.resultDocument)).toMatchObject([{
      elementId: "image_1",
      candidateLockRevisionId: "lock_b",
      assetId: "asset_b",
    }]);
  });

  it("supports reset_cover and rejects ambiguous or tampered requests", () => {
    const encoded = LayoutDocumentCodecV1.encode(document());
    const request = parsePreviewLayoutSourceReplacementRequestV1({
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: 0,
      expectedDocumentDigest: encoded.digest,
      replacements: [{ imageElementId: "image_1", cropMode: "reset_cover" }],
    });
    const preview = buildLayoutSourceReplacementPreviewV1({
      document: encoded.value,
      request,
      currentSources: [{ order: 1, source: source("b"), width: 600, height: 1200 }],
      sourceDimensions: { asset_a: { width: 1200, height: 600 } },
    });
    expect(preview.items[0]?.resultCrop).toEqual({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flipX: false,
      flipY: false,
    });
    expect(() => parsePreviewLayoutSourceReplacementRequestV1({
      ...request,
      replacements: [...request.replacements, ...request.replacements],
    })).toThrow(/duplicate/i);
    expect(() => parseCommitLayoutSourceReplacementRequestV1({
      ...request,
      replacementDigest: preview.replacementDigest,
      resultDocumentDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      unknown: true,
    })).toThrow(/unknown field/i);
  });
});
