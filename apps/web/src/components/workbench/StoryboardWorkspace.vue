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

      <div class="storyboard-toolbar-actions">
        <span v-if="workingJson" class="shot-count-pill">{{ workingJson.shots.length }} 镜</span>
        <button class="secondary-action" type="button" :disabled="!workingJson || loading" @click="addShot">
          <Plus :size="15" />
          <span>新增镜头</span>
        </button>
        <button class="secondary-action" type="button" :disabled="!canGenerate || loading || dialogueSending" @click="requestGenerate">
          <RefreshCw :size="15" />
          <span>{{ hasStoryboard ? "重新生成" : "生成分镜" }}</span>
        </button>
        <button
          v-if="formalStoryboard && !pendingStoryboard"
          class="primary-action"
          type="button"
          :disabled="loading"
          @click="$emit('goPreflight')"
        >
          <span>进入出图准备</span>
          <ArrowRight :size="15" />
        </button>
      </div>
    </header>

    <div v-if="isSourceStale" class="source-stale-banner" data-testid="storyboard-db-versioning-status">
      <AlertTriangle :size="14" />
      <span>来源已变化：剧情结构有新版本，分镜需要重新生成或确认</span>
    </div>

    <div v-if="!snapshot.storyStructure" class="storyboard-empty">
      <Lock :size="22" />
      <h2>请先确认本章剧情结构</h2>
      <p>分镜会读取已确认的剧情结构，把剧情节拍拆成镜头卡。</p>
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

      <div class="shot-list">
        <article
          v-for="(shot, index) in workingJson.shots"
          :key="shot.id"
          class="shot-card"
          :class="{
            'is-dragging': dragIndex === index,
            'is-drag-over': dragOverIndex === index && dragIndex !== index,
          }"
          @dragover="onDragOver($event, index)"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
        >
          <div class="shot-frame" @click="openShot(shot.id)">
            <img
              v-if="shotThumbMap.get(shot.id)"
              class="shot-frame-img"
              :src="shotThumbMap.get(shot.id)!.url"
              :alt="`镜头 ${shot.order} 候选`"
              loading="lazy"
            />
            <span v-else class="shot-frame-num">{{ String(shot.order).padStart(2, "0") }}</span>
            <span v-if="shotThumbMap.get(shot.id)" class="shot-frame-order">{{ String(shot.order).padStart(2, "0") }}</span>
            <span
              class="drag-handle"
              title="拖拽调整顺序"
              draggable="true"
              @click.stop
              @dragstart="onDragStart(index)"
            ><GripVertical :size="15" /></span>
            <button class="icon-action danger shot-frame-delete" type="button" title="删除镜头" @click.stop="removeShot(index)">
              <Trash2 :size="13" />
            </button>
            <span v-if="shotThumbMap.get(shot.id)?.locked" class="shot-frame-flag is-locked">
              <Lock :size="10" />
              <span>已定稿</span>
            </span>
            <span v-else-if="(shotThumbMap.get(shot.id)?.count ?? 0) > 1" class="shot-frame-flag">{{ shotThumbMap.get(shot.id)?.count }} 张候选</span>
          </div>
          <div class="shot-card-head" @click="openShot(shot.id)">
            <div class="shot-head-text">
              <strong>{{ shot.coreAction || shot.comic.panelDescription || "未填写镜头动作" }}</strong>
              <span>{{ getShotSceneName(shot.sceneId) }} · {{ shot.emotion || "未填写情绪" }}</span>
              <div v-if="getShotOptionLabel(SHOT_TYPE_OPTIONS, shot.shotType) || getShotOptionLabel(CAMERA_ANGLE_OPTIONS, shot.cameraAngle)" class="shot-head-tags">
                <span v-if="getShotOptionLabel(SHOT_TYPE_OPTIONS, shot.shotType)" class="shot-tag">{{ getShotOptionLabel(SHOT_TYPE_OPTIONS, shot.shotType) }}</span>
                <span v-if="getShotOptionLabel(CAMERA_ANGLE_OPTIONS, shot.cameraAngle)" class="shot-tag">{{ getShotOptionLabel(CAMERA_ANGLE_OPTIONS, shot.cameraAngle) }}</span>
              </div>
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

  <Teleport to="body">
    <div v-if="activeShot && activeShotIndex >= 0 && workingJson" class="shot-modal-backdrop" @click.self="closeShot">
      <section class="shot-modal" role="dialog" aria-modal="true" :aria-label="`镜头 ${activeShot.order} 编辑`">
        <header class="shot-modal-header">
          <div class="shot-modal-title">
            <span v-if="shotThumbMap.get(activeShot.id)" class="shot-modal-thumb">
              <img :src="shotThumbMap.get(activeShot.id)!.url" :alt="`镜头 ${activeShot.order} 候选`" />
            </span>
            <span class="shot-modal-num">{{ String(activeShot.order).padStart(2, "0") }}</span>
            <div class="shot-modal-title-text">
              <strong>{{ activeShot.coreAction || activeShot.comic.panelDescription || "未填写镜头动作" }}</strong>
              <span>{{ getShotSceneName(activeShot.sceneId) }} · {{ activeShot.emotion || "未填写情绪" }}</span>
            </div>
          </div>
          <div class="shot-modal-actions">
            <button class="shot-modal-nav" type="button" title="上一个镜头" :disabled="activeShotIndex <= 0" @click="goSiblingShot(-1)">‹</button>
            <span class="shot-modal-position">{{ activeShotIndex + 1 }} / {{ workingJson.shots.length }}</span>
            <button class="shot-modal-nav" type="button" title="下一个镜头" :disabled="activeShotIndex >= workingJson.shots.length - 1" @click="goSiblingShot(1)">›</button>
            <button class="shot-modal-nav is-danger" type="button" title="删除镜头" :disabled="loading" @click="removeShot(activeShotIndex); closeShot()">
              <Trash2 :size="15" />
            </button>
            <button class="shot-modal-nav" type="button" aria-label="关闭镜头编辑" @click="closeShot">
              <X :size="17" />
            </button>
          </div>
        </header>

        <div class="shot-modal-body">
          <div class="shot-core-grid">
            <EditableField :field-key="`shots.${activeShotIndex}.coreAction`" label="核心动作" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.coreAction" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`shots.${activeShotIndex}.emotion`" label="情绪" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.emotion" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`shots.${activeShotIndex}.shotType`" label="景别" :value="activeShot.shotType" :options="SHOT_TYPE_OPTIONS" @commit="commitSelectField" />
            <EditableField :field-key="`shots.${activeShotIndex}.cameraAngle`" label="机位" :value="activeShot.cameraAngle" :options="CAMERA_ANGLE_OPTIONS" @commit="commitSelectField" />
          </div>

          <div class="shot-expression-grid">
            <section class="shot-expression comic-column">
              <div class="expression-heading">
                <span>漫画画格</span>
              </div>
              <EditableField :field-key="`shots.${activeShotIndex}.comic.panelDescription`" label="画面描述" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.comic.panelDescription" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${activeShotIndex}.comic.composition`" label="构图" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.comic.composition" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${activeShotIndex}.comic.dialogue`" label="对白" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.comic.dialogue" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${activeShotIndex}.comic.caption`" label="旁白" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.comic.caption" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${activeShotIndex}.comic.panelRhythm`" label="画格节奏" :value="activeShot.comic.panelRhythm" :options="PANEL_RHYTHM_OPTIONS" @commit="commitSelectField" />
            </section>

            <section class="shot-expression motion-column">
              <div class="expression-heading">
                <span>漫剧镜头</span>
              </div>
              <EditableField :field-key="`shots.${activeShotIndex}.motion.visualDescription`" label="画面描述" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.motion.visualDescription" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${activeShotIndex}.motion.compositionDesign`" label="构图设计" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.motion.compositionDesign" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`shots.${activeShotIndex}.motion.cameraMovement`" label="运镜调度" :value="activeShot.motion.cameraMovement" :options="CAMERA_MOVEMENT_OPTIONS" @commit="commitSelectField" />
              <EditableField :field-key="`shots.${activeShotIndex}.motion.frameType`" label="镜头类型" :value="activeShot.motion.frameType" :options="FRAME_TYPE_OPTIONS" @commit="commitSelectField" />
              <div class="editable-shot-field">
                <span class="editable-shot-label">时长(毫秒)</span>
                <div class="editable-shot-value">
                  <input
                    type="number"
                    class="shot-number-input"
                    :value="activeShot.motion.durationMs"
                    min="0"
                    step="100"
                    @change="commitSelectField(`shots.${activeShotIndex}.motion.durationMs`, ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
              <EditableField :field-key="`shots.${activeShotIndex}.motion.durationHint`" label="时长说明" :editing-key="editingKey" :editing-value="editingValue" :value="activeShot.motion.durationHint" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <div class="editable-shot-field">
                <span class="editable-shot-label">配音台词</span>
                <div class="editable-shot-value">
                  <ul v-if="activeShot.motion.voiceLines.length > 0" class="voice-lines-list">
                    <li v-for="(voiceLine, lineIndex) in activeShot.motion.voiceLines" :key="lineIndex">
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
      </section>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="confirmImpactOpen" class="storyboard-confirm-backdrop" @click.self="closeConfirmImpact">
      <section class="storyboard-confirm-modal" role="dialog" aria-modal="true" aria-label="确认新分镜影响">
        <header>
          <div>
            <span>切换正式分镜</span>
            <h2>确认采用这版新分镜？</h2>
          </div>
          <button type="button" aria-label="关闭分镜确认" :disabled="loading" @click="closeConfirmImpact"><X :size="20" /></button>
        </header>
        <p>确认后，这版待确认分镜会成为当前正式分镜。已有制作成果不会删除，但不能继续冒充新分镜的当前结果。</p>
        <div class="storyboard-impact-grid">
          <div><span>已确认出图准备</span><strong>{{ snapshot.imagePreflight ? "1 份" : "无" }}</strong></div>
          <div><span>已有候选图</span><strong>{{ downstreamCandidateCount }} 张</strong></div>
          <div><span>当前定稿图</span><strong>{{ downstreamLockCount }} 张</strong></div>
          <div><span>排版 / 导出</span><strong>{{ downstreamLayoutExportCount }} 份</strong></div>
        </div>
        <p class="storyboard-impact-warning">
          <AlertTriangle :size="17" />
          <span>旧候选图、排版和导出会保留为历史；出图准备将显示“来源已更新”，需要重新确认后才能生成新候选图。</span>
        </p>
        <footer>
          <button class="secondary-action" type="button" :disabled="loading" @click="closeConfirmImpact">继续使用旧分镜</button>
          <button class="primary-action" type="button" :disabled="loading" @click="commitPendingStoryboard">
            <CheckCircle2 :size="15" />
            <span>确认切换到新分镜</span>
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertTriangle, ArrowRight, CheckCircle2, GripVertical, Lock, PanelsTopLeft, Plus, RefreshCw, Trash2, X } from "lucide-vue-next";
import type { ChapterListItem, DialogueThread, StoryboardJson, StoryboardShot, WorkbenchCandidate, WorkbenchSnapshot } from "@airoaming/shared";
import { api } from "../../services/api";
import EditableField from "./EditableField.vue";
import {
  CAMERA_ANGLE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  FRAME_TYPE_OPTIONS,
  PANEL_RHYTHM_OPTIONS,
  SHOT_TYPE_OPTIONS,
  type ShotSelectOption,
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
  goPreflight: [];
}>();

const editingKey = ref<string | null>(null);
const editingValue = ref("");
const workingJson = ref<StoryboardJson | null>(null);
const workingSourceKey = ref("");
const activeShotId = ref<string | null>(null);
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const confirmImpactOpen = ref(false);

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
  const currentCandidateIdByShot = new Map(
    props.snapshot.shots.map((shot) => [shot.id, shot.lockedCandidateId]),
  );
  for (const [shotId, list] of byShot) {
    const currentCandidateId = currentCandidateIdByShot.get(shotId);
    const locked = list.find((candidate) => candidate.id === currentCandidateId);
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
const downstreamCandidateCount = computed(() => props.snapshot.candidates.filter((candidate) => !candidate.chapterId || candidate.chapterId === currentChapterId.value).length);
const downstreamLockCount = computed(() => props.snapshot.candidateSources?.candidateLockSet.entries.length
  ?? props.snapshot.shots.filter((shot) => Boolean(shot.lockedCandidateId)).length);
const downstreamLayoutExportCount = computed(() => Number(Boolean(props.snapshot.candidateSources?.currentLayout ?? props.snapshot.chapterLayout))
  + Number(Boolean(props.snapshot.candidateSources?.currentExport)));
const hasDownstreamImpact = computed(() => Boolean(
  formalStoryboard.value
  && (props.snapshot.imagePreflight
    || downstreamCandidateCount.value > 0
    || downstreamLockCount.value > 0
    || downstreamLayoutExportCount.value > 0),
));
const canGenerate = computed(() => Boolean(currentChapter.value && props.snapshot.storyStructure && currentChapter.value.status !== "draft" && currentChapter.value.status !== "script_done"));
const isSourceStale = computed(() =>
  props.snapshot.workflow.steps.find((item) => item.key === "storyboard")?.status === "needs_update",
);

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
  emit("generateStoryboard", { chapterId: chapter.id, regenerate });
}

function confirmPendingStoryboard() {
  if (hasDownstreamImpact.value) {
    confirmImpactOpen.value = true;
    return;
  }
  commitPendingStoryboard();
}

function closeConfirmImpact() {
  if (!props.loading) {
    confirmImpactOpen.value = false;
  }
}

function commitPendingStoryboard() {
  const pending = pendingStoryboard.value;
  if (!pending || !workingJson.value) {
    return;
  }

  confirmImpactOpen.value = false;
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

const activeShotIndex = computed(() => {
  if (!activeShotId.value || !workingJson.value) {
    return -1;
  }
  return workingJson.value.shots.findIndex((shot) => shot.id === activeShotId.value);
});
const activeShot = computed(() => (activeShotIndex.value >= 0 ? workingJson.value?.shots[activeShotIndex.value] ?? null : null));

function openShot(shotId: string) {
  activeShotId.value = shotId;
}

function closeShot() {
  activeShotId.value = null;
}

function goSiblingShot(delta: number) {
  if (!workingJson.value || activeShotIndex.value < 0) {
    return;
  }
  const nextIndex = activeShotIndex.value + delta;
  const next = workingJson.value.shots[nextIndex];
  if (next) {
    activeShotId.value = next.id;
  }
}

watch(activeShotId, (shotId) => {
  if (shotId) {
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onShotModalKeydown);
  } else {
    document.body.style.overflow = "";
    window.removeEventListener("keydown", onShotModalKeydown);
  }
});

function onShotModalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeShot();
  }
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

function getShotOptionLabel(options: ShotSelectOption[], value: string) {
  if (!value) {
    return "";
  }

  return options.find((option) => option.value === value)?.label ?? "";
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
.secondary-action,
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
.secondary-action:hover:not(:disabled),
.confirm-action:hover:not(:disabled) {
  transform: translateY(-1px);
}
.primary-action:active:not(:disabled),
.secondary-action:active:not(:disabled),
.confirm-action:active:not(:disabled) {
  transform: translateY(0);
}

.secondary-action {
  border: 1px solid rgba(148, 163, 184, 0.22) !important;
  background: rgba(148, 163, 184, 0.08) !important;
  color: #b6c2d8 !important;
}
.secondary-action:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.14) !important;
}
html[data-theme="light"] .secondary-action {
  border-color: rgba(100, 116, 139, 0.25) !important;
  background: rgba(100, 116, 139, 0.06) !important;
  color: #475569 !important;
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
.secondary-action:disabled,
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

/* Shot Card Styles */
.shot-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1200px) {
  .shot-list {
    grid-template-columns: 1fr;
  }
}

.shot-card {
  display: grid;
  gap: 0;
  border: 1px solid rgba(139, 92, 246, 0.14);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.35);
  overflow: hidden;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}
.shot-card:hover {
  border-color: rgba(139, 92, 246, 0.38);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(139, 92, 246, 0.12);
  transform: translateY(-2px);
}
.shot-card.is-dragging {
  opacity: 0.55;
}
.shot-card.is-drag-over {
  border-color: rgba(52, 211, 153, 0.55);
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.22);
}
html[data-theme="light"] .shot-card {
  border-color: rgba(100, 116, 139, 0.14);
  background: #ffffff;
  box-shadow: 0 4px 18px rgba(100, 116, 139, 0.06);
}

/* 16:9 胶片画框:有候选图显示图,无图显示镜头号占位 */
.shot-frame {
  position: relative;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  background:
    radial-gradient(240px 120px at 70% 15%, rgba(139, 92, 246, 0.14), transparent 65%),
    rgba(2, 6, 23, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  overflow: hidden;
}
html[data-theme="light"] .shot-frame {  background:
    radial-gradient(240px 120px at 70% 15%, rgba(124, 58, 237, 0.08), transparent 65%),
    #f1f5f9;
  border-bottom-color: rgba(100, 116, 139, 0.1);
}

.shot-frame-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.shot-frame-num {
  color: rgba(167, 139, 250, 0.34);
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 0.06em;
  user-select: none;
}
html[data-theme="light"] .shot-frame-num {
  color: rgba(124, 58, 237, 0.28);
}

.shot-frame-order {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(2, 6, 23, 0.72);
  color: #ddd6fe;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  backdrop-filter: blur(6px);
}

.shot-frame .drag-handle {
  position: absolute;
  top: 8px;
  right: 42px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.72);
  color: #94a3b8;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  backdrop-filter: blur(6px);
}
.shot-frame:hover .drag-handle,
.shot-frame:hover .shot-frame-delete {
  opacity: 1;
}

.shot-frame-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  border: none;
  background: rgba(2, 6, 23, 0.72);
  color: #94a3b8;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
  backdrop-filter: blur(6px);
}
.shot-frame-delete:hover {
  background: rgba(127, 29, 29, 0.85);
  color: #fca5a5;
}

.shot-frame-flag {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.72);
  color: #cbd5e1;
  font-size: 10.5px;
  font-weight: 600;
  backdrop-filter: blur(6px);
}
.shot-frame-flag.is-locked {
  color: #4ade80;
}

/* 镜头编辑弹窗 */
.shot-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(4, 8, 18, 0.72);
  backdrop-filter: blur(6px);
  padding: 24px;
}

.shot-modal {
  display: flex;
  flex-direction: column;
  width: min(1060px, 100%);
  max-height: 88vh;
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 16px;
  background: #10162a;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(139, 92, 246, 0.08);
  overflow: hidden;
}
html[data-theme="light"] .shot-modal {
  background: #ffffff;
  border-color: rgba(100, 116, 139, 0.2);
}

.shot-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
html[data-theme="light"] .shot-modal-header {
  border-bottom-color: rgba(100, 116, 139, 0.12);
}

.shot-modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.shot-modal-num {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.16);
  color: #c4b5fd;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.shot-modal-thumb {
  flex-shrink: 0;
  width: 76px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.shot-modal-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shot-modal-title-text {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.shot-modal-title-text strong {
  color: #f1f5f9;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shot-modal-title-text span {
  color: #7c86a0;
  font-size: 12px;
}
html[data-theme="light"] .shot-modal-title-text strong {
  color: #1e293b;
}

.shot-modal-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.shot-modal-position {
  min-width: 44px;
  text-align: center;
  color: #7c86a0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.shot-modal-nav {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.shot-modal-nav:hover:not(:disabled) {
  border-color: rgba(139, 92, 246, 0.4);
  color: #e2e8f0;
  background: rgba(139, 92, 246, 0.1);
}
.shot-modal-nav.is-danger:hover:not(:disabled) {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(127, 29, 29, 0.3);
  color: #fca5a5;
}
.shot-modal-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
html[data-theme="light"] .shot-modal-nav {
  border-color: rgba(100, 116, 139, 0.16);
  color: #64748b;
}

.shot-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 16px;
  padding: 18px;
}

/* 镜头卡头部(画框下方文字区) */
.shot-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px 13px;
  cursor: pointer;
}

.shot-head-text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
}
.shot-head-text strong {
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.shot-head-text > span {
  color: #7c86a0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
html[data-theme="light"] .shot-head-text strong {
  color: #1e293b;
}
html[data-theme="light"] .shot-head-text > span {
  color: #64748b;
}

.shot-head-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.shot-tag {
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.1);
  color: #c4b5fd;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
}
html[data-theme="light"] .shot-tag {
  border-color: rgba(124, 58, 237, 0.18);
  background: rgba(124, 58, 237, 0.06);
  color: #6d28d9;
}

.shot-count-pill {
  align-self: center;
  border: 1px solid rgba(139, 92, 246, 0.24);
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.1);
  color: #c4b5fd;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
}
html[data-theme="light"] .shot-count-pill {
  border-color: rgba(124, 58, 237, 0.2);
  background: rgba(124, 58, 237, 0.07);
  color: #6d28d9;
}

.storyboard-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drag-handle:active {
  cursor: grabbing;
}
html[data-theme="light"] .drag-handle {
  color: #94a3b8;
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

.storyboard-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(8px);
}

.storyboard-confirm-modal {
  width: min(620px, 100%);
  display: grid;
  gap: 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: #111827;
  padding: 22px;
  color: #e2e8f0;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}

.storyboard-confirm-modal header,
.storyboard-confirm-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.storyboard-confirm-modal header span {
  color: #a78bfa;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.storyboard-confirm-modal h2,
.storyboard-confirm-modal p {
  margin: 0;
}

.storyboard-confirm-modal h2 {
  margin-top: 4px;
  font-size: 20px;
}

.storyboard-confirm-modal header > button {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 9px;
  background: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
  cursor: pointer;
}

.storyboard-impact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.storyboard-impact-grid > div {
  display: grid;
  gap: 5px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.06);
  padding: 12px 14px;
}

.storyboard-impact-grid span {
  color: #94a3b8;
  font-size: 12px;
}

.storyboard-impact-grid strong {
  color: #f8fafc;
  font-size: 17px;
}

.storyboard-impact-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border: 1px solid rgba(245, 158, 11, 0.24);
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.08);
  padding: 12px 14px;
  color: #fcd34d;
  line-height: 1.65;
}

.storyboard-impact-warning svg {
  flex: 0 0 auto;
  margin-top: 3px;
}

.storyboard-confirm-modal footer {
  justify-content: flex-end;
}

html[data-theme="light"] .storyboard-confirm-modal {
  border-color: rgba(100, 116, 139, 0.18);
  background: #ffffff;
  color: #334155;
}

html[data-theme="light"] .storyboard-impact-grid > div {
  border-color: rgba(100, 116, 139, 0.12);
  background: #f8fafc;
}

html[data-theme="light"] .storyboard-impact-grid strong {
  color: #0f172a;
}

@media (max-width: 640px) {
  .storyboard-impact-grid {
    grid-template-columns: 1fr;
  }

  .storyboard-confirm-modal footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }
}
</style>
