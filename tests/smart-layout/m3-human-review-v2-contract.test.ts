import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateM3HumanReviewManifestV2,
  validateM3HumanReviewPairV2,
  validateM3HumanReviewRoundV2,
  type M3HumanReviewManifestV2,
  type M3HumanReviewRoundV2,
} from "./m3-human-review-v2-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-human-review-v2",
);
const criticalReasons = new Set([
  "crop_ok",
  "reading_order_ok",
  "subject_occlusion_ok",
  "text_fit_ok",
  "source_fidelity_ok",
  "tail_ok",
  "shape_safe_ok",
  "page_reading_order",
]);

async function fixtures(): Promise<{
  manifest: M3HumanReviewManifestV2;
  blankA: unknown;
  blankB: unknown;
}> {
  const [manifestText, roundAText, roundBText] = await Promise.all([
    readFile(path.join(evidenceRoot, "m3-human-review-v2.manifest.json"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-v2-round-a.template.json"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-v2-round-b.template.json"), "utf8"),
  ]);
  const checked = validateM3HumanReviewManifestV2(manifestText);
  assert.deepEqual(checked.errors, []);
  assert.ok(checked.manifest);
  return {
    manifest: checked.manifest,
    blankA: JSON.parse(roundAText),
    blankB: JSON.parse(roundBText),
  };
}

function completedReview(input: {
  manifest: M3HumanReviewManifestV2;
  reviewerId: string;
  round: M3HumanReviewRoundV2;
  failures?: ReadonlyMap<string, readonly string[]>;
}): Record<string, unknown> {
  const decision = (id: string): { state: "pass" | "adjust"; failed: string[]; critical: boolean; notes: string } => {
    const failed = [...(input.failures?.get(id) ?? [])];
    return failed.length === 0
      ? { state: "pass", failed, critical: false, notes: "" }
      : {
          state: "adjust",
          failed,
          critical: failed.some((reason) => criticalReasons.has(reason)),
          notes: `需要调整：${failed.join("、")}`,
        };
  };
  return {
    schemaVersion: 2,
    kind: "m3_human_review_v2",
    reviewStandardId: input.manifest.reviewStandardId,
    manifestDigest: input.manifest.outputManifestDigest,
    round: input.round,
    reviewerId: input.reviewerId,
    independent: true,
    calibrated: true,
    completedAt: "2026-07-23T08:00:00.000Z",
    itemDecisions: input.manifest.items.map((item) => ({
      itemId: item.itemId,
      itemType: item.itemType,
      variantId: item.variantId,
      difficulty: item.difficulty,
      shotId: item.shotId,
      evidencePath: item.evidencePath,
      sourceImagePath: item.sourceImagePath,
      ...decision(item.itemId),
    })),
    pageDecisions: input.manifest.pages.map((page) => ({
      pageId: page.pageId,
      variantId: page.variantId,
      difficulty: page.difficulty,
      evidencePath: page.evidencePath,
      ...decision(page.pageId),
    })),
  };
}

test("V2 manifest freezes real-art evidence and blank A/B rounds stay pending", async () => {
  const value = await fixtures();
  assert.equal(value.manifest.variantCount, 12);
  assert.equal(value.manifest.pageCount, 30);
  assert.equal(value.manifest.panelCount, 69);
  assert.equal(value.manifest.balloonCount, 59);
  assert.equal(value.manifest.sourceAssetCount, 11);
  assert.ok(value.manifest.sourceAssets.every((asset) => asset.relativePath.startsWith("real-art-assets/")));
  assert.ok(value.manifest.items.every((item) => item.sourceImagePath.startsWith("real-art-assets/")));

  const result = validateM3HumanReviewPairV2({
    manifest: value.manifest,
    roundA: value.blankA,
    roundB: value.blankB,
  });
  assert.equal(result.status, "pending");
  assert.equal(result.releaseGatePassed, false);
  assert.equal(result.roundA.completed, 0);
  assert.equal(result.roundA.expected, 158);
  assert.equal(result.roundB.completed, 0);
});

test("two calibrated complete rounds from distinct reviewers close the V2 gate", async () => {
  const value = await fixtures();
  const result = validateM3HumanReviewPairV2({
    manifest: value.manifest,
    roundA: completedReview({ manifest: value.manifest, reviewerId: "reviewer-a", round: "A" }),
    roundB: completedReview({ manifest: value.manifest, reviewerId: "reviewer-b", round: "B" }),
  });
  assert.equal(result.status, "passed");
  assert.equal(result.releaseGatePassed, true);
  assert.equal(result.roundA.completed, 158);
  assert.equal(result.roundA.criticalFailureCount, 0);
  assert.equal(result.roundA.normal.panel.rate, 1);
  assert.equal(result.roundB.challenging.page.rate, 1);
});

test("case-only reviewer aliases do not count as two independent people", async () => {
  const value = await fixtures();
  const result = validateM3HumanReviewPairV2({
    manifest: value.manifest,
    roundA: completedReview({ manifest: value.manifest, reviewerId: "Reviewer-One", round: "A" }),
    roundB: completedReview({ manifest: value.manifest, reviewerId: "reviewer-one", round: "B" }),
  });
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.errors, ["PAIR_REVIEWERS_MUST_BE_DISTINCT"]);
});

test("normal panels below 90% fail without being mislabeled as a critical failure", async () => {
  const value = await fixtures();
  const normalPanels = value.manifest.items.filter(
    (item) => item.difficulty === "normal" && item.itemType === "panel",
  );
  const passingRequired = Math.ceil(normalPanels.length * 0.9);
  const failedCount = normalPanels.length - passingRequired + 1;
  const failures = new Map(normalPanels.slice(0, failedCount).map((item) => [item.itemId, ["layout_ok"]]));
  const result = validateM3HumanReviewRoundV2({
    round: "A",
    manifest: value.manifest,
    review: completedReview({ manifest: value.manifest, reviewerId: "reviewer-a", round: "A", failures }),
  });
  assert.equal(result.status, "below_threshold");
  assert.equal(result.criticalFailureCount, 0);
  assert.ok(result.normal.panel.rate < 0.9);
});

test("one visible critical defect blocks the gate even when all rates remain above threshold", async () => {
  const value = await fixtures();
  const item = value.manifest.items.find((candidate) => candidate.itemType === "panel");
  assert.ok(item);
  const failures = new Map([[item.itemId, ["crop_ok"]]]);
  const result = validateM3HumanReviewRoundV2({
    round: "A",
    manifest: value.manifest,
    review: completedReview({ manifest: value.manifest, reviewerId: "reviewer-a", round: "A", failures }),
  });
  assert.equal(result.status, "critical_failure");
  assert.equal(result.criticalFailureCount, 1);
  assert.deepEqual(result.criticalFailures[0], { id: item.itemId, failed: ["crop_ok"] });
});

test("manifest, frozen identities, applicable reasons, notes and critical flags fail closed", async () => {
  const value = await fixtures();
  const review = completedReview({ manifest: value.manifest, reviewerId: "reviewer-a", round: "A" });
  const itemDecisions = review.itemDecisions as Array<Record<string, unknown>>;
  itemDecisions[0]!.sourceImagePath = "real-art-assets/replaced.jpg";
  itemDecisions[1]!.state = "adjust";
  itemDecisions[1]!.failed = ["page_rhythm"];
  itemDecisions[1]!.critical = true;
  itemDecisions[1]!.notes = "";
  const result = validateM3HumanReviewRoundV2({
    round: "A",
    manifest: value.manifest,
    review,
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((error) => error.includes("SOURCE_MISMATCH")));
  assert.ok(result.errors.some((error) => error.includes("FAILED_REASON_NOT_APPLICABLE")));
  assert.ok(result.errors.some((error) => error.includes("ADJUSTMENT_REASON_AND_NOTES_REQUIRED")));
  assert.ok(result.errors.some((error) => error.includes("CRITICAL_FLAG_MISMATCH")));

  const tamperedManifest = structuredClone(value.manifest) as Record<string, unknown>;
  tamperedManifest.panelCount = 68;
  const checked = validateM3HumanReviewManifestV2(tamperedManifest);
  assert.equal(checked.manifest, null);
  assert.ok(checked.errors.includes("manifest:PANEL_COUNT_MISMATCH"));
  assert.ok(checked.errors.includes("manifest:OUTPUT_DIGEST_MISMATCH"));
});
