<template>
  <section class="workbench-stage-rail" aria-label="项目创作流程">
    <div class="rail-container">
      <template v-for="(stage, index) in stages" :key="stage.key">
        <button
          class="stage-step"
          :class="[`is-${stage.status}`, { 'is-current': stage.key === activeStepKey }]"
          type="button"
          :disabled="!canSelectStage(stage)"
          :title="stage.summary"
          @click="$emit('selectStep', stage.key)"
        >
          <div class="stage-icon-box">
            <component :is="getStageIcon(index)" :size="18" />
          </div>
          <span class="stage-text">
            <span class="stage-label">{{ index + 1 }} {{ stage.label }}</span>
            <span class="stage-state">{{ stage.summary }}</span>
          </span>
        </button>
        <div v-if="index < stages.length - 1" class="stage-connector">
          <ChevronRight :size="14" />
        </div>
        <div v-if="index < stages.length - 1" class="stage-connector"></div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { BookOpen, ChevronRight, Image, LayoutDashboard, LayoutTemplate, ListTree, Package } from "lucide-vue-next";
import type { WorkbenchStage } from "@airoaming/shared";

defineProps<{
  activeStepKey: string;
  stages: WorkbenchStage[];
}>();

defineEmits<{
  selectStep: [stepKey: string];
}>();

function canSelectStage(stage: WorkbenchStage) {
  return stage.status === "done" || stage.status === "active";
}

const ICONS = [BookOpen, ListTree, LayoutTemplate, Image, LayoutDashboard, Package];
function getStageIcon(index: number) {
  return ICONS[index % ICONS.length];
}
</script>

<style scoped>
.workbench-stage-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0 12px;
  width: 100%;
}

.rail-container {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 20, 36, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 6px 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.stage-step {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  padding: 6px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.stage-step:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.stage-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: #64748b;
  transition: all 0.2s;
}

.stage-step.is-current .stage-icon-box {
  background: rgba(139, 92, 246, 0.15);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.stage-step.is-done:not(.is-current) .stage-icon-box {
  color: #94a3b8;
}

.stage-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stage-label {
  font-size: 14px;
  font-weight: 700;
  color: #94a3b8;
  white-space: nowrap;
}

.stage-step.is-current .stage-label {
  color: #ffffff;
}

.stage-step.is-done:not(.is-current) .stage-label {
  color: #cbd5e1;
}

.stage-state {
  font-size: 11px;
  font-weight: 500;
  color: #475569;
}

.stage-step.is-current .stage-state {
  color: #94a3b8;
}

.stage-step.is-done:not(.is-current) .stage-state {
  color: #64748b;
}

.stage-connector {
  display: flex;
  align-items: center;
  color: #475569;
}

@media (max-width: 900px) {
  .stage-state {
    display: none;
  }
}
@media (max-width: 768px) {
  .stage-step:not(.is-current) .stage-label {
    display: none;
  }
}
</style>
