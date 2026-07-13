import { BadRequestException, Inject, Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
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
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import {
  SecretStoreError,
  SecretStoreService,
  SecretString,
  fingerprintSecret,
} from "./secret-store.js";

interface StoredAIKeySettings {
  providerId: string;
  providerName: string;
  modelId: string;
  baseUrl: string | null;
  /** Legacy-only field. It is removed before settings are persisted. */
  apiKey?: string | null;
  secretRef?: string | null;
  keyFingerprint: string | null;
  updatedAt: string | null;
}

interface StoredAppSettings {
  version: 1;
  aiKey: StoredAIKeySettings;
  openaiImageProvider: StoredAIKeySettings;
  doubaoImageProvider: StoredAIKeySettings;
  grokImageProvider: StoredAIKeySettings;
  activeImageProvider: ImageProviderType;
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
/** Grok Imagine 默认配置(选 Grok 时预填,中转可在设置页覆盖) */
const GROK_DEFAULT_BASE_URL = "https://api.x.ai/v1";
const GROK_DEFAULT_MODEL = "grok-imagine-image-quality";
const PROVIDER_NAME_BY_ID: Record<string, string> = {
  self: "自定义 OpenAI 兼容",
  aurora: "Aurora GPT 对话",
  kimi: "Moonshot Kimi 对话",
  deepseek: "DeepSeek 对话",
  mimo: "Xiaomi MiMo 对话",
  custom: "自定义 OpenAI 兼容",
  openai_image: "OpenAI 图片生成",
  doubao_image: "豆包图片生成",
  grok_image: "Grok 图片生成",
};

export interface AtomicSettingsFileOps {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<string | undefined>;
  open(path: string, flags: "wx", mode: number): Promise<Pick<FileHandle, "writeFile" | "sync" | "close">>;
  rename(source: string, destination: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
}

const DEFAULT_ATOMIC_SETTINGS_FILE_OPS: AtomicSettingsFileOps = { mkdir, open, rename, rm };

export async function writeSettingsFileAtomically(
  filePath: string,
  contents: string,
  operations: AtomicSettingsFileOps = DEFAULT_ATOMIC_SETTINGS_FILE_OPS,
): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let handle: Pick<FileHandle, "writeFile" | "sync" | "close"> | undefined;
  await operations.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    handle = await operations.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await operations.rename(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await operations.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private settings: StoredAppSettings = this.defaultSettings();
  private runtimeAIKey: string | null = null;
  private readonly runtimeImageSecrets = new Map<string, SecretString>();

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Optional() @Inject(MaintenanceCoordinator) private readonly maintenance?: MaintenanceCoordinator,
    @Optional() @Inject(SecretStoreService) private readonly secretStore?: SecretStoreService,
    @Optional() @Inject(PrismaService) private readonly prismaService?: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.settings = await this.readSettings();
  }

  getRuntimeAIKeySettings(): RuntimeAIKeySettings {
    return {
      providerId: this.settings.aiKey.providerId,
      modelId: this.settings.aiKey.modelId,
      baseUrl: this.settings.aiKey.baseUrl,
      apiKey: this.runtimeAIKey,
    };
  }

  getRuntimeImageProviderSettings(): RuntimeImageProviderSettings {
    const active = this.settings.activeImageProvider;
    const stored = this.getStoredImageProvider(this.settings, active);
    return {
      type: active,
      providerId: stored.providerId,
      modelId: stored.modelId,
      baseUrl: stored.baseUrl,
      apiKey: this.runtimeImageSecrets.get(this.credentialIdForImageProvider(active, stored.providerId))?.reveal() ?? null,
    };
  }

  async getSettings(): Promise<AppSettings> {
    this.settings = await this.readSettings();
    return this.toPublicSettings(this.settings);
  }

  async updateSettings(input: UpdateAppSettingsRequest): Promise<AppSettings> {
    const execute = async () => {
      const current = await this.readSettings();
      const now = new Date().toISOString();
      const next: StoredAppSettings = {
        ...current,
        aiKey: input.aiKey ? this.updateAIKeySettings(current.aiKey, input.aiKey, now) : current.aiKey,
        activeImageProvider: input.activeImageProvider === undefined
          ? current.activeImageProvider
          : this.normalizeImageProviderType(input.activeImageProvider),
        appearance: input.appearance ? this.updateAppearanceSettings(current.appearance, input.appearance.theme) : current.appearance,
        updatedAt: now,
      };

      if (input.openaiImageProvider) {
        next.openaiImageProvider = await this.updateImageProviderSettings("openai", current.openaiImageProvider, input.openaiImageProvider, now);
      }
      if (input.doubaoImageProvider) {
        next.doubaoImageProvider = await this.updateImageProviderSettings("doubao", current.doubaoImageProvider, input.doubaoImageProvider, now);
      }
      if (input.grokImageProvider) {
        next.grokImageProvider = await this.updateImageProviderSettings("grok", current.grokImageProvider, input.grokImageProvider, now);
      }

      await this.writeSettings(next);
      this.settings = next;
      return this.toPublicSettings(next);
    };
    return this.maintenance ? this.maintenance.runMutation("settings.update", execute, "settings") : execute();
  }

  private async updateImageProviderSettings(
    type: ImageProviderType,
    current: StoredAIKeySettings,
    input: UpdateImageProviderSettingsRequest,
    now: string,
  ): Promise<StoredAIKeySettings> {
    const providerId = input.providerId === undefined ? current.providerId : this.normalizeProviderId(input.providerId);
    const providerName = input.providerName === undefined
      ? this.resolveProviderName(providerId, current.providerName)
      : this.normalizeProviderName(input.providerName, providerId);
    const modelId = input.modelId === undefined ? current.modelId : this.normalizeModelId(input.modelId);
    const baseUrl = input.baseUrl === undefined ? current.baseUrl : this.normalizeBaseUrl(input.baseUrl);
    const apiKeyInput = input.apiKey?.trim();
    const providerChanged = input.providerId !== undefined && providerId !== current.providerId;
    const shouldClearApiKey = input.clearApiKey === true || (providerChanged && !apiKeyInput);
    if (this.prismaService?.isDatabaseMode() && shouldClearApiKey && current.secretRef) {
      throw new BadRequestException("SETTINGS_SECRET_CLEAR_REQUIRES_OUTBOX");
    }
    const previousCredentialId = this.credentialIdForImageProvider(type, current.providerId);
    const nextCredentialId = this.credentialIdForImageProvider(type, providerId);
    if (shouldClearApiKey || (providerId !== current.providerId && !apiKeyInput)) {
      if (current.secretRef || this.runtimeImageSecrets.has(previousCredentialId)) {
        await this.requireSecretStore().delete(previousCredentialId);
      }
      this.runtimeImageSecrets.delete(previousCredentialId);
    }

    let secretRef = providerId === current.providerId ? current.secretRef ?? null : null;
    let keyFingerprint = providerId === current.providerId ? current.keyFingerprint : null;
    if (apiKeyInput) {
      const secret = SecretString.from(apiKeyInput);
      const metadata = await this.requireSecretStore().put({ credentialId: nextCredentialId, secret });
      this.runtimeImageSecrets.set(nextCredentialId, secret);
      secretRef = metadata.secretRef;
      keyFingerprint = metadata.fingerprint;
    } else if (secretRef && !this.runtimeImageSecrets.has(nextCredentialId)) {
      this.runtimeImageSecrets.set(nextCredentialId, await this.requireSecretStore().get(nextCredentialId));
    }

    return {
      providerId,
      providerName,
      modelId,
      baseUrl,
      secretRef,
      keyFingerprint,
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
        : this.runtimeAIKey;
    this.runtimeAIKey = apiKey;

    return {
      providerId,
      providerName,
      modelId,
      baseUrl,
      keyFingerprint: apiKey ? this.fingerprintKey(apiKey) : current.keyFingerprint,
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
    if (this.prismaService?.isDatabaseMode()) {
      return this.readDatabaseSettings();
    }
    const filePath = this.getSettingsFilePath();
    try {
      const raw = await readFile(filePath, "utf8");
      const settings = this.normalizeStoredSettings(JSON.parse(raw) as Partial<StoredAppSettings>);
      return this.prepareRuntimeSecrets(settings, true);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        const defaults = this.defaultSettings();
        const prepared = await this.prepareRuntimeSecrets(defaults, false);
        await this.writeSettings(prepared);
        return prepared;
      }
      throw error;
    }
  }

  private async writeSettings(settings: StoredAppSettings): Promise<void> {
    if (this.prismaService?.isDatabaseMode()) {
      await this.writeDatabaseSettings(settings);
      return;
    }
    const filePath = this.getSettingsFilePath();
    await writeSettingsFileAtomically(filePath, `${JSON.stringify(this.toPersistedSettings(settings), null, 2)}\n`);
  }

  private async prepareRuntimeSecrets(settings: StoredAppSettings, persistLegacy: boolean): Promise<StoredAppSettings> {
    if (settings.aiKey.apiKey?.trim()) {
      this.runtimeAIKey = settings.aiKey.apiKey.trim();
      // Text credentials are OpenCode-owned, but legacy settings may still
      // contain one. Mark the file for sanitization without copying it into
      // AI漫游's persistent metadata.
    }
    const hadLegacyTextKey = Boolean(settings.aiKey.apiKey?.trim());
    settings.aiKey.apiKey = undefined;

    let changed = hadLegacyTextKey;
    const imageProviders: Array<[ImageProviderType, StoredAIKeySettings]> = [
      ["openai", settings.openaiImageProvider],
      ["doubao", settings.doubaoImageProvider],
      ["grok", settings.grokImageProvider],
    ];
    for (const [type, provider] of imageProviders) {
      const credentialId = this.credentialIdForImageProvider(type, provider.providerId);
      const legacy = provider.apiKey?.trim();
      if (legacy) {
        const secret = SecretString.from(legacy);
        const metadata = await this.requireSecretStore().put({ credentialId, secret });
        this.runtimeImageSecrets.set(credentialId, secret);
        provider.secretRef = metadata.secretRef;
        provider.keyFingerprint = metadata.fingerprint;
        provider.apiKey = undefined;
        changed = true;
        continue;
      }
      provider.apiKey = undefined;
      if (provider.secretRef) {
        const secret = this.runtimeImageSecrets.get(credentialId) ?? await this.requireSecretStore().get(credentialId);
        if (provider.keyFingerprint && fingerprintSecret(secret) !== provider.keyFingerprint) {
          throw new SecretStoreError("SECRET_STORE_ENTRY_MISSING");
        }
        this.runtimeImageSecrets.set(credentialId, secret);
      } else {
        this.runtimeImageSecrets.delete(credentialId);
      }
    }

    if (changed && persistLegacy) {
      await this.writeSettings(settings);
    }
    return settings;
  }

  private toPersistedSettings(settings: StoredAppSettings): StoredAppSettings {
    const strip = (value: StoredAIKeySettings): StoredAIKeySettings => {
      const { apiKey: _apiKey, ...metadata } = value;
      return metadata;
    };
    return {
      ...settings,
      aiKey: strip(settings.aiKey),
      openaiImageProvider: strip(settings.openaiImageProvider),
      doubaoImageProvider: strip(settings.doubaoImageProvider),
      grokImageProvider: strip(settings.grokImageProvider),
    };
  }

  private requireSecretStore(): SecretStoreService {
    if (!this.secretStore) {
      throw new SecretStoreError("SECRET_STORE_UNAVAILABLE");
    }
    return this.secretStore;
  }

  private credentialIdForImageProvider(type: ImageProviderType, providerId: string): string {
    return `image_${type}_${providerId}`;
  }

  private async readDatabaseSettings(): Promise<StoredAppSettings> {
    const database = this.prismaService?.database();
    if (!database) {
      throw new Error("DB_PERSISTENCE_PRISMA_SERVICE_MISSING");
    }
    const [preference, providers, persistenceState] = await Promise.all([
      database.appPreference.findUnique({ where: { id: "primary" } }),
      database.providerConfig.findMany({ include: { credentialMetadataByProviderConfig: true } }),
      database.persistenceState.findUnique({ where: { id: "primary" } }),
    ]);
    if (!preference || providers.length === 0) {
      const defaults = await this.prepareRuntimeSecrets(this.defaultSettings(), false);
      // A read-only API restart is allowed while the cutover fence is closed.
      // Do not attempt to seed default provider rows through the business-write
      // boundary in ready/recovery states; activation owns reopening writes.
      const writesClosed = persistenceState && ["ready_for_activation", "recovery_required"].includes(persistenceState.activationState);
      if (!writesClosed) await this.writeDatabaseSettings(defaults);
      return defaults;
    }
    const textProvider = providers.find((provider) => provider.id === preference.defaultTextProviderId)
      ?? providers.find((provider) => provider.runtimeKind === "text");
    const imageProvider = (type: ImageProviderType) => {
      const providerId = type === "openai" ? "openai_image" : type === "doubao" ? "doubao_image" : "grok_image";
      return providers.find((provider) => provider.providerId === providerId)
        ?? providers.find((provider) => provider.runtimeKind === "image" && provider.providerId.includes(type));
    };
    const toStored = (provider: typeof providers[number] | undefined, fallback: StoredAIKeySettings): StoredAIKeySettings => provider
      ? {
          providerId: provider.providerId,
          providerName: provider.displayName,
          modelId: provider.modelId,
          baseUrl: provider.baseUrl,
          secretRef: provider.credentialMetadataByProviderConfig?.secretRef ?? null,
          keyFingerprint: provider.credentialMetadataByProviderConfig?.fingerprint ?? null,
          updatedAt: provider.updatedAt.toISOString(),
        }
      : fallback;
    const defaults = this.defaultSettings();
    const activeProviderId = providers.find((provider) => provider.id === preference.activeImageProviderId)?.providerId ?? "openai_image";
    const activeImageProvider: ImageProviderType = activeProviderId.includes("doubao") ? "doubao" : activeProviderId.includes("grok") ? "grok" : "openai";
    const settings: StoredAppSettings = {
      version: 1,
      aiKey: toStored(textProvider, defaults.aiKey),
      openaiImageProvider: toStored(imageProvider("openai"), defaults.openaiImageProvider),
      doubaoImageProvider: toStored(imageProvider("doubao"), defaults.doubaoImageProvider),
      grokImageProvider: toStored(imageProvider("grok"), defaults.grokImageProvider),
      activeImageProvider,
      appearance: { theme: preference.theme as AppAppearanceSettings["theme"] },
      updatedAt: preference.updatedAt.toISOString(),
    };
    return this.prepareRuntimeSecrets(settings, false);
  }

  private async writeDatabaseSettings(settings: StoredAppSettings): Promise<void> {
    const database = this.prismaService?.database();
    if (!database) throw new Error("DB_PERSISTENCE_PRISMA_SERVICE_MISSING");
    const providers = [
      { type: "text" as const, settings: settings.aiKey, owner: "opencode" as const },
      { type: "image" as const, settings: settings.openaiImageProvider, owner: "image_secret_store" as const },
      { type: "image" as const, settings: settings.doubaoImageProvider, owner: "image_secret_store" as const },
      { type: "image" as const, settings: settings.grokImageProvider, owner: "image_secret_store" as const },
    ];
    await this.prismaService!.runBusinessTransaction(async (tx) => {
      const ids = new Map<string, string>();
      for (const item of providers) {
        const provider = await tx.providerConfig.upsert({
          where: { providerId: item.settings.providerId },
          create: {
            providerId: item.settings.providerId,
            runtimeKind: item.type,
            displayName: item.settings.providerName,
            modelId: item.settings.modelId,
            baseUrl: item.settings.baseUrl,
            enabled: item.type === "text" || Boolean(item.settings.secretRef),
          },
          update: {
            displayName: item.settings.providerName,
            modelId: item.settings.modelId,
            baseUrl: item.settings.baseUrl,
            enabled: item.type === "text" || Boolean(item.settings.secretRef),
          },
        });
        ids.set(item.settings.providerId, provider.id);
        await tx.credentialMetadata.upsert({
          where: { providerConfigId: provider.id },
          create: {
            providerConfigId: provider.id,
            owner: item.owner,
            status: item.settings.secretRef || (item.type === "text" && item.settings.keyFingerprint) ? "configured" : "unconfigured",
            secretRef: item.type === "image" ? item.settings.secretRef ?? null : null,
            fingerprint: item.settings.keyFingerprint ?? null,
            configured: Boolean(item.settings.secretRef || (item.type === "text" && item.settings.keyFingerprint)),
          },
          update: {
            status: item.settings.secretRef || (item.type === "text" && item.settings.keyFingerprint) ? "configured" : "unconfigured",
            secretRef: item.type === "image" ? item.settings.secretRef ?? null : null,
            fingerprint: item.settings.keyFingerprint ?? null,
            configured: Boolean(item.settings.secretRef || (item.type === "text" && item.settings.keyFingerprint)),
          },
        });
      }
      const preferenceData = {
        theme: settings.appearance.theme,
        activeImageProviderId: ids.get(this.getStoredImageProvider(settings, settings.activeImageProvider).providerId) ?? null,
        defaultTextProviderId: ids.get(settings.aiKey.providerId) ?? null,
        defaultTextModelId: settings.aiKey.modelId,
      };
      const existingPreference = await tx.appPreference.findUnique({ where: { id: "primary" } });
      if (existingPreference) {
        await tx.appPreference.update({ where: { id: "primary" }, data: preferenceData });
      } else {
        await tx.appPreference.create({ data: { id: "primary", ...preferenceData } });
      }
    });
  }

  private normalizeStoredSettings(input: Partial<StoredAppSettings> & { imageProvider?: unknown }): StoredAppSettings {
    const defaults = this.defaultSettings();
    const aiKey = input.aiKey ?? defaults.aiKey;
    // 迁移:旧版只有单一 imageProvider 字段。若没有 openaiImageProvider 但有旧的 imageProvider,则把旧的迁过来。
    const legacyImageProvider = (input as { imageProvider?: unknown }).imageProvider;
    const openaiSource = (input.openaiImageProvider ?? (legacyImageProvider && !input.openaiImageProvider ? legacyImageProvider : defaults.openaiImageProvider)) as StoredAIKeySettings;
    const doubaoSource = (input.doubaoImageProvider ?? defaults.doubaoImageProvider) as StoredAIKeySettings;
    const grokSource = (input.grokImageProvider ?? defaults.grokImageProvider) as StoredAIKeySettings;

    const providerId = this.normalizeProviderId(aiKey.providerId ?? defaults.aiKey.providerId);
    const openaiProviderId = this.normalizeProviderId(openaiSource.providerId ?? defaults.openaiImageProvider.providerId);
    const doubaoProviderId = this.normalizeProviderId(doubaoSource.providerId ?? defaults.doubaoImageProvider.providerId);
    const grokProviderId = this.normalizeProviderId(grokSource.providerId ?? defaults.grokImageProvider.providerId);
    const apiKey = typeof aiKey.apiKey === "string" && aiKey.apiKey.trim() ? aiKey.apiKey.trim() : null;
    const openaiApiKey = typeof openaiSource.apiKey === "string" && openaiSource.apiKey.trim() ? openaiSource.apiKey.trim() : null;
    const doubaoApiKey = typeof doubaoSource.apiKey === "string" && doubaoSource.apiKey.trim() ? doubaoSource.apiKey.trim() : null;
    const grokApiKey = typeof grokSource.apiKey === "string" && grokSource.apiKey.trim() ? grokSource.apiKey.trim() : null;
    const theme = input.appearance?.theme && APPEARANCE_THEMES.includes(input.appearance.theme)
      ? input.appearance.theme
      : defaults.appearance.theme;
    const activeImageProvider = this.normalizeImageProviderType(input.activeImageProvider);

    return {
      version: 1,
      aiKey: {
        providerId,
        providerName: this.normalizeProviderName(aiKey.providerName ?? this.resolveProviderName(providerId), providerId),
        modelId: this.normalizeModelId(aiKey.modelId ?? defaults.aiKey.modelId),
        baseUrl: this.normalizeBaseUrl(aiKey.baseUrl ?? defaults.aiKey.baseUrl),
        apiKey,
        keyFingerprint: apiKey ? this.fingerprintKey(apiKey) : aiKey.keyFingerprint ?? null,
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
        secretRef: typeof openaiSource.secretRef === "string" ? openaiSource.secretRef : null,
        keyFingerprint: openaiApiKey ? this.fingerprintKey(openaiApiKey) : openaiSource.keyFingerprint ?? null,
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
        secretRef: typeof doubaoSource.secretRef === "string" ? doubaoSource.secretRef : null,
        keyFingerprint: doubaoApiKey ? this.fingerprintKey(doubaoApiKey) : doubaoSource.keyFingerprint ?? null,
        updatedAt: typeof doubaoSource.updatedAt === "string" ? doubaoSource.updatedAt : null,
      },
      grokImageProvider: {
        providerId: grokProviderId,
        providerName: this.normalizeProviderName(
          grokSource.providerName ?? this.resolveProviderName(grokProviderId),
          grokProviderId,
        ),
        modelId: this.normalizeModelId(grokSource.modelId ?? defaults.grokImageProvider.modelId),
        baseUrl: this.normalizeBaseUrl(grokSource.baseUrl ?? defaults.grokImageProvider.baseUrl),
        apiKey: grokApiKey,
        secretRef: typeof grokSource.secretRef === "string" ? grokSource.secretRef : null,
        keyFingerprint: grokApiKey ? this.fingerprintKey(grokApiKey) : grokSource.keyFingerprint ?? null,
        updatedAt: typeof grokSource.updatedAt === "string" ? grokSource.updatedAt : null,
      },
      activeImageProvider,
      appearance: { theme },
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : defaults.updatedAt,
    };
  }

  private defaultSettings(): StoredAppSettings {
    const providerId = process.env.OPENCODE_PROVIDER_ID?.trim() || "self";
    const modelId = process.env.OPENCODE_MODEL_ID?.trim() || "gpt-5.5";
    const openaiImageProviderId = process.env.OPENAI_IMAGE_PROVIDER_ID?.trim() || "openai_image";
    const openaiImageModelId = process.env.OPENAI_IMAGE_MODEL_ID?.trim() || "gpt-image-2";
    const openaiImageBaseUrl = process.env.OPENAI_IMAGE_BASE_URL?.trim() || null;
    const openaiImageApiKey = process.env.OPENAI_IMAGE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || null;
    const grokImageProviderId = process.env.GROK_IMAGE_PROVIDER_ID?.trim() || "grok_image";
    const grokImageModelId = process.env.GROK_IMAGE_MODEL_ID?.trim() || GROK_DEFAULT_MODEL;
    const grokImageBaseUrl = process.env.GROK_IMAGE_BASE_URL?.trim() || process.env.XAI_IMAGE_BASE_URL?.trim() || GROK_DEFAULT_BASE_URL;
    const grokImageApiKey = process.env.GROK_IMAGE_API_KEY?.trim() || process.env.XAI_API_KEY?.trim() || null;
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
        secretRef: null,
        keyFingerprint: openaiImageApiKey ? this.fingerprintKey(openaiImageApiKey) : null,
        updatedAt: openaiImageApiKey || openaiImageBaseUrl ? now : null,
      },
      doubaoImageProvider: {
        providerId: "doubao_image",
        providerName: this.resolveProviderName("doubao_image"),
        modelId: DOUBAO_DEFAULT_MODEL,
        baseUrl: DOUBAO_DEFAULT_BASE_URL,
        apiKey: null,
        secretRef: null,
        keyFingerprint: null,
        updatedAt: null,
      },
      grokImageProvider: {
        providerId: grokImageProviderId,
        providerName: this.resolveProviderName(grokImageProviderId),
        modelId: grokImageModelId,
        baseUrl: this.normalizeBaseUrl(grokImageBaseUrl),
        apiKey: grokImageApiKey,
        secretRef: null,
        keyFingerprint: grokImageApiKey ? this.fingerprintKey(grokImageApiKey) : null,
        updatedAt: grokImageApiKey || grokImageBaseUrl ? now : null,
      },
      activeImageProvider: "openai",
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
      grokImageProvider: this.toPublicImageProvider(settings.grokImageProvider),
      activeImageProvider: settings.activeImageProvider,
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
      configured: Boolean(settings.secretRef),
      keyPreview: null,
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
      configured: Boolean(settings.keyFingerprint),
      keyPreview: null,
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

  private normalizeImageProviderType(value: unknown): ImageProviderType {
    return value === "doubao" || value === "grok" ? value : "openai";
  }

  private getStoredImageProvider(settings: StoredAppSettings, type: ImageProviderType): StoredAIKeySettings {
    if (type === "doubao") {
      return settings.doubaoImageProvider;
    }
    if (type === "grok") {
      return settings.grokImageProvider;
    }
    return settings.openaiImageProvider;
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

  private fingerprintKey(value: string): string {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
  }

  private isNotFoundError(error: unknown): boolean {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === "ENOENT";
  }
}
