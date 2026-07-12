import { Prisma } from "@prisma/client";
import { digestCanonicalJson, encodeScriptTextV1 } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaService } from "../persistence/prisma.service.js";

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
const OPERATIONS = ["import_script_to_chapters", "update_chapter_draft", "generate_script_from_seed", "generate_script_from_outline"] as const;
type ScriptOperation = (typeof OPERATIONS)[number];

export class ScriptPendingRevisionShadowImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface PendingPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  chapterId: string;
  sourceText: string;
  contentDigest: `sha256:${string}`;
  operation: ScriptOperation;
  createdAt: Date;
  updatedAt: Date;
  rawDialogueReference: boolean;
}

interface RevisionPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  chapterId: string;
  source: "ai_tool";
  operation: ScriptOperation;
  summary: string;
  targetWorkingDigest: `sha256:${string}`;
  createdAt: Date;
  rawDialogueReference: boolean;
}

interface ChapterHistoryPlan {
  chapterId: string;
  pending: PendingPlan | null;
  revision: RevisionPlan | null;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ScriptPendingRevisionShadowImportError(code);
  return value as Record<string, unknown>;
}

function parseJson(bytes: Buffer, code: string): Record<string, unknown> {
  try { return object(JSON.parse(bytes.toString("utf8")), code); } catch (error) {
    if (error instanceof ScriptPendingRevisionShadowImportError) throw error;
    throw new ScriptPendingRevisionShadowImportError(code);
  }
}

function stringField(value: Record<string, unknown>, key: string, fallback: string): string {
  return typeof value[key] === "string" && value[key].trim() !== "" ? value[key] as string : fallback;
}

function optionalString(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] as string : null;
}

function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date {
  const candidate = typeof value[key] === "string" ? new Date(value[key] as string) : new Date(fallback);
  return Number.isNaN(candidate.getTime()) ? new Date(fallback) : candidate;
}

function projectSourceKey(projectId: string): string {
  return `workspace-v1:${projectId}:Project:${projectId}`;
}

function chapterSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:Chapter:${chapterId}`;
}

function pendingSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:ChapterScriptPending:${chapterId}`;
}

function revisionSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:ChapterScriptRevision:${chapterId}:latest`;
}

async function payloadJson(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  return { item, value: parseJson(bytes, "MIGRATION_SOURCE_JSON_INVALID") };
}

function operation(value: unknown): ScriptOperation {
  if (OPERATIONS.includes(value as ScriptOperation)) return value as ScriptOperation;
  throw new ScriptPendingRevisionShadowImportError("MIGRATION_SCRIPT_OPERATION_INVALID");
}

function normalizeText(value: string): string {
  if (value.includes("\0")) throw new ScriptPendingRevisionShadowImportError("MIGRATION_SCRIPT_PAYLOAD_INVALID");
  return value.replace(/\r\n?/g, "\n");
}

function hasDialogueReference(value: Record<string, unknown>): boolean {
  return ["threadId", "messageId", "toolCallId"].some((key) => typeof value[key] === "string" && (value[key] as string).trim() !== "");
}

/** M3-A4：导入章节 pending/revision 证据，但不伪造尚未导入的 Dialogue 外键。 */
export class ScriptPendingRevisionShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({
      kind: "shadow",
      importerVersion: "g3-m3-a4",
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      decisionsDigest: decisions.decisionsDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });

    try {
      const reportProjects: ComicFormatReportProject[] = [];
      let pendingCount = 0;
      let revisionCount = 0;
      let importedProjectCount = 0;
      let warningCount = 0;
      const projectItems = snapshot.sourceManifest.items
        .filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey))
        .sort((left, right) => left.storageKey.localeCompare(right.storageKey));

      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payloadJson(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = PrismaMigrationLedgerRepository.stableEntityId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const unresolvedDecision = mapping.mappingKind === "decision_required" && !decision;
        const blocked = !targetProject || unresolvedDecision;
        if (!blocked) {
          const histories = await this.buildHistoryPlans(snapshot, legacyProjectId);
          await this.ledger.withTransaction(async (tx) => {
            for (const history of histories) {
              if (history.pending) {
                await this.importPending(tx, run.id, history.pending);
                pendingCount += 1;
                warningCount += history.pending.rawDialogueReference ? 1 : 0;
              }
              if (history.revision) {
                await this.importRevision(tx, run.id, history.revision);
                revisionCount += 1;
                warningCount += history.revision.rawDialogueReference ? 1 : 0;
              }
            }
          });
          importedProjectCount += 1;
        }
        reportProjects.push({
          projectId: legacyProjectId,
          sourceStorageKey: projectItem.storageKey,
          sourceDigest: projectItem.sha256,
          originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview },
          mappingKind: mapping.mappingKind,
          targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null,
          layoutPresetIntent: mapping.layoutPresetIntent,
          issueKey: mapping.issueCode ? `project:${legacyProjectId}:comic-format` : null,
          resolutionStatus: mapping.mappingKind === "decision_required" ? (decision ? "resolved" : "open") : "not_needed",
          importStatus: blocked ? "blocked" : "imported",
        });
      }

      const report = createComicFormatReport(reportProjects, { warningCount, entityCounts: { Project: importedProjectCount, ChapterScriptPending: pendingCount, ChapterScriptRevision: revisionCount } });
      const finished = await this.ledger.finishRun(run.id, {
        status: report.summary.unresolvedBlockerCount > 0 || reportProjects.some((project) => project.importStatus === "blocked") ? "blocked" : "succeeded",
        reportDigest: report.reportDigest,
        counts: { ...report.summary, pendingCount, revisionCount },
        verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, scriptPendingRevisionShadowImported: true, dialogueReferencesPreservedAsEvidenceOnly: true },
        finishedAt: new Date().toISOString(),
      });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof ScriptPendingRevisionShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new ScriptPendingRevisionShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expectedSourceManifestDigest: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new ScriptPendingRevisionShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try {
      const value = JSON.parse(await readFile(decisionsPath, "utf8")) as unknown;
      return normalizeMigrationDecisionArtifact(value, expectedSourceManifestDigest);
    } catch (error) {
      if (error instanceof Error && "code" in error) throw new ScriptPendingRevisionShadowImportError(String((error as Error & { code: unknown }).code));
      throw new ScriptPendingRevisionShadowImportError("MIGRATION_DECISION_INVALID");
    }
  }

  private async buildHistoryPlans(snapshot: VerifiedSnapshot, legacyProjectId: string): Promise<ChapterHistoryPlan[]> {
    const chapterItems = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/chapter.json"));
    const byChapter = new Map<string, ChapterHistoryPlan>();
    for (const chapterItem of chapterItems) {
      const parts = chapterItem.storageKey.split("/");
      const slug = parts[3];
      const metadata = (await payloadJson(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = stringField(metadata, "id", slug);
      const chapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      byChapter.set(chapterId, { chapterId, pending: null, revision: null });
    }
    const pendingItems = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/script-pending.json"));
    for (const item of pendingItems) {
      const slug = item.storageKey.split("/")[3];
      const chapterItem = chapterItems.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/chapters/${slug}/chapter.json`);
      if (!chapterItem) throw new ScriptPendingRevisionShadowImportError("MIGRATION_CHAPTER_SOURCE_MISSING");
      const metadata = (await payloadJson(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = stringField(metadata, "id", slug);
      const chapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const value = (await payloadJson(snapshot, item.storageKey)).value;
      const encoded = encodeScriptTextV1(normalizeText(stringField(value, "sourceText", "")), { allowEmpty: false });
      const operationValue = operation(stringField(value, "operation", "generate_script_from_outline"));
      const sourceKey = pendingSourceKey(legacyProjectId, legacyChapterId);
      const targetId = PrismaMigrationLedgerRepository.stableEntityId("ChapterScriptPending", sourceKey);
      const createdAt = dateField(value, "createdAt", stringField(metadata, "updatedAt", FALLBACK_DATE));
      const updatedAt = dateField(value, "updatedAt", createdAt.toISOString());
      const payload = { id: targetId, chapterId, sourceText: encoded.canonical, sourceDigest: encoded.digest, operation: operationValue, threadId: null, messageId: null, toolCallId: null, rowVersion: 0, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
      const history = byChapter.get(chapterId) ?? { chapterId, pending: null, revision: null };
      history.pending = { targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson(payload), chapterId, sourceText: encoded.canonical, contentDigest: encoded.digest, operation: operationValue, createdAt, updatedAt, rawDialogueReference: hasDialogueReference(value) };
      byChapter.set(chapterId, history);
    }
    const revisionItems = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/script.revisions/latest.json"));
    for (const item of revisionItems) {
      const slug = item.storageKey.split("/")[3];
      const chapterItem = chapterItems.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/chapters/${slug}/chapter.json`);
      if (!chapterItem) throw new ScriptPendingRevisionShadowImportError("MIGRATION_CHAPTER_SOURCE_MISSING");
      const metadata = (await payloadJson(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = stringField(metadata, "id", slug);
      const chapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const value = (await payloadJson(snapshot, item.storageKey)).value;
      if (typeof value.chapterId === "string" && value.chapterId !== legacyChapterId) throw new ScriptPendingRevisionShadowImportError("MIGRATION_CHAPTER_ID_MISMATCH");
      const operationValue = operation(value.operation);
      const summary = stringField(value, "summary", "");
      if (!summary) throw new ScriptPendingRevisionShadowImportError("MIGRATION_SCRIPT_REVISION_INVALID");
      const pending = byChapter.get(chapterId)?.pending;
      const scriptKey = `projects/${legacyProjectId}/chapters/${slug}/script.md`;
      const scriptItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === scriptKey);
      const scriptText = scriptItem ? (await snapshot.readPayload(scriptKey)).bytes : Buffer.from(stringField(metadata, "sourceText", ""), "utf8");
      const targetWorkingDigest = pending?.contentDigest ?? encodeScriptTextV1(scriptText, { allowEmpty: true }).digest;
      const sourceKey = revisionSourceKey(legacyProjectId, legacyChapterId);
      const targetId = PrismaMigrationLedgerRepository.stableEntityId("ChapterScriptRevision", sourceKey);
      const createdAt = dateField(value, "createdAt", stringField(metadata, "updatedAt", FALLBACK_DATE));
      const payload = { id: targetId, chapterId, source: "ai_tool", threadId: null, messageId: null, toolCallId: null, operation: operationValue, summary, targetWorkingDigest, createdAt: createdAt.toISOString() };
      const history = byChapter.get(chapterId) ?? { chapterId, pending: null, revision: null };
      history.revision = { targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson(payload), chapterId, source: "ai_tool", operation: operationValue, summary, targetWorkingDigest, createdAt, rawDialogueReference: hasDialogueReference(value) };
      byChapter.set(chapterId, history);
    }
    return [...byChapter.values()].filter((history) => history.pending !== null || history.revision !== null);
  }

  private async importPending(tx: Prisma.TransactionClient, runId: string, plan: PendingPlan): Promise<void> {
    const existing = await tx.chapterScriptPending.findUnique({ where: { id: plan.targetId } });
    if (existing) {
      if (existing.chapterId !== plan.chapterId || existing.sourceText !== plan.sourceText || existing.sourceDigest !== plan.contentDigest || existing.operation !== plan.operation || existing.threadId !== null || existing.messageId !== null || existing.toolCallId !== null) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    } else {
      await tx.chapterScriptPending.create({ data: { id: plan.targetId, chapterId: plan.chapterId, sourceText: plan.sourceText, sourceDigest: plan.contentDigest, operation: plan.operation, threadId: null, messageId: null, toolCallId: null, rowVersion: 0, createdAt: plan.createdAt, updatedAt: plan.updatedAt } });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ChapterScriptPending", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: plan.rawDialogueReference ? "partial" : "complete" });
  }

  private async importRevision(tx: Prisma.TransactionClient, runId: string, plan: RevisionPlan): Promise<void> {
    const existing = await tx.chapterScriptRevision.findUnique({ where: { id: plan.targetId } });
    if (existing) {
      if (existing.chapterId !== plan.chapterId || existing.source !== plan.source || existing.operation !== plan.operation || existing.summary !== plan.summary || existing.targetWorkingDigest !== plan.targetWorkingDigest || existing.threadId !== null || existing.messageId !== null || existing.toolCallId !== null) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    } else {
      await tx.chapterScriptRevision.create({ data: { id: plan.targetId, chapterId: plan.chapterId, source: plan.source, threadId: null, messageId: null, toolCallId: null, operation: plan.operation, summary: plan.summary, targetWorkingDigest: plan.targetWorkingDigest, createdAt: plan.createdAt } });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ChapterScriptRevision", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: plan.rawDialogueReference ? "partial" : "complete" });
    const chapter = await tx.chapter.findUnique({ where: { id: plan.chapterId } });
    if (!chapter) throw new ScriptPendingRevisionShadowImportError("MIGRATION_TARGET_INCONSISTENT");
    if (chapter.lastScriptRevisionId !== plan.targetId) await tx.chapter.update({ where: { id: plan.chapterId }, data: { lastScriptRevisionId: plan.targetId, rowVersion: { increment: 1 } } });
  }
}
