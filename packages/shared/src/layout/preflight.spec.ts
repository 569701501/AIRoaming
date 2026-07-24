import { describe, expect, it } from "vitest";

import type { LayoutDigest, LayoutDocumentV1 } from "./document.js";
import {
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  upgradeLayoutWorkingCopyV1ToV2,
  digestLayoutDialogueTextV1,
  type LayoutDocumentV2,
} from "./automation.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  digestCandidateImageSourceV1,
  digestLayoutSourceLockSet,
} from "./digest.js";
import {
  digestLayoutDialogueSourceTextV1,
  type LayoutDialogueLedgerV1,
} from "./dialogue.js";
import type { LayoutFontCatalogItemV1 } from "./font.js";
import { runLayoutPreflightV1, runLayoutPreflightV2 } from "./preflight.js";
import { digestCanonicalJson } from "../versioning/canonical-json.js";

const imageSha = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as LayoutDigest;
const fontSha = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as LayoutDigest;
const cmapDigest = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as LayoutDigest;

const unsignedSource = {
  shotId: "shot_1",
  candidateId: "candidate_1",
  candidateLockRevisionId: "lock_1",
  assetId: "asset_1",
};
const currentSource = { ...unsignedSource, sourceDigest: digestCandidateImageSourceV1(unsignedSource, imageSha) };
const font: LayoutFontCatalogItemV1 = {
  assetId: "font_400",
  sha256: fontSha,
  bytes: 100,
  mimeType: "font/woff2",
  metadata: {
    schemaVersion: 1,
    kind: "layout_font_asset_v1",
    packageId: "font@1",
    familyName: "Test",
    displayName: "Test",
    face: { weight: 400, style: "normal" },
    format: "woff2",
    license: { spdx: "OFL-1.1", sourceUrl: "https://example.com/font", embeddingAllowed: true },
    cmap: { digest: cmapDigest, codePointCount: 95, ranges: [[0x20, 0x7e]] },
  },
};

function document(text = "OK"): LayoutDocumentV1 {
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: "project_1",
    chapterId: "chapter_1",
    comicFormat: "paged_comic",
    profile: {
      kind: "paged",
      presetId: "custom",
      width: 1000,
      height: 1000,
      safeArea: { top: 40, right: 40, bottom: 40, left: 40 },
      panelReadingDirection: "ltr_ttb",
    },
    fontPolicy: { defaultFontAssetId: font.assetId, fallbackFontAssetIds: [] },
    canvases: [{
      id: "page_1",
      kind: "page",
      name: "第 1 页",
      width: 1000,
      height: 1000,
      backgroundColor: "#FFFFFFFF",
      panelReadingOrder: ["panel_1"],
      elements: [
        {
          id: "panel_1",
          type: "panel_frame",
          name: "画格",
          transform: { x: 100, y: 100, width: 800, height: 800, rotation: 0, opacity: 1 },
          locked: false,
          hidden: false,
          shape: { kind: "rect", cornerRadius: 0 },
          border: { visible: true, color: "#000000FF", width: 4 },
          contentImage: {
            id: "image_1",
            type: "image",
            placement: "panel_content",
            name: "图片",
            locked: false,
            hidden: false,
            source: currentSource,
            crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false },
          },
        },
        {
          id: "text_1",
          type: "text",
          name: "文字",
          semantic: "caption",
          transform: { x: 120, y: 120, width: 400, height: 100, rotation: 0, opacity: 1 },
          locked: false,
          hidden: false,
          verticalAlign: "start",
          richText: {
            schemaVersion: 1,
            writingMode: "horizontal-tb",
            textOrientation: "mixed",
            paragraphs: [{
              align: "start",
              lineHeight: 1.2,
              runs: [{
                text,
                fontAssetId: font.assetId,
                fontSize: 32,
                fontWeight: 400,
                fontStyle: "normal",
                color: "#111111FF",
                letterSpacing: 0,
                stroke: null,
              }],
            }],
          },
        },
      ],
    }],
  };
}

function run(value: LayoutDocumentV1, source = currentSource) {
  return runLayoutPreflightV1({
    document: value,
    target: {
      kind: "working_copy",
      id: "wc_1",
      documentDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      rowVersion: 3,
    },
    currentSources: [{ order: 1, source, width: 1200, height: 1200 }],
    imageAssets: { asset_1: { assetId: "asset_1", sha256: imageSha, width: 1200, height: 1200, ready: true } },
    fontCatalog: [font],
    profile: null,
  });
}

function runExport(value: LayoutDocumentV1) {
  return runLayoutPreflightV1({
    document: value,
    target: {
      kind: "layout_revision",
      id: "revision_1",
      documentDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      rowVersion: null,
    },
    currentSources: [{ order: 1, source: currentSource, width: 1200, height: 1200 }],
    imageAssets: { asset_1: { assetId: "asset_1", sha256: imageSha, width: 1200, height: 1200, ready: true } },
    fontCatalog: [font],
    profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 },
  });
}

function v2Fixture(): {
  document: LayoutDocumentV2;
  ledger: LayoutDialogueLedgerV1;
  currentComposition: {
    compositionDigest: LayoutDigest;
    storyboardVersionId: string;
    storyboardDigest: LayoutDigest;
    visualAnalysisSetDigest: LayoutDigest | null;
    compositionSourceLocks: Array<{ shotId: string; candidateLockRevisionId: string }>;
  };
} {
  const visible = document();
  visible.canvases[0]!.elements.push({
    id: "balloon_1",
    type: "balloon",
    name: "对白",
    transform: { x: 300, y: 300, width: 240, height: 120, rotation: 0, opacity: 1 },
    locked: false,
    hidden: false,
    balloonKind: "speech",
    sourceShotId: "shot_1",
    speakerCharacterId: "character_1",
    fillColor: "#FFFFFFFF",
    strokeColor: "#000000FF",
    strokeWidth: 3,
    padding: { top: 12, right: 12, bottom: 12, left: 12 },
    verticalAlign: "center",
    tail: { enabled: true, rootRatio: 0.6, targetX: 200, targetY: 500, baseWidth: 24 },
    richText: {
      schemaVersion: 1,
      writingMode: "horizontal-tb",
      textOrientation: "mixed",
      paragraphs: [{
        align: "center",
        lineHeight: 1.2,
        runs: [{
          text: "OK",
          fontAssetId: font.assetId,
          fontSize: 32,
          fontWeight: 400,
          fontStyle: "normal",
          color: "#111111FF",
          letterSpacing: 0,
          stroke: null,
        }],
      }],
    },
  });
  const sourceTextDigest = digestLayoutDialogueSourceTextV1("OK");
  const textDigest = digestLayoutDialogueTextV1("OK");
  const ledgerBase = {
    schemaVersion: 1 as const,
    policyVersion: "layout_dialogue_v1" as const,
    items: [{
      id: "dialogue_1",
      shotId: "shot_1",
      shotOrder: 1,
      lineOrder: 1,
      source: "voice_line" as const,
      sourceIndex: 0,
      speakerCharacterId: "character_1",
      speakerName: "A",
      kind: "speech" as const,
      sourceText: "OK",
      sourceTextDigest,
      text: "OK",
      textDigest,
      normalization: "identity" as const,
      confidence: "exact" as const,
    }],
    issues: [],
  };
  const ledger: LayoutDialogueLedgerV1 = {
    ...ledgerBase,
    ledgerDigest: digestCanonicalJson(ledgerBase),
  };
  const sourceLockSetDigest = digestLayoutSourceLockSet(visible, ["shot_1"])!;
  const currentComposition = {
    compositionDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as LayoutDigest,
    storyboardVersionId: "storyboard_revision_1",
    storyboardDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as LayoutDigest,
    visualAnalysisSetDigest: null,
    compositionSourceLocks: [{
      shotId: "shot_1",
      candidateLockRevisionId: "lock_1",
    }],
  };
  const value = upgradeLayoutWorkingCopyV1ToV2(visible);
  value.automation.composition = {
    compositionDigest: currentComposition.compositionDigest,
    compositionPolicyVersion: "layout_composition_v1",
    storyboardVersionId: currentComposition.storyboardVersionId,
    storyboardDigest: currentComposition.storyboardDigest,
    sourceLockSetDigest,
    visualAnalysisSetDigest: null,
    mode: "rule_fallback",
  };
  value.automation.dialogueBindings = [{
    dialogueItemId: "dialogue_1",
    sourceShotId: "shot_1",
    sourceTextDigest,
    initialTextDigest: textDigest,
    elementId: "balloon_1",
    disposition: "placed",
  }];
  return {
    document: LayoutDocumentCodecV2.parseAndNormalize(value),
    ledger,
    currentComposition,
  };
}

function runV2(
  fixture = v2Fixture(),
  overrides: {
    revisionDocumentDigest?: LayoutDigest;
    visibleDocumentDigest?: LayoutDigest;
    currentComposition?: {
      compositionDigest: LayoutDigest;
      storyboardVersionId: string;
      storyboardDigest: LayoutDigest;
      visualAnalysisSetDigest: LayoutDigest | null;
      compositionSourceLocks: Array<{ shotId: string; candidateLockRevisionId: string }>;
    } | null;
    currentSources?: Array<{
      order: number;
      source: typeof currentSource;
      width: number;
      height: number;
    }>;
    imageAssets?: Record<string, {
      assetId: string;
      sha256: LayoutDigest;
      width: number;
      height: number;
      ready: boolean;
    }>;
  } = {},
) {
  let revisionDocumentDigest =
    "sha256:1111111111111111111111111111111111111111111111111111111111111111" as LayoutDigest;
  let visibleDocumentDigest =
    "sha256:2222222222222222222222222222222222222222222222222222222222222222" as LayoutDigest;
  try {
    revisionDocumentDigest = LayoutDocumentCodecV2.encode(fixture.document).digest;
    visibleDocumentDigest = LayoutDocumentCodecV1.encode(
      projectLayoutDocumentV2ToV1(fixture.document),
    ).digest;
  } catch {
    // Invalid-document cases intentionally exercise the preflight's contract issue mapping.
  }
  return runLayoutPreflightV2({
    document: fixture.document,
    target: {
      kind: "working_copy",
      id: "wc_v2",
      revisionDocumentDigest: overrides.revisionDocumentDigest ?? revisionDocumentDigest,
      visibleDocumentDigest: overrides.visibleDocumentDigest ?? visibleDocumentDigest,
      rowVersion: 4,
    },
    currentSources: overrides.currentSources
      ?? [{ order: 1, source: currentSource, width: 1200, height: 1200 }],
    activeShotIds: ["shot_1"],
    imageAssets: overrides.imageAssets
      ?? { asset_1: { assetId: "asset_1", sha256: imageSha, width: 1200, height: 1200, ready: true } },
    fontCatalog: [font],
    profile: null,
    dialogueLedger: fixture.ledger,
    currentComposition: Object.prototype.hasOwnProperty.call(overrides, "currentComposition")
      ? overrides.currentComposition ?? null
      : fixture.currentComposition,
  });
}

describe("G5-M6 layout preflight", () => {
  it("is stable and ready for a valid current document", () => {
    const first = run(document());
    const second = run(document());
    expect(first.status).toBe("ready");
    expect(first.issues).toEqual([]);
    expect(first.preflightDigest).toBe(second.preflightDigest);
    expect(first.currentLockSetDigest).toBe(first.sourceLockSetDigest);
  });

  it("blocks visible blank text from both revision and export", () => {
    const value = document(" \t ");
    for (const report of [run(value), runExport(value)]) {
      expect(report.status).toBe("blocked");
      expect(report.issues.filter((issue) => issue.code === "VISIBLE_TEXT_EMPTY")).toEqual([
        expect.objectContaining({
          code: "VISIBLE_TEXT_EMPTY",
          severity: "error",
          blockingScopes: ["revision", "export"],
          requiresAcknowledgement: false,
          canvasId: "page_1",
          elementId: "text_1",
          shotId: null,
        }),
      ]);
    }
  });

  it("blocks visible blank balloon from both revision and export", () => {
    const value = document();
    const text = value.canvases[0]!.elements.find((element) => element.id === "text_1");
    if (!text || text.type !== "text") throw new Error("missing text fixture");
    const richText = structuredClone(text.richText);
    richText.paragraphs[0]!.runs[0]!.text = "\n ";
    value.canvases[0]!.elements.push({
      id: "balloon_blank",
      type: "balloon",
      name: "空白气泡",
      transform: { x: 600, y: 120, width: 300, height: 160, rotation: 0, opacity: 1 },
      locked: false,
      hidden: false,
      balloonKind: "speech",
      sourceShotId: null,
      speakerCharacterId: null,
      fillColor: "#FFFFFFFF",
      strokeColor: "#000000FF",
      strokeWidth: 3,
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      verticalAlign: "center",
      tail: { enabled: true, rootRatio: 0.6, targetX: 200, targetY: 240, baseWidth: 24 },
      richText,
    });
    for (const report of [run(value), runExport(value)]) {
      expect(report.status).toBe("blocked");
      expect(report.issues.filter((issue) => issue.code === "VISIBLE_TEXT_EMPTY")).toEqual([
        expect.objectContaining({
          code: "VISIBLE_TEXT_EMPTY",
          severity: "error",
          blockingScopes: ["revision", "export"],
          requiresAcknowledgement: false,
          canvasId: "page_1",
          elementId: "balloon_blank",
          shotId: null,
        }),
      ]);
    }
  });

  it("blocks Unicode format-control-only text without treating emoji ZWJ content as empty", () => {
    const value = document("\u200B\u200D\uFEFF");
    const text = value.canvases[0]!.elements.find((element) => element.id === "text_1");
    if (!text || text.type !== "text") throw new Error("missing text fixture");
    const richText = structuredClone(text.richText);
    richText.paragraphs[0]!.runs[0]!.text = "\u2060\u200C";
    value.canvases[0]!.elements.push({
      id: "balloon_format_only",
      type: "balloon",
      name: "仅格式控制气泡",
      transform: { x: 600, y: 120, width: 300, height: 160, rotation: 0, opacity: 1 },
      locked: false,
      hidden: false,
      balloonKind: "speech",
      sourceShotId: null,
      speakerCharacterId: null,
      fillColor: "#FFFFFFFF",
      strokeColor: "#000000FF",
      strokeWidth: 3,
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      verticalAlign: "center",
      tail: { enabled: true, rootRatio: 0.6, targetX: 200, targetY: 240, baseWidth: 24 },
      richText,
    });
    for (const report of [run(value), runExport(value)]) {
      const emptyIssues = report.issues.filter((issue) => issue.code === "VISIBLE_TEXT_EMPTY");
      expect(report.status).toBe("blocked");
      expect(emptyIssues).toHaveLength(2);
      expect(emptyIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          blockingScopes: ["revision", "export"],
          requiresAcknowledgement: false,
          canvasId: "page_1",
          elementId: "text_1",
        }),
        expect.objectContaining({
          severity: "error",
          blockingScopes: ["revision", "export"],
          requiresAcknowledgement: false,
          canvasId: "page_1",
          elementId: "balloon_format_only",
        }),
      ]));
    }

    const emoji = document("👩‍💻");
    for (const report of [run(emoji), runExport(emoji)]) {
      expect(report.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "VISIBLE_TEXT_EMPTY",
          elementId: "text_1",
        }),
      ]));
    }
  });

  it("locates stale source, missing glyph and text overflow without localized text in digests", () => {
    const value = document("🙂".repeat(40));
    const nextUnsigned = { ...unsignedSource, candidateId: "candidate_2", candidateLockRevisionId: "lock_2", assetId: "asset_2" };
    const next = { ...nextUnsigned, sourceDigest: digestCandidateImageSourceV1(nextUnsigned, imageSha) };
    const report = run(value, next);
    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "FONT_GLYPH_MISSING",
      "SOURCE_STALE",
      "TEXT_OVERFLOW",
    ]));
    expect(report.issues.find((issue) => issue.code === "TEXT_OVERFLOW")?.blockingScopes).toEqual(["export"]);
    expect(report.issues.find((issue) => issue.code === "TEXT_OVERFLOW")?.requiresAcknowledgement).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/message|时间|文案/i);
  });

  it("reports visibility, safe-area and effective-resolution problems with stable issue keys", () => {
    const value = document();
    const panel = value.canvases[0]!.elements[0]!;
    panel.transform = { ...panel.transform, x: -700, width: 2400, height: 2400 };
    const report = runLayoutPreflightV1({
      document: value,
      target: {
        kind: "layout_revision",
        id: "revision_1",
        documentDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        rowVersion: null,
      },
      currentSources: [{ order: 1, source: currentSource, width: 1200, height: 1200 }],
      imageAssets: { asset_1: { assetId: "asset_1", sha256: imageSha, width: 1200, height: 1200, ready: true } },
      fontCatalog: [font],
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 2, includePdf: true, pdfPixelDpi: 96 },
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "ELEMENT_PARTLY_OUTSIDE_SAFE_AREA",
      "IMAGE_EFFECTIVE_RESOLUTION_CRITICAL",
    ]));
    expect(new Set(report.issues.map((issue) => issue.issueKey)).size).toBe(report.issues.length);
  });

  it("G5-IMG-010 blocks unnormalized orientation and unsupported color space before rendering", () => {
    const value = document();
    const report = runLayoutPreflightV1({
      document: value,
      target: {
        kind: "layout_revision",
        id: "revision_normalization",
        documentDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        rowVersion: null,
      },
      currentSources: [{ order: 1, source: currentSource, width: 1200, height: 1200 }],
      imageAssets: {
        asset_1: {
          assetId: "asset_1",
          sha256: imageSha,
          width: 1200,
          height: 1200,
          ready: true,
          normalizationIssues: ["IMAGE_ORIENTATION_UNNORMALIZED", "IMAGE_COLORSPACE_UNSUPPORTED"],
        },
      },
      fontCatalog: [font],
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 },
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "IMAGE_ORIENTATION_UNNORMALIZED",
      "IMAGE_COLORSPACE_UNSUPPORTED",
    ]));
    expect(report.status).toBe("blocked");
  });

  it("accepts a fresh V2 composition with exact current dialogue coverage and freezes both digests", () => {
    const fixture = v2Fixture();
    const report = runV2(fixture);
    expect(report.issues, JSON.stringify(report.issues, null, 2)).toEqual([]);
    expect(report.status).toBe("ready");
    expect(report.target.revisionDocumentDigest).toBe(LayoutDocumentCodecV2.encode(fixture.document).digest);
    expect(report.target.visibleDocumentDigest).toBe(
      LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(fixture.document)).digest,
    );
    expect(report.dialogueCoverage).toEqual({
      expected: 1,
      placedOriginal: 1,
      userModified: 0,
      userSuppressed: 0,
    });
    expect(runV2(fixture).preflightDigest).toBe(report.preflightDigest);
    expect(report.issues.map((issue) => issue.code)).not.toContain("VISIBLE_PROJECTION_UNSTABLE");
  });

  it("blocks mismatched full/visible digests and missing, unexpected or source-mismatched dialogue bindings", () => {
    const wrongA = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as LayoutDigest;
    const wrongB = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as LayoutDigest;
    const digestReport = runV2(v2Fixture(), {
      revisionDocumentDigest: wrongA,
      visibleDocumentDigest: wrongB,
    });
    expect(digestReport.status).toBe("blocked");
    expect(digestReport.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "REVISION_DOCUMENT_DIGEST_MISMATCH",
      "VISIBLE_DOCUMENT_DIGEST_MISMATCH",
    ]));

    const missing = v2Fixture();
    missing.document.automation.dialogueBindings = [];
    expect(runV2(missing).issues.map((issue) => issue.code)).toContain("DIALOGUE_BINDING_MISSING");

    const unexpected = v2Fixture();
    unexpected.document.automation.dialogueBindings[0]!.dialogueItemId = "dialogue_unexpected";
    expect(runV2(unexpected).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "DIALOGUE_BINDING_MISSING",
      "DIALOGUE_BINDING_UNEXPECTED",
    ]));

    const sourceMismatch = v2Fixture();
    sourceMismatch.document.automation.dialogueBindings[0]!.sourceTextDigest = wrongA;
    expect(runV2(sourceMismatch).issues.map((issue) => issue.code)).toContain(
      "DIALOGUE_BINDING_SOURCE_MISMATCH",
    );
  });

  it("maps duplicate and dangling V2 bindings plus invalid protections to blocking contract issues", () => {
    const duplicate = v2Fixture();
    duplicate.document.automation.dialogueBindings.push(
      structuredClone(duplicate.document.automation.dialogueBindings[0]!),
    );
    const duplicateReport = runLayoutPreflightV2({
      document: duplicate.document,
      target: {
        kind: "working_copy",
        id: "wc_invalid_duplicate",
        revisionDocumentDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        visibleDocumentDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        rowVersion: 1,
      },
      currentSources: [{ order: 1, source: currentSource, width: 1200, height: 1200 }],
      imageAssets: {},
      fontCatalog: [font],
      profile: null,
      dialogueLedger: duplicate.ledger,
      currentComposition: duplicate.currentComposition,
    });
    expect(duplicateReport.issues.map((issue) => issue.code)).toContain("DIALOGUE_BINDING_DUPLICATE");

    const dangling = v2Fixture();
    dangling.document.automation.dialogueBindings[0]!.elementId = "balloon_missing";
    expect(runV2(dangling).issues.map((issue) => issue.code)).toContain("DIALOGUE_BINDING_DANGLING");

    const invalidProtection = v2Fixture();
    invalidProtection.document.automation.protections.push({
      targetKind: "element",
      targetId: "missing_element",
      scopes: ["text"],
      reason: "user_edit",
    });
    expect(runV2(invalidProtection).issues.map((issue) => issue.code)).toContain("LAYOUT_PROTECTION_INVALID");
  });

  it("requires acknowledgement for protected user edits and legal suppression tombstones", () => {
    const modified = v2Fixture();
    const balloon = modified.document.canvases[0]!.elements.find((element) => element.id === "balloon_1");
    if (!balloon || balloon.type !== "balloon") throw new Error("missing balloon fixture");
    balloon.richText.paragraphs[0]!.runs[0]!.text = "Edited";
    modified.document.automation.protections.find((entry) => (
      entry.targetKind === "element" && entry.targetId === "balloon_1"
    ))!.reason = "user_edit";
    const modifiedReport = runV2(modified);
    const modifiedIssue = modifiedReport.issues.find((issue) => issue.code === "DIALOGUE_USER_MODIFIED");
    expect(modifiedReport.status).toBe("warning");
    expect(modifiedIssue).toMatchObject({ severity: "warning", requiresAcknowledgement: true });
    expect(modifiedReport.dialogueCoverage.userModified).toBe(1);

    const suppressed = v2Fixture();
    const suppressedBalloon = suppressed.document.canvases[0]!.elements.find((element) => element.id === "balloon_1");
    if (!suppressedBalloon || suppressedBalloon.type !== "balloon") throw new Error("missing balloon fixture");
    suppressedBalloon.hidden = true;
    suppressed.document.automation.dialogueBindings[0]!.disposition = "user_suppressed";
    const suppressedReport = runV2(suppressed);
    const suppressedIssue = suppressedReport.issues.find((issue) => issue.code === "DIALOGUE_USER_SUPPRESSED");
    expect(suppressedReport.status).toBe("warning");
    expect(suppressedIssue).toMatchObject({ severity: "warning", requiresAcknowledgement: true });
    expect(suppressedReport.dialogueCoverage.userSuppressed).toBe(1);
  });

  it("blocks stale storyboard composition and source-lock provenance", () => {
    const staleStoryboard = v2Fixture();
    const staleStoryboardReport = runV2(staleStoryboard, {
      currentComposition: {
        ...staleStoryboard.currentComposition,
        storyboardDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      },
    });
    expect(staleStoryboardReport.issues.map((issue) => issue.code)).toContain("LAYOUT_COMPOSITION_STALE");
    expect(staleStoryboardReport.currentCompositionEvidenceDigest).not.toBeNull();
    expect(staleStoryboardReport.preflightDigest).not.toBe(runV2(staleStoryboard).preflightDigest);

    const staleSourceLock = v2Fixture();
    staleSourceLock.document.automation.composition!.sourceLockSetDigest =
      "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    expect(runV2(staleSourceLock).issues.map((issue) => issue.code)).toContain(
      "LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH",
    );

    const missingEvidence = v2Fixture();
    missingEvidence.currentComposition.compositionSourceLocks = [];
    const missingEvidenceReport = runV2(missingEvidence);
    expect(missingEvidenceReport.status).toBe("blocked");
    expect(missingEvidenceReport.issues.map((issue) => issue.code)).toContain(
      "LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH",
    );

    const missingAuthoritativeComposition = runV2(v2Fixture(), {
      currentComposition: null,
    });
    expect(missingAuthoritativeComposition.status).toBe("blocked");
    expect(missingAuthoritativeComposition.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "LAYOUT_COMPOSITION_STALE",
        "LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH",
      ]),
    );
  });

  it("allows a fully protected explicit source override as an acknowledgement warning", () => {
    const replacementUnsigned = {
      shotId: "shot_1",
      candidateId: "candidate_2",
      candidateLockRevisionId: "lock_2",
      assetId: "asset_2",
    };
    const replacementSource = {
      ...replacementUnsigned,
      sourceDigest: digestCandidateImageSourceV1(replacementUnsigned, imageSha),
    };
    const replaced = v2Fixture();
    const panel = replaced.document.canvases[0]!.elements.find((element) => element.id === "panel_1");
    if (!panel || panel.type !== "panel_frame" || !panel.contentImage) throw new Error("missing panel fixture");
    panel.contentImage.source = replacementSource;
    replaced.document.automation.protections.push({
      targetKind: "panel_image",
      targetId: panel.contentImage.id,
      scopes: ["crop", "source"],
      reason: "user_edit",
    });
    const overrides = {
      currentSources: [{ order: 1, source: replacementSource, width: 1200, height: 1200 }],
      imageAssets: {
        asset_2: {
          assetId: "asset_2",
          sha256: imageSha,
          width: 1200,
          height: 1200,
          ready: true,
        },
      },
    };
    const report = runV2(replaced, overrides);
    expect(report.status).toBe("warning");
    expect(report.issues.find((issue) => issue.code === "LAYOUT_COMPOSITION_SOURCE_OVERRIDE"))
      .toMatchObject({ severity: "warning", requiresAcknowledgement: true });
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      "LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH",
    );

    replaced.document.automation.protections.find((entry) => (
      entry.targetKind === "panel_image"
      && entry.targetId === "image_1"
      && entry.reason === "user_edit"
    ))!.scopes = ["source"];
    const unprotected = runV2(replaced, overrides);
    expect(unprotected.status).toBe("blocked");
    expect(unprotected.issues.map((issue) => issue.code)).toContain(
      "LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH",
    );
  });
});
