import { describe, expect, it } from "vitest";

import type { SendDialogueMessageRequest, WorkbenchSnapshot } from "@airoaming/shared";
import {
  isConfirmingScriptImport,
  isConfirmingScriptOutline,
  isExplicitlyRequestingChapterGeneration,
  resolveBatchChapterRange,
  resolveSelectedInspirationSeed,
  shouldGenerateInspirationSeeds,
  shouldOrganizeProvidedScript,
  shouldRevisePendingStoryboard,
  shouldReviseScriptImportAnalysis,
  shouldUpdateChapterDraft,
} from "./dialogue-intent.util.js";

function request(content: string, intent?: SendDialogueMessageRequest["intent"]): SendDialogueMessageRequest {
  return { content, intent };
}

describe("A2/A3 灵感与项目大纲触发", () => {
  const seeds = [1, 2, 3].map((order) => ({
    id: `seed-${order}`,
    order,
    title: `方向 ${order}`,
    genreTags: ["悬疑", "都市"],
    logline: `方向 ${order} 的故事钩子`,
    keyConflict: `方向 ${order} 的核心冲突`,
    visualHook: `方向 ${order} 的视觉钩子`,
    firstChapterDirection: `方向 ${order} 的第一章方向`,
  }));

  it("找灵感进入 A2，明确题材写故事直接进入 A3，普通评价不触发", () => {
    expect(shouldGenerateInspirationSeeds(request("帮我找三个都市悬疑灵感"))).toEqual({ trigger: true, mode: "inspiration" });
    expect(shouldGenerateInspirationSeeds(request("写一个六章的都市悬疑故事大纲"))).toEqual({ trigger: true, mode: "topic" });
    expect(shouldGenerateInspirationSeeds(request("评价一下当前章节"))).toEqual({ trigger: false, mode: "inspiration" });
  });

  it("选中灵感才进入种子大纲生成；确认大纲只确认，不重新生成", () => {
    expect(resolveSelectedInspirationSeed(request("选第 2 个"), seeds)).toMatchObject({ order: 2, title: "方向 2" });
    expect(isConfirmingScriptOutline("确认大纲")).toBe(true);
    expect(shouldGenerateInspirationSeeds(request("确认大纲"))).toEqual({ trigger: false, mode: "inspiration" });
  });
});

describe("AI 创作章节生成意图", () => {
  it("不会把章节切换、裸继续或裸章节号当成 A4 生成命令", () => {
    expect(isExplicitlyRequestingChapterGeneration(request("继续"))).toBe(false);
    expect(isExplicitlyRequestingChapterGeneration(request("第 2 章"))).toBe(false);
    expect(isExplicitlyRequestingChapterGeneration(request("我切到第二章看看"))).toBe(false);
    expect(isConfirmingScriptOutline("继续")).toBe(true);
    expect(isExplicitlyRequestingChapterGeneration(request("生成全部章节"))).toBe(false);
    expect(resolveBatchChapterRange("生成全部章节")).toEqual({ start: 1, count: 20 });
  });

  it("只在用户明确要求生成目标章或页面传入明确 intent 时触发", () => {
    expect(isExplicitlyRequestingChapterGeneration(request("生成当前章节"))).toBe(true);
    expect(isExplicitlyRequestingChapterGeneration(request("帮我写第 2 章"))).toBe(true);
    expect(isExplicitlyRequestingChapterGeneration(request("先别写本章"))).toBe(false);
    expect(isExplicitlyRequestingChapterGeneration(request("确认大纲：双城，生成当前章节", "generate_script_from_outline"))).toBe(true);
  });
});

describe("已有剧本拆章目录确认意图", () => {
  it("附件、长稿或明确导入进入 B1/B2，普通短创作请求不进入导入路线", () => {
    expect(shouldOrganizeProvidedScript({
      content: "请导入并拆章",
      attachments: [{ name: "完整剧本.md", mimeType: "text/markdown", size: 18, content: "第一幕正文" }],
    })).toBe(true);
    expect(shouldOrganizeProvidedScript(request("原稿".repeat(600)))).toBe(true);
    expect(shouldOrganizeProvidedScript(request("帮我写一个都市悬疑故事"))).toBe(false);
  });

  it("边界反馈生成完整新分析候选，解释或裸继续不触发重新分析", () => {
    expect(shouldReviseScriptImportAnalysis("把第 2 章边界往后调整一场")).toBe(true);
    expect(shouldReviseScriptImportAnalysis("为什么这样拆章")).toBe(false);
    expect(shouldReviseScriptImportAnalysis("继续")).toBe(false);
  });

  it("裸继续不会确认目录，只有明确文字或页面 intent 才确认", () => {
    expect(isConfirmingScriptImport("继续")).toBe(false);
    expect(isConfirmingScriptImport("确认拆章目录")).toBe(true);
    expect(isConfirmingScriptImport("", "confirm_script_chapter_map")).toBe(true);
  });

  it("否定语义不会误触发确认", () => {
    expect(isConfirmingScriptImport("先不要确认拆章目录")).toBe(false);
  });
});

describe("P4 章节改写意图", () => {
  const snapshot = { currentChapter: { sourceText: "当前已有章节正文" } } as WorkbenchSnapshot;

  it("明确要求润色、调整或修复当前章时触发", () => {
    expect(shouldUpdateChapterDraft(request("只润色本章对白"), snapshot)).toBe(true);
    expect(shouldUpdateChapterDraft(request("把这一章节奏加快"), snapshot)).toBe(true);
    expect(shouldUpdateChapterDraft(request("修正当前章的时间线穿帮"), snapshot)).toBe(true);
  });

  it("评价、分析和建议请求不会被误当成写入", () => {
    expect(shouldUpdateChapterDraft(request("看看本章对白有什么问题"), snapshot)).toBe(false);
    expect(shouldUpdateChapterDraft(request("给我建议，如何加强这一章的冲突"), snapshot)).toBe(false);
    expect(shouldUpdateChapterDraft(request("评价一下当前草稿"), snapshot)).toBe(false);
  });
});

describe("S1 待确认分镜调整意图", () => {
  it("明确调整分镜、镜头或节奏时触发", () => {
    expect(shouldRevisePendingStoryboard(request("把分镜节奏加快"))).toBe(true);
    expect(shouldRevisePendingStoryboard(request("重写结尾镜头，多给一个特写"))).toBe(true);
    expect(shouldRevisePendingStoryboard(request("只调整景别和机位"))).toBe(true);
    expect(shouldRevisePendingStoryboard(request("按这个调整", "revise_pending_storyboard"))).toBe(true);
  });

  it("建议、评价、否定和首次生成不触发草稿写入", () => {
    expect(shouldRevisePendingStoryboard(request("看看分镜节奏有什么问题"))).toBe(false);
    expect(shouldRevisePendingStoryboard(request("给我建议，镜头应该怎么拆"))).toBe(false);
    expect(shouldRevisePendingStoryboard(request("先别调整分镜"))).toBe(false);
    expect(shouldRevisePendingStoryboard(request("生成分镜", "generate_storyboard"))).toBe(false);
  });
});
