import { describe, expect, it } from "vitest";

import {
  readLegacyProjectComicFormatV1,
} from "./legacy-project-comic-format.js";

describe("legacy project comic format reader", () => {
  it("keeps canonical values unchanged", () => {
    expect(readLegacyProjectComicFormatV1("vertical_scroll")).toMatchObject({
      status: "canonical",
      runtimeValue: "vertical_scroll",
      persistedValue: "vertical_scroll",
    });
  });

  it("maps only page_horizontal as a read-only alias", () => {
    expect(readLegacyProjectComicFormatV1("page_horizontal")).toMatchObject({
      status: "auto_mapped_read_only",
      runtimeValue: "paged_comic",
      persistedValue: "page_horizontal",
      mappedFrom: "page_horizontal",
    });
  });

  it("fails closed for four_panel, missing and invalid values", () => {
    expect(readLegacyProjectComicFormatV1("four_panel")).toMatchObject({
      status: "decision_required",
      reason: "FOUR_PANEL",
    });
    expect(readLegacyProjectComicFormatV1(undefined)).toMatchObject({
      status: "decision_required",
      reason: "MISSING",
    });
    expect(readLegacyProjectComicFormatV1({})).toMatchObject({
      status: "decision_required",
      reason: "INVALID",
      safeValueKind: "object",
    });
  });
});
