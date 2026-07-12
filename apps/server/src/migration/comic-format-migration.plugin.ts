import type { ComicFormat } from "@airoaming/shared";

export const ALLOWED_COMIC_FORMATS = ["vertical_scroll", "paged_comic"] as const satisfies readonly ComicFormat[];
export type AllowedComicFormat = (typeof ALLOWED_COMIC_FORMATS)[number];
export type ComicFormatMappingKind = "canonical" | "auto_mapped" | "decision_required";
export type ComicFormatIssueCode =
  | "COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER"
  | "COMIC_FORMAT_MISSING"
  | "COMIC_FORMAT_INVALID_LEGACY_VALUE";

export type LegacyValueKind = "string" | "missing" | "number" | "boolean" | "array" | "object";

export interface ComicFormatMapping {
  mappingKind: ComicFormatMappingKind;
  targetComicFormat: AllowedComicFormat | null;
  issueCode: ComicFormatIssueCode | null;
  layoutPresetIntent: "four_panel" | null;
  originalValueKind: LegacyValueKind;
  originalValuePreview: string;
}

function valueKind(value: unknown): LegacyValueKind {
  if (value === undefined || value === null) return "missing";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    default: return "object";
  }
}

function safePreview(value: unknown, kind: LegacyValueKind): string {
  if (kind === "missing") return "missing";
  if (typeof value !== "string") return kind;
  if (value === "") return "<empty>";
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "�");
  if (/(?:bearer\s+|sk-|token|secret|password|api[-_]?key)/i.test(normalized)) return `<string:${value.length}>`;
  return normalized.length > 64 ? `${normalized.slice(0, 64)}…` : normalized;
}

export function mapLegacyComicFormat(value: unknown): ComicFormatMapping {
  const kind = valueKind(value);
  const preview = safePreview(value, kind);
  if (value === "vertical_scroll" || value === "paged_comic") {
    return { mappingKind: "canonical", targetComicFormat: value, issueCode: null, layoutPresetIntent: null, originalValueKind: kind, originalValuePreview: preview };
  }
  if (value === "page_horizontal") {
    return { mappingKind: "auto_mapped", targetComicFormat: "paged_comic", issueCode: null, layoutPresetIntent: null, originalValueKind: kind, originalValuePreview: preview };
  }
  if (value === "four_panel") {
    return { mappingKind: "decision_required", targetComicFormat: null, issueCode: "COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER", layoutPresetIntent: "four_panel", originalValueKind: kind, originalValuePreview: preview };
  }
  if (value === undefined || value === null || value === "") {
    return { mappingKind: "decision_required", targetComicFormat: null, issueCode: "COMIC_FORMAT_MISSING", layoutPresetIntent: null, originalValueKind: kind, originalValuePreview: preview };
  }
  return { mappingKind: "decision_required", targetComicFormat: null, issueCode: "COMIC_FORMAT_INVALID_LEGACY_VALUE", layoutPresetIntent: null, originalValueKind: kind, originalValuePreview: preview };
}

