<template>
  <section class="library-hero" aria-label="项目库操作区">
    <div class="library-hero-left">
      <h3>我的项目</h3>
      <p>{{ heroSubtitle }}</p>
    </div>
    <button class="library-hero-btn" type="button" @click="$emit('create')">
      <Plus :size="16" />
      <span>新建项目</span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Plus } from "lucide-vue-next";
import type { ProjectListItem } from "@airoaming/shared";
import { formatRelativeDate } from "../../utils/project-ui";

const props = defineProps<{
  projects: ProjectListItem[];
}>();

defineEmits<{
  create: [];
}>();

const heroSubtitle = computed(() => {
  const list = props.projects;
  if (list.length === 0) {
    return "还没有项目，点击右侧新建";
  }
  const latest = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  return `${list.length} 个项目 · 上次编辑 ${latest.name} · ${formatRelativeDate(latest.updatedAt)}`;
});
</script>
