import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  LayoutDocumentCodecV1,
  buildPendingEditorCommandSetV1,
  pendingEditorSourceProjectionUnchangedV1,
  parseCreatePendingEditorCommandSetRequestV1,
  type LayoutDocumentV1,
} from "./index.js";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/layout/paged-four-panel-rich-text.json",
);

async function document(): Promise<LayoutDocumentV1> {
  return (JSON.parse(await readFile(fixturePath, "utf8")) as { document: LayoutDocumentV1 }).document;
}

describe("G5-M8 PendingEditorCommandSet", () => {
  it("strictly accepts only a formal command batch", async () => {
    const before = await document();
    const digest = LayoutDocumentCodecV1.encode(before).digest;
    const request = {
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: 7,
      expectedDocumentDigest: digest,
      selectionElementIds: ["panel_001"],
      summary: "隐藏第一个画格",
      warnings: [],
      commandBatch: {
        schemaVersion: 1,
        batchId: "ai_batch_1",
        label: "AI 建议：隐藏第一个画格",
        commands: [{
          schemaVersion: 1,
          commandId: "ai_command_1",
          type: "element.set_hidden",
          label: "隐藏第一个画格",
          payload: { canvasId: "canvas_page_001", elementId: "panel_001", hidden: true },
        }],
      },
    } as const;

    expect(parseCreatePendingEditorCommandSetRequestV1(request)).toMatchObject({
      summary: request.summary,
      commandBatch: { batchId: "ai_batch_1" },
    });
    expect(() => parseCreatePendingEditorCommandSetRequestV1({
      ...request,
      jsonPatch: [{ op: "replace", path: "/canvases", value: [] }],
    })).toThrow(/unknown field/);
    expect(() => parseCreatePendingEditorCommandSetRequestV1({
      ...request,
      commandBatch: { ...request.commandBatch, script: "globalThis.fetch('https://bad')" },
    })).toThrow(/unknown field/);
  });

  it("previews before/after with a stable result digest and changed IDs", async () => {
    const before = await document();
    const encoded = LayoutDocumentCodecV1.encode(before);
    const pending = buildPendingEditorCommandSetV1({
      workingCopyId: "wc_1",
      expectedRowVersion: 7,
      baseDocumentDigest: encoded.digest,
      sourceLockSetDigest: `sha256:${"a".repeat(64)}`,
      selectionElementIds: ["panel_001"],
      summary: "隐藏第一个画格",
      warnings: [],
      commandBatch: {
        schemaVersion: 1,
        batchId: "ai_batch_1",
        label: "AI 建议：隐藏第一个画格",
        commands: [{
          schemaVersion: 1,
          commandId: "ai_command_1",
          type: "element.set_hidden",
          label: "隐藏第一个画格",
          payload: { canvasId: "canvas_page_001", elementId: "panel_001", hidden: true },
        }],
      },
      document: before,
    });

    expect(pending.changedElementIds).toEqual(["panel_001"]);
    expect(pending.resultDocumentDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(pending.resultDocumentDigest).not.toBe(encoded.digest);
    expect(pending.resultDocument.canvases[0]!.elements[0]!.hidden).toBe(true);
    expect(before.canvases[0]!.elements[0]!.hidden).toBe(false);
  });

  it("detects source injection hidden inside an otherwise valid element command", async () => {
    const before = await document();
    const encoded = LayoutDocumentCodecV1.encode(before);
    const panel = before.canvases[0]!.elements[0]!;
    if (panel.type !== "panel_frame" || !panel.contentImage) throw new Error("PENDING_TEST_SOURCE_MISSING");
    const pending = buildPendingEditorCommandSetV1({
      workingCopyId: "wc_1",
      expectedRowVersion: 7,
      baseDocumentDigest: encoded.digest,
      sourceLockSetDigest: `sha256:${"a".repeat(64)}`,
      selectionElementIds: [panel.id],
      summary: "新增对象中的来源注入",
      warnings: [],
      commandBatch: {
        schemaVersion: 1,
        batchId: "ai_batch_element_source",
        label: "新增对象中的来源注入",
        commands: [{
          schemaVersion: 1,
          commandId: "ai_element_source",
          type: "element.add",
          label: "新增自由图片",
          payload: {
            canvasId: before.canvases[0]!.id,
            beforeElementId: null,
            element: {
              id: "free_forbidden",
              type: "free_image",
              name: "未授权来源",
              transform: panel.transform,
              locked: false,
              hidden: false,
              source: {
                ...panel.contentImage.source,
                candidateId: "candidate_forbidden",
                sourceDigest: `sha256:${"b".repeat(64)}`,
              },
              display: { mode: "cover", crop: panel.contentImage.crop },
            },
          },
        }],
      },
      document: before,
    });

    expect(pendingEditorSourceProjectionUnchangedV1(before, pending.resultDocument)).toBe(false);
  });
});
