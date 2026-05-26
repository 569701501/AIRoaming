import { defineStore } from "pinia";
import type {
  AIRuntimeModelItem,
  AIRuntimeModelSelection,
  CreateProjectRequest,
  DialogueMessageItem,
  DialogueStreamEvent,
  DialogueThread,
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
  activeStepKey: string;
  snapshot: WorkbenchSnapshot | null;
  dialogueThread: DialogueThread | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  runtimeModels: AIRuntimeModelItem[];
  selectedDialogueModel: AIRuntimeModelSelection | null;
  runtimeModelError: string | null;
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
    activeStepKey: "project_story",
    snapshot: null,
    dialogueThread: null,
    dialogueSending: false,
    dialogueError: null,
    runtimeModels: [],
    selectedDialogueModel: null,
    runtimeModelError: null,
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
          const [workbench, dialogue] = await Promise.all([
            api.workbench(this.activeProjectId),
            api.dialogueThread(this.activeProjectId, this.activeStepKey),
          ]);
          this.snapshot = workbench.snapshot;
          this.dialogueThread = dialogue.thread;
        } else {
          this.snapshot = null;
          this.dialogueThread = null;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "工作台连接失败";
        if (this.activeProjectId) {
          this.snapshot = null;
          this.dialogueThread = null;
        }
      } finally {
        this.loading = false;
      }
    },
    async createProject(input: CreateProjectRequest): Promise<ProjectListItem | null> {
      this.loading = true;
      this.error = null;
      try {
        const result = await api.createProject(input);
        this.activeProjectId = result.project.id;
        this.activeStepKey = "project_story";
        await this.refresh();
        return result.project;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "项目创建失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async openProject(projectId: string, stepKey = "project_story") {
      this.activeProjectId = projectId;
      this.activeStepKey = stepKey;
      this.snapshot = null;
      this.dialogueThread = null;
      this.dialogueError = null;
      await this.refresh();
    },
    async loadRuntimeModels() {
      this.runtimeModelError = null;
      try {
        const result = await api.listRuntimeModels();
        this.runtimeModels = result.items;

        const selected = this.selectedDialogueModel;
        const selectedStillExists = selected
          ? result.items.some((item) => item.providerId === selected.providerId && item.modelId === selected.modelId)
          : false;
        if (selectedStillExists && selected) {
          this.selectedDialogueModel = selected;
          return;
        }

        const defaultModel = result.items.find((item) => item.default) ?? result.items[0];
        this.selectedDialogueModel = defaultModel
          ? {
              providerId: defaultModel.providerId,
              modelId: defaultModel.modelId,
            }
          : result.defaultModel;
      } catch (error) {
        this.runtimeModelError = error instanceof Error ? error.message : "模型列表加载失败";
      }
    },
    selectDialogueModel(model: AIRuntimeModelSelection) {
      this.selectedDialogueModel = model;
    },
    async deleteProject(projectId: string) {
      this.loading = true;
      this.error = null;
      try {
        await api.deleteProject(projectId);
        if (this.activeProjectId === projectId) {
          this.activeProjectId = null;
          this.activeStepKey = "project_story";
          this.snapshot = null;
          this.dialogueThread = null;
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
    async sendDialogueMessage(content: string) {
      this.dialogueSending = true;
      this.dialogueError = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const stepKey = this.activeStepKey;
        await api.sendDialogueMessageStream(projectId, stepKey, {
          content,
          stepKey,
          model: this.selectedDialogueModel ?? undefined,
        }, (event) => this.applyDialogueStreamEvent(event));
      } catch (error) {
        this.dialogueError = error instanceof Error ? error.message : "对话发送失败";
      } finally {
        this.dialogueSending = false;
      }
    },
    applyDialogueStreamEvent(event: DialogueStreamEvent) {
      if (event.type === "dialogue.message.created" && event.thread) {
        this.dialogueThread = event.thread;
        return;
      }

      if (event.type === "dialogue.message.delta") {
        this.updateDialogueMessageContent(event.messageId, event.content ?? "", "running");
        return;
      }

      if (event.type === "dialogue.message.completed") {
        if (event.thread) {
          this.dialogueThread = event.thread;
          return;
        }
        if (event.assistantMessage) {
          this.upsertDialogueMessage(event.assistantMessage);
        }
        return;
      }

      if (event.type === "dialogue.error") {
        this.dialogueError = event.error?.message ?? "对话发送失败";
        if (event.thread) {
          this.dialogueThread = event.thread;
        } else if (event.assistantMessage) {
          this.upsertDialogueMessage(event.assistantMessage);
        }
      }
    },
    updateDialogueMessageContent(messageId: string | undefined, content: string, status: DialogueMessageItem["status"]) {
      if (!messageId || !this.dialogueThread) {
        return;
      }

      this.dialogueThread = {
        ...this.dialogueThread,
        messages: this.dialogueThread.messages.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          return {
            ...message,
            content,
            status,
          };
        }),
      };
    },
    upsertDialogueMessage(nextMessage: DialogueMessageItem) {
      if (!this.dialogueThread) {
        return;
      }

      const exists = this.dialogueThread.messages.some((message) => message.id === nextMessage.id);
      this.dialogueThread = {
        ...this.dialogueThread,
        messages: exists
          ? this.dialogueThread.messages.map((message) => (message.id === nextMessage.id ? nextMessage : message))
          : [...this.dialogueThread.messages, nextMessage],
      };
    },
    closeProject() {
      this.activeProjectId = null;
      this.activeStepKey = "project_story";
      this.snapshot = null;
      this.dialogueThread = null;
      this.dialogueError = null;
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
