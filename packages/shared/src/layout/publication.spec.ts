import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { digestCanonicalJson } from "../versioning/canonical-json.js";
import type { LayoutDocumentV1 } from "./document.js";
import {
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  upgradeLayoutWorkingCopyV1ToV2,
} from "./automation.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  buildLayoutRenderPlanV1,
  buildLayoutRenderPlanV2,
  buildPublicationManifestV1,
  buildPublicationManifestV2,
  buildVerticalSlicePlanV1,
  parseLayoutPublicationTaskInputV2,
  parseCreateLayoutPublicationRequestV2,
  parseCreateLayoutPublicationRequestV1,
  type RenderAssetManifestV1,
} from "./publication.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/layout",
);

async function fixture(name: string): Promise<{
  document: LayoutDocumentV1;
  expected: {
    documentDigest: `sha256:${string}`;
    sourceLockSetDigest: `sha256:${string}`;
    profile: unknown;
    profileDigest: `sha256:${string}`;
    assetManifest: RenderAssetManifestV1;
  };
}> {
  return JSON.parse(await readFile(path.join(fixtureRoot, `${name}.json`), "utf8"));
}

describe("G5-M7 publication contracts", () => {
  it("builds a path-free deterministic render plan", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    const first = buildLayoutRenderPlanV1({
      document: sample.document,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile,
      assets: sample.expected.assetManifest,
    });
    const second = buildLayoutRenderPlanV1({
      document: structuredClone(sample.document),
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: structuredClone(sample.expected.profile),
      assets: structuredClone(sample.expected.assetManifest),
    });
    expect(second).toEqual(first);
    expect(first.documentDigest).toBe(sample.expected.documentDigest);
    expect(first.profileDigest).toBe(sample.expected.profileDigest);
    expect(first.canvases[0]).toMatchObject({ order: 1, width: 1800, height: 2400 });
    const { renderPlanDigest, ...unsigned } = first;
    expect(renderPlanDigest).toBe(digestCanonicalJson(unsigned));
    expect(JSON.stringify(first)).not.toMatch(/storageKey|relativePath|claimToken|createdAt/);
    const taskAssets = {
      ...sample.expected.assetManifest,
      fonts: sample.expected.assetManifest.fonts.map((font) => {
        const fixtureFont = font as typeof font & { metadata?: unknown };
        return { ...font, metadata: undefined, metadataDigest: fixtureFont.metadata ? digestCanonicalJson(fixtureFont.metadata) : font.metadataDigest };
      }),
    };
    expect(buildLayoutRenderPlanV1({
      document: sample.document,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile,
      assets: taskAssets,
    })).toEqual(first);
  });

  it("plans vertical slices on section boundaries before exact cuts", async () => {
    const sample = await fixture("vertical-long-20-sections");
    const slices = buildVerticalSlicePlanV1(sample.document.canvases, 8192, 1);
    expect(slices.map((slice) => slice.height)).toEqual([7680, 7680, 7680, 7680, 7680]);
    expect(slices.every((slice, index) => slice.order === index + 1 && !slice.crossesContent)).toBe(true);
    expect(slices.at(-1)?.endY).toBe(38_400);
  });

  it("strictly binds request intent and warning acknowledgements", () => {
    const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(parseCreateLayoutPublicationRequestV1({
      schemaVersion: 1,
      requestId: "request_1",
      layoutRevisionId: "layout_revision_1",
      expectedCurrentLayoutRevisionId: "layout_revision_1",
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 },
      profileDigest: digest,
      preflightDigest: digest,
      acknowledgedIssueKeys: ["issue_b", "issue_a"],
    }).acknowledgedIssueKeys).toEqual(["issue_a", "issue_b"]);
    expect(() => parseCreateLayoutPublicationRequestV1({
      schemaVersion: 1,
      requestId: "request_1",
      layoutRevisionId: "layout_revision_1",
      expectedCurrentLayoutRevisionId: "layout_revision_1",
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 },
      profileDigest: digest,
      preflightDigest: digest,
      acknowledgedIssueKeys: ["issue_a", "issue_a"],
    })).toThrow(/duplicate issue key/i);
  });

  it("builds a manifest that excludes itself and has a canonical digest", () => {
    const manifest = buildPublicationManifestV1({
      projectId: "project_1",
      chapterId: "chapter_1",
      exportRevisionId: "export_1",
      exportRevision: 1,
      layoutRevisionId: "layout_1",
      layoutRevision: 2,
      documentDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceLockSetDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      profile: { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: false, pdfPixelDpi: 96 },
      renderer: {
        rendererId: "airoaming_layout_renderer",
        rendererVersion: "chromium-149-layout-v1",
        rendererPolicyVersion: "layout_render_policy_v1",
        geometryPolicyVersion: "layout_geometry_v1",
        textPolicyVersion: "layout_text_v1",
        balloonPolicyVersion: "balloon_shape_v1",
        rasterEngine: "chromium",
        rasterEngineVersion: "149",
        buildDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      inputs: { images: [], fonts: [] },
      outputs: [{
        assetId: "asset_page_1",
        role: "page_png",
        order: 1,
        storageKey: "projects/project_1/chapters/chapter-1/exports/export_1/page-0001.png",
        mimeType: "image/png",
        sha256: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        bytes: 100,
        width: 1800,
        height: 2400,
        pageCount: null,
      }],
    });
    expect(manifest.value.outputs).toHaveLength(1);
    expect(manifest.value.outputs.some((output) => output.role === "publication_manifest" as never)).toBe(false);
    expect(manifest.digest).toBe(digestCanonicalJson(manifest.value));
  });

  it("freezes full and visible V2 digests in render plans, task input and manifests", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    const document = upgradeLayoutWorkingCopyV1ToV2(sample.document);
    const revisionDocumentDigest = LayoutDocumentCodecV2.encode(document).digest;
    const visibleDocumentDigest = LayoutDocumentCodecV1.encode(projectLayoutDocumentV2ToV1(document)).digest;
    const plan = buildLayoutRenderPlanV2({
      document,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile,
      assets: sample.expected.assetManifest,
    });
    expect(plan).toMatchObject({
      schemaVersion: 2,
      kind: "layout_render_plan_v2",
      revisionDocumentDigest,
      visibleDocumentDigest,
    });
    const { renderPlanDigest, ...unsignedPlan } = plan;
    expect(renderPlanDigest).toBe(digestCanonicalJson(unsignedPlan));

    const request = parseCreateLayoutPublicationRequestV2({
      schemaVersion: 2,
      requestId: "request_v2",
      layoutRevisionId: "layout_revision_v2",
      expectedCurrentLayoutRevisionId: "layout_revision_v2",
      expectedRevisionDocumentDigest: revisionDocumentDigest,
      expectedVisibleDocumentDigest: visibleDocumentDigest,
      profile: sample.expected.profile,
      profileDigest: sample.expected.profileDigest,
      preflightDigest: sample.expected.documentDigest,
      acknowledgedIssueKeys: [],
    });
    expect(request.expectedRevisionDocumentDigest).toBe(revisionDocumentDigest);

    const taskInput = {
      schemaVersion: 2,
      kind: "layout_publication_task_v2",
      requestId: "request_v2",
      exportRevisionId: "export_v2",
      layoutRevisionId: "layout_revision_v2",
      revisionDocumentDigest,
      visibleDocumentDigest,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile,
      profileDigest: sample.expected.profileDigest,
      preflightDigest: sample.expected.documentDigest,
      acknowledgedIssueKeys: [],
      renderer: {
        rendererId: "airoaming_layout_renderer",
        rendererVersion: "chromium-149-layout-v1",
        rendererPolicyVersion: "layout_render_policy_v1",
        geometryPolicyVersion: "layout_geometry_v1",
        textPolicyVersion: "layout_text_v1",
        balloonPolicyVersion: "balloon_shape_v1",
        rasterEngine: "chromium",
        rasterEngineVersion: "149",
        buildDigest: sample.expected.documentDigest,
      },
      assetManifest: sample.expected.assetManifest,
      sourceProjection: {
        schemaVersion: 1,
        policyVersion: "layout-publication-source-v2",
        projectId: "project_1",
        chapterId: "chapter_1",
        consumerType: "layout_export",
        sources: [{
          role: "layout_revision",
          order: 1,
          sourceType: "layout_revision",
          sourceId: "layout_revision_v2",
          sourceDigest: revisionDocumentDigest,
        }],
      },
    } as const;
    const task = parseLayoutPublicationTaskInputV2(taskInput);
    expect(task).toMatchObject({ revisionDocumentDigest, visibleDocumentDigest });
    expect(() => parseLayoutPublicationTaskInputV2({
      ...taskInput,
      sourceProjection: {
        ...taskInput.sourceProjection,
        policyVersion: "layout-publication-source-v3",
      },
    })).toThrow(/sourceProjection\.policyVersion/);

    const manifest = buildPublicationManifestV2({
      projectId: "project_1",
      chapterId: "chapter_1",
      exportRevisionId: "export_v2",
      exportRevision: 1,
      layoutRevisionId: "layout_revision_v2",
      layoutRevision: 1,
      revisionDocumentDigest,
      visibleDocumentDigest,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile as never,
      renderer: task.renderer,
      inputs: { images: [], fonts: [] },
      outputs: [],
    });
    expect(manifest.value).toMatchObject({
      schemaVersion: 2,
      kind: "layout_publication_manifest_v2",
      revisionDocumentDigest,
      visibleDocumentDigest,
    });
    expect(manifest.digest).toBe(digestCanonicalJson(manifest.value));
  });

  it("makes automation-only V2 changes visible to the full digest but not the render projection digest", async () => {
    const sample = await fixture("paged-four-panel-rich-text");
    const firstDocument = upgradeLayoutWorkingCopyV1ToV2(sample.document);
    const secondDocument = structuredClone(firstDocument);
    secondDocument.automation.protections[0]!.reason = "user_edit";
    const first = buildLayoutRenderPlanV2({
      document: firstDocument,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile,
      assets: sample.expected.assetManifest,
    });
    const second = buildLayoutRenderPlanV2({
      document: secondDocument,
      sourceLockSetDigest: sample.expected.sourceLockSetDigest,
      profile: sample.expected.profile,
      assets: sample.expected.assetManifest,
    });
    expect(second.revisionDocumentDigest).not.toBe(first.revisionDocumentDigest);
    expect(second.visibleDocumentDigest).toBe(first.visibleDocumentDigest);
    expect(second.renderPlanDigest).not.toBe(first.renderPlanDigest);
  });
});
