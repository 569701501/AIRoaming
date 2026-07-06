<template>
  <section class="image-candidates-workspace" aria-label="候选图工作台">
    <header class="candidates-toolbar">
      <div class="chapter-picker">
        <ImageIcon :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getChapterCandidatesLabel(chapter) }}
          </option>
        </select>
        <span v-if="snapshot.project.storyTitle" class="story-title">{{ snapshot.project.storyTitle }}</span>
      </div>

      <div class="candidates-actions">
        <button 
          class="primary-action" 
          type="button" 
          :disabled="!canConfirm || loading" 
          @click="confirmCandidates"
        >
          <Check :size="15" />
          <span>{{ confirmButtonLabel }}</span>
        </button>
      </div>
    </header>

    <div v-if="!candidatesData" class="candidates-empty">
      <Lock :size="22" />
      <h2>请先确认出图准备</h2>
      <p>候选图工作台需要先完成分镜和出图准备。</p>
    </div>

    <div v-else-if="!storyboardInSync" class="candidates-warning">
      <AlertTriangle :size="20" />
      <h2>分镜已更新</h2>
      <p>当前候选图基于旧分镜，建议回退章节状态重新确认分镜后再生成候选图。</p>
    </div>

    <div v-else class="candidates-scroll">
      <section class="candidates-hero" :class="{ 'is-ready': pendingShotCount === 0 }">
        <div>
          <span>{{ pendingShotCount === 0 ? "全部分镜已处理，可确认完成" : `还有 ${pendingShotCount} 个分镜待处理` }}</span>
          <h2>{{ currentChapterTitle }} · {{ shots.length }} 镜</h2>
        </div>
        <p>为每个分镜生成候选图并锁定最佳效果，或标记跳过。全部处理完毕后点击「完成候选图」推进到下一阶段。</p>
      </section>

      <section class="shots-grid">
        <article 
          v-for="shot in shots" 
          :key="shot.id" 
          class="shot-card" 
          :class="`is-${getShotDecision(shot.id)}`"
        >
          <header class="shot-header">
            <div class="shot-info">
              <strong>镜{{ shot.order }}</strong>
              <span v-if="shot.sceneName" class="shot-type">{{ shot.sceneName }}</span>
            </div>
            <div class="shot-decision-badge">
              {{ getDecisionLabel(getShotDecision(shot.id)) }}
            </div>
          </header>

          <div class="shot-body">
            <p class="shot-description">{{ shot.coreAction }}</p>
            
            <div class="shot-candidates">
              <div 
                v-for="candidate in getShotCandidates(shot.id)" 
                :key="candidate.id"
                class="candidate-item"
                :class="{ 'is-locked': isLockedCandidate(shot.id, candidate.id), 'is-discarded': candidate.status === 'discarded' }"
              >
                <img :src="getCandidateImageUrl(candidate.assetPath)" :alt="`候选图 ${candidate.id}`" />
                <div class="candidate-actions">
                  <button 
                    v-if="candidate.status === 'generated'" 
                    type="button" 
                    :disabled="loading"
                    @click="lockCandidate(shot.id, candidate.id)"
                  >
                    <Check :size="14" />
                  </button>
                  <button 
                    v-if="candidate.status === 'generated'" 
                    type="button" 
                    :disabled="loading"
                    @click="discardCandidate(shot.id, candidate.id)"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>
            </div>

            <div class="shot-controls">
              <button 
                class="generate-btn" 
                type="button" 
                :disabled="loading || hasActiveTask(shot.id)"
                @click="generateCandidates(shot.id)"
              >
                <Sparkles :size="14" />
                <span>{{ hasActiveTask(shot.id) ? '生成中...' : '生成候选图' }}</span>
              </button>
              
              <button 
                v-if="getShotDecision(shot.id) !== 'skipped'"
                class="skip-btn" 
                type="button" 
                :disabled="loading"
                @click="skipShot(shot.id)"
              >
                跳过
              </button>
              
              <button 
                v-if="getShotDecision(shot.id) !== 'pending'"
                class="reset-btn" 
                type="button" 
                :disabled="loading"
                @click="resetDecision(shot.id)"
              >
                重置
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Check, ImageIcon, Lock, Sparkles, X } from "lucide-vue-next";
import type { 
  ChapterListItem, 
  ChapterCandidates,
  ChapterCandidateShotEntry,
  ChapterCandidateItem,
  CandidateShotDecision,
  GenerationTaskItem, 
  WorkbenchShot, 
  WorkbenchSnapshot 
} from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
  candidatesData: ChapterCandidates | null;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  generateShot: [shotId: string];
  lockCandidate: [shotId: string, candidateId: string];
  skipShot: [shotId: string];
  resetDecision: [shotId: string];
  discardCandidate: [shotId: string, candidateId: string];
  confirmCandidates: [];
}>();

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const currentChapterTitle = computed(() => currentChapter.value?.title ?? "当前章节");
const shots = computed(() => props.snapshot.shots);
const storyboardInSync = computed(() => props.candidatesData?.storyboardInSync ?? true);

const pendingShotCount = computed(() => {
  if (!props.candidatesData) return shots.value.length;
  return shots.value.filter(shot => getShotDecision(shot.id) === "pending").length;
});

const canConfirm = computed(() => {
  return props.candidatesData && pendingShotCount.value === 0 && storyboardInSync.value;
});

const confirmButtonLabel = computed(() => {
  if (pendingShotCount.value > 0) return `还有 ${pendingShotCount.value} 镜待处理`;
  return "完成候选图";
});

function getShotDecision(shotId: string): CandidateShotDecision {
  const entry = props.candidatesData?.candidatesJson.shots.find(s => s.shotId === shotId);
  return entry?.decision ?? "pending";
}

function getShotCandidates(shotId: string): ChapterCandidateItem[] {
  const entry = props.candidatesData?.candidatesJson.shots.find(s => s.shotId === shotId);
  return entry?.candidates ?? [];
}

function isLockedCandidate(shotId: string, candidateId: string): boolean {
  const entry = props.candidatesData?.candidatesJson.shots.find(s => s.shotId === shotId);
  return entry?.lockedCandidateId === candidateId;
}

function hasActiveTask(shotId: string): boolean {
  return props.tasks.some(task => 
    task.type === "image_generate" &&
    task.target?.type === "shot" &&
    task.target.id === shotId &&
    (task.status === "queued" || task.status === "running")
  );
}

function getCandidateImageUrl(assetPath: string): string {
  // 候选图通过 assetId 走受控 file 路由（projects.controller getProjectAssetFile）。
  const asset = props.snapshot.assets.find((item) => item.path === assetPath);
  if (asset) {
    return api.projectAssetFileUrl(props.snapshot.project.id, asset.id);
  }
  // 兑底：直接拼 workspace 静态路径（仅当存在静态映射时生效）。
  return `/workspace/${assetPath}`;
}

function getChapterCandidatesLabel(chapter: ChapterListItem): string {
  if (chapter.status === "images_done") return "已完成";
  if (chapter.status === "storyboard_done") return "待生成";
  return "未就绪";
}

function getDecisionLabel(decision: CandidateShotDecision): string {
  const labels: Record<CandidateShotDecision, string> = {
    pending: "待处理",
    locked: "已锁定",
    skipped: "已跳过",
  };
  return labels[decision];
}

function selectChapter(event: Event) {
  const target = event.target as HTMLSelectElement;
  if (target.value) {
    emit("selectChapter", target.value);
  }
}

function generateCandidates(shotId: string) {
  emit("generateShot", shotId);
}

function lockCandidate(shotId: string, candidateId: string) {
  emit("lockCandidate", shotId, candidateId);
}

function skipShot(shotId: string) {
  emit("skipShot", shotId);
}

function resetDecision(shotId: string) {
  emit("resetDecision", shotId);
}

function discardCandidate(shotId: string, candidateId: string) {
  emit("discardCandidate", shotId, candidateId);
}

function confirmCandidates() {
  emit("confirmCandidates");
}
</script>

<style scoped>
.image-candidates-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(135deg, #0f1420 0%, #1a1f2e 100%);
}

.candidates-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(26, 31, 46, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.chapter-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.9);
}

.chapter-picker select {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.story-title {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.candidates-actions {
  display: flex;
  gap: 8px;
}

.primary-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-action:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.primary-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.candidates-empty,
.candidates-warning {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
}

.candidates-warning {
  color: #f59e0b;
}

.candidates-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.candidates-hero {
  padding: 20px;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
}

.candidates-hero.is-ready {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
}

.candidates-hero h2 {
  margin: 8px 0;
  font-size: 20px;
  color: white;
}

.candidates-hero p {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}

.shots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
}

.shot-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
}

.shot-card.is-locked {
  border-color: rgba(34, 197, 94, 0.5);
}

.shot-card.is-skipped {
  opacity: 0.6;
  border-color: rgba(156, 163, 175, 0.3);
}

.shot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.shot-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
}

.shot-type {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.shot-decision-badge {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.shot-body {
  padding: 12px;
}

.shot-description {
  margin: 0 0 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  line-height: 1.5;
}

.shot-candidates {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
}

.candidate-item {
  position: relative;
  flex-shrink: 0;
  width: 160px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.candidate-item.is-locked {
  border-color: rgba(34, 197, 94, 0.8);
}

.candidate-item.is-discarded {
  opacity: 0.3;
}

.candidate-item img {
  width: 100%;
  height: auto;
  display: block;
}

.candidate-actions {
  position: absolute;
  bottom: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
}

.candidate-actions button {
  padding: 6px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.candidate-actions button:hover {
  background: rgba(0, 0, 0, 0.9);
}

.shot-controls {
  display: flex;
  gap: 8px;
}

.shot-controls button {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.generate-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: transparent;
}

.shot-controls button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.shot-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
