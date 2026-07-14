import { describe, expect, it } from "vitest";

import {
  evaluateExportRevisionSource,
  evaluateLayoutBindingSource,
  evaluateLayoutSource,
} from "./layout-source-freshness-resolver.js";

function binding(overrides: Record<string, unknown> = {}) {
  return evaluateLayoutBindingSource({
    layoutRevisionId: "layout_a",
    workingCopyId: null,
    elementId: "element_a",
    binding: {
      shotId: "shot_a",
      candidateLockRevisionId: "lock_a",
      sourceRevisionExists: true,
      scopeMatches: true,
      candidateExists: true,
      assetReady: true,
    },
    currentCandidateLockRevisionId: "lock_a",
    currentAction: "lock",
    ...overrides,
  });
}

describe("LayoutSourceFreshnessResolver", () => {
  it("FRS-01/02/03 resolves current, changed, unset, and clear bindings", () => {
    expect(binding()).toMatchObject({ resolution: "current", reasonCodes: [] });
    expect(binding({ currentCandidateLockRevisionId: "lock_b" })).toMatchObject({ resolution: "stale", reasonCodes: ["SOURCE_LOCK_CHANGED"] });
    expect(binding({ currentCandidateLockRevisionId: null, currentAction: null })).toMatchObject({ resolution: "stale", reasonCodes: ["CURRENT_LOCK_MISSING"] });
    expect(binding({ currentCandidateLockRevisionId: "lock_clear", currentAction: "clear" })).toMatchObject({ resolution: "stale", reasonCodes: ["CURRENT_LOCK_CLEARED"] });
  });

  it("FRS-04/05 resolves missing and broken source relations as unresolved", () => {
    expect(binding({ binding: null })).toMatchObject({ resolution: "unresolved", reasonCodes: ["SOURCE_BINDING_MISSING"] });
    expect(binding({ binding: { shotId: "shot_a", candidateLockRevisionId: "lock_a", sourceRevisionExists: false, scopeMatches: true, candidateExists: true, assetReady: true } })).toMatchObject({ resolution: "unresolved", reasonCodes: ["SOURCE_LOCK_REVISION_MISSING"] });
    expect(binding({ binding: { shotId: "shot_a", candidateLockRevisionId: "lock_a", sourceRevisionExists: true, scopeMatches: false, candidateExists: true, assetReady: true } })).toMatchObject({ resolution: "unresolved", reasonCodes: ["SOURCE_SCOPE_MISMATCH"] });
  });

  it("FRS-06/07 aggregates unresolved over stale and detects sealed digest mismatch", () => {
    const stale = binding({ elementId: "element_stale", currentCandidateLockRevisionId: "lock_b" });
    const unresolved = binding({ elementId: "element_bad", binding: null });
    expect(evaluateLayoutSource({
      revisionPosition: "current",
      bindings: [stale, unresolved],
      sourceLockSetDigest: "sha256:stored",
      bindingLockSetDigest: "sha256:stored",
      currentLockSetDigest: "sha256:current",
    })).toMatchObject({
      sourceResolution: "unresolved",
      artifactFreshness: null,
      staleElementIds: ["element_stale"],
      unresolvedElementIds: ["element_bad"],
    });
    expect(evaluateLayoutSource({
      revisionPosition: "current",
      bindings: [binding()],
      sourceLockSetDigest: "sha256:stored",
      bindingLockSetDigest: "sha256:other",
      currentLockSetDigest: "sha256:stored",
    })).toMatchObject({
      sourceResolution: "unresolved",
      artifactFreshness: null,
      reasonCodes: ["LOCK_SET_DIGEST_MISMATCH"],
    });
  });

  it("FRS-08/09/10 keeps revision position separate from source resolution", () => {
    expect(evaluateLayoutSource({ revisionPosition: "current", bindings: [binding()], sourceLockSetDigest: "d", bindingLockSetDigest: "d", currentLockSetDigest: "d" })).toMatchObject({ artifactFreshness: "current" });
    expect(evaluateLayoutSource({ revisionPosition: "current", bindings: [binding({ currentCandidateLockRevisionId: "other" })], sourceLockSetDigest: "d", bindingLockSetDigest: "d", currentLockSetDigest: "other" })).toMatchObject({ artifactFreshness: "stale" });
    expect(evaluateLayoutSource({ revisionPosition: "historical", bindings: [binding({ currentCandidateLockRevisionId: "other" })], sourceLockSetDigest: "d", bindingLockSetDigest: "d", currentLockSetDigest: "other" })).toMatchObject({ artifactFreshness: "historical", sourceResolution: "stale" });
    expect(evaluateLayoutSource({ revisionPosition: "working_copy", bindings: [binding()], sourceLockSetDigest: "d", bindingLockSetDigest: "d", currentLockSetDigest: "d" })).toMatchObject({ artifactFreshness: null });
  });

  it("FRS-13 derives export freshness without changing completion applicability", () => {
    const layout = evaluateLayoutSource({ revisionPosition: "current", bindings: [binding({ currentCandidateLockRevisionId: "other" })], sourceLockSetDigest: "d", bindingLockSetDigest: "d", currentLockSetDigest: "other" });
    expect(evaluateExportRevisionSource({
      revisionPosition: "current",
      completionApplicability: "current",
      layoutRevisionId: "layout_a",
      sourceLockSetDigest: "d",
      currentLockSetDigest: "other",
      layout,
    })).toMatchObject({
      completionApplicability: "current",
      sourceResolution: "stale",
      artifactFreshness: "stale",
    });
  });

  it("FRS-06 normalizes aggregate output independently from binding row order", () => {
    const values = [
      binding({ elementId: "骨", currentCandidateLockRevisionId: "other" }),
      binding({ elementId: "a", binding: null }),
      binding({ elementId: "é", binding: null }),
    ];
    const evaluate = (bindings: typeof values) => evaluateLayoutSource({
      revisionPosition: "current",
      bindings,
      sourceLockSetDigest: "d",
      bindingLockSetDigest: "d",
      currentLockSetDigest: "other",
    });
    expect(evaluate([...values].reverse())).toEqual(evaluate(values));
    expect(evaluate(values)).toMatchObject({
      staleElementIds: ["骨"],
      unresolvedElementIds: ["a", "é"],
      reasonCodes: ["SOURCE_BINDING_MISSING", "SOURCE_LOCK_CHANGED"],
    });
  });
});
