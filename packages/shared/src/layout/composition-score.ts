import type { StoryboardDocumentV2 } from "../versioning/document-contract.js";
import type { LayoutDocumentV2 } from "./automation.js";
import { resolveBalloonTailRootV1 } from "./balloon.js";
import type {
  BalloonElementV1,
  CoverCropV1,
  LayoutCanvasV1,
  LayoutSourceBindingProjectionV1,
  LayoutTransformV1,
  PanelFrameElementV1,
} from "./document.js";
import type { LayoutDialogueItemV1, LayoutDialogueLedgerV1 } from "./dialogue.js";
import { evaluateRichTextOverflowV1 } from "./font.js";
import { normalizeLayoutNumber } from "./geometry.js";
import { countLayoutGraphemes } from "./text.js";
import type { LayoutSourceCatalogItemV1 } from "./working-copy.js";
import type {
  LayoutImageAnalysisV1,
  LayoutNormalizedRectV1,
  LayoutShotVisualAnalysisV1,
} from "./visual-analysis.js";

export interface LayoutPixelRectV1 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutPanelQualityV1 {
  shotId: string;
  canvasId: string;
  panelId: string;
  geometryOk: boolean;
  layoutOk: boolean;
  cropOk: boolean;
  readingOrderOk: boolean;
  subjectOcclusionOk: boolean;
  bodyVisibility: number;
  faceVisibility: number;
  directUsable: boolean;
  issues: string[];
}

export interface LayoutBalloonQualityV1 {
  dialogueItemId: string;
  shotId: string;
  canvasId: string;
  elementId: string;
  balloonGeometryOk: boolean;
  balloonTypeOk: boolean;
  textFitOk: boolean;
  tailOk: boolean;
  shapeSafeOk: boolean;
  directUsable: boolean;
  issues: string[];
}

export interface LayoutCompositionScoreDimensionsV1 {
  contentReadability: number;
  subjectCropProtection: number;
  narrativeRhythm: number;
  layoutBalance: number;
  stability: number;
}

export interface LayoutCompositionQualityScoreV1 {
  policyVersion: "layout_composition_score_v1";
  total: number;
  dimensions: LayoutCompositionScoreDimensionsV1;
  hardGatePassed: boolean;
  panelDirectUsableRate: number;
  balloonDirectUsableRate: number;
  panels: LayoutPanelQualityV1[];
  balloons: LayoutBalloonQualityV1[];
  issues: string[];
}

export interface ScoreVisualLayoutCandidateInputV1 {
  document: LayoutDocumentV2;
  storyboard: StoryboardDocumentV2;
  dialogueLedger: LayoutDialogueLedgerV1;
  sources: readonly LayoutSourceCatalogItemV1[];
  analyses: readonly LayoutShotVisualAnalysisV1[];
}

function rounded(value: number): number {
  return normalizeLayoutNumber(value);
}

export function pixelRectAreaV1(value: LayoutPixelRectV1): number {
  return Math.max(0, value.width) * Math.max(0, value.height);
}

export function intersectPixelRectsV1(left: LayoutPixelRectV1, right: LayoutPixelRectV1): LayoutPixelRectV1 {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x: rounded(x),
    y: rounded(y),
    width: rounded(Math.max(0, rightEdge - x)),
    height: rounded(Math.max(0, bottomEdge - y)),
  };
}

function containsRect(outer: LayoutPixelRectV1, inner: LayoutPixelRectV1, tolerance = 0.5): boolean {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function transformRect(value: LayoutTransformV1): LayoutPixelRectV1 {
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function segmentCrossesRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: LayoutPixelRectV1,
  padding = 4,
): boolean {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
  for (let index = 1; index <= 40; index += 1) {
    const ratio = index / 40;
    const point = {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
      width: 1,
      height: 1,
    };
    if (containsRect(expanded, point, 0)) return true;
  }
  return false;
}

interface LayoutTailSegmentV1 {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function segmentOrientation(
  first: { x: number; y: number },
  second: { x: number; y: number },
  third: { x: number; y: number },
): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function tailSegmentsCross(left: LayoutTailSegmentV1, right: LayoutTailSegmentV1): boolean {
  const first = segmentOrientation(left.start, left.end, right.start);
  const second = segmentOrientation(left.start, left.end, right.end);
  const third = segmentOrientation(right.start, right.end, left.start);
  const fourth = segmentOrientation(right.start, right.end, left.end);
  return (first === 0 || second === 0 || Math.sign(first) !== Math.sign(second))
    && (third === 0 || fourth === 0 || Math.sign(third) !== Math.sign(fourth));
}

export interface LayoutCoverProjectionV1 {
  scale: number;
  displayWidth: number;
  displayHeight: number;
  originX: number;
  originY: number;
  visibleSourceRect: LayoutNormalizedRectV1;
}

export function projectCoverCropV1(input: {
  frame: LayoutPixelRectV1;
  sourceWidth: number;
  sourceHeight: number;
  crop: CoverCropV1;
}): LayoutCoverProjectionV1 {
  const baseScale = Math.max(input.frame.width / input.sourceWidth, input.frame.height / input.sourceHeight);
  const scale = baseScale * input.crop.zoom;
  const displayWidth = input.sourceWidth * scale;
  const displayHeight = input.sourceHeight * scale;
  const originX = input.frame.x + input.frame.width / 2 + input.crop.offsetX - displayWidth / 2;
  const originY = input.frame.y + input.frame.height / 2 + input.crop.offsetY - displayHeight / 2;
  const visibleX = (input.frame.x - originX) / displayWidth;
  const visibleY = (input.frame.y - originY) / displayHeight;
  return {
    scale: rounded(scale),
    displayWidth: rounded(displayWidth),
    displayHeight: rounded(displayHeight),
    originX: rounded(originX),
    originY: rounded(originY),
    visibleSourceRect: {
      x: rounded(Math.max(0, visibleX)),
      y: rounded(Math.max(0, visibleY)),
      width: rounded(Math.min(1, input.frame.width / displayWidth)),
      height: rounded(Math.min(1, input.frame.height / displayHeight)),
    },
  };
}

export function projectNormalizedRectToCanvasV1(
  value: LayoutNormalizedRectV1,
  projection: LayoutCoverProjectionV1,
): LayoutPixelRectV1 {
  return {
    x: rounded(projection.originX + value.x * projection.displayWidth),
    y: rounded(projection.originY + value.y * projection.displayHeight),
    width: rounded(value.width * projection.displayWidth),
    height: rounded(value.height * projection.displayHeight),
  };
}

function normalizedVisibility(
  region: LayoutNormalizedRectV1,
  visible: LayoutNormalizedRectV1,
): number {
  const intersection = intersectPixelRectsV1(region, visible);
  const area = region.width * region.height;
  return area <= 0 ? 1 : Math.min(1, pixelRectAreaV1(intersection) / area);
}

function panelByShot(document: LayoutDocumentV2): Map<string, { canvas: LayoutCanvasV1; panel: PanelFrameElementV1 }> {
  const result = new Map<string, { canvas: LayoutCanvasV1; panel: PanelFrameElementV1 }>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type !== "panel_frame" || element.hidden || !element.contentImage || element.contentImage.hidden) continue;
      result.set(element.contentImage.source.shotId, { canvas, panel: element });
    }
  }
  return result;
}

function balloonsById(document: LayoutDocumentV2): Map<string, { canvas: LayoutCanvasV1; balloon: BalloonElementV1 }> {
  const result = new Map<string, { canvas: LayoutCanvasV1; balloon: BalloonElementV1 }>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type === "balloon" && !element.hidden) result.set(element.id, { canvas, balloon: element });
    }
  }
  return result;
}

function expectedMappedSubject(item: LayoutDialogueItemV1, analysis: LayoutImageAnalysisV1): boolean {
  if (item.kind === "caption" || item.speakerCharacterId === null) return false;
  return analysis.subjects.some((subject) => (
    subject.confidence >= 0.7 && subject.characterId === item.speakerCharacterId
  ));
}

function scorePanels(input: ScoreVisualLayoutCandidateInputV1): {
  panels: LayoutPanelQualityV1[];
  projectedSubjects: Array<{ canvasId: string; shotId: string; characterId: string | null; body: LayoutPixelRectV1; face: LayoutPixelRectV1 | null }>;
} {
  const panels = panelByShot(input.document);
  const sourceByShot = new Map(input.sources.map((source) => [source.source.shotId, source]));
  const analysisByShot = new Map(input.analyses.map((entry) => [entry.shotId, entry.analysis]));
  const dialogueByShot = new Map<string, LayoutDialogueItemV1[]>();
  for (const item of input.dialogueLedger.items) {
    const values = dialogueByShot.get(item.shotId) ?? [];
    values.push(item);
    dialogueByShot.set(item.shotId, values);
  }
  const pageRhythmByCanvas = new Map<string, boolean>();
  for (const canvas of input.document.canvases) {
    if (canvas.kind !== "page") {
      pageRhythmByCanvas.set(canvas.id, true);
      continue;
    }
    const pagePanels = canvas.elements.filter((element): element is PanelFrameElementV1 => (
      element.type === "panel_frame" && !element.hidden && !!element.contentImage && !element.contentImage.hidden
    ));
    const pageBalloons = canvas.elements.filter((element): element is BalloonElementV1 => element.type === "balloon" && !element.hidden);
    const shotIds = pagePanels.map((panel) => panel.contentImage!.source.shotId);
    const hasSpecialFocus = shotIds.some((shotId) => {
      const shot = input.storyboard.shots.find((item) => item.id === shotId);
      const dialogue = dialogueByShot.get(shotId) ?? [];
      return shot?.comic.panelRhythm === "impact"
        || dialogue.length >= 3
        || dialogue.reduce((sum, item) => sum + countLayoutGraphemes(item.text), 0) > 72;
    });
    const occupiedArea = [...pagePanels, ...pageBalloons].reduce((sum, element) => (
      sum + pixelRectAreaV1(intersectPixelRectsV1(transformRect(element.transform), {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      }))
    ), 0);
    const occupiedRatio = occupiedArea / Math.max(1, canvas.width * canvas.height);
    const countOk = pagePanels.length >= 2 && pagePanels.length <= 6
      || pagePanels.length === 1 && hasSpecialFocus;
    const minimumOccupiedRatio = pagePanels.length === 1 ? 0.24 : pagePanels.length === 2 ? 0.28 : 0.32;
    pageRhythmByCanvas.set(canvas.id, countOk && occupiedRatio >= minimumOccupiedRatio);
  }
  const projectedSubjects: Array<{ canvasId: string; shotId: string; characterId: string | null; body: LayoutPixelRectV1; face: LayoutPixelRectV1 | null }> = [];
  const readingOkByShot = new Map<string, boolean>();
  for (const canvas of input.document.canvases) {
    let previousOrder = 0;
    const panelMap = new Map(canvas.elements.filter((element): element is PanelFrameElementV1 => element.type === "panel_frame")
      .map((panel) => [panel.id, panel]));
    for (const panelId of canvas.panelReadingOrder) {
      const panel = panelMap.get(panelId);
      const shotId = panel?.contentImage?.source.shotId;
      const order = input.storyboard.shots.find((shot) => shot.id === shotId)?.order ?? -1;
      if (shotId) readingOkByShot.set(shotId, order > previousOrder);
      previousOrder = Math.max(previousOrder, order);
    }
  }

  const quality = input.storyboard.shots.map((shot): LayoutPanelQualityV1 => {
    const target = panels.get(shot.id);
    const source = sourceByShot.get(shot.id);
    const analysis = analysisByShot.get(shot.id);
    const issues: string[] = [];
    if (!target || !source || !analysis || !target.panel.contentImage) {
      return {
        shotId: shot.id,
        canvasId: target?.canvas.id ?? "missing",
        panelId: target?.panel.id ?? "missing",
        geometryOk: false,
        layoutOk: false,
        cropOk: false,
        readingOrderOk: false,
        subjectOcclusionOk: false,
        bodyVisibility: 0,
        faceVisibility: 0,
        directUsable: false,
        issues: ["missing_panel_source_or_analysis"],
      };
    }
    const canvasBounds = { x: 0, y: 0, width: target.canvas.width, height: target.canvas.height };
    const panelRect = transformRect(target.panel.transform);
    const aspect = panelRect.width / panelRect.height;
    const geometryOk = containsRect(canvasBounds, panelRect)
      && panelRect.width >= 180
      && panelRect.height >= 180
      && aspect >= 0.28
      && aspect <= 3.8;
    const pageRhythmOk = pageRhythmByCanvas.get(target.canvas.id) === true;
    const layoutOk = geometryOk && pageRhythmOk;
    if (!geometryOk) issues.push("panel_geometry_unusable");
    if (!pageRhythmOk) issues.push("page_rhythm_underfilled");
    const readingOrderOk = readingOkByShot.get(shot.id) === true;
    if (!readingOrderOk) issues.push("reading_order_invalid");
    const projection = projectCoverCropV1({
      frame: panelRect,
      sourceWidth: source.width,
      sourceHeight: source.height,
      crop: target.panel.contentImage.crop,
    });
    const requiredSubjects = analysis.subjects.filter((subject) => subject.confidence >= 0.65 && subject.importance >= 0.45);
    const bodyVisibility = requiredSubjects.length === 0
      ? 1
      : Math.min(...requiredSubjects.map((subject) => normalizedVisibility(subject.bodyBox, projection.visibleSourceRect)));
    const faces = requiredSubjects.flatMap((subject) => subject.faceBox ? [subject.faceBox] : []);
    const faceVisibility = faces.length === 0
      ? 1
      : Math.min(...faces.map((face) => normalizedVisibility(face, projection.visibleSourceRect)));
    const requiredFocalRegions = analysis.focalRegions.filter((region) => region.weight >= 0.7);
    const focalVisibility = requiredFocalRegions.length === 0
      ? 1
      : Math.min(...requiredFocalRegions.map((region) => (
          normalizedVisibility(region.box, projection.visibleSourceRect)
      )));
    const cropOk = bodyVisibility >= 0.985 && faceVisibility >= 0.998 && focalVisibility >= 0.94;
    if (!cropOk) issues.push(
      focalVisibility < 0.94
        ? "required_focal_region_cropped"
        : "required_subject_or_face_cropped",
    );
    for (const subject of requiredSubjects) {
      projectedSubjects.push({
        canvasId: target.canvas.id,
        shotId: shot.id,
        characterId: subject.characterId,
        body: intersectPixelRectsV1(projectNormalizedRectToCanvasV1(subject.bodyBox, projection), panelRect),
        face: subject.faceBox
          ? intersectPixelRectsV1(projectNormalizedRectToCanvasV1(subject.faceBox, projection), panelRect)
          : null,
      });
    }
    return {
      shotId: shot.id,
      canvasId: target.canvas.id,
      panelId: target.panel.id,
      geometryOk,
      layoutOk,
      cropOk,
      readingOrderOk,
      subjectOcclusionOk: true,
      bodyVisibility: rounded(bodyVisibility),
      faceVisibility: rounded(faceVisibility),
      directUsable: false,
      issues,
    };
  });
  return { panels: quality, projectedSubjects };
}

function scoreBalloons(
  input: ScoreVisualLayoutCandidateInputV1,
  panels: LayoutPanelQualityV1[],
  projectedSubjects: Array<{ canvasId: string; shotId: string; characterId: string | null; body: LayoutPixelRectV1; face: LayoutPixelRectV1 | null }>,
): LayoutBalloonQualityV1[] {
  const panelTargets = panelByShot(input.document);
  const analysisByShot = new Map(input.analyses.map((entry) => [entry.shotId, entry.analysis]));
  const itemById = new Map(input.dialogueLedger.items.map((item) => [item.id, item]));
  const balloonTargets = balloonsById(input.document);
  const visibleBalloons = [...balloonTargets.values()];
  const tailSegments = new Map<string, { canvasId: string; segment: LayoutTailSegmentV1 }>();
  for (const { canvas, balloon } of visibleBalloons) {
    if (!balloon.tail.enabled) continue;
    const root = resolveBalloonTailRootV1(balloon.transform.width, balloon.transform.height, balloon.tail);
    tailSegments.set(balloon.id, {
      canvasId: canvas.id,
      segment: {
        start: { x: balloon.transform.x + root.x, y: balloon.transform.y + root.y },
        end: {
          x: balloon.transform.x + balloon.tail.targetX,
          y: balloon.transform.y + balloon.tail.targetY,
        },
      },
    });
  }
  const result: LayoutBalloonQualityV1[] = [];

  for (const binding of input.document.automation.dialogueBindings) {
    const item = itemById.get(binding.dialogueItemId);
    const target = binding.elementId ? balloonTargets.get(binding.elementId) : undefined;
    if (!item || !target) continue;
    const { canvas, balloon } = target;
    const issues: string[] = [];
    const balloonRect = transformRect(balloon.transform);
    const canvasRect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const panel = panelTargets.get(item.shotId)?.panel;
    const panelRect = panel ? transformRect(panel.transform) : null;
    const insideCanvas = containsRect(canvasRect, balloonRect);
    const anchoredNearPanel = panelRect
      ? (() => {
          const overlap = pixelRectAreaV1(intersectPixelRectsV1(balloonRect, panelRect));
          const horizontalGap = Math.max(0, panelRect.x - (balloonRect.x + balloonRect.width), balloonRect.x - (panelRect.x + panelRect.width));
          const verticalGap = Math.max(0, panelRect.y - (balloonRect.y + balloonRect.height), balloonRect.y - (panelRect.y + panelRect.height));
          const alignedX = balloonRect.x + balloonRect.width >= panelRect.x && balloonRect.x <= panelRect.x + panelRect.width;
          const alignedY = balloonRect.y + balloonRect.height >= panelRect.y && balloonRect.y <= panelRect.y + panelRect.height;
          return overlap >= pixelRectAreaV1(balloonRect) * 0.82
            || (horizontalGap <= 72 && alignedY)
            || (verticalGap <= 72 && alignedX);
        })()
      : false;
    const relevantSubjects = projectedSubjects.filter((subject) => subject.canvasId === canvas.id);
    const faceOverlap = relevantSubjects.reduce((sum, subject) => (
      sum + (subject.face ? pixelRectAreaV1(intersectPixelRectsV1(balloonRect, subject.face)) : 0)
    ), 0);
    const bodyOverlapRatio = relevantSubjects.reduce((sum, subject) => (
      sum + pixelRectAreaV1(intersectPixelRectsV1(balloonRect, subject.body))
    ), 0) / Math.max(1, pixelRectAreaV1(balloonRect));
    const balloonCollision = visibleBalloons.some((other) => {
      if (other.balloon.id === balloon.id || other.canvas.id !== canvas.id) return false;
      const overlap = pixelRectAreaV1(intersectPixelRectsV1(balloonRect, transformRect(other.balloon.transform)));
      return overlap / Math.max(1, Math.min(pixelRectAreaV1(balloonRect), pixelRectAreaV1(transformRect(other.balloon.transform)))) > 0.08;
    });
    if (!insideCanvas) issues.push("balloon_outside_canvas");
    if (faceOverlap >= 1) issues.push("balloon_overlaps_face");
    if (bodyOverlapRatio > 0.12) issues.push("balloon_overlaps_subject");
    if (balloonCollision) issues.push("balloon_collision");

    const balloonTypeOk = balloon.balloonKind === item.kind;
    if (!balloonTypeOk) issues.push("balloon_type_mismatch");
    const availableWidth = balloon.transform.width - balloon.padding.left - balloon.padding.right;
    const availableHeight = balloon.transform.height - balloon.padding.top - balloon.padding.bottom;
    const textFitOk = availableWidth > 0 && availableHeight > 0 && !evaluateRichTextOverflowV1(
      balloon.richText,
      { width: availableWidth, height: availableHeight },
    ).overflow;
    if (!textFitOk) issues.push("text_overflow");
    const minimumSideRatio = item.kind === "caption" ? 0.025 : item.kind === "shout" ? 0.15 : 0.135;
    const minimumVerticalRatio = item.kind === "caption" ? 0.05 : 0.12;
    const shapeSafeOk = balloon.padding.left / balloon.transform.width >= minimumSideRatio
      && balloon.padding.right / balloon.transform.width >= minimumSideRatio
      && balloon.padding.top / balloon.transform.height >= minimumVerticalRatio
      && balloon.padding.bottom / balloon.transform.height >= minimumVerticalRatio;
    if (!shapeSafeOk) issues.push("shape_safe_padding_insufficient");

    const analysis = analysisByShot.get(item.shotId);
    const mapped = analysis ? expectedMappedSubject(item, analysis) : false;
    let tailOk: boolean;
    let crossesFace = false;
    let crossesOtherSubject = false;
    let crossesOtherBalloon = false;
    let crossesOtherTail = false;
    if (item.kind === "caption" || item.speakerCharacterId === null || !mapped) {
      tailOk = balloon.tail.enabled === false;
    } else {
      const targetPoint = {
        x: balloon.transform.x + balloon.tail.targetX,
        y: balloon.transform.y + balloon.tail.targetY,
        width: 1,
        height: 1,
      };
      const localRoot = resolveBalloonTailRootV1(balloon.transform.width, balloon.transform.height, balloon.tail);
      const tailRoot = {
        x: balloon.transform.x + localRoot.x,
        y: balloon.transform.y + localRoot.y,
      };
      const speakerSubjects = projectedSubjects.filter((subject) => (
        subject.canvasId === canvas.id
        && subject.shotId === item.shotId
        && subject.characterId === item.speakerCharacterId
      ));
      crossesFace = relevantSubjects.some((subject) => (
        subject.face && segmentCrossesRect(tailRoot, targetPoint, subject.face)
      ));
      crossesOtherSubject = relevantSubjects.some((subject) => (
        subject.characterId !== item.speakerCharacterId
        && segmentCrossesRect(tailRoot, targetPoint, subject.body)
      ));
      crossesOtherBalloon = visibleBalloons.some((other) => (
        other.canvas.id === canvas.id
        && other.balloon.id !== balloon.id
        && segmentCrossesRect(tailRoot, targetPoint, transformRect(other.balloon.transform), 1)
      ));
      const currentTail = tailSegments.get(balloon.id);
      crossesOtherTail = !!currentTail && [...tailSegments].some(([otherId, otherTail]) => (
        otherId !== balloon.id
        && otherTail.canvasId === currentTail.canvasId
        && tailSegmentsCross(currentTail.segment, otherTail.segment)
      ));
      tailOk = balloon.tail.enabled && speakerSubjects.some((subject) => (
        containsRect(subject.body, targetPoint, 3) && (!subject.face || !containsRect(subject.face, targetPoint, 0))
      )) && !crossesFace && !crossesOtherSubject && !crossesOtherBalloon && !crossesOtherTail;
    }
    if (crossesFace) issues.push("tail_crosses_face");
    if (crossesOtherSubject) issues.push("tail_crosses_other_subject");
    if (crossesOtherBalloon) issues.push("tail_crosses_other_balloon");
    if (crossesOtherTail) issues.push("tail_crosses_other_tail");
    if (!tailOk) issues.push("tail_semantics_invalid");
    const linkedToPanel = anchoredNearPanel || (balloon.tail.enabled && tailOk);
    const balloonGeometryOk = insideCanvas
      && linkedToPanel
      && faceOverlap < 1
      && bodyOverlapRatio <= 0.12
      && !balloonCollision;
    if (!linkedToPanel) issues.push("balloon_detached_from_source_panel");
    result.push({
      dialogueItemId: item.id,
      shotId: item.shotId,
      canvasId: canvas.id,
      elementId: balloon.id,
      balloonGeometryOk,
      balloonTypeOk,
      textFitOk,
      tailOk,
      shapeSafeOk,
      directUsable: balloonGeometryOk && balloonTypeOk && textFitOk && tailOk && shapeSafeOk,
      issues,
    });
  }

  const occludedShots = new Set(result.filter((balloon) => (
    balloon.issues.includes("balloon_overlaps_face") || balloon.issues.includes("balloon_overlaps_subject")
  )).map((balloon) => balloon.shotId));
  for (const panel of panels) {
    panel.subjectOcclusionOk = !occludedShots.has(panel.shotId);
    if (!panel.subjectOcclusionOk) panel.issues.push("subject_occluded_by_balloon");
    panel.directUsable = panel.layoutOk && panel.cropOk && panel.readingOrderOk && panel.subjectOcclusionOk;
  }
  return result;
}

function ratio(passed: number, total: number): number {
  return total === 0 ? 1 : passed / total;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreVisualLayoutCandidateV1(
  input: ScoreVisualLayoutCandidateInputV1,
): LayoutCompositionQualityScoreV1 {
  const panelResult = scorePanels(input);
  const balloons = scoreBalloons(input, panelResult.panels, panelResult.projectedSubjects);
  const panelRate = ratio(panelResult.panels.filter((item) => item.directUsable).length, panelResult.panels.length);
  const balloonRate = ratio(balloons.filter((item) => item.directUsable).length, balloons.length);
  const textAndTypeRate = ratio(balloons.filter((item) => item.textFitOk && item.balloonTypeOk).length, balloons.length);
  const cropRate = ratio(panelResult.panels.filter((item) => item.cropOk).length, panelResult.panels.length);
  const occlusionRate = ratio(panelResult.panels.filter((item) => item.subjectOcclusionOk).length, panelResult.panels.length);
  const layoutRate = ratio(panelResult.panels.filter((item) => item.layoutOk && item.readingOrderOk).length, panelResult.panels.length);

  const impactShots = new Set(input.storyboard.shots.filter((shot) => shot.comic.panelRhythm === "impact").map((shot) => shot.id));
  const targets = panelByShot(input.document);
  const impactRate = impactShots.size === 0 ? 1 : ratio([...impactShots].filter((shotId) => {
    const target = targets.get(shotId);
    if (!target) return false;
    const areaRatio = pixelRectAreaV1(transformRect(target.panel.transform)) / (target.canvas.width * target.canvas.height);
    return target.canvas.kind === "strip_section" ? areaRatio >= 0.2 : areaRatio >= 0.18;
  }).length, impactShots.size);

  const confidenceValues = input.analyses.flatMap((entry) => entry.analysis.subjects.map((subject) => subject.confidence));
  const averageConfidence = confidenceValues.length === 0
    ? 0.45
    : confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;
  const visionRate = ratio(input.analyses.filter((entry) => entry.analysis.mode === "vision").length, input.analyses.length);
  const dimensions = {
    contentReadability: roundScore(30 * textAndTypeRate),
    subjectCropProtection: roundScore(25 * (cropRate * 0.62 + occlusionRate * 0.38)),
    narrativeRhythm: roundScore(20 * (impactRate * 0.55 + layoutRate * 0.45)),
    layoutBalance: roundScore(15 * (layoutRate * 0.55 + panelRate * 0.45)),
    stability: roundScore(10 * (Math.min(1, averageConfidence) * 0.55 + visionRate * 0.45)),
  } satisfies LayoutCompositionScoreDimensionsV1;
  const issues = [
    ...panelResult.panels.flatMap((panel) => panel.issues.map((issue) => `${panel.shotId}:${issue}`)),
    ...balloons.flatMap((balloon) => balloon.issues.map((issue) => `${balloon.dialogueItemId}:${issue}`)),
  ];
  return {
    policyVersion: "layout_composition_score_v1",
    total: roundScore(Object.values(dimensions).reduce((sum, value) => sum + value, 0)),
    dimensions,
    hardGatePassed: panelResult.panels.length === input.storyboard.shots.length
      && balloons.length === input.dialogueLedger.items.length
      && panelResult.panels.every((panel) => panel.geometryOk && panel.readingOrderOk)
      && balloons.every((balloon) => balloon.textFitOk && balloon.balloonTypeOk),
    panelDirectUsableRate: roundScore(panelRate),
    balloonDirectUsableRate: roundScore(balloonRate),
    panels: panelResult.panels,
    balloons,
    issues,
  };
}

export function projectLayoutSourceBindingsV1(document: LayoutDocumentV2): LayoutSourceBindingProjectionV1[] {
  return document.canvases.flatMap((canvas) => canvas.elements.flatMap((element) => (
    element.type === "panel_frame" && element.contentImage && !element.hidden && !element.contentImage.hidden
      ? [{
          elementId: element.contentImage.id,
          role: "candidate_image" as const,
          order: document.canvases.slice(0, document.canvases.indexOf(canvas)).reduce(
            (sum, item) => sum + item.panelReadingOrder.length,
            0,
          ) + canvas.panelReadingOrder.indexOf(element.id) + 1,
          shotId: element.contentImage.source.shotId,
          candidateId: element.contentImage.source.candidateId,
          candidateLockRevisionId: element.contentImage.source.candidateLockRevisionId,
          assetId: element.contentImage.source.assetId,
          sourceDigest: element.contentImage.source.sourceDigest,
        }]
      : []
  )));
}
