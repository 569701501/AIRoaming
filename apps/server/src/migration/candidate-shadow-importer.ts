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

export class CandidateShadowImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const CANDIDATE_SHADOW_IMPORTER_VERSION =
  "g4-a-candidate-v1" as const;

interface CandidatePlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string;
  shotId: string;
  taskId: string;
  assetId: string;
  index: number;
  status: "generated" | "rejected" | "superseded";
  favoriteAt: Date | null;
  label: string;
  notes: string;
  promptDigest: `sha256:${string}` | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CandidatePlans {
  plans: CandidatePlan[];
  blockers: number;
  warnings: number;
}

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateShadowImportError(code);
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

function dateField(
  value: Record<string, unknown>,
  key: string,
  fallback = FALLBACK_DATE,
): Date {
  const parsed = new Date(field(value, key, fallback));
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

function directDateField(
  value: Record<string, unknown>,
  key: string,
): Date | null {
  if (typeof value[key] !== "string" || value[key].trim() === "") return null;
  const parsed = new Date(value[key]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function projectSourceKey(projectId: string): string {
  return `workspace-v1:${projectId}:Project:${projectId}`;
}

function chapterSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:Chapter:${chapterId}`;
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
    if (error instanceof CandidateShadowImportError) throw error;
    throw new CandidateShadowImportError("MIGRATION_SOURCE_JSON_INVALID");
  }
}

/**
 * Imports legacy Candidate history without treating selected/locked status as
 * current-final authority. selected becomes a favorite preference only.
 */
export class CandidateShadowImporter {
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
      importerVersion: CANDIDATE_SHADOW_IMPORTER_VERSION,
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      decisionsDigest: decisions.decisionsDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });

    try {
      const projects: ComicFormatReportProject[] = [];
      let count = 0;
      let warningCount = 0;
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
        const result = targetProject
          ? await this.buildPlans(
              snapshot,
              legacyProjectId,
              targetProjectId,
              new Date(run.startedAt),
            )
          : { plans: [], blockers: 0, warnings: 0 };

        if (targetProject && result.plans.length > 0) {
          await this.ledger.withTransaction(async (tx) => {
            for (const plan of result.plans) {
              await this.importPlan(tx, run.id, plan);
              count += 1;
            }
          });
        }

        const blocked = !targetProject || result.blockers > 0;
        warningCount += result.blockers + result.warnings;
        const issueKey = !targetProject
          ? `project:${legacyProjectId}:candidate-target`
          : result.blockers > 0
            ? `project:${legacyProjectId}:candidate-source`
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
          importStatus: blocked ? "blocked" : "imported",
        });

        if (!targetProject) {
          await this.ledger.withTransaction((tx) =>
            this.ledger.recordGenericIssueInTransaction(tx, run.id, {
              issueKey: issueKey!,
              code: "MIGRATION_TARGET_NOT_FOUND",
              entityType: "Candidate",
              entityId: targetProjectId,
              sourceKey: projectSourceKey(legacyProjectId),
              storageKey: projectItem.storageKey,
              detailJson: jsonValue({
                schemaVersion: 1,
                reason: "Project/Chapter shadow must run first",
              }),
            }),
          );
        } else if (result.blockers > 0) {
          await this.ledger.withTransaction((tx) =>
            this.ledger.recordGenericIssueInTransaction(tx, run.id, {
              issueKey: issueKey!,
              code: "CANDIDATE_SOURCE_UNRESOLVED",
              entityType: "Candidate",
              entityId: targetProjectId,
              sourceKey: projectSourceKey(legacyProjectId),
              storageKey: `projects/${legacyProjectId}/chapters`,
              detailJson: jsonValue({
                schemaVersion: 1,
                reason: "shot/task/asset scope missing",
              }),
            }),
          );
        }
      }

      const report = createComicFormatReport(projects, {
        warningCount,
        entityCounts: { Candidate: count },
      });
      const finished = await this.ledger.finishRun(run.id, {
        status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded",
        reportDigest: report.reportDigest,
        counts: { ...report.summary, candidateCount: count },
        verification: {
          schemaVersion: 1,
          sourceManifestVerified: true,
          snapshotManifestVerified: true,
          candidateShadowImported: true,
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
        error instanceof CandidateShadowImportError ||
        error instanceof MigrationLedgerError ||
        error instanceof MigrationAuditError
      ) {
        throw error;
      }
      throw new CandidateShadowImportError(code);
    }
  }

  private async readDecisions(
    decisionsPath: string,
    expected: `sha256:${string}`,
  ): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) {
      throw new CandidateShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    }
    try {
      return normalizeMigrationDecisionArtifact(
        JSON.parse(await readFile(decisionsPath, "utf8")) as unknown,
        expected,
      );
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        throw new CandidateShadowImportError(
          String((error as Error & { code: unknown }).code),
        );
      }
      throw new CandidateShadowImportError("MIGRATION_DECISION_INVALID");
    }
  }

  private async buildPlans(
    snapshot: VerifiedSnapshot,
    legacyProjectId: string,
    projectId: string,
    recordedAt: Date,
  ): Promise<CandidatePlans> {
    const plans: CandidatePlan[] = [];
    let blockers = 0;
    let warnings = 0;
    const items = snapshot.sourceManifest.items.filter(
      (item) =>
        item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) &&
        item.storageKey.endsWith("/candidates.json"),
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
        continue;
      }
      const chapterMeta = (await payload(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = field(chapterMeta, "id", slug);
      const chapterId = stableId(
        "Chapter",
        chapterSourceKey(legacyProjectId, legacyChapterId),
      );
      const raw = (await payload(snapshot, item.storageKey)).value;
      const entries = Array.isArray(raw.candidates) ? raw.candidates : [];

      for (const candidateValue of entries) {
        const row = object(candidateValue, "MIGRATION_CANDIDATE_INVALID");
        const legacyId = field(row, "id");
        const sourceKey = `workspace-v1:${legacyProjectId}:Candidate:${legacyId}`;
        const targetId = stableId("Candidate", sourceKey);
        const shotLegacyId = field(row, "shotId");
        const taskLegacyId = field(row, "taskId");
        const assetLegacyId = field(row, "assetId");
        const shotId = stableId(
          "Shot",
          `workspace-v1:${legacyProjectId}:Shot:${legacyChapterId}:${shotLegacyId}`,
        );
        const taskId = stableId(
          "GenerationTask",
          `workspace-v1:${legacyProjectId}:GenerationTask:${taskLegacyId}`,
        );
        const assetId = stableId(
          "Asset",
          `workspace-v1:${legacyProjectId}:Asset:${assetLegacyId}`,
        );
        const db = this.prisma.database();
        const [shot, task, asset] = await Promise.all([
          db.shot.findUnique({ where: { id: shotId } }),
          db.generationTask.findUnique({ where: { id: taskId } }),
          db.asset.findUnique({ where: { id: assetId } }),
        ]);
        if (
          !legacyId ||
          !shot ||
          !task ||
          !asset ||
          shot.projectId !== projectId ||
          shot.chapterId !== chapterId ||
          task.projectId !== projectId ||
          task.chapterId !== chapterId ||
          asset.projectId !== projectId ||
          asset.chapterId !== chapterId
        ) {
          blockers += 1;
          continue;
        }

        const rawStatus = field(row, "status", "generated");
        const status = rawStatus === "rejected" || rawStatus === "superseded"
          ? rawStatus
          : "generated";
        let favoriteAt: Date | null = null;
        if (rawStatus === "selected") {
          favoriteAt = directDateField(row, "updatedAt")
            ?? directDateField(row, "createdAt")
            ?? recordedAt;
          if (
            directDateField(row, "updatedAt") === null &&
            directDateField(row, "createdAt") === null
          ) {
            warnings += 1;
          }
        }

        const rawDigest = field(row, "promptDigest");
        const promptDigest = /^sha256:[0-9a-f]{64}$/.test(rawDigest)
          ? rawDigest as `sha256:${string}`
          : null;
        const index = Number(row.index);
        if (!Number.isInteger(index) || index < 1) {
          blockers += 1;
          continue;
        }

        const planPayload = {
          id: targetId,
          projectId,
          chapterId,
          shotId,
          taskId,
          assetId,
          index,
          status,
          favoriteAt: favoriteAt?.toISOString() ?? null,
          generationPurpose: "legacy_unspecified",
          promptDigest,
        };
        plans.push({
          targetId,
          sourceKey,
          sourceStorageKey: item.storageKey,
          sourceDigest: item.sha256,
          payloadDigest: digestCanonicalJson(planPayload),
          projectId,
          chapterId,
          shotId,
          taskId,
          assetId,
          index,
          status,
          favoriteAt,
          label: field(row, "label", `候选 ${index}`),
          notes: field(row, "notes"),
          promptDigest,
          createdAt: dateField(row, "createdAt"),
          updatedAt: dateField(
            row,
            "updatedAt",
            dateField(row, "createdAt").toISOString(),
          ),
        });
      }
    }
    return { plans, blockers, warnings };
  }

  private async importPlan(
    tx: Prisma.TransactionClient,
    runId: string,
    plan: CandidatePlan,
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
    const existing = await tx.candidate.findUnique({
      where: { id: plan.targetId },
    });
    if (
      existing &&
      (
        existing.assetId !== plan.assetId ||
        existing.shotId !== plan.shotId ||
        existing.taskId !== plan.taskId
      )
    ) {
      throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    }
    if (!existing) {
      await tx.candidate.create({
        data: {
          id: plan.targetId,
          projectId: plan.projectId,
          chapterId: plan.chapterId,
          shotId: plan.shotId,
          taskId: plan.taskId,
          assetId: plan.assetId,
          index: plan.index,
          status: plan.status,
          favoriteAt: plan.favoriteAt,
          label: plan.label,
          notes: plan.notes,
          promptDigest: plan.promptDigest,
          generationPurpose: "legacy_unspecified",
          generationSpecVersion: null,
          generationSpecDigest: null,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
        },
      });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, {
      sourceKey: plan.sourceKey,
      entityType: "Candidate",
      entityId: plan.targetId,
      sourceStorageKey: plan.sourceStorageKey,
      sourceDigest: plan.sourceDigest,
      payloadDigest: plan.payloadDigest,
      provenanceStatus: "complete",
    });
  }
}
