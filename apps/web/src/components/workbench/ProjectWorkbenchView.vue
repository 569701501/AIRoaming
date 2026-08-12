<template>
  <main class="project-workbench">
    <WorkbenchStageRail
      :active-step-key="activeStepKey"
      :stages="snapshot.stages"
      @select-step="$emit('selectStep', $event)"
    />

    <section class="workbench-content" :class="{ 'is-layout-step': isLayoutStep, 'is-dialogue-collapsed': !isLayoutStep && dialogueCollapsed }" :aria-label="`${currentStageLabel}工作区`">
      <ProjectDialoguePanel
        v-if="!isLayoutStep && !dialogueCollapsed"
        :active-dialogue-model="workbench.selectedDialogueModel"
        :active-step-key="activeStepKey"
        :dialogue-error="dialogueError"
        :dialogue-models="dialogueModels"
        :dialogue-notice="dialogueNotice"
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :runtime-model-error="runtimeModelError"
        :snapshot="snapshot"
        :step-label="currentStageLabel"
        @send="emitDialogue"
        @retry-import-item="$emit('retryImportItem', $event)"
        @select-dialogue-model="$emit('selectDialogueModel', $event)"
        @collapse="workbench.toggleDialogueCollapsed(activeStepKey)"
      />
      <button
        v-else-if="!isLayoutStep"
        class="dialogue-expand-rail"
        type="button"
        title="展开 AI 对话"
        @click="workbench.toggleDialogueCollapsed(activeStepKey)"
      >
        <Sparkles :size="16" />
        <ChevronsRight :size="13" />
      </button>

      <template v-if="isScriptStep">
        <div class="script-middle-column">
          <ScriptChapterList
            :chapters="chapterItems"
            :current-chapter-id="currentChapterId"
            :story-title="snapshot.project.storyTitle"
            @select="$emit('selectChapter', $event)"
          />
          <div v-if="activeCompletionPrompt" class="chapter-next-actions">
            <div>
              <span>本章剧本已完成</span>
              <strong>{{ activeCompletionPrompt.completedChapterTitle }}</strong>
            </div>
            <div class="chapter-next-buttons">
              <button class="primary-next" type="button" @click="enterCompletedChapterStructure">
                {{ completionPrimaryActionLabel }}
              </button>
            </div>
          </div>
          <ScriptDocumentEditor
            :loading="loading"
            :script-working-copy="scriptWorkingCopy"
            :snapshot="snapshot"
            @save-draft="emitChapterDraft"
            @complete-chapter="emitCompleteChapter"
            @reset-script="$emit('resetScript')"
            @confirm-pending-source="emitConfirmPendingSource"
            @discard-pending-source="emitDiscardPendingSource"
            @update-source-text="scriptDraft = $event"
          />
        </div>
      </template>

      <StoryStructureWorkspace
        v-else-if="isStructureStep"
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @select-chapter="$emit('selectChapter', $event)"
        @generate-structure="emitGenerateStructure"
        @confirm-structure="$emit('confirmStoryStructure', $event)"
        @update-structure="$emit('updateStoryStructure', $event)"
        @regenerate-character-reference="$emit('regenerateCharacterReference', $event)"
        @confirm-character-preview="$emit('confirmCharacterPreview', $event)"
        @confirm-character-reference="$emit('confirmCharacterReference', $event)"
        @confirm-anchor="$emit('confirmAnchor', $event)"
        @generate-scene-reference="$emit('generateSceneReference', $event)"
        @go-storyboard="$emit('selectStep', 'storyboard')"
      />

      <ProjectCharactersWorkspace
        v-else-if="isCharactersStep"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @extract-characters="$emit('extractCharacters')"
      />

      <StoryboardWorkspace
        v-else-if="isStoryboardStep"
        :dialogue-sending="dialogueSending"
        :dialogue-thread="dialogueThread"
        :loading="loading"
        :snapshot="snapshot"
        @select-chapter="$emit('selectChapter', $event)"
        @generate-storyboard="emitGenerateStoryboard"
        @confirm-storyboard="$emit('confirmStoryboard', $event)"
        @update-storyboard="$emit('updateStoryboard', $event)"
        @save-pending-storyboard="$emit('savePendingStoryboard', $event)"
        @go-preflight="$emit('selectStep', 'image_preflight')"
      />

      <ImagePreflightWorkspace
        v-else-if="isPreflightStep"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @select-chapter="$emit('selectChapter', $event)"
        @open-characters="$emit('openCharacters')"
        @confirm-preflight="$emit('confirmImagePreflight', $event)"
        @go-candidates="$emit('selectStep', 'image_candidates')"
        @go-structure="$emit('selectStep', 'story_structure')"
      />

      <ImageCandidatesWorkspace
        v-else-if="isCandidatesStep"
        :loading="loading"
        :snapshot="snapshot"
        :tasks="tasks"
        @select-chapter="$emit('selectChapter', $event)"
        @generate-candidates="$emit('generateImageCandidates', $event)"
        @optimize-prompt="$emit('optimizeShotPrompt', $event)"
        @generate-all-unlocked="$emit('generateAllUnlocked', $event)"
        @candidate-changed="$emit('candidateChanged')"
        @complete-images="$emit('completeImages')"
        @go-preflight="$emit('selectStep', 'image_preflight')"
      />

      <LayoutExportWorkspace
        v-else-if="isLayoutStep"
        :loading="loading"
        :snapshot="snapshot"
        @select-chapter="$emit('selectChapter', $event)"
        @go-candidates="$emit('selectStep', 'image_candidates')"
      />

      <AssetPackageWorkspace
        v-else-if="isAssetPackageStep"
        :loading="loading"
        :snapshot="snapshot"
        @select-chapter="$emit('selectChapter', $event)"
        @export-package="$emit('exportPackage')"
        @go-layout="$emit('selectStep', 'layout_export')"
      />

      <div v-else class="step-placeholder">
        <span>STEP {{ currentStageIndex + 1 }}</span>
        <h2>{{ currentStageLabel }}</h2>
        <p>此阶段功能正在开发中。左侧对话框会按当前步骤加载独立记录，右侧工作面板后续接入。</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronsRight, Sparkles } from "lucide-vue-next";
import type { CandidatePromptOverrides, CompleteChapterRequest, DialogueThread, DialogueToolResult, GenerationTaskItem, ManagedModelItem, ProjectCharacter, SaveChapterDraftRequest, ScriptWorkingCopyDto, SendDialogueMessageRequest, StoryboardJson, StoryStructureJson, UpdateProjectCharacterRequest, WorkbenchSnapshot } from "@airoaming/shared";
import type { ChapterCompletionPrompt } from "../../stores/workbench-store";
import { useWorkbenchStore } from "../../stores/workbench-store";
import { getCurrentChapterSourceText } from "../../utils/workbench-chapter";
import ProjectDialoguePanel from "./ProjectDialoguePanel.vue";
import ProjectCharactersWorkspace from "./ProjectCharactersWorkspace.vue";
import ScriptChapterList from "./ScriptChapterList.vue";
import ScriptDocumentEditor from "./ScriptDocumentEditor.vue";
import ImageCandidatesWorkspace from "./ImageCandidatesWorkspace.vue";
import ImagePreflightWorkspace from "./ImagePreflightWorkspace.vue";
import LayoutExportWorkspace from "./LayoutExportWorkspace.vue";
import AssetPackageWorkspace from "./AssetPackageWorkspace.vue";
import StoryboardWorkspace from "./StoryboardWorkspace.vue";
import StoryStructureWorkspace from "./StoryStructureWorkspace.vue";
import WorkbenchStageRail from "./WorkbenchStageRail.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  tasks: GenerationTaskItem[];
  loading: boolean;
  runningTasks: number;
  activeStepKey: string;
  chapterCompletionPrompt: ChapterCompletionPrompt | null;
  dialogueThread: DialogueThread | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  dialogueNotice: string | null;
  runtimeModelError: string | null;
  dialogueModels: ManagedModelItem[];
  scriptWorkingCopy: ScriptWorkingCopyDto | null;
}>();

const workbench = useWorkbenchStore();

const scriptDraft = ref("");

const emit = defineEmits<{
  openCharacters: [];
  saveChapterDraft: [payload: { chapterId: string; input: SaveChapterDraftRequest }];
  completeChapter: [payload: { chapterId: string; input: CompleteChapterRequest }];
  resetScript: [];
  confirmPendingSource: [chapterId: string];
  discardPendingSource: [chapterId: string];
  selectChapter: [chapterId: string];
  selectStep: [stepKey: string];
  dismissCompletionPrompt: [];
  sendDialogue: [input: SendDialogueMessageRequest];
  selectDialogueModel: [model: ManagedModelItem];
  retryImportItem: [payload: { batchId: string; itemId: string }];
  extractCharacters: [];
  regenerateCharacterReference: [payload: { characterId: string; referenceKind: "preview_front" | "final_reference"; input: UpdateProjectCharacterRequest }];
  confirmCharacterPreview: [payload: { characterId: string; assetId: string }];
  confirmCharacterReference: [payload: { characterId: string; assetId: string }];
  confirmAnchor: [payload: { characterId: string; assetId: string; character?: ProjectCharacter }];
  generateSceneReference: [payload: { chapterId: string; sceneId: string }];
  confirmStoryStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  updateStoryStructure: [payload: { chapterId: string; structureJson: StoryStructureJson }];
  confirmStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  updateStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  savePendingStoryboard: [payload: { chapterId: string; storyboardJson: StoryboardJson }];
  confirmImagePreflight: [chapterId: string];
  generateImageCandidates: [payload: { shotId: string; candidateCount: number; promptOverrides: CandidatePromptOverrides }];
  optimizeShotPrompt: [payload: { shotId: string; promptOverrides: CandidatePromptOverrides }];
  generateAllUnlocked: [payload: { promptOverridesByShot: Record<string, CandidatePromptOverrides> }];
  candidateChanged: [];
  completeImages: [];
  exportPackage: [];
}>();

const currentStageIndex = computed(() => {
  const index = props.snapshot.stages.findIndex((s) => s.key === props.activeStepKey);
  return Math.max(0, index);
});

const currentStageLabel = computed(() => {
  if (props.activeStepKey === "project_characters") {
    return "项目角色库";
  }
  return props.snapshot.stages[currentStageIndex.value]?.label || "未知阶段";
});

const isScriptStep = computed(() => props.activeStepKey === "project_story");
const isCharactersStep = computed(() => props.activeStepKey === "project_characters");
const isStructureStep = computed(() => props.activeStepKey === "story_structure");
const isStoryboardStep = computed(() => props.activeStepKey === "storyboard");
const isPreflightStep = computed(() => props.activeStepKey === "image_preflight");
const isCandidatesStep = computed(() => props.activeStepKey === "image_candidates");
const isLayoutStep = computed(() => props.activeStepKey === "layout_export");
const isAssetPackageStep = computed(() => props.activeStepKey === "asset_package");
const dialogueCollapsed = computed(() => workbench.dialogueCollapsed(props.activeStepKey));
const chapterItems = computed(() => props.snapshot.chapters ?? []);
const currentChapterId = computed(() => props.snapshot.currentChapter?.id ?? props.snapshot.story.chapterId ?? null);
const completionPrimaryActionLabel = computed(() => "进入本章剧情结构");
const activeCompletionPrompt = computed(() => {
  if (!props.chapterCompletionPrompt || props.chapterCompletionPrompt.completedChapterId !== currentChapterId.value) {
    return null;
  }

  return props.chapterCompletionPrompt;
});

watch(
  () => getCurrentChapterSourceText(props.snapshot),
  (sourceText) => {
    scriptDraft.value = sourceText;
  },
  { immediate: true },
);

function emitChapterDraft(input: SaveChapterDraftRequest) {
  if (!currentChapterId.value) {
    return;
  }

  emit("saveChapterDraft", {
    chapterId: currentChapterId.value,
    input,
  });
}

function emitCompleteChapter(input: CompleteChapterRequest) {
  if (!currentChapterId.value) {
    return;
  }

  emit("completeChapter", {
    chapterId: currentChapterId.value,
    input,
  });
}

function emitConfirmPendingSource() {
  if (!currentChapterId.value) {
    return;
  }
  emit("confirmPendingSource", currentChapterId.value);
}

function emitDiscardPendingSource() {
  if (!currentChapterId.value) {
    return;
  }
  emit("discardPendingSource", currentChapterId.value);
}

function emitDialogue(input: SendDialogueMessageRequest) {
  const hasAttachments = (input.attachments?.length ?? 0) > 0;
  const projectDecisionTools: DialogueToolResult["tool"][] = [
    "analyze_script_import",
    "import_script_to_chapters",
    "generate_inspiration_seeds",
    "generate_script_outline_from_seed",
    "generate_script_outline_from_topic",
  ];
  const latestProjectDecision = [...(props.dialogueThread?.toolResults ?? [])]
    .reverse()
    .find((result) => projectDecisionTools.includes(result.tool));
  const continuesProjectScopedDecision = props.activeStepKey === "project_story"
    && props.dialogueThread?.chapterId === null
    && latestProjectDecision?.status === "needs_user_confirmation";
  const shouldUseProjectThread = hasAttachments
    || input.intent === "organize_script_to_chapters"
    || input.intent === "confirm_script_chapter_map"
    || input.intent === "generate_inspiration_seeds"
    || input.intent === "generate_script_outline_from_seed"
    || continuesProjectScopedDecision;
  emit("sendDialogue", {
    ...input,
    chapterId: shouldUseProjectThread ? null : currentChapterId.value,
    context: {
      ...input.context,
      sourceText: scriptDraft.value,
    },
  });
}

function emitGenerateStructure(payload: { chapterId: string; regenerate: boolean }) {
  emit("sendDialogue", {
    content: payload.regenerate ? "确认重新生成剧情结构" : "生成当前章节剧情结构",
    chapterId: payload.chapterId,
    intent: "generate_story_structure",
    context: {
      sourceText: getCurrentChapterSourceText(props.snapshot),
    },
  });
}

function emitGenerateStoryboard(payload: { chapterId: string; regenerate: boolean }) {
  emit("sendDialogue", {
    content: payload.regenerate ? "确认重新生成分镜" : "生成当前章节分镜",
    chapterId: payload.chapterId,
    intent: "generate_storyboard",
    context: {
      sourceText: getCurrentChapterSourceText(props.snapshot),
    },
  });
}

function enterCompletedChapterStructure() {
  emit("dismissCompletionPrompt");
  emit("selectStep", "story_structure");
}

</script>

<style scoped>
.project-workbench {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  margin: 0 auto;
  padding: 12px 24px 24px;
}

.workbench-content {
  display: grid;
  grid-template-columns: minmax(320px, 35fr) minmax(0, 65fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workbench-content.is-layout-step {
  grid-template-columns: minmax(0, 1fr);
}

.workbench-content.is-dialogue-collapsed {
  grid-template-columns: 46px minmax(0, 1fr);
}

.dialogue-expand-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  border: 1px solid rgba(139, 92, 246, 0.18);
  border-radius: 14px;
  background: rgba(13, 18, 33, 0.4);
  color: #a78bfa;
  cursor: pointer;
  transition: all 0.18s;
}
.dialogue-expand-rail:hover {
  border-color: rgba(139, 92, 246, 0.45);
  background: rgba(139, 92, 246, 0.1);
  color: #ddd6fe;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
html[data-theme="light"] .dialogue-expand-rail {
  background: #ffffff;
  border-color: rgba(124, 58, 237, 0.2);
  color: #7c3aed;
}

.script-middle-column {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chapter-next-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(34, 199, 169, 0.26);
  border-radius: 12px;
  background: rgba(11, 42, 38, 0.42);
  padding: 12px 14px;
}

.chapter-next-actions div:first-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.chapter-next-actions span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.chapter-next-actions strong {
  color: #f8fbff;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-next-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.chapter-next-buttons button {
  min-height: 36px;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 900;
}

.primary-next {
  border: 1px solid rgba(34, 199, 169, 0.34);
  background: linear-gradient(135deg, #22c7a9, #745fff);
  color: #ffffff;
}

.secondary-next {
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.76);
  color: #d8e0f0;
}

.structure-workspace {
  min-height: 0;
}

.step-placeholder {
  display: grid;
  grid-column: 2 / -1;
  min-height: 0;
  align-content: center;
  gap: 10px;
  border: 1px solid rgba(116, 95, 255, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(18, 24, 43, 0.76), rgba(11, 16, 30, 0.62)),
    rgba(8, 12, 24, 0.76);
  padding: 28px;
}

.step-placeholder span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 900;
}

.step-placeholder h2,
.step-placeholder p {
  margin: 0;
}

.step-placeholder h2 {
  color: #f8fbff;
  font-size: 24px;
  font-weight: 900;
}

.step-placeholder p {
  max-width: 520px;
  color: #95a3c2;
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 1200px) {
  .workbench-content {
    grid-template-columns: minmax(300px, 36fr) minmax(0, 64fr);
  }

  .step-placeholder {
    grid-column: 2;
  }
}

@media (max-width: 860px) {
  .project-workbench {
    height: auto;
    min-height: calc(100vh - 72px);
    overflow: visible;
  }

  .workbench-content {
    grid-template-columns: 1fr;
    overflow: visible;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .script-middle-column {
    order: 1;
  }

  .chapter-next-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .chapter-next-buttons {
    flex-wrap: wrap;
  }

  .workbench-content :deep(.dialogue-panel) {
    order: 2;
    min-height: 520px;
    max-height: 72vh;
  }

  .step-placeholder {
    grid-column: 1;
  }
}
</style>
