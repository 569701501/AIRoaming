import { describe, expect, it } from "vitest";
import { LegacyCharacterReferenceError, resolveLegacyCharacterTokens } from "./legacy-character-reference.js";

const candidates = [
  { sourceId: "char_001", exactName: "主角", targetId: "character_target_001" },
  { sourceId: "char_002", exactName: "反派", targetId: "character_target_002" },
] as const;

describe("legacy character reference resolver", () => {
  it("R0B-REF-01 prefers an exact source id", () => {
    expect(resolveLegacyCharacterTokens([" char_001 "], candidates)).toEqual([{ token: "char_001", targetId: "character_target_001", matchedBy: "id" }]);
  });

  it("R0B-REF-02 resolves a unique exact name", () => {
    expect(resolveLegacyCharacterTokens(["主角"], candidates)).toEqual([{ token: "主角", targetId: "character_target_001", matchedBy: "exact_name" }]);
  });

  it("R0B-REF-03 fails closed for an unknown token", () => {
    expect(() => resolveLegacyCharacterTokens(["陌生人"], candidates)).toThrowError(new LegacyCharacterReferenceError("unresolved", "陌生人"));
  });

  it("R0B-REF-04 fails closed for an ambiguous exact name", () => {
    expect(() => resolveLegacyCharacterTokens(["主角"], [
      ...candidates,
      { sourceId: "char_003", exactName: "主角", targetId: "character_target_003" },
    ])).toThrowError(new LegacyCharacterReferenceError("ambiguous", "主角"));
  });

  it("R0B-REF-05 keeps order and duplicate references", () => {
    expect(resolveLegacyCharacterTokens(["反派", "主角", "反派"], candidates).map((item) => item.targetId)).toEqual([
      "character_target_002",
      "character_target_001",
      "character_target_002",
    ]);
  });
});
