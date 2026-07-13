import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { BUSINESS_WRITE_OWNERS, BUSINESS_WRITE_SYSTEM_ALLOWLIST } from "./business-write-boundary.registry.js";

const sourceRoot = path.resolve(import.meta.dirname, "..");

describe("M6-A1 business write boundary", () => {
  it("registers every production business write owner with evidence", () => {
    expect(BUSINESS_WRITE_OWNERS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BUSINESS_WRITE_OWNERS.map((item) => item.source)).size).toBe(BUSINESS_WRITE_OWNERS.length);
    for (const item of BUSINESS_WRITE_OWNERS) {
      expect(item.boundary).toBe("runBusinessTransaction");
      expect(item.evidence.length).toBeGreaterThan(0);
    }
    expect(BUSINESS_WRITE_SYSTEM_ALLOWLIST).toEqual(["migration", "backup", "activate", "test-bootstrap"]);
  });

  it("has no direct transaction bypass in registered business owners", async () => {
    for (const item of BUSINESS_WRITE_OWNERS) {
      const source = await readFile(path.join(sourceRoot, item.source), "utf8");
      expect(source, item.source).not.toMatch(/\$transaction/);
      expect(source, item.source).toMatch(/runBusinessTransaction|transactionRunner\.run/);
      expect(source, item.source).not.toMatch(/(?:database|db|prismaService)\(\)\.[A-Za-z]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    }
  });

  it("M6A1-RB-06 has no automatic down-migration surface in production scripts", async () => {
    const packageJson = await readFile(path.resolve(sourceRoot, "../package.json"), "utf8");
    const production = await Promise.all(BUSINESS_WRITE_OWNERS.map(async (owner) => readFile(path.join(sourceRoot, owner.source), "utf8")));
    const text = [packageJson, ...production].join("\n");
    expect(text).not.toMatch(/migrate\s+(?:reset|down)|migration\s+down/i);
  });
});
