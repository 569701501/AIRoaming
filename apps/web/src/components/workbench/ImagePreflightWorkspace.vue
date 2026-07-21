<template>
  <section class="image-preflight-workspace" aria-label="出图准备">
    <header class="preflight-toolbar">
      <div class="chapter-picker">
        <ListChecks :size="18" />
        <select :value="currentChapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }} · {{ getChapterPreflightLabel(chapter) }}
          </option>
        </select>
        <span v-if="snapshot.project.storyTitle" class="story-title">{{ snapshot.project.storyTitle }}</span>
      </div>

      <div class="preflight-actions">
        <button class="secondary-action" type="button" @click="$emit('openCharacters')">
          <UsersRound :size="15" />
          <span>查看角色库</span>
        </button>
        <button class="primary-action" type="button" :disabled="!nextAction.enabled || loading" @click="runNextAction">
          <component :is="nextActionIcon" :size="15" />
          <span>{{ nextAction.buttonLabel }}</span>
        </button>
      </div>
    </header>

    <div v-if="versioningStatus" class="db-versioning-status" data-testid="preflight-db-versioning-status">
      <strong>DB Revision</strong>
      <span>{{ versioningStatus.label }}</span>
      <span v-if="versioningStatus.freshness">来源：{{ versioningStatus.freshness }}</span>
      <span v-if="versioningStatus.history">历史：可查看</span>
      <span v-if="versioningStatus.attention">门禁：{{ versioningStatus.attention }}</span>
    </div>

    <div v-if="!hasFormalStoryboard" class="preflight-empty">
      <Lock :size="22" />
      <h2>请先确认本章分镜</h2>
      <p>出图准备只读取正式 storyboard.json。待确认分镜不会进入候选图生成。</p>
    </div>

    <div v-else class="preflight-scroll">
      <!-- 出门前的检查单:只回答"还差几项就能出图" -->
      <section class="preflight-hero" :class="{ 'is-ready': pendingIssueCount === 0 }">
        <div>
          <span>{{ pendingIssueCount === 0 ? (isPreflightConfirmed ? "本章已可出图" : "全部就绪，可确认出图") : `还差 ${pendingIssueCount} 项就能出图` }}</span>
          <h2>{{ currentChapterTitle }} · {{ shots.length }} 镜</h2>
        </div>
        <p>出门前的检查单：确认该绑的绑了、该锁的锁了，全过后即可进入候选图。角色图生成/定稿在剧情结构页完成，这里只做检查。</p>
      </section>

      <!-- 全项检查清单:已完成✓、未完成⚠+提醒+入口 -->
      <section class="checklist-panel">
        <article v-for="item in checklist" :key="item.key" class="check-item" :class="`is-${item.status}`">
          <component :is="item.status === 'ok' ? CheckCircle2 : AlertCircle" :size="18" />
          <div class="check-body">
            <strong>{{ item.title }}</strong>
            <p>{{ item.description }}</p>
            <span v-if="item.hint" class="check-hint">{{ item.hint }}</span>
          </div>
          <button v-if="item.action" class="mini-action" type="button" :disabled="loading" @click="runAction(item.action)">
            {{ item.actionLabel }}
          </button>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, ArrowRight, CheckCircle2, ListChecks, Lock, UsersRound } from "lucide-vue-next";
import {
  getComicFormatLabel as getSharedComicFormatLabel,
  referenceKindSatisfiesRequirement,
  requiredCharacterReferenceKind,
} from "@airoaming/shared";
import type { ChapterListItem, GenerationTaskItem, ProjectCharacter, WorkbenchShot, WorkbenchSnapshot } from "@airoaming/shared";

type NextActionAction = "characters" | "confirm" | "candidates" | "wait" | "structure";

interface ChecklistItem {
  key: string;
  title: string;
  status: "ok" | "warn";
  description: string;
  action: NextActionAction | null;
  actionLabel: string | null;
  hint: string | null;
}

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  openCharacters: [];
  confirmPreflight: [chapterId: string];
  goCandidates: [];
  goStructure: [];
  selectChapter: [chapterId: string];
}>();

const chapters = computed(() => props.snapshot.chapters ?? []);
const currentChapter = computed(() => props.snapshot.currentChapter);
const currentChapterId = computed(() => currentChapter.value?.id ?? null);
const currentChapterTitle = computed(() => currentChapter.value?.title ?? "当前章节");
const preflightWorkflowStep = computed(() => props.snapshot.workflow.steps.find((item) => item.key === "image_preflight"));
const versioningStatus = computed(() => {
  if (props.snapshot.versioningCapability.mode !== "g2_db") return null;
  const step = preflightWorkflowStep.value;
  return {
    label: step?.status === "needs_confirmation" ? "待确认" : step?.status === "needs_update" ? "来源已变化" : step?.status === "done" ? "current" : "预览/Revision",
    freshness: step?.freshness ?? null,
    history: Boolean(step?.historyAvailable),
    attention: step?.attention ?? null,
  };
});
const hasFormalStoryboard = computed(() => Boolean(props.snapshot.storyboard && props.snapshot.storyboard.chapterId === currentChapterId.value));
const shots = computed(() => hasFormalStoryboard.value ? props.snapshot.shots : []);
const characterById = computed(() => new Map(props.snapshot.characters.map((character) => [character.id, character])));
const characterByName = computed(() => new Map(props.snapshot.characters.map((character) => [normalizeToken(character.name), character])));
const structureScenes = computed(() => props.snapshot.storyStructure?.structureJson.scenes ?? []);
const sceneById = computed(() => new Map(structureScenes.value.map((scene) => [scene.id, scene])));
const comicFormatLabel = computed(() => getComicFormatLabel(props.snapshot.project.comicFormat));
const artStyleLabel = computed(() => getArtStyleLabel(props.snapshot.project.artStyle));
const styleHasWarning = computed(() => props.snapshot.project.artStyle === "custom");

const shotTokenMatches = computed(() => {
  const matches = new Map<string, ProjectCharacter>();
  const unresolved = new Set<string>();

  for (const shot of shots.value) {
    for (const token of getShotCharacterTokens(shot)) {
      const character = characterById.value.get(token) ?? characterByName.value.get(normalizeToken(token));
      if (character) {
        matches.set(character.id, character);
        continue;
      }
      unresolved.add(token);
    }
  }

  return {
    matched: [...matches.values()],
    unresolved: [...unresolved.values()].sort(),
  };
});

const matchedCharacters = computed(() => shotTokenMatches.value.matched);
const unresolvedTokens = computed(() => shotTokenMatches.value.unresolved);
const appearanceCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const shot of shots.value) {
    const seenInShot = new Set<string>();
    for (const token of getShotCharacterTokens(shot)) {
      const character = characterById.value.get(token) ?? characterByName.value.get(normalizeToken(token));
      if (character) {
        seenInShot.add(character.id);
      }
    }
    for (const characterId of seenInShot) {
      counts.set(characterId, (counts.get(characterId) ?? 0) + 1);
    }
  }
  return counts;
});

const characterChecks = computed(() => matchedCharacters.value.map((character) => {
  const appearanceCount = appearanceCounts.value.get(character.id) ?? 0;
  const requirement = requiredCharacterReferenceKind(character);
  const required = requirement !== "none";
  const running = isReferenceTaskActive(character);
  const ready = referenceKindSatisfiesRequirement(requirement, getAvailableReferenceKind(character));
  const hasPreview = hasPreviewReference(character);
  const previewConfirmed = Boolean(character.previewReferenceAssetId);
  let nextStep = "";
  if (!ready && !running && required) {
    if (!hasPreview) {
      nextStep = "还没有视觉参考，在剧情结构页先生成";
    } else if (requirement === "preview_front") {
      nextStep = "已有单张参考，在剧情结构页点「采用参考」";
    } else if (!previewConfirmed) {
      nextStep = "已有角色图，在剧情结构页点「定稿」";
    } else {
      nextStep = "预览已确认，在剧情结构页完成三视图定稿";
    }
  }
  return {
    character,
    appearanceCount,
    required,
    ready,
    running,
    state: ready ? "ready" : running ? "running" : required ? "missing" : "optional",
    label: ready ? "已就绪" : running ? "准备中" : required ? "待补齐" : "无需图片",
    nextStep,
  };
}));

const missingRequiredReferences = computed(() =>
  characterChecks.value.filter((item) => item.required && !item.ready && !item.running),
);
const runningReferenceTasks = computed(() => characterChecks.value.filter((item) => item.running));
const missingSceneReferences = computed(() => shots.value
  .map((shot) => {
    const sceneId = shot.sceneId?.trim();
    if (!sceneId) {
      return {
        shotId: shot.id,
        label: `镜头 ${shot.order} 未绑定场景`,
      };
    }
    if (!sceneById.value.has(sceneId)) {
      return {
        shotId: shot.id,
        label: `镜头 ${shot.order} 的场景「${sceneId}」不在本章结构场景卡中`,
      };
    }
    return null;
  })
  .filter((item): item is { shotId: string; label: string } => Boolean(item)));
/** 本章被镜头引用、但还没生成参考图(场景背景图)的场景集合。仅提示,不阻塞出图。 */
const scenesWithoutReference = computed(() => {
  const usedSceneIds = new Set<string>();
  for (const shot of shots.value) {
    const sceneId = shot.sceneId?.trim();
    if (sceneId && sceneById.value.has(sceneId)) {
      usedSceneIds.add(sceneId);
    }
  }
  return [...usedSceneIds]
    .map((sceneId) => {
      const scene = sceneById.value.get(sceneId);
      return scene && !scene.referenceAssetId ? { sceneId, name: scene.name || sceneId } : null;
    })
    .filter((item): item is { sceneId: string; name: string } => Boolean(item));
});
const isPreflightConfirmed = computed(() => {
  const preflight = props.snapshot.imagePreflight;
  const storyboard = props.snapshot.storyboard;
  const isDatabaseMode = props.snapshot.versioningCapability.mode === "g2_db";
  return Boolean(
    preflight
    && storyboard
    && preflight.chapterId === currentChapterId.value
    && preflight.preflightJson.ready
    && preflight.sourceStoryboardId === storyboard.id
    && (isDatabaseMode
      ? preflightWorkflowStep.value?.freshness === "current"
      : preflight.sourceStoryboardUpdatedAt === storyboard.updatedAt),
  );
});

/** 阻塞出图的未完成项数(画风 custom 不阻塞,不计入)。 */
const pendingIssueCount = computed(() => {
  let count = 0;
  if (unresolvedTokens.value.length > 0) count++;
  if (missingRequiredReferences.value.length > 0) count++;
  if (runningReferenceTasks.value.length > 0) count++;
  if (missingSceneReferences.value.length > 0) count++;
  return count;
});

const canPassChecks = computed(() =>
  hasFormalStoryboard.value
  && unresolvedTokens.value.length === 0
  && missingRequiredReferences.value.length === 0
  && runningReferenceTasks.value.length === 0
  && missingSceneReferences.value.length === 0,
);
const canConfirmPreflight = computed(() => canPassChecks.value && !isPreflightConfirmed.value);
const canEnterCandidates = computed(() => canPassChecks.value && isPreflightConfirmed.value);

const nextAction = computed(() => {
  if (!hasFormalStoryboard.value) {
    return { action: "wait", tone: "waiting", buttonLabel: "等待分镜确认", enabled: false } as const;
  }
  if (canEnterCandidates.value) {
    return { action: "candidates", tone: "done", buttonLabel: "进入候选图", enabled: true } as const;
  }
  if (canConfirmPreflight.value) {
    return { action: "confirm", tone: "ready", buttonLabel: "确认出图准备", enabled: true } as const;
  }
  return { action: "wait", tone: "blocked", buttonLabel: `还差 ${pendingIssueCount.value} 项`, enabled: false } as const;
});
const nextActionIcon = computed(() => {
  switch (nextAction.value.action) {
    case "confirm":
      return CheckCircle2;
    case "candidates":
      return ArrowRight;
    default:
      return Lock;
  }
});

const checklist = computed<ChecklistItem[]>(() => [
  {
    key: "storyboard",
    title: "正式分镜",
    status: hasFormalStoryboard.value ? "ok" : "warn",
    description: hasFormalStoryboard.value ? "当前章节已存在正式 storyboard.json。" : "需要先在分镜工作台确认分镜。",
    action: null,
    actionLabel: null,
    hint: null,
  },
  {
    key: "binding",
    title: "角色绑定",
    status: unresolvedTokens.value.length === 0 ? "ok" : "warn",
    description: unresolvedTokens.value.length === 0
      ? "镜头中的角色已能匹配项目角色库。"
      : `还有 ${unresolvedTokens.value.length} 个出镜名称未匹配项目角色库。`,
    action: null,
    actionLabel: null,
    hint: unresolvedTokens.value.length > 0 ? "请回分镜工作台修正角色名或重新生成分镜" : null,
  },
  {
    key: "references",
    title: "角色素材",
    status: missingRequiredReferences.value.length === 0 && runningReferenceTasks.value.length === 0 ? "ok" : "warn",
    description: missingRequiredReferences.value.length > 0
      ? `还有 ${missingRequiredReferences.value.length} 个本章出镜主体缺少既定视觉素材。`
      : runningReferenceTasks.value.length > 0
        ? `还有 ${runningReferenceTasks.value.length} 个主体正在准备视觉参考。`
        : "本章出镜主体都已满足剧情结构阶段确定的素材要求。",
    action: missingRequiredReferences.value.length > 0 ? "structure" : null,
    actionLabel: missingRequiredReferences.value.length > 0 ? "去剧情结构" : null,
    hint: missingRequiredReferences.value.length > 0
      ? missingRequiredReferences.value.map((item) => `「${item.character.name}」${item.nextStep ? `：${item.nextStep}` : ""}`).join("；")
      : null,
  },
  {
    key: "scenes",
    title: "场景绑定",
    status: missingSceneReferences.value.length === 0 ? "ok" : "warn",
    description: missingSceneReferences.value.length === 0
      ? "镜头已绑定到本章剧情结构场景卡。"
      : `还有 ${missingSceneReferences.value.length} 个镜头缺少有效场景绑定。`,
    action: null,
    actionLabel: null,
    hint: missingSceneReferences.value.length > 0 ? "请回分镜工作台补齐镜头 sceneId" : null,
  },
  {
    key: "sceneReferences",
    title: "场景参考图",
    status: scenesWithoutReference.value.length === 0 ? "ok" : "warn",
    description: scenesWithoutReference.value.length === 0
      ? "本章用到的场景均已生成参考图。"
      : `还有 ${scenesWithoutReference.value.length} 个场景没有参考图，不阻塞出图，但建议补充。`,
    action: null,
    actionLabel: null,
    hint: scenesWithoutReference.value.length > 0 ? `缺图场景：${scenesWithoutReference.value.map((item) => item.name).join("、")}。可在剧情结构页生成` : null,
  },
  {
    key: "style",
    title: "画风上下文",
    status: styleHasWarning.value ? "warn" : "ok",
    description: styleHasWarning.value
      ? "当前使用自定义画风，可继续确认；后续建议补充更明确的画风参考。"
      : `将按「${comicFormatLabel.value} / ${artStyleLabel.value}」生成候选图上下文。`,
    action: null,
    actionLabel: null,
    hint: null,
  },
]);

function selectChapter(event: Event) {
  const chapterId = (event.target as HTMLSelectElement).value;
  if (chapterId) {
    emit("selectChapter", chapterId);
  }
}

function confirmPreflight() {
  if (currentChapterId.value && canConfirmPreflight.value) {
    emit("confirmPreflight", currentChapterId.value);
  }
}

function runAction(action: NextActionAction | null | undefined) {
  if (!action) {
    return;
  }
  switch (action) {
    case "characters":
      emit("openCharacters");
      return;
    case "structure":
      emit("goStructure");
      return;
    case "confirm":
      confirmPreflight();
      return;
    case "candidates":
      emit("goCandidates");
      return;
    default:
      return;
  }
}

function runNextAction() {
  runAction(nextAction.value.action);
}

function getChapterPreflightLabel(chapter: ChapterListItem) {
  if (chapter.storyboardStatus === "storyboard_done" || chapter.status === "storyboard_done" || chapter.status === "images_done" || chapter.status === "layout_done" || chapter.status === "exported") {
    return "可检查";
  }
  if (chapter.storyboardStatus === "pending_confirmation") {
    return "待确认分镜";
  }
  return "需分镜";
}

function getShotCharacterTokens(shot: WorkbenchShot) {
  const tokens = shot.characterIds
    .map((item) => item.trim())
    .filter((item) => item && !/^(无|无人|旁白|环境|背景)$/i.test(item));
  return [...new Set(tokens)];
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function hasFinalReference(character: ProjectCharacter) {
  return Boolean(character.primaryReferenceAssetId && character.primaryReferenceKind === "final_reference");
}

function getAvailableReferenceKind(character: ProjectCharacter) {
  if (hasFinalReference(character)) return "final_reference" as const;
  if (character.previewReferenceAssetId) return "preview_front" as const;
  return "none" as const;
}

/** 角色是否已生成预览图(preview_front)资产。用于区分待锁定角色卡在"缺角色图"还是"缺定稿"。 */
function hasPreviewReference(character: ProjectCharacter): boolean {
  if (character.previewReferenceAssetId) return true;
  if (!character.referenceAssetIds || character.referenceAssetIds.length === 0) {
    return false;
  }
  const ids = new Set(character.referenceAssetIds);
  return (props.snapshot.assets ?? []).some((asset) => {
    if (!ids.has(asset.id)) {
      return false;
    }
    try {
      const meta = JSON.parse(asset.meta) as { referenceKind?: unknown };
      return meta.referenceKind === "single_front" || meta.referenceKind === "preview_front";
    } catch {
      return false;
    }
  });
}

function isReferenceTaskActive(character: ProjectCharacter) {
  const requirement = requiredCharacterReferenceKind(character);
  if (requirement === "none") return false;
  return props.tasks.some((task) =>
    task.projectId === props.snapshot.project.id
    && task.type === "character_reference_generate"
    && task.target?.type === "character"
    && task.target.id === character.id
    && (task.input.referenceKind === "preview_front" || (requirement === "final_reference" && task.input.referenceKind === "final_reference"))
    && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
  );
}

function getComicFormatLabel(format: WorkbenchSnapshot["project"]["comicFormat"]) {
  return getSharedComicFormatLabel(format);
}

function getArtStyleLabel(style: WorkbenchSnapshot["project"]["artStyle"]) {
  const labels: Record<WorkbenchSnapshot["project"]["artStyle"], string> = {
    dark_realistic: "暗黑写实漫画",
    semi_realistic: "半写实漫画",
    japanese_realistic: "日系写实漫画",
    comic_style: "漫画风格",
    cyberpunk: "赛博朋克漫画",
    custom: "自定义画风",
  };
  return labels[style];
}
</script>

<style scoped>
.image-preflight-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 14px;
  overflow: hidden;
}

.preflight-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.64);
  padding: 12px 14px;
}

.chapter-picker {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.chapter-picker svg {
  color: #a78bfa;
  flex: 0 0 auto;
}

.chapter-picker select {
  min-width: 240px;
  max-width: 420px;
  height: 36px;
  border: 1px solid rgba(116, 95, 255, 0.24);
  border-radius: 8px;
  background: rgba(8, 13, 26, 0.92);
  color: #f8fbff;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 800;
}

.story-title {
  min-width: 0;
  max-width: 260px;
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preflight-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 900;
}

.primary-action {
  border: 1px solid rgba(34, 199, 169, 0.34);
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.secondary-action {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.72);
  color: #dbe7ff;
}

.preflight-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 360px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
  color: #95a3c2;
  text-align: center;
}

.preflight-empty svg {
  color: #a78bfa;
}

.preflight-empty h2,
.preflight-empty p {
  margin: 0;
}

.preflight-empty h2 {
  color: #f8fbff;
  font-size: 18px;
}

.preflight-empty p {
  max-width: 480px;
  font-size: 13px;
  line-height: 1.7;
}

.preflight-scroll {
  display: grid;
  min-height: 0;
  overflow: auto;
  gap: 12px;
  padding-right: 4px;
}

.preflight-hero,
.checklist-panel {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
}

.preflight-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
}

.preflight-hero.is-ready {
  border-color: rgba(34, 199, 169, 0.26);
  background: rgba(11, 42, 38, 0.4);
}

.preflight-hero span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.preflight-hero h2 {
  margin: 4px 0 0;
  color: #f8fbff;
  font-size: 20px;
}

.preflight-hero p {
  max-width: 520px;
  margin: 0;
  color: #95a3c2;
  font-size: 13px;
  line-height: 1.7;
}

.checklist-panel {
  display: grid;
  gap: 1px;
  overflow: hidden;
}

.check-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.025);
}

.check-item.is-ok svg {
  color: #22c7a9;
}

.check-item.is-warn svg {
  color: #f59e0b;
}

.check-body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.check-item strong {
  display: block;
  color: #f8fbff;
  font-size: 14px;
}

.check-item p {
  margin: 0;
  color: #95a3c2;
  font-size: 13px;
  line-height: 1.6;
}

.check-hint {
  color: #fbbf24;
  font-size: 12px;
  font-weight: 800;
}

.mini-action {
  min-height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.76);
  color: #dbe7ff;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 900;
}

.mini-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 980px) {
  .preflight-toolbar,
  .preflight-hero {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
