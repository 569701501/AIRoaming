import { describe, expect, it } from "vitest";

import { mapG3ProjectDatabaseError } from "./g3-project-error.mapper.js";

describe("G3 project database error mapper", () => {
  it("maps the immutable trigger to the stable conflict code", () => {
    expect(
      mapG3ProjectDatabaseError(
        new Error("SQLite error: AIR_G3:COMIC_FORMAT_IMMUTABLE"),
      ),
    ).toMatchObject({
      status: 409,
      code: "COMIC_FORMAT_IMMUTABLE",
    });
  });

  it("fails closed for unknown G3 contract errors", () => {
    expect(mapG3ProjectDatabaseError(new Error("AIR_G3:UNKNOWN"))).toMatchObject({
      status: 500,
      code: "G3_DATABASE_CONTRACT_VIOLATION",
    });
  });

  it("does not masquerade unrelated database errors", () => {
    expect(mapG3ProjectDatabaseError(new Error("P2025"))).toBeNull();
  });
});
