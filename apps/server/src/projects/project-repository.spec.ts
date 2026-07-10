import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectWorkflow } from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ProjectRepository } from "./project-repository.service.js";

/**
 * Repository 往返测试:验证"写入 → 重载"的数据一致性。
 *
 * 背景:Repository(889 行)是上次 ProjectsService 拆分的核心产出,封装了
 * fs 加载/写入/缓存,但无测试保护。2026-06-24 的 sourceText 空覆盖 bug
 * 之所以能恢复,依赖的正是加载链优先读 script.md 的行为。
 *
 * 本测试用真实临时目录(不 mock fs),测真实文件行为:
 * - 写入章节 sourceText → 重启(新 Repository)→ sourceText 一致
 * - 加载优先级:script.md 优先于 chapter.json.sourceText
 * - 空章节不崩,版本文件存在时正常加载
 *
 * "重启"通过新建 Repository 实例模拟(加载链有 projectsLoaded 缓存)。
 */
describe("ProjectRepository 写入→重载往返一致性", () => {
  let tempRoot: string;
  let workspacePath: WorkspacePathService;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `airoaming-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.AIROAMING_WORKSPACE_ROOT = tempRoot;
    workspacePath = new WorkspacePathService();
  });

  afterEach(async () => {
    delete process.env.AIROAMING_WORKSPACE_ROOT;
    await rm(tempRoot, { recursive: true, force: true });
  });

  const NOW = "2026-06-24T00:00:00.000Z";

  function buildChapter(overrides: Partial<LocalChapter> = {}): LocalChapter {
    return {
      id: "chapter_001",
      projectId: "test-project",
      slug: "chapter-001",
      order: 1,
      title: "第 1 章：离岛的少年",
      status: "draft",
      currentScriptVersionId: null,
      currentStoryVersionId: null,
      sourceText: "# 章节剧本\n\n## 第 1 章：离岛的少年\n\n小杰离开了鲸鱼岛。",
      summary: "开篇章节",
      storyStructure: null,
      storyboard: null,
      pendingStoryboard: null,
      pendingSourceText: null,
      imagePreflight: null,
      candidates: [],
      layout: null,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      scriptVersions: [],
      lastScriptRevision: null,
      ...overrides,
    };
  }

  function buildProject(chapter: LocalChapter): LocalProject {
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
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  const STUB_WORKFLOW: ProjectWorkflow = {
    schemaVersion: 1,
    projectId: "test-project",
    currentChapterId: "chapter_001",
    currentStepKey: "project_story",
    steps: [],
    updatedAt: NOW,
  };

  it("写入章节 sourceText → 新 Repository 重载 → sourceText 一致", async () => {
    const chapter = buildChapter();
    const project = buildProject(chapter);
    const expectedSourceText = chapter.sourceText;

    // 写入
    const writer = new ProjectRepository(workspacePath);
    await writer.saveProject(project, STUB_WORKFLOW);

    // 模拟重启:新 Repository 实例,强制从磁盘加载
    const reloader = new ProjectRepository(workspacePath);
    await reloader.ensureLoaded();
    const reloaded = reloader.getProject("test-project");

    expect(reloaded).toBeDefined();
    const reloadedChapter = reloaded!.chapters.find((c) => c.id === "chapter_001");
    expect(reloadedChapter).toBeDefined();
    // 核心断言:sourceText 往返无损
    expect(reloadedChapter!.sourceText).toBe(expectedSourceText);
  });

  it("写入带 scriptVersions 的章节 → 重载 → 版本内容保留", async () => {
    const chapter = buildChapter({
      scriptVersions: [
        {
          id: "chapter_001_script_v001",
          projectId: "test-project",
          chapterId: "chapter_001",
          version: 1,
          sourcePath: "projects/test-project/chapters/chapter-001/script.versions/script-v001.md",
          status: "current",
          createdAt: NOW,
          sourceText: "# 历史版本正文\n\n这是 AI 生成的原始内容。",
        },
      ],
      currentScriptVersionId: "chapter_001_script_v001",
    });
    const project = buildProject(chapter);

    const writer = new ProjectRepository(workspacePath);
    await writer.saveProject(project, STUB_WORKFLOW);

    const reloader = new ProjectRepository(workspacePath);
    await reloader.ensureLoaded();
    const reloaded = reloader.getProject("test-project");
    const reloadedChapter = reloaded!.chapters.find((c) => c.id === "chapter_001")!;

    // 版本文件保留(这正是本次 bug 能恢复的原因)
    expect(reloadedChapter.scriptVersions).toHaveLength(1);
    expect(reloadedChapter.scriptVersions[0].sourceText).toBe("# 历史版本正文\n\n这是 AI 生成的原始内容。");
    expect(reloadedChapter.currentScriptVersionId).toBe("chapter_001_script_v001");
  });

  it("非草稿章节正式正文为空时 → 从当前剧本版本恢复正文", async () => {
    const versionSourceText = "# 章节剧本\n\n## 第 1 章：离岛的少年\n\n当前版本保存的完整正文。";
    const chapter = buildChapter({
      status: "storyboard_done",
      currentScriptVersionId: "chapter_001_script_v001",
      scriptVersions: [
        {
          id: "chapter_001_script_v001",
          projectId: "test-project",
          chapterId: "chapter_001",
          version: 1,
          sourcePath: "projects/test-project/chapters/chapter-001/script.versions/script-v001.md",
          status: "current",
          createdAt: NOW,
          sourceText: versionSourceText,
        },
      ],
    });
    const project = buildProject(chapter);

    const writer = new ProjectRepository(workspacePath);
    await writer.saveProject(project, STUB_WORKFLOW);

    const { readFile, writeFile } = await import("node:fs/promises");
    const chapterDir = join(
      workspacePath.resolveVirtualPath("/workspace/projects/test-project"),
      "chapters",
      "chapter-001",
    );
    await writeFile(join(chapterDir, "script.md"), "", "utf8");
    const chapterJsonPath = join(chapterDir, "chapter.json");
    const chapterJson = JSON.parse(await readFile(chapterJsonPath, "utf8"));
    chapterJson.sourceText = "";
    await writeFile(chapterJsonPath, JSON.stringify(chapterJson, null, 2) + "\n", "utf8");

    const reloader = new ProjectRepository(workspacePath);
    await reloader.ensureLoaded();
    const reloadedChapter = reloader.getProject("test-project")!.chapters
      .find((item) => item.id === "chapter_001")!;

    expect(reloadedChapter.sourceText).toBe(versionSourceText);
    expect(reloadedChapter.currentScriptVersionId).toBe("chapter_001_script_v001");
  });

  it("加载优先级:script.md 内容优先于 chapter.json.sourceText", async () => {
    // 这个测试复现本次 bug 的恢复机制:sourceText 为空但 script.md 有内容时,
    // 加载链 readChapterFromWorkspace 优先读 script.md。
    // 注:实际 saveProject 会把 chapter.sourceText 同时写进 script.md 和 chapter.json,
    // 所以正常写入不会出现不一致。本测试手动构造不一致场景,验证加载链优先级。
    const chapter = buildChapter({ sourceText: "正式正文内容" });
    const project = buildProject(chapter);

    const writer = new ProjectRepository(workspacePath);
    await writer.saveProject(project, STUB_WORKFLOW);

    // 手动篡改:把 chapter.json.sourceText 改空,但 script.md 保留(模拟 bug 现场)
    const { writeFile } = await import("node:fs/promises");
    const projectDir = workspacePath.resolveVirtualPath("/workspace/projects/test-project");
    const chapterJsonPath = join(projectDir, "chapters", "chapter-001", "chapter.json");
    const chapterJson = JSON.parse(await (await import("node:fs/promises")).readFile(chapterJsonPath, "utf8"));
    chapterJson.sourceText = "";
    await writeFile(chapterJsonPath, JSON.stringify(chapterJson, null, 2) + "\n", "utf8");

    // 重载:sourceText 应来自 script.md(非空),而非 chapter.json(空)
    const reloader = new ProjectRepository(workspacePath);
    await reloader.ensureLoaded();
    const reloaded = reloader.getProject("test-project");
    const reloadedChapter = reloaded!.chapters.find((c) => c.id === "chapter_001")!;

    expect(reloadedChapter.sourceText).toBe("正式正文内容");
  });

  it("草稿章节正式正文为空时 → 即使残留版本也保持空白", async () => {
    const chapter = buildChapter({
      sourceText: "",
      currentScriptVersionId: "chapter_001_script_v001",
      scriptVersions: [
        {
          id: "chapter_001_script_v001",
          projectId: "test-project",
          chapterId: "chapter_001",
          version: 1,
          sourcePath: "projects/test-project/chapters/chapter-001/script.versions/script-v001.md",
          status: "current",
          createdAt: NOW,
          sourceText: "不应恢复到草稿的旧版本正文",
        },
      ],
    });
    const project = buildProject(chapter);

    const writer = new ProjectRepository(workspacePath);
    await writer.saveProject(project, STUB_WORKFLOW);

    const reloader = new ProjectRepository(workspacePath);
    await reloader.ensureLoaded();
    const reloaded = reloader.getProject("test-project");
    const reloadedChapter = reloaded!.chapters.find((c) => c.id === "chapter_001")!;

    // 空章节是合法状态(草稿章),不能因为残留版本而被自动填充
    expect(reloadedChapter.sourceText).toBe("");
    expect(reloadedChapter.status).toBe("draft");
  });

  it("多次写入不同 sourceText → 每次重载都拿到最新值", async () => {
    const chapter = buildChapter({ sourceText: "第一版正文" });
    const project = buildProject(chapter);

    const repo = new ProjectRepository(workspacePath);
    await repo.saveProject(project, STUB_WORKFLOW);

    // 第二次写入(模拟用户保存新草稿)
    const updatedChapter = { ...chapter, sourceText: "第二版正文(已修改)" };
    const updatedProject = { ...project, sourceText: updatedChapter.sourceText, chapters: [updatedChapter] };
    await repo.saveProject(updatedProject, STUB_WORKFLOW);

    const reloader = new ProjectRepository(workspacePath);
    await reloader.ensureLoaded();
    const reloaded = reloader.getProject("test-project");
    const reloadedChapter = reloaded!.chapters.find((c) => c.id === "chapter_001")!;

    expect(reloadedChapter.sourceText).toBe("第二版正文(已修改)");
  });
});
