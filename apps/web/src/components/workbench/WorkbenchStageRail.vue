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
          <span class="stage-num">
            <Check :size="12" v-if="stage.status === 'done'" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="stage-label">{{ stage.label }}</span>
        </button>
        <span v-if="index < stages.length - 1" class="stage-connector">›</span>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Check } from "lucide-vue-next";
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
</script>

<style scoped>
.workbench-stage-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0 8px;
  width: 100%;
}

.rail-container {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(15, 20, 36, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 6px 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.stage-step {
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: none;
  padding: 6px 11px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.stage-step:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.04);
}

.stage-step:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.stage-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

/* done = 绿底 ✓ */
.is-done .stage-num {
  background: #22c55e;
  color: #fff;
}

/* current = 蓝底数字 + 光晕 */
.is-current .stage-num {
  background: #6366f1;
  color: #fff;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

/* active 非 current（可点）= 蓝边 */
.is-active:not(.is-current) .stage-num {
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

/* waiting/blocked = 灰底 */
.is-waiting .stage-num,
.is-blocked .stage-num {
  background: rgba(255, 255, 255, 0.06);
  color: #64748b;
}

.is-blocked .stage-num {
  color: #f59e0b;
}

.stage-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.is-current .stage-label {
  color: #ffffff;
}

.is-done:not(.is-current) .stage-label {
  color: #cbd5e1;
}

.is-active:not(.is-current):not(.is-done) .stage-label {
  color: #94a3b8;
}

.is-waiting .stage-label,
.is-blocked .stage-label {
  color: #64748b;
}

.stage-connector {
  color: #475569;
  font-size: 10px;
  opacity: 0.5;
}

@media (max-width: 900px) {
  .stage-label {
    display: none;
  }
  .stage-step.is-current .stage-label {
    display: inline;
  }
}
</style>
