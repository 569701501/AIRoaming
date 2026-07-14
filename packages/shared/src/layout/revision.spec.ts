import { describe, expect, it } from "vitest";

import {
  parseCreateLayoutRevisionRequestV1,
  parseRestoreLayoutRevisionRequestV1,
  parseRunLayoutPreflightRequestV1,
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
});
