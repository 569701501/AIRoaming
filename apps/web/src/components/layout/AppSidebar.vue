<template>
  <aside class="app-sidebar" aria-label="主导航">
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.label"
        class="sidebar-nav-item"
        :class="{ 'is-active': isActive(item), 'is-muted': !isActive(item) && item.status !== 'current' }"
        type="button"
        :aria-current="isActive(item) ? 'page' : undefined"
        :disabled="!item.path"
        @click="goNav(item)"
      >
        <component :is="item.icon" :size="20" />
        <span>{{ item.label }}</span>
        <small v-if="item.badge" class="nav-badge">{{ item.badge }}</small>
      </button>
    </nav>

  </aside>
</template>

<script setup lang="ts">
import { BookOpen, FolderKanban, Images, ListTodo, Settings } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const navItems = [
  {
    label: "文稿库",
    status: "current",
    badge: "",
    icon: BookOpen,
    path: "/documents",
  },
  {
    label: "项目库",
    status: "current",
    badge: "",
    icon: FolderKanban,
    path: "/projects",
  },
  {
    label: "素材库",
    status: "planned",
    badge: "",
    icon: Images,
    path: "",
  },
  {
    label: "任务队列",
    status: "shell",
    badge: "",
    icon: ListTodo,
    path: "",
  },
  {
    label: "设置",
    status: "current",
    badge: "",
    icon: Settings,
    path: "/settings",
  },
] as const;

type NavItem = (typeof navItems)[number];

function isActive(item: NavItem): boolean {
  if (!item.path) {
    return false;
  }
  return route.path === item.path;
}

async function goNav(item: NavItem) {
  if (!item.path || route.path === item.path) {
    return;
  }
  await router.push(item.path);
}
</script>
