import type {
  LayoutCanvasV1,
  LayoutPresetIdV1,
  LayoutProfileV1,
  PanelImageElementV1,
} from "./document.js";
import { generateLayoutPresetV1 } from "./presets.js";
import type { LayoutSourceCatalogItemV1 } from "./working-copy.js";

export type LayoutBatchEntityKindV1 = "canvas" | "panel" | "image";

export interface LayoutBatchInitializationInputV1 {
  profile: LayoutProfileV1;
  sources: readonly LayoutSourceCatalogItemV1[];
  createId: (kind: LayoutBatchEntityKindV1) => string;
}

function presetForCount(count: number): LayoutPresetIdV1 {
  if (count === 1) return "single";
  if (count === 2) return "two_horizontal";
  if (count === 3) return "three_focus";
  return "four_panel";
}

function panelImage(
  item: LayoutSourceCatalogItemV1,
  createId: LayoutBatchInitializationInputV1["createId"],
): PanelImageElementV1 {
  return {
    id: createId("image"),
    type: "image",
    placement: "panel_content",
    name: `镜头 ${item.order}`,
    locked: false,
    hidden: false,
    source: { ...item.source },
    crop: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flipX: false,
      flipY: false,
    },
  };
}

export function initializeLayoutCanvasesFromSourcesV1(
  input: LayoutBatchInitializationInputV1,
): LayoutCanvasV1[] {
  const { profile, sources, createId } = input;
  const groupSize = profile.kind === "paged" ? 4 : 1;
  const canvases: LayoutCanvasV1[] = [];
  for (let offset = 0; offset < sources.length; offset += groupSize) {
    const group = sources.slice(offset, offset + groupSize);
    const index = canvases.length;
    const canvas: LayoutCanvasV1 = {
      id: createId("canvas"),
      kind: profile.kind === "paged" ? "page" : "strip_section",
      name: profile.kind === "paged" ? `第 ${index + 1} 页` : `第 ${index + 1} 段`,
      width: profile.width,
      height: profile.kind === "paged" ? profile.height : profile.defaultSectionHeight,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: [],
      elements: [],
    };
    const presetId = presetForCount(group.length);
    const panels = generateLayoutPresetV1({
      presetId,
      presetVersion: 1,
      width: canvas.width,
      height: canvas.height,
      inset: profile.kind === "paged"
        ? profile.safeArea
        : { top: 64, right: profile.safeInsetX, bottom: 64, left: profile.safeInsetX },
      gap: profile.kind === "paged" ? 48 : 24,
      panelIds: Array.from({ length: group.length }, () => createId("panel")),
    }).map((panel, panelIndex) => ({
      ...panel,
      name: `画格 ${panelIndex + 1}`,
      contentImage: panelImage(group[panelIndex]!, createId),
    }));
    canvas.elements = panels;
    canvas.panelReadingOrder = panels.map((panel) => panel.id);
    canvases.push(canvas);
  }
  return canvases;
}
