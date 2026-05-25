<template>
  <div class="app-shell">
    <AppSidebar />
    <section class="app-main" :aria-label="snapshot ? '绘界漫画项目工作区' : '绘界漫画项目库'">
      <TopBar
        :project-count="projects.length"
        :placeholder="snapshot ? '搜索当前项目内容...' : '搜索项目、故事或素材...'"
        :running-tasks="workbench.runningTaskCount"
        :search="projectSearch"
        @update:search="projectSearch = $event"
      />
      <ProjectWorkbenchView
        v-if="snapshot"
        :loading="loading"
        :running-tasks="workbench.runningTaskCount"
        :snapshot="snapshot"
        @analyze-story="analyzeStory"
        @back="workbench.closeProject"
        @save-story="saveStory"
      />
      <ProjectLibraryView v-else :search-query="projectSearch" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import type { UpdateProjectDraftRequest } from "@airoaming/shared";
import AppSidebar from "./AppSidebar.vue";
import TopBar from "./TopBar.vue";
import ProjectLibraryView from "../projects/ProjectLibraryView.vue";
import ProjectWorkbenchView from "../workbench/ProjectWorkbenchView.vue";
import { useWorkbenchStore } from "../../stores/workbench-store";

const workbench = useWorkbenchStore();
const { loading, projects, snapshot } = storeToRefs(workbench);
const projectSearch = ref("");

async function saveStory(input: UpdateProjectDraftRequest) {
  await workbench.saveProjectDraft(input);
}

async function analyzeStory() {
  await workbench.createMockStoryTask();
}
</script>
