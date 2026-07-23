import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateM3HumanReviewPairV2 } from "./m3-human-review-v2-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-human-review-v2",
);

const [manifest, roundA, roundB] = await Promise.all([
  readFile(path.join(evidenceRoot, "m3-human-review-v2.manifest.json"), "utf8"),
  readFile(path.join(evidenceRoot, "m3-human-review-v2-round-a.json"), "utf8"),
  readFile(path.join(evidenceRoot, "m3-human-review-v2-round-b.json"), "utf8"),
]);
const result = validateM3HumanReviewPairV2({ manifest, roundA, roundB });
process.stdout.write(`${JSON.stringify({
  ...result,
  roundA: {
    ...result.roundA,
    criticalFailures: result.roundA.criticalFailures.slice(0, 20),
    errors: result.roundA.errors.slice(0, 20),
  },
  roundB: {
    ...result.roundB,
    criticalFailures: result.roundB.criticalFailures.slice(0, 20),
    errors: result.roundB.errors.slice(0, 20),
  },
}, null, 2)}\n`);
if (result.status === "invalid") process.exitCode = 1;
else if (!result.releaseGatePassed) process.exitCode = 2;
