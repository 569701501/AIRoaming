import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyLayoutCommand,
  LayoutDocumentCodecV1,
  previewLayoutProfileResizeV1,
  type EditorCommandV1,
  type LayoutDocumentV1,
} from "./index.js";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/layout");

async function fixture(name: string): Promise<LayoutDocumentV1> {
  return (JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8")) as { document: LayoutDocumentV1 }).document;
}

describe("G5 profile resize preview", () => {
  it("previews keep_coordinates and scale_uniform as one reversible profile command", async () => {
    const before = await fixture("paged-four-panel-rich-text");
    const kept = previewLayoutProfileResizeV1({ document: before, width: 2160, height: 2880, mode: "keep_coordinates" });
    const scaled = previewLayoutProfileResizeV1({ document: before, width: 2160, height: 2880, mode: "scale_uniform" });
    expect(kept.canvases[0]!.elements[0]!.transform).toEqual(before.canvases[0]!.elements[0]!.transform);
    expect(scaled.canvases[0]!.elements[0]!.transform.x).toBeCloseTo(before.canvases[0]!.elements[0]!.transform.x * 1.2, 3);
    const command: EditorCommandV1<"layout.resize_profile"> = {
      schemaVersion: 1,
      commandId: "resize_profile_1",
      type: "layout.resize_profile",
      label: "resize profile",
      payload: { profile: scaled.profile, canvases: scaled.canvases },
    };
    const applied = applyLayoutCommand(before, command);
    const restored = applyLayoutCommand(applied.document, applied.inverse).document;
    expect(LayoutDocumentCodecV1.encode(restored).digest).toBe(LayoutDocumentCodecV1.encode(before).digest);
  });

  it("changes a strip default height without moving or resizing existing sections", async () => {
    const before = await fixture("vertical-long-20-sections");
    const preview = previewLayoutProfileResizeV1({ document: before, width: 1080, height: 2400, mode: "keep_coordinates" });
    expect(preview.profile).toMatchObject({ kind: "vertical_strip", defaultSectionHeight: 2400 });
    expect(preview.canvases.map((canvas) => ({ id: canvas.id, width: canvas.width, height: canvas.height })))
      .toEqual(before.canvases.map((canvas) => ({ id: canvas.id, width: canvas.width, height: canvas.height })));
  });
});
