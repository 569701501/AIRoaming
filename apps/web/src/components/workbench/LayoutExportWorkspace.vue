<template>
  <section class="layout-editor" data-testid="layout-editor-shell" aria-label="成稿编辑器">
    <header class="editor-topbar">
      <div class="chapter-picker">
        <LayoutTemplate :size="17" />
        <select :value="chapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }}
          </option>
        </select>
        <span class="format-badge">{{ formatLabel }}</span>
      </div>

      <div class="editor-status" :class="`is-${session.saveState.value}`">
        <span class="status-dot" />
        {{ saveStateLabel }}
        <small v-if="session.server.value">v{{ session.server.value.rowVersion }}</small>
      </div>

      <div class="top-actions">
        <button type="button" :disabled="!session.canUndo.value" title="撤销" @click="session.undo">
          <Undo2 :size="16" />
        </button>
        <button type="button" :disabled="!session.canRedo.value" title="重做" @click="session.redo">
          <Redo2 :size="16" />
        </button>
        <button type="button" :disabled="!session.isDirty.value || session.isReadOnly.value" @click="session.flush">
          <CloudUpload :size="16" />
          立即保存
        </button>
        <button type="button" disabled title="基础排版由数据库草稿初始化入口创建">生成排版</button>
        <button type="button" disabled title="M6 接入正式版本保存">保存版本</button>
        <button type="button" disabled title="M7 接入正式出版">导出 PNG 序列</button>
      </div>
    </header>

    <section
      v-if="sourceAttention"
      class="layout-source-attention"
      data-testid="candidate-source-status"
      aria-label="候选来源状态"
    >
      <AlertTriangle :size="19" />
      <div>
        <strong>{{ sourceAttention.title }}</strong>
        <p>{{ sourceAttention.message }}</p>
        <small>旧排版和导出仍保留为历史；请回候选图确认当前定稿。实际换图与裁切将在成稿编辑阶段处理。</small>
      </div>
      <button type="button" :disabled="loading" @click="$emit('goCandidates')">查看候选定稿</button>
    </section>

    <div v-if="session.isReadOnly.value" class="mobile-readonly">
      <Smartphone :size="22" />
      <div>
        <strong>手机端只读</strong>
        <p>当前宽度只展示最近一次数据库保存结果，不会发送初始化或保存请求。请使用至少 1024px 宽的窗口编辑。</p>
      </div>
    </div>

    <div v-if="session.saveState.value === 'conflict'" class="conflict-banner" role="alert">
      <AlertTriangle :size="20" />
      <div>
        <strong>检测到另一个标签页更新了草稿</strong>
        <p>自动保存已暂停，本地内容没有覆盖服务端。请先下载恢复副本，再选择处理方式。</p>
      </div>
      <button type="button" @click="session.downloadRecovery">下载本地恢复副本</button>
      <button type="button" @click="session.reloadServer">重新加载服务端</button>
      <button class="danger-action" type="button" @click="session.keepLocalAndRetry">明确保留本地</button>
    </div>

    <div v-if="session.errorMessage.value" class="error-banner" role="alert">
      {{ session.errorMessage.value }}
    </div>

    <section v-if="session.saveState.value === 'loading'" class="center-state">
      <LoaderCircle class="spin" :size="28" />
      <strong>正在读取数据库草稿</strong>
    </section>

    <section v-else-if="session.saveState.value === 'missing'" class="create-draft">
      <div class="create-card">
        <LayoutPanelTop :size="30" />
        <h2>创建成稿草稿</h2>
        <p>草稿只保存在目标数据库，不会生成正式版本，也不会写入旧 layout.json。</p>
        <label>
          初始内容
          <select v-model="initializationMode" :disabled="session.isReadOnly.value">
            <option value="default_storyboard_layout">按当前分镜建立基础排版</option>
            <option value="blank">创建空白草稿</option>
          </select>
        </label>
        <div class="profile-grid">
          <label>
            宽度
            <input v-model.number="profileWidth" type="number" min="320" max="8192" :disabled="session.isReadOnly.value" />
          </label>
          <label>
            {{ isPaged ? '高度' : '默认段高' }}
            <input v-model.number="profileHeight" type="number" min="320" max="16384" :disabled="session.isReadOnly.value" />
          </label>
        </div>
        <button class="primary-action" type="button" :disabled="session.isReadOnly.value || !canInitialize" @click="initializeDraft">
          创建数据库草稿
        </button>
        <button type="button" @click="$emit('goCandidates')">返回候选图检查来源</button>
      </div>
    </section>

    <div v-else-if="session.document.value && session.currentCanvas.value" class="editor-shell" :class="{ 'is-readonly': session.isReadOnly.value }">
      <nav class="tool-rail" aria-label="画布工具">
        <button class="is-active" type="button" title="选择"><MousePointer2 :size="18" /></button>
        <button type="button" title="平移"><Hand :size="18" /></button>
        <span />
        <button type="button" disabled title="M4 接入画格"><SquareDashed :size="18" /></button>
        <button type="button" disabled title="M4 接入图片"><ImageIcon :size="18" /></button>
        <button type="button" disabled title="M5 接入文字"><Type :size="18" /></button>
        <button type="button" disabled title="M5 接入气泡"><MessageCircle :size="18" /></button>
      </nav>

      <aside class="canvas-navigation">
        <div class="panel-heading">
          <strong>{{ isPaged ? '页面' : '条漫段落' }}</strong>
          <small>{{ session.document.value.canvases.length }}</small>
        </div>
        <button
          v-for="(canvas, index) in session.document.value.canvases"
          :key="canvas.id"
          class="canvas-nav-item"
          :class="{ 'is-active': canvas.id === session.selectedCanvasId.value }"
          type="button"
          @click="session.selectCanvas(canvas.id)"
        >
          <span>{{ index + 1 }}</span>
          <div>
            <strong>{{ canvas.name }}</strong>
            <small>{{ canvas.width }} × {{ canvas.height }}</small>
          </div>
        </button>
        <div class="source-summary">
          <strong>来源状态</strong>
          <span>{{ sourceStateLabel }}</span>
          <button v-if="sourceNeedsAttention" type="button" @click="$emit('goCandidates')">查看候选定稿</button>
        </div>
      </aside>

      <main class="canvas-workspace">
        <div class="canvas-toolbar">
          <div>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('left')">左对齐</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('center')">水平居中</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('top')">顶对齐</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 3 || session.isReadOnly.value" @click="distributeHorizontal">水平分布</button>
          </div>
          <label>
            缩放
            <input v-model.number="session.zoom.value" type="range" min="0.1" max="0.6" step="0.02" />
            <span>{{ Math.round(session.zoom.value * 100) }}%</span>
          </label>
        </div>
        <div
          class="stage-scroll"
          @pointermove="moveDrag"
          @pointerup="finishDrag"
          @pointercancel="cancelDrag"
        >
          <div
            class="document-canvas"
            :style="canvasStyle"
            @pointerdown.self="session.selectedElementIds.value = []"
          >
            <article
              v-for="element in visibleElements"
              :key="element.id"
              class="canvas-element"
              :class="[`type-${element.type}`, { 'is-selected': isSelected(element.id), 'is-locked': element.locked }]"
              :style="elementStyle(element)"
              @pointerdown.stop="startDrag($event, element)"
            >
              <template v-if="element.type === 'panel_frame'">
                <img
                  v-if="element.contentImage"
                  :src="api.projectAssetFileUrl(snapshot.project.id, element.contentImage.source.assetId)"
                  :alt="element.contentImage.name"
                  draggable="false"
                />
                <span v-else>空画格</span>
              </template>
              <img
                v-else-if="element.type === 'free_image'"
                :src="api.projectAssetFileUrl(snapshot.project.id, element.source.assetId)"
                :alt="element.name"
                draggable="false"
              />
              <span v-else-if="element.type === 'text'" class="text-preview">{{ richTextValue(element.richText) }}</span>
              <span v-else class="balloon-preview">{{ richTextValue(element.richText) }}</span>
              <span v-if="element.locked" class="lock-mark"><Lock :size="12" /></span>
            </article>
          </div>
        </div>
      </main>

      <aside class="inspector">
        <div class="inspector-tabs">
          <button type="button" :class="{ 'is-active': inspectorTab === 'properties' }" @click="inspectorTab = 'properties'">属性</button>
          <button type="button" :class="{ 'is-active': inspectorTab === 'layers' }" @click="inspectorTab = 'layers'">图层</button>
        </div>

        <div v-if="inspectorTab === 'properties'" class="property-panel">
          <template v-if="primaryElement">
            <div class="selection-title">
              <strong>{{ primaryElement.name }}</strong>
              <small>{{ primaryElement.type }}</small>
            </div>
            <div class="number-grid">
              <label>X <input :value="primaryElement.transform.x" type="number" :disabled="cannotEditPrimary" @change="updateTransform('x', $event)" /></label>
              <label>Y <input :value="primaryElement.transform.y" type="number" :disabled="cannotEditPrimary" @change="updateTransform('y', $event)" /></label>
              <label>宽 <input :value="primaryElement.transform.width" type="number" min="1" :disabled="cannotEditPrimary" @change="updateTransform('width', $event)" /></label>
              <label>高 <input :value="primaryElement.transform.height" type="number" min="1" :disabled="cannotEditPrimary" @change="updateTransform('height', $event)" /></label>
              <label>旋转 <input :value="primaryElement.transform.rotation" type="number" :disabled="cannotEditPrimary" @change="updateTransform('rotation', $event)" /></label>
              <label>透明 <input :value="primaryElement.transform.opacity" type="number" min="0" max="1" step="0.05" :disabled="cannotEditPrimary" @change="updateTransform('opacity', $event)" /></label>
            </div>
            <div class="property-actions">
              <button type="button" :disabled="session.isReadOnly.value" @click="setSelectedLocked(!primaryElement.locked)">
                {{ primaryElement.locked ? '解除锁定' : '锁定对象' }}
              </button>
              <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked" @click="setSelectedHidden(true)">隐藏对象</button>
            </div>
          </template>
          <p v-else>选择画布对象后，可在这里精确调整位置、尺寸、旋转、锁定和隐藏。</p>
        </div>

        <div v-else class="layer-panel">
          <article
            v-for="(element, index) in reversedLayers"
            :key="element.id"
            :class="{ 'is-selected': isSelected(element.id) }"
            @click="session.selectElement(element.id, false)"
          >
            <span>{{ element.name }}</span>
            <div>
              <button type="button" :disabled="session.isReadOnly.value" :title="element.hidden ? '显示' : '隐藏'" @click.stop="setElementHidden(element.id, !element.hidden)">
                <EyeOff v-if="element.hidden" :size="14" /><Eye v-else :size="14" />
              </button>
              <button type="button" :disabled="session.isReadOnly.value" :title="element.locked ? '解锁' : '锁定'" @click.stop="setElementLocked(element.id, !element.locked)">
                <Unlock v-if="element.locked" :size="14" /><Lock v-else :size="14" />
              </button>
              <button type="button" :disabled="session.isReadOnly.value || index === 0" title="上移" @click.stop="moveLayer(element.id, 'up')"><ChevronUp :size="14" /></button>
              <button type="button" :disabled="session.isReadOnly.value || index === reversedLayers.length - 1" title="下移" @click.stop="moveLayer(element.id, 'down')"><ChevronDown :size="14" /></button>
            </div>
          </article>
          <div v-if="hiddenCount" class="hidden-summary">另有 {{ hiddenCount }} 个隐藏对象，可在图层中恢复显示。</div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Eye,
  EyeOff,
  Hand,
  Image as ImageIcon,
  LayoutPanelTop,
  LayoutTemplate,
  LoaderCircle,
  Lock,
  MessageCircle,
  MousePointer2,
  Redo2,
  Smartphone,
  SquareDashed,
  Type,
  Undo2,
  Unlock,
} from "lucide-vue-next";
import type {
  CandidateLockErrorCode,
  EditorCommandBatchV1,
  EditorCommandPayloadMapV1,
  EditorCommandTypeV1,
  EditorCommandV1,
  LayoutProfileV1,
  LayoutTopLevelElementV1,
  WorkbenchSnapshot,
} from "@airoaming/shared";

import { useLayoutEditorSession } from "../../composables/layout-editor-session";
import { api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  goCandidates: [];
}>();

const projectId = computed(() => props.snapshot.project.id);
const chapterId = computed(() => props.snapshot.currentChapter?.id ?? null);
const session = useLayoutEditorSession({ projectId, chapterId });
const chapters = computed(() => props.snapshot.chapters ?? []);
const isPaged = computed(() => props.snapshot.project.comicFormat === "paged_comic");
const formatLabel = computed(() => isPaged.value ? "页漫" : "条漫");
const initializationMode = ref<"default_storyboard_layout" | "blank">("default_storyboard_layout");
const profileWidth = ref(isPaged.value ? 1800 : 1080);
const profileHeight = ref(isPaged.value ? 2400 : 1920);
const inspectorTab = ref<"properties" | "layers">("properties");

interface DragState {
  elementId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
}

const drag = ref<DragState | null>(null);
const currentElements = computed(() => session.currentCanvas.value?.elements ?? []);
const visibleElements = computed(() => currentElements.value.filter((element) => !element.hidden));
const reversedLayers = computed(() => [...currentElements.value].reverse());
const hiddenCount = computed(() => currentElements.value.filter((element) => element.hidden).length);
const primaryElement = computed(() => session.selectedElements.value[0] ?? null);
const cannotEditPrimary = computed(() => session.isReadOnly.value || Boolean(primaryElement.value?.locked));
const canInitialize = computed(() => Boolean(chapterId.value) && profileWidth.value >= 320 && profileHeight.value >= 320);
const sourceAttention = computed(() => {
  const sources = props.snapshot.candidateSources;
  if (!sources) return null;
  if (sources.gates.buildLayoutWorkingCopy.allowed && sources.gates.exportLayout.allowed) return null;
  const primary = [
    ...sources.gates.buildLayoutWorkingCopy.reasonCodes,
    ...sources.gates.exportLayout.reasonCodes,
  ][0];
  return {
    title: getSourceAttentionTitle(primary),
    message: getSourceReasonLabel(primary),
  };
});
const sourceNeedsAttention = computed(() => session.server.value?.sourceEvaluation.sourceResolution !== "current");
const sourceStateLabel = computed(() => {
  const source = session.server.value?.sourceEvaluation;
  if (!source) return "尚未建立草稿";
  if (source.sourceResolution === "current") return "当前定稿";
  if (source.sourceResolution === "stale") return "候选已更新";
  return "来源待处理";
});
const saveStateLabel = computed(() => ({
  loading: "读取中",
  missing: "尚未创建",
  saved: "已保存到数据库",
  unsaved: "有未保存修改",
  saving: "保存中",
  conflict: "保存冲突",
  error: "读取失败",
}[session.saveState.value]));
const canvasStyle = computed(() => ({
  width: `${session.currentCanvas.value!.width * session.zoom.value}px`,
  height: `${session.currentCanvas.value!.height * session.zoom.value}px`,
  backgroundColor: session.currentCanvas.value!.backgroundColor.slice(0, 7),
}));

function selectChapter(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  if (id) emit("selectChapter", id);
}

function initializeDraft(): void {
  const profile: LayoutProfileV1 = isPaged.value
    ? {
        kind: "paged",
        presetId: profileWidth.value === 1800 && profileHeight.value === 2400 ? "portrait_3_4" : "custom",
        width: profileWidth.value,
        height: profileHeight.value,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb",
      }
    : {
        kind: "vertical_strip",
        presetId: profileWidth.value === 1080 ? "webtoon_1080" : "custom",
        width: profileWidth.value,
        defaultSectionHeight: profileHeight.value,
        safeInsetX: 64,
      };
  const currentLayoutId = props.snapshot.candidateSources?.currentLayout?.id ?? null;
  void session.initialize(profile, initializationMode.value, currentLayoutId);
}

function command<T extends EditorCommandTypeV1>(
  type: T,
  label: string,
  payload: EditorCommandPayloadMapV1[T],
): EditorCommandV1<T> {
  return {
    schemaVersion: 1,
    commandId: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    payload,
  } as EditorCommandV1<T>;
}

function isSelected(elementId: string): boolean {
  return session.selectedElementIds.value.includes(elementId);
}

function elementStyle(element: LayoutTopLevelElementV1) {
  const delta = drag.value?.elementId === element.id ? drag.value : null;
  const zoom = session.zoom.value;
  return {
    left: `${element.transform.x * zoom + (delta?.dx ?? 0)}px`,
    top: `${element.transform.y * zoom + (delta?.dy ?? 0)}px`,
    width: `${element.transform.width * zoom}px`,
    height: `${element.transform.height * zoom}px`,
    opacity: element.transform.opacity,
    transform: `rotate(${element.transform.rotation}deg)`,
    zIndex: currentElements.value.indexOf(element) + 1,
  };
}

function startDrag(event: PointerEvent, element: LayoutTopLevelElementV1): void {
  session.selectElement(element.id, event.metaKey || event.ctrlKey || event.shiftKey);
  if (session.isReadOnly.value || element.locked) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  drag.value = {
    elementId: element.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: element.transform.x,
    originY: element.transform.y,
    dx: 0,
    dy: 0,
  };
}

function moveDrag(event: PointerEvent): void {
  if (!drag.value) return;
  drag.value = {
    ...drag.value,
    dx: event.clientX - drag.value.startX,
    dy: event.clientY - drag.value.startY,
  };
}

function finishDrag(): void {
  const state = drag.value;
  if (!state) return;
  const element = currentElements.value.find((item) => item.id === state.elementId);
  drag.value = null;
  if (!element || (state.dx === 0 && state.dy === 0)) return;
  session.execute(session.makeTransformCommand(element.id, {
    ...element.transform,
    x: state.originX + state.dx / session.zoom.value,
    y: state.originY + state.dy / session.zoom.value,
  }));
  void session.flush();
}

function cancelDrag(): void {
  drag.value = null;
}

function updateTransform(field: keyof LayoutTopLevelElementV1["transform"], event: Event): void {
  const element = primaryElement.value;
  if (!element || element.locked) return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  session.execute(session.makeTransformCommand(element.id, { ...element.transform, [field]: value }));
}

function setElementLocked(elementId: string, locked: boolean): void {
  session.execute(command("element.set_locked", locked ? "锁定对象" : "解除锁定", {
    canvasId: session.currentCanvas.value!.id,
    elementId,
    locked,
  }));
}

function setElementHidden(elementId: string, hidden: boolean): void {
  session.execute(command("element.set_hidden", hidden ? "隐藏对象" : "显示对象", {
    canvasId: session.currentCanvas.value!.id,
    elementId,
    hidden,
  }));
}

function setSelectedLocked(locked: boolean): void {
  const commands = session.selectedElements.value.map((element) => command("element.set_locked", "批量锁定", {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    locked,
  }));
  executeBatch("批量锁定", commands);
}

function setSelectedHidden(hidden: boolean): void {
  const commands = session.selectedElements.value.filter((element) => !element.locked).map((element) => command("element.set_hidden", "批量隐藏", {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    hidden,
  }));
  executeBatch("批量隐藏", commands);
}

function executeBatch(label: string, commands: EditorCommandV1[]): void {
  if (!commands.length) return;
  const batch: EditorCommandBatchV1 = {
    schemaVersion: 1,
    batchId: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    commands,
  };
  session.executeBatch(batch);
}

function alignSelected(axis: "left" | "center" | "top"): void {
  const selected = session.selectedElements.value.filter((element) => !element.locked);
  if (selected.length < 2) return;
  const anchor = selected[0]!.transform;
  const commands = selected.slice(1).map((element) => {
    const transform = { ...element.transform };
    if (axis === "left") transform.x = anchor.x;
    else if (axis === "center") transform.x = anchor.x + (anchor.width - transform.width) / 2;
    else transform.y = anchor.y;
    return command("element.set_transform", "对齐对象", {
      canvasId: session.currentCanvas.value!.id,
      elementId: element.id,
      transform,
    });
  });
  executeBatch("对齐对象", commands);
}

function distributeHorizontal(): void {
  const selected = [...session.selectedElements.value].filter((element) => !element.locked).sort((a, b) => a.transform.x - b.transform.x);
  if (selected.length < 3) return;
  const left = selected[0]!.transform.x;
  const right = selected.at(-1)!.transform.x;
  const step = (right - left) / (selected.length - 1);
  executeBatch("水平分布", selected.slice(1, -1).map((element, index) => command("element.set_transform", "水平分布", {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    transform: { ...element.transform, x: left + step * (index + 1) },
  })));
}

function moveLayer(elementId: string, direction: "up" | "down"): void {
  const elements = currentElements.value;
  const index = elements.findIndex((element) => element.id === elementId);
  if (index < 0) return;
  let beforeElementId: string | null;
  if (direction === "up") beforeElementId = elements[index + 2]?.id ?? null;
  else beforeElementId = elements[index - 1]?.id ?? null;
  session.execute(command("element.reorder", direction === "up" ? "上移图层" : "下移图层", {
    canvasId: session.currentCanvas.value!.id,
    elementId,
    beforeElementId,
  }));
}

function richTextValue(value: { paragraphs: Array<{ runs: Array<{ text: string }> }> }): string {
  return value.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n") || "文字";
}

function getSourceAttentionTitle(code?: CandidateLockErrorCode): string {
  if (code === "CANDIDATE_LOCK_SET_INCOMPLETE") return "候选定稿尚未完整";
  if (code === "CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT" || code === "LAYOUT_SOURCE_UNRESOLVED") return "排版来源无法解析";
  if (code === "LAYOUT_SOURCE_DIGEST_MISMATCH") return "排版来源校验不一致";
  return "候选定稿已变化，当前排版需要处理";
}

function getSourceReasonLabel(code?: CandidateLockErrorCode): string {
  const labels: Partial<Record<CandidateLockErrorCode, string>> = {
    CANDIDATE_LOCK_SET_INCOMPLETE: "本章仍有镜头没有当前定稿，暂时不能生成或导出正式排版。",
    CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT: "当前候选定稿来自旧版上游内容或存在断链，需要重新确认。",
    LAYOUT_SOURCE_STALE: "排版仍引用更换前的候选定稿，系统已停止继续导出。",
    LAYOUT_SOURCE_UNRESOLVED: "排版引用的候选定稿无法解析，系统已停止继续导出。",
    LAYOUT_SOURCE_DIGEST_MISMATCH: "排版记录与候选定稿校验值不一致，系统已停止继续导出。",
  };
  return code ? labels[code] ?? `当前来源门禁未通过（${code}）。` : "当前来源门禁未通过。";
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
  const commandKey = event.metaKey || event.ctrlKey;
  if (commandKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) session.redo(); else session.undo();
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  const delta = event.key === "ArrowLeft" ? [-step, 0]
    : event.key === "ArrowRight" ? [step, 0]
      : event.key === "ArrowUp" ? [0, -step]
        : event.key === "ArrowDown" ? [0, step]
          : null;
  if (delta && session.selectedElements.value.length) {
    event.preventDefault();
    executeBatch("微移对象", session.selectedElements.value.filter((element) => !element.locked).map((element) => command("element.set_transform", "微移对象", {
      canvasId: session.currentCanvas.value!.id,
      elementId: element.id,
      transform: { ...element.transform, x: element.transform.x + delta[0], y: element.transform.y + delta[1] },
    })));
  }
}

onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
</script>

<style scoped>
.layout-editor {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(116, 95, 255, 0.18);
  border-radius: 14px;
  background: #080d19;
  color: #e8edf8;
}

button,
select,
input {
  font: inherit;
}

button {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(19, 28, 48, 0.9);
  color: #d9e2f3;
  min-height: 32px;
  padding: 0 10px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.editor-topbar,
.chapter-picker,
.top-actions,
.editor-status,
.canvas-toolbar,
.canvas-toolbar > div,
.canvas-toolbar label,
.property-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-topbar {
  justify-content: space-between;
  min-height: 52px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  padding: 8px 12px;
  background: rgba(12, 18, 33, 0.96);
}

.layout-source-attention {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border: 1px solid rgba(251, 146, 60, 0.32);
  border-radius: 12px;
  background: rgba(251, 146, 60, 0.09);
  padding: 13px;
  color: #fed7aa;
}

.layout-source-attention strong,
.layout-source-attention p,
.layout-source-attention small {
  display: block;
}

.layout-source-attention p {
  margin: 4px 0;
  color: #fdba74;
  font-size: 13px;
}

.layout-source-attention small {
  color: #cbd5e1;
  line-height: 1.5;
}

.layout-source-attention button {
  border: 1px solid rgba(251, 146, 60, 0.35);
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.55);
  padding: 8px 10px;
  color: #fed7aa;
  font-weight: 800;
}

.chapter-picker select,
.create-card select,
.create-card input,
.property-panel input {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: #0d1526;
  color: #eef3fb;
  min-height: 34px;
  padding: 0 9px;
}

.format-badge,
.editor-status,
.source-summary span {
  border-radius: 999px;
  background: rgba(116, 95, 255, 0.12);
  color: #bdb5ff;
  font-size: 12px;
  font-weight: 800;
  padding: 5px 9px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c7a9;
}

.editor-status.is-unsaved .status-dot,
.editor-status.is-saving .status-dot { background: #fbbf24; }
.editor-status.is-conflict .status-dot,
.editor-status.is-error .status-dot { background: #fb7185; }
.editor-status small { color: #7f8ca8; }

.mobile-readonly,
.conflict-banner,
.error-banner {
  margin: 10px 12px 0;
  border-radius: 10px;
  padding: 11px 12px;
}

.mobile-readonly,
.conflict-banner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-readonly {
  border: 1px solid rgba(96, 165, 250, 0.28);
  background: rgba(30, 64, 175, 0.12);
}

.mobile-readonly p,
.conflict-banner p {
  margin: 3px 0 0;
  color: #9aa8c3;
  font-size: 12px;
}

.conflict-banner {
  border: 1px solid rgba(251, 146, 60, 0.32);
  background: rgba(124, 45, 18, 0.18);
  color: #fed7aa;
}

.conflict-banner div { flex: 1; }
.danger-action { border-color: rgba(251, 113, 133, 0.42); color: #fecdd3; }
.error-banner { border: 1px solid rgba(251, 113, 133, 0.32); background: rgba(127, 29, 29, 0.2); color: #fecdd3; }

.center-state,
.create-draft {
  display: grid;
  place-items: center;
  min-height: 440px;
  gap: 12px;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.create-card {
  display: grid;
  width: min(460px, calc(100% - 32px));
  gap: 14px;
  border: 1px solid rgba(116, 95, 255, 0.26);
  border-radius: 16px;
  background: #10182a;
  padding: 26px;
}

.create-card h2,
.create-card p { margin: 0; }
.create-card p { color: #93a0ba; line-height: 1.6; }
.create-card label { display: grid; gap: 6px; color: #aab5ca; font-size: 12px; font-weight: 800; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.primary-action { background: linear-gradient(135deg, #22c7a9, #745fff); border-color: transparent; color: white; font-weight: 900; }

.editor-shell {
  display: grid;
  grid-template-columns: 48px 210px minmax(0, 1fr) 288px;
  min-height: 0;
  overflow: hidden;
}

.tool-rail,
.canvas-navigation,
.inspector {
  min-height: 0;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  background: #0c1322;
}

.tool-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 7px;
}

.tool-rail button { width: 34px; padding: 0; }
.tool-rail button.is-active { border-color: rgba(34, 199, 169, 0.5); background: rgba(34, 199, 169, 0.16); color: #8df0dc; }
.tool-rail span { height: 1px; width: 26px; background: rgba(148, 163, 184, 0.16); }

.canvas-navigation {
  overflow: auto;
  padding: 12px;
}

.panel-heading,
.selection-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-heading small,
.selection-title small { color: #7f8ca8; }
.canvas-nav-item { display: flex; width: 100%; height: auto; gap: 9px; text-align: left; margin-bottom: 7px; padding: 9px; }
.canvas-nav-item > span { display: grid; place-items: center; width: 26px; height: 32px; border-radius: 6px; background: #e9edf5; color: #111827; font-weight: 900; }
.canvas-nav-item div { display: grid; gap: 3px; min-width: 0; }
.canvas-nav-item small { color: #7f8ca8; }
.canvas-nav-item.is-active { border-color: rgba(116, 95, 255, 0.55); background: rgba(116, 95, 255, 0.14); }

.source-summary { display: grid; gap: 8px; margin-top: 18px; border-top: 1px solid rgba(148, 163, 184, 0.12); padding-top: 14px; }
.source-summary span { justify-self: start; }

.canvas-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #060a12;
}

.canvas-toolbar {
  justify-content: space-between;
  min-height: 44px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.11);
  padding: 6px 10px;
  background: #0b1220;
}
.canvas-toolbar button { min-height: 28px; font-size: 11px; }
.canvas-toolbar label { color: #8491aa; font-size: 11px; }
.canvas-toolbar input { width: 100px; }

.stage-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 48px;
  background-image: radial-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px);
  background-size: 20px 20px;
}

.document-canvas {
  position: relative;
  margin: 0 auto;
  flex: none;
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
  touch-action: none;
}

.canvas-element {
  position: absolute;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  overflow: hidden;
  color: #657089;
  font-size: 11px;
  user-select: none;
  touch-action: none;
}

.canvas-element.type-panel_frame { border: 2px solid #111827; background: #d6dbe5; }
.canvas-element.type-balloon { border: 2px solid #111827; border-radius: 50%; background: white; color: #111827; padding: 8px; }
.canvas-element.type-text { color: #111827; white-space: pre-wrap; padding: 4px; }
.canvas-element img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.canvas-element.is-selected { outline: 3px solid #22c7a9; outline-offset: 2px; }
.canvas-element.is-locked { cursor: not-allowed; }
.lock-mark { position: absolute; top: 3px; right: 3px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: rgba(8, 13, 25, 0.78); color: white; }
.text-preview,
.balloon-preview { max-width: 100%; max-height: 100%; overflow: hidden; }

.inspector {
  border-right: 0;
  border-left: 1px solid rgba(148, 163, 184, 0.12);
  overflow: hidden;
}
.inspector-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
.inspector-tabs button { border: 0; background: transparent; }
.inspector-tabs button.is-active { background: rgba(116, 95, 255, 0.16); color: #cbc5ff; }
.property-panel,
.layer-panel { height: calc(100% - 49px); overflow: auto; padding: 12px; }
.property-panel > p { color: #7f8ca8; line-height: 1.6; }
.number-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.number-grid label { display: grid; gap: 5px; color: #8491aa; font-size: 11px; }
.number-grid input { width: 100%; box-sizing: border-box; }
.property-actions { flex-wrap: wrap; margin-top: 14px; }
.layer-panel article { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid transparent; border-radius: 8px; padding: 7px; margin-bottom: 5px; cursor: pointer; }
.layer-panel article.is-selected { border-color: rgba(34, 199, 169, 0.36); background: rgba(34, 199, 169, 0.09); }
.layer-panel article > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.layer-panel article div { display: flex; }
.layer-panel article button { width: 27px; min-height: 27px; padding: 0; border: 0; background: transparent; }
.hidden-summary { color: #7f8ca8; font-size: 11px; padding: 8px; }

.editor-shell.is-readonly .canvas-element { pointer-events: none; }

@media (max-width: 1260px) {
  .editor-shell { grid-template-columns: 44px 180px minmax(0, 1fr) 250px; }
  .top-actions button:nth-last-child(-n + 2) { display: none; }
}

@media (max-width: 1023px) {
  .layout-editor { min-height: 680px; overflow: visible; }
  .editor-topbar { flex-wrap: wrap; }
  .editor-shell { grid-template-columns: 1fr; overflow: visible; }
  .tool-rail,
  .canvas-navigation,
  .inspector { display: none; }
  .canvas-workspace { min-height: 560px; }
}
</style>
