import { describe, expect, it } from "vitest";

import { analyzeCandidateLockImpact } from "./candidate-lock-impact-analyzer.js";

function input() {
  return {
    projectId: "project_a",
    chapterId: "chapter_a",
    shotId: "shot_a",
    action: "replace" as const,
    targetCandidateId: "candidate_b",
    expectedCurrentRevisionId: "lock_a",
    noOp: false,
    workingCopyBindings: [
      { workingCopyId: "wc_a", documentDigest: "display-only", elementId: "element_current", shotId: "shot_a", candidateId: "candidate_a", sourceCandidateLockRevisionId: "lock_a", resolution: "current" as const },
      { workingCopyId: "wc_a", documentDigest: "display-only", elementId: "element_old", shotId: "shot_a", candidateId: "candidate_old", sourceCandidateLockRevisionId: "lock_old", resolution: "stale" as const },
      { workingCopyId: "wc_a", documentDigest: "display-only", elementId: "element_unknown", shotId: "shot_a", candidateId: null, sourceCandidateLockRevisionId: null, resolution: "unresolved" as const },
    ],
    formalBindings: [
      { layoutRevisionId: "layout_a", elementId: "element_current", role: "image", shotId: "shot_a", candidateLockRevisionId: "lock_a" },
      { layoutRevisionId: "layout_a", elementId: "element_current", role: "mask", shotId: "shot_a", candidateLockRevisionId: "lock_a" },
      { layoutRevisionId: "layout_old", elementId: "element_old", role: "image", shotId: "shot_a", candidateLockRevisionId: "lock_old" },
    ],
    exportRevisions: [
      { id: "export_a", layoutRevisionId: "layout_a" },
      { id: "export_other", layoutRevisionId: "layout_other" },
    ],
    tasks: [
      { id: "task_direct", type: "layout_export", status: "queued" as const, sources: [{ sourceType: "candidate_lock_revision", sourceId: "lock_a", sourceDigest: "asset" }] },
      { id: "task_lock_set", type: "asset_package_export", status: "running" as const, sources: [{ sourceType: "lock_set", sourceId: "chapter_a", sourceDigest: "lock_set_a" }] },
      { id: "task_other_chapter", type: "asset_package_export", status: "running" as const, sources: [{ sourceType: "lock_set", sourceId: "chapter_other", sourceDigest: "lock_set_a" }] },
      { id: "task_layout", type: "layout_export", status: "retrying" as const, sources: [{ sourceType: "layout_revision", sourceId: "layout_a", sourceDigest: "layout" }] },
      { id: "task_export", type: "package", status: "running" as const, sources: [{ sourceType: "export_revision", sourceId: "export_a", sourceDigest: "export" }] },
      { id: "task_finished", type: "layout_export", status: "succeeded" as const, sources: [{ sourceType: "layout_revision", sourceId: "layout_a", sourceDigest: "layout" }] },
      { id: "task_image", type: "image_generate", status: "running" as const, targetShotId: "shot_a", sources: [{ sourceType: "preflight_revision", sourceId: "preflight_a", sourceDigest: "preflight" }] },
    ],
    currentLayoutRevisionId: "layout_a",
    currentExportRevisionId: "export_a",
    currentCompleteLockSetDigest: "lock_set_a",
  };
}

describe("CandidateLockImpactAnalyzer", () => {
  it("IMP-02/03/04/06/07/08/09/10/11 computes only newly affected references", () => {
    const result = analyzeCandidateLockImpact(input());
    expect(result.impact).toEqual({
      affectedWorkingCopyElements: [{ workingCopyId: "wc_a", elementId: "element_current" }],
      affectedLayoutBindings: [{ layoutRevisionId: "layout_a", elementId: "element_current" }],
      affectedLayoutRevisionIds: ["layout_a"],
      affectedExportRevisionIds: ["export_a"],
      activeTaskIds: ["task_direct", "task_export", "task_layout", "task_lock_set"],
      currentLayoutRevisionAffected: true,
      currentExportRevisionAffected: true,
      alreadyStaleWorkingCopyElementCount: 1,
      unresolvedWorkingCopyElementCount: 1,
      preservedLayoutHistoryCount: 1,
      preservedExportHistoryCount: 1,
    });
    expect(result.impactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("IMP-12/13 normalizes row order and excludes presentation fields from digest", () => {
    const first = input();
    const second = input();
    second.workingCopyBindings = [...second.workingCopyBindings].reverse().map((row) => ({ ...row, documentDigest: "changed-display" }));
    second.formalBindings = [...second.formalBindings].reverse();
    second.exportRevisions = [...second.exportRevisions].reverse();
    second.tasks = [...second.tasks].reverse();
    expect(analyzeCandidateLockImpact(second).impactDigest).toBe(analyzeCandidateLockImpact(first).impactDigest);
  });

  it("IMP-14/15 changes digest for authority set or intent changes", () => {
    const baseline = analyzeCandidateLockImpact(input()).impactDigest;
    expect(analyzeCandidateLockImpact({ ...input(), action: "clear", targetCandidateId: null }).impactDigest).not.toBe(baseline);
    expect(analyzeCandidateLockImpact({ ...input(), exportRevisions: [] }).impactDigest).not.toBe(baseline);
    expect(analyzeCandidateLockImpact({ ...input(), expectedCurrentRevisionId: "other" }).impactDigest).not.toBe(baseline);
  });

  it("IMP-01/16 emits a valid empty digest for first lock and no-op", () => {
    const first = analyzeCandidateLockImpact({
      ...input(),
      action: "lock",
      expectedCurrentRevisionId: null,
      workingCopyBindings: [],
      formalBindings: [],
      exportRevisions: [],
      tasks: [],
    });
    expect(first.impact.affectedLayoutRevisionIds).toEqual([]);
    expect(first.impactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const noOp = analyzeCandidateLockImpact({ ...input(), noOp: true });
    expect(noOp.impact).toMatchObject({
      affectedWorkingCopyElements: [],
      affectedLayoutBindings: [],
      affectedLayoutRevisionIds: [],
      affectedExportRevisionIds: [],
      activeTaskIds: [],
      alreadyStaleWorkingCopyElementCount: 0,
      unresolvedWorkingCopyElementCount: 0,
    });
  });
});
