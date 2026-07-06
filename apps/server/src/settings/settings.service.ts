import { BadRequestException, Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  APPEARANCE_THEMES,
  type AppAIKeySettings,
  type AppAppearanceSettings,
  type AppImageProviderSettings,
  type AppSettings,
  type ImageProviderType,
  type UpdateAIKeySettingsRequest,
  type UpdateImageProviderSettingsRequest,
  type UpdateAppSettingsRequest,
  type AppearanceTheme,
} from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

interface StoredAIKeySettings {
  providerId: string;
  providerName: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string | null;
  keyFingerprint: string | null;
  updatedAt: string | null;
}

interface StoredAppSettings {
  version: 1;
  aiKey: StoredAIKeySettings;
  openaiImageProvider: StoredAIKeySettings;
  doubaoImageProvider: StoredAIKeySettings;
  activeImageProvider: ImageProviderType;
  /** 候选图系统级 prompt 模板；null = 用内置默认（见 shared DEFAULT_IMAGE_PROMPT_TEMPLATE）。 */
  imagePromptTemplate: string | null;
  appearance: AppAppearanceSettings;
  updatedAt: string;
}

export interface RuntimeAIKeySettings {
  providerId: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string | null;
}

export interface RuntimeImageProviderSettings {
  /** 当前生效的 provider 类型,供生成代码分支 */
  type: ImageProviderType;
  providerId: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string | null;
}

const SETTINGS_VIRTUAL_PATH = "/workspace/settings/app-settings.json" as const;
/** 豆包默认配置(选豆包时预填) */
const DOUBAO_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DOUBAO_DEFAULT_MODEL = "doubao-seedream-4-5-251128";
const PROVIDER_NAME_BY_ID: Record<string, string> = {
  self: "自定义 OpenAI 兼容",
  aurora: "Aurora GPT 对话",
  kimi: "Moonshot Kimi 对话",
  deepseek: "DeepSeek 对话",
  mimo: "Xiaomi MiMo 对话",
  custom: "自定义 OpenAI 兼容",
  openai_image: "OpenAI 图片生成",
  doubao_image: "豆包图片生成",
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private settings: StoredAppSettings = this.defaultSettings();

  constructor(@Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService) {}

  async onModuleInit(): Promise<void> {
    this.settings = await this.readSettings();
  }

  getRuntimeAIKeySettings(): RuntimeAIKeySettings {
    return {
      providerId: this.settings.aiKey.providerId,
      modelId: this.settings.aiKey.modelId,
      baseUrl: this.settings.aiKey.baseUrl,
      apiKey: this.settings.aiKey.apiKey,
    };
  }

  /** 候选图系统级模板；null 表示用内置默认。每次生成时读，修改即时生效。 */
  getRuntimeImagePromptTemplate(): string | null {
    return this.settings.imagePromptTemplate;
  }

  getRuntimeImageProviderSettings(): RuntimeImageProviderSettings {
    const active = this.settings.activeImageProvider;
    const stored = active === "doubao" ? this.settings.doubaoImageProvider : this.settings.openaiImageProvider;
    return {
      type: active,
      providerId: stored.providerId,
      modelId: stored.modelId,
      baseUrl: stored.baseUrl,
      apiKey: stored.apiKey,
    };
  }

  async getSettings(): Promise<AppSettings> {
    this.settings = await this.readSettings();
    return this.toPublicSettings(this.settings);
  }

  async updateSettings(input: UpdateAppSettingsRequest): Promise<AppSettings> {
    const current = await this.readSettings();
    const now = new Date().toISOString();
    const next: StoredAppSettings = {
      ...current,
      aiKey: input.aiKey ? this.updateAIKeySettings(current.aiKey, input.aiKey, now) : current.aiKey,
      openaiImageProvider: input.openaiImageProvider
        ? this.updateImageProviderSettings(current.openaiImageProvider, input.openaiImageProvider, now)
        : current.openaiImageProvider,
      doubaoImageProvider: input.doubaoImageProvider
        ? this.updateImageProviderSettings(current.doubaoImageProvider, input.doubaoImageProvider, now)
        : current.doubaoImageProvider,
      activeImageProvider: input.activeImageProvider ?? current.activeImageProvider,
      imagePromptTemplate: input.imagePromptTemplate === undefined
        ? current.imagePromptTemplate
        : this.normalizeImagePromptTemplate(input.imagePromptTemplate),
      appearance: input.appearance ? this.updateAppearanceSettings(current.appearance, input.appearance.theme) : current.appearance,
      updatedAt: now,
    };

    await this.writeSettings(next);
    this.settings = next;
    return this.toPublicSettings(next);
  }

  private updateImageProviderSettings(
    current: StoredAIKeySettings,
    input: UpdateImageProviderSettingsRequest,
    now: string,
  ): StoredAIKeySettings {
    const providerId = input.providerId === undefined ? current.providerId : this.normalizeProviderId(input.providerId);
    const providerName = input.providerName === undefined
      ? this.resolveProviderName(providerId, current.providerName)
      : this.normalizeProviderName(input.providerName, providerId);
    const modelId = input.modelId === undefined ? current.modelId : this.normalizeModelId(input.modelId);
    const baseUrl = input.baseUrl === undefined ? current.baseUrl : this.normalizeBaseUrl(input.baseUrl);
    const apiKeyInput = input.apiKey?.trim();
    const providerChanged = input.providerId !== undefined && providerId !== current.providerId;
    const shouldClearApiKey = input.clearApiKey === true || (providerChanged && !apiKeyInput);
    const apiKey = shouldClearApiKey
      ? null
      : apiKeyInput
        ? apiKeyInput
        : current.apiKey;

    return {
      providerId,
      providerName,
      modelId,
      baseUrl,
      apiKey,
      keyFingerprint: apiKey ? this.fingerprintKey(apiKey) : null,
      updatedAt: now,
    };
  }

  private updateAIKeySettings(current: StoredAIKeySettings, input: UpdateAIKeySettingsRequest, now: string): StoredAIKeySettings {
    const providerId = input.providerId === undefined ? current.providerId : this.normalizeProviderId(input.providerId);
    const providerName = input.providerName === undefined
      ? this.resolveProviderName(providerId, current.providerName)
      : this.normalizeProviderName(input.providerName, providerId);
    const modelId = input.modelId === undefined ? current.modelId : this.normalizeModelId(input.modelId);
    const baseUrl = input.baseUrl === undefined ? current.baseUrl : this.normalizeBaseUrl(input.baseUrl);
    const apiKeyInput = input.apiKey?.trim();
    const providerChanged = input.providerId !== undefined && providerId !== current.providerId;
    const shouldClearApiKey = input.clearApiKey === true || (providerChanged && !apiKeyInput);
    const apiKey = shouldClearApiKey
      ? null
      : apiKeyInput
        ? apiKeyInput
        : current.apiKey;

    return {
      providerId,
      providerName,
      modelId,
      baseUrl,
      apiKey,
      keyFingerprint: apiKey ? this.fingerprintKey(apiKey) : null,
      updatedAt: now,
    };
  }

  private updateAppearanceSettings(current: AppAppearanceSettings, theme: AppearanceTheme | undefined): AppAppearanceSettings {
    if (theme === undefined) {
      return current;
    }

    if (!APPEARANCE_THEMES.includes(theme)) {
      throw new BadRequestException("不支持的外观主题");
    }

    return { theme };
  }

  private async readSettings(): Promise<StoredAppSettings> {
    const filePath = this.getSettingsFilePath();
    try {
      const raw = await readFile(filePath, "utf8");
      return this.normalizeStoredSettings(JSON.parse(raw) as Partial<StoredAppSettings>);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        const defaults = this.defaultSettings();
        await this.writeSettings(defaults);
        return defaults;
      }
      throw error;
    }
  }

  private async writeSettings(settings: StoredAppSettings): Promise<void> {
    const filePath = this.getSettingsFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  private normalizeStoredSettings(input: Partial<StoredAppSettings> & { imageProvider?: unknown }): StoredAppSettings {
    const defaults = this.defaultSettings();
    const aiKey = input.aiKey ?? defaults.aiKey;
    // 迁移:旧版只有单一 imageProvider 字段。若没有 openaiImageProvider 但有旧的 imageProvider,则把旧的迁过来。
    const legacyImageProvider = (input as { imageProvider?: unknown }).imageProvider;
    const openaiSource = (input.openaiImageProvider ?? (legacyImageProvider && !input.openaiImageProvider ? legacyImageProvider : defaults.openaiImageProvider)) as StoredAIKeySettings;
    const doubaoSource = (input.doubaoImageProvider ?? defaults.doubaoImageProvider) as StoredAIKeySettings;

    const providerId = this.normalizeProviderId(aiKey.providerId ?? defaults.aiKey.providerId);
    const openaiProviderId = this.normalizeProviderId(openaiSource.providerId ?? defaults.openaiImageProvider.providerId);
    const doubaoProviderId = this.normalizeProviderId(doubaoSource.providerId ?? defaults.doubaoImageProvider.providerId);
    const apiKey = typeof aiKey.apiKey === "string" && aiKey.apiKey.trim() ? aiKey.apiKey.trim() : null;
    const openaiApiKey = typeof openaiSource.apiKey === "string" && openaiSource.apiKey.trim() ? openaiSource.apiKey.trim() : null;
    const doubaoApiKey = typeof doubaoSource.apiKey === "string" && doubaoSource.apiKey.trim() ? doubaoSource.apiKey.trim() : null;
    const theme = input.appearance?.theme && APPEARANCE_THEMES.includes(input.appearance.theme)
      ? input.appearance.theme
      : defaults.appearance.theme;
    const activeImageProvider: ImageProviderType = input.activeImageProvider === "doubao" ? "doubao" : "openai";

    return {
      version: 1,
      aiKey: {
        providerId,
        providerName: this.normalizeProviderName(aiKey.providerName ?? this.resolveProviderName(providerId), providerId),
        modelId: this.normalizeModelId(aiKey.modelId ?? defaults.aiKey.modelId),
        baseUrl: this.normalizeBaseUrl(aiKey.baseUrl ?? defaults.aiKey.baseUrl),
        apiKey,
        keyFingerprint: apiKey ? this.fingerprintKey(apiKey) : null,
        updatedAt: typeof aiKey.updatedAt === "string" ? aiKey.updatedAt : null,
      },
      openaiImageProvider: {
        providerId: openaiProviderId,
        providerName: this.normalizeProviderName(
          openaiSource.providerName ?? this.resolveProviderName(openaiProviderId),
          openaiProviderId,
        ),
        modelId: this.normalizeModelId(openaiSource.modelId ?? defaults.openaiImageProvider.modelId),
        baseUrl: this.normalizeBaseUrl(openaiSource.baseUrl ?? defaults.openaiImageProvider.baseUrl),
        apiKey: openaiApiKey,
        keyFingerprint: openaiApiKey ? this.fingerprintKey(openaiApiKey) : null,
        updatedAt: typeof openaiSource.updatedAt === "string" ? openaiSource.updatedAt : null,
      },
      doubaoImageProvider: {
        providerId: doubaoProviderId,
        providerName: this.normalizeProviderName(
          doubaoSource.providerName ?? this.resolveProviderName(doubaoProviderId),
          doubaoProviderId,
        ),
        modelId: this.normalizeModelId(doubaoSource.modelId ?? defaults.doubaoImageProvider.modelId),
        baseUrl: this.normalizeBaseUrl(doubaoSource.baseUrl ?? defaults.doubaoImageProvider.baseUrl),
        apiKey: doubaoApiKey,
        keyFingerprint: doubaoApiKey ? this.fingerprintKey(doubaoApiKey) : null,
        updatedAt: typeof doubaoSource.updatedAt === "string" ? doubaoSource.updatedAt : null,
      },
      activeImageProvider,
      imagePromptTemplate: this.normalizeImagePromptTemplate(input.imagePromptTemplate ?? null),
      appearance: { theme },
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : defaults.updatedAt,
    };
  }

  /** 空白/非字符串归一化为 null（= 用内置默认模板）。 */
  private normalizeImagePromptTemplate(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }

  private defaultSettings(): StoredAppSettings {
    const providerId = process.env.OPENCODE_PROVIDER_ID?.trim() || "self";
    const modelId = process.env.OPENCODE_MODEL_ID?.trim() || "gpt-5.5";
    const openaiImageProviderId = process.env.OPENAI_IMAGE_PROVIDER_ID?.trim() || "openai_image";
    const openaiImageModelId = process.env.OPENAI_IMAGE_MODEL_ID?.trim() || "gpt-image-2";
    const openaiImageBaseUrl = process.env.OPENAI_IMAGE_BASE_URL?.trim() || null;
    const openaiImageApiKey = process.env.OPENAI_IMAGE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || null;
    const now = new Date().toISOString();

    return {
      version: 1,
      aiKey: {
        providerId,
        providerName: this.resolveProviderName(providerId),
        modelId,
        baseUrl: null,
        apiKey: null,
        keyFingerprint: null,
        updatedAt: null,
      },
      openaiImageProvider: {
        providerId: openaiImageProviderId,
        providerName: this.resolveProviderName(openaiImageProviderId),
        modelId: openaiImageModelId,
        baseUrl: this.normalizeBaseUrl(openaiImageBaseUrl),
        apiKey: openaiImageApiKey,
        keyFingerprint: openaiImageApiKey ? this.fingerprintKey(openaiImageApiKey) : null,
        updatedAt: openaiImageApiKey || openaiImageBaseUrl ? now : null,
      },
      doubaoImageProvider: {
        providerId: "doubao_image",
        providerName: this.resolveProviderName("doubao_image"),
        modelId: DOUBAO_DEFAULT_MODEL,
        baseUrl: DOUBAO_DEFAULT_BASE_URL,
        apiKey: null,
        keyFingerprint: null,
        updatedAt: null,
      },
      activeImageProvider: "openai",
      imagePromptTemplate: null,
      appearance: {
        theme: "dark",
      },
      updatedAt: now,
    };
  }

  private toPublicSettings(settings: StoredAppSettings): AppSettings {
    return {
      aiKey: this.toPublicAIKey(settings.aiKey),
      openaiImageProvider: this.toPublicImageProvider(settings.openaiImageProvider),
      doubaoImageProvider: this.toPublicImageProvider(settings.doubaoImageProvider),
      activeImageProvider: settings.activeImageProvider,
      imagePromptTemplate: settings.imagePromptTemplate,
      appearance: settings.appearance,
      settingsPath: SETTINGS_VIRTUAL_PATH,
      updatedAt: settings.updatedAt,
    };
  }

  private toPublicImageProvider(settings: StoredAIKeySettings): AppImageProviderSettings {
    return {
      providerId: settings.providerId,
      providerName: settings.providerName,
      modelId: settings.modelId,
      baseUrl: settings.baseUrl,
      configured: Boolean(settings.apiKey),
      keyPreview: settings.apiKey ? this.previewKey(settings.apiKey) : null,
      keyFingerprint: settings.keyFingerprint,
      updatedAt: settings.updatedAt,
    };
  }

  private toPublicAIKey(settings: StoredAIKeySettings): AppAIKeySettings {
    return {
      providerId: settings.providerId,
      providerName: settings.providerName,
      modelId: settings.modelId,
      baseUrl: settings.baseUrl,
      configured: Boolean(settings.apiKey),
      keyPreview: settings.apiKey ? this.previewKey(settings.apiKey) : null,
      keyFingerprint: settings.keyFingerprint,
      updatedAt: settings.updatedAt,
    };
  }

  private getSettingsFilePath(): string {
    return this.workspacePathService.resolveVirtualPath(SETTINGS_VIRTUAL_PATH);
  }

  private resolveProviderName(providerId: string, fallback?: string): string {
    return PROVIDER_NAME_BY_ID[providerId] ?? fallback?.trim() ?? providerId;
  }

  private normalizeProviderId(value: string): string {
    const normalized = value.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
      throw new BadRequestException("providerId 只能包含字母、数字、下划线和短横线");
    }
    return normalized;
  }

  private normalizeProviderName(value: string, providerId: string): string {
    const normalized = value.trim();
    if (!normalized) {
      return this.resolveProviderName(providerId);
    }
    if (normalized.length > 80) {
      throw new BadRequestException("服务商名称不能超过 80 个字符");
    }
    return normalized;
  }

  private normalizeModelId(value: string): string {
    const normalized = value.trim();
    if (!/^[a-zA-Z0-9._/:@-]{1,120}$/.test(normalized)) {
      throw new BadRequestException("modelId 格式不正确");
    }
    return normalized;
  }

  private normalizeBaseUrl(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? "";
    if (!normalized) {
      return null;
    }
    try {
      const url = new URL(normalized);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
      return normalized.replace(/\/$/, "");
    } catch {
      throw new BadRequestException("baseUrl 必须是 http 或 https 地址");
    }
  }

  private previewKey(value: string): string {
    if (value.length <= 10) {
      return "••••";
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private fingerprintKey(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
  }

  private isNotFoundError(error: unknown): boolean {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === "ENOENT";
  }
}
