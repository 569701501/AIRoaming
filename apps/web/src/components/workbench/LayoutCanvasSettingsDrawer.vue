<template>
  <aside v-if="open" class="canvas-settings-drawer" data-testid="layout-canvas-settings" aria-label="画布设置">
    <header class="drawer-head">
      <strong>画布设置</strong>
      <button type="button" aria-label="关闭画布设置" @click="emit('close')"><X :size="15" /></button>
    </header>

    <div class="drawer-body">
      <section class="special-properties profile-resize" data-testid="layout-profile-resize-preview" aria-label="画布尺寸预览">
        <div class="section-heading">
          <strong>画布尺寸</strong>
          <small>先预览，再一次应用到当前成稿</small>
        </div>
        <div class="number-grid">
          <label>宽度 <input v-model.number="resizeWidth" type="number" min="320" :max="isPaged ? 8192 : 4096" :disabled="readOnly" /></label>
          <label>{{ isPaged ? '高度' : '新段默认高' }} <input v-model.number="resizeHeight" type="number" min="320" max="8192" :disabled="readOnly" /></label>
        </div>
        <label>已有内容处理
          <select v-model="resizeMode" :disabled="readOnly">
            <option value="keep_coordinates">保留坐标</option>
            <option value="scale_uniform">等比缩放</option>
          </select>
        </label>
        <p v-if="profileResizeResult.preview" aria-live="polite">
          {{ profileResizeResult.preview.mode === 'scale_uniform' ? '已有内容将等比缩放' : '已有内容坐标不变' }}；
          {{ isPaged ? `全部页面变为 ${resizeWidth} × ${resizeHeight}` : `已有段落保持独立文档坐标，新段默认高 ${resizeHeight}` }}。
        </p>
        <p v-else role="alert">{{ profileResizeResult.error }}</p>
        <button type="button" :disabled="readOnly || !profileResizeResult.preview" @click="applyProfileResize">应用尺寸调整</button>
        <template v-if="!isPaged">
          <label>当前段高度
            <input v-model.number="currentSectionHeight" type="number" min="320" max="8192" :disabled="readOnly" />
          </label>
          <button type="button" :disabled="readOnly || currentSectionHeight < 320" @click="applySectionHeight">调整当前段高</button>
        </template>
      </section>

      <section v-if="advancedToolsVisible" class="preset-picker" data-testid="layout-preset-picker">
        <div class="section-heading">
          <strong>画格模板</strong>
          <small>不删除文字、气泡或自由图</small>
        </div>
        <div class="preset-grid">
          <button
            v-for="preset in presetOptions"
            :key="preset.id"
            type="button"
            :class="{ 'is-active': selectedPresetId === preset.id }"
            :disabled="readOnly"
            @click="selectedPresetId = preset.id"
          >{{ preset.label }}<small>{{ preset.count }} 格</small></button>
        </div>
        <p>{{ presetPreviewLabel }}</p>
        <button type="button" :disabled="readOnly || !canApplyPreset" @click="applyPreset">应用到当前画布</button>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import type {
  LayoutCanvasV1,
  LayoutDocumentV1,
  LayoutPresetIdV1,
  LayoutProfileResizeModeV1,
  PanelFrameElementV1,
  PanelImageElementV1,
} from "@airoaming/shared";
import {
  generateLayoutPresetV1,
  previewLayoutProfileResizeV1,
} from "@airoaming/shared";

const props = defineProps<{
  open: boolean;
  isPaged: boolean;
  readOnly: boolean;
  advancedToolsVisible: boolean;
  layoutDocument: LayoutDocumentV1 | null;
  canvas: LayoutCanvasV1 | null;
  panels: PanelFrameElementV1[];
}>();

const emit = defineEmits<{
  close: [];
  applyProfileResize: [preview: { profile: LayoutDocumentV1["profile"]; canvases: LayoutCanvasV1[] }];
  applySectionHeight: [height: number];
  applyPreset: [value: { panels: PanelFrameElementV1[]; panelReadingOrder: string[] }];
}>();

const resizeWidth = ref(props.isPaged ? 1800 : 1080);
const resizeHeight = ref(props.isPaged ? 2400 : 1920);
const resizeMode = ref<LayoutProfileResizeModeV1>("keep_coordinates");
const currentSectionHeight = ref(1920);
const selectedPresetId = ref<LayoutPresetIdV1>(props.isPaged ? "four_panel" : "single");

const presetOptions: Array<{ id: LayoutPresetIdV1; label: string; count: number }> = [
  { id: "single", label: "单格", count: 1 },
  { id: "two_vertical", label: "上下双格", count: 2 },
  { id: "two_horizontal", label: "左右双格", count: 2 },
  { id: "three_focus", label: "一大两小", count: 3 },
  { id: "four_panel", label: "四格", count: 4 },
  { id: "dialogue_two", label: "对话双格", count: 2 },
  { id: "action_focus", label: "动作聚焦", count: 3 },
];

watch(() => {
  const profile = props.layoutDocument?.profile;
  const canvas = props.canvas;
  return profile ? `${profile.kind}:${profile.width}:${profile.kind === "paged" ? profile.height : profile.defaultSectionHeight}:${canvas?.id ?? ""}:${canvas?.height ?? 0}` : "";
}, () => {
  const profile = props.layoutDocument?.profile;
  if (!profile) return;
  resizeWidth.value = profile.width;
  resizeHeight.value = profile.kind === "paged" ? profile.height : profile.defaultSectionHeight;
  currentSectionHeight.value = props.canvas?.height ?? resizeHeight.value;
}, { immediate: true });

const profileResizeResult = computed(() => {
  if (!props.layoutDocument) return { preview: null, error: "排版草稿尚未加载。" };
  try {
    return {
      preview: previewLayoutProfileResizeV1({
        document: props.layoutDocument,
        width: resizeWidth.value,
        height: resizeHeight.value,
        mode: resizeMode.value,
      }),
      error: null,
    };
  } catch (error) {
    return { preview: null, error: error instanceof Error ? error.message : "尺寸预览失败" };
  }
});

const occupiedPanelCount = computed(() => props.panels.filter((panel) => panel.contentImage).length);
const selectedPreset = computed(() => presetOptions.find((preset) => preset.id === selectedPresetId.value)!);
const canApplyPreset = computed(() => selectedPreset.value.count >= occupiedPanelCount.value && Boolean(props.canvas));
const presetPreviewLabel = computed(() => canApplyPreset.value
  ? `将 ${occupiedPanelCount.value} 张已放置图片按阅读顺序映射到 ${selectedPreset.value.count} 个正式画格。`
  : `当前有 ${occupiedPanelCount.value} 个已占用画格，${selectedPreset.value.count} 格模板会丢图，已阻止应用。`);

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function applyProfileResize(): void {
  const preview = profileResizeResult.value.preview;
  if (!preview) return;
  emit("applyProfileResize", { profile: preview.profile, canvases: preview.canvases });
}

function applySectionHeight(): void {
  if (props.isPaged || currentSectionHeight.value < 320 || currentSectionHeight.value > 8192) return;
  emit("applySectionHeight", currentSectionHeight.value);
}

function applyPreset(): void {
  const canvas = props.canvas;
  const document = props.layoutDocument;
  if (!canvas || !document || !canApplyPreset.value) return;
  const inset = document.profile.kind === "paged"
    ? document.profile.safeArea
    : { top: 64, right: document.profile.safeInsetX, bottom: 64, left: document.profile.safeInsetX };
  const images: PanelImageElementV1[] = props.panels.flatMap((panel) => panel.contentImage ? [panel.contentImage] : []);
  const generated = generateLayoutPresetV1({
    presetId: selectedPresetId.value,
    presetVersion: 1,
    width: canvas.width,
    height: canvas.height,
    inset,
    gap: document.profile.kind === "paged" ? 48 : 24,
    panelIds: Array.from({ length: selectedPreset.value.count }, () => newId("panel")),
  });
  const panels = generated.map((panel, index) => ({
    ...panel,
    name: `画格 ${index + 1}`,
    contentImage: images[index] ? structuredClone(images[index]) : null,
  }));
  emit("applyPreset", { panels, panelReadingOrder: panels.map((panel) => panel.id) });
}
</script>

<style scoped>
.canvas-settings-drawer {
  position: absolute;
  z-index: 45;
  top: 45px;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 320px;
  max-width: calc(100% - 48px);
  border-left: 1px solid rgba(148, 163, 184, 0.14);
  background: #10141f;
  box-shadow: -18px 0 44px rgba(2, 6, 17, 0.5);
  color: #e8edf8;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  padding: 12px 14px;
}

.drawer-head button {
  display: grid;
  place-items: center;
  width: 28px;
  min-height: 28px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(22, 32, 51, 0.9);
  color: #d9e2f3;
  padding: 0;
  cursor: pointer;
}

.drawer-body {
  display: grid;
  align-content: start;
  gap: 14px;
  overflow: auto;
  padding: 14px;
}

.drawer-body button {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(22, 32, 51, 0.9);
  color: #d9e2f3;
  min-height: 32px;
  padding: 0 10px;
  cursor: pointer;
  font: inherit;
}

.drawer-body button:disabled { opacity: 0.4; cursor: not-allowed; }

.drawer-body input,
.drawer-body select {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: #0d1526;
  color: #eef3fb;
  min-height: 34px;
  padding: 0 9px;
  font: inherit;
}

.preset-picker,
.special-properties { display: grid; gap: 9px; border-bottom: 1px solid rgba(148, 163, 184, 0.14); padding-bottom: 14px; }
.section-heading { display: grid; gap: 3px; }
.section-heading small { color: #7f8ca8; font-size: 11px; }
.number-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.number-grid label { display: grid; gap: 5px; color: #8491aa; font-size: 12px; }
.number-grid input { width: 100%; box-sizing: border-box; }
.special-properties > label { display: grid; gap: 5px; color: #8491aa; font-size: 12px; }
.special-properties > p,
.preset-picker > p { margin: 0; color: #8491aa; font-size: 11px; line-height: 1.5; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.preset-grid button { display: flex; justify-content: space-between; align-items: center; min-width: 0; padding: 6px 8px; font-size: 12px; }
.preset-grid button.is-active { border-color: rgba(139, 92, 246, 0.5); background: rgba(139, 92, 246, 0.16); color: #ddd3ff; }
.preset-grid small { color: #7f8ca8; font-size: 10px; }
</style>
