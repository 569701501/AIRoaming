import { describe, expect, it } from "vitest";
import {
  compareStoryboardSemanticEvaluation,
  loadStoryboardSemanticCorpus,
  parseStoryboardSemanticCorpus,
  summarizeStoryboardSemanticCorpusRuns,
  type StoryboardSemanticCorpusRun,
} from "./storyboard-semantic-corpus.util.js";

const CORPUS_PATH = new URL(
  "../../../../tests/fixtures/storyboard-semantic/corpus.json",
  import.meta.url,
);

describe("分镜 Beat 语义固定样例集", () => {
  it("加载不少于 5 个固定样例，并覆盖不同题材、Beat 密度和关键事实类型", async () => {
    const corpus = await loadStoryboardSemanticCorpus(CORPUS_PATH);

    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(5);
    expect(new Set(corpus.cases.map((item) => item.genre)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(corpus.cases.map((item) => item.structure.beats.length)).size).toBeGreaterThanOrEqual(3);
    const tags = new Set(corpus.cases.flatMap((item) => item.coverageTags));
    expect(tags).toEqual(expect.objectContaining(new Set([
      "声音触发",
      "屏幕信息",
      "身份识别",
      "对白选择",
      "动作结果",
      "状态变化",
    ])));
  });

  it("所有人工预期都通过现有严格报告契约，整体覆盖四种语义状态", async () => {
    const corpus = await loadStoryboardSemanticCorpus(CORPUS_PATH);
    const statuses = new Set(corpus.cases.flatMap((item) => item.expected.beats.flatMap((beat) => [
      beat.summaryStatus,
      beat.outcomeStatus,
    ])));

    expect(statuses).toEqual(new Set(["covered", "partial", "missing", "contradicted"]));
    expect(corpus.cases.some((item) => item.expected.overallStatus === "pass")).toBe(true);
    expect(corpus.cases.some((item) => item.expected.overallStatus === "warning")).toBe(true);
    expect(corpus.cases.some((item) => item.expected.overallStatus === "fail")).toBe(true);
  });

  it("拒绝顶层或样例额外字段、重复样例和章节/Beat 关系错位", async () => {
    const corpus = await loadStoryboardSemanticCorpus(CORPUS_PATH);
    const base = JSON.parse(JSON.stringify({
      schemaVersion: corpus.schemaVersion,
      corpusId: corpus.corpusId,
      cases: corpus.cases.map((item) => ({
        fixtureId: item.fixtureId,
        genre: item.genre,
        coverageTags: item.coverageTags,
        structure: item.structure,
        storyboard: item.storyboard,
        expected: { beats: item.expected.beats },
      })),
    })) as Record<string, unknown>;

    expect(() => parseStoryboardSemanticCorpus({ ...base, unexpected: true })).toThrowError(/UNKNOWN_FIELD:root.unexpected/);

    const unexpectedCaseField = JSON.parse(JSON.stringify(base)) as { cases: Array<Record<string, unknown>> };
    unexpectedCaseField.cases[0]!.unexpected = true;
    expect(() => parseStoryboardSemanticCorpus(unexpectedCaseField))
      .toThrowError(/UNKNOWN_FIELD:cases\[0\].unexpected/);

    const duplicate = JSON.parse(JSON.stringify(base)) as { cases: Array<Record<string, unknown>> };
    duplicate.cases.push(duplicate.cases[0]!);
    expect(() => parseStoryboardSemanticCorpus(duplicate)).toThrowError(/FIXTURE_ID_DUPLICATE/);

    const chapterMismatch = JSON.parse(JSON.stringify(base)) as {
      cases: Array<{ storyboard: { chapterId: string } }>;
    };
    chapterMismatch.cases[0]!.storyboard.chapterId = "wrong-chapter";
    expect(() => parseStoryboardSemanticCorpus(chapterMismatch)).toThrowError(/CHAPTER_ID_MISMATCH/);

    const beatMismatch = JSON.parse(JSON.stringify(base)) as {
      cases: Array<{ storyboard: { shots: Array<{ beatId: string }> } }>;
    };
    beatMismatch.cases[0]!.storyboard.shots[0]!.beatId = "unknown-beat";
    expect(() => parseStoryboardSemanticCorpus(beatMismatch)).toThrowError(/SHOT_BEAT_UNKNOWN/);
  });

  it("逐 Beat 比较模型结果与人工预期，不用 overallStatus 代替维度判断", async () => {
    const corpus = await loadStoryboardSemanticCorpus(CORPUS_PATH);
    const sample = corpus.cases[0]!;
    const actual = structuredClone(sample.expected);
    actual.beats[0]!.summaryStatus = actual.beats[0]!.summaryStatus === "covered" ? "partial" : "covered";

    const comparison = compareStoryboardSemanticEvaluation(sample.expected, actual);

    expect(comparison.totalDimensions).toBe(sample.structure.beats.length * 2);
    expect(comparison.matchedDimensions).toBe(comparison.totalDimensions - 1);
    expect(comparison.dimensionMismatches).toHaveLength(1);
    expect(comparison.dimensionMismatches[0]).toMatchObject({
      beatId: sample.structure.beats[0]!.id,
      dimension: "summary",
    });
  });

  it("汇总时分别计算人工预期一致率和两轮模型稳定率，并保留失败运行", async () => {
    const corpus = await loadStoryboardSemanticCorpus(CORPUS_PATH);
    const sample = corpus.cases[0]!;
    const changed = structuredClone(sample.expected);
    changed.beats[0]!.outcomeStatus = changed.beats[0]!.outcomeStatus === "covered" ? "partial" : "covered";
    const runs: StoryboardSemanticCorpusRun[] = [
      { fixtureId: sample.fixtureId, repeatIndex: 1, status: "completed", report: sample.expected },
      { fixtureId: sample.fixtureId, repeatIndex: 2, status: "completed", report: changed },
      { fixtureId: corpus.cases[1]!.fixtureId, repeatIndex: 1, status: "contract_failed", errorCode: "BROKEN" },
    ];

    const summary = summarizeStoryboardSemanticCorpusRuns(corpus, runs, 2);
    const dimensions = sample.structure.beats.length * 2;

    expect(summary).toMatchObject({
      caseCount: corpus.cases.length,
      requestedRuns: corpus.cases.length * 2,
      completedRuns: 2,
      failedRuns: 1,
      expectedAgreement: {
        matchedDimensions: dimensions * 2 - 1,
        totalDimensions: dimensions * 2,
      },
      repeatStability: {
        stableDimensions: dimensions - 1,
        comparableDimensions: dimensions,
      },
    });
    expect(summary.caseSummaries.find((item) => item.fixtureId === corpus.cases[1]!.fixtureId))
      .toMatchObject({ failedRuns: 1 });
  });
});
