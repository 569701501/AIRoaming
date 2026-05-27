<template>
  <div class="markdown-text-editor">
    <div ref="editorRoot" class="markdown-editor-root"></div>
  </div>
</template>

<script setup lang="ts">
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { indentWithTab } from "@codemirror/commands";
import { EditorSelection, EditorState, type ChangeSpec, Compartment } from "@codemirror/state";
import { EditorView, keymap, placeholder as editorPlaceholder } from "@codemirror/view";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
}>(), {
  placeholder: "",
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;

const editableCompartment = new Compartment();

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    background: "transparent",
    color: "#e2e8f0",
    fontSize: "15px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.8",
    overflow: "auto",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "0",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-placeholder": {
    color: "#475569",
  },
  ".cm-cursor": {
    borderLeftColor: "#a78bfa",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(124, 58, 237, 0.26)",
  },
}, { dark: true });

onMounted(() => {
  if (!editorRoot.value) {
    return;
  }

  editorView = new EditorView({
    parent: editorRoot.value,
    doc: props.modelValue,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      editorTheme,
      editorPlaceholder(props.placeholder),
      keymap.of([indentWithTab]),
      editableCompartment.of(readOnlyExtensions(props.disabled)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit("update:modelValue", update.state.doc.toString());
        }
      }),
    ],
  });
});

onBeforeUnmount(() => {
  editorView?.destroy();
  editorView = null;
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editorView) {
      return;
    }

    const currentValue = editorView.state.doc.toString();
    if (value === currentValue) {
      return;
    }

    editorView.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  },
);

watch(
  () => props.disabled,
  (disabled) => {
    editorView?.dispatch({
      effects: editableCompartment.reconfigure(readOnlyExtensions(disabled)),
    });
  },
);

function readOnlyExtensions(disabled: boolean) {
  return [
    EditorView.editable.of(!disabled),
    EditorState.readOnly.of(disabled),
  ];
}

function focus() {
  editorView?.focus();
}

function setHeading(level: 1 | 2 | 3) {
  transformSelectedLines((lineText) => {
    const content = lineText.replace(/^#{1,6}\s*/, "");
    return `${"#".repeat(level)} ${content}`.trimEnd();
  });
}

function toggleBulletList() {
  let index = 0;
  transformSelectedLines((lineText) => {
    index += 1;
    const match = lineText.match(/^(\s*)[-*+]\s+(.*)$/);
    if (match) {
      return `${match[1]}${match[2]}`;
    }

    const orderedMatch = lineText.match(/^(\s*)\d+\.\s+(.*)$/);
    if (orderedMatch) {
      return `${orderedMatch[1]}- ${orderedMatch[2]}`;
    }

    const indent = lineText.match(/^\s*/)?.[0] ?? "";
    return `${indent}- ${lineText.slice(indent.length) || `列表项 ${index}`}`;
  });
}

function toggleOrderedList() {
  let index = 0;
  transformSelectedLines((lineText) => {
    index += 1;
    const match = lineText.match(/^(\s*)\d+\.\s+(.*)$/);
    if (match) {
      return `${match[1]}${match[2]}`;
    }

    const bulletMatch = lineText.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bulletMatch) {
      return `${bulletMatch[1]}${index}. ${bulletMatch[2]}`;
    }

    const indent = lineText.match(/^\s*/)?.[0] ?? "";
    return `${indent}${index}. ${lineText.slice(indent.length) || `列表项 ${index}`}`;
  });
}

function toggleBlockquote() {
  transformSelectedLines((lineText) => {
    if (lineText.startsWith("> ")) {
      return lineText.slice(2);
    }

    return `> ${lineText}`;
  });
}

function wrapSelection(before: string, after = before, fallback = "文本") {
  const view = editorView;
  if (!view) {
    return;
  }

  const transaction = view.state.changeByRange((range) => {
    const selectedText = view.state.sliceDoc(range.from, range.to) || fallback;
    const nextText = `${before}${selectedText}${after}`;
    const anchor = range.from + before.length;
    const head = anchor + selectedText.length;

    return {
      changes: {
        from: range.from,
        to: range.to,
        insert: nextText,
      },
      range: EditorSelection.range(anchor, head),
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true,
  });
  view.focus();
}

function insertAtCursor(text: string) {
  const view = editorView;
  if (!view) {
    return;
  }

  const transaction = view.state.changeByRange((range) => {
    const insert = text;
    const cursor = range.from + insert.length;
    return {
      changes: {
        from: range.from,
        to: range.to,
        insert,
      },
      range: EditorSelection.cursor(cursor),
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true,
  });
  view.focus();
}

function insertImage() {
  insertAtCursor("![图片描述](图片地址)");
}

function transformSelectedLines(transform: (lineText: string) => string) {
  const view = editorView;
  if (!view) {
    return;
  }

  const lineNumbers = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from);
    const endLine = view.state.doc.lineAt(Math.max(range.from, range.to - 1));
    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      lineNumbers.add(lineNumber);
    }
  }

  const changes: ChangeSpec[] = [];
  [...lineNumbers].sort((left, right) => left - right).forEach((lineNumber) => {
    const line = view.state.doc.line(lineNumber);
    const nextText = transform(line.text);
    if (nextText !== line.text) {
      changes.push({
        from: line.from,
        to: line.to,
        insert: nextText,
      });
    }
  });

  if (changes.length === 0) {
    return;
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
  });
  view.focus();
}

defineExpose({
  focus,
  setHeading,
  toggleBulletList,
  toggleOrderedList,
  toggleBlockquote,
  wrapSelection,
  insertAtCursor,
  insertImage,
});
</script>

<style scoped>
.markdown-text-editor {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.markdown-editor-root {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.markdown-editor-root :deep(.cm-editor) {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.markdown-editor-root :deep(.cm-scroller) {
  overflow: auto;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.markdown-editor-root :deep(.cm-scroller::-webkit-scrollbar) {
  display: none;
}
</style>
