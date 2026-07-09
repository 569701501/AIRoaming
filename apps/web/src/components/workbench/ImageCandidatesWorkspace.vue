<template>
  <section class="image-candidates-workspace" aria-label="候选图工作台">
    <header class="candidates-toolbar">
      <div class="chapter-picker">
        <Images :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getChapterCandidatesLabel(chapter) }}
          </option>
        </select>
        <span v-if="snapshot.project.storyTitle" class="story-title">{{ snapshot.project.storyTitle }}</span>
      </div>

      <div class="candidate-actions">
        <button class="secondary-action" type="button" :disabled="loading" @click="$emit('goPreflight')">
          <ListChecks :size="15" />
          <span>出图准备</span>
        </button>
        <button class="primary-action" type="button" :disabled="!canGenerateSelected || loading" @click="generateSelectedShot">
          <Wand2 :size="15" />
          <span>生成候选</span>
        </button>
        <button class="primary-action" type="button" :disabled="!canCompleteChapter || loading" @click="$emit('completeImages')">
          <CheckCircle2 :size="15" />
          <span>完成本章候选图</span>
        </button>
      </div>
    </header>

    <div v-if="!hasFormalStoryboard" class="candidate-empty">
      <Lock :size="22" />
      <h2>请先确认本章分镜</h2>
      <p>候选图只读取正式 storyboard.json。</p>
    </div>

    <div v-else-if="!isPreflightConfirmed" class="candidate-empty">
      <ShieldAlert :size="22" />
      <h2>请先通过出图准备</h2>
      <p>当前章节还没有可用于候选图生成的 preflight.json 确认记录。</p>
      <button class="empty-action" type="button" :disabled="loading" @click="$emit('goPreflight')">
        <ListChecks :size="15" />
        <span>去出图准备</span>
      </button>
    </div>

    <div v-else class="candidates-content">
      <aside class="shot-rail" aria-label="镜头列表">
        <div class="shot-rail-summary">
          <span>本章镜头</span>
          <strong>{{ shots.length }} 镜</strong>
        </div>

        <button
          v-for="shot in shots"
          :key="shot.id"
          class="shot-row"
          :class="{ 'is-active': shot.id === selectedShotId }"
          type="button"
          @click="selectedShotId = shot.id"
        >
          <span class="shot-index">{{ shot.order }}</span>
          <span class="shot-row-main">
            <strong>{{ shot.coreAction || shot.comic.panelDescription || "未填写镜头动作" }}</strong>
            <small>{{ shot.sceneName || "未绑定场景" }} · {{ getShotTaskSummary(shot.id) }}</small>
          </span>
          <CheckCircle2 v-if="shot.lockedCandidateId" :size="15" class="locked-icon" />
        </button>
      </aside>

      <section v-if="selectedShot" class="candidate-detail" aria-label="当前镜头候选">
        <div class="candidate-hero">
          <div>
            <span>镜头 {{ selectedShot.order }}</span>
            <h2>{{ selectedShot.coreAction || selectedShot.comic.panelDescription || "未填写镜头动作" }}</h2>
          </div>
          <div class="candidate-count-control" aria-label="候选数量">
            <button type="button" aria-label="减少候选数量" :disabled="candidateCount <= 1 || loading" @click="candidateCount -= 1">
              <Minus :size="15" />
            </button>
            <strong>{{ candidateCount }}</strong>
            <button type="button" aria-label="增加候选数量" :disabled="candidateCount >= 6 || loading" @click="candidateCount += 1">
              <Plus :size="15" />
            </button>
          </div>
        </div>

        <div class="shot-context-grid">
          <article>
            <span>画面描述</span>
            <p>{{ selectedShot.comic.panelDescription || selectedShot.promptDraft || "暂无画面描述" }}</p>
          </article>
          <article>
            <span>构图</span>
            <p>{{ selectedShot.comic.composition || selectedShot.motion.compositionDesign || "暂无构图说明" }}</p>
          </article>
          <article>
            <span>角色</span>
            <p>{{ selectedShot.characters.length > 0 ? selectedShot.characters.join("、") : "无明确角色" }}</p>
          </article>
          <article>
            <span>风格</span>
            <p>{{ getComicFormatLabel(snapshot.project.comicFormat) }} / {{ getArtStyleLabel(snapshot.project.artStyle) }}</p>
          </article>
        </div>

        <section class="task-panel">
          <div class="panel-heading">
            <div>
              <span>生成任务</span>
              <strong>{{ selectedShotTasks.length }} 个记录</strong>
            </div>
            <button class="primary-action compact" type="button" :disabled="!canGenerateSelected || loading" @click="generateSelectedShot">
              <Wand2 :size="14" />
              <span>{{ selectedShotTasks.length > 0 ? "再生成一组" : "生成候选图" }}</span>
            </button>
          </div>

          <div v-if="selectedShotTasks.length === 0" class="task-empty">
            <ImageIcon :size="18" />
            <span>这个镜头还没有候选图生成任务。</span>
          </div>

          <article v-for="task in selectedShotTasks" :key="task.id" class="task-card" :class="`is-${task.status}`">
            <div class="task-card-head">
              <component :is="getTaskIcon(task.status)" :size="16" />
              <strong>{{ getTaskStatusLabel(task.status) }}</strong>
              <span>{{ formatTaskTime(task.createdAt) }}</span>
            </div>
            <div class="task-progress">
              <span :style="{ width: `${task.progressPercent ?? 0}%` }"></span>
            </div>
            <p v-if="task.error">{{ task.error.message }}</p>
            <p v-else>{{ getTaskDigest(task) }}</p>
          </article>
        </section>

        <section class="candidate-grid-panel">
          <div class="panel-heading">
            <div>
              <span>候选结果</span>
              <strong>{{ selectedCandidates.length }} 张</strong>
            </div>
            <span class="lock-progress">已锁定 {{ lockedShotCount }}/{{ shots.length }}</span>
          </div>

          <div v-if="selectedCandidates.length === 0" class="candidate-grid-empty">
            <ImageIcon :size="22" />
            <h3>还没有候选图</h3>
            <p>点击「生成候选图」创建真实 image_generate 任务；成功后会落盘并出现在这里。</p>
          </div>

          <article
            v-for="candidate in selectedCandidates"
            :key="candidate.id"
            class="candidate-card"
            :class="{ 'is-locked': candidate.status === 'locked' }"
          >
            <div class="candidate-thumb">
              <img
                v-if="getCandidatePreviewUrl(candidate.assetId)"
                :src="getCandidatePreviewUrl(candidate.assetId)!"
                :alt="candidate.label"
              />
              <ImageIcon v-else :size="24" />
            </div>
            <div class="candidate-meta">
              <strong>{{ candidate.label }}</strong>
              <span>{{ getCandidateStatusLabel(candidate.status) }}</span>
              <button
                class="lock-action"
                type="button"
                :disabled="loading || candidate.status === 'locked'"
                @click="$emit('lockCandidate', candidate.id)"
              >
                <Lock :size="13" />
                <span>{{ candidate.status === "locked" ? "已锁定" : "锁定此图" }}</span>
              </button>
            </div>
          </article>
        </section>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Images,
  ListChecks,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldAlert,
  Wand2,
} from "lucide-vue-next";
import type {
  ArtStyle,
  CandidateStatus,
  ChapterListItem,
  ComicFormat,
  GenerationTaskItem,
  GenerationTaskStatus,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateCandidates: [payload: { shotId: string; candidateCount: number }];
  lockCandidate: [candidateId: string];
  completeImages: [];
  goPreflight: [];
}>();

const selectedShotId = ref<string | null>(null);
const candidateCount = ref(4);

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const hasFormalStoryboard = computed(() => Boolean(props.snapshot.storyboard && props.snapshot.storyboard.chapterId === currentChapterId.value));
const shots = computed(() => hasFormalStoryboard.value ? props.snapshot.shots : []);
const selectedShot = computed(() => shots.value.find((shot) => shot.id === selectedShotId.value) ?? shots.value[0] ?? null);
const isPreflightConfirmed = computed(() => {
  const preflight = props.snapshot.imagePreflight;
  const storyboard = props.snapshot.storyboard;
  return Boolean(
    preflight
    && storyboard
    && preflight.chapterId === currentChapterId.value
    && preflight.preflightJson.ready
    && preflight.sourceStoryboardId === storyboard.id
    && preflight.sourceStoryboardUpdatedAt === storyboard.updatedAt,
  );
});
const canGenerateSelected = computed(() => Boolean(
  selectedShot.value
  && isPreflightConfirmed.value
  && currentChapter.value?.status !== "images_done"
  && currentChapter.value?.status !== "layout_done"
  && currentChapter.value?.status !== "exported",
));
const lockedShotCount = computed(() => shots.value.filter((shot) => Boolean(shot.lockedCandidateId)).length);
const canCompleteChapter = computed(() =>
  isPreflightConfirmed.value
  && shots.value.length > 0
  && lockedShotCount.value === shots.value.length
  && currentChapter.value?.status === "storyboard_done",
);
const chapterImageTasks = computed(() => props.tasks.filter((task) =>
  task.projectId === props.snapshot.project.id
  && task.type === "image_generate"
  && getTaskChapterId(task) === currentChapterId.value,
));
const selectedShotTasks = computed(() => {
  const shotId = selectedShot.value?.id;
  if (!shotId) {
    return [];
  }
  return chapterImageTasks.value.filter((task) => getTaskShotId(task) === shotId);
});
const selectedCandidates = computed(() => {
  const shotId = selectedShot.value?.id;
  if (!shotId) {
    return [];
  }
  return props.snapshot.candidates
    .filter((candidate) => candidate.shotId === shotId)
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
});

watch(
  shots,
  (nextShots) => {
    if (!selectedShotId.value || !nextShots.some((shot) => shot.id === selectedShotId.value)) {
      selectedShotId.value = nextShots[0]?.id ?? null;
    }
  },
  { immediate: true },
);

function selectChapter(event: Event) {
  const chapterId = (event.target as HTMLSelectElement).value;
  if (chapterId) {
    emit("selectChapter", chapterId);
  }
}

function generateSelectedShot() {
  if (!selectedShot.value || !canGenerateSelected.value) {
    return;
  }
  emit("generateCandidates", {
    shotId: selectedShot.value.id,
    candidateCount: candidateCount.value,
  });
}

function getChapterCandidatesLabel(chapter: ChapterListItem): string {
  if (chapter.status === "images_done" || chapter.status === "layout_done" || chapter.status === "exported") {
    return "已有候选";
  }
  if (chapter.status === "storyboard_done") {
    return "可生成";
  }
  return "未就绪";
}

function getShotTaskSummary(shotId: string): string {
  const shot = shots.value.find((item) => item.id === shotId);
  if (shot?.lockedCandidateId) {
    return "已锁定";
  }
  const candidateCount = props.snapshot.candidates.filter((item) => item.shotId === shotId).length;
  if (candidateCount > 0) {
    return `${candidateCount} 张候选`;
  }
  const tasks = chapterImageTasks.value.filter((task) => getTaskShotId(task) === shotId);
  if (tasks.length === 0) {
    return "未生成";
  }
  const running = tasks.filter((task) => task.status === "queued" || task.status === "running" || task.status === "retrying").length;
  if (running > 0) {
    return `${running} 个生成中`;
  }
  const succeeded = tasks.filter((task) => task.status === "succeeded").length;
  if (succeeded > 0) {
    return `${succeeded} 组已完成`;
  }
  return `${tasks.length} 个任务`;
}

function getCandidatePreviewUrl(assetId: string): string | null {
  if (!assetId) {
    return null;
  }
  return api.projectAssetFileUrl(props.snapshot.project.id, assetId);
}

function getCandidateStatusLabel(status: CandidateStatus): string {
  switch (status) {
    case "locked":
      return "已锁定";
    case "selected":
      return "已选中";
    case "rejected":
      return "已废弃";
    case "superseded":
      return "已替代";
    default:
      return "已生成";
  }
}

function getTaskChapterId(task: GenerationTaskItem): string | null {
  const value = task.input.chapterId ?? task.target?.chapterId;
  return typeof value === "string" ? value : null;
}

function getTaskShotId(task: GenerationTaskItem): string | null {
  const value = task.input.shotId ?? (task.target?.type === "shot" ? task.target.id : null);
  return typeof value === "string" ? value : null;
}

function getTaskStatusLabel(status: GenerationTaskStatus): string {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "生成中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "retrying":
      return "等待重试";
  }
}

function getTaskIcon(status: GenerationTaskStatus) {
  if (status === "running" || status === "queued" || status === "retrying") {
    return Loader2;
  }
  if (status === "failed" || status === "cancelled") {
    return AlertCircle;
  }
  return CheckCircle2;
}

function getTaskDigest(task: GenerationTaskItem): string {
  const candidateCount = typeof task.input.candidateCount === "number" ? task.input.candidateCount : null;
  const preflightId = typeof task.input.imagePreflightId === "string" ? task.input.imagePreflightId : null;
  return `${candidateCount ?? 1} 张候选${preflightId ? ` · ${preflightId}` : ""}`;
}

function formatTaskTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function getComicFormatLabel(value: ComicFormat): string {
  switch (value) {
    case "vertical_scroll":
      return "竖滑条漫";
    case "page_horizontal":
      return "横版页漫";
    case "four_panel":
      return "四格漫画";
  }
}

function getArtStyleLabel(value: ArtStyle): string {
  switch (value) {
    case "dark_realistic":
      return "暗黑写实漫画";
    case "semi_realistic":
      return "半写实漫画";
    case "japanese_realistic":
      return "日系写实漫画";
    case "comic_style":
      return "漫画风";
    case "cyberpunk":
      return "赛博朋克";
    case "custom":
      return "自定义画风";
  }
}
</script>

<style scoped>
.image-candidates-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: #f7f4ed;
  color: #1f2937;
}

.candidates-toolbar {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(31, 41, 55, 0.1);
  padding: 0 22px;
  background: rgba(255, 255, 255, 0.74);
}

.chapter-picker,
.candidate-actions,
.panel-heading,
.task-card-head {
  display: flex;
  align-items: center;
}

.chapter-picker {
  min-width: 0;
  gap: 10px;
  color: #475569;
}

.chapter-picker select {
  min-width: 180px;
  max-width: 280px;
  height: 38px;
  border: 1px solid rgba(31, 41, 55, 0.14);
  border-radius: 8px;
  background: #fff;
  color: #111827;
  padding: 0 34px 0 12px;
  font-size: 13px;
  font-weight: 800;
}

.story-title {
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-actions {
  gap: 10px;
}

.primary-action,
.secondary-action,
.empty-action {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
}

.primary-action {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}

.primary-action.compact {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
}

.secondary-action,
.empty-action {
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.candidate-empty {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: #64748b;
}

.candidate-empty h2 {
  margin: 0;
  color: #111827;
  font-size: 20px;
}

.candidate-empty p {
  max-width: 460px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}

.candidates-content {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
}

.shot-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  border-right: 1px solid rgba(31, 41, 55, 0.1);
  padding: 16px;
  background: rgba(255, 255, 255, 0.46);
}

.shot-rail-summary {
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding: 2px 4px 8px;
}

.shot-rail-summary span,
.panel-heading span,
.shot-context-grid span {
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
}

.shot-rail-summary strong,
.panel-heading strong {
  color: #111827;
  font-size: 14px;
}

.shot-row {
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: 34px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(31, 41, 55, 0.1);
  border-radius: 8px;
  background: #fff;
  padding: 10px;
  color: #111827;
  text-align: left;
}

.shot-row.is-active {
  border-color: rgba(37, 99, 235, 0.46);
  box-shadow: 0 8px 22px rgba(37, 99, 235, 0.12);
}

.shot-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: #e0f2fe;
  color: #075985;
  font-size: 13px;
  font-weight: 950;
}

.shot-row-main {
  min-width: 0;
}

.shot-row-main strong {
  display: block;
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-row-main small {
  display: block;
  overflow: hidden;
  margin-top: 5px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locked-icon {
  color: #16a34a;
}

.candidate-detail {
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.candidate-hero,
.task-panel,
.candidate-grid-panel,
.shot-context-grid article {
  border: 1px solid rgba(31, 41, 55, 0.1);
  border-radius: 8px;
  background: #fff;
}

.candidate-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.candidate-hero span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 950;
}

.candidate-hero h2 {
  margin: 5px 0 0;
  color: #111827;
  font-size: 20px;
  line-height: 1.35;
}

.candidate-count-control {
  display: grid;
  grid-template-columns: 34px 42px 34px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(31, 41, 55, 0.12);
  border-radius: 8px;
  background: #f8fafc;
}

.candidate-count-control button {
  display: grid;
  height: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #1d4ed8;
}

.candidate-count-control strong {
  text-align: center;
}

.shot-context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.shot-context-grid article {
  padding: 14px;
}

.shot-context-grid p {
  margin: 6px 0 0;
  color: #1f2937;
  font-size: 13px;
  line-height: 1.6;
}

.task-panel,
.candidate-grid-panel {
  margin-top: 14px;
  padding: 16px;
}

.panel-heading {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-heading div {
  display: grid;
  gap: 3px;
}

.task-empty,
.candidate-grid-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 110px;
  border: 1px dashed rgba(31, 41, 55, 0.16);
  border-radius: 8px;
  color: #64748b;
  text-align: center;
}

.task-empty span {
  font-size: 13px;
  font-weight: 800;
}

.candidate-grid-empty h3 {
  margin: 0;
  color: #111827;
  font-size: 15px;
}

.candidate-grid-empty p {
  max-width: 460px;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.task-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(31, 41, 55, 0.1);
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
}

.task-card + .task-card {
  margin-top: 10px;
}

.task-card-head {
  gap: 8px;
  color: #334155;
}

.task-card-head strong {
  font-size: 13px;
}

.task-card-head span {
  margin-left: auto;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.task-card.is-running svg,
.task-card.is-queued svg,
.task-card.is-retrying svg {
  animation: spin 1s linear infinite;
}

.task-progress {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.22);
}

.task-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
}

.task-card p {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.candidate-grid-panel {
  display: grid;
  gap: 10px;
}

.candidate-grid-panel .panel-heading {
  display: flex;
  align-items: end;
}

.lock-progress {
  color: #0369a1 !important;
  font-size: 12px !important;
}

.candidate-card {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 12px;
  border: 1px solid rgba(31, 41, 55, 0.1);
  border-radius: 8px;
  padding: 10px;
}

.candidate-card.is-locked {
  border-color: rgba(5, 150, 105, 0.45);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.12);
}

.candidate-thumb {
  display: grid;
  aspect-ratio: 4 / 5;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: #e2e8f0;
  color: #64748b;
}

.candidate-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.candidate-meta {
  display: grid;
  align-content: start;
  gap: 6px;
}

.candidate-card strong,
.candidate-card span {
  display: block;
}

.candidate-card strong {
  color: #111827;
  font-size: 13px;
}

.candidate-card span {
  color: #64748b;
  font-size: 12px;
}

.lock-action {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .candidates-toolbar {
    align-items: stretch;
    flex-direction: column;
    padding: 14px;
  }

  .candidate-actions {
    justify-content: stretch;
  }

  .candidate-actions > button {
    flex: 1;
  }

  .candidates-content {
    grid-template-columns: 1fr;
  }

  .shot-rail {
    max-height: 260px;
    border-right: 0;
    border-bottom: 1px solid rgba(31, 41, 55, 0.1);
  }

  .shot-context-grid {
    grid-template-columns: 1fr;
  }
}
</style>
