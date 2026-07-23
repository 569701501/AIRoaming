import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { digestCanonicalJson } from "../../packages/shared/src/versioning/canonical-json.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m2-rule-composition",
);

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("M2 rule-composition manifest freezes 100% shot/text coverage without visual overclaim", async () => {
  const manifest = await json(path.join(evidenceRoot, "m2-rule-output.manifest.json"));
  const { outputManifestDigest, ...unsigned } = manifest;
  assert.equal(digestCanonicalJson(unsigned), outputManifestDigest);
  assert.equal(manifest.kind, "smart_layout_m2_rule_composition_outputs_v1");
  assert.equal(manifest.status, "passed_contract_visual_unscored");
  assert.deepEqual(manifest.aggregate, {
    variantCount: 12,
    shotCount: 69,
    dialogueItemCount: 59,
    canvasCount: 36,
    panelCount: 69,
    balloonCount: 59,
    textOverflowCount: 0,
    silentRewriteCount: 0,
    shotCoverageRate: 1,
    dialogueCoverageRate: 1,
  });
  assert.equal(manifest.outputs.length, 12);
  assert.equal(manifest.reviewState.agentVisualReview, "completed_m2_contract_only");
  assert.equal(manifest.reviewState.independentHumanReviews, "not_started_m3_release_gate");
  assert.ok(!JSON.stringify(manifest).includes(repoRoot));

  for (const output of manifest.outputs) {
    assert.equal(output.counts.shots, output.counts.placedShots);
    assert.equal(output.counts.dialogueItems, output.counts.placedOriginal);
    assert.equal(output.counts.shots, output.counts.panels);
    assert.equal(output.counts.dialogueItems, output.counts.balloons);
    assert.equal(output.counts.textOverflow, 0);
    assert.equal(output.counts.silentRewrite, 0);
    assert.match(output.planDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(output.documentDigest, /^sha256:[0-9a-f]{64}$/);
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

  for (const sheet of manifest.contactSheets) {
    const bytes = await readFile(path.join(evidenceRoot, sheet.relativePath));
    assert.equal(bytes.byteLength, sheet.bytes);
    assert.equal(sha256(bytes), sheet.sha256);
    assert.equal(bytes.readUInt32BE(16), sheet.width);
    assert.equal(bytes.readUInt32BE(20), sheet.height);
  }
  const visualReview = await readFile(path.join(evidenceRoot, manifest.reviewState.visualReview), "utf8");
  assert.ok(visualReview.includes("M3 视觉直接可用率 ≥80%"));
  assert.ok(visualReview.includes("未执行，不得提前签收"));
});
