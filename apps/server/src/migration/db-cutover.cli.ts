import { DbCutoverError, DbCutoverService } from "./db-cutover.service.js";
import type { CutoverEvidenceStep } from "./cutover-evidence.service.js";
import { createCutoverAction } from "./cutover-runner.service.js";

const VALUE_FLAGS = new Set(["--plan", "--evidence-root", "--step", "--authorization-file", "--format"]);
function parse(args: readonly string[]) {
  const values: Record<string, string> = {}; let command: "status" | "step" | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (i === 0 && (flag === "status" || flag === "step")) { if (command) throw new DbCutoverError("CUTOVER_ARGS_INVALID"); command = flag; continue; }
    if (!VALUE_FLAGS.has(flag) || values[flag] !== undefined) throw new DbCutoverError("CUTOVER_ARGS_INVALID");
    const value = args[++i]; if (!value || value.startsWith("--")) throw new DbCutoverError("CUTOVER_ARGS_INVALID"); values[flag] = value;
  }
  if (!command || values["--plan"] === undefined || values["--evidence-root"] === undefined || values["--format"] !== "json") throw new DbCutoverError("CUTOVER_ARGS_INVALID");
  if (command === "step" && values["--step"] === undefined) throw new DbCutoverError("CUTOVER_ARGS_INVALID");
  if (command === "step" && !["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"].includes(values["--step"])) throw new DbCutoverError("CUTOVER_STEP_INVALID");
  return { command, values };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2); const { command, values } = parse(argv[0] === "--" ? argv.slice(1) : argv); const service = new DbCutoverService();
  if (command === "status") { process.stdout.write(`${JSON.stringify(await service.status(values["--plan"], values["--evidence-root"]))}\n`); return 0; }
  const step = values["--step"] as CutoverEvidenceStep;
  const action = createCutoverAction(step, values["--authorization-file"]);
  const result = await service.runStep(values["--plan"], values["--evidence-root"], step, action, values["--authorization-file"]);
  process.stdout.write(`${JSON.stringify(result)}\n`); return 0;
}

main().catch((error: unknown) => { const code = error instanceof Error && "code" in error ? String((error as Error & { code: unknown }).code) : "CUTOVER_FAILED"; process.stderr.write(`${code}\n`); process.exitCode = 1; });
