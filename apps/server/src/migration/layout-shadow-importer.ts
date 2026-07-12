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

export class LayoutShadowImportError extends Error {
  constructor(readonly code: string) { super(code); }
}

interface LayoutPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string;
  documentJson: Prisma.InputJsonValue;
  documentDigest: `sha256:${string}`;
  sourceLockSetDigest: `sha256:${string}` | null;
  provenanceStatus: "partial" | "complete";
  updatedAt: Date;
}

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LayoutShadowImportError(code);
  return value as Record<string, unknown>;
}

function field(value: Record<string, unknown>, key: string, fallback = ""): string {
  return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback;
}

function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date {
  const date = new Date(field(value, key, fallback));
  return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
}

function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function shotSourceKey(projectId: string, chapterId: string, shotId: string): string { return `workspace-v1:${projectId}:Shot:${chapterId}:${shotId}`; }
function candidateSourceKey(projectId: string, candidateId: string): string { return `workspace-v1:${projectId}:Candidate:${candidateId}`; }
function assetSourceKey(projectId: string, assetId: string): string { return `workspace-v1:${projectId}:Asset:${assetId}`; }
function layoutSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:LayoutWorkingCopy:${chapterId}`; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function payload(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    return { item, value: object(value, "MIGRATION_LAYOUT_JSON_INVALID") };
  } catch (error) {
    if (error instanceof LayoutShadowImportError) throw error;
    throw new LayoutShadowImportError("MIGRATION_LAYOUT_JSON_INVALID");
  }
}

/** G3-M3-A12：旧 layout 只进入 legacy Working Copy；不把 unresolved 伪装为 current revision。 */
export class LayoutShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a12", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
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
        if (targetProject && result.plans.length > 0) {
          await this.ledger.withTransaction(async (tx) => { for (const plan of result.plans) { await this.importPlan(tx, run.id, plan); count += 1; } });
        }
        warningCount += result.warnings;
        const blocked = !targetProject || result.blockers > 0;
        const issueKey = !targetProject ? `project:${legacyProjectId}:layout-target` : result.blockers > 0 ? `project:${legacyProjectId}:layout-source` : null;
        projects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey, resolutionStatus: issueKey ? "open" : "not_needed", importStatus: blocked ? "blocked" : "imported" });
        if (issueKey) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey, code: !targetProject ? "MIGRATION_TARGET_NOT_FOUND" : "LAYOUT_SOURCE_UNRESOLVED", entityType: "LayoutWorkingCopy", entityId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId), storageKey: result.issueStorageKey ?? projectItem.storageKey, detailJson: jsonValue({ schemaVersion: 1, reason: !targetProject ? "Project/Chapter shadow must run first" : "layout JSON could not be parsed or target scope was unresolved" }) }));
      }
      const report = createComicFormatReport(projects, { warningCount, entityCounts: { LayoutWorkingCopy: count } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, layoutWorkingCopyCount: count }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, layoutShadowImported: true }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original */ }
      if (error instanceof LayoutShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new LayoutShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new LayoutShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); } catch (error) { if (error instanceof Error && "code" in error) throw new LayoutShadowImportError(String((error as Error & { code: unknown }).code)); throw new LayoutShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, projectId: string): Promise<{ plans: LayoutPlan[]; blockers: number; warnings: number; issueStorageKey?: string }> {
    const plans: LayoutPlan[] = [];
    let blockers = 0;
    let warnings = 0;
    let issueStorageKey: string | undefined;
    const db = this.prisma.database();
    const items = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/layout/layout.json"));
    for (const item of items) {
      const slug = item.storageKey.split("/")[3];
      const chapterItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/chapters/${slug}/chapter.json`);
      if (!chapterItem) { blockers += 1; issueStorageKey = item.storageKey; continue; }
      const chapterMeta = (await payload(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = field(chapterMeta, "id", slug);
      const chapterId = stableId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const targetChapter = await db.chapter.findUnique({ where: { id: chapterId } });
      if (!targetChapter || targetChapter.projectId !== projectId) { blockers += 1; issueStorageKey = item.storageKey; continue; }
      const raw = (await payload(snapshot, item.storageKey)).value;
      const pages = Array.isArray(raw.pages) ? raw.pages : [];
      const sourceBindings: Record<string, unknown>[] = [];
      let complete = true;
      for (const [pageIndex, pageValue] of pages.entries()) {
        const page = object(pageValue, "MIGRATION_LAYOUT_JSON_INVALID");
        const placements = Array.isArray(page.placements) ? page.placements : [];
        for (const [placementIndex, placementValue] of placements.entries()) {
          const placement = object(placementValue, "MIGRATION_LAYOUT_JSON_INVALID");
          const legacyShotId = field(placement, "shotId");
          const legacyCandidateId = field(placement, "candidateId");
          const legacyAssetId = field(placement, "assetId");
          const elementId = field(placement, "id", `page-${pageIndex + 1}-placement-${placementIndex + 1}`);
          const shotId = legacyShotId ? stableId("Shot", shotSourceKey(legacyProjectId, legacyChapterId, legacyShotId)) : null;
          const candidateId = legacyCandidateId ? stableId("Candidate", candidateSourceKey(legacyProjectId, legacyCandidateId)) : null;
          const assetId = legacyAssetId ? stableId("Asset", assetSourceKey(legacyProjectId, legacyAssetId)) : null;
          const [shot, candidate, asset] = await Promise.all([shotId ? db.shot.findUnique({ where: { id: shotId } }) : null, candidateId ? db.candidate.findUnique({ where: { id: candidateId } }) : null, assetId ? db.asset.findUnique({ where: { id: assetId } }) : null]);
          const lock = shot && candidate ? await db.candidateLockRevision.findFirst({ where: { shotId: shot.id, projectId, chapterId, candidateId: candidate.id, action: "lock" }, orderBy: { revision: "desc" } }) : null;
          const sourceDigest = asset?.sha256 && DIGEST_RE.test(asset.sha256) ? asset.sha256 : digestCanonicalJson({ source: item.storageKey, elementId, shotId, candidateId, assetId });
          const binding = { elementId, role: "panel", order: pageIndex + 1, shotId, candidateId, candidateLockRevisionId: lock?.id ?? null, assetId, sourceDigest };
          sourceBindings.push(binding);
          if (!shot || !candidate || !asset || shot.projectId !== projectId || shot.chapterId !== chapterId || candidate.projectId !== projectId || candidate.chapterId !== chapterId || candidate.shotId !== shot.id || asset.projectId !== projectId || asset.chapterId !== chapterId || !lock || !asset.sha256 || !DIGEST_RE.test(asset.sha256)) complete = false;
        }
      }
      if (!complete) warnings += 1;
      const envelope = { schemaVersion: 1, kind: "legacy_chapter_layout_v1", sourceResolution: complete ? "complete" : "unresolved", legacyDocument: raw, sourceBindings };
      const documentDigest = digestCanonicalJson(envelope);
      const sourceLockSetDigest = complete ? digestCanonicalJson(sourceBindings.map((binding) => ({ elementId: binding.elementId, candidateLockRevisionId: binding.candidateLockRevisionId }))) : null;
      const sourceKey = layoutSourceKey(legacyProjectId, legacyChapterId);
      plans.push({ targetId: stableId("LayoutWorkingCopy", sourceKey), sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: documentDigest, projectId, chapterId, documentJson: jsonValue(envelope), documentDigest, sourceLockSetDigest, provenanceStatus: complete ? "complete" : "partial", updatedAt: dateField(raw, "updatedAt", dateField(chapterMeta, "updatedAt").toISOString()) });
    }
    return { plans, blockers, warnings, issueStorageKey };
  }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: LayoutPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.layoutWorkingCopy.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.chapterId !== plan.chapterId || existing.documentDigest !== plan.documentDigest || existing.documentKind !== "legacy_chapter_layout_v1")) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.layoutWorkingCopy.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, documentKind: "legacy_chapter_layout_v1", documentJson: plan.documentJson, schemaVersion: 1, documentDigest: plan.documentDigest, sourceLockSetDigest: plan.sourceLockSetDigest, basedOnRevisionId: null, rowVersion: 0, createdAt: plan.updatedAt, updatedAt: plan.updatedAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "LayoutWorkingCopy", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: plan.provenanceStatus });
  }
}
