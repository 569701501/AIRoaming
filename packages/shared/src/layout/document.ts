export type LayoutDigest = `sha256:${string}`;

export interface LayoutDocumentV1 {
  schemaVersion: 1;
  kind: "layout_document_v1";
  projectId: string;
  chapterId: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  profile: PageProfileV1 | StripProfileV1;
  fontPolicy: LayoutFontPolicyV1;
  canvases: LayoutCanvasV1[];
}

export interface PageProfileV1 {
  kind: "paged";
  presetId: "portrait_3_4" | "landscape_4_3" | "square_1_1" | "custom";
  width: number;
  height: number;
  safeArea: LayoutInsetsV1;
  panelReadingDirection: "ltr_ttb" | "rtl_ttb";
}

export interface StripProfileV1 {
  kind: "vertical_strip";
  presetId: "webtoon_1080" | "custom";
  width: number;
  defaultSectionHeight: number;
  safeInsetX: number;
}

export type LayoutProfileV1 = PageProfileV1 | StripProfileV1;

export interface LayoutInsetsV1 {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutFontPolicyV1 {
  defaultFontAssetId: string;
  fallbackFontAssetIds: string[];
}

export interface LayoutCanvasV1 {
  id: string;
  kind: "page" | "strip_section";
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  panelReadingOrder: string[];
  elements: LayoutTopLevelElementV1[];
}

export interface LayoutElementBaseV1 {
  id: string;
  type: "panel_frame" | "free_image" | "text" | "balloon";
  name: string;
  transform: LayoutTransformV1;
  locked: boolean;
  hidden: boolean;
}

export interface LayoutTransformV1 {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface CandidateImageSourceV1 {
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  sourceDigest: LayoutDigest;
}

export interface CoverCropV1 {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface PanelImageElementV1 {
  id: string;
  type: "image";
  placement: "panel_content";
  name: string;
  locked: boolean;
  hidden: boolean;
  source: CandidateImageSourceV1;
  crop: CoverCropV1;
}

export interface PanelFrameElementV1 extends LayoutElementBaseV1 {
  type: "panel_frame";
  shape: { kind: "rect" | "rounded_rect"; cornerRadius: number };
  border: { visible: boolean; color: string; width: number };
  contentImage: PanelImageElementV1 | null;
}

export interface FreeImageElementV1 extends LayoutElementBaseV1 {
  type: "free_image";
  source: CandidateImageSourceV1;
  display: { mode: "contain" } | { mode: "cover"; crop: CoverCropV1 };
}

export type LayoutWritingModeV1 = "horizontal-tb" | "vertical-rl";
export type LayoutTextOrientationV1 = "mixed" | "upright";
export type RichTextAlignV1 = "start" | "center" | "end";
export type RichTextFontWeightV1 = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface RichTextRunV1 {
  text: string;
  fontAssetId: string;
  fontSize: number;
  fontWeight: RichTextFontWeightV1;
  fontStyle: "normal" | "italic";
  color: string;
  letterSpacing: number;
  stroke: null | { color: string; width: number };
}

export interface RichTextParagraphV1 {
  align: RichTextAlignV1;
  lineHeight: number;
  runs: RichTextRunV1[];
}

export interface RichTextDocumentV1 {
  schemaVersion: 1;
  writingMode: LayoutWritingModeV1;
  textOrientation: LayoutTextOrientationV1;
  paragraphs: RichTextParagraphV1[];
}

export interface TextElementV1 extends LayoutElementBaseV1 {
  type: "text";
  semantic: "title" | "caption" | "sfx" | "custom";
  verticalAlign: "start" | "center" | "end";
  richText: RichTextDocumentV1;
}

export interface BalloonTailV1 {
  enabled: boolean;
  rootRatio: number;
  targetX: number;
  targetY: number;
  baseWidth: number;
}

export interface BalloonElementV1 extends LayoutElementBaseV1 {
  type: "balloon";
  balloonKind: "speech" | "thought" | "shout" | "caption";
  sourceShotId: string | null;
  speakerCharacterId: string | null;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  padding: LayoutInsetsV1;
  verticalAlign: "start" | "center" | "end";
  tail: BalloonTailV1;
  richText: RichTextDocumentV1;
}

export type LayoutTopLevelElementV1 =
  | PanelFrameElementV1
  | FreeImageElementV1
  | TextElementV1
  | BalloonElementV1;

export interface LayoutSourceBindingProjectionV1 {
  elementId: string;
  role: "candidate_image";
  order: number;
  shotId: string;
  candidateId: string;
  candidateLockRevisionId: string;
  assetId: string;
  sourceDigest: LayoutDigest;
}

export type LayoutPresetIdV1 =
  | "single"
  | "two_vertical"
  | "two_horizontal"
  | "three_focus"
  | "four_panel"
  | "dialogue_two"
  | "action_focus";

export interface PagedPublicationProfileV1 {
  schemaVersion: 1;
  kind: "paged_publication";
  outputScale: 1 | 2;
  includePdf: boolean;
  pdfPixelDpi: 96;
}

export interface VerticalPublicationProfileV1 {
  schemaVersion: 1;
  kind: "vertical_publication";
  outputScale: 1 | 2;
  maxSliceHeightPx: number;
  cutPolicy: "prefer_section_boundary_then_exact";
  includeLongPng: boolean;
}

export type LayoutPublicationProfileV1 =
  | PagedPublicationProfileV1
  | VerticalPublicationProfileV1;

export interface EncodedLayoutValue<T> {
  schemaVersion: 1;
  value: T;
  canonical: string;
  canonicalBytes: Uint8Array;
  digest: LayoutDigest;
}
