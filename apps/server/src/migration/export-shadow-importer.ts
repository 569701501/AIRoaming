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

export class ExportShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

interface ExportPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string | null;
  scopeKey: string;
  revision: number;
  manifestJson: Prisma.InputJsonValue | null;
  manifestDigest: `sha256:${string}` | null;
  recordedAt: Date;
}

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
function object(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExportShadowImportError(code); return value as Record<string, unknown>; }
function field(value: Record<string, unknown>, key: string, fallback = ""): string { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback; }
function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date { const parsed = new Date(field(value, key, fallback)); return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed; }
function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function exportSourcePrefix(projectId: string, scopeKey: string, groupKey: string): string { return `workspace-v1:${projectId}:ExportRevision:${scopeKey}:${groupKey}:`; }
function exportSourceKey(projectId: string, scopeKey: string, groupKey: string, revision: number): string { return `${exportSourcePrefix(projectId, scopeKey, groupKey)}v${String(revision).padStart(3, "0")}`; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function payload(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try { return { item, value: object(JSON.parse(bytes.toString("utf8")) as unknown, "MIGRATION_EXPORT_MANIFEST_INVALID") }; } catch (error) { if (error instanceof ExportShadowImportError) throw error; throw new ExportShadowImportError("MIGRATION_EXPORT_MANIFEST_INVALID"); }
}

/** G3-M3-A13：旧导出只保留不可伪造的 legacy_unresolved 历史，不创建 ready Artifact/current。 */
export class ExportShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a13", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const projects: ComicFormatReportProject[] = [];
      let count = 0;
      let warningCount = 0;
      for (const projectItem of snapshot.sourceManifest.items.filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey))) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payload(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = stableId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const result = targetProject ? await this.buildPlans(snapshot, legacyProjectId, targetProjectId) : { plans: [], blockers: 1, warnings: 0, issueStorageKey: projectItem.storageKey };
        if (targetProject && result.plans.length > 0) await this.ledger.withTransaction(async (tx) => { for (const plan of result.plans) { await this.importPlan(tx, run.id, plan); count += 1; } });
        warningCount += result.warnings;
        const issueKey = !targetProject ? `project:${legacyProjectId}:export-target` : result.blockers > 0 ? `project:${legacyProjectId}:export-source` : null;
        projects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey, resolutionStatus: issueKey ? "open" : "not_needed", importStatus: issueKey ? "blocked" : "imported" });
        if (issueKey) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey, code: !targetProject ? "MIGRATION_TARGET_NOT_FOUND" : "EXPORT_SOURCE_UNRESOLVED", entityType: "ExportRevision", entityId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId), storageKey: result.issueStorageKey ?? projectItem.storageKey, detailJson: jsonValue({ schemaVersion: 1, reason: !targetProject ? "Project/Chapter shadow must run first" : "export scope or manifest could not be resolved" }) }));
      }
      const report = createComicFormatReport(projects, { warningCount, entityCounts: { ExportRevision: count } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, exportRevisionCount: count }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, exportShadowImported: true }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original */ }
      if (error instanceof ExportShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new ExportShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new ExportShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); } catch (error) { if (error instanceof Error && "code" in error) throw new ExportShadowImportError(String((error as Error & { code: unknown }).code)); throw new ExportShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, projectId: string): Promise<{ plans: ExportPlan[]; blockers: number; warnings: number; issueStorageKey?: string }> {
    const plans: ExportPlan[] = [];
    let blockers = 0;
    let warnings = 0;
    let issueStorageKey: string | undefined;
    const db = this.prisma.database();
    const groups = new Map<string, { chapterSlug: string | null; manifest?: typeof snapshot.sourceManifest.items[number]; files: typeof snapshot.sourceManifest.items }>();
    for (const item of snapshot.sourceManifest.items.filter((entry) => entry.storageKey.startsWith(`projects/${legacyProjectId}/`) && entry.storageKey.includes("/exports/"))) {
      const parts = item.storageKey.split("/");
      const chapterIndex = parts.indexOf("chapters");
      const chapterSlug = chapterIndex >= 0 && parts[chapterIndex + 1] ? chapterIndex + 1 < parts.length ? parts[chapterIndex + 1] : null : null;
      const exportIndex = parts.indexOf("exports");
      const groupKey = chapterSlug ? `chapter:${chapterSlug}:${parts.slice(exportIndex + 1, -1).join("/")}` : `project:${parts.slice(exportIndex + 1, -1).join("/")}`;
      const group = groups.get(groupKey) ?? { chapterSlug, files: [] };
      if (parts.at(-1) === "manifest.json") group.manifest = item; else group.files.push(item);
      groups.set(groupKey, group);
    }
    for (const [groupKey, group] of groups) {
      const chapterMetaItem = group.chapterSlug ? snapshot.sourceManifest.items.find((item) => item.storageKey === `projects/${legacyProjectId}/chapters/${group.chapterSlug}/chapter.json`) : undefined;
      const chapterMeta = chapterMetaItem ? (await payload(snapshot, chapterMetaItem.storageKey)).value : null;
      const legacyChapterId = group.chapterSlug ? field(chapterMeta ?? {}, "id", group.chapterSlug) : null;
      const chapterId = legacyChapterId ? stableId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId)) : null;
      if (chapterId) { const chapter = await db.chapter.findUnique({ where: { id: chapterId } }); if (!chapter || chapter.projectId !== projectId) { blockers += 1; issueStorageKey = group.manifest?.storageKey ?? group.files[0]?.storageKey; continue; } }
      const scopeKey = chapterId ? `chapter:${chapterId}` : "project";
      const knownSource = await db.importedEntitySource.findFirst({ where: { sourceKey: { startsWith: exportSourcePrefix(legacyProjectId, scopeKey, groupKey) } }, orderBy: { sourceKey: "desc" } });
      const knownRevision = knownSource ? await db.exportRevision.findUnique({ where: { id: knownSource.entityId }, select: { revision: true } }) : null;
      const latest = knownSource ? null : await db.exportRevision.findFirst({ where: { projectId, scopeKey, kind: "layout_publication" }, orderBy: { revision: "desc" } });
      const revision = knownRevision?.revision ?? (latest?.revision ?? 0) + 1;
      const sourceKey = exportSourceKey(legacyProjectId, scopeKey, groupKey, revision);
      const manifest = group.manifest ? (await payload(snapshot, group.manifest.storageKey)).value : null;
      if (!manifest) warnings += 1;
      const manifestDigest = manifest ? digestCanonicalJson(manifest) : null;
      const sourceStorageKey = group.manifest?.storageKey ?? group.files[0]?.storageKey;
      if (!sourceStorageKey) continue;
      const sourceDigest = group.manifest?.sha256 ?? group.files[0]!.sha256;
      const targetId = knownSource?.entityId ?? stableId("ExportRevision", sourceKey);
      plans.push({ targetId, sourceKey, sourceStorageKey, sourceDigest, payloadDigest: digestCanonicalJson({ id: targetId, projectId, chapterId, scopeKey, revision, kind: "layout_publication", status: "failed", origin: "legacy_import", completionApplicability: "legacy_unresolved", manifestDigest }), projectId, chapterId, scopeKey, revision, manifestJson: manifest ? jsonValue(manifest) : null, manifestDigest, recordedAt: group.manifest ? dateField(manifest ?? {}, "createdAt") : new Date(FALLBACK_DATE) });
    }
    return { plans, blockers, warnings, issueStorageKey };
  }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: ExportPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.exportRevision.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.projectId !== plan.projectId || existing.scopeKey !== plan.scopeKey || existing.revision !== plan.revision)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) {
      await tx.exportRevision.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, scopeKey: plan.scopeKey, revision: plan.revision, kind: "layout_publication", status: "failed", taskId: null, layoutRevisionId: null, sourceLockSetDigest: null, profileDigest: null, preflightDigest: null, rendererVersion: null, ...(plan.manifestJson ? { manifestJson: plan.manifestJson, manifestSchemaVersion: 1, manifestDigest: plan.manifestDigest } : {}), completionApplicability: null, origin: "legacy_import", createdAt: plan.recordedAt, readyAt: null, failedAt: plan.recordedAt, cancelledAt: null } });
      await tx.exportRevision.update({ where: { id: plan.targetId }, data: { completionApplicability: "legacy_unresolved" } });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ExportRevision", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "partial" });
  }
}
