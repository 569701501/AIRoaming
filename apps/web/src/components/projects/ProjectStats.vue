<template>
  <section class="stats-grid" aria-label="项目统计">
    <article v-for="item in stats" :key="item.label" class="stat-card">
      <div class="stat-icon" :class="item.colorClass">
        <component :is="item.icon" :size="20" />
      </div>
      <div class="stat-content">
        <span>{{ item.label }}</span>
        <div class="stat-value-row">
          <strong>{{ item.value }}</strong>
          <span v-if="item.trend" class="stat-trend" :class="item.trendClass">{{ item.trend }}</span>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, Clock3, FolderKanban, ListTodo } from "lucide-vue-next";

const props = defineProps<{
  totalProjects: number;
  draftProjects: number;
  updatedToday: number;
  runningTasks: number;
}>();

const stats = computed(() => [
  {
    label: "项目总数",
    value: `${props.totalProjects}`,
    icon: FolderKanban,
    colorClass: "purple-icon",
  },
  {
    label: "进行中项目",
    value: `${props.draftProjects}`,
    trend: "较上周 +2",
    trendClass: "trend-up",
    icon: Clock3,
    colorClass: "blue-icon",
  },
  {
    label: "已归档项目",
    value: `8`,
    trend: "较上周 +1",
    trendClass: "trend-up",
    icon: CheckCircle2,
    colorClass: "green-icon",
  },
  {
    label: "本周新增",
    value: `${props.updatedToday}`,
    trend: "较上周 +2",
    trendClass: "trend-up",
    icon: ListTodo,
    colorClass: "amber-icon",
  },
]);
</script>
