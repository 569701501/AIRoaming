import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  serializeChapterScriptMarkdownV1,
  serializeScriptOutlineMarkdownV1,
  type ImportAnalysisOutputV1,
} from "@airoaming/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScriptImportWorkerService } from "../dialogue/script-import-worker.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { ProjectsModule } from "./projects.module.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectDeleteOutboxService } from "./project-delete-outbox.service.js";
import { ProjectScriptCommandRepository } from "./project-script-command.repository.js";
import { ScriptWorkflowSourceRepository } from "./script-workflow-source.repository.js";
import { ScriptVersionRepository } from "./versioning/script-version.repository.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCHEMA_PATH = path.join(REPO_ROOT, "apps/server/prisma/schema.prisma");
const ENVIRONMENT_NAMES = ["AIROAMING_PERSISTENCE_MODE", "AIROAMING_WORKSPACE_ROOT", "AIROAMING_DATA_ROOT", "DATABASE_URL"] as const;

async function deploy(databaseUrl: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, "apps/server/node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", SCHEMA_PATH], { cwd: REPO_ROOT, env: { ...process.env, DATABASE_URL: databaseUrl } });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

function chapterMarkdown(order: number, title: string): string {
  return serializeChapterScriptMarkdownV1({
    chapterOrder: order,
    chapterTitle: title,
    type: "悬疑",
    theme: "信任",
    style: "紧凑",
    comicForm: "竖向条漫",
    targetLength: "按本章确认原稿范围完整整理",
    logline: "主角发现线索。",
    chapterGoal: "确认真相。",
    coreConflict: "时间不足。",
    emotionalArc: "疑惑到警觉。",
    endingHook: "门外出现脚步声。",
    highlights: ["线索", "选择", "悬念"],
    visualAtmosphere: "雨夜",
    colorDirection: "冷蓝",
    visualMotif: "旧钥匙",
    scenes: [{ order: 1, name: "旧屋", location: "旧屋", time: "夜", atmosphere: "压抑", characters: "林舟", description: "林舟找到一把旧钥匙。", actions: "他擦去钥匙上的灰。", dialogue: "林舟：这不是我的钥匙。", narration: "雨声越来越近。", endingPoint: "门外传来脚步声。" }],
    endingEvent: "林舟握紧钥匙。",
    suspense: "门外是谁？",
    nextChapterLead: "脚步声停在门口。",
  });
}

function analysis(blockRefs: string[]): ImportAnalysisOutputV1 {
  return {
    schemaVersion: "import-analysis/1.0",
    outlineRole: "observed",
    sourceProfile: { contentType: "script", explicitBoundaryLevel: "chapter" },
    observedOutline: {
      sourceTitle: { value: "测试原稿", basis: "source" },
      synopsis: "林舟先发现钥匙，再面对门外来客。",
      mainCharacters: [{ name: "林舟", aliases: [], observedIdentity: "调查者", observedPursuit: "寻找真相", relationships: [], sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[0]!, endBlockRef: blockRefs[1]! }] }],
      plotStages: [{ order: 1, label: "发现", summary: "找到钥匙并听见脚步", sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[0]!, endBlockRef: blockRefs[1]! }] }],
      endingObservation: { kind: "open", summary: "来客身份未明", sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[1]!, endBlockRef: blockRefs[1]! }] },
    },
    chapterCandidates: blockRefs.map((blockRef, index) => ({
      localRef: `chapter-${String(index + 1).padStart(3, "0")}`,
      order: index + 1,
      title: { value: index === 0 ? "旧钥匙" : "门外来客", basis: "suggested" as const },
      summary: index === 0 ? "发现钥匙" : "听见来客",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef }],
      boundaryMode: "preserved_source_unit" as const,
      boundaryEvidence: {
        start: { type: index === 0 ? "source_start" as const : "explicit_heading" as const, anchorBlockRef: blockRef, description: "章节开始" },
        end: { type: index === blockRefs.length - 1 ? "source_end" as const : "scene_sequence_end" as const, anchorBlockRef: blockRef, description: "章节结束" },
      },
      confidence: "high" as const,
      warnings: [],
    })),
    excludedRanges: [],
    unresolvedItems: [],
    globalWarnings: [],
  };
}

describe("script workflow source repository", () => {
  let app: INestApplicationContext | null = null;
  let root: string | null = null;
  const previousEnvironment = new Map(ENVIRONMENT_NAMES.map((name) => [name, process.env[name]] as const));

  async function prepare(): Promise<void> {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), `airoaming-script-flow-${randomUUID()}-`)));
    const dataRoot = path.join(root, "data");
    const workspaceRoot = path.join(root, "workspace");
    const databasePath = path.join(dataRoot, "db", "airoaming.sqlite");
    await mkdir(path.dirname(databasePath), { recursive: true });
    const handle = await open(databasePath, "wx", 0o600);
    await handle.close();
    const databaseUrl = `file:${databasePath}`;
    const deployed = await deploy(databaseUrl);
    expect(deployed.code, deployed.output).toBe(0);
    process.env.AIROAMING_PERSISTENCE_MODE = "db";
    process.env.AIROAMING_WORKSPACE_ROOT = workspaceRoot;
    process.env.AIROAMING_DATA_ROOT = dataRoot;
    process.env.DATABASE_URL = databaseUrl;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
  }

  afterEach(async () => {
    await app?.close();
    app = null;
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it("persists immutable import provenance, creates all chapter states, and confirms one import pending directly", async () => {
    await prepare();
    const projects = app!.get(ProjectsService);
    const repository = app!.get(ScriptWorkflowSourceRepository);
    const scripts = app!.get(ScriptVersionRepository);
    const prisma = app!.get(PrismaService).database();
    const project = await projects.createProject({ name: "双流程导入", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });

    const raw = await repository.createRawSource(project.id, { inputMode: "paste", contentTypeHint: "script", documents: [{ name: "主稿", mediaType: "text/plain", sourceText: "第一章 旧钥匙\n\n第二章 门外来客" }] });
    expect(await repository.createRawSource(project.id, { inputMode: "paste", contentTypeHint: "script", documents: [{ name: "主稿", mediaType: "text/plain", sourceText: "第一章 旧钥匙\n\n第二章 门外来客" }] })).toMatchObject({ id: raw.id, replayed: true });
    const blocks = await prisma.scriptRawSourceBlock.findMany({ where: { rawSourceVersionId: raw.id }, orderBy: { globalOrder: "asc" } });
    await expect(prisma.scriptRawSourceVersion.update({ where: { id: raw.id }, data: { contentTypeHint: "mixed" } })).rejects.toThrow();
    expect((await prisma.scriptRawSourceVersion.findUniqueOrThrow({ where: { id: raw.id } })).contentTypeHint).toBe("script");

    const candidate = await repository.createAnalysisCandidate({ projectId: project.id, rawSourceVersionId: raw.id, analysis: analysis(blocks.map((item) => item.blockRef)), promptPackVersion: "import-analyze/test" });
    const map = await repository.confirmAnalysisCandidate(project.id, candidate.id);
    expect(map.chapters).toHaveLength(2);
    expect(map.chapters[0]).not.toHaveProperty("beats");
    const batch = await repository.startImportBatch(project.id, map.id);
    expect(batch.items).toHaveLength(2);
    expect(await prisma.chapter.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      await prisma.chapter.findUniqueOrThrow({
        where: { projectId_order: { projectId: project.id, order: 1 } },
      }),
    ).toMatchObject({ title: "旧钥匙" });

    const item = batch.items[0]!;
    await repository.beginImportItem(project.id, item.id);
    const markdown = chapterMarkdown(1, "旧钥匙");
    await repository.markImportItemVerifying(project.id, item.id, markdown);
    const sourceBlock = blocks[0]!;
    const outputLineCount = markdown.trimEnd().split("\n").length;
    const fidelity = {
      schemaVersion: "import-fidelity/1.0",
      sourceCoverage: [{ sourceRange: { sourceRef: sourceBlock.sourceRef, startBlockRef: sourceBlock.blockRef, endBlockRef: sourceBlock.blockRef }, outputLineRanges: [{ startLineRef: "line-000001", endLineRef: `line-${String(outputLineCount).padStart(6, "0")}` }], disposition: "reformatted_in_body", note: "内容完整整理进正文" }],
      unsupportedAdditions: [], sequenceFindings: [], dialogueFindings: [], entityFindings: [], metadataFindings: [], uncertainties: [],
    };
    const verified = await repository.recordImportFidelity({ projectId: project.id, itemId: item.id, sourceText: markdown, report: fidelity, materializePromptVersion: "materialize/test", verifyPromptVersion: "verify/test" });
    expect(verified).toMatchObject({ hasHardIssues: false, pendingId: expect.any(String) });
    const pending = await scripts.getPendingSuggestion({ projectId: project.id, chapterId: item.chapterId });
    expect(pending).toMatchObject({ kind: "import", sourcePolicyVersion: "import-chapter-materialize/1.0" });
    expect(pending!.sourceBindings.map((binding) => binding.role)).toEqual(["raw_source", "analysis", "chapter_map", "map_item", "batch_item", "fidelity_report"]);
    await expect(scripts.adoptPendingSuggestion({ projectId: project.id, chapterId: item.chapterId }, { pendingId: pending!.id, expectedPendingRowVersion: pending!.rowVersion, expectedPendingDigest: pending!.digest, expectedChapterRowVersion: pending!.chapterRowVersion })).rejects.toMatchObject({ code: "IMPORT_PENDING_ACTION_NOT_ALLOWED" });
    await expect(scripts.discardPendingSuggestion({ projectId: project.id, chapterId: item.chapterId }, { pendingId: pending!.id, expectedPendingRowVersion: pending!.rowVersion })).rejects.toMatchObject({ code: "IMPORT_PENDING_ACTION_NOT_ALLOWED" });

    const confirmed = await repository.confirmImportPending({
      projectId: project.id,
      chapterId: item.chapterId,
      pendingId: pending!.id,
      expectedPendingRowVersion: pending!.rowVersion,
      expectedPendingDigest: pending!.digest,
      expectedChapterRowVersion: pending!.chapterRowVersion,
    });
    expect(await prisma.chapterScriptVersion.findUniqueOrThrow({ where: { id: confirmed.scriptVersionId } })).toMatchObject({ origin: "import", sourceText: markdown.trimEnd() });
    expect(await prisma.scriptImportBatchItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: "confirmed", confirmedScriptVersionId: confirmed.scriptVersionId });
    expect(await scripts.getPendingSuggestion({ projectId: project.id, chapterId: item.chapterId })).toBeNull();

    const outbox = app!.get(ProjectDeleteOutboxService);
    await outbox.requestProjectDelete(project.id);
    await expect(outbox.processNext("script-flow-test")).resolves.toMatchObject({
      eventType: "project.delete_files",
      status: "processed",
    });
    await expect(outbox.purgeDeletedProject(project.id)).resolves.toEqual({
      projectId: project.id,
      purged: true,
    });
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
    expect(
      await prisma.scriptRawSourceVersion.count({ where: { projectId: project.id } }),
    ).toBe(0);
  }, 30_000);

  it("reopens the same SQLite database and restarts an interrupted import item from its chapter boundary", async () => {
    await prepare();
    const projects = app!.get(ProjectsService);
    const repository = app!.get(ScriptWorkflowSourceRepository);
    const prisma = app!.get(PrismaService).database();
    const project = await projects.createProject({ name: "导入中断恢复", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const raw = await repository.createRawSource(project.id, {
      inputMode: "paste",
      contentTypeHint: "script",
      documents: [{ name: "主稿", mediaType: "text/plain", sourceText: "第一章 旧钥匙\n\n第二章 门外来客" }],
    });
    const blocks = await prisma.scriptRawSourceBlock.findMany({
      where: { rawSourceVersionId: raw.id },
      orderBy: { globalOrder: "asc" },
    });
    const candidate = await repository.createAnalysisCandidate({
      projectId: project.id,
      rawSourceVersionId: raw.id,
      analysis: analysis(blocks.map((item) => item.blockRef)),
      promptPackVersion: "import-analyze/restart-test",
    });
    const map = await repository.confirmAnalysisCandidate(project.id, candidate.id);
    const batch = await repository.startImportBatch(project.id, map.id);
    const interruptedItem = batch.items[0]!;
    const untouchedItem = batch.items[1]!;

    await repository.beginImportItem(project.id, interruptedItem.id);
    expect(await prisma.scriptImportBatchItem.findUniqueOrThrow({ where: { id: interruptedItem.id } })).toMatchObject({
      status: "materializing",
      attempt: 1,
    });

    await app!.close();
    app = null;
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    const reopenedRepository = app.get(ScriptWorkflowSourceRepository);
    const reopenedPrisma = app.get(PrismaService).database();
    const processClaimedItem = vi.fn(async (input: { projectId: string; itemId: string }) => {
      const context = await reopenedRepository.getImportItemWorkContext(input.projectId, input.itemId);
      expect(context.item).toMatchObject({ id: interruptedItem.id, status: "materializing", attempt: 2 });
    });
    const worker = new ScriptImportWorkerService(
      reopenedRepository,
      { processClaimedItem } as never,
    );

    await worker.runOnce();

    expect(processClaimedItem).toHaveBeenCalledOnce();
    expect(await reopenedPrisma.scriptImportBatchItem.findUniqueOrThrow({ where: { id: interruptedItem.id } })).toMatchObject({
      status: "materializing",
      attempt: 2,
      errorCode: null,
    });
    expect(await reopenedPrisma.scriptImportBatchItem.findUniqueOrThrow({ where: { id: untouchedItem.id } })).toMatchObject({
      status: "queued",
      attempt: 0,
    });
  }, 30_000);

  it("seals AI pending to the confirmed outline card and previous formal chapter", async () => {
    await prepare();
    const projects = app!.get(ProjectsService);
    const commands = app!.get(ProjectScriptCommandRepository);
    const repository = app!.get(ScriptWorkflowSourceRepository);
    const scripts = app!.get(ScriptVersionRepository);
    const prisma = app!.get(PrismaService).database();
    const project = await projects.createProject({ name: "双流程创作", type: "comic", comicFormat: "vertical_scroll", artStyle: "comic_style" });
    const outlineText = serializeScriptOutlineMarkdownV1({ title: "双流程创作", genreStyle: "悬疑", episodeLength: "短篇", chapterCount: 2, synopsis: "两章故事", mainCharacters: ["林舟（主角）：寻找真相"], plotStages: ["开端：发现钥匙", "发展：面对来客"], endingDirection: "确认来客身份", chapterCards: [
      { order: 1, title: "旧钥匙", chapterGoal: "发现钥匙", coreConflict: "线索不足", majorTurn: "听见脚步", endingHook: "来客敲门", nextChapterBridge: "打开门" },
      { order: 2, title: "门外来客", chapterGoal: "确认身份", coreConflict: "无法信任", majorTurn: "来客说出暗号", endingHook: "暗号来自父亲", nextChapterBridge: "故事结束" },
    ] });
    const outline = await commands.saveScriptOutline(project.id, { sourceText: outlineText, threadId: "thread", messageId: "message", toolCallId: "outline" });
    await commands.confirmScriptOutline(project.id, outline.outlineId);
    const chapter1 = await prisma.chapter.findFirstOrThrow({ where: { projectId: project.id, order: 1 } });
    const first = chapterMarkdown(1, "旧钥匙").replace("按本章确认原稿范围完整整理", "约 1200 字");
    const working = await scripts.updateWorkingCopy({ projectId: project.id, chapterId: chapter1.id }, { sourceText: first, expectedChapterRowVersion: chapter1.rowVersion });
    await scripts.publish({ projectId: project.id, chapterId: chapter1.id }, { expectedCurrentScriptVersionId: null, expectedWorkingDigest: working.value.digest, expectedChapterRowVersion: working.value.chapterRowVersion, createNextChapter: true, nextChapterTitle: "不应采用的调用方标题" });
    await expect(repository.getAiChapterGenerationContext({
      projectId: project.id,
      chapterId: chapter1.id,
      outlineId: outline.outlineId,
    })).rejects.toMatchObject({ code: "CHAPTER_VERSION_CONFLICT" });
    const chapter2 = await prisma.chapter.findFirstOrThrow({ where: { projectId: project.id, order: 2 } });
    expect(chapter2.title).toBe("门外来客");
    const second = chapterMarkdown(2, "门外来客").replace("按本章确认原稿范围完整整理", "约 1200 字");
    const context = await repository.getAiChapterGenerationContext({ projectId: project.id, chapterId: chapter2.id, outlineId: outline.outlineId });
    expect(context).toMatchObject({
      targetCard: { order: 2, title: "门外来客" },
      previousCard: { order: 1, title: "旧钥匙" },
      nextCard: null,
      previousScript: { chapterId: chapter1.id, sourceText: first.trimEnd() },
      sourceBindings: [{ role: "outline" }, { role: "chapter_card" }, { role: "previous_script" }],
    });
    await expect(repository.createAiChapterPending({
      projectId: project.id,
      chapterId: chapter2.id,
      outlineId: outline.outlineId,
      expectedSourceSetDigest: context.sourceSetDigest.replace(/.$/, "0") as `sha256:${string}`,
      sourceText: second,
      threadId: "thread",
      messageId: "message",
      toolCallId: "chapter-2-stale",
      summary: "生成第二章",
    })).rejects.toMatchObject({ code: "CURRENT_VERSION_CHANGED" });
    const projectThread = await prisma.conversationThread.create({ data: {
      id: "thread-project-story",
      projectId: project.id,
      chapterId: null,
      stepKey: "project_story",
      scopeKey: "project",
      title: "项目故事",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } });
    const projectMessage = await prisma.conversationMessage.create({ data: {
      id: "message-project-story",
      threadId: projectThread.id,
      role: "assistant",
      content: "已生成章节候选",
      status: "completed",
      providerId: "self",
      modelId: "test",
      errorJson: undefined,
      errorSchemaVersion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    } });
    const pending = await repository.createAiChapterPending({
      projectId: project.id,
      chapterId: chapter2.id,
      outlineId: outline.outlineId,
      expectedSourceSetDigest: context.sourceSetDigest,
      sourceText: second,
      threadId: projectThread.id,
      messageId: projectMessage.id,
      toolCallId: "chapter-2",
      summary: "根据已确认大纲生成第二章",
    });
    expect(pending.sourceSetDigest).toMatch(/^sha256:/);
    expect(await scripts.getPendingSuggestion({ projectId: project.id, chapterId: chapter2.id })).toMatchObject({ kind: "ai", sourceBindings: [{ role: "outline" }, { role: "chapter_card" }, { role: "previous_script" }] });
    expect(await prisma.chapterScriptPending.findUniqueOrThrow({ where: { id: pending.pendingId } })).toMatchObject({ threadId: null, messageId: null, toolCallId: null });
    expect(await prisma.chapterScriptRevision.findUniqueOrThrow({ where: { id: pending.revisionId } })).toMatchObject({ chapterId: chapter2.id, source: "ai_tool", operation: "generate_script_from_outline", threadId: null, messageId: null, toolCallId: null });
    const pendingDto = await scripts.getPendingSuggestion({ projectId: project.id, chapterId: chapter2.id });
    await scripts.discardPendingSuggestion(
      { projectId: project.id, chapterId: chapter2.id },
      { pendingId: pendingDto!.id, expectedPendingRowVersion: pendingDto!.rowVersion },
    );
    const emptyChapter2 = await prisma.chapter.findUniqueOrThrow({ where: { id: chapter2.id } });
    const secondWorking = await scripts.updateWorkingCopy(
      { projectId: project.id, chapterId: chapter2.id },
      { sourceText: second, expectedChapterRowVersion: emptyChapter2.rowVersion },
    );
    const revisionContext = await repository.getChapterRevisionContinuityContext({
      projectId: project.id,
      chapterId: chapter2.id,
    });
    expect(revisionContext).toMatchObject({
      chapter: { id: chapter2.id, order: 2 },
      previousScript: { chapterId: chapter1.id, sourceText: first.trimEnd() },
    });
    const revisionInput = {
      sourceText: second.replace("场景1", "场景1（修订）"),
      summary: "修订第二章",
      threadId: "thread",
      messageId: "message",
      toolCallId: "chapter-2-revision",
      operation: "update_chapter_draft" as const,
    };
    await expect(commands.createAiPendingSuggestion(project.id, chapter2.id, {
      ...revisionInput,
      continuitySource: {
        previousChapterId: revisionContext.previousScript!.chapterId,
        previousScriptVersionId: revisionContext.previousScript!.id,
        previousSourceDigest: `sha256:${"0".repeat(64)}`,
      },
    })).rejects.toMatchObject({ code: "CURRENT_VERSION_CHANGED" });
    expect(await scripts.getPendingSuggestion({ projectId: project.id, chapterId: chapter2.id })).toBeNull();
    await commands.createAiPendingSuggestion(project.id, chapter2.id, {
      ...revisionInput,
      continuitySource: {
        previousChapterId: revisionContext.previousScript!.chapterId,
        previousScriptVersionId: revisionContext.previousScript!.id,
        previousSourceDigest: revisionContext.previousScript!.sourceDigest,
      },
    });
    const revisionPending = await scripts.getPendingSuggestion({ projectId: project.id, chapterId: chapter2.id });
    expect(revisionPending).toMatchObject({ kind: "legacy", sourceBindings: [] });
    await scripts.discardPendingSuggestion(
      { projectId: project.id, chapterId: chapter2.id },
      { pendingId: revisionPending!.id, expectedPendingRowVersion: revisionPending!.rowVersion },
    );
    const chapter2AfterRevisionDiscard = await prisma.chapter.findUniqueOrThrow({ where: { id: chapter2.id } });
    const completedSecond = await scripts.publish(
      { projectId: project.id, chapterId: chapter2.id },
      { expectedCurrentScriptVersionId: null, expectedWorkingDigest: secondWorking.value.digest, expectedChapterRowVersion: chapter2AfterRevisionDiscard.rowVersion, createNextChapter: true, nextChapterTitle: "不应创建的第三章" },
    );
    expect(completedSecond.createdNextChapter).toBe(false);
    expect(await prisma.chapter.count({ where: { projectId: project.id } })).toBe(2);
  }, 30_000);
});
