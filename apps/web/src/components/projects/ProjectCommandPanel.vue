<template>
  <section class="hero-banner" aria-label="项目库操作区">
    <div class="hero-bg">
      <img class="hero-image" :src="heroBannerUrl" alt="" />
      <div class="hero-glow"></div>
    </div>

    <div class="hero-content">
      <button class="primary-action pulse-btn" type="button" @click="$emit('create')">
        <Plus :size="20" />
        <span>新建项目</span>
      </button>
    </div>

    <WorkflowStrip class="overlay-workflow" />
  </section>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import heroBannerUrl from "../../assets/project-library/hero-banner.png";
import WorkflowStrip from "./WorkflowStrip.vue";

defineProps<{
  runningTasks: number;
  completedTasks: number;
  loading: boolean;
}>();

defineEmits<{
  create: [];
  refresh: [];
}>();
</script>
