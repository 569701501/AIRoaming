import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ChapterScriptService } from "./chapter-script.service.js";
import type { ProjectRepository } from "./project-repository.service.js";
import type { ProjectStore } from "./project-store.service.js";

describe("ChapterScriptService 正文规范化后非空校验", () => {
  let service: ChapterScriptService;
  let projectStore: Pick<ProjectStore, "getReadyProject" | "findChapter" | "withUpdatedChapter" | "writeProjectFiles">;
  let repository: Pick<ProjectRepository, "setProject">;

  const chapter: LocalChapter = {
    id: "chapter_001",
    projectId: "test-project",
    slug: "chapter-001",
    order: 1,
    title: "第 1 章",
    status: "storyboard_done",
    currentScriptVersionId: "chapter_001_script_v001",
    currentStoryVersionId: null,
    sourceText: "已有完整正文",
    summary: "",
    storyStructure: null,
    storyboard: null,
    pendingStoryboard: null,
    pendingSourceText: null,
    imagePreflight: null,
    candidates: [],
    layout: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    completedAt: "2026-07-10T00:00:00.000Z",
    scriptVersions: [],
    lastScriptRevision: null,
  };

  const project: LocalProject = {
    id: "test-project",
    name: "测试项目",
    type: "comic",
    currentChapterId: chapter.id,
    storyTitle: "测试故事",
    genreTags: [],
    comicFormat: "vertical_scroll",
    artStyle: "comic_style",
    description: "",
    sourceText: chapter.sourceText,
    scriptOutline: null,
    characters: [],
    assets: [],
    chapters: [chapter],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };

  beforeEach(() => {
    projectStore = {
      getReadyProject: vi.fn().mockResolvedValue(project),
      findChapter: vi.fn().mockReturnValue(chapter),
      withUpdatedChapter: vi.fn((inputProject: LocalProject, inputChapter: LocalChapter) => ({
        ...inputProject,
        chapters: [inputChapter],
      })),
      writeProjectFiles: vi.fn().mockResolvedValue(undefined),
    };
    repository = {
      setProject: vi.fn(),
    };
    service = new ChapterScriptService(
      repository as ProjectRepository,
      projectStore as ProjectStore,
    );
  });

  it("保存草稿时仅含剧本名称 → 拒绝写盘", async () => {
    await expect(service.saveChapterDraft("test-project", "chapter_001", {
      sourceText: "剧本名称：测试故事",
    })).rejects.toThrow(BadRequestException);

    expect(projectStore.writeProjectFiles).not.toHaveBeenCalled();
    expect(repository.setProject).not.toHaveBeenCalled();
  });

  it("完成剧本时仅含剧本名称 → 拒绝创建空版本", async () => {
    await expect(service.completeChapter("test-project", "chapter_001", {
      sourceText: "剧本名称：测试故事",
      createNextChapter: false,
    })).rejects.toThrow(BadRequestException);

    expect(projectStore.writeProjectFiles).not.toHaveBeenCalled();
    expect(repository.setProject).not.toHaveBeenCalled();
  });
});
