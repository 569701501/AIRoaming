<template>
  <main class="settings-page" aria-label="设置">
    <aside class="settings-nav" aria-label="设置导航">
      <button
        v-for="item in tabs"
        :key="item.key"
        type="button"
        class="settings-nav-btn"
        :class="{ 'is-active': activeTab === item.key }"
        @click="activeTab = item.key"
      >
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
    </aside>

    <section class="settings-main">
      <div class="settings-heading">
        <div>
          <span>设置</span>
          <h1>{{ activeTabLabel }}</h1>
        </div>
        <button class="settings-icon-btn" type="button" title="刷新设置" :disabled="settings.loading" @click="reload">
          <RefreshCw :size="18" />
        </button>
      </div>

      <section v-if="activeTab === 'models'" class="settings-panel">
        <div class="panel-title-row">
          <div>
            <span>模型管理</span>
            <h2>对话与图片模型</h2>
          </div>
        </div>
        <p class="panel-hint">
          <Check :size="14" />
          <span>点击「设为当前」切换生效模型；当前生效的模型不可删除</span>
        </p>

        <section v-for="group in modelGroups" :key="group.kind" class="model-section">
          <div class="model-section-head">
            <div class="model-section-title">
              <span class="model-section-icon" :class="`is-${group.kind}`" aria-hidden="true">
                <component :is="group.icon" :size="15" />
              </span>
              <strong>{{ group.label }}</strong>
              <span class="model-count">{{ group.models.length }}</span>
            </div>
            <button class="model-add-btn" type="button" :disabled="settings.saving" @click="openAddForm(group.kind)">
              <Plus :size="14" />
              <span>{{ group.addLabel }}</span>
            </button>
          </div>

          <div v-if="group.models.length === 0" class="model-empty">
            <component :is="group.icon" :size="18" />
            <span>还没有{{ group.label }}，点击右上角按钮添加。</span>
          </div>

          <ul class="model-list">
            <li
              v-for="model in group.models"
              :key="model.id"
              class="model-card"
              :class="{ 'is-active': model.active, 'is-unconfigured': !model.configured }"
            >
              <span class="model-avatar" :class="`is-${group.kind}`" aria-hidden="true">{{ modelInitial(model) }}</span>
              <div class="model-card-body">
                <div class="model-card-title">
                  <strong :title="model.displayName">{{ model.displayName }}</strong>
                  <span v-if="model.active" class="model-active-badge">
                    <Check :size="11" />
                    <span>使用中</span>
                  </span>
                </div>
                <span class="model-card-meta" :title="`${model.providerId} / ${model.modelId}`">
                  {{ model.providerId }} · {{ model.modelId }}<template v-if="model.baseUrl"> · {{ model.baseUrl }}</template>
                </span>
                <span class="model-key-status" :class="{ 'is-ok': model.configured }">
                  <KeyRound v-if="model.configured" :size="12" />
                  <AlertTriangle v-else :size="12" />
                  <span>{{ model.configured ? "已配置密钥" : "未配置密钥，切换前请先编辑补充" }}</span>
                </span>
              </div>
              <div class="model-card-actions">
                <button
                  v-if="!model.active"
                  class="model-use-btn"
                  :class="{ 'is-warn': !model.configured }"
                  type="button"
                  :disabled="settings.saving"
                  @click="activateModel(model)"
                >
                  设为当前
                </button>
                <span v-else class="model-use-placeholder" aria-hidden="true"></span>
                <div class="model-icon-actions">
                  <button class="model-icon-btn" type="button" title="编辑模型" :disabled="settings.saving" @click="openEditForm(model)">
                    <Pencil :size="14" />
                  </button>
                  <button
                    v-if="pendingDeleteId === model.id"
                    class="model-delete-confirm"
                    type="button"
                    :disabled="settings.saving"
                    @click="confirmDeleteModel(model)"
                  >
                    确认删除？
                  </button>
                  <button
                    v-else
                    class="model-icon-btn is-danger"
                    type="button"
                    :disabled="settings.saving || model.active"
                    :title="model.active ? '当前生效，先切换其他模型再删除' : '删除该模型'"
                    @click="requestDeleteModel(model)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </section>

      <section v-else class="settings-panel">
        <div class="panel-title-row">
          <div>
            <span>界面</span>
            <h2>外观设置</h2>
          </div>
        </div>

        <div class="theme-options" role="radiogroup" aria-label="外观主题">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="theme-option"
            :class="{ 'is-active': appearanceTheme === option.value }"
            :aria-checked="appearanceTheme === option.value"
            role="radio"
            @click="saveAppearance(option.value)"
          >
            <component :is="option.icon" :size="20" />
            <span>{{ option.label }}</span>
            <Check v-if="appearanceTheme === option.value" :size="16" />
          </button>
        </div>
      </section>
    </section>

    <Teleport to="body">
      <Transition name="settings-toast">
        <div v-if="activeToast" class="settings-toast" :class="`is-${activeToast.type}`" role="alert" aria-live="polite">
          <AlertCircle v-if="activeToast.type === 'error'" :size="16" />
          <CheckCircle2 v-else :size="16" />
          <span class="settings-toast-text">{{ activeToast.message }}</span>
          <button class="settings-toast-close" type="button" aria-label="关闭提示" @click="dismissToast">
            <X :size="14" />
          </button>
        </div>
      </Transition>
    </Teleport>

    <AddModelModal
      :open="addFormOpen"
      :initial-kind="addFormKind"
      :editing="editingModel"
      :saving="settings.saving"
      :error="settings.error"
      @close="closeModelForm"
      @create="handleCreateModel"
      @update="handleUpdateModel"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { AppearanceTheme, CreateManagedModelRequest, ManagedModelItem, ManagedModelKind, UpdateManagedModelRequest } from "@airoaming/shared";
import { AlertCircle, AlertTriangle, Boxes, Check, CheckCircle2, Image, KeyRound, MessageSquareText, Monitor, Moon, Palette, Pencil, Plus, RefreshCw, Sun, Trash2, X } from "lucide-vue-next";
import AddModelModal from "./AddModelModal.vue";
import { useSettingsStore } from "../../stores/settings-store";

const settings = useSettingsStore();
const activeTab = ref<"models" | "appearance">("models");
const addFormOpen = ref(false);
const addFormKind = ref<ManagedModelKind>("text");
const editingModel = ref<ManagedModelItem | null>(null);
const pendingDeleteId = ref<string | null>(null);
let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null;

const textModels = computed(() => (settings.settings?.models ?? []).filter((model) => model.kind === "text"));
const imageModels = computed(() => (settings.settings?.models ?? []).filter((model) => model.kind === "image"));

const modelGroups = computed(() => [
  { kind: "text" as const, label: "对话模型", icon: MessageSquareText, models: textModels.value, addLabel: "添加对话模型" },
  { kind: "image" as const, label: "图片生成模型", icon: Image, models: imageModels.value, addLabel: "添加图片模型" },
]);

const tabs = [
  { key: "models", label: "模型管理", icon: Boxes },
  { key: "appearance", label: "外观设置", icon: Palette },
] as const;

const themeOptions = [
  { value: "dark", label: "深色", icon: Moon },
  { value: "light", label: "浅色", icon: Sun },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const satisfies ReadonlyArray<{
  value: AppearanceTheme;
  label: string;
  icon: typeof Moon;
}>;

const activeTabLabel = computed(() => tabs.find((item) => item.key === activeTab.value)?.label ?? "设置");
const appearanceTheme = computed(() => settings.settings?.appearance.theme ?? "dark");
const visibleNotice = computed(() => settings.noticeScope === activeTab.value ? settings.notice : null);

const TOAST_DURATION_MS = 4500;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** 去掉服务端错误码前缀(如 MANAGED_MODEL_SECRET_UNSUPPORTED_IN_DB:),只展示可读信息 */
function formatToastMessage(message: string): string {
  return message.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/, "");
}

const activeToast = computed<{ type: "error" | "success"; message: string } | null>(() => {
  if (settings.error) {
    return { type: "error", message: formatToastMessage(settings.error) };
  }
  if (visibleNotice.value) {
    return { type: "success", message: visibleNotice.value };
  }
  return null;
});

watch(activeToast, (toast) => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toast) {
    toastTimer = setTimeout(() => {
      toastTimer = null;
      settings.clearFeedback();
    }, TOAST_DURATION_MS);
  }
});

onUnmounted(() => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
});

function dismissToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  settings.clearFeedback();
}

async function reload() {
  await settings.loadSettings();
}

async function saveAppearance(theme: AppearanceTheme) {
  await settings.saveAppearance({ theme });
}

function openAddForm(kind: ManagedModelKind) {
  editingModel.value = null;
  addFormKind.value = kind;
  addFormOpen.value = true;
}

function openEditForm(model: ManagedModelItem) {
  editingModel.value = model;
  addFormKind.value = model.kind;
  addFormOpen.value = true;
}

function closeModelForm() {
  addFormOpen.value = false;
  editingModel.value = null;
}

function modelInitial(model: ManagedModelItem): string {
  const initial = model.displayName.trim().charAt(0);
  return initial ? initial.toUpperCase() : "?";
}

async function handleCreateModel(input: CreateManagedModelRequest) {
  await settings.createManagedModel(input);
  if (!settings.error) {
    closeModelForm();
  }
}

async function handleUpdateModel(id: string, input: UpdateManagedModelRequest) {
  await settings.updateManagedModel(id, input);
  if (!settings.error) {
    closeModelForm();
  }
}

async function activateModel(model: ManagedModelItem) {
  if (model.active || settings.saving) {
    return;
  }
  await settings.activateManagedModel(model.id);
}

function requestDeleteModel(model: ManagedModelItem) {
  if (model.active || settings.saving) {
    return;
  }
  if (pendingDeleteTimer) {
    clearTimeout(pendingDeleteTimer);
  }
  pendingDeleteId.value = model.id;
  pendingDeleteTimer = setTimeout(() => {
    pendingDeleteId.value = null;
    pendingDeleteTimer = null;
  }, 3000);
}

async function confirmDeleteModel(model: ManagedModelItem) {
  if (model.active || settings.saving) {
    return;
  }
  if (pendingDeleteTimer) {
    clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = null;
  }
  pendingDeleteId.value = null;
  await settings.deleteManagedModel(model.id);
}
</script>

<style scoped>
.settings-page {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 24px;
}

.settings-nav,
.settings-panel {
  border: 1px solid rgba(202, 211, 240, 0.14);
  border-radius: 8px;
  background: rgba(15, 18, 28, 0.82);
}

.settings-nav {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 10px;
}

.settings-nav-btn {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #8d98b4;
  padding: 0 10px;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
}

.settings-nav-btn.is-active {
  border-color: rgba(139, 92, 246, 0.4);
  background: rgba(139, 92, 246, 0.14);
  color: #f8fbff;
}

.settings-main {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.settings-heading,
.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.settings-heading span,
.panel-title-row span {
  color: #b3a5ff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.settings-heading h1,
.panel-title-row h2 {
  margin: 3px 0 0;
  color: #f8fbff;
  font-size: 24px;
  letter-spacing: 0;
}

.panel-title-row h2 {
  font-size: 20px;
}

.panel-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: #8f97b3;
  font-size: 12px;
}

.panel-hint span {
  color: #aeb8cf;
}

.settings-icon-btn {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(204, 215, 245, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #cfd8ee;
}

.settings-toast {
  position: fixed;
  z-index: 120;
  top: 18px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(520px, calc(100vw - 48px));
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
}

.settings-toast.is-error {
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(69, 18, 24, 0.92);
  color: #fecaca;
}

.settings-toast.is-success {
  border: 1px solid rgba(34, 197, 94, 0.36);
  background: rgba(13, 51, 32, 0.92);
  color: #bbf7d0;
}

.settings-toast-text {
  min-width: 0;
  overflow-wrap: break-word;
}

.settings-toast-close {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}

.settings-toast-close:hover {
  background: rgba(255, 255, 255, 0.1);
  opacity: 1;
}

.settings-toast-enter-active,
.settings-toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.settings-toast-enter-from,
.settings-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}

.settings-panel {
  display: grid;
  gap: 20px;
  padding: 18px;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.theme-option {
  display: grid;
  grid-template-columns: 24px 1fr 18px;
  align-items: center;
  gap: 10px;
  min-height: 74px;
  border: 1px solid rgba(204, 215, 245, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
  color: #cbd5e1;
  padding: 0 14px;
  text-align: left;
  font-weight: 600;
}

.theme-option.is-active {
  border-color: rgba(139, 92, 246, 0.45);
  background: rgba(139, 92, 246, 0.12);
  color: #f8fbff;
}

@media (max-width: 860px) {
  .settings-page {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .settings-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .theme-options {
    grid-template-columns: 1fr;
  }
}

.model-section {
  display: grid;
  gap: 12px;
}

.model-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 2px;
}

.model-section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.model-section-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
}

.model-section-icon.is-text {
  border: 1px solid rgba(157, 139, 255, 0.3);
  background: rgba(124, 58, 237, 0.14);
  color: #c4b5fd;
}

.model-section-icon.is-image {
  border: 1px solid rgba(34, 199, 169, 0.3);
  background: rgba(34, 199, 169, 0.1);
  color: #8df0dc;
}

.model-section-title > strong {
  color: #f8fbff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.model-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  color: #aeb8cf;
  padding: 0 7px;
  font-size: 11px;
  font-weight: 800;
}

.model-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid rgba(142, 121, 255, 0.42);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(79, 70, 229, 0.1));
  color: #c4b5fd;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.model-add-btn:hover:not(:disabled) {
  border-color: rgba(142, 121, 255, 0.7);
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.26), rgba(79, 70, 229, 0.16));
  color: #f1f5f9;
  transform: translateY(-1px);
}

.model-add-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.model-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgba(204, 215, 245, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  color: #8a94ab;
  padding: 22px 16px;
  font-size: 12px;
  line-height: 1.6;
}

.model-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.model-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 76px;
  overflow: hidden;
  border: 1px solid rgba(206, 216, 244, 0.12);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018)),
    rgba(10, 16, 30, 0.5);
  padding: 12px 14px;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.model-card::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: transparent;
  content: "";
  transition: background 0.18s ease;
}

.model-card:hover {
  border-color: rgba(142, 121, 255, 0.32);
  background:
    linear-gradient(180deg, rgba(124, 58, 237, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(10, 16, 30, 0.6);
}

.model-card.is-active {
  border-color: rgba(142, 121, 255, 0.65);
  background:
    linear-gradient(90deg, rgba(124, 58, 237, 0.16), rgba(79, 70, 229, 0.05) 62%),
    rgba(10, 16, 30, 0.6);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.model-card.is-active::before {
  background: linear-gradient(180deg, #9d8bff, #7c3aed);
}

.model-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 900;
}

.model-avatar.is-text {
  border: 1px solid rgba(157, 139, 255, 0.32);
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.85), rgba(79, 70, 229, 0.8));
  color: #ede9fe;
}

.model-avatar.is-image {
  border: 1px solid rgba(34, 199, 169, 0.3);
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.75), rgba(34, 199, 169, 0.55));
  color: #e6fffa;
}

.model-card-body {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 4px;
}

.model-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.model-card-title strong {
  overflow: hidden;
  color: #f8fbff;
  font-size: 14px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-active-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  border: 1px solid rgba(157, 139, 255, 0.42);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.2);
  color: #d8ccff;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 800;
}

.model-card-meta {
  overflow: hidden;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-key-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #f0b45c;
  font-size: 11px;
  font-weight: 700;
}

.model-key-status.is-ok {
  color: #6fdcc3;
}

.model-card-actions {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  justify-items: end;
}

.model-use-btn {
  min-height: 30px;
  border: 1px solid rgba(142, 121, 255, 0.5);
  border-radius: 8px;
  background: rgba(124, 58, 237, 0.14);
  color: #d8ccff;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.model-use-btn:hover:not(:disabled) {
  border-color: rgba(142, 121, 255, 0.85);
  background: rgba(124, 58, 237, 0.28);
  color: #ffffff;
}

.model-use-btn.is-warn {
  border-color: rgba(240, 180, 92, 0.45);
  background: rgba(240, 180, 92, 0.1);
  color: #f4cd8d;
}

.model-use-btn.is-warn:hover:not(:disabled) {
  border-color: rgba(240, 180, 92, 0.75);
  background: rgba(240, 180, 92, 0.18);
}

.model-use-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.model-use-placeholder {
  display: block;
  height: 30px;
}

.model-icon-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.model-icon-btn:hover:not(:disabled) {
  border-color: rgba(142, 121, 255, 0.3);
  background: rgba(124, 58, 237, 0.12);
  color: #d8ccff;
}

.model-icon-btn.is-danger:hover:not(:disabled) {
  border-color: rgba(248, 113, 113, 0.24);
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
}

.model-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.model-delete-confirm {
  min-height: 30px;
  border: 1px solid rgba(248, 113, 113, 0.5);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  animation: delete-confirm-in 0.15s ease;
}

.model-delete-confirm:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.28);
  color: #ffffff;
}

@keyframes delete-confirm-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 560px) {
  .model-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .model-card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .model-use-placeholder {
    display: none;
  }
}
</style>
