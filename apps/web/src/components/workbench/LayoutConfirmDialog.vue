<template>
  <Teleport to="body">
    <div v-if="open" class="layout-confirm-backdrop" role="presentation" @click.self="!busy && $emit('close')">
      <section class="layout-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="layout-confirm-title">
        <button class="layout-confirm-close" type="button" aria-label="关闭" :disabled="busy" @click="$emit('close')">
          <X :size="18" />
        </button>

        <div class="layout-confirm-icon">
          <AlertTriangle :size="22" />
        </div>

        <div class="layout-confirm-content">
          <span>{{ kindLabel }}</span>
          <h2 id="layout-confirm-title">{{ title }}</h2>
          <p>{{ message }}</p>
        </div>

        <div class="layout-confirm-actions">
          <button class="layout-confirm-secondary" type="button" :disabled="busy" @click="$emit('close')">取消</button>
          <button class="layout-confirm-danger" type="button" :disabled="busy" @click="$emit('confirm')">
            <Trash2 :size="15" />
            <span>{{ confirmLabel }}</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Trash2, X } from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  busy?: boolean;
  confirmLabel?: string;
  danger?: boolean;
}>();

defineEmits<{
  close: [];
  confirm: [];
}>();

const kindLabel = computed(() => (props.danger === false ? "提示" : "删除确认"));
</script>

<style scoped>
.layout-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(7, 10, 22, 0.68);
  backdrop-filter: blur(14px);
}

.layout-confirm-panel {
  position: relative;
  display: grid;
  gap: 18px;
  width: min(440px, 100%);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.96), rgba(10, 15, 30, 0.98)),
    #0f172a;
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  padding: 24px;
  color: #eef2ff;
}

.layout-confirm-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, color 0.18s;
}

.layout-confirm-close:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.layout-confirm-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.layout-confirm-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(248, 113, 113, 0.24);
  border-radius: 14px;
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.layout-confirm-content {
  display: grid;
  gap: 8px;
  padding-right: 26px;
}

.layout-confirm-content span {
  color: #fca5a5;
  font-size: 12px;
  font-weight: 900;
}

.layout-confirm-content h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 20px;
  font-weight: 900;
  line-height: 1.28;
}

.layout-confirm-content p {
  margin: 0;
  color: #9aa8c7;
  font-size: 13px;
  line-height: 1.7;
}

.layout-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.layout-confirm-secondary,
.layout-confirm-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s, border-color 0.18s, background 0.18s, color 0.18s;
}

.layout-confirm-secondary {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
}

.layout-confirm-secondary:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.layout-confirm-danger {
  gap: 7px;
  border: 1px solid rgba(248, 113, 113, 0.24);
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: #ffffff;
  box-shadow: 0 12px 26px rgba(239, 68, 68, 0.28);
}

.layout-confirm-danger:hover {
  transform: translateY(-1px);
}

.layout-confirm-secondary:disabled,
.layout-confirm-danger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

@media (max-width: 560px) {
  .layout-confirm-panel {
    padding: 20px;
  }

  .layout-confirm-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
