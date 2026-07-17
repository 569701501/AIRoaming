import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileImagePromptBaseline,
  parseImagePromptBaselineSuite,
} from "./image-prompt-baseline.util.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const defaultFixture = fileURLToPath(new URL("../../../../tests/fixtures/image-prompt/s4-baseline-v1.json", import.meta.url));
  const fixturePath = path.resolve(arg("--fixture") ?? defaultFixture);
  const outputPath = arg("--output") ? path.resolve(arg("--output")!) : null;
  const suite = parseImagePromptBaselineSuite(JSON.parse(await readFile(fixturePath, "utf8")) as unknown);
  const report = compileImagePromptBaseline(suite);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    suiteId: report.suiteId,
    fixturePath,
    outputPath,
    summary: report.summary,
  }, null, 2)}\n`);
  if (!report.summary.passed) process.exitCode = 1;
}

await main();
