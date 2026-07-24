import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCoverCropV1 } from "@airoaming/shared";

import { layoutImagePreviewStyleV1 } from "./layout-image-preview";

test("cover projection preserves crop zoom, offset, rotation and flips in scaled CSS pixels", () => {
  const crop = {
    zoom: 1.5,
    offsetX: 10,
    offsetY: -20,
    rotation: 17,
    flipX: true,
    flipY: false,
  };
  const style = layoutImagePreviewStyleV1({
    mode: "cover",
    crop,
    frameWidth: 200,
    frameHeight: 200,
    sourceWidth: 800,
    sourceHeight: 400,
    scale: 0.25,
  });
  const evaluation = evaluateCoverCropV1({
    sourceWidth: 800,
    sourceHeight: 400,
    frameWidth: 200,
    frameHeight: 200,
    crop,
  });

  assert.equal(style.left, "calc(50% + 2.5px)");
  assert.equal(style.top, "calc(50% + -5px)");
  assert.equal(style.width, `${800 * evaluation.baseScale * crop.zoom * 0.25}px`);
  assert.equal(style.height, `${400 * evaluation.baseScale * crop.zoom * 0.25}px`);
  assert.equal(style.objectFit, "fill");
  assert.equal(
    style.transform,
    "translate(-50%, -50%) rotate(17deg) scale(-1, 1)",
  );
});

test("contain is exact and an unverified cover crop remains hidden instead of approximated", () => {
  const contain = layoutImagePreviewStyleV1({
    mode: "contain",
    crop: null,
    frameWidth: 200,
    frameHeight: 100,
    sourceWidth: null,
    sourceHeight: null,
    scale: 0.5,
  });
  assert.equal(contain.objectFit, "contain");
  assert.equal(contain.visibility, undefined);

  const unresolved = layoutImagePreviewStyleV1({
    mode: "cover",
    crop: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flipX: false,
      flipY: false,
    },
    frameWidth: 200,
    frameHeight: 100,
    sourceWidth: null,
    sourceHeight: null,
    scale: 0.5,
  });
  assert.equal(unresolved.objectFit, "contain");
  assert.equal(unresolved.visibility, "hidden");
});
