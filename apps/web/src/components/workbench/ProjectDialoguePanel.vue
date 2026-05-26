<template>
  <aside class="dialogue-panel" aria-label="对话框">
    <header class="dialogue-panel-header">
      <div class="header-title">
        <Sparkles :size="16" class="title-icon" />
        <h2>AI 编剧助手</h2>
      </div>
      <button class="collapse-btn" type="button">
        <ChevronsLeft :size="16" />
      </button>
    </header>

    <section ref="messageListRef" class="dialogue-messages" aria-label="对话记录">
      <article v-if="messages.length === 0" class="dialogue-message is-assistant">
        <div class="message-avatar">
          <Bot :size="16" />
        </div>
        <div class="message-body">
          <p>{{ assistantOpening }}</p>
          <div class="message-actions">
            <button type="button" :disabled="!hasStory || loading || dialogueSending" @click="sendPreset(analysisPrompt)">
              <Sparkles :size="14" />
              <span>分析剧情</span>
            </button>
          </div>
        </div>
      </article>

      <article
        v-for="message in messages"
        :key="message.id"
        class="dialogue-message"
        :class="[`is-${message.role}`, { 'is-muted': message.status === 'running' }]"
      >
        <div v-if="message.role === 'assistant'" class="message-avatar bot-avatar">
          <Bot :size="16" />
        </div>
        <div class="message-body" :class="{ 'is-failed': message.status === 'failed' }">
          <p>{{ getMessageContent(message) }}</p>
        </div>
        <div v-if="message.role === 'user'" class="message-avatar user-avatar">
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" class="avatar-img" />
        </div>
      </article>

      <p v-if="dialogueError" class="dialogue-error">{{ dialogueError }}</p>
      <p v-if="runtimeModelError" class="dialogue-error">{{ runtimeModelError }}</p>
    </section>

    <section class="dialogue-quick-actions" aria-label="快捷提问">
      <span class="quick-actions-title">快捷建议</span>
      <div class="quick-actions-grid">
        <button
          v-for="(item, index) in quickPrompts"
          :key="item.text"
          class="quick-action-btn"
          type="button"
          :disabled="dialogueSending"
          @click="draft = item.text"
        >
          <component :is="item.icon" :size="14" class="quick-icon" :class="'color-' + (index % 4)" />
          <span>{{ item.text }}</span>
        </button>
      </div>
    </section>

    <footer class="dialogue-composer">
      <div class="composer-inner">
        <textarea
          v-model="draft"
          aria-label="输入对话内容"
          placeholder="告诉我的想法，或输入“/”唤起指令"
          rows="2"
          :disabled="dialogueSending"
          @keydown.enter.exact.prevent="submit"
        ></textarea>
        <div class="composer-actions">
          <button class="attach-btn" type="button" title="上传剧本后续接入" disabled>
            <Paperclip :size="16" />
          </button>
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
import { ArrowUp, Bot, ChevronsLeft, FileText, Loader2, Paperclip, Sparkles, Zap, Users, Lightbulb, Search } from "lucide-vue-next";
import type { AIRuntimeModelItem, AIRuntimeModelSelection, DialogueMessageItem, DialogueThread, WorkbenchSnapshot } from "@airoaming/shared";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  stepLabel?: string;
  dialogueThread: DialogueThread | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  runtimeModels: AIRuntimeModelItem[];
  selectedModel: AIRuntimeModelSelection | null;
  runtimeModelError: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  selectModel: [model: AIRuntimeModelSelection];
}>();

const quickPrompts = [
  { text: "优化开场钩子", icon: Sparkles },
  { text: "丰富角色动机", icon: Users },
  { text: "扩展戏剧冲突", icon: Zap },
  { text: "生成场景梗概", icon: Lightbulb },
  { text: "润色对白", icon: FileText },
  { text: "检查逻辑一致性", icon: Search },
];
const draft = ref("");
const messageListRef = ref<HTMLElement | null>(null);

const hasStory = computed(() => props.snapshot.story.sourceText.trim().length > 0);
const messages = computed(() => props.dialogueThread?.messages ?? []);
const canSend = computed(() => draft.value.trim().length > 0 && !props.dialogueSending);
const selectedModelValue = computed(() => props.selectedModel ? serializeModel(props.selectedModel) : "");
const analysisPrompt = "请分析当前剧本的人物目标、核心冲突、节奏断点和最适合漫画化的画面段落。";

const assistantOpening = computed(() => {
  if (hasStory.value) {
    return "我先围绕当前剧本看人物目标、开场冲突和节奏断点。";
  }

  return "先把第一版剧本写在右侧，我会帮你把人物、冲突和节奏拆开看。";
});

watch(
  () => messages.value.map((message) => `${message.id}:${message.content}:${message.status}`).join("|"),
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
  if (!content || props.dialogueSending) {
    return;
  }

  draft.value = "";
  emit("send", content);
}

function sendPreset(content: string) {
  if (props.dialogueSending) {
    return;
  }
  emit("send", content);
}

function selectModel(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const model = props.runtimeModels.find((item) => serializeModel(item) === value);
  if (!model) {
    return;
  }

  emit("selectModel", {
    providerId: model.providerId,
    modelId: model.modelId,
  });
}

function serializeModel(model: AIRuntimeModelSelection) {
  return `${model.providerId}::${model.modelId}`;
}

function getModelLabel(model: AIRuntimeModelItem) {
  const label = `${model.providerName} · ${model.displayName}`;
  return model.default ? `${label}（默认）` : label;
}

function getMessageContent(message: DialogueMessageItem) {
  if (message.status === "running" && !message.content) {
    return "OpenCode 正在思考...";
  }

  return message.content;
}
</script>

<style scoped>
.dialogue-panel {
  display: flex;
  flex-direction: column;
  min-height: 620px;
  min-width: 0;
  gap: 16px;
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 16px;
  background: rgba(13, 18, 33, 0.4);
  padding: 20px;
}

.dialogue-panel-header {
  display: flex;
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
  font-size: 15px;
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
  border-radius: 12px;
  background: rgba(30, 35, 55, 0.6);
  color: #e2e8f0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.6;
}

.dialogue-message.is-user .message-body {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-top-right-radius: 4px;
}

.dialogue-message.is-assistant .message-body {
  border: 1px solid rgba(139, 92, 246, 0.2);
  background: rgba(139, 92, 246, 0.05);
  border-top-left-radius: 4px;
}

.message-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.1);
  color: #c4b5fd;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.message-actions button:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.2);
  color: #e2e8f0;
}

.dialogue-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.quick-action-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.4);
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

.dialogue-composer {
  margin-top: 8px;
}

.composer-inner {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  gap: 12px;
  transition: border-color 0.2s;
}

.composer-inner:focus-within {
  border-color: rgba(139, 92, 246, 0.4);
}

.composer-inner textarea {
  width: 100%;
  resize: none;
  border: none;
  background: transparent;
  color: #f1f5f9;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}

.composer-inner textarea::placeholder {
  color: #64748b;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
