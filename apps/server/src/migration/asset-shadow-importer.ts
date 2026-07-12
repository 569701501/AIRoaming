import { Prisma } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";

export class AssetShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

interface AssetPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string | null;
  type: string;
  role: string;
  mimeType: string;
  storageKey: string;
  metadataJson: Prisma.InputJsonValue;
  metadataDigest: `sha256:${string}`;
  createdAt: Date;
  updatedAt: Date;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AssetShadowImportError(code);
  return value as Record<string, unknown>;
}

function field(value: Record<string, unknown>, key: string, fallback = ""): string {
  return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback;
}

function dateField(value: Record<string, unknown>, key: string, fallback = "2000-01-01T00:00:00.000Z"): Date {
  const parsed = new Date(field(value, key, fallback));
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function assetSourceKey(projectId: string, assetId: string): string { return `workspace-v1:${projectId}:Asset:${assetId}`; }

function typeField(value: Record<string, unknown>): string {
  const type = field(value, "type", "image");
  return ["image", "audio", "video", "document", "archive"].includes(type) ? type : "image";
}

function mimeType(type: string, legacyPath: string): string {
  const extension = path.extname(legacyPath).toLowerCase();
  const byExtension: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm",
    ".pdf": "application/pdf", ".json": "application/json", ".txt": "text/plain", ".md": "text/markdown", ".zip": "application/zip",
  };
  return byExtension[extension] ?? ({ audio: "audio/*", video: "video/*", document: "application/octet-stream", archive: "application/zip", image: "application/octet-stream" }[type] ?? "application/octet-stream");
}

async function payload(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try { return { item, value: object(JSON.parse(bytes.toString("utf8")), "MIGRATION_SOURCE_JSON_INVALID") }; }
  catch (error) { if (error instanceof AssetShadowImportError) throw error; throw new AssetShadowImportError("MIGRATION_SOURCE_JSON_INVALID"); }
}

/** G3-M3-A8：导入 shared/assets.json 的资产身份和元数据；物理文件证据留给后续视觉/ready 切片。 */
export class AssetShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a8", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const projects: ComicFormatReportProject[] = [];
      let assetCount = 0;
      let warningCount = 0;
      const projectItems = snapshot.sourceManifest.items.filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payload(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = PrismaMigrationLedgerRepository.stableEntityId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const assetItem = snapshot.sourceManifest.items.find((item) => item.storageKey === `projects/${legacyProjectId}/shared/assets.json`);
        const plans = targetProject && assetItem ? await this.buildPlans(snapshot, assetItem.storageKey, legacyProjectId, targetProjectId) : [];
        if (targetProject && assetItem) {
          await this.ledger.withTransaction(async (tx) => { for (const plan of plans) { await this.importPlan(tx, run.id, plan); assetCount += 1; } });
        } else if (targetProject && !assetItem) warningCount += 1;
        const blocked = !targetProject;
        const issueKey = blocked ? `project:${legacyProjectId}:asset-target` : null;
        projects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey, resolutionStatus: issueKey ? "open" : "not_needed", importStatus: blocked ? "blocked" : "imported" });
        if (blocked) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey: issueKey!, code: "MIGRATION_TARGET_NOT_FOUND", entityType: "Project", entityId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId), storageKey: projectItem.storageKey, detailJson: { schemaVersion: 1, projectId: legacyProjectId, reason: "Project/Chapter shadow must run first" } }));
      }
      const report = createComicFormatReport(projects, { warningCount, entityCounts: { Asset: assetCount } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, assetCount }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, assetMetadataShadowImported: true, readyAssetCount: 0 }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof AssetShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new AssetShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new AssetShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); }
    catch (error) { if (error instanceof Error && "code" in error) throw new AssetShadowImportError(String((error as Error & { code: unknown }).code)); throw new AssetShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(snapshot: VerifiedSnapshot, storageKey: string, legacyProjectId: string, targetProjectId: string): Promise<AssetPlan[]> {
    const { item, value } = await payload(snapshot, storageKey);
    const input = Array.isArray(value.assets) ? value.assets : [];
    const plans: AssetPlan[] = [];
    for (const [index, entry] of input.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const legacyId = field(raw, "id", `asset_${String(index + 1).padStart(3, "0")}`);
      const sourceKey = assetSourceKey(legacyProjectId, legacyId);
      const targetId = PrismaMigrationLedgerRepository.stableEntityId("Asset", sourceKey);
      const legacyPath = field(raw, "path", "");
      const type = typeField(raw);
      let metadataJson: Prisma.InputJsonValue;
      try {
        const parsed = JSON.parse(field(raw, "meta", "{}")) as Prisma.InputJsonValue;
        const legacyName = field(raw, "name", legacyId);
        const legacyPath = field(raw, "path", "");
        metadataJson = parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? { ...(parsed as Record<string, Prisma.InputJsonValue>), legacyName, legacyPath }
          : { value: parsed, legacyName, legacyPath };
      }
      catch { throw new AssetShadowImportError("MIGRATION_ASSET_METADATA_INVALID"); }
      const metadataDigest = digestCanonicalJson(metadataJson);
      const chapterLegacyId = typeof raw.chapterId === "string" && raw.chapterId.trim() ? raw.chapterId : null;
      const chapterId = chapterLegacyId ? PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, chapterLegacyId)) : null;
      if (chapterId && !(await this.prisma.database().chapter.findUnique({ where: { id: chapterId } }))) throw new AssetShadowImportError("MIGRATION_ASSET_CHAPTER_NOT_FOUND");
      const createdAt = dateField(raw, "createdAt");
      const updatedAt = dateField(raw, "updatedAt", createdAt.toISOString());
      const payload = { id: targetId, projectId: targetProjectId, chapterId, type, role: field(raw, "role", `legacy_${type}`), mimeType: mimeType(type, legacyPath), storageKey: `legacy-import/${targetProjectId}/${legacyId}`, status: "staged", metadataDigest, legacyPath, name: field(raw, "name", legacyId) };
      plans.push({ targetId, sourceKey, sourceStorageKey: storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson(payload), projectId: targetProjectId, chapterId, type, role: payload.role, mimeType: payload.mimeType, storageKey: payload.storageKey, metadataJson, metadataDigest, createdAt, updatedAt });
    }
    return plans;
  }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: AssetPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.asset.findUnique({ where: { id: plan.targetId } });
    const existingMetadata = existing?.metadataJson && typeof existing.metadataJson === "object" && !Array.isArray(existing.metadataJson)
      ? existing.metadataJson as Record<string, unknown>
      : null;
    const existingBaseMetadata = existingMetadata && "physicalEvidence" in existingMetadata
      ? Object.fromEntries(Object.entries(existingMetadata).filter(([key]) => key !== "physicalEvidence"))
      : existingMetadata;
    const metadataCompatible = existing?.metadataDigest === plan.metadataDigest
      || (existing?.status === "ready" && existingBaseMetadata !== null && digestCanonicalJson(existingBaseMetadata) === plan.metadataDigest);
    if (existing && (existing.projectId !== plan.projectId || existing.chapterId !== plan.chapterId || existing.storageKey !== plan.storageKey || !metadataCompatible)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.asset.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, type: plan.type, role: plan.role, mimeType: plan.mimeType, storageKey: plan.storageKey, status: "staged", sha256: null, bytes: null, width: null, height: null, durationMs: null, sourceTaskId: null, metadataJson: plan.metadataJson, metadataSchemaVersion: 1, metadataDigest: plan.metadataDigest, createdAt: plan.createdAt, updatedAt: plan.updatedAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "Asset", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "partial" });
  }
}
