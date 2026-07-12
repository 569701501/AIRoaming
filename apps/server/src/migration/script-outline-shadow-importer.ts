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
const VERSION_PATTERN = /\/script\.versions\/script-v(\d+)\.md$/;

export class ScriptOutlineShadowImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface OutlinePlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  contentDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  version: 1;
  status: "draft" | "confirmed";
  title: string;
  sourceText: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
}

interface ScriptVersionPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  contentDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  chapterId: string;
  version: number;
  sourceText: string;
  origin: "import";
  createdAt: Date;
  completedAt: Date | null;
  legacyVersionId: string;
  current: boolean;
}

interface ChapterHistoryPlan {
  chapterId: string;
  versions: ScriptVersionPlan[];
  pointerFallback: boolean;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ScriptOutlineShadowImportError(code);
  return value as Record<string, unknown>;
}

function parseJson(bytes: Buffer, code: string): Record<string, unknown> {
  try { return object(JSON.parse(bytes.toString("utf8")), code); } catch (error) {
    if (error instanceof ScriptOutlineShadowImportError) throw error;
    throw new ScriptOutlineShadowImportError(code);
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

function normalizeText(value: string): string {
  if (value.includes("\0")) throw new ScriptOutlineShadowImportError("MIGRATION_OUTLINE_PAYLOAD_INVALID");
  return value.replace(/\r\n?/g, "\n");
}

function projectSourceKey(projectId: string): string {
  return `workspace-v1:${projectId}:Project:${projectId}`;
}

function chapterSourceKey(projectId: string, chapterId: string): string {
  return `workspace-v1:${projectId}:Chapter:${chapterId}`;
}

function outlineSourceKey(projectId: string): string {
  return `workspace-v1:${projectId}:ProjectScriptOutline:script-outline-v001`;
}

function scriptVersionSourceKey(projectId: string, chapterId: string, version: number): string {
  return `workspace-v1:${projectId}:ChapterScriptVersion:${chapterId}:v${String(version).padStart(3, "0")}`;
}

async function payloadJson(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  return { item, value: parseJson(bytes, "MIGRATION_SOURCE_JSON_INVALID") };
}

function sourceTextDigest(value: string): `sha256:${string}` {
  return encodeScriptTextV1(value, { allowEmpty: true }).digest;
}

/** M3-A3：在已存在 Project/Chapter shadow 的基础上导入 Outline 与不可变 ScriptVersion。 */
export class ScriptOutlineShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({
      kind: "shadow",
      importerVersion: "g3-m3-a3",
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      decisionsDigest: decisions.decisionsDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });

    try {
      const reportProjects: ComicFormatReportProject[] = [];
      let outlineCount = 0;
      let versionCount = 0;
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
        const targetComicFormat = mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null;
        const targetProjectId = PrismaMigrationLedgerRepository.stableEntityId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const unresolvedDecision = mapping.mappingKind === "decision_required" && !decision;
        const blocked = !targetProject || unresolvedDecision;
        if (!blocked) {
          const outline = await this.buildOutlinePlan(snapshot, legacyProjectId, targetProjectId, metadata);
          const histories = await this.buildScriptPlans(snapshot, legacyProjectId);
          const warningForProject = histories.reduce((sum, history) => sum + (history.pointerFallback ? 1 : 0), 0);
          warningCount += warningForProject;
          await this.ledger.withTransaction(async (tx) => {
            if (outline) {
              await this.importOutline(tx, run.id, outline);
              if (targetProject.currentScriptOutlineId !== outline.targetId) await tx.project.update({ where: { id: targetProjectId }, data: { currentScriptOutlineId: outline.targetId } });
              outlineCount += 1;
            }
            for (const history of histories) {
              await this.importChapterHistory(tx, run.id, history);
              versionCount += history.versions.length;
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
          targetComicFormat,
          layoutPresetIntent: mapping.layoutPresetIntent,
          issueKey: mapping.issueCode ? `project:${legacyProjectId}:comic-format` : null,
          resolutionStatus: mapping.mappingKind === "decision_required" ? (decision ? "resolved" : "open") : "not_needed",
          importStatus: blocked ? "blocked" : "imported",
        });
      }

      const report = createComicFormatReport(reportProjects, { warningCount, entityCounts: { Project: importedProjectCount, ProjectScriptOutline: outlineCount, ChapterScriptVersion: versionCount } });
      const finished = await this.ledger.finishRun(run.id, {
        status: report.summary.unresolvedBlockerCount > 0 || reportProjects.some((project) => project.importStatus === "blocked") ? "blocked" : "succeeded",
        reportDigest: report.reportDigest,
        counts: { ...report.summary, outlineCount, versionCount },
        verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, scriptOutlineShadowImported: true },
        finishedAt: new Date().toISOString(),
      });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof ScriptOutlineShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new ScriptOutlineShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expectedSourceManifestDigest: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new ScriptOutlineShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try {
      const value = JSON.parse(await readFile(decisionsPath, "utf8")) as unknown;
      return normalizeMigrationDecisionArtifact(value, expectedSourceManifestDigest);
    } catch (error) {
      if (error instanceof Error && "code" in error) throw new ScriptOutlineShadowImportError(String((error as Error & { code: unknown }).code));
      throw new ScriptOutlineShadowImportError("MIGRATION_DECISION_INVALID");
    }
  }

  private async buildOutlinePlan(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string, projectMetadata: Record<string, unknown>): Promise<OutlinePlan | null> {
    const markdownKey = `projects/${legacyProjectId}/script-outline.md`;
    const metadataKey = `projects/${legacyProjectId}/script-outline.json`;
    const markdownItem = snapshot.sourceManifest.items.find((item) => item.storageKey === markdownKey);
    const metadataItem = snapshot.sourceManifest.items.find((item) => item.storageKey === metadataKey);
    if (!markdownItem && metadataItem) throw new ScriptOutlineShadowImportError("MIGRATION_OUTLINE_SOURCE_MISSING");
    if (!markdownItem) return null;
    const markdown = normalizeText((await snapshot.readPayload(markdownKey)).bytes.toString("utf8"));
    if (!markdown.trim()) throw new ScriptOutlineShadowImportError("MIGRATION_OUTLINE_PAYLOAD_INVALID");
    const metadata = metadataItem ? (await payloadJson(snapshot, metadataKey)).value : {};
    const statusValue = metadata.status === undefined ? "draft" : metadata.status;
    if (statusValue !== "draft" && statusValue !== "confirmed") throw new ScriptOutlineShadowImportError("MIGRATION_OUTLINE_PAYLOAD_INVALID");
    const confirmedAt = statusValue === "confirmed" ? dateField(metadata, "confirmedAt", stringField(projectMetadata, "updatedAt", FALLBACK_DATE)) : null;
    if (statusValue === "confirmed" && !metadata.confirmedAt) throw new ScriptOutlineShadowImportError("MIGRATION_OUTLINE_PAYLOAD_INVALID");
    const sourceKey = outlineSourceKey(legacyProjectId);
    const targetId = PrismaMigrationLedgerRepository.stableEntityId("ProjectScriptOutline", sourceKey);
    const createdAt = dateField(metadata, "createdAt", stringField(projectMetadata, "createdAt", FALLBACK_DATE));
    const updatedAt = dateField(metadata, "updatedAt", stringField(projectMetadata, "updatedAt", FALLBACK_DATE));
    const title = stringField(metadata, "title", markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "未命名剧本大纲");
    const sourceDigest = digestCanonicalJson({ markdownDigest: markdownItem.sha256, metadataDigest: metadataItem?.sha256 ?? null });
    const payload = { id: targetId, projectId: targetProjectId, version: 1, status: statusValue, title, sourceText: markdown, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(), confirmedAt: confirmedAt?.toISOString() ?? null };
    return { targetId, sourceKey, sourceStorageKey: markdownKey, sourceDigest, contentDigest: sourceTextDigest(markdown), payloadDigest: digestCanonicalJson(payload), projectId: targetProjectId, version: 1, status: statusValue, title, sourceText: markdown, createdAt, updatedAt, confirmedAt };
  }

  private async buildScriptPlans(snapshot: VerifiedSnapshot, legacyProjectId: string): Promise<ChapterHistoryPlan[]> {
    const chapterItems = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/chapter.json"));
    const byVersionPath = snapshot.sourceManifest.items.filter((item) => VERSION_PATTERN.test(item.storageKey)).sort((left, right) => left.storageKey.localeCompare(right.storageKey));
    const grouped = new Map<string, ScriptVersionPlan[]>();
    const metadataByChapterTarget = new Map<string, Record<string, unknown>>();
    for (const item of byVersionPath) {
      const match = item.storageKey.match(VERSION_PATTERN);
      if (!match) continue;
      const parts = item.storageKey.split("/");
      const slug = parts[3];
      const chapterItem = chapterItems.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/chapters/${slug}/chapter.json`);
      if (!chapterItem) throw new ScriptOutlineShadowImportError("MIGRATION_CHAPTER_SOURCE_MISSING");
      const chapterMetadata = (await payloadJson(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = stringField(chapterMetadata, "id", slug);
      const chapterTargetId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      metadataByChapterTarget.set(chapterTargetId, chapterMetadata);
      const version = Number(match[1]);
      const encoded = encodeScriptTextV1((await snapshot.readPayload(item.storageKey)).bytes, { allowEmpty: false });
      const sourceKey = scriptVersionSourceKey(legacyProjectId, legacyChapterId, version);
      const targetId = PrismaMigrationLedgerRepository.stableEntityId("ChapterScriptVersion", sourceKey);
      const legacyVersionId = `${legacyChapterId}_script_v${String(version).padStart(3, "0")}`;
      const updatedAt = dateField(chapterMetadata, "updatedAt");
      const createdAt = dateField(chapterMetadata, "createdAt", updatedAt.toISOString());
      const completedAt = stringField(chapterMetadata, "status", "draft") === "draft" ? null : dateField(chapterMetadata, "completedAt", updatedAt.toISOString());
      const payload = { id: targetId, chapterId: chapterTargetId, version, sourceText: encoded.canonical, sourceDigest: encoded.digest, origin: "import", createdAt: createdAt.toISOString(), completedAt: completedAt?.toISOString() ?? null };
      const plan: ScriptVersionPlan = { targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, contentDigest: encoded.digest, payloadDigest: digestCanonicalJson(payload), chapterId: chapterTargetId, version, sourceText: encoded.canonical, origin: "import", createdAt, completedAt, legacyVersionId, current: false };
      const list = grouped.get(chapterTargetId) ?? [];
      list.push(plan);
      grouped.set(chapterTargetId, list);
    }
    const result: ChapterHistoryPlan[] = [];
    for (const [chapterId, versions] of grouped) {
      versions.sort((left, right) => left.version - right.version);
      const metadata = metadataByChapterTarget.get(chapterId) ?? {};
      const currentVersionId = optionalString(metadata, "currentScriptVersionId");
      const selected = versions.find((version) => version.legacyVersionId === currentVersionId) ?? versions[versions.length - 1];
      const pointerFallback = !currentVersionId || !versions.some((version) => version.legacyVersionId === currentVersionId);
      for (const version of versions) version.current = selected?.targetId === version.targetId;
      result.push({ chapterId, versions, pointerFallback });
    }
    return result;
  }

  private async importOutline(tx: Prisma.TransactionClient, runId: string, plan: OutlinePlan): Promise<void> {
    const existing = await tx.projectScriptOutline.findUnique({ where: { id: plan.targetId } });
    if (existing) {
      if (existing.projectId !== plan.projectId || existing.version !== plan.version || existing.status !== plan.status || existing.title !== plan.title || existing.sourceText !== plan.sourceText || existing.sourceDigest !== plan.contentDigest || existing.confirmedAt?.toISOString() !== plan.confirmedAt?.toISOString()) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    } else {
      await tx.projectScriptOutline.create({ data: { id: plan.targetId, projectId: plan.projectId, version: plan.version, status: plan.status, title: plan.title, sourceText: plan.sourceText, sourceDigest: plan.contentDigest, createdAt: plan.createdAt, updatedAt: plan.updatedAt, confirmedAt: plan.confirmedAt } });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ProjectScriptOutline", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
  }

  private async importChapterHistory(tx: Prisma.TransactionClient, runId: string, history: ChapterHistoryPlan): Promise<void> {
    const current = history.versions.find((version) => version.current);
    for (const plan of history.versions) {
      const existing = await tx.chapterScriptVersion.findUnique({ where: { id: plan.targetId } });
      if (existing) {
        if (existing.chapterId !== plan.chapterId || existing.version !== plan.version || existing.sourceDigest !== plan.contentDigest || existing.sourceText !== plan.sourceText) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
      } else {
        await tx.chapterScriptVersion.create({ data: { id: plan.targetId, chapterId: plan.chapterId, version: plan.version, sourceText: plan.sourceText, sourceDigest: plan.contentDigest, origin: plan.origin, createdAt: plan.createdAt, completedAt: plan.completedAt } });
      }
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "ChapterScriptVersion", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
    }
    if (!current) return;
    const chapter = await tx.chapter.findUnique({ where: { id: history.chapterId } });
    if (!chapter) throw new ScriptOutlineShadowImportError("MIGRATION_TARGET_INCONSISTENT");
    const state = chapter.scriptWorkingText !== "" && chapter.scriptWorkingDigest === current.contentDigest ? "clean" : "dirty";
    if (chapter.currentScriptVersionId !== current.targetId || chapter.scriptWorkingState !== state) {
      await tx.chapter.update({ where: { id: history.chapterId }, data: { currentScriptVersionId: current.targetId, scriptWorkingState: state, rowVersion: { increment: 1 } } });
    }
  }
}
