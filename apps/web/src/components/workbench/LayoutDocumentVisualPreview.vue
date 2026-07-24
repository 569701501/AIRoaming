<template>
  <section
    class="layout-document-visual-preview"
    data-testid="layout-authoritative-visual-preview"
    :data-review-state="reviewState.error ? 'error' : reviewState.renderReady ? reviewState.fullyViewed ? 'ready' : 'needs-scroll' : 'loading'"
  >
    <header>
      <div>
        <strong>{{ label }}</strong>
        <small>{{ document.profile.kind === 'paged' ? `${document.canvases.length} 页` : `${document.canvases.length} 段` }} · 完整视觉语义</small>
      </div>
      <span v-if="badge">{{ badge }}</span>
    </header>
    <div ref="canvasList" class="visual-canvas-list" @scroll="updateFullyViewed">
      <section v-for="canvas in document.canvases" :key="canvas.id" class="visual-canvas-item">
        <small>{{ canvas.name }}</small>
        <LayoutCanvasVisualPreview
          :canvas="canvas"
          :project-id="projectId"
          :font-catalog="fontCatalog"
          :source-catalog="sourceCatalog"
          :overflow-element-ids="overflowElementIds"
          @render-state="captureCanvasRenderState"
        />
      </section>
    </div>
    <button
      v-if="reviewRequired && reviewState.renderReady && !reviewState.error && !fullyViewed && !scrollable"
      type="button"
      class="confirm-visible-review"
      @click="confirmVisibleReview"
    >确认已查看完整预览</button>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  collectLayoutTextIssuesV1,
  type LayoutDocumentV1,
  type LayoutFontCatalogItemV1,
  type LayoutSourceCatalogItemV1,
} from "@airoaming/shared";

import type { LayoutFontLoadState } from "../../composables/layout-font-loader";
import LayoutCanvasVisualPreview from "./LayoutCanvasVisualPreview.vue";

const props = defineProps<{
  document: LayoutDocumentV1;
  projectId: string;
  label: string;
  badge?: string | null;
  sourceCatalog: LayoutSourceCatalogItemV1[];
  fontCatalog: LayoutFontCatalogItemV1[];
  fontLoadState: LayoutFontLoadState;
  reviewRequired?: boolean;
}>();

const emit = defineEmits<{
  reviewState: [value: { renderReady: boolean; fullyViewed: boolean; error: boolean }];
}>();

const canvasList = ref<HTMLElement | null>(null);
const canvasRenderStates = ref<Record<string, { ready: boolean; error: boolean }>>({});
const fullyViewed = ref(false);
const scrollable = ref(false);
const visibleReviewConfirmed = ref(false);
const readyReviewStarted = ref(false);
let resizeObserver: ResizeObserver | null = null;

const overflowElementIds = computed(() => new Set(
  collectLayoutTextIssuesV1(props.document, props.fontCatalog)
    .filter((issue) => issue.code === "LAYOUT_TEXT_OVERFLOW")
    .map((issue) => issue.elementId),
));
const reviewState = computed(() => {
  const states = props.document.canvases.map((canvas) => canvasRenderStates.value[canvas.id]);
  const error = props.fontLoadState === "error" || states.some((state) => state?.error === true);
  return {
    renderReady: !error
      && props.fontLoadState === "ready"
      && states.every((state) => state?.ready === true),
    fullyViewed: fullyViewed.value,
    error,
  };
});

function captureCanvasRenderState(value: { canvasId: string; ready: boolean; error: boolean }): void {
  canvasRenderStates.value = {
    ...canvasRenderStates.value,
    [value.canvasId]: { ready: value.ready, error: value.error },
  };
  void nextTick(updateFullyViewed);
}

function updateFullyViewed(): void {
  const element = canvasList.value;
  if (!element || !reviewState.value.renderReady || !readyReviewStarted.value) {
    fullyViewed.value = false;
    return;
  }
  scrollable.value = element.scrollHeight > element.clientHeight + 2;
  fullyViewed.value = scrollable.value
    ? element.scrollTop + element.clientHeight >= element.scrollHeight - 2
    : !props.reviewRequired || visibleReviewConfirmed.value;
}

function confirmVisibleReview(): void {
  visibleReviewConfirmed.value = true;
  updateFullyViewed();
}

function resetReadyReview(): void {
  readyReviewStarted.value = false;
  fullyViewed.value = false;
  scrollable.value = false;
  visibleReviewConfirmed.value = false;
}

function startReadyReview(): void {
  resetReadyReview();
  void nextTick(() => {
    const element = canvasList.value;
    if (!element || !reviewState.value.renderReady) return;
    element.scrollTop = 0;
    scrollable.value = element.scrollHeight > element.clientHeight + 2;
    readyReviewStarted.value = true;
    updateFullyViewed();
  });
}

function resetReview(): void {
  canvasRenderStates.value = {};
  resetReadyReview();
}

watch(() => props.document, resetReview, { immediate: true });
watch(
  () => reviewState.value.renderReady,
  (ready) => {
    if (ready) startReadyReview();
    else resetReadyReview();
  },
);
watch(reviewState, (value) => emit("reviewState", value), { immediate: true });

onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !canvasList.value) return;
  resizeObserver = new ResizeObserver(updateFullyViewed);
  resizeObserver.observe(canvasList.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.layout-document-visual-preview {
  display: grid;
  min-width: 0;
  gap: 10px;
  border: 1px solid rgba(132, 146, 178, 0.24);
  border-radius: 12px;
  background: rgba(7, 12, 23, 0.9);
  padding: 12px;
}

.layout-document-visual-preview > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.layout-document-visual-preview > header div,
.visual-canvas-item {
  display: grid;
  gap: 5px;
}

.layout-document-visual-preview strong {
  color: #f4f7ff;
  font-size: 13px;
}

.layout-document-visual-preview small {
  color: #8f9bb6;
  font-size: 10px;
}

.layout-document-visual-preview > header span {
  border-radius: 999px;
  background: rgba(34, 199, 169, 0.16);
  color: #8df0dc;
  padding: 3px 7px;
  font-size: 10px;
  white-space: nowrap;
}

.visual-canvas-list {
  display: grid;
  align-content: start;
  gap: 14px;
  max-height: 68vh;
  overflow: auto;
  padding-right: 3px;
}

.confirm-visible-review {
  justify-self: end;
  border: 1px solid rgba(34, 199, 169, 0.36);
  border-radius: 7px;
  background: rgba(34, 199, 169, 0.1);
  color: #a7f3d0;
  padding: 7px 10px;
  font: 700 11px/1.2 system-ui, sans-serif;
  cursor: pointer;
}
</style>
