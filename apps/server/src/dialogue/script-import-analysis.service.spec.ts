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

function crossDocumentAnalysis(
  blocks: Array<{ sourceRef: string; blockRef: string }>,
): ImportAnalysisOutputV1 {
  const [first, second, third, fourth] = blocks;
  if (!first || !second || !third || !fourth) throw new Error("TEST_REQUIRES_FOUR_BLOCKS");
  const range = (block: { sourceRef: string; blockRef: string }) => ({
    sourceRef: block.sourceRef,
    startBlockRef: block.blockRef,
    endBlockRef: block.blockRef,
  });
  return {
    schemaVersion: "import-analysis/1.0",
    outlineRole: "observed",
    sourceProfile: { contentType: "story_prose", explicitBoundaryLevel: "none" },
    observedOutline: {
      sourceTitle: { value: null, basis: "not_provided" },
      synopsis: "第二个文件延续第一个文件末尾的同一章节。",
      mainCharacters: [],
      plotStages: [{
        order: 1,
        label: "跨文件连续发展",
        summary: "文件切换没有造成叙事中断。",
        sourceRanges: blocks.map(range),
      }],
      endingObservation: { kind: "open", summary: "故事仍在继续。", sourceRanges: [range(fourth)] },
    },
    chapterCandidates: [
      {
        localRef: "chapter-001",
        order: 1,
        title: { value: "进入旧宅", basis: "suggested" },
        summary: "主角进入旧宅。",
        sourceRanges: [range(first)],
        boundaryMode: "proposed_story_transition",
        boundaryEvidence: {
          start: { type: "source_start", anchorBlockRef: first.blockRef, description: "原稿开始" },
          end: { type: "scene_sequence_end", anchorBlockRef: first.blockRef, description: "第一个行动单元结束" },
        },
        confidence: "medium",
        warnings: [],
      },
      {
        localRef: "chapter-002",
        order: 2,
        title: { value: "跨文件追踪", basis: "suggested" },
        summary: "追踪行动从文件一末尾连续到文件二开头。",
        sourceRanges: [range(second), range(third)],
        boundaryMode: "proposed_story_transition",
        boundaryEvidence: {
          start: { type: "major_turn", anchorBlockRef: second.blockRef, description: "追踪开始" },
          end: { type: "scene_sequence_end", anchorBlockRef: third.blockRef, description: "追踪行动结束" },
        },
        confidence: "high",
        warnings: ["本章跨越上传文件边界，但叙事连续。"],
      },
      {
        localRef: "chapter-003",
        order: 3,
        title: { value: "新的线索", basis: "suggested" },
        summary: "主角发现新的线索。",
        sourceRanges: [range(fourth)],
        boundaryMode: "proposed_story_transition",
        boundaryEvidence: {
          start: { type: "major_turn", anchorBlockRef: fourth.blockRef, description: "目标改变" },
          end: { type: "source_end", anchorBlockRef: fourth.blockRef, description: "原稿结束" },
        },
        confidence: "medium",
        warnings: [],
      },
    ],
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

  it("允许一个生产章节连续覆盖两个上传文件，不把文件边界强制当成章节边界", async () => {
    const blocks = [
      { sourceRef: "source-001", blockRef: "source-001:block-000001", globalOrder: 1, sourceOrder: 1 },
      { sourceRef: "source-001", blockRef: "source-001:block-000002", globalOrder: 2, sourceOrder: 2 },
      { sourceRef: "source-002", blockRef: "source-002:block-000001", globalOrder: 3, sourceOrder: 1 },
      { sourceRef: "source-002", blockRef: "source-002:block-000002", globalOrder: 4, sourceOrder: 2 },
    ].map((block) => ({
      ...block,
      locatorLabel: `第 ${block.sourceOrder} 段`,
      kind: "narrative" as const,
      sourceText: `${block.sourceRef} 的连续正文 ${"内容".repeat(20)}`,
      sourceDigest: digest,
    }));
    const runtime = {
      createSession: vi.fn().mockImplementation(async (title: string) => `session-${title}`),
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(analysis([blocks[0]!])) })
        .mockResolvedValueOnce({ content: JSON.stringify(analysis([blocks[1]!])) })
        .mockResolvedValueOnce({ content: JSON.stringify(analysis([blocks[2]!])) })
        .mockResolvedValueOnce({ content: JSON.stringify(analysis([blocks[3]!])) })
        .mockResolvedValueOnce({ content: JSON.stringify(crossDocumentAnalysis(blocks)) }),
    };
    const service = new ScriptImportAnalysisService(runtime as never);

    const result = await service.analyze({
      sessionId: "unused-parent-session",
      source: {
        id: "raw-multi-file",
        projectId: "project-1",
        sourceDigest: digest,
        inputMode: "upload",
        contentTypeHint: "story_prose",
        documents: [
          { sourceRef: "source-001", order: 1, name: "上半部.txt", mediaType: "text/plain", sourceText: "上半部", sourceDigest: digest },
          { sourceRef: "source-002", order: 2, name: "下半部.txt", mediaType: "text/plain", sourceText: "下半部", sourceDigest: digest },
        ],
        blocks,
      },
      userRequest: "按剧情而不是文件边界拆章",
      leafCharBudget: 100,
      mergeCharBudget: 1_000_000,
    });

    expect(result.analysis.chapterCandidates[1]?.sourceRanges).toEqual([
      { sourceRef: "source-001", startBlockRef: "source-001:block-000002", endBlockRef: "source-001:block-000002" },
      { sourceRef: "source-002", startBlockRef: "source-002:block-000001", endBlockRef: "source-002:block-000001" },
    ]);
    expect(result.analysis.chapterCandidates).toHaveLength(3);
  });

  it("最终完整目录连续两次输出截断时明确失败，不回退到叶子片段目录", async () => {
    const blocks = [1, 2].map((order) => ({
      sourceRef: "source-001",
      blockRef: `source-001:block-${String(order).padStart(6, "0")}`,
      globalOrder: order,
      sourceOrder: order,
      locatorLabel: `第 ${order} 段`,
      kind: "narrative" as const,
      sourceText: `第 ${order} 段 ${"正文".repeat(20)}`,
      sourceDigest: digest,
    }));
    const runtime = {
      createSession: vi.fn().mockImplementation(async (title: string) => `session-${title}`),
      sendMessage: vi.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(analysis([blocks[0]!])) })
        .mockResolvedValueOnce({ content: JSON.stringify(analysis([blocks[1]!])) })
        .mockResolvedValueOnce({ content: '{"schemaVersion":"import-analysis/1.0","chapterCandidates":[' })
        .mockResolvedValueOnce({ content: '{"schemaVersion":"import-analysis/1.0","chapterCandidates":[' }),
    };
    const service = new ScriptImportAnalysisService(runtime as never);

    await expect(service.analyze({
      sessionId: "unused-parent-session",
      source: {
        id: "raw-truncated-final",
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
    })).rejects.toThrow();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
    expect(runtime.sendMessage.mock.calls[3]?.[0].content).toContain("只修复格式");
  });
});
