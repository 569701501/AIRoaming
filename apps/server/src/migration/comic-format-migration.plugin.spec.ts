import { describe, expect, it } from "vitest";
import { mapLegacyComicFormat } from "./comic-format-migration.plugin.js";
import { buildComicFormatIssue, resolveComicFormatIssue, type ComicFormatResolution } from "./migration-issue.js";

const SOURCE_DIGEST = "sha256:0000000000000000000000000000000000000000000000000000000000000000" as const;

describe("comic-format migration mapper", () => {
  it("MAP-01 keeps both canonical values canonical", () => {
    expect(mapLegacyComicFormat("vertical_scroll")).toMatchObject({ mappingKind: "canonical", targetComicFormat: "vertical_scroll", issueCode: null });
    expect(mapLegacyComicFormat("paged_comic")).toMatchObject({ mappingKind: "canonical", targetComicFormat: "paged_comic", issueCode: null });
  });

  it("MAP-02 maps page_horizontal without creating a decision", () => {
    expect(mapLegacyComicFormat("page_horizontal")).toMatchObject({ mappingKind: "auto_mapped", targetComicFormat: "paged_comic", issueCode: null });
  });

  it("MAP-03 makes four_panel an explicit container decision", () => {
    expect(mapLegacyComicFormat("four_panel")).toMatchObject({ mappingKind: "decision_required", issueCode: "COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER", layoutPresetIntent: "four_panel" });
  });

  it("MAP-04 distinguishes missing from invalid", () => {
    expect(mapLegacyComicFormat(undefined)).toMatchObject({ issueCode: "COMIC_FORMAT_MISSING", originalValueKind: "missing" });
    expect(mapLegacyComicFormat(null)).toMatchObject({ issueCode: "COMIC_FORMAT_MISSING", originalValueKind: "missing" });
    expect(mapLegacyComicFormat("")).toMatchObject({ issueCode: "COMIC_FORMAT_MISSING", originalValuePreview: "<empty>" });
  });

  it("MAP-05 rejects every non-string/non-canonical value without fallback", () => {
    for (const value of [" ", "PAGED_COMIC", 1, false, [], {}]) {
      expect(mapLegacyComicFormat(value)).toMatchObject({ mappingKind: "decision_required", issueCode: "COMIC_FORMAT_INVALID_LEGACY_VALUE", targetComicFormat: null });
    }
  });

  it("MAP-06 uses a safe preview for secret-looking legacy strings", () => {
    const mapped = mapLegacyComicFormat("sk-test-secret-value");
    expect(mapped.originalValueKind).toBe("string");
    expect(mapped.originalValuePreview).toBe("<string:20>");
  });

  it("MAP-07 does not mutate or trim the input", () => {
    const value = " page_horizontal ";
    expect(mapLegacyComicFormat(value).issueCode).toBe("COMIC_FORMAT_INVALID_LEGACY_VALUE");
    expect(value).toBe(" page_horizontal ");
  });

  it("MAP-08 emits a stable issue detail only for decision-required values", () => {
    const issue = buildComicFormatIssue({ runId: "run-1", projectId: "p1", sourceStorageKey: "projects/p1/project.json", sourceDigest: SOURCE_DIGEST, mapping: mapLegacyComicFormat("four_panel"), createdAt: "2026-07-12T00:00:00.000Z" });
    expect(issue).toMatchObject({ issueKey: "project:p1:comic-format", code: "COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER", resolutionStatus: "open", detailSchemaVersion: 1 });
    expect(issue?.detailJson).not.toContain("sk-");
    expect(buildComicFormatIssue({ runId: "run-1", projectId: "p1", sourceStorageKey: "projects/p1/project.json", sourceDigest: SOURCE_DIGEST, mapping: mapLegacyComicFormat("paged_comic"), createdAt: "2026-07-12T00:00:00.000Z" })).toBeNull();
  });
});

describe("comic-format issue resolution", () => {
  it("resolves four_panel with either canonical container format", () => {
    const issue = buildComicFormatIssue({ runId: "run-1", projectId: "p1", sourceStorageKey: "projects/p1/project.json", sourceDigest: SOURCE_DIGEST, mapping: mapLegacyComicFormat("four_panel"), createdAt: "2026-07-12T00:00:00.000Z" })!;
    for (const chosenComicFormat of ["vertical_scroll", "paged_comic"] as const) {
      const resolution: ComicFormatResolution = { decisionSchemaVersion: 1, action: "set_comic_format", chosenComicFormat, layoutPresetIntent: "four_panel" };
      expect(resolveComicFormatIssue(issue, resolution, "2026-07-12T00:01:00.000Z")).toMatchObject({ resolutionStatus: "resolved", resolvedAt: "2026-07-12T00:01:00.000Z" });
    }
  });
});

