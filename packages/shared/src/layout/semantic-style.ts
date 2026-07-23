import type {
  BalloonElementV1,
  LayoutFontPolicyV1,
  RichTextFontWeightV1,
} from "./document.js";

export type LayoutSemanticTextRoleV1 = BalloonElementV1["balloonKind"];

export interface LayoutTypographyFaceV1 {
  fontAssetId: string;
  fontWeight: RichTextFontWeightV1;
  fontStyle: "normal" | "italic";
}

export interface LayoutTypographyPresetV1 {
  policyVersion: "layout_typography_preset_v1";
  speech: LayoutTypographyFaceV1;
  thought: LayoutTypographyFaceV1;
  shout: LayoutTypographyFaceV1;
  caption: LayoutTypographyFaceV1;
}

export interface LayoutBalloonVisualPresetV1 {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  textColor: string;
  tailAllowed: boolean;
}

export function legacyLayoutTypographyPresetV1(
  fontPolicy: LayoutFontPolicyV1,
): LayoutTypographyPresetV1 {
  const regular: LayoutTypographyFaceV1 = {
    fontAssetId: fontPolicy.defaultFontAssetId,
    fontWeight: 400,
    fontStyle: "normal",
  };
  return {
    policyVersion: "layout_typography_preset_v1",
    speech: { ...regular },
    thought: { ...regular },
    shout: {
      fontAssetId: fontPolicy.defaultFontAssetId,
      fontWeight: 700,
      fontStyle: "normal",
    },
    caption: { ...regular },
  };
}

export function layoutTypographyFaceForRoleV1(
  preset: LayoutTypographyPresetV1,
  role: LayoutSemanticTextRoleV1,
): LayoutTypographyFaceV1 {
  return preset[role];
}

export function inferLayoutSemanticTextRoleV1(
  kind: BalloonElementV1["balloonKind"],
  text: string,
): LayoutSemanticTextRoleV1 {
  if (kind !== "speech") return kind;
  const normalized = text.trim();
  const startsHesitant = /^(?:…{2,}|\.{3,})/u.test(normalized);
  const exclamationCount = (normalized.match(/[！!]/gu) ?? []).length;
  const forcefulEnding = /(?:——|—{2,})[！!]?$/u.test(normalized);
  if (
    !startsHesitant
    && normalized.length <= 28
    && (exclamationCount >= 1 || forcefulEnding)
  ) {
    return "shout";
  }
  if (
    startsHesitant
    && exclamationCount === 0
    && normalized.length <= 18
  ) {
    return "thought";
  }
  return "speech";
}

export function resolveLayoutBalloonVisualRoleV1(
  element: Pick<
    BalloonElementV1,
    "balloonKind" | "fillColor" | "strokeColor"
  >,
): LayoutSemanticTextRoleV1 {
  if (element.balloonKind !== "speech") return element.balloonKind;
  const fill = element.fillColor.toUpperCase();
  const stroke = element.strokeColor.toUpperCase();
  const thought = layoutBalloonVisualPresetV1("thought", "vertical_scroll");
  if (
    fill === thought.fillColor.toUpperCase()
    && stroke === thought.strokeColor.toUpperCase()
  ) return "thought";
  const shout = layoutBalloonVisualPresetV1("shout", "vertical_scroll");
  if (
    fill === shout.fillColor.toUpperCase()
    && stroke === shout.strokeColor.toUpperCase()
  ) return "shout";
  return "speech";
}

export function layoutBalloonVisualPresetV1(
  kind: BalloonElementV1["balloonKind"],
  format: "vertical_scroll" | "paged_comic",
): LayoutBalloonVisualPresetV1 {
  const page = format === "paged_comic";
  if (kind === "thought") {
    return {
      fillColor: "#FFFDF5FF",
      strokeColor: "#374151FF",
      strokeWidth: page ? 5 : 4,
      textColor: "#374151FF",
      tailAllowed: true,
    };
  }
  if (kind === "shout") {
    return {
      fillColor: "#FFF7EDFF",
      strokeColor: "#B91C1CFF",
      strokeWidth: page ? 8 : 6,
      textColor: "#7F1D1DFF",
      tailAllowed: true,
    };
  }
  if (kind === "caption") {
    return {
      fillColor: "#111827EE",
      strokeColor: "#111827FF",
      strokeWidth: page ? 4 : 3,
      textColor: "#FFFFFFFF",
      tailAllowed: false,
    };
  }
  return {
    fillColor: "#FFFFFFFF",
    strokeColor: "#111827FF",
    strokeWidth: page ? 6 : 4,
    textColor: "#111827FF",
    tailAllowed: true,
  };
}
