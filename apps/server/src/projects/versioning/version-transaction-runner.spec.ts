import { describe, expect, it, vi } from "vitest";

import {
  G2_TRANSACTION_RETRY_DELAYS_MS,
  isRetryableVersionTransactionError,
  VersionTransactionRunner,
} from "./version-transaction-runner.service.js";

describe("VersionTransactionRunner", () => {
  it("recognises only busy/locked/unique transaction failures as retryable", () => {
    expect(isRetryableVersionTransactionError(new Error("SQLITE_BUSY: database is locked"))).toBe(true);
    expect(isRetryableVersionTransactionError(new Error("UNIQUE constraint failed: story_versions.chapter_id"))).toBe(true);
    expect(isRetryableVersionTransactionError(new Error("validation failed"))).toBe(false);
  });

  it("retries the whole transaction at the fixed bounded delays", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(new Error("SQLITE_BUSY"))
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValue("done");
    const service = { runBusinessTransaction: transaction } as never;
    const runner = new VersionTransactionRunner(service);
    await expect(runner.run(async () => "ignored")).resolves.toBe("done");
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(G2_TRANSACTION_RETRY_DELAYS_MS).toEqual([10, 30, 90]);
  });
});
