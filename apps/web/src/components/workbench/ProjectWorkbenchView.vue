<template>
  <main class="project-workbench">
    <WorkbenchStageRail
      :active-step-key="activeStepKey"
      :stages="snapshot.stages"
      @select-step="$emit('selectStep', $event)"
    />

    <section class="workbench-content" :aria-label="`${currentStageLabel}工作区`">
      <ProjectDialoguePanel
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
          <ScriptDocumentEditor
            :loading="loading"
            :snapshot="snapshot"
            @save-draft="emitChapterDraft"
            @complete-chapter="emitCompleteChapter"
            @reset-script="$emit('resetScript')"
            @update-source-text="scriptDraft = $event"
          />
        </div>
      </template>

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
import type { AIRuntimeModelItem, AIRuntimeModelSelection, CompleteChapterRequest, DialogueThread, SaveChapterDraftRequest, SendDialogueMessageRequest, WorkbenchSnapshot } from "@airoaming/shared";
import { getCurrentChapterSourceText } from "../../utils/workbench-chapter";
import ProjectDialoguePanel from "./ProjectDialoguePanel.vue";
import ScriptChapterList from "./ScriptChapterList.vue";
import ScriptDocumentEditor from "./ScriptDocumentEditor.vue";
import WorkbenchStageRail from "./WorkbenchStageRail.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
  runningTasks: number;
  activeStepKey: string;
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
  saveChapterDraft: [payload: { chapterId: string; input: SaveChapterDraftRequest }];
  completeChapter: [payload: { chapterId: string; input: CompleteChapterRequest }];
  resetScript: [];
  selectChapter: [chapterId: string];
  selectStep: [stepKey: string];
  selectDialogueModel: [model: AIRuntimeModelSelection];
  sendDialogue: [input: SendDialogueMessageRequest];
}>();

const currentStageIndex = computed(() => {
  const index = props.snapshot.stages.findIndex((s) => s.key === props.activeStepKey);
  return Math.max(0, index);
});

const currentStageLabel = computed(() => {
  return props.snapshot.stages[currentStageIndex.value]?.label || "未知阶段";
});

const isScriptStep = computed(() => props.activeStepKey === "project_story");
const chapterItems = computed(() => props.snapshot.chapters ?? []);
const currentChapterId = computed(() => props.snapshot.currentChapter?.id ?? props.snapshot.story.chapterId ?? null);

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
