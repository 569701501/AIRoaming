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
        <button
          class="secondary-action"
          type="button"
          :disabled="!isPreflightConfirmed || loading || unlockedShotCount === 0"
          :title="unlockedShotCount === 0 ? '本章镜头已全部锁定' : `为 ${unlockedShotCount} 个未锁定镜头各生成 1 张`"
          @click="$emit('generateAllUnlocked')"
        >
          <Layers :size="15" />
          <span>批量生成{{ unlockedShotCount > 0 ? `(${unlockedShotCount})` : "" }}</span>
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
          <div class="generate-group">
            <button
              class="generate-btn"
              type="button"
              :disabled="!canGenerateSelected || loading"
              @click="generateSelectedShot"
            >
              <Wand2 :size="16" />
              <span>生成候选图</span>
            </button>
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

        <!-- 出图 prompt 预览(P0 任务C):生成前可看到完整 prompt,不可编辑 -->
        <section v-if="selectedShot" class="prompt-preview-panel">
          <button class="prompt-toggle" type="button" @click="promptExpanded = !promptExpanded">
            <ChevronDown :size="14" :class="{ 'is-rotated': !promptExpanded }" />
            <span>出图 Prompt</span>
            <small>{{ promptExpanded ? "点击折叠" : "点击查看完整提示词" }}</small>
          </button>
          <div v-if="promptExpanded" class="prompt-preview-body">
            <div class="prompt-sections">
              <div v-for="section in promptSections" :key="section.label" class="prompt-section-item">
                <span>{{ section.label }}</span>
                <p>{{ section.value }}</p>
              </div>
            </div>
            <div class="prompt-full">
              <span>完整 prompt</span>
              <pre>{{ fullPromptText }}</pre>
            </div>
          </div>
        </section>

        <section class="task-panel">
          <div class="panel-heading">
            <div>
              <span>生成任务</span>
              <strong>{{ selectedShotTasks.length }} 个记录</strong>
            </div>
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
              <strong>{{ selectedCandidates.length }} 张 · {{ candidateBatches.length }} 批</strong>
            </div>
            <span class="lock-progress">已锁定 {{ lockedShotCount }}/{{ shots.length }}</span>
          </div>

          <div v-if="selectedCandidates.length === 0" class="candidate-grid-empty">
            <ImageIcon :size="22" />
            <h3>还没有候选图</h3>
            <p>点击「生成候选图」创建真实 image_generate 任务；成功后会落盘并出现在这里。不满意可「重新生成」，旧批保留为历史。</p>
          </div>

          <!-- 候选按批次(taskId)分组:最新批次展开,旧批次可折叠 -->
          <div v-for="batch in candidateBatches" :key="batch.taskId" class="candidate-batch" :class="{ 'is-collapsed': collapsedBatchIds.has(batch.taskId) }">
            <button class="batch-toggle" type="button" @click="toggleBatch(batch.taskId)">
              <ChevronDown :size="14" />
              <strong>{{ batch.label }}</strong>
              <span>{{ batch.candidates.length }} 张</span>
            </button>
            <div v-show="!collapsedBatchIds.has(batch.taskId)" class="candidate-grid">
              <article
                v-for="candidate in batch.candidates"
                :key="candidate.id"
                class="candidate-card"
                :class="[`is-${candidate.status}`, { 'is-locked': candidate.status === 'locked' }]"
              >
                <button
                  v-if="getCandidatePreviewUrl(candidate.assetId)"
                  class="candidate-thumb"
                  type="button"
                  @click="openCandidatePreview(candidate)"
                >
                  <img :src="getCandidatePreviewUrl(candidate.assetId)!" :alt="candidate.label" />
                  <span class="thumb-zoom-hint"><ZoomIn :size="16" /> 点击放大</span>
                </button>
                <div v-else class="candidate-thumb is-empty">
                  <ImageIcon :size="24" />
                </div>
                <div class="candidate-meta">
                  <div class="candidate-meta-top">
                    <strong>{{ candidate.label }}</strong>
                    <span class="candidate-status">{{ getCandidateStatusLabel(candidate.status) }}</span>
                  </div>
                  <span v-if="candidate.promptDigest" class="digest-tag" :title="`prompt 摘要 ${candidate.promptDigest}`">{{ candidate.promptDigest.slice(0, 6) }}</span>
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
            </div>
          </div>
        </section>
      </section>
    </div>
  </section>

  <!-- 候选图放大预览 -->
  <Teleport to="body">
    <div v-if="previewCandidate" class="candidate-preview-backdrop" @click.self="previewCandidate = null">
      <div class="candidate-preview-modal">
        <button class="preview-close" type="button" @click="previewCandidate = null"><X :size="20" /></button>
        <img :src="getCandidatePreviewUrl(previewCandidate.assetId)!" :alt="previewCandidate.label" />
        <div class="preview-info">
          <strong>{{ previewCandidate.label }}</strong>
          <span>{{ getCandidateStatusLabel(previewCandidate.status) }}</span>
          <button
            class="preview-lock-btn"
            type="button"
            :disabled="loading || previewCandidate.status === 'locked'"
            @click="$emit('lockCandidate', previewCandidate.id); previewCandidate = null"
          >
            <Lock :size="15" />
            <span>{{ previewCandidate.status === "locked" ? "已锁定" : "锁定此图" }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Images,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldAlert,
  Wand2,
  X,
  ZoomIn,
} from "lucide-vue-next";
import type {
  ArtStyle,
  CandidateStatus,
  ChapterListItem,
  ComicFormat,
  GenerationTaskItem,
  GenerationTaskStatus,
  WorkbenchCandidate,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { api } from "../../services/api";
import { buildCandidatePositivePrompt, buildPromptPreviewSections } from "../../utils/candidate-prompt";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateCandidates: [payload: { shotId: string; candidateCount: number }];
  generateAllUnlocked: [];
  lockCandidate: [candidateId: string];
  completeImages: [];
  goPreflight: [];
}>();

const selectedShotId = ref<string | null>(null);
const candidateCount = ref(4);
const promptExpanded = ref(false);
const previewCandidate = ref<WorkbenchCandidate | null>(null);

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const hasFormalStoryboard = computed(() => Boolean(props.snapshot.storyboard && props.snapshot.storyboard.chapterId === currentChapterId.value));
const shots = computed(() => hasFormalStoryboard.value ? props.snapshot.shots : []);
const selectedShot = computed(() => shots.value.find((shot) => shot.id === selectedShotId.value) ?? shots.value[0] ?? null);
const promptSections = computed(() => selectedShot.value ? buildPromptPreviewSections(selectedShot.value, props.snapshot) : []);
const fullPromptText = computed(() => selectedShot.value ? buildCandidatePositivePrompt(selectedShot.value, props.snapshot) : "");
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
const unlockedShotCount = computed(() => shots.value.filter((shot) => !shot.lockedCandidateId).length);
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
const selectedShotCandidates = computed(() => {
  const shotId = selectedShot.value?.id;
  if (!shotId) {
    return [];
  }
  return props.snapshot.candidates
    .filter((candidate) => candidate.shotId === shotId)
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
});

interface CandidateBatch {
  taskId: string;
  label: string;
  createdAt: string;
  candidates: typeof selectedShotCandidates.value;
}

/** 候选按生成任务(taskId)分批:一次"生成/重画"=一个任务=一批候选。
 *  最新批次排在前(数组索引0),旧批次在后。无 taskId 的候选归入"早期"批次。 */
const candidateBatches = computed<CandidateBatch[]>(() => {
  const candidates = selectedShotCandidates.value;
  if (candidates.length === 0) {
    return [];
  }
  const byTask = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = candidate.taskId ?? "__early__";
    const list = byTask.get(key);
    if (list) {
      list.push(candidate);
    } else {
      byTask.set(key, [candidate]);
    }
  }
  const taskMeta = new Map(selectedShotTasks.value.map((task) => [task.id, task]));
  const batches: CandidateBatch[] = [...byTask.entries()].map(([taskId, list]) => {
    const task = taskMeta.get(taskId);
    const createdAt = task?.createdAt ?? list[0]?.createdAt ?? "";
    return { taskId, label: taskId, createdAt, candidates: list };
  });
  // 按创建时间倒序:最新批次在前
  batches.sort((left, right) => Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0"));
  // 给批次打可读标签:最新=第1次,其余递增
  const total = batches.length;
  batches.forEach((batch, index) => {
    batch.label = `第 ${total - index} 次生成`;
  });
  return batches;
});
/** 平铺候选(兼容旧引用) */
const selectedCandidates = computed(() => candidateBatches.value.flatMap((batch) => batch.candidates));
/** 折叠的批次 taskId 集合(最新批次默认展开,旧批默认折叠) */
const collapsedBatchIds = ref<Set<string>>(new Set());
watch(candidateBatches, (batches) => {
  // 旧批次(非第0个)默认折叠;最新批次保持展开
  const next = new Set<string>();
  for (let i = 1; i < batches.length; i += 1) {
    next.add(batches[i].taskId);
  }
  collapsedBatchIds.value = next;
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

function toggleBatch(taskId: string) {
  const next = new Set(collapsedBatchIds.value);
  if (next.has(taskId)) {
    next.delete(taskId);
  } else {
    next.add(taskId);
  }
  collapsedBatchIds.value = next;
}

function openCandidatePreview(candidate: WorkbenchCandidate) {
  previewCandidate.value = candidate;
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
  background: transparent;
  color: #e8eefc;
}

.candidates-toolbar {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  padding: 0 22px;
  background: rgba(15, 23, 42, 0.64);
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
  color: #94a3b8;
}

.chapter-picker select {
  min-width: 180px;
  max-width: 280px;
  height: 38px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.92);
  color: #f8fbff;
  padding: 0 34px 0 12px;
  font-size: 13px;
  font-weight: 800;
}

.story-title {
  overflow: hidden;
  color: #8df0dc;
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
  border: 1px solid rgba(34, 199, 169, 0.4);
  background: linear-gradient(135deg, #22c7a9, #1fb89a);
  color: #06231d;
}

.primary-action.compact {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
}

.secondary-action,
.empty-action {
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.72);
  color: #dbe7ff;
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
  color: #8a98b8;
}

.candidate-empty h2 {
  margin: 0;
  color: #f8fbff;
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
  border-right: 1px solid rgba(148, 163, 184, 0.16);
  padding: 16px;
  background: rgba(15, 23, 42, 0.46);
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
  color: #8a98b8;
  font-size: 11px;
  font-weight: 900;
}

.shot-rail-summary strong,
.panel-heading strong {
  color: #f8fbff;
  font-size: 14px;
}

.shot-row {
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: 34px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  padding: 10px;
  color: #e8eefc;
  text-align: left;
}

.shot-row.is-active {
  border-color: rgba(34, 199, 169, 0.46);
  box-shadow: 0 8px 22px rgba(34, 199, 169, 0.12);
}

.shot-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.16);
  color: #a78bfa;
  font-size: 13px;
  font-weight: 950;
}

.shot-row-main {
  min-width: 0;
}

.shot-row-main strong {
  display: block;
  overflow: hidden;
  color: #f8fbff;
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-row-main small {
  display: block;
  overflow: hidden;
  margin-top: 5px;
  color: #8a98b8;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locked-icon {
  color: #34d399;
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
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
}

.candidate-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.candidate-hero span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 950;
}

.candidate-hero h2 {
  margin: 5px 0 0;
  color: #f8fbff;
  font-size: 20px;
  line-height: 1.35;
}

.generate-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  border: 1px solid rgba(124, 58, 237, 0.5);
  border-radius: 8px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #ffffff !important;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 900;
  box-shadow: 0 2px 10px rgba(124, 58, 237, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.generate-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
}

.generate-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  box-shadow: none;
}

.generate-btn span {
  color: #ffffff;
}

.candidate-count-control {
  display: grid;
  grid-template-columns: 34px 42px 34px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.48);
}

.candidate-count-control button {
  display: grid;
  height: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #8df0dc;
}

.candidate-count-control strong {
  text-align: center;
  color: #f8fbff;
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
  color: #cbd5e1;
  font-size: 13px;
  line-height: 1.6;
}

.task-panel,
.candidate-grid-panel {
  margin-top: 14px;
  padding: 16px;
}

.prompt-preview-panel {
  margin-top: 14px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  padding: 12px 16px;
}

.prompt-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #e8eefc;
  padding: 0;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.prompt-toggle svg {
  transition: transform 0.15s ease;
  color: #8a98b8;
}

.prompt-toggle svg.is-rotated {
  transform: rotate(-90deg);
}

.prompt-toggle small {
  margin-left: auto;
  color: #8a98b8;
  font-size: 11px;
  font-weight: 700;
}

.prompt-preview-body {
  display: grid;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.prompt-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.prompt-section-item {
  display: grid;
  gap: 3px;
}

.prompt-section-item span {
  color: #8a98b8;
  font-size: 11px;
  font-weight: 900;
}

.prompt-section-item p {
  margin: 0;
  color: #cbd5e1;
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
}

.prompt-full {
  display: grid;
  gap: 5px;
}

.prompt-full span {
  color: #8a98b8;
  font-size: 11px;
  font-weight: 900;
}

.prompt-full pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(2, 6, 23, 0.56);
  color: #93a0bd;
  font-size: 11.5px;
  line-height: 1.6;
  font-family: ui-monospace, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
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
  border: 1px dashed rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  color: #8a98b8;
  text-align: center;
}

.task-empty span {
  font-size: 13px;
  font-weight: 800;
}

.candidate-grid-empty h3 {
  margin: 0;
  color: #f8fbff;
  font-size: 15px;
}

.candidate-grid-empty p {
  max-width: 460px;
  margin: 0;
  color: #8a98b8;
  font-size: 12px;
  line-height: 1.7;
}

.task-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.42);
  padding: 12px;
}

.task-card + .task-card {
  margin-top: 10px;
}

.task-card-head {
  gap: 8px;
  color: #c4cfe5;
}

.task-card-head strong {
  font-size: 13px;
  color: #e8eefc;
}

.task-card-head span {
  margin-left: auto;
  color: #8a98b8;
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
  background: rgba(148, 163, 184, 0.18);
}

.task-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #22c7a9;
}

.task-card p {
  margin: 0;
  color: #8a98b8;
  font-size: 12px;
}

.candidate-grid-panel {
  display: grid;
  gap: 10px;
}

.candidate-batch {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.32);
}

.candidate-batch + .candidate-batch {
  margin-top: 4px;
}

.batch-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #c4cfe5;
  padding: 4px 6px 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.batch-toggle svg {
  transition: transform 0.15s ease;
  flex: 0 0 auto;
  color: #8a98b8;
}

.candidate-batch.is-collapsed .batch-toggle svg {
  transform: rotate(-90deg);
}

.batch-toggle span {
  color: #8a98b8;
  font-weight: 700;
  margin-left: auto;
}

.candidate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.candidate-grid-panel .panel-heading {
  display: flex;
  align-items: end;
}

.lock-progress {
  color: #8df0dc !important;
  font-size: 12px !important;
}

.candidate-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.5);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.candidate-card.is-locked {
  border-color: rgba(52, 211, 153, 0.5);
  box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.15);
}

.candidate-card.is-selected {
  border-color: rgba(94, 234, 212, 0.4);
}

.candidate-card.is-rejected {
  opacity: 0.4;
}

.candidate-card.is-rejected .candidate-thumb {
  filter: grayscale(0.8);
}

.candidate-card.is-superseded {
  opacity: 0.45;
}

.candidate-thumb {
  position: relative;
  display: grid;
  width: 100%;
  aspect-ratio: 4 / 5;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: rgba(2, 6, 23, 0.48);
  color: #8a98b8;
  cursor: zoom-in;
  padding: 0;
}

.candidate-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.candidate-thumb:hover img {
  transform: scale(1.04);
}

.thumb-zoom-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.78);
  color: #c4cfe5;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
}

.candidate-thumb:hover .thumb-zoom-hint {
  opacity: 1;
}

.candidate-thumb.is-empty {
  cursor: default;
}

.candidate-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.candidate-meta-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.candidate-card .candidate-meta strong {
  color: #f8fbff;
  font-size: 13px;
}

.candidate-status {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}

.candidate-card.is-locked .candidate-status {
  background: rgba(52, 211, 153, 0.16);
  color: #34d399;
}

.candidate-card.is-selected .candidate-status {
  background: rgba(94, 234, 212, 0.14);
  color: #5eead4;
}

.candidate-card.is-rejected .candidate-status {
  background: rgba(100, 116, 139, 0.18);
  color: #8a98b8;
}

.candidate-card.is-superseded .candidate-status {
  background: rgba(100, 116, 139, 0.12);
  color: #64748b;
}

.digest-tag {
  display: inline-block;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  width: fit-content;
}

.lock-action {
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
  border: 1px solid rgba(34, 199, 169, 0.32);
  border-radius: 8px;
  background: rgba(34, 199, 169, 0.1);
  color: #8df0dc;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
}

/* 候选图放大预览 modal */
.candidate-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.86);
  backdrop-filter: blur(12px);
  padding: 24px;
}

.candidate-preview-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 80vw;
  max-height: 90vh;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.92);
  padding: 18px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.candidate-preview-modal img {
  width: 100%;
  max-height: calc(90vh - 80px);
  border-radius: 8px;
  object-fit: contain;
  background: rgba(2, 6, 23, 0.6);
}

.preview-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.86);
  color: #e8eefc;
  z-index: 1;
}

.preview-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.preview-info strong {
  color: #f8fbff;
  font-size: 15px;
}

.preview-info span {
  color: #8a98b8;
  font-size: 12px;
  font-weight: 800;
}

.preview-lock-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(124, 58, 237, 0.4);
  border-radius: 8px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #ffffff;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 900;
}

.preview-lock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
