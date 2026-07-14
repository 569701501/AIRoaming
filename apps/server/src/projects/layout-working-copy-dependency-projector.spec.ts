import { describe, expect, it } from "vitest";

import {
  LayoutWorkingCopyProjectionError,
  projectLayoutWorkingCopyDependencies,
} from "./layout-working-copy-dependency-projector.js";

describe("LayoutWorkingCopyDependencyProjector", () => {
  it("IMP-02/03 projects current and already-stale legacy bindings", () => {
    const result = projectLayoutWorkingCopyDependencies({
      workingCopyId: "wc_a",
      documentKind: "legacy_chapter_layout_v1",
      documentDigest: `sha256:${"a".repeat(64)}`,
      documentJson: {
        schemaVersion: 1,
        kind: "legacy_chapter_layout_v1",
        sourceResolution: "complete",
        sourceBindings: [
          { elementId: "element_current", shotId: "shot_a", candidateId: "candidate_a", candidateLockRevisionId: "lock_2" },
          { elementId: "element_stale", shotId: "shot_a", candidateId: "candidate_old", candidateLockRevisionId: "lock_1" },
        ],
        legacyDocument: { pages: [] },
      },
      currentRevisionByShot: { shot_a: { id: "lock_2", action: "replace" } },
    });
    expect(result).toEqual([
      expect.objectContaining({ elementId: "element_current", sourceCandidateLockRevisionId: "lock_2", resolution: "current" }),
      expect.objectContaining({ elementId: "element_stale", sourceCandidateLockRevisionId: "lock_1", resolution: "stale" }),
    ]);
  });

  it("IMP-04/05 creates deterministic legacy ids and never guesses a source revision", () => {
    const input = {
      workingCopyId: "wc_legacy",
      documentKind: "legacy_chapter_layout_v1" as const,
      documentDigest: `sha256:${"b".repeat(64)}`,
      documentJson: {
        schemaVersion: 1,
        kind: "legacy_chapter_layout_v1",
        sourceResolution: "unresolved",
        sourceBindings: [],
        legacyDocument: {
          pages: [{
            id: "page_a",
            placements: [
              { order: 1, shotId: "shot_a", candidateId: "candidate_a", candidateLockRevisionId: "lock_current" },
              { order: 2, shotId: "shot_a", candidateId: "candidate_a" },
            ],
          }],
        },
      },
      currentRevisionByShot: { shot_a: { id: "lock_current", action: "lock" as const } },
    };
    const first = projectLayoutWorkingCopyDependencies(input);
    const second = projectLayoutWorkingCopyDependencies(input);
    expect(first).toEqual(second);
    expect(first).toEqual([
      {
        workingCopyId: "wc_legacy",
        documentDigest: `sha256:${"b".repeat(64)}`,
        elementId: "legacy:page_a:1",
        shotId: "shot_a",
        candidateId: "candidate_a",
        sourceCandidateLockRevisionId: "lock_current",
        resolution: "unresolved",
      },
      {
        workingCopyId: "wc_legacy",
        documentDigest: `sha256:${"b".repeat(64)}`,
        elementId: "legacy:page_a:2",
        shotId: "shot_a",
        candidateId: "candidate_a",
        sourceCandidateLockRevisionId: null,
        resolution: "unresolved",
      },
    ]);
  });

  it("IMP-02 projects free images and panel content images from layout_document_v1", () => {
    const result = projectLayoutWorkingCopyDependencies({
      workingCopyId: "wc_v1",
      documentKind: "layout_document_v1",
      documentDigest: `sha256:${"c".repeat(64)}`,
      documentJson: {
        schemaVersion: 1,
        kind: "layout_document_v1",
        canvases: [{
          elements: [
            { type: "free_image", id: "free_a", source: { shotId: "shot_a", candidateId: "candidate_a", candidateLockRevisionId: "lock_a" } },
            { type: "panel_frame", id: "panel_a", contentImage: { id: "panel_image_a", source: { shotId: "shot_b", candidateId: "candidate_b", candidateLockRevisionId: "lock_b" } } },
            { type: "text", id: "text_a" },
          ],
        }],
      },
      currentRevisionByShot: {
        shot_a: { id: "lock_a", action: "lock" },
        shot_b: { id: "lock_b", action: "replace" },
      },
    });
    expect(result.map((item) => item.elementId)).toEqual(["free_a", "panel_image_a"]);
    expect(result.every((item) => item.resolution === "current")).toBe(true);
  });

  it("IMP-04 rejects malformed envelopes instead of repairing them", () => {
    expect(() => projectLayoutWorkingCopyDependencies({
      workingCopyId: "wc_bad",
      documentKind: "layout_document_v1",
      documentDigest: `sha256:${"d".repeat(64)}`,
      documentJson: { schemaVersion: 1, kind: "layout_document_v1", canvases: "bad" },
      currentRevisionByShot: {},
    })).toThrowError(new LayoutWorkingCopyProjectionError("LAYOUT_WORKING_COPY_DOCUMENT_INVALID"));
  });

  it("IMP-04 preserves unresolved authority instead of trusting plausible ids", () => {
    const [legacy] = projectLayoutWorkingCopyDependencies({
      workingCopyId: "wc_unresolved",
      documentKind: "legacy_chapter_layout_v1",
      documentDigest: `sha256:${"e".repeat(64)}`,
      documentJson: {
        schemaVersion: 1,
        kind: "legacy_chapter_layout_v1",
        sourceResolution: "unresolved",
        sourceBindings: [{ elementId: "element_a", shotId: "shot_a", candidateId: "candidate_a", candidateLockRevisionId: "lock_a" }],
        legacyDocument: { pages: [] },
      },
      currentRevisionByShot: { shot_a: { id: "lock_a", action: "lock" } },
    });
    expect(legacy?.resolution).toBe("unresolved");

    const [v1] = projectLayoutWorkingCopyDependencies({
      workingCopyId: "wc_missing_source",
      documentKind: "layout_document_v1",
      documentDigest: `sha256:${"f".repeat(64)}`,
      documentJson: { schemaVersion: 1, kind: "layout_document_v1", canvases: [{ elements: [{ type: "free_image", id: "image_a" }] }] },
      currentRevisionByShot: {},
    });
    expect(v1).toMatchObject({ shotId: null, sourceCandidateLockRevisionId: null, resolution: "unresolved" });
  });
});
