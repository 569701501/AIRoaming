import { Prisma } from "@prisma/client";
import {
  digestCanonicalJson,
  encodeStoryDocumentV2,
  type StoryDocumentV2,
} from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as storyNormalize from "../projects/story-normalize.util.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaService } from "../persistence/prisma.service.js";

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
const STORY_SOURCE_POLICY = "story-source-v1";

export class StoryShadowImportError extends Error {
  constructor(readonly code: string) { super(code); }
}

interface StoryPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string;
  version: number;
  sourceScriptVersionId: string | null;
  sourcePolicyVersion: string | null;
  sourceDigestFromScript: string | null;
  document: StoryDocumentV2;
  documentDigest: `sha256:${string}`;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date;
  sourceResolved: boolean;
  sourceReason: string | null;
  legacyChapterId: string;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StoryShadowImportError(code);
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string, fallback: string): string {
  return typeof value[key] === "string" && value[key].trim() !== "" ? value[key] as string : fallback;
}

function optionalString(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key].trim() !== "" ? value[key] as string : null;
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

function storySourceKey(projectId: string, chapterId: string, version: number): string {
  return `workspace-v1:${projectId}:StoryVersion:${chapterId}:v${String(version).padStart(3, "0")}`;
}

function sceneSourceKey(projectId: string, chapterId: string, version: number, sceneId: string): string {
  return `workspace-v1:${projectId}:StorySceneProjection:${chapterId}:v${String(version).padStart(3, "0")}:${sceneId}`;
}

function beatSourceKey(projectId: string, chapterId: string, version: number, beatId: string): string {
  return `workspace-v1:${projectId}:StoryBeatProjection:${chapterId}:v${String(version).padStart(3, "0")}:${beatId}`;
}

function chapterSceneSourceKey(projectId: string, chapterId: string, sceneId: string): string {
  return `workspace-v1:${projectId}:ChapterScene:${chapterId}:${sceneId}`;
}

function parseJson(bytes: Buffer, code: string): Record<string, unknown> {
  try { return object(JSON.parse(bytes.toString("utf8")), code); }
  catch (error) {
    if (error instanceof StoryShadowImportError) throw error;
    throw new StoryShadowImportError(code);
  }
}

function legacyDocument(raw: Record<string, unknown>, chapterId: string, chapterTitle: string): StoryDocumentV2 {
  const normalized = storyNormalize.normalizeStoryStructureJson(raw.structureJson ?? raw, chapterId, chapterTitle);
  const characters = normalized.characters.map((character) => {
    if (!character.projectCharacterId) throw new StoryShadowImportError("MIGRATION_STORY_CHARACTER_UNRESOLVED");
    return {
      id: character.id,
      projectCharacterId: character.projectCharacterId,
      name: character.name,
      role: character.role,
      level: character.level ?? "chapter",
      entityType: character.entityType ?? "human",
      motivation: character.motivation,
      relationship: character.relationship,
      visualTraits: character.visualTraits,
      notes: character.notes,
    };
  });
  const scenes = normalized.scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    atmosphere: scene.atmosphere,
    purpose: scene.purpose,
  }));
  const beats = [...normalized.beats]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((beat, index) => ({
      id: beat.id,
      order: index + 1,
      title: beat.title,
      summary: beat.summary,
      conflict: beat.conflict,
      characters: beat.characters,
      sceneId: beat.sceneId,
      visualFocus: beat.visualFocus,
      outcome: beat.outcome,
    }));
  try {
    return encodeStoryDocumentV2({ schemaVersion: 2, chapterId, synopsis: normalized.synopsis, direction: normalized.direction, characters, scenes, beats, notes: normalized.notes }).value;
  } catch (error) {
    if (error instanceof StoryShadowImportError) throw error;
    throw new StoryShadowImportError("MIGRATION_STORY_DOCUMENT_INVALID");
  }
}

async function payloadJson(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  return { item, value: parseJson(bytes, "MIGRATION_SOURCE_JSON_INVALID") };
}

/** G3-M3-A5：将 structure.json 导入为 confirmed StoryVersion 与 Scene/Beat 投影。 */
export class StoryShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({
      kind: "shadow",
      importerVersion: "g3-m3-a5",
      sourceManifestDigest: snapshot.sourceManifest.manifestDigest,
      snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest,
      decisionsDigest: decisions.decisionsDigest,
      id: options.runId,
      startedAt: options.startedAt,
    });

    try {
      const reportProjects: ComicFormatReportProject[] = [];
      let storyCount = 0;
      let sceneCount = 0;
      let beatCount = 0;
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
        const targetFormat = mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null;
        const plans = targetProject ? await this.buildProjectPlans(snapshot, legacyProjectId, targetProjectId) : [];
        const blockedByTarget = !targetProject;
        const staleStories: StoryPlan[] = [];
        for (const plan of plans) {
          if (!plan.sourceResolved) continue;
          const chapter = await this.prisma.database().chapter.findUnique({ where: { id: plan.chapterId }, select: { currentScriptVersionId: true } });
          if (chapter?.currentScriptVersionId !== plan.sourceScriptVersionId) staleStories.push(plan);
        }
        const unresolvedStories = plans.filter((plan) => !plan.sourceResolved);
        const blockerStories = [...unresolvedStories, ...staleStories.filter((plan) => !unresolvedStories.some((item) => item.targetId === plan.targetId))];
        if (blockerStories.length > 0) warningCount += blockerStories.length;
        if (!blockedByTarget) {
          await this.ledger.withTransaction(async (tx) => {
            for (const plan of plans) {
              await this.importPlan(tx, run.id, plan);
              if (plan.sourceResolved) {
                storyCount += 1;
                sceneCount += plan.document.scenes.length;
                beatCount += plan.document.beats.length;
              }
            }
          });
        }
        const issuePlan = blockerStories[0];
        const blockedBySource = blockerStories.length > 0;
        const issueKey = blockedByTarget
          ? `project:${legacyProjectId}:story-target`
          : issuePlan ? `chapter:${issuePlan.legacyChapterId}:story-source` : null;
        reportProjects.push({
          projectId: legacyProjectId,
          sourceStorageKey: projectItem.storageKey,
          sourceDigest: projectItem.sha256,
          originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview },
          mappingKind: mapping.mappingKind,
          targetComicFormat: targetFormat,
          layoutPresetIntent: mapping.layoutPresetIntent,
          issueKey,
          resolutionStatus: issueKey ? "open" : "not_needed",
          importStatus: blockedByTarget || blockedBySource ? "blocked" : "imported",
        });
        if (blockedByTarget) {
          await this.ledger.withTransaction(async (tx) => {
            await this.ledger.recordGenericIssueInTransaction(tx, run.id, {
              issueKey: issueKey!,
              code: "MIGRATION_TARGET_NOT_FOUND",
              entityType: "Project",
              entityId: targetProjectId,
              sourceKey: projectSourceKey(legacyProjectId),
              storageKey: projectItem.storageKey,
              detailJson: { schemaVersion: 1, projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, reason: "Project/Chapter shadow must run first" },
            });
          });
        }
      }

      const report = createComicFormatReport(reportProjects, { warningCount, entityCounts: { StoryVersion: storyCount, StorySceneProjection: sceneCount, StoryBeatProjection: beatCount } });
      const finished = await this.ledger.finishRun(run.id, {
        status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded",
        reportDigest: report.reportDigest,
        counts: { ...report.summary, storyCount, sceneCount, beatCount },
        verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, storyShadowImported: true },
        finishedAt: new Date().toISOString(),
      });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof StoryShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new StoryShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expectedSourceManifestDigest: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new StoryShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try {
      const value = JSON.parse(await readFile(decisionsPath, "utf8")) as unknown;
      return normalizeMigrationDecisionArtifact(value, expectedSourceManifestDigest);
    } catch (error) {
      if (error instanceof Error && "code" in error) throw new StoryShadowImportError(String((error as Error & { code: unknown }).code));
      throw new StoryShadowImportError("MIGRATION_DECISION_INVALID");
    }
  }

  private async buildProjectPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string): Promise<StoryPlan[]> {
    const chapterPrefix = `projects/${legacyProjectId}/chapters/`;
    const structureItems = snapshot.sourceManifest.items
      .filter((item) => item.storageKey.startsWith(chapterPrefix) && item.storageKey.endsWith("/structure.json"))
      .sort((left, right) => left.storageKey.localeCompare(right.storageKey));
    const plans: StoryPlan[] = [];
    for (const structureItem of structureItems) {
      const parts = structureItem.storageKey.split("/");
      const slug = parts[3];
      const chapterItem = snapshot.sourceManifest.items.find((item) => item.storageKey === `${chapterPrefix}${slug}/chapter.json`);
      if (!chapterItem) throw new StoryShadowImportError("MIGRATION_CHAPTER_SOURCE_MISSING");
      const chapterMetadata = (await payloadJson(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = stringField(chapterMetadata, "id", slug);
      const chapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const raw = (await payloadJson(snapshot, structureItem.storageKey)).value;
      const structure = object(raw.structureJson ?? raw, "MIGRATION_STORY_DOCUMENT_INVALID");
      const versionValue = raw.version ?? structure.version;
      const version = typeof versionValue === "number" && Number.isInteger(versionValue) && versionValue > 0 ? versionValue : 1;
      const document = legacyDocument(structure, chapterId, stringField(chapterMetadata, "title", slug));
      const sourceLegacyId = optionalString(raw, "sourceScriptVersionId") ?? optionalString(structure, "sourceScriptVersionId");
      const explicitVersion = sourceLegacyId?.match(/_script_v(\d+)$/)?.[1];
      const sourceVersion = sourceLegacyId
        ? await this.prisma.database().chapterScriptVersion.findFirst({ where: { chapterId, OR: [{ id: sourceLegacyId }, ...(explicitVersion ? [{ version: Number(explicitVersion) }] : [])] } })
        : null;
      const sourceResolved = sourceVersion !== null;
      const sourceReason = sourceResolved ? null : sourceLegacyId ? "source_script_version_not_found" : "source_script_version_id_missing";
      const encoded = encodeStoryDocumentV2(document);
      const sourceKey = storySourceKey(legacyProjectId, legacyChapterId, version);
      const targetId = PrismaMigrationLedgerRepository.stableEntityId("StoryVersion", sourceKey);
      const createdAt = dateField(raw, "createdAt", stringField(chapterMetadata, "createdAt", FALLBACK_DATE));
      const updatedAt = dateField(raw, "updatedAt", stringField(chapterMetadata, "updatedAt", FALLBACK_DATE));
      const confirmedAt = dateField(raw, "confirmedAt", updatedAt.toISOString());
      const payload = { id: targetId, projectId: targetProjectId, chapterId, version, status: "confirmed", sourceScriptVersionId: sourceVersion?.id ?? null, sourcePolicyVersion: sourceResolved ? STORY_SOURCE_POLICY : null, sourceDigest: sourceVersion?.sourceDigest ?? null, documentJson: encoded.value, schemaVersion: 2, documentDigest: encoded.digest, origin: "legacy_import", createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(), confirmedAt: confirmedAt.toISOString() };
      plans.push({ targetId, sourceKey, sourceStorageKey: structureItem.storageKey, sourceDigest: structureItem.sha256, payloadDigest: digestCanonicalJson(payload), projectId: targetProjectId, chapterId, version, sourceScriptVersionId: sourceVersion?.id ?? null, sourcePolicyVersion: sourceResolved ? STORY_SOURCE_POLICY : null, sourceDigestFromScript: sourceVersion?.sourceDigest ?? null, document: encoded.value, documentDigest: encoded.digest, createdAt, updatedAt, confirmedAt, sourceResolved, sourceReason, legacyChapterId });
    }
    return plans;
  }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: StoryPlan): Promise<void> {
    if (!plan.sourceResolved) {
      await this.ledger.recordGenericIssueInTransaction(tx, runId, {
        issueKey: `chapter:${plan.legacyChapterId}:story-source`,
        code: "STORY_SOURCE_UNRESOLVED",
        entityType: "StoryVersion",
        entityId: plan.targetId,
        sourceKey: plan.sourceKey,
        storageKey: plan.sourceStorageKey,
        detailJson: { schemaVersion: 1, chapterId: plan.chapterId, sourceScriptVersionId: plan.sourceScriptVersionId, reason: plan.sourceReason },
      });
      return;
    }
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.storyVersion.findUnique({ where: { id: plan.targetId } });
    if (existing) {
      if (existing.documentDigest !== plan.documentDigest || existing.version !== plan.version || existing.chapterId !== plan.chapterId || existing.sourceScriptVersionId !== plan.sourceScriptVersionId || existing.sourceDigest !== plan.sourceDigestFromScript) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    } else {
      await tx.storyVersion.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, version: plan.version, status: "pending_confirmation", sourceScriptVersionId: plan.sourceScriptVersionId, sourcePolicyVersion: plan.sourcePolicyVersion, sourceDigest: plan.sourceDigestFromScript, documentJson: plan.document as unknown as Prisma.InputJsonValue, schemaVersion: 2, documentDigest: plan.documentDigest, origin: "legacy_import", rowVersion: 0, createdAt: plan.createdAt } });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "StoryVersion", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: plan.sourceResolved ? "complete" : "partial" });
    const sceneIds = new Map<string, string>();
    for (const [index, scene] of plan.document.scenes.entries()) {
      const sceneSource = chapterSceneSourceKey(plan.projectId, plan.chapterId, scene.id);
      const chapterSceneId = PrismaMigrationLedgerRepository.stableEntityId("ChapterScene", sceneSource);
      const chapterScene = await tx.chapterScene.findUnique({ where: { id: chapterSceneId } }) ?? await tx.chapterScene.create({ data: { id: chapterSceneId, projectId: plan.projectId, chapterId: plan.chapterId, sceneKey: scene.id } });
      if (chapterScene.projectId !== plan.projectId || chapterScene.chapterId !== plan.chapterId || chapterScene.sceneKey !== scene.id) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
      sceneIds.set(scene.id, chapterScene.id);
      const projectionSource = sceneSourceKey(plan.projectId, plan.legacyChapterId, plan.version, scene.id);
      const projectionId = PrismaMigrationLedgerRepository.stableEntityId("StorySceneProjection", projectionSource);
      const projection = await tx.storySceneProjection.findUnique({ where: { id: projectionId } });
      if (projection && (projection.storyVersionId !== plan.targetId || projection.sceneKey !== scene.id || projection.order !== index + 1 || projection.name !== scene.name)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
      if (!projection) await tx.storySceneProjection.create({ data: { id: projectionId, storyVersionId: plan.targetId, chapterSceneId: chapterScene.id, sceneKey: scene.id, order: index + 1, name: scene.name, semanticDigest: digestCanonicalJson(scene) } });
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: projectionSource, entityType: "StorySceneProjection", entityId: projectionId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: digestCanonicalJson(scene), provenanceStatus: "complete" });
    }
    for (const beat of plan.document.beats) {
      const projectionSource = beatSourceKey(plan.projectId, plan.legacyChapterId, plan.version, beat.id);
      const projectionId = PrismaMigrationLedgerRepository.stableEntityId("StoryBeatProjection", projectionSource);
      const chapterSceneId = beat.sceneId ? sceneIds.get(beat.sceneId) ?? null : null;
      const projection = await tx.storyBeatProjection.findUnique({ where: { id: projectionId } });
      if (projection && (projection.storyVersionId !== plan.targetId || projection.beatKey !== beat.id || projection.order !== beat.order || projection.summary !== beat.summary)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
      if (!projection) await tx.storyBeatProjection.create({ data: { id: projectionId, storyVersionId: plan.targetId, beatKey: beat.id, order: beat.order, chapterSceneId, summary: beat.summary, semanticDigest: digestCanonicalJson(beat) } });
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: projectionSource, entityType: "StoryBeatProjection", entityId: projectionId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: digestCanonicalJson(beat), provenanceStatus: "complete" });
    }
    const chapter = await tx.chapter.findUnique({ where: { id: plan.chapterId } });
    if (!chapter) throw new StoryShadowImportError("MIGRATION_TARGET_INCONSISTENT");
    const currentVersion = await tx.storyVersion.findUnique({ where: { id: plan.targetId } });
    if (currentVersion?.status === "pending_confirmation" && chapter.pendingStoryVersionId !== plan.targetId) {
      await tx.chapter.update({ where: { id: chapter.id }, data: { pendingStoryVersionId: plan.targetId, rowVersion: { increment: 1 } } });
    }
    if (plan.sourceResolved && currentVersion?.status === "pending_confirmation") {
      const confirmed = await tx.storyVersion.updateMany({ where: { id: plan.targetId, status: "pending_confirmation" }, data: { status: "confirmed", confirmedAt: plan.confirmedAt, rowVersion: { increment: 1 } } });
      const afterConfirm = await tx.storyVersion.findUnique({ where: { id: plan.targetId } });
      if (confirmed.count !== 1 && afterConfirm?.status !== "confirmed") throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    }
    const chapterAfterVersion = await tx.chapter.findUnique({ where: { id: plan.chapterId } });
    if (plan.sourceResolved && chapterAfterVersion?.currentScriptVersionId === plan.sourceScriptVersionId && chapterAfterVersion.currentStoryVersionId !== plan.targetId && (await tx.storyVersion.findUnique({ where: { id: plan.targetId } }))?.status === "confirmed") {
      await tx.chapter.update({ where: { id: plan.chapterId }, data: { currentStoryVersionId: plan.targetId, pendingStoryVersionId: null, milestoneStatus: "structured", rowVersion: { increment: 1 } } });
    } else if (!plan.sourceResolved || chapter.currentScriptVersionId !== plan.sourceScriptVersionId) {
      await this.ledger.recordGenericIssueInTransaction(tx, runId, { issueKey: `chapter:${plan.legacyChapterId}:story-source`, code: "STORY_SOURCE_UNRESOLVED", entityType: "StoryVersion", entityId: plan.targetId, sourceKey: plan.sourceKey, storageKey: plan.sourceStorageKey, detailJson: { schemaVersion: 1, chapterId: plan.chapterId, sourceScriptVersionId: plan.sourceScriptVersionId, reason: plan.sourceReason ?? "source_script_version_not_current" } });
    }
  }
}
