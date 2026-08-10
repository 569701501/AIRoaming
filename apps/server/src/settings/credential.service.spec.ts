import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialService } from './credential.service.js';
import { SecretStoreService } from './secret-store.js';
import { PrismaService } from '../persistence/prisma.service.js';

describe('CredentialService', () => {
  let service: CredentialService;
  let secretStore: SecretStoreService;
  let prisma: PrismaService;

  beforeEach(() => {
    // Mock SecretStore
    secretStore = {
      put: vi.fn().mockResolvedValue({ credentialId: 'secret-ref-123' }),
      get: vi.fn().mockResolvedValue({ reveal: () => 'test-api-key' }),
      delete: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock Prisma
    prisma = {
      isDatabaseMode: vi.fn().mockReturnValue(false),
      database: vi.fn(),
    } as any;

    service = new CredentialService(secretStore, prisma);
  });

  describe('文件模式', () => {
    it('should store credential in SecretStore', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };

      const result = await service.storeCredential(descriptor, 'my-api-key');

      expect(secretStore.put).toHaveBeenCalledWith({
        credentialId: 'credential:model:text:model-123:gpt',
        secret: expect.any(Object), // SecretString
      });
      expect(result.secretRef).toBe('secret-ref-123');
      expect(result.keyFingerprint).toBeTruthy();
    });

    it('should retrieve credential from SecretStore', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };
      const storedRef = {
        secretRef: 'secret-ref-123',
        keyFingerprint: 'fingerprint-abc',
      };

      const result = await service.retrieveCredential(descriptor, storedRef);

      expect(secretStore.get).toHaveBeenCalledWith('secret-ref-123');
      expect(result).toBe('test-api-key');
    });

    it('should delete credential from SecretStore', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };

      await service.deleteCredential(descriptor);

      expect(secretStore.delete).toHaveBeenCalledWith(
        'credential:model:text:model-123:gpt',
      );
    });
  });

  describe('DB模式', () => {
    beforeEach(() => {
      // Mock DB mode
      (prisma.isDatabaseMode as any).mockReturnValue(true);

      const mockDatabase = {
        providerConfig: {
          upsert: vi.fn().mockResolvedValue({ id: 'provider-config-123' }),
          findUnique: vi.fn().mockResolvedValue({
            id: 'provider-config-123',
            credentialMetadataByProviderConfig: { configured: true },
          }),
        },
        credentialMetadata: {
          upsert: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({}),
        },
      };
      (prisma.database as any).mockReturnValue(mockDatabase);
    });

    it('should store credential in Database', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };

      const result = await service.storeCredential(descriptor, 'my-api-key');

      expect(result.secretRef).toBeNull();
      expect(result.keyFingerprint).toBeTruthy();
    });

    it('should retrieve credential from Database', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };
      const storedRef = {
        secretRef: null,
        keyFingerprint: 'fingerprint-abc',
      };

      const result = await service.retrieveCredential(descriptor, storedRef);

      expect(result).toBe('test-api-key');
    });
  });

  describe('resolveRuntimeCredential (2层回退)', () => {
    it('should return model credential if exists', async () => {
      const result = await service.resolveRuntimeCredential({
        providerId: 'gpt',
        kind: 'text',
        modelRef: {
          scopeId: 'model-123',
          secretRef: 'secret-ref-123',
          keyFingerprint: null,
        },
        fallbackRef: {
          scopeId: 'aiKey',
          secretRef: 'secret-ref-456',
          keyFingerprint: null,
        },
      });

      expect(result).toBe('test-api-key');
      expect(secretStore.get).toHaveBeenCalledWith('secret-ref-123');
    });

    it('should fallback to global credential if model credential not exists', async () => {
      // Mock: model credential 不存在
      (secretStore.get as any).mockResolvedValueOnce(null);
      (secretStore.get as any).mockResolvedValueOnce({ reveal: () => 'fallback-key' });

      const result = await service.resolveRuntimeCredential({
        providerId: 'gpt',
        kind: 'text',
        modelRef: {
          scopeId: 'model-123',
          secretRef: 'secret-ref-123',
          keyFingerprint: null,
        },
        fallbackRef: {
          scopeId: 'aiKey',
          secretRef: 'secret-ref-456',
          keyFingerprint: null,
        },
      });

      expect(result).toBe('fallback-key');
    });

    it('should return null if both credentials not exist', async () => {
      (secretStore.get as any).mockRejectedValue(new Error('Not found'));

      const result = await service.resolveRuntimeCredential({
        providerId: 'gpt',
        kind: 'text',
        modelRef: {
          scopeId: 'model-123',
          secretRef: 'secret-ref-123',
          keyFingerprint: null,
        },
        fallbackRef: {
          scopeId: 'aiKey',
          secretRef: 'secret-ref-456',
          keyFingerprint: null,
        },
      });

      expect(result).toBeNull();
    });
  });

  describe('缓存机制', () => {
    it('should cache retrieved credentials', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };
      const storedRef = {
        secretRef: 'secret-ref-123',
        keyFingerprint: 'fingerprint-abc',
      };

      // 第一次调用
      await service.retrieveCredential(descriptor, storedRef);
      // 第二次调用（应该走缓存）
      await service.retrieveCredential(descriptor, storedRef);

      // SecretStore 只被调用一次
      expect(secretStore.get).toHaveBeenCalledTimes(1);
    });

    it('should clear cache', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };
      const storedRef = {
        secretRef: 'secret-ref-123',
        keyFingerprint: 'fingerprint-abc',
      };

      await service.retrieveCredential(descriptor, storedRef);
      service.clearCache();
      await service.retrieveCredential(descriptor, storedRef);

      // 缓存清空后，SecretStore 被调用两次
      expect(secretStore.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('边界条件', () => {
    it('should throw error if apiKey is empty', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };

      await expect(service.storeCredential(descriptor, '')).rejects.toThrow(
        'API Key cannot be empty',
      );
    });

    it('should return null if secretRef is null', async () => {
      const descriptor = {
        scope: 'model' as const,
        scopeId: 'model-123',
        providerId: 'gpt',
        kind: 'text' as const,
      };
      const storedRef = {
        secretRef: null,
        keyFingerprint: '',
      };

      const result = await service.retrieveCredential(descriptor, storedRef);

      expect(result).toBeNull();
    });
  });
});
