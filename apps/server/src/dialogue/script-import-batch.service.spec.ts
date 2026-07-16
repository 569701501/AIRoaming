import { describe, expect, it, vi } from "vitest";
import { serializeChapterScriptMarkdownV1 } from "@airoaming/shared";

import { ScriptImportBatchService } from "./script-import-batch.service.js";

function markdown(order: number, title: string): string {
  return serializeChapterScriptMarkdownV1({
    chapterOrder: order,
    chapterTitle: title,
    type: "悬疑",
    theme: "寻找真相",
    style: "克制",
    comicForm: "竖向条漫",
    targetLength: "按本章确认原稿范围完整整理",
    logline: "林舟发现线索。",
    chapterGoal: "确认线索来源。",
    coreConflict: "时间不足。",
    emotionalArc: "疑惑到警觉。",
    endingHook: "门外出现脚步声。",
    highlights: ["旧钥匙", "雨夜", "脚步声"],
    visualAtmosphere: "雨夜",
    colorDirection: "冷蓝",
    visualMotif: "旧钥匙",
    scenes: [{
      order: 1,
      name: "旧屋",
      location: "旧屋",
      time: "夜",
      atmosphere: "压抑",
      characters: "林舟",
      description: "林舟找到一把旧钥匙。",
      actions: "他擦去钥匙上的灰。",
      dialogue: "林舟：这不是我的钥匙。",
      narration: "雨声越来越近。",
      endingPoint: "门外传来脚步声。",
    }],
    endingEvent: "林舟握紧钥匙。",
    suspense: "门外是谁？",
    nextChapterLead: "脚步声停在门口。",
  });
}

function context(itemId: string, order: number, title: string, blockRef: string) {
  return {
    batchId: "batch-1",
    batchStatus: "processing",
    item: { id: itemId, chapterId: `chapter-${order}`, order, status: "materializing", attempt: 1, mapItemRef: `map-${order}` },
    chapter: { id: `chapter-${order}`, title, order },
    analysis: { observedOutline: { synopsis: "两章原稿" } },
    mapItem: { mapItemRef: `map-${order}`, order, title, summary: "原稿摘要", sourceRanges: [] },
    sourceBlocks: [{
      sourceRef: "source-001",
      blockRef,
      globalOrder: order,
      sourceOrder: order,
      locatorLabel: `第 ${order} 段`,
      kind: "narrative",
      sourceText: order === 1 ? "林舟找到一把旧钥匙。" : "门外传来脚步声。",
      sourceDigest: `sha256:${"a".repeat(64)}`,
    }],
  } as never;
}

function fidelity(blockRef: string, sourceText: string): string {
  const endLine = String(sourceText.trimEnd().split("\n").length).padStart(6, "0");
  return JSON.stringify({
    schemaVersion: "import-fidelity/1.0",
    sourceCoverage: [{
      sourceRange: { sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef },
      outputLineRanges: [{ startLineRef: "line-000001", endLineRef: `line-${endLine}` }],
      disposition: "reformatted_in_body",
      note: "原稿完整保留在正文中",
    }],
    unsupportedAdditions: [],
    sequenceFindings: [],
    dialogueFindings: [],
    entityFindings: [],
    metadataFindings: [],
    uncertainties: [],
  });
}

describe("ScriptImportBatchService", () => {
  it("逐章处理整批任务，单章失败不会阻断其他章节", async () => {
    const firstMarkdown = markdown(1, "旧钥匙");
    const initial = {
      id: "batch-1",
      chapterMapId: "map-1",
      status: "queued",
      items: [
        { id: "item-1", chapterId: "chapter-1", order: 1, title: "旧钥匙", status: "queued", errorCode: null },
        { id: "item-2", chapterId: "chapter-2", order: 2, title: "门外来客", status: "queued", errorCode: null },
      ],
    };
    const final = {
      ...initial,
      status: "partial_failure",
      items: [
        { ...initial.items[0], status: "pending_ready" },
        { ...initial.items[1], status: "generation_failed", errorCode: "IMPORT_MATERIALIZE_FAILED" },
      ],
    };
    const repository = {
      getImportBatchProjection: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(final),
      beginImportItem: vi.fn().mockResolvedValue({ attempt: 1 }),
      getImportItemWorkContext: vi.fn()
        .mockResolvedValueOnce(context("item-1", 1, "旧钥匙", "source-001:block-000001"))
        .mockResolvedValueOnce(context("item-2", 2, "门外来客", "source-001:block-000002")),
      markImportItemVerifying: vi.fn().mockResolvedValue({ outputDigest: `sha256:${"b".repeat(64)}` }),
      recordImportFidelity: vi.fn().mockResolvedValue({ hasHardIssues: false, pendingId: "pending-1" }),
      markImportItemFailed: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = {
      createSession: vi.fn().mockResolvedValueOnce("session-1").mockResolvedValueOnce("session-2"),
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: firstMarkdown })
        .mockResolvedValueOnce({ content: fidelity("source-001:block-000001", firstMarkdown) })
        .mockRejectedValueOnce(new Error("provider unavailable")),
    };
    const service = new ScriptImportBatchService(repository as never, runtime as never);

    await expect(service.run({ projectId: "project-1", batchId: "batch-1" })).resolves.toEqual(final);
    expect(repository.beginImportItem).toHaveBeenCalledTimes(2);
    expect(repository.recordImportFidelity).toHaveBeenCalledTimes(1);
    expect(repository.markImportItemFailed).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      itemId: "item-2",
      stage: "materializing",
      errorCode: "IMPORT_MATERIALIZE_FAILED",
    }));
  });
});
