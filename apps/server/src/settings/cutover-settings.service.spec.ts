import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CutoverSettingsError, CutoverSettingsService } from "./cutover-settings.service.js";
import { FakeSecretStore, SecretString } from "./secret-store.js";

describe("RCUT-SEC deferred settings migration", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

  it("RCUT-SEC-04 keeps legacy settings bytes unchanged through prestage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-settings-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const original = `${JSON.stringify({ version: 1, aiKey: { providerId: "self", apiKey: "text-secret" }, openaiImageProvider: { providerId: "openai_image", apiKey: "image-secret" } })}\n`;
    await writeFile(settingsPath, original, { encoding: "utf8", mode: 0o600 });
    const service = new CutoverSettingsService(new FakeSecretStore(path.join(root, "fake-store")));
    const inspection = await service.inspect(settingsPath);
    const prestaged = await service.prestage(inspection, { textAuthVerified: true });
    expect(inspection.startState).toBe("legacy_plaintext_requires_two_phase");
    expect(prestaged.createdCredentialIds).toEqual(["image_openai_openai_image"]);
    expect(await readFile(settingsPath, "utf8")).toBe(original);
    expect(JSON.stringify(prestaged)).not.toContain("image-secret");
  });

  it("RCUT-SEC-06 commits redaction atomically and removes every apiKey field", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-settings-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify({ aiKey: { providerId: "self", apiKey: "text-secret" }, openaiImageProvider: { providerId: "openai_image", apiKey: "image-secret" } })}\n`, { encoding: "utf8", mode: 0o600 });
    const service = new CutoverSettingsService(new FakeSecretStore(path.join(root, "fake-store")));
    const prestaged = await service.prestage(await service.inspect(settingsPath), { textAuthVerified: true });
    const committed = await service.commit(prestaged, { textAuthVerified: true });
    const redacted = await readFile(settingsPath, "utf8");
    expect(redacted).not.toContain("text-secret");
    expect(redacted).not.toContain("image-secret");
    expect(redacted).toContain("keyFingerprint");
    expect(committed.removedLegacyCredentialIds).toEqual(["image_openai_openai_image"]);
    expect((await readdir(path.dirname(settingsPath))).filter((name) => name.includes(".tmp-")).length).toBe(0);
  });

  it("RCUT-SEC-07 leaves old bytes unchanged when the atomic rename fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-settings-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const original = `${JSON.stringify({ openaiImageProvider: { providerId: "openai_image", apiKey: "image-secret" } })}\n`;
    await writeFile(settingsPath, original, { encoding: "utf8", mode: 0o600 });
    const service = new CutoverSettingsService(new FakeSecretStore(path.join(root, "fake-store")));
    const prestaged = await service.prestage(await service.inspect(settingsPath));
    const failing = new CutoverSettingsService(new FakeSecretStore(path.join(root, "fake-store-2")), {
      mkdir,
      open,
      rename: async () => { throw new Error("RENAME_FAILED"); },
      rm,
    });
    const second = await failing.inspect(settingsPath);
    const secondPrestage = await failing.prestage(second);
    await expect(failing.commit(secondPrestage, { textAuthVerified: true })).rejects.toThrow("RENAME_FAILED");
    expect(await readFile(settingsPath, "utf8")).toBe(original);
    void prestaged;
  });

  it("RCUT-SEC-05 refuses a conflicting pre-existing credential without changing settings", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-settings-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const original = `${JSON.stringify({ openaiImageProvider: { providerId: "openai_image", apiKey: "image-secret" } })}\n`;
    await writeFile(settingsPath, original, { encoding: "utf8", mode: 0o600 });
    const store = new FakeSecretStore(path.join(root, "fake-store"));
    await store.put({ credentialId: "image_openai_openai_image", secret: (await import("./secret-store.js")).SecretString.from("different") });
    const service = new CutoverSettingsService(store);
    await expect(service.prestage(await service.inspect(settingsPath))).rejects.toMatchObject({ code: "CUTOVER_SETTINGS_CREDENTIAL_CONFLICT" });
    expect(await readFile(settingsPath, "utf8")).toBe(original);
  });

  it("RCUT-SEC-05 rolls back credentials created earlier in a failed prestage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-settings-"));
    roots.push(root);
    const settingsPath = path.join(root, "settings", "app-settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify({ openaiImageProvider: { providerId: "openai_image", apiKey: "one" }, doubaoImageProvider: { providerId: "doubao_image", apiKey: "two" } })}\n`, { encoding: "utf8", mode: 0o600 });
    class FailingStore extends FakeSecretStore {
      private puts = 0;
      override async put(input: { credentialId: string; secret: SecretString }) {
        this.puts += 1;
        if (this.puts === 2) throw new Error("PUT_FAILED");
        return super.put(input);
      }
    }
    const store = new FailingStore(path.join(root, "fake-store"));
    const service = new CutoverSettingsService(store);
    await expect(service.prestage(await service.inspect(settingsPath))).rejects.toThrow("PUT_FAILED");
    await expect(store.get("image_openai_openai_image")).rejects.toMatchObject({ code: "SECRET_STORE_ENTRY_MISSING" });
    expect(await readFile(settingsPath, "utf8")).toContain("one");
  });
});
