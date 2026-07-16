import { describe, expect, it } from "vitest";

import type { SendDialogueMessageRequest } from "@airoaming/shared";
import {
  isConfirmingScriptImport,
  isConfirmingScriptOutline,
  isExplicitlyRequestingChapterGeneration,
} from "./dialogue-intent.util.js";

function request(content: string, intent?: SendDialogueMessageRequest["intent"]): SendDialogueMessageRequest {
  return { content, intent };
}

describe("AI 创作章节生成意图", () => {
  it("不会把章节切换、裸继续或裸章节号当成 A4 生成命令", () => {
    expect(isExplicitlyRequestingChapterGeneration(request("继续"))).toBe(false);
    expect(isExplicitlyRequestingChapterGeneration(request("第 2 章"))).toBe(false);
    expect(isExplicitlyRequestingChapterGeneration(request("我切到第二章看看"))).toBe(false);
    expect(isConfirmingScriptOutline("继续")).toBe(true);
  });

  it("只在用户明确要求生成目标章或页面传入明确 intent 时触发", () => {
    expect(isExplicitlyRequestingChapterGeneration(request("生成当前章节"))).toBe(true);
    expect(isExplicitlyRequestingChapterGeneration(request("帮我写第 2 章"))).toBe(true);
    expect(isExplicitlyRequestingChapterGeneration(request("先别写本章"))).toBe(false);
    expect(isExplicitlyRequestingChapterGeneration(request("确认大纲：双城，生成当前章节", "generate_script_from_outline"))).toBe(true);
  });
});

describe("已有剧本拆章目录确认意图", () => {
  it("裸继续不会确认目录，只有明确文字或页面 intent 才确认", () => {
    expect(isConfirmingScriptImport("继续")).toBe(false);
    expect(isConfirmingScriptImport("确认拆章目录")).toBe(true);
    expect(isConfirmingScriptImport("", "confirm_script_chapter_map")).toBe(true);
  });

  it("否定语义不会误触发确认", () => {
    expect(isConfirmingScriptImport("先不要确认拆章目录")).toBe(false);
  });
});
