import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { digestCanonicalJson } from "../../packages/shared/src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/smart-layout");
const evidenceRoot = path.join(repoRoot, "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m0-baseline");

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("M0 baseline output manifest binds all twelve variants to the production renderer", async () => {
  const corpus = await json(path.join(fixtureRoot, "corpus.manifest.json"));
  const manifest = await json(path.join(evidenceRoot, "m0-baseline-output.manifest.json"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, "smart_layout_m0_baseline_outputs_v1");
  assert.equal(manifest.corpusDigest, corpus.corpusDigest);
  assert.equal(manifest.outputs.length, 12);
  assert.deepEqual(manifest.outputs.map((output: any) => output.variantId), corpus.variants.map((variant: any) => variant.variantId));
  assert.equal(manifest.renderer.rendererId, "airoaming_layout_renderer");
  assert.equal(manifest.renderer.rasterEngine, "chromium");
  const { outputManifestDigest, ...unsigned } = manifest;
  assert.equal(digestCanonicalJson(unsigned), outputManifestDigest);
  assert.ok(!JSON.stringify(manifest).includes(repoRoot));

  for (const output of manifest.outputs) {
    const fixtureEntry = corpus.variants.find((entry: any) => entry.variantId === output.variantId);
    assert.ok(fixtureEntry);
    assert.equal(output.documentDigest, fixtureEntry.layoutDocumentDigest);
    assert.equal(output.sourceLockSetDigest, fixtureEntry.sourceLockSetDigest);
    const roles = output.artifacts.map((artifact: any) => artifact.role);
    if (output.comicFormat === "paged_comic") {
      assert.ok(roles.includes("page_png"));
      assert.ok(roles.includes("document_pdf"));
    } else {
      assert.ok(roles.includes("strip_slice_png"));
      assert.ok(roles.includes("long_png"));
    }
    for (const artifact of output.artifacts) {
      const bytes = await readFile(path.join(evidenceRoot, artifact.relativePath));
      assert.equal(bytes.byteLength, artifact.bytes);
      assert.equal(sha256(bytes), artifact.sha256);
      if (artifact.mimeType === "image/png") {
        assert.equal(bytes.readUInt32BE(0), 0x89504e47);
        assert.equal(bytes.readUInt32BE(16), artifact.width);
        assert.equal(bytes.readUInt32BE(20), artifact.height);
      } else {
        assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
        assert.ok(bytes.toString("latin1").includes("%%EOF"));
        assert.ok(artifact.pageCount >= 1);
      }
    }
  }
});

test("M0 contact sheets and aggregate report preserve the honest current red baseline", async () => {
  const manifest = await json(path.join(evidenceRoot, "m0-baseline-output.manifest.json"));
  const report = await json(path.join(evidenceRoot, "m0-current-baseline-report.json"));
  assert.equal(report.kind, "smart_layout_m0_current_baseline_report_v1");
  assert.equal(report.corpusDigest, manifest.corpusDigest);
  assert.equal(report.outputManifestDigest, manifest.outputManifestDigest);
  assert.equal(report.status, "red");
  assert.deepEqual(report.aggregate, {
    variantCount: 12,
    shotCount: 69,
    panelCount: 69,
    panelDirectUsableCount: 5,
    requiredDialogueOrCaptionItemCount: 59,
    boundBalloonDirectUsableCount: 0,
    panelsNeedingLayoutAdjustment: 52,
    panelsNeedingCropAdjustment: 41,
    minimumObjectAdjustments: 152,
    panelDirectUsableRate: 5 / 69,
    boundBalloonDirectUsableRate: 0,
  });
  assert.equal(report.byFormat.vertical_scroll.variantCount, 6);
  assert.equal(report.byFormat.paged_comic.variantCount, 6);
  assert.equal(report.reviewState.agentVisualReview, "pending_contact_sheet_review");
  assert.deepEqual(report.reviewState.independentHumanReviews, { required: 2, completed: 0, status: "pending_for_future_80_percent_release_gate" });
  assert.equal(manifest.contactSheets.length, 2);
  for (const sheet of manifest.contactSheets) {
    const bytes = await readFile(path.join(evidenceRoot, sheet.relativePath));
    assert.equal(sha256(bytes), sheet.sha256);
    assert.equal(bytes.byteLength, sheet.bytes);
    assert.equal(bytes.readUInt32BE(0), 0x89504e47);
    assert.equal(bytes.readUInt32BE(16), sheet.width);
    assert.equal(bytes.readUInt32BE(20), sheet.height);
  }
  const reviewTemplate = await readFile(path.join(evidenceRoot, manifest.reviewTemplate.relativePath));
  assert.equal(sha256(reviewTemplate), manifest.reviewTemplate.sha256);
  assert.equal(reviewTemplate.byteLength, manifest.reviewTemplate.bytes);
  assert.equal(manifest.reviewTemplate.panelRows, 69);
  assert.equal(manifest.reviewTemplate.requiredBalloonRows, 59);
  assert.equal(reviewTemplate.toString("utf8").trimEnd().split("\n").length, 1 + 69 + 59);
});
