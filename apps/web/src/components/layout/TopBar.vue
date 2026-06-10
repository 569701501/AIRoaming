<template>
  <header class="topbar">
    <div class="brand-lockup">
      <div class="brand-logo-img">
        <Sparkles :size="24" color="#9b8dff" />
      </div>
      <strong class="brand-name">绘界漫画</strong>

      <div v-if="isProjectRoute" class="project-selector">
        <button class="back-to-list-btn" @click="$emit('back')">
          <ArrowLeft :size="14" />
          <span>返回项目列表</span>
        </button>
      </div>
    </div>

    <div class="topbar-actions">
      <button v-if="isProjectRoute" class="ghost-action" type="button" title="项目角色库" @click="$emit('open-characters')">
        <UsersRound :size="18" />
        <span>角色库</span>
      </button>

      <div class="task-queue-dropdown">
        <button class="ghost-action" type="button" title="任务队列" @click="isTaskQueueOpen = !isTaskQueueOpen">
          <ListTodo :size="18" />
          <span>任务队列</span>
          <b class="task-badge">{{ runningTasks }}</b>
        </button>

        <div v-if="isTaskQueueOpen" class="task-queue-popup">
          <div class="queue-header">
            <span>任务队列 <b class="queue-count">{{ runningTasks }}</b></span>
            <button class="text-btn" type="button" @click="$emit('refresh-tasks')">刷新</button>
          </div>
          <div class="queue-list">
            <div v-if="recentTasks.length === 0" class="queue-empty">
              暂无生成任务
            </div>
            <div v-for="task in recentTasks" v-else :key="task.id" class="queue-item">
              <LoaderCircle v-if="isActiveTask(task)" :size="14" class="queue-icon purple is-spinning" />
              <CheckCircle2 v-else-if="task.status === 'succeeded'" :size="14" class="queue-icon green" />
              <AlertCircle v-else-if="task.status === 'failed'" :size="14" class="queue-icon red" />
              <Layers v-else :size="14" class="queue-icon blue" />
              <span class="queue-name">{{ getTaskName(task) }}</span>
              <span class="queue-progress">{{ getTaskProgress(task) }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <button class="notification-btn" type="button" aria-label="通知">
        <Bell :size="18" />
        <span class="notification-dot"></span>
      </button>
      <div class="user-profile">
        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User Avatar" class="avatar-img" />
        <span class="user-name">墨染星河</span>
        <ChevronDown :size="14" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertCircle, ArrowLeft, Bell, CheckCircle2, ChevronDown, Layers, ListTodo, LoaderCircle, Sparkles, UsersRound } from "lucide-vue-next";
import type { GenerationTaskItem, GenerationTaskStatus, GenerationTaskType } from "@airoaming/shared";

const props = defineProps<{
  runningTasks: number;
  tasks: GenerationTaskItem[];
  projectCount: number;
  isProjectRoute?: boolean;
  projectName?: string;
}>();

defineEmits<{
  back: [];
  "refresh-tasks": [];
  "open-characters": [];
}>();

const isTaskQueueOpen = ref(false);
const recentTasks = computed(() => props.tasks.slice(0, 8));

function isActiveTask(task: GenerationTaskItem) {
  return task.status === "queued" || task.status === "running" || task.status === "retrying";
}

function getTaskName(task: GenerationTaskItem) {
  const taskLabel = getTaskTypeLabel(task.type);
  if (task.type === "character_reference_generate") {
    const referenceKind = task.input.referenceKind === "final_reference" ? "角色定稿图" : "角色预览图";
    return `${referenceKind} · ${taskInputText(task.input.characterName) || shortId(task.target?.id ?? task.input.characterId)}`;
  }
  return `${taskLabel} · ${shortId(task.target?.id)}`;
}

function getTaskTypeLabel(type: GenerationTaskType) {
  const labels: Record<GenerationTaskType, string> = {
    story_parse: "剧情结构",
    character_reference_generate: "角色图生成",
    shot_generate: "分镜生成",
    shot_prompt_generate: "提示词生成",
    image_generate: "候选图生成",
    layout_export: "排版导出",
    asset_package_export: "素材包",
    tts_generate: "配音生成",
    video_export: "视频导出",
  };
  return labels[type];
}

function getTaskProgress(task: GenerationTaskItem) {
  if (task.status === "running" && typeof task.progressPercent === "number") {
    return `${Math.round(task.progressPercent)}%`;
  }
  const labels: Record<GenerationTaskStatus, string> = {
    queued: "排队中",
    running: "运行中",
    retrying: "等待重试",
    succeeded: "完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[task.status];
}

function shortId(value: unknown) {
  return typeof value === "string" && value ? value.slice(0, 8) : "项目";
}

function taskInputText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
</script>
