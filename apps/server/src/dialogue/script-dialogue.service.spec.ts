import { describe, expect, it, vi } from "vitest";

import {
  serializeChapterScriptMarkdownV1,
  type ImportAnalysisOutputV1,
  type ProjectScriptOutline,
  type SendDialogueMessageRequest,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import type { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import type { ProjectsService } from "../projects/projects.service.js";
import type { AiChapterGenerationContext, ScriptWorkflowSourceRepository } from "../projects/script-workflow-source.repository.js";
import type { DialogueTurn } from "./dialogue-types.js";
import { ScriptDialogueService } from "./script-dialogue.service.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const blockRef = "source-001:block-000001";

function importAnalysis(blocking = false): ImportAnalysisOutputV1 {
  return {
    schemaVersion: "import-analysis/1.0",
    outlineRole: "observed",
    sourceProfile: { contentType: "script", explicitBoundaryLevel: "chapter" },
    observedOutline: {
      sourceTitle: { value: "旧钥匙", basis: "source" },
      synopsis: "林舟在旧屋发现钥匙。",
      mainCharacters: [{ name: "林舟", aliases: [], observedIdentity: "调查者", observedPursuit: "寻找真相", relationships: [], sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef }] }],
      plotStages: [{ order: 1, label: "发现", summary: "找到钥匙", sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef }] }],
      endingObservation: { kind: "open", summary: "门外出现脚步声", sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef }] },
    },
    chapterCandidates: [{
      localRef: "chapter-001",
      order: 1,
      title: { value: "旧钥匙", basis: "source" },
      summary: "林舟发现钥匙。",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef }],
      boundaryMode: "whole_source",
      boundaryEvidence: {
        start: { type: "source_start", anchorBlockRef: blockRef, description: "原稿开头" },
        end: { type: "source_end", anchorBlockRef: blockRef, description: "原稿结尾" },
      },
      confidence: blocking ? "low" : "high",
      warnings: blocking ? ["文件顺序待确认"] : [],
    }],
    excludedRanges: [],
    unresolvedItems: blocking ? [{ code: "SOURCE_ORDER_UNKNOWN", impact: "source_order", description: "请确认文件顺序", affectedBlockRefs: [blockRef] }] : [],
    globalWarnings: [],
  };
}

function chapterMarkdown(): string {
  return serializeChapterScriptMarkdownV1({
    chapterOrder: 2,
    chapterTitle: "门外来客",
    type: "悬疑",
    theme: "信任",
    style: "紧凑",
    comicForm: "竖向条漫",
    targetLength: "约 1200 字",
    logline: "林舟判断门外来客是否可信。",
    chapterGoal: "确认来客身份。",
    coreConflict: "开门可能暴露藏身处。",
    emotionalArc: "戒备到震惊。",
    endingHook: "暗号指向警局内鬼。",
    highlights: ["暗号", "选择", "内鬼"],
    visualAtmosphere: "雨夜",
    colorDirection: "冷蓝",
    visualMotif: "旧钥匙",
    scenes: [{ order: 1, name: "门内门外", location: "旧屋", time: "夜", atmosphere: "戒备", characters: "林舟、许澄", description: "许澄在门外说出暗号。", actions: "林舟握紧钥匙。", dialogue: "许澄：三短一长。", narration: "雨声掩住脚步。", endingPoint: "林舟拉开门闩。" }],
    endingEvent: "许澄递出警员名册。",
    suspense: "内鬼是谁？",
    nextChapterLead: "林舟开始核实名册。",
  });
}

function outline(): ProjectScriptOutline {
  return { id: "outline-1", projectId: "project-1", title: "雨夜证人", sourceText: "# 剧本大纲\n完整大纲", outlinePath: "/outline.md", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" } as ProjectScriptOutline;
}

function context(): AiChapterGenerationContext {
  const first = { order: 1, title: "旧钥匙", chapterGoal: "发现钥匙", coreConflict: "线索不足", majorTurn: "听见暗号", endingHook: "来客敲门", nextChapterBridge: "判断来客" };
  const second = { order: 2, title: "门外来客", chapterGoal: "确认身份", coreConflict: "无法信任", majorTurn: "说出暗号", endingHook: "暗号来自内鬼", nextChapterBridge: "追查内鬼" };
  return {
    project: { id: "project-1", name: "雨夜证人", storyTitle: "雨夜证人", genreTags: ["悬疑"], comicFormat: "vertical_scroll", artStyle: "comic_style" },
    outline: { id: "outline-1", title: "雨夜证人", sourceText: "# 剧本大纲\n完整大纲", sourceDigest: digest, document: { title: "雨夜证人", genreStyle: "悬疑", episodeLength: "短篇", chapterCount: 2, synopsis: "追查真相", mainCharacters: ["林舟（主角）：调查者"], plotStages: ["开端：发现钥匙"], endingDirection: "揭露内鬼", chapterCards: [first, second] } },
    chapter: { id: "chapter-2", order: 2, title: "门外来客", rowVersion: 0 },
    targetCard: second,
    previousCard: first,
    nextCard: null,
    previousScript: { id: "script-1", chapterId: "chapter-1", chapterTitle: "旧钥匙", sourceText: "上一章正式正文：门外响起三短一长。", sourceDigest: digest },
    sourceBindings: [],
    sourceSetDigest: digest,
  };
}

function snapshot(): WorkbenchSnapshot {
  return {
    project: { id: "project-1", name: "雨夜证人", storyTitle: "雨夜证人", genreTags: ["悬疑"], comicFormat: "vertical_scroll", artStyle: "comic_style" },
    scriptOutline: outline(),
    chapters: [{ id: "chapter-2", projectId: "project-1", order: 2, title: "门外来客", sourceTextPreview: "", lastScriptRevision: null }],
    currentChapter: { id: "chapter-2", projectId: "project-1", order: 2, title: "门外来客", sourceText: "", pendingSourceText: null, lastScriptRevision: null },
  } as WorkbenchSnapshot;
}

function turn(value = snapshot()): DialogueTurn {
  return {
    thread: { id: "thread-1", projectId: "project-1", chapterId: "chapter-2" },
    assistantMessage: { id: "message-1" },
    normalizedStepKey: "project_story",
    snapshot: value,
  } as DialogueTurn;
}

function setup(runtimeOutputs: string[]) {
  const refreshed = snapshot();
  refreshed.currentChapter = { ...refreshed.currentChapter!, pendingSourceText: { sourceText: chapterMarkdown(), threadId: "thread-1", messageId: "message-1", toolCallId: "tool", operation: "generate_script_from_outline", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" } };
  const projects = {
    confirmScriptOutline: vi.fn().mockResolvedValue(outline()),
    getWorkbenchSnapshot: vi.fn().mockResolvedValue(refreshed),
  };
  const repository = {
    getAiChapterGenerationContext: vi.fn().mockResolvedValue(context()),
    createAiChapterPending: vi.fn().mockResolvedValue({ pendingId: "pending", revisionId: "revision", sourceSetDigest: digest, replayed: false }),
  };
  const runtime = { sendMessage: vi.fn() };
  runtimeOutputs.forEach((content) => runtime.sendMessage.mockResolvedValueOnce({ content }));
  const batchService = { run: vi.fn() };
  const service = new ScriptDialogueService(
    projects as unknown as ProjectsService,
    repository as unknown as ScriptWorkflowSourceRepository,
    batchService as never,
    runtime as unknown as OpenCodeRuntimeService,
  );
  service.setEnsureSession(async () => "session-1");
  return { service, projects, repository, runtime };
}

describe("ScriptDialogueService A4 显式生成", () => {
  it("已确认大纲下，裸继续和章节切换不会调用生成", async () => {
    const { service, repository, runtime } = setup([]);
    await expect(service.handleScriptTurn(turn(), { content: "继续", chapterId: "chapter-2" } as SendDialogueMessageRequest)).resolves.toEqual([]);
    expect(repository.getAiChapterGenerationContext).not.toHaveBeenCalled();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("显式命令只生成当前章，并用生成前的来源摘要密封 pending", async () => {
    const { service, repository, runtime } = setup([chapterMarkdown()]);
    const results = await service.handleScriptTurn(turn(), { content: "生成当前章节", chapterId: "chapter-2" } as SendDialogueMessageRequest);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ tool: "generate_script_from_outline", status: "succeeded", currentChapterId: "chapter-2" });
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage.mock.calls[0]?.[0].content).toContain("上一章正式正文：门外响起三短一长。");
    expect(repository.createAiChapterPending).toHaveBeenCalledWith(expect.objectContaining({ chapterId: "chapter-2", outlineId: "outline-1", expectedSourceSetDigest: digest, operation: "generate_script_from_outline" }));
  });

  it("不能在当前章节对话中指定另一个章节生成", async () => {
    const { service, repository, runtime } = setup([]);
    const results = await service.handleScriptTurn(turn(), { content: "写第 1 章", chapterId: "chapter-2" } as SendDialogueMessageRequest);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ tool: "generate_script_from_outline", status: "failed" });
    expect(results[0]?.summary).toContain("请先在章节下拉框切换到第 1 章");
    expect(repository.getAiChapterGenerationContext).not.toHaveBeenCalled();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("待确认大纲下，裸继续最多确认大纲，不会进入 A4", async () => {
    const { service, projects, repository, runtime } = setup([]);
    (service as unknown as { pendingScriptOutlines: Map<string, unknown> }).pendingScriptOutlines.set(
      "project-1:project_story:script-outline",
      {
        outline: outline(),
        source: "topic",
        chapterId: "chapter-2",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    );

    const results = await service.handleScriptTurn(turn(), { content: "继续", chapterId: "chapter-2" } as SendDialogueMessageRequest);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "succeeded", scriptOutline: { id: "outline-1" } });
    expect(results[0]?.summary).toContain("本次没有生成章节");
    expect(projects.confirmScriptOutline).toHaveBeenCalledWith("project-1", "outline-1");
    expect(repository.getAiChapterGenerationContext).not.toHaveBeenCalled();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("章节格式不合法时只做一次格式修复", async () => {
    const { service, runtime, repository } = setup(["格式错误", chapterMarkdown()]);
    const results = await service.handleScriptTurn(turn(), { content: "写第 2 章", chapterId: "chapter-2" } as SendDialogueMessageRequest);
    expect(results[0]).toMatchObject({ status: "succeeded" });
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage.mock.calls[1]?.[0].content).toContain("只修复格式");
    expect(repository.createAiChapterPending).toHaveBeenCalledTimes(1);
  });
});

describe("ScriptDialogueService B1～B4 导入编排", () => {
  function setupImport(outputs: ImportAnalysisOutputV1[]) {
    const rawContext = {
      id: "raw-1",
      projectId: "project-1",
      sourceDigest: digest,
      inputMode: "upload",
      contentTypeHint: "unknown",
      documents: [{ sourceRef: "source-001", order: 1, name: "完整剧本.txt", mediaType: "text/plain", sourceText: "第一章 旧钥匙", sourceDigest: digest }],
      blocks: [{ sourceRef: "source-001", blockRef, globalOrder: 1, sourceOrder: 1, locatorLabel: "第 1 段", kind: "title", sourceText: "第一章 旧钥匙", sourceDigest: digest }],
    };
    const repository = {
      createRawSource: vi.fn().mockResolvedValue({ id: "raw-1" }),
      getRawSourceContext: vi.fn().mockResolvedValue(rawContext),
      createAnalysisCandidate: vi.fn()
        .mockImplementation(async ({ analysis }: { analysis: ImportAnalysisOutputV1 }) => ({ id: analysis.unresolvedItems.length > 0 ? "analysis-blocked" : "analysis-ready", blockingIssues: analysis.unresolvedItems.map((item) => `${item.code}: ${item.description}`) })),
      confirmAnalysisCandidate: vi.fn().mockResolvedValue({ id: "map-1", chapters: [{ order: 1, title: "旧钥匙" }] }),
      startImportBatch: vi.fn().mockResolvedValue({ id: "batch-1", items: [{ id: "item-1", chapterId: "chapter-1" }] }),
    };
    const refreshed = snapshot();
    refreshed.chapters = [{ ...refreshed.chapters[0]!, id: "chapter-1", order: 1, title: "旧钥匙" }];
    refreshed.currentChapter = { ...refreshed.currentChapter!, id: "chapter-1", order: 1, title: "旧钥匙" };
    const projects = { getWorkbenchSnapshot: vi.fn().mockResolvedValue(refreshed) };
    const batchService = { run: vi.fn().mockResolvedValue({
      id: "batch-1",
      chapterMapId: "map-1",
      status: "ready_for_review",
      items: [{ id: "item-1", chapterId: "chapter-1", order: 1, title: "旧钥匙", status: "pending_ready", errorCode: null }],
    }) };
    const runtime = { sendMessage: vi.fn() };
    outputs.forEach((output) => runtime.sendMessage.mockResolvedValueOnce({ content: JSON.stringify(output) }));
    const service = new ScriptDialogueService(projects as never, repository as never, batchService as never, runtime as never);
    service.setEnsureSession(async () => "session-import");
    return { service, repository, batchService, runtime };
  }

  const upload: SendDialogueMessageRequest = {
    content: "请导入并分析这个完整剧本",
    chapterId: "chapter-2",
    attachments: [{ name: "完整剧本.txt", mimeType: "text/plain", size: 16, content: "第一章 旧钥匙" }],
  };

  it("先保存原稿并返回只待整体确认的拆章候选，裸继续不会建章", async () => {
    const { service, repository, batchService } = setupImport([importAnalysis()]);
    const analysisResult = await service.handleScriptTurn(turn(), upload);
    expect(analysisResult[0]).toMatchObject({
      tool: "analyze_script_import",
      status: "needs_user_confirmation",
      importWorkflow: { stage: "analysis_candidate", rawSourceVersionId: "raw-1", blockingIssues: [] },
    });
    expect(repository.createRawSource).toHaveBeenCalledTimes(1);

    await expect(service.handleScriptTurn(turn(), { content: "继续", chapterId: "chapter-2" })).resolves.toEqual([]);
    expect(repository.confirmAnalysisCandidate).not.toHaveBeenCalled();
    expect(batchService.run).not.toHaveBeenCalled();
  });

  it("页面明确确认目录后创建整批章节待确认稿", async () => {
    const { service, repository, batchService } = setupImport([importAnalysis()]);
    await service.handleScriptTurn(turn(), upload);
    const results = await service.handleScriptTurn(turn(), { content: "确认拆章目录", intent: "confirm_script_chapter_map", chapterId: "chapter-2" });

    expect(repository.confirmAnalysisCandidate).toHaveBeenCalledWith("project-1", "analysis-ready");
    expect(repository.startImportBatch).toHaveBeenCalledWith("project-1", "map-1");
    expect(batchService.run).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", batchId: "batch-1" }));
    expect(results[0]).toMatchObject({
      tool: "import_script_to_chapters",
      status: "succeeded",
      importWorkflow: { stage: "batch_result", batchStatus: "ready_for_review", batchItems: [{ status: "pending_ready" }] },
    });
  });

  it("存在阻断问题时，用户补充信息会生成完整新候选，不能直接确认", async () => {
    const { service, repository, batchService, runtime } = setupImport([importAnalysis(true), importAnalysis(false)]);
    await service.handleScriptTurn(turn(), upload);
    const revised = await service.handleScriptTurn(turn(), { content: "完整剧本.txt 是唯一文件，不存在先后顺序问题", chapterId: "chapter-2" });

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(repository.createAnalysisCandidate).toHaveBeenCalledTimes(2);
    expect(revised[0]).toMatchObject({ tool: "analyze_script_import", importWorkflow: { blockingIssues: [] } });
    expect(batchService.run).not.toHaveBeenCalled();
  });
});
