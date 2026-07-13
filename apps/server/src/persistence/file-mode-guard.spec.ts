import { describe, expect, it } from "vitest";
import { assertFileModeBridgeAllowed } from "./file-mode-guard.js";

describe("file mode bridge guard", () => {
  it("rejects non-file bridge URLs before opening a client", async () => {
    await expect(assertFileModeBridgeAllowed("postgres://invalid")).rejects.toThrow("FILE_MODE_DATABASE_URL_INVALID");
  });
});

