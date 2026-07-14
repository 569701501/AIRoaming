import { describe, expect, it } from "vitest";

import {
  projectVisibleShotPlacementsV1,
  type CandidateImageSourceV1,
  type LayoutDocumentV1,
} from "./index.js";

const digest = `sha256:${"a".repeat(64)}` as const;

function source(shotId: string): CandidateImageSourceV1 {
  return {
    shotId,
    candidateId: `candidate_${shotId}`,
    candidateLockRevisionId: `lock_${shotId}`,
    assetId: `asset_${shotId}`,
    sourceDigest: digest,
  };
}

describe("G5-M4 visible Shot placement projection", () => {
  it("counts only visible in-canvas panel/free images", () => {
    const document: LayoutDocumentV1 = {
      schemaVersion: 1,
      kind: "layout_document_v1",
      projectId: "project_a",
      chapterId: "chapter_a",
      comicFormat: "paged_comic",
      profile: {
        kind: "paged",
        presetId: "portrait_3_4",
        width: 1800,
        height: 2400,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb",
      },
      fontPolicy: { defaultFontAssetId: "font_a", fallbackFontAssetIds: [] },
      canvases: [{
        id: "page_1",
        kind: "page",
        name: "Page 1",
        width: 1800,
        height: 2400,
        backgroundColor: "#FFFFFFFF",
        panelReadingOrder: ["panel_visible", "panel_child_hidden"],
        elements: [
          {
            id: "panel_visible",
            type: "panel_frame",
            name: "Visible panel",
            transform: { x: 0, y: 0, width: 600, height: 800, rotation: 0, opacity: 1 },
            locked: false,
            hidden: false,
            shape: { kind: "rect", cornerRadius: 0 },
            border: { visible: true, color: "#000000FF", width: 4 },
            contentImage: {
              id: "image_visible",
              type: "image",
              placement: "panel_content",
              name: "Visible",
              locked: false,
              hidden: false,
              source: source("visible"),
              crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
            },
          },
          {
            id: "panel_child_hidden",
            type: "panel_frame",
            name: "Hidden child",
            transform: { x: 650, y: 0, width: 600, height: 800, rotation: 0, opacity: 1 },
            locked: false,
            hidden: false,
            shape: { kind: "rect", cornerRadius: 0 },
            border: { visible: true, color: "#000000FF", width: 4 },
            contentImage: {
              id: "image_hidden",
              type: "image",
              placement: "panel_content",
              name: "Hidden",
              locked: false,
              hidden: true,
              source: source("child_hidden"),
              crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
            },
          },
          {
            id: "free_transparent",
            type: "free_image",
            name: "Transparent",
            transform: { x: 0, y: 900, width: 600, height: 800, rotation: 0, opacity: 0 },
            locked: false,
            hidden: false,
            source: source("transparent"),
            display: { mode: "contain" },
          },
          {
            id: "free_outside",
            type: "free_image",
            name: "Outside",
            transform: { x: 1900, y: 0, width: 600, height: 800, rotation: 0, opacity: 1 },
            locked: false,
            hidden: false,
            source: source("outside"),
            display: { mode: "contain" },
          },
        ],
      }],
    };

    expect(projectVisibleShotPlacementsV1(document)).toEqual({
      visible: [{ canvasId: "page_1", elementId: "panel_visible", role: "panel_content" }],
    });
  });
});
