export const M3_HUMAN_REVIEW_HEADER = [
  "reviewer_id", "review_round", "variant_id", "comic_format", "item_type", "item_id", "shot_id", "source_text",
  "layout_ok", "crop_ok", "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok",
  "text_fit_ok", "tail_ok", "shape_safe_ok", "adjustment_notes", "evidence_path",
] as const;

export type M3HumanReviewRound = "A" | "B";
export type M3HumanReviewStatus = "passed" | "pending" | "invalid" | "below_threshold";

const PANEL_FIELDS = ["layout_ok", "crop_ok", "reading_order_ok", "subject_occlusion_ok"] as const;
const BALLOON_FIELDS = [
  "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok",
  "text_fit_ok", "tail_ok", "shape_safe_ok",
] as const;
const DECISION_FIELDS = [
  "layout_ok", "crop_ok", "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok",
  "text_fit_ok", "tail_ok", "shape_safe_ok",
] as const;
const STATIC_FIELDS = [
  "variant_id", "comic_format", "item_type", "item_id", "shot_id", "source_text", "evidence_path",
] as const;

interface ReviewRowV1 {
  [key: string]: string;
}

export interface M3HumanReviewRoundResultV1 {
  round: M3HumanReviewRound;
  status: M3HumanReviewStatus;
  reviewerId: string | null;
  panel: { passed: number; total: number; rate: number };
  balloon: { passed: number; total: number; rate: number };
  completed: number;
  expected: number;
  errors: string[];
}

export interface M3HumanReviewPairResultV1 {
  status: M3HumanReviewStatus;
  releaseGatePassed: boolean;
  roundA: M3HumanReviewRoundResultV1;
  roundB: M3HumanReviewRoundResultV1;
  errors: string[];
}

export function parseM3ReviewCsvV1(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("M3_REVIEW_CSV_UNTERMINATED_QUOTE");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function serializeM3ReviewCsvV1(rows: readonly (readonly string[])[]): string {
  const cell = (value: string): string => (
    /[",\n\r]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  );
  return `${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`;
}

function rowsByHeader(value: string, label: string): { rows: ReviewRowV1[]; errors: string[] } {
  let parsed: string[][];
  try {
    parsed = parseM3ReviewCsvV1(value);
  } catch (error) {
    return { rows: [], errors: [`${label}:${error instanceof Error ? error.message : "CSV_PARSE_FAILED"}`] };
  }
  const errors: string[] = [];
  const header = parsed[0] ?? [];
  if (header.length !== M3_HUMAN_REVIEW_HEADER.length
    || header.some((name, index) => name !== M3_HUMAN_REVIEW_HEADER[index])) {
    errors.push(`${label}:HEADER_MISMATCH`);
  }
  const rows = parsed.slice(1).map((values, rowIndex): ReviewRowV1 => {
    if (values.length !== M3_HUMAN_REVIEW_HEADER.length) errors.push(`${label}:ROW_${rowIndex + 2}_COLUMN_COUNT`);
    return Object.fromEntries(M3_HUMAN_REVIEW_HEADER.map((name, index) => [name, values[index] ?? ""]));
  });
  return { rows, errors };
}

function roundedRate(passed: number, total: number): number {
  return total === 0 ? 0 : Math.round((passed / total) * 100_000) / 100_000;
}

export function validateM3HumanReviewRoundV1(input: {
  round: M3HumanReviewRound;
  reviewCsv: string;
  automatedCsv: string;
}): M3HumanReviewRoundResultV1 {
  const expected = rowsByHeader(input.automatedCsv, "automated");
  const actual = rowsByHeader(input.reviewCsv, `round_${input.round}`);
  const structuralErrors = [...expected.errors, ...actual.errors];
  const pendingErrors: string[] = [];
  if (expected.rows.length !== actual.rows.length) structuralErrors.push(`round_${input.round}:ROW_COUNT_MISMATCH`);
  const expectedIds = new Set<string>();
  const actualIds = new Set<string>();
  const reviewerIds = new Set<string>();
  let panelPassed = 0;
  let panelTotal = 0;
  let balloonPassed = 0;
  let balloonTotal = 0;
  let completed = 0;

  for (let index = 0; index < expected.rows.length; index += 1) {
    const expectedRow = expected.rows[index]!;
    const actualRow = actual.rows[index];
    const expectedId = expectedRow.item_id ?? "";
    if (!expectedId || expectedIds.has(expectedId)) structuralErrors.push(`automated:DUPLICATE_OR_EMPTY_ITEM_ID:${expectedId}`);
    expectedIds.add(expectedId);
    if (!actualRow) continue;
    const actualId = actualRow.item_id ?? "";
    if (!actualId || actualIds.has(actualId)) structuralErrors.push(`round_${input.round}:DUPLICATE_OR_EMPTY_ITEM_ID:${actualId}`);
    actualIds.add(actualId);
    for (const field of STATIC_FIELDS) {
      if (actualRow[field] !== expectedRow[field]) structuralErrors.push(`round_${input.round}:${expectedId}:${field}:SOURCE_MISMATCH`);
    }
    if (actualRow.reviewer_id) reviewerIds.add(actualRow.reviewer_id);
    else pendingErrors.push(`round_${input.round}:${expectedId}:REVIEWER_MISSING`);
    if (!actualRow.review_round) pendingErrors.push(`round_${input.round}:${expectedId}:ROUND_MISSING`);
    else if (actualRow.review_round !== input.round) structuralErrors.push(`round_${input.round}:${expectedId}:ROUND_MISMATCH`);

    const itemType = expectedRow.item_type;
    const applicable = itemType === "panel" ? PANEL_FIELDS : itemType === "required_balloon" ? BALLOON_FIELDS : null;
    if (!applicable) {
      structuralErrors.push(`round_${input.round}:${expectedId}:ITEM_TYPE_INVALID`);
      continue;
    }
    const applicableSet = new Set<string>(applicable);
    for (const field of DECISION_FIELDS) {
      const value = actualRow[field];
      if (applicableSet.has(field)) {
        if (!value) pendingErrors.push(`round_${input.round}:${expectedId}:${field}:DECISION_MISSING`);
        else if (value !== "true" && value !== "false") structuralErrors.push(`round_${input.round}:${expectedId}:${field}:BOOLEAN_INVALID`);
      } else if (value) {
        structuralErrors.push(`round_${input.round}:${expectedId}:${field}:NON_APPLICABLE_MUST_BE_EMPTY`);
      }
    }
    const decisions = applicable.map((field) => actualRow[field]);
    const rowComplete = decisions.every((value) => value === "true" || value === "false")
      && !!actualRow.reviewer_id && actualRow.review_round === input.round;
    if (rowComplete) completed += 1;
    const directUsable = rowComplete && decisions.every((value) => value === "true");
    if (rowComplete && !directUsable && !actualRow.adjustment_notes.trim()) {
      structuralErrors.push(`round_${input.round}:${expectedId}:ADJUSTMENT_NOTES_REQUIRED`);
    }
    if (itemType === "panel") {
      panelTotal += 1;
      if (directUsable) panelPassed += 1;
    } else {
      balloonTotal += 1;
      if (directUsable) balloonPassed += 1;
    }
  }
  if (actualIds.size !== expectedIds.size || [...expectedIds].some((id) => !actualIds.has(id))) {
    structuralErrors.push(`round_${input.round}:ITEM_ID_SET_MISMATCH`);
  }
  if (reviewerIds.size > 1) structuralErrors.push(`round_${input.round}:MULTIPLE_REVIEWERS`);
  const reviewerId = reviewerIds.size === 1 ? [...reviewerIds][0]! : null;
  const panelRate = roundedRate(panelPassed, panelTotal);
  const balloonRate = roundedRate(balloonPassed, balloonTotal);
  let status: M3HumanReviewStatus;
  if (structuralErrors.length > 0) status = "invalid";
  else if (pendingErrors.length > 0 || completed !== expected.rows.length) status = "pending";
  else if (panelRate < 0.8 || balloonRate < 0.8) status = "below_threshold";
  else status = "passed";
  return {
    round: input.round,
    status,
    reviewerId,
    panel: { passed: panelPassed, total: panelTotal, rate: panelRate },
    balloon: { passed: balloonPassed, total: balloonTotal, rate: balloonRate },
    completed,
    expected: expected.rows.length,
    errors: [...structuralErrors, ...pendingErrors],
  };
}

export function validateM3HumanReviewPairV1(input: {
  automatedCsv: string;
  roundACsv: string;
  roundBCsv: string;
}): M3HumanReviewPairResultV1 {
  const roundA = validateM3HumanReviewRoundV1({ round: "A", reviewCsv: input.roundACsv, automatedCsv: input.automatedCsv });
  const roundB = validateM3HumanReviewRoundV1({ round: "B", reviewCsv: input.roundBCsv, automatedCsv: input.automatedCsv });
  const errors: string[] = [];
  if (roundA.reviewerId && roundA.reviewerId === roundB.reviewerId) errors.push("PAIR_REVIEWERS_MUST_BE_DISTINCT");
  let status: M3HumanReviewStatus;
  if (errors.length > 0 || roundA.status === "invalid" || roundB.status === "invalid") status = "invalid";
  else if (roundA.status === "pending" || roundB.status === "pending") status = "pending";
  else if (roundA.status === "below_threshold" || roundB.status === "below_threshold") status = "below_threshold";
  else status = "passed";
  return { status, releaseGatePassed: status === "passed", roundA, roundB, errors };
}
