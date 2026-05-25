<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="presentation" @click.self="$emit('close')">
      <section class="modal-panel large-modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <header class="modal-header">
          <div>
            <span>新建项目</span>
            <h2 id="create-project-title">项目信息</h2>
          </div>
          <div class="header-actions">
            <button class="ghost-action" type="submit" form="create-form" :disabled="loading || !canSubmit">
              <Save :size="16" /> 保存草稿
            </button>
            <button class="primary-action pulse-btn" type="submit" form="create-form" :disabled="loading || !canSubmit">
              <Sparkles :size="16" />
              <span>{{ loading ? "创建中..." : "创建项目" }}</span>
            </button>
            <button class="icon-button" type="button" aria-label="关闭" @click="$emit('close')">
              <X :size="19" />
            </button>
          </div>
        </header>

        <div class="modal-body">
          <form id="create-form" class="premium-form" @submit.prevent="submit">
            <div class="form-row">
              <span class="row-label">项目名称</span>
              <div class="input-wrapper">
                <input v-model.trim="form.name" type="text" placeholder="例如：迷雾之城" required maxlength="30" />
                <span class="char-count">{{ form.name.length }} / 30</span>
              </div>
            </div>

            <div class="form-row">
              <span class="row-label">故事标题</span>
              <div class="input-wrapper">
                <input v-model.trim="form.storyTitle" type="text" placeholder="给项目一个清晰创作方向" maxlength="50" />
                <span class="char-count">{{ form.storyTitle.length }} / 50</span>
              </div>
            </div>

            <div class="form-row">
              <span class="row-label">题材 / 类型</span>
              <div class="tags-group">
                <button
                  v-for="tag in genreOptions"
                  :key="tag"
                  type="button"
                  class="tag-btn"
                  :class="{ 'is-active': form.genreTags.includes(tag) }"
                  @click="toggleGenreTag(tag)"
                >
                  {{ tag }} <ChevronDown v-if="tag === '悬疑' || tag === '都市'" :size="14"/>
                </button>
                <button type="button" class="tag-btn add-tag"><Plus :size="14"/> 添加标签</button>
              </div>
            </div>

            <div class="form-row">
              <span class="row-label">漫画格式</span>
              <div class="format-group">
                <button
                  v-for="format in comicFormatOptions"
                  :key="format.key"
                  type="button"
                  class="format-radio"
                  :class="{ 'is-active': form.comicFormat === format.key }"
                  @click="form.comicFormat = format.key"
                >
                  <component :is="format.icon" :size="16" :class="{ 'check-icon': form.comicFormat === format.key }" />
                  <span>{{ format.label }}</span>
                </button>
              </div>
            </div>

            <div class="form-row">
              <span class="row-label">画风方向</span>
              <div class="style-group">
                <div
                  v-for="style in styleOptions"
                  :key="style.key"
                  class="style-card"
                  :class="{ 'is-active': form.artStyle === style.key }"
                  role="button"
                  tabindex="0"
                  @click="form.artStyle = style.key"
                  @keydown.enter="form.artStyle = style.key"
                >
                  <img class="style-img" :src="style.image" :alt="style.name" />
                  <div class="style-name">{{ style.name }}</div>
                  <div v-if="form.artStyle === style.key" class="check-badge"><Check :size="12" /></div>
                </div>
                <div class="style-card add-style">
                  <Plus :size="16" />
                  <span>自定义风格</span>
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="section-header">
                <span class="row-label" style="width: auto;">故事原文 <small>(草稿)</small></span>
              </div>
              <div class="textarea-wrapper">
                <textarea v-model.trim="form.sourceText" rows="6" placeholder="夜色笼罩，迷雾吞没了海港城市里错综复杂的灯火..." maxlength="5000"></textarea>
                <div class="textarea-footer">
                  <div class="save-status">
                    <CheckCircle2 :size="14" class="success-icon" /> {{ canSubmit ? "可保存为项目草稿" : "请先填写项目名称" }}
                  </div>
                  <div class="char-count" style="position: static;">{{ form.sourceText.length }} / 5000</div>
                </div>
              </div>
            </div>

          </form>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { Check, CheckCircle2, ChevronDown, LayoutGrid, MonitorSmartphone, Plus, Save, Sparkles, X } from "lucide-vue-next";
import type { ArtStyle, ComicFormat, CreateProjectRequest, ProjectType } from "@airoaming/shared";
import coverMistTown from "../../assets/project-library/project-cover-mist-town.png";
import coverRainCity from "../../assets/project-library/project-cover-rain-city.png";
import coverSchoolNight from "../../assets/project-library/project-cover-school-night.png";
import coverTransit from "../../assets/project-library/project-cover-transit.png";

const props = defineProps<{
  open: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [input: CreateProjectRequest];
}>();

const form = reactive({
  name: "",
  type: "comic" as ProjectType,
  storyTitle: "",
  genreTags: ["悬疑", "都市"],
  comicFormat: "vertical_scroll" as ComicFormat,
  artStyle: "dark_realistic" as ArtStyle,
  sourceText: "",
});

const canSubmit = computed(() => form.name.trim().length > 0);
const genreOptions = ["悬疑", "黑色电影", "都市", "犯罪", "赛博", "超自然"] as const;
const comicFormatOptions = [
  {
    key: "vertical_scroll",
    label: "条漫 (竖屏)",
    icon: CheckCircle2,
  },
  {
    key: "page_horizontal",
    label: "页漫 (横屏)",
    icon: MonitorSmartphone,
  },
  {
    key: "four_panel",
    label: "四格漫画",
    icon: LayoutGrid,
  },
] as const satisfies ReadonlyArray<{ key: ComicFormat; label: string; icon: unknown }>;
const styleOptions = [
  {
    key: "dark_realistic",
    name: "写实写暗",
    image: coverRainCity,
  },
  {
    key: "semi_realistic",
    name: "半写实",
    image: coverTransit,
  },
  {
    key: "japanese_realistic",
    name: "日系写实",
    image: coverSchoolNight,
  },
  {
    key: "comic_style",
    name: "漫画风格",
    image: coverMistTown,
  },
  {
    key: "cyberpunk",
    name: "赛博朋克",
    image: coverRainCity,
  },
] as const satisfies ReadonlyArray<{ key: ArtStyle; name: string; image: string }>;

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      form.name = "";
      form.type = "comic";
      form.storyTitle = "";
      form.genreTags = ["悬疑", "都市"];
      form.comicFormat = "vertical_scroll";
      form.artStyle = "dark_realistic";
      form.sourceText = "";
    }
  },
);

function toggleGenreTag(tag: string) {
  if (form.genreTags.includes(tag)) {
    form.genreTags = form.genreTags.filter((item) => item !== tag);
    return;
  }

  form.genreTags = [...form.genreTags, tag];
}

function submit() {
  if (!canSubmit.value) {
    return;
  }

  emit("create", {
    name: form.name,
    type: form.type,
    storyTitle: form.storyTitle,
    genreTags: form.genreTags,
    comicFormat: form.comicFormat,
    artStyle: form.artStyle,
    description: form.storyTitle,
    sourceText: form.sourceText,
  });
}
</script>

<style scoped>
.large-modal {
  width: 900px !important;
  max-width: 95vw !important;
  max-height: 90vh !important;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ghost-action {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #e2e8f0;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.ghost-action:hover {
  background: rgba(255, 255, 255, 0.05);
}

.pulse-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px !important;
  font-size: 14px !important;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.premium-form {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.row-label {
  width: 100px;
  flex-shrink: 0;
  font-size: 14px;
  color: #e2e8f0;
  font-weight: 500;
}
.row-label small {
  color: #6b7a94;
  font-weight: 400;
}

.input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper input {
  width: 100%;
  padding-right: 60px;
}

.char-count {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: #6b7a94;
  pointer-events: none;
}

.tags-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #b0bdd0;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.tag-btn.is-active {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.4);
  color: #a78bfa;
}

.tag-btn.add-tag {
  border-style: dashed;
}

.format-group {
  display: flex;
  gap: 12px;
}

.format-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13px;
  color: #b0bdd0;
  cursor: pointer;
  transition: all 0.2s;
}

.format-radio.is-active {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.5);
  color: #e2e8f0;
}

.check-icon {
  color: #a78bfa;
}

.style-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.style-card {
  position: relative;
  width: 110px;
  height: 70px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.style-card:hover {
  transform: translateY(-2px);
}

.style-card.is-active {
  border-color: #a78bfa;
  box-shadow: 0 0 0 1px #a78bfa;
}

.style-img {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.style-card.is-active .style-img {
  opacity: 0.8;
}

.style-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
  font-size: 11px;
  padding: 16px 6px 4px;
  text-align: center;
  color: white;
}

.check-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  background: #a78bfa;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.style-card.add-style {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  color: #6b7a94;
  font-size: 11px;
  background: transparent;
}

.style-card.add-style:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: #b0bdd0;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.section-header {
  display: flex;
}

.textarea-wrapper {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.textarea-wrapper:focus-within {
  border-color: rgba(139, 92, 246, 0.4) !important;
}

.textarea-wrapper textarea {
  width: 100%;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 16px;
  color: #e2e8f0;
  resize: vertical;
}

.textarea-wrapper textarea:focus {
  outline: none !important;
  box-shadow: none !important;
}

.textarea-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7a94;
}

.success-icon {
  color: #22c55e;
}

/* 参考项目工作区效果图，保留弹窗形态，只收敛创建项目表单视觉。 */
.modal-backdrop {
  padding: 24px !important;
  background:
    radial-gradient(circle at 50% 16%, rgba(92, 62, 255, 0.18), transparent 36%),
    rgba(2, 6, 16, 0.78) !important;
  backdrop-filter: blur(10px) !important;
}

.large-modal {
  width: min(1120px, calc(100vw - 48px)) !important;
  max-width: none !important;
  max-height: min(860px, calc(100vh - 48px)) !important;
  overflow: hidden !important;
  border: 1px solid rgba(105, 88, 255, 0.24) !important;
  border-radius: 16px !important;
  background:
    linear-gradient(180deg, rgba(13, 21, 39, 0.98), rgba(6, 12, 26, 0.98)),
    #08101f !important;
  box-shadow:
    0 34px 90px rgba(0, 0, 0, 0.56),
    inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

.modal-header {
  position: relative;
  min-height: 82px;
  border-bottom: 1px solid rgba(123, 104, 255, 0.14) !important;
  background:
    linear-gradient(90deg, rgba(123, 104, 255, 0.13), transparent 45%),
    rgba(8, 15, 31, 0.74);
  padding: 18px 20px 18px 24px !important;
}

.modal-header span {
  color: #9c87ff !important;
  font-size: 13px !important;
  font-weight: 900 !important;
}

.modal-header h2 {
  margin-top: 5px !important;
  color: #f8fbff !important;
  font-size: 24px !important;
  font-weight: 900 !important;
  line-height: 1.2 !important;
}

.header-actions {
  flex-shrink: 0;
  gap: 10px !important;
}

.ghost-action {
  min-height: 40px !important;
  border-color: rgba(206, 216, 244, 0.16) !important;
  background: rgba(255, 255, 255, 0.035) !important;
  color: #d8e2f6 !important;
  padding: 0 14px !important;
}

.pulse-btn {
  min-height: 42px !important;
  border: 1px solid rgba(255, 255, 255, 0.13) !important;
  background: linear-gradient(135deg, #7c3aed, #4f46e5 56%, #22c7a9) !important;
  padding: 0 18px !important;
  box-shadow: 0 16px 36px rgba(91, 69, 255, 0.34) !important;
}

.icon-button {
  width: 40px !important;
  height: 40px !important;
  border-color: rgba(206, 216, 244, 0.16) !important;
  background: rgba(255, 255, 255, 0.04) !important;
}

.modal-body {
  padding: 22px 24px 24px !important;
  background:
    radial-gradient(circle at 76% 0%, rgba(34, 199, 169, 0.08), transparent 32%),
    rgba(6, 12, 26, 0.42);
}

.premium-form {
  gap: 18px !important;
}

.form-row {
  display: grid !important;
  grid-template-columns: 110px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 18px !important;
}

.row-label {
  width: auto !important;
  color: #dce6fb !important;
  font-size: 14px !important;
  font-weight: 800 !important;
}

.input-wrapper input {
  min-height: 44px !important;
  border: 1px solid rgba(205, 216, 245, 0.14) !important;
  border-radius: 8px !important;
  background: rgba(6, 12, 26, 0.72) !important;
  color: #f5f8ff !important;
  padding: 0 70px 0 14px !important;
}

.input-wrapper input:focus {
  border-color: rgba(139, 92, 246, 0.58) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.13) !important;
  outline: 0 !important;
}

.char-count {
  color: #74829d !important;
}

.tags-group,
.format-group,
.style-group {
  min-width: 0;
}

.tag-btn {
  min-height: 36px !important;
  border-color: rgba(205, 216, 245, 0.13) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.035) !important;
  color: #b6c2dc !important;
  padding: 0 12px !important;
  font-weight: 700 !important;
}

.tag-btn.is-active {
  border-color: rgba(139, 92, 246, 0.48) !important;
  background: rgba(139, 92, 246, 0.22) !important;
  color: #ddd6ff !important;
}

.tag-btn.add-tag {
  color: #8492ad !important;
}

.format-group {
  flex-wrap: wrap;
}

.format-radio {
  min-height: 42px !important;
  border-color: rgba(205, 216, 245, 0.12) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.035) !important;
  color: #b9c4da !important;
  padding: 0 18px !important;
  font-weight: 800 !important;
}

.format-radio.is-active {
  border-color: rgba(139, 92, 246, 0.62) !important;
  background: rgba(139, 92, 246, 0.16) !important;
  color: #ffffff !important;
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.18) inset !important;
}

.style-group {
  display: grid !important;
  grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
  gap: 12px !important;
}

.style-card {
  width: auto !important;
  height: auto !important;
  aspect-ratio: 16 / 9 !important;
  border: 1px solid rgba(205, 216, 245, 0.12) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.025) !important;
}

.style-card:hover {
  transform: translateY(-1px) !important;
  border-color: rgba(139, 92, 246, 0.42) !important;
}

.style-card.is-active {
  border-color: rgba(139, 92, 246, 0.86) !important;
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.56), 0 10px 24px rgba(91, 69, 255, 0.22) !important;
}

.style-img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  object-position: center !important;
}

.style-name {
  padding: 22px 8px 7px !important;
  background: linear-gradient(to top, rgba(2, 6, 16, 0.86), rgba(2, 6, 16, 0)) !important;
  color: #ffffff !important;
  font-size: 12px !important;
  font-weight: 800 !important;
  text-align: left !important;
}

.check-badge {
  top: 6px !important;
  right: 6px !important;
  width: 22px !important;
  height: 22px !important;
  background: linear-gradient(135deg, #8b5cf6, #6d5dfc) !important;
}

.style-card.add-style {
  border-color: rgba(205, 216, 245, 0.18) !important;
  background: rgba(255, 255, 255, 0.025) !important;
  color: #8795af !important;
}

.form-section {
  gap: 10px !important;
  margin-top: 2px !important;
}

.textarea-wrapper {
  border-color: rgba(205, 216, 245, 0.13) !important;
  border-radius: 10px !important;
  background: rgba(6, 12, 26, 0.72) !important;
}

.textarea-wrapper textarea {
  min-height: 164px !important;
  color: #f5f8ff !important;
  font-size: 14px !important;
  line-height: 1.75 !important;
  padding: 14px 16px !important;
}

.textarea-footer {
  min-height: 42px !important;
  background: rgba(0, 0, 0, 0.16) !important;
}

.save-status {
  color: #7c8aa5 !important;
}

@media (max-width: 900px) {
  .modal-backdrop {
    padding: 12px !important;
  }

  .large-modal {
    width: calc(100vw - 24px) !important;
    max-height: calc(100vh - 24px) !important;
  }

  .modal-header {
    align-items: stretch !important;
    flex-direction: column !important;
    gap: 14px !important;
  }

  .header-actions {
    display: grid !important;
    grid-template-columns: 1fr 1fr 40px !important;
  }

  .form-row {
    grid-template-columns: 1fr !important;
    align-items: stretch !important;
    gap: 8px !important;
  }

  .style-group {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 560px) {
  .modal-header {
    min-height: 190px !important;
    padding-right: 58px !important;
  }

  .modal-body {
    padding: 16px !important;
  }

  .header-actions {
    grid-template-columns: 1fr !important;
  }

  .icon-button {
    position: absolute !important;
    top: 16px !important;
    right: 16px !important;
    width: 36px !important;
    height: 36px !important;
  }

  .format-group,
  .tags-group {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .tag-btn,
  .format-radio {
    justify-content: center !important;
  }
}
</style>
