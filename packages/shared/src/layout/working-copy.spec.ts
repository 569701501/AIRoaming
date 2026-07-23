import { describe, expect, it } from "vitest";

import { LayoutDocumentCodecV1 } from "./codec.js";
import { LayoutDocumentCodecV2, upgradeLayoutWorkingCopyV1ToV2 } from "./automation.js";
import type { LayoutDocumentV1 } from "./document.js";
import {
  encodeLayoutWorkingCopyRecoveryV1,
  parseInitializeLayoutWorkingCopyRequestV1,
  parseSaveLayoutWorkingCopyRequestV1,
} from "./working-copy.js";

const document: LayoutDocumentV1 = {
  schemaVersion: 1,
  kind: "layout_document_v1",
  projectId: "project_a",
  chapterId: "chapter_a",
  comicFormat: "paged_comic",
  profile: {
    kind: "paged",
    presetId: "portrait_3_4",
    width: 1800,
    height: 2400,
    safeArea: { top: 80, right: 80, bottom: 80, left: 80 },
    panelReadingDirection: "ltr_ttb",
  },
  fontPolicy: { defaultFontAssetId: "font_a", fallbackFontAssetIds: [] },
  canvases: [{
    id: "page_1",
    kind: "page",
    name: "第 1 页",
    width: 1800,
    height: 2400,
    backgroundColor: "#FFFFFFFF",
    panelReadingOrder: [],
    elements: [],
  }],
};

describe("Layout Working Copy V1 contract", () => {
  it("strictly parses initialization without accepting client font or source truth", () => {
    expect(parseInitializeLayoutWorkingCopyRequestV1({
      schemaVersion: 1,
      profile: document.profile,
      initializationMode: "blank",
      expectedCurrentLayoutRevisionId: null,
    })).toEqual({
      schemaVersion: 1,
      profile: document.profile,
      initializationMode: "blank",
      expectedCurrentLayoutRevisionId: null,
    });
    expect(() => parseInitializeLayoutWorkingCopyRequestV1({
      schemaVersion: 1,
      profile: document.profile,
      initializationMode: "blank",
      expectedCurrentLayoutRevisionId: null,
      fontAssetId: "client_claim",
    })).toThrow(/unknown field/);
  });

  it("requires a canonical full document and matching document digest on save", () => {
    const encoded = LayoutDocumentCodecV1.encode(document);
    expect(parseSaveLayoutWorkingCopyRequestV1({
      schemaVersion: 1,
      expectedRowVersion: 3,
      baseDocumentDigest: encoded.digest,
      documentDigest: encoded.digest,
      document,
    })).toMatchObject({ expectedRowVersion: 3, documentDigest: encoded.digest, document: encoded.value });
    expect(() => parseSaveLayoutWorkingCopyRequestV1({
      schemaVersion: 1,
      expectedRowVersion: 3,
      baseDocumentDigest: encoded.digest,
      documentDigest: `sha256:${"0".repeat(64)}`,
      document,
    })).toThrow(/digest/i);
  });

  it("creates deterministic recovery JSON without viewport, selection or local database state", () => {
    const encoded = LayoutDocumentCodecV1.encode(document);
    const first = encodeLayoutWorkingCopyRecoveryV1({
      schemaVersion: 1,
      kind: "layout_working_copy_recovery_v1",
      projectId: document.projectId,
      chapterId: document.chapterId,
      workingCopyId: "wc_a",
      serverRowVersion: 4,
      serverDocumentDigest: encoded.digest,
      localDocumentDigest: encoded.digest,
      document,
    });
    const second = encodeLayoutWorkingCopyRecoveryV1(JSON.parse(first.canonical));
    expect(second.digest).toBe(first.digest);
    expect(second.canonical).not.toMatch(/viewport|selection|localStorage|indexedDB/i);
  });

  it("preserves V2 automation metadata in a deterministic recovery copy", () => {
    const v2 = upgradeLayoutWorkingCopyV1ToV2(document);
    const encoded = LayoutDocumentCodecV2.encode(v2);
    const recovery = encodeLayoutWorkingCopyRecoveryV1({
      schemaVersion: 1,
      kind: "layout_working_copy_recovery_v1",
      projectId: document.projectId,
      chapterId: document.chapterId,
      workingCopyId: "wc_v2",
      serverRowVersion: 2,
      serverDocumentDigest: encoded.digest,
      localDocumentDigest: encoded.digest,
      document: encoded.value,
    });

    expect(recovery.value.document.schemaVersion).toBe(2);
    expect(recovery.canonical).toContain("\"automation\"");
    expect(encodeLayoutWorkingCopyRecoveryV1(JSON.parse(recovery.canonical)).digest)
      .toBe(recovery.digest);
  });
});
