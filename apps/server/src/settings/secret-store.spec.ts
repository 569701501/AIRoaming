import { afterEach, describe, expect, it } from "vitest";
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  FakeSecretStore,
  SecretString,
  UnavailableSecretStore,
  fingerprintSecret,
} from "./secret-store.js";

describe("D2-A1 SecretStore", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("SEC-01 keeps SecretString redacted through string, JSON and inspect", () => {
    const secret = SecretString.from("airoaming-sec-01-sentinel");
    expect(String(secret)).toBe("[REDACTED]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
    expect(fingerprintSecret(secret)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(secret.reveal()).toBe("airoaming-sec-01-sentinel");
  });

  it("SEC-02/03 stores, replaces and deletes a secret without exposing metadata plaintext", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-secret-store-"));
    roots.push(root);
    const store = new FakeSecretStore(root);
    const first = SecretString.from("airoaming-sec-02-first");
    const second = SecretString.from("airoaming-sec-02-second");
    const metadata = await store.put({ credentialId: "provider_openai", secret: first });
    expect(metadata).toMatchObject({ credentialId: "provider_openai", configured: true });
    expect(metadata.secretRef).not.toContain(first.reveal());
    expect(metadata.fingerprint).toBe(fingerprintSecret(first));
    expect((await store.get("provider_openai")).reveal()).toBe(first.reveal());
    await store.put({ credentialId: "provider_openai", secret: second });
    expect((await store.get("provider_openai")).reveal()).toBe(second.reveal());
    await store.delete("provider_openai");
    await expect(store.get("provider_openai")).rejects.toMatchObject({ code: "SECRET_STORE_ENTRY_MISSING" });
    await expect(store.delete("provider_openai")).resolves.toBeUndefined();
    expect(await readFile(path.join(root, "provider_openai.secret"), "utf8").catch(() => null)).toBeNull();
  });

  it("SEC-04/11 fails closed for an unsafe or unavailable store", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-secret-store-"));
    roots.push(root);
    const link = `${root}-link`;
    await symlink(root, link);
    roots.push(link);
    const unsafe = new FakeSecretStore(link);
    await expect(unsafe.put({ credentialId: "provider", secret: SecretString.from("secret") }))
      .rejects.toMatchObject({ code: "SECRET_STORE_ROOT_UNSAFE" });
    await expect(new FakeSecretStore("/tmp/../").probe()).resolves.toMatchObject({ available: false });
    const unavailable = new UnavailableSecretStore();
    await expect(unavailable.get()).rejects.toMatchObject({ code: "SECRET_STORE_UNAVAILABLE" });
    await expect(unavailable.probe()).resolves.toMatchObject({ available: false, adapter: "unavailable" });
  });

  it("SEC-04 rejects a symlinked secret file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-secret-store-"));
    roots.push(root);
    const outside = path.join(root, "outside.secret");
    const target = path.join(root, "provider.secret");
    await writeFile(outside, "airoaming-outside-sentinel", { mode: 0o600 });
    await symlink(outside, target);
    const store = new FakeSecretStore(root);
    await expect(store.get("provider")).rejects.toMatchObject({ code: "SECRET_STORE_ROOT_UNSAFE" });
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
  });
});
