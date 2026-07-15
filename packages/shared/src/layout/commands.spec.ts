import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EDITOR_COMMAND_TYPES_V1,
  LayoutDocumentCodecV1,
  LayoutCommandError,
  applyLayoutCommand,
  applyLayoutCommandBatch,
  createLayoutCommandHistory,
  generateLayoutPresetV1,
  parseEditorCommandV1,
  pushLayoutCommandHistory,
  type EditorCommandV1,
  type LayoutDocumentV1,
} from "./index.js";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/layout/paged-four-panel-rich-text.json",
);

async function document(): Promise<LayoutDocumentV1> {
  return (JSON.parse(await readFile(fixturePath, "utf8")) as { document: LayoutDocumentV1 }).document;
}

function command(type: string, payload: unknown, id = "command_1"): EditorCommandV1 {
  return { schemaVersion: 1, commandId: id, type, label: type, payload } as EditorCommandV1;
}

describe("G5-M2 command reducer", () => {
  it("G5-CMD-001 strictly parses command and payload fields", () => {
    expect(parseEditorCommandV1(command("element.set_hidden", {
      canvasId: "canvas_page_001",
      elementId: "panel_001",
      hidden: true,
    }))).toMatchObject({ type: "element.set_hidden" });
    expect(() => parseEditorCommandV1({
      ...command("element.set_hidden", { canvasId: "c", elementId: "e", hidden: true }),
      timestamp: 1,
    })).toThrow(/unknown field/);
    expect(() => parseEditorCommandV1(command("element.set_hidden", {
      canvasId: "c", elementId: "e", hidden: true, viewport: {},
    }))).toThrow(/unknown field/);
    expect(() => parseEditorCommandV1(command("text.apply_range_style", {
      canvasId: "c",
      elementId: "e",
      start: { paragraphIndex: 0, graphemeOffset: 0 },
      end: { paragraphIndex: 0, graphemeOffset: 1 },
      style: { fontSize: 48, html: "<b>bad</b>" },
    }))).toThrow(/unknown field/);
    for (const type of EDITOR_COMMAND_TYPES_V1) {
      try {
        parseEditorCommandV1(command(type, {}));
        throw new Error(`expected ${type} to require its payload`);
      } catch (error) {
        expect(error, type).toBeInstanceOf(LayoutCommandError);
      }
    }
  });

  it("G5-CMD-002/003 returns inverse and restores the exact digest", async () => {
    const before = await document();
    const result = applyLayoutCommand(before, command("element.set_transform", {
      canvasId: "canvas_page_001",
      elementId: "panel_001",
      transform: { x: 80.0004, y: 90, width: 800, height: 900, rotation: 181, opacity: 0.8 },
    }));
    expect(result.document.canvases[0]!.elements[0]!.transform).toMatchObject({ x: 80, rotation: -179 });
    expect(result.changedElementIds).toEqual(["panel_001"]);
    expect(result.invalidatedPreflightScopes).toContain("geometry");
    const restored = applyLayoutCommand(result.document, result.inverse).document;
    expect(LayoutDocumentCodecV1.encode(restored).digest).toBe(LayoutDocumentCodecV1.encode(before).digest);
  });

  it("G5-CMD-004 applies a batch atomically and leaves input untouched on failure", async () => {
    const before = await document();
    const digest = LayoutDocumentCodecV1.encode(before).digest;
    expect(() => applyLayoutCommandBatch(before, {
      schemaVersion: 1,
      batchId: "batch_1",
      label: "atomic",
      commands: [
        command("element.set_hidden", { canvasId: "canvas_page_001", elementId: "panel_001", hidden: true }, "a"),
        command("element.set_transform", { canvasId: "canvas_page_001", elementId: "missing", transform: { x: 1, y: 1, width: 10, height: 10, rotation: 0, opacity: 1 } }, "b"),
      ],
    })).toThrow(/missing/);
    expect(LayoutDocumentCodecV1.encode(before).digest).toBe(digest);
    expect(before.canvases[0]!.elements[0]!.hidden).toBe(false);
  });

  it("G5-CMD-007 blocks locked mutations except explicit unlock", async () => {
    const before = await document();
    before.canvases[0]!.elements[0]!.locked = true;
    expect(() => applyLayoutCommand(before, command("element.delete", {
      canvasId: "canvas_page_001", elementId: "panel_001",
    }))).toThrow(/locked/);
    const unlocked = applyLayoutCommand(before, command("element.set_locked", {
      canvasId: "canvas_page_001", elementId: "panel_001", locked: false,
    })).document;
    expect(unlocked.canvases[0]!.elements[0]!.locked).toBe(false);
  });

  it("G5-CMD-008 duplicates canvases and nested elements without retaining entity IDs", async () => {
    const before = await document();
    const sourceCanvas = before.canvases[0]!;
    const canvasCopy = structuredClone(sourceCanvas);
    canvasCopy.id = "canvas_page_copy";
    const elementIdMap = new Map<string, string>();
    canvasCopy.elements = canvasCopy.elements.map((element, index) => {
      const next = structuredClone(element);
      next.id = `copy_element_${index}`;
      elementIdMap.set(element.id, next.id);
      if (next.type === "panel_frame" && next.contentImage) next.contentImage.id = `copy_image_${index}`;
      return next;
    });
    canvasCopy.panelReadingOrder = sourceCanvas.panelReadingOrder.map((id) => elementIdMap.get(id)!);
    const duplicatedCanvas = applyLayoutCommand(before, command("canvas.duplicate", {
      sourceCanvasId: sourceCanvas.id,
      canvas: canvasCopy,
      beforeCanvasId: null,
    })).document;
    const sourceIds = new Set([
      sourceCanvas.id,
      ...sourceCanvas.elements.flatMap((element) => [element.id, ...(element.type === "panel_frame" && element.contentImage ? [element.contentImage.id] : [])]),
    ]);
    const copiedIds = [
      canvasCopy.id,
      ...canvasCopy.elements.flatMap((element) => [element.id, ...(element.type === "panel_frame" && element.contentImage ? [element.contentImage.id] : [])]),
    ];
    expect(copiedIds.some((id) => sourceIds.has(id))).toBe(false);
    expect(duplicatedCanvas.canvases[1]!.panelReadingOrder).toEqual(canvasCopy.panelReadingOrder);

    const sourcePanel = sourceCanvas.elements.find((element) => element.type === "panel_frame" && element.contentImage);
    if (sourcePanel?.type !== "panel_frame" || !sourcePanel.contentImage) throw new Error("source panel image missing");
    const panelCopy = structuredClone(sourcePanel);
    panelCopy.id = "copy_panel_standalone";
    if (!panelCopy.contentImage) throw new Error("copied panel image missing");
    panelCopy.contentImage.id = "copy_panel_image_standalone";
    const copiedImageId = panelCopy.contentImage.id;
    const duplicatedElement = applyLayoutCommand(before, command("element.duplicate", {
      canvasId: sourceCanvas.id,
      sourceElementId: sourcePanel.id,
      element: panelCopy,
      beforeElementId: null,
    })).document.canvases[0]!.elements.at(-1);
    expect(duplicatedElement).toMatchObject({ id: panelCopy.id, contentImage: { id: copiedImageId } });
  });

  it("maintains reading order when deleting and restoring a panel", async () => {
    const before = await document();
    const deleted = applyLayoutCommand(before, command("element.delete", {
      canvasId: "canvas_page_001", elementId: "panel_002",
    }));
    expect(deleted.document.canvases[0]!.panelReadingOrder).not.toContain("panel_002");
    const restored = applyLayoutCommand(deleted.document, deleted.inverse).document;
    expect(restored.canvases[0]!.panelReadingOrder).toEqual(before.canvases[0]!.panelReadingOrder);
  });

  it("detaches a panel image as one reversible compound command", async () => {
    const before = await document();
    const sourcePanel = before.canvases[0]!.elements[0];
    if (sourcePanel?.type !== "panel_frame" || !sourcePanel.contentImage) throw new Error("panel image missing");
    const detached = applyLayoutCommand(before, command("panel.detach_image_to_free", {
      canvasId: "canvas_page_001",
      elementId: sourcePanel.id,
      beforeElementId: null,
      freeImage: {
        id: "free_detached_001",
        type: "free_image",
        name: "Detached image",
        transform: sourcePanel.transform,
        locked: false,
        hidden: false,
        source: sourcePanel.contentImage.source,
        display: { mode: "cover", crop: sourcePanel.contentImage.crop },
      },
    }));
    expect((detached.document.canvases[0]!.elements[0] as any).contentImage).toBeNull();
    expect(detached.document.canvases[0]!.elements.at(-1)?.id).toBe("free_detached_001");
    const restored = applyLayoutCommand(detached.document, detached.inverse).document;
    expect(LayoutDocumentCodecV1.encode(restored).digest).toBe(LayoutDocumentCodecV1.encode(before).digest);
  });

  it("applies grapheme text replacement as one reversible command", async () => {
    const before = await document();
    const result = applyLayoutCommand(before, command("text.replace_range", {
      canvasId: "canvas_page_001",
      elementId: "text_title",
      start: { paragraphIndex: 0, graphemeOffset: 0 },
      end: { paragraphIndex: 0, graphemeOffset: 4 },
      text: "雨🌧️",
    }));
    const changed = result.document.canvases[0]!.elements.find((item) => item.id === "text_title");
    expect(changed?.type === "text" && changed.richText.paragraphs[0]!.runs.map((item) => item.text).join(""))
      .toBe("雨🌧️ STATION");
    expect(LayoutDocumentCodecV1.encode(applyLayoutCommand(result.document, result.inverse).document).digest)
      .toBe(LayoutDocumentCodecV1.encode(before).digest);
  });

  it("generates all built-in presets as formal panels without private state", () => {
    const presets = ["single", "two_vertical", "two_horizontal", "three_focus", "four_panel", "dialogue_two", "action_focus"] as const;
    for (const presetId of presets) {
      const count = presetId === "single" ? 1 : presetId.startsWith("two_") || presetId === "dialogue_two" ? 2 : presetId === "four_panel" ? 4 : 3;
      const panels = generateLayoutPresetV1({
        presetId,
        presetVersion: 1,
        width: 1800,
        height: 2400,
        inset: { top: 72, right: 72, bottom: 72, left: 72 },
        gap: 36,
        panelIds: Array.from({ length: count }, (_, index) => `panel_${index + 1}`),
      });
      expect(panels).toHaveLength(count);
      expect(panels.every((panel) => panel.type === "panel_frame" && panel.contentImage === null)).toBe(true);
      expect(JSON.stringify(panels)).not.toMatch(/viewport|konva|dpr|selection/i);
    }
  });

  it("rejects a preset command that would silently drop occupied images", async () => {
    const before = await document();
    const panels = generateLayoutPresetV1({
      presetId: "four_panel",
      presetVersion: 1,
      width: 1800,
      height: 2400,
      inset: { top: 72, right: 72, bottom: 72, left: 72 },
      gap: 36,
      panelIds: ["new_1", "new_2", "new_3", "new_4"],
    });
    expect(() => applyLayoutCommand(before, command("layout.apply_preset", {
      canvasId: "canvas_page_001",
      panels,
      panelReadingOrder: panels.map((item) => item.id),
    }))).toThrow(/preserve every occupied/);
  });

  it("G5-PRESET-005/006 preserves occupied images and every non-panel object", async () => {
    const before = await document();
    const canvas = before.canvases[0]!;
    const sourcePanel = canvas.elements.find((item) => item.type === "panel_frame" && item.contentImage);
    if (sourcePanel?.type !== "panel_frame" || !sourcePanel.contentImage) throw new Error("panel image missing");
    const freeImage = {
      id: "free_preserved",
      type: "free_image" as const,
      name: "Preserved free image",
      transform: { x: 100, y: 100, width: 300, height: 200, rotation: 0, opacity: 1 },
      locked: false,
      hidden: false,
      source: sourcePanel.contentImage.source,
      display: { mode: "contain" as const },
    };
    canvas.elements.push(freeImage);
    const nonPanelsBefore = canvas.elements.filter((item) => item.type !== "panel_frame");
    const panels = generateLayoutPresetV1({
      presetId: "four_panel",
      presetVersion: 1,
      width: canvas.width,
      height: canvas.height,
      inset: { top: 72, right: 72, bottom: 72, left: 72 },
      gap: 36,
      panelIds: ["next_1", "next_2", "next_3", "next_4"],
    }).map((panel, index) => ({
      ...panel,
      contentImage: canvas.elements
        .filter((item) => item.type === "panel_frame")
        .map((item) => item.type === "panel_frame" ? item.contentImage : null)
        .filter((item) => item !== null)[index] ?? null,
    }));
    const result = applyLayoutCommand(before, command("layout.apply_preset", {
      canvasId: canvas.id,
      panels,
      panelReadingOrder: panels.map((panel) => panel.id),
    })).document;
    expect(result.canvases[0]!.elements.filter((item) => item.type !== "panel_frame")).toEqual(nonPanelsBefore);
    expect(result.canvases[0]!.elements.filter((item) => item.type === "panel_frame").flatMap((item) => item.contentImage ? [item.contentImage.id] : []))
      .toEqual(canvas.elements.filter((item) => item.type === "panel_frame").flatMap((item) => item.contentImage ? [item.contentImage.id] : []));
  });

  it("G5-IMG-006 source replacement preserves the panel identity and frame", async () => {
    const before = await document();
    const panel = before.canvases[0]!.elements.find((item) => item.type === "panel_frame" && item.contentImage);
    if (panel?.type !== "panel_frame" || !panel.contentImage) throw new Error("panel image missing");
    const originalFrame = structuredClone(panel.transform);
    const originalShape = structuredClone(panel.shape);
    const originalBorder = structuredClone(panel.border);
    const result = applyLayoutCommand(before, command("image.replace_source", {
      canvasId: before.canvases[0]!.id,
      elementId: panel.id,
      source: { ...panel.contentImage.source, candidateId: "candidate_replacement" },
      crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
    })).document;
    const replaced = result.canvases[0]!.elements.find((item) => item.id === panel.id);
    expect(replaced).toMatchObject({ id: panel.id, transform: originalFrame, shape: originalShape, border: originalBorder });
    expect(replaced?.type === "panel_frame" && replaced.contentImage?.source.candidateId).toBe("candidate_replacement");
  });

  it("G5-CMD-011 evicts history predictably at 200 entries or 50 MiB", async () => {
    const before = await document();
    let history = createLayoutCommandHistory();
    for (let index = 0; index < 201; index += 1) {
      const result = applyLayoutCommand(before, command("element.set_hidden", {
        canvasId: "canvas_page_001", elementId: "panel_001", hidden: index % 2 === 0,
      }, `command_${index}`));
      history = pushLayoutCommandHistory(history, {
        batchId: `batch_${index}`,
        label: "toggle",
        inverse: result.inverse,
        forward: command("element.set_hidden", {
          canvasId: "canvas_page_001", elementId: "panel_001", hidden: index % 2 === 0,
        }, `command_${index}`),
      });
    }
    expect(history.undo).toHaveLength(200);
    expect(history.undo[0]!.batchId).toBe("batch_1");
    expect(history.bytes).toBeLessThanOrEqual(50 * 1024 * 1024);
  });

  it("keeps a 100-command apply/undo sequence digest-exact", async () => {
    const original = await document();
    const expectedDigest = LayoutDocumentCodecV1.encode(original).digest;
    const inverses = [];
    let current = original;
    for (let index = 0; index < 100; index += 1) {
      const next = applyLayoutCommand(current, command("element.set_transform", {
        canvasId: "canvas_page_001",
        elementId: "panel_001",
        transform: {
          ...current.canvases[0]!.elements[0]!.transform,
          x: 72 + index * 0.1234,
          rotation: index * 7.25,
        },
      }, `sequence_${index}`));
      inverses.push(next.inverse);
      current = next.document;
    }
    while (inverses.length > 0) current = applyLayoutCommand(current, inverses.pop()!).document;
    expect(LayoutDocumentCodecV1.encode(current).digest).toBe(expectedDigest);
  });
});
