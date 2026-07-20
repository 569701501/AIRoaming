import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";
import {
  fingerprintSecret,
  SecretStoreError,
  SecretString,
  type SecretMetadata,
  type SecretStore,
} from "./secret-store.js";
import { writeSettingsFileAtomically, type AtomicSettingsFileOps } from "./settings.service.js";

const IMAGE_PROVIDERS = [
  ["openai", "openaiImageProvider"],
  ["doubao", "doubaoImageProvider"],
  ["grok", "grokImageProvider"],
  ["runware", "runwareImageProvider"],
] as const;

export type CutoverSettingsStartState = "already_sanitized" | "legacy_plaintext_requires_two_phase";

export interface CutoverSettingsCredential {
  type: (typeof IMAGE_PROVIDERS)[number][0];
  credentialId: string;
  expectedFingerprint: `sha256:${string}`;
  secretRef: string | null;
  legacy: boolean;
  createdByCutoverRun: boolean;
  metadata?: SecretMetadata;
  /** Kept in memory only; SecretString serializes as [REDACTED]. */
  legacySecret?: SecretString;
}

export interface CutoverSettingsInspection {
  filePath: string;
  originalBytesDigest: `sha256:${string}`;
  startState: CutoverSettingsStartState;
  credentials: CutoverSettingsCredential[];
  hasLegacyTextCredential: boolean;
  textAuthVerified: boolean;
}

export interface CutoverSettingsPrestageResult {
  inspection: CutoverSettingsInspection;
  expectations: Array<{ credentialId: string; expectedFingerprint: `sha256:${string}`; owner: "image_secret_store" }>;
  createdCredentialIds: string[];
}

export interface CutoverSettingsCommitResult {
  filePath: string;
  redactedBytesDigest: `sha256:${string}`;
  removedLegacyCredentialIds: string[];
}

export class CutoverSettingsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function absolute(filePath: string): string {
  if (!path.isAbsolute(filePath) || filePath.includes("\0")) throw new CutoverSettingsError("CUTOVER_SETTINGS_PATH_INVALID");
  return path.resolve(filePath);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function existingSecretError(error: unknown): boolean {
  return error instanceof SecretStoreError && error.code === "SECRET_STORE_ENTRY_MISSING";
}

export class CutoverSettingsService {
  constructor(
    private readonly store: SecretStore,
    private readonly operations?: AtomicSettingsFileOps,
  ) {}

  async inspect(filePathInput: string): Promise<CutoverSettingsInspection> {
    const filePath = absolute(filePathInput);
    const stat = await lstat(filePath).catch(() => null);
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) throw new CutoverSettingsError("CUTOVER_SETTINGS_FILE_INVALID");
    const originalBytes = await readFile(filePath, "utf8");
    let parsed: Record<string, unknown>;
    try { parsed = objectRecord(JSON.parse(originalBytes)); } catch { throw new CutoverSettingsError("CUTOVER_SETTINGS_JSON_INVALID"); }
    const credentials: CutoverSettingsCredential[] = [];
    for (const [type, field] of IMAGE_PROVIDERS) {
      const provider = objectRecord(parsed[field]);
      const providerId = text(provider.providerId);
      if (!providerId) continue;
      const credentialId = `image_${type}_${providerId}`;
      const legacyValue = text(provider.apiKey);
      const storedFingerprint = text(provider.keyFingerprint);
      const secretRef = text(provider.secretRef);
      if (legacyValue) {
        const secret = SecretString.from(legacyValue);
        credentials.push({ type, credentialId, expectedFingerprint: fingerprintSecret(secret), secretRef, legacy: true, createdByCutoverRun: false, legacySecret: secret });
      } else if (secretRef) {
        if (!storedFingerprint || !/^sha256:[0-9a-f]{64}$/.test(storedFingerprint)) throw new CutoverSettingsError("CUTOVER_SETTINGS_FINGERPRINT_INVALID");
        credentials.push({ type, credentialId, expectedFingerprint: storedFingerprint as `sha256:${string}`, secretRef, legacy: false, createdByCutoverRun: false });
      }
    }
    return {
      filePath,
      originalBytesDigest: digest(originalBytes),
      startState: credentials.some((entry) => entry.legacy) ? "legacy_plaintext_requires_two_phase" : "already_sanitized",
      credentials,
      hasLegacyTextCredential: Boolean(text(objectRecord(parsed.aiKey).apiKey)),
      textAuthVerified: false,
    };
  }

  async prestage(input: CutoverSettingsInspection, options: { textAuthVerified?: boolean } = {}): Promise<CutoverSettingsPrestageResult> {
    const inspection = { ...input, textAuthVerified: options.textAuthVerified === true };
    if (inspection.hasLegacyTextCredential && !inspection.textAuthVerified) throw new CutoverSettingsError("CUTOVER_TEXT_AUTH_NOT_VERIFIED");
    const createdCredentialIds: string[] = [];
    const expectations: CutoverSettingsPrestageResult["expectations"] = [];
    try {
      for (const credential of inspection.credentials) {
        if (!credential.legacy) {
          expectations.push({ credentialId: credential.credentialId, expectedFingerprint: credential.expectedFingerprint, owner: "image_secret_store" });
          continue;
        }
        if (!credential.legacySecret) throw new CutoverSettingsError("CUTOVER_SETTINGS_LEGACY_SECRET_MISSING");
        let existing: SecretString | undefined;
        try { existing = await this.store.get(credential.credentialId); } catch (error) {
          if (!existingSecretError(error)) throw new CutoverSettingsError("CUTOVER_SETTINGS_CREDENTIAL_READ_FAILED");
        }
        if (existing) {
          if (fingerprintSecret(existing) !== credential.expectedFingerprint) throw new CutoverSettingsError("CUTOVER_SETTINGS_CREDENTIAL_CONFLICT");
        } else {
          credential.metadata = await this.store.put({ credentialId: credential.credentialId, secret: credential.legacySecret });
          credential.createdByCutoverRun = true;
          createdCredentialIds.push(credential.credentialId);
        }
        expectations.push({ credentialId: credential.credentialId, expectedFingerprint: credential.expectedFingerprint, owner: "image_secret_store" });
      }
    } catch (error) {
      await this.rollbackPrestage({ inspection, expectations, createdCredentialIds }).catch(() => undefined);
      throw error;
    }
    return { inspection, expectations, createdCredentialIds };
  }

  async commit(input: CutoverSettingsPrestageResult, options: { textAuthVerified: boolean }): Promise<CutoverSettingsCommitResult> {
    if (input.inspection.hasLegacyTextCredential && !options.textAuthVerified) throw new CutoverSettingsError("CUTOVER_TEXT_AUTH_NOT_VERIFIED");
    const currentBytes = await readFile(input.inspection.filePath, "utf8").catch(() => { throw new CutoverSettingsError("CUTOVER_SETTINGS_FILE_INVALID"); });
    if (digest(currentBytes) !== input.inspection.originalBytesDigest) throw new CutoverSettingsError("CUTOVER_SETTINGS_BYTES_CHANGED");
    let parsed: Record<string, unknown>;
    try { parsed = objectRecord(JSON.parse(currentBytes)); } catch { throw new CutoverSettingsError("CUTOVER_SETTINGS_JSON_INVALID"); }
    for (const [type, field] of IMAGE_PROVIDERS) {
      const provider = objectRecord(parsed[field]);
      const credential = input.inspection.credentials.find((entry) => entry.type === type);
      if (!credential) continue;
      delete provider.apiKey;
      provider.secretRef = credential.secretRef ?? credential.metadata?.secretRef ?? `airoaming:image:v1:existing:${digest(credential.credentialId).slice("sha256:".length)}`;
      provider.keyFingerprint = credential.expectedFingerprint;
      parsed[field] = provider;
    }
    const aiKey = objectRecord(parsed.aiKey);
    delete aiKey.apiKey;
    parsed.aiKey = aiKey;
    const redactedBytes = `${JSON.stringify(parsed, null, 2)}\n`;
    await writeSettingsFileAtomically(input.inspection.filePath, redactedBytes, this.operations);
    return { filePath: input.inspection.filePath, redactedBytesDigest: digest(redactedBytes), removedLegacyCredentialIds: input.inspection.credentials.filter((entry) => entry.legacy).map((entry) => entry.credentialId) };
  }

  async rollbackPrestage(input: CutoverSettingsPrestageResult): Promise<void> {
    for (const credential of input.inspection.credentials) {
      if (!credential.createdByCutoverRun) continue;
      try {
        const current = await this.store.get(credential.credentialId);
        if (fingerprintSecret(current) === credential.expectedFingerprint) await this.store.delete(credential.credentialId);
      } catch (error) {
        if (!existingSecretError(error)) throw new CutoverSettingsError("CUTOVER_SETTINGS_ROLLBACK_FAILED");
      }
    }
  }
}
