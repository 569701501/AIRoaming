<template>
  <div class="layout-visual-canvas-shell">
    <article
      ref="canvasRoot"
      class="layout-visual-canvas"
      :data-canvas-id="canvas.id"
      :style="canvasStyle"
      :aria-label="`${canvas.name}，阅读顺序 ${canvas.panelReadingOrder.join('、') || '无画格'}`"
    >
      <div
        v-for="element in visibleElements"
        :key="element.id"
        class="layout-visual-element"
        :class="`type-${element.type}`"
        :style="[elementStyle(element), panelStyle(element)]"
        :aria-label="element.name"
      >
        <template v-if="element.type === 'panel_frame'">
          <img
            v-if="element.contentImage && !element.contentImage.hidden"
            :src="api.projectAssetFileUrl(projectId, element.contentImage.source.assetId)"
            :alt="element.contentImage.name"
            :style="imageStyle(element)"
            draggable="false"
            @load="captureIntrinsicDimensions(element.id, element.contentImage.source.assetId, $event)"
            @error="captureImageError(element.id)"
          />
          <span class="panel-border" :style="panelBorderStyle(element)" aria-hidden="true" />
        </template>
        <img
          v-else-if="element.type === 'free_image'"
          :src="api.projectAssetFileUrl(projectId, element.source.assetId)"
          :alt="element.name"
          :style="imageStyle(element)"
          draggable="false"
          @load="captureIntrinsicDimensions(element.id, element.source.assetId, $event)"
          @error="captureImageError(element.id)"
        />
        <LayoutElementTextPreview
          v-else-if="element.type === 'text' || element.type === 'balloon'"
          :element="element"
          :font-catalog="fontCatalog"
          :scale="scale"
          :overflow="false"
        />
      </div>
    </article>
    <ul v-if="diagnostics.length" class="layout-visual-diagnostics" aria-label="预览核对信息">
      <li
        v-for="diagnostic in diagnostics"
        :key="diagnostic.key"
        :class="{ 'is-error': diagnostic.kind === 'mismatch' }"
      >{{ diagnostic.label }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from "vue";
import type {
  LayoutCanvasV1,
  LayoutFontCatalogItemV1,
  LayoutSourceCatalogItemV1,
  LayoutTopLevelElementV1,
} from "@airoaming/shared";

import { api } from "../../services/api";
import LayoutElementTextPreview from "./LayoutElementTextPreview.vue";
import { layoutImagePreviewStyleV1 } from "./layout-image-preview";

const props = defineProps<{
  canvas: LayoutCanvasV1;
  projectId: string;
  fontCatalog: LayoutFontCatalogItemV1[];
  sourceCatalog: LayoutSourceCatalogItemV1[];
  overflowElementIds?: Set<string>;
}>();

const emit = defineEmits<{
  renderState: [value: { canvasId: string; ready: boolean; error: boolean }];
}>();

const canvasRoot = ref<HTMLElement | null>(null);
const measuredWidth = ref(0);
const intrinsicDimensions = ref<Record<string, { width: number; height: number }>>({});
const imageLoadStates = ref<Record<string, "loading" | "ready" | "error">>({});
let resizeObserver: ResizeObserver | null = null;

const scale = computed(() => measuredWidth.value > 0
  ? measuredWidth.value / props.canvas.width
  : 1);
const visibleElements = computed(() => props.canvas.elements.filter((element) => !element.hidden));
const imageElements = computed(() => visibleElements.value.filter((element) => (
  (element.type === "panel_frame" && Boolean(element.contentImage && !element.contentImage.hidden))
  || element.type === "free_image"
)));
const imageLoadIdentity = computed(() => imageElements.value.map((element) => {
  const assetId = sourceAssetId(element) ?? "";
  return `${element.id}:${assetId}`;
}).join("|"));
const diagnostics = computed(() => visibleElements.value.flatMap((element) => {
  const items: Array<{ key: string; kind: "loading" | "mismatch" | "overflow"; label: string }> = [];
  const resolution = imageResolutionStatus(element);
  if (resolution) {
    items.push({
      key: `image:${element.id}:${resolution.kind}`,
      kind: resolution.kind,
      label: `${element.name}：${resolution.label}`,
    });
  }
  if (
    (element.type === "text" || element.type === "balloon")
    && props.overflowElementIds?.has(element.id)
  ) {
    items.push({
      key: `text:${element.id}:overflow`,
      kind: "overflow",
      label: `${element.name}：文字溢出`,
    });
  }
  return items;
}));
const sourceDimensions = computed(() => new Map(
  props.sourceCatalog.map((item) => [
    item.source.assetId,
    { width: item.width, height: item.height },
  ]),
));
const renderState = computed(() => {
  const states = imageElements.value.map((element) => imageLoadStates.value[element.id] ?? "loading");
  return {
    canvasId: props.canvas.id,
    ready: states.every((state) => state === "ready"),
    error: states.some((state) => state === "error"),
  };
});
const canvasStyle = computed<CSSProperties>(() => ({
  aspectRatio: `${props.canvas.width} / ${props.canvas.height}`,
  backgroundColor: props.canvas.backgroundColor,
}));

function measure(): void {
  const width = canvasRoot.value?.getBoundingClientRect().width ?? 0;
  if (width > 0) measuredWidth.value = width;
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver === "undefined" || !canvasRoot.value) return;
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(canvasRoot.value);
});

watch(() => props.canvas.id, () => queueMicrotask(measure));
watch(imageLoadIdentity, () => {
  imageLoadStates.value = Object.fromEntries(
    imageElements.value.map((element) => [element.id, "loading"] as const),
  );
}, { immediate: true });
watch(renderState, (value) => emit("renderState", value), { immediate: true });

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function elementStyle(
  element: LayoutTopLevelElementV1,
): CSSProperties {
  const transform = element.transform;
  return {
    left: `${transform.x / props.canvas.width * 100}%`,
    top: `${transform.y / props.canvas.height * 100}%`,
    width: `${transform.width / props.canvas.width * 100}%`,
    height: `${transform.height / props.canvas.height * 100}%`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotation}deg)`,
    zIndex: props.canvas.elements.findIndex((candidate) => candidate.id === element.id) + 1,
  };
}

function panelStyle(element: LayoutTopLevelElementV1): CSSProperties {
  if (element.type !== "panel_frame") return {};
  return {
    borderRadius: `${element.shape.cornerRadius * scale.value}px`,
  };
}

function panelBorderStyle(
  element: Extract<LayoutTopLevelElementV1, { type: "panel_frame" }>,
): CSSProperties {
  return {
    borderStyle: element.border.visible ? "solid" : "none",
    borderColor: element.border.color,
    borderWidth: element.border.visible ? `${element.border.width * scale.value}px` : "0",
    borderRadius: `${element.shape.cornerRadius * scale.value}px`,
  };
}

function sourceAssetId(element: LayoutTopLevelElementV1): string | null {
  if (element.type === "panel_frame") return element.contentImage?.source.assetId ?? null;
  if (element.type === "free_image") return element.source.assetId;
  return null;
}

function isCoverImage(element: LayoutTopLevelElementV1): boolean {
  return element.type === "panel_frame"
    ? Boolean(element.contentImage && !element.contentImage.hidden)
    : element.type === "free_image" && element.display.mode === "cover";
}

function verifiedDimensions(element: LayoutTopLevelElementV1): { width: number; height: number } | null {
  const assetId = sourceAssetId(element);
  if (!assetId) return null;
  return sourceDimensions.value.get(assetId) ?? intrinsicDimensions.value[assetId] ?? null;
}

function captureIntrinsicDimensions(elementId: string, assetId: string, event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (!(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return;
  intrinsicDimensions.value = {
    ...intrinsicDimensions.value,
    [assetId]: { width: image.naturalWidth, height: image.naturalHeight },
  };
  imageLoadStates.value = {
    ...imageLoadStates.value,
    [elementId]: "ready",
  };
}

function captureImageError(elementId: string): void {
  imageLoadStates.value = {
    ...imageLoadStates.value,
    [elementId]: "error",
  };
}

function imageResolutionStatus(
  element: LayoutTopLevelElementV1,
): { kind: "loading" | "mismatch"; label: string } | null {
  if (!isCoverImage(element)) return null;
  const assetId = sourceAssetId(element);
  if (!assetId) return null;
  const catalog = sourceDimensions.value.get(assetId);
  const intrinsic = intrinsicDimensions.value[assetId];
  if (!catalog && !intrinsic) return { kind: "loading", label: "正在核对原始尺寸…" };
  if (
    catalog
    && intrinsic
    && (catalog.width !== intrinsic.width || catalog.height !== intrinsic.height)
  ) {
    return { kind: "mismatch", label: "素材尺寸与来源证据不一致" };
  }
  return null;
}

function imageStyle(element: LayoutTopLevelElementV1): CSSProperties {
  const dimensions = verifiedDimensions(element);
  const crop = element.type === "panel_frame"
    ? element.contentImage?.crop ?? null
    : element.type === "free_image" && element.display.mode === "cover"
      ? element.display.crop
      : null;
  return layoutImagePreviewStyleV1({
    mode: crop ? "cover" : "contain",
    crop,
    frameWidth: element.transform.width,
    frameHeight: element.transform.height,
    sourceWidth: dimensions?.width ?? null,
    sourceHeight: dimensions?.height ?? null,
    scale: scale.value,
  });
}
</script>

<style scoped>
.layout-visual-canvas-shell {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.layout-visual-canvas {
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.38);
}

.layout-visual-element {
  position: absolute;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  overflow: hidden;
  color: #111827;
  white-space: pre-wrap;
  text-align: center;
  transform-origin: center;
}

.layout-visual-element.type-balloon,
.layout-visual-element.type-text {
  overflow: visible;
}

.layout-visual-element > img {
  display: block;
  pointer-events: none;
}

.panel-border {
  position: absolute;
  z-index: 3;
  inset: 0;
  box-sizing: border-box;
  pointer-events: none;
}

.layout-visual-diagnostics {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.layout-visual-diagnostics li {
  border-radius: 5px;
  background: rgba(15, 23, 42, 0.86);
  color: #cbd5e1;
  padding: 4px 6px;
  font: 800 9px/1.2 system-ui, sans-serif;
}

.layout-visual-diagnostics li.is-error {
  background: rgba(127, 29, 29, 0.9);
  color: #fecdd3;
}
</style>
