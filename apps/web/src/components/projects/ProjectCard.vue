<template>
  <article class="project-card" :class="{ 'is-active': active }" @click="$emit('open', project.id)">
    <div class="project-cover-wrapper">
      <div class="project-cover" :class="[`project-cover-${accent}`, { 'is-empty': !leadImageSrc }]">
        <img v-if="leadImageSrc" class="project-cover-image" :src="leadImageSrc" :alt="`${project.name} 主角图`" />
        <span v-else class="project-cover-placeholder">还没有主角图</span>
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

      <div class="progress-row" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
        <span :style="{ width: `${progress * 100}%` }"></span>
      </div>

      <div class="project-card-foot">
        <span class="project-step" :class="{ 'is-done': isExported }">{{ progressLabel }}</span>
        <span class="project-date">{{ formatRelativeDate(project.updatedAt) }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Trash2 } from "lucide-vue-next";
import type { ProjectListItem } from "@airoaming/shared";
import {
  formatRelativeDate,
  getProjectAccent,
  getProjectDigest,
  getProjectStepLabel,
  getProjectStepProgress,
  projectStatusMeta,
} from "../../utils/project-ui";

const props = defineProps<{
  project: ProjectListItem;
  active: boolean;
  /** 项目主角定稿图地址，现阶段前端无数据时传空即可，后续由角色库接入 */
  leadImageSrc?: string;
}>();

defineEmits<{
  open: [projectId: string];
  "request-delete": [project: ProjectListItem];
}>();

const status = computed(() => projectStatusMeta[props.project.status]);
const digest = computed(() => getProjectDigest(props.project));
const accent = computed(() => getProjectAccent(props.project.id));
const isExported = computed(() => props.project.status === "exported");
const progressLabel = computed(() => getProjectStepLabel(props.project));
const progress = computed(() => getProjectStepProgress(props.project));
</script>
