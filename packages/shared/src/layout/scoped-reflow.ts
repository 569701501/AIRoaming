import { StoryboardDocumentCodecV2 } from "../versioning/document-codec.js";
import type { StoryboardDocumentV2, StoryboardShotV2 } from "../versioning/document-contract.js";
import {
  isLayoutScopeProtectedV1,
  LayoutDocumentCodecV2,
  type LayoutDocumentV2,
  type LayoutProtectionScopeV1,
  type LayoutProtectionTargetKindV1,
} from "./automation.js";
import type { EditorCommandBatchV2, EditorCommandV2 } from "./commands-v2.js";
import type { LayoutCompositionIntentV1, LayoutCompositionScopeV1 } from "./composition-contract.js";
import { digestCanonicalJson } from "../versioning/canonical-json.js";
import type {
  BalloonElementV1,
  BalloonTailV1,
  LayoutCanvasV1,
  LayoutDigest,
  LayoutTopLevelElementV1,
  LayoutTransformV1,
  PanelFrameElementV1,
} from "./document.js";
import { normalizeLayoutNumber } from "./geometry.js";
import type { LayoutNarrativePlanV1 } from "./narrative.js";

export type LayoutScopedReflowErrorCodeV1 =
  | "LAYOUT_COMPOSITION_SCOPE_INVALID"
  | "LAYOUT_COMPOSITION_NO_VALID_PLAN";

export class LayoutScopedReflowError extends Error {
  constructor(
    readonly code: LayoutScopedReflowErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = "LayoutScopedReflowError";
  }
}

export interface LayoutResolvedCompositionScopeV1 {
  requested: LayoutCompositionScopeV1;
  effectiveCanvasIds: string[];
  effectiveElementIds: string[];
  effectiveShotIds: string[];
  expandedToNarrativeGroup: boolean;
  expandedToScene: boolean;
}

export interface LayoutScopedReflowPlanV1 {
  schemaVersion: 1;
  policyVersion: "layout_scoped_reflow_v1";
  scope: LayoutResolvedCompositionScopeV1;
  commandBatch: EditorCommandBatchV2;
  changedElementIds: string[];
  protectedChangeCount: number;
  warnings: string[];
  planDigest: LayoutDigest;
}

interface LocatedElementV1 {
  canvas: LayoutCanvasV1;
  element: LayoutTopLevelElementV1;
}

interface ShotPanelV1 {
  canvas: LayoutCanvasV1;
  panel: PanelFrameElementV1;
}

interface ShotBalloonV1 {
  canvas: LayoutCanvasV1;
  balloon: BalloonElementV1;
  dialogueItemId: string | null;
}

function fail(code: LayoutScopedReflowErrorCodeV1, message: string): never {
  throw new LayoutScopedReflowError(code, message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function sourceShotId(element: LayoutTopLevelElementV1): string | null {
  if (element.type === "panel_frame") return element.contentImage?.source.shotId ?? null;
  if (element.type === "free_image") return element.source.shotId;
  if (element.type === "balloon") return element.sourceShotId;
  return null;
}

function elementIndex(document: LayoutDocumentV2): Map<string, LocatedElementV1> {
  const result = new Map<string, LocatedElementV1>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (result.has(element.id)) {
        fail("LAYOUT_COMPOSITION_SCOPE_INVALID", `duplicate element ID ${element.id}`);
      }
      result.set(element.id, { canvas, element });
    }
  }
  return result;
}

function shotsOnCanvas(canvas: LayoutCanvasV1): string[] {
  return uniqueSorted(canvas.elements.flatMap((element) => {
    const shotId = sourceShotId(element);
    return shotId ? [shotId] : [];
  }));
}

export function resolveLayoutCompositionScopeV1(input: {
  document: LayoutDocumentV2;
  storyboard: StoryboardDocumentV2;
  narrativePlan: LayoutNarrativePlanV1;
  scope: LayoutCompositionScopeV1;
}): LayoutResolvedCompositionScopeV1 {
  const document = LayoutDocumentCodecV2.parseAndNormalize(input.document);
  const storyboard = StoryboardDocumentCodecV2.parse(input.storyboard);
  const canvasById = new Map(document.canvases.map((canvas) => [canvas.id, canvas]));
  const elements = elementIndex(document);
  const shotById = new Map(storyboard.shots.map((shot) => [shot.id, shot]));
  const requestedShots = new Set<string>();

  for (const canvasId of input.scope.canvasIds) {
    const canvas = canvasById.get(canvasId);
    if (!canvas) fail("LAYOUT_COMPOSITION_SCOPE_INVALID", `canvas ${canvasId} is not in the current manuscript`);
    for (const shotId of shotsOnCanvas(canvas)) requestedShots.add(shotId);
  }
  for (const elementId of input.scope.elementIds) {
    const located = elements.get(elementId);
    if (!located) fail("LAYOUT_COMPOSITION_SCOPE_INVALID", `element ${elementId} is not in the current manuscript`);
    const shotId = sourceShotId(located.element);
    if (shotId) requestedShots.add(shotId);
  }
  for (const shotId of input.scope.shotIds) {
    if (!shotById.has(shotId)) {
      fail("LAYOUT_COMPOSITION_SCOPE_INVALID", `shot ${shotId} is not in the current storyboard`);
    }
    requestedShots.add(shotId);
  }
  if (requestedShots.size === 0) {
    fail("LAYOUT_COMPOSITION_SCOPE_INVALID", "the selected range does not contain a storyboard image or balloon");
  }

  const effectiveShots = new Set(requestedShots);
  let expandedToScene = false;
  if (
    input.scope.shotIds.length > 0
    && input.scope.canvasIds.length === 0
    && input.scope.elementIds.length === 0
  ) {
    const sceneIds = new Set(input.scope.shotIds.flatMap((shotId) => {
      const sceneId = shotById.get(shotId)?.sceneId ?? null;
      return sceneId ? [sceneId] : [];
    }));
    for (const shot of storyboard.shots) {
      if (shot.sceneId && sceneIds.has(shot.sceneId) && !effectiveShots.has(shot.id)) {
        effectiveShots.add(shot.id);
        expandedToScene = true;
      }
    }
  }

  let expandedToNarrativeGroup = false;
  for (const group of input.narrativePlan.groups) {
    if (!group.shotIds.some((shotId) => effectiveShots.has(shotId))) continue;
    for (const shotId of group.shotIds) {
      if (!effectiveShots.has(shotId)) expandedToNarrativeGroup = true;
      effectiveShots.add(shotId);
    }
  }

  const effectiveCanvasIds = new Set<string>();
  const effectiveElementIds = new Set<string>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      const shotId = sourceShotId(element);
      if (!shotId || !effectiveShots.has(shotId)) continue;
      effectiveCanvasIds.add(canvas.id);
      effectiveElementIds.add(element.id);
    }
  }
  if (effectiveElementIds.size === 0) {
    fail("LAYOUT_COMPOSITION_SCOPE_INVALID", "the expanded range has no editable storyboard elements");
  }
  return {
    requested: {
      canvasIds: [...input.scope.canvasIds],
      elementIds: [...input.scope.elementIds],
      shotIds: [...input.scope.shotIds],
    },
    effectiveCanvasIds: uniqueSorted(effectiveCanvasIds),
    effectiveElementIds: uniqueSorted(effectiveElementIds),
    effectiveShotIds: uniqueSorted(effectiveShots),
    expandedToNarrativeGroup,
    expandedToScene,
  };
}

function shotPanels(document: LayoutDocumentV2): Map<string, ShotPanelV1> {
  const result = new Map<string, ShotPanelV1>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type !== "panel_frame" || !element.contentImage) continue;
      result.set(element.contentImage.source.shotId, { canvas, panel: element });
    }
  }
  return result;
}

function shotBalloons(document: LayoutDocumentV2): Map<string, ShotBalloonV1[]> {
  const dialogueByElement = new Map(document.automation.dialogueBindings.flatMap((binding) => (
    binding.elementId ? [[binding.elementId, binding.dialogueItemId] as const] : []
  )));
  const result = new Map<string, ShotBalloonV1[]>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type !== "balloon" || !element.sourceShotId) continue;
      const entries = result.get(element.sourceShotId) ?? [];
      entries.push({
        canvas,
        balloon: element,
        dialogueItemId: dialogueByElement.get(element.id) ?? null,
      });
      result.set(element.sourceShotId, entries);
    }
  }
  for (const entries of result.values()) {
    entries.sort((left, right) => (
      compareText(left.dialogueItemId ?? "", right.dialogueItemId ?? "")
      || left.balloon.transform.y - right.balloon.transform.y
      || left.balloon.transform.x - right.balloon.transform.x
      || compareText(left.balloon.id, right.balloon.id)
    ));
  }
  return result;
}

function same(left: unknown, right: unknown): boolean {
  return digestCanonicalJson(left) === digestCanonicalJson(right);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalized(value: number): number {
  return normalizeLayoutNumber(value);
}

function boundedTransform(
  transform: LayoutTransformV1,
  canvas: LayoutCanvasV1,
): LayoutTransformV1 {
  const width = clamp(transform.width, 24, canvas.width);
  const height = clamp(transform.height, 24, canvas.height);
  return {
    ...transform,
    x: normalized(clamp(transform.x, 0, canvas.width - width)),
    y: normalized(clamp(transform.y, 0, canvas.height - height)),
    width: normalized(width),
    height: normalized(height),
  };
}

function scaledAroundCenter(
  transform: LayoutTransformV1,
  canvas: LayoutCanvasV1,
  factor: number,
): LayoutTransformV1 {
  const centerX = transform.x + transform.width / 2;
  const centerY = transform.y + transform.height / 2;
  const width = transform.width * factor;
  const height = transform.height * factor;
  return boundedTransform({
    ...transform,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  }, canvas);
}

function transferBalloonTransform(input: {
  baseCanvas: LayoutCanvasV1;
  basePanel: PanelFrameElementV1;
  targetPanel: PanelFrameElementV1;
  targetBalloon: BalloonElementV1;
}): LayoutTransformV1 {
  const targetPanel = input.targetPanel.transform;
  const targetBalloon = input.targetBalloon.transform;
  const basePanel = input.basePanel.transform;
  const relativeCenterX = (
    targetBalloon.x + targetBalloon.width / 2 - targetPanel.x
  ) / targetPanel.width;
  const relativeCenterY = (
    targetBalloon.y + targetBalloon.height / 2 - targetPanel.y
  ) / targetPanel.height;
  const width = clamp(
    targetBalloon.width / targetPanel.width * basePanel.width,
    72,
    input.baseCanvas.width * 0.72,
  );
  const height = clamp(
    targetBalloon.height / targetPanel.height * basePanel.height,
    48,
    input.baseCanvas.height * 0.5,
  );
  return boundedTransform({
    ...input.targetBalloon.transform,
    x: basePanel.x + relativeCenterX * basePanel.width - width / 2,
    y: basePanel.y + relativeCenterY * basePanel.height - height / 2,
    width,
    height,
    rotation: 0,
    opacity: input.basePanel.transform.opacity,
  }, input.baseCanvas);
}

function transferBalloonTail(input: {
  basePanel: PanelFrameElementV1;
  targetPanel: PanelFrameElementV1;
  targetTail: BalloonTailV1;
}): BalloonTailV1 {
  const target = input.targetPanel.transform;
  const base = input.basePanel.transform;
  const relativeX = (input.targetTail.targetX - target.x) / target.width;
  const relativeY = (input.targetTail.targetY - target.y) / target.height;
  return {
    ...input.targetTail,
    targetX: normalized(base.x + relativeX * base.width),
    targetY: normalized(base.y + relativeY * base.height),
    baseWidth: normalized(clamp(
      input.targetTail.baseWidth * Math.min(base.width / target.width, base.height / target.height),
      4,
      Math.max(4, Math.min(base.width, base.height) * 0.35),
    )),
  };
}

function protectedOrLocked(
  document: LayoutDocumentV2,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  scope: LayoutProtectionScopeV1,
  locked: boolean,
): boolean {
  return locked || isLayoutScopeProtectedV1(document.automation, targetKind, targetId, scope);
}

function visualStyle(balloon: BalloonElementV1): {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  padding: BalloonElementV1["padding"];
  verticalAlign: BalloonElementV1["verticalAlign"];
} {
  return {
    fillColor: balloon.fillColor,
    strokeColor: balloon.strokeColor,
    strokeWidth: balloon.strokeWidth,
    padding: balloon.padding,
    verticalAlign: balloon.verticalAlign,
  };
}

function commandId(
  baseDigest: LayoutDigest,
  type: string,
  targetId: string,
  index: number,
): string {
  return `layout_scoped_${digestCanonicalJson({
    policyVersion: "layout_scoped_command_id_v1",
    baseDigest,
    type,
    targetId,
    index,
  }).slice("sha256:".length, "sha256:".length + 24)}`;
}

function pairedTargetBalloon(
  base: ShotBalloonV1,
  baseIndex: number,
  targets: readonly ShotBalloonV1[],
): ShotBalloonV1 | null {
  if (base.dialogueItemId) {
    const exact = targets.find((target) => target.dialogueItemId === base.dialogueItemId);
    if (exact) return exact;
  }
  return targets[baseIndex] ?? null;
}

function focalShotForCanvas(
  canvas: LayoutCanvasV1,
  effectiveShots: ReadonlySet<string>,
  shotById: ReadonlyMap<string, StoryboardShotV2>,
): string | null {
  const candidates = shotsOnCanvas(canvas)
    .filter((shotId) => effectiveShots.has(shotId))
    .map((shotId) => shotById.get(shotId))
    .filter((shot): shot is StoryboardShotV2 => Boolean(shot))
    .sort((left, right) => {
      const importance = (shot: StoryboardShotV2): number => (
        shot.comic.panelRhythm === "impact" ? 4
          : shot.motion.frameType === "action" ? 3
            : shot.shotType === "establishing" || shot.shotType === "wide" ? 2
              : 1
      );
      return importance(right) - importance(left) || left.order - right.order;
    });
  return candidates[0]?.id ?? null;
}

export function buildScopedLayoutReflowV1(input: {
  baseDocument: LayoutDocumentV2;
  targetDocument: LayoutDocumentV2;
  storyboard: StoryboardDocumentV2;
  narrativePlan: LayoutNarrativePlanV1;
  scope: LayoutCompositionScopeV1;
  intent: LayoutCompositionIntentV1;
}): LayoutScopedReflowPlanV1 {
  const base = LayoutDocumentCodecV2.parseAndNormalize(input.baseDocument);
  const target = LayoutDocumentCodecV2.parseAndNormalize(input.targetDocument);
  const storyboard = StoryboardDocumentCodecV2.parse(input.storyboard);
  if (
    base.projectId !== target.projectId
    || base.chapterId !== target.chapterId
    || base.comicFormat !== target.comicFormat
  ) {
    fail("LAYOUT_COMPOSITION_SCOPE_INVALID", "base and target manuscript scopes do not match");
  }
  const scope = resolveLayoutCompositionScopeV1({
    document: base,
    storyboard,
    narrativePlan: input.narrativePlan,
    scope: input.scope,
  });
  const effectiveShots = new Set(scope.effectiveShotIds);
  const shotById = new Map(storyboard.shots.map((shot) => [shot.id, shot]));
  const basePanels = shotPanels(base);
  const targetPanels = shotPanels(target);
  const baseBalloons = shotBalloons(base);
  const targetBalloons = shotBalloons(target);
  const baseDigest = LayoutDocumentCodecV2.encode(base).digest;
  const commands: EditorCommandV2[] = [];
  const changedElementIds = new Set<string>();
  let protectedChangeCount = 0;
  let missingTargetCount = 0;

  const add = (command: Omit<EditorCommandV2, "schemaVersion" | "commandId" | "actor">, targetId: string): void => {
    if (commands.length >= 500) {
      fail("LAYOUT_COMPOSITION_NO_VALID_PLAN", "the selected range requires more than 500 safe editor changes");
    }
    commands.push({
      ...command,
      schemaVersion: 2,
      commandId: commandId(baseDigest, command.type, targetId, commands.length),
      actor: "smart",
    } as EditorCommandV2);
    changedElementIds.add(targetId);
  };

  const focalByCanvas = new Map(base.canvases.map((canvas) => [
    canvas.id,
    focalShotForCanvas(canvas, effectiveShots, shotById),
  ]));
  for (const shotId of scope.effectiveShotIds) {
    const baseEntry = basePanels.get(shotId);
    const targetEntry = targetPanels.get(shotId);
    if (!baseEntry || !targetEntry) {
      missingTargetCount += 1;
      continue;
    }
    const panel = baseEntry.panel;
    const panelImage = panel.contentImage;
    if (!panelImage) continue;

    let panelTransform = panel.transform;
    if (input.intent === "more_compact") {
      panelTransform = scaledAroundCenter(panel.transform, baseEntry.canvas, 1.035);
    } else if (input.intent === "more_relaxed") {
      panelTransform = scaledAroundCenter(panel.transform, baseEntry.canvas, 0.94);
    } else if (
      input.intent === "emphasize_focus"
      && focalByCanvas.get(baseEntry.canvas.id) === shotId
    ) {
      panelTransform = scaledAroundCenter(panel.transform, baseEntry.canvas, 1.08);
    }
    if (!same(panelTransform, panel.transform)) {
      if (protectedOrLocked(base, "element", panel.id, "geometry", panel.locked)) {
        protectedChangeCount += 1;
      } else {
        add({
          type: "element.set_transform",
          label: input.intent === "more_relaxed" ? "舒展画格留白" : "突出画格重点",
          payload: {
            canvasId: baseEntry.canvas.id,
            elementId: panel.id,
            transform: panelTransform,
          },
        }, panel.id);
      }
    }

    if (!same(panelImage.crop, targetEntry.panel.contentImage?.crop)) {
      if (
        protectedOrLocked(
          base,
          "panel_image",
          panelImage.id,
          "crop",
          panel.locked || panelImage.locked,
        )
      ) {
        protectedChangeCount += 1;
      } else if (targetEntry.panel.contentImage) {
        add({
          type: "image.set_crop",
          label: "按画面主体重新取景",
          payload: {
            canvasId: baseEntry.canvas.id,
            elementId: panel.id,
            crop: targetEntry.panel.contentImage.crop,
          },
        }, panel.id);
      }
    }

    const currentBalloons = baseBalloons.get(shotId) ?? [];
    const plannedBalloons = targetBalloons.get(shotId) ?? [];
    currentBalloons.forEach((baseBalloonEntry, index) => {
      const targetBalloonEntry = pairedTargetBalloon(baseBalloonEntry, index, plannedBalloons);
      if (!targetBalloonEntry) {
        missingTargetCount += 1;
        return;
      }
      const balloon = baseBalloonEntry.balloon;
      const nextTransform = transferBalloonTransform({
        baseCanvas: baseEntry.canvas,
        basePanel: panel,
        targetPanel: targetEntry.panel,
        targetBalloon: targetBalloonEntry.balloon,
      });
      if (!same(nextTransform, balloon.transform)) {
        if (protectedOrLocked(base, "element", balloon.id, "geometry", balloon.locked)) {
          protectedChangeCount += 1;
        } else {
          add({
            type: "element.set_transform",
            label: "重新安排对白位置",
            payload: {
              canvasId: baseBalloonEntry.canvas.id,
              elementId: balloon.id,
              transform: nextTransform,
            },
          }, balloon.id);
        }
      }

      const nextStyle = visualStyle(targetBalloonEntry.balloon);
      if (!same(nextStyle, visualStyle(balloon))) {
        if (protectedOrLocked(base, "element", balloon.id, "style", balloon.locked)) {
          protectedChangeCount += 1;
        } else {
          add({
            type: "balloon.set_visual_style",
            label: "统一对白气泡样式",
            payload: {
              canvasId: baseBalloonEntry.canvas.id,
              elementId: balloon.id,
              ...nextStyle,
            },
          }, balloon.id);
        }
      }

      const nextTail = transferBalloonTail({
        basePanel: panel,
        targetPanel: targetEntry.panel,
        targetTail: targetBalloonEntry.balloon.tail,
      });
      if (!same(nextTail, balloon.tail)) {
        if (protectedOrLocked(base, "element", balloon.id, "tail", balloon.locked)) {
          protectedChangeCount += 1;
        } else {
          add({
            type: "balloon.set_tail",
            label: "让气泡重新指向说话人",
            payload: {
              canvasId: baseBalloonEntry.canvas.id,
              elementId: balloon.id,
              tail: nextTail,
            },
          }, balloon.id);
        }
      }
    });
  }

  if (commands.length === 0) {
    fail(
      "LAYOUT_COMPOSITION_NO_VALID_PLAN",
      protectedChangeCount > 0
        ? "every useful change is protected by a user edit or an explicit lock"
        : "the selected range is already equivalent to the best safe adjustment",
    );
  }
  const warnings = [
    ...(scope.expandedToScene ? ["SCOPED_REFLOW_EXPANDED_TO_SCENE"] : []),
    ...(scope.expandedToNarrativeGroup ? ["SCOPED_REFLOW_EXPANDED_TO_NARRATIVE_GROUP"] : []),
    ...(protectedChangeCount > 0 ? ["SMART_PROTECTED_ITEMS_PRESERVED"] : []),
    ...(missingTargetCount > 0 ? ["SMART_TARGET_MATCH_MISSING"] : []),
  ];
  const commandBatch: EditorCommandBatchV2 = {
    schemaVersion: 2,
    batchId: `layout_scoped_batch_${digestCanonicalJson({
      policyVersion: "layout_scoped_batch_id_v1",
      baseDigest,
      intent: input.intent,
      scope,
      commands,
    }).slice("sha256:".length, "sha256:".length + 24)}`,
    label: "智能调整选中范围",
    commands,
  };
  const planDigest = digestCanonicalJson({
    policyVersion: "layout_scoped_reflow_plan_digest_v1",
    baseDigest,
    targetDigest: LayoutDocumentCodecV2.encode(target).digest,
    intent: input.intent,
    scope,
    commandBatch,
    protectedChangeCount,
    warnings,
  });
  return {
    schemaVersion: 1,
    policyVersion: "layout_scoped_reflow_v1",
    scope,
    commandBatch,
    changedElementIds: uniqueSorted(changedElementIds),
    protectedChangeCount,
    warnings,
    planDigest,
  };
}
