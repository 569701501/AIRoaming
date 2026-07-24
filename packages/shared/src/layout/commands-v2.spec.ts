import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  LayoutDocumentCodecV2,
  addLayoutProtectionScopesV1,
  applyLayoutCommandBatchV2,
  applyLayoutCommandV2,
  digestLayoutDialogueTextV1,
  parseEditorCommandV2,
  richTextPlainTextV1,
  upgradeLayoutWorkingCopyV1ToV2,
  type BalloonElementV1,
  type EditorCommandTypeV2,
  type EditorCommandV2,
  type LayoutDocumentV1,
  type LayoutDocumentV2,
  type RichTextDocumentV1,
} from "./index.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/layout",
);

async function v1(name: string): Promise<LayoutDocumentV1> {
  return (JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8")) as { document: LayoutDocumentV1 }).document;
}

async function freshV2(name = "balloons-all-kinds"): Promise<LayoutDocumentV2> {
  const document = await v1(name);
  return LayoutDocumentCodecV2.parseAndNormalize({
    ...document,
    schemaVersion: 2,
    kind: "layout_document_v2",
    automation: {
      policyVersion: "layout_automation_v1",
      composition: null,
      dialogueBindings: [],
      protections: [],
    },
  });
}

function command<TType extends EditorCommandTypeV2>(
  type: TType,
  payload: EditorCommandV2<TType>["payload"],
  actor: EditorCommandV2<TType>["actor"] = "user",
  commandId = `command_${type}`,
): EditorCommandV2<TType> {
  return { schemaVersion: 2, commandId, type, label: type, actor, payload } as EditorCommandV2<TType>;
}

function balloon(document: LayoutDocumentV2, elementId = "balloon_speech"): BalloonElementV1 {
  const element = document.canvases.flatMap((canvas) => canvas.elements).find((item) => item.id === elementId);
  if (!element || element.type !== "balloon") throw new Error(`balloon ${elementId} missing`);
  return element;
}

function textWith(source: RichTextDocumentV1, text: string): RichTextDocumentV1 {
  const next = structuredClone(source);
  next.paragraphs = [{ ...next.paragraphs[0]!, runs: [{ ...next.paragraphs[0]!.runs[0]!, text }] }];
  return next;
}

function bind(document: LayoutDocumentV2, elementId = "balloon_speech"): LayoutDocumentV2 {
  const target = balloon(document, elementId);
  const initialTextDigest = digestLayoutDialogueTextV1(richTextPlainTextV1(target.richText));
  return LayoutDocumentCodecV2.parseAndNormalize({
    ...document,
    automation: {
      ...document.automation,
      dialogueBindings: [{
        dialogueItemId: `dialogue_${elementId}`,
        sourceShotId: target.sourceShotId,
        sourceTextDigest: initialTextDigest,
        initialTextDigest,
        elementId,
        disposition: "placed",
      }],
    },
  });
}

function digest(document: LayoutDocumentV2): string {
  return LayoutDocumentCodecV2.encode(document).digest;
}

describe("Smart layout M1 V2 command actor and protection contract", () => {
  it("strictly parses actor and semantic command fields", () => {
    expect(parseEditorCommandV2(command("protection.clear", {
      targetKind: "element",
      targetId: "element_1",
      scopes: ["geometry"],
    }))).toMatchObject({ actor: "user", type: "protection.clear" });
    expect(() => parseEditorCommandV2({
      ...command("protection.clear", { targetKind: "element", targetId: "element_1", scopes: ["geometry"] }),
      actor: "model",
    })).toThrow(/actor/);
    expect(() => parseEditorCommandV2({
      ...command("protection.clear", { targetKind: "element", targetId: "element_1", scopes: ["geometry"] }),
      createdAt: "now",
    })).toThrow(/unknown field/);
  });

  it("SML-DLG-007 protects user-edited bound rich text and style while leaving geometry smart-adjustable", async () => {
    const before = bind(await freshV2());
    const changedText = textWith(balloon(before).richText, "这是人工修改后的对白");
    const edited = applyLayoutCommandV2(before, command("balloon.replace_text_document", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      richText: changedText,
    })).document;
    expect(edited.automation.dialogueBindings[0]).toMatchObject({
      elementId: "balloon_speech",
      disposition: "placed",
    });
    expect(edited.automation.protections).toContainEqual({
      targetKind: "element",
      targetId: "balloon_speech",
      scopes: ["text", "style"],
      reason: "user_edit",
    });
    expect(() => applyLayoutCommandV2(edited, command("balloon.replace_text_document", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      richText: balloon(before).richText,
    }, "smart"))).toThrow(/protected text/);

    const moved = applyLayoutCommandV2(edited, command("element.set_transform", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      transform: { ...balloon(edited).transform, x: balloon(edited).transform.x + 20 },
    }, "smart")).document;
    expect(balloon(moved).transform.x).toBe(balloon(edited).transform.x + 20);
    expect(richTextPlainTextV1(balloon(moved).richText)).toBe("这是人工修改后的对白");
  });

  it("SML-PRO-001/003/004/005 maps crop, geometry, style and tail edits to independent scopes", async () => {
    const cropDocument = await freshV2("crop-rotate-flip");
    const cropped = applyLayoutCommandV2(cropDocument, command("image.set_crop", {
      canvasId: "canvas_crop",
      elementId: "panel_crop",
      crop: { zoom: 1.5, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
    })).document;
    expect(cropped.automation.protections).toContainEqual({
      targetKind: "panel_image",
      targetId: "panel_crop_image",
      scopes: ["crop"],
      reason: "user_edit",
    });
    expect(() => applyLayoutCommandV2(cropped, command("image.set_crop", {
      canvasId: "canvas_crop",
      elementId: "panel_crop",
      crop: { zoom: 1.6, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
    }, "smart"))).toThrow(/protected crop/);
    const croppedPanel = cropped.canvases[0]!.elements[0]!;
    if (croppedPanel.type !== "panel_frame" || !croppedPanel.contentImage) throw new Error("cropped panel image missing");
    const cropBeforeGeometry = croppedPanel.contentImage.crop;
    const panelTransform = cropped.canvases[0]!.elements[0]!.transform;
    const reframed = applyLayoutCommandV2(cropped, command("element.set_transform", {
      canvasId: "canvas_crop",
      elementId: "panel_crop",
      transform: { ...panelTransform, x: panelTransform.x + 10 },
    }, "smart")).document;
    const reframedPanel = reframed.canvases[0]!.elements[0]!;
    if (reframedPanel.type !== "panel_frame" || !reframedPanel.contentImage) throw new Error("reframed panel image missing");
    expect(reframedPanel.contentImage.crop).toEqual(cropBeforeGeometry);

    let balloons = await freshV2();
    balloons = applyLayoutCommandV2(balloons, command("element.set_transform", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      transform: { ...balloon(balloons).transform, x: 200 },
    })).document;
    const geometryProtected = balloons;
    balloons = applyLayoutCommandV2(balloons, command("balloon.set_visual_style", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      fillColor: "#FEF3C7FF",
      strokeColor: "#111827FF",
      strokeWidth: 7,
      padding: balloon(balloons).padding,
      verticalAlign: "center",
    }, "smart")).document;
    expect(balloon(balloons).transform).toEqual(balloon(geometryProtected).transform);
    balloons = applyLayoutCommandV2(balloons, command("balloon.set_visual_style", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      fillColor: "#FFF7EDFF",
      strokeColor: "#111827FF",
      strokeWidth: 8,
      padding: balloon(balloons).padding,
      verticalAlign: "center",
    })).document;
    balloons = applyLayoutCommandV2(balloons, command("balloon.set_tail", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      tail: { ...balloon(balloons).tail, targetX: balloon(balloons).tail.targetX + 10 },
    })).document;
    expect(balloons.automation.protections.find((item) => item.targetId === "balloon_speech")?.scopes)
      .toEqual(["geometry", "style", "tail"]);
    for (const [type, payload, scope] of [
      ["element.set_transform", { canvasId: "canvas_balloons", elementId: "balloon_speech", transform: balloon(balloons).transform }, "geometry"],
      ["balloon.set_kind", { canvasId: "canvas_balloons", elementId: "balloon_speech", balloonKind: "thought" }, "style"],
      ["balloon.set_tail", { canvasId: "canvas_balloons", elementId: "balloon_speech", tail: balloon(balloons).tail }, "tail"],
    ] as const) {
      expect(() => applyLayoutCommandV2(balloons, command(type, payload as never, "smart"))).toThrow(new RegExp(`protected ${scope}`));
    }
  });

  it("maps source replacement and layer order to source/reading_order without broad locking", async () => {
    const cropDocument = await freshV2("crop-rotate-flip");
    const panel = cropDocument.canvases[0]!.elements[0]!;
    if (panel.type !== "panel_frame" || !panel.contentImage) throw new Error("panel image missing");
    const replaced = applyLayoutCommandV2(cropDocument, command("image.replace_source", {
      canvasId: "canvas_crop",
      elementId: "panel_crop",
      source: panel.contentImage.source,
      crop: panel.contentImage.crop,
    })).document;
    expect(replaced.automation.protections.find((item) => item.targetId === "panel_crop_image")?.scopes)
      .toEqual(["crop", "source"]);

    const balloons = await freshV2();
    const reordered = applyLayoutCommandV2(balloons, command("element.reorder", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      beforeElementId: "panel_balloons",
    })).document;
    expect(reordered.automation.protections).toEqual(expect.arrayContaining([
      { targetKind: "canvas", targetId: "canvas_balloons", scopes: ["reading_order"], reason: "user_edit" },
      { targetKind: "element", targetId: "balloon_speech", scopes: ["reading_order"], reason: "user_edit" },
    ]));
    expect(() => applyLayoutCommandV2(reordered, command("element.reorder", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      beforeElementId: null,
    }, "smart"))).toThrow(/protected reading_order/);
  });

  it("SML-PRO-006/007/009 blocks smart edits behind explicit preservation or locks until the user clears a scope", async () => {
    const upgraded = upgradeLayoutWorkingCopyV1ToV2(await v1("crop-rotate-flip"));
    const cropCommand = command("image.set_crop", {
      canvasId: "canvas_crop",
      elementId: "panel_crop",
      crop: { zoom: 1.7, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
    }, "smart");
    expect(() => applyLayoutCommandV2(upgraded, cropCommand)).toThrow(/protected crop/);
    const released = applyLayoutCommandV2(upgraded, command("protection.clear", {
      targetKind: "panel_image",
      targetId: "panel_crop_image",
      scopes: ["crop"],
    })).document;
    expect(applyLayoutCommandV2(released, cropCommand).document.canvases[0]!.elements[0])
      .toMatchObject({ contentImage: { crop: { zoom: 1.7 } } });
    expect(() => applyLayoutCommandV2(upgraded, command("protection.clear", {
      targetKind: "panel_image",
      targetId: "panel_crop_image",
      scopes: ["crop"],
    }, "smart"))).toThrow(/only user/);

    const unlocked = await freshV2();
    balloon(unlocked).locked = true;
    const locked = LayoutDocumentCodecV2.parseAndNormalize(unlocked);
    const lockedDigest = digest(locked);
    expect(() => applyLayoutCommandV2(locked, command("balloon.set_kind", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      balloonKind: "thought",
    }, "smart"))).toThrow(/locked/);
    expect(digest(locked)).toBe(lockedDigest);
  });

  it("SML-PRO-010 rejects generic bound delete/hide and atomically suppresses or restores a hidden balloon", async () => {
    const before = bind(await freshV2());
    expect(() => applyLayoutCommandV2(before, command("element.delete", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
    }))).toThrow(/suppress_bound/);
    expect(() => applyLayoutCommandV2(before, command("element.set_hidden", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      hidden: true,
    }))).toThrow(/suppress_bound/);

    const suppressed = applyLayoutCommandV2(before, command("balloon.suppress_bound", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      mode: "hide",
    }));
    expect(balloon(suppressed.document).hidden).toBe(true);
    expect(suppressed.document.automation.dialogueBindings[0]).toMatchObject({
      elementId: "balloon_speech",
      disposition: "user_suppressed",
    });
    expect(suppressed.document.automation.protections.find((item) => item.targetId === "balloon_speech")?.scopes)
      .toEqual(["existence"]);
    expect(digest(applyLayoutCommandV2(suppressed.document, suppressed.inverse).document)).toBe(digest(before));

    const restored = applyLayoutCommandV2(suppressed.document, command("balloon.restore_bound", {
      dialogueItemId: "dialogue_balloon_speech",
      canvasId: "canvas_balloons",
      richText: balloon(before).richText,
      create: null,
      clearProtectionScopes: ["existence", "text"],
    }));
    expect(balloon(restored.document).hidden).toBe(false);
    expect(restored.document.automation.dialogueBindings[0]?.disposition).toBe("placed");
    expect(restored.document.automation.protections.some((item) => item.targetId === "balloon_speech")).toBe(false);
    expect(digest(applyLayoutCommandV2(restored.document, restored.inverse).document)).toBe(digest(suppressed.document));
  });

  it("SML-DLG-008 restores a deleted binding tombstone with a new visible balloon and full inverse", async () => {
    const before = bind(await freshV2());
    const original = structuredClone(balloon(before));
    const suppressed = applyLayoutCommandV2(before, command("balloon.suppress_bound", {
      canvasId: "canvas_balloons",
      elementId: original.id,
      mode: "delete",
    }));
    expect(suppressed.document.automation.dialogueBindings[0]).toMatchObject({
      elementId: null,
      disposition: "user_suppressed",
    });
    expect(() => balloon(suppressed.document)).toThrow(/missing/);
    expect(digest(applyLayoutCommandV2(suppressed.document, suppressed.inverse).document)).toBe(digest(before));

    const recreated = { ...original, id: "balloon_speech_restored", name: "Restored speech balloon" };
    const restored = applyLayoutCommandV2(suppressed.document, command("balloon.restore_bound", {
      dialogueItemId: "dialogue_balloon_speech",
      canvasId: "canvas_balloons",
      richText: original.richText,
      create: { element: recreated, beforeElementId: null },
      clearProtectionScopes: ["existence", "text"],
    }));
    expect(balloon(restored.document, recreated.id).hidden).toBe(false);
    expect(restored.document.automation.dialogueBindings[0]).toMatchObject({
      elementId: recreated.id,
      disposition: "placed",
    });
    expect(digest(applyLayoutCommandV2(restored.document, restored.inverse).document)).toBe(digest(suppressed.document));
  });

  it("SML-DLG-009 keeps a copied bound balloon unbound and protects the user-created copy", async () => {
    const before = bind(await freshV2());
    const copy = { ...structuredClone(balloon(before)), id: "balloon_speech_copy", name: "Manual copy" };
    const after = applyLayoutCommandV2(before, command("element.duplicate", {
      canvasId: "canvas_balloons",
      sourceElementId: "balloon_speech",
      element: copy,
      beforeElementId: null,
    })).document;
    expect(after.automation.dialogueBindings).toHaveLength(1);
    expect(after.automation.dialogueBindings[0]?.elementId).toBe("balloon_speech");
    expect(after.automation.protections.find((item) => item.targetId === copy.id)?.scopes)
      .toEqual(["existence", "geometry", "text", "style", "tail", "source", "reading_order"]);
  });

  it("lets a user delete an unbound preserved object without leaving dangling protection metadata", async () => {
    const before = upgradeLayoutWorkingCopyV1ToV2(await v1("paged-four-panel-rich-text"));
    expect(before.automation.protections.some((item) => item.targetId === "text_title")).toBe(true);
    const deleted = applyLayoutCommandV2(before, command("element.delete", {
      canvasId: "canvas_page_001",
      elementId: "text_title",
    })).document;
    expect(deleted.canvases[0]!.elements.some((item) => item.id === "text_title")).toBe(false);
    expect(deleted.automation.protections.some((item) => item.targetId === "text_title")).toBe(false);
  });

  it("SML-PRO-008 applies a smart batch atomically and restores the exact V2 digest with one inverse", async () => {
    const before = await freshV2();
    const initial = balloon(before).transform;
    const commands = Array.from({ length: 50 }, (_, index) => command("element.set_transform", {
      canvasId: "canvas_balloons",
      elementId: "balloon_speech",
      transform: { ...initial, x: initial.x + index + 1 },
    }, "smart", `smart_move_${index}`));
    const applied = applyLayoutCommandBatchV2(before, {
      schemaVersion: 2,
      batchId: "smart_batch_50",
      label: "Smart arrange",
      commands,
    });
    expect(balloon(applied.document).transform.x).toBe(initial.x + 50);
    expect(applied.document.automation.protections).toEqual([]);
    expect(digest(applyLayoutCommandV2(applied.document, applied.inverse).document)).toBe(digest(before));

    const protectedInput = structuredClone(before);
    protectedInput.automation = addLayoutProtectionScopesV1(
      protectedInput.automation,
      "element",
      "balloon_speech",
      ["text"],
    );
    const protectedBeforeDigest = digest(protectedInput);
    expect(() => applyLayoutCommandBatchV2(protectedInput, {
      schemaVersion: 2,
      batchId: "atomic_failure",
      label: "Atomic failure",
      commands: [
        commands[0]!,
        command("balloon.replace_text_document", {
          canvasId: "canvas_balloons",
          elementId: "balloon_speech",
          richText: textWith(balloon(before).richText, "不应应用"),
        }, "smart"),
      ],
    })).toThrow(/protected text/);
    expect(digest(protectedInput)).toBe(protectedBeforeDigest);
  });
});
