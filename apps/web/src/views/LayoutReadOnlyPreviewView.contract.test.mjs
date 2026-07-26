import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewUrl = new URL("./LayoutReadOnlyPreviewView.vue", import.meta.url);
const canvasPreviewUrl = new URL("../components/workbench/LayoutCanvasVisualPreview.vue", import.meta.url);
const textPreviewUrl = new URL("../components/workbench/LayoutElementTextPreview.vue", import.meta.url);
const imageProjectionUrl = new URL("../components/workbench/layout-image-preview.ts", import.meta.url);

test("read-only view reuses the complete visual renderer for working copies and immutable V1/V2 revisions", async () => {
  const source = await readFile(previewUrl, "utf8");

  assert.match(source, /import LayoutCanvasVisualPreview from/);
  assert.match(source, /<LayoutCanvasVisualPreview/);
  assert.match(source, /:source-catalog="sourceCatalog"/);
  assert.match(source, /:font-catalog="fontCatalog"/);
  assert.match(source, /projectLayoutDocumentV2ToV1/);
  assert.match(source, /revisionDocumentDigest/);
  assert.doesNotMatch(source, /class="readonly-element"/);
  assert.doesNotMatch(source, /object-fit:\s*cover/);
});

test("visual canvas projects transform, layer, opacity, panel clipping and overlay border", async () => {
  const source = await readFile(canvasPreviewUrl, "utf8");
  const renderedCanvas = source.slice(source.indexOf("<article"), source.indexOf("</article>"));

  assert.match(source, /elements\.filter\(\(element\) => !element\.hidden\)/);
  assert.match(source, /left: `\$\{transform\.x \/ props\.canvas\.width \* 100\}%`/);
  assert.match(source, /opacity: transform\.opacity/);
  assert.match(source, /transform: `rotate\(\$\{transform\.rotation\}deg\)`/);
  assert.match(source, /zIndex: props\.canvas\.elements\.findIndex/);
  assert.match(source, /class="panel-border"/);
  assert.match(source, /borderWidth: element\.border\.visible/);
  assert.match(source, /borderRadius: `\$\{element\.shape\.cornerRadius \* scale\.value\}px`/);
  assert.match(source, /\.layout-visual-element\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(source, /\.layout-visual-element\.type-panel_frame\s*\{[^}]*border:/s);
  assert.doesNotMatch(source, /\.layout-visual-element\.type-panel_frame\s*\{[^}]*background:/s);
  assert.doesNotMatch(renderedCanvas, /空画格|正在核对原始尺寸|素材尺寸与来源证据不一致|文字溢出/);
  assert.match(source, /class="layout-visual-diagnostics"/);
});

test("cover crop uses authoritative dimensions with intrinsic fallback and never fakes object-fit cover", async () => {
  const canvasSource = await readFile(canvasPreviewUrl, "utf8");
  const projectionSource = await readFile(imageProjectionUrl, "utf8");

  assert.match(canvasSource, /sourceDimensions\.value\.get\(assetId\) \?\? intrinsicDimensions\.value\[assetId\]/);
  assert.match(canvasSource, /image\.naturalWidth/);
  assert.match(canvasSource, /素材尺寸与来源证据不一致/);
  assert.match(canvasSource, /正在核对原始尺寸/);
  assert.match(projectionSource, /evaluateCoverCropV1/);
  assert.match(projectionSource, /crop\.offsetX \* input\.scale/);
  assert.match(projectionSource, /crop\.offsetY \* input\.scale/);
  assert.match(projectionSource, /rotate\(\$\{crop\.rotation\}deg\)/);
  assert.match(projectionSource, /crop\.flipX \? -1 : 1/);
  assert.match(projectionSource, /crop\.flipY \? -1 : 1/);
  assert.match(projectionSource, /visibility: "hidden"/);
  assert.doesNotMatch(projectionSource, /objectFit:\s*"cover"/);
});

test("rich text and every balloon silhouette stay on the shared render semantics", async () => {
  const source = await readFile(textPreviewUrl, "utf8");

  assert.match(source, /createBalloonPathV1/);
  assert.match(source, /resolveLayoutBalloonVisualRoleV1\(props\.element\)/);
  assert.match(source, /:d="balloonPath"/);
  assert.match(source, /stroke-linejoin="round"/);
  assert.match(source, /writingMode: props\.element\.richText\.writingMode/);
  assert.match(source, /textOrientation: props\.element\.richText\.textOrientation/);
  assert.match(source, /padding: `\$\{props\.element\.padding\.top \* props\.scale\}px/);
  assert.match(source, /alignItems: props\.element\.verticalAlign/);
  assert.match(source, /face\?\.weight \?\? run\.fontWeight/);
  assert.match(source, /fontFamily: `"\$\{layoutFontFamilyNameV1\(run\.fontAssetId\)\}"/);
  assert.match(source, /WebkitTextStroke/);
  assert.match(source, /font-synthesis:\s*none/);
  assert.doesNotMatch(source, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(source, /fillColor\.slice\(0,\s*7\)/);
  assert.doesNotMatch(source, /strokeColor\.slice\(0,\s*7\)/);
  assert.doesNotMatch(source, /fallbackFontAssetIds/);
});

test("read-only output stays clean of editor safe-area and slice guides", async () => {
  const source = await readFile(previewUrl, "utf8");

  assert.doesNotMatch(source, /class="safe-area"/);
  assert.doesNotMatch(source, /class="slice-boundary"/);
});
