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
        <button
          type="button"
          :disabled="session.isReadOnly.value || !canBatchInitialize"
          title="按当前 G4 定稿批量建立页面或条漫段落"
          @click="batchInitializeFromSources"
        >生成排版</button>
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

    <div v-if="session.errorMessage.value || actionError" class="error-banner" role="alert">
      {{ actionError || session.errorMessage.value }}
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
        <button type="button" :disabled="session.isReadOnly.value" title="添加空画格" @click="addPanel"><SquareDashed :size="18" /></button>
        <button type="button" :disabled="session.isReadOnly.value || !selectedSource" title="添加所选镜头为自由图片" @click="selectedSource && addFreeImage(selectedSource)"><ImageIcon :size="18" /></button>
        <button type="button" disabled title="M5 接入文字"><Type :size="18" /></button>
        <button type="button" disabled title="M5 接入气泡"><MessageCircle :size="18" /></button>
      </nav>

      <aside class="canvas-navigation">
        <div class="panel-heading">
          <strong>{{ isPaged ? '页面' : '条漫段落' }}</strong>
          <small>{{ session.document.value.canvases.length }}</small>
        </div>
        <div
          v-for="(canvas, index) in session.document.value.canvases"
          :key="canvas.id"
          class="canvas-nav-item"
          :class="{ 'is-active': canvas.id === session.selectedCanvasId.value }"
          @click="session.selectCanvas(canvas.id)"
        >
          <span>{{ index + 1 }}</span>
          <div>
            <strong>{{ canvas.name }}</strong>
            <small>{{ canvas.width }} × {{ canvas.height }}</small>
          </div>
          <div class="canvas-nav-actions">
            <button type="button" :disabled="session.isReadOnly.value || index === 0" title="前移" @click.stop="moveCanvas(canvas.id, 'up')"><ChevronUp :size="13" /></button>
            <button type="button" :disabled="session.isReadOnly.value || index === session.document.value.canvases.length - 1" title="后移" @click.stop="moveCanvas(canvas.id, 'down')"><ChevronDown :size="13" /></button>
          </div>
        </div>
        <div class="canvas-list-actions">
          <button type="button" :disabled="session.isReadOnly.value" @click="addCanvas">新增{{ isPaged ? '页面' : '段落' }}</button>
          <button type="button" :disabled="session.isReadOnly.value || !canBatchInitialize" @click="batchInitializeFromSources">按镜头排版</button>
        </div>

        <section class="shot-tray" data-testid="shot-tray" aria-label="镜头素材栏">
          <div class="panel-heading">
            <strong>镜头素材</strong>
            <small>{{ sourceCatalogItems.length }}</small>
          </div>
          <p v-if="!sourceCatalogItems.length">当前定稿来源不可用；旧 lock 不会被恢复使用。</p>
          <article
            v-for="item in sourceCatalogItems"
            :key="item.source.shotId"
            :class="{ 'is-selected': selectedSource?.source.shotId === item.source.shotId }"
            @click="selectedSourceShotId = item.source.shotId"
          >
            <img :src="api.projectAssetFileUrl(snapshot.project.id, item.source.assetId)" :alt="`镜头 ${item.order}`" />
            <div>
              <strong>镜头 {{ item.order }}</strong>
              <small>{{ placementCount(item.source.shotId) ? `已放置 ${placementCount(item.source.shotId)} 处` : '未放置' }}</small>
            </div>
            <div class="shot-actions">
              <button type="button" :disabled="session.isReadOnly.value || !emptyTargetPanel" @click.stop="attachSourceToPanel(item)">放入画格</button>
              <button type="button" :disabled="session.isReadOnly.value" @click.stop="addFreeImage(item)">自由图</button>
              <button type="button" :disabled="session.isReadOnly.value || !canReplacePrimarySource" @click.stop="replacePrimarySource(item)">替换</button>
            </div>
          </article>
        </section>
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
              :style="[elementStyle(element), panelFrameStyle(element)]"
              @pointerdown.stop="startDrag($event, element)"
            >
              <template v-if="element.type === 'panel_frame'">
                <img
                  v-if="element.contentImage && !element.contentImage.hidden"
                  :src="api.projectAssetFileUrl(snapshot.project.id, element.contentImage.source.assetId)"
                  :alt="element.contentImage.name"
                  :style="imagePreviewStyle(element)"
                  draggable="false"
                />
                <span v-else>空画格</span>
              </template>
              <img
                v-else-if="element.type === 'free_image'"
                :src="api.projectAssetFileUrl(snapshot.project.id, element.source.assetId)"
                :alt="element.name"
                :style="imagePreviewStyle(element)"
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
          <section class="preset-picker" data-testid="layout-preset-picker">
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
                :disabled="session.isReadOnly.value"
                @click="selectedPresetId = preset.id"
              >{{ preset.label }}<small>{{ preset.count }} 格</small></button>
            </div>
            <p>{{ presetPreviewLabel }}</p>
            <button type="button" :disabled="session.isReadOnly.value || !canApplyPreset" @click="applySelectedPreset">应用到当前画布</button>
          </section>

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
              <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked" @click="deletePrimaryElement">删除对象</button>
            </div>

            <section v-if="primaryElement.type === 'panel_frame'" class="special-properties">
              <div class="section-heading"><strong>画格</strong><small>图片内嵌于画格</small></div>
              <label>形状
                <select :value="primaryElement.shape.kind" :disabled="cannotEditPrimary" @change="setPanelShape($event)">
                  <option value="rect">直角</option>
                  <option value="rounded_rect">圆角</option>
                </select>
              </label>
              <div class="number-grid">
                <label>圆角 <input :value="primaryElement.shape.cornerRadius" type="number" min="0" :disabled="cannotEditPrimary || primaryElement.shape.kind === 'rect'" @change="setPanelCornerRadius($event)" /></label>
                <label>边框 <input :value="primaryElement.border.width" type="number" min="0" :disabled="cannotEditPrimary" @change="setPanelBorderWidth($event)" /></label>
              </div>
              <div class="property-actions">
                <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked || !primaryElement.contentImage" @click="detachPanelImage">分离为自由图</button>
                <button type="button" :disabled="session.isReadOnly.value || !canAttachSelectedFreeToPanel" @click="attachSelectedFreeToPanel">自由图放回画格</button>
              </div>
            </section>

            <section v-if="primaryImage" class="special-properties" data-testid="crop-controls">
              <div class="section-heading"><strong>图片与裁切</strong><small>源文件不会改写</small></div>
              <label v-if="primaryElement.type === 'free_image'">显示方式
                <select :value="primaryElement.display.mode" :disabled="cannotEditPrimary" @change="setFreeImageDisplay($event)">
                  <option value="contain">完整显示</option>
                  <option value="cover">铺满裁切</option>
                </select>
              </label>
              <template v-if="primaryCrop">
                <div class="number-grid">
                  <label>缩放 <input :value="primaryCrop.zoom" type="number" min="1" step="0.05" :disabled="cannotEditPrimary" @change="updateCropNumber('zoom', $event)" /></label>
                  <label>旋转 <input :value="primaryCrop.rotation" type="number" step="1" :disabled="cannotEditPrimary" @change="updateCropNumber('rotation', $event)" /></label>
                  <label>水平偏移 <input :value="primaryCrop.offsetX" type="number" step="1" :disabled="cannotEditPrimary" @change="updateCropNumber('offsetX', $event)" /></label>
                  <label>垂直偏移 <input :value="primaryCrop.offsetY" type="number" step="1" :disabled="cannotEditPrimary" @change="updateCropNumber('offsetY', $event)" /></label>
                </div>
                <div class="property-actions">
                  <button type="button" :disabled="cannotEditPrimary" @click="toggleCropFlip('flipX')">{{ primaryCrop.flipX ? '取消水平翻转' : '水平翻转' }}</button>
                  <button type="button" :disabled="cannotEditPrimary" @click="toggleCropFlip('flipY')">{{ primaryCrop.flipY ? '取消垂直翻转' : '垂直翻转' }}</button>
                  <button type="button" :disabled="cannotEditPrimary" @click="resetCrop">重置铺满</button>
                </div>
                <p>{{ cropCoverageLabel }}</p>
              </template>
              <button
                v-if="primaryElement.type === 'free_image'"
                type="button"
                :disabled="session.isReadOnly.value || primaryElement.locked || !emptyTargetPanel"
                @click="attachPrimaryFreeToPanel"
              >放入空画格</button>
            </section>

            <section v-if="currentPanels.length" class="reading-order">
              <div class="section-heading"><strong>阅读顺序</strong><small>独立于图层顺序</small></div>
              <article v-for="(panelId, index) in session.currentCanvas.value.panelReadingOrder" :key="panelId">
                <span>{{ index + 1 }} · {{ panelName(panelId) }}</span>
                <div>
                  <button type="button" :disabled="session.isReadOnly.value || index === 0" @click="moveReadingOrder(panelId, 'up')"><ChevronUp :size="13" /></button>
                  <button type="button" :disabled="session.isReadOnly.value || index === session.currentCanvas.value.panelReadingOrder.length - 1" @click="moveReadingOrder(panelId, 'down')"><ChevronDown :size="13" /></button>
                </div>
              </article>
            </section>
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
  CoverCropV1,
  EditorCommandBatchV1,
  EditorCommandPayloadMapV1,
  EditorCommandTypeV1,
  EditorCommandV1,
  LayoutCanvasV1,
  LayoutPresetIdV1,
  LayoutProfileV1,
  LayoutSourceCatalogItemV1,
  LayoutTopLevelElementV1,
  PanelFrameElementV1,
  PanelImageElementV1,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import {
  evaluateCoverCropV1,
  generateLayoutPresetV1,
  initializeLayoutCanvasesFromSourcesV1,
  projectVisibleShotPlacementsV1,
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
const selectedSourceShotId = ref<string | null>(null);
const selectedPresetId = ref<LayoutPresetIdV1>(isPaged.value ? "four_panel" : "single");
const actionError = ref<string | null>(null);

const presetOptions: Array<{ id: LayoutPresetIdV1; label: string; count: number }> = [
  { id: "single", label: "单格", count: 1 },
  { id: "two_vertical", label: "上下双格", count: 2 },
  { id: "two_horizontal", label: "左右双格", count: 2 },
  { id: "three_focus", label: "一大两小", count: 3 },
  { id: "four_panel", label: "四格", count: 4 },
  { id: "dialogue_two", label: "对话双格", count: 2 },
  { id: "action_focus", label: "动作聚焦", count: 3 },
];

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
const currentPanels = computed(() => currentElements.value.filter((element): element is PanelFrameElementV1 => element.type === "panel_frame"));
const visibleElements = computed(() => currentElements.value.filter((element) => !element.hidden));
const reversedLayers = computed(() => [...currentElements.value].reverse());
const hiddenCount = computed(() => currentElements.value.filter((element) => element.hidden).length);
const primaryElement = computed(() => session.selectedElements.value[0] ?? null);
const sourceCatalogItems = computed(() => session.sourceCatalog.value?.items ?? []);
const selectedSource = computed(() => sourceCatalogItems.value.find((item) => item.source.shotId === selectedSourceShotId.value) ?? sourceCatalogItems.value[0] ?? null);
const visiblePlacements = computed(() => session.document.value ? projectVisibleShotPlacementsV1(session.document.value) : {});
const emptyTargetPanel = computed(() => {
  const selected = session.selectedElements.value.find((element): element is PanelFrameElementV1 => element.type === "panel_frame" && !element.contentImage && !element.locked);
  return selected ?? currentPanels.value.find((panel) => !panel.contentImage && !panel.locked) ?? null;
});
const canReplacePrimarySource = computed(() => primaryElement.value?.type === "free_image" || (primaryElement.value?.type === "panel_frame" && Boolean(primaryElement.value.contentImage)));
const selectedFreeImage = computed(() => session.selectedElements.value.find((element) => element.type === "free_image") ?? null);
const selectedEmptyPanel = computed(() => session.selectedElements.value.find((element): element is PanelFrameElementV1 => element.type === "panel_frame" && !element.contentImage) ?? null);
const canAttachSelectedFreeToPanel = computed(() => Boolean(selectedFreeImage.value && selectedEmptyPanel.value && !selectedFreeImage.value.locked && !selectedEmptyPanel.value.locked));
const primaryImage = computed(() => {
  const element = primaryElement.value;
  if (element?.type === "panel_frame") return element.contentImage;
  return element?.type === "free_image" ? element : null;
});
const primaryCrop = computed<CoverCropV1 | null>(() => {
  const element = primaryElement.value;
  if (element?.type === "panel_frame") return element.contentImage?.crop ?? null;
  if (element?.type === "free_image" && element.display.mode === "cover") return element.display.crop;
  return null;
});
const selectedPreset = computed(() => presetOptions.find((preset) => preset.id === selectedPresetId.value)!);
const occupiedPanelCount = computed(() => currentPanels.value.filter((panel) => panel.contentImage).length);
const canApplyPreset = computed(() => selectedPreset.value.count >= occupiedPanelCount.value && Boolean(session.currentCanvas.value));
const presetPreviewLabel = computed(() => canApplyPreset.value
  ? `将 ${occupiedPanelCount.value} 张已放置图片按阅读顺序映射到 ${selectedPreset.value.count} 个正式画格。`
  : `当前有 ${occupiedPanelCount.value} 个已占用画格，${selectedPreset.value.count} 格模板会丢图，已阻止应用。`);
const canBatchInitialize = computed(() => {
  if (!session.document.value || !sourceCatalogItems.value.length) return false;
  return session.document.value.canvases.every((canvas) => canvas.elements.every((element) => element.type === "panel_frame"));
});
const cannotEditPrimary = computed(() => session.isReadOnly.value || Boolean(primaryElement.value?.locked));
const canInitialize = computed(() => Boolean(chapterId.value) && profileWidth.value >= 320 && profileHeight.value >= 320);
const sourceAttention = computed(() => {
  const sources = props.snapshot.candidateSources;
  if (!sources) return null;
  if (sources.gates.buildLayoutWorkingCopy.allowed) return null;
  const primary = sources.gates.buildLayoutWorkingCopy.reasonCodes[0];
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
const cropCoverageLabel = computed(() => {
  const crop = primaryCrop.value;
  const element = primaryElement.value;
  const image = primaryImage.value;
  if (!crop || !element || !image) return "";
  const catalog = sourceCatalogItems.value.find((item) => item.source.assetId === image.source.assetId);
  if (!catalog) return "当前来源尺寸不可用，服务端仍会在保存时严格复核。";
  const evaluation = evaluateCoverCropV1({
    sourceWidth: catalog.width,
    sourceHeight: catalog.height,
    frameWidth: element.transform.width,
    frameHeight: element.transform.height,
    crop,
  });
  return evaluation.covered ? "裁切覆盖完整" : "裁切会暴露空洞，已阻止保存";
});

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

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultCrop(): CoverCropV1 {
  return { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
}

function imageForSource(item: LayoutSourceCatalogItemV1): PanelImageElementV1 {
  return {
    id: newId("panel_image"),
    type: "image",
    placement: "panel_content",
    name: `镜头 ${item.order}`,
    locked: false,
    hidden: false,
    source: structuredClone(item.source),
    crop: defaultCrop(),
  };
}

function placementCount(shotId: string): number {
  return visiblePlacements.value[shotId]?.length ?? 0;
}

function addPanel(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  actionError.value = null;
  const index = currentPanels.value.length + 1;
  const panel: PanelFrameElementV1 = {
    id: newId("panel"),
    type: "panel_frame",
    name: `画格 ${index}`,
    transform: {
      x: Math.round(canvas.width * 0.12),
      y: Math.round(canvas.height * 0.12),
      width: Math.round(canvas.width * 0.76),
      height: Math.round(canvas.height * 0.32),
      rotation: 0,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    shape: { kind: "rect", cornerRadius: 0 },
    border: { visible: true, color: "#111827FF", width: 8 },
    contentImage: null,
  };
  session.execute(command("element.add", "添加画格", {
    canvasId: canvas.id,
    element: panel,
    beforeElementId: null,
  }));
  session.selectElement(panel.id);
}

function addFreeImage(item: LayoutSourceCatalogItemV1): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  actionError.value = null;
  selectedSourceShotId.value = item.source.shotId;
  const width = Math.round(canvas.width * 0.5);
  const height = Math.min(Math.round(width * item.height / item.width), Math.round(canvas.height * 0.75));
  const element: LayoutTopLevelElementV1 = {
    id: newId("free_image"),
    type: "free_image",
    name: `镜头 ${item.order} 自由图`,
    transform: {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round((canvas.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    source: structuredClone(item.source),
    display: { mode: "contain" },
  };
  session.execute(command("element.add", "添加自由图片", {
    canvasId: canvas.id,
    element,
    beforeElementId: null,
  }));
  session.selectElement(element.id);
}

function attachSourceToPanel(item: LayoutSourceCatalogItemV1): void {
  const panel = emptyTargetPanel.value;
  const canvas = session.currentCanvas.value;
  if (!panel || !canvas) return;
  actionError.value = null;
  selectedSourceShotId.value = item.source.shotId;
  session.execute(command("panel.attach_image", "镜头放入画格", {
    canvasId: canvas.id,
    elementId: panel.id,
    image: imageForSource(item),
  }));
  session.selectElement(panel.id);
}

function replacePrimarySource(item: LayoutSourceCatalogItemV1): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || !canReplacePrimarySource.value) return;
  actionError.value = null;
  selectedSourceShotId.value = item.source.shotId;
  session.execute(command("image.replace_source", "替换图片来源", {
    canvasId: canvas.id,
    elementId: element.id,
    source: structuredClone(item.source),
    crop: element.type === "free_image" && element.display.mode === "contain" ? null : defaultCrop(),
  }));
}

function detachPanelImage(): void {
  const panel = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!canvas || panel?.type !== "panel_frame" || !panel.contentImage) return;
  const freeId = newId("free_image");
  session.execute(command("panel.detach_image_to_free", "图片分离为自由图", {
    canvasId: canvas.id,
    elementId: panel.id,
    beforeElementId: null,
    freeImage: {
      id: freeId,
      type: "free_image",
      name: `${panel.contentImage.name} 自由图`,
      transform: structuredClone(panel.transform),
      locked: false,
      hidden: false,
      source: structuredClone(panel.contentImage.source),
      display: { mode: "cover", crop: structuredClone(panel.contentImage.crop) },
    },
  }));
  session.selectElement(freeId);
}

function attachSelectedFreeToPanel(): void {
  const free = selectedFreeImage.value;
  const panel = selectedEmptyPanel.value;
  if (!free || !panel || !canAttachSelectedFreeToPanel.value) return;
  attachFreeToPanel(free, panel);
}

function attachPrimaryFreeToPanel(): void {
  const free = primaryElement.value;
  const panel = emptyTargetPanel.value;
  if (free?.type !== "free_image" || !panel || free.locked || panel.locked) return;
  attachFreeToPanel(free, panel);
}

function attachFreeToPanel(
  free: Extract<LayoutTopLevelElementV1, { type: "free_image" }>,
  panel: PanelFrameElementV1,
): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  const crop = free.display.mode === "cover" ? structuredClone(free.display.crop) : defaultCrop();
  executeBatch("自由图放回画格", [
    command("panel.attach_image", "自由图放回画格", {
      canvasId: canvas.id,
      elementId: panel.id,
      image: {
        id: newId("panel_image"),
        type: "image",
        placement: "panel_content",
        name: free.name,
        locked: false,
        hidden: false,
        source: structuredClone(free.source),
        crop,
      },
    }),
    command("element.delete", "删除已放回的自由图", {
      canvasId: canvas.id,
      elementId: free.id,
    }),
  ]);
  session.selectElement(panel.id);
}

function presetInset(canvas: LayoutCanvasV1) {
  const profile = session.document.value!.profile;
  return profile.kind === "paged"
    ? profile.safeArea
    : { top: 64, right: profile.safeInsetX, bottom: 64, left: profile.safeInsetX };
}

function buildPresetPanels(
  canvas: LayoutCanvasV1,
  presetId: LayoutPresetIdV1,
  images: PanelImageElementV1[],
): PanelFrameElementV1[] {
  const count = presetOptions.find((preset) => preset.id === presetId)!.count;
  const panels = generateLayoutPresetV1({
    presetId,
    presetVersion: 1,
    width: canvas.width,
    height: canvas.height,
    inset: presetInset(canvas),
    gap: session.document.value!.profile.kind === "paged" ? 48 : 24,
    panelIds: Array.from({ length: count }, () => newId("panel")),
  });
  return panels.map((panel, index) => ({
    ...panel,
    name: `画格 ${index + 1}`,
    contentImage: images[index] ? structuredClone(images[index]) : null,
  }));
}

function applySelectedPreset(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || !canApplyPreset.value) return;
  const images = currentPanels.value.flatMap((panel) => panel.contentImage ? [panel.contentImage] : []);
  const panels = buildPresetPanels(canvas, selectedPresetId.value, images);
  session.execute(command("layout.apply_preset", "应用画格模板", {
    canvasId: canvas.id,
    panels,
    panelReadingOrder: panels.map((panel) => panel.id),
  }));
  session.selectedElementIds.value = [];
}

function batchInitializeFromSources(): void {
  const document = session.document.value;
  if (!document || !canBatchInitialize.value) return;
  if (!window.confirm("将按当前 G4 定稿重新建立画格与页面；现有画格布局会被替换。是否继续？")) return;
  actionError.value = null;
  const canvases = initializeLayoutCanvasesFromSourcesV1({
    profile: document.profile,
    sources: sourceCatalogItems.value,
    createId: (kind) => newId(kind),
  });
  session.execute(command("layout.resize_profile", "按镜头批量建立排版", {
    profile: structuredClone(document.profile),
    canvases,
  }));
  if (canvases[0]) session.selectCanvas(canvases[0].id);
}

function addCanvas(): void {
  const document = session.document.value;
  if (!document) return;
  const index = document.canvases.length;
  const canvas: LayoutCanvasV1 = {
    id: newId(document.profile.kind === "paged" ? "page" : "section"),
    kind: document.profile.kind === "paged" ? "page" : "strip_section",
    name: document.profile.kind === "paged" ? `第 ${index + 1} 页` : `第 ${index + 1} 段`,
    width: document.profile.width,
    height: document.profile.kind === "paged" ? document.profile.height : document.profile.defaultSectionHeight,
    backgroundColor: "#FFFFFFFF",
    panelReadingOrder: [],
    elements: [],
  };
  session.execute(command("canvas.add", "新增画布", { canvas, beforeCanvasId: null }));
  session.selectCanvas(canvas.id);
}

function moveCanvas(canvasId: string, direction: "up" | "down"): void {
  const canvases = session.document.value?.canvases ?? [];
  const index = canvases.findIndex((canvas) => canvas.id === canvasId);
  if (index < 0) return;
  const beforeCanvasId = direction === "up"
    ? canvases[index - 1]?.id ?? null
    : canvases[index + 2]?.id ?? null;
  session.execute(command("canvas.reorder", direction === "up" ? "画布前移" : "画布后移", { canvasId, beforeCanvasId }));
}

function moveReadingOrder(panelId: string, direction: "up" | "down"): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  const order = [...canvas.panelReadingOrder];
  const index = order.indexOf(panelId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target]!, order[index]!];
  session.execute(command("layout.apply_preset", "调整画格阅读顺序", {
    canvasId: canvas.id,
    panels: currentPanels.value.map((panel) => structuredClone(panel)),
    panelReadingOrder: order,
  }));
}

function panelName(panelId: string): string {
  return currentPanels.value.find((panel) => panel.id === panelId)?.name ?? panelId;
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

function panelFrameStyle(element: LayoutTopLevelElementV1) {
  if (element.type !== "panel_frame") return {};
  const zoom = session.zoom.value;
  return {
    borderWidth: element.border.visible ? `${element.border.width * zoom}px` : "0",
    borderColor: element.border.color.slice(0, 7),
    borderRadius: element.shape.kind === "rounded_rect" ? `${element.shape.cornerRadius * zoom}px` : "0",
  };
}

function imagePreviewStyle(element: LayoutTopLevelElementV1) {
  const source = element.type === "panel_frame"
    ? element.contentImage?.source ?? null
    : element.type === "free_image"
      ? element.source
      : null;
  const crop = element.type === "panel_frame"
    ? element.contentImage?.crop ?? null
    : element.type === "free_image" && element.display.mode === "cover"
      ? element.display.crop
      : null;
  if (!crop) return { objectFit: "contain" as const };
  const catalog = sourceCatalogItems.value.find((item) => item.source.assetId === source?.assetId);
  if (catalog) {
    const evaluation = evaluateCoverCropV1({
      sourceWidth: catalog.width,
      sourceHeight: catalog.height,
      frameWidth: element.transform.width,
      frameHeight: element.transform.height,
      crop,
    });
    return {
      position: "absolute" as const,
      left: `calc(50% + ${crop.offsetX * session.zoom.value}px)`,
      top: `calc(50% + ${crop.offsetY * session.zoom.value}px)`,
      width: `${catalog.width * evaluation.baseScale * crop.zoom * session.zoom.value}px`,
      height: `${catalog.height * evaluation.baseScale * crop.zoom * session.zoom.value}px`,
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "fill" as const,
      transform: `translate(-50%, -50%) rotate(${crop.rotation}deg) scale(${crop.flipX ? -1 : 1}, ${crop.flipY ? -1 : 1})`,
    };
  }
  return {
    objectFit: "cover" as const,
    transform: `translate(${crop.offsetX * session.zoom.value}px, ${crop.offsetY * session.zoom.value}px) rotate(${crop.rotation}deg) scale(${crop.flipX ? -crop.zoom : crop.zoom}, ${crop.flipY ? -crop.zoom : crop.zoom})`,
  };
}

function setPanelShape(event: Event): void {
  const panel = primaryElement.value;
  if (panel?.type !== "panel_frame") return;
  const kind = (event.target as HTMLSelectElement).value as "rect" | "rounded_rect";
  session.execute(command("panel.set_shape", "调整画格形状", {
    canvasId: session.currentCanvas.value!.id,
    elementId: panel.id,
    shape: { kind, cornerRadius: kind === "rect" ? 0 : Math.min(panel.shape.cornerRadius || 32, panel.transform.width / 2, panel.transform.height / 2) },
  }));
}

function setPanelCornerRadius(event: Event): void {
  const panel = primaryElement.value;
  if (panel?.type !== "panel_frame" || panel.shape.kind !== "rounded_rect") return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  session.execute(command("panel.set_shape", "调整画格圆角", {
    canvasId: session.currentCanvas.value!.id,
    elementId: panel.id,
    shape: { kind: "rounded_rect", cornerRadius: Math.max(0, Math.min(value, panel.transform.width / 2, panel.transform.height / 2)) },
  }));
}

function setPanelBorderWidth(event: Event): void {
  const panel = primaryElement.value;
  if (panel?.type !== "panel_frame") return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  session.execute(command("panel.set_border", "调整画格边框", {
    canvasId: session.currentCanvas.value!.id,
    elementId: panel.id,
    border: { ...panel.border, width: Math.max(0, Math.min(value, 512)) },
  }));
}

function setFreeImageDisplay(event: Event): void {
  const image = primaryElement.value;
  if (image?.type !== "free_image") return;
  const mode = (event.target as HTMLSelectElement).value;
  session.execute(command("image.set_display", "调整图片显示方式", {
    canvasId: session.currentCanvas.value!.id,
    elementId: image.id,
    display: mode === "cover" ? { mode: "cover", crop: defaultCrop() } : { mode: "contain" },
  }));
}

function coveredCrop(candidate: CoverCropV1): CoverCropV1 | null {
  const element = primaryElement.value;
  const image = primaryImage.value;
  if (!element || !image) return null;
  const catalog = sourceCatalogItems.value.find((item) => item.source.assetId === image.source.assetId);
  if (!catalog) return candidate;
  const evaluation = evaluateCoverCropV1({
    sourceWidth: catalog.width,
    sourceHeight: catalog.height,
    frameWidth: element.transform.width,
    frameHeight: element.transform.height,
    crop: candidate,
  });
  if (evaluation.covered) return candidate;
  const requiredZoom = evaluation.requiredScaleWithOffset / evaluation.baseScale;
  if (!Number.isFinite(requiredZoom)) return null;
  return { ...candidate, zoom: Math.max(candidate.zoom, Math.ceil((requiredZoom + 0.001) * 1000) / 1000) };
}

function applyCrop(candidate: CoverCropV1, label: string): void {
  const element = primaryElement.value;
  if (!element) return;
  const safe = coveredCrop(candidate);
  if (!safe) {
    actionError.value = "该裁切无法完整覆盖画格，已阻止修改。";
    return;
  }
  actionError.value = null;
  session.execute(command("image.set_crop", label, {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    crop: safe,
  }));
}

function updateCropNumber(field: "zoom" | "offsetX" | "offsetY" | "rotation", event: Event): void {
  if (!primaryCrop.value) return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  applyCrop({ ...primaryCrop.value, [field]: field === "zoom" ? Math.max(1, value) : value }, "调整图片裁切");
}

function toggleCropFlip(field: "flipX" | "flipY"): void {
  if (!primaryCrop.value) return;
  applyCrop({ ...primaryCrop.value, [field]: !primaryCrop.value[field] }, "翻转图片");
}

function resetCrop(): void {
  applyCrop(defaultCrop(), "重置图片裁切");
}

function deletePrimaryElement(): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas) return;
  if (
    element.type === "panel_frame"
    && element.contentImage
    && !window.confirm("删除此画格会让对应镜头回到“未放置”。是否继续？")
  ) return;
  session.execute(command("element.delete", "删除对象", { canvasId: canvas.id, elementId: element.id }));
  session.selectedElementIds.value = [];
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
.property-panel input,
.property-panel select {
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
  grid-template-columns: 48px 238px minmax(0, 1fr) 320px;
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
.canvas-nav-item { display: flex; width: 100%; height: auto; gap: 9px; align-items: center; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; background: rgba(19, 28, 48, 0.9); color: #d9e2f3; text-align: left; margin-bottom: 7px; padding: 9px; cursor: pointer; }
.canvas-nav-item > span { display: grid; place-items: center; width: 26px; height: 32px; border-radius: 6px; background: #e9edf5; color: #111827; font-weight: 900; }
.canvas-nav-item > div:not(.canvas-nav-actions) { display: grid; gap: 3px; min-width: 0; flex: 1; }
.canvas-nav-item small { color: #7f8ca8; }
.canvas-nav-item.is-active { border-color: rgba(116, 95, 255, 0.55); background: rgba(116, 95, 255, 0.14); }
.canvas-nav-actions { display: flex; margin-left: auto; }
.canvas-nav-actions button { width: 25px; min-height: 25px; border: 0; padding: 0; background: transparent; }
.canvas-list-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.canvas-list-actions button { min-width: 0; padding: 0 5px; font-size: 11px; }

.shot-tray { margin-top: 18px; border-top: 1px solid rgba(148, 163, 184, 0.12); padding-top: 14px; }
.shot-tray > p { color: #7f8ca8; font-size: 11px; line-height: 1.5; }
.shot-tray article { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 9px; padding: 7px; margin-bottom: 8px; cursor: pointer; }
.shot-tray article.is-selected { border-color: rgba(34, 199, 169, 0.48); background: rgba(34, 199, 169, 0.08); }
.shot-tray article > img { width: 54px; height: 54px; border-radius: 6px; object-fit: cover; }
.shot-tray article > div { display: grid; align-content: center; gap: 4px; min-width: 0; }
.shot-tray article small { color: #8491aa; font-size: 10px; }
.shot-actions { grid-column: 1 / -1; display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 4px !important; }
.shot-actions button { min-width: 0; min-height: 27px; padding: 0 3px; font-size: 10px; }

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

.canvas-element.type-panel_frame { border-style: solid; background: #d6dbe5; }
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
.preset-picker,
.special-properties,
.reading-order { display: grid; gap: 9px; border-bottom: 1px solid rgba(148, 163, 184, 0.12); padding-bottom: 14px; margin-bottom: 14px; }
.section-heading { display: grid; gap: 3px; }
.section-heading small { color: #7f8ca8; font-size: 10px; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.preset-grid button { display: flex; justify-content: space-between; align-items: center; min-width: 0; padding: 6px 8px; font-size: 11px; }
.preset-grid button.is-active { border-color: rgba(116, 95, 255, 0.55); background: rgba(116, 95, 255, 0.16); }
.preset-grid small { color: #7f8ca8; font-size: 9px; }
.preset-picker > p,
.special-properties > p { margin: 0; color: #8491aa; font-size: 10px; line-height: 1.5; }
.special-properties > label { display: grid; gap: 5px; color: #8491aa; font-size: 11px; }
.reading-order article { display: flex; align-items: center; justify-content: space-between; gap: 6px; border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 7px; padding: 5px 7px; font-size: 11px; }
.reading-order article div { display: flex; }
.reading-order article button { width: 25px; min-height: 25px; padding: 0; border: 0; background: transparent; }
.layer-panel article { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid transparent; border-radius: 8px; padding: 7px; margin-bottom: 5px; cursor: pointer; }
.layer-panel article.is-selected { border-color: rgba(34, 199, 169, 0.36); background: rgba(34, 199, 169, 0.09); }
.layer-panel article > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.layer-panel article div { display: flex; }
.layer-panel article button { width: 27px; min-height: 27px; padding: 0; border: 0; background: transparent; }
.hidden-summary { color: #7f8ca8; font-size: 11px; padding: 8px; }

.editor-shell.is-readonly .canvas-element { pointer-events: none; }

@media (max-width: 1260px) {
  .editor-shell { grid-template-columns: 44px 210px minmax(0, 1fr) 280px; }
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
