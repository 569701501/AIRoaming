import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CutoverCredentialVerifier } from "./cutover-credential-verifier.js";
import { FakeSecretStore, fingerprintSecret, SecretString } from "../settings/secret-store.js";

describe("RCUT-SEC credential verifier", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("RCUT-SEC-01 produces non-secret evidence through an injected fake store", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-credential-"));
    const store = new FakeSecretStore(path.join(root, "fake-store"));
    const secret = SecretString.from("rcut-verifier-secret");
    await store.put({ credentialId: "image_openai_openai_image", secret });
    const verifier = new CutoverCredentialVerifier(store, () => "2026-07-13T00:00:00.000Z");
    const result = await verifier.verify({
      runId: "rcut-sec-01",
      requiredAdapter: "fake",
      entries: [{ credentialId: "image_openai_openai_image", expectedFingerprint: fingerprintSecret(secret), owner: "image_secret_store" }],
    });
    expect(result.health).toMatchObject({ adapter: "fake", available: true });
    expect(result.evidence).toMatchObject({ schemaVersion: 1, adapter: "fake", runId: "rcut-sec-01", storeAvailable: true });
    expect(JSON.stringify(result.evidence)).not.toContain(secret.reveal());
    expect(result.evidence.entries[0]?.credentialIdDigest).not.toContain("image_openai");
    expect(result.evidence.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("RCUT-SEC-02 fails closed for missing or mismatched credentials", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "airoaming-rcut-credential-"));
    const store = new FakeSecretStore(path.join(root, "fake-store"));
    const verifier = new CutoverCredentialVerifier(store);
    await expect(verifier.verify({
      runId: "rcut-sec-02-missing",
      requiredAdapter: "fake",
      entries: [{ credentialId: "image_missing", expectedFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", owner: "image_secret_store" }],
    })).rejects.toMatchObject({ code: "SECRET_STORE_ENTRY_MISSING" });
    const secret = SecretString.from("actual");
    await store.put({ credentialId: "image_openai", secret });
    await expect(verifier.verify({
      runId: "rcut-sec-02-mismatch",
      requiredAdapter: "fake",
      entries: [{ credentialId: "image_openai", expectedFingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", owner: "image_secret_store" }],
    })).rejects.toMatchObject({ code: "CUTOVER_CREDENTIAL_FINGERPRINT_MISMATCH" });
  });
});
