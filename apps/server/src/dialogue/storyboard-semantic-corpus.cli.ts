import "reflect-metadata";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import type { AIRuntimeModelSelection } from "@airoaming/shared";
import { AppModule } from "../app.module.js";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import {
  compareStoryboardSemanticEvaluation,
  loadStoryboardSemanticCorpus,
  summarizeStoryboardSemanticCorpusRuns,
  type StoryboardSemanticCorpusRun,
} from "./storyboard-semantic-corpus.util.js";
import {
  buildStoryboardSemanticEvaluationPrompt,
  parseStoryboardSemanticEvaluation,
  StoryboardSemanticEvaluationContractError,
} from "./storyboard-semantic-evaluation.util.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`STORYBOARD_SEMANTIC_CORPUS_ARG_REQUIRED:${name}`);
  return value;
}

function repeatCount(): number {
  const raw = arg("--repeat") ?? "1";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("STORYBOARD_SEMANTIC_CORPUS_REPEAT_INVALID");
  }
  return value;
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

function failureCode(error: unknown): string {
  if (error instanceof StoryboardSemanticEvaluationContractError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error && error.name ? error.name : "STORYBOARD_SEMANTIC_CORPUS_RUN_FAILED";
}

async function main(): Promise<void> {
  const corpusPath = required("--corpus");
  const outputPath = required("--output");
  const repeat = repeatCount();
  const loadedCorpus = await loadStoryboardSemanticCorpus(path.resolve(corpusPath));
  const selectedFixtureId = arg("--fixture");
  const corpus = selectedFixtureId
    ? { ...loadedCorpus, cases: loadedCorpus.cases.filter((fixture) => fixture.fixtureId === selectedFixtureId) }
    : loadedCorpus;
  if (corpus.cases.length === 0) {
    throw new Error(`STORYBOARD_SEMANTIC_CORPUS_FIXTURE_UNKNOWN:${selectedFixtureId}`);
  }
  const prompts = corpus.cases.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    prompt: buildStoryboardSemanticEvaluationPrompt(fixture.structure, fixture.storyboard),
  }));

  if (process.argv.includes("--dry-run")) {
    const result = {
      schemaVersion: 1,
      mode: "dry-run",
      corpusId: corpus.corpusId,
      selectedFixtureId: selectedFixtureId ?? null,
      repeat,
      caseCount: corpus.cases.length,
      cases: prompts.map((item) => ({
        fixtureId: item.fixtureId,
        promptChars: item.prompt.length,
        prompt: item.prompt,
      })),
    };
    await writePrivateAtomic(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      code: "STORYBOARD_SEMANTIC_CORPUS_DRY_RUN",
      output: path.resolve(outputPath),
      corpusId: corpus.corpusId,
      caseCount: corpus.cases.length,
      repeat,
    })}\n`);
    return;
  }

  const providerId = arg("--provider");
  const modelId = arg("--model");
  if (Boolean(providerId) !== Boolean(modelId)) {
    throw new Error("STORYBOARD_SEMANTIC_CORPUS_MODEL_ARGS_INCOMPLETE");
  }
  const requestedModel: AIRuntimeModelSelection | undefined = providerId && modelId
    ? { providerId, modelId }
    : undefined;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const runs: StoryboardSemanticCorpusRun[] = [];
  try {
    const runtime = app.get(OpenCodeRuntimeService);
    for (let repeatIndex = 1; repeatIndex <= repeat; repeatIndex += 1) {
      for (let caseIndex = 0; caseIndex < corpus.cases.length; caseIndex += 1) {
        const fixture = corpus.cases[caseIndex]!;
        const prompt = prompts[caseIndex]!.prompt;
        try {
          const sessionId = await runtime.createSession(
            `AI漫游 · 分镜语义固定样例 · ${fixture.fixtureId} · ${repeatIndex}`,
          );
          const response = await runtime.sendMessage({ sessionId, content: prompt, model: requestedModel });
          const report = parseStoryboardSemanticEvaluation(response.content, fixture.structure, fixture.storyboard);
          runs.push({
            fixtureId: fixture.fixtureId,
            repeatIndex,
            status: "completed",
            report,
            comparison: compareStoryboardSemanticEvaluation(fixture.expected, report),
            providerId: response.model.providerId,
            modelId: response.model.modelId,
          });
        } catch (error) {
          runs.push({
            fixtureId: fixture.fixtureId,
            repeatIndex,
            status: error instanceof StoryboardSemanticEvaluationContractError ? "contract_failed" : "runtime_failed",
            errorCode: failureCode(error),
            issues: error instanceof StoryboardSemanticEvaluationContractError ? [...error.issues] : undefined,
          });
        }
      }
    }
  } finally {
    await app.close();
  }

  const summary = summarizeStoryboardSemanticCorpusRuns(corpus, runs, repeat);
  const result = {
    schemaVersion: 1,
    mode: "model",
    corpusId: corpus.corpusId,
    selectedFixtureId: selectedFixtureId ?? null,
    generatedAt: new Date().toISOString(),
    repeat,
    requestedModel: requestedModel ?? null,
    runs,
    summary,
  };
  await writePrivateAtomic(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  const code = summary.failedRuns > 0 || summary.unattemptedRuns > 0
    ? "STORYBOARD_SEMANTIC_CORPUS_PARTIAL"
    : "STORYBOARD_SEMANTIC_CORPUS_OK";
  process.stdout.write(`${JSON.stringify({ code, output: path.resolve(outputPath), corpusId: corpus.corpusId, summary })}\n`);
  if (code !== "STORYBOARD_SEMANTIC_CORPUS_OK") process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "STORYBOARD_SEMANTIC_CORPUS_FAILED"}\n`);
  process.exitCode = 1;
});
