<template>
  <section class="script-editor" aria-label="剧本">

    <div v-if="pendingSourceText" class="pending-source-banner">
      <div class="pending-banner-head">
        <FileText :size="15" />
        <strong>{{ isImportPending ? "导入章节待确认" : "AI 草稿待确认" }}</strong>
        <span class="pending-source-tag">{{ pendingOperationLabel }}</span>
      </div>
      <div class="pending-banner-actions">
        <button class="pending-adopt-btn" type="button" :disabled="loading" @click="submitConfirmPendingSource">
          <CheckCircle2 :size="14" />
          <span>{{ isImportPending ? "确认章节" : "采用草稿" }}</span>
        </button>
        <button v-if="!isImportPending" class="pending-discard-btn" type="button" :disabled="loading" @click="submitDiscardPendingSource">
          <Trash2 :size="14" />
          <span>丢弃</span>
        </button>
      </div>
      <p class="pending-source-hint">{{ pendingHint }}</p>
    </div>

    <div class="editor-content">
      <button
        v-if="canReset"
        class="editor-more-btn"
        type="button"
        aria-label="编辑器更多操作"
        @click="showMoreMenu = !showMoreMenu"
      >
        <MoreHorizontal :size="16" />
      </button>
      <div v-if="showMoreMenu" ref="moreMenuRef" class="editor-more-menu">
        <button class="more-item danger" type="button" @click="handleResetClick">
          <Trash2 :size="14" />
          <span>清空本章</span>
        </button>
      </div>
      <pre v-if="pendingSourceText" class="pending-source-document" aria-label="待确认章节草稿全文">{{ pendingSourceText.sourceText }}</pre>
      <MarkdownTextEditor
        v-else
        ref="editorRef"
        v-model="sourceText"
        :disabled="loading"
        placeholder="在这里开始写你的故事..."
      />
    </div>

    <footer class="editor-footer">
      <div class="footer-stats">
        <span>{{ displayedSourceText.length }} 字 · 约 {{ estimatedPages }} 页</span>
        <div v-if="lastScriptRevision" class="revision-status" :title="revisionTitle">
          <History :size="14" />
          <span>{{ lastScriptRevision.summary }}</span>
        </div>
        <div class="save-status">
          <span>{{ saveStatusLabel }}</span>
          <CheckCircle2 :size="14" class="status-icon" />
        </div>
      </div>
      <div class="footer-actions">
        <button class="save-draft-btn" type="button" :disabled="loading || Boolean(pendingSourceText) || !hasChanges" @click="submitSave">
          <Save :size="14" />
          <span>保存草稿</span>
        </button>
        <button class="next-step-btn" type="button" :disabled="loading || Boolean(pendingSourceText) || !canComplete" @click="submitComplete">
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
            <span class="modal-title">清空当前章节</span>
          </div>
          <p class="modal-desc">
            此操作只会<strong>清空当前打开章节的剧本正文</strong>，其他章节不会删除。<br />
            如果本章已完成，清空后会回到草稿状态。
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CheckCircle2, Save, ArrowRight, Trash2, History, AlertTriangle, MoreHorizontal, FileText } from "lucide-vue-next";
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
  confirmPendingSource: [];
  discardPendingSource: [];
}>();

const editorRef = ref<MarkdownTextEditorHandle | null>(null);
const sourceText = ref("");
const showResetConfirm = ref(false);
const showMoreMenu = ref(false);
const moreMenuRef = ref<HTMLElement | null>(null);
const currentChapterSourceText = computed(() => getCurrentChapterSourceText(props.snapshot));
const pendingSourceText = computed(() => props.snapshot.currentChapter?.pendingSourceText ?? null);
const isImportPending = computed(() => pendingSourceText.value?.kind === "import");
const displayedSourceText = computed(() => pendingSourceText.value?.sourceText ?? sourceText.value);

const estimatedPages = computed(() => {
  const length = displayedSourceText.value.trim().length;
  if (length === 0) return "0";
  const min = Math.ceil(length / 300);
  const max = Math.ceil(length / 250);
  if (min === max) return `${min}`;
  return `${min}-${max}`;
});

const hasChanges = computed(() => sourceText.value !== currentChapterSourceText.value);
// 保存草稿必须同时满足"有变化"和"非空":
// 切章瞬间编辑器尚未同步时会误判 hasChanges=true,若不判空会让空内容覆盖正式正文。
const canSave = computed(() => hasChanges.value && sourceText.value.trim().length > 0);
const canComplete = computed(() => !pendingSourceText.value && sourceText.value.trim().length > 0);
const canReset = computed(() => !pendingSourceText.value && (sourceText.value.trim().length > 0 || props.snapshot.currentChapter?.status !== "draft"));
const lastScriptRevision = computed(() => props.snapshot.currentChapter?.lastScriptRevision ?? null);
const pendingOperationLabel = computed(() => {
  const operation = pendingSourceText.value?.operation;
  switch (operation) {
    case "import_materialize":
      return "原稿忠实整理";
    case "generate_script_from_seed":
      return "灵感种子生成";
    case "generate_script_from_outline":
      return "大纲生成";
    case "update_chapter_draft":
      return "AI 改写";
    default:
      return "AI 生成";
  }
});
const pendingHint = computed(() => isImportPending.value
  ? "请完整只读检查本章。确认后将直接形成正式章节版本；暂不确认时可以切换查看其他章节。"
  : "请先完整查看。采用后进入可编辑正文，完成本章后才形成正式版本；丢弃后当前正文不变。");
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

  if (pendingSourceText.value) {
    return isImportPending.value ? "待确认章节" : "待采用或丢弃";
  }

  return hasChanges.value ? "有未保存更改" : "已保存";
});

watch(
  currentChapterSourceText,
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

function submitConfirmPendingSource() {
  if (!pendingSourceText.value) {
    return;
  }
  emit("confirmPendingSource");
}

function submitDiscardPendingSource() {
  if (!pendingSourceText.value) {
    return;
  }
  emit("discardPendingSource");
}

function handleResetClick() {
  if (!canReset.value) {
    return;
  }
  showMoreMenu.value = false;
  showResetConfirm.value = true;
}

function confirmReset() {
  emit("resetScript");
  showResetConfirm.value = false;
}

function closeMoreMenu(event: MouseEvent) {
  if (moreMenuRef.value && !moreMenuRef.value.contains(event.target as Node)) {
    showMoreMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", closeMoreMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeMoreMenu);
});
</script>

<style scoped>
.pending-source-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 12px;
  background: rgba(34, 211, 238, 0.08);
}
html[data-theme="light"] .pending-source-banner {
  border-color: rgba(8, 145, 178, 0.3);
  background: rgba(8, 145, 178, 0.06);
}
.pending-banner-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #22d3ee;
  font-size: 13px;
}
html[data-theme="light"] .pending-banner-head {
  color: #0891b2;
}
.pending-source-tag {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(34, 211, 238, 0.15);
  font-size: 11px;
  color: #67e8f9;
}
html[data-theme="light"] .pending-source-tag {
  background: rgba(8, 145, 178, 0.1);
  color: #0e7490;
}
.pending-banner-actions {
  display: flex;
  gap: 8px;
}
.pending-adopt-btn,
.pending-discard-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}
.pending-adopt-btn {
  background: rgba(34, 197, 94, 0.18);
  color: #4ade80;
}
.pending-adopt-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.28);
}
.pending-discard-btn {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}
.pending-discard-btn:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.25);
}
.pending-adopt-btn:disabled,
.pending-discard-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
html[data-theme="light"] .pending-adopt-btn {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}
html[data-theme="light"] .pending-discard-btn {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}
.pending-source-hint {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
}
html[data-theme="light"] .pending-source-hint {
  color: #64748b;
}

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
  position: relative;
}

.pending-source-document {
  flex: 1;
  min-height: 0;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #e2e8f0;
  font: inherit;
  line-height: 1.75;
}

html[data-theme="light"] .pending-source-document {
  color: #1e293b;
}

.editor-more-btn {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 5;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.editor-more-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.editor-more-menu {
  position: absolute;
  top: 46px;
  right: 16px;
  z-index: 10;
  min-width: 140px;
  background: rgba(15, 21, 38, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  padding: 6px;
  backdrop-filter: blur(12px);
}

.more-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #cbd5e1;
  cursor: pointer;
  transition: background 0.15s;
}

.more-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.more-item.danger {
  color: #fca5a5;
}

.more-item.danger:hover {
  background: rgba(248, 113, 113, 0.1);
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
