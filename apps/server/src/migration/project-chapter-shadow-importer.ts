import { Prisma } from "@prisma/client";
import { encodeScriptTextV1, digestCanonicalJson } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { assertDecisionMatchesIssue, normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact, type MigrationDecisionEntry } from "./migration-decision.js";
import { buildComicFormatIssue } from "./migration-issue.js";
import { mapLegacyComicFormat, type ComicFormatMapping } from "./comic-format-migration.plugin.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaService } from "../persistence/prisma.service.js";

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
const MILESTONE_STATUSES = ["draft", "script_done", "structured", "storyboard_done", "images_done", "layout_done", "exported"] as const;
type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export class ShadowImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface ProjectChapterShadowImportResult {
  run: MigrationRunRecord;
  report: ComicFormatReport;
  decisions: MigrationDecisionArtifact;
  importedProjectIds: string[];
}

interface ChapterPlan {
  legacyId: string;
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  slug: string;
  order: number;
  title: string;
  milestoneStatus: MilestoneStatus;
  scriptWorkingText: string;
  scriptWorkingDigest: `sha256:${string}`;
  scriptWorkingState: "empty" | "dirty";
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectPlan {
  legacyId: string;
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  name: string;
  type: string;
  storyTitle: string | null;
  genreTags: string[];
  comicFormat: "vertical_scroll" | "paged_comic" | null;
  mapping: ComicFormatMapping;
  artStyle: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentLegacyChapterId: string | null;
  chapters: ChapterPlan[];
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShadowImportError(code);
  return value as Record<string, unknown>;
}

function json(bytes: Buffer, code: string): Record<string, unknown> {
  try { return object(JSON.parse(bytes.toString("utf8")), code); } catch (error) {
    if (error instanceof ShadowImportError) throw error;
    throw new ShadowImportError(code);
  }
}

function stringField(value: Record<string, unknown>, key: string, fallback: string): string {
  return typeof value[key] === "string" && value[key].trim() !== "" ? value[key] as string : fallback;
}

function optionalString(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] as string : null;
}

function dateField(value: Record<string, unknown>, key: string): Date {
  const candidate = typeof value[key] === "string" ? new Date(value[key] as string) : new Date(FALLBACK_DATE);
  return Number.isNaN(candidate.getTime()) ? new Date(FALLBACK_DATE) : candidate;
}

function tagsField(value: Record<string, unknown>): string[] {
  if (value.genreTags === undefined) return [];
  if (!Array.isArray(value.genreTags) || value.genreTags.some((item) => typeof item !== "string" || item.trim() === "")) throw new ShadowImportError("MIGRATION_PROJECT_PAYLOAD_INVALID");
  const tags = value.genreTags.map((item) => (item as string).trim());
  if (new Set(tags).size !== tags.length) throw new ShadowImportError("MIGRATION_PROJECT_PAYLOAD_INVALID");
  return tags;
}

function milestone(value: unknown): MilestoneStatus {
  return MILESTONE_STATUSES.includes(value as MilestoneStatus) ? value as MilestoneStatus : "draft";
}

function projectSourceKey(projectId: string): string {
  return `workspace-v1:${projectId}:Project:${projectId}`;
}

function chapterSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:Chapter:${chapterId}`;
}

function sourceDigestForChapter(chapterDigest: `sha256:${string}`, scriptDigest: `sha256:${string}`): `sha256:${string}` {
  return digestCanonicalJson({ chapterJsonDigest: chapterDigest, scriptDigest });
}

async function payloadJson(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  return { item, value: json(bytes, "MIGRATION_SOURCE_JSON_INVALID") };
}

/** M3-A2：只导入 Project/Chapter 的 shadow slice，业务全量实体留在后续切片。 */
export class ProjectChapterShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<ProjectChapterShadowImportResult> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({
      kind: "shadow",
      importerVersion: "g3-m3-a2",
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      decisionsDigest: decisions.decisionsDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });

    try {
      const reportProjects: ComicFormatReportProject[] = [];
      const plans: ProjectPlan[] = [];
      const usedDecisionKeys = new Set<string>();
      const projectItems = snapshot.sourceManifest.items
        .filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey))
        .sort((left, right) => left.storageKey.localeCompare(right.storageKey));

      for (const item of projectItems) {
        const legacyProjectId = item.storageKey.split("/")[1];
        const plan = await this.buildProjectPlan(snapshot, item.storageKey, legacyProjectId);
        const mapping = plan.mapping;
        const issue = buildComicFormatIssue({ runId: run.id, projectId: legacyProjectId, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, mapping, createdAt: run.startedAt });
        let resolvedEntry: MigrationDecisionEntry | null = null;
        if (issue) {
          await this.ledger.recordIssue(issue);
          resolvedEntry = decisions.entries.find((entry) => entry.issueKey === issue.issueKey) ?? null;
          if (resolvedEntry) {
            usedDecisionKeys.add(resolvedEntry.issueKey);
            assertDecisionMatchesIssue(resolvedEntry, issue.issueKey, issue.detailJson);
            await this.ledger.resolveIssue(run.id, issue.issueKey, { decisionSchemaVersion: 1, action: "set_comic_format", chosenComicFormat: resolvedEntry.chosenComicFormat, layoutPresetIntent: resolvedEntry.layoutPresetIntent });
            plan.comicFormat = resolvedEntry.chosenComicFormat;
            plan.payloadDigest = this.projectPayloadDigest(plan);
          }
        }
        const unresolved = issue !== null && resolvedEntry === null;
        reportProjects.push({
          projectId: legacyProjectId,
          sourceStorageKey: item.storageKey,
          sourceDigest: item.sha256,
          originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview },
          mappingKind: mapping.mappingKind,
          targetComicFormat: unresolved ? null : plan.comicFormat,
          layoutPresetIntent: mapping.layoutPresetIntent,
          issueKey: issue?.issueKey ?? null,
          resolutionStatus: issue ? (unresolved ? "open" : "resolved") : "not_needed",
          importStatus: unresolved ? "blocked" : "not_started",
        });
        if (!unresolved && plan.comicFormat) plans.push(plan);
      }
      if (decisions.entries.some((entry) => !usedDecisionKeys.has(entry.issueKey))) throw new ShadowImportError("MIGRATION_DECISION_STALE");

      await this.ledger.withTransaction(async (tx) => {
        for (const plan of plans) await this.importProjectPlan(tx, run.id, plan);
      });

      for (const row of reportProjects) {
        if (row.importStatus === "not_started") row.importStatus = "imported";
      }
      const report = createComicFormatReport(reportProjects, { entityCounts: { Project: plans.length, Chapter: plans.reduce((sum, plan) => sum + plan.chapters.length, 0) } });
      const finished = await this.ledger.finishRun(run.id, {
        status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded",
        reportDigest: report.reportDigest,
        counts: report.summary,
        verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, projectChapterShadowImported: true },
        finishedAt: new Date().toISOString(),
      });
      return { run: finished, report, decisions, importedProjectIds: plans.map((plan) => plan.targetId) };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof ShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new ShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expectedSourceManifestDigest: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new ShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try {
      const value = JSON.parse(await readFile(decisionsPath, "utf8")) as unknown;
      return normalizeMigrationDecisionArtifact(value, expectedSourceManifestDigest);
    } catch (error) {
      if (error instanceof ShadowImportError) throw error;
      if (error instanceof Error && "code" in error) throw new ShadowImportError(String((error as Error & { code: unknown }).code));
      throw new ShadowImportError("MIGRATION_DECISION_INVALID");
    }
  }

  private async buildProjectPlan(snapshot: VerifiedSnapshot, storageKey: string, legacyProjectId: string): Promise<ProjectPlan> {
    const { item, value: metadata } = await payloadJson(snapshot, storageKey);
    if (metadata.id !== undefined && metadata.id !== legacyProjectId) throw new ShadowImportError("MIGRATION_PROJECT_ID_MISMATCH");
    const sourceKey = projectSourceKey(legacyProjectId);
    const targetId = PrismaMigrationLedgerRepository.stableEntityId("Project", sourceKey);
    const mapping = mapLegacyComicFormat(metadata.comicFormat);
    const comicFormat = mapping.targetComicFormat;
    const chapters = await this.buildChapterPlans(snapshot, legacyProjectId, targetId);
    const normalized = { id: targetId, name: stringField(metadata, "name", legacyProjectId), type: stringField(metadata, "type", "comic"), storyTitle: optionalString(metadata, "storyTitle"), genreTags: tagsField(metadata), comicFormat, artStyle: optionalString(metadata, "artStyle"), description: optionalString(metadata, "description"), chapters: chapters.map((chapter) => ({ id: chapter.targetId, slug: chapter.slug, order: chapter.order, title: chapter.title, milestoneStatus: chapter.milestoneStatus, scriptWorkingText: chapter.scriptWorkingText, scriptWorkingDigest: chapter.scriptWorkingDigest, scriptWorkingState: chapter.scriptWorkingState, summary: chapter.summary })) };
    return {
      legacyId: legacyProjectId,
      targetId,
      sourceKey,
      sourceStorageKey: storageKey,
      sourceDigest: item.sha256,
      payloadDigest: digestCanonicalJson(normalized),
      name: normalized.name,
      type: normalized.type,
      storyTitle: normalized.storyTitle,
      genreTags: normalized.genreTags,
      comicFormat,
      mapping,
      artStyle: normalized.artStyle,
      description: normalized.description,
      createdAt: dateField(metadata, "createdAt"),
      updatedAt: dateField(metadata, "updatedAt"),
      currentLegacyChapterId: optionalString(metadata, "currentChapterId"),
      chapters,
    };
  }

  private projectPayloadDigest(plan: ProjectPlan): `sha256:${string}` {
    return digestCanonicalJson({ id: plan.targetId, name: plan.name, type: plan.type, storyTitle: plan.storyTitle, genreTags: plan.genreTags, comicFormat: plan.comicFormat, artStyle: plan.artStyle, description: plan.description, chapters: plan.chapters.map((chapter) => ({ id: chapter.targetId, slug: chapter.slug, order: chapter.order, title: chapter.title, milestoneStatus: chapter.milestoneStatus, scriptWorkingText: chapter.scriptWorkingText, scriptWorkingDigest: chapter.scriptWorkingDigest, scriptWorkingState: chapter.scriptWorkingState, summary: chapter.summary })) });
  }

  private async buildChapterPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string): Promise<ChapterPlan[]> {
    const prefix = `projects/${legacyProjectId}/chapters/`;
    const chapterItems = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(prefix) && item.storageKey.endsWith("/chapter.json")).sort((left, right) => left.storageKey.localeCompare(right.storageKey));
    const plans: ChapterPlan[] = [];
    for (const item of chapterItems) {
      const segments = item.storageKey.split("/");
      const slug = segments[3];
      const { value: metadata } = await payloadJson(snapshot, item.storageKey);
      const legacyId = stringField(metadata, "id", slug);
      const sourceKey = chapterSourceKey(legacyProjectId, legacyId);
      const targetId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", sourceKey);
      const scriptKey = `${prefix}${slug}/script.md`;
      const scriptItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === scriptKey);
      const scriptBytes = scriptItem ? (await snapshot.readPayload(scriptKey)).bytes : Buffer.from(stringField(metadata, "sourceText", ""), "utf8");
      const encoded = encodeScriptTextV1(scriptBytes, { allowEmpty: true });
      const sourceDigest = sourceDigestForChapter(item.sha256, encoded.digest);
      const scriptWorkingState: "empty" | "dirty" = encoded.canonical === "" ? "empty" : "dirty";
      const order = typeof metadata.order === "number" && Number.isInteger(metadata.order) && metadata.order > 0 ? metadata.order : plans.length + 1;
      const normalized = { id: targetId, projectId: targetProjectId, slug, order, title: stringField(metadata, "title", `第 ${order} 章`), milestoneStatus: milestone(metadata.status), scriptWorkingText: encoded.canonical, scriptWorkingDigest: encoded.digest, scriptWorkingState, summary: optionalString(metadata, "summary") };
      plans.push({ legacyId, targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest, payloadDigest: digestCanonicalJson(normalized), slug, order, title: normalized.title, milestoneStatus: normalized.milestoneStatus, scriptWorkingText: normalized.scriptWorkingText, scriptWorkingDigest: normalized.scriptWorkingDigest, scriptWorkingState: normalized.scriptWorkingState, summary: normalized.summary, createdAt: dateField(metadata, "createdAt"), updatedAt: dateField(metadata, "updatedAt") });
    }
    return plans;
  }

  private async importProjectPlan(tx: Prisma.TransactionClient, runId: string, plan: ProjectPlan): Promise<void> {
    const existing = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existing) {
      if (existing.entityId !== plan.targetId || existing.sourceDigest !== plan.sourceDigest) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
      if (existing.sourceStorageKey !== plan.sourceStorageKey) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
      if (existing.payloadDigest !== plan.payloadDigest) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
      if (!await tx.project.findUnique({ where: { id: plan.targetId } })) throw new ShadowImportError("MIGRATION_TARGET_INCONSISTENT");
      return;
    }
    if (!plan.comicFormat) throw new ShadowImportError("MIGRATION_DECISION_REQUIRED");
    await tx.project.create({ data: { id: plan.targetId, name: plan.name, type: plan.type, lifecycleStatus: "active", storyTitle: plan.storyTitle, genreTags: plan.genreTags as Prisma.InputJsonValue, comicFormat: plan.comicFormat, artStyle: plan.artStyle, description: plan.description, createdAt: plan.createdAt, updatedAt: plan.updatedAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "Project", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "partial" });
    const targetByLegacyId = new Map(plan.chapters.map((chapter) => [chapter.legacyId, chapter.targetId]));
    for (const chapter of plan.chapters) {
      await tx.chapter.create({ data: { id: chapter.targetId, projectId: plan.targetId, slug: chapter.slug, order: chapter.order, title: chapter.title, milestoneStatus: chapter.milestoneStatus, scriptWorkingText: chapter.scriptWorkingText, scriptWorkingDigest: chapter.scriptWorkingDigest, scriptWorkingState: chapter.scriptWorkingState, summary: chapter.summary, createdAt: chapter.createdAt, updatedAt: chapter.updatedAt } });
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: chapter.sourceKey, entityType: "Chapter", entityId: chapter.targetId, sourceStorageKey: chapter.sourceStorageKey, sourceDigest: chapter.sourceDigest, payloadDigest: chapter.payloadDigest, provenanceStatus: "partial" });
    }
    const currentChapterId = (plan.currentLegacyChapterId && targetByLegacyId.get(plan.currentLegacyChapterId)) ?? plan.chapters[0]?.targetId ?? null;
    if (currentChapterId) await tx.project.update({ where: { id: plan.targetId }, data: { currentChapterId } });
  }
}
