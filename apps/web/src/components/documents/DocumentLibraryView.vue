<template>
  <main class="document-library" aria-label="文稿库">
    <header class="library-head">
      <div>
        <h1>文稿库</h1>
        <p>上传剧本或小说，自动拆章后可在创建项目时直接引用。</p>
      </div>
      <button class="primary-action" type="button" @click="openUploadDialog">
        <Upload :size="16" />新增文稿
      </button>
    </header>

    <section v-if="error" class="notice-card is-error">
      <strong>文稿库加载失败</strong>
      <span>{{ error }}</span>
      <button type="button" @click="load">重试</button>
    </section>

    <section v-else-if="loading" class="center-state">
      <LoaderCircle class="spin" :size="26" />
      <span>正在加载文稿...</span>
    </section>

    <section v-else-if="documents.length" class="document-list" aria-label="文稿列表">
      <article v-for="document in documents" :key="document.id" class="document-card">
        <div class="document-card-icon">
          <BookOpen :size="22" />
        </div>
        <div class="document-card-main">
          <strong>{{ document.name }}</strong>
          <small>
            {{ document.chapterCount }} 章
            <template v-if="document.unassignedCount"> · {{ document.unassignedCount }} 章未分章</template>
            · {{ formatBytes(document.sourceBytes) }}
          </small>
        </div>
        <div class="document-card-actions">
          <button type="button" title="重命名" aria-label="重命名" @click="openRenameDialog(document)"><Pencil :size="15" /></button>
          <button type="button" title="删除" aria-label="删除" @click="requestDelete(document)"><Trash2 :size="15" /></button>
        </div>
        <button class="document-card-open" type="button" @click="openDocument(document.id)">查看文稿</button>
      </article>
    </section>

    <section v-else class="empty-state">
      <div class="empty-icon">
        <BookOpen :size="26" />
      </div>
      <strong>文稿库为空</strong>
      <p>上传一本小说或剧本，系统会自动拆成章节。</p>
      <button class="primary-action" type="button" @click="openUploadDialog">
        <Upload :size="15" />上传第一本文稿
      </button>
    </section>

    <div v-if="uploadOpen" class="dialog-backdrop" role="presentation" @click.self="closeUploadDialog">
      <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
        <header class="dialog-head">
          <strong id="upload-dialog-title">新增文稿</strong>
          <button type="button" aria-label="关闭" :disabled="uploading" @click="closeUploadDialog"><X :size="16" /></button>
        </header>
        <div class="dialog-body">
          <label class="upload-zone" :class="{ 'is-dragging': dragActive }">
            <input
              type="file"
              accept=".txt,.md,.markdown"
              :disabled="uploading"
              @change="handleFileChange"
            />
            <Upload :size="26" />
            <strong>{{ selectedFile ? selectedFile.name : "点击选择 .txt / .md 文件" }}</strong>
            <small>{{ selectedFile ? formatBytes(selectedFile.size) : "支持剧本、小说；单文件最大 50MB" }}</small>
          </label>
          <p v-if="uploadError" class="dialog-error" role="alert">{{ uploadError }}</p>
        </div>
        <footer class="dialog-actions">
          <button type="button" :disabled="uploading" @click="closeUploadDialog">取消</button>
          <button class="primary-action" type="button" :disabled="!selectedFile || uploading" @click="confirmUpload">
            <LoaderCircle v-if="uploading" class="spin" :size="14" />
            {{ uploading ? "正在拆分..." : "确定上传" }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="renameTarget" class="dialog-backdrop" role="presentation" @click.self="renameTarget = null">
      <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title">
        <header class="dialog-head">
          <strong id="rename-dialog-title">重命名文稿</strong>
          <button type="button" aria-label="关闭" @click="renameTarget = null"><X :size="16" /></button>
        </header>
        <div class="dialog-body">
          <input v-model="renameValue" type="text" aria-label="文稿名称" @keydown.enter="confirmRename" />
        </div>
        <footer class="dialog-actions">
          <button type="button" @click="renameTarget = null">取消</button>
          <button class="primary-action" type="button" :disabled="!renameValue.trim()" @click="confirmRename">确定</button>
        </footer>
      </section>
    </div>

    <LayoutConfirmDialog
      :open="Boolean(deleteTarget)"
      :title="`删除「${deleteTarget?.name ?? ''}」？`"
      message="删除后文稿和已拆分的章节将不可恢复。"
      confirm-label="删除"
      :danger="true"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { BookOpen, LoaderCircle, Pencil, Trash2, Upload, X } from "lucide-vue-next";
import type { DocumentWorkListItem } from "@airoaming/shared";

import { api } from "../../services/api";
import LayoutConfirmDialog from "../workbench/LayoutConfirmDialog.vue";

const router = useRouter();
const documents = ref<DocumentWorkListItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const uploadOpen = ref(false);
const uploading = ref(false);
const selectedFile = ref<File | null>(null);
const uploadError = ref<string | null>(null);
const dragActive = ref(false);

const renameTarget = ref<DocumentWorkListItem | null>(null);
const renameValue = ref("");
const deleteTarget = ref<DocumentWorkListItem | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const result = await api.listDocuments();
    documents.value = result.items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function openUploadDialog(): void {
  uploadOpen.value = true;
  selectedFile.value = null;
  uploadError.value = null;
}

function closeUploadDialog(): void {
  if (uploading.value) return;
  uploadOpen.value = false;
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  input.value = "";
}

async function confirmUpload(): Promise<void> {
  if (!selectedFile.value || uploading.value) return;
  uploading.value = true;
  uploadError.value = null;
  try {
    const result = await api.uploadDocument(selectedFile.value);
    uploadOpen.value = false;
    await router.push({ name: "document-detail", params: { id: result.work.id } });
  } catch (cause) {
    uploadError.value = cause instanceof Error ? cause.message : "上传失败";
  } finally {
    uploading.value = false;
  }
}

function openRenameDialog(document: DocumentWorkListItem): void {
  renameTarget.value = document;
  renameValue.value = document.name;
}

async function confirmRename(): Promise<void> {
  if (!renameTarget.value || !renameValue.value.trim()) return;
  try {
    await api.renameDocument(renameTarget.value.id, renameValue.value.trim());
    renameTarget.value = null;
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "重命名失败";
  }
}

function requestDelete(document: DocumentWorkListItem): void {
  deleteTarget.value = document;
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  try {
    await api.deleteDocument(deleteTarget.value.id);
    deleteTarget.value = null;
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除失败";
  }
}

function openDocument(id: string): void {
  void router.push({ name: "document-detail", params: { id } });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

onMounted(() => void load());
</script>

<style scoped>
.document-library {
  display: grid;
  align-content: start;
  gap: 20px;
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 34px 28px 60px;
  color: #e8edf8;
}

.library-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.library-head h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
}

.library-head p {
  margin: 6px 0 0;
  color: #7f8ca8;
  font-size: 13px;
}

.document-list {
  display: grid;
  gap: 10px;
}

.document-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  background: rgba(19, 28, 48, 0.9);
  padding: 14px 16px;
}

.document-card-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  background: rgba(139, 92, 246, 0.12);
  color: #c4b5fd;
}

.document-card-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.document-card-main strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-card-main small {
  color: #7f8ca8;
  font-size: 12px;
}

.document-card-actions {
  display: flex;
  gap: 6px;
}

.document-card-actions button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: transparent;
  color: #9aa8c7;
  cursor: pointer;
}

.document-card-actions button:hover {
  border-color: rgba(248, 113, 113, 0.4);
  color: #fda4af;
}

.document-card-open {
  min-height: 32px;
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.14);
  color: #ddd3ff;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.document-card-open:hover {
  background: rgba(139, 92, 246, 0.22);
}

.primary-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.primary-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notice-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.08);
  padding: 14px;
}

.notice-card strong {
  color: #fda4af;
}

.notice-card span {
  color: #9aa8c7;
  font-size: 13px;
}

.notice-card button {
  justify-self: start;
  min-height: 30px;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  background: transparent;
  color: #fda4af;
  padding: 0 12px;
  cursor: pointer;
}

.center-state,
.empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 70px 20px;
  color: #7f8ca8;
  text-align: center;
}

.empty-icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  background: rgba(148, 163, 184, 0.06);
  color: #9aa8c7;
}

.empty-state strong {
  color: #dbe4f5;
  font-size: 16px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(7, 10, 22, 0.68);
  backdrop-filter: blur(14px);
}

.dialog-panel {
  display: grid;
  gap: 16px;
  width: min(480px, 100%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.96), rgba(10, 15, 30, 0.98));
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
  padding: 22px;
  color: #eef2ff;
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-head strong {
  font-size: 17px;
}

.dialog-head button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  cursor: pointer;
}

.dialog-body {
  display: grid;
  gap: 12px;
}

.dialog-body input[type="text"] {
  min-height: 38px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 9px;
  background: rgba(13, 21, 38, 0.9);
  color: #eef3fb;
  padding: 0 12px;
  font: inherit;
}

.upload-zone {
  display: grid;
  justify-items: center;
  gap: 8px;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.04);
  padding: 30px 16px;
  color: #9aa8c7;
  text-align: center;
  cursor: pointer;
}

.upload-zone.is-dragging {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.1);
}

.upload-zone input {
  display: none;
}

.upload-zone strong {
  color: #dbe4f5;
  font-size: 14px;
}

.upload-zone small {
  font-size: 12px;
}

.dialog-error {
  margin: 0;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fda4af;
  padding: 8px 10px;
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-actions button {
  min-height: 36px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 9px;
  background: rgba(22, 32, 51, 0.9);
  color: #d9e2f3;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.dialog-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
