<template>
  <div class="chapter-selector" ref="containerRef">
    <button class="chapter-dropdown-btn" type="button" @click="toggleDropdown">
      <div class="btn-left">
        <BookText :size="15" class="book-icon" />
        <span class="btn-title">{{ currentChapter?.title || '未选择章节' }}</span>
        <span v-if="currentChapter" class="btn-status" :class="currentChapter.status">
          {{ statusLabel(currentChapter.status) }}
        </span>
      </div>
      <ChevronDown :size="16" class="chevron-icon" :class="{ 'is-open': isOpen }" />
    </button>
    <div v-if="storyTitle" class="script-title-display" :title="storyTitle">
      <span class="script-title-label">剧本</span>
      <span class="script-title-text">{{ storyTitle }}</span>
    </div>

    <div v-if="isOpen" class="dropdown-menu">
      <div class="dropdown-header">
        <span>共 {{ chapters.length }} 个章节</span>
      </div>
      <div class="dropdown-list">
        <button
          v-for="chapter in orderedChapters"
          :key="chapter.id"
          class="dropdown-item"
          :class="{ 'is-active': chapter.id === currentChapterId }"
          type="button"
          @click="selectChapter(chapter.id)"
        >
          <span class="chapter-index">{{ chapter.order }}</span>
          <div class="chapter-body">
            <span class="chapter-title">{{ chapter.title }}</span>
            <span class="chapter-preview">{{ chapter.sourceTextPreview || "空白章节" }}</span>
          </div>
          <span class="chapter-status" :class="chapter.status">
            {{ statusLabel(chapter.status) }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { BookText, ChevronDown } from "lucide-vue-next";
import type { ChapterListItem, ChapterStatus } from "@airoaming/shared";

const props = defineProps<{
  chapters: ChapterListItem[];
  currentChapterId: string | null;
  storyTitle?: string | null;
}>();

const emit = defineEmits<{
  select: [chapterId: string];
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const orderedChapters = computed(() => [...props.chapters].sort((left, right) => left.order - right.order));
const currentChapter = computed(() => props.chapters.find(c => c.id === props.currentChapterId));
const storyTitle = computed(() => props.storyTitle?.trim() || "");

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function selectChapter(id: string) {
  emit("select", id);
  isOpen.value = false;
}

function closeDropdown(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", closeDropdown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeDropdown);
});

function statusLabel(status: ChapterStatus) {
  const labels: Record<ChapterStatus, string> = {
    draft: "草稿",
    script_done: "完成",
    structured: "结构",
    storyboard_done: "分镜",
    images_done: "图像",
    layout_done: "排版",
    exported: "导出",
  };
  return labels[status];
}
</script>

<style scoped>
.chapter-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  z-index: 20;
}

.chapter-dropdown-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: fit-content;
  min-width: 220px;
  max-width: 100%;
  height: 38px;
  background: rgba(13, 18, 33, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 0 14px;
  color: #f1f5f9;
  cursor: pointer;
  transition: all 0.2s;
  gap: 20px;
}

.chapter-dropdown-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

.btn-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.book-icon {
  color: #a78bfa;
}

.btn-title {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  font-weight: 800;
}

.btn-status.script_done,
.btn-status.structured,
.btn-status.storyboard_done,
.btn-status.images_done,
.btn-status.layout_done,
.btn-status.exported {
  background: rgba(34, 199, 169, 0.15);
  color: #8df0dc;
}

.chevron-icon {
  color: #94a3b8;
  transition: transform 0.2s;
}

.chevron-icon.is-open {
  transform: rotate(180deg);
}

.script-title-display {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(420px, 42vw);
  color: #cbd5e1;
}

.script-title-label {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.script-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 800;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 380px;
  max-width: 90vw;
  background: rgba(15, 21, 38, 0.96);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dropdown-header {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.dropdown-list {
  max-height: 380px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #cbd5e1;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.dropdown-item.is-active {
  background: rgba(34, 199, 169, 0.08);
  border-color: rgba(34, 199, 169, 0.2);
}

.chapter-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
}

.dropdown-item.is-active .chapter-index {
  background: rgba(141, 240, 220, 0.15);
  color: #8df0dc;
}

.chapter-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.chapter-title {
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-preview {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  font-weight: 800;
  white-space: nowrap;
  flex: 0 0 auto;
}

.chapter-status.script_done,
.chapter-status.structured,
.chapter-status.storyboard_done,
.chapter-status.images_done,
.chapter-status.layout_done,
.chapter-status.exported {
  background: rgba(34, 199, 169, 0.15);
  color: #8df0dc;
}

.dropdown-list::-webkit-scrollbar {
  width: 6px;
}
.dropdown-list::-webkit-scrollbar-track {
  background: transparent;
}
.dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
