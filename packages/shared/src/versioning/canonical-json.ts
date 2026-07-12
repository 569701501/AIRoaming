/**
 * Platform-independent canonical JSON, strict JSON parsing, and SHA-256.
 *
 * This module intentionally has no Node.js imports: the same implementation
 * is used by the browser and the server when calculating version digests.
 */

export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function fail(message: string): never {
  throw new TypeError(`Invalid JSON value: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareUtf16Keys(a: string, b: string): number {
  // RFC 8785 sorts object property names by their UTF-16 code units. JS's
  // relational comparison has exactly that ordering (and is stable for ties).
  return a < b ? -1 : a > b ? 1 : 0;
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    case "string": return JSON.stringify(value);
    case "number": {
      if (!Number.isFinite(value)) fail("NaN and Infinity are not permitted");
      return JSON.stringify(value);
    }
    case "undefined": fail("undefined is not permitted");
    case "bigint": fail("bigint is not permitted");
    case "function": fail("function is not permitted");
    case "symbol": fail("symbol is not permitted");
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => serialize(item)).join(",")}]`;
      }
      if (!isPlainObject(value)) fail("only plain JSON objects are permitted");
      const keys = Object.keys(value).sort(compareUtf16Keys);
      return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`).join(",")}}`;
    }
  }
  return fail("unsupported value");
}

export function canonicalizeJson(value: unknown): string {
  return serialize(value);
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeJson(value));
}

function rightRotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Bytes(input: Uint8Array): `sha256:${string}` {
  const bitLength = input.length * 8;
  const paddedLength = ((input.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const lengthOffset = padded.length - 8;
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  padded[lengthOffset] = (high >>> 24) & 0xff;
  padded[lengthOffset + 1] = (high >>> 16) & 0xff;
  padded[lengthOffset + 2] = (high >>> 8) & 0xff;
  padded[lengthOffset + 3] = high & 0xff;
  padded[lengthOffset + 4] = (low >>> 24) & 0xff;
  padded[lengthOffset + 5] = (low >>> 16) & 0xff;
  padded[lengthOffset + 6] = (low >>> 8) & 0xff;
  padded[lengthOffset + 7] = low & 0xff;

  const hash = new Uint32Array(SHA256_INITIAL);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const index = offset + i * 4;
      words[i] = ((padded[index] << 24) | (padded[index + 1] << 16) | (padded[index + 2] << 8) | padded[index + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(words[i - 15], 7) ^ rightRotate(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rightRotate(words[i - 2], 17) ^ rightRotate(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_K[i] + words[i]) >>> 0;
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  let hex = "";
  for (const word of hash) hex += word.toString(16).padStart(8, "0");
  return `sha256:${hex}`;
}

export function sha256Text(value: string): `sha256:${string}` {
  return sha256Bytes(new TextEncoder().encode(value));
}

export function digestCanonicalJson(value: unknown): `sha256:${string}` {
  return sha256Bytes(canonicalJsonBytes(value));
}

class StrictJsonParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace();
    const value = this.readValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) this.error("trailing characters");
    return value;
  }

  private readValue(): unknown {
    const char = this.source[this.index];
    if (char === "{") return this.readObject();
    if (char === "[") return this.readArray();
    if (char === '"') return this.readString();
    if (char === "t" && this.take("true")) return true;
    if (char === "f" && this.take("false")) return false;
    if (char === "n" && this.take("null")) return null;
    if (char === "-" || (char >= "0" && char <= "9")) return this.readNumber();
    this.error("expected a JSON value");
  }

  private readObject(): Record<string, unknown> {
    this.index++;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.index] === "}") { this.index++; return result; }
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') this.error("object key must be a string");
      const key = this.readString();
      if (keys.has(key)) this.error(`duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index++] !== ":") this.error("expected ':' after object key");
      this.skipWhitespace();
      result[key] = this.readValue();
      this.skipWhitespace();
      const separator = this.source[this.index++];
      if (separator === "}") return result;
      if (separator !== ",") this.error("expected ',' or '}' in object");
    }
  }

  private readArray(): unknown[] {
    this.index++;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.index] === "]") { this.index++; return result; }
    while (true) {
      this.skipWhitespace();
      result.push(this.readValue());
      this.skipWhitespace();
      const separator = this.source[this.index++];
      if (separator === "]") return result;
      if (separator !== ",") this.error("expected ',' or ']' in array");
    }
  }

  private readString(): string {
    const start = this.index;
    this.index++;
    let escaped = false;
    for (; this.index < this.source.length; this.index++) {
      const charCode = this.source.charCodeAt(this.index);
      if (charCode < 0x20 && !escaped) this.error("control character in string");
      if (escaped) { escaped = false; continue; }
      if (charCode === 0x5c) { escaped = true; continue; }
      if (charCode === 0x22) {
        const raw = this.source.slice(start, this.index + 1);
        this.index++;
        try { return JSON.parse(raw) as string; } catch { this.error("invalid string escape"); }
      }
    }
    this.error("unterminated string");
  }

  private readNumber(): number {
    const match = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.error("invalid number");
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.error("number is not finite");
    return value;
  }

  private take(token: string): boolean {
    if (this.source.slice(this.index, this.index + token.length) !== token) return false;
    this.index += token.length;
    return true;
  }

  private skipWhitespace(): void {
    while (/[ \t\n\r]/.test(this.source[this.index] ?? "")) this.index++;
  }

  private error(message: string): never {
    throw new SyntaxError(`Invalid JSON at offset ${this.index}: ${message}`);
  }
}

export function parseStrictJson(value: string): unknown {
  if (typeof value !== "string") throw new TypeError("Strict JSON input must be a string");
  return new StrictJsonParser(value).parse();
}
