import { digestCanonicalJson } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import { readVerifiedSnapshot } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { checkSourceEvidence } from "./migration-source-evidence.registry.js";
import { MigrationDecisionError, normalizeMigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationReportCodecError, normalizeComicFormatReport } from "./migration-report.js";
import type { MigrationRunKind } from "./migration-ledger.js";

export class MigrationVerifyError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface MigrationVerificationReport {
  schemaVersion: 1;
  kind: "airoaming_migration_verification_v1";
  runId: string;
  sourceManifestDigest: string;
  snapshotManifestDigest: string;
  effectiveSchemaManifestDigest: string;
  checks: {
    runKind: MigrationRunKind;
    importerVersion: string;
    importerVersionKnown: boolean;
    decisionsDigestPresent: boolean;
    decisionsDigestValid: boolean;
    decisionsArtifactPresent: boolean;
    decisionsArtifactValid: boolean;
    decisionsArtifactMatch: boolean;
    reportArtifactPresent: boolean;
    reportArtifactValid: boolean;
    reportArtifactMatch: boolean;
    reportDigestPresent: boolean;
    reportDigestValid: boolean;
    runVerificationPresent: boolean;
    runVerificationValid: boolean;
    runSucceeded: boolean;
    sourceManifestMatch: boolean;
    snapshotManifestMatch: boolean;
    integrityCheck: "ok" | "failed";
    foreignKeyViolationCount: number;
    openBlockerCount: number;
    sourceEvidenceCount: number;
    sourceEvidenceExpected: boolean;
    sourceEvidenceExpectedCount: number;
    sourceEntityCountsPresent: boolean;
    sourceEntityCountsValid: boolean;
    sourceEvidenceMissing: boolean;
    sourceEvidenceCountMismatch: boolean;
    sourceMismatchCount: number;
    unregisteredEntityTypeCount: number;
  };
  passed: boolean;
  errors: string[];
  reportDigest: `sha256:${string}`;
}

type SqliteRow = Record<string, unknown>;

function rows(value: unknown): SqliteRow[] {
  return Array.isArray(value) ? value as SqliteRow[] : [];
}

function text(value: unknown): string { return typeof value === "string" ? value : ""; }

interface SourceCountBinding {
  countKey: string;
  entityType: string;
}

const SOURCE_COUNT_BINDINGS_BY_IMPORTER: ReadonlyMap<string, readonly SourceCountBinding[]> = new Map([
  ["g3-m3-a2", [{ countKey: "Project", entityType: "Project" }, { countKey: "Chapter", entityType: "Chapter" }]],
  ["g3-m3-a3", [{ countKey: "ProjectScriptOutline", entityType: "ProjectScriptOutline" }, { countKey: "ChapterScriptVersion", entityType: "ChapterScriptVersion" }]],
  ["g3-m3-a4", [{ countKey: "ChapterScriptPending", entityType: "ChapterScriptPending" }, { countKey: "ChapterScriptRevision", entityType: "ChapterScriptRevision" }]],
  ["g3-m3-a5", [{ countKey: "StoryVersion", entityType: "StoryVersion" }, { countKey: "StorySceneProjection", entityType: "StorySceneProjection" }, { countKey: "StoryBeatProjection", entityType: "StoryBeatProjection" }]],
  // Shot rows are projections whose source evidence is recorded by the
  // StoryboardShotProjection row; there is intentionally no separate Shot
  // ImportedEntitySource row.
  ["g3-m3-a6", [{ countKey: "StoryboardVersion", entityType: "StoryboardVersion" }, { countKey: "StoryboardShotProjection", entityType: "StoryboardShotProjection" }]],
  ["g3-m3-a7", [{ countKey: "Character", entityType: "Character" }]],
  ["g3-m3-a8", [{ countKey: "Asset", entityType: "Asset" }]],
  // AssetReady is a report-level count; its source row is the physical
  // evidence record created during staged -> ready promotion.
  ["g3-m3-a9", [{ countKey: "AssetReady", entityType: "AssetPhysicalEvidence" }, { countKey: "CharacterVisual", entityType: "CharacterVisual" }, { countKey: "SceneVisual", entityType: "SceneVisual" }]],
  ["g3-m3-a10", [{ countKey: "PreflightRevision", entityType: "PreflightRevision" }]],
  ["g3-m3-a11a", [{ countKey: "GenerationTask", entityType: "GenerationTask" }]],
  ["g3-m3-a11b", [{ countKey: "Candidate", entityType: "Candidate" }]],
  ["g3-m3-a11c", [{ countKey: "CandidateLockRevision", entityType: "CandidateLockRevision" }]],
  ["g3-m3-a12", [{ countKey: "LayoutWorkingCopy", entityType: "LayoutWorkingCopy" }]],
  ["g3-m3-a13", [{ countKey: "ExportRevision", entityType: "ExportRevision" }]],
  ["g3-m3-a14", [{ countKey: "ProviderConfig", entityType: "ProviderConfig" }, { countKey: "CredentialMetadata", entityType: "CredentialMetadata" }, { countKey: "AppPreference", entityType: "AppPreference" }]],
  ["g3-m3-a15", [{ countKey: "ConversationThread", entityType: "ConversationThread" }, { countKey: "ConversationMessage", entityType: "ConversationMessage" }, { countKey: "DialogueToolResult", entityType: "DialogueToolResult" }, { countKey: "DialogueRuntimeSession", entityType: "DialogueRuntimeSession" }, { countKey: "PendingDialogueArtifact", entityType: "PendingDialogueArtifact" }]],
]);

const KNOWN_SHADOW_IMPORTER_VERSIONS = new Set(SOURCE_COUNT_BINDINGS_BY_IMPORTER.keys());
interface SourceCountAssessment {
  expected: Map<string, number>;
  present: boolean;
  valid: boolean;
}

interface RunVerificationAssessment {
  present: boolean;
  valid: boolean;
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_RE.test(value);
}

interface DecisionsArtifactAssessment {
  present: boolean;
  valid: boolean;
  matches: boolean;
  errorCode: string | null;
}

interface ReportArtifactAssessment {
  present: boolean;
  valid: boolean;
  matches: boolean;
  errorCode: string | null;
}

async function assessDecisionsArtifact(
  decisionsPath: string | undefined,
  expectedSourceManifestDigest: string,
  expectedDecisionsDigest: string | null,
): Promise<DecisionsArtifactAssessment> {
  if (!decisionsPath) return { present: false, valid: false, matches: false, errorCode: null };
  try {
    const raw = JSON.parse(await readFile(decisionsPath, "utf8")) as unknown;
    const artifact = normalizeMigrationDecisionArtifact(raw, expectedSourceManifestDigest as `sha256:${string}`);
    return {
      present: true,
      valid: true,
      matches: artifact.decisionsDigest === expectedDecisionsDigest,
      errorCode: null,
    };
  } catch (error) {
    const code = error instanceof MigrationDecisionError && error.code === "MIGRATION_SOURCE_DIGEST_MISMATCH"
      ? error.code
      : "MIGRATION_DECISIONS_ARTIFACT_INVALID";
    return { present: true, valid: false, matches: false, errorCode: code };
  }
}

async function assessReportArtifact(
  reportPath: string | undefined,
  expectedReportDigest: string | null,
): Promise<ReportArtifactAssessment> {
  if (!reportPath) return { present: false, valid: false, matches: false, errorCode: null };
  try {
    const raw = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
    const report = normalizeComicFormatReport(raw);
    return { present: true, valid: true, matches: report.reportDigest === expectedReportDigest, errorCode: null };
  } catch (error) {
    const code = error instanceof MigrationReportCodecError ? error.code : "MIGRATION_REPORT_ARTIFACT_INVALID";
    return { present: true, valid: false, matches: false, errorCode: code };
  }
}

function assessRunVerification(verification: Record<string, unknown> | null): RunVerificationAssessment {
  if (!verification) return { present: false, valid: false };
  return {
    present: true,
    valid: verification.schemaVersion === 1
      && verification.sourceManifestVerified === true
      && verification.snapshotManifestVerified === true,
  };
}

function assessSourceCounts(importerVersion: string, counts: Record<string, unknown> | null): SourceCountAssessment {
  const bindings = SOURCE_COUNT_BINDINGS_BY_IMPORTER.get(importerVersion);
  if (!bindings) return { expected: new Map(), present: false, valid: false };
  const entityCounts = counts?.entityCounts;
  if (!entityCounts || typeof entityCounts !== "object" || Array.isArray(entityCounts)) return { expected: new Map(), present: false, valid: false };
  const values = entityCounts as Record<string, unknown>;
  const expectedKeys = new Set(bindings.map(({ countKey }) => countKey));
  const actualKeys = new Set(Object.keys(values));
  const keysComplete = bindings.every(({ countKey }) => actualKeys.has(countKey));
  // Reports carry contextual counts that are not source-evidence rows for
  // the current slice. Project is present in the shared report summary for
  // every non-A2 slice; A6 additionally carries Shot while its source rows
  // are recorded as StoryboardShotProjection.
  const contextKeys = new Set(["Project"]);
  if (importerVersion === "g3-m3-a6") contextKeys.add("Shot");
  const allowedKeys = new Set([...expectedKeys, ...contextKeys]);
  const keysRegistered = Object.keys(values).every((countKey) => allowedKeys.has(countKey));
  const valuesValid = Object.values(values).every((value) => Number.isInteger(value) && (value as number) >= 0);
  return {
    expected: new Map(bindings.map(({ countKey, entityType }) => [entityType, Number.isInteger(values[countKey]) && (values[countKey] as number) >= 0 ? values[countKey] as number : 0])),
    present: true,
    valid: keysComplete && keysRegistered && valuesValid,
  };
}

/** M3/M4 只读 verifier：不修改终态 MigrationRun，也不推进 PersistenceState。 */
export class MigrationVerifyService {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async verify(snapshotPath: string, runId: string, workspaceRoot = process.cwd(), decisionsPath?: string, importReportPath?: string): Promise<{ report: MigrationVerificationReport }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const run = await this.ledger.getRun(runId);
    const effective = await loadReleaseSchemaIdentityV1(workspaceRoot);
    const db = this.prisma.database();
    const integrityRows = rows(await db.$queryRawUnsafe("PRAGMA integrity_check"));
    const foreignKeyRows = rows(await db.$queryRawUnsafe("PRAGMA foreign_key_check"));
    const integrityCheck: "ok" | "failed" = integrityRows.length === 1 && text(integrityRows[0]?.integrity_check) === "ok" ? "ok" : "failed";
    const openBlockerCount = await db.migrationIssue.count({ where: { runId, severity: "blocker", resolutionStatus: "open" } });
    const imported = await db.importedEntitySource.findMany({ where: { lastRunId: runId }, select: { entityType: true, sourceStorageKey: true, sourceDigest: true } });
    const sourceEvidence = await checkSourceEvidence(snapshot, imported);
    const sourceCountAssessment = assessSourceCounts(run.importerVersion, run.counts);
    const expectedSourceCounts = sourceCountAssessment.expected;
    const runVerification = assessRunVerification(run.verification);
    const decisionsArtifact = await assessDecisionsArtifact(decisionsPath, snapshot.sourceManifest.manifestDigest, run.decisionsDigest);
    const reportArtifact = await assessReportArtifact(importReportPath, run.reportDigest);
    const actualSourceCounts = new Map<string, number>();
    for (const row of imported) actualSourceCounts.set(row.entityType, (actualSourceCounts.get(row.entityType) ?? 0) + 1);
    const sourceEvidenceExpectedCount = [...expectedSourceCounts.values()].reduce((sum, count) => sum + count, 0);
    const sourceEvidenceExpected = sourceEvidenceExpectedCount > 0;
    const sourceEvidenceMissingCount = [...expectedSourceCounts.entries()].reduce((sum, [entityType, expected]) => sum + Math.max(expected - (actualSourceCounts.get(entityType) ?? 0), 0), 0);
    const sourceEvidenceMissing = run.status === "succeeded" && sourceEvidenceMissingCount > 0;
    const sourceEvidenceCountMismatch = run.status === "succeeded" && (
      [...expectedSourceCounts.entries()].some(([entityType, expected]) => (actualSourceCounts.get(entityType) ?? 0) !== expected)
      || [...actualSourceCounts.keys()].some((entityType) => !expectedSourceCounts.has(entityType))
    );
    const sourceMismatchCount = sourceEvidence.sourceMismatchCount;
    const importerVersionKnown = KNOWN_SHADOW_IMPORTER_VERSIONS.has(run.importerVersion);
    const decisionsDigestPresent = typeof run.decisionsDigest === "string" && run.decisionsDigest.length > 0;
    const decisionsDigestValid = isDigest(run.decisionsDigest);
    const reportDigestPresent = typeof run.reportDigest === "string" && run.reportDigest.length > 0;
    const reportDigestValid = isDigest(run.reportDigest);
    const runVerificationPresent = runVerification.present;
    const runVerificationValid = runVerification.valid;
    const sourceEntityCountsPresent = sourceCountAssessment.present;
    const sourceEntityCountsValid = sourceCountAssessment.valid;
    const errors: string[] = [];
    if (run.kind !== "shadow") errors.push("MIGRATION_RUN_KIND_INVALID");
    if (run.kind === "shadow" && !importerVersionKnown) errors.push("MIGRATION_IMPORTER_VERSION_INVALID");
    if (run.status !== "succeeded") errors.push("MIGRATION_RUN_NOT_SUCCEEDED");
    if (run.kind === "shadow" && run.status === "succeeded" && !reportDigestPresent) errors.push("MIGRATION_REPORT_DIGEST_MISSING");
    if (run.kind === "shadow" && run.status === "succeeded" && reportDigestPresent && !reportDigestValid) errors.push("MIGRATION_REPORT_DIGEST_INVALID");
    if (run.kind === "shadow" && run.status === "succeeded" && !decisionsDigestPresent) errors.push("MIGRATION_DECISIONS_DIGEST_MISSING");
    if (run.kind === "shadow" && run.status === "succeeded" && decisionsDigestPresent && !decisionsDigestValid) errors.push("MIGRATION_DECISIONS_DIGEST_INVALID");
    if (run.kind === "shadow" && run.status === "succeeded" && !decisionsArtifact.present) errors.push("MIGRATION_DECISIONS_ARTIFACT_MISSING");
    if (run.kind === "shadow" && run.status === "succeeded" && decisionsArtifact.present && !decisionsArtifact.valid) errors.push(decisionsArtifact.errorCode ?? "MIGRATION_DECISIONS_ARTIFACT_INVALID");
    if (run.kind === "shadow" && run.status === "succeeded" && decisionsArtifact.valid && !decisionsArtifact.matches) errors.push("MIGRATION_DECISIONS_DIGEST_MISMATCH");
    if (run.kind === "shadow" && run.status === "succeeded" && !reportArtifact.present) errors.push("MIGRATION_REPORT_ARTIFACT_MISSING");
    if (run.kind === "shadow" && run.status === "succeeded" && reportArtifact.present && !reportArtifact.valid) errors.push(reportArtifact.errorCode ?? "MIGRATION_REPORT_ARTIFACT_INVALID");
    if (run.kind === "shadow" && run.status === "succeeded" && reportArtifact.valid && !reportArtifact.matches) errors.push("MIGRATION_REPORT_DIGEST_MISMATCH");
    if (run.kind === "shadow" && run.status === "succeeded" && !runVerificationPresent) errors.push("MIGRATION_RUN_VERIFICATION_MISSING");
    if (run.kind === "shadow" && run.status === "succeeded" && runVerificationPresent && !runVerificationValid) errors.push("MIGRATION_RUN_VERIFICATION_INVALID");
    if (run.kind === "shadow" && run.status === "succeeded" && importerVersionKnown && !sourceEntityCountsPresent) errors.push("MIGRATION_SOURCE_ENTITY_COUNTS_MISSING");
    if (run.kind === "shadow" && run.status === "succeeded" && importerVersionKnown && sourceEntityCountsPresent && !sourceEntityCountsValid) errors.push("MIGRATION_SOURCE_ENTITY_COUNTS_INVALID");
    if (run.sourceManifestDigest !== snapshot.sourceManifest.manifestDigest) errors.push("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (run.snapshotManifestDigest !== snapshot.snapshotManifest.manifestDigest) errors.push("MIGRATION_SNAPSHOT_DIGEST_MISMATCH");
    if (integrityCheck !== "ok") errors.push("MIGRATION_INTEGRITY_CHECK_FAILED");
    if (foreignKeyRows.length > 0) errors.push("MIGRATION_FOREIGN_KEY_CHECK_FAILED");
    if (openBlockerCount > 0) errors.push("MIGRATION_OPEN_BLOCKER");
    if (sourceMismatchCount > 0) errors.push("MIGRATION_SOURCE_DIGEST_MISMATCH");
    if (sourceEvidence.unregisteredEntityTypeCount > 0) errors.push("MIGRATION_SOURCE_EVIDENCE_UNREGISTERED");
    if (sourceEvidenceMissing) errors.push("MIGRATION_SOURCE_EVIDENCE_MISSING");
    if (sourceEvidenceCountMismatch && !sourceEvidenceMissing) errors.push("MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH");
    const base = {
      schemaVersion: 1 as const,
      kind: "airoaming_migration_verification_v1" as const,
      runId,
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      effectiveSchemaManifestDigest: effective.effectiveSchemaManifestDigest,
      checks: { runKind: run.kind, importerVersion: run.importerVersion, importerVersionKnown, decisionsDigestPresent, decisionsDigestValid, decisionsArtifactPresent: decisionsArtifact.present, decisionsArtifactValid: decisionsArtifact.valid, decisionsArtifactMatch: decisionsArtifact.matches, reportArtifactPresent: reportArtifact.present, reportArtifactValid: reportArtifact.valid, reportArtifactMatch: reportArtifact.matches, reportDigestPresent, reportDigestValid, runVerificationPresent, runVerificationValid, runSucceeded: run.status === "succeeded", sourceManifestMatch: run.sourceManifestDigest === snapshot.sourceManifest.manifestDigest, snapshotManifestMatch: run.snapshotManifestDigest === snapshot.snapshotManifest.manifestDigest, integrityCheck, foreignKeyViolationCount: foreignKeyRows.length, openBlockerCount, sourceEvidenceCount: imported.length, sourceEvidenceExpected, sourceEvidenceExpectedCount, sourceEntityCountsPresent, sourceEntityCountsValid, sourceEvidenceMissing, sourceEvidenceCountMismatch, sourceMismatchCount, unregisteredEntityTypeCount: sourceEvidence.unregisteredEntityTypeCount },
      passed: errors.length === 0,
      errors: [...errors].sort(),
    };
    return { report: { ...base, reportDigest: digestCanonicalJson(base) } };
  }
}
