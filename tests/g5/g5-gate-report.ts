import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scope = process.argv[2];
if (!scope || !["render", "migration", "e2e"].includes(scope)) {
  throw new Error("usage: g5-gate-report.ts <render|migration|e2e>");
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "tests/fixtures/layout/corpus.manifest.json"), "utf8"));
  const redGates = manifest.redGates.filter((gate: { scope: string }) => gate.scope === scope);
  const report = {
    schemaVersion: 1,
    kind: "g5_stage_gate_report_v1",
    scope,
    status: redGates.length > 0 ? "red" : "green",
    corpusDigest: manifest.corpusDigest,
    redGates,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (redGates.length > 0) process.exitCode = 1;
}

void main();
