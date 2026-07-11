import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseE2EServiceIdentity } from "./start-e2e-server.mjs";

describe("G0 E2E service wrapper identity", () => {
  test("accepts only a supported role bound to the inherited run id", () => {
    assert.equal(
      parseE2EServiceIdentity(["server", "--run-id", "g0-owned"], "g0-owned"),
      "server",
    );
    assert.equal(
      parseE2EServiceIdentity(["web", "--run-id", "g0-owned"], "g0-owned"),
      "web",
    );

    assert.throws(
      () => parseE2EServiceIdentity(["server", "--run-id", "g0-other"], "g0-owned"),
      /E2E_SERVICE_CLI_IDENTITY_MISMATCH/,
    );
    assert.throws(
      () => parseE2EServiceIdentity(["provider", "--run-id", "g0-owned"], "g0-owned"),
      /E2E_SERVICE_CLI_IDENTITY_MISMATCH/,
    );
    assert.throws(
      () => parseE2EServiceIdentity(["server"], "g0-owned"),
      /E2E_SERVICE_CLI_IDENTITY_MISMATCH/,
    );
  });
});
