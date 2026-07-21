import { Prisma } from "@prisma/client";
import { digestCanonicalJson } from "@airoaming/shared";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { readImageDimensions, type ImageDimensions } from "../projects/image-dimensions.util.js";
import { MigrationAuditError, readVerifiedSnapshot, type VerifiedSnapshot } from "./migration-audit.service.js";
import { normalizeMigrationDecisionArtifact, type MigrationDecisionArtifact } from "./migration-decision.js";
import { MigrationLedgerError, type MigrationRunRecord } from "./migration-ledger.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { createComicFormatReport, type ComicFormatReport, type ComicFormatReportProject } from "./migration-report.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { PrismaService } from "../persistence/prisma.service.js";

export class AssetVisualShadowImportError extends Error { constructor(readonly code: string) { super(code); } }

interface RawAsset { legacyId: string; chapterLegacyId: string | null; type: string; path: string; raw: Record<string, unknown>; }
interface PhysicalAsset extends RawAsset { legacyProjectId: string; targetId: string; projectId: string; chapterId: string | null; storageKey: string; sourceStorageKey: string; sourceDigest: `sha256:${string}`; bytes: Buffer; sha256: `sha256:${string}`; mimeType: string; dimensions: ImageDimensions | null; }
interface CharacterVisualPlan { targetId: string; sourceKey: string; characterId: string; assetId: string; kind: "preview_front" | "final_reference"; version: number; sourceStorageKey: string; sourceDigest: `sha256:${string}`; payloadDigest: `sha256:${string}`; createdAt: Date; confirmedAt: Date | null; }
interface SceneVisualPlan { targetId: string; sourceKey: string; chapterSceneId: string; assetId: string; version: number; sourceStorageKey: string; sourceDigest: `sha256:${string}`; payloadDigest: `sha256:${string}`; createdAt: Date; }

const FALLBACK_DATE = "2000-01-01T00:00:00.000Z";

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AssetVisualShadowImportError(code);
  return value as Record<string, unknown>;
}
function field(value: Record<string, unknown>, key: string, fallback = ""): string { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : fallback; }
function optional(value: Record<string, unknown>, key: string): string | null { return typeof value[key] === "string" && value[key].trim() ? value[key] as string : null; }
function dateField(value: Record<string, unknown>, key: string, fallback = FALLBACK_DATE): Date { const date = new Date(field(value, key, fallback)); return Number.isNaN(date.getTime()) ? new Date(fallback) : date; }
function projectSourceKey(projectId: string): string { return `workspace-v1:${projectId}:Project:${projectId}`; }
function chapterSourceKey(projectId: string, chapterId: string): string { return `workspace-v1:${projectId}:Chapter:${chapterId}`; }
function assetSourceKey(projectId: string, assetId: string): string { return `workspace-v1:${projectId}:Asset:${assetId}`; }
function assetEvidenceSourceKey(projectId: string, assetId: string): string { return `workspace-v1:${projectId}:AssetPhysicalEvidence:${assetId}`; }
function characterSourceKey(projectId: string, characterId: string): string { return `workspace-v1:${projectId}:Character:${characterId}`; }
function chapterSceneSourceKey(projectId: string, chapterId: string, sceneId: string): string { return `workspace-v1:${projectId}:ChapterScene:${chapterId}:${sceneId}`; }
function characterVisualSourceKey(projectId: string, characterId: string, assetId: string, kind: string): string { return `workspace-v1:${projectId}:CharacterVisual:${characterId}:${assetId}:${kind}`; }
function sceneVisualSourceKey(projectId: string, chapterId: string, sceneId: string, version: number): string { return `workspace-v1:${projectId}:SceneVisual:${chapterId}:${sceneId}:v${String(version).padStart(3, "0")}`; }
function stableId(type: string, sourceKey: string): string { return PrismaMigrationLedgerRepository.stableEntityId(type, sourceKey); }

function sha256(bytes: Buffer): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }

function safeStorageKey(value: string): string {
  if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/")) throw new AssetVisualShadowImportError("MIGRATION_ASSET_PATH_UNSAFE");
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new AssetVisualShadowImportError("MIGRATION_ASSET_PATH_UNSAFE");
  return value;
}

function sourceStorageKey(legacyProjectId: string, legacyPath: string): string {
  const normalized = safeStorageKey(legacyPath);
  return normalized.startsWith("projects/") ? normalized : `projects/${legacyProjectId}/${normalized}`;
}

function detectMime(bytes: Buffer, type: string, fallbackPath: string): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 6 && (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "PK\x03\x04") return "application/zip";
  if (type === "image") throw new AssetVisualShadowImportError("MIGRATION_ASSET_MIME_UNRESOLVED");
  const extension = path.extname(fallbackPath).toLowerCase();
  return ({ ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm", ".zip": "application/zip" } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function payload(snapshot: VerifiedSnapshot, storageKey: string): Promise<{ item: { sha256: `sha256:${string}` }; value: Record<string, unknown> }> {
  const { item, bytes } = await snapshot.readPayload(storageKey);
  try { return { item, value: object(JSON.parse(bytes.toString("utf8")), "MIGRATION_SOURCE_JSON_INVALID") }; }
  catch (error) { if (error instanceof AssetVisualShadowImportError) throw error; throw new AssetVisualShadowImportError("MIGRATION_SOURCE_JSON_INVALID"); }
}

/** G3-M3-A9：验证快照物理资产后 promote ready，并建立 CharacterVisual/SceneVisual。 */
export class AssetVisualShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;
  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) { this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma); }

  async import(snapshotPath: string, decisionsPath: string, options: { workspaceRoot?: string; runId?: string; startedAt?: string } = {}): Promise<{ run: MigrationRunRecord; report: ComicFormatReport; decisions: MigrationDecisionArtifact }> {
    const snapshot = await readVerifiedSnapshot(snapshotPath);
    const decisions = await this.readDecisions(decisionsPath, snapshot.sealed.sourceManifestDigest);
    const workspaceRoot = options.workspaceRoot ? this.assertWorkspaceRoot(options.workspaceRoot) : null;
    const run = await this.ledger.beginRun({ kind: "shadow", importerVersion: "g3-m3-a9", sourceManifestDigest: snapshot.sourceManifest.manifestDigest, snapshotManifestDigest: snapshot.snapshotManifest.manifestDigest, decisionsDigest: decisions.decisionsDigest, id: options.runId, startedAt: options.startedAt });
    try {
      const projects: ComicFormatReportProject[] = [];
      let readyCount = 0;
      let characterVisualCount = 0;
      let sceneVisualCount = 0;
      let warningCount = workspaceRoot ? 0 : 1;
      const projectItems = snapshot.sourceManifest.items.filter((item) => /^projects\/[^/]+\/project\.json$/.test(item.storageKey)).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
      for (const projectItem of projectItems) {
        const legacyProjectId = projectItem.storageKey.split("/")[1];
        const metadata = (await payload(snapshot, projectItem.storageKey)).value;
        const mapping = mapLegacyComicFormat(metadata.comicFormat);
        const decision = decisions.entries.find((entry) => entry.sourceKey === projectSourceKey(legacyProjectId));
        const targetProjectId = stableId("Project", projectSourceKey(legacyProjectId));
        const targetProject = await this.prisma.database().project.findUnique({ where: { id: targetProjectId } });
        const assetItem = snapshot.sourceManifest.items.find((item) => item.storageKey === `projects/${legacyProjectId}/shared/assets.json`);
        const physical = targetProject && assetItem && workspaceRoot ? await this.readPhysicalAssets(snapshot, assetItem.storageKey, legacyProjectId, targetProjectId, workspaceRoot) : [];
        if (targetProject && physical.length > 0) {
          const characterPlans = await this.buildCharacterVisualPlans(snapshot, legacyProjectId, physical);
          const scenePlans = await this.buildSceneVisualPlans(snapshot, legacyProjectId, targetProjectId, physical);
          await this.ledger.withTransaction(async (tx) => {
            for (const item of physical) { await this.promoteAsset(tx, run.id, item); readyCount += 1; }
            for (const plan of characterPlans) { await this.importCharacterVisual(tx, run.id, plan); characterVisualCount += 1; }
            for (const plan of scenePlans) { await this.importSceneVisual(tx, run.id, plan); sceneVisualCount += 1; }
          });
        } else if (targetProject && !workspaceRoot) warningCount += 1;
        const blocked = !targetProject;
        const issueKey = blocked ? `project:${legacyProjectId}:asset-visual-target` : null;
        projects.push({ projectId: legacyProjectId, sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, originalComicFormat: { kind: mapping.originalValueKind, preview: mapping.originalValuePreview }, mappingKind: mapping.mappingKind, targetComicFormat: mapping.targetComicFormat ?? decision?.chosenComicFormat ?? null, layoutPresetIntent: mapping.layoutPresetIntent, issueKey, resolutionStatus: issueKey ? "open" : "not_needed", importStatus: blocked ? "blocked" : "imported" });
        if (blocked) await this.ledger.withTransaction((tx) => this.ledger.recordGenericIssueInTransaction(tx, run.id, { issueKey: issueKey!, code: "MIGRATION_TARGET_NOT_FOUND", entityType: "Project", entityId: targetProjectId, sourceKey: projectSourceKey(legacyProjectId), storageKey: projectItem.storageKey, detailJson: { schemaVersion: 1, projectId: legacyProjectId, reason: "Project/Chapter shadow must run first" } }));
      }
      const report = createComicFormatReport(projects, { warningCount, entityCounts: { AssetReady: readyCount, CharacterVisual: characterVisualCount, SceneVisual: sceneVisualCount } });
      const finished = await this.ledger.finishRun(run.id, { status: report.summary.unresolvedBlockerCount > 0 ? "blocked" : "succeeded", reportDigest: report.reportDigest, counts: { ...report.summary, readyCount, characterVisualCount, sceneVisualCount }, verification: { schemaVersion: 1, sourceManifestVerified: true, snapshotManifestVerified: true, physicalAssetEvidenceImported: true, readyAssetCount: readyCount, characterVisualCount, sceneVisualCount }, finishedAt: new Date().toISOString() });
      return { run: finished, report, decisions };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "MIGRATION_IMPORT_FAILED";
      try { await this.ledger.finishRun(run.id, { status: "failed", errorCode: code, finishedAt: new Date().toISOString() }); } catch { /* preserve original failure */ }
      if (error instanceof AssetVisualShadowImportError || error instanceof MigrationLedgerError || error instanceof MigrationAuditError) throw error;
      throw new AssetVisualShadowImportError(code);
    }
  }

  private assertWorkspaceRoot(value: string): string {
    if (!path.isAbsolute(value) || value.includes("\0")) throw new AssetVisualShadowImportError("MIGRATION_WORKSPACE_ROOT_INVALID");
    return path.resolve(value);
  }

  private async readDecisions(decisionsPath: string, expected: `sha256:${string}`): Promise<MigrationDecisionArtifact> {
    if (!path.isAbsolute(decisionsPath)) throw new AssetVisualShadowImportError("MIGRATION_DECISION_PATH_INVALID");
    try { return normalizeMigrationDecisionArtifact(JSON.parse(await readFile(decisionsPath, "utf8")) as unknown, expected); }
    catch (error) { if (error instanceof Error && "code" in error) throw new AssetVisualShadowImportError(String((error as Error & { code: unknown }).code)); throw new AssetVisualShadowImportError("MIGRATION_DECISION_INVALID"); }
  }

  private async readPhysicalAssets(snapshot: VerifiedSnapshot, assetsStorageKey: string, legacyProjectId: string, targetProjectId: string, workspaceRoot: string | null): Promise<PhysicalAsset[]> {
    const { value } = await payload(snapshot, assetsStorageKey);
    const input = Array.isArray(value.assets) ? value.assets : [];
    const physical: PhysicalAsset[] = [];
    for (const [index, valueEntry] of input.entries()) {
      if (!valueEntry || typeof valueEntry !== "object" || Array.isArray(valueEntry)) continue;
      const raw = valueEntry as Record<string, unknown>;
      const legacyId = field(raw, "id", `asset_${String(index + 1).padStart(3, "0")}`);
      const legacyPath = field(raw, "path", "");
      if (!legacyPath) continue;
      const sourceKey = sourceStorageKey(legacyProjectId, legacyPath);
      const sourceItem = snapshot.sourceManifest.items.find((item) => item.storageKey === sourceKey);
      if (!sourceItem) continue;
      const bytes = (await snapshot.readPayload(sourceKey)).bytes;
      const digest = sha256(bytes);
      if (digest !== sourceItem.sha256) throw new AssetVisualShadowImportError("MIGRATION_SOURCE_DIGEST_MISMATCH");
      const type = field(raw, "type", "image");
      const actualMime = detectMime(bytes, type, legacyPath);
      const dimensions = type === "image" ? readImageDimensions(bytes) : null;
      if (type === "image" && !dimensions) throw new AssetVisualShadowImportError("MIGRATION_ASSET_DIMENSIONS_UNREADABLE");
      const targetId = stableId("Asset", assetSourceKey(legacyProjectId, legacyId));
      const chapterLegacyId = optional(raw, "chapterId");
      const chapterId = chapterLegacyId ? stableId("Chapter", chapterSourceKey(legacyProjectId, chapterLegacyId)) : null;
      const target = `legacy-import/${targetProjectId}/${legacyId}`;
      const storageKey = safeStorageKey(target);
      if (workspaceRoot) await this.materialize(workspaceRoot, storageKey, bytes, digest);
      physical.push({ legacyProjectId, legacyId, chapterLegacyId, type, path: legacyPath, raw, targetId, projectId: targetProjectId, chapterId, storageKey, sourceStorageKey: sourceKey, sourceDigest: sourceItem.sha256, bytes, sha256: digest, mimeType: actualMime, dimensions });
    }
    return physical;
  }

  private async materialize(workspaceRoot: string, storageKey: string, bytes: Buffer, digest: `sha256:${string}`): Promise<void> {
    const absolute = path.resolve(workspaceRoot, ...storageKey.split("/"));
    const prefix = `${workspaceRoot}${path.sep}`;
    if (!absolute.startsWith(prefix)) throw new AssetVisualShadowImportError("MIGRATION_WORKSPACE_PATH_UNSAFE");
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new AssetVisualShadowImportError("MIGRATION_WORKSPACE_PATH_UNSAFE");
      const existing = await readFile(absolute);
      if (sha256(existing) !== digest) throw new AssetVisualShadowImportError("MIGRATION_TARGET_FILE_CONFLICT");
      return;
    } catch (error) {
      if (error instanceof AssetVisualShadowImportError) throw error;
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes, { mode: 0o600 });
    await chmod(absolute, 0o600);
  }

  private async buildCharacterVisualPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, physical: PhysicalAsset[]): Promise<CharacterVisualPlan[]> {
    const item = snapshot.sourceManifest.items.find((candidate) => candidate.storageKey === `projects/${legacyProjectId}/shared/characters.json`);
    if (!item) return [];
    const { value } = await payload(snapshot, item.storageKey);
    const byLegacyAsset = new Map(physical.map((asset) => [asset.legacyId, asset]));
    const rows = Array.isArray(value.characters) ? value.characters : [];
    const plans: CharacterVisualPlan[] = [];
    for (const rowValue of rows) {
      if (!rowValue || typeof rowValue !== "object" || Array.isArray(rowValue)) continue;
      const row = rowValue as Record<string, unknown>;
      const legacyCharacterId = field(row, "id");
      if (!legacyCharacterId) continue;
      const characterId = stableId("Character", characterSourceKey(legacyProjectId, legacyCharacterId));
      const previewAssetId = optional(row, "previewReferenceAssetId");
      const primaryAssetId = optional(row, "primaryReferenceAssetId");
      if (previewAssetId && primaryAssetId && previewAssetId === primaryAssetId) throw new AssetVisualShadowImportError("MIGRATION_CHARACTER_VISUAL_CONFLICT");
      const visualVersion = Number.isInteger(row.visualVersion) && Number(row.visualVersion) > 0 ? Number(row.visualVersion) : 1;
      const refs: Array<{ assetId: string; kind: "preview_front" | "final_reference"; version: number; confirmedAt: Date | null }> = [];
      if (previewAssetId && byLegacyAsset.has(previewAssetId)) refs.push({ assetId: previewAssetId, kind: "preview_front", version: primaryAssetId ? Math.max(1, visualVersion - 1) : visualVersion, confirmedAt: null });
      if (primaryAssetId && byLegacyAsset.has(primaryAssetId)) refs.push({ assetId: primaryAssetId, kind: "final_reference", version: primaryAssetId === previewAssetId ? visualVersion : Math.max(1, visualVersion), confirmedAt: typeof row.finalizedAt === "string" ? dateField(row, "finalizedAt") : null });
      for (const ref of refs) {
        const asset = byLegacyAsset.get(ref.assetId)!;
        const sourceKey = characterVisualSourceKey(legacyProjectId, legacyCharacterId, ref.assetId, ref.kind);
        const targetId = stableId("CharacterVisual", sourceKey);
        plans.push({ targetId, sourceKey, characterId, assetId: asset.targetId, kind: ref.kind, version: ref.version, sourceStorageKey: item.storageKey, sourceDigest: item.sha256, payloadDigest: digestCanonicalJson({ id: targetId, characterId, assetId: asset.targetId, kind: ref.kind, version: ref.version }), createdAt: dateField(row, "createdAt"), confirmedAt: ref.confirmedAt });
      }
    }
    return plans;
  }

  private async buildSceneVisualPlans(snapshot: VerifiedSnapshot, legacyProjectId: string, targetProjectId: string, physical: PhysicalAsset[]): Promise<SceneVisualPlan[]> {
    const byLegacyAsset = new Map(physical.map((asset) => [asset.legacyId, asset]));
    const chapterItems = snapshot.sourceManifest.items.filter((item) => item.storageKey.startsWith(`projects/${legacyProjectId}/chapters/`) && item.storageKey.endsWith("/structure.json")).sort((a, b) => a.storageKey.localeCompare(b.storageKey));
    const plans: SceneVisualPlan[] = [];
    for (const structureItem of chapterItems) {
      const slug = structureItem.storageKey.split("/")[3];
      const chapterItem = snapshot.sourceManifest.items.find((item) => item.storageKey === `projects/${legacyProjectId}/chapters/${slug}/chapter.json`);
      if (!chapterItem) continue;
      const chapterMetadata = (await payload(snapshot, chapterItem.storageKey)).value;
      const legacyChapterId = field(chapterMetadata, "id", slug);
      const chapterId = stableId("Chapter", chapterSourceKey(legacyProjectId, legacyChapterId));
      const raw = (await payload(snapshot, structureItem.storageKey)).value;
      const structure = object(raw.structureJson ?? raw, "MIGRATION_STORY_DOCUMENT_INVALID");
      const scenes = Array.isArray(structure.scenes) ? structure.scenes : [];
      for (const sceneValue of scenes) {
        if (!sceneValue || typeof sceneValue !== "object" || Array.isArray(sceneValue)) continue;
        const scene = sceneValue as Record<string, unknown>;
        const sceneId = field(scene, "id");
        const legacyAssetId = optional(scene, "referenceAssetId");
        if (!sceneId || !legacyAssetId) continue;
        const asset = byLegacyAsset.get(legacyAssetId);
        if (!asset || asset.chapterId !== chapterId) continue;
        const chapterSceneId = stableId("ChapterScene", chapterSceneSourceKey(targetProjectId, chapterId, sceneId));
        const version = 1;
        const sourceKey = sceneVisualSourceKey(legacyProjectId, legacyChapterId, sceneId, version);
        plans.push({ targetId: stableId("SceneVisual", sourceKey), sourceKey, chapterSceneId, assetId: asset.targetId, version, sourceStorageKey: structureItem.storageKey, sourceDigest: structureItem.sha256, payloadDigest: digestCanonicalJson({ id: stableId("SceneVisual", sourceKey), chapterSceneId, assetId: asset.targetId, version }), createdAt: dateField(scene, "createdAt", dateField(structure, "updatedAt").toISOString()) });
      }
    }
    return plans;
  }

  private async promoteAsset(tx: Prisma.TransactionClient, runId: string, item: PhysicalAsset): Promise<void> {
    const existing = await tx.asset.findUnique({ where: { id: item.targetId } });
    if (!existing) throw new AssetVisualShadowImportError("MIGRATION_ASSET_TARGET_MISSING");
    const metadataObject = existing.metadataJson && typeof existing.metadataJson === "object" && !Array.isArray(existing.metadataJson) ? existing.metadataJson as Record<string, unknown> : { legacyMeta: existing.metadataJson };
    const metadata = { ...metadataObject, physicalEvidence: { schemaVersion: 1, sourceStorageKey: item.sourceStorageKey, sha256: item.sha256, bytes: item.bytes.byteLength, mimeType: item.mimeType, width: item.dimensions?.width ?? null, height: item.dimensions?.height ?? null } };
    const metadataDigest = digestCanonicalJson(metadata);
    const now = new Date();
    if (existing.status === "ready" || existing.readyAt !== null) {
      if (existing.sha256 !== item.sha256 || existing.bytes !== item.bytes.byteLength || existing.mimeType !== item.mimeType || existing.width !== (item.dimensions?.width ?? null) || existing.height !== (item.dimensions?.height ?? null) || existing.storageKey !== item.storageKey) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    } else {
      await tx.asset.update({ where: { id: item.targetId }, data: { mimeType: item.mimeType, status: "ready", sha256: item.sha256, bytes: item.bytes.byteLength, width: item.dimensions?.width ?? null, height: item.dimensions?.height ?? null, metadataJson: jsonValue(metadata), metadataDigest, readyAt: now, updatedAt: now } });
    }
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: assetEvidenceSourceKey(item.legacyProjectId, item.legacyId), entityType: "AssetPhysicalEvidence", entityId: item.targetId, sourceStorageKey: item.sourceStorageKey, sourceDigest: item.sourceDigest, payloadDigest: digestCanonicalJson(metadata), provenanceStatus: "complete" });
  }

  private async importCharacterVisual(tx: Prisma.TransactionClient, runId: string, plan: CharacterVisualPlan): Promise<void> {
    const character = await tx.character.findUnique({ where: { id: plan.characterId } });
    const asset = await tx.asset.findUnique({ where: { id: plan.assetId } });
    if (!character || !asset || asset.status !== "ready" || asset.projectId !== character.projectId) throw new AssetVisualShadowImportError("MIGRATION_CHARACTER_VISUAL_SCOPE_INVALID");
    const existing = await tx.characterVisual.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.characterId !== plan.characterId || existing.assetId !== plan.assetId || existing.kind !== plan.kind || existing.version !== plan.version)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.characterVisual.create({ data: { id: plan.targetId, characterId: plan.characterId, assetId: plan.assetId, kind: plan.kind, version: plan.version, status: "available", createdAt: plan.createdAt, confirmedAt: plan.confirmedAt } });
    const pointerField = plan.kind === "preview_front" ? "previewVisualId" : "primaryVisualId";
    const current = plan.kind === "preview_front" ? character.previewVisualId : character.primaryVisualId;
    if (!current) await tx.character.update({ where: { id: character.id }, data: { [pointerField]: plan.targetId, rowVersion: { increment: 1 } } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "CharacterVisual", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
  }

  private async importSceneVisual(tx: Prisma.TransactionClient, runId: string, plan: SceneVisualPlan): Promise<void> {
    const scene = await tx.chapterScene.findUnique({ where: { id: plan.chapterSceneId } });
    const asset = await tx.asset.findUnique({ where: { id: plan.assetId } });
    if (!scene || !asset || asset.status !== "ready" || asset.chapterId !== scene.chapterId || asset.projectId !== scene.projectId) throw new AssetVisualShadowImportError("MIGRATION_SCENE_VISUAL_SCOPE_INVALID");
    const existing = await tx.sceneVisual.findUnique({ where: { id: plan.targetId } });
    if (existing && (existing.chapterSceneId !== plan.chapterSceneId || existing.assetId !== plan.assetId || existing.version !== plan.version)) throw new MigrationLedgerError("MIGRATION_PAYLOAD_CONFLICT");
    if (!existing) await tx.sceneVisual.create({ data: { id: plan.targetId, chapterSceneId: plan.chapterSceneId, assetId: plan.assetId, sourceTaskId: null, version: plan.version, createdAt: plan.createdAt } });
    const currentScene = await tx.chapterScene.findUnique({ where: { id: plan.chapterSceneId } });
    if (currentScene && !currentScene.currentVisualId) await tx.chapterScene.update({ where: { id: plan.chapterSceneId }, data: { currentVisualId: plan.targetId } });
    await this.ledger.recordImportedEntitySourceInTransaction(tx, runId, { sourceKey: plan.sourceKey, entityType: "SceneVisual", entityId: plan.targetId, sourceStorageKey: plan.sourceStorageKey, sourceDigest: plan.sourceDigest, payloadDigest: plan.payloadDigest, provenanceStatus: "complete" });
  }
}
