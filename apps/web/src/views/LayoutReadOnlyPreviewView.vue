<template>
  <main class="mobile-layout-preview" data-testid="layout-mobile-preview" aria-label="手机成稿只读预览">
    <header>
      <div>
        <span>只读预览</span>
        <h1>{{ title }}</h1>
        <p>{{ sourceLabel }} · {{ digestLabel }}</p>
      </div>
      <a :href="editorUrl">返回桌面成稿</a>
    </header>

    <section v-if="loading" class="state-card" aria-live="polite">正在读取已保存成稿…</section>
    <section v-else-if="errorMessage" class="state-card is-error" role="alert">{{ errorMessage }}</section>
    <template v-else-if="documentValue">
      <section class="preview-notices" aria-label="只读状态与预检">
        <article>
          <strong>{{ documentValue.comicFormat === 'paged_comic' ? '页漫翻页预览' : '条漫连续预览' }}</strong>
          <p>本页面没有初始化、保存版本、出版或 AI 应用入口，也不会发送布局写请求。</p>
        </article>
        <article v-if="sourceResolution !== 'current'" class="is-warning">
          <strong>{{ sourceResolution === 'stale' ? '来源已更新' : '来源待处理' }}</strong>
          <p>该成稿仍可只读查看，但不能据此绕过来源返修与正式预检。</p>
        </article>
        <article v-for="issue in textIssues" :key="`${issue.elementId}:${issue.code}`" class="is-warning">
          <strong>{{ issue.code === 'LAYOUT_TEXT_OVERFLOW' ? '文字溢出' : '字体或字符问题' }}</strong>
          <p>{{ issue.elementId }} · {{ issue.code }}</p>
        </article>
      </section>

      <nav v-if="isPaged && documentValue.canvases.length > 1" class="page-nav" aria-label="页漫翻页">
        <button type="button" :disabled="activePage === 0" @click="activePage -= 1">上一页</button>
        <span>{{ activePage + 1 }} / {{ documentValue.canvases.length }}</span>
        <button type="button" :disabled="activePage === documentValue.canvases.length - 1" @click="activePage += 1">下一页</button>
      </nav>

      <section class="scene-list" :class="{ 'is-strip': !isPaged }" aria-label="成稿内容">
        <article
          v-for="canvas in visibleCanvases"
          :key="canvas.id"
          :ref="(node) => registerCanvas(canvas.id, node)"
          class="readonly-canvas"
          :data-canvas-id="canvas.id"
          :style="canvasStyle(canvas)"
          :aria-label="`${canvas.name}，阅读顺序 ${canvas.panelReadingOrder.join('、') || '无画格'}`"
        >
          <div
            v-for="element in canvas.elements.filter((item) => !item.hidden)"
            :key="element.id"
            class="readonly-element"
            :class="`type-${element.type}`"
            :style="elementStyle(element, canvas)"
            :aria-label="element.name"
          >
            <template v-if="element.type === 'panel_frame'">
              <img v-if="element.contentImage" :src="api.projectAssetFileUrl(projectId, element.contentImage.source.assetId)" :alt="element.name" />
              <span v-else>空画格</span>
            </template>
            <img v-else-if="element.type === 'free_image'" :src="api.projectAssetFileUrl(projectId, element.source.assetId)" :alt="element.name" />
            <LayoutElementTextPreview
              v-else-if="element.type === 'text' || element.type === 'balloon'"
              :element="element"
              :fallback-font-asset-ids="documentValue.fontPolicy.fallbackFontAssetIds"
              :scale="canvasScale(canvas)"
              :overflow="overflowElementIds.has(element.id)"
            />
          </div>
        </article>
      </section>

      <section v-if="publicationArtifacts.length" class="publication-files" aria-label="出版产物">
        <strong>正式出版产物</strong>
        <a
          v-for="artifact in publicationArtifacts"
          :key="artifact.assetId"
          :href="api.layoutPublicationArtifactUrl(projectId, chapterId, publicationId!, artifact.assetId)"
          target="_blank"
          rel="noopener"
        >{{ artifact.role }} {{ artifact.order }}</a>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
  type CSSProperties,
} from "vue";
import { useRoute } from "vue-router";
import {
  collectLayoutTextIssuesV1,
  layoutFontFamilyNameV1,
  projectLayoutDocumentV2ToV1,
  type LayoutCanvasV1,
  type LayoutDocumentV1,
  type LayoutPublicationArtifactV1,
  type LayoutTopLevelElementV1,
} from "@airoaming/shared";

import LayoutElementTextPreview from "../components/workbench/LayoutElementTextPreview.vue";
import { api } from "../services/api";

const route = useRoute();
const projectId = String(route.params.projectId ?? "");
const chapterId = typeof route.query.chapterId === "string" ? route.query.chapterId : "";
const requestedSource = route.query.source === "revision" || route.query.source === "publication"
  ? route.query.source
  : "working_copy";
const requestedId = typeof route.query.id === "string" ? route.query.id : null;
const documentValue = ref<LayoutDocumentV1 | null>(null);
const sourceResolution = ref<"current" | "stale" | "unresolved">("current");
const sourceLabel = ref("当前草稿");
const digestLabel = ref("");
const title = ref("成稿预览");
const loading = ref(true);
const errorMessage = ref<string | null>(null);
const activePage = ref(0);
const fontCatalog = ref<Awaited<ReturnType<typeof api.getLayoutFonts>>["items"]>([]);
const publicationArtifacts = ref<LayoutPublicationArtifactV1[]>([]);
const publicationId = ref<string | null>(null);
const editorUrl = computed(() => `/projects/${encodeURIComponent(projectId)}/layout`);
const isPaged = computed(() => documentValue.value?.comicFormat === "paged_comic");
const visibleCanvases = computed(() => {
  const canvases = documentValue.value?.canvases ?? [];
  return isPaged.value ? canvases.slice(activePage.value, activePage.value + 1) : canvases;
});
const textIssues = computed(() => documentValue.value
  ? collectLayoutTextIssuesV1(documentValue.value, fontCatalog.value)
  : []);
const overflowElementIds = computed(() => new Set(
  textIssues.value
    .filter((issue) => issue.code === "LAYOUT_TEXT_OVERFLOW")
    .map((issue) => issue.elementId),
));
const canvasWidths = ref<Record<string, number>>({});
const canvasElements = new Map<string, HTMLElement>();
let canvasResizeObserver: ResizeObserver | null = null;
let installedFontStyle: HTMLStyleElement | null = null;

onMounted(async () => {
  if (typeof ResizeObserver !== "undefined") {
    canvasResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const canvasId = (entry.target as HTMLElement).dataset.canvasId;
        if (canvasId) updateCanvasWidth(canvasId, entry.contentRect.width);
      }
    });
    for (const element of canvasElements.values()) canvasResizeObserver.observe(element);
  }
  if (!projectId || !chapterId) {
    errorMessage.value = "缺少 projectId 或 chapterId。";
    loading.value = false;
    return;
  }
  try {
    const [fonts, workbench] = await Promise.all([
      api.getLayoutFonts(projectId, chapterId),
      api.workbench(projectId, chapterId),
    ]);
    fontCatalog.value = fonts.items;
    title.value = workbench.snapshot.currentChapter?.title || "成稿预览";
    installFonts(fonts.items);
    if (requestedSource === "working_copy") {
      const workingCopy = await api.getLayoutWorkingCopy(projectId, chapterId);
      documentValue.value = workingCopy.document.schemaVersion === 2
        ? projectLayoutDocumentV2ToV1(workingCopy.document)
        : workingCopy.document;
      sourceResolution.value = workingCopy.sourceEvaluation.sourceResolution;
      sourceLabel.value = `当前草稿 · v${workingCopy.rowVersion} · ${new Date(workingCopy.updatedAt).toLocaleString()}`;
      digestLabel.value = shortDigest(workingCopy.documentDigest);
    } else if (requestedSource === "revision") {
      if (!requestedId) throw new Error("缺少成稿版本 id。 ");
      const revision = await api.getLayoutRevision(projectId, chapterId, requestedId);
      documentValue.value = revision.document;
      sourceResolution.value = revision.sourceResolution;
      sourceLabel.value = `不可变成稿版本 ${revision.revision}`;
      digestLabel.value = shortDigest(revision.documentDigest);
    } else {
      if (!requestedId) throw new Error("缺少出版版本 id。 ");
      const publication = await api.getLayoutPublication(projectId, chapterId, requestedId);
      const revision = await api.getLayoutRevision(projectId, chapterId, publication.layoutRevisionId);
      documentValue.value = revision.document;
      sourceResolution.value = revision.sourceResolution;
      sourceLabel.value = `出版 ${publication.revision} · ${getPublicationStatusLabel(publication.status)} · ${publication.revisionPosition === 'current' ? '当前' : '历史'}`;
      digestLabel.value = shortDigest(revision.documentDigest);
      publicationArtifacts.value = publication.artifacts;
      publicationId.value = publication.id;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "只读预览读取失败";
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  canvasResizeObserver?.disconnect();
  canvasResizeObserver = null;
  canvasElements.clear();
  installedFontStyle?.remove();
  installedFontStyle = null;
});

function installFonts(items: Awaited<ReturnType<typeof api.getLayoutFonts>>["items"]): void {
  const rules = items.map((item) => `@font-face{font-family:"${layoutFontFamilyNameV1(item.assetId)}";src:url("${api.layoutFontFileUrl(projectId, chapterId, item.assetId)}") format("${item.metadata.format}");font-weight:${item.metadata.face.weight};font-style:${item.metadata.face.style};font-display:block;}`);
  const style = globalThis.document.createElement("style");
  style.dataset.layoutPreviewFonts = "true";
  style.textContent = rules.join("\n");
  installedFontStyle?.remove();
  installedFontStyle = style;
  globalThis.document.head.append(style);
}

function registerCanvas(canvasId: string, node: Element | ComponentPublicInstance | null): void {
  const next = node instanceof HTMLElement ? node : null;
  const previous = canvasElements.get(canvasId);
  if (previous && previous !== next) canvasResizeObserver?.unobserve(previous);
  if (!next) {
    canvasElements.delete(canvasId);
    const nextWidths = { ...canvasWidths.value };
    delete nextWidths[canvasId];
    canvasWidths.value = nextWidths;
    return;
  }
  canvasElements.set(canvasId, next);
  updateCanvasWidth(canvasId, next.getBoundingClientRect().width);
  canvasResizeObserver?.observe(next);
}

function updateCanvasWidth(canvasId: string, width: number): void {
  if (!(width > 0) || canvasWidths.value[canvasId] === width) return;
  canvasWidths.value = { ...canvasWidths.value, [canvasId]: width };
}

function canvasScale(canvas: LayoutCanvasV1): number {
  const measuredWidth = canvasWidths.value[canvas.id];
  if (measuredWidth && measuredWidth > 0) return measuredWidth / canvas.width;
  const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : canvas.width + 28;
  return Math.max(1, Math.min(760, viewportWidth - 28)) / canvas.width;
}

function getPublicationStatusLabel(status: string): string {
  return ({
    queued: "排队中",
    rendering: "渲染中",
    ready: "已完成",
    failed: "失败",
    cancelled: "已取消",
  } as Record<string, string>)[status] ?? status;
}

function shortDigest(value: string): string {
  return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

function canvasStyle(canvas: LayoutCanvasV1): CSSProperties {
  return { aspectRatio: `${canvas.width} / ${canvas.height}`, backgroundColor: canvas.backgroundColor.slice(0, 7) };
}

function elementStyle(element: LayoutTopLevelElementV1, canvas: LayoutCanvasV1): CSSProperties {
  const transform = element.transform;
  return {
    left: `${transform.x / canvas.width * 100}%`,
    top: `${transform.y / canvas.height * 100}%`,
    width: `${transform.width / canvas.width * 100}%`,
    height: `${transform.height / canvas.height * 100}%`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotation}deg)`,
    zIndex: canvas.elements.findIndex((candidate) => candidate.id === element.id) + 1,
  };
}
</script>

<style scoped>
.mobile-layout-preview { min-height: 100vh; box-sizing: border-box; background: #070c16; color: #edf3ff; padding: 18px 14px 48px; }
.mobile-layout-preview > header { display: flex; justify-content: space-between; gap: 14px; align-items: start; max-width: 760px; margin: 0 auto 16px; }
.mobile-layout-preview h1, .mobile-layout-preview p { margin: 0; }
.mobile-layout-preview h1 { margin: 4px 0; font-size: 22px; }
.mobile-layout-preview header span { color: #8df0dc; font-size: 12px; font-weight: 900; }
.mobile-layout-preview header p { color: #8493ae; font-size: 11px; overflow-wrap: anywhere; }
.mobile-layout-preview a, .mobile-layout-preview button { border: 1px solid rgba(116,95,255,.35); border-radius: 9px; background: rgba(116,95,255,.12); color: #d8d3ff; min-height: 36px; padding: 8px 11px; text-decoration: none; font-weight: 800; }
.state-card, .preview-notices, .scene-list, .page-nav, .publication-files { max-width: 760px; margin: 0 auto 14px; }
.state-card, .preview-notices article, .publication-files { border: 1px solid rgba(148,163,184,.16); border-radius: 12px; background: #101827; padding: 13px; }
.state-card.is-error { color: #fecdd3; border-color: rgba(251,113,133,.35); }
.preview-notices { display: grid; gap: 8px; }
.preview-notices article p { color: #94a3bd; font-size: 12px; margin-top: 4px; line-height: 1.5; }
.preview-notices article.is-warning { border-color: rgba(245,158,11,.32); }
.page-nav { display: flex; align-items: center; justify-content: center; gap: 14px; }
.page-nav button:disabled { opacity: .35; }
.scene-list { display: grid; gap: 12px; }
.readonly-canvas { position: relative; width: 100%; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,.38); }
.readonly-element { position: absolute; display: grid; place-items: center; box-sizing: border-box; overflow: hidden; color: #111827; white-space: pre-wrap; text-align: center; transform-origin: center; }
.readonly-element.type-panel_frame { border: 1px solid #111827; background: #d7dce5; }
.readonly-element.type-balloon, .readonly-element.type-text { overflow: visible; }
.readonly-element img { width: 100%; height: 100%; object-fit: cover; }
.readonly-element.type-panel_frame > span { font-size: clamp(8px, 2.4vw, 20px); line-height: 1.25; }
.publication-files { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.publication-files strong { width: 100%; }
@media (min-width: 800px) { .mobile-layout-preview { padding-top: 28px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
</style>
