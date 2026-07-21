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

    <div v-if="versioningStatus" class="db-versioning-status" data-testid="story-db-versioning-status">
      <strong>DB Working Copy</strong>
      <span>{{ versioningStatus.label }}</span>
      <span v-if="versioningStatus.freshness">来源：{{ versioningStatus.freshness }}</span>
      <span v-if="versioningStatus.history">历史：可查看</span>
      <span v-if="versioningStatus.attention">门禁：{{ versioningStatus.attention }}</span>
    </div>

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
        <EditableField
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
          <EditableField
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
          <EditableField
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
          <EditableField
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
          <EditableField
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
          <EditableField
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
          <article v-for="(character, index) in structureJson.characters" :key="character.id" class="entity-item character-card">
            <strong>{{ character.name }}</strong>
            <EditableField :field-key="`characters.${index}.role`" label="职能" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.role" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`characters.${index}.motivation`" label="动机" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.motivation" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`characters.${index}.relationship`" label="关系" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.relationship" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`characters.${index}.visualTraits`" label="视觉特征" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="character.visualTraits" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
          </article>
        </div>
      </section>

      <section class="structure-section">
        <CharacterImageList
          compact
          lock-mode="fully-locked"
          :characters="mainCharacters"
          :loading="loading"
          :snapshot="snapshot"
          :tasks="tasks"
          subtitle="项目角色库"
          title="主角色"
          empty-title="还没有主角色"
          empty-text="确认剧本大纲后，主角和常驻角色会自动进入项目角色库。"
          @regenerate-reference="$emit('regenerateCharacterReference', $event)"
          @confirm-preview="$emit('confirmCharacterPreview', $event)"
          @confirm-reference="$emit('confirmCharacterReference', $event)"
        />
      </section>

      <section class="structure-section">
        <CharacterImageList
          compact
          :characters="chapterCharacters"
          :loading="loading"
          :snapshot="snapshot"
          :tasks="tasks"
          subtitle="本章角色图"
          title="本章新角色"
          empty-title="本章角色还没有进入角色库"
          empty-text="确认剧情结构后，本章角色会自动进入角色库并排队生成角色图。"
          @regenerate-reference="$emit('regenerateCharacterReference', $event)"
          @confirm-preview="$emit('confirmCharacterPreview', $event)"
          @confirm-reference="$emit('confirmCharacterReference', $event)"
        />
      </section>

      <section class="structure-section">
        <div class="section-heading">
          <span>本章结构卡</span>
          <h2>场景</h2>
        </div>
        <div class="entity-grid">
          <article v-for="(scene, index) in structureJson.scenes" :key="scene.id" class="entity-item scene-card">
            <strong>{{ scene.name }}</strong>
            <EditableField :field-key="`scenes.${index}.location`" label="地点" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.location" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`scenes.${index}.timeOfDay`" label="时间" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.timeOfDay" @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`scenes.${index}.atmosphere`" label="氛围" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.atmosphere" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <EditableField :field-key="`scenes.${index}.purpose`" label="剧情作用" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="scene.purpose" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
            <div class="scene-reference">
              <div v-if="getSceneAssetUrl(scene)" class="scene-image-wrap">
                <button
                  class="scene-image-btn"
                  type="button"
                  @click="openScenePreview(scene)"
                >
                  <img :src="getSceneAssetUrl(scene)!" :alt="`${scene.name} 场景图`" @error="markSceneImageFailed(scene)" />
                  <span class="scene-image-overlay"><ZoomIn :size="14" /> 查看</span>
                </button>
                <button
                  v-if="!isSceneTaskActive(scene)"
                  type="button"
                  class="scene-regen-corner"
                  title="重新生成场景图"
                  :disabled="loading"
                  @click.stop="requestSceneReference(scene)"
                >
                  <RotateCw :size="15" />
                </button>
                <span v-else class="scene-regen-loading"><LoaderCircle :size="14" /></span>
              </div>
              <div v-else-if="isSceneTaskActive(scene)" class="scene-image-pending">
                <LoaderCircle :size="18" />
                <span>生成中</span>
              </div>
              <div v-else-if="hasBoundSceneAsset(scene)" class="scene-image-missing">
                <AlertTriangle :size="18" />
                <span>场景图文件缺失</span>
                <button type="button" :disabled="loading" @click="requestSceneReference(scene)">
                  重新生成
                </button>
              </div>
              <button
                v-else
                class="scene-generate-btn"
                type="button"
                :disabled="loading"
                @click="requestSceneReference(scene)"
              >
                <ImagePlus :size="14" />
                <span>生成场景图</span>
              </button>
            </div>
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
              <EditableField :field-key="`beats.${index}.summary`" label="事件" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.summary" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`beats.${index}.conflict`" label="冲突" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.conflict" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`beats.${index}.visualFocus`" label="画面重点" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.visualFocus" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
              <EditableField :field-key="`beats.${index}.outcome`" label="结果" :editable="canEdit" :editing-key="editingKey" :editing-value="editingValue" :value="beat.outcome" multiline @start="startEditing" @input="editingValue = $event" @commit="commitField" />
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

    <Teleport to="body">
      <div v-if="activeScenePreview" class="scene-preview-backdrop" role="dialog" aria-modal="true" @click.self="closeScenePreview">
        <button class="scene-preview-close" type="button" aria-label="关闭" @click="closeScenePreview">
          <X :size="20" />
        </button>
        <img :src="activeScenePreview.url" :alt="`${activeScenePreview.name} 场景图`" class="scene-preview-image" />
        <span class="scene-preview-caption">{{ activeScenePreview.name }}</span>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertTriangle, CheckCircle2, FileText, ImagePlus, LoaderCircle, Lock, RefreshCw, RotateCw, X, ZoomIn } from "lucide-vue-next";
import type { ChapterListItem, ChapterStoryStructure, DialogueThread, GenerationTaskItem, StoryStructureJson, StoryStructureSceneCard, UpdateProjectCharacterRequest, WorkbenchSnapshot } from "@airoaming/shared";
import { characterVisualIdentityKey } from "@airoaming/shared";
import { api } from "../../services/api";
import CharacterImageList from "./CharacterImageList.vue";
import EditableField from "./EditableField.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  dialogueThread: DialogueThread | null;
  loading: boolean;
  dialogueSending: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateStructure: [payload: { chapterId: string; regenerate: boolean }];
  confirmStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  updateStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  regenerateCharacterReference: [payload: { characterId: string; referenceKind: "preview_front" | "final_reference"; input: UpdateProjectCharacterRequest }];
  confirmCharacterPreview: [payload: { characterId: string; assetId: string }];
  confirmCharacterReference: [payload: { characterId: string; assetId: string }];
  generateSceneReference: [payload: { chapterId: string; sceneId: string }];
}>();

const editingKey = ref<string | null>(null);
const editingValue = ref("");
const activeScenePreview = ref<{ url: string; name: string } | null>(null);
const failedSceneAssetIds = ref<Set<string>>(new Set());

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
const versioningStatus = computed(() => {
  if (props.snapshot.versioningCapability.mode !== "g2_db") return null;
  const step = props.snapshot.workflow.steps.find((item) => item.key === "story_structure");
  return {
    label: step?.status === "needs_confirmation" ? "待确认" : step?.status === "needs_update" ? "来源已变化" : step?.status === "done" ? "current" : "Working Copy",
    freshness: step?.freshness ?? null,
    history: Boolean(step?.historyAvailable),
    attention: step?.attention ?? null,
  };
});
const projectCharacterByName = computed(() => new Map(props.snapshot.characters.map((character) => [normalizeCharacterKey(character.name), character])));
const projectCharacterById = computed(() => new Map(props.snapshot.characters.map((character) => [character.id, character])));
const projectCharacterByVisualIdentity = computed(() => {
  const result = new Map<string, WorkbenchSnapshot["characters"][number]>();
  props.snapshot.characters.forEach((character) => {
    const key = `${character.entityType}:${characterVisualIdentityKey(character.name, character.entityType)}`;
    const current = result.get(key);
    if (!current || characterVisualReadiness(character) > characterVisualReadiness(current)) {
      result.set(key, character);
    }
  });
  return result;
});
/** 主角色/常驻角色:无条件展示(项目角色库已有),自动带入 */
const mainCharacters = computed(() =>
  props.snapshot.characters.filter((character) => character.level === "lead" || character.level === "recurring"),
);
/** 本章新角色:本章结构卡匹配到项目库,且非主角色 */
const chapterCharacters = computed(() => {
  const mainIds = new Set(mainCharacters.value.map((character) => character.id));
  const matched = new Map<string, WorkbenchSnapshot["characters"][number]>();
  structureJson.value.characters.forEach((character) => {
    const entityType = character.entityType ?? "human";
    const identityKey = `${entityType}:${characterVisualIdentityKey(character.name, entityType)}`;
    const projectCharacter = entityType === "group"
      ? projectCharacterByVisualIdentity.value.get(identityKey)
        ?? projectCharacterById.value.get(character.projectCharacterId ?? "")
        ?? projectCharacterByName.value.get(normalizeCharacterKey(character.name))
      : projectCharacterById.value.get(character.projectCharacterId ?? "")
        ?? projectCharacterByName.value.get(normalizeCharacterKey(character.name));
    if (projectCharacter && !mainIds.has(projectCharacter.id)) {
      matched.set(identityKey, projectCharacter);
    }
  });
  return [...matched.values()];
});

function characterVisualReadiness(character: WorkbenchSnapshot["characters"][number]): number {
  if (character.primaryReferenceAssetId) return 2;
  if (character.previewReferenceAssetId) return 1;
  return 0;
}

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

/** 场景背景图 URL:从 snapshot.assets 按 scene.referenceAssetId 取 */
function getSceneAssetUrl(scene: StoryStructureSceneCard): string | null {
  if (!scene.referenceAssetId || failedSceneAssetIds.value.has(scene.referenceAssetId)) {
    return null;
  }
  const asset = props.snapshot.assets?.find((item) => item.id === scene.referenceAssetId);
  return asset ? api.projectAssetFileUrl(props.snapshot.project.id, asset.id) : null;
}

function hasBoundSceneAsset(scene: StoryStructureSceneCard): boolean {
  return Boolean(
    scene.referenceAssetId
    && props.snapshot.assets?.some((item) => item.id === scene.referenceAssetId),
  );
}

function markSceneImageFailed(scene: StoryStructureSceneCard) {
  if (!scene.referenceAssetId) {
    return;
  }
  failedSceneAssetIds.value = new Set([...failedSceneAssetIds.value, scene.referenceAssetId]);
  if (activeScenePreview.value?.url === api.projectAssetFileUrl(props.snapshot.project.id, scene.referenceAssetId)) {
    activeScenePreview.value = null;
  }
}

/** 该场景是否有活跃的生成任务 */
function isSceneTaskActive(scene: StoryStructureSceneCard): boolean {
  return props.tasks.some((task) =>
    task.projectId === props.snapshot.project.id
    && task.type === "scene_reference_generate"
    && task.target?.type === "scene"
    // DB 任务的 target.id 是 chapter_scenes.id，而剧情结构里的 scene.id
    // 是稳定 sceneKey；优先用任务输入中的 sceneKey 关联，兼容旧任务再回退 target.id。
    && (task.input.sceneKey === scene.id || task.target.id === scene.id)
    && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
  );
}

function requestSceneReference(scene: StoryStructureSceneCard) {
  const chapterId = currentChapterId.value;
  if (!chapterId) {
    return;
  }
  emit("generateSceneReference", { chapterId, sceneId: scene.id });
}

function openScenePreview(scene: StoryStructureSceneCard) {
  const url = getSceneAssetUrl(scene);
  if (url) {
    activeScenePreview.value = { url, name: scene.name };
  }
}

function closeScenePreview() {
  activeScenePreview.value = null;
}

function normalizeCharacterKey(value: string) {
  return value.trim().toLowerCase();
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
  if (!storyStructure.sourceScriptVersionId || !chapter.currentScriptVersionId) {
    return false;
  }

  return storyStructure.sourceScriptVersionId !== chapter.currentScriptVersionId;
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
  gap: 16px;
  overflow: hidden;
}

.structure-toolbar,
.structure-status-band,
.chapter-picker {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* Toolbar Style */
.structure-toolbar {
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(139, 92, 246, 0.12) !important;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.45) !important;
  padding: 12px 16px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}
html[data-theme="light"] .structure-toolbar {
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

/* Status Band */
.structure-status-band {
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(16, 185, 129, 0.18) !important;
  border-radius: 14px;
  background: rgba(16, 185, 129, 0.04) !important;
  padding: 14px 16px;
}
.structure-status-band.pending_confirmation {
  border-color: rgba(245, 158, 11, 0.24) !important;
  background: rgba(245, 158, 11, 0.04) !important;
}
html[data-theme="light"] .structure-status-band {
  border-color: rgba(16, 185, 129, 0.22) !important;
  background: rgba(16, 185, 129, 0.03) !important;
}
html[data-theme="light"] .structure-status-band.pending_confirmation {
  border-color: rgba(245, 158, 11, 0.28) !important;
  background: rgba(245, 158, 11, 0.03) !important;
}

.structure-status-band span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #10b981;
}
.structure-status-band.pending_confirmation span {
  color: #f59e0b;
}
html[data-theme="light"] .structure-status-band span {
  color: #059669;
}
html[data-theme="light"] .structure-status-band.pending_confirmation span {
  color: #d97706;
}

.structure-status-band strong {
  display: block;
  margin-top: 4px;
  color: #f8fbff;
  font-size: 16px;
  font-weight: 700;
}
html[data-theme="light"] .structure-status-band strong {
  color: #1e293b;
}

/* Scroll Container */
.structure-scroll {
  display: grid;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
}

/* Section Card Layout */
.structure-section {
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.35) !important;
  padding: 20px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}
html[data-theme="light"] .structure-section {
  border-color: rgba(100, 116, 139, 0.08) !important;
  background: #ffffff !important;
  box-shadow: 0 4px 24px rgba(100, 116, 139, 0.02);
}

.section-heading {
  display: grid;
  gap: 4px;
  margin-bottom: 16px;
}
.section-heading span {
  color: #7c3aed;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
html[data-theme="light"] .section-heading span {
  color: #7c3aed;
}

.section-heading h2 {
  margin: 0;
  color: #f1f5f9;
  font-size: 18px;
  font-weight: 800;
}
html[data-theme="light"] .section-heading h2 {
  color: #1e293b;
}

/* Direction 2-column Grid */
.direction-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.direction-grid :deep(.editable-field) {
  background: rgba(30, 41, 59, 0.18);
  border: 1px solid rgba(139, 92, 246, 0.05);
  border-radius: 10px;
  padding: 12px;
}
html[data-theme="light"] .direction-grid :deep(.editable-field) {
  background: rgba(240, 244, 250, 0.4);
  border-color: rgba(100, 116, 139, 0.06);
}

/* Characters and Scenes Grid */
.entity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.entity-item {
  position: relative;
  display: grid;
  gap: 14px;
  min-width: 0;
  border-radius: 12px;
  padding: 16px;
  background: rgba(30, 41, 59, 0.18) !important;
  border: 1px solid rgba(139, 92, 246, 0.06) !important;
}
html[data-theme="light"] .entity-item {
  background: rgba(240, 244, 250, 0.4) !important;
  border-color: rgba(100, 116, 139, 0.06) !important;
}

/* Accent top border colors for Cards */
.character-card {
  border-top: 3px solid rgba(124, 58, 237, 0.7) !important;
}
.scene-card {
  border-top: 3px solid rgba(13, 148, 136, 0.7) !important;
}

.scene-reference {
  display: grid;
  margin-top: 8px;
}

.scene-image-btn {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.5);
  padding: 0;
  cursor: zoom-in;
  aspect-ratio: 16 / 9;
}

.scene-image-wrap {
  position: relative;
}

.scene-regen-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
  opacity: 0.92;
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.scene-regen-corner:hover {
  opacity: 1;
  transform: rotate(90deg);
}

.scene-regen-corner:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scene-regen-loading {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
}

.scene-regen-loading svg {
  animation: spin 1.2s linear infinite;
}

.scene-image-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-image-overlay {
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fbff;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
}

.scene-image-pending {
  display: grid;
  place-items: center;
  gap: 4px;
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.4);
  color: #94a3b8;
  padding: 16px;
  font-size: 12px;
  aspect-ratio: 16 / 9;
}

.scene-image-pending svg {
  animation: spin 1.2s linear infinite;
}

.scene-image-missing {
  display: grid;
  place-items: center;
  gap: 8px;
  border: 1px dashed rgba(251, 146, 60, 0.45);
  border-radius: 8px;
  background: rgba(124, 45, 18, 0.12);
  color: #fdba74;
  padding: 16px;
  font-size: 12px;
  font-weight: 800;
  aspect-ratio: 16 / 9;
}

.scene-image-missing button {
  border: 1px solid rgba(251, 146, 60, 0.42);
  border-radius: 7px;
  background: rgba(124, 45, 18, 0.24);
  color: inherit;
  padding: 6px 12px;
  font-weight: 800;
  cursor: pointer;
}

.scene-image-missing button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scene-generate-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 38px;
  border: 1px dashed rgba(34, 199, 169, 0.4);
  border-radius: 8px;
  background: rgba(34, 199, 169, 0.08);
  color: #8df0dc;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.scene-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.scene-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  gap: 14px;
  grid-auto-flow: row;
  background: rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(12px);
  padding: 32px;
}

.scene-preview-image {
  max-width: min(92vw, 1200px);
  max-height: 80vh;
  border-radius: 10px;
  object-fit: contain;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.scene-preview-caption {
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 800;
}

.scene-preview-close {
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

.scene-preview-close:hover {
  background: rgba(15, 23, 42, 0.95);
}

.entity-item > strong {
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  margin-bottom: 2px;
  display: block;
}
html[data-theme="light"] .entity-item > strong {
  color: #1e293b;
}

/* Editable Field Style Cleanup */
.structure-workspace :deep(.editable-field) {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.structure-workspace :deep(.editable-label) {
  color: #a78bfa !important; /* Beautiful premium purple */
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: block;
}
html[data-theme="light"] .structure-workspace :deep(.editable-label) {
  color: #7c3aed !important; /* Rich violet for light mode contrast */
}

.structure-workspace :deep(.editable-value) {
  position: relative;
  min-width: 0;
  border-radius: 0;
  border-left: 2px solid rgba(139, 92, 246, 0.25) !important;
  background: rgba(139, 92, 246, 0.02) !important;
  padding: 4px 28px 4px 10px;
}
html[data-theme="light"] .structure-workspace :deep(.editable-value) {
  border-left-color: rgba(124, 58, 237, 0.35) !important;
  background: rgba(124, 58, 237, 0.02) !important;
}

.structure-workspace :deep(.editable-value p) {
  margin: 0;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
html[data-theme="light"] .structure-workspace :deep(.editable-value p) {
  color: #334155;
}

.structure-workspace :deep(.editable-value input),
.structure-workspace :deep(.editable-value textarea) {
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
}
.structure-workspace :deep(.editable-value textarea) {
  resize: vertical;
}
html[data-theme="light"] .structure-workspace :deep(.editable-value input),
html[data-theme="light"] .structure-workspace :deep(.editable-value textarea) {
  background: #ffffff !important;
  color: #1e293b !important;
  border-color: rgba(124, 58, 237, 0.25) !important;
}

.structure-workspace :deep(.edit-field-btn) {
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
.structure-workspace :deep(.editable-value:hover .edit-field-btn) {
  opacity: 1 !important;
}
.structure-workspace :deep(.edit-field-btn:hover) {
  background: rgba(139, 92, 246, 0.15) !important;
  color: #c4b5fd !important;
}
html[data-theme="light"] .structure-workspace :deep(.edit-field-btn) {
  border-color: rgba(100, 116, 139, 0.1) !important;
  background: rgba(0, 0, 0, 0.02) !important;
  color: #7c3aed !important;
}
html[data-theme="light"] .structure-workspace :deep(.edit-field-btn:hover) {
  background: rgba(124, 58, 237, 0.08) !important;
  color: #6d28d9 !important;
}

/* Beautiful Timeline for Beats */
.beat-list {
  position: relative;
  display: grid;
  gap: 20px;
}
/* Center connection line running through circles */
.beat-list::before {
  content: '';
  position: absolute;
  left: 16px; /* 32px diameter circle / 2 */
  top: 16px;
  bottom: 16px;
  width: 2px;
  background: rgba(139, 92, 246, 0.15);
}
html[data-theme="light"] .beat-list::before {
  background: rgba(124, 58, 237, 0.12);
}

.beat-item {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) !important;
  gap: 16px !important;
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  box-shadow: none !important;
}

.beat-order {
  position: relative;
  z-index: 2;
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.95);
  border: 2px solid rgba(139, 92, 246, 0.3) !important;
  color: #ddd6fe;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.1);
}
html[data-theme="light"] .beat-order {
  background: #ffffff;
  border-color: rgba(124, 58, 237, 0.35) !important;
  color: #7c3aed;
  box-shadow: 0 0 8px rgba(124, 58, 237, 0.05);
}

.beat-content {
  display: grid;
  gap: 12px;
  min-width: 0;
  background: rgba(30, 41, 59, 0.18);
  border: 1px solid rgba(139, 92, 246, 0.06);
  border-radius: 14px;
  padding: 16px;
}
html[data-theme="light"] .beat-content {
  background: rgba(240, 244, 250, 0.4);
  border-color: rgba(100, 116, 139, 0.06);
}

.beat-content > strong {
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
}
html[data-theme="light"] .beat-content > strong {
  color: #1e293b;
}

.beat-content > span {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  background: rgba(139, 92, 246, 0.1);
  color: #c4b5fd;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(139, 92, 246, 0.15);
  margin-top: -4px;
}
html[data-theme="light"] .beat-content > span {
  background: rgba(124, 58, 237, 0.06);
  color: #7c3aed;
  border-color: rgba(124, 58, 237, 0.12);
}

/* Empty States */
.structure-empty {
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
}
html[data-theme="light"] .structure-empty {
  border-color: rgba(100, 116, 139, 0.08) !important;
  background: #ffffff !important;
  color: #64748b;
  box-shadow: 0 4px 24px rgba(100, 116, 139, 0.02);
}

.structure-empty h2 {
  margin: 0;
  color: #f1f5f9;
  font-size: 18px;
  font-weight: 800;
}
html[data-theme="light"] .structure-empty h2 {
  color: #1e293b;
}

.structure-empty p {
  margin: 0;
  max-width: 360px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.7;
}
html[data-theme="light"] .structure-empty p {
  color: #64748b;
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

  .beat-list::before {
    display: none;
  }

  .beat-item {
    grid-template-columns: 1fr !important;
    gap: 8px !important;
  }

  .beat-order {
    width: 24px;
    height: 24px;
  }
}
</style>
