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

      <div v-if="settings.error" class="settings-alert is-error">
        {{ settings.error }}
      </div>
      <div v-else-if="visibleNotice" class="settings-alert is-success">
        {{ visibleNotice }}
      </div>

      <form v-if="activeTab === 'ai-key'" class="settings-panel" @submit.prevent="saveAIKey">
        <div class="panel-title-row">
          <div>
            <span>OpenCode 对话</span>
            <h2>AI 密钥</h2>
          </div>
          <span class="status-pill" :class="{ 'is-ready': aiKeyStatus.configured }">
            {{ aiKeyStatus.configured ? "已配置" : "未配置" }}
          </span>
        </div>

        <p class="panel-hint">
          <Check :size="14" />
          <span>密钥仅保存在本机，不会在页面回显</span>
        </p>

        <div class="field-grid">
          <label>
            <span>服务商</span>
            <select v-model="aiForm.providerId" @change="onTextProviderChange">
              <option v-for="provider in providerOptions" :key="provider.providerId" :value="provider.providerId">
                {{ provider.providerName }}
              </option>
            </select>
          </label>
          <label>
            <span>模型</span>
            <input v-model.trim="aiForm.modelId" autocomplete="off" placeholder="gpt-5.5" />
          </label>
          <label class="is-wide">
            <span>Base URL</span>
            <input v-model.trim="aiForm.baseUrl" autocomplete="off" placeholder="可选，例如 https://api.openai.com/v1" />
          </label>
          <label class="is-wide">
            <span>API Key</span>
            <div class="secret-input">
              <input
                v-model.trim="aiForm.apiKey"
                autocomplete="off"
                placeholder="留空则保留当前密钥"
                spellcheck="false"
                :type="showAiKey ? 'text' : 'password'"
              />
              <button type="button" :aria-label="showAiKey ? '隐藏密钥' : '显示密钥'" @click="showAiKey = !showAiKey">
                <EyeOff v-if="showAiKey" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>
        </div>

        <div class="key-meta">
          <div>
            <span>当前密钥</span>
            <strong>{{ aiKeyStatus.configured ? "已配置（不显示明文）" : "未配置" }}</strong>
          </div>
          <div>
            <span>指纹</span>
            <strong>{{ aiKeyStatus.keyFingerprint ?? "无" }}</strong>
          </div>
          <div>
            <span>更新时间</span>
            <strong>{{ aiKeyStatus.updatedAt ? formatTime(aiKeyStatus.updatedAt) : "无" }}</strong>
          </div>
        </div>

        <div class="settings-actions">
          <button class="secondary-action" type="button" :disabled="settings.saving || !aiKeyStatus.configured" @click="clearAIKey">
            <Trash2 :size="16" />
            <span>清除密钥</span>
          </button>
          <button class="primary-action" type="submit" :disabled="settings.saving">
            <Save :size="16" />
            <span>{{ settings.saving ? "保存中" : "保存密钥" }}</span>
          </button>
        </div>
      </form>

      <section v-else-if="activeTab === 'image-provider'" class="settings-panel">
        <div class="panel-title-row">
          <div>
            <span>角色与候选图</span>
            <h2>图片生成</h2>
          </div>
          <span class="status-pill" :class="{ 'is-ready': activeImageProviderStatus.configured }">
            {{ activeImageProviderStatus.configured ? "已配置" : "未配置" }}
          </span>
        </div>

        <label class="provider-switch">
          <span>当前生效的服务商</span>
          <select :value="settings.settings?.activeImageProvider" :disabled="settings.saving" @change="onSwitchProvider">
            <option value="openai">OpenAI 图片生成</option>
            <option value="doubao">豆包图片生成</option>
            <option value="grok">Grok 图片生成</option>
            <option value="runware">Runware 图片生成（低成本）</option>
          </select>
        </label>

        <form v-if="settings.settings?.activeImageProvider === 'openai'" class="provider-form" @submit.prevent="saveOpenaiProvider">
          <div class="provider-form-head">
            <strong>OpenAI 图片生成</strong>
            <span class="status-pill" :class="{ 'is-ready': openaiImageProviderStatus.configured }">
              {{ openaiImageProviderStatus.configured ? "已配置" : "未配置" }}
            </span>
          </div>
          <div class="field-grid">
            <label>
              <span>服务商</span>
              <input v-model.trim="openaiImageForm.providerName" autocomplete="off" />
            </label>
            <label>
              <span>模型</span>
              <input v-model.trim="openaiImageForm.modelId" autocomplete="off" placeholder="gpt-image-2" />
            </label>
            <label class="is-wide">
              <span>Base URL</span>
              <input v-model.trim="openaiImageForm.baseUrl" autocomplete="off" placeholder="例如 https://api.example.com/v1" />
            </label>
            <label class="is-wide">
              <span>API Key</span>
              <input
                v-model.trim="openaiImageForm.apiKey"
                autocomplete="new-password"
                placeholder="留空则保留当前密钥"
                type="password"
              />
            </label>
          </div>
          <div class="settings-actions">
            <button class="secondary-action" type="button" :disabled="settings.saving || !openaiImageProviderStatus.configured" @click="clearOpenaiProvider">
              <Trash2 :size="16" />
              <span>清除密钥</span>
            </button>
            <button class="primary-action" type="submit" :disabled="settings.saving">
              <Save :size="16" />
              <span>{{ settings.saving ? "保存中" : "保存 OpenAI 设置" }}</span>
            </button>
          </div>
        </form>

        <form v-else-if="settings.settings?.activeImageProvider === 'grok'" class="provider-form" @submit.prevent="saveGrokProvider">
          <div class="provider-form-head">
            <strong>Grok 图片生成</strong>
            <span class="status-pill" :class="{ 'is-ready': grokImageProviderStatus.configured }">
              {{ grokImageProviderStatus.configured ? "已配置" : "未配置" }}
            </span>
          </div>
          <div class="field-grid">
            <label>
              <span>服务商</span>
              <input v-model.trim="grokImageForm.providerName" autocomplete="off" placeholder="Grok 图片生成" />
            </label>
            <label>
              <span>模型</span>
              <input v-model.trim="grokImageForm.modelId" autocomplete="off" placeholder="grok-imagine-image-quality" />
            </label>
            <label class="is-wide">
              <span>Base URL</span>
              <input v-model.trim="grokImageForm.baseUrl" autocomplete="off" placeholder="https://api.x.ai/v1 或你的中转地址" />
            </label>
            <label class="is-wide">
              <span>API Key</span>
              <input
                v-model.trim="grokImageForm.apiKey"
                autocomplete="new-password"
                placeholder="留空则保留当前密钥"
                type="password"
              />
            </label>
          </div>
          <div class="settings-actions">
            <button class="secondary-action" type="button" :disabled="settings.saving || !grokImageProviderStatus.configured" @click="clearGrokProvider">
              <Trash2 :size="16" />
              <span>清除密钥</span>
            </button>
            <button class="primary-action" type="submit" :disabled="settings.saving">
              <Save :size="16" />
              <span>{{ settings.saving ? "保存中" : "保存 Grok 设置" }}</span>
            </button>
          </div>
        </form>

        <form v-else-if="settings.settings?.activeImageProvider === 'runware'" class="provider-form" @submit.prevent="saveRunwareProvider">
          <div class="provider-form-head">
            <strong>Runware 图片生成</strong>
            <span class="status-pill" :class="{ 'is-ready': runwareImageProviderStatus.configured }">
              {{ runwareImageProviderStatus.configured ? "已配置" : "未配置" }}
            </span>
          </div>
          <div class="provider-note">
            <strong>低成本管线</strong>
            <span>无参考图默认用 FLUX.1 Schnell；挑中草稿后用 FLUX.2 Dev 精修；多角色/场景参考自动改用 FLUX.1 Dev + IP-Adapter。</span>
          </div>
          <div class="field-grid">
            <label>
              <span>服务商</span>
              <input v-model.trim="runwareImageForm.providerName" autocomplete="off" placeholder="Runware 图片生成" />
            </label>
            <label>
              <span>草稿模型（无参考图）</span>
              <input v-model.trim="runwareImageForm.modelId" autocomplete="off" placeholder="runware:100@1" />
            </label>
            <label class="is-wide">
              <span>API 地址</span>
              <input v-model.trim="runwareImageForm.baseUrl" autocomplete="off" placeholder="https://api.runware.ai/v1" />
            </label>
            <label class="is-wide">
              <span>API Key</span>
              <input
                v-model.trim="runwareImageForm.apiKey"
                autocomplete="new-password"
                placeholder="留空则保留当前密钥"
                type="password"
              />
            </label>
          </div>
          <div class="settings-actions">
            <button class="secondary-action" type="button" :disabled="settings.saving || !runwareImageProviderStatus.configured" @click="clearRunwareProvider">
              <Trash2 :size="16" />
              <span>清除密钥</span>
            </button>
            <button class="primary-action" type="submit" :disabled="settings.saving">
              <Save :size="16" />
              <span>{{ settings.saving ? "保存中" : "保存 Runware 设置" }}</span>
            </button>
          </div>
        </form>

        <form v-else class="provider-form" @submit.prevent="saveDoubaoProvider">
          <div class="provider-form-head">
            <strong>豆包图片生成</strong>
            <span class="status-pill" :class="{ 'is-ready': doubaoImageProviderStatus.configured }">
              {{ doubaoImageProviderStatus.configured ? "已配置" : "未配置" }}
            </span>
          </div>
          <div class="field-grid">
            <label>
              <span>服务商</span>
              <input v-model.trim="doubaoImageForm.providerName" autocomplete="off" placeholder="豆包图片生成" />
            </label>
            <label>
              <span>模型</span>
              <input v-model.trim="doubaoImageForm.modelId" autocomplete="off" placeholder="doubao-seedream-4-5-251128" />
            </label>
            <label class="is-wide">
              <span>Base URL</span>
              <input v-model.trim="doubaoImageForm.baseUrl" autocomplete="off" placeholder="https://ark.cn-beijing.volces.com/api/v3" />
            </label>
            <label class="is-wide">
              <span>API Key</span>
              <input
                v-model.trim="doubaoImageForm.apiKey"
                autocomplete="new-password"
                placeholder="留空则保留当前密钥"
                type="password"
              />
            </label>
          </div>
          <div class="settings-actions">
            <button class="secondary-action" type="button" :disabled="settings.saving || !doubaoImageProviderStatus.configured" @click="clearDoubaoProvider">
              <Trash2 :size="16" />
              <span>清除密钥</span>
            </button>
            <button class="primary-action" type="submit" :disabled="settings.saving">
              <Save :size="16" />
              <span>{{ settings.saving ? "保存中" : "保存豆包设置" }}</span>
            </button>
          </div>
        </form>
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
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { AppearanceTheme, ImageProviderType } from "@airoaming/shared";
import { Check, Eye, EyeOff, ImagePlus, KeyRound, Monitor, Moon, Palette, RefreshCw, Save, Sun, Trash2 } from "lucide-vue-next";
import { useSettingsStore } from "../../stores/settings-store";

const settings = useSettingsStore();
const activeTab = ref<"ai-key" | "image-provider" | "appearance">("ai-key");
const showAiKey = ref(false);
const aiForm = reactive({
  providerId: "self",
  providerName: "自定义 OpenAI 兼容",
  modelId: "gpt-5.5",
  baseUrl: "",
  apiKey: "",
});
const openaiImageForm = reactive({
  providerId: "openai_image",
  providerName: "OpenAI 图片生成",
  modelId: "gpt-image-2",
  baseUrl: "",
  apiKey: "",
});
const doubaoImageForm = reactive({
  providerId: "doubao_image",
  providerName: "豆包图片生成",
  modelId: "doubao-seedream-4-5-251128",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: "",
});
const grokImageForm = reactive({
  providerId: "grok_image",
  providerName: "Grok 图片生成",
  modelId: "grok-imagine-image-quality",
  baseUrl: "https://api.x.ai/v1",
  apiKey: "",
});
const runwareImageForm = reactive({
  providerId: "runware_image",
  providerName: "Runware 图片生成",
  modelId: "runware:100@1",
  baseUrl: "https://api.runware.ai/v1",
  apiKey: "",
});

const tabs = [
  { key: "ai-key", label: "AI 密钥", icon: KeyRound },
  { key: "image-provider", label: "图片生成", icon: ImagePlus },
  { key: "appearance", label: "外观设置", icon: Palette },
] as const;

const providerOptions = [
  { providerId: "self", providerName: "自定义 OpenAI 兼容" },
  { providerId: "gpt", providerName: "GPT 对话" },
  { providerId: "xai", providerName: "xAI Grok 对话" },
  { providerId: "kimi", providerName: "Moonshot Kimi 对话" },
  { providerId: "deepseek", providerName: "DeepSeek 对话" },
  { providerId: "mimo", providerName: "Xiaomi MiMo 对话" },
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
const aiKeyStatus = computed(() => settings.settings?.aiKey ?? {
  providerId: "self",
  providerName: "自定义 OpenAI 兼容",
  modelId: "gpt-5.5",
  baseUrl: null,
  configured: false,
  keyPreview: null,
  keyFingerprint: null,
  updatedAt: null,
});
const openaiImageProviderStatus = computed(() => settings.settings?.openaiImageProvider ?? {
  providerId: "openai_image",
  providerName: "OpenAI 图片生成",
  modelId: "gpt-image-2",
  baseUrl: null,
  configured: false,
  keyPreview: null,
  keyFingerprint: null,
  updatedAt: null,
});
const doubaoImageProviderStatus = computed(() => settings.settings?.doubaoImageProvider ?? {
  providerId: "doubao_image",
  providerName: "豆包图片生成",
  modelId: "doubao-seedream-4-5-251128",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  configured: false,
  keyPreview: null,
  keyFingerprint: null,
  updatedAt: null,
});
const grokImageProviderStatus = computed(() => settings.settings?.grokImageProvider ?? {
  providerId: "grok_image",
  providerName: "Grok 图片生成",
  modelId: "grok-imagine-image-quality",
  baseUrl: "https://api.x.ai/v1",
  configured: false,
  keyPreview: null,
  keyFingerprint: null,
  updatedAt: null,
});
const runwareImageProviderStatus = computed(() => settings.settings?.runwareImageProvider ?? {
  providerId: "runware_image",
  providerName: "Runware 图片生成",
  modelId: "runware:100@1",
  baseUrl: "https://api.runware.ai/v1",
  configured: false,
  keyPreview: null,
  keyFingerprint: null,
  updatedAt: null,
});
/** 当前生效 provider 的状态(用于顶部标题徽章) */
const activeImageProviderStatus = computed(() => {
  if (settings.settings?.activeImageProvider === "doubao") {
    return doubaoImageProviderStatus.value;
  }
  if (settings.settings?.activeImageProvider === "grok") {
    return grokImageProviderStatus.value;
  }
  if (settings.settings?.activeImageProvider === "runware") {
    return runwareImageProviderStatus.value;
  }
  return openaiImageProviderStatus.value;
});

watch(
  () => settings.settings?.aiKey,
  (aiKey) => {
    if (!aiKey) {
      return;
    }
    aiForm.providerId = aiKey.providerId;
    aiForm.providerName = aiKey.providerName;
    aiForm.modelId = aiKey.modelId;
    aiForm.baseUrl = aiKey.baseUrl ?? "";
    aiForm.apiKey = "";
  },
  { immediate: true },
);

watch(
  () => settings.settings?.openaiImageProvider,
  (provider) => {
    if (!provider) {
      return;
    }
    openaiImageForm.providerId = provider.providerId;
    openaiImageForm.providerName = provider.providerName;
    openaiImageForm.modelId = provider.modelId;
    openaiImageForm.baseUrl = provider.baseUrl ?? "";
    openaiImageForm.apiKey = "";
  },
  { immediate: true },
);

watch(
  () => settings.settings?.doubaoImageProvider,
  (provider) => {
    if (!provider) {
      return;
    }
    doubaoImageForm.providerId = provider.providerId;
    doubaoImageForm.providerName = provider.providerName;
    doubaoImageForm.modelId = provider.modelId;
    doubaoImageForm.baseUrl = provider.baseUrl ?? "";
    doubaoImageForm.apiKey = "";
  },
  { immediate: true },
);

watch(
  () => settings.settings?.grokImageProvider,
  (provider) => {
    if (!provider) {
      return;
    }
    grokImageForm.providerId = provider.providerId;
    grokImageForm.providerName = provider.providerName;
    grokImageForm.modelId = provider.modelId;
    grokImageForm.baseUrl = provider.baseUrl ?? "";
    grokImageForm.apiKey = "";
  },
  { immediate: true },
);

watch(
  () => settings.settings?.runwareImageProvider,
  (provider) => {
    if (!provider) {
      return;
    }
    runwareImageForm.providerId = provider.providerId;
    runwareImageForm.providerName = provider.providerName;
    runwareImageForm.modelId = provider.modelId;
    runwareImageForm.baseUrl = provider.baseUrl ?? "";
    runwareImageForm.apiKey = "";
  },
  { immediate: true },
);

watch(
  () => aiForm.providerId,
  (providerId) => {
    const provider = providerOptions.find((item) => item.providerId === providerId);
    aiForm.providerName = provider?.providerName ?? providerId;
  },
);

async function reload() {
  await settings.loadSettings();
}

function onTextProviderChange() {
  if (aiForm.providerId !== "xai") {
    return;
  }
  aiForm.modelId = "grok-4.5";
  aiForm.baseUrl = "https://api.x.ai/v1";
}

async function saveAIKey() {
  await settings.saveAIKey({
    providerId: aiForm.providerId,
    providerName: aiForm.providerName,
    modelId: aiForm.modelId,
    baseUrl: aiForm.baseUrl || null,
    apiKey: aiForm.apiKey || undefined,
  });
  aiForm.apiKey = "";
}

async function clearAIKey() {
  await settings.saveAIKey({
    providerId: aiForm.providerId,
    providerName: aiForm.providerName,
    modelId: aiForm.modelId,
    baseUrl: aiForm.baseUrl || null,
    clearApiKey: true,
  });
  aiForm.apiKey = "";
}

async function saveOpenaiProvider() {
  await settings.saveOpenaiImageProvider({
    providerId: openaiImageForm.providerId,
    providerName: openaiImageForm.providerName,
    modelId: openaiImageForm.modelId,
    baseUrl: openaiImageForm.baseUrl || null,
    apiKey: openaiImageForm.apiKey || undefined,
  });
  openaiImageForm.apiKey = "";
}

async function clearOpenaiProvider() {
  await settings.saveOpenaiImageProvider({
    providerId: openaiImageForm.providerId,
    providerName: openaiImageForm.providerName,
    modelId: openaiImageForm.modelId,
    baseUrl: openaiImageForm.baseUrl || null,
    clearApiKey: true,
  });
  openaiImageForm.apiKey = "";
}

async function saveDoubaoProvider() {
  await settings.saveDoubaoImageProvider({
    providerId: doubaoImageForm.providerId,
    providerName: doubaoImageForm.providerName,
    modelId: doubaoImageForm.modelId,
    baseUrl: doubaoImageForm.baseUrl || null,
    apiKey: doubaoImageForm.apiKey || undefined,
  });
  doubaoImageForm.apiKey = "";
}

async function clearDoubaoProvider() {
  await settings.saveDoubaoImageProvider({
    providerId: doubaoImageForm.providerId,
    providerName: doubaoImageForm.providerName,
    modelId: doubaoImageForm.modelId,
    baseUrl: doubaoImageForm.baseUrl || null,
    clearApiKey: true,
  });
  doubaoImageForm.apiKey = "";
}

async function saveGrokProvider() {
  await settings.saveGrokImageProvider({
    providerId: grokImageForm.providerId,
    providerName: grokImageForm.providerName,
    modelId: grokImageForm.modelId,
    baseUrl: grokImageForm.baseUrl || null,
    apiKey: grokImageForm.apiKey || undefined,
  });
  grokImageForm.apiKey = "";
}

async function clearGrokProvider() {
  await settings.saveGrokImageProvider({
    providerId: grokImageForm.providerId,
    providerName: grokImageForm.providerName,
    modelId: grokImageForm.modelId,
    baseUrl: grokImageForm.baseUrl || null,
    clearApiKey: true,
  });
  grokImageForm.apiKey = "";
}

async function saveRunwareProvider() {
  await settings.saveRunwareImageProvider({
    providerId: runwareImageForm.providerId,
    providerName: runwareImageForm.providerName,
    modelId: runwareImageForm.modelId,
    baseUrl: runwareImageForm.baseUrl || null,
    apiKey: runwareImageForm.apiKey || undefined,
  });
  runwareImageForm.apiKey = "";
}

async function clearRunwareProvider() {
  await settings.saveRunwareImageProvider({
    providerId: runwareImageForm.providerId,
    providerName: runwareImageForm.providerName,
    modelId: runwareImageForm.modelId,
    baseUrl: runwareImageForm.baseUrl || null,
    clearApiKey: true,
  });
  runwareImageForm.apiKey = "";
}

async function onSwitchProvider(event: Event) {
  const value = (event.target as HTMLSelectElement).value as ImageProviderType;
  await settings.switchImageProvider(value);
}

async function saveAppearance(theme: AppearanceTheme) {
  await settings.saveAppearance({ theme });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

.provider-switch {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(204, 215, 245, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  padding: 12px;
}

.provider-form {
  display: grid;
  gap: 16px;
  border: 1px solid rgba(204, 215, 245, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  padding: 16px;
}

.provider-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.provider-form-head strong {
  color: #f8fbff;
  font-size: 15px;
  font-weight: 700;
}

.provider-note {
  display: grid;
  gap: 5px;
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.07);
  padding: 11px 12px;
  color: #aeb8cf;
  font-size: 12px;
  line-height: 1.6;
}

.provider-note strong {
  color: #b3a5ff;
  font-size: 12px;
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
.panel-title-row,
.settings-actions {
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

.key-meta span,
label > span {
  color: #8f97b3;
  font-size: 12px;
  font-weight: 600;
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

.settings-alert {
  border: 1px solid rgba(204, 215, 245, 0.14);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
}

.settings-alert.is-error {
  border-color: rgba(248, 113, 113, 0.34);
  background: rgba(127, 29, 29, 0.18);
  color: #fecaca;
}

.settings-alert.is-success {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(20, 83, 45, 0.18);
  color: #bbf7d0;
}

.settings-panel {
  display: grid;
  gap: 20px;
  padding: 18px;
}

.status-pill {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.1);
  color: #cbd5e1 !important;
  padding: 6px 10px;
}

.status-pill.is-ready {
  border-color: rgba(34, 199, 169, 0.28);
  background: rgba(34, 199, 169, 0.12);
  color: #8df0dc !important;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

label {
  display: grid;
  gap: 8px;
  min-width: 0;
}

label.is-wide {
  grid-column: 1 / -1;
}

input,
select {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(204, 215, 245, 0.14);
  border-radius: 8px;
  background: rgba(7, 11, 23, 0.7);
  color: #edf2ff;
  padding: 0 12px;
  outline: none;
}

input:focus,
select:focus {
  border-color: rgba(139, 92, 246, 0.58);
}

.secret-input {
  position: relative;
  display: flex;
  align-items: center;
}

.secret-input input {
  padding-right: 44px;
}

.secret-input button {
  position: absolute;
  right: 6px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8b96b3;
  cursor: pointer;
}

.secret-input button:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.key-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.key-meta > div {
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 1px solid rgba(204, 215, 245, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  padding: 12px;
}

.key-meta strong {
  overflow: hidden;
  color: #f8fbff;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-actions {
  justify-content: flex-end;
}

.primary-action,
.secondary-action {
  min-height: 40px;
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

  .field-grid,
  .key-meta,
  .theme-options {
    grid-template-columns: 1fr;
  }
}
</style>
