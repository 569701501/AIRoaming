import { digestCanonicalJson } from "@airoaming/shared";
import { Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

import { PrismaService } from "../persistence/prisma.service.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import {
  MigrationAuditError,
  readVerifiedSnapshot,
  type VerifiedSnapshot,
} from "./migration-audit.service.js";
import {
  normalizeMigrationDecisionArtifact,
  type MigrationDecisionArtifact,
} from "./migration-decision.js";
import {
  MigrationLedgerError,
  type MigrationRunRecord,
} from "./migration-ledger.js";
import {
  createComicFormatReport,
  type ComicFormatReport,
  type ComicFormatReportProject,
} from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";

export class CandidateLockShadowImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const CANDIDATE_LOCK_SHADOW_IMPORTER_VERSION =
  "g4-a-candidate-lock-v1" as const;

interface LockPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string;
  shotId: string;
  candidateId: string;
  revision: 1;
  recordedAt: Date;
}

interface LockPlans {
  plans: LockPlan[];
  blockers: number;
  issueStorageKey?: string;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateLockShadowImportError(code);
  }
  return value as Record<string, unknown>;
}

function field(
  value: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  return typeof value[key] === "string" && value[key].trim()
    ? value[key] as string
    : fallback;
}

function projectSourceKey(projectId: string): string {
  return `workspace-v1:${projectId}:Project:${projectId}`;
}

function chapterSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:Chapter:${chapterId}`;
}

function shotSourceKey(
  projectId: string,
  chapterId: string,
  shotId: string,
): string {
  return `workspace-v1:${projectId}:Shot:${chapterId}:${shotId}`;
}

function candidateSourceKey(projectId: string, candidateId: string): string {
  return `workspace-v1:${projectId}:Candidate:${candidateId}`;
}

function lockSourceKey(
  projectId: string,
  chapterId: string,
  shotId: string,
): string {
  return `workspace-v1:${projectId}:CandidateLockRevision:${chapterId}:${shotId}:v001`;
}

function stableId(type: string, sourceKey: string): string {
  return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function payload(
  snapshot: VerifiedSnapshot,
  storageKey: string,
): Promise<{
  item: { sha256: `sha256:${string}` };
  value: Record<string, unknown>;
}> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try {
    return {
      item,
      value: object(
        JSON.parse(bytes.toString("utf8")),
        "MIGRATION_SOURCE_JSON_INVALID",
      ),
    };
  } catch (error) {
    if (error instanceof CandidateLockShadowImportError) throw error;
    throw new CandidateLockShadowImportError("MIGRATION_SOURCE_JSON_INVALID");
  }
}

/**
 * Restores only direct Shot.lockedCandidateId evidence as a legacy v1 lock.
 * Candidate status, timestamps, layout data, and row ordering never infer a
 * current decision.
 */
export class CandidateLockShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(
    private readonly prisma: PrismaService,
    ledger?: PrismaMigrationLedgerRepository,
  ) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(
    snapshotPath: string,
    decisionsPath: string,
    options: { runId?: string; startedAt?: string } = {},
  ): Promise<{
    run: MigrationRunRecord;
    report: ComicFormatReport;
    decisions: MigrationDecisionArtifact;
  }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(
      decisionsPath,
      snapshot.sealed.sourceManifestDigest,
    );
    const run = await this.ledger.beginRun({
      kind: "shadow",
      importerVersion: CANDIDATE_LOCK_SHADOW_IMPORTER_VERSION,
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      decisionsDigest: decisions.decisionsDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });

    try {
      const projects: ComicFormatReportProject[] = [];
      let count = 0;
      let blockers = 0;
      const projectItems = snapshot.sourceManifest.items
        .filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey))
        .sort((left, right) => left.storageKey.localeCompare(right.storageKey));

      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payload(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find(
          (entry) => entry.sourceKey === projectSourceKey(legacyProjectId),
        );
        const targetProjectId = stableId(
          "Project",
          projectSourceKey(legacyProjectId),
        );
        const targetProject = await this.prisma.database().project.findUnique({
          where: { id: targetProjectId },
        });
        const result: LockPlans = targetProject
          ? await this.buildPlans(
              snapshot,
              legacyProjectId,
              targetProjectId,
              new Date(run.startedAt),
            )
          : {
              plans: [],
              blockers: 1,
              issueStorageKey: projectItem.storageKey,
            };

        if (targetProject && result.plans.length > 0) {
          await this.ledger.withTransaction(async (tx) => {
            for (const plan of result.plans) {
              await this.importPlan(tx, run.id, plan);
              count += 1;
            }
          });
        }
        blockers += result.blockers;
        const issueKey = !targetProject
          ? `project:${legacyProjectId}:lock-target`
          : result.blockers > 0
            ? `project:${legacyProjectId}:lock-source`
            : null;
        projects.push({
          projectId: legacyProjectId,
          sourceStorageKey: projectItem.storageKey,
          sourceDigest: projectItem.sha256,
          originalComicFormat: {
            kind: mapping.originalValueKind,
            preview: mapping.originalValuePreview,
          },
          mappingKind: mapping.mappingKind,
          targetComicFormat:
            mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null,
          layoutPresetIntent: mapping.layoutPresetIntent,
          issueKey,
          resolutionStatus: issueKey ? "open" : "not_needed",
          importStatus: issueKey ? "blocked" : "imported",
        });
        if (issueKey) {
          await this.ledger.withTransaction((tx) =>
            this.ledger.recordGenericIssueInTransaction(tx, run.id, {
              issueKey,
              code: !targetProject
                ? "MIGRATION_TARGET_NOT_FOUND"
                : "CANDIDATE_LOCK_SOURCE_UNRESOLVED",
              entityType: "CandidateLockRevision",
              entityId: targetProjectId,
              sourceKey: projectSourceKey(legacyProjectId),
              storageKey: result.issueStorageKey ?? projectItem.storageKey,
              detailJson: jsonValue({
                schemaVersion: 1,
                reason: !targetProject
                  ? "Project/Chapter shadow must run first"
                  : "lockedCandidateId candidate/asset/scope/current evidence unresolved",
              }),
            }),
          );
        }
      }

      const report = createComicFormatReport(projects, {
        warningCount: blockers,
        entityCounts: { CandidateLockRevision: count },
      });
      const finished = await this.ledger.finishRun(run.id, {
        status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded",
        reportDigest: report.reportDigest,
        counts: { ...report.summary, candidateLockRevisionCount: count },
        verification: {
          schemaVersion: 1,
          sourceManifestVerified: true,
          snapshotManifestVerified: true,
          candidateLockShadowImported: true,
        },
        finishedAt: new Date().toISOString(),
      });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? String((error as Error & { code: unknown }).code)
        : "MIGRATION_IMPORT_FAILED";
      try {
        await this.ledger.finishRun(run.id, {
          status: "failed",
          errorCode: code,
          finishedAt: new Date().toISOString(),
        });
      } catch {
        // Preserve the original import failure.
      }
      if (
        error instanceof CandidateLockShadowImportError ||
        error instanceof MigrationLedgerError ||
        error instanceof MigrationAuditError
      ) {
        throw error;
      }
      throw new CandidateLockShadowImportError(code);
    }
  }

  private async readDecisions(
    decisionsPath: string,
    expected: `sha256:${string}`,
  ): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) {
      throw new CandidateLockShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    }
    try {
      return normalizeMigrationDecisionArtifact(
        JSON.parse(await readFile(decisionsPath, "utf8")) as unknown,
        expected,
      );
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        throw new CandidateLockShadowImportError(
          String((error as Error & { code: unknown }).code),
        );
      }
      throw new CandidateLockShadowImportError("MIGRATION_DECISION_INVALID");
    }
  }

  private async buildPlans(
    snapshot: VerifiedSnapshot,
    legacyProjectId: string,
    projectId: string,
    recordedAt: Date,
  ): Promise<LockPlans> {
    const plans: LockPlan[] = [];
    let blockers = 0;
    let issueStorageKey: string | undefined;
    const items = snapshot.sourceManifest.items.filter(
      (item) =>
        item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) &&
        item.storageKey.endsWith("/storyboard.json"),
    );

    for (const item of items) {
      const slug = item.storageKey.split("/")[3];
      const chapterItem = snapshot.sourceManifest.items.find(
        (candidate) =>
          candidate.storageKey ===
          `projects/${legacyProjectId}/chapters/${slug}/chapter.json`,
      );
      if (!chapterItem) {
        blockers += 1;
        issueStorageKey = item.storageKey;
        continue;
      }
      const chapterMeta = (await payload(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = field(chapterMeta, "id", slug);
      const chapterId = stableId(
        "Chapter",
        chapterSourceKey(legacyProjectId, legacyChapterId),
      );
      const raw = (await payload(snapshot, item.storageKey)).value;
      const document = object(
        raw.storyboardJson ?? raw,
        "MIGRATION_STORYBOARD_DOCUMENT_INVALID",
      );
      const shots = Array.isArray(document.shots) ? document.shots : [];

      for (const shotValue of shots) {
        const shot = object(
          shotValue,
          "MIGRATION_STORYBOARD_DOCUMENT_INVALID",
        );
        const legacyShotId = field(shot, "id");
        const lockedCandidateId = field(shot, "lockedCandidateId");
        if (!legacyShotId || !lockedCandidateId) continue;

        const shotId = stableId(
          "Shot",
          shotSourceKey(legacyProjectId, legacyChapterId, legacyShotId),
        );
        const candidateId = stableId(
          "Candidate",
          candidateSourceKey(legacyProjectId, lockedCandidateId),
        );
        const db = this.prisma.database();
        const [targetShot, candidate] = await Promise.all([
          db.shot.findUnique({ where: { id: shotId } }),
          db.candidate.findUnique({
            where: { id: candidateId },
            include: { asset: true },
          }),
        ]);
        if (
          !targetShot ||
          !candidate ||
          targetShot.projectId !== projectId ||
          targetShot.chapterId !== chapterId ||
          candidate.projectId !== projectId ||
          candidate.chapterId !== chapterId ||
          candidate.shotId !== shotId ||
          candidate.status !== "generated" ||
          candidate.asset.status !== "ready"
        ) {
          blockers += 1;
          issueStorageKey = item.storageKey;
          continue;
        }

        const existingForCandidate = await db.candidateLockRevision.findFirst({
          where: {
            shotId,
            projectId,
            chapterId,
            candidateId,
            revision: 1,
            action: "lock",
            origin: "legacy_import",
          },
        });
        const existingCount = await db.candidateLockRevision.count({
          where: { shotId, projectId, chapterId },
        });
        if (
          (existingCount > 0 && !existingForCandidate) ||
          (
            targetShot.currentCandidateLockRevisionId !== null &&
            targetShot.currentCandidateLockRevisionId !== existingForCandidate?.id
          )
        ) {
          blockers += 1;
          issueStorageKey = item.storageKey;
          continue;
        }

        const sourceKey = lockSourceKey(
          legacyProjectId,
          legacyChapterId,
          legacyShotId,
        );
        const targetId = existingForCandidate?.id
          ?? stableId("CandidateLockRevision", sourceKey);
        plans.push({
          targetId,
          sourceKey,
          sourceStorageKey: item.storageKey,
          sourceDigest: item.sha256,
          payloadDigest: digestCanonicalJson({
            id: targetId,
            projectId,
            chapterId,
            shotId,
            revision: 1,
            action: "lock",
            candidateId,
            origin: "legacy_import",
            reason: null,
            decidedAt: null,
          }),
          projectId,
          chapterId,
          shotId,
          candidateId,
          revision: 1,
          recordedAt,
        });
      }
    }
    return { plans, blockers, issueStorageKey };
  }

  private async importPlan(
    tx: Prisma.TransactionClient,
    runId: string,
    plan: LockPlan,
  ): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({
      where: { sourceKey: plan.sourceKey },
    });
    if (
      existingSource &&
      (
        existingSource.entityId !== plan.targetId ||
        existingSource.sourceDigest !== plan.sourceDigest ||
        existingSource.payloadDigest !== plan.payloadDigest
      )
    ) {
      throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    }
    const existing = await tx.candidateLockRevision.findUnique({
      where: { id: plan.targetId },
    });
    if (
      existing &&
      (
        existing.projectId !== plan.projectId ||
        existing.chapterId !== plan.chapterId ||
        existing.shotId !== plan.shotId ||
        existing.candidateId !== plan.candidateId ||
        existing.revision !== 1 ||
        existing.action !== "lock" ||
        existing.previousRevisionId !== null ||
        existing.origin !== "legacy_import"
      )
    ) {
      throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    }
    if (!existing) {
      await tx.candidateLockRevision.create({
        data: {
          id: plan.targetId,
          projectId: plan.projectId,
          chapterId: plan.chapterId,
          shotId: plan.shotId,
          revision: 1,
          action: "lock",
          candidateId: plan.candidateId,
          previousRevisionId: null,
          origin: "legacy_import",
          reason: null,
          decidedAt: null,
          recordedAt: plan.recordedAt,
        },
      });
    }
    const shot = await tx.shot.findUnique({ where: { id: plan.shotId } });
    if (!shot) {
      throw new CandidateLockShadowImportError("MIGRATION_TARGET_INCONSISTENT");
    }
    if (shot.currentCandidateLockRevisionId !== plan.targetId) {
      await tx.shot.update({
        where: { id: plan.shotId },
        data: {
          currentCandidateLockRevisionId: plan.targetId,
          updatedAt: plan.recordedAt,
        },
      });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, {
      sourceKey: plan.sourceKey,
      entityType: "CandidateLockRevision",
      entityId: plan.targetId,
      sourceStorageKey: plan.sourceStorageKey,
      sourceDigest: plan.sourceDigest,
      payloadDigest: plan.payloadDigest,
      provenanceStatus: "complete",
    });
  }
}
