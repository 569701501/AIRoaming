import { Injectable, OnModuleInit, Optional, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service.js';
import { SecretStoreService, SecretString, fingerprintSecret } from './secret-store.js';

/**
 * 凭证归属范围
 * - model: 模型自己的凭证（用户在模型管理中配置）
 * - legacy_slot: 固定槽位凭证（aiKey、image provider）
 */
export type CredentialScope = 'model' | 'legacy_slot';

/**
 * 凭证描述符
 */
export interface CredentialDescriptor {
  scope: CredentialScope;
  scopeId: string;        // model.id 或 固定槽位key（如 'aiKey'、'openai_image'）
  providerId: string;
  kind: 'text' | 'image';
}

/**
 * 存储结果
 */
export interface StoredCredentialRef {
  secretRef: string | null;      // 文件模式使用
  keyFingerprint: string;         // DB模式使用，用于快速比对
}

/**
 * 凭证服务
 *
 * 职责：
 * 1. 统一凭证存储（加密）
 * 2. 统一凭证读取（解密）
 * 3. 统一凭证删除
 * 4. 封装 DB模式/文件模式 差异
 *
 * 设计：
 * - 文件模式：凭证存 SecretStore，返回 secretRef
 * - DB模式：凭证存 ProviderConfig.CredentialMetadata，返回 keyFingerprint
 * - 上层代码无需区分模式，只需传入 descriptor
 */
@Injectable()
export class CredentialService implements OnModuleInit {
  // 运行时凭证缓存（避免频繁解密）
  private readonly cache = new Map<string, { value: string; expiry: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟

  constructor(
    @Optional() private readonly secretStore?: SecretStoreService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 预检：至少要有一个存储后端
    if (!this.secretStore && !this.prisma) {
      throw new Error('CredentialService requires either SecretStore or Prisma');
    }
  }

  /**
   * 存储凭证（统一入口）
   *
   * @param descriptor 凭证描述符
   * @param apiKey 明文 API Key
   * @returns 存储引用（secretRef 或 keyFingerprint）
   */
  async storeCredential(
    descriptor: CredentialDescriptor,
    apiKey: string,
  ): Promise<StoredCredentialRef> {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new BadRequestException('API Key cannot be empty');
    }

    const secretString = SecretString.from(normalizedKey);
    const fingerprint = fingerprintSecret(secretString);
    const credentialId = this.buildCredentialId(descriptor);

    if (this.prisma?.isDatabaseMode()) {
      // DB模式：存到 ProviderConfig.CredentialMetadata
      await this.storeToDatabase(descriptor, normalizedKey, fingerprint);

      // 更新缓存
      this.setCache(credentialId, normalizedKey);

      return { secretRef: null, keyFingerprint: fingerprint };
    } else {
      // 文件模式：存到 SecretStore
      if (!this.secretStore) {
        throw new Error('SecretStore not available in file mode');
      }

      const metadata = await this.secretStore.put({
        credentialId,
        secret: secretString,
      });
      const secretRef = metadata.credentialId;

      // 更新缓存
      this.setCache(credentialId, normalizedKey);

      return { secretRef, keyFingerprint: fingerprint };
    }
  }

  /**
   * 读取凭证（统一入口）
   *
   * @param descriptor 凭证描述符
   * @param storedRef 存储引用（从 settings 读取）
   * @returns 明文 API Key，不存在返回 null
   */
  async retrieveCredential(
    descriptor: CredentialDescriptor,
    storedRef: StoredCredentialRef,
  ): Promise<string | null> {
    const credentialId = this.buildCredentialId(descriptor);

    // 先查缓存
    const cached = this.getCache(credentialId);
    if (cached) return cached;

    if (this.prisma?.isDatabaseMode()) {
      // DB模式：从 ProviderConfig 读取
      if (!storedRef.keyFingerprint) return null;

      const key = await this.retrieveFromDatabase(descriptor);
      if (key) {
        this.setCache(credentialId, key);
      }
      return key;
    } else {
      // 文件模式：从 SecretStore 读取
      if (!storedRef.secretRef) return null;
      if (!this.secretStore) return null;

      try {
        const secret = await this.secretStore.get(storedRef.secretRef);
        const key = secret.reveal();
        this.setCache(credentialId, key);
        return key;
      } catch {
        return null;
      }
    }
  }

  /**
   * 简化的凭证读取（用于预加载）
   *
   * @param kind 模型类型
   * @param providerId Provider ID
   * @param modelId 模型 ID（null 表示全局凭证）
   * @returns SecretString 或 null
   */
  async get(
    kind: 'text' | 'image',
    providerId: string,
    modelId: string | null,
  ): Promise<SecretString | null> {
    const descriptor: CredentialDescriptor = {
      scope: modelId ? 'model' : 'legacy_slot',
      scopeId: modelId ?? (kind === 'text' ? 'aiKey' : `${providerId}_image`),
      providerId,
      kind,
    };

    const credentialId = this.buildCredentialId(descriptor);

    // 先查缓存
    const cached = this.getCache(credentialId);
    if (cached) return SecretString.from(cached);

    if (this.prisma?.isDatabaseMode()) {
      // DB模式：从 ProviderConfig 读取
      const key = await this.retrieveFromDatabase(descriptor);
      if (key) {
        this.setCache(credentialId, key);
        return SecretString.from(key);
      }
      return null;
    } else {
      // 文件模式：从 SecretStore 读取
      if (!this.secretStore) return null;

      try {
        const secret = await this.secretStore.get(credentialId);
        this.setCache(credentialId, secret.reveal());
        return secret;
      } catch {
        return null;
      }
    }
  }

  /**
   * 删除凭证（统一入口）
   *
   * @param descriptor 凭证描述符
   */
  async deleteCredential(descriptor: CredentialDescriptor): Promise<void> {
    const credentialId = this.buildCredentialId(descriptor);

    if (this.prisma?.isDatabaseMode()) {
      // DB模式：删除 ProviderConfig.CredentialMetadata
      await this.deleteFromDatabase(descriptor);
    } else {
      // 文件模式：删除 SecretStore 条目
      if (this.secretStore) {
        await this.secretStore.delete(credentialId).catch(() => undefined);
      }
    }

    // 清理缓存
    this.cache.delete(credentialId);
  }

  /**
   * 解析运行时凭证（2层回退）
   *
   * @param params 解析参数
   * @returns 明文 API Key，不存在返回 null
   */
  async resolveRuntimeCredential(params: {
    providerId: string;
    kind: 'text' | 'image';
    // 模型凭证引用（优先）
    modelRef?: {
      scopeId: string;
      secretRef: string | null;
      keyFingerprint: string | null;
    } | null;
    // 全局凭证引用（回退）
    fallbackRef?: {
      scopeId: string;
      secretRef: string | null;
      keyFingerprint: string | null;
    } | null;
  }): Promise<string | null> {
    // 1. 优先：模型自己的凭证
    if (params.modelRef) {
      const key = await this.retrieveCredential(
        {
          scope: 'model',
          scopeId: params.modelRef.scopeId,
          providerId: params.providerId,
          kind: params.kind,
        },
        {
          secretRef: params.modelRef.secretRef,
          keyFingerprint: params.modelRef.keyFingerprint ?? '',
        },
      );
      if (key) return key;
    }

    // 2. 回退：全局默认凭证
    if (params.fallbackRef) {
      const key = await this.retrieveCredential(
        {
          scope: 'legacy_slot',
          scopeId: params.fallbackRef.scopeId,
          providerId: params.providerId,
          kind: params.kind,
        },
        {
          secretRef: params.fallbackRef.secretRef,
          keyFingerprint: params.fallbackRef.keyFingerprint ?? '',
        },
      );
      if (key) return key;
    }

    return null;
  }

  // ==================== 私有方法 ====================

  private buildCredentialId(descriptor: CredentialDescriptor): string {
    return `credential:${descriptor.scope}:${descriptor.kind}:${descriptor.scopeId}:${descriptor.providerId}`;
  }

  private async storeToDatabase(
    descriptor: CredentialDescriptor,
    apiKey: string,
    fingerprint: string,
  ): Promise<void> {
    if (!this.prisma) return;

    const database = this.prisma.database();

    // 查找或创建 ProviderConfig
    const providerConfig = await database.providerConfig.upsert({
      where: { providerId: descriptor.providerId },
      create: {
        providerId: descriptor.providerId,
        runtimeKind: descriptor.kind,
        displayName: descriptor.providerId,
        modelId: 'default',
        enabled: true,
      },
      update: {},
    });

    // 存储凭证到 CredentialMetadata
    await database.credentialMetadata.upsert({
      where: { providerConfigId: providerConfig.id },
      create: {
        providerConfigId: providerConfig.id,
        owner: descriptor.scope,
        status: 'active',
        fingerprint,
        configured: true,
      },
      update: {
        fingerprint,
        configured: true,
        rotatedAt: new Date(),
      },
    });

    // 存储加密的 apiKey 到 SecretStore（DB模式也用 SecretStore 存实际密钥）
    if (this.secretStore) {
      const secretId = `provider_${providerConfig.id}`;
      await this.secretStore.put({
        credentialId: secretId,
        secret: SecretString.from(apiKey),
      });
    }
  }

  private async retrieveFromDatabase(descriptor: CredentialDescriptor): Promise<string | null> {
    if (!this.prisma) return null;

    const database = this.prisma.database();

    // 查找 ProviderConfig
    const providerConfig = await database.providerConfig.findUnique({
      where: { providerId: descriptor.providerId },
      include: { credentialMetadataByProviderConfig: true },
    });

    if (!providerConfig?.credentialMetadataByProviderConfig?.configured) {
      return null;
    }

    // 从 SecretStore 读取实际密钥
    if (!this.secretStore) return null;

    const secretId = `provider_${providerConfig.id}`;
    try {
      const secret = await this.secretStore.get(secretId);
      return secret.reveal();
    } catch {
      return null;
    }
  }

  private async deleteFromDatabase(descriptor: CredentialDescriptor): Promise<void> {
    if (!this.prisma) return;

    const database = this.prisma.database();

    const providerConfig = await database.providerConfig.findUnique({
      where: { providerId: descriptor.providerId },
    });

    if (!providerConfig) return;

    // 删除 CredentialMetadata
    await database.credentialMetadata.deleteMany({
      where: { providerConfigId: providerConfig.id },
    });

    // 删除 SecretStore 中的密钥
    if (this.secretStore) {
      const secretId = `provider_${providerConfig.id}`;
      await this.secretStore.delete(secretId).catch(() => undefined);
    }
  }

  // ==================== 缓存管理 ====================

  private getCache(credentialId: string): string | null {
    const entry = this.cache.get(credentialId);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() > entry.expiry) {
      this.cache.delete(credentialId);
      return null;
    }

    return entry.value;
  }

  private setCache(credentialId: string, value: string): void {
    this.cache.set(credentialId, {
      value,
      expiry: Date.now() + this.CACHE_TTL,
    });
  }

  /**
   * 清除所有缓存（用于测试或强制刷新）
   */
  clearCache(): void {
    this.cache.clear();
  }
}
