<template>
  <main class="project-workbench">
    <WorkbenchStageRail
      :active-step-key="activeStepKey"
      :stages="snapshot.stages"
      @select-step="$emit('selectStep', $event)"
    />

    <section class="workbench-content" :aria-label="`${currentStageLabel}工作区`">
      <ProjectDialoguePanel
        :active-step-key="activeStepKey"
        :dialogue-error="dialogueError"
        :dialogue-notice="dialogueNotice"
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :runtime-model-error="runtimeModelError"
        :runtime-models="runtimeModels"
        :selected-model="selectedDialogueModel"
        :snapshot="snapshot"
        :step-label="currentStageLabel"
        @send="emitDialogue"
        @select-model="$emit('selectDialogueModel', $event)"
      />

      <template v-if="isScriptStep">
        <div class="script-middle-column">
          <ScriptChapterList
            :chapters="chapterItems"
            :current-chapter-id="currentChapterId"
            :story-title="snapshot.project.storyTitle"
            @select="$emit('selectChapter', $event)"
          />
          <div v-if="pendingOutline" class="pending-outline-actions">
            <div class="pending-outline-info">
              <CheckCircle2 :size="16" class="pending-outline-icon" />
              <div class="pending-outline-text">
                <span class="pending-outline-title">{{ pendingOutline.title }}</span>
                <span class="pending-outline-hint">剧本大纲已生成，确认后生成当前章节</span>
              </div>
            </div>
            <button
              class="pending-outline-confirm"
              type="button"
              :disabled="dialogueSending"
              title="确认大纲并生成当前章节"
              @click="confirmPendingOutline"
            >
              {{ dialogueSending ? "生成中…" : "确认并生成当前章" }}
            </button>
          </div>
          <div v-if="activeCompletionPrompt" class="chapter-next-actions">
            <div>
              <span>本章剧本已完成</span>
              <strong>{{ activeCompletionPrompt.completedChapterTitle }}</strong>
            </div>
            <div class="chapter-next-buttons">
              <button class="primary-next" type="button" @click="enterCompletedChapterStructure">
                {{ completionPrimaryActionLabel }}
              </button>
              <button
                v-if="activeCompletionPrompt.nextChapterId"
                class="secondary-next"
                type="button"
                @click="continueNextChapter"
              >
                继续{{ activeCompletionPrompt.nextChapterTitle }}
              </button>
            </div>
          </div>
          <ScriptDocumentEditor
            :loading="loading"
            :snapshot="snapshot"
            @save-draft="emitChapterDraft"
            @complete-chapter="emitCompleteChapter"
            @reset-script="$emit('resetScript')"
            @confirm-pending-source="emitConfirmPendingSource"
            @discard-pending-source="emitDiscardPendingSource"
            @update-source-text="scriptDraft = $event"
          />
        </div>
      </template>

      <StoryStructureWorkspace
        v-else-if="isStructureStep"
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @select-chapter="$emit('selectChapter', $event)"
        @generate-structure="emitGenerateStructure"
        @confirm-structure="$emit('confirmStoryStructure', $event)"
        @update-structure="$emit('updateStoryStructure', $event)"
        @regenerate-character-reference="$emit('regenerateCharacterReference', $event)"
        @delete-character-reference="$emit('deleteCharacterReference', $event)"
        @confirm-character-preview="$emit('confirmCharacterPreview', $event)"
        @confirm-character-reference="$emit('confirmCharacterReference', $event)"
        @generate-scene-reference="$emit('generateSceneReference', $event)"
      />

      <ProjectCharactersWorkspace
        v-else-if="isCharactersStep"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @extract-characters="$emit('extractCharacters')"
        @ensure-previews="$emit('ensureCharacterPreviews')"
        @regenerate-reference="$emit('regenerateCharacterReference', $event)"
        @delete-reference="$emit('deleteCharacterReference', $event)"
        @confirm-preview="$emit('confirmCharacterPreview', $event)"
        @confirm-reference="$emit('confirmCharacterReference', $event)"
      />

      <StoryboardWorkspace
        v-else-if="isStoryboardStep"
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :snapshot="snapshot"
        @select-chapter="$emit('selectChapter', $event)"
        @generate-storyboard="emitGenerateStoryboard"
        @confirm-storyboard="$emit('confirmStoryboard', $event)"
        @update-storyboard="$emit('updateStoryboard', $event)"
        @save-pending-storyboard="$emit('savePendingStoryboard', $event)"
      />

      <ImagePreflightWorkspace
        v-else-if="isPreflightStep"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @select-chapter="$emit('selectChapter', $event)"
        @open-characters="$emit('openCharacters')"
        @confirm-preflight="$emit('confirmImagePreflight', $event)"
        @go-candidates="$emit('selectStep', 'image_candidates')"
      />

      <div v-else class="step-placeholder">
        <span>STEP {{ currentStageIndex + 1 }}</span>
        <h2>{{ currentStageLabel }}</h2>
        <p>此阶段功能正在开发中。左侧对话框会按当前步骤加载独立记录，右侧工作面板后续接入。</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CheckCircle2 } from "lucide-vue-next";
import type { AIRuntimeModelItem, AIRuntimeModelSelection, CompleteChapterRequest, DialogueThread, GenerateCharacterReferenceRequest, GenerationTaskItem, ProjectScriptOutline, SaveChapterDraftRequest, SendDialogueMessageRequest, StoryboardJson, StoryStructureJson, UpdateProjectCharacterRequest, WorkbenchSnapshot } from "@airoaming/shared";
import type { ChapterCompletionPrompt } from "../../stores/workbench-store";
import { getCurrentChapterSourceText } from "../../utils/workbench-chapter";
import ProjectDialoguePanel from "./ProjectDialoguePanel.vue";
import ProjectCharactersWorkspace from "./ProjectCharactersWorkspace.vue";
import ScriptChapterList from "./ScriptChapterList.vue";
import ScriptDocumentEditor from "./ScriptDocumentEditor.vue";
import ImagePreflightWorkspace from "./ImagePreflightWorkspace.vue";
import StoryboardWorkspace from "./StoryboardWorkspace.vue";
import StoryStructureWorkspace from "./StoryStructureWorkspace.vue";
import WorkbenchStageRail from "./WorkbenchStageRail.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
  runningTasks: number;
  activeStepKey: string;
  chapterCompletionPrompt: ChapterCompletionPrompt | null;
  dialogueThread: DialogueThread | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  dialogueNotice: string | null;
  runtimeModels: AIRuntimeModelItem[];
  selectedDialogueModel: AIRuntimeModelSelection | null;
  runtimeModelError: string | null;
}>();

const scriptDraft = ref("");

const emit = defineEmits<{
  back: [];
  openCharacters: [];
  saveChapterDraft: [payload: { chapterId: string; input: SaveChapterDraftRequest }];
  completeChapter: [payload: { chapterId: string; input: CompleteChapterRequest }];
  resetScript: [];
  confirmPendingSource: [chapterId: string];
  discardPendingSource: [chapterId: string];
  selectChapter: [chapterId: string];
  selectStep: [stepKey: string];
  dismissCompletionPrompt: [];
  selectDialogueModel: [model: AIRuntimeModelSelection];
  sendDialogue: [input: SendDialogueMessageRequest];
  extractCharacters: [];
  ensureCharacterPreviews: [];
  updateProjectCharacter: [payload: { characterId: string; input: UpdateProjectCharacterRequest }];
  generateCharacterReference: [payload: { characterId: string; referenceKind: GenerateCharacterReferenceRequest["referenceKind"] }];
  regenerateCharacterReference: [payload: { characterId: string; referenceKind: "preview_front" | "final_reference"; input: UpdateProjectCharacterRequest }];
  deleteCharacterReference: [payload: { characterId: string; assetId: string }];
  confirmCharacterPreview: [payload: { characterId: string; assetId: string }];
  confirmCharacterReference: [payload: { characterId: string; assetId: string }];
  generateSceneReference: [payload: { chapterId: string; sceneId: string }];
  confirmStoryStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  updateStoryStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  confirmStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  updateStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  savePendingStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  confirmImagePreflight: [chapterId: string];
}>();

const currentStageIndex = computed(() => {
  const index = props.snapshot.stages.findIndex((s) => s.key === props.activeStepKey);
  return Math.max(0, index);
});

const currentStageLabel = computed(() => {
  if (props.activeStepKey === "project_characters") {
    return "项目角色库";
  }
  return props.snapshot.stages[currentStageIndex.value]?.label || "未知阶段";
});

const isScriptStep = computed(() => props.activeStepKey === "project_story");
const isCharactersStep = computed(() => props.activeStepKey === "project_characters");
const isStructureStep = computed(() => props.activeStepKey === "story_structure");
const isStoryboardStep = computed(() => props.activeStepKey === "storyboard");
const isPreflightStep = computed(() => props.activeStepKey === "image_preflight");
const chapterItems = computed(() => props.snapshot.chapters ?? []);
const currentChapterId = computed(() => props.snapshot.currentChapter?.id ?? props.snapshot.story.chapterId ?? null);

/** 待确认剧本大纲:从对话 toolResults 反查最新 needs_user_confirmation 的大纲。 */
const pendingOutline = computed<ProjectScriptOutline | null>(() => {
  if (!isScriptStep.value) {
    return null;
  }
  const result = [...(props.dialogueThread?.toolResults ?? [])]
    .reverse()
    .find((item) => item.tool === "generate_script_outline_from_seed"
      && item.status === "needs_user_confirmation"
      && item.scriptOutline);
  return result?.scriptOutline ?? null;
});
const completionPrimaryActionLabel = computed(() => "进入本章剧情结构");
const activeCompletionPrompt = computed(() => {
  if (!props.chapterCompletionPrompt || props.chapterCompletionPrompt.completedChapterId !== currentChapterId.value) {
    return null;
  }

  return props.chapterCompletionPrompt;
});

watch(
  () => getCurrentChapterSourceText(props.snapshot),
  (sourceText) => {
    scriptDraft.value = sourceText;
  },
  { immediate: true },
);

function emitChapterDraft(input: SaveChapterDraftRequest) {
  if (!currentChapterId.value) {
    return;
  }

  emit("saveChapterDraft", {
    chapterId: currentChapterId.value,
    input,
  });
}

function emitCompleteChapter(input: CompleteChapterRequest) {
  if (!currentChapterId.value) {
    return;
  }

  emit("completeChapter", {
    chapterId: currentChapterId.value,
    input,
  });
}

function emitConfirmPendingSource() {
  if (!currentChapterId.value) {
    return;
  }
  emit("confirmPendingSource", currentChapterId.value);
}

function emitDiscardPendingSource() {
  if (!currentChapterId.value) {
    return;
  }
  emit("discardPendingSource", currentChapterId.value);
}

function emitDialogue(input: SendDialogueMessageRequest) {
  const hasAttachments = (input.attachments?.length ?? 0) > 0;
  const shouldUseProjectThread = hasAttachments
    || input.intent === "organize_script_to_chapters"
    || input.intent === "generate_inspiration_seeds"
    || input.intent === "generate_script_outline_from_seed";
  emit("sendDialogue", {
    ...input,
    chapterId: shouldUseProjectThread ? null : currentChapterId.value,
    context: {
      ...input.context,
      sourceText: scriptDraft.value,
    },
  });
}

/** 确认待确认大纲并生成当前章节(显眼 banner 入口,不必进对话框找按钮)。 */
function confirmPendingOutline() {
  if (props.dialogueSending || !pendingOutline.value) {
    return;
  }
  emitDialogue({
    content: `确认大纲：${pendingOutline.value.title}，生成当前章节`,
    intent: "generate_script_from_outline",
  });
}

function emitGenerateStructure(payload: { chapterId: string; regenerate: boolean }) {
  emit("sendDialogue", {
    content: payload.regenerate ? "确认重新生成剧情结构" : "生成当前章节剧情结构",
    chapterId: payload.chapterId,
    intent: "generate_story_structure",
    context: {
      sourceText: getCurrentChapterSourceText(props.snapshot),
    },
  });
}

function emitGenerateStoryboard(payload: { chapterId: string; regenerate: boolean }) {
  emit("sendDialogue", {
    content: payload.regenerate ? "确认重新生成分镜" : "生成当前章节分镜",
    chapterId: payload.chapterId,
    intent: "generate_storyboard",
    context: {
      sourceText: getCurrentChapterSourceText(props.snapshot),
    },
  });
}

function enterCompletedChapterStructure() {
  emit("dismissCompletionPrompt");
  emit("selectStep", "story_structure");
}

function continueNextChapter() {
  if (!activeCompletionPrompt.value?.nextChapterId) {
    return;
  }

  emit("dismissCompletionPrompt");
  emit("selectChapter", activeCompletionPrompt.value.nextChapterId);
}
</script>

<style scoped>
.project-workbench {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  margin: 0 auto;
  padding: 12px 24px 24px;
}

.workbench-content {
  display: grid;
  grid-template-columns: minmax(320px, 35fr) minmax(0, 65fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.script-middle-column {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chapter-next-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(34, 199, 169, 0.26);
  border-radius: 12px;
  background: rgba(11, 42, 38, 0.42);
  padding: 12px 14px;
}

.chapter-next-actions div:first-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.chapter-next-actions span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.chapter-next-actions strong {
  color: #f8fbff;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 待确认剧本大纲显眼 banner(替代埋在对话框里的隐蔽按钮) */
.pending-outline-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(139, 92, 246, 0.38);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(116, 95, 255, 0.08));
  padding: 12px 14px;
}

.pending-outline-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pending-outline-icon {
  flex: 0 0 auto;
  color: #c4b5fd;
}

.pending-outline-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pending-outline-title {
  color: #f8fbff;
  font-size: 14px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-outline-hint {
  color: #c4b5fd;
  font-size: 12px;
  font-weight: 600;
}

.pending-outline-confirm {
  flex: 0 0 auto;
  min-height: 38px;
  border: 1px solid rgba(139, 92, 246, 0.5);
  border-radius: 10px;
  background: linear-gradient(135deg, #8b5cf6, #745fff);
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
  padding: 0 16px;
  cursor: pointer;
  transition: filter 0.15s ease, opacity 0.15s ease;
}

.pending-outline-confirm:hover:not(:disabled) {
  filter: brightness(1.12);
}

.pending-outline-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chapter-next-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.chapter-next-buttons button {
  min-height: 36px;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 900;
}

.primary-next {
  border: 1px solid rgba(34, 199, 169, 0.34);
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
}

.secondary-next {
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.76);
  color: #d8e0f0;
}

.structure-workspace {
  min-height: 0;
}

.step-placeholder {
  display: grid;
  grid-column: 2 / -1;
  min-height: 0;
  align-content: center;
  gap: 10px;
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(18, 24, 43, 0.76), rgba(11, 16, 30, 0.62)),
    rgba(8, 12, 24, 0.76);
  padding: 28px;
}

.step-placeholder span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.step-placeholder h2,
.step-placeholder p {
  margin: 0;
}

.step-placeholder h2 {
  color: #f8fbff;
  font-size: 24px;
  font-weight: 900;
}

.step-placeholder p {
  max-width: 520px;
  color: #95a3c2;
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 1200px) {
  .workbench-content {
    grid-template-columns: minmax(300px, 36fr) minmax(0, 64fr);
  }

  .step-placeholder {
    grid-column: 2;
  }
}

@media (max-width: 860px) {
  .project-workbench {
    height: auto;
    min-height: calc(100vh - 72px);
    overflow: visible;
  }

  .workbench-content {
    grid-template-columns: 1fr;
    overflow: visible;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .script-middle-column {
    order: 1;
  }

  .chapter-next-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .chapter-next-buttons {
    flex-wrap: wrap;
  }

  .workbench-content :deep(.dialogue-panel) {
    order: 2;
    min-height: 520px;
    max-height: 72vh;
  }

  .step-placeholder {
    grid-column: 1;
  }
}
</style>
