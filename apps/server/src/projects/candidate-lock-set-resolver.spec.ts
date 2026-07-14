import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { resolveCandidateLockSet } from "./candidate-lock-set-resolver.js";

const base = {
  projectId: "project_a",
  chapterId: "chapter_a",
  storyboardVersionId: "storyboard_a",
};

function finalizedShot(
  shotId: string,
  revisionId: string,
  sourceApplicability: "current" | "historical" | "legacy_unresolved" = "current",
) {
  return {
    shotId,
    lifecycleStatus: "active" as const,
    currentCandidateLockRevisionId: revisionId,
    currentRevision: {
      id: revisionId,
      projectId: base.projectId,
      chapterId: base.chapterId,
      shotId,
      action: "lock" as const,
      candidateId: `candidate_${shotId}`,
    },
    candidate: {
      id: `candidate_${shotId}`,
      projectId: base.projectId,
      chapterId: base.chapterId,
      shotId,
      status: "generated" as const,
      assetReady: true,
      sourceApplicability,
    },
  };
}

describe("CandidateLockSetResolver", () => {
  it("LKS-01/06/07/08/10 returns a sorted complete set and known digest", () => {
    const result = resolveCandidateLockSet({
      ...base,
      shots: [
        finalizedShot("shot_2", "lock_2"),
        { ...finalizedShot("retired", "lock_r"), lifecycleStatus: "retired" as const },
        finalizedShot("shot_1", "lock_1"),
      ],
    });
    expect(result).toMatchObject({
      state: "complete",
      sourceApplicability: "current",
      missingShotIds: [],
      clearedShotIds: [],
      unresolvedShotIds: [],
      digest: "sha256:4f6c37787190492a33a825fe0dd902cd1b1587cf8b8dc28f4dd81e08a5e9d8ff",
    });
    expect(result.entries.map(({ shotId, candidateLockRevisionId }) => ({ shotId, candidateLockRevisionId }))).toEqual([
      { shotId: "shot_1", candidateLockRevisionId: "lock_1" },
      { shotId: "shot_2", candidateLockRevisionId: "lock_2" },
    ]);
  });

  it("LKS-02/03 reports unset and clear as incomplete with null applicability/digest", () => {
    const result = resolveCandidateLockSet({
      ...base,
      shots: [
        { ...finalizedShot("shot_missing", "lock_m"), currentCandidateLockRevisionId: null, currentRevision: null, candidate: null },
        { ...finalizedShot("shot_clear", "lock_c"), currentRevision: { ...finalizedShot("shot_clear", "lock_c").currentRevision, action: "clear" as const, candidateId: null }, candidate: null },
      ],
    });
    expect(result).toMatchObject({
      state: "incomplete",
      sourceApplicability: null,
      missingShotIds: ["shot_missing"],
      clearedShotIds: ["shot_clear"],
      unresolvedShotIds: [],
      digest: null,
    });
  });

  it("LKS-04/05 promotes broken pointer/candidate/asset scope to unresolved", () => {
    const broken = finalizedShot("shot_b", "lock_b");
    const result = resolveCandidateLockSet({
      ...base,
      shots: [
        { ...broken, currentRevision: { ...broken.currentRevision, shotId: "other" } },
        { ...finalizedShot("shot_c", "lock_c"), candidate: { ...finalizedShot("shot_c", "lock_c").candidate!, assetReady: false } },
      ],
    });
    expect(result).toMatchObject({
      state: "unresolved",
      sourceApplicability: null,
      unresolvedShotIds: ["shot_b", "shot_c"],
      digest: null,
    });
  });

  it("LKS-12/13 aggregates source applicability independently from structure", () => {
    expect(resolveCandidateLockSet({ ...base, shots: [finalizedShot("shot_a", "lock_a", "historical")] })).toMatchObject({
      state: "complete",
      sourceApplicability: "historical",
    });
    expect(resolveCandidateLockSet({ ...base, shots: [finalizedShot("shot_a", "lock_a", "legacy_unresolved")] })).toMatchObject({
      state: "complete",
      sourceApplicability: "legacy_unresolved",
    });
  });

  it("LKS-09 changes only when a current revision identity changes", () => {
    const original = resolveCandidateLockSet({ ...base, shots: [finalizedShot("shot_a", "lock_a")] });
    const changed = resolveCandidateLockSet({ ...base, shots: [finalizedShot("shot_a", "lock_b")] });
    expect(changed.digest).not.toBe(original.digest);
  });

  it("LKS-07/08/10 is invariant across row permutations and presentation-only fields", () => {
    const shots = [
      { ...finalizedShot("shot_c", "lock_c"), storyboardOrder: 3, candidate: { ...finalizedShot("shot_c", "lock_c").candidate!, label: "C", favoriteAt: null } },
      { ...finalizedShot("shot_a", "lock_a"), storyboardOrder: 1, candidate: { ...finalizedShot("shot_a", "lock_a").candidate!, label: "A", favoriteAt: null } },
      { ...finalizedShot("shot_b", "lock_b"), storyboardOrder: 2, candidate: { ...finalizedShot("shot_b", "lock_b").candidate!, label: "B", favoriteAt: null } },
    ];
    const permutations = [
      shots,
      [shots[2]!, shots[0]!, shots[1]!],
      [...shots].reverse(),
    ];
    const digests = permutations.map((rows, index) => resolveCandidateLockSet({
      ...base,
      shots: rows.map((row) => ({
        ...row,
        storyboardOrder: 100 - index,
        candidate: { ...row.candidate!, label: `changed-${index}`, favoriteAt: "2026-07-15T00:00:00.000Z" },
      })),
    }).digest);
    expect(new Set(digests).size).toBe(1);
  });

  it("LKS-11 matches an independently hashed canonical byte fixture", () => {
    const bytes = '[{"candidateLockRevisionId":"lock_1","shotId":"shot_1"},{"candidateLockRevisionId":"lock_2","shotId":"shot_2"}]';
    const independent = `sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
    expect(resolveCandidateLockSet({
      ...base,
      shots: [finalizedShot("shot_2", "lock_2"), finalizedShot("shot_1", "lock_1")],
    }).digest).toBe(independent);
    expect(independent).toBe("sha256:4f6c37787190492a33a825fe0dd902cd1b1587cf8b8dc28f4dd81e08a5e9d8ff");
  });
});
