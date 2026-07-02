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
