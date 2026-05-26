<template>
  <aside class="app-sidebar" aria-label="主导航">
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.label"
        class="sidebar-nav-item"
        :class="{ 'is-active': item.status === 'current', 'is-muted': item.status !== 'current' }"
        type="button"
        :aria-current="item.status === 'current' ? 'page' : undefined"
      >
        <component :is="item.icon" :size="20" />
        <span>{{ item.label }}</span>
        <small v-if="item.badge" class="nav-badge">{{ item.badge }}</small>
      </button>
    </nav>

  </aside>
</template>

<script setup lang="ts">
import { FolderKanban, Images, ListTodo, Settings } from "lucide-vue-next";

const navItems = [
  {
    label: "项目库",
    status: "current",
    badge: "",
    icon: FolderKanban,
  },
  {
    label: "素材库",
    status: "planned",
    badge: "",
    icon: Images,
  },
  {
    label: "任务队列",
    status: "shell",
    badge: "",
    icon: ListTodo,
  },
  {
    label: "设置",
    status: "planned",
    badge: "",
    icon: Settings,
  },
] as const;
</script>
