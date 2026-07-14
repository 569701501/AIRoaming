import { describe, expect, it } from "vitest";

import { resolveLayoutWorkingCopySave } from "./layout-working-copy-policy.js";

const a = `sha256:${"a".repeat(64)}`;
const b = `sha256:${"b".repeat(64)}`;

describe("Layout Working Copy save policy", () => {
  it("does not update rowVersion or updatedAt for the same digest", () => {
    expect(resolveLayoutWorkingCopySave({
      currentRowVersion: 7,
      currentDocumentDigest: a,
      expectedRowVersion: 7,
      baseDocumentDigest: a,
      nextDocumentDigest: a,
    })).toEqual({ result: "no_op" });
  });

  it("recognizes only the exact response-loss replay", () => {
    expect(resolveLayoutWorkingCopySave({
      currentRowVersion: 8,
      currentDocumentDigest: b,
      expectedRowVersion: 7,
      baseDocumentDigest: a,
      nextDocumentDigest: b,
    })).toEqual({ result: "replayed" });
    expect(() => resolveLayoutWorkingCopySave({
      currentRowVersion: 8,
      currentDocumentDigest: a,
      expectedRowVersion: 7,
      baseDocumentDigest: a,
      nextDocumentDigest: b,
    })).toThrowError(expect.objectContaining({ code: "LAYOUT_WORKING_COPY_CONFLICT" }));
  });

  it("permits one CAS update and rejects stale base digests", () => {
    expect(resolveLayoutWorkingCopySave({
      currentRowVersion: 7,
      currentDocumentDigest: a,
      expectedRowVersion: 7,
      baseDocumentDigest: a,
      nextDocumentDigest: b,
    })).toEqual({ result: "update" });
    expect(() => resolveLayoutWorkingCopySave({
      currentRowVersion: 7,
      currentDocumentDigest: b,
      expectedRowVersion: 7,
      baseDocumentDigest: a,
      nextDocumentDigest: b,
    })).toThrowError(expect.objectContaining({ code: "LAYOUT_WORKING_COPY_CONFLICT" }));
  });
});
