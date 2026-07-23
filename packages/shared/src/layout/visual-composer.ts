import { digestCanonicalJson } from "../versioning/canonical-json.js";
import type { StoryboardShotV2 } from "../versioning/document-contract.js";
import {
  digestLayoutCompositionV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
} from "./automation.js";
import { balloonTailRootRatioForTargetV1, resolveBalloonTailRootV1 } from "./balloon.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  projectCoverCropV1,
  projectNormalizedRectToCanvasV1,
  scoreVisualLayoutCandidateV1,
  intersectPixelRectsV1,
  pixelRectAreaV1,
  type LayoutCompositionQualityScoreV1,
  type LayoutPixelRectV1,
} from "./composition-score.js";
import { digestCandidateImageSourceV1 } from "./digest.js";
import type {
  BalloonElementV1,
  CoverCropV1,
  LayoutCanvasV1,
  LayoutDigest,
  LayoutTransformV1,
  PageProfileV1,
  PanelFrameElementV1,
  StripProfileV1,
} from "./document.js";
import {
  assertInitialLayoutDialogueCoverageV1,
  type LayoutDialogueItemV1,
} from "./dialogue.js";
import { evaluateRichTextOverflowV1 } from "./font.js";
import { normalizeLayoutNumber } from "./geometry.js";
import {
  composeRuleBasedLayoutV1,
  LayoutRuleCompositionError,
  type LayoutRuleCompositionInputV1,
  type LayoutRuleCompositionPlanV1,
} from "./rule-composer.js";
import { inferLayoutSemanticTextRoleV1 } from "./semantic-style.js";
import { countLayoutGraphemes } from "./text.js";
import {
  createRuleFallbackLayoutImageAnalysisV1,
  digestLayoutVisualAnalysisSetV1,
  parseLayoutImageAnalysisV1,
  unionNormalizedRectsV1,
  type LayoutImageAnalysisV1,
  type LayoutNormalizedRectV1,
  type LayoutShotVisualAnalysisV1,
} from "./visual-analysis.js";
import type { LayoutSourceCatalogItemV1 } from "./working-copy.js";

export type LayoutVisualCandidateStrategyV1 = "balanced" | "subject_first" | "dialogue_first";

export interface LayoutVisualEvidenceInputV1 {
  shotId: string;
  assetId: string;
  assetDigest: LayoutDigest;
  analysis: unknown | null;
}

export interface LayoutVisualCompositionInputV1 extends LayoutRuleCompositionInputV1 {
  visualEvidence: readonly LayoutVisualEvidenceInputV1[];
  /**
   * Reflow callers may ask for the best valid plan whose visible document is
   * different from the current one. Initial composition leaves this unset.
   */
  avoidVisibleDocumentDigest?: LayoutDigest | null;
}

export interface LayoutVisualCandidateSummaryV1 {
  strategy: LayoutVisualCandidateStrategyV1;
  status: "valid";
  planDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  documentDigest: LayoutDigest;
  repairRounds: number;
  score: LayoutCompositionQualityScoreV1;
}

export interface LayoutVisualCompositionIssueV1 {
  code: string;
  severity: "info" | "warning" | "error";
  shotId: string | null;
  elementId: string | null;
}

export interface LayoutVisualCompositionReportV1 {
  policyVersion: "layout_visual_composition_report_v1";
  analysisMode: "vision" | "mixed" | "rule_fallback";
  visualAnalysisSetDigest: LayoutDigest;
  selectedStrategy: LayoutVisualCandidateStrategyV1;
  selectedPlanDigest: LayoutDigest;
  candidateCount: number;
  repairRounds: number;
  shotCoverage: { expected: number; placed: number };
  dialogueCoverage: ReturnType<typeof assertInitialLayoutDialogueCoverageV1>;
  silentRewriteCount: 0;
  textOverflowCount: 0;
  quality: LayoutCompositionQualityScoreV1;
  issues: LayoutVisualCompositionIssueV1[];
}

export interface LayoutVisualCompositionPlanV1 {
  schemaVersion: 1;
  policyVersion: "layout_visual_composition_v1";
  mode: "vision" | "rule_fallback";
  planDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  documentDigest: LayoutDigest;
  visualAnalysisSetDigest: LayoutDigest;
  analyses: LayoutShotVisualAnalysisV1[];
  candidates: LayoutVisualCandidateSummaryV1[];
  document: LayoutDocumentV2;
  report: LayoutVisualCompositionReportV1;
}

export type LayoutVisualCompositionErrorCodeV1 =
  | "LAYOUT_VISUAL_ANALYSIS_INVALID"
  | "LAYOUT_COMPOSITION_SOURCE_INVALID"
  | "LAYOUT_COMPOSITION_NO_VALID_PLAN"
  | "LAYOUT_TEXT_OVERFLOW"
  | "LAYOUT_GEOMETRY_INVALID";

export class LayoutVisualCompositionError extends Error {
  readonly code: LayoutVisualCompositionErrorCodeV1;

  constructor(code: LayoutVisualCompositionErrorCodeV1, message: string) {
    super(message);
    this.name = "LayoutVisualCompositionError";
    this.code = code;
  }
}

interface VisualContextV1 {
  shot: StoryboardShotV2;
  source: LayoutSourceCatalogItemV1;
  analysis: LayoutImageAnalysisV1;
  dialogueItems: LayoutDialogueItemV1[];
}

interface ProjectedBalloonSubjectV1 {
  characterId: string | null;
  body: LayoutPixelRectV1;
  face: LayoutPixelRectV1 | null;
}

interface BalloonTailSegmentV1 {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface ShotBundleV1 {
  context: VisualContextV1;
  panel: PanelFrameElementV1;
  balloons: BalloonElementV1[];
}

interface PageRowV1 {
  bundles: ShotBundleV1[];
  height: number;
  bandHeight: number;
  layout: "full" | "pair" | "sidecar" | "focus_pair";
}

interface CandidateBuildV1 {
  strategy: LayoutVisualCandidateStrategyV1;
  planDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  documentDigest: LayoutDigest;
  repairRounds: number;
  document: LayoutDocumentV2;
  score: LayoutCompositionQualityScoreV1;
}

const PAGE_GAP = 38;
const PAGE_SIDECAR_RATIO = 0.48;
const PAGE_MULTI_SPEAKER_SIDECAR_RATIO = 0.38;
const PAGE_FOCUS_LEAD_RATIO = 0.47;
const STRIP_GAP = 56;
const HIGH_CONFIDENCE = 0.65;

function fail(code: LayoutVisualCompositionErrorCodeV1, message: string): never {
  throw new LayoutVisualCompositionError(code, message);
}

function rounded(value: number): number {
  return normalizeLayoutNumber(value);
}

function stableId(prefix: string, value: unknown): string {
  const digest = digestCanonicalJson({ policyVersion: "layout_visual_id_v1", prefix, value });
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

function transform(x: number, y: number, width: number, height: number): LayoutTransformV1 {
  return {
    x: rounded(x),
    y: rounded(y),
    width: rounded(width),
    height: rounded(height),
    rotation: 0,
    opacity: 1,
  };
}

function resolveAnalyses(
  input: LayoutVisualCompositionInputV1,
): { entries: LayoutShotVisualAnalysisV1[]; issues: LayoutVisualCompositionIssueV1[] } {
  const sourceByShot = new Map(input.sources.map((source) => [source.source.shotId, source]));
  const evidenceByShot = new Map(input.visualEvidence.map((entry) => [entry.shotId, entry]));
  if (sourceByShot.size !== input.sources.length || evidenceByShot.size !== input.visualEvidence.length) {
    fail("LAYOUT_COMPOSITION_SOURCE_INVALID", "visual evidence and source shot IDs must be unique");
  }
  const shotOrder = input.storyboardVersion.document.shots.map((shot) => shot.id);
  if (evidenceByShot.size !== shotOrder.length) {
    fail("LAYOUT_COMPOSITION_SOURCE_INVALID", "visual evidence must cover every active shot");
  }
  const shotById = new Map(input.storyboardVersion.document.shots.map((shot) => [shot.id, shot]));
  const issues: LayoutVisualCompositionIssueV1[] = [];
  const entries = shotOrder.map((shotId): LayoutShotVisualAnalysisV1 => {
    const source = sourceByShot.get(shotId);
    const evidence = evidenceByShot.get(shotId);
    const shot = shotById.get(shotId);
    if (!source || !evidence || !shot) fail("LAYOUT_COMPOSITION_SOURCE_INVALID", `missing visual evidence for ${shotId}`);
    if (evidence.assetId !== source.source.assetId) {
      fail("LAYOUT_COMPOSITION_SOURCE_INVALID", `visual evidence asset mismatch for ${shotId}`);
    }
    const expectedSourceDigest = digestCandidateImageSourceV1({
      shotId: source.source.shotId,
      candidateId: source.source.candidateId,
      candidateLockRevisionId: source.source.candidateLockRevisionId,
      assetId: source.source.assetId,
    }, evidence.assetDigest);
    if (expectedSourceDigest !== source.source.sourceDigest) {
      fail("LAYOUT_COMPOSITION_SOURCE_INVALID", `visual evidence digest is stale for ${shotId}`);
    }

    let analysis: LayoutImageAnalysisV1;
    if (evidence.analysis === null) {
      analysis = createRuleFallbackLayoutImageAnalysisV1({
        assetId: evidence.assetId,
        assetDigest: evidence.assetDigest,
        warning: "visual_analysis_unavailable",
      });
    } else {
      try {
        const parsed = parseLayoutImageAnalysisV1(evidence.analysis);
        const characterIds = new Set(shot.characterIds);
        if (parsed.assetId !== evidence.assetId || parsed.assetDigest !== evidence.assetDigest) {
          throw new Error("analysis asset identity does not match source evidence");
        }
        if (parsed.subjects.some((subject) => subject.characterId !== null && !characterIds.has(subject.characterId))) {
          throw new Error("analysis mapped a subject outside the current Shot character set");
        }
        analysis = parsed;
      } catch (error) {
        analysis = createRuleFallbackLayoutImageAnalysisV1({
          assetId: evidence.assetId,
          assetDigest: evidence.assetDigest,
          warning: "visual_analysis_rejected",
        });
        if (error instanceof LayoutVisualCompositionError) throw error;
      }
    }
    if (analysis.mode === "vision" && analysis.subjects.every((subject) => subject.confidence < HIGH_CONFIDENCE)) {
      issues.push({ code: "visual_analysis_low_confidence", severity: "warning", shotId, elementId: null });
    }
    for (const warning of analysis.warnings) issues.push({ code: warning, severity: "warning", shotId, elementId: null });
    return { shotId, sourceDigest: source.source.sourceDigest, analysis };
  });
  return { entries, issues };
}

function bodyUnion(analysis: LayoutImageAnalysisV1): LayoutNormalizedRectV1 | null {
  const subjects = analysis.subjects.filter((subject) => (
    subject.confidence >= HIGH_CONFIDENCE && subject.importance >= 0.45
  ));
  const focalRegions = analysis.focalRegions
    .filter((region) => region.weight >= 0.55)
    .map((region) => region.box);
  const boxes = [...subjects.map((subject) => subject.bodyBox), ...focalRegions];
  const union = unionNormalizedRectsV1(boxes);
  if (!union) return null;
  const margin = 0.012;
  const left = Math.max(0, union.x - margin);
  const top = Math.max(0, union.y - margin);
  const right = Math.min(1, union.x + union.width + margin);
  const bottom = Math.min(1, union.y + union.height + margin);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function feasibleAspect(context: VisualContextV1): { minimum: number; maximum: number; source: number } {
  const sourceAspect = context.source.width / context.source.height;
  const union = bodyUnion(context.analysis);
  if (!union) return { minimum: sourceAspect * 0.72, maximum: sourceAspect / 0.72, source: sourceAspect };
  return {
    minimum: Math.max(0.25, sourceAspect * Math.max(0.12, union.width)),
    maximum: Math.min(4, sourceAspect / Math.max(0.12, union.height)),
    source: sourceAspect,
  };
}

function dialogueLoad(context: VisualContextV1): number {
  return context.dialogueItems.reduce((sum, item) => sum + countLayoutGraphemes(item.text), 0);
}

function requiresSoloRow(context: VisualContextV1): boolean {
  return dialogueLoad(context) > 72 || context.dialogueItems.length >= 3;
}

function usesMultiSpeakerSidecar(context: VisualContextV1): boolean {
  const speakers = new Set(context.dialogueItems.flatMap((item) => (
    item.kind !== "caption" && item.speakerCharacterId ? [item.speakerCharacterId] : []
  )));
  return speakers.size >= 2;
}

function sidecarRatio(context: VisualContextV1): number {
  return usesMultiSpeakerSidecar(context) ? PAGE_MULTI_SPEAKER_SIDECAR_RATIO : PAGE_SIDECAR_RATIO;
}

function wantsWideRow(context: VisualContextV1): boolean {
  const union = bodyUnion(context.analysis);
  return requiresSoloRow(context)
    || context.source.width / context.source.height >= 1.22
    || (union?.width ?? 0) >= 0.7
    || context.shot.shotType === "wide"
    || context.shot.shotType === "establishing";
}

function requiresFullWidthRow(
  context: VisualContextV1,
  strategy: LayoutVisualCandidateStrategyV1,
): boolean {
  if (requiresSoloRow(context)) return true;
  if (context.shot.comic.panelRhythm === "impact") return true;
  if (context.shot.shotType === "wide" || context.shot.shotType === "establishing") return true;
  if (strategy === "subject_first") return wantsWideRow(context);
  const union = bodyUnion(context.analysis);
  return strategy === "balanced" && (union?.width ?? 0) >= 0.86;
}

function preferredAspect(context: VisualContextV1, strategy: LayoutVisualCandidateStrategyV1, columns: 1 | 2): number {
  const feasible = feasibleAspect(context);
  let preferred: number;
  if (columns === 1) {
    if (requiresSoloRow(context) && feasible.source < 0.9) preferred = 0.7;
    else if (wantsWideRow(context)) preferred = strategy === "subject_first" ? 1.85 : 2.12;
    else preferred = 1.05;
  } else {
    preferred = strategy === "dialogue_first" ? 1.04 : strategy === "balanced" ? 0.92 : 0.82;
  }
  if (context.shot.comic.panelRhythm === "impact") preferred *= 0.88;
  return Math.max(feasible.minimum, Math.min(feasible.maximum, preferred));
}

function pageRows(
  bundles: readonly ShotBundleV1[],
  profile: PageProfileV1,
  strategy: LayoutVisualCandidateStrategyV1,
): PageRowV1[] {
  const safeWidth = profile.width - profile.safeArea.left - profile.safeArea.right;
  const rows: PageRowV1[] = [];
  let index = 0;
  while (index < bundles.length) {
    const current = bundles[index]!;
    const next = bundles[index + 1];
    if (requiresSoloRow(current.context)) {
      const panelWidth = safeWidth * sidecarRatio(current.context);
      const imageHeight = panelWidth / preferredAspect(current.context, strategy, 1);
      const textHeight = balloonStackHeight(current, panelWidth, strategy);
      rows.push({
        bundles: [current],
        height: rounded(Math.max(420, imageHeight, textHeight)),
        bandHeight: 0,
        layout: "sidecar",
      });
      index += 1;
      continue;
    }
    const focusPair = next
      && !requiresSoloRow(next.context)
      && current.context.shot.comic.panelRhythm !== "impact"
      && next.context.shot.comic.panelRhythm === "impact"
      && (current.context.shot.motion.frameType === "detail"
        || current.context.shot.shotType === "close_up"
        || current.context.shot.shotType === "extreme_close_up"
        || (bodyUnion(current.context.analysis)?.width ?? 1) < 0.56);
    if (focusPair) {
      const leadWidth = safeWidth * PAGE_FOCUS_LEAD_RATIO;
      const impactWidth = safeWidth - PAGE_GAP - leadWidth;
      const bandHeight = Math.max(
        balloonStackHeight(current, leadWidth, strategy),
        balloonStackHeight(next, impactWidth, strategy),
      );
      const availableHeight = profile.height - profile.safeArea.top - profile.safeArea.bottom;
      rows.push({
        bundles: [current, next],
        height: rounded(Math.max(900, Math.min(availableHeight - bandHeight, availableHeight * 0.76))),
        bandHeight: rounded(bandHeight),
        layout: "focus_pair",
      });
      index += 2;
      continue;
    }
    const pair = next
      && !requiresFullWidthRow(current.context, strategy)
      && !requiresFullWidthRow(next.context, strategy);
    const sourceAspect = current.context.source.width / current.context.source.height;
    const sidecar = !pair
      && !requiresFullWidthRow(current.context, strategy)
      && (sourceAspect < 1.15
        || current.context.shot.shotType === "close_up"
        || current.context.shot.shotType === "extreme_close_up"
        || current.context.shot.motion.frameType === "detail");
    if (sidecar) {
      const panelWidth = safeWidth * sidecarRatio(current.context);
      const imageHeight = panelWidth / preferredAspect(current.context, strategy, 1);
      const textHeight = balloonStackHeight(current, panelWidth, strategy);
      rows.push({
        bundles: [current],
        height: rounded(Math.max(420, imageHeight, textHeight)),
        bandHeight: 0,
        layout: "sidecar",
      });
      index += 1;
      continue;
    }
    const rowBundles = pair ? [current, next] : [current];
    const columns = rowBundles.length as 1 | 2;
    const cellWidth = columns === 1 ? safeWidth : (safeWidth - PAGE_GAP) / 2;
    const height = Math.max(...rowBundles.map((bundle) => (
      cellWidth / preferredAspect(bundle.context, strategy, columns)
    )));
    const bandHeight = Math.max(...rowBundles.map((bundle) => balloonStackHeight(bundle, cellWidth, strategy)));
    rows.push({
      bundles: rowBundles,
      height: rounded(Math.max(220, height)),
      bandHeight: rounded(bandHeight),
      layout: pair ? "pair" : "full",
    });
    index += columns;
  }
  return rows;
}

function pageHeightFor(
  bundles: readonly ShotBundleV1[],
  profile: PageProfileV1,
  strategy: LayoutVisualCandidateStrategyV1,
): number {
  const rows = pageRows(bundles, profile, strategy);
  return rows.reduce((sum, row) => sum + row.height + row.bandHeight, 0) + PAGE_GAP * Math.max(0, rows.length - 1);
}

function packPages(
  base: LayoutRuleCompositionPlanV1,
  bundleByShot: ReadonlyMap<string, ShotBundleV1>,
  profile: PageProfileV1,
  strategy: LayoutVisualCandidateStrategyV1,
): ShotBundleV1[][] {
  const available = profile.height - profile.safeArea.top - profile.safeArea.bottom;
  const pages: ShotBundleV1[][] = [];
  let current: ShotBundleV1[] = [];
  const flush = (): void => {
    if (current.length > 0) pages.push(current);
    current = [];
  };
  for (const group of base.narrativePlan.groups) {
    const groupBundles = group.shotIds.map((shotId) => bundleByShot.get(shotId)!);
    if (current.length > 0 && pageHeightFor([...current, ...groupBundles], profile, strategy) > available) flush();
    if (pageHeightFor(groupBundles, profile, strategy) <= available) {
      current.push(...groupBundles);
      continue;
    }
    for (const bundle of groupBundles) {
      if (current.length > 0 && pageHeightFor([...current, bundle], profile, strategy) > available) flush();
      current.push(bundle);
      if (pageHeightFor(current, profile, strategy) > available || requiresSoloRow(bundle.context)) flush();
    }
  }
  flush();
  return pages;
}

function solveCrop(
  frame: LayoutTransformV1,
  source: LayoutSourceCatalogItemV1,
  analysis: LayoutImageAnalysisV1,
): CoverCropV1 {
  const baseScale = Math.max(frame.width / source.width, frame.height / source.height);
  const displayWidth = source.width * baseScale;
  const displayHeight = source.height * baseScale;
  const visibleWidth = Math.min(1, frame.width / displayWidth);
  const visibleHeight = Math.min(1, frame.height / displayHeight);
  const union = bodyUnion(analysis);
  let centerX = union ? union.x + union.width / 2 : analysis.visualCenter.x;
  let centerY = union ? union.y + union.height / 2 : analysis.visualCenter.y;
  const clampCenter = (center: number, visible: number, start: number | null, size: number | null): number => {
    let minimum = visible / 2;
    let maximum = 1 - visible / 2;
    if (start !== null && size !== null && size <= visible) {
      minimum = Math.max(minimum, start + size - visible / 2);
      maximum = Math.min(maximum, start + visible / 2);
    }
    if (minimum > maximum) return (minimum + maximum) / 2;
    return Math.max(minimum, Math.min(maximum, center));
  };
  centerX = clampCenter(centerX, visibleWidth, union?.x ?? null, union?.width ?? null);
  centerY = clampCenter(centerY, visibleHeight, union?.y ?? null, union?.height ?? null);
  const maxOffsetX = Math.max(0, (displayWidth - frame.width) / 2 - 0.5);
  const maxOffsetY = Math.max(0, (displayHeight - frame.height) / 2 - 0.5);
  return {
    zoom: 1,
    offsetX: rounded(Math.max(-maxOffsetX, Math.min(maxOffsetX, (0.5 - centerX) * displayWidth))),
    offsetY: rounded(Math.max(-maxOffsetY, Math.min(maxOffsetY, (0.5 - centerY) * displayHeight))),
    rotation: 0,
    flipX: false,
    flipY: false,
  };
}

function baseBundles(
  input: LayoutVisualCompositionInputV1,
  base: LayoutRuleCompositionPlanV1,
  analyses: readonly LayoutShotVisualAnalysisV1[],
): Map<string, ShotBundleV1> {
  const panelByShot = new Map<string, PanelFrameElementV1>();
  const balloonsByShot = new Map<string, BalloonElementV1[]>();
  for (const canvas of base.document.canvases) {
    for (const element of canvas.elements) {
      if (element.type === "panel_frame" && element.contentImage) {
        panelByShot.set(element.contentImage.source.shotId, element);
      } else if (element.type === "balloon" && element.sourceShotId) {
        const values = balloonsByShot.get(element.sourceShotId) ?? [];
        values.push(element);
        balloonsByShot.set(element.sourceShotId, values);
      }
    }
  }
  const sourceByShot = new Map(input.sources.map((source) => [source.source.shotId, source]));
  const analysisByShot = new Map(analyses.map((entry) => [entry.shotId, entry.analysis]));
  const dialogueByShot = new Map<string, LayoutDialogueItemV1[]>();
  for (const item of base.dialogueLedger.items) {
    const values = dialogueByShot.get(item.shotId) ?? [];
    values.push(item);
    dialogueByShot.set(item.shotId, values);
  }
  const result = new Map<string, ShotBundleV1>();
  for (const shot of input.storyboardVersion.document.shots) {
    const source = sourceByShot.get(shot.id);
    const analysis = analysisByShot.get(shot.id);
    const panel = panelByShot.get(shot.id);
    if (!source || !analysis || !panel) fail("LAYOUT_GEOMETRY_INVALID", `missing base bundle for ${shot.id}`);
    result.set(shot.id, {
      context: {
        shot,
        source,
        analysis,
        dialogueItems: (dialogueByShot.get(shot.id) ?? []).sort((left, right) => left.lineOrder - right.lineOrder),
      },
      panel: structuredClone(panel),
      balloons: structuredClone(balloonsByShot.get(shot.id) ?? []),
    });
  }
  return result;
}

function buildPagedCanvases(
  base: LayoutRuleCompositionPlanV1,
  bundles: ReadonlyMap<string, ShotBundleV1>,
  strategy: LayoutVisualCandidateStrategyV1,
  profile: PageProfileV1,
): LayoutCanvasV1[] {
  const pages = packPages(base, bundles, profile, strategy);
  const safeWidth = profile.width - profile.safeArea.left - profile.safeArea.right;
  const availableHeight = profile.height - profile.safeArea.top - profile.safeArea.bottom;
  return pages.map((pageBundles, pageIndex): LayoutCanvasV1 => {
    const rows = pageRows(pageBundles, profile, strategy);
    const naturalHeight = rows.reduce((sum, row) => sum + row.height + row.bandHeight, 0) + PAGE_GAP * Math.max(0, rows.length - 1);
    const scale = naturalHeight > availableHeight ? availableHeight / naturalHeight : 1;
    const scaledGap = PAGE_GAP * scale;
    const totalHeight = rows.reduce((sum, row) => sum + (row.height + row.bandHeight) * scale, 0) + scaledGap * Math.max(0, rows.length - 1);
    let y = profile.safeArea.top + Math.max(0, (availableHeight - totalHeight) / 2);
    const canvasId = stableId("visual_canvas", { strategy, pageIndex, shotIds: pageBundles.map((bundle) => bundle.context.shot.id) });
    const panels: PanelFrameElementV1[] = [];
    const balloons: BalloonElementV1[] = [];
    for (const row of rows) {
      const rowHeight = rounded(row.height * scale);
      const bandHeight = rounded(row.bandHeight * scale);
      const sidecar = row.layout === "sidecar";
      const focusPair = row.layout === "focus_pair";
      const defaultCellWidth = sidecar
        ? safeWidth * sidecarRatio(row.bundles[0]!.context)
        : row.bundles.length === 1 ? safeWidth : (safeWidth - PAGE_GAP) / 2;
      for (const [column, bundle] of row.bundles.entries()) {
        const panel = structuredClone(bundle.panel);
        const sidecarCentered = sidecar && usesMultiSpeakerSidecar(bundle.context);
        const sidecarRight = sidecar && !sidecarCentered && bundle.context.shot.order % 2 === 0;
        const cellWidth = focusPair
          ? column === 0 ? safeWidth * PAGE_FOCUS_LEAD_RATIO : safeWidth - PAGE_GAP - safeWidth * PAGE_FOCUS_LEAD_RATIO
          : defaultCellWidth;
        const cellX = focusPair && column === 1
          ? profile.safeArea.left + safeWidth * PAGE_FOCUS_LEAD_RATIO + PAGE_GAP
          : profile.safeArea.left + column * (defaultCellWidth + PAGE_GAP);
        panel.transform = transform(
          sidecarCentered
            ? profile.safeArea.left + (safeWidth - cellWidth) / 2
            : sidecarRight
            ? profile.safeArea.left + safeWidth - cellWidth
            : cellX,
          y + bandHeight,
          cellWidth,
          rowHeight,
        );
        if (!panel.contentImage) fail("LAYOUT_GEOMETRY_INVALID", `panel image missing for ${bundle.context.shot.id}`);
        panel.contentImage.crop = solveCrop(panel.transform, bundle.context.source, bundle.context.analysis);
        panels.push(panel);
        balloons.push(...structuredClone(bundle.balloons));
      }
      y += rowHeight + bandHeight + scaledGap;
    }
    return {
      id: canvasId,
      kind: "page",
      name: `第 ${pageIndex + 1} 页`,
      width: profile.width,
      height: profile.height,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: panels.map((panel) => panel.id),
      elements: [...panels, ...balloons],
    };
  });
}

function buildStripCanvases(
  base: LayoutRuleCompositionPlanV1,
  bundles: ReadonlyMap<string, ShotBundleV1>,
  strategy: LayoutVisualCandidateStrategyV1,
  profile: StripProfileV1,
): LayoutCanvasV1[] {
  const panelWidth = profile.width - profile.safeInsetX * 2;
  return base.narrativePlan.groups.map((group, groupIndex): LayoutCanvasV1 => {
    const groupBundles = group.shotIds.map((shotId) => bundles.get(shotId)!);
    const slow = group.rhythm === "slow" || group.rhythm === "transition";
    const top = slow ? 132 : 76;
    const bottom = slow ? 148 : 88;
    const gap = group.rhythm === "transition" ? 126 : STRIP_GAP;
    let y = top;
    const panels: PanelFrameElementV1[] = [];
    const balloons: BalloonElementV1[] = [];
    for (const bundle of groupBundles) {
      const aspect = preferredAspect(bundle.context, strategy, 1);
      const natural = panelWidth / aspect;
      const textFloor = bundle.context.dialogueItems.length === 0
        ? 0
        : Math.min(1_460, 300 + dialogueLoad(bundle.context) * (strategy === "dialogue_first" ? 9 : 7));
      const height = Math.round(Math.max(420, Math.min(1_800, Math.max(natural, textFloor))));
      const bandHeight = Math.round(balloonStackHeight(bundle, panelWidth, strategy));
      const panel = structuredClone(bundle.panel);
      panel.transform = transform(profile.safeInsetX, y + bandHeight, panelWidth, height);
      if (!panel.contentImage) fail("LAYOUT_GEOMETRY_INVALID", `panel image missing for ${bundle.context.shot.id}`);
      panel.contentImage.crop = solveCrop(panel.transform, bundle.context.source, bundle.context.analysis);
      panels.push(panel);
      balloons.push(...structuredClone(bundle.balloons));
      y += bandHeight + height + gap;
    }
    const canvasHeight = Math.round(y - gap + bottom);
    if (canvasHeight > 8192) fail("LAYOUT_GEOMETRY_INVALID", `strip section ${group.groupId} exceeds 8192 pixels`);
    return {
      id: stableId("visual_canvas", { strategy, groupIndex, groupId: group.groupId }),
      kind: "strip_section",
      name: `第 ${groupIndex + 1} 段`,
      width: profile.width,
      height: canvasHeight,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: panels.map((panel) => panel.id),
      elements: [...panels, ...balloons],
    };
  });
}

function visualBalloonSize(
  balloon: BalloonElementV1,
  item: LayoutDialogueItemV1,
  panel: PanelFrameElementV1,
  strategy: LayoutVisualCandidateStrategyV1,
): { width: number; height: number; padding: BalloonElementV1["padding"] } {
  const visualRole = inferLayoutSemanticTextRoleV1(item.kind, item.text);
  const caption = visualRole === "caption";
  const widthRatio = caption ? 0.9 : strategy === "dialogue_first" ? 0.86 : strategy === "subject_first" ? 0.68 : 0.77;
  const minimumWidth = caption ? 220 : 250;
  const horizontalRatio = caption
    ? 0.88
    : visualRole === "shout"
      ? 0.62
      : visualRole === "thought"
        ? 0.66
        : 0.7;
  const maximumFontSize = Math.max(...balloon.richText.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.fontSize)));
  const longestLine = Math.max(...item.text.split(/\r?\n/u).map((line) => countLayoutGraphemes(line)));
  const maximumWidth = Math.min(panel.transform.width - 28, panel.transform.width * widthRatio);
  const naturalSpeechWidth = (longestLine * maximumFontSize * 0.96 + 8) / horizontalRatio;
  const width = rounded(Math.max(
    minimumWidth,
    Math.min(maximumWidth, caption ? maximumWidth : naturalSpeechWidth),
  ));
  const innerWidth = Math.max(80, width * horizontalRatio - 8);
  const measurement = evaluateRichTextOverflowV1(balloon.richText, {
    // Keep one em of inline slack for real-font metrics and CJK punctuation
    // line-breaking rules that the deterministic estimator cannot fully model.
    width: Math.max(1, innerWidth - maximumFontSize * 0.5),
    height: 100_000,
  });
  const verticalRatio = caption
    ? 0.78
    : visualRole === "shout"
      ? 0.64
      : visualRole === "thought"
        ? 0.66
        : 0.7;
  const height = rounded(Math.max(
    caption ? maximumFontSize * 2 : maximumFontSize * 2.8,
    measurement.required / verticalRatio + 24,
  ));
  const horizontalPadding = rounded((width - innerWidth) / 2);
  const innerHeight = Math.max(measurement.required + 2, height * verticalRatio);
  const verticalPadding = rounded(Math.max(caption ? 12 : height * 0.12, (height - innerHeight) / 2));
  if (height > panel.transform.height * 0.94 || width > panel.transform.width - 20) {
    fail("LAYOUT_TEXT_OVERFLOW", `visual balloon ${balloon.id} cannot fit its source panel`);
  }
  const padding = {
    top: verticalPadding,
    right: horizontalPadding,
    bottom: verticalPadding,
    left: horizontalPadding,
  };
  const overflow = evaluateRichTextOverflowV1(balloon.richText, {
    width: width - padding.left - padding.right,
    height: height - padding.top - padding.bottom,
  });
  if (overflow.overflow) fail("LAYOUT_TEXT_OVERFLOW", `shape-safe text overflow in ${balloon.id}`);
  return { width, height, padding };
}

function balloonStackHeight(
  bundle: ShotBundleV1,
  panelWidth: number,
  strategy: LayoutVisualCandidateStrategyV1,
): number {
  if (bundle.context.dialogueItems.length === 0) return 0;
  const pseudoPanel = structuredClone(bundle.panel);
  pseudoPanel.transform = transform(0, 0, panelWidth, 8192);
  const sortedBalloons = [...bundle.balloons].sort((left, right) => left.transform.y - right.transform.y || compareUnicodeCodePoints(left.id, right.id));
  const total = bundle.context.dialogueItems.reduce((sum, item, index) => {
    const balloon = sortedBalloons[index];
    if (!balloon) fail("LAYOUT_GEOMETRY_INVALID", `missing balloon for ${item.id}`);
    return sum + visualBalloonSize(balloon, item, pseudoPanel, strategy).height + 12;
  }, 0);
  return rounded(total + 10);
}

function candidatePositions(
  canvas: LayoutCanvasV1,
  allPanels: readonly PanelFrameElementV1[],
  panel: PanelFrameElementV1,
  box: { width: number; height: number },
  safeRegions: readonly LayoutPixelRectV1[],
  item: LayoutDialogueItemV1,
  allowPanelSafeRegions: boolean,
  preferredStackY: number,
  precedingStackHeight: number,
  stackHeight: number,
): Array<{ x: number; y: number; safeRank: number }> {
  const panelRect = { ...panel.transform };
  const result: Array<{ x: number; y: number; safeRank: number; external: boolean }> = [];
  const externalRegions: LayoutPixelRectV1[] = [
    { x: 10, y: panelRect.y, width: panelRect.x - 20, height: panelRect.height },
    { x: panelRect.x + panelRect.width + 10, y: panelRect.y, width: canvas.width - panelRect.x - panelRect.width - 20, height: panelRect.height },
    { x: panelRect.x, y: 10, width: panelRect.width, height: panelRect.y - 20 },
    { x: panelRect.x, y: panelRect.y + panelRect.height + 10, width: panelRect.width, height: canvas.height - panelRect.y - panelRect.height - 20 },
  ].filter((region) => region.width >= box.width && region.height >= box.height);
  const preferredStackPositions = [
    {
      x: panelRect.x + (panelRect.width - box.width) / 2,
      y: preferredStackY,
    },
    {
      x: panelRect.x,
      y: preferredStackY,
    },
    {
      x: panelRect.x + panelRect.width - box.width,
      y: preferredStackY,
    },
  ];
  if (stackHeight <= panelRect.height) {
    preferredStackPositions.push(
      {
        x: panelRect.x - box.width - 10,
        y: panelRect.y + precedingStackHeight,
      },
      {
        x: panelRect.x + panelRect.width + 10,
        y: panelRect.y + precedingStackHeight,
      },
    );
  }
  for (const position of preferredStackPositions) {
    const candidateRect = { ...position, width: box.width, height: box.height };
    const outsideSourcePanel = pixelRectAreaV1(intersectPixelRectsV1(candidateRect, panelRect)) < 1;
    if (
      outsideSourcePanel
      && position.x >= 4
      && position.x + box.width <= canvas.width - 4
      && position.y >= 4
      && position.y + box.height <= canvas.height - 4
      && allPanels.every((other) => (
        other.id === panel.id || pixelRectAreaV1(intersectPixelRectsV1(candidateRect, other.transform)) < 1
      ))
    ) {
      result.push({ ...position, safeRank: -1, external: true });
    }
  }
  for (const [index, region] of externalRegions.entries()) {
    const positions = [
      { x: region.x, y: region.y },
      { x: region.x + region.width - box.width, y: region.y },
      { x: region.x + (region.width - box.width) / 2, y: region.y + (region.height - box.height) / 2 },
      { x: region.x, y: region.y + region.height - box.height },
      { x: region.x + region.width - box.width, y: region.y + region.height - box.height },
    ];
    for (const position of positions) {
      const candidateRect = { ...position, width: box.width, height: box.height };
      if (allPanels.every((other) => other.id === panel.id || pixelRectAreaV1(intersectPixelRectsV1(candidateRect, other.transform)) < 1)) {
        result.push({ ...position, safeRank: index, external: true });
      }
    }
  }
  if (allowPanelSafeRegions) {
    for (const [index, region] of safeRegions.entries()) {
      const clipped = intersectPixelRectsV1(region, panelRect);
      if (clipped.width >= box.width && clipped.height >= box.height) {
        result.push({
          x: item.lineOrder % 2 === 0 ? clipped.x + clipped.width - box.width : clipped.x,
          y: clipped.y,
          safeRank: 20 + index,
          external: false,
        });
      }
    }
  }
  return result.map((candidate) => ({
    x: rounded(candidate.external
      ? Math.max(4, Math.min(canvas.width - box.width - 4, candidate.x))
      : Math.max(panelRect.x + 4, Math.min(panelRect.x + panelRect.width - box.width - 4, candidate.x))),
    y: rounded(candidate.external
      ? Math.max(4, Math.min(canvas.height - box.height - 4, candidate.y))
      : Math.max(panelRect.y + 4, Math.min(panelRect.y + panelRect.height - box.height - 4, candidate.y))),
    safeRank: candidate.safeRank,
  }));
}

function overlapRatio(left: LayoutPixelRectV1, right: LayoutPixelRectV1): number {
  return pixelRectAreaV1(intersectPixelRectsV1(left, right)) / Math.max(1, pixelRectAreaV1(left));
}

function placementSegmentCrossesRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: LayoutPixelRectV1,
  padding = 4,
): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  for (let index = 1; index < 40; index += 1) {
    const ratio = index / 40;
    const x = start.x + (end.x - start.x) * ratio;
    const y = start.y + (end.y - start.y) * ratio;
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }
  return false;
}

function orientation(
  first: { x: number; y: number },
  second: { x: number; y: number },
  third: { x: number; y: number },
): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function placementSegmentsCross(left: BalloonTailSegmentV1, right: BalloonTailSegmentV1): boolean {
  const first = orientation(left.start, left.end, right.start);
  const second = orientation(left.start, left.end, right.end);
  const third = orientation(right.start, right.end, left.start);
  const fourth = orientation(right.start, right.end, left.end);
  return (first === 0 || second === 0 || Math.sign(first) !== Math.sign(second))
    && (third === 0 || fourth === 0 || Math.sign(third) !== Math.sign(fourth));
}

function speakerTailTarget(
  subject: ProjectedBalloonSubjectV1,
  balloonRect: LayoutPixelRectV1,
): { x: number; y: number } {
  let x = subject.body.x + subject.body.width * 0.5;
  let y = subject.body.y + subject.body.height * 0.42;
  if (subject.face) {
    const shoulderInset = Math.max(12, subject.body.width * 0.055);
    const leftShoulder = Math.max(subject.body.x + subject.body.width * 0.14, subject.face.x - shoulderInset);
    const rightShoulder = Math.min(subject.body.x + subject.body.width * 0.86, subject.face.x + subject.face.width + shoulderInset);
    const balloonCenterX = balloonRect.x + balloonRect.width * 0.5;
    x = Math.abs(balloonCenterX - leftShoulder) <= Math.abs(balloonCenterX - rightShoulder)
      ? leftShoulder
      : rightShoulder;
    y = Math.min(
      subject.body.y + subject.body.height * 0.76,
      subject.face.y + subject.face.height + Math.max(12, subject.body.height * 0.035),
    );
  }
  return { x: rounded(x), y: rounded(y) };
}

function balloonTailSegment(
  balloonRect: LayoutPixelRectV1,
  target: { x: number; y: number },
): BalloonTailSegmentV1 {
  const targetX = target.x - balloonRect.x;
  const targetY = target.y - balloonRect.y;
  const rootRatio = balloonTailRootRatioForTargetV1({
    width: balloonRect.width,
    height: balloonRect.height,
    targetX,
    targetY,
  });
  const root = resolveBalloonTailRootV1(balloonRect.width, balloonRect.height, {
    enabled: true,
    rootRatio,
    targetX,
    targetY,
    baseWidth: 32,
  });
  return {
    start: { x: balloonRect.x + root.x, y: balloonRect.y + root.y },
    end: target,
  };
}

function placeBalloons(
  document: LayoutDocumentV2,
  base: LayoutRuleCompositionPlanV1,
  contexts: ReadonlyMap<string, VisualContextV1>,
  strategy: LayoutVisualCandidateStrategyV1,
): void {
  const itemById = new Map(base.dialogueLedger.items.map((item) => [item.id, item]));
  const bindingByElement = new Map(document.automation.dialogueBindings.flatMap((binding) => (
    binding.elementId ? [[binding.elementId, binding] as const] : []
  )));
  for (const canvas of document.canvases) {
    const panels = canvas.elements.filter((element): element is PanelFrameElementV1 => element.type === "panel_frame" && !!element.contentImage);
    const panelByShot = new Map(panels.map((panel) => [panel.contentImage!.source.shotId, panel]));
    const projected = new Map<string, {
      subjects: ProjectedBalloonSubjectV1[];
      bodies: LayoutPixelRectV1[];
      faces: LayoutPixelRectV1[];
      safe: LayoutPixelRectV1[];
    }>();
    for (const panel of panels) {
      const shotId = panel.contentImage!.source.shotId;
      const context = contexts.get(shotId)!;
      const projection = projectCoverCropV1({
        frame: panel.transform,
        sourceWidth: context.source.width,
        sourceHeight: context.source.height,
        crop: panel.contentImage!.crop,
      });
      const subjects = context.analysis.subjects.filter((subject) => subject.confidence >= HIGH_CONFIDENCE)
        .map((subject): ProjectedBalloonSubjectV1 => ({
          characterId: subject.characterId,
          body: intersectPixelRectsV1(projectNormalizedRectToCanvasV1(subject.bodyBox, projection), panel.transform),
          face: subject.faceBox
            ? intersectPixelRectsV1(projectNormalizedRectToCanvasV1(subject.faceBox, projection), panel.transform)
            : null,
        }));
      const focalRegions = context.analysis.focalRegions
        .filter((region) => region.weight >= 0.65)
        .map((region) => intersectPixelRectsV1(
          projectNormalizedRectToCanvasV1(region.box, projection),
          panel.transform,
        ));
      projected.set(shotId, {
        subjects,
        bodies: [...subjects.map((subject) => subject.body), ...focalRegions],
        faces: subjects.flatMap((subject) => subject.face ? [subject.face] : []),
        safe: context.analysis.textSafeRegions
          .filter((region) => region.score >= 0.55)
          .sort((left, right) => right.score - left.score)
          .map((region) => intersectPixelRectsV1(projectNormalizedRectToCanvasV1(region.box, projection), panel.transform)),
      });
    }
    const occupied: LayoutPixelRectV1[] = [];
    const occupiedTails: BalloonTailSegmentV1[] = [];
    const balloons = canvas.elements.filter((element): element is BalloonElementV1 => element.type === "balloon");
    balloons.sort((left, right) => {
      const leftItem = itemById.get(bindingByElement.get(left.id)?.dialogueItemId ?? "");
      const rightItem = itemById.get(bindingByElement.get(right.id)?.dialogueItemId ?? "");
      const leftShot = contexts.get(left.sourceShotId ?? "")?.shot.order ?? 0;
      const rightShot = contexts.get(right.sourceShotId ?? "")?.shot.order ?? 0;
      return leftShot - rightShot || (leftItem?.lineOrder ?? 0) - (rightItem?.lineOrder ?? 0);
    });
    const placementSizes = new Map<string, ReturnType<typeof visualBalloonSize>>();
    for (const candidateBalloon of balloons) {
      const candidateBinding = bindingByElement.get(candidateBalloon.id);
      const candidateItem = candidateBinding ? itemById.get(candidateBinding.dialogueItemId) : undefined;
      const candidateShotId = candidateBalloon.sourceShotId;
      const candidatePanel = candidateShotId ? panelByShot.get(candidateShotId) : undefined;
      if (!candidateItem || !candidatePanel) {
        fail("LAYOUT_GEOMETRY_INVALID", `balloon ${candidateBalloon.id} lost its source panel`);
      }
      placementSizes.set(
        candidateBalloon.id,
        visualBalloonSize(candidateBalloon, candidateItem, candidatePanel, strategy),
      );
    }
    for (const balloon of balloons) {
      const binding = bindingByElement.get(balloon.id);
      const item = binding ? itemById.get(binding.dialogueItemId) : undefined;
      const shotId = balloon.sourceShotId;
      const panel = shotId ? panelByShot.get(shotId) : undefined;
      const context = shotId ? contexts.get(shotId) : undefined;
      const regions = shotId ? projected.get(shotId) : undefined;
      if (!item || !panel || !context || !regions) fail("LAYOUT_GEOMETRY_INVALID", `balloon ${balloon.id} lost its source panel`);
      const size = placementSizes.get(balloon.id)!;
      balloon.transform.width = size.width;
      balloon.transform.height = size.height;
      balloon.padding = size.padding;
      balloon.verticalAlign = "center";
      const allSubjects = [...projected.values()].flatMap((value) => value.subjects);
      const allBodies = [...projected.values()].flatMap((value) => value.bodies);
      const allFaces = allSubjects.flatMap((subject) => subject.face ? [subject.face] : []);
      const shotBalloons = balloons.filter((candidate) => candidate.sourceShotId === shotId);
      const stackIndex = shotBalloons.findIndex((candidate) => candidate.id === balloon.id);
      const stackHeight = shotBalloons.reduce((sum, candidate, index) => (
        sum + placementSizes.get(candidate.id)!.height + (index === shotBalloons.length - 1 ? 0 : 12)
      ), 0);
      const precedingStackHeight = shotBalloons.slice(0, stackIndex).reduce((sum, candidate) => (
        sum + placementSizes.get(candidate.id)!.height + 12
      ), 0);
      const stackStartY = Math.max(10, panel.transform.y - stackHeight - 10);
      const desiredStackY = stackStartY + precedingStackHeight;
      const stackFitsAbove = panel.transform.y - stackStartY >= stackHeight;
      const candidates = candidatePositions(
        canvas,
        panels,
        panel,
        size,
        regions.safe,
        item,
        context.analysis.mode === "vision",
        desiredStackY,
        precedingStackHeight,
        stackHeight,
      );
      const mappedSubject = item.speakerCharacterId === null
        || !context.analysis.subjects.some((subject) => subject.characterId === item.speakerCharacterId && subject.confidence >= 0.7)
        ? undefined
        : regions.subjects.find((subject) => subject.characterId === item.speakerCharacterId);
      const scored = candidates.map((candidate) => {
        const rect = { x: candidate.x, y: candidate.y, width: size.width, height: size.height };
        const faceOverlap = allFaces.reduce((sum, face) => sum + pixelRectAreaV1(intersectPixelRectsV1(rect, face)), 0);
        const bodyOverlap = allBodies.reduce((sum, body) => sum + overlapRatio(rect, body), 0);
        const occupiedOverlap = occupied.reduce((sum, value) => sum + overlapRatio(rect, value), 0);
        const captionBias = item.kind === "caption" ? Math.max(0, candidate.y - panel.transform.y) * 0.03 : 0;
        const rankPenalty = candidate.safeRank * 0.05;
        const horizontalGap = Math.max(0, panel.transform.x - (rect.x + rect.width), rect.x - (panel.transform.x + panel.transform.width));
        const verticalGap = Math.max(0, panel.transform.y - (rect.y + rect.height), rect.y - (panel.transform.y + panel.transform.height));
        const panelOverlap = pixelRectAreaV1(intersectPixelRectsV1(rect, panel.transform));
        const alignedX = rect.x + rect.width >= panel.transform.x && rect.x <= panel.transform.x + panel.transform.width;
        const alignedY = rect.y + rect.height >= panel.transform.y && rect.y <= panel.transform.y + panel.transform.height;
        const anchoredNearPanel = panelOverlap >= pixelRectAreaV1(rect) * 0.82
          || (horizontalGap <= 72 && alignedY)
          || (verticalGap <= 72 && alignedX);
        const distancePenalty = (horizontalGap + verticalGap) * 1.5;
        const strategyBodyWeight = strategy === "subject_first" ? 3_400 : strategy === "dialogue_first" ? 1_800 : 2_700;
        const tailTarget = item.kind === "caption" || !mappedSubject ? null : speakerTailTarget(mappedSubject, rect);
        const sourceLinkPenalty = !tailTarget && !anchoredNearPanel
          ? 26_000 + (horizontalGap + verticalGap) * 20
          : 0;
        const tailSegment = tailTarget ? balloonTailSegment(rect, tailTarget) : null;
        const tailFaceCrossings = tailSegment
          ? allFaces.filter((face) => placementSegmentCrossesRect(tailSegment.start, tailSegment.end, face)).length
          : 0;
        const tailBodyCrossings = tailSegment
          ? allSubjects.filter((subject) => subject !== mappedSubject
            && placementSegmentCrossesRect(tailSegment.start, tailSegment.end, subject.body)).length
          : 0;
        const tailBalloonCrossings = tailSegment
          ? occupied.filter((value) => placementSegmentCrossesRect(tailSegment.start, tailSegment.end, value)).length
          : 0;
        const tailCrossings = tailSegment
          ? occupiedTails.filter((value) => placementSegmentsCross(tailSegment, value)).length
          : 0;
        const coveredTailCount = occupiedTails.filter((value) => (
          placementSegmentCrossesRect(value.start, value.end, rect, 1)
        )).length;
        const tailDistance = tailSegment
          ? Math.hypot(tailSegment.end.x - tailSegment.start.x, tailSegment.end.y - tailSegment.start.y)
          : 0;
        const entirelyAbovePanel = rect.y + rect.height <= panel.transform.y - 4;
        const readingStackPenalty = entirelyAbovePanel
          ? Math.abs(rect.y - desiredStackY) * 8
          : stackFitsAbove ? 8_000 : 0;
        return {
          candidate,
          rect,
          tailTarget,
          tailSegment,
          occupiedOverlap,
          score: faceOverlap * 10_000
            + bodyOverlap * strategyBodyWeight
            + occupiedOverlap * 8_000
            + tailFaceCrossings * 18_000
            + tailBodyCrossings * 14_000
            + tailBalloonCrossings * 16_000
            + tailCrossings * 16_000
            + coveredTailCount * 18_000
            + tailDistance * 0.12
            + distancePenalty
            + sourceLinkPenalty
            + readingStackPenalty
            + captionBias
            + rankPenalty,
        };
      }).sort((left, right) => left.score - right.score || left.candidate.y - right.candidate.y || left.candidate.x - right.candidate.x);
      const selected = scored.find((candidate) => candidate.occupiedOverlap <= 0.000_001);
      if (!selected) fail("LAYOUT_GEOMETRY_INVALID", `balloon ${balloon.id} has no placement candidate`);
      balloon.transform.x = selected.candidate.x;
      balloon.transform.y = selected.candidate.y;
      occupied.push(selected.rect);

      if (item.kind === "caption" || !mappedSubject) {
        balloon.tail.enabled = false;
      } else {
        const target = selected.tailTarget ?? speakerTailTarget(mappedSubject, selected.rect);
        balloon.tail.enabled = true;
        balloon.tail.targetX = rounded(target.x - balloon.transform.x);
        balloon.tail.targetY = rounded(target.y - balloon.transform.y);
        balloon.tail.rootRatio = balloonTailRootRatioForTargetV1({
          width: balloon.transform.width,
          height: balloon.transform.height,
          targetX: balloon.tail.targetX,
          targetY: balloon.tail.targetY,
        });
        balloon.tail.baseWidth = rounded(Math.max(24, Math.min(58, balloon.transform.width * 0.07)));
        occupiedTails.push(selected.tailSegment ?? balloonTailSegment(selected.rect, target));
      }
    }
  }
}

function buildCandidateCanvases(
  input: LayoutVisualCompositionInputV1,
  base: LayoutRuleCompositionPlanV1,
  analyses: readonly LayoutShotVisualAnalysisV1[],
  strategy: LayoutVisualCandidateStrategyV1,
): LayoutCanvasV1[] {
  const bundles = baseBundles(input, base, analyses);
  if (input.profile.kind === "paged") {
    return buildPagedCanvases(base, bundles, strategy, input.profile);
  }
  return buildStripCanvases(base, bundles, strategy, input.profile);
}

function imageContext(sources: readonly LayoutSourceCatalogItemV1[]): Record<string, { width: number; height: number; ready: true }> {
  return Object.fromEntries(sources.map((source) => [source.source.assetId, {
    width: source.width,
    height: source.height,
    ready: true as const,
  }]));
}

function buildCandidate(
  input: LayoutVisualCompositionInputV1,
  base: LayoutRuleCompositionPlanV1,
  analyses: readonly LayoutShotVisualAnalysisV1[],
  visualAnalysisSetDigest: LayoutDigest,
  strategy: LayoutVisualCandidateStrategyV1,
  mode: "vision" | "rule_fallback",
): CandidateBuildV1 {
  const draft = structuredClone(base.document);
  draft.canvases = buildCandidateCanvases(input, base, analyses, strategy);
  const contextByShot = new Map(input.storyboardVersion.document.shots.map((shot) => {
    const source = input.sources.find((item) => item.source.shotId === shot.id)!;
    const analysis = analyses.find((item) => item.shotId === shot.id)!.analysis;
    return [shot.id, {
      shot,
      source,
      analysis,
      dialogueItems: base.dialogueLedger.items.filter((item) => item.shotId === shot.id),
    } satisfies VisualContextV1] as const;
  }));
  placeBalloons(draft, base, contextByShot, strategy);
  const visible = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(draft), {
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
    imageByAssetId: imageContext(input.sources),
  });
  const score = scoreVisualLayoutCandidateV1({
    document: draft,
    storyboard: input.storyboardVersion.document,
    dialogueLedger: base.dialogueLedger,
    sources: input.sources,
    analyses,
  });
  if (!score.hardGatePassed) {
    fail("LAYOUT_COMPOSITION_NO_VALID_PLAN", `${strategy} candidate failed hard gates: ${score.issues.join(", ")}`);
  }
  assertInitialLayoutDialogueCoverageV1(draft, base.dialogueLedger);
  const planDigest = digestCanonicalJson({
    policyVersion: "layout_visual_candidate_plan_v1",
    strategy,
    storyboardDigest: input.storyboardVersion.documentDigest,
    sourceLockSetDigest: input.sourceLockSetDigest,
    visualAnalysisSetDigest,
    dialogueLedgerDigest: base.dialogueLedger.ledgerDigest,
    narrativePlanDigest: base.narrativePlan.planDigest,
    visibleDocumentDigest: visible.digest,
  });
  const bindingDigest = digestCanonicalJson(draft.automation.dialogueBindings);
  draft.automation.composition = {
    compositionDigest: digestLayoutCompositionV1({
      compositionPolicyVersion: "layout_composition_v1",
      storyboardVersionId: input.storyboardVersion.id,
      storyboardDigest: input.storyboardVersion.documentDigest,
      sourceLockSetDigest: input.sourceLockSetDigest,
      visualAnalysisSetDigest,
      mode,
      planDigest,
      initialVisibleDocumentDigest: visible.digest,
      initialDialogueBindingsDigest: bindingDigest,
    }),
    compositionPolicyVersion: "layout_composition_v1",
    storyboardVersionId: input.storyboardVersion.id,
    storyboardDigest: input.storyboardVersion.documentDigest,
    sourceLockSetDigest: input.sourceLockSetDigest,
    visualAnalysisSetDigest,
    mode,
  };
  const encoded = LayoutDocumentCodecV2.encode(draft, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    comicFormat: input.comicFormat,
    imageByAssetId: imageContext(input.sources),
  });
  if (LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(encoded.value)).digest !== visible.digest) {
    fail("LAYOUT_GEOMETRY_INVALID", `${strategy} V2 projection changed visible geometry`);
  }
  return {
    strategy,
    planDigest,
    visibleDocumentDigest: visible.digest,
    documentDigest: encoded.digest,
    repairRounds: 0,
    document: encoded.value,
    score,
  };
}

function compareCandidates(left: CandidateBuildV1, right: CandidateBuildV1): number {
  const dimensions: Array<keyof LayoutCompositionQualityScoreV1["dimensions"]> = [
    "contentReadability",
    "subjectCropProtection",
    "narrativeRhythm",
    "layoutBalance",
    "stability",
  ];
  if (left.score.total !== right.score.total) return right.score.total - left.score.total;
  for (const dimension of dimensions) {
    const delta = right.score.dimensions[dimension] - left.score.dimensions[dimension];
    if (delta !== 0) return delta;
  }
  return compareUnicodeCodePoints(left.planDigest, right.planDigest);
}

function analysisMode(analyses: readonly LayoutShotVisualAnalysisV1[]): "vision" | "mixed" | "rule_fallback" {
  const vision = analyses.filter((entry) => entry.analysis.mode === "vision").length;
  if (vision === 0) return "rule_fallback";
  if (vision === analyses.length) return "vision";
  return "mixed";
}

export function composeVisuallyGuidedLayoutV1(
  input: LayoutVisualCompositionInputV1,
): LayoutVisualCompositionPlanV1 {
  let base: LayoutRuleCompositionPlanV1;
  try {
    base = composeRuleBasedLayoutV1(input);
  } catch (error) {
    if (error instanceof LayoutRuleCompositionError) {
      const code = error.code === "LAYOUT_TEXT_OVERFLOW" ? "LAYOUT_TEXT_OVERFLOW"
        : error.code === "LAYOUT_COMPOSITION_SOURCE_INVALID" ? "LAYOUT_COMPOSITION_SOURCE_INVALID"
          : "LAYOUT_GEOMETRY_INVALID";
      fail(code, error.message);
    }
    throw error;
  }
  const resolved = resolveAnalyses(input);
  const visualAnalysisSetDigest = digestLayoutVisualAnalysisSetV1(resolved.entries);
  const mode = resolved.entries.some((entry) => entry.analysis.mode === "vision") ? "vision" : "rule_fallback";
  const candidates: CandidateBuildV1[] = [];
  const candidateIssues: LayoutVisualCompositionIssueV1[] = [];
  const candidateFailures: string[] = [];
  for (const strategy of ["balanced", "subject_first", "dialogue_first"] as const) {
    try {
      candidates.push(buildCandidate(input, base, resolved.entries, visualAnalysisSetDigest, strategy, mode));
    } catch (error) {
      candidateFailures.push(`${strategy}: ${error instanceof Error ? error.message : String(error)}`);
      candidateIssues.push({
        code: error instanceof LayoutVisualCompositionError ? error.code : "LAYOUT_COMPOSITION_NO_VALID_PLAN",
        severity: "warning",
        shotId: null,
        elementId: null,
      });
    }
  }
  if (candidates.length === 0) {
    fail("LAYOUT_COMPOSITION_NO_VALID_PLAN", `all visual layout candidates failed hard gates: ${candidateFailures.join(" | ")}`);
  }
  candidates.sort(compareCandidates);
  const selected = input.avoidVisibleDocumentDigest
    ? candidates.find((candidate) => candidate.visibleDocumentDigest !== input.avoidVisibleDocumentDigest)
      ?? candidates[0]!
    : candidates[0]!;
  const dialogueCoverage = assertInitialLayoutDialogueCoverageV1(selected.document, base.dialogueLedger);
  const placedShots = selected.score.panels.length;
  const qualityIssues: LayoutVisualCompositionIssueV1[] = [
    ...selected.score.panels.flatMap((panel) => panel.issues.map((code) => ({
      code,
      severity: "warning" as const,
      shotId: panel.shotId,
      elementId: panel.panelId,
    }))),
    ...selected.score.balloons.flatMap((balloon) => balloon.issues.map((code) => ({
      code,
      severity: "warning" as const,
      shotId: balloon.shotId,
      elementId: balloon.elementId,
    }))),
  ];
  return {
    schemaVersion: 1,
    policyVersion: "layout_visual_composition_v1",
    mode,
    planDigest: selected.planDigest,
    visibleDocumentDigest: selected.visibleDocumentDigest,
    documentDigest: selected.documentDigest,
    visualAnalysisSetDigest,
    analyses: resolved.entries,
    candidates: candidates.map((candidate) => ({
      strategy: candidate.strategy,
      status: "valid",
      planDigest: candidate.planDigest,
      visibleDocumentDigest: candidate.visibleDocumentDigest,
      documentDigest: candidate.documentDigest,
      repairRounds: candidate.repairRounds,
      score: candidate.score,
    })),
    document: selected.document,
    report: {
      policyVersion: "layout_visual_composition_report_v1",
      analysisMode: analysisMode(resolved.entries),
      visualAnalysisSetDigest,
      selectedStrategy: selected.strategy,
      selectedPlanDigest: selected.planDigest,
      candidateCount: candidates.length,
      repairRounds: selected.repairRounds,
      shotCoverage: { expected: input.storyboardVersion.document.shots.length, placed: placedShots },
      dialogueCoverage,
      silentRewriteCount: 0,
      textOverflowCount: 0,
      quality: selected.score,
      issues: [...resolved.issues, ...candidateIssues, ...qualityIssues],
    },
  };
}
