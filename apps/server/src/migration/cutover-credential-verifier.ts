import { createHash } from "node:crypto";
import { digestCanonicalJson } from "@airoaming/shared";
import {
  fingerprintSecret,
  SecretStoreError,
  SecretString,
  type CredentialStoreHealth,
  type SecretStore,
} from "../settings/secret-store.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/;

export interface CredentialExpectation {
  credentialId: string;
  expectedFingerprint: `sha256:${string}`;
  owner: "image_secret_store";
}

export interface CredentialEvidenceEntry {
  credentialIdDigest: `sha256:${string}`;
  expectedFingerprint: `sha256:${string}`;
  actualFingerprint: `sha256:${string}`;
  matched: true;
}

export interface CredentialEvidenceV1 {
  schemaVersion: 1;
  kind: "airoaming_credential_evidence_v1";
  runId: string;
  adapter: "keychain" | "fake";
  probedAt: string;
  storeAvailable: true;
  textAuthVerified: boolean;
  entries: CredentialEvidenceEntry[];
  evidenceDigest: `sha256:${string}`;
}

export interface CredentialVerificationResult {
  evidence: CredentialEvidenceV1;
  health: CredentialStoreHealth;
}

export class CutoverCredentialError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function assertDigest(value: string, code: string): asserts value is `sha256:${string}` {
  if (!DIGEST.test(value)) throw new CutoverCredentialError(code);
}

function assertExpectation(entry: CredentialExpectation): void {
  if (!entry.credentialId.trim() || entry.owner !== "image_secret_store") {
    throw new CutoverCredentialError("CUTOVER_CREDENTIAL_EXPECTATION_INVALID");
  }
  assertDigest(entry.expectedFingerprint, "CUTOVER_CREDENTIAL_EXPECTATION_INVALID");
}

export class CutoverCredentialVerifier {
  constructor(
    private readonly store: SecretStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async probe(): Promise<{ adapter: "keychain" | "fake"; available: boolean }> {
    const health = await this.store.probe();
    // cutover 只承认 keychain(生产)与 fake(隔离测试)两种 adapter;
    // 其余(file/unavailable)一律视为不可用,不降低切换安全边界。
    if (health.adapter !== "keychain" && health.adapter !== "fake") return { adapter: "keychain", available: false };
    return { adapter: health.adapter, available: health.available };
  }

  async verify(input: {
    runId: string;
    entries: readonly CredentialExpectation[];
    textAuthVerified?: boolean;
    requiredAdapter?: "keychain" | "fake";
  }): Promise<CredentialVerificationResult> {
    if (!input.runId.trim()) throw new CutoverCredentialError("CUTOVER_CREDENTIAL_RUN_ID_INVALID");
    if (input.entries.length === 0) throw new CutoverCredentialError("CUTOVER_CREDENTIAL_EXPECTATION_EMPTY");
    input.entries.forEach(assertExpectation);
    const health = await this.store.probe();
    if (!health.available || (health.adapter !== "keychain" && health.adapter !== "fake")) {
      throw new CutoverCredentialError("CUTOVER_CREDENTIAL_STORE_UNAVAILABLE");
    }
    if (input.requiredAdapter && health.adapter !== input.requiredAdapter) {
      throw new CutoverCredentialError("CUTOVER_CREDENTIAL_ADAPTER_MISMATCH");
    }
    const entries: CredentialEvidenceEntry[] = [];
    for (const expectation of input.entries) {
      let secret: SecretString;
      try {
        secret = await this.store.get(expectation.credentialId);
      } catch (error) {
        if (error instanceof SecretStoreError) throw new CutoverCredentialError(error.code);
        throw new CutoverCredentialError("CUTOVER_CREDENTIAL_READ_FAILED");
      }
      const actualFingerprint = fingerprintSecret(secret);
      if (actualFingerprint !== expectation.expectedFingerprint) {
        throw new CutoverCredentialError("CUTOVER_CREDENTIAL_FINGERPRINT_MISMATCH");
      }
      entries.push({
        credentialIdDigest: digest(expectation.credentialId),
        expectedFingerprint: expectation.expectedFingerprint,
        actualFingerprint,
        matched: true,
      });
    }
    const unsigned = {
      schemaVersion: 1 as const,
      kind: "airoaming_credential_evidence_v1" as const,
      runId: input.runId,
      adapter: health.adapter as "keychain" | "fake",
      probedAt: this.now(),
      storeAvailable: true as const,
      textAuthVerified: input.textAuthVerified === true,
      entries,
    };
    const evidence: CredentialEvidenceV1 = {
      ...unsigned,
      evidenceDigest: digestCanonicalJson(unsigned) as `sha256:${string}`,
    };
    return { evidence, health };
  }
}
