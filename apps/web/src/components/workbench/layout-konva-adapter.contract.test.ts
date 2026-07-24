import assert from "node:assert/strict";
import test from "node:test";

import type {
  BalloonElementV1,
  LayoutCanvasV1,
  LayoutTopLevelElementV1,
} from "@airoaming/shared";

import {
  normalizeKonvaNodeTransformV1,
  normalizeKonvaTailTargetV1,
  normalizeKonvaTransformBatchV1,
  projectBalloonTailTargetToKonvaV1,
  projectKonvaViewportZoomAnchorV1,
  projectLayoutCanvasToKonvaV1,
} from "./layout-konva-adapter";

function element(
  id: string,
  transform: LayoutTopLevelElementV1["transform"],
  locked = false,
): LayoutTopLevelElementV1 {
  return {
    id,
    type: "text",
    name: id,
    transform,
    locked,
    hidden: false,
    semantic: "custom",
    verticalAlign: "start",
    richText: {
      schemaVersion: 1,
      writingMode: "horizontal-tb",
      textOrientation: "mixed",
      paragraphs: [{
        align: "start",
        lineHeight: 1.2,
        runs: [{
          text: id,
          fontAssetId: "font_regular",
          fontSize: 32,
          fontWeight: 400,
          fontStyle: "normal",
          color: "#111827FF",
          letterSpacing: 0,
          stroke: null,
        }],
      }],
    },
  };
}

const first = element("first", {
  x: 20,
  y: 30,
  width: 200,
  height: 100,
  rotation: 0,
  opacity: 0.6,
});
const second = element("second", {
  x: 300,
  y: 160,
  width: 80,
  height: 120,
  rotation: -20,
  opacity: 1,
});
const locked = element("locked", {
  x: 10,
  y: 10,
  width: 30,
  height: 30,
  rotation: 0,
  opacity: 1,
}, true);
const canvas = {
  id: "canvas",
  kind: "page",
  name: "page",
  width: 1000,
  height: 1400,
  backgroundColor: "#FFFFFFFF",
  panelReadingOrder: [],
  elements: [first, second, locked],
} satisfies LayoutCanvasV1;

test("projection and Transformer normalization are invariant across DPR", () => {
  assert.deepEqual(
    projectLayoutCanvasToKonvaV1(canvas, { zoom: 0.5, devicePixelRatio: 1 }),
    projectLayoutCanvasToKonvaV1(canvas, { zoom: 0.5, devicePixelRatio: 3 }),
  );

  const node = {
    centerX: 100,
    centerY: 75,
    width: 100,
    height: 50,
    scaleX: 1.2,
    scaleY: 0.8,
    rotation: 370,
  };
  const lowDpr = normalizeKonvaNodeTransformV1(first, node, {
    zoom: 0.5,
    devicePixelRatio: 1,
  });
  const highDpr = normalizeKonvaNodeTransformV1(first, node, {
    zoom: 0.5,
    devicePixelRatio: 4,
  });

  assert.deepEqual(highDpr, lowDpr);
  assert.deepEqual(lowDpr, {
    elementId: "first",
    transform: {
      x: 80,
      y: 110,
      width: 240,
      height: 80,
      rotation: 10,
      opacity: 0.6,
    },
  });
  assert.equal("scaleX" in lowDpr.transform, false);
  assert.equal("scaleY" in lowDpr.transform, false);

  const minimum = normalizeKonvaNodeTransformV1(first, {
    centerX: 0.05,
    centerY: 0.05,
    width: 0.1,
    height: 0.1,
    scaleX: 0.1,
    scaleY: 0.1,
    rotation: 0,
  }, { zoom: 0.1, devicePixelRatio: 2 });
  assert.equal(minimum.transform.width, 1);
  assert.equal(minimum.transform.height, 1);
});

test("a multi-selection becomes one ordered scale-free command input and omits locked nodes", () => {
  const result = normalizeKonvaTransformBatchV1(canvas, [
    {
      elementId: "first",
      centerX: 60,
      centerY: 40,
      width: 100,
      height: 50,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    {
      elementId: "second",
      centerX: 170,
      centerY: 110,
      width: 40,
      height: 60,
      scaleX: 1,
      scaleY: 1,
      rotation: -20,
    },
    {
      elementId: "locked",
      centerX: 20,
      centerY: 20,
      width: 15,
      height: 15,
      scaleX: 2,
      scaleY: 2,
      rotation: 0,
    },
  ], { zoom: 0.5, devicePixelRatio: 2 });

  assert.deepEqual(result.map((item) => item.elementId), ["first", "second"]);
  assert.deepEqual(result[0]?.transform, first.transform);
  assert.deepEqual(result[1]?.transform, second.transform);
});

test("rotated balloon tail projection round-trips in logical document coordinates", () => {
  const balloon = {
    ...element("balloon", {
      x: 120,
      y: 240,
      width: 260,
      height: 140,
      rotation: 37,
      opacity: 1,
    }),
    type: "balloon",
    balloonKind: "speech",
    sourceShotId: null,
    speakerCharacterId: null,
    fillColor: "#FFFFFFFF",
    strokeColor: "#111827FF",
    strokeWidth: 4,
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    verticalAlign: "center",
    tail: {
      enabled: true,
      rootRatio: 0.6,
      targetX: 215.25,
      targetY: 222.75,
      baseWidth: 30,
    },
  } as BalloonElementV1;
  const viewport = { zoom: 0.37, devicePixelRatio: 3 };
  const projected = projectBalloonTailTargetToKonvaV1(balloon, viewport);
  const restored = normalizeKonvaTailTargetV1(balloon, projected, viewport);

  assert.ok(Math.abs(restored.targetX - balloon.tail.targetX) < 0.000001);
  assert.ok(Math.abs(restored.targetY - balloon.tail.targetY) < 0.000001);
});

test("wheel anchor stays fixed with non-zero scroll and an offset viewport", () => {
  const result = projectKonvaViewportZoomAnchorV1({
    scrollLeft: 300,
    scrollTop: 140,
    viewportLeft: 100,
    viewportTop: 50,
    clientX: 250,
    clientY: 170,
    previousZoom: 0.25,
    nextZoom: 0.5,
  });

  assert.deepEqual(result, { scrollLeft: 750, scrollTop: 400 });
  const anchorX = 250 - 100;
  const anchorY = 170 - 50;
  assert.equal((300 + anchorX) / 0.25, (result.scrollLeft + anchorX) / 0.5);
  assert.equal((140 + anchorY) / 0.25, (result.scrollTop + anchorY) / 0.5);
});
