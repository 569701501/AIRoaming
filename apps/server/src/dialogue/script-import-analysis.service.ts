import { Inject, Injectable } from "@nestjs/common";
import type { AIRuntimeModelSelection, ImportAnalysisOutputV1 } from "@airoaming/shared";
import { parseImportAnalysisOutputV1 } from "@airoaming/shared";

import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import type { RawScriptSourceContext } from "../projects/script-workflow-source.repository.js";
import {
  buildScriptImportAnalysisPrompt,
  buildScriptImportFormatRepairPrompt,
} from "./dialogue-prompt.util.js";

export const IMPORT_ANALYSIS_LEAF_CHAR_BUDGET = 48_000;
export const IMPORT_ANALYSIS_MERGE_CHAR_BUDGET = 72_000;

interface AnalysisNode {
  blocks: RawScriptSourceContext["blocks"];
  analysis: ImportAnalysisOutputV1;
}

export interface ScriptImportAnalysisResult {
  analysis: ImportAnalysisOutputV1;
  strategy: "single_pass" | "hierarchical";
  leafCount: number;
  mergePasses: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function blockCost(block: RawScriptSourceContext["blocks"][number]): number {
  return block.sourceText.length + 320;
}

function partitionBlocks(
  blocks: RawScriptSourceContext["blocks"],
  budget: number,
): Array<RawScriptSourceContext["blocks"]> {
  const chunks: Array<RawScriptSourceContext["blocks"]> = [];
  let current: RawScriptSourceContext["blocks"] = [];
  let currentCost = 0;
  for (const block of blocks) {
    const cost = blockCost(block);
    if (current.length > 0 && currentCost + cost > budget) {
      chunks.push(current);
      current = [];
      currentCost = 0;
    }
    current.push(block);
    currentCost += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function nodeCost(node: AnalysisNode): number {
  return JSON.stringify(node.analysis).length + node.blocks.length * 220;
}

function groupNodes(nodes: readonly AnalysisNode[], budget: number): AnalysisNode[][] {
  const groups: AnalysisNode[][] = [];
  let current: AnalysisNode[] = [];
  let cost = 0;
  for (const node of nodes) {
    const nextCost = nodeCost(node);
    if (current.length > 0 && cost + nextCost > budget) {
      groups.push(current);
      current = [];
      cost = 0;
    }
    current.push(node);
    cost += nextCost;
  }
  if (current.length > 0) groups.push(current);
  if (groups.length === nodes.length && groups.length > 1) {
    const paired: AnalysisNode[][] = [];
    for (let index = 0; index < nodes.length; index += 2) {
      paired.push(nodes.slice(index, index + 2));
    }
    return paired;
  }
  if (groups.length > 1 && groups.at(-1)?.length === 1) {
    groups.at(-2)!.push(groups.pop()![0]!);
  }
  return groups;
}

function sourceSlice(
  source: RawScriptSourceContext,
  blocks: RawScriptSourceContext["blocks"],
): RawScriptSourceContext {
  const refs = new Set(blocks.map((block) => block.sourceRef));
  return {
    ...source,
    documents: source.documents.filter((document) => refs.has(document.sourceRef)),
    blocks,
  };
}

@Injectable()
export class ScriptImportAnalysisService {
  constructor(@Inject(OpenCodeRuntimeService) private readonly runtime: OpenCodeRuntimeService) {}

  async analyze(input: {
    sessionId: string;
    source: RawScriptSourceContext;
    userRequest: string;
    previousAnalysis?: ImportAnalysisOutputV1;
    model?: AIRuntimeModelSelection;
    signal?: AbortSignal;
    leafCharBudget?: number;
    mergeCharBudget?: number;
  }): Promise<ScriptImportAnalysisResult> {
    const leafBudget = input.leafCharBudget ?? IMPORT_ANALYSIS_LEAF_CHAR_BUDGET;
    const mergeBudget = input.mergeCharBudget ?? IMPORT_ANALYSIS_MERGE_CHAR_BUDGET;
    const totalCost = input.source.blocks.reduce((sum, block) => sum + blockCost(block), 0);
    if (totalCost <= leafBudget) {
      const analysis = await this.runPrompt({
        sessionId: input.sessionId,
        source: input.source,
        userRequest: input.userRequest,
        previousAnalysis: input.previousAnalysis,
        model: input.model,
        signal: input.signal,
      });
      return { analysis, strategy: "single_pass", leafCount: 1, mergePasses: 0 };
    }

    const chunks = partitionBlocks(input.source.blocks, leafBudget);
    let nodes: AnalysisNode[] = [];
    for (const [index, blocks] of chunks.entries()) {
      const source = sourceSlice(input.source, blocks);
      const sessionId = await this.runtime.createSession(`AI漫游 长稿分析 ${index + 1}/${chunks.length}`);
      const analysis = await this.runPrompt({
        sessionId,
        source,
        userRequest: `${input.userRequest}\n这是长稿第 ${index + 1}/${chunks.length} 个连续片段。只分析当前提供的 block；片段结尾不是天然章节边界。`,
        hierarchyLabel: `长稿叶子 ${index + 1}/${chunks.length}`,
        model: input.model,
        signal: input.signal,
      });
      nodes.push({ blocks, analysis });
    }

    let mergePasses = 0;
    while (nodes.length > 1) {
      mergePasses += 1;
      const groups = groupNodes(nodes, mergeBudget);
      const next: AnalysisNode[] = [];
      for (const [index, group] of groups.entries()) {
        if (group.length === 1) {
          next.push(group[0]!);
          continue;
        }
        const blocks = group.flatMap((node) => node.blocks);
        const coversWholeSource = blocks.length === input.source.blocks.length;
        const sessionId = await this.runtime.createSession(`AI漫游 长稿合并 ${mergePasses}-${index + 1}`);
        const analysis = await this.runPrompt({
          sessionId,
          source: sourceSlice(input.source, blocks),
          userRequest: `${input.userRequest}\n请合并这些相邻分段；不得把技术分段边界当成章节边界。`,
          previousAnalysis: coversWholeSource ? input.previousAnalysis : undefined,
          segmentAnalyses: group.map((node) => node.analysis),
          sourceBlocksMode: "catalog",
          hierarchyLabel: `长稿合并第 ${mergePasses} 层 ${index + 1}/${groups.length}`,
          model: input.model,
          signal: input.signal,
        });
        next.push({ blocks, analysis });
      }
      nodes = next;
    }
    return { analysis: nodes[0]!.analysis, strategy: "hierarchical", leafCount: chunks.length, mergePasses };
  }

  private async runPrompt(input: {
    sessionId: string;
    source: RawScriptSourceContext;
    userRequest: string;
    previousAnalysis?: ImportAnalysisOutputV1;
    segmentAnalyses?: readonly ImportAnalysisOutputV1[];
    sourceBlocksMode?: "full" | "catalog";
    hierarchyLabel?: string;
    model?: AIRuntimeModelSelection;
    signal?: AbortSignal;
  }): Promise<ImportAnalysisOutputV1> {
    const prompt = buildScriptImportAnalysisPrompt(input);
    const parse = (content: string): ImportAnalysisOutputV1 => parseImportAnalysisOutputV1(content, {
      sourceBlocks: input.source.blocks,
      requireCompleteAssignment: true,
    });
    const first = await this.runtime.sendMessage({ sessionId: input.sessionId, model: input.model, content: prompt, signal: input.signal });
    try {
      return parse(first.content);
    } catch (error) {
      const repaired = await this.runtime.sendMessage({
        sessionId: input.sessionId,
        model: input.model,
        content: buildScriptImportFormatRepairPrompt({
          stage: "analysis",
          validationError: errorMessage(error),
          originalPrompt: prompt,
          invalidOutput: first.content,
        }),
        signal: input.signal,
      });
      return parse(repaired.content);
    }
  }
}
