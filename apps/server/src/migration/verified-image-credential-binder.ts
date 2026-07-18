import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../persistence/prisma.service.js";
import type { CredentialExpectation } from "./cutover-credential-verifier.js";

const IMAGE_CREDENTIAL_PREFIXES = [
  "image_openai_",
  "image_doubao_",
  "image_grok_",
] as const;
const PROVIDER_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const SECRET_REF = /^airoaming:image:v1:[0-9a-f-]{36}$/;

export class VerifiedImageCredentialBindingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface VerifiedImageCredentialBindingResult {
  boundCount: number;
  alreadyBoundCount: number;
}

function providerIdFromCredentialId(credentialId: string): string {
  const prefix = IMAGE_CREDENTIAL_PREFIXES.find((candidate) => credentialId.startsWith(candidate));
  const providerId = prefix ? credentialId.slice(prefix.length) : "";
  if (!providerId || !PROVIDER_ID.test(providerId)) {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_EXPECTATION_INVALID");
  }
  return providerId;
}

function assertExpectation(expectation: CredentialExpectation): void {
  if (expectation.owner !== "image_secret_store" || !FINGERPRINT.test(expectation.expectedFingerprint)) {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_EXPECTATION_INVALID");
  }
}

async function bindOne(
  tx: Prisma.TransactionClient,
  expectation: CredentialExpectation,
): Promise<"bound" | "already_bound"> {
  assertExpectation(expectation);
  const providerId = providerIdFromCredentialId(expectation.credentialId);
  const provider = await tx.providerConfig.findUnique({ where: { providerId } });
  if (!provider || provider.runtimeKind !== "image") {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_TARGET_MISSING");
  }
  const credential = await tx.credentialMetadata.findUnique({
    where: { providerConfigId: provider.id },
  });
  if (!credential || credential.owner !== "image_secret_store") {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_TARGET_INVALID");
  }

  const isUnconfigured = credential.status === "unconfigured"
    && credential.configured === false
    && credential.secretRef === null
    && credential.fingerprint === null;
  const isAlreadyBound = credential.status === "configured"
    && credential.configured === true
    && credential.secretRef !== null
    && SECRET_REF.test(credential.secretRef)
    && credential.fingerprint === expectation.expectedFingerprint;
  if (!isUnconfigured && !isAlreadyBound) {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_CONFLICT");
  }

  if (isUnconfigured) {
    await tx.credentialMetadata.update({
      where: { id: credential.id },
      data: {
        status: "configured",
        configured: true,
        secretRef: `airoaming:image:v1:${randomUUID()}`,
        fingerprint: expectation.expectedFingerprint,
      },
    });
  }
  if (!provider.enabled) {
    await tx.providerConfig.update({
      where: { id: provider.id },
      data: { enabled: true, rowVersion: { increment: 1 } },
    });
  }
  return isUnconfigured ? "bound" : "already_bound";
}

/**
 * 把已经由 SecretStore 独立验证过的图片凭据绑定到最终 DB 元数据。
 * 此边界只写 opaque secretRef 和指纹，绝不读取或持久化明文 secret。
 */
export async function bindVerifiedImageCredentials(
  prisma: PrismaService,
  expectations: readonly CredentialExpectation[],
): Promise<VerifiedImageCredentialBindingResult> {
  if (expectations.length === 0) {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_EXPECTATION_EMPTY");
  }
  const providerIds = expectations.map((expectation) => {
    assertExpectation(expectation);
    return providerIdFromCredentialId(expectation.credentialId);
  });
  if (new Set(providerIds).size !== providerIds.length) {
    throw new VerifiedImageCredentialBindingError("MIGRATION_CREDENTIAL_BINDING_EXPECTATION_DUPLICATE");
  }

  return prisma.database().$transaction(async (tx) => {
    let boundCount = 0;
    let alreadyBoundCount = 0;
    for (const expectation of expectations) {
      const result = await bindOne(tx, expectation);
      if (result === "bound") boundCount += 1;
      else alreadyBoundCount += 1;
    }
    return { boundCount, alreadyBoundCount };
  });
}
