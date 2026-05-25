<template>
  <Teleport to="body">
    <div v-if="open" class="delete-dialog-backdrop" role="presentation" @click.self="!loading && $emit('close')">
      <section class="delete-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
        <button class="delete-dialog-close" type="button" aria-label="关闭" :disabled="loading" @click="$emit('close')">
          <X :size="18" />
        </button>

        <div class="delete-dialog-icon">
          <AlertTriangle :size="22" />
        </div>

        <div class="delete-dialog-content">
          <span>删除项目</span>
          <h2 id="delete-project-title">确定删除「{{ projectName }}」吗？</h2>
          <p>确认后会删除项目记录和本地 workspace 中的项目文件，当前操作不可撤回。</p>
        </div>

        <div class="delete-dialog-actions">
          <button class="delete-dialog-secondary" type="button" :disabled="loading" @click="$emit('close')">取消</button>
          <button class="delete-dialog-danger" type="button" :disabled="loading" @click="$emit('confirm')">
            <Trash2 :size="15" />
            <span>{{ loading ? "删除中..." : "确认删除" }}</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle, Trash2, X } from "lucide-vue-next";

defineProps<{
  open: boolean;
  projectName: string;
  loading: boolean;
}>();

defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<style scoped>
.delete-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(7, 10, 22, 0.68);
  backdrop-filter: blur(14px);
}

.delete-dialog-panel {
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

.delete-dialog-close {
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

.delete-dialog-close:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.delete-dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.delete-dialog-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(248, 113, 113, 0.24);
  border-radius: 14px;
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.delete-dialog-content {
  display: grid;
  gap: 8px;
  padding-right: 26px;
}

.delete-dialog-content span {
  color: #fca5a5;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
}

.delete-dialog-content h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 20px;
  font-weight: 900;
  line-height: 1.28;
}

.delete-dialog-content p {
  margin: 0;
  color: #9aa8c7;
  font-size: 13px;
  line-height: 1.7;
}

.delete-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.delete-dialog-secondary,
.delete-dialog-danger {
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

.delete-dialog-secondary {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
}

.delete-dialog-secondary:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.delete-dialog-danger {
  gap: 7px;
  border: 1px solid rgba(248, 113, 113, 0.24);
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: #ffffff;
  box-shadow: 0 12px 26px rgba(239, 68, 68, 0.28);
}

.delete-dialog-danger:hover {
  transform: translateY(-1px);
}

.delete-dialog-secondary:disabled,
.delete-dialog-danger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

@media (max-width: 560px) {
  .delete-dialog-panel {
    padding: 20px;
  }

  .delete-dialog-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
