<template>
  <section class="script-editor" aria-label="剧本">
    <header class="editor-toolbar">
      <div class="toolbar-group">
        <span class="toolbar-label">Markdown</span>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn text-btn" type="button" title="一级标题" @click="editorRef?.setHeading(1)">H1</button>
        <button class="toolbar-btn text-btn" type="button" title="二级标题" @click="editorRef?.setHeading(2)">H2</button>
        <button class="toolbar-btn text-btn" type="button" title="三级标题" @click="editorRef?.setHeading(3)">H3</button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" type="button" title="无序列表" @click="editorRef?.toggleBulletList()"><List :size="14" /></button>
        <button class="toolbar-btn" type="button" title="有序列表" @click="editorRef?.toggleOrderedList()"><ListOrdered :size="14" /></button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" type="button" title="加粗" @click="editorRef?.wrapSelection('**', '**')"><Bold :size="14" /></button>
        <button class="toolbar-btn" type="button" title="斜体" @click="editorRef?.wrapSelection('*', '*')"><Italic :size="14" /></button>
        <button class="toolbar-btn" type="button" title="下划线" @click="editorRef?.wrapSelection('<u>', '</u>')"><Underline :size="14" /></button>
        <button class="toolbar-btn" type="button" title="删除线" @click="editorRef?.wrapSelection('~~', '~~')"><Strikethrough :size="14" /></button>
        <button class="toolbar-btn" type="button" title="引用" @click="editorRef?.toggleBlockquote()"><Quote :size="14" /></button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" type="button" title="插入图片 Markdown" @click="editorRef?.insertImage()"><Image :size="14" /></button>
      </div>
    </header>

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
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CheckCircle2, Save, List, ListOrdered, Bold, Italic, Underline, Strikethrough, Quote, Image, ArrowRight, Trash2, History } from "lucide-vue-next";
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

  const confirmed = window.confirm("清空剧本会删除当前项目下所有章节草稿，并重置为一个空白第 1 章。确定继续吗？");
  if (!confirmed) {
    return;
  }

  emit("resetScript");
}

function shortId(id: string) {
  return id.slice(0, 8);
}
</script>

<style scoped>
.script-editor {
  display: flex;
  flex-direction: column;
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
  flex: 1;
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  background: rgba(13, 18, 33, 0.6);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.2);
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.footer-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #64748b;
  font-size: 13px;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #34d399;
}

.revision-status {
  display: inline-flex;
  max-width: min(460px, 48vw);
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
</style>
