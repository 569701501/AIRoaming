import { randomUUID } from "node:crypto";
import { digestCanonicalJson } from "@airoaming/shared";
import { resolveComicFormatIssue, type ComicFormatResolution, type MigrationIssueRecord } from "./migration-issue.js";

export type MigrationRunKind = "audit" | "shadow" | "final";
export type MigrationRunStatus = "running" | "blocked" | "succeeded" | "failed";
export type ProvenanceStatus = "reference_only" | "partial" | "complete";

export interface MigrationRunRecord {
  id: string;
  kind: MigrationRunKind;
  status: MigrationRunStatus;
  importerVersion: string;
  sourceManifestDigest: string;
  snapshotManifestDigest: string | null;
  decisionsDigest: string | null;
  reportDigest: string | null;
  counts: Record<string, number> | null;
  verification: Record<string, unknown> | null;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ImportedEntitySourceRecord {
  sourceKey: string;
  entityType: string;
  entityId: string;
  sourceStorageKey: string | null;
  sourceDigest: string;
  payloadDigest: string | null;
  provenanceStatus: ProvenanceStatus;
  firstRunId: string;
  lastRunId: string;
}

export interface BeginMigrationRunInput {
  kind: MigrationRunKind;
  importerVersion: string;
  sourceManifestDigest: string;
  snapshotManifestDigest?: string | null;
  decisionsDigest?: string | null;
  id?: string;
  startedAt?: string;
}

export interface FinishMigrationRunInput {
  status: Exclude<MigrationRunStatus, "running">;
  reportDigest?: string | null;
  counts?: Record<string, number> | null;
  verification?: Record<string, unknown> | null;
  errorCode?: string | null;
  finishedAt?: string;
}

export interface RecordImportedEntitySourceInput {
  sourceKey: string;
  entityType: string;
  entityId: string;
  sourceStorageKey?: string | null;
  sourceDigest: string;
  payloadDigest?: string | null;
  provenanceStatus?: ProvenanceStatus;
}

export interface MigrationLedgerPort {
  beginRun(input: BeginMigrationRunInput): Promise<MigrationRunRecord> | MigrationRunRecord;
  recordIssue(issue: MigrationIssueRecord): Promise<MigrationIssueRecord> | MigrationIssueRecord;
  resolveIssue(runId: string, issueKey: string, resolution: ComicFormatResolution, resolvedAt?: string): Promise<MigrationIssueRecord> | MigrationIssueRecord;
  finishRun(runId: string, input: FinishMigrationRunInput): Promise<MigrationRunRecord> | MigrationRunRecord;
  listIssues(runId: string): Promise<MigrationIssueRecord[]> | MigrationIssueRecord[];
}

export class MigrationLedgerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const PROVENANCE_RANK: Record<ProvenanceStatus, number> = { reference_only: 0, partial: 1, complete: 2 };

function assertDigest(value: string, code = "MIGRATION_DIGEST_INVALID"): void {
  if (!DIGEST_RE.test(value)) throw new MigrationLedgerError(code);
}

function cloneRun(run: MigrationRunRecord): MigrationRunRecord {
  return { ...run, counts: run.counts ? { ...run.counts } : null, verification: run.verification ? { ...run.verification } : null };
}

function cloneSource(source: ImportedEntitySourceRecord): ImportedEntitySourceRecord {
  return { ...source };
}

/**
 * M3-A0 的纯账本实现。它模拟 Prisma 约束，先把状态机和冲突语义固定下来，
 * 后续数据库 repository 必须保持同一组错误码和单调规则。
 */
export class MigrationLedger implements MigrationLedgerPort {
  private readonly runs = new Map<string, MigrationRunRecord>();
  private readonly issues = new Map<string, MigrationIssueRecord>();
  private readonly sources = new Map<string, ImportedEntitySourceRecord>();

  beginRun(input: BeginMigrationRunInput): MigrationRunRecord {
    if (!input.importerVersion || !input.sourceManifestDigest) throw new MigrationLedgerError("MIGRATION_RUN_INPUT_INVALID");
    assertDigest(input.sourceManifestDigest, "MIGRATION_SOURCE_DIGEST_INVALID");
    if (input.snapshotManifestDigest) assertDigest(input.snapshotManifestDigest, "MIGRATION_SNAPSHOT_DIGEST_INVALID");
    if (input.decisionsDigest) assertDigest(input.decisionsDigest, "MIGRATION_DECISIONS_DIGEST_INVALID");
    const id = input.id ?? randomUUID();
    if (this.runs.has(id)) throw new MigrationLedgerError("MIGRATION_RUN_ALREADY_EXISTS");
    const run: MigrationRunRecord = {
      id,
      kind: input.kind,
      status: "running",
      importerVersion: input.importerVersion,
      sourceManifestDigest: input.sourceManifestDigest,
      snapshotManifestDigest: input.snapshotManifestDigest ?? null,
      decisionsDigest: input.decisionsDigest ?? null,
      reportDigest: null,
      counts: null,
      verification: null,
      errorCode: null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      finishedAt: null,
    };
    this.runs.set(id, run);
    return cloneRun(run);
  }

  getRun(runId: string): MigrationRunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new MigrationLedgerError("MIGRATION_RUN_NOT_FOUND");
    return cloneRun(run);
  }

  listIssues(runId: string): MigrationIssueRecord[] {
    this.requireRun(runId);
    return [...this.issues.values()].filter((issue) => issue.runId === runId).map((issue) => ({ ...issue }));
  }

  recordIssue(issue: MigrationIssueRecord): MigrationIssueRecord {
    const run = this.requireRunning(issue.runId);
    if (issue.resolutionStatus !== "open" && issue.resolutionStatus !== "not_needed") throw new MigrationLedgerError("MIGRATION_ISSUE_INPUT_INVALID");
    const key = `${run.id}:${issue.issueKey}`;
    if (this.issues.has(key)) throw new MigrationLedgerError("MIGRATION_ISSUE_ALREADY_EXISTS");
    this.issues.set(key, { ...issue, runId: run.id });
    return { ...issue, runId: run.id };
  }

  resolveIssue(runId: string, issueKey: string, resolution: ComicFormatResolution, resolvedAt = new Date().toISOString()): MigrationIssueRecord {
    this.requireRunning(runId);
    const key = `${runId}:${issueKey}`;
    const issue = this.issues.get(key);
    if (!issue) throw new MigrationLedgerError("MIGRATION_ISSUE_NOT_FOUND");
    try {
      const resolved = resolveComicFormatIssue(issue, resolution, resolvedAt);
      this.issues.set(key, resolved);
      return { ...resolved };
    } catch (error) {
      if (error instanceof Error && "code" in error) throw new MigrationLedgerError(String((error as Error & { code: string }).code));
      throw error;
    }
  }

  finishRun(runId: string, input: FinishMigrationRunInput): MigrationRunRecord {
    const run = this.requireRunning(runId);
    if (input.status === "blocked" && !this.hasOpenBlocker(runId)) throw new MigrationLedgerError("MIGRATION_BLOCKED_WITHOUT_ISSUE");
    if (input.status === "succeeded" && this.hasOpenBlocker(runId)) throw new MigrationLedgerError("MIGRATION_OPEN_BLOCKER");
    if (input.status === "failed" && !input.errorCode) throw new MigrationLedgerError("MIGRATION_FAILURE_CODE_REQUIRED");
    run.status = input.status;
    run.reportDigest = input.reportDigest ?? null;
    if (run.reportDigest) assertDigest(run.reportDigest, "MIGRATION_REPORT_DIGEST_INVALID");
    run.counts = input.counts ? { ...input.counts } : null;
    run.verification = input.verification ? { ...input.verification } : null;
    run.errorCode = input.errorCode ?? null;
    run.finishedAt = input.finishedAt ?? new Date().toISOString();
    return cloneRun(run);
  }

  hasOpenBlocker(runId: string): boolean {
    return [...this.issues.values()].some((issue) => issue.runId === runId && issue.severity === "blocker" && issue.resolutionStatus === "open");
  }

  recordImportedEntitySource(runId: string, input: RecordImportedEntitySourceInput): ImportedEntitySourceRecord {
    this.requireRunning(runId);
    if (!input.sourceKey || !input.entityType || !input.entityId) throw new MigrationLedgerError("MIGRATION_SOURCE_INPUT_INVALID");
    assertDigest(input.sourceDigest, "MIGRATION_SOURCE_DIGEST_INVALID");
    if (input.payloadDigest) assertDigest(input.payloadDigest, "MIGRATION_PAYLOAD_DIGEST_INVALID");
    const requested = input.provenanceStatus ?? "reference_only";
    const current = this.sources.get(input.sourceKey);
    if (!current) {
      const created: ImportedEntitySourceRecord = { ...input, sourceStorageKey: input.sourceStorageKey ?? null, payloadDigest: input.payloadDigest ?? null, provenanceStatus: requested, firstRunId: runId, lastRunId: runId };
      this.sources.set(input.sourceKey, created);
      return cloneSource(created);
    }
    if (current.sourceDigest !== input.sourceDigest || current.entityType !== input.entityType || current.entityId !== input.entityId) {
      throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    }
    if (input.sourceStorageKey !== undefined && current.sourceStorageKey !== (input.sourceStorageKey ?? null)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    if (input.payloadDigest !== undefined && current.payloadDigest !== (input.payloadDigest ?? null)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (PROVENANCE_RANK[requested] < PROVENANCE_RANK[current.provenanceStatus]) throw new MigrationLedgerError("MIGRATION_PROVENANCE_REGRESSION");
    if (PROVENANCE_RANK[requested] > PROVENANCE_RANK[current.provenanceStatus] + 1) throw new MigrationLedgerError("MIGRATION_PROVENANCE_STEP_REQUIRED");
    const payloadUpgrade = current.payloadDigest === null && input.payloadDigest !== undefined && input.payloadDigest !== null;
    if (requested === current.provenanceStatus && !payloadUpgrade) return cloneSource(current);
    current.provenanceStatus = requested;
    current.lastRunId = runId;
    return cloneSource(current);
  }

  getImportedEntitySource(sourceKey: string): ImportedEntitySourceRecord | null {
    const source = this.sources.get(sourceKey);
    return source ? cloneSource(source) : null;
  }

  static stableEntityId(entityType: string, sourceKey: string): string {
    if (!entityType || !sourceKey) throw new MigrationLedgerError("MIGRATION_SOURCE_INPUT_INVALID");
    return `${entityType.toLowerCase()}_${digestCanonicalJson({ entityType, sourceKey }).slice("sha256:".length)}`;
  }

  private requireRun(runId: string): MigrationRunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new MigrationLedgerError("MIGRATION_RUN_NOT_FOUND");
    return run;
  }

  private requireRunning(runId: string): MigrationRunRecord {
    const run = this.requireRun(runId);
    if (run.status !== "running") throw new MigrationLedgerError("MIGRATION_RUN_TERMINAL_IMMUTABLE");
    return run;
  }
}
