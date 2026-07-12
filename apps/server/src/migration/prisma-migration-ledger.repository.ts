import { Prisma, type MigrationIssue, type MigrationRun, type ImportedEntitySource } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { PrismaService } from "../persistence/prisma.service.js";
import { parseComicFormatIssueDetail, resolveComicFormatIssue, type ComicFormatResolution, type MigrationIssueRecord } from "./migration-issue.js";
import {
  MigrationLedgerError,
  type BeginMigrationRunInput,
  type FinishMigrationRunInput,
  type ImportedEntitySourceRecord,
  type MigrationLedgerPort,
  type MigrationRunRecord,
  type ProvenanceStatus,
  type RecordImportedEntitySourceInput,
} from "./migration-ledger.js";

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const PROVENANCE_RANK: Record<ProvenanceStatus, number> = { reference_only: 0, partial: 1, complete: 2 };

function assertDigest(value: string, code: string): void {
  if (!DIGEST_RE.test(value)) throw new MigrationLedgerError(code);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonObject(value: Prisma.JsonValue | null, field: string): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new MigrationLedgerError(`${field}_INVALID`);
  return value as Record<string, unknown>;
}

function parseJson(raw: string, code: string): Prisma.InputJsonValue {
  try { return jsonValue(JSON.parse(raw)); } catch { throw new MigrationLedgerError(code); }
}

function toRun(row: MigrationRun): MigrationRunRecord {
  return {
    id: row.id,
    kind: row.kind as MigrationRunRecord["kind"],
    status: row.status as MigrationRunRecord["status"],
    importerVersion: row.importerVersion,
    sourceManifestDigest: row.sourceManifestDigest,
    snapshotManifestDigest: row.snapshotManifestDigest,
    decisionsDigest: row.decisionsDigest,
    reportDigest: row.reportDigest,
    counts: jsonObject(row.countsJson, "MIGRATION_COUNTS") as Record<string, number> | null,
    verification: jsonObject(row.verificationJson, "MIGRATION_VERIFICATION"),
    errorCode: row.errorCode,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function toIssue(row: MigrationIssue): MigrationIssueRecord {
  return {
    runId: row.runId,
    issueKey: row.issueKey,
    severity: row.severity as MigrationIssueRecord["severity"],
    code: row.code as MigrationIssueRecord["code"],
    entityType: row.entityType as MigrationIssueRecord["entityType"],
    detailJson: JSON.stringify(row.detailJson),
    detailSchemaVersion: row.detailSchemaVersion as 1,
    resolutionStatus: row.resolutionStatus as MigrationIssueRecord["resolutionStatus"],
    resolutionJson: row.resolutionJson === null ? null : JSON.stringify(row.resolutionJson),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function toSource(row: ImportedEntitySource): ImportedEntitySourceRecord {
  return {
    sourceKey: row.sourceKey,
    entityType: row.entityType,
    entityId: row.entityId,
    sourceStorageKey: row.sourceStorageKey,
    sourceDigest: row.sourceDigest,
    payloadDigest: row.payloadDigest,
    provenanceStatus: row.provenanceStatus as ProvenanceStatus,
    firstRunId: row.firstRunId,
    lastRunId: row.lastRunId,
  };
}

function isKnownRunKind(value: string): value is MigrationRunRecord["kind"] {
  return value === "audit" || value === "shadow" || value === "final";
}

function isKnownProvenance(value: string): value is ProvenanceStatus {
  return value === "reference_only" || value === "partial" || value === "complete";
}

function errorCode(error: unknown): string | null {
  if (error instanceof MigrationLedgerError) return error.code;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "MIGRATION_CONFLICT";
    if (error.code === "P2003") return "MIGRATION_REFERENCE_CONFLICT";
  }
  return null;
}

/** Prisma-backed implementation of the M3-A0 ledger port. */
export class PrismaMigrationLedgerRepository implements MigrationLedgerPort {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return this.prisma.database();
  }

  async beginRun(input: BeginMigrationRunInput): Promise<MigrationRunRecord> {
    if (!isKnownRunKind(input.kind) || !input.importerVersion) throw new MigrationLedgerError("MIGRATION_RUN_INPUT_INVALID");
    assertDigest(input.sourceManifestDigest, "MIGRATION_SOURCE_DIGEST_INVALID");
    if (input.snapshotManifestDigest) assertDigest(input.snapshotManifestDigest, "MIGRATION_SNAPSHOT_DIGEST_INVALID");
    if (input.decisionsDigest) assertDigest(input.decisionsDigest, "MIGRATION_DECISIONS_DIGEST_INVALID");
    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
    if (Number.isNaN(startedAt.getTime())) throw new MigrationLedgerError("MIGRATION_RUN_INPUT_INVALID");
    try {
      const row = await this.client().migrationRun.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          kind: input.kind,
          status: "running",
          importerVersion: input.importerVersion,
          sourceManifestDigest: input.sourceManifestDigest,
          snapshotManifestDigest: input.snapshotManifestDigest ?? null,
          decisionsDigest: input.decisionsDigest ?? null,
          startedAt,
        },
      });
      return toRun(row);
    } catch (error) {
      const code = errorCode(error);
      if (code) throw new MigrationLedgerError(input.id && code === "MIGRATION_CONFLICT" ? "MIGRATION_RUN_ALREADY_EXISTS" : code);
      throw error;
    }
  }

  async getRun(runId: string): Promise<MigrationRunRecord> {
    const row = await this.client().migrationRun.findUnique({ where: { id: runId } });
    if (!row) throw new MigrationLedgerError("MIGRATION_RUN_NOT_FOUND");
    return toRun(row);
  }

  async listIssues(runId: string): Promise<MigrationIssueRecord[]> {
    await this.getRun(runId);
    const rows = await this.client().migrationIssue.findMany({ where: { runId }, orderBy: [{ issueKey: "asc" }] });
    return rows.map(toIssue);
  }

  async recordIssue(issue: MigrationIssueRecord): Promise<MigrationIssueRecord> {
    const run = await this.getRun(issue.runId);
    if (run.status !== "running") throw new MigrationLedgerError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
    if (issue.resolutionStatus !== "open" && issue.resolutionStatus !== "not_needed") throw new MigrationLedgerError("MIGRATION_ISSUE_INPUT_INVALID");
    const detail = parseComicFormatIssueDetail(issue.detailJson);
    const sourceKey = `workspace-v1:${detail.projectId}:Project:${detail.projectId}`;
    try {
      const row = await this.client().migrationIssue.create({
        data: {
          runId: issue.runId,
          issueKey: issue.issueKey,
          severity: issue.severity,
          code: issue.code,
          sourceKey,
          entityType: issue.entityType,
          entityId: detail.projectId,
          storageKey: detail.sourceStorageKey,
          detailJson: parseJson(issue.detailJson, "MIGRATION_ISSUE_DETAIL_INVALID"),
          detailSchemaVersion: issue.detailSchemaVersion,
          resolutionStatus: issue.resolutionStatus,
          resolutionJson: issue.resolutionJson ? parseJson(issue.resolutionJson, "MIGRATION_DECISION_INVALID") : Prisma.DbNull,
          createdAt: new Date(issue.createdAt),
        },
      });
      return toIssue(row);
    } catch (error) {
      const code = errorCode(error);
      if (code === "MIGRATION_CONFLICT") throw new MigrationLedgerError("MIGRATION_ISSUE_ALREADY_EXISTS");
      if (code) throw new MigrationLedgerError(code);
      throw error;
    }
  }

  async resolveIssue(runId: string, issueKey: string, resolution: ComicFormatResolution, resolvedAt = new Date().toISOString()): Promise<MigrationIssueRecord> {
    const run = await this.getRun(runId);
    if (run.status !== "running") throw new MigrationLedgerError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
    const row = await this.client().migrationIssue.findUnique({ where: { runId_issueKey: { runId, issueKey } } });
    if (!row) throw new MigrationLedgerError("MIGRATION_ISSUE_NOT_FOUND");
    const current = toIssue(row);
    const resolved = resolveComicFormatIssue(current, resolution, resolvedAt);
    const updated = await this.client().migrationIssue.update({
      where: { id: row.id },
      data: { resolutionStatus: "resolved", resolutionJson: parseJson(resolved.resolutionJson!, "MIGRATION_DECISION_INVALID"), resolvedAt: new Date(resolvedAt) },
    });
    return toIssue(updated);
  }

  async finishRun(runId: string, input: FinishMigrationRunInput): Promise<MigrationRunRecord> {
    const run = await this.getRun(runId);
    if (run.status !== "running") throw new MigrationLedgerError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
    const openBlockers = await this.client().migrationIssue.count({ where: { runId, severity: "blocker", resolutionStatus: "open" } });
    if (input.status === "blocked" && openBlockers === 0) throw new MigrationLedgerError("MIGRATION_BLOCKED_WITHOUT_ISSUE");
    if (input.status === "succeeded" && openBlockers > 0) throw new MigrationLedgerError("MIGRATION_OPEN_BLOCKER");
    if (input.status === "failed" && !input.errorCode) throw new MigrationLedgerError("MIGRATION_FAILURE_CODE_REQUIRED");
    if (input.reportDigest) assertDigest(input.reportDigest, "MIGRATION_REPORT_DIGEST_INVALID");
    const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date();
    if (Number.isNaN(finishedAt.getTime())) throw new MigrationLedgerError("MIGRATION_RUN_INPUT_INVALID");
    const updated = await this.client().migrationRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        reportDigest: input.reportDigest ?? null,
        countsJson: input.counts ? jsonValue(input.counts) : Prisma.DbNull,
        countsSchemaVersion: input.counts ? 1 : null,
        verificationJson: input.verification ? jsonValue(input.verification) : Prisma.DbNull,
        verificationSchemaVersion: input.verification ? 1 : null,
        errorCode: input.errorCode ?? null,
        finishedAt,
      },
    });
    return toRun(updated);
  }

  async recordImportedEntitySource(runId: string, input: RecordImportedEntitySourceInput): Promise<ImportedEntitySourceRecord> {
    const run = await this.getRun(runId);
    if (run.status !== "running") throw new MigrationLedgerError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
    if (!input.sourceKey || !input.entityType || !input.entityId) throw new MigrationLedgerError("MIGRATION_SOURCE_INPUT_INVALID");
    assertDigest(input.sourceDigest, "MIGRATION_SOURCE_DIGEST_INVALID");
    if (input.payloadDigest) assertDigest(input.payloadDigest, "MIGRATION_PAYLOAD_DIGEST_INVALID");
    const requested = input.provenanceStatus ?? "reference_only";
    if (!isKnownProvenance(requested)) throw new MigrationLedgerError("MIGRATION_PROVENANCE_INVALID");
    const row = await this.client().importedEntitySource.findUnique({ where: { sourceKey: input.sourceKey } });
    if (!row) {
      try {
        const created = await this.client().importedEntitySource.create({ data: {
          sourceKey: input.sourceKey,
          entityType: input.entityType,
          entityId: input.entityId,
          sourceStorageKey: input.sourceStorageKey ?? null,
          sourceDigest: input.sourceDigest,
          payloadDigest: input.payloadDigest ?? null,
          provenanceStatus: requested,
          firstRunId: runId,
          lastRunId: runId,
        } });
        return toSource(created);
      } catch (error) {
        const code = errorCode(error);
        if (code === "MIGRATION_CONFLICT") throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
        throw error;
      }
    }
    if (row.sourceDigest !== input.sourceDigest || row.entityType !== input.entityType || row.entityId !== input.entityId || (input.sourceStorageKey !== undefined && row.sourceStorageKey !== (input.sourceStorageKey ?? null)) || (input.payloadDigest !== undefined && row.payloadDigest !== (input.payloadDigest ?? null))) {
      throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    }
    if (!isKnownProvenance(row.provenanceStatus) || PROVENANCE_RANK[requested] < PROVENANCE_RANK[row.provenanceStatus]) throw new MigrationLedgerError("MIGRATION_PROVENANCE_REGRESSION");
    if (PROVENANCE_RANK[requested] > PROVENANCE_RANK[row.provenanceStatus] + 1) throw new MigrationLedgerError("MIGRATION_PROVENANCE_STEP_REQUIRED");
    const payloadUpgrade = row.payloadDigest === null && input.payloadDigest !== undefined && input.payloadDigest !== null;
    if (requested === row.provenanceStatus && !payloadUpgrade) return toSource(row);
    const updated = await this.client().importedEntitySource.update({ where: { id: row.id }, data: { provenanceStatus: requested, lastRunId: runId } });
    return toSource(updated);
  }

  async getImportedEntitySource(sourceKey: string): Promise<ImportedEntitySourceRecord | null> {
    const row = await this.client().importedEntitySource.findUnique({ where: { sourceKey } });
    return row ? toSource(row) : null;
  }

  static stableEntityId(entityType: string, sourceKey: string): string {
    if (!entityType || !sourceKey) throw new MigrationLedgerError("MIGRATION_SOURCE_INPUT_INVALID");
    return `${entityType.toLowerCase()}_${digestCanonicalJson({ entityType, sourceKey }).slice("sha256:".length)}`;
  }
}
