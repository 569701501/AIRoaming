import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open as openFile, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaService } from "../persistence/prisma.service.js";
import { SettingsService, type AtomicSettingsFileOps, writeSettingsFileAtomically } from "./settings.service.js";
import { FakeSecretStore } from "./secret-store.js";
import { CredentialService } from "./credential.service.js";

describe("D2-A1 SettingsService secret boundary", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("SEC-05/07 migrates legacy plaintext into fake store and never returns keyPreview", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const settingsPath = path.join(workspaceRoot, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      version: 1,
      aiKey: { providerId: "self", providerName: "自定义", modelId: "gpt-5.5", baseUrl: null, apiKey: "airoaming-text-sentinel", updatedAt: null },
      openaiImageProvider: { providerId: "openai_image", providerName: "OpenAI", modelId: "gpt-image-2", baseUrl: "https://example.test/v1", apiKey: "airoaming-image-sentinel" },
      doubaoImageProvider: { providerId: "doubao_image", providerName: "豆包", modelId: "seedream", baseUrl: "https://example.test/v3", apiKey: null },
      grokImageProvider: { providerId: "grok_image", providerName: "Grok", modelId: "grok", baseUrl: "https://example.test/v1", apiKey: null },
      activeImageProvider: "openai",
      appearance: { theme: "dark" },
      updatedAt: "2026-07-13T00:00:00.000Z",
    }), "utf8");
    const store = new FakeSecretStore(secretRoot);
    const service = createService(workspaceRoot, store);
    await service.onModuleInit();
    const publicSettings = await service.getSettings();
    const persisted = await readFile(settingsPath, "utf8");
    expect((await stat(settingsPath)).mode & 0o777).toBe(0o600);
    expect(persisted).not.toContain("airoaming-text-sentinel");
    expect(persisted).not.toContain("airoaming-image-sentinel");
    expect(publicSettings.aiKey).toMatchObject({ configured: true, keyPreview: null });
    expect(publicSettings.openaiImageProvider).toMatchObject({ configured: true, keyPreview: null });
    expect(service.getRuntimeAIKeySettings().apiKey).toBe("airoaming-text-sentinel");
    expect(service.getRuntimeImageProviderSettings().apiKey).toBe("airoaming-image-sentinel");
  });

  it("SEC-08 reloads image metadata and secret after a service restart while text key stays OpenCode-owned", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const store = new FakeSecretStore(secretRoot);
    const first = createService(workspaceRoot, store);
    await first.onModuleInit();
    await first.updateSettings({
      aiKey: { providerId: "self", modelId: "gpt-5.5", apiKey: "airoaming-text-session" },
      openaiImageProvider: { apiKey: "airoaming-image-persisted", baseUrl: "https://example.test/v1" },
    });
    const second = createService(workspaceRoot, store);
    await second.onModuleInit();
    expect(second.getRuntimeAIKeySettings().apiKey).toBeNull();
    expect(second.getRuntimeImageProviderSettings().apiKey).toBe("airoaming-image-persisted");
    expect((await second.getSettings()).openaiImageProvider.keyPreview).toBeNull();
  });

  it("Runware 密钥只进入 SecretStore，重启后仍可安全切换和读取", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const store = new FakeSecretStore(secretRoot);
    const first = createService(workspaceRoot, store);
    await first.onModuleInit();
    const saved = await first.updateSettings({
      runwareImageProvider: { apiKey: "runware-secret-sentinel" },
      activeImageProvider: "runware",
    });

    expect(saved).toMatchObject({
      activeImageProvider: "runware",
      runwareImageProvider: {
        providerId: "runware_image",
        modelId: "runware:100@1",
        baseUrl: "https://api.runware.ai/v1",
        configured: true,
        keyPreview: null,
      },
    });
    const persisted = await readFile(path.join(workspaceRoot, "settings", "app-settings.json"), "utf8");
    expect(persisted).not.toContain("runware-secret-sentinel");
    expect(persisted).toContain("runwareImageProvider");

    const second = createService(workspaceRoot, store);
    await second.onModuleInit();
    expect(second.getRuntimeImageProviderSettings()).toMatchObject({
      type: "runware",
      providerId: "runware_image",
      modelId: "runware:100@1",
      baseUrl: "https://api.runware.ai/v1",
      apiKey: "runware-secret-sentinel",
    });
    expect((await second.getSettings()).runwareImageProvider).toMatchObject({
      configured: true,
      keyPreview: null,
    });
  });

  it("recovers a text runtime key after restart only when the Grok image credential has the same fingerprint and base URL", async () => {    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const store = new FakeSecretStore(secretRoot);
    const first = createService(workspaceRoot, store);
    await first.onModuleInit();
    await first.updateSettings({
      aiKey: {
        providerId: "xai",
        modelId: "grok-4.5",
        baseUrl: "https://proxy.example/v1",
        apiKey: "shared-grok-runtime-key",
      },
      grokImageProvider: {
        providerId: "grok_image",
        modelId: "grok-imagine-image-quality",
        baseUrl: "https://proxy.example/v1",
        apiKey: "shared-grok-runtime-key",
      },
    });

    const second = createService(workspaceRoot, store);
    await second.onModuleInit();

    expect(second.getRuntimeAIKeySettings().apiKey).toBe("shared-grok-runtime-key");
    expect(await readFile(path.join(workspaceRoot, "settings", "app-settings.json"), "utf8"))
      .not.toContain("shared-grok-runtime-key");
  });

  it("adds xAI Grok 4.5 as a text runtime choice without retaining another provider's key state", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const service = createService(workspaceRoot, new FakeSecretStore(secretRoot));
    await service.onModuleInit();

    await service.updateSettings({
      aiKey: { providerId: "self", modelId: "gpt-5.5", apiKey: "existing-provider-key" },
    });
    const withoutKey = await service.updateSettings({
      aiKey: {
        providerId: "xai",
        providerName: "xAI Grok 对话",
        modelId: "grok-4.5",
        baseUrl: "https://api.x.ai/v1",
      },
    });

    expect(withoutKey.aiKey).toMatchObject({
      providerId: "xai",
      providerName: "xAI Grok 对话",
      modelId: "grok-4.5",
      baseUrl: "https://api.x.ai/v1",
      configured: false,
      keyFingerprint: null,
    });
    expect(service.getRuntimeAIKeySettings()).toEqual({
      providerId: "xai",
      modelId: "grok-4.5",
      baseUrl: "https://api.x.ai/v1",
      apiKey: null,
    });

    const configured = await service.updateSettings({
      aiKey: { apiKey: "xai-runtime-key" },
    });
    expect(configured.aiKey).toMatchObject({
      providerId: "xai",
      modelId: "grok-4.5",
      configured: true,
    });
    expect(service.getRuntimeAIKeySettings().apiKey).toBe("xai-runtime-key");
    expect(await readFile(path.join(workspaceRoot, "settings", "app-settings.json"), "utf8"))
      .not.toContain("xai-runtime-key");
  });

  it("SEC-06/11 does not overwrite a legacy plaintext file when SecretStore is unavailable", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    roots.push(workspaceRoot);
    const settingsPath = path.join(workspaceRoot, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const legacy = JSON.stringify({
      aiKey: { providerId: "self", modelId: "gpt-5.5", apiKey: "airoaming-legacy-image-sentinel" },
      openaiImageProvider: { providerId: "openai_image", modelId: "gpt-image-2", apiKey: "airoaming-legacy-image-sentinel" },
      activeImageProvider: "openai",
      appearance: { theme: "dark" },
    });
    await writeFile(settingsPath, legacy, "utf8");
    const service = createService(workspaceRoot, undefined);
    await expect(service.onModuleInit()).rejects.toMatchObject({ code: "SECRET_STORE_UNAVAILABLE" });
    expect(await readFile(settingsPath, "utf8")).toBe(legacy);
  });

  it("SEC-09 updates image metadata only after the secret store accepts the new value", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const service = createService(workspaceRoot, new FakeSecretStore(secretRoot));
    await service.onModuleInit();
    const result = await service.updateSettings({ openaiImageProvider: { apiKey: "airoaming-update-sentinel" } });
    expect(result.openaiImageProvider).toMatchObject({ configured: true, keyPreview: null });
    expect((await readFile(path.join(workspaceRoot, "settings", "app-settings.json"), "utf8"))).not.toContain("airoaming-update-sentinel");
  });

  it("M6A1-RB-03 / SEC-06 keeps the old bytes and removes the temporary file when rename fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-atomic-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const legacy = "{\"apiKey\":\"legacy-only-in-old-file\"}\n";
    await writeFile(settingsPath, legacy, { encoding: "utf8", mode: 0o600 });
    const operations: AtomicSettingsFileOps = {
      mkdir,
      open: openFile,
      rename: async () => { throw new Error("RENAME_FAILED"); },
      rm,
    };
    await expect(writeSettingsFileAtomically(settingsPath, "{\"configured\":true}\n", operations))
      .rejects.toThrow("RENAME_FAILED");
    expect(await readFile(settingsPath, "utf8")).toBe(legacy);
    expect((await readdir(path.dirname(settingsPath))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("SEC-06 keeps the old bytes and removes the temporary file when writing fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-atomic-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const legacy = "{\"apiKey\":\"legacy-only-in-old-file\"}\n";
    await writeFile(settingsPath, legacy, { encoding: "utf8", mode: 0o600 });
    const operations: AtomicSettingsFileOps = {
      mkdir,
      open: async (temporary, flags, mode) => {
        const handle = await openFile(temporary, flags, mode);
        return {
          writeFile: async () => {
            await handle.writeFile("plaintext-that-must-not-survive", "utf8");
            throw new Error("WRITE_FAILED");
          },
          sync: () => handle.sync(),
          close: () => handle.close(),
        };
      },
      rename: async () => { throw new Error("RENAME_MUST_NOT_RUN"); },
      rm,
    };
    await expect(writeSettingsFileAtomically(settingsPath, "plaintext-that-must-not-survive", operations))
      .rejects.toThrow("WRITE_FAILED");
    expect(await readFile(settingsPath, "utf8")).toBe(legacy);
    expect((await readdir(path.dirname(settingsPath))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("SEC-06 keeps the old bytes and removes the temporary file when fsync fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-atomic-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const legacy = "{\"apiKey\":\"legacy-only-in-old-file\"}\n";
    await writeFile(settingsPath, legacy, { encoding: "utf8", mode: 0o600 });
    const operations: AtomicSettingsFileOps = {
      mkdir,
      open: async (temporary, flags, mode) => {
        const handle = await openFile(temporary, flags, mode);
        return {
          writeFile: (contents: string, encoding: "utf8") => handle.writeFile(contents, encoding),
          sync: async () => { throw new Error("FSYNC_FAILED"); },
          close: () => handle.close(),
        };
      },
      rename: async () => { throw new Error("RENAME_MUST_NOT_RUN"); },
      rm,
    };
    await expect(writeSettingsFileAtomically(settingsPath, "plaintext-that-must-not-survive", operations))
      .rejects.toThrow("FSYNC_FAILED");
    expect(await readFile(settingsPath, "utf8")).toBe(legacy);
    expect((await readdir(path.dirname(settingsPath))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("SEC-08 persists image metadata in DB and reloads it after a Prisma restart", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-settings-db-"));
    const workspaceRoot = path.join(root, "workspace");
    const databasePath = path.join(root, "db.sqlite");
    const secretRoot = path.join(root, "secrets");
    roots.push(root);
    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(secretRoot, { recursive: true });
    await writeFile(databasePath, "", { encoding: "utf8", mode: 0o600 });
    const databaseUrl = `file:${databasePath}`;
    const previousMode = process.env.AIROAMING_PERSISTENCE_MODE;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    let firstPrisma: PrismaService | undefined;
    let secondPrisma: PrismaService | undefined;
    try {
      const deployed = await deployMigrations(databaseUrl);
      expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
      const store = new FakeSecretStore(secretRoot);
      firstPrisma = new PrismaService();
      await firstPrisma.onModuleInit();
      const first = createService(workspaceRoot, store, firstPrisma);
      await first.onModuleInit();
      await first.updateSettings({ openaiImageProvider: { apiKey: "airoaming-db-image-sentinel" } });
      await first.updateSettings({ openaiImageProvider: { apiKey: "airoaming-db-image-sentinel" } });
      await expect(first.updateSettings({ openaiImageProvider: { apiKey: "airoaming-db-image-replacement" } }))
        .rejects.toThrow("SETTINGS_SECRET_ROTATION_REQUIRES_OUTBOX");
      expect((await store.get("image_openai_openai_image")).reveal()).toBe("airoaming-db-image-sentinel");
      expect(first.getRuntimeImageProviderSettings().apiKey).toBe("airoaming-db-image-sentinel");
      const metadata = await firstPrisma.database().credentialMetadata.findFirst({
        where: { owner: "image_secret_store", configured: true },
      });
      expect(metadata).toMatchObject({ owner: "image_secret_store", status: "configured", configured: true });
      expect(metadata?.secretRef).toMatch(/^airoaming:image:v1:[0-9a-f-]{36}$/);
      expect(metadata?.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(metadata?.secretRef).not.toContain("airoaming-db-image-sentinel");
      await firstPrisma.onModuleDestroy();
      firstPrisma = undefined;

      secondPrisma = new PrismaService();
      await secondPrisma.onModuleInit();
      const second = createService(workspaceRoot, store, secondPrisma);
      await second.onModuleInit();
      expect(second.getRuntimeImageProviderSettings().apiKey).toBe("airoaming-db-image-sentinel");
      expect((await second.getSettings()).openaiImageProvider.keyPreview).toBeNull();
    } finally {
      await secondPrisma?.onModuleDestroy();
      await firstPrisma?.onModuleDestroy();
      if (previousMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE;
      else process.env.AIROAMING_PERSISTENCE_MODE = previousMode;
      if (previousDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabase;
    }
  }, 20_000);
});

describe("D2-A2 managed models CRUD", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function createFileService(): Promise<{ service: SettingsService; settingsPath: string; store: FakeSecretStore }> {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const store = new FakeSecretStore(secretRoot);
    const service = createService(workspaceRoot, store);
    await service.onModuleInit();
    return { service, settingsPath: path.join(workspaceRoot, "settings", "app-settings.json"), store };
  }

  it("M-01 initializes preset models with one active per kind", async () => {
    const { service } = await createFileService();
    const settings = await service.getSettings();
    expect(settings.models).toHaveLength(6);
    const textModels = settings.models.filter((model) => model.kind === "text");
    const imageModels = settings.models.filter((model) => model.kind === "image");
    expect(textModels.map((model) => model.displayName)).toEqual(["GPT 对话", "Kimi 对话", "DeepSeek 对话"]);
    expect(imageModels.map((model) => model.displayName)).toEqual(["OpenAI 图片", "Grok 图片", "Runware 图片"]);
    expect(textModels.filter((model) => model.active)).toHaveLength(1);
    expect(textModels.find((model) => model.active)?.displayName).toBe("GPT 对话");
    expect(imageModels.filter((model) => model.active)).toHaveLength(1);
    expect(imageModels.find((model) => model.active)?.displayName).toBe("OpenAI 图片");
    expect(settings.models.every((model) => !model.configured)).toBe(true);
  });

  it("M-02 upgrades a v1 settings file with preset models and persists them", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const settingsPath = path.join(workspaceRoot, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      version: 1,
      aiKey: { providerId: "self", providerName: "自定义", modelId: "gpt-5.5", baseUrl: null, apiKey: null, updatedAt: null },
      openaiImageProvider: { providerId: "openai_image", providerName: "OpenAI", modelId: "gpt-image-2", baseUrl: null, apiKey: null },
      doubaoImageProvider: { providerId: "doubao_image", providerName: "豆包", modelId: "seedream", baseUrl: "https://example.test/v3", apiKey: null },
      grokImageProvider: { providerId: "grok_image", providerName: "Grok", modelId: "grok", baseUrl: null, apiKey: null },
      activeImageProvider: "openai",
      appearance: { theme: "dark" },
      updatedAt: "2026-08-05T00:00:00.000Z",
    }), "utf8");
    const service = createService(workspaceRoot, new FakeSecretStore(secretRoot));
    await service.onModuleInit();
    const settings = await service.getSettings();
    expect(settings.models).toHaveLength(6);
    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as { version: number; models: Array<{ providerId: string }> };
    expect(persisted.version).toBe(2);
    expect(persisted.models).toHaveLength(6);
    expect(persisted.models.map((model) => model.providerId)).toEqual(settings.models.map((model) => model.providerId));
  });

  it("M-03 creates a model without auto-activating and validates required fields", async () => {
    const { service } = await createFileService();
    const before = await service.getSettings();
    const created = await service.createManagedModel({
      kind: "text",
      displayName: "我的模型",
      providerId: "custom_provider",
      modelId: "custom-model-1",
      baseUrl: "https://proxy.example/v1",
    });
    expect(created.models).toHaveLength(before.models.length + 1);
    const added = created.models.find((model) => model.providerId === "custom_provider");
    expect(added).toMatchObject({
      displayName: "我的模型",
      kind: "text",
      modelId: "custom-model-1",
      baseUrl: "https://proxy.example/v1",
      active: false,
      configured: false,
    });
    expect(created.models.filter((model) => model.kind === "text" && model.active)).toHaveLength(1);
    await expect(service.createManagedModel({
      kind: "text" as never,
      displayName: "  ",
      providerId: "x",
      modelId: "y",
      baseUrl: "https://x.example/v1",
    })).rejects.toThrow("模型显示名称不能为空");
    await expect(service.createManagedModel({
      kind: "bogus" as never,
      displayName: "x",
      providerId: "x",
      modelId: "y",
      baseUrl: "https://x.example/v1",
    })).rejects.toThrow("kind 只能是 text 或 image");
    await expect(service.createManagedModel({
      kind: "text",
      displayName: "缺 Base URL",
      providerId: "no_base",
      modelId: "m",
    } as never)).rejects.toThrow("MANAGED_MODEL_BASE_URL_REQUIRED");
  });

  it("M-04 activates a model and keeps one active per kind", async () => {
    const { service } = await createFileService();
    const kimi = (await service.getSettings()).models.find((model) => model.displayName === "Kimi 对话")!;
    const activated = await service.activateManagedModel(kimi.id);
    expect(activated.models.find((model) => model.displayName === "GPT 对话")?.active).toBe(false);
    expect(activated.models.find((model) => model.displayName === "Kimi 对话")?.active).toBe(true);
    const imageTarget = (await service.getSettings()).models.find((model) => model.displayName === "Grok 图片")!;
    const imageActivated = await service.activateManagedModel(imageTarget.id);
    expect(imageActivated.models.filter((model) => model.kind === "image" && model.active)).toHaveLength(1);
    expect(imageActivated.models.find((model) => model.displayName === "Grok 图片")?.active).toBe(true);
    await expect(service.activateManagedModel("model_missing")).rejects.toThrow("MANAGED_MODEL_NOT_FOUND");
  });

  it("M-05 forbids deleting the active model and deletes non-active ones", async () => {
    const { service } = await createFileService();
    const settings = await service.getSettings();
    const activeText = settings.models.find((model) => model.kind === "text" && model.active)!;
    await expect(service.deleteManagedModel(activeText.id)).rejects.toThrow("MANAGED_MODEL_ACTIVE_DELETE_FORBIDDEN");
    const kimi = settings.models.find((model) => model.displayName === "Kimi 对话")!;
    const deleted = await service.deleteManagedModel(kimi.id);
    expect(deleted.models.some((model) => model.id === kimi.id)).toBe(false);
    expect(deleted.models).toHaveLength(settings.models.length - 1);
  });

  it("M-06 stores model API keys via SecretStore and survives restart without leaking plaintext", async () => {
    const { service, settingsPath, store } = await createFileService();
    const created = await service.createManagedModel({
      kind: "image",
      displayName: "私有图片",
      providerId: "private_image",
      modelId: "private-model-v1",
      baseUrl: "https://private.example/v1",
      apiKey: "managed-model-secret-sentinel",
    });
    const added = created.models.find((model) => model.providerId === "private_image")!;
    expect(added.configured).toBe(true);
    expect(added.keyFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).not.toContain("managed-model-secret-sentinel");
    const second = createService(path.dirname(path.dirname(settingsPath)), store);
    await second.onModuleInit();
    const reloaded = (await second.getSettings()).models.find((model) => model.id === added.id)!;
    expect(reloaded.configured).toBe(true);
    expect(reloaded.keyFingerprint).toBe(added.keyFingerprint);
    await expect(service.updateManagedModel(added.id, { clearApiKey: true })).resolves.toMatchObject({
      models: expect.arrayContaining([expect.objectContaining({ id: added.id, configured: false, keyFingerprint: null })]),
    });
  });

  it("M-07 updates editable fields of a managed model", async () => {
    const { service } = await createFileService();
    const created = await service.createManagedModel({
      kind: "text",
      displayName: "旧名字",
      providerId: "old_provider",
      modelId: "old-model",
      baseUrl: "https://proxy.example/v1",
    });
    const id = created.models.find((model) => model.providerId === "old_provider")!.id;
    const updated = await service.updateManagedModel(id, {
      displayName: "新名字",
      providerId: "new_provider",
      modelId: "new-model",
    });
    expect(updated.models.find((model) => model.id === id)).toMatchObject({
      displayName: "新名字",
      providerId: "new_provider",
      modelId: "new-model",
    });
  });

  it("M-09 runtime text settings follow the active managed model", async () => {
    const { service } = await createFileService();
    expect(service.getRuntimeAIKeySettings()).toMatchObject({
      providerId: "gpt",
      modelId: "gpt-5.5",
    });
    const kimi = (await service.getSettings()).models.find((model) => model.displayName === "Kimi 对话")!;
    await service.activateManagedModel(kimi.id);
    expect(service.getRuntimeAIKeySettings()).toMatchObject({
      providerId: "kimi",
      modelId: "kimi-k2",
    });
    // 同 provider 的模型可复用 aiKey 凭证。
    await service.updateSettings({
      aiKey: { providerId: "xai", modelId: "grok-4.5", baseUrl: "https://proxy.example/v1", apiKey: "xai-runtime-key" },
    });
    const created = await service.createManagedModel({
      kind: "text",
      displayName: "XAI 副本",
      providerId: "xai",
      modelId: "grok-4.5",
      baseUrl: "https://proxy.example/v1",
    });
    const xaiModel = created.models.find((model) => model.providerId === "xai" && model.displayName === "XAI 副本")!;
    await service.activateManagedModel(xaiModel.id);
    expect(service.getRuntimeAIKeySettings()).toMatchObject({
      providerId: "xai",
      modelId: "grok-4.5",
      baseUrl: "https://proxy.example/v1",
      apiKey: "xai-runtime-key",
    });
    // 自带凭证的模型优先用自身密钥。
    const secretModel = await service.createManagedModel({
      kind: "text",
      displayName: "私有对话",
      providerId: "private_text",
      modelId: "private-model",
      baseUrl: "https://private.example/v1",
      apiKey: "private-model-key",
    });
    const privateModel = secretModel.models.find((model) => model.providerId === "private_text")!;
    await service.activateManagedModel(privateModel.id);
    expect(service.getRuntimeAIKeySettings()).toMatchObject({
      providerId: "private_text",
      modelId: "private-model",
      apiKey: "private-model-key",
    });
  });

  it("M-10 upgrades a v1 file by mirroring a configured aiKey provider as the active model", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const settingsPath = path.join(workspaceRoot, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      version: 1,
      aiKey: { providerId: "xai", providerName: "xAI Grok 对话", modelId: "grok-4.5", baseUrl: "https://proxy.example/v1", apiKey: "legacy-xai-key", updatedAt: null },
      openaiImageProvider: { providerId: "openai_image", providerName: "OpenAI", modelId: "gpt-image-2", baseUrl: null, apiKey: null },
      doubaoImageProvider: { providerId: "doubao_image", providerName: "豆包", modelId: "seedream", baseUrl: "https://example.test/v3", apiKey: null },
      grokImageProvider: { providerId: "grok_image", providerName: "Grok", modelId: "grok", baseUrl: null, apiKey: null },
      activeImageProvider: "openai",
      appearance: { theme: "dark" },
      updatedAt: "2026-08-05T00:00:00.000Z",
    }), "utf8");
    const service = createService(workspaceRoot, new FakeSecretStore(secretRoot));
    await service.onModuleInit();
    const settings = await service.getSettings();
    const xaiModel = settings.models.find((model) => model.providerId === "xai")!;
    expect(xaiModel).toMatchObject({
      id: "model_xai",
      displayName: "xAI Grok 对话",
      modelId: "grok-4.5",
      active: true,
    });
    expect(settings.models).toHaveLength(7);
    expect(service.getRuntimeAIKeySettings()).toMatchObject({
      providerId: "xai",
      modelId: "grok-4.5",
      baseUrl: "https://proxy.example/v1",
      apiKey: "legacy-xai-key",
    });
  });

  it("M-11 runtime image settings follow the active managed image model", async () => {
    const { service } = await createFileService();
    await service.updateSettings({
      openaiImageProvider: { apiKey: "openai-image-key", baseUrl: "https://img.example/v1" },
    });
    // 默认选中 openai_image:openai 协议 + 复用固定槽位凭证。
    expect(service.getRuntimeImageProviderSettings()).toMatchObject({
      type: "openai",
      providerId: "openai_image",
      modelId: "gpt-image-2",
      apiKey: "openai-image-key",
    });
    // 「图片生成」tab 切换 → 同步模型管理选中到 grok_image。
    await service.updateSettings({ activeImageProvider: "grok" });
    expect(service.getRuntimeImageProviderSettings()).toMatchObject({
      type: "grok",
      providerId: "grok_image",
      modelId: "grok-imagine-image-quality",
    });
    // 激活自带凭证的自定义图片模型:协议按 providerId 推断为 openai,凭证/地址用模型自身。
    const created = await service.createManagedModel({
      kind: "image",
      displayName: "自定义图片",
      providerId: "custom_image",
      modelId: "custom-img-1",
      baseUrl: "https://custom.example/v1",
      apiKey: "custom-image-key",
    });
    const custom = created.models.find((model) => model.providerId === "custom_image")!;
    await service.activateManagedModel(custom.id);
    expect(service.getRuntimeImageProviderSettings()).toMatchObject({
      type: "openai",
      providerId: "custom_image",
      modelId: "custom-img-1",
      baseUrl: "https://custom.example/v1",
      apiKey: "custom-image-key",
    });
  });

  it("M-08 DB mode persists model credentials and active pointers, and refuses fixed-slot deletion", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-db-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-db-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const databaseUrl = `file:${path.join(workspaceRoot, "models.db")}`;
    const previousMode = process.env.AIROAMING_PERSISTENCE_MODE;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    let prisma: PrismaService | undefined;
    try {
      const deployed = await deployMigrations(databaseUrl);
      expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
      const store = new FakeSecretStore(secretRoot);
      prisma = new PrismaService();
      await prisma.onModuleInit();
      const service = createService(workspaceRoot, store, prisma);
      await service.onModuleInit();
      // DB 模式下模型可以带凭证:明文进 SecretStore,text 行不写 secret_ref(G1 CHECK)。
      const withSecret = await service.createManagedModel({
        kind: "text",
        displayName: "带密钥",
        providerId: "secret_text",
        modelId: "m",
        baseUrl: "https://secret.example/v1",
        apiKey: "db-mode-secret",
      });
      const secretModel = withSecret.models.find((model) => model.providerId === "secret_text")!;
      expect(secretModel.configured).toBe(true);
      await service.activateManagedModel(secretModel.id);
      expect(service.getRuntimeAIKeySettings()).toMatchObject({
        providerId: "secret_text",
        modelId: "m",
        apiKey: "db-mode-secret",
      });
      // active 指针与密钥都必须跨重启存活。
      const restarted = createService(workspaceRoot, new FakeSecretStore(secretRoot), prisma);
      await restarted.onModuleInit();
      const reloaded = await restarted.getSettings();
      expect(reloaded.models.find((model) => model.id === secretModel.id)).toMatchObject({ active: true, configured: true });
      expect(restarted.getRuntimeAIKeySettings()).toMatchObject({ providerId: "secret_text", apiKey: "db-mode-secret" });
      const created = await service.createManagedModel({
        kind: "text",
        displayName: "自定义文本",
        providerId: "custom_text",
        modelId: "custom-model",
        baseUrl: "https://custom.example/v1",
      });
      const added = created.models.find((model) => model.providerId === "custom_text")!;
      expect(added.configured).toBe(false);
      const deleted = await service.deleteManagedModel(added.id);
      expect(deleted.models.some((model) => model.id === added.id)).toBe(false);
      await expect(service.deleteManagedModel("model_runware_image"))
        .rejects.toThrow("MANAGED_MODEL_FIXED_SLOT_DELETE_FORBIDDEN");
      // 回归:text 行已配置 fingerprint(OpenCode-owned 历史数据)时,模型管理写入不得触发
      // ck_credential_metadata_text_owner_shape CHECK 失败(configured=0 时 fingerprint 必须为 NULL)。
      await prisma.database().providerConfig.create({
        data: { providerId: "legacy_text", runtimeKind: "text", displayName: "旧文本", modelId: "old-model", enabled: true },
      });
      const legacyProvider = await prisma.database().providerConfig.findUniqueOrThrow({ where: { providerId: "legacy_text" } });
      await prisma.database().credentialMetadata.create({
        data: {
          providerConfigId: legacyProvider.id,
          owner: "opencode",
          status: "configured",
          secretRef: null,
          fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          configured: true,
        },
      });
      const createdWithLegacy = await service.createManagedModel({
        kind: "text",
        displayName: "新文本",
        providerId: "new_text",
        modelId: "new-model",
        baseUrl: "https://new.example/v1",
      });
      const newText = createdWithLegacy.models.find((model) => model.providerId === "new_text")!;
      await service.activateManagedModel(newText.id);
      expect((await service.getSettings()).models.some((model) => model.id === newText.id)).toBe(true);
    } finally {
      await prisma?.onModuleDestroy();
      if (previousMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE;
      else process.env.AIROAMING_PERSISTENCE_MODE = previousMode;
      if (previousDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabase;
    }
  }, 20_000);

  it("M-12 DB 模式编辑与固定槽位同 providerId 的图片模型密钥,必须落库并跨重启恢复", async () => {
    // 回归:2026-08-10 用户编辑 Grok 图片模型填 key 后仍提示「未配置密钥」。
    // 根因是 writeDatabaseSettings 的 models 循环跳过固定槽位 providerId,
    // 固定槽位循环又用 DB 旧值回写,新 fingerprint/secretRef 永远落不了库。
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-db-"));
    const secretRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-models-db-secret-"));
    roots.push(workspaceRoot, secretRoot);
    const databaseUrl = `file:${path.join(workspaceRoot, "models.db")}`;
    const previousMode = process.env.AIROAMING_PERSISTENCE_MODE;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    let prisma: PrismaService | undefined;
    try {
      const deployed = await deployMigrations(databaseUrl);
      expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
      prisma = new PrismaService();
      await prisma.onModuleInit();
      const service = createService(workspaceRoot, new FakeSecretStore(secretRoot), prisma);
      await service.onModuleInit();
      // 预置 Grok 图片模型与固定槽位 grok_image 共享 provider 行。编辑补 key。
      const updated = await service.updateManagedModel("model_grok_image", { apiKey: "grok-image-key-1" });
      const edited = updated.models.find((model) => model.id === "model_grok_image")!;
      expect(edited.configured).toBe(true);
      // 关键断言:DB 里该行的 fingerprint/secretRef/configured 必须是新值,不是固定槽位旧值。
      const row = await prisma.database().providerConfig.findUniqueOrThrow({
        where: { providerId: "grok_image" },
        include: { credentialMetadataByProviderConfig: true },
      });
      expect(row.credentialMetadataByProviderConfig).toMatchObject({
        status: "configured",
        configured: true,
      });
      expect(row.credentialMetadataByProviderConfig?.fingerprint).toMatch(/^sha256:/);
      expect(row.credentialMetadataByProviderConfig?.secretRef).toBeTruthy();
      // 跨重启:新服务实例从 DB fingerprint + SecretStore 恢复,运行时仍能拿到 key。
      const restarted = createService(workspaceRoot, new FakeSecretStore(secretRoot), prisma);
      await restarted.onModuleInit();
      const reloaded = await restarted.getSettings();
      expect(reloaded.models.find((model) => model.id === "model_grok_image")).toMatchObject({ configured: true });
      await restarted.activateManagedModel("model_grok_image");
      expect(restarted.getRuntimeImageProviderSettings()).toMatchObject({
        providerId: "grok_image",
        apiKey: "grok-image-key-1",
      });
    } finally {
      await prisma?.onModuleDestroy();
      if (previousMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE;
      else process.env.AIROAMING_PERSISTENCE_MODE = previousMode;
      if (previousDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabase;
    }
  }, 20_000);
});

function createService(workspaceRoot: string, store: FakeSecretStore | undefined, prisma?: PrismaService): SettingsService {
  const workspace = { resolveVirtualPath: (virtualPath: string) => path.join(workspaceRoot, virtualPath.replace(/^\/workspace\/?/, "")) };
  const credentialService = new CredentialService(store, prisma);
  return new SettingsService(workspace as never, undefined, store as never, prisma, credentialService as never);
}

function deployMigrations(databaseUrl: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(repoRoot, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      schemaPath,
    ], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
