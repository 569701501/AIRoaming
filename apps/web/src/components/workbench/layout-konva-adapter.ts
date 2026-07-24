import type {
  BalloonElementV1,
  LayoutCanvasV1,
  LayoutTransformV1,
  LayoutTopLevelElementV1,
} from "@airoaming/shared";

export interface KonvaViewportV1 {
  zoom: number;
  devicePixelRatio: number;
}

export interface KonvaElementProjectionV1 {
  elementId: string;
  elementType: LayoutTopLevelElementV1["type"];
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
}

export interface KonvaNodeTransformSnapshotV1 {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface KonvaBatchNodeTransformSnapshotV1 extends KonvaNodeTransformSnapshotV1 {
  elementId: string;
}

export interface KonvaTransformCommitV1 {
  elementId: string;
  transform: LayoutTransformV1;
}

export interface KonvaViewportZoomAnchorV1 {
  scrollLeft: number;
  scrollTop: number;
  viewportLeft: number;
  viewportTop: number;
  clientX: number;
  clientY: number;
  previousZoom: number;
  nextZoom: number;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero`);
  return value;
}

function stable(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Konva projection produced a non-finite value");
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeKonvaRotationV1(value: number): number {
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return stable(normalized);
}

/**
 * Keeps the document point under a wheel event fixed inside a scrolled
 * viewport. The event coordinates are client-space; scroll offsets must never
 * be added to a stage-local pointer a second time.
 */
export function projectKonvaViewportZoomAnchorV1(
  input: KonvaViewportZoomAnchorV1,
): { scrollLeft: number; scrollTop: number } {
  const previousZoom = finitePositive(input.previousZoom, "previousZoom");
  const nextZoom = finitePositive(input.nextZoom, "nextZoom");
  const anchorX = input.clientX - input.viewportLeft;
  const anchorY = input.clientY - input.viewportTop;
  const ratio = nextZoom / previousZoom;
  return {
    scrollLeft: stable((input.scrollLeft + anchorX) * ratio - anchorX),
    scrollTop: stable((input.scrollTop + anchorY) * ratio - anchorY),
  };
}

/**
 * One-way projection only. DPR is accepted and validated to make the boundary
 * explicit, but it never changes document-space coordinates.
 */
export function projectLayoutCanvasToKonvaV1(
  canvas: LayoutCanvasV1,
  viewport: KonvaViewportV1,
): KonvaElementProjectionV1[] {
  const zoom = finitePositive(viewport.zoom, "zoom");
  finitePositive(viewport.devicePixelRatio, "devicePixelRatio");
  return canvas.elements
    .filter((element) => !element.hidden)
    .map((element) => ({
      elementId: element.id,
      elementType: element.type,
      centerX: stable((element.transform.x + element.transform.width / 2) * zoom),
      centerY: stable((element.transform.y + element.transform.height / 2) * zoom),
      width: stable(element.transform.width * zoom),
      height: stable(element.transform.height * zoom),
      rotation: element.transform.rotation,
      locked: element.locked,
    }));
}

/**
 * Normalizes Transformer scale into the persisted width/height contract and
 * returns scale-free logical coordinates. Konva scale values are never saved.
 */
export function normalizeKonvaNodeTransformV1(
  element: LayoutTopLevelElementV1,
  node: KonvaNodeTransformSnapshotV1,
  viewport: KonvaViewportV1,
): KonvaTransformCommitV1 {
  const zoom = finitePositive(viewport.zoom, "zoom");
  finitePositive(viewport.devicePixelRatio, "devicePixelRatio");
  const width = stable(Math.max(1, node.width * Math.abs(node.scaleX) / zoom));
  const height = stable(Math.max(1, node.height * Math.abs(node.scaleY) / zoom));
  const centerX = node.centerX / zoom;
  const centerY = node.centerY / zoom;
  return {
    elementId: element.id,
    transform: {
      x: stable(centerX - width / 2),
      y: stable(centerY - height / 2),
      width,
      height,
      rotation: normalizeKonvaRotationV1(node.rotation),
      opacity: element.transform.opacity,
    },
  };
}

export function normalizeKonvaTransformBatchV1(
  canvas: LayoutCanvasV1,
  nodes: readonly KonvaBatchNodeTransformSnapshotV1[],
  viewport: KonvaViewportV1,
): KonvaTransformCommitV1[] {
  return nodes.flatMap((node) => {
    const element = canvas.elements.find((candidate) => candidate.id === node.elementId);
    if (!element || element.locked) return [];
    return [normalizeKonvaNodeTransformV1(element, node, viewport)];
  });
}

export function projectBalloonTailTargetToKonvaV1(
  element: BalloonElementV1,
  viewport: KonvaViewportV1,
): { x: number; y: number } {
  const zoom = finitePositive(viewport.zoom, "zoom");
  finitePositive(viewport.devicePixelRatio, "devicePixelRatio");
  const radians = element.transform.rotation * Math.PI / 180;
  const localX = element.tail.targetX - element.transform.width / 2;
  const localY = element.tail.targetY - element.transform.height / 2;
  const centerX = element.transform.x + element.transform.width / 2;
  const centerY = element.transform.y + element.transform.height / 2;
  return {
    x: stable((centerX + localX * Math.cos(radians) - localY * Math.sin(radians)) * zoom),
    y: stable((centerY + localX * Math.sin(radians) + localY * Math.cos(radians)) * zoom),
  };
}

export function normalizeKonvaTailTargetV1(
  element: BalloonElementV1,
  point: { x: number; y: number },
  viewport: KonvaViewportV1,
): { targetX: number; targetY: number } {
  const zoom = finitePositive(viewport.zoom, "zoom");
  finitePositive(viewport.devicePixelRatio, "devicePixelRatio");
  const centerX = element.transform.x + element.transform.width / 2;
  const centerY = element.transform.y + element.transform.height / 2;
  const dx = point.x / zoom - centerX;
  const dy = point.y / zoom - centerY;
  const radians = -element.transform.rotation * Math.PI / 180;
  return {
    targetX: stable(dx * Math.cos(radians) - dy * Math.sin(radians) + element.transform.width / 2),
    targetY: stable(dx * Math.sin(radians) + dy * Math.cos(radians) + element.transform.height / 2),
  };
}
