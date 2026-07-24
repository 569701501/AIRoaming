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
    <div
      class="text-body"
      :class="{ 'balloon-body': element.type === 'balloon' }"
      :style="bodyStyle"
    >
      <div class="rich-text-preview" :style="containerStyle">
        <div
          v-for="(paragraph, paragraphIndex) in element.richText.paragraphs"
          :key="paragraphIndex"
          :style="paragraphStyle(paragraph)"
        >
          <span
            v-for="(run, runIndex) in paragraph.runs"
            :key="runIndex"
            :style="runStyle(run)"
          >{{ run.text }}</span>
        </div>
      </div>
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
  type LayoutFontCatalogItemV1,
  type RichTextParagraphV1,
  type RichTextRunV1,
  type TextElementV1,
} from "@airoaming/shared";

const props = defineProps<{
  element: TextElementV1 | BalloonElementV1;
  fontCatalog: LayoutFontCatalogItemV1[];
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
  return {
    writingMode: props.element.richText.writingMode,
    textOrientation: props.element.richText.textOrientation,
  };
});

const bodyStyle = computed(() => {
  if (props.element.type !== "balloon") return {};
  return {
    padding: `${props.element.padding.top * props.scale}px ${props.element.padding.right * props.scale}px ${props.element.padding.bottom * props.scale}px ${props.element.padding.left * props.scale}px`,
    alignItems: props.element.verticalAlign === "start"
      ? "flex-start"
      : props.element.verticalAlign === "end"
        ? "flex-end"
        : "center",
  };
});

function runStyle(run: RichTextRunV1) {
  const face = props.fontCatalog.find((font) => font.assetId === run.fontAssetId)?.metadata.face;
  return {
    fontFamily: `"${layoutFontFamilyNameV1(run.fontAssetId)}"`,
    fontSize: `${run.fontSize * props.scale}px`,
    fontWeight: face?.weight ?? run.fontWeight,
    fontStyle: face?.style ?? run.fontStyle,
    color: run.color,
    letterSpacing: `${run.letterSpacing * props.scale}px`,
    WebkitTextStroke: run.stroke ? `${run.stroke.width * props.scale}px ${run.stroke.color}` : undefined,
  };
}

function paragraphStyle(paragraph: RichTextParagraphV1) {
  return {
    textAlign: paragraph.align,
    lineHeight: paragraph.lineHeight,
  };
}
</script>

<style scoped>
.element-text-root,
.balloon-shape,
.text-body,
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

.text-body {
  inset: 0;
}

.text-body.balloon-body {
  display: flex;
  box-sizing: border-box;
}

.rich-text-preview {
  inset: 0;
  overflow: visible;
  white-space: pre-wrap;
  font-synthesis: none;
}

.balloon-body > .rich-text-preview {
  position: relative;
  inset: auto;
  width: 100%;
  height: max-content;
}

.rich-text-preview > div {
  margin: 0;
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
