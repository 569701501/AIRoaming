import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scope = process.argv[2];
if (!scope || !["render", "migration", "e2e"].includes(scope)) {
  throw new Error("usage: g5-gate-report.ts <render|migration|e2e>");
}

async function run(repoRoot: string, args: string[]): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawn("corepack", ["pnpm", ...args], { cwd: repoRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => resolve(code === 0));
  });
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "tests/fixtures/layout/corpus.manifest.json"), "utf8"));
  const checks: Array<{ id: string; passed: boolean }> = [];
  if (scope === "render") {
    checks.push({ id: "shared_publication_contract", passed: await run(repoRoot, ["--filter", "@airoaming/shared", "test", "--", "publication.spec.ts"]) });
    checks.push({ id: "fixed_renderer", passed: await run(repoRoot, ["--filter", "@airoaming/server", "test", "--", "layout-renderer.service.spec.ts"]) });
    checks.push({ id: "db_publication_recovery", passed: await run(repoRoot, ["--filter", "@airoaming/server", "test", "--", "project-db-persistence.integration.spec.ts", "-t", "P6/G4-D"]) });
  }
  const ownerClosed = scope === "render" && checks.length > 0 && checks.every((check) => check.passed);
  const redGates = manifest.redGates.filter((gate: { scope: string; ownerMilestone: string }) =>
    gate.scope === scope && !(ownerClosed && gate.ownerMilestone === "G5-M7"));
  const report = {
    schemaVersion: 1,
    kind: "g5_stage_gate_report_v1",
    scope,
    status: redGates.length > 0 ? "red" : "green",
    corpusDigest: manifest.corpusDigest,
    checks,
    redGates,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (redGates.length > 0) process.exitCode = 1;
}

void main();
