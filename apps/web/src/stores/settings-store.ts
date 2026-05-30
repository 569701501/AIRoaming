import { defineStore } from "pinia";
import type { AppSettings, AppearanceTheme, UpdateAIKeySettingsRequest, UpdateAppearanceSettingsRequest } from "@airoaming/shared";
import { api } from "../services/api";

export type SettingsNoticeScope = "ai-key" | "appearance";

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
  },
});
