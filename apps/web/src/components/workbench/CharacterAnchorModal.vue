<template>
  <Teleport to="body">
    <div v-if="open" class="anchor-backdrop" role="presentation" @click.self="handleBackdropClose">
      <section class="anchor-panel" role="dialog" aria-modal="true" aria-labelledby="anchor-title">
        <button class="anchor-close" type="button" aria-label="关闭定妆弹窗" :disabled="busy" @click="close">
          <X :size="18" />
        </button>

        <header class="anchor-header">
          <span>角色定妆</span>
          <h2 id="anchor-title">{{ characterName }} 定妆选择</h2>
          <p>点击候选图选中，双击或点击「确认定妆」完成定妆。</p>
        </header>

        <p v-if="error && candidates.length > 0" class="anchor-error-banner" role="alert">
          <AlertCircle :size="14" />
          <span>{{ error }}</span>
        </p>

        <!-- 生成中:骨架屏 -->
        <div v-if="generating" class="anchor-grid" aria-busy="true">
          <div v-for="index in CANDIDATE_COUNT" :key="index" class="anchor-skeleton" />
        </div>

        <!-- 无候选图:错误/空状态 -->
        <div v-else-if="candidates.length === 0" class="anchor-empty" role="alert">
          <AlertCircle :size="20" />
          <p>{{ error ?? "没有可用的候选图。" }}</p>
          <button class="anchor-retry" type="button" @click="loadCandidates">重试生成</button>
        </div>

        <!-- 候选图 grid -->
        <div v-else class="anchor-grid">
          <button
            v-for="(candidate, index) in candidates"
            :key="candidate.id"
            class="anchor-card"
            :class="{ 'is-selected': selectedAssetId === candidate.id }"
            type="button"
            :disabled="busy"
            @click="selectCandidate(candidate.id)"
            @dblclick="confirmWith(candidate.id)"
          >
            <img :src="candidateUrl(candidate)" :alt="`${characterName} 定妆候选 ${index + 1}`" />
            <span class="anchor-card-index">{{ index + 1 }}</span>
            <span v-if="selectedAssetId === candidate.id" class="anchor-card-check">
              <Check :size="16" />
            </span>
          </button>
        </div>

        <footer class="anchor-actions">
          <button class="anchor-secondary" type="button" :disabled="generating || confirming" @click="loadCandidates">
            <RefreshCw :size="14" :class="{ 'is-spinning': generating }" />
            <span>{{ generating ? "生成中..." : "重新生成" }}</span>
          </button>
          <button class="anchor-secondary" type="button" :disabled="busy" @click="close">取消</button>
          <button
            class="anchor-primary"
            type="button"
            :disabled="!selectedAssetId || busy"
            @click="confirmWith(selectedAssetId!)"
          >
            <Check :size="14" />
            <span>{{ confirming ? "确认中..." : "确认定妆" }}</span>
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertCircle, Check, RefreshCw, X } from "lucide-vue-next";
import type { ProjectCharacter, WorkbenchAsset } from "@airoaming/shared";
import { api } from "../../services/api";

const props = defineProps<{
  open: boolean;
  projectId: string;
  character: ProjectCharacter | null;
}>();

const emit = defineEmits<{
  close: [];
  confirmAnchor: [payload: { characterId: string; assetId: string; character: ProjectCharacter }];
}>();

const CANDIDATE_COUNT = 3;

const candidates = ref<WorkbenchAsset[]>([]);
const generating = ref(false);
const confirming = ref(false);
const selectedAssetId = ref<string | null>(null);
const error = ref<string | null>(null);

const characterName = computed(() => props.character?.name ?? "角色");
const busy = computed(() => generating.value || confirming.value);

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadCandidates();
    } else {
      // 关闭时清空状态,下次打开重新生成
      candidates.value = [];
      selectedAssetId.value = null;
      confirming.value = false;
      error.value = null;
    }
  },
);

async function loadCandidates() {
  if (!props.character) {
    return;
  }
  generating.value = true;
  error.value = null;
  selectedAssetId.value = null;
  try {
    const result = await api.generateAnchorCandidates(props.projectId, props.character.id, {
      count: CANDIDATE_COUNT,
    });
    candidates.value = result.candidates;
    if (candidates.value.length === 0) {
      error.value = "没有生成到候选图，请稍后重试。";
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "生成候选图失败，请重试。";
    candidates.value = [];
  } finally {
    generating.value = false;
  }
}

function selectCandidate(assetId: string) {
  if (!busy.value) {
    selectedAssetId.value = assetId;
  }
}

async function confirmWith(assetId: string) {
  if (!props.character || busy.value) {
    return;
  }
  confirming.value = true;
  error.value = null;
  try {
    const result = await api.confirmAnchor(props.projectId, props.character.id, { assetId });
    emit("confirmAnchor", {
      characterId: props.character.id,
      assetId,
      character: result.character,
    });
    close();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "确认定妆失败，请重试。";
  } finally {
    confirming.value = false;
  }
}

function close() {
  if (!busy.value) {
    emit("close");
  }
}

function handleBackdropClose() {
  if (!busy.value) {
    emit("close");
  }
}

function candidateUrl(candidate: WorkbenchAsset) {
  return api.projectAssetFileUrl(props.projectId, candidate.id);
}
</script>

<style scoped>
.anchor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(14px);
  padding: 20px;
}

.anchor-panel {
  display: grid;
  gap: 16px;
  width: min(880px, 96vw);
  max-height: min(88vh, 860px);
  min-height: 0;
  border: 1px solid rgba(34, 199, 169, 0.28);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.97), rgba(7, 12, 24, 0.99)),
    #0f172a;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  padding: 22px;
  color: #eef2ff;
  overflow-y: auto;
}

.anchor-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, color 0.18s;
}

.anchor-close:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.anchor-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.anchor-header {
  display: grid;
  gap: 6px;
  padding-right: 40px;
}

.anchor-header span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.anchor-header h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 19px;
  font-weight: 900;
}

.anchor-header p {
  margin: 0;
  color: #9aa8c7;
  font-size: 12px;
  line-height: 1.6;
}

.anchor-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
}

.anchor-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  min-height: 0;
}

.anchor-card {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  border: 2px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.6);
  padding: 0;
  cursor: pointer;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}

.anchor-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.anchor-card:hover {
  border-color: rgba(34, 199, 169, 0.55);
  box-shadow: 0 8px 26px rgba(34, 199, 169, 0.16);
  transform: translateY(-1px);
}

.anchor-card.is-selected {
  border-color: #22c7a9;
  box-shadow: 0 0 0 3px rgba(34, 199, 169, 0.28), 0 10px 30px rgba(34, 199, 169, 0.2);
}

.anchor-card:disabled {
  cursor: not-allowed;
}

.anchor-card-index {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.72);
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 900;
}

.anchor-card-check {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 999px;
  background: #22c7a9;
  color: #03221c;
}

/* 骨架屏 */
.anchor-skeleton {
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 12px;
  background:
    linear-gradient(100deg, rgba(30, 41, 59, 0.5) 30%, rgba(51, 65, 85, 0.7) 50%, rgba(30, 41, 59, 0.5) 70%);
  background-size: 240% 100%;
  animation: anchor-shimmer 1.3s ease-in-out infinite;
}

@keyframes anchor-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.anchor-empty {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 240px;
  border: 1px dashed rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.4);
  color: #94a3b8;
  text-align: center;
  padding: 24px;
}

.anchor-empty p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.anchor-retry {
  border: 1px solid rgba(34, 199, 169, 0.4);
  border-radius: 8px;
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.anchor-retry:hover {
  background: rgba(34, 199, 169, 0.2);
}

.anchor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 2px;
}

.anchor-secondary,
.anchor-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s, border-color 0.18s, background 0.18s, color 0.18s;
}

.anchor-secondary {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
}

.anchor-secondary:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.anchor-primary {
  border: 1px solid rgba(34, 199, 169, 0.4);
  background: linear-gradient(135deg, #22c7a9, #0ea5a4);
  color: #03221c;
  box-shadow: 0 10px 24px rgba(34, 199, 169, 0.24);
}

.anchor-primary:hover {
  transform: translateY(-1px);
}

.anchor-secondary:disabled,
.anchor-primary:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.is-spinning {
  animation: anchor-spin 0.9s linear infinite;
}

@keyframes anchor-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .anchor-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .anchor-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
