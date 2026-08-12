<template>
  <Teleport to="body">
    <div v-if="open" class="stage-backdrop" role="presentation" @click.self="handleBackdropClose">
      <section class="stage-panel" role="dialog" aria-modal="true" aria-labelledby="stage-title">
        <button class="stage-close" type="button" aria-label="关闭阶段管理" :disabled="busy" @click="close">
          <X :size="18" />
        </button>

        <header class="stage-header">
          <span>角色阶段</span>
          <h2 id="stage-title">{{ characterName }} 阶段管理</h2>
          <p>按章节顺序管理角色形象变化阶段，分镜生图时会按章节自动匹配对应阶段的预览图。</p>
        </header>

        <p v-if="error" class="stage-error-banner" role="alert">
          <AlertCircle :size="14" />
          <span>{{ error }}</span>
        </p>

        <!-- 列表视图 -->
        <template v-if="view === 'list'">
          <!-- 加载骨架屏 -->
          <div v-if="loading" class="stage-list" aria-busy="true">
            <div v-for="index in 3" :key="index" class="stage-card stage-card-skeleton" />
          </div>

          <!-- 空状态 -->
          <div v-else-if="stages.length === 0" class="stage-empty">
            <AlertCircle v-if="error" :size="22" />
            <Layers v-else :size="22" />
            <p>{{ error ? "加载阶段列表失败。" : "还没有创建阶段，点击下方按钮创建首个阶段" }}</p>
            <button v-if="error" class="stage-retry" type="button" @click="loadStages">重试</button>
          </div>

          <!-- 阶段卡片列表 -->
          <ul v-else class="stage-list">
            <li v-for="stage in sortedStages" :key="stage.id" class="stage-card">
              <div class="stage-card-main">
                <div class="stage-card-preview">
                  <button
                    v-if="previewAssetIdOf(stage)"
                    class="stage-preview-thumb is-clickable"
                    type="button"
                    :disabled="regeneratingStageId === stage.id"
                    @click="openPreview(stage)"
                  >
                    <img :src="assetUrl(previewAssetIdOf(stage)!)" :alt="`${stageTitle(stage)} 预览图`" />
                    <span class="stage-preview-zoom">
                      <ZoomIn :size="14" />
                    </span>
                  </button>
                  <div v-else class="stage-preview-thumb is-empty">
                    <ImageOff :size="16" />
                    <span>{{ regeneratingStageId === stage.id ? "生成中..." : "无预览" }}</span>
                  </div>
                </div>

                <div class="stage-card-info">
                  <div class="stage-card-title">
                    <span class="stage-order-badge">{{ stage.stageOrder }}</span>
                    <strong>{{ stageTitle(stage) }}</strong>
                  </div>
                  <p class="stage-card-range">
                    <span class="stage-card-range-icon"><BookOpen :size="12" /></span>
                    {{ chapterRangeLabel(stage) }}
                  </p>
                  <p class="stage-card-delta">{{ stage.visualDelta }}</p>
                </div>

                <div class="stage-card-actions">
                  <button class="stage-action" type="button" :disabled="busy" @click="openEdit(stage)">
                    <Pencil :size="12" />
                    <span>编辑</span>
                  </button>
                  <button class="stage-action is-danger" type="button" :disabled="busy" @click="requestDelete(stage)">
                    <Trash2 :size="12" />
                    <span>删除</span>
                  </button>
                  <button class="stage-action" type="button" :disabled="busy" @click="regenerate(stage)">
                    <RefreshCw :size="12" :class="{ 'is-spinning': regeneratingStageId === stage.id }" />
                    <span>{{ regeneratingStageId === stage.id ? "生成中..." : "重新生成预览" }}</span>
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </template>

        <!-- 创建/编辑表单视图 -->
        <CharacterStageForm
          v-else
          :project-id="projectId"
          :character="character"
          :chapters="chapters"
          :stage="editingStage"
          @cancel="view = 'list'"
          @saved="handleSaved"
        />

        <footer v-if="view === 'list'" class="stage-actions">
          <button class="stage-primary" type="button" :disabled="busy || loading" @click="openCreate">
            <Plus :size="14" />
            <span>创建新阶段</span>
          </button>
          <button class="stage-secondary" type="button" :disabled="busy" @click="close">关闭</button>
        </footer>
      </section>

      <!-- 预览图放大 -->
      <div v-if="previewStage" class="stage-zoom-backdrop" role="dialog" aria-modal="true" @click.self="closePreview">
        <button class="stage-zoom-close" type="button" aria-label="关闭预览" @click="closePreview">
          <X :size="18" />
        </button>
        <img
          :src="assetUrl(previewAssetIdOf(previewStage)!)"
          :alt="`${stageTitle(previewStage)} 预览图`"
          class="stage-zoom-image"
        />
        <span class="stage-zoom-caption">{{ stageTitle(previewStage) }} · 预览图</span>
      </div>

      <!-- 删除二次确认 -->
      <div v-if="confirmingDelete" class="stage-confirm-backdrop" role="presentation" @click.self="cancelDelete">
        <section class="stage-confirm" role="alertdialog" aria-modal="true" aria-labelledby="stage-confirm-title">
          <h3 id="stage-confirm-title">删除阶段</h3>
          <p>确定删除「{{ stageTitle(confirmingDelete) }}」吗？该阶段的预览图将一并删除，此操作不可恢复。</p>
          <div class="stage-confirm-actions">
            <button class="stage-secondary" type="button" :disabled="deleting" @click="cancelDelete">取消</button>
            <button class="stage-danger" type="button" :disabled="deleting" @click="confirmDelete">
              <LoaderCircle v-if="deleting" :size="14" class="is-spinning" />
              <span>{{ deleting ? "删除中..." : "确认删除" }}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  AlertCircle,
  BookOpen,
  ImageOff,
  Layers,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
  ZoomIn,
} from "lucide-vue-next";
import type { ChapterListItem, CharacterStage, ProjectCharacter, WorkbenchAsset } from "@airoaming/shared";
import { api } from "../../services/api";
import CharacterStageForm from "./CharacterStageForm.vue";

const props = defineProps<{
  open: boolean;
  projectId: string;
  character: ProjectCharacter | null;
  chapters: ChapterListItem[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const stages = ref<CharacterStage[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const view = ref<"list" | "form">("list");
const editingStage = ref<CharacterStage | null>(null);
const confirmingDelete = ref<CharacterStage | null>(null);
const deleting = ref(false);
const regeneratingStageId = ref<string | null>(null);
const previewStage = ref<CharacterStage | null>(null);
/** regenerate/创建返回了 previewAsset 但 stage.previewAssetId 未回填时的兜底覆盖 */
const previewOverride = ref<Record<string, string>>({});

const characterName = computed(() => props.character?.name ?? "角色");
const busy = computed(() => deleting.value || Boolean(regeneratingStageId.value));
const sortedStages = computed(() => [...stages.value].sort((left, right) => left.stageOrder - right.stageOrder));

const chapterById = computed(() => {
  const map = new Map<string, ChapterListItem>();
  for (const chapter of props.chapters) {
    map.set(chapter.id, chapter);
  }
  return map;
});

watch(
  () => props.open,
  (open) => {
    resetState();
    if (open) {
      void loadStages();
    }
  },
);

function resetState() {
  stages.value = [];
  loading.value = false;
  error.value = null;
  view.value = "list";
  editingStage.value = null;
  confirmingDelete.value = null;
  deleting.value = false;
  regeneratingStageId.value = null;
  previewStage.value = null;
  previewOverride.value = {};
}

async function loadStages() {
  if (!props.character) {
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const result = await api.listCharacterStages(props.projectId, props.character.id);
    stages.value = [...result.stages].sort((left, right) => left.stageOrder - right.stageOrder);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载阶段列表失败，请重试。";
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingStage.value = null;
  view.value = "form";
}

function openEdit(stage: CharacterStage) {
  if (busy.value) {
    return;
  }
  editingStage.value = stage;
  view.value = "form";
}

function handleSaved(payload: { stage: CharacterStage; previewAsset: WorkbenchAsset | null }) {
  const index = stages.value.findIndex((item) => item.id === payload.stage.id);
  if (index >= 0) {
    stages.value[index] = payload.stage;
  } else {
    stages.value.push(payload.stage);
  }
  stages.value = [...stages.value].sort((left, right) => left.stageOrder - right.stageOrder);
  if (payload.previewAsset && !payload.stage.previewAssetId) {
    previewOverride.value = { ...previewOverride.value, [payload.stage.id]: payload.previewAsset.id };
  }
  view.value = "list";
  editingStage.value = null;
}

function requestDelete(stage: CharacterStage) {
  if (busy.value) {
    return;
  }
  confirmingDelete.value = stage;
}

function cancelDelete() {
  if (!deleting.value) {
    confirmingDelete.value = null;
  }
}

async function confirmDelete() {
  if (!props.character || !confirmingDelete.value || deleting.value) {
    return;
  }
  const target = confirmingDelete.value;
  deleting.value = true;
  error.value = null;
  try {
    await api.deleteCharacterStage(props.projectId, props.character.id, target.id);
    stages.value = stages.value.filter((item) => item.id !== target.id);
    confirmingDelete.value = null;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "删除阶段失败，请重试。";
  } finally {
    deleting.value = false;
  }
}

async function regenerate(stage: CharacterStage) {
  if (!props.character || busy.value) {
    return;
  }
  regeneratingStageId.value = stage.id;
  error.value = null;
  try {
    const result = await api.regenerateCharacterStage(props.projectId, props.character.id, stage.id);
    const index = stages.value.findIndex((item) => item.id === result.stage.id);
    if (index >= 0) {
      stages.value[index] = result.stage;
    }
    if (result.previewAsset && !result.stage.previewAssetId) {
      previewOverride.value = { ...previewOverride.value, [result.stage.id]: result.previewAsset.id };
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "重新生成预览失败，请重试。";
  } finally {
    regeneratingStageId.value = null;
  }
}

function previewAssetIdOf(stage: CharacterStage): string | undefined {
  return stage.previewAssetId ?? previewOverride.value[stage.id];
}

function openPreview(stage: CharacterStage) {
  if (!previewAssetIdOf(stage) || regeneratingStageId.value === stage.id) {
    return;
  }
  previewStage.value = stage;
}

function closePreview() {
  previewStage.value = null;
}

function stageTitle(stage: CharacterStage) {
  const suffix = stage.name?.trim() ? ` · ${stage.name}` : "";
  return `阶段 ${stage.stageOrder}${suffix}`;
}

function chapterLabel(chapterId: string): string {
  const chapter = chapterById.value.get(chapterId);
  return chapter ? `第${chapter.order}章` : "未知章节";
}

function chapterRangeLabel(stage: CharacterStage) {
  const from = stage.fromChapterId ? chapterLabel(stage.fromChapterId) : "从头";
  const to = stage.toChapterId ? chapterLabel(stage.toChapterId) : "至今";
  return `${from} - ${to}`;
}

function assetUrl(assetId: string) {
  return api.projectAssetFileUrl(props.projectId, assetId);
}

function close() {
  if (!busy.value) {
    emit("close");
  }
}

function handleBackdropClose() {
  if (!busy.value && view.value === "list") {
    emit("close");
  }
}
</script>

<style scoped>
.stage-backdrop {
  position: fixed;
  inset: 0;
  z-index: 96;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.74);
  backdrop-filter: blur(14px);
  padding: 20px;
}

.stage-panel {
  position: relative;
  display: grid;
  gap: 16px;
  width: min(760px, 96vw);
  max-height: min(86vh, 840px);
  min-height: 0;
  border: 1px solid rgba(34, 199, 169, 0.28);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.97), rgba(7, 12, 24, 0.99)),
    #0f172a;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  padding: 22px;
  color: #eef2ff;
  overflow-y: auto;
}

.stage-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, color 0.18s;
}

.stage-close:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.stage-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.stage-header {
  display: grid;
  gap: 6px;
  padding-right: 40px;
}

.stage-header span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.stage-header h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 19px;
  font-weight: 900;
}

.stage-header p {
  margin: 0;
  color: #9aa8c7;
  font-size: 12px;
  line-height: 1.6;
}

.stage-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
}

/* 阶段列表 */
.stage-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 2px;
  list-style: none;
  min-height: 0;
}

.stage-card {
  border: 1px solid transparent;
  border-radius: 12px;
  background:
    linear-gradient(rgba(15, 23, 42, 0.82), rgba(7, 12, 24, 0.92)) padding-box,
    linear-gradient(135deg, rgba(34, 199, 169, 0.38), rgba(139, 92, 246, 0.38)) border-box;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  padding: 12px;
}

.stage-card-main {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

/* 预览图 */
.stage-card-preview {
  width: 92px;
}

.stage-preview-thumb {
  display: grid;
  position: relative;
  place-items: center;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.6);
  padding: 0;
}

.stage-preview-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.stage-preview-thumb.is-clickable {
  cursor: zoom-in;
  transition: border-color 0.16s, box-shadow 0.16s;
}

.stage-preview-thumb.is-clickable:hover {
  border-color: rgba(34, 199, 169, 0.6);
  box-shadow: 0 6px 20px rgba(34, 199, 169, 0.18);
}

.stage-preview-thumb.is-clickable:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.stage-preview-zoom {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 6px;
  background: rgba(2, 6, 23, 0.72);
  color: #cbd5e1;
}

.stage-preview-thumb.is-empty {
  display: grid;
  gap: 4px;
  border: 1px dashed rgba(148, 163, 184, 0.24);
  color: #475569;
  font-size: 10px;
  text-align: center;
}

/* 卡片信息 */
.stage-card-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.stage-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.stage-order-badge {
  display: grid;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid rgba(34, 199, 169, 0.4);
  border-radius: 999px;
  background: rgba(34, 199, 169, 0.14);
  color: #8df0dc;
  font-size: 11px;
  font-weight: 900;
}

.stage-card-title strong {
  overflow: hidden;
  color: #f8fafc;
  font-size: 15px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-card-range {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.stage-card-range-icon {
  display: grid;
  color: #8df0dc;
}

.stage-card-delta {
  margin: 0;
  overflow: hidden;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* 卡片操作 */
.stage-card-actions {
  display: grid;
  gap: 6px;
  justify-items: stretch;
}

.stage-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
  padding: 0 12px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, color 0.16s;
}

.stage-action:hover {
  border-color: rgba(34, 199, 169, 0.5);
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc;
}

.stage-action.is-danger:hover {
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.stage-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.is-spinning {
  animation: stage-spin 0.9s linear infinite;
}

@keyframes stage-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 骨架屏 */
.stage-card-skeleton {
  height: 96px;
  background:
    linear-gradient(100deg, rgba(30, 41, 59, 0.5) 30%, rgba(51, 65, 85, 0.7) 50%, rgba(30, 41, 59, 0.5) 70%);
  background-size: 240% 100%;
  animation: stage-shimmer 1.3s ease-in-out infinite;
}

@keyframes stage-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

/* 空状态 */
.stage-empty {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 220px;
  border: 1px dashed rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.4);
  color: #64748b;
  text-align: center;
  padding: 24px;
}

.stage-empty p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.stage-retry {
  border: 1px solid rgba(34, 199, 169, 0.4);
  border-radius: 8px;
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.stage-retry:hover {
  background: rgba(34, 199, 169, 0.2);
}

/* 底部操作 */
.stage-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 2px;
}

.stage-secondary,
.stage-primary,
.stage-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s, border-color 0.18s, background 0.18s, color 0.18s;
}

.stage-secondary {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
}

.stage-secondary:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.stage-primary {
  border: 1px solid rgba(34, 199, 169, 0.4);
  background: linear-gradient(135deg, #22c7a9, #0ea5a4);
  color: #03221c;
  box-shadow: 0 10px 24px rgba(34, 199, 169, 0.24);
}

.stage-primary:hover {
  transform: translateY(-1px);
}

.stage-danger {
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(239, 68, 68, 0.26);
}

.stage-danger:hover {
  transform: translateY(-1px);
}

.stage-secondary:disabled,
.stage-primary:disabled,
.stage-danger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

/* 预览放大 */
.stage-zoom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 97;
  display: grid;
  place-items: center;
  gap: 14px;
  grid-auto-flow: row;
  background: rgba(2, 6, 23, 0.9);
  backdrop-filter: blur(12px);
  padding: 32px;
}

.stage-zoom-image {
  max-width: min(88vw, 640px);
  max-height: 78vh;
  border-radius: 10px;
  object-fit: contain;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.stage-zoom-caption {
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 800;
}

.stage-zoom-close {
  position: fixed;
  top: 20px;
  right: 20px;
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
}

.stage-zoom-close:hover {
  background: rgba(15, 23, 42, 0.95);
}

/* 删除二次确认 */
.stage-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 97;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.66);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.stage-confirm {
  display: grid;
  gap: 14px;
  width: min(420px, 92vw);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(30, 18, 26, 0.98), rgba(12, 10, 20, 0.99)),
    #0f172a;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  padding: 20px;
  color: #eef2ff;
}

.stage-confirm h3 {
  margin: 0;
  color: #fca5a5;
  font-size: 16px;
  font-weight: 900;
}

.stage-confirm p {
  margin: 0;
  color: #cbd5e1;
  font-size: 13px;
  line-height: 1.7;
}

.stage-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .stage-card-main {
    grid-template-columns: minmax(0, 1fr);
  }

  .stage-card-preview {
    width: 100%;
    max-width: 160px;
  }

  .stage-card-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stage-actions,
  .stage-confirm-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
