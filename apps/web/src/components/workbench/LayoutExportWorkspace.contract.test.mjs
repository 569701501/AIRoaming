import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceUrl = new URL("./LayoutExportWorkspace.vue", import.meta.url);

test("changing balloon kind applies one semantic style batch", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /layoutBalloonVisualPresetV1/);
  assert.match(source, /executeBatch\("应用语义气泡样式"/);
  assert.match(source, /command\("balloon\.set_kind"/);
  assert.match(source, /command\("balloon\.set_visual_style"/);
  assert.match(source, /command\("balloon\.set_tail"/);
  assert.match(source, /command\("balloon\.replace_text_document"/);
  assert.match(source, /resolveLayoutBalloonVisualRoleV1\(primaryElement\)/);
  assert.match(source, /enabled: visual\.tailAllowed && element\.tail\.enabled/);
  assert.doesNotMatch(source, /element\.tail\.enabled \|\| element\.balloonKind === "caption"/);
});

test("semantic text roles select real 400, 500 and 900 faces", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(
    source,
    /balloonKind === "shout" \? 900 : balloonKind === "caption" \? 500 : 400/,
  );
  assert.match(source, /font\.metadata\.face\.weight === desiredWeight/);
  assert.match(source, /run\.fontAssetId = semanticFace\.assetId/);
  assert.match(source, /run\.fontWeight = semanticFace\.metadata\.face\.weight/);
});
