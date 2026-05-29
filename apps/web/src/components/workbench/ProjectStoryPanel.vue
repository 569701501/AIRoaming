<template>
  <section class="story-panel" aria-label="剧本">
    <header class="story-panel-header">
      <div>
        <span>步骤 1</span>
        <h2>剧本</h2>
      </div>
      <div class="story-actions">
        <button class="ghost-story-btn" type="button" :disabled="loading || !hasChanges" @click="resetForm">
          <RotateCcw :size="15" />
          <span>撤销修改</span>
        </button>
        <button class="save-story-btn" type="button" :disabled="loading || !canSave" @click="submitSave">
          <Save :size="15" />
          <span>{{ loading ? "保存中..." : "保存草稿" }}</span>
        </button>
      </div>
    </header>

    <div class="story-form-grid">
      <label class="story-field">
        <span>项目名称</span>
        <input v-model.trim="form.name" maxlength="30" type="text" />
      </label>

      <label class="story-field">
        <span>故事标题</span>
        <input v-model.trim="form.storyTitle" maxlength="50" type="text" />
      </label>

      <label class="story-field">
        <span>漫画格式</span>
        <select v-model="form.comicFormat">
          <option v-for="format in comicFormatOptions" :key="format.key" :value="format.key">{{ format.label }}</option>
        </select>
      </label>

      <label class="story-field">
        <span>画风方向</span>
        <select v-model="form.artStyle">
          <option v-for="style in artStyleOptions" :key="style.key" :value="style.key">{{ style.label }}</option>
        </select>
      </label>
    </div>

    <label class="story-field is-wide">
      <span>题材标签</span>
      <input v-model="genreText" type="text" placeholder="用逗号分隔，例如：悬疑，都市，超自然" />
    </label>

    <label class="story-editor">
      <div class="editor-label-row">
        <span>故事原文</span>
        <small>{{ form.sourceText.length }} / 5000</small>
      </div>
      <textarea
        v-model="form.sourceText"
        maxlength="5000"
        placeholder="从第一段故事开始，后续会基于这里生成剧情结构和分镜。"
        rows="13"
      ></textarea>
    </label>

    <footer class="story-panel-footer">
      <div class="save-state" :class="{ 'has-changes': hasChanges }">
        <CheckCircle2 v-if="!hasChanges" :size="15" />
        <PencilLine v-else :size="15" />
        <span>{{ hasChanges ? "有未保存修改" : "草稿已同步" }}</span>
      </div>
      <div class="story-meta-chips">
        <span>{{ snapshot.project.genreTags.length || 0 }} 个标签</span>
        <span>{{ sourceLengthLabel }}</span>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { CheckCircle2, PencilLine, RotateCcw, Save } from "lucide-vue-next";
import type { ArtStyle, ComicFormat, UpdateProjectDraftRequest, WorkbenchSnapshot } from "@airoaming/shared";
import { getCurrentChapterSourceText } from "../../utils/workbench-chapter";

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

const sourceLengthLabel = computed(() => {
  const length = getCurrentChapterSourceText(props.snapshot).trim().length;
  return length ? `${length} 字故事` : "未填写故事";
});

const normalizedCurrentTags = computed(() => props.snapshot.project.genreTags.join("，"));

const hasChanges = computed(() => {
  return (
    form.name !== props.snapshot.project.name ||
    form.storyTitle !== props.snapshot.project.storyTitle ||
    form.comicFormat !== props.snapshot.project.comicFormat ||
    form.artStyle !== props.snapshot.project.artStyle ||
    form.sourceText !== getCurrentChapterSourceText(props.snapshot) ||
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
  form.sourceText = getCurrentChapterSourceText(props.snapshot);
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
.story-panel {
  display: grid;
  gap: 18px;
  min-width: 0;
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(18, 24, 43, 0.76), rgba(11, 16, 30, 0.62)),
    rgba(8, 12, 24, 0.76);
  padding: 18px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.story-panel-header,
.story-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.story-panel-header h2 {
  margin: 4px 0 0;
  color: #f8fbff;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.2;
}

.story-panel-header span,
.story-field span,
.editor-label-row span {
  color: #95a3c2;
  font-size: 12px;
  font-weight: 900;
}

.story-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.ghost-story-btn,
.save-story-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border-radius: 9px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 900;
  transition: border-color 0.18s, background 0.18s, color 0.18s, transform 0.18s;
}

.ghost-story-btn {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #aeb8d4;
}

.save-story-btn {
  border: 1px solid rgba(34, 199, 169, 0.26);
  background: rgba(34, 199, 169, 0.12);
  color: #85ead7;
}

.ghost-story-btn:hover,
.save-story-btn:hover {
  transform: translateY(-1px);
}

.story-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.story-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.story-field input,
.story-field select,
.story-editor textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  color: #f5f8ff;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
}

.story-field input,
.story-field select {
  height: 42px;
  padding: 0 12px;
}

.story-field select option {
  background: #101827;
  color: #f8fafc;
}

.story-editor {
  display: grid;
  gap: 8px;
}

.story-editor textarea {
  min-height: 260px;
  resize: vertical;
  padding: 14px;
  line-height: 1.7;
}

.story-field input:focus,
.story-field select:focus,
.story-editor textarea:focus {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
}

.editor-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-label-row small {
  color: #71809c;
  font-size: 12px;
}

.save-state,
.story-meta-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #7ce3ce;
  font-size: 12px;
  font-weight: 800;
}

.save-state.has-changes {
  color: #fbbf24;
}

.story-meta-chips {
  flex-wrap: wrap;
  justify-content: flex-end;
  color: #8795b1;
}

.story-meta-chips span {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  padding: 5px 9px;
}

@media (max-width: 900px) {
  .story-panel-header,
  .story-panel-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .story-actions {
    justify-content: flex-start;
  }

  .story-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
