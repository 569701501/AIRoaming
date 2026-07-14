import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CANDIDATE_LOCK_ACTIONS,
  CANDIDATE_LOCK_COMMIT_RESULTS,
  CANDIDATE_LOCK_DECISION_STATES,
  CANDIDATE_LOCK_ORIGINS,
  CANDIDATE_LOCK_SET_STATES,
  CANDIDATE_STATUSES,
  parseCommitCandidateLockRequest,
  parsePreviewCandidateLockRequest,
  type CandidateStatus,
  type CandidateLockHistoryPage,
  type CandidatePreferenceResponse,
  type CurrentCandidateDecision,
  type WorkbenchCandidateV2,
  type WorkbenchShotV2,
} from "./candidate-lock.js";

function expectContractError(value: unknown, code: string): void {
  try {
    parsePreviewCandidateLockRequest(value);
    throw new Error("EXPECTED_CONTRACT_ERROR");
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function expectCommitContractError(value: unknown, code: string): void {
  try {
    parseCommitCandidateLockRequest(value);
    throw new Error("EXPECTED_CONTRACT_ERROR");
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe("candidate lock shared contract", () => {
  it("SHR-01 exposes only the three runtime candidate statuses", () => {
    expect(CANDIDATE_STATUSES).toEqual([
      "generated",
      "rejected",
      "superseded",
    ]);
  });

  it("SHR-03 exposes the closed candidate lock state vocabularies", () => {
    expect(CANDIDATE_LOCK_ACTIONS).toEqual(["lock", "replace", "clear"]);
    expect(CANDIDATE_LOCK_DECISION_STATES).toEqual([
      "unset",
      "finalized",
      "cleared",
    ]);
    expect(CANDIDATE_LOCK_ORIGINS).toEqual(["runtime", "legacy_import"]);
    expect(CANDIDATE_LOCK_COMMIT_RESULTS).toEqual([
      "created",
      "no_op",
      "replayed",
    ]);
    expect(CANDIDATE_LOCK_SET_STATES).toEqual([
      "complete",
      "incomplete",
      "unresolved",
    ]);
  });

  it("PAR-01/PAR-02 parses the three discriminated preview intents", () => {
    expect(
      parsePreviewCandidateLockRequest({ action: "lock", candidateId: "a" }),
    ).toEqual({ action: "lock", candidateId: "a" });
    expect(
      parsePreviewCandidateLockRequest({
        action: "replace",
        candidateId: "b",
      }),
    ).toEqual({ action: "replace", candidateId: "b" });
    expect(parsePreviewCandidateLockRequest({ action: "clear" })).toEqual({
      action: "clear",
    });
  });

  it("PAR-03/PAR-05/PAR-11 rejects invalid preview bodies with stable codes", () => {
    for (const [value, code] of [
      [null, "CANDIDATE_LOCK_BODY_INVALID"],
      [[], "CANDIDATE_LOCK_BODY_INVALID"],
      [{}, "CANDIDATE_LOCK_ACTION_REQUIRED"],
      [{ action: "other" }, "CANDIDATE_LOCK_ACTION_INVALID"],
      [{ action: "lock" }, "CANDIDATE_ID_REQUIRED"],
      [{ action: "lock", candidateId: "" }, "CANDIDATE_ID_REQUIRED"],
      [{ action: "lock", candidateId: "   " }, "CANDIDATE_ID_REQUIRED"],
      [{ action: "replace", candidateId: " a" }, "CANDIDATE_ID_INVALID"],
      [{ action: "clear", candidateId: null }, "CANDIDATE_ID_FORBIDDEN"],
      [
        { action: "clear", unexpected: true },
        "CANDIDATE_LOCK_BODY_UNKNOWN_FIELD",
      ],
    ] as const) {
      expectContractError(value, code);
    }
  });

  it("PAR-06/PAR-10 parses an explicit commit CAS token, digest, and reason", () => {
    expect(
      parseCommitCandidateLockRequest({
        action: "lock",
        candidateId: "candidate_a",
        expectedCurrentRevisionId: null,
        impactDigest: `sha256:${"a".repeat(64)}`,
        reason: "  更稳定的构图  ",
      }),
    ).toEqual({
      action: "lock",
      candidateId: "candidate_a",
      expectedCurrentRevisionId: null,
      impactDigest: `sha256:${"a".repeat(64)}`,
      reason: "更稳定的构图",
    });
    expect(
      parseCommitCandidateLockRequest({
        action: "clear",
        expectedCurrentRevisionId: "revision_a",
        impactDigest: `sha256:${"b".repeat(64)}`,
        reason: "   ",
      }),
    ).toEqual({
      action: "clear",
      expectedCurrentRevisionId: "revision_a",
      impactDigest: `sha256:${"b".repeat(64)}`,
      reason: null,
    });
    expect(
      parseCommitCandidateLockRequest({
        action: "clear",
        expectedCurrentRevisionId: "revision_a",
        impactDigest: `sha256:${"b".repeat(64)}`,
        reason: null,
      }),
    ).toMatchObject({ action: "clear", reason: null });
    expect(
      parseCommitCandidateLockRequest({
        action: "lock",
        candidateId: "candidate_a",
        expectedCurrentRevisionId: null,
        impactDigest: `sha256:${"c".repeat(64)}`,
        reason: "字".repeat(500),
      }).reason,
    ).toHaveLength(500);
  });

  it("PAR-06/PAR-08/PAR-10 rejects malformed commit concurrency fields", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    for (const [value, code] of [
      [
        { action: "lock", candidateId: "a", impactDigest: digest },
        "EXPECTED_CURRENT_REVISION_REQUIRED",
      ],
      [
        {
          action: "lock",
          candidateId: "a",
          expectedCurrentRevisionId: 1,
          impactDigest: digest,
        },
        "EXPECTED_CURRENT_REVISION_INVALID",
      ],
      [
        {
          action: "lock",
          candidateId: "a",
          expectedCurrentRevisionId: null,
        },
        "IMPACT_DIGEST_REQUIRED",
      ],
      [
        {
          action: "lock",
          candidateId: "a",
          expectedCurrentRevisionId: null,
          impactDigest: "sha256:ABC",
        },
        "IMPACT_DIGEST_INVALID",
      ],
      [
        {
          action: "lock",
          candidateId: "a",
          expectedCurrentRevisionId: null,
          impactDigest: digest,
          reason: "字".repeat(501),
        },
        "CANDIDATE_LOCK_REASON_TOO_LONG",
      ],
    ] as const) {
      expectCommitContractError(value, code);
    }
  });

  it("SHR-02/SHR-04/SHR-05/SHR-06 keeps V2 DTOs free of legacy lock semantics", () => {
    type LegacyCandidateStatus = Extract<CandidateStatus, "selected" | "locked">;
    type ShotHasLegacyLock = "lockedCandidateId" extends keyof WorkbenchShotV2
      ? true
      : false;

    expectTypeOf<LegacyCandidateStatus>().toEqualTypeOf<never>();
    expectTypeOf<ShotHasLegacyLock>().toEqualTypeOf<false>();
    expectTypeOf<WorkbenchCandidateV2>().toHaveProperty("favoriteAt");
    expectTypeOf<WorkbenchCandidateV2>().toHaveProperty("isCurrentFinal");
    expectTypeOf<WorkbenchCandidateV2>().toHaveProperty("sourceApplicability");
    expectTypeOf<CandidateLockHistoryPage>().toHaveProperty("nextBeforeRevision");
    expectTypeOf<CandidatePreferenceResponse>().toHaveProperty("candidate");

    const decisions: CurrentCandidateDecision[] = [
      {
        state: "unset",
        revisionId: null,
        revision: null,
        action: null,
        candidateId: null,
        previousRevisionId: null,
        decidedAt: null,
      },
      {
        state: "finalized",
        revisionId: "revision_1",
        revision: 1,
        action: "lock",
        candidateId: "candidate_a",
        previousRevisionId: null,
        decidedAt: null,
      },
      {
        state: "cleared",
        revisionId: "revision_2",
        revision: 2,
        action: "clear",
        candidateId: null,
        previousRevisionId: "revision_1",
        decidedAt: null,
      },
    ];
    expect(decisions.map((decision) => decision.state)).toEqual([
      "unset",
      "finalized",
      "cleared",
    ]);
  });
});
