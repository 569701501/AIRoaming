import { describe, expect, it, vi } from "vitest";
import type { ImportAnalysisOutputV1 } from "@airoaming/shared";

import { ScriptImportAnalysisService } from "./script-import-analysis.service.js";

const digest = `sha256:${"a".repeat(64)}` as const;

function analysis(blocks: Array<{ sourceRef: string; blockRef: string }>): ImportAnalysisOutputV1 {
  const first = blocks[0]!;
  const last = blocks.at(-1)!;
  return {
    schemaVersion: "import-analysis/1.0",
    outlineRole: "observed",
    sourceProfile: { contentType: "story_prose", explicitBoundaryLevel: "none" },
    observedOutline: {
      sourceTitle: { value: null, basis: "not_provided" },
      synopsis: `覆盖 ${blocks.length} 个块`,
      mainCharacters: [],
      plotStages: [{ order: 1, label: "连续片段", summary: "忠实观察", sourceRanges: [{ sourceRef: first.sourceRef, startBlockRef: first.blockRef, endBlockRef: last.blockRef }] }],
      endingObservation: { kind: "unknown", summary: "片段结束", sourceRanges: [{ sourceRef: last.sourceRef, startBlockRef: last.blockRef, endBlockRef: last.blockRef }] },
    },
    chapterCandidates: blocks.map((block, index) => ({
      localRef: `chapter-${String(index + 1).padStart(3, "0")}`,
      order: index + 1,
      title: { value: `片段 ${index + 1}`, basis: "suggested" },
      summary: "原稿片段",
      sourceRanges: [{ sourceRef: block.sourceRef, startBlockRef: block.blockRef, endBlockRef: block.blockRef }],
      boundaryMode: "proposed_story_transition",
      boundaryEvidence: {
        start: { type: index === 0 ? "source_start" : "major_turn", anchorBlockRef: block.blockRef, description: "片段开始" },
        end: { type: index === blocks.length - 1 ? "source_end" : "scene_sequence_end", anchorBlockRef: block.blockRef, description: "片段结束" },
      },
      confidence: "medium",
      warnings: [],
    })),
    excludedRanges: [],
    unresolvedItems: [],
    globalWarnings: [],
  };
}

describe("ScriptImportAnalysisService", () => {
  it("对超长稿执行叶子分析再合并，并对最终输出检查全部 block", async () => {
    const blocks = [1, 2, 3, 4].map((order) => ({
      sourceRef: "source-001",
      blockRef: `source-001:block-${String(order).padStart(6, "0")}`,
      globalOrder: order,
      sourceOrder: order,
      locatorLabel: `第 ${order} 段`,
      kind: "narrative" as const,
      sourceText: `第 ${order} 段 ${"正文".repeat(20)}`,
      sourceDigest: digest,
    }));
    const leafOutputs = blocks.map((block) => analysis([block]));
    const runtime = {
      createSession: vi.fn().mockImplementation(async (title: string) => `session-${title}`),
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(leafOutputs[0]) })
        .mockResolvedValueOnce({ content: JSON.stringify(leafOutputs[1]) })
        .mockResolvedValueOnce({ content: JSON.stringify(leafOutputs[2]) })
        .mockResolvedValueOnce({ content: JSON.stringify(leafOutputs[3]) })
        .mockResolvedValueOnce({ content: JSON.stringify(analysis(blocks)) }),
    };
    const service = new ScriptImportAnalysisService(runtime as never);
    const result = await service.analyze({
      sessionId: "session-1",
      source: {
        id: "raw-1",
        projectId: "project-1",
        sourceDigest: digest,
        inputMode: "paste",
        contentTypeHint: "unknown",
        documents: [{ sourceRef: "source-001", order: 1, name: "长稿", mediaType: "text/plain", sourceText: "长稿", sourceDigest: digest }],
        blocks,
      },
      userRequest: "忠实拆章",
      leafCharBudget: 100,
      mergeCharBudget: 1_000_000,
    });
    expect(result).toMatchObject({ strategy: "hierarchical", leafCount: 4, mergePasses: 1 });
    expect(result.analysis.chapterCandidates).toHaveLength(4);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(5);
    expect(runtime.createSession).toHaveBeenCalledTimes(5);
    expect(new Set(runtime.sendMessage.mock.calls.map((call) => call[0].sessionId)).size).toBe(5);
    expect(runtime.sendMessage.mock.calls[4]?.[0].content).toContain("不得把技术分段边界当成章节边界");
    expect(runtime.sendMessage.mock.calls[4]?.[0].content).toContain("sourceExcerpt");
  });
});
