<template>
  <aside class="dialogue-panel" aria-label="对话框">
    <header class="dialogue-panel-header">
      <div class="header-title">
        <Sparkles :size="16" class="title-icon" />
        <h2>{{ dialogueCopy.title }}</h2>
      </div>
      <button class="collapse-btn" type="button" title="收起对话" @click="emit('collapse')">
        <ChevronsLeft :size="16" />
      </button>
    </header>

    <section ref="messageListRef" class="dialogue-messages" aria-label="对话记录">
      <article v-if="messages.length === 0" class="dialogue-message is-assistant">
        <div class="message-avatar">
          <Bot :size="16" />
        </div>
        <div class="message-body">
          <p>{{ dialogueCopy.opening }}</p>
        </div>
      </article>

      <article
        v-for="message in messages"
        :key="message.id"
        class="dialogue-message"
        :class="[`is-${message.role}`, { 'is-muted': message.status === 'running' }]"
      >
        <template v-if="message.role === 'assistant'">
          <div class="message-avatar bot-avatar">
            <Bot :size="16" />
          </div>
          <div class="assistant-message-stack">
            <div v-if="shouldShowProcessBlock(message)" class="message-body process-message-body" :class="{ 'is-failed': message.status === 'failed' }">
              <div v-if="message.status === 'running'" class="message-process-card is-thinking">
                <Loader2 class="is-spinning" :size="14" />
                <span class="process-kind">思考</span>
                <span class="process-text">OpenCode 正在组织回复</span>
              </div>

              <div v-if="getMessageToolResults(message).length > 0" class="message-process-list" aria-label="AI 执行过程">
                <article
                  v-for="toolResult in getMessageToolResults(message)"
                  :key="toolResult.id"
                  class="tool-event-card"
                  :class="[getToolEventStatusClass(toolResult), { 'is-skill': isSkillTool(toolResult) }]"
                >
                  <details class="tool-event-details">
                    <summary class="tool-event-trigger">
                      <span class="tool-status-icon">
                        <component :is="getToolStatusIcon(toolResult)" :size="14" :class="getToolStatusClass(toolResult)" />
                      </span>
                      <span class="tool-kind-icon">
                        <component :is="getToolKindIcon(toolResult)" :size="13" />
                      </span>
                      <span class="tool-event-title">
                        <span>{{ getToolKindLabel(toolResult) }}</span>
                        <strong>{{ getToolDisplayName(toolResult) }}</strong>
                      </span>
                      <span class="tool-status-label">{{ getToolStatusLabel(toolResult) }}</span>
                    </summary>

                    <div class="tool-detail-panel">
                      <div v-if="toolResult.analysis" class="tool-detail-section">
                        <span class="tool-detail-label">分析结论</span>
                        <p>{{ toolResult.analysis.reason }}</p>
                        <p v-if="toolResult.analysis.risk">{{ toolResult.analysis.risk }}</p>
                        <div class="tool-meta-grid">
                          <span>类型：{{ getImportContentTypeLabel(toolResult.analysis.contentType) }}</span>
                          <span>动作：{{ getImportDecisionLabel(toolResult.analysis.decision) }}</span>
                        </div>
                      </div>

                      <div v-if="toolResult.importWorkflow" class="tool-detail-section import-workflow-detail">
                        <span class="tool-detail-label">原稿分析与拆章目录</span>
                        <p>{{ toolResult.importWorkflow.analysis.observedOutline.synopsis }}</p>
                        <div class="tool-meta-grid">
                          <span>内容类型：{{ getImportContentTypeLabel(toolResult.importWorkflow.analysis.sourceProfile.contentType) }}</span>
                          <span>章节候选：{{ toolResult.importWorkflow.analysis.chapterCandidates.length }} 章</span>
                        </div>
                        <ol class="chapter-result-list import-chapter-candidates">
                          <li v-for="candidate in toolResult.importWorkflow.analysis.chapterCandidates" :key="candidate.localRef">
                            <span>{{ candidate.order }}. {{ candidate.title.value }}</span>
                            <small>{{ getImportConfidenceLabel(candidate.confidence) }} · {{ candidate.boundaryEvidence.start.description }} → {{ candidate.boundaryEvidence.end.description }}</small>
                            <small>{{ candidate.summary }}</small>
                            <small v-if="candidate.warnings.length" class="import-warning">{{ candidate.warnings.join("；") }}</small>
                          </li>
                        </ol>
                        <div v-if="toolResult.importWorkflow.blockingIssues.length" class="import-blocking-list">
                          <strong>需要先解决的问题</strong>
                          <p v-for="issue in toolResult.importWorkflow.blockingIssues" :key="issue">{{ issue }}</p>
                        </div>
                        <button
                          v-if="toolResult.importWorkflow.stage === 'analysis_candidate' && toolResult.status === 'needs_user_confirmation' && toolResult.importWorkflow.blockingIssues.length === 0"
                          class="tool-confirm-btn"
                          type="button"
                          :disabled="dialogueSending"
                          title="整体确认拆章目录并开始生成全部章节待确认稿"
                          @click="confirmScriptChapterMap"
                        >
                          <CheckCircle2 :size="14" />
                          <span>确认拆章目录</span>
                        </button>
                        <div v-if="toolResult.importWorkflow.stage === 'batch_result'" class="import-batch-result">
                          <strong>整批结果：{{ getImportBatchStatusLabel(toolResult.importWorkflow.batchStatus) }}</strong>
                          <ol class="chapter-result-list">
                            <li v-for="item in toolResult.importWorkflow.batchItems" :key="item.id">
                              <span>{{ item.order }}. {{ item.title }}</span>
                              <small>{{ getImportItemStatusLabel(item.status) }}<template v-if="item.errorCode"> · {{ item.errorCode }}</template></small>
                              <button
                                v-if="item.status === 'generation_failed' && toolResult.importWorkflow.batchId"
                                class="tool-retry-btn"
                                type="button"
                                :disabled="dialogueSending || loading"
                                @click="retryImportItem(toolResult.importWorkflow.batchId, item.id)"
                              >
                                重试本章
                              </button>
                            </li>
                          </ol>
                        </div>
                      </div>

                      <div v-if="toolResult.inspirationSeeds?.length" class="tool-detail-section">
                        <span class="tool-detail-label">灵感种子</span>
                        <ol class="seed-list">
                          <li v-for="seed in toolResult.inspirationSeeds" :key="seed.id">
                            <strong>{{ seed.order }}. {{ seed.title }}</strong>
                            <span>{{ seed.logline }}</span>
                            <small>冲突：{{ seed.keyConflict }} · 画面：{{ seed.visualHook }}</small>
                            <button
                              class="seed-select-btn"
                              type="button"
                              :disabled="dialogueSending"
                              title="生成项目级剧本大纲"
                              @click="chooseInspirationSeed(seed)"
                            >
                              <FileText :size="12" />
                              <span>生成大纲</span>
                            </button>
                          </li>
                        </ol>
                      </div>

                      <div v-if="toolResult.scriptOutline" class="tool-detail-section">
                        <span class="tool-detail-label">剧本大纲</span>
                        <pre class="script-outline-preview">{{ toolResult.scriptOutline.sourceText }}</pre>
                        <button
                          v-if="toolResult.status === 'needs_user_confirmation'"
                          class="tool-confirm-btn"
                          type="button"
                          :disabled="dialogueSending"
                          title="确认大纲并生成当前章节"
                          @click="confirmScriptOutline(toolResult.scriptOutline)"
                        >
                          <CheckCircle2 :size="14" />
                          <span>确认并生成当前章</span>
                        </button>
                      </div>

                      <div v-if="toolResult.storyStructure" class="tool-detail-section">
                        <span class="tool-detail-label">剧情结构</span>
                        <pre class="script-outline-preview">{{ formatStoryStructurePreview(toolResult.storyStructure.structureJson) }}</pre>
                        <button
                          v-if="isToolResultConfirmationActionable(toolResult)"
                          class="tool-confirm-btn"
                          type="button"
                          :disabled="dialogueSending"
                          title="确认剧情结构"
                          @click="confirmStoryStructure"
                        >
                          <CheckCircle2 :size="14" />
                          <span>确认结构</span>
                        </button>
                      </div>

                      <div v-if="toolResult.storyboard" class="tool-detail-section">
                        <span class="tool-detail-label">分镜预览</span>
                        <pre class="script-outline-preview">{{ formatStoryboardPreview(toolResult.storyboard.storyboardJson) }}</pre>
                        <button
                          v-if="isToolResultConfirmationActionable(toolResult)"
                          class="tool-confirm-btn"
                          type="button"
                          :disabled="dialogueSending"
                          title="确认分镜"
                          @click="confirmStoryboard"
                        >
                          <CheckCircle2 :size="12" />
                          <span>确认分镜</span>
                        </button>
                      </div>

                      <div v-if="toolResult.characters?.length" class="tool-detail-section">
                        <span class="tool-detail-label">项目角色</span>
                        <ol class="chapter-result-list">
                          <li v-for="character in toolResult.characters" :key="character.id">
                            <span>{{ character.name }} · {{ getCharacterLevelLabel(character.level) }}</span>
                            <small>{{ getCharacterStatusLabel(character.status) }}</small>
                          </li>
                        </ol>
                      </div>

                      <div v-if="toolResult.chapters.length > 0" class="tool-detail-section">
                        <span class="tool-detail-label">章节结果</span>
                        <ol class="chapter-result-list">
                          <li v-for="chapter in toolResult.chapters" :key="chapter.id">
                            <span>{{ chapter.order }}. {{ chapter.title }}</span>
                            <small>{{ chapter.status }}</small>
                          </li>
                        </ol>
                      </div>

                      <div v-if="toolResult.revision" class="tool-detail-section">
                        <span class="tool-detail-label">写入记录</span>
                        <p>{{ toolResult.revision.summary }}</p>
                      </div>
                    </div>
                  </details>

                  <p class="tool-event-summary-text">{{ getToolEventSummary(toolResult) }}</p>
                </article>
              </div>
            </div>

            <div v-if="shouldShowMessageText(message)" class="message-body final-message-body" :class="{ 'is-failed': message.status === 'failed' }">
              <p class="message-text">{{ getMessageContent(message) }}</p>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="message-body">
            <p class="message-text">{{ getMessageContent(message) }}</p>
          </div>
          <div class="message-avatar user-avatar">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" class="avatar-img" />
          </div>
        </template>
      </article>

      <p v-if="dialogueError" class="dialogue-error">{{ dialogueError }}</p>
      <p v-if="dialogueNotice" class="dialogue-notice">{{ dialogueNotice }}</p>
      <p v-if="runtimeModelError" class="dialogue-error">{{ runtimeModelError }}</p>
    </section>



    <footer class="dialogue-composer">
      <div class="composer-inner">
        <div v-if="attachments.length > 0" class="attachment-list" aria-label="已选择附件">
          <span v-for="attachment in attachments" :key="attachment.id" class="attachment-chip">
            <FileText :size="13" />
            <span>{{ attachment.name }}</span>
            <button type="button" title="移除附件" @click="removeAttachment(attachment.id)">×</button>
          </span>
        </div>
        <p v-if="attachmentError" class="attachment-error">{{ attachmentError }}</p>
        <div v-if="quickActions.length > 0" class="dialogue-quick-actions" aria-label="快捷指令">
          <button
            v-for="action in quickActions"
            :key="action.label"
            class="quick-action-btn"
            type="button"
            :disabled="dialogueSending"
            @click="runQuickAction(action)"
          >{{ action.label }}</button>
        </div>
        <div class="composer-input-row">
          <input
            ref="fileInputRef"
            class="file-input"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            multiple
            @change="handleFileChange"
          />
          <button
            v-if="dialogueCopy.allowAttachments"
            class="attach-btn"
            type="button"
            :title="dialogueCopy.attachmentTitle"
            :disabled="dialogueSending"
            @click="fileInputRef?.click()"
          >
            <Paperclip :size="16" />
          </button>
          <textarea
            ref="composerTextareaRef"
            v-model="draft"
            aria-label="输入对话内容"
            :placeholder="dialogueCopy.placeholder"
            rows="1"
            :disabled="dialogueSending"
            @keydown.enter.exact.prevent="submit"
          ></textarea>
          <button class="send-btn" type="button" title="发送" :disabled="!canSend" @click="submit">
            <Loader2 v-if="dialogueSending" class="is-spinning" :size="14" />
            <ArrowUp v-else :size="14" />
          </button>
        </div>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ArrowUp, Bot, Brain, CheckCircle2, ChevronsLeft, CircleAlert, FileText, Loader2, Paperclip, Sparkles, Wrench } from "lucide-vue-next";
import type { DialogueAttachmentInput, DialogueMessageItem, DialogueThread, DialogueToolResult, ProjectScriptOutline, ScriptInspirationSeed, SendDialogueMessageRequest, StoryboardJson, WorkbenchSnapshot } from "@airoaming/shared";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  activeStepKey: string;
  stepLabel?: string;
  dialogueThread: DialogueThread | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  dialogueNotice: string | null;
  runtimeModelError: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  send: [input: SendDialogueMessageRequest];
  retryImportItem: [payload: { batchId: string; itemId: string }];
  collapse: [];
}>();

const draft = ref("");
const attachments = ref<Array<DialogueAttachmentInput & { id: string }>>([]);
const attachmentError = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const composerTextareaRef = ref<HTMLTextAreaElement | null>(null);
const messageListRef = ref<HTMLElement | null>(null);

interface DialogueQuickAction {
  label: string;
  content?: string;
  intent?: SendDialogueMessageRequest["intent"];
  focusComposer?: boolean;
}

const quickActions = computed<DialogueQuickAction[]>(() => {
  switch (props.activeStepKey) {
    case "project_story":
      return [
        { label: "给我 3 个灵感", content: "给我 3 个灵感", intent: "generate_inspiration_seeds" },
        { label: "粘贴已有剧本", focusComposer: true },
        { label: "生成当前章节", content: "生成当前章节" },
      ];
    case "story_structure":
      return [
        { label: "生成剧情结构", content: "生成当前章节剧情结构", intent: "generate_story_structure" },
      ];
    case "storyboard":
      return [
        { label: "生成分镜", content: "生成当前章节分镜", intent: "generate_storyboard" },
      ];
    default:
      return [];
  }
});

function runQuickAction(action: DialogueQuickAction) {
  if (action.focusComposer) {
    composerTextareaRef.value?.focus();
    return;
  }
  if (!action.content) {
    return;
  }
  emit("send", {
    content: action.content,
    intent: action.intent,
  });
}

const messages = computed(() => props.dialogueThread?.messages ?? []);
const toolResults = computed(() => props.dialogueThread?.toolResults ?? []);
const toolResultsByMessageId = computed(() => {
  const groups = new Map<string, DialogueToolResult[]>();
  for (const result of toolResults.value) {
    const items = groups.get(result.messageId) ?? [];
    items.push(result);
    groups.set(result.messageId, items);
  }

  return groups;
});
const canSend = computed(() => {
  const hasContent = draft.value.trim().length > 0;
  const hasAttachments = dialogueCopy.value.allowAttachments && attachments.value.length > 0;
  return (hasContent || hasAttachments) && !props.dialogueSending;
});
const skillTools = new Set<DialogueToolResult["tool"]>([
  "analyze_script_import",
  "import_script_to_chapters",
  "generate_inspiration_seeds",
  "generate_script_outline_from_seed",
  "generate_script_outline_from_topic",
  "generate_script_from_outline",
  "generate_script_from_seed",
  "generate_multiple_chapters",
  "update_chapter_draft",
  "generate_story_structure",
  "confirm_story_structure",
  "generate_project_characters",
  "generate_storyboard",
  "confirm_storyboard",
]);
const toolDisplayNames: Record<DialogueToolResult["tool"], string> = {
  analyze_script_import: "剧本导入分析",
  import_script_to_chapters: "剧本拆章导入",
  generate_inspiration_seeds: "灵感种子生成",
  generate_script_outline_from_seed: "剧本大纲起草",
  generate_script_outline_from_topic: "剧本大纲起草",
  generate_script_from_outline: "章节草稿生成",
  generate_script_from_seed: "章节草稿生成",
  generate_multiple_chapters: "章节草稿生成",
  update_chapter_draft: "章节草稿改写",
  generate_story_structure: "剧情结构解析",
  confirm_story_structure: "确认剧情结构",
  generate_project_characters: "项目角色提取",
  generate_storyboard: "分镜生成",
  confirm_storyboard: "确认分镜",
};

const dialogueCopy = computed(() => {
  if (props.activeStepKey === "storyboard") {
    return {
      title: "AI 分镜助手",
      opening: "这一阶段会把已确认的剧情结构拆成镜头卡。每个镜头会同时生成漫画画格字段和基础漫剧镜头字段，确认后保存为本章分镜。",
      placeholder: "输入“生成分镜”，或告诉我镜头节奏调整要求",
      allowAttachments: false,
      attachmentTitle: "",
      emptyAttachmentContent: "",
    };
  }

  if (props.activeStepKey === "story_structure") {
    return {
      title: "AI 剧情结构助手",
      opening: "这一阶段会把当前已完成章节拆成摘要、角色、场景和剧情节拍。可以说“生成剧情结构”，确认后会保存为本章结构表。",
      placeholder: "输入“生成剧情结构”，或告诉我结构调整要求",
      allowAttachments: false,
      attachmentTitle: "",
      emptyAttachmentContent: "",
    };
  }

  if (props.activeStepKey === "project_characters") {
    return {
      title: "AI 角色定稿助手",
      opening: "这里是项目级角色资产入口。可以提取或整理主角、常驻角色和本章重要角色，确认后的角色定稿图会在出图准备和候选图阶段被读取。",
      placeholder: "输入“生成项目角色库”，或告诉我要调整哪个角色",
      allowAttachments: false,
      attachmentTitle: "",
      emptyAttachmentContent: "",
    };
  }

  if (props.activeStepKey === "image_preflight") {
    return {
      title: "AI 出图准备助手",
      opening: "这一阶段会检查正式分镜里的出镜角色、项目角色库绑定和角色参考图。缺什么先补什么，确认无阻塞后再进入候选图。",
      placeholder: "输入出图检查要求，或让我解释当前阻塞项",
      allowAttachments: false,
      attachmentTitle: "",
      emptyAttachmentContent: "",
    };
  }

  if (props.activeStepKey === "project_story") {
    return {
      title: "AI 编剧助手",
      opening: "可以先说“帮我找灵感”，也可以上传或粘贴剧本让我整理；选中灵感后我会先生成剧本大纲。",
      placeholder: "告诉我的想法，或输入“/”唤起指令",
      allowAttachments: true,
      attachmentTitle: "上传剧本文本",
      emptyAttachmentContent: "请根据附件内容整理成章节。",
    };
  }

  return {
    title: `AI ${props.stepLabel ?? "创作"}助手`,
    opening: `这里会围绕${props.stepLabel ?? "当前阶段"}提供建议和受控生成能力。`,
    placeholder: `输入关于${props.stepLabel ?? "当前阶段"}的想法或要求`,
    allowAttachments: false,
    attachmentTitle: "",
    emptyAttachmentContent: "",
  };
});

watch(
  () => props.activeStepKey,
  () => {
    if (!dialogueCopy.value.allowAttachments) {
      attachments.value = [];
      attachmentError.value = null;
    }
  },
);

watch(
  () => [
    messages.value.map((message) => `${message.id}:${message.content}:${message.status}`).join("|"),
    toolResults.value.map((result) => `${result.id}:${result.status}:${result.summary}`).join("|"),
  ].join("||"),
  async () => {
    await nextTick();
    const element = messageListRef.value;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  },
);

function submit() {
  const content = draft.value.trim();
  const canUseAttachments = dialogueCopy.value.allowAttachments && attachments.value.length > 0;
  if ((!content && !canUseAttachments) || props.dialogueSending) {
    return;
  }

  const selectedAttachments = dialogueCopy.value.allowAttachments
    ? attachments.value.map(({ id, ...attachment }) => attachment)
    : [];
  draft.value = "";
  attachments.value = [];
  attachmentError.value = null;
  emit("send", {
    content: content || dialogueCopy.value.emptyAttachmentContent,
    intent: content ? undefined : "organize_script_to_chapters",
    attachments: selectedAttachments,
  });
}

function chooseInspirationSeed(seed: ScriptInspirationSeed) {
  if (props.dialogueSending) {
    return;
  }

  emit("send", {
    content: `选第 ${seed.order} 个：${seed.title}`,
    intent: "generate_script_outline_from_seed",
  });
}

function confirmScriptOutline(outline: ProjectScriptOutline) {
  if (props.dialogueSending) {
    return;
  }

  emit("send", {
    content: `确认大纲：${outline.title}，生成当前章节`,
    intent: "generate_script_from_outline",
  });
}

function confirmScriptChapterMap() {
  if (props.dialogueSending) {
    return;
  }
  emit("send", {
    content: "确认拆章目录",
    intent: "confirm_script_chapter_map",
  });
}

function retryImportItem(batchId: string, itemId: string) {
  if (props.dialogueSending || props.loading) return;
  emit("retryImportItem", { batchId, itemId });
}

function confirmStoryStructure() {
  if (props.dialogueSending) {
    return;
  }

  emit("send", {
    content: "确认剧情结构",
    intent: "confirm_story_structure",
  });
}

function confirmStoryboard() {
  if (props.dialogueSending) {
    return;
  }

  emit("send", {
    content: "确认分镜",
    intent: "confirm_storyboard",
  });
}

async function handleFileChange(event: Event) {
  attachmentError.value = null;
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!dialogueCopy.value.allowAttachments) {
    return;
  }

  for (const file of files) {
    if (!isSupportedTextFile(file)) {
      attachmentError.value = "当前只支持 .txt 和 .md 剧本文本。";
      continue;
    }

    const content = await file.text();
    attachments.value.push({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      mimeType: file.type || "text/plain",
      size: file.size,
      content,
    });
  }
}

function isSupportedTextFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/");
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id);
}

function getMessageContent(message: DialogueMessageItem) {
  return message.content;
}

function getMessageToolResults(message: DialogueMessageItem) {
  return toolResultsByMessageId.value.get(message.id) ?? [];
}

function shouldShowProcessBlock(message: DialogueMessageItem) {
  return message.role === "assistant" && (message.status === "running" || getMessageToolResults(message).length > 0);
}

function shouldShowMessageText(message: DialogueMessageItem) {
  return getMessageContent(message).trim().length > 0;
}

function isSkillTool(result: DialogueToolResult) {
  return skillTools.has(result.tool);
}

function getToolKindLabel(result: DialogueToolResult) {
  return isSkillTool(result) ? "AI 技能" : "AI 工具";
}

function getToolKindIcon(result: DialogueToolResult) {
  return isSkillTool(result) ? Brain : Wrench;
}

function getToolDisplayName(result: DialogueToolResult) {
  return toolDisplayNames[result.tool] ?? result.tool;
}

function isResolvedPreviewResult(result: DialogueToolResult) {
  if (result.status !== "needs_user_confirmation") {
    return false;
  }

  if (result.tool === "generate_story_structure" && result.storyStructure) {
    const step = props.snapshot.workflow.steps.find((item) => item.key === "story_structure");
    return Boolean(step && step.status !== "needs_confirmation");
  }

  if (result.tool === "generate_storyboard" && result.storyboard) {
    if (props.snapshot.pendingStoryboard) {
      return props.snapshot.pendingStoryboard.id !== result.storyboard.id;
    }
    const step = props.snapshot.workflow.steps.find((item) => item.key === "storyboard");
    return Boolean(step && step.status !== "needs_confirmation");
  }

  return false;
}

function isToolResultConfirmationActionable(result: DialogueToolResult) {
  return result.status === "needs_user_confirmation" && !isResolvedPreviewResult(result);
}

function getToolEventStatusClass(result: DialogueToolResult) {
  return isResolvedPreviewResult(result) ? "is-succeeded" : `is-${result.status}`;
}

function getToolEventSummary(result: DialogueToolResult) {
  if (isResolvedPreviewResult(result)) {
    return "该预览已处理，当前状态以右侧工作区为准。";
  }

  if (result.status === "failed") {
    return "执行失败，详细原因见最终回复。";
  }

  if (result.status === "needs_user_confirmation") {
    return "已完成分析，需要你确认下一步。";
  }

  if (result.tool === "generate_inspiration_seeds") {
    const seedCount = result.inspirationSeeds?.length ?? 0;
    return seedCount > 0 ? `已生成 ${seedCount} 个灵感方向。` : "已完成灵感生成。";
  }

  if (result.tool === "generate_script_outline_from_seed") {
    return "已生成项目级剧本大纲，等待确认。";
  }

  if (result.tool === "import_script_to_chapters") {
    return `已写入 ${result.chapters.length} 个章节。`;
  }

  if (result.tool === "generate_script_from_outline") {
    return "已根据确认的大纲生成当前章节草稿。";
  }

  if (result.tool === "generate_script_from_seed") {
    return "已根据选中的灵感方向生成章节草稿。";
  }

  if (result.tool === "update_chapter_draft") {
    return "已更新当前章节草稿。";
  }

  if (result.tool === "generate_story_structure") {
    return result.storyStructure ? "已生成剧情结构预览，等待确认。" : "已完成剧情结构检查。";
  }

  if (result.tool === "confirm_story_structure") {
    return "已确认并写入当前章节剧情结构。";
  }

  if (result.tool === "generate_project_characters") {
    const count = result.characters?.length ?? 0;
    return count > 0 ? `已写入 ${count} 个项目角色。` : "已完成项目角色检查。";
  }

  if (result.tool === "generate_storyboard") {
    return result.storyboard ? "已生成分镜预览，等待确认。" : "已完成分镜检查。";
  }

  if (result.tool === "confirm_storyboard") {
    return "已确认并写入当前章节分镜。";
  }

  return "已完成导入前分析。";
}

function getCharacterLevelLabel(level: string) {
  const labels: Record<string, string> = {
    lead: "主角",
    recurring: "常驻",
    chapter: "本章重要",
    extra: "临时/背景",
  };
  return labels[level] ?? level;
}

function getCharacterStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    needs_reference: "待定稿",
    finalized: "已定稿",
    in_use: "已使用",
  };
  return labels[status] ?? status;
}

function formatStoryStructurePreview(structure: { synopsis: string; beats: Array<{ order: number; title: string; summary: string }> }) {
  return [
    structure.synopsis,
    "",
    ...structure.beats.map((beat) => `${beat.order}. ${beat.title}：${beat.summary}`),
  ].join("\n").trim();
}

function formatStoryboardPreview(storyboard: StoryboardJson) {
  return storyboard.shots
    .map((shot) => `${shot.order}. ${shot.coreAction || shot.comic.panelDescription}\n漫画：${shot.comic.panelDescription}\n漫剧：${shot.motion.frameType || "未设置"} · ${shot.motion.cameraMovement || "无运镜"}`)
    .join("\n\n")
    .trim();
}

function getToolStatusLabel(result: DialogueToolResult) {
  if (isResolvedPreviewResult(result)) {
    return "已处理";
  }

  if (result.status === "succeeded") {
    return "完成";
  }

  if (result.status === "needs_user_confirmation") {
    return "待确认";
  }

  return "失败";
}

function getToolStatusIcon(result: DialogueToolResult) {
  if (result.status === "succeeded" || isResolvedPreviewResult(result)) {
    return CheckCircle2;
  }

  return CircleAlert;
}

function getToolStatusClass(result: DialogueToolResult) {
  if (result.status === "succeeded" || isResolvedPreviewResult(result)) {
    return "is-success";
  }

  if (result.status === "needs_user_confirmation") {
    return "is-warning";
  }

  return "is-danger";
}

function getImportContentTypeLabel(contentType: string) {
  const labels: Record<string, string> = {
    script: "剧本",
    story_prose: "小说/正文",
    outline: "大纲",
    worldbuilding: "世界观资料",
    invalid: "无法导入",
  };
  return labels[contentType] ?? contentType;
}

function getImportDecisionLabel(decision: string) {
  const labels: Record<string, string> = {
    ready_to_import: "可直接导入",
    needs_user_confirmation: "需要用户确认",
    reject: "拒绝导入",
  };
  return labels[decision] ?? decision;
}

function getImportConfidenceLabel(confidence: string) {
  return ({ high: "高置信", medium: "中置信", low: "低置信" } as Record<string, string>)[confidence] ?? confidence;
}

function getImportBatchStatusLabel(status: string | null) {
  return ({ queued: "等待整理", processing: "整理中", ready_for_review: "可逐章检查", partial_failure: "部分章节失败", failed: "整批失败", completed: "全部章节已确认" } as Record<string, string>)[status ?? ""] ?? status ?? "未知";
}

function getImportItemStatusLabel(status: string) {
  return ({ queued: "等待整理", materializing: "整理中", verifying: "忠实度验证中", pending_ready: "待确认", generation_failed: "生成或验证失败", confirmed: "已确认" } as Record<string, string>)[status] ?? status;
}
</script>

<style scoped>
.dialogue-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  gap: 16px;
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 16px;
  background: rgba(13, 18, 33, 0.4);
  padding: 20px;
}

.dialogue-panel-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  color: #a78bfa;
}

.dialogue-panel-header h2 {
  margin: 0;
  color: #f1f5f9;
  font-size: 14px;
  font-weight: 600;
}

.collapse-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}



.dialogue-messages {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 8px;
}

.dialogue-messages::-webkit-scrollbar {
  width: 6px;
}

.dialogue-messages::-webkit-scrollbar-track {
  background: transparent;
}

.dialogue-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.dialogue-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.dialogue-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.dialogue-message.is-user {
  justify-content: flex-end;
}

.dialogue-message.is-muted {
  opacity: 0.76;
}

.message-avatar {
  display: flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  overflow: hidden;
}

.bot-avatar {
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
}

.user-avatar {
  background: transparent;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-body {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(30, 35, 55, 0.6);
  color: #e2e8f0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
}

.assistant-message-stack {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 8px;
}

.message-body p {
  margin: 0;
  white-space: pre-wrap;
}

.message-text {
  display: block;
  padding-right: 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.dialogue-message.is-user .message-body {
  max-width: min(86%, 680px);
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-top-right-radius: 4px;
}

.dialogue-message.is-assistant .message-body {
  width: 100%;
  border: 1px solid rgba(139, 92, 246, 0.2);
  background: rgba(139, 92, 246, 0.05);
  border-top-left-radius: 4px;
}

.dialogue-message.is-assistant .process-message-body {
  border-color: rgba(96, 165, 250, 0.16);
  background: rgba(15, 23, 42, 0.34);
}

.dialogue-message.is-assistant .final-message-body {
  border-color: rgba(139, 92, 246, 0.28);
  background: rgba(139, 92, 246, 0.08);
}

.message-process-card,
.tool-event-trigger {
  display: flex;
  align-items: center;
  min-width: 0;
}

.message-process-card {
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  border-left: 1px solid rgba(148, 163, 184, 0.18);
  color: #9fb0d0;
  padding: 2px 0 2px 10px;
  font-size: 12px;
}

.message-process-card + .message-text {
  margin-top: 10px;
}

.process-kind {
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
}

.process-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-process-list {
  display: grid;
  gap: 8px;
}

.message-process-list + .message-text {
  margin-top: 10px;
}

.tool-event-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.42);
}

.tool-event-card.is-skill {
  border-color: rgba(96, 165, 250, 0.18);
  background: rgba(14, 30, 52, 0.46);
}

.tool-event-card.is-succeeded {
  border-color: rgba(52, 211, 153, 0.18);
}

.tool-event-card.is-needs_user_confirmation {
  border-color: rgba(245, 158, 11, 0.22);
}

.tool-event-card.is-failed {
  border-color: rgba(248, 113, 113, 0.22);
}

.tool-event-details {
  min-width: 0;
}

.tool-event-trigger {
  gap: 8px;
  cursor: pointer;
  list-style: none;
  padding: 9px 10px 0;
}

.tool-event-trigger::-webkit-details-marker {
  display: none;
}

.tool-status-icon,
.tool-kind-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.tool-kind-icon {
  color: #93c5fd;
}

.tool-event-title {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.tool-event-title span {
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.2;
}

.tool-event-title strong {
  min-width: 0;
  overflow: hidden;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-status-label {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
}

.tool-status-icon .is-success {
  color: #34d399;
}

.tool-status-icon .is-warning {
  color: #fbbf24;
}

.tool-status-icon .is-danger {
  color: #f87171;
}

.tool-event-summary-text {
  max-height: 132px;
  overflow-y: auto;
  margin: 8px 10px 10px;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.tool-detail-panel {
  display: grid;
  max-height: min(34vh, 360px);
  gap: 10px;
  overflow-y: auto;
  margin: 8px 10px 0;
  border-left: 1px solid rgba(148, 163, 184, 0.18);
  padding: 0 0 2px 10px;
}

.tool-detail-section {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.tool-detail-section p {
  color: #b7c4dc;
  font-size: 12px;
  line-height: 1.55;
}

.tool-detail-label {
  color: #8df0dc;
  font-size: 11px;
  font-weight: 800;
}

.tool-meta-grid {
  display: grid;
  gap: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.seed-list,
.chapter-result-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
}

.seed-list li,
.chapter-result-list li {
  min-width: 0;
  color: #cbd5e1;
}

.seed-list strong,
.seed-list span,
.seed-list small,
.chapter-result-list span,
.chapter-result-list small {
  display: block;
  overflow-wrap: anywhere;
}

.seed-list strong,
.chapter-result-list span {
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
}

.seed-list span,
.seed-list small,
.chapter-result-list small {
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.45;
}

.script-outline-preview {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.36);
  color: #dbeafe;
  padding: 10px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.seed-select-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 24px;
  margin-top: 6px;
  border: 1px solid rgba(141, 240, 220, 0.24);
  border-radius: 6px;
  background: rgba(141, 240, 220, 0.08);
  color: #a7fff0;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.seed-select-btn:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

/* 对话卡片里的确认主操作按钮(大纲/结构/分镜):全宽、大尺寸、高对比度,
   替代原来隐蔽的 seed-select-btn 小按钮。 */
.tool-confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 40px;
  margin-top: 10px;
  border: 1px solid rgba(139, 92, 246, 0.5);
  border-radius: 10px;
  background: linear-gradient(135deg, #8b5cf6, #745fff);
  color: #ffffff;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition: filter 0.15s ease, opacity 0.15s ease;
}

.tool-confirm-btn:hover:not(:disabled) {
  filter: brightness(1.12);
}

.tool-confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tool-retry-btn {
  justify-self: start;
  min-height: 28px;
  border: 1px solid rgba(248, 113, 113, 0.34);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.1);
  color: #fecaca;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.tool-retry-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.dialogue-quick-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.quick-actions-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.quick-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 999px;
  color: #c4b5fd;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-action-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.16);
  border-color: rgba(139, 92, 246, 0.45);
  color: #f1f5f9;
}

.quick-icon.color-0 { color: #60a5fa; }
.quick-icon.color-1 { color: #f59e0b; }
.quick-icon.color-2 { color: #a78bfa; }
.quick-icon.color-3 { color: #34d399; }

.dialogue-error {
  margin: 0;
  border: 1px solid rgba(255, 112, 112, 0.22);
  border-radius: 10px;
  background: rgba(255, 112, 112, 0.1);
  color: #ffd0d0;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.dialogue-notice {
  margin: 0;
  border: 1px solid rgba(52, 211, 153, 0.24);
  border-radius: 10px;
  background: rgba(52, 211, 153, 0.1);
  color: #bbf7d0;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.dialogue-composer {
  flex: 0 0 auto;
  margin-top: 8px;
}

.composer-inner {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 6px 8px;
  gap: 8px;
  transition: border-color 0.2s;
}

.composer-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 8px 0;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.1);
  color: #bfdbfe;
  padding: 5px 8px;
  font-size: 11px;
}

.attachment-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-chip button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #dbeafe;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.attachment-error {
  margin: 0;
  color: #fca5a5;
  font-size: 11px;
  line-height: 1.4;
  padding: 0 8px;
}

.composer-inner:focus-within {
  border-color: rgba(139, 92, 246, 0.4);
}

.composer-input-row textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  border: none;
  background: transparent;
  color: #f1f5f9;
  font-size: 12px;
  line-height: 1.5;
  outline: none;
  padding: 4px 0;
}

.composer-input-row textarea::placeholder {
  color: #64748b;
}

.file-input {
  display: none;
}

.attach-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attach-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .dialogue-panel {
    min-height: 520px;
    padding: 16px;
  }
}
</style>
