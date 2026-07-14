import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { inspect } from "node:util";

const REDACTED = "[REDACTED]" as const;
const SECRET_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface SecretMetadata {
  credentialId: string;
  secretRef: string;
  fingerprint: `sha256:${string}`;
  configured: true;
  updatedAt: string;
}

export interface CredentialStoreHealth {
  available: boolean;
  adapter: "fake" | "keychain" | "unavailable";
  reason: string | null;
}

export interface SecretStore {
  put(input: { credentialId: string; secret: SecretString }): Promise<SecretMetadata>;
  get(credentialId: string): Promise<SecretString>;
  delete(credentialId: string): Promise<void>;
  probe(): Promise<CredentialStoreHealth>;
}

/**
 * A secret wrapper which is deliberately hostile to accidental serialization.
 * Provider adapters must call reveal() only at the final HTTP boundary.
 */
export class SecretString {
  private constructor(private readonly value: string) {}

  static from(value: string): SecretString {
    if (!value.trim()) {
      throw new Error("SECRET_VALUE_EMPTY");
    }
    return new SecretString(value);
  }

  reveal(): string {
    return this.value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

export function fingerprintSecret(secret: SecretString): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(secret.reveal(), "utf8").digest("hex")}`;
}

export class SecretStoreError extends Error {
  constructor(readonly code:
    | "SECRET_STORE_UNAVAILABLE"
    | "SECRET_STORE_ROOT_UNSAFE"
    | "SECRET_STORE_ENTRY_MISSING"
    | "SECRET_STORE_OPERATION_FAILED"
    | "SECRET_STORE_PROBE_FAILED") {
    super(code);
  }
}

export interface SecretCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SecretCommandExecutor {
  run(file: string, args: readonly string[], options?: { secretInput?: SecretString }): Promise<SecretCommandResult>;
}

class ProcessSecretCommandExecutor implements SecretCommandExecutor {
  run(file: string, args: readonly string[], options: { secretInput?: SecretString } = {}): Promise<SecretCommandResult> {
    return new Promise((resolve) => {
      const child = spawn(file, [...args], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.once("error", () => resolve({ code: 1, stdout: "", stderr: "" }));
      child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
      if (options.secretInput) {
        // In a non-TTY child, macOS security(1) asks for the new generic
        // password twice (password + confirmation). Both lines are written
        // through stdin; the secret never enters argv/stdout/stderr.
        const secret = options.secretInput.reveal();
        child.stdin.end(`${secret}\n${secret}\n`, "utf8");
      } else {
        child.stdin.end();
      }
    });
  }
}

/**
 * macOS production adapter. Tests inject SecretCommandExecutor and therefore
 * never invoke the user's real Keychain or the `security` binary.
 */
export class MacOSKeychainSecretStore implements SecretStore {
  constructor(
    private readonly executor: SecretCommandExecutor = new ProcessSecretCommandExecutor(),
    private readonly service = "airoaming.image.credentials",
    private readonly platform = process.platform,
  ) {}

  async put(input: { credentialId: string; secret: SecretString }): Promise<SecretMetadata> {
    this.assertPlatform();
    this.assertCredentialId(input.credentialId);
    const result = await this.runSecurity([
      "add-generic-password",
      "-a",
      input.credentialId,
      "-s",
      this.service,
      "-U",
      // macOS security(1) documents that -w must be the final option to
      // prompt for the password on stdin. Keep the secret out of argv and
      // keep all non-secret flags before the prompt option.
      "-w",
    ], { secretInput: input.secret });
    if (result.code !== 0) throw new SecretStoreError("SECRET_STORE_OPERATION_FAILED");
    return {
      credentialId: input.credentialId,
      secretRef: `airoaming:image:v1:${randomUUID()}`,
      fingerprint: fingerprintSecret(input.secret),
      configured: true,
      updatedAt: new Date().toISOString(),
    };
  }

  async get(credentialId: string): Promise<SecretString> {
    this.assertPlatform();
    this.assertCredentialId(credentialId);
    const result = await this.runSecurity(["find-generic-password", "-a", credentialId, "-s", this.service, "-w"]);
    if (result.code !== 0) {
      if (/could not be found|item not found|no password/i.test(result.stderr)) {
        throw new SecretStoreError("SECRET_STORE_ENTRY_MISSING");
      }
      throw new SecretStoreError("SECRET_STORE_OPERATION_FAILED");
    }
    try {
      return SecretString.from(result.stdout.trimEnd());
    } catch {
      throw new SecretStoreError("SECRET_STORE_ENTRY_MISSING");
    }
  }

  async delete(credentialId: string): Promise<void> {
    this.assertPlatform();
    this.assertCredentialId(credentialId);
    const result = await this.runSecurity(["delete-generic-password", "-a", credentialId, "-s", this.service]);
    if (result.code !== 0 && !/could not be found|item not found|no password/i.test(result.stderr)) {
      throw new SecretStoreError("SECRET_STORE_OPERATION_FAILED");
    }
  }

  async probe(): Promise<CredentialStoreHealth> {
    if (this.platform !== "darwin") {
      return { available: false, adapter: "unavailable", reason: "SECRET_STORE_UNAVAILABLE" };
    }
    try {
      const result = await this.runSecurity(["default-keychain"]);
      return result.code === 0
        ? { available: true, adapter: "keychain", reason: null }
        : { available: false, adapter: "keychain", reason: "SECRET_STORE_PROBE_FAILED" };
    } catch {
      return { available: false, adapter: "keychain", reason: "SECRET_STORE_PROBE_FAILED" };
    }
  }

  private assertPlatform(): void {
    if (this.platform !== "darwin") throw new SecretStoreError("SECRET_STORE_UNAVAILABLE");
  }

  private assertCredentialId(credentialId: string): void {
    if (!SECRET_ID_PATTERN.test(credentialId)) throw new SecretStoreError("SECRET_STORE_ROOT_UNSAFE");
  }

  private async runSecurity(args: readonly string[], options?: { secretInput?: SecretString }): Promise<SecretCommandResult> {
    try {
      return await this.executor.run("security", args, options);
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError("SECRET_STORE_OPERATION_FAILED");
    }
  }
}

export class UnavailableSecretStore implements SecretStore {
  async put(): Promise<SecretMetadata> {
    throw new SecretStoreError("SECRET_STORE_UNAVAILABLE");
  }

  async get(): Promise<SecretString> {
    throw new SecretStoreError("SECRET_STORE_UNAVAILABLE");
  }

  async delete(): Promise<void> {
    throw new SecretStoreError("SECRET_STORE_UNAVAILABLE");
  }

  async probe(): Promise<CredentialStoreHealth> {
    return { available: false, adapter: "unavailable", reason: "SECRET_STORE_UNAVAILABLE" };
  }
}

/**
 * Test-only store. It deliberately uses a private 0600 file so tests can prove
 * restart/recovery semantics, but production never selects it implicitly.
 */
export class FakeSecretStore implements SecretStore {
  constructor(private readonly root: string) {}

  async put(input: { credentialId: string; secret: SecretString }): Promise<SecretMetadata> {
    const filePath = await this.resolveSecretPath(input.credentialId, true);
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, input.secret.reveal(), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    try {
      await rename(temporary, filePath);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return {
      credentialId: input.credentialId,
      secretRef: this.secretRef(input.credentialId),
      fingerprint: fingerprintSecret(input.secret),
      configured: true,
      updatedAt: new Date().toISOString(),
    };
  }

  async get(credentialId: string): Promise<SecretString> {
    const filePath = await this.resolveSecretPath(credentialId, false);
    try {
      const stat = await lstat(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new SecretStoreError("SECRET_STORE_ROOT_UNSAFE");
      }
      return SecretString.from(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      if (this.isNotFound(error)) throw new SecretStoreError("SECRET_STORE_ENTRY_MISSING");
      throw error;
    }
  }

  async delete(credentialId: string): Promise<void> {
    const filePath = await this.resolveSecretPath(credentialId, false);
    await rm(filePath, { force: true });
  }

  async probe(): Promise<CredentialStoreHealth> {
    try {
      await this.ensureRoot();
      return { available: true, adapter: "fake", reason: null };
    } catch (error) {
      return {
        available: false,
        adapter: "fake",
        reason: error instanceof SecretStoreError ? error.code : "SECRET_STORE_ROOT_UNSAFE",
      };
    }
  }

  private async resolveSecretPath(credentialId: string, createRoot: boolean): Promise<string> {
    if (!SECRET_ID_PATTERN.test(credentialId)) {
      throw new SecretStoreError("SECRET_STORE_ROOT_UNSAFE");
    }
    if (createRoot) {
      await this.ensureRoot();
    } else {
      await this.ensureRoot();
    }
    const fileName = `${encodeURIComponent(credentialId)}.secret`;
    const filePath = path.resolve(this.root, fileName);
    const rootWithSeparator = `${path.resolve(this.root)}${path.sep}`;
    if (!filePath.startsWith(rootWithSeparator)) {
      throw new SecretStoreError("SECRET_STORE_ROOT_UNSAFE");
    }
    return filePath;
  }

  private async ensureRoot(): Promise<void> {
    const root = path.resolve(this.root);
    if (!this.root.trim() || root === path.parse(root).root) {
      throw new SecretStoreError("SECRET_STORE_ROOT_UNSAFE");
    }
    try {
      const stat = await lstat(root);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new SecretStoreError("SECRET_STORE_ROOT_UNSAFE");
      }
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      if (!this.isNotFound(error)) throw error;
      await mkdir(root, { recursive: true, mode: 0o700 });
    }
    await chmod(root, 0o700);
  }

  private secretRef(credentialId: string): string {
    // Keep fake metadata wire-compatible with the production DB contract. The
    // file-backed adapter resolves by credentialId; this opaque ref is only
    // persisted metadata and must never contain the secret itself.
    void credentialId;
    return `airoaming:image:v1:${randomUUID()}`;
  }

  private isNotFound(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
  }
}

@Injectable()
export class SecretStoreService implements SecretStore {
  private readonly delegate: SecretStore;

  constructor() {
    if (process.env.AIROAMING_SECRET_STORE_ADAPTER?.trim() === "fake") {
      this.delegate = new FakeSecretStore(process.env.AIROAMING_FAKE_SECRET_STORE_ROOT?.trim() ?? "");
    } else if (process.platform === "darwin") {
      this.delegate = new MacOSKeychainSecretStore();
    } else {
      this.delegate = new UnavailableSecretStore();
    }
  }

  put(input: { credentialId: string; secret: SecretString }): Promise<SecretMetadata> {
    return this.delegate.put(input);
  }

  get(credentialId: string): Promise<SecretString> {
    return this.delegate.get(credentialId);
  }

  delete(credentialId: string): Promise<void> {
    return this.delegate.delete(credentialId);
  }

  probe(): Promise<CredentialStoreHealth> {
    return this.delegate.probe();
  }
}
