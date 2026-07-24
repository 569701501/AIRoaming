import type {
  BalloonElementV1,
  EditorCommandBatchV1,
  EditorCommandV1,
  LayoutFontCatalogItemV1,
  TextElementV1,
} from "@airoaming/shared";

export type LayoutSfxPresetV1 = "impact" | "electric";

function presetId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function buildLayoutSfxPresetBatchV1(input: {
  canvasId: string;
  element: TextElementV1;
  fontCatalog: readonly LayoutFontCatalogItemV1[];
  preset: LayoutSfxPresetV1;
}): EditorCommandBatchV1 {
  const richText = structuredClone(input.element.richText);
  const desiredWeight = input.preset === "impact" ? 900 : 700;
  for (const paragraph of richText.paragraphs) {
    for (const run of paragraph.runs) {
      const current = input.fontCatalog.find((font) => font.assetId === run.fontAssetId);
      const face = current
        ? input.fontCatalog.find((font) => (
            font.metadata.familyName === current.metadata.familyName
            && font.metadata.face.weight === desiredWeight
            && font.metadata.face.style === "normal"
          ))
        : undefined;
      if (face) {
        run.fontAssetId = face.assetId;
        run.fontWeight = face.metadata.face.weight;
        run.fontStyle = face.metadata.face.style;
      }
      run.color = input.preset === "impact" ? "#FFF7EDFF" : "#E0F2FEFF";
      run.stroke = {
        color: input.preset === "impact" ? "#7F1D1DFF" : "#1E3A8AFF",
        width: Math.max(
          run.stroke?.width ?? 0,
          Math.min(12, Math.max(2, run.fontSize * 0.08)),
        ),
      };
    }
  }
  const label = input.preset === "impact"
    ? "应用冲击拟声预设"
    : "应用电光拟声预设";
  const rotation = input.preset === "impact" ? -8 : 6;
  return {
    schemaVersion: 1,
    batchId: presetId("sfx_preset_batch"),
    label,
    commands: [
      {
        schemaVersion: 1,
        commandId: presetId("text_semantic"),
        type: "text.set_semantic",
        label: "标记为拟声字",
        payload: {
          canvasId: input.canvasId,
          elementId: input.element.id,
          semantic: "sfx",
        },
      },
      {
        schemaVersion: 1,
        commandId: presetId("text_document"),
        type: "text.replace_document",
        label: "应用拟声字富文本样式",
        payload: {
          canvasId: input.canvasId,
          elementId: input.element.id,
          richText,
        },
      },
      {
        schemaVersion: 1,
        commandId: presetId("text_transform"),
        type: "element.set_transform",
        label: "应用拟声字旋转",
        payload: {
          canvasId: input.canvasId,
          elementId: input.element.id,
          transform: {
            ...input.element.transform,
            rotation,
          },
        },
      },
    ],
  };
}

export function buildBalloonVisualStyleCommandV1(input: {
  canvasId: string;
  element: BalloonElementV1;
  patch: Partial<Pick<
    BalloonElementV1,
    "fillColor" | "strokeColor" | "strokeWidth" | "padding" | "verticalAlign"
  >>;
  label: string;
}): EditorCommandV1<"balloon.set_visual_style"> {
  return {
    schemaVersion: 1,
    commandId: presetId("balloon_visual_style"),
    type: "balloon.set_visual_style",
    label: input.label,
    payload: {
      canvasId: input.canvasId,
      elementId: input.element.id,
      fillColor: input.patch.fillColor ?? input.element.fillColor,
      strokeColor: input.patch.strokeColor ?? input.element.strokeColor,
      strokeWidth: input.patch.strokeWidth ?? input.element.strokeWidth,
      padding: input.patch.padding
        ? structuredClone(input.patch.padding)
        : structuredClone(input.element.padding),
      verticalAlign: input.patch.verticalAlign ?? input.element.verticalAlign,
    },
  };
}
