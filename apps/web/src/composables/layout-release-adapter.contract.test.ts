import assert from "node:assert/strict";
import test from "node:test";

import type {
  LayoutDocumentV1,
  LayoutDocumentV2,
} from "@airoaming/shared";

import { restoreRequestSchemaForWorkingCopyV1 } from "./layout-release-adapter";

test("V2 current Working Copy uses V2 restore even when the immutable target is V1", () => {
  const current = { schemaVersion: 2 } as LayoutDocumentV2;
  const target = { schemaVersion: 1 } as LayoutDocumentV1;

  assert.equal(target.schemaVersion, 1);
  assert.equal(restoreRequestSchemaForWorkingCopyV1(current), 2);
});

test("V1 current Working Copy uses V1 restore; the target cannot silently choose a V2 request", () => {
  const current = { schemaVersion: 1 } as LayoutDocumentV1;
  const target = { schemaVersion: 2 } as LayoutDocumentV2;

  assert.equal(target.schemaVersion, 2);
  assert.equal(restoreRequestSchemaForWorkingCopyV1(current), 1);
});
