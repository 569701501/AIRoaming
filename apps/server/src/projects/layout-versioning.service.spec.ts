import { describe, expect, it } from "vitest";

import { assertLayoutRestoreSchemaPolicy } from "./layout-versioning.service.js";

describe("layout revision restore schema policy", () => {
  it("keeps V1 restore requests on V1 working copies and V1 targets", () => {
    expect(() => assertLayoutRestoreSchemaPolicy({
      requestSchemaVersion: 1,
      workingCopySchemaVersion: 1,
      targetRevisionSchemaVersion: 1,
    })).not.toThrow();
    expect(() => assertLayoutRestoreSchemaPolicy({
      requestSchemaVersion: 1,
      workingCopySchemaVersion: 1,
      targetRevisionSchemaVersion: 2,
    })).toThrow("LAYOUT_DOCUMENT_SCHEMA_VERSION_MISMATCH");
    expect(() => assertLayoutRestoreSchemaPolicy({
      requestSchemaVersion: 1,
      workingCopySchemaVersion: 2,
      targetRevisionSchemaVersion: 2,
    })).toThrow("LAYOUT_DOCUMENT_SCHEMA_VERSION_MISMATCH");
  });

  it("allows V2 restore requests to keep V2 or upgrade a V1 target", () => {
    expect(() => assertLayoutRestoreSchemaPolicy({
      requestSchemaVersion: 2,
      workingCopySchemaVersion: 2,
      targetRevisionSchemaVersion: 2,
    })).not.toThrow();
    expect(() => assertLayoutRestoreSchemaPolicy({
      requestSchemaVersion: 2,
      workingCopySchemaVersion: 2,
      targetRevisionSchemaVersion: 1,
    })).not.toThrow();
    expect(() => assertLayoutRestoreSchemaPolicy({
      requestSchemaVersion: 2,
      workingCopySchemaVersion: 1,
      targetRevisionSchemaVersion: 1,
    })).toThrow("LAYOUT_DOCUMENT_SCHEMA_VERSION_MISMATCH");
  });
});
