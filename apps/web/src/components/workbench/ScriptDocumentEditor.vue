<template>
  <section class="script-editor" aria-label="剧本">
    <header class="editor-toolbar">
      <div class="toolbar-group">
        <button class="toolbar-dropdown" type="button">
          <span>正文</span>
          <ChevronDown :size="14" />
        </button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn text-btn">H1</button>
        <button class="toolbar-btn text-btn">H2</button>
        <button class="toolbar-btn text-btn">H3</button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn"><List :size="14" /></button>
        <button class="toolbar-btn"><ListOrdered :size="14" /></button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn"><Bold :size="14" /></button>
        <button class="toolbar-btn"><Italic :size="14" /></button>
        <button class="toolbar-btn"><Underline :size="14" /></button>
        <button class="toolbar-btn"><Strikethrough :size="14" /></button>
        <button class="toolbar-btn"><Quote :size="14" /></button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn"><Image :size="14" /></button>
        <button class="toolbar-btn"><ImageIcon :size="14" /></button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn"><MoreHorizontal :size="14" /></button>
      </div>
    </header>

    <div class="editor-content">
      <textarea
        v-model="form.sourceText"
        class="script-textarea"
        placeholder="在这里开始写你的故事..."
      ></textarea>
    </div>

    <footer class="editor-footer">
      <div class="footer-stats">
        <span>字数 {{ form.sourceText.length }}</span>
        <span>预估页数 {{ estimatedPages }} 页</span>
        <div class="save-status">
          <span>已自动保存 10:24:36</span>
          <CheckCircle2 :size="14" class="status-icon" />
        </div>
      </div>
      <div class="footer-actions">
        <button class="save-draft-btn" type="button" :disabled="loading || !hasChanges" @click="submitSave">
          <Save :size="14" />
          <span>保存草稿</span>
        </button>
        <button class="next-step-btn" type="button">
          <span>进入剧情结构</span>
          <ArrowRight :size="14" />
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { CheckCircle2, Save, ChevronDown, List, ListOrdered, Bold, Italic, Underline, Strikethrough, Quote, Image, ImageIcon, MoreHorizontal, ArrowRight } from "lucide-vue-next";
import type { ArtStyle, ComicFormat, UpdateProjectDraftRequest, WorkbenchSnapshot } from "@airoaming/shared";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  save: [input: UpdateProjectDraftRequest];
}>();

const form = reactive({
  name: "",
  storyTitle: "",
  comicFormat: "vertical_scroll" as ComicFormat,
  artStyle: "dark_realistic" as ArtStyle,
  sourceText: "",
});
const genreText = ref("");

const comicFormatOptions = [
  { key: "vertical_scroll", label: "条漫 / 竖屏" },
  { key: "page_horizontal", label: "页漫 / 横屏" },
  { key: "four_panel", label: "四格漫画" },
] as const satisfies ReadonlyArray<{ key: ComicFormat; label: string }>;

const artStyleOptions = [
  { key: "dark_realistic", label: "暗调写实" },
  { key: "semi_realistic", label: "半写实" },
  { key: "japanese_realistic", label: "日系写实" },
  { key: "comic_style", label: "漫画风格" },
  { key: "cyberpunk", label: "赛博朋克" },
  { key: "custom", label: "自定义" },
] as const satisfies ReadonlyArray<{ key: ArtStyle; label: string }>;

const estimatedPages = computed(() => {
  const length = form.sourceText.trim().length;
  if (length === 0) return "0";
  const min = Math.ceil(length / 300);
  const max = Math.ceil(length / 250);
  if (min === max) return `${min}`;
  return `${min}-${max}`;
});

const normalizedCurrentTags = computed(() => props.snapshot.project.genreTags.join("，"));

const hasChanges = computed(() => {
  return (
    form.name !== props.snapshot.project.name ||
    form.storyTitle !== props.snapshot.project.storyTitle ||
    form.comicFormat !== props.snapshot.project.comicFormat ||
    form.artStyle !== props.snapshot.project.artStyle ||
    form.sourceText !== props.snapshot.story.sourceText ||
    genreText.value !== normalizedCurrentTags.value
  );
});

const canSave = computed(() => form.name.trim().length > 0 && hasChanges.value);

watch(
  () => props.snapshot,
  () => resetForm(),
  { immediate: true },
);

function resetForm() {
  form.name = props.snapshot.project.name;
  form.storyTitle = props.snapshot.project.storyTitle;
  form.comicFormat = props.snapshot.project.comicFormat;
  form.artStyle = props.snapshot.project.artStyle;
  form.sourceText = props.snapshot.story.sourceText;
  genreText.value = normalizedCurrentTags.value;
}

function submitSave() {
  if (!canSave.value) {
    return;
  }

  emit("save", {
    name: form.name,
    storyTitle: form.storyTitle,
    genreTags: genreText.value
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean),
    comicFormat: form.comicFormat,
    artStyle: form.artStyle,
    description: form.storyTitle || form.name,
    sourceText: form.sourceText,
  });
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

.toolbar-btn, .toolbar-dropdown {
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

.toolbar-dropdown {
  gap: 6px;
  padding: 4px 8px;
  font-size: 13px;
}

.toolbar-btn:hover, .toolbar-dropdown:hover {
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

.script-textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 15px;
  line-height: 1.8;
  outline: none;
  font-family: inherit;
}

.script-textarea::placeholder {
  color: #475569;
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

.footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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

.next-step-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(124, 58, 237, 0.4);
}
</style>
