import { describe, expect, it } from "vitest";
import { canonicalizeJson, digestCanonicalJson, parseStrictJson, sha256Text } from "./canonical-json.js";

describe("canonical JSON / digest", () => {
  it("sorts object keys but preserves array order", () => {
    expect(canonicalizeJson({ z: 1, a: ["二", "一"], nested: { b: true, a: null } })).toBe('{"a":["二","一"],"nested":{"a":null,"b":true},"z":1}');
    expect(canonicalizeJson({ a: [1, 2] })).not.toBe(canonicalizeJson({ a: [2, 1] }));
  });

  it("uses JSON number rules and rejects non-finite values", () => {
    expect(canonicalizeJson({ minusZero: -0, exponent: 1e-7, integer: 10 })).toBe('{"exponent":1e-7,"integer":10,"minusZero":0}');
    expect(() => canonicalizeJson({ value: Number.NaN })).toThrow(/NaN/);
    expect(() => canonicalizeJson({ value: Number.POSITIVE_INFINITY })).toThrow(/Infinity/);
  });

  it("matches the SHA-256 known vector", () => {
    expect(sha256Text("abc")).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(digestCanonicalJson({ b: 2, a: 1 })).toBe(digestCanonicalJson({ a: 1, b: 2 }));
  });

  it("rejects duplicate keys before codec validation", () => {
    expect(() => parseStrictJson('{"a":1,"a":2}')).toThrow(/duplicate/);
    expect(parseStrictJson('{"text":"\\u4e2d","items":[true,null]}')).toEqual({ text: "中", items: [true, null] });
    const proto = parseStrictJson('{"__proto__":{"safe":true}}') as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(proto, "__proto__")).toBe(true);
  });

  it("rejects undefined, class instances and trailing JSON", () => {
    expect(() => canonicalizeJson({ value: undefined })).toThrow(/undefined/);
    expect(() => canonicalizeJson(new Date())).toThrow(/plain JSON/);
    expect(() => parseStrictJson("{} {}" )).toThrow(/trailing/);
  });
});
