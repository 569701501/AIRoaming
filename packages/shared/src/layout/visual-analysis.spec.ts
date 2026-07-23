import { describe, expect, it } from "vitest";

import {
  createLayoutImageAnalysisV1,
  createRuleFallbackLayoutImageAnalysisV1,
  digestLayoutVisualAnalysisSetV1,
  LayoutImageAnalysisCodecV1,
  unionNormalizedRectsV1,
  type LayoutImageAnalysisDraftV1,
} from "./visual-analysis.js";

const ASSET_DIGEST = `sha256:${"1".repeat(64)}` as const;
const SOURCE_DIGEST = `sha256:${"2".repeat(64)}` as const;

function draft(): LayoutImageAnalysisDraftV1 {
  return {
    schemaVersion: 1,
    policyVersion: "layout_visual_analysis_v1",
    assetId: "asset_visual_1",
    assetDigest: ASSET_DIGEST,
    mode: "vision",
    subjects: [{
      id: "subject_1",
      characterId: "character_1",
      bodyBox: { x: 0.08, y: 0.16, width: 0.36, height: 0.78 },
      faceBox: { x: 0.18, y: 0.22, width: 0.14, height: 0.14 },
      importance: 1,
      confidence: 0.96,
    }],
    focalRegions: [{ box: { x: 0.08, y: 0.16, width: 0.36, height: 0.78 }, weight: 0.9 }],
    textSafeRegions: [{ box: { x: 0.52, y: 0.08, width: 0.4, height: 0.32 }, score: 0.92 }],
    visualCenter: { x: 0.26, y: 0.55 },
    warnings: [],
  };
}

describe("Smart layout M3 strict visual-analysis contract", () => {
  it("SML-VIS-001 normalizes and hashes the same semantic analysis deterministically", () => {
    const first = createLayoutImageAnalysisV1(draft());
    const second = LayoutImageAnalysisCodecV1.parse(structuredClone(first));
    expect(second).toEqual(first);
    expect(second.analysisDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(LayoutImageAnalysisCodecV1.encode(second).digest).toBe(first.analysisDigest);
  });

  it("SML-VIS-002 rejects unknown fields, out-of-bounds rectangles, duplicate IDs and stale digests", () => {
    const valid = createLayoutImageAnalysisV1(draft());
    expect(() => LayoutImageAnalysisCodecV1.parse({ ...valid, providerText: "free form" })).toThrow(/unknown field/);
    const outside = structuredClone(valid) as any;
    outside.subjects[0].bodyBox.x = 0.8;
    expect(() => LayoutImageAnalysisCodecV1.parse(outside)).toThrow(/exceeds normalized image bounds/);
    const duplicate = structuredClone(valid) as any;
    duplicate.subjects.push(structuredClone(duplicate.subjects[0]));
    expect(() => LayoutImageAnalysisCodecV1.parse(duplicate)).toThrow(/duplicate subject id/);
    const stale = structuredClone(valid);
    stale.visualCenter.x = 0.7;
    expect(() => LayoutImageAnalysisCodecV1.parse(stale)).toThrow(/does not match canonical analysis/);
  });

  it("creates an honest rule fallback that cannot claim visual regions", () => {
    const fallback = createRuleFallbackLayoutImageAnalysisV1({
      assetId: "asset_visual_1",
      assetDigest: ASSET_DIGEST,
      warning: "provider_timeout",
    });
    expect(fallback.mode).toBe("rule_fallback");
    expect(fallback.subjects).toEqual([]);
    expect(fallback.warnings).toEqual(["provider_timeout"]);
    expect(() => createLayoutImageAnalysisV1({ ...draft(), mode: "rule_fallback" })).toThrow(/cannot claim visual regions/);
  });

  it("binds the analysis set to unique shot/source/analysis digests with stable ordering", () => {
    const analysis = createLayoutImageAnalysisV1(draft());
    const first = digestLayoutVisualAnalysisSetV1([
      { shotId: "shot_2", sourceDigest: SOURCE_DIGEST, analysis },
      { shotId: "shot_1", sourceDigest: SOURCE_DIGEST, analysis },
    ]);
    const second = digestLayoutVisualAnalysisSetV1([
      { shotId: "shot_1", sourceDigest: SOURCE_DIGEST, analysis },
      { shotId: "shot_2", sourceDigest: SOURCE_DIGEST, analysis },
    ]);
    expect(second).toBe(first);
    expect(() => digestLayoutVisualAnalysisSetV1([
      { shotId: "shot_1", sourceDigest: SOURCE_DIGEST, analysis },
      { shotId: "shot_1", sourceDigest: SOURCE_DIGEST, analysis },
    ])).toThrow(/duplicate shot analysis/);
  });

  it("unions normalized regions without escaping the image", () => {
    expect(unionNormalizedRectsV1([
      { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
      { x: 0.6, y: 0.1, width: 0.3, height: 0.7 },
    ])).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
    expect(unionNormalizedRectsV1([])).toBeNull();
  });
});
