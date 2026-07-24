import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("./LayoutKonvaInteractionLayer.vue", import.meta.url);
const adapterUrl = new URL("./layout-konva-adapter.ts", import.meta.url);
const workspaceUrl = new URL("./LayoutExportWorkspace.vue", import.meta.url);
const packageUrl = new URL("../../../package.json", import.meta.url);

test("Konva 10.3.0 is pinned and remains outside persistence, history and export", async () => {
  const [component, adapter, packageJson] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(adapterUrl, "utf8"),
    readFile(packageUrl, "utf8"),
  ]);

  assert.equal(JSON.parse(packageJson).dependencies.konva, "10.3.0");
  assert.match(component, /import Konva from "konva"/);
  assert.match(component, /projectLayoutCanvasToKonvaV1/);
  assert.match(component, /normalizeKonvaTransformBatchV1/);
  assert.doesNotMatch(`${component}\n${adapter}`, /toJSON|toDataURL|localStorage|indexedDB|pushSnapshotHistory|LayoutDocumentCodec/);
});

test("one completed gesture emits one normalized commit and pointer cancellation emits none", async () => {
  const source = await readFile(componentUrl, "utf8");
  const commit = source.slice(
    source.indexOf("function commitTransforms"),
    source.indexOf("function cancelGesture"),
  );
  const cancel = source.slice(
    source.indexOf("function cancelGesture"),
    source.indexOf("function pointerPosition"),
  );

  assert.match(source, /node\.on\("dragend"[\s\S]*commitTransforms\(ids\)/);
  assert.match(source, /transformer\.on\("transformend"[\s\S]*if \(!gestureActive\) return/);
  assert.equal((commit.match(/emit\("commitTransform"/g) ?? []).length, 1);
  assert.match(source, /stage\.on\("pointercancel", cancelGesture\)/);
  assert.match(source, /globalThis\.addEventListener\("blur", cancelGesture\)/);
  assert.match(source, /if \(event\.key === "Escape"\) cancelGesture\(\)/);
  assert.doesNotMatch(cancel, /emit\("commit/);
});

test("interaction layer exposes selection, snapping, crop pan/zoom, rotated tail and wheel client coordinates", async () => {
  const source = await readFile(componentUrl, "utf8");

  assert.match(source, /Konva\.Transformer/);
  assert.match(source, /Konva\.Util\.haveIntersection/);
  assert.match(source, /name: "alignment-guide"/);
  assert.match(source, /name: "crop-pan-handle"/);
  assert.match(source, /name: "crop-zoom-handle"/);
  assert.match(source, /normalizeKonvaTailTargetV1/);
  assert.match(source, /emit\("commitCrop"/);
  assert.match(source, /clientX: event\.evt\.clientX/);
  assert.match(source, /clientY: event\.evt\.clientY/);
  assert.match(source, /\.is-pass-through\s*\{[^}]*pointer-events:\s*none/s);
});

test("parent converts a single selection to one command and multi-selection to one batch", async () => {
  const source = await readFile(workspaceUrl, "utf8");
  const commit = source.slice(
    source.indexOf("function commitKonvaTransforms"),
    source.indexOf("function commitKonvaTail"),
  );

  assert.match(commit, /if \(commands\.length === 1\) session\.execute/);
  assert.match(commit, /else executeBatch\("变换所选对象", commands\)/);
  assert.doesNotMatch(commit, /forEach\([^)]*session\.execute/);
});
