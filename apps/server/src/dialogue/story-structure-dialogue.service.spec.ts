import { describe, expect, it, vi } from "vitest";
import type { DialogueTurn } from "./dialogue-types.js";
import { StoryStructureDialogueService } from "./story-structure-dialogue.service.js";
import { buildValidStoryStructure } from "./story-structure-quality.fixture.js";
import { VALID_CHAPTER_SCRIPT_MARKDOWN_V1 } from "@airoaming/shared/script-workflow-test-fixtures";

function turn(): DialogueTurn {
  const now = "2026-07-16T00:00:00.000Z";
  return {
    normalizedStepKey: "story_structure",
    snapshot: {
      project: { id: "project-1", name: "记忆典当行", storyTitle: "记忆典当行" },
      story: { sourceText: VALID_CHAPTER_SCRIPT_MARKDOWN_V1 },
      scriptOutline: { sourceText: "项目大纲里有尚未发生的地下金库爆炸。" },
      currentChapter: {
        id: "chapter-1",
        title: "拍卖夜",
        order: 1,
        status: "script_done",
        currentScriptVersionId: "script-v1",
        sourceText: VALID_CHAPTER_SCRIPT_MARKDOWN_V1,
      },
      storyStructure: null,
    } as DialogueTurn["snapshot"],
    thread: { id: "thread-1", projectId: "project-1", stepKey: "story_structure", chapterId: "chapter-1", openCodeSessionId: null, messages: [], toolResults: [], createdAt: now, updatedAt: now },
    userMessage: { id: "user-1" } as never,
    assistantMessage: { id: "assistant-1" } as never,
    prompt: "",
  };
}

function invalidStructure(): ReturnType<typeof buildValidStoryStructure> {
  const value = buildValidStoryStructure();
  value.scenes = value.scenes.slice(0, 1);
  value.beats = value.beats.slice(0, 1);
  return value;
}

describe("StoryStructureDialogueService 质量修复预算", () => {
  it("DB Working Copy 未发布时在调用模型前阻断，避免结构绑定旧版本却读取新草稿", async () => {
    const runtime = { generateStructured: vi.fn() };
    const scripts = {
      getWorkingCopy: vi.fn(async () => ({ state: "dirty", currentVersion: { id: "script-v1" } })),
      getHistoryDetail: vi.fn(),
    };
    const service = new StoryStructureDialogueService({} as never, runtime as never, scripts as never);
    const currentTurn = turn();
    currentTurn.snapshot.versioningCapability = { mode: "g2_db" } as never;

    const result = await service.handleStoryStructureTurn(currentTurn, {
      content: "生成剧情结构",
      intent: "generate_story_structure",
      context: { sourceText: "这份前端上下文是尚未发布的新草稿，不能作为正式来源。" },
    });

    expect(runtime.generateStructured).not.toHaveBeenCalled();
    expect(scripts.getHistoryDetail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed", summary: expect.stringContaining("未发布修改") });
  });

  it("首次固定结构输出失败时共用同一次修复预算", async () => {
    const runtime = {
      generateStructured: vi.fn()
        .mockRejectedValueOnce(new Error("OpenCode 没有返回固定结构结果"))
        .mockResolvedValueOnce({ value: buildValidStoryStructure() }),
    };
    const service = new StoryStructureDialogueService({} as never, runtime as never);

    const result = await service.handleStoryStructureTurn(turn(), {
      content: "生成剧情结构",
      intent: "generate_story_structure",
    });

    expect(runtime.generateStructured).toHaveBeenCalledTimes(2);
    expect(runtime.generateStructured.mock.calls[1]?.[0]?.content).toContain("校验错误：");
    expect(runtime.generateStructured.mock.calls[1]?.[0]?.content).not.toContain("质量问题：");
    expect(result).toMatchObject({ status: "needs_user_confirmation", tool: "generate_story_structure" });
  });

  it("首次质量失败时定向重做一次，合格后才产生待确认预览", async () => {
    const runtime = {
      generateStructured: vi.fn()
        .mockResolvedValueOnce({ value: invalidStructure() })
        .mockResolvedValueOnce({ value: buildValidStoryStructure() }),
    };
    const service = new StoryStructureDialogueService({} as never, runtime as never);

    const result = await service.handleStoryStructureTurn(turn(), {
      content: "生成剧情结构",
      intent: "generate_story_structure",
    });

    expect(runtime.generateStructured).toHaveBeenCalledTimes(2);
    expect(runtime.generateStructured.mock.calls[1]?.[0]?.content).toContain("STRUCTURE_SOURCE_SCENE_COUNT_MISMATCH");
    expect(result).toMatchObject({ status: "needs_user_confirmation", tool: "generate_story_structure" });
    expect(result?.storyStructure?.structureJson.scenes).toHaveLength(2);
  });

  it("第二次仍不合格时失败且后续确认会明确提示没有 pending", async () => {
    const runtime = { generateStructured: vi.fn().mockResolvedValue({ value: invalidStructure() }) };
    const service = new StoryStructureDialogueService({} as never, runtime as never);
    const currentTurn = turn();

    const result = await service.handleStoryStructureTurn(currentTurn, {
      content: "生成剧情结构",
      intent: "generate_story_structure",
    });
    const confirmation = await service.handleStoryStructureTurn(currentTurn, {
      content: "确认",
      intent: "confirm_story_structure",
    });

    expect(runtime.generateStructured).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "failed", tool: "generate_story_structure" });
    expect(confirmation).toMatchObject({
      status: "failed",
      tool: "confirm_story_structure",
      summary: expect.stringContaining("没有待确认"),
    });
  });

  it("自动修复失败时同时保留首次质量问题和第二次格式问题", async () => {
    const runtime = {
      generateStructured: vi.fn()
        .mockResolvedValueOnce({ value: invalidStructure() })
        .mockRejectedValueOnce(new Error("AI 返回中没有可解析的 JSON 内容")),
    };
    const service = new StoryStructureDialogueService({} as never, runtime as never);

    const result = await service.handleStoryStructureTurn(turn(), {
      content: "生成剧情结构",
      intent: "generate_story_structure",
    });

    expect(result).toMatchObject({ status: "failed", tool: "generate_story_structure" });
    expect(result?.summary).toContain("STRUCTURE_SOURCE_SCENE_COUNT_MISMATCH");
    expect(result?.summary).toContain("没有可解析的 JSON");
  });

  it("正式剧情结构已经存在时重复确认保持幂等并引导进入分镜", async () => {
    const runtime = { generateStructured: vi.fn() };
    const service = new StoryStructureDialogueService({} as never, runtime as never);
    const currentTurn = turn();
    currentTurn.snapshot.currentChapter = {
      ...currentTurn.snapshot.currentChapter!,
      status: "structured",
    };
    currentTurn.snapshot.storyStructure = {
      id: "story-v1",
      status: "structured",
      structureJson: buildValidStoryStructure(),
    } as never;

    const result = await service.handleStoryStructureTurn(currentTurn, {
      content: "确认采用当前剧情结构",
      intent: "confirm_story_structure",
    });

    expect(runtime.generateStructured).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tool: "confirm_story_structure",
      status: "succeeded",
      summary: expect.stringContaining("已经确认"),
    });
    expect(result?.summary).toContain("分镜工作台");
  });
});
