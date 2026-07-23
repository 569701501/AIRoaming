import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewUrl = new URL("./LayoutReadOnlyPreviewView.vue", import.meta.url);
const textPreviewUrl = new URL("../components/workbench/LayoutElementTextPreview.vue", import.meta.url);

test("read-only layout preview reuses the authoritative balloon and rich-text renderer", async () => {
  const source = await readFile(previewUrl, "utf8");

  assert.match(source, /import LayoutElementTextPreview from/);
  assert.match(source, /<LayoutElementTextPreview/);
  assert.match(source, /:fallback-font-asset-ids="documentValue\.fontPolicy\.fallbackFontAssetIds"/);
  assert.match(source, /:scale="canvasScale\(canvas\)"/);
  assert.match(source, /:overflow="overflowElementIds\.has\(element\.id\)"/);
  assert.doesNotMatch(source, /v-else>\{\{\s*richTextValue\(element\.richText\)\s*\}\}<\/span>/);
});

test("read-only layout preview installs each controlled font under its asset identity", async () => {
  const source = await readFile(previewUrl, "utf8");

  assert.match(source, /layoutFontFamilyNameV1\(item\.assetId\)/);
  assert.doesNotMatch(source, /font-family:"\$\{cssText\(item\.metadata\.familyName\)\}"/);
});

test("read-only layout preview has no hard-coded ellipse balloon fallback", async () => {
  const source = await readFile(previewUrl, "utf8");

  assert.doesNotMatch(source, /\.readonly-element\.type-balloon\s*\{[^}]*border-radius:\s*48%/s);
  assert.doesNotMatch(source, /\.readonly-element\.type-balloon\s*\{[^}]*background:\s*white/s);
});

test("read-only output stays clean of editor safe-area and slice guides", async () => {
  const source = await readFile(previewUrl, "utf8");

  assert.doesNotMatch(source, /class="safe-area"/);
  assert.doesNotMatch(source, /class="slice-boundary"/);
});

test("text preview anchors paragraph line boxes to the actual scaled font size", async () => {
  const source = await readFile(textPreviewUrl, "utf8");

  assert.match(source, /:style="paragraphStyle\(paragraph\)"/);
  assert.match(source, /maximumFontSize \* props\.scale/);
});

test("semantic speech tones render with distinct thought and shout silhouettes", async () => {
  const source = await readFile(textPreviewUrl, "utf8");

  assert.match(source, /resolveLayoutBalloonVisualRoleV1\(props\.element\)/);
  assert.match(source, /stroke-linejoin="round"/);
  assert.doesNotMatch(source, /fillColor\.slice\(0,\s*7\)/);
  assert.doesNotMatch(source, /strokeColor\.slice\(0,\s*7\)/);
});
