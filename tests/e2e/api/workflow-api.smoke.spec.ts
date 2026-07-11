import { lstat } from "node:fs/promises";
import path from "node:path";
import type {
  ChapterListItem,
  CreateProjectRequest,
  DeleteProjectResponse,
  HealthResponse,
  ProjectListItem,
  WorkbenchSnapshot,
  WorkspaceInfo,
} from "@airoaming/shared";
import { cleanupE2EProject, expect, test } from "../support/e2e-fixture.ts";

const EXPECTED_STAGE_KEYS = [
  "project_story",
  "story_structure",
  "storyboard",
  "image_preflight",
  "image_candidates",
  "layout_export",
  "asset_package",
] as const;

test("API-01～API-04：rain_smoke 可通过公开 HTTP 完成创建、读取和物理清理", async ({ api, runtime }, testInfo) => {
  let projectId: string | null = null;
  const cleanupProjectIds = new Set<string>();
  let primaryTestFailed = false;
  const fixtureName = `雨夜末班车 · rain_smoke · ${runtime.runId} · api-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${testInfo.retry}`;

  try {
    await test.step("API-01：健康检查与 workspace 只暴露虚拟路径", async () => {
      const [health, workspace] = await Promise.all([
        api.get<HealthResponse>("/health"),
        api.get<WorkspaceInfo>("/workspace"),
      ]);

      expect(health).toMatchObject({
        success: true,
        data: { service: "airoaming-server", status: "ok" },
      });
      expect(workspace).toEqual({
        success: true,
        data: {
          virtualRoot: "/workspace",
          projectsPath: "/workspace/projects",
          ready: true,
        },
      });
      expect(JSON.stringify({ health, workspace })).not.toContain(runtime.workspaceRoot);
    });

    const createInput: CreateProjectRequest = {
      name: fixtureName,
      type: "comic",
      comicFormat: "vertical_scroll",
      storyTitle: "雨夜末班车",
      description: "林夏在雨夜站台等末班车，广播异常，空车进站。",
    };

    await test.step("API-02：显式版式创建项目及唯一默认章节", async () => {
      const created = await api.post<{ project: ProjectListItem }>("/projects", createInput);
      projectId = created.data.project.id;
      cleanupProjectIds.add(projectId);
      expect(created.success).toBe(true);
      expect(created.data.project).toMatchObject({
        id: projectId,
        name: fixtureName,
        type: "comic",
        comicFormat: "vertical_scroll",
        status: "draft",
        chapterCount: 1,
      });
      expect(created.data.project.currentChapterId).toEqual(expect.any(String));

      const [listed, chapters] = await Promise.all([
        api.get<{ items: ProjectListItem[] }>("/projects"),
        api.get<{ chapters: ChapterListItem[]; currentChapterId: string | null }>(
          `/projects/${encodeURIComponent(projectId)}/chapters`,
        ),
      ]);
      expect(listed.data.items.find((project) => project.id === projectId)).toMatchObject({
        name: fixtureName,
        comicFormat: "vertical_scroll",
      });
      expect(chapters.data.currentChapterId).toBe(created.data.project.currentChapterId);
      expect(chapters.data.chapters).toHaveLength(1);
      expect(chapters.data.chapters[0]).toMatchObject({
        id: created.data.project.currentChapterId,
        projectId,
        order: 1,
        status: "draft",
      });
      expect(await exists(path.join(runtime.workspaceRoot, "projects", projectId))).toBe(true);
    });

    await test.step("API-03：workbench 七阶段顺序及 active/waiting 门禁正确", async () => {
      expect(projectId).not.toBeNull();
      const workbench = await api.get<{ snapshot: WorkbenchSnapshot }>(
        `/projects/${encodeURIComponent(projectId!)}/workbench`,
      );
      const { snapshot } = workbench.data;

      expect(snapshot.currentChapter?.id).toBe(snapshot.workflow.currentChapterId);
      expect(snapshot.currentChapter?.status).toBe("draft");
      expect(snapshot.workflow.currentStepKey).toBe("project_story");
      expect(snapshot.workflow.steps.map((step) => step.key)).toEqual(EXPECTED_STAGE_KEYS);
      expect(snapshot.workflow.steps.map((step) => step.status)).toEqual([
        "active",
        "waiting",
        "waiting",
        "waiting",
        "waiting",
        "waiting",
        "waiting",
      ]);
      expect(snapshot.stages).toEqual(snapshot.workflow.steps);
    });

    await test.step("API-04：删除后列表与临时 workspace 均无该项目", async () => {
      expect(projectId).not.toBeNull();
      const deletingId = projectId!;
      const isolationProject = await api.createRainSmokeProject(
        `api-delete-isolation-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
      );
      cleanupProjectIds.add(isolationProject.id);
      const deleted = await api.delete<DeleteProjectResponse>(`/projects/${encodeURIComponent(deletingId)}`);
      expect(deleted).toMatchObject({
        success: true,
        data: { deletedProjectId: deletingId },
      });

      const listed = await api.get<{ items: ProjectListItem[] }>("/projects");
      expect(listed.data.items.some((project) => project.id === deletingId)).toBe(false);
      expect(listed.data.items.some((project) => project.id === isolationProject.id)).toBe(true);
      expect(await exists(path.join(runtime.workspaceRoot, "projects", deletingId))).toBe(false);
      expect(await exists(path.join(runtime.workspaceRoot, "projects", isolationProject.id))).toBe(true);
    });
  } catch (error) {
    primaryTestFailed = true;
    throw error;
  } finally {
    for (const createdProjectId of cleanupProjectIds) {
      await cleanupE2EProject(api, createdProjectId, testInfo, { primaryTestFailed });
    }
  }
});

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
