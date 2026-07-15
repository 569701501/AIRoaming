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
  } else if (scope === "migration") {
    checks.push({ id: "legacy_layout_converter", passed: await run(repoRoot, ["--filter", "@airoaming/server", "test", "--", "layout-legacy-converter.spec.ts"]) });
    checks.push({ id: "legacy_import_to_v1_cutover", passed: await run(repoRoot, ["--filter", "@airoaming/server", "test", "--", "project-chapter-shadow-importer.integration.spec.ts", "-t", "IMP-A12-01"]) });
    checks.push({ id: "legacy_runtime_path_removed", passed: await run(repoRoot, ["--filter", "@airoaming/server", "test", "--", "g5-m8-cutover.spec.ts"]) });
  } else {
    checks.push({ id: "e2e_environment", passed: await run(repoRoot, ["test:e2e:prepare"]) });
    checks.push({ id: "db_vertical_slices_m3_to_m8", passed: await run(repoRoot, ["exec", "node", "tests/e2e/support/run-e2e-matrix.mjs", "--mode=db"]) });
  }
  const closedOwnerMilestone = {
    render: "G5-M7",
    migration: "G5-M8",
    e2e: "G5-M3_TO_M8",
  }[scope];
  const ownerClosed = checks.length > 0 && checks.every((check) => check.passed);
  const redGates = manifest.redGates.filter((gate: { scope: string; ownerMilestone: string }) =>
    gate.scope === scope && !(ownerClosed && gate.ownerMilestone === closedOwnerMilestone));
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
