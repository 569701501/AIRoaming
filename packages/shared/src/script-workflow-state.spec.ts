import { describe, expect, it } from "vitest";

import {
  buildConfirmedScriptChapterMapV1,
  buildScriptPendingSourceProjectionV1,
  buildScriptRawSourceSnapshotV1,
  scriptOutlineCardDigestV1,
  scriptSourceBlockCatalogV1,
  ScriptWorkflowStateError,
} from "./script-workflow-state.js";
import type { ImportAnalysisOutputV1 } from "./script-workflow-contract.js";

function analysis(blockRefs: string[]): ImportAnalysisOutputV1 {
  return {
    schemaVersion: "import-analysis/1.0",
    outlineRole: "observed",
    sourceProfile: { contentType: "script", explicitBoundaryLevel: "chapter" },
    observedOutline: {
      sourceTitle: { value: "原稿", basis: "source" },
      synopsis: "两章故事。",
      mainCharacters: [],
      plotStages: [{ order: 1, label: "发展", summary: "推进", sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[0]!, endBlockRef: blockRefs[1]! }] }],
      endingObservation: { kind: "open", summary: "未完", sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[1]!, endBlockRef: blockRefs[1]! }] },
    },
    chapterCandidates: [
      {
        localRef: "chapter-001",
        order: 1,
        title: { value: "开端", basis: "source" },
        summary: "第一章",
        sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[0]!, endBlockRef: blockRefs[0]! }],
        boundaryMode: "preserved_source_unit",
        boundaryEvidence: {
          start: { type: "source_start", anchorBlockRef: blockRefs[0]!, description: "开头" },
          end: { type: "scene_sequence_end", anchorBlockRef: blockRefs[0]!, description: "场景结束" },
        },
        confidence: "high",
        warnings: [],
      },
      {
        localRef: "chapter-002",
        order: 2,
        title: { value: "后续", basis: "suggested" },
        summary: "第二章",
        sourceRanges: [{ sourceRef: "source-001", startBlockRef: blockRefs[1]!, endBlockRef: blockRefs[1]! }],
        boundaryMode: "proposed_story_transition",
        boundaryEvidence: {
          start: { type: "major_turn", anchorBlockRef: blockRefs[1]!, description: "转折" },
          end: { type: "source_end", anchorBlockRef: blockRefs[1]!, description: "结尾" },
        },
        confidence: "medium",
        warnings: ["标题为建议"],
      },
    ],
    excludedRanges: [],
    unresolvedItems: [],
    globalWarnings: [],
  };
}

describe("script workflow state", () => {
  it("builds deterministic immutable-source identities and stable block refs", () => {
    const input = {
      inputMode: "paste" as const,
      documents: [{ name: "主稿", mediaType: "text/plain", sourceText: "\uFEFF第一章 开端\r\n\r\n人物进入房间。\r\n" }],
    };
    const first = buildScriptRawSourceSnapshotV1(input);
    const replay = buildScriptRawSourceSnapshotV1(input);
    expect(replay).toEqual(first);
    expect(first.documents[0]?.sourceText).toBe("第一章 开端\n\n人物进入房间。\n");
    expect(first.documents[0]?.blocks.map((item) => item.blockRef)).toEqual([
      "source-001:block-000001",
      "source-001:block-000002",
    ]);
    expect(scriptSourceBlockCatalogV1(first)[0]).toMatchObject({ kind: "title", globalOrder: 1 });
  });

  it("rejects duplicate source refs", () => {
    expect(() => buildScriptRawSourceSnapshotV1({
      inputMode: "mixed",
      documents: [
        { sourceRef: "same", name: "A", mediaType: "text/plain", sourceText: "A" },
        { sourceRef: "same", name: "B", mediaType: "text/plain", sourceText: "B" },
      ],
    })).toThrow(ScriptWorkflowStateError);
  });

  it("builds a confirmed boundary decision without creating ChapterPlan fields", () => {
    const snapshot = buildScriptRawSourceSnapshotV1({
      inputMode: "paste",
      documents: [{ name: "主稿", mediaType: "text/plain", sourceText: "第一章\n\n第二章" }],
    });
    const refs = snapshot.documents[0]!.blocks.map((item) => item.blockRef);
    const map = buildConfirmedScriptChapterMapV1({ rawSourceDigest: snapshot.sourceDigest, analysis: analysis(refs) });
    expect(map.chapters).toHaveLength(2);
    expect(map.chapters[0]).not.toHaveProperty("beats");
    expect(map.chapters[0]).not.toHaveProperty("scenes");
    expect(map.chapters[0]?.sourceRangeDigest).toMatch(/^sha256:/);
    expect(map.mapDigest).toMatch(/^sha256:/);
  });

  it("refuses to confirm a map while boundary blockers remain", () => {
    const candidate = analysis(["b1", "b2"]);
    candidate.unresolvedItems.push({ code: "BOUNDARY_UNKNOWN", impact: "boundary", description: "边界不明", affectedBlockRefs: ["b1"] });
    expect(() => buildConfirmedScriptChapterMapV1({ rawSourceDigest: `sha256:${"1".repeat(64)}`, analysis: candidate })).toThrow(/blocking/);
  });

  it("seals deterministic AI and import source projections", () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const ai = buildScriptPendingSourceProjectionV1({
      kind: "ai",
      policyVersion: "ai-chapter-generate/1.0",
      bindings: [
        { role: "chapter_card", order: 2, sourceType: "project_script_outline_card", sourceId: "outline#1", sourceDigest: digest },
        { role: "outline", order: 1, sourceType: "project_script_outline", sourceId: "outline", sourceDigest: digest },
      ],
    });
    expect(ai.projection.bindings.map((item) => item.role)).toEqual(["outline", "chapter_card"]);
    expect(ai.sourceSetDigest).toMatch(/^sha256:/);

    const importBindings = [
      ["raw_source", "script_raw_source_version"],
      ["analysis", "script_import_analysis_candidate"],
      ["chapter_map", "script_chapter_map"],
      ["map_item", "script_chapter_map_item"],
      ["batch_item", "script_import_batch_item"],
      ["fidelity_report", "script_import_fidelity_report"],
    ] as const;
    expect(buildScriptPendingSourceProjectionV1({
      kind: "import",
      policyVersion: "import-chapter-materialize/1.0",
      bindings: importBindings.map(([role, sourceType], index) => ({ role, sourceType, order: index + 1, sourceId: `${role}-id`, sourceDigest: digest })),
    }).projection.bindings).toHaveLength(6);
  });

  it("rejects source sets that do not match their policy", () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    expect(() => buildScriptPendingSourceProjectionV1({
      kind: "ai",
      policyVersion: "ai-chapter-generate/1.0",
      bindings: [{ role: "outline", order: 1, sourceType: "project_script_outline", sourceId: "outline", sourceDigest: digest }],
    })).toThrow(/chapter_card/);
  });

  it("digests chapter cards independently of database ids", () => {
    expect(scriptOutlineCardDigestV1({ order: 1, title: "章", chapterGoal: "目标", coreConflict: "冲突", majorTurn: "转折", endingHook: "钩子", nextChapterBridge: "衔接" })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
