import { describe, expect, it } from "vitest";
import {
  collectLayoutTextIssuesV1,
  evaluateRichTextOverflowV1,
  fontAssetCoversTextV1,
  layoutFontFamilyNameV1,
  parseLayoutFontAssetMetadataV1,
  type LayoutDocumentV1,
  type LayoutFontCatalogItemV1,
  type RichTextDocumentV1,
} from "./index.js";

const metadata = parseLayoutFontAssetMetadataV1({
  schemaVersion: 1,
  kind: "layout_font_asset_v1",
  packageId: "@openfonts/noto-sans-sc_chinese-simplified@1.44.9",
  familyName: "Noto Sans SC",
  displayName: "Noto Sans SC 受控常规体",
  face: { weight: 400, style: "normal" },
  format: "woff2",
  license: {
    spdx: "OFL-1.1",
    sourceUrl: "https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE",
    embeddingAllowed: true,
  },
  cmap: {
    digest: `sha256:${"1".repeat(64)}`,
    codePointCount: 7,
    ranges: [[32, 126], [0x3040, 0x30ff], [0x4e00, 0x9fff]],
  },
});

const catalogItem: LayoutFontCatalogItemV1 = {
  assetId: "font_main",
  sha256: `sha256:${"2".repeat(64)}`,
  bytes: 1234,
  mimeType: "font/woff2",
  metadata,
};

const richText = (text: string, writingMode: RichTextDocumentV1["writingMode"] = "horizontal-tb"): RichTextDocumentV1 => ({
  schemaVersion: 1,
  writingMode,
  textOrientation: "mixed",
  paragraphs: [{
    align: "start",
    lineHeight: 1.2,
    runs: [{
      text,
      fontAssetId: "font_main",
      fontSize: 20,
      fontWeight: 400,
      fontStyle: "normal",
      color: "#111827FF",
      letterSpacing: 0,
      stroke: null,
    }],
  }],
});

describe("G5-M5 controlled fonts and deterministic text preflight", () => {
  it("strictly parses font evidence and rejects unknown or overlapping cmap fields", () => {
    expect(metadata.license.embeddingAllowed).toBe(true);
    expect(metadata.cmap.ranges).toEqual([[32, 126], [0x3040, 0x30ff], [0x4e00, 0x9fff]]);
    expect(() => parseLayoutFontAssetMetadataV1({ ...metadata, systemFamily: "Arial" })).toThrow(/unknown field/i);
    expect(() => parseLayoutFontAssetMetadataV1({
      ...metadata,
      cmap: { ...metadata.cmap, ranges: [[32, 126], [120, 200]] },
    })).toThrow(/overlap/i);
  });

  it("uses an Asset-ID-isolated family and never treats missing emoji as covered", () => {
    expect(layoutFontFamilyNameV1("font.main:400")).toBe("AIR_66_6f_6e_74_2e_6d_61_69_6e_3a_34_30_30");
    expect(fontAssetCoversTextV1(metadata, "汉字かなABC")).toEqual({ covered: true, missingCodePoints: [] });
    expect(fontAssetCoversTextV1(metadata, "汉🙂")).toEqual({ covered: false, missingCodePoints: [0x1f642] });
  });

  it("localizes horizontal and vertical overflow without shrinking the font", () => {
    expect(evaluateRichTextOverflowV1(richText("一二三四"), { width: 40, height: 24 })).toMatchObject({
      overflow: true,
      axis: "height",
      firstOverflow: { paragraphIndex: 0, graphemeOffset: 2 },
    });
    expect(evaluateRichTextOverflowV1(richText("一二三四", "vertical-rl"), { width: 24, height: 40 })).toMatchObject({
      overflow: true,
      axis: "width",
      firstOverflow: { paragraphIndex: 0, graphemeOffset: 2 },
    });
  });

  it("reports missing font, missing glyph, embedding and overflow as formal blockers", () => {
    const document: LayoutDocumentV1 = {
      schemaVersion: 1,
      kind: "layout_document_v1",
      projectId: "project_1",
      chapterId: "chapter_1",
      comicFormat: "paged_comic",
      profile: {
        kind: "paged",
        presetId: "custom",
        width: 320,
        height: 320,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        panelReadingDirection: "ltr_ttb",
      },
      fontPolicy: { defaultFontAssetId: "font_main", fallbackFontAssetIds: [] },
      canvases: [{
        id: "page_1",
        kind: "page",
        name: "第 1 页",
        width: 320,
        height: 320,
        backgroundColor: "#FFFFFFFF",
        panelReadingOrder: [],
        elements: [{
          id: "text_1",
          type: "text",
          name: "正文",
          transform: { x: 0, y: 0, width: 40, height: 24, rotation: 0, opacity: 1 },
          locked: false,
          hidden: false,
          semantic: "custom",
          verticalAlign: "start",
          richText: richText("一二🙂四"),
        }],
      }],
    };
    const blockedCatalog = [{
      ...catalogItem,
      metadata: { ...metadata, license: { ...metadata.license, embeddingAllowed: false } },
    }];
    expect(collectLayoutTextIssuesV1(document, blockedCatalog).map((issue) => issue.code)).toEqual([
      "LAYOUT_FONT_EMBEDDING_FORBIDDEN",
      "LAYOUT_FONT_GLYPH_MISSING",
      "LAYOUT_TEXT_OVERFLOW",
    ]);
    expect(collectLayoutTextIssuesV1(document, []).map((issue) => issue.code)).toEqual([
      "LAYOUT_FONT_ASSET_MISSING",
      "LAYOUT_TEXT_OVERFLOW",
    ]);
  });
});
