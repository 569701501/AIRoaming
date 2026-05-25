import { defineStore } from "pinia";
import type {
  CreateProjectRequest,
  GenerationTaskItem,
  HealthResponse,
  ProjectListItem,
  UpdateProjectDraftRequest,
  WorkbenchSnapshot,
  WorkspaceInfo,
} from "@airoaming/shared";
import { api } from "../services/api";

interface WorkbenchState {
  health: HealthResponse | null;
  workspace: WorkspaceInfo | null;
  projects: ProjectListItem[];
  activeProjectId: string | null;
  snapshot: WorkbenchSnapshot | null;
  tasks: GenerationTaskItem[];
  loading: boolean;
  error: string | null;
}

export const useWorkbenchStore = defineStore("workbench", {
  state: (): WorkbenchState => ({
    health: null,
    workspace: null,
    projects: [],
    activeProjectId: null,
    snapshot: null,
    tasks: [],
    loading: false,
    error: null,
  }),
  getters: {
    runningTaskCount: (state) => state.tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    completedTaskCount: (state) => state.tasks.filter((task) => task.status === "succeeded").length,
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = null;
      try {
        const [health, workspace, projects, tasks] = await Promise.all([
          api.health(),
          api.workspace(),
          api.listProjects(),
          api.listTasks(),
        ]);
        this.health = health;
        this.workspace = workspace;
        this.projects = projects.items;
        this.tasks = tasks.items;
        if (this.activeProjectId) {
          const workbench = await api.workbench(this.activeProjectId);
          this.snapshot = workbench.snapshot;
        } else {
          this.snapshot = null;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "工作台连接失败";
      } finally {
        this.loading = false;
      }
    },
    async createProject(input: CreateProjectRequest) {
      this.loading = true;
      this.error = null;
      try {
        const result = await api.createProject(input);
        this.activeProjectId = result.project.id;
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "项目创建失败";
      } finally {
        this.loading = false;
      }
    },
    async openProject(projectId: string) {
      this.activeProjectId = projectId;
      await this.refresh();
    },
    async deleteProject(projectId: string) {
      this.loading = true;
      this.error = null;
      try {
        await api.deleteProject(projectId);
        if (this.activeProjectId === projectId) {
          this.activeProjectId = null;
          this.snapshot = null;
        }
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "项目删除失败";
      } finally {
        this.loading = false;
      }
    },
    async saveProjectDraft(input: UpdateProjectDraftRequest) {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateProjectDraft(projectId, input);
        this.snapshot = result.snapshot;
        this.projects = this.projects
          .map((project) => (project.id === result.project.id ? result.project : project))
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      } catch (error) {
        this.error = error instanceof Error ? error.message : "故事草稿保存失败";
      } finally {
        this.loading = false;
      }
    },
    closeProject() {
      this.activeProjectId = null;
      this.snapshot = null;
    },
    async createMockStoryTask() {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        await api.createTask({
          projectId,
          type: "story_parse",
          target: {
            type: "project",
            id: projectId,
          },
          input: {
            sourceText: this.snapshot?.story.sourceText ?? "",
            mode: "faithful",
            language: "zh-CN",
          },
          options: {
            provider: "mock",
          },
        });
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "任务创建失败";
      } finally {
        this.loading = false;
      }
    },
    async cancelTask(taskId: string) {
      this.loading = true;
      this.error = null;
      try {
        await api.cancelTask(taskId);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "任务取消失败";
      } finally {
        this.loading = false;
      }
    },
  },
});
