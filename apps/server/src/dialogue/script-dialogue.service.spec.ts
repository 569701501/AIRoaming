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
import { ScriptImportAnalysisService } from "./script-import-analysis.service.js";

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

const goodSeeds = [
  { title: "记忆典当行", genreTags: ["奇幻", "悬疑"], logline: "失忆少女必须赎回被父亲卖掉的最后一天。", keyConflict: "每取回一段记忆，敌人就会获得她的另一段秘密。", visualHook: "霓虹雨夜里，记忆瓶沿高墙流进地下金库。", firstChapterDirection: "少女闯入拍卖会，却看见主持人戴着父亲的脸。" },
  { title: "潮汐列车", genreTags: ["灾难", "亲情"], logline: "胆小列车员驾驶末班列车寻找被洪水困住的弟弟。", keyConflict: "每救一站乘客都会耗尽无法补充的浮力燃料。", visualHook: "银色列车在淹没楼群的海面轨道上跃过巨浪。", firstChapterDirection: "列车员违令停靠学校站，得到弟弟留下的车票。" },
  { title: "纸兽法庭", genreTags: ["古风", "法庭"], logline: "见习讼师必须替一只被控弑主的纸鹤辩护。", keyConflict: "纸兽每次作证都会烧毁一页决定主人生死的契约。", visualHook: "宣纸百兽盘踞悬空法庭，墨迹随证词化作锁链。", firstChapterDirection: "讼师发现纸鹤隐瞒的名字属于老师，决定冒险接案。" },
];

function inspirationJson(seeds = goodSeeds): string {
  return JSON.stringify({ seeds });
}

function duplicateInspirationJson(): string {
  return inspirationJson(goodSeeds.map((seed, index) => ({
    ...seed,
    title: `伪方向${index + 1}`,
    logline: goodSeeds[0]!.logline,
    keyConflict: goodSeeds[0]!.keyConflict,
    visualHook: goodSeeds[0]!.visualHook,
    firstChapterDirection: goodSeeds[0]!.firstChapterDirection,
  })));
}

const goodOutlineMarkdown = `# 剧本大纲

## 一、基础信息
剧集名称：雨夜末班车
题材风格：都市悬疑
剧集篇幅：2 章短篇
剧集章数：2 章
剧情简介：林夏想寻找失踪姐姐，但是异常末班车会抹去乘客记录，因此她必须在车辆进入隧道前查清真相。

## 二、主要角色
林夏（主角）：想找到姐姐，却逃避自己曾错过姐姐求救的愧疚。

## 三、情节概要
开端：林夏登上无人末班车，但是车辆拒绝停车，因此她被迫追查姐姐留下的钥匙。
发展：钥匙打开封闭总站，然而公开证据会危及姐姐，所以林夏必须在救人和留证之间选择。
结局方向：林夏冒险直播运营方的罪证并救出姐姐，承认自己的愧疚但不再被它控制。

## 四、章节安排

### 第 1 章：无人末班车
章节目标：找到姐姐留下的第一条线索
核心冲突：登车追踪线索就可能无法返回
关键转折：广播准确叫出林夏的名字
结尾钩子：姐姐的钥匙指向封闭总站
下一章衔接：钥匙迫使林夏继续前往封闭总站

### 第 2 章：封闭总站
章节目标：救出姐姐并公开事故证据
核心冲突：救人会让运营方有时间销毁证据
关键转折：姐姐主动要求林夏先开启直播
结尾钩子：负责人在直播中承认掩盖事故
下一章衔接：姐妹获救、证据公开，故事收束（终章）
`;

function weakOutlineMarkdown(): string {
  return goodOutlineMarkdown
    .replace("林夏想寻找失踪姐姐，但是异常末班车会抹去乘客记录，因此她必须在车辆进入隧道前查清真相。", "林夏寻找失踪姐姐，登上末班车，来到封闭总站。")
    .replace("开端：林夏登上无人末班车，但是车辆拒绝停车，因此她被迫追查姐姐留下的钥匙。", "开端：林夏登上无人末班车。")
    .replace("发展：钥匙打开封闭总站，然而公开证据会危及姐姐，所以林夏必须在救人和留证之间选择。", "发展：林夏来到封闭总站。")
    .replace("林夏冒险直播运营方的罪证并救出姐姐，承认自己的愧疚但不再被它控制。", "开放式结局")
    .replace("救出姐姐并公开事故证据", "找到姐姐留下的第一条线索")
    .replace("救人会让运营方有时间销毁证据", "登车追踪线索就可能无法返回")
    .replace("姐姐主动要求林夏先开启直播", "广播准确叫出林夏的名字")
    .replace("负责人在直播中承认掩盖事故", "姐姐的钥匙指向封闭总站")
    .replace("姐妹获救、证据公开，故事收束（终章）", "钥匙迫使林夏继续前往封闭总站");
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

function snapshotWithoutOutline(): WorkbenchSnapshot {
  return { ...snapshot(), scriptOutline: null } as WorkbenchSnapshot;
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
    saveScriptOutlineFromAI: vi.fn().mockImplementation(async (_projectId: string, input: { sourceText: string }) => ({
      ...outline(),
      sourceText: input.sourceText,
    })),
  };
  const repository = {
    getAiChapterGenerationContext: vi.fn().mockResolvedValue(context()),
    createAiChapterPending: vi.fn().mockResolvedValue({ pendingId: "pending", revisionId: "revision", sourceSetDigest: digest, replayed: false }),
  };
  const runtime = { sendMessage: vi.fn() };
  runtimeOutputs.forEach((content) => runtime.sendMessage.mockResolvedValueOnce({ content }));
  const importWorker = { wake: vi.fn() };
  const analysisService = new ScriptImportAnalysisService(runtime as never);
  const service = new ScriptDialogueService(
    projects as unknown as ProjectsService,
    repository as unknown as ScriptWorkflowSourceRepository,
    importWorker as never,
    analysisService,
    runtime as unknown as OpenCodeRuntimeService,
  );
  service.setEnsureSession(async () => "session-1");
  return { service, projects, repository, runtime };
}

describe("ScriptDialogueService A2/A3 P1～P2 质量门", () => {
  it("P1 发现伪差异候选后只定向重写一次，再返回合格的三项灵感", async () => {
    const { service, runtime } = setup([duplicateInspirationJson(), inspirationJson()]);

    const results = await service.handleScriptTurn(
      turn(snapshotWithoutOutline()),
      { content: "帮我找三个都市悬疑灵感", intent: "generate_inspiration_seeds" } as SendDialogueMessageRequest,
    );

    expect(results[0]).toMatchObject({ tool: "generate_inspiration_seeds", status: "succeeded" });
    expect(results[0]?.inspirationSeeds).toHaveLength(3);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage.mock.calls[1]?.[0].content).toContain("未通过 P1 灵感质量门");
    expect(runtime.sendMessage.mock.calls[1]?.[0].content).toContain("P1_CONFLICT_ENGINE_NOT_DISTINCT");
    expect(runtime.sendMessage.mock.calls[1]?.[0].content).toContain("重新生成完整 3 项");
  });

  it("P1 重写一次后仍是假差异就停止，不把不合格候选交给用户", async () => {
    const { service, runtime } = setup([duplicateInspirationJson(), duplicateInspirationJson()]);

    const results = await service.handleScriptTurn(
      turn(snapshotWithoutOutline()),
      { content: "帮我找三个都市悬疑灵感", intent: "generate_inspiration_seeds" } as SendDialogueMessageRequest,
    );

    expect(results[0]).toMatchObject({ tool: "generate_inspiration_seeds", status: "failed", inspirationSeeds: null });
    expect(results[0]?.summary).toContain("P1 质量门未通过");
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("P2 发现弱因果和空泛结局后只定向重写一次，合格后才保存待确认大纲", async () => {
    const { service, projects, runtime } = setup([weakOutlineMarkdown(), goodOutlineMarkdown]);

    const results = await service.handleScriptTurn(
      turn(snapshotWithoutOutline()),
      { content: "写一个 2 章都市悬疑剧本" } as SendDialogueMessageRequest,
    );

    expect(results[0]).toMatchObject({ tool: "generate_script_outline_from_topic", status: "needs_user_confirmation" });
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage.mock.calls[1]?.[0].content).toContain("未通过 P2 因果大纲与结局方向质量门");
    expect(runtime.sendMessage.mock.calls[1]?.[0].content).toContain("P2_ENDING_DIRECTION_VAGUE");
    expect(projects.saveScriptOutlineFromAI).toHaveBeenCalledTimes(1);
    expect(projects.saveScriptOutlineFromAI).toHaveBeenCalledWith("project-1", expect.objectContaining({ sourceText: expect.stringContaining("故事收束（终章）") }));
  });

  it("P2 重写一次后仍不合格就停止，绝不保存弱大纲", async () => {
    const { service, projects, runtime } = setup([weakOutlineMarkdown(), weakOutlineMarkdown()]);

    const results = await service.handleScriptTurn(
      turn(snapshotWithoutOutline()),
      { content: "写一个 2 章都市悬疑剧本" } as SendDialogueMessageRequest,
    );

    expect(results[0]).toMatchObject({ tool: "generate_script_outline_from_topic", status: "failed", scriptOutline: null });
    expect(results[0]?.summary).toContain("P2 质量门未通过");
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(projects.saveScriptOutlineFromAI).not.toHaveBeenCalled();
  });
});

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
      getImportBatchProjection: vi.fn().mockResolvedValue({
        id: "batch-1",
        chapterMapId: "map-1",
        status: "queued",
        items: [{ id: "item-1", chapterId: "chapter-1", order: 1, title: "旧钥匙", status: "queued", errorCode: null }],
      }),
    };
    const refreshed = snapshot();
    refreshed.chapters = [{ ...refreshed.chapters[0]!, id: "chapter-1", order: 1, title: "旧钥匙" }];
    refreshed.currentChapter = { ...refreshed.currentChapter!, id: "chapter-1", order: 1, title: "旧钥匙" };
    const projects = { getWorkbenchSnapshot: vi.fn().mockResolvedValue(refreshed) };
    const importWorker = { wake: vi.fn() };
    const runtime = { sendMessage: vi.fn() };
    outputs.forEach((output) => runtime.sendMessage.mockResolvedValueOnce({ content: JSON.stringify(output) }));
    const analysisService = new ScriptImportAnalysisService(runtime as never);
    const service = new ScriptDialogueService(projects as never, repository as never, importWorker as never, analysisService, runtime as never);
    service.setEnsureSession(async () => "session-import");
    return { service, repository, importWorker, runtime };
  }

  const upload: SendDialogueMessageRequest = {
    content: "请导入并分析这个完整剧本",
    chapterId: "chapter-2",
    attachments: [{ name: "完整剧本.txt", mimeType: "text/plain", size: 16, content: "第一章 旧钥匙" }],
  };

  it("先保存原稿并返回只待整体确认的拆章候选，裸继续不会建章", async () => {
    const { service, repository, importWorker } = setupImport([importAnalysis()]);
    const analysisResult = await service.handleScriptTurn(turn(), upload);
    expect(analysisResult[0]).toMatchObject({
      tool: "analyze_script_import",
      status: "needs_user_confirmation",
      importWorkflow: { stage: "analysis_candidate", rawSourceVersionId: "raw-1", blockingIssues: [] },
    });
    expect(repository.createRawSource).toHaveBeenCalledTimes(1);

    await expect(service.handleScriptTurn(turn(), { content: "继续", chapterId: "chapter-2" })).resolves.toEqual([]);
    expect(repository.confirmAnalysisCandidate).not.toHaveBeenCalled();
    expect(importWorker.wake).not.toHaveBeenCalled();
  });

  it("页面明确确认目录后创建全部章节入口并唤醒后台整理", async () => {
    const { service, repository, importWorker } = setupImport([importAnalysis()]);
    await service.handleScriptTurn(turn(), upload);
    const results = await service.handleScriptTurn(turn(), { content: "确认拆章目录", intent: "confirm_script_chapter_map", chapterId: "chapter-2" });

    expect(repository.confirmAnalysisCandidate).toHaveBeenCalledWith("project-1", "analysis-ready");
    expect(repository.startImportBatch).toHaveBeenCalledWith("project-1", "map-1");
    expect(importWorker.wake).toHaveBeenCalledWith("batch-1", undefined);
    expect(results[0]).toMatchObject({
      tool: "import_script_to_chapters",
      status: "succeeded",
      importWorkflow: { stage: "batch_result", batchStatus: "queued", batchItems: [{ status: "queued" }] },
    });
  });

  it("存在阻断问题时，用户补充信息会生成完整新候选，不能直接确认", async () => {
    const { service, repository, importWorker, runtime } = setupImport([importAnalysis(true), importAnalysis(false)]);
    await service.handleScriptTurn(turn(), upload);
    const revised = await service.handleScriptTurn(turn(), { content: "完整剧本.txt 是唯一文件，不存在先后顺序问题", chapterId: "chapter-2" });

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(repository.createAnalysisCandidate).toHaveBeenCalledTimes(2);
    expect(revised[0]).toMatchObject({ tool: "analyze_script_import", importWorkflow: { blockingIssues: [] } });
    expect(importWorker.wake).not.toHaveBeenCalled();
  });
});
