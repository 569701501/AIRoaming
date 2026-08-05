<template>
  <main class="document-detail" aria-label="文稿详情">
    <header class="detail-topbar">
      <button type="button" class="back-button" aria-label="返回文稿库" @click="goBack">
        <ArrowLeft :size="16" />文稿库
      </button>
      <div class="detail-title">
        <strong>{{ detail?.work.name ?? "加载中..." }}</strong>
        <small v-if="detail">
          {{ detail.work.chapterCount }} 章
          <template v-if="detail.work.unassignedCount"> · {{ detail.work.unassignedCount }} 章未分章</template>
          · {{ detail.groups.length }} 个分组
        </small>
      </div>
      <button
        v-if="detail"
        type="button"
        class="rename-button"
        aria-label="重命名"
        title="重命名"
        @click="renameOpen = true"
      ><Pencil :size="15" /></button>
    </header>

    <section v-if="loading" class="center-state">
      <LoaderCircle class="spin" :size="26" />
      <span>正在加载文稿...</span>
    </section>

    <section v-else-if="error" class="notice-card is-error">
      <strong>加载失败</strong>
      <span>{{ error }}</span>
      <button type="button" @click="load">重试</button>
    </section>

    <div v-else-if="detail" class="detail-body">
      <aside class="chapter-sidebar" aria-label="章节列表">
        <div v-if="!displayGroups.length" class="sidebar-empty">暂无章节</div>
        <section
          v-for="group in displayGroups"
          :key="group.label"
          class="chapter-group"
        >
          <button
            type="button"
            class="group-head"
            :aria-expanded="expandedGroups.has(group.label)"
            @click="toggleGroup(group.label)"
          >
            <ChevronRight :size="14" :class="{ 'is-expanded': expandedGroups.has(group.label) }" />
            <span>{{ group.label }}</span>
            <small>{{ group.chapterCount }}</small>
          </button>
          <ul v-if="expandedGroups.has(group.label)" class="chapter-list">
            <li
              v-for="chapter in chaptersOf(group.label)"
              :key="chapter.id"
              :class="{ 'is-active': chapter.id === activeChapterId }"
              @click="selectChapter(chapter)"
            >
              <span class="chapter-order">{{ chapter.order }}</span>
              <span class="chapter-title">{{ chapter.title }}</span>
            </li>
          </ul>
        </section>
      </aside>

      <article class="reader-pane" aria-label="原文阅读">
        <div class="reader-head">
          <strong>{{ activeChapter?.title ?? "" }}</strong>
        </div>
        <div v-if="chapterLoading" class="reader-loading">
          <LoaderCircle class="spin" :size="20" />
          <span>加载章节...</span>
        </div>
        <pre v-else class="reader-content" aria-live="polite">{{ chapterText }}</pre>
      </article>
    </div>

    <div v-if="renameOpen && detail" class="dialog-backdrop" role="presentation" @click.self="renameOpen = false">
      <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="rename-title">
        <header class="dialog-head">
          <strong id="rename-title">重命名文稿</strong>
          <button type="button" aria-label="关闭" @click="renameOpen = false"><X :size="16" /></button>
        </header>
        <div class="dialog-body">
          <input v-model="renameValue" type="text" aria-label="文稿名称" @keydown.enter="confirmRename" />
        </div>
        <footer class="dialog-actions">
          <button type="button" @click="renameOpen = false">取消</button>
          <button class="primary-action" type="button" :disabled="!renameValue.trim()" @click="confirmRename">确定</button>
        </footer>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ChevronRight, LoaderCircle, Pencil, X } from "lucide-vue-next";
import type { DocumentChapterListItem, DocumentWorkDetail } from "@airoaming/shared";

import { api } from "../../services/api";

const route = useRoute();
const router = useRouter();
const documentId = computed(() => typeof route.params.id === "string" ? route.params.id : "");

const detail = ref<DocumentWorkDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const expandedGroups = ref<Set<string>>(new Set());
const activeChapterId = ref<string | null>(null);
const chapterText = ref("");
const chapterLoading = ref(false);
const renameOpen = ref(false);
const renameValue = ref("");

const activeChapter = computed(() => (
  detail.value?.chapters.find((chapter) => chapter.id === activeChapterId.value) ?? null
));

// 展示分组：按章节实际出现顺序排列——未分章的按每 100 章分桶，卷组按出现位置插入，先后顺序与正文一致
const displayGroups = computed(() => {
  if (!detail.value) return [];
  const result: Array<{ label: string; chapterCount: number; chapters: DocumentChapterListItem[] }> = [];
  let unassignedBuffer: DocumentChapterListItem[] = [];

  const flushUnassigned = (): void => {
    if (unassignedBuffer.length === 0) return;
    for (let offset = 0; offset < unassignedBuffer.length; offset += 100) {
      const chunk = unassignedBuffer.slice(offset, offset + 100);
      const startOrder = chunk[0]!.order;
      const endOrder = chunk[chunk.length - 1]!.order;
      result.push({
        label: `${startOrder}-${endOrder} 章`,
        chapterCount: chunk.length,
        chapters: chunk,
      });
    }
    unassignedBuffer = [];
  };

  for (const chapter of detail.value.chapters) {
    if (chapter.groupLabel === "未分章") {
      unassignedBuffer.push(chapter);
      continue;
    }
    flushUnassigned();
    let group = result.find((entry) => entry.label === chapter.groupLabel);
    if (!group) {
      group = { label: chapter.groupLabel, chapterCount: 0, chapters: [] };
      result.push(group);
    }
    group.chapterCount += 1;
    group.chapters.push(chapter);
  }
  flushUnassigned();
  return result;
});

function chaptersOf(groupLabel: string): DocumentChapterListItem[] {
  const group = displayGroups.value.find((entry) => entry.label === groupLabel);
  return group?.chapters ?? [];
}

function toggleGroup(label: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  expandedGroups.value = next;
}

function selectChapter(chapter: DocumentChapterListItem): void {
  activeChapterId.value = chapter.id;
  void loadChapter(chapter.id);
}

async function loadChapter(chapterId: string): Promise<void> {
  if (!documentId.value) return;
  chapterLoading.value = true;
  try {
    const result = await api.getDocumentChapterText(documentId.value, chapterId);
    chapterText.value = result.text;
  } catch (cause) {
    chapterText.value = `章节加载失败：${cause instanceof Error ? cause.message : "未知错误"}`;
  } finally {
    chapterLoading.value = false;
  }
}

async function load(): Promise<void> {
  if (!documentId.value) return;
  loading.value = true;
  error.value = null;
  try {
    detail.value = await api.getDocument(documentId.value);
    const firstGroup = displayGroups.value[0];
    if (firstGroup) {
      expandedGroups.value = new Set([firstGroup.label]);
    }
    const first = detail.value.chapters[0];
    if (first) {
      activeChapterId.value = first.id;
      await loadChapter(first.id);
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function goBack(): void {
  void router.push({ name: "documents" });
}

async function confirmRename(): Promise<void> {
  if (!detail.value || !renameValue.value.trim()) return;
  try {
    await api.renameDocument(detail.value.work.id, renameValue.value.trim());
    renameOpen.value = false;
    detail.value.work.name = renameValue.value.trim();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "重命名失败";
  }
}

watch(documentId, () => void load(), { immediate: false });

onMounted(() => void load());
</script>

<style scoped>
.document-detail {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100vh;
  color: #e8edf8;
}

.detail-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(13, 20, 34, 0.95);
  padding: 10px 16px;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: transparent;
  color: #9aa8c7;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}

.back-button:hover {
  color: #e8edf8;
}

.detail-title {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.detail-title strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-title small {
  color: #7f8ca8;
  font-size: 12px;
}

.rename-button {
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

.rename-button:hover {
  color: #e8edf8;
}

.detail-body {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  min-height: 0;
}

.chapter-sidebar {
  overflow-y: auto;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(10, 16, 28, 0.7);
  padding: 12px;
}

.chapter-group {
  display: grid;
  gap: 2px;
  margin-bottom: 8px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #c9d4ea;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  text-align: left;
}

.group-head:hover {
  background: rgba(148, 163, 184, 0.08);
}

.group-head svg {
  transition: transform 0.15s;
}

.group-head svg.is-expanded {
  transform: rotate(90deg);
}

.group-head span {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-head small {
  color: #7f8ca8;
  font-size: 11px;
}

.chapter-list {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 2px 0 2px 22px;
  list-style: none;
}

.chapter-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-radius: 7px;
  padding: 5px 8px;
  cursor: pointer;
  color: #9aa8c7;
  font-size: 12.5px;
}

.chapter-list li:hover {
  background: rgba(148, 163, 184, 0.08);
  color: #dbe4f5;
}

.chapter-list li.is-active {
  background: rgba(139, 92, 246, 0.14);
  color: #ddd3ff;
}

.chapter-order {
  flex: none;
  color: #6b7894;
  font-size: 11px;
}

.chapter-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-empty {
  padding: 20px;
  color: #7f8ca8;
  font-size: 13px;
  text-align: center;
}

.reader-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.reader-head {
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding: 12px 16px;
}

.reader-head strong {
  font-size: 16px;
  font-weight: 900;
}

.reader-content {
  overflow-y: auto;
  margin: 0;
  box-sizing: border-box;
  color: #dbe4f5;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.9;
  padding: 28px 34px 80px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.reader-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #7f8ca8;
  font-size: 13px;
}

.center-state,
.notice-card {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: #7f8ca8;
}

.notice-card {
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.08);
}

.notice-card strong {
  color: #fda4af;
}

.notice-card button {
  min-height: 30px;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  background: transparent;
  color: #fda4af;
  padding: 0 12px;
  cursor: pointer;
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
  width: min(440px, 100%);
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

.dialog-body input[type="text"] {
  min-height: 38px;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 9px;
  background: rgba(13, 21, 38, 0.9);
  color: #eef3fb;
  padding: 0 12px;
  font: inherit;
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

.primary-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.primary-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
