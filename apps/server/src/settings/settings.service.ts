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
  type CreateManagedModelRequest,
  type ImageProviderType,
  type ManagedModelItem,
  type ManagedModelKind,
  type UpdateAIKeySettingsRequest,
  type UpdateImageProviderSettingsRequest,
  type UpdateAppSettingsRequest,
  type UpdateManagedModelRequest,
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

/** 模型管理:用户可添加的对话/图片模型条目 */
interface StoredManagedModel {
  id: string;
  kind: ManagedModelKind;
  displayName: string;
  providerId: string;
  modelId: string;
  baseUrl: string | null;
  secretRef: string | null;
  keyFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredAppSettings {
  version: 2;
  aiKey: StoredAIKeySettings;
  openaiImageProvider: StoredAIKeySettings;
  doubaoImageProvider: StoredAIKeySettings;
  grokImageProvider: StoredAIKeySettings;
  runwareImageProvider: StoredAIKeySettings;
  activeImageProvider: ImageProviderType;
  models: StoredManagedModel[];
  activeTextModelId: string | null;
  activeImageModelId: string | null;
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
/** Runware REST 任务入口；Schnell 用作低成本无参考草稿模型。 */
const RUNWARE_DEFAULT_BASE_URL = "https://api.runware.ai/v1";
const RUNWARE_DEFAULT_MODEL = "runware:100@1";
/** 模型管理预置项(首次进入/旧文件升级时初始化,不带凭证) */
const PRESET_MANAGED_MODELS: ReadonlyArray<Omit<StoredManagedModel, "id" | "secretRef" | "keyFingerprint" | "createdAt" | "updatedAt">> = [
  { kind: "text", displayName: "GPT 对话", providerId: "gpt", modelId: "gpt-5.5", baseUrl: null },
  { kind: "text", displayName: "Kimi 对话", providerId: "kimi", modelId: "kimi-k2", baseUrl: null },
  { kind: "text", displayName: "DeepSeek 对话", providerId: "deepseek", modelId: "deepseek-chat", baseUrl: null },
  { kind: "image", displayName: "OpenAI 图片", providerId: "openai_image", modelId: "gpt-image-2", baseUrl: null },
  { kind: "image", displayName: "Grok 图片", providerId: "grok_image", modelId: GROK_DEFAULT_MODEL, baseUrl: GROK_DEFAULT_BASE_URL },
  { kind: "image", displayName: "Runware 图片", providerId: "runware_image", modelId: RUNWARE_DEFAULT_MODEL, baseUrl: RUNWARE_DEFAULT_BASE_URL },
];
const PROVIDER_NAME_BY_ID: Record<string, string> = {
  self: "自定义 OpenAI 兼容",
  gpt: "GPT 对话",
  xai: "xAI Grok 对话",
  kimi: "Moonshot Kimi 对话",
  deepseek: "DeepSeek 对话",
  mimo: "Xiaomi MiMo 对话",
  custom: "自定义 OpenAI 兼容",
  openai_image: "OpenAI 图片生成",
  doubao_image: "豆包图片生成",
  grok_image: "Grok 图片生成",
  runware_image: "Runware 图片生成",
};

export interface AtomicSettingsFileOps {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<string | undefined>;
  open(path: string, flags: "wx", mode: number): Promise<Pick<FileHandle, "writeFile" | "sync" | "close">>;
  rename(source: string, destination: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
  openDirectory?(path: string): Promise<Pick<FileHandle, "sync" | "close">>;
}

const DEFAULT_ATOMIC_SETTINGS_FILE_OPS: AtomicSettingsFileOps = { mkdir, open, rename, rm, openDirectory: (directory) => open(directory, "r") };

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
    if (operations.openDirectory) {
      const directoryHandle = await operations.openDirectory(directory);
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    }
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
  private readonly runtimeManagedModelSecrets = new Map<string, SecretString>();

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
    const activeModel = this.resolveActiveTextManagedModel();
    if (activeModel) {
      // DB 模式 keyFingerprint 替代 secretRef;文件模式走 secretRef。
      const managedKey = (activeModel.secretRef || activeModel.keyFingerprint)
        ? this.runtimeManagedModelSecrets.get(activeModel.id)?.reveal() ?? null
        : null;
      // 与当前 aiKey 同 provider 时复用其凭证(镜像模型/同源中转),其余模型走自身凭证或 OpenCode 原生 auth。
      const sharedKey = activeModel.providerId === this.settings.aiKey.providerId
        ? this.runtimeAIKey ?? this.findMatchingImageCredentialForTextRuntime()
        : null;
      return {
        providerId: activeModel.providerId,
        modelId: activeModel.modelId,
        baseUrl: activeModel.baseUrl,
        apiKey: managedKey ?? sharedKey,
      };
    }
    const recoveredSharedKey = this.runtimeAIKey ?? this.findMatchingImageCredentialForTextRuntime();
    if (!this.runtimeAIKey && recoveredSharedKey) {
      this.runtimeAIKey = recoveredSharedKey;
    }
    return {
      providerId: this.settings.aiKey.providerId,
      modelId: this.settings.aiKey.modelId,
      baseUrl: this.settings.aiKey.baseUrl,
      apiKey: recoveredSharedKey,
    };
  }

  /** 模型管理选中的对话模型;无选中或未配置时回退 null(调用方回退 aiKey)。 */
  private resolveActiveTextManagedModel(): StoredManagedModel | null {
    const activeId = this.settings.activeTextModelId;
    if (!activeId) {
      return null;
    }
    return this.settings.models.find((model) => model.kind === "text" && model.id === activeId) ?? null;
  }

  getRuntimeImageProviderSettings(): RuntimeImageProviderSettings {
    const activeModel = this.resolveActiveImageManagedModel();
    if (activeModel) {
      const type = this.inferImageProviderType(activeModel.providerId);
      const managedKey = (activeModel.secretRef || activeModel.keyFingerprint)
        ? this.runtimeManagedModelSecrets.get(activeModel.id)?.reveal() ?? null
        : null;
      // 与对应固定槽位同 provider 时复用其凭证(DB 模式模型行共享槽位行凭证)。
      const slot = this.getStoredImageProvider(this.settings, type);
      const sharedKey = activeModel.providerId === slot.providerId
        ? this.runtimeImageSecrets.get(this.credentialIdForImageProvider(type, slot.providerId))?.reveal() ?? null
        : null;
      return {
        type,
        providerId: activeModel.providerId,
        modelId: activeModel.modelId,
        baseUrl: activeModel.baseUrl,
        apiKey: managedKey ?? sharedKey,
      };
    }
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

  /** 模型管理选中的图片模型;无选中时回退 null(调用方回退固定槽位)。 */
  private resolveActiveImageManagedModel(): StoredManagedModel | null {
    const activeId = this.settings.activeImageModelId;
    if (!activeId) {
      return null;
    }
    return this.settings.models.find((model) => model.kind === "image" && model.id === activeId) ?? null;
  }

  /** 从模型 providerId 推断图片生成协议分支(与固定槽位命名约定一致)。 */
  private inferImageProviderType(providerId: string): ImageProviderType {
    const lower = providerId.toLowerCase();
    if (lower.includes("doubao")) {
      return "doubao";
    }
    if (lower.includes("grok")) {
      return "grok";
    }
    if (lower.includes("runware")) {
      return "runware";
    }
    return "openai";
  }

  private findMatchingImageCredentialForTextRuntime(): string | null {
    const textSettings = this.settings.aiKey;
    if (!textSettings.keyFingerprint) {
      return null;
    }

    const imageProviders: Array<[ImageProviderType, StoredAIKeySettings]> = [
      ["openai", this.settings.openaiImageProvider],
      ["doubao", this.settings.doubaoImageProvider],
      ["grok", this.settings.grokImageProvider],
      ["runware", this.settings.runwareImageProvider],
    ];
    for (const [type, provider] of imageProviders) {
      if (
        provider.keyFingerprint !== textSettings.keyFingerprint
        || provider.baseUrl !== textSettings.baseUrl
      ) {
        continue;
      }
      const secret = this.runtimeImageSecrets.get(this.credentialIdForImageProvider(type, provider.providerId));
      if (secret) {
        return secret.reveal();
      }
    }
    return null;
  }

  async getSettings(): Promise<AppSettings> {
    this.settings = await this.readSettings();
    return this.toPublicSettings(this.settings);
  }

  async updateSettings(input: UpdateAppSettingsRequest): Promise<AppSettings> {
    const execute = async () => {
      const current = await this.readSettings();
      const now = new Date().toISOString();
      let next: StoredAppSettings = {
        ...current,
        aiKey: input.aiKey ? this.updateAIKeySettings(current.aiKey, input.aiKey, now) : current.aiKey,
        activeImageProvider: input.activeImageProvider === undefined
          ? current.activeImageProvider
          : this.normalizeImageProviderType(input.activeImageProvider),
        appearance: input.appearance ? this.updateAppearanceSettings(current.appearance, input.appearance.theme) : current.appearance,
        updatedAt: now,
      };
      // 旧「AI 密钥」tab 保存 = 设置对话默认模型:同步模型管理选中(镜像/复用同源模型),保证运行时与列表一致。
      if (input.aiKey) {
        next = this.syncActiveTextModelWithAIKey(next, now);
      }
      // 「图片生成」tab 切换生效 provider 时,同步模型管理选中的图片模型(镜像/复用同源模型)。
      if (input.activeImageProvider !== undefined) {
        next = this.syncActiveImageModelWithProvider(next, now);
      }

      if (input.openaiImageProvider) {
        next.openaiImageProvider = await this.updateImageProviderSettings("openai", current.openaiImageProvider, input.openaiImageProvider, now);
      }
      if (input.doubaoImageProvider) {
        next.doubaoImageProvider = await this.updateImageProviderSettings("doubao", current.doubaoImageProvider, input.doubaoImageProvider, now);
      }
      if (input.grokImageProvider) {
        next.grokImageProvider = await this.updateImageProviderSettings("grok", current.grokImageProvider, input.grokImageProvider, now);
      }
      if (input.runwareImageProvider) {
        next.runwareImageProvider = await this.updateImageProviderSettings("runware", current.runwareImageProvider, input.runwareImageProvider, now);
      }

      await this.writeSettings(next);
      this.settings = next;
      return this.toPublicSettings(next);
    };
    return this.maintenance ? this.maintenance.runMutation("settings.update", execute, "settings") : execute();
  }

  async createManagedModel(input: CreateManagedModelRequest): Promise<AppSettings> {
    const execute = async () => {
      const current = await this.readSettings();
      const now = new Date().toISOString();
      const next = await this.createManagedModelInner(current, input, now);
      await this.writeSettings(next);
      this.settings = next;
      return this.toPublicSettings(next);
    };
    return this.maintenance ? this.maintenance.runMutation("settings.update", execute, "settings") : execute();
  }

  async updateManagedModel(id: string, input: UpdateManagedModelRequest): Promise<AppSettings> {
    const execute = async () => {
      const current = await this.readSettings();
      const now = new Date().toISOString();
      const next = await this.updateManagedModelInner(current, id, input, now);
      await this.writeSettings(next);
      this.settings = next;
      return this.toPublicSettings(next);
    };
    return this.maintenance ? this.maintenance.runMutation("settings.update", execute, "settings") : execute();
  }

  async deleteManagedModel(id: string): Promise<AppSettings> {
    const execute = async () => {
      const current = await this.readSettings();
      const now = new Date().toISOString();
      const next = await this.deleteManagedModelInner(current, id, now);
      await this.writeSettings(next);
      this.settings = next;
      return this.toPublicSettings(next);
    };
    return this.maintenance ? this.maintenance.runMutation("settings.update", execute, "settings") : execute();
  }

  async activateManagedModel(id: string): Promise<AppSettings> {
    const execute = async () => {
      const current = await this.readSettings();
      const now = new Date().toISOString();
      const next = this.activateManagedModelInner(current, id, now);
      await this.writeSettings(next);
      this.settings = next;
      return this.toPublicSettings(next);
    };
    return this.maintenance ? this.maintenance.runMutation("settings.update", execute, "settings") : execute();
  }

  private async createManagedModelInner(current: StoredAppSettings, input: CreateManagedModelRequest, now: string): Promise<StoredAppSettings> {
    const kind = this.normalizeManagedModelKind(input.kind);
    const providerId = this.normalizeProviderId(input.providerId);
    const modelId = this.normalizeModelId(input.modelId);
    const displayName = this.normalizeManagedModelName(input.displayName);
    if (!input.baseUrl?.trim()) {
      throw new BadRequestException("MANAGED_MODEL_BASE_URL_REQUIRED: Base URL 不能为空");
    }
    const baseUrl = this.normalizeBaseUrl(input.baseUrl);
    // DB 模式下模型行按 providerId 唯一,id 稳定为 model_<providerId>;文件模式用 uuid 避免同 providerId 冲突。
    const id = this.prismaService?.isDatabaseMode()
      ? `model_${providerId}`
      : `model_${randomUUID()}`;
    let secretRef: string | null = null;
    let keyFingerprint: string | null = null;
    const apiKey = input.apiKey?.trim();
    if (apiKey) {
      if (this.prismaService?.isDatabaseMode()) {
        // DB 模式不走 SecretStore(Linux 不可用),直接内存持有 + fingerprint 持久化。
        keyFingerprint = fingerprintSecret(SecretString.from(apiKey));
        this.runtimeManagedModelSecrets.set(id, SecretString.from(apiKey));
      } else {
        const metadata = await this.requireSecretStore().put({
          credentialId: this.managedModelCredentialId(kind, id),
          secret: SecretString.from(apiKey),
        });
        secretRef = metadata.secretRef;
        keyFingerprint = metadata.fingerprint;
        this.runtimeManagedModelSecrets.set(id, SecretString.from(apiKey));
      }
    }
    const model: StoredManagedModel = {
      id,
      kind,
      displayName,
      providerId,
      modelId,
      baseUrl,
      secretRef,
      keyFingerprint,
      createdAt: now,
      updatedAt: now,
    };
    return {
      ...current,
      models: [...current.models, model],
      // 新模型默认不激活;仅当该类型列表原本为空时才自动激活。
      activeTextModelId: kind === "text" && current.models.every((item) => item.kind !== "text") ? id : current.activeTextModelId,
      activeImageModelId: kind === "image" && current.models.every((item) => item.kind !== "image") ? id : current.activeImageModelId,
      updatedAt: now,
    };
  }

  private async updateManagedModelInner(
    current: StoredAppSettings,
    id: string,
    input: UpdateManagedModelRequest,
    now: string,
  ): Promise<StoredAppSettings> {
    const model = current.models.find((item) => item.id === id);
    if (!model) {
      throw new BadRequestException("MANAGED_MODEL_NOT_FOUND");
    }
    const providerId = input.providerId === undefined ? model.providerId : this.normalizeProviderId(input.providerId);
    const modelId = input.modelId === undefined ? model.modelId : this.normalizeModelId(input.modelId);
    const displayName = input.displayName === undefined ? model.displayName : this.normalizeManagedModelName(input.displayName);
    const baseUrl = input.baseUrl === undefined ? model.baseUrl : this.normalizeBaseUrl(input.baseUrl ?? null);
    const credentialId = this.managedModelCredentialId(model.kind, model.id);
    let secretRef = model.secretRef;
    let keyFingerprint = model.keyFingerprint;
    const apiKeyInput = input.apiKey?.trim();
    const shouldClearApiKey = input.clearApiKey === true && !apiKeyInput;
    const isDb = this.prismaService?.isDatabaseMode() ?? false;
    if (shouldClearApiKey) {
      if (isDb) {
        if (model.keyFingerprint) {
          keyFingerprint = null;
          secretRef = null;
          this.runtimeManagedModelSecrets.delete(model.id);
        }
      } else if (model.secretRef) {
        await this.requireSecretStore().delete(credentialId);
        secretRef = null;
        keyFingerprint = null;
        this.runtimeManagedModelSecrets.delete(model.id);
      }
    }
    if (apiKeyInput) {
      if (isDb) {
        // DB 模式不走 SecretStore,直接内存持有。
        keyFingerprint = fingerprintSecret(SecretString.from(apiKeyInput));
        secretRef = null;
        this.runtimeManagedModelSecrets.set(model.id, SecretString.from(apiKeyInput));
      } else {
        const metadata = await this.requireSecretStore().put({
          credentialId,
          secret: SecretString.from(apiKeyInput),
        });
        secretRef = metadata.secretRef;
        keyFingerprint = metadata.fingerprint;
        this.runtimeManagedModelSecrets.set(model.id, SecretString.from(apiKeyInput));
      }
    }
    return {
      ...current,
      models: current.models.map((item) => item.id === id
        ? { ...item, displayName, providerId, modelId, baseUrl, secretRef, keyFingerprint, updatedAt: now }
        : item),
      updatedAt: now,
    };
  }

  private async deleteManagedModelInner(current: StoredAppSettings, id: string, now: string): Promise<StoredAppSettings> {
    const model = current.models.find((item) => item.id === id);
    if (!model) {
      throw new BadRequestException("MANAGED_MODEL_NOT_FOUND");
    }
    const activeId = model.kind === "text" ? current.activeTextModelId : current.activeImageModelId;
    if (activeId === model.id) {
      throw new BadRequestException("MANAGED_MODEL_ACTIVE_DELETE_FORBIDDEN");
    }
    if (this.prismaService?.isDatabaseMode()) {
      const fixedProviderIds = new Set([
        current.aiKey.providerId,
        current.openaiImageProvider.providerId,
        current.doubaoImageProvider.providerId,
        current.grokImageProvider.providerId,
        current.runwareImageProvider.providerId,
      ]);
      if (fixedProviderIds.has(model.providerId)) {
        throw new BadRequestException("MANAGED_MODEL_FIXED_SLOT_DELETE_FORBIDDEN: 该模型由固定密钥槽位镜像生成，不能在模型管理中删除");
      }
      const database = this.prismaService.database();
      const provider = await database.providerConfig.findUnique({ where: { providerId: model.providerId } });
      if (provider) {
        await database.credentialMetadata.deleteMany({ where: { providerConfigId: provider.id } });
        await database.providerConfig.delete({ where: { id: provider.id } });
      }
      // DB 模式清理运行时内存中的密钥
      this.runtimeManagedModelSecrets.delete(model.id);
    } else if (model.secretRef) {
      await this.requireSecretStore().delete(this.managedModelCredentialId(model.kind, model.id));
      this.runtimeManagedModelSecrets.delete(model.id);
    }
    return {
      ...current,
      models: current.models.filter((item) => item.id !== id),
      updatedAt: now,
    };
  }

  private activateManagedModelInner(current: StoredAppSettings, id: string, now: string): StoredAppSettings {
    const model = current.models.find((item) => item.id === id);
    if (!model) {
      throw new BadRequestException("MANAGED_MODEL_NOT_FOUND");
    }
    return {
      ...current,
      activeTextModelId: model.kind === "text" ? model.id : current.activeTextModelId,
      activeImageModelId: model.kind === "image" ? model.id : current.activeImageModelId,
      updatedAt: now,
    };
  }

  private syncActiveTextModelWithAIKey(next: StoredAppSettings, now: string): StoredAppSettings {
    const aiKey = next.aiKey;
    const exactMatch = next.models.find((model) => model.kind === "text" && model.providerId === aiKey.providerId && model.modelId === aiKey.modelId);
    if (exactMatch) {
      // 同源模型同步凭证指纹(复用 aiKey 凭证,展示"已配置")。
      const keyFingerprint = aiKey.keyFingerprint ?? exactMatch.keyFingerprint;
      return keyFingerprint === exactMatch.keyFingerprint
        ? { ...next, activeTextModelId: exactMatch.id }
        : {
            ...next,
            models: next.models.map((model) => model.id === exactMatch.id ? { ...model, keyFingerprint, updatedAt: now } : model),
            activeTextModelId: exactMatch.id,
          };
    }
    const sameProvider = next.models.find((model) => model.kind === "text" && model.providerId === aiKey.providerId);
    if (sameProvider) {
      return {
        ...next,
        models: next.models.map((model) => model.id === sameProvider.id
          ? { ...model, displayName: aiKey.providerName || model.displayName, modelId: aiKey.modelId, baseUrl: aiKey.baseUrl, keyFingerprint: aiKey.keyFingerprint ?? model.keyFingerprint, updatedAt: now }
          : model),
        activeTextModelId: sameProvider.id,
      };
    }
    const mirrorModel: StoredManagedModel = {
      id: `model_${aiKey.providerId}`,
      kind: "text",
      displayName: aiKey.providerName || aiKey.providerId,
      providerId: aiKey.providerId,
      modelId: aiKey.modelId,
      baseUrl: aiKey.baseUrl,
      secretRef: null,
      keyFingerprint: aiKey.keyFingerprint ?? null,
      createdAt: now,
      updatedAt: now,
    };
    return {
      ...next,
      models: [...next.models, mirrorModel],
      activeTextModelId: mirrorModel.id,
    };
  }

  private syncActiveImageModelWithProvider(next: StoredAppSettings, now: string): StoredAppSettings {
    const slot = this.getStoredImageProvider(next, next.activeImageProvider);
    const match = next.models.find((model) => model.kind === "image" && model.providerId === slot.providerId);
    if (match) {
      const displayName = slot.providerName || match.displayName;
      const modelChanged = match.displayName !== displayName || match.modelId !== slot.modelId || match.baseUrl !== slot.baseUrl;
      return {
        ...next,
        models: modelChanged
          ? next.models.map((model) => model.id === match.id
            ? { ...model, displayName, modelId: slot.modelId, baseUrl: slot.baseUrl, updatedAt: now }
            : model)
          : next.models,
        activeImageModelId: match.id,
      };
    }
    const mirrorModel: StoredManagedModel = {
      id: `model_${slot.providerId}`,
      kind: "image",
      displayName: slot.providerName || slot.providerId,
      providerId: slot.providerId,
      modelId: slot.modelId,
      baseUrl: slot.baseUrl,
      secretRef: null,
      keyFingerprint: null,
      createdAt: now,
      updatedAt: now,
    };
    return {
      ...next,
      models: [...next.models, mirrorModel],
      activeImageModelId: mirrorModel.id,
    };
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
      const nextFingerprint = fingerprintSecret(secret);
      if (providerId === current.providerId && current.secretRef && current.keyFingerprint === nextFingerprint) {
        this.runtimeImageSecrets.set(nextCredentialId, secret);
        secretRef = current.secretRef;
        keyFingerprint = current.keyFingerprint;
      } else {
        if (this.prismaService?.isDatabaseMode() && current.secretRef) {
          throw new BadRequestException("SETTINGS_SECRET_ROTATION_REQUIRES_OUTBOX");
        }
        const metadata = await this.requireSecretStore().put({ credentialId: nextCredentialId, secret });
        this.runtimeImageSecrets.set(nextCredentialId, secret);
        secretRef = metadata.secretRef;
        keyFingerprint = metadata.fingerprint;
      }
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
      keyFingerprint: apiKey
        ? this.fingerprintKey(apiKey)
        : shouldClearApiKey
          ? null
          : current.keyFingerprint,
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
      const parsed = JSON.parse(raw) as Partial<StoredAppSettings>;
      const settings = this.normalizeStoredSettings(parsed);
      const prepared = await this.prepareRuntimeSecrets(settings, true);
      // 旧版(v1,无 models)升级后立即写回预置列表,避免内存态与磁盘不一致。
      if (!Array.isArray(parsed.models)) {
        await this.writeSettings(prepared);
      }
      return prepared;
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
      ["runware", settings.runwareImageProvider],
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

    // 模型管理凭证预加载:带 secretRef 的模型在运行时切换时直接可用。
    // DB 模式的模型行与固定槽位共享 providerConfig/credentialMetadata(id 与 managed 凭证不匹配),跳过加载。
    if (!this.prismaService?.isDatabaseMode()) {
      for (const model of settings.models) {
        if (model.secretRef) {
          const secret = this.runtimeManagedModelSecrets.get(model.id)
            ?? await this.requireSecretStore().get(this.managedModelCredentialId(model.kind, model.id));
          if (model.keyFingerprint && fingerprintSecret(secret) !== model.keyFingerprint) {
            throw new SecretStoreError("SECRET_STORE_ENTRY_MISSING");
          }
          this.runtimeManagedModelSecrets.set(model.id, secret);
        } else {
          this.runtimeManagedModelSecrets.delete(model.id);
        }
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
      runwareImageProvider: strip(settings.runwareImageProvider),
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
      const providerId = type === "openai"
        ? "openai_image"
        : type === "doubao"
          ? "doubao_image"
          : type === "grok"
            ? "grok_image"
            : "runware_image";
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
    const activeImageProvider: ImageProviderType = activeProviderId.includes("doubao")
      ? "doubao"
      : activeProviderId.includes("grok")
        ? "grok"
        : activeProviderId.includes("runware")
          ? "runware"
          : "openai";
    // 模型管理列表 = provider_configs 全部行(runtimeKind=text|image)。
    // 说明:DB 模式不持久化 active 指针(activeTextModelId/activeImageModelId),
    // 读取时与当前 aiKey/activeImageProvider 对齐(保证运行时与设置一致),重启后保持。
    const models: StoredManagedModel[] = providers.map((provider) => ({
      id: `model_${provider.providerId}`,
      kind: provider.runtimeKind === "text" ? "text" : "image",
      displayName: provider.displayName,
      providerId: provider.providerId,
      modelId: provider.modelId,
      baseUrl: provider.baseUrl,
      secretRef: provider.credentialMetadataByProviderConfig?.secretRef ?? null,
      keyFingerprint: provider.credentialMetadataByProviderConfig?.fingerprint ?? null,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    }));
    const activeTextModelId = models.find((model) => model.kind === "text" && model.providerId === textProvider?.providerId)?.id
      ?? models.find((model) => model.kind === "text")?.id
      ?? null;
    const activeImageModelId = models.find((model) => model.kind === "image" && model.providerId === activeProviderId)?.id
      ?? models.find((model) => model.kind === "image")?.id
      ?? null;
    const settings: StoredAppSettings = {
      version: 2,
      aiKey: toStored(textProvider, defaults.aiKey),
      openaiImageProvider: toStored(imageProvider("openai"), defaults.openaiImageProvider),
      doubaoImageProvider: toStored(imageProvider("doubao"), defaults.doubaoImageProvider),
      grokImageProvider: toStored(imageProvider("grok"), defaults.grokImageProvider),
      runwareImageProvider: toStored(imageProvider("runware"), defaults.runwareImageProvider),
      activeImageProvider,
      models,
      activeTextModelId,
      activeImageModelId,
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
      { type: "image" as const, settings: settings.runwareImageProvider, owner: "image_secret_store" as const },
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
      // 模型管理列表落库:providerId 与固定槽位(aiKey/4 个图片槽位)重复的行由固定槽位维护,跳过。
      const fixedProviderIds = new Set(providers.map((item) => item.settings.providerId));
      for (const model of settings.models) {
        if (fixedProviderIds.has(model.providerId)) {
          continue;
        }
        const provider = await tx.providerConfig.upsert({
          where: { providerId: model.providerId },
          create: {
            providerId: model.providerId,
            runtimeKind: model.kind,
            displayName: model.displayName,
            modelId: model.modelId,
            baseUrl: model.baseUrl,
            enabled: model.kind === "text" || Boolean(model.secretRef),
          },
          update: {
            displayName: model.displayName,
            modelId: model.modelId,
            baseUrl: model.baseUrl,
            enabled: model.kind === "text" || Boolean(model.secretRef),
          },
        });
        await tx.credentialMetadata.upsert({
          where: { providerConfigId: provider.id },
          create: {
            providerConfigId: provider.id,
            // G1 trigger 白名单:text 行只允许 owner=opencode,image 行只允许 image_secret_store/environment。
            // CHECK ck_credential_metadata_text_owner_shape:text 行 configured=1 时 secret_ref 必须为 NULL。
            owner: model.kind === "text" ? "opencode" : "image_secret_store",
            status: (model.secretRef || model.keyFingerprint) ? "configured" : "unconfigured",
            secretRef: model.kind === "text" ? null : (model.secretRef ?? null),
            fingerprint: model.keyFingerprint ?? null,
            configured: Boolean(model.secretRef || model.keyFingerprint),
          },
          update: {
            status: (model.secretRef || model.keyFingerprint) ? "configured" : "unconfigured",
            secretRef: model.kind === "text" ? null : (model.secretRef ?? null),
            fingerprint: model.keyFingerprint ?? null,
            configured: Boolean(model.secretRef || model.keyFingerprint),
          },
        });
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
    const runwareSource = (input.runwareImageProvider ?? defaults.runwareImageProvider) as StoredAIKeySettings;
    const now = new Date().toISOString();
    // 迁移:旧文件没有 models → 补预置列表与默认选中。
    // 若 aiKey 是已配置凭证的自定义 provider(如 xai 中转),镜像一条同源模型并设为默认选中,保证默认对话行为不变。
    let models: StoredManagedModel[];
    let presetActiveTextModelId: string | null = null;
    if (Array.isArray(input.models)) {
      models = input.models.map((model) => this.normalizeManagedModel(model, now));
    } else {
      const preset = this.createPresetManagedModels(now);
      const aiKeyProviderId = (typeof aiKey.providerId === "string" ? aiKey.providerId.trim() : "") || "self";
      const aiKeyConfigured = Boolean(
        aiKey.keyFingerprint
        || (typeof aiKey.apiKey === "string" && aiKey.apiKey.trim()),
      );
      const mirror = aiKeyConfigured ? preset.find((model) => model.kind === "text" && model.providerId === aiKeyProviderId) : undefined;
      if (mirror) {
        presetActiveTextModelId = mirror.id;
      } else if (aiKeyConfigured) {
        const mirrorModel: StoredManagedModel = {
          id: `model_${aiKeyProviderId}`,
          kind: "text",
          displayName: typeof aiKey.providerName === "string" && aiKey.providerName.trim() ? aiKey.providerName.trim() : aiKeyProviderId,
          providerId: aiKeyProviderId,
          modelId: typeof aiKey.modelId === "string" && aiKey.modelId.trim() ? aiKey.modelId.trim() : "gpt-5.5",
          baseUrl: typeof aiKey.baseUrl === "string" && aiKey.baseUrl.trim() ? aiKey.baseUrl.trim() : null,
          secretRef: null,
          keyFingerprint: typeof aiKey.keyFingerprint === "string" ? aiKey.keyFingerprint : null,
          createdAt: now,
          updatedAt: now,
        };
        preset.push(mirrorModel);
        presetActiveTextModelId = mirrorModel.id;
      }
      models = preset;
    }
    const activeTextModelId = this.resolveActiveManagedModelId(input.activeTextModelId, models, "text", presetActiveTextModelId ?? defaults.activeTextModelId);
    const activeImageModelId = this.resolveActiveManagedModelId(input.activeImageModelId, models, "image", defaults.activeImageModelId);

    const providerId = this.normalizeProviderId(aiKey.providerId ?? defaults.aiKey.providerId);
    const openaiProviderId = this.normalizeProviderId(openaiSource.providerId ?? defaults.openaiImageProvider.providerId);
    const doubaoProviderId = this.normalizeProviderId(doubaoSource.providerId ?? defaults.doubaoImageProvider.providerId);
    const grokProviderId = this.normalizeProviderId(grokSource.providerId ?? defaults.grokImageProvider.providerId);
    const runwareProviderId = this.normalizeProviderId(runwareSource.providerId ?? defaults.runwareImageProvider.providerId);
    const apiKey = typeof aiKey.apiKey === "string" && aiKey.apiKey.trim() ? aiKey.apiKey.trim() : null;
    const openaiApiKey = typeof openaiSource.apiKey === "string" && openaiSource.apiKey.trim() ? openaiSource.apiKey.trim() : null;
    const doubaoApiKey = typeof doubaoSource.apiKey === "string" && doubaoSource.apiKey.trim() ? doubaoSource.apiKey.trim() : null;
    const grokApiKey = typeof grokSource.apiKey === "string" && grokSource.apiKey.trim() ? grokSource.apiKey.trim() : null;
    const runwareApiKey = typeof runwareSource.apiKey === "string" && runwareSource.apiKey.trim() ? runwareSource.apiKey.trim() : null;
    const theme = input.appearance?.theme && APPEARANCE_THEMES.includes(input.appearance.theme)
      ? input.appearance.theme
      : defaults.appearance.theme;
    const activeImageProvider = this.normalizeImageProviderType(input.activeImageProvider);

    return {
      version: 2,
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
      runwareImageProvider: {
        providerId: runwareProviderId,
        providerName: this.normalizeProviderName(
          runwareSource.providerName ?? this.resolveProviderName(runwareProviderId),
          runwareProviderId,
        ),
        modelId: this.normalizeModelId(runwareSource.modelId ?? defaults.runwareImageProvider.modelId),
        baseUrl: this.normalizeBaseUrl(runwareSource.baseUrl ?? defaults.runwareImageProvider.baseUrl),
        apiKey: runwareApiKey,
        secretRef: typeof runwareSource.secretRef === "string" ? runwareSource.secretRef : null,
        keyFingerprint: runwareApiKey ? this.fingerprintKey(runwareApiKey) : runwareSource.keyFingerprint ?? null,
        updatedAt: typeof runwareSource.updatedAt === "string" ? runwareSource.updatedAt : null,
      },
      activeImageProvider,
      models,
      activeTextModelId,
      activeImageModelId,
      appearance: { theme },
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : defaults.updatedAt,
    };
  }

  private normalizeManagedModel(model: Partial<StoredManagedModel> & { kind?: unknown }, now: string): StoredManagedModel {
    const kind = model.kind === "image" ? "image" : "text";
    const providerId = this.normalizeProviderId(typeof model.providerId === "string" && model.providerId.trim() ? model.providerId : kind === "image" ? "openai_image" : "gpt");
    return {
      id: typeof model.id === "string" && model.id.trim() ? model.id : `model_${randomUUID()}`,
      kind,
      displayName: this.normalizeManagedModelName(model.displayName),
      providerId,
      modelId: this.normalizeModelId(typeof model.modelId === "string" && model.modelId.trim() ? model.modelId : "gpt-5.5"),
      baseUrl: this.normalizeBaseUrl(typeof model.baseUrl === "string" ? model.baseUrl : null),
      secretRef: typeof model.secretRef === "string" ? model.secretRef : null,
      keyFingerprint: typeof model.keyFingerprint === "string" ? model.keyFingerprint : null,
      createdAt: typeof model.createdAt === "string" ? model.createdAt : now,
      updatedAt: typeof model.updatedAt === "string" ? model.updatedAt : now,
    };
  }

  private normalizeManagedModelKind(value: unknown): ManagedModelKind {
    if (value === "image") {
      return "image";
    }
    if (value === "text") {
      return "text";
    }
    throw new BadRequestException("kind 只能是 text 或 image");
  }

  private normalizeManagedModelName(value: unknown): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      throw new BadRequestException("模型显示名称不能为空");
    }
    if (normalized.length > 80) {
      throw new BadRequestException("模型显示名称不能超过 80 个字符");
    }
    return normalized;
  }

  private resolveActiveManagedModelId(value: unknown, models: StoredManagedModel[], kind: ManagedModelKind, fallback: string | null): string | null {
    const candidates = models.filter((model) => model.kind === kind);
    if (candidates.length === 0) {
      return null;
    }
    if (typeof value === "string" && candidates.some((model) => model.id === value)) {
      return value;
    }
    return fallback && candidates.some((model) => model.id === fallback) ? fallback : (candidates[0]?.id ?? null);
  }

  private managedModelCredentialId(kind: ManagedModelKind, id: string): string {
    return `managed_${kind}_${id}`;
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
    const runwareImageProviderId = process.env.RUNWARE_IMAGE_PROVIDER_ID?.trim() || "runware_image";
    const runwareImageModelId = process.env.RUNWARE_IMAGE_MODEL_ID?.trim() || RUNWARE_DEFAULT_MODEL;
    const runwareImageBaseUrl = process.env.RUNWARE_IMAGE_BASE_URL?.trim() || RUNWARE_DEFAULT_BASE_URL;
    const runwareImageApiKey = process.env.RUNWARE_IMAGE_API_KEY?.trim() || null;
    const now = new Date().toISOString();
    const presetModels = this.createPresetManagedModels(now);

    return {
      version: 2,
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
      runwareImageProvider: {
        providerId: runwareImageProviderId,
        providerName: this.resolveProviderName(runwareImageProviderId),
        modelId: runwareImageModelId,
        baseUrl: this.normalizeBaseUrl(runwareImageBaseUrl),
        apiKey: runwareImageApiKey,
        secretRef: null,
        keyFingerprint: runwareImageApiKey ? this.fingerprintKey(runwareImageApiKey) : null,
        updatedAt: runwareImageApiKey ? now : null,
      },
      activeImageProvider: "openai",
      models: presetModels,
      activeTextModelId: presetModels.find((model) => model.kind === "text")?.id ?? null,
      activeImageModelId: presetModels.find((model) => model.kind === "image")?.id ?? null,
      appearance: {
        theme: "dark",
      },
      updatedAt: now,
    };
  }

  private createPresetManagedModels(now: string): StoredManagedModel[] {
    return PRESET_MANAGED_MODELS.map((preset) => ({
      ...preset,
      id: `model_${preset.providerId}`,
      secretRef: null,
      keyFingerprint: null,
      createdAt: now,
      updatedAt: now,
    }));
  }

  private toPublicSettings(settings: StoredAppSettings): AppSettings {
    return {
      aiKey: this.toPublicAIKey(settings.aiKey),
      openaiImageProvider: this.toPublicImageProvider(settings.openaiImageProvider),
      doubaoImageProvider: this.toPublicImageProvider(settings.doubaoImageProvider),
      grokImageProvider: this.toPublicImageProvider(settings.grokImageProvider),
      runwareImageProvider: this.toPublicImageProvider(settings.runwareImageProvider),
      activeImageProvider: settings.activeImageProvider,
      models: settings.models.map((model) => this.toPublicManagedModel(model, settings)),
      appearance: settings.appearance,
      settingsPath: SETTINGS_VIRTUAL_PATH,
      updatedAt: settings.updatedAt,
    };
  }

  private toPublicManagedModel(model: StoredManagedModel, settings: StoredAppSettings): ManagedModelItem {
    return {
      id: model.id,
      kind: model.kind,
      displayName: model.displayName,
      providerId: model.providerId,
      modelId: model.modelId,
      baseUrl: model.baseUrl,
      // 对话模型凭证为 OpenCode-owned(fingerprint 存在、secretRef 恒 null);
      // 图片模型凭证在 SecretStore(secretRef)。任一存在即视为已配置。
      configured: Boolean(model.secretRef || model.keyFingerprint),
      keyFingerprint: model.keyFingerprint,
      active: model.id === (model.kind === "text" ? settings.activeTextModelId : settings.activeImageModelId),
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
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
    return value === "doubao" || value === "grok" || value === "runware" ? value : "openai";
  }

  private getStoredImageProvider(settings: StoredAppSettings, type: ImageProviderType): StoredAIKeySettings {
    if (type === "doubao") {
      return settings.doubaoImageProvider;
    }
    if (type === "grok") {
      return settings.grokImageProvider;
    }
    if (type === "runware") {
      return settings.runwareImageProvider;
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
