import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseCreateLayoutRevisionRequestV1OrV2,
  parseCreateLayoutRevisionRequestV2,
  parseCreateLayoutRevisionRequestV1,
  parseRestoreLayoutRevisionRequestV2,
  parseRestoreLayoutRevisionRequestV1,
  parseRunLayoutPreflightRequestV2,
  parseRunLayoutPreflightRequestV1,
  type LayoutRevisionDetailV1,
  type LayoutRevisionDetailV1OrV2,
  type LayoutRevisionDetailV2,
} from "./revision.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("G5-M6 revision request contracts", () => {
  it("accepts explicit checkpoint and restore concurrency identities", () => {
    expect(parseCreateLayoutRevisionRequestV1({
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: 2,
      expectedDocumentDigest: digest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: [],
    })).toMatchObject({ expectedWorkingCopyRowVersion: 2, saveReason: "user_checkpoint" });
    expect(parseRestoreLayoutRevisionRequestV1({
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: 3,
      expectedWorkingCopyDigest: digest,
    })).toMatchObject({ expectedWorkingCopyRowVersion: 3 });
  });

  it("strictly rejects unknown fields and parses revision/export preflight separately", () => {
    expect(() => parseCreateLayoutRevisionRequestV1({
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: 2,
      expectedDocumentDigest: digest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: [],
      force: true,
    })).toThrow(/unknown field/i);
    expect(parseRunLayoutPreflightRequestV1({
      schemaVersion: 1,
      target: { kind: "working_copy", expectedRowVersion: 2, expectedDocumentDigest: digest },
      profile: null,
    })).toMatchObject({ target: { kind: "working_copy" }, profile: null });
    expect(parseRunLayoutPreflightRequestV1({
      schemaVersion: 1,
      target: { kind: "layout_revision", layoutRevisionId: "revision_1" },
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 },
    })).toMatchObject({ target: { kind: "layout_revision" }, profile: { kind: "paged_publication" } });
  });

  it("rejects duplicate warning acknowledgements before they reach the revision transaction", () => {
    expect(() => parseCreateLayoutRevisionRequestV1({
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: 2,
      expectedDocumentDigest: digest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: ["warning_1", "warning_1"],
    })).toThrow(/duplicate issue key/i);
  });

  it("binds V2 revision, restore and preflight requests to full and visible digests", () => {
    const visibleDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const create = parseCreateLayoutRevisionRequestV2({
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: 8,
      expectedRevisionDocumentDigest: digest,
      expectedVisibleDocumentDigest: visibleDigest,
      expectedCurrentRevisionId: "revision_7",
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: ["issue_1"],
    });
    expect(create).toMatchObject({
      schemaVersion: 2,
      expectedRevisionDocumentDigest: digest,
      expectedVisibleDocumentDigest: visibleDigest,
    });
    expect(parseCreateLayoutRevisionRequestV1OrV2(create)).toEqual(create);

    expect(parseRestoreLayoutRevisionRequestV2({
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: 9,
      expectedWorkingCopyRevisionDocumentDigest: digest,
      expectedWorkingCopyVisibleDocumentDigest: visibleDigest,
    })).toMatchObject({
      expectedWorkingCopyRevisionDocumentDigest: digest,
      expectedWorkingCopyVisibleDocumentDigest: visibleDigest,
    });

    expect(parseRunLayoutPreflightRequestV2({
      schemaVersion: 2,
      target: {
        kind: "working_copy",
        expectedRowVersion: 9,
        expectedRevisionDocumentDigest: digest,
        expectedVisibleDocumentDigest: visibleDigest,
      },
      profile: null,
    })).toMatchObject({
      target: {
        kind: "working_copy",
        expectedRevisionDocumentDigest: digest,
        expectedVisibleDocumentDigest: visibleDigest,
      },
    });
  });

  it("rejects V2 revision requests missing either digest or carrying V1 digest aliases", () => {
    const visibleDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(() => parseCreateLayoutRevisionRequestV2({
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: 8,
      expectedRevisionDocumentDigest: digest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: [],
    })).toThrow(/expectedVisibleDocumentDigest/i);
    expect(() => parseCreateLayoutRevisionRequestV2({
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: 8,
      expectedDocumentDigest: digest,
      expectedRevisionDocumentDigest: digest,
      expectedVisibleDocumentDigest: visibleDigest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: [],
    })).toThrow(/expectedDocumentDigest.*unknown field/i);
  });

  it("keeps the legacy V1 revision-detail wire shape in the V1/V2 union", () => {
    expectTypeOf<LayoutRevisionDetailV1OrV2>().toEqualTypeOf<
      LayoutRevisionDetailV1 | LayoutRevisionDetailV2
    >();
  });
});
