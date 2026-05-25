<template>
  <main class="project-workbench">
    <section class="workbench-header">
      <button class="back-library-btn" type="button" @click="$emit('back')">
        <ArrowLeft :size="17" />
        <span>返回项目库</span>
      </button>

      <div class="workbench-title">
        <span>项目工作区</span>
        <h1>{{ snapshot.project.name }}</h1>
        <p>{{ snapshot.project.storyTitle }}</p>
      </div>

      <div class="workbench-status">
        <span>当前阶段</span>
        <strong>项目与故事</strong>
      </div>
    </section>

    <WorkbenchStageRail :stages="snapshot.stages" />

    <ProjectStoryPanel
      :loading="loading"
      :snapshot="snapshot"
      @analyze="$emit('analyzeStory')"
      @save="$emit('saveStory', $event)"
    />

    <section class="workbench-task-note" aria-label="任务状态">
      <div>
        <ListTodo :size="17" />
        <span>当前运行任务</span>
      </div>
      <strong>{{ runningTasks }}</strong>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ArrowLeft, ListTodo } from "lucide-vue-next";
import type { UpdateProjectDraftRequest, WorkbenchSnapshot } from "@airoaming/shared";
import ProjectStoryPanel from "./ProjectStoryPanel.vue";
import WorkbenchStageRail from "./WorkbenchStageRail.vue";

defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
  runningTasks: number;
}>();

defineEmits<{
  back: [];
  saveStory: [input: UpdateProjectDraftRequest];
  analyzeStory: [];
}>();
</script>

<style scoped>
.project-workbench {
  display: grid;
  gap: 16px;
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 22px 24px 30px;
}

.workbench-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-width: 0;
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(18, 24, 43, 0.78), rgba(8, 12, 24, 0.7)),
    rgba(8, 12, 24, 0.76);
  padding: 16px;
}

.back-library-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #d7def1;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 900;
}

.back-library-btn:hover {
  border-color: rgba(34, 199, 169, 0.24);
  background: rgba(34, 199, 169, 0.1);
  color: #ffffff;
}

.workbench-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.workbench-title span,
.workbench-status span {
  color: #95a3c2;
  font-size: 12px;
  font-weight: 900;
}

.workbench-title h1,
.workbench-title p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-title h1 {
  color: #f9fbff;
  font-size: 26px;
  font-weight: 900;
  line-height: 1.18;
}

.workbench-title p {
  color: #8c9ab8;
  font-size: 13px;
}

.workbench-status {
  display: grid;
  gap: 4px;
  justify-items: end;
  min-width: 136px;
}

.workbench-status strong {
  border: 1px solid rgba(34, 199, 169, 0.22);
  border-radius: 999px;
  background: rgba(34, 199, 169, 0.12);
  color: #7ce3ce;
  font-size: 13px;
  padding: 7px 11px;
}

.workbench-task-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  color: #92a0bc;
  padding: 12px 14px;
}

.workbench-task-note div {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
}

.workbench-task-note strong {
  color: #c9bbff;
  font-size: 18px;
}

@media (max-width: 860px) {
  .workbench-header {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .back-library-btn {
    width: fit-content;
  }

  .workbench-status {
    justify-items: start;
  }
}
</style>
