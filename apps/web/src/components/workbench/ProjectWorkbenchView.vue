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
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :runtime-model-error="runtimeModelError"
        :runtime-models="runtimeModels"
        :selected-model="selectedDialogueModel"
        :snapshot="snapshot"
        :step-label="currentStageLabel"
        @send="$emit('sendDialogue', $event)"
        @select-model="$emit('selectDialogueModel', $event)"
      />

      <template v-if="isScriptStep">
        <ScriptDocumentEditor :loading="loading" :snapshot="snapshot" @save="$emit('saveStory', $event)" />
        <ScriptOutlinePanel :snapshot="snapshot" />
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
import { computed } from "vue";
import type { AIRuntimeModelItem, AIRuntimeModelSelection, DialogueThread, UpdateProjectDraftRequest, WorkbenchSnapshot } from "@airoaming/shared";
import ProjectDialoguePanel from "./ProjectDialoguePanel.vue";
import ScriptDocumentEditor from "./ScriptDocumentEditor.vue";
import ScriptOutlinePanel from "./ScriptOutlinePanel.vue";
import WorkbenchStageRail from "./WorkbenchStageRail.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
  runningTasks: number;
  activeStepKey: string;
  dialogueThread: DialogueThread | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  runtimeModels: AIRuntimeModelItem[];
  selectedDialogueModel: AIRuntimeModelSelection | null;
  runtimeModelError: string | null;
}>();

defineEmits<{
  back: [];
  saveStory: [input: UpdateProjectDraftRequest];
  selectStep: [stepKey: string];
  selectDialogueModel: [model: AIRuntimeModelSelection];
  sendDialogue: [content: string];
}>();

const currentStageIndex = computed(() => {
  const index = props.snapshot.stages.findIndex((s) => s.key === props.activeStepKey);
  return Math.max(0, index);
});

const currentStageLabel = computed(() => {
  return props.snapshot.stages[currentStageIndex.value]?.label || "未知阶段";
});

const isScriptStep = computed(() => props.activeStepKey === "project_story");
</script>

<style scoped>
.project-workbench {
  display: grid;
  gap: 16px;
  width: 100%;
  margin: 0 auto;
  padding: 22px 24px 30px;
}

.workbench-content {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr) 280px;
  gap: 16px;
  align-items: stretch;
  min-width: 0;
}

.step-placeholder {
  display: grid;
  grid-column: 2 / -1;
  min-height: 560px;
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
    grid-template-columns: 380px minmax(0, 1fr);
  }

  .workbench-content :deep(.script-outline-panel) {
    display: none;
  }

  .step-placeholder {
    grid-column: 2;
  }
}

@media (max-width: 860px) {

  .workbench-content {
    grid-template-columns: 1fr;
  }

  .workbench-content :deep(.script-editor) {
    order: 1;
  }

  .workbench-content :deep(.dialogue-panel) {
    order: 2;
  }

  .step-placeholder {
    grid-column: 1;
  }
}
</style>
