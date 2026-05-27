<template>
  <section class="script-editor" aria-label="剧本">


    <div class="editor-content">
      <MarkdownTextEditor
        ref="editorRef"
        v-model="sourceText"
        :disabled="loading"
        placeholder="在这里开始写你的故事..."
      />
    </div>

    <footer class="editor-footer">
      <div class="footer-stats">
        <span>字数 {{ sourceText.length }}</span>
        <span>预估页数 {{ estimatedPages }} 页</span>
        <div v-if="lastScriptRevision" class="revision-status" :title="revisionTitle">
          <History :size="14" />
          <span>AI 来源 {{ shortId(lastScriptRevision.messageId) }}：{{ lastScriptRevision.summary }}</span>
        </div>
        <div class="save-status">
          <span>{{ saveStatusLabel }}</span>
          <CheckCircle2 :size="14" class="status-icon" />
        </div>
      </div>
      <div class="footer-actions">
        <button class="reset-script-btn" type="button" :disabled="loading || !canReset" @click="submitReset">
          <Trash2 :size="14" />
          <span>清空剧本</span>
        </button>
        <button class="save-draft-btn" type="button" :disabled="loading || !hasChanges" @click="submitSave">
          <Save :size="14" />
          <span>保存草稿</span>
        </button>
        <button class="next-step-btn" type="button" :disabled="loading || !canComplete" @click="submitComplete">
          <span>完成本章</span>
          <ArrowRight :size="14" />
        </button>
      </div>
    </footer>
    <Teleport to="body">
      <div v-if="showResetConfirm" class="modal-overlay" @click.self="showResetConfirm = false">
        <div class="modal-content">
          <div class="modal-header">
            <AlertTriangle class="modal-icon" :size="20" />
            <span class="modal-title">清空剧本</span>
          </div>
          <p class="modal-desc">
            此操作将<strong>删除当前项目下所有章节草稿</strong>，并重置为一个空白的第 1 章。<br />
            确定要继续吗？
          </p>
          <div class="modal-actions">
            <button class="modal-btn cancel" type="button" @click="showResetConfirm = false">取消</button>
            <button class="modal-btn danger" type="button" @click="confirmReset">确定清空</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CheckCircle2, Save, List, ListOrdered, Bold, Italic, Underline, Strikethrough, Quote, Image, ArrowRight, Trash2, History, AlertTriangle } from "lucide-vue-next";
import type { CompleteChapterRequest, SaveChapterDraftRequest, WorkbenchSnapshot } from "@airoaming/shared";
import { getCurrentChapterSourceText } from "../../utils/workbench-chapter";
import MarkdownTextEditor from "./MarkdownTextEditor.vue";

type MarkdownTextEditorHandle = InstanceType<typeof MarkdownTextEditor>;

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  saveDraft: [input: SaveChapterDraftRequest];
  completeChapter: [input: CompleteChapterRequest];
  updateSourceText: [value: string];
  resetScript: [];
}>();

const editorRef = ref<MarkdownTextEditorHandle | null>(null);
const sourceText = ref("");
const showResetConfirm = ref(false);
const currentChapterSourceText = computed(() => getCurrentChapterSourceText(props.snapshot));

const estimatedPages = computed(() => {
  const length = sourceText.value.trim().length;
  if (length === 0) return "0";
  const min = Math.ceil(length / 300);
  const max = Math.ceil(length / 250);
  if (min === max) return `${min}`;
  return `${min}-${max}`;
});

const hasChanges = computed(() => sourceText.value !== currentChapterSourceText.value);
const canSave = computed(() => hasChanges.value);
const canComplete = computed(() => sourceText.value.trim().length > 0);
const canReset = computed(() => sourceText.value.trim().length > 0 || props.snapshot.chapters.length > 1);
const lastScriptRevision = computed(() => props.snapshot.currentChapter?.lastScriptRevision ?? null);
const revisionTitle = computed(() => {
  const revision = lastScriptRevision.value;
  if (!revision) {
    return "";
  }

  return `threadId: ${revision.threadId}\nmessageId: ${revision.messageId}\ntoolCallId: ${revision.toolCallId}`;
});

const saveStatusLabel = computed(() => {
  if (props.loading) {
    return "保存中";
  }

  return hasChanges.value ? "有未保存更改" : "已保存";
});

watch(
  () => props.snapshot,
  () => resetForm(),
  { immediate: true },
);

watch(sourceText, (value) => {
  emit("updateSourceText", value);
});

function resetForm() {
  sourceText.value = currentChapterSourceText.value;
}

function submitSave() {
  if (!canSave.value) {
    return;
  }

  emit("saveDraft", {
    sourceText: sourceText.value,
  });
}

function submitComplete() {
  if (!canComplete.value) {
    return;
  }

  emit("completeChapter", {
    sourceText: sourceText.value,
    createNextChapter: true,
  });
}

function submitReset() {
  if (!canReset.value) {
    return;
  }
  showResetConfirm.value = true;
}

function confirmReset() {
  emit("resetScript");
  showResetConfirm.value = false;
}

function shortId(id: string) {
  return id.slice(0, 8);
}
</script>

<style scoped>
.script-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  background: rgba(13, 18, 33, 0.4);
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  overflow-x: auto;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

.toolbar-btn,
.toolbar-label {
  background: transparent;
  border: none;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn {
  width: 28px;
  height: 28px;
}

.toolbar-btn.text-btn {
  width: auto;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.toolbar-label {
  gap: 6px;
  padding: 4px 8px;
  font-size: 13px;
  cursor: default;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.editor-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  background: rgba(13, 18, 33, 0.6);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.2);
}

.editor-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  gap: 16px;
  overflow: hidden;
}

.footer-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #64748b;
  font-size: 13px;
  min-width: 0;
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.footer-stats::-webkit-scrollbar {
  display: none;
}

.footer-stats > span {
  white-space: nowrap;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #34d399;
  white-space: nowrap;
  flex-shrink: 0;
}

.revision-status {
  display: inline-flex;
  max-width: 160px;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: #c4b5fd;
}

.revision-status span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.reset-script-btn,
.save-draft-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 0 16px;
  height: 36px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-script-btn {
  border-color: rgba(248, 113, 113, 0.28);
  background: rgba(248, 113, 113, 0.08);
  color: #fecaca;
}

.reset-script-btn:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.14);
  color: #fee2e2;
}

.save-draft-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.next-step-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  border: none;
  color: #fff;
  padding: 0 20px;
  height: 36px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

.next-step-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(124, 58, 237, 0.4);
}

.next-step-btn:disabled,
.reset-script-btn:disabled,
.save-draft-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 12, 23, 0.7);
  backdrop-filter: blur(8px);
  animation: modal-fade-in 0.2s ease-out;
}

.modal-content {
  width: 360px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: modal-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.modal-icon {
  color: #f87171;
}

.modal-title {
  color: #f1f5f9;
  font-size: 16px;
  font-weight: 700;
}

.modal-desc {
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 24px;
}

.modal-desc strong {
  color: #fca5a5;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.modal-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.modal-btn.cancel {
  background: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
}

.modal-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f1f5f9;
}

.modal-btn.danger {
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
  border: 1px solid rgba(248, 113, 113, 0.3);
}

.modal-btn.danger:hover {
  background: rgba(248, 113, 113, 0.2);
  color: #fee2e2;
}

@keyframes modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-slide-up {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
