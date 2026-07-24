import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLayoutCommand,
  type BalloonElementV1,
  type EditorCommandBatchV1,
  type LayoutDigest,
  type LayoutDocumentV1,
  type LayoutFontCatalogItemV1,
  type RichTextDocumentV1,
  type TextElementV1,
} from "@airoaming/shared";

import {
  buildBalloonVisualStyleCommandV1,
  buildLayoutSfxPresetBatchV1,
} from "./layout-editor-presets";

const digest = `sha256:${"a".repeat(64)}` as LayoutDigest;

function font(assetId: string, weight: 400 | 700 | 900): LayoutFontCatalogItemV1 {
  return {
    assetId,
    sha256: digest,
    bytes: 100,
    mimeType: "font/woff2",
    metadata: {
      schemaVersion: 1,
      kind: "layout_font_asset_v1",
      packageId: "comic-font@1",
      familyName: "Comic Test",
      displayName: `Comic Test ${weight}`,
      face: { weight, style: "normal" },
      format: "woff2",
      license: {
        spdx: "OFL-1.1",
        sourceUrl: "https://example.test/font",
        embeddingAllowed: true,
      },
      cmap: {
        digest,
        codePointCount: 96,
        ranges: [[0x20, 0x7e]],
      },
    },
  };
}

const richText: RichTextDocumentV1 = {
  schemaVersion: 1,
  writingMode: "horizontal-tb",
  textOrientation: "mixed",
  paragraphs: [{
    align: "center",
    lineHeight: 1.15,
    runs: [{
      text: "砰！",
      fontAssetId: "font_400",
      fontSize: 72,
      fontWeight: 400,
      fontStyle: "normal",
      color: "#111827FF",
      letterSpacing: 2,
      stroke: null,
    }],
  }],
};

const textElement: TextElementV1 = {
  id: "sfx",
  type: "text",
  name: "SFX",
  transform: {
    x: 120,
    y: 180,
    width: 360,
    height: 160,
    rotation: 2,
    opacity: 0.85,
  },
  locked: false,
  hidden: false,
  semantic: "custom",
  verticalAlign: "start",
  richText: structuredClone(richText),
};

const balloonElement: BalloonElementV1 = {
  id: "balloon",
  type: "balloon",
  name: "对白",
  transform: {
    x: 80,
    y: 80,
    width: 420,
    height: 240,
    rotation: 4,
    opacity: 0.72,
  },
  locked: false,
  hidden: false,
  balloonKind: "speech",
  sourceShotId: null,
  speakerCharacterId: null,
  fillColor: "#FFFFFFFF",
  strokeColor: "#111827FF",
  strokeWidth: 4,
  padding: { top: 30, right: 36, bottom: 30, left: 36 },
  verticalAlign: "center",
  tail: {
    enabled: true,
    rootRatio: 0.6,
    targetX: 300,
    targetY: 300,
    baseWidth: 36,
  },
  richText: structuredClone(richText),
};

function document(): LayoutDocumentV1 {
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: "project",
    chapterId: "chapter",
    comicFormat: "paged_comic",
    profile: {
      kind: "paged",
      presetId: "custom",
      width: 1000,
      height: 1200,
      safeArea: { top: 40, right: 40, bottom: 40, left: 40 },
      panelReadingDirection: "ltr_ttb",
    },
    fontPolicy: {
      defaultFontAssetId: "font_400",
      fallbackFontAssetIds: [],
    },
    canvases: [{
      id: "page",
      kind: "page",
      name: "page",
      width: 1000,
      height: 1200,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: [],
      elements: [
        structuredClone(textElement),
        structuredClone(balloonElement),
      ],
    }],
  };
}

function applyBatch(value: LayoutDocumentV1, batch: EditorCommandBatchV1): LayoutDocumentV1 {
  return batch.commands.reduce(
    (current, command) => applyLayoutCommand(current, command).document,
    value,
  );
}

test("SFX preset is one batch and preserves text, font size, box geometry and position across snapshot Undo/Redo", () => {
  const before = document();
  const batch = buildLayoutSfxPresetBatchV1({
    canvasId: "page",
    element: textElement,
    fontCatalog: [font("font_400", 400), font("font_700", 700), font("font_900", 900)],
    preset: "impact",
  });
  assert.deepEqual(batch.commands.map((command) => command.type), [
    "text.set_semantic",
    "text.replace_document",
    "element.set_transform",
  ]);

  const after = applyBatch(before, batch);
  const changed = after.canvases[0]?.elements[0] as TextElementV1;
  assert.equal(changed.semantic, "sfx");
  assert.equal(changed.richText.paragraphs[0]?.runs[0]?.text, "砰！");
  assert.equal(changed.richText.paragraphs[0]?.runs[0]?.fontSize, 72);
  assert.equal(changed.richText.paragraphs[0]?.runs[0]?.fontAssetId, "font_900");
  assert.deepEqual(
    {
      x: changed.transform.x,
      y: changed.transform.y,
      width: changed.transform.width,
      height: changed.transform.height,
      opacity: changed.transform.opacity,
    },
    {
      x: textElement.transform.x,
      y: textElement.transform.y,
      width: textElement.transform.width,
      height: textElement.transform.height,
      opacity: textElement.transform.opacity,
    },
  );

  const undoSnapshot = structuredClone(before);
  const redoSnapshot = structuredClone(after);
  assert.deepEqual(undoSnapshot.canvases[0]?.elements[0], textElement);
  assert.deepEqual(redoSnapshot.canvases[0]?.elements[0], changed);
});

test("balloon appearance preset is one visual command and preserves kind, text, tail, object opacity and geometry", () => {
  const before = document();
  const command = buildBalloonVisualStyleCommandV1({
    canvasId: "page",
    element: balloonElement,
    label: "应用青绿对白外观",
    patch: {
      fillColor: "#F0FDFAF2",
      strokeColor: "#0F766EFF",
      strokeWidth: 7,
    },
  });
  assert.equal(command.type, "balloon.set_visual_style");

  const after = applyLayoutCommand(before, command).document;
  const changed = after.canvases[0]?.elements[1] as BalloonElementV1;
  assert.equal(changed.fillColor, "#F0FDFAF2");
  assert.equal(changed.strokeColor, "#0F766EFF");
  assert.equal(changed.strokeWidth, 7);
  assert.equal(changed.balloonKind, balloonElement.balloonKind);
  assert.deepEqual(changed.richText, balloonElement.richText);
  assert.deepEqual(changed.tail, balloonElement.tail);
  assert.deepEqual(changed.transform, balloonElement.transform);

  const undoSnapshot = structuredClone(before);
  const redoSnapshot = structuredClone(after);
  assert.deepEqual(undoSnapshot.canvases[0]?.elements[1], balloonElement);
  assert.deepEqual(redoSnapshot.canvases[0]?.elements[1], changed);
});
