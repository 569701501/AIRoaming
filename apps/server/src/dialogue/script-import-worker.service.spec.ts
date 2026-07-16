import { describe, expect, it, vi } from "vitest";

import { ScriptImportWorkerService } from "./script-import-worker.service.js";

const processingProjection = {
  id: "batch-1",
  chapterMapId: "map-1",
  status: "processing" as const,
  items: [{ id: "item-1", chapterId: "chapter-1", order: 1, title: "第一章", status: "materializing" as const, errorCode: null }],
};

function setup(overrides: Record<string, unknown> = {}) {
  const repository = {
    recoverInterruptedImportItems: vi.fn().mockResolvedValue([]),
    findNextQueuedImportItem: vi.fn().mockResolvedValue({ projectId: "project-1", batchId: "batch-1", itemId: "item-1" }),
    beginImportItem: vi.fn().mockResolvedValue({ projectId: "project-1", batchId: "batch-1", itemId: "item-1", attempt: 1 }),
    getImportBatchProjection: vi.fn().mockResolvedValue(processingProjection),
    ...overrides,
  };
  const batchService = { processClaimedItem: vi.fn().mockResolvedValue(undefined) };
  return {
    repository,
    batchService,
    worker: new ScriptImportWorkerService(repository as never, batchService as never),
  };
}

describe("ScriptImportWorkerService", () => {
  it("从数据库领取一个排队章节并执行同一条整理与忠实度验证链路", async () => {
    const { worker, repository, batchService } = setup();

    await worker.runOnce();

    expect(repository.beginImportItem).toHaveBeenCalledWith("project-1", "item-1");
    expect(batchService.processClaimedItem).toHaveBeenCalledWith({
      projectId: "project-1",
      itemId: "item-1",
      model: undefined,
    });
  });

  it("启动时把中断中的章节从本章起点自动重试", async () => {
    const { worker, repository, batchService } = setup({
      recoverInterruptedImportItems: vi.fn().mockResolvedValue([{ projectId: "project-1", batchId: "batch-1", itemId: "item-1" }]),
      findNextQueuedImportItem: vi.fn().mockResolvedValue(null),
    });

    await worker.runOnce();

    expect(repository.recoverInterruptedImportItems).toHaveBeenCalledWith(3);
    expect(repository.beginImportItem).toHaveBeenCalledWith("project-1", "item-1");
    expect(batchService.processClaimedItem).toHaveBeenCalledTimes(1);
  });

  it("只有失败章节能被显式重试，领取后立即返回最新批次进度", async () => {
    const failed = {
      ...processingProjection,
      status: "partial_failure" as const,
      items: [{ ...processingProjection.items[0]!, status: "generation_failed" as const, errorCode: "IMPORT_VERIFY_FAILED" }],
    };
    const { worker, repository } = setup({
      getImportBatchProjection: vi.fn()
        .mockResolvedValueOnce(failed)
        .mockResolvedValue(processingProjection),
      findNextQueuedImportItem: vi.fn().mockResolvedValue(null),
    });

    await expect(worker.retry({ projectId: "project-1", batchId: "batch-1", itemId: "item-1" }))
      .resolves.toEqual(processingProjection);
    expect(repository.beginImportItem).toHaveBeenCalledWith("project-1", "item-1");
  });
});
