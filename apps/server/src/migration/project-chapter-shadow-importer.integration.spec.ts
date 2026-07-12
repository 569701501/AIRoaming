import { afterEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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
import { PreflightShadowImporter } from "./preflight-shadow-importer.js";
import { TaskShadowImporter } from "./task-shadow-importer.js";
import { CandidateShadowImporter } from "./candidate-shadow-importer.js";
import { CandidateLockShadowImporter } from "./candidate-lock-shadow-importer.js";
import { MigrationVerifyService } from "./migration-verify.service.js";
import { LayoutShadowImporter } from "./layout-shadow-importer.js";
import { ExportShadowImporter } from "./export-shadow-importer.js";
import { ProviderShadowImporter } from "./provider-shadow-importer.js";
import { DialogueShadowImporter } from "./dialogue-shadow-importer.js";
import { FullShadowImporter, FULL_SHADOW_SLICE_ORDER } from "./full-shadow-importer.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { SnapshotService } from "./snapshot.service.js";
import { digestCanonicalJson, encodeStoryboardDocumentV2 } from "@airoaming/shared";
import { ProjectsModule } from "../projects/projects.module.js";
import { ProjectsService } from "../projects/projects.service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const schemaPath = path.join(repoRoot, "apps/server/prisma/schema.prisma");
const prismaCli = path.join(repoRoot, "apps/server/node_modules/prisma/build/index.js");
const SOURCE = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ENV_NAMES = ["AIROAMING_PERSISTENCE_MODE", "DATABASE_URL", "AIROAMING_WORKSPACE_ROOT"] as const;
const FRESH_INVENTORY_TABLES = [
  "projects",
  "project_script_outlines",
  "chapters",
  "chapter_script_versions",
  "chapter_script_pending",
  "chapter_script_revisions",
  "story_versions",
  "story_scene_projections",
  "story_beat_projections",
  "chapter_scenes",
  "storyboard_versions",
  "shots",
  "storyboard_shot_projections",
  "storyboard_shot_characters",
  "preflight_revisions",
  "characters",
  "character_visuals",
  "assets",
  "scene_visuals",
  "generation_tasks",
  "candidates",
  "candidate_lock_revisions",
  "layout_working_copies",
  "export_revisions",
  "provider_configs",
  "credential_metadata",
  "app_preferences",
  "conversation_threads",
  "conversation_messages",
  "dialogue_tool_results",
  "dialogue_runtime_sessions",
  "pending_dialogue_artifacts",
  "imported_entity_sources",
  "migration_issues",
  "migration_runs",
] as const;
const VOLATILE_INVENTORY_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "started_at",
  "finished_at",
  "ready_at",
  "recorded_at",
  "activated_at",
  "first_business_write_at",
  "last_verified_at",
  "available_at",
  "next_run_at",
  "lease_expires_at",
  "heartbeat_at",
  "processed_at",
  "closed_at",
  "completed_at",
  "confirmed_at",
  "failed_at",
  "cancelled_at",
  "resolved_at",
  "rotated_at",
  "imported_at",
]);

async function deploy(databaseUrl: string): Promise<void> {
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } });
}

async function readFreshInventory(prisma: PrismaService): Promise<{ digest: `sha256:${string}`; tables: Record<string, unknown> }> {
    const tables: Record<string, unknown> = {};
    for (const table of FRESH_INVENTORY_TABLES) {
      const rows = await prisma.database().$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"`);
      const randomIdentity = table === "imported_entity_sources" || table === "migration_issues";
      tables[table] = rows
      .map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => !VOLATILE_INVENTORY_COLUMNS.has(column) && !(randomIdentity && column === "id"))))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return { tables, digest: digestCanonicalJson(tables) };
}

async function createSnapshot(root: string, formats: Record<string, string>, options: { duplicateChapterOrder?: boolean; withScriptHistory?: boolean; withPendingRevision?: boolean; withStoryStructure?: boolean; withStoryboard?: boolean; withCharacters?: boolean; withAssets?: boolean; withAssetVisuals?: boolean; withPreflight?: "unresolved" | "resolved"; withTasks?: "stub" | "complete"; withCandidates?: boolean; withLayout?: boolean; withExports?: boolean; withSettings?: boolean; withDialogueRuntime?: boolean; withPendingDialogue?: boolean } = {}) {
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
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "storyboard.json"), `${JSON.stringify({ id: "legacy-board-1", version: 1, status: "storyboard_done", sourceStoryVersionId: `${projectId}-chapter-001_story_v001`, createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z", confirmedAt: "2026-01-04T00:00:00.000Z", storyboardJson: { chapterTitle: "第一章", sourceStoryVersionId: `${projectId}-chapter-001_story_v001`, shots: [{ id: "shot_001", order: 1, beatId: "beat_01", sceneId: "scene_01", characterIds: [], lockedCandidateId: options.withCandidates ? "legacy-candidate-001" : null, coreAction: "门外停下脚步", emotion: "紧张", shotType: "medium", cameraAngle: "eye_level", comic: { panelDescription: "巷口的门", composition: "中景", dialogue: "", caption: "", panelRhythm: "normal" }, motion: { visualDescription: "脚步停住", compositionDesign: "中景", cameraMovement: "static", frameType: "reaction", durationMs: 0, durationHint: "", voiceLines: [] }, promptDraft: "" }], notes: "" } })}\n`);
    }
    if (options.withPreflight === "unresolved") {
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "preflight.json"), `${JSON.stringify({ id: "legacy-preflight-1", version: 1, status: "ready", sourceStoryboardId: "legacy-board-1", updatedAt: "2026-01-05T00:00:00.000Z" })}\n`);
    }
    if (options.withPreflight === "resolved") {
      const targetProjectId = PrismaMigrationLedgerRepository.stableEntityId("Project", `workspace-v1:${projectId}:Project:${projectId}`);
      const targetChapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", `workspace-v1:${projectId}:Chapter:${projectId}-chapter-001`);
      const targetShotId = PrismaMigrationLedgerRepository.stableEntityId("Shot", `workspace-v1:${projectId}:Shot:${projectId}-chapter-001:shot_001`);
      const targetBoardId = PrismaMigrationLedgerRepository.stableEntityId("StoryboardVersion", `workspace-v1:${projectId}:StoryboardVersion:${projectId}-chapter-001:v001`);
      const storyboard = encodeStoryboardDocumentV2({ schemaVersion: 2, chapterId: targetChapterId, shots: [{ id: targetShotId, order: 1, beatId: "beat_01", sceneId: "scene_01", characterIds: [], coreAction: "门外停下脚步", emotion: "紧张", shotType: "medium", cameraAngle: "eye_level", comic: { panelDescription: "巷口的门", composition: "中景", dialogue: "", caption: "", panelRhythm: "normal" }, motion: { visualDescription: "脚步停住", compositionDesign: "中景", cameraMovement: "static", frameType: "reaction", durationMs: 0, durationHint: "", voiceLines: [] }, promptDraft: "" }], notes: "" });
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "preflight.json"), `${JSON.stringify({ version: 1, schemaVersion: 2, chapterId: targetChapterId, sourceSnapshot: { schemaVersion: 1, policyVersion: "preflight-source-v1", projectId: targetProjectId, chapterId: targetChapterId, consumerType: "preflight_revision", storyboard: { id: targetBoardId, digest: storyboard.digest }, style: { comicFormat: "vertical_scroll", artStyle: "ink", styleDigest: digestCanonicalJson({ comicFormat: "vertical_scroll", artStyle: "ink" }) }, characters: [], scenes: [] }, shotCount: 1, characterChecks: [], sceneChecks: [], styleCheck: { comicFormat: "vertical_scroll", comicFormatLabel: "竖向条漫", artStyle: "ink", artStyleLabel: "墨线", status: "ok", note: "" }, issues: [], ready: true, notes: "", policyVersion: "preflight-source-v1" })}\n`);
    }
    if (options.withTasks) {
      await mkdir(path.join(projectDir, "tasks"), { recursive: true });
      const task = { id: "legacy-task-001", projectId, chapterId: `${projectId}-chapter-001`, type: "image_generate", status: "succeeded", phase: "done", target: { type: "shot", id: "shot_001" }, input: { shotId: "shot_001", prompt: "干净画格" }, inputSchemaVersion: 1, inputDigest: SOURCE, createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T01:00:00.000Z", finishedAt: "2026-01-05T01:00:00.000Z" };
      await writeFile(path.join(projectDir, "tasks", "legacy-task-001.input.json"), `${JSON.stringify(task)}\n`);
      if (options.withTasks === "complete") await writeFile(path.join(projectDir, "tasks", "legacy-task-001.output.json"), `${JSON.stringify({ assetId: "asset_001", completedAt: "2026-01-05T01:00:00.000Z" })}\n`);
    }
    if (options.withCandidates) {
      await mkdir(path.join(projectDir, "chapters", "chapter-001"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "candidates.json"), `${JSON.stringify({ schemaVersion: 1, projectId, chapterId: `${projectId}-chapter-001`, candidates: [{ id: "legacy-candidate-001", projectId, chapterId: `${projectId}-chapter-001`, shotId: "shot_001", taskId: "legacy-task-001", assetId: "asset_001", index: 1, status: "locked", label: "旧定稿", notes: "", promptDigest: SOURCE, createdAt: "2026-01-05T02:00:00.000Z", updatedAt: "2026-01-05T02:00:00.000Z" }], updatedAt: "2026-01-05T02:00:00.000Z" })}\n`);
    }
    if (options.withLayout) {
      await mkdir(path.join(projectDir, "chapters", "chapter-001", "layout"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "layout", "layout.json"), `${JSON.stringify({ schemaVersion: 1, id: "legacy-layout-001", projectId, chapterId: `${projectId}-chapter-001`, pages: [{ id: "page_001", projectId, chapterId: `${projectId}-chapter-001`, pageNumber: 1, format: "vertical_comic", width: 1080, height: 1920, placements: [{ id: "placement_001", shotId: "shot_001", candidateId: "legacy-candidate-001", assetId: "asset_001", order: 1, x: 0, y: 0, w: 1080, h: 1920 }], exportAssetId: null }], exportAssetIds: [], createdAt: "2026-01-05T03:00:00.000Z", updatedAt: "2026-01-05T03:00:00.000Z", confirmedAt: "2026-01-05T03:00:00.000Z" })}\n`);
    }
    if (options.withExports) {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      await mkdir(path.join(projectDir, "chapters", "chapter-001", "exports", "export_001"), { recursive: true });
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "exports", "export_001", "page_001.png"), png);
      await writeFile(path.join(projectDir, "chapters", "chapter-001", "exports", "export_001", "manifest.json"), `${JSON.stringify({ schemaVersion: 1, exportId: "export_001", projectId, chapterId: `${projectId}-chapter-001`, kind: "layout_publication", files: [{ path: "page_001.png", role: "page_png", order: 1 }], createdAt: "2026-01-06T00:00:00.000Z" })}\n`);
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
      await mkdir(path.join(projectDir, "shared"), { recursive: true });
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
  if (options.withSettings) {
    await mkdir(path.join(workspace, "settings"), { recursive: true });
    await writeFile(path.join(workspace, "settings", "app-settings.json"), `${JSON.stringify({ version: 1, aiKey: { providerId: "self", providerName: "自定义 OpenAI 兼容", modelId: "gpt-5.5", baseUrl: null, apiKey: "sk-test-secret-value", keyFingerprint: "sha256:fingerprint", updatedAt: "2026-01-07T00:00:00.000Z" }, openaiImageProvider: { providerId: "openai_image", providerName: "OpenAI 图片生成", modelId: "gpt-image-2", baseUrl: "https://example.test", apiKey: null, keyFingerprint: null, updatedAt: null }, activeImageProvider: "openai", appearance: { theme: "dark" }, updatedAt: "2026-01-07T00:00:00.000Z" })}\n`);
  }
  const coordinator = new MaintenanceCoordinator();
  if (options.withDialogueRuntime) {
    coordinator.registerRuntimeStateProvider("dialogue", () => ({
      conversationState: {
        schemaVersion: 1,
        captured: true,
        kind: "dialogue_runtime_state_v1",
        threads: [{
          id: "legacy-thread-001",
          projectId: "p1",
          chapterId: "p1-chapter-001",
          stepKey: "project_story",
          title: "旧剧本对话",
          status: "active",
          openCodeSessionId: "legacy-opencode-session-001",
          createdAt: "2026-01-07T00:00:00.000Z",
          updatedAt: "2026-01-07T00:02:00.000Z",
          messages: [
            { id: "legacy-message-user-001", role: "user", content: "请整理这一章", status: "completed", createdAt: "2026-01-07T00:00:00.000Z", updatedAt: "2026-01-07T00:00:01.000Z", completedAt: "2026-01-07T00:00:01.000Z" },
            { id: "legacy-message-assistant-001", role: "assistant", content: "我会先整理章节结构。", status: "completed", providerId: "self", modelId: "gpt-5.5", createdAt: "2026-01-07T00:00:02.000Z", updatedAt: "2026-01-07T00:00:03.000Z", completedAt: "2026-01-07T00:00:03.000Z" },
          ],
          toolResults: [{ id: "legacy-tool-result-001", messageId: "legacy-message-assistant-001", toolCallId: "legacy-tool-call-001", tool: "analyze_script_import", status: "succeeded", summary: "已完成旧剧本分析", payload: { schemaVersion: 1, decision: "import" }, createdAt: "2026-01-07T00:00:04.000Z" }],
        }],
      },
      pendingDialogueState: options.withPendingDialogue ? {
        schemaVersion: 1,
        captured: true,
        kind: "dialogue_pending_state_v1",
        artifacts: [{
          id: "legacy-pending-script-import-001",
          projectId: "p1",
          chapterId: "p1-chapter-001",
          threadId: "legacy-thread-001",
          kind: "script_import",
          status: "pending",
          activeSlotKey: "legacy-thread-001:script_import",
          payload: { sourceText: "待确认剧本片段", sourceName: "legacy.txt", analysis: { decision: "needs_user_confirmation", reason: "需要确认", risk: "会覆盖章节", nextTool: "import_script_to_chapters" }, createdAt: "2026-01-07T00:01:00.000Z" },
          schemaVersion: 1,
          createdAt: "2026-01-07T00:01:00.000Z",
          updatedAt: "2026-01-07T00:01:00.000Z",
        }],
      } : { captured: false, reason: "test_pending_not_captured" },
    }));
  }
  await coordinator.drain();
  await coordinator.close();
  const bundlePath = path.join(root, "runtime-bundle.json");
  await new RuntimeBundleFileService().writeAtomic(bundlePath, await coordinator.createRuntimeBundle());
  return new SnapshotService().createSnapshot({ workspaceRoot: workspace, stagingRoot: staging, runtimeBundle: bundlePath });
}

function semanticWorkbenchSnapshot(snapshot: Awaited<ReturnType<ProjectsService["getWorkbenchSnapshot"]>>) {
  return {
    project: { name: snapshot.project.name, type: snapshot.project.type, storyTitle: snapshot.project.storyTitle, genreTags: snapshot.project.genreTags, comicFormat: snapshot.project.comicFormat, artStyle: snapshot.project.artStyle, description: snapshot.project.description },
    chapters: snapshot.chapters.map((item) => ({ order: item.order, title: item.title, summary: item.summary, sourceTextPreview: item.sourceTextPreview })),
    scriptOutline: snapshot.scriptOutline && { status: snapshot.scriptOutline.status, title: snapshot.scriptOutline.title, sourceText: snapshot.scriptOutline.sourceText },
    storyStructure: snapshot.storyStructure && { synopsis: snapshot.storyStructure.structureJson.synopsis, direction: snapshot.storyStructure.structureJson.direction, scenes: snapshot.storyStructure.structureJson.scenes.map((item) => ({ name: item.name, location: item.location, timeOfDay: item.timeOfDay, atmosphere: item.atmosphere, purpose: item.purpose })), beats: snapshot.storyStructure.structureJson.beats.map((item) => ({ order: item.order, title: item.title, summary: item.summary, conflict: item.conflict, visualFocus: item.visualFocus, outcome: item.outcome })) },
    storyboard: snapshot.storyboard && { notes: snapshot.storyboard.storyboardJson.notes, shots: snapshot.storyboard.storyboardJson.shots.map((item) => ({ order: item.order, coreAction: item.coreAction, emotion: item.emotion, shotType: item.shotType, cameraAngle: item.cameraAngle, comic: item.comic, motion: item.motion, promptDraft: item.promptDraft })) },
    imagePreflight: snapshot.imagePreflight && { ready: snapshot.imagePreflight.preflightJson.ready, shotCount: snapshot.imagePreflight.preflightJson.shotCount, issues: snapshot.imagePreflight.preflightJson.issues, styleCheck: snapshot.imagePreflight.preflightJson.styleCheck },
    characters: snapshot.characters.map((item) => ({ name: item.name, role: item.role, level: item.level, entityType: item.entityType, status: item.status, appearance: item.appearance, personality: item.personality, promptFragment: item.promptFragment })),
    candidates: snapshot.candidates.map((item) => ({ index: item.index, label: item.label, status: item.status, promptDigest: item.promptDigest })),
    assets: snapshot.assets.map((item) => ({ type: item.type, name: item.name, path: item.path, sourceTaskId: item.sourceTaskId, meta: item.meta })),
    chapterLayout: snapshot.chapterLayout && { pages: snapshot.chapterLayout.pages.map((item) => ({ pageNumber: item.pageNumber, format: item.format, width: item.width, height: item.height, placements: item.placements.map((placement) => ({ order: placement.order, x: placement.x, y: placement.y, w: placement.w, h: placement.h })) })), exportAssetIds: snapshot.chapterLayout.exportAssetIds },
  };
}

describe("G3-M3-A2 Project/Chapter shadow importer", () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
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
    await app?.close();
    app = null;
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
    expect(asset.metadataJson).toEqual({ legacyKind: "reference", legacyName: "主角参考图", legacyPath: "assets/characters/asset_001.png" });
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

  it("IMP-A10-01 blocks legacy PreflightRevision without a verifiable source snapshot", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true, withPreflight: "unresolved" });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-story" });
    await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-board" });
    const result = await new PreflightShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-1" });
    expect(result.run.status).toBe("blocked");
    expect(result.report.summary.unresolvedBlockerCount).toBe(1);
    expect(result.report.projects[0]).toMatchObject({ importStatus: "blocked", resolutionStatus: "open", issueKey: "chapter:p1-chapter-001:preflight-source" });
    expect(await prisma!.database().preflightRevision.count()).toBe(0);
    expect(await prisma!.database().chapter.findFirstOrThrow()).toMatchObject({ currentPreflightRevisionId: null });
    expect(await prisma!.database().migrationIssue.findFirstOrThrow({ where: { runId: "shadow-a10-1" } })).toMatchObject({ code: "PREFLIGHT_SOURCE_UNRESOLVED", entityType: "PreflightRevision", resolutionStatus: "open" });
  }, 30_000);

  it("IMP-A10-02 imports a ready PreflightRevision only when storyboard provenance matches", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true, withPreflight: "resolved" });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-resolved-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-resolved-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-resolved-story" });
    await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-resolved-board" });
    const result = await new PreflightShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-resolved" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ PreflightRevision: 1 });
    const preflight = await prisma!.database().preflightRevision.findFirstOrThrow();
    const chapter = await prisma!.database().chapter.findFirstOrThrow();
    expect(preflight).toMatchObject({ status: "confirmed", ready: true, schemaVersion: 2, sourcePolicyVersion: "preflight-source-v1" });
    expect(chapter.currentPreflightRevisionId).toBe(preflight.id);
    expect((await new PreflightShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a10-resolved-replay" })).run.status).toBe("succeeded");
    expect(await prisma!.database().preflightRevision.count()).toBe(1);
  }, 30_000);

  it("IMP-A11A-01 imports complete and incomplete legacy tasks as non-runnable history", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withTasks: "complete" });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11a-base" });
    const result = await new TaskShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11a-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ GenerationTask: 1 });
    const task = await prisma!.database().generationTask.findFirstOrThrow();
    expect(task).toMatchObject({ recordKind: "legacy_imported", provenanceStatus: "complete", status: "succeeded", retryDisabled: true, maxAttempts: 0, attempt: 0, chapterId: expect.stringMatching(/^chapter_/) });
    expect(await prisma!.database().generationTask.count()).toBe(1);
    expect((await new TaskShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11a-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().generationTask.count()).toBe(1);

    const stubRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-g3-task-stub-"));
    try {
      const stubSnapshot = await createSnapshot(stubRoot, { p2: "vertical_scroll" }, { withTasks: "stub" });
      const stubDecisions = path.join(stubRoot, "decisions.json");
      await writeFile(stubDecisions, `${JSON.stringify(createMigrationDecisionArtifact(stubSnapshot.sourceManifest.manifestDigest, []), null, 2)}\n`);
      await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(stubSnapshot.outputPath, stubDecisions, { runId: "shadow-a11a-stub-base" });
      const stubResult = await new TaskShadowImporter(prisma!, prepared.repository).import(stubSnapshot.outputPath, stubDecisions, { runId: "shadow-a11a-stub" });
      expect(stubResult.run.status).toBe("succeeded");
      const stub = await prisma!.database().generationTask.findFirstOrThrow({ where: { projectId: { startsWith: "project_" }, id: { not: task.id } } });
      expect(stub).toMatchObject({ recordKind: "legacy_stub", provenanceStatus: "partial", status: null, retryDisabled: true, maxAttempts: 0, attempt: 0 });
    } finally {
      await rm(stubRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("IMP-A11B-01 imports candidate metadata but does not fabricate a current lock", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true, withAssets: true, withTasks: "complete", withCandidates: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-story" });
    await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-board" });
    await new AssetShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-assets" });
    await new TaskShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-tasks" });
    const result = await new CandidateShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ Candidate: 1 });
    const candidate = await prisma!.database().candidate.findFirstOrThrow();
    expect(candidate).toMatchObject({ status: "generated", generationPurpose: "legacy_unspecified", promptDigest: SOURCE });
    expect(await prisma!.database().shot.findFirstOrThrow()).toMatchObject({ currentCandidateLockRevisionId: null });
    expect((await new CandidateShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11b-2" })).run.status).toBe("succeeded");
    expect(await prisma!.database().candidate.count()).toBe(1);
  }, 30_000);

  it("IMP-A11C-01 restores direct legacy lock evidence and replays idempotently", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true, withAssets: true, withTasks: "complete", withCandidates: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-story" });
    await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-board" });
    await new AssetShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-assets" });
    await new TaskShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-tasks" });
    await new CandidateShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-candidates" });
    const result = await new CandidateLockShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-lock-1" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ CandidateLockRevision: 1 });
    const revision = await prisma!.database().candidateLockRevision.findFirstOrThrow();
    expect(revision).toMatchObject({ action: "lock", origin: "legacy_import", candidateId: expect.stringMatching(/^candidate_/), decidedAt: null, revision: 1 });
    expect(await prisma!.database().shot.findFirstOrThrow()).toMatchObject({ currentCandidateLockRevisionId: revision.id });
    const replay = await new CandidateLockShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a11c-lock-2" });
    expect(replay.run.status).toBe("succeeded");
    expect(await prisma!.database().candidateLockRevision.count()).toBe(1);
  }, 30_000);

  it("IMP-M4-01 verifies a succeeded shadow run without mutating the ledger", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    const run = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-verify" });
    const verificationBefore = (await prepared.repository.getRun(run.run.id)).verification;
    const result = await new MigrationVerifyService(prisma!, prepared.repository).verify(snapshot.outputPath, run.run.id, repoRoot);
    const releaseIdentity = await loadReleaseSchemaIdentityV1(repoRoot);
    expect(result.report.errors).toEqual([]);
    expect(result.report.passed).toBe(true);
    expect(result.report.effectiveSchemaManifestDigest).toBe(releaseIdentity.effectiveSchemaManifestDigest);
    expect(result.report.checks).toMatchObject({ runSucceeded: true, sourceManifestMatch: true, snapshotManifestMatch: true, integrityCheck: "ok", foreignKeyViolationCount: 0, openBlockerCount: 0, sourceMismatchCount: 0, unregisteredEntityTypeCount: 0 });
    expect((await prepared.repository.getRun(run.run.id)).verification).toEqual(verificationBefore);
  }, 30_000);

  it("IMP-M4-02 verifies transformed settings and runtime evidence against the snapshot manifest", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withSettings: true, withDialogueRuntime: true, withPendingDialogue: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-transformed-base" });
    await new ProviderShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-transformed-providers" });
    const dialogue = await new DialogueShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-transformed-dialogue" });
    const result = await new MigrationVerifyService(prisma!, prepared.repository).verify(snapshot.outputPath, dialogue.run.id, repoRoot);
    expect(result.report.passed).toBe(true);
    expect(result.report.checks).toMatchObject({ sourceMismatchCount: 0, unregisteredEntityTypeCount: 0 });
  }, 30_000);

  it("IMP-M4-03 fails closed when a run contains an unregistered source entity type", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const run = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-unregistered" });
    await prisma!.database().importedEntitySource.create({
      data: {
        sourceKey: "workspace-v1:p1:FutureEntity:future-001",
        entityType: "FutureEntity",
        entityId: "future-001",
        sourceStorageKey: "projects/p1/project.json",
        sourceDigest: SOURCE,
        provenanceStatus: "reference_only",
        firstRunId: run.run.id,
        lastRunId: run.run.id,
      },
    });
    const result = await new MigrationVerifyService(prisma!, prepared.repository).verify(snapshot.outputPath, run.run.id, repoRoot);
    expect(result.report.passed).toBe(false);
    expect(result.report.checks.unregisteredEntityTypeCount).toBe(1);
    expect(result.report.errors).toContain("MIGRATION_SOURCE_EVIDENCE_UNREGISTERED");
  }, 30_000);

  it("IMP-M4-04 fails closed when a registered source entity has a mismatched digest", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const run = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-source-mismatch" });
    const projectItem = snapshot.sourceManifest.items.find((item) => item.storageKey === "projects/p1/project.json");
    expect(projectItem).toBeDefined();
    await prisma!.database().importedEntitySource.create({
      data: {
        sourceKey: "workspace-v1:p1:Project:tampered-project",
        entityType: "Project",
        entityId: "tampered-project",
        sourceStorageKey: projectItem!.storageKey,
        sourceDigest: SOURCE,
        provenanceStatus: "reference_only",
        firstRunId: run.run.id,
        lastRunId: run.run.id,
      },
    });
    const result = await new MigrationVerifyService(prisma!, prepared.repository).verify(snapshot.outputPath, run.run.id, repoRoot);
    expect(result.report.passed).toBe(false);
    expect(result.report.checks.sourceMismatchCount).toBe(1);
    expect(result.report.errors).toContain("MIGRATION_SOURCE_DIGEST_MISMATCH");
  }, 30_000);

  it("IMP-M4-05 fails closed when a runtime entity is not anchored to the sealed runtime bundle", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withDialogueRuntime: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    const base = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-m4-runtime-anchor-base" });
    await prisma!.database().importedEntitySource.create({
      data: {
        sourceKey: "workspace-v1:p1:ConversationThread:tampered-runtime",
        entityType: "ConversationThread",
        entityId: "tampered-runtime",
        sourceStorageKey: "projects/p1/project.json",
        sourceDigest: snapshot.sealed.runtimeBundleDigest,
        provenanceStatus: "reference_only",
        firstRunId: base.run.id,
        lastRunId: base.run.id,
      },
    });
    const result = await new MigrationVerifyService(prisma!, prepared.repository).verify(snapshot.outputPath, base.run.id, repoRoot);
    expect(result.report.passed).toBe(false);
    expect(result.report.checks.sourceMismatchCount).toBe(1);
    expect(result.report.errors).toContain("MIGRATION_SOURCE_DIGEST_MISMATCH");
  }, 30_000);

  it("IMP-M3-FULL-01 runs every shadow slice in dependency order and replays with the same aggregate digest", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, {
      withScriptHistory: true,
      withStoryStructure: true,
      withStoryboard: true,
      withAssetVisuals: true,
      withTasks: "complete",
      withCandidates: true,
      withLayout: true,
      withExports: true,
      withSettings: true,
      withDialogueRuntime: true,
      withPendingDialogue: true,
    });
    const decisionsPath = await writeDecisions(snapshot, []);
    const importer = new FullShadowImporter(prisma!, prepared.repository);
    const first = await importer.import(snapshot.outputPath, decisionsPath, { workspaceRoot: path.join(prepared.root!, "workspace"), runIdPrefix: "shadow-full-a" });
    expect(first.status).toBe("succeeded");
    expect(FULL_SHADOW_SLICE_ORDER.indexOf("dialogue")).toBeLessThan(FULL_SHADOW_SLICE_ORDER.indexOf("providers"));
    expect(first.slices.map((slice) => slice.slice)).toEqual([...FULL_SHADOW_SLICE_ORDER]);
    expect(first.slices.every((slice) => slice.status === "succeeded")).toBe(true);
    const counts = {
      projects: await prisma!.database().project.count(),
      chapters: await prisma!.database().chapter.count(),
      stories: await prisma!.database().storyVersion.count(),
      shots: await prisma!.database().shot.count(),
      assets: await prisma!.database().asset.count(),
      threads: await prisma!.database().conversationThread.count(),
    };
    const replay = await importer.import(snapshot.outputPath, decisionsPath, { workspaceRoot: path.join(prepared.root!, "workspace"), runIdPrefix: "shadow-full-b" });
    expect(replay.status).toBe("succeeded");
    expect(replay.reportDigest).toBe(first.reportDigest);
    expect({
      projects: await prisma!.database().project.count(),
      chapters: await prisma!.database().chapter.count(),
      stories: await prisma!.database().storyVersion.count(),
      shots: await prisma!.database().shot.count(),
      assets: await prisma!.database().asset.count(),
      threads: await prisma!.database().conversationThread.count(),
    }).toEqual(counts);
  }, 60_000);

  it("IMP-M3-FULL-02 stops at the first blocked prerequisite instead of running downstream slices", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "four_panel" });
    const decisionsPath = await writeDecisions(snapshot, []);
    const result = await new FullShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { workspaceRoot: path.join(prepared.root!, "workspace"), runIdPrefix: "shadow-full-blocked" });
    expect(result.status).toBe("blocked");
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0]).toMatchObject({ slice: "project-chapter", status: "blocked" });
    expect(await prisma!.database().migrationRun.count()).toBe(1);
    expect(await prisma!.database().project.count()).toBe(0);
  }, 30_000);

  it("IMP-M4-FRESH-01 produces identical full-shadow inventories on two fresh DBs and verifies every slice", async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "airoaming-g3-m4-source-"));
    const databaseRoots = await Promise.all([
      mkdtemp(path.join(os.tmpdir(), "airoaming-g3-m4-db-a-")),
      mkdtemp(path.join(os.tmpdir(), "airoaming-g3-m4-db-b-")),
    ]);
    const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]] as const));
    const clients: PrismaService[] = [];
    try {
      const snapshot = await createSnapshot(sourceRoot, { p1: "vertical_scroll" }, {
        withScriptHistory: true,
        withStoryStructure: true,
        withStoryboard: true,
        withCharacters: true,
        withAssets: true,
        withAssetVisuals: true,
        withTasks: "complete",
        withCandidates: true,
        withLayout: true,
        withExports: true,
        withSettings: true,
        withDialogueRuntime: true,
        withPendingDialogue: true,
      });
      const decisionsPath = path.join(sourceRoot, "decisions.json");
      await writeFile(decisionsPath, `${JSON.stringify(createMigrationDecisionArtifact(snapshot.sourceManifest.manifestDigest, []), null, 2)}\n`);
      const results: Array<{ full: Awaited<ReturnType<FullShadowImporter["import"]>>; inventory: Awaited<ReturnType<typeof readFreshInventory>> }> = [];
      for (const [index, databaseRoot] of databaseRoots.entries()) {
        const databasePath = path.join(databaseRoot, "db.sqlite");
        const handle = await open(databasePath, "wx", 0o600);
        await handle.close();
        const databaseUrl = `file:${databasePath}`;
        await deploy(databaseUrl);
        process.env.AIROAMING_PERSISTENCE_MODE = "db";
        process.env.DATABASE_URL = databaseUrl;
        const client = new PrismaService();
        await client.onModuleInit();
        clients.push(client);
        const full = await new FullShadowImporter(client).import(snapshot.outputPath, decisionsPath, { workspaceRoot: path.join(sourceRoot, "workspace"), runIdPrefix: "m4-fresh" });
        expect(full.status).toBe("succeeded");
        expect(full.slices).toHaveLength(FULL_SHADOW_SLICE_ORDER.length);
        expect(full.slices.every((slice) => slice.status === "succeeded")).toBe(true);
        const verifier = new MigrationVerifyService(client);
        for (const slice of full.slices) {
          const verification = await verifier.verify(snapshot.outputPath, slice.runId, repoRoot);
          expect(verification.report.passed, `slice ${index}:${slice.slice}`).toBe(true);
          expect(verification.report.checks).toMatchObject({ integrityCheck: "ok", foreignKeyViolationCount: 0, openBlockerCount: 0, sourceMismatchCount: 0, unregisteredEntityTypeCount: 0 });
        }
        results.push({ full, inventory: await readFreshInventory(client) });
      }
      expect(results[1]!.full.reportDigest).toBe(results[0]!.full.reportDigest);
      expect(results[1]!.full.slices.map(({ slice, status, reportDigest, counts }) => ({ slice, status, reportDigest, counts }))).toEqual(results[0]!.full.slices.map(({ slice, status, reportDigest, counts }) => ({ slice, status, reportDigest, counts })));
      for (const table of FRESH_INVENTORY_TABLES) {
        expect(results[1]!.inventory.tables[table], `inventory table ${table}`).toEqual(results[0]!.inventory.tables[table]);
      }
      expect(results[1]!.inventory.digest).toBe(results[0]!.inventory.digest);
    } finally {
      for (const client of clients) await client.onModuleDestroy();
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await rm(sourceRoot, { recursive: true, force: true });
      for (const databaseRoot of databaseRoots) await rm(databaseRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it("IMP-M4-API-01 rebuilds the public workbench DTO from a full DB shadow without touching legacy files", async () => {
    const prepared = await prepare();
    const sourceRoot = path.join(prepared.root!, "api-dto-source");
    await mkdir(sourceRoot, { recursive: true });
    const snapshot = await createSnapshot(sourceRoot, { p1: "vertical_scroll" }, {
      withScriptHistory: true,
      withStoryStructure: true,
      withStoryboard: true,
      withAssetVisuals: true,
      withTasks: "complete",
      withCandidates: true,
      withLayout: true,
      withExports: true,
      withSettings: true,
      withDialogueRuntime: true,
      withPendingDialogue: true,
    });
    const decisionsPath = await writeDecisions(snapshot, []);
    const legacyWorkspace = path.join(sourceRoot, "workspace");
    process.env.AIROAMING_WORKSPACE_ROOT = legacyWorkspace;
    delete process.env.AIROAMING_PERSISTENCE_MODE;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const fileSnapshot = await app.get(ProjectsService).getWorkbenchSnapshot("p1");
    const legacyProjectFile = await readFile(path.join(legacyWorkspace, "projects", "p1", "project.json"), "utf8");
    const legacyScriptFile = await readFile(path.join(legacyWorkspace, "projects", "p1", "chapters", "chapter-001", "script.md"), "utf8");
    await app.close();
    app = null;

    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.DATABASE_URL = `file:${path.join(prepared.root!, "db.sqlite")}`;
    await new FullShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { workspaceRoot: legacyWorkspace, runIdPrefix: "m4-api" });
    const expectedCharacterBytes = await readFile(path.join(legacyWorkspace, "projects", "p1", "assets", "characters", "asset_001.png"));
    const archivedWorkspace = path.join(prepared.root!, "archived-workspace");
    await rename(legacyWorkspace, archivedWorkspace);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const dbProjects = app.get(ProjectsService);
    const dbSnapshot = await dbProjects.getWorkbenchSnapshot(PrismaMigrationLedgerRepository.stableEntityId("Project", "workspace-v1:p1:Project:p1"));
    expect(semanticWorkbenchSnapshot(dbSnapshot)).toEqual(semanticWorkbenchSnapshot(fileSnapshot));
    const dbAssets = await prisma!.database().asset.findMany({ orderBy: { storageKey: "asc" } });
    expect(dbAssets).toHaveLength(2);
    expect(dbAssets.find((item) => item.storageKey.endsWith("asset_001"))).toMatchObject({ status: "ready", sha256: `sha256:${createHash("sha256").update(expectedCharacterBytes).digest("hex")}`, bytes: expectedCharacterBytes.byteLength });
    expect((await prisma!.database().project.findFirstOrThrow()).updatedAt).toBeInstanceOf(Date);
    const targetProjectId = PrismaMigrationLedgerRepository.stableEntityId("Project", "workspace-v1:p1:Project:p1");
    const targetChapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", "workspace-v1:p1:Chapter:p1-chapter-001");
    await dbProjects.saveChapterDraft(targetProjectId, targetChapterId, { sourceText: "数据库侧写入，不回写旧工作区。\n" });
    await expect(readFile(path.join(legacyWorkspace, "projects", "p1", "project.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(legacyWorkspace, "projects", "p1", "chapters", "chapter-001", "script.md"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(archivedWorkspace, "projects", "p1", "project.json"), "utf8")).toBe(legacyProjectFile);
    expect(await readFile(path.join(archivedWorkspace, "projects", "p1", "chapters", "chapter-001", "script.md"), "utf8")).toBe(legacyScriptFile);
    expect((await dbProjects.getWorkbenchSnapshot(targetProjectId)).currentChapter?.sourceText).toContain("数据库侧写入");
  }, 120_000);

  it("IMP-A12-01 imports legacy layout into a sealed-source-aware working copy", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withScriptHistory: true, withStoryStructure: true, withStoryboard: true, withAssetVisuals: true, withTasks: "complete", withCandidates: true, withLayout: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-base" });
    await new ScriptOutlineShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-script" });
    await new StoryShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-story" });
    await new StoryboardShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-board" });
    await new CharacterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-characters" });
    await new AssetShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-assets" });
    await new AssetVisualShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-visuals", workspaceRoot: path.join(prepared.root!, "workspace") });
    await new TaskShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-tasks" });
    await new CandidateShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-candidates" });
    await new CandidateLockShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-lock" });
    const result = await new LayoutShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-layout" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ LayoutWorkingCopy: 1 });
    const workingCopy = await prisma!.database().layoutWorkingCopy.findFirstOrThrow();
    expect(workingCopy).toMatchObject({ documentKind: "legacy_chapter_layout_v1", schemaVersion: 1, sourceLockSetDigest: expect.stringMatching(/^sha256:/), rowVersion: 0 });
    expect((workingCopy.documentJson as { sourceResolution: string }).sourceResolution).toBe("complete");
    expect(await prisma!.database().chapter.findFirstOrThrow()).toMatchObject({ currentLayoutRevisionId: null });
    await new LayoutShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a12-layout-replay" });
    expect(await prisma!.database().layoutWorkingCopy.count()).toBe(1);
  }, 30_000);

  it("IMP-A13-01 imports legacy export evidence as unresolved history without current", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withExports: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a13-base" });
    const result = await new ExportShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a13-exports" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ ExportRevision: 1 });
    const revision = await prisma!.database().exportRevision.findFirstOrThrow();
    expect(revision).toMatchObject({ kind: "layout_publication", origin: "legacy_import", status: "failed", completionApplicability: "legacy_unresolved", manifestSchemaVersion: 1 });
    expect(await prisma!.database().exportArtifact.count()).toBe(0);
    expect(await prisma!.database().chapter.findFirstOrThrow()).toMatchObject({ currentExportRevisionId: null });
    await new ExportShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a13-replay" });
    expect(await prisma!.database().exportRevision.count()).toBe(1);
  }, 30_000);

  it("IMP-A14-01 imports redacted provider metadata without importing secrets", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withSettings: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    const base = await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a14-base" });
    expect(base.run.status).toBe("succeeded");
    const result = await new ProviderShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a14-providers" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ ProviderConfig: 2, CredentialMetadata: 2, AppPreference: 1 });
    const providers = await prisma!.database().providerConfig.findMany({ orderBy: { providerId: "asc" } });
    expect(providers).toHaveLength(2);
    expect(providers.every((provider) => provider.enabled === false)).toBe(true);
    const credentials = await prisma!.database().credentialMetadata.findMany();
    expect(credentials.every((row) => row.configured === false && row.secretRef === null)).toBe(true);
    expect(await prisma!.database().appPreference.findUnique({ where: { id: "primary" } })).toMatchObject({ theme: "dark", defaultTextProviderId: expect.any(String), activeImageProviderId: expect.any(String) });
    await new ProviderShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a14-replay" });
    expect(await prisma!.database().providerConfig.count()).toBe(2);
    expect(await prisma!.database().credentialMetadata.count()).toBe(2);
  }, 30_000);

  it("IMP-A15-01 imports captured dialogue history and closes legacy runtime sessions", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withDialogueRuntime: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a15-base" });
    const result = await new DialogueShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a15-dialogue" });
    expect(result.run.status).toBe("succeeded");
    expect(result.report.summary.entityCounts).toMatchObject({ ConversationThread: 1, ConversationMessage: 2, DialogueToolResult: 1, DialogueRuntimeSession: 1 });
    expect(await prisma!.database().conversationThread.count()).toBe(1);
    expect(await prisma!.database().conversationMessage.count()).toBe(2);
    expect(await prisma!.database().dialogueToolResult.count()).toBe(1);
    expect(await prisma!.database().dialogueRuntimeSession.findFirstOrThrow()).toMatchObject({ runtime: "opencode", status: "closed", variant: "legacy_import" });
    await new DialogueShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a15-replay" });
    expect(await prisma!.database().conversationThread.count()).toBe(1);
    expect(await prisma!.database().conversationMessage.count()).toBe(2);
  }, 30_000);

  it("IMP-A15-02 imports captured pending dialogue artifacts with stable evidence", async () => {
    const prepared = await prepare();
    const snapshot = await createSnapshot(prepared.root!, { p1: "vertical_scroll" }, { withDialogueRuntime: true, withPendingDialogue: true });
    const decisionsPath = await writeDecisions(snapshot, []);
    await new ProjectChapterShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a15-pending-base" });
    const result = await new DialogueShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a15-pending-dialogue" });
    expect(result.run.status).toBe("succeeded");
    expect(result.run.verification).toMatchObject({ dialogueCaptured: true, pendingDialogueCaptured: true });
    expect(result.report.summary.entityCounts).toMatchObject({ PendingDialogueArtifact: 1 });
    const projectId = PrismaMigrationLedgerRepository.stableEntityId("Project", "workspace-v1:p1:Project:p1");
    const chapterId = PrismaMigrationLedgerRepository.stableEntityId("Chapter", "workspace-v1:p1:Chapter:p1-chapter-001");
    const threadId = PrismaMigrationLedgerRepository.stableEntityId("ConversationThread", "workspace-v1:p1:ConversationThread:legacy-thread-001");
    const artifact = await prisma!.database().pendingDialogueArtifact.findFirstOrThrow();
    expect(artifact).toMatchObject({ projectId, chapterId, threadId, kind: "script_import", status: "pending", activeSlotKey: "workspace-v1:p1:PendingDialogueSlot:legacy-thread-001:script_import", resolvedAt: null });
    expect(artifact.payloadDigest).toBe(digestCanonicalJson(artifact.payloadJson));
    expect(await prisma!.database().importedEntitySource.findFirst({ where: { entityType: "PendingDialogueArtifact" } })).toMatchObject({ sourceStorageKey: "runtime-bundle.json", sourceDigest: snapshot.sealed.runtimeBundleDigest, entityId: artifact.id });
    await new DialogueShadowImporter(prisma!, prepared.repository).import(snapshot.outputPath, decisionsPath, { runId: "shadow-a15-pending-replay" });
    expect(await prisma!.database().pendingDialogueArtifact.count()).toBe(1);
  }, 30_000);
});
