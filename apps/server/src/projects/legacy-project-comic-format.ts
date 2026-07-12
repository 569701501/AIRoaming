import type { ComicFormat } from "@airoaming/shared";

export const G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION =
  "g3-file-comic-format-read-v1" as const;

export type LegacyComicFormatSafeValueKind =
  | "string"
  | "missing"
  | "number"
  | "boolean"
  | "array"
  | "object";

export type LegacyProjectComicFormatReadResult =
  | {
      status: "canonical";
      runtimeValue: ComicFormat;
      persistedValue: ComicFormat;
      policyVersion: typeof G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION;
    }
  | {
      status: "auto_mapped_read_only";
      runtimeValue: "paged_comic";
      persistedValue: "page_horizontal";
      mappedFrom: "page_horizontal";
      policyVersion: typeof G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION;
    }
  | {
      status: "decision_required";
      reason: "FOUR_PANEL" | "MISSING" | "INVALID";
      safeValueKind: LegacyComicFormatSafeValueKind;
      policyVersion: typeof G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION;
    };

function safeValueKind(value: unknown): LegacyComicFormatSafeValueKind {
  if (value === undefined || value === null) return "missing";
  if (Array.isArray(value)) return "array";
 switch (typeof value) {
   case "string":
      return "string";
   case "number":
      return "number";
   case "boolean":
      return "boolean";
   default:
     return "object";
 }
}

export function readLegacyProjectComicFormatV1(
  value: unknown,
): LegacyProjectComicFormatReadResult {
  if (value === "vertical_scroll" || value === "paged_comic") {
    return {
      status: "canonical",
      runtimeValue: value,
      persistedValue: value,
      policyVersion: G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION,
    };
  }
  if (value === "page_horizontal") {
    return {
      status: "auto_mapped_read_only",
      runtimeValue: "paged_comic",
      persistedValue: "page_horizontal",
      mappedFrom: "page_horizontal",
      policyVersion: G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION,
    };
  }
  return {
    status: "decision_required",
    reason: value === "four_panel" ? "FOUR_PANEL" : value === undefined || value === null || value === "" || (typeof value === "string" && value.trim() === "") ? "MISSING" : "INVALID",
    safeValueKind: safeValueKind(value),
    policyVersion: G3_FILE_COMIC_FORMAT_READ_POLICY_VERSION,
  };
}

export interface LegacyComicFormatIssue {
  readonly projectId: string;
  readonly reason: "FOUR_PANEL" | "MISSING" | "INVALID";
  readonly safeValueKind: LegacyComicFormatSafeValueKind;
}

export class LegacyComicFormatDecisionRequiredError extends Error {
  readonly code = "LEGACY_COMIC_FORMAT_DECISION_REQUIRED" as const;
  constructor(readonly issue: LegacyComicFormatIssue) {
    super("LEGACY_COMIC_FORMAT_DECISION_REQUIRED");
    this.name = "LegacyComicFormatDecisionRequiredError";
  }
}

export class LegacyComicFormatDecisionRequiredAggregateError extends Error {
  readonly code = "LEGACY_COMIC_FORMAT_DECISION_REQUIRED" as const;
  constructor(readonly issues: readonly LegacyComicFormatIssue[]) {
    super("LEGACY_COMIC_FORMAT_DECISION_REQUIRED");
    this.name = "LegacyComicFormatDecisionRequiredAggregateError";
  }
}
