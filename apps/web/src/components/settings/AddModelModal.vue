<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="presentation" @click.self="requestClose">
      <section class="modal-panel add-model-modal" role="dialog" aria-modal="true" aria-labelledby="add-model-title">
        <header class="modal-header">
          <div class="title-group">
            <div class="title-icon" aria-hidden="true">
              <Pencil v-if="editing" :size="20" />
              <MessageSquarePlus v-else :size="20" />
            </div>
            <div>
              <span>模型管理</span>
              <h2 id="add-model-title">{{ editing ? "编辑模型" : kind === "image" ? "添加图片模型" : "添加对话模型" }}</h2>
            </div>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" :disabled="saving" @click="requestClose">
            <X :size="19" />
          </button>
        </header>

        <div v-if="!editing" class="kind-label-bar">
          <span class="kind-label-bar-icon" :class="`is-${kind}`" aria-hidden="true">
            <MessageSquareText v-if="kind === 'text'" :size="16" />
            <Image v-else :size="16" />
          </span>
          <span>{{ kind === 'text' ? '对话模型' : '图片生成模型' }}</span>
        </div>

        <form class="create-form" :aria-busy="saving" @submit.prevent="submit">
          <div class="field-grid">
            <label class="form-field">
              <span class="field-label">显示名称 <em>*</em></span>
              <span class="input-frame">
                <input
                  ref="nameInputRef"
                  v-model.trim="form.displayName"
                  type="text"
                  placeholder="例如：GPT 对话"
                  required
                  maxlength="80"
                />
              </span>
            </label>
            <label class="form-field">
              <span class="field-label">服务商 providerId <em>*</em></span>
              <span class="input-frame">
                <input
                  v-model.trim="form.providerId"
                  type="text"
                  placeholder="例如 gpt / kimi / deepseek"
                  required
                  maxlength="64"
                />
              </span>
            </label>
            <label class="form-field">
              <span class="field-label">模型 modelId <em>*</em></span>
              <span class="input-frame">
                <input
                  v-model.trim="form.modelId"
                  type="text"
                  placeholder="例如 gpt-5.5"
                  required
                  maxlength="120"
                />
              </span>
            </label>
            <label class="form-field">
              <span class="field-label">Base URL <em>*</em></span>
              <span class="input-frame">
                <input
                  v-model.trim="form.baseUrl"
                  type="text"
                  placeholder="例如 https://api.openai.com/v1"
                  required
                />
              </span>
            </label>
            <label class="form-field is-full">
              <span class="field-label">API Key（可选）</span>
              <span class="input-frame">
                <input
                  v-model.trim="form.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="editing ? '留空则保留当前密钥' : '留空则不带凭证'"
                  spellcheck="false"
                  :disabled="clearKey"
                />
                <button class="secret-toggle" type="button" :aria-label="showKey ? '隐藏密钥' : '显示密钥'" @click="showKey = !showKey">
                  <EyeOff v-if="showKey" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </span>
              <span class="field-help">密钥仅保存在本机（Keychain），不会在页面回显。</span>
              <label v-if="editing?.configured" class="clear-key-row">
                <input v-model="clearKey" type="checkbox" />
                <span>清除已保存的密钥</span>
              </label>
            </label>
          </div>

          <p v-if="errorMessage" class="field-error" role="alert" aria-live="polite">{{ errorMessage }}</p>

          <footer class="modal-footer">
            <button class="secondary-action" type="button" :disabled="saving" @click="requestClose">取消</button>
            <button class="primary-action" type="submit" :disabled="saving || !canSubmit">
              <Pencil v-if="editing" :size="16" />
              <Plus v-else :size="16" />
              <span>{{ saving ? "保存中..." : editing ? "保存修改" : "添加模型" }}</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Eye, EyeOff, Image, MessageSquarePlus, MessageSquareText, Pencil, Plus, X } from "lucide-vue-next";
import type { CreateManagedModelRequest, ManagedModelItem, ManagedModelKind, UpdateManagedModelRequest } from "@airoaming/shared";

const props = defineProps<{
  open: boolean;
  initialKind: ManagedModelKind;
  editing: ManagedModelItem | null;
  saving: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  create: [input: CreateManagedModelRequest];
  update: [id: string, input: UpdateManagedModelRequest];
}>();

const kind = ref<ManagedModelKind>("text");
const showKey = ref(false);
const clearKey = ref(false);
const nameInputRef = ref<HTMLInputElement | null>(null);
const form = reactive({
  displayName: "",
  providerId: "",
  modelId: "",
  baseUrl: "",
  apiKey: "",
});

const canSubmit = computed(() => {
  return form.displayName.trim().length > 0
    && form.providerId.trim().length > 0
    && form.modelId.trim().length > 0
    && form.baseUrl.trim().length > 0;
});

/** 去掉服务端错误码前缀(如 MANAGED_MODEL_SECRET_UNSUPPORTED_IN_DB:),只展示可读信息 */
function formatErrorMessage(message: string): string {
  return message.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/, "");
}

/* 本地留存最近一次错误:页面 toast 自动消失会清空 store error,弹窗内联错误需保留到下次打开 */
const localError = ref<string | null>(null);
const errorMessage = computed(() => localError.value);

watch(
  () => props.error,
  (error) => {
    if (error) {
      localError.value = formatErrorMessage(error);
    }
  },
);

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      return;
    }
    const editing = props.editing;
    kind.value = editing?.kind ?? props.initialKind;
    form.displayName = editing?.displayName ?? "";
    form.providerId = editing?.providerId ?? "";
    form.modelId = editing?.modelId ?? "";
    form.baseUrl = editing?.baseUrl ?? "";
    form.apiKey = "";
    showKey.value = false;
    clearKey.value = false;
    localError.value = null;
    await nextTick();
    nameInputRef.value?.focus();
  },
);

function requestClose() {
  if (!props.saving) {
    emit("close");
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && props.open) {
    requestClose();
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

function submit() {
  if (!canSubmit.value || props.saving) {
    return;
  }
  if (props.editing) {
    emit("update", props.editing.id, {
      displayName: form.displayName.trim(),
      providerId: form.providerId.trim(),
      modelId: form.modelId.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim() || undefined,
      clearApiKey: clearKey.value || undefined,
    });
    return;
  }
  emit("create", {
    kind: kind.value,
    displayName: form.displayName.trim(),
    providerId: form.providerId.trim(),
    modelId: form.modelId.trim(),
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim() || undefined,
  });
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 18%, rgba(92, 62, 255, 0.2), transparent 36%),
    rgba(2, 6, 16, 0.78);
  backdrop-filter: blur(10px);
}

.add-model-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border: 1px solid rgba(105, 88, 255, 0.24);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(13, 21, 39, 0.98), rgba(6, 12, 26, 0.98)),
    #08101f;
  box-shadow:
    0 34px 90px rgba(0, 0, 0, 0.56),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 80px;
  padding: 16px 20px 16px 24px;
  border-bottom: 1px solid rgba(123, 104, 255, 0.14);
  background:
    linear-gradient(90deg, rgba(123, 104, 255, 0.14), transparent 58%),
    rgba(8, 15, 31, 0.74);
}

.title-group {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.title-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(157, 139, 255, 0.32);
  border-radius: 12px;
  color: #ded8ff;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(79, 70, 229, 0.92));
  box-shadow: 0 14px 30px rgba(91, 69, 255, 0.32);
}

.modal-header span {
  color: #9c87ff;
  font-size: 13px;
  font-weight: 900;
}

.modal-header h2 {
  margin: 5px 0 0;
  color: #f8fbff;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.2;
}

.icon-button {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(206, 216, 244, 0.16);
  border-radius: 10px;
  color: #cbd6ee;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.icon-button:hover {
  border-color: rgba(206, 216, 244, 0.28);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.kind-label-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(123, 104, 255, 0.1);
  background: rgba(8, 15, 31, 0.5);
  padding: 12px 24px;
  color: #f8fbff;
  font-size: 13px;
  font-weight: 800;
}

.kind-label-bar-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
}

.kind-label-bar-icon.is-text {
  border: 1px solid rgba(157, 139, 255, 0.3);
  background: rgba(124, 58, 237, 0.14);
  color: #c4b5fd;
}

.kind-label-bar-icon.is-image {
  border: 1px solid rgba(34, 199, 169, 0.3);
  background: rgba(34, 199, 169, 0.1);
  color: #8df0dc;
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 22px 24px 24px;
  background:
    radial-gradient(circle at 76% 0%, rgba(34, 199, 169, 0.07), transparent 32%),
    rgba(6, 12, 26, 0.42);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.form-field.is-full {
  grid-column: 1 / -1;
}

.field-label {
  color: #e5ebf7;
  font-size: 13px;
  font-weight: 800;
}

.field-label em {
  color: #a78bfa;
  font-style: normal;
}

.field-help {
  color: #8190aa;
  font-size: 11px;
  line-height: 1.5;
}

.clear-key-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #f0b45c;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.clear-key-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #7c3aed;
  cursor: pointer;
}

.field-error {
  margin: 0;
  border: 1px solid rgba(255, 112, 112, 0.24);
  border-radius: 10px;
  background: rgba(255, 112, 112, 0.08);
  color: #ff9d9d;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
}

.input-frame {
  position: relative;
  display: flex;
  align-items: center;
}

.input-frame input {
  width: 100%;
  min-height: 46px;
  border: 1px solid rgba(206, 216, 244, 0.14);
  border-radius: 12px;
  outline: none;
  background: rgba(255, 255, 255, 0.045);
  color: #f8fbff;
  padding: 0 14px;
  font-size: 14px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.input-frame input::placeholder {
  color: #6f7c94;
}

.input-frame input:focus {
  border-color: rgba(142, 121, 255, 0.74);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.16);
}

.input-frame:has(.secret-toggle) input {
  padding-right: 48px;
}

.secret-toggle {
  position: absolute;
  right: 8px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.secret-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 2px;
}

.secondary-action,
.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  border-radius: 10px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 850;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.secondary-action {
  border: 1px solid rgba(206, 216, 244, 0.16);
  color: #d8e2f6;
  background: rgba(255, 255, 255, 0.035);
}

.primary-action {
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  color: #ffffff;
  background: linear-gradient(135deg, #7c3aed, #4f46e5 56%, #22c7a9);
  box-shadow: 0 16px 36px rgba(91, 69, 255, 0.34);
}

.secondary-action:hover,
.primary-action:hover {
  transform: translateY(-1px);
}

.secondary-action:disabled,
.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

@media (max-width: 560px) {
  .modal-backdrop {
    padding: 16px;
  }

  .modal-header {
    padding: 14px 16px;
  }

  .create-form {
    padding: 18px;
  }

  .kind-label-bar {
    padding: 10px 16px;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .secondary-action,
  .primary-action {
    width: 100%;
  }
}
</style>
