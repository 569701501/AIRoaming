import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createE2EModeEnvironment,
  selectE2ETestMatrix,
} from "./e2e-test-matrix.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const playwrightPackage = require.resolve("@playwright/test/package.json");
const playwrightCli = path.join(path.dirname(playwrightPackage), "cli.js");
const inputArgs = process.argv.slice(2);
const modeArgument = inputArgs.find((argument) => argument.startsWith("--mode="));
const mode = modeArgument?.slice("--mode=".length);
const playwrightArgs = inputArgs.filter((argument) => argument !== modeArgument);

for (const entry of selectE2ETestMatrix(mode)) {
  process.stdout.write(`\n[e2e-matrix] mode=${entry.id} files=${entry.testFiles.length}\n`);
  const code = await runPlaywright(entry, playwrightArgs);
  if (code !== 0) process.exit(code);
}

function runPlaywright(entry, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, "test", ...entry.testFiles, ...args],
      {
        cwd: repoRoot,
        env: createE2EModeEnvironment(entry),
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) {
        reject(new Error(`E2E_MATRIX_CHILD_SIGNAL:${entry.id}:${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}
