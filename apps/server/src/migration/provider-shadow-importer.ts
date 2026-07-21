import { Prisma } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";

export class ProviderShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

interface ProviderPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  providerId: string;
  runtimeKind: string;
  displayName: string;
  modelId: string;
  baseUrl: string | null;
  enabled: boolean;
  fingerprint: string | null;
}

interface PreferencePlan {
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  theme: string;
  activeImageProviderId: string | null;
  defaultTextProviderId: string | null;
  updatedAt: Date;
}

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
const PROVIDER_KEYS = [
  { key: "aiKey", runtimeKind: "text", imageType: null },
  { key: "openaiImageProvider", runtimeKind: "image", imageType: "openai" },
  { key: "doubaoImageProvider", runtimeKind: "image", imageType: "doubao" },
  { key: "grokImageProvider", runtimeKind: "image", imageType: "grok" },
  { key: "runwareImageProvider", runtimeKind: "image", imageType: "runware" },
] as const;

function object(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderShadowImportError(code); return value as Record<string, unknown>; }
function stringField(value: Record<string, unknown>, key: string, fallback = ""): string { return typeof value[key] === "string" && value[key].trim() ? value[key].trim() : fallback; }
function nullableString(value: Record<string, unknown>, key: string): string | null { const result = stringField(value, key); return result || null; }
function dateField(value: Record<string, unknown>, key: string): Date { const raw = stringField(value, key, FALLBACK_DATE); const result = new Date(raw); return Number.isNaN(result.getTime()) ? new Date(FALLBACK_DATE) : result; }
function digest(bytes: Buffer): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }
function providerSourceKey(providerId: string): string { return `workspace-v1:settings:ProviderConfig:${providerId}`; }
function credentialSourceKey(providerId: string): string { return `workspace-v1:settings:CredentialMetadata:${providerId}`; }
function preferenceSourceKey(): string { return "workspace-v1:settings:AppPreference:primary"; }

async function readSnapshotFile(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; bytes: Buffer }> {
  const item = snapshot.snapshotManifest.items.find((candidate) => candidate.storageKey === storageKey);
  if (!item) throw new ProviderShadowImportError("MIGRATION_SETTINGS_NOT_IN_SNAPSHOT");
  const filePath = path.join(snapshot.root, ...storageKey.split("/"));
  try {
    const metadata = await lstat(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new ProviderShadowImportError("MIGRATION_SETTINGS_INVALID");
    const bytes = await readFile(filePath);
    if (digest(bytes) !== item.sha256) throw new ProviderShadowImportError("MIGRATION_SETTINGS_DIGEST_MISMATCH");
    return { item, bytes };
  } catch (error) {
    if (error instanceof ProviderShadowImportError) throw error;
    throw new ProviderShadowImportError("MIGRATION_SETTINGS_INVALID");
  }
}

/** G3-M3-A14：只导入脱敏 provider/settings 元数据，永不把旧 key 当作可用 Secret。 */
export class ProviderShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a14", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const settingsItem = snapshot.snapshotManifest.items.find((item) => item.storageKey === "settings.redacted.json");
      const settings = settingsItem ? object(JSON.parse((await readSnapshotFile(snapshot, settingsItem.storageKey)).bytes.toString("utf8")) as unknown, "MIGRATION_SETTINGS_INVALID") : {};
      const plans = Object.keys(settings).length > 0 ? this.buildPlans(settings, settingsItem!) : { providers: [], preference: null };
      if (plans.providers.length > 0 || plans.preference) await this.ledger.withTransaction(async (tx) => {
        for (const plan of plans.providers) await this.importProvider(tx, run.id, plan);
        if (plans.preference) await this.importPreference(tx, run.id, plans.preference, plans.providers);
      });
      const projects: ComicFormatReportProject[] = [];
      for (const item of snapshot.sourceManifest.items.filter((candidate) => /^projects\/[^/]+\/project\.json$/.test(candidate.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey))) {
        const legacyProjectId = item.storageKey.split("/")[1];
        const metadata = object(JSON.parse((await snapshot.readPayload(item.storageKey)).bytes.toString("utf8")) as unknown, "MIGRATION_SOURCE_PROJECT_INVALID");
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        projects.push({ projectId: legacyProjectId, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat, layoutPresetIntent: mapping.layoutPresetIntent, issueKey: null, resolutionStatus: "not_needed", importStatus: "imported" });
      }
      if (projects.length === 0) projects.push({ projectId: "settings", sourceStorageKey: "settings.redacted.json", sourceDigest: settingsItem?.sha256 ?? `sha256:${"0".repeat(64)}`, originalComicFormat: { kind: "missing", preview: "missing" }, mappingKind: "canonical", targetComicFormat: null, layoutPresetIntent: null, issueKey: null, resolutionStatus: "not_needed", importStatus: "imported" });
      const report = createComicFormatReport(projects, { entityCounts: { ProviderConfig: plans.providers.length, CredentialMetadata: plans.providers.length, AppPreference: plans.preference ? 1 : 0 } });
      const finished = await this.ledger.finishRun(run.id, { status: "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, providerConfigCount: plans.providers.length, credentialMetadataCount: plans.providers.length, appPreferenceCount: plans.preference ? 1 : 0 }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, providerMetadataShadowImported: true, secretsImported: false }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original */ }
      if (error instanceof ProviderShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new ProviderShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new ProviderShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); } catch (error) { if (error instanceof Error && "code" in error) throw new ProviderShadowImportError(String((error as Error & { code: unknown }).code)); throw new ProviderShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private buildPlans(settings: Record<string, unknown>, source: { sha256: `sha256:${string}` }): { providers: ProviderPlan[]; preference: PreferencePlan | null } {
    const providers: ProviderPlan[] = [];
    const byImageType = new Map<string, string>();
    let defaultTextProviderId: string | null = null;
    for (const descriptor of PROVIDER_KEYS) {
      const raw = settings[descriptor.key];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const value = raw as Record<string, unknown>;
      const providerId = stringField(value, "providerId");
      const modelId = stringField(value, "modelId");
      if (!providerId || !modelId) continue;
      const sourceKey = providerSourceKey(providerId);
      const fingerprint = nullableString(value, "keyFingerprint");
      const baseUrl = nullableString(value, "baseUrl");
      const plan = { targetId: stableId("ProviderConfig", sourceKey), sourceKey, sourceStorageKey: "settings.redacted.json", sourceDigest: source.sha256, payloadDigest: digestCanonicalJson({ providerId, runtimeKind: descriptor.runtimeKind, displayName: stringField(value, "providerName", providerId), modelId, baseUrl, enabled: false }), providerId, runtimeKind: descriptor.runtimeKind, displayName: stringField(value, "providerName", providerId), modelId, baseUrl, enabled: false, fingerprint } satisfies ProviderPlan;
      providers.push(plan);
      if (descriptor.imageType) byImageType.set(descriptor.imageType, plan.targetId);
      else defaultTextProviderId = plan.targetId;
    }
    const activeImageType = stringField(settings, "activeImageProvider");
    const preferenceSource = preferenceSourceKey();
    const preference = providers.length > 0 || typeof settings.appearance === "object"
      ? { sourceKey: preferenceSource, sourceStorageKey: "settings.redacted.json", sourceDigest: source.sha256, payloadDigest: digestCanonicalJson({ theme: stringField(object(settings.appearance ?? {}, "MIGRATION_SETTINGS_INVALID"), "theme", "system"), activeImageProviderId: byImageType.get(activeImageType) ?? null, defaultTextProviderId, updatedAt: dateField(settings, "updatedAt").toISOString() }), theme: stringField(object(settings.appearance ?? {}, "MIGRATION_SETTINGS_INVALID"), "theme", "system"), activeImageProviderId: byImageType.get(activeImageType) ?? null, defaultTextProviderId, updatedAt: dateField(settings, "updatedAt") }
      : null;
    return { providers, preference };
  }

  private async importProvider(tx: Prisma.TransactionClient, runId: string, plan: ProviderPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.providerConfig.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.providerId !== plan.providerId || existing.modelId !== plan.modelId || existing.baseUrl !== plan.baseUrl)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.providerConfig.create({ data: { id: plan.targetId, providerId: plan.providerId, runtimeKind: plan.runtimeKind, displayName: plan.displayName, modelId: plan.modelId, baseUrl: plan.baseUrl, enabled: plan.enabled, rowVersion: 0, createdAt: new Date(FALLBACK_DATE), updatedAt: new Date(FALLBACK_DATE) } });
    const credentialId = stableId("CredentialMetadata", credentialSourceKey(plan.providerId));
    const credentialSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: credentialSourceKey(plan.providerId) } });
    if (credentialSource && (credentialSource.entityId !== credentialId || credentialSource.sourceDigest !== plan.sourceDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existingCredential = await tx.credentialMetadata.findUnique({ where: { providerConfigId: plan.targetId } });
    if (!existingCredential) await tx.credentialMetadata.create({ data: { id: credentialId, providerConfigId: plan.targetId, owner: plan.runtimeKind === "text" ? "opencode" : "image_secret_store", status: "unconfigured", secretRef: null, fingerprint: null, configured: false, rotatedAt: null, createdAt: new Date(FALLBACK_DATE), updatedAt: new Date(FALLBACK_DATE) } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ProviderConfig", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: credentialSourceKey(plan.providerId), entityType: "CredentialMetadata", entityId: credentialId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: digestCanonicalJson({ providerConfigId: plan.targetId, fingerprint: null, configured: false }), provenanceStatus: "reference_only" });
  }

  private async importPreference(tx: Prisma.TransactionClient, runId: string, plan: PreferencePlan, providers: ProviderPlan[]): Promise<void> {
    const targetId = "primary";
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.appPreference.findUnique({ where: { id: targetId } });
    if (existing && (existing.theme !== plan.theme || existing.activeImageProviderId !== plan.activeImageProviderId || existing.defaultTextProviderId !== plan.defaultTextProviderId)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.appPreference.create({ data: { id: targetId, theme: plan.theme, activeImageProviderId: providers.some((provider) => provider.targetId === plan.activeImageProviderId) ? plan.activeImageProviderId : null, defaultTextProviderId: providers.some((provider) => provider.targetId === plan.defaultTextProviderId) ? plan.defaultTextProviderId : null, rowVersion: 0, updatedAt: plan.updatedAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "AppPreference", entityId: targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
  }
}
