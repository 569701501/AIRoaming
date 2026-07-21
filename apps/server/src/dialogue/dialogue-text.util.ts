/**
 * DialogueService 文本与 record 辅助函数(从 dialogue.service.ts 抽出)。
 *
 * 这些是纯函数,无状态依赖,供对话编排器和各工作流子 service 共用。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */
import { randomUUID } from "node:crypto";

// ---------- record 取值辅助 ----------

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function getOptionalRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getOptionalRecordNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getRecordStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`灵感种子缺少字段 ${key}`);
  }

  return value.trim();
}

// ---------- Markdown / 文本处理 ----------

export function compactPromptText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const headLength = Math.floor(maxLength * 0.65);
  const tailLength = maxLength - headLength;
  return [
    text.slice(0, headLength).trimEnd(),
    `\n\n（中间内容已省略 ${text.length - maxLength} 字，以控制 AI 输入长度）\n\n`,
    text.slice(text.length - tailLength).trimStart(),
  ].join("");
}

// ---------- 摘要 / 格式化 ----------

export function summarizeDraftUpdate(instruction: string): string {
  if (/紧张|刺激|压迫|悬疑|冲突/.test(instruction)) {
    return "强化当前章节紧张感和冲突推进。";
  }

  if (/节奏|加快|压缩/.test(instruction)) {
    return "加快当前章节节奏并压缩铺垫。";
  }

  if (/对白|台词/.test(instruction)) {
    return "润色当前章节对白和潜台词。";
  }

  return "根据用户要求更新当前章节草稿。";
}

export function formatRevisionSource(revision: { threadId: string | null; messageId: string | null; toolCallId: string | null }): string {
  if (!revision.threadId && !revision.messageId && !revision.toolCallId) {
    return "系统密封来源";
  }
  return `thread=${shortId(revision.threadId ?? "")} message=${shortId(revision.messageId ?? "")} tool=${shortId(revision.toolCallId ?? "")}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "getResponse" in error) {
    const getResponse = (error as { getResponse?: unknown }).getResponse;
    if (typeof getResponse === "function") {
      const response = getResponse.call(error) as unknown;
      if (typeof response === "string") return response;
      if (typeof response === "object" && response !== null && "message" in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return message;
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export class GenerationRepairError extends Error {
  constructor(
    readonly primaryError: unknown,
    readonly repairError: unknown,
  ) {
    super(`首次生成失败：${getErrorMessage(primaryError)}；自动修复失败：${getErrorMessage(repairError)}`);
    this.name = "GenerationRepairError";
  }
}

// ---------- 灵感种子 normalize ----------

export function normalizeInspirationSeed(rawSeed: unknown, index: number): import("@airoaming/shared").ScriptInspirationSeed {
  if (typeof rawSeed !== "object" || rawSeed === null || Array.isArray(rawSeed)) {
    throw new Error("灵感种子格式不正确");
  }

  const record = rawSeed as Record<string, unknown>;
  const title = getRequiredString(record, "title");
  const logline = getRequiredString(record, "logline");
  const keyConflict = getRequiredString(record, "keyConflict");
  const visualHook = getRequiredString(record, "visualHook");
  const firstChapterDirection = getRequiredString(record, "firstChapterDirection");
  const genreTags = Array.isArray(record.genreTags)
    ? record.genreTags.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
    : [];

  return {
    id: randomUUID(),
    order: index + 1,
    title,
    genreTags,
    logline,
    keyConflict,
    visualHook,
    firstChapterDirection,
  };
}
