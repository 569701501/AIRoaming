<template>
  <article class="mini-document">
    <header>
      <div>
        <strong>{{ label }}</strong>
        <small v-if="document">{{ canvasLabel }} · {{ elementCount }} 个对象</small>
      </div>
      <span v-if="badge">{{ badge }}</span>
    </header>

    <div v-if="document" class="mini-canvas-list">
      <section
        v-for="(canvas, index) in document.canvases"
        :key="canvas.id"
        class="mini-canvas-wrap"
      >
        <small>{{ canvas.name || `${canvasLabel} ${index + 1}` }}</small>
        <div
          class="mini-canvas"
          :style="{
            aspectRatio: `${canvas.width} / ${canvas.height}`,
            backgroundColor: canvas.backgroundColor.slice(0, 7),
          }"
        >
          <div
            v-for="element in canvas.elements.filter((item) => !item.hidden)"
            :key="element.id"
            class="mini-element"
            :class="[`type-${element.type}`, element.type === 'balloon' ? `balloon-${element.balloonKind}` : '']"
            :style="elementStyle(canvas, element)"
            :title="element.name"
          >
            <template v-if="element.type === 'panel_frame'">
              <img
                v-if="element.contentImage"
                :src="api.projectAssetFileUrl(projectId, element.contentImage.source.assetId)"
                :alt="element.name"
              />
            </template>
            <img
              v-else-if="element.type === 'free_image'"
              :src="api.projectAssetFileUrl(projectId, element.source.assetId)"
              :alt="element.name"
            />
            <span v-else>{{ plainText(element.richText) }}</span>
          </div>
        </div>
      </section>
    </div>
    <p v-else>暂无可预览内容</p>
  </article>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  richTextPlainTextV1,
  type LayoutCanvasV1,
  type LayoutDocumentV1,
  type LayoutTopLevelElementV1,
  type RichTextDocumentV1,
} from "@airoaming/shared";

import { api } from "../../services/api";

const props = defineProps<{
  document: LayoutDocumentV1 | null;
  projectId: string;
  label: string;
  badge?: string | null;
}>();

const canvasLabel = computed(() => props.document?.profile.kind === "paged"
  ? `${props.document.canvases.length} 页`
  : `${props.document?.canvases.length ?? 0} 段`);
const elementCount = computed(() => props.document?.canvases.reduce(
  (count, canvas) => count + canvas.elements.filter((element) => !element.hidden).length,
  0,
) ?? 0);

function plainText(value: RichTextDocumentV1): string {
  const text = richTextPlainTextV1(value).replace(/\s+/g, " ").trim();
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

function elementStyle(
  canvas: LayoutCanvasV1,
  element: LayoutTopLevelElementV1,
): CSSProperties {
  const transform = element.transform;
  return {
    left: `${transform.x / canvas.width * 100}%`,
    top: `${transform.y / canvas.height * 100}%`,
    width: `${transform.width / canvas.width * 100}%`,
    height: `${transform.height / canvas.height * 100}%`,
    transform: `rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
  };
}
</script>

<style scoped>
.mini-document {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(132, 146, 178, 0.22);
  border-radius: 12px;
  background: rgba(7, 12, 23, 0.78);
}

.mini-document > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.mini-document > header div {
  display: grid;
  gap: 3px;
}

.mini-document > header strong {
  font-size: 13px;
  color: #f4f7ff;
}

.mini-document > header small,
.mini-canvas-wrap > small,
.mini-document > p {
  font-size: 11px;
  color: #8f9bb6;
}

.mini-document > header span {
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(113, 93, 255, 0.16);
  color: #c9c0ff;
  font-size: 10px;
  white-space: nowrap;
}

.mini-canvas-list {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  max-height: 56vh;
  overflow: auto;
  padding-right: 3px;
}

.mini-canvas-wrap {
  display: grid;
  gap: 5px;
}

.mini-canvas {
  position: relative;
  width: 100%;
  min-height: 90px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  box-shadow: 0 9px 24px rgba(0, 0, 0, 0.23);
}

.mini-element {
  position: absolute;
  transform-origin: center;
  overflow: hidden;
  box-sizing: border-box;
}

.mini-element.type-panel_frame {
  border: 1px solid rgba(11, 14, 22, 0.95);
  background: #111827;
}

.mini-element.type-panel_frame img,
.mini-element.type-free_image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.mini-element.type-text,
.mini-element.type-balloon {
  display: grid;
  place-items: center;
  padding: 2px;
  color: #111827;
  font-size: clamp(4px, 0.74vw, 9px);
  line-height: 1.18;
  text-align: center;
  overflow: hidden;
}

.mini-element.type-text {
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.74);
}

.mini-element.type-balloon {
  overflow: visible;
  border: 1px solid rgba(10, 15, 25, 0.88);
  border-radius: 46% 52% 48% 50%;
  background: #fff;
}

.mini-element.balloon-thought {
  border-style: dashed;
  border-radius: 52%;
}

.mini-element.balloon-caption {
  border-radius: 4px;
}

.mini-element.balloon-shout {
  border-radius: 12% 40% 16% 44%;
  outline: 1px dashed rgba(10, 15, 25, 0.76);
}
</style>
