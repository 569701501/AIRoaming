import { defineStore } from "pinia";
import {
  type AIRuntimeModelItem,
  type AIRuntimeModelSelection,
  type ChapterDetail,
  type ChapterImagePreflight,
  type ChapterListItem,
  type ChapterStoryboard,
  type CompleteChapterResponse,
  type CompleteChapterRequest,
  type GenerateCharacterReferenceRequest,
  type GenerateSceneReferenceRequest,
  type CreateProjectRequest,
  type DialogueMessageItem,
  type DialogueStreamEvent,
  type DialogueThread,
  type DialogueToolResult,
  type GenerationTaskItem,
  type HealthResponse,
  type ProjectCharacter,
  type ProjectListItem,
  type ResolveImagePreflightCharacterRequest,
  type SaveChapterDraftRequest,
  type UpdateProjectCharacterRequest,
  type SendDialogueMessageRequest,
  type StoryStructureJson,
  type ChapterStoryStructure,
  type StoryboardJson,
  type UpdateProjectDraftRequest,
  type WorkbenchSnapshot,
  type ScriptWorkingCopyDto,
  type ScriptPendingSuggestionDto,
  type WorkspaceInfo,
} from "@airoaming/shared";
import { ApiClientError, api } from "../services/api";
import {
  getCurrentChapterId,
  getCurrentChapterSourceText,
  getProjectStatusFromChapter,
  getSceneName,
  mapStoryboardShots,
  resolveChapterList,
  toChapterListItem,
} from "../utils/workbench-chapter";
import {
  isChapterImagePreflightReady,
  isProjectCharacterLibraryReady,
} from "../utils/workbench-preflight";
import {
  patchWorkflowForChapter,
} from "../utils/workbench-workflow";

interface WorkbenchState {
  health: HealthResponse | null;
  workspace: WorkspaceInfo | null;
  projects: ProjectListItem[];
  activeProjectId: string | null;
  activeChapterId: string | null;
  activeStepKey: string;
  snapshot: WorkbenchSnapshot | null;
  scriptWorkingCopy: ScriptWorkingCopyDto | null;
  scriptPendingSuggestion: ScriptPendingSuggestionDto | null;
  dialogueThread: DialogueThread | null;
  chapterCompletionPrompt: ChapterCompletionPrompt | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  dialogueNotice: string | null;
  runtimeModels: AIRuntimeModelItem[];
  selectedDialogueModel: AIRuntimeModelSelection | null;
  runtimeModelError: string | null;
  tasks: GenerationTaskItem[];
  loading: boolean;
  error: string | null;
  creatingProject: boolean;
  createProjectErrorCode: CreateProjectErrorCode | null;
}

export type CreateProjectErrorCode =
  | "PROJECT_BODY_INVALID"
  | "PROJECT_INPUT_FIELD_UNSUPPORTED"
  | "PROJECT_NAME_REQUIRED"
  | "COMIC_FORMAT_REQUIRED"
  | "COMIC_FORMAT_INVALID"
  | "PROJECT_CREATE_FAILED";

export interface ChapterCompletionPrompt {
  completedChapterId: string;
  completedChapterTitle: string;
  nextChapterId: string | null;
  nextChapterTitle: string | null;
}

export const useWorkbenchStore = defineStore("workbench", {
  state: (): WorkbenchState => ({
    health: null,
    workspace: null,
    projects: [],
    activeProjectId: null,
    activeChapterId: null,
    activeStepKey: "project_story",
    snapshot: null,
    scriptWorkingCopy: null,
    scriptPendingSuggestion: null,
    dialogueThread: null,
    chapterCompletionPrompt: null,
    dialogueSending: false,
    dialogueError: null,
    dialogueNotice: null,
    runtimeModels: [],
    selectedDialogueModel: null,
    runtimeModelError: null,
    tasks: [],
    loading: false,
    error: null,
    creatingProject: false,
    createProjectErrorCode: null,
  }),
  getters: {
    runningTaskCount: (state) => state.tasks.filter((task) => task.status === "queued" || task.status === "running" || task.status === "retrying").length,
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
          const workbench = await api.workbench(this.activeProjectId, this.activeChapterId);
          this.snapshot = workbench.snapshot;
          this.activeChapterId = workbench.snapshot.currentChapter?.id ?? null;
          if (workbench.snapshot.versioningCapability.mode === "g2_db" && this.activeChapterId) {
            [this.scriptWorkingCopy, this.scriptPendingSuggestion] = await Promise.all([
              api.getScriptWorkingCopy(this.activeProjectId, this.activeChapterId),
              api.getScriptPendingSuggestion(this.activeProjectId, this.activeChapterId),
            ]);
          } else {
            this.scriptWorkingCopy = null;
            this.scriptPendingSuggestion = null;
          }
          const dialogue = await api.dialogueThread(this.activeProjectId, this.activeStepKey, this.getActiveDialogueChapterId());
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
    getActiveDialogueChapterId(): string | null {
      return ["project_story", "story_structure", "storyboard", "image_preflight", "image_candidates", "layout_export"].includes(this.activeStepKey)
        ? this.activeChapterId
        : null;
    },
    clearCreateProjectError() {
      this.createProjectErrorCode = null;
    },
    async createProject(input: CreateProjectRequest): Promise<ProjectListItem | null> {
      this.creatingProject = true;
      this.createProjectErrorCode = null;
      try {
        const result = await api.createProject(input);
        this.projects = [result.project, ...this.projects.filter((project) => project.id !== result.project.id)];
        this.activeProjectId = result.project.id;
        this.activeChapterId = result.project.currentChapterId ?? null;
        this.activeStepKey = "project_story";
        return result.project;
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : "PROJECT_CREATE_FAILED";
        this.createProjectErrorCode = (
          code === "PROJECT_BODY_INVALID"
          || code === "PROJECT_INPUT_FIELD_UNSUPPORTED"
          || code === "PROJECT_NAME_REQUIRED"
          || code === "COMIC_FORMAT_REQUIRED"
          || code === "COMIC_FORMAT_INVALID"
        ) ? code : "PROJECT_CREATE_FAILED";
        return null;
      } finally {
        this.creatingProject = false;
      }
    },
    async openProject(
      projectId: string,
      stepKey = "project_story",
      chapterId: string | null = null,
      options: { preserveSnapshot?: boolean } = {},
    ) {
      const shouldPreserveSnapshot = Boolean(options.preserveSnapshot && this.activeProjectId === projectId && this.snapshot);
      this.activeProjectId = projectId;
      this.activeChapterId = chapterId;
      this.activeStepKey = stepKey;
      if (!shouldPreserveSnapshot) {
        this.snapshot = null;
        this.scriptWorkingCopy = null;
        this.scriptPendingSuggestion = null;
      }
      this.dialogueThread = null;
      this.dialogueError = null;
      this.dialogueNotice = null;
      if (!this.chapterCompletionPrompt || this.chapterCompletionPrompt.completedChapterId !== chapterId) {
        this.chapterCompletionPrompt = null;
      }
      await this.refresh();
    },
    async loadRuntimeModels() {
      this.runtimeModelError = null;
      try {
        const result = await api.listRuntimeModels();
        this.runtimeModels = result.items;

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
    applyChapterUpdate(chapter: ChapterDetail, chapters: ChapterListItem[] | null = null) {
      if (!this.snapshot) {
        return;
      }

      const nextChapters = resolveChapterList(this.snapshot.chapters, chapters, chapter);
      const workflow = patchWorkflowForChapter(this.snapshot, chapter);
      const hasStory = chapter.sourceText.trim().length > 0;
      const storyStructure = this.snapshot.storyStructure?.chapterId === chapter.id && chapter.currentStoryVersionId
        ? this.snapshot.storyStructure
        : null;
      const storyboard = this.snapshot.storyboard?.chapterId === chapter.id && chapter.status === "storyboard_done"
        ? this.snapshot.storyboard
        : null;
      const imagePreflight = this.snapshot.imagePreflight?.chapterId === chapter.id
        ? this.snapshot.imagePreflight
        : null;
      this.snapshot = {
        ...this.snapshot,
        project: {
          ...this.snapshot.project,
          status: getProjectStatusFromChapter(chapter, isProjectCharacterLibraryReady(this.snapshot.characters)),
          updatedAt: chapter.updatedAt,
        },
        chapters: nextChapters,
        currentChapter: chapter,
        storyStructure,
        storyboard,
        imagePreflight,
        workflow,
        stages: workflow.steps,
        story: {
          ...this.snapshot.story,
          id: chapter.currentStoryVersionId ?? "chapter_script_draft",
          chapterId: chapter.id,
          title: chapter.title || this.snapshot.project.storyTitle,
          sourceText: chapter.sourceText,
          summary: storyStructure?.structureJson.synopsis || (hasStory ? "故事已进入项目，下一步执行结构化剧情。" : "还没有故事原文。"),
          beats: (storyStructure?.structureJson.beats ?? []).map((beat) => ({
            id: beat.id,
            order: beat.order,
            summary: beat.summary,
            sceneName: getSceneName(storyStructure, beat.sceneId),
            characterNames: beat.characters,
          })),
        },
        shots: mapStoryboardShots(storyboard, storyStructure, chapter.id),
      };
      this.activeChapterId = chapter.id;
      this.patchProjectPreviewFromChapter(chapter, nextChapters.length);
    },
    applyStoryStructureUpdate(storyStructure: ChapterStoryStructure, chapter: ChapterDetail, chapters: ChapterListItem[] | null = null) {
      this.applyChapterUpdate(chapter, chapters);
      if (!this.snapshot) {
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        storyStructure,
        storyboard: null,
        pendingStoryboard: null,
        imagePreflight: null,
        shots: [],
        story: {
          ...this.snapshot.story,
          id: storyStructure.id,
          summary: storyStructure.structureJson.synopsis,
          beats: storyStructure.structureJson.beats.map((beat) => ({
            id: beat.id,
            order: beat.order,
            summary: beat.summary,
            sceneName: getSceneName(storyStructure, beat.sceneId),
            characterNames: beat.characters,
          })),
        },
      };
    },
    applyStoryboardUpdate(storyboard: ChapterStoryboard, chapter: ChapterDetail, chapters: ChapterListItem[] | null = null) {
      this.applyChapterUpdate(chapter, chapters);
      if (!this.snapshot) {
        return;
      }

      const nextSnapshot: WorkbenchSnapshot = {
        ...this.snapshot,
        storyboard,
        pendingStoryboard: null,
        imagePreflight: null,
        shots: mapStoryboardShots(storyboard, this.snapshot.storyStructure, chapter.id),
      };
      nextSnapshot.workflow = patchWorkflowForChapter(nextSnapshot, chapter);
      nextSnapshot.stages = nextSnapshot.workflow.steps;
      this.snapshot = nextSnapshot;
    },
    applyPendingStoryboardUpdate(storyboard: ChapterStoryboard, chapter: ChapterDetail | null = null, chapters: ChapterListItem[] | null = null) {
      if (chapter) {
        this.applyChapterUpdate(chapter, chapters);
      }
      if (!this.snapshot) {
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        pendingStoryboard: storyboard,
      };
    },
    applyProjectCharactersUpdate(characters: ProjectCharacter[], assets: WorkbenchSnapshot["assets"] | null = null) {
      if (!this.snapshot) {
        return;
      }

      const nextSnapshot: WorkbenchSnapshot = {
        ...this.snapshot,
        characters,
        assets: assets ?? this.snapshot.assets,
      };
      const currentChapter = nextSnapshot.currentChapter;
      if (currentChapter) {
        nextSnapshot.workflow = patchWorkflowForChapter(nextSnapshot, currentChapter);
        nextSnapshot.stages = nextSnapshot.workflow.steps;
        nextSnapshot.project = {
          ...nextSnapshot.project,
          status: getProjectStatusFromChapter(currentChapter, isProjectCharacterLibraryReady(characters)),
        };
      }
      this.snapshot = nextSnapshot;
    },
    mergeTasks(tasks: GenerationTaskItem[] = []) {
      if (tasks.length === 0) {
        return;
      }

      const byId = new Map(this.tasks.map((task) => [task.id, task]));
      for (const task of tasks) {
        byId.set(task.id, task);
      }
      this.tasks = [...byId.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    },
    async refreshTasks() {
      try {
        const tasks = await api.listTasks();
        this.tasks = tasks.items;
      } catch {
        // Task polling is a status convenience and should not interrupt the current workflow.
      }
    },
    async refreshActiveProjectRuntime() {
      const projectId = this.activeProjectId;
      if (!projectId) {
        return;
      }

      try {
        const [tasks, workbench] = await Promise.all([
          api.listTasks(),
          api.workbench(projectId, this.activeChapterId),
        ]);
        this.tasks = tasks.items;
        this.snapshot = workbench.snapshot;
        this.activeChapterId = workbench.snapshot.currentChapter?.id ?? this.activeChapterId;
      } catch {
        // Runtime polling must not replace the user's visible error with a transient refresh failure.
      }
    },
    patchProjectPreviewFromChapter(chapter: ChapterDetail, chapterCount: number) {
      const exists = this.projects.some((project) => project.id === chapter.projectId);
      if (!exists) {
        return;
      }

      this.projects = this.projects
        .map((project) => {
          if (project.id !== chapter.projectId) {
            return project;
          }

          return {
            ...project,
            status: getProjectStatusFromChapter(chapter, isProjectCharacterLibraryReady(this.snapshot?.characters ?? [])),
            currentChapterId: chapter.id,
            chapterCount,
            sourceTextPreview: chapter.sourceText.slice(0, 96),
            updatedAt: chapter.updatedAt,
          };
        })
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    },
    async deleteProject(projectId: string) {
      this.loading = true;
      this.error = null;
      try {
        await api.deleteProject(projectId);
        this.projects = this.projects.filter((project) => project.id !== projectId);
        if (this.activeProjectId === projectId) {
          this.activeProjectId = null;
          this.activeChapterId = null;
          this.activeStepKey = "project_story";
          this.snapshot = null;
          this.dialogueThread = null;
          this.dialogueNotice = null;
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
        this.activeChapterId = result.snapshot.currentChapter?.id ?? this.activeChapterId;
        this.projects = this.projects
          .map((project) => (project.id === result.project.id ? result.project : project))
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      } catch (error) {
        this.error = error instanceof Error ? error.message : "故事草稿保存失败";
      } finally {
        this.loading = false;
      }
    },
    async saveChapterDraft(chapterId: string, input: SaveChapterDraftRequest) {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        if (this.snapshot?.versioningCapability.mode === "g2_db") {
          if (!this.scriptWorkingCopy || this.scriptWorkingCopy.chapterId !== chapterId) throw new Error("剧本工作稿尚未加载，请刷新后重试");
          const result = await api.updateScriptWorkingCopy(projectId, chapterId, { sourceText: input.sourceText, title: input.title, summary: input.summary, expectedChapterRowVersion: this.scriptWorkingCopy.chapterRowVersion });
          this.scriptWorkingCopy = result.value;
          await this.refreshActiveProjectRuntime();
        } else {
          const result = await api.saveChapterDraft(projectId, chapterId, input);
          this.applyChapterUpdate(result.chapter, result.chapters);
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "章节草稿保存失败";
      } finally {
        this.loading = false;
      }
    },
    async completeChapter(chapterId: string, input: CompleteChapterRequest): Promise<CompleteChapterResponse | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        let completed: CompleteChapterResponse;
        if (this.snapshot?.versioningCapability.mode === "g2_db") {
          if (!this.scriptWorkingCopy || this.scriptWorkingCopy.chapterId !== chapterId) throw new Error("剧本工作稿尚未加载，请刷新后重试");
          const updated = await api.updateScriptWorkingCopy(projectId, chapterId, { sourceText: input.sourceText ?? this.scriptWorkingCopy.sourceText, title: input.title, summary: input.summary, expectedChapterRowVersion: this.scriptWorkingCopy.chapterRowVersion });
          const published = await api.publishScript(projectId, chapterId, { expectedCurrentScriptVersionId: updated.value.currentVersion?.id ?? null, expectedWorkingDigest: updated.value.digest, expectedChapterRowVersion: updated.value.chapterRowVersion, createNextChapter: input.createNextChapter ?? true });
          this.scriptWorkingCopy = published.workingCopy;
          await this.refreshActiveProjectRuntime();
          const snapshot = this.snapshot!;
          const publishedChapter = snapshot.chapters.find((item) => item.id === chapterId) ?? snapshot.currentChapter!;
          completed = { completedChapter: publishedChapter as ChapterDetail, activeChapter: publishedChapter as ChapterDetail, chapters: snapshot.chapters, scriptVersion: published.scriptVersion as unknown as CompleteChapterResponse["scriptVersion"], createdNextChapter: published.createdNextChapter };
        } else {
          completed = await api.completeChapter(projectId, chapterId, input);
          this.applyChapterUpdate(completed.completedChapter, completed.chapters);
        }
        const nextChapter = completed.chapters.find((item) => item.order > completed.completedChapter.order) ?? null;
        this.chapterCompletionPrompt = {
          completedChapterId: completed.completedChapter.id,
          completedChapterTitle: completed.completedChapter.title,
          nextChapterId: nextChapter?.id ?? null,
          nextChapterTitle: nextChapter?.title ?? null,
        };
        return completed;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "完成本章失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    clearChapterCompletionPrompt() {
      this.chapterCompletionPrompt = null;
    },
    async confirmChapterPendingSource(chapterId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        if (this.snapshot?.versioningCapability.mode === "g2_db") {
          if (!this.scriptPendingSuggestion || this.scriptPendingSuggestion.chapterId !== chapterId || !this.scriptWorkingCopy) throw new Error("没有可采用的 AI 草稿");
          const result = await api.adoptScriptPendingSuggestion(projectId, chapterId, { pendingId: this.scriptPendingSuggestion.id, expectedPendingRowVersion: this.scriptPendingSuggestion.rowVersion, expectedPendingDigest: this.scriptPendingSuggestion.digest, expectedChapterRowVersion: this.scriptPendingSuggestion.chapterRowVersion });
          this.scriptWorkingCopy = result.value;
          this.scriptPendingSuggestion = null;
          await this.refreshActiveProjectRuntime();
          this.dialogueNotice = "已采用 AI 草稿，正式正文仍需发布后才会形成历史版本。";
        } else {
          const result = await api.confirmChapterPendingSource(projectId, chapterId);
          this.applyChapterUpdate(result.chapter, result.chapters);
          this.dialogueNotice = `已采用「${result.chapter.title}」的草稿，正式正文已更新。`;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "采用草稿失败";
      } finally {
        this.loading = false;
      }
    },
    async discardChapterPendingSource(chapterId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        if (this.snapshot?.versioningCapability.mode === "g2_db") {
          if (!this.scriptPendingSuggestion || this.scriptPendingSuggestion.chapterId !== chapterId) throw new Error("没有可丢弃的 AI 草稿");
          await api.discardScriptPendingSuggestion(projectId, chapterId, { pendingId: this.scriptPendingSuggestion.id, expectedPendingRowVersion: this.scriptPendingSuggestion.rowVersion });
          this.scriptPendingSuggestion = null;
          await this.refreshActiveProjectRuntime();
          this.dialogueNotice = "已丢弃 AI 草稿。";
        } else {
          const result = await api.discardChapterPendingSource(projectId, chapterId);
          this.applyChapterUpdate(result.chapter, result.chapters);
          this.dialogueNotice = `已丢弃「${result.chapter.title}」的草稿。`;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "丢弃草稿失败";
      } finally {
        this.loading = false;
      }
    },
    async confirmStoryStructure(chapterId: string, structureJson: StoryStructureJson): Promise<ChapterStoryStructure | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmChapterStoryStructure(projectId, chapterId, { structureJson });
        this.applyStoryStructureUpdate(result.storyStructure, result.chapter, result.chapters);
        await this.refreshActiveProjectRuntime();
        this.dialogueNotice = `已确认「${result.chapter.title}」的剧情结构。`;
        return result.storyStructure;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认剧情结构失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async updateStoryStructure(chapterId: string, structureJson: StoryStructureJson): Promise<ChapterStoryStructure | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateChapterStoryStructure(projectId, chapterId, { structureJson });
        this.applyStoryStructureUpdate(result.storyStructure, result.chapter, result.chapters);
        return result.storyStructure;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "更新剧情结构失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async confirmStoryboard(chapterId: string, storyboardJson: StoryboardJson): Promise<ChapterStoryboard | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmChapterStoryboard(projectId, chapterId, { storyboardJson });
        this.applyStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        this.dialogueNotice = `已确认「${result.chapter.title}」的分镜。`;
        return result.storyboard;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认分镜失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async savePendingStoryboard(chapterId: string, storyboardJson: StoryboardJson): Promise<ChapterStoryboard | null> {
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.savePendingChapterStoryboard(projectId, chapterId, { storyboardJson });
        this.applyPendingStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        return result.storyboard;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "保存待确认分镜失败";
        return null;
      }
    },
    async updateStoryboard(chapterId: string, storyboardJson: StoryboardJson): Promise<ChapterStoryboard | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateChapterStoryboard(projectId, chapterId, { storyboardJson });
        this.applyStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        return result.storyboard;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "更新分镜失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async confirmImagePreflight(chapterId: string): Promise<ChapterImagePreflight | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmChapterImagePreflight(projectId, chapterId, {});
        this.applyChapterUpdate(result.chapter, result.chapters);
        if (!this.snapshot) {
          return result.imagePreflight;
        }
        const nextSnapshot: WorkbenchSnapshot = {
          ...this.snapshot,
          imagePreflight: result.imagePreflight,
        };
        nextSnapshot.workflow = patchWorkflowForChapter(nextSnapshot, result.chapter);
        nextSnapshot.stages = nextSnapshot.workflow.steps;
        this.snapshot = nextSnapshot;
        this.dialogueNotice = `已确认「${result.chapter.title}」的出图准备。`;
        return result.imagePreflight;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认出图准备失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async generateImageCandidates(shotId: string, candidateCount: number): Promise<GenerationTaskItem | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const snapshot = this.snapshot;
        if (!snapshot) {
          throw new Error("项目快照还没有加载");
        }
        const chapterId = getCurrentChapterId(snapshot);
        if (!chapterId) {
          throw new Error("请先打开一个章节");
        }
        const shot = snapshot.shots.find((item) => item.id === shotId);
        if (!shot) {
          throw new Error("未找到当前镜头");
        }

        const result = await api.createTask({
          projectId,
          type: "image_generate",
          target: {
            type: "shot",
            id: shot.id,
            chapterId,
          },
          input: {
            chapterId,
            shotId: shot.id,
            candidateCount,
          },
          options: {
            candidateCount,
            provider: "default",
          },
        });
        this.mergeTasks([result.task]);
        this.dialogueNotice = `已为镜头 ${shot.order} 创建 ${candidateCount} 张候选图生成任务。`;
        // 生图可能较久，启动后立即进入 runtime 轮询刷新候选
        return result.task;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "候选图任务创建失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    /** 批量生成本章所有未锁定镜头的候选图(每镜默认1张,已锁跳过)。
     *  复用现有 createTask + 后端串行队列,无需新后端 API。 */
    async generateAllUnlockedShots(candidateCount = 1): Promise<number> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        const snapshot = this.snapshot;
        if (!projectId || !snapshot) {
          throw new Error("请先进入项目");
        }
        const chapterId = getCurrentChapterId(snapshot);
        if (!chapterId) {
          throw new Error("请先打开一个章节");
        }
        const unlocked = snapshot.shots.filter((shot) => !shot.lockedCandidateId);
        if (unlocked.length === 0) {
          this.dialogueNotice = "本章镜头已全部锁定,无需批量生成。";
          return 0;
        }
        let created = 0;
        for (const shot of unlocked) {
          const result = await api.createTask({
            projectId,
            type: "image_generate",
            target: { type: "shot", id: shot.id, chapterId },
            input: {
              chapterId,
              shotId: shot.id,
              candidateCount,
            },
            options: { candidateCount, provider: "default" },
          });
          this.mergeTasks([result.task]);
          created += 1;
        }
        this.dialogueNotice = `已为 ${created} 个未锁定镜头创建候选图任务,正在串行生成。`;
        return created;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "批量生成候选图失败";
        return 0;
      } finally {
        this.loading = false;
      }
    },
    async lockChapterCandidate(candidateId: string): Promise<boolean> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : null;
        if (!projectId || !chapterId || !this.snapshot) {
          throw new Error("请先打开章节");
        }
        const result = await api.lockChapterCandidate(projectId, chapterId, candidateId);
        this.snapshot = {
          ...this.snapshot,
          candidates: result.candidates,
          shots: result.shots,
          storyboard: result.storyboard,
          assets: result.assets,
          currentChapter: result.chapter,
          chapters: result.chapters,
        };
        this.snapshot.workflow = patchWorkflowForChapter(this.snapshot, result.chapter);
        this.snapshot.stages = this.snapshot.workflow.steps;
        this.dialogueNotice = `已锁定候选「${result.candidate.label}」。`;
        return true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "锁定候选图失败";
        return false;
      } finally {
        this.loading = false;
      }
    },
    async completeChapterImages(): Promise<boolean> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : null;
        if (!projectId || !chapterId || !this.snapshot) {
          throw new Error("请先打开章节");
        }
        const result = await api.completeChapterImages(projectId, chapterId);
        this.snapshot = {
          ...this.snapshot,
          currentChapter: result.chapter,
          chapters: result.chapters,
          candidates: result.candidates,
          shots: result.shots,
          storyboard: result.storyboard,
          workflow: result.workflow,
          stages: result.workflow.steps,
        };
        this.dialogueNotice = `「${result.chapter.title}」候选图已完成，可进入排版导出。`;
        return true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "完成本章候选图失败";
        return false;
      } finally {
        this.loading = false;
      }
    },
    async buildChapterLayout(): Promise<boolean> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : null;
        if (!projectId || !chapterId || !this.snapshot) {
          throw new Error("请先打开章节");
        }
        const result = await api.buildChapterLayout(projectId, chapterId);
        this.snapshot = {
          ...this.snapshot,
          chapterLayout: result.layout,
          currentChapter: result.chapter,
          chapters: result.chapters,
          assets: result.assets,
        };
        this.dialogueNotice = `已生成 ${result.layout.pages.length} 页排版草稿。`;
        return true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "生成排版失败";
        return false;
      } finally {
        this.loading = false;
      }
    },
    async exportChapterLayout(): Promise<boolean> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : null;
        if (!projectId || !chapterId || !this.snapshot) {
          throw new Error("请先打开章节");
        }
        const result = await api.exportChapterLayout(projectId, chapterId);
        this.snapshot = {
          ...this.snapshot,
          chapterLayout: result.layout,
          currentChapter: result.chapter,
          chapters: result.chapters,
          assets: result.assets,
          workflow: result.workflow,
          stages: result.workflow.steps,
        };
        this.dialogueNotice = `已导出 ${result.exportAssets.length} 页漫画图，可进入素材包。`;
        return true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "导出排版失败";
        return false;
      } finally {
        this.loading = false;
      }
    },
    async exportAssetPackage(): Promise<boolean> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : null;
        if (!projectId || !chapterId || !this.snapshot) {
          throw new Error("请先打开章节");
        }
        const result = await api.exportAssetPackage(projectId, chapterId);
        this.snapshot = {
          ...this.snapshot,
          currentChapter: result.chapter,
          chapters: result.chapters,
          assets: result.assets,
          workflow: result.workflow,
          stages: result.workflow.steps,
        };
        this.dialogueNotice = `素材包已导出：${result.packagePath}`;
        return true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "导出素材包失败";
        return false;
      } finally {
        this.loading = false;
      }
    },
    async resolveImagePreflightCharacter(
      chapterId: string,
      input: ResolveImagePreflightCharacterRequest,
    ): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.resolveImagePreflightCharacter(projectId, chapterId, input);
        this.applyStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            imagePreflight: result.imagePreflight,
          };
        }
        this.dialogueNotice = `已处理出镜角色「${input.token}」。`;
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "处理出镜角色失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async extractProjectCharacters(): Promise<ProjectCharacter[] | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.extractProjectCharacters(projectId, { source: "auto" });
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        await this.refreshActiveProjectRuntime();
        this.dialogueNotice = `已提取 ${result.characters.length} 个项目角色。`;
        return result.characters;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "提取项目角色失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async updateProjectCharacter(characterId: string, input: UpdateProjectCharacterRequest): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateProjectCharacter(projectId, characterId, input);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "更新项目角色失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async generateCharacterReference(characterId: string, input: GenerateCharacterReferenceRequest): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.generateCharacterReference(projectId, characterId, input);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.mergeTasks(result.tasks);
        this.dialogueNotice = result.createdCount > 0 ? "已开始生成角色图。" : "角色图生成任务已在队列中。";
        return this.snapshot?.characters.find((character) => character.id === characterId) ?? null;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "生成角色参考图失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async generateSceneReference(chapterId: string, sceneId: string, input: GenerateSceneReferenceRequest): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.generateSceneReference(projectId, chapterId, sceneId, input);
        // 更新 assets(场景图资产 push 进资产池)和 storyStructure(scene.referenceAssetId 回写)
        if (this.snapshot) {
          const nextSnapshot: WorkbenchSnapshot = {
            ...this.snapshot,
            assets: result.assets,
            storyStructure: result.storyStructure,
          };
          this.snapshot = nextSnapshot;
        }
        this.mergeTasks(result.tasks);
        this.dialogueNotice = result.createdCount > 0 ? "已开始生成场景图。" : "场景图生成任务已在队列中。";
      } catch (error) {
        this.error = error instanceof Error ? error.message : "生成场景图失败";
      } finally {
        this.loading = false;
      }
    },
    async updateAndGenerateCharacterReference(
      characterId: string,
      characterInput: UpdateProjectCharacterRequest,
      referenceInput: GenerateCharacterReferenceRequest,
    ): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const saved = await api.updateProjectCharacter(projectId, characterId, characterInput);
        this.applyProjectCharactersUpdate(saved.characters, saved.assets);
        const result = await api.generateCharacterReference(projectId, characterId, referenceInput);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.mergeTasks(result.tasks);
        this.dialogueNotice = result.createdCount > 0 ? "已开始生成角色图。" : "角色图生成任务已在队列中。";
        return this.snapshot?.characters.find((character) => character.id === characterId) ?? null;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "生成角色参考图失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async deleteCharacterReference(characterId: string, assetId: string): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.deleteCharacterReference(projectId, characterId, assetId);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.dialogueNotice = result.cleanupStatus === "pending" ? "已提交删除，物理文件将由后台安全清理。" : "已删除当前角色图版本。";
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "删除角色图失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async ensureProjectCharacterPreviewTasks(): Promise<number> {
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.ensureProjectCharacterPreviewTasks(projectId);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.mergeTasks(result.tasks);
        return result.createdCount;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "补齐角色预览图任务失败";
        return 0;
      }
    },
    async confirmCharacterPreview(characterId: string, assetId: string): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmCharacterPreview(projectId, characterId, { assetId });
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.mergeTasks(result.tasks);
        this.dialogueNotice = `已确认「${result.character.name}」的预览图，定稿图生成任务已准备好。`;
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认角色预览图失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async confirmCharacterReference(characterId: string, assetId: string): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmCharacterReference(projectId, characterId, { assetId });
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.dialogueNotice = `已确认「${result.character.name}」的角色定稿图。`;
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认角色定稿失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async clearCurrentChapterScript(): Promise<ChapterDetail | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : this.activeChapterId;
        if (!chapterId) {
          throw new Error("请先打开一个章节");
        }

        const result = await api.clearChapterScript(projectId, chapterId);
        this.applyChapterUpdate(result.chapter, result.chapters);
        this.dialogueNotice = `已清空「${result.chapter.title}」的剧本正文，其他章节未受影响。`;
        return result.chapter;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "清空当前章节失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async sendDialogueMessage(input: SendDialogueMessageRequest) {
      this.dialogueSending = true;
      this.dialogueError = null;
      this.dialogueNotice = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const stepKey = this.activeStepKey;
        await api.sendDialogueMessageStream(projectId, stepKey, {
          ...input,
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

      if (event.type === "dialogue.tool_result.created") {
        if (event.thread) {
          this.dialogueThread = event.thread;
        }
        if (event.toolResult) {
          this.upsertDialogueToolResult(event.toolResult);
          if (event.toolResult.scriptOutline && this.snapshot) {
            this.snapshot = {
              ...this.snapshot,
              scriptOutline: event.toolResult.scriptOutline,
            };
          }
          if (event.toolResult.characters && this.snapshot) {
            this.applyProjectCharactersUpdate(event.toolResult.characters);
          }
          if (event.toolResult.tool === "generate_storyboard" && event.toolResult.status === "needs_user_confirmation" && event.toolResult.storyboard) {
            this.applyPendingStoryboardUpdate(event.toolResult.storyboard);
          }
          const shouldPatchChapter = event.toolResult.status === "succeeded" && [
            "import_script_to_chapters",
            "generate_script_from_outline",
            "generate_script_from_seed",
            "generate_multiple_chapters",
            "update_chapter_draft",
            "confirm_story_structure",
            "confirm_storyboard",
          ].includes(event.toolResult.tool);
          if (shouldPatchChapter) {
            void this.applyToolResultChapterUpdate(event.toolResult);
          }
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
    upsertDialogueToolResult(nextResult: DialogueToolResult) {
      if (!this.dialogueThread) {
        return;
      }

      const toolResults = this.dialogueThread.toolResults ?? [];
      const exists = toolResults.some((result) => result.id === nextResult.id);
      this.dialogueThread = {
        ...this.dialogueThread,
        toolResults: exists
          ? toolResults.map((result) => (result.id === nextResult.id ? nextResult : result))
          : [...toolResults, nextResult],
      };
    },
    async applyToolResultChapterUpdate(toolResult: DialogueToolResult) {
      const projectId = this.activeProjectId;
      if (!projectId) {
        return;
      }

      const currentChapter = toolResult.currentChapter
        ?? (toolResult.currentChapterId ? (await api.getChapter(projectId, toolResult.currentChapterId)).chapter : null);
      if (!currentChapter) {
        return;
      }

      if (toolResult.storyStructure && toolResult.status === "succeeded") {
        this.applyStoryStructureUpdate(toolResult.storyStructure, currentChapter, toolResult.chapters);
        await this.refreshActiveProjectRuntime();
        return;
      }

      if (toolResult.storyboard && toolResult.status === "succeeded") {
        this.applyStoryboardUpdate(toolResult.storyboard, currentChapter, toolResult.chapters);
        return;
      }

      this.applyChapterUpdate(currentChapter, toolResult.chapters);
    },
    closeProject() {
      this.activeProjectId = null;
      this.activeChapterId = null;
      this.activeStepKey = "project_story";
      this.snapshot = null;
      this.dialogueThread = null;
      this.dialogueError = null;
      this.dialogueNotice = null;
    },
    async createMockStoryTask() {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const snapshot = this.snapshot;
        if (!snapshot) {
          throw new Error("项目快照还没有加载");
        }
        const chapterId = getCurrentChapterId(snapshot);
        await api.createTask({
          projectId,
          type: "story_parse",
          target: {
            type: "chapter",
            id: chapterId ?? projectId,
            chapterId: chapterId ?? undefined,
          },
          input: {
            chapterId,
            sourceText: getCurrentChapterSourceText(snapshot),
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
