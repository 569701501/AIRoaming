import { describe, expect, it } from "vitest";
import {
  MacOSKeychainSecretStore,
  SecretCommandExecutor,
  SecretString,
} from "./secret-store.js";

class FakeSecurityExecutor implements SecretCommandExecutor {
  readonly calls: Array<{ file: string; args: readonly string[]; hasSecretInput: boolean }> = [];
  readonly entries = new Map<string, string>();
  failNext = false;

  async run(file: string, args: readonly string[], options: { secretInput?: SecretString } = {}) {
    this.calls.push({ file, args, hasSecretInput: Boolean(options.secretInput) });
    if (this.failNext) {
      this.failNext = false;
      return { code: 1, stdout: "", stderr: "authorization failed: secret-sentinel-must-not-leak" };
    }
    if (args[0] === "default-keychain") return { code: 0, stdout: "login.keychain-db\n", stderr: "" };
    const account = args[args.indexOf("-a") + 1];
    const service = args[args.indexOf("-s") + 1];
    const key = `${service}:${account}`;
    if (args[0] === "add-generic-password") {
      if (!options.secretInput || args.includes(options.secretInput.reveal())) {
        return { code: 1, stdout: "", stderr: "secret-input-boundary-invalid" };
      }
      this.entries.set(key, options.secretInput.reveal());
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "find-generic-password") {
      const secret = this.entries.get(key);
      return secret === undefined
        ? { code: 1, stdout: "", stderr: "could not be found" }
        : { code: 0, stdout: `${secret}\n`, stderr: "" };
    }
    if (args[0] === "delete-generic-password") {
      this.entries.delete(key);
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "unknown command" };
  }
}

describe("D2-A1-2 macOS Keychain SecretStore", () => {
  it("KEY-01/02 uses an injected executor and never invokes the real security binary", async () => {
    const executor = new FakeSecurityExecutor();
    const store = new MacOSKeychainSecretStore(executor, "test-service", "darwin");
    const secret = SecretString.from("airoaming-test-secret-keychain");
    const metadata = await store.put({ credentialId: "image_openai_openai_image", secret });
    expect(metadata.secretRef).toMatch(/^airoaming:image:v1:[0-9a-f-]{36}$/);
    expect(metadata.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((await store.get("image_openai_openai_image")).reveal()).toBe(secret.reveal());
    await store.delete("image_openai_openai_image");
    expect(await store.probe()).toMatchObject({ available: true, adapter: "keychain" });
    expect(executor.calls.every((call) => call.file === "security")).toBe(true);
    expect(executor.calls.some((call) => call.args[0] === "find-generic-password")).toBe(true);
    const put = executor.calls.find((call) => call.args[0] === "add-generic-password");
    expect(put?.hasSecretInput).toBe(true);
    expect(put?.args).not.toContain(secret.reveal());
  });

  it("KEY-03 maps missing entries, command failures and unsupported platforms without leaking stderr", async () => {
    const executor = new FakeSecurityExecutor();
    const store = new MacOSKeychainSecretStore(executor, "test-service", "darwin");
    await expect(store.get("image_missing")).rejects.toMatchObject({ code: "SECRET_STORE_ENTRY_MISSING" });
    executor.failNext = true;
    await expect(store.put({ credentialId: "image_openai", secret: SecretString.from("secret-value") }))
      .rejects.toMatchObject({ code: "SECRET_STORE_OPERATION_FAILED" });
    const unsupported = new MacOSKeychainSecretStore(executor, "test-service", "linux");
    await expect(unsupported.put({ credentialId: "image_openai", secret: SecretString.from("secret-value") }))
      .rejects.toMatchObject({ code: "SECRET_STORE_UNAVAILABLE" });
    expect(await unsupported.probe()).toMatchObject({ available: false, adapter: "unavailable" });

    const throwingProbe = new MacOSKeychainSecretStore({
      run: async () => { throw new Error("real-keychain-output-must-not-escape"); },
    }, "test-service", "darwin");
    await expect(throwingProbe.probe()).resolves.toMatchObject({
      available: false,
      adapter: "keychain",
      reason: "SECRET_STORE_PROBE_FAILED",
    });
  });

  it("RCUT-SEC-10 never places the secret in the security argv", async () => {
    const executor = new FakeSecurityExecutor();
    const store = new MacOSKeychainSecretStore(executor, "test-service", "darwin");
    const secret = SecretString.from("rcut-secret-sentinel");
    await store.put({ credentialId: "image_openai", secret });
    const put = executor.calls.find((call) => call.args[0] === "add-generic-password");
    expect(put).toBeDefined();
    expect(put?.args.join(" ")).not.toContain(secret.reveal());
    expect(put?.hasSecretInput).toBe(true);
    expect(put?.args.at(-1)).toBe("-w");
  });

  it("RCUT-SEC-11 keeps -w last so macOS security prompts for the secret", async () => {
    const executor = new FakeSecurityExecutor();
    const store = new MacOSKeychainSecretStore(executor, "test-service", "darwin");
    await store.put({ credentialId: "image_openai", secret: SecretString.from("stdin-only-secret") });
    const put = executor.calls.find((call) => call.args[0] === "add-generic-password");
    expect(put?.args.slice(-1)).toEqual(["-w"]);
    expect(put?.args).not.toContain("stdin-only-secret");
  });

});
