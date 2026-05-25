<template>
  <header class="topbar">
    <label class="topbar-search">
      <Search :size="18" class="search-icon" />
      <input
        :value="search"
        type="search"
        :placeholder="placeholder"
        @input="onSearchInput"
      />
      <div class="search-shortcut">⌘ K</div>
    </label>

    <div class="topbar-actions">
      <div class="task-queue-dropdown">
        <button class="ghost-action" type="button" title="任务队列" @click="isTaskQueueOpen = !isTaskQueueOpen">
          <ListTodo :size="18" />
          <span>任务队列</span>
          <b class="task-badge">{{ runningTasks }}</b>
        </button>

        <div v-if="isTaskQueueOpen" class="task-queue-popup">
          <div class="queue-header">
            <span>任务队列 <b class="queue-count">{{ runningTasks }}</b></span>
            <button class="text-btn">查看全部</button>
          </div>
          <div class="queue-list">
            <div class="queue-item">
              <Layers :size="14" class="queue-icon blue" />
              <span class="queue-name">分镜生成 · 星渊边境 · 序章</span>
              <span class="queue-progress">60%</span>
            </div>
            <div class="queue-item">
              <UserSquare :size="14" class="queue-icon purple" />
              <span class="queue-name">角色线稿生成 · 龙与花之诗</span>
              <span class="queue-progress">排队中</span>
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
import { ref } from "vue";
import { Bell, ChevronDown, Layers, ListTodo, Search, UserSquare } from "lucide-vue-next";

defineProps<{
  search: string;
  runningTasks: number;
  projectCount: number;
  placeholder: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
}>();

const isTaskQueueOpen = ref(false);

function onSearchInput(event: Event) {
  emit("update:search", (event.target as HTMLInputElement).value);
}
</script>
