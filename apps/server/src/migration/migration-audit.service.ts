import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";
import { digestMaintenanceJson } from "../maintenance/canonical-json.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { buildComicFormatIssue } from "./migration-issue.js";
import { MigrationLedger, type MigrationRunRecord } from "./migration-ledger.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import type { SealedSnapshot, SnapshotDigest, SnapshotManifest } from "./snapshot.types.js";

export class MigrationAuditError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface ComicFormatAuditResult {
  run: MigrationRunRecord;
  report: ComicFormatReport;
  issues: ReturnType<MigrationLedger["listIssues"]>;
  sourceManifestDigest: SnapshotDigest;
  snapshotManifestDigest: SnapshotDigest;
}

function isAbsolute(value: string): boolean {
  return path.isAbsolute(value) && !value.includes("\0");
}

function sha256(bytes: Buffer): SnapshotDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function manifestDigest(manifest: SnapshotManifest): SnapshotDigest {
  const { manifestDigest: _ignored, ...base } = manifest;
  return digestMaintenanceJson(base);
}

function parseObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MigrationAuditError(code);
  return value as Record<string, unknown>;
}

async function readJson(filePath: string, code: string): Promise<unknown> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as unknown; } catch { throw new MigrationAuditError(code); }
}

async function assertRegularFile(filePath: string, code: string): Promise<void> {
  try {
    const metadata = await lstat(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new MigrationAuditError(code);
  } catch (error) {
    if (error instanceof MigrationAuditError) throw error;
    throw new MigrationAuditError(code);
  }
}

function assertSealed(value: unknown): SealedSnapshot {
  const sealed = parseObject(value, "MIGRATION_SNAPSHOT_NOT_SEALED");
  if (sealed.schemaVersion !== 1 || sealed.kind !== "airoaming_snapshot_sealed_v1" || typeof sealed.sourceManifestDigest !== "string" || typeof sealed.snapshotManifestDigest !== "string") {
    throw new MigrationAuditError("MIGRATION_SNAPSHOT_NOT_SEALED");
  }
  return sealed as unknown as SealedSnapshot;
}

function assertManifest(value: unknown): SnapshotManifest {
  const manifest = parseObject(value, "MIGRATION_SNAPSHOT_MANIFEST_INVALID");
  if (manifest.schemaVersion !== 1 || manifest.kind !== "airoaming_snapshot_manifest_v1" || !Array.isArray(manifest.items) || typeof manifest.manifestDigest !== "string") {
    throw new MigrationAuditError("MIGRATION_SNAPSHOT_MANIFEST_INVALID");
  }
  if (manifestDigest(manifest as unknown as SnapshotManifest) !== manifest.manifestDigest) throw new MigrationAuditError("MIGRATION_SNAPSHOT_MANIFEST_DIGEST_MISMATCH");
  return manifest as unknown as SnapshotManifest;
}

/** 只读 sealed snapshot 的项目元数据，建立 M3-A0 审计账本，不触碰业务数据库。 */
export class MigrationAuditService {
  async auditComicFormats(snapshotPath: string, ledger = new MigrationLedger(), options: { runId?: string; startedAt?: string } = {}): Promise<ComicFormatAuditResult> {
    if (!isAbsolute(snapshotPath)) throw new MigrationAuditError("MIGRATION_SNAPSHOT_PATH_INVALID");
    const root = path.resolve(snapshotPath);
    const sealed = assertSealed(await readJson(path.join(root, "SEALED"), "MIGRATION_SNAPSHOT_NOT_SEALED"));
    const sourceManifest = assertManifest(await readJson(path.join(root, "source-manifest.json"), "MIGRATION_SOURCE_MANIFEST_INVALID"));
    const snapshotManifest = assertManifest(await readJson(path.join(root, "snapshot-manifest.json"), "MIGRATION_SNAPSHOT_MANIFEST_INVALID"));
    if (sourceManifest.manifestDigest !== sealed.sourceManifestDigest) throw new MigrationAuditError("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (snapshotManifest.manifestDigest !== sealed.snapshotManifestDigest) throw new MigrationAuditError("MIGRATION_SNAPSHOT_DIGEST_MISMATCH");

    const run = ledger.beginRun({
      kind: "audit",
      importerVersion: "g3-m3-a0",
      sourceManifestDigest: sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshotManifest.manifestDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });
    const projects: ComicFormatReportProject[] = [];
    const projectItems = sourceManifest.items
      .filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey))
      .sort((left, right) => left.storageKey.localeCompare(right.storageKey));

    for (const item of projectItems) {
      const projectId = item.storageKey.split("/")[1];
      const payloadPath = path.join(root, "payload", ...item.storageKey.split("/"));
      await assertRegularFile(payloadPath, "MIGRATION_SOURCE_PROJECT_NOT_FOUND");
      const bytes = await readFile(payloadPath);
      if (sha256(bytes) !== item.sha256) throw new MigrationAuditError("MIGRATION_SOURCE_DIGEST_MISMATCH");
      const metadata = parseObject(await readJson(payloadPath, "MIGRATION_SOURCE_PROJECT_INVALID"), "MIGRATION_SOURCE_PROJECT_INVALID");
      const mapping = mapLegacyComicFormat(metadata.comicFormat);
      const issue = buildComicFormatIssue({ runId: run.id, projectId, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, mapping, createdAt: run.startedAt });
      if (issue) ledger.recordIssue(issue);
      projects.push({
        projectId,
        sourceStorageKey: item.storageKey,
        sourceDigest: item.sha256,
        originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview },
        mappingKind: mapping.mappingKind,
        targetComicFormat: mapping.targetComicFormat,
        layoutPresetIntent: mapping.layoutPresetIntent,
        issueKey: issue?.issueKey ?? null,
        resolutionStatus: issue ? "open" : "not_needed",
        importStatus: issue ? "blocked" : "not_started",
      });
    }

    const report = createComicFormatReport(projects);
    const finished = ledger.finishRun(run.id, {
      status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded",
      reportDigest: report.reportDigest,
      counts: report.summary,
      verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, projectFilesVerified: true },
      finishedAt: run.startedAt,
    });
    return { run: finished, report, issues: ledger.listIssues(run.id), sourceManifestDigest: sourceManifest.manifestDigest, snapshotManifestDigest: snapshotManifest.manifestDigest };
  }
}
