import { describe, expect, it } from "vitest";
import { readJsonFormat } from "./cli-format.js";

describe("CLI format contract", () => {
  const invalid = () => new Error("FORMAT_INVALID");

  it("accepts an omitted format or exactly --format json", () => {
    expect(readJsonFormat(["node", "cli"], invalid)).toBeUndefined();
    expect(readJsonFormat(["node", "cli", "--format", "json"], invalid)).toBe("json");
  });

  it.each([
    ["missing value", ["node", "cli", "--format"]],
    ["text format", ["node", "cli", "--format", "text"]],
    ["flag value", ["node", "cli", "--format", "--snapshot", "/tmp/snapshot"]],
    ["duplicate flags", ["node", "cli", "--format", "json", "--format", "json"]],
  ])("rejects %s", (_label, args) => {
    expect(() => readJsonFormat(args, invalid)).toThrow("FORMAT_INVALID");
  });
});
