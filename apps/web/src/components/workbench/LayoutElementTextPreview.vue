<template>
  <div class="element-text-root" :class="{ 'has-overflow': overflow }">
    <svg
      v-if="element.type === 'balloon'"
      class="balloon-shape"
      :viewBox="`0 0 ${element.transform.width} ${element.transform.height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        :d="balloonPath"
        :fill="element.fillColor"
        :stroke="element.strokeColor"
        :stroke-width="element.strokeWidth"
        stroke-linejoin="round"
      />
    </svg>
    <div class="rich-text-preview" :style="containerStyle">
      <p
        v-for="(paragraph, paragraphIndex) in element.richText.paragraphs"
        :key="paragraphIndex"
        :style="paragraphStyle(paragraph)"
      >
        <span
          v-for="(run, runIndex) in paragraph.runs"
          :key="runIndex"
          :style="runStyle(run)"
        >{{ run.text }}</span>
        <br v-if="paragraph.runs.every((run) => run.text === '')" />
      </p>
    </div>
    <span v-if="overflow" class="overflow-mark">文字溢出</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  createBalloonPathV1,
  layoutFontFamilyNameV1,
  resolveLayoutBalloonVisualRoleV1,
  type BalloonElementV1,
  type RichTextParagraphV1,
  type RichTextRunV1,
  type TextElementV1,
} from "@airoaming/shared";

const props = defineProps<{
  element: TextElementV1 | BalloonElementV1;
  fallbackFontAssetIds: string[];
  scale: number;
  overflow: boolean;
}>();

const balloonPath = computed(() => props.element.type === "balloon"
  ? createBalloonPathV1({
      kind: resolveLayoutBalloonVisualRoleV1(props.element),
      width: props.element.transform.width,
      height: props.element.transform.height,
      tail: props.element.tail,
    })
  : "");

const containerStyle = computed(() => {
  const padding = props.element.type === "balloon" ? props.element.padding : { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    inset: `${padding.top * props.scale}px ${padding.right * props.scale}px ${padding.bottom * props.scale}px ${padding.left * props.scale}px`,
    writingMode: props.element.richText.writingMode,
    textOrientation: props.element.richText.textOrientation,
    alignContent: props.element.verticalAlign === "center" ? "center" : props.element.verticalAlign === "end" ? "end" : "start",
  };
});

function runStyle(run: RichTextRunV1) {
  const chain = [run.fontAssetId, ...props.fallbackFontAssetIds.filter((assetId) => assetId !== run.fontAssetId)];
  return {
    fontFamily: chain.map((assetId) => `"${layoutFontFamilyNameV1(assetId)}"`).join(","),
    fontSize: `${run.fontSize * props.scale}px`,
    fontWeight: run.fontWeight,
    fontStyle: run.fontStyle,
    color: run.color,
    letterSpacing: `${run.letterSpacing * props.scale}px`,
    WebkitTextStroke: run.stroke ? `${run.stroke.width * props.scale}px ${run.stroke.color}` : undefined,
  };
}

function paragraphStyle(paragraph: RichTextParagraphV1) {
  const maximumFontSize = Math.max(...paragraph.runs.map((run) => run.fontSize), 1);
  return {
    textAlign: paragraph.align,
    lineHeight: paragraph.lineHeight,
    fontSize: `${maximumFontSize * props.scale}px`,
  };
}
</script>

<style scoped>
.element-text-root,
.balloon-shape,
.rich-text-preview {
  position: absolute;
}

.element-text-root {
  inset: 0;
  pointer-events: none;
}

.balloon-shape {
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.rich-text-preview {
  display: grid;
  overflow: visible;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #111827;
}

.rich-text-preview p {
  margin: 0;
  min-width: 1px;
  min-height: 1em;
}

.overflow-mark {
  position: absolute;
  right: 0;
  bottom: 0;
  border-radius: 4px;
  background: #dc2626;
  color: white;
  font: 800 10px/1 system-ui, sans-serif;
  padding: 3px 5px;
  transform: translateY(100%);
}

.has-overflow .rich-text-preview {
  outline: 2px solid #dc2626;
  outline-offset: 2px;
}
</style>
