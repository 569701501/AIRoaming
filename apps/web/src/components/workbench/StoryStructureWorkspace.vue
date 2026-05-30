<template>
  <section class="structure-workspace" aria-label="剧情结构">
    <header class="structure-toolbar">
      <div class="chapter-picker">
        <FileText :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getStructureStatusLabel(chapter) }}
          </option>
        </select>
        <span v-if="snapshot.project.storyTitle" class="story-title">{{ snapshot.project.storyTitle }}</span>
      </div>

      <button class="primary-action" type="button" :disabled="!canGenerate || loading || dialogueSending" @click="requestGenerate">
        <RefreshCw :size="15" />
        <span>{{ hasStructure ? "重新生成" : "生成剧情结构" }}</span>
      </button>
    </header>

    <div v-if="currentChapter?.status === 'draft'" class="structure-empty">
      <Lock :size="22" />
      <h2>请先完成本章剧本</h2>
      <p>当前章节还是草稿状态，剧情结构会在剧本完成后生成。</p>
    </div>

    <div v-else-if="activeStructure" class="structure-scroll">
      <div class="structure-status-band" :class="activeStructure.status">
        <div>
          <span>{{ activeStructure.status === "pending_confirmation" ? "待确认预览" : getCurrentStatusLabel() }}</span>
          <strong>{{ activeStructure.structureJson.chapterTitle }}</strong>
        </div>
        <button
          v-if="activeStructure.status === 'pending_confirmation'"
          class="confirm-action"
          type="button"
          :disabled="loading"
          @click="confirmPendingStructure"
        >
          <CheckCircle2 :size="15" />
          <span>确认结构</span>
        </button>
      </div>

      <section class="structure-section">
        <div class="section-heading">
          <span>摘要</span>
          <h2>本章方向</h2>
        </div>
        <EditableBlock
          field-key="synopsis"
          label="本章摘要"
          :editable="canEdit"
          :editing-key="editingKey"
          :editing-value="editingValue"
          :value="structureJson.synopsis"
          multiline
          @start="startEditing"
          @input="editingValue = $event"
          @commit="commitField"
        />
        <div class="direction-grid">
          <EditableBlock
            field-key="direction.logline"
            label="一句话梗概"
            :editable="canEdit"
            :editing-key="editingKey"
            :editing-value="editingValue"
            :value="structureJson.direction.logline"
            @start="startEditing"
            @input="editingValue = $event"
            @commit="commitField"
          />
          <EditableBlock
            field-key="direction.chapterGoal"
            label="本章目标"
            :editable="canEdit"
            :editing-key="editingKey"
            :editing-value="editingValue"
            :value="structureJson.direction.chapterGoal"
            @start="startEditing"
            @input="editingValue = $event"
            @commit="commitField"
          />
          <EditableBlock
            field-key="direction.coreConflict"
            label="核心冲突"
            :editable="canEdit"
            :editing-key="editingKey"
            :editing-value="editingValue"
            :value="structureJson.direction.coreConflict"
            @start="startEditing"
            @input="editingValue = $event"
            @commit="commitField"
          />
          <EditableBlock
            field-key="direction.emotionalArc"
            label="情绪走向"
            :editable="canEdit"
            :editing-key="editingKey"
            :editing-value="editingValue"
            :value="structureJson.direction.emotionalArc"
            @start="startEditing"
            @input="editingValue = $event"
            @commit="commitField"
          />
          <EditableBlock
            field-key="direction.endingHook"
            label="结尾钩子"
            :editable="canEdit"
            :editing-key="editingKey"
            :editing-value="editingValue"
            :value="structureJson.direction.endingHook"
            @start="startEditing"
            @input="editingValue = $event"
            @commit="commitField"
          />
        </div>
      </section>

      <section class="structure-section">
        <div class="section-heading">
          <span>本章结构卡</span>
          <h2>角色</h2>
        </div>
        <div class="entity-grid">
          <article v-for="(character, index) in structureJson.characters" :key="character.id" class="entity-item">
            <strong>{{ character.name }}</strong>
            <EditableBlock :field-key="`characters.${index}.role`" label="职能" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.role" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableBlock :field-key="`characters.${index}.motivation`" label="动机" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.motivation" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableBlock :field-key="`characters.${index}.relationship`" label="关系" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.relationship" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableBlock :field-key="`characters.${index}.visualTraits`" label="视觉特征" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.visualTraits" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
          </article>
        </div>
      </section>

      <section class="structure-section">
        <div class="section-heading">
          <span>本章结构卡</span>
          <h2>场景</h2>
        </div>
        <div class="entity-grid">
          <article v-for="(scene, index) in structureJson.scenes" :key="scene.id" class="entity-item">
            <strong>{{ scene.name }}</strong>
            <EditableBlock :field-key="`scenes.${index}.location`" label="地点" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.location" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableBlock :field-key="`scenes.${index}.timeOfDay`" label="时间" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.timeOfDay" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableBlock :field-key="`scenes.${index}.atmosphere`" label="氛围" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.atmosphere" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableBlock :field-key="`scenes.${index}.purpose`" label="剧情作用" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.purpose" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
          </article>
        </div>
      </section>

      <section class="structure-section">
        <div class="section-heading">
          <span>关键事件</span>
          <h2>剧情节拍</h2>
        </div>
        <div class="beat-list">
          <article v-for="(beat, index) in structureJson.beats" :key="beat.id" class="beat-item">
            <div class="beat-order">{{ beat.order }}</div>
            <div class="beat-content">
              <strong>{{ beat.title }}</strong>
              <span>{{ getBeatSceneName(beat.sceneId) }}</span>
              <EditableBlock :field-key="`beats.${index}.summary`" label="事件" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.summary" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableBlock :field-key="`beats.${index}.conflict`" label="冲突" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.conflict" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableBlock :field-key="`beats.${index}.visualFocus`" label="画面重点" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.visualFocus" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableBlock :field-key="`beats.${index}.outcome`" label="结果" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.outcome" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-else class="structure-empty">
      <FileText :size="22" />
      <h2>当前章还没有剧情结构</h2>
      <p>左侧对话框请求生成后，这里会先显示待确认预览。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, type PropType } from "vue";
import { CheckCircle2, FileText, Lock, PencilLine, RefreshCw } from "lucide-vue-next";
import type { ChapterListItem, ChapterStoryStructure, DialogueThread, StoryStructureJson, WorkbenchSnapshot } from "@airoaming/shared";

const EditableBlock = defineComponent({
  props: {
    fieldKey: { type: String, required: true },
    label: { type: String, required: true },
    value: { type: String, required: true },
    editingKey: { type: String as PropType<string | null>, default: null },
    editingValue: { type: String, default: "" },
    editable: { type: Boolean, default: false },
    multiline: { type: Boolean, default: false },
  },
  emits: ["start", "input", "commit"],
  setup(props, { emit }) {
    return () => {
      const isEditing = props.editingKey === props.fieldKey;
      return h("div", { class: "editable-field" }, [
        h("span", { class: "editable-label" }, props.label),
        h("div", { class: "editable-value" }, [
          isEditing
            ? h(props.multiline ? "textarea" : "input", {
                value: props.editingValue,
                rows: props.multiline ? 3 : undefined,
                onInput: (event: Event) => emit("input", (event.target as HTMLInputElement | HTMLTextAreaElement).value),
                onBlur: () => emit("commit", props.fieldKey),
                onKeydown: (event: KeyboardEvent) => {
                  if (!props.multiline && event.key === "Enter") {
                    (event.target as HTMLInputElement).blur();
                  }
                },
              })
            : h("p", props.value || "未填写"),
          props.editable && !isEditing
            ? h("button", {
                type: "button",
                title: "编辑",
                class: "edit-field-btn",
                onClick: () => emit("start", props.fieldKey, props.value),
              }, [h(PencilLine, { size: 13 })])
            : null,
        ]),
      ]);
    };
  },
});

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  dialogueThread: DialogueThread | null;
  loading: boolean;
  dialogueSending: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateStructure: [payload: { chapterId: string; regenerate: boolean }];
  confirmStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  updateStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
}>();

const editingKey = ref<string | null>(null);
const editingValue = ref("");

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const formalStructure = computed(() => props.snapshot.storyStructure);
const pendingStructure = computed(() => {
  const chapterId = currentChapterId.value;
  if (!chapterId) {
    return null;
  }

  const result = [...(props.dialogueThread?.toolResults ?? [])]
    .reverse()
    .find((item) => item.tool === "generate_story_structure"
      && item.status === "needs_user_confirmation"
      && item.storyStructure?.chapterId === chapterId
      && item.storyStructure.status === "pending_confirmation");
  if (
    result?.storyStructure
    && formalStructure.value?.chapterId === chapterId
    && Date.parse(formalStructure.value.updatedAt) >= Date.parse(result.storyStructure.createdAt)
  ) {
    return null;
  }
  return result?.storyStructure ?? null;
});
const activeStructure = computed(() => pendingStructure.value ?? formalStructure.value);
const structureJson = computed(() => activeStructure.value?.structureJson ?? createEmptyStructure());
const hasStructure = computed(() => Boolean(pendingStructure.value || formalStructure.value));
const canGenerate = computed(() => Boolean(currentChapter.value && currentChapter.value.status !== "draft"));
const canEdit = computed(() => activeStructure.value?.status === "structured");

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

  const regenerate = chapter.status !== "script_done" || Boolean(formalStructure.value);
  if (regenerate && !window.confirm("重新生成剧情结构会影响后续分镜、候选图和排版，确认继续吗？")) {
    return;
  }

  emit("generateStructure", { chapterId: chapter.id, regenerate });
}

function confirmPendingStructure() {
  const pending = pendingStructure.value;
  if (!pending) {
    return;
  }

  emit("confirmStructure", {
    chapterId: pending.chapterId,
    structureJson: pending.structureJson,
  });
}

function startEditing(key: string, value: string) {
  editingKey.value = key;
  editingValue.value = value;
}

function commitField(key: string) {
  if (editingKey.value !== key || !formalStructure.value) {
    editingKey.value = null;
    return;
  }

  const next = cloneStructure(formalStructure.value.structureJson);
  setStructureField(next, key, editingValue.value);
  editingKey.value = null;
  editingValue.value = "";
  emit("updateStructure", {
    chapterId: formalStructure.value.chapterId,
    structureJson: next,
  });
}

function getBeatSceneName(sceneId: string | null) {
  if (!sceneId) {
    return "未关联场景";
  }

  return structureJson.value.scenes.find((scene) => scene.id === sceneId)?.name ?? "未关联场景";
}

function getCurrentStatusLabel() {
  if (currentChapter.value && formalStructure.value && isStructureStale(currentChapter.value, formalStructure.value)) {
    return "需更新";
  }

  return "已完成";
}

function getStructureStatusLabel(chapter: ChapterListItem) {
  if (chapter.status === "draft") {
    return "未生成";
  }
  if (pendingStructure.value?.chapterId === chapter.id) {
    return "待确认";
  }
  if (chapter.currentStoryVersionId) {
    if (chapter.id === currentChapterId.value && formalStructure.value && isStructureStale(chapter, formalStructure.value)) {
      return "需更新";
    }
    return "已完成";
  }
  return "未生成";
}

function isStructureStale(chapter: ChapterListItem, storyStructure: ChapterStoryStructure) {
  if (storyStructure.sourceScriptVersionId && chapter.currentScriptVersionId && storyStructure.sourceScriptVersionId !== chapter.currentScriptVersionId) {
    return true;
  }

  return Date.parse(chapter.updatedAt) > Date.parse(storyStructure.updatedAt);
}

function cloneStructure(structure: StoryStructureJson): StoryStructureJson {
  return JSON.parse(JSON.stringify(structure)) as StoryStructureJson;
}

function setStructureField(structure: StoryStructureJson, key: string, value: string) {
  const parts = key.split(".");
  if (parts[0] === "synopsis") {
    structure.synopsis = value;
    return;
  }
  if (parts[0] === "direction" && parts[1] && parts[1] in structure.direction) {
    (structure.direction as unknown as Record<string, string>)[parts[1]] = value;
    return;
  }
  const collection = parts[0] as "characters" | "scenes" | "beats";
  const index = Number(parts[1]);
  const field = parts[2];
  const items = structure[collection] as unknown as Array<Record<string, unknown>>;
  if (items?.[index] && field) {
    items[index][field] = value;
  }
}

function createEmptyStructure(): StoryStructureJson {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    chapterId: currentChapterId.value ?? "",
    chapterTitle: currentChapter.value?.title ?? "当前章节",
    sourceScriptVersionId: currentChapter.value?.currentScriptVersionId ?? null,
    synopsis: "",
    direction: {
      logline: "",
      chapterGoal: "",
      coreConflict: "",
      emotionalArc: "",
      endingHook: "",
    },
    characters: [],
    scenes: [],
    beats: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}
</script>

<style scoped>
.structure-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.structure-toolbar,
.structure-status-band,
.chapter-picker {
  display: flex;
  align-items: center;
  min-width: 0;
}

.structure-toolbar {
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 12px;
  background: rgba(13, 18, 33, 0.66);
  padding: 10px 12px;
}

.chapter-picker {
  flex: 1;
  gap: 10px;
  color: #a78bfa;
}

.chapter-picker select {
  min-width: 220px;
  max-width: 420px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(7, 11, 22, 0.82);
  color: #f8fbff;
  padding: 9px 10px;
  font-weight: 900;
}

.story-title {
  min-width: 0;
  overflow: hidden;
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-action,
.confirm-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 900;
}

.primary-action {
  border: 1px solid rgba(141, 240, 220, 0.24);
  background: rgba(34, 199, 169, 0.12);
  color: #9cf5e7;
}

.confirm-action {
  border: 1px solid rgba(52, 211, 153, 0.26);
  background: rgba(52, 211, 153, 0.12);
  color: #bbf7d0;
}

.primary-action:disabled,
.confirm-action:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.structure-scroll {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.structure-status-band {
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(52, 211, 153, 0.18);
  border-radius: 12px;
  background: rgba(12, 31, 31, 0.42);
  padding: 12px;
}

.structure-status-band.pending_confirmation {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(47, 34, 10, 0.38);
}

.structure-status-band span,
.section-heading span,
.editable-label {
  color: #8df0dc;
  font-size: 11px;
  font-weight: 900;
}

.structure-status-band strong {
  display: block;
  margin-top: 2px;
  color: #f8fbff;
  font-size: 16px;
}

.structure-section,
.structure-empty {
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 12px;
  background: rgba(13, 18, 33, 0.58);
  padding: 14px;
}

.section-heading {
  display: grid;
  gap: 3px;
  margin-bottom: 12px;
}

.section-heading h2,
.structure-empty h2 {
  margin: 0;
  color: #f8fbff;
  font-size: 17px;
  font-weight: 900;
}

.direction-grid,
.entity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.entity-item,
.beat-item {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(8, 12, 24, 0.44);
  padding: 12px;
}

.entity-item {
  display: grid;
  gap: 10px;
}

.entity-item > strong,
.beat-content > strong {
  color: #f8fbff;
  font-size: 14px;
  font-weight: 900;
}

.editable-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.editable-value {
  position: relative;
  min-width: 0;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 34px 8px 9px;
}

.editable-value p {
  margin: 0;
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.editable-value input,
.editable-value textarea {
  width: 100%;
  border: 1px solid rgba(141, 240, 220, 0.24);
  border-radius: 6px;
  background: rgba(5, 9, 18, 0.88);
  color: #f8fbff;
  padding: 7px;
  font: inherit;
  outline: none;
}

.editable-value textarea {
  resize: vertical;
}

.edit-field-btn {
  position: absolute;
  top: 7px;
  right: 7px;
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #c4b5fd;
}

.beat-list {
  display: grid;
  gap: 10px;
}

.beat-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
}

.beat-order {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: rgba(124, 58, 237, 0.18);
  color: #ddd6fe;
  font-size: 12px;
  font-weight: 900;
}

.beat-content {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.beat-content > span {
  color: #95a3c2;
  font-size: 11px;
  font-weight: 800;
}

.structure-empty {
  display: grid;
  min-height: 320px;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: #95a3c2;
  text-align: center;
}

.structure-empty p {
  margin: 0;
  max-width: 360px;
  color: #95a3c2;
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 900px) {
  .structure-toolbar {
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

  .direction-grid,
  .entity-grid {
    grid-template-columns: 1fr;
  }
}
</style>
