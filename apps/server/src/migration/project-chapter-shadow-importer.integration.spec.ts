import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { createMigrationDecisionArtifact, type MigrationDecisionEntry } from "./migration-decision.js";
import { buildComicFormatIssue } from "./migration-issue.js";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { ProjectChapterShadowImporter } from "./project-chapter-shadow-importer.js";
import { ScriptOutlineShadowImporter } from "./script-outline-shadow-importer.js";
import { ScriptPendingRevisionShadowImporter } from "./script-pending-revision-shadow-importer.js";
import { StoryShadowImporter } from "./story-shadow-importer.js";
import { StoryboardShadowImporter } from "./storyboard-shadow-importer.js";
import { CharacterShadowImporter } from "./character-shadow-importer.js";
import { AssetShadowImporter } from "./asset-shadow-importer.js";
import { AssetVisualShadowImporter } from "./asset-visual-shadow-importer.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { SnapshotService } from "./snapshot.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const schemaPath = path.join(repoRoot, "apps/server/prisma/schema.prisma");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const SOURCE = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ENV_NAMES = ["AIROAMING_PERSISTENCE_MODE", "DATABASE_URL"] as const;

async function deploy(databaseUrl: string): Promise<void> {
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
}

async function createSnapshot(root: string, formats: Record<string, string>, options: { duplicateChapterOrder?: boolean; withScriptHistory?: boolean; withPendingRevision?: boolean; withStoryStructure?: boolean; withStoryboard?: boolean; withCharacters?: boolean; withAssets?: boolean; withAssetVisuals?: boolean } = {}) {
  const workspace = path.join(root, "workspace");
  const staging = path.join(root, "staging");
  await mkdir(staging);
  for (const [projectId, comicFormat] of Object.entries(formats)) {
    const projectDir = path.join(workspace, "projects", projectId);
    await mkdir(path.join(projectDir, "chapters", "chapter-001"), { recursive: true });
    await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify({ id: projectId, name: `项目 ${projectId}`, type: "comic", comicFormat, genreTags: ["fantasy"], storyTitle: `故事 ${projectId}`, artStyle: "ink", description: "legacy", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", currentChapterId: `${projectId}-chapter-001` })}\n`);
    await writeFile(path.join(projectDir, "chapters", "chapter-001", "chapter.json"), `${JSON.stringify({ id: `${projectId}-chapter-001`, order: 1, title: "第一章", status: options.withScriptHistory ? "script_done" : "draft", summary: "开端", completedAt: options.withScriptHistory ? "2026-01-03T00:00:00.000Z" : null, currentScriptVersionId: options.withScriptHistory ? `${projectId}-chapter-001_script_v001` : null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" })}\n`);
    await writeFile(path.join(projectDir, "chapters", "chapter-001", "script.md"), "夜色落下。\n");
    if (options.withScriptHistory) {
      await mkdir(path.join(projectDir, "chapters", "chapter-001", "script.versions"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "script.versions", "script-v001.md"), "夜色落下。\n");
      await writeFile(path.join(projectDir, "script-outline.md"), "# 故事大纲\n\n## 情节概要\n第一章展开冲突。\n");
      await writeFile(path.join(projectDir, "script-outline.json"), `${JSON.stringify({ id: "script_outline_current", projectId, status: "confirmed", title: "故事大纲", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", confirmedAt: "2026-01-02T00:00:00.000Z" })}\n`);
    }
    if (options.withPendingRevision) {
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "script-pending.json"), `${JSON.stringify({ sourceText: "AI 草稿正文。\n", threadId: "legacy-thread-1", messageId: "legacy-message-1", toolCallId: "legacy-tool-1", operation: "generate_script_from_outline", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T01:00:00.000Z" })}\n`);
      await mkdir(path.join(projectDir, "chapters", "chapter-001", "script.revisions"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "script.revisions", "latest.json"), `${JSON.stringify({ id: "legacy-revision-1", projectId, chapterId: `${projectId}-chapter-001`, threadId: "legacy-thread-1", messageId: "legacy-message-1", toolCallId: "legacy-tool-1", operation: "update_chapter_draft", summary: "AI 更新章节草稿", createdAt: "2026-01-03T01:00:00.000Z" })}\n`);
    }
    if (options.withStoryStructure) {
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "structure.json"), `${JSON.stringify({ id: "legacy-story-1", version: 1, status: "structured", sourceScriptVersionId: `${projectId}-chapter-001_script_v001`, createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", confirmedAt: "2026-01-03T00:00:00.000Z", structureJson: { chapterTitle: "第一章", sourceScriptVersionId: `${projectId}-chapter-001_script_v001`, synopsis: "夜色中的冲突。", direction: { logline: "夜色落下", chapterGoal: "建立冲突", coreConflict: "未知来客", emotionalArc: "紧张", endingHook: "门外有声" }, scenes: [{ id: "scene_01", name: "巷口", location: "旧城", timeOfDay: "夜", atmosphere: "冷", purpose: "引入" }], beats: [{ id: "beat_01", order: 1, title: "脚步声", summary: "主角听见脚步。", conflict: "是否开门", characters: [], sceneId: "scene_01", visualFocus: "门", outcome: "停在门前" }], characters: [], notes: "" } })}\n`);
    }
    if (options.withStoryboard) {
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "storyboard.json"), `${JSON.stringify({ id: "legacy-board-1", version: 1, status: "storyboard_done", sourceStoryVersionId: `${projectId}-chapter-001_story_v001`, createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z", confirmedAt: "2026-01-04T00:00:00.000Z", storyboardJson: { chapterTitle: "第一章", sourceStoryVersionId: `${projectId}-chapter-001_story_v001`, shots: [{ id: "shot_001", order: 1, beatId: "beat_01", sceneId: "scene_01", characterIds: [], coreAction: "门外停下脚步", emotion: "紧张", shotType: "medium", cameraAngle: "eye_level", comic: { panelDescription: "巷口的门", composition: "中景", dialogue: "", caption: "", panelRhythm: "normal" }, motion: { visualDescription: "脚步停住", compositionDesign: "中景", cameraMovement: "static", frameType: "reaction", durationMs: 0, durationHint: "", voiceLines: [] }, promptDraft: "" }], notes: "" } })}\n`);
    }
    if (options.withCharacters) {
      await mkdir(path.join(projectDir, "shared"), { recursive: true });
      await writeFile(path.join(projectDir, "shared", "characters.json"), `${JSON.stringify({ characters: [{ id: "char_001", name: "主角", role: "调查者", level: "lead", entityType: "human", status: "draft", appearance: "", personality: "", promptFragment: "", source: "script_outline", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }] })}\n`);
    }
    if (options.withAssets) {
      await mkdir(path.join(projectDir, "shared"), { recursive: true });
      await writeFile(path.join(projectDir, "shared", "assets.json"), `${JSON.stringify({ assets: [{ id: "asset_001", chapterId: `${projectId}-chapter-001`, type: "image", role: "character_reference", name: "主角参考图", path: "assets/characters/asset_001.png", sourceTaskId: null, meta: JSON.stringify({ legacyKind: "reference" }), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }] })}\n`);
    }
    if (options.withAssetVisuals) {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      await mkdir(path.join(projectDir, "assets", "characters"), { recursive: true });
      await mkdir(path.join(projectDir, "chapters", "chapter-001", "scenes", "scene_01"), { recursive: true });
      await writeFile(path.join(projectDir, "assets", "characters", "asset_001.png"), png);
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "scenes", "scene_01", "background.png"), png);
      await writeFile(path.join(projectDir, "shared", "assets.json"), `${JSON.stringify({ assets: [
        { id: "asset_001", chapterId: `${projectId}-chapter-001`, type: "image", role: "character_reference", name: "主角预览", path: "assets/characters/asset_001.png", sourceTaskId: null, meta: JSON.stringify({ characterId: "char_001", referenceKind: "preview_front" }), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
        { id: "asset_scene_001", chapterId: `${projectId}-chapter-001`, type: "image", role: "scene_reference", name: "巷口背景", path: "chapters/chapter-001/scenes/scene_01/background.png", sourceTaskId: null, meta: JSON.stringify({ sceneId: "scene_01", referenceKind: "scene_background" }), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
      ] })}\n`);
      await writeFile(path.join(projectDir, "shared", "characters.json"), `${JSON.stringify({ characters: [{ id: "char_001", name: "主角", role: "调查者", level: "lead", entityType: "human", status: "needs_reference", referenceAssetIds: ["asset_001"], previewReferenceAssetId: "asset_001", primaryReferenceAssetId: null, primaryReferenceKind: "final_reference", visualVersion: 1, source: "script_outline", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }] })}\n`);
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "structure.json"), `${JSON.stringify({ id: "legacy-story-1", version: 1, status: "structured", sourceScriptVersionId: `${projectId}-chapter-001_script_v001`, createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", confirmedAt: "2026-01-03T00:00:00.000Z", structureJson: { chapterTitle: "第一章", sourceScriptVersionId: `${projectId}-chapter-001_script_v001`, synopsis: "夜色中的冲突。", direction: { logline: "夜色落下", chapterGoal: "建立冲突", coreConflict: "未知来客", emotionalArc: "紧张", endingHook: "门外有声" }, scenes: [{ id: "scene_01", name: "巷口", location: "旧城", timeOfDay: "夜", atmosphere: "冷", purpose: "引入", referenceAssetId: "asset_scene_001" }], beats: [{ id: "beat_01", order: 1, title: "脚步声", summary: "主角听见脚步。", conflict: "是否开门", characters: [], sceneId: "scene_01", visualFocus: "门", outcome: "停在门前" }], characters: [], notes: "" } })}\n`);
    }
    if (options.duplicateChapterOrder) {
      await mkdir(path.join(projectDir, "chapters", "chapter-002"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-002", "chapter.json"), `${JSON.stringify({ id: `${projectId}-chapter-002`, order: 1, title: "重复顺序", status: "draft" })}\n`);
      await writeFile(path.join(projectDir, "chapters", "chapter-002", "script.md"), "重复。\n");
    }
  }
  const coordinator = new MaintenanceCoordinator();
  await coordinator.drain();
  await coordinator.close();
  const bundlePath = path.join(root, "runtime-bundle.json");
  await new RuntimeBundleFileService().writeAtomic(bundlePath, await coordinator.createRuntimeBundle());
  return new SnapshotService().createSnapshot({ workspaceRoot: workspace, stagingRoot: staging, runtimeBundle: bundlePath });
}

describe("G3-M3-A2 Project/Chapter shadow importer", () => {
  let root: string | null = null;
  let prisma: PrismaService | null = null;
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]] as const));

  async function prepare() {
    root = await mkdtemp(path.join(os.tmpdir(), "airoaming-g3-shadow-"));
    const databasePath = path.join(root, "db.sqlite");
    const handle = await open(databasePath, "wx", 0o600);
    await handle.close();
    const databaseUrl = `file:${databasePath}`;
    await deploy(databaseUrl);
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.onModuleInit();
    return { root, repository: new PrismaMigrationLedgerRepository(prisma) };
  }

  async function writeDecisions(snapshot: Awaited<ReturnType<SnapshotService["createSnapshot"]>>, entries: MigrationDecisionEntry[]) {
    const decisionsPath = path.join(root!, "decisions.json");
    await writeFile(decisionsPath, `${JSON.stringify(createMigrationDecisionArtifact(snapshot.sourceManifest.manifestDigest, entries), null, 2)}\n`);
    return decisionsPath;
  }

  afterEach(async () => {
    await prisma?.onModuleDestroy();
    prisma = null;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it("IMP-A2-01 imports canonical and page_horizontal projects with stable IDs", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll", p2: "page_horizontal" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const result = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-1", startedAt: "2026-07-12T00:00:00.000Z" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary).toMatchObject({ projectCount: 2, importedCount: 2, entityCounts: { Project: 2, Chapter: 2 } });
    const projects = await prisma!.database().project.findMany({ orderBy: { name: "asc" } });
    expect(projects).toHaveLength(2);
    expect(projects.map((project) => project.comicFormat)).toEqual(["vertical_scroll", "paged_comic"]);
    expect(projects.every((project) => project.id.startsWith("project_"))).toBe(true);
    expect(await prisma!.database().chapter.count()).toBe(2);
    expect(await prisma!.database().importedEntitySource.count()).toBe(4);
    expect((await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().project.count()).toBe(2);
    expect(await prisma!.database().chapter.count()).toBe(2);
  }, 30_000);

  it("IMP-A2-02 leaves a decision_required project uninserted and blocks the run", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "four_panel", p2: "vertical_scroll" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const result = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-blocked" });
    expect(result.run.status).toBe("blocked");
    expect(result.report.summary.unresolvedBlockerCount).toBe(1);
    expect(await prisma!.database().project.count()).toBe(1);
    expect(await prisma!.database().project.findFirstOrThrow()).toMatchObject({ comicFormat: "vertical_scroll" });
    expect(await prisma!.database().migrationIssue.count({ where: { runId: "shadow-a2-blocked", resolutionStatus: "open" } })).toBe(1);
  }, 30_000);

  it("IMP-A2-03 consumes a matching four_panel decision before Project INSERT", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "four_panel" });
    const projectItem = snapshot.sourceManifest.items.find((item) => item.storageKey === "projects/p1/project.json")!;
    const issue = buildComicFormatIssue({ runId: "ignored", projectId: "p1", sourceStorageKey: projectItem.storageKey, sourceDigest: projectItem.sha256, mapping: mapLegacyComicFormat("four_panel"), createdAt: "2026-07-12T00:00:00.000Z" })!;
    const decisionsPath = await writeDecisions(snapshot, [{ issueKey: issue.issueKey, sourceKey: "workspace-v1:p1:Project:p1", sourceDigest: projectItem.sha256, action: "set_comic_format", chosenComicFormat: "paged_comic", layoutPresetIntent: "four_panel" }]);
    const result = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-resolved" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.projects[0]).toMatchObject({ mappingKind: "decision_required", resolutionStatus: "resolved", importStatus: "imported", targetComicFormat: "paged_comic" });
    expect(await prisma!.database().project.findFirstOrThrow()).toMatchObject({ comicFormat: "paged_comic" });
    expect(await prisma!.database().migrationIssue.findFirstOrThrow()).toMatchObject({ resolutionStatus: "resolved" });
  }, 30_000);

  it("IMP-A2-04 rolls back the whole shadow transaction on a chapter constraint failure", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { duplicateChapterOrder: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await expect(new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a2-rollback" })).rejects.toThrow();
    expect(await prisma!.database().project.count()).toBe(0);
    expect(await prisma!.database().chapter.count()).toBe(0);
    expect((await prisma!.database().migrationRun.findUniqueOrThrow({ where: { id: "shadow-a2-rollback" } })).status).toBe("failed");
  }, 30_000);

  it("IMP-A3-01 imports outline and immutable script history after the Project/Chapter shadow", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a3-base" });
    const result = await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a3-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ ProjectScriptOutline: 1, ChapterScriptVersion: 1 });
    const project = await prisma!.database().project.findFirstOrThrow();
    const chapter = await prisma!.database().chapter.findFirstOrThrow();
    expect(project.currentScriptOutlineId).toMatch(/^projectscriptoutline_/);
    expect(chapter.currentScriptVersionId).toMatch(/^chapterscriptversion_/);
    expect(chapter.scriptWorkingState).toBe("clean");
    expect(await prisma!.database().projectScriptOutline.count()).toBe(1);
    expect(await prisma!.database().chapterScriptVersion.count()).toBe(1);
    expect(await prisma!.database().importedEntitySource.count()).toBe(4);
    expect((await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a3-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().projectScriptOutline.count()).toBe(1);
    expect(await prisma!.database().chapterScriptVersion.count()).toBe(1);
  }, 30_000);

  it("IMP-A4-01 imports pending/revision evidence without fabricating Dialogue foreign keys", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withPendingRevision: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a4-base" });
    const result = await new ScriptPendingRevisionShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a4-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ ChapterScriptPending: 1, ChapterScriptRevision: 1 });
    const chapter = await prisma!.database().chapter.findFirstOrThrow();
    expect(chapter.lastScriptRevisionId).toMatch(/^chapterscriptrevision_/);
    expect(await prisma!.database().chapterScriptPending.findFirstOrThrow()).toMatchObject({ threadId: null, messageId: null, toolCallId: null, operation: "generate_script_from_outline" });
    expect(await prisma!.database().chapterScriptRevision.findFirstOrThrow()).toMatchObject({ threadId: null, messageId: null, toolCallId: null, source: "ai_tool", operation: "update_chapter_draft" });
    expect(await prisma!.database().importedEntitySource.count()).toBe(4);
    const rowVersion = chapter.rowVersion;
    expect((await new ScriptPendingRevisionShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a4-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().chapter.count()).toBe(1);
    expect((await prisma!.database().chapter.findFirstOrThrow()).rowVersion).toBe(rowVersion);
    expect(await prisma!.database().chapterScriptPending.count()).toBe(1);
    expect(await prisma!.database().chapterScriptRevision.count()).toBe(1);
  }, 30_000);

  it("IMP-A5-01 imports confirmed StoryVersion and scene/beat projections after script history", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a5-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a5-script" });
    const result = await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a5-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ StoryVersion: 1, StorySceneProjection: 1, StoryBeatProjection: 1 });
    const chapter = await prisma!.database().chapter.findFirstOrThrow();
    const story = await prisma!.database().storyVersion.findFirstOrThrow();
    expect(chapter.currentStoryVersionId).toBe(story.id);
    expect(chapter.milestoneStatus).toBe("structured");
    expect(story).toMatchObject({ status: "confirmed", origin: "legacy_import", sourcePolicyVersion: "story-source-v1", schemaVersion: 2 });
    expect(await prisma!.database().storySceneProjection.count()).toBe(1);
    expect(await prisma!.database().storyBeatProjection.count()).toBe(1);
    expect(await prisma!.database().importedEntitySource.count()).toBe(7);
    const rowVersion = chapter.rowVersion;
    const replay = await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a5-2" });
    expect(replay.run.status).toBe("succeeded");
    expect((await prisma!.database().chapter.findFirstOrThrow()).rowVersion).toBe(rowVersion);
    expect(await prisma!.database().storyVersion.count()).toBe(1);
  }, 30_000);

  it("IMP-A5-02 blocks unresolved Story source without inserting a fake confirmed version", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withStoryStructure: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a5-unresolved-base" });
    const result = await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a5-unresolved" });
    expect(result.run.status).toBe("blocked");
    expect(result.report.summary.unresolvedBlockerCount).toBe(1);
    expect(result.report.projects[0]).toMatchObject({ importStatus: "blocked", resolutionStatus: "open", issueKey: "chapter:p1-chapter-001:story-source" });
    expect(await prisma!.database().storyVersion.count()).toBe(0);
    expect(await prisma!.database().migrationIssue.findFirstOrThrow()).toMatchObject({ code: "STORY_SOURCE_UNRESOLVED", entityType: "StoryVersion", resolutionStatus: "open" });
  }, 30_000);

  it("IMP-A6-01 imports confirmed StoryboardVersion and stable Shot projection", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a6-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a6-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a6-story" });
    const result = await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a6-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ StoryboardVersion: 1, Shot: 1, StoryboardShotProjection: 1 });
    const chapter = await prisma!.database().chapter.findFirstOrThrow();
    const board = await prisma!.database().storyboardVersion.findFirstOrThrow();
    expect(chapter.currentStoryboardVersionId).toBe(board.id);
    expect(chapter.milestoneStatus).toBe("storyboard_done");
    expect(board).toMatchObject({ status: "confirmed", origin: "legacy_import", sourcePolicyVersion: "storyboard-source-v1", schemaVersion: 2 });
    expect(await prisma!.database().shot.count()).toBe(1);
    expect(await prisma!.database().storyboardShotProjection.count()).toBe(1);
    const rowVersion = chapter.rowVersion;
    const replay = await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a6-2" });
    expect(replay.run.status).toBe("succeeded");
    expect((await prisma!.database().chapter.findFirstOrThrow()).rowVersion).toBe(rowVersion);
    expect(await prisma!.database().storyboardVersion.count()).toBe(1);
  }, 30_000);

  it("IMP-A7-01 imports shared characters with stable identity and replay", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withCharacters: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a7-base" });
    const result = await new CharacterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a7-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ Character: 1 });
    const character = await prisma!.database().character.findFirstOrThrow();
    expect(character).toMatchObject({ name: "主角", normalizedName: "主角", level: "lead", source: "script_outline" });
    expect(character.id).toMatch(/^character_/);
    expect(await prisma!.database().importedEntitySource.count()).toBe(3);
    expect((await new CharacterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a7-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().character.count()).toBe(1);
  }, 30_000);

  it("IMP-A8-01 imports asset metadata as staged and never fabricates ready evidence", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withAssets: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a8-base" });
    const result = await new AssetShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a8-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ Asset: 1 });
    const asset = await prisma!.database().asset.findFirstOrThrow();
    expect(asset).toMatchObject({ type: "image", role: "character_reference", mimeType: "image/png", status: "staged", chapterId: expect.stringMatching(/^chapter_/) });
    expect(asset.sha256).toBeNull();
    expect(asset.bytes).toBeNull();
    expect(asset.metadataJson).toEqual({ legacyKind: "reference" });
    expect(asset.metadataSchemaVersion).toBe(1);
    expect(await prisma!.database().characterVisual.count()).toBe(0);
    expect(await prisma!.database().sceneVisual.count()).toBe(0);
    expect(await prisma!.database().importedEntitySource.count()).toBe(3);
    expect((await new AssetShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a8-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().asset.count()).toBe(1);
  }, 30_000);

  it("IMP-A9-01 promotes verified files and imports character/scene visuals", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withCharacters: true, withAssets: true, withAssetVisuals: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-story" });
    await new CharacterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-character" });
    await new AssetShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-assets" });
    const result = await new AssetVisualShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-1", workspaceRoot: path.join(prepared.root!, "workspace") });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ AssetReady: 2, CharacterVisual: 1, SceneVisual: 1 });
    expect(await prisma!.database().asset.count({ where: { status: "ready" } })).toBe(2);
    const character = await prisma!.database().character.findFirstOrThrow();
    expect(character.previewVisualId).toMatch(/^charactervisual_/);
    const scene = await prisma!.database().chapterScene.findFirstOrThrow();
    expect(scene.currentVisualId).toMatch(/^scenevisual_/);
    expect(await prisma!.database().characterVisual.count()).toBe(1);
    expect(await prisma!.database().sceneVisual.count()).toBe(1);
    expect((await new AssetVisualShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a9-2", workspaceRoot: path.join(prepared.root!, "workspace") })).run.status).toBe("succeeded");
    expect(await prisma!.database().characterVisual.count()).toBe(1);
    expect(await prisma!.database().sceneVisual.count()).toBe(1);
  }, 30_000);
});
