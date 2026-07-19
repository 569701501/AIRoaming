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
          v-if="isDatabaseCandidateMode && selectedShot"
          class="secondary-action"
          type="button"
          :disabled="decisionBusy"
          @click="toggleHistory"
        >
          <History :size="15" />
          <span>{{ historyOpen ? "收起定稿历史" : "定稿历史" }}</span>
        </button>
        <button
          class="secondary-action"
          type="button"
          :disabled="!isPreflightConfirmed || loading || unlockedShotCount === 0 || hasIncompleteBatchPromptDraft"
          :title="batchGenerationTitle"
          @click="generateAllUnlockedShots"
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
        <p v-if="candidateNotice" class="candidate-operation-notice" role="status">{{ candidateNotice }}</p>
        <p v-if="candidateError" class="candidate-operation-error" role="alert">{{ candidateError }}</p>
        <div class="candidate-hero">
          <div>
            <span>镜头 {{ selectedShot.order }}</span>
            <h2>{{ selectedShot.coreAction || selectedShot.comic.panelDescription || "未填写镜头动作" }}</h2>
          </div>
          <div class="generate-group">
            <button
              v-if="isDatabaseCandidateMode && hasCurrentFinal"
              class="clear-final-btn"
              type="button"
              :disabled="decisionBusy || loading"
              @click="requestClearFinal"
            >
              <Unlock :size="15" />
              <span>清空当前定稿</span>
            </button>
            <button
              class="generate-btn"
              type="button"
              :disabled="!canGenerateSelected || loading"
              :title="generationBlockedReason"
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

        <section v-if="historyOpen" class="candidate-history-panel" aria-label="定稿历史">
          <div class="panel-heading">
            <div><span>不可变定稿记录</span><strong>{{ historyItems.length }} 条</strong></div>
          </div>
          <p v-if="historyLoading" class="history-state">正在读取定稿历史…</p>
          <p v-else-if="historyItems.length === 0" class="history-state">这个镜头还没有定稿记录。</p>
          <ol v-else class="history-list">
            <li v-for="revision in historyItems" :key="revision.id">
              <strong>第 {{ revision.revision }} 版 · {{ getDecisionActionLabel(revision.action) }}</strong>
              <span>{{ getHistoryCandidateLabel(revision.candidateId) }}</span>
              <small>{{ formatDecisionTime(revision.recordedAt) }}</small>
            </li>
          </ol>
          <button
            v-if="historyNextBeforeRevision !== null"
            class="history-more"
            type="button"
            :disabled="historyLoading"
            @click="loadHistory(true)"
          >加载更早记录</button>
        </section>

        <section class="visual-editor-panel" aria-label="候选图画面描述编辑">
          <header class="visual-editor-heading">
            <div>
              <span>本次候选图描述</span>
              <strong>先把这一帧说清楚，再生成图片</strong>
              <small>这里只影响本次候选图，不会改正式分镜。</small>
            </div>
            <div class="visual-editor-actions">
              <button type="button" class="secondary-action compact" :disabled="loading || !hasPromptDraftChanges" @click="resetPromptDraft">
                恢复正式分镜
              </button>
              <button
                type="button"
                class="secondary-action compact"
                :disabled="loading || !isDatabaseCandidateMode || promptOptimizationRunning || hasIncompletePromptDraft"
                :title="isDatabaseCandidateMode ? '' : '当前旧兼容模式暂不支持 AI 优化描述'"
                @click="optimizePromptDraft"
              >
                <Loader2 v-if="promptOptimizationRunning" :size="14" class="is-spinning" />
                <Wand2 v-else :size="14" />
                {{ promptOptimizationRunning ? "正在优化" : "AI 优化描述" }}
              </button>
            </div>
          </header>

          <div class="visual-editor-fields">
            <label class="visual-editor-primary">
              <span>画面：这一帧看见什么</span>
              <textarea v-model="visualDescriptionDraft" rows="3" maxlength="1200" placeholder="写一个地点、一个时刻里肉眼能看见的主体与环境。"></textarea>
            </label>
            <label>
              <span>动作：谁对谁 / 什么做什么</span>
              <textarea v-model="actionDraft" rows="3" maxlength="1200" placeholder="多人时逐一写清名字、动作对象、承受或视线关系。"></textarea>
            </label>
            <label>
              <span>构图：人物放哪里、重点看哪里</span>
              <textarea v-model="compositionDraft" rows="3" maxlength="1200" placeholder="只写前中后景、左右位置、遮挡和视觉中心。"></textarea>
            </label>
          </div>

          <div v-if="candidateVisualIssues.length > 0" class="visual-issue-list" aria-label="画面描述问题">
            <p v-for="issue in candidateVisualIssues" :key="issue.code" :class="`is-${issue.severity}`">
              <AlertCircle :size="15" />
              <span>{{ issue.message }}</span>
            </p>
          </div>

          <div v-if="latestPromptSuggestion" class="prompt-suggestion-card">
            <div class="prompt-suggestion-heading">
              <div>
                <span>AI 优化建议</span>
                <small>这是建议稿，尚未采用，也没有改正式分镜。</small>
              </div>
              <button type="button" class="primary-action compact" :disabled="loading" @click="adoptPromptSuggestion">
                采用优化结果
              </button>
            </div>
            <dl>
              <div><dt>画面</dt><dd>{{ latestPromptSuggestion.visualDescription }}</dd></div>
              <div><dt>动作</dt><dd>{{ latestPromptSuggestion.action }}</dd></div>
              <div><dt>构图</dt><dd>{{ latestPromptSuggestion.composition }}</dd></div>
            </dl>
            <ul v-if="latestPromptSuggestion.mustShow.length > 0">
              <li v-for="item in latestPromptSuggestion.mustShow" :key="item">必须保留：{{ item }}</li>
            </ul>
            <p v-for="warning in latestPromptSuggestion.optimizationWarnings" :key="warning.message" class="suggestion-warning">
              {{ warning.message }}
            </p>
          </div>

          <p v-else-if="latestPromptOptimizationTask?.status === 'failed'" class="prompt-optimization-error">
            优化失败：{{ latestPromptOptimizationTask.error?.message ?? "请稍后重试" }}
          </p>
        </section>

        <div class="shot-context-grid">
          <article>
            <span>角色</span>
            <p>{{ selectedShot.characters.length > 0 ? selectedShot.characters.join("、") : "无明确角色" }}</p>
          </article>
          <article>
            <span>画风 / 目标画幅</span>
            <p>{{ getArtStyleLabel(snapshot.project.artStyle) }} / {{ getCandidateAspectLabel(snapshot.project.comicFormat) }}</p>
            <small>目标画幅只控制请求尺寸，不会把“竖滑条漫”等页面格式写入 Prompt。</small>
          </article>
        </div>

        <!-- 出图 prompt 预览(P0 任务C):生成前可看到完整 prompt,不可编辑 -->
        <section v-if="selectedShot" class="prompt-preview-panel">
          <button class="prompt-toggle" type="button" @click="promptExpanded = !promptExpanded">
            <ChevronDown :size="14" :class="{ 'is-rotated': !promptExpanded }" />
            <span>干净底图 Prompt</span>
            <em v-if="candidateGenerationSpec">v{{ candidateGenerationSpec.schemaVersion }}</em>
            <small>{{ promptExpanded ? "点击折叠" : "点击查看完整提示词" }}</small>
          </button>
          <div v-if="promptExpanded" class="prompt-preview-body">
            <p v-if="promptPreviewLoading" class="prompt-preview-state">正在读取服务端生成规格…</p>
            <p v-else-if="promptPreviewError" class="prompt-preview-state is-error">{{ promptPreviewError }}</p>
            <template v-else-if="candidateGenerationSpec">
              <div class="prompt-contract-note">
                单镜头 · 单幅 · 无文字/气泡 · 无分格/边框
              </div>
              <div v-if="candidateReferences.length > 0" class="reference-plan">
                <div class="reference-plan-heading">
                  <span>镜头级参考计划</span>
                  <small>provider 超过上限时按优先级裁剪，实际使用结果写入任务证据</small>
                </div>
                <div class="reference-plan-list">
                  <div v-for="reference in candidateReferences" :key="reference.assetId" class="reference-plan-item">
                    <em>{{ getReferenceRoleLabel(reference.kind, reference.priority) }}</em>
                    <strong>{{ reference.label }}</strong>
                    <small>优先级 {{ reference.priority }}</small>
                  </div>
                </div>
              </div>
              <div class="prompt-sections">
              <div v-for="section in promptSections" :key="section.label" class="prompt-section-item">
                <span>{{ section.label }}</span>
                <p>{{ section.value }}</p>
              </div>
              </div>
              <div class="prompt-full">
                <span>服务端最终 prompt</span>
                <pre>{{ fullPromptText }}</pre>
              </div>
              <p v-if="candidateGenerationSpec.warnings.length > 0" class="prompt-warning">
                {{ candidateGenerationSpec.warnings.join(" · ") }}
              </p>
            </template>
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
            <template v-else>
              <p>{{ getTaskDigest(task) }}</p>
              <ul v-if="getTaskWarnings(task).length > 0" class="task-warning-list">
                <li v-for="warning in getTaskWarnings(task)" :key="warning">{{ getTaskWarningLabel(warning) }}</li>
              </ul>
            </template>
          </article>
        </section>

        <section class="candidate-grid-panel">
          <div class="panel-heading">
            <div>
              <span>候选结果</span>
              <strong>{{ selectedCandidates.length }} 张 · {{ candidateBatches.length }} 批</strong>
            </div>
            <span class="lock-progress">已定稿 {{ lockedShotCount }}/{{ shots.length }}</span>
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
                :class="[`is-${candidate.status}`, { 'is-locked': isCurrentCandidate(candidate), 'is-favorite': Boolean(candidate.favoriteAt), 'is-historical-source': candidate.sourceApplicability === 'historical' }]"
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
                    <span class="candidate-status">{{ isCurrentCandidate(candidate) ? "当前定稿" : getCandidateStatusLabel(candidate.status) }}</span>
                  </div>
                  <span v-if="candidate.promptDigest" class="digest-tag" :title="`prompt 摘要 ${candidate.promptDigest}`">{{ candidate.promptDigest.slice(0, 6) }}</span>
                  <span
                    class="generation-contract-tag"
                    :class="{ 'is-legacy': candidate.generationPurpose === 'legacy_unspecified' }"
                  >
                    {{ candidate.generationPurpose === "shot_clean_plate" ? `干净底图 v${candidate.generationSpecVersion ?? 1}` : "旧规则候选" }}
                  </span>
                  <span v-if="candidate.sourceApplicability === 'historical'" class="source-history-tag">来源已过期</span>
                  <div v-if="isDatabaseCandidateMode" class="candidate-preference-actions">
                    <button
                      class="icon-action"
                      type="button"
                      :aria-label="candidate.favoriteAt ? `取消收藏 ${candidate.label}` : `收藏 ${candidate.label}`"
                      :title="candidate.favoriteAt ? '取消收藏' : '收藏'"
                      :disabled="decisionBusy"
                      @click="toggleFavorite(candidate)"
                    >
                      <Star :size="15" :fill="candidate.favoriteAt ? 'currentColor' : 'none'" />
                    </button>
                    <button
                      class="icon-action"
                      type="button"
                      :aria-label="candidate.status === 'rejected' ? `恢复 ${candidate.label}` : `废弃 ${candidate.label}`"
                      :title="candidate.status === 'rejected' ? '恢复候选' : '废弃候选'"
                      :disabled="decisionBusy || isCurrentCandidate(candidate) || candidate.status === 'superseded'"
                      @click="toggleRejected(candidate)"
                    >
                      <RotateCcw v-if="candidate.status === 'rejected'" :size="15" />
                      <Trash2 v-else :size="15" />
                    </button>
                  </div>
                  <button
                    class="lock-action"
                    type="button"
                    :disabled="loading || decisionBusy || isCandidateDecisionDisabled(candidate)"
                    @click="requestFinalize(candidate)"
                  >
                    <Lock :size="13" />
                    <span>{{ getFinalizeActionLabel(candidate) }}</span>
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
          <span>{{ isCurrentCandidate(previewCandidate) ? "当前定稿" : getCandidateStatusLabel(previewCandidate.status) }}</span>
          <button
            class="preview-lock-btn"
            type="button"
            :disabled="loading || decisionBusy || isCandidateDecisionDisabled(previewCandidate)"
            @click="requestFinalize(previewCandidate); previewCandidate = null"
          >
            <Lock :size="15" />
            <span>{{ getFinalizeActionLabel(previewCandidate) }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="decisionPreview" class="candidate-decision-backdrop" @click.self="closeDecisionPreview">
      <section class="candidate-decision-modal" role="dialog" aria-modal="true" aria-label="确认候选定稿影响">
        <header>
          <div>
            <span>{{ getDecisionActionLabel(decisionPreview.action) }}</span>
            <h2>确认本次定稿变更</h2>
          </div>
          <button type="button" aria-label="关闭定稿确认" :disabled="decisionBusy" @click="closeDecisionPreview"><X :size="20" /></button>
        </header>
        <p class="decision-summary">{{ getDecisionSummary(decisionPreview) }}</p>
        <div class="impact-grid">
          <div><span>受影响排版元素</span><strong>{{ decisionPreview.impact.affectedWorkingCopyElements.length + decisionPreview.impact.affectedLayoutBindings.length }}</strong></div>
          <div><span>历史排版版本</span><strong>{{ decisionPreview.impact.preservedLayoutHistoryCount }}</strong></div>
          <div><span>历史导出版本</span><strong>{{ decisionPreview.impact.preservedExportHistoryCount }}</strong></div>
          <div><span>运行中任务</span><strong>{{ decisionPreview.impact.activeTaskIds.length }}</strong></div>
        </div>
        <p v-if="hasDownstreamImpact(decisionPreview)" class="impact-warning">
          旧排版和导出会保留为历史，但会标记为来源已变化；这里不会自动换图、裁切或生成新排版。
        </p>
        <p v-if="decisionConflictNotice" class="decision-conflict" role="status">{{ decisionConflictNotice }}</p>
        <p v-if="!decisionPreview.commitAllowed" class="decision-blocked" role="alert">
          当前上游状态不允许提交，请先处理：{{ decisionPreview.commitBlockedReasonCodes.join("、") }}
        </p>
        <footer>
          <button type="button" class="secondary-action" :disabled="decisionBusy" @click="closeDecisionPreview">取消</button>
          <button
            type="button"
            class="primary-action"
            :disabled="decisionBusy || !decisionPreview.commitAllowed"
            @click="commitDecision"
          >
            <Loader2 v-if="decisionBusy" :size="15" class="is-spinning" />
            <CheckCircle2 v-else :size="15" />
            <span>{{ decisionPreview.noOp ? "确认状态" : "确认变更" }}</span>
          </button>
        </footer>
      </section>
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
  History,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  ShieldAlert,
  Star,
  Trash2,
  Unlock,
  Wand2,
  X,
  ZoomIn,
} from "lucide-vue-next";
import type {
  ArtStyle,
  CandidateLockHistoryPage,
  CandidateLockImpactPreviewResponse,
  CandidateLockRevisionDto,
  CandidateLockIntent,
  CandidateStatus,
  CandidateGenerationSpec,
  CandidatePromptOverrides,
  CandidateVisualIssue,
  ChapterListItem,
  GenerationTaskItem,
  GenerationTaskStatus,
  WorkbenchCandidate,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { ApiClientError, api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateCandidates: [payload: { shotId: string; candidateCount: number; promptOverrides: CandidatePromptOverrides }];
  optimizePrompt: [payload: { shotId: string; promptOverrides: CandidatePromptOverrides }];
  generateAllUnlocked: [payload: { promptOverridesByShot: Record<string, CandidatePromptOverrides> }];
  candidateChanged: [];
  completeImages: [];
  goPreflight: [];
}>();

const selectedShotId = ref<string | null>(null);
const candidateCount = ref(4);
const promptExpanded = ref(false);
const previewCandidate = ref<WorkbenchCandidate | null>(null);
const candidateGenerationSpec = ref<CandidateGenerationSpec | null>(null);
const promptPreviewLoading = ref(false);
const promptPreviewError = ref<string | null>(null);
const decisionPreview = ref<CandidateLockImpactPreviewResponse | null>(null);
const pendingDecisionIntent = ref<CandidateLockIntent | null>(null);
const decisionBusy = ref(false);
const decisionConflictNotice = ref<string | null>(null);
const candidateError = ref<string | null>(null);
const candidateNotice = ref<string | null>(null);
const historyOpen = ref(false);
const historyLoading = ref(false);
const historyItems = ref<CandidateLockRevisionDto[]>([]);
const historyNextBeforeRevision = ref<number | null>(null);
let promptPreviewRequestId = 0;
let promptPreviewTimer: ReturnType<typeof setTimeout> | null = null;

interface ShotPromptDraft {
  visualDescription: string;
  action: string;
  composition: string;
  sourceVisualDescription: string;
  sourceAction: string;
  sourceComposition: string;
}

interface PromptOptimizationSuggestion {
  visualDescription: string;
  action: string;
  composition: string;
  mustShow: string[];
  optimizationWarnings: Array<{ code: "SOURCE_CONFLICT"; message: string }>;
}

const promptDrafts = ref<Record<string, ShotPromptDraft>>({});

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const isDatabaseCandidateMode = computed(() => props.snapshot.versioningCapability.mode === "g2_db");
const hasFormalStoryboard = computed(() => Boolean(props.snapshot.storyboard && props.snapshot.storyboard.chapterId === currentChapterId.value));
const shots = computed(() => hasFormalStoryboard.value ? props.snapshot.shots : []);
const currentCandidateIds = computed(() => new Set(
  shots.value
    .map((shot) => shot.lockedCandidateId)
    .filter((candidateId): candidateId is string => candidateId !== null),
));
const selectedShot = computed(() => shots.value.find((shot) => shot.id === selectedShotId.value) ?? shots.value[0] ?? null);
const selectedCurrentCandidateId = computed(() => {
  const shot = selectedShot.value;
  if (!shot) return null;
  return shot.currentCandidateDecision?.state === "finalized"
    ? shot.currentCandidateDecision.candidateId
    : shot.lockedCandidateId;
});
const hasCurrentFinal = computed(() => selectedCurrentCandidateId.value !== null);
const promptSections = computed(() => candidateGenerationSpec.value?.sections ?? []);
const candidateReferences = computed(() => [...(candidateGenerationSpec.value?.references ?? [])]
  .sort((left, right) => right.priority - left.priority));
const fullPromptText = computed(() => candidateGenerationSpec.value
  ? candidateGenerationSpec.value.positivePrompt
  : "",
);
const selectedPromptDraft = computed(() => {
  const shot = selectedShot.value;
  return shot ? promptDrafts.value[shot.id] ?? createPromptDraft(shot) : null;
});
const visualDescriptionDraft = computed({
  get: () => selectedPromptDraft.value?.visualDescription ?? "",
  set: (value: string) => updateSelectedPromptDraft({ visualDescription: value }),
});
const actionDraft = computed({
  get: () => selectedPromptDraft.value?.action ?? "",
  set: (value: string) => updateSelectedPromptDraft({ action: value }),
});
const compositionDraft = computed({
  get: () => selectedPromptDraft.value?.composition ?? "",
  set: (value: string) => updateSelectedPromptDraft({ composition: value }),
});
const selectedPromptOverrides = computed<CandidatePromptOverrides>(() => ({
  visualDescription: visualDescriptionDraft.value.trim(),
  action: actionDraft.value.trim(),
  composition: compositionDraft.value.trim(),
}));
const hasIncompletePromptDraft = computed(() => !visualDescriptionDraft.value.trim() || !actionDraft.value.trim() || !compositionDraft.value.trim());
const hasPromptDraftChanges = computed(() => {
  const draft = selectedPromptDraft.value;
  return Boolean(draft && (
    draft.visualDescription !== draft.sourceVisualDescription
    || draft.action !== draft.sourceAction
    || draft.composition !== draft.sourceComposition
  ));
});
const candidateVisualIssues = computed<CandidateVisualIssue[]>(() => candidateGenerationSpec.value?.visualIssues ?? []);
const hasBlockingVisualIssues = computed(() => candidateVisualIssues.value.some((issue) => issue.severity === "blocking"));
const isPreflightConfirmed = computed(() => {
  if (isDatabaseCandidateMode.value) {
    return props.snapshot.candidateSources?.chapterId === currentChapterId.value
      && props.snapshot.workflow.steps.find((step) => step.key === "image_preflight")?.status === "done";
  }
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
  && currentChapter.value?.status !== "exported"
  && candidateGenerationSpec.value
  && !promptPreviewLoading.value
  && !hasIncompletePromptDraft.value
  && !hasBlockingVisualIssues.value
));
const generationBlockedReason = computed(() => {
  if (hasIncompletePromptDraft.value) return "请先把画面、动作和构图填写完整";
  const blocking = candidateVisualIssues.value.find((issue) => issue.severity === "blocking");
  if (blocking) return blocking.message;
  if (promptPreviewLoading.value) return "正在检查画面描述";
  if (promptPreviewError.value) return promptPreviewError.value;
  return "";
});
const lockedShotCount = computed(() => shots.value.filter((shot) => Boolean(shot.lockedCandidateId)).length);
const unlockedShotCount = computed(() => shots.value.filter((shot) => !shot.lockedCandidateId).length);
const hasIncompleteBatchPromptDraft = computed(() => shots.value
  .filter((shot) => !shot.lockedCandidateId)
  .some((shot) => {
    const draft = promptDrafts.value[shot.id] ?? createPromptDraft(shot);
    return !draft.visualDescription.trim() || !draft.action.trim() || !draft.composition.trim();
  }));
const batchGenerationTitle = computed(() => {
  if (unlockedShotCount.value === 0) return "本章镜头已全部锁定";
  if (hasIncompleteBatchPromptDraft.value) return "请先把所有未锁定镜头的画面、动作和构图填写完整";
  return `为 ${unlockedShotCount.value} 个未锁定镜头各生成 1 张`;
});
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
const chapterPromptOptimizationTasks = computed(() => props.tasks.filter((task) =>
  task.projectId === props.snapshot.project.id
  && task.type === "shot_prompt_generate"
  && getTaskChapterId(task) === currentChapterId.value,
));
const selectedPromptOptimizationTasks = computed(() => {
  const shotId = selectedShot.value?.id;
  if (!shotId) return [];
  return chapterPromptOptimizationTasks.value
    .filter((task) => getTaskShotId(task) === shotId && isPromptTaskCurrent(task))
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
});
const latestPromptOptimizationTask = computed(() => selectedPromptOptimizationTasks.value[0] ?? null);
const promptOptimizationRunning = computed(() => selectedPromptOptimizationTasks.value.some((task) =>
  task.status === "queued" || task.status === "running" || task.status === "retrying",
));
const latestPromptSuggestion = computed<PromptOptimizationSuggestion | null>(() => {
  const task = latestPromptOptimizationTask.value;
  return task?.status === "succeeded" ? readPromptSuggestion(task.output) : null;
});
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
let candidateBatchScopeKey = "";
let knownCandidateBatchIds = new Set<string>();
watch(
  [
    () => `${props.snapshot.project.id}\0${currentChapterId.value ?? ""}\0${selectedShot.value?.id ?? ""}`,
    candidateBatches,
  ],
  ([scopeKey, batches]) => {
    const scopeChanged = scopeKey !== candidateBatchScopeKey;
    const currentIds = new Set(batches.map((batch) => batch.taskId));
    const next = scopeChanged
      ? new Set<string>()
      : new Set([...collapsedBatchIds.value].filter((taskId) => currentIds.has(taskId)));
    // 只给首次出现的旧批次设置默认折叠；任务轮询刷新时必须保留用户已展开的状态。
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index]!;
      if ((scopeChanged || !knownCandidateBatchIds.has(batch.taskId)) && index > 0) {
        next.add(batch.taskId);
      }
    }
    candidateBatchScopeKey = scopeKey;
    knownCandidateBatchIds = currentIds;
    collapsedBatchIds.value = next;
  },
  { immediate: true },
);

function createPromptDraft(shot: WorkbenchSnapshot["shots"][number]): ShotPromptDraft {
  const visualDescription = shot.comic.panelDescription || shot.promptDraft || "";
  const action = shot.coreAction || "";
  const composition = shot.comic.composition || shot.motion.compositionDesign || "";
  return {
    visualDescription,
    action,
    composition,
    sourceVisualDescription: visualDescription,
    sourceAction: action,
    sourceComposition: composition,
  };
}

function syncPromptDrafts(nextShots: WorkbenchSnapshot["shots"]): void {
  const activeIds = new Set(nextShots.map((shot) => shot.id));
  const next: Record<string, ShotPromptDraft> = {};
  for (const shot of nextShots) {
    const current = promptDrafts.value[shot.id];
    const untouched = current
      && current.visualDescription === current.sourceVisualDescription
      && current.action === current.sourceAction
      && current.composition === current.sourceComposition;
    next[shot.id] = !current || untouched ? createPromptDraft(shot) : current;
  }
  for (const shotId of Object.keys(promptDrafts.value)) {
    if (!activeIds.has(shotId)) delete promptDrafts.value[shotId];
  }
  promptDrafts.value = next;
}

function updateSelectedPromptDraft(patch: Partial<Pick<ShotPromptDraft, "visualDescription" | "action" | "composition">>): void {
  const shot = selectedShot.value;
  if (!shot) return;
  const current = promptDrafts.value[shot.id] ?? createPromptDraft(shot);
  promptDrafts.value = {
    ...promptDrafts.value,
    [shot.id]: { ...current, ...patch },
  };
}

function resetPromptDraft(): void {
  const shot = selectedShot.value;
  if (!shot) return;
  promptDrafts.value = { ...promptDrafts.value, [shot.id]: createPromptDraft(shot) };
  candidateNotice.value = "已恢复为正式分镜里的画面描述。";
}

function optimizePromptDraft(): void {
  const shot = selectedShot.value;
  if (!shot || hasIncompletePromptDraft.value || promptOptimizationRunning.value) return;
  emit("optimizePrompt", { shotId: shot.id, promptOverrides: selectedPromptOverrides.value });
}

function adoptPromptSuggestion(): void {
  const suggestion = latestPromptSuggestion.value;
  if (!suggestion) return;
  updateSelectedPromptDraft({
    visualDescription: suggestion.visualDescription,
    action: suggestion.action,
    composition: suggestion.composition,
  });
  candidateNotice.value = "已把优化建议放入本次候选图描述；正式分镜没有改动。";
}

function readPromptSuggestion(output: Record<string, unknown> | null): PromptOptimizationSuggestion | null {
  if (!output) return null;
  const visualDescription = typeof output.visualDescription === "string" ? output.visualDescription.trim() : "";
  const action = typeof output.action === "string" ? output.action.trim() : "";
  const composition = typeof output.composition === "string" ? output.composition.trim() : "";
  if (!visualDescription || !action || !composition) return null;
  const mustShow = Array.isArray(output.mustShow)
    ? output.mustShow.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
  const optimizationWarnings = Array.isArray(output.optimizationWarnings)
    ? output.optimizationWarnings.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      return row.code === "SOURCE_CONFLICT" && typeof row.message === "string" && row.message.trim()
        ? [{ code: "SOURCE_CONFLICT" as const, message: row.message.trim() }]
        : [];
    })
    : [];
  return { visualDescription, action, composition, mustShow, optimizationWarnings };
}

watch(
  shots,
  (nextShots) => {
    syncPromptDrafts(nextShots);
    if (!selectedShotId.value || !nextShots.some((shot) => shot.id === selectedShotId.value)) {
      selectedShotId.value = nextShots[0]?.id ?? null;
    }
  },
  { immediate: true },
);

watch(
  () => [
    props.snapshot.project.id,
    currentChapterId.value,
    selectedShot.value?.id ?? null,
    visualDescriptionDraft.value,
    actionDraft.value,
    compositionDraft.value,
  ] as const,
  ([projectId, chapterId, shotId, visualDescription, action, composition], _previous, onCleanup) => {
    const requestId = ++promptPreviewRequestId;
    candidateGenerationSpec.value = null;
    promptPreviewError.value = null;
    if (promptPreviewTimer) clearTimeout(promptPreviewTimer);
    if (!chapterId || !shotId || !visualDescription.trim() || !action.trim() || !composition.trim()) {
      promptPreviewLoading.value = false;
      return;
    }
    promptPreviewLoading.value = true;
    promptPreviewTimer = setTimeout(async () => {
      try {
        const result = await api.candidateGenerationPreview(projectId, chapterId, shotId, {
          visualDescription: visualDescription.trim(),
          action: action.trim(),
          composition: composition.trim(),
        });
        if (requestId === promptPreviewRequestId) {
          candidateGenerationSpec.value = result.spec;
        }
      } catch (error) {
        if (requestId === promptPreviewRequestId) {
          promptPreviewError.value = error instanceof Error ? error.message : "生成规格读取失败";
        }
      } finally {
        if (requestId === promptPreviewRequestId) {
          promptPreviewLoading.value = false;
        }
      }
    }, 280);
    onCleanup(() => {
      if (promptPreviewTimer) clearTimeout(promptPreviewTimer);
    });
  },
  { immediate: true },
);

watch(
  () => selectedShot.value?.id ?? null,
  () => {
    historyOpen.value = false;
    historyItems.value = [];
    historyNextBeforeRevision.value = null;
    closeDecisionPreview();
  },
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
    promptOverrides: selectedPromptOverrides.value,
  });
}

function generateAllUnlockedShots(): void {
  const promptOverridesByShot: Record<string, CandidatePromptOverrides> = {};
  for (const shot of shots.value.filter((item) => !item.lockedCandidateId)) {
    const draft = promptDrafts.value[shot.id] ?? createPromptDraft(shot);
    promptOverridesByShot[shot.id] = {
      visualDescription: draft.visualDescription.trim(),
      action: draft.action.trim(),
      composition: draft.composition.trim(),
    };
  }
  emit("generateAllUnlocked", { promptOverridesByShot });
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

async function requestFinalize(candidate: WorkbenchCandidate) {
  if (isCandidateDecisionDisabled(candidate)) return;
  if (!isDatabaseCandidateMode.value) return;
  const shot = shots.value.find((item) => item.id === candidate.shotId);
  if (!shot) return;
  const currentId = shot.currentCandidateDecision?.state === "finalized"
    ? shot.currentCandidateDecision.candidateId
    : shot.lockedCandidateId;
  await previewDecision(currentId ? { action: "replace", candidateId: candidate.id } : { action: "lock", candidateId: candidate.id });
}

async function requestClearFinal() {
  if (!isDatabaseCandidateMode.value || !hasCurrentFinal.value) return;
  await previewDecision({ action: "clear" });
}

async function previewDecision(intent: CandidateLockIntent, conflictMessage: string | null = null) {
  const chapterId = currentChapterId.value;
  const shotId = selectedShot.value?.id;
  if (!chapterId || !shotId) return;
  decisionBusy.value = true;
  candidateError.value = null;
  candidateNotice.value = null;
  try {
    const preview = await api.previewCandidateDecision(props.snapshot.project.id, chapterId, shotId, intent);
    pendingDecisionIntent.value = intent;
    decisionPreview.value = preview;
    decisionConflictNotice.value = conflictMessage;
  } catch (error) {
    candidateError.value = candidateOperationError(error, "无法预览定稿影响");
    decisionPreview.value = null;
    pendingDecisionIntent.value = null;
  } finally {
    decisionBusy.value = false;
  }
}

async function commitDecision() {
  const preview = decisionPreview.value;
  const intent = pendingDecisionIntent.value;
  const chapterId = currentChapterId.value;
  const shotId = selectedShot.value?.id;
  if (!preview || !intent || !chapterId || !shotId || !preview.commitAllowed) return;
  decisionBusy.value = true;
  candidateError.value = null;
  decisionConflictNotice.value = null;
  try {
    await api.commitCandidateDecision(props.snapshot.project.id, chapterId, shotId, {
      ...intent,
      expectedCurrentRevisionId: preview.expectedCurrentRevisionId,
      impactDigest: preview.impactDigest as `sha256:${string}`,
      reason: null,
    });
    candidateNotice.value = preview.action === "clear" ? "已清空当前定稿，旧排版和导出仍作为历史保留。" : "候选定稿已更新。";
    decisionBusy.value = false;
    closeDecisionPreview();
    emit("candidateChanged");
    if (historyOpen.value) await loadHistory(false);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) {
      const originalIntent = intent;
      decisionBusy.value = false;
      emit("candidateChanged");
      await previewDecision(originalIntent, "服务器状态已变化，影响清单已重新计算；请重新确认，本页面没有自动提交。 ");
      return;
    }
    candidateError.value = candidateOperationError(error, "定稿变更失败");
  } finally {
    decisionBusy.value = false;
  }
}

function closeDecisionPreview() {
  if (decisionBusy.value) return;
  decisionPreview.value = null;
  pendingDecisionIntent.value = null;
  decisionConflictNotice.value = null;
}

async function toggleFavorite(candidate: WorkbenchCandidate) {
  const chapterId = currentChapterId.value;
  if (!chapterId || !isDatabaseCandidateMode.value) return;
  decisionBusy.value = true;
  candidateError.value = null;
  try {
    const favorite = !candidate.favoriteAt;
    await api.setCandidateFavorite(props.snapshot.project.id, chapterId, candidate.id, favorite);
    candidateNotice.value = favorite ? `已收藏「${candidate.label}」。` : `已取消收藏「${candidate.label}」。`;
    emit("candidateChanged");
  } catch (error) {
    candidateError.value = candidateOperationError(error, "收藏操作失败");
  } finally {
    decisionBusy.value = false;
  }
}

async function toggleRejected(candidate: WorkbenchCandidate) {
  const chapterId = currentChapterId.value;
  if (!chapterId || !isDatabaseCandidateMode.value || isCurrentCandidate(candidate)) return;
  decisionBusy.value = true;
  candidateError.value = null;
  try {
    const rejected = candidate.status !== "rejected";
    await api.setCandidateRejected(props.snapshot.project.id, chapterId, candidate.id, rejected);
    candidateNotice.value = rejected ? `已废弃「${candidate.label}」。` : `已恢复「${candidate.label}」。`;
    emit("candidateChanged");
  } catch (error) {
    candidateError.value = candidateOperationError(error, "候选状态更新失败");
  } finally {
    decisionBusy.value = false;
  }
}

async function toggleHistory() {
  historyOpen.value = !historyOpen.value;
  if (historyOpen.value && historyItems.value.length === 0) await loadHistory(false);
}

async function loadHistory(append: boolean) {
  const chapterId = currentChapterId.value;
  const shotId = selectedShot.value?.id;
  if (!chapterId || !shotId) return;
  historyLoading.value = true;
  candidateError.value = null;
  try {
    const page: CandidateLockHistoryPage = await api.candidateDecisionHistory(
      props.snapshot.project.id,
      chapterId,
      shotId,
      append ? historyNextBeforeRevision.value : null,
    );
    historyItems.value = append ? [...historyItems.value, ...page.items] : page.items;
    historyNextBeforeRevision.value = page.nextBeforeRevision;
  } catch (error) {
    candidateError.value = candidateOperationError(error, "定稿历史读取失败");
  } finally {
    historyLoading.value = false;
  }
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
    case "rejected":
      return "已废弃";
    case "superseded":
      return "已替代";
    default:
      return "已生成";
  }
}

function isCurrentCandidate(candidate: WorkbenchCandidate): boolean {
  return candidate.isCurrentFinal ?? currentCandidateIds.value.has(candidate.id);
}

function isCandidateDecisionDisabled(candidate: WorkbenchCandidate): boolean {
  return isCurrentCandidate(candidate)
    || candidate.status === "rejected"
    || candidate.status === "superseded"
    || candidate.sourceApplicability === "historical";
}

function getFinalizeActionLabel(candidate: WorkbenchCandidate): string {
  if (isCurrentCandidate(candidate)) return "当前定稿";
  if (candidate.status === "rejected") return "已废弃";
  if (candidate.status === "superseded") return "已替代";
  if (candidate.sourceApplicability === "historical") return "来源已过期";
  return selectedCurrentCandidateId.value ? "更换为此图" : "定稿此图";
}

function getDecisionActionLabel(action: CandidateLockRevisionDto["action"]): string {
  if (action === "lock") return "首次定稿";
  if (action === "replace") return "更换定稿";
  return "清空定稿";
}

function getHistoryCandidateLabel(candidateId: string | null): string {
  if (!candidateId) return "本次记录没有候选图";
  return props.snapshot.candidates.find((candidate) => candidate.id === candidateId)?.label ?? `候选 ${candidateId.slice(0, 8)}`;
}

function formatDecisionTime(value: string | null): string {
  if (!value) return "未记录决定时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录决定时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function getDecisionSummary(preview: CandidateLockImpactPreviewResponse): string {
  const target = preview.targetCandidateId
    ? props.snapshot.candidates.find((candidate) => candidate.id === preview.targetCandidateId)?.label ?? "所选候选"
    : null;
  if (preview.action === "clear") return "清空后该镜头将暂时没有当前定稿；后续排版写入会被阻止，直到重新定稿。";
  if (preview.noOp) return `${target ?? "所选候选"} 已经是当前定稿，不会新建版本。`;
  return preview.action === "lock"
    ? `将 ${target ?? "所选候选"} 设为这个镜头的首次定稿。`
    : `将当前定稿更换为 ${target ?? "所选候选"}。`;
}

function hasDownstreamImpact(preview: CandidateLockImpactPreviewResponse): boolean {
  const impact = preview.impact;
  return impact.affectedWorkingCopyElements.length > 0
    || impact.affectedLayoutBindings.length > 0
    || impact.affectedExportRevisionIds.length > 0
    || impact.activeTaskIds.length > 0;
}

function candidateOperationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return error instanceof Error ? error.message : fallback;
  const labels: Record<string, string> = {
    CANDIDATE_IS_CURRENT_FINAL: "当前定稿不能直接废弃，请先更换或清空定稿。",
    CANDIDATE_REJECTED: "已废弃的候选不能定稿，请先恢复。",
    CANDIDATE_SUPERSEDED: "已被替代的候选不能再次定稿。",
    CANDIDATE_SOURCE_NOT_CURRENT: "这张候选来自旧版分镜，不能用于当前定稿。",
    CANDIDATE_ASSET_NOT_READY: "候选图片还未准备好。",
    UPSTREAM_WORK_NOT_CONFIRMED: "上游内容尚未确认，暂时不能变更定稿。",
    CANDIDATE_LOCK_ACTION_INVALID: "当前定稿状态已变化，请刷新后重新选择。",
  };
  return labels[error.code] ?? error.message ?? fallback;
}

function getTaskChapterId(task: GenerationTaskItem): string | null {
  const value = task.input.chapterId ?? task.target?.chapterId;
  return typeof value === "string" ? value : null;
}

function getTaskShotId(task: GenerationTaskItem): string | null {
  const value = task.input.shotId ?? (task.target?.type === "shot" ? task.target.id : null);
  return typeof value === "string" ? value : null;
}

function isPromptTaskCurrent(task: GenerationTaskItem): boolean {
  if (!isDatabaseCandidateMode.value) return true;
  const currentStoryboardId = props.snapshot.storyboard?.id;
  const currentPreflightId = props.snapshot.imagePreflight?.id;
  const projection = task.input.sourceProjection;
  if (!currentStoryboardId || !currentPreflightId || !projection || typeof projection !== "object" || Array.isArray(projection)) return false;
  const sources = (projection as Record<string, unknown>).sources;
  if (!Array.isArray(sources)) return false;
  const rows = sources.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const sourcesAreCurrent = rows.some((row) => row.sourceType === "storyboard_version" && row.sourceId === currentStoryboardId)
    && rows.some((row) => row.sourceType === "preflight_revision" && row.sourceId === currentPreflightId);
  return sourcesAreCurrent && promptTaskMatchesCurrentDraft(task);
}

function promptTaskMatchesCurrentDraft(task: GenerationTaskItem): boolean {
  const shotId = getTaskShotId(task);
  const shot = shots.value.find((item) => item.id === shotId);
  const promptSpec = task.input.promptSpec;
  if (!shot || !promptSpec || typeof promptSpec !== "object" || Array.isArray(promptSpec)) return false;
  const rawSections = (promptSpec as Record<string, unknown>).sections;
  if (!Array.isArray(rawSections)) return false;
  const sectionValues = new Map<string, string>();
  for (const item of rawSections) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key === "string" && typeof row.value === "string") sectionValues.set(row.key, row.value.trim());
  }
  const draft = promptDrafts.value[shot.id] ?? createPromptDraft(shot);
  const actionSection = sectionValues.get("action") ?? "";
  return sectionValues.get("visual") === draft.visualDescription.trim()
    && sectionValues.get("composition") === draft.composition.trim()
    && (actionSection === draft.action.trim() || actionSection.startsWith(`${draft.action.trim()}; `));
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

function getCandidateAspectLabel(value: WorkbenchSnapshot["project"]["comicFormat"]): string {
  switch (value) {
    case "vertical_scroll":
      return "2:3 默认候选画幅";
    case "paged_comic":
      return "3:2 默认候选画幅";
  }
}

function getReferenceRoleLabel(kind: "character_identity" | "scene_environment", priority: number): string {
  if (kind === "scene_environment") {
    return "场景";
  }
  return priority >= 100 ? "主主体" : "次主体";
}

function getTaskWarnings(task: GenerationTaskItem): string[] {
  const warnings = task.output?.warnings;
  return Array.isArray(warnings)
    ? warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
    : [];
}

function getTaskWarningLabel(warning: string): string {
  if (warning === "candidate_output_dimensions_unreadable") {
    return "无法读取 provider 返回图片的实际尺寸。";
  }
  if (warning.startsWith("candidate_output_aspect_ratio_mismatch:")) {
    const [, requested, actual] = warning.split(":");
    return `输出比例与目标不一致：${requested ?? "未知"} → ${actual ?? "未知"}`;
  }
  if (warning.startsWith("candidate_references_omitted:")) {
    const [, provider, assetIds] = warning.split(":");
    return `${provider ?? "provider"} 已按能力上限省略引用：${assetIds ?? "未知资产"}`;
  }
  if (warning === "grok_single_reference_omitted_for_aspect_ratio") {
    return "Grok 单参考编辑会继承原图比例，本次已安全降级为纯文生图。";
  }
  return warning;
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

.visual-editor-panel {
  margin-top: 14px;
  border: 1px solid rgba(34, 199, 169, 0.24);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.72);
  padding: 16px;
}

.visual-editor-heading,
.prompt-suggestion-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.visual-editor-heading > div:first-child,
.prompt-suggestion-heading > div:first-child {
  display: grid;
  gap: 4px;
}

.visual-editor-heading span,
.prompt-suggestion-heading span {
  color: #8df0dc;
  font-size: 11px;
  font-weight: 950;
}

.visual-editor-heading strong {
  color: #f8fbff;
  font-size: 15px;
}

.visual-editor-heading small,
.prompt-suggestion-heading small {
  color: #8a98b8;
  font-size: 11px;
}

.visual-editor-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.visual-editor-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.visual-editor-primary {
  grid-column: 1 / -1;
}

.visual-editor-fields label {
  display: grid;
  gap: 7px;
}

.visual-editor-fields label > span {
  color: #aebbd3;
  font-size: 11px;
  font-weight: 900;
}

.visual-editor-fields textarea {
  width: 100%;
  min-height: 94px;
  resize: vertical;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.5);
  color: #e8eefc;
  padding: 10px 11px;
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  box-sizing: border-box;
}

.visual-editor-fields textarea:focus {
  outline: 2px solid rgba(34, 199, 169, 0.22);
  border-color: rgba(34, 199, 169, 0.5);
}

.visual-issue-list {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.visual-issue-list p {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  border-radius: 7px;
  padding: 8px 10px;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.1);
  font-size: 11px;
  line-height: 1.55;
}

.visual-issue-list p.is-blocking {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.11);
}

.visual-issue-list svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.prompt-suggestion-card {
  margin-top: 12px;
  border: 1px solid rgba(139, 92, 246, 0.32);
  border-radius: 9px;
  background: rgba(76, 29, 149, 0.12);
  padding: 13px;
}

.prompt-suggestion-card dl {
  display: grid;
  gap: 7px;
  margin: 12px 0 0;
}

.prompt-suggestion-card dl > div {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
}

.prompt-suggestion-card dt {
  color: #a78bfa;
  font-size: 11px;
  font-weight: 900;
}

.prompt-suggestion-card dd {
  margin: 0;
  color: #dbe7ff;
  font-size: 12px;
  line-height: 1.55;
}

.prompt-suggestion-card ul {
  margin: 10px 0 0 18px;
  padding: 0;
  color: #aebbd3;
  font-size: 11px;
  line-height: 1.6;
}

.suggestion-warning,
.prompt-optimization-error {
  margin: 10px 0 0;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.55;
}

.prompt-optimization-error {
  color: #fca5a5;
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

.shot-context-grid article > small {
  display: block;
  margin-top: 5px;
  color: #71809f;
  font-size: 10.5px;
  line-height: 1.55;
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

.prompt-toggle em {
  border: 1px solid rgba(34, 199, 169, 0.28);
  border-radius: 999px;
  padding: 1px 6px;
  color: #8df0dc;
  font-size: 10px;
  font-style: normal;
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

.prompt-preview-state,
.prompt-warning {
  margin: 0;
  color: #8a98b8;
  font-size: 12px;
  line-height: 1.6;
}

.prompt-preview-state.is-error,
.prompt-warning {
  color: #fbbf24;
}

.prompt-contract-note {
  border: 1px solid rgba(34, 199, 169, 0.24);
  border-radius: 6px;
  background: rgba(34, 199, 169, 0.08);
  padding: 8px 10px;
  color: #8df0dc;
  font-size: 11px;
  font-weight: 850;
}

.reference-plan {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(96, 165, 250, 0.18);
  border-radius: 6px;
  background: rgba(30, 64, 175, 0.08);
  padding: 10px;
}

.reference-plan-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.reference-plan-heading span {
  color: #bfdbfe;
  font-size: 11px;
  font-weight: 900;
}

.reference-plan-heading small {
  color: #71809f;
  font-size: 10px;
  text-align: right;
}

.reference-plan-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.reference-plan-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(96, 165, 250, 0.16);
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.36);
  padding: 4px 8px;
}

.reference-plan-item em {
  color: #93c5fd;
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
}

.reference-plan-item strong {
  color: #dbeafe;
  font-size: 10.5px;
}

.reference-plan-item small {
  color: #71809f;
  font-size: 9px;
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

.task-warning-list {
  display: grid;
  gap: 3px;
  margin: 0;
  padding-left: 18px;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.55;
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

.candidate-card.is-favorite {
  border-color: rgba(250, 204, 21, 0.42);
}

.candidate-card.is-historical-source:not(.is-locked) {
  border-style: dashed;
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

.generation-contract-tag {
  width: fit-content;
  border-radius: 4px;
  background: rgba(34, 199, 169, 0.1);
  padding: 2px 6px;
  color: #8df0dc;
  font-size: 10px;
  font-weight: 800;
}

.generation-contract-tag.is-legacy {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}

.source-history-tag {
  width: fit-content;
  border-radius: 4px;
  background: rgba(251, 146, 60, 0.13);
  padding: 2px 6px;
  color: #fdba74;
  font-size: 10px;
  font-weight: 850;
}

.candidate-preference-actions {
  display: flex;
  gap: 6px;
}

.icon-action {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 7px;
  background: rgba(2, 6, 23, 0.35);
  color: #cbd5e1;
}

.candidate-card.is-favorite .icon-action:first-child {
  color: #facc15;
}

.clear-final-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(251, 146, 60, 0.35);
  border-radius: 8px;
  background: rgba(251, 146, 60, 0.1);
  padding: 0 12px;
  color: #fdba74;
  font-size: 12px;
  font-weight: 850;
}

.candidate-operation-notice,
.candidate-operation-error,
.decision-conflict,
.decision-blocked,
.impact-warning {
  margin: 0 0 12px;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.55;
}

.candidate-operation-notice,
.decision-conflict {
  border: 1px solid rgba(34, 199, 169, 0.3);
  background: rgba(34, 199, 169, 0.09);
  color: #99f6e4;
}

.candidate-operation-error,
.decision-blocked {
  border: 1px solid rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.09);
  color: #fecaca;
}

.candidate-history-panel {
  margin-top: 14px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  padding: 14px;
}

.history-state {
  margin: 12px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.history-list {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.history-list li {
  display: grid;
  grid-template-columns: minmax(150px, auto) 1fr auto;
  gap: 10px;
  align-items: center;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  padding-top: 8px;
  color: #cbd5e1;
  font-size: 12px;
}

.history-list small {
  color: #64748b;
}

.history-more {
  margin-top: 12px;
  border: 0;
  background: transparent;
  color: #8df0dc;
  font-size: 12px;
  font-weight: 800;
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

.candidate-decision-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.82);
  backdrop-filter: blur(10px);
  padding: 24px;
}

.candidate-decision-modal {
  width: min(620px, 94vw);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  background: #111827;
  padding: 20px;
  color: #e5e7eb;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}

.candidate-decision-modal header,
.candidate-decision-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.candidate-decision-modal header span {
  color: #8df0dc;
  font-size: 11px;
  font-weight: 900;
}

.candidate-decision-modal h2 {
  margin: 4px 0 0;
  font-size: 20px;
}

.candidate-decision-modal header > button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: transparent;
  color: #cbd5e1;
}

.decision-summary {
  margin: 16px 0;
  color: #cbd5e1;
  line-height: 1.65;
}

.impact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.impact-grid div {
  display: grid;
  gap: 5px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.72);
  padding: 11px;
}

.impact-grid span {
  color: #94a3b8;
  font-size: 11px;
}

.impact-grid strong {
  font-size: 18px;
}

.impact-warning {
  margin-top: 12px;
  border: 1px solid rgba(251, 146, 60, 0.28);
  background: rgba(251, 146, 60, 0.09);
  color: #fed7aa;
}

.candidate-decision-modal footer {
  justify-content: flex-end;
  margin-top: 18px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.is-spinning {
  animation: spin 0.9s linear infinite;
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
