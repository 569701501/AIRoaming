<template>
  <form class="stage-form" aria-label="阶段表单" @submit.prevent="submit">
    <div class="stage-form-field">
      <label for="stage-name">阶段名称 <span class="stage-form-optional">（可选）</span></label>
      <input
        id="stage-name"
        v-model="name"
        type="text"
        placeholder="如凡人期、筑基期"
        :disabled="submitting"
        autocomplete="off"
      />
    </div>

    <div class="stage-form-field">
      <label for="stage-from-chapter">起始章节 <span class="stage-form-optional">（可选）</span></label>
      <select id="stage-from-chapter" v-model="fromChapterId" :disabled="submitting">
        <option value="">从头</option>
        <option v-for="chapter in sortedChapters" :key="chapter.id" :value="chapter.id">
          第{{ chapter.order }}章 - {{ chapter.title }}
        </option>
      </select>
      <p class="stage-form-hint">不选择表示从最早可判定的章节开始；结束章节由系统按下一阶段自动衔接。</p>
    </div>

    <div class="stage-form-field">
      <label for="stage-visual-delta">外观变化描述 <span class="stage-form-required">（必填）</span></label>
      <textarea
        id="stage-visual-delta"
        v-model="visualDelta"
        rows="3"
        placeholder="如改穿金袍、蓄短须、气质更沉稳"
        :disabled="submitting"
      ></textarea>
      <p v-if="validationError" class="stage-form-error" role="alert">
        <AlertCircle :size="13" />
        <span>{{ validationError }}</span>
      </p>
    </div>

    <p v-if="error" class="stage-form-error" role="alert">
      <AlertCircle :size="13" />
      <span>{{ error }}</span>
    </p>

    <footer class="stage-form-actions">
      <button class="stage-form-button is-secondary" type="button" :disabled="submitting" @click="cancel">取消</button>
      <button class="stage-form-button is-primary" type="submit" :disabled="submitting">
        <LoaderCircle v-if="submitting" :size="14" class="is-spinning" />
        <span>{{ submitting ? "保存中..." : "保存" }}</span>
      </button>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertCircle, LoaderCircle } from "lucide-vue-next";
import type { ChapterListItem, CharacterStage, ProjectCharacter, WorkbenchAsset } from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  projectId: string;
  character: ProjectCharacter | null;
  chapters: ChapterListItem[];
  /** 传入表示编辑模式，null 表示创建模式 */
  stage: CharacterStage | null;
}>();

const emit = defineEmits<{
  cancel: [];
  saved: [payload: { stage: CharacterStage; previewAsset: WorkbenchAsset | null }];
}>();

const name = ref("");
const fromChapterId = ref("");
const visualDelta = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);
const validationError = ref<string | null>(null);

const sortedChapters = computed(() => [...props.chapters].sort((left, right) => left.order - right.order));

watch(
  () => props.stage,
  (stage) => {
    name.value = stage?.name?.trim() ?? "";
    fromChapterId.value = stage?.fromChapterId ?? "";
    visualDelta.value = stage?.visualDelta ?? "";
    error.value = null;
    validationError.value = null;
  },
  { immediate: true },
);

async function submit() {
  if (!props.character || submitting.value) {
    return;
  }
  const nextDelta = visualDelta.value.trim();
  if (!nextDelta) {
    validationError.value = "请填写外观变化描述。";
    return;
  }
  submitting.value = true;
  error.value = null;
  validationError.value = null;
  try {
    const payload = {
      // 编辑模式清空字段时传空串，后端将其归一为 null（清空）；不传 undefined 以保留旧值
      name: name.value.trim(),
      fromChapterId: fromChapterId.value,
      visualDelta: nextDelta,
    };
    if (props.stage) {
      const result = await api.updateCharacterStage(props.projectId, props.character.id, props.stage.id, payload);
      emit("saved", { stage: result.stage, previewAsset: null });
    } else {
      const result = await api.createCharacterStage(props.projectId, props.character.id, payload);
      emit("saved", { stage: result.stage, previewAsset: result.previewAsset ?? null });
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存阶段失败，请重试。";
  } finally {
    submitting.value = false;
  }
}

function cancel() {
  if (!submitting.value) {
    emit("cancel");
  }
}
</script>

<style scoped>
.stage-form {
  display: grid;
  gap: 14px;
  min-height: 0;
}

.stage-form-field {
  display: grid;
  gap: 6px;
}

.stage-form-field label {
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 900;
}

.stage-form-optional {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.stage-form-required {
  color: #f87171;
  font-size: 11px;
  font-weight: 700;
}

.stage-form-field input,
.stage-form-field select,
.stage-form-field textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.55);
  color: #f1f5f9;
  font-size: 13px;
  line-height: 1.6;
  padding: 9px 11px;
  outline: none;
  transition: border-color 0.16s, box-shadow 0.16s;
}

.stage-form-field input::placeholder,
.stage-form-field textarea::placeholder {
  color: #475569;
}

.stage-form-field input:focus,
.stage-form-field select:focus,
.stage-form-field textarea:focus {
  border-color: rgba(34, 199, 169, 0.55);
  box-shadow: 0 0 0 3px rgba(34, 199, 169, 0.14);
}

.stage-form-field textarea {
  resize: vertical;
  min-height: 84px;
}

.stage-form-field input:disabled,
.stage-form-field select:disabled,
.stage-form-field textarea:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.stage-form-hint {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.6;
}

.stage-form-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.stage-form-error svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.stage-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.stage-form-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s, border-color 0.18s, background 0.18s, color 0.18s;
}

.stage-form-button.is-secondary {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
}

.stage-form-button.is-secondary:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.stage-form-button.is-primary {
  border: 1px solid rgba(34, 199, 169, 0.4);
  background: linear-gradient(135deg, #22c7a9, #0ea5a4);
  color: #03221c;
  box-shadow: 0 10px 24px rgba(34, 199, 169, 0.24);
}

.stage-form-button.is-primary:hover {
  transform: translateY(-1px);
}

.stage-form-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.is-spinning {
  animation: stage-form-spin 0.9s linear infinite;
}

@keyframes stage-form-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .stage-form-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
