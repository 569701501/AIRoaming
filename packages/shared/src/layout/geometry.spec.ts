import { describe, expect, it } from "vitest";
import {
  createBalloonPathV1,
  evaluateCoverCropV1,
  normalizeLayoutNumber,
  normalizeLayoutRotation,
  resolveBalloonTailRootV1,
} from "./index.js";

describe("G5-M2 deterministic geometry", () => {
  it("implements layout_number_v1 quantization and rotation", () => {
    expect(normalizeLayoutNumber(1.2345)).toBe(1.235);
    expect(Object.is(normalizeLayoutNumber(-0.0001), -0)).toBe(false);
    expect(normalizeLayoutRotation(180)).toBe(-180);
    expect(normalizeLayoutRotation(540.0004)).toBe(-180);
  });

  it("uses one cover matrix for base scale, zoom, offset, rotation and flip", () => {
    const covered = evaluateCoverCropV1({
      sourceWidth: 144,
      sourceHeight: 96,
      frameWidth: 1100,
      frameHeight: 1500,
      crop: { zoom: 1.35, offsetX: 42, offsetY: -18, rotation: 12, flipX: true, flipY: false },
    });
    expect(covered.baseScale).toBeGreaterThan(0);
    expect(covered.actualScale).toBeCloseTo(covered.baseScale * 1.35, 3);
    expect(covered.covered).toBe(true);
    expect(evaluateCoverCropV1({
      sourceWidth: 144,
      sourceHeight: 96,
      frameWidth: 1100,
      frameHeight: 1500,
      crop: { zoom: 1, offsetX: 900, offsetY: 0, rotation: 12, flipX: false, flipY: false },
    }).covered).toBe(false);
  });

  it("generates deterministic controlled paths for all four balloon kinds", () => {
    const input = { width: 600, height: 360, tail: { enabled: true, rootRatio: 0.55, targetX: 80, targetY: 500, baseWidth: 42 } };
    const paths = (["speech", "thought", "shout", "caption"] as const)
      .map((kind) => createBalloonPathV1({ ...input, kind }));
    expect(new Set(paths).size).toBe(4);
    expect(paths.every((value) => value.startsWith("M") && value.endsWith("Z"))).toBe(true);
    expect(createBalloonPathV1({ ...input, kind: "speech" })).toBe(paths[0]);
  });

  it("attaches diagonal tails to the edge facing the target", () => {
    const root = resolveBalloonTailRootV1(540, 348, {
      enabled: true,
      rootRatio: 0.12,
      targetX: -124,
      targetY: -343,
      baseWidth: 38,
    });
    expect(root.side).toBe("top");
  });
});
