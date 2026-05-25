<template>
  <section class="workbench-stage-rail" aria-label="项目创作流程">
    <button
      v-for="(stage, index) in stages"
      :key="stage.key"
      class="stage-step"
      :class="[`is-${stage.status}`, { 'is-current': index === 0 }]"
      type="button"
      :disabled="index !== 0"
    >
      <span class="stage-index">{{ index + 1 }}</span>
      <span class="stage-copy">
        <strong>{{ stage.label }}</strong>
        <small>{{ stage.summary }}</small>
      </span>
    </button>
  </section>
</template>

<script setup lang="ts">
import type { WorkbenchStage } from "@airoaming/shared";

defineProps<{
  stages: WorkbenchStage[];
}>();
</script>

<style scoped>
.workbench-stage-rail {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.stage-step {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 66px;
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 10px;
  background: rgba(13, 18, 33, 0.72);
  color: #d9e2f5;
  padding: 10px;
  text-align: left;
}

.stage-step:disabled {
  cursor: default;
}

.stage-step.is-current {
  border-color: rgba(34, 199, 169, 0.42);
  background: linear-gradient(135deg, rgba(34, 199, 169, 0.16), rgba(139, 92, 246, 0.12));
}

.stage-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.18);
  color: #c9bbff;
  font-size: 13px;
  font-weight: 900;
}

.stage-step.is-current .stage-index {
  background: rgba(34, 199, 169, 0.2);
  color: #75ead3;
}

.stage-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.stage-copy strong,
.stage-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-copy strong {
  color: #f8fbff;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.2;
}

.stage-copy small {
  color: #7e8ba8;
  font-size: 11px;
  line-height: 1.2;
}

@media (max-width: 1180px) {
  .workbench-stage-rail {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .workbench-stage-rail {
    grid-template-columns: 1fr;
  }
}
</style>
