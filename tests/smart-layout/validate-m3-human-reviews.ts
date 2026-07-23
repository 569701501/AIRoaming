import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateM3HumanReviewPairV1 } from "./m3-human-review-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-visual-composition",
);

const [automatedCsv, roundACsv, roundBCsv] = await Promise.all([
  readFile(path.join(evidenceRoot, "m3-automated-review.csv"), "utf8"),
  readFile(path.join(evidenceRoot, "m3-human-review-round-a.csv"), "utf8"),
  readFile(path.join(evidenceRoot, "m3-human-review-round-b.csv"), "utf8"),
]);
const result = validateM3HumanReviewPairV1({ automatedCsv, roundACsv, roundBCsv });
process.stdout.write(`${JSON.stringify({
  ...result,
  roundA: { ...result.roundA, errors: result.roundA.errors.slice(0, 20) },
  roundB: { ...result.roundB, errors: result.roundB.errors.slice(0, 20) },
}, null, 2)}\n`);
if (result.status === "invalid") process.exitCode = 1;
else if (!result.releaseGatePassed) process.exitCode = 2;
