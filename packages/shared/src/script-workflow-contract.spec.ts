import { describe, expect, it } from "vitest";
import {
  importFidelityHasHardIssuesV1,
  parseChapterScriptMarkdownV1,
  parseCreativeIdeationOutputV1,
  parseImportAnalysisOutputV1,
  parseImportFidelityOutputV1,
  parseScriptOutlineMarkdownV1,
  SCRIPT_WORKFLOW_STAGE_IDS,
  serializeChapterScriptMarkdownV1,
  serializeScriptOutlineMarkdownV1,
} from "./script-workflow-contract.js";
import {
  IMPORT_OUTPUT_LINE_REFS_V1,
  IMPORT_SOURCE_BLOCKS_V1,
  SCRIPT_WORKFLOW_STAGE_FIXTURES_V1,
  VALID_CHAPTER_SCRIPT_MARKDOWN_V1,
  VALID_CREATIVE_IDEATION_OUTPUT_V1,
  VALID_IMPORT_ANALYSIS_OUTPUT_V1,
  VALID_IMPORT_FIDELITY_OUTPUT_V1,
  VALID_SCRIPT_OUTLINE_MARKDOWN_V1,
} from "./script-workflow-test-fixtures.js";

type MutableFixture<T> = T extends string ? string
  : T extends number ? number
    : T extends boolean ? boolean
      : T extends readonly (infer Item)[] ? MutableFixture<Item>[]
        : T extends object ? { -readonly [Key in keyof T]: MutableFixture<T[Key]> }
          : T;

function clone<T>(value: T): MutableFixture<T> {
  return structuredClone(value) as MutableFixture<T>;
}

describe("creative.ideation strict contract", () => {
  it("accepts exactly three complete, distinct candidates", () => {
    const output = parseCreativeIdeationOutputV1(VALID_CREATIVE_IDEATION_OUTPUT_V1);
    expect(output.seeds).toHaveLength(3);
    expect(output.seeds[0]?.genreTags).toEqual(["都市奇幻", "悬疑"]);
  });

  it("rejects two/four candidates instead of slicing", () => {
    expect(() => parseCreativeIdeationOutputV1({ seeds: VALID_CREATIVE_IDEATION_OUTPUT_V1.seeds.slice(0, 2) })).toThrow(/exactly 3/);
    expect(() => parseCreativeIdeationOutputV1({ seeds: [...VALID_CREATIVE_IDEATION_OUTPUT_V1.seeds, VALID_CREATIVE_IDEATION_OUTPUT_V1.seeds[0]] })).toThrow(/exactly 3/);
  });

  it("rejects code fences and duplicate JSON keys", () => {
    expect(() => parseCreativeIdeationOutputV1(`\`\`\`json\n${JSON.stringify(VALID_CREATIVE_IDEATION_OUTPUT_V1)}\n\`\`\``)).toThrow(/code fences/);
    expect(() => parseCreativeIdeationOutputV1('{"seeds":[],"seeds":[]}')).toThrow(/duplicate object key/);
  });

  it("rejects unknown fields, duplicate titles and invalid tag counts", () => {
    const unknown = clone(VALID_CREATIVE_IDEATION_OUTPUT_V1) as Record<string, unknown>;
    unknown.readyForNextStage = true;
    expect(() => parseCreativeIdeationOutputV1(unknown)).toThrow(/unknown field/);

    const duplicate = clone(VALID_CREATIVE_IDEATION_OUTPUT_V1);
    duplicate.seeds[1]!.title = duplicate.seeds[0]!.title;
    expect(() => parseCreativeIdeationOutputV1(duplicate)).toThrow(/titles must be unique/);

    const badTags = clone(VALID_CREATIVE_IDEATION_OUTPUT_V1);
    badTags.seeds[0]!.genreTags = ["悬疑"];
    expect(() => parseCreativeIdeationOutputV1(badTags)).toThrow(/at least 2/);
  });
});

describe("creative.outline strict Markdown contract", () => {
  it("parses four fixed sections and lightweight chapter cards", () => {
    const document = parseScriptOutlineMarkdownV1(VALID_SCRIPT_OUTLINE_MARKDOWN_V1);
    expect(document.chapterCount).toBe(2);
    expect(document.chapterCards.map((card) => card.order)).toEqual([1, 2]);
    expect(document.chapterCards[0]?.majorTurn).toContain("父亲");
  });

  it("round-trips through the canonical serializer", () => {
    const parsed = parseScriptOutlineMarkdownV1(VALID_SCRIPT_OUTLINE_MARKDOWN_V1);
    const serialized = serializeScriptOutlineMarkdownV1(parsed);
    expect(parseScriptOutlineMarkdownV1(serialized)).toEqual(parsed);
  });

  it("rejects ranged counts, count/card mismatch, wrong order and placeholders", () => {
    expect(() => parseScriptOutlineMarkdownV1(VALID_SCRIPT_OUTLINE_MARKDOWN_V1.replace("剧集章数：2 章", "剧集章数：2～3 章"))).toThrow(/positive integer/);
    expect(() => parseScriptOutlineMarkdownV1(VALID_SCRIPT_OUTLINE_MARKDOWN_V1.replace("剧集章数：2 章", "剧集章数：3 章"))).toThrow(/3 chapter cards/);
    expect(() => parseScriptOutlineMarkdownV1(VALID_SCRIPT_OUTLINE_MARKDOWN_V1.replace("### 第 2 章：共同记忆", "### 第 3 章：共同记忆"))).toThrow(/contiguous/);
    expect(() => parseScriptOutlineMarkdownV1(VALID_SCRIPT_OUTLINE_MARKDOWN_V1.replace("都市奇幻、悬疑、成长", "待补充"))).toThrow(/placeholder/);
  });

  it("rejects explanatory prose before the first fixed section", () => {
    const prefaced = VALID_SCRIPT_OUTLINE_MARKDOWN_V1.replace("# 剧本大纲\n", "# 剧本大纲\n这是生成说明。\n");
    expect(() => parseScriptOutlineMarkdownV1(prefaced)).toThrow(/unexpected content before first section/);
  });
});

describe("chapter script strict Markdown contract", () => {
  it("parses the existing six visible sections and contiguous scenes", () => {
    const document = parseChapterScriptMarkdownV1(VALID_CHAPTER_SCRIPT_MARKDOWN_V1, { expectedChapterHeading: "第 1 章：拍卖夜" });
    expect(document.chapterOrder).toBe(1);
    expect(document.scenes).toHaveLength(2);
    expect(document.scenes[1]?.dialogue).toContain("你还是来了");
  });

  it("round-trips through the canonical serializer", () => {
    const parsed = parseChapterScriptMarkdownV1(VALID_CHAPTER_SCRIPT_MARKDOWN_V1);
    const serialized = serializeChapterScriptMarkdownV1(parsed);
    expect(parseChapterScriptMarkdownV1(serialized)).toEqual(parsed);
  });

  it("rejects duplicate/missing sections, wrong fields and non-contiguous scenes", () => {
    const duplicate = VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("### 六、本章结尾", "### 五、剧本正文\n\n### 六、本章结尾");
    expect(() => parseChapterScriptMarkdownV1(duplicate)).toThrow(/exactly 6 sections/);
    expect(() => parseChapterScriptMarkdownV1(VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("情绪走向：", "情绪变化："))).toThrow(/情绪走向/);
    expect(() => parseChapterScriptMarkdownV1(VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("#### 场景 2：记忆拍卖厅", "#### 场景 3：记忆拍卖厅"))).toThrow(/contiguous/);
  });

  it("rejects title mismatch, template residue and import system references", () => {
    expect(() => parseChapterScriptMarkdownV1(VALID_CHAPTER_SCRIPT_MARKDOWN_V1, { expectedChapterHeading: "第 2 章：共同记忆" })).toThrow(/expected 第 2 章/);
    expect(() => parseChapterScriptMarkdownV1(VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("潮湿、拥挤、危险", "待补充"))).toThrow(/placeholder/);
    const leaked = VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("林夏沿维护梯逆向攀爬", "blockRef=block-000001；林夏沿维护梯逆向攀爬");
    expect(() => parseChapterScriptMarkdownV1(leaked, { mode: "import" })).toThrow(/system state/);
  });

  it("rejects explanatory prose before the chapter heading", () => {
    const prefaced = VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("# 章节剧本\n", "# 章节剧本\n下面是完整章节。\n");
    expect(() => parseChapterScriptMarkdownV1(prefaced)).toThrow(/unexpected content before chapter heading/);
  });

  it("does not reject story dialogue merely mentioning JSON", () => {
    const source = VALID_CHAPTER_SCRIPT_MARKDOWN_V1.replace("你还是来了。", "你把 JSON 当成真相了吗？");
    expect(parseChapterScriptMarkdownV1(source).scenes[1]?.dialogue).toContain("JSON");
  });
});

describe("import.analyze strict JSON contract", () => {
  it("parses shape and proves complete, non-overlapping block assignment with context", () => {
    const output = parseImportAnalysisOutputV1(VALID_IMPORT_ANALYSIS_OUTPUT_V1, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 });
    expect(output.chapterCandidates).toHaveLength(1);
    expect(output.excludedRanges).toHaveLength(1);
  });

  it("rejects unknown fields and title basis/value mismatches", () => {
    expect(() => parseImportAnalysisOutputV1({ ...VALID_IMPORT_ANALYSIS_OUTPUT_V1, nextTool: "import_script_to_chapters" })).toThrow(/unknown field/);
    const missingTitle = clone(VALID_IMPORT_ANALYSIS_OUTPUT_V1);
    missingTitle.observedOutline.sourceTitle.basis = "not_provided";
    expect(() => parseImportAnalysisOutputV1(missingTitle)).toThrow(/must be null/);
  });

  it("rejects unknown, unassigned and overlapping source blocks", () => {
    const unknown = clone(VALID_IMPORT_ANALYSIS_OUTPUT_V1);
    unknown.chapterCandidates[0]!.sourceRanges[0]!.endBlockRef = "block-999999";
    expect(() => parseImportAnalysisOutputV1(unknown, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 })).toThrow(/unknown source block/);

    const unassigned = clone(VALID_IMPORT_ANALYSIS_OUTPUT_V1);
    unassigned.excludedRanges = [];
    expect(() => parseImportAnalysisOutputV1(unassigned, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 })).toThrow(/unassigned source blocks/);

    const overlap = clone(VALID_IMPORT_ANALYSIS_OUTPUT_V1);
    overlap.excludedRanges[0]!.sourceRange.startBlockRef = "block-000003";
    expect(() => parseImportAnalysisOutputV1(overlap, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 })).toThrow(/overlaps/);
  });

  it("validates observed ranges and requires boundary anchors inside the candidate", () => {
    const observedUnknown = clone(VALID_IMPORT_ANALYSIS_OUTPUT_V1);
    observedUnknown.observedOutline.plotStages[0]!.sourceRanges[0]!.endBlockRef = "block-999999";
    expect(() => parseImportAnalysisOutputV1(observedUnknown, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 })).toThrow(/unknown source block/);

    const anchorOutside = clone(VALID_IMPORT_ANALYSIS_OUTPUT_V1);
    anchorOutside.chapterCandidates[0]!.boundaryEvidence.end.anchorBlockRef = "block-000004";
    expect(() => parseImportAnalysisOutputV1(anchorOutside, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 })).toThrow(/inside candidate source range/);
  });
});

describe("import.verify strict JSON contract", () => {
  const fidelitySourceBlocks = IMPORT_SOURCE_BLOCKS_V1.slice(0, 3);

  it("parses exact report and validates source/output references", () => {
    const output = parseImportFidelityOutputV1(VALID_IMPORT_FIDELITY_OUTPUT_V1, {
      sourceBlocks: fidelitySourceBlocks,
      outputLineRefs: IMPORT_OUTPUT_LINE_REFS_V1,
    });
    expect(output.sourceCoverage[0]?.disposition).toBe("reformatted_in_body");
    expect(importFidelityHasHardIssuesV1(output)).toBe(false);
  });

  it("rejects model verdicts, missing coverage and unknown line references", () => {
    expect(() => parseImportFidelityOutputV1({ ...VALID_IMPORT_FIDELITY_OUTPUT_V1, readyForNextStage: true })).toThrow(/unknown field/);

    const missing = clone(VALID_IMPORT_FIDELITY_OUTPUT_V1);
    missing.sourceCoverage[0]!.sourceRange.endBlockRef = "block-000002";
    expect(() => parseImportFidelityOutputV1(missing, { sourceBlocks: fidelitySourceBlocks })).toThrow(/missing source blocks/);

    const unknownLine = clone(VALID_IMPORT_FIDELITY_OUTPUT_V1);
    unknownLine.sourceCoverage[0]!.outputLineRanges[0]!.endLineRef = "line-9999";
    expect(() => parseImportFidelityOutputV1(unknownLine, { outputLineRefs: IMPORT_OUTPUT_LINE_REFS_V1 })).toThrow(/unknown output lineRef/);

    const reversedLine = clone(VALID_IMPORT_FIDELITY_OUTPUT_V1);
    reversedLine.sourceCoverage[0]!.outputLineRanges[0] = { startLineRef: "line-0005", endLineRef: "line-0001" };
    expect(() => parseImportFidelityOutputV1(reversedLine, { outputLineRefs: IMPORT_OUTPUT_LINE_REFS_V1 })).toThrow(/start must not be after end/);
  });

  it("reports hard dispositions/findings without trusting a model score", () => {
    const missing = clone(VALID_IMPORT_FIDELITY_OUTPUT_V1);
    missing.sourceCoverage[0]!.disposition = "missing";
    missing.sourceCoverage[0]!.outputLineRanges = [];
    const parsed = parseImportFidelityOutputV1(missing);
    expect(importFidelityHasHardIssuesV1(parsed)).toBe(true);

    const uncertain = clone(VALID_IMPORT_FIDELITY_OUTPUT_V1);
    (uncertain.uncertainties as unknown[]).push({
      code: "AMBIGUOUS_MAPPING",
      description: "原稿无法确认两个称谓是否指向同一人。",
      sourceBlockRefs: ["block-000002"],
      outputLineRefs: [],
    });
    const warningOnly = parseImportFidelityOutputV1(uncertain, { sourceBlocks: fidelitySourceBlocks });
    expect(importFidelityHasHardIssuesV1(warningOnly)).toBe(false);

    const hiddenOmission = clone(VALID_IMPORT_FIDELITY_OUTPUT_V1);
    (hiddenOmission.uncertainties as unknown[]).push({
      code: "SOURCE_OMISSION",
      description: "试图把遗漏藏到非阻断列表。",
      sourceBlockRefs: ["block-000002"],
      outputLineRefs: [],
    });
    expect(() => parseImportFidelityOutputV1(hiddenOmission, { sourceBlocks: fidelitySourceBlocks })).toThrow(/does not belong in uncertainties/);
  });
});

describe("seven model-stage fixture skeleton", () => {
  it("has one positive and one negative fixture for every frozen stage", () => {
    expect(SCRIPT_WORKFLOW_STAGE_FIXTURES_V1.map((fixture) => fixture.stageId)).toEqual(SCRIPT_WORKFLOW_STAGE_IDS);
  });

  for (const fixture of SCRIPT_WORKFLOW_STAGE_FIXTURES_V1) {
    it(`${fixture.stageId} accepts positive and rejects negative fixture`, () => {
      const parse = (value: unknown): unknown => {
        switch (fixture.stageId) {
          case "creative.ideation": return parseCreativeIdeationOutputV1(value);
          case "creative.outline": return parseScriptOutlineMarkdownV1(value as string);
          case "creative.chapter-draft":
          case "creative.chapter-edit": return parseChapterScriptMarkdownV1(value as string, { mode: "creative" });
          case "import.analyze": return parseImportAnalysisOutputV1(value, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1 });
          case "import.materialize": return parseChapterScriptMarkdownV1(value as string, { mode: "import" });
          case "import.verify": return parseImportFidelityOutputV1(value, { sourceBlocks: IMPORT_SOURCE_BLOCKS_V1.slice(0, 3), outputLineRefs: IMPORT_OUTPUT_LINE_REFS_V1 });
        }
      };
      expect(() => parse(fixture.valid)).not.toThrow();
      expect(() => parse(fixture.invalid)).toThrow();
    });
  }
});
