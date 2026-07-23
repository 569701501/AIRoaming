import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  M3_HUMAN_REVIEW_HEADER,
  parseM3ReviewCsvV1,
  serializeM3ReviewCsvV1,
  validateM3HumanReviewPairV1,
  validateM3HumanReviewRoundV1,
  type M3HumanReviewRound,
} from "./m3-human-review-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-visual-composition",
);
const indexByName = new Map(M3_HUMAN_REVIEW_HEADER.map((name, index) => [name, index]));
const panelFields = ["layout_ok", "crop_ok", "reading_order_ok", "subject_occlusion_ok"];
const balloonFields = [
  "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok",
  "text_fit_ok", "tail_ok", "shape_safe_ok",
];

async function fixtures(): Promise<{ automated: string; roundA: string; roundB: string }> {
  const [automated, roundA, roundB] = await Promise.all([
    readFile(path.join(evidenceRoot, "m3-automated-review.csv"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-round-a.csv"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-round-b.csv"), "utf8"),
  ]);
  return { automated, roundA, roundB };
}

function completedReview(input: {
  automated: string;
  reviewerId: string;
  round: M3HumanReviewRound;
  failedItemIds?: ReadonlySet<string>;
}): string {
  const source = parseM3ReviewCsvV1(input.automated);
  const rows = [source[0]!.slice()];
  for (const original of source.slice(1)) {
    const row = Array.from({ length: M3_HUMAN_REVIEW_HEADER.length }, () => "");
    for (const name of ["variant_id", "comic_format", "item_type", "item_id", "shot_id", "source_text", "evidence_path"] as const) {
      row[indexByName.get(name)!] = original[indexByName.get(name)!] ?? "";
    }
    row[indexByName.get("reviewer_id")!] = input.reviewerId;
    row[indexByName.get("review_round")!] = input.round;
    const itemType = row[indexByName.get("item_type")!];
    const fields = itemType === "panel" ? panelFields : balloonFields;
    for (const field of fields) row[indexByName.get(field)!] = "true";
    if (input.failedItemIds?.has(row[indexByName.get("item_id")!]!)) {
      row[indexByName.get(fields[0]!)!] = "false";
      row[indexByName.get("adjustment_notes")!] = "需要人工微调";
    }
    rows.push(row);
  }
  return serializeM3ReviewCsvV1(rows);
}

test("blank A/B templates remain pending and never count as human decisions", async () => {
  const value = await fixtures();
  const result = validateM3HumanReviewPairV1({
    automatedCsv: value.automated,
    roundACsv: value.roundA,
    roundBCsv: value.roundB,
  });
  assert.equal(result.status, "pending");
  assert.equal(result.releaseGatePassed, false);
  assert.equal(result.roundA.completed, 0);
  assert.equal(result.roundB.completed, 0);
  assert.equal(result.roundA.expected, 128);
  assert.equal(result.roundA.panel.total, 69);
  assert.equal(result.roundA.balloon.total, 59);
});

test("two distinct complete rounds with both rates at least 80% close the release gate", async () => {
  const value = await fixtures();
  const roundA = completedReview({ automated: value.automated, reviewerId: "reviewer-a", round: "A" });
  const roundB = completedReview({ automated: value.automated, reviewerId: "reviewer-b", round: "B" });
  const result = validateM3HumanReviewPairV1({ automatedCsv: value.automated, roundACsv: roundA, roundBCsv: roundB });
  assert.equal(result.status, "passed");
  assert.equal(result.releaseGatePassed, true);
  assert.deepEqual(result.roundA.panel, { passed: 69, total: 69, rate: 1 });
  assert.deepEqual(result.roundB.balloon, { passed: 59, total: 59, rate: 1 });
});

test("the same reviewer cannot satisfy both independent rounds", async () => {
  const value = await fixtures();
  const roundA = completedReview({ automated: value.automated, reviewerId: "same-person", round: "A" });
  const roundB = completedReview({ automated: value.automated, reviewerId: "same-person", round: "B" });
  const result = validateM3HumanReviewPairV1({ automatedCsv: value.automated, roundACsv: roundA, roundBCsv: roundB });
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.errors, ["PAIR_REVIEWERS_MUST_BE_DISTINCT"]);
});

test("a complete round below either 80% threshold is rejected without changing its source rows", async () => {
  const value = await fixtures();
  const source = parseM3ReviewCsvV1(value.automated);
  const failedPanels = new Set(source.slice(1)
    .filter((row) => row[indexByName.get("item_type")!] === "panel")
    .slice(0, 14)
    .map((row) => row[indexByName.get("item_id")!]!));
  const review = completedReview({ automated: value.automated, reviewerId: "reviewer-a", round: "A", failedItemIds: failedPanels });
  const result = validateM3HumanReviewRoundV1({ round: "A", reviewCsv: review, automatedCsv: value.automated });
  assert.equal(result.status, "below_threshold");
  assert.deepEqual(result.panel, { passed: 55, total: 69, rate: 0.7971 });
  assert.deepEqual(result.balloon, { passed: 59, total: 59, rate: 1 });
});

test("source text, identity, round, boolean and notes tampering fail closed", async () => {
  const value = await fixtures();
  const rows = parseM3ReviewCsvV1(completedReview({ automated: value.automated, reviewerId: "reviewer-a", round: "A" }));
  rows[1]![indexByName.get("source_text")!] = "被改过的来源文字";
  rows[2]![indexByName.get("review_round")!] = "B";
  rows[3]![indexByName.get("layout_ok")!] = "yes";
  rows[4]![indexByName.get("layout_ok")!] = "false";
  rows[4]![indexByName.get("adjustment_notes")!] = "";
  const result = validateM3HumanReviewRoundV1({
    round: "A",
    reviewCsv: serializeM3ReviewCsvV1(rows),
    automatedCsv: value.automated,
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((error) => error.includes("SOURCE_MISMATCH")));
  assert.ok(result.errors.some((error) => error.includes("ROUND_MISMATCH")));
  assert.ok(result.errors.some((error) => error.includes("BOOLEAN_INVALID")));
  assert.ok(result.errors.some((error) => error.includes("ADJUSTMENT_NOTES_REQUIRED")));
});
