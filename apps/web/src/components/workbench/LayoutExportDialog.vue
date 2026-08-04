<template>
  <div v-if="open" class="export-dialog-backdrop" @click.self="emit('close')">
    <section
      class="export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="layout-export-dialog-title"
      data-testid="layout-export-dialog"
    >
      <header>
        <div>
          <strong id="layout-export-dialog-title">{{ dialogTitle }}</strong>
          <small>{{ dialogSubtitle }}</small>
        </div>
        <button v-if="!busy" type="button" aria-label="关闭导出提示" @click="emit('close')"><X :size="16" /></button>
      </header>

      <template v-if="stage === 'blocked'">
        <div class="export-dialog-state is-blocked">
          <AlertTriangle :size="28" />
          <p>这不是可以忽略的提醒。请先修正下面的问题，再重新导出。</p>
        </div>
        <ul class="export-issue-list">
          <li v-for="issue in issues" :key="issue.issueKey">
            <strong>{{ preflightIssueLabel(issue) }}</strong>
            <small>{{ exportIssueLocation(issue) }}</small>
            <p v-if="exportIssueBlockingText(issue)">{{ exportIssueBlockingText(issue) }}</p>
          </li>
        </ul>
        <footer>
          <button class="primary-action" type="button" @click="emit('close')">返回修改</button>
        </footer>
      </template>

      <template v-else-if="stage === 'review'">
        <p class="export-review-intro">下面是你主动修改、删除或添加的文字。请确认成稿就按当前内容导出。</p>
        <div class="export-review-list">
          <article v-for="issue in issues" :key="issue.issueKey">
            <header>
              <strong>{{ preflightIssueLabel(issue) }}</strong>
              <small>{{ exportIssueLocation(issue) }}</small>
            </header>
            <dl v-if="isTextDifferenceIssue(issue)">
              <div>
                <dt>原文</dt>
                <dd>{{ exportIssueText(issue.details.sourceText, '无正式原文') }}</dd>
              </div>
              <div>
                <dt>当前文字</dt>
                <dd>{{ exportIssueText(issue.details.currentText, '已删除') }}</dd>
              </div>
            </dl>
            <p v-else>{{ exportIssueDescription(issue) }}</p>
          </article>
        </div>
        <footer>
          <button type="button" @click="emit('close')">返回修改</button>
          <button class="primary-action" type="button" @click="emit('confirm')">按当前文字导出</button>
        </footer>
      </template>

      <template v-else-if="publication?.status === 'ready'">
        <div class="export-dialog-state is-ready">
          <Download :size="30" />
          <strong>导出完成</strong>
          <p>成品已经生成，可以直接下载。</p>
        </div>
        <nav class="export-artifacts" aria-label="导出产物">
          <a
            v-for="artifact in publication.artifacts"
            :key="artifact.assetId"
            :href="artifactUrl(publication.id, artifact.assetId)"
            target="_blank"
            rel="noopener"
          >{{ artifactLabel(artifact.role, artifact.order) }}</a>
        </nav>
        <footer>
          <button class="primary-action" type="button" @click="emit('close')">完成</button>
        </footer>
      </template>

      <template v-else-if="stage === 'failed' || publication?.status === 'failed' || publication?.status === 'cancelled'">
        <div class="export-dialog-state is-blocked">
          <AlertTriangle :size="28" />
          <strong>导出没有完成</strong>
          <p>{{ error || '导出任务失败，请稍后重试。' }}</p>
        </div>
        <footer>
          <button type="button" @click="emit('close')">返回修改</button>
          <button class="primary-action" type="button" @click="emit('retry')">重新导出</button>
        </footer>
      </template>

      <template v-else>
        <div class="export-dialog-state">
          <LoaderCircle class="spin" :size="30" />
          <strong>{{ publication ? publicationStateLabel(publication.status) : checkingLabel }}</strong>
          <p>{{ publication ? '正在生成正式成品，完成后会在这里提供下载。' : error || '正在核对文字、图片来源和导出条件。' }}</p>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Download, LoaderCircle, X } from "lucide-vue-next";
import type {
  LayoutCanvasV1,
  LayoutPreflightCodeV2,
  LayoutPublicationSummaryV1,
  LayoutPublicationSummaryV2,
  LayoutSourceCatalogItemV1,
} from "@airoaming/shared";
import type { LayoutExportDialogStage, LayoutExportPreflightIssue } from "./layout-export-dialog";

const props = defineProps<{
  open: boolean;
  stage: LayoutExportDialogStage;
  issues: LayoutExportPreflightIssue[];
  error: string | null;
  busy: boolean;
  publication: LayoutPublicationSummaryV1 | LayoutPublicationSummaryV2 | null;
  publicationRequestPending: boolean;
  catalogItems: LayoutSourceCatalogItemV1[];
  canvases: LayoutCanvasV1[];
  artifactUrl: (publicationId: string, assetId: string) => string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
  retry: [];
}>();

const dialogTitle = computed(() => {
  if (props.stage === "blocked") return "暂时不能导出";
  if (props.stage === "review") return "请确认文字变化";
  if (props.stage === "failed") return "导出失败";
  if (props.publication?.status === "ready") return "导出完成";
  return "正在导出";
});

const dialogSubtitle = computed(() => {
  if (props.stage === "blocked") return "系统发现会影响成稿准确性的问题";
  if (props.stage === "review") return "只确认你主动改变的内容";
  if (props.publication?.status === "ready") return "正式版本与导出产物均已保存";
  return "系统会自动完成保存、检查和成品生成";
});

const checkingLabel = computed(() => props.publicationRequestPending ? "正在确认导出状态" : "正在检查成稿");

function isTextDifferenceIssue(issue: LayoutExportPreflightIssue): boolean {
  return issue.code === "DIALOGUE_USER_MODIFIED"
    || issue.code === "DIALOGUE_USER_SUPPRESSED"
    || issue.code === "CUSTOM_TEXT_PRESENT";
}

function exportIssueText(value: string | number | boolean | null | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function exportIssueLocation(issue: LayoutExportPreflightIssue): string {
  const speaker = typeof issue.details.speakerName === "string" && issue.details.speakerName
    ? issue.details.speakerName
    : null;
  const source = issue.shotId
    ? props.catalogItems.find((item) => item.source.shotId === issue.shotId)
    : null;
  const explicitShotOrder = typeof issue.details.shotOrder === "number"
    ? issue.details.shotOrder
    : null;
  const canvas = issue.canvasId
    ? props.canvases.find((item) => item.id === issue.canvasId)
    : null;
  return [
    speaker,
    explicitShotOrder !== null
      ? `镜头 ${explicitShotOrder}`
      : source
        ? `镜头 ${source.order}`
        : issue.shotId
          ? "来源镜头"
          : null,
    canvas?.name ?? null,
  ].filter(Boolean).join(" · ") || "本章";
}

function exportIssueBlockingText(issue: LayoutExportPreflightIssue): string {
  const sourceText = typeof issue.details.sourceText === "string" ? issue.details.sourceText : "";
  const currentText = typeof issue.details.currentText === "string" ? issue.details.currentText : "";
  if (issue.details.reason === "bound_balloon_outside_canvas") {
    return `${sourceText ? `应有文字：${sourceText}。` : ""}请把对白气泡移回画布内。`;
  }
  if (issue.details.reason === "bound_balloon_not_visible") {
    return `${sourceText ? `应有文字：${sourceText}。` : ""}请恢复显示，并把对象透明度调到可见范围。`;
  }
  if (sourceText && currentText && sourceText !== currentText) {
    return `原文：${sourceText}；当前：${currentText}`;
  }
  if (sourceText) return `应有文字：${sourceText}`;
  if (currentText) return `当前文字：${currentText}`;
  return "";
}

function exportIssueDescription(issue: LayoutExportPreflightIssue): string {
  if (issue.code === "LAYOUT_COMPOSITION_SOURCE_OVERRIDE") return "你主动更换了镜头图片，将按当前图片导出。";
  if (issue.code === "TEXT_OVERFLOW") return "有文字可能超出容器，请确认当前版面可以接受。";
  return "这项变化需要你确认后才能继续导出。";
}

function publicationStateLabel(status: string): string {
  return ({ queued: "排队中", rendering: "渲染中", ready: "已完成", failed: "失败", cancelled: "已取消" } as Record<string, string>)[status] ?? status;
}

function artifactLabel(role: string, order: number): string {
  const label = ({ page_png: "页面 PNG", document_pdf: "PDF", strip_slice_png: "条漫切片", long_png: "长图", publication_manifest: "清单" } as Record<string, string>)[role] ?? role;
  return role === "page_png" || role === "strip_slice_png" ? `${label} ${order}` : label;
}

function preflightIssueLabel(issue: LayoutExportPreflightIssue): string {
  if (issue.code === "DIALOGUE_BINDING_DANGLING") {
    if (issue.details.reason === "bound_balloon_outside_canvas") return "对白气泡完全在画布外";
    if (issue.details.reason === "bound_balloon_not_visible") return "对白气泡已隐藏或完全透明";
  }
  const code = issue.code as LayoutPreflightCodeV2;
  const labels: Record<string, string> = {
    ACTIVE_SHOT_UNPLACED: "当前镜头尚未放入画布",
    ACTIVE_SHOT_NOT_VISIBLE: "当前镜头不可见",
    SOURCE_LOCK_SET_INCOMPLETE: "来源集合不完整",
    SOURCE_STALE: "图片仍引用旧定稿",
    SOURCE_UNRESOLVED: "图片来源不可解析",
    SOURCE_DIGEST_MISMATCH: "图片来源摘要不一致",
    IMAGE_ASSET_MISSING_OR_NOT_READY: "图片素材未就绪",
    IMAGE_SHA_MISMATCH: "图片素材摘要不一致",
    IMAGE_ORIENTATION_UNNORMALIZED: "图片 EXIF 方向尚未规范",
    IMAGE_COLORSPACE_UNSUPPORTED: "图片色彩空间不是 sRGB",
    IMAGE_ANIMATION_UNSUPPORTED: "动画图片不能用于正式成稿",
    FONT_ASSET_MISSING_OR_NOT_READY: "字体素材未就绪",
    FONT_EMBEDDING_FORBIDDEN: "字体不允许嵌入",
    FONT_GLYPH_MISSING: "字体缺少字符",
    VISIBLE_TEXT_EMPTY: "可见文字内容为空",
    TEXT_OVERFLOW: "文字发生溢出",
    IMAGE_EFFECTIVE_RESOLUTION_CRITICAL: "图片有效分辨率不足",
    IMAGE_EFFECTIVE_RESOLUTION_LOW: "图片有效分辨率偏低",
    ELEMENT_FULLY_OUTSIDE_CANVAS: "对象完全位于画布外",
    ELEMENT_PARTLY_OUTSIDE_SAFE_AREA: "对象超出安全区",
    CANVAS_EMPTY: "存在空画布",
    HIDDEN_ELEMENT_PRESENT: "存在隐藏对象",
    WORKING_COPY_AHEAD_OF_REVISION: "草稿领先于该版本",
    REVISION_DOCUMENT_DIGEST_MISMATCH: "完整成稿摘要与版本证据不一致",
    VISIBLE_DOCUMENT_DIGEST_MISMATCH: "可见成稿摘要与投影证据不一致",
    VISIBLE_PROJECTION_UNSTABLE: "可见投影结果不稳定",
    DIALOGUE_LEDGER_INVALID: "对白台账不完整",
    DIALOGUE_LEDGER_WARNING: "对白台账需要人工确认",
    DIALOGUE_BINDING_MISSING: "对白缺少成稿绑定",
    DIALOGUE_BINDING_UNEXPECTED: "成稿包含意外对白绑定",
    DIALOGUE_BINDING_DUPLICATE: "对白被重复绑定",
    DIALOGUE_BINDING_DANGLING: "对白绑定指向不存在对象",
    DIALOGUE_BINDING_SOURCE_MISMATCH: "对白绑定的镜头来源不一致",
    DIALOGUE_BALLOON_KIND_MISMATCH: "对白与气泡类型不一致",
    DIALOGUE_BALLOON_SPEAKER_MISMATCH: "对白说话人与气泡引用不一致",
    DIALOGUE_TEXT_UNPROTECTED: "手工对白修改尚未建立文字保护",
    DIALOGUE_USER_MODIFIED: "对白文字已由用户修改",
    DIALOGUE_USER_SUPPRESSED: "对白已由用户明确省略",
    CUSTOM_TEXT_PRESENT: "你添加了自定义文字",
    UNOWNED_TEXT_PRESENT: "发现无来源文字",
    LAYOUT_COMPOSITION_MISSING: "缺少首次排版记录",
    LAYOUT_COMPOSITION_STALE: "首次排版记录已失效",
    LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH: "首次排版记录与当前镜头不一致",
    LAYOUT_COMPOSITION_SOURCE_OVERRIDE: "首次排版沿用了人工确认的镜头更换",
    LAYOUT_PROTECTION_INVALID: "人工保护指向无效对象或范围",
  };
  return labels[code] ?? code;
}
</script>

<style scoped>
.export-dialog-backdrop {
  position: absolute;
  z-index: 80;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(3, 7, 18, 0.76);
  backdrop-filter: blur(4px);
  padding: 20px;
}

.export-dialog {
  display: grid;
  gap: 18px;
  width: min(620px, 100%);
  max-height: min(720px, calc(100% - 24px));
  overflow: auto;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 18px;
  background: #111a2b;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
  padding: 22px;
  color: #e8edf8;
}

.export-dialog button {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(22, 32, 51, 0.9);
  color: #d9e2f3;
  min-height: 32px;
  padding: 0 10px;
  cursor: pointer;
  font: inherit;
}

.export-dialog > header,
.export-dialog > footer,
.export-review-list article > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.export-dialog > header > div {
  display: grid;
  gap: 4px;
}

.export-dialog > header strong { font-size: 18px; }
.export-dialog > header small,
.export-review-list article small { color: #8f9db8; }
.export-dialog > header button {
  width: 32px;
  min-height: 32px;
  padding: 0;
}

.export-dialog > footer {
  justify-content: flex-end;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  padding-top: 16px;
}

.export-dialog-state {
  display: grid;
  justify-items: center;
  gap: 9px;
  text-align: center;
  color: #b9c5da;
  padding: 30px 12px;
}

.export-dialog-state strong { color: #eef4ff; font-size: 16px; }
.export-dialog-state p,
.export-review-intro,
.export-review-list article > p {
  margin: 0;
  color: #95a4bd;
  line-height: 1.6;
}
.export-dialog-state.is-blocked { color: #fb7185; }
.export-dialog-state.is-ready { color: #34d399; }

.export-issue-list,
.export-review-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.export-issue-list li,
.export-review-list article {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  padding: 12px;
}

.export-issue-list li { border-color: rgba(251, 113, 133, 0.25); }
.export-issue-list small { color: #9ca9c0; }
.export-issue-list p {
  margin: 0;
  border-radius: 8px;
  background: rgba(251, 113, 133, 0.08);
  color: #edf3ff;
  padding: 8px 10px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.export-review-list dl { display: grid; gap: 8px; margin: 0; }
.export-review-list dl > div {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 10px;
}
.export-review-list dt { color: #7887a3; font-size: 12px; font-weight: 800; }
.export-review-list dd {
  margin: 0;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.08);
  color: #edf3ff;
  padding: 8px 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.export-artifacts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.export-artifacts a {
  border: 1px solid rgba(139, 92, 246, 0.36);
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.12);
  color: #ddd3ff;
  padding: 10px 12px;
  text-align: center;
  text-decoration: none;
  font-weight: 800;
}
.export-artifacts a:hover { background: rgba(139, 92, 246, 0.2); }

.primary-action { background: linear-gradient(135deg, #22c7a9, #745fff); border-color: transparent; color: white; font-weight: 900; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1023px) {
  .export-dialog-backdrop { position: fixed; padding: 12px; }
  .export-artifacts { grid-template-columns: 1fr; }
}
</style>
