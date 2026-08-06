import { defineStore } from "pinia";
import type { AppSettings, AppearanceTheme, CreateManagedModelRequest, ImageProviderType, UpdateAIKeySettingsRequest, UpdateAppearanceSettingsRequest, UpdateImageProviderSettingsRequest, UpdateManagedModelRequest } from "@airoaming/shared";
import { api } from "../services/api";

export type SettingsNoticeScope = "ai-key" | "image-provider" | "appearance" | "models";

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  notice: string | null;
  noticeScope: SettingsNoticeScope | null;
}

const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getResolvedTheme(theme: AppearanceTheme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia?.(THEME_MEDIA_QUERY).matches ? "dark" : "light";
  }
  return theme;
}

function applyAppearance(theme: AppearanceTheme): void {
  const resolvedTheme = getResolvedTheme(theme);
  document.documentElement.dataset.appearance = theme;
  document.documentElement.dataset.theme = resolvedTheme;
}

export const useSettingsStore = defineStore("settings", {
  state: (): SettingsState => ({
    settings: null,
    loading: false,
    saving: false,
    error: null,
    notice: null,
    noticeScope: null,
  }),
  getters: {
    appearanceTheme: (state): AppearanceTheme => state.settings?.appearance.theme ?? "dark",
  },
  actions: {
    async loadSettings() {
      this.loading = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.settings();
        applyAppearance(this.settings.appearance.theme);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "设置加载失败";
        applyAppearance("dark");
      } finally {
        this.loading = false;
      }
    },
    async saveAIKey(input: UpdateAIKeySettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ aiKey: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = input.clearApiKey ? "AI 密钥已清除" : "AI 密钥已保存";
        this.noticeScope = "ai-key";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "AI 密钥保存失败";
      } finally {
        this.saving = false;
      }
    },
    async saveImageProvider(input: UpdateImageProviderSettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ openaiImageProvider: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = input.clearApiKey ? "图片生成密钥已清除" : "图片生成设置已保存";
        this.noticeScope = "image-provider";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "图片生成设置保存失败";
      } finally {
        this.saving = false;
      }
    },
    async saveOpenaiImageProvider(input: UpdateImageProviderSettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ openaiImageProvider: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = input.clearApiKey ? "OpenAI 图片密钥已清除" : "OpenAI 图片设置已保存";
        this.noticeScope = "image-provider";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "OpenAI 图片设置保存失败";
      } finally {
        this.saving = false;
      }
    },
    async saveDoubaoImageProvider(input: UpdateImageProviderSettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ doubaoImageProvider: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = input.clearApiKey ? "豆包图片密钥已清除" : "豆包图片设置已保存";
        this.noticeScope = "image-provider";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "豆包图片设置保存失败";
      } finally {
        this.saving = false;
      }
    },
    async saveGrokImageProvider(input: UpdateImageProviderSettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ grokImageProvider: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = input.clearApiKey ? "Grok 图片密钥已清除" : "Grok 图片设置已保存";
        this.noticeScope = "image-provider";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "Grok 图片设置保存失败";
      } finally {
        this.saving = false;
      }
    },
    async saveRunwareImageProvider(input: UpdateImageProviderSettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ runwareImageProvider: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = input.clearApiKey ? "Runware 图片密钥已清除" : "Runware 图片设置已保存";
        this.noticeScope = "image-provider";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "Runware 图片设置保存失败";
      } finally {
        this.saving = false;
      }
    },
    async switchImageProvider(type: ImageProviderType) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateSettings({ activeImageProvider: type });
        applyAppearance(this.settings.appearance.theme);
        this.notice = type === "doubao"
          ? "已切换到豆包图片生成"
          : type === "grok"
            ? "已切换到 Grok 图片生成"
            : type === "runware"
              ? "已切换到 Runware 图片生成"
            : "已切换到 OpenAI 图片生成";
        this.noticeScope = "image-provider";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "图片生成切换失败";
      } finally {
        this.saving = false;
      }
    },
    async saveAppearance(input: UpdateAppearanceSettingsRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      const previousTheme = this.settings?.appearance.theme ?? "dark";
      if (input.theme) {
        applyAppearance(input.theme);
      }
      try {
        this.settings = await api.updateSettings({ appearance: input });
        applyAppearance(this.settings.appearance.theme);
        this.notice = "外观设置已保存";
        this.noticeScope = "appearance";
      } catch (error) {
        this.noticeScope = null;
        applyAppearance(previousTheme);
        this.error = error instanceof Error ? error.message : "外观设置保存失败";
      } finally {
        this.saving = false;
      }
    },
    async createManagedModel(input: CreateManagedModelRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.createManagedModel(input);
        this.notice = input.kind === "image" ? "图片模型已添加" : "对话模型已添加";
        this.noticeScope = "models";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "模型添加失败";
      } finally {
        this.saving = false;
      }
    },
    async updateManagedModel(id: string, input: UpdateManagedModelRequest) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.updateManagedModel(id, input);
        this.notice = "模型已更新";
        this.noticeScope = "models";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "模型更新失败";
      } finally {
        this.saving = false;
      }
    },
    async deleteManagedModel(id: string) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.deleteManagedModel(id);
        this.notice = "模型已删除";
        this.noticeScope = "models";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "模型删除失败";
      } finally {
        this.saving = false;
      }
    },
    async activateManagedModel(id: string) {
      this.saving = true;
      this.error = null;
      this.notice = null;
      this.noticeScope = null;
      try {
        this.settings = await api.activateManagedModel(id);
        this.notice = "已选中该模型";
        this.noticeScope = "models";
      } catch (error) {
        this.noticeScope = null;
        this.error = error instanceof Error ? error.message : "模型选中失败";
      } finally {
        this.saving = false;
      }
    },
  },
});
