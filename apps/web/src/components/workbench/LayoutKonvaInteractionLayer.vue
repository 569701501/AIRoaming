<template>
  <div
    ref="container"
    class="layout-konva-interaction-layer"
    :class="{ 'is-pass-through': readOnly }"
    data-testid="layout-konva-interaction-layer"
    role="application"
    aria-label="成稿画布直接操作层"
  />
</template>

<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Konva from "konva";
import type {
  CoverCropV1,
  LayoutCanvasV1,
} from "@airoaming/shared";

import {
  normalizeKonvaTailTargetV1,
  normalizeKonvaTransformBatchV1,
  projectBalloonTailTargetToKonvaV1,
  projectLayoutCanvasToKonvaV1,
  type KonvaTransformCommitV1,
} from "./layout-konva-adapter";

const props = defineProps<{
  canvas: LayoutCanvasV1;
  selectedElementIds: string[];
  zoom: number;
  activeTool: "select" | "pan" | "crop";
  readOnly: boolean;
}>();

const emit = defineEmits<{
  selectElement: [value: { elementId: string; additive: boolean }];
  replaceSelection: [elementIds: string[]];
  commitTransform: [changes: KonvaTransformCommitV1[]];
  commitTail: [value: { elementId: string; targetX: number; targetY: number }];
  commitCrop: [value: { elementId: string; crop: CoverCropV1 }];
  pan: [value: { dx: number; dy: number }];
  zoom: [value: { zoom: number; clientX: number; clientY: number }];
}>();

const container = ref<HTMLDivElement | null>(null);
let stage: Konva.Stage | null = null;
let contentLayer: Konva.Layer | null = null;
let controlsLayer: Konva.Layer | null = null;
let transformer: Konva.Transformer | null = null;
let selectionRect: Konva.Rect | null = null;
let tailHandle: Konva.Circle | null = null;
let cropPanHandle: Konva.Rect | null = null;
let cropZoomHandle: Konva.Circle | null = null;
let guideLines: Konva.Line[] = [];
let gestureActive = false;
let marqueeStart: { x: number; y: number } | null = null;
let panPoint: { x: number; y: number } | null = null;
let dragStart: {
  anchorId: string;
  anchorX: number;
  anchorY: number;
  nodes: Map<string, { x: number; y: number }>;
} | null = null;
let cropGesture: {
  kind: "pan" | "zoom";
  element: Extract<LayoutCanvasV1["elements"][number], { type: "panel_frame" | "free_image" }>;
  crop: CoverCropV1;
  startX: number;
  startY: number;
} | null = null;

function devicePixelRatio(): number {
  return Math.max(1, globalThis.devicePixelRatio || 1);
}

function elementFor(id: string) {
  return props.canvas.elements.find((element) => element.id === id) ?? null;
}

function elementNodes(): Konva.Rect[] {
  return (contentLayer?.getChildren((node) => node.hasName("layout-element")) ?? []) as Konva.Rect[];
}

function selectedNodes(): Konva.Rect[] {
  const selected = new Set(props.selectedElementIds);
  return elementNodes().filter((node) => {
    const element = elementFor(String(node.getAttr("elementId")));
    return selected.has(String(node.getAttr("elementId"))) && Boolean(element && !element.locked);
  });
}

function captureNodePositions(nodes: Konva.Rect[]): Map<string, { x: number; y: number }> {
  return new Map(nodes.map((node) => [
    String(node.getAttr("elementId")),
    { x: node.x(), y: node.y() },
  ]));
}

function clearGuides(): void {
  for (const line of guideLines) line.destroy();
  guideLines = [];
}

function addGuide(axis: "vertical" | "horizontal", position: number): void {
  if (!controlsLayer) return;
  const line = new Konva.Line({
    points: axis === "vertical"
      ? [position, 0, position, props.canvas.height * props.zoom]
      : [0, position, props.canvas.width * props.zoom, position],
    stroke: "#F59E0B",
    strokeWidth: 1,
    dash: [4, 4],
    listening: false,
    name: "alignment-guide",
  });
  guideLines.push(line);
  controlsLayer.add(line);
  line.moveToBottom();
}

function closestSnap(
  points: number[],
  guides: number[],
): { delta: number; guide: number } | null {
  let result: { delta: number; guide: number } | null = null;
  for (const point of points) {
    for (const guide of guides) {
      const delta = guide - point;
      if (Math.abs(delta) > 6) continue;
      if (!result || Math.abs(delta) < Math.abs(result.delta)) result = { delta, guide };
    }
  }
  return result;
}

function snapDraggedNode(node: Konva.Rect): void {
  clearGuides();
  const movingIds = new Set(dragStart?.nodes.keys() ?? []);
  const peers = elementNodes().filter(
    (candidate) => !movingIds.has(String(candidate.getAttr("elementId"))),
  );
  const verticalGuides = [
    0,
    props.canvas.width * props.zoom / 2,
    props.canvas.width * props.zoom,
  ];
  const horizontalGuides = [
    0,
    props.canvas.height * props.zoom / 2,
    props.canvas.height * props.zoom,
  ];
  for (const peer of peers) {
    const box = peer.getClientRect({ skipStroke: true });
    verticalGuides.push(box.x, box.x + box.width / 2, box.x + box.width);
    horizontalGuides.push(box.y, box.y + box.height / 2, box.y + box.height);
  }
  const box = node.getClientRect({ skipStroke: true });
  const vertical = closestSnap(
    [box.x, box.x + box.width / 2, box.x + box.width],
    verticalGuides,
  );
  const horizontal = closestSnap(
    [box.y, box.y + box.height / 2, box.y + box.height],
    horizontalGuides,
  );
  if (vertical) {
    node.x(node.x() + vertical.delta);
    addGuide("vertical", vertical.guide);
  }
  if (horizontal) {
    node.y(node.y() + horizontal.delta);
    addGuide("horizontal", horizontal.guide);
  }
}

function configureShape(node: Konva.Rect): void {
  const elementId = String(node.getAttr("elementId"));
  node.on("pointerdown", (event) => {
    if (props.readOnly || props.activeTool === "pan") return;
    event.cancelBubble = true;
    const pointer = event.evt as PointerEvent;
    emit("selectElement", {
      elementId,
      additive: pointer.shiftKey || pointer.metaKey || pointer.ctrlKey,
    });
  });
  node.on("dragstart", () => {
    if (props.readOnly || props.activeTool !== "select") return;
    gestureActive = true;
    const moving = props.selectedElementIds.includes(elementId)
      ? selectedNodes()
      : [node];
    dragStart = {
      anchorId: elementId,
      anchorX: node.x(),
      anchorY: node.y(),
      nodes: captureNodePositions(moving),
    };
  });
  node.on("dragmove", () => {
    if (!dragStart || dragStart.anchorId !== elementId) return;
    snapDraggedNode(node);
    const dx = node.x() - dragStart.anchorX;
    const dy = node.y() - dragStart.anchorY;
    for (const [id, origin] of dragStart.nodes) {
      if (id === elementId) continue;
      const exactPeer = elementNodes().find((candidate) => candidate.getAttr("elementId") === id);
      exactPeer?.position({ x: origin.x + dx, y: origin.y + dy });
    }
    controlsLayer?.batchDraw();
  });
  node.on("dragend", () => {
    if (!gestureActive) return;
    const ids = dragStart ? [...dragStart.nodes.keys()] : [elementId];
    dragStart = null;
    clearGuides();
    commitTransforms(ids);
  });
}

function syncProjection(): void {
  if (!stage || !contentLayer || !controlsLayer || gestureActive) return;
  const width = props.canvas.width * props.zoom;
  const height = props.canvas.height * props.zoom;
  stage.size({ width, height });
  contentLayer.destroyChildren();
  const projections = projectLayoutCanvasToKonvaV1(props.canvas, {
    zoom: props.zoom,
    devicePixelRatio: devicePixelRatio(),
  });
  for (const projection of projections) {
    const node = new Konva.Rect({
      id: `layout-hit-${projection.elementId}`,
      name: "layout-element",
      x: projection.centerX,
      y: projection.centerY,
      width: projection.width,
      height: projection.height,
      offsetX: projection.width / 2,
      offsetY: projection.height / 2,
      rotation: projection.rotation,
      fill: "rgba(0,0,0,0.001)",
      strokeEnabled: false,
      draggable: !props.readOnly && !projection.locked && props.activeTool === "select",
      listening: !props.readOnly && props.activeTool !== "pan",
      perfectDrawEnabled: false,
    });
    node.setAttr("elementId", projection.elementId);
    configureShape(node);
    contentLayer.add(node);
  }
  syncSelection();
  contentLayer.batchDraw();
  controlsLayer.batchDraw();
}

function cropForElement(
  element: LayoutCanvasV1["elements"][number],
): CoverCropV1 | null {
  if (element.type === "panel_frame") return element.contentImage?.crop ?? null;
  if (element.type === "free_image" && element.display.mode === "cover") return element.display.crop;
  return null;
}

function rotatedPoint(
  element: LayoutCanvasV1["elements"][number],
  localX: number,
  localY: number,
): { x: number; y: number } {
  const radians = element.transform.rotation * Math.PI / 180;
  const dx = localX - element.transform.width / 2;
  const dy = localY - element.transform.height / 2;
  const centerX = element.transform.x + element.transform.width / 2;
  const centerY = element.transform.y + element.transform.height / 2;
  return {
    x: (centerX + dx * Math.cos(radians) - dy * Math.sin(radians)) * props.zoom,
    y: (centerY + dx * Math.sin(radians) + dy * Math.cos(radians)) * props.zoom,
  };
}

function commitCropGesture(): void {
  const gesture = cropGesture;
  if (!gesture) return;
  const pan = cropPanHandle;
  const zoomHandle = cropZoomHandle;
  let crop = structuredClone(gesture.crop);
  if (gesture.kind === "pan" && pan) {
    const dx = (pan.x() - gesture.startX) / props.zoom;
    const dy = (pan.y() - gesture.startY) / props.zoom;
    const radians = -gesture.element.transform.rotation * Math.PI / 180;
    crop = {
      ...crop,
      offsetX: crop.offsetX + dx * Math.cos(radians) - dy * Math.sin(radians),
      offsetY: crop.offsetY + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  } else if (gesture.kind === "zoom" && zoomHandle) {
    const center = rotatedPoint(
      gesture.element,
      gesture.element.transform.width / 2,
      gesture.element.transform.height / 2,
    );
    const startDistance = Math.max(1, Math.hypot(gesture.startX - center.x, gesture.startY - center.y));
    const nextDistance = Math.max(1, Math.hypot(zoomHandle.x() - center.x, zoomHandle.y() - center.y));
    crop = { ...crop, zoom: Math.max(1, crop.zoom * nextDistance / startDistance) };
  }
  cropGesture = null;
  gestureActive = false;
  emit("commitCrop", { elementId: gesture.element.id, crop });
  queueMicrotask(syncProjection);
}

function syncCropControls(): void {
  cropPanHandle?.destroy();
  cropZoomHandle?.destroy();
  cropPanHandle = null;
  cropZoomHandle = null;
  if (props.activeTool !== "crop" || props.readOnly || props.selectedElementIds.length !== 1 || !controlsLayer) return;
  const selected = elementFor(props.selectedElementIds[0]!);
  if (
    !selected
    || selected.locked
    || (selected.type !== "panel_frame" && selected.type !== "free_image")
  ) return;
  const crop = cropForElement(selected);
  if (!crop) return;
  const center = rotatedPoint(selected, selected.transform.width / 2, selected.transform.height / 2);
  cropPanHandle = new Konva.Rect({
    x: center.x,
    y: center.y,
    width: selected.transform.width * props.zoom,
    height: selected.transform.height * props.zoom,
    offsetX: selected.transform.width * props.zoom / 2,
    offsetY: selected.transform.height * props.zoom / 2,
    rotation: selected.transform.rotation,
    fill: "rgba(34,199,169,0.035)",
    stroke: "#22C7A9",
    strokeWidth: 2,
    dash: [7, 5],
    draggable: true,
    name: "crop-pan-handle",
  });
  cropPanHandle.on("pointerdown", (event) => { event.cancelBubble = true; });
  cropPanHandle.on("dragstart", () => {
    if (!cropPanHandle) return;
    gestureActive = true;
    cropGesture = {
      kind: "pan",
      element: selected,
      crop: structuredClone(crop),
      startX: cropPanHandle.x(),
      startY: cropPanHandle.y(),
    };
  });
  cropPanHandle.on("dragend", commitCropGesture);
  const corner = rotatedPoint(selected, selected.transform.width, selected.transform.height);
  cropZoomHandle = new Konva.Circle({
    x: corner.x,
    y: corner.y,
    radius: 8,
    fill: "#F59E0B",
    stroke: "#FFFFFF",
    strokeWidth: 2,
    draggable: true,
    name: "crop-zoom-handle",
  });
  cropZoomHandle.on("pointerdown", (event) => { event.cancelBubble = true; });
  cropZoomHandle.on("dragstart", () => {
    if (!cropZoomHandle) return;
    gestureActive = true;
    cropGesture = {
      kind: "zoom",
      element: selected,
      crop: structuredClone(crop),
      startX: cropZoomHandle.x(),
      startY: cropZoomHandle.y(),
    };
  });
  cropZoomHandle.on("dragend", commitCropGesture);
  controlsLayer.add(cropPanHandle);
  controlsLayer.add(cropZoomHandle);
}

function syncSelection(): void {
  if (!transformer || !controlsLayer || gestureActive) return;
  transformer.nodes(props.activeTool === "select" && !props.readOnly ? selectedNodes() : []);
  tailHandle?.destroy();
  tailHandle = null;
  const selected = props.selectedElementIds.length === 1
    ? elementFor(props.selectedElementIds[0]!)
    : null;
  if (
    selected?.type === "balloon"
    && selected.tail.enabled
    && !selected.locked
    && !props.readOnly
    && props.activeTool === "select"
  ) {
    const point = projectBalloonTailTargetToKonvaV1(selected, {
      zoom: props.zoom,
      devicePixelRatio: devicePixelRatio(),
    });
    const handle = new Konva.Circle({
      x: point.x,
      y: point.y,
      radius: Math.max(6, 9 * props.zoom),
      fill: "#22C7A9",
      stroke: "#FFFFFF",
      strokeWidth: 2,
      draggable: true,
      name: "balloon-tail-handle",
    });
    tailHandle = handle;
    handle.on("pointerdown", (event) => { event.cancelBubble = true; });
    handle.on("dragstart", () => { gestureActive = true; });
    handle.on("dragend", () => {
      if (!gestureActive || handle !== tailHandle) return;
      const normalized = normalizeKonvaTailTargetV1(selected, handle.position(), {
        zoom: props.zoom,
        devicePixelRatio: devicePixelRatio(),
      });
      gestureActive = false;
      emit("commitTail", { elementId: selected.id, ...normalized });
      queueMicrotask(syncProjection);
    });
    controlsLayer.add(handle);
  }
  syncCropControls();
  controlsLayer.batchDraw();
}

function commitTransforms(elementIds: string[]): void {
  const elementIdSet = new Set(elementIds);
  const nodes = elementNodes()
    .filter((node) => elementIdSet.has(String(node.getAttr("elementId"))))
    .map((node) => ({
      elementId: String(node.getAttr("elementId")),
      centerX: node.x(),
      centerY: node.y(),
      width: node.width(),
      height: node.height(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    }));
  const changes = normalizeKonvaTransformBatchV1(props.canvas, nodes, {
    zoom: props.zoom,
    devicePixelRatio: devicePixelRatio(),
  });
  for (const node of elementNodes()) {
    if (!elementIdSet.has(String(node.getAttr("elementId")))) continue;
    node.scale({ x: 1, y: 1 });
  }
  gestureActive = false;
  if (changes.length) emit("commitTransform", changes);
  queueMicrotask(syncProjection);
}

function cancelGesture(): void {
  if (!gestureActive && !marqueeStart && !panPoint) return;
  gestureActive = false;
  dragStart = null;
  cropGesture = null;
  marqueeStart = null;
  panPoint = null;
  clearGuides();
  if (selectionRect) selectionRect.visible(false);
  syncProjection();
}

function pointerPosition(): { x: number; y: number } | null {
  const point = stage?.getPointerPosition();
  return point ? { x: point.x, y: point.y } : null;
}

function handleStagePointerDown(event: Konva.KonvaEventObject<PointerEvent>): void {
  if (!stage || props.readOnly || event.target !== stage) return;
  const point = pointerPosition();
  if (!point) return;
  if (props.activeTool === "pan") {
    panPoint = { x: event.evt.clientX, y: event.evt.clientY };
    return;
  }
  if (props.activeTool !== "select") {
    emit("replaceSelection", []);
    return;
  }
  marqueeStart = point;
  selectionRect?.setAttrs({ x: point.x, y: point.y, width: 0, height: 0, visible: true });
  controlsLayer?.batchDraw();
}

function handleStagePointerMove(event: Konva.KonvaEventObject<PointerEvent>): void {
  if (panPoint) {
    const next = { x: event.evt.clientX, y: event.evt.clientY };
    emit("pan", { dx: next.x - panPoint.x, dy: next.y - panPoint.y });
    panPoint = next;
    return;
  }
  if (!marqueeStart || !selectionRect) return;
  const point = pointerPosition();
  if (!point) return;
  selectionRect.setAttrs({
    x: Math.min(marqueeStart.x, point.x),
    y: Math.min(marqueeStart.y, point.y),
    width: Math.abs(point.x - marqueeStart.x),
    height: Math.abs(point.y - marqueeStart.y),
  });
  controlsLayer?.batchDraw();
}

function handleStagePointerUp(event: Konva.KonvaEventObject<PointerEvent>): void {
  if (panPoint) {
    panPoint = null;
    return;
  }
  if (!marqueeStart || !selectionRect) return;
  const additive = event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey;
  const box = selectionRect.getClientRect();
  const hits = box.width < 3 && box.height < 3
    ? []
    : elementNodes()
      .filter((node) => Konva.Util.haveIntersection(box, node.getClientRect()))
      .map((node) => String(node.getAttr("elementId")));
  selectionRect.visible(false);
  marqueeStart = null;
  const next = additive
    ? [...new Set([...props.selectedElementIds, ...hits])]
    : hits;
  emit("replaceSelection", next);
  controlsLayer?.batchDraw();
}

function handleStageWheel(event: Konva.KonvaEventObject<WheelEvent>): void {
  if (props.readOnly) return;
  event.evt.preventDefault();
  const factor = Math.exp(-event.evt.deltaY * 0.0015);
  const zoom = Math.max(0.1, Math.min(0.8, Math.round(props.zoom * factor * 100) / 100));
  if (zoom === props.zoom) return;
  emit("zoom", {
    zoom,
    clientX: event.evt.clientX,
    clientY: event.evt.clientY,
  });
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") cancelGesture();
}

onMounted(() => {
  if (!container.value) return;
  stage = new Konva.Stage({
    container: container.value,
    width: props.canvas.width * props.zoom,
    height: props.canvas.height * props.zoom,
  });
  contentLayer = new Konva.Layer();
  controlsLayer = new Konva.Layer();
  selectionRect = new Konva.Rect({
    visible: false,
    fill: "rgba(34,199,169,0.12)",
    stroke: "#22C7A9",
    strokeWidth: 1,
    dash: [5, 4],
    listening: false,
  });
  transformer = new Konva.Transformer({
    rotateEnabled: true,
    flipEnabled: false,
    keepRatio: false,
    ignoreStroke: true,
    borderStroke: "#22C7A9",
    anchorFill: "#0F172A",
    anchorStroke: "#A7F3D0",
    anchorSize: 9,
    enabledAnchors: [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
    boundBoxFunc: (oldBox, nextBox) => (
      Math.abs(nextBox.width) < 4 || Math.abs(nextBox.height) < 4 ? oldBox : nextBox
    ),
  });
  transformer.on("transformstart", () => { gestureActive = true; });
  transformer.on("transformend", () => {
    if (!gestureActive) return;
    commitTransforms(
      transformer?.nodes().map((node) => String(node.getAttr("elementId"))) ?? [],
    );
  });
  controlsLayer.add(selectionRect);
  controlsLayer.add(transformer);
  stage.add(contentLayer);
  stage.add(controlsLayer);
  stage.on("pointerdown", handleStagePointerDown);
  stage.on("pointermove", handleStagePointerMove);
  stage.on("pointerup", handleStagePointerUp);
  stage.on("pointercancel", cancelGesture);
  stage.on("wheel", handleStageWheel);
  globalThis.addEventListener("keydown", handleEscape, true);
  globalThis.addEventListener("blur", cancelGesture);
  syncProjection();
});

watch(
  () => [props.canvas, props.zoom, props.activeTool, props.readOnly] as const,
  syncProjection,
  { deep: true },
);
watch(() => props.selectedElementIds, syncSelection, { deep: true });

onBeforeUnmount(() => {
  globalThis.removeEventListener("keydown", handleEscape, true);
  globalThis.removeEventListener("blur", cancelGesture);
  stage?.destroy();
  stage = null;
  contentLayer = null;
  controlsLayer = null;
  transformer = null;
  selectionRect = null;
  tailHandle = null;
  cropPanHandle = null;
  cropZoomHandle = null;
  guideLines = [];
});
</script>

<style scoped>
.layout-konva-interaction-layer {
  position: absolute;
  z-index: 30;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.layout-konva-interaction-layer :deep(canvas) {
  touch-action: none;
}

.layout-konva-interaction-layer.is-pass-through {
  pointer-events: none;
}
</style>
