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
          :dialogue-notice="dialogueNotice"
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
          @save-chapter-draft="saveChapterDraft"
          @complete-chapter="completeChapter"
          @reset-script="clearCurrentChapterScript"
          @select-chapter="goProjectChapter"
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
import type { AIRuntimeModelSelection, CompleteChapterRequest, SaveChapterDraftRequest, SendDialogueMessageRequest } from "@airoaming/shared";
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
  dialogueNotice,
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
const routeChapterId = computed(() => {
  const value = route.params.chapterId;
  return typeof value === "string" ? value : null;
});
const isProjectRoute = computed(() => Boolean(routeProjectId.value));

watch(
  [routeProjectId, routeStepKey, routeChapterId],
  async ([projectId, stepKey, chapterId]) => {
    if (projectId) {
      const alreadyOpen = snapshot.value
        && workbench.activeProjectId === projectId
        && workbench.activeStepKey === stepKey
        && (chapterId === null || workbench.activeChapterId === chapterId)
        && workbench.dialogueThread;
      if (alreadyOpen) {
        return;
      }

      await workbench.openProject(projectId, stepKey, chapterId);
      void workbench.loadRuntimeModels();
      return;
    }

    workbench.closeProject();
    await workbench.refresh();
  },
  { immediate: true },
);

async function saveChapterDraft(payload: { chapterId: string; input: SaveChapterDraftRequest }) {
  await workbench.saveChapterDraft(payload.chapterId, payload.input);
}

async function completeChapter(payload: { chapterId: string; input: CompleteChapterRequest }) {
  const activeChapter = await workbench.completeChapter(payload.chapterId, payload.input);
  if (!activeChapter || !routeProjectId.value) {
    return;
  }

  await router.push(projectRoute(routeProjectId.value, "script", activeChapter.id));
}

async function clearCurrentChapterScript() {
  const activeChapter = await workbench.clearCurrentChapterScript();
  if (!activeChapter || !routeProjectId.value) {
    return;
  }

  await router.push(projectRoute(routeProjectId.value, "script", activeChapter.id));
}

async function sendDialogue(input: SendDialogueMessageRequest) {
  await workbench.sendDialogueMessage(input);
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

  const stepSlug = getStepSlugFromKey(stepKey);
  const chapterId = stepSlug === "script" ? snapshot.value?.currentChapter?.id : null;
  await router.push(projectRoute(projectId, stepSlug, chapterId));
}

async function goProjectChapter(chapterId: string) {
  const projectId = routeProjectId.value;
  if (!projectId) {
    return;
  }

  await router.push(projectRoute(projectId, "script", chapterId));
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
