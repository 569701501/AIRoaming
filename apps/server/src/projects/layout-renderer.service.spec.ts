import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLayoutRenderPlanV1, digestCanonicalJson, type LayoutPublicationProfileV1 } from "@airoaming/shared";
import { describe, expect, it } from "vitest";

import { LayoutRendererService, type ResolvedRenderAssetV1 } from "./layout-renderer.service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/layout");
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } } };
};

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function loadFixture(name: string): Promise<any> {
  return JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8"));
}

async function resolvedAssets(manifest: any): Promise<ResolvedRenderAssetV1[]> {
  const ready = [...manifest.images, ...manifest.fonts.filter((font: any) => font.status !== "red")];
  return Promise.all(ready.map(async (asset: any) => ({
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    bytes: await readFile(path.join(fixtureRoot, asset.relativePath)),
  })));
}

describe("G5-M7 fixed Chromium renderer", () => {
  it("fails closed before browser launch when a pinned render asset is missing", async () => {
    const fixture = await loadFixture("crop-rotate-flip");
    const profile: LayoutPublicationProfileV1 = {
      schemaVersion: 1,
      kind: "paged_publication",
      outputScale: 1,
      includePdf: false,
      pdfPixelDpi: 96,
    };
    const plan = buildLayoutRenderPlanV1({
      document: fixture.document,
      sourceLockSetDigest: fixture.expected.sourceLockSetDigest,
      profile,
      assets: fixture.expected.assetManifest,
    });
    const assets = await resolvedAssets(fixture.expected.assetManifest);
    await expect(new LayoutRendererService().render(plan, profile, assets.slice(1)))
      .rejects.toThrow("LAYOUT_RENDER_ASSET_INVALID");
  });

  it("fails closed before browser launch when the render plan exceeds output limits", async () => {
    const fixture = await loadFixture("crop-rotate-flip");
    const profile: LayoutPublicationProfileV1 = {
      schemaVersion: 1,
      kind: "paged_publication",
      outputScale: 1,
      includePdf: false,
      pdfPixelDpi: 96,
    };
    const plan = buildLayoutRenderPlanV1({
      document: fixture.document,
      sourceLockSetDigest: fixture.expected.sourceLockSetDigest,
      profile,
      assets: fixture.expected.assetManifest,
    });
    const oversized = structuredClone(plan);
    oversized.canvases[0]!.width = 8_193;
    const { renderPlanDigest: _oldDigest, ...unsignedPlan } = oversized;
    oversized.renderPlanDigest = digestCanonicalJson(unsignedPlan);
    await expect(new LayoutRendererService().render(oversized, profile, await resolvedAssets(fixture.expected.assetManifest)))
      .rejects.toThrow("LAYOUT_RENDER_OUTPUT_LIMIT_EXCEEDED:DIMENSION");
  });

  it("renders decodable page PNG/PDF with identical sha across three runs", async () => {
    const fixture = await loadFixture("crop-rotate-flip");
    const profile: LayoutPublicationProfileV1 = {
      schemaVersion: 1,
      kind: "paged_publication",
      outputScale: 1,
      includePdf: true,
      pdfPixelDpi: 96,
    };
    const plan = buildLayoutRenderPlanV1({
      document: fixture.document,
      sourceLockSetDigest: fixture.expected.sourceLockSetDigest,
      profile,
      assets: fixture.expected.assetManifest,
    });
    const assets = await resolvedAssets(fixture.expected.assetManifest);
    const renderer = new LayoutRendererService();
    const runs = [];
    for (let index = 0; index < 3; index += 1) runs.push(await renderer.render(plan, profile, assets));
    const pageSha = runs.map((run) => run.artifacts.find((artifact) => artifact.role === "page_png")?.sha256);
    const pdfSha = runs.map((run) => run.artifacts.find((artifact) => artifact.role === "document_pdf")?.sha256);
    expect(new Set(pageSha).size).toBe(1);
    expect(new Set(pdfSha).size).toBe(1);
    expect(runs[0]?.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "page_png", width: 1800, height: 2400 }),
      expect.objectContaining({ role: "document_pdf", pageCount: 1 }),
    ]));
  }, 60_000);

  it("renders the 20-section vertical corpus into slices that reassemble pixel-exactly", async () => {
    const fixture = await loadFixture("vertical-long-20-sections");
    const profile: LayoutPublicationProfileV1 = {
      schemaVersion: 1,
      kind: "vertical_publication",
      outputScale: 1,
      maxSliceHeightPx: 8192,
      cutPolicy: "prefer_section_boundary_then_exact",
      includeLongPng: true,
    };
    const plan = buildLayoutRenderPlanV1({
      document: fixture.document,
      sourceLockSetDigest: fixture.expected.sourceLockSetDigest,
      profile,
      assets: fixture.expected.assetManifest,
    });
    const output = await new LayoutRendererService().render(plan, profile, await resolvedAssets(fixture.expected.assetManifest));
    const slices = output.artifacts.filter((artifact) => artifact.role === "strip_slice_png");
    expect(slices.map((artifact) => ({ role: artifact.role, order: artifact.order, width: artifact.width, height: artifact.height }))).toEqual([
      { role: "strip_slice_png", order: 1, width: 1080, height: 7680 },
      { role: "strip_slice_png", order: 2, width: 1080, height: 7680 },
      { role: "strip_slice_png", order: 3, width: 1080, height: 7680 },
      { role: "strip_slice_png", order: 4, width: 1080, height: 7680 },
      { role: "strip_slice_png", order: 5, width: 1080, height: 7680 },
    ]);
    const long = output.artifacts.find((artifact) => artifact.role === "long_png");
    expect(long).toMatchObject({ width: 1080, height: 38_400 });
    const decodedLong = PNG.sync.read(long!.bytes);
    let rowOffset = 0;
    for (const slice of slices) {
      const decodedSlice = PNG.sync.read(slice.bytes);
      expect(decodedSlice.width).toBe(decodedLong.width);
      const start = rowOffset * decodedLong.width * 4;
      const end = start + decodedSlice.data.byteLength;
      expect(decodedSlice.data.equals(decodedLong.data.subarray(start, end))).toBe(true);
      rowOffset += decodedSlice.height;
    }
    expect(rowOffset).toBe(decodedLong.height);
  }, 60_000);

  it("embeds the pinned CJK font in a real PDF without exposing a local path", async () => {
    const fixture = await loadFixture("paged-four-panel-rich-text");
    const document = structuredClone(fixture.document);
    const fontAssetId = "asset_font_noto_sc_400_pdf_test";
    document.fontPolicy = { defaultFontAssetId: fontAssetId, fallbackFontAssetIds: [] };
    for (const element of document.canvases.flatMap((canvas: any) => canvas.elements)) {
      if (element.type !== "text" && element.type !== "balloon") continue;
      for (const paragraph of element.richText.paragraphs) {
        for (const run of paragraph.runs) {
          run.text = "雨夜车站";
          run.fontAssetId = fontAssetId;
        }
      }
    }
    const fontPath = require.resolve("@openfonts/noto-sans-sc_chinese-simplified/files/noto-sans-sc-chinese-simplified-400.woff2");
    const fontBytes = await readFile(fontPath);
    const fontSha = sha256(fontBytes);
    const assetManifest = {
      ...fixture.expected.assetManifest,
      fonts: [{
        assetId: fontAssetId,
        role: "font",
        mimeType: "font/woff2",
        sha256: fontSha,
        bytes: fontBytes.byteLength,
        metadataDigest: fontSha,
      }],
    };
    const profile: LayoutPublicationProfileV1 = { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 };
    const plan = buildLayoutRenderPlanV1({ document, sourceLockSetDigest: fixture.expected.sourceLockSetDigest, profile, assets: assetManifest });
    const imageAssets = await resolvedAssets({ ...fixture.expected.assetManifest, fonts: [] });
    const output = await new LayoutRendererService().render(plan, profile, [...imageAssets, { assetId: fontAssetId, mimeType: "font/woff2", sha256: fontSha, bytes: fontBytes }]);
    const pdf = output.artifacts.find((artifact) => artifact.role === "document_pdf")?.bytes;
    expect(pdf).toBeDefined();
    const pdfText = pdf!.toString("latin1");
    expect(pdfText).toContain("/Subtype /Type3");
    expect(pdfText).toMatch(/\/FontName \/[A-Z]{6}\+NotoSansSC-Regular/);
    expect(pdfText).toContain("/CharProcs");
    expect(pdfText).toContain("/ToUnicode");
    expect(pdfText).not.toContain(fontPath);
    expect(pdfText).not.toContain("noto-sans-sc-chinese-simplified-400.woff2");
  }, 60_000);
});
