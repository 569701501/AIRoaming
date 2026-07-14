import type {
  LayoutInsetsV1,
  LayoutPresetIdV1,
  LayoutTransformV1,
  PanelFrameElementV1,
} from "./document.js";
import { normalizeLayoutNumber } from "./geometry.js";

export interface GenerateLayoutPresetInputV1 {
  presetId: LayoutPresetIdV1;
  presetVersion: 1;
  width: number;
  height: number;
  inset: LayoutInsetsV1;
  gap: number;
  panelIds: string[];
}

const PANEL_COUNTS: Record<LayoutPresetIdV1, number> = {
  single: 1,
  two_vertical: 2,
  two_horizontal: 2,
  three_focus: 3,
  four_panel: 4,
  dialogue_two: 2,
  action_focus: 3,
};

function transform(x: number, y: number, width: number, height: number): LayoutTransformV1 {
  return {
    x: normalizeLayoutNumber(x),
    y: normalizeLayoutNumber(y),
    width: normalizeLayoutNumber(width),
    height: normalizeLayoutNumber(height),
    rotation: 0,
    opacity: 1,
  };
}

function panel(id: string, index: number, frame: LayoutTransformV1): PanelFrameElementV1 {
  return {
    id,
    type: "panel_frame",
    name: `Panel ${index + 1}`,
    transform: frame,
    locked: false,
    hidden: false,
    shape: { kind: "rect", cornerRadius: 0 },
    border: { visible: true, color: "#111827FF", width: 8 },
    contentImage: null,
  };
}

export function generateLayoutPresetV1(input: GenerateLayoutPresetInputV1): PanelFrameElementV1[] {
  if (input.presetVersion !== 1) throw new Error("unsupported preset version");
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0) throw new Error("invalid preset dimensions");
  if (!Number.isFinite(input.gap) || input.gap < 0) throw new Error("invalid preset gap");
  const expected = PANEL_COUNTS[input.presetId];
  if (input.panelIds.length !== expected || new Set(input.panelIds).size !== expected || input.panelIds.some((id) => id.trim() === "")) {
    throw new Error(`preset ${input.presetId} requires ${expected} unique panel ids`);
  }
  const x = input.inset.left;
  const y = input.inset.top;
  const width = input.width - input.inset.left - input.inset.right;
  const height = input.height - input.inset.top - input.inset.bottom;
  const gap = input.gap;
  if (width <= 0 || height <= 0) throw new Error("preset inset consumes canvas");
  let frames: LayoutTransformV1[];
  switch (input.presetId) {
    case "single": frames = [transform(x, y, width, height)]; break;
    case "two_vertical": {
      const h = (height - gap) / 2;
      frames = [transform(x, y, width, h), transform(x, y + h + gap, width, h)];
      break;
    }
    case "two_horizontal":
    case "dialogue_two": {
      const w = (width - gap) / 2;
      frames = [transform(x, y, w, height), transform(x + w + gap, y, w, height)];
      break;
    }
    case "four_panel": {
      const w = (width - gap) / 2;
      const h = (height - gap) / 2;
      frames = [
        transform(x, y, w, h), transform(x + w + gap, y, w, h),
        transform(x, y + h + gap, w, h), transform(x + w + gap, y + h + gap, w, h),
      ];
      break;
    }
    case "three_focus": {
      const focus = (height - gap) * 0.62;
      const lower = height - gap - focus;
      const w = (width - gap) / 2;
      frames = [transform(x, y, width, focus), transform(x, y + focus + gap, w, lower), transform(x + w + gap, y + focus + gap, w, lower)];
      break;
    }
    case "action_focus": {
      const focus = (width - gap) * 0.65;
      const side = width - gap - focus;
      const h = (height - gap) / 2;
      frames = [transform(x, y, focus, height), transform(x + focus + gap, y, side, h), transform(x + focus + gap, y + h + gap, side, h)];
      break;
    }
  }
  return frames.map((frame, index) => panel(input.panelIds[index]!, index, frame));
}
