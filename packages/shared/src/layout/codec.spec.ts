import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LayoutDocumentCodecV1,
  LayoutDocumentValidationError,
  LayoutElementCodecV1,
  LayoutProfileCodecV1,
  LayoutPublicationProfileCodecV1,
  RichTextDocumentCodecV1,
  digestLayoutSourceLockSet,
  projectLayoutSourceBindings,
  type LayoutDocumentV1,
} from "./index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/layout",
);

async function fixture(name: string): Promise<{ document: LayoutDocumentV1; expected: Record<string, unknown> }> {
  return JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8")) as {
    document: LayoutDocumentV1;
    expected: Record<string, unknown>;
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("G5-M2 LayoutDocument codec", () => {
  it("G5-DOC-001/002/011 round-trips all eight fixed fixtures with known digests", async () => {
    const names = [
      "paged-four-panel-rich-text",
      "paged-rtl-reading-order",
      "vertical-long-20-sections",
      "vertical-rich-text-mixed",
      "balloons-all-kinds",
      "crop-rotate-flip",
      "stale-source-a-to-b",
      "preflight-errors",
    ];
    for (const name of names) {
      const sample = await fixture(name);
      const encoded = LayoutDocumentCodecV1.encode(sample.document);
      expect(encoded.value).toEqual(sample.document);
      expect(encoded.digest).toBe(sample.expected.documentDigest);
      expect(LayoutDocumentCodecV1.parseAndNormalize(encoded.canonical)).toEqual(sample.document);
    }
  });

  it("G5-DOC-003 rejects comic format/profile/canvas mismatches", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    expect(() => LayoutDocumentCodecV1.parseAndNormalize({
      ...sample.document,
      comicFormat: "vertical_scroll",
    })).toThrow(/profile/);
    expect(() => LayoutDocumentCodecV1.parseAndNormalize({
      ...sample.document,
      canvases: [{ ...sample.document.canvases[0], kind: "strip_section" }],
    })).toThrow(/kind/);
  });

  it("G5-DOC-004/005/006 rejects duplicate IDs, bad reading order and private fields", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    const duplicate = clone(sample.document);
    duplicate.canvases[0]!.elements[1]!.id = duplicate.canvases[0]!.elements[0]!.id;
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(duplicate)).toThrow(/duplicate/i);

    const badReading = clone(sample.document);
    badReading.canvases[0]!.panelReadingOrder = [badReading.canvases[0]!.panelReadingOrder[0]!];
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(badReading)).toThrow(/panelReadingOrder/);

    expect(() => LayoutDocumentCodecV1.parseAndNormalize({
      ...sample.document,
      viewport: { zoom: 2 },
    })).toThrow(/unknown field/);
    const unknownElement = clone(sample.document) as unknown as Record<string, any>;
    unknownElement.canvases[0].elements[0] = { id: "group", type: "group" };
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(unknownElement)).toThrow(/type/);
  });

  it("G5-DOC-007/008 normalizes numbers, colors, NFC, line endings and equal runs", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    const input = clone(sample.document);
    const text = input.canvases[0]!.elements.find((item) => item.type === "text");
    if (!text || text.type !== "text") throw new Error("fixture text missing");
    text.transform.x = -0;
    text.transform.y = 72.12351;
    text.transform.rotation = 540;
    text.richText.paragraphs[0]!.runs = [
      { ...text.richText.paragraphs[0]!.runs[0]!, text: "Cafe\u0301\r\n" },
      { ...text.richText.paragraphs[0]!.runs[0]!, text: "\t雨" },
      { ...text.richText.paragraphs[0]!.runs[0]!, text: "" },
    ];
    text.richText.paragraphs[0]!.runs[0]!.color = "#111827";
    const normalized = LayoutDocumentCodecV1.parseAndNormalize(input);
    const result = normalized.canvases[0]!.elements.find((item) => item.type === "text");
    if (!result || result.type !== "text") throw new Error("normalized text missing");
    expect(result.transform).toMatchObject({ x: 0, y: 72.124, rotation: -180 });
    expect(result.richText.paragraphs).toHaveLength(2);
    expect(result.richText.paragraphs[0]!.runs).toHaveLength(1);
    expect(result.richText.paragraphs[0]!.runs[0]!.text).toBe("Café");
    expect(result.richText.paragraphs[0]!.runs[0]!.color).toBe("#111827FF");
    expect(result.richText.paragraphs[1]!.runs[0]!.text).toBe("    雨");
  });

  it("G5-DOC-010 fails closed on document limits before expensive parsing", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    expect(() => LayoutDocumentCodecV1.parseAndNormalize({
      ...sample.document,
      canvases: Array.from({ length: 201 }, (_, index) => ({
        ...sample.document.canvases[0],
        id: `canvas_${index}`,
      })),
    })).toThrow(/200/);
    const tooManyElements = clone(sample.document);
    tooManyElements.canvases[0]!.elements = Array.from({ length: 501 }, () => clone(sample.document.canvases[0]!.elements[0]!));
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(tooManyElements)).toThrow(/500/);

    const tooMuchObjectText = clone(sample.document);
    const text = tooMuchObjectText.canvases[0]!.elements.find((item) => item.type === "text");
    if (!text || text.type !== "text") throw new Error("text fixture missing");
    text.richText.paragraphs[0]!.runs[0]!.text = "字".repeat(20_001);
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(tooMuchObjectText)).toThrow(/20000/);

    const tooMuchDocumentText = clone(sample.document);
    const sourceText = tooMuchDocumentText.canvases[0]!.elements.find((item) => item.type === "text");
    if (!sourceText || sourceText.type !== "text") throw new Error("text fixture missing");
    tooMuchDocumentText.canvases[0]!.elements = [
      ...tooMuchDocumentText.canvases[0]!.elements.filter((item) => item.type !== "text"),
      ...Array.from({ length: 11 }, (_, index) => ({
        ...clone(sourceText),
        id: `text_limit_${index}`,
        richText: {
          ...clone(sourceText.richText),
          paragraphs: [{ ...clone(sourceText.richText.paragraphs[0]!), runs: [{ ...clone(sourceText.richText.paragraphs[0]!.runs[0]!), text: "字".repeat(19_000) }] }],
        },
      })),
    ];
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(tooMuchDocumentText)).toThrow(/200000/);

    const oversizedJson = `{"padding":"${"x".repeat(8 * 1024 * 1024)}"}`;
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(oversizedJson)).toThrowError(
      expect.objectContaining({ code: "LAYOUT_DOCUMENT_TOO_LARGE", httpStatus: 413 }),
    );
  });

  it("G5-DOC-012 preserves digest over 100 serialize/parse cycles", async () => {
    const sample = await fixture("crop-rotate-flip");
    const expected = LayoutDocumentCodecV1.encode(sample.document).digest;
    let current: unknown = sample.document;
    for (let index = 0; index < 100; index += 1) {
      current = LayoutDocumentCodecV1.parseAndNormalize(
        LayoutDocumentCodecV1.encode(current).canonical,
      );
    }
    expect(LayoutDocumentCodecV1.encode(current).digest).toBe(expected);
  });

  it("exposes strict standalone Profile, Element and RichText codecs", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    expect(LayoutProfileCodecV1.encode(sample.document.profile).value).toEqual(sample.document.profile);
    const first = sample.document.canvases[0]!.elements[0]!;
    expect(LayoutElementCodecV1.encode(first, {
      canvasWidth: 1800,
      canvasHeight: 2400,
      projectId: sample.document.projectId,
      chapterId: sample.document.chapterId,
    }).value).toEqual(first);
    const text = sample.document.canvases[0]!.elements.find((item) => item.type === "text");
    if (!text || text.type !== "text") throw new Error("text fixture missing");
    expect(RichTextDocumentCodecV1.encode(text.richText).value).toEqual(text.richText);
    expect(() => LayoutProfileCodecV1.parse({ ...sample.document.profile, viewport: {} })).toThrow(/unknown field/);
    expect(() => LayoutElementCodecV1.parse({ ...first, dpr: 2 }, {
      canvasWidth: 1800,
      canvasHeight: 2400,
      projectId: sample.document.projectId,
      chapterId: sample.document.chapterId,
    })).toThrow(/unknown field/);
  });

  it("projects source bindings in document order and uses the G4 lock-set digest", async () => {
    const sample = await fixture("crop-rotate-flip");
    expect(projectLayoutSourceBindings(sample.document)).toEqual([
      expect.objectContaining({ elementId: "panel_crop_image", order: 1, shotId: "shot_001" }),
      expect.objectContaining({ elementId: "free_image_crop", order: 2, shotId: "shot_002" }),
    ]);
    expect(digestLayoutSourceLockSet(sample.document, ["shot_001", "shot_002"]))
      .toBe(sample.expected.sourceLockSetDigest);
    expect(digestLayoutSourceLockSet(sample.document, ["shot_001", "shot_002", "shot_missing"]))
      .toBeNull();
    const conflicting = clone(sample.document);
    const free = conflicting.canvases[0]!.elements.find((item) => item.type === "free_image");
    if (!free || free.type !== "free_image") throw new Error("free image missing");
    free.source.shotId = "shot_001";
    expect(() => digestLayoutSourceLockSet(conflicting, ["shot_001"])).toThrow(/multiple lock revisions/);
  });

  it("recomputes sourceDigest and crop coverage when controlled Asset evidence is supplied", async () => {
    const sample = await fixture("crop-rotate-flip") as any;
    const images = Object.fromEntries(sample.expected.assetManifest.images.map((image: any) => [image.assetId, {
      width: image.width,
      height: image.height,
      sha256: image.sha256,
      ready: true,
    }]));
    expect(LayoutDocumentCodecV1.parseAndNormalize(sample.document, { imageByAssetId: images }))
      .toEqual(sample.document);

    const uncovered = clone(sample.document);
    uncovered.canvases[0].elements[0].contentImage.crop.offsetX = 2000;
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(uncovered, { imageByAssetId: images })).toThrow(/uncovered/);

    const tampered = clone(sample.document);
    tampered.canvases[0].elements[0].contentImage.source.sourceDigest = `sha256:${"0".repeat(64)}`;
    expect(() => LayoutDocumentCodecV1.parseAndNormalize(tampered, { imageByAssetId: images })).toThrow(/sourceDigest/);
  });

  it("strictly parses paged and vertical publication profiles", async () => {
    const paged = { schemaVersion: 1, kind: "paged_publication", outputScale: 2, includePdf: true, pdfPixelDpi: 96 };
    const vertical = { schemaVersion: 1, kind: "vertical_publication", outputScale: 1, maxSliceHeightPx: 8192, cutPolicy: "prefer_section_boundary_then_exact", includeLongPng: false };
    expect(LayoutPublicationProfileCodecV1.encode(paged).value).toEqual(paged);
    expect(LayoutPublicationProfileCodecV1.encode(vertical).value).toEqual(vertical);
    expect(() => LayoutPublicationProfileCodecV1.parse({ ...vertical, maxSliceHeightPx: 8193 })).toThrow();
    expect(() => LayoutPublicationProfileCodecV1.parse({ ...paged, devicePixelRatio: 2 })).toThrow(/unknown field/);
    const sample = await fixture("paged-four-panel-rich-text") as any;
    expect(LayoutPublicationProfileCodecV1.encode(sample.expected.profile).digest).toBe(sample.expected.profileDigest);
  });

  it("uses a stable validation error contract", () => {
    try {
      LayoutDocumentCodecV1.parseAndNormalize(null);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutDocumentValidationError);
      expect(error).toMatchObject({ code: "LAYOUT_DOCUMENT_INVALID", httpStatus: 400 });
    }
  });
});
