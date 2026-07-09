<script setup lang="ts">
/**
 * 通用可编辑字段组件(合并 StoryboardWorkspace 的 EditableShotField/EditableShotSelect
 * 与 StoryStructureWorkspace 的 EditableBlock)。
 *
 * - 无 options 时渲染 textarea(文本编辑态);有 options 时渲染 select(下拉选择态)。
 * - editable 控制是否显示编辑铅笔按钮(默认 true,剧情结构页传 canEdit)。
 * - 类名统一 editable-field;主题色差异由父组件 scoped :deep() 覆盖。
 *
 * 见前端大文件拆分轮次3。
 */
import { PencilLine } from "lucide-vue-next";
import type { PropType } from "vue";
import type { ShotSelectOption } from "../../utils/storyboard-options";

const props = defineProps({
  fieldKey: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: String, required: true },
  editingKey: { type: String as PropType<string | null>, default: null },
  editingValue: { type: String, default: "" },
  editable: { type: Boolean, default: true },
  multiline: { type: Boolean, default: false },
  options: { type: Array as PropType<ShotSelectOption[]>, default: null },
});

const emit = defineEmits<{
  start: [fieldKey: string, value: string];
  input: [value: string];
  /** 文本模式提交(value=editingValue);选择模式提交(value=选中值) */
  commit: [fieldKey: string, value: string];
}>();
</script>

<template>
  <div class="editable-field">
    <span class="editable-label">{{ label }}</span>
    <div class="editable-value">
      <!-- 选择模式 -->
      <select
        v-if="options"
        :value="value"
        class="field-select"
        @change="emit('commit', fieldKey, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>

      <!-- 文本编辑态 -->
      <textarea
        v-else-if="editingKey === fieldKey"
        :value="editingValue"
        :rows="multiline ? 4 : 2"
        @input="emit('input', ($event.target as HTMLInputElement | HTMLTextAreaElement).value)"
        @blur="emit('commit', fieldKey, editingValue)"
        @keydown="!multiline && $event.key === 'Enter' ? (($event.preventDefault()), ($event.target as HTMLTextAreaElement).blur()) : undefined"
      />

      <!-- 文本展示态 -->
      <p v-else>{{ value || "未填写" }}</p>

      <!-- 编辑铅笔按钮(仅文本模式 + editable + 非编辑态) -->
      <button
        v-if="!options && editable && editingKey !== fieldKey"
        type="button"
        title="编辑"
        class="edit-field-btn"
        @click="emit('start', fieldKey, value)"
      >
        <PencilLine :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 下拉框深色主题基础样式(父组件 :deep 覆盖颜色,这里兜底结构)。
 * 注意:<option> 弹出层在多数浏览器是系统原生控件,CSS 对其有限;
 * 通过给 select 和 option 都设深色背景,在支持的浏览器(Chrome/Firefox)生效。 */
.field-select {
  width: 100%;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  border-radius: 6px;
  background-color: rgba(5, 9, 18, 0.7) !important;
  color: #f8fbff !important;
  padding: 7px 28px 7px 12px;
  font: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  outline: none;
  /* 自定义下拉箭头 */
  background-image:
    linear-gradient(45deg, transparent 50%, #a78bfa 50%),
    linear-gradient(135deg, #a78bfa 50%, transparent 50%) !important;
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50% !important;
  background-size: 5px 5px, 5px 5px !important;
  background-repeat: no-repeat !important;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field-select:focus {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
}

.field-select option {
  background-color: #0f172a;
  color: #f1f5f9;
}

/* textarea 深色兜底(父组件 :deep 覆盖颜色,这里兜底避免白底) */
.editable-value textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  border-radius: 6px;
  background-color: rgba(5, 9, 18, 0.7) !important;
  color: #f8fbff !important;
  padding: 8px 12px;
  font: inherit;
  font-size: 12.5px;
  line-height: 1.6;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.editable-value textarea:focus {
  border-color: rgba(139, 92, 246, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12) !important;
}

html[data-theme="light"] .editable-value textarea {
  background-color: #ffffff !important;
  color: #1e293b !important;
  border-color: rgba(124, 58, 237, 0.25) !important;
}

html[data-theme="light"] .field-select {
  background-color: #ffffff;
  color: #1e293b;
  border-color: rgba(124, 58, 237, 0.25);
  background-image:
    linear-gradient(45deg, transparent 50%, #7c3aed 50%),
    linear-gradient(135deg, #7c3aed 50%, transparent 50%);
}

html[data-theme="light"] .field-select option {
  background-color: #ffffff;
  color: #1e293b;
}

.edit-field-btn {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}

.editable-value:hover .edit-field-btn {
  opacity: 0.7;
}

.edit-field-btn:hover {
  opacity: 1 !important;
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.1);
}
</style>
