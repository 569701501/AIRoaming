import { Inject, Injectable } from "@nestjs/common";
import type { AIRuntimeModelSelection, ImportFidelityOutputV1 } from "@airoaming/shared";
import {
  parseChapterScriptMarkdownV1,
  parseImportFidelityOutputV1,
  serializeChapterScriptMarkdownV1,
} from "@airoaming/shared";

import { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import {
  ScriptWorkflowSourceRepository,
  type ImportBatchProjection,
  type ImportItemWorkContext,
} from "../projects/script-workflow-source.repository.js";
import {
  buildScriptImportFormatRepairPrompt,
  buildScriptImportMaterializePrompt,
  buildScriptImportVerifyPrompt,
} from "./dialogue-prompt.util.js";

const MATERIALIZE_PROMPT_VERSION = "import-materialize/1.0";
const VERIFY_PROMPT_VERSION = "import-verify/1.0";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function outputLineRefs(sourceText: string): string[] {
  return sourceText.trimEnd().split("\n").map((_line, index) => `line-${String(index + 1).padStart(6, "0")}`);
}

@Injectable()
export class ScriptImportBatchService {
  constructor(
    @Inject(ScriptWorkflowSourceRepository) private readonly repository: ScriptWorkflowSourceRepository,
    @Inject(OpenCodeRuntimeService) private readonly runtime: OpenCodeRuntimeService,
  ) {}

  async run(input: {
    projectId: string;
    batchId: string;
    model?: AIRuntimeModelSelection;
  }): Promise<ImportBatchProjection> {
    const initial = await this.repository.getImportBatchProjection(input.projectId, input.batchId);
    for (const item of initial.items) {
      if (item.status !== "queued") continue;
      try {
        await this.repository.beginImportItem(input.projectId, item.id);
        await this.processClaimedItem({ projectId: input.projectId, itemId: item.id, model: input.model });
      } catch {
        // 兼容旧的整批同步调用：若条目已被其他执行器领取，本轮直接跳过。
      }
    }
    return this.repository.getImportBatchProjection(input.projectId, input.batchId);
  }

  /**
   * 处理一个已经由 beginImportItem 原子领取、处于 materializing 状态的章节。
   * 领取与执行拆开后，后台 Worker 和显式重试可以复用同一条整理/验证链路。
   */
  async processClaimedItem(input: {
    projectId: string;
    itemId: string;
    model?: AIRuntimeModelSelection;
  }): Promise<void> {
    let stage: "materializing" | "verifying" = "materializing";
    try {
      const context = await this.repository.getImportItemWorkContext(input.projectId, input.itemId);
      const sessionId = await this.runtime.createSession(`AI漫游 导入第 ${context.chapter.order} 章`);
      const sourceText = await this.materialize(sessionId, context, input.model);
      await this.repository.markImportItemVerifying(input.projectId, input.itemId, sourceText);
      stage = "verifying";
      const report = await this.verify(sessionId, context, sourceText, input.model);
      await this.repository.recordImportFidelity({
        projectId: input.projectId,
        itemId: input.itemId,
        sourceText,
        report,
        materializePromptVersion: MATERIALIZE_PROMPT_VERSION,
        verifyPromptVersion: VERIFY_PROMPT_VERSION,
      });
    } catch (error) {
      await this.repository.markImportItemFailed({
        projectId: input.projectId,
        itemId: input.itemId,
        stage,
        errorCode: stage === "materializing" ? "IMPORT_MATERIALIZE_FAILED" : "IMPORT_VERIFY_FAILED",
        message: errorMessage(error),
      });
    }
  }

  private async materialize(
    sessionId: string,
    context: ImportItemWorkContext,
    model?: AIRuntimeModelSelection,
  ): Promise<string> {
    const prompt = buildScriptImportMaterializePrompt(context);
    const first = await this.runtime.sendMessage({ sessionId, content: prompt, model });
    try {
      return this.parseMaterializedChapter(first.content, context);
    } catch (error) {
      const repaired = await this.runtime.sendMessage({
        sessionId,
        content: buildScriptImportFormatRepairPrompt({
          stage: "materialize",
          validationError: errorMessage(error),
          originalPrompt: prompt,
          invalidOutput: first.content,
        }),
        model,
      });
      return this.parseMaterializedChapter(repaired.content, context);
    }
  }

  private parseMaterializedChapter(sourceText: string, context: ImportItemWorkContext): string {
    const document = parseChapterScriptMarkdownV1(sourceText, {
      mode: "import",
      expectedChapterHeading: `第 ${context.chapter.order} 章：${context.chapter.title}`,
    });
    return serializeChapterScriptMarkdownV1(document);
  }

  private async verify(
    sessionId: string,
    context: ImportItemWorkContext,
    sourceText: string,
    model?: AIRuntimeModelSelection,
  ): Promise<ImportFidelityOutputV1> {
    const prompt = buildScriptImportVerifyPrompt(context, sourceText);
    const parse = (content: string): ImportFidelityOutputV1 => parseImportFidelityOutputV1(content, {
      sourceBlocks: context.sourceBlocks,
      outputLineRefs: outputLineRefs(sourceText),
    });
    const first = await this.runtime.sendMessage({ sessionId, content: prompt, model });
    try {
      return parse(first.content);
    } catch (error) {
      const repaired = await this.runtime.sendMessage({
        sessionId,
        content: buildScriptImportFormatRepairPrompt({
          stage: "verify",
          validationError: errorMessage(error),
          originalPrompt: prompt,
          invalidOutput: first.content,
        }),
        model,
      });
      return parse(repaired.content);
    }
  }
}
