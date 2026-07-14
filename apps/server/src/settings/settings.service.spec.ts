import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open as openFile, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaService } from "../persistence/prisma.service.js";
import { SettingsService, type AtomicSettingsFileOps, writeSettingsFileAtomically } from "./settings.service.js";
import { FakeSecretStore } from "./secret-store.js";

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

function createService(workspaceRoot: string, store: FakeSecretStore | undefined, prisma?: PrismaService): SettingsService {
  const workspace = { resolveVirtualPath: (virtualPath: string) => path.join(workspaceRoot, virtualPath.replace(/^\/workspace\/?/, "")) };
  return new SettingsService(workspace as never, undefined, store as never, prisma);
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
