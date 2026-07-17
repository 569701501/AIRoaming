import "reflect-metadata";
import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import {
  serializeChapterScriptMarkdownV1,
  type AIRuntimeModelSelection,
  type ChapterScriptDocumentV1,
  type SendDialogueMessageRequest,
  type StoryboardJson,
  type StoryStructureJson,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import { AppModule } from "../app.module.js";
import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import type { DialogueTurn } from "./dialogue-types.js";
import {
  buildStoryboardPrompt,
  buildStoryboardRepairPrompt,
  type StoryboardPromptVariant,
} from "./dialogue-prompt.util.js";
import { parseStoryboardJson } from "./dialogue-json.util.js";
import {
  buildStoryboardDialogueReference,
  type StoryboardDialogueReference,
} from "./storyboard-dialogue-reference.util.js";
import { assertStoryboardQuality, StoryboardQualityError } from "./storyboard-quality.util.js";
import {
  buildStoryboardSemanticEvaluationPrompt,
  parseStoryboardSemanticEvaluation,
  StoryboardSemanticEvaluationContractError,
  type StoryboardSemanticCoverageStatus,
  type StoryboardSemanticEvaluationReport,
} from "./storyboard-semantic-evaluation.util.js";

type SemanticDimensionField = "summary" | "outcome";

interface PromptAbDimension {
  beatId: string;
  field: SemanticDimensionField;
  label: string;
}

interface PromptAbCase {
  caseId: string;
  title: string;
  targetRisk: "causal_trigger" | "identity_conclusion" | "action_outcome";
  project: {
    name: string;
    storyTitle: string;
    comicFormat: "vertical_scroll" | "paged_comic";
    artStyle: string;
  };
  chapter: { id: string; title: string };
  scriptDocument: ChapterScriptDocumentV1;
  structure: StoryStructureJson;
  request: string;
  targetDimensions: PromptAbDimension[];
  observationDimensions: PromptAbDimension[];
}

interface PromptAbSuite {
  schemaVersion: 1;
  suiteId: string;
  cases: PromptAbCase[];
}

interface StoryboardMetrics {
  shotCount: number;
  totalDurationMs: number;
  totalVoiceLines: number;
  maxVoiceLinesPerShot: number;
  shotsOverThreeVoiceLines: number;
  shotsOverTenSeconds: number;
}

interface GenerationRun {
  status: "completed" | "failed";
  variant: StoryboardPromptVariant;
  providerId?: string;
  modelId?: string;
  generationAttempts: number;
  repaired: boolean;
  errorCode?: string;
  issues?: readonly string[];
  prompt: string;
  rawOutputs: string[];
  storyboard?: StoryboardJson;
  metrics?: StoryboardMetrics;
  evaluations: Array<{
    repeatIndex: number;
    status: "completed" | "failed";
    attempts: number;
    errorCode?: string;
    issues?: readonly string[];
    report?: StoryboardSemanticEvaluationReport;
  }>;
}

const VARIANTS: readonly StoryboardPromptVariant[] = ["v2_3", "v2_5_experiment"];
const STATUS_SCORE: Record<StoryboardSemanticCoverageStatus, number> = {
  contradicted: 0,
  missing: 1,
  partial: 2,
  covered: 3,
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`STORYBOARD_PROMPT_AB_ARG_REQUIRED:${name}`);
  return value;
}

function repeatCount(): number {
  const raw = arg("--evaluation-repeat") ?? "2";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("STORYBOARD_PROMPT_AB_REPEAT_INVALID");
  }
  return value;
}

function asRecord(value: unknown, pathLabel: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`STORYBOARD_PROMPT_AB_OBJECT_REQUIRED:${pathLabel}`);
  }
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, pathLabel: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`STORYBOARD_PROMPT_AB_STRING_REQUIRED:${pathLabel}`);
  }
  return value.trim();
}

function parseDimension(value: unknown, pathLabel: string): PromptAbDimension {
  const row = asRecord(value, pathLabel);
  const field = nonEmpty(row.field, `${pathLabel}.field`);
  if (field !== "summary" && field !== "outcome") {
    throw new Error(`STORYBOARD_PROMPT_AB_DIMENSION_FIELD:${pathLabel}.field`);
  }
  return {
    beatId: nonEmpty(row.beatId, `${pathLabel}.beatId`),
    field,
    label: nonEmpty(row.label, `${pathLabel}.label`),
  };
}

function parseSuite(value: unknown): PromptAbSuite {
  const root = asRecord(value, "root");
  if (root.schemaVersion !== 1) throw new Error("STORYBOARD_PROMPT_AB_SCHEMA_VERSION");
  if (!Array.isArray(root.cases) || root.cases.length < 3) {
    throw new Error("STORYBOARD_PROMPT_AB_CASES_MIN_THREE");
  }
  const cases = root.cases.map((caseValue, index): PromptAbCase => {
    const row = asRecord(caseValue, `cases[${index}]`);
    const project = asRecord(row.project, `cases[${index}].project`);
    const chapter = asRecord(row.chapter, `cases[${index}].chapter`);
    const structure = asRecord(row.structure, `cases[${index}].structure`) as unknown as StoryStructureJson;
    const scriptDocument = row.scriptDocument as ChapterScriptDocumentV1;
    serializeChapterScriptMarkdownV1(scriptDocument);
    if (!Array.isArray(structure.beats) || structure.beats.length === 0) {
      throw new Error(`STORYBOARD_PROMPT_AB_BEATS_REQUIRED:cases[${index}]`);
    }
    const targetRisk = nonEmpty(row.targetRisk, `cases[${index}].targetRisk`);
    if (!["causal_trigger", "identity_conclusion", "action_outcome"].includes(targetRisk)) {
      throw new Error(`STORYBOARD_PROMPT_AB_TARGET_RISK:cases[${index}]`);
    }
    if (!Array.isArray(row.targetDimensions) || row.targetDimensions.length === 0) {
      throw new Error(`STORYBOARD_PROMPT_AB_TARGET_DIMENSIONS:cases[${index}]`);
    }
    const targetDimensions = row.targetDimensions.map((item, dimensionIndex) =>
      parseDimension(item, `cases[${index}].targetDimensions[${dimensionIndex}]`));
    const observationDimensions = Array.isArray(row.observationDimensions)
      ? row.observationDimensions.map((item, dimensionIndex) =>
        parseDimension(item, `cases[${index}].observationDimensions[${dimensionIndex}]`))
      : [];
    const beatIds = new Set(structure.beats.map((beat) => beat.id));
    for (const dimension of [...targetDimensions, ...observationDimensions]) {
      if (!beatIds.has(dimension.beatId)) {
        throw new Error(`STORYBOARD_PROMPT_AB_DIMENSION_BEAT_UNKNOWN:${dimension.beatId}`);
      }
    }
    const comicFormat = nonEmpty(project.comicFormat, `cases[${index}].project.comicFormat`);
    if (comicFormat !== "vertical_scroll" && comicFormat !== "paged_comic") {
      throw new Error(`STORYBOARD_PROMPT_AB_COMIC_FORMAT:cases[${index}]`);
    }
    return {
      caseId: nonEmpty(row.caseId, `cases[${index}].caseId`),
      title: nonEmpty(row.title, `cases[${index}].title`),
      targetRisk: targetRisk as PromptAbCase["targetRisk"],
      project: {
        name: nonEmpty(project.name, `cases[${index}].project.name`),
        storyTitle: nonEmpty(project.storyTitle, `cases[${index}].project.storyTitle`),
        comicFormat,
        artStyle: nonEmpty(project.artStyle, `cases[${index}].project.artStyle`),
      },
      chapter: {
        id: nonEmpty(chapter.id, `cases[${index}].chapter.id`),
        title: nonEmpty(chapter.title, `cases[${index}].chapter.title`),
      },
      scriptDocument,
      structure,
      request: nonEmpty(row.request, `cases[${index}].request`),
      targetDimensions,
      observationDimensions,
    };
  });
  if (new Set(cases.map((fixture) => fixture.caseId)).size !== cases.length) {
    throw new Error("STORYBOARD_PROMPT_AB_CASE_ID_DUPLICATE");
  }
  return { schemaVersion: 1, suiteId: nonEmpty(root.suiteId, "root.suiteId"), cases };
}

async function loadSuite(filePath: string): Promise<PromptAbSuite> {
  return parseSuite(JSON.parse(await readFile(filePath, "utf8")) as unknown);
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

function makeTurn(fixture: PromptAbCase, sourceText: string): DialogueTurn {
  const snapshot = {
    project: fixture.project,
    characters: [],
    currentChapter: {
      id: fixture.chapter.id,
      title: fixture.chapter.title,
      status: "structured",
      currentStoryVersionId: fixture.structure.sourceScriptVersionId ?? "story-version-fixture",
      sourceText,
    },
    storyStructure: {
      id: fixture.structure.sourceScriptVersionId ?? "story-version-fixture",
      structureJson: fixture.structure,
    },
  } as unknown as WorkbenchSnapshot;
  return { snapshot } as DialogueTurn;
}

function metricsOf(storyboard: StoryboardJson): StoryboardMetrics {
  const voiceCounts = storyboard.shots.map((shot) => shot.motion.voiceLines.length);
  return {
    shotCount: storyboard.shots.length,
    totalDurationMs: storyboard.shots.reduce((total, shot) => total + shot.motion.durationMs, 0),
    totalVoiceLines: voiceCounts.reduce((total, count) => total + count, 0),
    maxVoiceLinesPerShot: Math.max(0, ...voiceCounts),
    shotsOverThreeVoiceLines: voiceCounts.filter((count) => count > 3).length,
    shotsOverTenSeconds: storyboard.shots.filter((shot) => shot.motion.durationMs > 10_000).length,
  };
}

function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error && error.name ? error.name : "STORYBOARD_PROMPT_AB_FAILED";
}

function issuesOf(error: unknown): readonly string[] | undefined {
  if (error instanceof StoryboardQualityError || error instanceof StoryboardSemanticEvaluationContractError) {
    return error.issues;
  }
  return undefined;
}

function validateGenerated(
  content: string,
  fixture: PromptAbCase,
  dialogueReference: StoryboardDialogueReference,
): StoryboardJson {
  const storyboard = parseStoryboardJson(
    content,
    fixture.chapter.id,
    fixture.chapter.title,
    fixture.structure.sourceScriptVersionId ?? "story-version-fixture",
  );
  assertStoryboardQuality(storyboard, fixture.structure, dialogueReference);
  return storyboard;
}

async function evaluateStoryboard(
  runtime: OpenCodeRuntimeService,
  fixture: PromptAbCase,
  storyboard: StoryboardJson,
  requestedModel: AIRuntimeModelSelection | undefined,
  repeatIndex: number,
): Promise<GenerationRun["evaluations"][number]> {
  const prompt = buildStoryboardSemanticEvaluationPrompt(fixture.structure, storyboard);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const sessionId = await runtime.createSession(
        `AI漫游 · 分镜 Prompt A/B · ${fixture.caseId} · evaluator-${repeatIndex}-${attempt}`,
      );
      const response = await runtime.sendMessage({ sessionId, content: prompt, model: requestedModel });
      return {
        repeatIndex,
        status: "completed",
        attempts: attempt,
        report: parseStoryboardSemanticEvaluation(response.content, fixture.structure, storyboard),
      };
    } catch (error) {
      lastError = error;
      if (!(error instanceof StoryboardSemanticEvaluationContractError)) break;
    }
  }
  return {
    repeatIndex,
    status: "failed",
    attempts: lastError instanceof StoryboardSemanticEvaluationContractError ? 2 : 1,
    errorCode: failureCode(lastError),
    issues: issuesOf(lastError),
  };
}

async function generate(
  runtime: OpenCodeRuntimeService,
  fixture: PromptAbCase,
  variant: StoryboardPromptVariant,
  requestedModel: AIRuntimeModelSelection | undefined,
  evaluationRepeat: number,
): Promise<GenerationRun> {
  const sourceText = serializeChapterScriptMarkdownV1(fixture.scriptDocument);
  const turn = makeTurn(fixture, sourceText);
  const request: SendDialogueMessageRequest = { content: fixture.request, context: { sourceText } };
  const dialogueReference = buildStoryboardDialogueReference(sourceText, fixture.structure);
  const prompt = buildStoryboardPrompt(turn, request, "generate", dialogueReference, variant);
  const rawOutputs: string[] = [];
  let providerId: string | undefined;
  let modelId: string | undefined;
  let storyboard: StoryboardJson;
  let generationAttempts = 1;
  try {
    const sessionId = await runtime.createSession(`AI漫游 · 分镜 Prompt A/B · ${fixture.caseId} · ${variant}`);
    const first = await runtime.sendMessage({ sessionId, content: prompt, model: requestedModel });
    providerId = first.model.providerId;
    modelId = first.model.modelId;
    rawOutputs.push(first.content);
    try {
      storyboard = validateGenerated(first.content, fixture, dialogueReference);
    } catch (firstError) {
      generationAttempts = 2;
      const repaired = await runtime.sendMessage({
        sessionId,
        model: requestedModel,
        content: buildStoryboardRepairPrompt({
          originalPrompt: prompt,
          invalidOutput: first.content,
          validationError: firstError instanceof Error ? firstError.message : "unknown",
          qualityIssues: issuesOf(firstError),
          mode: "generate",
        }),
      });
      rawOutputs.push(repaired.content);
      storyboard = validateGenerated(repaired.content, fixture, dialogueReference);
    }
  } catch (error) {
    return {
      status: "failed",
      variant,
      providerId,
      modelId,
      generationAttempts,
      repaired: generationAttempts > 1,
      errorCode: failureCode(error),
      issues: issuesOf(error),
      prompt,
      rawOutputs,
      evaluations: [],
    };
  }
  const evaluations: GenerationRun["evaluations"] = [];
  for (let repeatIndex = 1; repeatIndex <= evaluationRepeat; repeatIndex += 1) {
    evaluations.push(await evaluateStoryboard(runtime, fixture, storyboard, requestedModel, repeatIndex));
  }
  return {
    status: "completed",
    variant,
    providerId,
    modelId,
    generationAttempts,
    repaired: generationAttempts > 1,
    prompt,
    rawOutputs,
    storyboard,
    metrics: metricsOf(storyboard),
    evaluations,
  };
}

function statusesFor(run: GenerationRun, dimension: PromptAbDimension): StoryboardSemanticCoverageStatus[] {
  return run.evaluations.flatMap((evaluation) => {
    const beat = evaluation.report?.beats.find((item) => item.beatId === dimension.beatId);
    if (!beat) return [];
    return [dimension.field === "summary" ? beat.summaryStatus : beat.outcomeStatus];
  });
}

function worstScore(statuses: readonly StoryboardSemanticCoverageStatus[]): number | null {
  return statuses.length > 0 ? Math.min(...statuses.map((status) => STATUS_SCORE[status])) : null;
}

function buildDecision(suite: PromptAbSuite, results: Array<{ fixture: PromptAbCase; runs: GenerationRun[] }>) {
  let improvedCases = 0;
  let regressedDimensions = 0;
  let metricBreaches = 0;
  let failedRuns = 0;
  const cases = results.map(({ fixture, runs }) => {
    const control = runs.find((run) => run.variant === "v2_3");
    const experiment = runs.find((run) => run.variant === "v2_5_experiment");
    if (!control || !experiment || control.status !== "completed" || experiment.status !== "completed") {
      failedRuns += [control, experiment].filter((run) => !run || run.status !== "completed").length;
      return { caseId: fixture.caseId, status: "incomplete" };
    }
    const dimensions = fixture.targetDimensions.map((dimension) => {
      const controlStatuses = statusesFor(control, dimension);
      const experimentStatuses = statusesFor(experiment, dimension);
      const controlWorst = worstScore(controlStatuses);
      const experimentWorst = worstScore(experimentStatuses);
      const delta = controlWorst === null || experimentWorst === null ? null : experimentWorst - controlWorst;
      if (delta !== null && delta < 0) regressedDimensions += 1;
      return { ...dimension, controlStatuses, experimentStatuses, delta };
    });
    const improved = dimensions.some((dimension) => (dimension.delta ?? 0) > 0)
      && dimensions.every((dimension) => dimension.delta !== null && dimension.delta >= 0);
    if (improved) improvedCases += 1;
    const controlMetrics = control.metrics!;
    const experimentMetrics = experiment.metrics!;
    const limits = {
      shotCount: Math.max(controlMetrics.shotCount + 1, Math.ceil(controlMetrics.shotCount * 1.08)),
      totalDurationMs: Math.max(controlMetrics.totalDurationMs + 8_000, Math.ceil(controlMetrics.totalDurationMs * 1.08)),
      maxVoiceLinesPerShot: controlMetrics.maxVoiceLinesPerShot,
      shotsOverThreeVoiceLines: controlMetrics.shotsOverThreeVoiceLines,
      shotsOverTenSeconds: controlMetrics.shotsOverTenSeconds,
    };
    const metricPass = experimentMetrics.shotCount <= limits.shotCount
      && experimentMetrics.totalDurationMs <= limits.totalDurationMs
      && experimentMetrics.maxVoiceLinesPerShot <= limits.maxVoiceLinesPerShot
      && experimentMetrics.shotsOverThreeVoiceLines <= limits.shotsOverThreeVoiceLines
      && experimentMetrics.shotsOverTenSeconds <= limits.shotsOverTenSeconds;
    if (!metricPass) metricBreaches += 1;
    const observations = fixture.observationDimensions.map((dimension) => ({
      ...dimension,
      controlStatuses: statusesFor(control, dimension),
      experimentStatuses: statusesFor(experiment, dimension),
    }));
    return {
      caseId: fixture.caseId,
      status: "completed",
      improved,
      dimensions,
      observations,
      controlMetrics,
      experimentMetrics,
      limits,
      metricPass,
    };
  });
  const adoptable = failedRuns === 0
    && improvedCases >= 2
    && regressedDimensions === 0
    && metricBreaches === 0;
  return {
    suiteId: suite.suiteId,
    decision: adoptable ? "adopt_candidate" : "do_not_adopt",
    adoptable,
    improvedCases,
    requiredImprovedCases: 2,
    regressedDimensions,
    metricBreaches,
    failedRuns,
    cases,
  };
}

async function main(): Promise<void> {
  const fixturePath = path.resolve(required("--fixture"));
  const outputPath = path.resolve(required("--output"));
  const evaluationRepeat = repeatCount();
  const suite = await loadSuite(fixturePath);
  const selectedCaseId = arg("--case");
  const selectedCases = selectedCaseId
    ? suite.cases.filter((fixture) => fixture.caseId === selectedCaseId)
    : suite.cases;
  if (selectedCases.length === 0) throw new Error(`STORYBOARD_PROMPT_AB_CASE_UNKNOWN:${selectedCaseId}`);
  const providerId = arg("--provider");
  const modelId = arg("--model");
  if (Boolean(providerId) !== Boolean(modelId)) throw new Error("STORYBOARD_PROMPT_AB_MODEL_ARGS_INCOMPLETE");
  const requestedModel = providerId && modelId ? { providerId, modelId } : undefined;

  if (process.argv.includes("--dry-run")) {
    const cases = selectedCases.map((fixture) => {
      const sourceText = serializeChapterScriptMarkdownV1(fixture.scriptDocument);
      const dialogueReference = buildStoryboardDialogueReference(sourceText, fixture.structure);
      const turn = makeTurn(fixture, sourceText);
      const request: SendDialogueMessageRequest = { content: fixture.request, context: { sourceText } };
      return {
        caseId: fixture.caseId,
        beatCount: fixture.structure.beats.length,
        dialogueCandidateCount: dialogueReference.candidates.length,
        prompts: Object.fromEntries(VARIANTS.map((variant) => [
          variant,
          buildStoryboardPrompt(turn, request, "generate", dialogueReference, variant),
        ])),
      };
    });
    const output = { schemaVersion: 1, mode: "dry-run", suiteId: suite.suiteId, evaluationRepeat, cases };
    await writePrivateAtomic(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ code: "STORYBOARD_PROMPT_AB_DRY_RUN", output: outputPath, caseCount: cases.length })}\n`);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const results: Array<{ fixture: PromptAbCase; runs: GenerationRun[] }> = [];
  try {
    const runtime = app.get(OpenCodeRuntimeService);
    for (const fixture of selectedCases) {
      const runs: GenerationRun[] = [];
      process.stderr.write(`[storyboard-prompt-ab] case=${fixture.caseId} start\n`);
      for (const variant of VARIANTS) {
        process.stderr.write(`[storyboard-prompt-ab] case=${fixture.caseId} variant=${variant} start\n`);
        const run = await generate(runtime, fixture, variant, requestedModel, evaluationRepeat);
        runs.push(run);
        process.stderr.write(
          `[storyboard-prompt-ab] case=${fixture.caseId} variant=${variant} status=${run.status}`
          + `${run.metrics ? ` shots=${run.metrics.shotCount} durationMs=${run.metrics.totalDurationMs}` : ""}\n`,
        );
      }
      results.push({ fixture, runs });
    }
  } finally {
    await app.close();
  }
  const evaluatedSuite = { ...suite, cases: selectedCases };
  const decision = buildDecision(evaluatedSuite, results);
  const output = {
    schemaVersion: 1,
    mode: "model",
    suiteId: suite.suiteId,
    generatedAt: new Date().toISOString(),
    requestedModel: requestedModel ?? null,
    evaluationRepeat,
    results: results.map(({ fixture, runs }) => ({
      caseId: fixture.caseId,
      title: fixture.title,
      targetRisk: fixture.targetRisk,
      targetDimensions: fixture.targetDimensions,
      observationDimensions: fixture.observationDimensions,
      runs,
    })),
    decision,
  };
  await writePrivateAtomic(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ code: "STORYBOARD_PROMPT_AB_OK", output: outputPath, decision })}\n`);
  if (!decision.adoptable) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "STORYBOARD_PROMPT_AB_FAILED"}\n`);
  process.exitCode = 1;
});
