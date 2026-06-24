import { describe, expect, it } from "vitest";
import { resolveWorkflowCurrentStepKey } from "./workflow.util.js";

/**
 * 工作流状态机测试。
 *
 * resolveWorkflowCurrentStepKey 是章节状态 → 当前工作流步骤的纯映射,
 * 决定用户在 7 步流程里停在哪一步。错误映射会让用户跳步或卡死。
 */
describe("resolveWorkflowCurrentStepKey:章节状态 → 工作流步骤", () => {
  it("draft → project_story(剧本)", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("draft"), false)).toBe("project_story");
  });

  it("script_done → story_structure(剧情结构)", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("script_done"), false)).toBe("story_structure");
  });

  it("structured → storyboard(分镜)", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("structured"), false)).toBe("storyboard");
  });

  it("storyboard_done + 未通过出图准备 → image_preflight", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("storyboard_done"), false)).toBe("image_preflight");
  });

  it("storyboard_done + 已通过出图准备 → image_candidates", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("storyboard_done"), true)).toBe("image_candidates");
  });

  it("images_done → layout_export(排版)", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("images_done"), false)).toBe("layout_export");
  });

  it("layout_done → asset_package(素材包)", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("layout_done"), false)).toBe("asset_package");
  });

  it("exported → asset_package(素材包)", () => {
    expect(resolveWorkflowCurrentStepKey(buildChapter("exported"), false)).toBe("asset_package");
  });

  it("null chapter 兜底 → project_story", () => {
    expect(resolveWorkflowCurrentStepKey(null, false)).toBe("project_story");
  });
});

function buildChapter(status: ChapterStatus) {
  return {
    id: "chapter_001",
    projectId: "test-project",
    slug: "chapter-001",
    order: 1,
    title: "第 1 章",
    status,
    currentScriptVersionId: null,
    currentStoryVersionId: null,
    sourceText: "正文",
    summary: "",
    storyStructure: null,
    storyboard: null,
    pendingStoryboard: null,
    pendingSourceText: null,
    imagePreflight: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    completedAt: null,
    scriptVersions: [],
    lastScriptRevision: null,
  };
}

type ChapterStatus = "draft" | "script_done" | "structured" | "storyboard_done" | "images_done" | "layout_done" | "exported";
