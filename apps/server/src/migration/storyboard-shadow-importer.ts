import { Prisma } from "@prisma/client";
import { digestCanonicalJson, encodeStoryboardDocumentV2, type StoryboardDocumentV2 } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as storyNormalize from "../projects/story-normalize.util.js";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { LegacyCharacterReferenceError, resolveLegacyCharacterTokens, type LegacyCharacterCandidate } from "./legacy-character-reference.js";

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
const BOARD_SOURCE_POLICY = "storyboard-source-v1";

export class StoryboardShadowImportError extends Error {
  constructor(readonly code: string) { super(code); }
}

interface BoardPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string;
  version: number;
  sourceStoryVersionId: string;
  sourceDigestFromStory: string;
  document: StoryboardDocumentV2;
  documentDigest: `sha256:${string}`;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date;
  shots: Array<{ targetId: string; sourceKey: string; legacyId: string; characterIds: string[] }>;
  legacyChapterId: string;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StoryboardShadowImportError(code);
  return value as Record<string, unknown>;
}
function stringField(value: Record<string, unknown>, key: string, fallback: string): string { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback; }
function optionalString(value: Record<string, unknown>, key: string): string | null { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : null; }
function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date { const candidate = typeof value[key] === "string" ? new Date(value[key] as string) : new Date(fallback); return Number.isNaN(candidate.getTime()) ? new Date(fallback) : candidate; }
function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function boardSourceKey(projectId: string, chapterId: string, version: number): string { return `workspace-v1:${projectId}:StoryboardVersion:${chapterId}:v${String(version).padStart(3, "0")}`; }
function shotSourceKey(projectId: string, chapterId: string, shotId: string): string { return `workspace-v1:${projectId}:Shot:${chapterId}:${shotId}`; }
function projectionSourceKey(projectId: string, chapterId: string, version: number, shotId: string): string { return `workspace-v1:${projectId}:StoryboardShotProjection:${chapterId}:v${String(version).padStart(3, "0")}:${shotId}`; }
function parseJson(bytes: Buffer, code: string): Record<string, unknown> { try { return object(JSON.parse(bytes.toString("utf8")), code); } catch (error) { if (error instanceof StoryboardShadowImportError) throw error; throw new StoryboardShadowImportError(code); } }
async function payloadJson(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> { const { item, bytes } = await snapshot.readPayload(storageKey); return { item, value: parseJson(bytes, "MIGRATION_SOURCE_JSON_INVALID") }; }

function legacyCharacterCandidates(value: Record<string, unknown>, projectId: string): LegacyCharacterCandidate[] {
  const input = Array.isArray(value.characters) ? value.characters : [];
  return input.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))).map((entry, index) => {
    const sourceId = stringField(entry, "id", `char_${String(index + 1).padStart(3, "0")}`);
    const targetId = PrismaMigrationLedgerRepository.stableEntityId("Character", `workspace-v1:${projectId}:Character:${sourceId}`);
    return { sourceId, exactName: stringField(entry, "name", `角色 ${index + 1}`), targetId };
  });
}

function resolveStoryboardCharacterIds(tokens: readonly string[], candidates: readonly LegacyCharacterCandidate[]): string[] {
  try {
    return resolveLegacyCharacterTokens(tokens, candidates).map((resolution) => resolution.targetId);
  } catch (error) {
    if (error instanceof LegacyCharacterReferenceError) {
      throw new StoryboardShadowImportError(error.kind === "ambiguous" ? "MIGRATION_STORYBOARD_CHARACTER_AMBIGUOUS" : "MIGRATION_STORYBOARD_CHARACTER_UNRESOLVED");
    }
    throw error;
  }
}

/** G3-M3-A6：将 storyboard.json 导入为 confirmed StoryboardVersion 与 Shot 投影。 */
export class StoryboardShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a6", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const reportProjects: ComicFormatReportProject[] = [];
      let boardCount = 0; let shotCount = 0; let projectionCount = 0; let storyboardShotCharacterCount = 0; let warningCount = 0;
      const projectItems = snapshot.sourceManifest.items.filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payloadJson(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = PrismaMigrationLedgerRepository.stableEntityId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const plans = targetProject ? await this.buildPlans(snapshot, legacyProjectId, targetProjectId) : [];
        const blockers = plans.filter((plan) => !plan.sourceStoryVersionId);
        warningCount += blockers.length;
        if (targetProject) await this.ledger.withTransaction(async (tx) => { for (const plan of plans) { await this.importPlan(tx, run.id, plan); if (plan.sourceStoryVersionId) { boardCount += 1; shotCount += plan.document.shots.length; projectionCount += plan.document.shots.length; storyboardShotCharacterCount += plan.document.shots.reduce((sum, shot) => sum + shot.characterIds.length, 0); } } });
        const issuePlan = blockers[0];
        const blocked = !targetProject || blockers.length > 0;
        const issueKey = !targetProject ? `project:${legacyProjectId}:storyboard-target` : issuePlan ? `chapter:${issuePlan.legacyChapterId}:storyboard-source` : null;
        reportProjects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey, resolutionStatus: issueKey ? "open" : "not_needed", importStatus: blocked ? "blocked" : "imported" });
        if (!targetProject) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey: issueKey!, code: "MIGRATION_TARGET_NOT_FOUND", entityType: "Project", entityId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId), storageKey: projectItem.storageKey, detailJson: { schemaVersion: 1, projectId: legacyProjectId, reason: "Project/Chapter shadow must run first" } }));
      }
      const report = createComicFormatReport(reportProjects, { warningCount, entityCounts: { StoryboardVersion: boardCount, Shot: shotCount, StoryboardShotProjection: projectionCount, StoryboardShotCharacter: storyboardShotCharacterCount } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, boardCount, shotCount, projectionCount, storyboardShotCharacterCount }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, storyboardShadowImported: true }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof StoryboardShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new StoryboardShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expectedSourceManifestDigest: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new StoryboardShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expectedSourceManifestDigest); }
    catch (error) { if (error instanceof Error && "code" in error) throw new StoryboardShadowImportError(String((error as Error & { code: unknown }).code)); throw new StoryboardShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string): Promise<BoardPlan[]> {
    const prefix = `projects/${legacyProjectId}/chapters/`;
    const items = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(prefix) && item.storageKey.endsWith("/storyboard.json")).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
    const plans: BoardPlan[] = [];
    for (const item of items) {
      const slug = item.storageKey.split("/")[3];
      const chapterItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `${prefix}${slug}/chapter.json`);
      if (!chapterItem) throw new StoryboardShadowImportError("MIGRATION_CHAPTER_SOURCE_MISSING");
      const chapterMetadata = (await payloadJson(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = stringField(chapterMetadata, "id", slug);
      const chapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const chapter = await this.prisma.database().chapter.findUnique({ where: { id: chapterId }, include: { currentStoryVersion: true } });
      const raw = (await payloadJson(snapshot, item.storageKey)).value;
      const sourceLegacy = optionalString(raw, "sourceStoryVersionId") ?? optionalString(object(raw.storyboardJson ?? raw, "MIGRATION_STORYBOARD_DOCUMENT_INVALID"), "sourceStoryVersionId");
      const sourceStory = chapter?.currentStoryVersion && (!sourceLegacy || sourceLegacy === chapter.currentStoryVersion.id || sourceLegacy.endsWith(`_story_v${String(chapter.currentStoryVersion.version).padStart(3, "0")}`)) ? chapter.currentStoryVersion : null;
      if (!sourceStory) { plans.push({ targetId: PrismaMigrationLedgerRepository.stableEntityId("StoryboardVersion", boardSourceKey(legacyProjectId, legacyChapterId, Number(raw.version) || 1)), sourceKey: boardSourceKey(legacyProjectId, legacyChapterId, Number(raw.version) || 1), sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson(raw), projectId: targetProjectId, chapterId, version: Number(raw.version) || 1, sourceStoryVersionId: "", sourceDigestFromStory: "", document: { schemaVersion: 2, chapterId, shots: [], notes: "" }, documentDigest: digestCanonicalJson({ schemaVersion: 2, chapterId, shots: [], notes: "" }), createdAt: dateField(raw, "createdAt"), updatedAt: dateField(raw, "updatedAt"), confirmedAt: dateField(raw, "confirmedAt", dateField(raw, "updatedAt").toISOString()), shots: [], legacyChapterId }); continue; }
      const normalized = storyNormalize.normalizeStoryboardJson(raw.storyboardJson ?? raw, chapterId, stringField(chapterMetadata, "title", slug));
      const orderedShots = [...normalized.shots].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const hasCharacterTokens = orderedShots.some((shot) => shot.characterIds.length > 0);
      const characterItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/shared/characters.json`);
      const characterCandidates = hasCharacterTokens
        ? characterItem ? legacyCharacterCandidates((await payloadJson(snapshot, characterItem.storageKey)).value, legacyProjectId) : []
        : [];
      if (hasCharacterTokens && characterCandidates.length === 0) throw new StoryboardShadowImportError("MIGRATION_STORYBOARD_CHARACTER_UNRESOLVED");
      const shotPlans = orderedShots.map((shot, index) => ({ legacyId: shot.id, sourceKey: shotSourceKey(legacyProjectId, legacyChapterId, shot.id), targetId: PrismaMigrationLedgerRepository.stableEntityId("Shot", shotSourceKey(legacyProjectId, legacyChapterId, shot.id)), order: index + 1, characterIds: resolveStoryboardCharacterIds(shot.characterIds, characterCandidates) }));
      const shots = orderedShots.map((shot, index) => ({ ...shot, id: shotPlans[index]!.targetId, order: index + 1, characterIds: shotPlans[index]!.characterIds }));
      const encoded = encodeStoryboardDocumentV2({ schemaVersion: 2, chapterId, shots: shots.map(({ lockedCandidateId: _lock, status: _status, ...shot }) => shot), notes: normalized.notes });
      const version = typeof raw.version === "number" && Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1;
      const sourceKey = boardSourceKey(legacyProjectId, legacyChapterId, version); const targetId = PrismaMigrationLedgerRepository.stableEntityId("StoryboardVersion", sourceKey);
      const createdAt = dateField(raw, "createdAt", chapterMetadata.createdAt as string ?? FALLBACK_DATE); const updatedAt = dateField(raw, "updatedAt", chapterMetadata.updatedAt as string ?? FALLBACK_DATE); const confirmedAt = dateField(raw, "confirmedAt", updatedAt.toISOString());
      const payload = { id: targetId, projectId: targetProjectId, chapterId, version, sourceStoryVersionId: sourceStory.id, sourcePolicyVersion: BOARD_SOURCE_POLICY, sourceDigest: sourceStory.documentDigest, documentJson: encoded.value, schemaVersion: 2, documentDigest: encoded.digest, origin: "legacy_import", createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(), confirmedAt: confirmedAt.toISOString() };
      plans.push({ targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson(payload), projectId: targetProjectId, chapterId, version, sourceStoryVersionId: sourceStory.id, sourceDigestFromStory: sourceStory.documentDigest, document: encoded.value, documentDigest: encoded.digest, createdAt, updatedAt, confirmedAt, shots: shotPlans.map(({ targetId: shotTargetId, sourceKey: shotSource, legacyId, characterIds }) => ({ targetId: shotTargetId, sourceKey: shotSource, legacyId, characterIds })), legacyChapterId });
    }
    return plans;
  }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: BoardPlan): Promise<void> {
    if (!plan.sourceStoryVersionId) { await this.ledger.recordGenericIssueInTransaction(tx, runId, { issueKey: `chapter:${plan.legacyChapterId}:storyboard-source`, code: "STORYBOARD_SOURCE_UNRESOLVED", entityType: "StoryboardVersion", entityId: plan.targetId, sourceKey: plan.sourceKey, storageKey: plan.sourceStorageKey, detailJson: { schemaVersion: 1, chapterId: plan.chapterId, reason: "current_story_version_missing_or_stale" } }); return; }
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.storyboardVersion.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.documentDigest !== plan.documentDigest || existing.sourceStoryVersionId !== plan.sourceStoryVersionId || existing.sourceDigest !== plan.sourceDigestFromStory)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.storyboardVersion.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, version: plan.version, status: "pending_confirmation", sourceStoryVersionId: plan.sourceStoryVersionId, sourcePolicyVersion: BOARD_SOURCE_POLICY, sourceDigest: plan.sourceDigestFromStory, documentJson: plan.document as unknown as Prisma.InputJsonValue, schemaVersion: 2, documentDigest: plan.documentDigest, origin: "legacy_import", rowVersion: 0, createdAt: plan.createdAt } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "StoryboardVersion", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
    for (const shot of plan.shots) {
      const existingShot = await tx.shot.findUnique({ where: { id: shot.targetId } });
      if (!existingShot) await tx.shot.create({ data: { id: shot.targetId, projectId: plan.projectId, chapterId: plan.chapterId, lifecycleStatus: "active" } });
      else if (existingShot.projectId !== plan.projectId || existingShot.chapterId !== plan.chapterId) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    }
    for (const shot of plan.document.shots) {
      const legacyShotId = plan.shots.find((item) => item.targetId === shot.id)?.legacyId ?? shot.id;
      const projectionSource = projectionSourceKey(plan.projectId, plan.legacyChapterId, plan.version, legacyShotId);
      const projectionId = PrismaMigrationLedgerRepository.stableEntityId("StoryboardShotProjection", projectionSource);
      const scene = shot.sceneId ? await tx.chapterScene.findFirst({ where: { chapterId: plan.chapterId, sceneKey: shot.sceneId } }) : null;
      const beat = shot.beatId ? await tx.storyBeatProjection.findFirst({ where: { storyVersionId: plan.sourceStoryVersionId, beatKey: shot.beatId } }) : null;
      if (shot.sceneId && !scene || shot.beatId && !beat) throw new StoryboardShadowImportError("MIGRATION_STORYBOARD_REFERENCE_UNRESOLVED");
      const targetShotId = shot.id;
      const projection = await tx.storyboardShotProjection.findUnique({ where: { id: projectionId } });
      const semanticDigest = digestCanonicalJson(shot);
      if (projection && (projection.storyboardVersionId !== plan.targetId || projection.shotId !== targetShotId || projection.order !== shot.order || projection.storyBeatProjectionId !== (beat?.id ?? null) || projection.chapterSceneId !== (scene?.id ?? null) || projection.semanticDigest !== semanticDigest)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
      if (!projection) await tx.storyboardShotProjection.create({ data: { id: projectionId, storyboardVersionId: plan.targetId, shotId: targetShotId, order: shot.order, storyBeatProjectionId: beat?.id ?? null, chapterSceneId: scene?.id ?? null, semanticDigest } });
      for (const [index, characterId] of shot.characterIds.entries()) {
        const character = await tx.character.findUnique({ where: { id: characterId } });
        if (!character || character.projectId !== plan.projectId) throw new StoryboardShadowImportError("MIGRATION_STORYBOARD_CHARACTER_TARGET_MISSING");
        const relationId = PrismaMigrationLedgerRepository.stableEntityId("StoryboardShotCharacter", `${projectionId}:character:${String(index + 1).padStart(3, "0")}`);
        const existingRelation = await tx.storyboardShotCharacter.findUnique({ where: { id: relationId } })
          ?? await tx.storyboardShotCharacter.findFirst({ where: { storyboardShotProjectionId: projectionId, order: index + 1 } });
        if (existingRelation && (existingRelation.storyboardShotProjectionId !== projectionId || existingRelation.order !== index + 1 || existingRelation.sourceToken !== characterId || existingRelation.characterId !== characterId)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
        if (!existingRelation) await tx.storyboardShotCharacter.create({ data: { id: relationId, storyboardShotProjectionId: projectionId, order: index + 1, sourceToken: characterId, characterId } });
      }
      await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: projectionSource, entityType: "StoryboardShotProjection", entityId: projectionId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: semanticDigest, provenanceStatus: "complete" });
    }
    const chapter = await tx.chapter.findUnique({ where: { id: plan.chapterId } }); if (!chapter) throw new StoryboardShadowImportError("MIGRATION_TARGET_INCONSISTENT");
    const current = await tx.storyboardVersion.findUnique({ where: { id: plan.targetId } });
    if (current?.status === "pending_confirmation" && chapter.pendingStoryboardVersionId !== plan.targetId) await tx.chapter.update({ where: { id: plan.chapterId }, data: { pendingStoryboardVersionId: plan.targetId, rowVersion: { increment: 1 } } });
    if (current?.status === "pending_confirmation") { const result = await tx.storyboardVersion.updateMany({ where: { id: plan.targetId, status: "pending_confirmation" }, data: { status: "confirmed", confirmedAt: plan.confirmedAt, rowVersion: { increment: 1 } } }); if (result.count !== 1) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT"); }
    await tx.chapter.updateMany({ where: { id: plan.chapterId, currentStoryVersionId: plan.sourceStoryVersionId, pendingStoryboardVersionId: plan.targetId }, data: { currentStoryboardVersionId: plan.targetId, pendingStoryboardVersionId: null, milestoneStatus: "storyboard_done", rowVersion: { increment: 1 } } });
  }
}
