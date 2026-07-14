import { describe, expect, it } from "vitest";
import type {
  CandidateChapterSourceState,
  CandidateLockSetSummary,
  ExportRevisionSourceEvaluation,
  LayoutSourceEvaluation,
} from "@airoaming/shared";
import { deriveCandidateSourceGates } from "./candidate-source-query.service.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function lockSet(overrides: Partial<CandidateLockSetSummary> = {}): CandidateLockSetSummary {
  return {
    schemaVersion: 1,
    projectId: "project_a",
    chapterId: "chapter_a",
    storyboardVersionId: "storyboard_a",
    state: "complete",
    sourceApplicability: "current",
    entries: [],
    missingShotIds: [],
    clearedShotIds: [],
    unresolvedShotIds: [],
    digest: DIGEST,
    ...overrides,
  };
}

function layoutSource(
  overrides: Partial<LayoutSourceEvaluation> = {},
): LayoutSourceEvaluation {
  return {
    revisionPosition: "current",
    sourceResolution: "current",
    artifactFreshness: "current",
    sourceLockSetDigest: DIGEST,
    currentLockSetDigest: DIGEST,
    staleElementIds: [],
    unresolvedElementIds: [],
    reasonCodes: [],
    ...overrides,
  };
}

function exportSource(
  overrides: Partial<ExportRevisionSourceEvaluation> = {},
): ExportRevisionSourceEvaluation {
  return {
    revisionPosition: "current",
    completionApplicability: "current",
    sourceResolution: "current",
    artifactFreshness: "current",
    layoutRevisionId: "layout_a",
    sourceLockSetDigest: DIGEST,
    currentLockSetDigest: DIGEST,
    reasonCodes: [],
    ...overrides,
  };
}

function input(overrides: Partial<Pick<CandidateChapterSourceState, "candidateLockSet" | "layoutWorkingCopy" | "currentLayout" | "currentExport">> = {}) {
  return {
    candidateLockSet: lockSet(),
    layoutWorkingCopy: { id: "working_a", source: layoutSource({ revisionPosition: "working_copy", artifactFreshness: null }) },
    currentLayout: { id: "layout_a", source: layoutSource() },
    currentExport: { id: "export_a", source: exportSource() },
    ...overrides,
  };
}

describe("Candidate source gates", () => {
  it("allows each downstream transition only on a complete current source chain", () => {
    expect(deriveCandidateSourceGates(input())).toEqual({
      buildLayoutWorkingCopy: { allowed: true, reasonCodes: [] },
      createLayoutRevision: { allowed: true, reasonCodes: [] },
      exportLayout: { allowed: true, reasonCodes: [] },
      exportPackage: { allowed: true, reasonCodes: [] },
    });
  });

  it("blocks stale working/layout/export sources with a stable stale code", () => {
    const stale = layoutSource({
      sourceResolution: "stale",
      artifactFreshness: "stale",
      staleElementIds: ["element_a"],
      reasonCodes: ["SOURCE_LOCK_CHANGED"],
    });
    const gates = deriveCandidateSourceGates(input({
      layoutWorkingCopy: { id: "working_a", source: { ...stale, revisionPosition: "working_copy", artifactFreshness: null } },
      currentLayout: { id: "layout_a", source: stale },
      currentExport: { id: "export_a", source: exportSource({ sourceResolution: "stale", artifactFreshness: "stale", reasonCodes: ["SOURCE_LOCK_CHANGED"] }) },
    }));
    expect(gates.buildLayoutWorkingCopy).toEqual({ allowed: false, reasonCodes: ["LAYOUT_SOURCE_STALE"] });
    expect(gates.exportLayout.reasonCodes[0]).toBe("LAYOUT_SOURCE_STALE");
    expect(gates.exportPackage.reasonCodes[0]).toBe("LAYOUT_SOURCE_STALE");
  });

  it("prioritizes sealed binding digest mismatch over generic unresolved", () => {
    const unresolved = layoutSource({
      sourceResolution: "unresolved",
      artifactFreshness: null,
      unresolvedElementIds: ["element_a"],
      reasonCodes: ["LOCK_SET_DIGEST_MISMATCH"],
    });
    const gates = deriveCandidateSourceGates(input({
      currentLayout: { id: "layout_a", source: unresolved },
      currentExport: { id: "export_a", source: exportSource({ sourceResolution: "unresolved", artifactFreshness: null, reasonCodes: ["LOCK_SET_DIGEST_MISMATCH"] }) },
    }));
    expect(gates.exportLayout.reasonCodes).toEqual([
      "LAYOUT_SOURCE_DIGEST_MISMATCH",
      "LAYOUT_SOURCE_UNRESOLVED",
    ]);
    expect(gates.exportPackage.reasonCodes[0]).toBe("LAYOUT_SOURCE_DIGEST_MISMATCH");
  });

  it("allows a first working-copy build but blocks formal stages when source rows are absent", () => {
    const gates = deriveCandidateSourceGates(input({
      layoutWorkingCopy: null,
      currentLayout: null,
      currentExport: null,
    }));
    expect(gates.buildLayoutWorkingCopy).toEqual({ allowed: true, reasonCodes: [] });
    expect(gates.createLayoutRevision).toEqual({ allowed: false, reasonCodes: ["LAYOUT_SOURCE_UNRESOLVED"] });
    expect(gates.exportLayout).toEqual({ allowed: false, reasonCodes: ["LAYOUT_SOURCE_UNRESOLVED"] });
    expect(gates.exportPackage).toEqual({ allowed: false, reasonCodes: ["LAYOUT_SOURCE_UNRESOLVED"] });
  });

  it("blocks every downstream stage when the candidate lock set is incomplete", () => {
    const gates = deriveCandidateSourceGates(input({
      candidateLockSet: lockSet({ state: "incomplete", sourceApplicability: null, digest: null, missingShotIds: ["shot_a"] }),
    }));
    expect(gates.buildLayoutWorkingCopy.reasonCodes[0]).toBe("CANDIDATE_LOCK_SET_INCOMPLETE");
    expect(gates.createLayoutRevision.reasonCodes[0]).toBe("CANDIDATE_LOCK_SET_INCOMPLETE");
    expect(gates.exportLayout.reasonCodes[0]).toBe("CANDIDATE_LOCK_SET_INCOMPLETE");
    expect(gates.exportPackage.reasonCodes[0]).toBe("CANDIDATE_LOCK_SET_INCOMPLETE");
  });
});
