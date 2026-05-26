<template>
  <section class="workbench-stage-rail" aria-label="项目创作流程">
    <div class="rail-container">
      <template v-for="(stage, index) in stages" :key="stage.key">
        <button
          class="stage-step"
          :class="{ 'is-current': index === 0 }"
          type="button"
          :disabled="index !== 0"
        >
          <span class="stage-num">{{ index + 1 }}</span>
          <span class="stage-label">{{ stage.label }}</span>
        </button>
        <div v-if="index < stages.length - 1" class="stage-connector"></div>
      </template>
    </div>
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0 24px;
  width: 100%;
}

.rail-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stage-step {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 6px 16px;
  border-radius: 999px;
  color: #64748b;
  cursor: default;
  transition: all 0.2s;
}

.stage-step.is-current {
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.2);
  color: #f8fafc;
}

.stage-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
}

.stage-step.is-current .stage-num {
  background: #a78bfa;
  color: #1e1b4b;
}

.stage-label {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.stage-connector {
  width: 48px;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 900px) {
  .stage-connector {
    width: 20px;
  }
}
@media (max-width: 768px) {
  .stage-step:not(.is-current) .stage-label {
    display: none;
  }
}
</style>
