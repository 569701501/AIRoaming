import { describe, expect, it, vi } from "vitest";

import {
  serializeChapterScriptMarkdownV1,
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
  const service = new ScriptDialogueService(projects as unknown as ProjectsService, repository as unknown as ScriptWorkflowSourceRepository, runtime as unknown as OpenCodeRuntimeService);
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
