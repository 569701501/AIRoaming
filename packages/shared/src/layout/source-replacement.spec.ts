import { describe, expect, it } from "vitest";

import type { LayoutDocumentV1, LayoutDigest } from "./document.js";
import {
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  upgradeLayoutWorkingCopyV1ToV2,
} from "./automation.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
  projectLayoutSourceBindings,
} from "./digest.js";
import {
  buildLayoutSourceReplacementPreviewV1,
  buildLayoutSourceReplacementPreviewV2,
  parseCommitLayoutSourceReplacementRequestV1,
  parsePreviewLayoutSourceReplacementRequestV1,
  parsePreviewLayoutSourceReplacementRequestV2,
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

  it("expands a V2 replacement to every appearance of the selected shot and preserves automation", () => {
    const visible = document();
    visible.canvases[0]!.elements.push({
      id: "image_free_1",
      type: "free_image",
      name: "A duplicate",
      transform: { x: 20, y: 20, width: 200, height: 100, rotation: 0, opacity: 1 },
      locked: false,
      hidden: false,
      source: source("a"),
      display: {
        mode: "cover",
        crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
      },
    });
    const documentV2 = upgradeLayoutWorkingCopyV1ToV2(visible);
    documentV2.automation.composition = {
      compositionDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      compositionPolicyVersion: "layout_composition_v1",
      storyboardVersionId: "storyboard_revision_1",
      storyboardDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      sourceLockSetDigest: digestLayoutSourceLockSet(visible, ["shot_1"])!,
      visualAnalysisSetDigest: null,
      mode: "rule_fallback",
    };
    const originalComposition = structuredClone(documentV2.automation.composition);
    const originalProtections = structuredClone(documentV2.automation.protections);
    const revision = LayoutDocumentCodecV2.encode(documentV2);
    const visibleDigest = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(documentV2)).digest;
    const request = parsePreviewLayoutSourceReplacementRequestV2({
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: 3,
      expectedRevisionDocumentDigest: revision.digest,
      expectedVisibleDocumentDigest: visibleDigest,
      replacements: [{ imageElementId: "image_1", cropMode: "reset_cover" }],
    });
    const preview = buildLayoutSourceReplacementPreviewV2({
      document: documentV2,
      request,
      currentSources: [{ order: 1, source: source("b"), width: 600, height: 1200 }],
      sourceDimensions: { asset_a: { width: 1200, height: 600 } },
    });

    expect(preview.items.map((item) => item.imageElementId)).toEqual(["image_1", "image_free_1"]);
    expect(preview.items.map((item) => item.selectionOrigin)).toEqual(["requested", "same_shot_expansion"]);
    expect(preview.commandBatch.commands).toHaveLength(1);
    expect(preview.commandBatch.commands[0]).toMatchObject({
      schemaVersion: 2,
      actor: "user",
      type: "layout.replace_sources",
      payload: {
        replacements: [
          { canvasId: "page_1", elementId: "panel_1", source: { candidateLockRevisionId: "lock_b" } },
          { canvasId: "page_1", elementId: "image_free_1", source: { candidateLockRevisionId: "lock_b" } },
        ],
      },
    });
    expect(preview.resultDocument.automation.dialogueBindings).toEqual(documentV2.automation.dialogueBindings);
    expect(preview.resultDocument.automation.composition).toEqual(originalComposition);
    expect(preview.resultDocument.automation.protections).toEqual(expect.arrayContaining(originalProtections));
    const resultBindings = projectLayoutSourceBindings(
      projectLayoutDocumentV2ToV1(preview.resultDocument),
    );
    expect(resultBindings.every((binding) => binding.candidateLockRevisionId === "lock_b")).toBe(true);
    expect(preview.resultRevisionDocumentDigest).toBe(LayoutDocumentCodecV2.encode(preview.resultDocument).digest);
    expect(preview.resultVisibleDocumentDigest).toBe(
      LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(preview.resultDocument)).digest,
    );
  });

  it("rejects mixed crop decisions for appearances of the same V2 shot", () => {
    const visible = document();
    visible.canvases[0]!.elements.push({
      id: "image_free_1",
      type: "free_image",
      name: "A duplicate",
      transform: { x: 20, y: 20, width: 200, height: 100, rotation: 0, opacity: 1 },
      locked: false,
      hidden: false,
      source: source("a"),
      display: { mode: "contain" },
    });
    const documentV2 = upgradeLayoutWorkingCopyV1ToV2(visible);
    const revision = LayoutDocumentCodecV2.encode(documentV2);
    const visibleDigest = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(documentV2)).digest;
    expect(() => buildLayoutSourceReplacementPreviewV2({
      document: documentV2,
      request: parsePreviewLayoutSourceReplacementRequestV2({
        schemaVersion: 2,
        expectedWorkingCopyRowVersion: 3,
        expectedRevisionDocumentDigest: revision.digest,
        expectedVisibleDocumentDigest: visibleDigest,
        replacements: [
          { imageElementId: "image_1", cropMode: "reset_cover" },
          { imageElementId: "image_free_1", cropMode: "preserve_normalized_crop" },
        ],
      }),
      currentSources: [{ order: 1, source: source("b"), width: 600, height: 1200 }],
      sourceDimensions: { asset_a: { width: 1200, height: 600 } },
    })).toThrow(/same shot.*crop mode/i);
  });
});
