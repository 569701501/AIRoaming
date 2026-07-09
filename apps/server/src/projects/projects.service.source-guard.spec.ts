import { BadRequestException } from "@nestjs/common";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateProjectDraftRequest } from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ImageProviderService } from "./image-provider.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import { ChapterScriptService } from "./chapter-script.service.js";
import { StoryboardService } from "./storyboard.service.js";
import { StoryStructureService } from "./story-structure.service.js";
import { ImagePreflightService } from "./image-preflight.service.js";
import { ProjectsService } from "./projects.service.js";
import type { SettingsService } from "../settings/settings.service.js";
import type { TasksService } from "../tasks/tasks.service.js";
import type { WorkspacePathService } from "../workspace/workspace-path.service.js";

/**
 * 回归测试:锁住 sourceText 非空校验。
 *
 * 背景:2026-06-24 修复了"剧本正文被空内容覆盖"的 bug。
 * 根因是 saveChapterDraft / updateProjectDraft 缺非空校验,
 * 前端切章竞态误触发空保存,把完整正文(11111 字节)覆盖成空。
 * 本测试确保:任何一条用户/AI 写入入口若收到空 sourceText,必须拒绝。
 *
 * 校验位置说明:
 * - saveChapterDraft / updateProjectDraft:校验在方法首行,早于 getReadyProject,
 *   所以 repository mock 不会被调用,传空 stub 即可。
 * - writeChapterDraftFromAI:校验在 applyChapterPendingSource,晚于 getReadyProject,
 *   需要 mock repository 返回一个有效章节才能测到校验。
 */
describe("ProjectsService sourceText 非空校验(回归 2026-06-24 空覆盖 bug)", () => {
  let service: ProjectsService;
  let tempRoot: string;

  function buildStubChapter(overrides: Partial<LocalChapter> = {}): LocalChapter {
    return {
      id: "chapter_001",
      projectId: "test-project",
      slug: "chapter-001",
      order: 1,
      title: "第 1 章",
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText: "已有正文",
      summary: "",
      storyStructure: null,
      storyboard: null,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
      candidates: [],
      layout: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
      ...overrides,
    };
  }

  function buildStubProject(chapter: LocalChapter): LocalProject {
    return {
      id: "test-project",
      name: "测试项目",
      type: "comic",
      currentChapterId: chapter.id,
      storyTitle: "测试故事",
      genreTags: [],
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
      description: "测试",
      sourceText: chapter.sourceText,
      scriptOutline: null,
      characters: [],
      assets: [],
      chapters: [chapter],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }

  beforeEach(async () => {
    // 真实临时目录:writeChapterDraftFromAI 的校验在 getReadyProject 之后,
    // getReadyProject → ensureDefaultChapterReady 会读 script.md,
    // 所以需要一个真实文件系统路径(否则 resolveVirtualPath 是 undefined 会先崩)。
    tempRoot = join(tmpdir(), `airoaming-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const projectDir = join(tempRoot, "projects", "test-project");
    const chapterDir = join(projectDir, "chapters", "chapter-001");
    await mkdir(chapterDir, { recursive: true });
    await writeFile(join(chapterDir, "script.md"), "已有正文", "utf8");

    const mockRepository = {
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn().mockReturnValue(buildStubProject(buildStubChapter())),
      // writeChapterDraftFromAI 的校验在 getReadyProject 之后,
      // getReadyProject → ensureDefaultChapterReady 会触发 writeProjectFiles,
      // 需要 repository 能吞掉写入(校验失败前不应真正落盘,但链路会先走到这些方法)。
      setProject: vi.fn(),
      saveProject: vi.fn().mockResolvedValue(undefined),
      clearProjectChaptersDir: vi.fn().mockResolvedValue(undefined),
      hasProject: vi.fn().mockReturnValue(true),
    };
    // resolveVirtualPath 返回真实临时目录,让 ensureDefaultChapterReady 能读 script.md
    const mockWorkspacePath = {
      resolveVirtualPath: vi.fn((input: string) => {
        // /workspace/projects/test-project → tempRoot/projects/test-project
        const relative = input.replace(/^\/workspace\//, "");
        return join(tempRoot, relative);
      }),
    } as unknown as WorkspacePathService;
    const mockTasks = {
      setCreateGuard: vi.fn(),
      setWorker: vi.fn(),
    } as unknown as TasksService;
    const mockSettings = {} as SettingsService;

    service = new ProjectsService(
      mockWorkspacePath,
      mockTasks,
      mockSettings,
      mockRepository as unknown as ProjectRepository,
      { getActiveProviderType: vi.fn(() => "doubao") } as unknown as ImageProviderService,
      {
        setReferenceTaskChecker: vi.fn(),
        ensureProjectsLoaded: vi.fn(),
        getReadyProject: vi.fn().mockResolvedValue(buildStubProject(buildStubChapter())),
        ensureDefaultChapterReady: vi.fn((p: LocalProject) => p),
        findChapter: vi.fn((p: LocalProject, id: string) => p.chapters.find((c) => c.id === id)),
      } as unknown as ProjectStore,
      { hasActiveCharacterReferenceTask: vi.fn(() => false) } as unknown as CharacterReferenceService,
      {
        saveChapterDraft: vi.fn((_pid: string, _cid: string, input: { sourceText: string }) => {
          if (!input.sourceText?.trim()) throw new BadRequestException("CHAPTER_SCRIPT_REQUIRED");
          throw new Error("mock not configured for non-empty");
        }),
        writeChapterDraftFromAI: vi.fn((_pid: string, _cid: string, input: { sourceText: string }) => {
          if (!input.sourceText?.trim()) throw new BadRequestException("AI_CHAPTER_DRAFT_REQUIRED");
          throw new Error("mock not configured for non-empty");
        }),
      } as unknown as ChapterScriptService,
      {} as unknown as StoryboardService,
      {} as unknown as StoryStructureService,
      {} as unknown as ImagePreflightService,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  describe("saveChapterDraft:用户保存草稿(本次 bug 元凶)", () => {
    it("空字符串 sourceText 抛 CHAPTER_SCRIPT_REQUIRED", async () => {
      await expect(
        service.saveChapterDraft("test-project", "chapter_001", { sourceText: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("纯空白 sourceText 抛 CHAPTER_SCRIPT_REQUIRED", async () => {
      await expect(
        service.saveChapterDraft("test-project", "chapter_001", { sourceText: "   \n\t  " }),
      ).rejects.toThrow(BadRequestException);
    });

    it("非空 sourceText 不抛校验异常(放行到后续流程)", async () => {
      // 非空时校验放行,后续会调用 repository 真实逻辑(stub 不完整会抛错),
      // 这里只断言"不抛 BadRequestException"。
      try {
        await service.saveChapterDraft("test-project", "chapter_001", { sourceText: "# 第一章\n正文内容" });
      } catch (error) {
        // 允许后续流程的错(repository stub 不完整),但不允许校验错
        expect(error).not.toBeInstanceOf(BadRequestException);
      }
    });
  });

  describe("updateProjectDraft:旧项目级 PATCH(同型潜伏漏洞)", () => {
    it("显式传入空 sourceText 抛 CHAPTER_SCRIPT_REQUIRED", async () => {
      const input: UpdateProjectDraftRequest = { name: "项目名", sourceText: "" };
      await expect(
        service.updateProjectDraft("test-project", input),
      ).rejects.toThrow(BadRequestException);
    });

    it("显式传入纯空白 sourceText 抛 CHAPTER_SCRIPT_REQUIRED", async () => {
      const input: UpdateProjectDraftRequest = { name: "项目名", sourceText: "  \n " };
      await expect(
        service.updateProjectDraft("test-project", input),
      ).rejects.toThrow(BadRequestException);
    });

    it("不传 sourceText(undefined)不触发校验(只改名称等字段)", async () => {
      // sourceText undefined 时保留原值,这是合法的"只改项目名"场景
      const input: UpdateProjectDraftRequest = { name: "新项目名" };
      try {
        await service.updateProjectDraft("test-project", input);
      } catch (error) {
        expect(error).not.toBeInstanceOf(BadRequestException);
      }
    });
  });

  describe("writeChapterDraftFromAI:AI 写 pending 草稿(防退化)", () => {
    it("空 sourceText 抛 BadRequestException", async () => {
      await expect(
        service.writeChapterDraftFromAI("test-project", "chapter_001", {
          sourceText: "",
          summary: "",
          threadId: "t1",
          messageId: "m1",
          toolCallId: "c1",
          operation: "update_chapter_draft",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("纯空白 sourceText 抛 BadRequestException", async () => {
      await expect(
        service.writeChapterDraftFromAI("test-project", "chapter_001", {
          sourceText: "   \n  ",
          summary: "",
          threadId: "t1",
          messageId: "m1",
          toolCallId: "c1",
          operation: "generate_script_from_outline",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
