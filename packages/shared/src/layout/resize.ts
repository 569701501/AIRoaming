import { LayoutDocumentCodecV1 } from "./codec.js";
import { normalizeLayoutNumber } from "./geometry.js";
import type {
  BalloonElementV1,
  CoverCropV1,
  LayoutCanvasV1,
  LayoutDocumentV1,
  LayoutProfileV1,
  LayoutTopLevelElementV1,
  RichTextDocumentV1,
} from "./document.js";

export type LayoutProfileResizeModeV1 = "keep_coordinates" | "scale_uniform";

export interface LayoutProfileResizePreviewV1 {
  schemaVersion: 1;
  mode: LayoutProfileResizeModeV1;
  widthScale: number;
  heightScale: number;
  profile: LayoutProfileV1;
  canvases: LayoutCanvasV1[];
}

function scaled(value: number, factor: number): number {
  return normalizeLayoutNumber(value * factor);
}

function scaleCrop(crop: CoverCropV1, factor: number): CoverCropV1 {
  return {
    ...crop,
    offsetX: scaled(crop.offsetX, factor),
    offsetY: scaled(crop.offsetY, factor),
  };
}

function scaleRichText(value: RichTextDocumentV1, factor: number): RichTextDocumentV1 {
  return {
    ...structuredClone(value),
    paragraphs: value.paragraphs.map((paragraph) => ({
      ...paragraph,
      runs: paragraph.runs.map((run) => ({
        ...run,
        fontSize: scaled(run.fontSize, factor),
        letterSpacing: scaled(run.letterSpacing, factor),
        stroke: run.stroke ? { ...run.stroke, width: scaled(run.stroke.width, factor) } : null,
      })),
    })),
  };
}

function scaleBalloon(value: BalloonElementV1, factor: number): BalloonElementV1 {
  return {
    ...value,
    transform: {
      ...value.transform,
      x: scaled(value.transform.x, factor),
      y: scaled(value.transform.y, factor),
      width: scaled(value.transform.width, factor),
      height: scaled(value.transform.height, factor),
    },
    strokeWidth: scaled(value.strokeWidth, factor),
    padding: {
      top: scaled(value.padding.top, factor),
      right: scaled(value.padding.right, factor),
      bottom: scaled(value.padding.bottom, factor),
      left: scaled(value.padding.left, factor),
    },
    tail: {
      ...value.tail,
      targetX: scaled(value.tail.targetX, factor),
      targetY: scaled(value.tail.targetY, factor),
      baseWidth: scaled(value.tail.baseWidth, factor),
    },
    richText: scaleRichText(value.richText, factor),
  };
}

function scaleElement(value: LayoutTopLevelElementV1, factor: number): LayoutTopLevelElementV1 {
  if (value.type === "balloon") return scaleBalloon(value, factor);
  const transform = {
    ...value.transform,
    x: scaled(value.transform.x, factor),
    y: scaled(value.transform.y, factor),
    width: scaled(value.transform.width, factor),
    height: scaled(value.transform.height, factor),
  };
  if (value.type === "panel_frame") {
    return {
      ...value,
      transform,
      shape: { ...value.shape, cornerRadius: scaled(value.shape.cornerRadius, factor) },
      border: { ...value.border, width: scaled(value.border.width, factor) },
      contentImage: value.contentImage ? {
        ...value.contentImage,
        crop: scaleCrop(value.contentImage.crop, factor),
      } : null,
    };
  }
  if (value.type === "free_image") {
    return {
      ...value,
      transform,
      display: value.display.mode === "cover"
        ? { mode: "cover", crop: scaleCrop(value.display.crop, factor) }
        : { mode: "contain" },
    };
  }
  return { ...value, transform, richText: scaleRichText(value.richText, factor) };
}

function pagePreset(width: number, height: number): "portrait_3_4" | "landscape_4_3" | "square_1_1" | "custom" {
  if (width === 1800 && height === 2400) return "portrait_3_4";
  if (width === 2400 && height === 1800) return "landscape_4_3";
  if (width === 1800 && height === 1800) return "square_1_1";
  return "custom";
}

export function previewLayoutProfileResizeV1(input: {
  document: LayoutDocumentV1;
  width: number;
  height: number;
  mode: LayoutProfileResizeModeV1;
}): LayoutProfileResizePreviewV1 {
  const document = LayoutDocumentCodecV1.parseAndNormalize(input.document);
  const width = normalizeLayoutNumber(input.width);
  const height = normalizeLayoutNumber(input.height);
  const widthScale = normalizeLayoutNumber(width / document.profile.width);
  const referenceHeight = document.profile.kind === "paged"
    ? document.profile.height
    : document.profile.defaultSectionHeight;
  const heightScale = normalizeLayoutNumber(height / referenceHeight);
  const uniformScale = input.mode === "scale_uniform"
    ? document.profile.kind === "paged" ? Math.min(widthScale, heightScale) : widthScale
    : 1;
  const profile: LayoutProfileV1 = document.profile.kind === "paged"
    ? {
        ...document.profile,
        presetId: pagePreset(width, height),
        width,
        height,
        safeArea: input.mode === "scale_uniform" ? {
          top: scaled(document.profile.safeArea.top, uniformScale),
          right: scaled(document.profile.safeArea.right, uniformScale),
          bottom: scaled(document.profile.safeArea.bottom, uniformScale),
          left: scaled(document.profile.safeArea.left, uniformScale),
        } : structuredClone(document.profile.safeArea),
      }
    : {
        ...document.profile,
        presetId: width === 1080 && height === 1920 ? "webtoon_1080" : "custom",
        width,
        defaultSectionHeight: height,
        safeInsetX: input.mode === "scale_uniform"
          ? scaled(document.profile.safeInsetX, uniformScale)
          : document.profile.safeInsetX,
      };
  const canvases = document.canvases.map((canvas) => ({
    ...canvas,
    width,
    height: document.profile.kind === "paged"
      ? height
      : input.mode === "scale_uniform" ? scaled(canvas.height, uniformScale) : canvas.height,
    elements: input.mode === "scale_uniform"
      ? canvas.elements.map((element) => scaleElement(element, uniformScale))
      : structuredClone(canvas.elements),
  }));
  const validated = LayoutDocumentCodecV1.parseAndNormalize({ ...document, profile, canvases });
  return {
    schemaVersion: 1,
    mode: input.mode,
    widthScale,
    heightScale,
    profile: validated.profile,
    canvases: validated.canvases,
  };
}
