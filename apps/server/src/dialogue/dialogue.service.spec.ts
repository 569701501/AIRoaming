import { describe, expect, it, vi } from "vitest";
import type { WorkbenchSnapshot } from "@airoaming/shared";

import { DialogueService } from "./dialogue.service.js";

describe("DialogueService OpenCode 会话并发保护", () => {
  it("P7-DIALOGUE-DB-03: 持久化会话时不读取可能被并发轮询覆盖的内存会话号", async () => {
    const now = new Date("2026-07-16T00:00:00.000Z");
    const threadRow = {
      id: "thread-1",
      projectId: "project-1",
      stepKey: "project_story",
      chapterId: "chapter-1",
      scopeKey: "chapter:chapter-1",
      title: "project_story",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const createRuntimeSession = vi.fn(async ({ data }: { data: { externalSessionId: string | null } }) => {
      if (!data.externalSessionId) throw new Error("RUNTIME_SESSION_ID_MISSING");
      return data;
    });
    const database = {
      project: { findUnique: vi.fn(async () => ({ lifecycleStatus: "active" })) },
      conversationMessage: { findMany: vi.fn(async () => []) },
      dialogueToolResult: { findMany: vi.fn(async () => []) },
      dialogueRuntimeSession: { findFirst: vi.fn(async () => null) },
      pendingDialogueArtifact: { findMany: vi.fn(async () => []) },
    };
    const tx = {
      conversationThread: {
        upsert: vi.fn(async () => threadRow),
        update: vi.fn(async () => threadRow),
      },
      conversationMessage: {
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      dialogueRuntimeSession: {
        create: createRuntimeSession,
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    let service!: DialogueService;
    let transactionCount = 0;
    const prisma = {
      isDatabaseMode: () => true,
      database: () => database,
      runBusinessTransaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        transactionCount += 1;
        if (transactionCount === 3) {
          // 会话创建完成、尚未持久化时，让页面通过公开读取入口完成一次旧 DB 快照 hydration。
          await service.getProjectThread("project-1", "project_story", "chapter-1");
        }
        return operation(tx);
      },
    };
    const snapshot = {
      project: { id: "project-1", name: "并发测试项目" },
      story: { title: "并发测试故事", sourceText: "" },
      scriptOutline: null,
      currentChapter: null,
      characters: [],
    } as unknown as WorkbenchSnapshot;
    const projects = {
      onProjectDeleted: vi.fn(),
      getWorkbenchSnapshot: vi.fn(async () => snapshot),
    };
    const scriptDialogue = { setEnsureSession: vi.fn(), handleScriptTurn: vi.fn(async () => []) };
    const storyStructureDialogue = { setEnsureSession: vi.fn(), handleStoryStructureTurn: vi.fn(async () => null) };
    const storyboardDialogue = { setEnsureSession: vi.fn(), handleStoryboardTurn: vi.fn(async () => null) };
    const runtime = {
      createSession: vi.fn(async () => "external-session-1"),
      sendMessage: vi.fn(async () => ({
        content: "并发轮询后仍成功完成回复",
        model: { providerId: "fake", modelId: "fake-model" },
      })),
      getDefaultModel: () => ({ providerId: "fake", modelId: "fake-model" }),
    };
    service = new DialogueService(
      projects as never,
      runtime as never,
      scriptDialogue as never,
      storyStructureDialogue as never,
      storyboardDialogue as never,
      prisma as never,
      undefined,
    );

    const result = await service.sendMessage("project-1", "project_story", {
      content: "普通对话",
      chapterId: "chapter-1",
      model: { providerId: "fake", modelId: "fake-model" },
    });

    expect(result.assistantMessage.error).toBeNull();
    expect(result.assistantMessage).toMatchObject({
      status: "completed",
      content: "并发轮询后仍成功完成回复",
    });
    expect(createRuntimeSession).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ externalSessionId: "external-session-1" }),
    }));
  });
});
