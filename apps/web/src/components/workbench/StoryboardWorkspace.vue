<template>
  <section class="storyboard-workspace" aria-label="分镜工作台">
    <header class="storyboard-toolbar">
      <div class="chapter-picker">
        <PanelsTopLeft :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getStoryboardStatusLabel(chapter) }}
          </option>
        </select>
        <span v-if="snapshot.project.storyTitle" class="story-title">{{ snapshot.project.storyTitle }}</span>
      </div>

      <button class="primary-action" type="button" :disabled="!canGenerate || loading || dialogueSending" @click="requestGenerate">
        <RefreshCw :size="15" />
        <span>{{ hasStoryboard ? "重新生成" : "生成分镜" }}</span>
      </button>
    </header>

    <div v-if="!snapshot.storyStructure" class="storyboard-empty">
      <Lock :size="22" />
      <h2>请先确认本章剧情结构</h2>
      <p>分镜会读取已确认的 structure.json，把剧情节拍拆成镜头卡。</p>
    </div>

    <div v-else-if="workingJson" class="storyboard-scroll">
      <div class="storyboard-status-band" :class="activeStoryboard?.status">
        <div>
          <span>{{ activeStoryboard?.status === "pending_confirmation" ? "待确认预览" : "已完成" }}</span>
          <strong>{{ workingJson.chapterTitle }} · {{ workingJson.shots.length }} 镜</strong>
        </div>
        <button
          v-if="activeStoryboard?.status === 'pending_confirmation'"
          class="confirm-action"
          type="button"
          :disabled="loading"
          @click="confirmPendingStoryboard"
        >
          <CheckCircle2 :size="15" />
          <span>确认分镜</span>
        </button>
      </div>

      <section class="storyboard-summary">
        <div>
          <span>镜头模型</span>
          <strong>Shot 核心 + comic / motion</strong>
        </div>
        <p>每张镜头卡同时保留漫画画格表达和基础漫剧镜头表达；后续仍可拆分或合并漫剧镜头。</p>
      </section>

      <div class="shot-list">
        <article
          v-for="(shot, index) in workingJson.shots"
          :key="shot.id"
          class="shot-card"
          :class="{
            'is-collapsed': !isShotExpanded(shot.id),
            'is-dragging': dragIndex === index,
            'is-drag-over': dragOverIndex === index && dragIndex !== index,
          }"
          @dragover="onDragOver($event, index)"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
        >
          <div class="shot-card-head" @click="toggleShotExpand(shot.id)">
            <span
              class="drag-handle"
              title="拖拽调整顺序"
              draggable="true"
              @click.stop
              @dragstart="onDragStart(index)"
            ><GripVertical :size="18" /></span>
            <div class="shot-number">镜头 {{ shot.order }}</div>
            <!-- 候选图缩略预览(P0 任务D):有图才显示,无图不占位避免分镜阶段噪音 -->
            <div v-if="shotThumbMap.get(shot.id)" class="shot-thumb" :class="{ 'is-locked': shotThumbMap.get(shot.id)?.locked }">
              <img :src="shotThumbMap.get(shot.id)!.url" :alt="`镜头 ${shot.order} 候选`" loading="lazy" />
              <Lock v-if="shotThumbMap.get(shot.id)?.locked" :size="11" class="shot-thumb-lock" />
              <span v-else-if="(shotThumbMap.get(shot.id)?.count ?? 0) > 1" class="shot-thumb-count">{{ shotThumbMap.get(shot.id)?.count }}</span>
            </div>
            <div class="shot-head-text">
              <strong>{{ shot.coreAction || shot.comic.panelDescription || "未填写镜头动作" }}</strong>
              <span>{{ getShotSceneName(shot.sceneId) }} · {{ shot.emotion || "未填写情绪" }}</span>
            </div>
            <button class="icon-action danger" type="button" title="删除镜头" @click.stop="removeShot(index)">
              <Trash2 :size="14" />
            </button>
            <span class="shot-expand-toggle" :class="{ 'is-open': isShotExpanded(shot.id) }">▾</span>
          </div>

          <div v-show="isShotExpanded(shot.id)" class="shot-card-body">

          <div class="shot-core-grid">
            <EditableField :field-key="`shots.${index}.coreAction`" label="核心动作" :editing-key="editingKey" :editing-value="editingValue" :value="shot.coreAction" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`shots.${index}.emotion`" label="情绪" :editing-key="editingKey" :editing-value="editingValue" :value="shot.emotion" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`shots.${index}.shotType`" label="景别" :value="shot.shotType" :options="SHOT_TYPE_OPTIONS" @commit="commitSelectField" />
            <EditableField :field-key="`shots.${index}.cameraAngle`" label="机位" :value="shot.cameraAngle" :options="CAMERA_ANGLE_OPTIONS" @commit="commitSelectField" />
          </div>

          <div class="shot-expression-grid">
            <section class="shot-expression comic-column">
              <div class="expression-heading">
                <span>漫画画格</span>
                <strong>comic</strong>
              </div>
              <EditableField :field-key="`shots.${index}.comic.panelDescription`" label="画面描述" :editing-key="editingKey" :editing-value="editingValue" :value="shot.comic.panelDescription" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${index}.comic.composition`" label="构图" :editing-key="editingKey" :editing-value="editingValue" :value="shot.comic.composition" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${index}.comic.dialogue`" label="对白" :editing-key="editingKey" :editing-value="editingValue" :value="shot.comic.dialogue" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${index}.comic.caption`" label="旁白" :editing-key="editingKey" :editing-value="editingValue" :value="shot.comic.caption" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${index}.comic.panelRhythm`" label="画格节奏" :value="shot.comic.panelRhythm" :options="PANEL_RHYTHM_OPTIONS" @commit="commitSelectField" />
            </section>

            <section class="shot-expression motion-column">
              <div class="expression-heading">
                <span>漫剧镜头</span>
                <strong>motion</strong>
              </div>
              <EditableField :field-key="`shots.${index}.motion.visualDescription`" label="画面描述" :editing-key="editingKey" :editing-value="editingValue" :value="shot.motion.visualDescription" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${index}.motion.compositionDesign`" label="构图设计" :editing-key="editingKey" :editing-value="editingValue" :value="shot.motion.compositionDesign" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${index}.motion.cameraMovement`" label="运镜调度" :value="shot.motion.cameraMovement" :options="CAMERA_MOVEMENT_OPTIONS" @commit="commitSelectField" />
              <EditableField :field-key="`shots.${index}.motion.frameType`" label="镜头类型" :value="shot.motion.frameType" :options="FRAME_TYPE_OPTIONS" @commit="commitSelectField" />
              <div class="editable-shot-field">
                <span class="editable-shot-label">时长(毫秒)</span>
                <div class="editable-shot-value">
                  <input
                    type="number"
                    class="shot-number-input"
                    :value="shot.motion.durationMs"
                    min="0"
                    step="100"
                    @change="commitSelectField(`shots.${index}.motion.durationMs`, ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
              <EditableField :field-key="`shots.${index}.motion.durationHint`" label="时长说明" :editing-key="editingKey" :editing-value="editingValue" :value="shot.motion.durationHint" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <div class="editable-shot-field">
                <span class="editable-shot-label">配音台词</span>
                <div class="editable-shot-value">
                  <ul v-if="shot.motion.voiceLines.length > 0" class="voice-lines-list">
                    <li v-for="(voiceLine, lineIndex) in shot.motion.voiceLines" :key="lineIndex">
                      <strong>{{ voiceLine.name || "未命名" }}</strong>
                      <span>{{ voiceLine.line || "（无台词）" }}</span>
                      <em v-if="voiceLine.voiceStyle">{{ voiceLine.voiceStyle }}</em>
                    </li>
                  </ul>
                  <p v-else>无台词</p>
                </div>
              </div>
            </section>
          </div>
          </div>
        </article>
      </div>

      <button class="add-shot-action" type="button" @click="addShot">
        <Plus :size="15" />
        <span>新增镜头</span>
      </button>
    </div>

    <div v-else class="storyboard-empty">
      <PanelsTopLeft :size="22" />
      <h2>当前章还没有分镜</h2>
      <p>左侧说“生成分镜”，这里会先显示待确认镜头卡。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CheckCircle2, GripVertical, Image as ImageIcon, Lock, PanelsTopLeft, Plus, RefreshCw, Trash2 } from "lucide-vue-next";
import type { ChapterListItem, ChapterStoryboard, DialogueThread, StoryboardJson, StoryboardShot, WorkbenchCandidate, WorkbenchSnapshot } from "@airoaming/shared";
import { api } from "../../services/api";
import EditableField from "./EditableField.vue";
import {
  CAMERA_ANGLE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  FRAME_TYPE_OPTIONS,
  PANEL_RHYTHM_OPTIONS,
  SHOT_TYPE_OPTIONS,
} from "../../utils/storyboard-options";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  dialogueThread: DialogueThread | null;
  loading: boolean;
  dialogueSending: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateStoryboard: [payload: { chapterId: string; regenerate: boolean }];
  confirmStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  updateStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  savePendingStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
}>();

const editingKey = ref<string | null>(null);
const editingValue = ref("");
const workingJson = ref<StoryboardJson | null>(null);
const workingSourceKey = ref("");
const expandedShots = ref<Set<string>>(new Set());
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

const chapters = computed(() => props.snapshot.chapters ?? []);

/** 镜头的候选缩略信息:已锁定的候选优先,否则取最新一张候选。按 shotId 缓存到 computed map(P0 任务D)。 */
const shotThumbMap = computed(() => {
  const candidates = props.snapshot.candidates ?? [];
  const projectId = props.snapshot.project.id;
  const byShot = new Map<string, WorkbenchCandidate[]>();
  for (const candidate of candidates) {
    const list = byShot.get(candidate.shotId);
    if (list) {
      list.push(candidate);
    } else {
      byShot.set(candidate.shotId, [candidate]);
    }
  }
  const result = new Map<string, { url: string; locked: boolean; count: number }>();
  for (const [shotId, list] of byShot) {
    const locked = list.find((c) => c.status === "locked");
    const target = locked ?? [...list].sort((a, b) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0"))[0];
    if (target?.assetId) {
      result.set(shotId, {
        url: api.projectAssetFileUrl(projectId, target.assetId),
        locked: Boolean(locked),
        count: list.length,
      });
    }
  }
  return result;
});
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const formalStoryboard = computed(() => props.snapshot.storyboard);
const pendingStoryboard = computed(() => {
  const chapterId = currentChapterId.value;
  if (!chapterId) {
    return null;
  }

  if (props.snapshot.pendingStoryboard?.chapterId === chapterId) {
    return props.snapshot.pendingStoryboard;
  }

  const result = [...(props.dialogueThread?.toolResults ?? [])]
    .reverse()
    .find((item) => item.tool === "generate_storyboard"
      && item.status === "needs_user_confirmation"
      && item.storyboard?.chapterId === chapterId
      && item.storyboard.status === "pending_confirmation");
  if (
    result?.storyboard
    && formalStoryboard.value?.chapterId === chapterId
    && Date.parse(formalStoryboard.value.updatedAt) >= Date.parse(result.storyboard.createdAt)
  ) {
    return null;
  }
  return result?.storyboard ?? null;
});
const activeStoryboard = computed(() => pendingStoryboard.value ?? formalStoryboard.value);
const hasStoryboard = computed(() => Boolean(pendingStoryboard.value || formalStoryboard.value));
const canGenerate = computed(() => Boolean(currentChapter.value && props.snapshot.storyStructure && currentChapter.value.status !== "draft" && currentChapter.value.status !== "script_done"));

watch(
  activeStoryboard,
  (storyboard) => {
    const key = storyboard ? `${storyboard.id}:${storyboard.updatedAt}` : "";
    if (key === workingSourceKey.value) {
      return;
    }

    workingSourceKey.value = key;
    workingJson.value = storyboard ? cloneStoryboard(storyboard.storyboardJson) : null;
    editingKey.value = null;
  },
  { immediate: true },
);

function selectChapter(event: Event) {
  const chapterId = (event.target as HTMLSelectElement).value;
  if (chapterId) {
    emit("selectChapter", chapterId);
  }
}

function requestGenerate() {
  const chapter = currentChapter.value;
  if (!chapter) {
    return;
  }

  const regenerate = chapter.status !== "structured" || Boolean(formalStoryboard.value);
  if (regenerate && !window.confirm("重新生成分镜会影响候选图、排版和轻漫剧镜头字段，确认继续吗？")) {
    return;
  }

  emit("generateStoryboard", { chapterId: chapter.id, regenerate });
}

function confirmPendingStoryboard() {
  const pending = pendingStoryboard.value;
  if (!pending || !workingJson.value) {
    return;
  }

  emit("confirmStoryboard", {
    chapterId: pending.chapterId,
    storyboardJson: workingJson.value,
  });
}

function startEditing(key: string, value: string) {
  editingKey.value = key;
  editingValue.value = value;
}

function commitField(key: string) {
  if (editingKey.value !== key || !workingJson.value) {
    editingKey.value = null;
    return;
  }

  const next = cloneStoryboard(workingJson.value);
  setStoryboardField(next, key, editingValue.value);
  workingJson.value = next;
  editingKey.value = null;
  editingValue.value = "";
  persistIfFormal(next);
}

// 下拉/数字字段直接写入(不经过 editingKey/editingValue)。
// durationMs 这类数字字段走 setStoryboardNumber,其余走 setStoryboardField。
function commitSelectField(key: string, value: string) {
  if (!workingJson.value) {
    return;
  }
  const next = cloneStoryboard(workingJson.value);
  if (key.endsWith(".durationMs")) {
    setStoryboardNumber(next, key, Number(value));
  } else {
    setStoryboardField(next, key, value);
  }
  workingJson.value = next;
  persistIfFormal(next);
}

// 按点分路径写入数字值(给 durationMs 用)
function setStoryboardNumber(storyboard: StoryboardJson, key: string, value: number) {
  const [, indexText, ...fieldParts] = key.split(".");
  const index = Number(indexText);
  const shot = storyboard.shots[index] as unknown as Record<string, unknown> | undefined;
  if (!shot) {
    return;
  }
  let target = shot;
  for (const part of fieldParts.slice(0, -1)) {
    const nextTarget = target[part];
    if (typeof nextTarget !== "object" || nextTarget === null || Array.isArray(nextTarget)) {
      return;
    }
    target = nextTarget as Record<string, unknown>;
  }
  const field = fieldParts[fieldParts.length - 1];
  if (field) {
    target[field] = value;
    storyboard.updatedAt = new Date().toISOString();
  }
}

function toggleShotExpand(shotId: string) {
  if (expandedShots.value.has(shotId)) {
    expandedShots.value.delete(shotId);
  } else {
    expandedShots.value.add(shotId);
  }
  expandedShots.value = new Set(expandedShots.value);
}

function isShotExpanded(shotId: string) {
  return expandedShots.value.has(shotId);
}

function addShot() {
  if (!workingJson.value) {
    return;
  }

  const next = cloneStoryboard(workingJson.value);
  const order = next.shots.length + 1;
  next.shots.push(createEmptyShot(order));
  next.updatedAt = new Date().toISOString();
  workingJson.value = next;
  persistIfFormal(next);
}

function removeShot(index: number) {
  if (!workingJson.value) {
    return;
  }

  const next = cloneStoryboard(workingJson.value);
  next.shots.splice(index, 1);
  next.shots = next.shots.map((shot, shotIndex) => ({ ...shot, order: shotIndex + 1 }));
  next.updatedAt = new Date().toISOString();
  workingJson.value = next;
  persistIfFormal(next);
}

/** 拖拽重排:把 fromIndex 的镜头移到 toIndex 位置,重编 order 并持久化(P0 任务E)。 */
function reorderShots(fromIndex: number, toIndex: number) {
  if (!workingJson.value || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return;
  }
  const shots = workingJson.value.shots;
  if (fromIndex >= shots.length || toIndex >= shots.length) {
    return;
  }
  // 已有候选图/排版时,重排会让它们失效,需用户确认
  const hasCandidates = (props.snapshot.candidates ?? []).some((c) => shots.some((s) => s.id === c.shotId));
  if (hasCandidates && !window.confirm("调整镜头顺序后,已生成的候选图和排版将需要重新生成,是否继续?")) {
    return;
  }
  const next = cloneStoryboard(workingJson.value);
  const [moved] = next.shots.splice(fromIndex, 1);
  next.shots.splice(toIndex, 0, moved);
  next.shots = next.shots.map((shot, shotIndex) => ({ ...shot, order: shotIndex + 1 }));
  next.updatedAt = new Date().toISOString();
  workingJson.value = next;
  persistIfFormal(next);
}

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragOver(event: DragEvent, index: number) {
  if (dragIndex.value === null || dragIndex.value === index) {
    return;
  }
  event.preventDefault();
  dragOverIndex.value = index;
}

function onDrop(index: number) {
  if (dragIndex.value === null) {
    return;
  }
  reorderShots(dragIndex.value, index);
  dragIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd() {
  dragIndex.value = null;
  dragOverIndex.value = null;
}

function persistIfFormal(storyboardJson: StoryboardJson) {
  const formal = formalStoryboard.value;
  const pending = pendingStoryboard.value;
  if (pending && activeStoryboard.value?.status === "pending_confirmation") {
    emit("savePendingStoryboard", {
      chapterId: pending.chapterId,
      storyboardJson,
    });
    return;
  }

  if (!formal) {
    return;
  }

  emit("updateStoryboard", {
    chapterId: formal.chapterId,
    storyboardJson,
  });
}

function getStoryboardStatusLabel(chapter: ChapterListItem) {
  if (!props.snapshot.storyStructure && chapter.id === currentChapterId.value) {
    return "需结构";
  }
  if (chapter.storyboardStatus === "pending_confirmation" || pendingStoryboard.value?.chapterId === chapter.id) {
    return "待确认";
  }
  if (chapter.storyboardStatus === "storyboard_done" || chapter.status === "storyboard_done" || chapter.status === "images_done" || chapter.status === "layout_done" || chapter.status === "exported") {
    return "已完成";
  }
  if (chapter.status === "structured") {
    return "可生成";
  }
  return "未生成";
}

function getShotSceneName(sceneId: string | null) {
  if (!sceneId || !props.snapshot.storyStructure) {
    return "未关联场景";
  }

  return props.snapshot.storyStructure.structureJson.scenes.find((scene) => scene.id === sceneId)?.name ?? "未关联场景";
}

function cloneStoryboard(storyboard: StoryboardJson): StoryboardJson {
  return JSON.parse(JSON.stringify(storyboard)) as StoryboardJson;
}

function setStoryboardField(storyboard: StoryboardJson, key: string, value: string) {
  const [, indexText, ...fieldParts] = key.split(".");
  const index = Number(indexText);
  const shot = storyboard.shots[index] as unknown as Record<string, unknown> | undefined;
  if (!shot) {
    return;
  }

  let target = shot;
  for (const part of fieldParts.slice(0, -1)) {
    const nextTarget = target[part];
    if (typeof nextTarget !== "object" || nextTarget === null || Array.isArray(nextTarget)) {
      return;
    }
    target = nextTarget as Record<string, unknown>;
  }

  const field = fieldParts[fieldParts.length - 1];
  if (field) {
    target[field] = value;
    storyboard.updatedAt = new Date().toISOString();
  }
}

function createEmptyShot(order: number): StoryboardShot {
  return {
    id: `shot_${Date.now()}_${order}`,
    order,
    beatId: null,
    sceneId: null,
    characterIds: [],
    coreAction: "",
    emotion: "",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: {
      panelDescription: "",
      composition: "",
      dialogue: "",
      caption: "",
      panelRhythm: "normal",
    },
    motion: {
      visualDescription: "",
      compositionDesign: "",
      cameraMovement: "static",
      frameType: "atmosphere",
      durationMs: 2500,
      durationHint: "",
      voiceLines: [],
    },
    promptDraft: "",
    lockedCandidateId: null,
    status: "draft",
  };
}
</script>

<style scoped>
.storyboard-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 16px;
  overflow: hidden;
}

.storyboard-toolbar,
.storyboard-status-band,
.chapter-picker {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* Toolbar Style */
.storyboard-toolbar {
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(139, 92, 246, 0.12) !important;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.45) !important;
  padding: 12px 16px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}
html[data-theme="light"] .storyboard-toolbar {
  background: rgba(255, 255, 255, 0.8) !important;
  box-shadow: 0 4px 20px rgba(100, 116, 139, 0.03);
}

.chapter-picker {
  flex: 1;
  gap: 12px;
  color: #a78bfa;
}
html[data-theme="light"] .chapter-picker {
  color: #7c3aed;
}

.chapter-picker select {
  min-width: 220px;
  max-width: 420px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(10, 13, 20, 0.8) !important;
  color: #f8fbff;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.chapter-picker select:focus {
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}
html[data-theme="light"] .chapter-picker select {
  border-color: rgba(100, 116, 139, 0.15) !important;
  background: #ffffff !important;
  color: #1e293b !important;
}

.story-title {
  min-width: 0;
  overflow: hidden;
  color: #22c7a9;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(34, 199, 169, 0.08);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(34, 199, 169, 0.15);
}
html[data-theme="light"] .story-title {
  color: #0d9488;
  background: rgba(13, 148, 136, 0.06);
  border-color: rgba(13, 148, 136, 0.12);
}

/* Actions Style */
.primary-action,
.confirm-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border-radius: 9px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 900;
  transition: all 0.2s ease;
  cursor: pointer;
}
.primary-action:hover:not(:disabled),
.confirm-action:hover:not(:disabled) {
  transform: translateY(-1px);
}
.primary-action:active:not(:disabled),
.confirm-action:active:not(:disabled) {
  transform: translateY(0);
}

.primary-action {
  border: 1px solid rgba(139, 92, 246, 0.28) !important;
  background: rgba(139, 92, 246, 0.12) !important;
  color: #c4b5fd !important;
}
.primary-action:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.2) !important;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
}
html[data-theme="light"] .primary-action {
  border-color: rgba(124, 58, 237, 0.28) !important;
  background: rgba(124, 58, 237, 0.08) !important;
  color: #7c3aed !important;
}
html[data-theme="light"] .primary-action:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.14) !important;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
}

.confirm-action {
  border: 1px solid rgba(16, 185, 129, 0.28) !important;
  background: rgba(16, 185, 129, 0.12) !important;
  color: #a7f3d0 !important;
}
.confirm-action:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2) !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
}
html[data-theme="light"] .confirm-action {
  border-color: rgba(16, 185, 129, 0.3) !important;
  background: rgba(16, 185, 129, 0.08) !important;
  color: #065f46 !important;
}
html[data-theme="light"] .confirm-action:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.14) !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);
}

.primary-action:disabled,
.confirm-action:disabled {
  cursor: not-allowed;
  opacity: 0.4;
  transform: none !important;
  box-shadow: none !important;
}

/* Scroll Container */
.storyboard-scroll {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
}

/* Status Band */
.storyboard-status-band {
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(16, 185, 129, 0.18) !important;
  border-radius: 14px;
  background: rgba(16, 185, 129, 0.04) !important;
  padding: 14px 16px;
}
.storyboard-status-band.pending_confirmation {
  border-color: rgba(245, 158, 11, 0.24) !important;
  background: rgba(245, 158, 11, 0.04) !important;
}
html[data-theme="light"] .storyboard-status-band {
  border-color: rgba(16, 185, 129, 0.22) !important;
  background: rgba(16, 185, 129, 0.03) !important;
}
html[data-theme="light"] .storyboard-status-band.pending_confirmation {
  border-color: rgba(245, 158, 11, 0.28) !important;
  background: rgba(245, 158, 11, 0.03) !important;
}

.storyboard-status-band span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #10b981;
}
.storyboard-status-band.pending_confirmation span {
  color: #f59e0b;
}
html[data-theme="light"] .storyboard-status-band span {
  color: #059669;
}
html[data-theme="light"] .storyboard-status-band.pending_confirmation span {
  color: #d97706;
}

.storyboard-status-band strong {
  display: block;
  margin-top: 4px;
  color: #f8fbff;
  font-size: 16px;
  font-weight: 700;
}
html[data-theme="light"] .storyboard-status-band strong {
  color: #1e293b;
}

/* Storyboard Summary Card */
.storyboard-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.25) !important;
  padding: 14px 16px;
}
html[data-theme="light"] .storyboard-summary {
  border-color: rgba(100, 116, 139, 0.08) !important;
  background: #ffffff !important;
  box-shadow: 0 4px 24px rgba(100, 116, 139, 0.02);
}

.storyboard-summary span {
  color: #a78bfa;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
html[data-theme="light"] .storyboard-summary span {
  color: #7c3aed;
}

.storyboard-summary strong {
  display: block;
  margin-top: 4px;
  color: #f1f5f9;
  font-size: 15px;
  font-weight: 800;
}
html[data-theme="light"] .storyboard-summary strong {
  color: #1e293b;
}

.storyboard-summary p {
  max-width: 560px;
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
}
html[data-theme="light"] .storyboard-summary p {
  color: #475569;
}

/* Shot Card Styles */
.shot-list {
  display: grid;
  gap: 20px;
}

.shot-card {
  display: grid;
  gap: 16px;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.35) !important;
  padding: 20px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  border-left: 4px solid rgba(139, 92, 246, 0.5) !important;
  transition: gap 0.2s, padding 0.2s;
}
.shot-card.is-collapsed {
  gap: 0;
}

/* 镜头卡内容区:展开后给足内边距和子区间距,避免字段堆叠 */
.shot-card-body {
  display: grid;
  gap: 16px;
  padding: 14px 4px 4px;
}
html[data-theme="light"] .shot-card {
  border-color: rgba(100, 116, 139, 0.08) !important;
  background: #ffffff !important;
  box-shadow: 0 4px 24px rgba(100, 116, 139, 0.02);
  border-left-color: rgba(124, 58, 237, 0.6) !important;
}

.shot-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.15s;
  border-radius: 8px;
  margin: -4px -8px 0;
  padding: 4px 8px 12px;
}
.shot-card-head:hover {
  background: rgba(255, 255, 255, 0.02);
}
.shot-card.is-collapsed .shot-card-head {
  border-bottom: none;
  padding-bottom: 4px;
}
html[data-theme="light"] .shot-card-head {
  border-bottom-color: rgba(100, 116, 139, 0.06);
}

.shot-expand-toggle {
  color: #64748b;
  font-size: 14px;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.shot-expand-toggle.is-open {
  transform: rotate(180deg);
}

.shot-number {
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.12) !important;
  border: 1px solid rgba(139, 92, 246, 0.2) !important;
  color: #ddd6fe !important;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
html[data-theme="light"] .shot-number {
  background: rgba(124, 58, 237, 0.06) !important;
  border-color: rgba(124, 58, 237, 0.15) !important;
  color: #7c3aed !important;
}

.shot-thumb {
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(2, 6, 23, 0.48);
  display: grid;
  place-items: center;
  color: #64748b;
}

.shot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.shot-thumb.is-locked {
  border-color: rgba(34, 197, 94, 0.5);
}

.shot-thumb-lock {
  position: absolute;
  top: 2px;
  right: 2px;
  color: #22c55e;
  background: rgba(2, 6, 23, 0.7);
  border-radius: 3px;
  padding: 1px;
}

.shot-thumb-count {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 9px;
  font-weight: 900;
  color: #fff;
  background: rgba(2, 6, 23, 0.78);
  border-radius: 3px;
  padding: 1px 4px;
}

.shot-thumb.is-empty {
  color: #475569;
}

.drag-handle {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  cursor: grab;
  color: #475569;
  user-select: none;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}

.drag-handle:hover {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
}

.drag-handle:active {
  cursor: grabbing;
}
html[data-theme="light"] .drag-handle {
  color: #94a3b8;
}
html[data-theme="light"] .drag-handle:hover {
  color: #64748b;
  background: rgba(100, 116, 139, 0.08);
}

.shot-card.is-dragging {
  opacity: 0.4;
}

.shot-card.is-drag-over {
  border-top: 2px solid #22c7a9 !important;
}

.shot-head-text {
  flex: 1;
  display: grid;
  min-width: 0;
  gap: 4px;
}

.shot-head-text strong {
  overflow: hidden;
  color: #f1f5f9;
  font-size: 15px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-theme="light"] .shot-head-text strong {
  color: #1e293b;
}

.shot-head-text span {
  color: #94a3b8;
  font-size: 12px;
}
html[data-theme="light"] .shot-head-text span {
  color: #64748b;
}

/* Core grid and inputs */
.shot-core-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.shot-core-grid :deep(.editable-shot-field), .shot-core-grid :deep(.editable-field) {
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(139, 92, 246, 0.08);
  border-radius: 10px;
  padding: 12px 14px;
}
html[data-theme="light"] .shot-core-grid :deep(.editable-shot-field),
html[data-theme="light"] .shot-core-grid :deep(.editable-field) {
  background: rgba(240, 244, 250, 0.4);
  border-color: rgba(100, 116, 139, 0.06);
}

/* Editable field styling for Shot Workspace */
:deep(.editable-shot-field), :deep(.editable-field) {
  display: grid;
  gap: 6px;
  min-width: 0;
}

:deep(.editable-shot-label), :deep(.editable-field .editable-label) {
  color: #a78bfa !important;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: block;
}
html[data-theme="light"] :deep(.editable-shot-label), html[data-theme="light"] :deep(.editable-field .editable-label) {
  color: #7c3aed !important;
}

/* Column specific label styles to reflect the purple/teal colors */
.comic-column :deep(.editable-shot-label), .comic-column :deep(.editable-field .editable-label) {
  color: #c084fc !important;
}
html[data-theme="light"] .comic-column :deep(.editable-shot-label), html[data-theme="light"] .comic-column :deep(.editable-field .editable-label) {
  color: #7c3aed !important;
}

.motion-column :deep(.editable-shot-label), .motion-column :deep(.editable-field .editable-label) {
  color: #2dd4bf !important;
}
html[data-theme="light"] .motion-column :deep(.editable-shot-label), html[data-theme="light"] .motion-column :deep(.editable-field .editable-label) {
  color: #0d9488 !important;
}

:deep(.editable-shot-value), :deep(.editable-field .editable-value) {
  position: relative;
  min-width: 0;
  border-left: 2px solid rgba(139, 92, 246, 0.25) !important;
  background: rgba(139, 92, 246, 0.02) !important;
  border-radius: 0 4px 4px 0;
}
html[data-theme="light"] :deep(.editable-shot-value), html[data-theme="light"] :deep(.editable-field .editable-value) {
  border-left-color: rgba(124, 58, 237, 0.35) !important;
  background: rgba(124, 58, 237, 0.02) !important;
}

.comic-column :deep(.editable-shot-value), .comic-column :deep(.editable-field .editable-value) {
  border-left-color: rgba(168, 85, 247, 0.25) !important;
  background: rgba(168, 85, 247, 0.02) !important;
}
html[data-theme="light"] .comic-column :deep(.editable-shot-value), html[data-theme="light"] .comic-column :deep(.editable-field .editable-value) {
  border-left-color: rgba(147, 51, 234, 0.35) !important;
  background: rgba(147, 51, 234, 0.02) !important;
}

.motion-column :deep(.editable-shot-value), .motion-column :deep(.editable-field .editable-value) {
  border-left-color: rgba(13, 148, 136, 0.25) !important;
  background: rgba(13, 148, 136, 0.02) !important;
}
html[data-theme="light"] .motion-column :deep(.editable-shot-value), html[data-theme="light"] .motion-column :deep(.editable-field .editable-value) {
  border-left-color: rgba(13, 148, 136, 0.35) !important;
  background: rgba(13, 148, 136, 0.02) !important;
}

:deep(.editable-shot-value p), :deep(.editable-field .editable-value p) {
  margin: 0;
  min-height: 28px;
  color: #cbd5e1;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 8px 30px 8px 12px;
}
html[data-theme="light"] :deep(.editable-shot-value p), html[data-theme="light"] :deep(.editable-field .editable-value p) {
  color: #334155;
}

:deep(.editable-shot-value input),
:deep(.editable-shot-value textarea), :deep(.editable-field .editable-value textarea),
:deep(.editable-shot-value select), :deep(.editable-field .editable-value select) {
  width: 100%;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  border-radius: 6px;
  background: rgba(5, 9, 18, 0.7) !important;
  color: #f8fbff !important;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
:deep(.editable-shot-value textarea), :deep(.editable-field .editable-value textarea) {
  resize: vertical;
}
:deep(.editable-shot-value select), :deep(.editable-field .editable-value select) {
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #a78bfa 50%), linear-gradient(135deg, #a78bfa 50%, transparent 50%) !important;
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50% !important;
  background-size: 5px 5px, 5px 5px !important;
  background-repeat: no-repeat !important;
  padding-right: 26px;
}

:deep(.editable-shot-value input:focus),
:deep(.editable-shot-value textarea:focus), :deep(.editable-field .editable-value textarea:focus),
:deep(.editable-shot-value select:focus), :deep(.editable-field .editable-value select:focus) {
  border-color: rgba(139, 92, 246, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1) !important;
}

html[data-theme="light"] :deep(.editable-shot-value input),
html[data-theme="light"] :deep(.editable-shot-value textarea),
html[data-theme="light"] :deep(.editable-field .editable-value textarea),
html[data-theme="light"] :deep(.editable-shot-value select),
html[data-theme="light"] :deep(.editable-field .editable-value select) {
  background: #ffffff !important;
  color: #1e293b !important;
  border-color: rgba(124, 58, 237, 0.25) !important;
}
html[data-theme="light"] :deep(.editable-shot-value input:focus),
html[data-theme="light"] :deep(.editable-shot-value textarea:focus),
html[data-theme="light"] :deep(.editable-field .editable-value textarea:focus),
html[data-theme="light"] :deep(.editable-shot-value select:focus),
html[data-theme="light"] :deep(.editable-field .editable-value select:focus) {
  border-color: rgba(124, 58, 237, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.08) !important;
}

/* 配音台词只读列表 */
:deep(.voice-lines-list) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
:deep(.voice-lines-list li) {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.1);
  font-size: 12.5px;
  line-height: 1.6;
  color: #cbd5e1;
}
:deep(.voice-lines-list li strong) {
  color: #a78bfa;
  font-weight: 700;
}
:deep(.voice-lines-list li em) {
  color: #22d3ee;
  font-style: normal;
  font-size: 11px;
  opacity: 0.85;
}
html[data-theme="light"] :deep(.voice-lines-list li) {
  background: rgba(124, 58, 237, 0.06);
  color: #475569;
}
html[data-theme="light"] :deep(.voice-lines-list li strong) {
  color: #7c3aed;
}
html[data-theme="light"] :deep(.voice-lines-list li em) {
  color: #0891b2;
}

/* Specific input fields inside comic/motion columns */
.comic-column :deep(.editable-shot-value input),
.comic-column :deep(.editable-shot-value textarea), .comic-column :deep(.editable-field .editable-value textarea) {
  border-color: rgba(168, 85, 247, 0.3) !important;
}
.comic-column :deep(.editable-shot-value input:focus),
.comic-column :deep(.editable-shot-value textarea:focus), .comic-column :deep(.editable-field .editable-value textarea:focus) {
  border-color: rgba(168, 85, 247, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.1) !important;
}
html[data-theme="light"] .comic-column :deep(.editable-shot-value input),
html[data-theme="light"] .comic-column :deep(.editable-shot-value textarea), html[data-theme="light"] .comic-column :deep(.editable-field .editable-value textarea) {
  border-color: rgba(147, 51, 234, 0.25) !important;
}
html[data-theme="light"] .comic-column :deep(.editable-shot-value input:focus),
html[data-theme="light"] .comic-column :deep(.editable-shot-value textarea:focus), html[data-theme="light"] .comic-column :deep(.editable-field .editable-value textarea:focus) {
  border-color: rgba(147, 51, 234, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.08) !important;
}

.motion-column :deep(.editable-shot-value input),
.motion-column :deep(.editable-shot-value textarea), .motion-column :deep(.editable-field .editable-value textarea) {
  border-color: rgba(13, 148, 136, 0.3) !important;
}

/* 时长 number input 显式深色兜底(不依赖穿透) */
.shot-number-input {
  width: 100%;
  border: 1px solid rgba(13, 148, 136, 0.3) !important;
  border-radius: 6px;
  background-color: rgba(5, 9, 18, 0.7) !important;
  color: #f8fbff !important;
  padding: 7px 12px;
  font: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.shot-number-input:focus {
  border-color: rgba(13, 148, 136, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1) !important;
}
html[data-theme="light"] .shot-number-input {
  background-color: #ffffff !important;
  color: #1e293b !important;
  border-color: rgba(13, 148, 136, 0.25) !important;
}
.motion-column :deep(.editable-shot-value input:focus),
.motion-column :deep(.editable-shot-value textarea:focus), .motion-column :deep(.editable-field .editable-value textarea:focus) {
  border-color: rgba(13, 148, 136, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1) !important;
}
html[data-theme="light"] .motion-column :deep(.editable-shot-value input),
html[data-theme="light"] .motion-column :deep(.editable-shot-value textarea), html[data-theme="light"] .motion-column :deep(.editable-field .editable-value textarea) {
  border-color: rgba(13, 148, 136, 0.25) !important;
}
html[data-theme="light"] .motion-column :deep(.editable-shot-value input:focus),
html[data-theme="light"] .motion-column :deep(.editable-shot-value textarea:focus), html[data-theme="light"] .motion-column :deep(.editable-field .editable-value textarea:focus) {
  border-color: rgba(13, 148, 136, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.08) !important;
}

/* Edit pencil button */
:deep(.edit-field-btn) {
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04) !important;
  color: #a78bfa !important;
  cursor: pointer;
  opacity: 0 !important;
  transition: opacity 0.15s ease, background 0.15s ease;
}
:deep(.editable-shot-value:hover .edit-field-btn) {
  opacity: 1 !important;
}
:deep(.edit-field-btn:hover) {
  background: rgba(139, 92, 246, 0.15) !important;
  color: #c4b5fd !important;
}

html[data-theme="light"] :deep(.edit-field-btn) {
  border-color: rgba(100, 116, 139, 0.1) !important;
  background: rgba(0, 0, 0, 0.02) !important;
  color: #7c3aed !important;
}
html[data-theme="light"] :deep(.edit-field-btn:hover) {
  background: rgba(124, 58, 237, 0.08) !important;
  color: #6d28d9 !important;
}

/* Column specific edit button styles */
.comic-column :deep(.edit-field-btn) {
  color: #c084fc !important;
}
.comic-column :deep(.edit-field-btn:hover) {
  background: rgba(168, 85, 247, 0.15) !important;
  color: #e9d5ff !important;
}
html[data-theme="light"] .comic-column :deep(.edit-field-btn) {
  color: #9333ea !important;
}
html[data-theme="light"] .comic-column :deep(.edit-field-btn:hover) {
  background: rgba(147, 51, 234, 0.08) !important;
  color: #7e22ce !important;
}

.motion-column :deep(.edit-field-btn) {
  color: #2dd4bf !important;
}
.motion-column :deep(.edit-field-btn:hover) {
  background: rgba(13, 148, 136, 0.15) !important;
  color: #99f6e4 !important;
}
html[data-theme="light"] .motion-column :deep(.edit-field-btn) {
  color: #0d9488 !important;
}
html[data-theme="light"] .motion-column :deep(.edit-field-btn:hover) {
  background: rgba(13, 148, 136, 0.08) !important;
  color: #0f766e !important;
}

/* Trash actions */
.icon-action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: #94a3b8;
  cursor: pointer;
  width: 32px;
  height: 32px;
  transition: all 0.2s ease;
}
.icon-action:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}
html[data-theme="light"] .icon-action {
  border-color: rgba(100, 116, 139, 0.1);
  background: rgba(100, 116, 139, 0.02);
  color: #64748b;
}
html[data-theme="light"] .icon-action:hover {
  background: rgba(100, 116, 139, 0.08);
  color: #1e293b;
}

.icon-action.danger:hover {
  background: rgba(239, 68, 68, 0.15) !important;
  color: #fca5a5 !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}
html[data-theme="light"] .icon-action.danger:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  color: #dc2626 !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}

/* Two-column layout grid for Comic and Motion expressions */
.shot-expression-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.shot-expression {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  border: 1px solid rgba(139, 92, 246, 0.1) !important;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.28) !important;
  padding: 16px;
}
html[data-theme="light"] .shot-expression {
  background: rgba(240, 244, 250, 0.3) !important;
  border-color: rgba(100, 116, 139, 0.06) !important;
}

.comic-column {
  border-top: 3px solid rgba(139, 92, 246, 0.7) !important;
}
.motion-column {
  border-top: 3px solid rgba(13, 148, 136, 0.7) !important;
}

.expression-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.expression-heading span {
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.comic-column .expression-heading span {
  color: #c084fc;
}
html[data-theme="light"] .comic-column .expression-heading span {
  color: #7c3aed;
}
.motion-column .expression-heading span {
  color: #2dd4bf;
}
html[data-theme="light"] .motion-column .expression-heading span {
  color: #0d9488;
}

.expression-heading strong {
  color: #f1f5f9;
  font-size: 14px;
  font-weight: 800;
}
html[data-theme="light"] .expression-heading strong {
  color: #1e293b;
}

/* Add Shot Action button */
.add-shot-action {
  align-self: stretch;
  margin-bottom: 8px;
  border: 1px dashed rgba(139, 92, 246, 0.3) !important;
  background: rgba(139, 92, 246, 0.03) !important;
  color: #c4b5fd !important;
  border-radius: 12px;
  padding: 12px;
  height: auto;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.2s ease;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.add-shot-action:hover {
  background: rgba(139, 92, 246, 0.08) !important;
  border-color: rgba(139, 92, 246, 0.5) !important;
  color: #ffffff !important;
}
html[data-theme="light"] .add-shot-action {
  border-color: rgba(124, 58, 237, 0.25) !important;
  background: rgba(124, 58, 237, 0.02) !important;
  color: #7c3aed !important;
}
html[data-theme="light"] .add-shot-action:hover {
  background: rgba(124, 58, 237, 0.06) !important;
  color: #6d28d9 !important;
  border-color: rgba(124, 58, 237, 0.45) !important;
}

/* Empty State Card */
.storyboard-empty {
  display: grid;
  min-height: 320px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.35) !important;
  color: #94a3b8;
  text-align: center;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  flex: 1;
}
html[data-theme="light"] .storyboard-empty {
  border-color: rgba(100, 116, 139, 0.08) !important;
  background: #ffffff !important;
  color: #64748b;
  box-shadow: 0 4px 24px rgba(100, 116, 139, 0.02);
}

.storyboard-empty h2 {
  margin: 0;
  color: #f1f5f9;
  font-size: 18px;
  font-weight: 800;
}
html[data-theme="light"] .storyboard-empty h2 {
  color: #1e293b;
}

.storyboard-empty p {
  margin: 0;
  max-width: 360px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.7;
}
html[data-theme="light"] .storyboard-empty p {
  color: #64748b;
}

@media (max-width: 1180px) {
  .shot-expression-grid,
  .shot-core-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .storyboard-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .chapter-picker {
    align-items: stretch;
    flex-direction: column;
  }

  .chapter-picker select {
    width: 100%;
    max-width: none;
  }
}
</style>
