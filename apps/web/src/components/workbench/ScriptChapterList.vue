<template>
  <aside class="chapter-list" aria-label="章节列表">
    <header class="chapter-list-header">
      <div>
        <span>章节</span>
        <strong>{{ chapters.length }}</strong>
      </div>
    </header>

    <div class="chapter-items" role="list">
      <button
        v-for="chapter in orderedChapters"
        :key="chapter.id"
        class="chapter-item"
        :class="{ active: chapter.id === currentChapterId }"
        type="button"
        role="listitem"
        @click="$emit('select', chapter.id)"
      >
        <span class="chapter-index">{{ chapter.order }}</span>
        <span class="chapter-body">
          <span class="chapter-title">{{ chapter.title }}</span>
          <span class="chapter-preview">{{ chapter.sourceTextPreview || "空白章节" }}</span>
        </span>
        <span class="chapter-status" :class="chapter.status">
          <CheckCircle2 v-if="chapter.status !== 'draft'" :size="13" />
          <Circle v-else :size="13" />
          <span>{{ statusLabel(chapter.status) }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, Circle } from "lucide-vue-next";
import type { ChapterListItem, ChapterStatus } from "@airoaming/shared";

const props = defineProps<{
  chapters: ChapterListItem[];
  currentChapterId: string | null;
}>();

defineEmits<{
  select: [chapterId: string];
}>();

const orderedChapters = computed(() => [...props.chapters].sort((left, right) => left.order - right.order));

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
.chapter-list {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(13, 18, 33, 0.48);
  padding: 12px;
}

.chapter-list-header {
  display: flex;
  align-items: center;
  min-width: 70px;
}

.chapter-list-header div {
  display: grid;
  gap: 2px;
}

.chapter-list-header span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.chapter-list-header strong {
  color: #f8fbff;
  font-size: 20px;
  line-height: 1;
}

.chapter-items {
  display: flex;
  gap: 10px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}

.chapter-item {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(260px, 52vw);
  min-width: 220px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: inherit;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.chapter-item:hover {
  transform: translateY(-1px);
  border-color: rgba(141, 240, 220, 0.28);
  background: rgba(255, 255, 255, 0.055);
}

.chapter-item.active {
  border-color: rgba(141, 240, 220, 0.46);
  background: rgba(34, 199, 169, 0.09);
}

.chapter-index {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: rgba(141, 240, 220, 0.12);
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.chapter-body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.chapter-title,
.chapter-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-title {
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 800;
}

.chapter-preview {
  color: #7d89a6;
  font-size: 12px;
}

.chapter-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
  padding: 4px 7px;
  font-size: 11px;
  font-weight: 900;
}

.chapter-status.script_done,
.chapter-status.structured,
.chapter-status.storyboard_done,
.chapter-status.images_done,
.chapter-status.layout_done,
.chapter-status.exported {
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc;
}

@media (max-width: 860px) {
  .chapter-list {
    grid-template-columns: 1fr;
  }

  .chapter-list-header {
    min-width: 0;
  }
}
</style>
