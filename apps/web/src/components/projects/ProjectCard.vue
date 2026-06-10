<template>
  <article class="project-card" :class="{ 'is-active': active }">
    <div class="project-cover-wrapper">
      <div class="project-cover" :class="`project-cover-${accent}`">
        <img class="project-cover-image" :src="coverSrc" :alt="`${project.name} 项目封面`" />
        <span class="status-badge" :class="`tone-${status.tone}`">{{ status.label }}</span>
      </div>
      <div class="project-cover-overlay"></div>
      <button
        class="project-delete-btn"
        type="button"
        :aria-label="`删除项目 ${project.name}`"
        @click.stop.prevent="$emit('request-delete', project)"
        @pointerdown.stop
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <div class="project-card-body">
      <div class="project-card-title">
        <strong>{{ project.name }}</strong>
        <p>{{ digest }}</p>
      </div>

      <div class="project-meta">
        <div class="meta-left">
          <span>最近编辑: {{ formatRelativeDate(project.updatedAt) }}</span>
        </div>
        <div class="meta-right">
          <span class="progress-text">{{ progress }}%</span>
        </div>
      </div>

      <div class="progress-row" aria-label="项目进度">
        <span :style="{ width: `${progress}%` }"></span>
      </div>

      <div class="project-stat-row" aria-label="项目概览指标">
        <div class="project-stats-icons">
          <div class="stat-icon-item"><Eye :size="14" /> <span>38</span></div>
          <div class="stat-icon-item"><MessageSquare :size="14" /> <span>15</span></div>
          <div class="stat-icon-item"><Heart :size="14" /> <span>12</span></div>
          <div class="stat-icon-item"><Users :size="14" /> <span>7</span></div>
        </div>
      </div>

      <div class="project-card-footer">
        <button class="continue-btn" type="button" @click="$emit('open', project.id)">
          <span>{{ active ? "已选择" : "继续创作" }}</span>
        </button>
        <button class="more-btn" type="button"><MoreHorizontal :size="14" /></button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Eye, Heart, MessageSquare, MoreHorizontal, Trash2, Users } from "lucide-vue-next";
import type { ProjectListItem } from "@airoaming/shared";
import coverMistTown from "../../assets/project-library/project-cover-mist-town.png";
import coverRainCity from "../../assets/project-library/project-cover-rain-city.png";
import coverSchoolNight from "../../assets/project-library/project-cover-school-night.png";
import coverTransit from "../../assets/project-library/project-cover-transit.png";
import {
  formatRelativeDate,
  getProjectAccent,
  getProjectDigest,
  getProjectProgress,
  projectStatusMeta,
} from "../../utils/project-ui";

const props = defineProps<{
  project: ProjectListItem;
  active: boolean;
}>();

defineEmits<{
  open: [projectId: string];
  "request-delete": [project: ProjectListItem];
}>();

const status = computed(() => projectStatusMeta[props.project.status]);
const progress = computed(() => getProjectProgress(props.project));
const digest = computed(() => getProjectDigest(props.project));
const accent = computed(() => getProjectAccent(props.project.id));
const coverImages = [coverRainCity, coverTransit, coverMistTown, coverSchoolNight] as const;
const coverSrc = computed(() => coverImages[accent.value - 1]);
</script>
