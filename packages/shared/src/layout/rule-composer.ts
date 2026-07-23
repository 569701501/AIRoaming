import { digestCanonicalJson } from "../versioning/canonical-json.js";
import { StoryboardDocumentCodecV2 } from "../versioning/document-codec.js";
import type {
  StoryboardDocumentV2,
  StoryboardShotV2,
} from "../versioning/document-contract.js";
import {
  digestLayoutCompositionV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDialogueBindingV1,
  type LayoutDocumentV2,
} from "./automation.js";
import { LayoutDocumentCodecV1, LayoutProfileCodecV1 } from "./codec.js";
import type {
  BalloonElementV1,
  LayoutCanvasV1,
  LayoutDigest,
  LayoutDocumentV1,
  LayoutFontPolicyV1,
  LayoutInsetsV1,
  LayoutProfileV1,
  LayoutTransformV1,
  PageProfileV1,
  PanelFrameElementV1,
  RichTextDocumentV1,
  StripProfileV1,
} from "./document.js";
import {
  assertInitialLayoutDialogueCoverageV1,
  normalizeLayoutDialogueV1,
  type LayoutDialogueCharacterV1,
  type LayoutDialogueCoverageResultV1,
  type LayoutDialogueItemV1,
  type LayoutDialogueLedgerV1,
} from "./dialogue.js";
import { evaluateRichTextOverflowV1 } from "./font.js";
import { normalizeLayoutNumber } from "./geometry.js";
import {
  buildLayoutNarrativeGroupsV1,
  isSlowLayoutRhythmV1,
  type LayoutNarrativeGroupV1,
  type LayoutNarrativePlanV1,
} from "./narrative.js";
import { projectVisibleShotPlacementsV1 } from "./placement.js";
import { countLayoutGraphemes, normalizePlainLayoutText } from "./text.js";
import {
  layoutBalloonVisualPresetV1,
  inferLayoutSemanticTextRoleV1,
  layoutTypographyFaceForRoleV1,
  legacyLayoutTypographyPresetV1,
  type LayoutTypographyPresetV1,
} from "./semantic-style.js";
import type { LayoutSourceCatalogItemV1 } from "./working-copy.js";

export type LayoutRuleTemplateV1 =
  | "single_focus"
  | "two_stack"
  | "three_focus_top"
  | "three_focus_bottom"
  | "three_stack"
  | "four_grid"
  | "five_grid"
  | "six_grid"
  | "vertical_stack";

export interface LayoutRuleCanvasPlanV1 {
  canvasId: string;
  order: number;
  groupIds: string[];
  shotIds: string[];
  template: LayoutRuleTemplateV1;
  width: number;
  height: number;
}

export interface LayoutRuleCompositionInputV1 {
  projectId: string;
  chapterId: string;
  comicFormat: "vertical_scroll" | "paged_comic";
  profile: LayoutProfileV1;
  fontPolicy: LayoutFontPolicyV1;
  typographyPreset?: LayoutTypographyPresetV1;
  storyboardVersion: {
    id: string;
    documentDigest: LayoutDigest;
    document: StoryboardDocumentV2;
  };
  sourceLockSetDigest: LayoutDigest;
  sources: readonly LayoutSourceCatalogItemV1[];
  characterCatalog: readonly LayoutDialogueCharacterV1[];
}

export interface LayoutRuleCompositionIssueV1 {
  code: string;
  severity: "info" | "warning" | "error";
  canvasId: string | null;
  elementId: string | null;
  shotId: string | null;
}

export interface LayoutRuleCompositionReportV1 {
  policyVersion: "layout_rule_composition_report_v1";
  planDigest: LayoutDigest;
  analysisMode: "rule_fallback";
  selectedStrategy: "balanced";
  shotCoverage: { expected: number; placed: number };
  dialogueCoverage: LayoutDialogueCoverageResultV1;
  silentRewriteCount: 0;
  textOverflowCount: 0;
  issues: LayoutRuleCompositionIssueV1[];
}

export interface LayoutRuleCompositionPlanV1 {
  schemaVersion: 1;
  policyVersion: "layout_composition_v1";
  mode: "rule_fallback";
  planDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  documentDigest: LayoutDigest;
  dialogueLedger: LayoutDialogueLedgerV1;
  narrativePlan: LayoutNarrativePlanV1;
  canvases: LayoutRuleCanvasPlanV1[];
  document: LayoutDocumentV2;
  report: LayoutRuleCompositionReportV1;
}

export type LayoutRuleCompositionErrorCodeV1 =
  | "LAYOUT_COMPOSITION_SOURCE_INVALID"
  | "LAYOUT_SHOT_COVERAGE_INVALID"
  | "LAYOUT_TEXT_OVERFLOW"
  | "LAYOUT_GEOMETRY_INVALID";

export class LayoutRuleCompositionError extends Error {
  readonly code: LayoutRuleCompositionErrorCodeV1;

  constructor(code: LayoutRuleCompositionErrorCodeV1, message: string) {
    super(message);
    this.name = "LayoutRuleCompositionError";
    this.code = code;
  }
}

interface CanvasAssignmentV1 {
  groups: LayoutNarrativeGroupV1[];
  shots: StoryboardShotV2[];
}

interface BalloonBoxV1 {
  width: number;
  height: number;
  padding: LayoutInsetsV1;
  richText: RichTextDocumentV1;
}

const PAGE_GAP = 44;
const STRIP_GAP = 54;
const PAGE_FONT_SIZE = 42;
const STRIP_FONT_SIZE = 34;
const PAGE_CAPTION_FONT_SIZE = 36;
const STRIP_CAPTION_FONT_SIZE = 30;

function sourceFail(message: string): never {
  throw new LayoutRuleCompositionError("LAYOUT_COMPOSITION_SOURCE_INVALID", message);
}

function stableId(prefix: string, value: unknown): string {
  const digest = digestCanonicalJson({ policyVersion: "layout_rule_id_v1", prefix, value });
  return `${prefix}_${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function digestSourceLockSet(sources: readonly LayoutSourceCatalogItemV1[]): LayoutDigest {
  const seen = new Set<string>();
  const projection = sources.map((item) => {
    if (seen.has(item.source.shotId)) sourceFail(`duplicate source for shot ${item.source.shotId}`);
    seen.add(item.source.shotId);
    return {
      shotId: item.source.shotId,
      candidateLockRevisionId: item.source.candidateLockRevisionId,
    };
  }).sort((left, right) => compareUnicodeCodePoints(left.shotId, right.shotId));
  return digestCanonicalJson(projection);
}

function validateInput(input: LayoutRuleCompositionInputV1): {
  storyboard: StoryboardDocumentV2;
  profile: LayoutProfileV1;
  sources: LayoutSourceCatalogItemV1[];
} {
  const projectId = input.projectId.trim();
  const chapterId = input.chapterId.trim();
  const storyboardVersionId = input.storyboardVersion.id.trim();
  if (projectId === "" || chapterId === "" || storyboardVersionId === "") sourceFail("project, chapter and storyboard version IDs are required");
  const storyboardEncoded = StoryboardDocumentCodecV2.encode(input.storyboardVersion.document);
  const storyboard = storyboardEncoded.value;
  if (storyboardEncoded.digest !== input.storyboardVersion.documentDigest) sourceFail("storyboard document digest mismatch");
  if (storyboard.chapterId !== chapterId) sourceFail("storyboard chapter does not match composition chapter");
  if (storyboard.shots.length === 0) sourceFail("storyboard must contain at least one active shot");

  const profile = LayoutProfileCodecV1.parseAndNormalize(input.profile);
  if (
    (input.comicFormat === "paged_comic" && profile.kind !== "paged")
    || (input.comicFormat === "vertical_scroll" && profile.kind !== "vertical_strip")
  ) sourceFail("comic format and layout profile do not match");

  const sourceByShot = new Map(input.sources.map((source) => [source.source.shotId, source]));
  if (sourceByShot.size !== input.sources.length) sourceFail("each shot must have exactly one current source");
  if (sourceByShot.size !== storyboard.shots.length) sourceFail("source set does not cover every active shot");
  const sources = storyboard.shots.map((shot) => {
    const source = sourceByShot.get(shot.id);
    if (!source) sourceFail(`missing current source for shot ${shot.id}`);
    if (!Number.isInteger(source.order) || source.order !== shot.order) sourceFail(`source order mismatch for shot ${shot.id}`);
    if (!Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0) {
      sourceFail(`source dimensions are invalid for shot ${shot.id}`);
    }
    return structuredClone(source);
  });
  const assetDimensions = new Map<string, { width: number; height: number }>();
  for (const source of sources) {
    const previous = assetDimensions.get(source.source.assetId);
    if (previous && (previous.width !== source.width || previous.height !== source.height)) {
      sourceFail(`asset ${source.source.assetId} has inconsistent dimensions`);
    }
    assetDimensions.set(source.source.assetId, { width: source.width, height: source.height });
  }
  if (digestSourceLockSet(sources) !== input.sourceLockSetDigest) sourceFail("source lock set digest mismatch");

  const catalogIds = new Set(input.characterCatalog.map((character) => character.characterId));
  if (catalogIds.size !== input.characterCatalog.length) sourceFail("character catalog contains duplicate IDs");
  for (const shot of storyboard.shots) {
    for (const characterId of shot.characterIds) {
      if (!catalogIds.has(characterId)) sourceFail(`character catalog is missing ${characterId}`);
    }
    for (const line of shot.motion.voiceLines) {
      if (line.characterId !== null && !catalogIds.has(line.characterId)) {
        sourceFail(`character catalog is missing voice-line character ${line.characterId}`);
      }
    }
  }
  return { storyboard, profile, sources };
}

function itemsByShot(ledger: LayoutDialogueLedgerV1): ReadonlyMap<string, readonly LayoutDialogueItemV1[]> {
  const result = new Map<string, LayoutDialogueItemV1[]>();
  for (const item of ledger.items) {
    const values = result.get(item.shotId) ?? [];
    values.push(item);
    result.set(item.shotId, values);
  }
  return result;
}

function sourceByShot(sources: readonly LayoutSourceCatalogItemV1[]): ReadonlyMap<string, LayoutSourceCatalogItemV1> {
  return new Map(sources.map((source) => [source.source.shotId, source]));
}

function shotsForGroups(
  groups: readonly LayoutNarrativeGroupV1[],
  shotById: ReadonlyMap<string, StoryboardShotV2>,
): StoryboardShotV2[] {
  return groups.flatMap((group) => group.shotIds.map((shotId) => shotById.get(shotId)!));
}

function groupHasLongDialogue(
  group: LayoutNarrativeGroupV1,
  dialogueByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
): boolean {
  return group.shotIds.some((shotId) => {
    const items = dialogueByShot.get(shotId) ?? [];
    return items.some((item) => countLayoutGraphemes(item.text) > 46)
      || items.reduce((sum, item) => sum + countLayoutGraphemes(item.text), 0) > 76;
  });
}

function pagedAssignments(
  groups: readonly LayoutNarrativeGroupV1[],
  shotById: ReadonlyMap<string, StoryboardShotV2>,
  dialogueByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
): CanvasAssignmentV1[] {
  const result: CanvasAssignmentV1[] = [];
  let current: LayoutNarrativeGroupV1[] = [];
  let shotCount = 0;
  let capacity = 4;
  const flush = (): void => {
    if (current.length === 0) return;
    result.push({ groups: current, shots: shotsForGroups(current, shotById) });
    current = [];
    shotCount = 0;
    capacity = 4;
  };
  for (const group of groups) {
    const groupSize = group.shotIds.length;
    const nextCapacity = groupHasLongDialogue(group, dialogueByShot) ? 2 : 4;
    const effectiveCapacity = Math.min(capacity, nextCapacity);
    const semanticBreak = (group.rhythm === "transition" || group.rhythm === "impact") && shotCount >= 3;
    if (current.length > 0 && (shotCount + groupSize > effectiveCapacity || semanticBreak)) flush();
    current.push(group);
    shotCount += groupSize;
    capacity = Math.min(capacity, nextCapacity);
    if (shotCount >= capacity || (group.rhythm === "impact" && shotCount >= 3)) flush();
  }
  flush();
  return result;
}

function verticalAssignments(
  groups: readonly LayoutNarrativeGroupV1[],
  shotById: ReadonlyMap<string, StoryboardShotV2>,
): CanvasAssignmentV1[] {
  return groups.map((group) => ({ groups: [group], shots: shotsForGroups([group], shotById) }));
}

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

function pageRow(
  y: number,
  height: number,
  count: 1 | 2,
  left: number,
  width: number,
  gap: number,
  rtl: boolean,
): LayoutTransformV1[] {
  if (count === 1) return [transform(left, y, width, height)];
  const cellWidth = (width - gap) / 2;
  const firstX = rtl ? left + cellWidth + gap : left;
  const secondX = rtl ? left : left + cellWidth + gap;
  return [transform(firstX, y, cellWidth, height), transform(secondX, y, cellWidth, height)];
}

function pageFrames(
  count: number,
  profile: PageProfileV1,
  shots: readonly StoryboardShotV2[],
): { template: LayoutRuleTemplateV1; frames: LayoutTransformV1[] } {
  const left = profile.safeArea.left;
  const top = profile.safeArea.top;
  const width = profile.width - profile.safeArea.left - profile.safeArea.right;
  const height = profile.height - profile.safeArea.top - profile.safeArea.bottom;
  const rtl = profile.panelReadingDirection === "rtl_ttb";
  const focusIndex = shots.findIndex((shot) => shot.comic.panelRhythm === "impact");
  if (count === 1) return { template: "single_focus", frames: pageRow(top, height, 1, left, width, PAGE_GAP, rtl) };
  if (count === 2) {
    const rowHeight = (height - PAGE_GAP) / 2;
    return {
      template: "two_stack",
      frames: [
        ...pageRow(top, rowHeight, 1, left, width, PAGE_GAP, rtl),
        ...pageRow(top + rowHeight + PAGE_GAP, rowHeight, 1, left, width, PAGE_GAP, rtl),
      ],
    };
  }
  if (count === 3 && (focusIndex === 0 || focusIndex === 2)) {
    const focusHeight = (height - PAGE_GAP) * 0.56;
    const smallHeight = height - PAGE_GAP - focusHeight;
    if (focusIndex === 0) {
      return {
        template: "three_focus_top",
        frames: [
          ...pageRow(top, focusHeight, 1, left, width, PAGE_GAP, rtl),
          ...pageRow(top + focusHeight + PAGE_GAP, smallHeight, 2, left, width, PAGE_GAP, rtl),
        ],
      };
    }
    return {
      template: "three_focus_bottom",
      frames: [
        ...pageRow(top, smallHeight, 2, left, width, PAGE_GAP, rtl),
        ...pageRow(top + smallHeight + PAGE_GAP, focusHeight, 1, left, width, PAGE_GAP, rtl),
      ],
    };
  }
  if (count === 3) {
    const rowHeight = (height - PAGE_GAP * 2) / 3;
    return {
      template: "three_stack",
      frames: Array.from({ length: 3 }, (_, index) => transform(left, top + index * (rowHeight + PAGE_GAP), width, rowHeight)),
    };
  }
  if (count === 4) {
    const rowHeight = (height - PAGE_GAP) / 2;
    return {
      template: "four_grid",
      frames: [
        ...pageRow(top, rowHeight, 2, left, width, PAGE_GAP, rtl),
        ...pageRow(top + rowHeight + PAGE_GAP, rowHeight, 2, left, width, PAGE_GAP, rtl),
      ],
    };
  }
  if (count === 5) {
    const rowHeight = (height - PAGE_GAP * 2) / 3;
    return {
      template: "five_grid",
      frames: [
        ...pageRow(top, rowHeight, 2, left, width, PAGE_GAP, rtl),
        ...pageRow(top + rowHeight + PAGE_GAP, rowHeight, 2, left, width, PAGE_GAP, rtl),
        ...pageRow(top + (rowHeight + PAGE_GAP) * 2, rowHeight, 1, left, width, PAGE_GAP, rtl),
      ],
    };
  }
  if (count === 6) {
    const rowHeight = (height - PAGE_GAP * 2) / 3;
    return {
      template: "six_grid",
      frames: Array.from({ length: 3 }, (_, row) => pageRow(
        top + row * (rowHeight + PAGE_GAP),
        rowHeight,
        2,
        left,
        width,
        PAGE_GAP,
        rtl,
      )).flat(),
    };
  }
  throw new LayoutRuleCompositionError("LAYOUT_GEOMETRY_INVALID", `paged canvas cannot contain ${count} shots`);
}

function richTextFor(
  item: LayoutDialogueItemV1,
  typographyPreset: LayoutTypographyPresetV1,
  format: LayoutRuleCompositionInputV1["comicFormat"],
): RichTextDocumentV1 {
  const visualRole = inferLayoutSemanticTextRoleV1(item.kind, item.text);
  const face = layoutTypographyFaceForRoleV1(typographyPreset, visualRole);
  const visual = layoutBalloonVisualPresetV1(visualRole, format);
  const fontSize = item.kind === "caption"
    ? format === "paged_comic" ? PAGE_CAPTION_FONT_SIZE : STRIP_CAPTION_FONT_SIZE
    : format === "paged_comic" ? PAGE_FONT_SIZE : STRIP_FONT_SIZE;
  return {
    schemaVersion: 1,
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    paragraphs: normalizePlainLayoutText(item.text).split("\n").map((line) => ({
      align: "center",
      lineHeight: 1.35,
      runs: [{
        text: line,
        fontAssetId: face.fontAssetId,
        fontSize,
        fontWeight: face.fontWeight,
        fontStyle: face.fontStyle,
        color: visual.textColor,
        letterSpacing: 0,
        stroke: null,
      }],
    })),
  };
}

function balloonBox(
  item: LayoutDialogueItemV1,
  panelWidth: number,
  typographyPreset: LayoutTypographyPresetV1,
  format: LayoutRuleCompositionInputV1["comicFormat"],
): BalloonBoxV1 {
  const richText = richTextFor(item, typographyPreset, format);
  const paddingAmount = format === "paged_comic" ? 28 : 20;
  const padding = { top: paddingAmount, right: paddingAmount, bottom: paddingAmount, left: paddingAmount };
  const widthRatio = item.kind === "caption" ? 0.86 : 0.72;
  const width = Math.max(160, Math.min(panelWidth - 32, panelWidth * widthRatio));
  const maximumFontSize = Math.max(
    ...richText.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.fontSize)),
    1,
  );
  const measurement = evaluateRichTextOverflowV1(richText, {
    // Reserve one em for real-font metrics and CJK line-start/line-end rules.
    // The deterministic estimator intentionally sizes slightly larger than the
    // theoretical advance sum so browser/PDF rendering cannot add a surprise line.
    width: Math.max(1, width - padding.left - padding.right - maximumFontSize * 0.5),
    height: 100_000,
  });
  const minimumHeight = (format === "paged_comic" ? PAGE_FONT_SIZE : STRIP_FONT_SIZE) * 2.2;
  const height = Math.max(minimumHeight, measurement.required + padding.top + padding.bottom + 8);
  const maximumSafeHeight = format === "paged_comic" ? 1_600 : 1_800;
  if (height > maximumSafeHeight) {
    throw new LayoutRuleCompositionError(
      "LAYOUT_TEXT_OVERFLOW",
      `dialogue item ${item.id} cannot fit at the minimum rule font size`,
    );
  }
  return {
    width: normalizeLayoutNumber(width),
    height: normalizeLayoutNumber(height),
    padding,
    richText,
  };
}

function estimatedBalloonStackHeight(
  items: readonly LayoutDialogueItemV1[],
  panelWidth: number,
  typographyPreset: LayoutTypographyPresetV1,
  format: LayoutRuleCompositionInputV1["comicFormat"],
): number {
  return items.reduce(
    (sum, item) => sum + balloonBox(item, panelWidth, typographyPreset, format).height + 18,
    0,
  );
}

function verticalFrameHeight(
  shot: StoryboardShotV2,
  source: LayoutSourceCatalogItemV1,
  panelWidth: number,
): number {
  const aspect = Math.max(0.72, Math.min(1.9, source.width / source.height));
  let height = panelWidth / aspect;
  if (shot.shotType === "establishing" || shot.shotType === "wide") height = Math.min(height, panelWidth * 0.68);
  if (shot.shotType === "full") height = Math.max(height, panelWidth * 1.05);
  if (shot.shotType === "extreme_close_up") height = Math.min(height, panelWidth * 0.72);
  if (shot.comic.panelRhythm === "impact") height = Math.max(height, panelWidth * 0.96);
  if (shot.motion.frameType === "transition") height = Math.min(height, panelWidth * 0.58);
  // Publication slicing works in physical rows. Rule-generated strip section
  // boundaries stay on whole logical pixels so independent slice rounding
  // cannot drift from long-image stitching.
  return Math.round(Math.max(420, Math.min(1_500, height)));
}

function verticalFrames(
  assignment: CanvasAssignmentV1,
  profile: StripProfileV1,
  sources: ReadonlyMap<string, LayoutSourceCatalogItemV1>,
  dialogueByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
  typographyPreset: LayoutTypographyPresetV1,
): {
  template: "vertical_stack";
  frames: LayoutTransformV1[];
  balloonBands: LayoutTransformV1[];
  height: number;
} {
  const left = profile.safeInsetX;
  const width = profile.width - profile.safeInsetX * 2;
  const slow = assignment.shots.some((shot) => isSlowLayoutRhythmV1(shot.comic.panelRhythm));
  const top = slow ? 150 : 84;
  const bottom = slow ? 170 : 96;
  const gap = assignment.groups.some((group) => group.rhythm === "transition") ? 144 : STRIP_GAP;
  const frames: LayoutTransformV1[] = [];
  const balloonBands: LayoutTransformV1[] = [];
  let y = top;
  for (const shot of assignment.shots) {
    const source = sources.get(shot.id)!;
    const items = dialogueByShot.get(shot.id) ?? [];
    const stackHeight = estimatedBalloonStackHeight(
      items,
      width,
      typographyPreset,
      "vertical_scroll",
    );
    const bandHeight = items.length > 0 ? stackHeight + 24 : 0;
    const frameHeight = verticalFrameHeight(shot, source, width);
    balloonBands.push(transform(left, y, width, bandHeight));
    frames.push(transform(left, y + bandHeight, width, frameHeight));
    y += bandHeight + frameHeight + gap;
  }
  const height = Math.round(Math.max(320, y - gap + bottom));
  if (height > 8192) throw new LayoutRuleCompositionError("LAYOUT_GEOMETRY_INVALID", "vertical section exceeds 8192 logical pixels");
  return { template: "vertical_stack", frames, balloonBands, height };
}

function reservePageBalloonBands(
  frames: readonly LayoutTransformV1[],
  assignment: CanvasAssignmentV1,
  dialogueByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
  typographyPreset: LayoutTypographyPresetV1,
): { frames: LayoutTransformV1[]; balloonBands: LayoutTransformV1[] } {
  const adjustedFrames: LayoutTransformV1[] = [];
  const balloonBands: LayoutTransformV1[] = [];
  for (const [index, frame] of frames.entries()) {
    const shot = assignment.shots[index]!;
    const items = dialogueByShot.get(shot.id) ?? [];
    const stackHeight = estimatedBalloonStackHeight(
      items,
      frame.width,
      typographyPreset,
      "paged_comic",
    );
    const bandHeight = items.length > 0 ? stackHeight + 24 : 0;
    const remainingHeight = frame.height - bandHeight;
    if (remainingHeight < 220) {
      throw new LayoutRuleCompositionError(
        "LAYOUT_TEXT_OVERFLOW",
        `dialogue for shot ${shot.id} cannot fit in a safe page gutter`,
      );
    }
    balloonBands.push(transform(frame.x, frame.y, frame.width, bandHeight));
    adjustedFrames.push(transform(
      frame.x,
      frame.y + bandHeight,
      frame.width,
      remainingHeight,
    ));
  }
  return { frames: adjustedFrames, balloonBands };
}

function panelFor(
  canvasId: string,
  shot: StoryboardShotV2,
  source: LayoutSourceCatalogItemV1,
  frame: LayoutTransformV1,
): PanelFrameElementV1 {
  const panelId = stableId("panel", { canvasId, shotId: shot.id });
  return {
    id: panelId,
    type: "panel_frame",
    name: `画格 ${shot.order}`,
    transform: frame,
    locked: false,
    hidden: false,
    shape: { kind: "rect", cornerRadius: 0 },
    border: { visible: true, color: "#111827FF", width: 8 },
    contentImage: {
      id: stableId("image", { panelId, shotId: shot.id }),
      type: "image",
      placement: "panel_content",
      name: `镜头 ${shot.order}`,
      locked: false,
      hidden: false,
      source: structuredClone(source.source),
      crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
    },
  };
}

function balloonFor(
  panel: PanelFrameElementV1,
  band: LayoutTransformV1,
  item: LayoutDialogueItemV1,
  itemIndex: number,
  stackOffset: number,
  typographyPreset: LayoutTypographyPresetV1,
  format: LayoutRuleCompositionInputV1["comicFormat"],
): { element: BalloonElementV1; binding: LayoutDialogueBindingV1; nextOffset: number } {
  const box = balloonBox(item, panel.transform.width, typographyPreset, format);
  const sideInset = Math.max(16, band.width * 0.035);
  const alternateRight = item.kind !== "caption" && itemIndex % 2 === 1;
  const x = alternateRight
    ? band.x + band.width - box.width - sideInset
    : band.x + sideInset;
  const y = band.y + 12 + stackOffset;
  if (y + box.height > panel.transform.y) {
    throw new LayoutRuleCompositionError(
      "LAYOUT_TEXT_OVERFLOW",
      `dialogue item ${item.id} exceeds its safe gutter`,
    );
  }
  const elementId = stableId("balloon", { dialogueItemId: item.id });
  const transformValue = transform(x, y, box.width, box.height);
  const visualRole = inferLayoutSemanticTextRoleV1(item.kind, item.text);
  const visual = layoutBalloonVisualPresetV1(visualRole, format);
  const element: BalloonElementV1 = {
    id: elementId,
    type: "balloon",
    name: item.kind === "caption" ? `旁白 ${item.lineOrder}` : `对白 ${item.lineOrder}`,
    transform: transformValue,
    locked: false,
    hidden: false,
    balloonKind: item.kind,
    sourceShotId: item.shotId,
    speakerCharacterId: item.speakerCharacterId,
    fillColor: visual.fillColor,
    strokeColor: visual.strokeColor,
    strokeWidth: visual.strokeWidth,
    padding: box.padding,
    verticalAlign: "center",
    tail: {
      enabled: false,
      rootRatio: 0.5,
      targetX: box.width / 2,
      targetY: box.height + 32,
      baseWidth: format === "paged_comic" ? 36 : 26,
    },
    richText: box.richText,
  };
  return {
    element,
    binding: {
      dialogueItemId: item.id,
      sourceShotId: item.shotId,
      sourceTextDigest: item.sourceTextDigest,
      initialTextDigest: item.textDigest,
      elementId,
      disposition: "placed",
    },
    nextOffset: stackOffset + box.height + 18,
  };
}

function templateForPageCount(count: number): LayoutRuleTemplateV1 {
  if (count === 1) return "single_focus";
  if (count === 2) return "two_stack";
  if (count === 3) return "three_stack";
  if (count === 4) return "four_grid";
  if (count === 5) return "five_grid";
  return "six_grid";
}

function buildCanvases(input: {
  projectId: string;
  chapterId: string;
  comicFormat: LayoutRuleCompositionInputV1["comicFormat"];
  profile: LayoutProfileV1;
  fontPolicy: LayoutFontPolicyV1;
  typographyPreset: LayoutTypographyPresetV1;
  assignments: readonly CanvasAssignmentV1[];
  sources: ReadonlyMap<string, LayoutSourceCatalogItemV1>;
  dialogueByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>;
}): { canvases: LayoutCanvasV1[]; plans: LayoutRuleCanvasPlanV1[]; bindings: LayoutDialogueBindingV1[] } {
  const canvases: LayoutCanvasV1[] = [];
  const plans: LayoutRuleCanvasPlanV1[] = [];
  const bindings: LayoutDialogueBindingV1[] = [];
  for (const [canvasIndex, assignment] of input.assignments.entries()) {
    const canvasId = stableId("canvas", {
      comicFormat: input.comicFormat,
      groupIds: assignment.groups.map((group) => group.groupId),
      shotIds: assignment.shots.map((shot) => shot.id),
    });
    let frames: LayoutTransformV1[];
    let balloonBands: LayoutTransformV1[];
    let height: number;
    let template: LayoutRuleTemplateV1;
    if (input.profile.kind === "paged") {
      const page = pageFrames(assignment.shots.length, input.profile, assignment.shots);
      const reserved = reservePageBalloonBands(
        page.frames,
        assignment,
        input.dialogueByShot,
        input.typographyPreset,
      );
      frames = reserved.frames;
      balloonBands = reserved.balloonBands;
      height = input.profile.height;
      template = page.template;
    } else {
      const strip = verticalFrames(
        assignment,
        input.profile,
        input.sources,
        input.dialogueByShot,
        input.typographyPreset,
      );
      frames = strip.frames;
      balloonBands = strip.balloonBands;
      height = strip.height;
      template = strip.template;
    }
    if (frames.length !== assignment.shots.length) {
      throw new LayoutRuleCompositionError("LAYOUT_GEOMETRY_INVALID", "frame count does not match shot count");
    }
    const canvas: LayoutCanvasV1 = {
      id: canvasId,
      kind: input.profile.kind === "paged" ? "page" : "strip_section",
      name: input.profile.kind === "paged" ? `第 ${canvasIndex + 1} 页` : `第 ${canvasIndex + 1} 段`,
      width: input.profile.width,
      height,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: [],
      elements: [],
    };
    const panels = assignment.shots.map((shot, shotIndex) => panelFor(
      canvasId,
      shot,
      input.sources.get(shot.id)!,
      frames[shotIndex]!,
    ));
    canvas.elements.push(...panels);
    canvas.panelReadingOrder = panels.map((panel) => panel.id);
    for (const [panelIndex, panel] of panels.entries()) {
      const shot = assignment.shots[panelIndex]!;
      const items = input.dialogueByShot.get(shot.id) ?? [];
      let stackOffset = 0;
      for (const [itemIndex, item] of items.entries()) {
        const result = balloonFor(
          panel,
          balloonBands[panelIndex]!,
          item,
          itemIndex,
          stackOffset,
          input.typographyPreset,
          input.comicFormat,
        );
        canvas.elements.push(result.element);
        bindings.push(result.binding);
        stackOffset = result.nextOffset;
      }
    }
    canvases.push(canvas);
    plans.push({
      canvasId,
      order: canvasIndex + 1,
      groupIds: assignment.groups.map((group) => group.groupId),
      shotIds: assignment.shots.map((shot) => shot.id),
      template: template ?? templateForPageCount(assignment.shots.length),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return {
    canvases,
    plans,
    bindings: bindings.sort((left, right) => compareUnicodeCodePoints(left.dialogueItemId, right.dialogueItemId)),
  };
}

function assertShotCoverage(document: LayoutDocumentV1, storyboard: StoryboardDocumentV2): { expected: number; placed: number } {
  const placements = projectVisibleShotPlacementsV1(document);
  const expectedIds = new Set(storyboard.shots.map((shot) => shot.id));
  for (const shotId of expectedIds) {
    const count = placements[shotId]?.length ?? 0;
    if (count !== 1) {
      throw new LayoutRuleCompositionError("LAYOUT_SHOT_COVERAGE_INVALID", `shot ${shotId} was placed ${count} times`);
    }
  }
  for (const shotId of Object.keys(placements)) {
    if (!expectedIds.has(shotId)) {
      throw new LayoutRuleCompositionError("LAYOUT_SHOT_COVERAGE_INVALID", `unexpected shot ${shotId} was placed`);
    }
  }
  return { expected: expectedIds.size, placed: expectedIds.size };
}

function assertNoTextOverflow(document: LayoutDocumentV1): void {
  const overflows: string[] = [];
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.hidden || (element.type !== "balloon" && element.type !== "text")) continue;
      const padding = element.type === "balloon"
        ? {
            width: element.padding.left + element.padding.right,
            height: element.padding.top + element.padding.bottom,
          }
        : { width: 0, height: 0 };
      const result = evaluateRichTextOverflowV1(element.richText, {
        width: element.transform.width - padding.width,
        height: element.transform.height - padding.height,
      });
      if (result.overflow) overflows.push(`${canvas.id}/${element.id}`);
    }
  }
  if (overflows.length > 0) {
    throw new LayoutRuleCompositionError("LAYOUT_TEXT_OVERFLOW", `text overflow in ${overflows.join(", ")}`);
  }
}

function reportIssues(ledger: LayoutDialogueLedgerV1): LayoutRuleCompositionIssueV1[] {
  return [
    {
      code: "visual_analysis_unavailable",
      severity: "warning",
      canvasId: null,
      elementId: null,
      shotId: null,
    },
    ...ledger.issues.map((issue): LayoutRuleCompositionIssueV1 => ({
      code: issue.code,
      severity: issue.severity,
      canvasId: null,
      elementId: null,
      shotId: issue.shotId,
    })),
  ];
}

export function composeRuleBasedLayoutV1(
  input: LayoutRuleCompositionInputV1,
): LayoutRuleCompositionPlanV1 {
  const { storyboard, profile, sources } = validateInput(input);
  const typographyPreset = input.typographyPreset
    ?? legacyLayoutTypographyPresetV1(input.fontPolicy);
  const dialogueLedger = normalizeLayoutDialogueV1({
    storyboard,
    characterCatalog: input.characterCatalog,
  });
  const narrativePlan = buildLayoutNarrativeGroupsV1(storyboard, dialogueLedger);
  const shotById = new Map(storyboard.shots.map((shot) => [shot.id, shot]));
  const dialogueByShot = itemsByShot(dialogueLedger);
  const assignments = profile.kind === "paged"
    ? pagedAssignments(narrativePlan.groups, shotById, dialogueByShot)
    : verticalAssignments(narrativePlan.groups, shotById);
  const sourceMap = sourceByShot(sources);
  const built = buildCanvases({
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
    profile,
    fontPolicy: input.fontPolicy,
    typographyPreset,
    assignments,
    sources: sourceMap,
    dialogueByShot,
  });
  const visible = LayoutDocumentCodecV1.encode({
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
    profile,
    fontPolicy: input.fontPolicy,
    canvases: built.canvases,
  }, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
    imageByAssetId: Object.fromEntries(sources.map((source) => [source.source.assetId, {
      width: source.width,
      height: source.height,
      ready: true,
    }])),
  });
  const shotCoverage = assertShotCoverage(visible.value, storyboard);
  assertNoTextOverflow(visible.value);

  const planDigest = digestCanonicalJson({
    policyVersion: "layout_rule_plan_digest_v1",
    mode: "rule_fallback",
    storyboardVersionId: input.storyboardVersion.id,
    storyboardDigest: input.storyboardVersion.documentDigest,
    sourceLockSetDigest: input.sourceLockSetDigest,
    dialogueLedgerDigest: dialogueLedger.ledgerDigest,
    narrativePlanDigest: narrativePlan.planDigest,
    typographyPreset,
    canvases: built.plans,
    visibleDocumentDigest: visible.digest,
  });
  const bindingDigest = digestCanonicalJson(built.bindings);
  const compositionDigest = digestLayoutCompositionV1({
    compositionPolicyVersion: "layout_composition_v1",
    storyboardVersionId: input.storyboardVersion.id,
    storyboardDigest: input.storyboardVersion.documentDigest,
    sourceLockSetDigest: input.sourceLockSetDigest,
    visualAnalysisSetDigest: null,
    mode: "rule_fallback",
    planDigest,
    initialVisibleDocumentDigest: visible.digest,
    initialDialogueBindingsDigest: bindingDigest,
  });
  const encoded = LayoutDocumentCodecV2.encode({
    ...visible.value,
    schemaVersion: 2,
    kind: "layout_document_v2",
    automation: {
      policyVersion: "layout_automation_v1",
      composition: {
        compositionDigest,
        compositionPolicyVersion: "layout_composition_v1",
        storyboardVersionId: input.storyboardVersion.id,
        storyboardDigest: input.storyboardVersion.documentDigest,
        sourceLockSetDigest: input.sourceLockSetDigest,
        visualAnalysisSetDigest: null,
        mode: "rule_fallback",
      },
      dialogueBindings: built.bindings,
      protections: [],
    },
  });
  const projected = projectLayoutDocumentV2ToV1(encoded.value);
  if (LayoutDocumentCodecV1.encode(projected).digest !== visible.digest) {
    throw new LayoutRuleCompositionError("LAYOUT_GEOMETRY_INVALID", "V2 projection changed the visible layout document");
  }
  const dialogueCoverage = assertInitialLayoutDialogueCoverageV1(encoded.value, dialogueLedger);
  return {
    schemaVersion: 1,
    policyVersion: "layout_composition_v1",
    mode: "rule_fallback",
    planDigest,
    visibleDocumentDigest: visible.digest,
    documentDigest: encoded.digest,
    dialogueLedger,
    narrativePlan,
    canvases: built.plans,
    document: encoded.value,
    report: {
      policyVersion: "layout_rule_composition_report_v1",
      planDigest,
      analysisMode: "rule_fallback",
      selectedStrategy: "balanced",
      shotCoverage,
      dialogueCoverage,
      silentRewriteCount: 0,
      textOverflowCount: 0,
      issues: reportIssues(dialogueLedger),
    },
  };
}
