import { Prisma } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { redactCredentials } from "./credential-redactor.js";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";

export class TaskShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

interface TaskPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string | null;
  type: string;
  status: string | null;
  phase: string | null;
  targetType: string | null;
  targetIdValue: string | null;
  inputJson: Prisma.InputJsonValue | null;
  inputSchemaVersion: number | null;
  inputDigest: string | null;
  outputJson: Prisma.InputJsonValue | null;
  outputSchemaVersion: number | null;
  outputDigest: string | null;
  errorJson: Prisma.InputJsonValue | null;
  errorSchemaVersion: number | null;
  sourceTaskDigest: `sha256:${string}`;
  recordKind: "legacy_imported" | "legacy_stub";
  provenanceStatus: "partial" | "complete";
  observedEvidenceJson: Prisma.InputJsonValue;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
}

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
function object(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TaskShadowImportError(code); return value as Record<string, unknown>; }
function field(value: Record<string, unknown>, key: string, fallback = ""): string { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback; }
function optional(value: Record<string, unknown>, key: string): string | null { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : null; }
function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date | null { const raw = field(value, key, fallback); const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function taskSourceKey(projectId: string, taskId: string): string { return `workspace-v1:${projectId}:GenerationTask:${taskId}`; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function payload(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try { return { item, value: object(JSON.parse(bytes.toString("utf8")), "MIGRATION_SOURCE_JSON_INVALID") }; }
  catch (error) { if (error instanceof TaskShadowImportError) throw error; throw new TaskShadowImportError("MIGRATION_SOURCE_JSON_INVALID"); }
}

/** G3-M3-A11a：将旧任务保留为不可执行 legacy_imported/legacy_stub 记录。 */
export class TaskShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a11a", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const projects: ComicFormatReportProject[] = [];
      let taskCount = 0; let warningCount = 0;
      const projectItems = snapshot.sourceManifest.items.filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payload(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = stableId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const plans = targetProject ? await this.buildPlans(snapshot, legacyProjectId, targetProjectId) : [];
        const issueKey = !targetProject ? `project:${legacyProjectId}:task-target` : null;
        if (targetProject) await this.ledger.withTransaction(async (tx) => { for (const plan of plans) { await this.importPlan(tx, run.id, plan); taskCount += 1; } });
        if (!targetProject) warningCount += 1;
        projects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey, resolutionStatus: issueKey ? "open" : "not_needed", importStatus: issueKey ? "blocked" : "imported" });
        if (!targetProject) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey: issueKey!, code: "MIGRATION_TARGET_NOT_FOUND", entityType: "GenerationTask", entityId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId), storageKey: projectItem.storageKey, detailJson: { schemaVersion: 1, projectId: legacyProjectId, reason: "Project/Chapter shadow must run first" } }));
      }
      const report = createComicFormatReport(projects, { warningCount, entityCounts: { GenerationTask: taskCount } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, taskCount }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, taskShadowImported: true }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof TaskShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new TaskShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new TaskShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); }
    catch (error) { if (error instanceof Error && "code" in error) throw new TaskShadowImportError(String((error as Error & { code: unknown }).code)); throw new TaskShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string): Promise<TaskPlan[]> {
    const items = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/tasks/`) && item.storageKey.endsWith(".input.json")).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
    const plans: TaskPlan[] = [];
    for (const item of items) {
      const legacyTaskId = path.basename(item.storageKey, ".input.json");
      const raw = (await payload(snapshot, item.storageKey)).value;
      const outputItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/tasks/${legacyTaskId}.output.json`);
      const errorItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/tasks/${legacyTaskId}.error.json`);
      const input = this.redactObject(raw.input);
      const output = outputItem ? this.redactObject((await payload(snapshot, outputItem.storageKey)).value) : null;
      const error = errorItem ? this.redactObject((await payload(snapshot, errorItem.storageKey)).value) : null;
      const recordKind = output && input ? "legacy_imported" : "legacy_stub";
      const chapterLegacyId = field(raw, "chapterId") || field(object(raw.target ?? {}, "MIGRATION_TASK_TARGET_INVALID"), "chapterId");
      const chapterId = chapterLegacyId ? stableId("Chapter", chapterSourceKey(legacyProjectId, chapterLegacyId)) : null;
      const target = object(raw.target ?? {}, "MIGRATION_TASK_TARGET_INVALID");
      const sourceKey = taskSourceKey(legacyProjectId, legacyTaskId);
      const targetId = stableId("GenerationTask", sourceKey);
      const planPayload = { id: targetId, projectId: targetProjectId, chapterId, type: field(raw, "type", "legacy_unknown"), recordKind, provenanceStatus: recordKind === "legacy_imported" ? "complete" : "partial", status: recordKind === "legacy_imported" ? this.terminalStatus(optional(raw, "status")) : null, input, output, error, sourceDigest: item.sha256 };
      plans.push({ targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson(planPayload), projectId: targetProjectId, chapterId, type: field(raw, "type", "legacy_unknown"), status: recordKind === "legacy_imported" ? this.terminalStatus(optional(raw, "status")) : null, phase: recordKind === "legacy_imported" ? optional(raw, "phase") : null, targetType: optional(target, "type"), targetIdValue: optional(target, "id"), inputJson: input ? jsonValue(input) : null, inputSchemaVersion: input ? (typeof raw.inputSchemaVersion === "number" && raw.inputSchemaVersion >= 1 ? raw.inputSchemaVersion : 1) : null, inputDigest: optional(raw, "inputDigest"), outputJson: output ? jsonValue(output) : null, outputSchemaVersion: output ? (typeof raw.outputSchemaVersion === "number" && raw.outputSchemaVersion >= 1 ? raw.outputSchemaVersion : 1) : null, outputDigest: outputItem?.sha256 ?? null, errorJson: error ? jsonValue(error) : null, errorSchemaVersion: error ? (typeof raw.errorSchemaVersion === "number" && raw.errorSchemaVersion >= 1 ? raw.errorSchemaVersion : 1) : null, sourceTaskDigest: item.sha256, recordKind, provenanceStatus: recordKind === "legacy_imported" ? "complete" : "partial", observedEvidenceJson: jsonValue({ schemaVersion: 1, inputPresent: true, outputPresent: Boolean(output), errorPresent: Boolean(error) }), createdAt: dateField(raw, "createdAt") ?? new Date(FALLBACK_DATE), startedAt: dateField(raw, "startedAt"), finishedAt: dateField(raw, "finishedAt"), updatedAt: dateField(raw, "updatedAt") ?? dateField(raw, "createdAt") ?? new Date(FALLBACK_DATE) });
    }
    return plans;
  }

  private redactObject(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;
    const result = redactCredentials(object(value, "MIGRATION_TASK_ARTIFACT_INVALID"));
    return result.value as Record<string, unknown>;
  }

  private terminalStatus(value: string | null): string | null { return value === "succeeded" || value === "failed" || value === "cancelled" ? value : null; }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: TaskPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.generationTask.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.projectId !== plan.projectId || existing.chapterId !== plan.chapterId || existing.recordKind !== plan.recordKind)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.generationTask.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, type: plan.type, recordKind: plan.recordKind, provenanceStatus: plan.provenanceStatus, status: plan.status, phase: plan.phase, targetType: plan.targetType, targetId: plan.targetIdValue, inputJson: plan.inputJson ?? Prisma.DbNull, inputSchemaVersion: plan.inputSchemaVersion, inputDigest: plan.inputDigest, outputJson: plan.outputJson ?? Prisma.DbNull, outputSchemaVersion: plan.outputSchemaVersion, outputDigest: plan.outputDigest, errorJson: plan.errorJson ?? Prisma.DbNull, errorSchemaVersion: plan.errorSchemaVersion, sourceDigest: plan.sourceTaskDigest, sourceSetSealedAt: null, retryDisabled: true, maxAttempts: 0, attempt: 0, importSource: plan.sourceStorageKey, importedAt: plan.recordKind === "legacy_imported" ? plan.updatedAt : null, observedEvidenceJson: plan.observedEvidenceJson, evidenceSchemaVersion: 1, createdAt: plan.createdAt, startedAt: plan.startedAt, finishedAt: plan.finishedAt, updatedAt: plan.updatedAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "GenerationTask", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: plan.provenanceStatus });
  }
}
