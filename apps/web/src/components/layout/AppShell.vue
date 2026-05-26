<template>
  <div class="app-shell" :class="{ 'is-project-mode': isProjectRoute }">
    <TopBar
      :project-count="projects.length"
      :running-tasks="workbench.runningTaskCount"
      :is-project-route="isProjectRoute"
      :project-name="snapshot?.project.name"
      @back="goProjectLibrary"
    />
    <div class="app-body">
      <AppSidebar v-if="!isProjectRoute" />
      <section class="app-main" :aria-label="isProjectRoute ? '绘界漫画项目工作区' : '绘界漫画项目库'">
        <ProjectWorkbenchView
          v-if="isProjectRoute && snapshot"
          :active-step-key="activeStepKey"
          :dialogue-error="dialogueError"
          :dialogue-sending="dialogueSending"
          :dialogue-thread="dialogueThread"
          :loading="loading"
          :running-tasks="workbench.runningTaskCount"
          :runtime-model-error="runtimeModelError"
          :runtime-models="runtimeModels"
          :selected-dialogue-model="selectedDialogueModel"
          :snapshot="snapshot"
          @send-dialogue="sendDialogue"
          @back="goProjectLibrary"
          @save-story="saveStory"
          @select-step="goProjectStep"
          @select-dialogue-model="selectDialogueModel"
        />
        <main v-else-if="isProjectRoute" class="route-loading" aria-label="项目加载中">
          <div v-if="error" class="route-error">
            <strong>项目打开失败</strong>
            <span>{{ error }}</span>
            <button type="button" @click="goProjectLibrary">返回项目库</button>
          </div>
          <span v-else>正在打开项目...</span>
        </main>
        <ProjectLibraryView v-else />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import type { AIRuntimeModelSelection, UpdateProjectDraftRequest } from "@airoaming/shared";
import AppSidebar from "./AppSidebar.vue";
import TopBar from "./TopBar.vue";
import ProjectLibraryView from "../projects/ProjectLibraryView.vue";
import ProjectWorkbenchView from "../workbench/ProjectWorkbenchView.vue";
import { getStepKeyFromSlug, getStepSlugFromKey, projectRoute } from "../../router";
import { useWorkbenchStore } from "../../stores/workbench-store";

const workbench = useWorkbenchStore();
const route = useRoute();
const router = useRouter();
const {
  activeStepKey,
  dialogueError,
  dialogueSending,
  dialogueThread,
  error,
  loading,
  projects,
  runtimeModelError,
  runtimeModels,
  selectedDialogueModel,
  snapshot,
} = storeToRefs(workbench);

const routeProjectId = computed(() => {
  const value = route.params.projectId;
  return typeof value === "string" ? value : null;
});
const routeStepKey = computed(() => {
  const value = route.params.step;
  return getStepKeyFromSlug(typeof value === "string" ? value : undefined);
});
const isProjectRoute = computed(() => Boolean(routeProjectId.value));

watch(
  [routeProjectId, routeStepKey],
  async ([projectId, stepKey]) => {
    if (projectId) {
      await workbench.openProject(projectId, stepKey);
      void workbench.loadRuntimeModels();
      return;
    }

    workbench.closeProject();
    await workbench.refresh();
  },
  { immediate: true },
);

async function saveStory(input: UpdateProjectDraftRequest) {
  await workbench.saveProjectDraft(input);
}

async function sendDialogue(content: string) {
  await workbench.sendDialogueMessage(content);
}

function selectDialogueModel(model: AIRuntimeModelSelection) {
  workbench.selectDialogueModel(model);
}

async function goProjectLibrary() {
  await router.push({ name: "projects" });
}

async function goProjectStep(stepKey: string) {
  const projectId = routeProjectId.value;
  if (!projectId) {
    return;
  }

  await router.push(projectRoute(projectId, getStepSlugFromKey(stepKey)));
}
</script>

<style scoped>
.route-loading {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: #95a3c2;
  font-size: 14px;
  font-weight: 900;
}

.route-error {
  display: grid;
  gap: 10px;
  justify-items: center;
  color: #95a3c2;
}

.route-error strong {
  color: #f8fbff;
  font-size: 18px;
}

.route-error button {
  min-height: 38px;
  border: 1px solid rgba(34, 199, 169, 0.24);
  border-radius: 10px;
  background: rgba(34, 199, 169, 0.1);
  color: #8df0dc;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
}
</style>
