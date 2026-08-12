<template>
  <div class="app-shell" :class="{ 'is-project-mode': isProjectRoute }">
    <TopBar
      :project-count="projects.length"
      :running-tasks="workbench.runningTaskCount"
      :tasks="tasks"
      :is-project-route="isProjectRoute"
      :project-name="snapshot?.project.name"
      @back="goProjectLibrary"
      @open-characters="openCharacterLibrary"
      @refresh-tasks="refreshTasks"
    />
    <div class="app-body">
      <AppSidebar v-if="!isProjectRoute" />
      <section class="app-main" :aria-label="mainAriaLabel">
        <ProjectWorkbenchView
          v-if="isProjectRoute && snapshot"
          :active-step-key="activeStepKey"
          :chapter-completion-prompt="chapterCompletionPrompt"
          :dialogue-error="dialogueError || error"
          :dialogue-notice="dialogueNotice"
          :dialogue-sending="dialogueSending"
          :dialogue-thread="dialogueThread"
          :dialogue-models="dialogueModels"
          :loading="loading"
          :running-tasks="workbench.runningTaskCount"
          :runtime-model-error="runtimeModelError"
          :script-working-copy="scriptWorkingCopy"
          :snapshot="snapshot"
          :tasks="tasks"
          @send-dialogue="sendDialogue"
          @select-dialogue-model="selectDialogueModel"
          @retry-import-item="retryImportItem"
          @open-characters="openCharacterLibrary"
          @save-chapter-draft="saveChapterDraft"
          @complete-chapter="completeChapter"
          @extract-characters="extractProjectCharacters"
          @regenerate-character-reference="regenerateCharacterReference"
          @confirm-character-preview="confirmCharacterPreview"
          @confirm-character-reference="confirmCharacterReference"
          @confirm-anchor="confirmAnchor"
          @generate-scene-reference="generateSceneReference"
          @confirm-story-structure="confirmStoryStructure"
          @confirm-storyboard="confirmStoryboard"
          @confirm-image-preflight="confirmImagePreflight"
          @generate-image-candidates="generateImageCandidates"
          @optimize-shot-prompt="optimizeShotPrompt"
          @generate-all-unlocked="generateAllUnlocked"
          @candidate-changed="refreshCandidateState"
          @complete-images="completeImages"
          @export-package="exportPackage"
          @dismiss-completion-prompt="workbench.clearChapterCompletionPrompt"
          @reset-script="clearCurrentChapterScript"
          @confirm-pending-source="confirmPendingSource"
          @discard-pending-source="discardPendingSource"
          @select-chapter="goProjectChapter"
          @select-step="goProjectStep"
          @update-story-structure="updateStoryStructure"
          @update-storyboard="updateStoryboard"
          @save-pending-storyboard="savePendingStoryboard"
        />
        <main v-else-if="isProjectRoute" class="route-loading" aria-label="项目加载中">
          <div v-if="error" class="route-error">
            <strong>项目打开失败</strong>
            <span>{{ error }}</span>
            <button type="button" @click="goProjectLibrary">返回项目库</button>
          </div>
          <span v-else>正在打开项目...</span>
        </main>
        <AppSettingsView v-else-if="isSettingsRoute" />
        <DocumentLibraryView v-else-if="isDocumentsRoute" />
        <ProjectLibraryView v-else />
        <ProjectCharactersModal
          v-if="isProjectRoute && snapshot"
          :open="isCharacterLibraryOpen"
          initial-view="context"
          :loading="loading"
          :snapshot="snapshot"
          :tasks="tasks"
          @close="isCharacterLibraryOpen = false"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import type { CandidatePromptOverrides, CompleteChapterRequest, ManagedModelItem, ProjectCharacter, SaveChapterDraftRequest, SendDialogueMessageRequest, StoryboardJson, StoryStructureJson, UpdateProjectCharacterRequest } from "@airoaming/shared";
import AppSidebar from "./AppSidebar.vue";
import TopBar from "./TopBar.vue";
import AppSettingsView from "../settings/AppSettingsView.vue";
import ProjectLibraryView from "../projects/ProjectLibraryView.vue";
import DocumentLibraryView from "../documents/DocumentLibraryView.vue";
import ProjectCharactersModal from "../workbench/ProjectCharactersModal.vue";
import ProjectWorkbenchView from "../workbench/ProjectWorkbenchView.vue";
import { getStepKeyFromSlug, getStepSlugFromKey, projectRoute } from "../../router";
import { useSettingsStore } from "../../stores/settings-store";
import { useWorkbenchStore } from "../../stores/workbench-store";

const workbench = useWorkbenchStore();
const settingsStore = useSettingsStore();
const route = useRoute();
const router = useRouter();
const {
  activeStepKey,
  chapterCompletionPrompt,
  dialogueError,
  dialogueNotice,
  dialogueSending,
  dialogueThread,
  error,
  loading,
  projects,
  runtimeModelError,
  scriptWorkingCopy,
  snapshot,
  tasks,
} = storeToRefs(workbench);

const dialogueModels = computed(() => (settingsStore.settings?.models ?? []).filter((model) => model.kind === "text"));

let runtimePoller: ReturnType<typeof setInterval> | null = null;
let taskPoller: ReturnType<typeof setInterval> | null = null;
let importPoller: ReturnType<typeof setInterval> | null = null;
const isCharacterLibraryOpen = ref(false);

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
const isSettingsRoute = computed(() => route.name === "settings");
const isDocumentsRoute = computed(() => route.name === "documents");
const mainAriaLabel = computed(() => {
  if (isProjectRoute.value) {
    return "绘界漫画项目工作区";
  }
  if (isSettingsRoute.value) {
    return "绘界漫画设置";
  }
  if (isDocumentsRoute.value) {
    return "绘界漫画文稿库";
  }
  return "绘界漫画项目库";
});

watch(routeProjectId, (projectId, previousProjectId) => {
  if (!projectId || (previousProjectId && projectId !== previousProjectId)) {
    isCharacterLibraryOpen.value = false;
  }
});

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

      await workbench.openProject(projectId, stepKey, chapterId, {
        preserveSnapshot: Boolean(snapshot.value && workbench.activeProjectId === projectId),
      });
      void workbench.loadRuntimeModels();
      return;
    }

    workbench.closeProject();
    await workbench.refresh();
  },
  { immediate: true },
);

watch(
  [isProjectRoute, activeStepKey, () => workbench.runningTaskCount, isCharacterLibraryOpen],
  ([projectRoute, stepKey, runningTaskCount, characterLibraryOpen]) => {
    const shouldPoll = Boolean(
      projectRoute
      && runningTaskCount > 0
      && (characterLibraryOpen || ["story_structure", "project_characters", "image_preflight", "image_candidates"].includes(stepKey)),
    );
    if (!shouldPoll) {
      stopRuntimePolling();
      return;
    }
    startRuntimePolling();
  },
  { immediate: true },
);

watch(
  () => workbench.runningTaskCount,
  (runningTaskCount) => {
    if (runningTaskCount > 0) {
      startTaskPolling();
      return;
    }
    stopTaskPolling();
  },
  { immediate: true },
);

watch(
  () => workbench.importBatchNeedsPolling,
  (shouldPoll) => {
    if (shouldPoll) startImportPolling();
    else stopImportPolling();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopRuntimePolling();
  stopTaskPolling();
  stopImportPolling();
});

// 模型管理列表(对话面板切换器数据源)在应用级预加载。
void settingsStore.loadSettings();

async function saveChapterDraft(payload: { chapterId: string; input: SaveChapterDraftRequest }) {
  await workbench.saveChapterDraft(payload.chapterId, payload.input);
}

async function confirmPendingSource(chapterId: string) {
  await workbench.confirmChapterPendingSource(chapterId);
}

async function discardPendingSource(chapterId: string) {
  await workbench.discardChapterPendingSource(chapterId);
}

async function completeChapter(payload: { chapterId: string; input: CompleteChapterRequest }) {
  const result = await workbench.completeChapter(payload.chapterId, payload.input);
  if (!result || !routeProjectId.value) {
    return;
  }

  await router.push(projectRoute(routeProjectId.value, "script", result.completedChapter.id));
}

async function extractProjectCharacters() {
  await workbench.extractProjectCharacters();
}

async function regenerateCharacterReference(payload: {
  characterId: string;
  referenceKind: "preview_front" | "final_reference";
  input: UpdateProjectCharacterRequest;
}) {
  await workbench.updateAndGenerateCharacterReference(payload.characterId, payload.input, {
    referenceKind: payload.referenceKind,
  });
}

async function generateSceneReference(payload: { chapterId: string; sceneId: string }) {
  await workbench.generateSceneReference(payload.chapterId, payload.sceneId, {
    requestId: crypto.randomUUID(),
  });
}

async function confirmCharacterPreview(payload: { characterId: string; assetId: string }) {
  await workbench.confirmCharacterPreview(payload.characterId, payload.assetId);
}

async function confirmCharacterReference(payload: { characterId: string; assetId: string }) {
  await workbench.confirmCharacterReference(payload.characterId, payload.assetId);
}

async function confirmAnchor(payload: { characterId: string; assetId: string; character?: ProjectCharacter }) {
  await workbench.confirmAnchor(payload.characterId, payload.assetId, payload.character);
}

async function confirmStoryStructure(payload: { chapterId: string; structureJson: StoryStructureJson }) {
  await workbench.confirmStoryStructure(payload.chapterId, payload.structureJson);
}

async function updateStoryStructure(payload: { chapterId: string; structureJson: StoryStructureJson }) {
  await workbench.updateStoryStructure(payload.chapterId, payload.structureJson);
}

async function confirmStoryboard(payload: { chapterId: string; storyboardJson: StoryboardJson }) {
  await workbench.confirmStoryboard(payload.chapterId, payload.storyboardJson);
}

async function confirmImagePreflight(chapterId: string) {
  await workbench.confirmImagePreflight(chapterId);
}

async function generateImageCandidates(payload: { shotId: string; candidateCount: number; promptOverrides: CandidatePromptOverrides }) {
  await workbench.generateImageCandidates(payload.shotId, payload.candidateCount, payload.promptOverrides);
}

async function optimizeShotPrompt(payload: { shotId: string; promptOverrides: CandidatePromptOverrides }) {
  await workbench.optimizeShotPrompt(payload.shotId, payload.promptOverrides);
}

async function generateAllUnlocked(payload: { promptOverridesByShot: Record<string, CandidatePromptOverrides> }) {
  await workbench.generateAllUnlockedShots(1, payload.promptOverridesByShot);
}

async function refreshCandidateState() {
  await workbench.refreshActiveProjectRuntime();
}

async function completeImages() {
  const ok = await workbench.completeChapterImages();
  if (ok) {
    await goProjectStep("layout_export");
  }
}

async function exportPackage() {
  await workbench.exportAssetPackage();
}

async function updateStoryboard(payload: { chapterId: string; storyboardJson: StoryboardJson }) {
  await workbench.updateStoryboard(payload.chapterId, payload.storyboardJson);
}

async function savePendingStoryboard(payload: { chapterId: string; storyboardJson: StoryboardJson }) {
  await workbench.savePendingStoryboard(payload.chapterId, payload.storyboardJson);
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

async function selectDialogueModel(model: ManagedModelItem) {
  await workbench.selectDialogueModel(model);
}

async function retryImportItem(payload: { batchId: string; itemId: string }) {
  await workbench.retryScriptImportItem(payload.batchId, payload.itemId);
}

async function refreshTasks() {
  await workbench.refreshTasks();
}

async function goProjectLibrary() {
  isCharacterLibraryOpen.value = false;
  await router.push({ name: "projects" });
}

function openCharacterLibrary() {
  if (!isProjectRoute.value || !snapshot.value) {
    return;
  }

  isCharacterLibraryOpen.value = true;
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

  if (activeStepKey.value === "project_story") {
    await router.push(projectRoute(projectId, "script", chapterId));
    return;
  }

  await workbench.openProject(projectId, activeStepKey.value, chapterId, {
    preserveSnapshot: true,
  });
}

function startRuntimePolling() {
  if (runtimePoller) {
    return;
  }
  runtimePoller = setInterval(() => {
    // 候选图/角色图运行时需要连同 snapshot 一起刷新，才能看到新候选与锁定状态
    void workbench.refreshActiveProjectRuntime();
  }, 1800);
}

function stopRuntimePolling() {
  if (!runtimePoller) {
    return;
  }
  clearInterval(runtimePoller);
  runtimePoller = null;
}

function startTaskPolling() {
  if (taskPoller) {
    return;
  }
  taskPoller = setInterval(() => {
    void workbench.refreshTasks();
  }, 1800);
}

function stopTaskPolling() {
  if (!taskPoller) {
    return;
  }
  clearInterval(taskPoller);
  taskPoller = null;
}

function startImportPolling() {
  if (importPoller) return;
  void workbench.syncScriptImportBatch();
  importPoller = setInterval(() => void workbench.syncScriptImportBatch(), 800);
}

function stopImportPolling() {
  if (!importPoller) return;
  clearInterval(importPoller);
  importPoller = null;
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
