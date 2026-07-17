import "reflect-metadata";
import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import type { AIRuntimeModelSelection, StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import { AppModule } from "../app.module.js";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import {
  buildStoryboardSemanticEvaluationPrompt,
  parseStoryboardSemanticEvaluation,
} from "./storyboard-semantic-evaluation.util.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`STORYBOARD_SEMANTIC_EVALUATION_ARG_REQUIRED:${name}`);
  return value;
}

async function readJson<T>(filePath: string, arrayKey: string): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
  } catch {
    throw new Error(`STORYBOARD_SEMANTIC_EVALUATION_INPUT_INVALID:${filePath}`);
  }
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>)[arrayKey])) {
    throw new Error(`STORYBOARD_SEMANTIC_EVALUATION_INPUT_INVALID:${filePath}:${arrayKey}`);
  }
  return value as T;
}

async function writePrivateAtomic(filePath: string, content: string): Promise<void> {
  const target = path.resolve(filePath);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  await rename(temporary, target);
  try { await unlink(temporary); } catch { /* rename completed */ }
}

async function main(): Promise<void> {
  const structurePath = required("--structure");
  const storyboardPath = required("--storyboard");
  const outputPath = required("--output");
  const structure = await readJson<StoryStructureJson>(structurePath, "beats");
  const storyboard = await readJson<StoryboardJson>(storyboardPath, "shots");
  const prompt = buildStoryboardSemanticEvaluationPrompt(structure, storyboard);

  if (process.argv.includes("--dry-run")) {
    await writePrivateAtomic(outputPath, `${prompt}\n`);
    process.stdout.write(`${JSON.stringify({ code: "STORYBOARD_SEMANTIC_EVALUATION_DRY_RUN", output: path.resolve(outputPath), promptChars: prompt.length })}\n`);
    return;
  }

  const providerId = arg("--provider");
  const modelId = arg("--model");
  if (Boolean(providerId) !== Boolean(modelId)) {
    throw new Error("STORYBOARD_SEMANTIC_EVALUATION_MODEL_ARGS_INCOMPLETE");
  }
  const requestedModel: AIRuntimeModelSelection | undefined = providerId && modelId
    ? { providerId, modelId }
    : undefined;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const runtime = app.get(OpenCodeRuntimeService);
    const sessionId = await runtime.createSession("AI漫游 · 分镜 Beat 语义评测");
    const response = await runtime.sendMessage({ sessionId, content: prompt, model: requestedModel });
    const report = parseStoryboardSemanticEvaluation(response.content, structure, storyboard);
    await writePrivateAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      code: "STORYBOARD_SEMANTIC_EVALUATION_OK",
      output: path.resolve(outputPath),
      providerId: response.model.providerId,
      modelId: response.model.modelId,
      overallStatus: report.overallStatus,
      summary: report.summary,
    })}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "STORYBOARD_SEMANTIC_EVALUATION_FAILED"}\n`);
  process.exitCode = 1;
});
