import {
  canonicalJsonBytes,
  canonicalizeJson,
  parseStrictJson,
  sha256Bytes,
} from "../versioning/canonical-json.js";
import type {
  EncodedLayoutValue,
  LayoutPublicationProfileV1,
} from "./document.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label}: expected object`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const row = record(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(`${label}.${key}: unknown field`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) throw new Error(`${label}.${key}: missing required field`);
  return row;
}

function encode(value: LayoutPublicationProfileV1): EncodedLayoutValue<LayoutPublicationProfileV1> {
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 1, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export function parseLayoutPublicationProfileV1(input: unknown): LayoutPublicationProfileV1 {
  const value = typeof input === "string" ? parseStrictJson(input) : input;
  const base = record(value, "profile");
  if (base.kind === "paged_publication") {
    const row = exact(base, ["schemaVersion", "kind", "outputScale", "includePdf", "pdfPixelDpi"], "profile");
    if (row.schemaVersion !== 1 || (row.outputScale !== 1 && row.outputScale !== 2) || typeof row.includePdf !== "boolean" || row.pdfPixelDpi !== 96) {
      throw new Error("profile: invalid paged publication profile");
    }
    return { schemaVersion: 1, kind: "paged_publication", outputScale: row.outputScale, includePdf: row.includePdf, pdfPixelDpi: 96 };
  }
  if (base.kind === "vertical_publication") {
    const row = exact(base, ["schemaVersion", "kind", "outputScale", "maxSliceHeightPx", "cutPolicy", "includeLongPng"], "profile");
    if (row.schemaVersion !== 1 || (row.outputScale !== 1 && row.outputScale !== 2)
      || typeof row.maxSliceHeightPx !== "number" || !Number.isInteger(row.maxSliceHeightPx)
      || row.maxSliceHeightPx < 2048 || row.maxSliceHeightPx > 8192
      || row.cutPolicy !== "prefer_section_boundary_then_exact" || typeof row.includeLongPng !== "boolean") {
      throw new Error("profile: invalid vertical publication profile");
    }
    return {
      schemaVersion: 1,
      kind: "vertical_publication",
      outputScale: row.outputScale,
      maxSliceHeightPx: row.maxSliceHeightPx,
      cutPolicy: "prefer_section_boundary_then_exact",
      includeLongPng: row.includeLongPng,
    };
  }
  throw new Error("profile.kind: invalid publication kind");
}

export const LayoutPublicationProfileCodecV1 = {
  schemaVersion: 1 as const,
  parse: parseLayoutPublicationProfileV1,
  encode(input: unknown): EncodedLayoutValue<LayoutPublicationProfileV1> {
    return encode(parseLayoutPublicationProfileV1(input));
  },
};
