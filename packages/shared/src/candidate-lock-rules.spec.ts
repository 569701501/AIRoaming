import { describe, expect, it } from "vitest";

import {
  isExactCandidateLockReplay,
  resolveCandidateLockTransition,
  type CandidateLockRevisionRecord,
  type CurrentCandidateDecision,
} from "./candidate-lock.js";

const finalized = (candidateId = "candidate_a"): CurrentCandidateDecision => ({
  state: "finalized",
  revisionId: "revision_1",
  revision: 1,
  action: "lock",
  candidateId,
  previousRevisionId: null,
  decidedAt: "2026-07-15T00:00:00.000Z",
});

const cleared: CurrentCandidateDecision = {
  state: "cleared",
  revisionId: "revision_2",
  revision: 2,
  action: "clear",
  candidateId: null,
  previousRevisionId: "revision_1",
  decidedAt: "2026-07-15T00:01:00.000Z",
};

const unset: CurrentCandidateDecision = {
  state: "unset",
  revisionId: null,
  revision: null,
  action: null,
  candidateId: null,
  previousRevisionId: null,
  decidedAt: null,
};

describe("candidate lock pure rules", () => {
  it("FSM-01/04/06/08 resolves every legal create transition", () => {
    expect(resolveCandidateLockTransition(unset, { action: "lock", candidateId: "a" })).toEqual({
      kind: "create",
      action: "lock",
      candidateId: "a",
    });
    expect(resolveCandidateLockTransition(finalized(), { action: "replace", candidateId: "b" })).toEqual({
      kind: "create",
      action: "replace",
      candidateId: "b",
    });
    expect(resolveCandidateLockTransition(finalized(), { action: "clear" })).toEqual({
      kind: "create",
      action: "clear",
      candidateId: null,
    });
    expect(resolveCandidateLockTransition(cleared, { action: "lock", candidateId: "a" })).toEqual({
      kind: "create",
      action: "lock",
      candidateId: "a",
    });
  });

  it("FSM-05/07 resolves no-op without inventing a revision", () => {
    expect(resolveCandidateLockTransition(finalized(), { action: "replace", candidateId: "candidate_a" })).toEqual({
      kind: "no_op",
      action: "replace",
      candidateId: "candidate_a",
    });
    expect(resolveCandidateLockTransition(cleared, { action: "clear" })).toEqual({
      kind: "no_op",
      action: "clear",
      candidateId: null,
    });
  });

  it.each([
    [unset, { action: "replace", candidateId: "b" }],
    [unset, { action: "clear" }],
    [finalized(), { action: "lock", candidateId: "b" }],
    [cleared, { action: "replace", candidateId: "b" }],
  ] as const)("FSM-02/03/09 rejects invalid transition %#", (current, intent) => {
    expect(() => resolveCandidateLockTransition(current, intent)).toThrowError(
      expect.objectContaining({ code: "CANDIDATE_LOCK_ACTION_INVALID" }),
    );
  });

  it("CON-01/02/03 recognizes only an exact current replay", () => {
    const current: CandidateLockRevisionRecord = {
      id: "revision_2",
      projectId: "project_a",
      chapterId: "chapter_a",
      shotId: "shot_a",
      revision: 2,
      action: "replace",
      candidateId: "candidate_b",
      previousRevisionId: "revision_1",
      origin: "runtime",
      reason: null,
      decidedAt: "2026-07-15T00:00:00.000Z",
      recordedAt: "2026-07-15T00:00:00.000Z",
    };
    const request = {
      action: "replace" as const,
      candidateId: "candidate_b",
      expectedCurrentRevisionId: "revision_1",
      impactDigest: `sha256:${"a".repeat(64)}` as const,
      reason: null,
    };
    expect(isExactCandidateLockReplay(current, request)).toBe(true);
    expect(isExactCandidateLockReplay({ ...current, previousRevisionId: "older" }, request)).toBe(false);
    expect(isExactCandidateLockReplay({ ...current, candidateId: "candidate_c" }, request)).toBe(false);
    expect(isExactCandidateLockReplay(null, request)).toBe(false);
  });

});
