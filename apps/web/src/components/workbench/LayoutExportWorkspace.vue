<template>
  <section class="layout-export-workspace" aria-label="排版导出工作台">
    <header class="layout-toolbar">
      <div class="chapter-picker">
        <LayoutTemplate :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getChapterLabel(chapter) }}
          </option>
        </select>
      </div>
      <div class="layout-actions">
        <button class="secondary-action" type="button" :disabled="loading || !canBuild" @click="$emit('buildLayout')">
          <Rows3 :size="15" />
          <span>生成排版</span>
        </button>
        <button class="primary-action" type="button" :disabled="loading || !canExport" @click="$emit('exportLayout')">
          <Download :size="15" />
          <span>导出 PNG 序列</span>
        </button>
      </div>
    </header>

    <section
      v-if="sourceAttention"
      class="layout-source-attention"
      data-testid="candidate-source-status"
      aria-label="候选来源状态"
    >
      <AlertTriangle :size="19" />
      <div>
        <strong>{{ sourceAttention.title }}</strong>
        <p>{{ sourceAttention.message }}</p>
        <small>旧排版和导出仍保留为历史；请回候选图确认当前定稿。实际换图与裁切将在成稿编辑阶段处理。</small>
      </div>
      <button type="button" :disabled="loading" @click="$emit('goCandidates')">查看候选定稿</button>
    </section>

    <div v-if="!isImagesDone" class="layout-empty">
      <Lock :size="22" />
      <h2>请先完成候选图锁定</h2>
      <p>排版只读取本章已锁定候选。请先在候选图工作台锁定每个镜头，并完成本章候选图。</p>
      <button class="empty-action" type="button" :disabled="loading" @click="$emit('goCandidates')">
        <Images :size="15" />
        <span>去候选图</span>
      </button>
    </div>

    <div v-else class="layout-content">
      <aside class="layout-summary">
        <div>
          <span>已锁定镜头</span>
          <strong>{{ lockedShots.length }}</strong>
        </div>
        <div>
          <span>排版页数</span>
          <strong>{{ pages.length }}</strong>
        </div>
        <div>
          <span>导出页数</span>
          <strong>{{ exportedCount }}</strong>
        </div>
        <div v-if="candidateSources">
          <span>候选来源</span>
          <strong class="source-state-text">{{ getLockSetLabel() }}</strong>
        </div>
        <p>MVP 按镜头顺序一镜一页导出 PNG，不依赖复杂拼版库。</p>
      </aside>

      <section class="page-grid" aria-label="排版预览">
        <article v-for="page in previewPages" :key="page.id" class="page-card">
          <div class="page-thumb">
            <img v-if="page.previewUrl" :src="page.previewUrl" :alt="`第 ${page.pageNumber} 页`" />
            <ImageIcon v-else :size="28" />
          </div>
          <div>
            <strong>第 {{ page.pageNumber }} 页</strong>
            <span>{{ page.caption }}</span>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Download, Image as ImageIcon, Images, LayoutTemplate, Lock, Rows3 } from "lucide-vue-next";
import type { CandidateLockErrorCode, ChapterListItem, WorkbenchSnapshot } from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  buildLayout: [];
  exportLayout: [];
  goCandidates: [];
}>();

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const isImagesDone = computed(() => {
  const status = currentChapter.value?.status;
  return status === "images_done" || status === "layout_done" || status === "exported";
});
const lockedShots = computed(() => props.snapshot.shots.filter((shot) => Boolean(shot.lockedCandidateId)));
const pages = computed(() => props.snapshot.chapterLayout?.pages ?? []);
const candidateSources = computed(() => props.snapshot.candidateSources ?? null);
const canBuild = computed(() => isImagesDone.value
  && lockedShots.value.length > 0
  && (candidateSources.value?.gates.buildLayoutWorkingCopy.allowed ?? true));
const canExport = computed(() => canBuild.value
  && (candidateSources.value?.gates.exportLayout.allowed ?? true));
const exportedCount = computed(() => pages.value.filter((page) => page.exportAssetId).length);
const sourceAttention = computed(() => {
  const sources = candidateSources.value;
  if (!sources) return null;
  const reasonCodes = [
    ...sources.gates.buildLayoutWorkingCopy.reasonCodes,
    ...sources.gates.exportLayout.reasonCodes,
  ];
  if (sources.gates.buildLayoutWorkingCopy.allowed && sources.gates.exportLayout.allowed) return null;
  const primary = reasonCodes[0];
  return {
    title: getSourceAttentionTitle(primary),
    message: getSourceReasonLabel(primary),
  };
});

const previewPages = computed(() => {
  if (pages.value.length > 0) {
    return pages.value.map((page) => {
      const placement = page.placements[0];
      const assetId = page.exportAssetId ?? placement?.assetId ?? null;
      const shot = props.snapshot.shots.find((item) => item.id === placement?.shotId);
      return {
        id: page.id,
        pageNumber: page.pageNumber,
        caption: shot?.coreAction || shot?.comic.panelDescription || "锁定画格",
        previewUrl: assetId ? api.projectAssetFileUrl(props.snapshot.project.id, assetId) : null,
      };
    });
  }

  return lockedShots.value.map((shot, index) => {
    const candidate = props.snapshot.candidates.find((item) => item.id === shot.lockedCandidateId);
    return {
      id: shot.id,
      pageNumber: index + 1,
      caption: shot.coreAction || shot.comic.panelDescription || "锁定画格",
      previewUrl: candidate ? api.projectAssetFileUrl(props.snapshot.project.id, candidate.assetId) : null,
    };
  });
});

function selectChapter(event: Event) {
  const chapterId = (event.target as HTMLSelectElement).value;
  if (chapterId) {
    emit("selectChapter", chapterId);
  }
}

function getChapterLabel(chapter: ChapterListItem): string {
  if (chapter.status === "exported") return "已导出";
  if (chapter.status === "layout_done") return "排版完成";
  if (chapter.status === "images_done") return "可排版";
  return "未就绪";
}

function getLockSetLabel(): string {
  const lockSet = candidateSources.value?.candidateLockSet;
  if (!lockSet) return "未读取";
  if (lockSet.state === "complete" && lockSet.sourceApplicability === "current") return "当前可用";
  if (lockSet.clearedShotIds.length > 0) return `已清空 ${lockSet.clearedShotIds.length} 个镜头`;
  if (lockSet.state === "incomplete") return `缺少 ${lockSet.missingShotIds.length} 个镜头`;
  return "需要重新确认";
}

function getSourceAttentionTitle(code?: CandidateLockErrorCode): string {
  if (code === "CANDIDATE_LOCK_SET_INCOMPLETE") return "候选定稿尚未完整";
  if (code === "CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT" || code === "LAYOUT_SOURCE_UNRESOLVED") return "排版来源无法解析";
  if (code === "LAYOUT_SOURCE_DIGEST_MISMATCH") return "排版来源校验不一致";
  return "候选定稿已变化，当前排版需要处理";
}

function getSourceReasonLabel(code?: CandidateLockErrorCode): string {
  const labels: Partial<Record<CandidateLockErrorCode, string>> = {
    CANDIDATE_LOCK_SET_INCOMPLETE: "本章仍有镜头没有当前定稿，暂时不能生成或导出正式排版。",
    CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT: "当前候选定稿来自旧版上游内容或存在断链，需要重新确认。",
    LAYOUT_SOURCE_STALE: "排版仍引用更换前的候选定稿，系统已停止继续导出。",
    LAYOUT_SOURCE_UNRESOLVED: "排版引用的候选定稿无法解析，系统已停止继续导出。",
    LAYOUT_SOURCE_DIGEST_MISMATCH: "排版记录与候选定稿校验值不一致，系统已停止继续导出。",
  };
  return code ? labels[code] ?? `当前来源门禁未通过（${code}）。` : "当前来源门禁未通过。";
}
</script>

<style scoped>
.layout-export-workspace {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  height: 100%;
  gap: 14px;
}

.layout-toolbar,
.layout-actions,
.chapter-picker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.layout-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
}

.layout-source-attention {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border: 1px solid rgba(251, 146, 60, 0.32);
  border-radius: 12px;
  background: rgba(251, 146, 60, 0.09);
  padding: 13px;
  color: #fed7aa;
}

.layout-source-attention strong,
.layout-source-attention p,
.layout-source-attention small {
  display: block;
}

.layout-source-attention p {
  margin: 4px 0;
  color: #fdba74;
  font-size: 13px;
}

.layout-source-attention small {
  color: #cbd5e1;
  line-height: 1.5;
}

.layout-source-attention button {
  border: 1px solid rgba(251, 146, 60, 0.35);
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.55);
  padding: 8px 10px;
  color: #fed7aa;
  font-weight: 800;
}

.source-state-text {
  font-size: 15px !important;
}

.chapter-picker select {
  min-width: 180px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.55);
  color: #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
}

.primary-action,
.secondary-action,
.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 9px 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-action {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: white;
}

.secondary-action,
.empty-action {
  background: rgba(30, 41, 59, 0.9);
  border-color: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.primary-action:disabled,
.secondary-action:disabled,
.empty-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.layout-empty {
  display: grid;
  place-content: center;
  gap: 10px;
  justify-items: center;
  color: #94a3b8;
  text-align: center;
  min-height: 320px;
}

.layout-content {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 14px;
  min-height: 0;
}

.layout-summary {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.layout-summary div {
  display: grid;
  gap: 4px;
}

.layout-summary span {
  color: #94a3b8;
  font-size: 12px;
}

.layout-summary strong {
  font-size: 22px;
}

.layout-summary p {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.5;
}

.page-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  align-content: start;
  overflow: auto;
  min-height: 0;
}

.page-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.page-thumb {
  aspect-ratio: 3 / 4;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.65);
  color: #64748b;
}

.page-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.page-card strong {
  display: block;
}

.page-card span {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 960px) {
  .layout-content {
    grid-template-columns: 1fr;
  }
}
</style>
