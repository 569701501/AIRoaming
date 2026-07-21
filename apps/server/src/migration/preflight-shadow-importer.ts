import { Prisma } from "@prisma/client";
import { buildPreflightSourceSnapshot, digestCanonicalJson, encodePreflightDocumentV2, type PreflightDocumentV2, type PreflightSourceSnapshotV1 } from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";

export class PreflightShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

interface PreflightPlan {
  targetId: string;
  sourceKey: string;
  sourceStorageKey: string;
  sourceDigest: `sha256:${string}`;
  payloadDigest: `sha256:${string}`;
  projectId: string;
  chapterId: string;
  version: number;
  sourceStoryboardVersionId: string;
  sourceDigestFromStoryboard: `sha256:${string}`;
  document: PreflightDocumentV2;
  documentDigest: `sha256:${string}`;
  createdAt: Date;
  confirmedAt: Date;
  current: boolean;
}

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";
function object(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new PreflightShadowImportError(code); return value as Record<string, unknown>; }
function field(value: Record<string, unknown>, key: string, fallback = ""): string { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback; }
function optional(value: Record<string, unknown>, key: string): string | null { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : null; }
function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date { const parsed = new Date(field(value, key, fallback)); return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed; }
function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function preflightSourceKey(projectId: string, chapterId: string, version: number): string { return `workspace-v1:${projectId}:PreflightRevision:${chapterId}:v${String(version).padStart(3, "0")}`; }
function characterSourceKey(projectId: string, characterId: string): string { return `workspace-v1:${projectId}:Character:${characterId}`; }
function assetSourceKey(projectId: string, assetId: string): string { return `workspace-v1:${projectId}:Asset:${assetId}`; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function payload(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try { return { item, value: object(JSON.parse(bytes.toString("utf8")), "MIGRATION_SOURCE_JSON_INVALID") }; }
  catch (error) { if (error instanceof PreflightShadowImportError) throw error; throw new PreflightShadowImportError("MIGRATION_SOURCE_JSON_INVALID"); }
}

/** G3-M3-A10：只导入 source snapshot 可验证的 PreflightRevision；旧 V1/ID-only 证据写 blocker。 */
export class PreflightShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a10", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const projects: ComicFormatReportProject[] = [];
      let revisionCount = 0;
      let warningCount = 0;
      const projectItems = snapshot.sourceManifest.items.filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payload(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = stableId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        let plans: PreflightPlan[] = [];
        const blockers: Array<{ issueKey: string; detail: Record<string, unknown>; storageKey: string; sourceDigest: `sha256:${string}`; targetId: string; sourceKey: string }> = [];
        if (!targetProject) {
          blockers.push({ issueKey: `project:${legacyProjectId}:preflight-target`, detail: { schemaVersion: 1, projectId: legacyProjectId, reason: "Project/Chapter shadow must run first" }, storageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, targetId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId) });
        } else {
          const result = await this.buildPlans(snapshot, legacyProjectId, targetProjectId);
          plans = result.plans;
          blockers.push(...result.blockers);
        }
        await this.ledger.withTransaction(async (tx) => {
          for (const blocker of blockers) await this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey: blocker.issueKey, code: blocker.issueKey.endsWith(":preflight-source") ? "PREFLIGHT_SOURCE_UNRESOLVED" : "MIGRATION_TARGET_NOT_FOUND", entityType: "PreflightRevision", entityId: blocker.targetId, sourceKey: blocker.sourceKey, storageKey: blocker.storageKey, detailJson: jsonValue(blocker.detail) });
          for (const plan of plans) { await this.importPlan(tx, run.id, plan); revisionCount += 1; }
        });
        const blocked = blockers.length > 0;
        if (blocked) warningCount += blockers.length;
        projects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey: blockers[0]?.issueKey ?? null, resolutionStatus: blocked ? "open" : "not_needed", importStatus: !targetProject || blocked ? "blocked" : "imported" });
      }
      const report = createComicFormatReport(projects, { warningCount, entityCounts: { PreflightRevision: revisionCount } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, revisionCount }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, preflightShadowImported: true }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof PreflightShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new PreflightShadowImportError(code);
    }
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new PreflightShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); }
    catch (error) { if (error instanceof Error && "code" in error) throw new PreflightShadowImportError(String((error as Error & { code: unknown }).code)); throw new PreflightShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async buildPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string): Promise<{ plans: PreflightPlan[]; blockers: Array<{ issueKey: string; detail: Record<string, unknown>; storageKey: string; sourceDigest: `sha256:${string}`; targetId: string; sourceKey: string }> }> {
    const plans: PreflightPlan[] = [];
    const blockers: Array<{ issueKey: string; detail: Record<string, unknown>; storageKey: string; sourceDigest: `sha256:${string}`; targetId: string; sourceKey: string }> = [];
    const items = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/preflight.json")).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
    for (const item of items) {
      const slug = item.storageKey.split("/")[3];
      const chapterItem = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/chapters/${slug}/chapter.json`);
      if (!chapterItem) continue;
      const chapterMetadata = (await payload(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = field(chapterMetadata, "id", slug);
      const chapterId = stableId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const raw = (await payload(snapshot, item.storageKey)).value;
      const sourceKey = preflightSourceKey(legacyProjectId, legacyChapterId, Number(raw.version) > 0 ? Number(raw.version) : 1);
      const targetId = stableId("PreflightRevision", sourceKey);
      const makeBlocker = (reason: string) => blockers.push({ issueKey: `chapter:${legacyChapterId}:preflight-source`, detail: { schemaVersion: 1, chapterId, reason }, storageKey: item.storageKey, sourceDigest: item.sha256, targetId, sourceKey });
      const source = object(raw.preflightJson ?? raw, "MIGRATION_PREFLIGHT_DOCUMENT_INVALID");
      const board = await this.prisma.database().storyboardVersion.findFirst({ where: { chapterId, status: "confirmed" }, orderBy: { version: "desc" } });
      const chapter = await this.prisma.database().chapter.findUnique({ where: { id: chapterId } });
      if (!board || !chapter || chapter.currentStoryboardVersionId !== board.id) { makeBlocker("current_storyboard_missing"); continue; }
      let sourceWithSnapshot: Record<string, unknown> | null;
      try { sourceWithSnapshot = await this.backfillLegacySourceSnapshot(source, targetProjectId, chapterId, board, legacyProjectId); }
      catch (error) {
        if (error instanceof PreflightShadowImportError || error instanceof TypeError) sourceWithSnapshot = null;
        else throw error;
      }
      if (!sourceWithSnapshot) { makeBlocker("legacy_preflight_source_snapshot_missing"); continue; }
      let normalized: PreflightDocumentV2 | null;
      try { normalized = await this.normalizeDocument(sourceWithSnapshot, targetProjectId, chapterId, board, legacyProjectId); }
      catch (error) { if (error instanceof PreflightShadowImportError) { makeBlocker("preflight_source_invalid"); continue; } throw error; }
      if (!normalized) { makeBlocker("preflight_source_digest_or_visual_mismatch"); continue; }
      if (!normalized.ready) { makeBlocker("legacy_preflight_not_ready"); continue; }
      const version = Number(raw.version) > 0 ? Number(raw.version) : 1;
      let encoded;
      try { encoded = encodePreflightDocumentV2(normalized); }
      catch { makeBlocker("preflight_document_invalid"); continue; }
      const payloadDigest = digestCanonicalJson({ id: targetId, projectId: targetProjectId, chapterId, version, sourceStoryboardVersionId: board.id, sourceDigest: board.documentDigest, documentDigest: encoded.digest, document: encoded.value });
      plans.push({ targetId, sourceKey, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest, projectId: targetProjectId, chapterId, version, sourceStoryboardVersionId: board.id, sourceDigestFromStoryboard: board.documentDigest as `sha256:${string}`, document: encoded.value, documentDigest: encoded.digest, createdAt: dateField(raw, "createdAt", field(chapterMetadata, "createdAt")), confirmedAt: dateField(raw, "confirmedAt", field(raw, "updatedAt", FALLBACK_DATE)), current: true });
    }
    return { plans, blockers };
  }

  /**
   * Legacy workspace exports stored the checks but not the source snapshot.
   * Reconstruct only from the sealed snapshot plus the already-imported target
   * rows; never trust an asset digest or target id supplied by the legacy file.
   */
  private async backfillLegacySourceSnapshot(source: Record<string, unknown>, projectId: string, chapterId: string, board: { id: string; documentDigest: string }, legacyProjectId: string): Promise<Record<string, unknown> | null> {
    if (source.schemaVersion === 2 && source.sourceSnapshot) return source;
    if (source.schemaVersion !== 1 || source.sourceSnapshot || !Array.isArray(source.characterChecks) || !Array.isArray(source.sceneChecks)) return null;
    const project = await this.prisma.database().project.findUnique({ where: { id: projectId } });
    if (!project) return null;
    const style = { comicFormat: project.comicFormat as "vertical_scroll" | "paged_comic", artStyle: project.artStyle?.trim() || "custom" };
    const characters: PreflightSourceSnapshotV1["characters"] = [];
    for (const value of source.characterChecks) {
      const row = object(value, "MIGRATION_PREFLIGHT_CHARACTER_CHECK_INVALID");
      const rawCharacterId = field(row, "characterId");
      if (!rawCharacterId) return null;
      const characterId = rawCharacterId.startsWith("character_") ? rawCharacterId : stableId("Character", characterSourceKey(legacyProjectId, rawCharacterId));
      const character = await this.prisma.database().character.findUnique({ where: { id: characterId } });
      if (!character || typeof row.requiredReference !== "boolean") return null;
      const rawAssetId = optional(row, "referenceAssetId");
      let visualId: string | null = null;
      let assetId: string | null = null;
      let assetSha256: `sha256:${string}` | null = null;
      if (rawAssetId) {
        const asset = await this.resolveAsset(legacyProjectId, rawAssetId);
        if (!asset || asset.status !== "ready" || !asset.sha256) return null;
        const visual = await this.prisma.database().characterVisual.findFirst({ where: { characterId, assetId: asset.id } });
        if (!visual || visual.status !== "available") return null;
        visualId = visual.id;
        assetId = asset.id;
        assetSha256 = asset.sha256 as `sha256:${string}`;
      }
      characters.push({ characterId, required: row.requiredReference, generationInputDigest: digestCanonicalJson({ id: character.id, name: character.name, level: character.level, appearance: character.appearance, personality: character.personality, promptFragment: character.promptFragment, rowVersion: character.rowVersion }), visualId, assetId, assetSha256 });
    }
    const scenes: PreflightSourceSnapshotV1["scenes"] = [];
    for (const value of source.sceneChecks) {
      const row = object(value, "MIGRATION_PREFLIGHT_SCENE_CHECK_INVALID");
      const rawSceneId = field(row, "sceneId");
      if (!rawSceneId) return null;
      const scene = await this.prisma.database().chapterScene.findFirst({ where: { chapterId, OR: [{ id: rawSceneId }, { sceneKey: rawSceneId }] } });
      if (!scene) return null;
      const rawAssetId = optional(row, "referenceAssetId");
      let visualId: string | null = null;
      let assetId: string | null = null;
      let assetSha256: `sha256:${string}` | null = null;
      if (rawAssetId) {
        const asset = await this.resolveAsset(legacyProjectId, rawAssetId);
        if (!asset || asset.status !== "ready" || !asset.sha256) return null;
        const visual = await this.prisma.database().sceneVisual.findFirst({ where: { chapterSceneId: scene.id, assetId: asset.id } });
        if (!visual) return null;
        visualId = visual.id;
        assetId = asset.id;
        assetSha256 = asset.sha256 as `sha256:${string}`;
      }
      scenes.push({ chapterSceneId: scene.id, sceneKey: scene.sceneKey, visualId, assetId, assetSha256 });
    }
    try {
      const sourceSnapshot = buildPreflightSourceSnapshot({ policyVersion: "preflight-source-v1", projectId, chapterId, consumerType: "preflight_revision", storyboard: { id: board.id, digest: board.documentDigest as `sha256:${string}` }, style: { ...style, styleDigest: digestCanonicalJson(style) }, characters, scenes });
      return { ...source, schemaVersion: 2, sourceSnapshot, policyVersion: "preflight-source-v1" };
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
  }

  private async normalizeDocument(source: Record<string, unknown>, projectId: string, chapterId: string, board: { id: string; documentDigest: string }, legacyProjectId: string): Promise<PreflightDocumentV2 | null> {
    const originalSnapshot = object(source.sourceSnapshot, "MIGRATION_PREFLIGHT_SOURCE_INVALID") as unknown as PreflightSourceSnapshotV1;
    if (originalSnapshot.storyboard?.digest !== board.documentDigest) return null;
    const project = await this.prisma.database().project.findUnique({ where: { id: projectId } });
    if (!project) return null;
    const style = object(originalSnapshot.style, "MIGRATION_PREFLIGHT_SOURCE_INVALID");
    const currentArtStyle = project.artStyle?.trim() || "custom";
    if (style.comicFormat !== project.comicFormat || style.artStyle !== currentArtStyle) return null;
    if (style.styleDigest !== digestCanonicalJson({ comicFormat: style.comicFormat, artStyle: style.artStyle })) return null;
    const characters: PreflightSourceSnapshotV1["characters"] = [];
    for (const value of originalSnapshot.characters ?? []) {
      const row = value as Record<string, unknown>;
      const rawCharacterId = field(row, "characterId");
      const characterId = rawCharacterId.startsWith("character_") ? rawCharacterId : stableId("Character", characterSourceKey(legacyProjectId, rawCharacterId));
      const character = await this.prisma.database().character.findUnique({ where: { id: characterId } });
      if (!character) return null;
      if (typeof row.required !== "boolean") return null;
      const rawAssetId = optional(row, "assetId");
      const rawVisualId = optional(row, "visualId");
      let assetId: string | null = null;
      let visualId: string | null = null;
      let assetSha256: `sha256:${string}` | null = null;
      if (rawAssetId || rawVisualId) {
        const asset = await this.resolveAsset(legacyProjectId, rawAssetId);
        if (!asset || asset.status !== "ready" || !asset.sha256) return null;
        assetId = asset.id; assetSha256 = asset.sha256 as `sha256:${string}`;
        const visual = rawVisualId && rawVisualId.startsWith("charactervisual_") ? await this.prisma.database().characterVisual.findUnique({ where: { id: rawVisualId } }) : await this.prisma.database().characterVisual.findFirst({ where: { characterId, assetId: asset.id } });
        if (!visual || visual.characterId !== characterId || visual.assetId !== asset.id || visual.status !== "available") return null;
        visualId = visual.id;
      }
      const generationInputDigest = field(row, "generationInputDigest");
      if (!/^sha256:[0-9a-f]{64}$/.test(generationInputDigest)) return null;
      characters.push({ characterId, required: row.required, generationInputDigest: generationInputDigest as `sha256:${string}`, visualId, assetId, assetSha256 });
    }
    const scenes: PreflightSourceSnapshotV1["scenes"] = [];
    for (const value of originalSnapshot.scenes ?? []) {
      const row = value as Record<string, unknown>;
      const sceneId = field(row, "chapterSceneId");
      const scene = await this.prisma.database().chapterScene.findFirst({ where: { chapterId, OR: [{ id: sceneId }, { sceneKey: field(row, "sceneKey", sceneId) }] } });
      if (!scene) return null;
      const rawAssetId = optional(row, "assetId");
      const rawVisualId = optional(row, "visualId");
      let assetId: string | null = null; let visualId: string | null = null; let assetSha256: `sha256:${string}` | null = null;
      if (rawAssetId || rawVisualId) {
        const asset = await this.resolveAsset(legacyProjectId, rawAssetId);
        if (!asset || asset.status !== "ready" || !asset.sha256) return null;
        assetId = asset.id; assetSha256 = asset.sha256 as `sha256:${string}`;
        const visual = rawVisualId && rawVisualId.startsWith("scenevisual_") ? await this.prisma.database().sceneVisual.findUnique({ where: { id: rawVisualId } }) : await this.prisma.database().sceneVisual.findFirst({ where: { chapterSceneId: scene.id, assetId: asset.id } });
        if (!visual || visual.chapterSceneId !== scene.id || visual.assetId !== asset.id) return null;
        visualId = visual.id;
      }
      scenes.push({ chapterSceneId: scene.id, sceneKey: field(row, "sceneKey", scene.sceneKey), visualId, assetId, assetSha256 });
    }
    if (!Array.isArray(source.characterChecks) || !Array.isArray(source.sceneChecks) || !Array.isArray(source.issues)) return null;
    const shotCount = Number(source.shotCount);
    if (!Number.isInteger(shotCount) || shotCount < 0) return null;
    const sourceSnapshot = { schemaVersion: 1 as const, policyVersion: "preflight-source-v1" as const, projectId, chapterId, consumerType: "preflight_revision" as const, storyboard: { id: board.id, digest: board.documentDigest as `sha256:${string}` }, style: { comicFormat: project.comicFormat as "vertical_scroll" | "paged_comic", artStyle: currentArtStyle, styleDigest: digestCanonicalJson({ comicFormat: project.comicFormat, artStyle: currentArtStyle }) }, characters, scenes };
    const characterChecks = Array.isArray(source.characterChecks) ? source.characterChecks.map((value) => {
      const row = object(value, "MIGRATION_PREFLIGHT_CHARACTER_CHECK_INVALID");
      const rawCharacterId = field(row, "characterId");
      return { ...row, characterId: rawCharacterId.startsWith("character_") ? rawCharacterId : stableId("Character", characterSourceKey(legacyProjectId, rawCharacterId)) };
    }) as PreflightDocumentV2["characterChecks"] : [];
    const sceneChecks = Array.isArray(source.sceneChecks) ? (await Promise.all(source.sceneChecks.map(async (value) => {
      const row = object(value, "MIGRATION_PREFLIGHT_SCENE_CHECK_INVALID");
      const rawSceneId = field(row, "sceneId");
      const scene = await this.prisma.database().chapterScene.findFirst({ where: { chapterId, OR: [{ id: rawSceneId }, { sceneKey: rawSceneId }] } });
      if (!scene) throw new PreflightShadowImportError("MIGRATION_PREFLIGHT_SCENE_CHECK_INVALID");
      return { ...row, sceneId: scene.id };
    }))) as PreflightDocumentV2["sceneChecks"] : [];
    return { schemaVersion: 2, chapterId, sourceSnapshot, shotCount, characterChecks, sceneChecks, styleCheck: source.styleCheck as PreflightDocumentV2["styleCheck"], issues: source.issues as PreflightDocumentV2["issues"], ready: source.ready === true, notes: typeof source.notes === "string" ? source.notes : "", policyVersion: "preflight-source-v1" };
  }

  private async resolveAsset(legacyProjectId: string, rawAssetId: string | null) {
    if (!rawAssetId) return null;
    const direct = await this.prisma.database().asset.findUnique({ where: { id: rawAssetId } });
    if (direct) return direct;
    return this.prisma.database().asset.findUnique({ where: { id: stableId("Asset", assetSourceKey(legacyProjectId, rawAssetId)) } });
  }

  private async importPlan(tx: Prisma.TransactionClient, runId: string, plan: PreflightPlan): Promise<void> {
    const existingSource = await tx.importedEntitySource.findUnique({ where: { sourceKey: plan.sourceKey } });
    if (existingSource && (existingSource.entityId !== plan.targetId || existingSource.sourceDigest !== plan.sourceDigest || existingSource.payloadDigest !== plan.payloadDigest)) throw new MigrationLedgerError("MIGRATION_SOURCE_CONFLICT");
    const existing = await tx.preflightRevision.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.chapterId !== plan.chapterId || existing.sourceStoryboardVersionId !== plan.sourceStoryboardVersionId || existing.sourceDigest !== plan.sourceDigestFromStoryboard || existing.documentDigest !== plan.documentDigest)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.preflightRevision.create({ data: { id: plan.targetId, projectId: plan.projectId, chapterId: plan.chapterId, version: plan.version, status: "confirmed", sourceStoryboardVersionId: plan.sourceStoryboardVersionId, sourcePolicyVersion: "preflight-source-v1", sourceDigest: plan.sourceDigestFromStoryboard, documentJson: jsonValue(plan.document), schemaVersion: 2, documentDigest: plan.documentDigest, ready: true, createdAt: plan.createdAt, confirmedAt: plan.confirmedAt } });
    const chapter = await tx.chapter.findUnique({ where: { id: plan.chapterId } });
    if (!chapter) throw new PreflightShadowImportError("MIGRATION_TARGET_INCONSISTENT");
    if (chapter.currentPreflightRevisionId !== plan.targetId) await tx.chapter.update({ where: { id: chapter.id }, data: { currentPreflightRevisionId: plan.targetId, rowVersion: { increment: 1 } } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "PreflightRevision", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
  }
}
