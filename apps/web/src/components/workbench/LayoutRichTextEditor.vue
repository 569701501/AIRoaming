<template>
  <section class="rich-text-editor" data-testid="rich-text-controls">
    <div class="section-heading">
      <strong>富文本</strong>
      <small>受控字体 · Unicode grapheme 选区 · 样式一次应用</small>
    </div>

    <div class="writing-controls">
      <button type="button" :class="{ 'is-active': modelValue.writingMode === 'horizontal-tb' }" :disabled="disabled" @click="setWritingMode('horizontal-tb')">横排</button>
      <button type="button" :class="{ 'is-active': modelValue.writingMode === 'vertical-rl' }" :disabled="disabled" @click="setWritingMode('vertical-rl')">竖排</button>
      <select v-model="textOrientation" :disabled="disabled || modelValue.writingMode !== 'vertical-rl'" @change="setTextOrientation">
        <option value="mixed">中西文混排</option>
        <option value="upright">逐字直立</option>
      </select>
    </div>

    <div
      :key="editorDomRevision"
      ref="editor"
      class="content-editor"
      :class="{ 'is-vertical': modelValue.writingMode === 'vertical-rl' }"
      :contenteditable="disabled ? 'false' : 'true'"
      role="textbox"
      aria-label="画布富文本内容"
      aria-multiline="true"
      spellcheck="false"
      :style="{ writingMode: modelValue.writingMode, textOrientation: modelValue.textOrientation }"
      @compositionstart="compositionActive = true"
      @compositionend="handleCompositionEnd"
      @input="handleInput"
      @paste="handlePaste"
      @focus="handleFocus"
      @keyup="captureSelection"
      @mouseup="captureSelection"
    >
      <div
        v-for="(paragraph, paragraphIndex) in modelValue.paragraphs"
        :key="paragraphKey(paragraph, paragraphIndex)"
        class="editor-paragraph"
        :data-paragraph-index="paragraphIndex"
        :style="paragraphStyle(paragraph)"
      >
        <span
          v-for="(run, runIndex) in paragraph.runs"
          :key="runIndex"
          :data-run-index="runIndex"
          :style="runStyle(run)"
        >{{ run.text }}</span>
        <br v-if="paragraph.runs.every((run) => run.text === '')" />
      </div>
    </div>

    <p class="selection-summary">{{ selectionSummary }}</p>

    <div class="style-grid">
      <label>字体
        <select v-model="selectedFontAssetId" :disabled="disabled || !fontCatalog.length">
          <option v-for="font in fontCatalog" :key="font.assetId" :value="font.assetId">
            {{ font.metadata.displayName }}
          </option>
        </select>
      </label>
      <label>字号
        <input v-model.number="fontSize" type="number" min="6" max="512" :disabled="disabled" />
      </label>
      <label>字距
        <input v-model.number="letterSpacing" type="number" min="-64" max="256" step="0.5" :disabled="disabled" />
      </label>
      <label>颜色
        <input v-model="color" type="color" :disabled="disabled" />
      </label>
      <label>描边
        <input v-model.number="strokeWidth" type="number" min="0" max="32" step="0.5" :disabled="disabled" />
      </label>
      <label>描边色
        <input v-model="strokeColor" type="color" :disabled="disabled || strokeWidth <= 0" />
      </label>
    </div>

    <div class="style-actions">
      <button type="button" :class="{ 'is-active': bold }" :disabled="disabled || !canToggleBold" @mousedown.prevent @click="toggleBold">粗体</button>
      <button type="button" :class="{ 'is-active': italic }" :disabled="disabled || !canToggleItalic" @mousedown.prevent @click="toggleItalic">斜体</button>
      <button type="button" :disabled="disabled || selectionCollapsed" @mousedown.prevent @click="applySelectionStyle">应用到选区</button>
    </div>

    <div class="paragraph-controls">
      <label>行高
        <input v-model.number="lineHeight" type="number" min="0.5" max="4" step="0.05" :disabled="disabled" />
      </label>
      <button type="button" :disabled="disabled" @mousedown.prevent @click="applyParagraphStyle('start')">起始对齐</button>
      <button type="button" :disabled="disabled" @mousedown.prevent @click="applyParagraphStyle('center')">居中</button>
      <button type="button" :disabled="disabled" @mousedown.prevent @click="applyParagraphStyle('end')">末端对齐</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  countLayoutGraphemes,
  layoutFontFamilyNameV1,
  layoutGraphemes,
  normalizePlainLayoutText,
  richTextPlainTextV1,
  richTextPositionAtFlatGraphemeOffsetV1,
  type LayoutFontCatalogItemV1,
  type RichTextAlignV1,
  type RichTextDocumentV1,
  type RichTextPositionV1,
  type RichTextParagraphV1,
  type RichTextRangeV1,
  type RichTextRunStylePatchV1,
  type RichTextRunV1,
} from "@airoaming/shared";

const props = defineProps<{
  modelValue: RichTextDocumentV1;
  fontCatalog: LayoutFontCatalogItemV1[];
  fallbackFontAssetIds: string[];
  disabled: boolean;
}>();

const emit = defineEmits<{
  replaceRange: [value: RichTextRangeV1 & { text: string }];
  applyStyle: [value: RichTextRangeV1 & { style: RichTextRunStylePatchV1 }];
  replaceDocument: [value: RichTextDocumentV1];
  setParagraphStyle: [value: { paragraphIndexes: number[]; align: RichTextAlignV1; lineHeight: number }];
}>();

function firstRunFontAssetId(document: RichTextDocumentV1): string {
  return document.paragraphs[0]?.runs[0]?.fontAssetId ?? "";
}

const editor = ref<HTMLElement | null>(null);
const editorDomRevision = ref(0);
const compositionActive = ref(false);
let ignoreNextInput = false;
let pendingCaretRecovery: number | null = null;
const selection = ref<RichTextRangeV1>({
  start: { paragraphIndex: 0, graphemeOffset: 0 },
  end: { paragraphIndex: 0, graphemeOffset: 0 },
});
const selectedFontAssetId = ref(props.modelValue.paragraphs[0]?.runs[0]?.fontAssetId ?? props.fontCatalog[0]?.assetId ?? "");
const fontSize = ref(36);
const letterSpacing = ref(0);
const color = ref("#111827");
const strokeWidth = ref(0);
const strokeColor = ref("#FFFFFF");
const lineHeight = ref(1.2);
const textOrientation = ref(props.modelValue.textOrientation);
const selectedFont = computed(() => props.fontCatalog.find((font) => font.assetId === selectedFontAssetId.value) ?? null);
const bold = computed(() => (selectedFont.value?.metadata.face.weight ?? 400) >= 700);
const italic = computed(() => selectedFont.value?.metadata.face.style === "italic");

function matchingFace(weight: number, style: "normal" | "italic"): LayoutFontCatalogItemV1 | null {
  const current = selectedFont.value;
  if (!current) return null;
  return props.fontCatalog.find((font) => font.metadata.familyName === current.metadata.familyName
    && font.metadata.face.weight === weight
    && font.metadata.face.style === style) ?? null;
}

const canToggleBold = computed(() => Boolean(matchingFace(bold.value ? 400 : 700, selectedFont.value?.metadata.face.style ?? "normal")));
const canToggleItalic = computed(() => Boolean(matchingFace(
  selectedFont.value?.metadata.face.weight ?? 400,
  italic.value ? "normal" : "italic",
)));

const selectionCollapsed = computed(() => selection.value.start.paragraphIndex === selection.value.end.paragraphIndex
  && selection.value.start.graphemeOffset === selection.value.end.graphemeOffset);
const selectionSummary = computed(() => selectionCollapsed.value
  ? `光标：第 ${selection.value.start.paragraphIndex + 1} 段，第 ${selection.value.start.graphemeOffset} 个字素后`
  : `选区：第 ${selection.value.start.paragraphIndex + 1} 段 ${selection.value.start.graphemeOffset} → 第 ${selection.value.end.paragraphIndex + 1} 段 ${selection.value.end.graphemeOffset}`);

watch(() => props.fontCatalog, (catalog) => {
  if (!catalog.some((font) => font.assetId === selectedFontAssetId.value)) {
    const currentRunAssetId = firstRunFontAssetId(props.modelValue);
    selectedFontAssetId.value = catalog.some((font) => font.assetId === currentRunAssetId)
      ? currentRunAssetId
      : catalog[0]?.assetId ?? "";
  }
}, { immediate: true });

watch(() => firstRunFontAssetId(props.modelValue), (assetId, previousAssetId) => {
  if (assetId !== previousAssetId && props.fontCatalog.some((font) => font.assetId === assetId)) {
    selectedFontAssetId.value = assetId;
  }
});

watch(() => props.modelValue.textOrientation, (value) => { textOrientation.value = value; });
watch(() => props.modelValue, () => {
  if (pendingCaretRecovery === null) return;
  const caretFlatOffset = pendingCaretRecovery;
  pendingCaretRecovery = null;
  editorDomRevision.value += 1;
  void nextTick(() => restoreCaret(caretFlatOffset, true));
});

function runStyle(run: RichTextRunV1) {
  const chain = [run.fontAssetId, ...props.fallbackFontAssetIds.filter((assetId) => assetId !== run.fontAssetId)];
  const face = props.fontCatalog.find((font) => font.assetId === run.fontAssetId)?.metadata.face;
  return {
    fontFamily: chain.map((assetId) => `"${layoutFontFamilyNameV1(assetId)}"`).join(","),
    fontSize: `${Math.max(12, Math.min(36, run.fontSize / 2))}px`,
    fontWeight: face?.weight ?? run.fontWeight,
    fontStyle: face?.style ?? run.fontStyle,
    fontSynthesis: "none",
    color: run.color.slice(0, 7),
    letterSpacing: `${Math.max(-4, Math.min(8, run.letterSpacing / 2))}px`,
    WebkitTextStroke: run.stroke ? `${Math.min(2, run.stroke.width / 2)}px ${run.stroke.color.slice(0, 7)}` : undefined,
  };
}

function paragraphStyle(paragraph: RichTextParagraphV1) {
  const maximumFontSize = Math.max(
    ...paragraph.runs.map((run) => Math.max(12, Math.min(36, run.fontSize / 2))),
    1,
  );
  return {
    textAlign: paragraph.align,
    lineHeight: paragraph.lineHeight,
    fontSize: `${maximumFontSize}px`,
  };
}

function paragraphKey(paragraph: RichTextParagraphV1, paragraphIndex: number): string {
  return `${paragraphIndex}:${paragraph.align}:${paragraph.lineHeight}:${paragraph.runs.map((run) => `${run.text}\u0000${run.fontAssetId}\u0000${run.fontSize}\u0000${run.fontWeight}\u0000${run.fontStyle}\u0000${run.color}\u0000${run.letterSpacing}\u0000${run.stroke?.color ?? ""}\u0000${run.stroke?.width ?? 0}`).join("\u0001")}`;
}

function editorPlainText(): string {
  if (!editor.value) return richTextPlainTextV1(props.modelValue);
  const rootSegments = [...editor.value.childNodes].flatMap((node) => {
    if (node.nodeType === Node.COMMENT_NODE) return [];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      return text.trim() ? [text] : [];
    }
    if (!(node instanceof HTMLElement)) return [];
    return [node.innerText.replace(/\n$/u, "")];
  });
  return normalizePlainLayoutText(rootSegments.join("\n"));
}

function editorDomNeedsRehydration(): boolean {
  if (!editor.value) return false;
  const directChildren = [...editor.value.childNodes];
  const paragraphs = directChildren.filter(
    (node): node is HTMLElement => (
      node instanceof HTMLElement
      && node.classList.contains("editor-paragraph")
    ),
  );
  const hasUnexpectedRootNode = directChildren.some((node) => (
    node.nodeType === Node.ELEMENT_NODE
      ? !(node instanceof HTMLElement && node.classList.contains("editor-paragraph"))
      : node.nodeType === Node.TEXT_NODE
        ? Boolean(node.textContent?.trim())
        : node.nodeType !== Node.COMMENT_NODE
  ));
  return hasUnexpectedRootNode
    || paragraphs.length !== directChildren.filter((node) => node.nodeType === Node.ELEMENT_NODE).length
    || paragraphs.length !== props.modelValue.paragraphs.length
    || paragraphs.some((paragraph, index) => paragraph.dataset.paragraphIndex !== String(index));
}

function handleFocus(): void {
  captureSelection();
}

function diffAndEmit(): void {
  const beforeText = richTextPlainTextV1(props.modelValue);
  const afterText = editorPlainText();
  if (beforeText === afterText) return;
  const before = layoutGraphemes(beforeText);
  const after = layoutGraphemes(afterText);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  const start = richTextPositionAtFlatGraphemeOffsetV1(props.modelValue, prefix);
  const end = richTextPositionAtFlatGraphemeOffsetV1(props.modelValue, before.length - suffix);
  const inserted = after.slice(prefix, after.length - suffix).join("");
  const caretFlatOffset = prefix + layoutGraphemes(inserted).length;
  if (editorDomNeedsRehydration()) {
    pendingCaretRecovery = caretFlatOffset;
  }
  emit("replaceRange", {
    start,
    end,
    text: inserted,
  });
  if (pendingCaretRecovery === null) {
    void nextTick(() => restoreCaret(caretFlatOffset));
  }
}

function handleInput(event: InputEvent): void {
  if (compositionActive.value || event.isComposing) return;
  if (ignoreNextInput) return;
  diffAndEmit();
}

function handleCompositionEnd(): void {
  compositionActive.value = false;
  ignoreNextInput = true;
  diffAndEmit();
  queueMicrotask(() => { ignoreNextInput = false; });
}

function handlePaste(event: ClipboardEvent): void {
  if (props.disabled) return;
  event.preventDefault();
  const value = normalizePlainLayoutText(event.clipboardData?.getData("text/plain") ?? "");
  const domSelection = window.getSelection();
  if (!domSelection?.rangeCount) return;
  const range = domSelection.getRangeAt(0);
  if (!editor.value?.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(value);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  domSelection.removeAllRanges();
  domSelection.addRange(range);
  diffAndEmit();
}

function paragraphPosition(container: Node, offset: number): RichTextPositionV1 | null {
  if (!editor.value) return null;
  const element = container instanceof Element ? container : container.parentElement;
  const paragraph = element?.closest<HTMLElement>(".editor-paragraph");
  if (!paragraph || !editor.value.contains(paragraph)) return null;
  const paragraphIndex = Number(paragraph.dataset.paragraphIndex);
  if (!Number.isInteger(paragraphIndex)) return null;
  const range = document.createRange();
  range.setStart(paragraph, 0);
  try { range.setEnd(container, offset); } catch { return null; }
  return { paragraphIndex, graphemeOffset: countLayoutGraphemes(range.toString()) };
}

function captureSelection(): void {
  const domSelection = window.getSelection();
  if (!domSelection?.rangeCount || !editor.value) return;
  const range = domSelection.getRangeAt(0);
  if (!editor.value.contains(range.commonAncestorContainer)) return;
  const start = paragraphPosition(range.startContainer, range.startOffset);
  const end = paragraphPosition(range.endContainer, range.endOffset);
  if (!start || !end) return;
  selection.value = { start, end };
  const paragraph = props.modelValue.paragraphs[start.paragraphIndex];
  if (!paragraph) return;
  lineHeight.value = paragraph.lineHeight;
  let remaining = start.graphemeOffset;
  const run = paragraph.runs.find((candidate) => {
    const length = countLayoutGraphemes(candidate.text);
    if (remaining <= length) return true;
    remaining -= length;
    return false;
  }) ?? paragraph.runs[0];
  if (!run) return;
  selectedFontAssetId.value = run.fontAssetId;
  fontSize.value = run.fontSize;
  letterSpacing.value = run.letterSpacing;
  color.value = run.color.slice(0, 7);
  strokeWidth.value = run.stroke?.width ?? 0;
  strokeColor.value = run.stroke?.color.slice(0, 7) ?? "#FFFFFF";
}

function restoreCaret(flatOffset: number, focusEditor = false): void {
  if (!editor.value) return;
  let position: RichTextPositionV1;
  try { position = richTextPositionAtFlatGraphemeOffsetV1(props.modelValue, flatOffset); } catch { return; }
  const paragraph = editor.value.querySelector<HTMLElement>(`.editor-paragraph[data-paragraph-index="${position.paragraphIndex}"]`);
  if (!paragraph) return;
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let remaining = position.graphemeOffset;
  let target: Text | null = null;
  let codeUnitOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const graphemes = layoutGraphemes(node.data);
    if (remaining <= graphemes.length) {
      target = node;
      codeUnitOffset = graphemes.slice(0, remaining).join("").length;
      break;
    }
    remaining -= graphemes.length;
  }
  const range = document.createRange();
  if (target) range.setStart(target, codeUnitOffset);
  else range.setStart(paragraph, 0);
  range.collapse(true);
  if (focusEditor) editor.value.focus({ preventScroll: true });
  const domSelection = window.getSelection();
  domSelection?.removeAllRanges();
  domSelection?.addRange(range);
  captureSelection();
}

function toggleBold(): void {
  const face = matchingFace(bold.value ? 400 : 700, selectedFont.value?.metadata.face.style ?? "normal");
  if (face) selectedFontAssetId.value = face.assetId;
}

function toggleItalic(): void {
  const face = matchingFace(
    selectedFont.value?.metadata.face.weight ?? 400,
    italic.value ? "normal" : "italic",
  );
  if (face) selectedFontAssetId.value = face.assetId;
}

function applySelectionStyle(): void {
  const font = selectedFont.value;
  if (selectionCollapsed.value || !font) return;
  emit("applyStyle", {
    ...selection.value,
    style: {
      fontAssetId: font.assetId,
      fontSize: Math.max(6, Math.min(512, Number(fontSize.value) || 36)),
      fontWeight: font.metadata.face.weight,
      fontStyle: font.metadata.face.style,
      color: `${color.value.toUpperCase()}FF`,
      letterSpacing: Math.max(-64, Math.min(256, Number(letterSpacing.value) || 0)),
      stroke: strokeWidth.value > 0
        ? { color: `${strokeColor.value.toUpperCase()}FF`, width: Math.min(32, strokeWidth.value) }
        : null,
    },
  });
}

function applyParagraphStyle(align: RichTextAlignV1): void {
  const indexes = Array.from(
    { length: selection.value.end.paragraphIndex - selection.value.start.paragraphIndex + 1 },
    (_, index) => selection.value.start.paragraphIndex + index,
  );
  emit("setParagraphStyle", {
    paragraphIndexes: indexes,
    align,
    lineHeight: Math.max(0.5, Math.min(4, Number(lineHeight.value) || 1.2)),
  });
}

function setWritingMode(writingMode: RichTextDocumentV1["writingMode"]): void {
  emit("replaceDocument", {
    ...props.modelValue,
    writingMode,
    textOrientation: writingMode === "horizontal-tb" ? "mixed" : textOrientation.value,
  });
}

function setTextOrientation(): void {
  emit("replaceDocument", { ...props.modelValue, textOrientation: textOrientation.value });
}
</script>

<style scoped>
.rich-text-editor {
  display: grid;
  gap: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  padding-top: 14px;
  margin-top: 14px;
}

.section-heading { display: grid; gap: 3px; }
.section-heading small { color: #7f8ca8; font-size: 10px; line-height: 1.4; }
.writing-controls,
.style-actions,
.paragraph-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.writing-controls select { flex: 1; min-width: 110px; }
button.is-active { border-color: rgba(34, 199, 169, 0.5); background: rgba(34, 199, 169, 0.15); color: #8df0dc; }

.content-editor {
  box-sizing: border-box;
  min-height: 132px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 9px;
  background: #f8fafc;
  color: #111827;
  padding: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  outline: none;
}
.content-editor:focus { border-color: #22c7a9; box-shadow: 0 0 0 2px rgba(34, 199, 169, 0.16); }
.content-editor.is-vertical { min-height: 220px; }
.editor-paragraph { min-width: 1em; min-height: 1em; }
.selection-summary { margin: 0; color: #8ea0bd; font-size: 10px; }
.style-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.style-grid label,
.paragraph-controls label { display: grid; gap: 4px; color: #8491aa; font-size: 10px; }
.style-grid input,
.style-grid select,
.paragraph-controls input { width: 100%; box-sizing: border-box; }
.style-grid input[type="color"] { min-height: 34px; padding: 3px; }
.style-actions button:last-child { margin-left: auto; }
</style>
